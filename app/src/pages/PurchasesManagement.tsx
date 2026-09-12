import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { collection, onSnapshot, doc, getDocs } from 'firebase/firestore';
import { db, COMPANY_ID } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import type { Supplier } from '../types/supplier';
import { SupplierModal } from '../components/SupplierModal';
import { cleanCompanyName } from '../utils/companyUtils';

// 단일 구매/매입 품목 상세 인터페이스
export interface PurchaseItemRecord {
  id: string; // 고유 레코드 식별자
  docId: string; // 소스 문서 ID (Order / Domestic / Import ID)
  sourceType: 'EXPORT_ITEM' | 'DOMESTIC_ITEM' | 'IMPORT_ITEM' | 'FORWARDER_FREIGHT';
  companyCode: 'YS' | 'YSACC';
  companyName: string;
  date: string; // 발주/구매 일자 (YYYY-MM-DD)
  docNumber: string; // CI Number, Order No, Trade No
  supplierName: string;
  supplierCode?: string;
  category: '공급사' | '포워딩사' | '국내매입처' | '해외공급사';
  itemName: string;
  itemSpec?: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalAmount: number;
  currency: 'USD' | 'KRW';
  taxType?: string; // 영세 / 과세 / 면세
  paymentStatus?: 'PAID' | 'PARTIAL' | 'UNPAID';
  remarks?: string;
  rawDoc?: any;
}

// 공급업체별 매입 집계 인터페이스
export interface SupplierPurchaseAggregate {
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
  totalItemsCount: number;
  totalPurchaseUsd: number;
  totalPurchaseKrw: number;
  primaryItems: string[];
  firstOrderDate: string;
  lastOrderDate: string;
  items: PurchaseItemRecord[];
}

// 품목별 매입 집계 인터페이스
export interface ProductPurchaseAggregate {
  itemKey: string;
  itemName: string;
  totalQty: number;
  unit: string;
  totalAmountUsd: number;
  totalAmountKrw: number;
  avgUnitPriceUsd: number;
  avgUnitPriceKrw: number;
  supplierNames: string[];
  purchaseCount: number;
  lastPurchaseDate: string;
}

