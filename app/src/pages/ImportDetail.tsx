import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import type { ImportRequest, TaxDocumentRow } from '../types';
import { storage, db, COMPANY_ID } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { CustomerSearchModal } from '../components/CustomerSearchModal';
import { SupplierSearchModal } from '../components/SupplierSearchModal';
import type { Customer } from '../types/customer';
import { previewFile } from '../components/FilePreviewModal';
import { ProductSearchModal } from '../components/ProductSearchModal';
import type { Product } from '../types/product';

import ysaccLetterImg from '../assets/ysacc_letterhead.png';
import ysAccLetterImg from '../assets/ys_acc_letterhead.png';
import ysaccStampImg from '../assets/ysacc_stamp.png';

const DEFAULT_REQUEST = (id: string): ImportRequest => ({
  id: id || '',
  status: '진행 결정 요청',
  blAwb: '-',
  poNumber: '-',
  itemName: '',
  transportType: 'By Sea',
  volume: '',
  routeFrom: '',
  routeTo: '',
  manager: '김주한',
  amount: 0,
  createdAt: new Date().toLocaleDateString(),
  importCompany: 'YSACC',
  importerName: '',
  finalCustomer: '',
  origin: 'CHINA',
  requestDate: new Date().toISOString().slice(0, 10),
  requestedBy: '',
  requestNote: '',
  piItems: [{ name: '', qty: '', unitPrice: '', amount: '', hsCode: '', unit: 'EA', palletSize: '', cbm: '', netWeight: '', grossWeight: '' }],
  supplierQuotes: [],
  costBreakdown: {
    productCost: 0,
    freightCost: 0,
    customsCost: 0,
    otherCost: 0,
    todayExchangeRate: 0,
    appliedExchangeRate: 0,
    buyingPriceUsd: 0,
    buyingQty: 0,
    ftaTaxRate: 0,
    antiDumpingRate: 0,
    transferFee: 0,
    importDeclareFee: 0,
    localTransportCost: 0
  },
  marginRate: 0,
  marginAmount: 0,
  customerQuoteAmount: 0,
  portOfLoading: '',
  portOfDischarge: '인천항',
  packingQty: 1,
  packingUnit: 'PALLET',
  dimensions: '',
  weight: '',
  dangerousCargo: '미포함',
  msdsStatus: '미포함',
  lssIncluded: '포함',
  localTransportType: '독차',
  customsAgent: '이음관세사무소',
  cargoInsurance: '미신청',
  ftaOriginCert: '미신청'
} as ImportRequest);

interface UploadZoneProps {
  onFileSelect: (file: File) => void;
  label: string;
  isUploading: boolean;
  compact?: boolean;
}

