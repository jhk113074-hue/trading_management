import React, { useState, useEffect, useRef } from 'react';
import { doc, setDoc, getDoc, serverTimestamp, collection, getDocs, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db, COMPANY_ID, storage } from '../firebase';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import type { ProformaInvoice, PIItem, PIRevision } from '../types/pi';
import type { Customer } from '../types/customer';
import type { Product } from '../types/product';
import { generatePIPdf } from '../utils/piPdfGenerator';
import { generatePIExcel } from '../utils/piExcelGenerator';
import { ProductModal } from './ProductModal';

interface Props {
  initialPI?: ProformaInvoice;
  onClose: () => void;
  currentUser: string;
}

export const PIFormModal: React.FC<Props> = ({ initialPI, onClose, currentUser }) => {
  const [savingType, setSavingType] = useState<'normal' | 'revision' | 'deleting' | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [showNewCust, setShowNewCust] = useState(false);
  const [newCustForm, setNewCustForm] = useState({ name: '', contactPerson: '', email: '', phone: '', countryName: '', shippingPort: '', preferredIncoterms: '', paymentTerms: '', addressEn: '' });
  const [isProdModalOpen, setIsProdModalOpen] = useState(false);
  const [editingProd, setEditingProd] = useState<Product | undefined>(undefined);

  const [tradeTermsDB, setTradeTermsDB] = useState<any>({
    incoterms: ["EXW", "FOB", "CIF", "CFR", "DAP", "DDP"],
    destinationPorts: [],
    departurePorts: ["Busan, Korea"],
    packagingSpecs: ["Export Standard Packaging."],
    validityDescriptions: ["4 weeks from the offered date"],
    paymentTerms: [
      "100% T/T in advance",
      "50% T/T in advance / 50% T/T against BL",
      "L/C at sight",
      "Usance L/C 30days",
      "Usance L/C 60days",
      "Usance L/C 90days"
    ],
    shippingMethods: ["Sea Freight", "Air Freight", "Truck"],
    deliveryTerms: ["8 weeks after receipt LC"],
    origins: ["KOREA", "CHINA", "KOREA/CHINA"]
  });

  useEffect(() => {
    const fetchTradeTerms = async () => {
      try {
        const docRef = doc(db, "companies", COMPANY_ID, "settings", "trade_terms");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setTradeTermsDB((prev: any) => ({ ...prev, ...docSnap.data() }));
        } else {
          // Initialize DB with defaults
          await setDoc(docRef, tradeTermsDB);
        }
      } catch (err) {
        console.error("Failed to load trade terms:", err);
      }
    };
    fetchTradeTerms();
  }, []);

  const [formData, setFormData] = useState<Partial<ProformaInvoice>>(() => {
    const defaults: Partial<ProformaInvoice> = {
      piNumber: '',
      piDate: new Date().toISOString().split('T')[0],
      validityDays: 30,
      validUntilDate: '',
      issuingCompany: 'YSACC',
      customerId: '', customerName: '', customerAddress: '', contactPerson: '', email: '',
      incoterms: '', destinationPort: '', departurePort: 'Busan, Korea',
      paymentTerms: '', shippingMethod: 'Sea Freight', exchangeRate: 1400.00,
      remarks: '① This is a basic price. Prices are subject to change based on your additional requests.\n② Shipping cost may vary monthly depending on the carrier\'s current conditions.',
      deliveryTerm: '', origin: '', yourRef: '',
      handlingFee: 0, freightCharges: [], freightTotal: 0, insurance: 0,
      subtotalUsd: 0, extrasUsd: 0, totalUsd: 0, totalKrw: 0,
      status: 'draft', currentVersion: 1, createdByName: currentUser,
      attachments: []
    };

    if (initialPI) {
      // Only pick known safe primitive fields from initialPI
      const pi = initialPI as any;
      const safeFields: (keyof ProformaInvoice)[] = [
        'piNumber', 'piDate', 'validityDays', 'validUntilDate', 'issuingCompany',
        'customerId', 'customerName', 'customerAddress', 'contactPerson', 'email',
        'incoterms', 'destinationPort', 'departurePort',
        'packagingSpec', 'validityDesc', 'paymentTerms', 'shippingMethod',
        'exchangeRate', 'remarks', 'deliveryTerm', 'origin', 'yourRef', 'handlingFee', 'freightTotal', 'insurance',
        'subtotalUsd', 'extrasUsd', 'totalUsd', 'totalKrw',
        'status', 'currentVersion', 'createdByName', 'createdBy', 'attachments'
      ];
      for (const key of safeFields) {
        const val = pi[key];
        if (val !== undefined && val !== null) {
          if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean' || Array.isArray(val)) {
            (defaults as any)[key] = val;
          }
        }
      }
      // Handle arrays separately
      const rawFreight = Array.isArray(pi.freightCharges) ? pi.freightCharges : [];
      defaults.freightCharges = rawFreight.map((f: any) => ({
        type: f.type || f.name || 'LCL',
        qty: typeof f.qty === 'number' ? f.qty : 1,
        price: typeof f.price === 'number' ? f.price : (f.amount || 0),
        remarks: f.remarks || '',
        name: f.type || f.name || 'LCL',
        amount: typeof f.amount === 'number' ? f.amount : ((f.qty || 1) * (f.price || 0))
      }));
      defaults.itemsSummary = Array.isArray(pi.itemsSummary) ? pi.itemsSummary : [];
    }

    return defaults;
  });

  const [items, setItems] = useState<PIItem[]>([]);
  const [revisionReason, setRevisionReason] = useState('');
  const [revisions, setRevisions] = useState<any[]>([]);
  const [selectedRevId, setSelectedRevId] = useState<string>('');
  const [dropdownRevId, setDropdownRevId] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null);
  const [activePreviewName, setActivePreviewName] = useState<string>('');

  const handleFileUpload = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    
    const piId = initialPI?.id || formData.piNumber || `temp_${Date.now()}`;
    const newAttachments = [...(formData.attachments || [])];
    
    let uploadedCount = 0;
    let hasError = false;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const uniqueFileName = `${Date.now()}_${file.name}`;
      // Firebase Storage Rules 수정을 피하기 위해 기존에 허용된 'tasks/' 경로를 재사용합니다.
      // 2레벨 경로 구조(tasks/taskId/fileName)를 엄격히 지켜야 규칙 검사를 통과할 수 있습니다.
      const storageRef = ref(storage, `tasks/${piId}/${uniqueFileName}`);
      
      const uploadTask = uploadBytesResumable(storageRef, file);
      
      await new Promise<void>((resolve) => {
        uploadTask.on('state_changed', 
          () => {
            // progress could be tracked here if we added a progress state
          }, 
          (error: any) => {
            console.error("Upload failed for", file.name, error);
            hasError = true;
            resolve();
          }, 
          async () => {
            try {
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              newAttachments.push({
                name: file.name,
                url,
                size: file.size,
                path: uploadTask.snapshot.ref.fullPath
              });
            } catch(e) {
              console.error("Download URL error", e);
              hasError = true;
            }
            uploadedCount++;
            resolve();
          }
        );
      });
    }
    
    setFormData(prev => ({ ...prev, attachments: newAttachments }));
    setIsUploading(false);
    
    if (hasError) {
      alert("일부 파일 업로드에 실패했습니다. Firebase Storage 권한(Rules) 설정이나 네트워크 상태를 확인해 주세요.");
    }
  };

  const handleDeleteAttachment = async (index: number) => {
    const att = formData.attachments?.[index];
    if (!att) return;
    
    if (!window.confirm(`'${att.name}' 파일을 삭제하시겠습니까?`)) return;
    
    try {
      if (att.path) {
        const storageRef = ref(storage, att.path);
        await deleteObject(storageRef).catch(console.warn);
      }
      const newAttachments = [...(formData.attachments || [])];
      newAttachments.splice(index, 1);
      setFormData(prev => ({ ...prev, attachments: newAttachments }));
    } catch (err) {
      console.error("Delete error:", err);
      alert("파일 삭제 중 오류가 발생했습니다.");
    }
  };


  const isLoadedRef = useRef(false);

  useEffect(() => {
    // Load Customers
    const loadData = async () => {
      try {
        const custSnap = await getDocs(collection(doc(db, "companies", COMPANY_ID), "customers"));
        const loadedCusts = custSnap.docs.map(d => ({ id: d.id, ...d.data() } as Customer));
        setCustomers(loadedCusts);

        // Self-healing customer details if customerName is empty but customerId exists
        setFormData(prev => {
          if (prev.customerId) {
            const cust = loadedCusts.find(c => c.id === prev.customerId);
            if (cust) {
              return {
                ...prev,
                customerName: prev.customerName || cust.name,
                customerAddress: prev.customerAddress || cust.addressEn || '',
                contactPerson: prev.contactPerson || cust.contactPerson || cust.representative || '',
                email: prev.email || cust.email || cust.contactEmail || ''
              };
            }
          }
          return prev;
        });
      } catch (err) {
        console.error("Error loading data:", err);
      }
    };
    loadData();

    // Subscribe to products in real-time
    const unsubProducts = onSnapshot(collection(doc(db, "companies", COMPANY_ID), "products"), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    });

    if (initialPI) {
      // If we have already loaded the data for this modal session, do not re-load on subsequent prop updates
      if (isLoadedRef.current) {
        return () => {
          unsubProducts();
        };
      }

      // Load Revisions & Line Items for initialPI
      const fetchRevisionsAndItems = async () => {
        try {
          const revSnap = await getDocs(collection(doc(db, "companies", COMPANY_ID, "proforma_invoices", initialPI.id), "revisions"));
          if (!revSnap.empty) {
            const revList = revSnap.docs.map(d => {
              const data = d.data() as any;
              return {
                id: d.id,
                ...data,
                createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date()
              };
            }).sort((a: any, b: any) => (b.version || 0) - (a.version || 0));
            setRevisions(revList);

            // Default to latest revision (already sorted by version descending in revList)
            const latestRevData = revList[0];
            const latestRevDoc = revSnap.docs.find(d => d.id === latestRevData.id);
            
            if (latestRevDoc) {
              setSelectedRevId(latestRevDoc.id);
              setDropdownRevId(latestRevDoc.id);

              // Load line items for this latest revision
              const liSnap = await getDocs(collection(latestRevDoc.ref, "line_items"));
              let loadedItems = liSnap.docs.map(d => d.data() as PIItem).sort((a,b) => a.lineNumber - b.lineNumber);
              
              // Fallback to items array if subcollection is empty
              if (loadedItems.length === 0 && Array.isArray(latestRevData.items)) {
                loadedItems = (latestRevData.items as any[]).sort((a,b) => a.lineNumber - b.lineNumber);
              }
              setItems(loadedItems);

              // Load special custom values from the latest revision
              setFormData(prev => ({
                ...prev,
                exchangeRate: latestRevData.exchangeRate !== undefined ? latestRevData.exchangeRate : prev.exchangeRate,
                remarks: latestRevData.remarks !== undefined ? latestRevData.remarks : prev.remarks,
                customerAddress: latestRevData.customerAddress !== undefined ? latestRevData.customerAddress : prev.customerAddress,
                incoterms: latestRevData.incoterms !== undefined ? latestRevData.incoterms : prev.incoterms,
                destinationPort: latestRevData.destinationPort !== undefined ? latestRevData.destinationPort : prev.destinationPort,
                paymentTerms: latestRevData.paymentTerms !== undefined ? latestRevData.paymentTerms : prev.paymentTerms,
                shippingMethod: latestRevData.shippingMethod !== undefined ? latestRevData.shippingMethod : prev.shippingMethod,
                packagingSpec: latestRevData.packagingSpec !== undefined ? latestRevData.packagingSpec : prev.packagingSpec,
                deliveryTerm: latestRevData.deliveryTerm !== undefined ? latestRevData.deliveryTerm : prev.deliveryTerm,
                origin: latestRevData.origin !== undefined ? latestRevData.origin : prev.origin,
                yourRef: latestRevData.yourRef !== undefined ? latestRevData.yourRef : prev.yourRef,
                attachments: latestRevData.attachments !== undefined ? latestRevData.attachments : (prev.attachments || [])
              }));
            }
          }
          isLoadedRef.current = true;
        } catch (err: any) {
          console.error("Error loading PI revisions & items:", err);
        }
      };
      fetchRevisionsAndItems();
    } else {
      if (!isLoadedRef.current) {
        // Generate temp PI number
        const yy = new Date().getFullYear();
        setFormData(prev => ({ ...prev, piNumber: `PI-YSACC-${yy}-TBD` }));
        isLoadedRef.current = true;
      }
    }

    return () => {
      unsubProducts();
    };
  }, [initialPI, currentUser]);

  // Auto-format productCode in items when products list is loaded
  useEffect(() => {
    if (products.length > 0 && items.length > 0) {
      let changed = false;
      const formattedItems = items.map(item => {
        const rawCode = getRawProductCode(item.productCode);
        const p = products.find(prod => prod.productCode === rawCode);
        if (p) {
          const formatted = `[${p.productCode}] ${p.nameKo || p.nameEn}`;
          const latestDesc = p.nameKo || p.nameEn || '';
          if (item.productCode !== formatted || item.description !== latestDesc) {
            changed = true;
            return { ...item, productCode: formatted, description: latestDesc };
          }
        }
        return item;
      });
      if (changed) {
        setItems(formattedItems);
      }
    }
  }, [products, items]);

  // Calculate Valid Until Date
  useEffect(() => {
    if (formData.piDate && formData.validityDays !== undefined) {
      const d = new Date(formData.piDate);
      d.setDate(d.getDate() + formData.validityDays);
      setFormData(prev => ({ ...prev, validUntilDate: d.toISOString().split('T')[0] }));
    }
  }, [formData.piDate, formData.validityDays]);

  // Recalculate Totals when items or extras change
  useEffect(() => {
    let subUsd = 0;
    items.forEach(it => { subUsd += (it.lineTotalUsd || 0); });
    
    let fTotal = 0;
    formData.freightCharges?.forEach(f => {
      const amt = typeof f.amount === 'number' ? f.amount : ((f.qty || 1) * (f.price || 0));
      fTotal += amt;
    });

    const extUsd = (formData.handlingFee || 0) + fTotal + (formData.insurance || 0);
    const totUsd = subUsd + extUsd;
    const totKrw = totUsd * (formData.exchangeRate || 0);

    setFormData(prev => ({
      ...prev,
      freightTotal: fTotal,
      subtotalUsd: subUsd,
      extrasUsd: extUsd,
      totalUsd: totUsd,
      totalKrw: totKrw
    }));
  }, [items, formData.handlingFee, formData.freightCharges, formData.insurance, formData.exchangeRate]);

  // Auto-suggest PI Number when creating a new PI and customer/issuer changes
  useEffect(() => {
    if (initialPI) return;
    if (!formData.customerId || !formData.issuingCompany) return;

    const suggestPiNumber = async () => {
      try {
        const yy = formData.piDate ? formData.piDate.substring(0, 4) : new Date().getFullYear().toString();
        const prefix = formData.issuingCompany === 'YS' ? 'YS' : 'YSACC';
        const cust = customers.find(c => c.id === formData.customerId);
        // Using nameKo as Abbreviation, fallback to first 3 letters of name if empty
        let abbr = cust?.nameKo ? cust.nameKo.trim().replace(/\s+/g, '') : '';
        if (!abbr && cust?.name) {
          abbr = cust.name.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '');
        }
        if (!abbr) abbr = 'TBD';

        const basePrefix = `PI-${prefix}-${yy}-${abbr}-`;

        // If the current piNumber already starts with the correct basePrefix, do not overwrite (preserves manual sequence edits)
        if (formData.piNumber?.startsWith(basePrefix)) {
          return;
        }

        // Find latest number for this specific prefix
        const snap = await getDocs(collection(doc(db, "companies", COMPANY_ID), "proforma_invoices"));
        const existingNums = snap.docs
          .map(d => d.data().piNumber)
          .filter(n => n && n.startsWith(basePrefix))
          .map(n => parseInt(n.replace(basePrefix, ''), 10))
          .filter(n => !isNaN(n));

        const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
        setFormData(prev => ({ ...prev, piNumber: `${basePrefix}${nextNum.toString().padStart(2, '0')}` }));
      } catch (err) {
        console.error("Error auto-suggesting PI number:", err);
      }
    };
    suggestPiNumber();
  }, [initialPI, formData.customerId, formData.issuingCompany, formData.piDate, customers]);

  const handleCustomerChange = (custId: string) => {
    if (custId === '__NEW__') {
      setShowNewCust(true);
      return;
    }
    setShowNewCust(false);
    const cust = customers.find(c => c.id === custId);
    if (cust) {
      setFormData(prev => ({
        ...prev,
        customerId: cust.id,
        customerName: cust.name,
        customerAddress: cust.addressEn || '',
        contactPerson: cust.contactPerson || cust.representative || '',
        email: cust.email || cust.contactEmail || '',
        destinationPort: cust.shippingPort || prev.destinationPort,
        incoterms: cust.preferredIncoterms || prev.incoterms,
        paymentTerms: cust.paymentTerms || prev.paymentTerms
      }));
    }
  };

  const saveNewCustomer = async () => {
    if (!newCustForm.name.trim()) { alert('고객명을 입력해주세요.'); return; }
    try {
      // 코드 자동 생성: CUST-YYYYMMDD-XXX
      const dateStr = new Date().toISOString().slice(0,10).replace(/-/g,'');
      const existingCodesWithDate = customers
        .map(c => c.customerCode || '')
        .filter(code => code.startsWith(`CUST-${dateStr}`));
      const nextNum = existingCodesWithDate.length + 1;
      const newCode = `CUST-${dateStr}-${String(nextNum).padStart(3,'0')}`;

      const newCustData: any = {
        customerCode: newCode,
        name: newCustForm.name.trim(),
        contactPerson: newCustForm.contactPerson.trim(),
        email: newCustForm.email.trim(),
        phone: newCustForm.phone.trim(),
        countryName: newCustForm.countryName.trim(),
        shippingPort: newCustForm.shippingPort.trim(),
        preferredIncoterms: newCustForm.preferredIncoterms.trim(),
        paymentTerms: newCustForm.paymentTerms.trim(),
        addressEn: newCustForm.addressEn.trim(),
        tradeStatus: 'Active',
        tradeGrade: 'A',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'companies', COMPANY_ID, 'customers', newCode), newCustData);

      // 로컬 상태 추가 후 자동 선택
      const addedCust: Customer = { id: newCode, ...newCustData } as Customer;
      setCustomers(prev => [...prev, addedCust]);
      setFormData(prev => ({
        ...prev,
        customerId: newCode,
        customerName: newCustForm.name.trim(),
        customerAddress: newCustForm.addressEn.trim(),
        contactPerson: newCustForm.contactPerson.trim(),
        email: newCustForm.email.trim(),
        destinationPort: newCustForm.shippingPort.trim() || prev.destinationPort,
        incoterms: newCustForm.preferredIncoterms.trim() || prev.incoterms,
        paymentTerms: newCustForm.paymentTerms.trim() || prev.paymentTerms,
      }));
      setShowNewCust(false);
      setNewCustForm({ name: '', contactPerson: '', email: '', phone: '', countryName: '', shippingPort: '', preferredIncoterms: '', paymentTerms: '', addressEn: '' });
      alert(`✅ 신규 고객 [${newCustForm.name}] 등록 완료! (ID: ${newCode})`);
    } catch (e: any) {
      alert('❌ 저장 실패: ' + e.message);
    }
  };

  const addItem = () => {
    setItems(prev => [...prev, {
      lineNumber: prev.length + 1,
      productCode: '', description: '', quantity: 0, unit: 'KG',
      purchasePriceKrw: 0, exchangeRate: formData.exchangeRate || 1400,
      purchasePriceUsd: 0, marginRate: 15, salePriceUsd: 0, lineTotalUsd: 0,
      palletQty: 1, remarks: '', roundDigits: 2
    }]);
  };

  const updateItem = (index: number, field: keyof PIItem, value: any) => {
    const newItems = [...items];
    const it = { ...newItems[index], [field]: value };

    // Zero out other purchase price when one is entered
    if (field === 'purchasePriceKrw' && parseFloat(value) > 0) {
      it.purchasePriceUsd = 0;
    } else if (field === 'purchasePriceUsd' && parseFloat(value) > 0) {
      it.purchasePriceKrw = 0;
    }

    // Auto calculate from palletQty
    if (field === 'palletQty') {
      const p = products.find(prod => prod.productCode === getRawProductCode(it.productCode));
      let qpp = 0;
      if (it.packingSpecOverride) {
        qpp = it.packingSpecOverride.qtyPerPallet;
      } else if (p) {
        qpp = p.qtyPerPallet || p.weight || 0;
      }
      const numVal = parseFloat(value) || 0;
      if (qpp > 0) {
        it.quantity = numVal * qpp;
      } else {
        it.quantity = numVal;
      }
    }

    // Auto calculate
    if (field === 'productCode') {
      const parsedCode = getRawProductCode(value);
      const p = products.find(prod => prod.productCode === parsedCode);
      if (p) {
        it.productCode = `[${p.productCode}] ${p.nameKo || p.nameEn}`;
        it.productName = p.nameKo || p.nameEn || '';
        it.spec = p.spec || p.description || '';
        it.description = p.spec || p.description || p.nameEn || p.nameKo || '';
        it.unit = (p.unit || 'KG').toUpperCase();
        // Assuming purchase price is in KRW or USD
        if (p.currency === 'KRW') {
          it.purchasePriceKrw = p.purchasePrice || 0;
          it.purchasePriceUsd = 0; // Independent: do not pre-fill USD if currency is KRW
        } else {
          it.purchasePriceUsd = p.purchasePrice || 0;
          it.purchasePriceKrw = 0; // Independent: do not pre-fill KRW if currency is USD
        }
        
        // Auto select default packing method if exists
        const existingMethod = p.packingMethods?.find((m: any) => m.id === it.selectedPackingMethodId);
        const defaultMethod = p.packingMethods?.find((m: any) => m.isDefault) || p.packingMethods?.[0];
        
        if (existingMethod) {
          // Keep existing loaded packing method and its overrides
          it.selectedPackingMethodId = existingMethod.id;
          if (existingMethod.unit) {
            it.unit = existingMethod.unit;
          }
          const isPallet = existingMethod.packageType?.includes('Pallet') || existingMethod.packageType?.endsWith('+ Pallet');
          if (!it.packingSpecOverride) {
            it.packingSpecOverride = {
              packageType: existingMethod.packageType,
              qtyPerPallet: existingMethod.qtyPerPallet || 0,
              specWidth: isPallet ? (existingMethod.palletWidth || existingMethod.unitWidth || 0) : (existingMethod.unitWidth || 0),
              specLength: isPallet ? (existingMethod.palletLength || existingMethod.unitLength || 0) : (existingMethod.unitLength || 0),
              specHeight: isPallet ? (existingMethod.palletHeight || existingMethod.unitHeight || 0) : (existingMethod.unitHeight || 0),
              weight: isPallet ? (existingMethod.palletWeight || existingMethod.unitWeight || 0) : (existingMethod.unitWeight || 0),
              grossWeight: isPallet ? (existingMethod.palletGrossWeight || existingMethod.unitGrossWeight || 0) : (existingMethod.unitGrossWeight || existingMethod.unitWeight || 0),
            };
          }
          if (existingMethod.qtyPerPallet && existingMethod.qtyPerPallet > 0) {
            it.quantity = (it.palletQty || 1) * existingMethod.qtyPerPallet;
          } else {
            it.quantity = it.quantity || 0;
          }
        } else if (defaultMethod) {
          // If no existing method was loaded, fallback to defaultMethod
          it.selectedPackingMethodId = defaultMethod.id;
          if (defaultMethod.unit) {
            it.unit = defaultMethod.unit;
          }
          const isPallet = defaultMethod.packageType?.includes('Pallet') || defaultMethod.packageType?.endsWith('+ Pallet');
          it.packingSpecOverride = {
            packageType: defaultMethod.packageType,
            qtyPerPallet: defaultMethod.qtyPerPallet || 0,
            specWidth: isPallet ? (defaultMethod.palletWidth || defaultMethod.unitWidth || 0) : (defaultMethod.unitWidth || 0),
            specLength: isPallet ? (defaultMethod.palletLength || defaultMethod.unitLength || 0) : (defaultMethod.unitLength || 0),
            specHeight: isPallet ? (defaultMethod.palletHeight || defaultMethod.unitHeight || 0) : (defaultMethod.unitHeight || 0),
            weight: isPallet ? (defaultMethod.palletWeight || defaultMethod.unitWeight || 0) : (defaultMethod.unitWeight || 0),
            grossWeight: isPallet ? (defaultMethod.palletGrossWeight || defaultMethod.unitGrossWeight || 0) : (defaultMethod.unitGrossWeight || defaultMethod.unitWeight || 0),
          };
          if (defaultMethod.qtyPerPallet && defaultMethod.qtyPerPallet > 0) {
            it.quantity = (it.palletQty || 1) * defaultMethod.qtyPerPallet;
          } else {
            it.quantity = it.quantity || 0;
          }
        } else {
          it.selectedPackingMethodId = undefined;
          it.packingSpecOverride = undefined;
          // Auto calculate quantity from palletQty
          if (p.qtyPerPallet && p.qtyPerPallet > 0) {
            it.quantity = (it.palletQty || 1) * p.qtyPerPallet;
          } else if (p.weight && p.weight > 0) {
            it.quantity = (it.palletQty || 1) * p.weight;
          } else {
            it.quantity = it.quantity || 0;
          }
        }
      }
    }

    if (field === 'selectedPackingMethodId') {
      const p = products.find(prod => prod.productCode === getRawProductCode(it.productCode));
      if (p && p.packingMethods) {
        const method = p.packingMethods.find((m: any) => m.id === value);
        if (method) {
          if (method.unit) {
            it.unit = method.unit;
          }
          const isPallet = method.packageType?.includes('Pallet') || method.packageType?.endsWith('+ Pallet');
          it.packingSpecOverride = {
            packageType: method.packageType,
            qtyPerPallet: method.qtyPerPallet || 0,
            specWidth: isPallet ? (method.palletWidth || method.unitWidth || 0) : (method.unitWidth || 0),
            specLength: isPallet ? (method.palletLength || method.unitLength || 0) : (method.unitLength || 0),
            specHeight: isPallet ? (method.palletHeight || method.unitHeight || 0) : (method.unitHeight || 0),
            weight: isPallet ? (method.palletWeight || method.unitWeight || 0) : (method.unitWeight || 0),
            grossWeight: isPallet ? (method.palletGrossWeight || method.unitGrossWeight || 0) : (method.unitGrossWeight || method.unitWeight || 0),
          };
          
          if (method.qtyPerPallet && method.qtyPerPallet > 0) {
            it.quantity = (it.palletQty || 1) * method.qtyPerPallet;
          } else {
            it.quantity = it.quantity || 0;
          }
        } else {
          it.selectedPackingMethodId = undefined;
          it.packingSpecOverride = undefined;
        }
      }
    }

    if (field === 'productCode' || field === 'marginRate' || field === 'purchasePriceKrw' || field === 'purchasePriceUsd' || field === 'exchangeRate' || field === 'roundDigits') {
      let rawSalePrice = 0;
      if (it.purchasePriceKrw > 0) {
        rawSalePrice = (it.purchasePriceKrw || 0) / (it.exchangeRate || 1) / (1 - (it.marginRate || 0) / 100);
      } else {
        rawSalePrice = (it.purchasePriceUsd || 0) / (1 - (it.marginRate || 0) / 100);
      }

      if (typeof it.roundDigits === 'number') {
        it.salePriceUsd = ceilValue(rawSalePrice, it.roundDigits);
      } else {
        it.salePriceUsd = rawSalePrice;
      }
    }

    if (field === 'productCode' || field === 'salePriceUsd' || field === 'quantity' || field === 'marginRate' || field === 'purchasePriceKrw' || field === 'purchasePriceUsd' || field === 'exchangeRate' || field === 'roundDigits' || field === 'palletQty') {
      it.lineTotalUsd = (it.salePriceUsd || 0) * (it.quantity || 0);
      
      // Auto calculate palletQty when quantity changes
      if (field === 'quantity') {
        const p = products.find(prod => prod.productCode === getRawProductCode(it.productCode));
        if (it.packingSpecOverride) {
          const qpp = it.packingSpecOverride.qtyPerPallet;
          if (qpp && qpp > 0) {
            it.palletQty = parseFloat((value / qpp).toFixed(2));
          } else {
            it.palletQty = value;
          }
        } else if (p) {
          if (p.qtyPerPallet && p.qtyPerPallet > 0) {
            it.palletQty = parseFloat((value / p.qtyPerPallet).toFixed(2));
          } else if (p.weight && p.weight > 0) {
            it.palletQty = parseFloat((value / p.weight).toFixed(2));
          } else {
            it.palletQty = value;
          }
        } else {
          it.palletQty = value;
        }
      }
    }

    newItems[index] = it;
    setItems(newItems);
  };


  // 상품 마스터의 패킹 데이터가 변경된 경우 PI 라인 아이템을 최신 데이터로 재동기화
  const refreshPackingData = () => {
    let updatedCount = 0;
    const newItems = items.map(it => {
      if (!it.productCode) return it;
      const parsedCode = getRawProductCode(it.productCode);
      const p = products.find(prod => prod.productCode === parsedCode);
      if (!p || !p.packingMethods || p.packingMethods.length === 0) return it;
      const method = it.selectedPackingMethodId
        ? p.packingMethods.find((m: any) => m.id === it.selectedPackingMethodId)
        : (p.packingMethods.find((m: any) => m.isDefault) || p.packingMethods[0]);
      if (!method) return it;
      const isPallet = method.packageType?.includes('Pallet') || method.packageType?.endsWith('+ Pallet');
      const newOverride = {
        packageType: method.packageType,
        qtyPerPallet: method.qtyPerPallet || 0,
        specWidth: isPallet ? (method.palletWidth || method.unitWidth || 0) : (method.unitWidth || 0),
        specLength: isPallet ? (method.palletLength || method.unitLength || 0) : (method.unitLength || 0),
        specHeight: isPallet ? (method.palletHeight || method.unitHeight || 0) : (method.unitHeight || 0),
        weight: isPallet ? (method.palletWeight || method.unitWeight || 0) : (method.unitWeight || 0),
        grossWeight: isPallet ? (method.palletGrossWeight || method.unitGrossWeight || 0) : (method.unitGrossWeight || method.unitWeight || 0),
      };
      const updated = { ...it, packingSpecOverride: newOverride, selectedPackingMethodId: method.id };
      if (p.spec || p.description) {
        updated.spec = p.spec || p.description || '';
      }
      if (method.unit) {
        updated.unit = method.unit;
      }
      if (newOverride.qtyPerPallet > 0 && it.palletQty && it.palletQty > 0) {
        updated.quantity = it.palletQty * newOverride.qtyPerPallet;
        updated.lineTotalUsd = (updated.salePriceUsd || 0) * updated.quantity;
        updatedCount++;
      }
      return updated;
    });
    setItems(newItems);
    alert(`✅ ${updatedCount}개 라인의 패킹/수량 데이터가 상품 마스터 기준으로 업데이트되었습니다.`);
  };  const removeItem = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    // Re-assign line numbers
    newItems.forEach((it, i) => it.lineNumber = i + 1);
    setItems(newItems);
  };

  const addFreightCharge = () => {
    setFormData(prev => ({
      ...prev,
      freightCharges: [...(prev.freightCharges || []), { type: 'LCL', qty: 1, price: 0, remarks: '', name: 'LCL', amount: 0 }]
    }));
  };

  const updateFreightCharge = (index: number, field: 'type' | 'qty' | 'price' | 'remarks', value: any) => {
    setFormData(prev => {
      const list = [...(prev.freightCharges || [])];
      const item = { ...list[index], [field]: value };
      
      // Update compatibility fields
      item.name = item.type;
      item.amount = (item.qty || 0) * (item.price || 0);

      list[index] = item;
      return { ...prev, freightCharges: list };
    });
  };

  const removeFreightCharge = (index: number) => {
    setFormData(prev => {
      const list = [...(prev.freightCharges || [])];
      list.splice(index, 1);
      return { ...prev, freightCharges: list };
    });
  };

  const handleAddNewTradeTerm = async (field: string, newValue: string) => {
    setFormData(prev => ({ ...prev, [field]: newValue }));
    
    try {
      const fieldMapping: any = {
        incoterms: 'incoterms',
        destinationPort: 'destinationPorts',
        departurePort: 'departurePorts',
        packagingSpec: 'packagingSpecs',
        validityDesc: 'validityDescriptions',
        paymentTerms: 'paymentTerms',
        shippingMethod: 'shippingMethods',
        deliveryTerm: 'deliveryTerms',
        origin: 'origins'
      };
      const dbField = fieldMapping[field];
      
      const docRef = doc(db, "companies", COMPANY_ID, "settings", "trade_terms");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        const arr = data[dbField] || [];
        if (!arr.includes(newValue)) {
          const newArr = [...arr, newValue];
          await setDoc(docRef, { [dbField]: newArr }, { merge: true });
          setTradeTermsDB((prev: any) => ({ ...prev, [dbField]: newArr }));
        }
      }
    } catch (e) {
      console.error("Failed to add new trade term", e);
    }
  };

  const ComboSelect = ({ label, field, options, placeholder = '', required = false }: any) => {
    const value = (formData as any)[field] || '';
    const [isNewMode, setIsNewMode] = useState(false);
    const [newVal, setNewVal] = useState('');

    if (isNewMode) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>{label} {required && '★'}</label>
          <div style={{ display: 'flex', gap: '4px' }}>
            <input 
              type="text" 
              value={newVal} 
              onChange={e => setNewVal(e.target.value)} 
              placeholder="직접 입력..." 
              style={{ flex: 1, padding: '8px 10px', border: '1px solid #3b82f6', borderRadius: '6px', fontSize: '13px' }}
              autoFocus
            />
            <button 
              type="button"
              onClick={() => {
                if (newVal.trim()) handleAddNewTradeTerm(field, newVal.trim());
                setIsNewMode(false);
              }}
              style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '0 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              ✓
            </button>
            <button 
              type="button"
              onClick={() => setIsNewMode(false)}
              style={{ background: '#e2e8f0', color: '#475569', border: 'none', padding: '0 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              ✕
            </button>
          </div>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>{label} {required && '★'}</label>
        <select 
          value={value} 
          onChange={e => {
            if (e.target.value === '__NEW__') setIsNewMode(true);
            else setFormData(prev => ({...prev, [field]: e.target.value}));
          }}
          style={{ padding: '9px 11px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
        >
          <option value="">{placeholder || '-- 선택 --'}</option>
          {options.map((opt: string) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
          {value && !options.includes(value) && (
            <option value={value}>{value}</option>
          )}
          <option value="__NEW__" style={{ color: '#2563eb', fontWeight: 'bold' }}>➕ 신규 등록 (직접 입력)</option>
        </select>
      </div>
    );
  };

  const handleSave = async (isRevision: boolean = false) => {
    // ── Guard: prevent double execution ──
    if (savingType !== null) return;

    if (!formData.customerId) { alert('고객을 선택해주세요.'); return; }
    if (items.length === 0) { alert('최소 1개 이상의 상품 라인을 추가해주세요.'); return; }
    
    // Revision 저장 시에만 변경 사유 체크
    if (initialPI && isRevision && !revisionReason) {
      alert('Revision 저장 시에는 변경 사유(Revision Reason)를 필수 입력해야 합니다.');
      return;
    }

    setSavingType(isRevision ? 'revision' : 'normal');
    try {
      let piId = initialPI?.id;
      let piNum = formData.piNumber;

      // New PI Number generation logic if not editing, fallback if empty
      if (!initialPI && !piNum) {
        const yy = new Date().getFullYear();
        const prefix = formData.issuingCompany === 'YS' ? 'YS' : 'YSACC';
        
        // Find latest number
        const snap = await getDocs(collection(doc(db, "companies", COMPANY_ID), "proforma_invoices"));
        const existingNums = snap.docs
          .map(d => d.data().piNumber)
          .filter(n => n && n.includes(`PI-${prefix}-${yy}`))
          .map(n => parseInt(n.split('-').pop() || '0'))
          .filter(n => !isNaN(n));
        
        const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
        piNum = `PI-${prefix}-${yy}-${nextNum.toString().padStart(4, '0')}`;
        piId = piNum;
      }
      
      if (!piId && piNum) {
          piId = piNum;
      }

      if (!piId) throw new Error("Invalid PI ID");

      const itemsSummary = items.slice(0, 3).map(i => `${i.description} (${i.quantity}${i.unit})`);
      if (items.length > 3) itemsSummary.push('...');

      // ═══════════════════════════════════════════════════════
      // Determine the revision document reference & version
      // ═══════════════════════════════════════════════════════
      let revRef;
      let existingCreatedAt = null;
      let version: number;

      if (!initialPI) {
        // ── BRAND-NEW PI ──
        version = 1;
        revRef = doc(collection(doc(db, "companies", COMPANY_ID, "proforma_invoices", piId), "revisions"));

      } else if (isRevision) {
        // ── REVISION SAVE (explicit new revision) ──
        // Read the actual current max version from Firestore (not the stale initialPI prop)
        const revSnap = await getDocs(collection(doc(db, "companies", COMPANY_ID, "proforma_invoices", piId), "revisions"));
        let maxVersion = 0;
        revSnap.docs.forEach(d => {
          const v = Number(d.data().version) || 0;
          if (v > maxVersion) maxVersion = v;
        });
        version = maxVersion + 1;
        revRef = doc(collection(doc(db, "companies", COMPANY_ID, "proforma_invoices", piId), "revisions"));

      } else {
        // ── NORMAL SAVE on existing PI ──
        // Use selectedRevId to directly target the correct revision document.
        // This avoids version-mismatch issues from the stale initialPI prop.
        const revisionsColRef = collection(doc(db, "companies", COMPANY_ID, "proforma_invoices", piId), "revisions");

        if (selectedRevId) {
          // We have a specific revision selected – reuse it directly
          revRef = doc(db, "companies", COMPANY_ID, "proforma_invoices", piId, "revisions", selectedRevId);
          const revDoc = await getDoc(revRef);
          if (revDoc.exists()) {
            existingCreatedAt = revDoc.data().createdAt;
            version = Number(revDoc.data().version) || 1;
          } else {
            // Selected revision doesn't exist anymore; fallback to latest
            const revSnap = await getDocs(revisionsColRef);
            if (!revSnap.empty) {
              const latest = revSnap.docs.sort((a, b) => (b.data().createdAt?.seconds || 0) - (a.data().createdAt?.seconds || 0))[0];
              revRef = latest.ref;
              existingCreatedAt = latest.data().createdAt;
              version = Number(latest.data().version) || 1;
            } else {
              version = 1;
              revRef = doc(revisionsColRef);
            }
          }
        } else {
          // No revision selected – find the latest one
          const revSnap = await getDocs(revisionsColRef);
          if (!revSnap.empty) {
            const latest = revSnap.docs.sort((a, b) => (b.data().createdAt?.seconds || 0) - (a.data().createdAt?.seconds || 0))[0];
            revRef = latest.ref;
            existingCreatedAt = latest.data().createdAt;
            version = Number(latest.data().version) || 1;
          } else {
            version = 1;
            revRef = doc(revisionsColRef);
          }
        }

        // Delete old line_items from the target revision so we can re-save the current set
        const liSnap = await getDocs(collection(revRef, "line_items"));
        for (const d of liSnap.docs) {
          await deleteDoc(d.ref);
        }
      }

      // ═══════════════════════════════════════════════════════
      // Save main PI document (after version is finalised)
      // ═══════════════════════════════════════════════════════
      const piData: Partial<ProformaInvoice> = {
        ...formData,
        piNumber: piNum,
        currentVersion: version,
        itemsSummary,
        updatedAt: serverTimestamp()
      };

      if (!initialPI) {
        piData.createdAt = serverTimestamp();
        piData.createdBy = currentUser;
      }

      await setDoc(doc(db, "companies", COMPANY_ID, "proforma_invoices", piId), sanitizeForFirestore(piData), { merge: true });

      // ═══════════════════════════════════════════════════════
      // Save revision document
      // ═══════════════════════════════════════════════════════
      const revData: PIRevision = {
        version,
        revisionReason: isRevision ? revisionReason : (initialPI ? 'Edited active version' : 'Initial creation'),
        items,
        exchangeRate: formData.exchangeRate,
        remarks: formData.remarks,
        customerAddress: formData.customerAddress,
        incoterms: formData.incoterms,
        destinationPort: formData.destinationPort,
        paymentTerms: formData.paymentTerms,
        shippingMethod: formData.shippingMethod,
        packagingSpec: formData.packagingSpec,
        deliveryTerm: formData.deliveryTerm,
        origin: formData.origin,
        yourRef: formData.yourRef,
        attachments: formData.attachments || [],
        createdAt: existingCreatedAt || serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      await setDoc(revRef, sanitizeForFirestore(revData));

      // Save line items in subcollection
      for (const item of items) {
        const itemRef = doc(collection(revRef, "line_items"));
        let rawCode = item.productCode;
        if (rawCode.startsWith('[') && rawCode.includes(']')) {
          rawCode = rawCode.substring(1, rawCode.indexOf(']')).trim();
        }
        await setDoc(itemRef, sanitizeForFirestore({ ...item, productCode: rawCode, id: itemRef.id }));

        // Update product master with the latest purchase price and date
        const prod = products.find(p => p.productCode === rawCode);
        if (prod) {
          const finalPrice = item.purchasePriceKrw > 0 ? item.purchasePriceKrw : item.purchasePriceUsd;
          const finalCurrency = item.purchasePriceKrw > 0 ? 'KRW' : 'USD';
          
          if (finalPrice > 0) {
            const isPriceChanged = prod.purchasePrice !== finalPrice || prod.currency !== finalCurrency;
            
            if (isPriceChanged) {
              const prodRef = doc(db, "companies", COMPANY_ID, "products", prod.id);
              
              const newHistoryItem = {
                validFrom: formData.piDate || new Date().toISOString().split('T')[0],
                validTo: '',
                currency: finalCurrency,
                price: finalPrice,
                minQty: item.quantity || 1,
                discountRate: 0,
                remarks: `Updated from PI ${piNum}`
              };
              
              const currentHistory = Array.isArray(prod.purchasePrices) ? [...prod.purchasePrices] : [];
              currentHistory.push(newHistoryItem);

              await setDoc(prodRef, {
                purchasePrice: finalPrice,
                currency: finalCurrency,
                priceValidFrom: formData.piDate || new Date().toISOString().split('T')[0],
                purchasePrices: currentHistory
              }, { merge: true });
            }
          }
        }
      }

      // Reload revisions in real-time after save
      const revSnap = await getDocs(collection(doc(db, "companies", COMPANY_ID, "proforma_invoices", piId), "revisions"));
      if (!revSnap.empty) {
        const revList = revSnap.docs.map(d => {
          const data = d.data() as any;
          return {
            id: d.id,
            ...data,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date()
          };
        }).sort((a: any, b: any) => (b.version || 0) - (a.version || 0));
        setRevisions(revList);

        // Update selected states to the saved revision
        setSelectedRevId(revRef.id);
        setDropdownRevId(revRef.id);
      }
      
      // Clear revision reason input
      setRevisionReason('');

      alert(isRevision ? `✅ Revision 저장 완료! (R${version})` : '✅ 일반저장 완료!');
      // onClose(); 삭제됨: 저장 후 창 닫지 않음
    } catch (e: any) {
      alert('❌ 저장 실패: ' + e.message);
    } finally {
      setSavingType(null);
    }
  };

  const handleConfirmPO = async () => {
    if (!initialPI) return;
    if (!window.confirm("이 견적서(PI)를 [PO확정] 상태로 전환하고 발주(PO) 생성 페이지로 이동하시겠습니까?")) return;
    
    setSavingType('normal');
    try {
      const piId = initialPI.id;
      const piNum = formData.piNumber || piId;
      const itemsSummary = items.slice(0, 3).map(i => `${i.description} (${i.quantity}${i.unit})`);
      if (items.length > 3) itemsSummary.push('...');

      const revisionsColRef = collection(doc(db, "companies", COMPANY_ID, "proforma_invoices", piId), "revisions");
      let revRef;
      let existingCreatedAt = null;
      let version = 1;

      if (selectedRevId) {
        revRef = doc(db, "companies", COMPANY_ID, "proforma_invoices", piId, "revisions", selectedRevId);
        const revDoc = await getDoc(revRef);
        if (revDoc.exists()) {
          existingCreatedAt = revDoc.data().createdAt;
          version = Number(revDoc.data().version) || 1;
        } else {
          const revSnap = await getDocs(revisionsColRef);
          if (!revSnap.empty) {
            const latest = revSnap.docs.sort((a, b) => (b.data().createdAt?.seconds || 0) - (a.data().createdAt?.seconds || 0))[0];
            revRef = latest.ref;
            existingCreatedAt = latest.data().createdAt;
            version = Number(latest.data().version) || 1;
          } else {
            version = 1;
            revRef = doc(revisionsColRef);
          }
        }
      } else {
        const revSnap = await getDocs(revisionsColRef);
        if (!revSnap.empty) {
          const latest = revSnap.docs.sort((a, b) => (b.data().createdAt?.seconds || 0) - (a.data().createdAt?.seconds || 0))[0];
          revRef = latest.ref;
          existingCreatedAt = latest.data().createdAt;
          version = Number(latest.data().version) || 1;
        } else {
          version = 1;
          revRef = doc(revisionsColRef);
        }
      }

      // Delete old line items
      const liSnap = await getDocs(collection(revRef, "line_items"));
      for (const d of liSnap.docs) {
        await deleteDoc(d.ref);
      }

      // Save main PI doc
      const piData: Partial<ProformaInvoice> = {
        ...formData,
        piNumber: piNum,
        currentVersion: version,
        itemsSummary,
        status: 'PO확정',
        updatedAt: serverTimestamp()
      };
      await setDoc(doc(db, "companies", COMPANY_ID, "proforma_invoices", piId), sanitizeForFirestore(piData), { merge: true });

      // Save revision doc
      const revData: PIRevision = {
        version,
        revisionReason: 'Edited active version (PO confirmed)',
        items,
        exchangeRate: formData.exchangeRate,
        remarks: formData.remarks,
        customerAddress: formData.customerAddress,
        incoterms: formData.incoterms,
        destinationPort: formData.destinationPort,
        paymentTerms: formData.paymentTerms,
        shippingMethod: formData.shippingMethod,
        packagingSpec: formData.packagingSpec,
        deliveryTerm: formData.deliveryTerm,
        origin: formData.origin,
        yourRef: formData.yourRef,
        attachments: formData.attachments || [],
        createdAt: existingCreatedAt || serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      await setDoc(revRef, sanitizeForFirestore(revData));

      // Save line items
      for (const item of items) {
        const itemRef = doc(collection(revRef, "line_items"));
        let rawCode = item.productCode;
        if (rawCode.startsWith('[') && rawCode.includes(']')) {
          rawCode = rawCode.substring(1, rawCode.indexOf(']')).trim();
        }
        await setDoc(itemRef, sanitizeForFirestore({ ...item, productCode: rawCode, id: itemRef.id }));

        // Update product master with the latest purchase price and date
        const prod = products.find(p => p.productCode === rawCode);
        if (prod) {
          const finalPrice = item.purchasePriceKrw > 0 ? item.purchasePriceKrw : item.purchasePriceUsd;
          const finalCurrency = item.purchasePriceKrw > 0 ? 'KRW' : 'USD';
          
          if (finalPrice > 0) {
            const isPriceChanged = prod.purchasePrice !== finalPrice || prod.currency !== finalCurrency;
            if (isPriceChanged) {
              const prodRef = doc(db, "companies", COMPANY_ID, "products", prod.id);
              const newHistoryItem = {
                validFrom: formData.piDate || new Date().toISOString().split('T')[0],
                validTo: '',
                currency: finalCurrency,
                price: finalPrice,
                minQty: item.quantity || 1,
                discountRate: 0,
                remarks: `Updated from PI ${piNum}`
              };
              const currentHistory = Array.isArray(prod.purchasePrices) ? [...prod.purchasePrices] : [];
              currentHistory.push(newHistoryItem);
              await setDoc(prodRef, {
                purchasePrice: finalPrice,
                currency: finalCurrency,
                priceValidFrom: formData.piDate || new Date().toISOString().split('T')[0],
                purchasePrices: currentHistory
              }, { merge: true });
            }
          }
        }
      }
      
      // Navigate to /orders with createFromPi parameter
      window.location.href = `/orders?createFromPi=${piId}`;
    } catch (e: any) {
      alert("PO 확정 처리 중 오류가 발생했습니다: " + e.message);
    } finally {
      setSavingType(null);
    }
  };

  const handleSimulation = () => {
    if (items.length === 0) {
      alert('시뮬레이션할 상품 라인이 없습니다.');
      return;
    }
    
    const payloadItems = items.map(it => {
      const p = products.find(prod => prod.productCode === getRawProductCode(it.productCode));
      const isPallet = p?.packageType?.includes('Pallet') || p?.packageType?.endsWith('+ Pallet');
      const spec = it.packingSpecOverride || {
        packageType: p?.packageType || 'Pallet',
        specWidth: isPallet ? (p?.palletWidth || p?.specWidth || 0) : (p?.unitWidth || p?.specWidth || 0),
        specLength: isPallet ? (p?.palletLength || p?.specLength || 0) : (p?.unitLength || p?.specLength || 0),
        specHeight: isPallet ? (p?.palletHeight || p?.specHeight || 0) : (p?.unitHeight || p?.specHeight || 0),
        weight: isPallet ? (p?.palletWeight || p?.weight || 0) : (p?.unitWeight || p?.weight || 0),
        grossWeight: isPallet ? (p?.palletGrossWeight || p?.grossWeight || 0) : (p?.unitGrossWeight || p?.grossWeight || p?.weight || 0)
      };
      
      return {
        desc: it.description,
        qty: it.palletQty && it.palletQty > 0 ? it.palletQty : 1, // 제품 낱개 수량이 아닌, 포장된 최종 Pallet 수량 전달
        w: spec.specWidth || 0,
        d: spec.specLength || 0,
        h: spec.specHeight || 0,
        netWeight: spec.weight || 0,
        grossWeight: spec.grossWeight || 0,
        packageType: spec.packageType,
        stackable: p?.stackable !== 'No',
        rotation: p?.rotation !== 'No'
      };
    });

    const payload = {
      type: 'LOAD_PI_DATA',
      customer: formData.customerName || '',
      piNumber: formData.piNumber || '',
      date: formData.piDate || '',
      items: payloadItems
    };

    localStorage.setItem('PI_SIMULATION_DATA', JSON.stringify(payload));
    
    // Calculate centered coordinates for the popup window
    const width = 1280;
    const height = 900;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    
    window.open(
      '/container/index.html', 
      'YSACCPackingSimulation', 
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=no,location=no,toolbar=no,menubar=no`
    );
  };

  const fetchExchangeRate = async () => {
    if (!formData.piDate) {
      alert("❌ PI Date를 먼저 선택해주세요.");
      return;
    }
    
    try {
      // Frankfurter API handles historical dates (e.g. 2026-06-05) and fallback for weekends
      const response = await fetch(`https://api.frankfurter.app/${formData.piDate}?from=USD&to=KRW`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data && data.rates && data.rates.KRW) {
        const baseRate = data.rates.KRW;
        
        // Hana Bank TT Buying Rate spread is typically ~1.0% less than base rate (or base rate - 9.8 KRW)
        // Let's use Base Rate * 0.99 (99% of base rate) to get a very close estimation of Hana Bank TT Buying Rate
        // Round to 2 decimal places
        const calculatedRate = Math.round(baseRate * 0.99 * 100) / 100;
        
        setFormData(prev => ({ ...prev, exchangeRate: calculatedRate }));
        
        // Show info toast/alert
        alert(`💵 환율 조회 성공!\n\n* 고시일자: ${data.date}\n* 매매기준율: ${baseRate.toLocaleString('ko-KR')}원\n* 송금받을때 환율(우대스프레드 약 1% 반영): ${calculatedRate.toLocaleString('ko-KR')}원`);
      } else {
        alert("❌ 해당 날짜의 환율 데이터를 찾을 수 없습니다.");
      }
    } catch (error) {
      console.error("Error fetching exchange rate:", error);
      alert("❌ 환율 정보를 불러오는 데 실패했습니다. 네트워크 연결을 확인하거나 수동으로 입력해주세요.");
    }
  };

  const handleDeleteRevision = async () => {
    if (!selectedRevId || !initialPI) return;
    if (revisions.length <= 1) {
      alert("⚠️ 최소 1개 이상의 Revision 기록이 존재해야 하므로 삭제할 수 없습니다.");
      return;
    }
    const targetRev = revisions.find(r => r.id === selectedRevId);
    const targetVersion = targetRev ? targetRev.version : '';
    if (!window.confirm(`⚠️ 정말 이 Revision (R${targetVersion}) 기록을 완전히 삭제하시겠습니까?\n복구할 수 없으며 관련 상품 라인 데이터도 함께 영구 삭제됩니다.`)) {
      return;
    }
    try {
      setSavingType('deleting');
      const revDocRef = doc(db, "companies", COMPANY_ID, "proforma_invoices", initialPI.id, "revisions", selectedRevId);
      
      // 1. Delete all line items in subcollection
      const liSnap = await getDocs(collection(revDocRef, "line_items"));
      for (const d of liSnap.docs) {
        await deleteDoc(d.ref);
      }
      
      // 2. Delete revision doc itself
      await deleteDoc(revDocRef);
      
      alert("✅ 선택한 Revision 기록이 완전히 삭제되었습니다.");
      
      // 3. Reload revisions and load the latest remaining revision
      const revSnap = await getDocs(collection(doc(db, "companies", COMPANY_ID, "proforma_invoices", initialPI.id), "revisions"));
      if (!revSnap.empty) {
        const revList = revSnap.docs.map(d => {
          const data = d.data() as any;
          return {
            id: d.id,
            ...data,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date()
          };
        }).sort((a: any, b: any) => (b.version || 0) - (a.version || 0));
        setRevisions(revList);

        const latestRevDoc = revSnap.docs.sort((a,b) => (b.data().createdAt?.seconds||0)-(a.data().createdAt?.seconds||0))[0];
        setSelectedRevId(latestRevDoc.id);
        setDropdownRevId(latestRevDoc.id);

        // Load items for the new latest revision
        const newLiSnap = await getDocs(collection(latestRevDoc.ref, "line_items"));
        let loadedItems = newLiSnap.docs.map(d => d.data() as PIItem).sort((a,b) => a.lineNumber - b.lineNumber);
        if (loadedItems.length === 0 && Array.isArray(latestRevDoc.data().items)) {
          loadedItems = (latestRevDoc.data().items as any[]).sort((a,b) => a.lineNumber - b.lineNumber);
        }
        setItems(loadedItems);
        
        // Update main document's currentVersion
        const newVersion = latestRevDoc.data().version || 1;
        await setDoc(doc(db, "companies", COMPANY_ID, "proforma_invoices", initialPI.id), {
          currentVersion: newVersion
        }, { merge: true });
        
      } else {
        setRevisions([]);
        setSelectedRevId('');
        setDropdownRevId('');
        setItems([]);
      }
    } catch (err: any) {
      console.error("Error deleting revision:", err);
      alert("❌ Revision 삭제 중 오류가 발생했습니다: " + err.message);
    } finally {
      setSavingType(null);
    }
  };

  const handleRevisionChange = async (revId: string) => {
    if (!revId || !initialPI) return;
    setSelectedRevId(revId);
    try {
      const revDocRef = doc(db, "companies", COMPANY_ID, "proforma_invoices", initialPI.id, "revisions", revId);
      const revDoc = await getDoc(revDocRef);
      if (revDoc.exists()) {
        const data = revDoc.data();
        
        // Load line items from subcollection
        const liSnap = await getDocs(collection(revDocRef, "line_items"));
        let loadedItems = liSnap.docs.map(d => d.data() as PIItem).sort((a,b) => a.lineNumber - b.lineNumber);
        
        // Fallback to items array if subcollection is empty
        if (loadedItems.length === 0 && Array.isArray(data.items)) {
          loadedItems = (data.items as any[]).sort((a,b) => a.lineNumber - b.lineNumber);
        }
        
        setItems(loadedItems);
        
        // If the revision saved special custom values (like exchangeRate, remarks etc.), we can load them too
        setFormData(prev => ({
          ...prev,
          exchangeRate: data.exchangeRate !== undefined ? data.exchangeRate : prev.exchangeRate,
          remarks: data.remarks !== undefined ? data.remarks : prev.remarks,
          customerAddress: data.customerAddress !== undefined ? data.customerAddress : prev.customerAddress,
          incoterms: data.incoterms !== undefined ? data.incoterms : prev.incoterms,
          destinationPort: data.destinationPort !== undefined ? data.destinationPort : prev.destinationPort,
          paymentTerms: data.paymentTerms !== undefined ? data.paymentTerms : prev.paymentTerms,
          shippingMethod: data.shippingMethod !== undefined ? data.shippingMethod : prev.shippingMethod,
          packagingSpec: data.packagingSpec !== undefined ? data.packagingSpec : prev.packagingSpec,
          deliveryTerm: data.deliveryTerm !== undefined ? data.deliveryTerm : prev.deliveryTerm,
          origin: data.origin !== undefined ? data.origin : prev.origin,
          yourRef: data.yourRef !== undefined ? data.yourRef : prev.yourRef,
          attachments: data.attachments !== undefined ? data.attachments : (prev.attachments || [])
        }));
        
        alert(`ℹ️ Version ${data.version || ''}의 데이터가 로드되었습니다.`);
      }
    } catch (err) {
      console.error("Error loading specific revision:", err);
      alert("❌ Revision 데이터를 불러오는데 실패했습니다.");
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(6px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: '14px', width: '98%', maxWidth: '1600px', maxHeight: '95vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.12)' }}>
        
        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e8ecf0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa', borderRadius: '14px 14px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#111827' }}>
                {initialPI ? 'Edit Proforma Invoice' : 'New Proforma Invoice'}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                신규 견적서 작성 · Firebase Firestore 저장
              </div>
            </div>
            {initialPI && revisions.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#eff6ff', padding: '6px 12px', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#1e40af' }}>🕒 Revision 기록 불러오기:</span>
                <select
                  value={dropdownRevId}
                  onChange={(e) => setDropdownRevId(e.target.value)}
                  style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 600, color: '#1e293b', cursor: 'pointer' }}
                >
                  {revisions.map((rev) => {
                    const v = rev.version || 1;
                    const suffix = v > 1 ? `R${v - 1}` : '';
                    return (
                      <option key={rev.id} value={rev.id}>
                        {initialPI.piNumber}{suffix}
                      </option>
                    );
                  })}
                </select>
                <button
                  type="button"
                  onClick={() => handleRevisionChange(dropdownRevId)}
                  disabled={savingType !== null || !dropdownRevId || dropdownRevId === selectedRevId}
                  style={{
                    marginLeft: '4px',
                    background: '#e0e7ff',
                    border: '1px solid #c7d2fe',
                    color: '#4338ca',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: (savingType !== null || !dropdownRevId || dropdownRevId === selectedRevId) ? 'not-allowed' : 'pointer'
                  }}
                  title="선택한 Revision 불러오기"
                >
                  📥 불러오기
                </button>
                <button
                  type="button"
                  onClick={handleDeleteRevision}
                  disabled={savingType !== null}
                  style={{
                    marginLeft: '4px',
                    background: '#fef2f2',
                    border: '1px solid #fee2e2',
                    color: '#ef4444',
                    borderRadius: '6px',
                    padding: '4px 8px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: savingType !== null ? 'not-allowed' : 'pointer'
                  }}
                  title="선택된 Revision 기록 삭제"
                >
                  🗑️ 삭제
                </button>
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#6b7280', fontSize: '20px', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1, backgroundColor: '#fff' }}>
          
          {/* Issuer */}
          <div style={{ background: 'linear-gradient(135deg,#eff6ff,#f0fdf4)', border: '2px solid #3b82f6', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
            <h4 style={{ color: '#1d4ed8', fontSize: '11px', fontWeight: 700, marginBottom: '12px' }}>⓪ 견적 발행사 선택 ★</h4>
            <div style={{ display: 'flex', gap: '16px' }}>
              <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', border: formData.issuingCompany === 'YSACC' ? '2px solid #3b82f6' : '2px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', background: '#fff' }}>
                <input type="radio" checked={formData.issuingCompany === 'YSACC'} onChange={() => setFormData(prev => ({...prev, issuingCompany: 'YSACC'}))} style={{ width: '18px', height: '18px', accentColor: '#3b82f6' }} />
                <div>
                  <div style={{ fontWeight: 800, color: '#1d4ed8', fontSize: '14px' }}>(주)와이에스에이씨씨</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>YSACC CO., LTD.</div>
                </div>
              </label>
              <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px', padding: '14px', border: formData.issuingCompany === 'YS' ? '2px solid #10b981' : '2px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', background: '#fff' }}>
                <input type="radio" checked={formData.issuingCompany === 'YS'} onChange={() => setFormData(prev => ({...prev, issuingCompany: 'YS'}))} style={{ width: '18px', height: '18px', accentColor: '#10b981' }} />
                <div>
                  <div style={{ fontWeight: 800, color: '#059669', fontSize: '14px' }}>영성ACC</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>YS ACC</div>
                </div>
              </label>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '14px', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
            <Input label="문서 번호 (PI Number) ★" value={formData.piNumber} onChange={(v: any) => setFormData(prev => ({...prev, piNumber: v}))} />
            <Input label="Your Ref (PO Number)" value={formData.yourRef || ''} onChange={(v: any) => setFormData(prev => ({...prev, yourRef: v}))} />
            <Input label="PI Date ★" type="date" value={formData.piDate} onChange={(v: any) => setFormData(prev => ({...prev, piDate: v}))} />
            <Input label="Validity (Days)" type="number" value={formData.validityDays} onChange={(v: any) => setFormData(prev => ({...prev, validityDays: parseInt(v)||0}))} />
            <Input label="Valid Until (자동)" value={formData.validUntilDate} disabled />
            <Input label="작성자 (Author)" value={formData.createdByName} disabled />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>Customer ★</label>
              <select value={showNewCust ? '__NEW__' : (formData.customerId || '')} onChange={(e) => handleCustomerChange(e.target.value)} style={{ padding: '9px 11px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}>
                <option value="">— 선택 —</option>
                <option value="__NEW__" style={{ color: '#2563eb', fontWeight: 700 }}>➕ 신규 고객 등록...</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <Input label="Address" value={formData.customerAddress || ''} disabled />
            <Input label="Contact" value={formData.contactPerson} disabled />
            <Input label="Email" value={formData.email} disabled />

            {/* 신규 고객 입력 패널 */}
            {showNewCust && (
              <div style={{ gridColumn: 'span 4', background: '#eff6ff', border: '2px solid #3b82f6', borderRadius: '10px', padding: '16px', marginTop: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <span style={{ fontSize: '14px' }}>🆕</span>
                  <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#1d4ed8' }}>신규 고객 등록</h4>
                  <span style={{ fontSize: '11px', color: '#6b7280', marginLeft: 'auto' }}>저장 후 자동으로 선택됩니다</span>
                  <button onClick={() => { setShowNewCust(false); setFormData(prev => ({...prev, customerId: ''})); }} style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '16px' }}>✕</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#1d4ed8' }}>고객명 (Company Name) ★</label>
                    <input value={newCustForm.name} onChange={e => setNewCustForm(p => ({...p, name: e.target.value}))} placeholder="예: ABC TRADING CO." style={{ padding: '8px 10px', border: '1px solid #93c5fd', borderRadius: '6px', fontSize: '13px' }} />
                  </div>
                  <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>고객사 주소 (Company Address - English)</label>
                    <input value={newCustForm.addressEn} onChange={e => setNewCustForm(p => ({...p, addressEn: e.target.value}))} placeholder="Company Address" style={{ padding: '8px 10px', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '13px' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>담당자명 (Contact)</label>
                    <input value={newCustForm.contactPerson} onChange={e => setNewCustForm(p => ({...p, contactPerson: e.target.value}))} placeholder="담당자 이름" style={{ padding: '8px 10px', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '13px' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>Email</label>
                    <input type="email" value={newCustForm.email} onChange={e => setNewCustForm(p => ({...p, email: e.target.value}))} placeholder="email@example.com" style={{ padding: '8px 10px', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '13px' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>전화번호 (Phone)</label>
                    <input value={newCustForm.phone} onChange={e => setNewCustForm(p => ({...p, phone: e.target.value}))} placeholder="+82-10-0000-0000" style={{ padding: '8px 10px', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '13px' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>국가 (Country)</label>
                    <input value={newCustForm.countryName} onChange={e => setNewCustForm(p => ({...p, countryName: e.target.value}))} placeholder="예: Turkey" style={{ padding: '8px 10px', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '13px' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>도착항 (Port)</label>
                    <input value={newCustForm.shippingPort} onChange={e => setNewCustForm(p => ({...p, shippingPort: e.target.value}))} placeholder="예: MERSIN PORT, TURKEY" style={{ padding: '8px 10px', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '13px' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>Incoterms</label>
                    <input value={newCustForm.preferredIncoterms} onChange={e => setNewCustForm(p => ({...p, preferredIncoterms: e.target.value}))} placeholder="CIF / FOB" style={{ padding: '8px 10px', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '13px' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>결제 조건 (Payment)</label>
                    <input value={newCustForm.paymentTerms} onChange={e => setNewCustForm(p => ({...p, paymentTerms: e.target.value}))} placeholder="T/T in advance" style={{ padding: '8px 10px', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '13px' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button onClick={() => { setShowNewCust(false); setFormData(prev => ({...prev, customerId: ''})); }} style={{ background: '#fff', border: '1px solid #cbd5e1', color: '#475569', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>취소</button>
                  <button onClick={saveNewCustomer} style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>💾 고객 등록 후 선택</button>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '14px', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
            <ComboSelect label="Incoterms" field="incoterms" options={tradeTermsDB.incoterms || []} required={true} />
            <ComboSelect label="Destination Port" field="destinationPort" options={tradeTermsDB.destinationPorts || []} required={true} />
            <ComboSelect label="Departure Port" field="departurePort" options={tradeTermsDB.departurePorts || []} />
            <ComboSelect label="Packaging Spec." field="packagingSpec" options={tradeTermsDB.packagingSpecs || []} />
            <ComboSelect label="Validity Description" field="validityDesc" options={tradeTermsDB.validityDescriptions || []} />
            <ComboSelect label="Payment Terms" field="paymentTerms" options={tradeTermsDB.paymentTerms || []} required={true} />
            <ComboSelect label="Shipping Method" field="shippingMethod" options={tradeTermsDB.shippingMethods || []} />
            <ComboSelect label="Delivery Term" field="deliveryTerm" options={tradeTermsDB.deliveryTerms || []} />
            <ComboSelect label="Origin" field="origin" options={tradeTermsDB.origins || []} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>Exchange Rate (KRW/USD)</label>
                <button
                  type="button"
                  onClick={fetchExchangeRate}
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    background: '#3b82f6',
                    border: 'none',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    color: '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px',
                    transition: 'all 0.2s',
                    outline: 'none'
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.background = '#2563eb'; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = '#3b82f6'; }}
                >
                  ⚡ 불러오기
                </button>
              </div>
              <input
                type="number"
                step="0.01"
                value={formData.exchangeRate ?? ''}
                onChange={(e) => setFormData(prev => ({...prev, exchangeRate: parseFloat(e.target.value) || 1}))}
                style={{ padding: '9px 11px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
              />
            </div>
            <div style={{ gridColumn: 'span 5', display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>Remarks</label>
              <textarea value={formData.remarks} onChange={(e) => setFormData(prev => ({...prev, remarks: e.target.value}))} rows={2} style={{ padding: '9px 11px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}></textarea>
            </div>
          </div>

          {/* Line Items */}
          <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px', overflowX: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#475569', margin: 0 }}>④ 상품 라인 (Line Items)</h4>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={refreshPackingData} style={{ background: '#f59e0b', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }} title="상품 마스터의 최신 패킹 데이터로 수량을 재계산합니다">🔄 패킹 데이터 새로고침</button>
                <button onClick={handleSimulation} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>🚢 적재 시뮬레이션</button>
                <button onClick={addItem} style={{ background: '#fff', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', color: '#334155' }}>＋ 상품 추가</button>
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #cbd5e1', textAlign: 'left', color: '#6b7280' }}>
                  <th style={{ padding: '8px 4px', width: '260px' }}>상품코드</th>
                  <th style={{ padding: '8px 4px', width: '120px' }}>스펙 (Spec)</th>
                  <th style={{ padding: '8px 4px', width: '110px' }}>패킹 방식</th>
                  <th style={{ padding: '8px 4px', width: '70px', textAlign: 'right' }}>패킹수량</th>
                  <th style={{ padding: '8px 4px', width: '95px', textAlign: 'right' }}>수량</th>
                  <th style={{ padding: '8px 4px', width: '50px' }}>단위</th>
                  <th style={{ padding: '8px 4px', width: '75px', textAlign: 'right' }}>매입(₩)</th>
                  <th style={{ padding: '8px 4px', width: '65px', textAlign: 'right' }}>환율</th>
                  <th style={{ padding: '8px 4px', width: '65px', textAlign: 'right' }}>매입($)</th>
                  <th style={{ padding: '8px 4px', width: '50px', textAlign: 'right' }}>마진%</th>
                  <th style={{ padding: '8px 4px', width: '65px' }}>올림</th>
                  <th style={{ padding: '8px 4px', width: '60px', textAlign: 'right' }}>단가($)</th>
                  <th style={{ padding: '8px 4px', width: '70px', textAlign: 'right' }}>이익($)</th>
                  <th style={{ padding: '8px 4px', width: '80px', textAlign: 'right' }}>총액($)</th>
                  <th style={{ padding: '8px 4px', width: '150px' }}>비고</th>
                  <th style={{ padding: '8px 4px', width: '35px' }}></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={15} style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>상품을 추가해주세요</td></tr>
                ) : items.map((it, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '4px' }}>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <div style={{ flex: 1, position: 'relative' }}>
                          <input 
                            type="text" 
                            list={`products_datalist_${idx}`}
                            value={it.productCode} 
                            placeholder="상품코드 검색/입력"
                            onChange={(e) => updateItem(idx, 'productCode', e.target.value)} 
                            style={gridInputStyle} 
                          />
                          <datalist id={`products_datalist_${idx}`}>
                            {products.map(p => (
                              <option key={p.productCode} value={`[${p.productCode}] ${p.nameKo || p.nameEn}`}>
                                [{p.productCode}] {p.nameKo || p.nameEn}
                              </option>
                            ))}
                          </datalist>
                          {(() => {
                            const rawCode = getRawProductCode(it.productCode);
                            const p = products.find(prod => prod.productCode === rawCode || prod.id === rawCode);
                            if (p && p.supplierName) {
                              return (
                                <div style={{ fontSize: '11px', color: '#0891b2', marginTop: '2px', fontWeight: 600 }}>
                                  🏢 {p.supplierName}
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingProd(undefined);
                              setIsProdModalOpen(true);
                            }}
                            title="신규 상품 등록"
                            style={{
                              background: '#eff6ff',
                              border: '1px solid #bfdbfe',
                              color: '#2563eb',
                              borderRadius: '4px',
                              padding: '2px 6px',
                              cursor: 'pointer',
                              fontSize: '10px',
                              fontWeight: 600,
                              whiteSpace: 'nowrap'
                            }}
                          >
                            ➕
                          </button>
                          {(() => {
                            const rawCode = getRawProductCode(it.productCode);
                            const p = products.find(prod => prod.productCode === rawCode);
                            return (
                              <button
                                type="button"
                                onClick={() => {
                                  if (p) {
                                    setEditingProd(p);
                                    setIsProdModalOpen(true);
                                  } else {
                                    alert('먼저 등록된 상품을 검색/선택해주세요.');
                                  }
                                }}
                                disabled={!p}
                                title="선택된 상품 수정"
                                style={{
                                  background: p ? '#f0fdf4' : '#f1f5f9',
                                  border: p ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                                  color: p ? '#16a34a' : '#94a3b8',
                                  borderRadius: '4px',
                                  padding: '2px 6px',
                                  cursor: p ? 'pointer' : 'not-allowed',
                                  fontSize: '10px',
                                  fontWeight: 600,
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                ✏️
                              </button>
                            );
                          })()}
                        </div>
                    </td>
                    <td style={{ padding: '4px' }}>
                      <input 
                        type="text" 
                        value={it.spec || ''} 
                        placeholder="스펙 (Spec)" 
                        onChange={(e) => updateItem(idx, 'spec', e.target.value)} 
                        style={gridInputStyle} 
                      />
                    </td>
                    <td style={{ padding: '4px' }}>
                      {it.productCode ? (() => {
                        const prod = products.find(p => p.productCode === getRawProductCode(it.productCode));
                        const methods = prod?.packingMethods || [];
                        return (
                          <select
                            value={it.selectedPackingMethodId || ''}
                            onChange={(e) => updateItem(idx, 'selectedPackingMethodId', e.target.value)}
                            style={gridInputStyle}
                          >
                            <option value="">-- 기본 규격 --</option>
                            {methods.map((m: any) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        );
                      })() : (
                        <select style={gridInputStyle} disabled><option>--</option></select>
                      )}
                    </td>
                    <td style={{ padding: '4px' }}>
                      <input 
                        type="number" 
                        step="0.1"
                        value={it.palletQty || ''} 
                        onChange={(e) => updateItem(idx, 'palletQty', parseFloat(e.target.value) || 0)} 
                        style={{ ...gridInputStyle, textAlign: 'right' }} 
                      />
                    </td>
                    <td style={{ padding: '4px' }}>
                      <input 
                        type="number" 
                        value={it.quantity || ''} 
                        onChange={(e) => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)} 
                        style={{ ...gridInputStyle, textAlign: 'right' }} 
                      />
                    </td>
                    <td style={{ padding: '4px' }}><input type="text" value={it.unit} onChange={(e) => updateItem(idx, 'unit', e.target.value.toUpperCase())} style={gridInputStyle} /></td>
                    <td style={{ padding: '4px' }}>
                      <input 
                        type="text" 
                        value={formatNumberWithCommas(it.purchasePriceKrw)} 
                        onChange={(e) => updateItem(idx, 'purchasePriceKrw', parseCommas(e.target.value))} 
                        style={{ ...gridInputStyle, textAlign: 'right' }} 
                      />
                    </td>
                    <td style={{ padding: '4px' }}>
                      <input 
                        type="text" 
                        value={formatNumberWithCommas(it.exchangeRate)} 
                        onChange={(e) => updateItem(idx, 'exchangeRate', parseCommas(e.target.value))} 
                        style={{ ...gridInputStyle, textAlign: 'right' }} 
                      />
                    </td>
                    <td style={{ padding: '4px' }}>
                      <input 
                        type="text" 
                        value={formatNumberWithCommas(it.purchasePriceUsd, 2)} 
                        onChange={(e) => updateItem(idx, 'purchasePriceUsd', parseCommas(e.target.value))} 
                        style={{ ...gridInputStyle, textAlign: 'right' }} 
                      />
                    </td>
                    <td style={{ padding: '4px' }}>
                      <input 
                        type="text" 
                        value={formatNumberWithCommas(it.marginRate)} 
                        onChange={(e) => updateItem(idx, 'marginRate', parseCommas(e.target.value))} 
                        style={{ ...gridInputStyle, textAlign: 'right' }} 
                      />
                    </td>
                    <td style={{ padding: '4px' }}>
                      <select 
                        value={it.roundDigits ?? 'none'} 
                        onChange={(e) => updateItem(idx, 'roundDigits', e.target.value === 'none' ? undefined : parseInt(e.target.value))} 
                        style={gridInputStyle}
                      >
                        <option value="none">없음</option>
                        <option value="2">2자리</option>
                        <option value="1">1자리</option>
                        <option value="0">정수</option>
                        <option value="-1">10의자리</option>
                      </select>
                    </td>
                    <td style={{ padding: '4px', textAlign: 'right' }}>
                      <input 
                        type="text" 
                        value={formatNumberWithCommas(it.salePriceUsd, 2)} 
                        onChange={(e) => updateItem(idx, 'salePriceUsd', parseCommas(e.target.value))} 
                        style={{ ...gridInputStyle, textAlign: 'right' }} 
                      />
                    </td>
                    <td style={{ padding: '4px', textAlign: 'right', fontWeight: 600, color: '#3b82f6' }}>
                      ${(() => {
                        const costUsd = it.purchasePriceUsd > 0 ? it.purchasePriceUsd : ((it.purchasePriceKrw || 0) / (it.exchangeRate || formData.exchangeRate || 1400));
                        const profit = (it.salePriceUsd || 0) - costUsd;
                        const lineProfit = profit * (it.quantity || 0);
                        return lineProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                      })()}
                    </td>
                    <td style={{ padding: '4px', textAlign: 'right', fontWeight: 600, color: '#059669' }}>
                      ${(it.lineTotalUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '4px' }}>
                      <textarea 
                        value={it.remarks || ''} 
                        placeholder="비고"
                        onChange={(e) => updateItem(idx, 'remarks', e.target.value)} 
                        rows={2}
                        style={{ ...gridInputStyle, resize: 'vertical', minHeight: '34px', fontFamily: 'inherit' }} 
                      />
                    </td>
                    <td style={{ padding: '4px', textAlign: 'center' }}>
                      <button onClick={() => removeItem(idx)} style={{ background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: '4px', padding: '4px', cursor: 'pointer' }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Extras and Totals */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
            
            {/* Freight Charges (USD) */}
            <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '8px', background: '#fff', border: '1px solid #cbd5e1', padding: '16px', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>Freight Charges (USD)</span>
                <button type="button" onClick={addFreightCharge} style={{ background: 'none', border: '1px solid #cbd5e1', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 600, color: '#475569' }}>＋ 운송비 추가</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* Freight Headers */}
                <div style={{ display: 'flex', gap: '8px', padding: '0 40px 4px 0', borderBottom: '1px solid #e2e8f0', marginBottom: '4px', fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                  <div style={{ flex: 1.5 }}>Container Type</div>
                  <div style={{ flex: 1, textAlign: 'right' }}>Quantities</div>
                  <div style={{ flex: 1.5, textAlign: 'right' }}>Unit Price</div>
                  <div style={{ flex: 1, textAlign: 'right' }}>Total</div>
                  <div style={{ flex: 3.5, paddingLeft: '8px' }}>비고 (Remarks)</div>
                </div>
                {(formData.freightCharges || []).map((fc, fcIdx) => (
                  <div key={fcIdx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <select 
                      value={fc.type || 'LCL'} 
                      onChange={e => updateFreightCharge(fcIdx, 'type', e.target.value)} 
                      style={{ flex: 1.5, padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                    >
                      <option value="LCL">LCL</option>
                      <option value="20GP">20GP</option>
                      <option value="20RF">20RF</option>
                      <option value="20DG">20DG</option>
                      <option value="40FT">40FT</option>
                      <option value="40HQ">40HQ</option>
                    </select>
                    <input 
                      type="number" 
                      placeholder="수량" 
                      value={fc.qty ?? 1} 
                      onChange={e => updateFreightCharge(fcIdx, 'qty', parseFloat(e.target.value) || 0)} 
                      style={{ flex: 1, padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', textAlign: 'right' }} 
                    />
                    <input 
                      type="number" 
                      step="0.01"
                      placeholder="금액 (USD)" 
                      value={fc.price ?? 0} 
                      onChange={e => updateFreightCharge(fcIdx, 'price', parseFloat(e.target.value) || 0)} 
                      style={{ flex: 1.5, padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', textAlign: 'right' }} 
                    />
                    <div style={{ flex: 1, textAlign: 'right', fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>
                      ${((fc.qty || 0) * (fc.price || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <input 
                      type="text" 
                      placeholder="비고" 
                      value={fc.remarks || ''} 
                      onChange={e => updateFreightCharge(fcIdx, 'remarks', e.target.value)} 
                      style={{ flex: 3.5, padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }} 
                    />
                    <button type="button" onClick={() => removeFreightCharge(fcIdx)} style={{ background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: '4px', padding: '6px 10px', cursor: 'pointer', fontSize: '12px' }}>✕</button>
                  </div>
                ))}
              </div>
              <div style={{ textAlign: 'right', fontWeight: 700, fontSize: '12px', color: '#475569', marginTop: '4px' }}>
                운송비 합계: ${(formData.freightTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <Input label="Insurance (USD)" type="number" step="0.01" value={formData.insurance} onChange={(v: any) => setFormData(prev => ({...prev, insurance: parseFloat(v)||0}))} />
            <Input label="원화 환산 총액 (참고)" value={`₩ ${(formData.totalKrw || 0).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`} disabled />
          </div>

          {initialPI && (
            <div style={{ background: 'rgba(37,99,235,0.05)', border: '2px solid #2563eb', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
              <Input label="Revision Reason (변경 사유) ★" value={revisionReason} onChange={(v: any) => setRevisionReason(v)} placeholder="예: 고객 단가 인하 요청 수용" />
            </div>
          )}

          <div style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '16px 24px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <div style={{ color: '#2563eb', fontSize: '14px', fontWeight: 600 }}>예상 총 이익 (Total Profit): <b style={{ fontSize: '16px' }}>{(() => {
                const totalProfit = items.reduce((sum, it) => {
                  const costUsd = it.purchasePriceUsd > 0 ? it.purchasePriceUsd : ((it.purchasePriceKrw || 0) / (it.exchangeRate || formData.exchangeRate || 1400));
                  const profit = (it.salePriceUsd || 0) - costUsd;
                  return sum + (profit * (it.quantity || 0));
                }, 0);
                const totalSales = formData.totalUsd || formData.subtotalUsd || 0;
                const marginPercent = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;
                return `$${totalProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${marginPercent.toFixed(1)}%)`;
              })()}</b></div>
            </div>
            <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
              <div style={{ color: '#64748b', fontSize: '14px' }}>Subtotal: <b style={{ color: '#334155' }}>${(formData.subtotalUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></div>
              <div style={{ color: '#64748b', fontSize: '14px' }}>Extras: <b style={{ color: '#334155' }}>${(formData.extrasUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></div>
              <div style={{ fontSize: '18px', color: '#334155' }}>GRAND TOTAL: <strong style={{ color: '#059669', fontSize: '22px' }}>USD ${(formData.totalUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
            </div>
          </div>

          {/* Attachments (Dropzone) */}
          <div 
            style={{ 
              background: '#f8fafc', border: '2px dashed #cbd5e1', padding: '20px', 
              borderRadius: '8px', marginBottom: '16px', textAlign: 'center',
              position: 'relative', transition: 'all 0.2s'
            }}
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.background = '#eff6ff'; }}
            onDragLeave={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#f8fafc'; }}
            onDrop={e => {
              e.preventDefault();
              e.currentTarget.style.borderColor = '#cbd5e1';
              e.currentTarget.style.background = '#f8fafc';
              handleFileUpload(e.dataTransfer.files);
            }}
            onPaste={e => {
              const files = e.clipboardData?.files;
              if (files && files.length > 0) {
                e.preventDefault();
                handleFileUpload(files);
              }
            }}
            tabIndex={0}
          >
            <div style={{ color: '#64748b', fontSize: '14px', marginBottom: '12px' }}>
              📁 이곳에 파일이나 캡처 이미지(Ctrl+V)를 드래그 앤 드롭하여 첨부하세요.
            </div>
            <input 
              type="file" 
              multiple 
              onChange={e => handleFileUpload(e.target.files)} 
              style={{ display: 'none' }} 
              id="pi-file-upload" 
            />
            <label 
              htmlFor="pi-file-upload" 
              style={{ background: '#3b82f6', color: '#fff', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 600, display: 'inline-block' }}
            >
              {isUploading ? '업로드 중...' : '파일 선택하기'}
            </label>
            
            {formData.attachments && formData.attachments.length > 0 && (
              <div style={{ marginTop: '20px', display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center' }}>
                {formData.attachments.map((att, idx) => {
                  const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(att.name);
                  const isPdf = /\.pdf$/i.test(att.name);
                  const isExcel = /\.(xls|xlsx)$/i.test(att.name);
                  
                  return (
                    <div 
                      key={idx} 
                      style={{ 
                        background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', 
                        padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '10px', 
                        fontSize: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                        transition: 'transform 0.15s, box-shadow 0.15s'
                      }}
                    >
                      {/* Preview Thumbnail/Icon */}
                      <div 
                        onClick={() => { setActivePreviewUrl(att.url); setActivePreviewName(att.name); }}
                        style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                        title="클릭하여 미리보기"
                      >
                        {isImg ? (
                          <img 
                            src={att.url} 
                            alt={att.name} 
                            style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #cbd5e1' }} 
                          />
                        ) : (
                          <span style={{ fontSize: '20px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                            {isPdf ? '📄' : isExcel ? '📊' : '📎'}
                          </span>
                        )}
                      </div>

                      {/* File Name & Info */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left' }}>
                        <span 
                          onClick={() => { setActivePreviewUrl(att.url); setActivePreviewName(att.name); }}
                          style={{ color: '#1e293b', fontWeight: 600, textDecoration: 'none', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                          title="클릭하여 미리보기"
                        >
                          {att.name}
                        </span>
                        <span style={{ color: '#64748b', fontSize: '10px' }}>({(att.size / 1024).toFixed(1)}KB)</span>
                      </div>

                      {/* Action Buttons */}
                      <div style={{ display: 'flex', gap: '4px', marginLeft: '4px' }}>
                        <button 
                          type="button" 
                          onClick={() => { setActivePreviewUrl(att.url); setActivePreviewName(att.name); }}
                          style={{ background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '4px 6px', fontSize: '11px', fontWeight: 'bold' }}
                          title="미리보기"
                        >
                          🔍
                        </button>
                        <button 
                          type="button" 
                          onClick={() => handleDeleteAttachment(idx)} 
                          style={{ background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '4px 6px', fontSize: '11px', fontWeight: 'bold' }}
                          title="삭제"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #e8ecf0', background: '#fafafa', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '0 0 14px 14px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            {initialPI && (
              <button 
                type="button"
                onClick={handleConfirmPO}
                disabled={savingType !== null}
                style={{ padding: '9px 18px', borderRadius: '7px', border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, cursor: savingType !== null ? 'not-allowed' : 'pointer', boxShadow: '0 2px 4px rgba(220, 38, 38, 0.2)' }}
              >
                {formData.status === 'PO확정' ? '🤝 발주서 추가 발행 (재발주)' : '🤝 PO 확정 & 발주등록'}
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: '7px', border: '1px solid #cbd5e1', background: '#fff', fontWeight: 600, color: '#475569', cursor: 'pointer' }}>취소</button>
            
            <button 
              type="button" 
              onClick={() => generatePIPdf(formData as ProformaInvoice, items)} 
              style={{ padding: '9px 18px', borderRadius: '7px', border: '1px solid #ef4444', background: '#fff', fontWeight: 600, color: '#ef4444', cursor: 'pointer' }}
            >
              📄 PDF로 저장하기
            </button>
            
            <button 
              type="button" 
              onClick={() => generatePIExcel(formData as ProformaInvoice, items)} 
              style={{ padding: '9px 18px', borderRadius: '7px', border: '1px solid #10b981', background: '#fff', fontWeight: 600, color: '#10b981', cursor: 'pointer' }}
            >
              📊 Excel 견적서
            </button>

            <button 
              type="button"
              onClick={() => handleSave(false)} 
              disabled={savingType !== null} 
              style={{ padding: '9px 18px', borderRadius: '7px', border: 'none', background: savingType === 'normal' ? '#93c5fd' : '#2563eb', color: '#fff', fontWeight: 600, cursor: savingType !== null ? 'not-allowed' : 'pointer', opacity: savingType !== null && savingType !== 'normal' ? 0.5 : 1 }}
            >
              {savingType === 'normal' ? '✔ 일반저장 중...' : '✔ 일반저장'}
            </button>

            {initialPI && (
              <button 
                type="button"
                onClick={() => handleSave(true)} 
                disabled={savingType !== null} 
                style={{ padding: '9px 18px', borderRadius: '7px', border: 'none', background: savingType === 'revision' ? '#c4b5fd' : '#7c3aed', color: '#fff', fontWeight: 600, cursor: savingType !== null ? 'not-allowed' : 'pointer', opacity: savingType !== null && savingType !== 'revision' ? 0.5 : 1 }}
              >
                {savingType === 'revision' ? '⚙ Revision 저장 중...' : '⚙ Revision 저장'}
              </button>
            )}
          </div>
        </div>

      </div>
      {isProdModalOpen && (
        <ProductModal
          initialProduct={editingProd}
          onClose={() => setIsProdModalOpen(false)}
          products={products}
        />
      )}
      {activePreviewUrl && (
        <div 
          onClick={() => setActivePreviewUrl(null)} 
          style={{ 
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
            backgroundColor: 'rgba(0,0,0,0.65)', display: 'flex', 
            justifyContent: 'center', alignItems: 'center', zIndex: 9999,
            backdropFilter: 'blur(3px)'
          }}
        >
          <div 
            onClick={e => e.stopPropagation()} 
            style={{ 
              background: '#fff', padding: '16px', borderRadius: '12px', 
              maxWidth: '90%', maxHeight: '90%', display: 'flex', 
              flexDirection: 'column', alignItems: 'center', gap: '12px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.25)', position: 'relative'
            }}
          >
            <button 
              onClick={() => setActivePreviewUrl(null)} 
              style={{ 
                position: 'absolute', top: '-15px', right: '-15px', 
                background: '#ef4444', color: '#fff', border: 'none', 
                borderRadius: '50%', width: '30px', height: '30px', 
                cursor: 'pointer', display: 'flex', alignItems: 'center', 
                justifyContent: 'center', fontWeight: 'bold', fontSize: '16px',
                boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
              }}
            >
              ✕
            </button>
            <div style={{ fontWeight: 600, fontSize: '14px', color: '#1e293b', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              🔍 {activePreviewName}
            </div>
            {/\.(jpg|jpeg|png|gif|webp)$/i.test(activePreviewName) ? (
              <img 
                src={activePreviewUrl} 
                alt="preview" 
                style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: '6px' }} 
              />
            ) : (
              <iframe 
                src={activePreviewUrl} 
                title="preview-iframe"
                style={{ width: '80vw', height: '70vh', border: 'none' }}
              />
            )}
            <a 
              href={activePreviewUrl} 
              target="_blank" 
              rel="noreferrer" 
              style={{ color: '#2563eb', fontWeight: 600, fontSize: '13px', textDecoration: 'none' }}
            >
              ↗️ 새 창으로 크게 보기
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

const Input = ({ label, value, onChange, type = 'text', disabled = false, placeholder = '', step }: any) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
    <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>{label}</label>
    <input type={type} value={value ?? ''} onChange={e => onChange?.(e.target.value)} disabled={disabled} placeholder={placeholder} step={step} style={{ padding: '9px 11px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: disabled ? '#f1f5f9' : '#fff' }} />
  </div>
);

const gridInputStyle = { width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', outline: 'none' };

const formatNumberWithCommas = (value: number | string | undefined, maxDecimals?: number) => {
  if (value === undefined || value === null || value === '') return '';
  const str = value.toString().replace(/,/g, '');
  if (isNaN(Number(str))) return str;
  let parts = str.split('.');
  if (maxDecimals !== undefined && parts.length > 1) {
      if (parts[1].length > maxDecimals) {
          parts[1] = parts[1].substring(0, maxDecimals);
      }
  }
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.length > 1 && maxDecimals !== 0 ? parts.join('.') : parts[0];
};

const parseCommas = (value: string): number => {
  return parseFloat(value.replace(/,/g, '')) || 0;
};

const getRawProductCode = (code: string | undefined): string => {
  if (!code) return '';
  const val = code.trim();
  if (val.startsWith('[') && val.includes(']')) {
    return val.substring(1, val.indexOf(']')).trim();
  }
  return val;
};

const ceilValue = (value: number, digits: number): number => {
  if (digits === -1) {
    return Math.ceil(value / 10) * 10;
  }
  const factor = Math.pow(10, digits);
  return Math.ceil(value * factor) / factor;
};

const sanitizeForFirestore = (obj: any): any => {
  if (obj === null || obj === undefined) return null;
  
  // Keep Firestore FieldValue placeholders untouched
  if (obj && typeof obj === 'object' && obj.constructor) {
    const cName = obj.constructor.name;
    if (cName === 'FieldValue' || cName === 'FieldValueImpl' || 'serverTimestamp' in obj) {
      return obj;
    }
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeForFirestore);
  }
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const key of Object.keys(obj)) {
      if (obj[key] !== undefined) {
        cleaned[key] = sanitizeForFirestore(obj[key]);
      }
    }
    return cleaned;
  }
  return obj;
};

