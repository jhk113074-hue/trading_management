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
  step: '수주정보' | '소싱/발주' | '물류/선적' | '서류관리' | '정산/결제' | '변경이력' | '완료';
}

// stageCompletion 기반 전체 진행률 계산
type StageKey = '수주정보' | '소싱발주' | '물류선적' | '서류관리' | '정산결제';
const STAGE_KEYS: StageKey[] = ['수주정보', '소싱발주', '물류선적', '서류관리', '정산결제'];

const getOverallProgress = (order: Order) => {
  const sc = (order as any).stageCompletion as Record<StageKey, Record<string, boolean>> | undefined;
  if (!sc) return { done: 0, total: 0, pct: 0 };
  const allKeys = STAGE_KEYS.flatMap(k => Object.keys(sc[k] || {}));
  const allDone = STAGE_KEYS.flatMap(k => Object.values(sc[k] || {}).filter(Boolean));
  if (allKeys.length === 0) return { done: 0, total: 0, pct: 0 };
  return { done: allDone.length, total: allKeys.length, pct: Math.round((allDone.length / allKeys.length) * 100) };
};

const mapStatusToStep = (st: string, order?: Order): '수주정보' | '소싱/발주' | '물류/선적' | '서류관리' | '정산/결제' | '변경이력' | '완료' => {
  if (st === "완료" || st === "정산완료" || (order && getOverallProgress(order).pct === 100)) return "완료";
  if (st === "주문" || st === "PO접수" || st === "수주정보") return "수주정보";
  if (st === "발주" || st === "소싱발주" || st === "소싱/발주") return "소싱/발주";
  if (st === "선적관리" || st === "물류/선적") return "물류/선적";
  if (st === "수출관리" || st === "서류관리") return "서류관리";
  if (st === "이익관리" || st === "정산마감" || st === "정산/결제") return "정산/결제";
  return "수주정보";
};

const getStageProgress = (order: Order, stageKey: StageKey) => {
  const sc = (order as any).stageCompletion as Record<StageKey, Record<string, boolean>> | undefined;
  if (!sc || !sc[stageKey]) return { done: 0, total: 0, pct: 0 };
  const keys = Object.keys(sc[stageKey]);
  const done = Object.values(sc[stageKey]).filter(Boolean).length;
  return { done, total: keys.length, pct: keys.length > 0 ? Math.round((done / keys.length) * 100) : 0 };
};

