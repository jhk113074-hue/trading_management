import React, { useState, useEffect, useMemo } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db, COMPANY_ID } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import type { Order } from '../types/order';
import type { ProformaInvoice } from '../types/pi';
import { NewOrderModal } from '../components/NewOrderModal';

interface NextAction {
  text: string;
  level: 'RED' | 'ORANGE' | 'WHITE';
  step: 'PO접수' | '소싱발주' | '선적관리' | '정산마감';
}

const mapStatusToStep = (st: string): 'PO접수' | '소싱발주' | '선적관리' | '정산마감' => {
  if (st === "주문" || st === "PO접수") return "PO접수";
  if (st === "발주" || st === "소싱발주") return "소싱발주";
  if (st === "선적관리") return "선적관리";
  if (st === "이익관리" || st === "정산마감") return "정산마감";
  return "PO접수";
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

  // Rules Engine: Compute Next Action for an Order
  const getNextAction = (order: Order): NextAction => {
    const currentStep = mapStatusToStep(order.status || '');
    const todayStr = new Date().toISOString().split('T')[0];

    // 1. PO 접수
    if (currentStep === 'PO접수') {
      // Condition A: L/C is used, L/C file/info discrepancy
      if (order.isLc === 'Y' && order.lcNo && order.lcNo.includes('DISCREPANCY')) {
        return { text: 'L/C와 PI 불일치건 존재 — 확인 필요', level: 'RED', step: 'PO접수' };
      }
      // Condition B: incoterms or paymentTerms is empty
      if (!order.incoterms || !order.paymentTerms) {
        return { text: '거래조건(인코텀즈/결제조건) 확인 필요', level: 'WHITE', step: 'PO접수' };
      }
      // Default
      return { text: '소싱 발주 단계로 진행 필요', level: 'WHITE', step: 'PO접수' };
    }

    // 2. 소싱 발주
    if (currentStep === '소싱발주') {
      // Condition A: supplier unassigned
      const hasUnassignedSupplier = order.items?.some(it => !it.supplier);
      if (hasUnassignedSupplier) {
        const count = order.items?.filter(it => !it.supplier).length || 0;
        return { text: `품목 ${count}개 공급사 미배정`, level: 'ORANGE', step: '소싱발주' };
      }

      // Collect suppliers
      const suppliers = Array.from(new Set(order.items?.map(it => it.supplier).filter(Boolean)));

      // Condition B: PO sent check
      for (const sup of suppliers) {
        if (order.supplierPoSent && order.supplierPoSent[sup] === false) {
          return { text: `공급사 ${sup} 발주서 미발송`, level: 'ORANGE', step: '소싱발주' };
        }
      }

      // Condition C: Production date passed & no COA files
      const hasCoa = order.coaFiles && order.coaFiles.length > 0;
      if (!hasCoa) {
        for (const sup of suppliers) {
          const prodDate = order.supplierProductionDates?.[sup];
          if (prodDate && prodDate < todayStr) {
            return { text: `공급사 ${sup} COA 미수취 (생산기한경과)`, level: 'ORANGE', step: '소싱발주' };
          }
        }
      }

      return { text: '선적 관리 단계로 진행 필요', level: 'WHITE', step: '소싱발주' };
    }

    // 3. 선적 관리
    if (currentStep === '선적관리') {
      // Condition A: ETD within 3 days and documents not complete
      if (order.etd) {
        const diffTime = new Date(order.etd).getTime() - Date.now();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays <= 3 && order.ciPlStatus !== 'Y') {
          return { text: `서류 마감 D-${diffDays > 0 ? diffDays : 0} · 포워더 확정 필요`, level: 'RED', step: '선적관리' };
        }
      }
      // Condition B: Forwarder empty
      if (!order.forwarderConfirmed && (!order.forwarders || order.forwarders.length === 0)) {
        return { text: '지정 포워더 미확정', level: 'WHITE', step: '선적관리' };
      }

      return { text: '정산 마감 단계로 진행 필요', level: 'WHITE', step: '선적관리' };
    }

    // 4. 정산 마감
    if (currentStep === '정산마감') {
      const suppliers = Array.from(new Set(order.items?.map(it => it.supplier).filter(Boolean)));
      
      // Condition A: AP due date passed and payment uncompleted
      if (order.supplierPayments) {
        for (const sup of suppliers) {
          const payInfo = order.supplierPayments[sup];
          if (payInfo && payInfo.status !== '결제완료') {
            // Assume due date passed if not paid
            return { text: `공급사 ${sup} 대금결제 필요`, level: 'RED', step: '정산마감' };
          }
        }
      }

      // Condition B: AR expected date passed but received date empty
      if (order.paymentCollectedDate === undefined || order.paymentCollectedDate === '') {
        return { text: '고객 대금 미수금 발생', level: 'RED', step: '정산마감' };
      }

      // Condition C: Tax invoice empty
      const invoicePending = suppliers.some(sup => !order.supplierTaxInvoice || order.supplierTaxInvoice[sup] !== 'Y');
      if (invoicePending) {
        return { text: '세금계산서 발행 대기', level: 'ORANGE', step: '정산마감' };
      }

      return { text: '정산 완료', level: 'WHITE', step: '정산마감' };
    }

    return { text: '오더 확인 필요', level: 'WHITE', step: 'PO접수' };
  };

  // Get managers list for filters
  const managers = useMemo(() => {
    const list = new Set<string>();
    orders.forEach(o => {
      if (o.manager) list.add(o.manager);
    });
    return Array.from(list).sort();
  }, [orders]);

  // Compute stats
  const stats = useMemo(() => {
    const activeOrders = orders.filter(o => o.status !== '이익관리');
    const totalUsd = activeOrders.reduce((sum, o) => {
      const pi = quotations.find(q => q.id === o.quotationId);
      return sum + (pi?.totalUsd || o.totalAmount || 0);
    }, 0);

    const totalYsaccUsd = activeOrders.filter(o => o.issuingCompany === 'YSACC' || !o.issuingCompany).reduce((sum, o) => {
      const pi = quotations.find(q => q.id === o.quotationId);
      return sum + (pi?.totalUsd || o.totalAmount || 0);
    }, 0);

    const totalYsUsd = activeOrders.filter(o => o.issuingCompany === 'YS').reduce((sum, o) => {
      const pi = quotations.find(q => q.id === o.quotationId);
      return sum + (pi?.totalUsd || o.totalAmount || 0);
    }, 0);

    const urgentCount = orders.filter(o => {
      const action = getNextAction(o);
      return action.level === 'RED';
    }).length;

    return {
      activeCount: activeOrders.length,
      totalUsd,
      totalYsaccUsd,
      totalYsUsd,
      urgentCount
    };
  }, [orders, quotations]);

  // Filter & Sort
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

    // Sort by Urgency (RED -> ORANGE -> WHITE) and then ID descending
    const levelWeight = { RED: 3, ORANGE: 2, WHITE: 1 };
    result.sort((a, b) => {
      const weightA = levelWeight[a.nextAction.level] || 0;
      const weightB = levelWeight[b.nextAction.level] || 0;
      if (weightB !== weightA) return weightB - weightA;
      return b.id.localeCompare(a.id);
    });

    return result;
  }, [orders, quotations, issuingCompanyFilter, managerFilter, stepFilter, viewFilter]);

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
      <div style={{ display: 'flex', gap: '12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>발행사</label>
          <select value={issuingCompanyFilter} onChange={e => setIssuingCompanyFilter(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', width: '130px' }}>
            <option value="All">전체</option>
            <option value="YS">영성ACC</option>
            <option value="YSACC">YSACC</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>담당자</label>
          <select value={managerFilter} onChange={e => setManagerFilter(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', width: '130px' }}>
            <option value="All">전체</option>
            {managers.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>단계</label>
          <select value={stepFilter} onChange={e => setStepFilter(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', width: '130px' }}>
            <option value="All">전체</option>
            <option value="PO접수">PO 접수</option>
            <option value="소싱발주">소싱 발주</option>
            <option value="선적관리">선적 관리</option>
            <option value="정산마감">정산 마감</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>보기 구분</label>
          <select value={viewFilter} onChange={e => setViewFilter(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', width: '160px' }}>
            <option value="All">전체 오더 보기</option>
            <option value="Urgent">⚠️ 오늘 처리 필요만</option>
          </select>
        </div>
      </div>

      {/* Dashboard List */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>주문 정보를 로딩 중입니다...</div>
        ) : processedOrders.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>등록된 주문 정보가 없습니다.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {processedOrders.map((order, idx) => {
              const pi = quotations.find(q => q.id === order.quotationId);
              const orderAmount = pi?.totalUsd || order.totalAmount || 0;
              const currentStep = mapStatusToStep(order.status || '');

              // Urgent color styling
              const levelColor = order.nextAction.level === 'RED' ? '#ef4444' : order.nextAction.level === 'ORANGE' ? '#f59e0b' : '#64748b';
              const levelBg = order.nextAction.level === 'RED' ? '#fef2f2' : order.nextAction.level === 'ORANGE' ? '#fffbeb' : '#f8fafc';
              const levelBorder = order.nextAction.level === 'RED' ? '#fecaca' : order.nextAction.level === 'ORANGE' ? '#fef3c7' : '#e2e8f0';

              return (
                <div 
                  key={order.id}
                  onClick={() => navigate(`/orders/${order.id}?step=PO접수`)}
                  style={{
                    display: 'flex', alignItems: 'center', padding: '18px 24px',
                    borderBottom: idx === processedOrders.length - 1 ? 'none' : '1px solid #f1f5f9',
                    cursor: 'pointer', transition: 'background-color 0.15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  {/* Left: ID & Customer & Amount */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '220px', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>{order.id}</span>
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: order.issuingCompany === 'YSACC' ? '#dbeafe' : '#fef9c3', color: order.issuingCompany === 'YSACC' ? '#1e40af' : '#ca8a04' }}>
                        {order.issuingCompany || 'YSACC'}
                      </span>
                    </div>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>{order.customer}</span>
                  </div>

                  <div style={{ width: '130px', flexShrink: 0, fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>
                    ${orderAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>

                  {/* Middle: Progress Circle Indicator */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '240px', flexShrink: 0 }}>
                    {/* Circle 1 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ color: currentStep === 'PO접수' || currentStep === '소싱발주' || currentStep === '선적관리' || currentStep === '정산마감' ? '#2563eb' : '#cbd5e1', fontSize: '14px' }}>●</span>
                      <span style={{ fontSize: '11px', fontWeight: currentStep === 'PO접수' ? 700 : 500, color: currentStep === 'PO접수' ? '#1e293b' : '#64748b' }}>PO접수</span>
                    </div>
                    <span style={{ color: '#cbd5e1', fontSize: '12px' }}>&gt;</span>
                    {/* Circle 2 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ color: currentStep === '소싱발주' || currentStep === '선적관리' || currentStep === '정산마감' ? '#2563eb' : '#cbd5e1', fontSize: '14px' }}>●</span>
                      <span style={{ fontSize: '11px', fontWeight: currentStep === '소싱발주' ? 700 : 500, color: currentStep === '소싱발주' ? '#1e293b' : '#64748b' }}>소싱발주</span>
                    </div>
                    <span style={{ color: '#cbd5e1', fontSize: '12px' }}>&gt;</span>
                    {/* Circle 3 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ color: currentStep === '선적관리' || currentStep === '정산마감' ? '#2563eb' : '#cbd5e1', fontSize: '14px' }}>●</span>
                      <span style={{ fontSize: '11px', fontWeight: currentStep === '선적관리' ? 700 : 500, color: currentStep === '선적관리' ? '#1e293b' : '#64748b' }}>선적관리</span>
                    </div>
                    <span style={{ color: '#cbd5e1', fontSize: '12px' }}>&gt;</span>
                    {/* Circle 4 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ color: currentStep === '정산마감' ? '#2563eb' : '#cbd5e1', fontSize: '14px' }}>●</span>
                      <span style={{ fontSize: '11px', fontWeight: currentStep === '정산마감' ? 700 : 500, color: currentStep === '정산마감' ? '#1e293b' : '#64748b' }}>정산마감</span>
                    </div>
                  </div>

                  {/* Right: Next Action Warning Box */}
                  <div style={{ flex: 1, paddingLeft: '24px' }}>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      padding: '6px 12px', borderRadius: '20px',
                      background: levelBg, border: `1px solid ${levelBorder}`,
                      color: levelColor, fontSize: '12px', fontWeight: 600
                    }}>
                      <span>{order.nextAction.level === 'RED' ? '⚠️' : order.nextAction.level === 'ORANGE' ? '⏰' : '→'}</span>
                      <span>{order.nextAction.text}</span>
                    </div>
                  </div>

                  {/* Arrow Action */}
                  <div style={{ color: '#94a3b8', fontSize: '16px', fontWeight: 'bold' }}>›</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isModalOpen && (
        <NewOrderModal 
          onClose={() => setIsModalOpen(false)}
          onSaveSuccess={() => {
            setIsModalOpen(false);
          }}
          currentUser={currentUser}
        />
      )}
    </div>
  );
};
