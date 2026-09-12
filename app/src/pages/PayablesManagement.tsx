import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { collection, onSnapshot, doc, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, COMPANY_ID } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import type { Supplier } from '../types/supplier';
import { SupplierModal } from '../components/SupplierModal';
import { cleanCompanyName } from '../utils/companyUtils';

// 단일 매입/채무 레코드 인터페이스
export interface PayableRecord {
  id: string; // doc ID
  recordKey: string; // 고유 키 (예: orderId_supplierName 또는 docId)
  sourceType: 'EXPORT_SUPPLIER' | 'DOMESTIC_SUPPLIER' | 'IMPORT_SUPPLIER' | 'FORWARDER';
  companyCode: 'YS' | 'YSACC';
  companyName: string;
  date: string; // 발주/거래 일자 (YYYY-MM-DD)
  docNumber: string; // CI Number, Order No, Trade No, Bl No
  supplierId?: string;
  supplierName: string;
  supplierCode?: string;
  category?: '공급사' | '포워딩사' | '국내매입처' | '해외공급사';
  totalAmount: number; // 매입(발주) 총액
  currency: 'USD' | 'KRW';
  paidAmount: number; // 기지급(기결재) 완료액
  unpaidAmount: number; // 미지급 채무 잔액
  paymentStatus: 'PAID' | 'PARTIAL' | 'UNPAID';
  paymentTerms?: string; // 결제조건
  dueDate?: string; // 결재/지급 예정일
  overdueDays: number; // 경과 일수
  agingBucket: '30D' | '60D' | '90D' | 'OVER_90D';
  installments?: Array<{
    date: string;
    amount: number;
    currency?: string;
    method?: string;
    notes?: string;
    receiptFiles?: any[];
  }>;
  orderId?: string;
  forwarderIndex?: number;
  rawDoc?: any;
}

// 공급업체별 채무 집계 통계 인터페이스
export interface SupplierPayableSummary {
  supplierId?: string;
  supplierCode: string;
  supplierName: string;
  category: string;
  representative?: string;
  bizNumber?: string;
  managerName?: string;
  managerPhone?: string;
  purchaseEmail?: string;
  bankKrw?: string;
  bankUsd?: string;
  totalOrdersCount: number;
  totalPurchaseUsd: number;
  totalPaidUsd: number;
  unpaidUsd: number;
  totalPurchaseKrw: number;
  totalPaidKrw: number;
  unpaidKrw: number;
  paymentRate: number; // 0 ~ 100%
  dpo: number; // 매입채무회전일수 (Days Payable Outstanding)
  aging30dUsd: number;
  aging60dUsd: number;
  aging90dUsd: number;
  agingOver90dUsd: number;
  aging30dKrw: number;
  aging60dKrw: number;
  aging90dKrw: number;
  agingOver90dKrw: number;
  records: PayableRecord[];
}

