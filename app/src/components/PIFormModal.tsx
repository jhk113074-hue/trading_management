import React, { useState, useEffect, useRef } from 'react';
import { subscribeCustomCurrencies, handleCurrencySelection, DEFAULT_CURRENCIES } from '../utils/currency';
import { doc, setDoc, getDoc, serverTimestamp, collection, getDocs, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db, COMPANY_ID, storage } from '../firebase';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import type { ProformaInvoice, PIItem, PIRevision } from '../types/pi';
import type { Customer } from '../types/customer';
import type { Product } from '../types/product';
import { generatePIPdf } from '../utils/piPdfGenerator';
import { generatePIExcel } from '../utils/piExcelGenerator';
import { ProductModal } from './ProductModal';
import { ProductSearchModal } from './ProductSearchModal';
import { CustomerSearchModal } from './CustomerSearchModal';
import * as XLSX from 'xlsx';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

import { DateInput } from './ui/DateInput';

const getProductPackingMethods = (product: any): any[] => {
  if (!product) return [{
    id: 'default_injected',
    name: 'Default',
    packageType: '단품',
    unit: 'EA',
    isDefault: true,
    unitWidth: 0, unitLength: 0, unitHeight: 0, unitWeight: 0, unitGrossWeight: 0,
    qtyPerPallet: 1,
    palletWidth: 0, palletLength: 0, palletHeight: 0, palletWeight: 0, palletGrossWeight: 0,
    stackable: 'Y', rotation: 'Y'
  }];
  const list = product.packingMethods ? JSON.parse(JSON.stringify(product.packingMethods)) : [];
  const hasDefault = list.some((m: any) => m.name === 'Default');
  if (!hasDefault) {
    list.unshift({
      id: 'default_injected',
      name: 'Default',
      packageType: '단품',
      unit: product.unit || 'KG',
      isDefault: list.length === 0 || !list.some((m: any) => m.isDefault),
      unitWidth: 0, unitLength: 0, unitHeight: 0, unitWeight: 0, unitGrossWeight: 0,
      qtyPerPallet: 1,
      palletWidth: 0, palletLength: 0, palletHeight: 0, palletWeight: 0, palletGrossWeight: 0,
      stackable: 'Y', rotation: 'Y'
    });
  }
  return list;
};

// 패킹방식 코드명 → 사람이 읽는 형태로 변환
const formatPackingName = (name: string, qtyPerPallet?: number): string => {
  if (!name || name === 'Default') return '단품';
  if (/[가-힣]/.test(name)) return name;
  const lower = name.toLowerCase();
  if (lower.includes('plt') || lower.includes('pallet')) {
    return qtyPerPallet && qtyPerPallet > 1 ? `팔레트 (${qtyPerPallet.toLocaleString()}개)` : '팔레트';
  }
  if (lower.includes('paper bag') || lower.includes('종이포대')) return '종이포대';
  if (lower.includes('drum')) return '드럼';
  if (lower.includes('pail')) return '페일';
  if (lower.includes('bag')) return '백';
  if (lower.includes('box')) return '박스';
  return name;
};

// 렌더링 시 자동 계산값 준비
const autoCalcPalletQty = (quantity: number, selectedMethodId: string | undefined, methods: any[]): number => {
  const method = methods.find((m: any) => m.id === selectedMethodId);
  const qpp = method?.qtyPerPallet || 1;
  if (!quantity || quantity <= 0 || qpp <= 1) return quantity || 0;
  return Math.ceil(quantity / qpp);
};

interface Props {
  initialPI?: ProformaInvoice;
  onClose: () => void;
  currentUser: string;
}

