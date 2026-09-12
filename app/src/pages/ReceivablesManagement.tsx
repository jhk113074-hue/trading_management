import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { collection, onSnapshot, doc, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, COMPANY_ID } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import type { Customer } from '../types/customer';
import { CustomerModal } from '../components/CustomerModal';
import { cleanCompanyName } from '../utils/companyUtils';

// 단일 거래 건(청구/채권 레코드) 인터페이스
export interface ReceivableRecord {
  id: string; // doc ID
  sourceType: 'EXPORT' | 'IMPORT' | 'DOMESTIC';
  companyCode: 'YS' | 'YSACC';
  companyName: string;
  date: string; // 거래/발행일자 (YYYY-MM-DD)
  docNumber: string; // CI Number, Invoice No, Trade No
  customerId?: string;
  customerName: string;
  customerCode?: string;
  totalAmount: number; // 청구 총액
  currency: 'USD' | 'KRW';
  paidAmount: number; // 기수금액
  uncollectedAmount: number; // 미수금액
  paymentStatus: 'PAID' | 'PARTIAL' | 'UNPAID';
  paymentTerms?: string; // 결제조건
  dueDate?: string; // 수금 예정일 / 만기일
  overdueDays: number; // 경과/연체 일수 (거래일 기준 또는 만기일 기준)
  agingBucket: '30D' | '60D' | '90D' | 'OVER_90D'; // 연령 분석
  installments?: Array<{
    date: string;
    amount: number;
    fee?: number;
    total?: number;
    currency?: string;
    receiptFiles?: any[];
  }>;
  rawDoc?: any;
}

// 거래처별 채권 집계 통계 인터페이스
export interface CustomerReceivableSummary {
  customerId: string;
  customerCode: string;
  customerName: string;
  customerNameKo?: string;
  countryName: string;
  paymentTerms: string;
  totalOrdersCount: number;
  totalSalesUsd: number;
  totalPaidUsd: number;
  uncollectedUsd: number;
  totalSalesKrw: number;
  totalPaidKrw: number;
  uncollectedKrw: number;
  collectionRate: number; // 0 ~ 100%
  dso: number; // 채권회전일수 (Days Sales Outstanding)
  aging30dUsd: number;
  aging60dUsd: number;
  aging90dUsd: number;
  agingOver90dUsd: number;
  aging30dKrw: number;
  aging60dKrw: number;
  aging90dKrw: number;
  agingOver90dKrw: number;
  oldestUncollectedDate?: string;
  records: ReceivableRecord[];
}