export const PayablesManagement: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  // 원시 데이터 상태
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [imports, setImports] = useState<any[]>([]);
  const [domesticTrades, setDomesticTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 탭 상태: 'supplier' (공급업체별 종합) | 'items' (개별 발주/채무 건별)
  const [activeTab, setActiveTab] = useState<'supplier' | 'items'>('supplier');

  // 필터 상태
  const [companyFilter, setCompanyFilter] = useState<'ALL' | 'YS' | 'YSACC'>('ALL');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'EXPORT_SUPPLIER' | 'DOMESTIC_SUPPLIER' | 'IMPORT_SUPPLIER' | 'FORWARDER'>('ALL');
  const [periodFilter, setPeriodFilter] = useState<'ALL' | 'THIS_YEAR' | 'DAYS_90' | 'DAYS_365'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNPAID_ONLY' | 'OVERDUE_ONLY' | 'COMPLETED_ONLY'>('UNPAID_ONLY');
  const [searchTerm, setSearchTerm] = useState('');

  // 서브 모달 상태
  const [selectedSuppSummary, setSelectedSuppSummary] = useState<SupplierPayableSummary | null>(null);
  const [quickPaymentRecord, setQuickPaymentRecord] = useState<PayableRecord | null>(null);
  const [newPaymentAmount, setNewPaymentAmount] = useState<number>(0);
  const [newPaymentDate, setNewPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [newPaymentMethod, setNewPaymentMethod] = useState<'송금' | '카드' | '어음' | '현금' | '기타'>('송금');
  const [newPaymentNotes, setNewPaymentNotes] = useState<string>('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // 공급처 상세 모달 (기존 SupplierModal 재사용)
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [supplierForModal, setSupplierForModal] = useState<Supplier | undefined>(undefined);

  // ── Firestore 데이터 실시간 구독 ──
  useEffect(() => {
    setLoading(true);
    const compDoc = doc(db, 'companies', COMPANY_ID);

    // 1. Suppliers (공급업체 마스터)
    const unsubSupp = onSnapshot(collection(compDoc, 'suppliers'), snap => {
      const list: Supplier[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as Supplier));
      setSuppliers(list);
    }, err => console.error('Payables suppliers err:', err));

    // 2. Orders (수출 주문 & 포워더)
    const unsubOrders = onSnapshot(collection(compDoc, 'orders'), snap => {
      const list: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setOrders(list);
    }, err => console.error('Payables orders err:', err));

    // 3. Imports (수입 주문)
    const unsubImports = onSnapshot(collection(compDoc, 'imports'), snap => {
      const list: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setImports(list);
    }, err => console.error('Payables imports err:', err));

    // 4. Domestic Trades (국내 매입/매출)
    const unsubDom = onSnapshot(collection(compDoc, 'domesticTrades'), snap => {
      const list: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setDomesticTrades(list);
      setLoading(false);
    }, err => {
      console.error('Payables domesticTrades err:', err);
      getDocs(collection(compDoc, 'domestic_trades')).then(snap => {
        const list: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setDomesticTrades(list);
      }).catch(e => console.error('domestic_trades fallback err:', e));
      setLoading(false);
    });

    return () => {
      unsubSupp();
      unsubOrders();
      unsubImports();
      unsubDom();
    };
  }, []);

  // ── 전체 채무 레코드 정규화 ──
  const allRecords = useMemo<PayableRecord[]>(() => {
    const list: PayableRecord[] = [];
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

    // A. 수출 주문 내 공급사별 발주 매입 (Orders -> items grouped by supplier)
    orders.forEach(o => {
      const rawComp = String(o.issuingCompany || o.companyType || o.seller || o.myCompany || '').trim();
      const ciNoStr = String(o.ciNumber || o.piNumber || o.custPo || o.orderNo || o.id);
      const isYS = rawComp === 'YS' || rawComp === '영성ACC' || ciNoStr.startsWith('YS-') || String(o.id).startsWith('YS-');
      const orderDateStr = parseDateStr(o.orderDate || o.piDate || o.poDate || o.createdAt);

      let overdueDays = 0;
      if (orderDateStr) {
        const d = new Date(orderDateStr);
        if (!isNaN(d.getTime())) {
          overdueDays = Math.max(0, Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
        }
      }

      let agingBucket: '30D' | '60D' | '90D' | 'OVER_90D' = '30D';
      if (overdueDays > 90) agingBucket = 'OVER_90D';
      else if (overdueDays > 60) agingBucket = '90D';
      else if (overdueDays > 30) agingBucket = '60D';

      // 1. Order Items 공급사별 집계
      if (Array.isArray(o.items) && o.items.length > 0) {
        const itemsBySupplier: Record<string, any[]> = {};
        o.items.forEach((it: any) => {
          const sup = (it.supplier || it.supplierName || '').trim();
          if (!sup) return;
          if (!itemsBySupplier[sup]) itemsBySupplier[sup] = [];
          itemsBySupplier[sup].push(it);
        });

        Object.entries(itemsBySupplier).forEach(([supName, itList]) => {
          // 통화 및 매입금액 계산
          const isKrwSupplier = itList.some(it => it.purchaseCurrency === 'KRW' || (it.currency === 'KRW' && !it.purchaseCurrency));
          const curr: 'USD' | 'KRW' = isKrwSupplier ? 'KRW' : 'USD';

          const subTotal = itList.reduce((sum, it) => {
            const p = Number(it.buyingUnitPrice || it.purchasePrice || it.sourcingPrice || it.unitPrice || 0);
            const q = Number(it.qty || it.quantity || 0);
            return sum + (p * q);
          }, 0);

          const taxType = (o.supplierTaxTypes && o.supplierTaxTypes[supName]) || '영세';
          const vat = taxType === '영세' ? 0 : (curr === 'KRW' ? Math.round(subTotal * 0.1) : parseFloat((subTotal * 0.1).toFixed(2)));
          const grandTotal = subTotal + vat;

          if (grandTotal <= 0) return;

          // 결재 내역 (supplierPaymentInstallments)
          const installments = (o.supplierPaymentInstallments && o.supplierPaymentInstallments[supName]) || [];
          const paidAmt = installments.reduce((sum: number, inst: any) => sum + (Number(inst.amount) || 0), 0);

          const suppStatusObj = (o.supplierPayments && o.supplierPayments[supName]);
          const statusText = suppStatusObj?.status || '';
          const isMarkedCompleted = statusText === '입금완료' || statusText === '결재완료' || statusText === '완료';

          const effectivePaid = isMarkedCompleted ? grandTotal : paidAmt;
          const unpaid = Math.max(0, curr === 'KRW' ? Math.round(grandTotal - effectivePaid) : parseFloat((grandTotal - effectivePaid).toFixed(2)));

          const isFull = unpaid <= (curr === 'KRW' ? 1 : 0.01);
          const isPartial = !isFull && effectivePaid > 0;

          list.push({
            id: o.id,
            recordKey: `${o.id}_sup_${supName}`,
            sourceType: 'EXPORT_SUPPLIER',
            companyCode: isYS ? 'YS' : 'YSACC',
            companyName: isYS ? '영성ACC' : '(주)와이에스에이씨씨',
            date: orderDateStr || '-',
            docNumber: ciNoStr,
            supplierName: supName,
            category: '공급사',
            totalAmount: grandTotal,
            currency: curr,
            paidAmount: effectivePaid,
            unpaidAmount: unpaid,
            paymentStatus: isFull ? 'PAID' : isPartial ? 'PARTIAL' : 'UNPAID',
            paymentTerms: o.paymentTerms || '',
            dueDate: o.requestedDelivery || '',
            overdueDays,
            agingBucket,
            installments,
            orderId: o.id,
            rawDoc: o
          });
        });
      }

      // 2. 포워딩사 운송비 채무 (Orders -> forwarders)
      if (Array.isArray(o.forwarders) && o.forwarders.length > 0) {
        o.forwarders.forEach((fw: any, idx: number) => {
          const fwName = (fw.name || '').trim();
          if (!fwName) return;

          const isKrw = Boolean(fw.actualAmountKrw || fw.finalAmountKrw || fw.amountKrw);
          const curr: 'USD' | 'KRW' = isKrw ? 'KRW' : 'USD';

          let totAmt = 0;
          if (curr === 'KRW') {
            totAmt = Number(fw.finalAmountKrw || fw.actualAmountKrw || fw.amountKrw || 0);
          } else {
            totAmt = Number(fw.finalAmountUsd || fw.actualAmountUsd || fw.budgetAmountUsd || fw.amountUsd || 0);
          }

          if (totAmt <= 0) return;

          const installments = fw.paymentInstallments || [];
          const paidAmt = installments.reduce((sum: number, inst: any) => sum + (Number(inst.amount) || 0), 0);
          const isMarkedPaid = fw.paymentStatus === 'PAID' || fw.paymentStatus === '완료';

          const effectivePaid = isMarkedPaid ? totAmt : paidAmt;
          const unpaid = Math.max(0, curr === 'KRW' ? Math.round(totAmt - effectivePaid) : parseFloat((totAmt - effectivePaid).toFixed(2)));

          const isFull = unpaid <= (curr === 'KRW' ? 1 : 0.01);
          const isPartial = !isFull && effectivePaid > 0;

          list.push({
            id: o.id,
            recordKey: `${o.id}_fw_${idx}_${fwName}`,
            sourceType: 'FORWARDER',
            companyCode: isYS ? 'YS' : 'YSACC',
            companyName: isYS ? '영성ACC' : '(주)와이에스에이씨씨',
            date: orderDateStr || '-',
            docNumber: ciNoStr,
            supplierName: fwName,
            category: '포워딩사',
            totalAmount: totAmt,
            currency: curr,
            paidAmount: effectivePaid,
            unpaidAmount: unpaid,
            paymentStatus: isFull ? 'PAID' : isPartial ? 'PARTIAL' : 'UNPAID',
            paymentTerms: '포워더 운송비',
            dueDate: fw.taxInvoiceDate || '',
            overdueDays,
            agingBucket,
            installments,
            orderId: o.id,
            forwarderIndex: idx,
            rawDoc: o
          });
        });
      }
    });

    // B. 국내 주문 매입처 채무 (Domestic Trades -> supplierName)
    domesticTrades.forEach(dom => {
      const supName = (dom.supplierName || '').trim();
      if (!supName) return;

      const totAmt = Number(dom.purchaseAmountActual || dom.buyingAmount || 0);
      if (totAmt <= 0) return;

      const rawComp = String(dom.companyType || '').trim();
      const trNoStr = String(dom.tradeNo || dom.id);
      const isYS = rawComp === 'YS' || rawComp === '영성ACC' || trNoStr.startsWith('YS-') || String(dom.id).startsWith('YS-');
      const dateStr = parseDateStr(dom.purchaseDate || dom.orderDate || dom.date || dom.createdAt);

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

      const isSettled = Boolean(dom.purchaseSettled);
      const paidAmt = isSettled ? totAmt : 0;
      const unpaid = isSettled ? 0 : totAmt;

      list.push({
        id: dom.id,
        recordKey: `dom_${dom.id}`,
        sourceType: 'DOMESTIC_SUPPLIER',
        companyCode: isYS ? 'YS' : 'YSACC',
        companyName: isYS ? '영성ACC' : '(주)와이에스에이씨씨',
        date: dateStr || '-',
        docNumber: trNoStr,
        supplierName: supName,
        category: '국내매입처',
        totalAmount: totAmt,
        currency: 'KRW',
        paidAmount: paidAmt,
        unpaidAmount: unpaid,
        paymentStatus: isSettled ? 'PAID' : 'UNPAID',
        paymentTerms: dom.purchaseMemo || '국내 매입 결재',
        dueDate: dom.purchaseDate || '',
        overdueDays,
        agingBucket,
        installments: isSettled ? [{ date: dom.purchaseDate || dateStr, amount: totAmt, currency: 'KRW', method: '송금', notes: dom.purchaseMemo }] : [],
        rawDoc: dom
      });
    });

    // C. 수입 주문 해외 공급사 채무 (Imports -> importerName / supplierName)
    imports.forEach(imp => {
      const supName = (imp.importerName || imp.supplierName || imp.exporter || imp.seller || '').trim();
      if (!supName) return;

      const totAmt = Number(imp.supplierCostUsd || imp.confirmedSupplierAmount || imp.totalAmount || imp.invoiceAmount || 0);
      if (totAmt <= 0) return;

      const rawComp = String(imp.importCompany || imp.companyType || imp.issuingCompany || '').trim();
      const invNoStr = String(imp.invoiceNo || imp.blNo || imp.importNo || imp.id);
      const isYS = rawComp === 'YS' || rawComp === '영성ACC' || invNoStr.startsWith('YS-') || String(imp.id).startsWith('YS-');
      const dateStr = parseDateStr(imp.importDate || imp.blDate || imp.createdAt);

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

      const installments = imp.supplierPaymentInstallments || [];
      const sumPaid = installments.reduce((s: number, i: any) => s + (Number(i.amount) || 0), 0);
      const isMarkedPaid = imp.supplierPaymentStatus === 'PAID' || imp.status === '완료';

      const effectivePaid = isMarkedPaid ? totAmt : sumPaid;
      const unpaid = Math.max(0, parseFloat((totAmt - effectivePaid).toFixed(2)));

      const isFull = unpaid <= 0.01;
      const isPartial = !isFull && effectivePaid > 0;

      list.push({
        id: imp.id,
        recordKey: `imp_${imp.id}`,
        sourceType: 'IMPORT_SUPPLIER',
        companyCode: isYS ? 'YS' : 'YSACC',
        companyName: isYS ? '영성ACC' : '(주)와이에스에이씨씨',
        date: dateStr || '-',
        docNumber: invNoStr,
        supplierName: supName,
        category: '해외공급사',
        totalAmount: totAmt,
        currency: (imp.currency === 'KRW' ? 'KRW' : 'USD'),
        paidAmount: effectivePaid,
        unpaidAmount: unpaid,
        paymentStatus: isFull ? 'PAID' : isPartial ? 'PARTIAL' : 'UNPAID',
        paymentTerms: imp.paymentTerms || '',
        dueDate: imp.deliveryDate || '',
        overdueDays,
        agingBucket,
        installments,
        rawDoc: imp
      });
    });

    return list;
  }, [orders, imports, domesticTrades]);

  // ── 필터링된 개별 채무 레코드 ──
  const filteredRecords = useMemo<PayableRecord[]>(() => {
    const currentYear = new Date().getFullYear().toString();

    return allRecords.filter(r => {
      // 1. 법인 필터
      if (companyFilter !== 'ALL' && r.companyCode !== companyFilter) return false;

      // 2. 사업 부문 필터
      if (sourceFilter !== 'ALL' && r.sourceType !== sourceFilter) return false;

      // 3. 기간 필터
      if (periodFilter === 'THIS_YEAR') {
        if (!r.date.startsWith(currentYear)) return false;
      } else if (periodFilter === 'DAYS_90') {
        if (r.overdueDays > 90) return false;
      } else if (periodFilter === 'DAYS_365') {
        if (r.overdueDays > 365) return false;
      }

      // 4. 상태 필터
      if (statusFilter === 'UNPAID_ONLY' && r.paymentStatus === 'PAID') return false;
      if (statusFilter === 'OVERDUE_ONLY' && (r.overdueDays <= 30 || r.paymentStatus === 'PAID')) return false;
      if (statusFilter === 'COMPLETED_ONLY' && r.paymentStatus !== 'PAID') return false;

      // 5. 검색어
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const match =
          r.supplierName.toLowerCase().includes(q) ||
          r.docNumber.toLowerCase().includes(q) ||
          (r.paymentTerms && r.paymentTerms.toLowerCase().includes(q));
        if (!match) return false;
      }

      return true;
    });
  }, [allRecords, companyFilter, sourceFilter, periodFilter, statusFilter, searchTerm]);

  // ── 공급업체별 채무 집계 및 DPO 계산 ──
  const supplierSummaries = useMemo<SupplierPayableSummary[]>(() => {
    const map = new Map<string, SupplierPayableSummary>();

    // 공급업체 마스터 맵
    const suppMasterMap = new Map<string, Supplier>();
    suppliers.forEach(s => {
      if (s.name) suppMasterMap.set(s.name.trim().toLowerCase(), s);
      if (s.supplierCode) suppMasterMap.set(s.supplierCode.trim().toLowerCase(), s);
    });

    filteredRecords.forEach(r => {
      const supKey = cleanCompanyName(r.supplierName).trim() || r.supplierName.trim();
      const supKeyLower = supKey.toLowerCase();
      const master = suppMasterMap.get(supKeyLower);

      if (!map.has(supKey)) {
        map.set(supKey, {
          supplierId: master?.id,
          supplierCode: master?.supplierCode || '-',
          supplierName: master?.name || r.supplierName,
          category: master?.category || r.category || '공급사',
          representative: master?.representative || '',
          bizNumber: master?.bizNumber || '',
          managerName: master?.managerName || '',
          managerPhone: master?.managerPhone || '',
          purchaseEmail: master?.purchaseEmail || '',
          bankKrw: master?.bankKrw || '',
          bankUsd: master?.bankUsd || '',
          totalOrdersCount: 0,
          totalPurchaseUsd: 0,
          totalPaidUsd: 0,
          unpaidUsd: 0,
          totalPurchaseKrw: 0,
          totalPaidKrw: 0,
          unpaidKrw: 0,
          paymentRate: 0,
          dpo: 0,
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

      const item = map.get(supKey)!;
      item.totalOrdersCount += 1;
      item.records.push(r);

      if (r.currency === 'KRW') {
        item.totalPurchaseKrw += r.totalAmount;
        item.totalPaidKrw += r.paidAmount;
        item.unpaidKrw += r.unpaidAmount;

        if (r.unpaidAmount > 0) {
          if (r.agingBucket === '30D') item.aging30dKrw += r.unpaidAmount;
          else if (r.agingBucket === '60D') item.aging60dKrw += r.unpaidAmount;
          else if (r.agingBucket === '90D') item.aging90dKrw += r.unpaidAmount;
          else item.agingOver90dKrw += r.unpaidAmount;
        }
      } else {
        item.totalPurchaseUsd += r.totalAmount;
        item.totalPaidUsd += r.paidAmount;
        item.unpaidUsd += r.unpaidAmount;

        if (r.unpaidAmount > 0) {
          if (r.agingBucket === '30D') item.aging30dUsd += r.unpaidAmount;
          else if (r.agingBucket === '60D') item.aging60dUsd += r.unpaidAmount;
          else if (r.agingBucket === '90D') item.aging90dUsd += r.unpaidAmount;
          else item.agingOver90dUsd += r.unpaidAmount;
        }
      }
    });

    // DPO 및 지급률 계산
    const result = Array.from(map.values());
    result.forEach(item => {
      const totPurchaseApprox = item.totalPurchaseUsd + (item.totalPurchaseKrw / 1400);
      const unpaidApprox = item.unpaidUsd + (item.unpaidKrw / 1400);

      // 지급률 (%)
      if (totPurchaseApprox > 0) {
        const paidApprox = (item.totalPaidUsd + (item.totalPaidKrw / 1400));
        item.paymentRate = Math.min(100, Math.round((paidApprox / totPurchaseApprox) * 100));
      } else {
        item.paymentRate = 0;
      }

      // DPO (매입채무회전일수) = (미지급채무 / 총매입액) * 90일
      const periodDays = periodFilter === 'THIS_YEAR' ? 180 : periodFilter === 'DAYS_365' ? 365 : 90;
      if (totPurchaseApprox > 0 && unpaidApprox > 0) {
        item.dpo = Math.round((unpaidApprox / totPurchaseApprox) * periodDays);
      } else {
        item.dpo = 0;
      }
    });

    // 미지급액 내림차순 정렬
    result.sort((a, b) => {
      const unpA = a.unpaidUsd + (a.unpaidKrw / 1400);
      const unpB = b.unpaidUsd + (b.unpaidKrw / 1400);
      return unpB - unpA;
    });

    return result;
  }, [filteredRecords, suppliers, periodFilter]);

  // ── 상단 종합 KPI 집계 ──
  const kpis = useMemo(() => {
    let totPurchaseUsd = 0;
    let totPaidUsd = 0;
    let unpaidUsd = 0;

    let totPurchaseKrw = 0;
    let totPaidKrw = 0;
    let unpaidKrw = 0;

    let overdueUsd = 0;
    let overdueKrw = 0;

    filteredRecords.forEach(r => {
      if (r.currency === 'KRW') {
        totPurchaseKrw += r.totalAmount;
        totPaidKrw += r.paidAmount;
        unpaidKrw += r.unpaidAmount;
        if (r.overdueDays > 90 && r.unpaidAmount > 0) {
          overdueKrw += r.unpaidAmount;
        }
      } else {
        totPurchaseUsd += r.totalAmount;
        totPaidUsd += r.paidAmount;
        unpaidUsd += r.unpaidAmount;
        if (r.overdueDays > 90 && r.unpaidAmount > 0) {
          overdueUsd += r.unpaidAmount;
        }
      }
    });

    const grandPurchase = totPurchaseUsd + (totPurchaseKrw / 1400);
    const grandUnpaid = unpaidUsd + (unpaidKrw / 1400);
    const avgDpo = grandPurchase > 0 ? Math.round((grandUnpaid / grandPurchase) * 90) : 0;

    return {
      totPurchaseUsd,
      totPaidUsd,
      unpaidUsd,
      totPurchaseKrw,
      totPaidKrw,
      unpaidKrw,
      overdueUsd,
      overdueKrw,
      avgDpo,
      suppliersCount: supplierSummaries.length,
      recordsCount: filteredRecords.length
    };
  }, [filteredRecords, supplierSummaries]);

  // ── 엑셀 내보내기 ──
  const handleExportExcel = () => {
    if (activeTab === 'supplier') {
      const rows = supplierSummaries.map((s, i) => ({
        'No': i + 1,
        '업체코드': s.supplierCode,
        '공급업체명': s.supplierName,
        '구분': s.category,
        '대표자': s.representative || '-',
        '담당자/연락처': `${s.managerName || '-'} / ${s.managerPhone || '-'}`,
        '발주건수': s.totalOrdersCount,
        '총매입액(USD)': s.totalPurchaseUsd,
        '지급완료(USD)': s.totalPaidUsd,
        '미지급잔액(USD)': s.unpaidUsd,
        '총매입액(KRW)': s.totalPurchaseKrw,
        '지급완료(KRW)': s.totalPaidKrw,
        '미지급잔액(KRW)': s.unpaidKrw,
        '지급완료율': `${s.paymentRate}%`,
        '채무회전일(DPO)': `${s.dpo}일`,
        '30일이내(USD)': s.aging30dUsd,
        '60일이내(USD)': s.aging60dUsd,
        '90일이내(USD)': s.aging90dUsd,
        '90일초과(USD)': s.agingOver90dUsd,
        '30일이내(KRW)': s.aging30dKrw,
        '60일이내(KRW)': s.aging60dKrw,
        '90일이내(KRW)': s.aging90dKrw,
        '90일초과(KRW)': s.agingOver90dKrw
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '공급업체별채무DPO');
      XLSX.writeFile(wb, `YSACC_공급업체별_채무_DPO현황_${new Date().toISOString().split('T')[0]}.xlsx`);
    } else {
      const rows = filteredRecords.map((r, i) => ({
        'No': i + 1,
        '부문': r.sourceType === 'EXPORT_SUPPLIER' ? '수출매입' : r.sourceType === 'FORWARDER' ? '포워딩운송' : r.sourceType === 'DOMESTIC_SUPPLIER' ? '국내매입' : '수입매입',
        '법인': r.companyName,
        '발주일자': r.date,
        '관리번호(CI/PO)': r.docNumber,
        '공급업체명': r.supplierName,
        '매입총액': r.totalAmount,
        '기지급액': r.paidAmount,
        '미지급잔액': r.unpaidAmount,
        '통화': r.currency,
        '경과일수': `${r.overdueDays}일`,
        '채무구간': r.agingBucket === '30D' ? '30일이내' : r.agingBucket === '60D' ? '31~60일' : r.agingBucket === '90D' ? '61~90일' : '90일초과',
        '결재상태': r.paymentStatus === 'PAID' ? '지급완료' : r.paymentStatus === 'PARTIAL' ? '일부지급' : '미지급'
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '건별채무명세');
      XLSX.writeFile(wb, `YSACC_건별_매입채무명세_${new Date().toISOString().split('T')[0]}.xlsx`);
    }
  };

  // ── 빠른 결재/지급 등록 제출 ──
  const handleSaveQuickPayment = async () => {
    if (!quickPaymentRecord) return;
    if (newPaymentAmount <= 0) {
      alert('지급 금액을 0보다 큰 금액으로 입력해 주세요.');
      return;
    }

    try {
      setIsSubmittingPayment(true);
      const targetDoc = quickPaymentRecord.rawDoc;

      if (quickPaymentRecord.sourceType === 'EXPORT_SUPPLIER') {
        const supName = quickPaymentRecord.supplierName;
        const prevList = (targetDoc.supplierPaymentInstallments && targetDoc.supplierPaymentInstallments[supName]) || [];
        const newInst = {
          date: newPaymentDate,
          amount: Number(newPaymentAmount),
          currency: quickPaymentRecord.currency,
          method: newPaymentMethod,
          notes: newPaymentNotes.trim()
        };
        const updatedList = [...prevList, newInst];
        const newTotalPaid = updatedList.reduce((s, it) => s + (Number(it.amount) || 0), 0);
        const isFullPaid = newTotalPaid >= quickPaymentRecord.totalAmount - (quickPaymentRecord.currency === 'KRW' ? 1 : 0.01);

        await updateDoc(doc(db, 'companies', COMPANY_ID, 'orders', quickPaymentRecord.id), {
          [`supplierPaymentInstallments.${supName}`]: updatedList,
          [`supplierPayments.${supName}`]: {
            status: isFullPaid ? '입금완료' : '부분입금',
            date: newPaymentDate
          },
          updatedAt: serverTimestamp()
        });
      } else if (quickPaymentRecord.sourceType === 'FORWARDER') {
        const fwIdx = quickPaymentRecord.forwarderIndex ?? 0;
        const fwList = Array.isArray(targetDoc.forwarders) ? [...targetDoc.forwarders] : [];
        if (fwList[fwIdx]) {
          const prevInsts = fwList[fwIdx].paymentInstallments || [];
          const newInst = {
            date: newPaymentDate,
            amount: Number(newPaymentAmount),
            currency: quickPaymentRecord.currency,
            method: newPaymentMethod,
            notes: newPaymentNotes.trim()
          };
          const updatedInsts = [...prevInsts, newInst];
          const totalPaid = updatedInsts.reduce((s: number, it: any) => s + (Number(it.amount) || 0), 0);
          const isFullPaid = totalPaid >= quickPaymentRecord.totalAmount - (quickPaymentRecord.currency === 'KRW' ? 1 : 0.01);

          fwList[fwIdx] = {
            ...fwList[fwIdx],
            paymentInstallments: updatedInsts,
            paymentStatus: isFullPaid ? 'PAID' : 'PARTIAL'
          };

          await updateDoc(doc(db, 'companies', COMPANY_ID, 'orders', quickPaymentRecord.id), {
            forwarders: fwList,
            updatedAt: serverTimestamp()
          });
        }
      } else if (quickPaymentRecord.sourceType === 'DOMESTIC_SUPPLIER') {
        const isFullPaid = (quickPaymentRecord.paidAmount + Number(newPaymentAmount)) >= quickPaymentRecord.totalAmount - 1;
        await updateDoc(doc(db, 'companies', COMPANY_ID, 'domesticTrades', quickPaymentRecord.id), {
          purchaseSettled: isFullPaid,
          purchaseDate: newPaymentDate,
          purchaseMemo: newPaymentNotes.trim() || `결재완료: ${newPaymentDate} / ${newPaymentAmount.toLocaleString()}원`,
          updatedAt: serverTimestamp()
        });
      } else if (quickPaymentRecord.sourceType === 'IMPORT_SUPPLIER') {
        const prevList = targetDoc.supplierPaymentInstallments || [];
        const newInst = {
          date: newPaymentDate,
          amount: Number(newPaymentAmount),
          currency: quickPaymentRecord.currency,
          method: newPaymentMethod,
          notes: newPaymentNotes.trim()
        };
        const updatedList = [...prevList, newInst];
        const newTotalPaid = updatedList.reduce((s: number, it: any) => s + (Number(it.amount) || 0), 0);
        const isFullPaid = newTotalPaid >= quickPaymentRecord.totalAmount - 0.01;

        await updateDoc(doc(db, 'companies', COMPANY_ID, 'imports', quickPaymentRecord.id), {
          supplierPaymentInstallments: updatedList,
          supplierPaidAmount: newTotalPaid,
          supplierPaymentStatus: isFullPaid ? 'PAID' : 'PARTIAL',
          updatedAt: serverTimestamp()
        });
      }

      alert('지급/결재 등록이 성공적으로 저장되었습니다.');
      setQuickPaymentRecord(null);
    } catch (err) {
      console.error('Save quick payment error:', err);
      alert('지급 등록 중 오류가 발생했습니다: ' + String(err));
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // 공급처 상세 모달 열기
  const handleOpenSupplierModal = (suppName: string) => {
    const matched = suppliers.find(s => cleanCompanyName(s.name).toLowerCase() === cleanCompanyName(suppName).toLowerCase());
    if (matched) {
      setSupplierForModal(matched);
    } else {
      setSupplierForModal({
        id: '',
        supplierCode: '',
        name: suppName,
        bizNumber: '',
        representative: '',
        phone: '',
        purchaseEmail: '',
        address: '',
        managerName: '',
        managerPhone: '',
        category: '공급사'
      });
    }
    setIsSupplierModalOpen(true);
  };

  return (
    <div style={{ padding: '20px 24px', background: '#f8fafc', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ── HEADER BAR ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '16px 20px', borderRadius: '4px', border: '1px solid #cbd5e1', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '24px' }}>💳</span>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>
              영업관리 : 채무관리 & 결재(지급)관리 (DPO)
            </h2>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
              공급업체별 매입 채무 현황, 연령(Aging 30/60/90일) 분석, 회전일수(DPO : Days Payable Outstanding) 모니터링 및 실시간 결재 정산
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={handleExportExcel}
            style={{
              height: '34px',
              padding: '0 14px',
              borderRadius: '4px',
              background: '#10b981',
              color: '#fff',
              border: 'none',
              fontSize: '13px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
          >
            📊 엑셀 다운로드
          </button>
        </div>
      </div>

      {/* ── TOP KPI METRIC CARDS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '14px' }}>
        {/* 1. 총 매입/발주 발생액 */}
        <div style={{ background: '#fff', padding: '16px', borderRadius: '4px', border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>
            총 매입 발생액 (USD / KRW)
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>
            ${kpis.totPurchaseUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#64748b' }}>
            ₩{kpis.totPurchaseKrw.toLocaleString()}
          </div>
        </div>

        {/* 2. 기지급(결재완료) 누적액 */}
        <div style={{ background: '#fff', padding: '16px', borderRadius: '4px', border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>
            지급(결재) 완료액
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#16a34a' }}>
            ${kpis.totPaidUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#15803d' }}>
            ₩{kpis.totPaidKrw.toLocaleString()}
          </div>
        </div>

        {/* 3. 미지급 채무 잔액 */}
        <div style={{ background: '#fff', padding: '16px', borderRadius: '4px', border: '2px solid #ef4444', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '11px', fontWeight: 750, color: '#ef4444', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between' }}>
            <span>⚠️ 미지급 채무 잔액</span>
            <span style={{ fontSize: '10.5px', background: '#fee2e2', color: '#b91c1c', padding: '1px 6px', borderRadius: '3px' }}>미결재</span>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#dc2626' }}>
            ${kpis.unpaidUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '14px', fontWeight: 800, color: '#b91c1c' }}>
            ₩{kpis.unpaidKrw.toLocaleString()}
          </div>
        </div>

        {/* 4. 전사 평균 매입채무회전일수 (DPO) */}
        <div style={{ background: '#fff', padding: '16px', borderRadius: '4px', border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between' }}>
            <span>평균 채무회전일수 (DPO)</span>
            <span style={{
              fontSize: '10.5px',
              padding: '1px 6px',
              borderRadius: '3px',
              background: kpis.avgDpo <= 30 ? '#dcfce7' : kpis.avgDpo <= 60 ? '#eff6ff' : kpis.avgDpo <= 90 ? '#fef3c7' : '#fee2e2',
              color: kpis.avgDpo <= 30 ? '#15803d' : kpis.avgDpo <= 60 ? '#1d4ed8' : kpis.avgDpo <= 90 ? '#b45309' : '#b91c1c'
            }}>
              {kpis.avgDpo <= 30 ? '우수' : kpis.avgDpo <= 60 ? '적정' : kpis.avgDpo <= 90 ? '주의' : '지연'}
            </span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#2563eb' }}>
            {kpis.avgDpo} <span style={{ fontSize: '13px', fontWeight: 700 }}>일</span>
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748b' }}>
            기준일수 90일 가중평균
          </div>
        </div>

        {/* 5. 90일 초과 연체/지연 채무 */}
        <div style={{ background: '#fff', padding: '16px', borderRadius: '4px', border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '11px', fontWeight: 750, color: '#b91c1c', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between' }}>
            <span>🚨 90일 초과 미결재 채무</span>
            <span style={{ fontSize: '10.5px', background: '#fee2e2', color: '#b91c1c', padding: '1px 6px', borderRadius: '3px' }}>주의 요망</span>
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#b91c1c' }}>
            ${kpis.overdueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#dc2626' }}>
            ₩{kpis.overdueKrw.toLocaleString()}
          </div>
        </div>
      </div>

      {/* ── FILTER & SEARCH CONTROLS ── */}
      <div style={{ background: '#fff', padding: '14px 20px', borderRadius: '4px', border: '1px solid #cbd5e1', display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center' }}>
        {/* 법인 필터 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>법인 구분</label>
          <select
            value={companyFilter}
            onChange={e => setCompanyFilter(e.target.value as any)}
            style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600, color: '#1e293b' }}
          >
            <option value="ALL">🏢 전체 법인</option>
            <option value="YS">영성ACC (YS)</option>
            <option value="YSACC">(주)와이에스에이씨씨</option>
          </select>
        </div>

        {/* 거래 부문 필터 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>거래 부문</label>
          <select
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value as any)}
            style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600, color: '#1e293b' }}
          >
            <option value="ALL">전체 부문</option>
            <option value="EXPORT_SUPPLIER">📦 수출 원자재/공급사</option>
            <option value="FORWARDER">🚢 포워딩 운송사</option>
            <option value="DOMESTIC_SUPPLIER">🏬 국내 매입처</option>
            <option value="IMPORT_SUPPLIER">⚓ 수입 공급사</option>
          </select>
        </div>

        {/* 분석 기간 필터 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>기간</label>
          <select
            value={periodFilter}
            onChange={e => setPeriodFilter(e.target.value as any)}
            style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600, color: '#1e293b' }}
          >
            <option value="ALL">전체 기간</option>
            <option value="THIS_YEAR">📅 올해 (Current Year)</option>
            <option value="DAYS_90">최근 90일</option>
            <option value="DAYS_365">최근 1년</option>
          </select>
        </div>

        {/* 결재/지급 상태 필터 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>결재/채무 상태</label>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600, color: '#1e293b' }}
          >
            <option value="UNPAID_ONLY">⚠️ 미지급 / 일부지급만 (권장)</option>
            <option value="OVERDUE_ONLY">🚨 30일 초과 미지급 채무</option>
            <option value="COMPLETED_ONLY">✅ 결재완료(완납) 건만</option>
            <option value="ALL">전체 상태</option>
          </select>
        </div>

        {/* 검색창 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '220px' }}>
          <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>공급업체 / 번호 검색</label>
          <input
            type="text"
            placeholder="공급처명, 관리번호(CI/PO/주문번호) 등 입력..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 12px', fontSize: '13px', fontWeight: 600, color: '#1e293b' }}
          />
        </div>

        {/* 초기화 버튼 */}
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button
            type="button"
            onClick={() => {
              setCompanyFilter('ALL');
              setSourceFilter('ALL');
              setPeriodFilter('ALL');
              setStatusFilter('UNPAID_ONLY');
              setSearchTerm('');
            }}
            style={{
              height: '34px',
              padding: '0 12px',
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: '4px',
              fontSize: '12.5px',
              fontWeight: 700,
              color: '#475569',
              cursor: 'pointer'
            }}
          >
            ↺ 필터 초기화
          </button>
        </div>
      </div>

      {/* ── TAB SELECTOR ── */}
      <div style={{ display: 'flex', borderBottom: '2px solid #cbd5e1', gap: '4px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('supplier')}
          style={{
            padding: '10px 20px',
            border: 'none',
            borderBottom: activeTab === 'supplier' ? '3px solid #3b82f6' : '3px solid transparent',
            background: activeTab === 'supplier' ? '#fff' : 'transparent',
            borderRadius: '4px 4px 0 0',
            fontSize: '14px',
            fontWeight: activeTab === 'supplier' ? 800 : 600,
            color: activeTab === 'supplier' ? '#2563eb' : '#64748b',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          🏢 공급업체별 채무 종합 (DPO)
          <span style={{
            fontSize: '11px',
            padding: '2px 7px',
            borderRadius: '10px',
            background: activeTab === 'supplier' ? '#eff6ff' : '#e2e8f0',
            color: activeTab === 'supplier' ? '#2563eb' : '#64748b',
            fontWeight: 800
          }}>
            {supplierSummaries.length}개사
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('items')}
          style={{
            padding: '10px 20px',
            border: 'none',
            borderBottom: activeTab === 'items' ? '3px solid #3b82f6' : '3px solid transparent',
            background: activeTab === 'items' ? '#fff' : 'transparent',
            borderRadius: '4px 4px 0 0',
            fontSize: '14px',
            fontWeight: activeTab === 'items' ? 800 : 600,
            color: activeTab === 'items' ? '#2563eb' : '#64748b',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          📑 개별 발주/채무 건별 명세 및 결재등록
          <span style={{
            fontSize: '11px',
            padding: '2px 7px',
            borderRadius: '10px',
            background: activeTab === 'items' ? '#eff6ff' : '#e2e8f0',
            color: activeTab === 'items' ? '#2563eb' : '#64748b',
            fontWeight: 800
          }}>
            {filteredRecords.length}건
          </span>
        </button>
      </div>

      {/* ── TAB CONTENT ── */}
      {loading ? (
        <div style={{ background: '#fff', padding: '50px', textAlign: 'center', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#64748b' }}>채무 및 결재 데이터를 분석하고 있습니다...</div>
        </div>
      ) : activeTab === 'supplier' ? (
        /* TAB 1: 공급업체별 채무 종합 (Supplier AP & DPO Summary) */
        <div style={{ background: '#fff', borderRadius: '4px', border: '1px solid #cbd5e1', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ padding: '12px 18px', background: '#fafafa', borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b' }}>
              📊 공급업체별 채무회전일(DPO) 및 채무연령(Aging) 분석 (총 {supplierSummaries.length}개사)
            </span>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              공급업체명을 클릭하면 계좌정보/연락처 조회 및 수정이 가능합니다.
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                  <th style={{ padding: '10px 12px', width: '45px', textAlign: 'center' }}>No</th>
                  <th style={{ padding: '10px 12px', width: '90px' }}>업체코드</th>
                  <th style={{ padding: '10px 12px' }}>공급업체명</th>
                  <th style={{ padding: '10px 10px', width: '80px', textAlign: 'center' }}>구분</th>
                  <th style={{ padding: '10px 10px', width: '130px' }}>계좌정보 / 담당자</th>
                  <th style={{ padding: '10px 10px', width: '70px', textAlign: 'center' }}>발주건수</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>총 매입금액</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>기지급 완료</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', color: '#dc2626', fontWeight: 800 }}>미지급 채무 잔액</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', width: '100px', color: '#2563eb', fontWeight: 800 }}>채무회전일(DPO)</th>
                  <th style={{ padding: '10px 10px', textAlign: 'center', width: '140px' }}>채무 연령 (Aging)</th>
                  <th style={{ padding: '10px 10px', textAlign: 'center', width: '100px' }}>관리</th>
                </tr>
              </thead>
              <tbody>
                {supplierSummaries.length === 0 ? (
                  <tr>
                    <td colSpan={12} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                      조회된 공급업체 채무 내역이 없습니다.
                    </td>
                  </tr>
                ) : (
                  supplierSummaries.map((s, idx) => {
                    const isOverdueAlert = s.dpo > 60 || s.agingOver90dUsd > 0 || s.agingOver90dKrw > 0;
                    return (
                      <tr
                        key={s.supplierName}
                        style={{
                          borderBottom: '1px solid #e2e8f0',
                          background: isOverdueAlert ? '#fffbfb' : '#fff'
                        }}
                      >
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                          {idx + 1}
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: '#64748b' }}>
                          {s.supplierCode || '-'}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <button
                            type="button"
                            onClick={() => handleOpenSupplierModal(s.supplierName)}
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              fontSize: '13.5px',
                              fontWeight: 800,
                              color: '#2563eb',
                              cursor: 'pointer',
                              textAlign: 'left',
                              textDecoration: 'underline'
                            }}
                          >
                            {s.supplierName}
                          </button>
                          {s.representative && (
                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                              대표: {s.representative}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '3px',
                            background: s.category === '포워딩사' ? '#f3e8ff' : s.category === '해외공급사' ? '#e0f2fe' : '#f1f5f9',
                            color: s.category === '포워딩사' ? '#7e22ce' : s.category === '해외공급사' ? '#0369a1' : '#475569'
                          }}>
                            {s.category}
                          </span>
                        </td>
                        <td style={{ padding: '10px 10px', fontSize: '12px' }}>
                          <div style={{ fontWeight: 600, color: '#1e293b' }}>
                            {s.managerName ? `${s.managerName} (${s.managerPhone || '-'})` : '-'}
                          </div>
                          {(s.bankKrw || s.bankUsd) && (
                            <div style={{ fontSize: '11px', color: '#0284c7', marginTop: '2px' }} title={s.bankKrw || s.bankUsd}>
                              🏦 {s.bankKrw || s.bankUsd}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 700 }}>
                          {s.totalOrdersCount}건
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>
                          {s.totalPurchaseUsd > 0 && <div>${s.totalPurchaseUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>}
                          {s.totalPurchaseKrw > 0 && <div style={{ color: '#475569' }}>₩{s.totalPurchaseKrw.toLocaleString()}</div>}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>
                          {s.totalPaidUsd > 0 && <div>${s.totalPaidUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>}
                          {s.totalPaidKrw > 0 && <div>₩{s.totalPaidKrw.toLocaleString()}</div>}
                          <div style={{ fontSize: '10.5px', color: '#64748b' }}>({s.paymentRate}%)</div>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#dc2626' }}>
                          {s.unpaidUsd > 0 && <div>${s.unpaidUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>}
                          {s.unpaidKrw > 0 && <div>₩{s.unpaidKrw.toLocaleString()}</div>}
                          {s.unpaidUsd === 0 && s.unpaidKrw === 0 && <span style={{ color: '#10b981', fontSize: '12px' }}>결재완료</span>}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '3px 8px',
                              borderRadius: '4px',
                              fontSize: '12.5px',
                              fontWeight: 800,
                              background: s.dpo <= 30 ? '#dcfce7' : s.dpo <= 60 ? '#eff6ff' : s.dpo <= 90 ? '#fef3c7' : '#fee2e2',
                              color: s.dpo <= 30 ? '#15803d' : s.dpo <= 60 ? '#1d4ed8' : s.dpo <= 90 ? '#b45309' : '#b91c1c',
                              border: `1px solid ${s.dpo <= 30 ? '#bbf7d0' : s.dpo <= 60 ? '#bfdbfe' : s.dpo <= 90 ? '#fde68a' : '#fecaca'}`
                            }}
                          >
                            {s.dpo}일
                          </span>
                        </td>
                        <td style={{ padding: '10px 10px', fontSize: '11px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '3px', justifyContent: 'center' }}>
                            <span title="30일 이내 미지급" style={{ padding: '1px 4px', borderRadius: '2px', background: '#f1f5f9', color: '#475569' }}>
                              30D
                            </span>
                            <span title="31~60일 미지급" style={{ padding: '1px 4px', borderRadius: '2px', background: s.aging60dUsd + s.aging60dKrw > 0 ? '#fef3c7' : '#f1f5f9', color: s.aging60dUsd + s.aging60dKrw > 0 ? '#b45309' : '#94a3b8' }}>
                              60D
                            </span>
                            <span title="61~90일 미지급" style={{ padding: '1px 4px', borderRadius: '2px', background: s.aging90dUsd + s.aging90dKrw > 0 ? '#fed7aa' : '#f1f5f9', color: s.aging90dUsd + s.aging90dKrw > 0 ? '#c2410c' : '#94a3b8' }}>
                              90D
                            </span>
                            <span title="90일 초과 연체" style={{ padding: '1px 4px', borderRadius: '2px', background: s.agingOver90dUsd + s.agingOver90dKrw > 0 ? '#fee2e2' : '#f1f5f9', color: s.agingOver90dUsd + s.agingOver90dKrw > 0 ? '#b91c1c' : '#94a3b8', fontWeight: 800 }}>
                              90D+
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedSuppSummary(s);
                              setActiveTab('items');
                              setSearchTerm(s.supplierName);
                            }}
                            style={{
                              height: '28px',
                              padding: '0 8px',
                              background: '#3b82f6',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '3px',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            건별조회
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
        /* TAB 2: 개별 발주/채무 건별 명세 및 실시간 결재 등록 */
        <div style={{ background: '#fff', borderRadius: '4px', border: '1px solid #cbd5e1', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ padding: '12px 18px', background: '#fafafa', borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b' }}>
              📑 개별 발주/매입 건별 채무 명세 및 실시간 결재 등록 (총 {filteredRecords.length}건)
            </span>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              미결재 건에 대해 [💳 지급/결재 등록] 버튼을 클릭하면 즉시 정산 분할 등록이 가능합니다.
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                  <th style={{ padding: '10px 10px', width: '45px', textAlign: 'center' }}>No</th>
                  <th style={{ padding: '10px 10px', width: '90px' }}>구분</th>
                  <th style={{ padding: '10px 10px', width: '75px' }}>법인</th>
                  <th style={{ padding: '10px 10px', width: '95px' }}>발주일자</th>
                  <th style={{ padding: '10px 12px', width: '130px' }}>관리번호(CI/PO)</th>
                  <th style={{ padding: '10px 12px' }}>공급업체명</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>매입(발주)총액</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>기지급액</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', color: '#dc2626', fontWeight: 800 }}>미지급 잔액</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', width: '85px' }}>결재상태</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', width: '80px' }}>경과일수</th>
                  <th style={{ padding: '10px 12px', width: '160px' }}>최근 결재내역</th>
                  <th style={{ padding: '10px 10px', textAlign: 'center', width: '120px' }}>액션</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={13} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                      조회된 건별 채무 내역이 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((r, idx) => {
                    const isOverdue = r.overdueDays > 60 && r.unpaidAmount > 0;
                    return (
                      <tr
                        key={r.recordKey}
                        style={{
                          borderBottom: '1px solid #e2e8f0',
                          background: isOverdue ? '#fffbfb' : '#fff'
                        }}
                      >
                        <td style={{ padding: '10px 10px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                          {idx + 1}
                        </td>
                        <td style={{ padding: '10px 10px' }}>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '3px',
                            background: r.sourceType === 'EXPORT_SUPPLIER' ? '#dbeafe' : r.sourceType === 'FORWARDER' ? '#f3e8ff' : r.sourceType === 'DOMESTIC_SUPPLIER' ? '#dcfce7' : '#e0f2fe',
                            color: r.sourceType === 'EXPORT_SUPPLIER' ? '#1d4ed8' : r.sourceType === 'FORWARDER' ? '#7e22ce' : r.sourceType === 'DOMESTIC_SUPPLIER' ? '#15803d' : '#0369a1'
                          }}>
                            {r.sourceType === 'EXPORT_SUPPLIER' ? '수출원자재' : r.sourceType === 'FORWARDER' ? '포워딩운송' : r.sourceType === 'DOMESTIC_SUPPLIER' ? '국내매입' : '수입매입'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 10px', fontSize: '12px', fontWeight: 600 }}>
                          {r.companyCode}
                        </td>
                        <td style={{ padding: '10px 10px', fontSize: '12.5px', color: '#475569' }}>
                          {r.date}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <button
                            type="button"
                            onClick={() => {
                              if (r.sourceType === 'EXPORT_SUPPLIER' || r.sourceType === 'FORWARDER') {
                                navigate(`/orders/${r.id}`);
                              } else if (r.sourceType === 'DOMESTIC_SUPPLIER') {
                                navigate('/domestic-orders');
                              } else {
                                navigate(`/imports/${r.id}`);
                              }
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              fontSize: '13px',
                              fontWeight: 700,
                              color: '#2563eb',
                              cursor: 'pointer',
                              textAlign: 'left',
                              textDecoration: 'underline'
                            }}
                          >
                            {r.docNumber}
                          </button>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <button
                            type="button"
                            onClick={() => handleOpenSupplierModal(r.supplierName)}
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              fontSize: '13px',
                              fontWeight: 800,
                              color: '#1e293b',
                              cursor: 'pointer',
                              textAlign: 'left',
                              textDecoration: 'underline'
                            }}
                          >
                            {r.supplierName}
                          </button>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>
                          {r.currency === 'USD' ? `$${r.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `₩${r.totalAmount.toLocaleString()}`}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>
                          {r.currency === 'USD' ? `$${r.paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `₩${r.paidAmount.toLocaleString()}`}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#dc2626' }}>
                          {r.unpaidAmount > 0 ? (
                            r.currency === 'USD' ? `$${r.unpaidAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `₩${r.unpaidAmount.toLocaleString()}`
                          ) : (
                            <span style={{ color: '#10b981', fontSize: '12px' }}>결재완료</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 750,
                            padding: '2px 7px',
                            borderRadius: '3px',
                            background: r.paymentStatus === 'PAID' ? '#dcfce7' : r.paymentStatus === 'PARTIAL' ? '#fef3c7' : '#fee2e2',
                            color: r.paymentStatus === 'PAID' ? '#15803d' : r.paymentStatus === 'PARTIAL' ? '#b45309' : '#b91c1c'
                          }}>
                            {r.paymentStatus === 'PAID' ? '지급완료' : r.paymentStatus === 'PARTIAL' ? '일부지급' : '미결재'}
                          </span>
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: '12px' }}>
                          <span style={{
                            fontWeight: 700,
                            color: r.overdueDays > 90 ? '#b91c1c' : r.overdueDays > 60 ? '#c2410c' : '#475569'
                          }}>
                            {r.overdueDays}일
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '11.5px', color: '#64748b' }}>
                          {r.installments && r.installments.length > 0 ? (
                            <div>
                              <div style={{ fontWeight: 600, color: '#1e293b' }}>
                                {r.installments[r.installments.length - 1].date} ({r.currency === 'USD' ? `$${(r.installments[r.installments.length - 1].amount || 0).toLocaleString()}` : `₩${(r.installments[r.installments.length - 1].amount || 0).toLocaleString()}`})
                              </div>
                              <div style={{ fontSize: '10.5px' }}>
                                총 {r.installments.length}회차 분할 지급
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>-</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setQuickPaymentRecord(r);
                              setNewPaymentAmount(r.unpaidAmount > 0 ? r.unpaidAmount : 0);
                              setNewPaymentDate(new Date().toISOString().split('T')[0]);
                              setNewPaymentMethod('송금');
                              setNewPaymentNotes('');
                            }}
                            style={{
                              height: '28px',
                              padding: '0 10px',
                              background: r.paymentStatus === 'PAID' ? '#f1f5f9' : '#3b82f6',
                              color: r.paymentStatus === 'PAID' ? '#475569' : '#fff',
                              border: r.paymentStatus === 'PAID' ? '1px solid #cbd5e1' : 'none',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            {r.paymentStatus === 'PAID' ? '추가내역' : '💳 결재등록'}
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
      )}

      {/* ── QUICK PAYMENT REGISTRATION MODAL (결재/지급 등록 팝업) ── */}
      {quickPaymentRecord && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '4px',
            border: '1px solid #cbd5e1',
            boxShadow: '0 20px 40px rgba(15,23,42,0.2)',
            width: '560px',
            maxWidth: '90vw',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{ background: '#fafafa', padding: '14px 20px', borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>💳</span>
                <span style={{ fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>
                  공급처 대금 결재(지급) 등록
                </span>
              </div>
              <button
                type="button"
                onClick={() => setQuickPaymentRecord(null)}
                style={{ background: 'none', border: 'none', fontSize: '18px', color: '#94a3b8', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Target Info Banner */}
              <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '4px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>공급업체</span>
                  <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b' }}>{quickPaymentRecord.supplierName}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>관리번호 / 구분</span>
                  <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#2563eb' }}>
                    {quickPaymentRecord.docNumber} ({quickPaymentRecord.category || '공급사'})
                  </span>
                </div>
                <div style={{ borderTop: '1px dashed #cbd5e1', margin: '4px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>매입 총액</span>
                  <span style={{ fontSize: '13px', fontWeight: 700 }}>
                    {quickPaymentRecord.currency === 'USD' ? `$${quickPaymentRecord.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `₩${quickPaymentRecord.totalAmount.toLocaleString()}`}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>기지급액</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#16a34a' }}>
                    {quickPaymentRecord.currency === 'USD' ? `$${quickPaymentRecord.paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `₩${quickPaymentRecord.paidAmount.toLocaleString()}`}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', fontWeight: 750, color: '#ef4444' }}>잔여 미지급액</span>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: '#dc2626' }}>
                    {quickPaymentRecord.currency === 'USD' ? `$${quickPaymentRecord.unpaidAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `₩${quickPaymentRecord.unpaidAmount.toLocaleString()}`}
                  </span>
                </div>
              </div>

              {/* Form Fields */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>
                    지급(송금) 일자 <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="date"
                    value={newPaymentDate}
                    onChange={e => setNewPaymentDate(e.target.value)}
                    style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600, color: '#1e293b' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>
                    지급 방식
                  </label>
                  <select
                    value={newPaymentMethod}
                    onChange={e => setNewPaymentMethod(e.target.value as any)}
                    style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600, color: '#1e293b' }}
                  >
                    <option value="송금">계좌 송금 (계좌이체)</option>
                    <option value="카드">법인 카드 결제</option>
                    <option value="어음">전자어음 / 외담대</option>
                    <option value="현금">현금 지급</option>
                    <option value="기타">기타 정산</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>
                  이번 결재(지급) 금액 ({quickPaymentRecord.currency}) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="number"
                  step={quickPaymentRecord.currency === 'USD' ? '0.01' : '1'}
                  value={newPaymentAmount}
                  onChange={e => setNewPaymentAmount(parseFloat(e.target.value) || 0)}
                  style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '14px', fontWeight: 800, color: '#1e293b' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>
                  지급 메모 및 비고 (옵션)
                </label>
                <input
                  type="text"
                  placeholder="예: 우리은행 송금 완료, 세금계산서 수취 확인"
                  value={newPaymentNotes}
                  onChange={e => setNewPaymentNotes(e.target.value)}
                  style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600, color: '#1e293b' }}
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ background: '#fafafa', padding: '12px 20px', borderTop: '1px solid #cbd5e1', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setQuickPaymentRecord(null)}
                style={{
                  height: '34px',
                  padding: '0 16px',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  color: '#475569',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveQuickPayment}
                disabled={isSubmittingPayment}
                style={{
                  height: '34px',
                  padding: '0 18px',
                  background: '#3b82f6',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {isSubmittingPayment ? '저장 중...' : '💾 결재(지급) 저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SUPPLIER DETAIL MODAL (공급처 마스터 상세 및 계좌 확인/수정) ── */}
      {isSupplierModalOpen && (
        <SupplierModal
          initialSupplier={supplierForModal}
          onClose={() => setIsSupplierModalOpen(false)}
          onSave={() => setIsSupplierModalOpen(false)}
        />
      )}
    </div>
  );
};
