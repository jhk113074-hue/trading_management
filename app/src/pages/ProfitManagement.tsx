import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db, COMPANY_ID } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

export interface ProfitItem {
  id: string;
  sourceType: 'EXPORT' | 'IMPORT';
  companyKey: 'YS' | 'YSACC';
  companyLabel: string;
  date: string;
  docNumber: string;
  customerName: string;
  itemName: string;
  currency: string;
  salesOriginal: number;
  exchangeRate: number;
  salesKrw: number;
  productCostKrw: number;
  expenseCostKrw: number;
  totalCostKrw: number;
  profitKrw: number;
  marginRate: number;
  status: string;
  manager: string;
  link: string;
  isThisMonth: boolean;
  year: string;
}

export const ProfitManagement: React.FC = () => {
  const { currentUser } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [imports, setImports] = useState<any[]>([]);
  const [pis, setPis] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ── 필터 상태 ──
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'EXPORT' | 'IMPORT'>('ALL');
  const [companyFilter, setCompanyFilter] = useState<'ALL' | 'YS' | 'YSACC'>('ALL');
  const [yearFilter, setYearFilter] = useState<string>(() => String(new Date().getFullYear()));
  const [monthFilter, setMonthFilter] = useState<string>('ALL');
  const [profitStatusFilter, setProfitStatusFilter] = useState<'ALL' | 'PROFIT' | 'LOSS' | 'HIGH_MARGIN'>('ALL');
  const [searchKeyword, setSearchKeyword] = useState('');

  // ── Firestore 실시간 구독 ──
  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);

    const compDoc = doc(db, 'companies', COMPANY_ID);

    // 1. Proforma Invoices
    const unsubPIs = onSnapshot(collection(compDoc, 'proformaInvoices'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));
      setPis(list);
    }, (err) => {
      console.error('ProfitManagement PIs error:', err);
    });

    // 2. Orders (수출)
    const unsubOrders = onSnapshot(collection(compDoc, 'orders'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));
      setOrders(list);
      setLoading(false);
    }, (err) => {
      console.error('ProfitManagement Orders error:', err);
      setLoading(false);
    });

    // 3. Imports (수입)
    const unsubImports = onSnapshot(collection(compDoc, 'imports'), (snapshot) => {
      const list: any[] = [];
      snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));
      setImports(list);
    }, (err) => {
      console.error('ProfitManagement Imports error:', err);
    });

    return () => {
      unsubPIs();
      unsubOrders();
      unsubImports();
    };
  }, [currentUser]);

  // ── 전체 손익 원시 데이터 집계 ──
  const allProfitItems = useMemo<ProfitItem[]>(() => {
    const now = new Date();
    const thisMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const list: ProfitItem[] = [];

    // 1. 수출(Orders) 손익 산출
    orders.forEach(o => {
      const etd = (o.etd || '').trim();
      if (!etd) return;

      const pi = pis.find(p => p.id === o.quotationId);
      const amount = Number(o.totalAmount) || Number(pi?.totalUsd) || 0;
      const rate = Number(o.customsExchangeRate) || Number(o.exchangeRate) || Number(pi?.exchangeRate) || 1350;
      const isKrwCurrency = o.currency === 'KRW';
      const salesKrw = isKrwCurrency ? amount : Math.round(amount * rate);
      const isYs = o.issuingCompany === 'YS';

      // 품목명 탐색 (Order.items -> name 우선)
      const orderItemNames = (o.items || [])
        .map((it: any) => (it?.name || it?.itemName || it?.description || it?.productCode || '').trim())
        .filter(Boolean);

      let itemName = '';
      if (orderItemNames.length > 0) {
        const firstName = orderItemNames[0];
        itemName = orderItemNames.length === 1 ? firstName : `${firstName} 외 ${orderItemNames.length - 1}건`;
      } else if (pi?.itemsSummary && pi.itemsSummary.length > 0) {
        const firstName = String(pi.itemsSummary[0] || '').trim();
        if (firstName) {
          itemName = pi.itemsSummary.length === 1 ? firstName : `${firstName} 외 ${pi.itemsSummary.length - 1}건`;
        }
      } else if (pi?.items && (pi.items as any).length > 0) {
        const piNames = (pi.items as any)
          .map((it: any) => (it?.name || it?.itemName || it?.description || '').trim())
          .filter(Boolean);
        if (piNames.length > 0) {
          const firstName = piNames[0];
          itemName = piNames.length === 1 ? firstName : `${firstName} 외 ${piNames.length - 1}건`;
        }
      }
      if (!itemName) {
        itemName = (o as any).itemName || (o as any).productName || o.custPo || '수출 품목';
      }

      // 수출 매입원가(제품 구매비용) 계산
      const itemsList = o.sourcingItems && o.sourcingItems.length > 0 ? o.sourcingItems : (o.items || []);
      let productCostKrw = 0;
      itemsList.forEach((it: any) => {
        const qty = Number(it.qty) || Number(it.quantity) || 0;
        const pPrice = Number(it.purchaseUnitPrice) || Number(it.purchasePriceUsd) || Number(it.purchasePriceKrw) || Number(it.purchasePrice) || 0;
        const pCurr = it.purchaseUnitCurrency || it.purchasePriceCurrency || (it.purchasePriceKrw ? 'KRW' : 'USD');
        if (pCurr === 'KRW') {
          productCostKrw += pPrice * qty;
        } else {
          productCostKrw += Math.round((pPrice * qty) * rate);
        }
      });

      // 수출 부대비용 (포워더 운임/세금계산서 + 은행수수료)
      let forwarderCostKrw = 0;
      if (Array.isArray(o.forwarders)) {
        o.forwarders.forEach((fw: any) => {
          if (fw.taxInvoices && fw.taxInvoices.length > 0) {
            fw.taxInvoices.forEach((inv: any) => {
              const sup = Number(inv.supplyValue) || Number(inv.amount) || 0;
              forwarderCostKrw += sup;
            });
          } else {
            const usd = fw.freightCurrency === 'USD' ? (Number(fw.freightAmount) || 0) : 0;
            const krw = (Number(fw.amountKrw) || 0) + (fw.freightCurrency === 'KRW' ? (Number(fw.freightAmount) || 0) : 0);
            forwarderCostKrw += krw + Math.round(usd * rate);
          }
        });
      }

      let bankChargesKrw = 0;
      if (Array.isArray(o.bankCharges)) {
        bankChargesKrw = o.bankCharges.reduce((sum: number, bc: any) => sum + (Number(bc.amount) || 0), 0);
      }

      const expenseCostKrw = forwarderCostKrw + bankChargesKrw;
      const totalCostKrw = productCostKrw + expenseCostKrw;
      const profitKrw = salesKrw - totalCostKrw;
      const marginRate = salesKrw > 0 ? (profitKrw / salesKrw) * 100 : 0;

      const year = etd.substring(0, 4);

      list.push({
        id: o.id,
        sourceType: 'EXPORT',
        companyKey: isYs ? 'YS' : 'YSACC',
        companyLabel: isYs ? '영성ACC' : '(주)YSACC',
        date: etd,
        docNumber: o.ciNumber || o.custPo || o.orderNumber || o.id,
        customerName: o.customer || o.buyer || '-',
        itemName: itemName || '-',
        currency: isKrwCurrency ? 'KRW' : 'USD',
        salesOriginal: amount,
        exchangeRate: rate,
        salesKrw,
        productCostKrw,
        expenseCostKrw,
        totalCostKrw,
        profitKrw,
        marginRate,
        status: o.status || '선적관리',
        manager: o.manager || '-',
        link: `/orders/${o.id}?tab=정산/결제`,
        isThisMonth: etd.startsWith(thisMonthStr),
        year
      });
    });

    // 2. 수입(Imports) 손익 산출
    imports.forEach(req => {
      const dateStr = req.eta || req.requestDate || '';
      if (!dateStr) return;

      const actualTaxSales = req.taxDocumentRows && req.taxDocumentRows.length > 0
        ? req.taxDocumentRows.reduce((sum: number, row: any) => sum + (Number(row.supplyAmount) || 0), 0)
        : 0;
      const salesKrw = actualTaxSales > 0 ? actualTaxSales : (Number(req.customerQuoteAmount) || Number(req.amount) || 0);

      // 수입주체 판정 규칙
      const isYsacc = !req.importCompany || req.importCompany === 'YSACC' || req.importCompany === 'YS';
      const isYs = !isYsacc;

      const rate = Number(req.costBreakdown?.appliedExchangeRate) || 1350;

      // 수입 물품대(매입원가)
      let productCostKrw = (req.importTaxDocumentRows || []).reduce((sum: number, r: any) => sum + (Number(r.supplyAmount) || 0), 0) || Number(req.taxAmount) || 0;
      if (productCostKrw === 0) {
        const buyingQty = Number(req.costBreakdown?.buyingQty) || 0;
        const buyingPriceUsd = Number(req.costBreakdown?.buyingPriceUsd) || 0;
        let totalBuyingUsd = buyingQty * buyingPriceUsd;
        if (totalBuyingUsd === 0 && req.piItems && req.piItems.length > 0) {
          totalBuyingUsd = req.piItems.reduce((s: number, it: any) => s + ((Number(it.qty) || 0) * (Number(it.unitPrice) || 0)), 0);
        }
        productCostKrw = Math.round(totalBuyingUsd * rate);
      }

      // 수입 부대비용 (운송비 + 통관/관세비 등)
      const freightCostKrw = (req.freightTaxDocumentRows || []).reduce((sum: number, r: any) => sum + (Number(r.supplyAmount) || 0), 0) || Number(req.freightAmount) || Number(req.costBreakdown?.freightCost) || 0;
      const customsCostKrw = (req.customsTaxDocumentRows || []).reduce((sum: number, r: any) => sum + (Number(r.supplyAmount) || 0), 0) || Number(req.customsTaxAmount) || Number(req.costBreakdown?.customsCost) || 0;
      const expenseCostKrw = freightCostKrw + customsCostKrw;

      let totalCostKrw = productCostKrw + expenseCostKrw;
      let profitKrw = salesKrw - totalCostKrw;

      // 만약 정산 시 명시적인 marginAmount가 있고 원가 계산이 0이었던 경우 보정
      if (totalCostKrw === 0 && Number(req.marginAmount) > 0) {
        profitKrw = Number(req.marginAmount);
        totalCostKrw = Math.max(0, salesKrw - profitKrw);
      }

      const marginRate = salesKrw > 0 ? (profitKrw / salesKrw) * 100 : 0;

      // 품목명
      const importItemNames = (req.piItems || [])
        .map((it: any) => (it?.name || it?.itemName || it?.description || '').trim())
        .filter(Boolean);

      let itemName = (req.itemName || '').trim();
      if (!itemName && importItemNames.length > 0) {
        const firstName = importItemNames[0];
        itemName = importItemNames.length === 1 ? firstName : `${firstName} 외 ${importItemNames.length - 1}건`;
      }
      if (!itemName) {
        itemName = req.piItemName || req.dealStatementItem || (req.poNumber ? `수입 (${req.poNumber})` : '수입 품목');
      }

      const year = dateStr.substring(0, 4);

      list.push({
        id: req.id,
        sourceType: 'IMPORT',
        companyKey: isYsacc ? 'YSACC' : 'YS',
        companyLabel: isYsacc ? '(주)YSACC' : '영성ACC',
        date: dateStr,
        docNumber: req.poNumber || req.id,
        customerName: req.finalCustomer || req.importerName || req.customerName || '-',
        itemName: itemName || '-',
        currency: 'KRW',
        salesOriginal: salesKrw,
        exchangeRate: rate,
        salesKrw,
        productCostKrw,
        expenseCostKrw,
        totalCostKrw,
        profitKrw,
        marginRate,
        status: req.customerDecision || req.stage || '수입완료',
        manager: req.manager || req.managerName || '-',
        link: `/imports/${req.id}?tab=손익검토`,
        isThisMonth: dateStr.startsWith(thisMonthStr),
        year
      });
    });

    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [orders, imports, pis]);

  // ── 연도 목록 추출 ──
  const availableYears = useMemo(() => {
    const yearsSet = new Set<string>();
    const currentYr = String(new Date().getFullYear());
    yearsSet.add(currentYr);
    allProfitItems.forEach(item => {
      if (item.year && item.year.length === 4) {
        yearsSet.add(item.year);
      }
    });
    return Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
  }, [allProfitItems]);

  // ── 필터링된 손익 리스트 ──
  const filteredItems = useMemo(() => {
    return allProfitItems.filter(item => {
      // 1. 구분
      if (typeFilter !== 'ALL' && item.sourceType !== typeFilter) return false;
      // 2. 업체
      if (companyFilter !== 'ALL' && item.companyKey !== companyFilter) return false;
      // 3. 연도
      if (yearFilter !== 'ALL' && item.year !== yearFilter) return false;
      // 4. 월
      if (monthFilter !== 'ALL') {
        const itemMonth = item.date.substring(5, 7);
        if (itemMonth !== monthFilter) return false;
      }
      // 5. 손익 상태
      if (profitStatusFilter === 'PROFIT' && item.profitKrw <= 0) return false;
      if (profitStatusFilter === 'LOSS' && item.profitKrw > 0) return false;
      if (profitStatusFilter === 'HIGH_MARGIN' && item.marginRate < 15) return false;
      // 6. 검색어
      if (searchKeyword.trim()) {
        const q = searchKeyword.trim().toLowerCase();
        const matches =
          item.customerName.toLowerCase().includes(q) ||
          item.docNumber.toLowerCase().includes(q) ||
          item.itemName.toLowerCase().includes(q) ||
          item.manager.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [allProfitItems, typeFilter, companyFilter, yearFilter, monthFilter, profitStatusFilter, searchKeyword]);

  // ── KPI 통계 요약 ──
  const kpiSummary = useMemo(() => {
    let totalSalesKrw = 0;
    let totalProductCostKrw = 0;
    let totalExpenseCostKrw = 0;
    let totalCostKrw = 0;
    let totalProfitKrw = 0;

    let exportCount = 0;
    let exportSalesKrw = 0;
    let exportProfitKrw = 0;

    let importCount = 0;
    let importSalesKrw = 0;
    let importProfitKrw = 0;

    let profitCases = 0;
    let lossCases = 0;

    filteredItems.forEach(it => {
      totalSalesKrw += it.salesKrw;
      totalProductCostKrw += it.productCostKrw;
      totalExpenseCostKrw += it.expenseCostKrw;
      totalCostKrw += it.totalCostKrw;
      totalProfitKrw += it.profitKrw;

      if (it.sourceType === 'EXPORT') {
        exportCount++;
        exportSalesKrw += it.salesKrw;
        exportProfitKrw += it.profitKrw;
      } else {
        importCount++;
        importSalesKrw += it.salesKrw;
        importProfitKrw += it.profitKrw;
      }

      if (it.profitKrw > 0) {
        profitCases++;
      } else if (it.profitKrw < 0) {
        lossCases++;
      }
    });

    const overallMargin = totalSalesKrw > 0 ? (totalProfitKrw / totalSalesKrw) * 100 : 0;
    const exportMargin = exportSalesKrw > 0 ? (exportProfitKrw / exportSalesKrw) * 100 : 0;
    const importMargin = importSalesKrw > 0 ? (importProfitKrw / importSalesKrw) * 100 : 0;

    return {
      totalCount: filteredItems.length,
      totalSalesKrw,
      totalProductCostKrw,
      totalExpenseCostKrw,
      totalCostKrw,
      totalProfitKrw,
      overallMargin,
      exportCount,
      exportSalesKrw,
      exportProfitKrw,
      exportMargin,
      importCount,
      importSalesKrw,
      importProfitKrw,
      importMargin,
      profitCases,
      lossCases
    };
  }, [filteredItems]);

  // ── 엑셀 다운로드 핸들러 ──
  const handleExportExcel = () => {
    if (filteredItems.length === 0) {
      alert('다운로드할 데이터가 없습니다.');
      return;
    }

    const excelRows: any[] = filteredItems.map((item, idx) => ({
      'No': idx + 1,
      '구분': item.sourceType === 'EXPORT' ? '수출' : '수입',
      '소속업체': item.companyLabel,
      '일자(ETD/ETA)': item.date,
      '관리번호': item.docNumber,
      '거래처/고객사': item.customerName,
      '대표품목명': item.itemName,
      '원통화': item.currency,
      '원금액': item.currency === 'KRW' ? Math.round(item.salesOriginal) : Number(item.salesOriginal.toFixed(2)),
      '적용환율': item.exchangeRate,
      '매출액(KRW)': Math.round(item.salesKrw),
      '매입원가(KRW)': Math.round(item.productCostKrw),
      '부대비용(KRW)': Math.round(item.expenseCostKrw),
      '총원가(KRW)': Math.round(item.totalCostKrw),
      '이익금(KRW)': Math.round(item.profitKrw),
      '이익률(%)': Number(item.marginRate.toFixed(2)),
      '진행상태': item.status,
      '담당자': item.manager
    }));

    // 합계 행 추가
    excelRows.push({
      'No': '합계',
      '구분': `총 ${kpiSummary.totalCount}건`,
      '소속업체': `수출 ${kpiSummary.exportCount}건 / 수입 ${kpiSummary.importCount}건`,
      '일자(ETD/ETA)': '',
      '관리번호': '',
      '거래처/고객사': '',
      '대표품목명': '',
      '원통화': '',
      '원금액': 0,
      '적용환율': 0,
      '매출액(KRW)': Math.round(kpiSummary.totalSalesKrw),
      '매입원가(KRW)': Math.round(kpiSummary.totalProductCostKrw),
      '부대비용(KRW)': Math.round(kpiSummary.totalExpenseCostKrw),
      '총원가(KRW)': Math.round(kpiSummary.totalCostKrw),
      '이익금(KRW)': Math.round(kpiSummary.totalProfitKrw),
      '이익률(%)': Number(kpiSummary.overallMargin.toFixed(2)),
      '진행상태': '',
      '담당자': ''
    });

    const worksheet = XLSX.utils.json_to_sheet(excelRows);
    worksheet['!cols'] = [
      { wch: 6 },  // No
      { wch: 8 },  // 구분
      { wch: 12 }, // 소속업체
      { wch: 13 }, // 일자
      { wch: 18 }, // 관리번호
      { wch: 22 }, // 거래처
      { wch: 30 }, // 품목명
      { wch: 8 },  // 통화
      { wch: 14 }, // 원금액
      { wch: 10 }, // 환율
      { wch: 16 }, // 매출액
      { wch: 16 }, // 매입원가
      { wch: 14 }, // 부대비용
      { wch: 16 }, // 총원가
      { wch: 16 }, // 이익금
      { wch: 10 }, // 이익률
      { wch: 12 }, // 상태
      { wch: 10 }  // 담당자
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '손익분석');

    const todayStr = new Date().toISOString().split('T')[0];
    const fileSuffix = `${companyFilter !== 'ALL' ? companyFilter + '_' : ''}${typeFilter !== 'ALL' ? typeFilter + '_' : ''}${yearFilter}년`;
    XLSX.writeFile(workbook, `YSACC_건별_이익관리_${fileSuffix}_${todayStr}.xlsx`);
  };

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1750px', margin: '0 auto' }}>
      
      {/* ── 상단 헤더 ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '22px', fontWeight: 850, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
              📊 무역 통합 이익관리 (건별 손익 분석)
            </h1>
            <span style={{ fontSize: '11px', fontWeight: 800, padding: '3px 8px', borderRadius: '4px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
              수출·수입 실시간 손익
            </span>
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
            수출(Orders) 및 수입(Imports) 전 건의 매출액, 매입원가, 부대비용, 순 이익금 및 마진율을 실시간으로 추적·관리합니다.
          </p>
        </div>

        {/* 우측 액션: 엑셀 다운로드 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={handleExportExcel}
            style={{
              height: '34px',
              padding: '0 14px',
              background: '#059669',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              transition: 'background 0.15s'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#047857'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#059669'; }}
          >
            <span>📥</span> 엑셀 다운로드
          </button>
        </div>
      </div>

      {/* ── 4대 핵심 손익 종합 요약 카드 (KPI Grid) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '22px' }}>
        
        {/* 1. 총 매출액 */}
        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '16px 18px', boxShadow: '0 2px 4px rgba(15,23,42,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em' }}>총 매출액 (Revenue)</span>
            <span style={{ fontSize: '13px' }}>💳</span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>
            ₩{Math.round(kpiSummary.totalSalesKrw).toLocaleString()}
          </div>
          <div style={{ marginTop: '6px', fontSize: '11.5px', color: '#64748b', display: 'flex', gap: '8px' }}>
            <span>수출: <strong style={{ color: '#2563eb' }}>₩{Math.round(kpiSummary.exportSalesKrw).toLocaleString()}</strong></span>
            <span style={{ color: '#cbd5e1' }}>|</span>
            <span>수입: <strong style={{ color: '#059669' }}>₩{Math.round(kpiSummary.importSalesKrw).toLocaleString()}</strong></span>
          </div>
        </div>

        {/* 2. 총 원가 (매입 + 부대비용) */}
        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '16px 18px', boxShadow: '0 2px 4px rgba(15,23,42,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em' }}>총 원가 및 부대비용</span>
            <span style={{ fontSize: '13px' }}>📦</span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#475569', letterSpacing: '-0.02em' }}>
            ₩{Math.round(kpiSummary.totalCostKrw).toLocaleString()}
          </div>
          <div style={{ marginTop: '6px', fontSize: '11.5px', color: '#64748b', display: 'flex', gap: '8px' }}>
            <span>제품매입: <strong>₩{Math.round(kpiSummary.totalProductCostKrw).toLocaleString()}</strong></span>
            <span style={{ color: '#cbd5e1' }}>|</span>
            <span>부대비용: <strong>₩{Math.round(kpiSummary.totalExpenseCostKrw).toLocaleString()}</strong></span>
          </div>
        </div>

        {/* 3. 총 이익금 (순 손익) */}
        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '16px 18px', boxShadow: '0 2px 4px rgba(15,23,42,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em' }}>총 이익금 (Gross Profit)</span>
            <span style={{ fontSize: '13px' }}>📈</span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: kpiSummary.totalProfitKrw >= 0 ? '#16a34a' : '#dc2626', letterSpacing: '-0.02em' }}>
            ₩{Math.round(kpiSummary.totalProfitKrw).toLocaleString()}
          </div>
          <div style={{ marginTop: '6px', fontSize: '11.5px', color: '#64748b', display: 'flex', gap: '8px' }}>
            <span>수출이익: <strong style={{ color: kpiSummary.exportProfitKrw >= 0 ? '#16a34a' : '#dc2626' }}>₩{Math.round(kpiSummary.exportProfitKrw).toLocaleString()}</strong></span>
            <span style={{ color: '#cbd5e1' }}>|</span>
            <span>수입이익: <strong style={{ color: kpiSummary.importProfitKrw >= 0 ? '#16a34a' : '#dc2626' }}>₩{Math.round(kpiSummary.importProfitKrw).toLocaleString()}</strong></span>
          </div>
        </div>

        {/* 4. 평균 마진율 & 건수 */}
        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '16px 18px', boxShadow: '0 2px 4px rgba(15,23,42,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em' }}>평균 이익률 (Margin Rate)</span>
            <span style={{ fontSize: '13px' }}>🎯</span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: kpiSummary.overallMargin >= 10 ? '#16a34a' : (kpiSummary.overallMargin > 0 ? '#2563eb' : '#dc2626'), letterSpacing: '-0.02em' }}>
            {kpiSummary.overallMargin.toFixed(1)}%
          </div>
          <div style={{ marginTop: '6px', fontSize: '11.5px', color: '#64748b', display: 'flex', gap: '8px' }}>
            <span>총 <strong style={{ color: '#0f172a' }}>{kpiSummary.totalCount}</strong>건</span>
            <span style={{ color: '#cbd5e1' }}>|</span>
            <span>흑자: <strong style={{ color: '#16a34a' }}>{kpiSummary.profitCases}</strong>건</span>
            {kpiSummary.lossCases > 0 && (
              <>
                <span style={{ color: '#cbd5e1' }}>|</span>
                <span>적자: <strong style={{ color: '#dc2626' }}>{kpiSummary.lossCases}</strong>건</span>
              </>
            )}
          </div>
        </div>

      </div>

      {/* ── 컨트롤 바 (필터 및 검색 도구) ── */}
      <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '14px 18px', marginBottom: '18px', display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'flex-end' }}>
          
          {/* 구분 필터 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em' }}>구분</label>
            <div style={{ display: 'flex', border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden', height: '34px' }}>
              {[
                { key: 'ALL', label: '전체' },
                { key: 'EXPORT', label: '수출 🚢' },
                { key: 'IMPORT', label: '수입 🛬' }
              ].map(btn => (
                <button
                  key={btn.key}
                  type="button"
                  onClick={() => setTypeFilter(btn.key as any)}
                  style={{
                    padding: '0 12px',
                    border: 'none',
                    borderRight: btn.key !== 'IMPORT' ? '1px solid #cbd5e1' : 'none',
                    background: typeFilter === btn.key ? '#3b82f6' : '#fff',
                    color: typeFilter === btn.key ? '#fff' : '#475569',
                    fontSize: '12.5px',
                    fontWeight: typeFilter === btn.key ? 800 : 600,
                    cursor: 'pointer'
                  }}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          {/* 소속업체 필터 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em' }}>소속업체</label>
            <div style={{ display: 'flex', border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden', height: '34px' }}>
              {[
                { key: 'ALL', label: '전체' },
                { key: 'YS', label: '영성ACC' },
                { key: 'YSACC', label: '(주)YSACC' }
              ].map(btn => (
                <button
                  key={btn.key}
                  type="button"
                  onClick={() => setCompanyFilter(btn.key as any)}
                  style={{
                    padding: '0 12px',
                    border: 'none',
                    borderRight: btn.key !== 'YSACC' ? '1px solid #cbd5e1' : 'none',
                    background: companyFilter === btn.key ? '#1e293b' : '#fff',
                    color: companyFilter === btn.key ? '#fff' : '#475569',
                    fontSize: '12.5px',
                    fontWeight: companyFilter === btn.key ? 800 : 600,
                    cursor: 'pointer'
                  }}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          {/* 연도 필터 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em' }}>연도</label>
            <select
              value={yearFilter}
              onChange={e => setYearFilter(e.target.value)}
              style={{
                height: '34px',
                padding: '0 10px',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#1e293b',
                background: '#fff',
                outline: 'none',
                minWidth: '100px'
              }}
            >
              <option value="ALL">전체 연도</option>
              {availableYears.map(yr => (
                <option key={yr} value={yr}>{yr}년</option>
              ))}
            </select>
          </div>

          {/* 월 필터 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em' }}>월</label>
            <select
              value={monthFilter}
              onChange={e => setMonthFilter(e.target.value)}
              style={{
                height: '34px',
                padding: '0 10px',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#1e293b',
                background: '#fff',
                outline: 'none',
                minWidth: '90px'
              }}
            >
              <option value="ALL">전체 월</option>
              {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(m => (
                <option key={m} value={m}>{parseInt(m, 10)}월</option>
              ))}
            </select>
          </div>

          {/* 손익 상태 필터 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em' }}>손익 상태</label>
            <select
              value={profitStatusFilter}
              onChange={e => setProfitStatusFilter(e.target.value as any)}
              style={{
                height: '34px',
                padding: '0 10px',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#1e293b',
                background: '#fff',
                outline: 'none',
                minWidth: '125px'
              }}
            >
              <option value="ALL">전체 손익</option>
              <option value="PROFIT">🟢 흑자 건만</option>
              <option value="HIGH_MARGIN">⭐ 고마진 (15% 이상)</option>
              <option value="LOSS">🔴 적자/손실 건만</option>
            </select>
          </div>

        </div>

        {/* 검색창 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '260px', flex: '1 1 260px', maxWidth: '380px' }}>
          <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em' }}>검색 (고객사, 관리번호, 품목, 담당자)</label>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
              placeholder="고객사/바이어, 관리번호, 품목명, 담당자 검색..."
              style={{
                width: '100%',
                height: '34px',
                padding: '0 30px 0 10px',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#1e293b',
                background: '#fff',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            {searchKeyword && (
              <button
                type="button"
                onClick={() => setSearchKeyword('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

      </div>

      {/* ── 건별 손익 테이블 영역 ── */}
      <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(15,23,42,0.04)' }}>
        
        {/* 테이블 안내 바 */}
        <div style={{ padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12.5px', color: '#475569' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span>조회 건수: <strong style={{ color: '#0f172a' }}>{filteredItems.length}</strong>건</span>
            <span style={{ color: '#cbd5e1' }}>|</span>
            <span>수출: <strong style={{ color: '#2563eb' }}>{kpiSummary.exportCount}</strong>건</span>
            <span style={{ color: '#cbd5e1' }}>|</span>
            <span>수입: <strong style={{ color: '#059669' }}>{kpiSummary.importCount}</strong>건</span>
          </div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            💡 관리번호를 클릭하면 해당 건의 상세/손익 페이지가 새 창으로 열립니다.
          </div>
        </div>

        {/* 테이블 본체 */}
        <div style={{ overflowX: 'auto', maxHeight: '68vh' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 5, background: '#f8fafc' }}>
              <tr>
                <th style={{ fontSize: '12.5px', fontWeight: 750, color: '#475569', background: '#f8fafc', borderBottom: '1px solid #cbd5e1', padding: '10px 8px', textAlign: 'center', width: '45px' }}>No</th>
                <th style={{ fontSize: '12.5px', fontWeight: 750, color: '#475569', background: '#f8fafc', borderBottom: '1px solid #cbd5e1', padding: '10px 8px', textAlign: 'center', width: '70px' }}>구분</th>
                <th style={{ fontSize: '12.5px', fontWeight: 750, color: '#475569', background: '#f8fafc', borderBottom: '1px solid #cbd5e1', padding: '10px 8px', textAlign: 'center', width: '85px' }}>업체</th>
                <th style={{ fontSize: '12.5px', fontWeight: 750, color: '#475569', background: '#f8fafc', borderBottom: '1px solid #cbd5e1', padding: '10px 8px', textAlign: 'center', width: '95px' }}>일자(ETD/ETA)</th>
                <th style={{ fontSize: '12.5px', fontWeight: 750, color: '#475569', background: '#f8fafc', borderBottom: '1px solid #cbd5e1', padding: '10px 8px', width: '140px' }}>관리/문서번호</th>
                <th style={{ fontSize: '12.5px', fontWeight: 750, color: '#475569', background: '#f8fafc', borderBottom: '1px solid #cbd5e1', padding: '10px 8px', width: '160px' }}>거래처 / 고객사</th>
                <th style={{ fontSize: '12.5px', fontWeight: 750, color: '#475569', background: '#f8fafc', borderBottom: '1px solid #cbd5e1', padding: '10px 8px', minWidth: '170px' }}>대표 품목명</th>
                <th style={{ fontSize: '12.5px', fontWeight: 750, color: '#475569', background: '#f8fafc', borderBottom: '1px solid #cbd5e1', padding: '10px 8px', textAlign: 'right', width: '130px' }}>매출액(KRW)</th>
                <th style={{ fontSize: '12.5px', fontWeight: 750, color: '#475569', background: '#f8fafc', borderBottom: '1px solid #cbd5e1', padding: '10px 8px', textAlign: 'right', width: '120px' }}>매입원가</th>
                <th style={{ fontSize: '12.5px', fontWeight: 750, color: '#475569', background: '#f8fafc', borderBottom: '1px solid #cbd5e1', padding: '10px 8px', textAlign: 'right', width: '110px' }}>부대비용</th>
                <th style={{ fontSize: '12.5px', fontWeight: 750, color: '#475569', background: '#f8fafc', borderBottom: '1px solid #cbd5e1', padding: '10px 8px', textAlign: 'right', width: '135px' }}>순 이익금(KRW)</th>
                <th style={{ fontSize: '12.5px', fontWeight: 750, color: '#475569', background: '#f8fafc', borderBottom: '1px solid #cbd5e1', padding: '10px 8px', textAlign: 'center', width: '85px' }}>이익률(%)</th>
                <th style={{ fontSize: '12.5px', fontWeight: 750, color: '#475569', background: '#f8fafc', borderBottom: '1px solid #cbd5e1', padding: '10px 8px', textAlign: 'center', width: '75px' }}>담당자</th>
                <th style={{ fontSize: '12.5px', fontWeight: 750, color: '#475569', background: '#f8fafc', borderBottom: '1px solid #cbd5e1', padding: '10px 8px', textAlign: 'center', width: '60px' }}>상세</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={14} style={{ textAlign: 'center', padding: '50px 0', color: '#64748b' }}>
                    실시간 무역 손익 데이터를 집계하고 있습니다...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={14} style={{ textAlign: 'center', padding: '50px 0', color: '#94a3b8', fontSize: '13px' }}>
                    조회 조건에 해당하는 손익 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, idx) => {
                  const isProfit = item.profitKrw > 0;
                  const isLoss = item.profitKrw < 0;

                  return (
                    <tr
                      key={`${item.sourceType}-${item.id}-${idx}`}
                      style={{
                        borderBottom: '1px solid #e2e8f0',
                        transition: 'background 0.1s'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
                    >
                      <td style={{ padding: '8px', textAlign: 'center', color: '#64748b', fontWeight: 600 }}>
                        {idx + 1}
                      </td>

                      {/* 구분 */}
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 750,
                            background: item.sourceType === 'EXPORT' ? '#eff6ff' : '#ecfdf5',
                            color: item.sourceType === 'EXPORT' ? '#1d4ed8' : '#047857',
                            border: item.sourceType === 'EXPORT' ? '1px solid #bfdbfe' : '1px solid #a7f3d0'
                          }}
                        >
                          {item.sourceType === 'EXPORT' ? '수출 🚢' : '수입 🛬'}
                        </span>
                      </td>

                      {/* 업체 */}
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <span
                          style={{
                            fontSize: '11.5px',
                            fontWeight: 700,
                            color: item.companyKey === 'YS' ? '#b91c1c' : '#1e40af'
                          }}
                        >
                          {item.companyLabel}
                        </span>
                      </td>

                      {/* 일자 */}
                      <td style={{ padding: '8px', textAlign: 'center', color: '#334155', fontWeight: 600, fontSize: '12px' }}>
                        {item.date}
                      </td>

                      {/* 관리/문서번호 */}
                      <td style={{ padding: '8px', fontWeight: 700, color: '#0f172a', fontSize: '12.5px' }}>
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: '#2563eb', textDecoration: 'underline', textUnderlineOffset: '2px' }}
                          title="새 창에서 상세 열기"
                        >
                          {item.docNumber}
                        </a>
                      </td>

                      {/* 거래처 */}
                      <td style={{ padding: '8px', fontWeight: 600, color: '#334155', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.customerName}>
                        {item.customerName}
                      </td>

                      {/* 품목명 */}
                      <td style={{ padding: '8px', color: '#475569', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.itemName}>
                        {item.itemName}
                      </td>

                      {/* 매출액 */}
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                        <div>₩{Math.round(item.salesKrw).toLocaleString()}</div>
                        {item.currency === 'USD' && (
                          <div style={{ fontSize: '10.5px', color: '#64748b' }}>
                            ${item.salesOriginal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 })}
                          </div>
                        )}
                      </td>

                      {/* 매입원가 */}
                      <td style={{ padding: '8px', textAlign: 'right', color: '#475569', fontSize: '12px' }}>
                        ₩{Math.round(item.productCostKrw).toLocaleString()}
                      </td>

                      {/* 부대비용 */}
                      <td style={{ padding: '8px', textAlign: 'right', color: '#64748b', fontSize: '11.5px' }}>
                        ₩{Math.round(item.expenseCostKrw).toLocaleString()}
                      </td>

                      {/* 순 이익금 */}
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 850, fontSize: '13.5px', color: isProfit ? '#16a34a' : (isLoss ? '#dc2626' : '#64748b') }}>
                        {item.profitKrw < 0 && '▲ '}₩{Math.round(item.profitKrw).toLocaleString()}
                      </td>

                      {/* 이익률 */}
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 7px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 800,
                            background: item.marginRate >= 15 ? '#dcfce7' : (item.marginRate >= 5 ? '#eff6ff' : (item.marginRate > 0 ? '#fef3c7' : '#fee2e2')),
                            color: item.marginRate >= 15 ? '#15803d' : (item.marginRate >= 5 ? '#1d4ed8' : (item.marginRate > 0 ? '#b45309' : '#b91c1c')),
                            border: `1px solid ${item.marginRate >= 15 ? '#bbf7d0' : (item.marginRate >= 5 ? '#bfdbfe' : (item.marginRate > 0 ? '#fde68a' : '#fecaca'))}`
                          }}
                        >
                          {item.marginRate.toFixed(1)}%
                        </span>
                      </td>

                      {/* 담당자 */}
                      <td style={{ padding: '8px', textAlign: 'center', color: '#475569', fontSize: '12px' }}>
                        {item.manager}
                      </td>

                      {/* 상세 */}
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => window.open(item.link, '_blank')}
                          style={{
                            background: '#f8fafc',
                            border: '1px solid #cbd5e1',
                            borderRadius: '3px',
                            padding: '2px 6px',
                            fontSize: '11px',
                            fontWeight: 700,
                            color: '#3b82f6',
                            cursor: 'pointer'
                          }}
                          title="새 창에서 상세 열기"
                        >
                          상세 ↗
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* ── TOTAL 합계 행 (Sticky) ── */}
            {filteredItems.length > 0 && (
              <tfoot style={{ position: 'sticky', bottom: 0, zIndex: 6, background: '#f1f5f9' }}>
                <tr style={{ background: '#f1f5f9', borderTop: '2px solid #cbd5e1', borderBottom: '1px solid #cbd5e1' }}>
                  <td colSpan={7} style={{ padding: '11px 12px', color: '#0f172a', fontWeight: 800, fontSize: '13px', background: '#f1f5f9' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        background: '#1e293b',
                        color: '#fff',
                        fontSize: '11px',
                        fontWeight: 900,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        letterSpacing: '0.04em'
                      }}>
                        TOTAL
                      </span>
                      <span style={{ color: '#334155' }}>
                        합계 (총 <strong style={{ color: '#0f172a' }}>{kpiSummary.totalCount}</strong>건 : 수출 {kpiSummary.exportCount}건 / 수입 {kpiSummary.importCount}건)
                      </span>
                    </div>
                  </td>
                  
                  {/* 매출액 합계 */}
                  <td style={{ padding: '11px 8px', textAlign: 'right', fontWeight: 900, color: '#0f172a', fontSize: '13.5px', background: '#f1f5f9' }}>
                    ₩{Math.round(kpiSummary.totalSalesKrw).toLocaleString()}
                  </td>

                  {/* 매입원가 합계 */}
                  <td style={{ padding: '11px 8px', textAlign: 'right', fontWeight: 800, color: '#475569', fontSize: '12.5px', background: '#f1f5f9' }}>
                    ₩{Math.round(kpiSummary.totalProductCostKrw).toLocaleString()}
                  </td>

                  {/* 부대비용 합계 */}
                  <td style={{ padding: '11px 8px', textAlign: 'right', fontWeight: 800, color: '#64748b', fontSize: '12px', background: '#f1f5f9' }}>
                    ₩{Math.round(kpiSummary.totalExpenseCostKrw).toLocaleString()}
                  </td>

                  {/* 순 이익금 합계 */}
                  <td style={{ padding: '11px 8px', textAlign: 'right', fontWeight: 900, color: kpiSummary.totalProfitKrw >= 0 ? '#16a34a' : '#dc2626', fontSize: '14.5px', background: '#f1f5f9' }}>
                    ₩{Math.round(kpiSummary.totalProfitKrw).toLocaleString()}
                  </td>

                  {/* 전체 가중평균 이익률 */}
                  <td style={{ padding: '11px 8px', textAlign: 'center', background: '#f1f5f9' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11.5px',
                        fontWeight: 900,
                        background: kpiSummary.overallMargin >= 10 ? '#dcfce7' : (kpiSummary.overallMargin > 0 ? '#eff6ff' : '#fee2e2'),
                        color: kpiSummary.overallMargin >= 10 ? '#15803d' : (kpiSummary.overallMargin > 0 ? '#1d4ed8' : '#b91c1c'),
                        border: `1px solid ${kpiSummary.overallMargin >= 10 ? '#bbf7d0' : (kpiSummary.overallMargin > 0 ? '#bfdbfe' : '#fecaca')}`
                      }}
                    >
                      {kpiSummary.overallMargin.toFixed(1)}%
                    </span>
                  </td>

                  <td colSpan={2} style={{ padding: '11px 8px', textAlign: 'center', color: '#94a3b8', fontSize: '11px', background: '#f1f5f9' }}>
                    -
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

      </div>

    </div>
  );
};