export const ReceivablesManagement: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  // 원시 데이터 상태
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [imports, setImports] = useState<any[]>([]);
  const [domesticTrades, setDomesticTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 탭 상태: 'customer' (거래처별 종합) | 'invoices' (개별 주문/채권 건별)
  const [activeTab, setActiveTab] = useState<'customer' | 'invoices'>('customer');

  // 필터 상태
  const [companyFilter, setCompanyFilter] = useState<'ALL' | 'YS' | 'YSACC'>('ALL');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'EXPORT' | 'IMPORT' | 'DOMESTIC'>('ALL');
  const [currencyFilter, setCurrencyFilter] = useState<'ALL' | 'USD' | 'KRW'>('ALL');
  const [exchangeRate, setExchangeRate] = useState<number>(1400);
  const [periodFilter, setPeriodFilter] = useState<'ALL' | 'THIS_YEAR' | 'DAYS_90' | 'DAYS_365'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNCOLLECTED_ONLY' | 'OVERDUE_ONLY' | 'COMPLETED_ONLY'>('UNCOLLECTED_ONLY');
  const [searchTerm, setSearchTerm] = useState('');

  // 서브 모달 상태
  const [selectedCustSummary, setSelectedCustSummary] = useState<CustomerReceivableSummary | null>(null);
  const [quickCollectionRecord, setQuickCollectionRecord] = useState<ReceivableRecord | null>(null);
  const [newCollectionAmount, setNewCollectionAmount] = useState<number>(0);
  const [newCollectionDate, setNewCollectionDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [newCollectionFee, setNewCollectionFee] = useState<number>(0);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [selectedCustomerIdForModal, setSelectedCustomerIdForModal] = useState<string | null>(null);

  // 실시간 환율 조회 (기본값 1,400원)
  useEffect(() => {
    fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=KRW')
      .then(res => res.json())
      .then(data => {
        if (data?.rates?.KRW) {
          setExchangeRate(Math.round(data.rates.KRW * 10) / 10);
        }
      })
      .catch(err => console.warn('실시간 환율 조회 실패, 기본 1,400원 유지:', err));
  }, []);

  // ── Firestore 데이터 실시간 구독 ──
  useEffect(() => {
    setLoading(true);
    const compDoc = doc(db, 'companies', COMPANY_ID);

    // 1. Customers
    const unsubCust = onSnapshot(collection(compDoc, 'customers'), snap => {
      const list: Customer[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer));
      setCustomers(list);
    }, err => console.error('Receivables customers err:', err));

    // 2. Orders (수출)
    const unsubOrders = onSnapshot(collection(compDoc, 'orders'), snap => {
      const list: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setOrders(list);
    }, err => console.error('Receivables orders err:', err));

    // 3. Imports (수입)
    const unsubImports = onSnapshot(collection(compDoc, 'imports'), snap => {
      const list: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setImports(list);
    }, err => console.error('Receivables imports err:', err));

    // 4. Domestic Trades (국내)
    const unsubDom = onSnapshot(collection(compDoc, 'domesticTrades'), snap => {
      const list: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setDomesticTrades(list);
      setLoading(false);
    }, err => {
      console.error('Receivables domesticTrades err:', err);
      // Fallback: lowercase domestic_trades
      getDocs(collection(compDoc, 'domestic_trades')).then(snap => {
        const list: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setDomesticTrades(list);
      }).catch(e => console.error('domestic_trades fallback err:', e));
      setLoading(false);
    });

    return () => {
      unsubCust();
      unsubOrders();
      unsubImports();
      unsubDom();
    };
  }, []);

  // ── 전체 청구/채권 레코드 정규화 ──
  const allRecords = useMemo<ReceivableRecord[]>(() => {
    const list: ReceivableRecord[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const parseDateStr = (rawDate: any): string => {
      if (!rawDate) return '';
      if (typeof rawDate === 'string') return rawDate.substring(0, 10);
      if (rawDate?.toDate && typeof rawDate.toDate === 'function') {
        return rawDate.toDate().toISOString().substring(0, 10);
      }
      return '';
    };

    // A. 수출 주문(Orders)
    orders.forEach(o => {
      let totAmt = 0;
      if (Array.isArray(o.items) && o.items.length > 0) {
        const itemsUsdSum = o.items
          .filter((it: any) => !it.isSourcingOnly && it.currency !== 'KRW')
          .reduce((sum: number, it: any) => sum + (Number(it.amount) || ((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))), 0);
        const forwardersUsdSum = (o.forwarders || [])
          .reduce((sum: number, fw: any) => sum + (parseFloat(fw.budgetAmountUsd as any) || 0), 0);
        if (itemsUsdSum > 0 || forwardersUsdSum > 0) {
          totAmt = itemsUsdSum + forwardersUsdSum;
        }
      }
      if (totAmt === 0) {
        totAmt = Number(o.totalAmount || o.grandTotal || o.orderAmountUsd || o.contractAmount || 0);
      }

      let paidAmt = 0;
      if (o.paymentStatus === 'PAID' || o.paymentStatus === 'COMPLETED' || o.paymentStatus === '수금완료' || o.status === '완료') {
        paidAmt = totAmt;
      } else {
        let sumCollected = 0;
        if (Array.isArray(o.paymentCollectedInstallments) && o.paymentCollectedInstallments.length > 0) {
          sumCollected = o.paymentCollectedInstallments.reduce((sum: number, inst: any) => {
            return sum + (Number(inst.total) || (Number(inst.amount || 0) + Number(inst.fee || 0)));
          }, 0);
        }
        const rootPaid = Number(o.paidAmount || o.collectedAmount || o.depositAmount || o.totalCollectedAmount || o.totalCollectedUsd || 0);
        paidAmt = Math.max(sumCollected, rootPaid);
      }

      const dateStr = parseDateStr(o.orderDate || o.piDate || o.poDate || o.createdAt);
      const isFull = paidAmt >= totAmt - 0.01 && totAmt > 0;
      const isPartial = !isFull && paidAmt > 0;
      const rawComp = String(o.issuingCompany || o.companyType || o.seller || o.myCompany || '').trim();
      const ciNoStr = String(o.ciNumber || o.piNumber || o.custPo || o.orderNo || o.id);
      const isYS = rawComp === 'YS' || rawComp === '영성ACC' || ciNoStr.startsWith('YS-') || String(o.id).startsWith('YS-');

      const uncollected = Math.max(0, totAmt - paidAmt);

      let overdueDays = 0;
      if (dateStr) {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          overdueDays = Math.max(0, Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
        }
      }

      let agingBucket: '30D' | '60D' | '90D' | 'OVER_90D' = '30D';
      if (overdueDays > 90) agingBucket = 'OVER_90D';
      else if (overdueDays > 60) agingBucket = '90D';
      else if (overdueDays > 30) agingBucket = '60D';

      list.push({
        id: o.id,
        sourceType: 'EXPORT',
        companyCode: isYS ? 'YS' : 'YSACC',
        companyName: isYS ? '영성ACC' : '(주)와이에스에이씨씨',
        date: dateStr || '-',
        docNumber: ciNoStr,
        customerId: o.customerId || o.customerCode || '',
        customerName: o.customer || o.customerName || o.buyer || '미지정 고객',
        customerCode: o.customerCode || o.customerId || '',
        totalAmount: totAmt,
        currency: 'USD',
        paidAmount: paidAmt,
        uncollectedAmount: uncollected,
        paymentStatus: isFull ? 'PAID' : isPartial ? 'PARTIAL' : 'UNPAID',
        paymentTerms: o.paymentTerms || '',
        dueDate: o.requestedDelivery || '',
        overdueDays,
        agingBucket,
        installments: o.paymentCollectedInstallments || [],
        rawDoc: o
      });
    });

    // B. 수입 주문(Imports)
    imports.forEach(imp => {
      const totAmt = Number(imp.totalAmount || imp.invoiceAmount || 0);
      let paidAmt = 0;
      if (imp.paymentStatus === 'COMPLETED' || imp.paymentStatus === 'PAID' || imp.status === '완료' || imp.paymentStatus === '수금완료') {
        paidAmt = totAmt;
      } else {
        let sumCollected = 0;
        if (Array.isArray(imp.paymentInstallments) && imp.paymentInstallments.length > 0) {
          sumCollected = imp.paymentInstallments.reduce((sum: number, inst: any) => sum + (Number(inst.amount) || Number(inst.total) || 0), 0);
        }
        const rootPaid = Number(imp.paidAmount || imp.depositAmount || imp.collectedAmount || 0);
        paidAmt = Math.max(sumCollected, rootPaid);
      }

      const dateStr = parseDateStr(imp.importDate || imp.blDate || imp.createdAt);
      const isFull = paidAmt >= totAmt - 0.01 && totAmt > 0;
      const isPartial = !isFull && paidAmt > 0;
      const rawComp = String(imp.importCompany || imp.companyType || imp.issuingCompany || '').trim();
      const invNoStr = String(imp.invoiceNo || imp.blNo || imp.importNo || imp.id);
      const isYS = rawComp === 'YS' || rawComp === '영성ACC' || invNoStr.startsWith('YS-') || String(imp.id).startsWith('YS-');
      const uncollected = Math.max(0, totAmt - paidAmt);

      let overdueDays = 0;
      if (dateStr) {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          overdueDays = Math.max(0, Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
        }
      }

      let agingBucket: '30D' | '60D' | '90D' | 'OVER_90D' = '30D';
      if (overdueDays > 90) agingBucket = 'OVER_90D';
      else if (overdueDays > 60) agingBucket = '90D';
      else if (overdueDays > 30) agingBucket = '60D';

      list.push({
        id: imp.id,
        sourceType: 'IMPORT',
        companyCode: isYS ? 'YS' : 'YSACC',
        companyName: isYS ? '영성ACC' : '(주)와이에스에이씨씨',
        date: dateStr || '-',
        docNumber: invNoStr,
        customerId: imp.customerId || imp.customerCode || '',
        customerName: imp.finalCustomer || imp.customerName || imp.buyer || '미지정 고객',
        customerCode: imp.customerCode || imp.customerId || '',
        totalAmount: totAmt,
        currency: (imp.currency === 'KRW' ? 'KRW' : 'USD'),
        paidAmount: paidAmt,
        uncollectedAmount: uncollected,
        paymentStatus: isFull ? 'PAID' : isPartial ? 'PARTIAL' : 'UNPAID',
        paymentTerms: imp.paymentTerms || '',
        dueDate: imp.deliveryDate || '',
        overdueDays,
        agingBucket,
        installments: imp.paymentInstallments || [],
        rawDoc: imp
      });
    });

    // C. 국내 주문(Domestic Trades)
    domesticTrades.forEach(dom => {
      const totAmt = Number(dom.salesAmount || dom.totalAmount || dom.totalPrice || 0);
      let paidAmt = 0;
      if (dom.collectionStatus === 'PAID' || dom.depositStatus === '입금완료' || dom.status === 'COMPLETED' || dom.status === '완료') {
        paidAmt = totAmt;
      } else {
        let sumCollected = 0;
        if (Array.isArray(dom.paymentInstallments) && dom.paymentInstallments.length > 0) {
          sumCollected = dom.paymentInstallments.reduce((sum: number, inst: any) => sum + (Number(inst.amount) || Number(inst.total) || 0), 0);
        }
        const rootPaid = Number(dom.collectedAmount || dom.depositAmount || dom.paidAmount || 0);
        paidAmt = Math.max(sumCollected, rootPaid);
      }

      const dateStr = parseDateStr(dom.tradeDate || dom.invoiceDate || dom.createdAt);
      const isFull = paidAmt >= totAmt - 1 && totAmt > 0;
      const isPartial = !isFull && paidAmt > 0;
      const rawComp = String(dom.companyType || dom.issuingCompany || '').trim();
      const trNoStr = String(dom.tradeNo || dom.statementNo || dom.id);
      const isYS = rawComp === 'YS' || rawComp === '영성ACC' || trNoStr.startsWith('YS-') || String(dom.id).startsWith('YS-');
      const uncollected = Math.max(0, totAmt - paidAmt);

      let overdueDays = 0;
      if (dateStr) {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          overdueDays = Math.max(0, Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
        }
      }

      let agingBucket: '30D' | '60D' | '90D' | 'OVER_90D' = '30D';
      if (overdueDays > 90) agingBucket = 'OVER_90D';
      else if (overdueDays > 60) agingBucket = '90D';
      else if (overdueDays > 30) agingBucket = '60D';

      list.push({
        id: dom.id,
        sourceType: 'DOMESTIC',
        companyCode: isYS ? 'YS' : 'YSACC',
        companyName: isYS ? '영성ACC' : '(주)와이에스에이씨씨',
        date: dateStr || '-',
        docNumber: trNoStr,
        customerId: dom.customerId || dom.customerCode || '',
        customerName: dom.customerName || dom.customer || '미지정 고객',
        customerCode: dom.customerCode || dom.customerId || '',
        totalAmount: totAmt,
        currency: 'KRW',
        paidAmount: paidAmt,
        uncollectedAmount: uncollected,
        paymentStatus: isFull ? 'PAID' : isPartial ? 'PARTIAL' : 'UNPAID',
        paymentTerms: dom.paymentTerms || '',
        dueDate: dom.collectionDate || '',
        overdueDays,
        agingBucket,
        installments: dom.paymentInstallments || [],
        rawDoc: dom
      });
    });

    return list;
  }, [orders, imports, domesticTrades]);

  // ── 필터링된 개별 거래 레코드 ──
  const filteredRecords = useMemo<ReceivableRecord[]>(() => {
    const currentYear = new Date().getFullYear().toString();

    return allRecords.filter(r => {
      // 1. 법인 필터
      if (companyFilter !== 'ALL' && r.companyCode !== companyFilter) return false;

      // 2. 사업 부문 필터
      if (sourceFilter !== 'ALL' && r.sourceType !== sourceFilter) return false;

      // 2-1. 통화 구분 필터
      if (currencyFilter !== 'ALL' && r.currency !== currencyFilter) return false;

      // 3. 기간 필터
      if (periodFilter === 'THIS_YEAR') {
        if (!r.date.startsWith(currentYear)) return false;
      } else if (periodFilter === 'DAYS_90') {
        if (r.overdueDays > 90) return false;
      } else if (periodFilter === 'DAYS_365') {
        if (r.overdueDays > 365) return false;
      }

      // 4. 수금/채권 상태 필터
      if (statusFilter === 'UNCOLLECTED_ONLY' && r.paymentStatus === 'PAID') return false;
      if (statusFilter === 'OVERDUE_ONLY' && (r.overdueDays <= 30 || r.paymentStatus === 'PAID')) return false;
      if (statusFilter === 'COMPLETED_ONLY' && r.paymentStatus !== 'PAID') return false;

      // 5. 검색어
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const match =
          r.customerName.toLowerCase().includes(q) ||
          (r.customerCode && r.customerCode.toLowerCase().includes(q)) ||
          r.docNumber.toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [allRecords, companyFilter, sourceFilter, currencyFilter, periodFilter, statusFilter, searchTerm]);

  // ── 고객사별 채권 집계 및 DSO 계산 ──
  const customerSummaries = useMemo<CustomerReceivableSummary[]>(() => {
    const map = new Map<string, CustomerReceivableSummary>();

    // 고객사 마스터 기반 사전 매핑
    const customerMasterMap = new Map<string, Customer>();
    customers.forEach(c => {
      if (c.id) customerMasterMap.set(c.id.toLowerCase(), c);
      if (c.customerCode) customerMasterMap.set(c.customerCode.toLowerCase(), c);
      const cleanName = cleanCompanyName(c.name || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
      if (cleanName) customerMasterMap.set(cleanName, c);
      const cleanKo = cleanCompanyName(c.nameKo || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
      if (cleanKo) customerMasterMap.set(cleanKo, c);
    });

    // filteredRecords를 돌며 집계
    filteredRecords.forEach(rec => {
      // 거래처 매칭 키 결정
      let matchedCust: Customer | undefined;
      const cId = (rec.customerId || '').toLowerCase();
      const cCode = (rec.customerCode || '').toLowerCase();
      const cleanName = cleanCompanyName(rec.customerName || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');

      if (cCode && customerMasterMap.has(cCode)) matchedCust = customerMasterMap.get(cCode);
      else if (cId && customerMasterMap.has(cId)) matchedCust = customerMasterMap.get(cId);
      else if (cleanName && customerMasterMap.has(cleanName)) matchedCust = customerMasterMap.get(cleanName);

      const groupKey = matchedCust?.id || rec.customerId || rec.customerCode || rec.customerName;

      if (!map.has(groupKey)) {
        map.set(groupKey, {
          customerId: matchedCust?.id || rec.customerId || groupKey,
          customerCode: matchedCust?.customerCode || rec.customerCode || '-',
          customerName: matchedCust?.name || rec.customerName,
          customerNameKo: matchedCust?.nameKo,
          countryName: matchedCust?.countryName || '-',
          paymentTerms: matchedCust?.paymentTerms || rec.paymentTerms || '-',
          totalOrdersCount: 0,
          totalSalesUsd: 0,
          totalPaidUsd: 0,
          uncollectedUsd: 0,
          totalSalesKrw: 0,
          totalPaidKrw: 0,
          uncollectedKrw: 0,
          collectionRate: 0,
          dso: 0,
          aging30dUsd: 0,
          aging60dUsd: 0,
          aging90dUsd: 0,
          agingOver90dUsd: 0,
          aging30dKrw: 0,
          aging60dKrw: 0,
          aging90dKrw: 0,
          agingOver90dKrw: 0,
          records: []
        });
      }

      const summary = map.get(groupKey)!;
      summary.totalOrdersCount += 1;
      summary.records.push(rec);

      if (rec.currency === 'KRW') {
        summary.totalSalesKrw += rec.totalAmount;
        summary.totalPaidKrw += rec.paidAmount;
        summary.uncollectedKrw += rec.uncollectedAmount;

        if (rec.uncollectedAmount > 0) {
          if (rec.agingBucket === '30D') summary.aging30dKrw += rec.uncollectedAmount;
          else if (rec.agingBucket === '60D') summary.aging60dKrw += rec.uncollectedAmount;
          else if (rec.agingBucket === '90D') summary.aging90dKrw += rec.uncollectedAmount;
          else summary.agingOver90dKrw += rec.uncollectedAmount;
        }
      } else {
        summary.totalSalesUsd += rec.totalAmount;
        summary.totalPaidUsd += rec.paidAmount;
        summary.uncollectedUsd += rec.uncollectedAmount;

        if (rec.uncollectedAmount > 0) {
          if (rec.agingBucket === '30D') summary.aging30dUsd += rec.uncollectedAmount;
          else if (rec.agingBucket === '60D') summary.aging60dUsd += rec.uncollectedAmount;
          else if (rec.agingBucket === '90D') summary.aging90dUsd += rec.uncollectedAmount;
          else summary.agingOver90dUsd += rec.uncollectedAmount;
        }
      }

      // 가장 오래된 미수 거래일 추적
      if (rec.uncollectedAmount > 0 && rec.date) {
        if (!summary.oldestUncollectedDate || rec.date < summary.oldestUncollectedDate) {
          summary.oldestUncollectedDate = rec.date;
        }
      }
    });

    // DSO 및 수금률 후처리 계산
    const result: CustomerReceivableSummary[] = [];
    map.forEach(item => {
      // 1. 수금률 계산 (USD 및 KRW 합산 가중)
      const totSalesApprox = item.totalSalesUsd + (item.totalSalesKrw / 1400);
      const totPaidApprox = item.totalPaidUsd + (item.totalPaidKrw / 1400);
      const uncollectedApprox = item.uncollectedUsd + (item.uncollectedKrw / 1400);

      item.collectionRate = totSalesApprox > 0 ? Math.min(100, Math.round((totPaidApprox / totSalesApprox) * 1000) / 10) : 100;

      // 2. DSO (채권회전일수) 산출
      // DSO = (미수채권 / 총매출) * 분석기간일수 (최소 90일, 미수채권 있을 시)
      if (totSalesApprox > 0 && uncollectedApprox > 0) {
        // 분석 기간 기준 (기본 90일 또는 365일 기반 비례)
        const periodDays = periodFilter === 'THIS_YEAR' || periodFilter === 'DAYS_365' ? 365 : 90;
        item.dso = Math.round((uncollectedApprox / totSalesApprox) * periodDays);
      } else {
        item.dso = 0;
      }

      result.push(item);
    });

    // 미수채권 많은 순 정렬
    result.sort((a, b) => {
      const uncolA = a.uncollectedUsd + (a.uncollectedKrw / 1400);
      const uncolB = b.uncollectedUsd + (b.uncollectedKrw / 1400);
      return uncolB - uncolA;
    });

    return result;
  }, [filteredRecords, customers, periodFilter]);

  // ── 전체 종합 KPI 집계 ──
  const kpis = useMemo(() => {
    let totSalesUsd = 0;
    let totPaidUsd = 0;
    let totUncollectedUsd = 0;

    let totSalesKrw = 0;
    let totPaidKrw = 0;
    let totUncollectedKrw = 0;

    let totalOver90dCount = 0;
    let totalOver90dUsd = 0;

    customerSummaries.forEach(c => {
      totSalesUsd += c.totalSalesUsd;
      totPaidUsd += c.totalPaidUsd;
      totUncollectedUsd += c.uncollectedUsd;

      totSalesKrw += c.totalSalesKrw;
      totPaidKrw += c.totalPaidKrw;
      totUncollectedKrw += c.uncollectedKrw;

      if (c.agingOver90dUsd > 0 || c.agingOver90dKrw > 0) {
        totalOver90dCount += 1;
        totalOver90dUsd += c.agingOver90dUsd + (c.agingOver90dKrw / 1400);
      }
    });

    // 전체 가중 평균 DSO
    const grandSales = totSalesUsd + (totSalesKrw / exchangeRate);
    const grandUncollected = totUncollectedUsd + (totUncollectedKrw / exchangeRate);
    const avgDso = grandSales > 0 ? Math.round((grandUncollected / grandSales) * 90) : 0;

    const totSalesCombinedKrw = totSalesKrw + Math.round(totSalesUsd * exchangeRate);
    const totSalesCombinedUsd = totSalesUsd + (exchangeRate > 0 ? parseFloat((totSalesKrw / exchangeRate).toFixed(2)) : 0);

    const totPaidCombinedKrw = totPaidKrw + Math.round(totPaidUsd * exchangeRate);
    const totPaidCombinedUsd = totPaidUsd + (exchangeRate > 0 ? parseFloat((totPaidKrw / exchangeRate).toFixed(2)) : 0);

    const totUncollectedCombinedKrw = totUncollectedKrw + Math.round(totUncollectedUsd * exchangeRate);
    const totUncollectedCombinedUsd = totUncollectedUsd + (exchangeRate > 0 ? parseFloat((totUncollectedKrw / exchangeRate).toFixed(2)) : 0);

    const totalOver90dCombinedKrw = Math.round(totalOver90dUsd * exchangeRate);
    const totalOver90dCombinedUsd = totalOver90dUsd;

    return {
      totSalesUsd,
      totPaidUsd,
      totUncollectedUsd,
      totSalesKrw,
      totPaidKrw,
      totUncollectedKrw,
      totSalesCombinedKrw,
      totSalesCombinedUsd,
      totPaidCombinedKrw,
      totPaidCombinedUsd,
      totUncollectedCombinedKrw,
      totUncollectedCombinedUsd,
      totalOver90dCombinedKrw,
      totalOver90dCombinedUsd,
      avgDso,
      totalOver90dCount,
      totalOver90dUsd
    };
  }, [customerSummaries, exchangeRate]);

  // ── 엑셀 내보내기 ──
  const handleExportExcel = () => {
    if (activeTab === 'customer') {
      const rows = customerSummaries.map((c, i) => ({
        'No': i + 1,
        '고객코드': c.customerCode,
        '거래처명': c.customerName,
        '국가': c.countryName,
        '결제조건': c.paymentTerms,
        '거래건수': c.totalOrdersCount,
        '총매출(USD)': c.totalSalesUsd,
        '기수금(USD)': c.totalPaidUsd,
        '미수채권(USD)': c.uncollectedUsd,
        '총매출(KRW)': c.totalSalesKrw,
        '기수금(KRW)': c.totalPaidKrw,
        '미수채권(KRW)': c.uncollectedKrw,
        '수금률(%)': `${c.collectionRate}%`,
        '채권회전일(DSO)': `${c.dso}일`,
        '30일이내(USD)': c.aging30dUsd,
        '31-60일(USD)': c.aging60dUsd,
        '61-90일(USD)': c.aging90dUsd,
        '90일초과(USD)': c.agingOver90dUsd
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '거래처별채권DSO');
      XLSX.writeFile(wb, `YSACC_고객사별_채권회전일_수금관리_${new Date().toISOString().split('T')[0]}.xlsx`);
    } else {
      const rows = filteredRecords.map((r, i) => ({
        'No': i + 1,
        '부문': r.sourceType === 'EXPORT' ? '수출' : r.sourceType === 'IMPORT' ? '수입' : '국내',
        '법인': r.companyName,
        '거래일자': r.date,
        '관리번호(CI/PO)': r.docNumber,
        '거래처명': r.customerName,
        '청구총액': r.totalAmount,
        '기수금액': r.paidAmount,
        '미수금액': r.uncollectedAmount,
        '통화': r.currency,
        '경과일수': `${r.overdueDays}일`,
        '채권구간': r.agingBucket === '30D' ? '30일이내' : r.agingBucket === '60D' ? '31~60일' : r.agingBucket === '90D' ? '61~90일' : '90일초과',
        '수금상태': r.paymentStatus === 'PAID' ? '완납' : r.paymentStatus === 'PARTIAL' ? '부분수금' : '미수금'
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '건별채권내역');
      XLSX.writeFile(wb, `YSACC_건별_미수채권명세_${new Date().toISOString().split('T')[0]}.xlsx`);
    }
  };

  // ── 수금 즉시 등록 처리 ──
  const handleSaveQuickCollection = async () => {
    if (!quickCollectionRecord) return;
    if (newCollectionAmount <= 0) {
      alert('수금 입금액을 0보다 큰 금액으로 입력해 주세요.');
      return;
    }

    try {
      const targetDoc = quickCollectionRecord.rawDoc;
      const prevInstallments = Array.isArray(targetDoc.paymentCollectedInstallments)
        ? [...targetDoc.paymentCollectedInstallments]
        : (Array.isArray(targetDoc.paymentInstallments) ? [...targetDoc.paymentInstallments] : []);

      const newInstallment = {
        date: newCollectionDate,
        amount: Number(newCollectionAmount),
        fee: Number(newCollectionFee || 0),
        total: Number(newCollectionAmount) + Number(newCollectionFee || 0),
        currency: quickCollectionRecord.currency,
        createdAt: new Date().toISOString()
      };

      const updatedInstallments = [...prevInstallments, newInstallment];
      const newTotalCollected = updatedInstallments.reduce((sum, inst) => sum + (Number(inst.total) || Number(inst.amount) || 0), 0);
      const isFullPaid = newTotalCollected >= quickCollectionRecord.totalAmount - 0.01;

      if (quickCollectionRecord.sourceType === 'EXPORT') {
        await updateDoc(doc(db, 'companies', COMPANY_ID, 'orders', quickCollectionRecord.id), {
          paymentCollectedInstallments: updatedInstallments,
          paymentCollectedAmount: newTotalCollected,
          paidAmount: newTotalCollected,
          paymentStatus: isFullPaid ? 'PAID' : 'PARTIAL',
          updatedAt: serverTimestamp()
        });
      } else if (quickCollectionRecord.sourceType === 'IMPORT') {
        await updateDoc(doc(db, 'companies', COMPANY_ID, 'imports', quickCollectionRecord.id), {
          paymentInstallments: updatedInstallments,
          paidAmount: newTotalCollected,
          paymentStatus: isFullPaid ? 'PAID' : 'PARTIAL',
          updatedAt: serverTimestamp()
        });
      } else {
        await updateDoc(doc(db, 'companies', COMPANY_ID, 'domesticTrades', quickCollectionRecord.id), {
          paymentInstallments: updatedInstallments,
          collectedAmount: newTotalCollected,
          collectionStatus: isFullPaid ? 'PAID' : 'PARTIAL',
          depositStatus: isFullPaid ? '입금완료' : '부분입금',
          updatedAt: serverTimestamp()
        });
      }

      alert('🎉 수금 내역이 성공적으로 등록 및 동기화되었습니다!');
      setQuickCollectionRecord(null);
      setNewCollectionAmount(0);
      setNewCollectionFee(0);
    } catch (e: any) {
      console.error('Failed to save quick collection:', e);
      alert('수금 저장 중 오류가 발생했습니다: ' + e.message);
    }
  };

  return (
    <div style={{ padding: '20px 24px', background: '#f8fafc', minHeight: '100vh', boxSizing: 'border-box' }}>

      {/* ── Header Title & Actions ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>💰</span>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 850, color: '#1e293b' }}>
              영업관리 : 거래처별 채권관리 & 수금관리 (DSO)
            </h2>
            <span style={{ fontSize: '11px', fontWeight: 800, background: '#eff6ff', color: '#2563eb', padding: '3px 8px', borderRadius: '4px', border: '1px solid #bfdbfe' }}>
              실시간 채권회전일 분석
            </span>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#64748b' }}>
            바이어별 미수 채권 현황, 연령(Aging 30/60/90일) 분석, 회전일수(DSO : Days Sales Outstanding) 모니터링 및 실시간 수금 정산
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={handleExportExcel}
            style={{
              height: '34px',
              padding: '0 14px',
              background: '#10b981',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12.5px',
              fontWeight: 750,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            📊 엑셀 다운로드
          </button>
        </div>
      </div>

      {/* ── KPI Cards Bar ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '16px' }}>
        {/* 1. 총 매출액 */}
        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <span style={{ fontSize: '11px', fontWeight: 750, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
            총 거래 매출액 (USD / KRW)
          </span>
          <div style={{ fontSize: '18px', fontWeight: 900, color: '#0f172a', marginTop: '4px' }}>
            ${kpis.totSalesCombinedUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '13px', color: '#059669', fontWeight: 800, marginTop: '2px' }}>
            ₩{kpis.totSalesCombinedKrw.toLocaleString()}
          </div>
        </div>

        {/* 2. 누적 수금 완료액 */}
        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <span style={{ fontSize: '11px', fontWeight: 750, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
            누적 수금 완료액 (USD / KRW)
          </span>
          <div style={{ fontSize: '18px', fontWeight: 900, color: '#15803d', marginTop: '4px' }}>
            ${kpis.totPaidCombinedUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '13px', color: '#16a34a', fontWeight: 800, marginTop: '2px' }}>
            ₩{kpis.totPaidCombinedKrw.toLocaleString()}
          </div>
        </div>

        {/* 3. 총 미수채권 잔액 */}
        <div style={{ background: '#fff', border: '1.5px solid #ef4444', borderRadius: '6px', padding: '14px 16px', boxShadow: '0 2px 4px rgba(239,68,68,0.08)' }}>
          <span style={{ fontSize: '11px', fontWeight: 800, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
            ⚠️ 총 미수 채권 잔액 (USD / KRW)
          </span>
          <div style={{ fontSize: '19px', fontWeight: 900, color: '#b91c1c', marginTop: '4px' }}>
            ${kpis.totUncollectedCombinedUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '13.5px', color: '#dc2626', fontWeight: 850, marginTop: '2px' }}>
            ₩{kpis.totUncollectedCombinedKrw.toLocaleString()}
          </div>
        </div>

        {/* 4. 전사 평균 채권회전일수 (DSO) */}
        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
              평균 채권회전일수 (DSO)
            </span>
            <span style={{
              fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
              background: kpis.avgDso <= 30 ? '#dcfce7' : kpis.avgDso <= 60 ? '#eff6ff' : kpis.avgDso <= 90 ? '#fef3c7' : '#fee2e2',
              color: kpis.avgDso <= 30 ? '#15803d' : kpis.avgDso <= 60 ? '#1d4ed8' : kpis.avgDso <= 90 ? '#b45309' : '#b91c1c'
            }}>
              {kpis.avgDso <= 30 ? '우수' : kpis.avgDso <= 60 ? '적정' : kpis.avgDso <= 90 ? '주의' : '위험'}
            </span>
          </div>
          <div style={{ fontSize: '19px', fontWeight: 900, color: '#2563eb', marginTop: '4px' }}>
            {kpis.avgDso} <span style={{ fontSize: '13px', fontWeight: 700 }}>일</span>
          </div>
          <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '2px' }}>
            물품 공급 후 현금 회수까지 평균 소요일
          </div>
        </div>

        {/* 5. 90일 이상 장기 연체 채권 */}
        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 750, color: '#b91c1c', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
              90일 초과 장기 연체
            </span>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#dc2626' }}>
              {kpis.totalOver90dCount}개사
            </span>
          </div>
          <div style={{ fontSize: '18px', fontWeight: 900, color: '#dc2626', marginTop: '4px' }}>
            ${kpis.totalOver90dCombinedUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '12px', color: '#991b1b', fontWeight: 800, marginTop: '2px' }}>
            ₩{kpis.totalOver90dCombinedKrw.toLocaleString()}
          </div>
        </div>
      </div>

      {/* ── Search & Filter Controls Bar ── */}
      <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '12px 16px', marginBottom: '16px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
        
        {/* Left Filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          
          {/* 통화 구분 필터 (★ 신설) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>통화 구분</label>
            <select
              value={currencyFilter}
              onChange={e => setCurrencyFilter(e.target.value as any)}
              style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 8px', fontSize: '13px', fontWeight: 700, color: '#1e293b', outline: 'none', background: currencyFilter !== 'ALL' ? '#eff6ff' : '#fff' }}
            >
              <option value="ALL">🌐 전체 통화 (USD / KRW)</option>
              <option value="USD">💵 USD (달러 전용)</option>
              <option value="KRW">🪙 KRW (원화 전용)</option>
            </select>
          </div>

          {/* 기준 환율 컨트롤 (★ 신설) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>기준 환율 (USD/KRW)</label>
            <div style={{ display: 'flex', alignItems: 'center', height: '34px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 8px', gap: '4px' }}>
              <span style={{ fontSize: '11px', color: '#64748b' }}>1$ =</span>
              <input
                type="number"
                value={exchangeRate}
                onChange={e => setExchangeRate(Number(e.target.value) || 1400)}
                style={{ width: '56px', height: '24px', border: '1px solid #cbd5e1', borderRadius: '3px', padding: '0 4px', fontSize: '12px', fontWeight: 800, color: '#2563eb', textAlign: 'right' }}
              />
              <span style={{ fontSize: '11px', color: '#64748b' }}>원</span>
            </div>
          </div>

          {/* 법인 구분 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>법인구분</label>
            <select
              value={companyFilter}
              onChange={e => setCompanyFilter(e.target.value as any)}
              style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 8px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none' }}
            >
              <option value="ALL">🏢 전체 법인 (YSACC / YS)</option>
              <option value="YSACC">(주)와이에스에이씨씨</option>
              <option value="YS">영성ACC</option>
            </select>
          </div>

          {/* 사업 부문 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>사업부문</label>
            <select
              value={sourceFilter}
              onChange={e => setSourceFilter(e.target.value as any)}
              style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 8px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none' }}
            >
              <option value="ALL">📦 전체 부문</option>
              <option value="EXPORT">🚢 수출 (Export)</option>
              <option value="IMPORT">🛃 수입 (Import)</option>
              <option value="DOMESTIC">🇰🇷 국내 (Domestic)</option>
            </select>
          </div>

          {/* 기간 필터 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>분석 기간</label>
            <select
              value={periodFilter}
              onChange={e => setPeriodFilter(e.target.value as any)}
              style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 8px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none' }}
            >
              <option value="ALL">전체 누적 기간</option>
              <option value="THIS_YEAR">당해 연도 ({new Date().getFullYear()})</option>
              <option value="DAYS_90">최근 90일 발생분</option>
              <option value="DAYS_365">최근 1년 이내</option>
            </select>
          </div>

          {/* 채권 상태 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>채권 상태</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 8px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none' }}
            >
              <option value="UNCOLLECTED_ONLY">🔴 미수 채권 보유사만</option>
              <option value="OVERDUE_ONLY">⚠️ 30일 초과 연체사만</option>
              <option value="COMPLETED_ONLY">🟢 전액 완납사만</option>
              <option value="ALL">전체 상태 보기</option>
            </select>
          </div>

          {/* 거래처 검색 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>거래처 / 문서번호 검색</label>
            <input
              type="text"
              placeholder="고객명, 약칭, CI/PO번호..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ height: '34px', width: '200px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none' }}
            />
          </div>

        </div>

        {/* Right Mode Tab Selector */}
        <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
          <button
            onClick={() => setActiveTab('customer')}
            style={{
              height: '30px',
              padding: '0 14px',
              background: activeTab === 'customer' ? '#3b82f6' : 'transparent',
              color: activeTab === 'customer' ? '#fff' : '#475569',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12.5px',
              fontWeight: 750,
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
          >
            🏢 거래처별 채권 종합 (DSO)
          </button>
          <button
            onClick={() => setActiveTab('invoices')}
            style={{
              height: '30px',
              padding: '0 14px',
              background: activeTab === 'invoices' ? '#3b82f6' : 'transparent',
              color: activeTab === 'invoices' ? '#fff' : '#475569',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12.5px',
              fontWeight: 750,
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
          >
            📑 개별 주문/채권 건별 명세 ({filteredRecords.length})
          </button>
        </div>

      </div>

      {/* ── Main View Content ── */}
      {loading ? (
        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '60px', textAlign: 'center', color: '#64748b' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏳</div>
          <div style={{ fontSize: '14px', fontWeight: 700 }}>채권 데이터 및 수금 내역을 불러오는 중입니다...</div>
        </div>
      ) : activeTab === 'customer' ? (
        /* ══════════════════════════════════════════════════════════════════════════════
           TAB 1: 거래처별 채권 종합 현황 (Customer AR & DSO Summary)
           ══════════════════════════════════════════════════════════════════════════════ */
        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>
              📊 바이어별 채권회전일(DSO) 및 채권연령(Aging) 분석 (총 {customerSummaries.length}개사)
            </span>
            <span style={{ fontSize: '11.5px', color: '#64748b' }}>
              * 행을 클릭하면 해당 거래처의 상세 거래 및 수금 이력이 표시됩니다.
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #cbd5e1' }}>
                  <th style={{ padding: '10px 8px', textAlign: 'center', width: '45px', color: '#475569', fontWeight: 750 }}>No</th>
                  <th style={{ padding: '10px 10px', textAlign: 'left', minWidth: '170px', color: '#475569', fontWeight: 750 }}>거래처명 (국가)</th>
                  <th style={{ padding: '10px 8px', textAlign: 'left', width: '110px', color: '#475569', fontWeight: 750 }}>결제조건</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', width: '60px', color: '#475569', fontWeight: 750 }}>건수</th>
                  <th style={{ padding: '10px 10px', textAlign: 'right', width: '130px', color: '#475569', fontWeight: 750 }}>총 매출액 (USD/KRW)</th>
                  <th style={{ padding: '10px 10px', textAlign: 'right', width: '130px', color: '#166534', fontWeight: 750 }}>기 수금액 (USD/KRW)</th>
                  <th style={{ padding: '10px 10px', textAlign: 'right', width: '140px', color: '#dc2626', fontWeight: 800, background: '#fef2f2' }}>미수 채권 잔액 (USD/KRW)</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', width: '90px', color: '#475569', fontWeight: 750 }}>수금률</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', width: '100px', color: '#2563eb', fontWeight: 800 }}>채권회전일(DSO)</th>
                  <th style={{ padding: '10px 10px', textAlign: 'center', minWidth: '220px', color: '#475569', fontWeight: 750 }}>채권 연령 분석 (Aging)</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', width: '90px', color: '#475569', fontWeight: 750 }}>관리</th>
                </tr>
              </thead>
              <tbody>
                {customerSummaries.length === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                      조건에 일치하는 거래처 채권 내역이 없습니다.
                    </td>
                  </tr>
                ) : (
                  customerSummaries.map((c, idx) => {
                    const isOverdueAlert = c.dso > 60 || c.agingOver90dUsd > 0;
                    const custTotSalesUsd = c.totalSalesUsd + (exchangeRate > 0 ? c.totalSalesKrw / exchangeRate : 0);
                    const custTotSalesKrw = Math.round(c.totalSalesKrw + (c.totalSalesUsd * exchangeRate));
                    const custPaidUsd = c.totalPaidUsd + (exchangeRate > 0 ? c.totalPaidKrw / exchangeRate : 0);
                    const custPaidKrw = Math.round(c.totalPaidKrw + (c.totalPaidUsd * exchangeRate));
                    const custUncollectedUsd = c.uncollectedUsd + (exchangeRate > 0 ? c.uncollectedKrw / exchangeRate : 0);
                    const custUncollectedKrw = Math.round(c.uncollectedKrw + (c.uncollectedUsd * exchangeRate));

                    return (
                      <tr
                        key={c.customerId || idx}
                        style={{
                          borderBottom: '1px solid #e2e8f0',
                          background: isOverdueAlert ? '#fffbfb' : '#fff',
                          transition: 'background 0.15s',
                          cursor: 'pointer'
                        }}
                        onClick={() => setSelectedCustSummary(c)}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = isOverdueAlert ? '#fee2e2' : '#f1f5f9'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = isOverdueAlert ? '#fffbfb' : '#fff'}
                      >
                        <td style={{ padding: '8px', textAlign: 'center', color: '#64748b' }}>{idx + 1}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ fontWeight: 800, color: '#1e293b' }}>
                            {c.customerName}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', gap: '4px', alignItems: 'center', marginTop: '1px' }}>
                            {c.customerNameKo && <span style={{ color: '#2563eb', fontWeight: 700 }}>[{c.customerNameKo}]</span>}
                            <span>🌍 {c.countryName}</span>
                            {c.customerCode && c.customerCode !== '-' && <span style={{ color: '#94a3b8' }}>({c.customerCode})</span>}
                          </div>
                        </td>
                        <td style={{ padding: '8px', fontSize: '11.5px', color: '#475569', fontWeight: 600 }}>
                          {c.paymentTerms}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center', fontWeight: 700, color: '#334155' }}>
                          {c.totalOrdersCount}건
                        </td>

                        {/* 총 매출액 (USD / KRW) */}
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                            ${custTotSalesUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#059669', marginTop: '1px' }}>
                            ₩{custTotSalesKrw.toLocaleString()}
                          </div>
                        </td>

                        {/* 기 수금액 (USD / KRW) */}
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: '#16a34a' }}>
                            ${custPaidUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#15803d', marginTop: '1px' }}>
                            ₩{custPaidKrw.toLocaleString()}
                          </div>
                        </td>

                        {/* 미수 채권 잔액 (USD / KRW) */}
                        <td style={{ padding: '8px 10px', textAlign: 'right', background: custUncollectedUsd > 0 ? '#fef2f2' : 'transparent' }}>
                          {custUncollectedUsd > 0 ? (
                            <div>
                              <div style={{ fontSize: '13.5px', fontWeight: 900, color: '#dc2626' }}>
                                ${custUncollectedUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                              <div style={{ fontSize: '12px', fontWeight: 850, color: '#b91c1c', marginTop: '1px' }}>
                                ₩{custUncollectedKrw.toLocaleString()}
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: '#15803d', fontSize: '11px', fontWeight: 700 }}>🟢 전액완납</span>
                          )}
                        </td>

                        {/* 수금률 */}
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <div style={{ fontSize: '11.5px', fontWeight: 800, color: c.collectionRate === 100 ? '#15803d' : '#2563eb' }}>
                            {c.collectionRate}%
                          </div>
                          <div style={{ width: '60px', height: '5px', background: '#e2e8f0', borderRadius: '3px', margin: '3px auto 0', overflow: 'hidden' }}>
                            <div style={{ width: `${c.collectionRate}%`, height: '100%', background: c.collectionRate === 100 ? '#22c55e' : '#3b82f6', borderRadius: '3px' }} />
                          </div>
                        </td>

                        {/* DSO 뱃지 */}
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 850,
                            background: c.dso <= 30 ? '#dcfce7' : c.dso <= 60 ? '#eff6ff' : c.dso <= 90 ? '#fef3c7' : '#fee2e2',
                            color: c.dso <= 30 ? '#15803d' : c.dso <= 60 ? '#1d4ed8' : c.dso <= 90 ? '#b45309' : '#b91c1c',
                            border: `1px solid ${c.dso <= 30 ? '#bbf7d0' : c.dso <= 60 ? '#bfdbfe' : c.dso <= 90 ? '#fde68a' : '#fecaca'}`
                          }}>
                            {c.dso}일
                          </span>
                        </td>

                        {/* 채권 연령 분석 (Aging) */}
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ display: 'flex', gap: '4px', fontSize: '10.5px' }}>
                            <div style={{ flex: 1, padding: '2px 4px', background: '#f8fafc', borderRadius: '3px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                              <div style={{ color: '#64748b' }}>30일이내</div>
                              <div style={{ fontWeight: 700, color: c.aging30dUsd > 0 ? '#2563eb' : '#94a3b8' }}>
                                ${Math.round(c.aging30dUsd).toLocaleString()}
                              </div>
                            </div>
                            <div style={{ flex: 1, padding: '2px 4px', background: '#f8fafc', borderRadius: '3px', border: '1px solid #cbd5e1', textAlign: 'center' }}>
                              <div style={{ color: '#64748b' }}>31~60일</div>
                              <div style={{ fontWeight: 700, color: c.aging60dUsd > 0 ? '#0284c7' : '#94a3b8' }}>
                                ${Math.round(c.aging60dUsd).toLocaleString()}
                              </div>
                            </div>
                            <div style={{ flex: 1, padding: '2px 4px', background: '#fffbeb', borderRadius: '3px', border: '1px solid #fde68a', textAlign: 'center' }}>
                              <div style={{ color: '#b45309' }}>61~90일</div>
                              <div style={{ fontWeight: 800, color: c.aging90dUsd > 0 ? '#d97706' : '#94a3b8' }}>
                                ${Math.round(c.aging90dUsd).toLocaleString()}
                              </div>
                            </div>
                            <div style={{ flex: 1, padding: '2px 4px', background: '#fef2f2', borderRadius: '3px', border: '1px solid #fecaca', textAlign: 'center' }}>
                              <div style={{ color: '#b91c1c' }}>90일초과</div>
                              <div style={{ fontWeight: 900, color: c.agingOver90dUsd > 0 ? '#dc2626' : '#94a3b8' }}>
                                ${Math.round(c.agingOver90dUsd).toLocaleString()}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 작업/상세 버튼 */}
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCustSummary(c);
                            }}
                            style={{
                              padding: '4px 8px',
                              background: '#3b82f6',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '11.5px',
                              fontWeight: 750,
                              cursor: 'pointer'
                            }}
                          >
                            상세보기
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ══════════════════════════════════════════════════════════════════════════════
           TAB 2: 개별 주문/채권 건별 명세 (Invoice / Order AR List)
           ══════════════════════════════════════════════════════════════════════════════ */
        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>
              📑 개별 거래 채권 명세 및 실시간 수금 관리 (총 {filteredRecords.length}건)
            </span>
            <span style={{ fontSize: '11.5px', color: '#64748b' }}>
              * [수금등록] 버튼을 눌러 분할 수금 내역을 즉시 입력하고 장부에 반영할 수 있습니다.
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #cbd5e1' }}>
                  <th style={{ padding: '10px 8px', textAlign: 'center', width: '45px', color: '#475569', fontWeight: 750 }}>No</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', width: '70px', color: '#475569', fontWeight: 750 }}>구분</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', width: '90px', color: '#475569', fontWeight: 750 }}>발행법인</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', width: '95px', color: '#475569', fontWeight: 750 }}>거래일자</th>
                  <th style={{ padding: '10px 10px', textAlign: 'left', minWidth: '140px', color: '#475569', fontWeight: 750 }}>관리번호(CI/PO)</th>
                  <th style={{ padding: '10px 10px', textAlign: 'left', minWidth: '160px', color: '#475569', fontWeight: 750 }}>거래처명</th>
                  <th style={{ padding: '10px 10px', textAlign: 'right', width: '130px', color: '#475569', fontWeight: 750 }}>청구 총액 (USD/KRW)</th>
                  <th style={{ padding: '10px 10px', textAlign: 'right', width: '130px', color: '#166534', fontWeight: 750 }}>기 수금액 (USD/KRW)</th>
                  <th style={{ padding: '10px 10px', textAlign: 'right', width: '140px', color: '#dc2626', fontWeight: 800, background: '#fef2f2' }}>미수 잔액 (USD/KRW)</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', width: '85px', color: '#475569', fontWeight: 750 }}>경과일수</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', width: '90px', color: '#475569', fontWeight: 750 }}>수금상태</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', width: '120px', color: '#475569', fontWeight: 750 }}>수금처리</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={12} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                      조건에 일치하는 미수 채권 명세가 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((r, idx) => {
                    const isOverdue = r.uncollectedAmount > 0 && r.overdueDays > 30;
                    const rTotUsd = r.currency === 'USD' ? r.totalAmount : (exchangeRate > 0 ? r.totalAmount / exchangeRate : 0);
                    const rTotKrw = Math.round(r.currency === 'KRW' ? r.totalAmount : r.totalAmount * exchangeRate);

                    const rPaidUsd = r.currency === 'USD' ? r.paidAmount : (exchangeRate > 0 ? r.paidAmount / exchangeRate : 0);
                    const rPaidKrw = Math.round(r.currency === 'KRW' ? r.paidAmount : r.paidAmount * exchangeRate);

                    const rUncollectedUsd = r.currency === 'USD' ? r.uncollectedAmount : (exchangeRate > 0 ? r.uncollectedAmount / exchangeRate : 0);
                    const rUncollectedKrw = Math.round(r.currency === 'KRW' ? r.uncollectedAmount : r.uncollectedAmount * exchangeRate);

                    return (
                      <tr
                        key={r.id || idx}
                        style={{
                          borderBottom: '1px solid #e2e8f0',
                          background: isOverdue ? '#fffbfb' : '#fff',
                          transition: 'background 0.15s'
                        }}
                      >
                        <td style={{ padding: '8px', textAlign: 'center', color: '#64748b' }}>{idx + 1}</td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <span style={{
                            fontSize: '11px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
                            background: r.sourceType === 'EXPORT' ? '#eff6ff' : r.sourceType === 'IMPORT' ? '#f0fdf4' : '#fffbeb',
                            color: r.sourceType === 'EXPORT' ? '#2563eb' : r.sourceType === 'IMPORT' ? '#16a34a' : '#d97706'
                          }}>
                            {r.sourceType === 'EXPORT' ? '🚢 수출' : r.sourceType === 'IMPORT' ? '🛃 수입' : '🇰🇷 국내'}
                          </span>
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <span style={{
                            fontSize: '11px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
                            background: r.companyCode === 'YS' ? '#ecfdf5' : '#eff6ff',
                            color: r.companyCode === 'YS' ? '#059669' : '#2563eb',
                            border: `1px solid ${r.companyCode === 'YS' ? '#a7f3d0' : '#bfdbfe'}`
                          }}>
                            {r.companyName}
                          </span>
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center', fontWeight: 600, color: '#334155' }}>
                          {r.date}
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <span
                            onClick={() => {
                              if (r.sourceType === 'EXPORT') navigate(`/orders/${r.id}`);
                              else if (r.sourceType === 'IMPORT') navigate(`/imports/${r.id}`);
                              else navigate(`/domestic-orders`);
                            }}
                            title="주문 상세 페이지로 이동"
                            style={{ fontWeight: 800, color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' }}
                          >
                            🔗 {r.docNumber}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', fontWeight: 750, color: '#1e293b' }}>
                          {r.customerName}
                        </td>

                        {/* 청구 총액 (USD / KRW) */}
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                          <div style={{ fontWeight: 800, color: '#0f172a' }}>
                            ${rTotUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div style={{ fontSize: '11px', color: '#059669', fontWeight: 700 }}>
                            ₩{rTotKrw.toLocaleString()}
                          </div>
                        </td>

                        {/* 기수금액 (USD / KRW) */}
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#166534' }}>
                          <div>
                            ${rPaidUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div style={{ fontSize: '11px', color: '#15803d', fontWeight: 700 }}>
                            ₩{rPaidKrw.toLocaleString()}
                          </div>
                        </td>

                        {/* 미수 잔액 (USD / KRW) */}
                        <td style={{ padding: '8px 10px', textAlign: 'right', background: r.uncollectedAmount > 0 ? '#fef2f2' : 'transparent' }}>
                          {r.uncollectedAmount > 0 ? (
                            <div>
                              <div style={{ fontWeight: 850, color: '#dc2626' }}>
                                ${rUncollectedUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                              <div style={{ fontSize: '11px', color: '#b91c1c', fontWeight: 800 }}>
                                ₩{rUncollectedKrw.toLocaleString()}
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: '#15803d', fontSize: '11px' }}>🟢 완납</span>
                          )}
                        </td>

                        {/* 경과일수 / 연령 */}
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <span style={{
                            fontSize: '11px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
                            background: r.overdueDays <= 30 ? '#f1f5f9' : r.overdueDays <= 60 ? '#eff6ff' : r.overdueDays <= 90 ? '#fef3c7' : '#fee2e2',
                            color: r.overdueDays <= 30 ? '#475569' : r.overdueDays <= 60 ? '#1d4ed8' : r.overdueDays <= 90 ? '#b45309' : '#b91c1c'
                          }}>
                            {r.overdueDays}일
                          </span>
                        </td>

                        {/* 수금상태 */}
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <span style={{
                            fontSize: '11px', fontWeight: 800, padding: '2px 7px', borderRadius: '4px',
                            background: r.paymentStatus === 'PAID' ? '#dcfce7' : r.paymentStatus === 'PARTIAL' ? '#fef3c7' : '#fee2e2',
                            color: r.paymentStatus === 'PAID' ? '#15803d' : r.paymentStatus === 'PARTIAL' ? '#b45309' : '#b91c1c'
                          }}>
                            {r.paymentStatus === 'PAID' ? '🟢 완납' : r.paymentStatus === 'PARTIAL' ? '🟡 부분수금' : '🔴 미수금'}
                          </span>
                        </td>

                        {/* 수금 처리 버튼 */}
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          {r.paymentStatus !== 'PAID' ? (
                            <button
                              type="button"
                              onClick={() => {
                                setQuickCollectionRecord(r);
                                setNewCollectionAmount(Math.round(r.uncollectedAmount * 100) / 100);
                              }}
                              style={{
                                padding: '4px 10px',
                                background: '#10b981',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '11.5px',
                                fontWeight: 750,
                                cursor: 'pointer'
                              }}
                            >
                              ➕ 수금등록
                            </button>
                          ) : (
                            <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 700 }}>정산완료</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════════
         SUB-MODAL 1: 거래처별 채권 상세 드로어/모달 (Customer AR Detail Drawer)
         ══════════════════════════════════════════════════════════════════════════════ */}
      {selectedCustSummary && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.4)',
          zIndex: 1100,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <div style={{
            width: '94%',
            maxWidth: '1200px',
            maxHeight: '90vh',
            background: '#fff',
            borderRadius: '6px',
            border: '1px solid #cbd5e1',
            boxShadow: '0 20px 40px rgba(15,23,42,0.2)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            {/* Header */}
            <div style={{ padding: '16px 20px', background: '#fafafa', borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '17px', fontWeight: 850, color: '#1e293b' }}>
                  🏢 {selectedCustSummary.customerName} 채권 및 거래 명세
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  국가: {selectedCustSummary.countryName} | 결제조건: {selectedCustSummary.paymentTerms} | 채권회전일(DSO): <strong style={{ color: '#2563eb' }}>{selectedCustSummary.dso}일</strong>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCustomerIdForModal(selectedCustSummary.customerId);
                    setIsCustomerModalOpen(true);
                  }}
                  style={{ height: '32px', padding: '0 12px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: '4px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                >
                  ◎ 고객사 마스터 보기
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCustSummary(null)}
                  style={{ height: '32px', width: '32px', background: 'transparent', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Sub Header KPI summary for this customer */}
            <div style={{ padding: '12px 20px', background: '#f8fafc', borderBottom: '1px solid #cbd5e1', display: 'flex', gap: '20px', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>총 거래건수</span>
                <div style={{ fontSize: '15px', fontWeight: 800 }}>{selectedCustSummary.records.length}건</div>
              </div>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>총 매출액</span>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                  ${selectedCustSummary.totalSalesUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#166534' }}>기 수금액</span>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#15803d' }}>
                  ${selectedCustSummary.totalPaidUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div style={{ padding: '4px 12px', background: '#fee2e2', borderRadius: '4px', border: '1px solid #fecaca' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#991b1b' }}>미수 채권 잔액</span>
                <div style={{ fontSize: '16px', fontWeight: 900, color: '#b91c1c' }}>
                  ${selectedCustSummary.uncollectedUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>수금 진행률</span>
                <div style={{ fontSize: '15px', fontWeight: 850, color: '#2563eb' }}>
                  {selectedCustSummary.collectionRate}%
                </div>
              </div>
            </div>

            {/* List Table */}
            <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                    <th style={{ padding: '8px', textAlign: 'center', width: '40px' }}>No</th>
                    <th style={{ padding: '8px', textAlign: 'center', width: '70px' }}>구분</th>
                    <th style={{ padding: '8px', textAlign: 'center', width: '90px' }}>일자</th>
                    <th style={{ padding: '8px', textAlign: 'left' }}>관리번호(CI/PO)</th>
                    <th style={{ padding: '8px', textAlign: 'right', width: '110px' }}>청구액</th>
                    <th style={{ padding: '8px', textAlign: 'right', width: '110px', color: '#166534' }}>기수금액</th>
                    <th style={{ padding: '8px', textAlign: 'right', width: '110px', color: '#dc2626' }}>미수금</th>
                    <th style={{ padding: '8px', textAlign: 'center', width: '70px' }}>경과일</th>
                    <th style={{ padding: '8px', textAlign: 'center', width: '80px' }}>수금상태</th>
                    <th style={{ padding: '8px', textAlign: 'center', width: '90px' }}>수금관리</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedCustSummary.records.map((r, i) => (
                    <tr key={r.id || i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '8px', textAlign: 'center', color: '#64748b' }}>{i + 1}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <span style={{ fontSize: '10.5px', fontWeight: 750, padding: '2px 5px', borderRadius: '3px', background: r.sourceType === 'EXPORT' ? '#eff6ff' : '#f0fdf4', color: r.sourceType === 'EXPORT' ? '#2563eb' : '#16a34a' }}>
                          {r.sourceType}
                        </span>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>{r.date}</td>
                      <td style={{ padding: '8px', fontWeight: 700, color: '#2563eb' }}>{r.docNumber}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>
                        {r.currency === 'USD' ? `$${r.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `₩${Math.round(r.totalAmount).toLocaleString()}`}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: '#166534' }}>
                        {r.currency === 'USD' ? `$${r.paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `₩${Math.round(r.paidAmount).toLocaleString()}`}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 800, color: '#dc2626' }}>
                        {r.uncollectedAmount > 0
                          ? (r.currency === 'USD' ? `$${r.uncollectedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `₩${Math.round(r.uncollectedAmount).toLocaleString()}`)
                          : '완납'}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center', color: r.overdueDays > 30 ? '#dc2626' : '#475569', fontWeight: 700 }}>
                        {r.overdueDays}일
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <span style={{ fontSize: '10.5px', fontWeight: 800, padding: '2px 6px', borderRadius: '3px', background: r.paymentStatus === 'PAID' ? '#dcfce7' : '#fee2e2', color: r.paymentStatus === 'PAID' ? '#15803d' : '#b91c1c' }}>
                          {r.paymentStatus}
                        </span>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        {r.paymentStatus !== 'PAID' && (
                          <button
                            type="button"
                            onClick={() => {
                              setQuickCollectionRecord(r);
                              setNewCollectionAmount(Math.round(r.uncollectedAmount * 100) / 100);
                            }}
                            style={{ padding: '3px 8px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 750, cursor: 'pointer' }}
                          >
                            수금등록
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 20px', background: '#fafafa', borderTop: '1px solid #cbd5e1', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setSelectedCustSummary(null)}
                style={{ height: '34px', padding: '0 16px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════════
         SUB-MODAL 2: 신속 수금 등록 팝업 (Quick Collection Installment Modal)
         ══════════════════════════════════════════════════════════════════════════════ */}
      {quickCollectionRecord && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.45)',
          zIndex: 1200,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <div style={{
            width: '460px',
            background: '#fff',
            borderRadius: '6px',
            border: '1px solid #cbd5e1',
            boxShadow: '0 20px 40px rgba(15,23,42,0.2)',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '14px 18px', background: '#fafafa', borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#1e293b' }}>
                💳 실시간 수금 등록 ({quickCollectionRecord.docNumber})
              </div>
              <button
                type="button"
                onClick={() => setQuickCollectionRecord(null)}
                style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '12px' }}>
                <div><strong>거래처:</strong> {quickCollectionRecord.customerName}</div>
                <div style={{ marginTop: '2px' }}><strong>청구 총액:</strong> {quickCollectionRecord.currency} {quickCollectionRecord.totalAmount.toLocaleString()}</div>
                <div style={{ marginTop: '2px' }}><strong>기 수금액:</strong> {quickCollectionRecord.currency} {quickCollectionRecord.paidAmount.toLocaleString()}</div>
                <div style={{ marginTop: '2px', color: '#dc2626', fontWeight: 800 }}>
                  <strong>현재 미수 잔액:</strong> {quickCollectionRecord.currency} {quickCollectionRecord.uncollectedAmount.toLocaleString()}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>
                  입금 수금일자 *
                </label>
                <input
                  type="date"
                  value={newCollectionDate}
                  onChange={e => setNewCollectionDate(e.target.value)}
                  style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>
                  실제 입금액 ({quickCollectionRecord.currency}) *
                </label>
                <input
                  type="number"
                  step="any"
                  value={newCollectionAmount}
                  onChange={e => setNewCollectionAmount(Number(e.target.value))}
                  style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '14px', fontWeight: 800, color: '#166534', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>
                  은행 송금/외환 수수료 (차감 분)
                </label>
                <input
                  type="number"
                  step="any"
                  value={newCollectionFee}
                  onChange={e => setNewCollectionFee(Number(e.target.value))}
                  style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600, color: '#475569', outline: 'none' }}
                  placeholder="0"
                />
              </div>

              <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                * 수금 저장 시 주문 및 정산 장부에 분할 수금 내역이 실시간으로 기록되고 미수 채권 잔액이 즉시 차감됩니다.
              </div>
            </div>

            <div style={{ padding: '12px 20px', background: '#fafafa', borderTop: '1px solid #cbd5e1', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setQuickCollectionRecord(null)}
                style={{ height: '34px', padding: '0 14px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12.5px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveQuickCollection}
                style={{ height: '34px', padding: '0 16px', background: '#3b82f6', border: 'none', borderRadius: '4px', fontSize: '12.5px', fontWeight: 750, color: '#fff', cursor: 'pointer' }}
              >
                저장 및 장부 반영
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════════
         SUB-MODAL 3: 고객사 마스터 모달 연동
         ══════════════════════════════════════════════════════════════════════════════ */}
      {isCustomerModalOpen && (
        <CustomerModal
          initialCustomer={customers.find(c => c.id === selectedCustomerIdForModal)}
          onClose={() => {
            setIsCustomerModalOpen(false);
            setSelectedCustomerIdForModal(null);
          }}
        />
      )}

    </div>
  );
};
