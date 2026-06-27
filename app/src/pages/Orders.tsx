import React, { useState, useEffect, useMemo } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db, COMPANY_ID } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import type { Order } from '../types/order';
import { getFormattedPoId } from '../types/order';
import type { ProformaInvoice } from '../types/pi';
import { NewOrderModal } from '../components/NewOrderModal';

interface NextAction {
  text: string;
  level: 'RED' | 'ORANGE' | 'WHITE';
  step: '수주정보' | '소싱/발주' | '물류/선적' | '서류관리' | '정산/결제' | '변경이력';
}

const mapStatusToStep = (st: string): '수주정보' | '소싱/발주' | '물류/선적' | '서류관리' | '정산/결제' | '변경이력' => {
  if (st === "주문" || st === "PO접수" || st === "수주정보") return "수주정보";
  if (st === "발주" || st === "소싱발주" || st === "소싱/발주") return "소싱/발주";
  if (st === "선적관리" || st === "수출관리" || st === "서류관리" || st === "물류/선적") return "물류/선적";
  if (st === "이익관리" || st === "정산마감" || st === "정산/결제") return "정산/결제";
  return "수주정보";
};

export const Orders: React.FC = () => {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const currentUser = userProfile?.name || '담당자';
  const [orders, setOrders] = useState<Order[]>([]);
  const [quotations, setQuotations] = useState<ProformaInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Filters
  const [issuingCompanyFilter, setIssuingCompanyFilter] = useState('All');
  const [managerFilter, setManagerFilter] = useState('All');
  const [stepFilter, setStepFilter] = useState('All');
  const [viewFilter, setViewFilter] = useState('All'); // 'All' / 'Urgent'
  
  // Date Period Filters
  const [dateFilterType, setDateFilterType] = useState<string>('All'); // 'All' | 'Monthly' | 'Quarterly' | 'HalfYearly' | 'Yearly' | 'Range'
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1); // 1 ~ 12
  const [selectedQuarter, setSelectedQuarter] = useState<number>(Math.floor(new Date().getMonth() / 3) + 1); // 1 ~ 4
  const [selectedHalf, setSelectedHalf] = useState<number>(new Date().getMonth() < 6 ? 1 : 2); // 1: 상반기, 2: 하반기
  const [rangeStart, setRangeStart] = useState<string>(new Date().toISOString().split('T')[0]);
  const [rangeEnd, setRangeEnd] = useState<string>(new Date().toISOString().split('T')[0]);

  const [selectedQuotationId, setSelectedQuotationId] = useState<string | undefined>(undefined);

  // Load orders
  useEffect(() => {
    const ordersRef = collection(doc(db, 'companies', COMPANY_ID), 'orders');
    const unsubscribe = onSnapshot(ordersRef, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      setOrders(list);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Load PIs for details
  useEffect(() => {
    const pisRef = collection(doc(db, 'companies', COMPANY_ID), 'proforma_invoices');
    const unsubscribe = onSnapshot(pisRef, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ProformaInvoice));
      setQuotations(list);
    });
    return () => unsubscribe();
  }, []);

  // Check URL parameters for createFromPi on mount / URL change
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const piId = params.get('createFromPi');
    if (piId) {
      setSelectedQuotationId(piId);
      setIsModalOpen(true);
      // Clean up the URL query parameter without reloading
      navigate('/orders', { replace: true });
    }
  }, [navigate]);

  // Rules Engine: Compute Next Action for an Order
  const getNextAction = (order: Order): NextAction => {
    const currentStep = mapStatusToStep(order.status || '');

    // 1. 수주정보
    if (currentStep === '수주정보') {
      // Condition A: L/C is used, L/C file/info discrepancy
      if (order.isLc === 'Y' && order.lcNo && order.lcNo.includes('DISCREPANCY')) {
        return { text: 'L/C와 PI 불일치건 존재 — 확인 필요', level: 'RED', step: '수주정보' };
      }
      // Condition B: incoterms or paymentTerms is empty
      if (!order.incoterms || !order.paymentTerms) {
        return { text: '거래조건(인코텀즈/결제조건) 확인 필요', level: 'WHITE', step: '수주정보' };
      }
      // Default
      return { text: '소싱/발주 단계로 진행 필요', level: 'WHITE', step: '수주정보' };
    }

    // 2. 소싱/발주
    if (currentStep === '소싱/발주') {
      // Condition A: supplier unassigned
      const hasUnassignedSupplier = order.items?.some(it => !it.supplier);
      if (hasUnassignedSupplier) {
        const count = order.items?.filter(it => !it.supplier).length || 0;
        return { text: `품목 ${count}개 공급사 미배정`, level: 'ORANGE', step: '소싱/발주' };
      }

      // Collect suppliers
      const suppliers = Array.from(new Set(order.items?.map(it => it.supplier).filter(Boolean)));

      // Condition B: PO sent check
      for (const sup of suppliers) {
        if (order.supplierPoSent && order.supplierPoSent[sup] === false) {
          return { text: `공급사 ${sup} 발주서 미발송`, level: 'ORANGE', step: '소싱/발주' };
        }
      }

      return { text: '물류/선적 단계로 진행 필요', level: 'WHITE', step: '소싱/발주' };
    }

    // 3. 물류/선적
    if (currentStep === '물류/선적') {
      // Condition A: ETD within 3 days and documents not complete
      if (order.etd) {
        const diffTime = new Date(order.etd).getTime() - Date.now();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays <= 3 && order.ciPlStatus !== 'Y') {
          return { text: `서류 마감 D-${diffDays > 0 ? diffDays : 0} · 포워더 확정 필요`, level: 'RED', step: '물류/선적' };
        }
      }
      // Condition B: Forwarder empty
      if (!order.forwarderConfirmed && (!order.forwarders || order.forwarders.length === 0)) {
        return { text: '지정 포워더 미확정', level: 'WHITE', step: '물류/선적' };
      }

      return { text: '정산/결제 단계로 진행 필요', level: 'WHITE', step: '물류/선적' };
    }

    // 4. 정산/결제
    if (currentStep === '정산/결제') {
      const suppliers = Array.from(new Set(order.items?.map(it => it.supplier).filter(Boolean)));
      
      // Condition A: AP due date passed and payment uncompleted
      if (order.supplierPayments) {
        for (const sup of suppliers) {
          const payInfo = order.supplierPayments[sup];
          if (payInfo && payInfo.status !== '결제완료') {
            // Assume due date passed if not paid
            return { text: `공급사 ${sup} 대금결제 필요`, level: 'RED', step: '정산/결제' };
          }
        }
      }

      // Condition B: AR expected date passed but received date empty
      if (order.paymentCollectedDate === undefined || order.paymentCollectedDate === '') {
        return { text: '고객 대금 미수금 발생', level: 'RED', step: '정산/결제' };
      }

      // Condition C: Tax invoice empty
      const invoicePending = suppliers.some(sup => !order.supplierTaxInvoice || order.supplierTaxInvoice[sup] !== 'Y');
      if (invoicePending) {
        return { text: '세금계산서 발행 대기', level: 'ORANGE', step: '정산/결제' };
      }

      return { text: '정산 완료', level: 'WHITE', step: '정산/결제' };
    }

    return { text: '오더 확인 필요', level: 'WHITE', step: '수주정보' };
  };

  // Get managers list for filters
  const managers = useMemo(() => {
    const list = new Set<string>();
    orders.forEach(o => {
      if (o.manager) list.add(o.manager);
    });
    return Array.from(list).sort();
  }, [orders]);

  // Compute stats based on Date and Company/Manager/etc. filters
  const processedOrders = useMemo(() => {
    let result = orders.map(o => ({
      ...o,
      nextAction: getNextAction(o)
    }));

    // Filter by Issuing company
    if (issuingCompanyFilter !== 'All') {
      result = result.filter(o => o.issuingCompany === issuingCompanyFilter);
    }

    // Filter by Manager
    if (managerFilter !== 'All') {
      result = result.filter(o => o.manager === managerFilter);
    }

    // Filter by Step
    if (stepFilter !== 'All') {
      result = result.filter(o => mapStatusToStep(o.status || '') === stepFilter);
    }

    // Filter by view
    if (viewFilter === 'Urgent') {
      result = result.filter(o => o.nextAction.level === 'RED');
    }

    // Filter by Date Period (Monthly/Quarterly/Half-yearly/Yearly/Range)
    if (dateFilterType !== 'All') {
      result = result.filter(o => {
        if (!o.poDate) return false;
        const d = new Date(o.poDate);
        if (isNaN(d.getTime())) return false;
        
        const y = d.getFullYear();
        const m = d.getMonth() + 1; // 1 ~ 12

        if (dateFilterType === 'Monthly') {
          return y === selectedYear && m === selectedMonth;
        }
        if (dateFilterType === 'Quarterly') {
          const quarter = Math.floor((m - 1) / 3) + 1;
          return y === selectedYear && quarter === selectedQuarter;
        }
        if (dateFilterType === 'HalfYearly') {
          const half = m <= 6 ? 1 : 2;
          return y === selectedYear && half === selectedHalf;
        }
        if (dateFilterType === 'Yearly') {
          return y === selectedYear;
        }
        if (dateFilterType === 'Range') {
          const orderDateStr = o.poDate;
          return orderDateStr >= rangeStart && orderDateStr <= rangeEnd;
        }
        return true;
      });
    }

    // Sort by Urgency (RED -> ORANGE -> WHITE) and then ID descending
    const levelWeight = { RED: 3, ORANGE: 2, WHITE: 1 };
    result.sort((a, b) => {
      const weightA = levelWeight[a.nextAction.level] || 0;
      const weightB = levelWeight[b.nextAction.level] || 0;
      if (weightB !== weightA) return weightB - weightA;
      return b.id.localeCompare(a.id);
    });

    return result;
  }, [orders, quotations, issuingCompanyFilter, managerFilter, stepFilter, viewFilter, dateFilterType, selectedYear, selectedMonth, selectedQuarter, selectedHalf, rangeStart, rangeEnd]);

  // Compute stats based on processedOrders (which has been filtered)
  const stats = useMemo(() => {
    const activeOrders = processedOrders; // All statuses in Order.status ('주문', '발주', '선적관리', '이익관리') represent active/ongoing orders.

    const totalUsd = activeOrders.reduce((sum, o) => {
      const pi = quotations.find(q => q.id === o.quotationId);
      return sum + (pi?.totalUsd || o.totalAmount || 0);
    }, 0);

    const totalYsaccUsd = activeOrders.filter(o => o.issuingCompany === 'YSACC').reduce((sum, o) => {
      const pi = quotations.find(q => q.id === o.quotationId);
      return sum + (pi?.totalUsd || o.totalAmount || 0);
    }, 0);

    const totalYsUsd = activeOrders.filter(o => o.issuingCompany === 'YS').reduce((sum, o) => {
      const pi = quotations.find(q => q.id === o.quotationId);
      return sum + (pi?.totalUsd || o.totalAmount || 0);
    }, 0);

    const urgentCount = processedOrders.filter(o => o.nextAction.level === 'RED').length;

    return {
      activeCount: activeOrders.length,
      totalUsd,
      totalYsaccUsd,
      totalYsUsd,
      urgentCount
    };
  }, [processedOrders, quotations]);

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', margin: 0 }}>주문 관리 대시보드</h1>
          <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '4px' }}>수주 오더의 단계별 다음 할 일 및 진행현황 요약</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          style={{ 
            background: '#2563eb', color: '#fff', border: 'none', 
            padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', 
            fontWeight: 600, fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' 
          }}
        >
          ➕ 신규 PO 등록
        </button>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '18px' }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>진행 중 오더</span>
          <span style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a' }}>{stats.activeCount} 건</span>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>총 진행 수주금액</span>
          <span style={{ fontSize: '28px', fontWeight: 800, color: '#0f766e' }}>
            ${stats.totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontSize: '11.5px', color: '#475569', borderTop: '1px solid #f1f5f9', paddingTop: '6px' }}>
            <span><strong>YSACC:</strong> ${stats.totalYsaccUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            <span><strong>영성:</strong> ${stats.totalYsUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          </div>
        </div>
        <div style={{ 
          background: stats.urgentCount > 0 ? '#fef2f2' : '#fff', 
          border: stats.urgentCount > 0 ? '1px solid #fecaca' : '1px solid #e2e8f0', 
          borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '4px',
          animation: stats.urgentCount > 0 ? 'pulse 2s infinite' : 'none'
        }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: stats.urgentCount > 0 ? '#dc2626' : '#64748b' }}>오늘 처리 필요 (긴급)</span>
          <span style={{ fontSize: '28px', fontWeight: 800, color: stats.urgentCount > 0 ? '#dc2626' : '#0f172a' }}>{stats.urgentCount} 건</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: '12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', alignItems: 'center', flexWrap: 'wrap', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', letterSpacing: '0.05em' }}>발행사</label>
          <select value={issuingCompanyFilter} onChange={e => setIssuingCompanyFilter(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', width: '130px', backgroundColor: '#fff', color: '#1e293b', outline: 'none', cursor: 'pointer', transition: 'border-color 0.2s' }}>
            <option value="All">전체</option>
            <option value="YS">영성ACC</option>
            <option value="YSACC">YSACC</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', letterSpacing: '0.05em' }}>담당자</label>
          <select value={managerFilter} onChange={e => setManagerFilter(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', width: '130px', backgroundColor: '#fff', color: '#1e293b', outline: 'none', cursor: 'pointer', transition: 'border-color 0.2s' }}>
            <option value="All">전체</option>
            {managers.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', letterSpacing: '0.05em' }}>단계</label>
          <select value={stepFilter} onChange={e => setStepFilter(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', width: '130px', backgroundColor: '#fff', color: '#1e293b', outline: 'none', cursor: 'pointer', transition: 'border-color 0.2s' }}>
            <option value="All">전체</option>
            <option value="수주정보">수주정보</option>
            <option value="소싱/발주">소싱/발주</option>
            <option value="물류/선적">물류/선적</option>
            <option value="서류관리">서류관리</option>
            <option value="정산/결제">정산/결제</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', letterSpacing: '0.05em' }}>보기 구분</label>
          <select value={viewFilter} onChange={e => setViewFilter(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', width: '160px', backgroundColor: '#fff', color: '#1e293b', outline: 'none', cursor: 'pointer', transition: 'border-color 0.2s' }}>
            <option value="All">전체 오더 보기</option>
            <option value="Urgent">⚠️ 오늘 처리 필요만</option>
          </select>
        </div>

        {/* Vertical divider */}
        <div style={{ width: '1px', height: '36px', backgroundColor: '#e2e8f0', margin: '0 8px', alignSelf: 'flex-end', marginBottom: '4px' }}></div>

        {/* Date Filter Type Selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#2563eb', letterSpacing: '0.05em' }}>조회 기간</label>
          <select value={dateFilterType} onChange={e => setDateFilterType(e.target.value)} style={{ padding: '8px 12px', border: '1.5px solid #2563eb', borderRadius: '8px', fontSize: '13px', width: '145px', backgroundColor: '#fff', color: '#2563eb', fontWeight: 600, outline: 'none', cursor: 'pointer', transition: 'border-color 0.2s' }}>
            <option value="All">전체 기간</option>
            <option value="Monthly">월별 조회</option>
            <option value="Quarterly">분기별 조회</option>
            <option value="HalfYearly">반기별 조회</option>
            <option value="Yearly">연간 조회</option>
            <option value="Range">직접 입력 (기간)</option>
          </select>
        </div>

        {/* Year Dropdown (For Monthly, Quarterly, HalfYearly, Yearly) */}
        {['Monthly', 'Quarterly', 'HalfYearly', 'Yearly'].includes(dateFilterType) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', letterSpacing: '0.05em' }}>년도</label>
            <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', width: '100px', backgroundColor: '#fff', color: '#1e293b', outline: 'none', cursor: 'pointer' }}>
              {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map(y => (
                <option key={y} value={y}>{y}년</option>
              ))}
            </select>
          </div>
        )}

        {/* Month Dropdown (Monthly) */}
        {dateFilterType === 'Monthly' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', letterSpacing: '0.05em' }}>월</label>
            <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', width: '90px', backgroundColor: '#fff', color: '#1e293b', outline: 'none', cursor: 'pointer' }}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>{m}월</option>
              ))}
            </select>
          </div>
        )}

        {/* Quarter Dropdown (Quarterly) */}
        {dateFilterType === 'Quarterly' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', letterSpacing: '0.05em' }}>분기</label>
            <select value={selectedQuarter} onChange={e => setSelectedQuarter(Number(e.target.value))} style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', width: '135px', backgroundColor: '#fff', color: '#1e293b', outline: 'none', cursor: 'pointer' }}>
              <option value={1}>1분기 (1-3월)</option>
              <option value={2}>2분기 (4-6월)</option>
              <option value={3}>3분기 (7-9월)</option>
              <option value={4}>4분기 (10-12월)</option>
            </select>
          </div>
        )}

        {/* Half Dropdown (HalfYearly) */}
        {dateFilterType === 'HalfYearly' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', letterSpacing: '0.05em' }}>반기</label>
            <select value={selectedHalf} onChange={e => setSelectedHalf(Number(e.target.value))} style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', width: '135px', backgroundColor: '#fff', color: '#1e293b', outline: 'none', cursor: 'pointer' }}>
              <option value={1}>상반기 (1-6월)</option>
              <option value={2}>하반기 (7-12월)</option>
            </select>
          </div>
        )}

        {/* Custom Range Inputs (Range) */}
        {dateFilterType === 'Range' && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', letterSpacing: '0.05em' }}>시작일</label>
              <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} style={{ padding: '7px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', backgroundColor: '#fff', color: '#1e293b', outline: 'none' }} />
            </div>
            <span style={{ alignSelf: 'flex-end', paddingBottom: '12px', color: '#94a3b8', fontWeight: 'bold' }}>~</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', letterSpacing: '0.05em' }}>종료일</label>
              <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} style={{ padding: '7px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', backgroundColor: '#fff', color: '#1e293b', outline: 'none' }} />
            </div>
          </div>
        )}
      </div>

      {/* Dashboard List */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>주문 정보를 로딩 중입니다...</div>
        ) : processedOrders.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>등록된 주문 정보가 없습니다.</div>
        ) : (
          <>
            {/* 단계 색상 범례 (Color Legend) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '10px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '12px', fontSize: '12px', color: '#64748b', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, color: '#475569' }}>💡 단계 색상 안내:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ color: '#10b981', fontSize: '14px' }}>●</span> 완료됨</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ color: '#2563eb', fontSize: '14px' }}>●</span> 진행중 (정상)</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ color: '#f59e0b', fontSize: '14px' }}>●</span> 조치 필요 (주의/대기)</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ color: '#cbd5e1', fontSize: '14px' }}>●</span> 미시작</div>
            </div>

            <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <tr>
                  <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569', fontSize: '12px' }}>날짜</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569', fontSize: '12px' }}>주문번호</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569', fontSize: '12px' }}>수주사</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569', fontSize: '12px' }}>발주사</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569', fontSize: '12px', textAlign: 'right' }}>발주액</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569', fontSize: '12px', textAlign: 'center' }}>단계</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569', fontSize: '12px' }}>다음단계</th>
                </tr>
              </thead>
              <tbody>
                {processedOrders.map((order) => {
                  const pi = quotations.find(q => q.id === order.quotationId);
                  const orderAmount = pi?.totalUsd || order.totalAmount || 0;
                  const currentStep = mapStatusToStep(order.status || '');

                  // 5대 핵심 도메인별 진척 상태 실시간 분석
                  const getStageColor = (stageName: '수주정보' | '소싱/발주' | '물류/선적' | '서류관리' | '정산/결제') => {
                    if (stageName === '수주정보') {
                      const hasTerms = !!(order.incoterms && order.paymentTerms);
                      const hasLcOk = order.isLc === 'Y' ? !!order.lcNo && !order.lcNo.includes('DISCREPANCY') : true;
                      const hasLcDiscrepancy = order.isLc === 'Y' && order.lcNo && order.lcNo.includes('DISCREPANCY');

                      if (hasLcDiscrepancy) return '#f59e0b'; // 🟡 조치필요
                      if (hasTerms && hasLcOk) return '#10b981'; // 🟢 완료
                      return '#2563eb'; // 🔵 진행중
                    }

                    if (stageName === '소싱/발주') {
                      const orderItems = order.items || [];
                      if (orderItems.length === 0) return '#cbd5e1'; // ⚪ 미시작
                      
                      const allAssigned = orderItems.every(it => it.supplier);
                      const hasCargoDate = !!order.cargoReadyDate;
                      const hasPoSent = order.supplierPoSent && Object.values(order.supplierPoSent).every(val => val === true);

                      if (allAssigned && hasCargoDate && hasPoSent) return '#10b981'; // 🟢 완료
                      if (allAssigned || hasCargoDate) return '#2563eb'; // 🔵 진행중
                      return '#cbd5e1'; // ⚪ 미시작
                    }

                    if (stageName === '물류/선적') {
                      const hasForwarders = order.forwarderConfirmed || (order.forwarders && order.forwarders.length > 0);
                      const hasVessel = !!order.vesselBooking;
                      const hasCfs = !!(order.containerWorkspaceType && order.cfsEntryDate);

                      if (hasForwarders && hasVessel && hasCfs) return '#10b981'; // 🟢 완료
                      if (hasForwarders || hasVessel) return '#2563eb'; // 🔵 진행중
                      return '#cbd5e1'; // ⚪ 미시작
                    }

                    if (stageName === '서류관리') {
                      const hasCiPl = order.ciPlStatus === 'Y' || !!(order.ciFiles && order.ciFiles.length > 0);
                      const hasExportNo = !!(order.exportDeclarationNo && order.exportDeclarationFiles && order.exportDeclarationFiles.length > 0);
                      const hasPhotos = !!(order.containerWorkFiles && order.containerWorkFiles.length > 0);

                      if (hasCiPl && hasExportNo && hasPhotos) return '#10b981'; // 🟢 완료
                      if (hasCiPl || hasExportNo) return '#2563eb'; // 🔵 진행중
                      return '#cbd5e1'; // ⚪ 미시작
                    }

                    if (stageName === '정산/결제') {
                      const hasReceipts = !!(order.paymentCollectedInstallments && order.paymentCollectedInstallments.length > 0);
                      const isFullyCollected = order.paymentCollectedDate !== undefined && order.paymentCollectedDate !== '';
                      
                      // 세금계산서 등록 확인
                      const hasTaxInvoice = (() => {
                        const details = (order as any).supplierTaxInvoiceDetails;
                        if (!details) return false;
                        const keys = Object.keys(details);
                        if (keys.length === 0) return false;
                        return keys.some(key => {
                          const detail = details[key];
                          if (!detail) return false;
                          if (Array.isArray(detail)) return detail.some((d: any) => !!d.invoiceNo);
                          return !!(detail as any).invoiceNo;
                        });
                      })();

                      if (isFullyCollected && hasTaxInvoice) return '#10b981'; // 🟢 완료
                      if (hasReceipts || hasTaxInvoice) return '#2563eb'; // 🔵 진행중
                      return '#cbd5e1'; // ⚪ 미시작
                    }

                    return '#cbd5e1';
                  };

                  // Urgent color styling
                  const levelColor = order.nextAction.level === 'RED' ? '#ef4444' : order.nextAction.level === 'ORANGE' ? '#f59e0b' : '#64748b';
                  const levelBg = order.nextAction.level === 'RED' ? '#fef2f2' : order.nextAction.level === 'ORANGE' ? '#fffbeb' : '#f8fafc';
                  const levelBorder = order.nextAction.level === 'RED' ? '#fecaca' : order.nextAction.level === 'ORANGE' ? '#fef3c7' : '#e2e8f0';

                  return (
                    <tr 
                      key={order.id}
                      onClick={() => navigate(`/orders/${order.id}?step=수주정보`)}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        cursor: 'pointer', transition: 'background-color 0.15s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      {/* 날짜 */}
                      <td style={{ padding: '14px 16px', color: '#64748b', whiteSpace: 'nowrap' }}>{order.poDate || '-'}</td>
                      
                      {/* 주문번호 */}
                      <td style={{ padding: '14px 16px', whiteSpace: 'nowrap', fontWeight: 700, color: '#1e293b' }}>
                        {getFormattedPoId(order.id, order.issuingCompany)}
                      </td>

                      {/* 수주사 */}
                      <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: order.issuingCompany === 'YSACC' ? '#dbeafe' : '#fef9c3', color: order.issuingCompany === 'YSACC' ? '#1e40af' : '#ca8a04' }}>
                          {order.issuingCompany || 'YSACC'}
                        </span>
                      </td>

                      {/* 발주사 */}
                      <td style={{ padding: '14px 16px', color: '#334155', fontWeight: 600 }}>{order.customer}</td>

                      {/* 발주액 */}
                      <td style={{ padding: '14px 16.5px', paddingRight: '24px', fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', textAlign: 'right' }}>
                        ${orderAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* 단계 (Progress circles) */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                          {/* Circle 1 */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ color: getStageColor('수주정보'), fontSize: '14px' }}>●</span>
                            <span style={{ fontSize: '11px', fontWeight: currentStep === '수주정보' ? 700 : 500, color: currentStep === '수주정보' ? '#1e293b' : '#64748b' }}>수주정보</span>
                          </div>
                          <span style={{ color: '#cbd5e1', fontSize: '12px' }}>&gt;</span>
                          {/* Circle 2 */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '1px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ color: getStageColor('소싱/발주'), fontSize: '14px' }}>●</span>
                              <span style={{ fontSize: '11px', fontWeight: currentStep === '소싱/발주' ? 700 : 500, color: currentStep === '소싱/발주' ? '#1e293b' : '#64748b' }}>소싱/발주</span>
                            </div>
                            <span style={{ fontSize: '9px', color: currentStep === '소싱/발주' ? '#2563eb' : '#94a3b8', paddingLeft: '14px', fontWeight: 600 }}>
                              {(() => {
                                const tab = (order as any).activeSourcingTab || '소싱발주';
                                switch(tab) {
                                  case '소싱발주': return '1) 소싱발주';
                                  case 'COA_성적서': return '2) COA/성적서/파일';
                                  default: return '1) 소싱발주';
                                }
                              })()}
                            </span>
                          </div>
                          <span style={{ color: '#cbd5e1', fontSize: '12px' }}>&gt;</span>
                          {/* Circle 3 */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '1px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ color: getStageColor('물류/선적'), fontSize: '14px' }}>●</span>
                              <span style={{ fontSize: '11px', fontWeight: currentStep === '물류/선적' ? 700 : 500, color: currentStep === '물류/선적' ? '#1e293b' : '#64748b' }}>물류/선적</span>
                            </div>
                            <span style={{ fontSize: '9px', color: currentStep === '물류/선적' ? '#2563eb' : '#94a3b8', paddingLeft: '14px', fontWeight: 600 }}>
                              {(() => {
                                const tab = (order as any).activeSourcingTab || '선적관리';
                                switch(tab) {
                                  case '선적관리': return '1) 선적관리';
                                  case '패킹리스트': return '2) 패킹리스트';
                                  case '도착보고_쉬핑마크': return '3) 도착보고';
                                  default: return '1) 선적관리';
                                }
                              })()}
                            </span>
                          </div>
                          <span style={{ color: '#cbd5e1', fontSize: '12px' }}>&gt;</span>
                          {/* Circle 4 */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ color: getStageColor('서류관리'), fontSize: '14px' }}>●</span>
                            <span style={{ fontSize: '11px', fontWeight: currentStep === '서류관리' ? 700 : 500, color: currentStep === '서류관리' ? '#1e293b' : '#64748b' }}>서류관리</span>
                          </div>
                          <span style={{ color: '#cbd5e1', fontSize: '12px' }}>&gt;</span>
                          {/* Circle 5 */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ color: getStageColor('정산/결제'), fontSize: '14px' }}>●</span>
                            <span style={{ fontSize: '11px', fontWeight: currentStep === '정산/결제' ? 700 : 500, color: currentStep === '정산/결제' ? '#1e293b' : '#64748b' }}>정산/결제</span>
                          </div>
                        </div>
                      </td>

                      {/* 다음단계 */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '20px', background: levelBg, border: `1px solid ${levelBorder}`, color: levelColor, fontSize: '12px', fontWeight: 600 }}>
                          <span>{order.nextAction.level === 'RED' ? '⚠️' : order.nextAction.level === 'ORANGE' ? '⏰' : '→'}</span>
                          <span>{order.nextAction.text}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {processedOrders.length > 0 && (
                  <tr style={{ backgroundColor: '#f8fafc', fontWeight: 'bold', borderTop: '2.5px solid #cbd5e1' }}>
                    <td colSpan={4} style={{ padding: '14px 16px', color: '#475569', textAlign: 'right', fontSize: '13px' }}>합계</td>
                    <td style={{ padding: '14px 16.5px', paddingRight: '24px', color: '#0f172a', whiteSpace: 'nowrap', fontSize: '13px', textAlign: 'right' }}>
                      ${processedOrders.reduce((sum, order) => {
                        const pi = quotations.find(q => q.id === order.quotationId);
                        return sum + (pi?.totalUsd || order.totalAmount || 0);
                      }, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td />
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
        )}
      </div>

      {isModalOpen && (
        <NewOrderModal 
          onClose={() => {
            setIsModalOpen(false);
            setSelectedQuotationId(undefined);
          }}
          onSaveSuccess={() => {
            setIsModalOpen(false);
            setSelectedQuotationId(undefined);
          }}
          currentUser={currentUser}
          initialQuotationId={selectedQuotationId}
        />
      )}
    </div>
  );
};