const UploadZone: React.FC<UploadZoneProps> = ({ onFileSelect, label, isUploading, compact }) => {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1 || items[i].kind === "file") {
        const blob = items[i].getAsFile();
        if (blob) {
          const originalName = blob.name || `file_${Date.now()}`;
          const ext = originalName.split('.').pop() || 'png';
          const file = new File([blob], originalName.includes('.') ? originalName : `${originalName}.${ext}`, { type: blob.type });
          onFileSelect(file);
          break;
        }
      }
    }
  };

  const handleClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  if (compact) {
    return (
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPaste={handlePaste}
        onClick={handleClick}
        tabIndex={0}
        style={{
          position: 'relative',
          border: dragOver ? '2px dashed #2563eb' : '1.5px dashed #cbd5e1',
          padding: '6px 12px',
          borderRadius: '4px',
          fontSize: '12px',
          color: dragOver ? '#2563eb' : '#64748b',
          background: dragOver ? '#eff6ff' : '#f8fafc',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          outline: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          minHeight: '34px',
          boxSizing: 'border-box'
        }}
        onMouseEnter={e => {
          if (!dragOver) {
            e.currentTarget.style.borderColor = '#94a3b8';
            e.currentTarget.style.background = '#f1f5f9';
          }
        }}
        onMouseLeave={e => {
          if (!dragOver) {
            e.currentTarget.style.borderColor = '#cbd5e1';
            e.currentTarget.style.background = '#f8fafc';
          }
        }}
      >
        <span style={{ fontSize: '12px' }}>📎</span>
        <span style={{ fontWeight: 600, fontSize: '11px' }}>
          {isUploading ? '업로드 중...' : '클릭 또는 드래그하여 파일 첨부'}
        </span>
        <input 
          type="file" 
          ref={fileInputRef} 
          disabled={isUploading}
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              onFileSelect(e.target.files[0]);
            }
          }}
          style={{ display: 'none' }} 
        />
      </div>
    );
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPaste={handlePaste}
      onClick={handleClick}
      tabIndex={0}
      style={{
        position: 'relative',
        border: dragOver ? '2px dashed #2563eb' : '1px dashed #cbd5e1',
        padding: '16px 12px',
        borderRadius: '6px',
        textAlign: 'center',
        fontSize: '12px',
        color: dragOver ? '#2563eb' : '#475569',
        background: dragOver ? '#eff6ff' : '#f8fafc',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        outline: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
        <span style={{ fontSize: '14px' }}>📁</span>
        <span style={{ fontWeight: 600, fontSize: '12.5px', color: '#475569' }}>
          {isUploading ? '업로드 중...' : (label && !label.includes('드래그') ? `이곳에 ${label} 관련 파일이나 캡처 이미지(Ctrl+V)를 드래그 앤 드롭하여 첨부하세요.` : '이곳에 파일이나 캡처 이미지(Ctrl+V)를 드래그 앤 드롭하여 첨부하세요.')}
        </span>
      </div>
      <button
        type="button"
        disabled={isUploading}
        style={{
          background: '#3b82f6',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          height: '34px',
          padding: '0 16px',
          fontSize: '12.5px',
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          transition: 'background-color 0.2s'
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
      >
        파일 선택하기
      </button>
      <input
        type="file"
        ref={fileInputRef}
        disabled={isUploading}
        onChange={e => e.target.files?.[0] && onFileSelect(e.target.files[0])}
        style={{ display: 'none' }}
      />
    </div>
  );
};

export const ImportDetail: React.FC = () => {
  const calculateTotalCostHelper = (cb: any, piItems: any[] = []) => {
    const applied = cb.appliedExchangeRate || 1450;
    const priceUsd = cb.buyingPriceUsd || 0;
    const qty = cb.buyingQty || 1;
    
    const goodsAmountKrw = priceUsd * applied * qty;
    const freightKrw = (cb.freightUsd || 0) * applied;
    const insuranceKrw = (cb.insuranceUsd || 0) * applied;
    const originInlandKrw = (cb.originInlandUsd || 0) * applied;
    
    const cifKrw = Math.round(goodsAmountKrw + freightKrw + insuranceKrw + originInlandKrw);
    const customsDuty = Math.round(cifKrw * (((cb.ftaTaxRate || 0) + (cb.antiDumpingRate || 0)) / 100));
    const vatKrw = Math.round((cifKrw + customsDuty) * 0.1);
    
    const clearanceFee = cb.clearanceFee || 0;
    const portFee = cb.portFee || 0;
    const domesticTransportFee = cb.domesticTransportFee || 0;
    const handlingFee = cb.handlingFee || 0;
    const otherFee = cb.otherFee || 0;
    
    const totalImportCost = cifKrw + customsDuty + clearanceFee + portFee + domesticTransportFee + handlingFee + otherFee;
    const totalCashRequired = totalImportCost + vatKrw;
    
    const totalWeight = piItems.reduce((sum, it) => sum + (Number(it.grossWeight) || Number(it.weight) || 0), 0) || 1;
    
    return {
      goodsAmountKrw,
      freightKrw,
      insuranceKrw,
      originInlandKrw,
      cifKrw,
      customsDuty,
      vatKrw,
      totalImportCost,
      totalCashRequired,
      unitCost: Math.round(totalImportCost / qty),
      kgCost: Math.round(totalImportCost / totalWeight)
    };
  };

  const calculateDetailTotalCost = (req: any) => {
    const cb = req.costBreakdown || {};
    const res = calculateTotalCostHelper(cb, req.piItems || []);
    return res.totalImportCost;
  };

  const recalculateDetailCosts = (prevList: any[], nextB: any) => {
    return prevList.map(r => {
      if (r.id === id) {
        const totalCost = calculateDetailTotalCost({ ...r, costBreakdown: nextB });
        const rate = r.marginRate || 0;
        const marginAmount = Math.round(totalCost * (rate / 100));
        return { ...r, costBreakdown: nextB, marginAmount, customerQuoteAmount: totalCost + marginAmount };
      }
      return r;
    });
  };
    const { id } = useParams<{ id: string }>();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showEstimatePrintModal, setShowEstimatePrintModal] = useState(false);
  const [printCurrency, setPrintCurrency] = useState<'KRW' | 'USD'>('KRW');
  const [products, setProducts] = useState<Product[]>([]);
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [productSearchTargetIdx, setProductSearchTargetIdx] = useState<number | null>(null);

  // 실시간 상품 DB 가져오기 (매핑 순서 교정 적용)
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'companies', COMPANY_ID, 'products'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Product));
      setProducts(list);
    }, (error) => {
      console.error("Failed to sync products in ImportDetail:", error);
    });
    return () => unsubscribe();
  }, []);

  // 실시간 고객 DB 가져오기
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'companies', COMPANY_ID, 'customers'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
      setCustomers(list);
    }, (error) => {
      console.error("Failed to sync customers in ImportDetail:", error);
    });
    return () => unsubscribe();
  }, []);


  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  
  const [importRequests, setImportRequests] = useState<ImportRequest[]>([]);

  // Clipboard Paste (Screen Capture) 리스너 (선언 뒤에 위치시켜 정상 빌드)
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            const renameFile = new File([file], `Captured_${Date.now()}.png`, { type: 'image/png' });
            await handleFileUpload('customerPi', renameFile);
            alert('클립보드 스크린샷 이미지가 성공적으로 자동 첨부되었습니다!');
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [importRequests, id]);

  useEffect(() => {
    const importsRef = collection(doc(db, 'companies', COMPANY_ID), 'imports');
    const unsubscribe = onSnapshot(importsRef, (snap) => {
      if (snap.empty) {
        setImportRequests([]);
      } else {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ImportRequest));
        setImportRequests(list);
      }
    }, (error) => {
      console.error('Failed to sync imports from Firestore:', error);
    });
    return () => unsubscribe();
  }, []);

  const saveToStorage = (updatedList: ImportRequest[]) => {
    setImportRequests(updatedList); // 낙관적 업데이트 (Firestore onSnapshot이 곧 확정값으로 재동기화)
    const updatedRecord = updatedList.find(r => r.id === id);
    if (updatedRecord) {
      const { id: recId, ...rest } = updatedRecord;
      setDoc(doc(db, 'companies', COMPANY_ID, 'imports', recId), rest, { merge: true }).catch(err => {
        console.error('Failed to save import doc:', err);
      });
    }
  };

  const request = importRequests.find(r => r.id === id) || DEFAULT_REQUEST(id || '');
  const viewMode = searchParams.get('mode') || (request.customerDecision === '승인' ? 'active' : 'quote');
  const currentLetterhead: 'YSACC' | '영성ACC' = (!request.importCompany || request.importCompany === 'YSACC' || request.importCompany === 'YS') ? 'YSACC' : '영성ACC';
  const [activeTab, setActiveTab] = useState<'수입품 견적요청' | '견적수령/네고' | '수입원가계산' | '견적서작성' | '견적/원가' | '수입내역' | '대금결제' | '운송사/관세사 선정' | '서류' | '정산' | '손익검토' | '로그'>('수입품 견적요청');
  const [commonShippingMark, setCommonShippingMark] = useState(() => {
    return {
      shape: (request as any).commonShippingMark?.shape || 'diamond',
      company: (request as any).commonShippingMark?.company || (!request.importCompany || request.importCompany === 'YS' || request.importCompany === 'YSACC' ? 'YSACC' : 'YS ACC'),
      port: (request as any).commonShippingMark?.port || request.pod || 'INCHEON',
      country: (request as any).commonShippingMark?.country || 'KOREA',
      origin: (request as any).commonShippingMark?.origin || request.origin || 'MADE IN CHINA'
    };
  });
  const [showPoModal, setShowPoModal] = useState<boolean>(false);
  const [showDealStatementModal, setShowDealStatementModal] = useState<boolean>(false);
  const [dealStatementData, setDealStatementData] = useState<{
    date: string;
    receiverBizNo: string;
    receiverName: string;
    receiverCEO: string;
    receiverAddr: string;
    receiverType: string;
    receiverItem: string;
    items: Array<{ month: string; day: string; name: string; spec: string; qty: number; price: number; remarks: string }>;
    receivableAmount: number;
    receiverSign: string;
  }>({
    date: '',
    receiverBizNo: '',
    receiverName: '',
    receiverCEO: '',
    receiverAddr: '',
    receiverType: '',
    receiverItem: '',
    items: [],
    receivableAmount: 0,
    receiverSign: ''
  });
  const [showForwarderModal, setShowForwarderModal] = useState<boolean>(false);
  const [showSupplierSearchModal, setShowSupplierSearchModal] = useState<boolean>(false);
  const [isCostTableExpanded, setIsCostTableExpanded] = useState<boolean>(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadingQuoteId, setUploadingQuoteId] = useState<string | null>(null);
  const [forwarders, setForwarders] = useState<any[]>([]);
  const [allSuppliers, setAllSuppliers] = useState<any[]>([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'companies', 'YSACC', 'suppliers'), (snapshot) => {
      const allList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      const fwList = allList.filter(supplier => supplier.category === '포워딩사');
      setForwarders(fwList);
      setAllSuppliers(allList);
    }, (error) => {
      console.error("Failed to sync suppliers/forwarders in ImportDetail:", error);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (request && request.id === id) {
      if (viewMode === 'quote') {
        setActiveTab('수입품 견적요청');
      } else {
        setActiveTab('수입내역');
      }
    }
  }, [request?.id, request?.customerDecision, id, viewMode]);

  const handleDownloadPdf = () => {
    const element = document.getElementById('po-print-area');
    if (!element) return alert('PDF 다운로드 대상을 찾을 수 없습니다.');

    const runHtml2Pdf = () => {
      const opt = {
        margin:       [10, 10, 10, 10],
        filename:     `PO_${id}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      (window as any).html2pdf().from(element).set(opt).save();
    };

    if (!(window as any).html2pdf) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      script.onload = () => {
        runHtml2Pdf();
      };
      document.body.appendChild(script);
    } else {
      runHtml2Pdf();
    }
  };

  const [documents, setDocuments] = useState<{ [key: string]: any }>({
    bizReg: { name: 'bizReg_YSACC.pdf', url: '#' }
  });

  // Firestore에서 불러온 request.documents 로 동기화 (구 localStorage 이관 완료 후 단일 소스로 사용)
  useEffect(() => {
    const docs = (request as any)?.documents;
    if (docs) setDocuments(docs);
  }, [request?.id, JSON.stringify((request as any)?.documents)]);

  const handleQuoteFileUpload = async (quoteId: string, file: File) => {
    if (!file) return;
    try {
      setUploadingQuoteId(quoteId);
      const storageRef = ref(storage, `imports/${id}/supplierQuotes/${quoteId}/${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(snapshot.ref);

      const nextQuotes = (request.supplierQuotes || []).map((q: any) => {
        if (q.id === quoteId) {
          const currentFiles = Array.isArray(q.files) ? q.files : (q.files ? [q.files] : []);
          return {
            ...q,
            files: [...currentFiles, { name: file.name, url: downloadUrl }]
          };
        }
        return q;
      });

      saveToStorage(importRequests.map(r => r.id === id ? { ...r, supplierQuotes: nextQuotes } : r));
      alert(`${file.name} 업로드가 완료되었습니다.`);
    } catch (e) {
      console.error(e);
      alert('업로드 실패');
    } finally {
      setUploadingQuoteId(null);
    }
  };

  const handleQuoteFileDelete = (quoteId: string, fileIndex: number) => {
    if (window.confirm('선택한 파일을 삭제하시겠습니까?')) {
      const nextQuotes = (request.supplierQuotes || []).map((q: any) => {
        if (q.id === quoteId) {
          const currentFiles = Array.isArray(q.files) ? q.files : (q.files ? [q.files] : []);
          const nextFiles = currentFiles.filter((_: any, idx: number) => idx !== fileIndex);
          return {
            ...q,
            files: nextFiles.length > 0 ? nextFiles : null
          };
        }
        return q;
      });
      saveToStorage(importRequests.map(r => r.id === id ? { ...r, supplierQuotes: nextQuotes } : r));
    }
  };

  const handleFileUpload = async (key: 'ciPl' | 'bizReg' | 'co' | 'etc' | 'customerPi' | 'freightInvoice' | 'inspect' | 'customsPermit' | 'taxInvoice' | 'blAwbDoc' | 'hsCustomsInfo' | 'freightDoc' | 'costCalcDocs' | 'supplierPi' | string, file: File) => {
    if (!file) return;
    try {
      setUploading(key);
      let storagePathKey = key;
      if (key.startsWith('paymentFxMemo_') || key.startsWith('paymentRemittanceSlip_')) {
        storagePathKey = key.split('_')[0];
      }
      const storageRef = ref(storage, `imports/${id}/documents/${storagePathKey}/${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(snapshot.ref);

      if (key.startsWith('paymentFxMemo_') || key.startsWith('paymentRemittanceSlip_')) {
        const parts = key.split('_');
        const fileType = parts[0] === 'paymentFxMemo' ? 'fxMemoFiles' : 'remittanceSlipFiles';
        const paymentId = parts[1];

        const updatedList = importRequests.map(r => {
          if (r.id === id) {
            const currentPayments = r.payments || [];
            const updatedPayments = currentPayments.map(p => {
              if (p.id === paymentId) {
                const currentFiles = p[fileType] || [];
                return {
                  ...p,
                  [fileType]: [...currentFiles, { name: file.name, url: downloadUrl, path: snapshot.ref.fullPath }]
                };
              }
              return p;
            });
            return {
              ...r,
              payments: updatedPayments
            };
          }
          return r;
        });
        saveToStorage(updatedList);
      } else if (key === 'customerPi' || key === 'freightInvoice' || key === 'supplierPi') {
        const fileProp = key === 'customerPi' ? 'customerPiFile' : (key === 'freightInvoice' ? 'freightInvoiceFile' : 'supplierPiFile');
        const currentVal = (request as any)[fileProp];
        const currentFiles = Array.isArray(currentVal) ? currentVal : (currentVal ? [currentVal] : []);
        const nextFiles = [...currentFiles, { name: file.name, url: downloadUrl, path: snapshot.ref.fullPath }];

        const updatedList = importRequests.map(r => {
          if (r.id === id) {
            return {
              ...r,
              [fileProp]: nextFiles
            };
          }
          return r;
        });
        saveToStorage(updatedList);
      } else {
        const currentVal = (documents as any)[key];
        const currentFiles = Array.isArray(currentVal) ? currentVal : (currentVal ? [currentVal] : []);
        const nextFiles = [...currentFiles, { name: file.name, url: downloadUrl }];

        const nextDocs = {
          ...documents,
          [key]: nextFiles
        };
        setDocuments(nextDocs);
        const updatedList = importRequests.map(r => r.id === id ? ({ ...r, documents: nextDocs } as ImportRequest) : r);
        saveToStorage(updatedList);
      }
      alert(`${file.name} 업로드가 완료되었습니다.`);
    } catch (e) {
      console.error(e);
      alert('업로드 실패');
    } finally {
      setUploading(null);
    }
  };

  const handleFileDelete = (key: 'ciPl' | 'bizReg' | 'co' | 'etc' | 'customerPi' | 'freightInvoice' | 'inspect' | 'customsPermit' | 'taxInvoice' | 'blAwbDoc' | 'hsCustomsInfo' | 'freightDoc' | 'costCalcDocs' | 'supplierPi' | string, fileIndex: number) => {
    if (window.confirm('선택한 파일을 삭제하시겠습니까?')) {
      if (key.startsWith('paymentFxMemo_') || key.startsWith('paymentRemittanceSlip_')) {
        const parts = key.split('_');
        const fileType = parts[0] === 'paymentFxMemo' ? 'fxMemoFiles' : 'remittanceSlipFiles';
        const paymentId = parts[1];

        const updatedList = importRequests.map(r => {
          if (r.id === id) {
            const currentPayments = r.payments || [];
            const updatedPayments = currentPayments.map(p => {
              if (p.id === paymentId) {
                const currentFiles = p[fileType] || [];
                const nextFiles = currentFiles.filter((_: any, idx: number) => idx !== fileIndex);
                return {
                  ...p,
                  [fileType]: nextFiles.length > 0 ? nextFiles : undefined
                };
              }
              return p;
            });
            return {
              ...r,
              payments: updatedPayments
            };
          }
          return r;
        });
        saveToStorage(updatedList);
      } else if (key === 'customerPi' || key === 'freightInvoice' || key === 'supplierPi') {
        const fileProp = key === 'customerPi' ? 'customerPiFile' : (key === 'freightInvoice' ? 'freightInvoiceFile' : 'supplierPiFile');
        const updatedList = importRequests.map(r => {
          if (r.id === id) {
            const currentVal = (r as any)[fileProp];
            const currentFiles = Array.isArray(currentVal) ? currentVal : (currentVal ? [currentVal] : []);
            const nextFiles = currentFiles.filter((_: any, idx: number) => idx !== fileIndex);
            return {
              ...r,
              [fileProp]: nextFiles.length > 0 ? nextFiles : null
            };
          }
          return r;
        });
        saveToStorage(updatedList);
      } else {
        const currentVal = (documents as any)[key];
        const currentFiles = Array.isArray(currentVal) ? currentVal : (currentVal ? [currentVal] : []);
        const nextFiles = currentFiles.filter((_: any, idx: number) => idx !== fileIndex);
        
        const nextDocs = {
          ...documents,
          [key]: nextFiles.length > 0 ? nextFiles : null
        };
        setDocuments(nextDocs);
        const updatedList = importRequests.map(r => r.id === id ? ({ ...r, documents: nextDocs } as ImportRequest) : r);
        saveToStorage(updatedList);
      }
    }
  };

  const renderMultiUploadZone = (
    key: 'ciPl' | 'bizReg' | 'co' | 'etc' | 'customerPi' | 'freightInvoice' | 'inspect' | 'customsPermit' | 'taxInvoice' | 'blAwbDoc' | 'hsCustomsInfo' | 'freightDoc' | 'costCalcDocs' | 'supplierPi' | string,
    label: string,
    filesVal: any,
    compact?: boolean
  ) => {
    const fileList = Array.isArray(filesVal) ? filesVal : (filesVal ? [filesVal] : []);
    
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {fileList.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '2px' }}>
            {fileList.map((f: any, idx: number) => (
              <div key={idx} style={{ border: '1px solid var(--border-default)', padding: '6px 10px', borderRadius: '4px', fontSize: '12px', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '85%' }}>
                  <span style={{ color: '#475569', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📄 {f.name}</span>
                  <button 
                    onClick={() => previewFile(f.url, f.name)} 
                    style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: 700, color: '#475569', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', transition: 'background 0.2s', whiteSpace: 'nowrap' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
                    onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}
                    title="미리보기"
                  >
                    👁️ 미리보기
                  </button>
                </div>
                <button onClick={() => handleFileDelete(key, idx)} title="삭제" style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '13px', cursor: 'pointer', fontWeight: 'bold' }}>🗑️</button>
              </div>
            ))}
          </div>
        )}
        <UploadZone
          label={label}
          isUploading={uploading === key}
          onFileSelect={(file) => handleFileUpload(key, file)}
          compact={compact}
        />
      </div>
    );
  };

  const renderSupplierQuotesSection = () => {
    const quotes = request.supplierQuotes || [];
    const quoteItems = request.piItems || [];
    const hasMultipleItems = quoteItems.length > 1;

    const saveQuotes = (nextQuotes: any[]) => {
      saveToStorage(importRequests.map(r => r.id === id ? { ...r, supplierQuotes: nextQuotes } : r));
    };

    const addSupplierQuote = () => {
      const newQuote = {
        id: `q${Date.now()}`,
        supplierName: '',
        amount: 0,
        currency: 'USD',
        quoteDate: new Date().toISOString().slice(0, 10),
        status: '검토중' as const,
        note: '',
        itemIndices: quoteItems.map((_, i) => i)
      };
      saveQuotes([...quotes, newQuote]);
    };

    const updateQuote = (qid: string, patch: any) => {
      saveQuotes(quotes.map(q => q.id === qid ? { ...q, ...patch } : q));
    };

    const toggleQuoteItem = (qid: string, itemIdx: number) => {
      const target = quotes.find(q => q.id === qid);
      if (!target) return;
      const current = target.itemIndices ?? quoteItems.map((_, i) => i);
      const next = current.includes(itemIdx) ? current.filter((i: any) => i !== itemIdx) : [...current, itemIdx].sort((a, b) => a - b);
      updateQuote(qid, { itemIndices: next.length > 0 ? next : current });
    };

    const deleteQuote = (qid: string) => {
      if (!window.confirm('이 공급사 견적을 삭제하시겠습니까?')) return;
      saveQuotes(quotes.filter(q => q.id !== qid));
    };

    const confirmSupplier = (qid: string) => {
      const target = quotes.find(q => q.id === qid);
      if (!target) return;
      const coveredIdx = (target.itemIndices && target.itemIndices.length > 0) ? target.itemIndices : quoteItems.map((_, i) => i);
      const coveredNames = coveredIdx.map(i => quoteItems[i]?.name || `품목${i + 1}`).join(', ');

      if (!window.confirm(`"${target.supplierName || '이 공급사'}"의 금액(${target.amount.toLocaleString()} ${target.currency || 'USD'})을 확정합니다.\n적용 품목: ${coveredNames}\n해당 품목들의 단가가 이 금액에 맞춰 재계산됩니다. 계속할까요?`)) return;

      const originalSubtotal = coveredIdx.reduce((sum, i) => sum + ((Number(quoteItems[i]?.qty) || 0) * (Number(quoteItems[i]?.unitPrice) || 0)), 0);
      const nextPiItems = quoteItems.map((it, i) => {
        if (!coveredIdx.includes(i)) return it;
        const qty = Number(it.qty) || 0;
        const origAmount = qty * (Number(it.unitPrice) || 0);
        const share = originalSubtotal > 0 ? origAmount / originalSubtotal : 1 / coveredIdx.length;
        const allocatedAmount = target.amount * share;
        const nextPrice = qty > 0 ? Number((allocatedAmount / qty).toFixed(4)) : 0;
        return {
          ...it,
          unitPrice: String(nextPrice),
          amount: String(nextPrice * qty)
        };
      });

      const nextQuotes = quotes.map(q => q.id === qid ? { ...q, status: '확정' as const } : { ...q, status: q.status === '확정' ? '검토중' as const : q.status });

      const totalBuyingAmount = nextPiItems.reduce((sum, it) => sum + ((Number(it.qty) || 0) * (Number(it.unitPrice) || 0)), 0);
      const totalBuyingQty = nextPiItems.reduce((sum, it) => sum + (Number(it.qty) || 0), 0) || 1;
      const nextCostBreakdown = {
        ...(request.costBreakdown || {}),
        buyingPriceUsd: Math.round((totalBuyingAmount / totalBuyingQty) * 10000) / 10000,
        buyingQty: totalBuyingQty
      };

      const baseList = importRequests.map(r => {
        if (r.id === id) {
          return {
            ...r,
            piItems: nextPiItems,
            supplierQuotes: nextQuotes
          };
        }
        return r;
      });

      const updatedList = recalculateDetailCosts(baseList, nextCostBreakdown);
      saveToStorage(updatedList);
    };

    const statusColor = {
      '검토중': { bg: '#fef3c7', fg: '#d97706' },
      '네고중': { bg: '#e0f2fe', fg: '#0284c7' },
      '확정': { bg: '#dcfce7', fg: '#16a34a' },
      '거절': { bg: '#fee2e2', fg: '#dc2626' }
    };

    return (
      <div style={{ background: '#fff', padding: '20px', borderRadius: '4px', border: '1px solid #cbd5e1', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #cbd5e1', paddingBottom: '8px', marginBottom: '12px' }}>
          <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b' }}>🤝 해외공급사 견적 비교 및 견적서 보관</span>
          <button
            type="button"
            onClick={addSupplierQuote}
            style={{ padding: '6px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
          >
            ＋ 공급사 견적 추가
          </button>
        </div>

        <div style={{ border: '1px solid var(--border-default)', borderRadius: '8px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', borderBottom: '1px solid var(--border-default)', height: '36px' }}>
                <th style={{ padding: '6px 10px', textAlign: 'left' }}>공급사명</th>
                {hasMultipleItems && <th style={{ padding: '6px 10px', width: '220px' }}>품목</th>}
                <th style={{ padding: '6px 10px', width: '90px' }}>통화</th>
                <th style={{ padding: '6px 10px', textAlign: 'right', width: '130px' }}>금액</th>
                <th style={{ padding: '6px 10px', width: '140px' }}>견적일</th>
                <th style={{ padding: '6px 10px', width: '110px' }}>상태</th>
                <th style={{ padding: '6px 10px' }}>견적서 보관 (멀티 드래그&amp;드롭/캡처붙여넣기)</th>
                <th style={{ padding: '6px 10px' }}>비고 (협상 메모 등)</th>
                <th style={{ padding: '6px 10px', width: '90px', textAlign: 'center' }}>확정</th>
                <th style={{ padding: '6px 10px', width: '50px' }}></th>
              </tr>
            </thead>
            <tbody>
              {quotes.length === 0 ? (
                <tr>
                  <td colSpan={hasMultipleItems ? 10 : 9} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                    등록된 공급사 견적이 없습니다. 아래 "＋ 공급사 견적 추가"로 시작하세요.
                  </td>
                </tr>
              ) : (
                quotes.map(q => {
                  const sc = statusColor[q.status || '검토중'] || statusColor['검토중'];
                  const coveredIdx = q.itemIndices ?? quoteItems.map((_, i) => i);

                  const handleQuoteFileUploadLocal = async (quoteId: string, file: File) => {
                    if (!file) return;
                    try {
                      setUploadingQuoteId(quoteId);
                      const storageRef = ref(storage, `imports/${id}/supplierQuotes/${quoteId}/${file.name}`);
                      const snapshot = await uploadBytes(storageRef, file);
                      const downloadUrl = await getDownloadURL(snapshot.ref);
                      const currentFiles = Array.isArray((q as any).files) ? (q as any).files : ((q as any).files ? [(q as any).files] : []);
                      updateQuote(quoteId, {
                        files: [...currentFiles, { name: file.name, url: downloadUrl }]
                      } as any);
                      alert(`${file.name} 업로드가 완료되었습니다.`);
                    } catch (e) {
                      console.error(e);
                      alert('업로드 실패');
                    } finally {
                      setUploadingQuoteId(null);
                    }
                  };

                  const handleQuoteFileDeleteLocal = (quoteId: string, fileIndex: number) => {
                    if (window.confirm('선택한 파일을 삭제하시겠습니까?')) {
                      const currentFiles = Array.isArray((q as any).files) ? (q as any).files : ((q as any).files ? [(q as any).files] : []);
                      const nextFiles = currentFiles.filter((_: any, idx: number) => idx !== fileIndex);
                      updateQuote(quoteId, {
                        files: nextFiles.length > 0 ? nextFiles : null
                      } as any);
                    }
                  };

                  return (
                    <tr key={q.id} style={{ borderBottom: '1px solid var(--border-color)', background: q.status === '확정' ? '#f0fdf4' : undefined }}>
                      <td style={{ padding: '6px 8px' }}>
                        <input type="text" value={q.supplierName} onChange={e => updateQuote(q.id, { supplierName: e.target.value })}
                          placeholder="공급사명" style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                      </td>
                      {hasMultipleItems && (
                        <td style={{ padding: '6px 8px' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {quoteItems.map((it, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => toggleQuoteItem(q.id, i)}
                                title={it.name || `품목${i + 1}`}
                                style={{
                                  padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                  border: coveredIdx.includes(i) ? '1px solid #2563eb' : '1px solid #cbd5e1',
                                  background: coveredIdx.includes(i) ? '#2563eb' : '#fff',
                                  color: coveredIdx.includes(i) ? '#fff' : '#64748b'
                                }}
                              >
                                {it.name || `품목${i + 1}`}
                              </button>
                            ))}
                          </div>
                        </td>
                      )}
                      <td style={{ padding: '6px 8px' }}>
                        <select value={q.currency || 'USD'} onChange={e => updateQuote(q.id, { currency: e.target.value })}
                          style={{ width: '100%', padding: '6px 4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', outline: 'none', background: '#fff', boxSizing: 'border-box' }}>
                          <option value="USD">USD</option>
                          <option value="CNY">CNY</option>
                          <option value="KRW">KRW</option>
                          <option value="EUR">EUR</option>
                        </select>
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input type="number" value={q.amount} onChange={e => updateQuote(q.id, { amount: Number(e.target.value) || 0 })}
                          style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', outline: 'none', textAlign: 'right', fontWeight: 700, boxSizing: 'border-box' }} />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input type="date" value={q.quoteDate || ''} onChange={e => updateQuote(q.id, { quoteDate: e.target.value })}
                          style={{ width: '100%', padding: '6px 4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <select value={q.status || '검토중'} onChange={e => updateQuote(q.id, { status: e.target.value as any })}
                          style={{ width: '100%', padding: '6px 4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12.5px', outline: 'none', background: sc.bg, color: sc.fg, fontWeight: 700, boxSizing: 'border-box' }}>
                          <option value="검토중">검토중</option>
                          <option value="네고중">네고중</option>
                          <option value="확정">확정</option>
                          <option value="거절">거절</option>
                        </select>
                      </td>
                      <td style={{ padding: '6px 8px', minWidth: '220px' }}>
                        {(() => {
                          const fileList = Array.isArray((q as any).files) ? (q as any).files : ((q as any).files ? [(q as any).files] : []);
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {fileList.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                  {fileList.map((f: any, fIdx: number) => (
                                    <div key={fIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 6px', fontSize: '11.5px' }}>
                                      <span style={{ cursor: 'pointer', color: '#2563eb', fontWeight: 600, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '140px' }} onClick={() => previewFile(f.url, f.name)}>
                                        📄 {f.name}
                                      </span>
                                      <button type="button" onClick={() => handleQuoteFileDeleteLocal(q.id, fIdx)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px', padding: '0 2px' }}>×</button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <UploadZone
                                label="드래그 드롭 / 화면캡처(Ctrl+V)"
                                isUploading={uploadingQuoteId === q.id}
                                onFileSelect={(file) => handleQuoteFileUploadLocal(q.id, file)}
                              />
                            </div>
                          );
                        })()}
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input type="text" value={q.note || ''} onChange={e => updateQuote(q.id, { note: e.target.value })} placeholder="예: 1차 3.8→3.6 협의"
                          style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        <button type="button" onClick={() => confirmSupplier(q.id)} disabled={q.status === '확정'}
                          style={{ padding: '5px 10px', background: q.status === '확정' ? '#94a3b8' : '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 700, cursor: q.status === '확정' ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
                          {q.status === '확정' ? '✅ 완료' : '확정'}
                        </button>
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        <button type="button" onClick={() => deleteQuote(q.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '13px' }}>✕</button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const totalQty = (request.piItems || []).reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
  const totalAmount = (request.piItems || []).reduce((sum, it) => sum + ((Number(it.qty) || 0) * (Number(it.unitPrice) || 0)), 0);
  const totalCbm = (request.piItems || []).reduce((sum, it) => sum + (Number(it.cbm) || 0), 0);
  const totalNetWt = (request.piItems || []).reduce((sum, it) => sum + (Number(it.netWeight) || 0), 0);
  const totalGrossWt = (request.piItems || []).reduce((sum, it) => sum + (Number(it.grossWeight) || 0), 0);

  const formatDateToEnglish = (dateStr?: string) => {
    if (!dateStr) return 'July 8, 2026';
    const clean = dateStr.replace(/[\s\.]+/g, '-').replace(/-+/g, '-');
    const parts = clean.split('-');
    let year = 2026;
    let month = 7;
    let day = 8;
    if (parts.length >= 3) {
      const p0 = Number(parts[0]);
      const p1 = Number(parts[1]);
      const p2 = Number(parts[2]);
      if (!isNaN(p0) && p0 > 100) year = p0;
      else if (!isNaN(p0) && p0 < 100) year = 2000 + p0; // 2자리 년도 예외처리 (ex: 26.07.08)
      if (!isNaN(p1)) month = p1;
      if (!isNaN(p2)) day = p2;
    }
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = months[month - 1] || 'July';
    return `${monthName} ${day}, ${year}`;
  };

  const renderTaxInvoiceTable = (
    title: string,
    key: 'importTaxDocumentRows' | 'freightTaxDocumentRows' | 'customsTaxDocumentRows',
    defaultType: '세금계산서' | '영수증' | '기타',
    fallbackSupply: number,
    fallbackVat: number,
    fallbackRemarks: string
  ) => {
    let rows = request[key] || [];
    if (rows.length === 0 && (fallbackSupply > 0 || fallbackVat > 0)) {
      rows = [{
        id: `tax_row_init_${key}`,
        type: defaultType,
        issueDate: '',
        docNumber: '',
        supplyAmount: fallbackSupply,
        vatAmount: fallbackVat,
        grandTotal: fallbackSupply + fallbackVat,
        remarks: fallbackRemarks
      }];
    }

    return (
      <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-default)', paddingBottom: '4px', marginBottom: '4px' }}>
          <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>
            {title}
          </span>
          <button
            type="button"
            onClick={() => {
              const nextRows = [
                ...rows,
                {
                  id: `tax_row_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                  type: defaultType,
                  issueDate: new Date().toISOString().split('T')[0],
                  docNumber: '',
                  supplyAmount: 0,
                  vatAmount: 0,
                  grandTotal: 0,
                  remarks: ''
                }
              ];
              const updated = importRequests.map(r => r.id === id ? { ...r, [key]: nextRows } : r);
              saveToStorage(updated);
            }}
            style={{ padding: '2px 8px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            ＋ 추가
          </button>
        </div>

        {rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '12px', color: '#64748b', fontSize: '11px' }}>
            등록된 내역이 없습니다.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {rows.map((row) => (
              <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '85px 105px 120px 1fr 1fr 1fr 24px', gap: '6px', alignItems: 'center', background: '#fff', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px' }}>
                <select
                  value={row.type}
                  onChange={(e) => {
                    const val = e.target.value as any;
                    const nextRows = rows.map(r => r.id === row.id ? { ...r, type: val } : r);
                    const updated = importRequests.map(r => r.id === id ? { ...r, [key]: nextRows } : r);
                    saveToStorage(updated);
                  }}
                  style={{ height: '28px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}
                >
                  <option value="세금계산서">세금계산서</option>
                  <option value="영수증">영수증</option>
                  <option value="거래명세표">거래명세표</option>
                  <option value="기타">기타</option>
                </select>
                <input 
                  type="date"
                  value={row.issueDate || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    const nextRows = rows.map(r => r.id === row.id ? { ...r, issueDate: val } : r);
                    const updated = importRequests.map(r => r.id === id ? { ...r, [key]: nextRows } : r);
                    saveToStorage(updated);
                  }}
                  style={{ height: '28px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', width: '100%', padding: '0 2px' }}
                />
                <input 
                  type="text"
                  placeholder="승인/증빙번호"
                  value={row.docNumber || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    const nextRows = rows.map(r => r.id === row.id ? { ...r, docNumber: val } : r);
                    const updated = importRequests.map(r => r.id === id ? { ...r, [key]: nextRows } : r);
                    saveToStorage(updated);
                  }}
                  style={{ height: '28px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', width: '100%', padding: '0 4px' }}
                />
                <input 
                  type="number"
                  placeholder="공급가"
                  value={row.supplyAmount || ''}
                  onChange={(e) => {
                    const val = Number(e.target.value) || 0;
                    const nextRows = rows.map(r => r.id === row.id ? { ...r, supplyAmount: val, grandTotal: val + r.vatAmount } : r);
                    const updated = importRequests.map(r => r.id === id ? { ...r, [key]: nextRows } : r);
                    saveToStorage(updated);
                  }}
                  style={{ height: '28px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', width: '100%', padding: '0 4px', textAlign: 'right' }}
                />
                <input 
                  type="number"
                  placeholder="세액"
                  value={row.vatAmount || ''}
                  onChange={(e) => {
                    const val = Number(e.target.value) || 0;
                    const nextRows = rows.map(r => r.id === row.id ? { ...r, vatAmount: val, grandTotal: r.supplyAmount + val } : r);
                    const updated = importRequests.map(r => r.id === id ? { ...r, [key]: nextRows } : r);
                    saveToStorage(updated);
                  }}
                  style={{ height: '28px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', width: '100%', padding: '0 4px', textAlign: 'right' }}
                />
                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-primary)', textAlign: 'right', paddingRight: '2px' }}>
                  ₩{(row.supplyAmount + row.vatAmount).toLocaleString()}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('해당 행을 삭제하시겠습니까?')) {
                      const nextRows = rows.filter(r => r.id !== row.id);
                      const updated = importRequests.map(r => r.id === id ? { ...r, [key]: nextRows } : r);
                      saveToStorage(updated);
                    }
                  }}
                  style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px', padding: 0 }}
                >
                  🗑️
                </button>
              </div>
            ))}
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '6px 10px', marginTop: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#1e40af' }}>총 합계 (₩)</span>
              <span style={{ fontSize: '13px', fontWeight: 900, color: '#1e3a8a' }}>
                ₩{rows.reduce((sum, r) => sum + (r.supplyAmount + r.vatAmount), 0).toLocaleString()}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  const letterheadInfo = currentLetterhead === 'YSACC' ? {
    company: 'YSACC CO.,LTD.',
    address: '201-1Ho, 1251, Garosu-ro, Heungdeok-gu, Cheongju-si, Chungcheongbuk-do 28420, South Korea',
    tel: '+82-10-7361-1130',
    fax: '+82-30-3444-1130',
    extra: 'Web: www.ysacc.co.kr'
  } : {
    company: 'YS ACC',
    address: '110-1204, 24, Guryongsan-ro, Seowon-gu, Cheongju-si, ChungBuk 28611, KOREA',
    tel: '+82-70-4141-2927',
    fax: '+82-30-3444-1130',
    extra: 'E-mail: jhkim1130@ysacc.co.kr'
  };

  return (
    <div style={{ padding: '24px', background: '#f8fafc', minHeight: 'calc(100vh - 64px)', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Title Header */}
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#1e293b', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {viewMode === 'quote' ? '수입 견적관리' : '수입관리'}
          <span style={{ fontSize: '10px', fontWeight: 500, color: '#94a3b8', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>v1.4.2_clean</span>
        </h2>
        <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
          {viewMode === 'quote'
            ? '고객사 수입요청 접수 및 해외공급사 견적/원가 산정 단계입니다. 고객이 진행을 승인하면 수입관리로 자동 이동합니다.'
            : '고객사가 진행을 승인한 수입 발주/물류/통관/정산 건 상세 화면입니다.'}
        </p>
      </div>

      {/* Back button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '14.5px' }}
        >
          &larr; 목록으로 돌아가기
        </button>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>
          의뢰 생성일: <span style={{ color: '#0f172a' }}>{request.createdAt}</span>
        </div>
      </div>

      {/* Main Card */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', marginBottom: '24px', padding: '20px' }}>
        
        {/* Top Info Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '16px', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
            관리번호: <span style={{ color: '#2563eb' }}>{request.id}</span>
            {request.quoteNumber && (
              <span style={{ marginLeft: '12px', fontSize: '16px', color: '#475569' }}>
                (견적번호: <strong style={{ color: '#0f172a' }}>{request.quoteNumber}</strong>)
              </span>
            )}
          </h2>
          <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '11.5px', fontWeight: 700, color: '#d97706', background: '#fef3c7' }}>
            {request.status}
          </span>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>
            BL(AWB): <strong style={{ color: 'var(--text-primary)' }}>{request.blAwb}</strong> | PO: <strong style={{ color: 'var(--text-primary)' }}>{request.poNumber}</strong>
          </span>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '24px', borderBottom: '2px solid var(--border-color)', marginBottom: '24px' }}>
          {([
            { key: '수입품 견적요청', label: '① 수입품 견적요청' },
            { key: '견적수령/네고', label: '② 견적수령/네고' },
            { key: '수입원가계산', label: '③ 수입원가계산' },
            { key: '견적서작성', label: '④ 견적서작성' },
            { key: '수입내역', label: '발주/매입' },
            { key: '대금결제', label: '대금결제' },
            { key: '운송사/관세사 선정', label: '물류/통관/서류' },
            { key: '정산', label: '정산/완료' },
            { key: '손익검토', label: '손익검토' },
            { key: '로그', label: '로그' }
          ] as const)
          .filter(tab => {
            if (viewMode === 'quote') {
              return tab.key === '수입품 견적요청' || tab.key === '견적수령/네고' || tab.key === '수입원가계산' || tab.key === '견적서작성' || tab.key === '로그';
            } else {
              return tab.key === '수입내역' || tab.key === '대금결제' || tab.key === '운송사/관세사 선정' || tab.key === '정산' || tab.key === '손익검토' || tab.key === '로그';
            }
          })
          .map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '10px 4px',
                border: 'none',
                background: 'none',
                fontSize: '14.5px',
                fontWeight: activeTab === tab.key ? 800 : 600,
                color: activeTab === tab.key ? '#2563eb' : 'var(--text-secondary)',
                borderBottom: activeTab === tab.key ? '3px solid #2563eb' : '3px solid transparent',
                cursor: 'pointer',
                marginBottom: '-2px',
                transition: 'all 0.2s'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Contents */}
        {activeTab === '수입품 견적요청' && (
          <div>
            <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#1e3a8a', borderBottom: '2px solid var(--border-default)', paddingBottom: '6px', marginBottom: '20px' }}>
              📥 ① 수입품 견적요청 접수 정보
            </h3>
            <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '8px', border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
              {/* 상단 기본정보 Grid (3열 구성) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em' }}>요청 접수일</label>
                  <input
                    type="date"
                    value={request.requestDate || ''}
                    onChange={(e) => saveToStorage(importRequests.map(r => r.id === id ? { ...r, requestDate: e.target.value } : r))}
                    style={{ height: '34px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none', background: '#fff' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em' }}>고객사 담당자</label>
                  <input
                    type="text"
                    value={request.requestedBy || ''}
                    onChange={(e) => saveToStorage(importRequests.map(r => r.id === id ? { ...r, requestedBy: e.target.value } : r))}
                    style={{ height: '34px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none', background: '#fff' }}
                    placeholder="예: 홍길동 과장"
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em' }}>수입주체 구분</label>
                  <select
                    value={request.importCompany || 'YSACC'}
                    onChange={(e) => saveToStorage(importRequests.map(r => r.id === id ? { ...r, importCompany: e.target.value as any } : r))}
                    style={{ height: '34px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none', background: '#fff' }}
                  >
                    <option value="YSACC">YSACC</option>
                    <option value="영성ACC">영성ACC</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em' }}>최종 고객사 (고객DB 연계)</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      readOnly
                      value={request.finalCustomer || ''}
                      placeholder="우측 [검색] 버튼으로 고객사 지정"
                      style={{ flex: 1, height: '34px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none', background: '#f1f5f9' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCustomerModal(true)}
                      style={{ height: '34px', padding: '0 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12.5px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      🔍 검색
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: 'span 2' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em' }}>수입처 (공급업체)</label>
                  <input
                    type="text"
                    value={request.importerName || ''}
                    onChange={(e) => saveToStorage(importRequests.map(r => r.id === id ? { ...r, importerName: e.target.value } : r))}
                    placeholder="공급업체 명 직접 입력"
                    style={{ height: '34px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none', background: '#fff' }}
                  />
                </div>
              </div>

              {/* 하단 상세내용 & 파일업로드 Grid (2열 구성) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '14px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em' }}>요청 상세 내용</label>
                  <textarea
                    value={request.requestNote || ''}
                    onChange={(e) => saveToStorage(importRequests.map(r => r.id === id ? { ...r, requestNote: e.target.value } : r))}
                    rows={4}
                    placeholder="고객사로부터 접수한 수입요청 내용을 입력하세요."
                    style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', height: '90px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em' }}>수입요청 원본 파일</label>
                  {renderMultiUploadZone('customerPi', '수입요청 관련 파일 업로드', request.customerPiFile)}
                </div>
              </div>
            </div>

            {/* 수입 제품 및 패킹 명세 목록 */}
            <div style={{ background: '#fff', padding: '20px', borderRadius: '4px', border: '1px solid #cbd5e1', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #cbd5e1', paddingBottom: '8px', marginBottom: '12px' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b' }}>📦 수입 제품 및 패킹 명세 목록</span>
                <button
                  type="button"
                  onClick={() => {
                    const nextItems = [...(request.piItems || []), { name: '', qty: '', unitPrice: '', amount: '', hsCode: '', unit: 'EA', palletSize: '', cbm: '', netWeight: '', grossWeight: '' }];
                    saveToStorage(importRequests.map(r => r.id === id ? { ...r, piItems: nextItems } : r));
                  }}
                  style={{ padding: '6px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  + 항목 추가
                </button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1', height: '32px' }}>
                      <th style={{ padding: '6px 8px', textAlign: 'center', width: '35px', fontSize: '11.5px', fontWeight: 750, color: '#475569' }}>No</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: '11.5px', fontWeight: 750, color: '#475569' }}>DESCRIPTION OF COMMODITY</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', width: '85px', fontSize: '11.5px', fontWeight: 750, color: '#475569' }}>HS CODE</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', width: '65px', fontSize: '11.5px', fontWeight: 750, color: '#475569' }}>QTY</th>
                      <th style={{ padding: '6px 8px', textAlign: 'center', width: '55px', fontSize: '11.5px', fontWeight: 750, color: '#475569' }}>UNIT</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', width: '85px', fontSize: '11.5px', fontWeight: 750, color: '#475569' }}>U.PRICE</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', width: '90px', fontSize: '11.5px', fontWeight: 750, color: '#475569' }}>TOTAL AMOUNT</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', width: '100px', fontSize: '11.5px', fontWeight: 750, color: '#475569' }}>PALLET SIZE</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', width: '60px', fontSize: '11.5px', fontWeight: 750, color: '#475569' }}>CBM</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', width: '75px', fontSize: '11.5px', fontWeight: 750, color: '#475569' }}>N.WT (KG)</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', width: '75px', fontSize: '11.5px', fontWeight: 750, color: '#475569' }}>G.WT (KG)</th>
                      <th style={{ padding: '6px 8px', textAlign: 'center', width: '40px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(request.piItems || []).map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', height: '36px' }}>
                        <td style={{ textAlign: 'center', color: '#64748b', fontWeight: 600 }}>{idx + 1}</td>
                        <td style={{ padding: '2px 4px' }}>
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <input
                              type="text"
                              value={item.name}
                              onChange={(e) => {
                                const nextItems = [...(request.piItems || [])];
                                nextItems[idx] = { ...item, name: e.target.value };
                                saveToStorage(importRequests.map(r => r.id === id ? { ...r, piItems: nextItems } : r));
                              }}
                              style={{ flex: 1, height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 6px', outline: 'none' }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setProductSearchTargetIdx(idx);
                                setShowProductSearch(true);
                              }}
                              style={{ height: '26px', padding: '0 8px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
                            >
                              🔍
                            </button>
                          </div>
                        </td>
                        <td style={{ padding: '2px 4px' }}>
                          <input
                            type="text"
                            value={item.hsCode}
                            onChange={(e) => {
                              const nextItems = [...(request.piItems || [])];
                              nextItems[idx] = { ...item, hsCode: e.target.value };
                              saveToStorage(importRequests.map(r => r.id === id ? { ...r, piItems: nextItems } : r));
                            }}
                            style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', boxSizing: 'border-box' }}
                          />
                        </td>
                        <td style={{ padding: '2px 4px' }}>
                          <input
                            type="number"
                            value={item.qty}
                            onChange={(e) => {
                              const val = e.target.value;
                              const nextItems = [...(request.piItems || [])];
                              const qtyVal = Number(val) || 0;
                              const priceVal = Number(item.unitPrice) || 0;
                              nextItems[idx] = { ...item, qty: val, amount: (qtyVal * priceVal).toFixed(2) };
                              
                              let nextB = { ...(request.costBreakdown || {}) };
                              if (idx === 0) {
                                nextB = { ...nextB, buyingQty: qtyVal };
                              }
                              const updated = importRequests.map(r => r.id === id ? { ...r, piItems: nextItems, costBreakdown: nextB } : r);
                              saveToStorage(recalculateDetailCosts(updated, nextB));
                            }}
                            style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }}
                          />
                        </td>
                        <td style={{ padding: '2px 4px' }}>
                          <select
                            value={item.unit || 'EA'}
                            onChange={(e) => {
                              const nextItems = [...(request.piItems || [])];
                              nextItems[idx] = { ...item, unit: e.target.value as any };
                              saveToStorage(importRequests.map(r => r.id === id ? { ...r, piItems: nextItems } : r));
                            }}
                            style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', padding: '0 2px', outline: 'none', boxSizing: 'border-box' }}
                          >
                            <option value="EA">EA</option>
                            <option value="KG">KG</option>
                            <option value="ROLL">ROLL</option>
                            <option value="BOX">BOX</option>
                            <option value="PALLET">PALLET</option>
                          </select>
                        </td>
                        <td style={{ padding: '2px 4px' }}>
                          <input
                            type="number"
                            value={item.unitPrice}
                            onChange={(e) => {
                              const val = e.target.value;
                              const nextItems = [...(request.piItems || [])];
                              const qtyVal = Number(item.qty) || 0;
                              const priceVal = Number(val) || 0;
                              nextItems[idx] = { ...item, unitPrice: val, amount: (qtyVal * priceVal).toFixed(2) };
                              
                              let nextB = { ...(request.costBreakdown || {}) };
                              if (idx === 0) {
                                nextB = { ...nextB, buyingPriceUsd: priceVal };
                              }
                              const updated = importRequests.map(r => r.id === id ? { ...r, piItems: nextItems, costBreakdown: nextB } : r);
                              saveToStorage(recalculateDetailCosts(updated, nextB));
                            }}
                            style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }}
                          />
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b', paddingRight: '8px' }}>
                          {Number(item.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '2px 4px' }}>
                          <input
                            type="text"
                            value={item.palletSize}
                            placeholder="예: 110*110*120"
                            onChange={(e) => {
                              const nextItems = [...(request.piItems || [])];
                              nextItems[idx] = { ...item, palletSize: e.target.value };
                              saveToStorage(importRequests.map(r => r.id === id ? { ...r, piItems: nextItems } : r));
                            }}
                            style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', padding: '0 4px', outline: 'none', boxSizing: 'border-box' }}
                          />
                        </td>
                        <td style={{ padding: '2px 4px' }}>
                          <input
                            type="number"
                            value={item.cbm}
                            onChange={(e) => {
                              const nextItems = [...(request.piItems || [])];
                              nextItems[idx] = { ...item, cbm: e.target.value };
                              saveToStorage(importRequests.map(r => r.id === id ? { ...r, piItems: nextItems } : r));
                            }}
                            style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }}
                          />
                        </td>
                        <td style={{ padding: '2px 4px' }}>
                          <input
                            type="number"
                            value={item.netWeight}
                            onChange={(e) => {
                              const nextItems = [...(request.piItems || [])];
                              nextItems[idx] = { ...item, netWeight: e.target.value };
                              saveToStorage(importRequests.map(r => r.id === id ? { ...r, piItems: nextItems } : r));
                            }}
                            style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }}
                          />
                        </td>
                        <td style={{ padding: '2px 4px' }}>
                          <input
                            type="number"
                            value={item.grossWeight}
                            onChange={(e) => {
                              const nextItems = [...(request.piItems || [])];
                              nextItems[idx] = { ...item, grossWeight: e.target.value };
                              saveToStorage(importRequests.map(r => r.id === id ? { ...r, piItems: nextItems } : r));
                            }}
                            style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }}
                          />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm("항목을 삭제하시겠습니까?")) {
                                const nextItems = (request.piItems || []).filter((_, i) => i !== idx);
                                saveToStorage(importRequests.map(r => r.id === id ? { ...r, piItems: nextItems } : r));
                              }
                            }}
                            style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '16px', cursor: 'pointer', fontWeight: 'bold' }}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                    {request.piItems && request.piItems.length > 0 && (
                      <tr style={{ background: '#f1f5f9', fontWeight: 'bold', borderTop: '2px solid #cbd5e1', height: '36px' }}>
                        <td colSpan={3} style={{ padding: '6px 12px', textAlign: 'center', color: '#1e293b' }}>TOTAL</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', color: '#1e293b' }}>
                          {request.piItems.reduce((sum, it) => sum + (Number(it.qty) || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </td>
                        <td colSpan={2}></td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', color: '#1e293b' }}>
                          {request.piItems.reduce((sum, it) => sum + ((Number(it.qty) || 0) * (Number(it.unitPrice) || 0)), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td></td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', color: '#1e293b' }}>
                          {request.piItems.reduce((sum, it) => sum + (Number(it.cbm) || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 3 })}
                        </td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', color: '#1e293b' }}>
                          {request.piItems.reduce((sum, it) => sum + (Number(it.netWeight) || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', color: '#1e293b' }}>
                          {request.piItems.reduce((sum, it) => sum + (Number(it.grossWeight) || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </td>
                        <td></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 다음단계로 가기 버튼 */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button
                type="button"
                onClick={() => setActiveTab('견적수령/네고')}
                style={{ padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                다음 단계 (견적수령/네고) ➡️
              </button>
            </div>
          </div>
        )}

        {activeTab === '견적수령/네고' && (
          <div>
            <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#1e3a8a', borderBottom: '2px solid var(--border-default)', paddingBottom: '6px', marginBottom: '8px' }}>
              🤝 ② 견적수령/네고
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '12.5px', color: '#64748b' }}>
              공급사별로 받은 견적을 한 줄씩 입력하세요. 협상 중 가격이 바뀌면 금액 칸을 그대로 수정하시면 됩니다.
              { (request.piItems || []).length > 1 && ' 품목이 여러 개일 때는 "품목" 칸에서 이 견적이 어떤 품목을 커버하는지 선택하세요(기본은 전체 품목).'}
              {' '}최종 합의된 공급사에서 "확정"을 누르면 해당 품목들의 단가가 자동으로 반영됩니다.
            </p>

            {renderSupplierQuotesSection()}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button
                type="button"
                onClick={() => setActiveTab('수입원가계산')}
                style={{ padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                다음 단계 (수입원가계산) ➡️
              </button>
            </div>
          </div>
        )}

        {activeTab === '수입원가계산' && (
          <div>
            <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#1e3a8a', borderBottom: '2px solid var(--border-default)', paddingBottom: '6px', marginBottom: '20px' }}>
              📊 ③ 수입원가계산 (Trade Cost Calculator)
            </h3>

            {/* 수입품 견적요청 기본정보 요약 & 품목 확인 */}
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '6px', border: '1px solid #cbd5e1', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b' }}>📥 수입품 견적요청 기본정보 요약</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', fontSize: '12.5px' }}>
                <div><strong>요청 접수일:</strong> {request.requestDate || '-'}</div>
                <div><strong>고객사 담당자:</strong> {request.requestedBy || '-'}</div>
                <div><strong>수입주체:</strong> {request.importCompany || '-'}</div>
                <div><strong>최종 고객사:</strong> {request.finalCustomer || '-'}</div>
                <div style={{ gridColumn: 'span 2' }}><strong>수입처 (공급업체):</strong> {request.importerName || '-'}</div>
                <div style={{ gridColumn: 'span 2' }}><strong>상세 내용:</strong> {request.requestNote || '없음'}</div>
              </div>
              
              {/* 품목 리스트 요약 (Read-Only) */}
              <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '10px', marginTop: '4px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>📦 요청 품목 목록 ({request.piItems?.length || 0}건)</span>
                <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9', height: '28px', borderBottom: '1px solid #cbd5e1' }}>
                        <th style={{ padding: '4px 8px', width: '40px', textAlign: 'center' }}>No</th>
                        <th style={{ padding: '4px 8px' }}>DESCRIPTION OF COMMODITY</th>
                        <th style={{ padding: '4px 8px', width: '100px' }}>HS CODE</th>
                        <th style={{ padding: '4px 8px', width: '80px', textAlign: 'right' }}>QTY</th>
                        <th style={{ padding: '4px 8px', width: '60px', textAlign: 'center' }}>UNIT</th>
                        <th style={{ padding: '4px 8px', width: '100px', textAlign: 'right' }}>U.PRICE</th>
                        <th style={{ padding: '4px 8px', width: '110px', textAlign: 'right' }}>TOTAL AMOUNT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(request.piItems || []).map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', height: '28px', background: '#fff' }}>
                          <td style={{ textAlign: 'center', color: '#64748b' }}>{idx + 1}</td>
                          <td style={{ padding: '4px 8px' }}>{item.name}</td>
                          <td style={{ padding: '4px 8px' }}>{item.hsCode}</td>
                          <td style={{ padding: '4px 8px', textAlign: 'right' }}>{Number(item.qty || 0).toLocaleString()}</td>
                          <td style={{ padding: '4px 8px', textAlign: 'center' }}>{item.unit}</td>
                          <td style={{ padding: '4px 8px', textAlign: 'right' }}>${Number(item.unitPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>${Number(item.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                      {(!request.piItems || request.piItems.length === 0) && (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: '10px', color: '#64748b' }}>등록된 품목이 없습니다.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
              <div style={{ background: '#fff', padding: '20px', borderRadius: '4px', border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '14px', gridColumn: 'span 2', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #cbd5e1', paddingBottom: '8px' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b' }}>📊 간편 수입원가 계산표 (Trade Cost Calculator)</span>
                  <button
                    type="button"
                    onClick={() => setIsCostTableExpanded(!isCostTableExpanded)}
                    style={{
                      padding: '4px 10px',
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 650,
                      color: '#475569',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    {isCostTableExpanded ? '상세 접기 ▴' : '상세 펼치기 ▾'}
                  </button>
                </div>
                
                {/* 1 ~ 4번 항목: 상단 기본정보 입력란 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', background: '#f8fafc', padding: '12px', borderRadius: '4px', border: '1px solid #e2e8f0', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em' }}>적용환율 (EXCHANGE RATE)</label>
                    <input type="number" value={request.costBreakdown?.appliedExchangeRate || ''} onChange={e => {
                      const val = Number(e.target.value) || 0;
                      const nextB = { ...(request.costBreakdown || {}), appliedExchangeRate: val };
                      saveToStorage(recalculateDetailCosts(importRequests, nextB));
                    }} style={{ height: '34px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 600, color: '#1e293b', padding: '0 8px', outline: 'none', background: '#fff' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em' }}>인코텀즈 (INCOTERMS)</label>
                    <select value={request.costBreakdown?.incoterms || 'FOB'} onChange={e => {
                      const val = e.target.value;
                      const nextB = { ...(request.costBreakdown || {}), incoterms: val };
                      saveToStorage(recalculateDetailCosts(importRequests, nextB));
                    }} style={{ height: '34px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 600, color: '#1e293b', padding: '0 8px', outline: 'none', background: '#fff' }}>
                      <option value="EXW">EXW</option>
                      <option value="FOB">FOB</option>
                      <option value="CIF">CIF</option>
                      <option value="DDP">DDP</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em' }}>물품금액 (INVOICE USD)</label>
                    <input type="number" value={request.costBreakdown?.buyingPriceUsd || ''} onChange={e => {
                      const val = Number(e.target.value) || 0;
                      const nextB = { ...(request.costBreakdown || {}), buyingPriceUsd: val };
                      saveToStorage(recalculateDetailCosts(importRequests, nextB));
                    }} style={{ height: '34px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 600, color: '#1e293b', padding: '0 8px', outline: 'none', background: '#fff' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em' }}>수량 (Q'TY)</label>
                    <input type="number" value={request.costBreakdown?.buyingQty || ''} onChange={e => {
                      const val = Number(e.target.value) || 1;
                      const nextB = { ...(request.costBreakdown || {}), buyingQty: val };
                      saveToStorage(recalculateDetailCosts(importRequests, nextB));
                    }} style={{ height: '34px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 600, color: '#1e293b', padding: '0 8px', outline: 'none', background: '#fff' }} />
                  </div>
                </div>

                {/* 21개 세부 계산 테이블 */}
                {(() => {
                  const cb = request.costBreakdown || {};
                  const {
                    goodsAmountKrw,
                    freightKrw,
                    insuranceKrw,
                    originInlandKrw,
                    cifKrw,
customsDuty,
                    vatKrw,
                    totalImportCost,
                    totalCashRequired,
                    unitCost
                  } = calculateTotalCostHelper(cb, request.piItems || []);

                  return (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1', height: '32px' }}>
                            <th style={{ padding: '6px 8px', textAlign: 'center', width: '50px', fontSize: '12.5px', fontWeight: 750, color: '#475569' }}>No.</th>
                            <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: '12.5px', fontWeight: 750, color: '#475569' }}>항목</th>
                            <th style={{ padding: '6px 8px', textAlign: 'left', width: '180px', fontSize: '12.5px', fontWeight: 750, color: '#475569' }}>입력값</th>
                            <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: '12.5px', fontWeight: 750, color: '#475569' }}>계산금액 (KRW)</th>
                            <th style={{ padding: '6px 8px', textAlign: 'center', width: '90px', fontSize: '12.5px', fontWeight: 750, color: '#475569' }}>원가포함</th>
                          </tr>
                        </thead>
                        <tbody>
                          {isCostTableExpanded && (
                            <>
                              {/* 1. 물품금액 */}
                              <tr style={{ borderBottom: '1px solid #f1f5f9', height: '34px', fontSize: '12.5px' }}>
                                <td style={{ textAlign: 'center', color: '#64748b' }}>1</td>
                                <td style={{ fontWeight: 600, color: '#334155' }}>물품금액 (FOB Amount)</td>
                                <td style={{ color: '#64748b' }}>Invoice USD: ${request.costBreakdown?.buyingPriceUsd?.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                                <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{goodsAmountKrw.toLocaleString()} 원</td>
                                <td style={{ textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>O</td>
                              </tr>
                              {/* 2. 국제운임 */}
                              <tr style={{ borderBottom: '1px solid #f1f5f9', height: '34px', fontSize: '12.5px' }}>
                                <td style={{ textAlign: 'center', color: '#64748b' }}>2</td>
                                <td style={{ fontWeight: 600, color: '#334155' }}>국제운임 (Ocean/Air Freight)</td>
                                <td style={{ padding: '2px 4px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ fontSize: '11px', color: '#64748b' }}>$</span>
                                    <input type="number" value={cb.freightUsd || ''} onChange={e => {
                                      const val = Number(e.target.value) || 0;
                                      const nextB = { ...cb, freightUsd: val };
                                      saveToStorage(recalculateDetailCosts(importRequests, nextB));
                                    }} style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', boxSizing: 'border-box' }} />
                                  </div>
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{freightKrw.toLocaleString()} 원</td>
                                <td style={{ textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>O</td>
                              </tr>
                              {/* 3. 보험료 */}
                              <tr style={{ borderBottom: '1px solid #f1f5f9', height: '34px', fontSize: '12.5px' }}>
                                <td style={{ textAlign: 'center', color: '#64748b' }}>3</td>
                                <td style={{ fontWeight: 600, color: '#334155' }}>보험료 (Cargo Insurance)</td>
                                <td style={{ padding: '2px 4px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ fontSize: '11px', color: '#64748b' }}>$</span>
                                    <input type="number" value={cb.insuranceUsd || ''} onChange={e => {
                                      const val = Number(e.target.value) || 0;
                                      const nextB = { ...cb, insuranceUsd: val };
                                      saveToStorage(recalculateDetailCosts(importRequests, nextB));
                                    }} style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', boxSizing: 'border-box' }} />
                                  </div>
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{insuranceKrw.toLocaleString()} 원</td>
                                <td style={{ textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>O</td>
                              </tr>
                              {/* 4. 수출국 내륙운송·수출비 */}
                              <tr style={{ borderBottom: '1px solid #f1f5f9', height: '34px', fontSize: '12.5px' }}>
                                <td style={{ textAlign: 'center', color: '#64748b' }}>4</td>
                                <td style={{ fontWeight: 600, color: '#334155' }}>수출국 내륙운송·수출비</td>
                                <td style={{ padding: '2px 4px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ fontSize: '11px', color: '#64748b' }}>$</span>
                                    <input type="number" value={cb.originInlandUsd || ''} onChange={e => {
                                      const val = Number(e.target.value) || 0;
                                      const nextB = { ...cb, originInlandUsd: val };
                                      saveToStorage(recalculateDetailCosts(importRequests, nextB));
                                    }} style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', boxSizing: 'border-box' }} />
                                  </div>
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{originInlandKrw.toLocaleString()} 원</td>
                                <td style={{ textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>O</td>
                              </tr>
                              {/* 5. CIF 과세가격 */}
                              <tr style={{ borderBottom: '1px solid #cbd5e1', background: '#f8fafc', height: '34px', fontSize: '12.5px' }}>
                                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>5</td>
                                <td style={{ fontWeight: 800, color: '#0f172a' }}>CIF 과세가격 (Customs Value)</td>
                                <td style={{ color: '#475569', fontSize: '11px' }}>자동: (1+2+3+4) × 환율</td>
                                <td style={{ textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>{cifKrw.toLocaleString()} 원</td>
                                <td style={{ textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>O</td>
                              </tr>
                              {/* 6. 관세율 */}
                              <tr style={{ borderBottom: '1px solid #f1f5f9', height: '34px', fontSize: '12.5px' }}>
                                <td style={{ textAlign: 'center', color: '#64748b' }}>6</td>
                                <td style={{ fontWeight: 600, color: '#334155' }}>관세율 (Customs Duty Rate)</td>
                                <td style={{ padding: '2px 4px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <input type="number" value={cb.ftaTaxRate || ''} onChange={e => {
                                      const val = Number(e.target.value) || 0;
                                      const nextB = { ...cb, ftaTaxRate: val };
                                      saveToStorage(recalculateDetailCosts(importRequests, nextB));
                                    }} style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', textAlign: 'center', boxSizing: 'border-box' }} />
                                    <span style={{ fontSize: '11.5px', color: '#64748b' }}>%</span>
                                  </div>
                                </td>
                                <td style={{ textAlign: 'right', color: '#64748b' }}>-</td>
                                <td style={{ textAlign: 'center', color: '#94a3b8' }}>-</td>
                              </tr>
                              {/* 7. 관세 */}
                              <tr style={{ borderBottom: '1px solid #f1f5f9', height: '34px', fontSize: '12.5px' }}>
                                <td style={{ textAlign: 'center', color: '#64748b' }}>7</td>
                                <td style={{ fontWeight: 600, color: '#334155' }}>관세 (Customs Duty)</td>
                                <td style={{ color: '#475569', fontSize: '11px' }}>자동: 5 × 6</td>
                                <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{customsDuty.toLocaleString()} 원</td>
                                <td style={{ textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>O</td>
                              </tr>
                              {/* 8. 수입 부가세 */}
                              <tr style={{ borderBottom: '1px solid #f1f5f9', height: '34px', fontSize: '12.5px' }}>
                                <td style={{ textAlign: 'center', color: '#64748b' }}>8</td>
                                <td style={{ fontWeight: 600, color: '#334155' }}>수입 부가세 (Import VAT)</td>
                                <td style={{ color: '#475569', fontSize: '11px' }}>자동: (5 + 7) × 10%</td>
                                <td style={{ textAlign: 'right', fontWeight: 600, color: '#475569' }}>{vatKrw.toLocaleString()} 원</td>
                                <td style={{ textAlign: 'center', color: '#f59e0b', fontSize: '11px', fontWeight: 'bold' }}>조건부 (제외)</td>
                              </tr>
                              {/* 9. 통관비 */}
                              <tr style={{ borderBottom: '1px solid #f1f5f9', height: '34px', fontSize: '12.5px' }}>
                                <td style={{ textAlign: 'center', color: '#64748b' }}>9</td>
                                <td style={{ fontWeight: 600, color: '#334155' }}>통관비 (Customs Brokerage)</td>
                                <td style={{ padding: '2px 4px' }}>
                                  <input type="number" value={cb.clearanceFee || ''} onChange={e => {
                                    const val = Number(e.target.value) || 0;
                                    const nextB = { ...cb, clearanceFee: val };
                                    saveToStorage(recalculateDetailCosts(importRequests, nextB));
                                  }} style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }} />
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{(cb.clearanceFee || 0).toLocaleString()} 원</td>
                                <td style={{ textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>O</td>
                              </tr>
                              {/* 10. 항만·공항 비용 */}
                              <tr style={{ borderBottom: '1px solid #f1f5f9', height: '34px', fontSize: '12.5px' }}>
                                <td style={{ textAlign: 'center', color: '#64748b' }}>10</td>
                                <td style={{ fontWeight: 600, color: '#334155' }}>항만·공항 비용 (Port Charges)</td>
                                <td style={{ padding: '2px 4px' }}>
                                  <input type="number" value={cb.portFee || ''} onChange={e => {
                                    const val = Number(e.target.value) || 0;
                                    const nextB = { ...cb, portFee: val };
                                    saveToStorage(recalculateDetailCosts(importRequests, nextB));
                                  }} style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }} />
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{(cb.portFee || 0).toLocaleString()} 원</td>
                                <td style={{ textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>O</td>
                              </tr>
                              {/* 11. 국내 운송비 */}
                              <tr style={{ borderBottom: '1px solid #f1f5f9', height: '34px', fontSize: '12.5px' }}>
                                <td style={{ textAlign: 'center', color: '#64748b' }}>11</td>
                                <td style={{ fontWeight: 600, color: '#334155' }}>국내 운송비 (Domestic Transport)</td>
                                <td style={{ padding: '2px 4px' }}>
                                  <input type="number" value={cb.domesticTransportFee || ''} onChange={e => {
                                    const val = Number(e.target.value) || 0;
                                    const nextB = { ...cb, domesticTransportFee: val };
                                    saveToStorage(recalculateDetailCosts(importRequests, nextB));
                                  }} style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }} />
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{(cb.domesticTransportFee || 0).toLocaleString()} 원</td>
                                <td style={{ textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>O</td>
                              </tr>
                              {/* 12. 하역·장비비 */}
                              <tr style={{ borderBottom: '1px solid #f1f5f9', height: '34px', fontSize: '12.5px' }}>
                                <td style={{ textAlign: 'center', color: '#64748b' }}>12</td>
                                <td style={{ fontWeight: 600, color: '#334155' }}>하역·장비비 (Handling Fee)</td>
                                <td style={{ padding: '2px 4px' }}>
                                  <input type="number" value={cb.handlingFee || ''} onChange={e => {
                                    const val = Number(e.target.value) || 0;
                                    const nextB = { ...cb, handlingFee: val };
                                    saveToStorage(recalculateDetailCosts(importRequests, nextB));
                                  }} style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }} />
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{(cb.handlingFee || 0).toLocaleString()} 원</td>
                                <td style={{ textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>O</td>
                              </tr>
                              {/* 13. 기타 비용 */}
                              <tr style={{ borderBottom: '1px solid #cbd5e1', height: '34px', fontSize: '12.5px' }}>
                                <td style={{ textAlign: 'center', color: '#64748b' }}>13</td>
                                <td style={{ fontWeight: 600, color: '#334155' }}>기타 비용 (Other Expenses)</td>
                                <td style={{ padding: '2px 4px' }}>
                                  <input type="number" value={cb.otherFee || ''} onChange={e => {
                                    const val = Number(e.target.value) || 0;
                                    const nextB = { ...cb, otherFee: val };
                                    saveToStorage(recalculateDetailCosts(importRequests, nextB));
                                  }} style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }} />
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{(cb.otherFee || 0).toLocaleString()} 원</td>
                                <td style={{ textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>O</td>
                              </tr>
                            </>
                          )}

                          {/* 14. 총 수입원가 */}
                          <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#eff6ff', height: '36px', fontSize: '13px' }}>
                            <td style={{ textAlign: 'center', fontWeight: 'bold' }}>14</td>
                            <td style={{ fontWeight: 800, color: '#1e3a8a' }}>총 수입원가 (Total Import Cost)</td>
                            <td style={{ color: '#475569', fontSize: '11px' }}>자동: 5 + 7 + 9 + 10 + 11 + 12 + 13</td>
                            <td style={{ textAlign: 'right', fontWeight: 800, color: '#1e3a8a' }}>{totalImportCost.toLocaleString()} 원</td>
                            <td style={{ textAlign: 'center', color: '#1e3a8a', fontWeight: 'bold' }}>O</td>
                          </tr>
                          {/* 15. 총 현금소요액 */}
                          <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc', height: '36px', fontSize: '13px' }}>
                            <td style={{ textAlign: 'center', fontWeight: 'bold' }}>15</td>
                            <td style={{ fontWeight: 800, color: '#475569' }}>총 현금소요액 (Total Cash)</td>
                            <td style={{ color: '#475569', fontSize: '11px' }}>자동: 총 수입원가 + 수입 부가세</td>
                            <td style={{ textAlign: 'right', fontWeight: 800, color: '#475569' }}>{totalCashRequired.toLocaleString()} 원</td>
                            <td style={{ textAlign: 'center', color: '#94a3b8' }}>-</td>
                          </tr>
                          {/* 16. 단위당 수입원가 */}
                          <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc', height: '36px', fontSize: '13px' }}>
                            <td style={{ textAlign: 'center', fontWeight: 'bold' }}>16</td>
                            <td style={{ fontWeight: 800, color: '#b45309' }}>단위당 수입원가 (Cost per Unit)</td>
                            <td style={{ color: '#475569', fontSize: '11px' }}>자동: 총 수입원가 ÷ 수량</td>
                            <td style={{ textAlign: 'right', fontWeight: 800, color: '#b45309' }}>{unitCost.toLocaleString()} 원 / {(request.piItems?.[0]?.unit || 'UNIT')}</td>
                            <td style={{ textAlign: 'center', color: '#b45309', fontWeight: 'bold' }}>O</td>
                          </tr>
                          {/* 17. 마진율 (%) */}
                          <tr style={{ borderBottom: '1px solid #f1f5f9', height: '36px', fontSize: '13px' }}>
                            <td style={{ textAlign: 'center', fontWeight: 'bold' }}>17</td>
                            <td style={{ fontWeight: 600, color: '#334155' }}>마진율 (Margin Rate)</td>
                            <td style={{ padding: '2px 4px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <input type="number" value={request.marginRate ?? ''} onChange={e => {
                                  const rate = Number(e.target.value) || 0;
                                  const totalCost = calculateDetailTotalCost(request);
                                  const marginAmount = Math.round(totalCost * (rate / 100));
                                  saveToStorage(importRequests.map(r => r.id === id ? { ...r, marginRate: rate, marginAmount, customerQuoteAmount: totalCost + marginAmount } : r));
                                }} style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12.5px', fontWeight: 600, color: '#1e293b', padding: '0 4px', outline: 'none', textAlign: 'center', boxSizing: 'border-box' }} />
                                <span style={{ fontSize: '11.5px', color: '#64748b' }}>%</span>
                              </div>
                            </td>
                            <td style={{ textAlign: 'right', color: '#64748b' }}>-</td>
                            <td style={{ textAlign: 'center', color: '#94a3b8' }}>-</td>
                          </tr>
                          {/* 18. 마진 금액 */}
                          <tr style={{ borderBottom: '1px solid #f1f5f9', height: '36px', fontSize: '13px' }}>
                            <td style={{ textAlign: 'center', fontWeight: 'bold' }}>18</td>
                            <td style={{ fontWeight: 600, color: '#334155' }}>마진 금액 (Margin Amount)</td>
                            <td style={{ color: '#475569', fontSize: '11px' }}>자동: 총 수입원가 × 마진율</td>
                            <td style={{ textAlign: 'right', fontWeight: 600, color: '#b45309' }}>{(request.marginAmount || 0).toLocaleString()} 원</td>
                            <td style={{ textAlign: 'center', color: '#94a3b8' }}>-</td>
                          </tr>
                          {/* 19. 고객 제시 견적금액 */}
                          <tr style={{ borderBottom: '1px solid #cbd5e1', background: '#fef3c7', height: '36px', fontSize: '13px' }}>
                            <td style={{ textAlign: 'center', fontWeight: 'bold' }}>19</td>
                            <td style={{ fontWeight: 800, color: '#1e3a8a' }}>고객 제시 견적금액 (Customer Quote)</td>
                            <td style={{ color: '#475569', fontSize: '11px' }}>자동: 총 수입원가 + 마진 금액</td>
                            <td style={{ textAlign: 'right', fontWeight: 800, color: '#1e3a8a' }}>{(request.customerQuoteAmount || 0).toLocaleString()} 원</td>
                            <td style={{ textAlign: 'center', color: '#1e3a8a', fontWeight: 'bold' }}>O</td>
                          </tr>
                          {/* 20. 단위당 최종 판매단가 */}
                          <tr style={{ background: '#f0fdf4', height: '36px', fontSize: '13px' }}>
                            <td style={{ textAlign: 'center', fontWeight: 'bold' }}>20</td>
                            <td style={{ fontWeight: 800, color: '#10b981' }}>단위당 최종 판매단가 (Final Selling Price)</td>
                            <td style={{ color: '#475569', fontSize: '11px' }}>자동: 고객 제시 견적금액 ÷ 수량</td>
                            <td style={{ textAlign: 'right', fontWeight: 800, color: '#10b981' }}>
                              {Math.round((request.customerQuoteAmount || 0) / (request.costBreakdown?.buyingQty || 1)).toLocaleString()} 원 / {(request.piItems?.[0]?.unit || 'UNIT')}
                            </td>
                            <td style={{ textAlign: 'center', color: '#10b981', fontWeight: 'bold' }}>O</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>

            </div>

            {/* 품목별 원가 배분표 — 품목이 2개 이상일 때만 표시 (단일 품목이면 위 계산표가 곧 그 품목의 원가이므로 생략) */}
            {(request.piItems || []).length > 1 && (() => {
              const cb = request.costBreakdown || {};
              const items = request.piItems || [];
              const { totalImportCost } = calculateTotalCostHelper(cb, items);
              const totalAmountAllItems = items.reduce((sum, it) => sum + ((Number(it.qty) || 0) * (Number(it.unitPrice) || 0)), 0) || 1;

              return (
                <div style={{ background: '#fff', padding: '20px', borderRadius: '4px', border: '1px solid #cbd5e1', marginBottom: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '2px solid #cbd5e1', paddingBottom: '8px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b' }}>📦 품목별 원가 배분표</span>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>공통비용(운임·보험·관세·통관비 등)을 품목별 금액 비중으로 배분한 결과입니다</span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1', height: '32px' }}>
                          <th style={{ padding: '6px 8px', textAlign: 'left' }}>품목명</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>수량</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>단가(USD)</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>금액(USD)</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>배분 비중</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>배분 총원가(KRW)</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>품목별 단위원가(KRW)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((it, idx) => {
                          const qty = Number(it.qty) || 0;
                          const itemAmount = qty * (Number(it.unitPrice) || 0);
                          const share = itemAmount / totalAmountAllItems;
                          const allocatedCost = Math.round(totalImportCost * share);
                          const unitCost = qty > 0 ? Math.round(allocatedCost / qty) : 0;
                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', height: '32px' }}>
                              <td style={{ padding: '6px 8px', fontWeight: 600 }}>{it.name || `품목${idx + 1}`}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{qty.toLocaleString()} {it.unit || ''}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right' }}>${(Number(it.unitPrice) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right' }}>${itemAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', color: '#64748b' }}>{(share * 100).toFixed(1)}%</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>{allocatedCost.toLocaleString()} 원</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 800, color: '#b45309' }}>{unitCost.toLocaleString()} 원</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            <div style={{ background: '#fff', padding: '20px', borderRadius: '4px', border: '1px solid #cbd5e1', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', marginTop: '20px', marginBottom: '20px' }}>
              <div style={{ borderBottom: '2px solid #cbd5e1', paddingBottom: '8px', marginBottom: '12px' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b' }}>📁 운송비 견적서 및 관세 정보 보관</span>
              </div>
              {renderMultiUploadZone('costCalcDocs', '클릭 혹은 업로드할 증빙 파일 드래그', documents.costCalcDocs)}
            </div>

            {/* 다음단계로 가기 버튼 */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button
                type="button"
                onClick={() => setActiveTab('견적서작성')}
                style={{ padding: '10px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                다음 단계 (견적서작성) ➡️
              </button>
            </div>
          </div>
        )}

        {activeTab === '견적서작성' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--border-default)', paddingBottom: '6px', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#1e3a8a', margin: 0 }}>
                ✍️ ④ YSACC/영성ACC 견적서작성 및 발행
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                {request.customerDecision !== '승인' ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("수입 확정 처리하고 수입관리로 등록하시겠습니까?")) {
                        const updated = importRequests.map(r => r.id === id ? { ...r, customerDecision: '승인' as any, status: '발주 진행' } : r);
                        saveToStorage(updated);
                        navigate(`/imports/${id}?mode=active`, { replace: true });
                        alert("수입 확정 처리되어 수입관리로 정상 등록되었습니다.");
                      }
                    }}
                    style={{
                      background: '#3b82f6',
                      border: 'none',
                      borderRadius: '4px',
                      height: '34px',
                      padding: '0 12px',
                      fontSize: '12.5px',
                      fontWeight: 750,
                      color: '#fff',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
                  >
                    ⚓ 수입 확정 승인
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    style={{
                      background: '#10b981',
                      border: 'none',
                      borderRadius: '4px',
                      height: '34px',
                      padding: '0 12px',
                      fontSize: '12.5px',
                      fontWeight: 750,
                      color: '#fff',
                      cursor: 'default',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    ✅ 수입 승인 완료
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowEstimatePrintModal(true)}
                  title="견적서 인쇄 / PDF 출력"
                  style={{
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    height: '34px',
                    padding: '0 12px',
                    fontSize: '12.5px',
                    fontWeight: 750,
                    color: '#475569',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                >
                  🖨️ 견적서 출력
                </button>
              </div>
            </div>

            {/* 수입 제품 및 패킹 명세 목록 (수정/삭제 가능) */}
            <div style={{ background: '#fff', padding: '20px', borderRadius: '4px', border: '1px solid #cbd5e1', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #cbd5e1', paddingBottom: '8px', marginBottom: '12px' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b' }}>📦 견적 포함 품목 목록</span>
                <button
                  type="button"
                  onClick={() => {
                    const nextItems = [...(request.piItems || []), { name: '', qty: '', unitPrice: '', amount: '', hsCode: '', unit: 'EA', palletSize: '', cbm: '', netWeight: '', grossWeight: '' }];
                    saveToStorage(importRequests.map(r => r.id === id ? { ...r, piItems: nextItems } : r));
                  }}
                  style={{ padding: '6px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  + 항목 추가
                </button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1', height: '32px' }}>
                      <th style={{ padding: '6px 8px', textAlign: 'center', width: '35px', fontSize: '11.5px', fontWeight: 750, color: '#475569' }}>No</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: '11.5px', fontWeight: 750, color: '#475569' }}>DESCRIPTION OF COMMODITY</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left', width: '90px', fontSize: '11.5px', fontWeight: 750, color: '#475569' }}>HS CODE</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', width: '75px', fontSize: '11.5px', fontWeight: 750, color: '#475569' }}>QTY</th>
                      <th style={{ padding: '6px 8px', textAlign: 'center', width: '60px', fontSize: '11.5px', fontWeight: 750, color: '#475569' }}>UNIT</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', width: '95px', fontSize: '11.5px', fontWeight: 750, color: '#475569' }}>U.PRICE</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', width: '100px', fontSize: '11.5px', fontWeight: 750, color: '#475569' }}>TOTAL AMOUNT</th>
                      <th style={{ padding: '6px 8px', textAlign: 'center', width: '40px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(request.piItems || []).map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', height: '36px' }}>
                        <td style={{ textAlign: 'center', color: '#64748b', fontWeight: 600 }}>{idx + 1}</td>
                        <td style={{ padding: '2px 4px' }}>
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => {
                              const nextItems = [...(request.piItems || [])];
                              nextItems[idx] = { ...item, name: e.target.value };
                              saveToStorage(importRequests.map(r => r.id === id ? { ...r, piItems: nextItems } : r));
                            }}
                            style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 6px', outline: 'none', boxSizing: 'border-box' }}
                          />
                        </td>
                        <td style={{ padding: '2px 4px' }}>
                          <input
                            type="text"
                            value={item.hsCode}
                            onChange={(e) => {
                              const nextItems = [...(request.piItems || [])];
                              nextItems[idx] = { ...item, hsCode: e.target.value };
                              saveToStorage(importRequests.map(r => r.id === id ? { ...r, piItems: nextItems } : r));
                            }}
                            style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', boxSizing: 'border-box' }}
                          />
                        </td>
                        <td style={{ padding: '2px 4px' }}>
                          <input
                            type="number"
                            value={item.qty}
                            onChange={(e) => {
                              const val = e.target.value;
                              const nextItems = [...(request.piItems || [])];
                              const qtyVal = Number(val) || 0;
                              const priceVal = Number(item.unitPrice) || 0;
                              nextItems[idx] = { ...item, qty: val, amount: (qtyVal * priceVal).toFixed(2) };
                              
                              let nextB = { ...(request.costBreakdown || {}) };
                              if (idx === 0) {
                                nextB = { ...nextB, buyingQty: qtyVal };
                              }
                              const updated = importRequests.map(r => r.id === id ? { ...r, piItems: nextItems, costBreakdown: nextB } : r);
                              saveToStorage(recalculateDetailCosts(updated, nextB));
                            }}
                            style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }}
                          />
                        </td>
                        <td style={{ padding: '2px 4px' }}>
                          <select
                            value={item.unit || 'EA'}
                            onChange={(e) => {
                              const nextItems = [...(request.piItems || [])];
                              nextItems[idx] = { ...item, unit: e.target.value as any };
                              saveToStorage(importRequests.map(r => r.id === id ? { ...r, piItems: nextItems } : r));
                            }}
                            style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', padding: '0 2px', outline: 'none', boxSizing: 'border-box' }}
                          >
                            <option value="EA">EA</option>
                            <option value="KG">KG</option>
                            <option value="ROLL">ROLL</option>
                            <option value="BOX">BOX</option>
                            <option value="PALLET">PALLET</option>
                          </select>
                        </td>
                        <td style={{ padding: '2px 4px' }}>
                          <input
                            type="number"
                            value={item.unitPrice}
                            onChange={(e) => {
                              const val = e.target.value;
                              const nextItems = [...(request.piItems || [])];
                              const qtyVal = Number(item.qty) || 0;
                              const priceVal = Number(val) || 0;
                              nextItems[idx] = { ...item, unitPrice: val, amount: (qtyVal * priceVal).toFixed(2) };
                              
                              let nextB = { ...(request.costBreakdown || {}) };
                              if (idx === 0) {
                                nextB = { ...nextB, buyingPriceUsd: priceVal };
                              }
                              const updated = importRequests.map(r => r.id === id ? { ...r, piItems: nextItems, costBreakdown: nextB } : r);
                              saveToStorage(recalculateDetailCosts(updated, nextB));
                            }}
                            style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }}
                          />
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b', paddingRight: '8px' }}>
                          {Number(item.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm("항목을 삭제하시겠습니까?")) {
                                const nextItems = (request.piItems || []).filter((_, i) => i !== idx);
                                saveToStorage(importRequests.map(r => r.id === id ? { ...r, piItems: nextItems } : r));
                              }
                            }}
                            style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '16px', cursor: 'pointer', fontWeight: 'bold' }}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 수입원가 요약 및 마진 설정 카드 2열 배치 */}
            {(() => {
              const cb = request.costBreakdown || {};
              const {
                totalImportCost,
                totalCashRequired,
                unitCost
              } = calculateTotalCostHelper(cb, request.piItems || []);

              return (
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', marginBottom: '20px' }}>
                  {/* 왼쪽 카드: 수입원가 요약 정보 */}
                  <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '8px', border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b', borderBottom: '1px solid var(--border-default)', paddingBottom: '6px' }}>수입원가 계산 요약 (Summary)</span>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: '#475569', fontWeight: 600 }}>총 수입원가 (Total Import Cost)</span>
                      <strong style={{ color: '#1e3a8a' }}>{totalImportCost.toLocaleString()} 원</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: '#475569', fontWeight: 600 }}>총 현금소요액 (Total Cash Required)</span>
                      <strong style={{ color: '#475569' }}>{totalCashRequired.toLocaleString()} 원</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: '#475569', fontWeight: 600 }}>단위당 수입원가 (Cost per Unit)</span>
                      <strong style={{ color: '#b45309' }}>{unitCost.toLocaleString()} 원 / {(request.piItems?.[0]?.unit || 'UNIT')}</strong>
                    </div>
                  </div>

                  {/* 오른쪽 카드: 마진 및 견적액 설정 */}
                  <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '8px', border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b', borderBottom: '1px solid var(--border-default)', paddingBottom: '6px' }}>마진 및 고객 견적액 설정 (Margin &amp; Quote)</span>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                      <label style={{ fontSize: '12.5px', color: '#475569', fontWeight: 750, textTransform: 'uppercase', letterSpacing: '0.02em' }}>마진율 (%)</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input 
                          type="number" 
                          value={request.marginRate ?? ''} 
                          onChange={(e) => {
                            const rate = Number(e.target.value) || 0;
                            const totalCost = calculateDetailTotalCost(request);
                            const marginAmount = Math.round(totalCost * (rate / 100));
                            saveToStorage(importRequests.map(r => r.id === id ? { ...r, marginRate: rate, marginAmount, customerQuoteAmount: totalCost + marginAmount } : r));
                          }} 
                          style={{ width: '100px', height: '34px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', outline: 'none', textAlign: 'right', padding: '0 6px', fontWeight: 600, color: '#1e293b' }} 
                        />
                        <span style={{ fontSize: '12px', color: '#64748b' }}>%</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                      <label style={{ fontSize: '12.5px', color: '#475569', fontWeight: 750, textTransform: 'uppercase', letterSpacing: '0.02em' }}>마진 금액 (₩)</label>
                      <strong style={{ fontSize: '13px', color: '#b45309' }}>{(request.marginAmount || 0).toLocaleString()} 원</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                      <label style={{ fontSize: '12.5px', color: '#475569', fontWeight: 750, textTransform: 'uppercase', letterSpacing: '0.02em' }}>고객 제시 견적금액</label>
                      <input 
                        type="number" 
                        value={request.customerQuoteAmount || ''} 
                        onChange={(e) => {
                          const val = Number(e.target.value) || 0;
                          const totalCost = calculateDetailTotalCost(request);
                          const marginAmount = val - totalCost;
                          const marginRate = totalCost > 0 ? (marginAmount / totalCost) * 100 : 0;
                          saveToStorage(importRequests.map(r => r.id === id ? { ...r, customerQuoteAmount: val, marginAmount, marginRate } : r));
                        }} 
                        style={{ width: '130px', height: '34px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', outline: 'none', textAlign: 'right', padding: '0 6px', fontWeight: 600, color: '#1e3a8a' }} 
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                      <label style={{ fontSize: '12.5px', color: '#475569', fontWeight: 750, textTransform: 'uppercase', letterSpacing: '0.02em' }}>최종 판매단가 (Unit Price)</label>
                      <strong style={{ fontSize: '13px', color: '#10b981' }}>
                        {Math.round((request.customerQuoteAmount || 0) / (request.costBreakdown?.buyingQty || 1)).toLocaleString()} 원 / {(request.piItems?.[0]?.unit || 'UNIT')}
                      </strong>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* 거래 조건 및 특기사항 설정 */}
            <div style={{ background: '#fff', padding: '20px', borderRadius: '4px', border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '14px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', marginBottom: '20px' }}>
              <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b', borderBottom: '2px solid #cbd5e1', paddingBottom: '8px' }}>📋 거래 조건 및 특기사항 설정 (Terms &amp; Remarks)</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em' }}>PAYMENT TERMS (결제조건)</label>
                  <input
                    type="text"
                    value={request.paymentTerms || ''}
                    placeholder="예: 100% T/T in advance"
                    onChange={(e) => saveToStorage(importRequests.map(r => r.id === id ? { ...r, paymentTerms: e.target.value } : r))}
                    style={{ height: '34px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em' }}>DELIVERY TERMS (인도조건)</label>
                  <input
                    type="text"
                    readOnly
                    value="공장도착도 (Delivered to Factory)"
                    style={{ height: '34px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', fontWeight: 600, color: '#475569', outline: 'none', background: '#f1f5f9' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em' }}>PORT OF LOADING (선적항)</label>
                  <input
                    type="text"
                    value={request.pol || ''}
                    placeholder="예: SHANGHAI PORT, CHINA"
                    onChange={(e) => saveToStorage(importRequests.map(r => r.id === id ? { ...r, pol: e.target.value } : r))}
                    style={{ height: '34px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em' }}>PORT OF DISCHARGE (도착항)</label>
                  <input
                    type="text"
                    value={request.pod || ''}
                    placeholder="예: INCHEON PORT, KOREA"
                    onChange={(e) => saveToStorage(importRequests.map(r => r.id === id ? { ...r, pod: e.target.value } : r))}
                    style={{ height: '34px', padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: 'span 2' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em' }}>REMARKS (특기사항)</label>
                  <textarea
                    value={request.requestNote || ''}
                    placeholder="별도 특기사항 없음"
                    onChange={(e) => saveToStorage(importRequests.map(r => r.id === id ? { ...r, requestNote: e.target.value } : r))}
                    rows={3}
                    style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                  />
                </div>
              </div>
            </div>

            <div style={{ background: '#fff', padding: '20px', borderRadius: '4px', border: '1px solid #cbd5e1', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', marginBottom: '20px' }}>
              <div style={{ borderBottom: '2px solid #cbd5e1', paddingBottom: '8px', marginBottom: '12px' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b' }}>📁 운송비 견적서 및 관세 정보 보관</span>
              </div>
              {renderMultiUploadZone('costCalcDocs', '클릭 혹은 업로드할 증빙 파일 드래그', documents.costCalcDocs)}
            </div>

          </div>
        )}

        {activeTab === '견적/원가' && (
          <div>
            <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#1e3a8a', borderBottom: '2px solid var(--border-default)', paddingBottom: '6px', marginBottom: '20px' }}>
              💵 ② 해외공급사 견적 및 고객 원가/마진 산정
            </h3>

            {/* 공급사 견적 리스트 */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>해외공급사 견적 비교</span>
                <button
                  type="button"
                  onClick={() => {
                    const nextQuotes = [...(request.supplierQuotes || []), { id: `q${Date.now()}`, supplierName: '', amount: 0, currency: 'USD', quoteDate: new Date().toISOString().slice(0, 10) }];
                    saveToStorage(importRequests.map(r => r.id === id ? { ...r, supplierQuotes: nextQuotes } : r));
                  }}
                  style={{ padding: '6px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  + 견적 추가
                </button>
              </div>
              <div style={{ border: '1px solid var(--border-default)', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', borderBottom: '1px solid var(--border-default)', height: '34px' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>공급사명</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>품목</th>
                      <th style={{ padding: '8px 12px', width: '90px' }}>통화</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', width: '140px' }}>견적금액</th>
                      <th style={{ padding: '8px 12px', width: '130px' }}>견적일</th>
                      <th style={{ padding: '8px 12px' }}>견적서 보관 (멀티 드래그&amp;드롭/캡처붙여넣기)</th>
                      <th style={{ padding: '8px 12px', width: '60px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(request.supplierQuotes && request.supplierQuotes.length > 0) ? request.supplierQuotes.map((q, idx) => (
                      <tr key={q.id} style={{ borderBottom: '1px solid var(--border-color)', height: '38px' }}>
                        <td style={{ padding: '4px 8px' }}>
                          <input type="text" value={q.supplierName} onChange={(e) => {
                            const next = [...(request.supplierQuotes || [])];
                            next[idx] = { ...next[idx], supplierName: e.target.value };
                            saveToStorage(importRequests.map(r => r.id === id ? { ...r, supplierQuotes: next } : r));
                          }} style={{ width: '100%', height: '28px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '12.5px', padding: '0 8px', outline: 'none' }} />
                        </td>
                        <td style={{ padding: '4px 8px' }}>
                          <input type="text" value={q.itemName || ''} onChange={(e) => {
                            const next = [...(request.supplierQuotes || [])];
                            next[idx] = { ...next[idx], itemName: e.target.value };
                            saveToStorage(importRequests.map(r => r.id === id ? { ...r, supplierQuotes: next } : r));
                          }} style={{ width: '100%', height: '28px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '12.5px', padding: '0 8px', outline: 'none' }} />
                        </td>
                        <td style={{ padding: '4px 8px' }}>
                          <select value={q.currency || 'USD'} onChange={(e) => {
                            const next = [...(request.supplierQuotes || [])];
                            next[idx] = { ...next[idx], currency: e.target.value };
                            saveToStorage(importRequests.map(r => r.id === id ? { ...r, supplierQuotes: next } : r));
                          }} style={{ width: '100%', height: '28px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '12.5px', padding: '0 4px', outline: 'none' }}>
                            <option value="USD">USD</option>
                            <option value="CNY">CNY</option>
                            <option value="KRW">KRW</option>
                          </select>
                        </td>
                        <td style={{ padding: '4px 8px' }}>
                          <input type="number" value={q.amount || ''} onChange={(e) => {
                            const next = [...(request.supplierQuotes || [])];
                            next[idx] = { ...next[idx], amount: Number(e.target.value) || 0 };
                            saveToStorage(importRequests.map(r => r.id === id ? { ...r, supplierQuotes: next } : r));
                          }} style={{ width: '100%', height: '28px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '12.5px', padding: '0 8px', outline: 'none', textAlign: 'right' }} />
                        </td>
                        <td style={{ padding: '4px 8px' }}>
                          <input type="date" value={q.quoteDate || ''} onChange={(e) => {
                            const next = [...(request.supplierQuotes || [])];
                            next[idx] = { ...next[idx], quoteDate: e.target.value };
                            saveToStorage(importRequests.map(r => r.id === id ? { ...r, supplierQuotes: next } : r));
                          }} style={{ width: '100%', height: '28px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '12.5px', padding: '0 4px', outline: 'none' }} />
                        </td>
                        <td style={{ padding: '6px 8px', minWidth: '240px' }}>
                          {(() => {
                            const fileList = Array.isArray((q as any).files) ? (q as any).files : ((q as any).files ? [(q as any).files] : []);
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {fileList.length > 0 && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                    {fileList.map((f: any, fIdx: number) => (
                                      <div key={fIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 6px', fontSize: '11.5px' }}>
                                        <span style={{ cursor: 'pointer', color: '#2563eb', fontWeight: 600, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '160px' }} onClick={() => previewFile(f.url, f.name)}>
                                          📄 {f.name}
                                        </span>
                                        <button type="button" onClick={() => handleQuoteFileDelete(q.id, fIdx)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px', padding: '0 2px' }}>×</button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <UploadZone
                                  label="드래그 드롭 / 화면캡처(Ctrl+V)"
                                  isUploading={uploadingQuoteId === q.id}
                                  onFileSelect={(file) => handleQuoteFileUpload(q.id, file)}
                                />
                              </div>
                            );
                          })()}
                        </td>
                        <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                          <button type="button" onClick={() => {
                            const next = (request.supplierQuotes || []).filter((_, i) => i !== idx);
                            saveToStorage(importRequests.map(r => r.id === id ? { ...r, supplierQuotes: next } : r));
                          }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={7} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>등록된 공급사 견적이 없습니다.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 원가 / 마진 / 고객견적 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-default)', paddingBottom: '6px' }}>수입원가 산정 (KRW)</span>
                {([
                  ['productCost', '제품 원가'],
                  ['freightCost', '예상 운임'],
                  ['customsCost', '예상 관세/통관비'],
                  ['otherCost', '기타 비용']
                ] as const).map(([key, label]) => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <label style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>{label}</label>
                    <input type="number" value={(request.costBreakdown as any)?.[key] || ''} onChange={(e) => {
                      const nextBreakdown = { ...(request.costBreakdown || {}), [key]: Number(e.target.value) || 0 };
                      saveToStorage(importRequests.map(r => r.id === id ? { ...r, costBreakdown: nextBreakdown } : r));
                    }} style={{ width: '140px', padding: '6px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', outline: 'none', textAlign: 'right' }} />
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-default)', paddingTop: '8px', marginTop: '4px' }}>
                  <strong style={{ fontSize: '13px' }}>수입원가 합계</strong>
                  <strong style={{ fontSize: '13px', color: '#0f766e' }}>
                    {(((request.costBreakdown?.productCost || 0) + (request.costBreakdown?.freightCost || 0) + (request.costBreakdown?.customsCost || 0) + (request.costBreakdown?.otherCost || 0))).toLocaleString()} 원
                  </strong>
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-default)', paddingBottom: '6px' }}>마진 및 고객 견적</span>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <label style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>마진율 (%)</label>
                  <input type="number" value={request.marginRate ?? ''} onChange={(e) => {
                    const rate = Number(e.target.value) || 0;
                    const totalCost = (request.costBreakdown?.productCost || 0) + (request.costBreakdown?.freightCost || 0) + (request.costBreakdown?.customsCost || 0) + (request.costBreakdown?.otherCost || 0);
                    const marginAmount = Math.round(totalCost * (rate / 100));
                    saveToStorage(importRequests.map(r => r.id === id ? { ...r, marginRate: rate, marginAmount, customerQuoteAmount: totalCost + marginAmount } : r));
                  }} style={{ width: '140px', padding: '6px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', outline: 'none', textAlign: 'right' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <label style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>마진 금액 (₩)</label>
                  <strong style={{ fontSize: '13px', color: '#b45309' }}>{(request.marginAmount || 0).toLocaleString()} 원</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-default)', paddingTop: '8px', marginTop: '4px' }}>
                  <strong style={{ fontSize: '13px' }}>고객 제시 견적금액</strong>
                  <strong style={{ fontSize: '14px', color: '#1e3a8a' }}>{(request.customerQuoteAmount || 0).toLocaleString()} 원</strong>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>고객사 진행 결정</label>
                  <select value={request.customerDecision || '검토중'} onChange={(e) => {
                    const val = e.target.value as any;
                    const nextStatus = val === '승인' ? '발주 진행' : '진행 결정 요청';
                    saveToStorage(importRequests.map(r => r.id === id ? { ...r, customerDecision: val, status: nextStatus, customerDecisionDate: new Date().toISOString().slice(0, 10) } : r));
                    if (val === '승인') {
                      navigate(`/imports/${id}?mode=active`, { replace: true });
                    } else {
                      navigate(`/imports/${id}?mode=quote`, { replace: true });
                    }
                  }} style={{ padding: '7px 10px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', outline: 'none', background: '#fff' }}>
                    <option value="검토중">검토중</option>
                    <option value="승인">승인 (진행 결정)</option>
                    <option value="보류">보류</option>
                    <option value="거절">거절</option>
                  </select>
                  {request.customerDecisionDate && (
                    <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>결정일: {request.customerDecisionDate}</span>
                  )}
                </div>
              </div>
            </div>

            {request.customerDecision === '승인' && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '14px 16px', fontSize: '12.5px', color: '#166534' }}>
                ✅ 고객사가 진행을 승인했습니다. <strong>③ 발주/매입</strong> 탭에서 공급사에 PO를 발행하세요.
              </div>
            )}
          </div>
        )}

        {activeTab === '수입내역' && (
          <div>
            {/* Section 1: 기본 정보 */}
            <div style={{ marginBottom: '16px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1e3a8a', borderBottom: '2px solid var(--border-default)', paddingBottom: '4px', marginBottom: '10px' }}>수입 기본 정보 및 운송 개요</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
                {/* Left Card: 기본 정보 (2줄 구성) */}
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* Row 1: 수입주체, 수입처, 최종 고객사 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 2fr 2fr', gap: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>수입주체</label>
                      <select
                        value={request.importCompany || 'YSACC'}
                        onChange={(e) => saveToStorage(importRequests.map(r => r.id === id ? { ...r, importCompany: e.target.value as any } : r))}
                        style={{ height: '30px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 600, color: '#1e293b', outline: 'none', background: '#fff' }}
                      >
                        <option value="YSACC">YSACC</option>
                        <option value="영성ACC">영성ACC</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>수입처 (공급업체)</label>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <input
                          type="text"
                          readOnly
                          value={request.importerName || ''}
                          placeholder="공급업체 지정"
                          style={{ flex: 1, height: '30px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 600, color: '#1e293b', outline: 'none', background: '#f1f5f9' }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowSupplierSearchModal(true)}
                          style={{ height: '30px', padding: '0 8px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          🔍
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>최종 고객사</label>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <input
                          type="text"
                          readOnly
                          value={request.finalCustomer || ''}
                          placeholder="고객사 지정"
                          style={{ flex: 1, height: '30px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 600, color: '#1e293b', outline: 'none', background: '#f1f5f9' }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowCustomerModal(true)}
                          style={{ height: '30px', padding: '0 8px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          🔍
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Row 2: INCOTERMS, 결제 방식, PO 번호, PI 번호 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr 1.6fr 1.6fr', gap: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>INCOTERMS</label>
                      <select
                        value={request.incoterms || 'FOB'}
                        onChange={(e) => saveToStorage(importRequests.map(r => r.id === id ? { ...r, incoterms: e.target.value } : r))}
                        style={{ height: '30px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 600, color: '#1e293b', outline: 'none', background: '#fff' }}
                      >
                        <option value="FOB">FOB</option>
                        <option value="EXW">EXW</option>
                        <option value="CIF">CIF</option>
                        <option value="DDP">DDP</option>
                        <option value="DAP">DAP</option>
                        <option value="FCA">FCA</option>
                        <option value="CFR">CFR</option>
                        <option value="CPT">CPT</option>
                        <option value="CIP">CIP</option>
                        <option value="DPU">DPU</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>결제 방식</label>
                      <select
                        value={request.paymentTerms || '100% T/T in advance'}
                        onChange={(e) => saveToStorage(importRequests.map(r => r.id === id ? { ...r, paymentTerms: e.target.value } : r))}
                        style={{ height: '30px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 600, color: '#1e293b', outline: 'none', background: '#fff' }}
                      >
                        <option value="100% T/T in advance">100% T/T in advance</option>
                        <option value="T/T 30% deposit, 70% balance">T/T 30% deposit, 70% balance</option>
                        <option value="L/C at sight">L/C at sight</option>
                        <option value="Net 30 days">Net 30 days</option>
                        <option value="Net 60 days">Net 60 days</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>PO 번호</label>
                      <input
                        type="text"
                        value={request.poNumber && request.poNumber !== '-' ? request.poNumber : ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          saveToStorage(importRequests.map(r => r.id === id ? { ...r, poNumber: val || '-' } : r));
                        }}
                        placeholder="PO 번호 직접 입력"
                        style={{ height: '30px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 600, color: '#1e293b', outline: 'none', background: '#fff' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>PI 번호</label>
                      <input
                        type="text"
                        value={request.piNumber || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          saveToStorage(importRequests.map(r => r.id === id ? { ...r, piNumber: val } : r));
                        }}
                        placeholder="PI 번호 직접 입력"
                        style={{ height: '30px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 600, color: '#1e293b', outline: 'none', background: '#fff' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Right Card: 운송 개요 (2줄 구성) */}
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  {/* Row 1: 운송수단, 출발 PORT, 도착 PORT */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1.5fr', gap: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>운송수단</label>
                      <select
                        value={request.transportType || 'By Sea'}
                        onChange={(e) => saveToStorage(importRequests.map(r => r.id === id ? { ...r, transportType: e.target.value } : r))}
                        style={{ height: '30px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 600, color: '#1e293b', outline: 'none', background: '#fff' }}
                      >
                        <option value="By Sea">By Sea</option>
                        <option value="By Air">By Air</option>
                        <option value="By Truck">By Truck</option>
                        <option value="기타">기타</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>출발 PORT (POL)</label>
                      <input
                        type="text"
                        value={request.pol || ''}
                        onChange={(e) => saveToStorage(importRequests.map(r => r.id === id ? { ...r, pol: e.target.value } : r))}
                        style={{ height: '30px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 600, color: '#1e293b', outline: 'none', background: '#fff' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>도착 PORT (POD)</label>
                      <input
                        type="text"
                        value={request.pod || ''}
                        onChange={(e) => saveToStorage(importRequests.map(r => r.id === id ? { ...r, pod: e.target.value } : r))}
                        style={{ height: '30px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 600, color: '#1e293b', outline: 'none', background: '#fff' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: 품목 명세 */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--border-default)', paddingBottom: '4px', marginBottom: '10px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1e3a8a', margin: 0 }}>수입 제품 및 패킹 명세 리스트</h3>
                <button
                  type="button"
                  onClick={() => {
                    const next = [...(request.piItems || []), { name: '', qty: '', unitPrice: '', amount: '', hsCode: '', unit: 'EA', palletSize: '', cbm: '', netWeight: '', grossWeight: '' }];
                    saveToStorage(importRequests.map(r => r.id === id ? { ...r, piItems: next } : r));
                  }}
                  style={{ padding: '0 10px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', height: '28px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  ＋ 상품 추가 (Add Row)
                </button>
              </div>
              <div style={{ border: '1px solid var(--border-default)', borderRadius: '6px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', borderBottom: '1px solid var(--border-default)', height: '34px' }}>
                      <th style={{ padding: '8px 12px', width: '40px', textAlign: 'center' }}>No</th>
                      <th style={{ padding: '8px 12px' }}>DESCRIPTION OF COMMODITY</th>
                      <th style={{ padding: '8px 12px', width: '110px' }}>HS CODE</th>
                      <th style={{ padding: '8px 12px', width: '90px', textAlign: 'right' }}>QTY</th>
                      <th style={{ padding: '8px 12px', width: '70px', textAlign: 'center' }}>UNIT</th>
                      <th style={{ padding: '8px 12px', width: '100px', textAlign: 'right' }}>U.PRICE</th>
                      <th style={{ padding: '8px 12px', width: '120px', textAlign: 'right' }}>TOTAL AMOUNT</th>
                      <th style={{ padding: '8px 12px', width: '120px' }}>PALLET SIZE</th>
                      <th style={{ padding: '8px 12px', width: '80px', textAlign: 'right' }}>CBM</th>
                      <th style={{ padding: '8px 12px', width: '100px', textAlign: 'right' }}>N.WT (KG)</th>
                      <th style={{ padding: '8px 12px', width: '100px', textAlign: 'right' }}>G.WT (KG)</th>
                      <th style={{ padding: '8px 12px', width: '60px', textAlign: 'center' }}>액션</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(request.piItems && request.piItems.length > 0) ? (
                      request.piItems.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)', height: '38px' }}>
                          <td style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 600 }}>{idx + 1}</td>
                          <td style={{ padding: '4px 6px' }}>
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              <input
                                type="text"
                                value={item.name || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const nextItems = [...(request.piItems || [])];
                                  nextItems[idx] = { ...nextItems[idx], name: val };
                                  saveToStorage(importRequests.map(r => r.id === id ? { ...r, piItems: nextItems } : r));
                                }}
                                style={{ flex: 1, height: '30px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 6px', fontSize: '12px', boxSizing: 'border-box' }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setProductSearchTargetIdx(idx);
                                  setShowProductSearch(true);
                                }}
                                style={{ height: '30px', padding: '0 8px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                              >
                                🔍
                              </button>
                            </div>
                          </td>
                          <td style={{ padding: '4px 6px' }}>
                            <input
                              type="text"
                              value={item.hsCode || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                const nextItems = [...(request.piItems || [])];
                                nextItems[idx] = { ...nextItems[idx], hsCode: val };
                                saveToStorage(importRequests.map(r => r.id === id ? { ...r, piItems: nextItems } : r));
                              }}
                              style={{ width: '100%', height: '30px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 6px', fontSize: '12px', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '4px 6px' }}>
                            <input
                              type="number"
                              value={item.qty || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                const nextItems = [...(request.piItems || [])];
                                nextItems[idx] = { ...nextItems[idx], qty: val };
                                saveToStorage(importRequests.map(r => r.id === id ? { ...r, piItems: nextItems } : r));
                              }}
                              style={{ width: '100%', height: '30px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 6px', fontSize: '12px', textAlign: 'right', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '4px 6px' }}>
                            <select
                              value={item.unit || 'EA'}
                              onChange={(e) => {
                                const val = e.target.value;
                                const nextItems = [...(request.piItems || [])];
                                nextItems[idx] = { ...nextItems[idx], unit: val };
                                saveToStorage(importRequests.map(r => r.id === id ? { ...r, piItems: nextItems } : r));
                              }}
                              style={{ width: '100%', height: '30px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', background: '#fff', boxSizing: 'border-box' }}
                            >
                              <option value="EA">EA</option>
                              <option value="SET">SET</option>
                              <option value="BOX">BOX</option>
                              <option value="M2">M2</option>
                              <option value="PCS">PCS</option>
                              <option value="ROLL">ROLL</option>
                              <option value="KG">KG</option>
                            </select>
                          </td>
                          <td style={{ padding: '4px 6px' }}>
                            <input
                              type="number"
                              value={item.unitPrice || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                const nextItems = [...(request.piItems || [])];
                                nextItems[idx] = { ...nextItems[idx], unitPrice: val };
                                saveToStorage(importRequests.map(r => r.id === id ? { ...r, piItems: nextItems } : r));
                              }}
                              style={{ width: '100%', height: '30px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 6px', fontSize: '12px', textAlign: 'right', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 700 }}>
                            ${((Number(item.qty) || 0) * (Number(item.unitPrice) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: '4px 6px' }}>
                            <input
                              type="text"
                              value={item.palletSize || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                const nextItems = [...(request.piItems || [])];
                                nextItems[idx] = { ...nextItems[idx], palletSize: val };
                                saveToStorage(importRequests.map(r => r.id === id ? { ...r, piItems: nextItems } : r));
                              }}
                              style={{ width: '100%', height: '30px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 6px', fontSize: '12px', textAlign: 'right', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '4px 6px' }}>
                            <input
                              type="number"
                              step="0.01"
                              value={item.cbm || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                const nextItems = [...(request.piItems || [])];
                                nextItems[idx] = { ...nextItems[idx], cbm: val };
                                saveToStorage(importRequests.map(r => r.id === id ? { ...r, piItems: nextItems } : r));
                              }}
                              style={{ width: '100%', height: '30px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 6px', fontSize: '12px', textAlign: 'right', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '4px 6px' }}>
                            <input
                              type="number"
                              value={item.netWeight || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                const nextItems = [...(request.piItems || [])];
                                nextItems[idx] = { ...nextItems[idx], netWeight: val };
                                saveToStorage(importRequests.map(r => r.id === id ? { ...r, piItems: nextItems } : r));
                              }}
                              style={{ width: '100%', height: '30px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 6px', fontSize: '12px', textAlign: 'right', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '4px 6px' }}>
                            <input
                              type="number"
                              value={item.grossWeight || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                const nextItems = [...(request.piItems || [])];
                                nextItems[idx] = { ...nextItems[idx], grossWeight: val };
                                saveToStorage(importRequests.map(r => r.id === id ? { ...r, piItems: nextItems } : r));
                              }}
                              style={{ width: '100%', height: '30px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 6px', fontSize: '12px', textAlign: 'right', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => {
                                const next = (request.piItems || []).filter((_, i) => i !== idx);
                                saveToStorage(importRequests.map(r => r.id === id ? { ...r, piItems: next } : r));
                              }}
                              style={{ width: '26px', height: '26px', padding: 0, background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '4px', color: '#dc2626', fontWeight: 'bold', cursor: 'pointer' }}
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={12} style={{ padding: '24px', textAlign: 'center' }}>등록된 제품 명세가 없습니다.</td>
                      </tr>
                    )}
                    
                    {request.piItems && request.piItems.length > 0 && (
                      <tr style={{ background: '#f8fafc', fontWeight: 'bold', borderTop: '2px solid var(--border-default)', height: '36px' }}>
                        <td colSpan={3} style={{ padding: '8px 12px', textAlign: 'center' }}>합계 (Total Summary)</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#1e3a8a' }}>{totalQty.toLocaleString()}</td>
                        <td colSpan={3} style={{ padding: '8px 12px', textAlign: 'right', color: '#0f766e' }}>${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>NOS of PLT/PKG</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#b45309' }}>{totalCbm.toFixed(2)} CBM</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{totalNetWt.toLocaleString()} kg</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{totalGrossWt.toLocaleString()} kg</td>
                        <td></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

            </div>

            {/* PO 생성 컨트롤 세션 */}
            <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-default)', marginTop: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '20px' }}>
                {/* Left side: PO Settings & Shipping Mark Inputs */}
                <div>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '13.5px', fontWeight: 800, color: '#1e3a8a' }}>📋 발주서 (PO) 생성 추가 세부설정 및 쉬핑마크</h4>
                  
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                      <label style={{ fontSize: '11px', fontWeight: 750, color: 'var(--text-secondary)' }}>결제 방식 (Payment Terms)</label>
                      <input
                        type="text"
                        value={request.paymentTerms || '100% T/T in advance'}
                        onChange={(e) => {
                          const val = e.target.value;
                          const updated = importRequests.map(r => r.id === id ? { ...r, paymentTerms: val } : r);
                          saveToStorage(updated);
                        }}
                        style={{ padding: '6px 10px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12px', outline: 'none', height: '30px' }}
                      />
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                    <strong style={{ fontSize: '12px', color: '#0a1e3f', display: 'block', marginBottom: '8px' }}>⚙️ 공통 쉬핑마크 설정 (Common Shipping Mark Setup)</strong>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1fr', gap: '8px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>도형 선택</label>
                        <select
                          value={commonShippingMark.shape}
                          onChange={(e) => {
                            const next = { ...commonShippingMark, shape: e.target.value };
                            setCommonShippingMark(next);
                            const updated = importRequests.map(r => r.id === id ? { ...r, commonShippingMark: next } : r);
                            saveToStorage(updated);
                          }}
                          style={{ padding: '4px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12px', outline: 'none', background: '#fff', height: '30px' }}
                        >
                          <option value="diamond">◇ 다이아몬드</option>
                          <option value="none">없음 (None)</option>
                        </select>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>회사/고객 약자</label>
                        <input
                          type="text"
                          value={commonShippingMark.company}
                          onChange={(e) => {
                            const next = { ...commonShippingMark, company: e.target.value };
                            setCommonShippingMark(next);
                            const updated = importRequests.map(r => r.id === id ? { ...r, commonShippingMark: next } : r);
                            saveToStorage(updated);
                          }}
                          style={{ padding: '4px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12px', outline: 'none', height: '30px' }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>도착 포트</label>
                        <input
                          type="text"
                          value={commonShippingMark.port}
                          onChange={(e) => {
                            const next = { ...commonShippingMark, port: e.target.value };
                            setCommonShippingMark(next);
                            const updated = importRequests.map(r => r.id === id ? { ...r, commonShippingMark: next } : r);
                            saveToStorage(updated);
                          }}
                          style={{ padding: '4px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12px', outline: 'none', height: '30px' }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>도착 국가</label>
                        <input
                          type="text"
                          value={commonShippingMark.country}
                          onChange={(e) => {
                            const next = { ...commonShippingMark, country: e.target.value };
                            setCommonShippingMark(next);
                            const updated = importRequests.map(r => r.id === id ? { ...r, commonShippingMark: next } : r);
                            saveToStorage(updated);
                          }}
                          style={{ padding: '4px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12px', outline: 'none', height: '30px' }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>원산지</label>
                        <input
                          type="text"
                          value={commonShippingMark.origin}
                          onChange={(e) => {
                            const next = { ...commonShippingMark, origin: e.target.value };
                            setCommonShippingMark(next);
                            const updated = importRequests.map(r => r.id === id ? { ...r, commonShippingMark: next } : r);
                            saveToStorage(updated);
                          }}
                          style={{ padding: '4px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12px', outline: 'none', height: '30px' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right side: Live Preview */}
                <div style={{ background: '#fff', border: '1px dashed var(--border-default)', borderRadius: '6px', padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 700 }}>🔍 실시간 쉬핑마크 미리보기 (Live Preview)</div>
                  <div style={{ border: '1px solid var(--border-color)', padding: '8px 12px', minWidth: '200px', background: '#fafafa', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', boxSizing: 'border-box' }}>
                    {commonShippingMark.shape === 'diamond' ? (
                      <div style={{ position: 'relative', width: '90px', height: '54px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '2px 0' }}>
                        <svg viewBox="0 0 100 60" style={{ position: 'absolute', width: '100%', height: '100%' }}>
                          <polygon points="50,2 98,30 50,58 2,30" fill="none" stroke="#334155" strokeWidth="2" />
                        </svg>
                        <span style={{ position: 'relative', fontWeight: 800, fontSize: '12px', color: 'var(--text-primary)', zIndex: 2 }}>{commonShippingMark.company}</span>
                      </div>
                    ) : (
                      <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{commonShippingMark.company}</strong>
                    )}
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px', fontWeight: 600, lineHeight: '1.3' }}>
                      {commonShippingMark.port}, {commonShippingMark.country}<br/>
                      PO NO : {request.poNumber || request.id}<br/>
                      {commonShippingMark.origin}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 수입처 PI 유첨 영역 */}
            <div style={{ marginTop: '16px', background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-default)', paddingBottom: '4px', marginBottom: '8px' }}>
                📁 수입처 (공급업체) 발급 PI (Proforma Invoice) 유첨
              </div>
              {renderMultiUploadZone('supplierPi', '수입처 PI 업로드 및 이미지 캡처(Ctrl+V) 붙여넣기', request.supplierPiFile)}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                onClick={() => setShowPoModal(true)}
                style={{ padding: '8px 16px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                미리보기 및 인쇄
              </button>
              <button
                onClick={() => {
                  const printWin = window.open('', '_blank');
                  if (!printWin) return alert('팝업 차단기를 해제해주세요.');
                  
                  const itemsHtml = (request.piItems || []).map((item, idx) => `
                    <tr style="border-bottom: 1px solid var(--border-default); height: 32px;">
                      <td style="text-align: center; border: 1px solid var(--border-default);">${idx + 1}</td>
                      <td style="border: 1px solid var(--border-default); padding-left: 8px;">${item.name}</td>
                      <td style="text-align: center; border: 1px solid var(--border-default);">${item.hsCode || '-'}</td>
                      <td style="text-align: right; border: 1px solid var(--border-default); padding-right: 8px;">${(Number(item.qty) || 0).toLocaleString()}</td>
                      <td style="text-align: center; border: 1px solid var(--border-default);">${item.unit || 'EA'}</td>
                      <td style="text-align: right; border: 1px solid var(--border-default); padding-right: 8px;">$${(Number(item.unitPrice) || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      <td style="text-align: right; border: 1px solid var(--border-default); padding-right: 8px;">$${((Number(item.qty) || 0) * (Number(item.unitPrice) || 0)).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                    </tr>
                  `).join('');

                  printWin.document.write(`
                    <html>
                    <head>
                      <title>Purchase Order - ${request.id}</title>
                      <style>
                        body { font-family: 'Arial', sans-serif; padding: 40px; color: var(--text-primary); line-height: 1.4; }
                        .header { display: flex; justify-content: space-between; border-bottom: 3px double #1e3a8a; padding-bottom: 10px; margin-bottom: 24px; }
                        .po-title { font-size: 28px; font-weight: bold; color: #1e3a8a; }
                        .meta-table, .item-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
                        .item-table th { background: #f1f5f9; font-weight: bold; border: 1px solid var(--border-default); padding: 8px; }
                        .packing-section { background: #f8fafc; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 24px; font-size: 13px; }
                        .signature-section { display: flex; justify-content: space-between; margin-top: 60px; }
                        .signature-box { border-top: 1px solid var(--text-muted); width: 220px; text-align: center; padding-top: 8px; font-size: 13px; font-weight: bold; }
                      </style>
                    </head>
                    <body>
                      <div style="margin-bottom: 24px;">
                        <img 
                          src="${currentLetterhead === 'YSACC' ? ysaccLetterImg : ysAccLetterImg}" 
                          alt="Letterhead" 
                          style="width: 100%; max-height: 120px; object-fit: contain; display: block; margin-bottom: 16px;"
                        />
                        <div style="display: flex; justify-content: flex-end; border-bottom: 2px solid #0a1e3f; padding-bottom: 8px;">
                          <div style="text-align: right; font-size: 13px; min-width: 180px;">
                            <div style="font-size: 16px; font-weight: 800; color: #b91c1c; margin-bottom: 2px;">PURCHASE ORDER</div>
                            <div><strong>PO NO:</strong> ${request.poNumber || request.id}</div>
                            ${request.piNumber ? `<div><strong>PI NO:</strong> ${request.piNumber}</div>` : ''}
                            <div><strong>Date:</strong> ${formatDateToEnglish(request.createdAt)}</div>
                          </div>
                        </div>
                      </div>

                      <table class="meta-table">
                        <tr>
                          <td style="width: 50%; vertical-align: top; padding-right: 20px;">
                            <div style="background: #f8fafc; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px;">
                              <strong style="color: #0a1e3f;">BUYER</strong><br/>
                              Company: ${letterheadInfo.company}<br/>
                              Address: ${letterheadInfo.address}
                            </div>
                          </td>
                          <td style="width: 50%; vertical-align: top;">
                            <div style="background: #f8fafc; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px;">
                              <strong style="color: #0a1e3f;">SELLER</strong><br/>
                              Company: ${request.importerName || request.shipperName || 'Global Supplier Ltd.'}<br/>
                              Origin: ${request.origin || 'CHINA'}<br/>
                              Incoterms: ${request.incoterms || 'FOB'}<br/>
                              Payment Terms: ${request.paymentTerms || '100% T/T in advance'}
                            </div>
                          </td>
                        </tr>
                      </table>

                      <div class="packing-section" style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div style="flex: 1;">
                          <strong style="color: #0a1e3f;">[ SHIPPING &amp; PACKING INFORMATION ]</strong><br/>
                          <div style="display: grid; grid-template-columns: 1fr; gap: 4px; margin-top: 6px;">
                            <div>- Shipment By: ${request.transportType || 'By Sea'}</div>
                            <div>- Port of Loading (POL): ${request.pol || request.portOfLoading || '-'}</div>
                            <div>- Port of Discharge (POD): ${request.pod || request.portOfDischarge || '-'}</div>
                          </div>
                        </div>
                        <div style="border-left: 1px solid var(--border-default); padding-left: 20px; margin-left: 20px; min-width: 200px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                          <strong style="color: #0a1e3f; font-size: 11px; margin-bottom: 6px; display: block; align-self: flex-start;">SHIPPING MARK</strong>
                          <div style="border: 1px solid var(--border-default); padding: 10px; background: #fff; text-align: center; display: flex; flex-direction: column; alignItems: center; width: 140px;">
                            ${getShippingMarkShapeImgHtml(commonShippingMark.shape, commonShippingMark.company)}
                            <div style="font-size: 9.5px; color: #334155; margin-top: 4px; font-weight: bold; line-height: 1.3;">
                              ${commonShippingMark.port}, ${commonShippingMark.country}<br/>
                              PO NO : ${request.poNumber || request.id}<br/>
                              ${commonShippingMark.origin}
                            </div>
                          </div>
                        </div>
                      </div>

                      <table class="item-table">
                        <thead>
                          <tr>
                            <th style="width: 40px;">No</th>
                            <th>Description</th>
                            <th style="width: 100px;">HS Code</th>
                            <th style="width: 80px;">Qty</th>
                            <th style="width: 60px;">Unit</th>
                            <th style="width: 100px;">U.Price</th>
                            <th style="width: 120px;">Total Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${itemsHtml}
                          <tr style="font-weight: bold; background: #f8fafc; height: 36px;">
                            <td colspan="3" style="text-align: center; border: 1px solid var(--border-default);">TOTAL SUMMARY</td>
                            <td style="text-align: right; border: 1px solid var(--border-default); padding-right: 8px;">${totalQty.toLocaleString()}</td>
                            <td style="border: 1px solid var(--border-default);"></td>
                            <td style="border: 1px solid var(--border-default);"></td>
                            <td style="text-align: right; border: 1px solid var(--border-default); padding-right: 8px;">$${totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                          </tr>
                        </tbody>
                      </table>

                      <div class="signature-section" style="position: relative; margin-top: 100px;">
                        <div class="signature-box">For Seller</div>
                        <div class="signature-box" style="position: relative;">
                          <img 
                            src="${ysaccStampImg}" 
                            alt="Stamp" 
                            style="position: absolute; left: 50%; transform: translateX(-50%); top: -65px; width: 145px; height: auto; object-fit: contain; pointer-events: none;"
                          />
                          For Buyer
                        </div>
                      </div>

                      <script>
                        window.onload = function() { window.print(); }
                      </script>
                    </body>
                    </html>
                  `);
                  printWin.document.close();
                }}
                style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                PO 즉시 인쇄
              </button>
            </div>
          </div>
        )}

        {activeTab === '대금결제' && (
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1e3a8a', borderBottom: '2px solid var(--border-default)', paddingBottom: '4px', marginBottom: '12px' }}>
              💳 수입 외화 대금 송금 및 결제 관리
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px', marginBottom: '16px' }}>
              {/* Left Card: 은행 정보 */}
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-default)', paddingBottom: '4px' }}>
                  🏦 거래처 (공급사) 송금 은행 정보
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>Beneficiary Bank</label>
                    <input 
                      type="text"
                      placeholder="은행 이름 입력"
                      value={request.supplierBankInfo?.bankName || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        const nextBank = { ...(request.supplierBankInfo || {}), bankName: val };
                        saveToStorage(importRequests.map(r => r.id === id ? { ...r, supplierBankInfo: nextBank } : r));
                      }}
                      style={{ height: '30px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 600, color: '#1e293b', outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>SWIFT Code</label>
                    <input 
                      type="text"
                      placeholder="SWIFT Code 입력"
                      value={request.supplierBankInfo?.swiftCode || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        const nextBank = { ...(request.supplierBankInfo || {}), swiftCode: val };
                        saveToStorage(importRequests.map(r => r.id === id ? { ...r, supplierBankInfo: nextBank } : r));
                      }}
                      style={{ height: '30px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 600, color: '#1e293b', outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>Account Number</label>
                    <input 
                      type="text"
                      placeholder="계좌번호 입력"
                      value={request.supplierBankInfo?.accountNumber || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        const nextBank = { ...(request.supplierBankInfo || {}), accountNumber: val };
                        saveToStorage(importRequests.map(r => r.id === id ? { ...r, supplierBankInfo: nextBank } : r));
                      }}
                      style={{ height: '30px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 600, color: '#1e293b', outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>Account Name</label>
                    <input 
                      type="text"
                      placeholder="예금주명 입력"
                      value={request.supplierBankInfo?.accountName || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        const nextBank = { ...(request.supplierBankInfo || {}), accountName: val };
                        saveToStorage(importRequests.map(r => r.id === id ? { ...r, supplierBankInfo: nextBank } : r));
                      }}
                      style={{ height: '30px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 600, color: '#1e293b', outline: 'none' }}
                    />
                  </div>
                </div>
              </div>

              {/* Right Card: 결제 요약 및 잔금 */}
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-default)', paddingBottom: '4px' }}>
                  📊 결제 요약 및 잔금
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', height: '100%' }}>
                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '8px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 700 }}>총 결제 대상 (USD)</div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#1e3a8a', marginTop: '2px' }}>
                      ${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '8px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 700 }}>총 누적 송금액 (USD)</div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#10b981', marginTop: '2px' }}>
                      ${(request.payments || []).reduce((sum, p) => p.currency === 'USD' || !p.currency ? sum + (Number(p.amount) || Number(p.amountUsd) || 0) : sum, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div style={{ gridColumn: 'span 2', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '10.5px', color: '#1e40af', fontWeight: 800 }}>미결제 잔금 (REMAINING BALANCE)</div>
                      <div style={{ fontSize: '20px', fontWeight: 900, color: (totalAmount - (request.payments || []).reduce((sum, p) => p.currency === 'USD' || !p.currency ? sum + (Number(p.amount) || Number(p.amountUsd) || 0) : sum, 0)) <= 0 ? '#10b981' : '#ef4444', marginTop: '2px' }}>
                        ${Math.max(0, totalAmount - (request.payments || []).reduce((sum, p) => p.currency === 'USD' || !p.currency ? sum + (Number(p.amount) || Number(p.amountUsd) || 0) : sum, 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    {(totalAmount - (request.payments || []).reduce((sum, p) => p.currency === 'USD' || !p.currency ? sum + (Number(p.amount) || Number(p.amountUsd) || 0) : sum, 0)) <= 0 && (
                      <span style={{ background: '#d1fae5', color: '#065f46', fontSize: '11px', fontWeight: 800, padding: '4px 8px', borderRadius: '12px' }}>완납 완료</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 지급 회차 관리 리스트 */}
            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-default)', paddingBottom: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  💳 외화 대금 송금/결제 회차 목록
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const currentPayments = request.payments || [];
                    const nextRound = currentPayments.length + 1;
                    const newPayment = {
                      id: `pay_${Date.now()}`,
                      round: nextRound,
                      date: new Date().toISOString().split('T')[0],
                      currency: 'USD' as const,
                      amount: 0,
                      amountUsd: 0,
                      amountKrw: 0,
                      remarks: ''
                    };
                    saveToStorage(importRequests.map(r => r.id === id ? { ...r, payments: [...currentPayments, newPayment] } : r));
                  }}
                  style={{ padding: '4px 10px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  ＋ 지급 회차 추가
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(request.payments || []).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px', color: '#64748b', fontSize: '13px', fontWeight: 600 }}>
                    등록된 지급 회차가 없습니다. '지급 회차 추가' 버튼을 눌러 등록해주세요.
                  </div>
                ) : (
                  (request.payments || []).map((pay) => (
                    <div key={pay.id} style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px 10px', display: 'grid', gridTemplateColumns: '55px 120px 170px 1.4fr 1.4fr 1.6fr 36px', gap: '8px', alignItems: 'center' }}>
                      {/* 1. 회차 */}
                      <div style={{ fontSize: '12px', fontWeight: 800, color: '#1e3a8a', textAlign: 'center', background: '#eff6ff', padding: '4px 2px', borderRadius: '4px' }}>
                        {pay.round}차
                      </div>

                      {/* 2. 송금일자 */}
                      <input 
                        type="date"
                        value={pay.date || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          const updatedPayments = (request.payments || []).map(p => p.id === pay.id ? { ...p, date: val } : p);
                          saveToStorage(importRequests.map(r => r.id === id ? { ...r, payments: updatedPayments } : r));
                        }}
                        style={{ height: '30px', padding: '0 4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 600, outline: 'none' }}
                      />

                      {/* 3. 송금 통화 및 금액 */}
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <select
                          value={pay.currency || 'USD'}
                          onChange={(e) => {
                            const val = e.target.value as any;
                            const updatedPayments = (request.payments || []).map(p => {
                              if (p.id === pay.id) {
                                const nextAmt = p.amount || p.amountUsd || 0;
                                return { 
                                  ...p, 
                                  currency: val,
                                  amount: nextAmt,
                                  amountUsd: val === 'USD' ? nextAmt : 0
                                };
                              }
                              return p;
                            });
                            saveToStorage(importRequests.map(r => r.id === id ? { ...r, payments: updatedPayments } : r));
                          }}
                          style={{ width: '65px', height: '30px', padding: '0 2px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', fontWeight: 700, color: '#1e293b', outline: 'none', background: '#fff' }}
                        >
                          <option value="USD">USD</option>
                          <option value="RMB">RMB</option>
                          <option value="EUR">EUR</option>
                          <option value="KRW">KRW</option>
                        </select>
                        <input 
                          type="number"
                          placeholder="송금액"
                          value={pay.amount || pay.amountUsd || ''}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            const updatedPayments = (request.payments || []).map(p => {
                              if (p.id === pay.id) {
                                const curr = p.currency || 'USD';
                                return { 
                                  ...p, 
                                  amount: val, 
                                  amountUsd: curr === 'USD' ? val : 0 
                                };
                              }
                              return p;
                            });
                            saveToStorage(importRequests.map(r => r.id === id ? { ...r, payments: updatedPayments } : r));
                          }}
                          style={{ flex: 1, height: '30px', padding: '0 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 600, outline: 'none' }}
                        />
                      </div>

                      {/* 4. 외환계산서 유첨 */}
                      {renderMultiUploadZone(`paymentFxMemo_${pay.id}`, '외환계산서(드래그/붙여넣기)', pay.fxMemoFiles, true)}

                      {/* 5. 송금영수증/입금증 유첨 */}
                      {renderMultiUploadZone(`paymentRemittanceSlip_${pay.id}`, '송금영수증(드래그/붙여넣기)', pay.remittanceSlipFiles, true)}

                      {/* 6. 비고 */}
                      <input 
                        type="text"
                        placeholder="비고 (특이사항)"
                        value={pay.remarks || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          const updatedPayments = (request.payments || []).map(p => p.id === pay.id ? { ...p, remarks: val } : p);
                          saveToStorage(importRequests.map(r => r.id === id ? { ...r, payments: updatedPayments } : r));
                        }}
                        style={{ height: '30px', padding: '0 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 600, outline: 'none' }}
                      />

                      {/* 7. 삭제 */}
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`${pay.round}차 결제 내역을 삭제하시겠습니까?`)) {
                            const updatedPayments = (request.payments || []).filter(p => p.id !== pay.id).map((p, idx) => ({ ...p, round: idx + 1 }));
                            saveToStorage(importRequests.map(r => r.id === id ? { ...r, payments: updatedPayments } : r));
                          }
                        }}
                        style={{ height: '30px', background: 'none', border: 'none', color: '#ef4444', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        🗑️
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button 
                onClick={() => setActiveTab('운송사/관세사 선정')}
                style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                저장 후 다음단계로
              </button>
            </div>
          </div>
        )}

        {activeTab === '운송사/관세사 선정' && (
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1e3a8a', borderBottom: '2px solid var(--border-default)', paddingBottom: '4px', marginBottom: '10px' }}>
              🚢 운송사 및 통관 관세사 선정 관리
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px', marginBottom: '16px' }}>
              {/* Left Card: Forwarder (2줄 구성) */}
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-default)', paddingBottom: '4px' }}>
                  Forwarder (지정 운송사)
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {/* Row 1: 운송사 이름, 선적정보 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>운송사 이름</label>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <input 
                          type="text"
                          readOnly
                          placeholder="포워더 검색"
                          value={request.forwarderName || ''}
                          style={{ flex: 1, padding: '4px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12px', outline: 'none', background: '#f1f5f9', height: '30px' }}
                        />
                        <button 
                          onClick={() => setShowForwarderModal(true)}
                          style={{ padding: '0 8px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', height: '30px' }}
                        >
                          🔍
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>선적정보(VESSEL정보)</label>
                      <input 
                        type="text"
                        placeholder="예: HYUNDAI TOKYO V.024E"
                        value={request.vesselName || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          const updated = importRequests.map(r => r.id === id ? { ...r, vesselName: val } : r);
                          saveToStorage(updated);
                        }}
                        style={{ padding: '4px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12px', outline: 'none', height: '30px' }}
                      />
                    </div>
                  </div>

                  {/* Row 2: ETD, ETA */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>ETD</label>
                      <input 
                        type="date"
                        value={request.etd || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          const updated = importRequests.map(r => r.id === id ? { ...r, etd: val } : r);
                          saveToStorage(updated);
                        }}
                        style={{ padding: '4px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12px', outline: 'none', height: '30px' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>ETA</label>
                      <input 
                        type="date"
                        value={request.eta || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          const updated = importRequests.map(r => r.id === id ? { ...r, eta: val } : r);
                          saveToStorage(updated);
                        }}
                        style={{ padding: '4px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12px', outline: 'none', height: '30px' }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Card: Customs Agent (2줄 구성) */}
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-default)', paddingBottom: '4px' }}>
                  Customs Agent (통관 관세사)
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>관세사사무소 이름</label>
                    <select
                      value={request.customsAgent || '이음관세사무소'}
                      onChange={(e) => {
                        const val = e.target.value;
                        const updated = importRequests.map(r => r.id === id ? { ...r, customsAgent: val } : r);
                        saveToStorage(updated);
                      }}
                      style={{ padding: '4px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12px', background: '#fff', height: '30px' }}
                    >
                      <option value="이음관세사무소">이음관세사무소</option>
                      <option value="세인관세법인">세인관세법인</option>
                      <option value="신한관세법인">신한관세법인</option>
                      <option value="자체 지정관세사">자체 지정관세사</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>통관 의뢰 진행상태</label>
                    <select
                      value={request.dangerousCargo || '미의뢰'}
                      onChange={(e) => {
                        const val = e.target.value;
                        const updated = importRequests.map(r => r.id === id ? { ...r, dangerousCargo: val } : r);
                        saveToStorage(updated);
                      }}
                      style={{ padding: '4px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12px', background: '#fff', height: '30px' }}
                    >
                      <option value="미의뢰">미의뢰</option>
                      <option value="서류 검토중">서류 검토중 (Pending Doc Review)</option>
                      <option value="수입신고진행">수입신고진행 (Customs Declaration)</option>
                      <option value="수입신고수리">수입신고수리 (Cleared)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ borderBottom: '1px solid var(--border-default)', margin: '16px 0 12px 0' }} />

            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1e3a8a', borderBottom: '2px solid var(--border-default)', paddingBottom: '4px', marginBottom: '12px' }}>
              📁 수입 서류 및 통관 서류 업로드 관리
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '14px', marginBottom: '12px' }}>
              {/* 필수 첨부 (CI, PL, CO, BL, 수입면장) - 2줄 그리드 구성 */}
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-default)', paddingBottom: '4px' }}>
                  필수 첨부 (*)
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px' }}>
                  {/* Row 1, Col 1: CI & PL */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      C/I &amp; P/L * {documents.ciPl && <span style={{ color: '#16a34a', fontWeight: 'bold' }}>✅</span>}
                    </div>
                    {renderMultiUploadZone('ciPl', 'C/I & P/L 업로드', documents.ciPl, true)}
                  </div>

                  {/* Row 1, Col 2: CO */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      CO * {documents.co && <span style={{ color: '#16a34a', fontWeight: 'bold' }}>✅</span>}
                    </div>
                    {renderMultiUploadZone('co', 'CO 업로드', documents.co, true)}
                  </div>

                  {/* Row 2, Col 1: BL */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      BL(AWB) * {documents.blAwbDoc && <span style={{ color: '#16a34a', fontWeight: 'bold' }}>✅</span>}
                    </div>
                    {renderMultiUploadZone('blAwbDoc', 'BL(AWB) 업로드', documents.blAwbDoc, true)}
                    <div style={{ display: 'flex', gap: '6px', marginTop: '1px' }}>
                      <input 
                        type="text"
                        value={request.blAwb && request.blAwb !== '-' ? request.blAwb : ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          const updated = importRequests.map(r => r.id === id ? { ...r, blAwb: val || '-' } : r);
                          saveToStorage(updated);
                        }}
                        placeholder="B/L 번호 직접 입력"
                        style={{ flex: 1, padding: '4px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '11px', outline: 'none', height: '28px' }}
                      />
                    </div>
                  </div>

                  {/* Row 2, Col 2: 수입신고필증 (수입면장) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      수입신고필증 (수입면장) * {documents.customsPermit && <span style={{ color: '#16a34a', fontWeight: 'bold' }}>✅</span>}
                    </div>
                    {renderMultiUploadZone('customsPermit', '수입신고필증 업로드', documents.customsPermit, true)}
                  </div>
                </div>
              </div>

              {/* 선택 첨부 및 세금계산서 영역 - 2줄 그리드 구성 */}
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-default)', paddingBottom: '4px' }}>
                  선택 및 세금계산서 첨부
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {/* Row 1: 3열 구성 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        📋 HS CODE 정보 {documents.hsCustomsInfo && <span style={{ color: '#16a34a' }}>✅</span>}
                      </div>
                      {renderMultiUploadZone('hsCustomsInfo', '관세 정보 업로드', documents.hsCustomsInfo, true)}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        💵 운임명세표 {request.freightInvoiceFile && <span style={{ color: '#16a34a' }}>✅</span>}
                      </div>
                      {renderMultiUploadZone('freightInvoice', '운임명세표 업로드', request.freightInvoiceFile, true)}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        인증/검역 {documents.inspect && <span style={{ color: '#16a34a' }}>✅</span>}
                      </div>
                      {renderMultiUploadZone('inspect', '인증 서류 업로드', documents.inspect, true)}
                    </div>
                  </div>

                  {/* Row 2: 2열 구성 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        기타 {documents.etc && <span style={{ color: '#16a34a' }}>✅</span>}
                      </div>
                      {renderMultiUploadZone('etc', '기타 업로드', documents.etc, true)}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        수입세금계산서 {documents.taxInvoice && <span style={{ color: '#16a34a' }}>✅</span>}
                      </div>
                      {renderMultiUploadZone('taxInvoice', '세금계산서 업로드', documents.taxInvoice, true)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button 
                onClick={() => {
                  alert('물류/통관 및 서류 정보가 성공적으로 반영되었습니다.');
                  setActiveTab('정산');
                }}
                style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                저장 후 다음단계로
              </button>
            </div>
          </div>
        )}

        {activeTab === '정산' && (
          <div>
            <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#1e3a8a', borderBottom: '2px solid var(--border-default)', paddingBottom: '6px', marginBottom: '20px' }}>
              💰 수입 관세 / 부가세 / 운임 정산 등록
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Row 1: 3-Column Grid for Tax Invoice, Freight, and Customs Duty */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* 1. 수입세금계산서 (세관) */}
                {renderTaxInvoiceTable('🧾 1. 수입세금계산서 (세관)', 'importTaxDocumentRows', '세금계산서', request.taxAmount || 0, request.taxVat || 0, '수입세매입')}

                {/* 2. 운임 (내륙/포워더) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {renderTaxInvoiceTable('🚚 2. 운임 (내륙/포워더)', 'freightTaxDocumentRows', '세금계산서', request.freightAmount || 0, request.freightVat || 0, '내륙운임')}
                  <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>📎 운임 증빙 서류 통합 관리</label>
                    {renderMultiUploadZone('freightDoc', '운임 증빙 첨부', documents.freightDoc, true)}
                  </div>
                </div>

                {/* 3. 관세 (Customs Duty) */}
                {renderTaxInvoiceTable('🏛️ 3. 관세 (Customs Duty)', 'customsTaxDocumentRows', '영수증', request.customsTaxAmount || 0, 0, '관세납부')}
              </div>

              <div style={{ background: '#eff6ff', padding: '18px', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-default)', paddingBottom: '6px', marginBottom: '14px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#1e3a8a' }}>
                    📑 4. ⑤ 고객사 정산 완료 (거래명세표 / 세금계산서 / 수금)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const defaultItemName = request.itemName || '';
                      const quoteTotal = request.customerQuoteAmount || 0;
                      const computedSupply = Math.round(quoteTotal / 1.1);
                      const computedVat = quoteTotal - computedSupply;
                      const qty = Number(request.costBreakdown?.buyingQty) || request.piItems?.reduce((sum: number, it: any) => sum + (Number(it.qty) || 0), 0) || 1;
                      const unitPrice = Math.round(computedSupply / qty);

                      const updated = importRequests.map(r => r.id === id ? { 
                        ...r, 
                        taxInvoiceItemName: defaultItemName,
                        taxInvoiceUnitPrice: unitPrice,
                        taxInvoiceTotalAmount: computedSupply,
                        taxInvoiceVat: computedVat,
                        taxInvoiceGrandTotal: quoteTotal
                      } : r);
                      saveToStorage(updated);
                    }}
                    style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', borderRadius: '4px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', padding: '4px 8px', transition: 'background 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
                    onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}
                  >
                    ⚡ 견적정보에서 계산서 자동입력
                  </button>
                </div>
                {/* 증빙서류 발행 내역 테이블 */}
                <div style={{ overflowX: 'auto', marginBottom: '20px', background: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '850px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1.5px solid #cbd5e1', height: '34px' }}>
                        <th style={{ fontSize: '11.5px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', padding: '6px 8px', width: '130px' }}>구분</th>
                        <th style={{ fontSize: '11.5px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', padding: '6px 8px', width: '160px' }}>발행일자</th>
                        <th style={{ fontSize: '11.5px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', padding: '6px 8px', width: '200px' }}>승인번호</th>
                        <th style={{ fontSize: '11.5px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', padding: '6px 8px', width: '160px', textAlign: 'right' }}>공급가액</th>
                        <th style={{ fontSize: '11.5px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', padding: '6px 8px', width: '140px', textAlign: 'right' }}>부가세액</th>
                        <th style={{ fontSize: '11.5px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', padding: '6px 8px', width: '140px', textAlign: 'right' }}>합계금액</th>
                        <th style={{ fontSize: '11.5px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', padding: '6px 8px' }}>비고</th>
                        <th style={{ fontSize: '11.5px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', padding: '6px 8px', width: '50px', textAlign: 'center' }}>삭제</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const rows: TaxDocumentRow[] = request.taxDocumentRows || [
                          {
                            id: 'r1',
                            type: '세금계산서',
                            issueDate: request.taxInvoiceIssuedDate || '',
                            docNumber: request.taxInvoiceNumber || '',
                            supplyAmount: request.taxInvoiceTotalAmount || 0,
                            vatAmount: request.taxInvoiceVat || 0,
                            grandTotal: request.taxInvoiceGrandTotal || 0,
                            remarks: request.taxInvoiceItemName || ''
                          },
                          {
                            id: 'r2',
                            type: '거래명세표',
                            issueDate: request.dealStatementSentDate || '',
                            docNumber: '',
                            supplyAmount: 0,
                            vatAmount: 0,
                            grandTotal: 0,
                            remarks: ''
                          }
                        ];

                        const updateRow = (rowId: string, fields: Partial<TaxDocumentRow>) => {
                          const updatedRows = rows.map(r => {
                            if (r.id === rowId) {
                              const newRow = { ...r, ...fields };
                              if (fields.supplyAmount !== undefined || fields.vatAmount !== undefined) {
                                const supply = fields.supplyAmount !== undefined ? fields.supplyAmount : r.supplyAmount;
                                const vat = fields.vatAmount !== undefined ? fields.vatAmount : (fields.supplyAmount !== undefined ? Math.round(fields.supplyAmount * 0.1) : r.vatAmount);
                                newRow.vatAmount = vat;
                                newRow.grandTotal = supply + vat;
                              }
                              return newRow;
                            }
                            return r;
                          });

                          const firstInvoice = updatedRows.find(r => r.type === '세금계산서');
                          const firstStatement = updatedRows.find(r => r.type === '거래명세표');

                          const compatibilityFields: any = {
                            taxDocumentRows: updatedRows
                          };
                          if (firstInvoice) {
                            compatibilityFields.taxInvoiceIssuedDate = firstInvoice.issueDate;
                            compatibilityFields.taxInvoiceNumber = firstInvoice.docNumber;
                            compatibilityFields.taxInvoiceTotalAmount = firstInvoice.supplyAmount;
                            compatibilityFields.taxInvoiceVat = firstInvoice.vatAmount;
                            compatibilityFields.taxInvoiceGrandTotal = firstInvoice.grandTotal;
                            compatibilityFields.taxInvoiceItemName = firstInvoice.remarks;
                          }
                          if (firstStatement) {
                            compatibilityFields.dealStatementSentDate = firstStatement.issueDate;
                          }

                          const updatedRequests = importRequests.map(r => r.id === id ? { ...r, ...compatibilityFields } : r);
                          saveToStorage(updatedRequests);
                        };

                        const deleteRow = (rowId: string) => {
                          const updatedRows = rows.filter(r => r.id !== rowId);
                          const updatedRequests = importRequests.map(r => r.id === id ? { ...r, taxDocumentRows: updatedRows } : r);
                          saveToStorage(updatedRequests);
                        };

                        return (
                          <>
                            {rows.map((row) => (
                              <tr key={row.id} style={{ borderBottom: '1px solid #e2e8f0', height: '48px' }}>
                                <td style={{ padding: '6px 4px' }}>
                                  <select
                                    value={row.type}
                                    onChange={(e) => updateRow(row.id, { type: e.target.value as any })}
                                    style={{ width: '100%', height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', fontWeight: 600, color: '#1e293b', padding: '0 8px', outline: 'none' }}
                                  >
                                    <option value="세금계산서">세금계산서</option>
                                    <option value="거래명세표">거래명세표</option>
                                    <option value="영수증">영수증</option>
                                    <option value="기타">기타</option>
                                  </select>
                                </td>
                                <td style={{ padding: '6px 4px' }}>
                                  <input
                                    type="date"
                                    value={row.issueDate || ''}
                                    onChange={(e) => updateRow(row.id, { issueDate: e.target.value })}
                                    style={{ width: '100%', height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', color: '#1e293b', padding: '0 8px', outline: 'none', boxSizing: 'border-box' }}
                                  />
                                </td>
                                <td style={{ padding: '6px 4px' }}>
                                  <input
                                    type="text"
                                    value={row.docNumber || ''}
                                    onChange={(e) => updateRow(row.id, { docNumber: e.target.value })}
                                    placeholder={row.type === '세금계산서' ? '국세청 승인번호' : '문서번호'}
                                    style={{ width: '100%', height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', color: '#1e293b', padding: '0 8px', outline: 'none', boxSizing: 'border-box' }}
                                  />
                                </td>
                                <td style={{ padding: '6px 4px' }}>
                                  <input
                                    type="number"
                                    value={row.supplyAmount || ''}
                                    onChange={(e) => updateRow(row.id, { supplyAmount: Number(e.target.value) || 0 })}
                                    placeholder="₩ 공급가액"
                                    style={{ width: '100%', height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', color: '#1e293b', padding: '0 8px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }}
                                  />
                                </td>
                                <td style={{ padding: '6px 4px' }}>
                                  <input
                                    type="number"
                                    value={row.vatAmount || ''}
                                    onChange={(e) => updateRow(row.id, { vatAmount: Number(e.target.value) || 0 })}
                                    placeholder="₩ 부가세"
                                    style={{ width: '100%', height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', color: '#1e293b', padding: '0 8px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }}
                                  />
                                </td>
                                <td style={{ padding: '6px 4px', textAlign: 'right', fontSize: '13.5px', fontWeight: 800, color: '#1e293b' }}>
                                  ₩{(row.grandTotal || 0).toLocaleString()}
                                </td>
                                <td style={{ padding: '6px 4px' }}>
                                  <input
                                    type="text"
                                    value={row.remarks || ''}
                                    onChange={(e) => updateRow(row.id, { remarks: e.target.value })}
                                    placeholder="비고 입력"
                                    style={{ width: '100%', height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', color: '#1e293b', padding: '0 8px', outline: 'none', boxSizing: 'border-box' }}
                                  />
                                </td>
                                <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                                    {row.type === '거래명세표' && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setDealStatementData({
                                            date: row.issueDate || new Date().toISOString().split('T')[0],
                                            receiverBizNo: '',
                                            receiverName: request.finalCustomer || '',
                                            receiverCEO: '',
                                            receiverAddr: '',
                                            receiverType: '',
                                            receiverItem: '',
                                            items: [
                                              {
                                                month: (row.issueDate || new Date().toISOString().split('T')[0]).split('-')[1] || '',
                                                day: (row.issueDate || new Date().toISOString().split('T')[0]).split('-')[2] || '',
                                                name: row.remarks || request.itemName || '수입 물품 매입 대금',
                                                spec: '규격',
                                                qty: 1,
                                                price: row.supplyAmount || 0,
                                                remarks: ''
                                              }
                                            ],
                                            receivableAmount: 0,
                                            receiverSign: ''
                                          });
                                          setShowDealStatementModal(true);
                                        }}
                                        style={{ background: '#3b82f6', border: 'none', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                                      >
                                        🖨️ 발행
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => deleteRow(row.id)}
                                      style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '14px', cursor: 'pointer', fontWeight: 'bold' }}
                                    >
                                      🗑️
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {/* 추가 행 버튼 */}
                            <tr>
                              <td colSpan={8} style={{ padding: '8px 4px' }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextId = `r_${Date.now()}`;
                                    const updatedRows = [...rows, {
                                      id: nextId,
                                      type: '세금계산서' as const,
                                      issueDate: '',
                                      docNumber: '',
                                      supplyAmount: 0,
                                      vatAmount: 0,
                                      grandTotal: 0,
                                      remarks: ''
                                    }];
                                    const updatedRequests = importRequests.map(r => r.id === id ? { ...r, taxDocumentRows: updatedRows } : r);
                                    saveToStorage(updatedRequests);
                                  }}
                                  style={{ width: '100%', height: '34px', background: '#fff', border: '1px dashed #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 700, color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', transition: 'background 0.2s' }}
                                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                                >
                                  ➕ 증빙서류 발행 내역 추가 (행 추가)
                                </button>
                              </td>
                            </tr>
                          </>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>대금 수령일</label>
                    <input type="date" value={request.paymentCollectedDate || ''} onChange={(e) => {
                      const updated = importRequests.map(r => r.id === id ? { ...r, paymentCollectedDate: e.target.value } : r);
                      saveToStorage(updated);
                    }} style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', outline: 'none' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>수령 금액 (₩)</label>
                    <input type="number" value={request.paymentCollectedAmount || ''} onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      const updated = importRequests.map(r => r.id === id ? { ...r, paymentCollectedAmount: val } : r);
                      saveToStorage(updated);
                    }} style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', outline: 'none', textAlign: 'right' }} placeholder="수령 금액 입력" />
                  </div>
                </div>

                {request.paymentCollectedDate && request.paymentCollectedAmount ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = importRequests.map(r => r.id === id ? { ...r, status: '손익검토 대기' } : r);
                        saveToStorage(updated);
                        setActiveTab('손익검토');
                        alert('대금 수령이 확인되었습니다. 마지막으로 ⑥ 손익검토 탭에서 최종 검토를 완료해주세요.');
                      }}
                      style={{ padding: '8px 16px', background: request.status === '업무 종료' ? '#94a3b8' : '#166534', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: request.status === '업무 종료' ? 'default' : 'pointer' }}
                      disabled={request.status === '업무 종료'}
                    >
                      {request.status === '업무 종료' ? '✅ 업무 종료됨' : '✅ 대금 수령 확인 → 손익검토로 이동'}
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>대금 수령일과 수령 금액을 입력하면 다음 단계로 진행할 수 있습니다.</div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                onClick={() => {
                  alert('정산 입력 정보가 안전하게 저장되었습니다.');
                  navigate('/imports');
                }}
                style={{ padding: '10px 20px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13.5px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                저장 후 목록으로
              </button>
            </div>
          </div>
        )}

        {activeTab === '손익검토' && (() => {
          // 계획 (견적단계) 계산: 실제 제품 매입가를 제외하고 2. 예상 운임 + 3. 예상 관세/통관비만 합산
          const plannedFreight = request.costBreakdown?.freightCost || 0;
          const plannedCustoms = request.costBreakdown?.customsCost || 0;

          const plannedCost = plannedFreight + plannedCustoms;
          const plannedMargin = request.marginAmount || 0;
          const plannedRevenue = request.customerQuoteAmount || request.amount || 0;

          // 실적 계산 (수입세금계산서 공급가액 + 운임 공급가액 + 관세액, 부가세 제외)
          // 1) 실제 제품 매입가: 수입세금계산서 공급가액 (부가세 제외)
          const actualPurchaseCost = (request.importTaxDocumentRows || []).reduce((sum, r) => sum + (Number(r.supplyAmount) || 0), 0) || request.taxAmount || 0;

          // 2) 실제 물류비: 운임 공급가액 (부가세 제외)
          const actualLogisticsCost = (request.freightTaxDocumentRows || []).reduce((sum, r) => sum + (Number(r.supplyAmount) || 0), 0) || request.freightAmount || 0;

          // 3) 실제 관세: 납부 관세액 (부가세 제외)
          const actualCustomsCost = (request.customsTaxDocumentRows || []).reduce((sum, r) => sum + (Number(r.supplyAmount) || 0), 0) || request.customsTaxAmount || 0;

          const actualTotalCost = actualPurchaseCost + actualLogisticsCost + actualCustomsCost;

          const actualRevenue = request.paymentCollectedAmount || plannedRevenue;
          const realizedMargin = actualRevenue - actualTotalCost;
          const realizedMarginRate = actualRevenue ? (realizedMargin / actualRevenue) * 100 : 0;
          const marginGap = realizedMargin - plannedMargin;

          return (
          <div>
            <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#1e3a8a', borderBottom: '2px solid var(--border-default)', paddingBottom: '6px', marginBottom: '20px' }}>
              📊 ⑥ 손익검토 (최종)
            </h3>

            <div style={{ border: '1px solid var(--border-default)', borderRadius: '8px', overflow: 'hidden', marginBottom: '20px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', borderBottom: '1px solid var(--border-default)', height: '36px' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>구분</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', width: '160px' }}>② 계획 (견적단계)</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', width: '160px' }}>실적 (③④⑤ 반영)</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', width: '160px' }}>차이</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', height: '36px' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>매입원가 (제품+운임+통관 등)</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{plannedCost.toLocaleString()} 원</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{actualTotalCost.toLocaleString()} 원</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: actualTotalCost > plannedCost ? '#dc2626' : '#166534', fontWeight: 700 }}>
                      {(actualTotalCost - plannedCost) >= 0 ? '+' : ''}{(actualTotalCost - plannedCost).toLocaleString()} 원
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', height: '36px' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>매출 (고객 청구/수금액)</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{plannedRevenue.toLocaleString()} 원</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{actualRevenue.toLocaleString()} 원</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: actualRevenue >= plannedRevenue ? '#166534' : '#dc2626', fontWeight: 700 }}>
                      {(actualRevenue - plannedRevenue) >= 0 ? '+' : ''}{(actualRevenue - plannedRevenue).toLocaleString()} 원
                    </td>
                  </tr>
                  <tr style={{ background: '#f8fafc', height: '40px', borderTop: '2px solid var(--border-default)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 800 }}>마진</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800 }}>{plannedMargin.toLocaleString()} 원 ({(request.marginRate || 0).toFixed(1)}%)</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#1e3a8a' }}>{realizedMargin.toLocaleString()} 원 ({realizedMarginRate.toFixed(1)}%)</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: marginGap >= 0 ? '#166534' : '#dc2626' }}>
                      {marginGap >= 0 ? '+' : ''}{marginGap.toLocaleString()} 원
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ background: marginGap >= 0 ? '#f0fdf4' : '#fef2f2', border: `1px solid ${marginGap >= 0 ? '#bbf7d0' : '#fecaca'}`, borderRadius: '8px', padding: '14px 16px', fontSize: '12.5px', color: marginGap >= 0 ? '#166534' : '#991b1b', marginBottom: '20px' }}>
              {marginGap >= 0
                ? `✅ 계획 대비 마진이 ${marginGap.toLocaleString()}원 초과 달성되었습니다.`
                : `⚠️ 계획 대비 마진이 ${Math.abs(marginGap).toLocaleString()}원 부족합니다. 원인을 검토해주세요.`}
            </div>

            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-default)', paddingBottom: '6px' }}>검토 코멘트 및 완료 처리</span>
              <textarea
                value={request.profitReviewNote || ''}
                onChange={(e) => {
                  const updated = importRequests.map(r => r.id === id ? { ...r, profitReviewNote: e.target.value } : r);
                  saveToStorage(updated);
                }}
                rows={4}
                placeholder="마진 차이 원인, 향후 개선사항 등을 기록하세요."
                style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>검토자</label>
                  <input
                    type="text"
                    value={request.profitReviewedBy || ''}
                    onChange={(e) => {
                      const updated = importRequests.map(r => r.id === id ? { ...r, profitReviewedBy: e.target.value } : r);
                      saveToStorage(updated);
                    }}
                    style={{ padding: '7px 10px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', outline: 'none' }}
                    placeholder="예: 김주한"
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>검토 완료일</label>
                  <input
                    type="text"
                    readOnly
                    value={request.profitReviewedDate || '-'}
                    style={{ padding: '7px 10px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', background: '#f1f5f9' }}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const updated = importRequests.map(r => r.id === id ? { ...r, profitReviewCompleted: true, profitReviewedDate: new Date().toISOString().slice(0, 10), status: '업무 종료' } : r);
                  saveToStorage(updated);
                  alert('손익검토가 완료 처리되었습니다. 모든 업무 단계가 종료되었습니다.');
                }}
                disabled={!!request.profitReviewCompleted}
                style={{ marginTop: '4px', padding: '10px 20px', background: request.profitReviewCompleted ? '#94a3b8' : '#1e3a8a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13.5px', fontWeight: 'bold', cursor: request.profitReviewCompleted ? 'default' : 'pointer', alignSelf: 'flex-start' }}
              >
                {request.profitReviewCompleted ? `✅ 검토 완료됨 (${request.profitReviewedDate})` : '✅ 손익검토 완료 처리'}
              </button>
            </div>
          </div>
          );
        })()}

        {activeTab === '로그' && (
          <div>
            <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#1e3a8a', borderBottom: '2px solid var(--border-default)', paddingBottom: '6px', marginBottom: '20px' }}>
              📜 업무 이력 및 진행 히스토리 로그
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative', paddingLeft: '24px', borderLeft: '3px solid var(--border-color)', marginLeft: '12px' }}>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: '-31.5px', top: '2px', width: '12px', height: '12px', borderRadius: '50%', background: '#10b981', border: '3px solid #fff', boxShadow: '0 0 0 3px #d1fae5' }} />
                <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>{request.createdAt || '2026. 07. 03.'}</div>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>📥 수입 의뢰 등록 완료</div>
                <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>수입 의뢰 번호: #{request.id} 건이 등록되었습니다. (작성 관리자: {request.manager || '김주한'})</div>
              </div>

              {request.piItems && request.piItems.length > 0 && (
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '-31.5px', top: '2px', width: '12px', height: '12px', borderRadius: '50%', background: '#2563eb', border: '3px solid #fff', boxShadow: '0 0 0 3px #dbeafe' }} />
                  <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>{request.createdAt || '2026. 07. 03.'}</div>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>📦 제품 명세 최종 확정</div>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    총 {request.piItems.length}종 제품(총 {totalQty.toLocaleString()} EA)의 명세 정보가 저장되었습니다.
                  </div>
                </div>
              )}

              {request.paymentCollectedDate && (
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '-31.5px', top: '2px', width: '12px', height: '12px', borderRadius: '50%', background: '#0f766e', border: '3px solid #fff', boxShadow: '0 0 0 3px #ccfbf1' }} />
                  <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>{request.paymentCollectedDate}</div>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>💰 대금 수령 확인</div>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {(request.paymentCollectedAmount || 0).toLocaleString()}원 수령 완료. 손익검토 단계로 이동했습니다.
                  </div>
                </div>
              )}

              {request.profitReviewCompleted && (
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '-31.5px', top: '2px', width: '12px', height: '12px', borderRadius: '50%', background: '#1e3a8a', border: '3px solid #fff', boxShadow: '0 0 0 3px #dbeafe' }} />
                  <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>{request.profitReviewedDate}</div>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>📊 손익검토 완료 (최종 종료)</div>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    검토자: {request.profitReviewedBy || '-'}{request.profitReviewNote ? ` · ${request.profitReviewNote}` : ''}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* 모달리스 발주서 PO 미리보기 카드 */}
      {showPoModal && (
        <div style={{
          position: 'fixed',
          right: '24px',
          top: '80px',
          width: '680px',
          height: 'calc(100vh - 120px)',
          background: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0px 10px 30px rgba(0, 0, 0, 0.2)',
          border: '1px solid var(--border-default)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          <div style={{
            background: '#1e3a8a',
            padding: '12px 16px',
            color: '#fff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <strong style={{ fontSize: '14px' }}>📄 PO 발주서 실시간 미리보기 (모달리스 창)</strong>
            <button 
              onClick={() => setShowPoModal(false)}
              style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              &times;
            </button>
          </div>

          <div style={{ padding: '24px', overflowY: 'auto', flex: 1, fontSize: '12.5px', color: '#334155' }}>
            <div id="po-print-area" style={{ padding: '10px', background: '#fff', marginBottom: '20px' }}>
              <img 
                src={currentLetterhead === 'YSACC' ? ysaccLetterImg : ysAccLetterImg} 
                alt="Letterhead Preview" 
                style={{ width: '100%', maxHeight: '90px', objectFit: 'contain', display: 'block', marginBottom: '12px' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', borderBottom: '2px solid #0a1e3f', paddingBottom: '6px' }}>
                <div style={{ textAlign: 'right', fontSize: '12px', minWidth: '160px' }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#b91c1c', marginBottom: '2px' }}>PURCHASE ORDER</div>
                  <div><strong>PO NO:</strong> {request.poNumber || request.id}</div>
                  {request.piNumber && <div><strong>PI NO:</strong> {request.piNumber}</div>}
                  <div><strong>Date:</strong> {formatDateToEnglish(request.createdAt)}</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              <div style={{ background: '#f8fafc', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                <strong style={{ color: '#0a1e3f' }}>BUYER</strong>
                <div style={{ marginTop: '4px', fontSize: '11.5px', lineHeight: '1.5' }}>
                  Company: {letterheadInfo.company}<br/>
                  Address: {letterheadInfo.address}
                </div>
              </div>
              <div style={{ background: '#f8fafc', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                <strong style={{ color: '#0a1e3f' }}>SELLER</strong>
                <div style={{ marginTop: '4px', fontSize: '11.5px', lineHeight: '1.5' }}>
                  Company: {request.importerName || request.shipperName || '-'}<br/>
                  Origin: {request.origin || 'CHINA'}<br/>
                  Incoterms: {request.incoterms || 'FOB'}<br/>
                  Payment Terms: {request.paymentTerms || '100% T/T in advance'}
                </div>
              </div>
            </div>

            <div style={{ background: '#f1f5f9', padding: '12px', borderRadius: '6px', marginBottom: '20px', border: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <strong style={{ color: '#0a1e3f' }}>[ SHIPPING &amp; PACKING INFORMATION ]</strong>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px', marginTop: '6px', fontSize: '11.5px', lineHeight: '1.4' }}>
                  <div>- Shipment By: {request.transportType || 'By Sea'}</div>
                  <div>- Port of Loading (POL): {request.pol || request.portOfLoading || '-'}</div>
                  <div>- Port of Discharge (POD): {request.pod || request.portOfDischarge || '-'}</div>
                </div>
              </div>
              <div style={{ borderLeft: '1px solid var(--border-default)', paddingLeft: '16px', marginLeft: '16px', minWidth: '160px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <strong style={{ color: '#0a1e3f', fontSize: '11px', marginBottom: '4px', display: 'block', alignSelf: 'flex-start' }}>SHIPPING MARK</strong>
                <div style={{ border: '1px solid var(--border-default)', padding: '8px', background: '#fff', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '110px' }}>
                  {commonShippingMark.shape === 'diamond' ? (
                    <div style={{ position: 'relative', width: '70px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '2px 0' }}>
                      <svg viewBox="0 0 100 60" style={{ position: 'absolute', width: '100%', height: '100%' }}>
                        <polygon points="50,2 98,30 50,58 2,30" fill="none" stroke="#334155" strokeWidth="2" />
                      </svg>
                      <span style={{ position: 'relative', fontWeight: 800, fontSize: '10.5px', color: 'var(--text-primary)', zIndex: 2 }}>{commonShippingMark.company}</span>
                    </div>
                  ) : (
                    <strong style={{ fontSize: '11px', color: 'var(--text-primary)' }}>{commonShippingMark.company}</strong>
                  )}
                  <div style={{ fontSize: '8.5px', color: '#334155', marginTop: '3px', fontWeight: 'bold', lineHeight: '1.2' }}>
                    {commonShippingMark.port}, {commonShippingMark.country}<br/>
                    PO NO : {request.poNumber || request.id}<br/>
                    {commonShippingMark.origin}
                  </div>
                </div>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', marginBottom: '20px' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '1px solid var(--border-default)', height: '28px' }}>
                  <th style={{ border: '1px solid var(--border-default)', padding: '4px' }}>No</th>
                  <th style={{ border: '1px solid var(--border-default)', padding: '4px' }}>Description of Commodity</th>
                  <th style={{ border: '1px solid var(--border-default)', padding: '4px' }}>HS Code</th>
                  <th style={{ border: '1px solid var(--border-default)', padding: '4px', textAlign: 'right' }}>Qty</th>
                  <th style={{ border: '1px solid var(--border-default)', padding: '4px', textAlign: 'center' }}>Unit</th>
                  <th style={{ border: '1px solid var(--border-default)', padding: '4px', textAlign: 'right' }}>U.Price</th>
                  <th style={{ border: '1px solid var(--border-default)', padding: '4px', textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {(request.piItems || []).map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)', height: '28px' }}>
                    <td style={{ border: '1px solid var(--border-default)', textAlign: 'center' }}>{idx + 1}</td>
                    <td style={{ border: '1px solid var(--border-default)', padding: '4px', fontWeight: 600 }}>{item.name}</td>
                    <td style={{ border: '1px solid var(--border-default)', textAlign: 'center' }}>{item.hsCode || '-'}</td>
                    <td style={{ border: '1px solid var(--border-default)', textAlign: 'right', padding: '4px' }}>{(Number(item.qty) || 0).toLocaleString()}</td>
                    <td style={{ border: '1px solid var(--border-default)', textAlign: 'center' }}>{item.unit || 'EA'}</td>
                    <td style={{ border: '1px solid var(--border-default)', textAlign: 'right', padding: '4px' }}>${(Number(item.unitPrice) || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                    <td style={{ border: '1px solid var(--border-default)', textAlign: 'right', padding: '4px', fontWeight: 700 }}>${((Number(item.qty) || 0) * (Number(item.unitPrice) || 0)).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                  </tr>
                ))}
                <tr style={{ background: '#f8fafc', fontWeight: 'bold', height: '30px' }}>
                  <td colSpan={3} style={{ border: '1px solid var(--border-default)', textAlign: 'center' }}>TOTAL SUM</td>
                  <td style={{ border: '1px solid var(--border-default)', textAlign: 'right', padding: '4px', color: '#1e3a8a' }}>{totalQty.toLocaleString()}</td>
                  <td style={{ border: '1px solid var(--border-default)' }}></td>
                  <td style={{ border: '1px solid var(--border-default)' }}></td>
                  <td style={{ border: '1px solid var(--border-default)', textAlign: 'right', padding: '4px', color: '#0f766e' }}>
                    ${totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}
                  </td>
                </tr>
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '80px', paddingBottom: '20px' }}>
              <div style={{ borderTop: '1px solid var(--text-muted)', width: '160px', textAlign: 'center', paddingTop: '6px', fontSize: '11px', fontWeight: 'bold' }}>Seller Signature</div>
              <div style={{ borderTop: '1px solid var(--text-muted)', width: '160px', textAlign: 'center', paddingTop: '6px', fontSize: '11px', fontWeight: 'bold', position: 'relative' }}>
                <img 
                  src={ysaccStampImg} 
                  alt="Stamp" 
                  style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: '-55px', width: '135px', height: 'auto', objectFit: 'contain', pointerEvents: 'none' }}
                />
                Buyer Signature
              </div>
            </div>
          </div>

          <div style={{
            background: '#f1f5f9',
            padding: '12px 16px',
            borderTop: '1px solid var(--border-default)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px'
          }}>
            <button 
              onClick={() => setShowPoModal(false)}
              style={{ padding: '6px 12px', background: 'var(--text-muted)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12.5px' }}
            >
              닫기
            </button>
            <button 
              onClick={handleDownloadPdf}
              style={{ padding: '6px 12px', background: 'var(--focus-ring)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 'bold' }}
            >
              PDF 저장
            </button>
            <button 
              onClick={() => {
                const printBtn = document.querySelector('button[title*="PO 즉시 인쇄"]') as HTMLButtonElement;
                if (printBtn) {
                  printBtn.click();
                } else {
                  const triggers = document.getElementsByTagName('button');
                  for (let i = 0; i < triggers.length; i++) {
                    if (triggers[i].textContent?.includes('PO 즉시 인쇄')) {
                      triggers[i].click();
                      break;
                    }
                  }
                }
              }}
              style={{ padding: '6px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 'bold' }}
            >
              인쇄하기
            </button>
          </div>
        </div>
      )}
      <ForwarderSearchModal 
        isOpen={showForwarderModal}
        onClose={() => setShowForwarderModal(false)}
        onSelect={(name) => {
          const updated = importRequests.map(r => r.id === id ? { ...r, forwarderName: name } : r);
          saveToStorage(updated);
          setShowForwarderModal(false);
        }}
        forwarders={forwarders}
        onRefresh={() => {
          // No manual refresh needed since Firestore onSnapshot handles it
        }}
      />
      
      {/* 🔍 바이어(최종고객) 검색 모달 */}
      {showCustomerModal && (
        <CustomerSearchModal
          customers={customers}
          onClose={() => setShowCustomerModal(false)}
          onSelect={(cust) => {
            const updated = importRequests.map(r => r.id === id ? { ...r, finalCustomer: cust.name } : r);
            saveToStorage(updated);
            setShowCustomerModal(false);
          }}
        />
      )}

      {/* 🔍 공급사 검색 모달 */}
      {showSupplierSearchModal && (
        <SupplierSearchModal
          suppliers={allSuppliers}
          onClose={() => setShowSupplierSearchModal(false)}
          onSelect={(sup) => {
            const updated = importRequests.map(r => r.id === id ? { ...r, importerName: sup.name } : r);
            saveToStorage(updated);
            setShowSupplierSearchModal(false);
          }}
        />
      )}

      {/* 📄 견적서 출력 미리보기 모달 */}
      {showEstimatePrintModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            width: '850px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            {/* 헤더 */}
            <div className="no-print" style={{
              padding: '14px 20px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8fafc'
            }}>
              <span style={{ fontWeight: 800, fontSize: '15px', color: '#1e3a8a' }}>📄 YSACC / 영성ACC 공식 견적서 (인쇄 미리보기)</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em' }}>견적 화폐 (CURRENCY):</span>
                  <select
                    value={printCurrency}
                    onChange={(e) => setPrintCurrency(e.target.value as 'KRW' | 'USD')}
                    style={{
                      height: '28px',
                      padding: '0 8px',
                      borderRadius: '4px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      outline: 'none',
                      background: '#fff',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="KRW">원화 (KRW)</option>
                    <option value="USD">달러 (USD)</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => window.print()}
                    style={{ padding: '6px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    🖨️ 인쇄 / PDF 저장
                  </button>
                  <button
                    onClick={() => setShowEstimatePrintModal(false)}
                    style={{ padding: '6px 12px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    닫기
                  </button>
                </div>
              </div>
            </div>

            {/* 인쇄 본문 */}
            {(() => {
              const appliedRate = request.costBreakdown?.appliedExchangeRate || 1450;
              const quoteAmountUsd = Math.round(((request.customerQuoteAmount || 0) / appliedRate) * 100) / 100;
              
              const cb = request.costBreakdown || {};
              const goodsAmountKrw = (cb.buyingPriceUsd || 0) * appliedRate * (cb.buyingQty || 1);
              const freightKrw = (cb.freightUsd || 0) * appliedRate;
              const insuranceKrw = (cb.insuranceUsd || 0) * appliedRate;
              const originInlandKrw = (cb.originInlandUsd || 0) * appliedRate;
              const cifKrw = Math.round(goodsAmountKrw + freightKrw + insuranceKrw + originInlandKrw);
              const customsDuty = Math.round(cifKrw * (((cb.ftaTaxRate || 0) + (cb.antiDumpingRate || 0)) / 100));
              const clearanceFee = cb.clearanceFee || 0;
              const portFee = cb.portFee || 0;
              const domesticTransportFee = cb.domesticTransportFee || 0;
              const handlingFee = cb.handlingFee || 0;
              const otherFee = cb.otherFee || 0;

               const simpleTotalCost = (cb.productCost || 0) + (cb.freightCost || 0) + (cb.customsCost || 0) + (cb.otherCost || 0);
              const totalImportCost = simpleTotalCost > 0 
                ? simpleTotalCost 
                : (cifKrw + customsDuty + clearanceFee + portFee + domesticTransportFee + handlingFee + otherFee) || 1;

              const quoteAmount = request.customerQuoteAmount || 0;
              const marginRatio = quoteAmount / totalImportCost;

              const totalFreightCostKrw = cb.freightCost || (freightKrw + domesticTransportFee) || 0;
              const totalProductCostKrw = cb.productCost || (totalImportCost - totalFreightCostKrw);

              const sellingProductCostKrw = totalProductCostKrw * marginRatio;
              const sellingFreightCostKrw = totalFreightCostKrw * marginRatio;

              const sellingProductCostUsd = Math.round((sellingProductCostKrw / appliedRate) * 100) / 100;
              const sellingFreightCostUsd = Math.round((sellingFreightCostKrw / appliedRate) * 100) / 100;

              const totalBuyingPriceUsd = request.piItems?.reduce((sum, it) => sum + ((Number(it.qty) || 0) * (Number(it.unitPrice) || 0)), 0) || ((cb.buyingPriceUsd || 0) * (cb.buyingQty || 1)) || 1;

              const displayTotalQuote = printCurrency === 'KRW'
                ? `₩ ${quoteAmount.toLocaleString()}`
                : `$ ${quoteAmountUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

              return (
                <div id="estimate-print-area" style={{ padding: '30px 40px', overflowY: 'auto', flex: 1, fontSize: '13px', lineHeight: 1.6 }}>
                  <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                    <img
                      src={(!request.importCompany || request.importCompany === 'YSACC' || request.importCompany === 'YS') ? '/letterhead_ysacc.png' : '/letterhead_ys.png'}
                      alt="Letterhead"
                      style={{ width: '100%', maxHeight: '75px', objectFit: 'contain' }}
                    />
                  </div>

                  <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                    <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, borderBottom: '2px solid #000', paddingBottom: '6px', display: 'inline-block' }}>
                      QUOTATION (견적서)
                    </h1>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <div>
                      <table style={{ borderCollapse: 'collapse', fontSize: '12.5px' }}>
                        <tbody>
                          <tr>
                            <td style={{ fontWeight: 'bold', width: '90px' }}>To (수신) :</td>
                            <td style={{ color: '#1e3a8a', fontWeight: 'bold' }}>{request.finalCustomer || '(고객사 미지정)'} 귀하</td>
                          </tr>
                          <tr>
                            <td style={{ fontWeight: 'bold' }}>Date (일자) :</td>
                            <td>{new Date().toLocaleDateString('ko-KR')}</td>
                          </tr>
                          <tr>
                            <td style={{ fontWeight: 'bold' }}>Ref No. :</td>
                            <td>QT-{id}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <table style={{ borderCollapse: 'collapse', fontSize: '12.5px', marginLeft: 'auto' }}>
                        <tbody>
                          <tr>
                            <td style={{ fontWeight: 'bold', textAlign: 'left', width: '80px' }}>공급처 :</td>
                            <td style={{ textAlign: 'left' }}>{(!request.importCompany || request.importCompany === 'YSACC' || request.importCompany === 'YS') ? 'YSACC' : '영성ACC (YS ACC)'}</td>
                          </tr>
                          <tr>
                            <td style={{ fontWeight: 'bold', textAlign: 'left' }}>대표이사 :</td>
                            <td style={{ textAlign: 'left' }}>김 주 한</td>
                          </tr>
                          <tr>
                            <td style={{ fontWeight: 'bold', textAlign: 'left' }}>담당자 :</td>
                            <td style={{ textAlign: 'left' }}>{request.manager || '김주한'}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '14px', borderRadius: '6px', marginBottom: '24px', textAlign: 'center' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>총 견적 금액 : </span>
                    <strong style={{ fontSize: '18px', color: '#1e3a8a' }}>{displayTotalQuote}</strong> (VAT 별도)
                  </div>

                  <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#1e3a8a', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px', margin: '0 0 10px 0' }}>
                    ■ DESCRIPTION OF PRODUCTS & DETAILS
                  </h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', marginBottom: '24px' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1', height: '26px' }}>
                        <th style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'center', width: '40px' }}>No</th>
                        <th style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'left' }}>Description of Commodity</th>
                        <th style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'center', width: '80px' }}>HS Code</th>
                        <th style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'right', width: '60px' }}>Qty</th>
                        <th style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'center', width: '50px' }}>Unit</th>
                        <th style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'right', width: '90px' }}>UnitPrice</th>
                        <th style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'right', width: '110px' }}>Total Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {request.piItems && request.piItems.length > 0 ? (
                        <>
                          {request.piItems.map((item, idx) => {
                            const uPrice = Number(item.unitPrice) || 0;
                            const qty = Number(item.qty) || 1;

                            // Calculate final selling product unit price and total amount (excluding freight cost)
                            const itemProductTotalSellingKrw = totalBuyingPriceUsd > 0 ? ((uPrice * qty) / totalBuyingPriceUsd) * sellingProductCostKrw : 0;
                            const productSellingPriceKrw = Math.round(itemProductTotalSellingKrw / qty);

                            const itemProductTotalSellingUsd = totalBuyingPriceUsd > 0 ? ((uPrice * qty) / totalBuyingPriceUsd) * sellingProductCostUsd : 0;
                            const productSellingPriceUsd = itemProductTotalSellingUsd / qty;

                            const displayUnitPrice = printCurrency === 'KRW'
                              ? `₩ ${productSellingPriceKrw.toLocaleString()}`
                              : `$ ${productSellingPriceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                            const displayTotalAmount = printCurrency === 'KRW'
                              ? `₩ ${Math.round(itemProductTotalSellingKrw).toLocaleString()}`
                              : `$ ${itemProductTotalSellingUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

                            return (
                              <tr key={idx} style={{ height: '26px' }}>
                                <td style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'center' }}>{idx + 1}</td>
                                <td style={{ padding: '6px', border: '1px solid #cbd5e1' }}>{item.name || request.itemName}</td>
                                <td style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'center' }}>{item.hsCode || '-'}</td>
                                <td style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'right' }}>{qty.toLocaleString() || '1'}</td>
                                <td style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'center' }}>{item.unit || 'EA'}</td>
                                <td style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'right' }}>{displayUnitPrice}</td>
                                <td style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 'bold' }}>{displayTotalAmount}</td>
                              </tr>
                            );
                          })}
                          {/* 운임 분리 표시 로우 */}
                          <tr style={{ height: '26px', background: '#f8fafc' }}>
                            <td style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'center' }}>{request.piItems.length + 1}</td>
                            <td style={{ padding: '6px', border: '1px solid #cbd5e1', fontWeight: 600 }}>국제 및 국내 물류 운임 (International &amp; Domestic Freight)</td>
                            <td style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'center' }}>-</td>
                            <td style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'right' }}>1</td>
                            <td style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'center' }}>LOT</td>
                            <td style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'right' }}>
                              {printCurrency === 'KRW'
                                ? `₩ ${Math.round(sellingFreightCostKrw).toLocaleString()}`
                                : `$ ${sellingFreightCostUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                            </td>
                            <td style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 'bold' }}>
                              {printCurrency === 'KRW'
                                ? `₩ ${Math.round(sellingFreightCostKrw).toLocaleString()}`
                                : `$ ${sellingFreightCostUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                            </td>
                          </tr>
                        </>
                      ) : (
                        <>
                          <tr style={{ height: '26px' }}>
                            <td style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'center' }}>1</td>
                            <td style={{ padding: '6px', border: '1px solid #cbd5e1' }}>{request.itemName}</td>
                            <td style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'center' }}>-</td>
                            <td style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'right' }}>1</td>
                            <td style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'center' }}>EA</td>
                            <td style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'right' }}>
                              {printCurrency === 'KRW'
                                ? `₩ ${Math.round(sellingProductCostKrw).toLocaleString()}`
                                : `$ ${sellingProductCostUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                            </td>
                            <td style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 'bold' }}>
                              {printCurrency === 'KRW'
                                ? `₩ ${Math.round(sellingProductCostKrw).toLocaleString()}`
                                : `$ ${sellingProductCostUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                            </td>
                          </tr>
                          <tr style={{ height: '26px', background: '#f8fafc' }}>
                            <td style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'center' }}>2</td>
                            <td style={{ padding: '6px', border: '1px solid #cbd5e1', fontWeight: 600 }}>국제 및 국내 물류 운임 (International &amp; Domestic Freight)</td>
                            <td style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'center' }}>-</td>
                            <td style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'right' }}>1</td>
                            <td style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'center' }}>LOT</td>
                            <td style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'right' }}>
                              {printCurrency === 'KRW'
                                ? `₩ ${Math.round(sellingFreightCostKrw).toLocaleString()}`
                                : `$ ${sellingFreightCostUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                            </td>
                            <td style={{ padding: '6px', border: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 'bold' }}>
                              {printCurrency === 'KRW'
                                ? `₩ ${Math.round(sellingFreightCostKrw).toLocaleString()}`
                                : `$ ${sellingFreightCostUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                            </td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>

              <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#1e3a8a', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px', margin: '0 0 10px 0' }}>
                ■ TERMS & CONDITIONS (거래조건)
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '3px 0', fontWeight: 'bold', width: '150px' }}>· DELIVERY TERMS :</td>
                    <td>공장도착도 (Delivered to Factory)</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '3px 0', fontWeight: 'bold' }}>· PAYMENT TERMS :</td>
                    <td>{request.paymentTerms || '100% T/T in advance'}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '3px 0', fontWeight: 'bold' }}>· PORT OF LOADING :</td>
                    <td>{request.pol || 'SHANGHAI PORT, CHINA'}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '3px 0', fontWeight: 'bold' }}>· PORT OF DISCHARGE :</td>
                    <td>{request.pod || 'INCHEON PORT, KOREA'}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '3px 0', fontWeight: 'bold' }}>· REMARKS (특기사항) :</td>
                    <td style={{ whiteSpace: 'pre-wrap' }}>{request.requestNote || '별도 특기사항 없음'}</td>
                  </tr>
                </tbody>
              </table>

              <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'flex-end', position: 'relative' }}>
                <div style={{ textAlign: 'center', width: '200px' }}>
                  <p style={{ margin: '0 0 40px 0', fontSize: '11.5px' }}>공급처 대표자 서명 (인) :</p>
                  <strong style={{ fontSize: '13.5px' }}>대표이사 김 주 한</strong>
                  <img
                    src={ysaccStampImg}
                    alt="Company Stamp"
                    style={{
                      position: 'absolute',
                      right: '25px',
                      bottom: '-10px',
                      width: '60px',
                      height: '60px',
                      opacity: 0.9,
                      pointerEvents: 'none'
                    }}
                  />
                </div>
              </div>
            </div>
            ); })()}
          </div>
        </div>
      )}

      {showDealStatementModal && (
        <div style={{
          position: 'fixed',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(15, 23, 42, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 10000
        }}>
          <div style={{
            background: '#ffffff',
            width: '1000px',
            height: '85vh',
            borderRadius: '8px',
            boxShadow: '0 20px 40px rgba(15,23,42,0.2)',
            border: '1px solid #cbd5e1',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            {/* Header */}
            <div style={{ padding: '12px 16px', background: '#fafafa', borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '15px', fontWeight: 800, color: '#1e293b' }}>
                🖨️ 거래명세표 발행 및 수정 인쇄
              </span>
              <button 
                onClick={() => setShowDealStatementModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
              {/* Left Column: Edit Form */}
              <div style={{ width: '450px', padding: '16px', borderRight: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}>
                <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#1e293b', borderBottom: '1.5px solid #e2e8f0', paddingBottom: '4px' }}>
                  공급받는 자 (고객사) 정보 입력
                </span>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>등록번호</label>
                    <input 
                      type="text"
                      placeholder="예: 123-45-67890"
                      value={dealStatementData.receiverBizNo}
                      onChange={(e) => setDealStatementData({ ...dealStatementData, receiverBizNo: e.target.value })}
                      style={{ height: '32px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>상호 (법인명)</label>
                    <input 
                      type="text"
                      value={dealStatementData.receiverName}
                      onChange={(e) => setDealStatementData({ ...dealStatementData, receiverName: e.target.value })}
                      style={{ height: '32px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>성명 (대표자)</label>
                    <input 
                      type="text"
                      value={dealStatementData.receiverCEO}
                      onChange={(e) => setDealStatementData({ ...dealStatementData, receiverCEO: e.target.value })}
                      style={{ height: '32px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>발행일자</label>
                    <input 
                      type="date"
                      value={dealStatementData.date}
                      onChange={(e) => setDealStatementData({ ...dealStatementData, date: e.target.value })}
                      style={{ height: '32px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}
                    />
                  </div>
                  <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>사업장 주소</label>
                    <input 
                      type="text"
                      value={dealStatementData.receiverAddr}
                      onChange={(e) => setDealStatementData({ ...dealStatementData, receiverAddr: e.target.value })}
                      style={{ height: '32px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>업태</label>
                    <input 
                      type="text"
                      value={dealStatementData.receiverType}
                      onChange={(e) => setDealStatementData({ ...dealStatementData, receiverType: e.target.value })}
                      style={{ height: '32px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>종목</label>
                    <input 
                      type="text"
                      value={dealStatementData.receiverItem}
                      onChange={(e) => setDealStatementData({ ...dealStatementData, receiverItem: e.target.value })}
                      style={{ height: '32px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1.5px solid #e2e8f0', paddingBottom: '4px', marginTop: '10px' }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#1e293b' }}>
                    품목 목록 수량/단가 편집
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const nextItems = [
                        ...dealStatementData.items,
                        { month: '', day: '', name: '', spec: '', qty: 1, price: 0, remarks: '' }
                      ];
                      setDealStatementData({ ...dealStatementData, items: nextItems });
                    }}
                    style={{ padding: '2px 8px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    ＋ 품목 추가
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {dealStatementData.items.map((item, idx) => (
                    <div key={idx} style={{ background: '#f8fafc', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#1e3a8a' }}>품목 #{idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const nextItems = dealStatementData.items.filter((_, i) => i !== idx);
                            setDealStatementData({ ...dealStatementData, items: nextItems });
                          }}
                          style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          삭제
                        </button>
                      </div>
                      <input 
                        type="text"
                        placeholder="품명"
                        value={item.name}
                        onChange={(e) => {
                          const nextItems = dealStatementData.items.map((it, i) => i === idx ? { ...it, name: e.target.value } : it);
                          setDealStatementData({ ...dealStatementData, items: nextItems });
                        }}
                        style={{ height: '28px', padding: '0 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                      />
                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.5fr', gap: '6px' }}>
                        <input 
                          type="text"
                          placeholder="규격"
                          value={item.spec}
                          onChange={(e) => {
                            const nextItems = dealStatementData.items.map((it, i) => i === idx ? { ...it, spec: e.target.value } : it);
                            setDealStatementData({ ...dealStatementData, items: nextItems });
                          }}
                          style={{ height: '28px', padding: '0 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }}
                        />
                        <input 
                          type="number"
                          placeholder="수량"
                          value={item.qty || ''}
                          onChange={(e) => {
                            const nextItems = dealStatementData.items.map((it, i) => i === idx ? { ...it, qty: Number(e.target.value) || 0 } : it);
                            setDealStatementData({ ...dealStatementData, items: nextItems });
                          }}
                          style={{ height: '28px', padding: '0 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', textAlign: 'right' }}
                        />
                        <input 
                          type="number"
                          placeholder="단가 (₩)"
                          value={item.price || ''}
                          onChange={(e) => {
                            const nextItems = dealStatementData.items.map((it, i) => i === idx ? { ...it, price: Number(e.target.value) || 0 } : it);
                            setDealStatementData({ ...dealStatementData, items: nextItems });
                          }}
                          style={{ height: '28px', padding: '0 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', textAlign: 'right' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '10px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569' }}>미수금 (₩)</label>
                  <input 
                    type="number"
                    value={dealStatementData.receivableAmount || ''}
                    onChange={(e) => setDealStatementData({ ...dealStatementData, receivableAmount: Number(e.target.value) || 0 })}
                    style={{ height: '32px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}
                  />
                </div>
              </div>

              {/* Right Column: Visual Excel Preview */}
              <div style={{ flex: 1, padding: '16px', background: '#f1f5f9', display: 'flex', flexDirection: 'column', overflowY: 'auto', alignItems: 'center' }}>
                <div style={{
                  width: '520px',
                  background: '#ffffff',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                  padding: '24px',
                  boxSizing: 'border-box',
                  border: '2px solid #059669',
                  fontFamily: 'serif',
                  color: '#000'
                }}>
                  {/* Excel View content layout */}
                  <h2 style={{ textAlign: 'center', letterSpacing: '10px', fontSize: '22px', borderBottom: '2px double #059669', paddingBottom: '4px', margin: '0 0 16px 0', color: '#065f46' }}>거 래 명 세 표</h2>
                  
                  {/* 공급자 / 공급받는자 */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px', marginBottom: '10px' }}>
                    <tbody>
                      <tr>
                        {/* 공급자 */}
                        <td style={{ width: '50%', border: '1px solid #059669', padding: '4px', verticalAlign: 'top' }}>
                          <div style={{ fontWeight: 'bold', color: '#065f46', marginBottom: '4px' }}>공급자</div>
                          <div><strong>등록번호:</strong> 730-17-00185</div>
                          <div style={{ position: 'relative' }}>
                            <strong>상호:</strong> 영성ACC 
                            <img src={ysaccStampImg} style={{ position: 'absolute', right: '10px', top: '-10px', width: '40px', opacity: 0.8 }} />
                          </div>
                          <div><strong>성명:</strong> 김주한</div>
                          <div><strong>주소:</strong> 청주시 흥덕구 월명로 73</div>
                          <div><strong>업태/종목:</strong> 도소매 / 기자재</div>
                        </td>
                        {/* 공급받는자 */}
                        <td style={{ width: '50%', border: '1px solid #059669', padding: '4px', verticalAlign: 'top' }}>
                          <div style={{ fontWeight: 'bold', color: '#065f46', marginBottom: '4px' }}>공급받는 자</div>
                          <div><strong>등록번호:</strong> {dealStatementData.receiverBizNo || '-'}</div>
                          <div><strong>상호:</strong> {dealStatementData.receiverName || '-'}</div>
                          <div><strong>성명:</strong> {dealStatementData.receiverCEO || '-'}</div>
                          <div><strong>주소:</strong> {dealStatementData.receiverAddr || '-'}</div>
                          <div><strong>업태/종목:</strong> {dealStatementData.receiverType || '-'}/{dealStatementData.receiverItem || '-'}</div>
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Items list */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', textAlign: 'center' }}>
                    <thead>
                      <tr style={{ background: '#ecfdf5', color: '#065f46', fontWeight: 'bold', height: '24px' }}>
                        <th style={{ border: '1px solid #059669', width: '25px' }}>월</th>
                        <th style={{ border: '1px solid #059669', width: '25px' }}>일</th>
                        <th style={{ border: '1px solid #059669' }}>품목</th>
                        <th style={{ border: '1px solid #059669', width: '50px' }}>규격</th>
                        <th style={{ border: '1px solid #059669', width: '35px' }}>수량</th>
                        <th style={{ border: '1px solid #059669', width: '65px' }}>단가</th>
                        <th style={{ border: '1px solid #059669', width: '75px' }}>공급가액</th>
                        <th style={{ border: '1px solid #059669', width: '55px' }}>세액</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 10 }).map((_, rIdx) => {
                        const item = dealStatementData.items[rIdx];
                        const supplyVal = item ? (item.qty * item.price) : 0;
                        const vatVal = item ? Math.round(supplyVal * 0.1) : 0;
                        return (
                          <tr key={rIdx} style={{ height: '22px' }}>
                            <td style={{ border: '1px solid #059669' }}>{item?.month || ''}</td>
                            <td style={{ border: '1px solid #059669' }}>{item?.day || ''}</td>
                            <td style={{ border: '1px solid #059669', textAlign: 'left', paddingLeft: '4px' }}>{item?.name || ''}</td>
                            <td style={{ border: '1px solid #059669' }}>{item?.spec || ''}</td>
                            <td style={{ border: '1px solid #059669', textAlign: 'right', paddingRight: '4px' }}>{item ? item.qty.toLocaleString() : ''}</td>
                            <td style={{ border: '1px solid #059669', textAlign: 'right', paddingRight: '4px' }}>{item ? item.price.toLocaleString() : ''}</td>
                            <td style={{ border: '1px solid #059669', textAlign: 'right', paddingRight: '4px' }}>{item ? supplyVal.toLocaleString() : ''}</td>
                            <td style={{ border: '1px solid #059669', textAlign: 'right', paddingRight: '4px' }}>{item ? vatVal.toLocaleString() : ''}</td>
                          </tr>
                        );
                      })}
                      {/* Summary calculations */}
                      <tr style={{ background: '#ecfdf5', height: '24px', fontWeight: 'bold' }}>
                        <td colSpan={4} style={{ border: '1px solid #059669' }}>합계</td>
                        <td style={{ border: '1px solid #059669', textAlign: 'right', paddingRight: '4px' }}>
                          {dealStatementData.items.reduce((s, i) => s + i.qty, 0).toLocaleString()}
                        </td>
                        <td style={{ border: '1px solid #059669' }}></td>
                        <td style={{ border: '1px solid #059669', textAlign: 'right', paddingRight: '4px' }}>
                          {dealStatementData.items.reduce((s, i) => s + (i.qty * i.price), 0).toLocaleString()}
                        </td>
                        <td style={{ border: '1px solid #059669', textAlign: 'right', paddingRight: '4px' }}>
                          {dealStatementData.items.reduce((s, i) => s + Math.round((i.qty * i.price) * 0.1), 0).toLocaleString()}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div style={{ padding: '12px 16px', background: '#fafafa', borderTop: '1px solid #cbd5e1', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button 
                onClick={() => setShowDealStatementModal(false)}
                style={{ padding: '8px 16px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                닫기
              </button>
              <button 
                onClick={() => {
                  const printWin = window.open('', '_blank');
                  if (!printWin) return alert('팝업 차단기를 해제해주세요.');
                  
                  const itemsHtml = Array.from({ length: 10 }).map((_, rIdx) => {
                    const item = dealStatementData.items[rIdx];
                    const supplyVal = item ? (item.qty * item.price) : 0;
                    const vatVal = item ? Math.round(supplyVal * 0.1) : 0;
                    return `
                      <tr style="height: 24px;">
                        <td style="border: 1px solid #059669; text-align: center;">${item?.month || ''}</td>
                        <td style="border: 1px solid #059669; text-align: center;">${item?.day || ''}</td>
                        <td style="border: 1px solid #059669; text-align: left; padding-left: 6px;">${item?.name || ''}</td>
                        <td style="border: 1px solid #059669; text-align: center;">${item?.spec || ''}</td>
                        <td style="border: 1px solid #059669; text-align: right; padding-right: 6px;">${item ? item.qty.toLocaleString() : ''}</td>
                        <td style="border: 1px solid #059669; text-align: right; padding-right: 6px;">${item ? item.price.toLocaleString() : ''}</td>
                        <td style="border: 1px solid #059669; text-align: right; padding-right: 6px;">${item ? supplyVal.toLocaleString() : ''}</td>
                        <td style="border: 1px solid #059669; text-align: right; padding-right: 6px;">${item ? vatVal.toLocaleString() : ''}</td>
                        <td style="border: 1px solid #059669; text-align: left; padding-left: 6px;">${item?.remarks || ''}</td>
                      </tr>
                    `;
                  }).join('');

                  const sumQty = dealStatementData.items.reduce((s, i) => s + i.qty, 0);
                  const sumSupply = dealStatementData.items.reduce((s, i) => s + (i.qty * i.price), 0);
                  const sumVat = dealStatementData.items.reduce((s, i) => s + Math.round((i.qty * i.price) * 0.1), 0);

                  printWin.document.write(`
                    <html>
                    <head>
                      <title>거래명세표</title>
                      <style>
                        body { font-family: 'Malgun Gothic', 'Dotum', sans-serif; padding: 20px; color: #000; }
                        table { width: 100%; border-collapse: collapse; }
                        td, th { border: 1px solid #059669; padding: 6px; font-size: 12px; }
                        .title { text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 12px; border-bottom: 2px double #059669; padding-bottom: 6px; margin-bottom: 20px; color: #065f46; }
                      </style>
                    </head>
                    <body onload="window.print(); window.close();">
                      <div class="title">거 래 명 세 표</div>
                      <table style="margin-bottom: 12px;">
                        <tr>
                          <td style="width: 50%; vertical-align: top;">
                            <div style="font-weight: bold; font-size: 13px; color: #065f46; margin-bottom: 6px;">공 급 자</div>
                            <div><strong>등록번호:</strong> 730-17-00185</div>
                            <div style="position: relative;">
                              <strong>상호(법인명):</strong> 영성에이씨씨(영성ACC)
                              <img src="${ysaccStampImg}" style="position: absolute; right: 20px; top: -10px; width: 60px;" />
                            </div>
                            <div><strong>성명:</strong> 김주한</div>
                            <div><strong>사업장 주소:</strong> 충청북도 청주시 흥덕구 월명로 73, 111-201</div>
                            <div><strong>업태/종목:</strong> 도소매업 외 / 물탱크 및 기자재</div>
                          </td>
                          <td style="width: 50%; vertical-align: top;">
                            <div style="font-weight: bold; font-size: 13px; color: #065f46; margin-bottom: 6px;">공급받는 자</div>
                            <div><strong>등록번호:</strong> ${dealStatementData.receiverBizNo}</div>
                            <div><strong>상호(법인명):</strong> ${dealStatementData.receiverName}</div>
                            <div><strong>성명:</strong> ${dealStatementData.receiverCEO}</div>
                            <div><strong>사업장 주소:</strong> ${dealStatementData.receiverAddr}</div>
                            <div><strong>업태/종목:</strong> ${dealStatementData.receiverType} / ${dealStatementData.receiverItem}</div>
                          </td>
                        </tr>
                      </table>

                      <div style="font-size: 12px; font-weight: bold; margin-bottom: 8px;">일자: ${dealStatementData.date}</div>

                      <table style="margin-bottom: 12px;">
                        <thead>
                          <tr style="background: #ecfdf5; color: #065f46; font-weight: bold;">
                            <th style="width: 30px;">월</th>
                            <th style="width: 30px;">일</th>
                            <th>품목</th>
                            <th style="width: 60px;">규격</th>
                            <th style="width: 40px;">수량</th>
                            <th style="width: 80px;">단가</th>
                            <th style="width: 100px;">공급가액</th>
                            <th style="width: 80px;">세액</th>
                            <th>비고</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${itemsHtml}
                          <tr style="background: #ecfdf5; font-weight: bold; height: 26px;">
                            <td colspan="4" style="text-align: center;">합계</td>
                            <td style="text-align: right; padding-right: 6px;">${sumQty.toLocaleString()}</td>
                            <td></td>
                            <td style="text-align: right; padding-right: 6px;">${sumSupply.toLocaleString()}</td>
                            <td style="text-align: right; padding-right: 6px;">${sumVat.toLocaleString()}</td>
                            <td></td>
                          </tr>
                        </tbody>
                      </table>

                      <table style="margin-top: 16px;">
                        <tr style="height: 36px; font-weight: bold;">
                          <td style="width: 20%; background: #ecfdf5; text-align: center;">공급가액합계</td>
                          <td style="text-align: right; padding-right: 8px;">₩${sumSupply.toLocaleString()}</td>
                          <td style="width: 20%; background: #ecfdf5; text-align: center;">세액합계</td>
                          <td style="text-align: right; padding-right: 8px;">₩${sumVat.toLocaleString()}</td>
                          <td style="width: 20%; background: #ecfdf5; text-align: center;">총합계금액</td>
                          <td style="text-align: right; padding-right: 8px; font-size: 14px; color: #1e3a8a;">₩${(sumSupply + sumVat).toLocaleString()}</td>
                        </tr>
                        <tr style="height: 36px; font-weight: bold;">
                          <td style="background: #ecfdf5; text-align: center;">미수금</td>
                          <td style="text-align: right; padding-right: 8px; color: #ef4444;">₩${dealStatementData.receivableAmount.toLocaleString()}</td>
                          <td style="background: #ecfdf5; text-align: center;">인수자</td>
                          <td colspan="3" style="padding-left: 8px;">${dealStatementData.receiverSign || dealStatementData.receiverCEO || dealStatementData.receiverName || ''} (인/서명)</td>
                        </tr>
                      </table>
                    </body>
                    </html>
                  `);
                  printWin.document.close();
                }}
                style={{ padding: '8px 16px', background: '#059669', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                🖨️ 발행 인쇄
              </button>
            </div>
          </div>
        </div>
      )}

      {showProductSearch && productSearchTargetIdx !== null && (
        <ProductSearchModal
          products={products}
          onClose={() => {
            setShowProductSearch(false);
            setProductSearchTargetIdx(null);
          }}
          onSelect={(prod) => {
            const next = [...(request.piItems || [])];
            const idx = productSearchTargetIdx;
            if (idx !== null && next[idx]) {
              next[idx] = {
                ...next[idx],
                name: prod.nameEn || prod.nameKo || '',
                hsCode: prod.hsCode || '',
                unitPrice: String(prod.purchasePrice || ''),
                unit: prod.unit || 'EA',
                weight: String(prod.weight || '')
              };
              saveToStorage(importRequests.map(r => r.id === id ? { ...r, piItems: next } : r));
            }
            setShowProductSearch(false);
            setProductSearchTargetIdx(null);
          }}
        />
      )}
    </div>
  );
};

// SVG Diamond shipping mark HTML string creator
const getShippingMarkShapeImgHtml = (shapeSymbol: string, comp: string) => {
  if (shapeSymbol === 'diamond') {
    return `
      <div style="position: relative; width: 100px; height: 60px; margin: 0 auto; display: flex; align-items: center; justify-content: center;">
        <svg viewBox="0 0 100 60" style="position: absolute; left: 0; top: 0; width: 100%; height: 100%;">
          <polygon points="50,2 98,30 50,58 2,30" fill="none" stroke="#000" stroke-width="2" />
        </svg>
        <span style="position: relative; font-weight: bold; font-size: 13px; font-family: sans-serif; z-index: 2;">${comp}</span>
      </div>
    `;
  }
  return `<div style="text-align: center; font-weight: bold; font-size: 14px;">${comp}</div>`;
};

export default ImportDetail;

// 포워더 검색 및 신규 등록 모달 Sub창 컴포넌트
interface ForwarderSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (name: string) => void;
  forwarders: any[];
  onRefresh: () => void;
}

import { addDoc } from 'firebase/firestore';

const ForwarderSearchModal: React.FC<ForwarderSearchModalProps> = ({ isOpen, onClose, onSelect, forwarders, onRefresh }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newForwarder, setNewForwarder] = useState({ name: '', manager: '', phone: '', email: '', note: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const filtered = forwarders.filter(f => f.name?.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleAddNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newForwarder.name.trim()) {
      alert('업체명을 입력해주세요.');
      return;
    }
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'companies', 'YSACC', 'suppliers'), {
        ...newForwarder,
        category: '포워딩사',
        createdAt: new Date().toISOString()
      });
      alert('신규 포워더가 성공적으로 등록되었습니다.');
      setNewForwarder({ name: '', manager: '', phone: '', email: '', note: '' });
      setShowAddForm(false);
      onRefresh();
    } catch (err) {
      console.error(err);
      alert('등록 중 에러가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
      <div style={{ background: '#fff', width: '100%', maxWidth: '500px', borderRadius: '10px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f766e' }}>🚢 지정 포워더(운송사) 검색</h4>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: 'var(--text-secondary)' }}>✕</button>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', gap: '8px' }}>
          <input 
            type="text" 
            placeholder="포워더 이름으로 검색..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
          />
          <button 
            onClick={() => setShowAddForm(p => !p)}
            style={{ padding: '8px 12px', background: showAddForm ? 'var(--text-secondary)' : '#0f766e', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            {showAddForm ? '목록 보기' : '➕ 신규 포워더 추가'}
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
          {showAddForm ? (
            <form onSubmit={handleAddNew} style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f766e', marginBottom: '4px' }}>📝 신규 포워더 등록 정보</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>포워더 업체명 (*)</label>
                <input required type="text" value={newForwarder.name} onChange={e => setNewForwarder(p => ({ ...p, name: e.target.value }))} style={{ padding: '6px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12.5px', outline: 'none' }} placeholder="예: (주)영성물류" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>담당자명</label>
                <input type="text" value={newForwarder.manager} onChange={e => setNewForwarder(p => ({ ...p, manager: e.target.value }))} style={{ padding: '6px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12.5px', outline: 'none' }} placeholder="예: 홍길동 과장" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>연락처</label>
                <input type="text" value={newForwarder.phone} onChange={e => setNewForwarder(p => ({ ...p, phone: e.target.value }))} style={{ padding: '6px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12.5px', outline: 'none' }} placeholder="예: 010-1234-5678" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>이메일</label>
                <input type="email" value={newForwarder.email} onChange={e => setNewForwarder(p => ({ ...p, email: e.target.value }))} style={{ padding: '6px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12.5px', outline: 'none' }} placeholder="예: cargo@logistics.com" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>비고 / 메모</label>
                <input type="text" value={newForwarder.note} onChange={e => setNewForwarder(p => ({ ...p, note: e.target.value }))} style={{ padding: '6px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12.5px', outline: 'none' }} placeholder="기타 특이사항 입력" />
              </div>
              <button disabled={isSubmitting} type="submit" style={{ padding: '8px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', marginTop: '6px' }}>
                {isSubmitting ? '등록 중...' : '저장 및 즉시 등록'}
              </button>
            </form>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filtered.length > 0 ? (
                filtered.map(f => (
                  <div 
                    key={f.id}
                    onClick={() => onSelect(f.name)}
                    style={{ padding: '12px 14px', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', transition: 'background 0.2s', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f0fdf4'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                  >
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '13.5px', color: 'var(--text-primary)' }}>{f.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {f.manager ? `담당자: ${f.manager}` : '담당자 없음'} {f.phone ? ` | ${f.phone}` : ''}
                      </div>
                    </div>
                    <span style={{ fontSize: '11.5px', color: '#0f766e', fontWeight: 'bold' }}>선택</span>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)', fontSize: '12.5px' }}>
                  검색 조건에 맞는 포워더가 존재하지 않습니다.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
