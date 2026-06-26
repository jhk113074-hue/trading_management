import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, getDocs, onSnapshot, setDoc, serverTimestamp, deleteDoc, collection, updateDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, COMPANY_ID, storage, auth } from '../firebase';
import type { Order, OrderItem, ForwarderEntry } from '../types/order';
import { getFormattedPoId } from '../types/order';
import type { Supplier } from '../types/supplier';
import type { Product } from '../types/product';
import { ProductModal } from '../components/ProductModal';
import { ProductSearchModal } from '../components/ProductSearchModal';
import { ArrivalReportModal } from '../components/ArrivalReportModal';
import { ForwarderSearchModal } from '../components/ForwarderSearchModal';
import { previewFile } from '../components/FilePreviewModal';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const calculatePkgFromPkgNo = (pkgNo: string | undefined): string => {
  if (!pkgNo) return '0';
  const trimmed = pkgNo.trim();
  const rangeMatch = trimmed.match(/^(\d+)\s*[-~]\s*(\d+)$/);
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10);
    const end = parseInt(rangeMatch[2], 10);
    if (end >= start) {
      return String(end - start + 1);
    }
  }
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map(p => p.trim()).filter(Boolean);
    return String(parts.length);
  }
  if (/^\d+$/.test(trimmed)) {
    return '1';
  }
  return '1';
};

interface FormattedNumberInputProps {
  value: number;
  onChange: (val: number) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
}

const FormattedNumberInput: React.FC<FormattedNumberInputProps> = ({ value, onChange, placeholder, style, disabled }) => {
  const formatWithCommas = (num: number) => {
    if (!num) return '';
    return num.toLocaleString();
  };

  const [tempValue, setTempValue] = React.useState<string>(formatWithCommas(value));

  React.useEffect(() => {
    setTempValue(formatWithCommas(value));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9.]/g, '');
    const parts = raw.split('.');
    let cleaned = raw;
    if (parts.length > 2) {
      cleaned = parts[0] + '.' + parts.slice(1).join('');
    }
    const integerPart = parts[0];
    const decimalPart = parts[1] !== undefined ? '.' + parts[1] : '';
    let formatted = '';
    if (integerPart) {
      const parsedInt = parseFloat(integerPart);
      if (!isNaN(parsedInt)) {
        formatted = parsedInt.toLocaleString() + decimalPart;
      } else {
        formatted = decimalPart;
      }
    } else {
      formatted = decimalPart;
    }
    setTempValue(formatted);
    const num = parseFloat(cleaned) || 0;
    onChange(num);
  };

  const handleBlur = () => {
    setTempValue(formatWithCommas(value));
  };

  return (
    <input
      type="text"
      value={tempValue}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      style={style}
      disabled={disabled}
    />
  );
};

const steps = ["PO접수", "소싱발주", "수출관리", "정산마감", "변경이력(Log)"] as const;