const getNextTodoItem = (order: Order): string => {
  const sc = (order as any).stageCompletion as Record<StageKey, Record<string, boolean>> | undefined;
  if (!sc) return "진행 정보 없음";
  const stageLabels: Record<StageKey, string> = {
    '수주정보': '수주정보',
    '소싱발주': '소싱/발주',
    '물류선적': '물류/선적',
    '서류관리': '서류관리',
    '정산결제': '정산/결제'
  };
  for (const sk of STAGE_KEYS) {
    const items = sc[sk] || {};
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

  // 뷰 모드: 'list' | 'kanban' | 'todo'
  const [viewMode, setViewMode] = useState<'list' | 'kanban' | 'todo'>('list');

  // Filters
  const [issuingCompanyFilter, setIssuingCompanyFilter] = useState('All');
  const [managerFilter, setManagerFilter] = useState('All');
  const [stepFilter, setStepFilter] = useState('All');
  const [viewFilter, setViewFilter] = useState('All');
  const [dateFilterType, setDateFilterType] = useState<string>('All');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedQuarter, setSelectedQuarter] = useState<number>(Math.floor(new Date().getMonth() / 3) + 1);
  const [selectedHalf, setSelectedHalf] = useState<number>(new Date().getMonth() < 6 ? 1 : 2);
  const [rangeStart, setRangeStart] = useState<string>(new Date().toISOString().split('T')[0]);
  const [rangeEnd, setRangeEnd] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedQuotationId, setSelectedQuotationId] = useState<string | undefined>(undefined);

  useEffect(() => {
    const ordersRef = collection(doc(db, 'companies', COMPANY_ID), 'orders');
    const unsubscribe = onSnapshot(ordersRef, (snap) => {
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const piId = params.get('createFromPi');
    if (piId) {
      setSelectedQuotationId(piId);
      setIsModalOpen(true);
      navigate('/orders', { replace: true });
    }
  }, [navigate]);

  const getNextAction = (order: Order): NextAction => {
    const currentStep = mapStatusToStep(order.status || '');
    if (currentStep === '수주정보') {
      if (order.isLc === 'Y' && order.lcNo && order.lcNo.includes('DISCREPANCY'))
        return { text: 'L/C와 PI 불일치 — 확인 필요', level: 'RED', step: '수주정보' };
      if (!order.incoterms || !order.paymentTerms)
        return { text: '거래조건 확인 필요', level: 'ORANGE', step: '수주정보' };
      return { text: '소싱/발주 단계로 진행 필요', level: 'WHITE', step: '수주정보' };
    }
    if (currentStep === '소싱/발주') {
      const hasUnassigned = order.items?.some(it => !it.supplier);
      if (hasUnassigned) {
        const count = order.items?.filter(it => !it.supplier).length || 0;
        return { text: `품목 ${count}개 공급사 미배정`, level: 'ORANGE', step: '소싱/발주' };
      }
      const suppliers = Array.from(new Set(order.items?.map(it => it.supplier).filter(Boolean)));
      for (const sup of suppliers) {
        if (order.supplierPoSent && order.supplierPoSent[sup] === false)
          return { text: `${sup} 발주서 미발송`, level: 'ORANGE', step: '소싱/발주' };
      }
      return { text: '물류/선적 단계로 진행 필요', level: 'WHITE', step: '소싱/발주' };
    }
    if (currentStep === '물류/선적') {
      if (order.etd) {
        const diffDays = Math.ceil((new Date(order.etd).getTime() - Date.now()) / 86400000);
        if (diffDays <= 3 && order.ciPlStatus !== 'Y')
          return { text: `서류 마감 D-${Math.max(diffDays, 0)} · 포워더 확정 필요`, level: 'RED', step: '물류/선적' };
      }
      if (!order.forwarderConfirmed && (!order.forwarders || order.forwarders.length === 0))
        return { text: '포워더 미확정', level: 'ORANGE', step: '물류/선적' };
      return { text: '정산/결제 단계로 진행 필요', level: 'WHITE', step: '물류/선적' };
    }
    if (currentStep === '정산/결제') {
      const suppliers = Array.from(new Set(order.items?.map(it => it.supplier).filter(Boolean)));
      if (order.supplierPayments) {
        for (const sup of suppliers) {
          const p = order.supplierPayments[sup];
          if (p && p.status !== '결제완료')
            return { text: `${sup} 대금결제 필요`, level: 'RED', step: '정산/결제' };
        }
      }
      if (!order.paymentCollectedDate)
        return { text: '고객 대금 미수금 발생', level: 'RED', step: '정산/결제' };
      const inv = suppliers.some(sup => !order.supplierTaxInvoice || order.supplierTaxInvoice[sup] !== 'Y');
      if (inv) return { text: '세금계산서 발행 대기', level: 'ORANGE', step: '정산/결제' };
      return { text: '정산 완료', level: 'WHITE', step: '정산/결제' };
    }
    return { text: '오더 확인 필요', level: 'WHITE', step: '수주정보' };
  };

  const managers = useMemo(() => {
    const list = new Set<string>();
    orders.forEach(o => { if (o.manager) list.add(o.manager); });
    return Array.from(list).sort();
  }, [orders]);

  const processedOrders = useMemo(() => {
    let result = orders.map(o => ({ ...o, nextAction: getNextAction(o) }));
    if (issuingCompanyFilter !== 'All') result = result.filter(o => o.issuingCompany === issuingCompanyFilter);
    if (managerFilter !== 'All') result = result.filter(o => o.manager === managerFilter);
    if (stepFilter !== 'All') result = result.filter(o => mapStatusToStep(o.status || '') === stepFilter);
    if (viewFilter === 'Urgent') result = result.filter(o => o.nextAction.level === 'RED');
    if (dateFilterType !== 'All') {
      result = result.filter(o => {
        if (!o.poDate) return false;
        const d = new Date(o.poDate);
        if (isNaN(d.getTime())) return false;
        const y = d.getFullYear(), m = d.getMonth() + 1;
        if (dateFilterType === 'Monthly') return y === selectedYear && m === selectedMonth;
        if (dateFilterType === 'Quarterly') return y === selectedYear && Math.floor((m-1)/3)+1 === selectedQuarter;
        if (dateFilterType === 'HalfYearly') return y === selectedYear && (m <= 6 ? 1 : 2) === selectedHalf;
        if (dateFilterType === 'Yearly') return y === selectedYear;
        if (dateFilterType === 'Range') return o.poDate >= rangeStart && o.poDate <= rangeEnd;
        return true;
      });
    }
    const lw = { RED: 3, ORANGE: 2, WHITE: 1 };
    result.sort((a, b) => {
      const wa = lw[a.nextAction.level] || 0, wb = lw[b.nextAction.level] || 0;
      if (wb !== wa) return wb - wa;
      return b.id.localeCompare(a.id);
    });
    return result;
  }, [orders, quotations, issuingCompanyFilter, managerFilter, stepFilter, viewFilter, dateFilterType, selectedYear, selectedMonth, selectedQuarter, selectedHalf, rangeStart, rangeEnd]);

  const stats = useMemo(() => {
    const totalUsd = processedOrders.reduce((sum, o) => {
      const pi = quotations.find(q => q.id === o.quotationId);
      return sum + (pi?.totalUsd || o.totalAmount || 0);
    }, 0);
    return {
      activeCount: processedOrders.length,
      totalUsd,
      totalYsaccUsd: processedOrders.filter(o => o.issuingCompany === 'YSACC').reduce((sum, o) => {
        const pi = quotations.find(q => q.id === o.quotationId);
        return sum + (pi?.totalUsd || o.totalAmount || 0);
      }, 0),
      totalYsUsd: processedOrders.filter(o => o.issuingCompany === 'YS').reduce((sum, o) => {
        const pi = quotations.find(q => q.id === o.quotationId);
        return sum + (pi?.totalUsd || o.totalAmount || 0);
      }, 0),
      urgentCount: processedOrders.filter(o => o.nextAction.level === 'RED').length,
    };
  }, [processedOrders, quotations]);

  // ── 공통 필터 바 ──────────────────────────────────────────────────────────
  const FilterBar = () => (
    <div style={{ display: 'flex', gap: '8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 16px', alignItems: 'center', flexWrap: 'nowrap', overflowX: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      {/* 뷰 전환 탭 */}
      <div style={{ display: 'flex', gap: '0', background: '#f1f5f9', borderRadius: '6px', padding: '2px', border: '1px solid #e2e8f0', flexShrink: 0 }}>
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
      <div style={{ width: '1px', height: '24px', background: '#cbd5e1', margin: '0 8px', flexShrink: 0 }} />

      {[
        { label: '담당자', value: managerFilter, set: setManagerFilter, opts: [['All','전체'], ...managers.map(m => [m, m])] },
        { label: '단계', value: stepFilter, set: setStepFilter, opts: [['All','전체'],['수주정보','수주정보'],['소싱/발주','소싱/발주'],['물류/선적','물류/선적'],['서류관리','서류관리'],['정산/결제','정산/결제']] },
        { label: '보기', value: viewFilter, set: setViewFilter, opts: [['All','전체 오더'],['Urgent','⚠️ 긴급만']] },
      ].map(({ label, value, set, opts }) => (
        <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
          <label style={{ fontSize: '9px', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em' }}>{label}</label>
          <select value={value} onChange={e => set(e.target.value)} style={{ padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12.5px', backgroundColor: '#fff', color: '#1e293b', outline: 'none', cursor: 'pointer' }}>
            {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      ))}
      <div style={{ width: '1px', height: '24px', background: '#cbd5e1', margin: '0 4px', flexShrink: 0 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
        <label style={{ fontSize: '9px', fontWeight: 700, color: '#2563eb', letterSpacing: '0.05em' }}>조회 기간</label>
        <select value={dateFilterType} onChange={e => setDateFilterType(e.target.value)} style={{ padding: '5px 8px', border: '1.5px solid #2563eb', borderRadius: '6px', fontSize: '12.5px', backgroundColor: '#fff', color: '#2563eb', fontWeight: 600, outline: 'none', cursor: 'pointer' }}>
          <option value="All">전체 기간</option>
          <option value="Monthly">월별</option>
          <option value="Quarterly">분기별</option>
          <option value="HalfYearly">반기별</option>
          <option value="Yearly">연간</option>
          <option value="Range">직접 입력</option>
        </select>
      </div>
      {['Monthly','Quarterly','HalfYearly','Yearly'].includes(dateFilterType) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
          <label style={{ fontSize: '9px', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em' }}>년도</label>
          <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} style={{ padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12.5px', backgroundColor: '#fff', outline: 'none' }}>
            {[2024,2025,2026,2027,2028].map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
        </div>
      )}
      {dateFilterType === 'Monthly' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
          <label style={{ fontSize: '9px', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em' }}>월</label>
          <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} style={{ padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12.5px', backgroundColor: '#fff', outline: 'none' }}>
            {Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{m}월</option>)}
          </select>
        </div>
      )}
      {dateFilterType === 'Quarterly' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
          <label style={{ fontSize: '9px', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em' }}>분기</label>
          <select value={selectedQuarter} onChange={e => setSelectedQuarter(Number(e.target.value))} style={{ padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12.5px', backgroundColor: '#fff', outline: 'none' }}>
            {[1,2,3,4].map(q => <option key={q} value={q}>{q}분기</option>)}
          </select>
        </div>
      )}
      {dateFilterType === 'HalfYearly' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
          <label style={{ fontSize: '9px', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em' }}>반기</label>
          <select value={selectedHalf} onChange={e => setSelectedHalf(Number(e.target.value))} style={{ padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12.5px', backgroundColor: '#fff', outline: 'none' }}>
            <option value={1}>상반기</option><option value={2}>하반기</option>
          </select>
        </div>
      )}
      {dateFilterType === 'Range' && (
        <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ fontSize: '9px', fontWeight: 700, color: '#64748b' }}>시작일</label>
            <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', outline: 'none' }} />
          </div>
          <span style={{ paddingBottom: '6px', color: '#94a3b8', fontWeight: 700, fontSize: '12px' }}>~</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <label style={{ fontSize: '9px', fontWeight: 700, color: '#64748b' }}>종료일</label>
            <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', outline: 'none' }} />
          </div>
        </div>
      )}
    </div>
  );

  // ── 오더 카드 (칸반/목록 공통 사용) ──────────────────────────────────────
  const OrderCard = ({ order, compact = false }: { order: Order & { nextAction: NextAction }; compact?: boolean }) => {
    const pi = quotations.find(q => q.id === order.quotationId);
    const amount = pi?.totalUsd || order.totalAmount || 0;
    const { pct } = getOverallProgress(order);
    const lvlColor = order.nextAction.level === 'RED' ? '#ef4444' : order.nextAction.level === 'ORANGE' ? '#f59e0b' : '#64748b';
    const lvlBg   = order.nextAction.level === 'RED' ? '#fef2f2' : order.nextAction.level === 'ORANGE' ? '#fffbeb' : '#f8fafc';
    const lvlBdr  = order.nextAction.level === 'RED' ? '#fecaca' : order.nextAction.level === 'ORANGE' ? '#fef3c7' : '#e2e8f0';
    const sc = (order as any).stageCompletion as Record<StageKey, Record<string, boolean>> | undefined;
    const currentStepKey = stepToStageKey[mapStatusToStep(order.status || '')] as StageKey;

    return (
      <div
        onClick={() => navigate(`/orders/${order.id}?step=수주정보`)}
        style={{
          background: '#fff', border: `1px solid ${order.nextAction.level === 'RED' ? '#fecaca' : '#e2e8f0'}`,
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
            <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {getFormattedPoId(order.id, order.issuingCompany)}
            </span>
            <span style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
              <span style={{ fontSize: '9.5px', color: '#94a3b8', fontWeight: 500 }}>전체 진행률</span>
              <span style={{ fontSize: '9.5px', fontWeight: 700, color: pct === 100 ? '#10b981' : '#2563eb' }}>{pct}%</span>
            </div>
            <div style={{ width: '100%', height: '4px', background: '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}>
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
              const color = isDone ? '#10b981' : isCurrent ? '#2563eb' : done > 0 ? '#93c5fd' : '#e2e8f0';
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
          <span style={{ fontSize: '9.5px', color: '#cbd5e1', fontWeight: 500 }}>PO접수 {order.poDate}</span>
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
    { step: '완료', key: '완료', icon: '✅', color: '#475569', bg: '#f1f5f9' },
  ];

  const KanbanView = () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px', alignItems: 'flex-start' }}>
      {KANBAN_COLS.map(col => {
        const colOrders = processedOrders.filter(o => mapStatusToStep(o.status || '', o) === col.step);
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
                <div style={{ padding: '20px', textAlign: 'center', color: '#cbd5e1', fontSize: '11.5px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #e2e8f0' }}>
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
          <div style={{ padding: '14px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #e2e8f0' }}>
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
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>
                    {getFormattedPoId(o.id, o.issuingCompany)}
                  </span>
                  <span style={{ fontSize: '9.5px', fontWeight: 700, padding: '1px 6px', borderRadius: '8px', background: o.issuingCompany === 'YSACC' ? '#dbeafe' : '#fef9c3', color: o.issuingCompany === 'YSACC' ? '#1e40af' : '#ca8a04' }}>
                    {o.issuingCompany === 'YSACC' ? 'YSACC' : '영성'}
                  </span>
                </div>
                <span style={{ fontSize: '11.5px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {o.customer}
                </span>
              </div>

              {/* 처리 필요 액션 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '16px', background: bg, border: `1px solid ${border}`, color, fontSize: '11.5px', fontWeight: 700, width: 'fit-content' }}>
                  <span>{icon}</span>
                  <span>{o.nextAction.text}</span>
                </div>
                <span style={{ fontSize: '10.5px', color: '#94a3b8', paddingLeft: '2px' }}>
                  현재 단계: <strong style={{ color: '#475569' }}>{currentStep}</strong>
                  {o.poDate && <span> · PO {o.poDate}</span>}
                </span>
              </div>

              {/* 진행률 */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: '80px' }}>
                <div style={{ width: '80px', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#10b981' : 'linear-gradient(90deg, #3b82f6, #10b981)', borderRadius: '3px' }} />
                </div>
                <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>{pct}% 완료</span>
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
        <TodoSection title="✅ 진행 중 (정상)" icon="→"  orders={whiteOrders}  color="#475569" bg="#f8fafc" border="#e2e8f0" />
      </div>
    );
  };

  // ── 목록 뷰 (기존) ────────────────────────────────────────────────────────
  const ListView = () => (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>주문 정보를 로딩 중입니다...</div>
      ) : processedOrders.length === 0 ? (
        <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>등록된 주문 정보가 없습니다.</div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
              <thead style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <tr>
                  {['날짜','주문번호','수주사','발주사','발주액','단계','다음단계'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', fontWeight: 700, color: '#475569', fontSize: '12px', letterSpacing: '0.05em', textAlign: h === '발주액' ? 'right' : (h === '날짜' || h === '수주사' ? 'center' : 'left'), whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {processedOrders.map(order => {
                  const pi = quotations.find(q => q.id === order.quotationId);
                  const amount = pi?.totalUsd || order.totalAmount || 0;
                  const currentStep = mapStatusToStep(order.status || '', order);
                  const currentStepKey = stepToStageKey[currentStep] as StageKey;
                  const { pct } = getOverallProgress(order);
                  const lvlColor = order.nextAction.level === 'RED' ? '#ef4444' : order.nextAction.level === 'ORANGE' ? '#f59e0b' : '#64748b';
                  const lvlBg = order.nextAction.level === 'RED' ? '#fef2f2' : order.nextAction.level === 'ORANGE' ? '#fffbeb' : '#f8fafc';
                  const lvlBdr = order.nextAction.level === 'RED' ? '#fecaca' : order.nextAction.level === 'ORANGE' ? '#fef3c7' : '#e2e8f0';
                  
                  const isYS = order.issuingCompany === 'YS';
                  const issuerBadge = isYS
                    ? <span style={{ fontSize: '12px', fontWeight: 800, background: '#ecfdf5', color: '#047857', padding: '4px 12px', borderRadius: '12px', border: '1px solid #a7f3d0' }}>영성ACC</span>
                    : <span style={{ fontSize: '12px', fontWeight: 800, background: '#eff6ff', color: '#1d4ed8', padding: '4px 12px', borderRadius: '12px', border: '1px solid #bfdbfe' }}>YSACC</span>;

                  return (
                    <tr
                      key={order.id}
                      onClick={() => navigate(`/orders/${order.id}?step=수주정보`)}
                      style={{ borderBottom: '1px solid #e2e8f0', height: '60px', cursor: 'pointer', transition: 'background-color 0.2s' }}
                      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#f8fafc'}
                      onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}
                    >
                      <td style={{ padding: '9px 16px', color: '#64748b', fontSize: '13px', fontWeight: 500, textAlign: 'center', whiteSpace: 'nowrap' }}>{order.poDate || '-'}</td>
                      <td style={{ padding: '9px 16px', fontWeight: 700, color: '#2563eb', fontSize: '13.5px', whiteSpace: 'nowrap' }}>{getFormattedPoId(order.id, order.issuingCompany)}</td>
                      <td style={{ padding: '9px 16px', textAlign: 'center' }}>{issuerBadge}</td>
                      <td style={{ padding: '9px 16px', color: '#1e293b', fontWeight: 600, fontSize: '13.5px' }}>{order.customer}</td>
                      <td style={{ padding: '9px 16px', fontWeight: 700, color: '#0f766e', textAlign: 'right', whiteSpace: 'nowrap', fontSize: '14.5px' }}>
                        ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      {/* 단계 */}
                      <td style={{ padding: '9px 16px', minWidth: '200px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ 
                               background: currentStep === '완료' ? '#ecfdf5' : '#eff6ff', 
                               color: currentStep === '완료' ? '#10b981' : '#2563eb', 
                               border: currentStep === '완료' ? '1px solid #a7f3d0' : '1px solid #bfdbfe', 
                               fontSize: '12px', 
                               fontWeight: 700, 
                               padding: '3px 10px', 
                               borderRadius: '20px', 
                               whiteSpace: 'nowrap' 
                             }}>
                              {currentStep}
                            </span>
                            <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500 }}>
                              {pct}%
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: '2px' }}>
                            {STAGE_KEYS.map((sk) => {
                              const { done, total } = getStageProgress(order, sk);
                              const isCurrent = sk === currentStepKey;
                              const isDone = total > 0 && done === total;
                              const color = isDone ? '#10b981' : isCurrent ? '#2563eb' : done > 0 ? '#93c5fd' : '#e2e8f0';
                              return <div key={sk} title={sk} style={{ flex: 1, height: '5px', borderRadius: '3px', background: color }} />;
                            })}
                          </div>
                        </div>
                      </td>
                       {/* 다음단계 */}
                      <td style={{ padding: '9px 16px' }}>
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
                               <span>{todoText}</span>
                             </div>
                           );
                        })()}
                      </td>
                    </tr>
                  );
                })}
                {processedOrders.length > 0 && (
                  <tr style={{ backgroundColor: '#f8fafc', borderTop: '2.5px solid #cbd5e1' }}>
                    <td colSpan={4} style={{ padding: '14px 16px', color: '#1e293b', textAlign: 'right', fontSize: '16px', fontWeight: 800 }}>합계</td>
                    <td style={{ padding: '14px 16px', color: '#0f172a', fontSize: '16px', fontWeight: 800, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      ${processedOrders.reduce((sum, o) => {
                        const pi = quotations.find(q => q.id === o.quotationId);
                        return sum + (pi?.totalUsd || o.totalAmount || 0);
                      }, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td /><td />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '14px', padding: '8px 16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', fontSize: '11.5px', color: '#64748b', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, color: '#475569' }}>💡 진행바 색상:</span>
            {[['#10b981','완료'],['#2563eb','현재단계'],['#f59e0b','조치필요'],['#cbd5e1','미시작']].map(([c,l]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{ width: '16px', height: '5px', borderRadius: '3px', background: c }} /> {l}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );

  // ── 메인 렌더링 ───────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px 30px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.025em' }}>주문 관리 대시보드</h1>
          <select 
            value={issuingCompanyFilter} 
            onChange={e => setIssuingCompanyFilter(e.target.value)} 
            style={{ 
              padding: '6px 12px', border: '1.5px solid #cbd5e1', borderRadius: '6px', 
              fontSize: '14px', fontWeight: 700, color: '#475569', 
              outline: 'none', background: '#fff', cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}
          >
            <option value="All">🏢 전체 ISSUER</option>
            <option value="YSACC">YSACC</option>
            <option value="YS">영성ACC</option>
          </select>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '12px', boxShadow: '0 2px 4px rgba(37,99,235,0.15)', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          ➕ 신규 PO 등록
        </button>
      </div>

      {/* 스탯 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '10px' }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#475569' }}>진행 중 오더</span>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#0f172a' }}>{stats.activeCount} 건</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#475569' }}>진행 수주금액</span>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>(YSACC: ${Math.round(stats.totalYsaccUsd).toLocaleString()} / 영성: ${Math.round(stats.totalYsUsd).toLocaleString()})</span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#0f766e' }}>${stats.totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        <div style={{ background: stats.urgentCount > 0 ? '#fef2f2' : '#fff', border: stats.urgentCount > 0 ? '1px solid #fecaca' : '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: stats.urgentCount > 0 ? '#dc2626' : '#475569' }}>오늘 처리 필요 (긴급)</span>
          <div style={{ fontSize: '22px', fontWeight: 900, color: stats.urgentCount > 0 ? '#dc2626' : '#0f172a' }}>{stats.urgentCount} 건</div>
        </div>
      </div>

      {/* 뷰 전환 탭 + 필터 통합 한 줄 */}
      <FilterBar />



      {/* 뷰 컨텐츠 */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#64748b', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          주문 정보를 로딩 중입니다...
        </div>
      ) : processedOrders.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#64748b', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
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
          onClose={() => { setIsModalOpen(false); setSelectedQuotationId(undefined); }}
          onSaveSuccess={() => { setIsModalOpen(false); setSelectedQuotationId(undefined); }}
          currentUser={currentUser}
          initialQuotationId={selectedQuotationId}
        />
      )}
    </div>
  );
};
