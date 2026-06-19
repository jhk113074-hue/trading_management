import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, setDoc, serverTimestamp, deleteDoc, collection } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, COMPANY_ID, storage } from '../firebase';
import type { Order, OrderItem, ForwarderEntry } from '../types/order';
import { getFormattedPoId } from '../types/order';
import type { Supplier } from '../types/supplier';
import type { Product } from '../types/product';
import { ProductModal } from '../components/ProductModal';
import { ProductSearchModal } from '../components/ProductSearchModal';
import { ArrivalReportModal } from '../components/ArrivalReportModal';

const steps = ["PO접수", "소싱발주", "선적관리", "정산마감"] as const;

export const OrderDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeStep, setActiveStep] = useState<typeof steps[number]>("PO접수");
  const isEditing = true;
  const [uploadingField, setUploadingField] = useState<'ciFiles' | 'plFiles' | 'cooFiles' | 'blFiles' | 'coaFiles' | 'testReportFiles' | 'otherFiles' | 'containerWorkFiles' | 'transportationFiles' | null>(null);
  const [uploadingCertSupplier, setUploadingCertSupplier] = useState<string | null>(null);
  const [piData, setPiData] = useState<any | null>(null);
  const [suppliersList, setSuppliersList] = useState<Supplier[]>([]);
  const [selectedAddSupplier, setSelectedAddSupplier] = useState('');
  const [activeSourcingTab, setActiveSourcingTab] = useState<'발주' | '도착보고_쉬핑마크' | 'COA_성적서' | '세금계산서_결제'>('발주');
  
  // Product & editor state variables
  const [products, setProducts] = useState<Product[]>([]);
  const [isProdModalOpen, setIsProdModalOpen] = useState(false);
  const [editingProd, setEditingProd] = useState<Product | undefined>(undefined);
  const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
  const [searchItemIndex, setSearchItemIndex] = useState<number | null>(null);
  
  // Editable arrays
  const [orderItems, setOrderItems] = useState<Partial<OrderItem>[]>([]);
  const [forwardersList, setForwardersList] = useState<ForwarderEntry[]>([]);
  const [activeArrivalReport, setActiveArrivalReport] = useState<{ supplierName: string; items: OrderItem[] } | null>(null);

  // Fetch products
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'companies', COMPANY_ID, 'products'), (snapshot) => {
      const list: Product[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Product);
      });
      setProducts(list);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'companies', COMPANY_ID, 'suppliers'), (snapshot) => {
      const list: Supplier[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Supplier);
      });
      setSuppliersList(list);
    });
    return () => unsubscribe();
  }, []);

  // Form states for details editing
  const [basicForm, setBasicForm] = useState({
    custPo: '',
    incoterms: 'FOB' as any,
    paymentTerms: '',
    poDate: '',
    requestedDelivery: '',
    remark: '',
    manager: '',
    externalLinksStr: '', // comma or newline separated links
    issuingCompany: 'YSACC' as 'YSACC' | 'YS',
    
    // New progress tracking fields
    ciNumber: '',
    vesselBooking: '',
    forwarderConfirmed: '',
    cargoReadyDate: '',
    cfsEntryDate: '',
    cfsContactInfo: '',
    docCutoffDate: '',
    etd: '',
    eta: '',
    containerVolumeQuantities: '',
    exportDeclarationNo: '',
    lcNo: '',
    customsExchangeRate: 0,
    dispatchStatusByVendor: '',
    containerWorkspaceType: '' as 'CFS' | 'Door' | '',
    shipmentCompleted: '' as 'Y' | 'N' | '',
    docsSentOrBankSubmitted: '',
    purchaseCertificateByVendor: '',
    paymentStatusByVendor: '',
    ciPlSentDate: '',
    bankSubmissionDate: '',
    paymentCollectedDate: '',

    // 8-step fields
    isLc: '' as 'Y' | 'N' | '',
    supplierPoSent: {} as Record<string, boolean>,
    supplierProductionDates: {} as Record<string, string>,
    forwarderQuotationAmount: 0,
    cfsAddress: '',
    cfsContact: '',
    ciPlStatus: '' as 'Y' | 'N' | '',
    containerWorkStatus: '',
    cooStatus: '' as 'Y' | 'N' | '',
    blStatus: '' as 'Y' | 'N' | '',
    shippingDocsSentStatus: '' as 'Y' | 'N' | '',
    shippingDocsSentDate: '',
    shippingDocsTrackingNo: '',
    supplierPayments: {} as Record<string, { status: string; date: string; }>,
    
    supplierTaxInvoice: {} as Record<string, 'Y' | 'N' | ''>,
    supplierPurchaseCertificate: {} as Record<string, 'Y' | 'N' | ''>,
    supplierTaxTypes: {} as Record<string, '영세' | '과세'>,
    supplierTaxInvoiceDetails: {} as Record<string, { date: string; invoiceNo: string; }>,
    supplierPurchaseCertFiles: {} as Record<string, Array<{ name: string; url: string; size: number; path: string }>>,
    supplierPaymentInstallments: {} as Record<string, Array<{ date: string; amount: number; }>>,
    bankSubmissionStatus: '' as 'Y' | 'N' | ''
  });

  // Load Order document
  useEffect(() => {
    if (!id) return;
    const docRef = doc(db, 'companies', COMPANY_ID, 'orders', id);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as Order;
        setOrder(data);
        const params = new URLSearchParams(window.location.search);
        const urlStep = params.get('step');
        if (urlStep && steps.includes(urlStep as any)) {
          setActiveStep(urlStep as any);
        } else if (data.status) {
          const mappedStatus = 
            data.status === '주문' ? 'PO접수' :
            data.status === '발주' ? '소싱발주' :
            data.status === '선적관리' ? '선적관리' :
            data.status === '이익관리' ? '정산마감' : 'PO접수';
          setActiveStep(mappedStatus as any);
        }
        setBasicForm({
          custPo: data.custPo || '',
          incoterms: data.incoterms || 'FOB',
          paymentTerms: data.paymentTerms || '',
          poDate: data.poDate || '',
          requestedDelivery: data.requestedDelivery || '',
          remark: data.remark || '',
          manager: data.manager || '',
          externalLinksStr: data.externalLinks ? data.externalLinks.join('\n') : '',
          issuingCompany: (data.issuingCompany || 'YSACC') as 'YSACC' | 'YS',
          
          ciNumber: data.ciNumber || '',
          vesselBooking: data.vesselBooking || '',
          forwarderConfirmed: data.forwarderConfirmed || '',
          cargoReadyDate: data.cargoReadyDate || '',
          cfsEntryDate: data.cfsEntryDate || '',
          cfsContactInfo: data.cfsContactInfo || '',
          docCutoffDate: data.docsDeadlineDate || data.docCutoffDate || '',
          etd: data.etd || '',
          eta: data.eta || '',
          containerVolumeQuantities: data.containerVolumeQuantities || '',
          exportDeclarationNo: data.exportDeclarationNo || '',
          lcNo: data.lcNo || '',
          customsExchangeRate: data.customsExchangeRate || 0,
          dispatchStatusByVendor: data.dispatchStatusByVendor || '',
          containerWorkspaceType: data.containerWorkspaceType || '',
          shipmentCompleted: data.shipmentCompleted || '',
          docsSentOrBankSubmitted: data.docsSentOrBankSubmitted || '',
          purchaseCertificateByVendor: data.purchaseCertificateByVendor || '',
          paymentStatusByVendor: data.paymentStatusByVendor || '',
          ciPlSentDate: data.ciPlSentDate || '',
          bankSubmissionDate: data.bankSubmissionDate || '',
          paymentCollectedDate: data.paymentCollectedDate || '',

          isLc: data.isLc || '',
          supplierPoSent: data.supplierPoSent || {},
          supplierProductionDates: data.supplierProductionDates || {},
          forwarderQuotationAmount: data.forwarderQuotationAmount || 0,
          cfsAddress: data.cfsAddress || '',
          cfsContact: data.cfsContact || '',
          ciPlStatus: data.ciPlStatus || '',
          containerWorkStatus: data.containerWorkStatus || '',
          cooStatus: data.cooStatus || '',
          blStatus: data.blStatus || '',
          shippingDocsSentStatus: data.shippingDocsSentStatus || '',
          shippingDocsSentDate: data.shippingDocsSentDate || '',
          shippingDocsTrackingNo: data.shippingDocsTrackingNo || '',
          supplierPayments: data.supplierPayments || {},
          
          supplierTaxInvoice: data.supplierTaxInvoice || {},
          supplierPurchaseCertificate: data.supplierPurchaseCertificate || {},
          supplierTaxTypes: data.supplierTaxTypes || {},
          supplierTaxInvoiceDetails: data.supplierTaxInvoiceDetails || {},
          supplierPurchaseCertFiles: data.supplierPurchaseCertFiles || {},
          supplierPaymentInstallments: data.supplierPaymentInstallments || {},
          bankSubmissionStatus: data.bankSubmissionStatus || ''
        });
        setOrderItems(data.items || []);
        setForwardersList(data.forwarders || []);
      } else {
        setOrder(null);
      }
      setLoading(false);
    }, (err) => {
      console.error("Failed to sync order details:", err);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [id, navigate]);

  // Load connected PI document
  useEffect(() => {
    if (!order?.quotationId) {
      setPiData(null);
      return;
    }
    const piRef = doc(db, 'companies', COMPANY_ID, 'proforma_invoices', order.quotationId);
    const unsubscribe = onSnapshot(piRef, (docSnap) => {
      if (docSnap.exists()) {
        setPiData(docSnap.data());
      } else {
        setPiData(null);
      }
    }, (err) => {
      console.warn("Failed to sync connected PI details:", err);
    });
    return () => unsubscribe();
  }, [order?.quotationId]);

  // Switch active tab view locally
  const handleStepClick = (stepName: typeof steps[number]) => {
    setActiveStep(stepName);
  };

  // Group items by supplier for Purchase Orders preview
  const groupedSupplierItems = useMemo(() => {
    if (!order || !order.items) return {};
    const groups: Record<string, OrderItem[]> = {};
    order.items.forEach(item => {
      const supplierName = item.supplier?.trim() || 'General Supplier';
      if (!groups[supplierName]) {
        groups[supplierName] = [];
      }
      groups[supplierName].push(item);
    });
    return groups;
  }, [order]);

  const allOrderSuppliers = useMemo(() => {
    if (!order) return [];
    const itemSuppliers = Object.keys(groupedSupplierItems).filter(s => s !== 'General Supplier');
    const additional = order.additionalSuppliers || [];
    return Array.from(new Set([...itemSuppliers, ...additional]));
  }, [groupedSupplierItems, order]);

  // Save details changes
  const handleSaveBasic = async () => {
    if (!order) return;
    try {
      const docRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
      const links = basicForm.externalLinksStr
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);

      // Validate items names
      if (orderItems.some(it => !it.name?.trim())) {
        alert('모든 품목의 품명을 입력해야 합니다.');
        return;
      }

      const totalAmount = orderItems.reduce((sum, item) => sum + (item.amount || 0), 0);
      const hasUsd = orderItems.some(it => it.currency === 'USD');
      const hasKrw = orderItems.some(it => it.currency === 'KRW');
      let orderCurrency: 'USD' | 'KRW' | 'mixed' = 'USD';
      if (hasUsd && hasKrw) {
        orderCurrency = 'mixed';
      } else if (hasKrw) {
        orderCurrency = 'KRW';
      }

      await setDoc(docRef, {
        custPo: basicForm.custPo,
        incoterms: basicForm.incoterms,
        paymentTerms: basicForm.paymentTerms,
        poDate: basicForm.poDate,
        requestedDelivery: basicForm.requestedDelivery,
        remark: basicForm.remark,
        manager: basicForm.manager,
        externalLinks: links,
        issuingCompany: basicForm.issuingCompany,
        
        ciNumber: basicForm.ciNumber,
        vesselBooking: basicForm.vesselBooking,
        forwarderConfirmed: basicForm.forwarderConfirmed,
        cargoReadyDate: basicForm.cargoReadyDate,
        cfsEntryDate: basicForm.cfsEntryDate,
        cfsContactInfo: basicForm.cfsContactInfo,
        docCutoffDate: basicForm.docCutoffDate,
        docsDeadlineDate: basicForm.docCutoffDate,
        etd: basicForm.etd,
        eta: basicForm.eta,
        containerVolumeQuantities: basicForm.containerVolumeQuantities,
        exportDeclarationNo: basicForm.exportDeclarationNo,
        lcNo: basicForm.lcNo,
        customsExchangeRate: Number(basicForm.customsExchangeRate) || 0,
        dispatchStatusByVendor: basicForm.dispatchStatusByVendor,
        containerWorkspaceType: basicForm.containerWorkspaceType,
        shipmentCompleted: basicForm.shipmentCompleted,
        docsSentOrBankSubmitted: basicForm.docsSentOrBankSubmitted,
        purchaseCertificateByVendor: basicForm.purchaseCertificateByVendor,
        paymentStatusByVendor: basicForm.paymentStatusByVendor,
        ciPlSentDate: basicForm.ciPlSentDate,
        bankSubmissionDate: basicForm.bankSubmissionDate,
        paymentCollectedDate: basicForm.paymentCollectedDate,

        // 8-step inputs saving
        isLc: basicForm.isLc,
        supplierPoSent: basicForm.supplierPoSent,
        supplierProductionDates: dataSupplierProdDates(basicForm.supplierProductionDates),
        forwarderQuotationAmount: Number(basicForm.forwarderQuotationAmount) || 0,
        cfsAddress: basicForm.cfsAddress,
        cfsContact: basicForm.cfsContact,
        ciPlStatus: basicForm.ciPlStatus,
        containerWorkStatus: basicForm.containerWorkStatus,
        cooStatus: basicForm.cooStatus,
        blStatus: basicForm.blStatus,
        shippingDocsSentStatus: basicForm.shippingDocsSentStatus,
        shippingDocsSentDate: basicForm.shippingDocsSentDate,
        shippingDocsTrackingNo: basicForm.shippingDocsTrackingNo,
        supplierPayments: basicForm.supplierPayments,
        
        supplierTaxInvoice: basicForm.supplierTaxInvoice,
        supplierPurchaseCertificate: basicForm.supplierPurchaseCertificate,
        supplierTaxTypes: basicForm.supplierTaxTypes,
        supplierTaxInvoiceDetails: basicForm.supplierTaxInvoiceDetails,
        supplierPurchaseCertFiles: basicForm.supplierPurchaseCertFiles,
        supplierPaymentInstallments: basicForm.supplierPaymentInstallments,
        bankSubmissionStatus: basicForm.bankSubmissionStatus,
        
        items: orderItems.map(it => ({
          itemId: it.itemId || '',
          name: it.name || '',
          supplier: it.supplier || '',
          supplierContact: it.supplierContact || '',
          grade: it.grade || '',
          qty: parseFloat(it.qty as any) || 0,
          unit: (it.unit || 'kg') as any,
          unitPrice: parseFloat(it.unitPrice as any) || 0,
          amount: it.amount || 0,
          currency: (it.currency || 'USD') as any
        })),
        totalAmount,
        currency: orderCurrency,
        forwarders: forwardersList,
        forwarderFreightAmount: forwardersList[0] ? (forwardersList[0].amountUsd || forwardersList[0].amountKrw || 0) : 0,
        forwarderFreightCurrency: (forwardersList[0] ? (forwardersList[0].amountUsd ? 'USD' : 'KRW') : 'KRW') as any,
        
        updatedAt: serverTimestamp()
      }, { merge: true });

      alert('✅ 저장되었습니다.');
    } catch (e: any) {
      alert('❌ 저장 실패: ' + e.message);
    }
  };

  const dataSupplierProdDates = (datesObj: any) => {
    return datesObj || {};
  };

  const getRawProductCode = (code: string | undefined): string => {
    if (!code) return '';
    const val = code.trim();
    if (val.startsWith('[') && val.includes(']')) {
      return val.substring(1, val.indexOf(']')).trim();
    }
    return val;
  };

  const handleItemChange = (index: number, field: keyof OrderItem, value: any) => {
    setOrderItems(prev => {
      const updated = [...prev];
      let it = { ...updated[index], [field]: value };
      
      if (field === 'name') {
        const parsedCode = getRawProductCode(value);
        const prod = products.find(p => p.productCode === parsedCode || p.id === parsedCode);
        if (prod) {
          const contactInfo = [prod.supplierEmail, prod.supplierPhone].filter(Boolean).join(' / ');
          const displayName = prod.nameEn || prod.nameKo || '';
          
          let buyPrice = prod.purchasePrice || 0;
          let itemCurrency: 'USD' | 'KRW' = (prod.currency === 'KRW' ? 'KRW' : 'USD');
          const qty = it.qty || 0;
          const amt = itemCurrency === 'KRW' ? Math.round(qty * buyPrice) : parseFloat((qty * buyPrice).toFixed(2));

          it = {
            ...it,
            name: `[${prod.productCode}] ${displayName}`,
            supplier: prod.supplierName || '',
            supplierContact: contactInfo || '',
            grade: prod.spec || '',
            unit: (prod.unit || 'kg') as any,
            unitPrice: buyPrice,
            currency: itemCurrency,
            amount: amt
          };
        }
      }

      if (field === 'qty' || field === 'unitPrice' || field === 'currency') {
        const qty = field === 'qty' ? parseFloat(value) || 0 : parseFloat(it.qty as any) || 0;
        const price = field === 'unitPrice' ? parseFloat(value) || 0 : parseFloat(it.unitPrice as any) || 0;
        const curr = field === 'currency' ? value : it.currency;
        if (curr === 'KRW') {
          it.amount = Math.round(qty * price);
        } else {
          it.amount = parseFloat((qty * price).toFixed(2));
        }
      }
      
      updated[index] = it;
      return updated;
    });
  };

  const handleSelectProduct = (idx: number, prod: Product) => {
    setOrderItems(prev => {
      const updated = [...prev];
      const contactInfo = [prod.supplierEmail, prod.supplierPhone].filter(Boolean).join(' / ');
      
      let buyPrice = prod.purchasePrice || 0;
      let itemCurrency: 'USD' | 'KRW' = (prod.currency === 'KRW' ? 'KRW' : 'USD');
      const qty = updated[idx].qty || 0;
      const amt = itemCurrency === 'KRW' ? Math.round(qty * buyPrice) : parseFloat((qty * buyPrice).toFixed(2));

      const displayName = prod.nameEn || prod.nameKo || '';

      updated[idx] = {
        ...updated[idx],
        name: `[${prod.productCode}] ${displayName}`,
        supplier: prod.supplierName || '',
        supplierContact: contactInfo || '',
        grade: prod.spec || '',
        unit: (prod.unit || 'kg') as any,
        unitPrice: buyPrice,
        currency: itemCurrency,
        amount: amt
      };
      return updated;
    });
  };

  const addItemRow = () => {
    setOrderItems(prev => [
      ...prev,
      { itemId: (prev.length + 1).toString(), name: '', supplier: '', supplierContact: '', grade: '', qty: 0, unit: 'kg', unitPrice: 0, amount: 0, currency: 'USD' }
    ]);
  };

  const removeItemRow = (index: number) => {
    if (orderItems.length === 1) return;
    setOrderItems(prev => prev.filter((_, idx) => idx !== index).map((it, idx) => ({ ...it, itemId: (idx + 1).toString() })));
  };

  const handleForwarderChange = (index: number, field: keyof ForwarderEntry, value: any) => {
    setForwardersList(prev => prev.map((f, i) => i === index ? { ...f, [field]: value } : f));
  };

  const addForwarderRow = () => {
    setForwardersList(prev => [...prev, { name: '', amountUsd: 0, amountKrw: 0 }]);
  };

  const removeForwarderRow = (index: number) => {
    setForwardersList(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddSupplier = async () => {
    if (!selectedAddSupplier || !order) return;
    const currentAdd = order.additionalSuppliers || [];
    if (currentAdd.includes(selectedAddSupplier) || Object.keys(groupedSupplierItems).includes(selectedAddSupplier)) {
      alert("이미 추가된 공급업체입니다.");
      return;
    }
    const updated = [...currentAdd, selectedAddSupplier];
    try {
      const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
      await setDoc(orderRef, { additionalSuppliers: updated, updatedAt: serverTimestamp() }, { merge: true });
      alert("공급업체가 추가되었습니다.");
      setSelectedAddSupplier('');
    } catch (err: any) {
      alert("공급업체 추가 실패: " + err.message);
    }
  };

  const handleRemoveSupplier = async (supplierName: string) => {
    if (!order) return;
    if (!window.confirm(`'${supplierName}' 공급업체를 이 주문에서 제외하시겠습니까?`)) return;
    const currentAdd = order.additionalSuppliers || [];
    const updated = currentAdd.filter(s => s !== supplierName);
    try {
      const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
      await setDoc(orderRef, { additionalSuppliers: updated, updatedAt: serverTimestamp() }, { merge: true });
      alert("공급업체가 제외되었습니다.");
    } catch (err: any) {
      alert("공급업체 제외 실패: " + err.message);
    }
  };

  // Upload document attachment file to Firebase Storage for specific fields (CI, PL, COO, BL, other)
  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>, fieldName: 'ciFiles' | 'plFiles' | 'cooFiles' | 'blFiles' | 'coaFiles' | 'testReportFiles' | 'otherFiles' | 'containerWorkFiles' | 'transportationFiles') => {
    const files = e.target.files;
    if (!files || files.length === 0 || !order) return;
    
    setUploadingField(fieldName);

    const file = files[0];
    const uniqueFileName = `${Date.now()}_${file.name}`;
    const storageRef = ref(storage, `tasks/${order.id}/${uniqueFileName}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on('state_changed', 
      () => {}, 
      (error) => {
        console.error("Upload failed", error);
        alert("업로드 중 에러가 발생했습니다: " + error.message);
        setUploadingField(null);
      }, 
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          const newAttachment = {
            name: file.name,
            url: downloadUrl,
            size: file.size,
            path: uploadTask.snapshot.ref.fullPath
          };

          const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
          const updatedList = [...(order[fieldName] || []), newAttachment];
          await setDoc(orderRef, { [fieldName]: updatedList, updatedAt: serverTimestamp() }, { merge: true });
          
          alert("✅ 파일이 성공적으로 업로드되었습니다.");
        } catch (err: any) {
          alert("파일 정보 저장 실패: " + err.message);
        } finally {
          setUploadingField(null);
        }
      }
    );
  };

  const handleSupplierCertUpload = async (file: File, supplierName: string) => {
    if (!order) return;
    setUploadingCertSupplier(supplierName);
    try {
      const uniqueFileName = `${Date.now()}_${file.name}`;
      const storageRef = ref(storage, `tasks/${order.id}/cert_${supplierName}/${uniqueFileName}`);
      const uploadTask = uploadBytesResumable(storageRef, file);
      
      await new Promise<void>((resolve, reject) => {
        uploadTask.on('state_changed', null, reject, () => resolve());
      });

      const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
      const newFile = {
        name: file.name,
        url: downloadUrl,
        size: file.size,
        path: uploadTask.snapshot.ref.fullPath
      };

      setBasicForm(prev => {
        const currentFiles = prev.supplierPurchaseCertFiles[supplierName] || [];
        return {
          ...prev,
          supplierPurchaseCertFiles: {
            ...prev.supplierPurchaseCertFiles,
            [supplierName]: [...currentFiles, newFile]
          }
        };
      });
      alert('✅ 구매확인서 파일이 성공적으로 업로드되었습니다.');
    } catch (err: any) {
      alert('❌ 업로드 실패: ' + err.message);
    } finally {
      setUploadingCertSupplier(null);
    }
  };

  const handleDeleteSupplierCertFile = (supplierName: string, idx: number) => {
    if (!window.confirm('이 파일을 삭제하시겠습니까?')) return;
    setBasicForm(prev => {
      const currentFiles = prev.supplierPurchaseCertFiles[supplierName] || [];
      const updated = currentFiles.filter((_, i) => i !== idx);
      return {
        ...prev,
        supplierPurchaseCertFiles: {
          ...prev.supplierPurchaseCertFiles,
          [supplierName]: updated
        }
      };
    });
  };

  // Delete document attachment from Storage & Firestore for specific fields
  const handleDeleteDoc = async (fieldName: 'ciFiles' | 'plFiles' | 'cooFiles' | 'blFiles' | 'coaFiles' | 'testReportFiles' | 'otherFiles' | 'containerWorkFiles' | 'transportationFiles', idx: number) => {
    if (!order) return;
    const fileList = order[fieldName] || [];
    const target = fileList[idx];
    if (!target) return;
    if (!window.confirm(`'${target.name}' 파일을 영구 삭제하시겠습니까?`)) return;

    try {
      if (target.path) {
        const fileRef = ref(storage, target.path);
        await deleteObject(fileRef).catch(e => console.warn("Failed to delete from storage:", e));
      }
      const updatedList = fileList.filter((_, i) => i !== idx);
      const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
      await setDoc(orderRef, { [fieldName]: updatedList, updatedAt: serverTimestamp() }, { merge: true });
      alert("✅ 파일이 삭제되었습니다.");
    } catch (err: any) {
      alert("파일 삭제 실패: " + err.message);
    }
  };

  // Helper render for document file attachment widgets
  const renderFileField = (
    label: string,
    fieldName: 'ciFiles' | 'plFiles' | 'cooFiles' | 'blFiles' | 'coaFiles' | 'testReportFiles' | 'otherFiles' | 'containerWorkFiles' | 'transportationFiles',
    inputDocId: string
  ) => {
    const fileList = order?.[fieldName] || [];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', border: '1px dashed #cbd5e1', borderRadius: '8px', padding: '12px', background: '#f8fafc' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>{label}</span>
        </div>
        {isEditing && (
          <div
            style={{
              background: '#ffffff',
              border: '1px dashed #cbd5e1',
              padding: '10px',
              borderRadius: '6px',
              textAlign: 'center',
              cursor: uploadingField === fieldName ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.background = '#eff6ff'; }}
            onDragLeave={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#ffffff'; }}
            onDrop={e => {
              e.preventDefault();
              e.currentTarget.style.borderColor = '#cbd5e1';
              e.currentTarget.style.background = '#ffffff';
              if (uploadingField !== null) return;
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const fakeEvent = { target: { files: e.dataTransfer.files } } as any;
                handleDocUpload(fakeEvent, fieldName);
              }
            }}
            onClick={() => {
              if (uploadingField !== fieldName) {
                document.getElementById(inputDocId)?.click();
              }
            }}
          >
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>
              {uploadingField === fieldName ? '⏳ 업로드 중...' : '📥 클릭 혹은 업로드할 파일 드래그'}
            </span>
            <input
              type="file"
              id={inputDocId}
              style={{ display: 'none' }}
              onChange={(e) => handleDocUpload(e, fieldName)}
              disabled={uploadingField !== null}
            />
          </div>
        )}
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
          {fileList.length > 0 ? (
            fileList.map((file, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '6px 10px', borderRadius: '4px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                <span style={{ fontSize: '12px', color: '#1e293b', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }} title={file.name}>
                  {file.name}
                </span>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <a href={file.url} download={file.name} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#eff6ff', color: '#3b82f6', border: 'none', borderRadius: '4px', width: '22px', height: '22px', fontSize: '12px', textDecoration: 'none' }} title="다운로드">
                    ⬇
                  </a>
                  {isEditing && (
                    <button
                      type="button"
                      onClick={() => handleDeleteDoc(fieldName, idx)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '4px', width: '22px', height: '22px', cursor: 'pointer', fontSize: '11px' }}
                      title="삭제"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            !isEditing && <span style={{ fontSize: '11.5px', color: '#94a3b8', fontStyle: 'italic' }}>첨부 파일 없음</span>
          )}
        </div>
      </div>
    );
  };



  // Grouped Supplier PO Print handler
  const handlePrintSupplierPo = (supplierName: string, items: OrderItem[]) => {
    if (!order) return;
    const taxType = basicForm.supplierTaxTypes[supplierName] || '과세';
    const cleanSupplierName = supplierName.replace(/\s+/g, '');
    const supplierCode = cleanSupplierName.substring(0, 3).toUpperCase();
    const poNum = `${getFormattedPoId(order.id, order.issuingCompany)}-${supplierCode}`;

    const logoVersion = Date.now();
    const isYS = order.issuingCompany === 'YS';

    const printHtml = `
      <html>
        <head>
          <title>발주서 - ${poNum}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&display=swap');
            body { font-family: 'Noto Sans KR', sans-serif; padding: 20px; color: #000; font-size: 12px; line-height: 1.4; }
            .no-print { display: block; position: fixed; top: 15px; right: 15px; padding: 10px 20px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 13px; z-index: 9999; }
            @media print {
              .no-print { display: none !important; }
              body { padding: 0; }
            }
            .po-title-container { text-align: center; margin-bottom: 25px; position: relative; }
            .po-title { font-size: 36px; font-weight: 800; letter-spacing: 12px; margin: 0; display: inline-block; border-bottom: 2px solid #000; padding-bottom: 5px; }
            .po-subtitle { position: absolute; right: 0; bottom: 5px; font-size: 11px; font-weight: bold; }
            
            .meta-grid { display: grid; grid-template-columns: 1.1fr 1.3fr; gap: 10px; margin-bottom: 15px; }
            .meta-left { display: flex; flex-direction: column; gap: 4px; justify-content: center; }
            .meta-left div { font-size: 11px; }
            .meta-left strong { width: 70px; display: inline-block; }

            .business-table { width: 100%; border-collapse: collapse; font-size: 11px; text-align: center; }
            .business-table th, .business-table td { border: 1px solid #000; padding: 4px; height: 26px; }
            .business-table th { background-color: #f3f4f6; font-weight: 600; width: 25%; }
            .business-table td { width: 75%; position: relative; }
            
            .supplier-seal-container { display: flex; align-items: center; justify-content: space-between; font-weight: bold; padding: 0 10px; width: 100%; height: 100%; box-sizing: border-box; }
            .supplier-seal-container img.seal-bg { position: absolute; left: 45%; top: 50%; transform: translate(-50%, -50%); height: 28px; width: auto; z-index: 1; opacity: 0.12; }
            .supplier-seal-container img.seal-stamp { position: absolute; right: 20px; top: 50%; transform: translateY(-50%); height: 48px; width: auto; z-index: 5; opacity: 0.85; }

            .delivery-info { border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 8px 0; margin-bottom: 15px; font-size: 12px; }
            .delivery-info div { margin-bottom: 4px; }
            .delivery-info div:last-child { margin-bottom: 0; }

            .items-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 11px; }
            .items-table th, .items-table td { border: 1px solid #000; padding: 6px 4px; }
            .items-table th { background-color: #f3f4f6; font-weight: 600; text-align: center; }
            .items-table td { text-align: left; }
            .items-table td.center { text-align: center; }
            .items-table td.right { text-align: right; }

            .notes-box { border: 1.5px solid #000; padding: 10px; margin-bottom: 15px; font-size: 11px; }
            .notes-title { font-weight: 700; margin-bottom: 5px; text-decoration: underline; }
            .notes-box ol { margin: 0; padding-left: 15px; }
            .notes-box li { margin-bottom: 4px; }

            .bottom-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 11px; }
            .bottom-box { border: 1px solid #000; padding: 8px; min-height: 80px; }
            .bottom-box-title { font-weight: 700; margin-bottom: 4px; }
            
            .bottom-table { width: 100%; border-collapse: collapse; margin-top: 5px; }
            .bottom-table td { border: 1px solid #000; padding: 3px; font-size: 10px; }
            .bottom-table td.label { background-color: #f3f4f6; text-align: center; font-weight: 600; width: 20%; }
            .bottom-table td.value { text-align: center; width: 80%; }

            .footer-name { text-align: center; margin-top: 25px; font-size: 18px; font-weight: 900; letter-spacing: 2px; display: flex; align-items: center; justify-content: center; gap: 8px; }
            .footer-logo { height: 24px; width: auto; object-fit: contain; }
          </style>
        </head>
        <body>
          <button class="no-print" onclick="window.print()">🖨️ 인쇄하기 / PDF 저장</button>
          
          <div class="po-title-container">
            <h1 class="po-title">발 주 서</h1>
            <div class="po-subtitle">* 물탱크용 부자재 및 관련 자재</div>
          </div>

          <div class="meta-grid">
            <div class="meta-left">
              <div><strong>발주번호 :</strong> ${poNum}</div>
              <div><strong>발주일자 :</strong> ${new Date().toISOString().split('T')[0].replace(/-/g, '년 ').concat('일').replace(/(\d{4})년\s0?(\d{1,2})월\s0?(\d{1,2})일/, '$1년 $2월 $3일')}</div>
              <div><strong>수&nbsp;&nbsp;&nbsp;&nbsp;신 :</strong> ${supplierName}</div>
            </div>
            <div>
              <table class="business-table">
                <tr>
                  <th>등록번호</th>
                  <td style="font-weight: bold; letter-spacing: 1px;">${isYS ? '730-17-00185' : '217-87-00384'}</td>
                </tr>
                <tr>
                  <th>상  호</th>
                  <td style="position: relative; padding: 0;">
                    <div class="supplier-seal-container">
                      <img src="/logo.png?v=${logoVersion}" class="seal-bg" />
                      <img src="${isYS ? '/YS_ACC_STAMP.jpg' : '/YSACC_STAMP.png'}?v=${logoVersion}" class="seal-stamp" />
                      <div style="width: 100%; display: flex; justify-content: space-between; padding: 0 10px; z-index: 3; position: relative;">
                        <span>${isYS ? '영성에이씨씨(영성ACC)' : '(주)와이에스에이씨씨'}</span>
                        <span style="font-weight: normal; margin-right: 50px;">김 주 한</span>
                      </div>
                    </div>
                  </td>
                </tr>
                <tr>
                  <th>사업장</th>
                  <td style="font-size: 10px; text-align: left; padding-left: 8px;">${isYS ? '충북 청주시 흥덕구 월명로 76, 111-201호' : '충북 청주시 흥덕구 가로수로 1251, 201-1호'}</td>
                </tr>
                <tr>
                  <th>업  태</th>
                  <td>${isYS ? '도소매업 외' : '제조업 외'}</td>
                </tr>
                <tr>
                  <th>종  목</th>
                  <td>${isYS ? '물탱크 및 기자재' : '물탱크 및 관련부품'}</td>
                </tr>
              </table>
            </div>
          </div>

          <div style="font-weight: bold; font-size: 12px; margin-bottom: 15px;">하기와 같이 발주 드립니다.</div>

          <div class="delivery-info">
            <div><strong>입고요청일 :</strong> 추후 안내 예정</div>
            <div><strong>납품처(주소, 담당자, 연락처) :</strong> 추후 통보예정</div>
          </div>

          <table class="items-table">
            <thead>
              <tr>
                <th style="width: 100px;">상품코드</th>
                <th style="width: 200px;">품 명</th>
                <th style="width: 120px;">스 펙</th>
                <th style="width: 60px;">수량</th>
                <th style="width: 80px;">단 가</th>
                <th style="width: 100px;">금 액</th>
                <th style="width: 90px;">부가세</th>
                <th>비 고</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((it) => {
                const isKrw = it.currency === 'KRW';
                const currencySymbol = isKrw ? '' : '$';
                const price = it.purchaseUnitPrice !== undefined ? it.purchaseUnitPrice : it.unitPrice;
                const rawAmt = price * (it.qty || 0);
                const vatAmt = taxType === '영세' ? 0 : (isKrw ? Math.round(rawAmt * 0.1) : parseFloat((rawAmt * 0.1).toFixed(2)));
                const match = it.name.match(/^\[(.*?)\]\s*(.*)$/);
                const itemCode = match ? match[1] : '-';
                const itemName = match ? match[2] : it.name;
                return `
                  <tr>
                    <td class="center">${itemCode}</td>
                    <td><strong>${itemName}</strong></td>
                    <td class="center">${it.grade || '-'}</td>
                    <td class="right">${(it.qty || 0).toLocaleString()}</td>
                    <td class="right">${currencySymbol}${price.toLocaleString(undefined, isKrw ? {} : { minimumFractionDigits: 2 })}</td>
                    <td class="right">${currencySymbol}${rawAmt.toLocaleString(undefined, isKrw ? {} : { minimumFractionDigits: 2 })}</td>
                    <td class="right">${currencySymbol}${vatAmt.toLocaleString(undefined, isKrw ? {} : { minimumFractionDigits: 2 })}</td>
                    <td style="font-size: 10px; color: #475569;">${it.unit} 발주</td>
                  </tr>
                `;
              }).join('')}
              
              <!-- Blank rows for layout stability -->
              ${Array.from({ length: Math.max(0, 5 - items.length) }).map(() => `
                <tr>
                  <td style="height: 25px;"></td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                </tr>
              `).join('')}

              <tr style="font-weight: bold; background-color: #fafafa;">
                <td colspan="3" class="center">합   계</td>
                <td class="right">${items.reduce((sum, it) => sum + (it.qty || 0), 0).toLocaleString()}</td>
                <td></td>
                <td class="right">
                  ${(() => {
                    const usdSub = items.filter(it => it.currency !== 'KRW').reduce((sum, it) => {
                      const price = it.purchaseUnitPrice !== undefined ? it.purchaseUnitPrice : it.unitPrice;
                      return sum + price * (it.qty || 0);
                    }, 0);
                    const krwSub = items.filter(it => it.currency === 'KRW').reduce((sum, it) => {
                      const price = it.purchaseUnitPrice !== undefined ? it.purchaseUnitPrice : it.unitPrice;
                      return sum + price * (it.qty || 0);
                    }, 0);
                    const parts = [];
                    if (usdSub > 0) parts.push(`$${usdSub.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
                    if (krwSub > 0) parts.push(`${krwSub.toLocaleString()}`);
                    return parts.join(' / ');
                  })()}
                </td>
                <td class="right">
                  ${(() => {
                    const usdTotal = items.filter(it => it.currency !== 'KRW').reduce((sum, it) => {
                      const price = it.purchaseUnitPrice !== undefined ? it.purchaseUnitPrice : it.unitPrice;
                      return sum + price * (it.qty || 0);
                    }, 0);
                    const krwTotal = items.filter(it => it.currency === 'KRW').reduce((sum, it) => {
                      const price = it.purchaseUnitPrice !== undefined ? it.purchaseUnitPrice : it.unitPrice;
                      return sum + price * (it.qty || 0);
                    }, 0);
                    const usdVat = taxType === '영세' ? 0 : parseFloat((usdTotal * 0.1).toFixed(2));
                    const krwVat = taxType === '영세' ? 0 : Math.round(krwTotal * 0.1);
                    const parts = [];
                    if (usdTotal > 0) parts.push(`$${usdVat.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
                    if (krwTotal > 0) parts.push(`${krwVat.toLocaleString()}`);
                    return parts.join(' / ');
                  })()}
                </td>
                <td class="right" style="color: #dc2626;">
                  ${(() => {
                    const usdTotal = items.filter(it => it.currency !== 'KRW').reduce((sum, it) => {
                      const price = it.purchaseUnitPrice !== undefined ? it.purchaseUnitPrice : it.unitPrice;
                      return sum + price * (it.qty || 0);
                    }, 0);
                    const krwTotal = items.filter(it => it.currency === 'KRW').reduce((sum, it) => {
                      const price = it.purchaseUnitPrice !== undefined ? it.purchaseUnitPrice : it.unitPrice;
                      return sum + price * (it.qty || 0);
                    }, 0);
                    const usdVat = taxType === '영세' ? 0 : parseFloat((usdTotal * 0.1).toFixed(2));
                    const krwVat = taxType === '영세' ? 0 : Math.round(krwTotal * 0.1);
                    const usdGrand = usdTotal + usdVat;
                    const krwGrand = krwTotal + krwVat;
                    const parts = [];
                    if (usdTotal > 0) parts.push(`$${usdGrand.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD`);
                    if (krwTotal > 0) parts.push(`₩${krwGrand.toLocaleString()} KRW`);
                    return parts.join(' / ');
                  })()}
                </td>
              </tr>
            </tbody>
          </table>

          <div class="notes-box">
            <div class="notes-title">※ 특이사항:</div>
            <ol>
              <li>부산항 도착도 조건 (기본 인코텀즈: ${order.incoterms || 'FOB'})</li>
              <li>세금계산서는 ${taxType === '영세' ? '영세율 전자세금계산서' : '일반 전자세금계산서'} 발급조건입니다.</li>
              <li>Shipping Mark는 출하 3일 전에 보내드릴 예정입니다.</li>
            </ol>
          </div>

          <div class="bottom-grid">
            <div class="bottom-box">
              <div class="bottom-box-title">※ 일반사항</div>
              <div style="font-size: 10px; color: #334155; line-height: 1.4;">
                1. 부가가치세(VAT): 일반 전자세금계산서 발행 기준<br/>
                2. 결제조건: ${order.paymentTerms || '현금 선입금 후 출고 조건 결제'}
              </div>
            </div>
            <div class="bottom-box" style="padding: 4px;">
              <div class="bottom-box-title" style="margin-left: 4px; font-size: 11px;">※ 참고사항</div>
              <table class="bottom-table">
                <tr>
                  <td colspan="2" class="label" style="height: 18px; padding: 2px;">발주담당</td>
                </tr>
                <tr>
                  <td class="label">직 위</td>
                  <td class="value">대표이사</td>
                </tr>
                <tr>
                  <td class="label">성 명</td>
                  <td class="value">김 주 한</td>
                </tr>
                <tr>
                  <td class="label">연락처</td>
                  <td class="value">010-4494-1028</td>
                </tr>
              </table>
            </div>
          </div>

          <div class="footer-name">
            <img src="/logo.png?v=${logoVersion}" class="footer-logo" />
            <span>${isYS ? '영성에이씨씨' : '(주)와이에스에이씨씨'}</span>
          </div>
        </body>
      </html>
    `;

    const printWin = window.open('', '_blank', 'width=850,height=900,scrollbars=yes,resizable=yes');
    if (printWin) {
      printWin.document.write(printHtml);
      printWin.document.close();
    } else {
      alert("팝업이 차단되었습니다. 팝업 설정을 확인해 주세요.");
    }
  };

  const handleEmailSupplierPo = (supplierName: string, items: OrderItem[]) => {
    if (!order) return;
    const cleanSupplierName = supplierName.replace(/\s+/g, '');
    const supplierCode = cleanSupplierName.substring(0, 3).toUpperCase();
    const poNum = `${getFormattedPoId(order.id, order.issuingCompany)}-${supplierCode}`;

    const email = prompt("발송할 공급업체 이메일 주소를 입력해주세요:", "");
    if (email === null) return; // User cancelled

    const subject = encodeURIComponent(`[발주서] PO No: ${poNum} (${order.issuingCompany === 'YS' ? 'YS ACC' : 'YSACC CO., LTD.'})`);
    
    const itemsText = items.map(it => {
      const price = it.purchaseUnitPrice !== undefined ? it.purchaseUnitPrice : it.unitPrice;
      const currencySymbol = it.currency === 'KRW' ? '₩' : '$';
      const spec = it.grade ? ` / 규격: ${it.grade}` : '';
      return `- 품명: ${it.name}${spec} / 수량: ${it.qty?.toLocaleString()} ${it.unit} / 단가: ${currencySymbol}${price.toLocaleString()}`;
    }).join('\n');

    const body = encodeURIComponent(
      `안녕하세요,\n\n` +
      `${supplierName} 담당자님 귀하,\n\n` +
      `아래와 같이 발주서를 전달해 드립니다.\n\n` +
      `- 발주번호: ${poNum}\n` +
      `- 발주일자: ${new Date().toISOString().split('T')[0]}\n\n` +
      `[발주 내역]\n` +
      `${itemsText}\n\n` +
      `자세한 내용은 본 이메일 혹은 시스템에 접속하여 첨부된 발주서(PDF)를 참조해 주시기 바랍니다.\n` +
      `감사합니다.\n` +
      `\n` +
      `${order.issuingCompany === 'YS' ? '영성에이씨씨' : '(주)와이에스에이씨씨'} 대표이사 김주한`
    );

    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  };

  // Shipping Mark Print handler
  const handlePrintShippingMark = (supplierName: string) => {
    if (!order) return;
    const isYS = order.issuingCompany === 'YS';

    const printHtml = `
      <html>
        <head>
          <title>SHIPPING MARK - ${supplierName}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap');
            body { font-family: 'Outfit', sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 95vh; margin: 0; padding: 20px; box-sizing: border-box; }
            .no-print { display: block; position: fixed; top: 15px; right: 15px; padding: 10px 20px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 13px; z-index: 9999; }
            @media print {
              .no-print { display: none !important; }
            }
            .mark-container { border: 8px solid #000; padding: 40px 60px; width: 90%; max-width: 700px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 24px; position: relative; }
            
            .diamond-wrapper { position: relative; width: 350px; height: 180px; display: flex; align-items: center; justify-content: center; margin: 20px 0; }
            .diamond { position: absolute; top: 0; left: 50%; transform: translateX(-50%) rotate(45deg); width: 180px; height: 180px; border: 4px solid #1e3a8a; }
            .diamond-text { font-size: 44px; font-weight: 900; color: #1e3a8a; letter-spacing: 2px; z-index: 5; text-transform: uppercase; }

            .info-block { font-size: 26px; font-weight: 700; color: #000; line-height: 1.5; text-transform: uppercase; }
            .info-label { color: #4b5563; font-size: 20px; font-weight: 500; display: block; margin-bottom: 2px; }
          </style>
        </head>
        <body>
          <button class="no-print" onclick="window.print()">인쇄 / PDF 저장</button>
          
          <div class="mark-container">
            <div class="diamond-wrapper">
              <div class="diamond"></div>
              <div class="diamond-text">${isYS ? 'YS ACC' : 'YSACC'}</div>
            </div>
            
            <div style="border-top: 3px solid #000; width: 100%; margin: 10px 0;"></div>

            <div class="info-block">
              <span class="info-label">Destination Port</span>
              JEBEL ALI, UAE
            </div>

            <div class="info-block">
              <span class="info-label">Origin Country</span>
              MADE IN KOREA
            </div>

            <div class="info-block" style="margin-top: 10px;">
              <span class="info-label">Package Tracking</span>
              PO NO: ${getFormattedPoId(order.id, order.issuingCompany)}<br/>
              SUPPLIER: ${supplierName}
            </div>
          </div>
        </body>
      </html>
    `;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(printHtml);
      win.document.close();
    }
  };

  // CI automated print handler
  const handlePrintCI = () => {
    if (!order) return;
    const isYS = order.issuingCompany === 'YS';
    const ciNum = basicForm.ciNumber || `CI-${order.id}`;

    const totalQty = order.items?.reduce((sum, it) => sum + (it.qty || 0), 0) || 0;
    const totalAmt = order.items?.reduce((sum, it) => sum + (it.amount || 0), 0) || 0;

    const printHtml = `
      <html>
        <head>
          <title>COMMERCIAL INVOICE - ${ciNum}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&display=swap');
            body { font-family: 'Noto Sans KR', sans-serif; padding: 20px; color: #000; font-size: 11px; line-height: 1.4; }
            .no-print { display: block; position: fixed; top: 15px; right: 15px; padding: 10px 20px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 13px; z-index: 9999; }
            @media print {
              .no-print { display: none !important; }
              body { padding: 0; }
            }
            .header-title { text-align: center; font-size: 32px; font-weight: 800; text-transform: uppercase; margin-bottom: 25px; border-bottom: 3px double #000; padding-bottom: 10px; }
            
            .info-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 20px; margin-bottom: 20px; }
            .info-box { border: 1px solid #000; padding: 10px; min-height: 100px; }
            .info-title { font-weight: bold; font-size: 12px; border-bottom: 1px solid #000; padding-bottom: 4px; margin-bottom: 6px; text-transform: uppercase; }

            .desc-table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
            .desc-table th, .desc-table td { border: 1px solid #000; padding: 8px 6px; }
            .desc-table th { background: #f3f4f6; font-weight: bold; text-align: center; }
            .desc-table td.right { text-align: right; }
            .desc-table td.center { text-align: center; }
            
            .total-row { font-weight: bold; background: #fafafa; }
            .signature-area { margin-top: 50px; text-align: right; font-size: 12px; font-weight: bold; }
          </style>
        </head>
        <body>
          <button class="no-print" onclick="window.print()">인쇄 / PDF 저장</button>
          <div class="header-title">COMMERCIAL INVOICE</div>
          
          <div class="info-grid">
            <div class="info-box">
              <div class="info-title">Shipper / Exporter</div>
              <strong>${isYS ? 'YS ACC' : '(주)와이에스에이씨씨'}</strong><br/>
              ${isYS ? '경기 김포시 양촌읍 듬박로 89' : '서울 강남구 테헤란로 419, 16층'}<br/>
              TEL: 010-4494-1028
            </div>
            <div class="info-box">
              <div class="info-title">Invoice Information</div>
              <strong>Invoice No:</strong> ${ciNum}<br/>
              <strong>Date:</strong> ${basicForm.poDate || new Date().toISOString().split('T')[0]}<br/>
              <strong>L/C No:</strong> ${basicForm.lcNo || 'T/T Payment'}<br/>
              <strong>Incoterms:</strong> ${basicForm.incoterms || 'FOB'}
            </div>
          </div>

          <div class="info-grid" style="margin-bottom: 15px;">
            <div class="info-box">
              <div class="info-title">For Account & Risk of Messrs (Buyer)</div>
              <strong>${order.customer}</strong><br/>
              ${order.paymentTerms || 'As per contract Terms'}
            </div>
            <div class="info-box">
              <div class="info-title">Shipping Information</div>
              <strong>Vessel / Voyage:</strong> ${basicForm.vesselBooking || 'TBD'}<br/>
              <strong>ETD:</strong> ${basicForm.etd || 'TBD'}<br/>
              <strong>ETA:</strong> ${basicForm.eta || 'TBD'}<br/>
              <strong>POL / POD:</strong> BUSAN, KOREA / JEBEL ALI, UAE
            </div>
          </div>

          <table class="desc-table">
            <thead>
              <tr>
                <th style="width: 8%">No</th>
                <th>Description of Goods</th>
                <th style="width: 12%">Quantity</th>
                <th style="width: 12%">Unit Price</th>
                <th style="width: 18%">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${(order.items || []).map((it, idx) => `
                <tr>
                  <td class="center">${idx + 1}</td>
                  <td><strong>${it.name}</strong><br/><small>Spec: ${it.grade || '-'}</small></td>
                  <td class="center">${it.qty?.toLocaleString()} ${it.unit}</td>
                  <td class="right">${it.currency === 'KRW' ? '₩' : '$'}${it.unitPrice?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td class="right" style="font-weight: bold;">${it.currency === 'KRW' ? '₩' : '$'}${it.amount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="2" class="center">TOTAL</td>
                <td class="center">${totalQty.toLocaleString()}</td>
                <td></td>
                <td class="right">${order.currency === 'KRW' ? '₩' : '$'}${totalAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              </tr>
            </tbody>
          </table>

          <div class="signature-area">
            For and on behalf of<br/>
            ${isYS ? 'YS ACC' : 'YSACC CO., LTD.'}<br/><br/><br/>
            _______________________________<br/>
            Authorized Signature(s)
          </div>
        </body>
      </html>
    `;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(printHtml);
      win.document.close();
    }
  };

  // PL automated print handler
  const handlePrintPL = () => {
    if (!order) return;
    const isYS = order.issuingCompany === 'YS';
    const ciNum = basicForm.ciNumber || `CI-${order.id}`;

    const totalQty = order.items?.reduce((sum, it) => sum + (it.qty || 0), 0) || 0;

    const printHtml = `
      <html>
        <head>
          <title>PACKING LIST - ${ciNum}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&display=swap');
            body { font-family: 'Noto Sans KR', sans-serif; padding: 20px; color: #000; font-size: 11px; line-height: 1.4; }
            .no-print { display: block; position: fixed; top: 15px; right: 15px; padding: 10px 20px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 13px; z-index: 9999; }
            @media print {
              .no-print { display: none !important; }
              body { padding: 0; }
            }
            .header-title { text-align: center; font-size: 32px; font-weight: 800; text-transform: uppercase; margin-bottom: 25px; border-bottom: 3px double #000; padding-bottom: 10px; }
            
            .info-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 20px; margin-bottom: 20px; }
            .info-box { border: 1px solid #000; padding: 10px; min-height: 100px; }
            .info-title { font-weight: bold; font-size: 12px; border-bottom: 1px solid #000; padding-bottom: 4px; margin-bottom: 6px; text-transform: uppercase; }

            .desc-table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
            .desc-table th, .desc-table td { border: 1px solid #000; padding: 8px 6px; }
            .desc-table th { background: #f3f4f6; font-weight: bold; text-align: center; }
            .desc-table td.right { text-align: right; }
            .desc-table td.center { text-align: center; }
            
            .total-row { font-weight: bold; background: #fafafa; }
            .signature-area { margin-top: 50px; text-align: right; font-size: 12px; font-weight: bold; }
          </style>
        </head>
        <body>
          <button class="no-print" onclick="window.print()">인쇄 / PDF 저장</button>
          <div class="header-title">PACKING LIST</div>
          
          <div class="info-grid">
            <div class="info-box">
              <div class="info-title">Shipper / Exporter</div>
              <strong>${isYS ? 'YS ACC' : '(주)와이에스에이씨씨'}</strong><br/>
              ${isYS ? '경기 김포시 양촌읍 듬박로 89' : '서울 강남구 테헤란로 419, 16층'}<br/>
              TEL: 010-4494-1028
            </div>
            <div class="info-box">
              <div class="info-title">Invoice Information</div>
              <strong>Invoice No:</strong> ${ciNum}<br/>
              <strong>Date:</strong> ${basicForm.poDate || new Date().toISOString().split('T')[0]}<br/>
              <strong>L/C No:</strong> ${basicForm.lcNo || 'T/T Payment'}<br/>
              <strong>Incoterms:</strong> ${basicForm.incoterms || 'FOB'}
            </div>
          </div>

          <div class="info-grid" style="margin-bottom: 15px;">
            <div class="info-box">
              <div class="info-title">For Account & Risk of Messrs (Buyer)</div>
              <strong>${order.customer}</strong><br/>
              ${order.paymentTerms || 'As per contract Terms'}
            </div>
            <div class="info-box">
              <div class="info-title">Shipping Information</div>
              <strong>Vessel / Voyage:</strong> ${basicForm.vesselBooking || 'TBD'}<br/>
              <strong>ETD:</strong> ${basicForm.etd || 'TBD'}<br/>
              <strong>ETA:</strong> ${basicForm.eta || 'TBD'}<br/>
              <strong>POL / POD:</strong> BUSAN, KOREA / JEBEL ALI, UAE
            </div>
          </div>

          <table class="desc-table">
            <thead>
              <tr>
                <th style="width: 8%">No</th>
                <th>Description of Goods</th>
                <th style="width: 12%">Quantity</th>
              </tr>
            </thead>
            <tbody>
              ${(order.items || []).map((it, idx) => `
                <tr>
                  <td class="center">${idx + 1}</td>
                  <td><strong>${it.name}</strong><br/><small>Spec: ${it.grade || '-'}</small></td>
                  <td class="center">${it.qty?.toLocaleString()} ${it.unit}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="2" class="center">TOTAL</td>
                <td class="center">${totalQty.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>

          <div class="signature-area">
            For and on behalf of<br/>
            ${isYS ? 'YS ACC' : 'YSACC CO., LTD.'}<br/><br/><br/>
            _______________________________<br/>
            Authorized Signature(s)
          </div>
        </body>
      </html>
    `;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(printHtml);
      win.document.close();
    }
  };

  const handleDeleteOrder = async () => {
    if (!order) return;
    if (!window.confirm("⚠️ 이 발주서(PO)를 영구 삭제하고 발주를 취소하시겠습니까?\n연결된 Proforma Invoice(PI)의 상태가 다시 'PO확정' 대기 상태로 되돌아갑니다.")) return;
    
    try {
      // 1. Delete PO document
      const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
      await deleteDoc(orderRef);
      
      // 2. Revert PI status to 'confirmed' if quotationId is linked
      if (order.quotationId) {
        const piRef = doc(db, 'companies', COMPANY_ID, 'proforma_invoices', order.quotationId);
        await setDoc(piRef, { status: 'confirmed', updatedAt: serverTimestamp() }, { merge: true });
      }
      
      alert("✅ 발주서(PO)가 취소 및 삭제되었으며, PI 상태가 복원되었습니다.");
      navigate('/orders');
    } catch (e: any) {
      alert("❌ 발주 취소 중 오류 발생: " + e.message);
    }
  };

  if (loading) {
    return <div style={{ padding: '40px', color: '#475569', textAlign: 'center' }}>상세 발주 내역을 로드하는 중...</div>;
  }

  if (!order) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h3 style={{ color: '#ef4444' }}>⚠️ 해당 PO를 찾을 수 없습니다.</h3>
        <button onClick={() => navigate('/orders')} style={{ marginTop: '14px', padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>PO 목록으로 이동</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header Back Button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            onClick={() => navigate('/orders')}
            style={{ background: '#fff', border: '1px solid #cbd5e1', color: '#475569', padding: '6px 14px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}
          >
            이전으로
          </button>
          <span style={{ fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>PO 상세 정보 - {getFormattedPoId(order.id, order.issuingCompany)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button 
            onClick={handleSaveBasic}
            style={{ background: '#10b981', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}
          >
            💾 변경사항 저장
          </button>
          <button 
            onClick={handleDeleteOrder}
            style={{ background: '#ef4444', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}
          >
            ❌ PO 삭제 및 발주 취소
          </button>
        </div>
      </div>

      {/* Tab Menu */}
      <div style={{ display: 'flex', gap: '6px', padding: '4px 0', borderBottom: '1px solid #e2e8f0' }}>
        {steps.map((step) => {
          const isCurrent = step === activeStep;
          return (
            <button
              key={step}
              onClick={() => handleStepClick(step)}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                border: isCurrent ? '1px solid #2563eb' : '1px solid #cbd5e1',
                background: isCurrent ? '#2563eb' : '#f8fafc',
                color: isCurrent ? '#fff' : '#64748b',
                fontWeight: isCurrent ? 700 : 500,
                fontSize: '12.5px',
                cursor: 'pointer',
                transition: 'all 0.15s',
                boxShadow: isCurrent ? '0 2px 4px rgba(37, 99, 235, 0.2)' : 'none'
              }}
            >
              {step}
            </button>
          );
        })}
      </div>

      {/* Top Panel: PI Info & CI, Items Summary (Consolidated) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '16px', alignItems: 'stretch' }}>
        
        {/* Left: Consolidated Order Information */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #cbd5e1', paddingBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '14px' }}>📦</span>
              <span style={{ fontWeight: 800, fontSize: '13px', color: '#1e3a8a' }}>주문 기본 정보</span>
            </div>
            {piData && (
              <div style={{ fontSize: '11.5px', color: '#475569' }}>
                <strong style={{ color: '#0f172a' }}>PI: {piData.piNumber}</strong> | <span style={{ fontSize: '11px' }}>고객사: {piData.customerName}</span> | <strong style={{ color: '#2563eb' }}>${(piData.totalUsd || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} USD</strong>
              </div>
            )}
          </div>

          {/* Form Fields Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#4b5563' }}>발행사 (발주서 기준)</span>
              {isEditing ? (
                <select value={basicForm.issuingCompany} onChange={e => setBasicForm(prev => ({ ...prev, issuingCompany: e.target.value as 'YSACC' | 'YS' }))} style={{ padding: '4px 6px', border: '2px solid #3b82f6', borderRadius: '5px', fontSize: '11.5px', fontWeight: 700, background: '#eff6ff', outline: 'none' }}>
                  <option value="YSACC">YSACC (와이에스에이씨씨)</option>
                  <option value="YS">영성ACC (YS ACC)</option>
                </select>
              ) : (
                <input type="text" value={order.issuingCompany === 'YS' ? '영성ACC (YS ACC)' : 'YSACC (와이에스에이씨씨)'} disabled style={{ ...inputStyle(false), padding: '4px 6px', fontSize: '11.5px' }} />
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#4b5563' }}>고객사 PO 번호</span>
              <input type="text" value={basicForm.custPo} onChange={e => setBasicForm(prev => ({ ...prev, custPo: e.target.value }))} disabled={!isEditing} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '11.5px', background: isEditing ? '#fff' : '#f8fafc', outline: 'none' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#4b5563' }}>PO 접수일</span>
              <input type="date" value={basicForm.poDate} onChange={e => setBasicForm(prev => ({ ...prev, poDate: e.target.value }))} disabled={!isEditing} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '11.5px', background: isEditing ? '#fff' : '#f8fafc', outline: 'none' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#4b5563' }}>인코텀즈</span>
              {isEditing ? (
                <select value={basicForm.incoterms} onChange={e => setBasicForm(prev => ({ ...prev, incoterms: e.target.value as any }))} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '11.5px', outline: 'none' }}>
                  <option value="FOB">FOB</option>
                  <option value="CIF HCM">CIF HCM</option>
                  <option value="EXW">EXW</option>
                  <option value="CFR">CFR</option>
                  <option value="DAP">DAP</option>
                  <option value="DDP">DDP</option>
                </select>
              ) : (
                <input type="text" value={order.incoterms} disabled style={{ ...inputStyle(false), padding: '4px 6px', fontSize: '11.5px' }} />
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#4b5563' }}>결제 조건</span>
              <input type="text" value={basicForm.paymentTerms} onChange={e => setBasicForm(prev => ({ ...prev, paymentTerms: e.target.value }))} disabled={!isEditing} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '11.5px', background: isEditing ? '#fff' : '#f8fafc', outline: 'none' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#4b5563' }}>L/C 거래 여부</span>
              {isEditing ? (
                <select value={basicForm.isLc} onChange={e => setBasicForm(prev => ({ ...prev, isLc: e.target.value as any }))} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '11.5px', outline: 'none' }}>
                  <option value="">선택사항 (기본 T/T)</option>
                  <option value="Y">L/C 거래 (Y)</option>
                  <option value="N">T/T 거래 (N)</option>
                </select>
              ) : (
                <input type="text" value={basicForm.isLc === 'Y' ? 'L/C 거래 (Y)' : basicForm.isLc === 'N' ? 'T/T 거래 (N)' : '일반 거래'} disabled style={{ ...inputStyle(false), padding: '4px 6px', fontSize: '11.5px' }} />
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#4b5563' }}>담당 영업사원</span>
              <input type="text" value={basicForm.manager} onChange={e => setBasicForm(prev => ({ ...prev, manager: e.target.value }))} disabled={!isEditing} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '11.5px', background: isEditing ? '#fff' : '#f8fafc', outline: 'none' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#4b5563' }}>요청 납기일</span>
              <input type="date" value={basicForm.requestedDelivery} onChange={e => setBasicForm(prev => ({ ...prev, requestedDelivery: e.target.value }))} disabled={!isEditing} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '11.5px', background: isEditing ? '#fff' : '#f8fafc', outline: 'none' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#4b5563' }}>확정 CI 번호</span>
              <input
                type="text"
                placeholder="CI 번호 입력"
                value={basicForm.ciNumber}
                onChange={e => setBasicForm(p => ({ ...p, ciNumber: e.target.value }))}
                style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '11.5px', background: '#fff', outline: 'none' }}
              />
            </div>

            {basicForm.isLc === 'Y' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', gridColumn: 'span 3' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#4b5563' }}>L/C 번호</span>
                <input type="text" value={basicForm.lcNo} onChange={e => setBasicForm(prev => ({ ...prev, lcNo: e.target.value }))} disabled={!isEditing} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '11.5px', background: isEditing ? '#fff' : '#f8fafc', outline: 'none' }} placeholder="L/C 번호 입력" />
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', gridColumn: 'span 3' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#4b5563' }}>비고 (Remarks)</span>
              <textarea rows={1} value={basicForm.remark} onChange={e => setBasicForm(prev => ({ ...prev, remark: e.target.value }))} disabled={!isEditing} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '11.5px', background: isEditing ? '#fff' : '#f8fafc', resize: 'vertical', outline: 'none' }} />
            </div>
          </div>
        </div>

        {/* Right: 수주품목 명세요약 또는 운송비/컨테이너 정보 및 비용 */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#1f2937', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>📋 수주품목 명세요약</div>
            <div style={{ overflowY: 'auto', maxHeight: '220px', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', color: '#475569' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>품목명</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', width: '80px' }}>수량</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', width: '100px' }}>단가</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right', width: '110px' }}>금액</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items && order.items.length > 0 ? (
                    <>
                      {order.items.map((it, idx) => {
                        const price = it.purchaseUnitPrice !== undefined ? it.purchaseUnitPrice : it.unitPrice;
                        const totalAmt = price * (it.qty || 0);
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '6px 8px', fontWeight: 600, color: '#334155' }} title={it.name}>{it.name}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right' }}>{it.qty?.toLocaleString()} {it.unit}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right' }}>{it.currency === 'KRW' ? '₩' : '$'}{price?.toLocaleString()}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{it.currency === 'KRW' ? '₩' : '$'}{totalAmt?.toLocaleString()}</td>
                          </tr>
                        );
                      })}
                      {basicForm.forwarderQuotationAmount > 0 && (
                        <tr style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                          <td style={{ padding: '6px 8px', fontWeight: 600, color: '#0284c7' }}>🚚 운송비 (컨테이너비)</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>1 식</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>₩{basicForm.forwarderQuotationAmount.toLocaleString()}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#0284c7' }}>₩{basicForm.forwarderQuotationAmount.toLocaleString()}</td>
                        </tr>
                      )}
                    </>
                  ) : (
                    <>
                      {basicForm.forwarderQuotationAmount > 0 ? (
                        <tr style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                          <td style={{ padding: '6px 8px', fontWeight: 600, color: '#0284c7' }}>🚚 운송비 (컨테이너비)</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>1 식</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>₩{basicForm.forwarderQuotationAmount.toLocaleString()}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#0284c7' }}>₩{basicForm.forwarderQuotationAmount.toLocaleString()}</td>
                        </tr>
                      ) : (
                        <tr>
                          <td colSpan={4} style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>등록된 수주 품목이 없습니다.</td>
                        </tr>
                      )}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </>
        </div>
      </div>

      {/* Main Content: Selected activeStep Input Forms */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '24px', minHeight: '400px', width: '100%', boxSizing: 'border-box' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #2563eb', paddingBottom: '12px', marginBottom: '20px' }}>
            <div>
              <span style={{ fontSize: '16px', fontWeight: 800, color: '#1e3a8a' }}>
                👉 단계: {activeStep}
              </span>
              <span style={{ fontSize: '12.5px', color: '#64748b', marginLeft: '10px' }}>
                (상단 Stepper에서 원하는 단계를 선택하여 바로 이동할 수 있습니다)
              </span>
            </div>
          </div>
          {/* Render corresponding form/contents based on activeStep */}

          {/* 2. PO접수 */}
          {activeStep === 'PO접수' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Items Section */}
              <div style={{ marginTop: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>📦 발주 품목 목록</span>
                  <button type="button" onClick={addItemRow} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #2563eb', background: '#fff', color: '#2563eb', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>➕ 품목 행 추가</button>
                </div>
                
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '11px' }}>
                  <thead>
                    <tr style={{ background: '#1e3a5f', color: '#ffffff' }}>
                      <th style={{ padding: '8px 4px', textAlign: 'center', width: '35px', borderTopLeftRadius: '6px', borderBottomLeftRadius: '6px' }}>No</th>
                      <th style={{ padding: '8px 4px', textAlign: 'left', width: '300px' }}>상품코드 / 스펙 (Spec)</th>
                      <th style={{ padding: '8px 4px', textAlign: 'left', width: '200px' }}>공급사</th>
                      <th style={{ padding: '8px 4px', textAlign: 'center', width: '120px' }}>수량 / 단위</th>
                      <th style={{ padding: '8px 4px', textAlign: 'center', width: '150px' }}>통화 / 단가</th>
                      <th style={{ padding: '8px 4px', textAlign: 'right', width: '100px' }}>금액</th>
                      <th style={{ padding: '8px 4px', textAlign: 'center', width: '45px', borderTopRightRadius: '6px', borderBottomRightRadius: '6px' }}>삭제</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderItems.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '6px 4px', textAlign: 'center', color: '#64748b', verticalAlign: 'middle' }}>{idx + 1}</td>
                        
                        {/* 상품코드 / 스펙 (Spec) */}
                        <td style={{ padding: '4px 4px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
                                <input
                                  type="text"
                                  list={`detail_products_datalist_${idx}`}
                                  value={item.name || ''}
                                  onChange={e => handleItemChange(idx, 'name', e.target.value)}
                                  placeholder="상품코드 검색/입력"
                                  style={{ width: '100%', padding: '0 40px 0 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', boxSizing: 'border-box', height: '26px', outline: 'none' }}
                                />
                                {item.name && (
                                  <button
                                    type="button"
                                    onClick={() => handleItemChange(idx, 'name', '')}
                                    style={{
                                      position: 'absolute',
                                      right: '20px',
                                      background: 'transparent',
                                      border: 'none',
                                      color: '#94a3b8',
                                      cursor: 'pointer',
                                      fontSize: '10px',
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
                                    right: '4px',
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#3b82f6',
                                    cursor: 'pointer',
                                    fontSize: '11px',
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
                                <datalist id={`detail_products_datalist_${idx}`}>
                                  {products.map(p => {
                                    const displayName = p.nameEn || p.nameKo || '';
                                    return (
                                      <option key={p.productCode} value={`[${p.productCode}] ${displayName}`}>
                                        [{p.productCode}] {displayName}
                                      </option>
                                    );
                                  })}
                                </datalist>
                              </div>
                              {(() => {
                                const rawCode = getRawProductCode(item.name);
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
                                      border: p ? '1px solid #cbd5e1' : '1px solid #e2e8f0',
                                      color: p ? '#a16207' : '#94a3b8',
                                      borderRadius: '4px',
                                      padding: '2px 4px',
                                      cursor: p ? 'pointer' : 'not-allowed',
                                      fontSize: '11px',
                                      fontWeight: 600,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      height: '26px',
                                      width: '26px',
                                      boxSizing: 'border-box'
                                    }}
                                  >
                                    ✏️
                                  </button>
                                );
                              })()}
                            </div>
                            <input
                              type="text"
                              value={item.grade || ''}
                              onChange={e => handleItemChange(idx, 'grade', e.target.value)}
                              placeholder="스펙 (Spec)"
                              style={{ width: '100%', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', boxSizing: 'border-box', height: '26px', outline: 'none' }}
                            />
                          </div>
                        </td>

                        {/* 공급사 */}
                        <td style={{ padding: '4px 4px', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <input
                              type="text"
                              value={item.supplier || ''}
                              onChange={e => handleItemChange(idx, 'supplier', e.target.value)}
                              placeholder="공급사명"
                              style={{ flex: 1, padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', boxSizing: 'border-box', height: '26px', outline: 'none' }}
                            />
                            {(() => {
                              const rawCode = getRawProductCode(item.name);
                              const p = products.find(prod => prod.productCode === rawCode || prod.id === rawCode);
                              if (p && p.supplierName) {
                                return (
                                  <span style={{ fontSize: '10px', color: '#475569', fontWeight: 500, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: '80px' }} title={p.supplierName}>
                                    {p.supplierName.replace(/\(주\)/g, '').replace(/주식회사/g, '').trim()}
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </td>

                        {/* 수량 / 단위 */}
                        <td style={{ padding: '4px 4px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <input
                              type="number"
                              value={item.qty || ''}
                              onChange={e => handleItemChange(idx, 'qty', e.target.value)}
                              placeholder="수량"
                              style={{ width: '100%', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', textAlign: 'right', boxSizing: 'border-box', height: '26px', outline: 'none' }}
                            />
                            <select
                              value={item.unit || 'kg'}
                              onChange={e => handleItemChange(idx, 'unit', e.target.value)}
                              style={{ width: '100%', padding: '0 4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', boxSizing: 'border-box', height: '26px', outline: 'none' }}
                            >
                              <option value="kg">kg</option>
                              <option value="MT">MT</option>
                              <option value="L">L</option>
                              <option value="drum">drum</option>
                              <option value="set">set</option>
                            </select>
                          </div>
                        </td>

                        {/* 통화 / 단가 */}
                        <td style={{ padding: '4px 4px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <select
                              value={item.currency || 'USD'}
                              onChange={e => handleItemChange(idx, 'currency', e.target.value)}
                              style={{ width: '100%', padding: '0 4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', boxSizing: 'border-box', height: '26px', outline: 'none' }}
                            >
                              <option value="USD">USD ($)</option>
                              <option value="KRW">KRW (₩)</option>
                            </select>
                            <input
                              type="number"
                              step={item.currency === 'KRW' ? '1' : '0.01'}
                              value={item.unitPrice || ''}
                              onChange={e => handleItemChange(idx, 'unitPrice', e.target.value)}
                              placeholder="단가"
                              style={{ width: '100%', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', textAlign: 'right', boxSizing: 'border-box', height: '26px', outline: 'none' }}
                            />
                          </div>
                        </td>

                        {/* 금액 */}
                        <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 600, color: '#1e293b', verticalAlign: 'middle', fontSize: '11.5px' }}>
                          {item.currency === 'KRW' ? '₩' : '$'}{(item.amount || 0).toLocaleString('en-US', item.currency === 'KRW' ? {} : { minimumFractionDigits: 2 })}
                        </td>

                        {/* 삭제 */}
                        <td style={{ padding: '6px 4px', textAlign: 'center', verticalAlign: 'middle' }}>
                          <button
                            type="button"
                            onClick={() => removeItemRow(idx)}
                            disabled={orderItems.length === 1}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: orderItems.length === 1 ? '#cbd5e1' : '#ef4444',
                              fontSize: '14px',
                              cursor: orderItems.length === 1 ? 'not-allowed' : 'pointer'
                            }}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Forwarder/Transport Section */}
              <div style={{ marginTop: '4px', padding: '14px', background: '#f5f3ff', borderRadius: '8px', border: '1px solid #ddd6fe' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#7c3aed' }}>🚢 포워딩/운송사 & 운송비</label>
                  <button
                    type="button"
                    onClick={addForwarderRow}
                    style={{ padding: '5px 12px', fontSize: '12px', fontWeight: 700, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                  >
                    + 운송사 추가
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 140px 32px', gap: '6px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>포워딩사/운송사명</span>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>해상운임 (USD $)</span>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>국내운송 및 비용 (KRW ₩)</span>
                  <span></span>
                </div>
                {forwardersList.length === 0 ? (
                  <div style={{ padding: '10px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>운송사를 추가하세요</div>
                ) : (
                  forwardersList.map((fw, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 140px 32px', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
                      <input
                        type="text"
                        value={fw.name || ''}
                        onChange={e => handleForwarderChange(idx, 'name', e.target.value)}
                        placeholder="포워딩사명 입력"
                        style={{ padding: '8px', border: '1px solid #ddd6fe', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box', background: '#fff' }}
                      />
                      <input
                        type="text"
                        inputMode="decimal"
                        value={(fw.amountUsd ?? 0) === 0 ? '' : (fw.amountUsd ?? 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        onChange={e => {
                          const raw = e.target.value.replace(/,/g, '');
                          const num = parseFloat(raw) || 0;
                          handleForwarderChange(idx, 'amountUsd', num);
                        }}
                        placeholder="0.00"
                        style={{ padding: '8px', border: '1px solid #ddd6fe', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box', textAlign: 'right', background: '#fff' }}
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        value={(fw.amountKrw ?? 0) === 0 ? '' : (fw.amountKrw ?? 0).toLocaleString('ko-KR')}
                        onChange={e => {
                          const raw = e.target.value.replace(/,/g, '');
                          const num = parseInt(raw, 10) || 0;
                          handleForwarderChange(idx, 'amountKrw', num);
                        }}
                        placeholder="0"
                        style={{ padding: '8px', border: '1px solid #ddd6fe', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box', textAlign: 'right', background: '#fff' }}
                      />
                      <button
                        type="button"
                        onClick={() => removeForwarderRow(idx)}
                        style={{ padding: '8px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
                      >✕</button>
                    </div>
                  ))
                )}
              </div>

              {/* Real-time Total sum */}
              <div style={{ alignSelf: 'flex-end', marginTop: '10px', fontSize: '16px', fontWeight: 800, color: '#0f172a', display: 'flex', gap: '20px' }}>
                <span>총 발주 금액 (Grand Total):</span>
                {(() => {
                  const usdTotal = orderItems.filter(it => it.currency !== 'KRW').reduce((sum, it) => sum + (it.amount || 0), 0);
                  const krwTotal = orderItems.filter(it => it.currency === 'KRW').reduce((sum, it) => sum + (it.amount || 0), 0);
                  return (
                    <span style={{ color: '#dc2626' }}>
                      {usdTotal > 0 && `$${usdTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD`}
                      {usdTotal > 0 && krwTotal > 0 && ' / '}
                      {krwTotal > 0 && `₩${krwTotal.toLocaleString('en-US')} KRW`}
                      {usdTotal === 0 && krwTotal === 0 && '$0.00 USD'}
                    </span>
                  );
                })()}
              </div>

            </div>
          )}

          {/* 3. 소싱발주 */}
          {activeStep === '소싱발주' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* 소싱발주 하위 탭 메뉴 */}
              <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', gap: '8px', marginBottom: '8px' }}>
                {[
                  { id: '발주', label: '1) 소싱 발주 PO' },
                  { id: '도착보고_쉬핑마크', label: '2) 도착보고/쉬핑마크 작성' },
                  { id: 'COA_성적서', label: '3) COA/시험성적서/첨부파일관리' },
                  { id: '세금계산서_결제', label: '4) 세금계산서/구매확인서/대금결제관리' }
                ].map(tab => {
                  const isActive = activeSourcingTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveSourcingTab(tab.id as any)}
                      style={{
                        padding: '10px 16px',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        color: isActive ? '#2563eb' : '#64748b',
                        background: isActive ? '#eff6ff' : 'transparent',
                        border: 'none',
                        borderBottom: isActive ? '3px solid #2563eb' : '3px solid transparent',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        borderRadius: '6px 6px 0 0',
                        marginBottom: '-2px'
                      }}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
              {activeSourcingTab === '발주' && (
                <>
                  {/* 추가 발주사(원자재/OEM) 관리 UI */}
                  <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', marginBottom: '8px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>🛠️ 추가 발주사 (원자재/OEM 생산 등) 관리</h4>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <select 
                        value={selectedAddSupplier} 
                        onChange={e => setSelectedAddSupplier(e.target.value)}
                        style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12.5px', minWidth: '220px' }}
                      >
                        <option value="">-- 추가할 공급사 선택 --</option>
                        {suppliersList.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                      </select>
                      <button 
                        onClick={handleAddSupplier}
                        style={{ padding: '6px 16px', background: '#3b82f6', border: 'none', color: '#fff', borderRadius: '6px', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer' }}
                      >
                        + 발주사 추가
                      </button>
                    </div>
                    {order.additionalSuppliers && order.additionalSuppliers.length > 0 && (
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                        {order.additionalSuppliers.map(s => (
                          <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f1f5f9', color: '#334155', padding: '4px 10px', borderRadius: '20px', fontSize: '11.5px', fontWeight: 600 }}>
                            {s}
                            <button onClick={() => handleRemoveSupplier(s)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px', padding: 0, fontWeight: 700 }}>✕</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {allOrderSuppliers.length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>발주할 공급업체가 없습니다.</div>
                    ) : (
                      allOrderSuppliers.map(supplierName => {
                        const items = groupedSupplierItems[supplierName] || [];
                        const cleanSupplierName = supplierName.replace(/\s+/g, '');
                        const supplierCode = cleanSupplierName.substring(0, 3).toUpperCase();
                        const poNum = `${getFormattedPoId(order.id, order.issuingCompany)}-${supplierCode}`;

                        return (
                          <div key={supplierName} style={{ border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 4px 10px rgba(0,0,0,0.03)', marginBottom: '8px' }}>
                            <div style={{ background: '#f8fafc', padding: '10px 16px', borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span style={{ fontWeight: 800, color: '#1e3a8a', fontSize: '13px' }}>📄 {supplierName} PO ({poNum})</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px' }}>
                                  <span style={{ fontWeight: 600, color: '#4b5563' }}>세율:</span>
                                  <select
                                    value={basicForm.supplierTaxTypes[supplierName] || '과세'}
                                    onChange={(e) => {
                                      const val = e.target.value as '영세' | '과세';
                                      setBasicForm(prev => ({
                                        ...prev,
                                        supplierTaxTypes: {
                                          ...prev.supplierTaxTypes,
                                          [supplierName]: val
                                        }
                                      }));
                                    }}
                                    style={{ padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '11.5px', fontWeight: 600, outline: 'none' }}
                                  >
                                    <option value="과세">과세 (10%)</option>
                                    <option value="영세">영세 (0%)</option>
                                  </select>
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button 
                                  onClick={() => handlePrintSupplierPo(supplierName, items)}
                                  style={{ padding: '5px 10px', background: '#3b82f6', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '11.5px' }}
                                >
                                  🖨️ 인쇄 / PDF
                                </button>
                                <button 
                                  onClick={() => handleEmailSupplierPo(supplierName, items)}
                                  style={{ padding: '5px 10px', background: '#10b981', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '11.5px' }}
                                >
                                  ✉️ 이메일 발송
                                </button>
                              </div>
                            </div>
                            <div style={{ padding: '12px 16px', background: '#fff', fontSize: '12px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span><strong>상호:</strong> {order.issuingCompany === 'YS' ? 'YS ACC' : 'YSACC CO., LTD.'}</span>
                                <span><strong>일자:</strong> {new Date().toISOString().split('T')[0]}</span>
                              </div>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginTop: '5px' }}>
                                <thead>
                                  <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                                    <th style={{ padding: '6px', textAlign: 'left', width: '90px' }}>상품코드</th>
                                    <th style={{ padding: '6px', textAlign: 'left' }}>품목명</th>
                                    <th style={{ padding: '6px', textAlign: 'center', width: '120px' }}>스펙</th>
                                    <th style={{ padding: '6px', textAlign: 'right', width: '70px' }}>수량</th>
                                    <th style={{ padding: '6px', textAlign: 'right', width: '120px' }}>매입가 (통화/단가)</th>
                                    <th style={{ padding: '6px', textAlign: 'right', width: '150px' }}>실매입가 (통화/단가)</th>
                                    <th style={{ padding: '6px', textAlign: 'right', width: '120px' }}>총액</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.length === 0 ? (
                                    <tr>
                                      <td colSpan={7} style={{ padding: '12px', textAlign: 'center', color: '#64748b', fontStyle: 'italic' }}>
                                        연결된 품목이 없습니다. (원자재/OEM 등의 목적으로 추가됨)
                                      </td>
                                    </tr>
                                  ) : (
                                    items.map((it, idx) => {
                                      const match = it.name.match(/^\[(.*?)\]\s*(.*)$/);
                                      const itemCode = match ? match[1] : '-';
                                      const itemName = match ? match[2] : it.name;
                                      const matchedProd = products.find(p => p.productCode === itemCode || p.id === itemCode);
                                      const defaultPurchasePrice = it.purchaseUnitPrice !== undefined ? it.purchaseUnitPrice : (matchedProd ? (matchedProd.purchasePrice || 0) : 0);
                                      const purchasePrice = it.purchaseUnitPrice !== undefined ? it.purchaseUnitPrice : defaultPurchasePrice;
                                      
                                      // Determine correct currency: use purchaseUnitCurrency if defined, otherwise fallback to KRW if price > 1000, otherwise USD.
                                      let purchaseCurrency = it.purchaseUnitCurrency;
                                      if (!purchaseCurrency) {
                                        if (purchasePrice > 1000) {
                                          purchaseCurrency = 'KRW';
                                        } else if (matchedProd) {
                                          purchaseCurrency = (matchedProd.currency === 'KRW' ? 'KRW' : 'USD') as any;
                                        } else {
                                          purchaseCurrency = 'USD';
                                        }
                                      }

                                      const totalPurchaseAmount = purchasePrice * (it.qty || 0);
                                      return (
                                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                          <td style={{ padding: '6px' }}>{itemCode}</td>
                                          <td style={{ padding: '6px' }}><strong>{itemName}</strong></td>
                                          <td style={{ padding: '6px', textAlign: 'center' }}>
                                            {isEditing ? (
                                              <input
                                                type="text"
                                                value={it.grade || ''}
                                                onChange={(e) => {
                                                  const val = e.target.value;
                                                  setOrder(prev => {
                                                    if (!prev) return prev;
                                                    const updatedItems = prev.items.map(item => {
                                                      if (item.itemId === it.itemId) {
                                                        return { ...item, grade: val };
                                                      }
                                                      return item;
                                                    });
                                                    return { ...prev, items: updatedItems };
                                                  });
                                                }}
                                                style={{
                                                  width: '100px',
                                                  padding: '3px 6px',
                                                  border: '1px solid #cbd5e1',
                                                  borderRadius: '4px',
                                                  fontSize: '11px',
                                                  textAlign: 'center'
                                                }}
                                              />
                                            ) : (
                                              it.grade || '-'
                                            )}
                                          </td>
                                          <td style={{ padding: '6px', textAlign: 'right' }}>{it.qty?.toLocaleString()} {it.unit}</td>
                                          {/* 매입가 (통화/단가) */}
                                          <td style={{ padding: '6px', textAlign: 'right' }}>
                                            {purchaseCurrency === 'KRW' ? '₩' : '$'}{defaultPurchasePrice?.toLocaleString(undefined, purchaseCurrency === 'KRW' ? {} : { minimumFractionDigits: 2 })}
                                          </td>
                                          {/* 실매입가 (통화/단가) */}
                                          <td style={{ padding: '6px', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px' }}>
                                              <span>{purchaseCurrency === 'KRW' ? '₩' : '$'}</span>
                                              <input
                                                type="text"
                                                value={(() => {
                                                  const val = it.purchaseUnitPrice ?? defaultPurchasePrice;
                                                  return purchaseCurrency === 'KRW' 
                                                    ? Math.round(val).toLocaleString('ko-KR')
                                                    : val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
                                                })()}
                                                disabled={!isEditing}
                                                onChange={(e) => {
                                                  const raw = e.target.value.replace(/,/g, '');
                                                  const val = parseFloat(raw) || 0;
                                                  setOrder(prev => {
                                                    if (!prev) return prev;
                                                    const updatedItems = prev.items.map(item => {
                                                      if (item.itemId === it.itemId) {
                                                        return { ...item, purchaseUnitPrice: val };
                                                      }
                                                      return item;
                                                    });
                                                    return { ...prev, items: updatedItems };
                                                  });
                                                }}
                                                style={{
                                                  width: '90px',
                                                  padding: '3px 6px',
                                                  border: '1px solid #cbd5e1',
                                                  borderRadius: '4px',
                                                  fontSize: '11px',
                                                  textAlign: 'right'
                                                }}
                                              />
                                            </div>
                                          </td>
                                          <td style={{ padding: '6px', textAlign: 'right', fontWeight: 700 }}>
                                            {purchaseCurrency === 'KRW' ? '₩' : '$'}{totalPurchaseAmount.toLocaleString(undefined, purchaseCurrency === 'KRW' ? {} : { minimumFractionDigits: 2 })}
                                          </td>
                                        </tr>
                                      );
                                    })
                                  )}
                                </tbody>
                              </table>
                            </div>
                            {/* 생산완료일 지정 영역을 카드 하단에 병합 */}
                            <div style={{ display: 'flex', gap: '20px', alignItems: 'center', background: '#f8fafc', padding: '8px 16px', borderTop: '1px solid #cbd5e1' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontWeight: 600, fontSize: '11.5px', color: '#4b5563' }}>생산완료일(납기일):</span>
                                <input 
                                  type="date"
                                  value={basicForm.supplierProductionDates[supplierName] || ''}
                                  disabled={!isEditing}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setBasicForm(prev => {
                                      const newDates = {
                                        ...prev.supplierProductionDates,
                                        [supplierName]: val
                                      };
                                      const activeDates = Object.values(newDates).filter(d => !!d);
                                      const maxDate = activeDates.length > 0 
                                        ? activeDates.reduce((max, cur) => cur > max ? cur : max) 
                                        : prev.cargoReadyDate;
                                      return {
                                        ...prev,
                                        supplierProductionDates: newDates,
                                        cargoReadyDate: maxDate
                                      };
                                    });
                                  }}
                                  style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px' }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* 화물준비일 지정 영역 */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px', marginTop: '4px', background: '#f0fdf4', padding: '10px 16px', borderRadius: '8px', border: '1px solid #bbf7d0', marginBottom: '16px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#166534' }}>최종 화물준비일 (생산완료일 기준 자동 계산 또는 수동 설정):</span>
                    <input 
                      type="date" 
                      value={basicForm.cargoReadyDate || ''} 
                      onChange={e => setBasicForm(p => ({ ...p, cargoReadyDate: e.target.value }))} 
                      disabled={!isEditing} 
                      style={{ padding: '5px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', background: isEditing ? '#fff' : '#f8fafc' }} 
                    />
                  </div>
                </>
              )}
              {/* 2) 도착보고 및 쉬핑마크 탭 */}
              {activeSourcingTab === '도착보고_쉬핑마크' && (
                <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 800, color: '#1e3a8a' }}>🚚 2) 도착보고 작성 및 쉬핑마크 (기본정보입력 + 쉬핑마크 등록)</h4>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
                    도착보고 상세내역(패킹 및 화물정보)을 작성하고 인쇄/PDF 저장 또는 이메일 발송이 가능합니다.
                  </div>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {allOrderSuppliers.map(supplierName => {
                      const items = groupedSupplierItems[supplierName] || [];
                      return (
                        <div key={supplierName} style={{ display: 'flex', gap: '6px', alignItems: 'center', background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>{supplierName} :</span>
                          <button
                            type="button"
                            onClick={() => setActiveArrivalReport({ supplierName, items })}
                            style={{ padding: '4px 8px', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 700, fontSize: '11px', cursor: 'pointer' }}
                          >
                            🚚 도착보고 작성 / 수정 (인쇄/PDF, 이메일)
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePrintShippingMark(supplierName)}
                            style={{ padding: '4px 8px', background: '#ec4899', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 700, fontSize: '11px', cursor: 'pointer' }}
                          >
                            🏷️ 쉬핑마크 등록/출력
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 3) COA 및 시험성적서 탭 */}
              {activeSourcingTab === 'COA_성적서' && (
                <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 800, color: '#1e3a8a' }}>🔬 3) COA 및 시험성적서 첨부 파일 관리</h4>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
                    수입 및 통관을 위한 공급사별 COA(분석증명서)와 시험성적서 파일을 등록 및 관리합니다.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    {renderFileField('COA 유첨', 'coaFiles', 'coa-file-input')}
                    {renderFileField('시험성적서 유첨', 'testReportFiles', 'test-report-file-input')}
                    {renderFileField('그밖의 생산/품질 서류', 'otherFiles', 'other-docs-input')}
                  </div>
                </div>
              )}

              {/* 4) 세금계산서, 구매확인서, 대금결제관리 탭 */}
              {activeSourcingTab === '세금계산서_결제' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {/* 4) 세금계산서 발행 */}
                  <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 800, color: '#1e3a8a' }}>📄 4) 공급사 세금계산서 발행 정보 등록</h4>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>각 공급사별로 국내 발행된 세금계산서 발행일자 및 국세청 승인번호를 기록합니다.</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {allOrderSuppliers.length === 0 ? (
                        <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>공급업체가 없습니다.</div>
                      ) : (
                        allOrderSuppliers.map(supplier => {
                          const details = basicForm.supplierTaxInvoiceDetails[supplier] || { date: '', invoiceNo: '' };
                          return (
                            <div key={supplier} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                              <span style={{ fontWeight: 800, fontSize: '12.5px', color: '#334155' }}>{supplier}</span>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563' }}>발행일자</span>
                                  <input
                                    type="date"
                                    value={details.date}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setBasicForm(prev => ({
                                        ...prev,
                                        supplierTaxInvoiceDetails: {
                                          ...prev.supplierTaxInvoiceDetails,
                                          [supplier]: { ...details, date: val }
                                        }
                                      }));
                                    }}
                                    style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', background: '#fff' }}
                                  />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563' }}>세금계산서 승인번호</span>
                                  <input
                                    type="text"
                                    placeholder="국세청 승인번호(발급번호) 입력"
                                    value={details.invoiceNo}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setBasicForm(prev => ({
                                        ...prev,
                                        supplierTaxInvoiceDetails: {
                                          ...prev.supplierTaxInvoiceDetails,
                                          [supplier]: { ...details, invoiceNo: val }
                                        }
                                      }));
                                    }}
                                    style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', background: '#fff' }}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* 5) 구매확인서 발행 */}
                  <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 800, color: '#1e3a8a' }}>📑 5) 영세율 공급사 구매확인서 발행/유첨</h4>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>세율이 "영세"로 지정된 공급업체에 대해서 외화 획득을 위한 구매확인서 발급 파일을 업로드하고 관리합니다.</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {(() => {
                        const zeroTaxSuppliers = allOrderSuppliers.filter(supplier => basicForm.supplierTaxTypes[supplier] === '영세');
                        if (zeroTaxSuppliers.length === 0) {
                          return (
                            <div style={{ padding: '20px', textAlign: 'center', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#94a3b8', fontSize: '12.5px' }}>
                              영세율로 설정된 공급업체가 없습니다. (공급업체별 세율 구분을 "영세"로 변경하면 활성화됩니다)
                            </div>
                          );
                        }

                        return zeroTaxSuppliers.map(supplier => {
                          const fileList = basicForm.supplierPurchaseCertFiles[supplier] || [];
                          const isUploadingThis = uploadingCertSupplier === supplier;

                          return (
                            <div key={supplier} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                              <span style={{ fontWeight: 800, fontSize: '12.5px', color: '#334155' }}>{supplier} (영세율 거래처)</span>
                              <div 
                                onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = '#2563eb'; }}
                                onDragLeave={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = '#cbd5e1'; }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  e.currentTarget.style.borderColor = '#cbd5e1';
                                  const files = e.dataTransfer.files;
                                  if (files && files.length > 0) {
                                    handleSupplierCertUpload(files[0], supplier);
                                  }
                                }}
                                style={{ border: '2px dashed #cbd5e1', borderRadius: '6px', background: '#fff', padding: '12px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s' }}
                                onClick={() => {
                                  const fileInput = document.getElementById(`cert-uploader-direct-${supplier}`);
                                  fileInput?.click();
                                }}
                              >
                                <input 
                                  type="file" 
                                  id={`cert-uploader-direct-${supplier}`}
                                  style={{ display: 'none' }}
                                  onChange={(e) => {
                                    const files = e.target.files;
                                    if (files && files.length > 0) {
                                      handleSupplierCertUpload(files[0], supplier);
                                    }
                                  }}
                                />
                                <span style={{ fontSize: '11.5px', color: '#475569', fontWeight: 600 }}>
                                  {isUploadingThis ? '⏳ 업로드 중...' : '📂 여기에 파일을 드래그하여 놓거나 클릭하여 구매확인서 PDF 첨부'}
                                </span>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                                {fileList.length > 0 ? (
                                  fileList.map((file, idx) => (
                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '6px 10px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                      <a href={file.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: '#2563eb', fontSize: '11.5px', fontWeight: 600 }}>
                                        📄 {file.name}
                                      </a>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteSupplierCertFile(supplier, idx)}
                                        style={{ border: 'none', background: 'transparent', color: '#ef4444', fontWeight: 700, cursor: 'pointer', fontSize: '12px' }}
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ))
                                ) : (
                                  <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>첨부된 구매확인서 파일이 없습니다.</span>
                                )}
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>

                  {/* 6) 대금결제관리 */}
                  <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 800, color: '#1e3a8a' }}>💳 6) 대금결제관리 (공급업체 외화/원화 대금 지급)</h4>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>각 공급사별 원화/외화 수주 금액 대비 지급(송금) 완료 내역 및 미수금을 분할 입금 형식으로 지정합니다.</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {allOrderSuppliers.length === 0 ? (
                        <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>공급업체가 없습니다.</div>
                      ) : (
                        allOrderSuppliers.map(supplier => {
                          const list = basicForm.supplierPaymentInstallments[supplier] || [];
                          const installments = list.length > 0 ? list : [{ date: '', amount: 0 }];
                          const matchingSupplier = suppliersList.find(s => s.name?.trim() === supplier.trim());
                          const items = groupedSupplierItems[supplier] || [];
                          const taxType = basicForm.supplierTaxTypes[supplier] || '과세';
                          const usdTotal = items.filter(it => it.currency !== 'KRW').reduce((sum, it) => {
                            const price = it.purchaseUnitPrice !== undefined ? it.purchaseUnitPrice : it.unitPrice;
                            return sum + price * (it.qty || 0);
                          }, 0);
                          const krwTotal = items.filter(it => it.currency === 'KRW').reduce((sum, it) => {
                            const price = it.purchaseUnitPrice !== undefined ? it.purchaseUnitPrice : it.unitPrice;
                            return sum + price * (it.qty || 0);
                          }, 0);
                          const usdVat = taxType === '영세' ? 0 : parseFloat((usdTotal * 0.1).toFixed(2));
                          const krwVat = taxType === '영세' ? 0 : Math.round(krwTotal * 0.1);
                          const usdGrand = usdTotal + usdVat;
                          const krwGrand = krwTotal + krwVat;
                          const isKrw = krwGrand > 0 || (usdGrand === 0 && krwGrand === 0);
                          const grandTotal = isKrw ? krwGrand : usdGrand;
                          const currencySymbol = isKrw ? '₩' : '$';
                          const totalPaid = installments.reduce((sum, inst) => sum + (inst.amount || 0), 0);
                          const outstanding = Math.max(0, isKrw ? Math.round(grandTotal - totalPaid) : parseFloat((grandTotal - totalPaid).toFixed(2)));
                          const isCompleted = grandTotal > 0 && totalPaid >= (grandTotal - (isKrw ? 0.9 : 0.009));

                          const handleInstallmentChange = (idx: number, field: 'date' | 'amount', value: any) => {
                            const newList = [...installments];
                            newList[idx] = { ...newList[idx], [field]: value };
                            
                            const newTotalPaid = newList.reduce((sum, inst) => sum + (inst.amount || 0), 0);
                            const newIsCompleted = grandTotal > 0 && newTotalPaid >= (grandTotal - (isKrw ? 0.9 : 0.009));
                            
                            const dates = newList.map(inst => inst.date).filter(d => d);
                            const lastDate = dates.length > 0 ? dates.sort().reverse()[0] : '';
                            
                            setBasicForm(prev => {
                              const updatedPayments = { ...prev.supplierPayments };
                              if (newIsCompleted) {
                                updatedPayments[supplier] = { status: '입금완료', date: lastDate };
                              } else {
                                updatedPayments[supplier] = { status: '미수금 발생', date: '' };
                              }
                              
                              return {
                                ...prev,
                                supplierPaymentInstallments: {
                                  ...prev.supplierPaymentInstallments,
                                  [supplier]: newList
                                },
                                supplierPayments: updatedPayments
                              };
                            });
                          };

                          return (
                            <div key={supplier} style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px dashed #cbd5e1', paddingBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <span style={{ fontWeight: 800, fontSize: '13px', color: '#1e3a8a' }}>{supplier}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newList = [...installments, { date: '', amount: 0 }];
                                      setBasicForm(prev => ({
                                        ...prev,
                                        supplierPaymentInstallments: {
                                          ...prev.supplierPaymentInstallments,
                                          [supplier]: newList
                                        }
                                      }));
                                    }}
                                    style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 6px', fontSize: '10.5px', fontWeight: 700, color: '#0d9488', cursor: 'pointer' }}
                                  >
                                    ＋ 지급 내역 추가
                                  </button>
                                </div>
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '12px' }}>
                                  <span>총 발주액: <strong>{currencySymbol}{grandTotal.toLocaleString(undefined, isKrw ? {} : { minimumFractionDigits: 2 })}</strong></span>
                                  <span>송금액: <strong style={{ color: '#0d9488' }}>{currencySymbol}{totalPaid.toLocaleString(undefined, isKrw ? {} : { minimumFractionDigits: 2 })}</strong></span>
                                  <span>잔액: <strong style={{ color: outstanding > 0 ? '#ef4444' : '#64748b' }}>{currencySymbol}{outstanding.toLocaleString(undefined, isKrw ? {} : { minimumFractionDigits: 2 })}</strong></span>
                                  <span style={{ padding: '2px 8px', borderRadius: '10px', background: isCompleted ? '#dcfce7' : '#fee2e2', color: isCompleted ? '#15803d' : '#b91c1c', fontWeight: 700, fontSize: '11px' }}>
                                    {isCompleted ? '송금완료' : '지급대기'}
                                  </span>
                                </div>
                              </div>
                              {matchingSupplier && (
                                <div style={{ display: 'flex', gap: '15px', background: '#eff6ff', border: '1px solid #dbeafe', padding: '6px 10px', borderRadius: '4px', fontSize: '11.5px', color: '#1e40af' }}>
                                  <span>🏦 <strong>원화계좌:</strong> {matchingSupplier.bankKrw || '-'}</span>
                                  <span>🌍 <strong>외화계좌:</strong> {matchingSupplier.bankUsd || '-'}</span>
                                </div>
                              )}
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
                                {installments.map((inst, idx) => (
                                  <div key={idx} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#4b5563' }}>{idx + 1}차 지급</span>
                                      {installments.length > 1 && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const newList = installments.filter((_, i) => i !== idx);
                                            const finalList = newList.length > 0 ? newList : [{ date: '', amount: 0 }];
                                            const newTotalPaid = finalList.reduce((sum, inst) => sum + (inst.amount || 0), 0);
                                            const newIsCompleted = grandTotal > 0 && newTotalPaid >= (grandTotal - (isKrw ? 0.9 : 0.009));
                                            const dates = finalList.map(inst => inst.date).filter(d => d);
                                            const lastDate = dates.length > 0 ? dates.sort().reverse()[0] : '';
                                            setBasicForm(prev => {
                                              const updatedPayments = { ...prev.supplierPayments };
                                              updatedPayments[supplier] = newIsCompleted ? { status: '입금완료', date: lastDate } : { status: '미수금 발생', date: '' };
                                              return {
                                                ...prev,
                                                supplierPaymentInstallments: {
                                                  ...prev.supplierPaymentInstallments,
                                                  [supplier]: finalList
                                                },
                                                supplierPayments: updatedPayments
                                              };
                                            });
                                          }}
                                          style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '10px', fontWeight: 700 }}
                                        >
                                          ✕
                                        </button>
                                      )}
                                    </div>
                                    <input
                                      type="date"
                                      value={inst.date}
                                      onChange={e => handleInstallmentChange(idx, 'date', e.target.value)}
                                      style={{ padding: '3px 5px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', width: '100%', boxSizing: 'border-box' }}
                                    />
                                    <input
                                      type="number"
                                      placeholder="지급액"
                                      value={inst.amount || ''}
                                      onChange={e => handleInstallmentChange(idx, 'amount', parseFloat(e.target.value) || 0)}
                                      style={{ padding: '3px 5px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', width: '100%', boxSizing: 'border-box', textAlign: 'right' }}
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4. 선적관리 */}
          {activeStep === '선적관리' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              {/* Row 1 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>지정 포워더(Forwarder)</span>
                <input type="text" value={basicForm.forwarderConfirmed} onChange={e => setBasicForm(p => ({ ...p, forwarderConfirmed: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="예: 현대글로비스" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>포워더 견적금액 (KRW)</span>
                <input type="number" value={basicForm.forwarderQuotationAmount || ''} onChange={e => setBasicForm(p => ({ ...p, forwarderQuotationAmount: parseFloat(e.target.value) || 0 }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="원화 견적 금액" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>Vessel 확정 (선박명/항차)</span>
                <input type="text" value={basicForm.vesselBooking} onChange={e => setBasicForm(p => ({ ...p, vesselBooking: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="예: HYUNDAI TOKYO V.024E" />
              </div>

              {/* Row 2 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>컨테이너 작업장소</span>
                {isEditing ? (
                  <select value={basicForm.containerWorkspaceType} onChange={e => setBasicForm(p => ({ ...p, containerWorkspaceType: e.target.value as any }))} style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', width: '100%' }}>
                    <option value="">선택사항</option>
                    <option value="CFS">CFS 작업</option>
                    <option value="Door">Door 작업</option>
                  </select>
                ) : (
                  <input type="text" value={basicForm.containerWorkspaceType === 'CFS' ? 'CFS 작업' : basicForm.containerWorkspaceType === 'Door' ? 'Door 작업' : '-'} disabled style={inputStyle(false)} />
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>컨테이너(CFS)입고일</span>
                <input type="date" value={basicForm.cfsEntryDate} onChange={e => setBasicForm(p => ({ ...p, cfsEntryDate: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>CFS 주소 및 정보</span>
                <input 
                  type="text" 
                  style={inputStyle(isEditing && basicForm.containerWorkspaceType === 'CFS')} 
                  value={basicForm.cfsAddress || ''} 
                  onChange={e => setBasicForm(p => ({ ...p, cfsAddress: e.target.value }))} 
                  disabled={!isEditing || basicForm.containerWorkspaceType !== 'CFS'} 
                  placeholder={basicForm.containerWorkspaceType === 'CFS' ? "주소 및 담당자 정보" : "CFS 작업 시에만 입력 가능"} 
                />
              </div>

              {/* 도착보고(Arrival Report) 연동 버튼들을 선적관리 탭에도 노출 (발주서처럼 밖으로 빼기) */}
              <div style={{ gridColumn: 'span 3', borderTop: '1px dashed #cbd5e1', paddingTop: '10px', marginTop: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#1e3a8a', display: 'block', marginBottom: '8px' }}>🚚 공급업체별 CFS 도착보고서 (Arrival Report) 및 패킹 정보 입력</span>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {allOrderSuppliers.map(supplierName => {
                    const items = groupedSupplierItems[supplierName] || [];
                    return (
                      <button
                        key={supplierName}
                        type="button"
                        onClick={() => setActiveArrivalReport({ supplierName, items })}
                        style={{ padding: '8px 14px', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        🚚 {supplierName} 도착보고서 작성/출력
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 수출신고번호, 수출면장 기준환율 */}
              <div style={{ gridColumn: 'span 3', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', borderTop: '1px solid #cbd5e1', paddingTop: '10px', marginTop: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>수출신고번호</span>
                  <input type="text" value={basicForm.exportDeclarationNo || ''} onChange={e => setBasicForm(p => ({ ...p, exportDeclarationNo: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="예: 010-22-19-1234567" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>수출면장 기준환율</span>
                  <input type="number" step="0.01" value={basicForm.customsExchangeRate || ''} onChange={e => setBasicForm(p => ({ ...p, customsExchangeRate: parseFloat(e.target.value) || 0 }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="예: 1352.50" />
                </div>
                <div />
              </div>

              {/* 서류마감, ETD, ETA 날짜 */}
              <div style={{ gridColumn: 'span 3', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', borderTop: '1px solid #cbd5e1', paddingTop: '10px', marginTop: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>서류마감일</span>
                  <input type="date" value={basicForm.docCutoffDate} onChange={e => setBasicForm(p => ({ ...p, docCutoffDate: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>ETD (출항예정일)</span>
                  <input type="date" value={basicForm.etd} onChange={e => setBasicForm(p => ({ ...p, etd: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>ETA (입항예정일)</span>
                  <input type="date" value={basicForm.eta} onChange={e => setBasicForm(p => ({ ...p, eta: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} />
                </div>
              </div>

              {/* 7개의 유첨 파일 + CI/PL 자동 생성 단추 및 신규 사진 유첨 추가 */}
              <div style={{ gridColumn: 'span 3', borderTop: '1px solid #cbd5e1', paddingTop: '12px', marginTop: '10px' }}>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
                  <button 
                    type="button" 
                    onClick={handlePrintCI}
                    style={{ padding: '8px 16px', fontSize: '12.5px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    CI 자동인쇄/생성
                  </button>
                  <button 
                    type="button" 
                    onClick={handlePrintPL}
                    style={{ padding: '8px 16px', fontSize: '12.5px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    PL 자동인쇄/생성
                  </button>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                  {renderFileField('CI 유첨 (수동)', 'ciFiles', 'ci-file-input')}
                  {renderFileField('PL 유첨 (수동)', 'plFiles', 'pl-file-input')}
                  {renderFileField('COO 유첨', 'cooFiles', 'coo-file-input')}
                  {renderFileField('B/L 유첨', 'blFiles', 'bl-file-input')}
                </div>
              </div>

              <div style={{ gridColumn: 'span 3', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', borderTop: '1px dashed #cbd5e1', paddingTop: '10px', marginTop: '10px' }}>
                {renderFileField('COA 유첨', 'coaFiles', 'coa-file-input')}
                {renderFileField('시험성적서 유첨', 'testReportFiles', 'test-report-file-input')}
                {renderFileField('그밖의 서류 유첨', 'otherFiles', 'other-docs-input')}
              </div>

              {/* 컨테이너 작업 및 운송 사진 */}
              <div style={{ gridColumn: 'span 3', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', borderTop: '1px solid #cbd5e1', paddingTop: '12px', marginTop: '10px' }}>
                {renderFileField('컨테이너 작업 사진 유첨', 'containerWorkFiles', 'container-work-file-input')}
                {renderFileField('운송 사진 유첨', 'transportationFiles', 'transportation-file-input')}
              </div>

              {/* 선적서류 발송 및 은행제출 */}
              <div style={{ gridColumn: 'span 3', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', borderTop: '1px solid #cbd5e1', paddingTop: '10px', marginTop: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>선적 서류 발송</span>
                  {isEditing ? (
                    <select value={basicForm.shippingDocsSentStatus} onChange={e => setBasicForm(p => ({ ...p, shippingDocsSentStatus: e.target.value as any }))} style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}>
                      <option value="">선택사항</option>
                      <option value="N">미발송</option>
                      <option value="Y">발송완료</option>
                    </select>
                  ) : (
                    <input type="text" value={basicForm.shippingDocsSentStatus === 'Y' ? '발송완료 (Y)' : '미발송 (N)'} disabled style={inputStyle(false)} />
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>발송 일자</span>
                  <input type="date" value={basicForm.shippingDocsSentDate} onChange={e => setBasicForm(p => ({ ...p, shippingDocsSentDate: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>Tracking 번호</span>
                  <input type="text" value={basicForm.shippingDocsTrackingNo} onChange={e => setBasicForm(p => ({ ...p, shippingDocsTrackingNo: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="DHL 등 번호" />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>은행 네고 제출</span>
                  {isEditing ? (
                    <select value={basicForm.bankSubmissionStatus} onChange={e => setBasicForm(p => ({ ...p, bankSubmissionStatus: e.target.value as any }))} style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}>
                      <option value="">선택사항</option>
                      <option value="N">미제출</option>
                      <option value="Y">제출완료</option>
                    </select>
                  ) : (
                    <input type="text" value={basicForm.bankSubmissionStatus === 'Y' ? '제출완료 (Y)' : '미제출 (N)'} disabled style={inputStyle(false)} />
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>은행 네고 제출 일자</span>
                  <input type="date" value={basicForm.bankSubmissionDate} onChange={e => setBasicForm(p => ({ ...p, bankSubmissionDate: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} />
                </div>
                <div />
              </div>
            </div>
          )}

          {/* 5. 정산마감 */}
          {activeStep === '정산마감' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {(() => {
                const customsRate = basicForm.customsExchangeRate || piData?.exchangeRate || 1350;
                const revenueUsd = piData?.totalUsd || 0;
                const revenueKrw = piData?.totalKrw || 0;
                const consolidatedRevenueKrw = Math.round((revenueUsd * customsRate) + revenueKrw);

                const purchaseUsd = order.items?.filter((it: OrderItem) => it.currency !== 'KRW').reduce((sum: number, it: OrderItem) => {
                  const price = it.purchaseUnitPrice !== undefined ? it.purchaseUnitPrice : it.unitPrice;
                  return sum + (price * (it.qty || 0));
                }, 0) || 0;
                const purchaseKrw = order.items?.filter((it: OrderItem) => it.currency === 'KRW').reduce((sum: number, it: OrderItem) => {
                  const price = it.purchaseUnitPrice !== undefined ? it.purchaseUnitPrice : it.unitPrice;
                  return sum + (price * (it.qty || 0));
                }, 0) || 0;
                const consolidatedPurchaseKrw = Math.round((purchaseUsd * customsRate) + purchaseKrw);

                const forwarderExpenseKrw = basicForm.forwarderQuotationAmount || 0;
                const totalCostKrw = consolidatedPurchaseKrw + forwarderExpenseKrw;
                const profitKrw = consolidatedRevenueKrw - totalCostKrw;
                const profitMargin = consolidatedRevenueKrw > 0 ? ((profitKrw / consolidatedRevenueKrw) * 100).toFixed(2) : '0.00';

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                      <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px', background: '#f8fafc' }}>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>총 매출액 (PI)</div>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b', marginTop: '6px' }}>₩{consolidatedRevenueKrw.toLocaleString()} KRW</div>
                      </div>
                      <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px', background: '#f8fafc' }}>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>총 비용 (원가)</div>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: '#991b1b', marginTop: '6px' }}>₩{totalCostKrw.toLocaleString()} KRW</div>
                      </div>
                      <div style={{ border: '1px solid #1e3a8a', borderRadius: '6px', padding: '10px', background: '#eff6ff' }}>
                        <div style={{ fontSize: '11px', color: '#1e3a8a', fontWeight: 700 }}>예상 순이익 (마진)</div>
                        <div style={{ fontSize: '15px', fontWeight: 900, color: '#1e3a8a', marginTop: '5px' }}>₩{profitKrw.toLocaleString()} KRW ({profitMargin}%)</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '300px', marginTop: '12px', borderTop: '1px solid #cbd5e1', paddingTop: '12px' }}>
                      <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>대금 영수 일자</span>
                      <input type="date" value={basicForm.paymentCollectedDate} onChange={e => setBasicForm(p => ({ ...p, paymentCollectedDate: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} />
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

        </div>

      {isProductSearchOpen && searchItemIndex !== null && (
        <ProductSearchModal
          products={products}
          onClose={() => setIsProductSearchOpen(false)}
          onSelect={(prod) => {
            handleSelectProduct(searchItemIndex, prod);
            setIsProductSearchOpen(false);
          }}
        />
      )}

      {isProdModalOpen && (
        <ProductModal
          initialProduct={editingProd}
          products={products}
          onClose={() => {
            setIsProdModalOpen(false);
            setEditingProd(undefined);
          }}
        />
      )}

      {activeArrivalReport && (
        <ArrivalReportModal
          supplierName={activeArrivalReport.supplierName}
          orderInfo={{
            id: order.id,
            custPo: order.custPo,
            incoterms: order.incoterms,
            paymentTerms: order.paymentTerms,
            issuingCompany: order.issuingCompany || 'YSACC',
            portOfLoading: 'BUSAN PORT, SOUTH KOREA',
            finalDestination: order.eta || order.cfsAddress || '',
            carrier: order.vesselBooking || '',
            sailingOnOrAbout: order.etd || '',
            cfsAddress: order.cfsAddress || '',
            cfsEntryDate: order.cfsEntryDate || '',
            items: activeArrivalReport.items
          }}
          initialData={(order.supplierArrivalReports || {})[activeArrivalReport.supplierName]}
          onClose={() => setActiveArrivalReport(null)}
          onSave={async (reportData) => {
            try {
              const updatedReports = {
                ...(order.supplierArrivalReports || {}),
                [activeArrivalReport.supplierName]: reportData
              };
              const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
              await setDoc(orderRef, { supplierArrivalReports: updatedReports, updatedAt: serverTimestamp() }, { merge: true });
              setActiveArrivalReport(null);
              // Print immediately using the saved updated reports in local memory or data
              const rep = reportData;
              const cleanSupplierName = activeArrivalReport.supplierName.replace(/\s+/g, '');
              const supplierCode = cleanSupplierName.substring(0, 3).toUpperCase();
              const poNum = `${getFormattedPoId(order.id, order.issuingCompany)}-${supplierCode}`;

              const packingItemsList = rep.packingItems || [];
              const totalQty = packingItemsList.reduce((sum: number, it: any) => sum + (it.qty || 0), 0);
              const totalNetWeight = packingItemsList.reduce((sum: number, it: any) => sum + (it.netWeight || 0), 0);
              const totalGrossWeight = packingItemsList.reduce((sum: number, it: any) => sum + (it.grossWeight || 0), 0);

              const printHtml = `
                <html>
                  <head>
                    <title>도착보고 - ${poNum}</title>
                    <style>
                      @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&display=swap');
                      body { font-family: 'Noto Sans KR', sans-serif; padding: 20px; color: #000; font-size: 11.5px; line-height: 1.4; }
                      .no-print { display: block; position: fixed; top: 15px; right: 15px; padding: 10px 20px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 13px; z-index: 9999; }
                      @media print {
                        .no-print { display: none !important; }
                        body { padding: 0; }
                      }
                      .header-title { text-align: center; font-size: 26px; font-weight: 800; text-transform: uppercase; margin-bottom: 20px; border-bottom: 3px double #000; padding-bottom: 6px; }
                      
                      .report-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 11px; }
                      .report-table td { border: 1px solid #000; padding: 6px 8px; vertical-align: top; }
                      .report-table td.title { font-weight: bold; background: #f8fafc; }
                      .report-table td.header-cell { font-weight: bold; font-size: 12px; }

                      .desc-table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
                      .desc-table th, .desc-table td { border: 1px solid #000; padding: 6px 5px; }
                      .desc-table th { background: #f1f5f9; font-weight: bold; text-align: center; }
                      .desc-table td.right { text-align: right; }
                      .desc-table td.center { text-align: center; }
                      
                      .total-row { font-weight: bold; background: #fafafa; }
                      .signature-area { margin-top: 40px; text-align: right; font-size: 11.5px; font-weight: bold; }
                    </style>
                  </head>
                  <body>
                    <button class="no-print" onclick="window.print()">인쇄 / PDF 저장</button>
                    <div class="header-title">도 착 보 고</div>
                    
                    <table class="report-table">
                      <tr>
                        <td style="width: 50%;">
                          <strong>1) Shipper</strong><br/>
                          ${(rep.shipper || activeArrivalReport.supplierName).replace(/\n/g, '<br/>')}<br/>
                          ${activeArrivalReport.items[0]?.supplierContact || ''}
                        </td>
                        <td style="width: 50%;">
                          <strong>8) Booking No.</strong><br/>
                          ${rep.bookingNo || ''}
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <strong>2) For Account & Risk Messrs.</strong><br/>
                          ${(rep.consignee || `(주)와이에스에이씨씨<br/>청주시 서원구 성봉로 180번길, 3층 302호<br/>TEL : 010-6277-7418<br/>담당자 : 이한중 이사`).replace(/\n/g, '<br/>')}
                        </td>
                        <td>
                          <strong>9) Remarks</strong><br/>
                          <span style="color: #4b5563; font-weight: 600;">${(rep.remarks || `ORIGIN : MADE IN KOREA<br/><span style="color: #ef4444;">입고일: 연도-월-일 오전 10시까지</span>`).replace(/\n/g, '<br/>')}</span>
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <strong>3) Notify Party</strong><br/>
                          ${rep.notifyParty || 'SAME AS ABOVE'}
                        </td>
                        <td style="text-align: center; vertical-align: middle;">
                          <strong>입고지</strong><br/>
                          <strong>${(rep.cfsAddress || `CMK LOGISTICS / 김경태 주임 / T.055-543-7200<br/>경남 창원시 진해구 신항8로 13`).replace(/\n/g, '<br/>')}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <div style="display: grid; grid-template-columns: 1fr 1fr;">
                            <div>
                              <strong>4) Port of Loading</strong><br/>
                              ${rep.portOfLoading || 'BUSAN PORT, SOUTH KOREA'}
                            </div>
                            <div>
                              <strong>5) Final Destination</strong><br/>
                              ${rep.finalDestination || 'HAMAD PORT, QATAR'}
                            </div>
                          </div>
                        </td>
                        <td rowspan="2" style="vertical-align: middle; text-align: center; font-size: 12px; font-weight: bold; background: #fffbeb;">
                          위 제품 상차시 내용물 및 포장에<br/>
                          파손이 없고 적절한 방법으로<br/>
                          운송하였음을 확인합니다.<br/><br/>
                          기사님 성함 : &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; (서명)<br/><br/>
                          기사님 연락처 : <br/><br/>
                          차 넘 버 : 
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <div style="display: grid; grid-template-columns: 1fr 1fr;">
                            <div>
                              <strong>6) Carrier</strong><br/>
                              ${rep.carrier || 'HMM HANUL 022W'}
                            </div>
                            <div>
                              <strong>7) sailing on or about</strong><br/>
                              ${rep.sailingOnOrAbout || '2025-12-31'}
                            </div>
                          </div>
                        </td>
                      </tr>
                    </table>

                    <table class="desc-table">
                      <thead>
                        <tr>
                          <th style="width: 15%">10) Marks</th>
                          <th>11) Description of Goods</th>
                          <th style="width: 10%">12) Qty</th>
                          <th style="width: 10%">13) Package</th>
                          <th style="width: 15%" colspan="2">14) Weight (kg)</th>
                          <th style="width: 15%">16) Measurement</th>
                        </tr>
                        <tr>
                          <th></th>
                          <th></th>
                          <th></th>
                          <th></th>
                          <th style="font-size: 9px; width: 7.5%">Net</th>
                          <th style="font-size: 9px; width: 7.5%">Gross</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        ${packingItemsList.map((it: any) => `
                          <tr>
                            <td class="center" style="font-size: 10px; line-height: 1.3; font-weight: bold;">
                              <div style="border: 1px solid #000; padding: 4px; display: inline-block;">
                                ${(it.marks || '').replace(/\n/g, '<br/>')}
                              </div>
                            </td>
                            <td style="font-size: 11px; line-height: 1.5;">
                              ${(it.descOfGoods || '').replace(/\n/g, '<br/>')}
                            </td>
                            <td class="center" style="font-weight: bold;">${(it.qty || 0).toLocaleString()}</td>
                            <td class="center">${it.packageType || 'PL'}</td>
                            <td class="right">${it.netWeight ? it.netWeight.toLocaleString() : '-'}</td>
                            <td class="right">${it.grossWeight ? it.grossWeight.toLocaleString() : '-'}</td>
                            <td class="center">${it.measurement || '-'}</td>
                          </tr>
                        `).join('')}
                        {/* Padding rows to maintain spacing */}
                        <tr>
                          <td style="border-top: none; border-bottom: none; height: 50px;"></td>
                          <td style="border-top: none; border-bottom: none;"></td>
                          <td style="border-top: none; border-bottom: none;"></td>
                          <td style="border-top: none; border-bottom: none;"></td>
                          <td style="border-top: none; border-bottom: none;"></td>
                          <td style="border-top: none; border-bottom: none;"></td>
                          <td style="border-top: none; border-bottom: none;"></td>
                        </tr>
                        <tr class="total-row">
                          <td class="center">TOTAL</td>
                          <td></td>
                          <td class="center">${totalQty.toLocaleString()}</td>
                          <td class="center"></td>
                          <td class="right">${totalNetWeight ? totalNetWeight.toLocaleString() : '-'}</td>
                          <td class="right">${totalGrossWeight ? totalGrossWeight.toLocaleString() : '-'}</td>
                          <td></td>
                        </tr>
                      </tbody>
                    </table>

                  </body>
                </html>
              `;

              const win = window.open('', '_blank');
              if (win) {
                win.document.write(printHtml);
                win.document.close();
              }
            } catch (err: any) {
              alert("도착보고 저장 실패: " + err.message);
            }
          }}
        />
      )}

    </div>
  );
};

const inputStyle = (isEditing: boolean) => ({
  padding: '8px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  fontSize: '13px',
  background: isEditing ? '#fff' : '#f8fafc',
  color: isEditing ? '#0f172a' : '#4b5563',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box' as const
});