export const OrderDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeStep, setActiveStep] = useState<typeof steps[number]>("PO접수");
  const [showPoDetails, setShowPoDetails] = useState(false);
  const isEditing = true;
  const [uploadingField, setUploadingField] = useState<'poFiles' | 'lcFiles' | 'scFiles' | 'ciFiles' | 'plFiles' | 'cooFiles' | 'blFiles' | 'exportDeclarationFiles' | 'coaFiles' | 'otherFiles' | 'containerWorkFiles' | 'transportationFiles' | 'transactionFiles' | null>(null);
  const [uploadingCertSupplier, setUploadingCertSupplier] = useState<string | null>(null);
  const [piData, setPiData] = useState<any | null>(null);
  const [suppliersList, setSuppliersList] = useState<Supplier[]>([]);
  const [selectedAddSupplier, setSelectedAddSupplier] = useState('');
  const [activeSourcingTab, setActiveSourcingTab] = useState<'소싱발주' | '선적관리' | '패킹리스트' | '도착보고_쉬핑마크' | 'COA_성적서' | '세금계산서_결제' | '대금결제관리'>('소싱발주');
  
  // Product & editor state variables
  const [products, setProducts] = useState<Product[]>([]);
  const [isProdModalOpen, setIsProdModalOpen] = useState(false);
  const [editingProd, setEditingProd] = useState<Product | undefined>(undefined);
  const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
  const [searchItemIndex, setSearchItemIndex] = useState<number | null>(null);
  const [isSourcingSearch, setIsSourcingSearch] = useState(false);
  const [isPackerModalOpen, setIsPackerModalOpen] = useState(false);

  // Forwarder subwindow state
  const [isForwarderSearchOpen, setIsForwarderSearchOpen] = useState(false);
  const [forwarderSearchIndex, setForwarderSearchIndex] = useState<number | null>(null);
  
  const getSupplierPurchaseInfo = (it: any) => {
    const match = (it.name || '').match(/^\[(.*?)\]\s*(.*)$/);
    const itemCode = match ? match[1] : '-';
    const matchedProd = products.find(p => p.productCode === itemCode || p.id === itemCode);
    const originalPurchasePrice = it.originalPurchasePrice != null 
      ? it.originalPurchasePrice 
      : (it.purchaseUnitPrice != null 
         ? it.purchaseUnitPrice 
         : (matchedProd ? (matchedProd.purchasePrice || 0) : (it.unitPrice || 0)));
    const purchasePrice = it.purchaseUnitPrice != null ? it.purchaseUnitPrice : originalPurchasePrice;
    
    let purchaseCurrency = it.purchaseUnitCurrency;
    if (!purchaseCurrency) {
      if (it.originalPurchaseCurrency) {
        purchaseCurrency = it.originalPurchaseCurrency;
      } else if (purchasePrice > 1000) {
        purchaseCurrency = 'KRW';
      } else if (matchedProd) {
        purchaseCurrency = (matchedProd.currency === 'KRW' ? 'KRW' : 'USD') as any;
      } else {
        purchaseCurrency = 'USD';
      }
    }
    return { purchasePrice, purchaseCurrency, itemCode, itemName: match ? match[2] : it.name, originalPurchasePrice };
  };

  // Editable arrays
  const [orderItems, setOrderItems] = useState<Partial<OrderItem>[]>([]);
  const [sourcingItems, setSourcingItems] = useState<Partial<OrderItem>[]>([]);
  const [forwardersList, setForwardersList] = useState<ForwarderEntry[]>([]);
  const [issuedDocs, setIssuedDocs] = useState<any[]>([]);
  console.log("[DEBUG] Rendering OrderDetail page. forwardersList:", forwardersList);
  const [activeArrivalReport, setActiveArrivalReport] = useState<{ supplierName: string; items: OrderItem[] } | null>(null);

  const [uploadingReceipt, setUploadingReceipt] = useState<{ supplier: string; index: number } | null>(null);
  const [uploadingFwReceipt, setUploadingFwReceipt] = useState<{ fwIndex: number; instIndex: number } | null>(null);
  const [uploadingCollectReceipt, setUploadingCollectReceipt] = useState<number | null>(null);

  const handleCollectReceiptUpload = async (file: File, index: number) => {
    if (!order) return;
    setUploadingCollectReceipt(index);
    try {
      const uniqueFileName = `${Date.now()}_${file.name || 'pasted_collection_receipt.png'}`;
      const storageRef = ref(storage, `tasks/${order.id}/payments/collected/${index}/${uniqueFileName}`);
      const uploadTask = uploadBytesResumable(storageRef, file);
      
      await new Promise<void>((resolve, reject) => {
        uploadTask.on('state_changed', null, reject, () => resolve());
      });

      const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
      const newFile = {
        name: file.name || `외국환거래영수증_${new Date().toLocaleDateString()}.png`,
        url: downloadUrl,
        size: file.size,
        path: uploadTask.snapshot.ref.fullPath
      };

      const list = basicForm.paymentCollectedInstallments || [];
      const updatedList = [...list];
      if (!updatedList[index]) {
        updatedList[index] = { date: '', amount: 0, currency: 'USD' };
      }
      const currentReceipts = updatedList[index].receiptFiles || [];
      updatedList[index] = {
        ...updatedList[index],
        receiptFiles: [...currentReceipts, newFile]
      };

      setBasicForm(prev => ({
        ...prev,
        paymentCollectedInstallments: updatedList
      }));

      const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
      await setDoc(orderRef, {
        paymentCollectedInstallments: updatedList,
        updatedAt: serverTimestamp()
      }, { merge: true });

      alert('✅ 외국환거래영수증이 업로드 되었습니다.');
    } catch (err: any) {
      alert('❌ 업로드 실패: ' + err.message);
    } finally {
      setUploadingCollectReceipt(null);
    }
  };

  const handleDeleteCollectReceipt = async (instIndex: number, fileIndex: number) => {
    if (!order) return;
    if (!window.confirm("이 영수증을 삭제하시겠습니까?")) return;

    const list = basicForm.paymentCollectedInstallments || [];
    const updatedList = [...list];
    if (!updatedList[instIndex] || !updatedList[instIndex].receiptFiles) return;

    const fileToDelete = updatedList[instIndex].receiptFiles[fileIndex];
    const newReceipts = updatedList[instIndex].receiptFiles.filter((_, idx) => idx !== fileIndex);
    updatedList[instIndex] = {
      ...updatedList[instIndex],
      receiptFiles: newReceipts
    };

    try {
      if (fileToDelete.path) {
        const fileRef = ref(storage, fileToDelete.path);
        await deleteObject(fileRef).catch(e => console.warn("Failed to delete storage file:", e));
      }

      setBasicForm(prev => ({
        ...prev,
        paymentCollectedInstallments: updatedList
      }));

      const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
      await setDoc(orderRef, {
        paymentCollectedInstallments: updatedList,
        updatedAt: serverTimestamp()
      }, { merge: true });

      alert("✅ 삭제되었습니다.");
    } catch (err: any) {
      alert("❌ 삭제 실패: " + err.message);
    }
  };

  const handleReceiptUpload = async (file: File, index: number, supplierName: string) => {
    if (!order) return;
    setUploadingReceipt({ supplier: supplierName, index });
    try {
      const uniqueFileName = `${Date.now()}_${file.name || 'pasted_receipt.png'}`;
      const storageRef = ref(storage, `tasks/${order.id}/payments/${supplierName}/${index}/${uniqueFileName}`);
      const uploadTask = uploadBytesResumable(storageRef, file);
      
      await new Promise<void>((resolve, reject) => {
        uploadTask.on('state_changed', null, reject, () => resolve());
      });

      const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
      const newFile = {
        name: file.name || `캡처영수증_${new Date().toLocaleDateString()}.png`,
        url: downloadUrl,
        size: file.size,
        path: uploadTask.snapshot.ref.fullPath
      };

      const list = basicForm.supplierPaymentInstallments[supplierName] || [];
      const updatedList = [...list];
      if (!updatedList[index]) {
        updatedList[index] = { date: '', amount: 0, currency: 'KRW' };
      }
      const currentReceipts = updatedList[index].receiptFiles || [];
      updatedList[index] = {
        ...updatedList[index],
        receiptFiles: [...currentReceipts, newFile]
      };

      setBasicForm(prev => {
        return {
          ...prev,
          supplierPaymentInstallments: {
            ...prev.supplierPaymentInstallments,
            [supplierName]: updatedList
          }
        };
      });

      const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
      await setDoc(orderRef, {
        supplierPaymentInstallments: {
          ...basicForm.supplierPaymentInstallments,
          [supplierName]: updatedList
        },
        updatedAt: serverTimestamp()
      }, { merge: true });

      alert('✅ 입금영수증이 업로드 되었습니다.');
    } catch (err: any) {
      alert('❌ 업로드 실패: ' + err.message);
    } finally {
      setUploadingReceipt(null);
    }
  };

  const handleDeleteReceipt = async (supplierName: string, instIndex: number, fileIndex: number) => {
    if (!order) return;
    if (!window.confirm("이 영수증을 삭제하시겠습니까?")) return;

    const list = basicForm.supplierPaymentInstallments[supplierName] || [];
    const updatedList = [...list];
    if (!updatedList[instIndex] || !updatedList[instIndex].receiptFiles) return;

    const fileToDelete = updatedList[instIndex].receiptFiles[fileIndex];
    const newReceipts = updatedList[instIndex].receiptFiles.filter((_, idx) => idx !== fileIndex);
    updatedList[instIndex] = {
      ...updatedList[instIndex],
      receiptFiles: newReceipts
    };

    try {
      if (fileToDelete.path) {
        const fileRef = ref(storage, fileToDelete.path);
        await deleteObject(fileRef).catch(e => console.warn("Failed to delete storage file:", e));
      }

      setBasicForm(prev => ({
        ...prev,
        supplierPaymentInstallments: {
          ...prev.supplierPaymentInstallments,
          [supplierName]: updatedList
        }
      }));

      const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
      await setDoc(orderRef, {
        supplierPaymentInstallments: {
          ...basicForm.supplierPaymentInstallments,
          [supplierName]: updatedList
        },
        updatedAt: serverTimestamp()
      }, { merge: true });

      alert("✅ 삭제되었습니다.");
    } catch (err: any) {
      alert("❌ 삭제 실패: " + err.message);
    }
  };

  const handleFwReceiptUpload = async (file: File, fwIndex: number, instIndex: number) => {
    if (!order) return;
    setUploadingFwReceipt({ fwIndex, instIndex });
    try {
      const uniqueFileName = `${Date.now()}_${file.name || 'pasted_receipt.png'}`;
      const storageRef = ref(storage, `tasks/${order.id}/payments/forwarders/${fwIndex}/${instIndex}/${uniqueFileName}`);
      const uploadTask = uploadBytesResumable(storageRef, file);
      
      await new Promise<void>((resolve, reject) => {
        uploadTask.on('state_changed', null, reject, () => resolve());
      });

      const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
      const newFile = {
        name: file.name || `캡처영수증_${new Date().toLocaleDateString()}.png`,
        url: downloadUrl,
        size: file.size,
        path: uploadTask.snapshot.ref.fullPath
      };

      const updatedList = forwardersList.map((fw, idx) => {
        if (idx !== fwIndex) return fw;
        const instList = fw.paymentInstallments || [];
        const updatedInstList = [...instList];
        if (!updatedInstList[instIndex]) {
          updatedInstList[instIndex] = { date: '', amount: 0, currency: fw.freightCurrency || 'KRW' };
        }
        const currentReceipts = updatedInstList[instIndex].receiptFiles || [];
        updatedInstList[instIndex] = {
          ...updatedInstList[instIndex],
          receiptFiles: [...currentReceipts, newFile]
        };
        return {
          ...fw,
          paymentInstallments: updatedInstList
        };
      });

      setForwardersList(updatedList);

      const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
      await setDoc(orderRef, {
        forwarders: updatedList,
        updatedAt: serverTimestamp()
      }, { merge: true });

      alert('✅ 입금영수증이 업로드 되었습니다.');
    } catch (err: any) {
      alert('❌ 업로드 실패: ' + err.message);
    } finally {
      setUploadingFwReceipt(null);
    }
  };

  const handleDeleteFwReceipt = async (fwIndex: number, instIndex: number, fileIndex: number) => {
    if (!order) return;
    if (!window.confirm("이 영수증을 삭제하시겠습니까?")) return;

    const fw = forwardersList[fwIndex];
    if (!fw || !fw.paymentInstallments || !fw.paymentInstallments[instIndex] || !fw.paymentInstallments[instIndex].receiptFiles) return;

    const fileToDelete = fw.paymentInstallments[instIndex].receiptFiles[fileIndex];
    const newReceipts = fw.paymentInstallments[instIndex].receiptFiles.filter((_, idx) => idx !== fileIndex);

    const updatedList = forwardersList.map((f, idx) => {
      if (idx !== fwIndex) return f;
      const updatedInst = [...(f.paymentInstallments || [])];
      updatedInst[instIndex] = {
        ...updatedInst[instIndex],
        receiptFiles: newReceipts
      };
      return {
        ...f,
        paymentInstallments: updatedInst
      };
    });

    try {
      if (fileToDelete.path) {
        const fileRef = ref(storage, fileToDelete.path);
        await deleteObject(fileRef).catch(e => console.warn("Failed to delete storage file:", e));
      }

      setForwardersList(updatedList);

      const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
      await setDoc(orderRef, {
        forwarders: updatedList,
        updatedAt: serverTimestamp()
      }, { merge: true });

      alert("✅ 삭제되었습니다.");
    } catch (err: any) {
      alert("❌ 삭제 실패: " + err.message);
    }
  };

  // CFS related states
  const [cfsList, setCfsList] = useState<string[]>([]);
  const [isAddingCfs, setIsAddingCfs] = useState(false);
  const [newCfsVal, setNewCfsVal] = useState('');

  // PO presets states
  const [poPresets, setPoPresets] = useState<{ specialRemarks: string[]; generalNotes: string[] }>({
    specialRemarks: [],
    generalNotes: []
  });

  

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'companies', COMPANY_ID, 'po_presets', 'settings'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setPoPresets({
          specialRemarks: data.specialRemarks || [],
          generalNotes: data.generalNotes || []
        });
      } else {
        setPoPresets({
          specialRemarks: [],
          generalNotes: []
        });
      }
    });
    return () => unsubscribe();
  }, []);

  const handleAddPoPreset = async (type: 'specialRemarks' | 'generalNotes', text: string) => {
    if (!text.trim()) {
      alert("등록할 문구를 입력해주세요.");
      return;
    }
    const currentList = poPresets[type];
    if (currentList.includes(text)) {
      alert("이미 동일한 템플릿이 등록되어 있습니다.");
      return;
    }
    try {
      const presetsRef = doc(db, 'companies', COMPANY_ID, 'po_presets', 'settings');
      const nextList = [...currentList, text];
      await setDoc(presetsRef, {
        [type]: nextList
      }, { merge: true });
      alert("✅ 신규 템플릿이 성공적으로 DB에 등록되었습니다.");
    } catch (err: any) {
      alert("템플릿 등록 실패: " + err.message);
    }
  };

  const handleDeletePoPreset = async (type: 'specialRemarks' | 'generalNotes', text: string) => {
    if (!text) return;
    if (!window.confirm("선택한 템플릿을 DB에서 삭제하시겠습니까?")) return;
    const currentList = poPresets[type];
    try {
      const presetsRef = doc(db, 'companies', COMPANY_ID, 'po_presets', 'settings');
      const nextList = currentList.filter(item => item !== text);
      await setDoc(presetsRef, {
        [type]: nextList
      }, { merge: true });
      alert("✅ 템플릿이 DB에서 성공적으로 삭제되었습니다.");
    } catch (err: any) {
      alert("템플릿 삭제 실패: " + err.message);
    }
  };

  // Common shipping mark configuration state
  const [commonShippingMark, setCommonShippingMark] = useState({
    shape: 'diamond',
    company: 'YSACC',
    port: '',
    country: '',
    origin: 'MADE IN KOREA'
  });

  const getDefaultShippingMark = (pageNo = '1', totalCount = '1') => {
    const shapeVal = commonShippingMark.shape;
    const compVal = commonShippingMark.company;
    const portVal = commonShippingMark.port;
    const countryVal = commonShippingMark.country;
    const originVal = commonShippingMark.origin;
    
    let shapeSymbol = '◯';
    if (shapeVal === 'circle') shapeSymbol = '◯';
    else if (shapeVal === 'square') shapeSymbol = '▢';
    else if (shapeVal === 'triangle') shapeSymbol = '△';
    else shapeSymbol = '◇';

    return `${shapeSymbol}\n${compVal}\n${portVal}, ${countryVal}\nPKG NO. : ${pageNo} / ${totalCount}\n${originVal}`;
  };

  // Sync common shipping mark defaults with order details once when order is first loaded
  const hasInitializedCommonShippingMark = useRef(false);
  useEffect(() => {
    if (order && !hasInitializedCommonShippingMark.current) {
      setCommonShippingMark(prev => ({
        shape: (order as any).commonShippingMark?.shape || prev.shape || 'diamond',
        company: (order as any).commonShippingMark?.company || prev.company || 'YSACC',
        port: (order as any).commonShippingMark?.port || prev.port || order.portOfDischarge || '',
        country: (order as any).commonShippingMark?.country || prev.country || order.destinationCountry || '',
        origin: (order as any).commonShippingMark?.origin || prev.origin || 'MADE IN KOREA'
      }));
      hasInitializedCommonShippingMark.current = true;
    }
  }, [order]);

  // Fetch CFS Locations
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'companies', COMPANY_ID, 'cfsLocations'), (snapshot) => {
      const list: string[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.address) {
          list.push(data.address);
        }
      });
      setCfsList(list);
    });
    return () => unsubscribe();
  }, []);

  // Fetch products
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'companies', COMPANY_ID, 'products'), (snapshot) => {
      const list: Product[] = [];
      snapshot.forEach(docSnap => {
        list.push({ ...docSnap.data(), id: docSnap.id } as Product);
      });
      setProducts(list);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'companies', COMPANY_ID, 'suppliers'), (snapshot) => {
      const list: Supplier[] = [];
      snapshot.forEach(docSnap => {
        list.push({ ...docSnap.data(), id: docSnap.id } as Supplier);
      });
      setSuppliersList(list);
    });
    return () => unsubscribe();
  }, []);

  // Form states for details editing
  const [basicForm, setBasicForm] = useState({
    piNumber: '',
    customer: '',
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
    cargoCutoffDate: '',
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
    finalFreight: 0,
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
    packingList: null as any,
    supplierPurchaseCertificate: {} as Record<string, 'Y' | 'N' | ''>,
    supplierTaxTypes: {} as Record<string, '영세' | '과세'>,
    supplierTaxInvoiceDetails: {} as Record<string, { date: string; invoiceNo: string; } | Array<{ date: string; invoiceNo: string; }>>,
    supplierPoDetails: {} as Record<string, { requestDate?: string; deliveryPlace?: string; specialRemarks?: string; generalNotes?: string; }>,
    supplierPurchaseCertFiles: {} as Record<string, Array<{ name: string; url: string; size: number; path: string }>>,
    supplierPaymentInstallments: {} as Record<string, Array<{ date: string; amount: number; currency?: 'KRW' | 'USD'; receiptFiles?: Array<{ name: string; url: string; size: number; path: string }> }>>,
    paymentCollectedInstallments: [{ date: '', amount: 0, fee: 0, total: 0, currency: 'USD' }] as Array<{ date: string; amount: number; fee?: number; total?: number; currency: 'KRW' | 'USD' | 'CNY' | 'EUR'; receiptFiles?: Array<{ name: string; url: string; size: number; path: string }> }>,
    bankSubmissionStatus: '' as 'Y' | 'N' | '',

    // 주문 기본정보 및 L/C 거래 상세
    customerAddress: '',
    portOfLoading: '',
    portOfDischarge: '',
    destinationCountry: '',
    lcIssuingBank: '',
    lcIssuingDate: '',
    lcDescription: '',
    lcRemark: ''
  });

  const [myCompanies, setMyCompanies] = useState<any[]>([]);

  const getShipperText = (issuingCompany: string) => {
    const comp = myCompanies.find(c => c.id === issuingCompany);
    if (comp) {
      const name = comp.nameEn || comp.nameKo || (issuingCompany === 'YS' ? 'YS ACC' : 'YSACC CO., LTD.');
      const addr = comp.addressEn || comp.addressKo || (issuingCompany === 'YS' ? '경기 김포시 양촌읍 듬박로 89' : 'NO.302,180, SEONGBONG-RO, SEOWON-GU,\nCHENGJU-SI, CHUNGBUK, 28645, SOUTH KOREA.');
      const tel = comp.phone ? `TEL: ${comp.phone}` : '';
      const fax = comp.fax ? `FAX: ${comp.fax}` : '';
      const contactLine = [tel, fax].filter(Boolean).join(', ');
      return `${name}\n${addr}${contactLine ? `\n${contactLine}` : ''}`;
    }
    return issuingCompany === 'YS'
      ? `YS ACC\n경기 김포시 양촌읍 듬박로 89\nTEL: 010-4494-1028`
      : `YSACC CO., LTD.\nNO.302,180, SEONGBONG-RO, SEOWON-GU,\nCHENGJU-SI, CHUNGBUK, 28645, SOUTH KOREA.\nTEL: +82-70-4141-2927, FAX: +82-303-3444-1130`;
  };

  useEffect(() => {
    const loadMyCompanies = async () => {
      try {
        const snap = await getDocs(collection(doc(db, 'companies', COMPANY_ID), 'my_companies'));
        const list = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        setMyCompanies(list);
      } catch (err) {
        console.error("Failed to load my companies:", err);
      }
    };
    loadMyCompanies();
  }, []);

  // 1. Auto-update packing list shipper address with company settings DB values
  useEffect(() => {
    if (myCompanies.length > 0 && basicForm.packingList) {
      const isYS = (order?.issuingCompany || basicForm.issuingCompany) === 'YS';
      const issuingCompany = isYS ? 'YS' : 'YSACC';
      const comp = myCompanies.find(c => c.id === issuingCompany);
      if (comp) {
        const freshShipper = `${comp.nameEn || comp.nameKo || ''}\n${comp.addressEn || comp.addressKo || ''}\nTEL: ${comp.phone || ''}${comp.fax ? `, FAX: ${comp.fax}` : ''}`;
        const currentShipper = basicForm.packingList.shipper || '';
        
        // If current shipper is empty or is one of the legacy fallbacks, update it to the fresh database values!
        const isLegacy = !currentShipper || 
                         currentShipper.includes('듬박로 89') || 
                         currentShipper.includes('SEONGBONG-RO');
                         
        if (isLegacy && currentShipper !== freshShipper) {
          setBasicForm(prev => {
            if (!prev.packingList) return prev;
            return {
              ...prev,
              packingList: {
                ...prev.packingList,
                shipper: freshShipper
              }
            };
          });
        }
      }
    }
  }, [myCompanies, order?.issuingCompany, basicForm.packingList ? true : false]);

  // 2. Auto-sync Vessel Name and Sailing Date with basicForm's vesselBooking and etd (출항예정일)
  useEffect(() => {
    if (basicForm.packingList) {
      const currentVessel = basicForm.packingList.vesselName || '';
      const currentSailing = basicForm.packingList.sailingDate || '';
      const freshVessel = basicForm.vesselBooking || '';
      const freshSailing = basicForm.etd || '';
      
      if (currentVessel !== freshVessel || currentSailing !== freshSailing) {
        setBasicForm(prev => {
          if (!prev.packingList) return prev;
          return {
            ...prev,
            packingList: {
              ...prev.packingList,
              vesselName: freshVessel,
              sailingDate: freshSailing
            }
          };
        });
      }
    }
  }, [basicForm.vesselBooking, basicForm.etd, basicForm.packingList ? true : false]);

  const initialLoadRef = useRef(false);
  const isDirtyRef = useRef(false);
  const skipNextDirtyCheck = useRef(true);

  useEffect(() => {
    if (skipNextDirtyCheck.current) {
      skipNextDirtyCheck.current = false;
      return;
    }
    if (!order) return; // Prevent setting dirty state if order has been deleted
    isDirtyRef.current = true;
  }, [basicForm, orderItems, forwardersList, commonShippingMark, order]);

  const handleNavigation = async (path: string) => {
    if (isDirtyRef.current) {
      await handleSaveBasic(false);
      isDirtyRef.current = false;
    }
    navigate(path);
  };

  useEffect(() => {
    const handleGlobalClick = async (e: MouseEvent) => {
      if (!isDirtyRef.current) return;
      const target = e.target as HTMLElement;
      const link = target.closest('a');
      // Intercept clicks on links that are internal
      if (link && link.href && link.href !== window.location.href && (!link.target || link.target !== '_blank')) {
        e.preventDefault();
        e.stopPropagation();
        await handleSaveBasic(false);
        isDirtyRef.current = false;
        navigate(new URL(link.href).pathname + new URL(link.href).search);
      }
    };
    document.addEventListener('click', handleGlobalClick, true);
    return () => document.removeEventListener('click', handleGlobalClick, true);
  }); // run on every render to capture the latest handleSaveBasic closure

  // Keep latest packing list data for handlePackerMessage event listener
  const latestPackingDataRef = useRef({ basicForm, orderItems, products, order });
  latestPackingDataRef.current = { basicForm, orderItems, products, order };

  // Listen for Container Packer EXPORT_PACKING_LIST & IFRAME_READY messages
  useEffect(() => {
    const handlePackerMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data && data.type === 'EXPORT_PACKING_LIST') {
        const receivedContainers = data.containers;
        if (receivedContainers && Array.isArray(receivedContainers)) {
          setBasicForm(prev => ({
            ...prev,
            packingList: {
              ...prev.packingList,
              containers: receivedContainers
            }
          }));
          setIsPackerModalOpen(false);
          alert('컨테이너 적재 시뮬레이션 결과가 패킹리스트에 반영되었습니다.');
        }
      } else if (data && data.type === 'IFRAME_READY') {
        if (event.source) {
          const { basicForm: latestBasicForm, orderItems: latestOrderItems, products: latestProducts, order: latestOrder } = latestPackingDataRef.current;

          const itemsPayload: any[] = [];
          if (latestBasicForm.packingList?.containers) {
            latestBasicForm.packingList.containers.forEach((c: any) => {
              (c.items || []).forEach((it: any) => {
                if (!it.description && !it.pkgNo) return;
                const cleanDims = String(it.dimensions || '1100x1100x1000').toLowerCase().replace(/\s+/g, '');
                const dims = cleanDims.split('x');
                const w = Number(dims[0]) || 1100;
                const d = Number(dims[1]) || 1100;
                const h = Number(dims[2]) || 1000;
                
                itemsPayload.push({
                  desc: it.description || '화물',
                  qty: Number(it.pkg) || 1,
                  w: w,
                  d: d,
                  h: h,
                  netWeight: Number(it.netWeight) || 0,
                  grossWeight: Number(it.grossWeight) || 0,
                  packageType: it.packageType || 'Pallet'
                });
              });
            });
          }
          
          if (itemsPayload.length === 0) {
            latestOrderItems.forEach((item: any) => {
              const match = (item.name || '').match(/^\[(.*?)\]\s*(.*)$/);
              const itemCode = match ? match[1] : '-';
              const matchedProd = latestProducts.find(p => p.productCode === itemCode || p.id === itemCode || p.id === item.itemId);
              const list = matchedProd?.packingMethods || [];
              const isPlt = (item.packageType || '').toLowerCase().includes('pallet');
              const w = Number(isPlt ? (list[0]?.palletWidth || matchedProd?.palletWidth) : matchedProd?.unitWidth) || 1100;
              const d = Number(isPlt ? (list[0]?.palletLength || matchedProd?.palletLength) : matchedProd?.unitLength) || 1100;
              const h = Number(isPlt ? (list[0]?.palletHeight || matchedProd?.palletHeight) : matchedProd?.unitHeight) || 1000;
              
              itemsPayload.push({
                desc: item.name || '화물',
                qty: item.qty || 1,
                w: w,
                d: d,
                h: h,
                netWeight: Number(item.netWeight || matchedProd?.palletWeight || 0),
                grossWeight: Number(item.grossWeight || matchedProd?.palletGrossWeight || 0),
                packageType: item.packageType || 'Pallet'
              });
            });
          }

          const containersPayload: Record<string, number> = {};
          if (latestBasicForm.packingList?.containers) {
            latestBasicForm.packingList.containers.forEach((c: any) => {
              const type = c.containerType || '20GP';
              containersPayload[type] = (containersPayload[type] || 0) + 1;
            });
          }
          if (Object.keys(containersPayload).length === 0) {
            containersPayload['20GP'] = 1;
          }

          (event.source as WindowProxy).postMessage({
            type: 'LOAD_PI_DATA',
            customer: latestBasicForm.customer || '',
            piNumber: latestBasicForm.piNumber || latestOrder?.id || '',
            date: latestBasicForm.etd || new Date().toISOString().split('T')[0],
            containers: containersPayload,
            items: itemsPayload
          }, '*');
        }
      }
    };

    window.addEventListener('message', handlePackerMessage);
    return () => window.removeEventListener('message', handlePackerMessage);
  }, []);

  // Load Order document
  useEffect(() => {
    if (!id) return;
    const docRef = doc(db, 'companies', COMPANY_ID, 'orders', id);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() } as Order;
        skipNextDirtyCheck.current = true;
        setOrder(data);
        if ((data as any).po_issued_documents) {
          setIssuedDocs((data as any).po_issued_documents);
        }
        
        if (!initialLoadRef.current) {
          const params = new URLSearchParams(window.location.search);
          const urlStep = params.get('step');
          if (urlStep && steps.includes(urlStep as any)) {
            setActiveStep(urlStep as any);
          } else if (data.status) {
            const mappedStatus = 
              data.status === '주문' ? 'PO접수' :
              data.status === '발주' ? '소싱발주' :
              data.status === '선적관리' ? '수출관리' :
              data.status === '이익관리' ? '정산마감' : 'PO접수';
            setActiveStep(mappedStatus as any);
          }
          initialLoadRef.current = true;
        }
        setBasicForm({
          piNumber: data.piNumber || data.quotationId || '',
          customer: data.customer || '',
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
          cargoCutoffDate: data.cargoCutoffDate || '',
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
          finalFreight: data.finalFreight || 0,
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
          packingList: data.packingList || (() => {
            const defaultContainers = [
              {
                containerNo: data.containerVolumeQuantities || '',
                sealNo: '',
                items: (data.items || []).map((it, idx) => {
                  const netWeight = Math.round(it.qty || 0);
                  const grossWeight = Math.round(netWeight * 1.02);
                  const cbm = Number(((netWeight / 1000) * 1.5).toFixed(2));
                    return {
                      shippingMark: '',
                      description: `P#${idx + 1}. ${it.name || ''} - ${(it.qty || 0).toLocaleString()} ${it.unit || 'EA'}`,
                      supplier: it.supplier || 'General Supplier',
                      pkgNo: '',
                      pkg: '1',
                      netWeight: String(netWeight),
                      grossWeight: String(grossWeight),
                      cbm: String(cbm)
                    };
                })
              }
            ];
            const shipperAddr = getShipperText(data.issuingCompany || 'YSACC');
            // Build applicant text: customer name + address if available
            const applicantText = data.customerAddress
              ? `${data.customer || ''}\n${data.customerAddress}`
              : (data.customer || '');
            return {
              shipper: shipperAddr,
              applicant: applicantText,
              notifyParty: applicantText,
              pol: data.portOfLoading || '',
              pod: data.portOfDischarge || '',
              vesselName: data.vesselBooking || '',
              sailingDate: data.etd || '',
              paymentTerms: data.paymentTerms || '',
              deliveryTerms: data.incoterms || '',
              remarks: data.remark || '',
              invoiceNo: data.ciNumber || data.piNumber || '',
              invoiceDate: data.ciPlSentDate || data.piDate || new Date().toISOString().split('T')[0],
              lcNo: data.lcNo || '',
              lcDate: data.lcIssuingDate || data.bankSubmissionDate || '',
              lcIssuingBank: data.lcIssuingBank || '',
              containers: defaultContainers
            };
          })(),
          supplierPurchaseCertificate: data.supplierPurchaseCertificate || {},
          supplierTaxTypes: data.supplierTaxTypes || {},
          supplierTaxInvoiceDetails: data.supplierTaxInvoiceDetails || {},
          supplierPoDetails: data.supplierPoDetails || {},
          supplierPurchaseCertFiles: data.supplierPurchaseCertFiles || {},
          supplierPaymentInstallments: data.supplierPaymentInstallments || {},
          paymentCollectedInstallments: (data.paymentCollectedInstallments && data.paymentCollectedInstallments.length > 0)
            ? data.paymentCollectedInstallments
            : [{ date: '', amount: 0, fee: 0, total: 0, currency: 'USD' }],
          bankSubmissionStatus: data.bankSubmissionStatus || '',

          // 주문 기본정보 및 L/C 거래 상세 로드
          customerAddress: data.customerAddress || '',
          portOfLoading: data.portOfLoading || '',
          portOfDischarge: data.portOfDischarge || '',
          destinationCountry: data.destinationCountry || '',
          lcIssuingBank: data.lcIssuingBank || '',
          lcIssuingDate: data.lcIssuingDate || '',
          lcDescription: data.lcDescription || '',
          lcRemark: data.lcRemark || ''
        });
        setOrderItems(data.items || []);
        setSourcingItems(data.sourcingItems || data.items || []);
        setForwardersList(data.forwarders || []);
        if (data.activeSourcingTab) {
          setActiveSourcingTab(data.activeSourcingTab as any);
        }
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
  const handleStepClick = async (stepName: typeof steps[number]) => {
    setActiveStep(stepName);
    await handleSaveBasic(false, undefined, stepName);
  };

  // Group items by supplier for Purchase Orders preview
  const groupedSupplierItems = useMemo(() => {
    if (!sourcingItems) return {};
    const groups: Record<string, OrderItem[]> = {};
    (sourcingItems as OrderItem[]).forEach(item => {
      const supplierName = item.supplier?.trim() || 'General Supplier';
      if (!groups[supplierName]) {
        groups[supplierName] = [];
      }
      groups[supplierName].push(item);
    });
    return groups;
  }, [sourcingItems]);

  const allOrderSuppliers = useMemo(() => {
    if (!order) return [];
    const itemSuppliers = Object.keys(groupedSupplierItems).filter(s => s !== 'General Supplier');
    const additional = order.additionalSuppliers || [];
    return Array.from(new Set([...itemSuppliers, ...additional]));
  }, [groupedSupplierItems, order]);

  // Save details changes
  const handleSaveBasic = async (showMsg: boolean = true, tabIdOverride?: string, stepNameOverride?: string) => {
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

      const totalAmount = orderItems.reduce((sum, item) => sum + (item.amount || 0), 0)
        + forwardersList.reduce((sum, fw) => sum + (parseFloat(fw.budgetAmountUsd as any) || 0), 0);
      const hasUsd = orderItems.some(it => it.currency === 'USD');
      const hasKrw = orderItems.some(it => it.currency === 'KRW');
      let orderCurrency: 'USD' | 'KRW' | 'mixed' = 'USD';
      if (hasUsd && hasKrw) {
        orderCurrency = 'mixed';
      } else if (hasKrw) {
        orderCurrency = 'KRW';
      }

      // Detect changes and generate log description
      const changes: string[] = [];
      if (order.piNumber !== basicForm.piNumber) changes.push(`PI 번호 변경: "${order.piNumber || ''}" → "${basicForm.piNumber}"`);
      if (order.customer !== basicForm.customer) changes.push(`고객사 변경: "${order.customer || ''}" → "${basicForm.customer}"`);
      if (order.custPo !== basicForm.custPo) changes.push(`고객사 PO 변경: "${order.custPo || ''}" → "${basicForm.custPo}"`);
      if (order.incoterms !== basicForm.incoterms) changes.push(`인코텀즈 변경: "${order.incoterms || ''}" → "${basicForm.incoterms}"`);
      if (order.paymentTerms !== basicForm.paymentTerms) changes.push(`결제조건 변경: "${order.paymentTerms || ''}" → "${basicForm.paymentTerms}"`);
      if (order.poDate !== basicForm.poDate) changes.push(`PO접수일 변경: "${order.poDate || ''}" → "${basicForm.poDate}"`);
      if (order.requestedDelivery !== basicForm.requestedDelivery) changes.push(`요청납기 변경: "${order.requestedDelivery || ''}" → "${basicForm.requestedDelivery}"`);
      if (order.remark !== basicForm.remark) changes.push(`비고(Remarks) 변경: "${order.remark || ''}" → "${basicForm.remark}"`);
      if (order.ciNumber !== basicForm.ciNumber) changes.push(`CI 번호 변경: "${order.ciNumber || ''}" → "${basicForm.ciNumber}"`);
      if (order.isLc !== basicForm.isLc) changes.push(`L/C거래여부 변경: "${order.isLc || ''}" → "${basicForm.isLc}"`);
      
      const sourcingTabToSave = tabIdOverride || activeSourcingTab;
      const stepToSave = stepNameOverride || activeStep;
      const mappedStatus = stepToSave === 'PO접수' ? '주문' : 
                           stepToSave === '소싱발주' ? '발주' :
                           stepToSave === '수출관리' ? '선적관리' :
                           stepToSave === '정산마감' ? '이익관리' : null;

      if (mappedStatus && order.status !== mappedStatus) {
        changes.push(`진행단계 변경: "${order.status || ''}" → "${mappedStatus}"`);
      }

      // Compare items length or amounts
      if (JSON.stringify(order.items || []) !== JSON.stringify(orderItems)) {
        changes.push(`품목 리스트 변경 (총 ${orderItems.length}개 품목)`);
      }
      if (JSON.stringify(order.forwarders || []) !== JSON.stringify(forwardersList)) {
        changes.push('운송사(포워더) 지정 및 운임 예산 변경');
      }

      let nextHistoryLogs = (order as any).history_logs || [];
      if (changes.length > 0) {
        const logEntry = {
          timestamp: new Date().toISOString(),
          actionType: 'update',
          user: auth.currentUser?.displayName || auth.currentUser?.email || 'System',
          description: changes.join('\n')
        };
        nextHistoryLogs = [logEntry, ...nextHistoryLogs];
      }

      await setDoc(docRef, {
        history_logs: nextHistoryLogs,
        status: stepToSave === '변경이력(Log)' ? (order.status || '주문') : (mappedStatus || '주문'),
        piNumber: basicForm.piNumber,
        customer: basicForm.customer,
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
        cfsContactInfo: basicForm.cfsContactInfo || '',
        docCutoffDate: basicForm.docCutoffDate,
        docsDeadlineDate: basicForm.docCutoffDate,
        cargoCutoffDate: basicForm.cargoCutoffDate || '',
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
        finalFreight: Number(basicForm.finalFreight) || 0,
        cfsAddress: basicForm.cfsAddress || '',
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
        supplierTaxInvoiceDetails: basicForm.supplierTaxInvoiceDetails || {},
        supplierPoDetails: basicForm.supplierPoDetails,
        supplierPurchaseCertFiles: basicForm.supplierPurchaseCertFiles,
        supplierPaymentInstallments: basicForm.supplierPaymentInstallments,
        paymentCollectedInstallments: basicForm.paymentCollectedInstallments || [],
        bankSubmissionStatus: basicForm.bankSubmissionStatus,

        // 주문 기본정보 및 L/C 거래 상세 저장
        customerAddress: basicForm.customerAddress,
        portOfLoading: basicForm.portOfLoading,
        portOfDischarge: basicForm.portOfDischarge,
        destinationCountry: basicForm.destinationCountry,
        lcIssuingBank: basicForm.lcIssuingBank,
        lcIssuingDate: basicForm.lcIssuingDate,
        lcDescription: basicForm.lcDescription,
        lcRemark: basicForm.lcRemark,

        packingList: basicForm.packingList || null,
        commonShippingMark: commonShippingMark,
        activeSourcingTab: sourcingTabToSave,
        
        items: orderItems.map(it => ({
          itemId: it.itemId || '',
          name: it.name || '',
          supplier: it.supplier || '',
          supplierContact: it.supplierContact || '',
          grade: it.grade || '',
          qty: parseFloat(it.qty as any) || 0,
          unit: (it.unit || 'kg') as any,
          unitPrice: parseFloat(it.unitPrice as any) || 0,
          purchaseUnitPrice: it.purchaseUnitPrice != null ? (parseFloat(it.purchaseUnitPrice as any) || 0) : null,
          purchaseUnitCurrency: it.purchaseUnitCurrency || null,
          originalPurchasePrice: it.originalPurchasePrice != null ? (parseFloat(it.originalPurchasePrice as any) || 0) : null,
          originalPurchaseCurrency: it.originalPurchaseCurrency || null,
          amount: it.amount || 0,
          currency: (it.currency || 'USD') as any
        })),
        sourcingItems: sourcingItems.map(it => ({
          itemId: it.itemId || '',
          name: it.name || '',
          supplier: it.supplier || '',
          supplierContact: it.supplierContact || '',
          grade: it.grade || '',
          qty: parseFloat(it.qty as any) || 0,
          unit: (it.unit || 'kg') as any,
          unitPrice: parseFloat(it.unitPrice as any) || 0,
          purchaseUnitPrice: it.purchaseUnitPrice != null ? (parseFloat(it.purchaseUnitPrice as any) || 0) : null,
          purchaseUnitCurrency: it.purchaseUnitCurrency || null,
          originalPurchasePrice: it.originalPurchasePrice != null ? (parseFloat(it.originalPurchasePrice as any) || 0) : null,
          originalPurchaseCurrency: it.originalPurchaseCurrency || null,
          amount: it.amount || 0,
          currency: (it.currency || 'USD') as any
        })),
        totalAmount,
        currency: orderCurrency,
        forwarders: forwardersList.map(fw => {
          const budget = !fw.budgetAmountUsd ? 0 : Number(fw.budgetAmountUsd);
          const freight = !fw.freightAmount ? 0 : Number(fw.freightAmount);
          const domestic = !fw.amountKrw ? 0 : Number(fw.amountKrw);
          return {
            ...fw,
            budgetAmountUsd: budget,
            freightAmount: freight,
            amountKrw: domestic,
            amountUsd: budget,
            finalAmountUsd: fw.finalAmountUsd || (fw.freightCurrency === 'USD' ? freight : 0),
            finalAmountKrw: fw.finalAmountKrw || domestic + (fw.freightCurrency === 'KRW' ? freight : 0),
          };
        }),
        forwarderFreightAmount: forwardersList[0] ? (
          (forwardersList[0].freightCurrency === 'USD' ? Number(forwardersList[0].freightAmount) : 0) || 
          Number(forwardersList[0].amountUsd) || 
          Number(forwardersList[0].amountKrw) || 
          0
        ) : 0,
        forwarderFreightCurrency: (forwardersList[0] ? (forwardersList[0].freightCurrency || (forwardersList[0].amountUsd ? 'USD' : 'KRW')) : 'KRW') as any,
        
        updatedAt: serverTimestamp()
      }, { merge: true });

      isDirtyRef.current = false;
      if (showMsg) {
        alert('✅ 저장되었습니다.');
      }
    } catch (e: any) {
      if (showMsg) {
        alert('❌ 저장 실패: ' + e.message);
      }
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

  const handleSourcingItemChange = (index: number, field: keyof OrderItem, value: any) => {
    setSourcingItems(prev => {
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

  const handleSelectSourcingProduct = (idx: number, prod: Product) => {
    setSourcingItems(prev => {
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
    console.log("[DEBUG] handleForwarderChange called:", index, field, value);
    setForwardersList(prev => {
      const next = prev.map((f, i) => i === index ? { ...f, [field]: value } : f);
      console.log("[DEBUG] Updated forwardersList state to:", next);
      return next;
    });
  };

  const addForwarderRow = () => {
    setForwardersList(prev => [...prev, { name: '', amountUsd: 0, amountKrw: 0, budgetAmountUsd: 0 }]);
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
  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>, fieldName: 'poFiles' | 'lcFiles' | 'scFiles' | 'ciFiles' | 'plFiles' | 'cooFiles' | 'blFiles' | 'exportDeclarationFiles' | 'coaFiles' | 'otherFiles' | 'containerWorkFiles' | 'transportationFiles' | 'transactionFiles') => {
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

      const updatedCertFiles = {
        ...basicForm.supplierPurchaseCertFiles,
        [supplierName]: [newFile]
      };

      setBasicForm(prev => {
        return {
          ...prev,
          supplierPurchaseCertFiles: updatedCertFiles
        };
      });

      // Save to Firebase immediately
      const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
      await setDoc(orderRef, {
        supplierPurchaseCertFiles: updatedCertFiles,
        updatedAt: serverTimestamp()
      }, { merge: true });

      alert('✅ 구매확인서 파일이 성공적으로 업로드 및 클라우드에 저장되었습니다.');
    } catch (err: any) {
      alert('❌ 업로드 실패: ' + err.message);
    } finally {
      setUploadingCertSupplier(null);
    }
  };

  const getShippingMarkShapeImgHtml = (shapeSymbol: string, comp: string) => {
    const compEscaped = (comp || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let svg = '';
    let w = 60, h = 60;
    if (shapeSymbol.includes('◯') || shapeSymbol.includes('Circle') || shapeSymbol.includes('원형')) {
      svg = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><circle cx="30" cy="30" r="26" stroke="black" stroke-width="2.5" fill="none" /><text x="50%" y="54%" font-size="12" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="black">${compEscaped}</text></svg>`;
      w = 60; h = 60;
    } else if (shapeSymbol.includes('▢') || shapeSymbol.includes('Square') || shapeSymbol.includes('사각형') || shapeSymbol.includes('[')) {
      svg = `<svg xmlns="http://www.w3.org/2000/svg" width="65" height="45"><rect x="4" y="4" width="57" height="37" stroke="black" stroke-width="2.5" fill="none" /><text x="50%" y="54%" font-size="12" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="black">${compEscaped}</text></svg>`;
      w = 65; h = 45;
    } else if (shapeSymbol.includes('△') || shapeSymbol.includes('Triangle') || shapeSymbol.includes('삼각형') || shapeSymbol.includes('▲')) {
      svg = `<svg xmlns="http://www.w3.org/2000/svg" width="65" height="60"><polygon points="32,4 4,56 61,56" stroke="black" stroke-width="2.5" fill="none" /><text x="50%" y="68%" font-size="11" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="black">${compEscaped}</text></svg>`;
      w = 65; h = 60;
    } else {
      // diamond
      svg = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><polygon points="30,4 56,30 30,56 4,30" stroke="black" stroke-width="2.5" fill="none" /><text x="50%" y="54%" font-size="11" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="black">${compEscaped}</text></svg>`;
      w = 60; h = 60;
    }
    
    let imgData = '';
    try {
      imgData = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    } catch (e) {
      console.error(e);
    }
    return `<img src="${imgData}" style="display: block; margin: 5px auto; width: ${w}px; height: ${h}px;" />`;
  };



  const renderShippingMarkCellHtml = (marksText: string) => {
    if (!marksText) return '';
    const lines = marksText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return '';

    const firstLine = lines[0];
    const isShape = firstLine.includes('◯') || firstLine.includes('Circle') || firstLine.includes('원형') ||
                    firstLine.includes('▢') || firstLine.includes('Square') || firstLine.includes('사각형') || firstLine.includes('[') ||
                    firstLine.includes('△') || firstLine.includes('Triangle') || firstLine.includes('삼각형') || firstLine.includes('▲') ||
                    firstLine.includes('◇') || firstLine.includes('Diamond') || firstLine.includes('다이아몬드') || firstLine.includes('◆');

    if (isShape && lines.length > 1) {
      const shapeSymbol = firstLine;
      const comp = lines[1];
      const remainingLines = lines.slice(2);

      const shapeHtml = getShippingMarkShapeImgHtml(shapeSymbol, comp);
      const extraLinesHtml = remainingLines.map(line => `<div>${line}</div>`).join('');

      return `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; line-height: 1.2; margin: 0 auto; text-align: center;">
        ${shapeHtml}
        <div style="font-size: 8.5px; font-weight: bold; text-align: center; text-transform: uppercase;">
          ${extraLinesHtml}
        </div>
      </div>`;
    } else {
      return `<div style="border: 1px solid #000; padding: 4px; display: inline-block; font-size: 9.5px; line-height: 1.2; text-align: left; white-space: pre-line;">${marksText}</div>`;
    }
  };

  const handleSaveSupplierPoDetails = async (supplierName: string) => {
    if (!order) return;
    try {
      const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
      const supplierDetail = basicForm.supplierPoDetails[supplierName] || {};
      
      const currentPoDetails = order.supplierPoDetails || {};
      const updatedPoDetails = {
        ...currentPoDetails,
        [supplierName]: {
          requestDate: supplierDetail.requestDate ?? '',
          deliveryPlace: supplierDetail.deliveryPlace ?? '',
          specialRemarks: supplierDetail.specialRemarks ?? '',
          generalNotes: supplierDetail.generalNotes !== undefined ? supplierDetail.generalNotes : (poPresets.generalNotes[0] || '')
        }
      };

      await setDoc(orderRef, {
        supplierPoDetails: updatedPoDetails,
        updatedAt: serverTimestamp()
      }, { merge: true });

      alert(`✅ [${supplierName}]의 발주 조건이 클라우드에 성공적으로 저장되었습니다.`);
    } catch (err: any) {
      alert('❌ 발주조건 저장 실패: ' + err.message);
    }
  };

  const handleDeleteSupplierCertFile = async (supplierName: string, idx: number) => {
    if (!order) return;
    if (!window.confirm('이 파일을 삭제하시겠습니까?')) return;
    try {
      const currentFiles = basicForm.supplierPurchaseCertFiles[supplierName] || [];
      const target = currentFiles[idx];
      if (target && target.path) {
        const fileRef = ref(storage, target.path);
        await deleteObject(fileRef).catch(e => console.warn("Failed to delete cert from storage:", e));
      }
      
      const updated = currentFiles.filter((_, i) => i !== idx);
      const updatedCertFiles = {
        ...basicForm.supplierPurchaseCertFiles,
        [supplierName]: updated
      };

      setBasicForm(prev => {
        return {
          ...prev,
          supplierPurchaseCertFiles: updatedCertFiles
        };
      });

      // Save to Firebase immediately
      const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
      await setDoc(orderRef, {
        supplierPurchaseCertFiles: updatedCertFiles,
        updatedAt: serverTimestamp()
      }, { merge: true });

      alert('✅ 구매확인서 파일이 삭제되었습니다.');
    } catch (err: any) {
      alert('❌ 파일 삭제 실패: ' + err.message);
    }
  };

  // Delete document attachment from Storage & Firestore for specific fields
  const handleDeleteDoc = async (fieldName: 'poFiles' | 'lcFiles' | 'scFiles' | 'ciFiles' | 'plFiles' | 'cooFiles' | 'blFiles' | 'exportDeclarationFiles' | 'coaFiles' | 'otherFiles' | 'containerWorkFiles' | 'transportationFiles' | 'transactionFiles', idx: number) => {
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
    fieldName: 'poFiles' | 'lcFiles' | 'scFiles' | 'ciFiles' | 'plFiles' | 'cooFiles' | 'blFiles' | 'exportDeclarationFiles' | 'coaFiles' | 'otherFiles' | 'containerWorkFiles' | 'transportationFiles' | 'transactionFiles',
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
            onPaste={async e => {
              const clipboardItems = e.clipboardData.items;
              for (let i = 0; i < clipboardItems.length; i++) {
                if (clipboardItems[i].type.indexOf('image') !== -1) {
                  const file = clipboardItems[i].getAsFile();
                  if (file) {
                    e.preventDefault();
                    // Generate a file name with custom timestamp to identify pasted screenshots
                    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                    const timeStr = new Date().toTimeString().split(' ')[0].replace(/:/g, '');
                    const renamedFile = new File(
                      [file],
                      `screenshot_${dateStr}_${timeStr}.png`,
                      { type: file.type }
                    );
                    const fakeEvent = { target: { files: [renamedFile] } } as any;
                    handleDocUpload(fakeEvent, fieldName);
                  }
                }
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
                <span 
                  onClick={() => previewFile(file.url, file.name)}
                  style={{ fontSize: '12px', color: '#2563eb', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px', cursor: 'pointer', textDecoration: 'underline' }} 
                  title="클릭하여 미리보기"
                >
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
  const handlePrintSupplierPo = async (supplierName: string, items: OrderItem[]) => {
    if (!order) return;
    const taxType = basicForm.supplierTaxTypes[supplierName] || '과세';
    const cleanSupplierName = supplierName.replace(/\s+/g, '');
    const supplierCode = cleanSupplierName.substring(0, 3).toUpperCase();
    const poNum = `${getFormattedPoId(order.id, order.issuingCompany)}-${supplierCode}`;

    const logoVersion = Date.now();
    const isYS = order.issuingCompany === 'YS';
    let bizNo = isYS ? '730-17-00185' : '217-87-00384';
    let compName = isYS ? '영성에이씨씨(영성ACC)' : '(주)와이에스에이씨씨';
    let address = isYS ? '충북 청주시 흥덕구 월명로 76, 111-201호' : '충북 청주시 흥덕구 가로수로 1251, 201-1호';
    let compPresident = '김 주 한'; // Default fallback

    try {
      const compDoc = await getDoc(doc(db, "companies", "YSACC", "my_companies", isYS ? "YS" : "YSACC"));
      if (compDoc.exists()) {
        const data = compDoc.data();
        if (data.bizNo) bizNo = data.bizNo;
        if (data.nameKo) compName = data.nameKo;
        else if (data.name) compName = data.name;
        if (data.addressKo) address = data.addressKo;
        if (data.manager) compPresident = data.manager;
      }
    } catch (e) {
      console.error("Failed to load company info for PO", e);
    }

    const poDetails = basicForm.supplierPoDetails?.[supplierName] || {};
    const reqDateText = poDetails.requestDate || '추후 안내 예정';
    const delPlaceText = poDetails.deliveryPlace || '추후 통보예정';



    let generalNotesHtml = '';
    if (poDetails.generalNotes) {
      generalNotesHtml = poDetails.generalNotes.replace(/\n/g, '<br/>');
    } else if (poPresets.generalNotes && poPresets.generalNotes[0]) {
      generalNotesHtml = poPresets.generalNotes[0].replace(/\n/g, '<br/>');
    } else {
      generalNotesHtml = `1. 부가가치세(VAT): 일반 전자세금계산서 발행 기준<br/>
2. 결제조건: ${order.paymentTerms || '현금 선입금 후 출고 조건 결제'}`;
    }

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
                  <td style="font-weight: bold; letter-spacing: 1px;">${bizNo}</td>
                </tr>
                <tr>
                  <th>상  호</th>
                  <td style="position: relative; padding: 0;">
                    <div class="supplier-seal-container">
                      <img src="/logo.png?v=${logoVersion}" class="seal-bg" />
                      <img src="${isYS ? '/YS_ACC_STAMP.jpg' : '/YSACC_STAMP.png'}?v=${logoVersion}" class="seal-stamp" />
                      <div style="width: 100%; display: flex; justify-content: space-between; padding: 0 10px; z-index: 3; position: relative;">
                        <span>${compName}</span>
                        <span style="font-weight: normal; margin-right: 50px;">${compPresident}</span>
                      </div>
                    </div>
                  </td>
                </tr>
                <tr>
                  <th>사업장</th>
                  <td style="font-size: 10px; text-align: left; padding-left: 8px;">${address}</td>
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
            <div><strong>입고요청일 :</strong> ${reqDateText}</div>
            <div><strong>납품처(주소, 담당자, 연락처) :</strong> ${delPlaceText}</div>
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
                const { purchasePrice, purchaseCurrency, itemCode, itemName } = getSupplierPurchaseInfo(it);
                const isKrw = purchaseCurrency === 'KRW';
                const currencySymbol = isKrw ? '₩' : '$';
                const rawAmt = purchasePrice * (it.qty || 0);
                const vatAmt = taxType === '영세' ? 0 : (isKrw ? Math.round(rawAmt * 0.1) : parseFloat((rawAmt * 0.1).toFixed(2)));
                return `
                  <tr>
                    <td class="center">${itemCode}</td>
                    <td><strong>${itemName}</strong></td>
                    <td class="center">${it.grade || '-'}</td>
                    <td class="right">${(it.qty || 0).toLocaleString()}</td>
                    <td class="right">${currencySymbol}${purchasePrice.toLocaleString(undefined, isKrw ? {} : { minimumFractionDigits: 2 })}</td>
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
                    const usdSub = items.filter(it => getSupplierPurchaseInfo(it).purchaseCurrency !== 'KRW').reduce((sum, it) => sum + getSupplierPurchaseInfo(it).purchasePrice * (it.qty || 0), 0);
                    const krwSub = items.filter(it => getSupplierPurchaseInfo(it).purchaseCurrency === 'KRW').reduce((sum, it) => sum + getSupplierPurchaseInfo(it).purchasePrice * (it.qty || 0), 0);
                    const parts = [];
                    if (usdSub > 0) parts.push(`$${usdSub.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
                    if (krwSub > 0) parts.push(`₩${krwSub.toLocaleString()}`);
                    return parts.join(' / ');
                  })()}
                </td>
                <td class="right">
                  ${(() => {
                    const usdTotal = items.filter(it => getSupplierPurchaseInfo(it).purchaseCurrency !== 'KRW').reduce((sum, it) => sum + getSupplierPurchaseInfo(it).purchasePrice * (it.qty || 0), 0);
                    const krwTotal = items.filter(it => getSupplierPurchaseInfo(it).purchaseCurrency === 'KRW').reduce((sum, it) => sum + getSupplierPurchaseInfo(it).purchasePrice * (it.qty || 0), 0);
                    const usdVat = taxType === '영세' ? 0 : parseFloat((usdTotal * 0.1).toFixed(2));
                    const krwVat = taxType === '영세' ? 0 : Math.round(krwTotal * 0.1);
                    const parts = [];
                    if (usdTotal > 0) parts.push(`$${usdVat.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
                    if (krwTotal > 0) parts.push(`₩${krwVat.toLocaleString()}`);
                    return parts.join(' / ');
                  })()}
                </td>
                <td class="right" style="color: #dc2626;">
                  ${(() => {
                    const usdTotal = items.filter(it => getSupplierPurchaseInfo(it).purchaseCurrency !== 'KRW').reduce((sum, it) => sum + getSupplierPurchaseInfo(it).purchasePrice * (it.qty || 0), 0);
                    const krwTotal = items.filter(it => getSupplierPurchaseInfo(it).purchaseCurrency === 'KRW').reduce((sum, it) => sum + getSupplierPurchaseInfo(it).purchasePrice * (it.qty || 0), 0);
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



          <div class="bottom-grid">
            <div class="bottom-box">
              <div class="bottom-box-title">※ 일반사항</div>
              <div style="font-size: 10px; color: #334155; line-height: 1.4;">
                ${generalNotesHtml}
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

  const issueAndSavePO = async (supplierName: string, items: OrderItem[]) => {

    if (!order) return;
    try {
      const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
      const supplierDetail = basicForm.supplierPoDetails[supplierName] || {};
      const currentPoDetails = order.supplierPoDetails || {};
      const updatedPoDetails = {
        ...currentPoDetails,
        [supplierName]: {
          requestDate: supplierDetail.requestDate ?? '',
          deliveryPlace: supplierDetail.deliveryPlace ?? '',
          specialRemarks: supplierDetail.specialRemarks ?? '',
          generalNotes: supplierDetail.generalNotes ?? ''
        }
      };
      await setDoc(orderRef, {
        supplierPoDetails: updatedPoDetails,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.warn("Failed to auto-save supplier PO details on issue:", e);
    }
    const taxType = basicForm.supplierTaxTypes[supplierName] || '과세';
    const cleanSupplierName = supplierName.replace(/\s+/g, '');
    const supplierCode = cleanSupplierName.substring(0, 3).toUpperCase();
    const poNum = `${getFormattedPoId(order.id, order.issuingCompany)}-${supplierCode}`;

    const logoVersion = Date.now();
    const isYS = order.issuingCompany === 'YS';
    let bizNo = isYS ? '730-17-00185' : '217-87-00384';
    let compName = isYS ? '영성에이씨씨(영성ACC)' : '(주)와이에스에이씨씨';
    let address = isYS ? '충북 청주시 흥덕구 월명로 76, 111-201호' : '충북 청주시 흥덕구 가로수로 1251, 201-1호';
    let compPresident = '김 주 한'; // Default fallback

    try {
      const compDoc = await getDoc(doc(db, "companies", "YSACC", "my_companies", isYS ? "YS" : "YSACC"));
      if (compDoc.exists()) {
        const data = compDoc.data();
        if (data.bizNo) bizNo = data.bizNo;
        if (data.nameKo) compName = data.nameKo;
        else if (data.name) compName = data.name;
        if (data.addressKo) address = data.addressKo;
        if (data.manager) compPresident = data.manager;
      }
    } catch (e) {
      console.error("Failed to load company info for PO", e);
    }

    const poDetails = basicForm.supplierPoDetails?.[supplierName] || {};
    const reqDateText = poDetails.requestDate || '추후 안내 예정';
    const delPlaceText = poDetails.deliveryPlace || '추후 통보예정';



    let generalNotesHtml = '';
    if (poDetails.generalNotes) {
      generalNotesHtml = poDetails.generalNotes.replace(/\n/g, '<br/>');
    } else if (poPresets.generalNotes && poPresets.generalNotes[0]) {
      generalNotesHtml = poPresets.generalNotes[0].replace(/\n/g, '<br/>');
    } else {
      generalNotesHtml = `1. 부가가치세(VAT): 일반 전자세금계산서 발행 기준<br/>
2. 결제조건: ${order.paymentTerms || '현금 선입금 후 출고 조건 결제'}`;
    }

    const printHtml = `
      <html>
        <head>
          <title>발주서 - ${poNum}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&display=swap');
            * { box-sizing: border-box; }
            body { font-family: 'Noto Sans KR', sans-serif; padding: 20px; color: #000; font-size: 12px; line-height: 1.4; width: 100%; max-width: 800px; margin: 0 auto; }
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
                  <td style="font-weight: bold; letter-spacing: 1px;">${bizNo}</td>
                </tr>
                <tr>
                  <th>상  호</th>
                  <td style="position: relative; padding: 0;">
                    <div class="supplier-seal-container">
                      <img src="/logo.png?v=${logoVersion}" class="seal-bg" />
                      <img src="${isYS ? '/YS_ACC_STAMP.jpg' : '/YSACC_STAMP.png'}?v=${logoVersion}" class="seal-stamp" />
                      <div style="width: 100%; display: flex; justify-content: space-between; padding: 0 10px; z-index: 3; position: relative;">
                        <span>${compName}</span>
                        <span style="font-weight: normal; margin-right: 50px;">${compPresident}</span>
                      </div>
                    </div>
                  </td>
                </tr>
                <tr>
                  <th>사업장</th>
                  <td style="font-size: 10px; text-align: left; padding-left: 8px;">${address}</td>
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
            <div><strong>입고요청일 :</strong> ${reqDateText}</div>
            <div><strong>납품처(주소, 담당자, 연락처) :</strong> ${delPlaceText}</div>
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
                const { purchasePrice, purchaseCurrency, itemCode, itemName } = getSupplierPurchaseInfo(it);
                const isKrw = purchaseCurrency === 'KRW';
                const currencySymbol = isKrw ? '₩' : '$';
                const rawAmt = purchasePrice * (it.qty || 0);
                const vatAmt = taxType === '영세' ? 0 : (isKrw ? Math.round(rawAmt * 0.1) : parseFloat((rawAmt * 0.1).toFixed(2)));
                return `
                  <tr>
                    <td class="center">${itemCode}</td>
                    <td><strong>${itemName}</strong></td>
                    <td class="center">${it.grade || '-'}</td>
                    <td class="right">${(it.qty || 0).toLocaleString()}</td>
                    <td class="right">${currencySymbol}${purchasePrice.toLocaleString(undefined, isKrw ? {} : { minimumFractionDigits: 2 })}</td>
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
                    const usdSub = items.filter(it => getSupplierPurchaseInfo(it).purchaseCurrency !== 'KRW').reduce((sum, it) => sum + getSupplierPurchaseInfo(it).purchasePrice * (it.qty || 0), 0);
                    const krwSub = items.filter(it => getSupplierPurchaseInfo(it).purchaseCurrency === 'KRW').reduce((sum, it) => sum + getSupplierPurchaseInfo(it).purchasePrice * (it.qty || 0), 0);
                    const parts = [];
                    if (usdSub > 0) parts.push(`$${usdSub.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
                    if (krwSub > 0) parts.push(`₩${krwSub.toLocaleString()}`);
                    return parts.join(' / ');
                  })()}
                </td>
                <td class="right">
                  ${(() => {
                    const usdTotal = items.filter(it => getSupplierPurchaseInfo(it).purchaseCurrency !== 'KRW').reduce((sum, it) => sum + getSupplierPurchaseInfo(it).purchasePrice * (it.qty || 0), 0);
                    const krwTotal = items.filter(it => getSupplierPurchaseInfo(it).purchaseCurrency === 'KRW').reduce((sum, it) => sum + getSupplierPurchaseInfo(it).purchasePrice * (it.qty || 0), 0);
                    const usdVat = taxType === '영세' ? 0 : parseFloat((usdTotal * 0.1).toFixed(2));
                    const krwVat = taxType === '영세' ? 0 : Math.round(krwTotal * 0.1);
                    const parts = [];
                    if (usdTotal > 0) parts.push(`$${usdVat.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
                    if (krwTotal > 0) parts.push(`₩${krwVat.toLocaleString()}`);
                    return parts.join(' / ');
                  })()}
                </td>
                <td class="right" style="color: #dc2626;">
                  ${(() => {
                    const usdTotal = items.filter(it => getSupplierPurchaseInfo(it).purchaseCurrency !== 'KRW').reduce((sum, it) => sum + getSupplierPurchaseInfo(it).purchasePrice * (it.qty || 0), 0);
                    const krwTotal = items.filter(it => getSupplierPurchaseInfo(it).purchaseCurrency === 'KRW').reduce((sum, it) => sum + getSupplierPurchaseInfo(it).purchasePrice * (it.qty || 0), 0);
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



          <div class="bottom-grid">
            <div class="bottom-box">
              <div class="bottom-box-title">※ 일반사항</div>
              <div style="font-size: 10px; color: #334155; line-height: 1.4;">
                ${generalNotesHtml}
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

    const totalAmount = items.reduce((sum, it) => {
      const price = (it as any).purchaseUnitPrice !== undefined ? (it as any).purchaseUnitPrice : it.unitPrice;
      return sum + (price || 0) * (it.qty || 0);
    }, 0);

    const confirmed = window.confirm(`발주서를 발행하시겠습니까?\n\nPO번호: ${poNum}\n거래처: ${supplierName}\n⚠️ 발행 후 금액/수량 수정 시 재발행이 필요합니다.`);
    if (!confirmed) return;

    try {
      // Sandbox-isolated PDF generation using a temporary hidden iframe
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.top = '0';
      iframe.style.left = '0';
      iframe.style.width = '820px'; // fixed wide A4 content wrapper
      iframe.style.height = '1200px';
      iframe.style.border = '0';
      iframe.style.zIndex = '-9999';
      iframe.style.visibility = 'hidden';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument;
      if (!iframeDoc) throw new Error('Failed to access sandbox iframe context');

      iframeDoc.open();
      iframeDoc.write(printHtml);
      iframeDoc.close();

      // Wait for fonts & images to render inside the iframe
      await new Promise(resolve => setTimeout(resolve, 800));

      const printBody = iframeDoc.body;
      // Remove any no-print buttons from the iframe DOM so they are not captured in the PDF image
      const noPrintElements = printBody.querySelectorAll('.no-print');
      noPrintElements.forEach(el => el.remove());

      const canvas = await html2canvas(printBody, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        width: 800,
        height: printBody.scrollHeight,
        windowWidth: 800,
        windowHeight: printBody.scrollHeight
      });

      document.body.removeChild(iframe);

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'pt',
        format: 'a4'
      });

      const imgWidth = 595.28;
      const pageHeight = 841.89;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      let pageCount = 1;
      while (heightLeft >= 100) { // Only create a new page if the overflow content height is substantial (>= 100pt)
        position = - (pageHeight * pageCount);
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
        pageCount++;
      }

      const pdfBlob = pdf.output('blob');

      const currentIssuedDocs = (order as any)?.po_issued_documents || [];
      const version = currentIssuedDocs.filter((d: any) => d.po_number === poNum).length + 1;
      const safeFileName = `${poNum.replace(/[^a-zA-Z0-9가-힣_-]/g, '_')}_v${version}.pdf`;
      const storageRef = ref(storage, `companies/${COMPANY_ID}/orders/${order?.id}/po_issued_docs/${safeFileName}`);
      
      const snapshot = await uploadBytesResumable(storageRef, pdfBlob, { contentType: 'application/pdf' });
      const downloadURL = await getDownloadURL(snapshot.ref);

      const newDoc = {
        id: new Date().getTime().toString(),
        po_number: poNum,
        supplier_name: supplierName,
        version: version,
        fileName: safeFileName,
        fileUrl: downloadURL,
        issuedAt: new Date().toISOString(),
        issuedBy: auth.currentUser?.displayName || 'System',
        totalAmount: totalAmount,
        status: 'active'
      };

      const updatedDocs = currentIssuedDocs.map((doc: any) => {
        if (doc.po_number === poNum) {
          return { ...doc, status: 'superseded' };
        }
        return doc;
      });
      updatedDocs.push(newDoc);

      const currentLogs = (order as any).history_logs || [];
      const newLog = {
        timestamp: new Date().toISOString(),
        actionType: 'po_issue',
        user: auth.currentUser?.displayName || auth.currentUser?.email || 'System',
        description: `공급업체 "${supplierName}" 발주서 발행완료 (버전 v${version}, 파일명: ${safeFileName})`
      };
      const nextHistoryLogs = [newLog, ...currentLogs];

      const docRef = doc(db, 'companies', COMPANY_ID, 'orders', order?.id!);
      await updateDoc(docRef, {
        po_issued_documents: updatedDocs,
        po_issue_status: 'issued',
        history_logs: nextHistoryLogs
      });

      alert('✅ 발주서가 성공적으로 발행 및 클라우드에 저장되었습니다.');
      setIssuedDocs(updatedDocs);
      
    } catch (e) {
      console.error(e);
      alert('발행 중 오류가 발생했습니다.');
    }
  };

  const handleDeletePoIssuedDoc = async (docId: string, fileName: string) => {
    if (!order) return;
    const confirmed = window.confirm(`발행된 발주서를 삭제하시겠습니까?\n\n파일명: ${fileName}\n⚠️ 삭제 시 복구할 수 없으며, 목록에서 제거됩니다.`);
    if (!confirmed) return;

    try {
      // 1. Delete from Firebase Storage
      const storageRef = ref(storage, `companies/${COMPANY_ID}/orders/${order?.id}/po_issued_docs/${fileName}`);
      try {
        await deleteObject(storageRef);
      } catch (err) {
        console.warn("Storage deletion failed or file already missing:", err);
      }

      // 2. Remove from Firestore list
      const currentIssuedDocs = (order as any)?.po_issued_documents || [];
      const updatedDocs = currentIssuedDocs.filter((d: any) => d.id !== docId);

      // Restore superseded status if a previous active version exists for that PO number
      const poNumbers = Array.from(new Set(updatedDocs.map((d: any) => d.po_number)));
      poNumbers.forEach(poNo => {
        const docsForPo = updatedDocs.filter((d: any) => d.po_number === poNo);
        if (docsForPo.length > 0) {
          // Sort descending by version
          docsForPo.sort((a: any, b: any) => b.version - a.version);
          // Set the latest one to 'active', others to 'superseded'
          docsForPo.forEach((d: any, idx: number) => {
            d.status = idx === 0 ? 'active' : 'superseded';
          });
        }
      });

      const currentLogs = (order as any).history_logs || [];
      const newLog = {
        timestamp: new Date().toISOString(),
        actionType: 'po_delete',
        user: auth.currentUser?.displayName || auth.currentUser?.email || 'System',
        description: `발주서 삭제/취소 완료 (파일명: ${fileName})`
      };
      const nextHistoryLogs = [newLog, ...currentLogs];

      const hasActiveDocs = updatedDocs.some((d: any) => d.status === 'active');
      const docRef = doc(db, 'companies', COMPANY_ID, 'orders', order?.id!);
      await updateDoc(docRef, {
        po_issued_documents: updatedDocs,
        po_issue_status: hasActiveDocs ? 'issued' : 'not_issued',
        history_logs: nextHistoryLogs
      });

      alert('✅ 발주서가 성공적으로 삭제되었습니다.');
      setIssuedDocs(updatedDocs);
    } catch (e) {
      console.error(e);
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  const handleEmailSupplierPo = (supplierName: string, items: OrderItem[]) => {
    if (!order) return;
    const cleanSupplierName = supplierName.replace(/\s+/g, '');
    const supplierCode = cleanSupplierName.substring(0, 3).toUpperCase();
    const poNum = `${getFormattedPoId(order.id, order.issuingCompany)}-${supplierCode}`;

    const targetSupplier = suppliersList.find(s => s.name === supplierName);
    const defaultEmail = targetSupplier?.purchaseEmail || '';

    const email = prompt("발송할 공급업체 이메일 주소를 확인해주세요 (기본값: 거래처 등록 이메일):", defaultEmail);
    if (email === null) return; // User cancelled

    const subject = encodeURIComponent(`[발주서] PO No: ${poNum} (${order.issuingCompany === 'YS' ? 'YS ACC' : 'YSACC CO., LTD.'})`);
    
    const itemsText = items.map(it => {
      const price = it.purchaseUnitPrice != null ? it.purchaseUnitPrice : it.unitPrice;
      const currencySymbol = it.currency === 'KRW' ? '₩' : '$';
      const spec = it.grade ? ` / 규격: ${it.grade}` : '';
      return `- 품명: ${it.name}${spec} / 수량: ${it.qty?.toLocaleString()} ${it.unit} / 단가: ${currencySymbol}${price.toLocaleString()}`;
    }).join('\n');

    const latestDoc = issuedDocs.find(d => d.status === 'active' && (d.supplier_name === supplierName || d.po_number.includes(supplierCode)));
    
    let pdfLinkStr = '';
    if (latestDoc) {
      pdfLinkStr = `\n[발주서 PDF 다운로드 링크]\n${latestDoc.fileUrl}\n\n`;
    }

    const body = encodeURIComponent(
      `안녕하세요,\n\n` +
      `${supplierName} 담당자님 귀하,\n\n` +
      `아래와 같이 발주서를 전달해 드립니다.\n\n` +
      `- 발주번호: ${poNum}\n` +
      `- 발주일자: ${new Date().toISOString().split('T')[0]}\n\n` +
      `[발주 내역]\n` +
      `${itemsText}\n\n` +
      pdfLinkStr +
      `자세한 내용은 본 이메일 혹은 시스템에 접속하여 첨부된 발주서(PDF)를 참조해 주시기 바랍니다.\n` +
      `감사합니다.\n` +
      `\n` +
      `${order.issuingCompany === 'YS' ? '영성에이씨씨' : '(주)와이에스에이씨씨'} 대표이사 김주한`
    );

    if (latestDoc) {
      alert("이메일 작성 창이 열립니다. 이메일 내용에 발주서 다운로드 링크가 포함되어 있습니다.");
    } else {
      alert("보안 정책상 브라우저에서 이메일에 파일을 자동으로 첨부할 수 없습니다.\n\n확인을 누르시면 발주서 인쇄 창과 이메일 작성 창이 함께 열립니다.\n발주서를 'PDF로 저장' 하신 후 이메일에 첨부해 주시기 바랍니다.");
    }

    setTimeout(() => {
      window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
    }, 500);

    if (!latestDoc) {
      handlePrintSupplierPo(supplierName, items);
    }
  };

  // CI automated print handler
  const handlePrintCI = () => {
    if (!order) return;
    (window as any).handlePrintCI = handlePrintCI;
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
              <strong>${(() => {
                const comp = myCompanies.find(c => c.id === (order.issuingCompany || 'YSACC'));
                return comp ? (comp.nameEn || comp.nameKo) : (isYS ? 'YS ACC' : 'YSACC CO., LTD.');
              })()}</strong><br/>
              ${(() => {
                const comp = myCompanies.find(c => c.id === (order.issuingCompany || 'YSACC'));
                return comp ? (comp.addressEn || comp.addressKo).replace(/\n/g, '<br/>') : (isYS ? '경기 김포시 양촌읍 듬박로 89' : '서울 강남구 테헤란로 419, 16층');
              })()}<br/>
              TEL: ${(() => {
                const comp = myCompanies.find(c => c.id === (order.issuingCompany || 'YSACC'));
                return comp ? comp.phone : '010-4494-1028';
              })()}
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
            ${(() => {
              const comp = myCompanies.find(c => c.id === (order.issuingCompany || 'YSACC'));
              return comp ? (comp.nameEn || comp.nameKo) : (isYS ? 'YS ACC' : 'YSACC CO., LTD.');
            })()}<br/><br/><br/>
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

    if (basicForm.packingList) {
      // ── Custom Packing List Print Mode ─────────────────────────────────
      const pl = basicForm.packingList;
      const shipper = pl.shipper || '';
      const applicant = pl.applicant || '';
      const notifyParty = pl.notifyParty || '';
      const pol = pl.pol || '';
      const pod = pl.pod || '';
      const vesselName = pl.vesselName || '';
      const sailingDate = pl.sailingDate || '';
      const deliveryTerms = pl.deliveryTerms || '';
      const paymentTerms = pl.paymentTerms || '';
      const remarks = pl.remarks || '';
      const invoiceNo = pl.invoiceNo || '';
      const invoiceDate = pl.invoiceDate || '';
      const lcNo = pl.lcNo || '';
      const lcDate = pl.lcDate || '';
      const lcIssuingBank = pl.lcIssuingBank || '';
      const containers = pl.containers || [];

      // Calculate grand totals
      let grandPkg = 0;
      let grandQty = 0;
      let grandNW = 0;
      let grandGW = 0;
      let grandCBM = 0;

      containers.forEach((c: any) => {
        (c.items || []).forEach((it: any) => {
          grandPkg += Number(it.pkg) || 0;
          grandQty += Number(it.qty) || 0;
          grandNW += Number(it.netWeight) || 0;
          grandGW += Number(it.grossWeight) || 0;
          grandCBM += Number(it.cbm) || 0;
        });
      });

      const printHtml = `
        <html>
          <head>
            <title>PACKING LIST - ${invoiceNo}</title>
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
              body { font-family: 'Inter', sans-serif; padding: 20px; color: #000; font-size: 10px; line-height: 1.35; }
              .no-print { display: block; position: fixed; top: 15px; right: 15px; padding: 8px 16px; background: #be123c; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 12px; z-index: 9999; box-shadow: 0 2px 5px rgba(0,0,0,0.15); }
              @media print {
                .no-print { display: none !important; }
                body { padding: 0; }
              }
              .header-title { text-align: center; font-size: 26px; font-weight: 800; text-transform: uppercase; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 6px; letter-spacing: 0.05em; }
              .desc-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 9.5px; }
              .desc-table th, .desc-table td { border: 1.5px solid #000; padding: 6px 5px; vertical-align: middle; }
              .desc-table th { background: #fafafa; font-weight: 800; text-align: center; }
              .desc-table td.right { text-align: right; }
              .desc-table td.center { text-align: center; }
              .signature-area { margin-top: 40px; text-align: right; font-size: 11px; font-weight: bold; }
              pre { margin: 0; font-family: inherit; font-size: 9.5px; white-space: pre-wrap; }
            </style>
          </head>
          <body>
            <button class="no-print" onclick="window.print()">인쇄 / PDF 저장</button>
            <div class="header-title">Packing List</div>
            
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 10px;">
              <tr>
                <td style="width: 50%; border: 1.5px solid #000; padding: 6px; vertical-align: top;">
                  <strong style="text-transform: uppercase; font-size: 8.5px; color: #475569;">Shipper / Beneficiary</strong><br/>
                  <pre>${shipper}</pre>
                </td>
                <td style="width: 50%; border: 1.5px solid #000; padding: 6px; vertical-align: top;">
                  <strong style="font-size: 8.5px; color: #475569;">Packing list No. & Date</strong><br/>
                  <div style="display: flex; justify-content: space-between; margin-top: 4px; font-weight: 700;">
                    <span>${invoiceNo}</span>
                    <span>${invoiceDate}</span>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="border: 1.5px solid #000; padding: 6px; vertical-align: top;">
                  <strong style="text-transform: uppercase; font-size: 8.5px; color: #475569;">Applicant</strong><br/>
                  <pre>${applicant}</pre>
                </td>
                <td style="border: 1.5px solid #000; padding: 6px; vertical-align: top;">
                  <strong style="font-size: 8.5px; color: #475569;">L/C No. & Date</strong><br/>
                  <div style="display: flex; justify-content: space-between; margin-top: 4px; font-weight: 700;">
                    <span>${lcNo}</span>
                    <span>${lcDate || '-'}</span>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="border: 1.5px solid #000; padding: 6px; vertical-align: top;">
                  <strong style="text-transform: uppercase; font-size: 8.5px; color: #475569;">Notify Party</strong><br/>
                  <pre>${notifyParty}</pre>
                </td>
                <td style="border: 1.5px solid #000; padding: 6px; vertical-align: top;">
                  <strong style="font-size: 8.5px; color: #475569;">L/C Issuing Bank</strong><br/>
                  <pre>${lcIssuingBank}</pre>
                </td>
              </tr>
              <tr>
                <td style="border: 1.5px solid #000; padding: 6px; vertical-align: top;">
                  <div style="display: flex;">
                    <div style="flex: 1; border-right: 1.5px solid #000; padding-right: 4px;">
                      <strong style="font-size: 8.5px; color: #475569;">Port of Loading</strong><br/>
                      <strong>${pol}</strong>
                    </div>
                    <div style="flex: 1; padding-left: 6px;">
                      <strong style="font-size: 8.5px; color: #475569;">Port of Discharge</strong><br/>
                      <strong>${pod}</strong>
                    </div>
                  </div>
                </td>
                <td rowspan="3" style="border: 1.5px solid #000; padding: 6px; vertical-align: top;">
                  <strong style="font-size: 8.5px; color: #475569;">Remarks</strong><br/>
                  <pre>${remarks}</pre>
                </td>
              </tr>
              <tr>
                <td style="border: 1.5px solid #000; padding: 6px; vertical-align: top;">
                  <div style="display: flex;">
                    <div style="flex: 1.2; border-right: 1.5px solid #000; padding-right: 4px;">
                      <strong style="font-size: 8.5px; color: #475569;">Vessel Name & Voyage No.</strong><br/>
                      <strong>${vesselName}</strong>
                    </div>
                    <div style="flex: 0.8; padding-left: 6px;">
                      <strong style="font-size: 8.5px; color: #475569;">Sailing on or about</strong><br/>
                      <strong>${sailingDate}</strong>
                    </div>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="border: 1.5px solid #000; padding: 6px; vertical-align: top;">
                  <div style="display: flex;">
                    <div style="flex: 1; border-right: 1.5px solid #000; padding-right: 4px;">
                      <strong style="font-size: 8.5px; color: #475569;">Payment Terms</strong><br/>
                      <strong>${paymentTerms}</strong>
                    </div>
                    <div style="flex: 1; padding-left: 6px;">
                      <strong style="font-size: 8.5px; color: #475569;">Delivery Terms</strong><br/>
                      <strong>${deliveryTerms}</strong>
                    </div>
                  </div>
                </td>
              </tr>
            </table>

            <table class="desc-table">
              <thead>
                <tr>
                  <th style="width: 15%;">Shipping Marks</th>
                  <th>Description of Goods</th>
                  <th style="width: 8%;">QTY</th>
                  <th style="width: 8%;">PKG No.</th>
                  <th style="width: 8%;">PKG</th>
                  <th style="width: 12%;">Net Weight<br/>(Kg)</th>
                  <th style="width: 12%;">Gross Weight<br/>(Kg)</th>
                  <th style="width: 12%;">Measurement<br/>(CBM)</th>
                </tr>
              </thead>
              <tbody>
                ${containers.map((c: any) => {
                  const itList = c.items || [];
                  const subTotalPkg = itList.reduce((s: number, i: any) => s + (Number(i.pkg) || 0), 0);
                  const subTotalQty = itList.reduce((s: number, i: any) => s + (Number(i.qty) || 0), 0);
                  const subTotalNW = itList.reduce((s: number, i: any) => s + (Number(i.netWeight) || 0), 0);
                  const subTotalGW = itList.reduce((s: number, i: any) => s + (Number(i.grossWeight) || 0), 0);
                  const subTotalCBM = itList.reduce((s: number, i: any) => s + (Number(i.cbm) || 0), 0);

                  return itList.map((it: any, itIdx: number) => `
                    <tr>
                      ${itIdx === 0 ? `
                        <td rowspan="${itList.length + 1}" style="font-size: 8.5px; font-weight: 700; vertical-align: top;">
                          <strong>CONTAINER NO:</strong><br/>${c.containerNo}<br/>
                          <strong>SEAL NO:</strong><br/>${c.sealNo}
                          ${(() => {
                            const uniquePkgNos = Array.from(new Set(itList.map((x: any) => x.pkgNo || '1')));
                            const shapeVal = (order as any).commonShippingMark?.shape || 'diamond';
                            const compVal = (order as any).commonShippingMark?.company || 'YSACC';
                            const portVal = (order as any).commonShippingMark?.port || order.portOfDischarge || '';
                            const countryVal = (order as any).commonShippingMark?.country || order.destinationCountry || '';
                            const originVal = (order as any).commonShippingMark?.origin || 'MADE IN KOREA';
                            
                            let shapeSymbol = '◯';
                            if (shapeVal === 'circle') shapeSymbol = '◯';
                            else if (shapeVal === 'square') shapeSymbol = '▢';
                            else if (shapeVal === 'triangle') shapeSymbol = '△';
                            else shapeSymbol = '◇';

                            return uniquePkgNos.map(pNo => {
                              const markStr = `${shapeSymbol}\n${compVal}\n${portVal}, ${countryVal}\nPALLET NO. : ${pNo} / ${grandPkg}\n${originVal}`;
                              return `<pre style="margin-top: 10px; border-top: 1px dashed #000; padding-top: 6px; font-family: monospace; font-size: 8px; line-height: 1.25; font-weight: bold;">${markStr}</pre>`;
                            }).join('');
                          })()}
                        </td>
                      ` : ''}
                      <td style="white-space: pre-wrap;">${it.description}</td>
                      <td class="right">${it.qty ? Number(it.qty).toLocaleString() : ''}</td>
                      <td class="center">${it.pkgNo || ''}</td>
                      <td class="center">${it.pkg || ''}</td>
                      <td class="right">${Number(it.netWeight || 0).toLocaleString()}</td>
                      <td class="right">${Number(it.grossWeight || 0).toLocaleString()}</td>
                      <td class="right">${Number(it.cbm || 0).toFixed(2)}</td>
                    </tr>
                  `).join('') + `
                    <tr style="font-weight: 800; background: #fafafa;">
                      <td>SUB TOTAL</td>
                      <td class="right">${subTotalQty.toLocaleString()}</td>
                      <td></td>
                      <td class="center">${subTotalPkg} PKG</td>
                      <td class="right">${subTotalNW.toLocaleString()} KGS</td>
                      <td class="right">${subTotalGW.toLocaleString()} KGS</td>
                      <td class="right">${subTotalCBM.toFixed(2)} CBM</td>
                    </tr>
                  `;
                }).join('')}
                <tr style="font-weight: 800; background: #f3f4f6; font-size: 10px;">
                  <td colspan="2">GRAND TOTAL</td>
                  <td class="right">${grandQty.toLocaleString()}</td>
                  <td></td>
                  <td class="center">${grandPkg} PKG</td>
                  <td class="right">${grandNW.toLocaleString()} KGS</td>
                  <td class="right">${grandGW.toLocaleString()} KGS</td>
                  <td class="right">${grandCBM.toFixed(2)} CBM</td>
                </tr>
              </tbody>
            </table>

            <div class="signature-area">
              Signed by<br/>
              <span style="font-size: 15px; color: #1e3a8a; letter-spacing: 0.1em; display: block; margin: 10px 0;">${(() => {
                const comp = myCompanies.find(c => c.id === (order.issuingCompany || 'YSACC'));
                return comp ? (comp.nameEn || comp.nameKo) : (isYS ? 'YS ACC' : 'YSACC CO., LTD.');
              })()}</span>
              _______________________________<br/>
              Managing Director JU HAN, KIM
            </div>
          </body>
        </html>
      `;

      const win = window.open('', '_blank');
      if (win) {
        win.document.write(printHtml);
        win.document.close();
      }
      return;
    }

    // ── Fallback to Default Auto Print Mode ──────────────────────────────
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
              <strong>${(() => {
                const comp = myCompanies.find(c => c.id === (order.issuingCompany || 'YSACC'));
                return comp ? (comp.nameEn || comp.nameKo) : (isYS ? 'YS ACC' : 'YSACC CO., LTD.');
              })()}</strong><br/>
              ${(() => {
                const comp = myCompanies.find(c => c.id === (order.issuingCompany || 'YSACC'));
                return comp ? (comp.addressEn || comp.addressKo).replace(/\n/g, '<br/>') : (isYS ? '경기 김포시 양촌읍 듬박로 89' : '서울 강남구 테헤란로 419, 16층');
              })()}<br/>
              TEL: ${(() => {
                const comp = myCompanies.find(c => c.id === (order.issuingCompany || 'YSACC'));
                return comp ? comp.phone : '010-4494-1028';
              })()}
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
            ${(() => {
              const comp = myCompanies.find(c => c.id === (order.issuingCompany || 'YSACC'));
              return comp ? (comp.nameEn || comp.nameKo) : (isYS ? 'YS ACC' : 'YSACC CO., LTD.');
            })()}<br/><br/><br/>
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
      // Prevent dirty check auto-save from running after deletion
      isDirtyRef.current = false;

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
        <button onClick={() => handleNavigation('/orders')} style={{ marginTop: '14px', padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>PO 목록으로 이동</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header Back Button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            onClick={() => handleNavigation('/orders')}
            style={{ background: '#fff', border: '1px solid #cbd5e1', color: '#475569', padding: '6px 14px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}
          >
            이전으로
          </button>
          <span style={{ fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>PO 상세 정보 - {getFormattedPoId(order.id, order.issuingCompany)}</span>
          <button 
            onClick={() => setShowPoDetails(prev => !prev)}
            style={{ 
              background: showPoDetails ? '#2563eb' : '#fff', 
              border: '1px solid #cbd5e1', 
              color: showPoDetails ? '#fff' : '#475569', 
              padding: '6px 12px', 
              borderRadius: '6px', 
              fontSize: '12.5px', 
              cursor: 'pointer', 
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.15s'
            }}
          >
            📋 {showPoDetails ? 'PO상세 접기' : 'PO상세보기'}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
      {showPoDetails && (
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
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#4b5563' }}>PI 번호</span>
              <input type="text" value={basicForm.piNumber} onChange={e => setBasicForm(prev => ({ ...prev, piNumber: e.target.value }))} disabled={!isEditing} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '11.5px', background: isEditing ? '#fff' : '#f8fafc', outline: 'none' }} placeholder="PI 번호 입력" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#4b5563' }}>고객정보</span>
              <input type="text" value={basicForm.customer} onChange={e => setBasicForm(prev => ({ ...prev, customer: e.target.value }))} disabled={!isEditing} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '11.5px', background: isEditing ? '#fff' : '#f8fafc', outline: 'none' }} placeholder="고객사명" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#4b5563' }}>도착지 (목적국가)</span>
              <input type="text" value={basicForm.destinationCountry} onChange={e => setBasicForm(prev => ({ ...prev, destinationCountry: e.target.value }))} disabled={!isEditing} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '11.5px', background: isEditing ? '#fff' : '#f8fafc', outline: 'none' }} placeholder="목적국가" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', gridColumn: 'span 3' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#4b5563' }}>주소 (Customer Address)</span>
              <input type="text" value={basicForm.customerAddress} onChange={e => setBasicForm(prev => ({ ...prev, customerAddress: e.target.value }))} disabled={!isEditing} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '11.5px', background: isEditing ? '#fff' : '#f8fafc', outline: 'none' }} placeholder="주소 입력" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#4b5563' }}>출발항</span>
              <input type="text" value={basicForm.portOfLoading} onChange={e => setBasicForm(prev => ({ ...prev, portOfLoading: e.target.value }))} disabled={!isEditing} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '11.5px', background: isEditing ? '#fff' : '#f8fafc', outline: 'none' }} placeholder="출발항" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#4b5563' }}>도착항</span>
              <input type="text" value={basicForm.portOfDischarge} onChange={e => setBasicForm(prev => ({ ...prev, portOfDischarge: e.target.value }))} disabled={!isEditing} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '11.5px', background: isEditing ? '#fff' : '#f8fafc', outline: 'none' }} placeholder="도착항" />
            </div>

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
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#4b5563' }}>담당 영업사원</span>
              <input type="text" value={basicForm.manager} onChange={e => setBasicForm(prev => ({ ...prev, manager: e.target.value }))} disabled={!isEditing} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '11.5px', background: isEditing ? '#fff' : '#f8fafc', outline: 'none' }} />
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#0f766e' }}>제품준비일 (최종 완료일)</span>
              <input
                type="date"
                value={basicForm.cargoReadyDate || ''}
                disabled={true}
                style={{ padding: '4px 6px', border: '1px solid #99f6e4', borderRadius: '5px', fontSize: '11.5px', background: '#f0fdfa', color: '#0f766e', fontWeight: 'bold', outline: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', gridColumn: 'span 3' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#4b5563' }}>비고 (Remarks)</span>
              <textarea rows={1} value={basicForm.remark} onChange={e => setBasicForm(prev => ({ ...prev, remark: e.target.value }))} disabled={!isEditing} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '11.5px', background: isEditing ? '#fff' : '#f8fafc', resize: 'vertical', outline: 'none' }} />
            </div>
          </div>
        </div>

        {/* Right: L/C details & PO/LC/Sales Contract 파일 첨부 관리 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* L/C Details Section */}
          {basicForm.isLc === 'Y' && (
            <div style={{ padding: '12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontWeight: 800, fontSize: '12px', color: '#1e40af', borderBottom: '1px solid #bfdbfe', paddingBottom: '4px', marginBottom: '4px' }}>💳 L/C 거래 상세 정보</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#1e40af' }}>L/C ISSUING BANK</span>
                  <input type="text" value={basicForm.lcIssuingBank} onChange={e => setBasicForm(prev => ({ ...prev, lcIssuingBank: e.target.value }))} disabled={!isEditing} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '11.5px', background: isEditing ? '#fff' : '#f8fafc', outline: 'none' }} placeholder="발행 은행" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#1e40af' }}>LC 번호</span>
                  <input type="text" value={basicForm.lcNo} onChange={e => setBasicForm(prev => ({ ...prev, lcNo: e.target.value }))} disabled={!isEditing} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '11.5px', background: isEditing ? '#fff' : '#f8fafc', outline: 'none' }} placeholder="LC 번호" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#1e40af' }}>LC ISSUING DATE</span>
                  <input type="date" value={basicForm.lcIssuingDate} onChange={e => setBasicForm(prev => ({ ...prev, lcIssuingDate: e.target.value }))} disabled={!isEditing} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '11.5px', background: isEditing ? '#fff' : '#f8fafc', outline: 'none' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', gridColumn: 'span 3' }}>
                  <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#1e40af' }}>DESCRIPTION</span>
                  <textarea rows={1} value={basicForm.lcDescription} onChange={e => setBasicForm(prev => ({ ...prev, lcDescription: e.target.value }))} disabled={!isEditing} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '11.5px', background: isEditing ? '#fff' : '#f8fafc', outline: 'none', resize: 'vertical' }} placeholder="물품 설명 / LC Description" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', gridColumn: 'span 3' }}>
                  <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#c2410c' }}>L/C 중요사항 기록 (Remark)</span>
                  <textarea rows={2} value={basicForm.lcRemark} onChange={e => setBasicForm(prev => ({ ...prev, lcRemark: e.target.value }))} disabled={!isEditing} style={{ padding: '4px 6px', border: '1.5px solid #f97316', borderRadius: '5px', fontSize: '11.5px', background: isEditing ? '#fff' : '#f8fafc', outline: 'none', resize: 'vertical' }} placeholder="L/C 관련 중요사항 기록" />
                </div>
              </div>
            </div>
          )}

          {/* Right Attachment Box */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#1f2937', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>📂 거래 서류 첨부 (PO / L/C / Sales Contract)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', flex: 1 }}>
              {renderFileField("PO (Purchase Order)", "poFiles", "po-file-uploader")}
              {renderFileField("L/C (Letter of Credit)", "lcFiles", "lc-file-uploader")}
              {renderFileField("Sales Contract", "scFiles", "sc-file-uploader")}
            </div>
          </div>
        </div>
      </div>
      )}

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
                      <th style={{ padding: '8px 4px', textAlign: 'left', width: '300px' }}>상품코드</th>
                      <th style={{ padding: '8px 4px', textAlign: 'left', width: '200px' }}>공급사</th>
                      <th style={{ padding: '8px 4px', textAlign: 'center', width: '120px' }}>수량 / 단위</th>
                      <th style={{ padding: '8px 4px', textAlign: 'center', width: '150px' }}>통화 / 단가</th>
                      <th style={{ padding: '8px 4px', textAlign: 'right', width: '100px' }}>금액</th>
                      <th style={{ padding: '8px 4px', textAlign: 'center', width: '45px', borderTopRightRadius: '6px', borderBottomRightRadius: '6px' }}>삭제</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderItems.map((item, idx) => {
                      if (item.isSourcingOnly) return null;
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '6px 4px', textAlign: 'center', color: '#64748b', verticalAlign: 'middle' }}>{idx + 1}</td>
                        
                        {/* 상품코드 */}
                        <td style={{ padding: '4px 4px' }}>
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
                                  setIsSourcingSearch(false);
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
                                    <option key={p.id} value={`[${p.productCode}] ${displayName}`}>
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
                          <div style={{ display: 'flex', flexDirection: 'row', gap: '3px', alignItems: 'center' }}>
                            <input
                              type="number"
                              value={item.qty || ''}
                              onChange={e => handleItemChange(idx, 'qty', e.target.value)}
                              placeholder="수량"
                              style={{ width: '70px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', textAlign: 'right', boxSizing: 'border-box', height: '26px', outline: 'none' }}
                            />
                            <input
                              type="text"
                              value={item.unit || ''}
                              onChange={e => handleItemChange(idx, 'unit', e.target.value)}
                              placeholder="단위"
                              style={{ width: '60px', padding: '0 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', boxSizing: 'border-box', height: '26px', outline: 'none', textAlign: 'center' }}
                            />
                          </div>
                        </td>

                        {/* 통화 / 단가 */}
                        <td style={{ padding: '4px 4px' }}>
                          <div style={{ display: 'flex', flexDirection: 'row', gap: '3px', alignItems: 'center' }}>
                            <select
                              value={item.currency || 'USD'}
                              onChange={e => handleItemChange(idx, 'currency', e.target.value)}
                              style={{ width: '75px', padding: '0 4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', boxSizing: 'border-box', height: '26px', outline: 'none' }}
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
                              style={{ width: '80px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', textAlign: 'right', boxSizing: 'border-box', height: '26px', outline: 'none' }}
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
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Forwarder/Transport Section */}
              <div style={{ marginTop: '4px', padding: '14px', background: '#f5f3ff', borderRadius: '8px', border: '1px solid #ddd6fe' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#7c3aed' }}>🚢 포워딩/운송사 & 운송비</label>
                  <button
                    type="button"
                    onClick={() => {
                      if (forwardersList.length >= 4) {
                        alert("운송사는 최대 4개까지 추가 가능합니다.");
                        return;
                      }
                      addForwarderRow();
                    }}
                    style={{ padding: '5px 12px', fontSize: '12px', fontWeight: 700, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                  >
                    + 운송사 추가
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px 32px', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>포워딩사/운송사명</span>
                  <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>운송비(발주가) (USD $)</span>
                  <span></span>
                </div>
                {forwardersList.length === 0 ? (
                  <div style={{ padding: '10px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>운송사를 추가하세요</div>
                ) : (
                  forwardersList.map((fw, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 200px 32px', gap: '8px', marginBottom: '6px', alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="포워딩사명 입력"
                        value={fw.name || ''}
                        onChange={e => handleForwarderChange(idx, 'name', e.target.value)}
                        style={{ padding: '8px', border: '1px solid #ddd6fe', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box', background: '#fff', outline: 'none' }}
                      />
                      <input
                        type="text"
                        placeholder="0.00"
                        value={fw.budgetAmountUsd ?? 0}
                        onChange={e => {
                          const val = e.target.value.replace(/[^0-9.]/g, '');
                          handleForwarderChange(idx, 'budgetAmountUsd', val);
                        }}
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
                  const usdTotal = orderItems.filter(it => !it.isSourcingOnly && it.currency !== 'KRW').reduce((sum, it) => sum + (it.amount || 0), 0)
                    + forwardersList.reduce((sum, fw) => sum + (parseFloat(fw.budgetAmountUsd as any) || 0), 0);
                  const krwTotal = orderItems.filter(it => !it.isSourcingOnly && it.currency === 'KRW').reduce((sum, it) => sum + (it.amount || 0), 0);
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
                  { id: '소싱발주', label: '1) 소싱발주' },
                  { id: '선적관리', label: '2) 선적관리/쉬핑마크 작성' },
                  { id: '패킹리스트', label: '3) 패킹 및 컨테이너로딩플랜' },
                  { id: '도착보고_쉬핑마크', label: '4) 도착보고' },
                  { id: 'COA_성적서', label: '5) COA/시험성적서/첨부파일관리' },
                  { id: '세금계산서_결제', label: '6) 세금계산서/구매확인서' },
                  { id: '대금결제관리', label: '7) 대금결제관리' }
                ].map(tab => {
                  const isActive = activeSourcingTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={async () => {
                        setActiveSourcingTab(tab.id as any);
                        await handleSaveBasic(false, tab.id);
                      }}
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
              {activeSourcingTab === '소싱발주' && (
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
                                  {issuedDocs.some(d => d.status === 'active' && (d.supplier_name === supplierName || d.po_number.includes(supplierName.replace(/\s+/g, '').substring(0,3).toUpperCase()))) && (
                                    <span style={{ padding: '2px 6px', background: '#dcfce7', color: '#166534', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                                      ✅ 발행완료
                                    </span>
                                  )}
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
                                  type="button"
                                  onClick={() => {
                                    // Add a new empty row belonging specifically to this supplier
                                    setSourcingItems(prev => [
                                      ...prev,
                                      {
                                        itemId: (prev.length + 1).toString(),
                                        name: '',
                                        supplier: supplierName,
                                        supplierContact: '',
                                        grade: '',
                                        qty: 0,
                                        unit: 'kg',
                                        unitPrice: 0,
                                        amount: 0,
                                        currency: 'USD'
                                      }
                                    ]);
                                  }}
                                  style={{ padding: '5px 10px', background: '#7c3aed', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '11.5px' }}
                                >
                                  ＋ 품목 추가
                                </button>
                                <button 
                                  onClick={() => handlePrintSupplierPo(supplierName, items)}
                                  style={{ padding: '5px 10px', background: '#f8fafc', border: '1px solid #cbd5e1', color: '#334155', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '11.5px' }}
                                >
                                  미리보기 / 인쇄
                                </button>
                                <button 
                                  onClick={() => issueAndSavePO(supplierName, items)}
                                  style={{ padding: '5px 10px', background: '#3b82f6', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '11.5px' }}
                                >
                                  📥 발주서 발행 및 저장
                                </button>
                                <button 
                                  onClick={() => handleEmailSupplierPo(supplierName, items)}
                                  style={{ padding: '5px 10px', background: '#10b981', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '11.5px' }}
                                >
                                  ✉️ 이메일 발송
                                </button>
                              </div>
                            </div>
                            {issuedDocs.filter(d => d.supplier_name === supplierName || d.po_number.includes(supplierName.replace(/\s+/g, '').substring(0,3).toUpperCase())).length > 0 && (
  <div style={{ marginTop: '15px', marginBottom: '15px', padding: '12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
    <h4 style={{ margin: '0 0 10px 0', fontSize: '12.5px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
      📁 발행 문서 보관함
    </h4>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', backgroundColor: '#fff' }}>
      <thead>
        <tr style={{ borderBottom: '2px solid #cbd5e1', backgroundColor: '#f1f5f9' }}>
          <th style={{ padding: '6px', textAlign: 'center', width: '50px' }}>No</th>
          <th style={{ padding: '6px', textAlign: 'left' }}>문서명</th>
          <th style={{ padding: '6px', textAlign: 'center', width: '120px' }}>발행일시</th>
          <th style={{ padding: '6px', textAlign: 'center', width: '60px' }}>버전</th>
          <th style={{ padding: '6px', textAlign: 'center', width: '80px' }}>발행자</th>
          <th style={{ padding: '6px', textAlign: 'center', width: '120px' }}>액션</th>
        </tr>
      </thead>
      <tbody>
        {issuedDocs
          .filter(d => d.supplier_name === supplierName || d.po_number.includes(supplierName.replace(/\s+/g, '').substring(0,3).toUpperCase()))
          .map((doc, idx) => (
          <tr key={doc.id} style={{ borderBottom: '1px solid #e2e8f0', color: doc.status === 'superseded' ? '#94a3b8' : 'inherit' }}>
            <td style={{ padding: '6px', textAlign: 'center' }}>{idx + 1}</td>
            <td style={{ padding: '6px', textAlign: 'left' }}>
              {doc.fileName}
              {doc.status === 'active' && <span style={{ marginLeft: '6px', padding: '2px 6px', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>최신</span>}
            </td>
            <td style={{ padding: '6px', textAlign: 'center' }}>{new Date(doc.issuedAt).toLocaleString()}</td>
            <td style={{ padding: '6px', textAlign: 'center' }}>v{doc.version}</td>
            <td style={{ padding: '6px', textAlign: 'center' }}>{doc.issuedBy}</td>
            <td style={{ padding: '6px', textAlign: 'center', display: 'flex', gap: '4px', justifyContent: 'center' }}>
              <a href={doc.fileUrl} target="_blank" rel="noreferrer" style={{ padding: '3px 8px', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', color: '#334155', textDecoration: 'none', fontSize: '11px' }}>보기</a>
              <a href={doc.fileUrl} download style={{ padding: '3px 8px', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', color: '#334155', textDecoration: 'none', fontSize: '11px' }}>↓ 다운</a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)}
<div style={{ padding: '12px 16px', background: '#fff', fontSize: '12px' }}>
                              {/* PO Custom Details Panel */}
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', marginBottom: '12px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <label style={{ fontWeight: 'bold', fontSize: '11px', color: '#475569' }}>입고요청일 (Request Date)</label>
                                  <input 
                                    type="text" 
                                    placeholder="예: 2026-07-15"
                                    value={basicForm.supplierPoDetails?.[supplierName]?.requestDate ?? ''}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setBasicForm(prev => {
                                        const current = prev.supplierPoDetails?.[supplierName] || {};
                                        return {
                                          ...prev,
                                          supplierPoDetails: {
                                            ...prev.supplierPoDetails,
                                            [supplierName]: { ...current, requestDate: val }
                                          }
                                        };
                                      });
                                    }}
                                    style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', background: '#fff', outline: 'none' }}
                                  />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <label style={{ fontWeight: 'bold', fontSize: '11px', color: '#475569' }}>납품처 (Delivery Place)</label>
                                  <input 
                                    type="text" 
                                    placeholder="예: YSACC 인천창고"
                                    value={basicForm.supplierPoDetails?.[supplierName]?.deliveryPlace ?? ''}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setBasicForm(prev => {
                                        const current = prev.supplierPoDetails?.[supplierName] || {};
                                        return {
                                          ...prev,
                                          supplierPoDetails: {
                                            ...prev.supplierPoDetails,
                                            [supplierName]: { ...current, deliveryPlace: val }
                                          }
                                        };
                                      });
                                    }}
                                    style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', background: '#fff', outline: 'none' }}
                                  />
                                </div>



                                {/* 일반사항 */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: 'span 2' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                                    <label style={{ fontWeight: 'bold', fontSize: '11px', color: '#475569' }}>※ 일반사항 (줄바꿈 가능)</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <select
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          if (!val) return;
                                          setBasicForm(prev => {
                                            const current = prev.supplierPoDetails?.[supplierName] || {};
                                            return {
                                              ...prev,
                                              supplierPoDetails: {
                                                ...prev.supplierPoDetails,
                                                [supplierName]: { ...current, generalNotes: val }
                                              }
                                            };
                                          });
                                        }}
                                        style={{ padding: '3px 6px', fontSize: '10.5px', border: '1px solid #cbd5e1', borderRadius: '4px', maxWidth: '200px', outline: 'none' }}
                                      >
                                        <option value="">📋 등록된 템플릿 선택</option>
                                        {poPresets.generalNotes.map((preset, pIdx) => (
                                          <option key={pIdx} value={preset}>{preset.substring(0, 30)}...</option>
                                        ))}
                                      </select>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const currentText = basicForm.supplierPoDetails?.[supplierName]?.generalNotes || '';
                                          handleAddPoPreset('generalNotes', currentText);
                                        }}
                                        style={{ padding: '3px 8px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '10.5px', fontWeight: 'bold', cursor: 'pointer' }}
                                      >
                                        ➕ 신규 등록 (DB)
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          const selectEl = e.currentTarget.previousElementSibling?.previousElementSibling as HTMLSelectElement;
                                          if (selectEl && selectEl.value) {
                                            handleDeletePoPreset('generalNotes', selectEl.value);
                                          } else {
                                            alert("삭제할 템플릿을 목록에서 먼저 선택해 주세요.");
                                          }
                                        }}
                                        style={{ padding: '3px 8px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '10.5px', fontWeight: 'bold', cursor: 'pointer' }}
                                      >
                                        ❌ 삭제
                                      </button>
                                    </div>
                                  </div>
                                  <textarea 
                                    rows={2}
                                    placeholder={`1. 부가가치세(VAT): 일반 전자세금계산서 발행 기준\n2. 결제조건: L/C 90 days from B/L date`}
                                    value={basicForm.supplierPoDetails?.[supplierName]?.generalNotes !== undefined ? basicForm.supplierPoDetails?.[supplierName]?.generalNotes : (poPresets.generalNotes[0] || '')}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setBasicForm(prev => {
                                        const current = prev.supplierPoDetails?.[supplierName] || {};
                                        return {
                                          ...prev,
                                          supplierPoDetails: {
                                            ...prev.supplierPoDetails,
                                            [supplierName]: { ...current, generalNotes: val }
                                          }
                                        };
                                      });
                                    }}
                                    style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', background: '#fff', outline: 'none', fontFamily: 'sans-serif' }}
                                  />
                                </div>

                                <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                                  <button
                                    type="button"
                                    onClick={() => handleSaveSupplierPoDetails(supplierName)}
                                    style={{ padding: '6px 12px', background: '#475569', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                  >
                                    💾 이 공급사의 발주조건 저장 (DB)
                                  </button>
                                </div>
                              </div>
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
                                    <th style={{ padding: '6px', textAlign: 'right', width: '90px' }}>수량</th>
                                    <th style={{ padding: '6px', textAlign: 'right', width: '120px' }}>매입가 (통화/단가)</th>
                                    <th style={{ padding: '6px', textAlign: 'right', width: '150px' }}>실매입가 (통화/단가)</th>
                                    <th style={{ padding: '6px', textAlign: 'right', width: '100px' }}>금액</th>
                                    <th style={{ padding: '6px', textAlign: 'right', width: '90px' }}>부가세</th>
                                    <th style={{ padding: '6px', textAlign: 'right', width: '110px' }}>합계</th>
                                    <th style={{ padding: '6px', textAlign: 'center', width: '50px' }}>삭제</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.length === 0 ? (
                                    <tr>
                                      <td colSpan={10} style={{ padding: '12px', textAlign: 'center', color: '#64748b', fontStyle: 'italic' }}>
                                        연결된 품목이 없습니다. (상단 '＋ 품목 추가' 버튼을 눌러 추가)
                                      </td>
                                    </tr>
                                  ) : (
                                    items.map((it, idx) => {
                                      const { purchasePrice, purchaseCurrency, itemCode, itemName, originalPurchasePrice } = getSupplierPurchaseInfo(it);
                                      const origCurrency = it.originalPurchaseCurrency || (it.originalPurchasePrice != null ? (it.originalPurchasePrice > 1000 ? 'KRW' : 'USD') : purchaseCurrency);
                                      
                                      const totalPurchaseAmount = purchasePrice * (it.qty || 0);
                                      
                                      // Find index in main sourcingItems array for callbacks
                                      const itemIndexInMain = sourcingItems.findIndex(x => x === it);
                                      
                                      return (
                                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                          <td style={{ padding: '6px' }}>{itemCode}</td>
                                          <td style={{ padding: '6px' }}>
                                            {isEditing ? (
                                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <input
                                                  type="text"
                                                  value={it.name || ''}
                                                  onChange={(e) => handleSourcingItemChange(itemIndexInMain, 'name', e.target.value)}
                                                  placeholder="[품목코드] 검색 혹은 품목명 직접 입력"
                                                  style={{ width: '100%', padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }}
                                                />
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setSearchItemIndex(itemIndexInMain);
                                                    setIsSourcingSearch(true);
                                                    setIsProductSearchOpen(true);
                                                  }}
                                                  style={{ padding: '3px 6px', background: '#e2e8f0', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                                                >
                                                  검색
                                                </button>
                                              </div>
                                            ) : (
                                              <strong>{itemName}</strong>
                                            )}
                                          </td>
                                          <td style={{ padding: '6px', textAlign: 'center' }}>
                                            {isEditing ? (
                                              <input
                                                type="text"
                                                value={it.grade || ''}
                                                onChange={(e) => {
                                                  const val = e.target.value;
                                                  setSourcingItems(prev => {
                                                    return prev.map(item => {
                                                      if (item === it) {
                                                        return { ...item, grade: val };
                                                      }
                                                      return item;
                                                    });
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
                                          <td style={{ padding: '6px', textAlign: 'right' }}>
                                            {isEditing ? (
                                              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', justifyContent: 'flex-end' }}>
                                                <input
                                                  type="number"
                                                  value={it.qty || 0}
                                                  onChange={(e) => handleSourcingItemChange(itemIndexInMain, 'qty', e.target.value)}
                                                  style={{ width: '60px', padding: '3px 4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', textAlign: 'right' }}
                                                />
                                                <span>{it.unit || 'kg'}</span>
                                              </div>
                                            ) : (
                                              `${it.qty?.toLocaleString()} ${it.unit}`
                                            )}
                                          </td>
                                          {/* 매입가 (통화/단가) */}
                                          <td style={{ padding: '6px', textAlign: 'right' }}>
                                            {isEditing ? (
                                              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', justifyContent: 'flex-end' }}>
                                                <select
                                                  value={origCurrency}
                                                  onChange={(e) => handleSourcingItemChange(itemIndexInMain, 'originalPurchaseCurrency', e.target.value)}
                                                  style={{ padding: '2px 4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }}
                                                >
                                                  <option value="USD">$</option>
                                                  <option value="KRW">₩</option>
                                                </select>
                                                <input
                                                  type="number"
                                                  value={it.originalPurchasePrice || 0}
                                                  onChange={(e) => handleSourcingItemChange(itemIndexInMain, 'originalPurchasePrice', e.target.value)}
                                                  style={{ width: '80px', padding: '3px 4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', textAlign: 'right' }}
                                                />
                                              </div>
                                            ) : (
                                              `${origCurrency === 'KRW' ? '₩' : '$'}${originalPurchasePrice?.toLocaleString(undefined, origCurrency === 'KRW' ? {} : { minimumFractionDigits: 2 })}`
                                            )}
                                          </td>
                                          {/* 실매입가 (통화/단가) */}
                                          <td style={{ padding: '6px', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                              <select
                                                value={purchaseCurrency}
                                                disabled={!isEditing}
                                                onChange={(e) => {
                                                  const val = e.target.value as 'KRW' | 'USD';
                                                  setSourcingItems(prev => {
                                                    return prev.map(item => {
                                                      if (item === it) {
                                                        return { ...item, purchaseUnitCurrency: val };
                                                      }
                                                      return item;
                                                    });
                                                  });
                                                }}
                                                style={{ padding: '2px 4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', outline: 'none', background: isEditing ? '#fff' : '#f1f5f9' }}
                                              >
                                                <option value="KRW">₩</option>
                                                <option value="USD">$</option>
                                              </select>
                                              <input
                                                type="text"
                                                value={(() => {
                                                  const val = it.purchaseUnitPrice ?? originalPurchasePrice;
                                                  return purchaseCurrency === 'KRW' 
                                                    ? Math.round(val).toLocaleString('ko-KR')
                                                    : val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
                                                })()}
                                                disabled={!isEditing}
                                                onChange={(e) => {
                                                  const raw = e.target.value.replace(/,/g, '');
                                                  const val = parseFloat(raw) || 0;
                                                  setSourcingItems(prev => {
                                                    return prev.map(item => {
                                                      if (item === it) {
                                                        return { ...item, purchaseUnitPrice: val };
                                                      }
                                                      return item;
                                                    });
                                                  });
                                                }}
                                                style={{
                                                  width: '80px',
                                                  padding: '3px 6px',
                                                  border: '1px solid #cbd5e1',
                                                  borderRadius: '4px',
                                                  fontSize: '11px',
                                                  textAlign: 'right'
                                                }}
                                              />
                                            </div>
                                          </td>
                                          <td style={{ padding: '6px', textAlign: 'right' }}>
                                            {purchaseCurrency === 'KRW' ? '₩' : '$'}{totalPurchaseAmount.toLocaleString(undefined, purchaseCurrency === 'KRW' ? {} : { minimumFractionDigits: 2 })}
                                          </td>
                                          <td style={{ padding: '6px', textAlign: 'right', color: '#64748b' }}>
                                            {(() => {
                                              const taxType = basicForm.supplierTaxTypes[supplierName] || '과세';
                                              const vatAmt = taxType === '영세' ? 0 : (purchaseCurrency === 'KRW' ? Math.round(totalPurchaseAmount * 0.1) : parseFloat((totalPurchaseAmount * 0.1).toFixed(2)));
                                              return `${purchaseCurrency === 'KRW' ? '₩' : '$'}${vatAmt.toLocaleString(undefined, purchaseCurrency === 'KRW' ? {} : { minimumFractionDigits: 2 })}`;
                                            })()}
                                          </td>
                                          <td style={{ padding: '6px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                                            {(() => {
                                              const taxType = basicForm.supplierTaxTypes[supplierName] || '과세';
                                              const vatAmt = taxType === '영세' ? 0 : (purchaseCurrency === 'KRW' ? Math.round(totalPurchaseAmount * 0.1) : parseFloat((totalPurchaseAmount * 0.1).toFixed(2)));
                                              const grandAmt = totalPurchaseAmount + vatAmt;
                                              return `${purchaseCurrency === 'KRW' ? '₩' : '$'}${grandAmt.toLocaleString(undefined, purchaseCurrency === 'KRW' ? {} : { minimumFractionDigits: 2 })}`;
                                            })()}
                                          </td>
                                          <td style={{ padding: '6px', textAlign: 'center' }}>
                                            {isEditing ? (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  if (window.confirm("이 품목을 삭제하시겠습니까?")) {
                                                    setSourcingItems(prev => prev.filter(x => x !== it).map((x, idx) => ({ ...x, itemId: (idx + 1).toString() })));
                                                  }
                                                }}
                                                style={{ border: 'none', background: 'transparent', color: '#ef4444', fontSize: '13px', cursor: 'pointer', fontWeight: 'bold' }}
                                              >
                                                ✕
                                              </button>
                                            ) : (
                                              '-'
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })
                                  )}
                                  {/* SUBTOTAL ROW */}
                                  {items.length > 0 && (
                                    <tr style={{ background: '#f8fafc', borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>
                                      <td colSpan={7} style={{ padding: '8px 12px', textAlign: 'right', color: '#1e3a8a' }}>SUBTOTAL (합계)</td>
                                      <td colSpan={3} style={{ padding: '8px 12px', textAlign: 'right' }}>
                                        {(() => {
                                          const usdTotal = items.filter(it => getSupplierPurchaseInfo(it).purchaseCurrency !== 'KRW').reduce((sum, it) => sum + getSupplierPurchaseInfo(it).purchasePrice * (it.qty || 0), 0);
                                          const krwTotal = items.filter(it => getSupplierPurchaseInfo(it).purchaseCurrency === 'KRW').reduce((sum, it) => sum + getSupplierPurchaseInfo(it).purchasePrice * (it.qty || 0), 0);
                                          const taxType = basicForm.supplierTaxTypes[supplierName] || '과세';
                                          const usdVat = taxType === '영세' ? 0 : parseFloat((usdTotal * 0.1).toFixed(2));
                                          const krwVat = taxType === '영세' ? 0 : Math.round(krwTotal * 0.1);
                                          const usdGrand = usdTotal + usdVat;
                                          const krwGrand = krwTotal + krwVat;
                                          
                                          const parts = [];
                                          if (usdGrand > 0) parts.push(`$${usdGrand.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
                                          if (krwGrand > 0) parts.push(`₩${krwGrand.toLocaleString()}`);
                                          return <span style={{ color: '#dc2626' }}>{parts.length > 0 ? parts.join(' / ') : '₩0'}</span>;
                                        })()}
                                      </td>
                                    </tr>
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
                <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 800, color: '#1e3a8a' }}>📁 발주서(PO) 통합 보관함</h4>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
                      해당 오더에 대해 시스템을 통해 발행된 모든 발주서 PDF 원본을 통합 관리합니다.
                    </div>
                    {issuedDocs.length > 0 ? (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', backgroundColor: '#fff', border: '1px solid #e2e8f0' }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid #cbd5e1', backgroundColor: '#f1f5f9' }}>
                            <th style={{ padding: '8px', textAlign: 'center', width: '50px' }}>No</th>
                            <th style={{ padding: '8px', textAlign: 'left' }}>공급사</th>
                            <th style={{ padding: '8px', textAlign: 'left' }}>문서명</th>
                            <th style={{ padding: '8px', textAlign: 'center', width: '120px' }}>발행일시</th>
                            <th style={{ padding: '8px', textAlign: 'center', width: '60px' }}>버전</th>
                            <th style={{ padding: '8px', textAlign: 'center', width: '80px' }}>발행자</th>
                            <th style={{ padding: '8px', textAlign: 'center', width: '220px' }}>액션</th>
                          </tr>
                        </thead>
                        <tbody>
                          {issuedDocs.map((doc, idx) => (
                            <tr key={doc.id} style={{ borderBottom: '1px solid #e2e8f0', color: doc.status === 'superseded' ? '#94a3b8' : 'inherit' }}>
                              <td style={{ padding: '8px', textAlign: 'center' }}>{idx + 1}</td>
                              <td style={{ padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>{doc.supplier_name}</td>
                              <td style={{ padding: '8px', textAlign: 'left' }}>
                                {doc.fileName}
                                {doc.status === 'active' && <span style={{ marginLeft: '6px', padding: '2px 6px', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>최신</span>}
                              </td>
                              <td style={{ padding: '8px', textAlign: 'center' }}>{new Date(doc.issuedAt).toLocaleString()}</td>
                              <td style={{ padding: '8px', textAlign: 'center' }}>v{doc.version}</td>
                              <td style={{ padding: '8px', textAlign: 'center' }}>{doc.issuedBy}</td>
                              <td style={{ padding: '8px', textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center', flexWrap: 'nowrap' }}>
                                  <a href={doc.fileUrl} target="_blank" rel="noreferrer" style={{ padding: '4px 10px', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', color: '#334155', textDecoration: 'none', fontSize: '11px', fontWeight: 'bold', display: 'inline-block', whiteSpace: 'nowrap' }}>보기</a>
                                  <a href={doc.fileUrl} download style={{ padding: '4px 10px', backgroundColor: '#e0f2fe', border: '1px solid #bae6fd', borderRadius: '4px', color: '#0369a1', textDecoration: 'none', fontSize: '11px', fontWeight: 'bold', display: 'inline-block', whiteSpace: 'nowrap' }}>↓ 다운로드</a>
                                  <button onClick={() => handleDeletePoIssuedDoc(doc.id, doc.fileName)} style={{ padding: '4px 10px', backgroundColor: '#fee2e2', border: '1px solid #fecaca', borderRadius: '4px', color: '#dc2626', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' }}>취소</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div style={{ padding: '20px', textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: '6px', color: '#94a3b8', fontSize: '12px', border: '1px solid #e2e8f0' }}>
                        발행된 발주서가 없습니다. 소싱발주 탭에서 발주서를 발행해주세요.
                      </div>
                    )}
                  </div>

                                  </>
              )}

              {/* 2) 선적관리 정보 등록 */}
              {activeSourcingTab === '선적관리' && (
                <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 800, color: '#1e3a8a' }}>🚢 2) 선적관리 정보 등록</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                    {/* 제품준비일 및 선적일정 수립 가이드 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px 16px', borderRadius: '8px', gridColumn: 'span 3', marginBottom: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>💡</span> 생산 기준 제품준비일 (최종 생산완료일)
                        </span>
                        <span style={{ fontSize: '14px', fontWeight: 800, color: '#15803d', background: '#dcfce7', padding: '2px 8px', borderRadius: '6px' }}>
                          {basicForm.cargoReadyDate ? `📅 ${basicForm.cargoReadyDate}` : '미정 (소싱발주 탭에서 생산완료일 지정)'}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#166534', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                        <span>각사별 생산완료일 중 가장 늦은 날짜를 제품준비일로 판단하며, 이를 토대로 선적 스케줄을 결정합니다.</span>
                        {basicForm.cargoReadyDate && isEditing && (
                          <button
                            type="button"
                            onClick={() => {
                              try {
                                const baseDate = new Date(basicForm.cargoReadyDate);
                                const addDays = (d: Date, days: number) => {
                                  const nd = new Date(d);
                                  nd.setDate(nd.getDate() + days);
                                  return nd.toISOString().split('T')[0];
                                };
                                setBasicForm(prev => ({
                                  ...prev,
                                  cfsEntryDate: addDays(baseDate, 1),      // 1일 뒤 입고
                                  docCutoffDate: addDays(baseDate, 2),     // 2일 뒤 서류마감
                                  cargoCutoffDate: addDays(baseDate, 3),   // 3일 뒤 Cargo 마감
                                  etd: addDays(baseDate, 4),               // 4일 뒤 출항
                                  eta: addDays(baseDate, 18)               // 14일 운송 표준 적용
                                }));
                              } catch (err) {
                                console.error(err);
                              }
                            }}
                            style={{
                              padding: '4px 10px',
                              background: '#16af52',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                              transition: 'background 0.15s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = '#15803d'}
                            onMouseLeave={e => e.currentTarget.style.background = '#16af52'}
                          >
                            추천 선적일정 자동 적용 (CFS/ETD/ETA)
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 포워딩업체 목록 및 비용 */}
                    <div style={{ gridColumn: 'span 3', border: '1px solid #ddd6fe', borderRadius: '8px', padding: '14px', background: '#f5f3ff', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#7c3aed' }}>🚢 포워딩/운송사 & 운송비</span>
                        <button
                          type="button"
                          disabled={!isEditing}
                          onClick={() => {
                            if (forwardersList.length >= 4) {
                              alert("운송사는 최대 4개까지 추가 가능합니다.");
                              return;
                            }
                            addForwarderRow();
                          }}
                          style={{ padding: '4px 10px', fontSize: '11px', fontWeight: 700, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '4px', cursor: isEditing ? 'pointer' : 'not-allowed' }}
                        >
                          + 운송사 추가
                        </button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 140px 140px 120px 32px', gap: '6px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>포워딩사/운송사명 (클릭)</span>
                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>국내운송비(KRW)</span>
                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>해상운임(USD)</span>
                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textAlign: 'right' }}>최종(USD)</span>
                        <span></span>
                      </div>
                      {forwardersList.length === 0 ? (
                        <div style={{ padding: '10px', textAlign: 'center', color: '#94a3b8', fontSize: '11px' }}>운송사를 추가하세요 (최대 4개)</div>
                      ) : (
                        forwardersList.map((fw, idx) => {
                          const customsRate = basicForm.customsExchangeRate || piData?.exchangeRate || 1350;
                          const freightAmt = Number(fw.freightAmount) || 0;
                          const amtKrw = Number(fw.amountKrw) || 0;
                          
                          // 최종(USD) = 해상운임(USD) + 국내운송비(KRW)/환율
                          const finalUsd = freightAmt + (amtKrw / customsRate);

                          return (
                          <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.5fr 140px 140px 120px 32px', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
                            {/* 포워더명 SubWindow 선택 */}
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              <input
                                type="text"
                                readOnly
                                disabled={!isEditing}
                                placeholder="포워딩사 클릭 선택..."
                                value={fw.name || ''}
                                onClick={() => {
                                  if (!isEditing) return;
                                  setForwarderSearchIndex(idx);
                                  setIsForwarderSearchOpen(true);
                                }}
                                style={{ flex: 1, padding: '6px 8px', border: '1px solid #ddd6fe', borderRadius: '4px', fontSize: '11.5px', boxSizing: 'border-box', background: '#f8fafc', cursor: isEditing ? 'pointer' : 'default', outline: 'none' }}
                              />
                              <button
                                type="button"
                                disabled={!isEditing}
                                onClick={() => {
                                  setForwarderSearchIndex(idx);
                                  setIsForwarderSearchOpen(true);
                                }}
                                style={{ padding: '6px 8px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11.5px', fontWeight: 700, cursor: isEditing ? 'pointer' : 'not-allowed' }}
                              >
                                🔍
                              </button>
                            </div>

                            {/* 실행(국내비용) - KRW */}
                            <input
                              type="text"
                              disabled={!isEditing}
                              placeholder="0"
                              value={
                                fw.amountKrw !== undefined && fw.amountKrw !== null && String(fw.amountKrw) !== '' && !Number.isNaN(Number(fw.amountKrw))
                                  ? Number(fw.amountKrw).toLocaleString()
                                  : ''
                              }
                              onChange={e => {
                                const val = e.target.value.replace(/[^0-9]/g, '');
                                handleForwarderChange(idx, 'amountKrw', val);
                              }}
                              style={{ padding: '6px 8px', border: '1px solid #ddd6fe', borderRadius: '4px', fontSize: '11.5px', boxSizing: 'border-box', textAlign: 'right', background: isEditing ? '#fff' : '#f8fafc', height: '30px', outline: 'none', width: '100%' }}
                            />

                            {/* 해상운임 - USD */}
                            <input
                              type="text"
                              disabled={!isEditing}
                              placeholder="0"
                              value={
                                fw.freightAmount !== undefined && fw.freightAmount !== null && String(fw.freightAmount) !== '' && !Number.isNaN(Number(fw.freightAmount))
                                  ? (() => {
                                      const parts = String(fw.freightAmount).split('.');
                                      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
                                      return parts.join('.');
                                    })()
                                  : ''
                              }
                              onChange={e => {
                                const val = e.target.value.replace(/[^0-9.]/g, '');
                                const parts = val.split('.');
                                const cleanVal = parts[0] + (parts.length > 1 ? '.' + parts.slice(1).join('') : '');
                                handleForwarderChange(idx, 'freightAmount', cleanVal);
                                handleForwarderChange(idx, 'freightCurrency', 'USD'); // 강제로 USD 설정
                              }}
                              style={{ padding: '6px 8px', border: '1px solid #ddd6fe', borderRadius: '4px', fontSize: '11.5px', boxSizing: 'border-box', textAlign: 'right', background: isEditing ? '#fff' : '#f8fafc', height: '30px', outline: 'none', width: '100%' }}
                            />

                            {/* 최종(USD) 표시 */}
                            <div style={{ padding: '6px 8px', fontSize: '11.5px', fontWeight: 700, color: '#ef4444', textAlign: 'right', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                              ${finalUsd > 0 ? finalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                            </div>

                            <button
                              type="button"
                              disabled={!isEditing}
                              onClick={() => removeForwarderRow(idx)}
                              style={{ padding: '6px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', cursor: isEditing ? 'pointer' : 'not-allowed', fontSize: '11.5px', fontWeight: 700 }}
                            >✕</button>
                          </div>
                          );
                        })
                      )}
                    </div>
                    {/* Vessel확정(선박명/항차)/DOC CLS/CARGO CLS/ETD/ETA을 한줄로 표시 */}
                    <div style={{ gridColumn: 'span 3', display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1fr', gap: '10px', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>Vessel 확정 (선박명/항차)</span>
                        <input type="text" value={basicForm.vesselBooking} onChange={e => setBasicForm(p => ({ ...p, vesselBooking: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="예: HYUNDAI TOKYO V.024E" />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>DOC CLS</span>
                        <input type="date" value={basicForm.docCutoffDate || ''} onChange={e => setBasicForm(p => ({ ...p, docCutoffDate: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>CARGO CLS</span>
                        <input type="date" value={basicForm.cargoCutoffDate || ''} onChange={e => setBasicForm(p => ({ ...p, cargoCutoffDate: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>ETD (출항예정일)</span>
                        <input type="date" value={basicForm.etd || ''} onChange={e => setBasicForm(p => ({ ...p, etd: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>ETA (입항예정일)</span>
                        <input type="date" value={basicForm.eta || ''} onChange={e => setBasicForm(p => ({ ...p, eta: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} />
                      </div>
                    </div>

                    {/* 컨테이너작업장소/컨테이너(CFS)입고일/CFS 회사명/주소 및 담당(신규등록 및 저장기능)-1줄 표현 */}
                    <div style={{ gridColumn: 'span 3', display: 'grid', gridTemplateColumns: '120px 140px 1fr', gap: '10px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>컨테이너 작업장소</span>
                        {isEditing ? (
                          <select value={basicForm.containerWorkspaceType} onChange={e => setBasicForm(p => ({ ...p, containerWorkspaceType: e.target.value as any }))} style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', width: '100%', height: '37px' }}>
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
                        <input type="date" value={basicForm.cfsEntryDate} onChange={e => setBasicForm(p => ({ ...p, cfsEntryDate: e.target.value }))} disabled={!isEditing} style={{ ...inputStyle(isEditing), height: '37px' }} />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>CFS 정보 (회사명, 주소 및 담당자)</span>
                          {isEditing && (
                            <button
                              type="button"
                              onClick={() => setIsAddingCfs((p: boolean) => !p)}
                              style={{ border: 'none', background: 'none', color: '#3b82f6', fontSize: '10.5px', fontWeight: 700, padding: 0, cursor: 'pointer' }}
                            >
                              {isAddingCfs ? '선택형' : '직접등록'}
                            </button>
                          )}
                        </span>
                        {isAddingCfs && isEditing ? (
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <input
                              type="text"
                              placeholder="새 CFS 입력 (회사명 / 담당자 / 연락처 / 주소 등)"
                              value={newCfsVal}
                              onChange={e => setNewCfsVal(e.target.value)}
                              style={{ ...inputStyle(true), height: '37px', flex: 1 }}
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                if (!newCfsVal.trim()) return;
                                try {
                                  const cfsId = `cfs_${Date.now()}`;
                                  await setDoc(doc(db, 'companies', COMPANY_ID, 'cfsLocations', cfsId), {
                                    address: newCfsVal.trim(),
                                    createdAt: serverTimestamp()
                                  });
                                  setCfsList((prev: string[]) => [...prev, newCfsVal.trim()]);
                                  setBasicForm(p => ({ ...p, cfsContactInfo: newCfsVal.trim() }));
                                  setNewCfsVal('');
                                  setIsAddingCfs(false);
                                  alert('CFS가 등록 및 선택되었습니다.');
                                } catch (err: any) {
                                  alert('CFS 저장 실패: ' + err.message);
                                }
                              }}
                              style={{ padding: '0 8px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}
                            >
                              저장
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <select
                              disabled={!isEditing}
                              value={basicForm.cfsContactInfo || ''}
                              onChange={e => setBasicForm(p => ({ ...p, cfsContactInfo: e.target.value }))}
                              style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', width: '220px', height: '37px', background: '#fff' }}
                            >
                              <option value="">선택하세요</option>
                              {cfsList.map((cfs: string, idx: number) => (
                                <option key={idx} value={cfs}>{cfs.split('\n')[0]}</option>
                              ))}
                            </select>
                            <input 
                              type="text" 
                              style={{ ...inputStyle(isEditing), height: '37px', flex: 1 }} 
                              value={basicForm.cfsContactInfo || ''} 
                              onChange={e => setBasicForm(p => ({ ...p, cfsContactInfo: e.target.value }))} 
                              disabled={!isEditing} 
                              placeholder="선택한 CFS 주소 및 담당자 정보 상세" 
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 거래서류 (거래명세표) 첨부 영역 추가 */}
                    <div style={{ gridColumn: 'span 3', borderTop: '1px solid #e2e8f0', paddingTop: '14px', marginTop: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '8px' }}>📂 거래서류 첨부 (거래명세표 등)</span>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
                        {renderFileField("거래서류 (거래명세표)", "transactionFiles", "transaction-file-uploader")}
                      </div>
                    </div>
                  </div>

                  {/* 공통 쉬핑마크 설정 (선적관리 탭 하단으로 이동됨) */}
                  <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', marginTop: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 800, color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                      ⚙️ 공통 쉬핑마크 설정 (Common Shipping Mark Setup)
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
                      {/* 도형 선택 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '11px', color: '#475569' }}>도형 선택</span>
                        <select 
                          value={commonShippingMark.shape}
                          onChange={(e) => setCommonShippingMark(prev => ({ ...prev, shape: e.target.value }))}
                          style={{ padding: '6px', fontSize: '11.5px', border: '1px solid #cbd5e1', borderRadius: '4px', background: '#fff', outline: 'none' }}
                        >
                          <option value="circle">◯ 원형 (Circle)</option>
                          <option value="square">▢ 사각형 (Square)</option>
                          <option value="triangle">△ 삼각형 (Triangle)</option>
                          <option value="diamond">◇ 다이아몬드 (Diamond)</option>
                        </select>
                      </div>

                      {/* 회사/바이어 약자 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '11px', color: '#475569' }}>회사/고객 약자</span>
                        <input 
                          type="text" 
                          placeholder="약자 입력 (예: YSACC)" 
                          value={commonShippingMark.company}
                          onChange={(e) => setCommonShippingMark(prev => ({ ...prev, company: e.target.value }))}
                          style={{ padding: '6px', fontSize: '11.5px', border: '1px solid #cbd5e1', borderRadius: '4px', background: '#fff', outline: 'none' }}
                        />
                      </div>

                      {/* 도착 포트 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '11px', color: '#475569' }}>도착 포트</span>
                        <input 
                          type="text" 
                          placeholder="도착 포트 (예: DOHA)" 
                          value={commonShippingMark.port}
                          onChange={(e) => setCommonShippingMark(prev => ({ ...prev, port: e.target.value }))}
                          style={{ padding: '6px', fontSize: '11.5px', border: '1px solid #cbd5e1', borderRadius: '4px', background: '#fff', outline: 'none' }}
                        />
                      </div>

                      {/* 국가 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '11px', color: '#475569' }}>도착 국가</span>
                        <input 
                          type="text" 
                          placeholder="국가 (예: QATAR)" 
                          value={commonShippingMark.country}
                          onChange={(e) => setCommonShippingMark(prev => ({ ...prev, country: e.target.value }))}
                          style={{ padding: '6px', fontSize: '11.5px', border: '1px solid #cbd5e1', borderRadius: '4px', background: '#fff', outline: 'none' }}
                        />
                      </div>

                      {/* 원산지 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '11px', color: '#475569' }}>원산지</span>
                        <input 
                          type="text" 
                          placeholder="원산지" 
                          value={commonShippingMark.origin}
                          onChange={(e) => setCommonShippingMark(prev => ({ ...prev, origin: e.target.value }))}
                          style={{ padding: '6px', fontSize: '11.5px', border: '1px solid #cbd5e1', borderRadius: '4px', background: '#fff', outline: 'none' }}
                        />
                      </div>
                    </div>

                    {/* Live Preview and Direct Save Action */}
                    <div style={{ marginTop: '16px', display: 'flex', gap: '20px', alignItems: 'center', background: '#fff', border: '1px dashed #cbd5e1', borderRadius: '6px', padding: '12px', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: '220px' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '11.5px', color: '#475569', display: 'block', marginBottom: '8px' }}>🔍 실시간 쉬핑마크 미리보기 (Live Preview)</span>
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px', background: '#fafafa', border: '1px solid #e2e8f0', borderRadius: '4px', minHeight: '110px' }}>
                          {(() => {
                            const comp = commonShippingMark.company || 'YSACC';
                            const portCountry = `${commonShippingMark.port || ''}, ${commonShippingMark.country || ''}`;
                            const pltNo = 'PALLET NO. : 1 / 5';
                            const origin = commonShippingMark.origin || 'MADE IN KOREA';
                            
                            let shapeSvg = null;
                            if (commonShippingMark.shape === 'circle') {
                              shapeSvg = <svg width="55" height="55" style={{ display: 'block', margin: '0 auto' }}><circle cx="27.5" cy="27.5" r="24" stroke="black" strokeWidth="2" fill="none" /><text x="50%" y="54%" fontSize="11" fontWeight="bold" textAnchor="middle" dominantBaseline="middle" fill="black">{comp}</text></svg>;
                            } else if (commonShippingMark.shape === 'square') {
                              shapeSvg = <svg width="55" height="40" style={{ display: 'block', margin: '0 auto' }}><rect x="3" y="3" width="49" height="34" stroke="black" strokeWidth="2" fill="none" /><text x="50%" y="54%" fontSize="11" fontWeight="bold" textAnchor="middle" dominantBaseline="middle" fill="black">{comp}</text></svg>;
                            } else if (commonShippingMark.shape === 'triangle') {
                              shapeSvg = <svg width="55" height="50" style={{ display: 'block', margin: '0 auto' }}><polygon points="27.5,3 3,47 52,47" stroke="black" strokeWidth="2" fill="none" /><text x="50%" y="68%" fontSize="10" fontWeight="bold" textAnchor="middle" dominantBaseline="middle" fill="black">{comp}</text></svg>;
                            } else {
                              shapeSvg = <svg width="55" height="40" style={{ display: 'block', margin: '0 auto' }}><polygon points="27.5,3 52,20 27.5,37 3,20" stroke="black" strokeWidth="2" fill="none" /><text x="50%" y="54%" fontSize="10" fontWeight="bold" textAnchor="middle" dominantBaseline="middle" fill="black">{comp}</text></svg>;
                            }

                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', lineHeight: 1.2 }}>
                                {shapeSvg}
                                <div style={{ fontSize: '8px', fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase', color: '#334155' }}>
                                  <div>{portCountry}</div>
                                  <div style={{ margin: '2px 0' }}>{pltNo}</div>
                                  <div>{origin}</div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'center' }}>
                        <button
                          type="button"
                          onClick={async () => {
                            await handleSaveBasic(true);
                          }}
                          style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          💾 쉬핑마크 설정 저장 (클라우드)
                        </button>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                          ※ 수정한 마크 설정을 저장한 후, 4) 도착보고 탭에서<br/>
                          '⚡ 테이블에 마크 적용' 버튼을 눌러 적용하세요.
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 3) 패킹리스트 작성 및 검토 */}
              {activeSourcingTab === '패킹리스트' && (
                <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
                    <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#1e3a8a' }}>📦 3) 패킹리스트 작성 및 검토 (자동/수동 편집 지원)</h4>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        type="button" 
                        onClick={handlePrintPL}
                        style={{ padding: '6px 12px', fontSize: '12px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        PL 미리보기 및 PDF 저장
                      </button>
                    </div>
                  </div>

                  {/* 1단계: 제품별 팔레트화 (Palletization & Residue Control) */}
                  <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '13.5px', fontWeight: 800, color: '#0f766e', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #cbd5e1', paddingBottom: '8px' }}>
                      📋 Step 1. 제품별 팔레트화 설정 (Palletization & Residue Options)
                    </h4>
                    <p style={{ margin: '0 0 14px 0', fontSize: '11.5px', color: '#64748b', lineHeight: 1.4 }}>
                      주문 수량을 기준으로 제품별 마스터 포장(Pallet) 규격에 따라 패킹 단위를 분할합니다. 남는 자투리 수량의 포장 처리 방식을 결정해 주세요.
                    </p>

                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', background: '#fff', border: '1px solid #e2e8f0' }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                          <th style={{ padding: '8px', textAlign: 'left', width: '20%' }}>제품코드 / 품명</th>
                          <th style={{ padding: '8px', textAlign: 'right', width: '8%' }}>주문 총수량</th>
                          <th style={{ padding: '8px', textAlign: 'left', width: '12%' }}>포장 형태 (마스터)</th>
                          <th style={{ padding: '8px', textAlign: 'right', width: '8%' }}>PL당 적재수량</th>
                          <th style={{ padding: '8px', textAlign: 'right', width: '8%' }}>순중량 (Kg)</th>
                          <th style={{ padding: '8px', textAlign: 'right', width: '8%' }}>총중량 (Kg)</th>
                          <th style={{ padding: '8px', textAlign: 'center', width: '10%' }}>완제 팔레트수</th>
                          <th style={{ padding: '8px', textAlign: 'right', width: '8%' }}>남은 자투리 수량</th>
                          <th style={{ padding: '8px', textAlign: 'center', width: '18%' }}>자투리 처리 방식</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderItems.map((item, idx) => {
                          const match = (item.name || '').match(/^\[(.*?)\]\s*(.*)$/);
                          const itemCode = match ? match[1] : '-';
                          const itemName = match ? match[2] : (item.name || '');
                          const qty = item.qty || 0;

                          // Find product packing method
                          const p = products.find(prod => prod.productCode === itemCode || prod.id === itemCode);
                          const matchedMethod = p?.packingMethods?.find((m: any) => m.id === item.selectedPackingMethodId) || p?.packingMethods?.find((m: any) => m.isDefault) || p?.packingMethods?.[0] || {
                            id: 'default_single',
                            name: '단품',
                            unit: p?.unit || 'EA',
                            isDefault: true,
                            packageType: '단품',
                            qtyPerPallet: 100,
                            unitWidth: p?.unitWidth || 0,
                            unitLength: p?.unitLength || 0,
                            unitHeight: p?.unitHeight || 0,
                            unitWeight: p?.unitWeight || 0,
                            unitGrossWeight: p?.unitGrossWeight || 0,
                            palletWidth: p?.palletWidth || 0,
                            palletLength: p?.palletLength || 0,
                            palletHeight: p?.palletHeight || 0,
                            palletWeight: p?.palletWeight || 0,
                            palletGrossWeight: p?.palletGrossWeight || 0
                          };

                          const qtyPerPallet = matchedMethod.qtyPerPallet || 100;
                          const fullPallets = Math.floor(qty / qtyPerPallet);
                          const residue = qty % qtyPerPallet;

                          const isPlt = matchedMethod.packageType.toLowerCase().includes('pallet') || matchedMethod.packageType.toLowerCase().includes('plt');
                          const isSingleRaw = matchedMethod.packageType === '단품';

                          const netW = isPlt 
                            ? (matchedMethod.palletWeight || 0) 
                            : (isSingleRaw ? (matchedMethod.unitWeight || 0) * qtyPerPallet : (matchedMethod.unitWeight || 0));

                          const grossW = isPlt 
                            ? (matchedMethod.palletGrossWeight || 0) 
                            : (isSingleRaw ? (matchedMethod.unitGrossWeight || 0) * qtyPerPallet : (matchedMethod.unitGrossWeight || 0));

                          // Read custom residue treatment from state if any, default to 'independent'
                          const residueKey = `residue_${itemCode}_${idx}`;
                          const treatment = (basicForm.packingList as any)?.[residueKey] || 'independent';

                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                              <td style={{ padding: '8px', fontWeight: 'bold' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span>[{itemCode}] {itemName}</span>
                                  {p && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingProd(p);
                                        setIsProdModalOpen(true);
                                      }}
                                      title="상품 정보 및 상세 패킹방법 수정"
                                      style={{
                                        background: '#fef08a',
                                        border: '1px solid #cbd5e1',
                                        color: '#a16207',
                                        borderRadius: '4px',
                                        padding: '2px 4px',
                                        cursor: 'pointer',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        height: '22px',
                                        width: '22px'
                                      }}
                                    >
                                      ✏️
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td style={{ padding: '8px', textAlign: 'right' }}>{qty.toLocaleString()} EA</td>
                              <td style={{ padding: '8px' }}>
                                <select
                                  disabled={!isEditing}
                                  value={matchedMethod.id || ''}
                                  onChange={async (e) => {
                                    const val = e.target.value;
                                    if (p) {
                                      const nextMethods = (p.packingMethods || []).map((m: any) => ({
                                        ...m,
                                        isDefault: m.id === val
                                      }));
                                      await updateDoc(doc(db, 'companies', COMPANY_ID, 'products', p.id), { packingMethods: nextMethods });
                                    }
                                  }}
                                  style={{ padding: '4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', width: '98%' }}
                                >
                                  {(p?.packingMethods || []).map((m: any) => (
                                    <option key={m.id} value={m.id}>
                                      {m.packageType} ({m.qtyPerPallet} EA)
                                    </option>
                                  ))}
                                  {(!p?.packingMethods || p.packingMethods.length === 0) && (
                                    <option value="">단품 (1 EA)</option>
                                  )}
                                </select>
                              </td>
                              <td style={{ padding: '8px', textAlign: 'right' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                                  <input
                                    type="number"
                                    disabled={!isEditing}
                                    value={qtyPerPallet}
                                    onChange={async (e) => {
                                      const val = parseInt(e.target.value) || 1;
                                      if (p) {
                                        const nextMethods = [...(p.packingMethods || [])];
                                        const defaultIdx = nextMethods.findIndex((m: any) => m.isDefault) !== -1 ? nextMethods.findIndex((m: any) => m.isDefault) : 0;
                                        if (nextMethods[defaultIdx]) {
                                          nextMethods[defaultIdx].qtyPerPallet = val;
                                        } else {
                                          nextMethods[defaultIdx] = {
                                            id: 'default_' + Math.random().toString(36).substring(2, 11),
                                            name: 'Default',
                                            unit: p.unit || 'EA',
                                            isDefault: true,
                                            packageType: '단품',
                                            qtyPerPallet: val
                                          };
                                        }
                                        await updateDoc(doc(db, 'companies', COMPANY_ID, 'products', p.id), { packingMethods: nextMethods });
                                      }
                                    }}
                                    style={{ padding: '4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', width: '70px', textAlign: 'right' }}
                                  />
                                  <span>EA</span>
                                </div>
                              </td>
                              <td style={{ padding: '8px', textAlign: 'right' }}>{netW.toLocaleString()} Kg</td>
                              <td style={{ padding: '8px', textAlign: 'right' }}>{grossW.toLocaleString()} Kg</td>
                              <td style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold', color: '#0284c7' }}>{fullPallets} PLT</td>
                              <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', color: residue > 0 ? '#ea580c' : '#64748b' }}>
                                {residue.toLocaleString()} EA
                              </td>
                              <td style={{ padding: '8px', textAlign: 'center' }}>
                                <select
                                  disabled={residue === 0 || !isEditing}
                                  value={treatment}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setBasicForm(prev => {
                                      const nextPL = { ...(prev.packingList || {}) };
                                      (nextPL as any)[residueKey] = val;
                                      return { ...prev, packingList: nextPL };
                                    });
                                  }}
                                  style={{ padding: '4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', background: residue === 0 ? '#f1f5f9' : '#fff' }}
                                >
                                  <option value="independent">독립 팔레트 (높이조정)</option>
                                  <option value="single">박스 단품 (손적재)</option>
                                  <option value="mixed">혼적용 (Mixed PLT)</option>
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* 2단계: 완성된 팔레트의 컨테이너 적재 (Container Loading Plan) */}
                  {basicForm.packingList && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', boxShadow: '0 4px 6px rgba(0,0,0,0.01)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                          <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: 800, color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            📦 Step 2. 패킹리스트 작성 및 검토 (자동/수동 편집 지원)
                          </h4>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              type="button"
                              onClick={() => {
                                // AUTO ALLOCATION LOGIC: Distribute computed pallets into containers
                                const newContainers: any[] = [];
                                let currentContainerItems: any[] = [];
                                 let currentPkgNo = 1;
                                 // containerIndex removed

                                orderItems.forEach((item, itemIdx) => {
                                  const match = (item.name || '').match(/^\[(.*?)\]\s*(.*)$/);
                                  const itemCode = match ? match[1] : '-';
                                  const itemName = match ? match[2] : (item.name || '');
                                  const qty = item.qty || 0;

                                  const p = products.find(prod => prod.productCode === itemCode || prod.id === itemCode);
                                  const matchedMethod = p?.packingMethods?.find((m: any) => m.id === item.selectedPackingMethodId) || p?.packingMethods?.find((m: any) => m.isDefault) || p?.packingMethods?.[0] || {
                                    id: 'default_single',
                                    name: '단품',
                                    unit: p?.unit || 'EA',
                                    isDefault: true,
                                    packageType: '단품',
                                    qtyPerPallet: 100,
                                    unitWidth: p?.unitWidth || 0,
                                    unitLength: p?.unitLength || 0,
                                    unitHeight: p?.unitHeight || 0,
                                    unitWeight: p?.unitWeight || 0,
                                    unitGrossWeight: p?.unitGrossWeight || 0,
                                    palletWidth: p?.palletWidth || 0,
                                    palletLength: p?.palletLength || 0,
                                    palletHeight: p?.palletHeight || 0,
                                    palletWeight: p?.palletWeight || 0,
                                    palletGrossWeight: p?.palletGrossWeight || 0
                                  };

                                  const qtyPerPallet = matchedMethod.qtyPerPallet || 100;
                                  const fullPallets = Math.floor(qty / qtyPerPallet);
                                  const residue = qty % qtyPerPallet;
                                  const isPlt = matchedMethod.packageType.toLowerCase().includes('pallet') || matchedMethod.packageType.toLowerCase().includes('plt');
                                  const isSingleRaw = matchedMethod.packageType === '단품';
                                  const w = isPlt ? (matchedMethod.palletWidth || 0) : (matchedMethod.unitWidth || 0);
                                  const l = isPlt ? (matchedMethod.palletLength || 0) : (matchedMethod.unitLength || 0);
                                  const h = isPlt ? (matchedMethod.palletHeight || 0) : (matchedMethod.unitHeight || 0);

                                  // 1. Add full pallets
                                  if (fullPallets > 0) {
                                    const netW = isPlt 
                                      ? (matchedMethod.palletWeight || 0) 
                                      : (isSingleRaw ? (matchedMethod.unitWeight || 0) * qtyPerPallet : (matchedMethod.unitWeight || 0));
                                    const grossW = isPlt 
                                      ? (matchedMethod.palletGrossWeight || 0) 
                                      : (isSingleRaw ? (matchedMethod.unitGrossWeight || 0) * qtyPerPallet : (matchedMethod.unitGrossWeight || 0));
                                    const cbm = Number(((w * l * h) / 1000000000).toFixed(4));

                                    for (let f = 0; f < fullPallets; f++) {
                                      currentContainerItems.push({
                                        pkgNo: String(currentPkgNo),
                                        pkg: '1',
                                        qty: String(qtyPerPallet),
                                        description: `[${itemCode}] ${itemName} (완제 Pallet)`,
                                        packageType: matchedMethod.packageType,
                                        dimensions: `${w}x${l}x${h}`,
                                        supplier: item.supplier || '',
                                        netWeight: String(Math.round(netW)),
                                        grossWeight: String(Math.round(grossW)),
                                        cbm: String(cbm.toFixed(3))
                                      });
                                      currentPkgNo++;
                                    }
                                  }

                                  // 2. Add residue if exists
                                  if (residue > 0) {
                                    const residueKey = `residue_${itemCode}_${itemIdx}`;
                                    const treatment = (basicForm.packingList as any)?.[residueKey] || 'independent';

                                    if (treatment === 'independent') {
                                      // Height scaled down
                                      const scale = residue / qtyPerPallet;
                                      const scaledH = Math.max(200, Math.round(h * scale));
                                      const netW = isPlt
                                        ? (matchedMethod.palletWeight || 0) * (residue / qtyPerPallet)
                                        : (isSingleRaw ? (matchedMethod.unitWeight || 0) * residue : (matchedMethod.unitWeight || 0) * (residue / qtyPerPallet));
                                      const grossW = isPlt
                                        ? (matchedMethod.palletGrossWeight || 0) * (residue / qtyPerPallet)
                                        : (isSingleRaw ? (matchedMethod.unitGrossWeight || 0) * residue : (matchedMethod.unitGrossWeight || 0) * (residue / qtyPerPallet));
                                      const cbm = Number(((w * l * scaledH) / 1000000000).toFixed(4));

                                      currentContainerItems.push({
                                        pkgNo: String(currentPkgNo),
                                        pkg: '1',
                                         qty: String(residue),
                                        description: `[${itemCode}] ${itemName} (자투리 독립 Pallet)`,
                                        packageType: matchedMethod.packageType,
                                        dimensions: `${w}x${l}x${scaledH}`,
                                        supplier: item.supplier || '',
                                        netWeight: String(Math.round(netW)),
                                        grossWeight: String(Math.round(grossW)),
                                        cbm: String(cbm.toFixed(3))
                                       });
                                       currentPkgNo++;
                                    } else if (treatment === 'single') {
                                      // Single carton boxes hand-loaded
                                      const singleW = matchedMethod.unitWidth || 300;
                                      const singleL = matchedMethod.unitLength || 300;
                                      const singleH = matchedMethod.unitHeight || 300;
                                      const netW = isPlt
                                        ? (matchedMethod.palletWeight || 0) * (residue / qtyPerPallet)
                                        : (isSingleRaw ? (matchedMethod.unitWeight || 0) * residue : (matchedMethod.unitWeight || 0) * (residue / qtyPerPallet));
                                      const grossW = isPlt
                                        ? (matchedMethod.palletGrossWeight || 0) * (residue / qtyPerPallet)
                                        : (isSingleRaw ? (matchedMethod.unitGrossWeight || 0) * residue : (matchedMethod.unitGrossWeight || 0) * (residue / qtyPerPallet));
                                      const cbm = Number(((singleW * singleL * singleH) / 1000000000 * residue).toFixed(4));

                                      currentContainerItems.push({
                                        pkgNo: `${currentPkgNo}-${currentPkgNo + residue - 1}`,
                                        pkg: String(residue),
                                         qty: String(residue),
                                        description: `[${itemCode}] ${itemName} (자투리 단품 박스 적재)`,
                                        packageType: '단품 박스',
                                        dimensions: `${singleW}x${singleL}x${singleH}`,
                                        supplier: item.supplier || '',
                                        netWeight: String(Math.round(netW)),
                                        grossWeight: String(Math.round(grossW)),
                                        cbm: String(cbm.toFixed(3))
                                       });
                                       currentPkgNo += residue;
                                    } else {
                                      // Mixed Pallet template
                                      currentContainerItems.push({
                                        pkgNo: String(currentPkgNo),
                                        pkg: '1',
                                         qty: String(residue),
                                        description: `[${itemCode}] ${itemName} (혼적 LCL Pallet 대상)`,
                                        packageType: '혼적 Pallet',
                                        dimensions: `${w}x${l}x${h}`,
                                        supplier: item.supplier || '',
                                        netWeight: String(Math.round(isPlt
                                          ? (matchedMethod.palletWeight || 0) * (residue / qtyPerPallet)
                                          : (isSingleRaw ? (matchedMethod.unitWeight || 0) * residue : (matchedMethod.unitWeight || 0) * (residue / qtyPerPallet)))),
                                        grossWeight: String(Math.round(isPlt
                                          ? (matchedMethod.palletGrossWeight || 0) * (residue / qtyPerPallet)
                                          : (isSingleRaw ? (matchedMethod.unitGrossWeight || 0) * residue : (matchedMethod.unitGrossWeight || 0) * (residue / qtyPerPallet)))),
                                        cbm: String(Number(((w * l * h) / 1000000000).toFixed(4)).toFixed(3))
                                       });
                                       currentPkgNo++;
                                    }
                                                                    }
                                });

                                                                // Post-process currentContainerItems to merge '혼적 Pallet' items by supplier
                                const nonMixedItems = currentContainerItems.filter((it: any) => it.packageType !== '혼적 Pallet');
                                const mixedItems = currentContainerItems.filter((it: any) => it.packageType === '혼적 Pallet');

                                const mixedBySupplier: { [key: string]: any[] } = {};
                                mixedItems.forEach((it: any) => {
                                  const s = it.supplier || 'DEFAULT';
                                  if (!mixedBySupplier[s]) mixedBySupplier[s] = [];
                                  mixedBySupplier[s].push(it);
                                });

                                const mergedMixedItems: any[] = [];
                                Object.keys(mixedBySupplier).forEach((supplierKey: string) => {
                                  const items = mixedBySupplier[supplierKey];
                                  if (items.length === 0) return;

                                  let totalNet = 0;
                                  let totalGross = 0;
                                  let totalQty = 0;
                                  const itemDetails: string[] = [];

                                  items.forEach((it: any) => {
                                    totalNet += Number(it.netWeight) || 0;
                                    totalGross += Number(it.grossWeight) || 0;
                                    totalQty += Number(it.qty) || 0;
                                    
                                    const cleanDesc = (it.description || '').replace(/\s*\([^)]*\)/g, '').trim();
                                    itemDetails.push(`${cleanDesc} (${Number(it.qty).toLocaleString()} EA)`);
                                  });

                                  const first = items[0];
                                  const dimensions = first.dimensions || '1100x1100x1000';
                                  const cbm = first.cbm || '1.210';

                                  mergedMixedItems.push({
                                    pkgNo: String(currentPkgNo),
                                    pkg: '1',
                                    qty: String(totalQty),
                                    description: `[혼적] ${itemDetails.join(' / ')}`,
                                    packageType: '혼적 Pallet',
                                    dimensions: dimensions,
                                    supplier: supplierKey === 'DEFAULT' ? '' : supplierKey,
                                    netWeight: String(Math.round(totalNet)),
                                    grossWeight: String(Math.round(totalGross)),
                                    cbm: cbm
                                  });
                                  currentPkgNo++;
                                });

                                currentContainerItems = [
                                  ...nonMixedItems,
                                  ...mergedMixedItems
                                ];

                                // Allocate items to containers (e.g., maximum 20 CBM per 20FT, 45 CBM per 40FT)
                                // Let's split logically by 컨테이너
                                newContainers.push({
                                  containerNo: `CONTAINER-01`,
                                  sealNo: '',
                                  items: currentContainerItems
                                });

                                setBasicForm(prev => ({ ...prev, packingList: { ...prev.packingList, containers: newContainers } }));
                                alert('🔄 제품별 팔레트 연산결과가 컨테이너에 자동 배정되었습니다.');
                              }}
                              style={{ padding: '6px 12px', background: '#059669', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
                            >
                              ⚡ 팔레트 연산결과 자동 배정
                            </button>
                            <button
                              type="button"
                              disabled={!isEditing}
                              onClick={() => {
                                const newContainers = [...(basicForm.packingList.containers || [])];
                                newContainers.push({
                                  containerNo: `CONTAINER-0${newContainers.length + 1}`,
                                  sealNo: '',
                                  items: []
                                });
                                setBasicForm(prev => ({ ...prev, packingList: { ...prev.packingList, containers: newContainers } }));
                              }}
                              style={{ padding: '6px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold', fontSize: '12px', cursor: isEditing ? 'pointer' : 'not-allowed' }}
                            >
                              + 컨테이너 추가
                            </button>
                          </div>
                        </div>

                        {(basicForm.packingList.containers || []).map((c: any, cIdx: number) => (
                          <div key={cIdx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '16px', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
                              <div style={{ display: 'flex', gap: '12px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b' }}>Container No</span>
                                  <input type="text" disabled={!isEditing} style={{ padding: '5px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', width: '140px' }} value={c.containerNo || ''} onChange={e => {
                                    const val = e.target.value;
                                    const nextContainers = [...basicForm.packingList.containers];
                                    nextContainers[cIdx].containerNo = val;
                                    setBasicForm(prev => ({ ...prev, packingList: { ...prev.packingList, containers: nextContainers } }));
                                  }} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b' }}>Seal No</span>
                                  <input type="text" disabled={!isEditing} style={{ padding: '5px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', width: '140px' }} value={c.sealNo || ''} onChange={e => {
                                    const val = e.target.value;
                                    const nextContainers = [...basicForm.packingList.containers];
                                    nextContainers[cIdx].sealNo = val;
                                    setBasicForm(prev => ({ ...prev, packingList: { ...prev.packingList, containers: nextContainers } }));
                                  }} />
                                </div>
                              </div>

                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                  type="button"
                                  disabled={!isEditing}
                                  onClick={() => {
                                    const nextContainers = [...basicForm.packingList.containers];
                                    nextContainers[cIdx].items.push({
                                      shippingMark: '',
                                      description: '',
                                      pkgNo: '',
                                      pkg: '0',
                                      qty: '0',
                                      netWeight: '0',
                                      grossWeight: '0',
                                      cbm: '0',
                                      packageType: '',
                                      dimensions: ''
                                    });
                                    setBasicForm(prev => ({ ...prev, packingList: { ...prev.packingList, containers: nextContainers } }));
                                  }}
                                  style={{ padding: '4px 10px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '3px', fontWeight: 'bold', fontSize: '11.5px', cursor: isEditing ? 'pointer' : 'not-allowed' }}
                                >
                                  + 직접 품목 추가
                                </button>
                                <button
                                  type="button"
                                  disabled={!isEditing}
                                  onClick={() => {
                                    if (window.confirm('이 컨테이너를 삭제하시겠습니까?')) {
                                      const nextContainers = basicForm.packingList.containers.filter((_: any, idx: number) => idx !== cIdx);
                                      setBasicForm(prev => ({ ...prev, packingList: { ...prev.packingList, containers: nextContainers } }));
                                    }
                                  }}
                                  style={{ padding: '4px 10px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '3px', fontWeight: 'bold', fontSize: '11.5px', cursor: isEditing ? 'pointer' : 'not-allowed' }}
                                >
                                  컨테이너 삭제
                                </button>
                              </div>
                            </div>

                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', background: '#fff' }}>
                              <thead>
                                <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                                  <th style={{ padding: '6px', textAlign: 'center', width: '8%' }}>PKG NO.</th>
                                  <th style={{ padding: '6px', textAlign: 'left', width: '20%' }}>Description of Goods (품명 및 사양)</th>
                                  <th style={{ padding: '6px', textAlign: 'right', width: '8%' }}>수량</th>
                                  <th style={{ padding: '6px', textAlign: 'left', width: '10%' }}>포장형태</th>
                                  <th style={{ padding: '6px', textAlign: 'left', width: '10%' }}>규격 (WxLxH)</th>
                                  <th style={{ padding: '6px', textAlign: 'left', width: '10%' }}>Manufacturer (제조사)</th>
                                  <th style={{ padding: '6px', textAlign: 'right', width: '8%' }}>NET WT (Kg)</th>
                                  <th style={{ padding: '6px', textAlign: 'right', width: '8%' }}>GROSS WT (Kg)</th>
                                  <th style={{ padding: '6px', textAlign: 'right', width: '8%' }}>CBM</th>
                                  <th style={{ padding: '6px', textAlign: 'center', width: '10%' }}>동작</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(c.items || []).map((it: any, itIdx: number) => (
                                  <tr key={itIdx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                    <td style={{ padding: '5px' }}>
                                      <input type="text" placeholder="예: 1-5 또는 1" disabled={!isEditing} style={{ padding: '4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', width: '90%', textAlign: 'center' }} value={it.pkgNo || ''} onChange={e => {
                                        const val = e.target.value;
                                        const nextContainers = [...basicForm.packingList.containers];
                                        nextContainers[cIdx].items[itIdx].pkgNo = val;
                                        nextContainers[cIdx].items[itIdx].pkg = calculatePkgFromPkgNo(val);
                                        setBasicForm(prev => ({ ...prev, packingList: { ...prev.packingList, containers: nextContainers } }));
                                      }} />
                                    </td>
                                    <td style={{ padding: '5px' }}>
                                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                        <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
                                          <input
                                            type="text"
                                            disabled={!isEditing}
                                            placeholder="[상품코드] 상품명 또는 사양 직접 입력"
                                            list={`packing_products_datalist_${cIdx}_${itIdx}`}
                                            style={{ padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', width: '100%', boxSizing: 'border-box' }}
                                            value={it.description || ''}
                                            onChange={e => {
                                              const val = e.target.value;
                                              const nextContainers = [...basicForm.packingList.containers];
                                              nextContainers[cIdx].items[itIdx].description = val;
                                              setBasicForm(prev => ({ ...prev, packingList: { ...prev.packingList, containers: nextContainers } }));
                                            }}
                                          />
                                        </div>
                                        <datalist id={`packing_products_datalist_${cIdx}_${itIdx}`}>
                                          {products.map(p => {
                                            const displayName = p.nameEn || p.nameKo || '';
                                            return (
                                              <option key={p.id} value={`[${p.productCode}] ${displayName}`}>
                                                [{p.productCode}] {displayName}
                                              </option>
                                            );
                                          })}
                                        </datalist>
                                        {(() => {
                                          const match = (it.description || '').match(/^\[(.*?)\]\s*(.*)$/);
                                          const itemCode = match ? match[1] : '-';
                                          const p = products.find(prod => prod.productCode === itemCode || prod.id === itemCode);
                                          return (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                if (p) {
                                                  setEditingProd(p);
                                                  setIsProdModalOpen(true);
                                                } else {
                                                  alert('먼저 등록된 상품 ([상품코드]로 시작하는 형태)을 선택해주세요.');
                                                }
                                              }}
                                              disabled={!p}
                                              title="선택된 상품 수정 및 패킹방법 설정"
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
                                                height: '32px',
                                                width: '32px',
                                                boxSizing: 'border-box',
                                                flexShrink: 0
                                              }}
                                            >
                                              ✏️
                                            </button>
                                          );
                                        })()}
                                      </div>
                                    </td>
                                    <td style={{ padding: '5px' }}>
                                      <input
                                        type="number"
                                        placeholder="수량"
                                        disabled={!isEditing}
                                        style={{ padding: '4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', width: '90%', textAlign: 'right' }}
                                        value={it.qty || ''}
                                        onChange={e => {
                                          const val = e.target.value;
                                          const nextContainers = [...basicForm.packingList.containers];
                                          nextContainers[cIdx].items[itIdx].qty = val;
                                          setBasicForm(prev => ({ ...prev, packingList: { ...prev.packingList, containers: nextContainers } }));
                                        }}
                                      />
                                    </td>
                                    <td style={{ padding: '5px' }}>
                                      {(() => {
                                        const match = (it.description || '').match(/^\[(.*?)\]\s*(.*)$/);
                                        const itemCode = match ? match[1] : '-';
                                        const p = products.find(prod => prod.productCode === itemCode || prod.id === itemCode);
                                        const list = p?.packingMethods || [];
                                        const methods_any: any = list.length > 0 ? list : [{ id: 'default_single', packageType: '단품', name: '단품', unitWidth: p?.unitWidth||0, unitLength: p?.unitLength||0, unitHeight: p?.unitHeight||0 }];
                                        
                                        return (
                                          <select
                                              disabled={!isEditing}
                                              style={{ padding: '4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', width: '98%', outline: 'none' }}
                                              value={it.packageType || ''}
                                              onChange={e => {
                                                const val = e.target.value;
                                                const nextContainers = [...basicForm.packingList.containers];
                                                nextContainers[cIdx].items[itIdx].packageType = val;
                                                
                                                // Auto-fill dimensions when selecting package type
                                                const matchedMethod = methods_any.find((m: any) => m.packageType === val);
                                                if (matchedMethod) {
                                                  const isPlt = val.toLowerCase().includes('pallet');
                                                  const w = isPlt ? (matchedMethod.palletWidth || 0) : (matchedMethod.unitWidth || 0);
                                                  const l = isPlt ? (matchedMethod.palletLength || 0) : (matchedMethod.unitLength || 0);
                                                  const h = isPlt ? (matchedMethod.palletHeight || 0) : (matchedMethod.unitHeight || 0);
                                                  nextContainers[cIdx].items[itIdx].dimensions = `${w}x${l}x${h}`;
                                                } else if (val === '혼적 Pallet') {
                                                  nextContainers[cIdx].items[itIdx].dimensions = '1100x1100x1000';
                                                }
                                                
                                                setBasicForm(prev => ({ ...prev, packingList: { ...prev.packingList, containers: nextContainers } }));
                                              }}
                                            >
                                              <option value="">-- 선택 --</option>
                                              {(() => {
                                                const pTypeOptions = Array.from(new Set([
                                                  ...methods_any.map((m: any) => m.packageType),
                                                  '단품 박스',
                                                  '혼적 Pallet'
                                                ].filter(Boolean)));
                                                if (it.packageType && !pTypeOptions.includes(it.packageType)) {
                                                  pTypeOptions.push(it.packageType);
                                                }
                                                return pTypeOptions.map((pType: any) => (
                                                  <option key={pType} value={pType}>{pType}</option>
                                                ));
                                              })()}
                                            </select>
                                        );
                                      })()}
                                    </td>
                                    <td style={{ padding: '5px' }}>
                                      {(() => {
                                        
                                        const cleanDims = (it.dimensions || '0x0x0').toLowerCase().replace(/\s+/g, '');
                                        const dims = cleanDims.split('x');
                                        const width = dims[0] || '';
                                        const length = dims[1] || '';
                                        const height = dims[2] || '';

                                        return (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                            <input 
                                              type="number"
                                              placeholder="가로"
                                              disabled={!isEditing}
                                              value={width}
                                              style={{ width: '42px', padding: '4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', textAlign: 'center', outline: 'none' }}
                                              onChange={e => {
                                                const w = e.target.value;
                                                const nextContainers = [...basicForm.packingList.containers];
                                                nextContainers[cIdx].items[itIdx].dimensions = `${w || '0'}x${length || '0'}x${height || '0'}`;
                                                setBasicForm(prev => ({ ...prev, packingList: { ...prev.packingList, containers: nextContainers } }));
                                              }}
                                            />
                                            <span style={{ fontSize: '10px', color: '#94a3b8' }}>×</span>
                                            <input 
                                              type="number"
                                              placeholder="세로"
                                              disabled={!isEditing}
                                              value={length}
                                              style={{ width: '42px', padding: '4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', textAlign: 'center', outline: 'none' }}
                                              onChange={e => {
                                                const l = e.target.value;
                                                const nextContainers = [...basicForm.packingList.containers];
                                                nextContainers[cIdx].items[itIdx].dimensions = `${width || '0'}x${l || '0'}x${height || '0'}`;
                                                setBasicForm(prev => ({ ...prev, packingList: { ...prev.packingList, containers: nextContainers } }));
                                              }}
                                            />
                                            <span style={{ fontSize: '10px', color: '#94a3b8' }}>×</span>
                                            <input 
                                              type="number"
                                              placeholder="높이"
                                              disabled={!isEditing}
                                              value={height}
                                              style={{ width: '42px', padding: '4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', textAlign: 'center', outline: 'none' }}
                                              onChange={e => {
                                                const h = e.target.value;
                                                const nextContainers = [...basicForm.packingList.containers];
                                                nextContainers[cIdx].items[itIdx].dimensions = `${width || '0'}x${length || '0'}x${h || '0'}`;
                                                setBasicForm(prev => ({ ...prev, packingList: { ...prev.packingList, containers: nextContainers } }));
                                              }}
                                            />
                                          </div>
                                        );
                                      })()}
                                    </td>
                                    <td style={{ padding: '5px' }}>
                                      <input type="text" disabled={!isEditing} style={{ padding: '4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', width: '98%' }} value={it.supplier || ''} onChange={e => {
                                        const val = e.target.value;
                                        const nextContainers = [...basicForm.packingList.containers];
                                        nextContainers[cIdx].items[itIdx].supplier = val;
                                        setBasicForm(prev => ({ ...prev, packingList: { ...prev.packingList, containers: nextContainers } }));
                                      }} />
                                    </td>
                                    <td style={{ padding: '5px' }}>
                                      <input type="number" disabled={!isEditing} style={{ padding: '4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', width: '90%', textAlign: 'right' }} value={it.netWeight || ''} onChange={e => {
                                        const val = e.target.value;
                                        const nextContainers = [...basicForm.packingList.containers];
                                        nextContainers[cIdx].items[itIdx].netWeight = val;
                                        setBasicForm(prev => ({ ...prev, packingList: { ...prev.packingList, containers: nextContainers } }));
                                      }} />
                                    </td>
                                    <td style={{ padding: '5px' }}>
                                      <input type="number" disabled={!isEditing} style={{ padding: '4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', width: '90%', textAlign: 'right' }} value={it.grossWeight || ''} onChange={e => {
                                        const val = e.target.value;
                                        const nextContainers = [...basicForm.packingList.containers];
                                        nextContainers[cIdx].items[itIdx].grossWeight = val;
                                        setBasicForm(prev => ({ ...prev, packingList: { ...prev.packingList, containers: nextContainers } }));
                                      }} />
                                    </td>
                                    <td style={{ padding: '5px' }}>
                                      <input
                                        type="text"
                                        step="0.01"
                                        disabled={!isEditing}
                                        placeholder="예: =1.1*1.2*1.3"
                                        value={it.cbm || ''}
                                        onChange={e => {
                                          const val = e.target.value;
                                          const nextContainers = [...basicForm.packingList.containers];
                                          nextContainers[cIdx].items[itIdx].cbm = val;
                                          setBasicForm(prev => ({ ...prev, packingList: { ...prev.packingList, containers: nextContainers } }));
                                        }}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') {
                                            const raw = (e.target as HTMLInputElement).value;
                                            if (raw.startsWith('=')) {
                                              try {
                                                const expr = raw.slice(1).replace(/[^0-9+\-*/().]/g, '');
                                                // eslint-disable-next-line no-new-func
                                                const result = Function('"use strict"; return (' + expr + ')')();
                                                if (typeof result === 'number' && isFinite(result)) {
                                                  const rounded = parseFloat(result.toFixed(4));
                                                  const nextContainers = [...basicForm.packingList.containers];
                                                  nextContainers[cIdx].items[itIdx].cbm = rounded;
                                                  setBasicForm(prev => ({ ...prev, packingList: { ...prev.packingList, containers: nextContainers } }));
                                                }
                                              } catch {}
                                            }
                                          }
                                        }}
                                        onBlur={e => {
                                          const raw = e.target.value;
                                          if (raw.startsWith('=')) {
                                            try {
                                              const expr = raw.slice(1).replace(/[^0-9+\-*/().]/g, '');
                                              // eslint-disable-next-line no-new-func
                                              const result = Function('"use strict"; return (' + expr + ')')();
                                              if (typeof result === 'number' && isFinite(result)) {
                                                const rounded = parseFloat(result.toFixed(4));
                                                const nextContainers = [...basicForm.packingList.containers];
                                                nextContainers[cIdx].items[itIdx].cbm = rounded;
                                                setBasicForm(prev => ({ ...prev, packingList: { ...prev.packingList, containers: nextContainers } }));
                                              }
                                            } catch {}
                                          }
                                        }}
                                        style={{ padding: '4px', border: `1px solid ${String(it.cbm||'').startsWith('=') ? '#f59e0b' : '#cbd5e1'}`, borderRadius: '4px', fontSize: '11.5px', width: '90%', textAlign: 'right' }}
                                      />
                                    </td>
                                    <td style={{ padding: '5px', textAlign: 'center', display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                      <button
                                        type="button"
                                        disabled={!isEditing}
                                        onClick={() => {
                                          const nextContainers = [...basicForm.packingList.containers];
                                          const copiedItem = { ...nextContainers[cIdx].items[itIdx] };
                                          nextContainers[cIdx].items.splice(itIdx + 1, 0, copiedItem);
                                          setBasicForm(prev => ({ ...prev, packingList: { ...prev.packingList, containers: nextContainers } }));
                                        }}
                                        style={{ padding: '2px 6px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '3px', cursor: isEditing ? 'pointer' : 'not-allowed', fontSize: '10.5px' }}
                                      >
                                        복사
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!isEditing}
                                        onClick={() => {
                                          const nextContainers = [...basicForm.packingList.containers];
                                          nextContainers[cIdx].items = nextContainers[cIdx].items.filter((_: any, idx: number) => idx !== itIdx);
                                          setBasicForm(prev => ({ ...prev, packingList: { ...prev.packingList, containers: nextContainers } }));
                                        }}
                                        style={{ padding: '2px 6px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '3px', cursor: isEditing ? 'pointer' : 'not-allowed', fontSize: '10.5px' }}
                                      >
                                        삭제
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                                {c.items?.length === 0 && (
                                  <tr>
                                    <td colSpan={8} style={{ padding: '12px', textAlign: 'center', color: '#94a3b8' }}>
                                      등록된 품목이 없습니다. 우측 상단의 '+ 품목 행 추가'를 눌러 등록하세요.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        ))}
                      </div>

                      {/* Step 3. 3D적재 시뮬레이션 연동 */}
                      <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', boxShadow: '0 4px 6px rgba(0,0,0,0.01)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                          <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: 800, color: '#0369a1', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            🚚 Step 3. 3D적재 시뮬레이션 연동
                          </h4>
                        </div>
                        <p style={{ margin: '0 0 14px 0', fontSize: '11.5px', color: '#64748b', lineHeight: 1.4 }}>
                          Step 2에서 배정 완료된 패킹리스트 아이템들을 3D 적재 시뮬레이션 프로그램으로 연동하여 최적의 적재율을 검증하고, 배치 결과를 패킹리스트에 가져올 수 있습니다.
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
                          <button
                            type="button"
                            onClick={() => {
                              const itemsPayload: any[] = [];
                              if (basicForm.packingList?.containers) {
                                basicForm.packingList.containers.forEach((c: any) => {
                                  (c.items || []).forEach((it: any) => {
                                    if (!it.description && !it.pkgNo) return;
                                    const cleanDims = String(it.dimensions || '1100x1100x1000').toLowerCase().replace(/\s+/g, '');
                                    const dims = cleanDims.split('x');
                                    const w = Number(dims[0]) || 1100;
                                    const d = Number(dims[1]) || 1100;
                                    const h = Number(dims[2]) || 1000;
                                    
                                    itemsPayload.push({
                                      desc: it.description || '화물',
                                      qty: Number(it.pkg) || 1,
                                      w: w,
                                      d: d,
                                      h: h,
                                      netWeight: Number(it.netWeight) || 0,
                                      grossWeight: Number(it.grossWeight) || 0,
                                      packageType: it.packageType || 'Pallet'
                                    });
                                  });
                                });
                              }
                              
                              if (itemsPayload.length === 0) {
                                orderItems.forEach((item: any) => {
                                  const match = (item.name || '').match(/^\[(.*?)\]\s*(.*)$/);
                                  const itemCode = match ? match[1] : '-';
                                  const matchedProd = products.find(p => p.productCode === itemCode || p.id === itemCode || p.id === item.itemId);
                                  const list = matchedProd?.packingMethods || [];
                                  const isPlt = (item.packageType || '').toLowerCase().includes('pallet');
                                  const w = Number(isPlt ? (list[0]?.palletWidth || matchedProd?.palletWidth) : matchedProd?.unitWidth) || 1100;
                                  const d = Number(isPlt ? (list[0]?.palletLength || matchedProd?.palletLength) : matchedProd?.unitLength) || 1100;
                                  const h = Number(isPlt ? (list[0]?.palletHeight || matchedProd?.palletHeight) : matchedProd?.unitHeight) || 1000;
                                  
                                  itemsPayload.push({
                                    desc: item.name || '화물',
                                    qty: item.qty || 1,
                                    w: w,
                                    d: d,
                                    h: h,
                                    netWeight: Number(item.netWeight || matchedProd?.palletWeight || 0),
                                    grossWeight: Number(item.grossWeight || matchedProd?.palletGrossWeight || 0),
                                    packageType: item.packageType || 'Pallet'
                                  });
                                });
                              }

                              const containersPayload: Record<string, number> = {};
                              if (basicForm.packingList?.containers) {
                                basicForm.packingList.containers.forEach((c: any) => {
                                  const type = c.containerType || '20GP';
                                  containersPayload[type] = (containersPayload[type] || 0) + 1;
                                });
                              }
                              if (Object.keys(containersPayload).length === 0) {
                                containersPayload['20GP'] = 1;
                              }

                              const payload = {
                                type: 'LOAD_PI_DATA',
                                customer: basicForm.customer || '',
                                piNumber: basicForm.piNumber || order?.id || '',
                                date: basicForm.etd || new Date().toISOString().split('T')[0],
                                containers: containersPayload,
                                items: itemsPayload
                              };

                              try {
                                localStorage.setItem('PI_SIMULATION_DATA', JSON.stringify(payload));
                              } catch (err) {
                                console.error('Failed to save simulation data to localStorage:', err);
                              }
                              setIsPackerModalOpen(true);
                            }}
                            style={{
                              padding: '10px 24px',
                              background: '#0284c7',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '6px',
                              fontWeight: 'bold',
                              fontSize: '13px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              boxShadow: '0 4px 6px -1px rgba(2, 132, 199, 0.2)'
                            }}
                          >
                            🚢 3D적재 시뮬레이션 연동 및 적재 검토 실행
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 4) 도착보고 및 쉬핑마크 탭 */}
              {activeSourcingTab === '도착보고_쉬핑마크' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 800, color: '#1e3a8a' }}>🚚 2) 도착보고 작성 및 쉬핑마크 (제조사별 상세 정보 및 패킹리스트 연동)</h4>
                    <div style={{ fontSize: '12.5px', color: '#4b5563' }}>
                      도착보고 상세내역(패킹 및 화물정보)을 제조사별로 아래 테이블에서 즉시 수정하고 인쇄/PDF 저장 또는 이메일 발송이 가능합니다. (공통 정보는 패킹리스트의 마스터 데이터를 사용하며, 각 제조사별 패킹리스트 아이템이 실시간 연동됩니다.)
                    </div>
                  </div>

                  {allOrderSuppliers.length === 0 ? (
                    <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                      등록된 제조사(공급업체) 정보가 없습니다.
                    </div>
                  ) : (
                    allOrderSuppliers.map(supplierName => {
                      const items = groupedSupplierItems[supplierName] || [];
                      const cleanSupplierName = supplierName.replace(/\s+/g, '');
                      const supplierCode = cleanSupplierName.substring(0, 3).toUpperCase();
                      const poNum = `${getFormattedPoId(order.id, order.issuingCompany)}-${supplierCode}`;

                      // Fetch/Initialize arrival report state for this supplier in the order doc
                      const repData = (order.supplierArrivalReports || {})[supplierName] || {};
                      
                      // Auto-pull items from the master packing list if not edited yet
                      let packingItemsList = repData.packingItems || [];

                      // Clean up existing/loaded packing items
                      if (packingItemsList.length > 0) {
                        let mutated = false;
                        const nextList = packingItemsList.map((it: any) => {
                          let desc = it.descOfGoods || '';
                          if (/\((완제|자투리|혼적|독립|단품)[^)]*\)/.test(desc) || (it.qty && !desc.includes(String(it.qty)))) {
                            desc = desc.replace(/\s*\([^)]*(Pallet|적재|대상|단품|혼적)[^)]*\)/g, '').trim();
                            
                            let matchedQty = '';
                            if (basicForm.packingList?.containers) {
                              for (const container of basicForm.packingList.containers) {
                                const found = (container.items || []).find((cIt: any) => 
                                  desc.includes(cIt.itemCode || '') || (cIt.itemName && desc.includes(cIt.itemName))
                                );
                                if (found && found.qty) {
                                  matchedQty = found.qty;
                                  break;
                                }
                              }
                            }
                            
                            const actualQty = matchedQty || '';
                            if (actualQty && !desc.includes(String(actualQty))) {
                              desc = `${desc} ${actualQty} EA`.replace(/\s+/g, ' ');
                            }
                            
                            if (desc !== it.descOfGoods) {
                              mutated = true;
                              return { ...it, descOfGoods: desc };
                            }
                          }
                          return it;
                        });
                        if (mutated) {
                          packingItemsList = nextList;
                        }
                      }

                      if (packingItemsList.length === 0 && basicForm.packingList?.containers) {
                        let matchingItems: any[] = [];
                        basicForm.packingList.containers.forEach((container: any) => {
                          const itemsForSupplier = (container.items || []).filter((it: any) => 
                            (it.supplier || '').trim().toLowerCase() === supplierName.trim().toLowerCase()
                          );
                          matchingItems = [...matchingItems, ...itemsForSupplier];
                        });

                        const totalCount = matchingItems.length;
                        matchingItems.forEach((it: any, idx: number) => {
                          let desc = it.description || '';
                          desc = desc.replace(/\s*\([^)]*(Pallet|적재|대상|단품|혼적)[^)]*\)/g, '').trim();
                          
                          if (it.qty && !desc.includes(String(it.qty))) {
                            desc = `${desc} ${it.qty} EA`.replace(/\s+/g, ' ');
                          }

                          packingItemsList.push({
                            marks: getDefaultShippingMark(String(idx + 1), String(totalCount)),
                            descOfGoods: desc,
                            qty: Number(it.pkg) || 0,
                            packageType: 'PL',
                            netWeight: Number(it.netWeight) || 0,
                            grossWeight: Number(it.grossWeight) || 0,
                            measurement: it.cbm ? `${it.cbm} CBM` : ''
                          });
                        });
                      }

                                  // If still empty, default to item descriptions
                                  if (packingItemsList.length === 0) {
                                    const itemDesc = items.map(it => `P#${order.custPo || '1'}. ${it.name}`).join(' / ');
                                    const totalQty = items.reduce((sum, it) => sum + (it.qty || 0), 0);
                                    packingItemsList = [{
                                      marks: getDefaultShippingMark(),
                                      descOfGoods: itemDesc || '',
                                      qty: totalQty || 1,
                                      packageType: 'PL',
                                      netWeight: 0,
                                      grossWeight: 0,
                                      measurement: ''
                                    }];
                                  }


                      const updateArrivalReportItem = (itemIdx: number, field: string, val: any) => {
                        const nextItems = [...packingItemsList];
                        nextItems[itemIdx] = { ...nextItems[itemIdx], [field]: val };
                        
                        // Update order.supplierArrivalReports state
                        const updatedReports = {
                          ...(order.supplierArrivalReports || {}),
                          [supplierName]: {
                            ...repData,
                            packingItems: nextItems
                          }
                        };
                        setOrder(prev => prev ? { ...prev, supplierArrivalReports: updatedReports } : prev);
                      };

                      const addArrivalReportItemRow = () => {
                        const nextItems = [...packingItemsList, {
                          marks: getDefaultShippingMark(),
                          descOfGoods: '',
                          qty: 1,
                          packageType: 'PL',
                          netWeight: 0,
                          grossWeight: 0,
                          measurement: ''
                        }];
                        const updatedReports = {
                          ...(order.supplierArrivalReports || {}),
                          [supplierName]: {
                            ...repData,
                            packingItems: nextItems
                          }
                        };
                        setOrder(prev => prev ? { ...prev, supplierArrivalReports: updatedReports } : prev);
                      };

                      const removeArrivalReportItemRow = (itemIdx: number) => {
                        if (packingItemsList.length <= 1) return;
                        const nextItems = packingItemsList.filter((_, idx) => idx !== itemIdx);
                        const updatedReports = {
                          ...(order.supplierArrivalReports || {}),
                          [supplierName]: {
                            ...repData,
                            packingItems: nextItems
                          }
                        };
                        setOrder(prev => prev ? { ...prev, supplierArrivalReports: updatedReports } : prev);
                      };

                      const handleSaveArrivalReportInline = async () => {
                        try {
                          await handleSaveBasic(false);
                          const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
                          await setDoc(orderRef, { 
                            supplierArrivalReports: order.supplierArrivalReports || {}, 
                            updatedAt: serverTimestamp() 
                          }, { merge: true });
                          alert(`✅ ${supplierName} 도착보고서가 정상 저장되었습니다.`);
                        } catch (err: any) {
                          alert("❌ 도착보고 저장 실패: " + err.message);
                        }
                      };

                      const handlePrintArrivalReportInline = async () => {
                        // Open window synchronously to avoid popup blocker
                        const win = window.open('', '_blank', 'width=900,height=800,resizable=yes,scrollbars=yes');
                        if (win) {
                          win.document.write("<html><body><div style='text-align:center; padding: 50px; font-family: sans-serif;'>데이터를 불러오는 중입니다...</div></body></html>");
                        }

                        try {
                          await handleSaveBasic(false);
                        } catch (err) {
                          console.error("Auto-save before print failed:", err);
                        }

                        const isYS = order.issuingCompany === 'YS';
                        let defaultConsignee = isYS 
                          ? `영성에이씨씨(YS ACC)\n경기 김포시 양촌읍 듬박로 89\nTEL: 010-4494-1028\n담당자: 김주한` 
                          : `(주)와이에스에이씨씨(YSACC CO., LTD.)\n서울 강남구 테헤란로 419, 16층\nTEL: 010-4494-1028\n담당자: 김주한`;

                        try {
                          const compDoc = await getDoc(doc(db, "companies", "YSACC", "my_companies", isYS ? "YS" : "YSACC"));
                          if (compDoc.exists()) {
                            const data = compDoc.data();
                            const compName = data.nameKo || data.name || (isYS ? '영성에이씨씨(YS ACC)' : '(주)와이에스에이씨씨(YSACC CO., LTD.)');
                            const address = data.addressKo || (isYS ? '경기 김포시 양촌읍 듬박로 89' : '서울 강남구 테헤란로 419, 16층');
                            const phone = data.phone || '010-4494-1028';
                            const manager = data.manager || '김주한';
                            defaultConsignee = `${compName}\n${address}\nTEL: ${phone}\n담당자: ${manager}`;
                          }
                        } catch (e) {
                          console.error("Failed to load company info", e);
                        }

                        let finalConsignee = repData.consignee || defaultConsignee;
                        if (finalConsignee.includes('서울 강남구 테헤란로 419') || finalConsignee.includes('경기 김포시 양촌읍 듬박로 89')) {
                          finalConsignee = defaultConsignee;
                        }

                        let finalCfsAddress = basicForm.cfsContactInfo || basicForm.cfsAddress || '';
                        if (repData.cfsAddress && repData.cfsAddress !== 'CMK LOGISTICS / 김경태 주임 / T.055-543-7200\n경남 창원시 진해구 신항8로 13') {
                           finalCfsAddress = repData.cfsAddress;
                        }
                        // Always prefer basicForm.cfsContactInfo if it's explicitly set for this order, 
                        // because user requested to use CFS Contact Info.
                        if (basicForm.cfsContactInfo) {
                           finalCfsAddress = basicForm.cfsContactInfo;
                        }
                        if (!finalCfsAddress) {
                           finalCfsAddress = 'CMK LOGISTICS / 김경태 주임 / T.055-543-7200\n경남 창원시 진해구 신항8로 13';
                        }

                        const rep = {
                          bookingNo: basicForm.vesselBooking || '',
                          remarks: 'ORIGIN : MADE IN KOREA\n입고일: 연도-월-일 오전 10시까지',
                          notifyParty: 'SAME AS ABOVE',
                          ...repData,
                          portOfLoading: basicForm.portOfLoading || repData.portOfLoading || 'BUSAN PORT, SOUTH KOREA',
                          finalDestination: basicForm.portOfDischarge || repData.finalDestination || '',
                          carrier: basicForm.vesselBooking || repData.carrier || '',
                          sailingOnOrAbout: basicForm.etd || repData.sailingOnOrAbout || '',
                          cfsEta: basicForm.cfsEntryDate || repData.cfsEta || '',
                          consignee: finalConsignee,
                          cfsAddress: finalCfsAddress,
                          packingItems: packingItemsList
                        };

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
                                .header-container { display: grid; grid-template-columns: 2fr 1fr; border-bottom: 3px double #000; padding-bottom: 8px; margin-bottom: 15px; align-items: end; }
                                .title-korean { font-size: 28px; font-weight: 900; letter-spacing: 0.1em; color: #000; }
                                .info-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
                                .info-table td { border: 1px solid #000; padding: 5px 8px; font-size: 11px; vertical-align: top; }
                                .desc-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                                .desc-table th, .desc-table td { border: 1px solid #000; padding: 6px; font-size: 11px; vertical-align: middle; }
                                .desc-table th { background: #f8fafc; font-weight: bold; text-align: center; }
                                .desc-table td.right { text-align: right; }
                                .desc-table td.center { text-align: center; }
                                .total-row td { background: #f1f5f9; font-weight: bold; border-top: 2px double #000; }
                              </style>
                            </head>
                            <body>
                              <button class="no-print" onclick="window.print()">인쇄 / PDF 저장</button>
                              <div class="header-container">
                                <div class="title-korean">도착 보고서 (Arrival Report)</div>
                                <div style="text-align: right; font-size: 11px; font-weight: bold; line-height: 1.5;">
                                  <strong>Doc No:</strong> ${poNum}<br/>
                                  <strong>Date:</strong> ${new Date().toISOString().split('T')[0]}
                                </div>
                              </div>

                              <table class="info-table">
                                <tr>
                                  <td style="width: 50%;">
                                    <strong>1) Shipper</strong><br/>
                                    ${(rep.shipper || supplierName).replace(/\n/g, '<br/>')}<br/>
                                    ${items[0]?.supplierContact || ''}
                                  </td>
                                  <td style="width: 50%;">
                                    <strong>8) Booking No.</strong><br/>
                                    <span style="font-size: 13px; font-weight: bold; color: #1e3a8a;">${rep.bookingNo || '-'}</span>
                                  </td>
                                </tr>
                                <tr>
                                  <td>
                                    <strong>2) Consignee</strong><br/>
                                    ${rep.consignee.replace(/\n/g, '<br/>')}
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
                                    <th style="width: 25%">10) Marks</th>
                                    <th style="width: 25%">11) Description of Goods</th>
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
                                        ${renderShippingMarkCellHtml(it.marks)}
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

                        if (win) {
                          win.document.open();
                          win.document.write(printHtml);
                          win.document.close();
                        }
                      };

                      const handleIssueAndSaveArrivalReport = async () => {
                        try {
                          await handleSaveBasic(false);
                        } catch (err) {
                          console.error("Auto-save before issue failed:", err);
                        }
                        const isYS = order.issuingCompany === 'YS';
                        let defaultConsignee = isYS 
                          ? `영성에이씨씨(YS ACC)\n경기 김포시 양촌읍 듬박로 89\nTEL: 010-4494-1028\n담당자: 김주한` 
                          : `(주)와이에스에이씨씨(YSACC CO., LTD.)\n서울 강남구 테헤란로 419, 16층\nTEL: 010-4494-1028\n담당자: 김주한`;

                        try {
                          const compDoc = await getDoc(doc(db, "companies", "YSACC", "my_companies", isYS ? "YS" : "YSACC"));
                          if (compDoc.exists()) {
                            const data = compDoc.data();
                            const compName = data.nameKo || data.name || (isYS ? '영성에이씨씨(YS ACC)' : '(주)와이에스에이씨씨(YSACC CO., LTD.)');
                            const address = data.addressKo || (isYS ? '경기 김포시 양촌읍 듬박로 89' : '서울 강남구 테헤란로 419, 16층');
                            const phone = data.phone || '010-4494-1028';
                            const manager = data.manager || '김주한';
                            defaultConsignee = `${compName}\n${address}\nTEL: ${phone}\n담당자: ${manager}`;
                          }
                        } catch (e) {
                          console.error("Failed to load company info", e);
                        }

                        let finalConsignee = repData.consignee || defaultConsignee;
                        if (finalConsignee.includes('서울 강남구 테헤란로 419') || finalConsignee.includes('경기 김포시 양촌읍 듬박로 89')) {
                          finalConsignee = defaultConsignee;
                        }

                        let finalCfsAddress = basicForm.cfsContactInfo || basicForm.cfsAddress || '';
                        if (repData.cfsAddress && repData.cfsAddress !== 'CMK LOGISTICS / 김경태 주임 / T.055-543-7200\n경남 창원시 진해구 신항8로 13') {
                           finalCfsAddress = repData.cfsAddress;
                        }
                        if (basicForm.cfsContactInfo) {
                           finalCfsAddress = basicForm.cfsContactInfo;
                        }
                        if (!finalCfsAddress) {
                           finalCfsAddress = 'CMK LOGISTICS / 김경태 주임 / T.055-543-7200\n경남 창원시 진해구 신항8로 13';
                        }

                        const rep = {
                          bookingNo: basicForm.vesselBooking || '',
                          remarks: 'ORIGIN : MADE IN KOREA\n입고일: 연도-월-일 오전 10시까지',
                          notifyParty: 'SAME AS ABOVE',
                          ...repData,
                          portOfLoading: basicForm.portOfLoading || repData.portOfLoading || 'BUSAN PORT, SOUTH KOREA',
                          finalDestination: basicForm.portOfDischarge || repData.finalDestination || '',
                          carrier: basicForm.vesselBooking || repData.carrier || '',
                          sailingOnOrAbout: basicForm.etd || repData.sailingOnOrAbout || '',
                          cfsEta: basicForm.cfsEntryDate || repData.cfsEta || '',
                          consignee: finalConsignee,
                          cfsAddress: finalCfsAddress,
                          packingItems: packingItemsList
                        };

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
                                .no-print { display: none !important; }
                                .header-container { display: grid; grid-template-columns: 2fr 1fr; border-bottom: 3px double #000; padding-bottom: 8px; margin-bottom: 15px; align-items: end; }
                                .title-korean { font-size: 28px; font-weight: 900; letter-spacing: 0.1em; color: #000; }
                                .info-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
                                .info-table td { border: 1px solid #000; padding: 5px 8px; font-size: 11px; vertical-align: top; }
                                .desc-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                                .desc-table th, .desc-table td { border: 1px solid #000; padding: 6px; font-size: 11px; vertical-align: middle; }
                                .desc-table th { background: #f8fafc; font-weight: bold; text-align: center; }
                                .desc-table td.right { text-align: right; }
                                .desc-table td.center { text-align: center; }
                                .total-row td { background: #f1f5f9; font-weight: bold; border-top: 2px double #000; }
                              </style>
                            </head>
                            <body>
                              <div class="header-container">
                                <div class="title-korean">도착 보고서 (Arrival Report)</div>
                                <div style="text-align: right; font-size: 11px; font-weight: bold; line-height: 1.5;">
                                  <strong>Doc No:</strong> ${poNum}<br/>
                                  <strong>Date:</strong> ${new Date().toISOString().split('T')[0]}
                                </div>
                              </div>

                              <table class="info-table">
                                <tr>
                                  <td style="width: 50%;">
                                    <strong>1) Shipper</strong><br/>
                                    ${(rep.shipper || supplierName).replace(/\n/g, '<br/>')}<br/>
                                    ${items[0]?.supplierContact || ''}
                                  </td>
                                  <td style="width: 50%;">
                                    <strong>8) Booking No.</strong><br/>
                                    <span style="font-size: 13px; font-weight: bold; color: #1e3a8a;">${rep.bookingNo || '-'}</span>
                                  </td>
                                </tr>
                                <tr>
                                  <td>
                                    <strong>2) Consignee</strong><br/>
                                    ${rep.consignee.replace(/\n/g, '<br/>')}
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
                                    <th style="width: 25%">10) Marks</th>
                                    <th style="width: 25%">11) Description of Goods</th>
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
                                        ${renderShippingMarkCellHtml(it.marks)}
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

                        const confirmed = window.confirm(`도착보고서를 발행 및 클라우드(문서함)에 저장하시겠습니까?\n\nPO번호: ${poNum}\n거래처: ${supplierName}`);
                        if (!confirmed) return;

                        try {
                          const iframe = document.createElement('iframe');
                          iframe.style.position = 'fixed';
                          iframe.style.top = '0';
                          iframe.style.left = '0';
                          iframe.style.width = '820px';
                          iframe.style.height = '1200px';
                          iframe.style.border = '0';
                          iframe.style.zIndex = '-9999';
                          iframe.style.visibility = 'hidden';
                          document.body.appendChild(iframe);

                          const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument;
                          if (!iframeDoc) throw new Error('Failed to access sandbox iframe context');

                          iframeDoc.open();
                          iframeDoc.write(printHtml);
                          iframeDoc.close();

                          await new Promise(resolve => setTimeout(resolve, 800));

                          const printBody = iframeDoc.body;
                          const canvas = await html2canvas(printBody, {
                            scale: 2,
                            useCORS: true,
                            allowTaint: true,
                            logging: false,
                            width: 800,
                            height: printBody.scrollHeight,
                            windowWidth: 800,
                            windowHeight: printBody.scrollHeight
                          });

                          document.body.removeChild(iframe);

                          const imgData = canvas.toDataURL('image/jpeg', 0.95);
                          const pdf = new jsPDF({
                            orientation: 'p',
                            unit: 'pt',
                            format: 'a4'
                          });

                          const imgWidth = 595.28;
                          const pageHeight = 841.89;
                          const imgHeight = (canvas.height * imgWidth) / canvas.width;
                          let heightLeft = imgHeight;
                          let position = 0;

                          pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
                          heightLeft -= pageHeight;

                          let pageCount = 1;
                          while (heightLeft >= 100) {
                            position = - (pageHeight * pageCount);
                            pdf.addPage();
                            pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
                            heightLeft -= pageHeight;
                            pageCount++;
                          }

                          const pdfBlob = pdf.output('blob');

                          const currentIssuedDocs = (order as any)?.po_issued_documents || [];
                          const version = currentIssuedDocs.filter((d: any) => d.po_number === poNum && d.fileName.startsWith('도착보고서')).length + 1;
                          const safeFileName = `도착보고서_${poNum.replace(/[^a-zA-Z0-9가-힣_-]/g, '_')}_v${version}.pdf`;
                          const storageRef = ref(storage, `companies/${COMPANY_ID}/orders/${order?.id}/po_issued_docs/${safeFileName}`);

                          const snapshot = await uploadBytesResumable(storageRef, pdfBlob, { contentType: 'application/pdf' });
                          const downloadURL = await getDownloadURL(snapshot.ref);

                          const newDoc = {
                            id: new Date().getTime().toString(),
                            po_number: poNum,
                            supplier_name: supplierName,
                            version: version,
                            fileName: safeFileName,
                            fileUrl: downloadURL,
                            issuedAt: new Date().toISOString(),
                            issuedBy: auth.currentUser?.displayName || 'System',
                            totalAmount: 0,
                            status: 'active'
                          };

                          const updatedDocs = currentIssuedDocs.map((doc: any) => {
                            if (doc.po_number === poNum && doc.fileName.startsWith('도착보고서')) {
                              return { ...doc, status: 'superseded' };
                            }
                            return doc;
                          });
                          updatedDocs.push(newDoc);

                          const currentLogs = (order as any).history_logs || [];
                          const newLog = {
                            timestamp: new Date().toISOString(),
                            actionType: 'arrival_report_issue',
                            user: auth.currentUser?.displayName || auth.currentUser?.email || 'System',
                            description: `공급업체 "${supplierName}" 도착보고서 발행완료 (버전 v${version}, 파일명: ${safeFileName})`
                          };
                          const nextHistoryLogs = [newLog, ...currentLogs];

                          const docRef = doc(db, 'companies', COMPANY_ID, 'orders', order?.id!);
                          await updateDoc(docRef, {
                            po_issued_documents: updatedDocs,
                            history_logs: nextHistoryLogs
                          });

                          alert('✅ 도착보고서가 성공적으로 발행 및 클라우드에 저장되었습니다.');
                          setIssuedDocs(updatedDocs);

                        } catch (err: any) {
                          console.error(err);
                          alert('도착보고서 발행 중 오류가 발생했습니다: ' + err.message);
                        }
                      };

                      const handleIssueAndSaveShippingMarks = async () => {
                        try {
                          await handleSaveBasic(false);
                        } catch (err) {
                          console.error("Auto-save before marks issue failed:", err);
                        }
                        const shapeVal = commonShippingMark.shape;
                        const compVal = commonShippingMark.company;
                        const portVal = commonShippingMark.port;
                        const countryVal = commonShippingMark.country;
                        const originVal = commonShippingMark.origin;
                        const startVal = 1;
                        const totalVal = packingItemsList.length;

                        const getLargeShippingMarkShapeSvg = (shape: string, company: string) => {
                          const compEscaped = (company || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                          const strokeColor = '#3b82f6'; // Clean blue color
                          if (shape === 'circle') {
                            return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 350" style="height: 100%; width: auto; max-width: 100%;"><circle cx="225" cy="175" r="140" stroke="${strokeColor}" stroke-width="14" fill="none" /><text x="50%" y="54%" font-size="70" font-weight="900" text-anchor="middle" dominant-baseline="middle" fill="black">${compEscaped}</text></svg>`;
                          } else if (shape === 'square') {
                            return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 300" style="height: 100%; width: auto; max-width: 100%;"><rect x="20" y="20" width="410" height="260" stroke="${strokeColor}" stroke-width="14" fill="none" /><text x="50%" y="54%" font-size="70" font-weight="900" text-anchor="middle" dominant-baseline="middle" fill="black">${compEscaped}</text></svg>`;
                          } else if (shape === 'triangle') {
                            return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 350" style="height: 100%; width: auto; max-width: 100%;"><polygon points="225,25 25,325 425,325" stroke="${strokeColor}" stroke-width="14" fill="none" /><text x="50%" y="68%" font-size="60" font-weight="900" text-anchor="middle" dominant-baseline="middle" fill="black">${compEscaped}</text></svg>`;
                          } else { // diamond
                            return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 280" style="height: 100%; width: auto; max-width: 100%;"><polygon points="280,15 545,140 280,265 15,140" stroke="${strokeColor}" stroke-width="14" fill="none" /><text x="50%" y="54%" font-size="80" font-weight="900" text-anchor="middle" dominant-baseline="middle" fill="black">${compEscaped}</text></svg>`;
                          }
                        };

                        let htmlContent = '<html>' +
                          '<head>' +
                            '<title>PLT Shipping Marks - ' + supplierName + '</title>' +
                            '<style>' +
                              '@import url("https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@700;900&display=swap");' +
                              '@page { size: A4 landscape; margin: 0; }' +
                              'body { font-family: "Noto Sans KR", sans-serif; margin: 0; padding: 0; background: #fff; }' +
                              '.page {' +
                                'width: 297mm;' +
                                'height: 210mm;' +
                                'box-sizing: border-box;' +
                                'padding: 12mm;' +
                                'display: flex;' +
                                'flex-direction: column;' +
                                'align-items: center;' +
                                'justify-content: space-around;' +
                                'page-break-after: always;' +
                              '}' +
                              '.shape-container {' +
                                'width: 100%;' +
                                'height: 45%;' +
                                'display: flex;' +
                                'align-items: center;' +
                                'justify-content: center;' +
                              '}' +
                              '.info-container {' +
                                'width: 100%;' +
                                'height: 48%;' +
                                'display: flex;' +
                                'flex-direction: column;' +
                                'align-items: center;' +
                                'justify-content: center;' +
                                'text-align: center;' +
                              '}' +
                              '.info-text1 {' +
                                'font-size: 30pt;' +
                                'font-weight: 700;' +
                                'margin: 10px 0;' +
                                'text-transform: uppercase;' +
                                'color: #000;' +
                                'letter-spacing: 0.5px;' +
                              '}' +
                              '.info-text2 {' +
                                'font-size: 36pt;' +
                                'font-weight: 900;' +
                                'margin: 10px 0;' +
                                'text-transform: uppercase;' +
                                'color: #000;' +
                                'letter-spacing: 0.5px;' +
                              '}' +
                            '</style>' +
                          '</head>' +
                          '<body>';

                        for (let i = startVal; i <= totalVal; i++) {
                          const shapeHtml = getLargeShippingMarkShapeSvg(shapeVal, compVal);

                          htmlContent += '<div class="page">' +
                            '<div class="shape-container">' + shapeHtml + '</div>' +
                            '<div class="info-container">' +
                              '<div class="info-text1">' + portVal + (countryVal ? ', ' + countryVal : '') + '</div>' +
                              '<div class="info-text2">PALLET NO. : ' + i + '/' + totalVal + '</div>' +
                              '<div class="info-text1">' + originVal + '</div>' +
                            '</div>' +
                          '</div>';
                        }

                        htmlContent += '</body></html>';

                        const confirmed = window.confirm(`쉬핑마크 라벨을 발행 및 클라우드(문서함)에 저장하시겠습니까?\n\nPO번호: ${poNum}\n거래처: ${supplierName}`);
                        if (!confirmed) return;

                        try {
                          const iframe = document.createElement('iframe');
                          iframe.style.position = 'fixed';
                          iframe.style.top = '0';
                          iframe.style.left = '0';
                          iframe.style.width = '1122px';
                          iframe.style.height = '793px';
                          iframe.style.border = '0';
                          iframe.style.zIndex = '-9999';
                          iframe.style.visibility = 'hidden';
                          document.body.appendChild(iframe);

                          const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument;
                          if (!iframeDoc) throw new Error('Failed to access sandbox iframe context');

                          iframeDoc.open();
                          iframeDoc.write(htmlContent);
                          iframeDoc.close();

                          await new Promise(resolve => setTimeout(resolve, 800));

                          const pages = iframeDoc.body.querySelectorAll('.page');
                          const pdf = new jsPDF({
                            orientation: 'l',
                            unit: 'pt',
                            format: 'a4'
                          });

                          for (let i = 0; i < pages.length; i++) {
                            const pageEl = pages[i] as HTMLElement;
                            const canvas = await html2canvas(pageEl, {
                              scale: 2,
                              useCORS: true,
                              allowTaint: true,
                              logging: false,
                              width: pageEl.offsetWidth,
                              height: pageEl.offsetHeight,
                              windowWidth: pageEl.offsetWidth,
                              windowHeight: pageEl.offsetHeight
                            });

                            const imgData = canvas.toDataURL('image/jpeg', 0.95);
                            if (i > 0) {
                              pdf.addPage();
                            }
                            pdf.addImage(imgData, 'JPEG', 0, 0, 841.89, 595.28);
                          }

                          document.body.removeChild(iframe);

                          const pdfBlob = pdf.output('blob');

                          const currentIssuedDocs = (order as any)?.po_issued_documents || [];
                          const version = currentIssuedDocs.filter((d: any) => d.po_number === poNum && d.fileName.startsWith('쉬핑마크라벨')).length + 1;
                          const safeFileName = `쉬핑마크라벨_${poNum.replace(/[^a-zA-Z0-9가-힣_-]/g, '_')}_v${version}.pdf`;
                          const storageRef = ref(storage, `companies/${COMPANY_ID}/orders/${order?.id}/po_issued_docs/${safeFileName}`);

                          const snapshot = await uploadBytesResumable(storageRef, pdfBlob, { contentType: 'application/pdf' });
                          const downloadURL = await getDownloadURL(snapshot.ref);

                          const newDoc = {
                            id: new Date().getTime().toString(),
                            po_number: poNum,
                            supplier_name: supplierName,
                            version: version,
                            fileName: safeFileName,
                            fileUrl: downloadURL,
                            issuedAt: new Date().toISOString(),
                            issuedBy: auth.currentUser?.displayName || 'System',
                            totalAmount: 0,
                            status: 'active'
                          };

                          const updatedDocs = currentIssuedDocs.map((doc: any) => {
                            if (doc.po_number === poNum && doc.fileName.startsWith('쉬핑마크라벨')) {
                              return { ...doc, status: 'superseded' };
                            }
                            return doc;
                          });
                          updatedDocs.push(newDoc);

                          const currentLogs = (order as any).history_logs || [];
                          const newLog = {
                            timestamp: new Date().toISOString(),
                            actionType: 'shipping_mark_issue',
                            user: auth.currentUser?.displayName || auth.currentUser?.email || 'System',
                            description: `공급업체 "${supplierName}" 쉬핑마크 라벨 발행완료 (버전 v${version}, 파일명: ${safeFileName})`
                          };
                          const nextHistoryLogs = [newLog, ...currentLogs];

                          const docRef = doc(db, 'companies', COMPANY_ID, 'orders', order?.id!);
                          await updateDoc(docRef, {
                            po_issued_documents: updatedDocs,
                            history_logs: nextHistoryLogs
                          });

                          alert('✅ 쉬핑마크 라벨이 성공적으로 발행 및 클라우드에 저장되었습니다.');
                          setIssuedDocs(updatedDocs);

                        } catch (err: any) {
                          console.error(err);
                          alert('쉬핑마크 라벨 발행 중 오류가 발생했습니다: ' + err.message);
                        }
                      };

                      return (
                        <div key={supplierName} style={{ border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 4px 10px rgba(0,0,0,0.03)', marginBottom: '16px' }}>
                          {/* Card Header */}
                          <div style={{ background: '#f8fafc', padding: '10px 16px', borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <span style={{ fontWeight: 800, color: '#1e3a8a', fontSize: '13px' }}>🚚 {supplierName} 도착보고서 ({poNum})</span>
                              {order.supplierArrivalReports && order.supplierArrivalReports[supplierName] && (
                                <span style={{ marginLeft: '10px', padding: '2px 8px', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  ✓ 저장 완료 (클라우드)
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button 
                                onClick={addArrivalReportItemRow}
                                disabled={!isEditing}
                                style={{ padding: '5px 10px', background: '#0f766e', border: 'none', color: '#fff', borderRadius: '4px', cursor: isEditing ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: '11.5px' }}
                              >
                                ➕ 패킹 행 추가
                              </button>
                              <button 
                                onClick={handleSaveArrivalReportInline}
                                disabled={!isEditing}
                                style={{ padding: '5px 10px', background: '#2563eb', border: 'none', color: '#fff', borderRadius: '4px', cursor: isEditing ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: '11.5px' }}
                              >
                                💾 저장
                              </button>
                              <button 
                                onClick={handlePrintArrivalReportInline}
                                style={{ padding: '5px 10px', background: '#8b5cf6', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '11.5px' }}
                              >
                                🖨️ 인쇄 / PDF
                              </button>
                              <button 
                                onClick={handleIssueAndSaveArrivalReport}
                                style={{ padding: '5px 10px', background: '#d97706', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '11.5px' }}
                              >
                                📥 도착보고서 발행 및 저장
                              </button>
                              <button 
                                onClick={handleIssueAndSaveShippingMarks}
                                style={{ padding: '5px 10px', background: '#059669', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '11.5px' }}
                              >
                                📥 쉬핑마크 라벨 발행 및 저장
                              </button>
                            </div>
                          </div>

                          {/* Card Body - Inline Table for Editing Packing Items */}
                          <div style={{ padding: '12px 16px', background: '#fff' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                              <thead>
                                <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                                  <th style={{ padding: '6px', textAlign: 'left', width: '25%' }}>10) Marks (쉬핑마크)</th>
                                  <th style={{ padding: '6px', textAlign: 'left', width: '28%' }}>11) Description of Goods (품명)</th>
                                  <th style={{ padding: '6px', textAlign: 'center', width: '8%' }}>12) Qty (수량)</th>
                                  <th style={{ padding: '6px', textAlign: 'center', width: '8%' }}>13) Package (단위)</th>
                                  <th style={{ padding: '6px', textAlign: 'right', width: '10%' }}>14) Net Wt (kg)</th>
                                  <th style={{ padding: '6px', textAlign: 'right', width: '10%' }}>15) Gross Wt (kg)</th>
                                  <th style={{ padding: '6px', textAlign: 'left', width: '12%' }}>16) Measurement (규격)</th>
                                  <th style={{ padding: '6px', textAlign: 'center', width: '5%' }}>동작</th>
                                </tr>
                              </thead>
                              <tbody>
                                {packingItemsList.map((it: any, itemIdx: number) => (
                                  <tr key={itemIdx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                    <td style={{ padding: '5px' }}>
                                      <textarea
                                        rows={3}
                                        disabled={!isEditing}
                                        value={it.marks || ''}
                                        onChange={e => updateArrivalReportItem(itemIdx, 'marks', e.target.value)}
                                        style={{ width: '95%', padding: '4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }}
                                      />
                                    </td>
                                    <td style={{ padding: '5px' }}>
                                      <textarea
                                        rows={2}
                                        disabled={!isEditing}
                                        value={it.descOfGoods || ''}
                                        onChange={e => updateArrivalReportItem(itemIdx, 'descOfGoods', e.target.value)}
                                        style={{ width: '97%', padding: '4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px' }}
                                      />
                                    </td>
                                    <td style={{ padding: '5px', textAlign: 'center' }}>
                                      <input
                                        type="number"
                                        disabled={!isEditing}
                                        value={it.qty || 0}
                                        onChange={e => updateArrivalReportItem(itemIdx, 'qty', parseInt(e.target.value, 10) || 0)}
                                        style={{ width: '85%', padding: '4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', textAlign: 'center' }}
                                      />
                                    </td>
                                    <td style={{ padding: '5px', textAlign: 'center' }}>
                                      <input
                                        type="text"
                                        disabled={!isEditing}
                                        value={it.packageType || 'PL'}
                                        onChange={e => updateArrivalReportItem(itemIdx, 'packageType', e.target.value)}
                                        style={{ width: '85%', padding: '4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', textAlign: 'center' }}
                                      />
                                    </td>
                                    <td style={{ padding: '5px', textAlign: 'right' }}>
                                      <input
                                        type="number"
                                        disabled={!isEditing}
                                        value={it.netWeight || 0}
                                        onChange={e => updateArrivalReportItem(itemIdx, 'netWeight', parseFloat(e.target.value) || 0)}
                                        style={{ width: '85%', padding: '4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', textAlign: 'right' }}
                                      />
                                    </td>
                                    <td style={{ padding: '5px', textAlign: 'right' }}>
                                      <input
                                        type="number"
                                        disabled={!isEditing}
                                        value={it.grossWeight || 0}
                                        onChange={e => updateArrivalReportItem(itemIdx, 'grossWeight', parseFloat(e.target.value) || 0)}
                                        style={{ width: '85%', padding: '4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', textAlign: 'right' }}
                                      />
                                    </td>
                                    <td style={{ padding: '5px' }}>
                                      <input
                                        type="text"
                                        disabled={!isEditing}
                                        value={it.measurement || ''}
                                        placeholder="예: =1.1*1.2*1.3"
                                        onChange={e => updateArrivalReportItem(itemIdx, 'measurement', e.target.value)}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') {
                                            const raw = (e.target as HTMLInputElement).value;
                                            if (raw.startsWith('=')) {
                                              try {
                                                const expr = raw.slice(1).replace(/[^0-9+\-*/().]/g, '');
                                                // eslint-disable-next-line no-new-func
                                                const result = Function('"use strict"; return (' + expr + ')')();
                                                if (typeof result === 'number' && isFinite(result)) {
                                                  updateArrivalReportItem(itemIdx, 'measurement', parseFloat(result.toFixed(4)) + ' CBM');
                                                }
                                              } catch {}
                                            }
                                          }
                                        }}
                                        onBlur={e => {
                                          const raw = e.target.value;
                                          if (raw.startsWith('=')) {
                                            try {
                                              const expr = raw.slice(1).replace(/[^0-9+\-*/().]/g, '');
                                              // eslint-disable-next-line no-new-func
                                              const result = Function('"use strict"; return (' + expr + ')')();
                                              if (typeof result === 'number' && isFinite(result)) {
                                                updateArrivalReportItem(itemIdx, 'measurement', parseFloat(result.toFixed(4)) + ' CBM');
                                              }
                                            } catch {}
                                          }
                                        }}
                                        style={{ width: '90%', padding: '4px', border: `1px solid ${(it.measurement||'').startsWith('=') ? '#f59e0b' : '#cbd5e1'}`, borderRadius: '4px', fontSize: '11.5px' }}
                                      />
                                    </td>
                                    <td style={{ padding: '5px', textAlign: 'center' }}>
                                      <button
                                        type="button"
                                        disabled={!isEditing || packingItemsList.length <= 1}
                                        onClick={() => removeArrivalReportItemRow(itemIdx)}
                                        style={{ padding: '2px 6px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '3px', fontSize: '11px', cursor: (isEditing && packingItemsList.length > 1) ? 'pointer' : 'not-allowed' }}
                                      >
                                        삭제
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* 3) COA 및 시험성적서 탭 */}
              {activeSourcingTab === 'COA_성적서' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 800, color: '#1e3a8a' }}>🔬 COA 및 시험성적서 첨부 파일 관리</h4>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
                      수입 및 통관을 위한 공급사별 COA(분석증명서)와 시험성적서 파일을 등록 및 관리합니다.
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                      {renderFileField('COA 및 시험성적서', 'coaFiles', 'coa-file-input')}
                      {renderFileField('그밖의 생산/품질 서류', 'otherFiles', 'other-docs-input')}
                    </div>
                  </div>
                </div>
              )}

              {/* 4) 세금계산서, 구매확인서, 대금결제관리 탭 */}
              {activeSourcingTab === '세금계산서_결제' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {/* 4) 세금계산서 발행 */}
                  <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 800, color: '#1e3a8a' }}>📄 4) 공급사 세금계산서 발행 정보 등록</h4>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>각 공급사별로 국내 발행된 세금계산서 발행일자 및 국세청 승인번호를 기록합니다. (다수 발행 가능)</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {allOrderSuppliers.length === 0 ? (
                        <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>공급업체가 없습니다.</div>
                      ) : (
                        allOrderSuppliers.map(supplier => {
                          const raw = basicForm.supplierTaxInvoiceDetails[supplier];
                          const list: Array<{ date: string; invoiceNo: string; supplyAmount?: string; vatAmount?: string }> = Array.isArray(raw)
                            ? raw
                            : (raw && (raw.date !== undefined || raw.invoiceNo !== undefined) ? [raw as any] : [{ date: '', invoiceNo: '' }]);

                          const supplierItems = sourcingItems.filter(it => (it.supplier?.trim() || 'General Supplier') === supplier);
                          const isZeroTax = basicForm.supplierTaxTypes[supplier] === '영세';
                          const customsExchangeRate = basicForm.customsExchangeRate || piData?.exchangeRate || 1350;
                          
                          const poSupplyKrw = supplierItems.reduce((sum, it) => {
                            const info = getSupplierPurchaseInfo(it as OrderItem);
                            const price = info.purchasePrice * (it.qty || 0);
                            if (info.purchaseCurrency !== 'KRW') {
                              return sum + Math.round(price * customsExchangeRate);
                            }
                            return sum + price;
                          }, 0);
                          const poVatKrw = isZeroTax ? 0 : Math.round(poSupplyKrw * 0.1);
                          const poTotalKrw = poSupplyKrw + poVatKrw;

                          return (
                            <div key={supplier} style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', marginBottom: '4px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                  <span style={{ fontWeight: 800, fontSize: '12.5px', color: '#334155' }}>{supplier}</span>
                                  <span style={{ fontSize: '11px', color: '#4b5563', backgroundColor: '#f1f5f9', padding: '3px 8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                    📋 원가 발주액: <strong>₩{poSupplyKrw.toLocaleString()}</strong> | 부가세: <strong>₩{poVatKrw.toLocaleString()}</strong> | 합계: <strong>₩{poTotalKrw.toLocaleString()}</strong>
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newList = [...list, { date: '', invoiceNo: '', supplyAmount: '', vatAmount: '' }];
                                    setBasicForm(prev => ({
                                      ...prev,
                                      supplierTaxInvoiceDetails: {
                                        ...prev.supplierTaxInvoiceDetails,
                                        [supplier]: newList
                                      }
                                    }));
                                  }}
                                  style={{ padding: '3px 8px', fontSize: '11px', fontWeight: 700, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '4px', cursor: 'pointer' }}
                                >
                                  ➕ 세금계산서 추가
                                </button>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {/* 테이블 헤더 (1줄 레이아웃용) */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2.2fr 1.2fr 1.1fr 1.3fr auto', gap: '8px', padding: '4px 0', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '11px', fontWeight: 700 }}>
                                  <span style={{ paddingLeft: '4px' }}>발행일자</span>
                                  <span>승인번호</span>
                                  <span>공급가액</span>
                                  <span>부가세액</span>
                                  <span style={{ textAlign: 'right', paddingRight: '12px' }}>합계금액</span>
                                  <span style={{ width: '28px' }}></span>
                                </div>
                                
                                {list.map((details, idx) => {
                                  const supply = Number(details.supplyAmount) || 0;
                                  const vat = Number(details.vatAmount) || 0;
                                  const total = supply + vat;
                                  return (
                                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.2fr 2.2fr 1.2fr 1.1fr 1.3fr auto', gap: '8px', alignItems: 'center' }}>
                                      {/* 발행일자 */}
                                      <input
                                        type="date"
                                        value={details.date || ''}
                                        onChange={e => {
                                          const val = e.target.value;
                                          const newList = [...list];
                                          newList[idx] = { ...newList[idx], date: val };
                                          setBasicForm(prev => ({
                                            ...prev,
                                            supplierTaxInvoiceDetails: {
                                              ...prev.supplierTaxInvoiceDetails,
                                              [supplier]: newList
                                            }
                                          }));
                                        }}
                                        style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                                      />
                                      
                                      {/* 승인번호 */}
                                      <input
                                        type="text"
                                        placeholder="국세청 승인번호"
                                        value={details.invoiceNo || ''}
                                        onChange={e => {
                                          const val = e.target.value;
                                          const newList = [...list];
                                          newList[idx] = { ...newList[idx], invoiceNo: val };
                                          setBasicForm(prev => ({
                                            ...prev,
                                            supplierTaxInvoiceDetails: {
                                              ...prev.supplierTaxInvoiceDetails,
                                              [supplier]: newList
                                            }
                                          }));
                                        }}
                                        style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                                      />

                                      {/* 공급가액 */}
                                      <input
                                        type="number"
                                        placeholder="₩ 공급가액"
                                        value={details.supplyAmount || ''}
                                        onChange={e => {
                                          const val = e.target.value;
                                          const numVal = val === '' ? 0 : Number(val);
                                          const isZeroTax = basicForm.supplierTaxTypes[supplier] === '영세';
                                          const calculatedVat = isZeroTax ? 0 : Math.round(numVal * 0.1);
                                          const newList = [...list];
                                          newList[idx] = { ...newList[idx], supplyAmount: val, vatAmount: String(calculatedVat) };
                                          setBasicForm(prev => ({
                                            ...prev,
                                            supplierTaxInvoiceDetails: {
                                              ...prev.supplierTaxInvoiceDetails,
                                              [supplier]: newList
                                            }
                                          }));
                                        }}
                                        style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                                      />

                                      {/* 부가세 */}
                                      <input
                                        type="number"
                                        placeholder="₩ 부가세"
                                        value={details.vatAmount || ''}
                                        onChange={e => {
                                          const val = e.target.value;
                                          const newList = [...list];
                                          newList[idx] = { ...newList[idx], vatAmount: val };
                                          setBasicForm(prev => ({
                                            ...prev,
                                            supplierTaxInvoiceDetails: {
                                              ...prev.supplierTaxInvoiceDetails,
                                              [supplier]: newList
                                            }
                                          }));
                                        }}
                                        style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                                      />

                                      {/* 합계금액 */}
                                      <div style={{ background: '#f1f5f9', padding: '6px 10px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 700, color: '#1e293b', textAlign: 'right', boxSizing: 'border-box', height: '31px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                                        ₩{total.toLocaleString()}
                                      </div>

                                      {/* 삭제 버튼 */}
                                      {list.length > 1 ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const newList = list.filter((_, i) => i !== idx);
                                            setBasicForm(prev => ({
                                              ...prev,
                                              supplierTaxInvoiceDetails: {
                                                ...prev.supplierTaxInvoiceDetails,
                                                [supplier]: newList
                                              }
                                            }));
                                          }}
                                          style={{ padding: '6px 8px', border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: '13px' }}
                                          title="삭제"
                                        >
                                          🗑️
                                        </button>
                                      ) : (
                                        <div style={{ width: '28px' }}></div>
                                      )}
                                    </div>
                                  );
                                })}

                                {/* 세금계산서 합계 행 (2건 이상일 때 표시) */}
                                {list.length >= 2 && (() => {
                                  const totalInvoicesSupply = list.reduce((sum, item) => sum + (Number(item.supplyAmount) || 0), 0);
                                  const totalInvoicesVat = list.reduce((sum, item) => sum + (Number(item.vatAmount) || 0), 0);
                                  const totalInvoicesGrand = totalInvoicesSupply + totalInvoicesVat;
                                  return (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2.2fr 1.2fr 1.1fr 1.3fr auto', gap: '8px', alignItems: 'center', marginTop: '4px', paddingTop: '8px', borderTop: '2px double #cbd5e1', color: '#1e3a8a', fontWeight: 'bold' }}>
                                      <span style={{ fontSize: '11px', paddingLeft: '4px' }}>등록 세금계산서 합계</span>
                                      <span></span>
                                      <span style={{ fontSize: '12.5px', color: '#0f172a' }}>₩{totalInvoicesSupply.toLocaleString()}</span>
                                      <span style={{ fontSize: '12.5px', color: '#0f172a' }}>₩{totalInvoicesVat.toLocaleString()}</span>
                                      <span style={{ fontSize: '13px', textAlign: 'right', paddingRight: '12px' }}>₩{totalInvoicesGrand.toLocaleString()}</span>
                                      <span style={{ width: '28px' }}></span>
                                    </div>
                                  );
                                })()}
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
                              {/* 구매확인서 발행 문서 보관함 스타일 표기 */}
                              <div style={{ marginTop: '10px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#1e3a8a', marginBottom: '6px' }}>📁 {supplier} 구매확인서 문서 보관함</div>
                                {fileList.length > 0 ? (
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', backgroundColor: '#fff', border: '1px solid #e2e8f0' }}>
                                    <thead>
                                      <tr style={{ borderBottom: '2px solid #cbd5e1', backgroundColor: '#f1f5f9' }}>
                                        <th style={{ padding: '6px 8px', textAlign: 'center', width: '40px' }}>No</th>
                                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>문서명</th>
                                        <th style={{ padding: '6px 8px', textAlign: 'center', width: '100px' }}>상태</th>
                                        <th style={{ padding: '6px 8px', textAlign: 'center', width: '220px' }}>액션</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {fileList.map((file, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>{idx + 1}</td>
                                          <td style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 'bold', color: '#334155' }}>{file.name}</td>
                                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                            <span style={{ padding: '2px 6px', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>최신</span>
                                          </td>
                                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center', flexWrap: 'nowrap' }}>
                                            <button 
                                              type="button"
                                              onClick={() => previewFile(file.url, file.name)} 
                                              style={{ padding: '3px 8px', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', color: '#334155', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                                            >
                                              보기
                                            </button>
                                            <a 
                                              href={file.url} 
                                              download 
                                              style={{ padding: '3px 8px', backgroundColor: '#e0f2fe', border: '1px solid #bae6fd', borderRadius: '4px', color: '#0369a1', textDecoration: 'none', fontSize: '11px', fontWeight: 'bold', display: 'inline-block' }}
                                            >
                                              ↓ 다운로드
                                            </a>
                                            <button 
                                              type="button"
                                              onClick={() => handleDeleteSupplierCertFile(supplier, idx)} 
                                              style={{ padding: '3px 8px', backgroundColor: '#fee2e2', border: '1px solid #fecaca', borderRadius: '4px', color: '#dc2626', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                                            >
                                              취소
                                            </button>
                                          </div>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                ) : (
                                  <div style={{ padding: '12px', textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: '6px', color: '#94a3b8', fontSize: '11.5px', border: '1px solid #e2e8f0' }}>
                                    보관된 구매확인서 문서가 없습니다. 위 입력창을 통해 등록해주세요.
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>

                  {/* 포워딩/운송사 세금계산서 관리 */}
                  <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)', marginTop: '24px' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 800, color: '#7c3aed' }}>📄 포워딩/운송사 세금계산서 관리</h4>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>각 지정 포워딩업체별 세금계산서 발행 내역을 관리합니다. (여러 건 등록 가능)</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {forwardersList.length === 0 ? (
                        <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>지정된 포워더/운송사가 없습니다. 선적관리 탭에서 먼저 추가해주세요.</div>
                      ) : (
                        forwardersList.map((fw, idx) => {
                          const taxInvoices = fw.taxInvoices || (fw.taxInvoiceDate || fw.taxInvoiceNo ? [{ date: fw.taxInvoiceDate || '', invoiceNo: fw.taxInvoiceNo || '', amount: 0 }] : [{ date: '', invoiceNo: '', amount: 0 }]);
                          
                          return (
                            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 14px', background: '#faf5ff', borderRadius: '8px', border: '1px solid #e9d5ff' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '4px' }}>
                                <span style={{ fontWeight: 800, fontSize: '12.5px', color: '#6b21a8' }}>{fw.name || `포워더 #${idx+1}`}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newList = [...taxInvoices, { date: '', invoiceNo: '', amount: 0 }];
                                    setForwardersList(prev => prev.map((f, i) => i === idx ? { ...f, taxInvoices: newList } : f));
                                  }}
                                  style={{ background: '#fff', border: '1px solid #d8b4fe', borderRadius: '4px', padding: '3px 10px', fontSize: '11px', fontWeight: 700, color: '#7c3aed', cursor: 'pointer' }}
                                >
                                  ＋ 계산서 추가
                                </button>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {taxInvoices.map((inv, invIdx) => (
                                  <div key={invIdx} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 1fr 2fr 24px', gap: '12px', alignItems: 'center', background: '#fff', padding: '10px 14px', borderRadius: '8px', border: '1px dashed #d8b4fe' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#581c87' }}>{invIdx + 1}차 계산서</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563', whiteSpace: 'nowrap' }}>발행일자</span>
                                      <input
                                        type="date"
                                        title="계산서 발행일자"
                                        value={inv.date || ''}
                                        onChange={e => {
                                          const newList = [...taxInvoices];
                                          newList[invIdx].date = e.target.value;
                                          setForwardersList(prev => prev.map((f, i) => i === idx ? { ...f, taxInvoices: newList } : f));
                                        }}
                                        style={{ flex: 1, padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', background: '#fff', outline: 'none' }}
                                      />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563', whiteSpace: 'nowrap' }}>금액(₩)</span>
                                      <input
                                        type="number"
                                        placeholder="0"
                                        value={inv.amount || ''}
                                        onChange={e => {
                                          const newList = [...taxInvoices];
                                          newList[invIdx].amount = parseFloat(e.target.value) || 0;
                                          setForwardersList(prev => prev.map((f, i) => i === idx ? { ...f, taxInvoices: newList } : f));
                                        }}
                                        style={{ flex: 1, padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', background: '#fff', outline: 'none', textAlign: 'right' }}
                                      />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563', whiteSpace: 'nowrap' }}>승인번호</span>
                                      <input
                                        type="text"
                                        placeholder="국세청 승인번호"
                                        value={inv.invoiceNo || ''}
                                        onChange={e => {
                                          const newList = [...taxInvoices];
                                          newList[invIdx].invoiceNo = e.target.value;
                                          setForwardersList(prev => prev.map((f, i) => i === idx ? { ...f, taxInvoices: newList } : f));
                                        }}
                                        style={{ flex: 1, padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', background: '#fff', outline: 'none' }}
                                      />
                                    </div>
                                    {taxInvoices.length > 1 ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const filtered = taxInvoices.filter((_, i) => i !== invIdx);
                                          const updated = filtered.length > 0 ? filtered : [{ date: '', invoiceNo: '', amount: 0 }];
                                          setForwardersList(prev => prev.map((f, i) => i === idx ? { ...f, taxInvoices: updated } : f));
                                        }}
                                        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px', fontWeight: 700, padding: 0 }}
                                      >✕</button>
                                    ) : (
                                      <span />
                                    )}
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

              {activeSourcingTab === '대금결제관리' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {/* 7) 대금결제관리 */}
                  <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 800, color: '#1e3a8a' }}>💳 7) 대금결제관리 (공급업체 외화/원화 대금 지급)</h4>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>각 공급사별 원화/외화 수주 금액 대비 지급(송금) 완료 내역 및 미수금을 분할 입금 형식으로 지정합니다.</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {allOrderSuppliers.length === 0 ? (
                        <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>공급업체가 없습니다.</div>
                      ) : (
                        allOrderSuppliers.map((supplier, supplierIdx) => {
                          const matchingSupplier = suppliersList.find(s => s.name?.trim() === supplier.trim());
                          const items = groupedSupplierItems[supplier] || [];
                          const taxType = basicForm.supplierTaxTypes[supplier] || '과세';
                          const usdTotal = items.filter(it => getSupplierPurchaseInfo(it).purchaseCurrency !== 'KRW').reduce((sum, it) => {
                            return sum + getSupplierPurchaseInfo(it).purchasePrice * (it.qty || 0);
                          }, 0);
                          const krwTotal = items.filter(it => getSupplierPurchaseInfo(it).purchaseCurrency === 'KRW').reduce((sum, it) => {
                            return sum + getSupplierPurchaseInfo(it).purchasePrice * (it.qty || 0);
                          }, 0);
                          const usdVat = taxType === '영세' ? 0 : parseFloat((usdTotal * 0.1).toFixed(2));
                          const krwVat = taxType === '영세' ? 0 : Math.round(krwTotal * 0.1);
                          const usdGrand = usdTotal + usdVat;
                          const krwGrand = krwTotal + krwVat;
                          const isKrw = krwGrand > 0 || (usdGrand === 0 && krwGrand === 0);
                          const grandTotal = isKrw ? krwGrand : usdGrand;
                          const list = basicForm.supplierPaymentInstallments[supplier] || [];
                          const installments = list.length > 0 ? list : [{ date: '', amount: 0, currency: isKrw ? 'KRW' : 'USD' as 'KRW' | 'USD' }];
                          
                          // Calculate Paid Amounts
                          const krwPaid = installments.filter(inst => inst.currency === 'KRW' || (!inst.currency && isKrw)).reduce((sum, inst) => sum + (inst.amount || 0), 0);
                          const usdPaid = installments.filter(inst => inst.currency === 'USD' || (!inst.currency && !isKrw)).reduce((sum, inst) => sum + (inst.amount || 0), 0);
                          
                          const krwOutstanding = Math.max(0, Math.round(krwGrand - krwPaid));
                          const usdOutstanding = Math.max(0, parseFloat((usdGrand - usdPaid).toFixed(2)));
                          
                          const isCompleted = (krwGrand === 0 || krwPaid >= (krwGrand - 0.9)) && (usdGrand === 0 || usdPaid >= (usdGrand - 0.009));

                          const handleInstallmentChange = (idx: number, field: 'date' | 'amount' | 'currency', value: any) => {
                            const newList = [...installments];
                            newList[idx] = { ...newList[idx], [field]: value };
                            
                            const newKrwPaid = newList.filter(inst => inst.currency === 'KRW' || (!inst.currency && isKrw)).reduce((sum, inst) => sum + (inst.amount || 0), 0);
                            const newUsdPaid = newList.filter(inst => inst.currency === 'USD' || (!inst.currency && !isKrw)).reduce((sum, inst) => sum + (inst.amount || 0), 0);
                            const newIsCompleted = (krwGrand === 0 || newKrwPaid >= (krwGrand - 0.9)) && (usdGrand === 0 || newUsdPaid >= (usdGrand - 0.009));
                            
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
                          <div key={supplier} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 12px', background: supplierIdx % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                <span style={{ fontWeight: 800, fontSize: '13px', color: '#1e3a8a', width: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={supplier}>{supplier}</span>
                                {matchingSupplier && (
                                  <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: '#475569' }}>
                                    <span>🏦 {matchingSupplier.bankKrw || '-'}</span>
                                    <span>🌍 {matchingSupplier.bankUsd || '-'}</span>
                                  </div>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '11.5px' }}>
                                <span>발주: <strong>{usdGrand > 0 ? `$${usdGrand.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : ''} {usdGrand > 0 && krwGrand > 0 ? ' / ' : ''} {krwGrand > 0 ? `₩${krwGrand.toLocaleString()}` : (usdGrand === 0 ? '₩0' : '')}</strong></span>
                                <span>송금: <strong style={{ color: '#0d9488' }}>{usdPaid > 0 ? `$${usdPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : ''} {usdPaid > 0 && krwPaid > 0 ? ' / ' : ''} {krwPaid > 0 ? `₩${krwPaid.toLocaleString()}` : (usdPaid === 0 ? '₩0' : '')}</strong></span>
                                <span>잔액: <strong style={{ color: (krwOutstanding > 0 || usdOutstanding > 0) ? '#ef4444' : '#64748b' }}>{usdOutstanding > 0 ? `$${usdOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : ''} {usdOutstanding > 0 && krwOutstanding > 0 ? ' / ' : ''} {krwOutstanding > 0 ? `₩${krwOutstanding.toLocaleString()}` : (usdOutstanding === 0 ? '₩0' : '')}</strong></span>
                                <span style={{ padding: '2px 6px', borderRadius: '4px', background: isCompleted ? '#dcfce7' : '#fee2e2', color: isCompleted ? '#15803d' : '#b91c1c', fontWeight: 700, fontSize: '10.5px' }}>
                                  {isCompleted ? '송금완료' : '지급대기'}
                                </span>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', paddingLeft: '165px' }}>
                              {installments.map((inst, i) => (
                                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 8px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)', width: '270px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b' }}>{i + 1}차</span>
                                    <input
                                      type="date"
                                      value={inst.date}
                                      onChange={e => handleInstallmentChange(i, 'date', e.target.value)}
                                      style={{ padding: '1px 4px', border: 'none', borderRight: '1px solid #e2e8f0', fontSize: '11px', width: '90px', outline: 'none' }}
                                    />
                                    <select
                                      value={inst.currency || (isKrw ? 'KRW' : 'USD')}
                                      onChange={e => handleInstallmentChange(i, 'currency', e.target.value)}
                                      style={{ padding: '1px 2px', border: 'none', fontSize: '11px', outline: 'none', background: 'transparent' }}
                                    >
                                      <option value="KRW">₩</option>
                                      <option value="USD">$</option>
                                    </select>
                                    <FormattedNumberInput
                                      placeholder="지급액"
                                      value={inst.amount || 0}
                                      onChange={val => handleInstallmentChange(i, 'amount', val)}
                                      style={{ padding: '1px 4px', border: 'none', fontSize: '11px', width: '80px', textAlign: 'right', outline: 'none' }}
                                    />
                                    {installments.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const newList = installments.filter((_, idxToRemove) => idxToRemove !== i);
                                          const finalList = newList.length > 0 ? newList : [{ date: '', amount: 0 }];
                                          const newTotalPaid = finalList.reduce((sum, item) => sum + (item.amount || 0), 0);
                                          const newIsCompleted = grandTotal > 0 && newTotalPaid >= (grandTotal - (isKrw ? 0.9 : 0.009));
                                          const dates = finalList.map(item => item.date).filter(d => d);
                                          const lastDate = dates.length > 0 ? dates.sort().reverse()[0] : '';
                                          setBasicForm(prev => {
                                            const updatedPayments = { ...prev.supplierPayments };
                                            updatedPayments[supplier] = newIsCompleted ? { status: '입금완료', date: lastDate } : { status: '미수금 발생', date: '' };
                                            return {
                                              ...prev,
                                              supplierPaymentInstallments: { ...prev.supplierPaymentInstallments, [supplier]: finalList },
                                              supplierPayments: updatedPayments
                                            };
                                          });
                                        }}
                                        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '11px', fontWeight: 700, padding: '0 4px', marginLeft: '2px' }}
                                      >✕</button>
                                    )}
                                  </div>
                                  <div 
                                    style={{ 
                                      borderTop: '1px dashed #e2e8f0', 
                                      paddingTop: '4px', 
                                      display: 'flex', 
                                      flexDirection: 'column', 
                                      gap: '4px' 
                                    }}
                                    onPaste={async (e) => {
                                      const items = e.clipboardData.items;
                                      for (let idx = 0; idx < items.length; idx++) {
                                        if (items[idx].type.indexOf('image') !== -1) {
                                          const file = items[idx].getAsFile();
                                          if (file) {
                                            e.preventDefault();
                                            await handleReceiptUpload(file, i, supplier);
                                          }
                                        }
                                      }
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                      <span style={{ fontSize: '8px', color: '#94a3b8' }}>📋 포커스 후 Ctrl+V로 캡처 첨부</span>
                                      <label style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '2px', background: '#f1f5f9', padding: '1px 4px', borderRadius: '3px', border: '1px solid #cbd5e1', fontSize: '8.5px', fontWeight: 600, color: '#475569' }}>
                                        <span>📎 첨부</span>
                                        <input 
                                          type="file" 
                                          style={{ display: 'none' }} 
                                          onChange={(e) => {
                                            if (e.target.files && e.target.files.length > 0) {
                                              handleReceiptUpload(e.target.files[0], i, supplier);
                                            }
                                          }}
                                        />
                                      </label>
                                    </div>
                                    {inst.receiptFiles && inst.receiptFiles.length > 0 && (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        {inst.receiptFiles.map((file, fileIdx) => (
                                          <div key={fileIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '2px 4px', borderRadius: '3px', border: '1px solid #e2e8f0' }}>
                                            <span 
                                              onClick={() => previewFile(file.url, file.name)}
                                              style={{ fontSize: '9px', color: '#2563eb', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}
                                              title="클릭하여 미리보기"
                                            >
                                              {file.name}
                                            </span>
                                            <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                                              <a href={file.url} download={file.name} target="_blank" rel="noopener noreferrer" style={{ fontSize: '8px', textDecoration: 'none', color: '#3b82f6', background: '#eff6ff', padding: '0 3px', borderRadius: '2px' }}>
                                                ⬇
                                              </a>
                                              <button 
                                                type="button" 
                                                onClick={() => handleDeleteReceipt(supplier, i, fileIdx)} 
                                                style={{ border: 'none', background: '#fee2e2', color: '#ef4444', borderRadius: '2px', cursor: 'pointer', fontSize: '8px', padding: '0 3px' }}
                                              >
                                                ✕
                                              </button>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {uploadingReceipt?.supplier === supplier && uploadingReceipt?.index === i && (
                                      <span style={{ fontSize: '8.5px', color: '#3b82f6' }}>⏳ 업로드 중...</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => {
                                  const newList = [...installments, { date: '', amount: 0 }];
                                  setBasicForm(prev => ({
                                    ...prev,
                                    supplierPaymentInstallments: { ...prev.supplierPaymentInstallments, [supplier]: newList }
                                  }));
                                }}
                                style={{ background: '#f1f5f9', border: '1px dashed #94a3b8', borderRadius: '4px', padding: '3px 10px', fontSize: '10.5px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}
                              >
                                ＋ 내역 추가
                              </button>
                            </div>
                          </div>
                        );
                        })
                      )}
                    </div>
                  </div>

                  {/* 7) 포워딩업체 대금결제 및 세금계산서 관리 */}
                  <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 800, color: '#7c3aed' }}>💳 7-2) 포워딩/운송사 대금결제 관리</h4>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>각 지정 포워딩업체별 최종 실 청구액에 대한 송금 지급내역을 관리합니다.</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {forwardersList.length === 0 ? (
                        <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>지정된 포워더/운송사가 없습니다. 선적관리 탭에서 먼저 추가해주세요.</div>
                      ) : (
                        forwardersList.map((fw, idx) => {
                          const installments = fw.paymentInstallments || [{ date: '', amount: 0, currency: (fw.freightCurrency || 'KRW') as 'KRW' | 'USD' }];
                          
                          // Calculate total final cost (USD final + KRW final converted or handled separately, we display both)
                          const krwPaid = installments.filter(inst => inst.currency === 'KRW' || (!inst.currency && fw.freightCurrency !== 'USD')).reduce((sum, inst) => sum + (inst.amount || 0), 0);
                          const usdPaid = installments.filter(inst => inst.currency === 'USD' || (!inst.currency && fw.freightCurrency === 'USD')).reduce((sum, inst) => sum + (inst.amount || 0), 0);
                          
                          const finalUsd = fw.finalAmountUsd || (fw.freightCurrency === 'USD' ? (fw.freightAmount ? Number(fw.freightAmount) : 0) : 0);
                          const finalKrw = fw.finalAmountKrw || (fw.amountKrw ? Number(fw.amountKrw) : 0) + (fw.freightCurrency === 'KRW' ? (fw.freightAmount ? Number(fw.freightAmount) : 0) : 0);
                          
                          const krwOutstanding = Math.max(0, finalKrw - krwPaid);
                          const usdOutstanding = Math.max(0, finalUsd - usdPaid);
                          const isCompleted = (finalKrw === 0 || krwOutstanding <= 0) && (finalUsd === 0 || usdOutstanding <= 0);
                          
                          const handleFwInstallmentChange = (instIdx: number, field: 'date' | 'amount' | 'currency', value: any) => {
                            const updatedList = [...installments];
                            updatedList[instIdx] = { ...updatedList[instIdx], [field]: value };
                            
                            setForwardersList(prev => prev.map((f, i) => {
                              if (i === idx) {
                                return { ...f, paymentInstallments: updatedList };
                              }
                              return f;
                            }));
                          };

                          return (
                            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 12px', background: idx % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                  <span style={{ fontWeight: 800, fontSize: '13px', color: '#6b21a8', width: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={fw.name || `포워더 #${idx+1}`}>{fw.name || `포워더 #${idx+1}`}</span>
                                </div>
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '11.5px' }}>
                                  <span>최종실비용: <strong>{finalUsd > 0 ? `$${finalUsd.toLocaleString()}` : ''} {finalUsd > 0 && finalKrw > 0 ? ' / ' : ''} {finalKrw > 0 ? `₩${finalKrw.toLocaleString()}` : (finalUsd === 0 ? '₩0' : '')}</strong></span>
                                  <span>송금: <strong style={{ color: '#0d9488' }}>{usdPaid > 0 ? `$${usdPaid.toLocaleString()}` : ''} {usdPaid > 0 && krwPaid > 0 ? ' / ' : ''} {krwPaid > 0 ? `₩${krwPaid.toLocaleString()}` : (usdPaid === 0 ? '₩0' : '')}</strong></span>
                                  <span>미수잔액: <strong style={{ color: (krwOutstanding > 0 || usdOutstanding > 0) ? '#ef4444' : '#64748b' }}>{usdOutstanding > 0 ? `$${usdOutstanding.toLocaleString()}` : ''} {usdOutstanding > 0 && krwOutstanding > 0 ? ' / ' : ''} {krwOutstanding > 0 ? `₩${krwOutstanding.toLocaleString()}` : (usdOutstanding === 0 ? '₩0' : '')}</strong></span>
                                  <span style={{ padding: '2px 6px', borderRadius: '4px', background: isCompleted ? '#dcfce7' : '#fee2e2', color: isCompleted ? '#15803d' : '#b91c1c', fontWeight: 700, fontSize: '10.5px' }}>
                                    {isCompleted ? '송금완료' : '지급대기'}
                                  </span>
                                </div>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', paddingLeft: '165px' }}>
                                {installments.map((inst, instIdx) => (
                                  <div key={instIdx} style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 8px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)', width: '270px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b' }}>{instIdx + 1}차</span>
                                      <input
                                        type="date"
                                        value={inst.date || ''}
                                        onChange={e => handleFwInstallmentChange(instIdx, 'date', e.target.value)}
                                        style={{ padding: '1px 4px', border: 'none', borderRight: '1px solid #e2e8f0', fontSize: '11px', width: '90px', outline: 'none' }}
                                      />
                                      <select
                                        value={inst.currency || fw.freightCurrency || 'KRW'}
                                        onChange={e => handleFwInstallmentChange(instIdx, 'currency', e.target.value)}
                                        style={{ padding: '1px 2px', border: 'none', fontSize: '11px', outline: 'none', background: 'transparent' }}
                                      >
                                        <option value="KRW">₩</option>
                                        <option value="USD">$</option>
                                      </select>
                                      <FormattedNumberInput
                                        placeholder="지급액"
                                        value={inst.amount || 0}
                                        onChange={val => handleFwInstallmentChange(instIdx, 'amount', val)}
                                        style={{ padding: '1px 4px', border: 'none', fontSize: '11px', width: '80px', textAlign: 'right', outline: 'none' }}
                                      />
                                      {installments.length > 1 && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const filtered = installments.filter((_, i) => i !== instIdx);
                                            const updated = filtered.length > 0 ? filtered : [{ date: '', amount: 0 }];
                                            setForwardersList(prev => prev.map((f, i) => {
                                              if (i === idx) return { ...f, paymentInstallments: updated };
                                              return f;
                                            }));
                                          }}
                                          style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '11px', fontWeight: 700, padding: '0 4px', marginLeft: '2px' }}
                                        >✕</button>
                                      )}
                                    </div>
                                    <div 
                                      style={{ 
                                        borderTop: '1px dashed #e2e8f0', 
                                        paddingTop: '4px', 
                                        display: 'flex', 
                                        flexDirection: 'column', 
                                        gap: '4px' 
                                      }}
                                      onPaste={async (e) => {
                                        const items = e.clipboardData.items;
                                        for (let fIdx = 0; fIdx < items.length; fIdx++) {
                                          if (items[fIdx].type.indexOf('image') !== -1) {
                                            const file = items[fIdx].getAsFile();
                                            if (file) {
                                              e.preventDefault();
                                              await handleFwReceiptUpload(file, idx, instIdx);
                                            }
                                          }
                                        }
                                      }}
                                    >
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                        <span style={{ fontSize: '8px', color: '#94a3b8' }}>📋 포커스 후 Ctrl+V로 캡처 첨부</span>
                                        <label style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '2px', background: '#f1f5f9', padding: '1px 4px', borderRadius: '3px', border: '1px solid #cbd5e1', fontSize: '8.5px', fontWeight: 600, color: '#475569' }}>
                                          <span>📎 첨부</span>
                                          <input 
                                            type="file" 
                                            style={{ display: 'none' }} 
                                            onChange={(e) => {
                                              if (e.target.files && e.target.files.length > 0) {
                                                handleFwReceiptUpload(e.target.files[0], idx, instIdx);
                                              }
                                            }}
                                          />
                                        </label>
                                      </div>
                                      {inst.receiptFiles && inst.receiptFiles.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                          {inst.receiptFiles.map((file, fileIdx) => (
                                            <div key={fileIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '2px 4px', borderRadius: '3px', border: '1px solid #e2e8f0' }}>
                                              <span 
                                                onClick={() => previewFile(file.url, file.name)}
                                                style={{ fontSize: '9px', color: '#2563eb', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}
                                                title="클릭하여 미리보기"
                                              >
                                                {file.name}
                                              </span>
                                              <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                                                <a href={file.url} download={file.name} target="_blank" rel="noopener noreferrer" style={{ fontSize: '8px', textDecoration: 'none', color: '#3b82f6', background: '#eff6ff', padding: '0 3px', borderRadius: '2px' }}>
                                                  ⬇
                                                </a>
                                                <button 
                                                  type="button" 
                                                  onClick={() => handleDeleteFwReceipt(idx, instIdx, fileIdx)} 
                                                  style={{ border: 'none', background: '#fee2e2', color: '#ef4444', borderRadius: '2px', cursor: 'pointer', fontSize: '8px', padding: '0 3px' }}
                                                >
                                                  ✕
                                                </button>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                      {uploadingFwReceipt?.fwIndex === idx && uploadingFwReceipt?.instIndex === instIdx && (
                                        <span style={{ fontSize: '8.5px', color: '#3b82f6' }}>⏳ 업로드 중...</span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newList = [...installments, { date: '', amount: 0 }];
                                    setForwardersList(prev => prev.map((f, i) => {
                                      if (i === idx) return { ...f, paymentInstallments: newList };
                                      return f;
                                    }));
                                  }}
                                  style={{ background: '#f1f5f9', border: '1px dashed #94a3b8', borderRadius: '4px', padding: '3px 10px', fontSize: '10.5px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}
                                >
                                  ＋ 내역 추가
                                </button>
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

          {/* 4. 수출관리 */}
          {activeStep === '수출관리' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              {/* 수출신고번호, 수출면장 기준환율 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>수출신고번호</span>
                <input type="text" value={basicForm.exportDeclarationNo || ''} onChange={e => setBasicForm(p => ({ ...p, exportDeclarationNo: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="예: 010-22-19-1234567" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>수출면장 기준환율</span>
                <input type="number" step="0.01" value={basicForm.customsExchangeRate || ''} onChange={e => setBasicForm(p => ({ ...p, customsExchangeRate: parseFloat(e.target.value) || 0 }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="예: 1352.50" />
              </div>
              <div />



              {/* 7개의 유첨 파일 + 신규 사진 유첨 추가 */}
              <div style={{ gridColumn: 'span 3', borderTop: '1px solid #cbd5e1', paddingTop: '12px', marginTop: '10px' }}>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                  {renderFileField('CI 유첨 (수동)', 'ciFiles', 'ci-file-input')}
                  {renderFileField('PL 유첨 (수동)', 'plFiles', 'pl-file-input')}
                  {renderFileField('COO 유첨', 'cooFiles', 'coo-file-input')}
                  {renderFileField('B/L 유첨', 'blFiles', 'bl-file-input')}
                </div>
              </div>

              <div style={{ gridColumn: 'span 3', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', borderTop: '1px dashed #cbd5e1', paddingTop: '10px', marginTop: '10px' }}>
                {renderFileField('수출면장 업로드', 'exportDeclarationFiles', 'export-declaration-file-input')}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {(() => {
                const customsRate = basicForm.customsExchangeRate || piData?.exchangeRate || 1350;
                const orderAmountUsd = piData?.totalUsd || 0;

                const purchaseUsd = sourcingItems?.reduce((sum: number, it: Partial<OrderItem>) => {
                  const info = getSupplierPurchaseInfo(it);
                  if (info.purchaseCurrency !== 'KRW') {
                    return sum + (info.purchasePrice * (it.qty || 0));
                  }
                  return sum;
                }, 0) || 0;
                const purchaseKrw = sourcingItems?.reduce((sum: number, it: Partial<OrderItem>) => {
                  const info = getSupplierPurchaseInfo(it);
                  if (info.purchaseCurrency === 'KRW') {
                    return sum + (info.purchasePrice * (it.qty || 0));
                  }
                  return sum;
                }, 0) || 0;
                const consolidatedPurchaseKrw = Math.round((purchaseUsd * customsRate) + purchaseKrw);

                // Sum all forwarders final actual costs (KRW + USD converted by customsRate)
                const forwarderExpenseKrw = forwardersList.reduce((sum, fw) => {
                  const usd = fw.finalAmountUsd || (fw.freightCurrency === 'USD' ? (fw.freightAmount ? Number(fw.freightAmount) : 0) : 0);
                  const krw = fw.finalAmountKrw || (fw.amountKrw ? Number(fw.amountKrw) : 0) + (fw.freightCurrency === 'KRW' ? (fw.freightAmount ? Number(fw.freightAmount) : 0) : 0);
                  return sum + krw + Math.round(usd * customsRate);
                }, 0);

                const totalCostKrw = consolidatedPurchaseKrw + forwarderExpenseKrw;
                const totalCostUsd = customsRate > 0 ? (totalCostKrw / customsRate) : 0;

                // 1. USD관점 이익 계산
                // 실제 USD이익 = 주문받은 금액(USD) - (매입가전체+운송비실비)/수출면장환율
                const actualUsdProfit = orderAmountUsd - totalCostUsd;
                const usdMargin = orderAmountUsd > 0 ? (actualUsdProfit / orderAmountUsd) * 100 : 0;

                // 2. KRW관점 이익 계산
                // 실제 KRW이익 = 주문받은 금액(USD)*수출환율 - (매입가전체+운송비실비)
                const orderAmountKrw = orderAmountUsd * customsRate;
                const actualKrwProfit = orderAmountKrw - totalCostKrw;
                const krwMargin = orderAmountKrw > 0 ? (actualKrwProfit / orderAmountKrw) * 100 : 0;

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* 상단 기본정보 카드 */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', background: '#f8fafc', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>주문 금액 (USD)</div>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                          ${orderAmountUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD
                        </div>
                      </div>
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', background: '#f8fafc', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>적용 수출면장환율</div>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                          ₩{customsRate.toLocaleString()} KRW
                        </div>
                        <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px' }}>
                          {basicForm.customsExchangeRate ? '수출면장 환율 적용됨' : 'PI 환율 또는 기본 환율 적용됨'}
                        </div>
                      </div>
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', background: '#f8fafc', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>환산 매출액 (KRW)</div>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                          ₩{Math.round(orderAmountKrw).toLocaleString()} KRW
                        </div>
                      </div>
                      <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', background: '#f8fafc', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>총 비용 (원가+운송비)</div>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: '#991b1b', marginTop: '4px' }}>
                          ₩{totalCostKrw.toLocaleString()} KRW
                        </div>
                        <div style={{ fontSize: '10px', color: '#b91c1c', marginTop: '2px' }}>
                          ${totalCostUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD 상당
                        </div>
                      </div>
                    </div>

                    {/* 하단 실제 이익 분석 카드 */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px', marginTop: '8px' }}>
                      {/* USD 관점 */}
                      <div style={{ border: '1px solid #1e3a8a', borderRadius: '12px', padding: '16px', background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', color: '#1e40af', fontWeight: 700 }}>💵 USD 관점 실제 이익</span>
                          <span style={{ fontSize: '11px', color: '#3b82f6', background: '#ffffff', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>영업이익률</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '12px' }}>
                          <span style={{ fontSize: '20px', fontWeight: 900, color: '#1e3a8a' }}>
                            ${actualUsdProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD
                          </span>
                          <span style={{ fontSize: '20px', fontWeight: 900, color: '#2563eb' }}>
                            {usdMargin.toFixed(2)}%
                          </span>
                        </div>
                        <div style={{ fontSize: '9.5px', color: '#60a5fa', marginTop: '10px', borderTop: '1px dashed #bfdbfe', paddingTop: '8px' }}>
                          공식: 주문받은 금액(USD) - (매입가전체 + 운송비실비) / 수출면장환율
                        </div>
                      </div>

                      {/* KRW 관점 */}
                      <div style={{ border: '1px solid #065f46', borderRadius: '12px', padding: '16px', background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', color: '#065f46', fontWeight: 700 }}>🪙 KRW 관점 실제 이익</span>
                          <span style={{ fontSize: '11px', color: '#10b981', background: '#ffffff', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>영업이익률</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '12px' }}>
                          <span style={{ fontSize: '20px', fontWeight: 900, color: '#065f46' }}>
                            ₩{Math.round(actualKrwProfit).toLocaleString()} KRW
                          </span>
                          <span style={{ fontSize: '20px', fontWeight: 900, color: '#059669' }}>
                            {krwMargin.toFixed(2)}%
                          </span>
                        </div>
                        <div style={{ fontSize: '9.5px', color: '#34d399', marginTop: '10px', borderTop: '1px dashed #a7f3d0', paddingTop: '8px' }}>
                          공식: 주문받은 금액(USD) * 수출환율 - (매입가전체 + 운송비실비)
                        </div>
                      </div>
                    </div>

                    {/* 수금 내역 관리 (분할 영수 지원) */}
                    <div style={{ marginTop: '16px', borderTop: '1px solid #cbd5e1', paddingTop: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 800, color: '#1e3a8a' }}>🪙 대금 수금 관리 (분할 영수)</span>
                        <button
                          type="button"
                          onClick={() => {
                            const current = basicForm.paymentCollectedInstallments || [];
                            setBasicForm(p => ({
                              ...p,
                              paymentCollectedInstallments: [...current, { date: '', amount: 0, fee: 0, total: 0, currency: 'USD' }]
                            }));
                          }}
                          style={{ background: '#2563eb', border: 'none', borderRadius: '4px', padding: '4px 10px', fontSize: '11px', fontWeight: 700, color: '#fff', cursor: 'pointer' }}
                        >
                          ＋ 수금 내역 추가
                        </button>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {(!basicForm.paymentCollectedInstallments || basicForm.paymentCollectedInstallments.length === 0) ? (
                          <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', border: '1px dashed #cbd5e1', borderRadius: '6px', backgroundColor: '#f8fafc' }}>
                            등록된 수금 내역이 없습니다. '수금 내역 추가' 버튼을 눌러 등록해주세요.
                          </div>
                        ) : (
                          basicForm.paymentCollectedInstallments.map((inst, index) => {
                            const handleCollectFieldChange = (field: string, val: any) => {
                              const list = [...(basicForm.paymentCollectedInstallments || [])];
                              const updated = { ...list[index], [field]: val };
                              
                              // Automatically compute total = amount + fee if appropriate, or keep total as input.
                              // Let's do: total = amount + fee as standard, but user can edit it or we calculate it.
                              if (field === 'amount' || field === 'fee') {
                                const amt = field === 'amount' ? val : (updated.amount || 0);
                                const fee = field === 'fee' ? val : (updated.fee || 0);
                                updated.total = amt + fee;
                              }
                              
                              list[index] = updated;
                              setBasicForm(p => ({ ...p, paymentCollectedInstallments: list }));
                            };

                            return (
                              <div key={index} style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '12px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
                                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>{index + 1}차 수금</span>
                                  
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <span style={{ fontSize: '10.5px', color: '#64748b' }}>대금영수일자</span>
                                    <input
                                      type="date"
                                      value={inst.date || ''}
                                      onChange={e => handleCollectFieldChange('date', e.target.value)}
                                      style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', width: '130px' }}
                                    />
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <span style={{ fontSize: '10.5px', color: '#64748b' }}>통화</span>
                                    <select
                                      value={inst.currency || 'USD'}
                                      onChange={e => handleCollectFieldChange('currency', e.target.value)}
                                      style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                                    >
                                      <option value="USD">USD ($)</option>
                                      <option value="KRW">KRW (₩)</option>
                                      <option value="CNY">CNY (¥)</option>
                                      <option value="EUR">EUR (€)</option>
                                    </select>
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <span style={{ fontSize: '10.5px', color: '#64748b' }}>입금액</span>
                                    <FormattedNumberInput
                                      value={inst.amount || 0}
                                      onChange={val => handleCollectFieldChange('amount', val)}
                                      style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', width: '120px', textAlign: 'right' }}
                                    />
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <span style={{ fontSize: '10.5px', color: '#64748b' }}>은행수수료</span>
                                    <FormattedNumberInput
                                      value={inst.fee || 0}
                                      onChange={val => handleCollectFieldChange('fee', val)}
                                      style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', width: '100px', textAlign: 'right' }}
                                    />
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <span style={{ fontSize: '10.5px', color: '#64748b' }}>총액 (입금액 + 수수료)</span>
                                    <FormattedNumberInput
                                      value={inst.total || 0}
                                      onChange={val => handleCollectFieldChange('total', val)}
                                      style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', width: '120px', textAlign: 'right', fontWeight: 'bold', backgroundColor: '#f1f5f9' }}
                                      disabled
                                    />
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (window.confirm(`${index + 1}차 수금 내역을 삭제하시겠습니까?`)) {
                                        const list = (basicForm.paymentCollectedInstallments || []).filter((_, i) => i !== index);
                                        setBasicForm(p => ({ ...p, paymentCollectedInstallments: list }));
                                      }
                                    }}
                                    style={{ background: '#ef4444', border: 'none', borderRadius: '4px', padding: '6px 10px', fontSize: '11px', color: '#fff', cursor: 'pointer', alignSelf: 'flex-end' }}
                                  >
                                    삭제
                                  </button>
                                </div>

                                {/* 외국환거래영수증 파일 첨부 영역 (Ctrl+V paste 지원) */}
                                <div 
                                  style={{ 
                                    borderTop: '1px dashed #cbd5e1', 
                                    paddingTop: '8px', 
                                    marginTop: '4px',
                                    display: 'flex', 
                                    flexDirection: 'column', 
                                    gap: '6px' 
                                  }}
                                  onPaste={async (e) => {
                                    const items = e.clipboardData.items;
                                    for (let fIdx = 0; fIdx < items.length; fIdx++) {
                                      if (items[fIdx].type.indexOf('image') !== -1) {
                                        const file = items[fIdx].getAsFile();
                                        if (file) {
                                          e.preventDefault();
                                          await handleCollectReceiptUpload(file, index);
                                        }
                                      }
                                    }
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>📄 외국환거래영수증 (화면 캡처 첨부)</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <span style={{ fontSize: '11px', color: '#64748b' }}>이 영역 클릭 후 <strong>Ctrl + V</strong> 로 화면 캡처 이미지 붙여넣기</span>
                                      <input
                                        type="file"
                                        accept="image/*"
                                        id={`collect-receipt-upload-${index}`}
                                        style={{ display: 'none' }}
                                        onChange={async (e) => {
                                          const file = e.target.files?.[0];
                                          if (file) {
                                            await handleCollectReceiptUpload(file, index);
                                          }
                                        }}
                                      />
                                      <label
                                        htmlFor={`collect-receipt-upload-${index}`}
                                        style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', color: '#475569', cursor: 'pointer', fontWeight: 600 }}
                                      >
                                        파일 선택
                                      </label>
                                    </div>
                                  </div>

                                  {inst.receiptFiles && inst.receiptFiles.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                                      {inst.receiptFiles.map((file, fIdx) => (
                                        <div key={fIdx} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '3px 8px', borderRadius: '4px' }}>
                                          <span 
                                            onClick={() => previewFile(file.url, file.name)} 
                                            style={{ fontSize: '11.5px', color: '#2563eb', textDecoration: 'underline', cursor: 'pointer', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                          >
                                            {file.name}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteCollectReceipt(index, fIdx)}
                                            style={{ border: 'none', background: 'transparent', color: '#ef4444', fontSize: '12px', cursor: 'pointer', padding: '0 2px' }}
                                          >
                                            ✕
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {uploadingCollectReceipt === index && (
                                    <span style={{ fontSize: '11px', color: '#2563eb', fontWeight: 600 }}>⏳ 외국환거래영수증 업로드 중...</span>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* 수금 통화별 합계 요약 기록 */}
                      {basicForm.paymentCollectedInstallments && basicForm.paymentCollectedInstallments.length > 0 && (
                        <div style={{ marginTop: '12px', padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '12px', fontWeight: 800, color: '#166534' }}>📊 수금 및 발주금액 비교 요약 (실시간)</span>
                            </div>
                            <div style={{ fontSize: '11px', color: '#166534', background: '#dcfce7', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
                              PO 접수 총액: ${orderAmountUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD
                            </div>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px dashed #bbf7d0', paddingTop: '6px' }}>
                            {['USD', 'KRW', 'CNY', 'EUR'].map(curr => {
                              const items = (basicForm.paymentCollectedInstallments || []).filter(i => (i.currency || 'USD') === curr);
                              if (items.length === 0) return null;
                              const sumAmount = items.reduce((sum, i) => sum + (i.amount || 0), 0);
                              const sumFee = items.reduce((sum, i) => sum + (i.fee || 0), 0);
                              const sumTotal = items.reduce((sum, i) => sum + (i.total || 0), 0);
                              const symbol = curr === 'USD' ? '$' : curr === 'KRW' ? '₩' : curr === 'CNY' ? '¥' : '€';

                              // Calculate collected progress percentage compared to PO Amount if the currency is USD.
                              // (Since PO Amount is in USD). If non-USD, we just show totals.
                              let progressText = '';
                              if (curr === 'USD' && orderAmountUsd > 0) {
                                const percent = (sumAmount / orderAmountUsd) * 100;
                                progressText = ` (PO 대비 입금액 수금율: ${percent.toFixed(2)}%)`;
                              }

                              return (
                                <div key={curr} style={{ fontSize: '12px', color: '#14532d', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
                                  <span style={{ fontWeight: 800, minWidth: '60px' }}>• {curr} 합계:</span>
                                  <span>입금액: <strong>{symbol}{sumAmount.toLocaleString(undefined, { minimumFractionDigits: curr === 'KRW' ? 0 : 2, maximumFractionDigits: curr === 'KRW' ? 0 : 2 })}</strong></span>
                                  <span style={{ color: '#166534' }}>수수료: {symbol}{sumFee.toLocaleString(undefined, { minimumFractionDigits: curr === 'KRW' ? 0 : 2, maximumFractionDigits: curr === 'KRW' ? 0 : 2 })}</span>
                                  <span style={{ color: '#15803d', fontWeight: 'bold' }}>총액(합계): {symbol}{sumTotal.toLocaleString(undefined, { minimumFractionDigits: curr === 'KRW' ? 0 : 2, maximumFractionDigits: curr === 'KRW' ? 0 : 2 })}</span>
                                  {progressText && <span style={{ color: '#2563eb', fontWeight: 800 }}>{progressText}</span>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* 5. 변경이력(Log) */}
          {activeStep === '변경이력(Log)' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 800, color: '#1e3a8a' }}>📋 오더 변경 및 액션 이력 로그</h4>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
                  이 오더에 대해 시스템에서 수행된 발행, 수정, 삭제 등의 중요 활동 로그를 기록하고 타임라인으로 조회합니다.
                </div>
                {(order as any).history_logs && (order as any).history_logs.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(order as any).history_logs.map((log: any, index: number) => (
                      <div key={index} style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 'bold', fontSize: '12.5px', color: '#334155' }}>
                            {log.actionType === 'create' ? '✨ 신규 생성' : 
                             log.actionType === 'update' ? '✏️ 기본정보 수정' :
                             log.actionType === 'po_issue' ? '📄 발주서 발행' :
                             log.actionType === 'po_delete' ? '🗑️ 발주서 취소' : '🔔 액션 수행'}
                          </span>
                          <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                            {new Date(log.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#475569', whiteSpace: 'pre-wrap' }}>
                          {log.description}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>
                          수행자: {log.user || 'System'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '20px', textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: '6px', color: '#94a3b8', fontSize: '12px', border: '1px solid #e2e8f0' }}>
                    기록된 활동 로그가 없습니다. 변경 사항이 생기면 이력이 자동 기록됩니다.
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

      {isProductSearchOpen && searchItemIndex !== null && (
        <ProductSearchModal
          products={products}
          onClose={() => {
            setIsProductSearchOpen(false);
            setIsSourcingSearch(false);
          }}
          onSelect={(prod) => {
            if (isSourcingSearch) {
              handleSelectSourcingProduct(searchItemIndex, prod);
            } else {
              handleSelectProduct(searchItemIndex, prod);
            }
            setIsProductSearchOpen(false);
            setIsSourcingSearch(false);
          }}
        />
      )}

      {isForwarderSearchOpen && forwarderSearchIndex !== null && (
        <ForwarderSearchModal
          suppliers={suppliersList}
          onClose={() => {
            setIsForwarderSearchOpen(false);
            setForwarderSearchIndex(null);
          }}
          onSelect={(supplier) => {
            handleForwarderChange(forwarderSearchIndex, 'name', supplier.name);
            setIsForwarderSearchOpen(false);
            setForwarderSearchIndex(null);
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
            portOfLoading: basicForm.portOfLoading || 'BUSAN PORT, SOUTH KOREA',
            finalDestination: basicForm.portOfDischarge || '',
            carrier: basicForm.vesselBooking || '',
            sailingOnOrAbout: basicForm.etd || '',
            cfsAddress: basicForm.cfsContactInfo || basicForm.cfsAddress || 'CMK LOGISTICS / 김경태 주임 / T.055-543-7200\n경남 창원시 진해구 신항8로 13',
            cfsEntryDate: basicForm.cfsEntryDate || '',
            items: activeArrivalReport.items
          }}
          packingList={basicForm.packingList}
          initialData={(order.supplierArrivalReports || {})[activeArrivalReport.supplierName]}
          defaultShippingMark={getDefaultShippingMark('1', '1')}
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
                          <th style="width: 25%">10) Marks</th>
                          <th style="width: 25%">11) Description of Goods</th>
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
                              ${renderShippingMarkCellHtml(it.marks)}
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
      {isPackerModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '95vw', height: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)' }}>
            <div style={{ padding: '12px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '15px', fontWeight: 800, color: '#1e3a8a' }}>🚢 3D 컨테이너 적재 시뮬레이션 연동</span>
              <button 
                onClick={() => setIsPackerModalOpen(false)} 
                style={{ padding: '4px 10px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
              >
                ✕ 닫기
              </button>
            </div>
            <div style={{ flex: 1, position: 'relative' }}>
              <iframe
                src="/container/index.html"
                title="컨테이너 적재 프로그램"
                onLoad={(e) => {
                  const iframe = e.currentTarget;
                  if (!iframe || !iframe.contentWindow) return;

                  // Map currently entered Container Packing List items
                  const itemsPayload: any[] = [];
                  if (basicForm.packingList?.containers) {
                    basicForm.packingList.containers.forEach((c: any) => {
                      (c.items || []).forEach((it: any) => {
                        if (!it.description && !it.pkgNo) return; // Skip empty container row mockups
                        const cleanDims = String(it.dimensions || '1100x1100x1000').toLowerCase().replace(/\s+/g, '');
                        const dims = cleanDims.split('x');
                        const w = Number(dims[0]) || 1100;
                        const d = Number(dims[1]) || 1100;
                        const h = Number(dims[2]) || 1000;
                        
                        itemsPayload.push({
                          desc: it.description || '화물',
                          qty: Number(it.pkg) || 1,
                          w: w,
                          d: d,
                          h: h,
                          netWeight: Number(it.netWeight) || 0,
                          grossWeight: Number(it.grossWeight) || 0,
                          packageType: it.packageType || 'Pallet'
                        });
                      });
                    });
                  }
                  
                  // Fallback to orderItems if packing list has no items yet
                  if (itemsPayload.length === 0) {
                    orderItems.forEach((item: any) => {
                      const match = (item.name || '').match(/^\[(.*?)\]\s*(.*)$/);
                      const itemCode = match ? match[1] : '-';
                      const matchedProd = products.find(p => p.productCode === itemCode || p.id === itemCode || p.id === item.itemId);
                      
                      // Map registered packing method default specs if available
                      const list = matchedProd?.packingMethods || [];
                      const isPlt = (item.packageType || '').toLowerCase().includes('pallet');
                      const w = Number(isPlt ? (list[0]?.palletWidth || matchedProd?.palletWidth) : matchedProd?.unitWidth) || 1100;
                      const d = Number(isPlt ? (list[0]?.palletLength || matchedProd?.palletLength) : matchedProd?.unitLength) || 1100;
                      const h = Number(isPlt ? (list[0]?.palletHeight || matchedProd?.palletHeight) : matchedProd?.unitHeight) || 1000;
                      
                      itemsPayload.push({
                        desc: item.name || '화물',
                        qty: item.qty || 1,
                        w: w,
                        d: d,
                        h: h,
                        netWeight: Number(item.netWeight || matchedProd?.palletWeight || 0),
                        grossWeight: Number(item.grossWeight || matchedProd?.palletGrossWeight || 0),
                        packageType: item.packageType || 'Pallet'
                      });
                    });
                  }

                  const containersPayload: Record<string, number> = {};
                  if (basicForm.packingList?.containers) {
                    basicForm.packingList.containers.forEach((c: any) => {
                      const type = c.containerType || '20GP';
                      containersPayload[type] = (containersPayload[type] || 0) + 1;
                    });
                  }
                  if (Object.keys(containersPayload).length === 0) {
                    containersPayload['20GP'] = 1;
                  }

                  iframe.contentWindow.postMessage({
                    type: 'LOAD_PI_DATA',
                    customer: basicForm.customer || '',
                    piNumber: basicForm.piNumber || order?.id || '',
                    date: basicForm.etd || new Date().toISOString().split('T')[0],
                    containers: containersPayload,
                    items: itemsPayload
                  }, '*');
                }}
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                }}
                allow="clipboard-write"
              />
            </div>
          </div>
        </div>
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