export const PIFormModal: React.FC<Props> = ({ initialPI, onClose, currentUser }) => {
  const [customCurrencies, setCustomCurrencies] = useState<string[]>([]);
  useEffect(() => {
    return subscribeCustomCurrencies(setCustomCurrencies);
  }, []);
  const [savingType, setSavingType] = useState<'normal' | 'revision' | 'deleting' | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);

  // 행별 패킹 상세 펼침 토글 — idx를 key로 사용
  const [expandedPackingRows, setExpandedPackingRows] = useState<Set<number>>(new Set());

  const togglePackingRow = (idx: number) => {
    setExpandedPackingRows(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // AI Prompt Draft Creator States
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [isProdModalOpen, setIsProdModalOpen] = useState(false);
  const [editingProd, setEditingProd] = useState<Product | undefined>(undefined);
  const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
  const [searchItemIndex, setSearchItemIndex] = useState<number | null>(null);
  const [isCustomerSearchOpen, setIsCustomerSearchOpen] = useState(false);

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
      type: 'trade',
      piNumber: '',
      piDate: new Date().toISOString().split('T')[0],
      validityDays: 30,
      validUntilDate: '',
      issuingCompany: 'YSACC',
      customerId: '', customerName: '', customerAddress: '', contactPerson: '', email: '',
      incoterms: '', destinationPort: '', departurePort: 'Busan, Korea',
      packagingSpec: 'Export Standard packing',
      validityDesc: '4weeks from offered date',
      paymentTerms: '', shippingMethod: 'Sea Freight', exchangeRate: 1400.00,
      remarks: '① This is a basic price. Prices are subject to change based on your additional requests.\n② Shipping cost may vary monthly depending on the carrier\'s current conditions.',
      deliveryTerm: '8weeks from payment confirmation', origin: 'KOREA', yourRef: '',
      handlingFee: 0, freightCharges: [], freightTotal: 0, insurance: 0,
      subtotalUsd: 0, extrasUsd: 0, totalUsd: 0, totalKrw: 0,
      status: 'draft', currentVersion: 1, createdByName: (currentUser === 'jhk010624' ? '김하은 사원' : currentUser === 'alexpark' ? '박현 차장' : currentUser === 'jhkim1130' ? '대표이사 김주한' : currentUser),
      attachments: []
    };

    if (initialPI) {
      // Only pick known safe primitive fields from initialPI
      const pi = initialPI as any;
      const safeFields: (keyof ProformaInvoice)[] = [
        'type', 'piNumber', 'piDate', 'validityDays', 'validUntilDate', 'issuingCompany',
        'customerId', 'customerName', 'customerAddress', 'contactPerson', 'email',
        'incoterms', 'destinationPort', 'departurePort',
        'packagingSpec', 'validityDesc', 'paymentTerms', 'shippingMethod',
        'exchangeRate', 'remarks', 'deliveryTerm', 'origin', 'yourRef', 'handlingFee', 'freightTotal', 'insurance',
        'subtotalUsd', 'extrasUsd', 'totalUsd', 'totalKrw',
        'status', 'currentVersion', 'createdByName', 'createdBy', 'attachments', 'containerSimulation'
      ];
      for (const key of safeFields) {
        const val = pi[key];
        if (val !== undefined && val !== null) {
          if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean' || Array.isArray(val) || typeof val === 'object') {
            (defaults as any)[key] = val;
          }
        }
      }
      
      // Force correct creator name mapping if it is raw ID
      if (defaults.createdByName === 'jhk010624') {
        defaults.createdByName = '김하은 사원';
      } else if (defaults.createdByName === 'alexpark') {
        defaults.createdByName = '박현 차장';
      } else if (defaults.createdByName === 'jhkim1130') {
        defaults.createdByName = '대표이사 김주한';
      } else if (!['대표이사 김주한', '박현 차장', '김하은 사원'].includes(defaults.createdByName || '')) {
        defaults.createdByName = '대표이사 김주한';
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

  const [isSimFileUploading, setIsSimFileUploading] = useState(false);
  const [isSimImageUploading, setIsSimImageUploading] = useState(false);

  const handleSimFileUpload = async (file: File) => {
    if (!file) return;
    setIsSimFileUploading(true);
    const piId = initialPI?.id || formData.piNumber || `temp_${Date.now()}`;
    const storageRef = ref(storage, `tasks/${piId}/simulation_file.json`);
    const uploadTask = uploadBytesResumable(storageRef, file);
    uploadTask.on('state_changed', null, 
      (error) => {
        console.error("Simulation file upload failed", error);
        setIsSimFileUploading(false);
      },
      async () => {
        const url = await getDownloadURL(uploadTask.snapshot.ref);
        setFormData(prev => ({
          ...prev,
          containerSimulation: {
            ...(prev.containerSimulation || {}),
            simulationFileUrl: url,
            simulationFileName: file.name
          }
        }));
        setIsSimFileUploading(false);
      }
    );
  };

  const handleSimImageUpload = async (file: File) => {
    if (!file) return;
    setIsSimImageUploading(true);
    const piId = initialPI?.id || formData.piNumber || `temp_${Date.now()}`;
    const storageRef = ref(storage, `tasks/${piId}/simulation_image.jpg`);
    const uploadTask = uploadBytesResumable(storageRef, file);
    uploadTask.on('state_changed', null, 
      (error) => {
        console.error("Simulation image upload failed", error);
        setIsSimImageUploading(false);
      },
      async () => {
        const url = await getDownloadURL(uploadTask.snapshot.ref);
        setFormData(prev => ({
          ...prev,
          containerSimulation: {
            ...(prev.containerSimulation || {}),
            simulationImageUrl: url
          }
        }));
        setIsSimImageUploading(false);
      }
    );
  };

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data && event.data.type === 'CONTAINER_SIMULATION_RESULT') {
        const { data } = event.data;
        
        // Auto-generate a JSON file Blob from projectData and upload to Firestore / Firebase Storage
        const jsonStr = JSON.stringify(data.projectData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const file = new File([blob], `${data.projectData.projectName || 'loading_plan'}.json`, { type: 'application/json' });
        
        // Run file upload function and save the simulationFileUrl
        setIsUploading(true);
        const piId = initialPI?.id || formData.piNumber || `temp_${Date.now()}`;
        const storageRef = ref(storage, `tasks/${piId}/simulation_${Date.now()}.json`);
        try {
          const uploadTask = await uploadBytesResumable(storageRef, file);
          const url = await getDownloadURL(uploadTask.ref);
          
          let imgUrl = '';
          const base64Data = data.simulationImageBase64;
          if (base64Data && base64Data.startsWith('data:image/')) {
            const response = await fetch(base64Data);
            const imageBlob = await response.blob();
            const imageFile = new File([imageBlob], `simulation_screenshot_${Date.now()}.png`, { type: 'image/png' });
            const imgRef = ref(storage, `tasks/${piId}/simulation_image_${Date.now()}.png`);
            const imgUploadTask = await uploadBytesResumable(imgRef, imageFile);
            imgUrl = await getDownloadURL(imgUploadTask.ref);
          }

          setFormData(prev => ({
            ...prev,
            containerSimulation: {
              ...prev.containerSimulation,
              simulationFileUrl: url,
              simulationFileName: file.name,
              ...(imgUrl ? { simulationImageUrl: imgUrl } : {})
            }
          }));
          alert('✅ 3D 적재 시뮬레이션 프로젝트 파일 및 캡처 이미지가 성공적으로 자동 연계 및 유첨되었습니다!');
        } catch (error) {
          console.error("Upload failed", error);
        } finally {
          setIsUploading(false);
        }
      }
    };
    
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [initialPI, formData.piNumber]);


  const isLoadedRef = useRef(false);
  const baselineStateRef = useRef<{ formData: any, items: any } | null>(null);

  // Helper to deep clone state for dirty checking
  const getSnapshot = (fData: any, iList: any) => {
    return JSON.stringify({
      piNumber: fData.piNumber || '',
      piDate: fData.piDate || '',
      validityDays: fData.validityDays || 30,
      issuingCompany: fData.issuingCompany || 'YSACC',
      customerId: fData.customerId || '',
      customerName: fData.customerName || '',
      customerAddress: fData.customerAddress || '',
      contactPerson: fData.contactPerson || '',
      email: fData.email || '',
      incoterms: fData.incoterms || '',
      destinationPort: fData.destinationPort || '',
      departurePort: fData.departurePort || '',
      packagingSpec: fData.packagingSpec || '',
      paymentTerms: fData.paymentTerms || '',
      shippingMethod: fData.shippingMethod || '',
      remarks: fData.remarks || '',
      deliveryTerm: fData.deliveryTerm || '',
      origin: fData.origin || '',
      yourRef: fData.yourRef || '',
      items: iList.map((it: any) => ({
        productCode: it.productCode || '',
        description: it.description || '',
        quantity: it.quantity || 0,
        unit: it.unit || 'KG',
        purchasePriceKrw: it.purchasePriceKrw || 0,
        purchasePriceUsd: it.purchasePriceUsd || 0,
        marginRate: it.marginRate || 15,
        salePriceUsd: it.salePriceUsd || 0,
        lineTotalUsd: it.lineTotalUsd || 0
      }))
    });
  };

  const handleCloseAttempt = async () => {
    if (baselineStateRef.current) {
      const currentSnap = getSnapshot(formData, items);
      if (baselineStateRef.current.formData !== currentSnap) {
        const confirmSave = window.confirm("변경사항이 있습니다. 저장하시겠습니까?\n\n[확인/OK]를 누르면 저장하고 닫으며,\n[취소/Cancel]를 누르면 저장하지 않고 그냥 닫습니다.");
        if (confirmSave) {
          // Attempt to save
          await handleSave(false);
        }
      }
    }
    onClose();
  };

  useEffect(() => {
    // Subscribe to customers in real-time
    const unsubCustomers = onSnapshot(collection(doc(db, "companies", COMPANY_ID), "customers"), (snap) => {
      const loadedCusts = snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer));
      setCustomers(loadedCusts);

      // Self-healing customer details if customerName is empty but customerId exists
      setFormData(prev => {
        if (prev.customerId) {
          const cust = loadedCusts.find(c => c.id === prev.customerId);
          if (cust) {
            const updated = {
              ...prev,
              customerName: prev.customerName || cust.name,
              customerAddress: prev.customerAddress || cust.addressEn || '',
              contactPerson: prev.contactPerson || cust.nameKo || '',
              email: prev.email || cust.email || ''
            };
            if (baselineStateRef.current) {
              baselineStateRef.current.formData = getSnapshot(updated, items);
            }
            return updated;
          }
        }
        return prev;
      });
    });

    // Subscribe to products in real-time
    const unsubProducts = onSnapshot(collection(doc(db, "companies", COMPANY_ID), "products"), (snap) => {
      setProducts(snap.docs.map(d => ({ ...d.data(), id: d.id } as Product)));
    });

    if (initialPI) {
      // If we have already loaded the data for this modal session, do not re-load on subsequent prop updates
      if (isLoadedRef.current) {
        return () => {
          unsubProducts();
          unsubCustomers();
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
              let loadedItems = liSnap.docs.map(d => d.data() as PIItem).sort((a,b) => (Number(a.lineNumber) || 0) - (Number(b.lineNumber) || 0));
              
              // Fallback to items array if subcollection is empty
              if (loadedItems.length === 0 && Array.isArray(latestRevData.items)) {
                loadedItems = (latestRevData.items as any[]).sort((a,b) => (Number(a.lineNumber) || 0) - (Number(b.lineNumber) || 0));
              }
              setItems(loadedItems);

              // Load special custom values from the latest revision
              setFormData(prev => {
                const updatedFormData = {
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
                  attachments: latestRevData.attachments !== undefined ? latestRevData.attachments : (prev.attachments || []),
                  currentVersion: latestRevData.version !== undefined ? latestRevData.version : prev.currentVersion
                };

                baselineStateRef.current = {
                  formData: getSnapshot(updatedFormData, loadedItems),
                  items: true
                };

                return updatedFormData;
              });
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
        setFormData(prev => {
          const initialForm = {
            ...prev,
            piNumber: `PI-YSACC-${yy}-TBD`
          };
          baselineStateRef.current = {
            formData: getSnapshot(initialForm, []),
            items: true
          };
          return initialForm;
        });
        isLoadedRef.current = true;
      }
    }

    return () => {
      unsubProducts();
      unsubCustomers();
    };
  }, [initialPI, currentUser]);

  // Auto-format productCode and update unit in items when products list is loaded/updated
  useEffect(() => {
    if (products.length > 0 && items.length > 0) {
      let changed = false;
      const formattedItems = items.map(item => {
        const rawCode = getRawProductCode(item.productCode);
        const p = products.find(prod => prod.productCode === rawCode);
        if (p) {
          const displayName = p.nameEn || p.nameKo || '';
          const formatted = `[${p.productCode}] ${displayName}`;
          const latestDesc = displayName;
          
          // Sync unit with the active packing method
          const methods = getProductPackingMethods(p);
          const activeMethod = methods.find(m => m.id === item.selectedPackingMethodId) || methods.find(m => m.isDefault) || methods[0];
          const latestUnit = activeMethod ? (activeMethod.unit || p.unit || 'KG').toUpperCase() : (p.unit || 'KG').toUpperCase();

          if (item.productCode !== formatted || item.description !== latestDesc || item.unit !== latestUnit) {
            changed = true;
            return { 
              ...item, 
              productCode: formatted, 
              description: latestDesc,
              unit: latestUnit
            };
          }
        }
        return item;
      });
      if (changed) {
        setItems(formattedItems);
        if (baselineStateRef.current) {
          baselineStateRef.current.formData = getSnapshot(formData, formattedItems);
        }
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
    items.forEach(it => { subUsd += ((it.salePriceUsd || 0) * (it.quantity || 0)); });
    
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



  const handleAiDraftCreate = async () => {
    if (!aiPrompt || !aiPrompt.trim()) {
      alert("AI 초안으로 작성할 견적 내용을 프롬프트 창에 입력해 주세요.");
      return;
    }

    setIsGeneratingDraft(true);
    try {
      // 1. Check if prompt refers to an existing PI number (e.g. PI-YS-2026-03R1)
      const piMatch = aiPrompt.match(/(PI-[A-Za-z0-9-]+)/);
      if (piMatch) {
        const targetPiNum = piMatch[1].toUpperCase().trim();
        const normalizedTarget = targetPiNum.replace(/R\d+$/, "");
        
        // Fetch all proforma invoices
        const snap = await getDocs(collection(doc(db, "companies", COMPANY_ID), "proforma_invoices"));
        const targetDoc = snap.docs.find(d => {
          const num = d.data().piNumber;
          if (!num) return false;
          const cleanNum = num.toUpperCase().trim();
          return cleanNum === targetPiNum || cleanNum === normalizedTarget;
        });

        if (targetDoc) {
          const piData = targetDoc.data();
          
          // Load latest revision for this document
          const revSnap = await getDocs(collection(doc(db, "companies", COMPANY_ID, "proforma_invoices", targetDoc.id), "revisions"));
          if (!revSnap.empty) {
            const revList = revSnap.docs.map(d => {
              const data = d.data() as any;
              return {
                id: d.id,
                ...data,
                createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date()
              };
            }).sort((a: any, b: any) => (b.version || 0) - (a.version || 0));

            const latestRevData = revList[0];
            const latestRevDoc = revSnap.docs.find(d => d.id === latestRevData.id);
            
            if (latestRevDoc) {
              // Load line items for this revision
              const liSnap = await getDocs(collection(latestRevDoc.ref, "line_items"));
              let loadedItems = liSnap.docs.map(d => d.data() as PIItem).sort((a,b) => (Number(a.lineNumber) || 0) - (Number(b.lineNumber) || 0));
              if (loadedItems.length === 0 && Array.isArray(latestRevData.items)) {
                loadedItems = (latestRevData.items as any[]).sort((a,b) => (Number(a.lineNumber) || 0) - (Number(b.lineNumber) || 0));
              }

              // Update customer info & trade terms
              setFormData(prev => ({
                ...prev,
                customerId: piData.customerId || prev.customerId,
                customerName: piData.customerName || prev.customerName,
                customerAddress: latestRevData.customerAddress || piData.customerAddress || prev.customerAddress,
                contactPerson: piData.contactPerson || prev.contactPerson,
                email: piData.email || prev.email,
                exchangeRate: latestRevData.exchangeRate !== undefined ? latestRevData.exchangeRate : prev.exchangeRate,
                remarks: latestRevData.remarks !== undefined ? latestRevData.remarks : prev.remarks,
                incoterms: latestRevData.incoterms !== undefined ? latestRevData.incoterms : prev.incoterms,
                destinationPort: latestRevData.destinationPort !== undefined ? latestRevData.destinationPort : prev.destinationPort,
                paymentTerms: latestRevData.paymentTerms !== undefined ? latestRevData.paymentTerms : prev.paymentTerms,
                shippingMethod: latestRevData.shippingMethod !== undefined ? latestRevData.shippingMethod : prev.shippingMethod,
                packagingSpec: latestRevData.packagingSpec !== undefined ? latestRevData.packagingSpec : prev.packagingSpec,
                deliveryTerm: latestRevData.deliveryTerm !== undefined ? latestRevData.deliveryTerm : prev.deliveryTerm,
                origin: latestRevData.origin !== undefined ? latestRevData.origin : prev.origin,
                yourRef: latestRevData.yourRef !== undefined ? latestRevData.yourRef : prev.yourRef,
              }));

              setItems(loadedItems);
              setIsGeneratingDraft(false);
              alert(`AI가 요청하신 기존 견적서(${targetPiNum})의 거래 조건과 상품 라인 데이터를 성공적으로 찾아 복사해 왔습니다!`);
              return;
            }
          }
        }
      }

      // 2. Smart Customer Matching
      const cleanPromptLower = aiPrompt.toLowerCase().replace(/^[a-z]\b/, '').trim();
      let matchedCustomer: Customer | undefined = undefined;
      
      let maxMatchLen = 0;
      for (const cust of customers) {
        const cNameKo = (cust.nameKo || '').toLowerCase();
        const cNameEn = (cust.name || '').toLowerCase();

        if (cNameKo && cleanPromptLower.includes(cNameKo)) {
          if (cNameKo.length > maxMatchLen) {
            matchedCustomer = cust;
            maxMatchLen = cNameKo.length;
          }
        }
        if (cNameEn && cleanPromptLower.includes(cNameEn)) {
          if (cNameEn.length > maxMatchLen) {
            matchedCustomer = cust;
            maxMatchLen = cNameEn.length;
          }
        }
        const enWords = cNameEn.split(/[\s,._()-]+/).filter((w: string) => w.length >= 3 && !['inc', 'ltd', 'corp', 'co', 'the', 'and', 'fai'].includes(w));
        for (const w of enWords) {
          if (cleanPromptLower.includes(w) && w.length > maxMatchLen) {
            matchedCustomer = cust;
            maxMatchLen = w.length;
          }
        }
        const koWords = cNameKo.split(/[\s,._()-]+/).filter((w: string) => w.length >= 2 && !['(주)', '주식회사', '상사', '무역'].includes(w));
        for (const w of koWords) {
          if (cleanPromptLower.includes(w) && w.length > maxMatchLen) {
            matchedCustomer = cust;
            maxMatchLen = w.length;
          }
        }
      }

      if (!matchedCustomer && customers.length > 0) {
        matchedCustomer = customers[0];
      }

      if (matchedCustomer) {
        setFormData(prev => ({
          ...prev,
          customerId: matchedCustomer!.id,
          customerName: matchedCustomer!.name,
          customerAddress: matchedCustomer!.addressEn || '',
          contactPerson: matchedCustomer!.representative || '',
          email: matchedCustomer!.email || '',
          paymentTerms: aiPrompt.includes("LC") || aiPrompt.includes("신용장") ? "Usance LC 30days" : "100% T/T in advance",
          incoterms: aiPrompt.includes("CIF") ? "CIF" : (aiPrompt.includes("DDP") ? "DDP" : "FOB")
        }));
      }

      // 3. Extract Product Keywords & Search Master Products + Firestore Order/PI History
      const stopWords = [
        '올해', '구매한', '까지', '에서', '모든', '를', '을', '가', '이', '은', '는', '1개씩', '개씩', '개',
        '리스트업해주세요', '리스트업', '견적서', '작성해줘', '해줘', '견적', '마진', '마진율', '세팅', '작성',
        '초안', '생성', '해봐', '줘', '부탁해', '요청', '바이어', '상품', '제품', '품목', '내역', '리스트'
      ];
      
      const rawTokens = cleanPromptLower.split(/[\s,._()/-]+/).filter(t => t.length >= 2);
      const productKeywords = rawTokens.filter(t => !stopWords.includes(t) && !matchedCustomer?.name?.toLowerCase().includes(t));

      let defaultQty = 1;
      const isEachOne = cleanPromptLower.includes("1개씩") || cleanPromptLower.includes("1개") || cleanPromptLower.includes("각 1개") || cleanPromptLower.includes("각1개");
      if (!isEachOne) {
        const qtyNumMatch = aiPrompt.match(/(\d+[\d,]*)\s*(개|ea|pcs)/i);
        if (qtyNumMatch) {
          defaultQty = parseInt(qtyNumMatch[1].replace(/,/g, ''), 10) || 1;
        }
      }

      let marginRate = 15;
      const marginMatch = aiPrompt.match(/(마진|margin)\s*(\d+)/i);
      if (marginMatch) marginRate = parseInt(marginMatch[2], 10);

      const candidateItemsMap = new Map<string, { productCode: string; name: string; spec: string; priceKrw: number; priceUsd: number; unit: string; productObj?: Product }>();

      // A) Query Master Products
      for (const p of products) {
        const pNameKo = (p.nameKo || '').toLowerCase();
        const pNameEn = (p.nameEn || '').toLowerCase();
        const pCode = (p.productCode || '').toLowerCase();
        const pSpec = (p.spec || '').toLowerCase();
        const pDesc = (p.description || '').toLowerCase();

        let isMatch = false;
        if (productKeywords.length > 0) {
          isMatch = productKeywords.some(kw => pNameKo.includes(kw) || pNameEn.includes(kw) || pCode.includes(kw) || pSpec.includes(kw) || pDesc.includes(kw));
        }

        if (isMatch) {
          const key = p.productCode || p.id;
          candidateItemsMap.set(key, {
            productCode: p.productCode,
            name: p.nameEn || p.nameKo,
            spec: p.spec || '',
            priceKrw: p.currency === 'KRW' ? (p.purchasePrice || 0) : 0,
            priceUsd: p.currency !== 'KRW' ? (p.purchasePrice || 0) : 0,
            unit: (p.unit || 'EA').toUpperCase(),
            productObj: p
          });
        }
      }

      // B) Query Firestore Orders & PIs for matched customer history
      if (matchedCustomer) {
        try {
          const ordersSnap = await getDocs(collection(doc(db, "companies", COMPANY_ID), "orders"));
          ordersSnap.docs.forEach(docSnap => {
            const data = docSnap.data();
            const cName = (data.customerName || '').toLowerCase();
            const cId = data.customerId;
            const isCustMatch = cId === matchedCustomer!.id || (matchedCustomer!.name && cName.includes(matchedCustomer!.name.toLowerCase()));

            if (isCustMatch && Array.isArray(data.items)) {
              data.items.forEach((it: any) => {
                const itemName = (it.name || it.productName || '').toLowerCase();
                const itemSpec = (it.spec || '').toLowerCase();
                
                const isKwMatch = productKeywords.length === 0 || productKeywords.some(kw => itemName.includes(kw) || itemSpec.includes(kw));
                if (isKwMatch && (it.name || it.productName)) {
                  const key = it.productCode || it.itemId || it.name;
                  if (!candidateItemsMap.has(key)) {
                    candidateItemsMap.set(key, {
                      productCode: it.productCode || 'P-HIST',
                      name: it.name || it.productName,
                      spec: it.spec || '',
                      priceKrw: it.purchaseUnitPriceKrw || 0,
                      priceUsd: it.purchaseUnitPrice || it.unitPrice || 0,
                      unit: (it.unit || 'EA').toUpperCase(),
                    });
                  }
                }
              });
            }
          });
        } catch (err) {
          console.warn("Could not query orders for AI draft:", err);
        }
      }

      const newItems: PIItem[] = [];
      let lineNum = 1;

      const addCalculatedItemFromCandidate = (cand: { productCode: string; name: string; spec: string; priceKrw: number; priceUsd: number; unit: string; productObj?: Product }, qty: number, line: number) => {
        const displayName = cand.name;
        const itemCode = cand.productCode.startsWith('[') ? cand.productCode : `[${cand.productCode}] ${displayName}`;
        const pKrw = cand.priceKrw;
        const pUsd = cand.priceUsd;
        const exRate = formData.exchangeRate || 1400;

        let rawSalePrice = 0;
        if (pKrw > 0) {
          rawSalePrice = pKrw / exRate / (1 - marginRate / 100);
        } else if (pUsd > 0) {
          rawSalePrice = pUsd / (1 - marginRate / 100);
        } else {
          rawSalePrice = 1.0;
        }

        const digits = 2;
        const salePrice = ceilValue(rawSalePrice, digits);
        const lineTotal = salePrice * qty;

        const it: PIItem = {
          lineNumber: line,
          productCode: itemCode,
          productName: displayName,
          spec: cand.spec || '',
          description: displayName,
          quantity: qty,
          unit: cand.unit,
          purchasePriceKrw: pKrw,
          purchasePriceUsd: pUsd,
          exchangeRate: exRate,
          marginRate: marginRate,
          salePriceUsd: salePrice,
          lineTotalUsd: lineTotal,
          roundDigits: digits,
          palletQty: qty,
          remarks: ''
        };

        if (cand.productObj) {
          const methods = getProductPackingMethods(cand.productObj);
          const defaultMethod = methods.find((m: any) => m.isDefault) || methods[0];
          if (defaultMethod) {
            it.selectedPackingMethodId = defaultMethod.id;
            if (defaultMethod.unit) it.unit = defaultMethod.unit;
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
              it.palletQty = parseFloat((qty / defaultMethod.qtyPerPallet).toFixed(2));
            }
          }
        }
        return it;
      };

      candidateItemsMap.forEach((cand) => {
        newItems.push(addCalculatedItemFromCandidate(cand, defaultQty, lineNum++));
      });

      if (newItems.length === 0) {
        const boltProd = products.find(p => p.productCode === 'P0103' || p.nameEn.toLowerCase().includes("bolt")) || products[0];
        const nutProd = products.find(p => p.productCode === 'P0101' || p.nameEn.toLowerCase().includes("nut")) || products[1];
        if (boltProd) newItems.push(addCalculatedItemFromCandidate({
          productCode: boltProd.productCode, name: boltProd.nameEn || boltProd.nameKo, spec: boltProd.spec || '', priceKrw: boltProd.purchasePrice || 0, priceUsd: 0, unit: boltProd.unit || 'EA', productObj: boltProd
        }, 5000, lineNum++));
        if (nutProd) newItems.push(addCalculatedItemFromCandidate({
          productCode: nutProd.productCode, name: nutProd.nameEn || nutProd.nameKo, spec: nutProd.spec || '', priceKrw: nutProd.purchasePrice || 0, priceUsd: 0, unit: nutProd.unit || 'EA', productObj: nutProd
        }, 3000, lineNum++));
      }

      setItems(newItems);
      setIsGeneratingDraft(false);
      
      const custMsg = matchedCustomer ? matchedCustomer.name : '기본 거래처';
      const itemMsg = newItems.length > 0 ? `${newItems.length}개 품목` : '기본 품목';
      alert(`AI 분석 및 DB 검색 완료!\n• 바이어: ${custMsg}\n• 검색/구성된 품목: ${itemMsg}\n• 설정 마진율: ${marginRate}%`);
    } catch (error) {
      console.error(error);
      setIsGeneratingDraft(false);
      alert("AI 견적 처리 중 오류가 발생했습니다.");
    }
  };

  const addItem = () => {
    setItems(prev => [...prev, {
      lineNumber: prev.length + 1,
      productCode: '', description: '', quantity: 0, unit: 'EA',
      purchasePriceKrw: 0, exchangeRate: formData.exchangeRate || 1400,
      purchasePriceUsd: 0, marginRate: 15, salePriceUsd: 0, lineTotalUsd: 0,
      palletQty: 1, remarks: '', roundDigits: 2,
      selectedPackingMethodId: 'default_injected'
    }]);
  };

  const downloadLineItemsTemplate = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('LineItems');

    // Page view setup
    (worksheet.views as any) = [
      { state: 'pageBreakPreview', style: 'pageBreakPreview', showGridLines: true }
    ];

    // Define columns A to P (16 columns)
    worksheet.columns = [
      { header: '상품코드 (Product Code)', key: 'productCode', width: 14 },
      { header: '품목명 (Product Name)', key: 'productName', width: 28 },
      { header: '규격 (Spec)', key: 'spec', width: 28 },
      { header: '패킹방식 (Packing Method)', key: 'packingMethod', width: 22 },
      { header: '수량 (Quantity)', key: 'quantity', width: 12 },
      { header: '단위 (Unit)', key: 'unit', width: 8 },
      { header: '매입통화 (Currency)', key: 'currency', width: 12 },
      { header: '매입단가 (Purchase Price)', key: 'purchasePrice', width: 14 },
      { header: '환율 (Exchange Rate)', key: 'exchangeRate', width: 10 },
      { header: '마진율 (%) (Margin Rate)', key: 'marginRate', width: 14 },
      { header: '올림자릿수 (Round Digits)', key: 'roundDigits', width: 12 },
      { header: '판매단가 ($) (Sale Price USD)', key: 'salePriceUsd', width: 16 },
      { header: '총액 ($) (Total USD)', key: 'lineTotalUsd', width: 16 },
      { header: '예상이익 ($) (Profit USD)', key: 'profitUsd', width: 16 },
      { header: '매입처 (Supplier)', key: 'supplierName', width: 18 },
      { header: '비고 (Remarks)', key: 'remarks', width: 18 },
    ];

    // Style Header Row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { name: '맑은 고딕', bold: true, size: 9.5, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 24;

    let itemsToProcess = items;
    if (!itemsToProcess || itemsToProcess.length === 0) {
      itemsToProcess = [
        {
          productCode: 'P0053',
          productName: '25mm Insulation Skin Cover',
          spec: '(1x1m, Wall, 1.2T, ABS+ASA)',
          selectedPackingMethodId: 'PM-1780928086155',
          quantity: 2800,
          unit: 'EA',
          purchasePriceKrw: 9320,
          purchasePriceUsd: 0,
          exchangeRate: 1350,
          marginRate: 10,
          roundDigits: 1,
          salePriceUsd: 7.70,
          lineTotalUsd: 21560.00,
          supplierName: '주식회사 정도',
          remarks: ''
        } as any,
        {
          productCode: 'P0151',
          productName: '25mm Insulation Skin Cover',
          spec: '(1x0.5m, Wall, 1.2T, ABS+ASA)',
          selectedPackingMethodId: 'default_7oxqk7ql4',
          quantity: 3000,
          unit: 'EA',
          purchasePriceKrw: 6220,
          purchasePriceUsd: 0,
          exchangeRate: 1350,
          marginRate: 10,
          roundDigits: 1,
          salePriceUsd: 5.20,
          lineTotalUsd: 15600.00,
          supplierName: '주식회사 정도',
          remarks: ''
        } as any
      ];
    }

    itemsToProcess.forEach((it, idx) => {
      const r = idx + 2; // Excel row index starting at row 2
      const rawCode = getRawProductCode(it.productCode);
      const currency = (it.purchasePriceKrw && it.purchasePriceKrw > 0) ? 'KRW' : (it.purchasePriceCurrency || 'KRW');
      const price = (it.purchasePriceKrw && it.purchasePriceKrw > 0) ? it.purchasePriceKrw : (it.purchasePriceUsd || 0);
      const exRate = it.exchangeRate || formData.exchangeRate || 1400;
      const matchedProd = products.find(p => p.productCode === rawCode || p.id === rawCode);
      const prodName = it.productName || matchedProd?.nameEn || matchedProd?.nameKo || rawCode;
      const spec = it.spec || it.description || matchedProd?.spec || '';
      const supplierName = it.supplierName || matchedProd?.supplierName || (matchedProd as any)?.supplier || '';

      const costUsd = currency === 'KRW' ? (price / exRate) : price;
      const totalCostUsd = costUsd * (it.quantity || 0);
      const initialSalePrice = it.salePriceUsd || 0;
      const initialLineTotal = it.lineTotalUsd || (initialSalePrice * (it.quantity || 0));
      const initialProfit = initialLineTotal - totalCostUsd;

      const row = worksheet.getRow(r);
      row.getCell(1).value = rawCode; // A
      row.getCell(2).value = prodName; // B
      row.getCell(3).value = spec; // C
      row.getCell(4).value = it.selectedPackingMethodId || 'Default'; // D
      row.getCell(5).value = it.quantity || 0; // E (수량)
      row.getCell(6).value = it.unit || 'EA'; // F
      row.getCell(7).value = currency; // G
      row.getCell(8).value = price; // H (매입단가)
      row.getCell(9).value = exRate; // I (환율)
      row.getCell(10).value = it.marginRate !== undefined ? it.marginRate : 10; // J (마진율 %)
      row.getCell(11).value = it.roundDigits !== undefined ? it.roundDigits : 1; // K (올림자릿수)

      // Col L: 판매단가 ($) = `=ROUNDUP(H2/I2/(1-J2%),K2)`
      row.getCell(12).value = {
        formula: `ROUNDUP(H${r}/I${r}/(1-J${r}%),K${r})`,
        result: initialSalePrice
      };
      row.getCell(12).numFmt = '"$"#,##0.00';

      // Col M: 총액 ($) = `=E2*L2`
      row.getCell(13).value = {
        formula: `E${r}*L${r}`,
        result: initialLineTotal
      };
      row.getCell(13).numFmt = '"$"#,##0.00';

      // Col N: 예상이익 ($) = `=M${r}-(H${r}/I${r}*E${r})`
      row.getCell(14).value = {
        formula: `M${r}-(H${r}/I${r}*E${r})`,
        result: parseFloat(initialProfit.toFixed(2))
      };
      row.getCell(14).numFmt = '"$"#,##0.00';

      row.getCell(15).value = supplierName; // O (매입처)
      row.getCell(16).value = it.remarks || ''; // P (비고)

      // Cell formatting
      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(5).numFmt = '#,##0';
      row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(8).numFmt = '#,##0';
      row.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(9).numFmt = '#,##0';
      row.getCell(10).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(11).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(12).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(13).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(14).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(15).alignment = { horizontal: 'center', vertical: 'middle' };

      for (let c = 1; c <= 16; c++) {
        row.getCell(c).border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
        };
      }

      row.height = 20;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, "견적서_상품라인_양식.xlsx");
  };

  const importLineItemsExcel = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(firstSheet) as any[];

        if (json.length === 0) {
          alert('가져올 데이터가 없습니다.');
          return;
        }

        const parsedItems: PIItem[] = json.map((row, idx) => {
          const rawCode = String(row['상품코드 (Product Code)'] || row['상품코드'] || '').trim();
          const productNameInput = String(row['품목명 (Product Name)'] || row['품목명'] || '').trim();
          const specInput = String(row['규격 (Spec)'] || row['규격'] || '').trim();
          const packingMethodInput = String(row['패킹방식 (Packing Method)'] || row['패킹방식'] || '').trim();
          const quantity = parseFloat(row['수량 (Quantity)'] || row['수량']) || 0;
          const unit = String(row['단위 (Unit)'] || row['단위'] || 'EA').trim().toUpperCase();
          const currency = String(row['매입통화 (Currency)'] || row['매입통화'] || 'KRW').trim().toUpperCase();
          const purchasePrice = parseFloat(row['매입단가 (Purchase Price)'] || row['매입단가']) || 0;
          const exRateInput = parseFloat(row['환율 (Exchange Rate)'] || row['환율']);
          const marginRateVal = row['마진율 (%) (Margin Rate)'] !== undefined ? row['마진율 (%) (Margin Rate)'] : row['마진율'];
          const marginRate = parseFloat(marginRateVal) !== undefined && !isNaN(parseFloat(marginRateVal)) ? parseFloat(marginRateVal) : 15;
          const roundDigitsVal = row['올림자릿수 (Round Digits)'] !== undefined ? row['올림자릿수 (Round Digits)'] : row['올림자릿수'];
          const roundDigits = parseFloat(roundDigitsVal) !== undefined && !isNaN(parseFloat(roundDigitsVal)) ? parseFloat(roundDigitsVal) : 2;
          const supplierNameInput = String(row['매입처 (Supplier)'] || row['매입처'] || '').trim();
          const remarks = String(row['비고 (Remarks)'] || row['비고'] || '').trim();

          const purchasePriceKrw = currency === 'KRW' ? purchasePrice : 0;
          const purchasePriceUsd = currency !== 'KRW' ? purchasePrice : 0;

          const p = products.find(prod => prod.productCode === rawCode || prod.id === rawCode);
          let displayName = productNameInput || rawCode;
          let spec = specInput;
          let unitToUse = unit;
          let selectedPackingMethodId = packingMethodInput || 'default_injected';
          let packingSpecOverride: any = undefined;

          if (p) {
            if (!productNameInput) displayName = p.nameEn || p.nameKo || '';
            if (!specInput) spec = p.spec || '';
            unitToUse = p.unit || unit;
            
            const methods = getProductPackingMethods(p);
            const matchedMethod = methods.find((m: any) => m.id === packingMethodInput || m.packageType === packingMethodInput);
            const defaultMethod = matchedMethod || methods.find((m: any) => m.isDefault) || methods[0];
            if (defaultMethod) {
              selectedPackingMethodId = defaultMethod.id;
              if (defaultMethod.unit) {
                unitToUse = defaultMethod.unit;
              }
              const isPallet = defaultMethod.packageType?.includes('Pallet') || defaultMethod.packageType?.endsWith('+ Pallet');
              packingSpecOverride = {
                packageType: defaultMethod.packageType,
                qtyPerPallet: defaultMethod.qtyPerPallet || 0,
                specWidth: isPallet ? (defaultMethod.palletWidth || defaultMethod.unitWidth || 0) : (defaultMethod.unitWidth || 0),
                specLength: isPallet ? (defaultMethod.palletLength || defaultMethod.unitLength || 0) : (defaultMethod.unitLength || 0),
                specHeight: isPallet ? (defaultMethod.palletHeight || defaultMethod.unitHeight || 0) : (defaultMethod.unitHeight || 0),
                weight: isPallet ? (defaultMethod.palletWeight || defaultMethod.unitWeight || 0) : (defaultMethod.unitWeight || 0),
                grossWeight: isPallet ? (defaultMethod.palletGrossWeight || defaultMethod.unitGrossWeight || 0) : (defaultMethod.unitGrossWeight || defaultMethod.unitWeight || 0),
              };
            }
          }

          let rawSalePrice = 0;
          const rate = exRateInput || formData.exchangeRate || 1400;
          if (purchasePriceKrw > 0) {
            rawSalePrice = purchasePriceKrw / rate / (1 - marginRate / 100);
          } else {
            rawSalePrice = purchasePriceUsd / (1 - marginRate / 100);
          }

          const salePriceUsd = ceilValue(rawSalePrice, roundDigits);
          const lineTotalUsd = salePriceUsd * quantity;

          let palletQty = 1;
          if (packingSpecOverride) {
            const qpp = packingSpecOverride.qtyPerPallet;
            if (qpp && qpp > 0) {
              palletQty = parseFloat((quantity / qpp).toFixed(2));
            } else {
              palletQty = quantity;
            }
          } else if (p) {
            if (p.qtyPerPallet && p.qtyPerPallet > 0) {
              palletQty = parseFloat((quantity / p.qtyPerPallet).toFixed(2));
            } else if (p.weight && p.weight > 0) {
              palletQty = parseFloat((quantity / p.weight).toFixed(2));
            } else {
              palletQty = quantity;
            }
          } else {
            palletQty = quantity;
          }

          return {
            lineNumber: idx + 1,
            productCode: p ? `[${p.productCode}] ${displayName}` : rawCode,
            productName: displayName,
            supplierName: supplierNameInput || (p?.supplierName || (p as any)?.supplier || ''),
            spec,
            description: displayName,
            quantity,
            unit: unitToUse,
            purchasePriceKrw,
            purchasePriceUsd,
            exchangeRate: rate,
            marginRate,
            salePriceUsd,
            lineTotalUsd,
            palletQty,
            remarks,
            roundDigits,
            selectedPackingMethodId,
            packingSpecOverride
          };
        });

        setItems(parsedItems);
        alert(`성공적으로 ${parsedItems.length}개의 상품 라인을 업로드했습니다.`);
      } catch (err) {
        console.error(err);
        alert('엑셀 파일 분석 중 오류가 발생했습니다. 양식을 확인해주세요.');
      }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
  };

  const updateItem = (index: number, fieldOrUpdates: keyof PIItem | Partial<PIItem>, value?: any) => {
    const newItems = [...items];
    let it = { ...newItems[index] };
    
    let isSingleField = false;
    let singleField: keyof PIItem | undefined;
    let singleValue: any;

    if (typeof fieldOrUpdates === 'string') {
      isSingleField = true;
      singleField = fieldOrUpdates as keyof PIItem;
      singleValue = value;
      (it as any)[singleField] = value;
    } else {
      Object.assign(it, fieldOrUpdates);
    }

    const hasField = (f: keyof PIItem) => {
      if (isSingleField) return singleField === f;
      return f in (fieldOrUpdates as object);
    };

    const getFieldValue = (f: keyof PIItem) => {
      if (isSingleField && singleField === f) return singleValue;
      return (it as any)[f];
    };

    // Zero out other purchase price when one is entered
    if (hasField('purchasePriceKrw') && parseFloat(getFieldValue('purchasePriceKrw')) > 0) {
      it.purchasePriceUsd = 0;
    } else if (hasField('purchasePriceUsd') && parseFloat(getFieldValue('purchasePriceUsd')) > 0) {
      it.purchasePriceKrw = 0;
    }

    // Auto calculate from palletQty
    if (hasField('palletQty')) {
      const p = products.find(prod => prod.productCode === getRawProductCode(it.productCode));
      let qpp = 0;
      if (it.packingSpecOverride) {
        qpp = it.packingSpecOverride.qtyPerPallet;
      } else if (p) {
        qpp = p.qtyPerPallet || p.weight || 0;
      }
      const numVal = parseFloat(getFieldValue('palletQty')) || 0;
      if (qpp > 0) {
        it.quantity = numVal * qpp;
      } else {
        it.quantity = numVal;
      }
    }

    // Auto calculate
    if (hasField('productCode')) {
      const productCodeVal = getFieldValue('productCode');
      const parsedCode = getRawProductCode(productCodeVal);
      const p = products.find(prod => prod.productCode === parsedCode);
      if (p) {
        const displayName = p.nameEn || p.nameKo || '';
        it.productCode = `[${p.productCode}] ${displayName}`;
        it.productName = displayName;
        it.spec = p.spec || '';
        it.description = displayName;
        it.unit = (p.unit || 'KG').toUpperCase();
        // Assuming purchase price is in KRW or USD
        if (p.currency === 'KRW') {
          it.purchasePriceKrw = p.purchasePrice || 0;
          it.purchasePriceUsd = 0;
        } else {
          it.purchasePriceUsd = p.purchasePrice || 0;
          it.purchasePriceKrw = 0;
        }
        
        // Auto select default packing method if exists
        const methods = getProductPackingMethods(p);
        const existingMethod = methods.find((m: any) => m.id === it.selectedPackingMethodId);
        const defaultMethod = methods.find((m: any) => m.isDefault) || methods[0];
        
        if (existingMethod) {
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
          if (p.qtyPerPallet && p.qtyPerPallet > 0) {
            it.quantity = (it.palletQty || 1) * p.qtyPerPallet;
          } else if (p.weight && p.weight > 0) {
            it.quantity = (it.palletQty || 1) * p.weight;
          } else {
            it.quantity = it.quantity || 0;
          }
        }
      } else {
        it.productName = productCodeVal || '';
        it.description = productCodeVal || '';
        if (!it.unit) {
          it.unit = 'EA';
        }
        it.selectedPackingMethodId = 'default_injected';
        it.packingSpecOverride = undefined;
      }
    }

    if (hasField('selectedPackingMethodId')) {
      const packingMethodIdVal = getFieldValue('selectedPackingMethodId');
      const p = products.find(prod => prod.productCode === getRawProductCode(it.productCode));
      const methods = getProductPackingMethods(p);
      if (p && methods.length > 0) {
        const method = methods.find((m: any) => m.id === packingMethodIdVal);
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

    if (hasField('productCode') || hasField('marginRate') || hasField('purchasePriceKrw') || hasField('purchasePriceUsd') || hasField('exchangeRate') || hasField('roundDigits')) {
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

    if (hasField('productCode') || hasField('salePriceUsd') || hasField('quantity') || hasField('marginRate') || hasField('purchasePriceKrw') || hasField('purchasePriceUsd') || hasField('exchangeRate') || hasField('roundDigits') || hasField('palletQty')) {
      it.lineTotalUsd = (it.salePriceUsd || 0) * (it.quantity || 0);
      
      // Auto calculate palletQty when quantity changes
      if (hasField('quantity')) {
        const qtyVal = getFieldValue('quantity');
        const p = products.find(prod => prod.productCode === getRawProductCode(it.productCode));
        if (it.packingSpecOverride) {
          const qpp = it.packingSpecOverride.qtyPerPallet;
          if (qpp && qpp > 0) {
            it.palletQty = parseFloat((qtyVal / qpp).toFixed(2));
          } else {
            it.palletQty = qtyVal;
          }
        } else if (p) {
          if (p.qtyPerPallet && p.qtyPerPallet > 0) {
            it.palletQty = parseFloat((qtyVal / p.qtyPerPallet).toFixed(2));
          } else if (p.weight && p.weight > 0) {
            it.palletQty = parseFloat((qtyVal / p.weight).toFixed(2));
          } else {
            it.palletQty = qtyVal;
          }
        } else {
          it.palletQty = qtyVal;
        }
      }
    }

    newItems[index] = it;
    setItems(newItems);
  };


  const copyItem = (index: number) => {
    const targetItem = items[index];
    if (!targetItem) return;
    const newItem: PIItem = JSON.parse(JSON.stringify(targetItem));
    const newItems = [...items];
    newItems.splice(index + 1, 0, newItem);
    newItems.forEach((it, i) => {
      it.lineNumber = i + 1;
    });
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    // Re-assign line numbers
    newItems.forEach((it, i) => it.lineNumber = i + 1);
    setItems(newItems);
  };

  const draggedItemIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);



  const handleDragStart = (e: React.DragEvent, index: number) => {
    draggedItemIndexRef.current = index;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    const sourceIndex = draggedItemIndexRef.current;
    if (sourceIndex === null || sourceIndex === targetIndex) return;

    const newItems = [...items];
    const [movedItem] = newItems.splice(sourceIndex, 1);
    newItems.splice(targetIndex, 0, movedItem);
    newItems.forEach((it, i) => it.lineNumber = i + 1);
    setItems(newItems);
    draggedItemIndexRef.current = null;
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


  const CompactComboSelect = ({ label, field, options, placeholder = '', required = false }: any) => {
    const value = (formData as any)[field] || '';
    const [isNewMode, setIsNewMode] = useState(false);
    const [newVal, setNewVal] = useState('');
    const selectStyle: React.CSSProperties = {
      padding: '4px 8px',
      border: '1px solid #cbd5e1',
      borderRadius: '4px',
      fontSize: '13.5px',
      color: '#1e293b',
      height: '34px',
      boxSizing: 'border-box',
      background: '#fff',
      width: '100%',
      outline: 'none',
      cursor: 'pointer',
      fontWeight: required ? 600 : 500
    };

    if (isNewMode) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.04em', textTransform: 'uppercase' }} title={label}>
            {label?.replace(' ★', '').replace('★', '')} {required && <span style={{ color: '#ef4444' }}>*</span>}
          </label>
          <div style={{ display: 'flex', gap: '3px', height: '34px' }}>
            <input
              type="text"
              value={newVal}
              onChange={e => setNewVal(e.target.value)}
              placeholder="직접 입력..."
              style={{ flex: 1, padding: '4px 8px', border: '1px solid #3b82f6', borderRadius: '4px', fontSize: '13.5px', height: '34px', boxSizing: 'border-box', outline: 'none' }}
              autoFocus
            />
            <button type="button" onClick={() => { if (newVal.trim()) handleAddNewTradeTerm(field, newVal.trim()); setIsNewMode(false); }}
              style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '0 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</button>
            <button type="button" onClick={() => setIsNewMode(false)}
              style={{ background: '#e2e8f0', color: '#475569', border: 'none', padding: '0 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          </div>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.04em', textTransform: 'uppercase' }} title={label}>
          {label?.replace(' ★', '').replace('★', '')} {required && <span style={{ color: '#ef4444' }}>*</span>}
        </label>
        <select value={value} onChange={e => { if (e.target.value === '__NEW__') setIsNewMode(true); else setFormData(prev => ({...prev, [field]: e.target.value})); }} style={selectStyle}>
          <option value="">{placeholder || '-- 선택 --'}</option>
          {options.map((opt: string) => (<option key={opt} value={opt}>{opt}</option>))}
          {field !== 'createdByName' && value && !options.includes(value) && (<option value={value}>{value}</option>)}
          {field !== 'createdByName' && <option value="__NEW__" style={{ color: '#2563eb', fontWeight: 'bold' }}>➕ 신규 등록</option>}
        </select>
      </div>
    );
  };

  // Auto tasks registration features deleted.

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

      if (!initialPI) {
        const newDocRef = doc(collection(doc(db, "companies", COMPANY_ID), "proforma_invoices"));
        piId = newDocRef.id;

        if (!piNum) {
          const yy = new Date().getFullYear();
          const prefix = formData.issuingCompany === 'YS' ? 'YS' : 'YSACC';
          
          const snap = await getDocs(collection(doc(db, "companies", COMPANY_ID), "proforma_invoices"));
          const existingNums = snap.docs
            .map(d => d.data().piNumber)
            .filter(n => n && n.includes(`PI-${prefix}-${yy}`))
            .map(n => parseInt(n.split('-').pop() || '0'))
            .filter(n => !isNaN(n));
          
          const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
          piNum = `PI-${prefix}-${yy}-${nextNum.toString().padStart(4, '0')}`;
        }
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
        items: items.map(item => ({
          ...item,
          lineTotalUsd: (item.salePriceUsd || 0) * (item.quantity || 0)
        })),
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
        const lineTotal = (item.salePriceUsd || 0) * (item.quantity || 0);
        await setDoc(itemRef, sanitizeForFirestore({ 
          ...item, 
          productCode: rawCode, 
          lineTotalUsd: lineTotal, 
          id: itemRef.id 
        }));

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
              const isDuplicate = currentHistory.some(h => 
                h.validFrom === newHistoryItem.validFrom &&
                h.price === newHistoryItem.price &&
                h.currency === newHistoryItem.currency &&
                h.minQty === newHistoryItem.minQty &&
                h.remarks === newHistoryItem.remarks
              );
              if (!isDuplicate) {
                currentHistory.push(newHistoryItem);
              }

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
      
      const updatedForm = {
        ...formData,
        currentVersion: version
      };
      setFormData(updatedForm);

      // Update baselineStateRef to current snapshot since it is saved
      baselineStateRef.current = {
        formData: getSnapshot(updatedForm, items),
        items: true
      };

      // await autoRegisterPITask(piNum || '임시', formData.customerName || '알수없음', itemsSummary);

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
              const isDuplicate = currentHistory.some(h => 
                h.validFrom === newHistoryItem.validFrom &&
                h.price === newHistoryItem.price &&
                h.currency === newHistoryItem.currency &&
                h.minQty === newHistoryItem.minQty &&
                h.remarks === newHistoryItem.remarks
              );
              if (!isDuplicate) {
                currentHistory.push(newHistoryItem);
              }
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
      
      // await autoCompletePITask(piNum || '임시', formData.customerName || '알수없음');
      
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
        let loadedItems = newLiSnap.docs.map(d => d.data() as PIItem).sort((a,b) => (Number(a.lineNumber) || 0) - (Number(b.lineNumber) || 0));
        if (loadedItems.length === 0 && Array.isArray(latestRevDoc.data().items)) {
          loadedItems = (latestRevDoc.data().items as any[]).sort((a,b) => (Number(a.lineNumber) || 0) - (Number(b.lineNumber) || 0));
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
        let loadedItems = liSnap.docs.map(d => d.data() as PIItem).sort((a,b) => (Number(a.lineNumber) || 0) - (Number(b.lineNumber) || 0));
        
        // Fallback to items array if subcollection is empty
        if (loadedItems.length === 0 && Array.isArray(data.items)) {
          loadedItems = (data.items as any[]).sort((a,b) => (Number(a.lineNumber) || 0) - (Number(b.lineNumber) || 0));
        }
        
        setItems(loadedItems);
        
        // Update baselineStateRef to match the newly loaded revision state
        const loadedForm = {
          ...formData,
          exchangeRate: data.exchangeRate !== undefined ? data.exchangeRate : formData.exchangeRate,
          remarks: data.remarks !== undefined ? data.remarks : formData.remarks,
          customerAddress: data.customerAddress !== undefined ? data.customerAddress : formData.customerAddress,
          incoterms: data.incoterms !== undefined ? data.incoterms : formData.incoterms,
          destinationPort: data.destinationPort !== undefined ? data.destinationPort : formData.destinationPort,
          paymentTerms: data.paymentTerms !== undefined ? data.paymentTerms : formData.paymentTerms,
          shippingMethod: data.shippingMethod !== undefined ? data.shippingMethod : formData.shippingMethod,
          packagingSpec: data.packagingSpec !== undefined ? data.packagingSpec : formData.packagingSpec,
          deliveryTerm: data.deliveryTerm !== undefined ? data.deliveryTerm : formData.deliveryTerm,
          origin: data.origin !== undefined ? data.origin : formData.origin,
          yourRef: data.yourRef !== undefined ? data.yourRef : formData.yourRef,
          attachments: data.attachments !== undefined ? data.attachments : (formData.attachments || []),
          currentVersion: data.version !== undefined ? data.version : formData.currentVersion
        };
        setFormData(loadedForm);
        baselineStateRef.current = {
          formData: getSnapshot(loadedForm, loadedItems),
          items: true
        };

        alert(`ℹ️ Version ${data.version || ''}의 데이터가 로드되었습니다.`);
      }
    } catch (err) {
      console.error("Error loading specific revision:", err);
      alert("❌ Revision 데이터를 불러오는데 실패했습니다.");
    }
  };

  const [position, setPosition] = useState({ x: 50, y: 50 });
  const [isDragging, setIsDragging] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isMaximized) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    const nextX = Math.max(10, Math.min(window.innerWidth - 300, e.clientX - dragStartRef.current.x));
    const nextY = Math.max(10, Math.min(window.innerHeight - 150, e.clientY - dragStartRef.current.y));
    setPosition({ x: nextX, y: nextY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div style={{
      position: 'fixed',
      left: isMaximized ? '0px' : `${position.x}px`,
      top: isMaximized ? '0px' : `${position.y}px`,
      width: isMaximized ? '100vw' : '90%',
      maxWidth: isMaximized ? 'none' : '1400px',
      height: isMaximized ? '100vh' : 'auto',
      zIndex: 1000,
      userSelect: isDragging ? 'none' : 'auto'
    }}>
      <div style={{
        background: '#fff',
        borderRadius: isMaximized ? '0px' : '14px',
        width: '100%',
        height: isMaximized ? '100vh' : 'auto',
        maxHeight: isMaximized ? '100vh' : '92vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 40px rgba(15,23,42,0.3)',
        border: isMaximized ? 'none' : '2px solid var(--border-default)',
        resize: isMaximized ? 'none' : 'both',
        overflow: 'hidden',
        minWidth: isMaximized ? 'none' : '800px',
        minHeight: isMaximized ? 'none' : '400px'
      }}>
        
        {/* Header */}
        <div 
          onMouseDown={handleMouseDown}
          style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa', borderRadius: isMaximized ? '0px' : '14px 14px 0 0', cursor: isMaximized ? 'default' : 'move', userSelect: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#111827' }}>
                {initialPI ? 'Edit Proforma Invoice' : 'New Proforma Invoice'}
              </div>
              <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '2px' }}>
                신규 견적서 작성 · Firebase Firestore 저장
              </div>
            </div>
            {initialPI && revisions.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#f8fafc', padding: '0 16px', borderRadius: '4px', border: '1px solid #cbd5e1', height: '46px', boxSizing: 'border-box' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>🕒 Revision 기록 불러오기:</span>
                <select
                  value={dropdownRevId}
                  onChange={(e) => setDropdownRevId(e.target.value)}
                  style={{ padding: '0 12px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 600, color: '#1e293b', cursor: 'pointer', height: '34px', outline: 'none' }}
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
                    background: '#3b82f6',
                    border: 'none',
                    color: '#fff',
                    borderRadius: '4px',
                    padding: '0 12px',
                    fontSize: '13px',
                    fontWeight: 700,
                    height: '34px',
                    cursor: (savingType !== null || !dropdownRevId || dropdownRevId === selectedRevId) ? 'not-allowed' : 'pointer',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={e => { if (savingType === null && dropdownRevId && dropdownRevId !== selectedRevId) e.currentTarget.style.backgroundColor = '#2563eb'; }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#3b82f6'; }}
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
                    border: '1px solid #cbd5e1',
                    color: '#ef4444',
                    borderRadius: '4px',
                    padding: '0 12px',
                    fontSize: '13px',
                    fontWeight: 700,
                    height: '34px',
                    cursor: savingType !== null ? 'not-allowed' : 'pointer'
                  }}
                  title="선택된 Revision 기록 삭제"
                >
                  🗑️ 삭제
                </button>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#6b7280',
                fontSize: '18px',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                lineHeight: 1
              }}
              title={isMaximized ? '이전 크기로 복원' : '화면 최대화'}
            >
              {isMaximized ? '🗗' : '🗖'}
            </button>
            <button onClick={handleCloseAttempt} style={{ background: 'transparent', border: 'none', color: '#6b7280', fontSize: '20px', cursor: 'pointer', padding: '4px' }}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '12px 16px', overflowY: 'auto', flex: 1, backgroundColor: '#fff' }}>

          {/* AI prompt draft generator */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: '#f8fafc', padding: '14px', borderRadius: '4px', border: '1px solid #cbd5e1', marginBottom: '8px' }}>
            <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '4px' }}>
              🪄 AI 견적서 초안 자동 생성 (프롬프트 입력)
            </span>
            <p style={{ fontSize: '11px', color: '#64748b', margin: 0, fontWeight: 500 }}>
              거래 바이어명, 구매할 상품 종류(볼트/너트), 수량 및 타겟 마진율을 입력해 주시면 AI가 견적 내역과 단가를 일괄 구성합니다.
            </p>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <input
                type="text"
                placeholder="예: NATIONAL 바이어에게 볼트 5000개, 너트 3000개 견적서 작성해줘. 마진은 15%로 세팅."
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                style={{ flex: 1, padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', outline: 'none', backgroundColor: '#fff', height: '34px', boxSizing: 'border-box', fontWeight: 600, color: '#1e293b' }}
              />
              <button
                type="button"
                onClick={handleAiDraftCreate}
                style={{ padding: '0 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', height: '34px', transition: 'background 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2563eb'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#3b82f6'}
              >
                🪄 초안 생성
              </button>
            </div>
          </div>
          
          {/* ── PI Document-style compact form (4 rows) ── */}
          <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '4px', border: '1px solid #cbd5e1', marginBottom: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>

            {/* ── 섹션: 발행 정보 ── */}
            <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b', letterSpacing: '0.02em', textTransform: 'uppercase', paddingBottom: '6px', borderBottom: '1px solid #cbd5e1' }}>발행 정보</div>

            {/* ── Row 1: 발행사 | 작성자 | 작성일 | PI Number | Your Ref | Validity | Valid Until ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', alignItems: 'end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.04em', textTransform: 'uppercase' }}>구분 ★</label>
                <select
                  value={formData.type || 'trade'}
                  onChange={e => setFormData(prev => ({ ...prev, type: e.target.value as any }))}
                  style={{ padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', outline: 'none', backgroundColor: '#fff', height: '34px', boxSizing: 'border-box', fontWeight: 600, color: '#1e293b', cursor: 'pointer' }}
                >
                  <option value="trade">일반 무역 (물품)</option>
                  <option value="consulting">컨설팅 용역 (서비스)</option>
                </select>
              </div>
              <CompactComboSelect label="발행사 ★" field="issuingCompany" options={['YSACC', 'YS']} required={true} />
              <CompactComboSelect label="작성자" field="createdByName" options={['대표이사 김주한', '박현 차장', '김하은 사원']} />
              <CompactInput label="작성일 (PI Date) ★" type="date" value={formData.piDate} onChange={(v: any) => setFormData(prev => ({...prev, piDate: v}))} />
              <CompactInput label="PI Number ★" value={formData.piNumber} onChange={(v: any) => setFormData(prev => ({...prev, piNumber: v}))} />
              <CompactInput label="Your Ref (PO No.)" value={formData.yourRef || ''} onChange={(v: any) => setFormData(prev => ({...prev, yourRef: v}))} />
              <CompactInput label="Validity(d)" type="number" value={formData.validityDays} onChange={(v: any) => setFormData(prev => ({...prev, validityDays: parseInt(v)||0}))} />
              <CompactInput label="Valid Until" value={formData.validUntilDate} disabled />
            </div>

            {/* ── 섹션: 고객 및 거래 조건 ── */}
            <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b', letterSpacing: '0.02em', textTransform: 'uppercase', paddingBottom: '6px', borderBottom: '1px solid #cbd5e1', marginTop: '4px' }}>고객 및 거래 조건</div>

            {/* ── Row 3: Customer | 주소 | 담당 | Incoterms | Dest.Port | Payment ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', alignItems: 'end' }}>
              {/* Customer search input */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Customer <span style={{ color: '#ef4444' }}>*</span></label>
                <div style={{ position: 'relative', height: '34px', display: 'flex', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={formData.customerName || ''}
                    placeholder="검색/선택"
                    readOnly
                    onClick={() => setIsCustomerSearchOpen(true)}
                    style={{
                      width: '100%', height: '34px', padding: '1px 32px 1px 8px',
                      border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13.5px', fontWeight: 600, color: '#1e293b',
                      outline: 'none', cursor: 'pointer', background: '#fff', boxSizing: 'border-box'
                    }}
                  />
                  {formData.customerId && (
                    <button type="button" onClick={() => setFormData(prev => ({...prev, customerId:'', customerName:'', customerAddress:'', contactPerson:'', email:''}))}
                      style={{ position: 'absolute', right: '22px', background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '11px', padding: '1px', display: 'flex', alignItems: 'center' }}
                      title="비우기">✕</button>
                  )}
                  <button type="button" onClick={() => setIsCustomerSearchOpen(true)}
                    style={{ position: 'absolute', right: '4px', background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '12px', padding: '1px', display: 'flex', alignItems: 'center' }}
                    title="고객 검색">🔍</button>
                </div>
              </div>
              <CompactInput label="담당" value={formData.contactPerson || ''} onChange={(v: any) => setFormData(prev => ({...prev, contactPerson: v}))} />
              {formData.type !== 'consulting' && (
                <>
                  <CompactComboSelect label="Incoterms ★" field="incoterms" options={tradeTermsDB.incoterms || []} required={true} />
                  <CompactComboSelect label="Dest. Port ★" field="destinationPort" options={tradeTermsDB.destinationPorts || []} required={true} />
                </>
              )}
              <CompactComboSelect label="Payment ★" field="paymentTerms" options={tradeTermsDB.paymentTerms || []} required={true} />
            </div>

            {/* ── Row 4: Departure | Packing | Shipping | Delivery | Origin ── */}
            {formData.type !== 'consulting' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', alignItems: 'end' }}>
                <CompactComboSelect label="Departure Port" field="departurePort" options={tradeTermsDB.departurePorts || []} />
                <CompactComboSelect label="Packing Spec." field="packagingSpec" options={tradeTermsDB.packagingSpecs || []} />
                <CompactComboSelect label="Shipping" field="shippingMethod" options={tradeTermsDB.shippingMethods || []} />
                <CompactComboSelect label="Delivery Term" field="deliveryTerm" options={tradeTermsDB.deliveryTerms || []} />
                <CompactComboSelect label="Origin" field="origin" options={tradeTermsDB.origins || []} />
              </div>
            )}
          </div>

          {/* Line Items */}
          <div style={{ background: '#ffffff', padding: '20px', borderRadius: '4px', border: '1px solid #cbd5e1', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid #cbd5e1', paddingBottom: '10px' }}>
              <h4 style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📦</span> 상품 라인 (Line Items)
              </h4>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {formData.type !== 'consulting' && <button onClick={handleSimulation} style={{ background: '#3b82f6', color: '#fff', border: 'none', height: '34px', padding: '0 14px', borderRadius: '4px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2563eb'} onMouseLeave={e => e.currentTarget.style.backgroundColor = '#3b82f6'}>🚢 적재 시뮬레이션</button>}
                <button onClick={downloadLineItemsTemplate} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', height: '34px', padding: '0 14px', borderRadius: '4px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e2e8f0'} onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}>📥 양식 다운로드</button>
                <label style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', height: '34px', padding: '0 14px', borderRadius: '4px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e2e8f0'} onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}>
                  📤 엑셀 업로드
                  <input type="file" accept=".xlsx, .xls" onChange={importLineItemsExcel} style={{ display: 'none' }} />
                </label>
                <button onClick={addItem} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', height: '34px', padding: '0 14px', borderRadius: '4px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', color: '#475569', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e2e8f0'} onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}>＋ 상품 추가</button>
              </div>
            </div>
            <div style={{ overflowX: 'auto', width: '100%', border: '1px solid #cbd5e1', borderRadius: '4px' }}>
              <table style={{ width: '100%', minWidth: '1066px', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0, fontSize: '12.5px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1', color: '#475569' }}>
                  <th style={{ padding: '10px 4px', width: '55px', textAlign: 'center', fontWeight: 750, letterSpacing: '0.02em', borderBottom: '1px solid #cbd5e1' }}>No.</th>
                  <th style={{ padding: '10px 4px', width: '320px', textAlign: 'center', fontWeight: 750, letterSpacing: '0.02em', borderBottom: '1px solid #cbd5e1' }}>상품코드 / 스펙 (Spec)</th>
                  <th style={{ padding: '10px 4px', width: '90px', textAlign: 'center', fontWeight: 750, letterSpacing: '0.02em', borderBottom: '1px solid #cbd5e1' }}>패킹방식/수량</th>
                  <th style={{ padding: '10px 4px', width: '80px', textAlign: 'center', fontWeight: 750, letterSpacing: '0.02em', borderBottom: '1px solid #cbd5e1' }}>수량 / 단위</th>
                  <th style={{ padding: '10px 4px', width: '110px', textAlign: 'center', fontWeight: 750, letterSpacing: '0.02em', borderBottom: '1px solid #cbd5e1' }}>매입가</th>
                  <th style={{ padding: '10px 4px', width: '65px', textAlign: 'center', fontWeight: 750, letterSpacing: '0.02em', borderBottom: '1px solid #cbd5e1' }}>마진/올림</th>
                  <th style={{ padding: '10px 4px', width: '75px', textAlign: 'right', fontWeight: 750, letterSpacing: '0.02em', borderBottom: '1px solid #cbd5e1' }}>단가(USD)</th>
                  <th style={{ padding: '10px 4px', width: '90px', textAlign: 'right', fontWeight: 750, letterSpacing: '0.02em', borderBottom: '1px solid #cbd5e1' }}>총액($)</th>
                  <th style={{ padding: '10px 4px', width: '90px', textAlign: 'right', fontWeight: 750, letterSpacing: '0.02em', borderBottom: '1px solid #cbd5e1' }}>이익($)</th>
                  <th style={{ padding: '10px 4px', width: '90px', textAlign: 'center', fontWeight: 750, letterSpacing: '0.02em', borderBottom: '1px solid #cbd5e1' }}>비고</th>
                  <th style={{ padding: '10px 4px', width: '62px', borderBottom: '1px solid #cbd5e1' }}></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={formData.type === 'consulting' ? 10 : 11} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>상품을 추가해주세요</td></tr>
                ) : items.map((it, idx) => {
                  const isColoredRow = idx % 2 === 1;
                  const rowBgColor = isColoredRow ? '#f1f5f9' : '#ffffff';
                  const isDragOver = dragOverIndex === idx;
                  return (
                  <tr 
                    key={`pi-item-${it.lineNumber || (idx + 1)}-${it.productCode || idx}`} 
                    draggable={true}
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, idx)}
                    style={{ 
                      borderBottom: isDragOver ? '2px solid #2563eb' : '1px solid #cbd5e1', 
                      backgroundColor: isDragOver ? '#dbeafe' : rowBgColor, 
                      transition: 'background-color 0.15s' 
                    }}
                    onMouseEnter={e => { if (dragOverIndex !== idx) e.currentTarget.style.backgroundColor = '#e0f2fe'; }}
                    onMouseLeave={e => { if (dragOverIndex !== idx) e.currentTarget.style.backgroundColor = rowBgColor; }}
                  >
                    {/* No. & Drag Handle */}
                    <td style={{ padding: '4px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                        <span 
                          style={{ cursor: 'grab', fontSize: '13px', color: '#94a3b8', userSelect: 'none', padding: '0 2px' }}
                          title="드래그하여 순서 변경"
                        >
                          ⋮⋮
                        </span>
                        <input
                          type="text"
                          value={it.lineNumber !== undefined && it.lineNumber !== '' ? it.lineNumber : (idx + 1)}
                          onChange={(e) => updateItem(idx, 'lineNumber', e.target.value)}
                          style={{
                            ...gridInputStyle,
                            width: '38px',
                            textAlign: 'center',
                            padding: '2px 4px',
                            fontWeight: 700,
                            color: '#1e293b'
                          }}
                          title="순번 자유 수동 입력 (원하는 번호/문자 입력 가능)"
                        />
                      </div>
                    </td>
                    <td style={{ padding: '4px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <input 
                              type="text" 
                              list={`products_datalist_${idx}`}
                              value={it.productCode} 
                              placeholder={formData.type === 'consulting' ? '용역/서비스 수행 항목명 입력' : '상품코드 검색/입력'}
                              onChange={(e) => updateItem(idx, 'productCode', e.target.value)} 
                              style={{ ...gridInputStyle, paddingRight: '42px' }} 
                            />
                            {it.productCode && (
                              <button
                                type="button"
                                onClick={() => updateItem(idx, 'productCode', '')}
                                style={{
                                  position: 'absolute',
                                  right: '24px',
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--text-muted)',
                                  cursor: 'pointer',
                                  fontSize: '11px',
                                  padding: '2px',
                                  zIndex: 5,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                                title="비우기"
                              >
                                ✕
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setSearchItemIndex(idx);
                                setIsProductSearchOpen(true);
                              }}
                              style={{
                                position: 'absolute',
                                right: '6px',
                                background: 'transparent',
                                border: 'none',
                                color: '#3b82f6',
                                cursor: 'pointer',
                                fontSize: '13px',
                                padding: '2px',
                                zIndex: 5,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                              title="상품 검색 (Subwindow)"
                            >
                              🔍
                            </button>
                            <datalist id={`products_datalist_${idx}`}>
                              {products.map(p => {
                                const displayName = p.nameEn || p.nameKo || '';
                                return (
                                  <option key={p.id} value={`[${p.productCode}] ${displayName}`}>
                                    [{p.productCode}] {displayName}
                                  </option>
                                );
                              })}
                            </datalist>
                          </div>
                          {(() => {
                            const rawCode = getRawProductCode(it.productCode);
                            const p = products.find(prod => prod.productCode === rawCode || prod.id === rawCode);
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
                                  background: p ? '#fef08a' : '#f1f5f9',
                                  border: p ? '1px solid var(--border-default)' : '1px solid var(--border-color)',
                                  color: p ? '#a16207' : 'var(--text-muted)',
                                  borderRadius: '4px',
                                  padding: '4px 6px',
                                  cursor: p ? 'pointer' : 'not-allowed',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  whiteSpace: 'nowrap',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  height: '29px'
                                }}
                              >
                                ✏️
                              </button>
                            );
                          })()}
                          {(() => {
                            const rawCode = getRawProductCode(it.productCode);
                            const p = products.find(prod => prod.productCode === rawCode || prod.id === rawCode);
                            if (p && p.supplierName) {
                              return (
                                <span style={{ fontSize: '11.5px', color: '#2563eb', fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: '200px', marginLeft: '4px', background: '#eff6ff', padding: '1px 5px', borderRadius: '4px' }} title={p.supplierName}>
                                  {p.supplierName.replace(/\(주\)/g, '').replace(/주식회사/g, '').trim()}
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>
                        <textarea 
                          value={it.spec || ''} 
                          placeholder={formData.type === 'consulting' ? '세부 수행 조건 및 설명' : '스펙 (Spec)'} 
                          onChange={(e) => updateItem(idx, 'spec', e.target.value)} 
                          rows={1}
                          style={{ ...gridInputStyle, resize: 'both', minHeight: '29px', minWidth: '80px', padding: '4px 8px', fontFamily: 'inherit', marginTop: '2px', overflow: 'auto' }} 
                        />
                      </div>
                    </td>
                    {formData.type !== 'consulting' && (
                      <td style={{ padding: '4px' }}>
                        {it.productCode ? (() => {
                          const prod = products.find(p => p.productCode === getRawProductCode(it.productCode));
                          const methods = getProductPackingMethods(prod);
                          const selectedMethod = methods.find((m: any) => m.id === (it.selectedPackingMethodId || 'default_injected'))
                            || methods[0];
                          const isExpanded = expandedPackingRows.has(idx);

                          const autoQty = autoCalcPalletQty(it.quantity || 0, selectedMethod?.id, methods);
                          const packLabel = formatPackingName(selectedMethod?.name, selectedMethod?.qtyPerPallet);
                          const packUnit = selectedMethod?.packageType || '단품';

                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              {/* 1번째 줄: 수량 + 단위 */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <input
                                  type="number"
                                  step="0.1"
                                  placeholder="패킹수량"
                                  value={it.palletQty || ''}
                                  onChange={(e) => updateItem(idx, 'palletQty', parseFloat(e.target.value) || 0)}
                                  style={{ ...gridInputStyle, textAlign: 'right', flex: 1, minWidth: '55px' }}
                                />
                                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                  {packUnit}
                                </span>
                              </div>

                              {/* 2번째 줄: 📦 패킹 설정 아이콘 버튼 */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => togglePackingRow(idx)}
                                  title={`패킹 설정: ${packLabel}`}
                                  style={{
                                    width: '100%',
                                    padding: '2px 6px',
                                    fontSize: '11.5px',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '4px',
                                    background: isExpanded ? '#eff6ff' : '#f8fafc',
                                    color: isExpanded ? '#2563eb' : '#475569',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '4px',
                                    fontWeight: 600,
                                    boxSizing: 'border-box'
                                  }}
                                >
                                  <span>📦</span>
                                  <span style={{ fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{packLabel}</span>
                                </button>
                              </div>

                              {/* 자동 계산값 힌트 (수동 입력 안 했을 때만 표시) */}
                              {!it.palletQty && autoQty > 0 && (
                                <div
                                  style={{ fontSize: '11px', color: '#94a3b8', cursor: 'pointer', paddingLeft: '2px' }}
                                  onClick={() => updateItem(idx, 'palletQty', autoQty)}
                                  title="클릭하여 적용"
                                >
                                  ≈ {autoQty} {packUnit} (자동)
                                </div>
                              )}

                              {/* 📦 클릭 시 인라인 펼침 — 패킹방식 선택 */}
                              {isExpanded && (
                                <div style={{
                                  marginTop: '4px',
                                  padding: '8px',
                                  background: '#f0f9ff',
                                  border: '1px solid #bae6fd',
                                  borderRadius: '6px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '6px',
                                }}>
                                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#0369a1' }}>📦 패킹 방식 선택</div>
                                  {methods.map((m: any) => (
                                    <label
                                      key={m.id}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        fontSize: '12px',
                                        cursor: 'pointer',
                                        padding: '3px 4px',
                                        borderRadius: '4px',
                                        background: (it.selectedPackingMethodId || 'default_injected') === m.id ? '#dbeafe' : 'transparent',
                                      }}
                                    >
                                      <input
                                        type="radio"
                                        name={`packing-${idx}`}
                                        value={m.id}
                                        checked={(it.selectedPackingMethodId || 'default_injected') === m.id}
                                        onChange={() => {
                                          updateItem(idx, 'selectedPackingMethodId', m.id);
                                          const newAutoQty = autoCalcPalletQty(it.quantity || 0, m.id, methods);
                                          if (newAutoQty > 0) updateItem(idx, 'palletQty', newAutoQty);
                                          togglePackingRow(idx);
                                        }}
                                      />
                                      <span style={{ fontWeight: 600 }}>{formatPackingName(m.name, m.qtyPerPallet)}</span>
                                      {m.qtyPerPallet > 1 && (
                                        <span style={{ color: '#64748b' }}>({m.qtyPerPallet.toLocaleString()}개/{m.packageType || '단위'})</span>
                                      )}
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })() : (
                          <div style={{ color: '#94a3b8', fontSize: '12px', textAlign: 'center' }}>--</div>
                        )}
                      </td>
                    )}
                    <td style={{ padding: '4px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <input 
                          type="text" 
                          placeholder="수량"
                          value={formatNumberWithCommas(it.quantity)} 
                          onChange={(e) => updateItem(idx, 'quantity', parseCommas(e.target.value))} 
                          style={{ ...gridInputStyle, textAlign: 'right', width: '80%', marginLeft: 'auto' }} 
                        />
                        <input 
                          type="text" 
                          placeholder="단위"
                          value={it.unit} 
                          onChange={(e) => updateItem(idx, 'unit', e.target.value.toUpperCase())} 
                          style={{ ...gridInputStyle, textAlign: 'center', width: '50%', marginLeft: 'auto' }} 
                        />
                      </div>
                    </td>
                    <td style={{ padding: '4px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                          {(() => {
                            const curCurrency = (it as any).purchasePriceCurrency || (it.purchasePriceUsd > 0 ? 'USD' : 'KRW');
                            const amountVal = curCurrency === 'USD' ? it.purchasePriceUsd : it.purchasePriceKrw;
                            return (
                              <>
                                <select
                                   value={curCurrency}
                                   onChange={(e) => {
                                     handleCurrencySelection(e.target.value, curCurrency, customCurrencies, val => {
                                       updateItem(idx, {
                                         purchasePriceCurrency: val,
                                         purchasePriceUsd: val === 'USD' ? (amountVal || 0) : 0,
                                         purchasePriceKrw: val === 'KRW' ? (amountVal || 0) : 0
                                       });
                                     });
                                   }}
                                   style={{ ...gridInputStyle, width: '65px', padding: '2px' }}
                                 >
                                   {[...DEFAULT_CURRENCIES, ...customCurrencies].map(c => <option key={c} value={c}>{c}</option>)}
                                   <option value="ADD_NEW_CURRENCY" style={{ color: '#2563eb', fontWeight: 'bold' }}>+</option>
                                 </select>
                                <PurchasePriceInput
                                  curCurrency={curCurrency}
                                  purchasePriceUsd={it.purchasePriceUsd}
                                  purchasePriceKrw={it.purchasePriceKrw}
                                  onChange={(updates) => updateItem(idx, updates)}
                                />
                              </>
                            );
                          })()}
                        </div>
                        {(() => {
                          const curCurrency = (it as any).purchasePriceCurrency || (it.purchasePriceUsd > 0 ? 'USD' : 'KRW');
                          if (curCurrency === 'KRW') {
                            return (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>기준환율:</span>
                                <input 
                                  type="text" 
                                  value={formatNumberWithCommas(it.exchangeRate)} 
                                  onChange={(e) => updateItem(idx, 'exchangeRate', parseCommas(e.target.value))} 
                                  style={{ ...gridInputStyle, textAlign: 'right', flex: 1 }} 
                                />
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </td>
                    <td style={{ padding: '4px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', width: '100%' }}>
                          <input 
                            type="text" 
                            placeholder="마진"
                            value={formatNumberWithCommas(it.marginRate)} 
                            onChange={(e) => updateItem(idx, 'marginRate', parseCommas(e.target.value))} 
                            style={{ ...gridInputStyle, textAlign: 'right', flex: 1 }} 
                          />
                          <span style={{ fontSize: '13.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>%</span>
                        </div>
                        {it.productCode && (
                          <div style={{ fontSize: '10px', color: '#16a34a', fontWeight: 700, marginTop: '2px', textAlign: 'center', whiteSpace: 'nowrap' }} title="과거 거래 데이터 분석 기반 AI 추천 마진">
                            🤖 AI추천: 15%
                          </div>
                        )}
                        <select 
                          value={it.roundDigits ?? 'none'} 
                          onChange={(e) => updateItem(idx, 'roundDigits', e.target.value === 'none' ? undefined : parseInt(e.target.value))} 
                          style={{ ...gridInputStyle, textAlign: 'center', textAlignLast: 'center', width: '100%' }}
                        >
                          <option value="none">없음</option>
                          <option value="-2">-2</option>
                          <option value="-1">-1</option>
                          <option value="0">0</option>
                          <option value="1">1</option>
                          <option value="2">2</option>
                        </select>
                      </div>
                    </td>
                    <td style={{ padding: '4px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                        <SalePriceInput
                          value={it.salePriceUsd}
                          onChange={(val) => updateItem(idx, 'salePriceUsd', val)}
                        />
                      </div>
                    </td>
                    <td style={{ padding: '4px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700, fontSize: '15px', color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                      ${((it.salePriceUsd || 0) * (it.quantity || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '4px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700, fontSize: '15px', color: '#16a34a', fontVariantNumeric: 'tabular-nums' }}>
                      ${(it.quantity ? (((it.salePriceUsd || 0) - (it.purchasePriceUsd > 0 ? it.purchasePriceUsd : ((it.purchasePriceKrw || 0) / (it.exchangeRate || formData.exchangeRate || 1400)))) * it.quantity) : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '4px' }}>
                      <textarea
                        value={it.remarks || ''}
                        placeholder="비고"
                        onChange={(e) => updateItem(idx, 'remarks', e.target.value)}
                        rows={2}
                        style={{ ...gridInputStyle, resize: 'vertical', minHeight: '40px', fontFamily: 'inherit' }}
                      />
                    </td>
                    <td style={{ padding: '4px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '3px', justifyContent: 'center', alignItems: 'center' }}>
                        <button 
                          type="button"
                          onClick={() => copyItem(idx)} 
                          style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '4px', cursor: 'pointer', fontSize: '12px', width: '26px', height: '26px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                          title="동일/비슷한 품목 복사 추가"
                        >
                          📋
                        </button>
                        <button 
                          type="button"
                          onClick={() => removeItem(idx)} 
                          style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '4px', padding: '4px', cursor: 'pointer', fontSize: '12px', width: '26px', height: '26px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                          title="상품 삭제"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              </tbody>
            </table>
          </div>
        </div>

          {/* Extras and Totals */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '12px' }}>

            {/* Freight Charges (USD) */}
            {formData.type !== 'consulting' && (
            <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '8px', background: '#fff', border: '1px solid var(--border-default)', padding: '12px 16px', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Freight Charges (USD)</span>
                <button type="button" onClick={addFreightCharge} style={{ background: 'none', border: '1px solid var(--border-default)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>＋ 운송비 추가</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* Freight Headers */}
                <div style={{ display: 'flex', gap: '8px', padding: '0 40px 4px 0', borderBottom: '1px solid #f1f5f9', marginBottom: '2px', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  <div style={{ flex: 1.5 }}>Container Type</div>
                  <div style={{ flex: 1, textAlign: 'right' }}>Qty</div>
                  <div style={{ flex: 1.5, textAlign: 'right' }}>Unit Price</div>
                  <div style={{ flex: 1, textAlign: 'right' }}>Total</div>
                  <div style={{ flex: 3.5, paddingLeft: '8px' }}>비고 (Remarks)</div>
                </div>
                {(formData.freightCharges || []).map((fc, fcIdx) => (
                  <div key={fcIdx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {/* Container Type: 프리셋 선택 or 직접입력 */}
                    <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <select
                        value={
                          ['LCL','20GP','20RF','20DG','40FT','40HQ','FOB CHARGES','DAP CHARGES','DDP CHARGES','CIF CHARGES','CFR CHARGES','TRUCKING','INLAND FREIGHT','CUSTOMS FEE','직접입력'].includes(fc.type || '')
                            ? (fc.type || 'LCL')
                            : '직접입력'
                        }
                        onChange={e => {
                          if (e.target.value === '직접입력') {
                            updateFreightCharge(fcIdx, 'type', '');
                          } else {
                            updateFreightCharge(fcIdx, 'type', e.target.value);
                          }
                        }}
                        style={{ width: '100%', height: '32px', padding: '5px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13.5px', background: '#fff' }}
                      >
                        <optgroup label="컨테이너">
                          <option value="LCL">LCL</option>
                          <option value="20GP">20GP</option>
                          <option value="20RF">20RF</option>
                          <option value="20DG">20DG</option>
                          <option value="40FT">40FT</option>
                          <option value="40HQ">40HQ</option>
                        </optgroup>
                        <optgroup label="운임 조건">
                          <option value="FOB CHARGES">FOB CHARGES</option>
                          <option value="DAP CHARGES">DAP CHARGES</option>
                          <option value="DDP CHARGES">DDP CHARGES</option>
                          <option value="CIF CHARGES">CIF CHARGES</option>
                          <option value="CFR CHARGES">CFR CHARGES</option>
                        </optgroup>
                        <optgroup label="기타 비용">
                          <option value="TRUCKING">TRUCKING</option>
                          <option value="INLAND FREIGHT">INLAND FREIGHT</option>
                          <option value="CUSTOMS FEE">CUSTOMS FEE</option>
                        </optgroup>
                        <option value="직접입력">✏️ 직접입력...</option>
                      </select>
                      {/* 직접입력 모드일 때 텍스트 필드 표시 */}
                      {!['LCL','20GP','20RF','20DG','40FT','40HQ','FOB CHARGES','DAP CHARGES','DDP CHARGES','CIF CHARGES','CFR CHARGES','TRUCKING','INLAND FREIGHT','CUSTOMS FEE'].includes(fc.type || '') && (
                        <input
                          type="text"
                          placeholder="항목명 직접 입력"
                          value={fc.type || ''}
                          onChange={e => updateFreightCharge(fcIdx, 'type', e.target.value)}
                          style={{ width: '100%', height: '32px', padding: '5px 6px', border: '1px solid var(--focus-ring)', borderRadius: '4px', fontSize: '13.5px', outline: 'none', boxSizing: 'border-box' }}
                          autoFocus
                        />
                      )}
                    </div>
                    <input 
                      type="number" 
                      placeholder="수량" 
                      value={fc.qty ?? 1} 
                      onChange={e => updateFreightCharge(fcIdx, 'qty', parseFloat(e.target.value) || 0)} 
                      style={{ flex: 1, height: '32px', padding: '6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '15px', textAlign: 'right' }} 
                    />
                    <input 
                      type="number" 
                      step="0.01"
                      placeholder="금액 (USD)" 
                      value={fc.price ?? 0} 
                      onChange={e => updateFreightCharge(fcIdx, 'price', parseFloat(e.target.value) || 0)} 
                      style={{ flex: 1.5, height: '32px', padding: '6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '15px', textAlign: 'right' }} 
                    />
                    <div style={{ flex: 1, textAlign: 'right', fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>
                      ${((fc.qty || 0) * (fc.price || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <input 
                      type="text" 
                      placeholder="비고" 
                      value={fc.remarks || ''} 
                      onChange={e => updateFreightCharge(fcIdx, 'remarks', e.target.value)} 
                      style={{ flex: 3.5, height: '32px', padding: '6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '15px' }} 
                    />
                    <button type="button" onClick={() => removeFreightCharge(fcIdx)} style={{ background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: '4px', padding: '6px 10px', cursor: 'pointer', fontSize: '13px' }}>✕</button>
                  </div>
                ))}
              </div>
              <div style={{ textAlign: 'right', fontWeight: 700, fontSize: '16px', color: '#0f172a', marginTop: '4px', paddingTop: '6px', borderTop: '1px solid #f1f5f9' }}>
                운송비 합계: <span style={{ color: '#0f172a' }}>${(formData.freightTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
            )}

          </div>

          {/* Remarks */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '12px', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
            <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Remarks</label>
            <textarea value={formData.remarks} onChange={(e) => setFormData(prev => ({...prev, remarks: e.target.value}))} rows={2} style={{ padding: '6px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '15px', color: '#334155', width: '100%', boxSizing: 'border-box', resize: 'vertical', lineHeight: '1.5', fontFamily: 'monospace' }}></textarea>
          </div>

          {initialPI && (
            <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '12px 16px', borderRadius: '4px', marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', marginBottom: '6px' }}>
                Revision Reason (변경 사유) <span style={{ color: '#ef4444' }}>*</span>
              </div>
              <input
                type="text"
                value={revisionReason}
                onChange={(e) => setRevisionReason(e.target.value)}
                placeholder="예: 고객 단가 인하 요청 수용"
                style={{ width: '100%', height: '34px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', color: '#1e293b', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          )}

          <div style={{ background: 'linear-gradient(135deg, #0f172a, var(--text-primary))', border: '1.5px solid #334155', padding: '14px 22px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center', marginBottom: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>총 매입금액 (Est. Cost)</span>
                <span style={{ color: '#60a5fa', fontSize: '16px', fontWeight: 800 }}>
                  {(() => {
                    const totalCostUsd = items.reduce((sum, it) => {
                      const costUsd = it.purchasePriceUsd > 0 ? it.purchasePriceUsd : ((it.purchasePriceKrw || 0) / (it.exchangeRate || formData.exchangeRate || 1400));
                      return sum + (costUsd * (it.quantity || 0));
                    }, 0);
                    return `$${totalCostUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                  })()}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>예상 총 영업이익 (Profit)</span>
                <span style={{ color: '#4ade80', fontSize: '18px', fontWeight: 800, textShadow: '0 0 10px rgba(74,222,128,0.2)' }}>{(() => {
                  const totalProfit = items.reduce((sum, it) => {
                    const costUsd = it.purchasePriceUsd > 0 ? it.purchasePriceUsd : ((it.purchasePriceKrw || 0) / (it.exchangeRate || formData.exchangeRate || 1400));
                    const profit = (it.salePriceUsd || 0) - costUsd;
                    return sum + (profit * (it.quantity || 0));
                  }, 0);
                  const totalSales = formData.totalUsd || formData.subtotalUsd || 0;
                  const marginPercent = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;
                  return `$${totalProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${marginPercent.toFixed(1)}%)`;
                })()}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Subtotal</span>
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#f1f5f9', marginLeft: '8px' }}>${(formData.subtotalUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Extras</span>
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#f1f5f9', marginLeft: '8px' }}>${(formData.extrasUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--border-default)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Grand Total</span>
                <span style={{ fontSize: '24px', fontWeight: 900, color: '#facc15', marginLeft: '10px', textShadow: '0 0 10px rgba(250,252,21,0.2)' }}>USD ${(formData.totalUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* Attachments (Dropzone) */}
          <div 
            style={{ 
              background: '#f8fafc', border: '2px dashed var(--border-default)', padding: '20px', 
              borderRadius: '8px', marginBottom: '16px', textAlign: 'center',
              position: 'relative', transition: 'all 0.2s'
            }}
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.background = '#eff6ff'; }}
            onDragLeave={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.background = '#f8fafc'; }}
            onDrop={e => {
              e.preventDefault();
              e.currentTarget.style.borderColor = 'var(--border-default)';
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
            <div style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '12px' }}>
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
                        background: '#fff', border: '1px solid var(--border-color)', borderRadius: '8px', 
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
                            style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border-default)' }} 
                          />
                        ) : (
                          <span style={{ fontSize: '20px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', borderRadius: '4px', border: '1px solid var(--border-default)' }}>
                            {isPdf ? '📄' : isExcel ? '📊' : '📎'}
                          </span>
                        )}
                      </div>

                      {/* File Name & Info */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left' }}>
                        <span 
                          onClick={() => { setActivePreviewUrl(att.url); setActivePreviewName(att.name); }}
                          style={{ color: 'var(--text-primary)', fontWeight: 600, textDecoration: 'none', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                          title="클릭하여 미리보기"
                        >
                          {att.name}
                        </span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>({(att.size / 1024).toFixed(1)}KB)</span>
                      </div>

                      {/* Action Buttons */}
                      <div style={{ display: 'flex', gap: '4px', marginLeft: '4px' }}>
                        <button 
                          type="button" 
                          onClick={() => { setActivePreviewUrl(att.url); setActivePreviewName(att.name); }}
                          style={{ background: '#f1f5f9', color: 'var(--text-secondary)', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '4px 6px', fontSize: '11px', fontWeight: 'bold' }}
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

          {/* 3D Container Loading Plan 시뮬레이션 첨부 */}
          <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px 16px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', marginTop: '12px' }}>
            <div style={{ marginBottom: '8px', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#2563eb', display: 'flex', alignItems: 'center', gap: '6px' }}>
                📦 3D Container Loading Plan 시뮬레이션 첨부
              </h3>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
              {/* .json file upload */}
              <div style={{ background: '#f8fafc', border: '1px dashed var(--border-default)', borderRadius: '8px', padding: '8px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>시뮬레이션 프로젝트 파일 (.json)</div>
                {formData.containerSimulation?.simulationFileUrl ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', color: '#0f766e', fontWeight: 600 }}>📁 {formData.containerSimulation.simulationFileName || '프로젝트 파일 완료'}</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <a href={formData.containerSimulation.simulationFileUrl} download style={{ padding: '4px 10px', background: 'var(--border-color)', borderRadius: '4px', textDecoration: 'none', color: '#334155', fontSize: '11px', fontWeight: 700 }}>다운로드</a>
                      <button type="button" onClick={() => setFormData(prev => ({ ...prev, containerSimulation: { ...(prev.containerSimulation || {}), simulationFileUrl: '', simulationFileName: '' } }))} title="삭제" style={{ padding: '4px 8px', background: '#fee2e2', border: 'none', borderRadius: '4px', color: '#dc2626', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>🗑️</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <input
                      type="file"
                      accept=".json"
                      id="sim-json-file"
                      onChange={e => e.target.files && handleSimFileUpload(e.target.files[0])}
                      style={{ display: 'none' }}
                    />
                    <label htmlFor="sim-json-file" style={{ padding: '6px 12px', background: '#3b82f6', color: '#fff', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', fontWeight: 600, display: 'inline-block' }}>
                      {isSimFileUploading ? '업로드 중...' : '프로젝트 파일 첨부'}
                    </label>
                  </div>
                )}
              </div>

              {/* image upload */}
              <div style={{ background: '#f8fafc', border: '1px dashed var(--border-default)', borderRadius: '8px', padding: '8px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>시뮬레이션 결과 스크린샷 이미지 (.png/.jpg)</div>
                {formData.containerSimulation?.simulationImageUrl ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <img src={formData.containerSimulation.simulationImageUrl} alt="Simulation Screenshot" style={{ width: '60px', height: '40px', objectFit: 'contain', border: '1px solid var(--border-default)', borderRadius: '4px' }} />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button" onClick={() => { setActivePreviewUrl(formData.containerSimulation?.simulationImageUrl || ''); setActivePreviewName('시뮬레이션 이미지'); }} style={{ padding: '4px 10px', background: 'var(--border-color)', border: 'none', borderRadius: '4px', color: '#334155', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>확대보기</button>
                      <button type="button" onClick={() => setFormData(prev => ({ ...prev, containerSimulation: { ...(prev.containerSimulation || {}), simulationImageUrl: '' } }))} title="삭제" style={{ padding: '4px 8px', background: '#fee2e2', border: 'none', borderRadius: '4px', color: '#dc2626', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>🗑️</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <input
                      type="file"
                      accept="image/*"
                      id="sim-image-file"
                      onChange={e => e.target.files && handleSimImageUpload(e.target.files[0])}
                      style={{ display: 'none' }}
                    />
                    <label htmlFor="sim-image-file" style={{ padding: '6px 12px', background: '#3b82f6', color: '#fff', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', fontWeight: 600, display: 'inline-block' }}>
                      {isSimImageUploading ? '업로드 중...' : '이미지 첨부'}
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #cbd5e1', background: '#fafafa', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '0 0 4px 4px', flexWrap: 'wrap', gap: '8px', height: '58px', boxSizing: 'border-box' }}>
          {/* ① ① 왼쪽: 발주 액션 */}
          <div>
            {initialPI && (
              <button
                type="button"
                onClick={handleConfirmPO}
                disabled={savingType !== null}
                style={{ padding: '8px 16px', borderRadius: '7px', border: '1px solid #fcd34d', background: '#fffbeb', color: '#92400e', fontWeight: 700, fontSize: '12.5px', cursor: savingType !== null ? 'not-allowed' : 'pointer' }}
              >
                {formData.status === 'PO확정' ? '📨 발주서 추가 발행 (재발주)' : '🤝 PO 확정 & 발주등록'}
              </button>
            )}
          </div>

          {/* 오른쪽: 저장/출력 그룹 */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button 
              onClick={handleCloseAttempt} 
              style={{ padding: '0 14px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f1f5f9', fontWeight: 700, fontSize: '13px', color: '#475569', cursor: 'pointer', height: '34px', boxSizing: 'border-box', transition: 'background 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e2e8f0'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
            >취소</button>

            {/* 구분선 */}
            <div style={{ width: '1px', height: '24px', background: '#cbd5e1' }} />

            <button type="button" onClick={() => generatePIPdf(formData as ProformaInvoice, items)}
              style={{ padding: '0 14px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, fontSize: '13px', color: '#dc2626', cursor: 'pointer', height: '34px', boxSizing: 'border-box', transition: 'background 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fef2f2'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}
            >
              📄 PDF
            </button>
            <button type="button" onClick={async () => {
              try {
                await generatePIExcel(formData as ProformaInvoice, items);
              } catch (err: any) {
                console.error("Excel generation error:", err);
                alert("❌ 엑셀 파일 생성 중 오류가 발생했습니다: " + (err?.message || err));
              }
            }}
              style={{ padding: '0 14px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, fontSize: '13px', color: '#16a34a', cursor: 'pointer', height: '34px', boxSizing: 'border-box', transition: 'background 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0fdf4'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}
            >
              📊 Excel
            </button>

            {/* 구분선 */}
            <div style={{ width: '1px', height: '24px', background: '#cbd5e1' }} />

            <button type="button" onClick={() => handleSave(false)} disabled={savingType !== null}
              style={{ padding: '0 18px', borderRadius: '4px', border: 'none', background: savingType === 'normal' ? '#93c5fd' : '#3b82f6', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: savingType !== null ? 'not-allowed' : 'pointer', opacity: savingType !== null && savingType !== 'normal' ? 0.5 : 1, height: '34px', boxSizing: 'border-box', transition: 'background 0.2s' }}
              onMouseEnter={e => { if (savingType === null) e.currentTarget.style.backgroundColor = '#2563eb'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#3b82f6'; }}
            >
              {savingType === 'normal' ? '✔ 저장 중...' : '✔ 일반저장'}
            </button>

            {initialPI && (
              <>
                {/* 오클릭 방지: 일반저장과 시각적 구분을 위한 여백 겸 구분선 */}
                <div style={{ width: '1px', height: '24px', background: '#cbd5e1', margin: '0 2px' }} />
                <button type="button" onClick={() => {
                  if (!window.confirm('Revision으로 저장하시겠습니까?\n(변경 사유가 기록에 남고 버전이 올라갑니다.)')) return;
                  handleSave(true);
                }} disabled={savingType !== null}
                  style={{ padding: '0 18px', borderRadius: '4px', border: 'none', background: savingType === 'revision' ? '#94a3b8' : '#1e293b', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: savingType !== null ? 'not-allowed' : 'pointer', opacity: savingType !== null && savingType !== 'revision' ? 0.5 : 1, height: '34px', boxSizing: 'border-box', transition: 'background 0.2s' }}
                  onMouseEnter={e => { if (savingType === null) e.currentTarget.style.backgroundColor = '#0f172a'; }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#1e293b'; }}
                >
                  {savingType === 'revision' ? '⚙ Revision 저장 중...' : '⚙ Revision 저장'}
                </button>
              </>
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
      {isProductSearchOpen && searchItemIndex !== null && (
        <ProductSearchModal
          products={products}
          initialSearchTerm={(() => {
            const item = items[searchItemIndex];
            if (!item || !item.productCode) return '';
            const rawCode = getRawProductCode(item.productCode);
            const found = products.find(p => p.productCode === rawCode || p.id === rawCode);
            if (found) {
              return found.nameEn || found.nameKo || found.productCode;
            }
            return item.productCode.replace(/\[.*?\]\s*/, '').trim();
          })()}
          onClose={() => {
            setIsProductSearchOpen(false);
            setSearchItemIndex(null);
          }}
          onSelect={(p) => {
            updateItem(searchItemIndex, 'productCode', p.productCode);
            setIsProductSearchOpen(false);
            setSearchItemIndex(null);
          }}
        />
      )}
      {isCustomerSearchOpen && (
        <CustomerSearchModal
          customers={customers}
          initialSearchQuery={formData.customerName || ''}
          onClose={() => setIsCustomerSearchOpen(false)}
          onSelect={(c) => {
            setFormData(prev => ({
              ...prev,
              customerId: c.id,
              customerName: c.name,
              customerAddress: c.addressEn || '',
              contactPerson: c.nameKo || '',
              email: c.email || '',
              destinationPort: c.shippingPort || prev.destinationPort,
              incoterms: c.preferredIncoterms || prev.incoterms,
              paymentTerms: c.paymentTerms || prev.paymentTerms
            }));
            setIsCustomerSearchOpen(false);
          }}
        />
      )}
      {isGeneratingDraft && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '32px', width: '380px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <span style={{ fontSize: '32px' }}>🪄</span>
            <span style={{ fontSize: '14px', fontWeight: 850, color: '#166534', textAlign: 'center' }}>
              AI가 요구사항을 해석하여 적정 마진율 단가 계산을 진행하고 견적서 초안을 작성 중입니다...
            </span>
            <div style={{ width: '100%', height: '6px', background: '#dcfce7', borderRadius: '3px', overflow: 'hidden', position: 'relative' }}>
              <div style={{
                position: 'absolute',
                top: 0, left: 0, bottom: 0,
                width: '60%',
                background: '#16a34a',
                borderRadius: '3px',
                animation: 'pulse 1.5s infinite ease-in-out'
              }}></div>
            </div>
            <span style={{ fontSize: '11px', color: '#166534' }}>약 2.5초의 시간이 소요됩니다.</span>
          </div>
        </div>
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
            <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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

const CompactInput = ({ label, value, onChange, type = 'text', disabled = false, placeholder = '', step }: any) => {
  const isRequired = label?.includes('★') || label?.includes('*');
  const isReadOnly = disabled;
  const inputStyle: React.CSSProperties = isReadOnly
    ? { padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '13.5px', color: '#64748b', background: '#f1f5f9', height: '34px', boxSizing: 'border-box', width: '100%', fontVariantNumeric: 'tabular-nums' }
    : { padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13.5px', color: '#1e293b', background: '#fff', height: '34px', boxSizing: 'border-box', width: '100%', outline: 'none', fontVariantNumeric: 'tabular-nums', fontWeight: isRequired ? 600 : 500 };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
      <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.04em', textTransform: 'uppercase' }} title={label}>
        {label?.replace(' ★', '').replace('★', '').replace(' *', '').replace('*', '')} {isRequired && !isReadOnly && <span style={{ color: '#ef4444' }}>*</span>}
        {isReadOnly && <span style={{ color: '#94a3b8', fontWeight: 400 }}> (자동)</span>}
      </label>
      {type === 'date' ? (
        <DateInput value={value ?? ''} onChange={(e: any) => onChange?.(e.target.value)} disabled={disabled} style={inputStyle} />
      ) : (
        <input type={type} value={value ?? ''} onChange={e => onChange?.(e.target.value)} disabled={disabled} placeholder={placeholder} step={step} style={inputStyle} />
      )}
    </div>
  );
};


const gridInputStyle = { width: '100%', height: '34px', padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13.5px', color: '#1e293b', outline: 'none', boxSizing: 'border-box' as const, fontVariantNumeric: 'tabular-nums' as const };

const formatNumberWithCommas = (value: number | string | undefined, maxDecimals?: number, minDecimals?: number) => {
  if (value === undefined || value === null || value === '') return '';
  const str = value.toString().replace(/,/g, '');
  if (isNaN(Number(str))) return str;
  let parts = str.split('.');
  if (maxDecimals !== undefined && parts.length > 1) {
      if (parts[1].length > maxDecimals) {
          parts[1] = parts[1].substring(0, maxDecimals);
      }
  }
  if (minDecimals !== undefined) {
    if (parts.length === 1) {
      parts.push('0'.repeat(minDecimals));
    } else if (parts[1].length < minDecimals) {
      parts[1] = parts[1] + '0'.repeat(minDecimals - parts[1].length);
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
  if (value === 0) return 0;
  const epsilon = 1e-9;
  const sign = value > 0 ? 1 : -1;
  const absValue = Math.abs(value);
  if (digits < 0) {
    const scale = Math.pow(10, Math.abs(digits));
    return sign * Math.ceil((absValue / scale) - epsilon) * scale;
  }
  const factor = Math.pow(10, digits);
  return sign * Math.ceil((absValue * factor) - epsilon) / factor;
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

const PurchasePriceInput: React.FC<{
  curCurrency: 'USD' | 'KRW';
  purchasePriceUsd: number;
  purchasePriceKrw: number;
  onChange: (updates: { purchasePriceUsd?: number; purchasePriceKrw?: number; purchasePriceCurrency?: 'USD' | 'KRW' }) => void;
}> = ({ curCurrency, purchasePriceUsd, purchasePriceKrw, onChange }) => {
  const [localVal, setLocalVal] = useState('');

  useEffect(() => {
    if (curCurrency === 'USD') {
      const parsedLocal = parseFloat(localVal.replace(/,/g, '')) || 0;
      if (parsedLocal !== purchasePriceUsd || (purchasePriceUsd === 0 && localVal !== '')) {
        setLocalVal(purchasePriceUsd === 0 ? '' : purchasePriceUsd.toString());
      }
    } else {
      const parsedLocal = parseFloat(localVal.replace(/,/g, '')) || 0;
      if (parsedLocal !== purchasePriceKrw || (purchasePriceKrw === 0 && localVal !== '')) {
        setLocalVal(formatNumberWithCommas(purchasePriceKrw));
      }
    }
  }, [curCurrency, purchasePriceUsd, purchasePriceKrw]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (curCurrency === 'USD') {
      // Allow valid decimal inputs (digits followed optionally by one dot and up to 2 digits)
      if (/^\d*\.?\d{0,2}$/.test(raw)) {
        setLocalVal(raw);
        const parsed = parseFloat(raw) || 0;
        onChange({
          purchasePriceUsd: parsed,
          purchasePriceKrw: 0,
          purchasePriceCurrency: 'USD'
        });
      }
    } else {
      // KRW handles commas and integer numbers
      const clean = raw.replace(/[^\d]/g, '');
      setLocalVal(formatNumberWithCommas(clean));
      const parsed = parseInt(clean, 10) || 0;
      onChange({
        purchasePriceKrw: parsed,
        purchasePriceUsd: 0,
        purchasePriceCurrency: 'KRW'
      });
    }
  };

  return (
    <input
      type="text"
      placeholder="금액"
      value={localVal}
      onChange={handleChange}
      style={{ ...gridInputStyle, textAlign: 'right', flex: 1 }}
    />
  );
};

const SalePriceInput: React.FC<{
  value: number;
  onChange: (val: number) => void;
}> = ({ value, onChange }) => {
  const [localVal, setLocalVal] = useState('');

  useEffect(() => {
    const parsedLocal = parseFloat(localVal.replace(/,/g, '')) || 0;
    if (parsedLocal !== value || (value === 0 && localVal !== '')) {
      setLocalVal(value === 0 ? '' : value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const cleanRaw = raw.replace(/,/g, '');
    if (/^\d*\.?\d{0,2}$/.test(cleanRaw)) {
      setLocalVal(raw);
      const parsed = parseFloat(cleanRaw) || 0;
      onChange(parsed);
    }
  };

  const handleBlur = () => {
    setLocalVal(value === 0 ? '' : value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  };

  return (
    <input
      type="text"
      value={localVal}
      onChange={handleChange}
      onBlur={handleBlur}
      style={{ ...gridInputStyle, textAlign: 'right', width: '80px' }}
    />
  );
};


