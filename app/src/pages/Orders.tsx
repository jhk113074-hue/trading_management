import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db, COMPANY_ID } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import type { Order } from '../types/order';
import type { ProformaInvoice } from '../types/pi';
import { NewOrderModal } from '../components/NewOrderModal';

import { useColumnResize } from '../hooks/useColumnResize';

interface NextAction {
  text: string;
  level: 'RED' | 'ORANGE' | 'WHITE';
  step: '수주정보' | '소싱/발주' | '물류/선적' | '서류관리' | '정산/결제' | '변경이력' | '완료';
}

import { getOverallProgress as utilGetOverallProgress, getStageProgress as utilGetStageProgress, getEffectiveStageCompletion, STAGE_KEYS, type StageKey } from '../utils/orderProgress';

const getOverallProgress = (order: Order) => utilGetOverallProgress(order);
const getStageProgress = (order: Order, stageKey: StageKey) => utilGetStageProgress(order, undefined, stageKey);

const mapStatusToStep = (st: string, order?: Order): '수주정보' | '소싱/발주' | '물류/선적' | '서류관리' | '정산/결제' | '변경이력' | '완료' => {
  if (st === "완료" || st === "정산완료" || (order && getOverallProgress(order).pct === 100)) return "완료";
  if (st === "주문" || st === "PO접수" || st === "수주정보") return "수주정보";
  if (st === "발주" || st === "소싱발주" || st === "소싱/발주") return "소싱/발주";
  if (st === "선적관리" || st === "물류/선적") return "물류/선적";
  if (st === "수출관리" || st === "서류관리") return "서류관리";
  if (st === "이익관리" || st === "정산마감" || st === "정산/결제") return "정산/결제";
  return "수주정보";
};

const getFirstIncompleteStage = (o: Order): '수주정보' | '소싱/발주' | '물류/선적' | '서류관리' | '정산/결제' | '완료' => {
  const { pct: overallPct } = getOverallProgress(o);
  if (overallPct === 100) return "완료";
  const stageLabels: Record<StageKey, '수주정보' | '소싱/발주' | '물류/선적' | '서류관리' | '정산/결제'> = {
    '수주정보': '수주정보',
    '소싱발주': '소싱/발주',
    '물류선적': '물류/선적',
    '서류관리': '서류관리',
    '정산결제': '정산/결제'
  };
  for (const sk of STAGE_KEYS) {
    const { done, total } = getStageProgress(o, sk);
    if (total === 0 || done < total) {
      return stageLabels[sk];
    }
  }
  return "완료";
};

const getNextTodoItem = (order: Order): string => {
  const sc = getEffectiveStageCompletion(order);
  const stageLabels: Record<StageKey, string> = {
    '수주정보': '수주정보',
    '소싱발주': '소싱/발주',
    '물류선적': '물류/선적',
    '서류관리': '서류관리',
    '정산결제': '정산/결제'
  };
  const isLc = (order as any).isLc || (order as any).basicForm?.isLc;
  for (const sk of STAGE_KEYS) {
    let items = { ...(sc[sk] || {}) };
    if (sk === '수주정보' && isLc !== 'Y') {
      delete items['L/C 정보 입력'];
      delete items['L/C 거래 상세 정보 입력'];
    }
    // 키 배열을 돌면서 완료되지 않은 항목을 선별
    const unfinished = Object.entries(items).find(([_, isDone]) => !isDone);
    if (unfinished) {
      return `미완료: [${stageLabels[sk]}] ${unfinished[0]}`;
    }
  }
  return "모든 업무 완료";
};

// 단계 → stageKey 매핑
const stepToStageKey: Record<string, StageKey> = {
  '수주정보': '수주정보',
  '소싱/발주': '소싱발주',
  '물류/선적': '물류선적',
  '서류관리': '서류관리',
  '정산/결제': '정산결제',
};

