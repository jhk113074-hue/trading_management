import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, getDocs, onSnapshot, setDoc, serverTimestamp, deleteDoc, collection, updateDoc, addDoc, query, where } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, COMPANY_ID, storage, auth } from '../firebase';
import type { Order, OrderItem, ForwarderEntry } from '../types/order';
import type { Supplier } from '../types/supplier';
import type { Product } from '../types/product';
import { ProductModal } from '../components/ProductModal';
import { ProductSearchModal } from '../components/ProductSearchModal';
import { ArrivalReportModal } from '../components/ArrivalReportModal';
import { ForwarderSearchModal } from '../components/ForwarderSearchModal';
import { previewFile } from '../components/FilePreviewModal';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { exportCiPlToExcel } from '../utils/ciPlExcelGenerator';
import { CiPlPreviewModal } from '../components/CiPlPreviewModal';
import { DateInput } from '../components/ui/DateInput';
import { CustomerSearchModal } from '../components/CustomerSearchModal';
import { KatalkMessageModal } from '../components/KatalkMessageModal';
import { PoEmailSendModal } from '../components/PoEmailSendModal';
import { subscribeCustomCurrencies, handleCurrencySelection, DEFAULT_CURRENCIES } from '../utils/currency';
import { getOverallProgress, getStageProgress, type StageKey } from '../utils/orderProgress';
import type { Customer } from '../types/customer';
import { useAuth } from '../contexts/AuthContext';
import { isMonitoringUser } from '../utils/userUtils';

const STEP_LABEL_TO_STAGE_KEY: Record<string, StageKey | undefined> = {
  '수주정보': '수주정보',
  '소싱/발주': '소싱발주',
  '물류/선적': '물류선적',
  '서류관리': '서류관리',
  '정산/결제': '정산결제',
};


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
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

const FormattedNumberInput: React.FC<FormattedNumberInputProps> = ({ value, onChange, placeholder, style, disabled, onBlur, onKeyDown }) => {
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
    if (onBlur) {
      onBlur();
    }
  };

  return (
    <input
      type="text"
      value={tempValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      style={style}
      disabled={disabled}
    />
  );
};

const toCommaString = (val: string | number | undefined): string => {
  if (val === undefined || val === null || val === '') return '';
  const clean = String(val).replace(/[^0-9]/g, '');
  if (!clean) return '';
  return Number(clean).toLocaleString();
};

const fromCommaString = (val: string): number => {
  return Number(val.replace(/[^0-9]/g, '')) || 0;
};

const steps = ["수주정보", "소싱/발주", "물류/선적", "서류관리", "정산/결제", "변경이력"] as const;

const STEP_DEFAULT_SUBTAB: Record<string, Record<string, string>> = {
  "소싱/발주": { sourcingTab: "소싱발주" },
  "물류/선적": { logisticsTab: "선적관리" },
  "서류관리": { documentTab: "서류업로드" },
  "정산/결제": { settlementTab: "정산현황" },
};

const normalizeStep = (raw: string | null): typeof steps[number] => {
  if (!raw) return "수주정보";
  const clean = raw.trim();
  if (clean === 'PO접수' || clean === '수주정보') return '수주정보';
  if (clean === '소싱발주' || clean === '소싱/발주') return '소싱/발주';
  if (clean === '물류/선적') return '물류/선적';
  if (clean === '수출관리' || clean === '서류관리') return '서류관리';
  if (clean === '정산마감' || clean === '정산/결제') return '정산/결제';
  if (clean === '변경이력(Log)' || clean === '변경이력') return '변경이력';
  return "수주정보";
};

export const OrderDetail: React.FC = () => {
  const { userProfile } = useAuth();

  const isAdmin = useMemo(() => {
    const email = auth.currentUser?.email || '';
    const role = userProfile?.role || '';
    const name = userProfile?.name || auth.currentUser?.displayName || '';

    if (
      email === 'jhkim1130@ysacc.co.kr' ||
      ['관리자', '대표이사', 'ADMIN', 'CEO'].includes(role) ||
      name.includes('대표이사') ||
      name.includes('관리자')
    ) {
      return true;
    }
    return false;
  }, [userProfile]);
  const [customCurrencies, setCustomCurrencies] = useState<string[]>([]);
  useEffect(() => {
    return subscribeCustomCurrencies(setCustomCurrencies);
  }, []);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  // Unified query updater using functional setSearchParams (prevents stale closure)
  const updateQuery = (patch: Record<string, string | undefined>, options?: { replace?: boolean }) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(patch).forEach(([key, value]) => {
        if (value === undefined) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      });
      return next;
    }, options);
  };

  // URL Query Parameter derived tab states
  const activeStep = normalizeStep(searchParams.get("step"));
  const activeSourcingTab = (searchParams.get("sourcingTab") || "소싱발주") as '소싱발주' | '선적관리' | '패킹리스트' | '도착보고_쉬핑마크' | 'COA_성적서' | '세금계산서_결제' | '대금결제관리';
  const activeLogisticsTab = (searchParams.get("logisticsTab") || "선적관리") as '선적관리' | '패킹리스트' | '도착보고_쉬핑마크';
  const activeDocumentTab = (searchParams.get("documentTab") || "서류업로드") as '서류업로드' | 'CI_PL작성';
  const activeSettlementTab = (searchParams.get("settlementTab") || "정산현황") as '세금계산서' | '대금결제' | 'BANK_CHARGES' | '수금관리' | '정산현황';

  const initialStepSetRef = useRef(false);
  useEffect(() => {
    const rawStep = searchParams.get("step");
    if (rawStep && !steps.includes(rawStep.trim() as any)) {
      updateQuery({ step: "수주정보" }, { replace: true });
    } else if (!rawStep && order?.status && !initialStepSetRef.current) {
      initialStepSetRef.current = true;
      const mappedStatus = 
        order.status === '주문' ? '수주정보' :
        order.status === '발주' ? '소싱/발주' :
        order.status === '선적관리' ? '물류/선적' :
        order.status === '이익관리' ? '정산/결제' : '수주정보';
      const defaultSubTabs = STEP_DEFAULT_SUBTAB[mappedStatus] || {};
      updateQuery({ step: mappedStatus, ...defaultSubTabs }, { replace: true });
    }
  }, [searchParams, order?.status]);
  const [isCiPlPreviewOpen, setIsCiPlPreviewOpen] = useState(false);
  const [showPoDetails, setShowPoDetails] = useState(false);
  const exportExcelRef = useRef<(() => void) | null>(null);
  const isEditing = true;
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isCustomerSearchOpen, setIsCustomerSearchOpen] = useState(false);
  const [katalkModalMsg, setKatalkModalMsg] = useState<string | null>(null);
  const [katalkModalSupplier, setKatalkModalSupplier] = useState<string>('');
  const [sentEmailSuppliers, setSentEmailSuppliers] = useState<Record<string, boolean>>({});
  const [copiedKatalkSuppliers, setCopiedKatalkSuppliers] = useState<Record<string, boolean>>({});
  const [poEmailModalData, setPoEmailModalData] = useState<{
    supplierName: string;
    items: OrderItem[];
    defaultToEmail: string;
    defaultCcEmails: string;
    defaultSubject: string;
    defaultContent: string;
    pdfUrl: string;
  } | null>(null);

  // ── 단계별 독립 체크리스트 상태 ──────────────────────────────────────────
  type StageKey = '수주정보' | '소싱발주' | '물류선적' | '서류관리' | '정산결제';
  const defaultStageCompletion: Record<StageKey, Record<string, boolean>> = {
    수주정보: {
      '확정 CI 번호 입력': false,
      '인코텀즈/결제조건 입력': false,
      'L/C 거래 상세 정보 입력': false,
    },
    소싱발주: {
      '발주서 발행 및 저장': false,
    },
    물류선적: {
      '포워딩/운송사 및 수출 Volume 선택': false,
      'ETD 입력': false,
      '도착보고 발송 완료': false,
    },
    서류관리: {
      '수출신고번호 입력': false,
      'CI, PL, COO, BL 서류 업로드 완료': false,
    },
    정산결제: {
      '세금계산서 발행 완료': false,
      '입금 진행 완료': false,
      '공급업체 대금 결제 완료': false,
      '수금 관리 완료': false,
    },
  };
  const [stageCompletion, setStageCompletion] = useState<Record<StageKey, Record<string, boolean>>>(defaultStageCompletion);

  // 수동으로 해제한 항목 기록 — 자동감지가 덮어쓰지 않도록 보호
  const [manualOverride, setManualOverride] = useState<Record<string, boolean>>({});

  // 체크박스 토글 → Firebase 즉시 저장 + manualOverride 기록
  const handleChecklistToggle = async (stage: StageKey, item: string) => {
    if (!order) return;
    const prevVal = (stageCompletion[stage] || {})[item];
    const newVal = !prevVal;
    const overrideKey = `${stage}__${item}`;

    // 자동감지 조건을 충족하지만 사용자가 수동 해제한 경우 → override 등록
    // 자동감지 조건과 무관하게 사용자가 체크한 경우 → override 해제 (자동도 허용)
    const newOverride = { ...manualOverride };
    if (!newVal) {
      // 체크 해제 → 수동 오버라이드 등록 (자동감지가 다시 켜지지 않도록)
      newOverride[overrideKey] = true;
    } else {
      // 체크 설정 → 오버라이드 해제 (자동감지와 동기화 허용)
      delete newOverride[overrideKey];
    }
    setManualOverride(newOverride);

    const updated = {
      ...stageCompletion,
      [stage]: { ...(stageCompletion[stage] || {}), [item]: newVal }
    };
    setStageCompletion(updated);
    try {
      const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
      await setDoc(orderRef, {
        stageCompletion: updated,
        stageCompletionOverride: newOverride,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (e) { console.error('체크리스트 저장 실패:', e); }
  };

  // 모든 체크리스트 항목 일괄 완료 처리
  const handleForceCompleteAll = async () => {
    if (!order) return;
    if (!window.confirm("모든 체크리스트 항목을 일괄 완료 처리하시겠습니까?")) return;

    const updated = { ...stageCompletion };
    Object.keys(updated).forEach(stage => {
      const sKey = stage as StageKey;
      const items = { ...updated[sKey] };
      Object.keys(items).forEach(itemKey => {
        items[itemKey] = true;
      });
      updated[sKey] = items;
    });

    const newOverride: Record<string, boolean> = {};
    setStageCompletion(updated);
    setManualOverride(newOverride);

    try {
      const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
      await setDoc(orderRef, {
        stageCompletion: updated,
        stageCompletionOverride: newOverride,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.error('전체 완료 처리 실패:', e);
    }
  };


  // ────────────────────────────────────────────────────────────────────────
  const [uploadingField, setUploadingField] = useState<'poFiles' | 'lcFiles' | 'scFiles' | 'ciFiles' | 'plFiles' | 'cooFiles' | 'blFiles' | 'exportDeclarationFiles' | 'coaFiles' | 'otherFiles' | 'containerWorkFiles' | 'transportationFiles' | 'transactionFiles' | 'attachments' | null>(null);
  const [uploadingCertSupplier, setUploadingCertSupplier] = useState<string | null>(null);
  const [uploadingCoaSupplier, setUploadingCoaSupplier] = useState<string | null>(null);
  const [piData, setPiData] = useState<any | null>(null);
  const [suppliersList, setSuppliersList] = useState<Supplier[]>([]);
  const [selectedAddSupplier, setSelectedAddSupplier] = useState('');
  
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
  
  const getPriceForSupplier = (prod: Product, supplierNameOrCode: string) => {
    let price = prod.purchasePrice || 0;
    let currency: 'USD' | 'KRW' = (prod.currency === 'KRW' ? 'KRW' : 'USD');
    
    if (prod.purchasePrices && prod.purchasePrices.length > 0) {
      const match = prod.purchasePrices
        .filter(p => p.supplierName === supplierNameOrCode || p.supplierCode === supplierNameOrCode)
        .sort((a, b) => b.validFrom.localeCompare(a.validFrom));
      
      if (match.length > 0) {
        price = match[0].price;
        currency = (match[0].currency === 'KRW' ? 'KRW' : 'USD');
      } else {
        // 일치하는 단가 레코드가 없으면 전체 단가 테이블 중 가장 최신 것 사용
        const allSorted = [...prod.purchasePrices].sort((a, b) => b.validFrom.localeCompare(a.validFrom));
        if (allSorted.length > 0) {
          price = allSorted[0].price;
          currency = (allSorted[0].currency === 'KRW' ? 'KRW' : 'USD');
        }
      }
    }
    return { price, currency };
  };

  const getSupplierPurchaseInfo = (it: any) => {
    const match = (it.name || '').match(/^\[(.*?)\]\s*(.*)$/);
    const itemCode = match ? match[1] : '-';
    const matchedProd = products.find(p => p.productCode === itemCode || p.id === itemCode);

    let defaultPrice = matchedProd ? (matchedProd.purchasePrice || 0) : (it.unitPrice || 0);
    let defaultCurrency = matchedProd ? (matchedProd.currency || 'USD') : 'USD';

    // 단가 테이블(purchasePrices)에서 공급사가 일치하고 날짜가 부합하는 최근 단가 매핑
    if (matchedProd && matchedProd.purchasePrices && matchedProd.purchasePrices.length > 0) {
      const activeSup = it.supplier?.trim();
      // 지정 공급사와 일치하는 단가들 필터링
      let matchedHists = matchedProd.purchasePrices.filter(p => p.supplierName?.trim() === activeSup || p.supplierCode === activeSup);
      
      // 일치하는 공급사가 없으면 기본 공급사의 단가 필터링
      if (matchedHists.length === 0 && matchedProd.suppliers && matchedProd.suppliers.length > 0) {
        const def = matchedProd.suppliers.find(s => s.isDefault) || matchedProd.suppliers[0];
        matchedHists = matchedProd.purchasePrices.filter(p => p.supplierCode === def.supplierCode || p.supplierName === def.supplierName);
      }

      // 날짜순(최신순) 정렬하여 적용 시작일이 현재보다 과거이거나 가장 임박한 첫 번째 단가 채택
      if (matchedHists.length > 0) {
        matchedHists.sort((a, b) => b.validFrom.localeCompare(a.validFrom));
        defaultPrice = matchedHists[0].price;
        defaultCurrency = matchedHists[0].currency;
      }
    }

    const originalPurchasePrice = it.originalPurchasePrice != null 
      ? it.originalPurchasePrice 
      : (it.purchaseUnitPrice != null 
         ? it.purchaseUnitPrice 
         : defaultPrice);
    const purchasePrice = it.purchaseUnitPrice != null ? it.purchaseUnitPrice : originalPurchasePrice;
    
    let purchaseCurrency = it.purchaseUnitCurrency;
    if (!purchaseCurrency) {
      if (it.originalPurchaseCurrency) {
        purchaseCurrency = it.originalPurchaseCurrency;
      } else if (purchasePrice > 1000) {
        purchaseCurrency = 'KRW';
      } else if (matchedProd) {
        purchaseCurrency = (defaultCurrency === 'KRW' ? 'KRW' : 'USD') as any;
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
  const [uploadingBankChargeReceipt, setUploadingBankChargeReceipt] = useState<number | null>(null);

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

  const handleBankChargeReceiptUpload = async (file: File, index: number) => {
    if (!order) return;
    setUploadingBankChargeReceipt(index);
    try {
      const uniqueFileName = `${Date.now()}_${file.name || 'bank_charge_receipt.png'}`;
      const storageRef = ref(storage, `tasks/${order.id}/payments/bank_charges/${index}/${uniqueFileName}`);
      const uploadTask = uploadBytesResumable(storageRef, file);
      
      await new Promise<void>((resolve, reject) => {
        uploadTask.on('state_changed', null, reject, () => resolve());
      });

      const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
      const newFile = {
        name: file.name || `수수료영수증_${new Date().toLocaleDateString()}.png`,
        url: downloadUrl,
        size: file.size,
        path: uploadTask.snapshot.ref.fullPath
      };

      const list = basicForm.bankCharges || [];
      const updatedList = [...list];
      if (!updatedList[index]) {
        updatedList[index] = { item: '', amount: 0 };
      }
      const currentReceipts = updatedList[index].receiptFiles || [];
      updatedList[index] = {
        ...updatedList[index],
        receiptFiles: [...currentReceipts, newFile]
      };

      setBasicForm(prev => ({
        ...prev,
        bankCharges: updatedList
      }));

      const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
      await setDoc(orderRef, {
        bankCharges: updatedList,
        updatedAt: serverTimestamp()
      }, { merge: true });

      alert('✅ 수수료 영수증이 업로드 되었습니다.');
    } catch (err: any) {
      alert('❌ 업로드 실패: ' + err.message);
    } finally {
      setUploadingBankChargeReceipt(null);
    }
  };

  const handleDeleteBankChargeReceipt = async (bcIndex: number, fileIndex: number) => {
    if (!order) return;
    if (!window.confirm("이 영수증을 삭제하시겠습니까?")) return;

    const list = basicForm.bankCharges || [];
    const updatedList = [...list];
    if (!updatedList[bcIndex] || !updatedList[bcIndex].receiptFiles) return;

    const fileToDelete = updatedList[bcIndex].receiptFiles[fileIndex];
    const newReceipts = updatedList[bcIndex].receiptFiles.filter((_: any, idx: number) => idx !== fileIndex);
    updatedList[bcIndex] = {
      ...updatedList[bcIndex],
      receiptFiles: newReceipts
    };

    try {
      if (fileToDelete.path) {
        const fileRef = ref(storage, fileToDelete.path);
        await deleteObject(fileRef).catch(e => console.warn("Failed to delete storage file:", e));
      }

      setBasicForm(prev => ({
        ...prev,
        bankCharges: updatedList
      }));

      const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
      await setDoc(orderRef, {
        bankCharges: updatedList,
        updatedAt: serverTimestamp()
      }, { merge: true });

      alert("✅ 삭제되었습니다.");
    } catch (err: any) {
      alert("❌ 삭제 실패: " + err.message);
    }
  };

  const [isSimFileUploading, setIsSimFileUploading] = useState(false);
  const [isSimImageUploading, setIsSimImageUploading] = useState(false);

  const handleSimFileUpload = async (file: File) => {
    if (!file || !order) return;
    setIsSimFileUploading(true);
    try {
      const storageRef = ref(storage, `tasks/${order.id}/actual_simulation_file.json`);
      const uploadTask = uploadBytesResumable(storageRef, file);
      await new Promise<void>((resolve, reject) => {
        uploadTask.on('state_changed', null, reject, () => resolve());
      });
      const url = await getDownloadURL(uploadTask.snapshot.ref);
      setBasicForm(prev => ({
        ...prev,
        actualContainerSimulation: {
          ...(prev.actualContainerSimulation || {}),
          simulationFileUrl: url,
          simulationFileName: file.name
        }
      }));
    } catch (err: any) {
      alert("업로드 실패: " + err.message);
    } finally {
      setIsSimFileUploading(false);
    }
  };

  const handleSimImageUpload = async (file: File) => {
    if (!file || !order) return;
    setIsSimImageUploading(true);
    try {
      const storageRef = ref(storage, `tasks/${order.id}/actual_simulation_image.jpg`);
      const uploadTask = uploadBytesResumable(storageRef, file);
      await new Promise<void>((resolve, reject) => {
        uploadTask.on('state_changed', null, reject, () => resolve());
      });
      const url = await getDownloadURL(uploadTask.snapshot.ref);
      setBasicForm(prev => ({
        ...prev,
        actualContainerSimulation: {
          ...(prev.actualContainerSimulation || {}),
          simulationImageUrl: url
        }
      }));
    } catch (err: any) {
      alert("업로드 실패: " + err.message);
    } finally {
      setIsSimImageUploading(false);
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

  // Checklist collapse state for minimal space view (default: collapsed)
  const [isChecklistCollapsed, setIsChecklistCollapsed] = useState(true);

  // CFS related states
  const [cfsList, setCfsList] = useState<string[]>([]);
  const [isAddingCfs, setIsAddingCfs] = useState(false);
  const [newCfsVal, setNewCfsVal] = useState('');

  // PO presets states
  const [poPresets, setPoPresets] = useState<{ specialRemarks: string[]; generalNotes: string[] }>({
    specialRemarks: [],
    generalNotes: []
  });

  const [selectedPresetText, setSelectedPresetText] = useState<Record<string, string>>({});

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

  const handleEditPoPreset = async (type: 'specialRemarks' | 'generalNotes', oldText: string, newText: string) => {
    if (!oldText || !newText.trim()) return;
    if (!window.confirm("선택한 템플릿의 문구를 DB에서 수정하시겠습니까?")) return;
    const currentList = poPresets[type];
    try {
      const presetsRef = doc(db, 'companies', COMPANY_ID, 'po_presets', 'settings');
      const nextList = currentList.map(item => item === oldText ? newText : item);
      await setDoc(presetsRef, {
        [type]: nextList
      }, { merge: true });
      alert("✅ 템플릿이 성공적으로 수정되었습니다.");
    } catch (err: any) {
      alert("템플릿 수정 실패: " + err.message);
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

  const [editingPurchasePrice, setEditingPurchasePrice] = useState<{ [itemIdx: number]: string }>({});
  const [editingOriginalPurchasePrice, setEditingOriginalPurchasePrice] = useState<{ [itemIdx: number]: string }>({});

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

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'companies', COMPANY_ID, 'customers'), (snapshot) => {
      const list: Customer[] = [];
      snapshot.forEach(docSnap => {
        list.push({ ...docSnap.data(), id: docSnap.id } as Customer);
      });
      setCustomers(list);
    });
    return () => unsubscribe();
  }, []);

  // Form states for details editing
  const [basicForm, setBasicForm] = useState({
    piNumber: '',
    customer: '',
    customerId: '',
    customerCode: '',
    destinationPort: '',
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
    supplierTaxInvoiceDetails: {} as Record<string, any>,
    supplierPoDetails: {} as Record<string, { requestDate?: string; deliveryPlace?: string; specialRemarks?: string; generalNotes?: string; }>,
    supplierPurchaseCertFiles: {} as Record<string, Array<{ name: string; url: string; size: number; path: string }>>,
    supplierPaymentInstallments: {} as Record<string, Array<{ date: string; amount: number; currency?: 'KRW' | 'USD'; method?: '송금' | '카드'; receiptFiles?: Array<{ name: string; url: string; size: number; path: string }> }>>,
    paymentCollectedInstallments: [{ date: '', amount: 0, fee: 0, total: 0, currency: 'USD' }] as Array<{ date: string; amount: number; fee?: number; total?: number; currency: 'KRW' | 'USD' | 'CNY' | 'EUR'; receiptFiles?: Array<{ name: string; url: string; size: number; path: string }> }>,
    bankSubmissionStatus: '' as 'Y' | 'N' | '',
    bankCharges: [] as Array<{ date?: string; item: string; amount: number; receiptFiles?: Array<{ name: string; url: string; size: number; path: string }> }>,
    actualContainerSimulation: null as any,
    quotationId: '',

    // 주문 기본정보 및 L/C 거래 상세
    customerAddress: '',
    portOfLoading: '',
    portOfDischarge: '',
    destinationCountry: '',
    lcIssuingBank: '',
    lcIssuingDate: '',
    lcDescription: '',
    lcRemark: '',
    shipmentType: 'FCL' as 'LCL' | 'FCL' | '',
    fclSpecs: [] as Array<{ type: '20GP' | '40GP' | '40HQ' | '20RF' | '20OT' | '40OT' | '20FR' | '40FR' | '20DG' | '40DG'; qty: number; containerNo?: string; sealNo?: string; }>,
    blNumbers: [] as string[],
    blNumber: '',
    deliveryPlace: ''
  });

  const [editingFreight, setEditingFreight] = useState<{ idx: number; value: string } | null>(null);

  // ── 자동감지 → 체크리스트 자동 완료 (방향 B) ──────────────────────────
  // Firebase 데이터 조건 충족 시 해당 항목 자동 체크
  // manualOverride에 등록된 항목은 건드리지 않음
  useEffect(() => {
    if (!order) return;

    const autoDetect: Partial<Record<StageKey, Record<string, boolean>>> = {};

    // ── 수주정보 ──
    const po수주: Record<string, boolean> = {};
    if (basicForm.ciNumber)
      po수주['확정 CI 번호 입력'] = true;
    if (basicForm.incoterms && basicForm.paymentTerms)
      po수주['인코텀즈/결제조건 입력'] = true;
    if (basicForm.isLc === 'Y') {
      if (basicForm.lcNo && basicForm.lcIssuingBank && basicForm.lcIssuingDate) {
        po수주['L/C 거래 상세 정보 입력'] = true;
      }
    } else {
      po수주['L/C 거래 상세 정보 입력'] = true;
    }
    autoDetect['수주정보'] = po수주;

    // ── 소싱/발주 ──
    const po소싱: Record<string, boolean> = {};
    const donePoCount = allOrderSuppliers.filter(s =>
      issuedDocs.some(d => d.status === 'active' && (d.supplier_name === s || d.po_number.includes(s.replace(/\s+/g, '').substring(0,3).toUpperCase())))
    ).length;
    if (allOrderSuppliers.length > 0 && donePoCount === allOrderSuppliers.length) {
      po소싱['발주서 발행 및 저장'] = true;
    }
    autoDetect['소싱발주'] = po소싱;

    // ── 물류/선적 ──
    const po물류: Record<string, boolean> = {};
    const hasForwarder = forwardersList.length > 0 && forwardersList.some(fw => !!fw.name);
    const hasVolume = !!basicForm.shipmentType;
    if (hasForwarder && hasVolume)
      po물류['포워딩/운송사 및 수출 Volume 선택'] = true;
    if (basicForm.etd)
      po물류['ETD 입력'] = true;
    if (issuedDocs.some(d => d.status === 'active' && d.fileName.startsWith('도착보고서')))
      po물류['도착보고 발송 완료'] = true;
    autoDetect['물류선적'] = po물류;

    // ── 서류관리 ──
    const po서류: Record<string, boolean> = {};
    if (basicForm.exportDeclarationNo)
      po서류['수출신고번호 입력'] = true;
    const isDocsUploaded = ((order.ciFiles && order.ciFiles.length > 0) || (order.plFiles && order.plFiles.length > 0)) &&
                           (order.cooFiles && order.cooFiles.length > 0) &&
                           (order.blFiles && order.blFiles.length > 0);
    if (isDocsUploaded)
      po서류['CI, PL, COO, BL 서류 업로드 완료'] = true;
    autoDetect['서류관리'] = po서류;

    // ── 정산/결제 ──
    const po정산: Record<string, boolean> = {};
    if (basicForm.supplierTaxInvoiceDetails) {
      const taxKeys = Object.keys(basicForm.supplierTaxInvoiceDetails);
      if (taxKeys.length > 0 && taxKeys.some(k => {
        const d = basicForm.supplierTaxInvoiceDetails[k];
        if (Array.isArray(d)) return d.some((x: any) => !!x.invoiceNo);
        return !!(d as any)?.invoiceNo;
      })) po정산['세금계산서 발행 완료'] = true;
    }
    if (basicForm.paymentCollectedDate || (basicForm.paymentCollectedInstallments && basicForm.paymentCollectedInstallments.some((inst: any) => (inst.amount || 0) > 0)))
      po정산['입금 진행 완료'] = true;
    const donePaymentCount = allOrderSuppliers.filter(s => basicForm.supplierPayments?.[s]?.status === '결제완료' || basicForm.supplierPayments?.[s]?.status === '입금완료').length;
    if (allOrderSuppliers.length > 0 && donePaymentCount === allOrderSuppliers.length) {
      po정산['공급업체 대금 결제 완료'] = true;
    }
    const totalCollectedAmount = (basicForm.paymentCollectedInstallments || []).reduce((sum: number, inst: any) => sum + (Number(inst.amount) || 0), 0);
    if (totalCollectedAmount > 0)
      po정산['수금 관리 완료'] = true;
    autoDetect['정산결제'] = po정산;

    // manualOverride 보호 + 기존 수동 체크 유지하며 merge
    setStageCompletion(prev => {
      const merged = { ...prev };
      (Object.keys(autoDetect) as StageKey[]).forEach(stage => {
        const autoItems = autoDetect[stage] || {};
        const current = prev[stage] || {};
        const next = { ...current };
        Object.entries(autoItems).forEach(([itemKey, autoVal]) => {
          const overrideKey = `${stage}__${itemKey}`;
          // manualOverride에 등록된 항목은 건드리지 않음
          if (manualOverride[overrideKey]) return;
          // 자동감지가 true일 때만 덮어씀 (false로는 절대 덮어쓰지 않음)
          if (autoVal) next[itemKey] = true;
        });
        merged[stage] = next;
      });
      return merged;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    order,
    basicForm.incoterms, basicForm.paymentTerms, basicForm.custPo, basicForm.poDate,
    basicForm.isLc, basicForm.lcNo,
    basicForm.cargoReadyDate, basicForm.supplierPoSent,
    basicForm.vesselBooking, basicForm.cfsEntryDate, basicForm.shipmentCompleted, basicForm.etd,
    basicForm.ciPlStatus, basicForm.exportDeclarationNo, basicForm.blStatus,
    basicForm.shippingDocsSentStatus, basicForm.bankSubmissionDate,
    basicForm.paymentCollectedDate, basicForm.supplierPayments, basicForm.supplierTaxInvoiceDetails,
    basicForm.paymentCollectedInstallments, basicForm.forwarderConfirmed,
    orderItems, forwardersList, issuedDocs, manualOverride
  ]);



  const [myCompanies, setMyCompanies] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);

  useEffect(() => {
    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setUsersList(list);
    });
    return () => unsubscribeUsers();
  }, []);

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
  const isOpeningArchiveRef = useRef(false);

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

  // 3D적재 시뮬레이션 파일 보관함 핸들러 함수들
  const handleArchiveUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const proj = JSON.parse(reader.result as string);
        if (!proj.items || !proj.containerQuantities) {
          alert('올바른 적재결과 JSON 파일이 아닙니다.');
          return;
        }
        
        const newPlan = {
          id: proj.id || `plan_${Date.now()}`,
          name: file.name,
          savedAt: new Date().toISOString(),
          summary: `${proj.items?.reduce((acc: number, it: any) => acc + (it.qty || 0), 0) || 0}개 품목 (${proj.containerType || '20GP'} × ${proj.containerQuantities?.[proj.containerType] || 1})`,
          planData: proj
        };

        setBasicForm(prev => {
          const currentPlans = prev.packingList?.archivedPlans || [];
          const existsIdx = currentPlans.findIndex((p: any) => p.id === newPlan.id);
          let updatedPlans = [...currentPlans];
          if (existsIdx >= 0) {
            updatedPlans[existsIdx] = newPlan;
          } else {
            updatedPlans.push(newPlan);
          }
          return {
            ...prev,
            packingList: {
              ...prev.packingList,
              archivedPlans: updatedPlans
            }
          };
        });
        alert('업로드한 적재 결과가 파일보관함에 보관되었습니다. 하단의 [저장] 버튼을 누르면 DB에도 최종 저장됩니다.');
      } catch (err: any) {
        alert('파일 파싱 중 오류가 발생했습니다: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const openArchivedPlan = (plan: any) => {
    isOpeningArchiveRef.current = true;
    setBasicForm(prev => ({
      ...prev,
      packingList: {
        ...prev.packingList,
        raw3DPlan: plan.planData
      }
    }));
    
    // Save to localStorage so iframe can pick it up immediately
    const payload = {
      type: 'LOAD_PI_DATA',
      customer: plan.planData.customerName || basicForm.customer || '',
      piNumber: plan.planData.projectName || basicForm.piNumber || order?.id || '',
      date: plan.planData.date || basicForm.etd || new Date().toISOString().split('T')[0],
      containers: plan.planData.containerQuantities || { '20GP': 1 },
      items: (plan.planData.items || []).map((it: any) => ({
        desc: it.name || it.desc || '화물',
        qty: it.qty || 1,
        w: it.w || 1100,
        d: it.d || 1100,
        h: it.h || 1000,
        netWeight: it.netWeight || 0,
        grossWeight: it.grossWeight || 0,
        packageType: it.packageType || 'Pallet'
      })),
      raw3DPlan: plan.planData
    };
    try {
      localStorage.setItem('PI_SIMULATION_DATA', JSON.stringify(payload));
    } catch (err) {
      console.error(err);
    }
    setIsPackerModalOpen(true);
  };

  const downloadArchivedPlan = (plan: any) => {
    const jsonStr = JSON.stringify(plan.planData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = plan.name;
    link.click();
    URL.revokeObjectURL(url);
  };

  const deleteArchivedPlan = (planId: string) => {
    if (!confirm('이 적재 계획을 보관함에서 삭제하시겠습니까?')) return;
    setBasicForm(prev => {
      const currentPlans = prev.packingList?.archivedPlans || [];
      const updatedPlans = currentPlans.filter((p: any) => p.id !== planId);
      return {
        ...prev,
        packingList: {
          ...prev.packingList,
          archivedPlans: updatedPlans
        }
      };
    });
  };

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
          const rawPlan = data.raw3DPlan;
          
          const planCount = (latestPackingDataRef.current.basicForm.packingList?.archivedPlans || []).length + 1;
          const defaultPlanName = `${latestPackingDataRef.current.basicForm.piNumber || latestPackingDataRef.current.order?.id || 'PI'}_적재계획_v${planCount}.json`;
          
          const newPlan = {
            id: rawPlan?.id || `plan_${Date.now()}`,
            name: defaultPlanName,
            savedAt: new Date().toISOString(),
            summary: `${rawPlan?.items?.reduce((acc: number, it: any) => acc + (it.qty || 0), 0) || 0}개 품목 (${rawPlan?.containerType || '20GP'} × ${rawPlan?.containerQuantities?.[rawPlan?.containerType] || 1})`,
            planData: rawPlan
          };

          const shouldOverwrite = false;

          setBasicForm(prev => {
            const currentPlans = prev.packingList?.archivedPlans || [];
            const existsIdx = currentPlans.findIndex((p: any) => p.id === newPlan.id);
            let updatedPlans = [...currentPlans];
            if (existsIdx >= 0) {
              updatedPlans[existsIdx] = newPlan;
            } else {
              updatedPlans.push(newPlan);
            }
            return {
              ...prev,
              packingList: {
                ...prev.packingList,
                containers: shouldOverwrite ? receivedContainers : (prev.packingList?.containers || []),
                raw3DPlan: rawPlan || null,
                archivedPlans: updatedPlans
              }
            };
          });
          setIsPackerModalOpen(false);
          alert('컨테이너 적재 시뮬레이션 결과가 파일보관함에 보관되었습니다.');
        }
      } else if (data && data.type === 'REQUEST_PRODUCT_SEARCH') {
        (window as any).activePackerWindow = event.source;
        setSearchItemIndex(-999);
        setIsProductSearchOpen(true);
      } else if (data && data.type === 'IFRAME_READY') {
        if (isOpeningArchiveRef.current) {
          isOpeningArchiveRef.current = false;
          return;
        }
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
            items: itemsPayload,
            raw3DPlan: latestBasicForm.packingList?.raw3DPlan || null
          }, '*');
        }
      }
    };
    window.addEventListener('message', handlePackerMessage);
    return () => window.removeEventListener('message', handlePackerMessage);
  }, []);

  // ── activeStep 변경 감지 → PO 상세 접기/보기 제어 ──
  useEffect(() => {
    if (activeStep === '수주정보') {
      setShowPoDetails(true);
    } else {
      setShowPoDetails(false);
    }
  }, [activeStep]);

  // Load Order document
  useEffect(() => {
    if (!id) return;
    const docRef = doc(db, 'companies', COMPANY_ID, 'orders', id);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() } as Order;
        if (data.transportationFiles && data.transportationFiles.length > 0) {
          const merged = [...(data.containerWorkFiles || []), ...data.transportationFiles];
          const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', data.id);
          updateDoc(orderRef, {
            containerWorkFiles: merged,
            transportationFiles: []
          }).catch(err => console.error("Auto-migration of transportation files failed:", err));
        }
        skipNextDirtyCheck.current = true;
        setOrder(data);
        if ((data as any).po_issued_documents) {
          setIssuedDocs((data as any).po_issued_documents);
        }
        
        initialLoadRef.current = true;
        setBasicForm({
          piNumber: data.piNumber || data.quotationId || '',
          customer: data.customer || '',
          customerId: (data as any).customerId || '',
          customerCode: (data as any).customerCode || '',
          destinationPort: (data as any).destinationPort || data.portOfDischarge || '',
          custPo: data.custPo || '',
          incoterms: data.incoterms || 'FOB',
          paymentTerms: data.paymentTerms || '',
          poDate: data.poDate || '',
          requestedDelivery: data.requestedDelivery || '',
          deliveryPlace: data.deliveryPlace || '',
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
                      description: `${it.name || ''} - ${(it.qty || 0).toLocaleString()} ${it.unit || 'EA'}`,
                      supplier: it.supplier || 'General Supplier',
                      pkgNo: String(idx + 1),
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
          bankCharges: data.bankCharges || [],

          // 주문 기본정보 및 L/C 거래 상세 로드
          customerAddress: data.customerAddress || '',
          portOfLoading: data.portOfLoading || '',
          portOfDischarge: data.portOfDischarge || '',
          destinationCountry: data.destinationCountry || '',
          lcIssuingBank: data.lcIssuingBank || '',
          lcIssuingDate: data.lcIssuingDate || '',
          lcDescription: data.lcDescription || '',
          lcRemark: data.lcRemark || '',
          actualContainerSimulation: data.actualContainerSimulation || null,
          quotationId: data.quotationId || '',
          shipmentType: data.shipmentType || 'FCL',
          fclSpecs: data.fclSpecs || [],
          blNumbers: data.blNumbers || (data.blNumber ? [data.blNumber] : []),
          blNumber: data.blNumber || ''
        });
        const itemsWithHs = (data.items || []).map((it) => {
          const codeMatch = (it.name || '').match(/^\[(.*?)\]\s*(.*)$/);
          const code = codeMatch ? codeMatch[1] : (it.itemId || '');
          const matchedProd = products.find(p => p.productCode === code || p.id === code);
          const custSpecificHs = matchedProd?.customerHsCodes?.[data.customer || ''] || '';
          return {
            ...it,
            hsCode: it.hsCode || custSpecificHs || matchedProd?.hsCode || ''
          };
        });

        const rawSourcing = (data.sourcingItems && data.sourcingItems.length > 0) ? data.sourcingItems : (data.items || []);

        const restoredOrderItems = itemsWithHs.map((it: any, idx: number) => {
          const sIt = rawSourcing.find((s: any) => s.itemId === it.itemId) || rawSourcing[idx];
          const activeSupplier = it.supplier?.trim() || sIt?.supplier?.trim() || '';
          const activeContact = it.supplierContact?.trim() || sIt?.supplierContact?.trim() || '';
          return {
            ...it,
            supplier: activeSupplier,
            supplierContact: activeContact
          };
        });

        const alignedSourcing = rawSourcing.map((sIt: any, idx: number) => {
          const rIt = restoredOrderItems.find((r: any) => r.itemId === sIt.itemId) || restoredOrderItems[idx];
          const activeSupplier = sIt.supplier?.trim() || rIt?.supplier?.trim() || '';
          const activeContact = sIt.supplierContact?.trim() || rIt?.supplierContact?.trim() || '';
          return {
            ...sIt,
            supplier: activeSupplier,
            supplierContact: activeContact
          };
        });

        setOrderItems(restoredOrderItems);
        setSourcingItems(alignedSourcing);
        setForwardersList(data.forwarders || []);

        // stageCompletion 로드 — 없으면 기본값 유지
        if ((data as any).stageCompletion) {
          setStageCompletion(prev => ({
            ...prev,
            ...(data as any).stageCompletion
          }));
        }
        // manualOverride 로드
        if ((data as any).stageCompletionOverride) {
          setManualOverride((data as any).stageCompletionOverride);
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

  const [piList, setPiList] = useState<any[]>([]);
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(doc(db, 'companies', COMPANY_ID), 'proforma_invoices'), (snap) => {
      setPiList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsubscribe();
  }, []);

  // Ctrl+S 단축키로 전체 저장 (대안 3)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveBasic(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [basicForm, orderItems, sourcingItems, forwardersList, order]);

  // 사이트 전체 입력 필드 이탈(Blur) 및 Enter 입력 시 자동 저장 (글로벌 위임)
  useEffect(() => {
    const handleGlobalFocusOut = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
      ) {
        // file 타입 uploader 등은 자동저장 대상에서 제외 (기존 파일 업로드 콜백이 따로 돌기 때문)
        if (target.getAttribute('type') === 'file') return;
        
        // 팝업 알림 없이 백그라운드 무음 자동 저장
        handleSaveBasic(false);
      }
    };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
      ) {
        // textarea 에서 Shift + Enter 입력시 줄바꿈 지원을 위해 제외
        if (target.tagName === 'TEXTAREA' && e.shiftKey) return;

        if (e.key === 'Enter') {
          // Enter 키 입력 시 포커스 아웃시켜 focusout 이벤트 유발
          target.blur();
        }
      }
    };

    window.addEventListener('focusout', handleGlobalFocusOut);
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('focusout', handleGlobalFocusOut);
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [basicForm, orderItems, sourcingItems, forwardersList, order]);

  // Switch active tab view via URL and handle save on click
  const handleStepClick = async (stepName: typeof steps[number]) => {
    const defaultSubTabs = STEP_DEFAULT_SUBTAB[stepName] || {};
    updateQuery({
      step: stepName,
      ...defaultSubTabs,
    });

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
    const list = Array.from(new Set([...itemSuppliers, ...additional]));

    const SUPPLIER_SORT_ORDER = [
      '주식회사 켐베이스',
      '태성기술',
      '주식회사 하영에스엠씨',
      '(주)아이오트레이딩',
      '(주)투에이취엠',
      '주식회사 정도'
    ];

    return list.sort((a, b) => {
      const idxA = SUPPLIER_SORT_ORDER.indexOf(a);
      const idxB = SUPPLIER_SORT_ORDER.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [groupedSupplierItems, order]);

  // Direct volume update handler to prevent onSnapshot overwrite race-conditions
  const handleUpdateVolumeDataDirectly = async (shipmentType: 'LCL' | 'FCL', fclSpecs: any[]) => {
    if (!order) return;
    setBasicForm(prev => ({
      ...prev,
      shipmentType,
      fclSpecs
    }));
    try {
      const docRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
      await updateDoc(docRef, {
        shipmentType,
        fclSpecs: fclSpecs.map(c => ({
          type: c.type,
          qty: Number(c.qty) || 1,
          containerNo: c.containerNo || '',
          sealNo: c.sealNo || ''
        }))
      });
    } catch (err) {
      console.error("Direct volume update error:", err);
    }
  };

  const autoRegisterOrderTask = async (piNum: string, customerName: string, actionDescription: string) => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      if (isMonitoringUser({ email: currentUser.email || '', name: currentUser.displayName || '' })) {
        console.log('Skip autoRegisterOrderTask for monitoring user:', currentUser.email);
        return;
      }
      const userKey = currentUser.email?.split('@')[0] || '';
      let assigneeId = userKey;
      let assigneeName = '시스템';

      if (userKey === 'jhkim1130') {
        assigneeId = 'jhkim1130';
        assigneeName = '김주한';
      } else if (userKey === 'jhk010624') {
        assigneeId = 'jhk010624';
        assigneeName = '김하은';
      } else if (userKey === 'alexpark') {
        assigneeId = 'alexpark';
        assigneeName = '박현';
      } else {
        assigneeId = userKey || 'system';
        assigneeName = currentUser.displayName || userKey || '시스템';
      }

      // Look for an existing incomplete auto task for this Order
      const q = query(
        collection(db, 'tasks'),
        where('title', '==', `[자동] 주문 관리: ${customerName} (PI: ${piNum})`),
        where('status', '!=', 'DONE')
      );
      const snap = await getDocs(q);
      
      const taskDescription = `주문관리(PI: ${piNum}, 바이어: ${customerName})의 일부 업무가 진행 및 갱신되었습니다.\n- 변경/작업 내역:\n  ${actionDescription}\n- 담당자: ${assigneeName}\n- 최종 업데이트: ${new Date().toLocaleString()}`;
      
      if (!snap.empty) {
        // Option A: Update existing incomplete task
        const existingDoc = snap.docs[0];
        const existingData = existingDoc.data() as any;
        const updatedDesc = `${existingData.description || ''}\n\n[업데이트 - ${new Date().toLocaleTimeString()}]\n- ${actionDescription}`;
        
        await updateDoc(doc(db, 'tasks', existingDoc.id), {
          description: updatedDesc,
          updatedAt: new Date().toISOString()
        });
        console.log('Updated existing auto OrderTask:', existingDoc.id);
      } else {
        // Create a new task
        const newTask = {
          title: `[자동] 주문 관리: ${customerName} (PI: ${piNum})`,
          description: taskDescription,
          status: 'IN_PROGRESS',
          type: 'DAILY',
          scheduleType: 'SELF',
          importance: 'B',
          urgency: 5,
          quadrant: 'Q2',
          assigneeId: assigneeId,
          assigneeName: assigneeName,
          createdBy: assigneeId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await addDoc(collection(db, 'tasks'), newTask);
        console.log('Created new auto OrderTask');
      }
    } catch (e) {
      console.error('Failed to auto register Order task:', e);
    }
  };

  const autoCompleteOrderTask = async (piNum: string, customerName: string) => {
    try {
      const q = query(
        collection(db, 'tasks'),
        where('title', '==', `[자동] 주문 관리: ${customerName} (PI: ${piNum})`),
        where('status', '!=', 'DONE')
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        for (const docSnap of snap.docs) {
          await updateDoc(doc(db, 'tasks', docSnap.id), {
            status: 'DONE',
            completedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }
        console.log('Auto completed Order task for', piNum);
      }
    } catch (e) {
      console.error('Failed to auto complete Order task:', e);
    }
  };

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
      if (order.deliveryPlace !== basicForm.deliveryPlace) changes.push(`납품처 변경: "${order.deliveryPlace || ''}" → "${basicForm.deliveryPlace}"`);
      if (order.remark !== basicForm.remark) changes.push(`비고(Remarks) 변경: "${order.remark || ''}" → "${basicForm.remark}"`);
      if (order.ciNumber !== basicForm.ciNumber) changes.push(`CI 번호 변경: "${order.ciNumber || ''}" → "${basicForm.ciNumber}"`);
      if (order.isLc !== basicForm.isLc) changes.push(`L/C거래여부 변경: "${order.isLc || ''}" → "${basicForm.isLc}"`);
      
      const sourcingTabToSave = tabIdOverride || activeSourcingTab;
      const stepToSave = stepNameOverride || activeStep;
      const mappedStatus = stepToSave === '수주정보' ? '주문' : 
                           stepToSave === '소싱/발주' ? '발주' :
                           stepToSave === '물류/선적' ? '선적관리' :
                           stepToSave === '서류관리' ? '선적관리' :
                           stepToSave === '정산/결제' ? '이익관리' : null;

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
      const isMonitoring = isMonitoringUser({ email: auth.currentUser?.email || '', name: auth.currentUser?.displayName || '' });
      if (changes.length > 0 && !isMonitoring) {
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
        deliveryPlace: basicForm.deliveryPlace || '',
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
        bankCharges: basicForm.bankCharges || [],
        transactionFiles: order.transactionFiles || [],

        // 주문 기본정보 및 L/C 거래 상세 저장
        customerAddress: basicForm.customerAddress,
        portOfLoading: basicForm.portOfLoading,
        portOfDischarge: basicForm.portOfDischarge,
        destinationCountry: basicForm.destinationCountry,
        lcIssuingBank: basicForm.lcIssuingBank,
        lcIssuingDate: basicForm.lcIssuingDate,
        lcDescription: basicForm.lcDescription,
        lcRemark: basicForm.lcRemark,
        shipmentType: basicForm.shipmentType || 'FCL',
        fclSpecs: (basicForm.fclSpecs || []).map(c => ({ type: c.type, qty: c.qty, containerNo: c.containerNo || '', sealNo: c.sealNo || '' })),

        packingList: basicForm.packingList || null,
        actualContainerSimulation: basicForm.actualContainerSimulation || null,
        commonShippingMark: commonShippingMark,
        activeSourcingTab: sourcingTabToSave,
        quotationId: basicForm.quotationId || '',
        blNumbers: basicForm.blNumbers || [],
        blNumber: basicForm.blNumber || '',
        
        items: orderItems.map((it, idx) => {
          const matchingSourcing = sourcingItems.find(s => s.itemId === it.itemId) || sourcingItems[idx];
          const activeSupplier = it.supplier?.trim() || matchingSourcing?.supplier?.trim() || '';
          return {
            itemId: it.itemId || '',
            name: it.name || '',
            supplier: activeSupplier,
            supplierContact: it.supplierContact || matchingSourcing?.supplierContact || '',
            grade: it.grade || '',
            qty: parseFloat(it.qty as any) || 0,
            unit: (it.unit || 'kg') as any,
            unitPrice: parseFloat(it.unitPrice as any) || 0,
            purchaseUnitPrice: it.purchaseUnitPrice != null ? (parseFloat(it.purchaseUnitPrice as any) || 0) : null,
            purchaseUnitCurrency: it.purchaseUnitCurrency || null,
            originalPurchasePrice: it.originalPurchasePrice != null ? (parseFloat(it.originalPurchasePrice as any) || 0) : null,
            originalPurchaseCurrency: it.originalPurchaseCurrency || null,
            amount: it.amount || 0,
            currency: (it.currency || 'USD') as any,
            hsCode: (it as any).hsCode || ''
          };
        }),
        sourcingItems: sourcingItems.map((it, idx) => {
          const matchingOrderItem = orderItems.find(r => r.itemId === it.itemId) || orderItems[idx];
          const activeSupplier = it.supplier?.trim() || matchingOrderItem?.supplier?.trim() || '';
          return {
            itemId: it.itemId || '',
            name: it.name || '',
            supplier: activeSupplier,
            supplierContact: it.supplierContact || matchingOrderItem?.supplierContact || '',
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
          };
        }),
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
            finalAmountUsd: (fw.freightCurrency === 'USD' ? freight : 0),
            finalAmountKrw: domestic + (fw.amountVatKrw ? Number(fw.amountVatKrw) : 0) + (fw.freightCurrency === 'KRW' ? freight : 0),
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

      // ── 동기화: 사용자가 입력한 HS CODE를 상품 마스터(DB)에 동적 연동 ──
      const customerName = basicForm.customer?.trim();
      if (customerName) {
        for (const item of orderItems) {
          const codeVal = item.hsCode?.trim();
          if (codeVal) {
            const rawCode = getRawProductCode(item.itemId);
            const prod = products.find(p => p.productCode === rawCode || p.id === rawCode);
            if (prod) {
              const prodRef = doc(db, 'companies', COMPANY_ID, 'products', prod.id);
              const existingCustomerHsCodes = prod.customerHsCodes || {};
              // 기존에 저장된 HS Code와 다를 경우에만 DB Write 실행
              if (existingCustomerHsCodes[customerName] !== codeVal) {
                await setDoc(prodRef, {
                  customerHsCodes: {
                    ...existingCustomerHsCodes,
                    [customerName]: codeVal
                  }
                }, { merge: true });
              }
            }
          }
        }
      }

      isDirtyRef.current = false;
      const piNum = basicForm.piNumber || order.piNumber || '알수없음';
      const customer = basicForm.customer || order.customer || '알수없음';

      if (changes.length > 0) {
        const logDescription = changes.join(', ');
        await autoRegisterOrderTask(piNum, customer, logDescription);
      }

      const isCompleted = basicForm.shipmentCompleted === 'Y' || mappedStatus === '이익관리';
      if (isCompleted) {
        await autoCompleteOrderTask(piNum, customer);
      }

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
          
          let supName = prod.supplierName || '';
          if (prod.suppliers && prod.suppliers.length > 0) {
            const defLink = prod.suppliers.find(s => s.isDefault);
            if (defLink) {
              supName = defLink.supplierName;
            }
          }

          // Fallback to existing supplier if master DB has no supplier assigned
          const finalSupplier = supName || it.supplier || '';
          
          const priceObj = getPriceForSupplier(prod, finalSupplier);
          let buyPrice = priceObj.price > 0 ? priceObj.price : (it.unitPrice || 0);
          let itemCurrency = priceObj.currency || it.currency || 'USD';

          const qty = it.qty || 0;
          const amt = itemCurrency === 'KRW' ? Math.round(qty * buyPrice) : parseFloat((qty * buyPrice).toFixed(2));

          it = {
            ...it,
            name: `[${prod.productCode}] ${displayName}`,
            supplier: finalSupplier,
            supplierContact: contactInfo || it.supplierContact || '',
            grade: prod.spec || it.grade || '',
            unit: (prod.unit || it.unit || 'kg') as any,
            unitPrice: buyPrice,
            currency: itemCurrency as any,
            amount: amt,
            purchaseUnitPrice: buyPrice,
            purchaseUnitCurrency: itemCurrency
          };
        }
      }

      if (field === 'supplier') {
        const parsedCode = getRawProductCode(it.name);
        const prod = products.find(p => p.productCode === parsedCode || p.id === parsedCode);
        if (prod) {
          const priceObj = getPriceForSupplier(prod, value);
          if (priceObj.price > 0) {
            it.unitPrice = priceObj.price;
            it.currency = priceObj.currency as any;
            it.purchaseUnitPrice = priceObj.price;
            it.purchaseUnitCurrency = priceObj.currency;
            if (it.qty) {
              it.amount = priceObj.currency === 'KRW' ? Math.round(it.qty * priceObj.price) : parseFloat((it.qty * priceObj.price).toFixed(2));
            }
          }
        }
        
        // Sync supplier to sourcingItems in real-time!
        setSourcingItems(prevSourcing => {
          return prevSourcing.map((sIt, sIdx) => {
            if (sIt.itemId === it.itemId || sIdx === index) {
              return { ...sIt, supplier: value };
            }
            return sIt;
          });
        });
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

      // 동기화: 수주 품목 정보 변경 시, 소싱/발주 탭(sourcingItems)에도 실시간 반영
      setSourcingItems(sourcingPrev => {
        const sourcingUpdated = [...sourcingPrev];
        if (sourcingUpdated[index]) {
          sourcingUpdated[index] = {
            ...sourcingUpdated[index],
            name: it.name,
            qty: it.qty,
            unit: it.unit,
            supplier: it.supplier,
            supplierContact: it.supplierContact,
            grade: it.grade,
            purchaseUnitPrice: it.purchaseUnitPrice,
            purchaseUnitCurrency: it.purchaseUnitCurrency,
            amount: it.amount,
            currency: it.currency
          };
        }
        return sourcingUpdated;
      });

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
          
          let supName = prod.supplierName || '';
          if (prod.suppliers && prod.suppliers.length > 0) {
            const defLink = prod.suppliers.find(s => s.isDefault);
            if (defLink) {
              supName = defLink.supplierName;
            }
          }
          
          const priceObj = getPriceForSupplier(prod, supName);
          let buyPrice = priceObj.price;
          let itemCurrency = priceObj.currency;

          const qty = it.qty || 0;
          const amt = itemCurrency === 'KRW' ? Math.round(qty * buyPrice) : parseFloat((qty * buyPrice).toFixed(2));

          it = {
            ...it,
            name: `[${prod.productCode}] ${displayName}`,
            supplier: supName,
            supplierContact: contactInfo || '',
            grade: prod.spec || '',
            unit: (prod.unit || 'kg') as any,
            unitPrice: buyPrice,
            currency: itemCurrency,
            amount: amt,
            purchaseUnitPrice: buyPrice,
            purchaseUnitCurrency: itemCurrency
          };
        }
      }

      if (field === 'supplier') {
        const parsedCode = getRawProductCode(it.name);
        const prod = products.find(p => p.productCode === parsedCode || p.id === parsedCode);
        if (prod) {
          const priceObj = getPriceForSupplier(prod, value);
          it.unitPrice = priceObj.price;
          it.currency = priceObj.currency;
          it.purchaseUnitPrice = priceObj.price;
          it.purchaseUnitCurrency = priceObj.currency;
          if (it.qty) {
            it.amount = priceObj.currency === 'KRW' ? Math.round(it.qty * priceObj.price) : parseFloat((it.qty * priceObj.price).toFixed(2));
          }
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

  const copySourcingItem = (indexInMain: number) => {
    setSourcingItems(prev => {
      const target = prev[indexInMain];
      if (!target) return prev;
      const newItem = JSON.parse(JSON.stringify(target));
      const newItems = [...prev];
      newItems.splice(indexInMain + 1, 0, newItem);
      const cleaned = newItems.map((x, idx) => ({ ...x, itemId: (idx + 1).toString() }));
      if (order) {
        const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
        setDoc(orderRef, { sourcingItems: cleaned, updatedAt: serverTimestamp() }, { merge: true })
          .catch(e => console.error("Failed to save sourcingItems copy:", e));
      }
      return cleaned;
    });
  };

  const copyStep1Item = (index: number) => {
    let cleanedItems: any[] = [];
    setOrderItems(prev => {
      const target = prev[index];
      if (!target) return prev;
      const newItem = JSON.parse(JSON.stringify(target));
      const newItems = [...prev];
      newItems.splice(index + 1, 0, newItem);
      cleanedItems = newItems.map((x, idx) => ({ ...x, lineNumber: idx + 1 }));
      return cleanedItems;
    });
    if (order && cleanedItems.length > 0) {
      const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
      setDoc(orderRef, { items: cleanedItems, updatedAt: serverTimestamp() }, { merge: true })
        .catch(e => console.error("Failed to save orderItems copy:", e));
    }
  };

  const step1DraggedIndexRef = useRef<number | null>(null);
  const [step1DragOverIndex, setStep1DragOverIndex] = useState<number | null>(null);

  const handleStep1NoChange = (index: number, val: string) => {
    setOrderItems(prev => {
      const list = [...prev];
      list[index] = { ...list[index], lineNumber: val };
      return list;
    });
  };

  const handleStep1DragStart = (e: React.DragEvent, index: number) => {
    step1DraggedIndexRef.current = index;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleStep1DragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (step1DragOverIndex !== index) setStep1DragOverIndex(index);
  };

  const handleStep1DragLeave = () => {
    setStep1DragOverIndex(null);
  };

  const handleStep1Drop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    setStep1DragOverIndex(null);
    const sourceIndex = step1DraggedIndexRef.current;
    if (sourceIndex === null || sourceIndex === targetIndex) return;

    let cleanedItems: any[] = [];
    setOrderItems(prev => {
      const newItems = [...prev];
      const [movedItem] = newItems.splice(sourceIndex, 1);
      newItems.splice(targetIndex, 0, movedItem);
      cleanedItems = newItems.map((it, idx) => ({ ...it, lineNumber: idx + 1 }));
      return cleanedItems;
    });

    if (order && cleanedItems.length > 0) {
      const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
      setDoc(orderRef, { items: cleanedItems, updatedAt: serverTimestamp() }, { merge: true })
        .catch(e => console.error("Failed to save orderItems order:", e));
    }
    step1DraggedIndexRef.current = null;
  };

  const sourcingDraggedIndexRef = useRef<number | null>(null);
  const [sourcingDragOverIndex, setSourcingDragOverIndex] = useState<number | null>(null);

  const handleSourcingDragStart = (e: React.DragEvent, itemIndexInMain: number) => {
    sourcingDraggedIndexRef.current = itemIndexInMain;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(itemIndexInMain));
  };

  const handleSourcingDragOver = (e: React.DragEvent, itemIndexInMain: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (sourcingDragOverIndex !== itemIndexInMain) setSourcingDragOverIndex(itemIndexInMain);
  };

  const handleSourcingDragLeave = () => {
    setSourcingDragOverIndex(null);
  };

  const handleSourcingDrop = (e: React.DragEvent, targetIndexInMain: number) => {
    e.preventDefault();
    setSourcingDragOverIndex(null);
    const sourceIndexInMain = sourcingDraggedIndexRef.current;
    if (sourceIndexInMain === null || sourceIndexInMain === targetIndexInMain) return;

    let cleaned: any[] = [];
    setSourcingItems(prev => {
      const sourceItem = prev[sourceIndexInMain];
      const targetItem = prev[targetIndexInMain];
      if (!sourceItem || !targetItem) return prev;
      if (sourceItem.supplier !== targetItem.supplier) return prev;

      const newItems = [...prev];
      const [movedItem] = newItems.splice(sourceIndexInMain, 1);
      newItems.splice(targetIndexInMain, 0, movedItem);
      cleaned = newItems.map((x, idx) => ({ ...x, itemId: (idx + 1).toString() }));
      return cleaned;
    });

    if (order && cleaned.length > 0) {
      const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
      setDoc(orderRef, { sourcingItems: cleaned, updatedAt: serverTimestamp() }, { merge: true })
        .catch(e => console.error("Failed to save sourcingItems order:", e));
    }
    sourcingDraggedIndexRef.current = null;
  };

  const moveStep1Item = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === orderItems.length - 1) return;
    
    // 1. Swap orderItems
    let cleanedItems: any[] = [];
    setOrderItems(prev => {
      const newItems = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      const temp = newItems[index];
      newItems[index] = newItems[targetIndex];
      newItems[targetIndex] = temp;
      cleanedItems = newItems.map((x, idx) => ({ ...x, itemId: (idx + 1).toString() }));
      return cleanedItems;
    });

    // 2. Swap sourcingItems
    setSourcingItems(prev => {
      const newItems = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (newItems[index] && newItems[targetIndex]) {
        const temp = newItems[index];
        newItems[index] = newItems[targetIndex];
        newItems[targetIndex] = temp;
      }
      const cleanedSourcing = newItems.map((x, idx) => ({ ...x, itemId: (idx + 1).toString() }));
      
      // Save changes immediately to Firestore
      if (order) {
        const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
        setDoc(orderRef, { 
          items: cleanedItems, 
          sourcingItems: cleanedSourcing, 
          updatedAt: serverTimestamp() 
        }, { merge: true }).catch(e => console.error("Failed to save step1 items order:", e));
      }
      return cleanedSourcing;
    });
  };

  const moveStep2Item = (containerIdx: number, itemIdx: number, direction: 'up' | 'down') => {
    const nextContainers = [...basicForm.packingList.containers];
    const items = nextContainers[containerIdx].items || [];
    if (direction === 'up' && itemIdx === 0) return;
    if (direction === 'down' && itemIdx === items.length - 1) return;
    
    const targetIdx = direction === 'up' ? itemIdx - 1 : itemIdx + 1;
    const temp = items[itemIdx];
    items[itemIdx] = items[targetIdx];
    items[targetIdx] = temp;
    
    nextContainers[containerIdx].items = items;
    setBasicForm(prev => ({ ...prev, packingList: { ...prev.packingList, containers: nextContainers } }));
  };

  const handleSelectSourcingProduct = (idx: number, prod: Product) => {
    setSourcingItems(prev => {
      const updated = [...prev];
      const contactInfo = [prod.supplierEmail, prod.supplierPhone].filter(Boolean).join(' / ');
      
      let supName = prod.supplierName || '';
      if (prod.suppliers && prod.suppliers.length > 0) {
        const def = prod.suppliers.find(s => s.isDefault);
        if (def) {
          supName = def.supplierName;
        }
      }

      const priceObj = getPriceForSupplier(prod, supName);
      let buyPrice = priceObj.price;
      let itemCurrency = priceObj.currency;

      const qty = updated[idx].qty || 0;
      const amt = itemCurrency === 'KRW' ? Math.round(qty * buyPrice) : parseFloat((qty * buyPrice).toFixed(2));

      const displayName = prod.nameEn || prod.nameKo || '';

      updated[idx] = {
        ...updated[idx],
        name: `[${prod.productCode}] ${displayName}`,
        supplier: supName,
        supplierContact: contactInfo || '',
        grade: prod.spec || '',
        unit: (prod.unit || 'kg') as any,
        unitPrice: buyPrice,
        currency: itemCurrency,
        amount: amt,
        purchaseUnitPrice: buyPrice,
        purchaseUnitCurrency: itemCurrency
      };
      return updated;
    });
  };

  const handleSelectProduct = (idx: number, prod: Product) => {
    setOrderItems(prev => {
      const updated = [...prev];
      const contactInfo = [prod.supplierEmail, prod.supplierPhone].filter(Boolean).join(' / ');
      
      let supName = prod.supplierName || '';
      if (prod.suppliers && prod.suppliers.length > 0) {
        const def = prod.suppliers.find(s => s.isDefault);
        if (def) {
          supName = def.supplierName;
        }
      }

      const priceObj = getPriceForSupplier(prod, supName);
      let buyPrice = priceObj.price;
      let itemCurrency = priceObj.currency;

      const qty = updated[idx].qty || 0;
      const amt = itemCurrency === 'KRW' ? Math.round(qty * buyPrice) : parseFloat((qty * buyPrice).toFixed(2));

      const displayName = prod.nameEn || prod.nameKo || '';

      const targetItem = {
        ...updated[idx],
        name: `[${prod.productCode}] ${displayName}`,
        supplier: supName,
        supplierContact: contactInfo || '',
        grade: prod.spec || '',
        unit: (prod.unit || 'kg') as any,
        unitPrice: buyPrice,
        currency: itemCurrency,
        amount: amt,
        purchaseUnitPrice: buyPrice,
        purchaseUnitCurrency: itemCurrency
      };
      updated[idx] = targetItem;

      // 동기화: 수주 품목 정보 변경 시, 소싱/발주 탭(sourcingItems)에도 실시간 반영
      setSourcingItems(sourcingPrev => {
        const sourcingUpdated = [...sourcingPrev];
        if (sourcingUpdated[idx]) {
          sourcingUpdated[idx] = {
            ...sourcingUpdated[idx],
            name: targetItem.name,
            qty: targetItem.qty,
            unit: targetItem.unit,
            supplier: targetItem.supplier,
            supplierContact: targetItem.supplierContact,
            grade: targetItem.grade,
            purchaseUnitPrice: targetItem.purchaseUnitPrice,
            purchaseUnitCurrency: targetItem.purchaseUnitCurrency,
            amount: targetItem.amount,
            currency: targetItem.currency
          };
        }
        return sourcingUpdated;
      });

      return updated;
    });
  };

  const addItemRow = () => {
    const newItem = { itemId: (orderItems.length + 1).toString(), name: '', supplier: '', supplierContact: '', grade: '', qty: 0, unit: 'kg', unitPrice: 0, amount: 0, currency: 'USD' as const };
    setOrderItems(prev => [...prev, newItem]);
    setSourcingItems(prev => [...prev, newItem]);
  };

  const removeItemRow = (index: number) => {
    if (orderItems.length === 1) return;
    setOrderItems(prev => prev.filter((_, idx) => idx !== index).map((it, idx) => ({ ...it, itemId: (idx + 1).toString() })));
    setSourcingItems(prev => prev.filter((_, idx) => idx !== index).map((it, idx) => ({ ...it, itemId: (idx + 1).toString() })));
  };

  const handleForwarderChange = (index: number, field: keyof ForwarderEntry, value: any) => {
    console.log("[DEBUG] handleForwarderChange called:", index, field, value);
    setForwardersList(prev => {
      const next = prev.map((f, i) => {
        if (i === index) {
          const updated = { ...f, [field]: value };
          if (field === 'amountKrw') {
            updated.amountVatKrw = Math.round(Number(value) * 0.1);
          }
          return updated;
        }
        return f;
      });
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
  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>, fieldName: 'poFiles' | 'lcFiles' | 'scFiles' | 'ciFiles' | 'plFiles' | 'cooFiles' | 'blFiles' | 'exportDeclarationFiles' | 'coaFiles' | 'otherFiles' | 'containerWorkFiles' | 'transportationFiles' | 'transactionFiles' | 'attachments') => {
    const files = e.target.files;
    if (!files || files.length === 0 || !order) return;
    
    setUploadingField(fieldName);

    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        const uniqueFileName = `${Date.now()}_${file.name}`;
        const storageRef = ref(storage, `tasks/${order.id}/${uniqueFileName}`);
        const uploadTask = uploadBytesResumable(storageRef, file);
        
        return new Promise<{ name: string; url: string; size: number; path: string }>((resolve, reject) => {
          uploadTask.on('state_changed',
            () => {},
            (error) => reject(error),
            async () => {
              try {
                const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
                resolve({
                  name: file.name,
                  url: downloadUrl,
                  size: file.size,
                  path: uploadTask.snapshot.ref.fullPath
                });
              } catch (err) {
                reject(err);
              }
            }
          );
        });
      });

      const uploadedFiles = await Promise.all(uploadPromises);
      const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
      const updatedList = [...(order[fieldName] || []), ...uploadedFiles];
      await setDoc(orderRef, { [fieldName]: updatedList, updatedAt: serverTimestamp() }, { merge: true });
      await autoRegisterOrderTask(order.piNumber || '알수없음', order.customer || '알수없음', `${fieldName} 파일 첨부 업로드: ${uploadedFiles.map(f => f.name).join(', ')}`);
      
      alert("✅ 모든 파일이 성공적으로 업로드되었습니다.");
    } catch (err: any) {
      console.error("Upload failed", err);
      alert("업로드 중 에러가 발생했습니다: " + err.message);
    } finally {
      setUploadingField(null);
    }
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

  const handleSupplierCoaUpload = async (e: React.ChangeEvent<HTMLInputElement>, supplierName: string) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !order) return;
    
    setUploadingCoaSupplier(supplierName);
    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        const uniqueFileName = `${Date.now()}_${file.name}`;
        const storageRef = ref(storage, `tasks/${order.id}/coa_${supplierName}/${uniqueFileName}`);
        const uploadTask = uploadBytesResumable(storageRef, file);
        
        return new Promise<{ name: string; url: string; size: number; path: string }>((resolve, reject) => {
          uploadTask.on('state_changed', null, reject, async () => {
            try {
              const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
              resolve({
                name: file.name,
                url: downloadUrl,
                size: file.size,
                path: uploadTask.snapshot.ref.fullPath
              });
            } catch (err) {
              reject(err);
            }
          });
        });
      });

      const uploadedFiles = await Promise.all(uploadPromises);
      const currentCoaFiles = order.coaFilesBySupplier || {};
      const updatedList = [...(currentCoaFiles[supplierName] || []), ...uploadedFiles];
      const updatedCoaFiles = {
        ...currentCoaFiles,
        [supplierName]: updatedList
      };

      const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
      await setDoc(orderRef, { coaFilesBySupplier: updatedCoaFiles, updatedAt: serverTimestamp() }, { merge: true });
      await autoRegisterOrderTask(order.piNumber || '알수없음', order.customer || '알수없음', `매입처(${supplierName}) COA 파일 첨부 업로드: ${uploadedFiles.map(f => f.name).join(', ')}`);
      
      alert("✅ 모든 COA 파일이 성공적으로 업로드되었습니다.");
    } catch (err: any) {
      console.error("Upload failed", err);
      alert("업로드 중 에러가 발생했습니다: " + err.message);
    } finally {
      setUploadingCoaSupplier(null);
    }
  };

  const handleSupplierCoaDelete = async (supplierName: string, fileIdx: number, fileName: string) => {
    if (!order || !window.confirm(`'${fileName}' 파일을 삭제하시겠습니까?`)) return;
    try {
      const currentCoaFiles = order.coaFilesBySupplier || {};
      const nextList = (currentCoaFiles[supplierName] || []).filter((_: any, i: number) => i !== fileIdx);
      const updatedCoaFiles = {
        ...currentCoaFiles,
        [supplierName]: nextList
      };

      const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
      await setDoc(orderRef, { coaFilesBySupplier: updatedCoaFiles, updatedAt: serverTimestamp() }, { merge: true });
      await autoRegisterOrderTask(order.piNumber || '알수없음', order.customer || '알수없음', `매입처(${supplierName}) COA 파일 삭제: ${fileName}`);
    } catch (err: any) {
      alert("삭제 실패: " + err.message);
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

      const cleanSourcingItems = sourcingItems.map(it => ({
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
      }));

      const cleanItems = (order.items || []).map(it => {
        const matched = sourcingItems.find(x => x.itemId === it.itemId);
        if (matched) {
          return {
            ...it,
            purchaseUnitPrice: matched.purchaseUnitPrice != null ? (parseFloat(matched.purchaseUnitPrice as any) || 0) : null,
            purchaseUnitCurrency: matched.purchaseUnitCurrency || null,
            originalPurchasePrice: matched.originalPurchasePrice != null ? (parseFloat(matched.originalPurchasePrice as any) || 0) : null,
            originalPurchaseCurrency: matched.originalPurchaseCurrency || null,
          };
        }
        return it;
      });

      const cleanUndefined = (obj: any): any => {
        if (obj === null || obj === undefined) return obj;
        if (Array.isArray(obj)) return obj.map(cleanUndefined);
        if (typeof obj === 'object') {
          if (obj.constructor && (obj.constructor.name.includes('FieldValue') || obj.constructor.name === 'Date')) {
            return obj;
          }
          if (obj.constructor && obj.constructor.name !== 'Object') {
            return obj;
          }
          const clean: any = {};
          for (const key of Object.keys(obj)) {
            if (obj[key] !== undefined) {
              clean[key] = cleanUndefined(obj[key]);
            }
          }
          return clean;
        }
        return obj;
      };

      const payload = cleanUndefined({
        supplierPoDetails: updatedPoDetails,
        sourcingItems: cleanSourcingItems,
        items: cleanItems,
        updatedAt: serverTimestamp()
      });

      await setDoc(orderRef, payload, { merge: true });

      alert(`✅ [${supplierName}]의 수정한 발주 조건 및 내역이 성공적으로 저장되었습니다.`);
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
  const handleDeleteDoc = async (fieldName: 'poFiles' | 'lcFiles' | 'scFiles' | 'ciFiles' | 'plFiles' | 'cooFiles' | 'blFiles' | 'exportDeclarationFiles' | 'coaFiles' | 'otherFiles' | 'containerWorkFiles' | 'transportationFiles' | 'transactionFiles' | 'attachments', idx: number) => {
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
    fieldName: 'poFiles' | 'lcFiles' | 'scFiles' | 'ciFiles' | 'plFiles' | 'cooFiles' | 'blFiles' | 'exportDeclarationFiles' | 'coaFiles' | 'otherFiles' | 'containerWorkFiles' | 'transportationFiles' | 'transactionFiles' | 'attachments',
    inputDocId: string,
    gridSpan?: string
  ) => {
    const fileList = order?.[fieldName] || [];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', border: '1px dashed var(--border-default)', borderRadius: '6px', padding: '8px 10px', background: '#f8fafc', boxSizing: 'border-box', gridColumn: gridSpan || 'span 1' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>{label} {fileList.length > 0 && <span style={{ color: '#10b981', marginLeft: '4px' }}>✅</span>}</span>
        </div>
        {isEditing && (
          <div
            tabIndex={0}
            style={{
              background: '#f8fafc',
              border: '1px dashed #cbd5e1',
              padding: '6px 10px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '6px',
              cursor: uploadingField === fieldName ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              outline: 'none',
              height: '34px',
              boxSizing: 'border-box'
            }}
            onFocus={e => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.background = '#eff6ff'; }}
            onBlur={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#f8fafc'; }}
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.background = '#eff6ff'; }}
            onDragLeave={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.background = '#f8fafc'; }}
            onDrop={e => {
              e.preventDefault();
              e.currentTarget.style.borderColor = '#cbd5e1';
              e.currentTarget.style.background = '#f8fafc';
              if (uploadingField !== null) return;
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const fakeEvent = { target: { files: e.dataTransfer.files } } as any;
                handleDocUpload(fakeEvent, fieldName);
              }
            }}
            onPaste={async e => {
              const clipboardItems = e.clipboardData.items;
              const filesToUpload: File[] = [];
              for (let i = 0; i < clipboardItems.length; i++) {
                if (clipboardItems[i].type.indexOf('image') !== -1) {
                  const file = clipboardItems[i].getAsFile();
                  if (file) {
                    e.preventDefault();
                    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                    const timeStr = new Date().toTimeString().split(' ')[0].replace(/:/g, '');
                    const renamedFile = new File(
                      [file],
                      `screenshot_${dateStr}_${timeStr}.png`,
                      { type: file.type }
                    );
                    filesToUpload.push(renamedFile);
                  }
                }
              }
              if (filesToUpload.length > 0) {
                const fakeEvent = { target: { files: filesToUpload } } as any;
                handleDocUpload(fakeEvent, fieldName);
              }
            }}
            onClick={() => {
              if (uploadingField !== fieldName) {
                document.getElementById(inputDocId)?.click();
              }
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#64748b', fontWeight: 500 }}>
              <span>📂</span>
              <span style={{ fontSize: '11px' }}>파일 드래그 또는 클릭</span>
            </div>
            
            <button
              type="button"
              disabled={uploadingField !== null}
              style={{
                background: '#3b82f6',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'background 0.2s',
                height: '24px',
                boxSizing: 'border-box'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#2563eb'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#3b82f6'; }}
            >
              {uploadingField === fieldName ? '...' : '선택'}
            </button>

            <input
              type="file"
              id={inputDocId}
              style={{ display: 'none' }}
              onChange={(e) => handleDocUpload(e, fieldName)}
              disabled={uploadingField !== null}
              multiple
            />
          </div>
        )}
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
          {fileList.length > 0 ? (
            fileList.map((file, idx) => {
              const nameLower = file.name.toLowerCase();
              const isImg = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(nameLower);
              const isPdf = /\.pdf$/i.test(nameLower);
              const isExcel = /\.(xls|xlsx)$/i.test(nameLower);

              return (
                <div 
                  key={idx} 
                  style={{ 
                    background: '#fff', 
                    border: '1px solid var(--border-default)', 
                    borderRadius: '8px', 
                    padding: '6px 10px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '10px', 
                    fontSize: '12px', 
                    boxShadow: '0 2px 4px rgba(0,0,0,0.04)',
                    boxSizing: 'border-box'
                  }}
                >
                  {/* Thumbnail / Icon */}
                  <div 
                    onClick={() => previewFile(file.url, file.name)}
                    style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                    title="클릭하여 미리보기"
                  >
                    {isImg ? (
                      <img 
                        src={file.url} 
                        alt={file.name} 
                        style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border-default)' }} 
                      />
                    ) : (
                      <span style={{ fontSize: '20px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', borderRadius: '4px', border: '1px solid var(--border-default)' }}>
                        {isPdf ? '📄' : isExcel ? '📊' : '📎'}
                      </span>
                    )}
                  </div>

                  {/* Name and size */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left' }}>
                    <span 
                      onClick={() => previewFile(file.url, file.name)}
                      style={{ color: 'var(--text-primary)', fontWeight: 600, textDecoration: 'none', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                      title="클릭하여 미리보기"
                    >
                      {file.name}
                    </span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>({(file.size / 1024).toFixed(1)}KB)</span>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: '4px', marginLeft: '4px' }}>
                    <button 
                      type="button" 
                      onClick={() => previewFile(file.url, file.name)}
                      style={{ background: '#f1f5f9', color: 'var(--text-secondary)', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '4px 6px', fontSize: '11px', fontWeight: 'bold' }}
                      title="미리보기"
                    >
                      🔍
                    </button>
                    {isEditing && (
                      <button 
                        type="button" 
                        onClick={() => handleDeleteDoc(fieldName, idx)} 
                        style={{ background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '4px 6px', fontSize: '11px', fontWeight: 'bold' }}
                        title="삭제"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            !isEditing && <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>첨부 파일 없음</span>
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
    const poNum = `${order.ciNumber || order.id}-${supplierCode}`;

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

    let managerTitle = '대표이사';
    let managerName = '김 주 한';
    let managerContact = '010-4494-1028';

    try {
      const currentUid = auth.currentUser?.uid;
      if (currentUid) {
        const userDoc = await getDoc(doc(db, 'users', currentUid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData.position) managerTitle = userData.position;
          if (userData.name) {
            const n = userData.name.trim();
            if (n.length === 3) {
              managerName = `${n[0]} ${n[1]} ${n[2]}`;
            } else {
              managerName = n;
            }
          }
          if (userData.phone) managerContact = userData.phone;
        }
      }
    } catch (e) {
      console.error("Failed to load user info for PO print", e);
    }

    const poDetails = basicForm.supplierPoDetails?.[supplierName] || {};
    const reqDateText = basicForm.requestedDelivery || poDetails.requestDate || '추후 안내 예정';
    const delPlaceText = basicForm.deliveryPlace || poDetails.deliveryPlace || '추후 통보예정';



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
                <th style="width: 50px;">No.</th>
                <th style="width: 250px;">품 명</th>
                <th style="width: 120px;">스 펙</th>
                <th style="width: 60px;">수량</th>
                <th style="width: 80px;">단 가</th>
                <th style="width: 100px;">금 액</th>
                <th style="width: 90px;">부가세</th>
                <th>비 고</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((it, idx) => {
                const { purchasePrice, purchaseCurrency, itemName } = getSupplierPurchaseInfo(it);
                const isKrw = purchaseCurrency === 'KRW';
                const currencySymbol = isKrw ? '₩' : '$';
                const rawAmt = purchasePrice * (it.qty || 0);
                const vatAmt = taxType === '영세' ? 0 : (isKrw ? Math.round(rawAmt * 0.1) : parseFloat((rawAmt * 0.1).toFixed(2)));
                return `
                  <tr>
                    <td class="center">${idx + 1}</td>
                    <td><strong>${itemName}</strong></td>
                    <td class="center">${it.grade || '-'}</td>
                    <td class="right">${(it.qty || 0).toLocaleString()}</td>
                    <td class="right">${currencySymbol}${purchasePrice.toLocaleString(undefined, isKrw ? {} : { minimumFractionDigits: 2 })}</td>
                    <td class="right">${currencySymbol}${rawAmt.toLocaleString(undefined, isKrw ? {} : { minimumFractionDigits: 2 })}</td>
                    <td class="right">${currencySymbol}${vatAmt.toLocaleString(undefined, isKrw ? {} : { minimumFractionDigits: 2 })}</td>
                    <td style="font-size: 10px; color: var(--text-secondary);">${it.unit} 발주</td>
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
                  <td class="value">${managerTitle}</td>
                </tr>
                <tr>
                  <td class="label">성 명</td>
                  <td class="value">${managerName}</td>
                </tr>
                <tr>
                  <td class="label">연락처</td>
                  <td class="value">${managerContact}</td>
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
      const cleanSourcingItems = sourcingItems.map(it => ({
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
      }));

      const cleanItems = (order.items || []).map(it => {
        const matched = sourcingItems.find(x => x.itemId === it.itemId);
        if (matched) {
          return {
            ...it,
            purchaseUnitPrice: matched.purchaseUnitPrice != null ? (parseFloat(matched.purchaseUnitPrice as any) || 0) : null,
            purchaseUnitCurrency: matched.purchaseUnitCurrency || null,
            originalPurchasePrice: matched.originalPurchasePrice != null ? (parseFloat(matched.originalPurchasePrice as any) || 0) : null,
            originalPurchaseCurrency: matched.originalPurchaseCurrency || null,
          };
        }
        return it;
      });

      const cleanUndefined = (obj: any): any => {
        if (obj === null || obj === undefined) return obj;
        if (Array.isArray(obj)) return obj.map(cleanUndefined);
        if (typeof obj === 'object') {
          if (obj.constructor && (obj.constructor.name.includes('FieldValue') || obj.constructor.name === 'Date')) {
            return obj;
          }
          if (obj.constructor && obj.constructor.name !== 'Object') {
            return obj;
          }
          const clean: any = {};
          for (const key of Object.keys(obj)) {
            if (obj[key] !== undefined) {
              clean[key] = cleanUndefined(obj[key]);
            }
          }
          return clean;
        }
        return obj;
      };

      const payload = cleanUndefined({
        supplierPoDetails: updatedPoDetails,
        sourcingItems: cleanSourcingItems,
        items: cleanItems,
        updatedAt: serverTimestamp()
      });

      await setDoc(orderRef, payload, { merge: true });
    } catch (e) {
      console.warn("Failed to auto-save supplier PO details on issue:", e);
    }
    const taxType = basicForm.supplierTaxTypes[supplierName] || '과세';
    const cleanSupplierName = supplierName.replace(/\s+/g, '');
    const supplierCode = cleanSupplierName.substring(0, 3).toUpperCase();
    const poNum = `${order.ciNumber || order.id}-${supplierCode}`;

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

    let managerTitle = '대표이사';
    let managerName = '김 주 한';
    let managerContact = '010-4494-1028';

    try {
      const currentUid = auth.currentUser?.uid;
      if (currentUid) {
        const userDoc = await getDoc(doc(db, 'users', currentUid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData.position) managerTitle = userData.position;
          if (userData.name) {
            const n = userData.name.trim();
            if (n.length === 3) {
              managerName = `${n[0]} ${n[1]} ${n[2]}`;
            } else {
              managerName = n;
            }
          }
          if (userData.phone) managerContact = userData.phone;
        }
      }
    } catch (e) {
      console.error("Failed to load user info for PO issue", e);
    }

    const poDetails = basicForm.supplierPoDetails?.[supplierName] || {};
    const reqDateText = basicForm.requestedDelivery || poDetails.requestDate || '추후 안내 예정';
    const delPlaceText = basicForm.deliveryPlace || poDetails.deliveryPlace || '추후 통보예정';



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
                <th style="width: 50px;">No.</th>
                <th style="width: 250px;">품 명</th>
                <th style="width: 120px;">스 펙</th>
                <th style="width: 60px;">수량</th>
                <th style="width: 80px;">단 가</th>
                <th style="width: 100px;">금 액</th>
                <th style="width: 90px;">부가세</th>
                <th>비 고</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((it, idx) => {
                const { purchasePrice, purchaseCurrency, itemName } = getSupplierPurchaseInfo(it);
                const isKrw = purchaseCurrency === 'KRW';
                const currencySymbol = isKrw ? '₩' : '$';
                const rawAmt = purchasePrice * (it.qty || 0);
                const vatAmt = taxType === '영세' ? 0 : (isKrw ? Math.round(rawAmt * 0.1) : parseFloat((rawAmt * 0.1).toFixed(2)));
                return `
                  <tr>
                    <td class="center">${idx + 1}</td>
                    <td><strong>${itemName}</strong></td>
                    <td class="center">${it.grade || '-'}</td>
                    <td class="right">${(it.qty || 0).toLocaleString()}</td>
                    <td class="right">${currencySymbol}${purchasePrice.toLocaleString(undefined, isKrw ? {} : { minimumFractionDigits: 2 })}</td>
                    <td class="right">${currencySymbol}${rawAmt.toLocaleString(undefined, isKrw ? {} : { minimumFractionDigits: 2 })}</td>
                    <td class="right">${currencySymbol}${vatAmt.toLocaleString(undefined, isKrw ? {} : { minimumFractionDigits: 2 })}</td>
                    <td style="font-size: 10px; color: var(--text-secondary);">${it.unit} 발주</td>
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
                  <td class="value">${managerTitle}</td>
                </tr>
                <tr>
                  <td class="label">성 명</td>
                  <td class="value">${managerName}</td>
                </tr>
                <tr>
                  <td class="label">연락처</td>
                  <td class="value">${managerContact}</td>
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
      const dateObj = new Date();
      const yy = String(dateObj.getFullYear()).substring(2);
      const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
      const dd = String(dateObj.getDate()).padStart(2, '0');
      const dateStr = `${yy}${mm}${dd}`;
      const cleanCi = order.ciNumber || order.id;
      const safeFileName = `${supplierName}(${cleanCi})_${dateStr}.pdf`;
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

  // 발주서 이메일 수동 발송 (Brevo Direct REST API)
  
  const handleCopyKatalkPoMessage = (supplierName: string, items: OrderItem[]) => {
    if (!order) return;

    try {
      const cleanSupplierName = supplierName.replace(/\s+/g, '');
      const supplierCode = cleanSupplierName.substring(0, 3).toUpperCase();
      const poNum = `${order.ciNumber || order.id}-${supplierCode}`;

      const targetSupplier = suppliersList.find(s => s.name === supplierName);
      const supplierEmail = targetSupplier?.purchaseEmail || '미지정';

      const latestDoc = issuedDocs.find(d => d.status === 'active' && (d.supplier_name === supplierName || d.po_number.includes(supplierCode)));
      const pdfUrl = latestDoc?.fileUrl || '';

      const itemsText = items.map(it => {
        const spec = (it as any).grade ? ` ${(it as any).grade}` : '';
        return `• [${it.name}${spec}] ${it.name || ''} (${(it.qty || 0).toLocaleString()}${it.unit || 'EA'})`;
      }).join('\n');

      const totalAmt = items.reduce((sum, it) => {
        const price = (it as any).purchaseUnitPrice != null ? (it as any).purchaseUnitPrice : it.unitPrice;
        return sum + (price || 0) * (it.qty || 0);
      }, 0);
      const formattedAmt = totalAmt > 0 ? `₩${Math.round(totalAmt).toLocaleString()} (VAT포함)` : '₩0 (VAT포함)';

      const senderName = userProfile?.name || '김주한';
      const senderRank = userProfile?.role === 'admin' ? '대표이사' : (userProfile?.role || '담당');
      const senderPhone = userProfile?.phone || '010-7361-1130';
      const senderInfo = `${senderName} ${senderRank} (${senderPhone})`;

      const isYS = (order?.issuingCompany || basicForm?.issuingCompany) === 'YS';
      const companyTitleName = isYS ? '영성ACC' : '(주)와이에스에이씨씨';

      const now = new Date();
      const dateFormatted = now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' })
        + '. ' + now.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: 'numeric', hour12: true });

      const ccEmails = ['alexpark@ysacc.co.kr', 'jhk010624@ysacc.co.kr', 'jhkim1130@ysacc.co.kr'];

      const msg = `[${companyTitleName} 발주서 발행 및 메일전송 알림]
------------------------------------
▪ 발주번호: ${poNum}
▪ 공급업체: ${supplierName}
▪ 발주품목:
${itemsText}
▪ 발주금액: ${formattedAmt}
------------------------------------
▪ 발신담당: ${senderInfo}
▪ 수신(TO): ${supplierEmail}
▪ 참조(CC): ${ccEmails.join(', ')}
▪ 발행일시: ${dateFormatted}
------------------------------------
📄 발주서 PDF 원본 다운로드:
${pdfUrl || '(발행된 발주서 PDF가 없습니다. 먼저 발주서를 발행 및 저장해 주세요.)'}`;

      setKatalkModalSupplier(supplierName);
      setKatalkModalMsg(msg);
    } catch (e) {
      console.error(e);
      alert('오류가 발생했습니다.');
    }
  };

  const handleSendPoEmail = async (supplierName: string, items: OrderItem[]) => {
    if (!order) return;

    const isYS = (order?.issuingCompany || basicForm?.issuingCompany) === 'YS';
    const companyTitleName = isYS ? '영성ACC' : '(주)와이에스에이씨씨';

    const targetSupplier = suppliersList.find(s => s.name === supplierName);
    const supplierEmail = targetSupplier?.purchaseEmail || '';

    const cleanSupplierName = supplierName.replace(/\s+/g, '');
    const supplierCode = cleanSupplierName.substring(0, 3).toUpperCase();
    const poNum = `${order.ciNumber || order.id}-${supplierCode}`;

    const latestDoc = issuedDocs.find(d => d.status === 'active' && (d.supplier_name === supplierName || d.po_number.includes(supplierCode)));
    const pdfUrl = latestDoc?.fileUrl || '';

    const itemsText = items.map(it => {
      const spec = (it as any).grade ? ` ${(it as any).grade}` : '';
      return `• [${it.name}${spec}] (${(it.qty || 0).toLocaleString()}${it.unit || 'EA'})`;
    }).join('\n');

    const totalAmt = items.reduce((sum, it) => {
      const price = (it as any).purchaseUnitPrice != null ? (it as any).purchaseUnitPrice : it.unitPrice;
      return sum + (price || 0) * (it.qty || 0);
    }, 0);
    const formattedAmt = totalAmt > 0 ? `₩${Math.round(totalAmt).toLocaleString()} (VAT포함)` : '₩0 (VAT포함)';

    const senderName = userProfile?.name || '김주한';
    const senderRank = userProfile?.role === 'admin' ? '대표이사' : (userProfile?.role || '담당');
    const senderPhone = userProfile?.phone || '010-7361-1130';
    const senderInfo = `${senderName} ${senderRank} (${senderPhone})`;

    const now = new Date();
    const dateFormatted = now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' })
      + '. ' + now.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: 'numeric', hour12: true });

    const defaultCc = 'alexpark@ysacc.co.kr, jhk010624@ysacc.co.kr, jhkim1130@ysacc.co.kr';
    const subject = `[${companyTitleName} 발주서 발행 알림] ${poNum} - ${supplierName}`;
    const textContent = `[${companyTitleName} 발주서 발행 및 메일전송 알림]\n------------------------------------\n▪ 발주번호: ${poNum}\n▪ 공급업체: ${supplierName}\n▪ 발주품목:\n${itemsText}\n▪ 발주금액: ${formattedAmt}\n------------------------------------\n▪ 발신담당: ${senderInfo}\n▪ 수신(TO): ${supplierEmail || '미지정'}\n▪ 참조(CC): ${defaultCc}\n▪ 발행일시: ${dateFormatted}\n------------------------------------\n📄 발주서 PDF 원본 다운로드:\n${pdfUrl || '(발행된 발주서가 없습니다. 먼저 발주서를 발행해 주세요.)'}`;

    setPoEmailModalData({
      supplierName,
      items,
      defaultToEmail: supplierEmail,
      defaultCcEmails: defaultCc,
      defaultSubject: subject,
      defaultContent: textContent,
      pdfUrl: pdfUrl
    });
  };

  const handleExecuteSendPoEmail = async (emailData: { to: string; cc: string; subject: string; content: string }) => {
    if (!poEmailModalData) return;
    const BREVO_KEY = (import.meta as any).env?.VITE_BREVO_API_KEY || localStorage.getItem('BREVO_API_KEY') || '';
    if (!BREVO_KEY) {
      alert('⚠️ Brevo API Key가 설정되지 않았습니다.');
      return;
    }

    try {
      const ccList = emailData.cc.split(',').map(e => e.trim()).filter(Boolean).map(e => ({ email: e }));
      const pdfUrl = poEmailModalData.pdfUrl;

      const htmlContent = `<div style="font-family: sans-serif; max-width: 640px; padding: 24px; border: 1px solid #cbd5e1; border-radius: 8px;"><h3 style="color: #1e3a8a; border-bottom: 2px solid #3b82f6; padding-bottom: 8px; margin-top: 0;">📋 YSACC 발주서 발행 알림</h3><pre style="font-family: sans-serif; font-size: 13px; line-height: 1.5; white-space: pre-wrap;">${emailData.content}</pre>${pdfUrl ? '<div style="margin-top: 12px; padding: 12px; background: #eff6ff; border-radius: 6px; border-left: 4px solid #3b82f6;"><p style="margin: 0 0 6px 0; font-weight: bold; color: #1e3a8a; font-size: 13px;">📄 발주서 PDF 원본 다운로드</p><a href="' + pdfUrl + '" style="color: #2563eb; word-break: break-all; font-size: 12px;">' + pdfUrl + '</a></div>' : ''}</div>`;

      const senderEmail = userProfile?.email || 'jhkim1130@ysacc.co.kr';
      const senderName = `${userProfile?.name || '김주한'} ${(userProfile as any)?.rank || userProfile?.role || '대표이사'} (YSACC)`;

      const payload: any = {
        sender: { name: senderName, email: senderEmail },
        to: [{ email: emailData.to, name: poEmailModalData.supplierName }],
        cc: ccList.length > 0 ? ccList : undefined,
        subject: emailData.subject,
        htmlContent: htmlContent,
        textContent: emailData.content
      };

      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': BREVO_KEY,
          'content-type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        if (order?.id && poEmailModalData?.supplierName) {
          const supplierName = poEmailModalData.supplierName;
          const currentStatus = (order as any)?.po_dispatch_status || {};
          const supplierStatus = currentStatus[supplierName] || {};
          const updatedDispatchStatus = {
            ...currentStatus,
            [supplierName]: {
              ...supplierStatus,
              emailSent: true,
              emailSentAt: new Date().toISOString()
            }
          };

          const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
          await updateDoc(orderRef, {
            po_dispatch_status: updatedDispatchStatus
          }).catch(err => console.error('Failed to update po_dispatch_status emailSent', err));

          setOrder(prev => prev ? ({ ...prev, po_dispatch_status: updatedDispatchStatus }) : prev);
        }

        alert(`✅ [${poEmailModalData.supplierName}] 발주서 이메일 발송 완료!\n\n발신자: ${senderEmail}\n수신자: ${emailData.to}\n참조자: ${emailData.cc || '없음'}`);
        setSentEmailSuppliers(prev => ({ ...prev, [poEmailModalData.supplierName]: true }));
        setPoEmailModalData(null);
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error('Brevo Email Dispatch Failed:', res.status, errData);
        alert(`❌ 이메일 발송 실패 (상태 코드: ${res.status})\n\n원인: ${errData.message || errData.code || '알 수 없는 원인으로 전송이 거부되었습니다.'}\n발신자: ${senderEmail}`);
      }
    } catch (e: any) {
      alert(`❌ 메일 발송 중 오류가 발생했습니다: ${e.message}`);
    }
  };

  const handleSendArrivalShippingEmail = (supplierName: string) => {
    if (!order) return;
    const cleanSupplierName = supplierName.replace(/\s+/g, '');
    const supplierCode = cleanSupplierName.substring(0, 3).toUpperCase();
    const poNum = `${order.ciNumber || order.id}-${supplierCode}`;

    const activeDocs = issuedDocs.length > 0 ? issuedDocs : ((order as any)?.po_issued_documents || []);
    const arrivalDoc = activeDocs.find((d: any) => d.po_number === poNum && d.fileName.startsWith('도착보고서') && d.status === 'active')
      || activeDocs.filter((d: any) => d.po_number === poNum && d.fileName.startsWith('도착보고서')).slice(-1)[0];
    const shippingDoc = activeDocs.find((d: any) => d.po_number === poNum && d.fileName.startsWith('쉬핑마크라벨') && d.status === 'active')
      || activeDocs.filter((d: any) => d.po_number === poNum && d.fileName.startsWith('쉬핑마크라벨')).slice(-1)[0];

    const arrivalPdfUrl = arrivalDoc?.fileUrl || '';
    const shippingPdfUrl = shippingDoc?.fileUrl || '';

    const currentSender = `${userProfile?.name || '김주한'} ${(userProfile as any)?.rank || userProfile?.role || '대표이사'} (${userProfile?.phone || '010-7361-1130'})`;
    const isYS = (order?.issuingCompany || basicForm?.issuingCompany) === 'YS';
    const companyTitleName = isYS ? '영성ACC' : '(주)와이에스에이씨씨';

    const items = groupedSupplierItems[supplierName] || [];
    const toEmail = (order as any)?.supplier_emails?.[supplierName] || items[0]?.supplierContact || '';
    const defaultCc = 'alexpark@ysacc.co.kr, jhk010624@ysacc.co.kr, jhkim1130@ysacc.co.kr';

    let contentStr = `[${companyTitleName} 도착보고서 & 쉬핑마크 발행 및 메일전송 알림]\n------------------------------------\n▪ 발주번호: ${poNum}\n▪ 공급업체: ${supplierName}\n▪ 발행일시: ${new Date().toLocaleString('ko-KR')}\n------------------------------------\n▪ 발신담당: ${currentSender}\n▪ 수신(TO): ${toEmail || '미지정'}\n▪ 참조(CC): ${defaultCc}\n------------------------------------\n📄 도착보고서 PDF 원본 다운로드:\n${arrivalPdfUrl || '발행 예정 (클라우드 저장 후 생성)'}\n\n🏷️ 쉬핑마크 라벨 PDF 원본 다운로드:\n${shippingPdfUrl || '발행 예정 (클라우드 저장 후 생성)'}`;

    setPoEmailModalData({
      supplierName: `${supplierName}_arrival`,
      items,
      defaultToEmail: toEmail,
      defaultCcEmails: defaultCc,
      defaultSubject: `[${companyTitleName}] ${supplierName} 도착보고서 및 쉬핑마크 라벨 발행 알림 (${poNum})`,
      defaultContent: contentStr,
      pdfUrl: arrivalPdfUrl || shippingPdfUrl
    });
  };

  const handleCopyArrivalShippingKatalkMessage = (supplierName: string) => {
    if (!order) return;

    const isYS = (order?.issuingCompany || basicForm?.issuingCompany) === 'YS';
    const companyTitleName = isYS ? '영성ACC' : '(주)와이에스에이씨씨';

    const cleanSupplierName = supplierName.replace(/\s+/g, '');
    const supplierCode = cleanSupplierName.substring(0, 3).toUpperCase();
    const poNum = `${order.ciNumber || order.id}-${supplierCode}`;

    const activeDocs = issuedDocs.length > 0 ? issuedDocs : ((order as any)?.po_issued_documents || []);
    const arrivalDoc = activeDocs.find((d: any) => d.po_number === poNum && d.fileName.startsWith('도착보고서') && d.status === 'active')
      || activeDocs.filter((d: any) => d.po_number === poNum && d.fileName.startsWith('도착보고서')).slice(-1)[0];
    const shippingDoc = activeDocs.find((d: any) => d.po_number === poNum && d.fileName.startsWith('쉬핑마크라벨') && d.status === 'active')
      || activeDocs.filter((d: any) => d.po_number === poNum && d.fileName.startsWith('쉬핑마크라벨')).slice(-1)[0];

    const arrivalPdfUrl = arrivalDoc?.fileUrl || '';
    const shippingPdfUrl = shippingDoc?.fileUrl || '';

    const currentSender = `${userProfile?.name || '김주한'} ${(userProfile as any)?.rank || userProfile?.role || '대표이사'} (${userProfile?.phone || '010-7361-1130'})`;
    const items = groupedSupplierItems[supplierName] || [];
    const toEmail = (order as any)?.supplier_emails?.[supplierName] || items[0]?.supplierContact || '미지정';
    const defaultCc = 'alexpark@ysacc.co.kr, jhk010624@ysacc.co.kr, jhkim1130@ysacc.co.kr';

    const msg = `[${companyTitleName} 도착보고서 & 쉬핑마크 발행 및 카톡 공유 알림]\n------------------------------------\n▪ 발주번호: ${poNum}\n▪ 공급업체: ${supplierName}\n▪ 발행일시: ${new Date().toLocaleString('ko-KR')}\n------------------------------------\n▪ 발신담당: ${currentSender}\n▪ 수신(TO): ${toEmail}\n▪ 참조(CC): ${defaultCc}\n------------------------------------\n📄 도착보고서 PDF 원본 다운로드:\n${arrivalPdfUrl || '발행 예정 (도착보고서 발행 버튼을 먼저 클릭해주세요)'}\n\n🏷️ 쉬핑마크 라벨 PDF 원본 다운로드:\n${shippingPdfUrl || '발행 예정 (쉬핑마크 라벨 발행 버튼을 먼저 클릭해주세요)'}`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(msg).catch(() => {});
    }
    setKatalkModalSupplier(`${supplierName}_arrival`);
    setKatalkModalMsg(msg);
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
              .no-print { display: block; position: fixed; top: 15px; right: 15px; padding: 8px 16px; background: var(--primary-color); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 12px; z-index: 9999; box-shadow: 0 2px 5px rgba(0,0,0,0.15); }
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
                  <strong style="text-transform: uppercase; font-size: 8.5px; color: var(--text-secondary);">Shipper / Beneficiary</strong><br/>
                  <pre>${shipper}</pre>
                </td>
                <td style="width: 50%; border: 1.5px solid #000; padding: 6px; vertical-align: top;">
                  <strong style="font-size: 8.5px; color: var(--text-secondary);">Packing list No. & Date</strong><br/>
                  <div style="display: flex; justify-content: space-between; margin-top: 4px; font-weight: 700;">
                    <span>${invoiceNo}</span>
                    <span>${invoiceDate}</span>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="border: 1.5px solid #000; padding: 6px; vertical-align: top;">
                  <strong style="text-transform: uppercase; font-size: 8.5px; color: var(--text-secondary);">Applicant</strong><br/>
                  <pre>${applicant}</pre>
                </td>
                <td style="border: 1.5px solid #000; padding: 6px; vertical-align: top;">
                  <strong style="font-size: 8.5px; color: var(--text-secondary);">L/C No. & Date</strong><br/>
                  <div style="display: flex; justify-content: space-between; margin-top: 4px; font-weight: 700;">
                    <span>${lcNo}</span>
                    <span>${lcDate || '-'}</span>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="border: 1.5px solid #000; padding: 6px; vertical-align: top;">
                  <strong style="text-transform: uppercase; font-size: 8.5px; color: var(--text-secondary);">Notify Party</strong><br/>
                  <pre>${notifyParty}</pre>
                </td>
                <td style="border: 1.5px solid #000; padding: 6px; vertical-align: top;">
                  <strong style="font-size: 8.5px; color: var(--text-secondary);">L/C Issuing Bank</strong><br/>
                  <pre>${lcIssuingBank}</pre>
                </td>
              </tr>
              <tr>
                <td style="border: 1.5px solid #000; padding: 6px; vertical-align: top;">
                  <div style="display: flex;">
                    <div style="flex: 1; border-right: 1.5px solid #000; padding-right: 4px;">
                      <strong style="font-size: 8.5px; color: var(--text-secondary);">Port of Loading</strong><br/>
                      <strong>${pol}</strong>
                    </div>
                    <div style="flex: 1; padding-left: 6px;">
                      <strong style="font-size: 8.5px; color: var(--text-secondary);">Port of Discharge</strong><br/>
                      <strong>${pod}</strong>
                    </div>
                  </div>
                </td>
                <td rowspan="3" style="border: 1.5px solid #000; padding: 6px; vertical-align: top;">
                  <strong style="font-size: 8.5px; color: var(--text-secondary);">Remarks</strong><br/>
                  <pre>${remarks}</pre>
                </td>
              </tr>
              <tr>
                <td style="border: 1.5px solid #000; padding: 6px; vertical-align: top;">
                  <div style="display: flex;">
                    <div style="flex: 1.2; border-right: 1.5px solid #000; padding-right: 4px;">
                      <strong style="font-size: 8.5px; color: var(--text-secondary);">Vessel Name & Voyage No.</strong><br/>
                      <strong>${vesselName}</strong>
                    </div>
                    <div style="flex: 0.8; padding-left: 6px;">
                      <strong style="font-size: 8.5px; color: var(--text-secondary);">Sailing on or about</strong><br/>
                      <strong>${sailingDate}</strong>
                    </div>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="border: 1.5px solid #000; padding: 6px; vertical-align: top;">
                  <div style="display: flex;">
                    <div style="flex: 1; border-right: 1.5px solid #000; padding-right: 4px;">
                      <strong style="font-size: 8.5px; color: var(--text-secondary);">Payment Terms</strong><br/>
                      <strong>${paymentTerms}</strong>
                    </div>
                    <div style="flex: 1; padding-left: 6px;">
                      <strong style="font-size: 8.5px; color: var(--text-secondary);">Delivery Terms</strong><br/>
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
    return <div style={{ padding: '40px', color: 'var(--text-secondary)', textAlign: 'center' }}>상세 발주 내역을 로드하는 중...</div>;
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
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px', fontSize: '15px' }}>
      
      {/* Header Back Button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            onClick={() => handleNavigation('/orders')}
            style={{ background: '#fff', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', padding: '6px 14px', borderRadius: '6px', fontSize: '14.5px', cursor: 'pointer', fontWeight: 600 }}
          >
            이전으로
          </button>
          <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>PO 상세 정보 - {order.ciNumber || order.id}</span>
          <button 
            onClick={() => setShowPoDetails(prev => !prev)}
            style={{ 
              background: showPoDetails ? '#2563eb' : '#fff', 
              border: '1px solid var(--border-default)', 
              color: showPoDetails ? '#fff' : 'var(--text-secondary)', 
              padding: '6px 12px', 
              borderRadius: '6px', 
              fontSize: '15.5px', 
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
          {isAdmin && (
            <button 
            onClick={handleDeleteOrder}
            style={{ background: '#ef4444', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '6px', fontSize: '14.5px', cursor: 'pointer', fontWeight: 600 }}
          >
            ❌ PO 삭제 및 발주 취소
          </button>
          )}
        </div>
      </div>

      {/* ── 단계별 독립 체크리스트 대시보드 ── */}
      {(() => {
        type StageKey = '수주정보' | '소싱발주' | '물류선적' | '서류관리' | '정산결제';
        const stageMeta: { key: StageKey; label: string; icon: string; tabTarget: typeof steps[number] }[] = [
          { key: '수주정보', label: '수주정보', icon: '📋', tabTarget: '수주정보' },
          { key: '소싱발주', label: '소싱/발주', icon: '🏭', tabTarget: '소싱/발주' },
          { key: '물류선적', label: '물류/선적', icon: '🚢', tabTarget: '물류/선적' },
          { key: '서류관리', label: '서류관리', icon: '📄', tabTarget: '서류관리' },
          { key: '정산결제', label: '정산/결제', icon: '💰', tabTarget: '정산/결제' },
        ];

        // 전체 완료율 (공용 유틸 활용)
        const { done: allDoneCount, total: allItemsCount, pct: totalPct } = getOverallProgress(stageCompletion, basicForm.isLc);

        return (
          <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '10px', padding: isChecklistCollapsed ? '8px 14px' : '12px 16px', marginBottom: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.04)', transition: 'all 0.2s' }}>
            {/* 상단 통합 헤더 바 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  🚩 진행 현황
                </span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#2563eb', background: '#eff6ff', padding: '2px 10px', borderRadius: '20px', border: '1px solid #bfdbfe' }}>
                  전체 {allDoneCount}/{allItemsCount} ({totalPct}%)
                </span>

                {/* 슬림 전체 진행바 */}
                <div style={{ width: '100px', height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${totalPct}%`, height: '100%', background: 'linear-gradient(90deg, #3b82f6, #10b981)', borderRadius: '3px', transition: 'width 0.3s' }} />
                </div>

                {/* 5개 단계 슬림 배지 칩들 */}
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {stageMeta.map(({ key, label, icon, tabTarget }) => {
                    const { done, total } = getStageProgress(stageCompletion, basicForm.isLc, key);
                    const isFullyDone = done === total;
                    const isPartiallyDone = done > 0 && done < total;
                    const isActive = activeStep === tabTarget;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleStepClick(tabTarget)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: isActive ? '1.5px solid #2563eb' : isFullyDone ? '1px solid #86efac' : isPartiallyDone ? '1px solid #bfdbfe' : '1px solid #cbd5e1',
                          background: isActive ? '#eff6ff' : isFullyDone ? '#f0fdf4' : isPartiallyDone ? '#f0f9ff' : '#f8fafc',
                          color: isFullyDone ? '#15803d' : isPartiallyDone ? '#1d4ed8' : '#64748b',
                          transition: 'all 0.15s'
                        }}
                        title={`${label} 단계로 이동 (${done}/${total} 완료)`}
                      >
                        <span>{icon}</span>
                        <span>{label}</span>
                        <span style={{ fontSize: '11px', opacity: 0.9 }}>{done}/{total}</span>
                        {isFullyDone && <span style={{ color: '#16a34a', fontWeight: 900 }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 우측 버튼 그룹 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                <button
                  onClick={handleForceCompleteAll}
                  style={{
                    background: '#10b981',
                    border: 'none',
                    color: '#fff',
                    padding: '3px 10px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    boxShadow: '0 2px 4px rgba(16,185,129,0.2)'
                  }}
                  title="모든 미완료 항목을 수동 완료 처리합니다."
                >
                  ⚡ 전체 일괄 완료
                </button>

                <button
                  type="button"
                  onClick={() => setIsChecklistCollapsed(!isChecklistCollapsed)}
                  style={{
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    color: '#475569',
                    padding: '3px 10px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.15s'
                  }}
                >
                  {isChecklistCollapsed ? '▼ 상세 보기' : '▲ 접기'}
                </button>
              </div>
            </div>

            {/* 상세 체크리스트 영역 (펼침 상태일 때만 출력) */}
            {!isChecklistCollapsed && (
              <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                {/* 5개 단계 카드 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                  {stageMeta.map(({ key, label, icon, tabTarget }) => {
                    const { done, total, pct } = getStageProgress(stageCompletion, basicForm.isLc, key);
                    const isActive = activeStep === tabTarget;
                    let items = { ...(stageCompletion[key] || {}) };
                    if (key === '수주정보' && basicForm.isLc !== 'Y') {
                      delete items['L/C 거래 상세 정보 입력'];
                    }

                    // 단계 상태 색상
                    const stageColor = done === total ? '#10b981' : done > 0 ? '#2563eb' : 'var(--text-muted)';
                    const stageBg = done === total ? '#f0fdf4' : done > 0 ? '#eff6ff' : '#f8fafc';
                    const stageBorder = done === total ? '#86efac' : done > 0 ? '#bfdbfe' : 'var(--border-color)';

                    return (
                      <div
                        key={key}
                        style={{
                          border: isActive ? '2px solid #2563eb' : `1px solid ${stageBorder}`,
                          borderRadius: '8px',
                          background: isActive ? '#eff6ff' : stageBg,
                          padding: '8px 10px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                          boxShadow: isActive ? '0 0 0 2px rgba(37,99,235,0.15)' : 'none',
                        }}
                        onClick={() => handleStepClick(tabTarget)}
                      >
                        {/* 단계 헤더 */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '13px', fontWeight: 800, color: isActive ? '#1d4ed8' : '#374151' }}>
                            {icon} {label}
                          </span>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: stageColor }}>
                            {done}/{total}
                          </span>
                        </div>

                        {/* 단계 진행바 */}
                        <div style={{ width: '100%', height: '3px', background: 'var(--border-color)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: stageColor, borderRadius: '2px', transition: 'width 0.3s' }} />
                        </div>

                        {/* 체크리스트 항목 */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          {Object.entries(items).map(([itemKey, checked]) => {
                            const overrideKey = `${key}__${itemKey}`;
                            const isOverridden = !!manualOverride[overrideKey];
                            return (
                              <div
                                key={itemKey}
                                onClick={e => { e.stopPropagation(); handleChecklistToggle(key, itemKey); }}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: '4px',
                                  cursor: 'pointer', padding: '1px 0',
                                  opacity: isOverridden ? 0.5 : 1,
                                }}
                                title={isOverridden ? '자동감지 조건 충족이지만 수동 해제됨' : checked ? '완료 (클릭하면 해제)' : '미완료 (클릭하면 완료)'}
                              >
                                {/* 체크박스 */}
                                <div style={{
                                  width: '12px', height: '12px', borderRadius: '3px', flexShrink: 0,
                                  border: checked ? 'none' : '1.5px solid var(--border-default)',
                                  background: checked ? '#10b981' : '#fff',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  transition: 'all 0.15s',
                                }}>
                                  {checked && <span style={{ color: '#fff', fontSize: '8px', fontWeight: 900, lineHeight: 1 }}>✓</span>}
                                </div>
                                {/* 항목 텍스트 */}
                                <span style={{
                                  fontSize: '12px', fontWeight: checked ? 600 : 400,
                                  color: isOverridden ? 'var(--text-muted)' : checked ? '#065f46' : 'var(--text-secondary)',
                                  textDecoration: isOverridden ? 'line-through' : 'none',
                                  lineHeight: 1.2, flex: 1,
                                }}>
                                  {itemKey === '발주서 발행 및 저장' ? (
                                    `발주서 발행 및 저장 (${allOrderSuppliers.filter(s => issuedDocs.some(d => d.status === 'active' && (d.supplier_name === s || d.po_number.includes(s.replace(/\s+/g, '').substring(0,3).toUpperCase())))).length}/${allOrderSuppliers.length}건)`
                                  ) : itemKey === '공급업체 대금 결제 완료' ? (
                                    `공급업체 대금 결제 완료 (${allOrderSuppliers.filter(s => basicForm.supplierPayments?.[s]?.status === '결제완료' || basicForm.supplierPayments?.[s]?.status === '입금완료').length}/${allOrderSuppliers.length}건)`
                                  ) : itemKey}
                                </span>
                                {checked && !isOverridden && (
                                  <span style={{ fontSize: '8px', color: 'var(--text-muted)', flexShrink: 0 }} title="자동감지/수동완료">⚡</span>
                                )}
                                {isOverridden && (
                                  <span style={{ fontSize: '8px', color: '#f59e0b', flexShrink: 0 }} title="수동해제">✋</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 하단 미완료 요약 & 범례 한 줄 통합 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '6px', borderTop: '1px solid #f1f5f9', fontSize: '12px', flexWrap: 'wrap', gap: '8px' }}>
                  {(() => {
                    const pending = stageMeta.flatMap(s =>
                      Object.entries(stageCompletion[s.key] || {})
                        .filter(([, v]) => !v)
                        .map(([k]) => ({ stage: s.label, item: k }))
                    );
                    if (pending.length === 0) return (
                      <span style={{ fontWeight: 700, color: '#15803d' }}>
                        🎉 모든 단계 완료! 오더가 마감되었습니다.
                      </span>
                    );
                    return (
                      <div>
                        <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>⏳ 미완료 항목 ({pending.length}건): </span>
                        {pending.slice(0, 5).map((p, i) => (
                          <span key={i} style={{ color: 'var(--text-secondary)', marginRight: '6px' }}>
                            <span style={{ color: 'var(--text-muted)' }}>[{p.stage}]</span> {p.item}{i < Math.min(pending.length, 5) - 1 ? ' · ' : ''}
                          </span>
                        ))}
                        {pending.length > 5 && <span style={{ color: 'var(--text-muted)' }}>외 {pending.length - 5}건</span>}
                      </div>
                    );
                  })()}

                  <div style={{ display: 'flex', gap: '10px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    <span>⚡ 자동감지/수동완료</span>
                    <span>✋ 수동해제</span>
                    <span>* 클릭하여 완료/해제</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Tab Menu */}
      <div style={{ display: 'flex', gap: '6px', padding: '4px 0', borderBottom: '1px solid var(--border-color)' }}>
        {steps.filter(step => order?.type !== 'consulting' || step !== '물류/선적').map((step) => {
          const isCurrent = step === activeStep;
          const stageKey = STEP_LABEL_TO_STAGE_KEY[step];
          const badge = (() => {
            if (!stageKey) return null;
            const { done, total, pct } = getStageProgress(stageCompletion, basicForm.isLc, stageKey);
            if (total === 0) return null;
            if (pct === 100) return <span style={{ marginLeft: '6px', fontSize: '12px', fontWeight: 800, color: isCurrent ? '#6ee7b7' : '#10b981' }}>✓</span>;
            if (pct === 0) return <span style={{ marginLeft: '6px', fontSize: '12px', fontWeight: 600, color: isCurrent ? '#cbd5e1' : '#94a3b8' }}>○</span>;
            return <span style={{ marginLeft: '6px', fontSize: '11.5px', fontWeight: 700, color: isCurrent ? '#93c5fd' : '#2563eb', background: isCurrent ? 'rgba(255,255,255,0.2)' : '#eff6ff', padding: '1px 6px', borderRadius: '10px' }}>{done}/{total}</span>;
          })();

          return (
            <button
              key={step}
              onClick={() => handleStepClick(step)}
              style={{
                padding: '8px 18px',
                borderRadius: '20px',
                border: isCurrent ? '1px solid #2563eb' : '1px solid var(--border-default)',
                background: isCurrent ? '#2563eb' : '#f8fafc',
                color: isCurrent ? '#fff' : 'var(--text-secondary)',
                fontWeight: isCurrent ? 700 : 500,
                fontSize: '16.5px',
                cursor: 'pointer',
                transition: 'all 0.15s',
                boxShadow: isCurrent ? '0 2px 4px rgba(37, 99, 235, 0.2)' : 'none',
                display: 'inline-flex',
                alignItems: 'center'
              }}
            >
              {step}
              {badge}
            </button>
          );
        })}
      </div>

      {/* Top Panel: PI Info & CI, Items Summary (Consolidated) */}
      {showPoDetails && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(240px, 1fr)', gap: '16px', alignItems: 'start' }}>

        {/* Left: Consolidated Order Information */}
        <div style={{ background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-default)', paddingBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '15.5px' }}>📦</span>
              <span style={{ fontWeight: 800, fontSize: '14.5px', color: '#1e3a8a' }}>주문 기본 정보</span>
            </div>
            {piData && (
              <div style={{ fontSize: '14.5px', color: 'var(--text-secondary)' }}>
                <strong style={{ color: '#0f172a' }}>PI: {piData.piNumber}</strong> | <span style={{ fontSize: '15.5px' }}>고객사: {piData.customerName}</span> | <strong style={{ color: '#2563eb' }}>${(piData.totalUsd || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} USD</strong>
              </div>
            )}
          </div>

          {/* Form Fields Grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            
            {/* 줄 1: 발행사 (발주서 기준) / 담당영업사원 / 확정 CI 번호 / PO 접수일 (CI 작성일) / 고객사 PO 번호 / 연결된견적서(PI) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.6fr 1.2fr 1fr 1fr 1.2fr', gap: '10px', width: '100%' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '0' }}>
                <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>발행사 (발주서 기준)</span>
                {isEditing ? (
                  <select value={basicForm.issuingCompany} onChange={e => setBasicForm(prev => ({ ...prev, issuingCompany: e.target.value as 'YSACC' | 'YS' }))} style={{ width: '100%', minWidth: '0', padding: '6px 4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', fontWeight: 700, background: '#fff', color: '#1e293b', outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}>
                    <option value="YSACC">YSACC</option>
                    <option value="YS">영성ACC</option>
                  </select>
                ) : (
                  <input type="text" value={order.issuingCompany === 'YS' ? '영성ACC' : 'YSACC'} disabled style={{ width: '100%', minWidth: '0', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', background: '#f1f5f9', color: '#64748b', boxSizing: 'border-box' }} />
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '0' }}>
                <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>담당 영업사원</span>
                <input type="text" value={basicForm.manager} onChange={e => setBasicForm(prev => ({ ...prev, manager: e.target.value }))} disabled={!isEditing} style={{ width: '100%', minWidth: '0', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', background: isEditing ? '#fff' : '#f1f5f9', color: isEditing ? '#1e293b' : '#64748b', outline: 'none', boxSizing: 'border-box' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '0' }}>
                <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>확정 CI 번호</span>
                <input
                  type="text"
                  placeholder="CI 번호 입력"
                  value={basicForm.ciNumber}
                  onChange={e => setBasicForm(p => ({ ...p, ciNumber: e.target.value }))}
                  style={{ width: '100%', minWidth: '0', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', background: '#fff', color: '#1e293b', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '0' }}>
                <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>PO 접수일 (CI 작성일)</span>
                <DateInput value={basicForm.poDate} onChange={e => setBasicForm(prev => ({ ...prev, poDate: e.target.value }))} disabled={!isEditing} style={{ width: '100%', minWidth: '0', padding: '6px 4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', background: isEditing ? '#fff' : '#f1f5f9', color: isEditing ? '#1e293b' : '#64748b', outline: 'none', boxSizing: 'border-box' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '0' }}>
                <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>고객사 PO 번호</span>
                <input type="text" value={basicForm.custPo || ''} onChange={e => setBasicForm(prev => ({ ...prev, custPo: e.target.value }))} disabled={!isEditing} style={{ width: '100%', minWidth: '0', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', background: isEditing ? '#fff' : '#f1f5f9', color: isEditing ? '#1e293b' : '#64748b', outline: 'none', boxSizing: 'border-box' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '0' }}>
                <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>연결된 견적서 (PI)</span>
                {isEditing ? (
                  <select
                    value={basicForm.quotationId}
                    onChange={e => setBasicForm(prev => ({ ...prev, quotationId: e.target.value }))}
                    style={{ width: '100%', minWidth: '0', padding: '6px 4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', background: '#fff', color: '#1e293b', outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}
                  >
                    <option value="">연결 안 함</option>
                    {piList.map(p => (
                      <option key={p.id} value={p.id}>{p.piNumber}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={basicForm.quotationId ? (piList.find(p => p.id === basicForm.quotationId)?.piNumber || basicForm.quotationId) : '연결 안 함'}
                    disabled
                    style={{ width: '100%', minWidth: '0', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', background: '#f1f5f9', color: '#64748b', boxSizing: 'border-box' }}
                  />
                )}
              </div>
            </div>

            {/* 줄 2: 고객정보 / 출발항 / 도착항 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>고객정보</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <input
                    type="text"
                    value={
                      basicForm.customerCode
                        ? `[${basicForm.customerCode}] ${basicForm.customer}`
                        : ((order as any)?.customerCode || (order as any)?.customerId)
                          ? `[${(order as any)?.customerCode || (order as any)?.customerId}] ${basicForm.customer}`
                          : basicForm.customer
                    }
                    readOnly
                    onClick={() => isEditing && setIsCustomerSearchOpen(true)}
                    disabled={!isEditing}
                    style={{
                      flex: 1,
                      minWidth: '0',
                      padding: '6px 10px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px',
                      fontSize: '13px',
                      fontWeight: 600,
                      height: '34px',
                      background: isEditing ? '#fff' : '#f1f5f9',
                      color: isEditing ? '#1e293b' : '#64748b',
                      cursor: isEditing ? 'pointer' : 'default',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    placeholder="고객사 선택..."
                  />
                  {isEditing && (
                    <button
                      type="button"
                      onClick={() => setIsCustomerSearchOpen(true)}
                      style={{
                        padding: '0 12px',
                        background: '#3b82f6',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        height: '34px',
                        boxSizing: 'border-box',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#2563eb'}
                      onMouseLeave={e => e.currentTarget.style.background = '#3b82f6'}
                    >
                      검색
                    </button>
                  )}
                </div>
              </div>

              {order?.type !== 'consulting' && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>출발항</span>
                    <input type="text" value={basicForm.portOfLoading} onChange={e => setBasicForm(prev => ({ ...prev, portOfLoading: e.target.value }))} disabled={!isEditing} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13.5px', height: '34px', background: isEditing ? '#fff' : '#f1f5f9', color: isEditing ? '#1e293b' : '#64748b', outline: 'none', boxSizing: 'border-box' }} placeholder="출발항" />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>도착항</span>
                    <input type="text" value={basicForm.portOfDischarge} onChange={e => setBasicForm(prev => ({ ...prev, portOfDischarge: e.target.value }))} disabled={!isEditing} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13.5px', height: '34px', background: isEditing ? '#fff' : '#f1f5f9', color: isEditing ? '#1e293b' : '#64748b', outline: 'none', boxSizing: 'border-box' }} placeholder="도착항" />
                  </div>
                </>
              )}
            </div>

            {/* 줄 3: 인코텀즈 / 결제 조건 / L/C 거래 여부 / 요청 납기일 / 제품준비일(최종 완료일) */}
            <div style={{ display: 'grid', gridTemplateColumns: order?.type === 'consulting' ? '1fr 1fr' : '0.8fr 1.2fr 1.1fr 1fr 1.1fr', gap: '10px', width: '100%' }}>
              {order?.type !== 'consulting' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '0' }}>
                  <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>인코텀즈</span>
                  {isEditing ? (
                    <select value={basicForm.incoterms} onChange={e => setBasicForm(prev => ({ ...prev, incoterms: e.target.value as any }))} style={{ width: '100%', minWidth: '0', padding: '6px 4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', background: '#fff', color: '#1e293b', outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}>
                      <option value="FOB">FOB</option>
                      <option value="CIF">CIF</option>
                      <option value="EXW">EXW</option>
                      <option value="CFR">CFR</option>
                      <option value="DAP">DAP</option>
                      <option value="DDP">DDP</option>
                    </select>
                  ) : (
                    <input type="text" value={order.incoterms} disabled style={{ width: '100%', minWidth: '0', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', background: '#f1f5f9', color: '#64748b', boxSizing: 'border-box' }} />
                  )}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '0' }}>
                <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>결제 조건</span>
                <input type="text" value={basicForm.paymentTerms} onChange={e => setBasicForm(prev => ({ ...prev, paymentTerms: e.target.value }))} disabled={!isEditing} style={{ width: '100%', minWidth: '0', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', background: isEditing ? '#fff' : '#f1f5f9', color: isEditing ? '#1e293b' : '#64748b', outline: 'none', boxSizing: 'border-box' }} />
              </div>

              {order?.type !== 'consulting' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '0' }}>
                  <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>L/C 거래 여부</span>
                  {isEditing ? (
                    <select value={basicForm.isLc} onChange={e => setBasicForm(prev => ({ ...prev, isLc: e.target.value as any }))} style={{ width: '100%', minWidth: '0', padding: '6px 4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', background: '#fff', color: '#1e293b', outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}>
                      <option value="">기본 T/T</option>
                      <option value="Y">L/C 거래 (Y)</option>
                      <option value="N">T/T 거래 (N)</option>
                    </select>
                  ) : (
                    <input type="text" value={basicForm.isLc === 'Y' ? 'L/C 거래 (Y)' : basicForm.isLc === 'N' ? 'T/T 거래 (N)' : '일반 거래'} disabled style={{ width: '100%', minWidth: '0', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', background: '#f1f5f9', color: '#64748b', boxSizing: 'border-box' }} />
                  )}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '0' }}>
                <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>요청 납기일</span>
                <DateInput value={basicForm.requestedDelivery} onChange={e => setBasicForm(prev => ({ ...prev, requestedDelivery: e.target.value }))} disabled={!isEditing} style={{ width: '100%', minWidth: '0', padding: '6px 4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', background: isEditing ? '#fff' : '#f1f5f9', color: isEditing ? '#1e293b' : '#64748b', outline: 'none', boxSizing: 'border-box' }} />
              </div>

              {order?.type !== 'consulting' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '0' }}>
                  <span style={{ fontSize: '11px', fontWeight: 750, color: '#1e3a8a', letterSpacing: '0.02em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>제품준비일 (최종 완료일)</span>
                  <input
                    type="date"
                    value={basicForm.cargoReadyDate || ''}
                    disabled={true}
                    style={{ width: '100%', minWidth: '0', padding: '6px 4px', border: '1px solid #bfdbfe', borderRadius: '4px', fontSize: '13px', height: '34px', background: '#eff6ff', color: '#1e3a8a', fontWeight: 'bold', outline: 'none', boxSizing: 'border-box', fontVariantNumeric: 'tabular-nums' }}
                  />
                </div>
              )}
            </div>

            {/* 줄 5: 비고 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>비고 (Remarks)</span>
              <textarea rows={1} value={basicForm.remark} onChange={e => setBasicForm(prev => ({ ...prev, remark: e.target.value }))} disabled={!isEditing} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13.5px', minHeight: '34px', background: isEditing ? '#fff' : '#f1f5f9', color: isEditing ? '#1e293b' : '#64748b', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
            </div>

          </div>
        </div>

        {/* Right: L/C details & PO/LC/Sales Contract 파일 첨부 관리 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* L/C Details Section */}
          {basicForm.isLc === 'Y' && (
            <div style={{ padding: '12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontWeight: 800, fontSize: '13.5px', color: '#1e40af', borderBottom: '1px solid #bfdbfe', paddingBottom: '4px', marginBottom: '4px' }}>💳 L/C 거래 상세 정보</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#1e40af' }}>L/C ISSUING BANK</span>
                  <input type="text" value={basicForm.lcIssuingBank} onChange={e => setBasicForm(prev => ({ ...prev, lcIssuingBank: e.target.value }))} disabled={!isEditing} style={{ padding: '4px 6px', border: '1px solid var(--border-default)', borderRadius: '5px', fontSize: '14.5px', background: isEditing ? '#fff' : '#f8fafc', outline: 'none' }} placeholder="발행 은행" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#1e40af' }}>LC 번호</span>
                  <input type="text" value={basicForm.lcNo} onChange={e => setBasicForm(prev => ({ ...prev, lcNo: e.target.value }))} disabled={!isEditing} style={{ padding: '4px 6px', border: '1px solid var(--border-default)', borderRadius: '5px', fontSize: '14.5px', background: isEditing ? '#fff' : '#f8fafc', outline: 'none' }} placeholder="LC 번호" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#1e40af' }}>LC ISSUING DATE</span>
                  <DateInput value={basicForm.lcIssuingDate} onChange={e => setBasicForm(prev => ({ ...prev, lcIssuingDate: e.target.value }))} disabled={!isEditing} style={{ padding: '4px 6px', border: '1px solid var(--border-default)', borderRadius: '5px', fontSize: '14.5px', background: isEditing ? '#fff' : '#f8fafc', outline: 'none' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', gridColumn: 'span 3' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#1e40af' }}>DESCRIPTION</span>
                  <textarea rows={1} value={basicForm.lcDescription} onChange={e => setBasicForm(prev => ({ ...prev, lcDescription: e.target.value }))} disabled={!isEditing} style={{ padding: '4px 6px', border: '1px solid var(--border-default)', borderRadius: '5px', fontSize: '14.5px', background: isEditing ? '#fff' : '#f8fafc', outline: 'none', resize: 'vertical' }} placeholder="물품 설명 / LC Description" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', gridColumn: 'span 3' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#b45309' }}>⚠️ L/C 중요사항 기록 (Remark)</span>
                  <textarea rows={2} value={basicForm.lcRemark} onChange={e => setBasicForm(prev => ({ ...prev, lcRemark: e.target.value }))} disabled={!isEditing} style={{ padding: '4px 6px', border: '1.5px solid #fcd34d', borderRadius: '5px', fontSize: '14.5px', background: isEditing ? '#fffbeb' : '#f8fafc', outline: 'none', resize: 'vertical' }} placeholder="L/C 관련 중요사항 기록" />
                </div>
              </div>
            </div>
          )}

          {/* Right Attachment Box */}
          <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
            <div style={{ fontSize: '15.5px', fontWeight: 700, color: '#1f2937', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>📂 거래 서류 첨부 (PO / L/C / Sales Contract)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
              {renderFileField("거래 서류 통합 첨부 (PO, L/C, Sales Contract 등 모든 서류)", "attachments", "po-common-attachments-uploader")}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Main Content: Selected activeStep Input Forms */}
      <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '24px', minHeight: '400px', width: '100%', boxSizing: 'border-box' }}>
          {/* Render corresponding form/contents based on activeStep */}

          {/* 2. PO접수 */}
          {activeStep === '수주정보' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Items Section */}
              <div style={{ marginTop: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--text-primary)' }}>📦 발주 품목 목록</span>
                  <button type="button" onClick={addItemRow} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #2563eb', background: '#fff', color: '#2563eb', fontSize: '15.5px', fontWeight: 600, cursor: 'pointer' }}>➕ 품목 행 추가</button>
                </div>
                
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '15.5px' }}>
                  <thead>
                    <tr style={{ background: '#1e3a5f', color: '#ffffff' }}>
                      <th style={{ padding: '8px 4px', textAlign: 'center', width: '55px', borderTopLeftRadius: '6px', borderBottomLeftRadius: '6px' }}>No.</th>
                      <th style={{ padding: '8px 4px', textAlign: 'left', width: '300px' }}>상품코드</th>
                      <th style={{ padding: '8px 4px', textAlign: 'left', width: '200px' }}>공급사</th>
                      <th style={{ padding: '8px 4px', textAlign: 'center', width: '120px' }}>수량 / 단위</th>
                      <th style={{ padding: '8px 4px', textAlign: 'center', width: '150px' }}>통화 / 단가</th>
                      <th style={{ padding: '8px 4px', textAlign: 'right', width: '100px' }}>금액</th>
                      <th style={{ padding: '8px 4px', textAlign: 'center', width: '62px', borderTopRightRadius: '6px', borderBottomRightRadius: '6px' }}>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderItems.map((item, idx) => {
                      if (item.isSourcingOnly) return null;
                      const isDragOver = step1DragOverIndex === idx;
                      return (
                        <tr 
                          key={`order-item-${item.lineNumber || (idx + 1)}-${item.name || idx}`}
                          draggable={true}
                          onDragStart={(e) => handleStep1DragStart(e, idx)}
                          onDragOver={(e) => handleStep1DragOver(e, idx)}
                          onDragLeave={handleStep1DragLeave}
                          onDrop={(e) => handleStep1Drop(e, idx)}
                          style={{ 
                            borderBottom: isDragOver ? '2px solid #2563eb' : '1px solid #f1f5f9',
                            backgroundColor: isDragOver ? '#dbeafe' : 'transparent'
                          }}
                        >
                          <td style={{ padding: '4px 4px', textAlign: 'center', verticalAlign: 'middle' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                              <span style={{ cursor: 'grab', fontSize: '13px', color: '#94a3b8', userSelect: 'none', padding: '0 2px' }} title="드래그하여 순서 변경">
                                ⋮⋮
                              </span>
                              <input
                                type="text"
                                value={item.lineNumber || (idx + 1).toString()}
                                onChange={e => handleStep1NoChange(idx, e.target.value)}
                                style={{
                                  width: '32px',
                                  textAlign: 'center',
                                  padding: '2px',
                                  fontWeight: 700,
                                  color: '#1e293b',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '4px',
                                  fontSize: '12px'
                                }}
                                title="순번 수동 입력"
                              />
                            </div>
                          </td>
                        
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
                                style={{ width: '100%', padding: '0 40px 0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13.5px', boxSizing: 'border-box', height: '32px', outline: 'none', color: '#1e293b' }}
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
                                    color: '#64748b',
                                    cursor: 'pointer',
                                    fontSize: '13px',
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
                                  fontSize: '13.5px',
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
                                    border: p ? '1px solid #eab308' : '1px solid #cbd5e1',
                                    color: p ? '#a16207' : '#94a3b8',
                                    borderRadius: '4px',
                                    padding: '2px 4px',
                                    cursor: p ? 'pointer' : 'not-allowed',
                                    fontSize: '13.5px',
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    height: '32px',
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
                              style={{ flex: 1, padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13.5px', boxSizing: 'border-box', height: '32px', outline: 'none', color: '#1e293b' }}
                            />
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
                              style={{ width: '70px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13.5px', textAlign: 'right', boxSizing: 'border-box', height: '32px', outline: 'none', color: '#1e293b' }}
                            />
                            <input
                              type="text"
                              value={item.unit || ''}
                              onChange={e => handleItemChange(idx, 'unit', e.target.value)}
                              placeholder="단위"
                              style={{ width: '60px', padding: '0 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13.5px', boxSizing: 'border-box', height: '32px', outline: 'none', textAlign: 'center', color: '#1e293b' }}
                            />
                          </div>
                        </td>

                        {/* 통화 / 단가 */}
                        <td style={{ padding: '4px 4px' }}>
                          <div style={{ display: 'flex', flexDirection: 'row', gap: '3px', alignItems: 'center' }}>
                            <select
                              value={item.currency || 'USD'}
                              onChange={e => handleCurrencySelection(e.target.value, item.currency || 'USD', customCurrencies, val => handleItemChange(idx, 'currency', val))}
                              style={{ width: '75px', padding: '0 4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13.5px', boxSizing: 'border-box', height: '32px', outline: 'none', color: '#1e293b', background: '#fff', cursor: 'pointer' }}
                            >
                              {[...DEFAULT_CURRENCIES, ...customCurrencies].map(c => <option key={c} value={c}>{c}</option>)}
                              <option value="ADD_NEW_CURRENCY" style={{ color: '#2563eb', fontWeight: 'bold' }}>+ 추가등록</option>
                            </select>
                            <input
                              type="number"
                              step={item.currency === 'KRW' ? '1' : '0.01'}
                              value={item.unitPrice || ''}
                              onChange={e => handleItemChange(idx, 'unitPrice', e.target.value)}
                              placeholder="단가"
                              style={{ width: '80px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13.5px', textAlign: 'right', boxSizing: 'border-box', height: '32px', outline: 'none', color: '#1e293b' }}
                            />
                          </div>
                        </td>

                        {/* 금액 */}
                        <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 600, color: '#1e293b', verticalAlign: 'middle', fontSize: '13.5px', fontVariantNumeric: 'tabular-nums' }}>
                          {item.currency === 'KRW' ? '₩' : '$'}{(item.amount || 0).toLocaleString('en-US', item.currency === 'KRW' ? {} : { minimumFractionDigits: 2 })}
                        </td>

                        {/* 관리 (복사/삭제) */}
                        <td style={{ padding: '6px 4px', textAlign: 'center', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center' }}>
                            <button
                              type="button"
                              onClick={() => copyStep1Item(idx)}
                              title="동일 품목 복사 추가"
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#2563eb',
                                fontSize: '13px',
                                cursor: 'pointer'
                              }}
                            >
                              📋
                            </button>
                            <button
                              type="button"
                              onClick={() => removeItemRow(idx)}
                              disabled={orderItems.length === 1}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: orderItems.length === 1 ? '#cbd5e1' : '#ef4444',
                                fontSize: '14.5px',
                                cursor: orderItems.length === 1 ? 'not-allowed' : 'pointer'
                              }}
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

              {/* Forwarder/Transport Section */}
              <div style={{ marginTop: '4px', padding: '14px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '14.5px', fontWeight: 700, color: '#1e3a8a' }}>🚢 포워딩/운송사 & 운송비</label>
                  <button
                    type="button"
                    onClick={() => {
                      if (forwardersList.length >= 4) {
                        alert("운송사는 최대 4개까지 추가 가능합니다.");
                        return;
                      }
                      addForwarderRow();
                    }}
                    style={{ padding: '5px 12px', fontSize: '13.5px', fontWeight: 700, background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                  >
                    + 운송사 추가
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px 32px', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', color: '#475569', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>포워딩사/운송사명</span>
                  <span style={{ fontSize: '11px', color: '#475569', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>운송비(발주가) (USD $)</span>
                  <span></span>
                </div>
                {forwardersList.length === 0 ? (
                  <div style={{ padding: '10px', textAlign: 'center', color: '#64748b', fontSize: '13.5px' }}>운송사를 추가하세요</div>
                ) : (
                  forwardersList.map((fw, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 200px 32px', gap: '8px', marginBottom: '6px', alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="포워딩사명 입력"
                        value={fw.name || ''}
                        onChange={e => handleForwarderChange(idx, 'name', e.target.value)}
                        style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13.5px', height: '32px', boxSizing: 'border-box', background: '#fff', outline: 'none', color: '#1e293b' }}
                      />
                      <input
                        type="text"
                        placeholder="0.00"
                        value={fw.budgetAmountUsd ?? 0}
                        onChange={e => {
                          const val = e.target.value.replace(/[^0-9.]/g, '');
                          handleForwarderChange(idx, 'budgetAmountUsd', val);
                        }}
                        style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13.5px', height: '32px', boxSizing: 'border-box', textAlign: 'right', background: '#fff', color: '#1e293b', fontVariantNumeric: 'tabular-nums' }}
                      />
                      <button
                        type="button"
                        onClick={() => removeForwarderRow(idx)}
                        style={{ padding: '0', height: '32px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fee2e2', borderRadius: '4px', cursor: 'pointer', fontSize: '13.5px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
                    <span style={{ color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>
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
          {activeStep === '소싱/발주' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* 소싱발주 */}
              <>
                  {/* 공통 입고 요청일 및 납품처 설정 카드 */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '20px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px 16px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontWeight: 800, fontSize: '15px', color: '#1e40af', whiteSpace: 'nowrap' }}>공통 입고 요청일 (납기일):</span>
                      <div style={{ width: '160px' }}>
                        <DateInput
                          value={basicForm.requestedDelivery || ''}
                          disabled={!isEditing}
                          onChange={e => {
                            const val = e.target.value;
                            setBasicForm(prev => ({
                              ...prev,
                              requestedDelivery: val
                            }));
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '300px' }}>
                      <span style={{ fontWeight: 800, fontSize: '15px', color: '#1e40af', whiteSpace: 'nowrap' }}>공통 납품처:</span>
                      <input
                        type="text"
                        placeholder="예: YSACC 인천창고"
                        value={basicForm.deliveryPlace || ''}
                        disabled={!isEditing}
                        onChange={e => {
                          const val = e.target.value;
                          setBasicForm(prev => ({
                            ...prev,
                            deliveryPlace: val
                          }));
                        }}
                        style={{ flex: 1, padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', outline: 'none', background: '#fff', color: '#1e293b', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div style={{ width: '100%', fontSize: '13px', color: '#1e40af', fontWeight: 600, marginTop: '-5px' }}>
                      * 여기서 지정한 일자와 납품처가 모든 공급업체별 발주서(PO) 및 도착보고서에 공통으로 자동 반영됩니다.
                    </div>
                  </div>

                  {/* 업체별 발주 집계 현황 카드 */}
                  {allOrderSuppliers.length > 0 && (
                    <div style={{ background: '#f8fafc', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 5px rgba(0,0,0,0.02)' }}>
                      <h4 style={{ margin: '0 0 10px 0', fontSize: '14.5px', fontWeight: 800, color: '#0f766e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        📊 업체별 발주액 및 총계 요약
                      </h4>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px', background: '#fff', border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
                        <thead>
                          <tr style={{ background: '#f1f5f9', borderBottom: '1px solid var(--border-default)', fontWeight: 700, color: 'var(--text-secondary)' }}>
                            <th style={{ padding: '8px 12px', textAlign: 'left' }}>공급업체명</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right' }}>발주 금액 합계</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right' }}>부가세 합계</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right', color: '#b91c1c' }}>합계 총합</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const summary = allOrderSuppliers.map(supplierName => {
                              const items = groupedSupplierItems[supplierName] || [];
                              const usdAmount = items.filter(it => getSupplierPurchaseInfo(it).purchaseCurrency !== 'KRW').reduce((sum, it) => sum + getSupplierPurchaseInfo(it).purchasePrice * (it.qty || 0), 0);
                              const krwAmount = items.filter(it => getSupplierPurchaseInfo(it).purchaseCurrency === 'KRW').reduce((sum, it) => sum + getSupplierPurchaseInfo(it).purchasePrice * (it.qty || 0), 0);
                              const taxType = basicForm.supplierTaxTypes[supplierName] || '과세';
                              const usdVat = taxType === '영세' ? 0 : parseFloat((usdAmount * 0.1).toFixed(2));
                              const krwVat = taxType === '영세' ? 0 : Math.round(krwAmount * 0.1);
                              
                              const usdGrand = usdAmount + usdVat;
                              const krwGrand = krwAmount + krwVat;
                              
                              return {
                                supplierName,
                                usdAmount,
                                krwAmount,
                                usdVat,
                                krwVat,
                                usdGrand,
                                krwGrand
                              };
                            });

                            const totalUsdAmount = summary.reduce((acc, s) => acc + s.usdAmount, 0);
                            const totalKrwAmount = summary.reduce((acc, s) => acc + s.krwAmount, 0);
                            const totalUsdVat = summary.reduce((acc, s) => acc + s.usdVat, 0);
                            const totalKrwVat = summary.reduce((acc, s) => acc + s.krwVat, 0);
                            const totalUsdGrand = totalUsdAmount + totalUsdVat;
                            const totalKrwGrand = totalKrwAmount + totalKrwVat;

                            return (
                              <>
                                {summary.map((s, idx) => {
                                  const amtParts = [];
                                  if (s.usdAmount > 0) amtParts.push(`${s.usdAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
                                  if (s.krwAmount > 0) amtParts.push(`₩${s.krwAmount.toLocaleString()}`);

                                  const vatParts = [];
                                  if (s.usdVat > 0) vatParts.push(`${s.usdVat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
                                  if (s.krwVat > 0) vatParts.push(`₩${s.krwVat.toLocaleString()}`);

                                  const grandParts = [];
                                  if (s.usdGrand > 0) grandParts.push(`${s.usdGrand.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
                                  if (s.krwGrand > 0) grandParts.push(`₩${s.krwGrand.toLocaleString()}`);

                                  return (
                                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                      <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1e3a8a' }}>{s.supplierName}</td>
                                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500 }}>{amtParts.length > 0 ? amtParts.join(' / ') : '₩0'}</td>
                                      <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>{vatParts.length > 0 ? vatParts.join(' / ') : '₩0'}</td>
                                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>{grandParts.length > 0 ? grandParts.join(' / ') : '₩0'}</td>
                                    </tr>
                                  );
                                })}
                                {/* 총계 행 */}
                                <tr style={{ background: '#f8fafc', borderTop: '2px solid var(--border-default)', fontWeight: 800, color: '#0f172a' }}>
                                  <td style={{ padding: '10px 12px', color: '#0f766e' }}>합계 총계 (Grand Total)</td>
                                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                    {(() => {
                                      const parts = [];
                                      if (totalUsdAmount > 0) parts.push(`${totalUsdAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
                                      if (totalKrwAmount > 0) parts.push(`₩${totalKrwAmount.toLocaleString()}`);
                                      return parts.length > 0 ? parts.join(' / ') : '₩0';
                                    })()}
                                  </td>
                                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                                    {(() => {
                                      const parts = [];
                                      if (totalUsdVat > 0) parts.push(`${totalUsdVat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
                                      if (totalKrwVat > 0) parts.push(`₩${totalKrwVat.toLocaleString()}`);
                                      return parts.length > 0 ? parts.join(' / ') : '₩0';
                                    })()}
                                  </td>
                                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#b91c1c', fontSize: '14.5px' }}>
                                    {(() => {
                                      const parts = [];
                                      if (totalUsdGrand > 0) parts.push(`${totalUsdGrand.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
                                      if (totalKrwGrand > 0) parts.push(`₩${totalKrwGrand.toLocaleString()}`);
                                      return parts.length > 0 ? parts.join(' / ') : '₩0';
                                    })()}
                                  </td>
                                </tr>
                              </>
                            );
                          })()}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* 추가 발주사(원자재/OEM) 관리 UI */}
                  <div style={{ background: '#fff', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '16px', marginBottom: '8px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '14.5px', fontWeight: 800, color: 'var(--text-primary)' }}>🛠️ 추가 발주사 (원자재/OEM 생산 등) 관리</h4>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <select 
                        value={selectedAddSupplier} 
                        onChange={e => setSelectedAddSupplier(e.target.value)}
                        style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-default)', fontSize: '15.5px', minWidth: '220px' }}
                      >
                        <option value="">-- 추가할 공급사 선택 --</option>
                        {suppliersList.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                      </select>
                      <button 
                        onClick={handleAddSupplier}
                        style={{ padding: '6px 16px', background: '#3b82f6', border: 'none', color: '#fff', borderRadius: '6px', fontWeight: 700, fontSize: '15.5px', cursor: 'pointer' }}
                      >
                        + 발주사 추가
                      </button>
                    </div>
                    {order.additionalSuppliers && order.additionalSuppliers.length > 0 && (
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                        {order.additionalSuppliers.map(s => (
                          <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f1f5f9', color: '#334155', padding: '4px 10px', borderRadius: '20px', fontSize: '14.5px', fontWeight: 600 }}>
                            {s}
                            <button onClick={() => handleRemoveSupplier(s)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '13.5px', padding: 0, fontWeight: 700 }}>✕</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {allOrderSuppliers.length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14.5px' }}>발주할 공급업체가 없습니다.</div>
                    ) : (
                      allOrderSuppliers.map(supplierName => {
                        const items = groupedSupplierItems[supplierName] || [];
                        const cleanSupplierName = supplierName.replace(/\s+/g, '');
                        const supplierCode = cleanSupplierName.substring(0, 3).toUpperCase();
                        const poNum = `${order.ciNumber || order.id}-${supplierCode}`;

                        return (
                          <div key={supplierName} style={{ border: '2px solid var(--text-secondary)', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 4px 10px rgba(0,0,0,0.03)', marginBottom: '8px' }}>
                            <div style={{ background: '#f8fafc', padding: '10px 16px', borderBottom: '2px solid var(--text-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span style={{ fontWeight: 800, color: '#1e3a8a', fontSize: '14.5px' }}>📄 {supplierName} PO ({poNum})</span>
                                {(() => {
                                  const activeDoc = issuedDocs.find(d => d.status === 'active' && (d.supplier_name === supplierName || d.po_number.includes(cleanSupplierName.substring(0,3).toUpperCase())));
                                  if (activeDoc) {
                                    return (
                                      <span style={{ padding: '2px 8px', background: '#dcfce7', color: '#166534', borderRadius: '4px', fontSize: '14px', fontWeight: 'bold', border: '1px solid #86efac' }}>
                                        ✅ 발행완료 (v{activeDoc.version})
                                      </span>
                                    );
                                  }
                                  return (
                                    <span style={{ padding: '2px 8px', background: '#fef3c7', color: '#92400e', borderRadius: '4px', fontSize: '14px', fontWeight: 'bold', border: '1px solid #fde68a' }}>
                                      📝 작성 / 수정 중
                                    </span>
                                  );
                                })()}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '14.5px' }}>
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
                                    style={{ padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-default)', fontSize: '14.5px', fontWeight: 600, outline: 'none' }}
                                  >
                                    <option value="과세">과세 (10%)</option>
                                    <option value="영세">영세 (0%)</option>
                                  </select>
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  type="button"
                                  onClick={() => handleSaveSupplierPoDetails(supplierName)}
                                  style={{ padding: '5px 10px', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '14.5px' }}
                                  title="수정한 수량, 단가, 스펙, 일반사항을 PDF 발행 없이 DB에 먼저 저장합니다."
                                >
                                  💾 발주 내역 저장
                                </button>
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
                                  style={{ padding: '5px 10px', background: '#f3e8ff', border: '1px solid #d8b4fe', color: '#6b21a8', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '14.5px' }}
                                >
                                  ＋ 품목 추가
                                </button>
                                <button 
                                  onClick={() => handlePrintSupplierPo(supplierName, items)}
                                  style={{ padding: '5px 10px', background: '#f8fafc', border: '1px solid var(--border-default)', color: '#334155', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '14.5px' }}
                                >
                                  미리보기 / 인쇄
                                </button>
                                {(() => {
                                  const activeDoc = issuedDocs.find(d => d.status === 'active' && (d.supplier_name === supplierName || d.po_number.includes(cleanSupplierName.substring(0,3).toUpperCase())));
                                  const isIssued = !!activeDoc;
                                  const nextVersion = isIssued ? (activeDoc.version || 1) + 1 : 1;

                                  return (
                                    <button 
                                      type="button"
                                      onClick={() => {
                                        if (isIssued) {
                                          if (!window.confirm(`이미 [v${activeDoc.version}] 발주서가 발행되어 있습니다.\n\n수정한 내용으로 [v${nextVersion}] 차수 발주서를 수정 및 재발행하시겠습니까?`)) {
                                            return;
                                          }
                                        }
                                        issueAndSavePO(supplierName, items);
                                      }}
                                      style={{ 
                                        padding: '5px 12px', 
                                        background: isIssued ? '#fef3c7' : '#eff6ff', 
                                        border: isIssued ? '1px solid #f59e0b' : '1px solid #bfdbfe', 
                                        color: isIssued ? '#b45309' : '#1e40af', 
                                        borderRadius: '4px', 
                                        cursor: 'pointer', 
                                        fontWeight: 800, 
                                        fontSize: '14.5px'
                                      }}
                                      title={isIssued ? `수정된 내용을 바탕으로 v${nextVersion} 차수 발주서 수정 및 재발행` : '발주서 PDF를 발행하고 클라우드에 저장합니다.'}
                                    >
                                      {isIssued ? `✏️ 발주서 수정 & 재발행 (v${nextVersion})` : '📥 발주서 발행 및 저장'}
                                    </button>
                                  );
                                })()}
                                 <button 
                                  onClick={() => handleSendPoEmail(supplierName, items)}
                                  style={{ 
                                    padding: '5px 10px', 
                                    background: ((order as any)?.po_dispatch_status?.[supplierName]?.emailSent || sentEmailSuppliers[supplierName]) ? '#dcfce7' : '#f0fdf4', 
                                    border: ((order as any)?.po_dispatch_status?.[supplierName]?.emailSent || sentEmailSuppliers[supplierName]) ? '1px solid #86efac' : '1px solid #bbf7d0', 
                                    color: ((order as any)?.po_dispatch_status?.[supplierName]?.emailSent || sentEmailSuppliers[supplierName]) ? '#166534' : '#15803d', 
                                    borderRadius: '4px', 
                                    cursor: 'pointer', 
                                    fontWeight: 750, 
                                    fontSize: '13.5px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                  title="공급사 이메일로 발주서 발행 알림 직접 발송 (Brevo)"
                                >
                                  {((order as any)?.po_dispatch_status?.[supplierName]?.emailSent || sentEmailSuppliers[supplierName]) ? (
                                    <>
                                      <svg style={{ width: '13px', height: '13px' }} viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                      <span>메일 발송</span>
                                    </>
                                  ) : (
                                    <>
                                      <svg style={{ width: '13px', height: '13px' }} viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                                      <span>메일 발송</span>
                                    </>
                                  )}
                                </button>
                                <button 
                                  onClick={() => handleCopyKatalkPoMessage(supplierName, items)}
                                  style={{ 
                                    padding: '5px 10px', 
                                    background: '#FEE500', 
                                    border: ((order as any)?.po_dispatch_status?.[supplierName]?.katalkCopied || copiedKatalkSuppliers[supplierName]) ? '1px solid #ca8a04' : '1px solid #eab308', 
                                    color: '#191919', 
                                    borderRadius: '4px', 
                                    cursor: 'pointer', 
                                    fontWeight: 750, 
                                    fontSize: '13.5px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                  }}
                                  title="카카오톡 단체방 공유용 텍스트 메시지 복사"
                                >
                                  {((order as any)?.po_dispatch_status?.[supplierName]?.katalkCopied || copiedKatalkSuppliers[supplierName]) ? (
                                    <>
                                      <svg style={{ width: '13px', height: '13px' }} viewBox="0 0 24 24" fill="none" stroke="#191919" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                      <span>카톡 발송</span>
                                    </>
                                  ) : (
                                    <>
                                      <svg style={{ width: '13px', height: '13px' }} viewBox="0 0 24 24" fill="#191919"><path d="M12 3c-4.97 0-9 3.185-9 7.115 0 2.557 1.707 4.8 4.27 6.054-.188.702-.682 2.545-.78 2.94-.122.49.18.483.378.352.156-.103 2.48-1.688 3.483-2.373.535.078 1.085.127 1.649.127 4.97 0 9-3.186 9-7.115S16.97 3 12 3z"/></svg>
                                      <span>카톡 발송</span>
                                    </>
                                  )}
                                </button>
                                
                                
                              </div>
                            </div>
                            {/* 1. 상호, 일자 및 품목 테이블 + 생산완료일 */}
                            <div style={{ padding: '12px 16px', background: '#fff', fontSize: '13.5px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span><strong>상호:</strong> {order.issuingCompany === 'YS' ? 'YS ACC' : 'YSACC CO., LTD.'}</span>
                                <span><strong>일자:</strong> {new Date().toISOString().split('T')[0]}</span>
                              </div>
                              <table style={{ width: '100%', minWidth: '1000px', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: '15.5px', marginTop: '5px' }}>
                                <thead>
                                  <tr style={{ background: '#f1f5f9', borderBottom: '1px solid var(--border-default)' }}>
                                    <th style={{ padding: '6px', textAlign: 'left', width: '320px' }}>품목명</th>
                                    <th style={{ padding: '6px', textAlign: 'center', width: '140px' }}>스펙</th>
                                    <th style={{ padding: '6px', textAlign: 'center', width: '140px' }}>수량</th>
                                    <th style={{ padding: '6px', textAlign: 'right', width: '130px' }}>매입가<br/>(통화/단가)</th>
                                    <th style={{ padding: '6px', textAlign: 'right', width: '130px' }}>실매입가<br/>(통화/단가)</th>
                                    <th style={{ padding: '6px', textAlign: 'right', width: '90px' }}>금액</th>
                                    <th style={{ padding: '6px', textAlign: 'right', width: '80px' }}>부가세</th>
                                    <th style={{ padding: '6px', textAlign: 'right', width: '100px' }}>합계</th>
                                    <th style={{ padding: '6px', textAlign: 'center', width: '60px' }}>순서/관리</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.length === 0 ? (
                                    <tr>
                                      <td colSpan={9} style={{ padding: '12px', textAlign: 'center', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                        연결된 품목이 없습니다. (상단 '＋ 품목 추가' 버튼을 눌러 추가)
                                      </td>
                                    </tr>
                                  ) : (
                                    items.map((it, idx) => {
                                      const { purchasePrice, purchaseCurrency, itemName, originalPurchasePrice } = getSupplierPurchaseInfo(it);
                                      const origCurrency = it.originalPurchaseCurrency || (it.originalPurchasePrice != null ? (it.originalPurchasePrice > 1000 ? 'KRW' : 'USD') : purchaseCurrency);
                                      
                                      const totalPurchaseAmount = purchasePrice * (it.qty || 0);
                                      const itemIndexInMain = sourcingItems.findIndex(x => x === it);
                                      
                                      const isDragOver = sourcingDragOverIndex === itemIndexInMain;
                                      return (
                                        <tr 
                                          key={`sourcing-item-${it.itemId || idx}-${itemIndexInMain}`}
                                          draggable={true}
                                          onDragStart={(e) => handleSourcingDragStart(e, itemIndexInMain)}
                                          onDragOver={(e) => handleSourcingDragOver(e, itemIndexInMain)}
                                          onDragLeave={handleSourcingDragLeave}
                                          onDrop={(e) => handleSourcingDrop(e, itemIndexInMain)}
                                          style={{ 
                                            borderBottom: isDragOver ? '2px solid #2563eb' : '1px solid #f1f5f9',
                                            backgroundColor: isDragOver ? '#dbeafe' : 'transparent'
                                          }}
                                        >
                                          {/* 1. 상품코드 + 품목명 (병합 열) */}
                                          <td style={{ padding: '4px', verticalAlign: 'middle' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                              <span style={{ cursor: 'grab', fontSize: '13px', color: '#94a3b8', userSelect: 'none', padding: '0 2px' }} title="드래그하여 순서 변경">
                                                ⋮⋮
                                              </span>
                                              <span style={{ fontSize: '15.5px', fontWeight: 'bold', color: 'var(--text-secondary)', minWidth: '18px' }}>{idx + 1}.</span>
                                              {isEditing ? (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                  <input
                                                    type="text"
                                                    value={it.name || ''}
                                                    onChange={(e) => handleSourcingItemChange(itemIndexInMain, 'name', e.target.value)}
                                                    placeholder="품목명 직접 입력"
                                                    style={{ width: '260px', padding: '3px 4px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '15.5px' }}
                                                  />
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setSearchItemIndex(itemIndexInMain);
                                                      setIsSourcingSearch(true);
                                                      setIsProductSearchOpen(true);
                                                    }}
                                                    style={{ padding: '3px 6px', background: '#f1f5f9', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '14.5px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                    title="품목 검색"
                                                  >
                                                    🔍
                                                  </button>
                                                </div>
                                              ) : (
                                                <strong style={{ fontSize: '15.5px', color: '#334155' }}>{itemName}</strong>
                                              )}
                                            </div>
                                          </td>
                                          {/* 2. 스펙 */}
                                          <td style={{ padding: '4px', textAlign: 'center', verticalAlign: 'middle' }}>
                                            {isEditing ? (
                                              <textarea
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
                                                rows={1}
                                                style={{
                                                  width: '120px',
                                                  padding: '4px 6px',
                                                  border: '1px solid var(--border-default)',
                                                  borderRadius: '4px',
                                                  fontSize: '15.5px',
                                                  textAlign: 'left',
                                                  resize: 'both',
                                                  minWidth: '80px',
                                                  minHeight: '29px',
                                                  fontFamily: 'inherit',
                                                  overflow: 'auto',
                                                  boxSizing: 'border-box'
                                                }}
                                              />
                                            ) : (
                                              it.grade || '-'
                                            )}
                                          </td>
                                          {/* 3. 수량 */}
                                          <td style={{ padding: '4px', textAlign: 'right', verticalAlign: 'middle' }}>
                                            {isEditing ? (
                                              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', justifyContent: 'flex-end' }}>
                                                <input
                                                  type="text"
                                                  inputMode="numeric"
                                                  pattern="[0-9]*"
                                                  value={it.qty || 0}
                                                  onChange={(e) => {
                                                    const val = e.target.value.replace(/[^0-9]/g, '');
                                                    handleSourcingItemChange(itemIndexInMain, 'qty', val === '' ? 0 : parseInt(val, 10));
                                                  }}
                                                  style={{ width: '70px', padding: '3px 4px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '15.5px', textAlign: 'right' }}
                                                />
                                                <input
                                                  type="text"
                                                  value={it.unit || 'kg'}
                                                  onChange={(e) => handleSourcingItemChange(itemIndexInMain, 'unit', e.target.value)}
                                                  style={{ width: '32px', padding: '3px 2px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '15.5px', textAlign: 'center' }}
                                                />
                                              </div>
                                            ) : (
                                              `${it.qty?.toLocaleString()} ${it.unit}`
                                            )}
                                          </td>
                                          {/* 4. 매입가 (통화/단가) */}
                                          <td style={{ padding: '4px', textAlign: 'right', verticalAlign: 'middle' }}>
                                            {isEditing ? (
                                              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', justifyContent: 'flex-end' }}>
                                                <select
                                                  value={origCurrency}
                                                  onChange={(e) => handleCurrencySelection(e.target.value, origCurrency, customCurrencies, val => handleSourcingItemChange(itemIndexInMain, 'originalPurchaseCurrency', val))}
                                                  style={{ width: '42px', padding: '2px 2px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '15.5px', background: '#fff' }}
                                                >
                                                  {[...DEFAULT_CURRENCIES, ...customCurrencies].map(c => <option key={c} value={c}>{c}</option>)}
                                                  <option value="ADD_NEW_CURRENCY" style={{ color: '#2563eb', fontWeight: 'bold' }}>+</option>
                                                </select>
                                                <input
                                                  type="text"
                                                  value={
                                                    editingOriginalPurchasePrice[itemIndexInMain] !== undefined
                                                      ? editingOriginalPurchasePrice[itemIndexInMain]
                                                      : (() => {
                                                          const val = it.originalPurchasePrice || 0;
                                                          return origCurrency === 'KRW'
                                                            ? Math.round(val).toLocaleString('ko-KR')
                                                            : val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
                                                        })()
                                                  }
                                                  onChange={(e) => {
                                                    const rawText = e.target.value;
                                                    setEditingOriginalPurchasePrice(prev => ({
                                                      ...prev,
                                                      [itemIndexInMain]: rawText
                                                    }));
                                                    const rawNum = rawText.replace(/,/g, '');
                                                    const val = parseFloat(rawNum) || 0;
                                                    handleSourcingItemChange(itemIndexInMain, 'originalPurchasePrice', val);
                                                  }}
                                                  onBlur={() => {
                                                    setEditingOriginalPurchasePrice(prev => {
                                                      const copy = { ...prev };
                                                      delete copy[itemIndexInMain];
                                                      return copy;
                                                    });
                                                  }}
                                                  style={{ width: '70px', padding: '3px 4px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '15.5px', textAlign: 'right' }}
                                                />
                                              </div>
                                            ) : (
                                              `${origCurrency === 'KRW' ? '₩' : '$'}${originalPurchasePrice?.toLocaleString(undefined, origCurrency === 'KRW' ? {} : { minimumFractionDigits: 2 })}`
                                            )}
                                          </td>
                                          {/* 5. 실매입가 (통화/단가) */}
                                          <td style={{ padding: '4px', textAlign: 'right', verticalAlign: 'middle' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px' }}>
                                              <select
                                                value={purchaseCurrency}
                                                disabled={!isEditing}
                                                onChange={(e) => {
                                                  handleCurrencySelection(e.target.value, purchaseCurrency, customCurrencies, val => {
                                                    setSourcingItems(prev => {
                                                      return prev.map(item => {
                                                        if (item === it) {
                                                          return { ...item, purchaseUnitCurrency: val as any };
                                                        }
                                                        return item;
                                                      });
                                                    });
                                                  });
                                                }}
                                                style={{ width: '42px', padding: '2px 2px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '15.5px', outline: 'none', background: isEditing ? '#fff' : '#f1f5f9' }}
                                              >
                                                {[...DEFAULT_CURRENCIES, ...customCurrencies].map(c => <option key={c} value={c}>{c}</option>)}
                                                <option value="ADD_NEW_CURRENCY" style={{ color: '#2563eb', fontWeight: 'bold' }}>+</option>
                                              </select>
                                              <input
                                                type="text"
                                                value={
                                                  editingPurchasePrice[itemIndexInMain] !== undefined
                                                    ? editingPurchasePrice[itemIndexInMain]
                                                    : (() => {
                                                        const val = it.purchaseUnitPrice ?? originalPurchasePrice;
                                                        return purchaseCurrency === 'KRW' 
                                                          ? Math.round(val).toLocaleString('ko-KR')
                                                          : val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
                                                      })()
                                                }
                                                disabled={!isEditing}
                                                onChange={(e) => {
                                                  const rawText = e.target.value;
                                                  setEditingPurchasePrice(prev => ({
                                                    ...prev,
                                                    [itemIndexInMain]: rawText
                                                  }));
                                                  
                                                  const rawNum = rawText.replace(/,/g, '');
                                                  const val = parseFloat(rawNum) || 0;
                                                  setSourcingItems(prev => {
                                                    return prev.map(item => {
                                                      if (item === it) {
                                                        return { ...item, purchaseUnitPrice: val };
                                                      }
                                                      return item;
                                                    });
                                                  });
                                                }}
                                                onBlur={() => {
                                                  setEditingPurchasePrice(prev => {
                                                    const copy = { ...prev };
                                                    delete copy[itemIndexInMain];
                                                    return copy;
                                                  });
                                                }}
                                                style={{
                                                  width: '70px',
                                                  padding: '3px 4px',
                                                  border: '1px solid var(--border-default)',
                                                  borderRadius: '4px',
                                                  fontSize: '15.5px',
                                                  textAlign: 'right'
                                                }}
                                              />
                                            </div>
                                          </td>
                                          {/* 6. 금액 */}
                                          <td style={{ padding: '4px', textAlign: 'right', verticalAlign: 'middle' }}>
                                            {purchaseCurrency === 'KRW' ? '₩' : '$'}{totalPurchaseAmount.toLocaleString(undefined, purchaseCurrency === 'KRW' ? {} : { minimumFractionDigits: 2 })}
                                          </td>
                                          {/* 7. 부가세 */}
                                          <td style={{ padding: '4px', textAlign: 'right', color: 'var(--text-secondary)', verticalAlign: 'middle' }}>
                                            {(() => {
                                              const taxType = basicForm.supplierTaxTypes[supplierName] || '과세';
                                              const vatAmt = taxType === '영세' ? 0 : (purchaseCurrency === 'KRW' ? Math.round(totalPurchaseAmount * 0.1) : parseFloat((totalPurchaseAmount * 0.1).toFixed(2)));
                                              return `${purchaseCurrency === 'KRW' ? '₩' : '$'} ${vatAmt.toLocaleString(undefined, purchaseCurrency === 'KRW' ? {} : { minimumFractionDigits: 2 })}`;
                                            })()}
                                          </td>
                                          {/* 8. 합계 */}
                                          <td style={{ padding: '4px', textAlign: 'right', fontWeight: 700, color: '#0f172a', verticalAlign: 'middle' }}>
                                            {(() => {
                                              const taxType = basicForm.supplierTaxTypes[supplierName] || '과세';
                                              const vatAmt = taxType === '영세' ? 0 : (purchaseCurrency === 'KRW' ? Math.round(totalPurchaseAmount * 0.1) : parseFloat((totalPurchaseAmount * 0.1).toFixed(2)));
                                              const grandAmt = totalPurchaseAmount + vatAmt;
                                              return `${purchaseCurrency === 'KRW' ? '₩' : '$'} ${grandAmt.toLocaleString(undefined, purchaseCurrency === 'KRW' ? {} : { minimumFractionDigits: 2 })}`;
                                            })()}
                                          </td>
                                          {/* 9. 관리 (복사 / 삭제) */}
                                          <td style={{ padding: '4px', textAlign: 'center', verticalAlign: 'middle' }}>
                                            <div style={{ display: 'flex', gap: '3px', justifyContent: 'center', alignItems: 'center' }}>
                                              <button
                                                type="button"
                                                onClick={() => copySourcingItem(itemIndexInMain)}
                                                style={{ padding: '3px 6px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', borderRadius: '3px', fontSize: '11.5px', cursor: 'pointer', fontWeight: 700 }}
                                                title="동일 품목 복사 추가"
                                              >
                                                📋
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  if (window.confirm('정말 이 품목을 발주에서 제외하시겠습니까?')) {
                                                    setSourcingItems(prev => prev.filter(x => x !== it));
                                                  }
                                                }}
                                                style={{ padding: '3px 6px', background: '#fee2e2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '3px', fontSize: '11.5px', cursor: 'pointer', fontWeight: 600 }}
                                                title="품목 삭제"
                                              >
                                                삭제
                                              </button>
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    })
                                  )}
                                  {/* SUBTOTAL ROW */}
                                  {items.length > 0 && (
                                    <tr style={{ background: '#f8fafc', borderTop: '2px solid var(--border-default)', fontWeight: 700 }}>
                                      <td colSpan={5} style={{ padding: '8px 12px', textAlign: 'right', color: '#1e3a8a' }}>SUBTOTAL (합계)</td>
                                      {/* 금액합계 */}
                                      <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                                        {(() => {
                                          const usdAmount = items.filter(it => getSupplierPurchaseInfo(it).purchaseCurrency !== 'KRW').reduce((sum, it) => sum + getSupplierPurchaseInfo(it).purchasePrice * (it.qty || 0), 0);
                                          const krwAmount = items.filter(it => getSupplierPurchaseInfo(it).purchaseCurrency === 'KRW').reduce((sum, it) => sum + getSupplierPurchaseInfo(it).purchasePrice * (it.qty || 0), 0);
                                          const parts = [];
                                          if (usdAmount > 0) parts.push(`$${usdAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
                                          if (krwAmount > 0) parts.push(`₩${krwAmount.toLocaleString()}`);
                                          return <span style={{ color: '#0f766e' }}>{parts.length > 0 ? parts.join(' / ') : '₩0'}</span>;
                                        })()}
                                      </td>
                                      {/* 부가세 합계 */}
                                      <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                                        {(() => {
                                          const usdAmount = items.filter(it => getSupplierPurchaseInfo(it).purchaseCurrency !== 'KRW').reduce((sum, it) => sum + getSupplierPurchaseInfo(it).purchasePrice * (it.qty || 0), 0);
                                          const krwAmount = items.filter(it => getSupplierPurchaseInfo(it).purchaseCurrency === 'KRW').reduce((sum, it) => sum + getSupplierPurchaseInfo(it).purchasePrice * (it.qty || 0), 0);
                                          const taxType = basicForm.supplierTaxTypes[supplierName] || '과세';
                                          const usdVat = taxType === '영세' ? 0 : parseFloat((usdAmount * 0.1).toFixed(2));
                                          const krwVat = taxType === '영세' ? 0 : Math.round(krwAmount * 0.1);
                                          const parts = [];
                                          if (usdVat > 0) parts.push(`$${usdVat.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
                                          if (krwVat > 0) parts.push(`₩${krwVat.toLocaleString()}`);
                                          return <span style={{ color: '#4b5563' }}>{parts.length > 0 ? parts.join(' / ') : '₩0'}</span>;
                                        })()}
                                      </td>
                                      {/* 합계 총합 */}
                                      <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                                        {(() => {
                                          const usdAmount = items.filter(it => getSupplierPurchaseInfo(it).purchaseCurrency !== 'KRW').reduce((sum, it) => sum + getSupplierPurchaseInfo(it).purchasePrice * (it.qty || 0), 0);
                                          const krwAmount = items.filter(it => getSupplierPurchaseInfo(it).purchaseCurrency === 'KRW').reduce((sum, it) => sum + getSupplierPurchaseInfo(it).purchasePrice * (it.qty || 0), 0);
                                          const taxType = basicForm.supplierTaxTypes[supplierName] || '과세';
                                          const usdVat = taxType === '영세' ? 0 : parseFloat((usdAmount * 0.1).toFixed(2));
                                          const krwVat = taxType === '영세' ? 0 : Math.round(krwAmount * 0.1);
                                          const usdGrand = usdAmount + usdVat;
                                          const krwGrand = krwAmount + krwVat;
                                          const parts = [];
                                          if (usdGrand > 0) parts.push(`$${usdGrand.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
                                          if (krwGrand > 0) parts.push(`₩${krwGrand.toLocaleString()}`);
                                          return <span style={{ color: '#dc2626' }}>{parts.length > 0 ? parts.join(' / ') : '₩0'}</span>;
                                        })()}
                                      </td>
                                      {/* 순서/관리 공간 확보용 빈 셀 */}
                                      <td></td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                              
                              {/* 생산완료일만 표시 (납품처는 상단 공통 필드로 이관) */}
                              <div style={{ display: 'flex', gap: '15px', alignItems: 'center', background: '#f8fafc', padding: '10px 16px', borderTop: '1px solid var(--border-default)', marginTop: '10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontWeight: 600, fontSize: '15.5px', color: '#4b5563', whiteSpace: 'nowrap' }}>생산완료일:</span>
                                  <DateInput 
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
                                    style={{ padding: '4px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '14.5px', width: '150px' }}
                                  />
                                </div>
                              </div>
                            </div>

                            {/* 2. 일반사항 Panel */}
                            <div style={{ padding: '0 16px 12px 16px', background: '#fff', fontSize: '13.5px' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px', background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-default)', marginBottom: '12px' }}>

                                {/* 일반사항 */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: 'span 2' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                                    <label style={{ fontWeight: 'bold', fontSize: '15.5px', color: 'var(--text-secondary)' }}>※ 일반사항 (줄바꿈 가능)</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <select
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          if (!val) return;
                                          setSelectedPresetText(prev => ({
                                            ...prev,
                                            [supplierName]: val
                                          }));
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
                                        style={{ padding: '3px 6px', fontSize: '13.5px', border: '1px solid var(--border-default)', borderRadius: '4px', maxWidth: '200px', outline: 'none' }}
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
                                        style={{ padding: '3px 8px', background: 'var(--text-secondary)', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '13.5px', fontWeight: 'bold', cursor: 'pointer' }}
                                      >
                                        ➕ 신규 등록 (DB)
                                      </button>
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          const originalText = selectedPresetText[supplierName];
                                          const currentText = basicForm.supplierPoDetails?.[supplierName]?.generalNotes || '';
                                          if (!originalText) {
                                            alert("수정할 템플릿을 목록(📋 등록된 템플릿 선택)에서 먼저 선택해 주세요.");
                                            return;
                                          }
                                          if (!currentText.trim()) {
                                            alert("수정할 문구를 입력해주세요.");
                                            return;
                                          }
                                          if (originalText === currentText) {
                                            alert("템플릿 내용이 변경되지 않았습니다.");
                                            return;
                                          }
                                          await handleEditPoPreset('generalNotes', originalText, currentText);
                                          setSelectedPresetText(prev => ({
                                            ...prev,
                                            [supplierName]: currentText
                                          }));
                                        }}
                                        style={{ padding: '3px 8px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '13.5px', fontWeight: 'bold', cursor: 'pointer' }}
                                      >
                                        ✏️ 수정 (DB)
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          const selectEl = e.currentTarget.previousElementSibling?.previousElementSibling?.previousElementSibling as HTMLSelectElement;
                                          if (selectEl && selectEl.value) {
                                            handleDeletePoPreset('generalNotes', selectEl.value);
                                          } else {
                                            alert("삭제할 템플릿을 목록에서 먼저 선택해 주세요.");
                                          }
                                        }}
                                        style={{ padding: '3px 8px', background: 'var(--text-muted)', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '13.5px', fontWeight: 'bold', cursor: 'pointer' }}
                                      >
                                        ❌ 삭제
                                      </button>
                                    </div>
                                  </div>
                                  <textarea 
                                    rows={2}
                                    placeholder="1. 부가가치세(VAT): 일반 전자세금계산서 발행 기준\n2. 결제조건: L/C 90 days from B/L date"
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
                                    style={{ padding: '6px 10px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '14.5px', background: '#fff', outline: 'none', fontFamily: 'sans-serif' }}
                                  />
                                </div>
                              </div>
                            </div>

                            {/* 3. 발행 문서 보관함 */}
                            {issuedDocs.filter(d => d.supplier_name === supplierName || d.po_number.includes(supplierName.replace(/\s+/g, '').substring(0,3).toUpperCase())).length > 0 && (
                              <div style={{ margin: '0 16px 15px 16px', padding: '12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                                <h4 style={{ margin: '0 0 10px 0', fontSize: '15.5px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  📁 발행 문서 보관함
                                </h4>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14.5px', backgroundColor: '#fff' }}>
                                  <thead>
                                    <tr style={{ borderBottom: '2px solid var(--border-default)', backgroundColor: '#f1f5f9' }}>
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
                                      <tr key={doc.id} style={{ borderBottom: '1px solid var(--border-color)', color: doc.status === 'superseded' ? 'var(--text-muted)' : 'inherit' }}>
                                        <td style={{ padding: '6px', textAlign: 'center' }}>{idx + 1}</td>
                                        <td style={{ padding: '6px', textAlign: 'left' }}>
                                          {doc.fileName}
                                          {doc.status === 'active' && <span style={{ marginLeft: '6px', padding: '2px 6px', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '4px', fontSize: '14.5px', fontWeight: 'bold' }}>최신</span>}
                                        </td>
                                        <td style={{ padding: '6px', textAlign: 'center' }}>{new Date(doc.issuedAt).toLocaleString()}</td>
                                        <td style={{ padding: '6px', textAlign: 'center' }}>v{doc.version}</td>
                                        <td style={{ padding: '6px', textAlign: 'center' }}>{doc.issuedBy}</td>
                                        <td style={{ padding: '6px', textAlign: 'center' }}>
                                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center' }}>
                                            <button
                                              type="button"
                                              onClick={() => previewFile(doc.fileUrl, doc.fileName)}
                                              style={{ padding: '4px 8px', backgroundColor: '#3b82f6', border: 'none', borderRadius: '4px', color: '#fff', fontSize: '14px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                              title="미리보기 (보기)"
                                            >
                                              🔍
                                            </button>
                                            <button 
                                              type="button"
                                              onClick={() => handleDeletePoIssuedDoc(doc.id, doc.fileName)} 
                                              style={{ padding: '4px 8px', backgroundColor: '#fee2e2', border: '1px solid #fecaca', borderRadius: '4px', color: '#dc2626', fontSize: '13.5px', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}
                                              title="발행 문서 삭제"
                                            >
                                              🗑️ 삭제
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}                </div>
                        );
                      })
                    )}
                  </div>

                {allOrderSuppliers.length >= 2 && (
                  <div style={{ background: '#fff', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '14.5px', fontWeight: 800, color: '#1e3a8a' }}>📁 전체 공급사 발주서 통합 보관함 ({allOrderSuppliers.length}개사)</h4>
                    <div style={{ fontSize: '13.5px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                      해당 오더에 대해 시스템을 통해 발행된 모든 발주서 PDF 원본을 통합 관리합니다.
                    </div>
                    {issuedDocs.length > 0 ? (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14.5px', backgroundColor: '#fff', border: '1px solid var(--border-color)' }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid var(--border-default)', backgroundColor: '#f1f5f9' }}>
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
                            <tr key={doc.id} style={{ borderBottom: '1px solid var(--border-color)', color: doc.status === 'superseded' ? 'var(--text-muted)' : 'inherit' }}>
                              <td style={{ padding: '8px', textAlign: 'center' }}>{idx + 1}</td>
                              <td style={{ padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>{doc.supplier_name}</td>
                              <td style={{ padding: '8px', textAlign: 'left' }}>
                                {doc.fileName}
                                {doc.status === 'active' && <span style={{ marginLeft: '6px', padding: '2px 6px', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '4px', fontSize: '14.5px', fontWeight: 'bold' }}>최신</span>}
                              </td>
                              <td style={{ padding: '8px', textAlign: 'center' }}>{new Date(doc.issuedAt).toLocaleString()}</td>
                              <td style={{ padding: '8px', textAlign: 'center' }}>v{doc.version}</td>
                              <td style={{ padding: '8px', textAlign: 'center' }}>{doc.issuedBy}</td>
                              <td style={{ padding: '8px', textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center', flexWrap: 'nowrap' }}>
                                  <button
                                    type="button"
                                    onClick={() => previewFile(doc.fileUrl, doc.fileName)}
                                    style={{ padding: '4px 8px', backgroundColor: '#3b82f6', border: 'none', borderRadius: '4px', color: '#fff', fontSize: '14px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                    title="미리보기 (보기)"
                                  >
                                    🔍
                                  </button>
                                  {isAdmin && (
                                    <button type="button" onClick={() => handleDeletePoIssuedDoc(doc.id, doc.fileName)} style={{ padding: '4px 8px', backgroundColor: '#fee2e2', border: '1px solid #fecaca', borderRadius: '4px', color: '#dc2626', fontSize: '13.5px', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }} title="발행 문서 삭제">🗑️ 삭제</button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div style={{ padding: '20px', textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: '6px', color: 'var(--text-muted)', fontSize: '13.5px', border: '1px solid var(--border-color)' }}>
                        발행된 발주서가 없습니다. 소싱발주 탭에서 발주서를 발행해주세요.
                      </div>
                    )}
                  </div>
                )}

                  </>
            </div>
          )}

          {/* 4. 물류/선적 */}
          {activeStep === '물류/선적' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* 물류/선적 하위 탭 메뉴 */}
              <div style={{ display: 'flex', borderBottom: '2px solid var(--border-color)', gap: '8px', marginBottom: '8px' }}>
                {[
                  { id: '선적관리', label: '포워딩/운송사 선정' },
                  { id: '패킹리스트', label: '패킹 및 컨테이너로딩플랜' },
                  { id: '도착보고_쉬핑마크', label: '도착보고' }
                ].map(tab => {
                  const isActive = activeLogisticsTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={async () => {
                        updateQuery({ logisticsTab: tab.id });
                        await handleSaveBasic(false, tab.id);
                      }}
                      style={{
                        padding: '10px 16px',
                        fontSize: '15.5px',
                        fontWeight: 700,
                        color: isActive ? '#2563eb' : 'var(--text-secondary)',
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

              {/* 1) 선적관리 정보 등록 */}
              {activeLogisticsTab === '선적관리' && (

                <div style={{ background: '#fff', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '14.5px', fontWeight: 800, color: '#1e3a8a' }}>🚢 포워딩/운송사 선정</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                    {/* 제품준비일 및 선적일정 수립 가이드 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px 16px', borderRadius: '8px', gridColumn: 'span 3', marginBottom: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '15.5px', fontWeight: 800, color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>💡</span> 생산 기준 제품준비일 (최종 생산완료일)
                        </span>
                        <span style={{ fontSize: '15.5px', fontWeight: 800, color: '#15803d', background: '#dcfce7', padding: '2px 8px', borderRadius: '6px' }}>
                          {basicForm.cargoReadyDate ? `📅 ${basicForm.cargoReadyDate}` : '미정 (소싱발주 탭에서 생산완료일 지정)'}
                        </span>
                      </div>
                      <div style={{ fontSize: '15.5px', color: '#166534', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
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
                              fontSize: '15.5px',
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

                    {/* 포워딩업체 목록 & 수출할 VOLUME 2컬럼 배치 */}
                    <div style={{ gridColumn: 'span 3', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '8px' }}>
                      
                      {/* 1) 왼쪽 컬럼: 포워딩업체 목록 및 비용 */}
                      <div style={{ border: '1px solid #ddd6fe', borderRadius: '8px', padding: '14px', background: '#f5f3ff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '15.5px', fontWeight: 700, color: '#7c3aed' }}>🚢 포워딩/운송사</span>
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
                            style={{ padding: '4px 10px', fontSize: '15.5px', fontWeight: 700, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '4px', cursor: isEditing ? 'pointer' : 'not-allowed' }}
                          >
                            + 운송사 추가
                          </button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '6px', marginBottom: '4px' }}>
                          <span style={{ fontSize: '15.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>포워딩사/운송사명 (클릭)</span>
                          <span></span>
                          <span></span>
                        </div>
                        {forwardersList.length === 0 ? (
                          <div style={{ padding: '10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '15.5px' }}>포워더/운송사를 추가하세요 (최대 4개)</div>
                        ) : (
                          forwardersList.map((fw, idx) => {
                            return (
                            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
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
                                  style={{ flex: 1, padding: '6px 8px', border: '1px solid #ddd6fe', borderRadius: '4px', fontSize: '14.5px', boxSizing: 'border-box', background: '#f8fafc', cursor: isEditing ? 'pointer' : 'default', outline: 'none' }}
                                />
                              </div>
                              <button
                                type="button"
                                disabled={!isEditing}
                                onClick={() => {
                                  setForwarderSearchIndex(idx);
                                  setIsForwarderSearchOpen(true);
                                }}
                                style={{ padding: '6px 8px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '14.5px', fontWeight: 700, cursor: isEditing ? 'pointer' : 'not-allowed', height: '30px', display: 'flex', alignItems: 'center' }}
                              >
                                🔍
                              </button>
                              <button
                                type="button"
                                disabled={!isEditing}
                                onClick={() => removeForwarderRow(idx)}
                                style={{ padding: '6px 10px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', cursor: isEditing ? 'pointer' : 'not-allowed', fontSize: '14.5px', fontWeight: 700, height: '30px', display: 'flex', alignItems: 'center' }}
                              >✕</button>
                            </div>
                            );
                          })
                        )}
                      </div>

                      {/* 2) 오른쪽 컬럼: 수출할 VOLUME 입력 영역 */}
                      <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '14px', background: '#f8fafc' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
                          <span style={{ fontSize: '15.5px', fontWeight: 700, color: '#1e3a8a' }}>📦 수출할 VOLUME</span>
                          <div style={{ display: 'flex', gap: '10px' }}>
                            <label style={{ fontSize: '13.5px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name="shipmentType"
                                value="LCL"
                                checked={basicForm.shipmentType === 'LCL'}
                                disabled={!isEditing}
                                onChange={() => handleUpdateVolumeDataDirectly('LCL', basicForm.fclSpecs || [])}
                              /> LCL
                            </label>
                            <label style={{ fontSize: '13.5px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name="shipmentType"
                                value="FCL"
                                checked={basicForm.shipmentType === 'FCL' || !basicForm.shipmentType}
                                disabled={!isEditing}
                                onChange={() => handleUpdateVolumeDataDirectly('FCL', basicForm.fclSpecs || [])}
                              /> FCL
                            </label>
                          </div>
                        </div>

                        {(basicForm.shipmentType === 'FCL' || !basicForm.shipmentType) && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                              <span style={{ fontSize: '15.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>FCL 컨테이너 상세 정보</span>
                              {isEditing && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const current = basicForm.fclSpecs || [];
                                    handleUpdateVolumeDataDirectly(
                                      (basicForm.shipmentType || 'FCL') as any,
                                      [...current, { type: '20GP', qty: 1, containerNo: '', sealNo: '' }]
                                    );
                                  }}
                                  style={{ padding: '3px 8px', fontSize: '13.5px', fontWeight: 700, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                >
                                  + 컨테이너 추가
                                </button>
                              )}
                            </div>

                            {(basicForm.fclSpecs || []).length === 0 ? (
                              <div style={{ padding: '8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '15.5px', background: '#fff', borderRadius: '4px', border: '1px dashed var(--border-default)' }}>
                                컨테이너를 추가해주세요 (FCL 선택됨)
                              </div>
                            ) : (
                              (basicForm.fclSpecs || []).map((c, idx) => (
                                <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '4px' }}>
                                  <select
                                    value={c.type}
                                    disabled={!isEditing}
                                    onChange={e => {
                                      const updated = [...(basicForm.fclSpecs || [])];
                                      updated[idx].type = e.target.value as any;
                                      handleUpdateVolumeDataDirectly((basicForm.shipmentType || 'FCL') as any, updated);
                                    }}
                                    style={{ padding: '5px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '14.5px', outline: 'none', background: '#fff', width: '90px' }}
                                  >
                                    {['20GP', '20RF', '20DG', '40GP', '40HQ', '40DG'].map(opt => (
                                      <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                  </select>
                                  <input
                                    type="number"
                                    min="1"
                                    disabled={!isEditing}
                                    value={c.qty || 1}
                                    onChange={e => {
                                      const updated = [...(basicForm.fclSpecs || [])];
                                      updated[idx].qty = parseInt(e.target.value) || 1;
                                      handleUpdateVolumeDataDirectly((basicForm.shipmentType || 'FCL') as any, updated);
                                    }}
                                    style={{ padding: '5px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '14.5px', outline: 'none', width: '50px', textAlign: 'right' }}
                                  />
                                  <span style={{ fontSize: '15.5px', color: 'var(--text-secondary)' }}>대</span>

                                  <input
                                    type="text"
                                    placeholder="Container No."
                                    disabled={!isEditing}
                                    value={c.containerNo || ''}
                                    onChange={e => {
                                      const updated = [...(basicForm.fclSpecs || [])];
                                      updated[idx].containerNo = e.target.value;
                                      handleUpdateVolumeDataDirectly((basicForm.shipmentType || 'FCL') as any, updated);
                                    }}
                                    style={{ padding: '5px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '14.5px', outline: 'none', width: '110px' }}
                                  />
                                  <input
                                    type="text"
                                    placeholder="Seal No."
                                    disabled={!isEditing}
                                    value={c.sealNo || ''}
                                    onChange={e => {
                                      const updated = [...(basicForm.fclSpecs || [])];
                                      updated[idx].sealNo = e.target.value;
                                      handleUpdateVolumeDataDirectly((basicForm.shipmentType || 'FCL') as any, updated);
                                    }}
                                    style={{ padding: '5px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '14.5px', outline: 'none', width: '90px' }}
                                  />

                                  {isEditing && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = (basicForm.fclSpecs || []).filter((_, i) => i !== idx);
                                        handleUpdateVolumeDataDirectly((basicForm.shipmentType || 'FCL') as any, updated);
                                      }}
                                      style={{ padding: '4px 8px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '15.5px', fontWeight: 700 }}
                                    >✕</button>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>

                    </div>

                    {/* Vessel확정(선박명/항차)/DOC CLS/CARGO CLS/ETD/ETA을 한줄로 표시 */}
                    <div style={{ gridColumn: 'span 3', display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1fr', gap: '10px', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '14.5px', fontWeight: 600, color: '#4b5563' }}>Vessel 확정 (선박명/항차)</span>
                        <input type="text" value={basicForm.vesselBooking} onChange={e => setBasicForm(p => ({ ...p, vesselBooking: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="예: HYUNDAI TOKYO V.024E" />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '14.5px', fontWeight: 600, color: '#4b5563' }}>DOC CLS</span>
                        <DateInput value={basicForm.docCutoffDate || ''} onChange={e => setBasicForm(p => ({ ...p, docCutoffDate: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '14.5px', fontWeight: 600, color: '#4b5563' }}>CARGO CLS</span>
                        <DateInput value={basicForm.cargoCutoffDate || ''} onChange={e => setBasicForm(p => ({ ...p, cargoCutoffDate: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '14.5px', fontWeight: 600, color: '#4b5563' }}>
                          ETD (출항예정일) <span style={{ color: '#ef4444' }}>*</span> {!!basicForm.etd?.trim() && <span style={{ color: '#10b981', marginLeft: '4px' }}>✅</span>}
                        </span>
                        <DateInput value={basicForm.etd || ''} onChange={e => setBasicForm(p => ({ ...p, etd: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '14.5px', fontWeight: 600, color: '#4b5563' }}>
                          ETA (입항예정일) <span style={{ color: '#ef4444' }}>*</span> {!!basicForm.eta?.trim() && <span style={{ color: '#10b981', marginLeft: '4px' }}>✅</span>}
                        </span>
                        <DateInput value={basicForm.eta || ''} onChange={e => setBasicForm(p => ({ ...p, eta: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} />
                      </div>
                    </div>

                    {/* 컨테이너작업장소/컨테이너(CFS)입고일/CFS 회사명/주소 및 담당(신규등록 및 저장기능)-1줄 표현 */}
                    <div style={{ gridColumn: 'span 3', display: 'grid', gridTemplateColumns: '120px 140px 1fr', gap: '10px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '14.5px', fontWeight: 600, color: '#4b5563' }}>컨테이너 작업장소</span>
                        {isEditing ? (
                          <select value={basicForm.containerWorkspaceType} onChange={e => setBasicForm(p => ({ ...p, containerWorkspaceType: e.target.value as any }))} style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '14.5px', width: '100%', height: '37px' }}>
                            <option value="">선택사항</option>
                            <option value="CFS">CFS 작업</option>
                            <option value="Door">Door 작업</option>
                          </select>
                        ) : (
                          <input type="text" value={basicForm.containerWorkspaceType === 'CFS' ? 'CFS 작업' : basicForm.containerWorkspaceType === 'Door' ? 'Door 작업' : '-'} disabled style={inputStyle(false)} />
                        )}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '14.5px', fontWeight: 600, color: '#4b5563' }}>컨테이너(CFS)입고일</span>
                        <DateInput value={basicForm.cfsEntryDate} onChange={e => setBasicForm(p => ({ ...p, cfsEntryDate: e.target.value }))} disabled={!isEditing} style={{ ...inputStyle(isEditing), height: '37px' }} />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '14.5px', fontWeight: 600, color: '#4b5563', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>CFS 정보 (회사명, 주소 및 담당자)</span>
                          {isEditing && (
                            <button
                              type="button"
                              onClick={() => setIsAddingCfs((p: boolean) => !p)}
                              style={{ border: 'none', background: 'none', color: '#3b82f6', fontSize: '13.5px', fontWeight: 700, padding: 0, cursor: 'pointer' }}
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
                              style={{ padding: '0 8px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '14.5px', fontWeight: 700, cursor: 'pointer' }}
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
                              style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '14.5px', width: '220px', height: '37px', background: '#fff' }}
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


                  </div>

                  {/* 공통 쉬핑마크 설정 (선적관리 탭 하단으로 이동됨) */}
                  <div style={{ background: '#f8fafc', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '16px', marginTop: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '14.5px', fontWeight: 800, color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                      ⚙️ 공통 쉬핑마크 설정 (Common Shipping Mark Setup)
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
                      {/* 도형 선택 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '15.5px', color: 'var(--text-secondary)' }}>도형 선택</span>
                        <select 
                          value={commonShippingMark.shape}
                          onChange={(e) => setCommonShippingMark(prev => ({ ...prev, shape: e.target.value }))}
                          style={{ padding: '6px', fontSize: '14.5px', border: '1px solid var(--border-default)', borderRadius: '4px', background: '#fff', outline: 'none' }}
                        >
                          <option value="circle">◯ 원형 (Circle)</option>
                          <option value="square">▢ 사각형 (Square)</option>
                          <option value="triangle">△ 삼각형 (Triangle)</option>
                          <option value="diamond">◇ 다이아몬드 (Diamond)</option>
                        </select>
                      </div>

                      {/* 회사/바이어 약자 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '15.5px', color: 'var(--text-secondary)' }}>회사/고객 약자</span>
                        <input 
                          type="text" 
                          placeholder="약자 입력 (예: YSACC)" 
                          value={commonShippingMark.company}
                          onChange={(e) => setCommonShippingMark(prev => ({ ...prev, company: e.target.value }))}
                          style={{ padding: '6px', fontSize: '14.5px', border: '1px solid var(--border-default)', borderRadius: '4px', background: '#fff', outline: 'none' }}
                        />
                      </div>

                      {/* 도착 포트 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '15.5px', color: 'var(--text-secondary)' }}>도착 포트</span>
                        <input 
                          type="text" 
                          placeholder="도착 포트 (예: DOHA)" 
                          value={commonShippingMark.port}
                          onChange={(e) => setCommonShippingMark(prev => ({ ...prev, port: e.target.value }))}
                          style={{ padding: '6px', fontSize: '14.5px', border: '1px solid var(--border-default)', borderRadius: '4px', background: '#fff', outline: 'none' }}
                        />
                      </div>

                      {/* 국가 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '15.5px', color: 'var(--text-secondary)' }}>도착 국가</span>
                        <input 
                          type="text" 
                          placeholder="국가 (예: QATAR)" 
                          value={commonShippingMark.country}
                          onChange={(e) => setCommonShippingMark(prev => ({ ...prev, country: e.target.value }))}
                          style={{ padding: '6px', fontSize: '14.5px', border: '1px solid var(--border-default)', borderRadius: '4px', background: '#fff', outline: 'none' }}
                        />
                      </div>

                      {/* 원산지 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '15.5px', color: 'var(--text-secondary)' }}>원산지</span>
                        <input 
                          type="text" 
                          placeholder="원산지" 
                          value={commonShippingMark.origin}
                          onChange={(e) => setCommonShippingMark(prev => ({ ...prev, origin: e.target.value }))}
                          style={{ padding: '6px', fontSize: '14.5px', border: '1px solid var(--border-default)', borderRadius: '4px', background: '#fff', outline: 'none' }}
                        />
                      </div>
                    </div>

                    {/* Live Preview and Direct Save Action */}
                    <div style={{ marginTop: '16px', display: 'flex', gap: '20px', alignItems: 'center', background: '#fff', border: '1px dashed var(--border-default)', borderRadius: '6px', padding: '12px', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: '220px' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '14.5px', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>🔍 실시간 쉬핑마크 미리보기 (Live Preview)</span>
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px', background: '#fafafa', border: '1px solid var(--border-color)', borderRadius: '4px', minHeight: '110px' }}>
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
                          style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold', fontSize: '13.5px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          💾 쉬핑마크 설정 저장 (클라우드)
                        </button>
                        <span style={{ fontSize: '15.5px', color: 'var(--text-secondary)' }}>
                          ※ 수정한 마크 설정을 저장한 후, 도착보고 탭에서<br/>
                          '⚡ 테이블에 마크 적용' 버튼을 눌러 적용하세요.
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              
              )}

              {/* 2) 패킹리스트 작성 및 검토 */}
              {activeLogisticsTab === '패킹리스트' && (

                <div style={{ background: '#fff', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
                    <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 800, color: '#1e3a8a' }}>📦 패킹리스트 작성 및 검토 (자동/수동 편집 지원)</h4>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        type="button" 
                        onClick={handlePrintPL}
                        style={{ padding: '6px 12px', fontSize: '13.5px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        PL 미리보기 및 PDF 저장
                      </button>
                    </div>
                  </div>

                  {/* 3D 적재 시뮬레이션 계획 대조 (Planned vs Actual) */}
                  



                  {/* 1단계: 제품별 팔레트화 (Palletization & Residue Control) */}
                  <div style={{ background: '#f8fafc', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '13.5px', fontWeight: 800, color: '#0f766e', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid var(--border-default)', paddingBottom: '8px' }}>
                      📋 Step 1. 제품별 팔레트화 설정 (Palletization & Residue Options)
                    </h4>
                    <p style={{ margin: '0 0 14px 0', fontSize: '14.5px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      주문 수량을 기준으로 제품별 마스터 포장(Pallet) 규격에 따라 패킹 단위를 분할합니다. 남는 자투리 수량의 포장 처리 방식을 결정해 주세요.
                    </p>

                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px', background: '#fff', border: '1px solid var(--border-color)' }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9', borderBottom: '1px solid var(--border-default)' }}>
                          <th style={{ padding: '8px', textAlign: 'center', width: '4%' }}>No.</th>
                          <th style={{ padding: '8px', textAlign: 'left', width: '18%' }}>제품코드 / 품명</th>
                          <th style={{ padding: '8px', textAlign: 'left', width: '10%' }}>제조사</th>
                          <th style={{ padding: '8px', textAlign: 'right', width: '7%' }}>주문 총수량</th>
                          <th style={{ padding: '8px', textAlign: 'left', width: '11%' }}>포장 형태 (마스터)</th>
                          <th style={{ padding: '8px', textAlign: 'center', width: '10%' }}>규격 (WxLxH)</th>
                          <th style={{ padding: '8px', textAlign: 'right', width: '7%' }}>PL당 적재수량</th>
                          <th style={{ padding: '8px', textAlign: 'right', width: '7%' }}>순중량 (Kg)</th>
                          <th style={{ padding: '8px', textAlign: 'right', width: '7%' }}>총중량 (Kg)</th>
                          <th style={{ padding: '8px', textAlign: 'center', width: '8%' }}>완제 팔레트수</th>
                          <th style={{ padding: '8px', textAlign: 'right', width: '7%' }}>남은 자투리 수량</th>
                          <th style={{ padding: '8px', textAlign: 'center', width: '11%' }}>자투리 처리 방식</th>
                          <th style={{ padding: '8px', textAlign: 'center', width: '4%' }}>순서</th>
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

                          const customQtyPerPallet = (basicForm.packingList as any)?.[`custom_qty_per_pallet_${itemCode}_${idx}`];
                          const qtyPerPallet = customQtyPerPallet !== undefined ? Number(customQtyPerPallet) : (matchedMethod.qtyPerPallet || 100);
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

                          
                           // Dimensions logic
                           const customW = (basicForm.packingList as any)?.[`custom_w_${itemCode}_${idx}`];
                           const customL = (basicForm.packingList as any)?.[`custom_l_${itemCode}_${idx}`];
                           const customH = (basicForm.packingList as any)?.[`custom_h_${itemCode}_${idx}`];

                           let w = customW !== undefined ? Number(customW) : (isPlt ? (matchedMethod.palletWidth || 0) : (matchedMethod.unitWidth || 0));
                           let l = customL !== undefined ? Number(customL) : (isPlt ? (matchedMethod.palletLength || 0) : (matchedMethod.unitLength || 0));
                           let h = customH !== undefined ? Number(customH) : (isPlt ? (matchedMethod.palletHeight || 0) : (matchedMethod.unitHeight || 0));
                           if (w === 0 && customW === undefined) w = (p?.palletWidth || p?.unitWidth || 0);
                           if (l === 0 && customL === undefined) l = (p?.palletLength || p?.unitLength || 0);
                           if (h === 0 && customH === undefined) h = (p?.palletHeight || p?.unitHeight || 0);
                           const dimsStr = w || l || h ? `${w}x${l}x${h}` : '0x0x0';

                           // Supplier logic
                           const defaultSupplier = p?.suppliers?.find((s: any) => s.isDefault)?.supplierName || 
                                                   p?.suppliers?.[0]?.supplierName || 
                                                   p?.purchasePrices?.find((pr: any) => pr.isDefault)?.supplierName ||
                                                   p?.purchasePrices?.[0]?.supplierName || 
                                                   '';
                           const supplierName = item.supplier || defaultSupplier || '-';

                           return (
                            <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <td style={{ padding: '8px', textAlign: 'center' }}>{idx + 1}</td>
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
                                        border: '1px solid var(--border-default)',
                                        color: '#a16207',
                                        borderRadius: '4px',
                                        padding: '2px 4px',
                                        cursor: 'pointer',
                                        fontSize: '15.5px',
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
                              <td style={{ padding: '8px' }}>{supplierName}</td>
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
                                  style={{ padding: '4px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '14.5px', width: '98%' }}
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
                               
                               <td style={{ padding: '4px', textAlign: 'center' }}>
                                 {(() => {
                                   const cleanDims = (dimsStr || '0x0x0').toLowerCase().replace(/\s+/g, '');
                                   const dims = cleanDims.split('x');
                                   const widthVal = dims[0] || '0';
                                   const lengthVal = dims[1] || '0';
                                   const heightVal = dims[2] || '0';

                                   const handleDimChange = async (dimKey: 'w' | 'l' | 'h', inputVal: string) => {
                                     const numericVal = parseInt(inputVal) || 0;
                                     if (p) {
                                       const nextMethods = [...(p.packingMethods || [])];
                                       const defaultIdx = nextMethods.findIndex((m: any) => m.id === matchedMethod.id);
                                       const targetIdx = defaultIdx !== -1 ? defaultIdx : 0;
                                       if (nextMethods[targetIdx]) {
                                         if (dimKey === 'w') {
                                           nextMethods[targetIdx].unitWidth = numericVal;
                                           nextMethods[targetIdx].palletWidth = numericVal;
                                         } else if (dimKey === 'l') {
                                           nextMethods[targetIdx].unitLength = numericVal;
                                           nextMethods[targetIdx].palletLength = numericVal;
                                         } else if (dimKey === 'h') {
                                           nextMethods[targetIdx].unitHeight = numericVal;
                                           nextMethods[targetIdx].palletHeight = numericVal;
                                         }
                                         await updateDoc(doc(db, 'companies', COMPANY_ID, 'products', p.id), { packingMethods: nextMethods });
                                       }
                                     }
                                     setBasicForm(prev => {
                                       const nextPL = { ...(prev.packingList || {}) };
                                       (nextPL as any)[`custom_${dimKey}_${itemCode}_${idx}`] = numericVal;
                                       return { ...prev, packingList: nextPL };
                                     });
                                   };

                                   return (
                                     <div style={{ display: 'flex', alignItems: 'center', gap: '2px', justifyContent: 'center' }}>
                                       <input 
                                         type="number"
                                         placeholder="W"
                                         disabled={!isEditing}
                                         value={widthVal}
                                         style={{ width: '48px', padding: '3px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12.5px', textAlign: 'center', height: '28px', boxSizing: 'border-box', background: isEditing ? '#fff' : '#f1f5f9', color: isEditing ? '#1e293b' : '#64748b' }}
                                         onChange={e => handleDimChange('w', e.target.value)}
                                       />
                                       <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>×</span>
                                       <input 
                                         type="number"
                                         placeholder="L"
                                         disabled={!isEditing}
                                         value={lengthVal}
                                         style={{ width: '48px', padding: '3px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12.5px', textAlign: 'center', height: '28px', boxSizing: 'border-box', background: isEditing ? '#fff' : '#f1f5f9', color: isEditing ? '#1e293b' : '#64748b' }}
                                         onChange={e => handleDimChange('l', e.target.value)}
                                       />
                                       <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>×</span>
                                       <input 
                                         type="number"
                                         placeholder="H"
                                         disabled={!isEditing}
                                         value={heightVal}
                                         style={{ width: '48px', padding: '3px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12.5px', textAlign: 'center', height: '28px', boxSizing: 'border-box', background: isEditing ? '#fff' : '#f1f5f9', color: isEditing ? '#1e293b' : '#64748b' }}
                                         onChange={e => handleDimChange('h', e.target.value)}
                                       />
                                     </div>
                                   );
                                 })()}
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
                                      setBasicForm(prev => {
                                        const nextPL = { ...(prev.packingList || {}) };
                                        (nextPL as any)[`custom_qty_per_pallet_${itemCode}_${idx}`] = val;
                                        return { ...prev, packingList: nextPL };
                                      });
                                    }}
                                    style={{ padding: '4px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '14.5px', width: '70px', textAlign: 'right' }}
                                  />
                                  <span>EA</span>
                                </div>
                              </td>
                              <td style={{ padding: '8px', textAlign: 'right' }}>{netW.toLocaleString()} Kg</td>
                              <td style={{ padding: '8px', textAlign: 'right' }}>{grossW.toLocaleString()} Kg</td>
                              <td style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold', color: '#0284c7' }}>{fullPallets} PLT</td>
                              <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', color: residue > 0 ? '#ea580c' : 'var(--text-secondary)' }}>
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
                                  style={{ padding: '4px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '14.5px', background: residue === 0 ? '#f1f5f9' : '#fff' }}
                                >
                                  <option value="independent">독립 팔레트 (높이조정)</option>
                                  <option value="single">박스 단품 (손적재)</option>
                                  <option value="mixed">혼적용 (Mixed PLT)</option>
                                </select>
                                  {treatment === 'mixed' && (
                                    <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center' }}>
                                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 'bold' }}>혼적그룹:</span>
                                      <select
                                        disabled={!isEditing}
                                        value={(basicForm.packingList as any)?.[ `group_${itemCode}_${idx}` ] || '1'}
                                        onChange={e => {
                                          const val = e.target.value;
                                          setBasicForm(prev => {
                                            const nextPL = { ...(prev.packingList || {}) };
                                            (nextPL as any)[ `group_${itemCode}_${idx}` ] = val;
                                            return { ...prev, packingList: nextPL };
                                          });
                                        }}
                                        style={{ padding: '2px 4px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12px' }}
                                      >
                                        <option value="1">그룹 1</option>
                                        <option value="2">그룹 2</option>
                                        <option value="3">그룹 3</option>
                                        <option value="4">그룹 4</option>
                                        <option value="5">그룹 5</option>
                                      </select>
                                    </div>
                                  )}

                              </td>
                              <td style={{ padding: '8px', textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: '3px', justifyContent: 'center' }}>
                                  <button 
                                    type="button"
                                    disabled={idx === 0 || !isEditing}
                                    onClick={() => moveStep1Item(idx, 'up')}
                                    style={{ background: '#f1f5f9', border: '1px solid var(--border-default)', borderRadius: '4px', padding: '2px 4px', cursor: (idx === 0 || !isEditing) ? 'not-allowed' : 'pointer', fontSize: '9px', opacity: idx === 0 ? 0.3 : 1 }}
                                  >
                                    ▲
                                  </button>
                                  <button 
                                    type="button"
                                    disabled={idx === orderItems.length - 1 || !isEditing}
                                    onClick={() => moveStep1Item(idx, 'down')}
                                    style={{ background: '#f1f5f9', border: '1px solid var(--border-default)', borderRadius: '4px', padding: '2px 4px', cursor: (idx === orderItems.length - 1 || !isEditing) ? 'not-allowed' : 'pointer', fontSize: '9px', opacity: idx === orderItems.length - 1 ? 0.3 : 1 }}
                                  >
                                    ▼
                                  </button>
                                </div>
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
                      <div style={{ background: '#fff', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '16px', boxShadow: '0 4px 6px rgba(0,0,0,0.01)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
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
                                        mixedGroup: (basicForm.packingList as any)?.[ `group_${itemCode}_${itemIdx}` ] || '1',
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

                                const mixedBySupplierAndGroup: { [key: string]: any[] } = {};
                                 mixedItems.forEach((it: any) => {
                                   const s = it.supplier || 'DEFAULT';
                                   const g = it.mixedGroup || '1';
                                   const key = `${s}_group_${g}`;
                                   if (!mixedBySupplierAndGroup[key]) mixedBySupplierAndGroup[key] = [];
                                   mixedBySupplierAndGroup[key].push(it);
                                 });

                                 const mergedMixedItems: any[] = [];
                                 Object.keys(mixedBySupplierAndGroup).forEach((groupKey: string) => {
                                   const items = mixedBySupplierAndGroup[groupKey];
                                   if (items.length === 0) return;
                                   const groupNo = groupKey.split('_group_')[1];
                                   items.forEach((it: any) => {
                                     const cleanDesc = (it.description || '').replace(/^\[혼적 - 그룹 \d+\]\s*/i, '');
                                     it.description = `[혼적 - 그룹 ${groupNo}] ${cleanDesc}`;
                                     mergedMixedItems.push(it);
                                   });
                                 });

                                 currentPkgNo = 1;
                                 nonMixedItems.forEach((it: any) => {
                                   it.pkgNo = String(currentPkgNo);
                                   currentPkgNo++;
                                 });

                                 Object.keys(mixedBySupplierAndGroup).forEach((groupKey: string) => {
                                   const items = mixedBySupplierAndGroup[groupKey];
                                   if (items.length === 0) return;
                                   items.forEach((it: any, itemGroupIdx: number) => {
                                     it.pkgNo = String(currentPkgNo);
                                     it.pkg = itemGroupIdx === 0 ? '1' : '0';
                                   });
                                   currentPkgNo++;
                                 });

                                 const finalItems = [
                                   ...nonMixedItems,
                                   ...mergedMixedItems
                                 ];

                                

                                newContainers.push({
                                  containerNo: `CONTAINER-01`,
                                  sealNo: '',
                                  items: finalItems
                                });

                                setBasicForm(prev => ({
                                  ...prev,
                                  packingList: {
                                    ...prev.packingList,
                                    containers: newContainers
                                  }
                                }));
                                alert('🔄 모든 품목의 코드와 총수량이 컨테이너 패킹리스트에 직접 배정되었습니다 (혼적 단위 반영).');
                              }}
                              style={{ padding: '6px 12px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold', fontSize: '13.5px', cursor: isEditing ? 'pointer' : 'not-allowed', marginLeft: '6px' }}
                            >
                              ⚡ 주문 총수량 직접 배정
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
                              style={{ padding: '6px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 'bold', fontSize: '13.5px', cursor: isEditing ? 'pointer' : 'not-allowed' }}
                            >
                              + 컨테이너 추가
                            </button>
                          </div>
                        </div>

                        {(basicForm.packingList.containers || []).map((c: any, cIdx: number) => (
                          <div key={cIdx} style={{ background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '16px', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
                              <div style={{ display: 'flex', gap: '12px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <span style={{ fontSize: '15.5px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>Container No</span>
                                  <input type="text" disabled={!isEditing} style={{ padding: '5px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13.5px', width: '140px' }} value={c.containerNo || ''} onChange={e => {
                                    const val = e.target.value;
                                    const nextContainers = [...basicForm.packingList.containers];
                                    nextContainers[cIdx].containerNo = val;
                                    setBasicForm(prev => ({ ...prev, packingList: { ...prev.packingList, containers: nextContainers } }));
                                  }} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <span style={{ fontSize: '15.5px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>Seal No</span>
                                  <input type="text" disabled={!isEditing} style={{ padding: '5px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13.5px', width: '140px' }} value={c.sealNo || ''} onChange={e => {
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
                                      pkgNo: String(nextContainers[cIdx].items.length + 1),
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
                                  style={{ padding: '4px 10px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '3px', fontWeight: 'bold', fontSize: '14.5px', cursor: isEditing ? 'pointer' : 'not-allowed' }}
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
                                  style={{ padding: '4px 10px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '3px', fontWeight: 'bold', fontSize: '14.5px', cursor: isEditing ? 'pointer' : 'not-allowed' }}
                                >
                                  컨테이너 삭제
                                </button>
                              </div>
                            </div>

                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', background: '#fff', border: '1px solid var(--border-color)' }}>
                              <thead>
                                <tr style={{ background: '#f1f5f9', borderBottom: '2px solid var(--border-default)' }}>
                                  <th style={{ padding: '6px 8px', textAlign: 'center', width: '6%', whiteSpace: 'nowrap' }}>PKG NO.</th>
                                  <th style={{ padding: '6px 8px', textAlign: 'left', width: '22%', whiteSpace: 'nowrap' }}>Description of Goods (품명 및 사양)</th>
                                  <th style={{ padding: '6px 8px', textAlign: 'right', width: '6%', whiteSpace: 'nowrap' }}>수량</th>
                                  <th style={{ padding: '6px 8px', textAlign: 'left', width: '10%', whiteSpace: 'nowrap' }}>포장형태</th>
                                  <th style={{ padding: '6px 8px', textAlign: 'center', width: '14%', whiteSpace: 'nowrap' }}>규격 (WxLxH)</th>
                                  <th style={{ padding: '6px 8px', textAlign: 'left', width: '12%', whiteSpace: 'nowrap' }}>Manufacturer (제조사)</th>
                                  <th style={{ padding: '6px 8px', textAlign: 'right', width: '8%', whiteSpace: 'nowrap' }}>NET WT (Kg)</th>
                                  <th style={{ padding: '6px 8px', textAlign: 'right', width: '8%', whiteSpace: 'nowrap' }}>GROSS WT (Kg)</th>
                                  <th style={{ padding: '6px 8px', textAlign: 'right', width: '6%', whiteSpace: 'nowrap' }}>CBM</th>
                                  <th style={{ padding: '6px 8px', textAlign: 'center', width: '140px', whiteSpace: 'nowrap' }}>동작</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(c.items || []).map((it: any, itIdx: number) => (
                                  <tr key={itIdx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <td style={{ padding: '4px' }}>
                                      <input type="text" placeholder="예: 1-5" disabled={!isEditing} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', width: '95%', textAlign: 'center', height: '32px', boxSizing: 'border-box', background: isEditing ? '#fff' : '#f1f5f9', color: isEditing ? '#1e293b' : '#64748b', outline: 'none' }} value={it.pkgNo || ''} onChange={e => {
                                        const val = e.target.value;
                                        const nextContainers = [...basicForm.packingList.containers];
                                        nextContainers[cIdx].items[itIdx].pkgNo = val;
                                        nextContainers[cIdx].items[itIdx].pkg = calculatePkgFromPkgNo(val);
                                        setBasicForm(prev => ({ ...prev, packingList: { ...prev.packingList, containers: nextContainers } }));
                                      }} />
                                    </td>
                                    <td style={{ padding: '4px' }}>
                                      <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                                        <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
                                          <textarea
                                            disabled={!isEditing}
                                            placeholder="[상품코드] 상품명 또는 사양 직접 입력"
                                            rows={2}
                                            style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', width: '100%', boxSizing: 'border-box', minHeight: '44px', resize: 'both', fontFamily: 'inherit', outline: 'none', overflow: 'auto', background: isEditing ? '#fff' : '#f1f5f9', color: isEditing ? '#1e293b' : '#64748b' }}
                                            value={(it.description || '').replace(/^P#\d+\.\s*/i, '')}
                                            onChange={e => {
                                              const val = e.target.value;
                                              const nextContainers = [...basicForm.packingList.containers];
                                              nextContainers[cIdx].items[itIdx].description = val.replace(/^P#\d+\.\s*/i, '');
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
                                                border: p ? '1px solid var(--border-default)' : '1px solid var(--border-color)',
                                                color: p ? '#a16207' : 'var(--text-muted)',
                                                borderRadius: '4px',
                                                padding: '0',
                                                cursor: p ? 'pointer' : 'not-allowed',
                                                fontSize: '14.5px',
                                                fontWeight: 600,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                height: '28px',
                                                width: '24px',
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
                                    <td style={{ padding: '4px' }}>
                                      <input
                                        type="number"
                                        placeholder="수량"
                                        disabled={!isEditing}
                                        style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', width: '95%', textAlign: 'right', height: '32px', boxSizing: 'border-box', background: isEditing ? '#fff' : '#f1f5f9', color: isEditing ? '#1e293b' : '#64748b', outline: 'none' }}
                                        value={it.qty || ''}
                                        onChange={e => {
                                          const val = e.target.value;
                                          const nextContainers = [...basicForm.packingList.containers];
                                          nextContainers[cIdx].items[itIdx].qty = val;
                                          setBasicForm(prev => ({ ...prev, packingList: { ...prev.packingList, containers: nextContainers } }));
                                        }}
                                      />
                                    </td>
                                    <td style={{ padding: '4px' }}>
                                      {(() => {
                                        const match = (it.description || '').match(/^\[(.*?)\]\s*(.*)$/);
                                        const itemCode = match ? match[1] : '-';
                                        const p = products.find(prod => prod.productCode === itemCode || prod.id === itemCode);
                                        const list = p?.packingMethods || [];
                                        const methods_any: any = list.length > 0 ? list : [{ id: 'default_single', packageType: '단품', name: '단품', unitWidth: p?.unitWidth||0, unitLength: p?.unitLength||0, unitHeight: p?.unitHeight||0 }];
                                        
                                        return (
                                          <select
                                              disabled={!isEditing}
                                              style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', width: '98%', outline: 'none', height: '32px', boxSizing: 'border-box', background: isEditing ? '#fff' : '#f1f5f9', color: isEditing ? '#1e293b' : '#64748b' }}
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
                                    <td style={{ padding: '2px 4px' }}>
                                      {(() => {
                                        const cleanDims = (it.dimensions || '0x0x0').toLowerCase().replace(/\s+/g, '');
                                        const dims = cleanDims.split('x');
                                        const width = dims[0] || '';
                                        const length = dims[1] || '';
                                        const height = dims[2] || '';

                                        return (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', justifyContent: 'center' }}>
                                            <input 
                                              type="number"
                                              placeholder="W"
                                              disabled={!isEditing}
                                              value={width}
                                              style={{ width: '52px', padding: '4px 3px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', textAlign: 'center', outline: 'none', height: '32px', boxSizing: 'border-box', background: isEditing ? '#fff' : '#f1f5f9', color: isEditing ? '#1e293b' : '#64748b' }}
                                              onChange={e => {
                                                const w = e.target.value;
                                                const nextContainers = [...basicForm.packingList.containers];
                                                nextContainers[cIdx].items[itIdx].dimensions = `${w || '0'}x${length || '0'}x${height || '0'}`;
                                                setBasicForm(prev => ({ ...prev, packingList: { ...prev.packingList, containers: nextContainers } }));
                                              }}
                                            />
                                            <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>×</span>
                                            <input 
                                              type="number"
                                              placeholder="L"
                                              disabled={!isEditing}
                                              value={length}
                                              style={{ width: '52px', padding: '4px 3px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', textAlign: 'center', outline: 'none', height: '32px', boxSizing: 'border-box', background: isEditing ? '#fff' : '#f1f5f9', color: isEditing ? '#1e293b' : '#64748b' }}
                                              onChange={e => {
                                                const l = e.target.value;
                                                const nextContainers = [...basicForm.packingList.containers];
                                                nextContainers[cIdx].items[itIdx].dimensions = `${width || '0'}x${l || '0'}x${height || '0'}`;
                                                setBasicForm(prev => ({ ...prev, packingList: { ...prev.packingList, containers: nextContainers } }));
                                              }}
                                            />
                                            <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>×</span>
                                            <input 
                                              type="number"
                                              placeholder="H"
                                              disabled={!isEditing}
                                              value={height}
                                              style={{ width: '52px', padding: '4px 3px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', textAlign: 'center', outline: 'none', height: '32px', boxSizing: 'border-box', background: isEditing ? '#fff' : '#f1f5f9', color: isEditing ? '#1e293b' : '#64748b' }}
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
                                    <td style={{ padding: '4px' }}>
                                      <input type="text" disabled={!isEditing} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', width: '98%', height: '32px', boxSizing: 'border-box', background: isEditing ? '#fff' : '#f1f5f9', color: isEditing ? '#1e293b' : '#64748b', outline: 'none' }} value={it.supplier || ''} onChange={e => {
                                        const val = e.target.value;
                                        const nextContainers = [...basicForm.packingList.containers];
                                        nextContainers[cIdx].items[itIdx].supplier = val;
                                        setBasicForm(prev => ({ ...prev, packingList: { ...prev.packingList, containers: nextContainers } }));
                                      }} />
                                    </td>
                                    <td style={{ padding: '4px' }}>
                                      <input type="number" disabled={!isEditing} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', width: '95%', textAlign: 'right', height: '32px', boxSizing: 'border-box', background: isEditing ? '#fff' : '#f1f5f9', color: isEditing ? '#1e293b' : '#64748b', outline: 'none' }} value={it.netWeight || ''} onChange={e => {
                                        const val = e.target.value;
                                        const nextContainers = [...basicForm.packingList.containers];
                                        nextContainers[cIdx].items[itIdx].netWeight = val;
                                        setBasicForm(prev => ({ ...prev, packingList: { ...prev.packingList, containers: nextContainers } }));
                                      }} />
                                    </td>
                                    <td style={{ padding: '4px' }}>
                                      <input type="number" disabled={!isEditing} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', width: '95%', textAlign: 'right', height: '32px', boxSizing: 'border-box', background: isEditing ? '#fff' : '#f1f5f9', color: isEditing ? '#1e293b' : '#64748b', outline: 'none' }} value={it.grossWeight || ''} onChange={e => {
                                        const val = e.target.value;
                                        const nextContainers = [...basicForm.packingList.containers];
                                        nextContainers[cIdx].items[itIdx].grossWeight = val;
                                        setBasicForm(prev => ({ ...prev, packingList: { ...prev.packingList, containers: nextContainers } }));
                                      }} />
                                    </td>
                                    <td style={{ padding: '2px 4px' }}>
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
                                        style={{ padding: '4px 6px', border: `1px solid ${String(it.cbm||'').startsWith('=') ? '#f59e0b' : '#cbd5e1'}`, borderRadius: '4px', fontSize: '13px', width: '95%', textAlign: 'right', height: '32px', boxSizing: 'border-box', background: isEditing ? '#fff' : '#f1f5f9', color: isEditing ? '#1e293b' : '#64748b', outline: 'none' }}
                                      />
                                    </td>
                                    <td style={{ padding: '4px', textAlign: 'center' }}>
                                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center' }}>
                                        <button 
                                          type="button"
                                          disabled={itIdx === 0 || !isEditing}
                                          onClick={() => moveStep2Item(cIdx, itIdx, 'up')}
                                          title="위로 이동"
                                          style={{ background: '#f8fafc', border: '1px solid var(--border-default)', borderRadius: '4px', padding: '2px 6px', cursor: (itIdx === 0 || !isEditing) ? 'not-allowed' : 'pointer', fontSize: '12px', opacity: itIdx === 0 ? 0.3 : 1, height: '28px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                        >
                                          ▲
                                        </button>
                                        <button 
                                          type="button"
                                          disabled={itIdx === (c.items || []).length - 1 || !isEditing}
                                          onClick={() => moveStep2Item(cIdx, itIdx, 'down')}
                                          title="아래로 이동"
                                          style={{ background: '#f8fafc', border: '1px solid var(--border-default)', borderRadius: '4px', padding: '2px 6px', cursor: (itIdx === (c.items || []).length - 1 || !isEditing) ? 'not-allowed' : 'pointer', fontSize: '12px', opacity: itIdx === (c.items || []).length - 1 ? 0.3 : 1, height: '28px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                        >
                                          ▼
                                        </button>
                                        <button
                                          type="button"
                                          disabled={!isEditing}
                                          onClick={() => {
                                            const nextContainers = [...basicForm.packingList.containers];
                                            const copiedItem = { ...nextContainers[cIdx].items[itIdx] };
                                            nextContainers[cIdx].items.splice(itIdx + 1, 0, copiedItem);
                                            setBasicForm(prev => ({ ...prev, packingList: { ...prev.packingList, containers: nextContainers } }));
                                          }}
                                          title="품목 복사"
                                          style={{ width: '28px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: isEditing ? 'pointer' : 'not-allowed', fontSize: '14px', height: '28px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                        >
                                          📋
                                        </button>
                                        <button
                                          type="button"
                                          disabled={!isEditing}
                                          onClick={() => {
                                            const nextContainers = [...basicForm.packingList.containers];
                                            nextContainers[cIdx].items = nextContainers[cIdx].items.filter((_: any, idx: number) => idx !== itIdx);
                                            setBasicForm(prev => ({ ...prev, packingList: { ...prev.packingList, containers: nextContainers } }));
                                          }}
                                          title="품목 삭제"
                                          style={{ width: '28px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: isEditing ? 'pointer' : 'not-allowed', fontSize: '13px', height: '28px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                        >
                                          🗑️
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                                {c.items?.length === 0 ? (
                                  <tr>
                                    <td colSpan={10} style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                      등록된 품목이 없습니다. 우측 상단의 '+ 품목 행 추가'를 눌러 등록하세요.
                                    </td>
                                  </tr>
                                ) : (
                                  (() => {
                                    const items = c.items || [];
                                    const totalQty = items.reduce((acc: number, it: any) => acc + (Number(it.qty) || 0), 0);
                                    const totalNetWeight = items.reduce((acc: number, it: any) => acc + (Number(it.netWeight) || 0), 0);
                                    const totalGrossWeight = items.reduce((acc: number, it: any) => acc + (Number(it.grossWeight) || 0), 0);
                                    const totalCbm = items.reduce((acc: number, it: any) => {
                                      const rawVal = String(it.cbm || '');
                                      let numericVal = 0;
                                      if (rawVal.startsWith('=')) {
                                        try {
                                          const expr = rawVal.slice(1).replace(/[^0-9+\-*/().]/g, '');
                                          const evaluated = Function('"use strict"; return (' + expr + ')')();
                                          if (typeof evaluated === 'number' && isFinite(evaluated)) {
                                            numericVal = evaluated;
                                          }
                                        } catch {}
                                      } else {
                                        numericVal = Number(it.cbm) || 0;
                                      }
                                      return acc + numericVal;
                                    }, 0);

                                    return (
                                      <tr style={{ background: '#f8fafc', fontWeight: 'bold', borderTop: '2px solid var(--border-default)', borderBottom: '2px solid var(--border-default)' }}>
                                        <td style={{ padding: '6px 4px', textAlign: 'center', color: '#334155' }}>합계</td>
                                        <td style={{ padding: '6px 4px', color: 'var(--text-secondary)' }}>-</td>
                                        <td style={{ padding: '6px 4px', textAlign: 'right', color: '#0f172a', paddingRight: '12px' }}>{totalQty.toLocaleString()}</td>
                                        <td style={{ padding: '6px 4px' }}></td>
                                        <td style={{ padding: '6px 4px' }}></td>
                                        <td style={{ padding: '6px 4px' }}></td>
                                        <td style={{ padding: '6px 4px', textAlign: 'right', color: '#0f172a', paddingRight: '12px' }}>{totalNetWeight.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                        <td style={{ padding: '6px 4px', textAlign: 'right', color: '#0f172a', paddingRight: '12px' }}>{totalGrossWeight.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                                        <td style={{ padding: '6px 4px', textAlign: 'right', color: '#0369a1', paddingRight: '12px' }}>{totalCbm.toFixed(3)}</td>
                                        <td style={{ padding: '6px 4px' }}></td>
                                      </tr>
                                    );
                                  })()
                                )}
                              </tbody>
                            </table>
                          </div>
                        ))}
                      </div>

                      {/* Step 3. 3D적재 시뮬레이션 연동 */}
                      <div style={{ background: '#fff', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '16px', boxShadow: '0 4px 6px rgba(0,0,0,0.01)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                          <h4 style={{ margin: 0, fontSize: '13.5px', fontWeight: 800, color: '#0369a1', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            🚚 Step 3. 3D적재 시뮬레이션 연동
                          </h4>
                        </div>
                        <p style={{ margin: '0 0 14px 0', fontSize: '14.5px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
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
                              fontSize: '14.5px',
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

                        {/* Archived Plans File Cabinet */}
                        <div style={{ marginTop: '20px', borderTop: '1px dashed var(--border-default)', paddingTop: '16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              📁 3D 적재 계획 보관함 ({(basicForm.packingList?.archivedPlans || []).length})
                            </span>
                            <label 
                              htmlFor="upload-to-archive" 
                              style={{ 
                                fontSize: '15.5px', 
                                background: '#f1f5f9', 
                                border: '1px solid var(--border-default)', 
                                borderRadius: '4px', 
                                padding: '3px 8px', 
                                cursor: 'pointer', 
                                fontWeight: 600,
                                color: 'var(--text-secondary)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              📤 파일 업로드하여 보관
                            </label>
                            <input 
                              id="upload-to-archive" 
                              type="file" 
                              accept=".json" 
                              onChange={handleArchiveUpload} 
                              style={{ display: 'none' }} 
                            />
                          </div>
                          
                          {!(basicForm.packingList?.archivedPlans) || basicForm.packingList.archivedPlans.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '14px', fontSize: '15.5px', color: 'var(--text-muted)', background: '#f8fafc', borderRadius: '6px', border: '1px dashed var(--border-color)' }}>
                              보관된 적재 계획이 없습니다. 3D 시뮬레이션 화면에서 [💾 적재결과 저장] 버튼을 누르면 이곳에 자동으로 파일로 기록 보관됩니다.
                            </div>
                          ) : (
                            <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '15.5px', textAlign: 'left' }}>
                                <thead>
                                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border-color)' }}>
                                    <th style={{ padding: '6px 8px', color: 'var(--text-secondary)', fontWeight: 600 }}>파일명</th>
                                    <th style={{ padding: '6px 8px', color: 'var(--text-secondary)', fontWeight: 600 }}>저장일시</th>
                                    <th style={{ padding: '6px 8px', color: 'var(--text-secondary)', fontWeight: 600 }}>요약 정보</th>
                                    <th style={{ padding: '6px 8px', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right' }}>작업</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(basicForm.packingList.archivedPlans).map((plan: any, idx: number) => (
                                    <tr key={plan.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                      <td style={{ padding: '6px 8px', fontWeight: 600, color: '#0f172a' }}>{plan.name}</td>
                                      <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{new Date(plan.savedAt).toLocaleString('ko-KR', { hour12: false })}</td>
                                      <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{plan.summary}</td>
                                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                                        <button 
                                          type="button" 
                                          onClick={() => openArchivedPlan(plan)}
                                          style={{ background: '#0284c7', color: '#fff', border: 'none', borderRadius: '3px', padding: '2px 6px', fontSize: '14.5px', cursor: 'pointer', marginRight: '4px', fontWeight: 600 }}
                                        >
                                          열기
                                        </button>
                                        <button 
                                          type="button" 
                                          onClick={() => downloadArchivedPlan(plan)}
                                          style={{ background: '#f1f5f9', color: '#334155', border: '1px solid var(--border-default)', borderRadius: '3px', padding: '1px 5px', fontSize: '14.5px', cursor: 'pointer', marginRight: '4px', fontWeight: 600 }}
                                        >
                                          다운로드
                                        </button>
                                        <button 
                                          type="button" 
                                          onClick={() => deleteArchivedPlan(plan.id)}
                                          style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '3px', padding: '2px 6px', fontSize: '14.5px', cursor: 'pointer', fontWeight: 600 }}
                                        >
                                          삭제
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 3D 적재 시뮬레이션 계획 대조 (Planned vs Actual) */}
                      <div style={{ background: '#f8fafc', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '16px', marginBottom: '8px', marginTop: '16px' }}>
<h4 style={{ margin: '0 0 6px 0', fontSize: '13.5px', fontWeight: 800, color: '#2563eb', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid var(--border-default)', paddingBottom: '4px' }}>
                      📦 3D 적재 시뮬레이션 계획 대조 (Planned vs Actual)
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      {/* Planned Card */}
                      <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 12px' }}>
                        <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#1e3a8a', marginBottom: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>📋 Planned (시뮬레이션 계획안)</div>
                        {piData?.containerSimulation ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13.5px' }}>
                            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                              {piData.containerSimulation.simulationFileUrl && (
                                <a href={piData.containerSimulation.simulationFileUrl} download style={{ padding: '6px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '4px', textDecoration: 'none', color: '#2563eb', fontSize: '15.5px', fontWeight: 700 }}>📁 파일 다운로드</a>
                              )}
                              {piData.containerSimulation.simulationImageUrl && (
                                <button type="button" onClick={() => previewFile(piData.containerSimulation.simulationImageUrl, '계획안 스크린샷')} style={{ padding: '6px 12px', background: '#f1f5f9', border: '1px solid var(--border-default)', borderRadius: '4px', color: '#334155', fontSize: '15.5px', fontWeight: 700, cursor: 'pointer' }}>🔍 스크린샷 보기</button>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13.5px' }}>PI에 시뮬레이션 계획안이 등록되지 않았습니다.</div>
                        )}
                      </div>

                      {/* Actual Card */}
                      <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 12px' }}>
                        <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#10b981', marginBottom: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>✅ Actual (실제 적재 결과)</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13.5px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '4px', borderTop: '1px dashed var(--border-color)', paddingTop: '10px' }}>
                            <div>
                              <div style={{ fontSize: '15.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>프로젝트 (.json)</div>
                              {basicForm.actualContainerSimulation?.simulationFileUrl ? (
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                  <a href={basicForm.actualContainerSimulation.simulationFileUrl} download style={{ padding: '4px 8px', background: '#f1f5f9', border: '1px solid var(--border-default)', borderRadius: '4px', textDecoration: 'none', color: '#334155', fontSize: '13.5px', fontWeight: 700 }}>다운로드</a>
                                  <button type="button" onClick={() => setBasicForm(prev => ({ ...prev, actualContainerSimulation: { ...(prev.actualContainerSimulation || {}), simulationFileUrl: '', simulationFileName: '' } }))} title="삭제" style={{ padding: '4px 8px', background: '#fee2e2', border: 'none', borderRadius: '4px', color: '#dc2626', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>🗑️</button>
                                </div>
                              ) : (
                                <div>
                                  <input type="file" accept=".json" id="actual-sim-json" onChange={e => e.target.files && handleSimFileUpload(e.target.files[0])} style={{ display: 'none' }} />
                                  <label htmlFor="actual-sim-json" style={{ padding: '4px 10px', background: '#2563eb', color: '#fff', borderRadius: '4px', fontSize: '15.5px', cursor: 'pointer', fontWeight: 700, display: 'inline-block' }}>{isSimFileUploading ? '...' : '파일 첨부'}</label>
                                </div>
                              )}
                            </div>
                            <div>
                              <div style={{ fontSize: '15.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>결과 스크린샷 이미지</div>
                              {basicForm.actualContainerSimulation?.simulationImageUrl ? (
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                                  <img src={basicForm.actualContainerSimulation.simulationImageUrl} alt="Actual Screenshot" style={{ width: '48px', height: '32px', objectFit: 'contain', border: '1px solid var(--border-default)', borderRadius: '4px' }} />
                                  <button type="button" onClick={() => previewFile(basicForm.actualContainerSimulation.simulationImageUrl, '실제 결과 스크린샷')} style={{ padding: '4px 8px', background: '#f1f5f9', border: '1px solid var(--border-default)', borderRadius: '4px', color: '#334155', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer' }}>보기</button>
                                  <button type="button" onClick={() => setBasicForm(prev => ({ ...prev, actualContainerSimulation: { ...(prev.actualContainerSimulation || {}), simulationImageUrl: '' } }))} title="삭제" style={{ padding: '4px 8px', background: '#fee2e2', border: 'none', borderRadius: '4px', color: '#dc2626', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>🗑️</button>
                                </div>
                              ) : (
                                <div>
                                  <input type="file" accept="image/*" id="actual-sim-img" onChange={e => e.target.files && handleSimImageUpload(e.target.files[0])} style={{ display: 'none' }} />
                                  <label htmlFor="actual-sim-img" style={{ padding: '4px 10px', background: '#2563eb', color: '#fff', borderRadius: '4px', fontSize: '15.5px', cursor: 'pointer', fontWeight: 700, display: 'inline-block' }}>{isSimImageUploading ? '...' : '이미지 첨부'}</label>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                    </div>
                  )}
                </div>
              
              )}

              {/* 3) 도착보고 및 쉬핑마크 탭 */}
              {activeLogisticsTab === '도착보고_쉬핑마크' && (

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ background: '#fff', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '14.5px', fontWeight: 800, color: '#1e3a8a' }}>🚚 2) 도착보고 작성 및 쉬핑마크 (제조사별 상세 정보 및 패킹리스트 연동)</h4>
                    <div style={{ fontSize: '15.5px', color: '#4b5563' }}>
                      도착보고 상세내역(패킹 및 화물정보)을 제조사별로 아래 테이블에서 즉시 수정하고 인쇄/PDF 저장 또는 이메일 발송이 가능합니다. (공통 정보는 패킹리스트의 마스터 데이터를 사용하며, 각 제조사별 패킹리스트 아이템이 실시간 연동됩니다.)
                    </div>
                  </div>

                  {allOrderSuppliers.length === 0 ? (
                    <div style={{ background: '#fff', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14.5px' }}>
                      등록된 제조사(공급업체) 정보가 없습니다.
                    </div>
                  ) : (
                    allOrderSuppliers.map(supplierName => {
                      const items = groupedSupplierItems[supplierName] || [];
                      const cleanSupplierName = supplierName.replace(/\s+/g, '');
                      const supplierCode = cleanSupplierName.substring(0, 3).toUpperCase();
                      const poNum = `${order.ciNumber || order.id}-${supplierCode}`;

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

                        const defaultRemarks = `ORIGIN : MADE IN KOREA\n입고일: ${basicForm.requestedDelivery || '연도-월-일'} 오전 10시까지`;
                        const rep = {
                          bookingNo: basicForm.vesselBooking || '',
                          remarks: repData.remarks && !repData.remarks.includes('연도-월-일') ? repData.remarks : defaultRemarks,
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
                        <div key={supplierName} style={{ border: '1px solid var(--border-default)', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 4px 10px rgba(0,0,0,0.03)', marginBottom: '16px' }}>
                          {/* Card Header */}
                          <div style={{ background: '#f8fafc', padding: '10px 16px', borderBottom: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <span style={{ fontWeight: 800, color: '#1e3a8a', fontSize: '14.5px' }}>🚚 {supplierName} 도착보고서 ({poNum})</span>
                              {order.supplierArrivalReports && order.supplierArrivalReports[supplierName] && (
                                <span style={{ marginLeft: '10px', padding: '2px 8px', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '4px', fontSize: '15.5px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  ✓ 저장 완료 (클라우드)
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button 
                                onClick={addArrivalReportItemRow}
                                disabled={!isEditing}
                                style={{ padding: '5px 10px', background: '#0f766e', border: 'none', color: '#fff', borderRadius: '4px', cursor: isEditing ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: '14.5px' }}
                              >
                                ➕ 패킹 행 추가
                              </button>
                              <button 
                                onClick={handleSaveArrivalReportInline}
                                disabled={!isEditing}
                                style={{ padding: '5px 10px', background: '#2563eb', border: 'none', color: '#fff', borderRadius: '4px', cursor: isEditing ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: '14.5px' }}
                              >
                                💾 저장
                              </button>
                              <button 
                                onClick={handlePrintArrivalReportInline}
                                style={{ padding: '5px 10px', background: '#8b5cf6', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '14.5px' }}
                              >
                                🖨️ 인쇄 / PDF
                              </button>
                              <button 
                                onClick={handleIssueAndSaveArrivalReport}
                                style={{ padding: '5px 10px', background: '#d97706', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '14.5px' }}
                              >
                                📥 도착보고서 발행 및 저장
                              </button>
                              <button 
                                onClick={handleIssueAndSaveShippingMarks}
                                style={{ padding: '5px 10px', background: '#059669', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '14.5px' }}
                              >
                                📥 쉬핑마크 라벨 발행 및 저장
                              </button>
                              <button 
                                onClick={() => handleSendArrivalShippingEmail(supplierName)}
                                style={{ 
                                  padding: '5px 10px', 
                                  background: ((order as any)?.po_dispatch_status?.[`${supplierName}_arrival`]?.emailSent || sentEmailSuppliers[`${supplierName}_arrival`]) ? '#dcfce7' : '#f0fdf4', 
                                  border: ((order as any)?.po_dispatch_status?.[`${supplierName}_arrival`]?.emailSent || sentEmailSuppliers[`${supplierName}_arrival`]) ? '1px solid #86efac' : '1px solid #bbf7d0', 
                                  color: ((order as any)?.po_dispatch_status?.[`${supplierName}_arrival`]?.emailSent || sentEmailSuppliers[`${supplierName}_arrival`]) ? '#166534' : '#15803d', 
                                  borderRadius: '4px', 
                                  cursor: 'pointer', 
                                  fontWeight: 750, 
                                  fontSize: '13.5px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                title="도착보고서 및 쉬핑마크 라벨 2개 파일 유첨 메일 발송"
                              >
                                {((order as any)?.po_dispatch_status?.[`${supplierName}_arrival`]?.emailSent || sentEmailSuppliers[`${supplierName}_arrival`]) ? (
                                  <>
                                    <svg style={{ width: '13px', height: '13px' }} viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                    <span>메일 발송</span>
                                  </>
                                ) : (
                                  <>
                                    <svg style={{ width: '13px', height: '13px' }} viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                                    <span>메일 발송</span>
                                  </>
                                )}
                              </button>
                              <button 
                                onClick={() => handleCopyArrivalShippingKatalkMessage(supplierName)}
                                style={{ 
                                  padding: '5px 10px', 
                                  background: '#FEE500', 
                                  border: ((order as any)?.po_dispatch_status?.[`${supplierName}_arrival`]?.katalkCopied || copiedKatalkSuppliers[`${supplierName}_arrival`]) ? '1px solid #ca8a04' : '1px solid #eab308', 
                                  color: '#191919', 
                                  borderRadius: '4px', 
                                  cursor: 'pointer', 
                                  fontWeight: 750, 
                                  fontSize: '13.5px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                title="도착보고서 및 쉬핑마크 2개 원본 링크 포함 카카오톡 메시지 복사"
                              >
                                {((order as any)?.po_dispatch_status?.[`${supplierName}_arrival`]?.katalkCopied || copiedKatalkSuppliers[`${supplierName}_arrival`]) ? (
                                  <>
                                    <svg style={{ width: '13px', height: '13px' }} viewBox="0 0 24 24" fill="none" stroke="#191919" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                    <span>카톡 발송</span>
                                  </>
                                ) : (
                                  <>
                                    <svg style={{ width: '13px', height: '13px' }} viewBox="0 0 24 24" fill="#191919"><path d="M12 3c-4.97 0-9 3.185-9 7.115 0 2.557 1.707 4.8 4.27 6.054-.188.702-.682 2.545-.78 2.94-.122.49.18.483.378.352.156-.103 2.48-1.688 3.483-2.373.535.078 1.085.127 1.649.127 4.97 0 9-3.186 9-7.115S16.97 3 12 3z"/></svg>
                                    <span>카톡 발송</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Card Body - Inline Table for Editing Packing Items */}
                          <div style={{ padding: '12px 16px', background: '#fff' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14.5px' }}>
                              <thead>
                                <tr style={{ background: '#f1f5f9', borderBottom: '1px solid var(--border-default)' }}>
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
                                  <tr key={itemIdx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <td style={{ padding: '5px' }}>
                                      <textarea
                                        rows={3}
                                        disabled={!isEditing}
                                        value={it.marks || ''}
                                        onChange={e => updateArrivalReportItem(itemIdx, 'marks', e.target.value)}
                                        style={{ width: '100%', boxSizing: 'border-box', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', fontWeight: 600, color: '#1e293b', fontFamily: 'inherit', resize: 'vertical' }}
                                      />
                                    </td>
                                    <td style={{ padding: '5px' }}>
                                      <textarea
                                        rows={3}
                                        disabled={!isEditing}
                                        value={it.descOfGoods || ''}
                                        onChange={e => updateArrivalReportItem(itemIdx, 'descOfGoods', e.target.value)}
                                        style={{ width: '100%', boxSizing: 'border-box', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', fontWeight: 600, color: '#1e293b', fontFamily: 'inherit', resize: 'vertical' }}
                                      />
                                    </td>
                                    <td style={{ padding: '5px', textAlign: 'center' }}>
                                      <input
                                        type="number"
                                        disabled={!isEditing}
                                        value={it.qty || 0}
                                        onChange={e => updateArrivalReportItem(itemIdx, 'qty', parseInt(e.target.value, 10) || 0)}
                                        style={{ width: '100%', boxSizing: 'border-box', height: '34px', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', fontWeight: 600, color: '#1e293b', textAlign: 'center' }}
                                      />
                                    </td>
                                    <td style={{ padding: '5px', textAlign: 'center' }}>
                                      <input
                                        type="text"
                                        disabled={!isEditing}
                                        value={it.packageType || 'PL'}
                                        onChange={e => updateArrivalReportItem(itemIdx, 'packageType', e.target.value)}
                                        style={{ width: '100%', boxSizing: 'border-box', height: '34px', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', fontWeight: 600, color: '#1e293b', textAlign: 'center' }}
                                      />
                                    </td>
                                    <td style={{ padding: '5px', textAlign: 'right' }}>
                                      <input
                                        type="number"
                                        disabled={!isEditing}
                                        value={it.netWeight || 0}
                                        onChange={e => updateArrivalReportItem(itemIdx, 'netWeight', parseFloat(e.target.value) || 0)}
                                        style={{ width: '100%', boxSizing: 'border-box', height: '34px', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', fontWeight: 600, color: '#1e293b', textAlign: 'right' }}
                                      />
                                    </td>
                                    <td style={{ padding: '5px', textAlign: 'right' }}>
                                      <input
                                        type="number"
                                        disabled={!isEditing}
                                        value={it.grossWeight || 0}
                                        onChange={e => updateArrivalReportItem(itemIdx, 'grossWeight', parseFloat(e.target.value) || 0)}
                                        style={{ width: '100%', boxSizing: 'border-box', height: '34px', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', fontWeight: 600, color: '#1e293b', textAlign: 'right' }}
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
                                        style={{ width: '100%', boxSizing: 'border-box', height: '34px', padding: '6px', border: `1px solid ${(it.measurement||'').startsWith('=') ? '#f59e0b' : '#cbd5e1'}`, borderRadius: '4px', fontSize: '13px', fontWeight: 600, color: '#1e293b' }}
                                      />
                                    </td>
                                    <td style={{ padding: '5px', textAlign: 'center' }}>
                                      <button
                                        type="button"
                                        disabled={!isEditing || packingItemsList.length <= 1}
                                        onClick={() => removeArrivalReportItemRow(itemIdx)}
                                        style={{ padding: '6px 10px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '4px', fontSize: '13.5px', cursor: (isEditing && packingItemsList.length > 1) ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                        title="삭제"
                                      >
                                        🗑️
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
            </div>
          )}

          {/* 5. 서류관리 */}
          {activeStep === '서류관리' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* 서류관리 하위 탭 */}
              <div style={{ display: 'flex', borderBottom: '2px solid var(--border-color)', gap: '8px', marginBottom: '8px' }}>
                {[
                  { id: '서류업로드', label: '서류 업로드 및 수출신고' },
                  { id: 'CI_PL작성', label: 'CI / PL 작성 및 Excel 내보내기' }
                ].map(tab => {
                  const isActive = activeDocumentTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => updateQuery({ documentTab: tab.id })}
                      style={{
                        padding: '8px 16px',
                        border: 'none',
                        background: 'none',
                        borderBottom: isActive ? '3px solid #2563eb' : '3px solid transparent',
                        color: isActive ? '#2563eb' : 'var(--text-secondary)',
                        fontWeight: 700,
                        fontSize: '14.5px',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        marginBottom: '-2px'
                      }}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {activeDocumentTab === '서류업로드' && (
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* 수출신고번호, 수출면장 기준환율 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '250px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>수출신고번호 {!!basicForm.exportDeclarationNo?.trim() && <span style={{ color: '#10b981', marginLeft: '4px' }}>✅</span>}</span>
                    <input type="text" value={basicForm.exportDeclarationNo || ''} onChange={e => setBasicForm(p => ({ ...p, exportDeclarationNo: e.target.value }))} disabled={!isEditing} style={{ ...inputStyle(isEditing), height: '34px', fontSize: '13.5px', padding: '6px 10px', boxSizing: 'border-box', border: '1px solid #cbd5e1', width: '100%' }} placeholder="예: 010-22-19-1234567" />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '160px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>수출면장 기준환율 {!!basicForm.customsExchangeRate && <span style={{ color: '#10b981', marginLeft: '4px' }}>✅</span>}</span>
                    <input type="number" step="0.01" value={basicForm.customsExchangeRate || ''} onChange={e => setBasicForm(p => ({ ...p, customsExchangeRate: parseFloat(e.target.value) || 0 }))} disabled={!isEditing} style={{ ...inputStyle(isEditing), height: '34px', fontSize: '13.5px', padding: '6px 10px', boxSizing: 'border-box', border: '1px solid #cbd5e1', width: '100%' }} placeholder="예: 1352.50" />
                  </div>

                  {/* B/L 번호 목록 다중 입력 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '320px', flex: 1, borderLeft: '1px solid var(--border-default)', paddingLeft: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>B/L 번호 목록 {(basicForm.blNumbers || (basicForm.blNumber ? [basicForm.blNumber] : [])).some(bl => !!bl?.trim()) && <span style={{ color: '#10b981', marginLeft: '4px' }}>✅</span>}</span>
                      {isEditing && (
                        <button
                          type="button"
                          onClick={() => {
                            const currentBls = basicForm.blNumbers || (basicForm.blNumber ? [basicForm.blNumber] : []);
                            setBasicForm(p => ({
                              ...p,
                              blNumbers: [...currentBls, '']
                            }));
                          }}
                          style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', padding: '4px 10px', fontWeight: 700, cursor: 'pointer', height: '24px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          + 추가
                        </button>
                      )}
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '120px', overflowY: 'auto' }}>
                      {(() => {
                        const currentBls = basicForm.blNumbers || (basicForm.blNumber ? [basicForm.blNumber] : []);
                        if (currentBls.length === 0) {
                          return (
                            <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px 0' }}>등록된 B/L 번호가 없습니다. (수정 모드에서 추가 가능)</div>
                          );
                        }
                        return currentBls.map((bl: string, idx: number) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <input
                              type="text"
                              value={bl}
                              disabled={!isEditing}
                              onChange={(e) => {
                                const nextBls = [...currentBls];
                                nextBls[idx] = e.target.value;
                                setBasicForm(p => ({
                                  ...p,
                                  blNumbers: nextBls,
                                  blNumber: nextBls.filter(Boolean).join(', ')
                                }));
                              }}
                              placeholder={`B/L 번호 #${idx + 1}`}
                              style={{ ...inputStyle(isEditing), flex: 1, padding: '6px 10px', height: '34px', fontSize: '13.5px', boxSizing: 'border-box', border: '1px solid #cbd5e1' }}
                            />
                            {isEditing && (
                              <button
                                type="button"
                                onClick={() => {
                                  const nextBls = currentBls.filter((_: any, i: number) => i !== idx);
                                  setBasicForm(p => ({
                                    ...p,
                                    blNumbers: nextBls,
                                    blNumber: nextBls.filter(Boolean).join(', ')
                                  }));
                                }}
                                style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', padding: '0 12px', cursor: 'pointer', fontWeight: 600, height: '34px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}
                              >
                                삭제
                              </button>
                            )}
                          </div>
                        ));
                      })()}
                    </div>
                  </div>

                  {/* 7개의 유첨 파일 + 신규 사진 유첨 추가 */}
                  {/* 8개의 유첨 파일 그리드 대통합 (같은 폭, 같은 높이) */}
                  <div style={{ gridColumn: 'span 3', borderTop: '1px solid var(--border-default)', paddingTop: '12px', marginTop: '10px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                      {renderFileField('CI / PL 유첨 (수동)', 'ciFiles', 'ci-file-input')}
                      {renderFileField('COO 유첨', 'cooFiles', 'coo-file-input')}
                      {renderFileField('B/L 유첨', 'blFiles', 'bl-file-input')}
                      {renderFileField('수출면장 업로드', 'exportDeclarationFiles', 'export-declaration-file-input')}
                      {/* COA 및 시험성적서 (매입처별 개별/멀티 유첨 구조) */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', border: '1px dashed var(--border-default)', borderRadius: '6px', padding: '8px 10px', background: '#f8fafc', boxSizing: 'border-box', gridColumn: 'span 1' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                            COA 및 시험성적서 {(order.coaFilesBySupplier && Object.values(order.coaFilesBySupplier).some((files: any) => files && files.length > 0)) && <span style={{ color: '#10b981', marginLeft: '4px' }}>✅</span>}
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '160px', overflowY: 'auto' }}>
                          {(() => {
                            const suppliers = Array.from(new Set(orderItems.map(it => it.supplier?.trim()).filter(Boolean))) as string[];
                            if (suppliers.length === 0) {
                              suppliers.push('일반 매입처');
                            }
                            return suppliers.map((sup) => {
                              const files = (order.coaFilesBySupplier || {})[sup] || [];
                              const inputId = `coa-file-input-${sup.replace(/\s+/g, '-')}`;
                              return (
                                <div
                                  key={sup}
                                  tabIndex={isEditing ? 0 : undefined}
                                  onDragOver={e => {
                                    if (!isEditing) return;
                                    e.preventDefault();
                                    e.currentTarget.style.borderColor = '#3b82f6';
                                    e.currentTarget.style.background = '#f0f9ff';
                                  }}
                                  onDragLeave={e => {
                                    if (!isEditing) return;
                                    e.preventDefault();
                                    e.currentTarget.style.borderColor = '#e2e8f0';
                                    e.currentTarget.style.background = '#fff';
                                  }}
                                  onDrop={e => {
                                    if (!isEditing) return;
                                    e.preventDefault();
                                    e.currentTarget.style.borderColor = '#e2e8f0';
                                    e.currentTarget.style.background = '#fff';
                                    if (uploadingCoaSupplier !== null) return;
                                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                                      const fakeEvent = { target: { files: e.dataTransfer.files } } as any;
                                      handleSupplierCoaUpload(fakeEvent, sup);
                                    }
                                  }}
                                  onPaste={async e => {
                                    if (!isEditing) return;
                                    const clipboardItems = e.clipboardData.items;
                                    const filesToUpload: File[] = [];
                                    for (let i = 0; i < clipboardItems.length; i++) {
                                      if (clipboardItems[i].type.indexOf('image') !== -1) {
                                        const file = clipboardItems[i].getAsFile();
                                        if (file) {
                                          e.preventDefault();
                                          const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                                          const timeStr = new Date().toTimeString().split(' ')[0].replace(/:/g, '');
                                          const renamedFile = new File(
                                            [file],
                                            `screenshot_${dateStr}_${timeStr}.png`,
                                            { type: file.type }
                                          );
                                          filesToUpload.push(renamedFile);
                                        }
                                      }
                                    }
                                    if (filesToUpload.length > 0) {
                                      const fakeEvent = { target: { files: filesToUpload } } as any;
                                      handleSupplierCoaUpload(fakeEvent, sup);
                                    }
                                  }}
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '4px',
                                    padding: '6px',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '4px',
                                    background: '#fff',
                                    outline: 'none',
                                    transition: 'all 0.2s'
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569' }}>📍 {sup} {files.length > 0 && <span style={{ color: '#10b981', marginLeft: '2px' }}>✅</span>}</span>
                                    {isEditing && (
                                      <>
                                        <button
                                          type="button"
                                          disabled={uploadingCoaSupplier !== null}
                                          onClick={() => document.getElementById(inputId)?.click()}
                                          style={{
                                            background: '#3b82f6',
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: '3px',
                                            padding: '2px 6px',
                                            fontSize: '10px',
                                            fontWeight: 700,
                                            cursor: 'pointer'
                                          }}
                                        >
                                          {uploadingCoaSupplier === sup ? '...' : '추가'}
                                        </button>
                                        <input
                                          type="file"
                                          id={inputId}
                                          style={{ display: 'none' }}
                                          onChange={(e) => handleSupplierCoaUpload(e, sup)}
                                          disabled={uploadingCoaSupplier !== null}
                                          multiple
                                        />
                                      </>
                                    )}
                                  </div>
                                  {files.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '2px' }}>
                                      {files.map((file: any, fIdx: number) => (
                                        <div key={fIdx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', background: '#f8fafc', padding: '2px 4px', borderRadius: '3px', border: '1px solid #f1f5f9' }}>
                                          <span
                                            onClick={() => previewFile(file.url, file.name)}
                                            style={{ fontSize: '10.5px', color: '#1e293b', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}
                                          >
                                            📎 {file.name}
                                          </span>
                                          {isEditing && (
                                            <button
                                              type="button"
                                              onClick={() => handleSupplierCoaDelete(sup, fIdx, file.name)}
                                              style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '9px', fontWeight: 700, cursor: 'pointer', padding: '0 2px' }}
                                            >
                                              ✕
                                            </button>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <span style={{ fontSize: '10px', color: '#94a3b8', fontStyle: 'italic' }}>첨부파일 없음 (드래그 가능)</span>
                                  )}
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                      {renderFileField('그밖의 생산/품질 서류', 'otherFiles', 'other-docs-input')}
                      {renderFileField('컨테이너 작업 및 운송 사진 유첨', 'containerWorkFiles', 'container-work-file-input')}
                    </div>
                  </div>
                </div>
              )}

              {activeDocumentTab === 'CI_PL작성' && (() => {
                // Compute totals
                let plNet = 0;
                let plGross = 0;
                let plCbm = 0;
                let pkCount = 0;

                // Bind weights and cbm from packingList containers if available
                if (basicForm.packingList?.containers) {
                  basicForm.packingList.containers.forEach((c: any) => {
                    (c.items || []).forEach((it: any) => {
                      plNet += Number(it.netWeight) || 0;
                      plGross += Number(it.grossWeight) || 0;
                      plCbm += Number(it.cbm) || 0;
                      pkCount += Number(it.pkg) || 0;
                    });
                  });
                }

                  // Format shipping mark to string format using basic string concats instead of escaped ticks
                  const compMark = commonShippingMark.company || 'YSACC';
                  const portCountryMark = (commonShippingMark.port || '') + ', ' + (commonShippingMark.country || '');
                  const originMark = commonShippingMark.origin || 'MADE IN KOREA';
                  const formattedMarkText = compMark + '\n' + portCountryMark + '\n' + originMark;

                  exportExcelRef.current = () => {
                    const itemsPayload = orderItems.map(it => {
                      const matchedProd = products.find(p => p.productCode === it.itemId || p.id === it.itemId);
                      
                      // Match container item specs if packing list exists
                      let itemNetWeight = matchedProd?.palletWeight || 0;
                      let itemGrossWeight = matchedProd?.palletGrossWeight || 0;
                      let itemCbm = 0.5;
                      let itemPkgCount = it.qty;
                      let itemPkgType = matchedProd?.packageType || 'Pallet';

                      if (basicForm.packingList?.containers) {
                        basicForm.packingList.containers.forEach((c: any) => {
                          (c.items || []).forEach((plIt: any) => {
                            if (plIt.description?.includes(it.name) || plIt.pkgNo?.includes(it.itemId)) {
                              itemNetWeight = Number(plIt.netWeight) || 0;
                              itemGrossWeight = Number(plIt.grossWeight) || 0;
                              itemCbm = Number(plIt.cbm) || 0;
                              itemPkgCount = Number(plIt.pkg) || 0;
                              itemPkgType = plIt.packageType || 'Pallet';
                            }
                          });
                        });
                      }

                      return {
                        name: it.name || '',
                        qty: it.qty || 0,
                        unit: it.unit || 'kg',
                        unitPrice: it.unitPrice || 0,
                        amount: it.amount || 0,
                        hsCode: it.hsCode || matchedProd?.customerHsCodes?.[basicForm.customer || ''] || matchedProd?.hsCode || '',
                        netWeight: itemNetWeight,
                        grossWeight: itemGrossWeight,
                        cbm: itemCbm,
                        packageType: itemPkgType,
                        packagesCount: itemPkgCount
                      };
                    });

                    const customShipperVal = basicForm.packingList?.shipper || getShipperText(basicForm.issuingCompany);
                    const customApplicantVal = basicForm.packingList?.applicant || (basicForm.customerAddress ? `${basicForm.customer}\n${basicForm.customerAddress}` : basicForm.customer);
                    const customNotifyVal = basicForm.packingList?.notifyParty || basicForm.lcRemark || 'Same as Applicant';

                    exportCiPlToExcel({
                      orderId: order.id,
                      piNumber: basicForm.piNumber,
                      customerName: customApplicantVal,
                      customerAddress: '',
                      issuingCompany: basicForm.issuingCompany,
                      invoiceNo: basicForm.ciNumber || basicForm.piNumber || order.id,
                      invoiceDate: basicForm.poDate || new Date().toISOString().split('T')[0],
                      lcNo: basicForm.lcNo,
                      lcDate: basicForm.lcIssuingDate,
                      lcIssuingBank: basicForm.lcIssuingBank,
                      notifyParty: customNotifyVal, 
                      remarks: basicForm.remark,
                      portOfLoading: basicForm.portOfLoading,
                      portOfDischarge: basicForm.portOfDischarge,
                      vesselName: basicForm.vesselBooking,
                      etd: basicForm.etd,
                      paymentTerms: basicForm.paymentTerms,
                      deliveryTerms: basicForm.incoterms,
                      shippingMarks: formattedMarkText || 'N/M',
                      customShipperText: customShipperVal,
                      items: itemsPayload,
                      totalPackages: pkCount,
                      totalNetWeight: plNet,
                      totalGrossWeight: plGross,
                      totalCbm: plCbm
                    });
                  };
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '15.5px', fontWeight: 800, color: 'var(--text-primary)' }}>📄 오더 데이터를 연동한 CI & PL 가안 작성</h4>
                        <span style={{ fontSize: '15.5px', color: 'var(--text-secondary)' }}>작성된 내용을 바탕으로 서명선과 포장단위가 삽입된 정식 Excel을 다운로드합니다.</span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => handleSaveBasic(true)}
                          style={{ padding: '6px 14px', background: '#fff', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '15.5px', fontWeight: 700, color: '#334155', cursor: 'pointer' }}
                        >
                          💾 변경 저장
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsCiPlPreviewOpen(true)}
                          style={{ padding: '6px 18px', background: '#3b82f6', border: 'none', borderRadius: '6px', fontSize: '15.5px', fontWeight: 700, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 4px rgba(59,130,246,0.2)' }}
                        >
                          🔍 미리보기 후 Excel 내보내기
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      {/* CI/PL Header Info Form */}
                      <div style={{ background: '#fff', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#1e3a8a', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', marginBottom: '4px' }}>📋 선적 서류 기본 정보</div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Invoice / PL 번호</span>
                            <input type="text" value={basicForm.ciNumber || ''} onChange={e => setBasicForm(p => ({ ...p, ciNumber: e.target.value }))} style={{ ...inputStyle(true), height: '34px', fontSize: '13.5px', padding: '6px 10px', boxSizing: 'border-box', border: '1px solid #cbd5e1' }} />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>작성일자 (Invoice Date)</span>
                            <DateInput value={basicForm.poDate} onChange={e => setBasicForm(p => ({ ...p, poDate: e.target.value }))} style={{ ...inputStyle(true), height: '34px', fontSize: '13.5px', padding: '6px 10px', boxSizing: 'border-box', border: '1px solid #cbd5e1' }} />
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>선적항 (Port of Loading)</span>
                            <input type="text" value={basicForm.portOfLoading} onChange={e => setBasicForm(p => ({ ...p, portOfLoading: e.target.value }))} style={{ ...inputStyle(true), height: '34px', fontSize: '13.5px', padding: '6px 10px', boxSizing: 'border-box', border: '1px solid #cbd5e1' }} />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>도착항 (Port of Discharge)</span>
                            <input type="text" value={basicForm.portOfDischarge} onChange={e => setBasicForm(p => ({ ...p, portOfDischarge: e.target.value }))} style={{ ...inputStyle(true), height: '34px', fontSize: '13.5px', padding: '6px 10px', boxSizing: 'border-box', border: '1px solid #cbd5e1' }} />
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>선박명 (Vessel Name)</span>
                            <input type="text" value={basicForm.vesselBooking} onChange={e => setBasicForm(p => ({ ...p, vesselBooking: e.target.value }))} style={{ ...inputStyle(true), height: '34px', fontSize: '13.5px', padding: '6px 10px', boxSizing: 'border-box', border: '1px solid #cbd5e1' }} />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>출항예정일 (ETD)</span>
                            <DateInput value={basicForm.etd} onChange={e => setBasicForm(p => ({ ...p, etd: e.target.value }))} style={{ ...inputStyle(true), height: '34px', fontSize: '13.5px', padding: '6px 10px', boxSizing: 'border-box', border: '1px solid #cbd5e1' }} />
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>인코텀즈 (Delivery Terms)</span>
                            <input type="text" value={basicForm.incoterms} onChange={e => setBasicForm(p => ({ ...p, incoterms: e.target.value as any }))} style={{ ...inputStyle(true), height: '34px', fontSize: '13.5px', padding: '6px 10px', boxSizing: 'border-box', border: '1px solid #cbd5e1' }} />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>결제조건 (Payment Terms)</span>
                            <input type="text" value={basicForm.paymentTerms} onChange={e => setBasicForm(p => ({ ...p, paymentTerms: e.target.value }))} style={{ ...inputStyle(true), height: '34px', fontSize: '13.5px', padding: '6px 10px', boxSizing: 'border-box', border: '1px solid #cbd5e1' }} />
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>L/C 번호 / 개설은행 (Bank Info)</span>
                          <input type="text" placeholder="L/C No 및 개설은행 정보" value={basicForm.lcNo} onChange={e => setBasicForm(p => ({ ...p, lcNo: e.target.value }))} style={{ ...inputStyle(true), height: '34px', fontSize: '13.5px', padding: '6px 10px', boxSizing: 'border-box', border: '1px solid #cbd5e1' }} />
                        </div>
                      </div>

                      {/* Buyer & Shipper Address Box */}
                      <div style={{ background: '#fff', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f766e', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', marginBottom: '4px' }}>🏢 거래 당사자 주소 정보</div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Shipper (송신인/제조사)</span>
                          <textarea 
                            value={basicForm.packingList?.shipper || getShipperText(basicForm.issuingCompany)} 
                            onChange={e => {
                              const textVal = e.target.value;
                              setBasicForm(p => ({
                                ...p,
                                packingList: {
                                  ...(p.packingList || {}),
                                  shipper: textVal
                                }
                              }));
                            }}
                            rows={3} 
                            style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', color: '#1e293b', fontFamily: 'monospace', resize: 'none', outline: 'none' }} 
                          />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Applicant (바이어 주소)</span>
                          <textarea 
                            value={basicForm.packingList?.applicant || (basicForm.customerAddress ? `${basicForm.customer}\n${basicForm.customerAddress}` : basicForm.customer)} 
                            onChange={e => {
                              const textVal = e.target.value;
                              setBasicForm(p => ({
                                ...p,
                                packingList: {
                                  ...(p.packingList || {}),
                                  applicant: textVal
                                }
                              }));
                            }}
                            rows={3} 
                            style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', color: '#1e293b', fontFamily: 'monospace', resize: 'none', outline: 'none' }} 
                          />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Notify Party (통지처)</span>
                          <input 
                            type="text" 
                            placeholder="Same as Applicant" 
                            value={basicForm.packingList?.notifyParty !== undefined ? basicForm.packingList.notifyParty : (basicForm.lcRemark || 'Same as Applicant')} 
                            onChange={e => {
                              const textVal = e.target.value;
                              setBasicForm(p => ({
                                ...p,
                                lcRemark: textVal,
                                packingList: {
                                  ...(p.packingList || {}),
                                  notifyParty: textVal
                                }
                              }));
                            }}
                            style={{ ...inputStyle(true), height: '34px', fontSize: '13.5px', padding: '6px 10px', boxSizing: 'border-box', border: '1px solid #cbd5e1' }} 
                          />
                        </div>
                      </div>
                    </div>

                    {/* 품목 HS CODE 및 상세 조작 테이블 */}
                    <div style={{ background: '#fff', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                        <span style={{ fontSize: '14.5px', fontWeight: 800, color: 'var(--text-primary)' }}>📦 선적 품목 및 HS CODE 확인</span>
                        <span style={{ fontSize: '15.5px', color: 'var(--text-secondary)', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px' }}>마스터에 등록된 HS Code가 기본 바인딩되며 개별 수정 가능합니다.</span>
                      </div>
                      
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border-color)' }}>
                            <th style={{ padding: '8px', color: 'var(--text-secondary)', fontWeight: 700 }}>품명 (Description of Goods)</th>
                            <th style={{ padding: '8px', color: 'var(--text-secondary)', fontWeight: 700, width: '150px' }}>HS CODE</th>
                            <th style={{ padding: '8px', color: 'var(--text-secondary)', fontWeight: 700, width: '100px', textAlign: 'right' }}>수량 (Qty)</th>
                            <th style={{ padding: '8px', color: 'var(--text-secondary)', fontWeight: 700, width: '120px', textAlign: 'right' }}>단가 (Unit Price)</th>
                            <th style={{ padding: '8px', color: 'var(--text-secondary)', fontWeight: 700, width: '120px', textAlign: 'right' }}>금액 (Amount)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orderItems.map((item, idx) => {
                            const matchedProd = products.find(p => p.productCode === item.itemId || p.id === item.itemId);
                            return (
                              <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '8px', fontWeight: 600, color: '#0f172a' }}>{item.name}</td>
                                <td style={{ padding: '6px 8px' }}>
                                  <input 
                                    type="text" 
                                    value={item.hsCode || matchedProd?.hsCode || ''} 
                                    onChange={e => {
                                      const nextCode = e.target.value;
                                      setOrderItems(prev => prev.map((it, i) => i === idx ? { ...it, hsCode: nextCode } : it));
                                    }} 
                                    placeholder="HS Code 입력"
                                    style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', width: '100%', fontSize: '13px', fontWeight: 500, color: '#1e293b', height: '32px', boxSizing: 'border-box', outline: 'none' }} 
                                  />
                                </td>
                                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{item.qty} {item.unit}</td>
                                <td style={{ padding: '8px', textAlign: 'right', color: '#0f766e' }}>$ {Number(item.unitPrice).toFixed(2)}</td>
                                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: '#0369a1' }}>$ {Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* 6. 정산/결제 */}
          {activeStep === '정산/결제' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* 정산/결제 하위 탭 메뉴 */}
              <div style={{ display: 'flex', borderBottom: '2px solid var(--border-color)', gap: '8px', marginBottom: '8px' }}>
                {[
                  { id: '세금계산서', label: '세금계산서' },
                  { id: '대금결제', label: '대금결제' },
                  { id: 'BANK_CHARGES', label: '지급수수료' },
                  { id: '수금관리', label: '수금관리' },
                  { id: '정산현황', label: '정산현황' }
                ].map(tab => {
                  const isActive = activeSettlementTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        updateQuery({ settlementTab: tab.id });
                      }}
                      style={{
                        padding: '10px 16px',
                        fontSize: '15.5px',
                        fontWeight: 700,
                        color: isActive ? '#2563eb' : 'var(--text-secondary)',
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

              {activeSettlementTab === '세금계산서' && (

                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {/* 4) 세금계산서 발행 */}
                  <div style={{ background: '#fff', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '14.5px', fontWeight: 800, color: '#1e3a8a' }}>📄 4) 공급사 세금계산서 및 카드전표 발행 정보 등록</h4>
                    <div style={{ fontSize: '13.5px', color: 'var(--text-secondary)', marginBottom: '12px' }}>각 공급사별로 국내 발행된 세금계산서(또는 카드 영수증) 발행일자 및 국세청(또는 카드) 승인번호를 기록합니다. (다수 발행 가능)</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {allOrderSuppliers.length === 0 ? (
                        <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13.5px' }}>공급업체가 없습니다.</div>
                      ) : (
                        allOrderSuppliers.map(supplier => {
                          const raw = basicForm.supplierTaxInvoiceDetails[supplier];
                          const list: Array<{ date: string; invoiceNo: string; supplyAmount?: string; vatAmount?: string; remarks?: string; type?: '세금계산서' | '카드' }> = Array.isArray(raw)
                            ? raw
                            : (raw && (raw.date !== undefined || raw.invoiceNo !== undefined) ? [raw as any] : [{ date: '', invoiceNo: '', remarks: '', type: '세금계산서' }]);

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
                            <div key={supplier} style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', marginBottom: '4px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                  <span style={{ fontWeight: 800, fontSize: '15.5px', color: '#334155' }}>{supplier}</span>
                                  <span style={{ fontSize: '15.5px', color: '#4b5563', backgroundColor: '#f1f5f9', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                                    📋 원가 발주액: <strong>₩{poSupplyKrw.toLocaleString()}</strong> | 부가세: <strong>₩{poVatKrw.toLocaleString()}</strong> | 합계: <strong>₩{poTotalKrw.toLocaleString()}</strong>
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newList = [...list, { date: '', invoiceNo: '', supplyAmount: '', vatAmount: '', remarks: '', type: '세금계산서' as const }];
                                    setBasicForm(prev => ({
                                      ...prev,
                                      supplierTaxInvoiceDetails: {
                                        ...prev.supplierTaxInvoiceDetails,
                                        [supplier]: newList
                                      }
                                    }));
                                  }}
                                  style={{ padding: '3px 8px', fontSize: '15.5px', fontWeight: 700, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '4px', cursor: 'pointer' }}
                                >
                                  ➕ 증빙 추가
                                </button>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {/* 테이블 헤더 (1줄 레이아웃용) */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 2.2fr 1.2fr 1.1fr 1.3fr 1.5fr auto', gap: '8px', padding: '4px 0', borderBottom: '1px solid var(--border-color)', color: '#475569', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                  <span style={{ paddingLeft: '4px' }}>구분</span>
                                  <span>발행일자</span>
                                  <span>승인번호</span>
                                  <span>공급가액</span>
                                  <span>부가세액</span>
                                  <span style={{ textAlign: 'right', paddingRight: '12px' }}>합계금액</span>
                                  <span>비고</span>
                                  <span style={{ width: '28px' }}></span>
                                </div>
                                
                                {list.map((details, idx) => {
                                  const supply = Number(details.supplyAmount) || 0;
                                  const vat = Number(details.vatAmount) || 0;
                                  const total = supply + vat;
                                  return (
                                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 2.2fr 1.2fr 1.1fr 1.3fr 1.5fr auto', gap: '8px', alignItems: 'center' }}>
                                      {/* 구분 */}
                                      <select
                                        value={details.type || '세금계산서'}
                                        onChange={e => {
                                          const val = e.target.value;
                                          const newList = [...list];
                                          newList[idx] = { ...newList[idx], type: val as any };
                                          setBasicForm(prev => ({
                                            ...prev,
                                            supplierTaxInvoiceDetails: {
                                              ...prev.supplierTaxInvoiceDetails,
                                              [supplier]: newList
                                            }
                                          }));
                                        }}
                                        style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box', fontWeight: 600, color: 'var(--text-secondary)', height: '32px' }}
                                      >
                                        <option value="세금계산서">세금계산서</option>
                                        <option value="카드">카드</option>
                                      </select>
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
                                        style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box', height: '32px' }}
                                      />
                                      
                                      {/* 승인번호 */}
                                      <input
                                        type="text"
                                        placeholder={details.type === '카드' ? '카드 승인번호' : '국세청 승인번호'}
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
                                        style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box', height: '32px' }}
                                      />

                                      {/* 공급가액 */}
                                      <input
                                        type="text"
                                        placeholder="₩ 공급가액"
                                        value={toCommaString(details.supplyAmount)}
                                        onChange={e => {
                                          const valNum = fromCommaString(e.target.value);
                                          const isZeroTax = basicForm.supplierTaxTypes[supplier] === '영세';
                                          const calculatedVat = isZeroTax ? 0 : Math.round(valNum * 0.1);
                                          const newList = [...list];
                                          newList[idx] = { 
                                            ...newList[idx], 
                                            supplyAmount: String(valNum), 
                                            vatAmount: String(calculatedVat) 
                                          };
                                          setBasicForm(prev => ({
                                            ...prev,
                                            supplierTaxInvoiceDetails: {
                                              ...prev.supplierTaxInvoiceDetails,
                                              [supplier]: newList
                                            }
                                          }));
                                        }}
                                        style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box', textAlign: 'right', height: '32px' }}
                                      />

                                      {/* 부가세 */}
                                      <input
                                        type="text"
                                        placeholder="₩ 부가세"
                                        value={toCommaString(details.vatAmount)}
                                        onChange={e => {
                                          const valNum = fromCommaString(e.target.value);
                                          const newList = [...list];
                                          newList[idx] = { ...newList[idx], vatAmount: String(valNum) };
                                          setBasicForm(prev => ({
                                            ...prev,
                                            supplierTaxInvoiceDetails: {
                                              ...prev.supplierTaxInvoiceDetails,
                                              [supplier]: newList
                                            }
                                          }));
                                        }}
                                        style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box', textAlign: 'right', height: '32px' }}
                                      />

                                      {/* 합계금액 */}
                                      <div style={{ background: '#f8fafc', padding: '4px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right', boxSizing: 'border-box', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                                        ₩{total.toLocaleString()}
                                      </div>

                                      {/* 비고 */}
                                      <input
                                        type="text"
                                        placeholder="비고 입력"
                                        value={details.remarks || ''}
                                        onChange={e => {
                                          const val = e.target.value;
                                          const newList = [...list];
                                          newList[idx] = { ...newList[idx], remarks: val };
                                          setBasicForm(prev => ({
                                            ...prev,
                                            supplierTaxInvoiceDetails: {
                                              ...prev.supplierTaxInvoiceDetails,
                                              [supplier]: newList
                                            }
                                          }));
                                        }}
                                        style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box', height: '32px' }}
                                      />

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
                                          style={{ padding: '4px 8px', border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: '14px', height: '32px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
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
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 2.2fr 1.2fr 1.1fr 1.3fr 1.5fr auto', gap: '8px', alignItems: 'center', marginTop: '4px', paddingTop: '8px', borderTop: '2px double var(--border-default)', color: '#1e3a8a', fontWeight: 'bold' }}>
                                      <span style={{ fontSize: '13px', paddingLeft: '4px', gridColumn: 'span 3' }}>등록 세금계산서/카드 합계</span>
                                      <span style={{ fontSize: '13px', color: '#0f172a' }}>₩{totalInvoicesSupply.toLocaleString()}</span>
                                      <span style={{ fontSize: '13px', color: '#0f172a' }}>₩{totalInvoicesVat.toLocaleString()}</span>
                                      <span style={{ fontSize: '13px', textAlign: 'right', paddingRight: '12px', color: '#1e3a8a' }}>₩{totalInvoicesGrand.toLocaleString()}</span>
                                      <span></span>
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
                  <div style={{ background: '#fff', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '14.5px', fontWeight: 800, color: '#1e3a8a' }}>📑 5) 영세율 공급사 구매확인서 발행/유첨</h4>
                    <div style={{ fontSize: '13.5px', color: 'var(--text-secondary)', marginBottom: '12px' }}>세율이 "영세"로 지정된 공급업체에 대해서 외화 획득을 위한 구매확인서 발급 파일을 업로드하고 관리합니다.</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {(() => {
                        const zeroTaxSuppliers = allOrderSuppliers.filter(supplier => basicForm.supplierTaxTypes[supplier] === '영세');
                        if (zeroTaxSuppliers.length === 0) {
                          return (
                            <div style={{ padding: '20px', textAlign: 'center', border: '1px dashed var(--border-default)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '15.5px' }}>
                              영세율로 설정된 공급업체가 없습니다. (공급업체별 세율 구분을 "영세"로 변경하면 활성화됩니다)
                            </div>
                          );
                        }

                        return zeroTaxSuppliers.map(supplier => {
                          const fileList = basicForm.supplierPurchaseCertFiles[supplier] || [];
                          const isUploadingThis = uploadingCertSupplier === supplier;

                          return (
                            <div key={supplier} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                              <span style={{ fontWeight: 800, fontSize: '15.5px', color: '#334155' }}>{supplier} (영세율 거래처)</span>
                              <div 
                                onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = '#2563eb'; }}
                                onDragLeave={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--border-default)'; }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  e.currentTarget.style.borderColor = 'var(--border-default)';
                                  const files = e.dataTransfer.files;
                                  if (files && files.length > 0) {
                                    handleSupplierCertUpload(files[0], supplier);
                                  }
                                }}
                                style={{ border: '2px dashed var(--border-default)', borderRadius: '6px', background: '#fff', padding: '12px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s' }}
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
                                <span style={{ fontSize: '14.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                  {isUploadingThis ? '⏳ 업로드 중...' : '📂 여기에 파일을 드래그하여 놓거나 클릭하여 구매확인서 PDF 첨부'}
                                </span>
                              </div>
                              {/* 구매확인서 발행 문서 보관함 스타일 표기 */}
                              <div style={{ marginTop: '10px' }}>
                                <div style={{ fontSize: '13.5px', fontWeight: 'bold', color: '#1e3a8a', marginBottom: '6px' }}>📁 {supplier} 구매확인서 문서 보관함</div>
                                {fileList.length > 0 ? (
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14.5px', backgroundColor: '#fff', border: '1px solid var(--border-color)' }}>
                                    <thead>
                                      <tr style={{ borderBottom: '2px solid var(--border-default)', backgroundColor: '#f1f5f9' }}>
                                        <th style={{ padding: '6px 8px', textAlign: 'center', width: '40px' }}>No</th>
                                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>문서명</th>
                                        <th style={{ padding: '6px 8px', textAlign: 'center', width: '100px' }}>상태</th>
                                        <th style={{ padding: '6px 8px', textAlign: 'center', width: '220px' }}>액션</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {fileList.map((file, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>{idx + 1}</td>
                                          <td style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 'bold', color: '#334155' }}>{file.name}</td>
                                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                            <span style={{ padding: '2px 6px', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '4px', fontSize: '14.5px', fontWeight: 'bold' }}>최신</span>
                                          </td>
                                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center', flexWrap: 'nowrap' }}>
                                            <button 
                                              type="button"
                                              onClick={() => previewFile(file.url, file.name)} 
                                              style={{ padding: '3px 8px', backgroundColor: '#f1f5f9', border: '1px solid var(--border-default)', borderRadius: '4px', color: '#334155', fontSize: '15.5px', fontWeight: 'bold', cursor: 'pointer' }}
                                            >
                                              보기
                                            </button>
                                            <a 
                                              href={file.url} 
                                              download 
                                              style={{ padding: '3px 8px', backgroundColor: '#e0f2fe', border: '1px solid #bae6fd', borderRadius: '4px', color: '#0369a1', textDecoration: 'none', fontSize: '15.5px', fontWeight: 'bold', display: 'inline-block' }}
                                            >
                                              ↓ 다운로드
                                            </a>
                                            <button 
                                              type="button"
                                              onClick={() => handleDeleteSupplierCertFile(supplier, idx)} 
                                              style={{ padding: '3px 8px', backgroundColor: '#fee2e2', border: '1px solid #fecaca', borderRadius: '4px', color: '#dc2626', fontSize: '15.5px', fontWeight: 'bold', cursor: 'pointer' }}
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
                                  <div style={{ padding: '12px', textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: '6px', color: 'var(--text-muted)', fontSize: '14.5px', border: '1px solid var(--border-color)' }}>
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
                  <div style={{ background: '#fff', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)', marginTop: '24px' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '14.5px', fontWeight: 800, color: '#7c3aed' }}>📄 포워딩/운송사 세금계산서 관리</h4>
                    <div style={{ fontSize: '13.5px', color: 'var(--text-secondary)', marginBottom: '12px' }}>각 지정 포워딩업체별 세금계산서 발행 내역을 관리합니다. (여러 건 등록 가능)</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {forwardersList.length === 0 ? (
                        <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13.5px' }}>지정된 포워더/운송사가 없습니다. 선적관리 탭에서 먼저 추가해주세요.</div>
                      ) : (
                        forwardersList.map((fw, idx) => {
                          const isCardDefault = fw.name && (
                            fw.name.toUpperCase().includes('FEDEX') ||
                            fw.name.toUpperCase().includes('DHL') ||
                            fw.name.toUpperCase().includes('EMS') ||
                            fw.name.toUpperCase().includes('SF') ||
                            fw.name.includes('우체국')
                          );
                          const taxInvoices = fw.taxInvoices || (fw.taxInvoiceDate || fw.taxInvoiceNo ? [{ date: fw.taxInvoiceDate || '', invoiceNo: fw.taxInvoiceNo || '', amount: 0, supplyValue: 0, vat: 0, agentAmount: 0, type: (isCardDefault ? '카드' : '세금계산서') as '카드' | '세금계산서' }] : [{ date: '', invoiceNo: '', amount: 0, supplyValue: 0, vat: 0, agentAmount: 0, type: (isCardDefault ? '카드' : '세금계산서') as '카드' | '세금계산서' }]);
                          
                          return (
                            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 14px', background: '#faf5ff', borderRadius: '8px', border: '1px solid #e9d5ff' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '4px' }}>
                                <span style={{ fontWeight: 800, fontSize: '15.5px', color: '#6b21a8' }}>{fw.name || `포워더 #${idx+1}`}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newList = [...taxInvoices, { date: '', invoiceNo: '', amount: 0, supplyValue: 0, vat: 0, agentAmount: 0, type: (isCardDefault ? '카드' : '세금계산서') as '카드' | '세금계산서' }];
                                    setForwardersList(prev => prev.map((f, i) => i === idx ? { ...f, taxInvoices: newList } : f));
                                  }}
                                  style={{ background: '#fff', border: '1px solid #d8b4fe', borderRadius: '4px', padding: '3px 10px', fontSize: '15.5px', fontWeight: 700, color: '#7c3aed', cursor: 'pointer' }}
                                >
                                  ＋ 계산서 추가
                                </button>
                              </div>
                              
                              {/* 포워딩/운송사 금액 입력 관리 피처 이식 */}
                              {(() => {
                                const customsRate = basicForm.customsExchangeRate || piData?.exchangeRate || 1350;
                                const freightAmt = Number(fw.freightAmount) || 0;
                                const amtKrw = Number(fw.amountKrw) || 0;
                                const vatKrw = Number(fw.amountVatKrw) || 0;
                                const finalUsd = freightAmt + ((amtKrw + vatKrw) / customsRate);

                                return (
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', padding: '10px', background: '#fff', borderRadius: '6px', marginBottom: '8px', border: '1px solid #e9d5ff' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>국내운송비(KRW)</span>
                                      <input
                                        type="text"
                                        disabled={!isEditing}
                                        placeholder="0"
                                        value={fw.amountKrw !== undefined && fw.amountKrw !== null && String(fw.amountKrw) !== '' && !Number.isNaN(Number(fw.amountKrw)) ? Number(fw.amountKrw).toLocaleString() : ''}
                                        onChange={e => {
                                          const val = e.target.value.replace(/[^0-9]/g, '');
                                          setForwardersList(prev => prev.map((f, i) => i === idx ? { ...f, amountKrw: val === '' ? 0 : parseInt(val, 10) } : f));
                                        }}
                                        style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13.5px', boxSizing: 'border-box', textAlign: 'right', background: isEditing ? '#fff' : '#f8fafc', height: '34px', outline: 'none' }}
                                      />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>국내부가세(KRW)</span>
                                      <input
                                        type="text"
                                        disabled={!isEditing}
                                        placeholder="0"
                                        value={fw.amountVatKrw !== undefined && fw.amountVatKrw !== null && String(fw.amountVatKrw) !== '' && !Number.isNaN(Number(fw.amountVatKrw)) ? Number(fw.amountVatKrw).toLocaleString() : ''}
                                        onChange={e => {
                                          const val = e.target.value.replace(/[^0-9]/g, '');
                                          setForwardersList(prev => prev.map((f, i) => i === idx ? { ...f, amountVatKrw: val === '' ? 0 : parseInt(val, 10) } : f));
                                        }}
                                        style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13.5px', boxSizing: 'border-box', textAlign: 'right', background: isEditing ? '#fff' : '#f8fafc', height: '34px', outline: 'none' }}
                                      />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>해상운임(USD)</span>
                                      <input
                                        type="text"
                                        disabled={!isEditing}
                                        placeholder="0.00"
                                        value={editingFreight && editingFreight.idx === idx ? editingFreight.value : (fw.freightAmount !== undefined && fw.freightAmount !== null && String(fw.freightAmount) !== '' && !Number.isNaN(Number(fw.freightAmount)) ? Number(fw.freightAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')}
                                        onFocus={() => setEditingFreight({ idx, value: String(fw.freightAmount || '') })}
                                        onBlur={() => setEditingFreight(null)}
                                        onChange={e => {
                                          const val = e.target.value.replace(/[^0-9.]/g, '');
                                          const parts = val.split('.');
                                          const cleanVal = parts[0] + (parts.length > 1 ? '.' + parts.slice(1).join('') : '');
                                          setEditingFreight({ idx, value: cleanVal });
                                          const numVal = cleanVal === '' ? 0 : parseFloat(cleanVal);
                                          setForwardersList(prev => prev.map((f, i) => i === idx ? { ...f, freightAmount: numVal, freightCurrency: 'USD' } : f));
                                        }}
                                        style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13.5px', boxSizing: 'border-box', textAlign: 'right', background: isEditing ? '#fff' : '#f8fafc', height: '34px', outline: 'none' }}
                                      />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right', marginRight: '4px' }}>최종(USD)</span>
                                      <div style={{ padding: '6px 10px', fontSize: '13.5px', fontWeight: 700, color: '#ef4444', textAlign: 'right', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '4px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', boxSizing: 'border-box' }}>
                                        ${finalUsd > 0 ? finalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {/* 테이블 헤더 (1줄 레이아웃용) */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 2.2fr 1.2fr 1.1fr 1.1fr 1.3fr auto', gap: '8px', padding: '4px 0', borderBottom: '1px solid var(--border-color)', color: '#475569', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                  <span style={{ paddingLeft: '4px' }}>구분</span>
                                  <span>발행일자</span>
                                  <span>승인번호</span>
                                  <span>공급가액</span>
                                  <span>부가세액</span>
                                  <span>대납비용</span>
                                  <span style={{ textAlign: 'right', paddingRight: '12px' }}>합계금액</span>
                                  <span style={{ width: '28px' }}></span>
                                </div>

                                {taxInvoices.map((inv, invIdx) => {
                                  const displaySupplyVal = inv.supplyValue !== undefined ? inv.supplyValue : (inv.amount || 0);
                                  const displayVat = inv.vat !== undefined ? inv.vat : 0;
                                  const displayAgentAmt = inv.agentAmount !== undefined ? inv.agentAmount : 0;
                                  const displayTotal = inv.amount || (displaySupplyVal + displayVat + displayAgentAmt);

                                  return (
                                    <div key={invIdx} style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 2.2fr 1.2fr 1.1fr 1.1fr 1.3fr auto', gap: '8px', alignItems: 'center' }}>
                                      {/* 구분 */}
                                      <select
                                        value={inv.type || '세금계산서'}
                                        onChange={e => {
                                          const newList = [...taxInvoices];
                                          newList[invIdx].type = e.target.value as '세금계산서' | '카드';
                                          setForwardersList(prev => prev.map((f, i) => i === idx ? { ...f, taxInvoices: newList } : f));
                                        }}
                                        style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box', fontWeight: 600, color: 'var(--text-secondary)', height: '32px' }}
                                      >
                                        <option value="세금계산서">세금계산서</option>
                                        <option value="카드">카드</option>
                                      </select>
                                      {/* 발행일자 */}
                                      <input
                                        type="date"
                                        value={inv.date || ''}
                                        onChange={e => {
                                          const newList = [...taxInvoices];
                                          newList[invIdx].date = e.target.value;
                                          setForwardersList(prev => prev.map((f, i) => i === idx ? { ...f, taxInvoices: newList } : f));
                                        }}
                                        style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box', height: '32px' }}
                                      />
                                      {/* 승인번호 */}
                                      <input
                                        type="text"
                                        placeholder={inv.type === '카드' ? '카드 승인번호' : '국세청 승인번호'}
                                        value={inv.invoiceNo || ''}
                                        onChange={e => {
                                          const newList = [...taxInvoices];
                                          newList[invIdx].invoiceNo = e.target.value;
                                          setForwardersList(prev => prev.map((f, i) => i === idx ? { ...f, taxInvoices: newList } : f));
                                        }}
                                        style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box', height: '32px' }}
                                      />
                                      {/* 공급가액 */}
                                      <input
                                        type="text"
                                        placeholder="₩ 공급가액"
                                        value={toCommaString(displaySupplyVal)}
                                        onChange={e => {
                                          const val = fromCommaString(e.target.value);
                                          const autoVat = Math.round(val * 0.1);
                                          const newList = [...taxInvoices];
                                          const currentAgentAmt = newList[invIdx].agentAmount !== undefined ? newList[invIdx].agentAmount : 0;
                                          newList[invIdx].supplyValue = val;
                                          newList[invIdx].vat = autoVat;
                                          newList[invIdx].amount = val + autoVat + currentAgentAmt;
                                          setForwardersList(prev => prev.map((f, i) => i === idx ? { ...f, taxInvoices: newList } : f));
                                        }}
                                        style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', background: '#fff', outline: 'none', textAlign: 'right', width: '100%', boxSizing: 'border-box', height: '32px' }}
                                      />
                                      {/* 부가세액 */}
                                      <input
                                        type="text"
                                        placeholder="₩ 부가세"
                                        value={toCommaString(displayVat)}
                                        onChange={e => {
                                          const val = fromCommaString(e.target.value);
                                          const newList = [...taxInvoices];
                                          const currentSupply = newList[invIdx].supplyValue !== undefined ? newList[invIdx].supplyValue : 0;
                                          const currentAgentAmt = newList[invIdx].agentAmount !== undefined ? newList[invIdx].agentAmount : 0;
                                          newList[invIdx].vat = val;
                                          newList[invIdx].amount = currentSupply + val + currentAgentAmt;
                                          setForwardersList(prev => prev.map((f, i) => i === idx ? { ...f, taxInvoices: newList } : f));
                                        }}
                                        style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', background: '#fff', outline: 'none', textAlign: 'right', width: '100%', boxSizing: 'border-box', height: '32px' }}
                                      />
                                      {/* 대납비용 */}
                                      <input
                                        type="text"
                                        placeholder="₩ 대납비용"
                                        value={toCommaString(displayAgentAmt)}
                                        onChange={e => {
                                          const val = fromCommaString(e.target.value);
                                          const newList = [...taxInvoices];
                                          const currentSupply = newList[invIdx].supplyValue !== undefined ? newList[invIdx].supplyValue : 0;
                                          const currentVat = newList[invIdx].vat !== undefined ? newList[invIdx].vat : 0;
                                          newList[invIdx].agentAmount = val;
                                          newList[invIdx].amount = currentSupply + currentVat + val;
                                          setForwardersList(prev => prev.map((f, i) => i === idx ? { ...f, taxInvoices: newList } : f));
                                        }}
                                        style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', background: '#fff', outline: 'none', textAlign: 'right', width: '100%', boxSizing: 'border-box', height: '32px' }}
                                      />
                                      {/* 합계금액 (Readonly) */}
                                      <div style={{ background: '#f8fafc', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right', boxSizing: 'border-box', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '12px' }}>
                                        ₩{displayTotal.toLocaleString()}
                                      </div>
                                      
                                      {/* Delete Button */}
                                      {taxInvoices.length > 1 ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const filtered = taxInvoices.filter((_, i) => i !== invIdx);
                                            const updated = filtered.length > 0 ? filtered : [{ date: '', invoiceNo: '', amount: 0, supplyValue: 0, vat: 0, agentAmount: 0 }];
                                            setForwardersList(prev => prev.map((f, i) => i === idx ? { ...f, taxInvoices: updated } : f));
                                          }}
                                          style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px', height: '32px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, padding: 0 }}
                                        >✕</button>
                                      ) : (
                                        <span style={{ width: '28px' }} />
                                      )}
                                    </div>
                                  );
                                })}

                                {/* 세금계산서 전체 합계 Row */}
                                {(() => {
                                  const totalSupply = taxInvoices.reduce((sum, inv) => sum + (inv.supplyValue !== undefined ? inv.supplyValue : (inv.amount || 0)), 0);
                                  const totalVat = taxInvoices.reduce((sum, inv) => sum + (inv.vat !== undefined ? inv.vat : 0), 0);
                                  const totalAgent = taxInvoices.reduce((sum, inv) => sum + (inv.agentAmount !== undefined ? inv.agentAmount : 0), 0);
                                  const totalSum = taxInvoices.reduce((sum, inv) => sum + (inv.amount || ((inv.supplyValue !== undefined ? inv.supplyValue : (inv.amount || 0)) + (inv.vat !== undefined ? inv.vat : 0) + (inv.agentAmount !== undefined ? inv.agentAmount : 0))), 0);

                                  return (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2.2fr 1.2fr 1.1fr 1.1fr 1.3fr auto', gap: '8px', alignItems: 'center', background: '#f5f3ff', borderTop: '2px solid #c084fc', borderBottom: '2.5px double #c084fc', padding: '6px 0', fontSize: '13px', fontWeight: 800 }}>
                                      <span style={{ paddingLeft: '10px', color: '#6b21a8' }}>합계 (Total)</span>
                                      <span></span>
                                      <span style={{ textAlign: 'right', paddingRight: '10px', color: '#0f172a' }}>₩{totalSupply.toLocaleString()}</span>
                                      <span style={{ textAlign: 'right', paddingRight: '10px', color: '#0f172a' }}>₩{totalVat.toLocaleString()}</span>
                                      <span style={{ textAlign: 'right', paddingRight: '10px', color: '#0f172a' }}>₩{totalAgent.toLocaleString()}</span>
                                      <span style={{ textAlign: 'right', paddingRight: '12px', color: '#7c3aed', fontSize: '13px' }}>₩{totalSum.toLocaleString()}</span>
                                      <span style={{ width: '28px' }} />
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

                  {/* 포워딩/운송사 세금계산서 아래로 이동된 거래서류 첨부 영역 */}
                  <div style={{ background: '#fff', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)', marginTop: '24px' }}>
                    <span style={{ fontSize: '15.5px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>📂 거래서류 첨부 (거래명세표 등)</span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
                      {renderFileField("거래서류 (거래명세표)", "transactionFiles", "transaction-file-uploader")}
                    </div>
                  </div>

                </div>
              
              )}

              {activeSettlementTab === 'BANK_CHARGES' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div style={{ background: '#fff', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div>
                        <h4 style={{ margin: '0 0 4px 0', fontSize: '14.5px', fontWeight: 800, color: '#1e3a8a' }}>💸 지급수수료 관리</h4>
                        <div style={{ fontSize: '13.5px', color: 'var(--text-secondary)' }}>통관수수료, 원산지 증명서 발행비, 신용장수령, 기타 은행수수료 등 제반 수수료 항목과 금액을 등록합니다. (정산현황에서 자동 차감됩니다.)</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const current = basicForm.bankCharges || [];
                          setBasicForm(p => ({
                            ...p,
                            bankCharges: [...current, { item: '', amount: 0 }]
                          }));
                        }}
                        style={{ background: '#2563eb', border: 'none', borderRadius: '4px', padding: '0 12px', fontSize: '13px', fontWeight: 700, color: '#fff', cursor: 'pointer', height: '34px', display: 'inline-flex', alignItems: 'center' }}
                      >
                        ＋ 수수료 항목 추가
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {(!basicForm.bankCharges || basicForm.bankCharges.length === 0) ? (
                        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', border: '1px dashed var(--border-default)', borderRadius: '6px', backgroundColor: '#f8fafc' }}>
                          등록된 수수료 내역이 없습니다. '수수료 항목 추가' 버튼을 눌러 등록해주세요.
                        </div>
                      ) : (
                        <div style={{ border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                              <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border-color)', fontSize: '11px', color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                <th style={{ padding: '8px 10px', textAlign: 'left', width: '50px' }}>번호</th>
                                <th style={{ padding: '8px 10px', textAlign: 'left', width: '130px' }}>발생일자</th>
                                <th style={{ padding: '8px 10px', textAlign: 'left' }}>수수료 항목</th>
                                <th style={{ padding: '8px 10px', textAlign: 'right', width: '180px' }}>금액 (KRW ₩)</th>
                                <th style={{ padding: '8px 10px', textAlign: 'left', width: '250px' }}>영수증 첨부</th>
                                <th style={{ padding: '8px 10px', textAlign: 'center', width: '80px' }}>작업</th>
                              </tr>
                            </thead>
                            <tbody>
                              {basicForm.bankCharges.map((bc, index) => {
                                const handleFieldChange = (field: 'date' | 'item' | 'amount', val: any) => {
                                  const list = [...(basicForm.bankCharges || [])];
                                  list[index] = { ...list[index], [field]: val };
                                  setBasicForm(p => ({ ...p, bankCharges: list }));
                                };

                                return (
                                  <tr key={index} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', fontWeight: 600 }}>{index + 1}</td>
                                    <td style={{ padding: '8px 10px' }}>
                                      <input
                                        type="date"
                                        value={bc.date || ''}
                                        onChange={e => handleFieldChange('date', e.target.value)}
                                        onBlur={() => handleSaveBasic(false)}
                                        onKeyDown={e => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } }}
                                        style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box', height: '32px' }}
                                      />
                                    </td>
                                    <td style={{ padding: '8px 10px' }}>
                                      <input
                                        type="text"
                                        list="bank-charges-items"
                                        value={bc.item || ''}
                                        placeholder="선택하거나 직접 입력하세요"
                                        onChange={e => handleFieldChange('item', e.target.value)}
                                        onBlur={() => handleSaveBasic(false)}
                                        onKeyDown={e => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } }}
                                        style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', boxSizing: 'border-box', height: '32px' }}
                                      />
                                    </td>
                                    <td style={{ padding: '8px 10px' }}>
                                      <FormattedNumberInput
                                        value={bc.amount || 0}
                                        onChange={val => handleFieldChange('amount', val)}
                                        onBlur={() => handleSaveBasic(false)}
                                        onKeyDown={e => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } }}
                                        style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', textAlign: 'right', fontWeight: 600, boxSizing: 'border-box', height: '32px' }}
                                      />
                                    </td>
                                    <td style={{ padding: '8px 10px' }}>
                                      <div 
                                        style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}
                                        onPaste={async (e) => {
                                          const items = e.clipboardData.items;
                                          for (let fIdx = 0; fIdx < items.length; fIdx++) {
                                            if (items[fIdx].type.indexOf('image') !== -1) {
                                              const file = items[fIdx].getAsFile();
                                              if (file) {
                                                e.preventDefault();
                                                await handleBankChargeReceiptUpload(file, index);
                                              }
                                            }
                                          }
                                        }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          <input
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            id={`bank-charge-receipt-upload-${index}`}
                                            style={{ display: 'none' }}
                                            onChange={async (e) => {
                                              const files = e.target.files;
                                              if (files && files.length > 0) {
                                                for (let fIdx = 0; fIdx < files.length; fIdx++) {
                                                  await handleBankChargeReceiptUpload(files[fIdx], index);
                                                }
                                              }
                                            }}
                                          />
                                          <label
                                            htmlFor={`bank-charge-receipt-upload-${index}`}
                                            style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 8px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap', height: '32px', display: 'inline-flex', alignItems: 'center', boxSizing: 'border-box' }}
                                          >
                                            파일 선택
                                          </label>
                                          <span style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>클릭 후 Ctrl+V 붙여넣기 지원</span>
                                        </div>

                                        {bc.receiptFiles && bc.receiptFiles.length > 0 && (
                                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
                                            {bc.receiptFiles.map((file: any, fIdx: number) => (
                                              <div key={fIdx} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#f1f5f9', border: '1px solid var(--border-color)', padding: '2px 6px', borderRadius: '4px' }}>
                                                <span 
                                                  onClick={() => previewFile(file.url, file.name)} 
                                                  style={{ fontSize: '13px', color: '#2563eb', textDecoration: 'underline', cursor: 'pointer', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                                  title={file.name}
                                                >
                                                  {file.name}
                                                </span>
                                                <button
                                                  type="button"
                                                  onClick={() => handleDeleteBankChargeReceipt(index, fIdx)}
                                                  style={{ border: 'none', background: 'transparent', color: '#ef4444', fontSize: '14px', cursor: 'pointer', padding: '0 2px' }}
                                                >
                                                  ✕
                                                </button>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                        {uploadingBankChargeReceipt === index && (
                                          <span style={{ fontSize: '9px', color: '#2563eb', fontWeight: 600 }}>⏳ 업로드 중...</span>
                                        )}
                                      </div>
                                    </td>
                                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const list = (basicForm.bankCharges || []).filter((_, i) => i !== index);
                                          setBasicForm(p => ({ ...p, bankCharges: list }));
                                        }}
                                        style={{ background: 'transparent', border: '1px solid #ef4444', borderRadius: '4px', padding: '0 8px', fontSize: '13px', color: '#ef4444', cursor: 'pointer', height: '32px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                      >
                                        삭제
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                              <tr style={{ background: '#f8fafc', fontWeight: 800, borderTop: '2px solid #cbd5e1' }}>
                                <td colSpan={3} style={{ padding: '8px 10px', color: '#475569', textAlign: 'left' }}>🧮 지급수수료 총액 합계</td>
                                <td style={{ padding: '8px 10px', color: '#2563eb', textAlign: 'right', fontSize: '13px' }}>
                                  ₩{basicForm.bankCharges.reduce((sum, bc) => sum + (bc.amount || 0), 0).toLocaleString()} KRW
                                </td>
                                <td colSpan={2}></td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>

                  <datalist id="bank-charges-items">
                    <option value="통관수수료" />
                    <option value="원산지 증명서 발행비" />
                    <option value="신용장수령" />
                    <option value="기타 은행수수료" />
                    <option value="환가료" />
                    <option value="대체료" />
                    <option value="전신료" />
                  </datalist>
                </div>
              )}

              {activeSettlementTab === '대금결제' && (

                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {/* 7) 대금결제관리 */}
                  <div style={{ background: '#fff', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '14.5px', fontWeight: 800, color: '#1e3a8a' }}>💳 7) 대금결제관리 (공급업체 외화/원화 대금 지급)</h4>
                    <div style={{ fontSize: '13.5px', color: 'var(--text-secondary)', marginBottom: '12px' }}>각 공급사별 원화/외화 수주 금액 대비 지급(송금) 완료 내역 및 미수금을 분할 입금 형식으로 지정합니다.</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {allOrderSuppliers.length === 0 ? (
                        <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13.5px' }}>공급업체가 없습니다.</div>
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
                          
                          const krwRemittance = installments.filter(inst => (inst.currency === 'KRW' || (!inst.currency && isKrw)) && inst.method !== '카드').reduce((sum, inst) => sum + (inst.amount || 0), 0);
                          const krwCard = installments.filter(inst => (inst.currency === 'KRW' || (!inst.currency && isKrw)) && inst.method === '카드').reduce((sum, inst) => sum + (inst.amount || 0), 0);
                          const usdRemittance = installments.filter(inst => (inst.currency === 'USD' || (!inst.currency && !isKrw)) && inst.method !== '카드').reduce((sum, inst) => sum + (inst.amount || 0), 0);
                          const usdCard = installments.filter(inst => (inst.currency === 'USD' || (!inst.currency && !isKrw)) && inst.method === '카드').reduce((sum, inst) => sum + (inst.amount || 0), 0);

                          const krwOutstanding = Math.max(0, Math.round(krwGrand - krwPaid));
                          const usdOutstanding = Math.max(0, parseFloat((usdGrand - usdPaid).toFixed(2)));
                          
                          const isCompleted = (krwGrand === 0 || krwPaid >= (krwGrand - 0.9)) && (usdGrand === 0 || usdPaid >= (usdGrand - 0.009));

                          const handleInstallmentChange = (idx: number, field: 'date' | 'amount' | 'currency' | 'method', value: any) => {
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
                          <div key={supplier} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 12px', background: supplierIdx % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid var(--border-color)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                <span style={{ fontWeight: 800, fontSize: '14.5px', color: '#1e3a8a', width: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={supplier}>{supplier}</span>
                                {matchingSupplier && (
                                  <div style={{ display: 'flex', gap: '12px', fontSize: '15.5px', color: 'var(--text-secondary)' }}>
                                    <span>🏦 {matchingSupplier.bankKrw || '-'}</span>
                                    <span>🌍 {matchingSupplier.bankUsd || '-'}</span>
                                  </div>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '14.5px' }}>
                                <span>발주: <strong>{usdGrand > 0 ? `$${usdGrand.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : ''} {usdGrand > 0 && krwGrand > 0 ? ' / ' : ''} {krwGrand > 0 ? `₩${krwGrand.toLocaleString()}` : (usdGrand === 0 ? '₩0' : '')}</strong></span>
                                <span>
                                  결제액: <strong style={{ color: 'var(--focus-ring)' }}>
                                    {usdPaid > 0 ? `$${usdPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : ''} {usdPaid > 0 && krwPaid > 0 ? ' / ' : ''} {krwPaid > 0 ? `₩${krwPaid.toLocaleString()}` : (usdPaid === 0 ? '₩0' : '')}
                                  </strong>
                                  {(krwCard > 0 || usdCard > 0) && (
                                    <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginLeft: '4px' }}>
                                      ({[
                                        krwRemittance > 0 ? `송금 ₩${krwRemittance.toLocaleString()}` : null,
                                        krwCard > 0 ? `카드 ₩${krwCard.toLocaleString()}` : null,
                                        usdRemittance > 0 ? `송금 $${usdRemittance.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : null,
                                        usdCard > 0 ? `카드 $${usdCard.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : null
                                      ].filter(Boolean).join(', ')})
                                    </span>
                                  )}
                                </span>
                                <span>잔액: <strong style={{ color: (krwOutstanding > 0 || usdOutstanding > 0) ? '#ef4444' : 'var(--text-secondary)' }}>{usdOutstanding > 0 ? `$${usdOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : ''} {usdOutstanding > 0 && krwOutstanding > 0 ? ' / ' : ''} {krwOutstanding > 0 ? `₩${krwOutstanding.toLocaleString()}` : (usdOutstanding === 0 ? '₩0' : '')}</strong></span>
                                <span style={{ padding: '2px 6px', borderRadius: '4px', background: isCompleted ? '#dcfce7' : '#fee2e2', color: isCompleted ? '#15803d' : '#b91c1c', fontWeight: 700, fontSize: '13.5px' }}>
                                  {isCompleted ? '결제완료' : '지급대기'}
                                </span>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', paddingLeft: '165px' }}>
                              {installments.map((inst, i) => (
                                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 8px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)', width: '410px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>{i + 1}차</span>
                                    <input
                                      type="date"
                                      value={inst.date}
                                      onChange={e => handleInstallmentChange(i, 'date', e.target.value)}
                                      style={{ padding: '1px 4px', border: 'none', borderRight: '1px solid var(--border-color)', fontSize: '13px', width: '135px', outline: 'none' }}
                                    />
                                    <select
                                      value={inst.currency || (isKrw ? 'KRW' : 'USD')}
                                      onChange={e => handleCurrencySelection(e.target.value, inst.currency || (isKrw ? 'KRW' : 'USD'), customCurrencies, val => handleInstallmentChange(i, 'currency', val))}
                                      style={{ padding: '1px 2px', border: 'none', fontSize: '13px', outline: 'none', background: 'transparent' }}
                                    >
                                      {[...DEFAULT_CURRENCIES, ...customCurrencies].map(c => <option key={c} value={c}>{c}</option>)}
                                      <option value="ADD_NEW_CURRENCY" style={{ color: '#2563eb', fontWeight: 'bold' }}>+</option>
                                    </select>
                                    <select
                                      value={inst.method || '송금'}
                                      onChange={e => handleInstallmentChange(i, 'method', e.target.value)}
                                      style={{ padding: '1px 2px', border: 'none', fontSize: '13px', outline: 'none', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 600 }}
                                    >
                                      <option value="송금">송금</option>
                                      <option value="카드">카드</option>
                                    </select>
                                    <FormattedNumberInput
                                      placeholder="지급액"
                                      value={inst.amount || 0}
                                      onChange={val => handleInstallmentChange(i, 'amount', val)}
                                      style={{ padding: '1px 4px', border: 'none', fontSize: '13px', width: '110px', textAlign: 'right', outline: 'none' }}
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
                                        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px', fontWeight: 700, padding: '0 4px', marginLeft: '2px', height: '24px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                      >✕</button>
                                    )}
                                  </div>
                                  <div 
                                    style={{ 
                                      borderTop: '1px dashed var(--border-color)', 
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
                                      <span style={{ fontSize: '8px', color: 'var(--text-muted)' }}>📋 포커스 후 Ctrl+V로 캡처 첨부</span>
                                      <label style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '2px', background: '#f1f5f9', padding: '1px 4px', borderRadius: '3px', border: '1px solid var(--border-default)', fontSize: '8.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>
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
                                          <div key={fileIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '2px 4px', borderRadius: '3px', border: '1px solid var(--border-color)' }}>
                                            <span 
                                              onClick={() => previewFile(file.url, file.name)}
                                              style={{ fontSize: '11px', color: '#2563eb', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}
                                              title="클릭하여 미리보기"
                                            >
                                              {file.name}
                                            </span>
                                            <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                                              <a href={file.url} download={file.name} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', textDecoration: 'none', color: '#3b82f6', background: '#eff6ff', padding: '1px 4px', borderRadius: '2px' }}>
                                                ⬇
                                              </a>
                                              <button 
                                                type="button" 
                                                onClick={() => handleDeleteReceipt(supplier, i, fileIdx)} 
                                                style={{ border: 'none', background: '#fee2e2', color: '#ef4444', borderRadius: '2px', cursor: 'pointer', fontSize: '11px', padding: '1px 4px' }}
                                              >
                                                ✕
                                              </button>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {uploadingReceipt?.supplier === supplier && uploadingReceipt?.index === i && (
                                      <span style={{ fontSize: '11px', color: '#3b82f6' }}>⏳ 업로드 중...</span>
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
                                style={{ background: '#f1f5f9', border: '1px dashed #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer', height: '32px', display: 'inline-flex', alignItems: 'center' }}
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
                  <div style={{ background: '#fff', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '14.5px', fontWeight: 800, color: '#7c3aed' }}>💳 7-2) 포워딩/운송사 대금결제 관리</h4>
                    <div style={{ fontSize: '13.5px', color: 'var(--text-secondary)', marginBottom: '12px' }}>각 지정 포워딩업체별 최종 실 청구액에 대한 송금 지급내역을 관리합니다.</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {forwardersList.length === 0 ? (
                        <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13.5px' }}>지정된 포워더/운송사가 없습니다. 선적관리 탭에서 먼저 추가해주세요.</div>
                      ) : (
                        forwardersList.map((fw, idx) => {
                          const installments = fw.paymentInstallments || [{ date: '', amount: 0, currency: (fw.freightCurrency || 'KRW') as 'KRW' | 'USD' }];
                          
                          // Calculate total final cost (USD final + KRW final converted or handled separately, we display both)
                          const krwPaid = installments.filter(inst => inst.currency === 'KRW' || (!inst.currency && fw.freightCurrency !== 'USD')).reduce((sum, inst) => sum + (inst.amount || 0), 0);
                          const usdPaid = installments.filter(inst => inst.currency === 'USD' || (!inst.currency && fw.freightCurrency === 'USD')).reduce((sum, inst) => sum + (inst.amount || 0), 0);
                          
                          const krwRemittance = installments.filter(inst => (inst.currency === 'KRW' || (!inst.currency && fw.freightCurrency !== 'USD')) && (inst.method !== '카드')).reduce((sum, inst) => sum + (inst.amount || 0), 0);
                          const krwCard = installments.filter(inst => (inst.currency === 'KRW' || (!inst.currency && fw.freightCurrency !== 'USD')) && (inst.method === '카드')).reduce((sum, inst) => sum + (inst.amount || 0), 0);
                          const usdRemittance = installments.filter(inst => (inst.currency === 'USD' || (!inst.currency && fw.freightCurrency === 'USD')) && (inst.method !== '카드')).reduce((sum, inst) => sum + (inst.amount || 0), 0);
                          const usdCard = installments.filter(inst => (inst.currency === 'USD' || (!inst.currency && fw.freightCurrency === 'USD')) && (inst.method === '카드')).reduce((sum, inst) => sum + (inst.amount || 0), 0);
                          
                          const finalUsd = (fw.freightCurrency === 'USD' ? (fw.freightAmount ? Number(fw.freightAmount) : 0) : 0);
                          const finalKrw = (fw.amountKrw ? Number(fw.amountKrw) : 0) + (fw.amountVatKrw ? Number(fw.amountVatKrw) : 0) + (fw.freightCurrency === 'KRW' ? (fw.freightAmount ? Number(fw.freightAmount) : 0) : 0);
                          
                          const krwOutstanding = Math.max(0, finalKrw - krwPaid);
                          const usdOutstanding = Math.max(0, finalUsd - usdPaid);
                          const isCompleted = (finalKrw === 0 || krwOutstanding <= 0) && (finalUsd === 0 || usdOutstanding <= 0);
                          
                          const handleFwInstallmentChange = (instIdx: number, field: 'date' | 'amount' | 'currency' | 'method', value: any) => {
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
                            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 12px', background: idx % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid var(--border-color)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                  <span style={{ fontWeight: 800, fontSize: '14.5px', color: '#6b21a8', width: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={fw.name || `포워더 #${idx+1}`}>{fw.name || `포워더 #${idx+1}`}</span>
                                </div>
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '14.5px' }}>
                                  <span>최종실비용: <strong>{finalUsd > 0 ? `$${finalUsd.toLocaleString()}` : ''} {finalUsd > 0 && finalKrw > 0 ? ' / ' : ''} {finalKrw > 0 ? `₩${finalKrw.toLocaleString()}` : (finalUsd === 0 ? '₩0' : '')}</strong></span>
                                  <span>
                                    결제액: <strong style={{ color: 'var(--focus-ring)' }}>
                                      {usdPaid > 0 ? `$${usdPaid.toLocaleString()}` : ''} {usdPaid > 0 && krwPaid > 0 ? ' / ' : ''} {krwPaid > 0 ? `₩${krwPaid.toLocaleString()}` : (usdPaid === 0 ? '₩0' : '')}
                                    </strong>
                                    {(krwCard > 0 || usdCard > 0) && (
                                      <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginLeft: '4px' }}>
                                        ({[
                                          krwRemittance > 0 ? `송금 ₩${krwRemittance.toLocaleString()}` : null,
                                          krwCard > 0 ? `카드 ₩${krwCard.toLocaleString()}` : null,
                                          usdRemittance > 0 ? `송금 $${usdRemittance.toLocaleString()}` : null,
                                          usdCard > 0 ? `카드 $${usdCard.toLocaleString()}` : null
                                        ].filter(Boolean).join(', ')})
                                      </span>
                                    )}
                                  </span>
                                  <span>미수잔액: <strong style={{ color: (krwOutstanding > 0 || usdOutstanding > 0) ? '#ef4444' : 'var(--text-secondary)' }}>{usdOutstanding > 0 ? `$${usdOutstanding.toLocaleString()}` : ''} {usdOutstanding > 0 && krwOutstanding > 0 ? ' / ' : ''} {krwOutstanding > 0 ? `₩${krwOutstanding.toLocaleString()}` : (usdOutstanding === 0 ? '₩0' : '')}</strong></span>
                                  <span style={{ padding: '2px 6px', borderRadius: '4px', background: isCompleted ? '#dcfce7' : '#fee2e2', color: isCompleted ? '#15803d' : '#b91c1c', fontWeight: 700, fontSize: '13.5px' }}>
                                    {isCompleted ? '결제완료' : '지급대기'}
                                  </span>
                                </div>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', paddingLeft: '165px' }}>
                                {installments.map((inst, instIdx) => (
                                  <div key={instIdx} style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 8px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)', width: '410px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>{instIdx + 1}차</span>
                                      <input
                                        type="date"
                                      value={inst.date || ''}
                                        onChange={e => handleFwInstallmentChange(instIdx, 'date', e.target.value)}
                                        style={{ padding: '1px 4px', border: 'none', borderRight: '1px solid var(--border-color)', fontSize: '13px', width: '135px', outline: 'none' }}
                                      />
                                      <select
                                         value={inst.currency || fw.freightCurrency || 'KRW'}
                                         onChange={e => handleCurrencySelection(e.target.value, inst.currency || fw.freightCurrency || 'KRW', customCurrencies, val => handleFwInstallmentChange(instIdx, 'currency', val))}
                                         style={{ padding: '1px 2px', border: 'none', fontSize: '13px', outline: 'none', background: 'transparent' }}
                                       >
                                         {[...DEFAULT_CURRENCIES, ...customCurrencies].map(c => <option key={c} value={c}>{c}</option>)}
                                         <option value="ADD_NEW_CURRENCY" style={{ color: '#2563eb', fontWeight: 'bold' }}>+</option>
                                       </select>
                                      <select
                                        value={inst.method || '송금'}
                                        onChange={e => handleFwInstallmentChange(instIdx, 'method', e.target.value)}
                                        style={{ padding: '1px 2px', border: 'none', fontSize: '13px', outline: 'none', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 600 }}
                                      >
                                        <option value="송금">송금</option>
                                        <option value="카드">카드</option>
                                      </select>
                                      <FormattedNumberInput
                                        placeholder="지급액"
                                        value={inst.amount || 0}
                                        onChange={val => handleFwInstallmentChange(instIdx, 'amount', val)}
                                        style={{ padding: '1px 4px', border: 'none', fontSize: '13px', width: '110px', textAlign: 'right', outline: 'none' }}
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
                                          style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px', fontWeight: 700, padding: '0 4px', marginLeft: '2px', height: '24px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                        >✕</button>
                                      )}
                                    </div>
                                    <div 
                                      style={{ 
                                        borderTop: '1px dashed var(--border-color)', 
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
                                        <span style={{ fontSize: '11px', color: '#64748b' }}>📋 포커스 후 Ctrl+V로 캡처 첨부</span>
                                        <label style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '2px', background: '#f1f5f9', padding: '2px 6px', borderRadius: '3px', border: '1px solid #cbd5e1', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
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
                                            <div key={fileIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '2px 4px', borderRadius: '3px', border: '1px solid var(--border-color)' }}>
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
                                  style={{ background: '#f1f5f9', border: '1px dashed var(--text-muted)', borderRadius: '4px', padding: '3px 10px', fontSize: '13.5px', fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer' }}
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

              {(activeSettlementTab === '수금관리' || activeSettlementTab === '정산현황') && (() => {
                const customsRate = basicForm.customsExchangeRate || piData?.exchangeRate || 1350;
                const orderAmountUsd = piData?.totalUsd || order?.totalAmount || 0;

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

                const forwarderExpenseKrw = forwardersList.reduce((sum, fw) => {
                  if (fw.taxInvoices && fw.taxInvoices.length > 0) {
                    const invoiceSum = fw.taxInvoices.reduce((invSum, inv) => {
                      const supplyVal = inv.supplyValue !== undefined ? inv.supplyValue : (inv.amount || 0);
                      const vat = inv.vat !== undefined ? inv.vat : 0;
                      const agent = inv.agentAmount !== undefined ? inv.agentAmount : 0;
                      return invSum + (inv.amount || (supplyVal + vat + agent));
                    }, 0);
                    return sum + invoiceSum;
                  }
                  const usd = (fw.freightCurrency === 'USD' ? (fw.freightAmount ? Number(fw.freightAmount) : 0) : 0);
                  const krw = (fw.amountKrw ? Number(fw.amountKrw) : 0) + (fw.amountVatKrw ? Number(fw.amountVatKrw) : 0) + (fw.freightCurrency === 'KRW' ? (fw.freightAmount ? Number(fw.freightAmount) : 0) : 0);
                  return sum + krw + Math.round(usd * customsRate);
                }, 0);

                // BANK CHARGES (LC) 계산 (KRW 기준)
                const totalBankChargesKrw = (basicForm.bankCharges || []).reduce((sum, bc) => sum + (bc.amount || 0), 0);
                const totalBankChargesUsd = customsRate > 0 ? (totalBankChargesKrw / customsRate) : 0;

                const totalCostKrw = consolidatedPurchaseKrw + forwarderExpenseKrw;
                const totalCostUsd = customsRate > 0 ? (totalCostKrw / customsRate) : 0;

                // 정산현황에서 BANK CHARGES 차감
                const actualUsdProfit = orderAmountUsd - totalCostUsd - totalBankChargesUsd;
                const usdMargin = orderAmountUsd > 0 ? (actualUsdProfit / orderAmountUsd) * 100 : 0;

                const orderAmountKrw = orderAmountUsd * customsRate;
                const actualKrwProfit = orderAmountKrw - totalCostKrw - totalBankChargesKrw;
                const krwMargin = orderAmountKrw > 0 ? (actualKrwProfit / orderAmountKrw) * 100 : 0;

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {activeSettlementTab === '정산현황' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* 상단 기본정보 카드 (3행 분류 구성) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {/* Line 1: 주문금액(USD) / 적용 수출면장환율 / 주문금액(KRW) */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', background: '#f8fafc', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                          <div style={{ fontSize: '15.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>주문 금액 (USD)</div>
                          <div style={{ fontSize: '16.5px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                            ${orderAmountUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD
                          </div>
                        </div>
                        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', background: '#f8fafc', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                          <div style={{ fontSize: '15.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>적용 수출면장환율</div>
                          <div style={{ fontSize: '16.5px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                            ₩{customsRate.toLocaleString()} KRW
                          </div>
                          <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {basicForm.customsExchangeRate ? '수출면장 환율 적용됨' : 'PI 환율 또는 기본 환율 적용됨'}
                          </div>
                        </div>
                        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', background: '#f8fafc', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                          <div style={{ fontSize: '15.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>주문금액 (KRW)</div>
                          <div style={{ fontSize: '16.5px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                            ₩{Math.round(orderAmountKrw).toLocaleString()} KRW
                          </div>
                        </div>
                      </div>

                      {/* Line 2: 매입금액 / 운송비 / BANK CHARGES : 비용계 */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', background: '#f8fafc', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                          <div style={{ fontSize: '15.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>매입금액</div>
                          <div style={{ fontSize: '16.5px', fontWeight: 800, color: '#991b1b', marginTop: '4px' }}>
                            ₩{consolidatedPurchaseKrw.toLocaleString()} KRW
                          </div>
                          <div style={{ fontSize: '14.5px', color: '#b91c1c', marginTop: '2px' }}>
                            ${(customsRate > 0 ? consolidatedPurchaseKrw / customsRate : 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} USD 상당
                          </div>
                        </div>
                        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', background: '#f8fafc', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                          <div style={{ fontSize: '15.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>운송비</div>
                          <div style={{ fontSize: '16.5px', fontWeight: 800, color: '#991b1b', marginTop: '4px' }}>
                            ₩{forwarderExpenseKrw.toLocaleString()} KRW
                          </div>
                          <div style={{ fontSize: '14.5px', color: '#b91c1c', marginTop: '2px' }}>
                            ${(customsRate > 0 ? forwarderExpenseKrw / customsRate : 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} USD 상당
                          </div>
                        </div>
                        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', background: '#f8fafc', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                          <div style={{ fontSize: '15.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>지급수수료</div>
                          <div style={{ fontSize: '16.5px', fontWeight: 800, color: '#991b1b', marginTop: '4px' }}>
                            ₩{totalBankChargesKrw.toLocaleString()} KRW
                          </div>
                          <div style={{ fontSize: '14.5px', color: '#b91c1c', marginTop: '2px' }}>
                            ${totalBankChargesUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD 상당
                          </div>
                        </div>
                        
                        {/* 비용계 신설 */}
                        <div style={{ border: '1px solid #c084fc', borderRadius: '8px', padding: '12px', background: '#faf5ff', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                          <div style={{ fontSize: '15.5px', color: '#7e22ce', fontWeight: 700 }}>비용계</div>
                          <div style={{ fontSize: '16.5px', fontWeight: 800, color: '#6b21a8', marginTop: '4px' }}>
                            ₩{(consolidatedPurchaseKrw + forwarderExpenseKrw + totalBankChargesKrw).toLocaleString()} KRW
                          </div>
                          <div style={{ fontSize: '14.5px', color: '#7e22ce', marginTop: '2px' }}>
                            ${(totalCostUsd + totalBankChargesUsd).toLocaleString(undefined, { minimumFractionDigits: 2 })} USD 상당
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 하단 실제 이익 분석 카드 */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px', marginTop: '8px' }}>
                      {/* USD 관점 */}
                      <div style={{ border: '1px solid #1e3a8a', borderRadius: '12px', padding: '16px', background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '13.5px', color: '#1e40af', fontWeight: 700 }}>💵 USD 관점 최종 이익</span>
                          <span style={{ fontSize: '15.5px', color: '#3b82f6', background: '#ffffff', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>영업이익률</span>
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
                          공식: 주문금액(USD) - 매입원가(USD 상당) - 운송비(USD 상당) - 지급수수료(USD 상당)
                        </div>
                      </div>

                      {/* KRW 관점 */}
                      <div style={{ border: '1px solid #065f46', borderRadius: '12px', padding: '16px', background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '13.5px', color: '#065f46', fontWeight: 700 }}>🪙 KRW 관점 최종 이익</span>
                          <span style={{ fontSize: '15.5px', color: '#10b981', background: '#ffffff', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>영업이익률</span>
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
                          공식: 주문금액(KRW) - 매입금액 - 운송비 - 지급수수료
                        </div>
                      </div>
                    </div>

                    {/* 수금 내역 관리 (분할 영수 지원) */}
                    </div>
                    )}

                    {activeSettlementTab === '수금관리' && (
                      <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-default)', paddingTop: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#1e3a8a' }}>🪙 대금 수금 관리 (분할 영수)</span>
                        <button
                          type="button"
                          onClick={() => {
                            const current = basicForm.paymentCollectedInstallments || [];
                            setBasicForm(p => ({
                              ...p,
                              paymentCollectedInstallments: [...current, { date: '', amount: 0, fee: 0, total: 0, currency: 'USD' }]
                            }));
                          }}
                          style={{ background: '#2563eb', border: 'none', borderRadius: '4px', padding: '0 12px', fontSize: '13px', fontWeight: 700, color: '#fff', cursor: 'pointer', height: '34px', display: 'inline-flex', alignItems: 'center' }}
                        >
                          ＋ 수금 내역 추가
                        </button>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {(!basicForm.paymentCollectedInstallments || basicForm.paymentCollectedInstallments.length === 0) ? (
                          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', border: '1px dashed var(--border-default)', borderRadius: '6px', backgroundColor: '#f8fafc' }}>
                            등록된 수금 내역이 없습니다. '수금 내역 추가' 버튼을 눌러 등록해주세요.
                          </div>
                        ) : (
                          basicForm.paymentCollectedInstallments.map((inst, index) => {
                            const handleCollectFieldChange = (field: string, val: any) => {
                              const list = [...(basicForm.paymentCollectedInstallments || [])];
                              const updated = { ...list[index], [field]: val };
                              
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
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
                                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>{index + 1}차 수금</span>
                                  
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>대금영수일자</span>
                                    <input
                                      type="date"
                                      value={inst.date || ''}
                                      onChange={e => handleCollectFieldChange('date', e.target.value)}
                                      style={{ padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13.5px', width: '130px', height: '34px', boxSizing: 'border-box' }}
                                    />
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>통화</span>
                                    <select
                                      value={inst.currency || 'USD'}
                                      onChange={e => handleCurrencySelection(e.target.value, inst.currency || 'USD', customCurrencies, val => handleCollectFieldChange('currency', val))}
                                      style={{ padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13.5px', height: '34px', boxSizing: 'border-box' }}
                                    >
                                      {[...DEFAULT_CURRENCIES, ...customCurrencies].map(c => <option key={c} value={c}>{c}</option>)}
                                      <option value="ADD_NEW_CURRENCY" style={{ color: '#2563eb', fontWeight: 'bold' }}>+ 추가등록</option>
                                    </select>
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>입금액</span>
                                    <FormattedNumberInput
                                      value={inst.amount || 0}
                                      onChange={val => handleCollectFieldChange('amount', val)}
                                      style={{ padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13.5px', width: '120px', textAlign: 'right', height: '34px', boxSizing: 'border-box' }}
                                    />
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>은행수수료</span>
                                    <FormattedNumberInput
                                      value={inst.fee || 0}
                                      onChange={val => handleCollectFieldChange('fee', val)}
                                      style={{ padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13.5px', width: '100px', textAlign: 'right', height: '34px', boxSizing: 'border-box' }}
                                    />
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>총액 (입금액 + 수수료)</span>
                                    <FormattedNumberInput
                                      value={inst.total || 0}
                                      onChange={val => handleCollectFieldChange('total', val)}
                                      style={{ padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13.5px', width: '120px', textAlign: 'right', fontWeight: 'bold', backgroundColor: '#f1f5f9', height: '34px', boxSizing: 'border-box' }}
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
                                    style={{ background: '#ef4444', border: 'none', borderRadius: '4px', padding: '0 12px', fontSize: '13px', color: '#fff', cursor: 'pointer', height: '34px', display: 'inline-flex', alignItems: 'center' }}
                                  >
                                    삭제
                                  </button>
                                </div>

                                {/* 외국환거래영수증 파일 첨부 영역 (Ctrl+V paste 지원) */}
                                <div 
                                  style={{ 
                                    borderTop: '1px dashed var(--border-default)', 
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
                                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>📄 외국환거래영수증 (화면 캡처 첨부)</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <span style={{ fontSize: '12px', color: '#64748b' }}>이 영역 클릭 후 <strong>Ctrl + V</strong> 로 화면 캡처 이미지 붙여넣기</span>
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
                                        style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', color: '#475569', cursor: 'pointer', fontWeight: 600, height: '32px', display: 'inline-flex', alignItems: 'center' }}
                                      >
                                        파일 선택
                                      </label>
                                    </div>
                                  </div>

                                  {inst.receiptFiles && inst.receiptFiles.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                                      {inst.receiptFiles.map((file, fIdx) => (
                                        <div key={fIdx} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f1f5f9', border: '1px solid var(--border-color)', padding: '3px 8px', borderRadius: '4px' }}>
                                          <span 
                                            onClick={() => previewFile(file.url, file.name)} 
                                            style={{ fontSize: '13px', color: '#2563eb', textDecoration: 'underline', cursor: 'pointer', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
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
                                    <span style={{ fontSize: '13px', color: '#2563eb', fontWeight: 600 }}>⏳ 외국환거래영수증 업로드 중...</span>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}

                        {/* 대금 수금 합계 (Total Row) */}
                        {basicForm.paymentCollectedInstallments && basicForm.paymentCollectedInstallments.length > 0 && (() => {
                          const totalDeposit = basicForm.paymentCollectedInstallments.reduce((sum, inst) => sum + (inst.amount || 0), 0);
                          const totalFee = basicForm.paymentCollectedInstallments.reduce((sum, inst) => sum + (inst.fee || 0), 0);
                          const totalConsolidated = basicForm.paymentCollectedInstallments.reduce((sum, inst) => sum + (inst.total || 0), 0);

                          return (
                            <div style={{ border: '2px solid #2563eb', borderRadius: '8px', padding: '12px', background: '#eff6ff', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', marginTop: '10px' }}>
                              <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#2563eb', minWidth: '60px' }}>🧮 합계</span>
                              
                              <div style={{ display: 'flex', gap: '20px', marginLeft: 'auto' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                  <span style={{ fontSize: '13.5px', color: 'var(--text-secondary)' }}>총 입금액 합계</span>
                                  <span style={{ fontSize: '14.5px', fontWeight: 800, color: 'var(--text-primary)' }}>
                                    {totalDeposit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                  <span style={{ fontSize: '13.5px', color: 'var(--text-secondary)' }}>총 은행수수료 합계</span>
                                  <span style={{ fontSize: '14.5px', fontWeight: 800, color: 'var(--text-primary)' }}>
                                    {totalFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                  <span style={{ fontSize: '13.5px', color: 'var(--text-secondary)' }}>총 수금총액 합계</span>
                                  <span style={{ fontSize: '14.5px', fontWeight: 800, color: '#2563eb' }}>
                                    {totalConsolidated.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* 수금 통화별 합계 요약 기록 */}
                      {basicForm.paymentCollectedInstallments && basicForm.paymentCollectedInstallments.length > 0 && (
                        <div style={{ marginTop: '12px', padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#166534' }}>📊 수금 및 발주금액 비교 요약 (실시간)</span>
                            </div>
                            <div style={{ fontSize: '15.5px', color: '#166534', background: '#dcfce7', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
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
                                <div key={curr} style={{ fontSize: '13.5px', color: '#14532d', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
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
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* 5. 변경이력(Log) */}
          {activeStep === '변경이력' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: '#fff', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '16px', boxShadow: '0 4px 10px rgba(0,0,0,0.02)' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '14.5px', fontWeight: 800, color: '#1e3a8a' }}>📋 오더 변경 및 액션 이력 로그</h4>
                <div style={{ fontSize: '13.5px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                  이 오더에 대해 시스템에서 수행된 발행, 수정, 삭제 등의 중요 활동 로그를 기록하고 타임라인으로 조회합니다.
                </div>
                {(order as any).history_logs && (order as any).history_logs.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '520px', overflowY: 'auto', paddingRight: '6px' }}>
                    {(() => {
                      const getUserDisplayName = (userStr?: string) => {
                        if (!userStr) return '시스템 (System)';
                        const val = userStr.trim();
                        const valLower = val.toLowerCase();
                        const userPrefix = valLower.split('@')[0];

                        // 100% Dynamic 1:1 lookup from users DB (team/account management)
                        const matched = usersList.find(u => {
                          const uId = (u.id || '').toLowerCase();
                          const uEmail = (u.email || '').toLowerCase();
                          const uEmailPrefix = uEmail.split('@')[0];
                          const uName = (u.name || '').toLowerCase();

                          return uId === valLower || 
                                 uEmail === valLower || 
                                 uName === valLower ||
                                 (uEmailPrefix && uEmailPrefix === userPrefix) ||
                                 (uId && uId === userPrefix);
                        });

                        if (matched && matched.name) {
                          const posVal = matched.position || matched.role || matched.title || '';
                          const pos = posVal.trim() ? ` ${posVal.trim()}` : '';
                          return `${matched.name}${pos}`;
                        }

                        // Generic email prefix fallback when DB is loading
                        if (val.includes('@')) {
                          return val.split('@')[0];
                        }
                        return val;
                      };

                      const logs = (order as any).history_logs || [];
                      // Filter out redundant consecutive logs within 60 seconds by same user
                      const processedLogs: any[] = [];
                      let lastLogKey = '';
                      let lastLogTime = 0;

                      logs.forEach((log: any) => {
                        const curTime = new Date(log.timestamp || 0).getTime();
                        const key = `${log.user}_${log.description}`;
                        if (key === lastLogKey && Math.abs(curTime - lastLogTime) < 60000) {
                          return; // skip duplicate log within 1 min
                        }
                        processedLogs.push(log);
                        lastLogKey = key;
                        lastLogTime = curTime;
                      });

                      if (processedLogs.length === 0) {
                        return (
                          <div style={{ padding: '20px', textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: '6px', color: 'var(--text-muted)', fontSize: '13.5px', border: '1px solid var(--border-color)' }}>
                            기록된 활동 로그가 없습니다. 변경 사항이 생기면 이력이 자동 기록됩니다.
                          </div>
                        );
                      }

                      return processedLogs.map((log: any, index: number) => {
                        const displayName = getUserDisplayName(log.user);
                        const lines = (log.description || '').split('\n').filter((l: string) => l.trim().length > 0);

                        return (
                          <div key={index} style={{ borderLeft: '3px solid #3b82f6', paddingLeft: '16px', paddingBottom: '16px', marginBottom: '8px', position: 'relative' }}>
                            <div style={{ position: 'absolute', left: '-7px', top: '2px', width: '11px', height: '11px', borderRadius: '50%', background: '#3b82f6', border: '2px solid #fff' }} />
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontWeight: 800, fontSize: '13.5px', color: '#1e293b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px' }}>
                                  {log.actionType === 'create' ? '✨ 신규 생성' : 
                                   log.actionType === 'update' ? '✏️ 데이터 수정' :
                                   log.actionType === 'po_issue' ? '📄 발주서 발행' :
                                   log.actionType === 'po_delete' ? '🗑️ 발주서 취소' : '🔔 상태 변경'}
                                </span>
                                <span style={{ fontSize: '13px', fontWeight: 800, color: '#2563eb' }}>
                                  👤 {displayName}
                                </span>
                              </div>
                              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                                🕒 {new Date(log.timestamp).toLocaleString()}
                              </span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: '#f8fafc', padding: '10px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                              {lines.map((line: string, lIdx: number) => {
                                const isStage = line.includes('진행단계 변경');
                                return (
                                  <div key={lIdx} style={{ fontSize: '12.5px', color: isStage ? '#1e40af' : '#334155', fontWeight: isStage ? 750 : 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span>{isStage ? '📌' : '•'}</span>
                                    <span>{line}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                ) : (
                  <div style={{ padding: '20px', textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: '6px', color: 'var(--text-muted)', fontSize: '13.5px', border: '1px solid var(--border-color)' }}>
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
            if (searchItemIndex === -999) {
              if ((window as any).activePackerWindow) {
                (window as any).activePackerWindow.postMessage({
                  type: 'SELECT_PRODUCT_RESPONSE',
                  product: prod
                }, '*');
              }
            } else if (isSourcingSearch) {
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
              const poNum = `${order.ciNumber || order.id}-${supplierCode}`;

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
            <div style={{ padding: '12px 20px', background: '#f8fafc', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '16.5px', fontWeight: 800, color: '#1e3a8a' }}>🚢 3D 컨테이너 적재 시뮬레이션 연동</span>
              <button 
                onClick={() => setIsPackerModalOpen(false)} 
                style={{ padding: '4px 10px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13.5px', fontWeight: 'bold' }}
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

      {order && (
        <CiPlPreviewModal
          isOpen={isCiPlPreviewOpen}
          onClose={() => setIsCiPlPreviewOpen(false)}
          onExportExcel={() => exportExcelRef.current?.()}
          data={{
            piNumber: basicForm.piNumber,
            invoiceDate: basicForm.poDate || new Date().toISOString().split('T')[0],
            customerName: basicForm.packingList?.applicant || (basicForm.customerAddress ? `${basicForm.customer}\n${basicForm.customerAddress}` : basicForm.customer),
            customerAddress: '',
            issuingCompany: basicForm.issuingCompany,
            lcNo: basicForm.lcNo,
            lcDate: basicForm.lcIssuingDate,
            lcIssuingBank: basicForm.lcIssuingBank,
            notifyParty: basicForm.packingList?.notifyParty || basicForm.lcRemark || 'Same as Applicant', 
            remarks: basicForm.remark,
            portOfLoading: basicForm.portOfLoading,
            portOfDischarge: basicForm.portOfDischarge,
            vesselName: basicForm.vesselBooking,
            etd: basicForm.etd,
            paymentTerms: basicForm.paymentTerms,
            deliveryTerms: basicForm.incoterms,
            shippingMarks: (commonShippingMark.company || 'YSACC') + '\n' + ((commonShippingMark.port || '') + ', ' + (commonShippingMark.country || '')) + '\n' + (commonShippingMark.origin || 'MADE IN KOREA'),
            customShipperText: basicForm.packingList?.shipper || getShipperText(basicForm.issuingCompany),
            items: orderItems.map(it => {
              const matchedProd = products.find(p => p.productCode === it.itemId || p.id === it.itemId);
              let itemNetWeight = matchedProd?.palletWeight || 0;
              let itemGrossWeight = matchedProd?.palletGrossWeight || 0;
              let itemCbm = 0.5;
              let itemPkgCount = it.qty;
              let itemPkgType = matchedProd?.packageType || 'Pallet';

              if (basicForm.packingList?.containers) {
                basicForm.packingList.containers.forEach((c: any) => {
                  (c.items || []).forEach((plIt: any) => {
                    if (plIt.description?.includes(it.name) || plIt.pkgNo?.includes(it.itemId)) {
                      itemNetWeight = Number(plIt.netWeight) || 0;
                      itemGrossWeight = Number(plIt.grossWeight) || 0;
                      itemCbm = Number(plIt.cbm) || 0;
                      itemPkgCount = Number(plIt.pkg) || 0;
                      itemPkgType = plIt.packageType || 'Pallet';
                    }
                  });
                });
              }

              return {
                name: it.name || '',
                qty: it.qty || 0,
                unit: it.unit || 'kg',
                unitPrice: it.unitPrice || 0,
                amount: it.amount || 0,
                hsCode: it.hsCode || matchedProd?.hsCode || '',
                netWeight: itemNetWeight,
                grossWeight: itemGrossWeight,
                cbm: itemCbm,
                packageType: itemPkgType,
                packagesCount: itemPkgCount
              };
            })
          }}
        />
      )}

      {poEmailModalData && (
        <PoEmailSendModal
          supplierName={poEmailModalData.supplierName}
          defaultToEmail={poEmailModalData.defaultToEmail}
          defaultCcEmails={poEmailModalData.defaultCcEmails}
          defaultSubject={poEmailModalData.defaultSubject}
          defaultContent={poEmailModalData.defaultContent}
          pdfUrl={poEmailModalData.pdfUrl}
          onSend={handleExecuteSendPoEmail}
          onClose={() => setPoEmailModalData(null)}
        />
      )}

      {katalkModalMsg && (
        <KatalkMessageModal
          message={katalkModalMsg}
          supplierName={katalkModalSupplier}
          onClose={() => setKatalkModalMsg(null)}
          onCopySuccess={async () => {
            setCopiedKatalkSuppliers(prev => ({ ...prev, [katalkModalSupplier]: true }));
            if (order?.id && katalkModalSupplier) {
              const currentStatus = (order as any)?.po_dispatch_status || {};
              const supplierStatus = currentStatus[katalkModalSupplier] || {};
              const updatedDispatchStatus = {
                ...currentStatus,
                [katalkModalSupplier]: {
                  ...supplierStatus,
                  katalkCopied: true,
                  katalkCopiedAt: new Date().toISOString()
                }
              };

              const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
              await updateDoc(orderRef, {
                po_dispatch_status: updatedDispatchStatus
              }).catch(err => console.error('Failed to update po_dispatch_status katalkCopied', err));

              setOrder(prev => prev ? ({ ...prev, po_dispatch_status: updatedDispatchStatus }) : prev);
            }
          }}
        />
      )}

      {katalkModalMsg && (
        <KatalkMessageModal
          message={katalkModalMsg}
          supplierName={katalkModalSupplier}
          onClose={() => setKatalkModalMsg(null)}
          onCopySuccess={() => setCopiedKatalkSuppliers(prev => ({ ...prev, [katalkModalSupplier]: true }))}
        />
      )}

      {isCustomerSearchOpen && (
        <CustomerSearchModal
          customers={customers}
          onClose={() => setIsCustomerSearchOpen(false)}
          onSelect={async (customer) => {
            const custName = customer.name || '';
            const custCode = customer.customerCode || basicForm.customerCode;
            const custId = customer.id || customer.customerCode || basicForm.customerId;
            const inco = customer.preferredIncoterms ? customer.preferredIncoterms : basicForm.incoterms;
            const pay = customer.paymentTerms || basicForm.paymentTerms;
            const dest = customer.shippingPort || basicForm.destinationPort || basicForm.portOfDischarge;

            setBasicForm(prev => ({
              ...prev,
              customer: custName,
              customerCode: custCode,
              customerId: custId,
              incoterms: inco as any,
              paymentTerms: pay,
              destinationPort: dest,
              portOfDischarge: dest || prev.portOfDischarge
            }));

            if (order?.id) {
              try {
                const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
                await updateDoc(orderRef, {
                  customer: custName,
                  customerCode: custCode,
                  customerId: custId,
                  incoterms: inco,
                  paymentTerms: pay,
                  destinationPort: dest,
                  portOfDischarge: dest
                });
                setOrder(prev => prev ? ({
                  ...prev,
                  customer: custName,
                  customerCode: custCode,
                  customerId: custId,
                  incoterms: inco,
                  paymentTerms: pay,
                  destinationPort: dest,
                  portOfDischarge: dest
                } as any) : prev);
              } catch (err) {
                console.error("Failed to save selected customer to order:", err);
              }
            }
            setIsCustomerSearchOpen(false);
          }}
        />
      )}
    </div>
  );
};

const inputStyle = (isEditing: boolean) => ({
  padding: '8px 10px',
  border: '1px solid var(--border-default)',
  borderRadius: '6px',
  fontSize: '14.5px',
  background: isEditing ? '#fff' : '#f8fafc',
  color: isEditing ? '#0f172a' : '#4b5563',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box' as const
});