export const PurchasesManagement: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  // 원시 데이터 상태
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [imports, setImports] = useState<any[]>([]);
  const [domesticTrades, setDomesticTrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 탭 상태: 'supplier' (업체별 구매집계) | 'items' (건별 상세 구매내역) | 'product' (품목별 매입분석)
  const [activeTab, setActiveTab] = useState<'supplier' | 'items' | 'product'>('supplier');

  // 필터 상태
  const [companyFilter, setCompanyFilter] = useState<'ALL' | 'YS' | 'YSACC'>('ALL');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'EXPORT_ITEM' | 'DOMESTIC_ITEM' | 'IMPORT_ITEM' | 'FORWARDER_FREIGHT'>('ALL');
  const [currencyFilter, setCurrencyFilter] = useState<'ALL' | 'USD' | 'KRW'>('ALL');
  const [exchangeRate, setExchangeRate] = useState<number>(1400);
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState<string>('ALL');
  const [periodFilter, setPeriodFilter] = useState<'ALL' | 'THIS_YEAR' | 'DAYS_90' | 'DAYS_365'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

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

  // 공급처 상세 모달
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [supplierForModal, setSupplierForModal] = useState<Supplier | undefined>(undefined);

  // ── Firestore 데이터 실시간 구독 ──
  useEffect(() => {
    setLoading(true);
    const compDoc = doc(db, 'companies', COMPANY_ID);

    // 1. Suppliers
    const unsubSupp = onSnapshot(collection(compDoc, 'suppliers'), snap => {
      const list: Supplier[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as Supplier));
      setSuppliers(list);
    }, err => console.error('Purchases suppliers err:', err));

    // 2. Orders (수출 소싱 원자재 및 포워더 운송)
    const unsubOrders = onSnapshot(collection(compDoc, 'orders'), snap => {
      const list: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setOrders(list);
    }, err => console.error('Purchases orders err:', err));

    // 3. Imports (수입 매입건)
    const unsubImports = onSnapshot(collection(compDoc, 'imports'), snap => {
      const list: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setImports(list);
    }, err => console.error('Purchases imports err:', err));

    // 4. Domestic Trades (국내 매입건)
    const unsubDom = onSnapshot(collection(compDoc, 'domesticTrades'), snap => {
      const list: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setDomesticTrades(list);
      setLoading(false);
    }, err => {
      console.error('Purchases domesticTrades err:', err);
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

  // ── 전체 건별 상세 구매 품목 정규화 ──
  const allPurchaseItems = useMemo<PurchaseItemRecord[]>(() => {
    const list: PurchaseItemRecord[] = [];

    const parseDateStr = (rawDate: any): string => {
      if (!rawDate) return '';
      if (typeof rawDate === 'string') return rawDate.substring(0, 10);
      if (rawDate?.toDate && typeof rawDate.toDate === 'function') {
        return rawDate.toDate().toISOString().substring(0, 10);
      }
      return '';
    };

    // A. 수출 주문 내 품목 (Orders -> items)
    orders.forEach(o => {
      const rawComp = String(o.issuingCompany || o.companyType || o.seller || o.myCompany || '').trim();
      const ciNoStr = String(o.ciNumber || o.piNumber || o.custPo || o.orderNo || o.id);
      const isYS = rawComp === 'YS' || rawComp === '영성ACC' || ciNoStr.startsWith('YS-') || String(o.id).startsWith('YS-');
      const orderDateStr = parseDateStr(o.orderDate || o.piDate || o.poDate || o.createdAt);

      if (Array.isArray(o.items)) {
        o.items.forEach((it: any, itemIdx: number) => {
          const supName = (it.supplier || it.supplierName || '').trim();
          if (!supName) return;

          const p = Number(it.buyingUnitPrice || it.purchasePrice || it.sourcingPrice || it.unitPrice || 0);
          const q = Number(it.qty || it.quantity || 0);
          const curr: 'USD' | 'KRW' = it.purchaseCurrency === 'KRW' || (it.currency === 'KRW' && !it.purchaseCurrency) ? 'KRW' : 'USD';
          const subTotal = p * q;
          const taxType = (o.supplierTaxTypes && o.supplierTaxTypes[supName]) || '영세';
          const vat = taxType === '영세' ? 0 : (curr === 'KRW' ? Math.round(subTotal * 0.1) : parseFloat((subTotal * 0.1).toFixed(2)));
          const totalAmt = subTotal + vat;

          const suppStatusObj = o.supplierPayments && o.supplierPayments[supName];
          const statusText = suppStatusObj?.status || '';
          const isPaid = statusText === '입금완료' || statusText === '결재완료' || statusText === '완료';

          list.push({
            id: `ord_${o.id}_it_${itemIdx}`,
            docId: o.id,
            sourceType: 'EXPORT_ITEM',
            companyCode: isYS ? 'YS' : 'YSACC',
            companyName: isYS ? '영성ACC' : '(주)와이에스에이씨씨',
            date: orderDateStr || '-',
            docNumber: ciNoStr,
            supplierName: supName,
            category: '공급사',
            itemName: it.name || it.productName || it.description || '원자재/부자재',
            itemSpec: it.grade || it.spec || it.specification || it.productCode || '-',
            quantity: q,
            unit: it.unit || 'EA',
            unitPrice: p,
            totalAmount: totalAmt,
            currency: curr,
            taxType,
            paymentStatus: isPaid ? 'PAID' : 'UNPAID',
            remarks: it.remarks || o.remarks || '',
            rawDoc: o
          });
        });
      }

      // 포워더 운송비
      if (Array.isArray(o.forwarders)) {
        o.forwarders.forEach((fw: any, fwIdx: number) => {
          const fwName = (fw.name || '').trim();
          if (!fwName) return;

          const isKrw = Boolean(fw.actualAmountKrw || fw.finalAmountKrw || fw.amountKrw);
          const curr: 'USD' | 'KRW' = isKrw ? 'KRW' : 'USD';
          const totAmt = isKrw
            ? Number(fw.finalAmountKrw || fw.actualAmountKrw || fw.amountKrw || 0)
            : Number(fw.finalAmountUsd || fw.actualAmountUsd || fw.budgetAmountUsd || fw.amountUsd || 0);

          if (totAmt <= 0) return;

          list.push({
            id: `ord_${o.id}_fw_${fwIdx}`,
            docId: o.id,
            sourceType: 'FORWARDER_FREIGHT',
            companyCode: isYS ? 'YS' : 'YSACC',
            companyName: isYS ? '영성ACC' : '(주)와이에스에이씨씨',
            date: orderDateStr || '-',
            docNumber: ciNoStr,
            supplierName: fwName,
            category: '포워딩사',
            itemName: '해상/항공 수출 운송비용 (Freight Charges)',
            itemSpec: fw.containerType || fw.shippingTerm || '포워딩 운임',
            quantity: 1,
            unit: '건',
            unitPrice: totAmt,
            totalAmount: totAmt,
            currency: curr,
            taxType: '영세',
            paymentStatus: fw.paymentStatus === 'PAID' ? 'PAID' : 'UNPAID',
            remarks: fw.remarks || '',
            rawDoc: o
          });
        });
      }
    });

    // B. 국내 매입 (Domestic Trades)
    domesticTrades.forEach(dom => {
      const supName = (dom.supplierName || '').trim();
      if (!supName) return;

      const totAmt = Number(dom.purchaseAmountActual || dom.buyingAmount || 0);
      const q = Number(dom.quantity || dom.qty || 1);
      const unitP = Number(dom.buyingPrice || (totAmt / (q || 1)) || 0);
      const rawComp = String(dom.companyType || '').trim();
      const trNoStr = String(dom.tradeNo || dom.id);
      const isYS = rawComp === 'YS' || rawComp === '영성ACC' || trNoStr.startsWith('YS-') || String(dom.id).startsWith('YS-');
      const dateStr = parseDateStr(dom.purchaseDate || dom.orderDate || dom.date || dom.createdAt);

      list.push({
        id: `dom_${dom.id}`,
        docId: dom.id,
        sourceType: 'DOMESTIC_ITEM',
        companyCode: isYS ? 'YS' : 'YSACC',
        companyName: isYS ? '영성ACC' : '(주)와이에스에이씨씨',
        date: dateStr || '-',
        docNumber: trNoStr,
        supplierName: supName,
        category: '국내매입처',
        itemName: dom.productName || dom.itemName || '국내 유통 매입 상품',
        itemSpec: dom.spec || dom.specification || '-',
        quantity: q,
        unit: dom.unit || 'EA',
        unitPrice: unitP,
        totalAmount: totAmt,
        currency: 'KRW',
        taxType: dom.taxInvoiceType === 'ISSUED' ? '과세' : '일반',
        paymentStatus: dom.purchaseSettled ? 'PAID' : 'UNPAID',
        remarks: dom.purchaseMemo || '',
        rawDoc: dom
      });
    });

    // C. 수입 주문 (Imports)
    imports.forEach(imp => {
      const supName = (imp.importerName || imp.supplierName || imp.exporter || imp.seller || '').trim();
      if (!supName) return;

      const rawComp = String(imp.importCompany || imp.companyType || imp.issuingCompany || '').trim();
      const invNoStr = String(imp.invoiceNo || imp.blNo || imp.importNo || imp.id);
      const isYS = rawComp === 'YS' || rawComp === '영성ACC' || invNoStr.startsWith('YS-') || String(imp.id).startsWith('YS-');
      const dateStr = parseDateStr(imp.importDate || imp.blDate || imp.createdAt);
      const curr: 'USD' | 'KRW' = imp.currency === 'KRW' ? 'KRW' : 'USD';

      if (Array.isArray(imp.piItems) && imp.piItems.length > 0) {
        imp.piItems.forEach((it: any, itemIdx: number) => {
          const q = Number(it.qty || it.quantity || 1);
          const p = Number(it.unitPrice || (Number(it.totalAmount || 0) / q) || 0);
          const tot = Number(it.totalAmount || (q * p) || 0);

          list.push({
            id: `imp_${imp.id}_it_${itemIdx}`,
            docId: imp.id,
            sourceType: 'IMPORT_ITEM',
            companyCode: isYS ? 'YS' : 'YSACC',
            companyName: isYS ? '영성ACC' : '(주)와이에스에이씨씨',
            date: dateStr || '-',
            docNumber: invNoStr,
            supplierName: supName,
            category: '해외공급사',
            itemName: it.name || it.itemName || it.description || '수입 수입품',
            itemSpec: it.spec || it.model || '-',
            quantity: q,
            unit: it.unit || 'EA',
            unitPrice: p,
            totalAmount: tot,
            currency: curr,
            taxType: '수입영세',
            paymentStatus: imp.supplierPaymentStatus === 'PAID' || imp.status === '완료' ? 'PAID' : 'UNPAID',
            remarks: imp.memo || '',
            rawDoc: imp
          });
        });
      } else {
        const totAmt = Number(imp.supplierCostUsd || imp.confirmedSupplierAmount || imp.totalAmount || imp.invoiceAmount || 0);
        if (totAmt > 0) {
          list.push({
            id: `imp_${imp.id}`,
            docId: imp.id,
            sourceType: 'IMPORT_ITEM',
            companyCode: isYS ? 'YS' : 'YSACC',
            companyName: isYS ? '영성ACC' : '(주)와이에스에이씨씨',
            date: dateStr || '-',
            docNumber: invNoStr,
            supplierName: supName,
            category: '해외공급사',
            itemName: imp.productName || imp.itemName || '해외 직수입 원부자재',
            itemSpec: imp.modelNo || '-',
            quantity: Number(imp.quantity || 1),
            unit: imp.unit || '건',
            unitPrice: totAmt,
            totalAmount: totAmt,
            currency: curr,
            taxType: '수입영세',
            paymentStatus: imp.supplierPaymentStatus === 'PAID' || imp.status === '완료' ? 'PAID' : 'UNPAID',
            remarks: imp.memo || '',
            rawDoc: imp
          });
        }
      }
    });

    // 최신 날짜순 정렬
    list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    return list;
  }, [orders, imports, domesticTrades]);

  // ── 필터링된 건별 상세 구매 내역 ──
  const filteredItems = useMemo<PurchaseItemRecord[]>(() => {
    const currentYear = new Date().getFullYear().toString();
    const today = new Date().getTime();

    return allPurchaseItems.filter(item => {
      // 1. 법인 필터
      if (companyFilter !== 'ALL' && item.companyCode !== companyFilter) return false;

      // 2. 부문 필터
      if (sourceFilter !== 'ALL' && item.sourceType !== sourceFilter) return false;

      // 2-1. 통화 구분 필터
      if (currencyFilter !== 'ALL' && item.currency !== currencyFilter) return false;

      // 3. 공급업체 필터
      if (selectedSupplierFilter !== 'ALL') {
        const cleanTarget = cleanCompanyName(selectedSupplierFilter).toLowerCase();
        const cleanSup = cleanCompanyName(item.supplierName).toLowerCase();
        if (cleanSup !== cleanTarget) return false;
      }

      // 4. 기간 필터
      if (periodFilter === 'THIS_YEAR') {
        if (!item.date.startsWith(currentYear)) return false;
      } else if (periodFilter === 'DAYS_90') {
        const d = new Date(item.date).getTime();
        if (!isNaN(d) && (today - d) > 90 * 24 * 60 * 60 * 1000) return false;
      } else if (periodFilter === 'DAYS_365') {
        const d = new Date(item.date).getTime();
        if (!isNaN(d) && (today - d) > 365 * 24 * 60 * 60 * 1000) return false;
      }

      // 5. 검색어
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const match =
          item.supplierName.toLowerCase().includes(q) ||
          item.itemName.toLowerCase().includes(q) ||
          (item.itemSpec && item.itemSpec.toLowerCase().includes(q)) ||
          item.docNumber.toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [allPurchaseItems, companyFilter, sourceFilter, currencyFilter, selectedSupplierFilter, periodFilter, searchTerm]);

  // ── 공급업체별 매입 집계 ──
  const supplierAggregates = useMemo<SupplierPurchaseAggregate[]>(() => {
    const map = new Map<string, SupplierPurchaseAggregate>();

    // 공급업체 마스터 맵
    const suppMasterMap = new Map<string, Supplier>();
    suppliers.forEach(s => {
      if (s.name) suppMasterMap.set(cleanCompanyName(s.name).toLowerCase(), s);
      if (s.supplierCode) suppMasterMap.set(s.supplierCode.toLowerCase(), s);
    });

    filteredItems.forEach(item => {
      const supKey = cleanCompanyName(item.supplierName).trim() || item.supplierName.trim();
      const supKeyLower = supKey.toLowerCase();
      const master = suppMasterMap.get(supKeyLower);

      if (!map.has(supKey)) {
        map.set(supKey, {
          supplierCode: master?.supplierCode || '-',
          supplierName: master?.name || item.supplierName,
          category: master?.category || item.category || '공급사',
          representative: master?.representative || '',
          bizNumber: master?.bizNumber || '',
          managerName: master?.managerName || '',
          managerPhone: master?.managerPhone || '',
          purchaseEmail: master?.purchaseEmail || '',
          bankKrw: master?.bankKrw || '',
          bankUsd: master?.bankUsd || '',
          totalOrdersCount: 0,
          totalItemsCount: 0,
          totalPurchaseUsd: 0,
          totalPurchaseKrw: 0,
          primaryItems: [],
          firstOrderDate: item.date,
          lastOrderDate: item.date,
          items: []
        });
      }

      const agg = map.get(supKey)!;
      agg.totalItemsCount += 1;
      agg.items.push(item);

      if (item.currency === 'KRW') {
        agg.totalPurchaseKrw += item.totalAmount;
      } else {
        agg.totalPurchaseUsd += item.totalAmount;
      }

      if (item.date && item.date !== '-') {
        if (!agg.lastOrderDate || item.date > agg.lastOrderDate) agg.lastOrderDate = item.date;
        if (!agg.firstOrderDate || item.date < agg.firstOrderDate) agg.firstOrderDate = item.date;
      }

      if (item.itemName && !agg.primaryItems.includes(item.itemName) && agg.primaryItems.length < 3) {
        agg.primaryItems.push(item.itemName);
      }
    });

    // 고유 주문(docNumber) 건수 산출
    const result = Array.from(map.values());
    result.forEach(agg => {
      const distinctDocs = new Set(agg.items.map(i => i.docNumber));
      agg.totalOrdersCount = distinctDocs.size;
    });

    // 매입총액 내림차순 정렬
    result.sort((a, b) => {
      const totA = a.totalPurchaseUsd + (exchangeRate > 0 ? a.totalPurchaseKrw / exchangeRate : 0);
      const totB = b.totalPurchaseUsd + (exchangeRate > 0 ? b.totalPurchaseKrw / exchangeRate : 0);
      return totB - totA;
    });

    return result;
  }, [filteredItems, suppliers, exchangeRate]);

  // ── 품목별 매입 집계 ──
  const productAggregates = useMemo<ProductPurchaseAggregate[]>(() => {
    const map = new Map<string, ProductPurchaseAggregate>();

    filteredItems.forEach(item => {
      const key = (item.itemName || '미지정 품목').trim();
      if (!map.has(key)) {
        map.set(key, {
          itemKey: key,
          itemName: key,
          totalQty: 0,
          unit: item.unit || 'EA',
          totalAmountUsd: 0,
          totalAmountKrw: 0,
          avgUnitPriceUsd: 0,
          avgUnitPriceKrw: 0,
          supplierNames: [],
          purchaseCount: 0,
          lastPurchaseDate: item.date
        });
      }

      const agg = map.get(key)!;
      agg.totalQty += item.quantity;
      agg.purchaseCount += 1;

      if (item.currency === 'KRW') {
        agg.totalAmountKrw += item.totalAmount;
      } else {
        agg.totalAmountUsd += item.totalAmount;
      }

      if (item.supplierName && !agg.supplierNames.includes(item.supplierName)) {
        agg.supplierNames.push(item.supplierName);
      }

      if (item.date && (!agg.lastPurchaseDate || item.date > agg.lastPurchaseDate)) {
        agg.lastPurchaseDate = item.date;
      }
    });

    const result = Array.from(map.values());
    result.forEach(agg => {
      if (agg.totalQty > 0) {
        agg.avgUnitPriceUsd = agg.totalAmountUsd > 0 ? parseFloat((agg.totalAmountUsd / agg.totalQty).toFixed(2)) : (exchangeRate > 0 ? parseFloat(((agg.totalAmountKrw / exchangeRate) / agg.totalQty).toFixed(2)) : 0);
        agg.avgUnitPriceKrw = agg.totalAmountKrw > 0 ? Math.round(agg.totalAmountKrw / agg.totalQty) : Math.round((agg.totalAmountUsd * exchangeRate) / agg.totalQty);
      }
    });

    // 구매 총액 내림차순 정렬
    result.sort((a, b) => {
      const totA = a.totalAmountUsd + (exchangeRate > 0 ? a.totalAmountKrw / exchangeRate : 0);
      const totB = b.totalAmountUsd + (exchangeRate > 0 ? b.totalAmountKrw / exchangeRate : 0);
      return totB - totA;
    });

    return result;
  }, [filteredItems, exchangeRate]);

  // ── 상단 종합 KPI ──
  const kpis = useMemo(() => {
    let totPurchaseUsd = 0;
    let totPurchaseKrw = 0;

    filteredItems.forEach(item => {
      if (item.currency === 'KRW') {
        totPurchaseKrw += item.totalAmount;
      } else {
        totPurchaseUsd += item.totalAmount;
      }
    });

    const totPurchaseCombinedKrw = totPurchaseKrw + Math.round(totPurchaseUsd * exchangeRate);
    const totPurchaseCombinedUsd = totPurchaseUsd + (exchangeRate > 0 ? parseFloat((totPurchaseKrw / exchangeRate).toFixed(2)) : 0);

    const distinctSuppliers = new Set(filteredItems.map(i => cleanCompanyName(i.supplierName).toLowerCase()));
    const distinctOrders = new Set(filteredItems.map(i => i.docNumber));

    return {
      totPurchaseUsd,
      totPurchaseKrw,
      totPurchaseCombinedUsd,
      totPurchaseCombinedKrw,
      suppliersCount: distinctSuppliers.size,
      ordersCount: distinctOrders.size,
      itemsCount: filteredItems.length
    };
  }, [filteredItems, exchangeRate]);

  // 공급업체 드롭다운용 목록
  const uniqueSupplierOptions = useMemo(() => {
    const list = Array.from(new Set(allPurchaseItems.map(i => cleanCompanyName(i.supplierName)).filter(Boolean))).sort();
    return list;
  }, [allPurchaseItems]);

  // ── 엑셀 내보내기 ──
  const handleExportExcel = () => {
    if (activeTab === 'supplier') {
      const rows = supplierAggregates.map((s, i) => ({
        'No': i + 1,
        '업체코드': s.supplierCode,
        '공급업체명': s.supplierName,
        '구분': s.category,
        '대표자': s.representative || '-',
        '담당자/연락처': `${s.managerName || '-'} / ${s.managerPhone || '-'}`,
        '발주건수': s.totalOrdersCount,
        '구매품목수': s.totalItemsCount,
        '총매입액(USD)': s.totalPurchaseUsd,
        '총매입액(KRW)': s.totalPurchaseKrw,
        '주요구매품목': s.primaryItems.join(', '),
        '최근구매일자': s.lastOrderDate || '-'
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '업체별구매집계');
      XLSX.writeFile(wb, `YSACC_공급업체별_구매내역_집계_${new Date().toISOString().split('T')[0]}.xlsx`);
    } else if (activeTab === 'items') {
      const rows = filteredItems.map((item, i) => ({
        'No': i + 1,
        '구매일자': item.date,
        '부문': item.sourceType === 'EXPORT_ITEM' ? '수출원자재' : item.sourceType === 'FORWARDER_FREIGHT' ? '포워딩운임' : item.sourceType === 'DOMESTIC_ITEM' ? '국내매입' : '수입매입',
        '법인': item.companyCode,
        '관리번호(CI/PO)': item.docNumber,
        '공급업체명': item.supplierName,
        '품목명': item.itemName,
        '규격/사양': item.itemSpec || '-',
        '수량': item.quantity,
        '단위': item.unit,
        '매입단가': item.unitPrice,
        '매입총액': item.totalAmount,
        '통화': item.currency,
        '과세구분': item.taxType || '영세',
        '결재상태': item.paymentStatus === 'PAID' ? '지급완료' : '미결재'
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '건별상세구매내역');
      XLSX.writeFile(wb, `YSACC_건별_상세구매내역_${new Date().toISOString().split('T')[0]}.xlsx`);
    } else {
      const rows = productAggregates.map((p, i) => ({
        'No': i + 1,
        '품목명': p.itemName,
        '총구매수량': p.totalQty,
        '단위': p.unit,
        '총매입액(USD)': p.totalAmountUsd,
        '총매입액(KRW)': p.totalAmountKrw,
        '평균단가(USD)': p.avgUnitPriceUsd,
        '평균단가(KRW)': p.avgUnitPriceKrw,
        '거래공급사': p.supplierNames.join(', '),
        '발주횟수': p.purchaseCount,
        '최근구매일': p.lastPurchaseDate
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '품목별구매분석');
      XLSX.writeFile(wb, `YSACC_품목별_구매분석_${new Date().toISOString().split('T')[0]}.xlsx`);
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
          <span style={{ fontSize: '24px' }}>📦</span>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>
              구매관리 : 매입관리 & 공급업체별 구매내역
            </h2>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
              수출 원자재 소싱, 국내 매입, 수입 구매, 포워딩 운송 등 전사 매입 및 각 공급업체별 누적 구매 내역 통합 관리
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
        {/* 1. 총 매입 발생액 */}
        <div style={{ background: '#fff', padding: '16px', borderRadius: '4px', border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>
            총 매입 발생액 (USD / KRW)
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#1e293b' }}>
            ${kpis.totPurchaseCombinedUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#059669' }}>
            ₩{kpis.totPurchaseCombinedKrw.toLocaleString()}
          </div>
        </div>

        {/* 2. 거래 공급업체 수 */}
        <div style={{ background: '#fff', padding: '16px', borderRadius: '4px', border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>
            거래 공급업체 수
          </div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#2563eb' }}>
            {kpis.suppliersCount} <span style={{ fontSize: '13px', fontWeight: 700 }}>개사</span>
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748b' }}>
            수출 원자재, 국내 매입처, 수입, 포워더
          </div>
        </div>

        {/* 3. 누적 발주/구매 건수 */}
        <div style={{ background: '#fff', padding: '16px', borderRadius: '4px', border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>
            누적 발주(주문) 건수
          </div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#16a34a' }}>
            {kpis.ordersCount} <span style={{ fontSize: '13px', fontWeight: 700 }}>건</span>
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748b' }}>
            수출/국내/수입 주문 연계
          </div>
        </div>

        {/* 4. 총 매입 품목 수 */}
        <div style={{ background: '#fff', padding: '16px', borderRadius: '4px', border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>
            총 매입/구매 품목 수
          </div>
          <div style={{ fontSize: '22px', fontWeight: 800, color: '#7c3aed' }}>
            {kpis.itemsCount} <span style={{ fontSize: '13px', fontWeight: 700 }}>개 라인</span>
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748b' }}>
            상세 원부자재 소싱 명세
          </div>
        </div>
      </div>

      {/* ── FILTER & SEARCH BAR ── */}
      <div style={{ background: '#fff', padding: '14px 20px', borderRadius: '4px', border: '1px solid #cbd5e1', display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center' }}>
        {/* 통화 구분 필터 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>통화 구분</label>
          <select
            value={currencyFilter}
            onChange={e => setCurrencyFilter(e.target.value as any)}
            style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 700, color: '#1e293b', background: currencyFilter !== 'ALL' ? '#eff6ff' : '#fff' }}
          >
            <option value="ALL">🌐 전체 통화 (USD / KRW)</option>
            <option value="USD">💵 USD (달러 전용)</option>
            <option value="KRW">🪙 KRW (원화 전용)</option>
          </select>
        </div>

        {/* 기준 환율 컨트롤 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>기준 환율 (USD/KRW)</label>
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
            <option value="EXPORT_ITEM">📦 수출 원자재/소싱</option>
            <option value="DOMESTIC_ITEM">🏬 국내 매입처</option>
            <option value="IMPORT_ITEM">⚓ 수입 공급사</option>
            <option value="FORWARDER_FREIGHT">🚢 포워딩 운임</option>
          </select>
        </div>

        {/* 공급업체 선택 필터 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '180px' }}>
          <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>공급업체 선택</label>
          <select
            value={selectedSupplierFilter}
            onChange={e => setSelectedSupplierFilter(e.target.value)}
            style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600, color: '#1e293b' }}
          >
            <option value="ALL">🏢 전체 공급업체 ({uniqueSupplierOptions.length}개사)</option>
            {uniqueSupplierOptions.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>

        {/* 기간 필터 */}
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

        {/* 검색어 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '220px' }}>
          <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>검색어 (업체명 / 품목명 / 규격 / 주문번호)</label>
          <input
            type="text"
            placeholder="공급업체, 품목명, 규격, 주문번호 검색..."
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
              setCurrencyFilter('ALL');
              setSelectedSupplierFilter('ALL');
              setPeriodFilter('ALL');
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

      {/* ── TAB NAVIGATION ── */}
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
          🏢 각 업체별 구매내역 종합
          <span style={{
            fontSize: '11px',
            padding: '2px 7px',
            borderRadius: '10px',
            background: activeTab === 'supplier' ? '#eff6ff' : '#e2e8f0',
            color: activeTab === 'supplier' ? '#2563eb' : '#64748b',
            fontWeight: 800
          }}>
            {supplierAggregates.length}개사
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
          📑 건별 상세 매입/구매 내역
          <span style={{
            fontSize: '11px',
            padding: '2px 7px',
            borderRadius: '10px',
            background: activeTab === 'items' ? '#eff6ff' : '#e2e8f0',
            color: activeTab === 'items' ? '#2563eb' : '#64748b',
            fontWeight: 800
          }}>
            {filteredItems.length}건
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('product')}
          style={{
            padding: '10px 20px',
            border: 'none',
            borderBottom: activeTab === 'product' ? '3px solid #3b82f6' : '3px solid transparent',
            background: activeTab === 'product' ? '#fff' : 'transparent',
            borderRadius: '4px 4px 0 0',
            fontSize: '14px',
            fontWeight: activeTab === 'product' ? 800 : 600,
            color: activeTab === 'product' ? '#2563eb' : '#64748b',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          📊 품목별 매입 분석
          <span style={{
            fontSize: '11px',
            padding: '2px 7px',
            borderRadius: '10px',
            background: activeTab === 'product' ? '#eff6ff' : '#e2e8f0',
            color: activeTab === 'product' ? '#2563eb' : '#64748b',
            fontWeight: 800
          }}>
            {productAggregates.length}개 품목
          </span>
        </button>
      </div>

      {/* ── TAB CONTENT ── */}
      {loading ? (
        <div style={{ background: '#fff', padding: '50px', textAlign: 'center', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#64748b' }}>매입 및 업체별 구매 데이터를 분석하고 있습니다...</div>
        </div>
      ) : activeTab === 'supplier' ? (
        /* TAB 1: 공급업체별 구매내역 종합 (Supplier Purchase Summary) */
        <div style={{ background: '#fff', borderRadius: '4px', border: '1px solid #cbd5e1', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ padding: '12px 18px', background: '#fafafa', borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b' }}>
              🏢 공급업체별 누적 구매액 및 거래 현황 (총 {supplierAggregates.length}개사)
            </span>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              공급업체명을 클릭하면 상세 정보(사업자/계좌/담당자)를 열람 및 수정할 수 있습니다.
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                  <th style={{ padding: '10px 10px', width: '45px', textAlign: 'center' }}>No</th>
                  <th style={{ padding: '10px 10px', width: '85px' }}>업체코드</th>
                  <th style={{ padding: '10px 12px' }}>공급업체명</th>
                  <th style={{ padding: '10px 10px', width: '85px', textAlign: 'center' }}>구분</th>
                  <th style={{ padding: '10px 12px', width: '150px' }}>담당자 / 계좌정보</th>
                  <th style={{ padding: '10px 10px', width: '80px', textAlign: 'center' }}>발주건수</th>
                  <th style={{ padding: '10px 10px', width: '80px', textAlign: 'center' }}>품목수</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>총 매입금액 (USD)</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>총 매입금액 (KRW)</th>
                  <th style={{ padding: '10px 12px', width: '180px' }}>주요 구매 품목</th>
                  <th style={{ padding: '10px 10px', textAlign: 'center', width: '100px' }}>최근 발주일</th>
                  <th style={{ padding: '10px 10px', textAlign: 'center', width: '90px' }}>관리</th>
                </tr>
              </thead>
              <tbody>
                {supplierAggregates.length === 0 ? (
                  <tr>
                    <td colSpan={12} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                      조회된 공급업체 구매 내역이 없습니다.
                    </td>
                  </tr>
                ) : (
                  supplierAggregates.map((s, idx) => {
                    const sTotUsd = s.totalPurchaseUsd + (exchangeRate > 0 ? s.totalPurchaseKrw / exchangeRate : 0);
                    const sTotKrw = Math.round(s.totalPurchaseKrw + (s.totalPurchaseUsd * exchangeRate));
                    return (
                    <tr
                      key={s.supplierName}
                      style={{ borderBottom: '1px solid #e2e8f0', background: '#fff' }}
                    >
                      <td style={{ padding: '10px 10px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                        {idx + 1}
                      </td>
                      <td style={{ padding: '10px 10px', fontWeight: 600, color: '#64748b' }}>
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
                            대표: {s.representative} {s.bizNumber && `(${s.bizNumber})`}
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
                      <td style={{ padding: '10px 12px', fontSize: '12px' }}>
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
                      <td style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 600, color: '#64748b' }}>
                        {s.totalItemsCount}개
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#1e293b' }}>
                        ${sTotUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        {s.totalPurchaseUsd === 0 && s.totalPurchaseKrw > 0 && (
                          <span style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 600, marginLeft: '4px' }}>(환산)</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#059669' }}>
                        ₩{sTotKrw.toLocaleString()}
                        {s.totalPurchaseKrw === 0 && s.totalPurchaseUsd > 0 && (
                          <span style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 600, marginLeft: '4px' }}>(환산)</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '12px', color: '#475569' }}>
                        {s.primaryItems.length > 0 ? (
                          <div title={s.primaryItems.join(', ')}>
                            {s.primaryItems.slice(0, 2).join(', ')}
                            {s.primaryItems.length > 2 && ` 외 ${s.primaryItems.length - 2}건`}
                          </div>
                        ) : '-'}
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'center', fontSize: '12px', color: '#64748b' }}>
                        {s.lastOrderDate || '-'}
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSupplierFilter(s.supplierName);
                            setActiveTab('items');
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
                          건별내역
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
      ) : activeTab === 'items' ? (
        /* TAB 2: 건별 상세 구매내역 (Itemized Purchase History) */
        <div style={{ background: '#fff', borderRadius: '4px', border: '1px solid #cbd5e1', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ padding: '12px 18px', background: '#fafafa', borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b' }}>
              📑 건별 상세 매입/구매 내역 (총 {filteredItems.length}건)
            </span>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              관리번호를 클릭하면 해당 주문서(수출/국내/수입) 상세 페이지로 이동합니다.
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                  <th style={{ padding: '10px 8px', width: '45px', textAlign: 'center' }}>No</th>
                  <th style={{ padding: '10px 8px', width: '90px' }}>구매일자</th>
                  <th style={{ padding: '10px 8px', width: '85px' }}>구분</th>
                  <th style={{ padding: '10px 8px', width: '70px' }}>법인</th>
                  <th style={{ padding: '10px 10px', width: '130px' }}>관리번호(CI/PO)</th>
                  <th style={{ padding: '10px 12px' }}>공급업체명</th>
                  <th style={{ padding: '10px 12px' }}>구매 품목명</th>
                  <th style={{ padding: '10px 10px', width: '110px' }}>규격/사양</th>
                  <th style={{ padding: '10px 10px', textAlign: 'right', width: '75px' }}>수량</th>
                  <th style={{ padding: '10px 10px', textAlign: 'right', width: '110px' }}>매입단가 (USD/KRW)</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', width: '130px' }}>매입총액 (USD/KRW)</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', width: '60px' }}>통화</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', width: '80px' }}>결재상태</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={13} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                      조회된 건별 상세 구매 내역이 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((it, idx) => {
                    const itUnitPriceUsd = it.currency === 'USD' ? it.unitPrice : (exchangeRate > 0 ? it.unitPrice / exchangeRate : 0);
                    const itUnitPriceKrw = Math.round(it.currency === 'KRW' ? it.unitPrice : it.unitPrice * exchangeRate);

                    const itTotalUsd = it.currency === 'USD' ? it.totalAmount : (exchangeRate > 0 ? it.totalAmount / exchangeRate : 0);
                    const itTotalKrw = Math.round(it.currency === 'KRW' ? it.totalAmount : it.totalAmount * exchangeRate);
                    return (
                    <tr
                      key={it.id}
                      style={{ borderBottom: '1px solid #e2e8f0', background: '#fff' }}
                    >
                      <td style={{ padding: '10px 8px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                        {idx + 1}
                      </td>
                      <td style={{ padding: '10px 8px', fontSize: '12.5px', color: '#475569' }}>
                        {it.date}
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '3px',
                          background: it.sourceType === 'EXPORT_ITEM' ? '#dbeafe' : it.sourceType === 'FORWARDER_FREIGHT' ? '#f3e8ff' : it.sourceType === 'DOMESTIC_ITEM' ? '#dcfce7' : '#e0f2fe',
                          color: it.sourceType === 'EXPORT_ITEM' ? '#1d4ed8' : it.sourceType === 'FORWARDER_FREIGHT' ? '#7e22ce' : it.sourceType === 'DOMESTIC_ITEM' ? '#15803d' : '#0369a1'
                        }}>
                          {it.sourceType === 'EXPORT_ITEM' ? '수출원자재' : it.sourceType === 'FORWARDER_FREIGHT' ? '포워딩운임' : it.sourceType === 'DOMESTIC_ITEM' ? '국내매입' : '수입매입'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 8px', fontSize: '12px', fontWeight: 600 }}>
                        {it.companyCode}
                      </td>
                      <td style={{ padding: '10px 10px' }}>
                        <button
                          type="button"
                          onClick={() => {
                            if (it.sourceType === 'EXPORT_ITEM' || it.sourceType === 'FORWARDER_FREIGHT') {
                              navigate(`/orders/${it.docId}`);
                            } else if (it.sourceType === 'DOMESTIC_ITEM') {
                              navigate('/domestic-orders');
                            } else {
                              navigate(`/imports/${it.docId}`);
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
                          {it.docNumber}
                        </button>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenSupplierModal(it.supplierName)}
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
                          {it.supplierName}
                        </button>
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1e293b' }}>
                        {it.itemName}
                      </td>
                      <td style={{ padding: '10px 10px', fontSize: '12px', color: '#64748b' }}>
                        {it.itemSpec || '-'}
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700 }}>
                        {it.quantity.toLocaleString()} <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>{it.unit}</span>
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, color: '#1e293b' }}>
                          ${itUnitPriceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>
                          ₩{itUnitPriceKrw.toLocaleString()}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, color: '#1e293b' }}>
                          ${itTotalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#059669', marginTop: '1px' }}>
                          ₩{itTotalKrw.toLocaleString()}
                        </div>
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: '12px', fontWeight: 700 }}>
                        {it.currency}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 750,
                          padding: '2px 6px',
                          borderRadius: '3px',
                          background: it.paymentStatus === 'PAID' ? '#dcfce7' : '#fee2e2',
                          color: it.paymentStatus === 'PAID' ? '#15803d' : '#b91c1c'
                        }}>
                          {it.paymentStatus === 'PAID' ? '지급완료' : '미결재'}
                        </span>
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
        /* TAB 3: 품목별 매입 분석 (Product Purchase Summary) */
        <div style={{ background: '#fff', borderRadius: '4px', border: '1px solid #cbd5e1', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ padding: '12px 18px', background: '#fafafa', borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b' }}>
              📊 품목별 누적 매입량 및 평균 단가 분석 (총 {productAggregates.length}개 품목)
            </span>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              주요 구매 원부자재별 총 구매 수량, 평균 매입 단가, 납품 공급사를 한눈에 파악할 수 있습니다.
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                  <th style={{ padding: '10px 10px', width: '45px', textAlign: 'center' }}>No</th>
                  <th style={{ padding: '10px 12px' }}>품목명</th>
                  <th style={{ padding: '10px 10px', textAlign: 'right', width: '100px' }}>총 구매수량</th>
                  <th style={{ padding: '10px 10px', textAlign: 'center', width: '60px' }}>단위</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>총 매입금액 (USD)</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>총 매입금액 (KRW)</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>평균 단가 (USD)</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>평균 단가 (KRW)</th>
                  <th style={{ padding: '10px 12px', width: '220px' }}>납품 공급사</th>
                  <th style={{ padding: '10px 10px', textAlign: 'center', width: '80px' }}>발주횟수</th>
                  <th style={{ padding: '10px 10px', textAlign: 'center', width: '100px' }}>최근 발주일</th>
                </tr>
              </thead>
              <tbody>
                {productAggregates.length === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                      조회된 품목 매입 데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  productAggregates.map((p, idx) => {
                    const pTotUsd = p.totalAmountUsd + (exchangeRate > 0 ? p.totalAmountKrw / exchangeRate : 0);
                    const pTotKrw = Math.round(p.totalAmountKrw + (p.totalAmountUsd * exchangeRate));
                    const pAvgUsd = p.totalQty > 0 ? parseFloat((pTotUsd / p.totalQty).toFixed(2)) : 0;
                    const pAvgKrw = p.totalQty > 0 ? Math.round(pTotKrw / p.totalQty) : 0;
                    return (
                    <tr
                      key={p.itemKey}
                      style={{ borderBottom: '1px solid #e2e8f0', background: '#fff' }}
                    >
                      <td style={{ padding: '10px 10px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                        {idx + 1}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 800, color: '#1e293b' }}>
                        {p.itemName}
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700 }}>
                        {p.totalQty.toLocaleString()}
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'center', color: '#64748b' }}>
                        {p.unit}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#1e293b' }}>
                        ${pTotUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        {p.totalAmountUsd === 0 && p.totalAmountKrw > 0 && (
                          <span style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 600, marginLeft: '4px' }}>(환산)</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#059669' }}>
                        ₩{pTotKrw.toLocaleString()}
                        {p.totalAmountKrw === 0 && p.totalAmountUsd > 0 && (
                          <span style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 600, marginLeft: '4px' }}>(환산)</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#475569', fontWeight: 700 }}>
                        ${pAvgUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#475569', fontWeight: 700 }}>
                        ₩{pAvgKrw.toLocaleString()}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '12px', color: '#2563eb' }}>
                        {p.supplierNames.join(', ')}
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 700 }}>
                        {p.purchaseCount}회
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'center', fontSize: '12px', color: '#64748b' }}>
                        {p.lastPurchaseDate || '-'}
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

      {/* ── SUPPLIER DETAIL MODAL (공급처 마스터 상세 팝업) ── */}
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