export const Orders: React.FC = () => {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const currentUser = userProfile?.name || '담당자';
  const [orders, setOrders] = useState<Order[]>([]);
  const [quotations, setQuotations] = useState<ProformaInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const processedPiRef = useRef<string | null>(null);

  // Column resize: [날짜, 주문번호, 수주사, 발주사, 발주액, 매출액, ETD, ETA, 단계, 다음단계, 복사]
  const { thStyle, resizerProps, colWidths } = useColumnResize([110, 160, 100, 240, 120, 140, 100, 100, 300, 240, 60]);

  // 오름차순/내림차순 정렬 상태
  const [sortKey, setSortKey] = useState<'날짜' | '주문번호' | '수주사' | '발주사' | '발주액' | '매출액' | 'ETD' | 'ETA' | '단계' | '다음단계' | '복사' | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null);

  // 뷰 모드: 'list' | 'kanban' | 'todo'
  const [viewMode, setViewMode] = useState<'list' | 'kanban' | 'todo'>('list');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Filters (sessionStorage 연동으로 다른 메뉴 이동 후 복귀 시에도 필터 상태 유지)
  const getSavedFilter = (key: string, defaultVal: string) => {
    try {
      return sessionStorage.getItem(`orders_filter_${key}`) || defaultVal;
    } catch {
      return defaultVal;
    }
  };

  const [issuingCompanyFilter, setIssuingCompanyFilter] = useState(() => getSavedFilter('issuingCompany', 'All'));
  const [managerFilter, setManagerFilter] = useState(() => getSavedFilter('manager', 'All'));
  const [customerFilter, setCustomerFilter] = useState(() => getSavedFilter('customer', 'All'));
  const [stepFilter, setStepFilter] = useState(() => getSavedFilter('step', 'All'));
  const [viewFilter, setViewFilter] = useState(() => getSavedFilter('view', 'All'));
  const [completedFilter, setCollapsedFilter] = useState(() => getSavedFilter('completed', 'Hide')); // 'All' | 'Hide'

  const [dateFilterType, setDateFilterType] = useState<string>(() => getSavedFilter('dateFilterType', 'Last3Months'));
  const [dateFilterTarget, setDateFilterTarget] = useState<'date' | 'etd'>(() => getSavedFilter('dateFilterTarget', 'date') as any);
  const [selectedYear, setSelectedYear] = useState<number>(() => Number(getSavedFilter('selectedYear', String(new Date().getFullYear()))));
  const [selectedMonth, setSelectedMonth] = useState<number>(() => Number(getSavedFilter('selectedMonth', String(new Date().getMonth() + 1))));
  const [selectedQuarter, setSelectedQuarter] = useState<number>(() => Number(getSavedFilter('selectedQuarter', String(Math.floor(new Date().getMonth() / 3) + 1))));
  const [selectedHalf, setSelectedHalf] = useState<number>(() => Number(getSavedFilter('selectedHalf', String(new Date().getMonth() < 6 ? 1 : 2))));
  const [rangeStart, setRangeStart] = useState<string>(() => getSavedFilter('rangeStart', new Date().toISOString().split('T')[0]));
  const [rangeEnd, setRangeEnd] = useState<string>(() => getSavedFilter('rangeEnd', new Date().toISOString().split('T')[0]));
  const [selectedQuotationId, setSelectedQuotationId] = useState<string | undefined>(undefined);
  const [selectedCopyOrder, setSelectedCopyOrder] = useState<Order | undefined>(undefined);
  const [isCopyMode, setIsCopyMode] = useState<boolean>(false);

  const handleCopyOrder = (order: Order) => {
    setSelectedCopyOrder(order);
    setIsCopyMode(true);
    setIsModalOpen(true);
  };

  const handleOpenNewOrder = () => {
    setSelectedCopyOrder(undefined);
    setIsCopyMode(false);
    setIsModalOpen(true);
  };

  useEffect(() => {
    try {
      sessionStorage.setItem('orders_filter_issuingCompany', issuingCompanyFilter);
      sessionStorage.setItem('orders_filter_manager', managerFilter);
      sessionStorage.setItem('orders_filter_customer', customerFilter);
      sessionStorage.setItem('orders_filter_step', stepFilter);
      sessionStorage.setItem('orders_filter_view', viewFilter);
      sessionStorage.setItem('orders_filter_completed', completedFilter);
      sessionStorage.setItem('orders_filter_dateFilterType', dateFilterType);
      sessionStorage.setItem('orders_filter_dateFilterTarget', dateFilterTarget);
      sessionStorage.setItem('orders_filter_selectedYear', String(selectedYear));
      sessionStorage.setItem('orders_filter_selectedMonth', String(selectedMonth));
      sessionStorage.setItem('orders_filter_selectedQuarter', String(selectedQuarter));
      sessionStorage.setItem('orders_filter_selectedHalf', String(selectedHalf));
      sessionStorage.setItem('orders_filter_rangeStart', rangeStart);
      sessionStorage.setItem('orders_filter_rangeEnd', rangeEnd);
    } catch (e) {
      console.error('Failed to save orders filter state', e);
    }
  }, [issuingCompanyFilter, managerFilter, customerFilter, stepFilter, viewFilter, completedFilter, dateFilterType, dateFilterTarget, selectedYear, selectedMonth, selectedQuarter, selectedHalf, rangeStart, rangeEnd]);

  useEffect(() => {
    const ordersRef = collection(doc(db, 'companies', COMPANY_ID), 'orders');
    const unsubscribe = onSnapshot(ordersRef, (snap) => {
      console.log('전체 오더 IDs:', snap.docs.map(d => d.id));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      setOrders(list);
      setLoading(false);
    }, (err) => { console.error(err); setLoading(false); });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const pisRef = collection(doc(db, 'companies', COMPANY_ID), 'proforma_invoices');
    const unsubscribe = onSnapshot(pisRef, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ProformaInvoice));
      setQuotations(list);
    });
    return () => unsubscribe();
  }, []);

  // 🔗 createFromPi 감지 시 백그라운드로 즉각 주문 자동 생성 및 저장
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const piId = params.get('createFromPi');
    if (piId && quotations.length > 0) {
      if (processedPiRef.current === piId) return;
      processedPiRef.current = piId;
      
      const targetPi = quotations.find(q => q.id === piId);
      if (targetPi) {
        setLoading(true);
        // 주문 자동 생성 로직 실행
        const createOrder = async () => {
          try {
            const { collection, doc, setDoc, getDocs, serverTimestamp } = await import('firebase/firestore');
            const orderRef = doc(collection(db, 'companies', COMPANY_ID, 'orders'));
            const compPrefix = targetPi.issuingCompany === 'YS' ? 'YS' : 'YSACC';
            const ciNumber = `CI-${compPrefix}-${targetPi.piNumber || targetPi.id}`;

            // 1. 최신 리비전 및 line_items 로드
            const revSnap = await getDocs(collection(doc(db, 'companies', COMPANY_ID, 'proforma_invoices', piId), 'revisions'));
            let mappedItems: any[] = [];
            
            if (!revSnap.empty) {
              const sortedRevs = revSnap.docs.map((d: any) => ({ id: d.id, ...d.data() } as any))
                .sort((a: any, b: any) => (Number(b.version) || 0) - (Number(a.version) || 0));
              const latestRev = sortedRevs[0];
              const latestRevDoc = revSnap.docs.find((d: any) => d.id === latestRev.id);
              
              if (latestRevDoc) {
                const liSnap = await getDocs(collection(latestRevDoc.ref, 'line_items'));
                const quoteItems = liSnap.docs.map((d: any) => d.data() as any);
                
                if (quoteItems.length > 0) {
                  const prodSnap = await getDocs(collection(doc(db, 'companies', COMPANY_ID), 'products'));
                  const currentProducts = prodSnap.docs.map((d: any) => ({ id: d.id, ...d.data() } as any));
                  
                  mappedItems = quoteItems.map((qi: any, idx: number) => {
                    let rawCode = qi.productCode || '';
                    if (rawCode.startsWith('[') && rawCode.includes(']')) {
                      rawCode = rawCode.substring(1, rawCode.indexOf(']')).trim();
                    }
                    const cleanRaw = rawCode.trim().toUpperCase();
                    const matchedProd = currentProducts.find((p: any) => 
                      (p.productCode || '').trim().toUpperCase() === cleanRaw || 
                      p.id.trim().toUpperCase() === cleanRaw
                    );
                    
                    const contactInfo = [matchedProd?.supplierEmail, matchedProd?.supplierPhone].filter(Boolean).join(' / ');
                    const orderPrice = qi.salePriceUsd || 0;
                    const qty = qi.quantity || 0;
                    const amt = parseFloat((qty * orderPrice).toFixed(2));
                    
                    let purchasePrice = 0;
                    let purchaseCurrency = 'USD';
                    if (qi.purchasePriceKrw && qi.purchasePriceKrw > 0) {
                      purchasePrice = qi.purchasePriceKrw;
                      purchaseCurrency = 'KRW';
                    } else if (qi.purchasePriceUsd && qi.purchasePriceUsd > 0) {
                      purchasePrice = qi.purchasePriceUsd;
                      purchaseCurrency = 'USD';
                    } else if (matchedProd) {
                      purchasePrice = matchedProd.purchasePrice || 0;
                      purchaseCurrency = matchedProd.currency === 'KRW' ? 'KRW' : 'USD';
                    }
                    
                    return {
                      itemId: String(idx + 1),
                      name: qi.productCode ? `[${qi.productCode}] ${qi.description || matchedProd?.nameEn || matchedProd?.nameKo || ''}` : (qi.description || matchedProd?.nameEn || matchedProd?.nameKo || ''),
                      supplier: matchedProd?.supplierName || (qi.supplierName !== 'undefined' ? qi.supplierName : '') || '',
                      supplierContact: contactInfo || '',
                      grade: qi.spec || qi.grade || matchedProd?.spec || '',
                      qty,
                      unit: qi.unit || 'kg',
                      unitPrice: orderPrice,
                      purchaseUnitPrice: purchasePrice,
                      purchaseUnitCurrency: purchaseCurrency,
                      originalPurchasePrice: purchasePrice,
                      originalPurchaseCurrency: purchaseCurrency,
                      amount: amt,
                      currency: 'USD'
                    };
                  });
                }
              }
            }

            // 매핑된 품목이 없을 때 예외 방지 대체값
            if (mappedItems.length === 0) {
              mappedItems = [{
                itemId: '1',
                name: targetPi.itemsSummary?.[0] || 'PI ITEM',
                supplier: '',
                supplierContact: '',
                grade: '',
                qty: 1,
                unit: 'EA',
                unitPrice: targetPi.totalUsd || 0,
                purchaseUnitPrice: targetPi.totalUsd || 0,
                purchaseUnitCurrency: 'USD',
                amount: targetPi.totalUsd || 0,
                currency: 'USD'
              }];
            }

            const orderPayload: any = {
              type: targetPi.type || 'trade',
              id: orderRef.id,
              ciNumber: ciNumber,
              custPo: targetPi.yourRef || '',
              quotationId: piId,
              customer: targetPi.customerName || '',
              manager: currentUser,
              incoterms: targetPi.incoterms || 'FOB',
              paymentTerms: targetPi.paymentTerms || '',
              poDate: new Date().toISOString().split('T')[0],
              requestedDelivery: targetPi.validUntilDate || '',
              remark: targetPi.remarks || '',
              status: '주문',
              items: mappedItems,
              totalAmount: targetPi.totalUsd || 0,
              currency: 'USD',
              exchangeRate: targetPi.exchangeRate || 1400,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              issuingCompany: targetPi.issuingCompany || 'YSACC',
              forwarders: (targetPi.freightCharges || []).map((fc: any) => ({
                name: fc.type || fc.name || 'FOB CHARGES',
                amountUsd: fc.amount || ((fc.qty || 1) * (fc.price || 0)),
                budgetAmountUsd: fc.amount || ((fc.qty || 1) * (fc.price || 0))
              })),
              piNumber: targetPi.piNumber || '',
              customerAddress: targetPi.customerAddress || '',
              contactPerson: targetPi.contactPerson || '',
              portOfLoading: targetPi.departurePort || '',
              portOfDischarge: targetPi.destinationPort || '',
              packagingSpec: targetPi.packagingSpec || '',
              shippingMethod: targetPi.shippingMethod || '',
              deliveryTerm: targetPi.deliveryTerm || '',
              origin: targetPi.origin || '',
              yourRef: targetPi.yourRef || '',
              piDate: targetPi.piDate || '',
              validUntilDate: targetPi.validUntilDate || ''
            };

            // 1. Order 도큐먼트 즉시 생성
            await setDoc(orderRef, orderPayload);

            // 2. PI 도큐먼트 상태 PO확정 처리
            const quoteRef = doc(db, 'companies', COMPANY_ID, 'proforma_invoices', piId);
            await setDoc(quoteRef, { status: 'PO확정', updatedAt: serverTimestamp() }, { merge: true });

            alert(`✅ PI 정보로 주문(${ciNumber})이 즉시 자동 생성되었습니다.`);
          } catch (err: any) {
            console.error('Failed to auto-create order from PI:', err);
            alert('주문 자동 생성 오류: ' + err.message);
          } finally {
            setLoading(false);
            navigate('/orders', { replace: true });
          }
        };

        createOrder();
      }
    }
  }, [window.location.search, quotations, navigate, currentUser]);

  const getNextAction = (order: Order): NextAction => {
    const todoText = getNextTodoItem(order);
    if (todoText === "모든 업무 완료") {
      return { text: "모든 업무 완료", level: 'WHITE', step: '완료' };
    }
    const currentStep = getFirstIncompleteStage(order);
    let level: 'RED' | 'ORANGE' | 'WHITE' = 'WHITE';
    if (todoText.includes('미수금') || todoText.includes('결제 필요') || todoText.includes('긴급') || todoText.includes('D-')) {
      level = 'RED';
    } else if (todoText.includes('미확정') || todoText.includes('미배정') || todoText.includes('미발송') || todoText.includes('미완료')) {
      level = 'ORANGE';
    }
    return { text: todoText, level, step: currentStep };
  };

  const customers = useMemo(() => {
    const list = new Set<string>();
    orders.forEach(o => { if (o.customer) list.add(o.customer); });
    return Array.from(list).sort();
  }, [orders]);

  const managers = useMemo(() => {
    const list = new Set<string>();
    orders.forEach(o => { if (o.manager) list.add(o.manager); });
    return Array.from(list).sort();
  }, [orders]);

  const processedOrders = useMemo(() => {
    let result = orders.map(o => ({ ...o, nextAction: getNextAction(o) }));
    if (issuingCompanyFilter !== 'All') result = result.filter(o => o.issuingCompany === issuingCompanyFilter);
    if (managerFilter !== 'All') result = result.filter(o => o.manager === managerFilter);
    if (customerFilter !== 'All') {
      const cleanFilter = customerFilter.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
      result = result.filter(o => {
        const cVal = (o.customer || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
        const cCode = ((o as any).customerCode || (o as any).customerId || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return cVal.includes(cleanFilter) || cleanFilter.includes(cVal) || (cCode && cleanFilter.includes(cCode));
      });
    }
    if (stepFilter !== 'All') result = result.filter(o => mapStatusToStep(o.status || '') === stepFilter);
    if (viewFilter === 'Urgent') result = result.filter(o => o.nextAction.level === 'RED');
    if (completedFilter === 'Hide') result = result.filter(o => mapStatusToStep(o.status || '', o) !== '완료');

    if (dateFilterType !== 'All') {
      result = result.filter(o => {
        let d: Date | null = null;
        if (dateFilterTarget === 'etd') {
          if (o.etd) {
            d = new Date(o.etd);
          }
        } else {
          const dateStr = o.etd || o.poDate;
          if (dateStr) {
            d = new Date(dateStr);
          } else if (o.createdAt) {
            if (typeof (o.createdAt as any).toDate === 'function') {
              d = (o.createdAt as any).toDate();
            } else {
              d = new Date(o.createdAt as any);
            }
          }
        }
        if (!d || isNaN(d.getTime())) return false;
        const y = d.getFullYear(), m = d.getMonth() + 1;
        const formattedDateStr = d.toISOString().slice(0, 10);

        if (dateFilterType === 'Last3Months') {
          const ninetyDaysAgo = new Date();
          ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
          return d >= ninetyDaysAgo;
        }
        if (dateFilterType === 'Monthly') return y === selectedYear && m === selectedMonth;
        if (dateFilterType === 'Quarterly') return y === selectedYear && Math.floor((m-1)/3)+1 === selectedQuarter;
        if (dateFilterType === 'HalfYearly') return y === selectedYear && (m <= 6 ? 1 : 2) === selectedHalf;
        if (dateFilterType === 'Yearly') return y === selectedYear;
        if (dateFilterType === 'Range') return formattedDateStr >= rangeStart && formattedDateStr <= rangeEnd;
        return true;
      });
    }
    if (sortKey && sortOrder) {
      result.sort((a, b) => {
        let valA: any = '';
        let valB: any = '';

        if (sortKey === '날짜') {
          valA = a.etd || a.poDate || a.createdAt || '';
          valB = b.etd || b.poDate || b.createdAt || '';
        } else if (sortKey === '주문번호') {
          valA = a.ciNumber || a.id || '';
          valB = b.ciNumber || b.id || '';
        } else if (sortKey === '수주사') {
          valA = a.issuingCompany || '';
          valB = b.issuingCompany || '';
        } else if (sortKey === '발주사') {
          valA = a.customer || '';
          valB = b.customer || '';
        } else if (sortKey === '발주액') {
          const piA = quotations.find(q => q.id === a.quotationId);
          const piB = quotations.find(q => q.id === b.quotationId);
          valA = a.totalAmount || piA?.totalUsd || 0;
          valB = b.totalAmount || piB?.totalUsd || 0;
        } else if (sortKey === '매출액') {
          const piA = quotations.find(q => q.id === a.quotationId);
          const piB = quotations.find(q => q.id === b.quotationId);
          const rateA = a.customsExchangeRate || a.exchangeRate || piA?.exchangeRate || 1350;
          const rateB = b.customsExchangeRate || b.exchangeRate || piB?.exchangeRate || 1350;
          valA = (a.totalAmount || piA?.totalUsd || 0) * rateA;
          valB = (b.totalAmount || piB?.totalUsd || 0) * rateB;
        } else if (sortKey === 'ETD') {
          valA = a.etd || '';
          valB = b.etd || '';
        } else if (sortKey === 'ETA') {
          valA = a.eta || '';
          valB = b.eta || '';
        } else if (sortKey === '단계') {
          valA = getOverallProgress(a).pct;
          valB = getOverallProgress(b).pct;
        } else if (sortKey === '다음단계') {
          valA = a.nextAction.text || '';
          valB = b.nextAction.text || '';
        }

        if (typeof valA === 'string' && typeof valB === 'string') {
          return sortOrder === 'asc' 
            ? valA.localeCompare(valB) 
            : valB.localeCompare(valA);
        } else {
          return sortOrder === 'asc' 
            ? (valA > valB ? 1 : -1) 
            : (valA < valB ? 1 : -1);
        }
      });
    } else {
      result.sort((a, b) => {
        const getTimestamp = (o: Order) => {
          if (o.poDate) return new Date(o.poDate).getTime();
          if (o.createdAt) {
            if (typeof (o.createdAt as any).toDate === 'function') return (o.createdAt as any).toDate().getTime();
            return new Date(o.createdAt as any).getTime();
          }
          return 0;
        };
        const timeA = getTimestamp(a);
        const timeB = getTimestamp(b);
        if (timeA !== timeB) return timeB - timeA; // 최신 날짜 우선 내림차순 정렬
        return b.id.localeCompare(a.id);
      });
    }
    return result;
  }, [orders, quotations, issuingCompanyFilter, managerFilter, customerFilter, stepFilter, viewFilter, completedFilter, dateFilterType, dateFilterTarget, selectedYear, selectedMonth, selectedQuarter, selectedHalf, rangeStart, rangeEnd, sortKey, sortOrder]);

  const stats = useMemo(() => {
    const totalUsd = processedOrders.reduce((sum, o) => {
      const pi = quotations.find(q => q.id === o.quotationId);
      return sum + (o.totalAmount || pi?.totalUsd || 0);
    }, 0);
    
    const salesOrders = processedOrders.filter(o => (o.etd || "").trim() !== "");
    const salesTotalKrw = salesOrders.reduce((sum, o) => {
      const pi = quotations.find(q => q.id === o.quotationId);
      const amount = o.totalAmount || pi?.totalUsd || 0;
      const rate = o.customsExchangeRate || o.exchangeRate || pi?.exchangeRate || 1350;
      return sum + (amount * rate);
    }, 0);

    return {
      activeCount: processedOrders.length,
      totalUsd,
      totalYsaccUsd: processedOrders.filter(o => o.issuingCompany === 'YSACC').reduce((sum, o) => {
        const pi = quotations.find(q => q.id === o.quotationId);
        return sum + (o.totalAmount || pi?.totalUsd || 0);
      }, 0),
      totalYsUsd: processedOrders.filter(o => o.issuingCompany === 'YS').reduce((sum, o) => {
        const pi = quotations.find(q => q.id === o.quotationId);
        return sum + (o.totalAmount || pi?.totalUsd || 0);
      }, 0),
      urgentCount: processedOrders.filter(o => o.nextAction.level === 'RED').length,
      salesCount: salesOrders.length,
      salesTotalKrw,
      salesYsaccKrw: salesOrders.filter(o => o.issuingCompany === 'YSACC').reduce((sum, o) => {
        const pi = quotations.find(q => q.id === o.quotationId);
        const amount = o.totalAmount || pi?.totalUsd || 0;
        const rate = o.customsExchangeRate || o.exchangeRate || pi?.exchangeRate || 1350;
        return sum + (amount * rate);
      }, 0),
      salesYsKrw: salesOrders.filter(o => o.issuingCompany === 'YS').reduce((sum, o) => {
        const pi = quotations.find(q => q.id === o.quotationId);
        const amount = o.totalAmount || pi?.totalUsd || 0;
        const rate = o.customsExchangeRate || o.exchangeRate || pi?.exchangeRate || 1350;
        return sum + (amount * rate);
      }, 0),
    };
  }, [processedOrders, quotations]);

  // ── 공통 필터 바 ──────────────────────────────────────────────────────────
  const FilterBar = () => {
    const advancedFilterCount = [
      managerFilter !== 'All',
      stepFilter !== 'All',
      dateFilterTarget !== 'date',
    ].filter(Boolean).length;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '10px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        {/* 상단 기본 필터 노출 라인 */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* 뷰 전환 탭 */}
          <div style={{ display: 'flex', gap: '0', background: '#f1f5f9', borderRadius: '4px', padding: '2px', border: '1px solid #cbd5e1', flexShrink: 0 }}>
            {([
              { mode: 'list',   label: '📋 목록 보기' },
              { mode: 'kanban', label: '🗂 칸반 보기' },
              { mode: 'todo',   label: '✅ 할 일 보기' },
            ] as const).map(({ mode, label }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  padding: '6px 14px', border: 'none', borderRadius: '4px',
                  background: viewMode === mode ? '#fff' : 'transparent',
                  color: viewMode === mode ? '#1e293b' : '#64748b',
                  fontWeight: viewMode === mode ? 700 : 500,
                  fontSize: '12.5px', cursor: 'pointer', transition: 'all 0.15s',
                  boxShadow: viewMode === mode ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                  whiteSpace: 'nowrap'
                }}
              >
                {label}
                {mode === 'todo' && stats.urgentCount > 0 && (
                  <span style={{ marginLeft: '4px', background: '#ef4444', color: '#fff', fontSize: '9px', fontWeight: 800, padding: '1px 4px', borderRadius: '8px' }}>
                    {stats.urgentCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* 구분선 */}
          <div style={{ width: '1px', height: '24px', background: '#cbd5e1', margin: '0 4px', flexShrink: 0 }} />

          {/* 기본 노출 필터: 발주사, 보기, 완료건 */}
          {[
            { label: '발주사', value: customerFilter, set: setCustomerFilter, opts: [['All', '전체 바이어'], ...customers.map(c => [c, c])] },
            { label: '보기', value: viewFilter, set: setViewFilter, opts: [['All', '전체 오더'], ['Urgent', '⚠️ 긴급만']] },
            { label: '완료건', value: completedFilter, set: setCollapsedFilter, opts: [['All', '전체보기'], ['Hide', '완료건 제외']] },
          ].map(({ label, value, set, opts }) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: '3px', flexShrink: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>{label}</label>
              <select value={value} onChange={e => set(e.target.value)} style={{ padding: '4px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13.5px', height: '34px', backgroundColor: '#fff', color: '#1e293b', outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }}>
                {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          ))}

          {/* 구분선 */}
          <div style={{ width: '1px', height: '24px', background: '#cbd5e1', margin: '0 4px', flexShrink: 0 }} />

          {/* 기본 노출 필터: 조회 기간 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flexShrink: 0 }}>
            <label style={{ fontSize: '11px', fontWeight: 750, color: '#2563eb', letterSpacing: '0.02em', textTransform: 'uppercase' }}>조회 기간</label>
            <select value={dateFilterType} onChange={e => setDateFilterType(e.target.value)} style={{ padding: '4px 10px', border: '1px solid #2563eb', borderRadius: '4px', fontSize: '13.5px', height: '34px', backgroundColor: '#fff', color: '#2563eb', fontWeight: 700, outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }}>
              <option value="Last3Months">최근 3개월</option>
              <option value="All">전체 기간</option>
              <option value="Monthly">월별</option>
              <option value="Quarterly">분기별</option>
              <option value="HalfYearly">반기별</option>
              <option value="Yearly">연간</option>
              <option value="Range">직접 입력</option>
            </select>
          </div>
          {['Monthly', 'Quarterly', 'HalfYearly', 'Yearly'].includes(dateFilterType) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flexShrink: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>년도</label>
              <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} style={{ padding: '4px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13.5px', height: '34px', backgroundColor: '#fff', color: '#1e293b', outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}>
                {[2024, 2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}년</option>)}
              </select>
            </div>
          )}
          {dateFilterType === 'Monthly' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flexShrink: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>월</label>
              <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} style={{ padding: '4px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13.5px', height: '34px', backgroundColor: '#fff', color: '#1e293b', outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
              </select>
            </div>
          )}
          {dateFilterType === 'Quarterly' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flexShrink: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>분기</label>
              <select value={selectedQuarter} onChange={e => setSelectedQuarter(Number(e.target.value))} style={{ padding: '4px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13.5px', height: '34px', backgroundColor: '#fff', color: '#1e293b', outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}>
                {[1, 2, 3, 4].map(q => <option key={q} value={q}>{q}분기</option>)}
              </select>
            </div>
          )}
          {dateFilterType === 'HalfYearly' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flexShrink: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>반기</label>
              <select value={selectedHalf} onChange={e => setSelectedHalf(Number(e.target.value))} style={{ padding: '4px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13.5px', height: '34px', backgroundColor: '#fff', color: '#1e293b', outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}>
                <option value={1}>상반기</option><option value={2}>하반기</option>
              </select>
            </div>
          )}
          {dateFilterType === 'Range' && (
            <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', flexShrink: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>시작일</label>
                <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} style={{ padding: '4px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13.5px', height: '34px', backgroundColor: '#fff', color: '#1e293b', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <span style={{ paddingBottom: '8px', color: '#94a3b8', fontWeight: 700, fontSize: '14px' }}>~</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>종료일</label>
                <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} style={{ padding: '4px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13.5px', height: '34px', backgroundColor: '#fff', color: '#1e293b', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
          )}

          {/* 상세 필터 펼침/접기 토글 버튼 */}
          <button
            type="button"
            onClick={() => setShowAdvancedFilters(v => !v)}
            style={{
              alignSelf: 'flex-end',
              height: '34px',
              padding: '0 12px',
              background: showAdvancedFilters ? '#e2e8f0' : '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: '4px',
              fontSize: '12.5px',
              fontWeight: 700,
              color: '#475569',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              marginLeft: 'auto',
              flexShrink: 0
            }}
          >
            ⚙ 상세 필터
            {advancedFilterCount > 0 && (
              <span style={{ background: '#3b82f6', color: '#fff', fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '10px', marginLeft: '2px' }}>
                {advancedFilterCount}
              </span>
            )}
            <span style={{ fontSize: '10px', marginLeft: '2px' }}>{showAdvancedFilters ? '▲' : '▼'}</span>
          </button>
        </div>

        {/* 상세 필터 영역 (접힘/펼침 대상: 담당자, 단계, 조회 기준) */}
        {showAdvancedFilters && (
          <div style={{ display: 'flex', gap: '12px', paddingTop: '8px', borderTop: '1px dashed #cbd5e1', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flexShrink: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>담당자</label>
              <select value={managerFilter} onChange={e => setManagerFilter(e.target.value)} style={{ padding: '4px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13.5px', height: '34px', backgroundColor: '#fff', color: '#1e293b', outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }}>
                {[['All', '전체'], ...managers.map(m => [m, m])].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flexShrink: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>단계</label>
              <select value={stepFilter} onChange={e => setStepFilter(e.target.value)} style={{ padding: '4px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13.5px', height: '34px', backgroundColor: '#fff', color: '#1e293b', outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }}>
                {[['All', '전체'], ['수주정보', '수주정보'], ['소싱/발주', '소싱/발주'], ['물류/선적', '물류/선적'], ['서류관리', '서류관리'], ['정산/결제', '정산/결제']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flexShrink: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>조회 기준</label>
              <select value={dateFilterTarget} onChange={e => setDateFilterTarget(e.target.value as 'date' | 'etd')} style={{ padding: '4px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13.5px', height: '34px', backgroundColor: '#fff', color: '#1e293b', outline: 'none', cursor: 'pointer', boxSizing: 'border-box', fontWeight: 600 }}>
                <option value="date">날짜 기준</option>
                <option value="etd">ETD 기준</option>
              </select>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── 오더 카드 (칸반/목록 공통 사용) ──────────────────────────────────────
  const OrderCard = ({ order, compact = false }: { order: Order & { nextAction: NextAction }; compact?: boolean }) => {
    const pi = quotations.find(q => q.id === order.quotationId);
    const amount = pi?.totalUsd || order.totalAmount || 0;
    const { pct } = getOverallProgress(order);
    const lvlColor = order.nextAction.level === 'RED' ? '#ef4444' : order.nextAction.level === 'ORANGE' ? '#f59e0b' : 'var(--text-secondary)';
    const lvlBg   = order.nextAction.level === 'RED' ? '#fef2f2' : order.nextAction.level === 'ORANGE' ? '#fffbeb' : '#f8fafc';
    const lvlBdr  = order.nextAction.level === 'RED' ? '#fecaca' : order.nextAction.level === 'ORANGE' ? '#fef3c7' : 'var(--border-color)';
    const sc = (order as any).stageCompletion as Record<StageKey, Record<string, boolean>> | undefined;
    const currentStepKey = stepToStageKey[mapStatusToStep(order.status || '')] as StageKey;

    return (
      <div
        onClick={() => navigate(`/orders/${order.id}?step=수주정보`)}
        style={{
          background: '#fff', border: `1px solid ${order.nextAction.level === 'RED' ? '#fecaca' : 'var(--border-color)'}`,
          borderRadius: '10px', padding: compact ? '10px 12px' : '14px 16px',
          cursor: 'pointer', transition: 'all 0.15s',
          boxShadow: order.nextAction.level === 'RED' ? '0 0 0 1px #fecaca' : '0 1px 3px rgba(0,0,0,0.05)',
          display: 'flex', flexDirection: 'column', gap: '8px',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = order.nextAction.level === 'RED' ? '0 0 0 1px #fecaca' : '0 1px 3px rgba(0,0,0,0.05)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; }}
      >
        {/* 카드 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {order.ciNumber || order.id}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyOrder(order);
                }}
                style={{
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  padding: '1px 5px',
                  fontSize: '10px',
                  fontWeight: 600,
                  color: '#475569',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
                title="PO 복사"
              >
                📋 복사
              </button>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {order.customer}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px', flexShrink: 0 }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f766e' }}>
              ${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
            <span style={{ fontSize: '9.5px', fontWeight: 700, padding: '1px 6px', borderRadius: '8px', background: order.issuingCompany === 'YSACC' ? '#dbeafe' : '#fef9c3', color: order.issuingCompany === 'YSACC' ? '#1e40af' : '#ca8a04' }}>
              {order.issuingCompany === 'YSACC' ? 'YSACC' : '영성'}
            </span>
          </div>
        </div>

        {/* 전체 진행바 */}
        {sc && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '9.5px', color: 'var(--text-muted)', fontWeight: 500 }}>전체 진행률</span>
              <span style={{ fontSize: '9.5px', fontWeight: 700, color: pct === 100 ? '#10b981' : '#2563eb' }}>{pct}%</span>
            </div>
            <div style={{ width: '100%', height: '4px', background: 'var(--border-color)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#10b981' : 'linear-gradient(90deg, #3b82f6, #10b981)', borderRadius: '2px', transition: 'width 0.3s' }} />
            </div>
          </div>
        )}

        {/* 단계별 미니 진행바 */}
        {sc && (
          <div style={{ display: 'flex', gap: '2px' }}>
            {STAGE_KEYS.map(sk => {
              const { done, total } = getStageProgress(order, sk);
              const isCurrent = sk === currentStepKey;
              const isDone = total > 0 && done === total;
              const color = isDone ? '#10b981' : isCurrent ? '#2563eb' : done > 0 ? '#93c5fd' : 'var(--border-color)';
              const stageLabels: Record<StageKey, string> = { 수주정보: 'PO', 소싱발주: '소싱', 물류선적: '선적', 서류관리: '서류', 정산결제: '정산' };
              return (
                <div key={sk} title={`${stageLabels[sk]}: ${done}/${total}`} style={{ flex: 1, height: '5px', borderRadius: '3px', background: color, transition: 'background 0.2s' }} />
              );
            })}
          </div>
        )}

        {/* 다음 액션 */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 8px', borderRadius: '16px', background: lvlBg, border: `1px solid ${lvlBdr}`, color: lvlColor, fontSize: '10.5px', fontWeight: 600 }}>
          <span>{order.nextAction.level === 'RED' ? '⚠️' : order.nextAction.level === 'ORANGE' ? '⏰' : '→'}</span>
          <span>{order.nextAction.text}</span>
        </div>

        {/* 날짜 */}
        {order.poDate && (
          <span style={{ fontSize: '9.5px', color: 'var(--border-default)', fontWeight: 500 }}>PO접수 {order.poDate}</span>
        )}
      </div>
    );
  };

  // ── 칸반 뷰 ───────────────────────────────────────────────────────────────
  const KANBAN_COLS: { step: string; key: string; icon: string; color: string; bg: string }[] = [
    { step: '수주정보', key: '수주정보', icon: '📋', color: '#1e40af', bg: '#eff6ff' },
    { step: '소싱/발주', key: '소싱/발주', icon: '🏭', color: '#0f766e', bg: '#f0fdfa' },
    { step: '물류/선적', key: '물류/선적', icon: '🚢', color: '#7c3aed', bg: '#f5f3ff' },
    { step: '서류관리', key: '서류관리', icon: '📄', color: '#b45309', bg: '#fffbeb' },
    { step: '정산/결제', key: '정산/결제', icon: '💰', color: '#065f46', bg: '#f0fdf4' },
    { step: '완료', key: '완료', icon: '✅', color: 'var(--text-secondary)', bg: '#f1f5f9' },
  ];

  const KanbanView = () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px', alignItems: 'flex-start' }}>
      {KANBAN_COLS.map(col => {
        const colOrders = processedOrders.filter(o => getFirstIncompleteStage(o) === col.step);
        const colAmount = colOrders.reduce((sum, o) => {
          const pi = quotations.find(q => q.id === o.quotationId);
          return sum + (pi?.totalUsd || o.totalAmount || 0);
        }, 0);
        return (
          <div key={col.key} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* 컬럼 헤더 */}
            <div style={{ background: col.bg, border: `1px solid ${col.color}22`, borderRadius: '10px', padding: '10px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12.5px', fontWeight: 800, color: col.color }}>{col.icon} {col.step}</span>
                <span style={{ fontSize: '11px', fontWeight: 700, background: col.color, color: '#fff', borderRadius: '10px', padding: '1px 7px' }}>{colOrders.length}</span>
              </div>
              {colAmount > 0 && (
                <div style={{ fontSize: '10.5px', color: col.color, fontWeight: 600, marginTop: '4px', opacity: 0.8 }}>
                  ${colAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
              )}
              {/* 긴급 건수 */}
              {colOrders.filter(o => o.nextAction.level === 'RED').length > 0 && (
                <div style={{ fontSize: '10px', color: '#ef4444', fontWeight: 700, marginTop: '2px' }}>
                  ⚠️ 긴급 {colOrders.filter(o => o.nextAction.level === 'RED').length}건
                </div>
              )}
            </div>
            {/* 카드 목록 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {colOrders.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--border-default)', fontSize: '11.5px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed var(--border-color)' }}>
                  오더 없음
                </div>
              ) : (
                colOrders.map(o => <OrderCard key={o.id} order={o} compact />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  // ── 할 일 뷰 ──────────────────────────────────────────────────────────────
  const TodoView = () => {
    const redOrders    = processedOrders.filter(o => o.nextAction.level === 'RED');
    const orangeOrders = processedOrders.filter(o => o.nextAction.level === 'ORANGE');
    const whiteOrders  = processedOrders.filter(o => o.nextAction.level === 'WHITE');

    const TodoSection = ({ title, icon, orders, color, bg, border }: {
      title: string; icon: string;
      orders: (Order & { nextAction: NextAction })[];
      color: string; bg: string; border: string;
    }) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* 섹션 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', background: bg, border: `1px solid ${border}`, borderRadius: '10px' }}>
          <span style={{ fontSize: '14px' }}>{icon}</span>
          <span style={{ fontSize: '13px', fontWeight: 800, color }}>{title}</span>
          <span style={{ fontSize: '11px', fontWeight: 700, background: color, color: '#fff', borderRadius: '10px', padding: '1px 8px', marginLeft: 'auto' }}>{orders.length}건</span>
        </div>
        {/* 할 일 행 */}
        {orders.length === 0 ? (
          <div style={{ padding: '14px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed var(--border-color)' }}>
            해당 없음
          </div>
        ) : orders.map(o => {
          const pi = quotations.find(q => q.id === o.quotationId);
          const amount = pi?.totalUsd || o.totalAmount || 0;
          const { pct } = getOverallProgress(o);
          const currentStep = mapStatusToStep(o.status || '');
          return (
            <div
              key={o.id}
              onClick={() => navigate(`/orders/${o.id}?step=${currentStep}`)}
              style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr auto auto',
                alignItems: 'center', gap: '16px',
                background: '#fff', border: `1px solid ${border}`,
                borderRadius: '10px', padding: '14px 18px',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; }}
            >
              {/* 오더 정보 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {o.ciNumber || o.id}
                  </span>
                  <span style={{ fontSize: '9.5px', fontWeight: 700, padding: '1px 6px', borderRadius: '8px', background: o.issuingCompany === 'YSACC' ? '#dbeafe' : '#fef9c3', color: o.issuingCompany === 'YSACC' ? '#1e40af' : '#ca8a04' }}>
                    {o.issuingCompany === 'YSACC' ? 'YSACC' : '영성'}
                  </span>
                </div>
                <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {o.customer}
                </span>
              </div>

              {/* 처리 필요 액션 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '16px', background: bg, border: `1px solid ${border}`, color, fontSize: '11.5px', fontWeight: 700, width: 'fit-content' }}>
                  <span>{icon}</span>
                  <span>{o.nextAction.text}</span>
                </div>
                <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', paddingLeft: '2px' }}>
                  현재 단계: <strong style={{ color: 'var(--text-secondary)' }}>{currentStep}</strong>
                  {o.poDate && <span> · PO {o.poDate}</span>}
                </span>
              </div>

              {/* 진행률 */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: '80px' }}>
                <div style={{ width: '80px', height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#10b981' : 'linear-gradient(90deg, #3b82f6, #10b981)', borderRadius: '3px' }} />
                </div>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>{pct}% 완료</span>
              </div>

              {/* 금액 + 이동 버튼 */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f766e', whiteSpace: 'nowrap' }}>
                  ${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
                <span style={{ fontSize: '10.5px', color: '#2563eb', fontWeight: 600 }}>바로가기 →</span>
              </div>
            </div>
          );
        })}
      </div>
    );

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <TodoSection title="🔴 오늘 즉시 처리" icon="⚠️" orders={redOrders}    color="#dc2626" bg="#fef2f2" border="#fecaca" />
        <TodoSection title="🟡 이번 주 처리 필요" icon="⏰" orders={orangeOrders} color="#d97706" bg="#fffbeb" border="#fef3c7" />
        <TodoSection title="✅ 진행 중 (정상)" icon="→"  orders={whiteOrders}  color="var(--text-secondary)" bg="#f8fafc" border="var(--border-color)" />
      </div>
    );
  };

  // ── 목록 뷰 (기존) ────────────────────────────────────────────────────────
  const ListView = () => {
    const handleSort = (key: any) => {
      const actualKey = key === '단계' ? '단계' : key;
      if (sortKey !== actualKey) {
        setSortKey(actualKey);
        setSortOrder('asc');
      } else if (sortOrder === 'asc') {
        setSortOrder('desc');
      } else {
        setSortKey(null);
        setSortOrder(null);
      }
    };

    const renderSortIcon = (h: string) => {
      if (sortKey !== h) return ' ⇅';
      return sortOrder === 'asc' ? ' ▲' : ' ▼';
    };

    return (
      <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>주문 정보를 로딩 중입니다...</div>
        ) : processedOrders.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>등록된 주문 정보가 없습니다.</div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: '13.5px', tableLayout: 'fixed' }}>
                <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                  <tr>
                    {['날짜','주문번호','수주사','발주사','발주액','매출액','ETD','ETA','단계','다음단계','복사'].map((h, hIdx) => (
                      <th 
                        key={h} 
                        onClick={() => h !== '복사' && handleSort(h)}
                        style={thStyle(hIdx, { 
                          padding: h === '단계' ? '8px 16px 10px 16px' : '12px 16px', 
                          fontWeight: 750, 
                          color: sortKey === h ? '#2563eb' : '#475569', 
                          fontSize: '11px', 
                          letterSpacing: '0.02em', 
                          textAlign: 'center', 
                          whiteSpace: 'nowrap',
                          cursor: h === '복사' ? 'default' : 'pointer',
                          userSelect: 'none',
                          background: sortKey === h ? '#eff6ff' : 'transparent',
                          transition: 'background-color 0.2s',
                          textTransform: 'uppercase'
                        })}
                      >
                        {h === '단계' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' }}>
                            <span style={{ fontSize: '11px', fontWeight: 750, color: sortKey === h ? '#2563eb' : '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>단계{renderSortIcon(h)}</span>
                            <div style={{ display: 'flex', gap: '2px', width: '100%', fontSize: '10.5px', color: '#64748b', fontWeight: 600 }}>
                              {['수주정보', '소싱/발주', '물류/선적', '서류관리', '정산/결제'].map(s => (
                                <span key={s} style={{ flex: 1, textAlign: 'center' }}>{s}</span>
                              ))}
                            </div>
                          </div>
                        ) : h === '복사' ? (
                          <span>복사</span>
                        ) : (
                          <span>{h}{renderSortIcon(h)}</span>
                        )}
                        {/* 드래그 핸들러 */}
                        <div {...resizerProps(hIdx)} onClick={(e) => e.stopPropagation()} />
                      </th>
                    ))}
                  </tr>
                </thead>
              <tbody>
                {processedOrders.map(order => {
                  const pi = quotations.find(q => q.id === order.quotationId);
                  const amount = order.totalAmount || pi?.totalUsd || 0;
                  const lvlColor = order.nextAction.level === 'RED' ? '#ef4444' : order.nextAction.level === 'ORANGE' ? '#f59e0b' : '#64748b';
                  const lvlBg = order.nextAction.level === 'RED' ? '#fef2f2' : order.nextAction.level === 'ORANGE' ? '#fffbeb' : '#f8fafc';
                  const lvlBdr = order.nextAction.level === 'RED' ? '#fecaca' : order.nextAction.level === 'ORANGE' ? '#fef3c7' : '#cbd5e1';
                  
                  const isYS = order.issuingCompany === 'YS' || order.issuingCompany === '영성ACC';
                  const issuerBadge = isYS
                    ? <span style={{ fontSize: '11px', fontWeight: 800, background: '#eff6ff', color: '#1d4ed8', padding: '3px 8px', borderRadius: '4px', border: '1px solid #bfdbfe' }}>영성ACC</span>
                    : <span style={{ fontSize: '11px', fontWeight: 800, background: '#ecfdf5', color: '#047857', padding: '3px 8px', borderRadius: '4px', border: '1px solid #a7f3d0' }}>YSACC</span>;

                  const displayStage = getFirstIncompleteStage(order);
                  const isAllFinished = displayStage === '완료';

                  const getTdStyle = (idx: number, extra: React.CSSProperties = {}): React.CSSProperties => ({
                    padding: '9px 16px',
                    width: colWidths[idx],
                    minWidth: colWidths[idx],
                    maxWidth: colWidths[idx],
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    boxSizing: 'border-box',
                    ...extra
                  });

                  return (
                    <tr
                      key={order.id}
                      onClick={() => navigate(`/orders/${order.id}?step=수주정보`)}
                      style={{ borderBottom: '1px solid #cbd5e1', minHeight: '62px', cursor: 'pointer', transition: 'background-color 0.2s' }}
                      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#f8fafc'}
                      onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}
                    >
                      <td style={getTdStyle(0, { color: '#64748b', fontSize: '13px', fontWeight: 500, textAlign: 'center' })}>{order.etd || order.poDate || '-'}</td>
                      <td style={getTdStyle(1, { fontWeight: 700, color: '#2563eb', fontSize: '13px' })}>{order.ciNumber || order.id}</td>
                      <td style={getTdStyle(2, { textAlign: 'center' })}>{issuerBadge}</td>
                      <td style={getTdStyle(3, { color: '#1e293b', fontWeight: 600, fontSize: '13px' })} title={order.customer}>{order.customer}</td>
                      <td style={getTdStyle(4, { fontWeight: 700, color: '#0f766e', textAlign: 'right', fontSize: '14px' })}>
                        ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={getTdStyle(5, { fontWeight: 700, color: '#2563eb', textAlign: 'right', fontSize: '14px' })}>
                        {(() => {
                          const rate = order.customsExchangeRate || order.exchangeRate || pi?.exchangeRate || 1350;
                          return `₩${Math.round(amount * rate).toLocaleString()}`;
                        })()}
                      </td>
                      <td style={getTdStyle(6, { color: '#475569', fontWeight: 600, fontSize: '13px', textAlign: 'center' })}>{order.etd || '-'}</td>
                      <td style={getTdStyle(7, { color: '#475569', fontWeight: 600, fontSize: '13px', textAlign: 'center' })}>{order.eta || '-'}</td>
                      {/* 단계 */}
                      <td style={getTdStyle(8)}>
                        {(() => {
                          const { done: overallDone, total: overallTotal, pct: overallPct } = getOverallProgress(order);
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {/* 상단 뱃지 & 전체 수치 */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  <span style={{ 
                                    background: isAllFinished ? '#ecfdf5' : '#eff6ff', 
                                    color: isAllFinished ? '#10b981' : '#2563eb', 
                                    border: isAllFinished ? '1px solid #a7f3d0' : '1px solid #bfdbfe', 
                                    fontSize: '11px', 
                                    fontWeight: 750, 
                                    padding: '2px 6px', 
                                    borderRadius: '4px', 
                                    whiteSpace: 'nowrap' 
                                  }}>
                                    {displayStage}
                                  </span>
                                  <span style={{ fontSize: '11.5px', color: '#1e293b', fontWeight: 800 }}>
                                    {overallPct}%
                                  </span>
                                </div>
                                <span style={{ fontSize: '10.5px', color: '#2563eb', fontWeight: 700, background: '#eff6ff', padding: '1px 6px', borderRadius: '10px', border: '1px solid #bfdbfe' }}>
                                  전체 {overallDone}/{overallTotal}
                                </span>
                              </div>

                              {/* 5단계 프로그레스 바 */}
                              <div style={{ display: 'flex', gap: '2px', width: '100%' }}>
                                {STAGE_KEYS.map((sk) => {
                                  const { done, total } = getStageProgress(order, sk);
                                  const isDone = total > 0 && done === total;
                                  const isWorking = done > 0 && done < total;
                                  const color = isDone ? '#10b981' : isWorking ? '#2563eb' : 'var(--border-default)';
                                  return (
                                    <div 
                                      key={sk} 
                                      style={{ 
                                        flex: 1, 
                                        height: '5px', 
                                        borderRadius: '3px', 
                                        background: color 
                                      }} 
                                    />
                                  );
                                })}
                              </div>

                              {/* 5단계 개별 진행 카운트 (수주 2/2✓ | 소싱 1/1✓ | 선적 1/3 | 서류 0/2 | 정산 0/4) */}
                              <div style={{ display: 'flex', gap: '2px', width: '100%', fontSize: '10px', fontWeight: 700 }}>
                                {STAGE_KEYS.map((sk) => {
                                  const { done, total } = getStageProgress(order, sk);
                                  const isDone = total > 0 && done === total;
                                  const isWorking = done > 0 && done < total;
                                  const labelMap: Record<string, string> = {
                                    '수주정보': '수주',
                                    '소싱발주': '소싱',
                                    '물류선적': '선적',
                                    '서류관리': '서류',
                                    '정산결제': '정산'
                                  };
                                  const color = isDone ? '#15803d' : isWorking ? '#1d4ed8' : '#94a3b8';
                                  return (
                                    <span 
                                      key={sk} 
                                      title={`${labelMap[sk] || sk}: ${done}/${total} (${isDone ? '완료' : isWorking ? '진행중' : '미진행'})`} 
                                      style={{ 
                                        flex: 1, 
                                        textAlign: 'center', 
                                        color, 
                                        whiteSpace: 'nowrap',
                                        letterSpacing: '-0.02em'
                                      }}
                                    >
                                      {done}/{total}{isDone ? '✓' : ''}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                       {/* 다음단계 */}
                      <td style={getTdStyle(9)}>
                        {(() => {
                           const todoText = getNextTodoItem(order);
                           const isAllDone = todoText === "모든 업무 완료";
                           const bg = isAllDone ? '#ecfdf5' : lvlBg;
                           const borderCol = isAllDone ? '#a7f3d0' : lvlBdr;
                           const textCol = isAllDone ? '#10b981' : lvlColor;
                           const icon = isAllDone ? '✅' : (order.nextAction.level === 'RED' ? '⚠️' : order.nextAction.level === 'ORANGE' ? '⏰' : '⌛');
                           return (
                             <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '16px', background: bg, border: `1px solid ${borderCol}`, color: textCol, fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                               <span>{icon}</span>
                               <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={todoText}>{todoText}</span>
                             </div>
                           );
                        })()}
                      </td>
                      {/* 복사 */}
                      <td style={getTdStyle(10, { textAlign: 'center' })}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyOrder(order);
                          }}
                          style={{
                            background: '#f1f5f9',
                            border: '1px solid #cbd5e1',
                            borderRadius: '4px',
                            width: '28px',
                            height: '28px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '13.5px',
                            cursor: 'pointer',
                            transition: 'all 0.15s'
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.backgroundColor = '#dbeafe';
                            e.currentTarget.style.borderColor = '#93c5fd';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.backgroundColor = '#f1f5f9';
                            e.currentTarget.style.borderColor = '#cbd5e1';
                          }}
                          title="📋 PO 복사 (동일 내용으로 신규 PO 등록)"
                        >
                          📋
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {processedOrders.length > 0 && (
                  <tr style={{ backgroundColor: '#f8fafc', borderTop: '2.5px solid var(--border-default)' }}>
                    <td style={{ width: colWidths[0], minWidth: colWidths[0], maxWidth: colWidths[0], boxSizing: 'border-box' }} />
                    <td style={{ width: colWidths[1], minWidth: colWidths[1], maxWidth: colWidths[1], boxSizing: 'border-box' }} />
                    <td style={{ width: colWidths[2], minWidth: colWidths[2], maxWidth: colWidths[2], boxSizing: 'border-box' }} />
                    {/* 발주사 열에 '합계' 텍스트 배치 */}
                    <td style={{ padding: '14px 16px', color: 'var(--text-primary)', textAlign: 'right', fontSize: '16px', fontWeight: 800, width: colWidths[3], minWidth: colWidths[3], maxWidth: colWidths[3], boxSizing: 'border-box' }}>
                      합계
                    </td>
                    {/* 발주액 열에 실제 합계 금액 배치 */}
                    <td style={{ padding: '14px 16px', color: '#0f172a', fontSize: '16px', fontWeight: 800, textAlign: 'right', whiteSpace: 'nowrap', width: colWidths[4], minWidth: colWidths[4], maxWidth: colWidths[4], boxSizing: 'border-box' }}>
                      ${processedOrders.reduce((sum, o) => {
                        const pi = quotations.find(q => q.id === o.quotationId);
                        return sum + (pi?.totalUsd || o.totalAmount || 0);
                      }, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '14px 16px', color: '#2563eb', fontSize: '16px', fontWeight: 800, textAlign: 'right', whiteSpace: 'nowrap', width: colWidths[5], minWidth: colWidths[5], maxWidth: colWidths[5], boxSizing: 'border-box' }}>
                      ₩{processedOrders.reduce((sum, o) => {
                        const pi = quotations.find(q => q.id === o.quotationId);
                        const amount = o.totalAmount || pi?.totalUsd || 0;
                        const rate = o.customsExchangeRate || o.exchangeRate || pi?.exchangeRate || 1350;
                        return sum + Math.round(amount * rate);
                      }, 0).toLocaleString()}
                    </td>
                    <td style={{ width: colWidths[6], minWidth: colWidths[6], maxWidth: colWidths[6], boxSizing: 'border-box' }} />
                    <td style={{ width: colWidths[7], minWidth: colWidths[7], maxWidth: colWidths[7], boxSizing: 'border-box' }} />
                    <td style={{ width: colWidths[8], minWidth: colWidths[8], maxWidth: colWidths[8], boxSizing: 'border-box' }} />
                    <td style={{ width: colWidths[9], minWidth: colWidths[9], maxWidth: colWidths[9], boxSizing: 'border-box' }} />
                    <td style={{ width: colWidths[10], minWidth: colWidths[10], maxWidth: colWidths[10], boxSizing: 'border-box' }} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '14px', padding: '8px 16px', background: '#f8fafc', borderTop: '1px solid var(--border-color)', fontSize: '11.5px', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>💡 진행바 색상:</span>
            {[['#10b981','완료'],['#2563eb','작업중'],['var(--border-default)','미작업']].map(([c,l]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{ width: '16px', height: '5px', borderRadius: '3px', background: c }} /> {l}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

  const handleExportExcel = () => {
    const data = processedOrders.map(order => {
      const pi = quotations.find(q => q.id === order.quotationId);
      const amountUsd = pi?.totalUsd || order.totalAmount || 0;
      const rate = order.customsExchangeRate || order.exchangeRate || pi?.exchangeRate || 1350;
      const salesKrw = Math.round(amountUsd * rate);

      return {
        '주문일자': order.poDate || '-',
        '주문번호': order.id || '-',
        '수주사': order.issuingCompany === 'YSACC' ? 'YSACC' : '영성ACC',
        '발주사(바이어)': order.customer || '-',
        '수주금액(USD)': amountUsd,
        '매출액(KRW)': salesKrw,
        'ETD': order.etd || '-',
        'ETA': order.eta || '-',
        '현재단계': order.status || '-',
        '담당자': order.manager || '-'
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ExportOrders");
    XLSX.writeFile(wb, "export_orders.xlsx");
  };

  // ── 메인 렌더링 ───────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px 30px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 850, color: '#1e293b', margin: 0 }}>수출 주문관리 대시보드</h1>
          <select 
            value={issuingCompanyFilter} 
            onChange={e => setIssuingCompanyFilter(e.target.value)} 
            style={{ 
              padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '4px', 
              fontSize: '13px', fontWeight: 700, color: '#475569', 
              outline: 'none', background: '#fff', cursor: 'pointer',
              height: '34px', boxSizing: 'border-box'
            }}
          >
            <option value="All">🏢 전체 ISSUER</option>
            <option value="YSACC">YSACC</option>
            <option value="YS">영성ACC</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', height: '34px' }}>
          <button
            onClick={handleExportExcel}
            style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', padding: '0 14px', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '12.5px', transition: 'background 0.2s', display: 'flex', alignItems: 'center', gap: '4px', height: '34px', boxSizing: 'border-box' }}
            onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
            onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}
          >
            📥 목록 받기 (Excel)
          </button>
          <button
            onClick={handleOpenNewOrder}
            style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '0 14px', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '12.5px', transition: 'background 0.2s', display: 'flex', alignItems: 'center', gap: '4px', height: '34px', boxSizing: 'border-box' }}
            onMouseEnter={e => e.currentTarget.style.background = '#2563eb'}
            onMouseLeave={e => e.currentTarget.style.background = '#3b82f6'}
          >
            ➕ 신규 PO 등록
          </button>
        </div>
      </div>

      {/* 스탯 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '10px' }}>
        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>진행 중 오더</span>
          <div style={{ fontSize: '20px', fontWeight: 900, color: '#1e293b' }}>{stats.activeCount} 건</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>진행 수주금액</span>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>(YSACC: ${Math.round(stats.totalYsaccUsd).toLocaleString()} / 영성: ${Math.round(stats.totalYsUsd).toLocaleString()})</span>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 900, color: '#0f766e' }}>${stats.totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>매출액 (ETD 기준)</span>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>(YSACC: ₩{Math.round(stats.salesYsaccKrw).toLocaleString()} / 영성: ₩{Math.round(stats.salesYsKrw).toLocaleString()})</span>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 900, color: '#d97706' }}>₩{Math.round(stats.salesTotalKrw).toLocaleString()}</div>
        </div>
        <div style={{ background: stats.urgentCount > 0 ? '#fef2f2' : '#fff', border: stats.urgentCount > 0 ? '1px solid #fecaca' : '1px solid #cbd5e1', borderRadius: '4px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: stats.urgentCount > 0 ? '#dc2626' : '#475569' }}>오늘 처리 필요 (긴급)</span>
          <div style={{ fontSize: '20px', fontWeight: 900, color: stats.urgentCount > 0 ? '#dc2626' : '#1e293b' }}>{stats.urgentCount} 건</div>
        </div>
      </div>

      {/* 뷰 전환 탭 + 필터 통합 한 줄 */}
      <FilterBar />

      {/* 뷰 컨텐츠 */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)', background: '#fff', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          주문 정보를 로딩 중입니다...
        </div>
      ) : processedOrders.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)', background: '#fff', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          등록된 주문이 없습니다.
        </div>
      ) : viewMode === 'kanban' ? (
        <KanbanView />
      ) : viewMode === 'todo' ? (
        <TodoView />
      ) : (
        <ListView />
      )}

      {/* 신규 PO 모달 */}
      {isModalOpen && (
        <NewOrderModal
          onClose={() => { setIsModalOpen(false); setSelectedQuotationId(undefined); setSelectedCopyOrder(undefined); setIsCopyMode(false); }}
          onSaveSuccess={() => { setIsModalOpen(false); setSelectedQuotationId(undefined); setSelectedCopyOrder(undefined); setIsCopyMode(false); }}
          currentUser={currentUser}
          initialQuotationId={selectedQuotationId}
          initialOrder={selectedCopyOrder}
          isCopy={isCopyMode}
        />
      )}
    </div>
  );
};
