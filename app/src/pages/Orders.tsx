import React, { useState, useEffect, useMemo } from 'react';
import { collection, doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db, COMPANY_ID } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import type { Order } from '../types/order';
import { NewOrderModal } from '../components/NewOrderModal';

export const Orders: React.FC = () => {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [initialSelectedQuoteId, setInitialSelectedQuoteId] = useState('');

  // Check if we navigated to this page to create a PO from a PI
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const createFromPi = params.get('createFromPi');
    if (createFromPi) {
      setInitialSelectedQuoteId(createFromPi);
      setIsModalOpen(true);
      // Clean query parameter from URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');

  // Real-time Firestore sync
  useEffect(() => {
    const ordersRef = collection(doc(db, 'companies', COMPANY_ID), 'orders');
    const unsubscribe = onSnapshot(ordersRef, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      setOrders(list);
      setLoading(false);
    }, (err) => {
      console.error("Failed to sync orders:", err);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Compute Suppliers list for dropdown
  const allSuppliers = useMemo(() => {
    const set = new Set<string>();
    orders.forEach(o => {
      o.items?.forEach(item => {
        if (item.supplier?.trim()) {
          set.add(item.supplier.trim());
        }
      });
    });
    return Array.from(set).sort();
  }, [orders]);

  // Compute KPI cards
  const kpis = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-11

    let thisMonthCount = 0;
    let waitingCount = 0;
    let issuedCount = 0;
    let thisMonthTotalUsd = 0;

    orders.forEach(o => {
      if (o.poDate) {
        const d = new Date(o.poDate);
        if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
          thisMonthCount++;
          const exRate = o.exchangeRate || 1400;
          const orderUsdAmount = o.items?.reduce((sum, it) => {
            if (it.currency === 'KRW') {
              return sum + (it.amount || 0) / exRate;
            } else {
              return sum + (it.amount || 0);
            }
          }, 0) || o.totalAmount || 0;
          thisMonthTotalUsd += orderUsdAmount;
        }
      }
      if (o.status === 'ORDER기본정보') {
        waitingCount++;
      } else {
        issuedCount++;
      }
    });

    return {
      thisMonthCount,
      waitingCount,
      issuedCount,
      thisMonthTotalUsd
    };
  }, [orders]);

  // Handle Order status transition to '발주서 발행' (trigger Purchase Order issued)
  const handleIssuePo = async (e: React.MouseEvent, order: Order) => {
    e.stopPropagation();
    if (!window.confirm(`⚠️ PO [${order.id}]의 발주서를 '발주서 발행' 단계로 변경하시겠습니까?`)) return;
    try {
      const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
      await setDoc(orderRef, {
        status: '발주서 발행',
        poIssuedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });
      alert('✅ 발주서 발행 단계로 변경되었습니다.');
    } catch (err: any) {
      alert('❌ 발행 오류: ' + err.message);
    }
  };

  // Filter & Search logic
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      // 1. Text Search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesId = (o.id || '').toLowerCase().includes(query);
        const matchesCust = (o.customer || '').toLowerCase().includes(query);
        const matchesCustPo = (o.custPo || '').toLowerCase().includes(query);
        if (!matchesId && !matchesCust && !matchesCustPo) return false;
      }
      // 2. Status Filter
      if (statusFilter && o.status !== statusFilter) {
        return false;
      }
      // 3. Supplier Filter
      if (supplierFilter) {
        const hasSupplier = o.items?.some(item => (item.supplier || '').trim() === supplierFilter);
        if (!hasSupplier) return false;
      }
      return true;
    }).sort((a, b) => (b.poDate || '').localeCompare(a.poDate || ''));
  }, [orders, searchQuery, statusFilter, supplierFilter]);

  // Export to CSV with UTF-8 BOM
  const handleExportCsv = () => {
    if (filteredOrders.length === 0) {
      alert('내보낼 발주 목록이 없습니다.');
      return;
    }

    const headers = [
      'PO번호', '고객사PO번호', '고객사', '공급사', '품목',
      '총수량', '총금액', 'Incoterms', 'PaymentTerms',
      'PO접수일', '요청납기일', '상태', '담당자'
    ];

    const rows = filteredOrders.map(o => {
      const suppliers = Array.from(new Set(o.items?.map(it => it.supplier).filter(Boolean))).join(', ');
      const itemsSummary = o.items?.map(it => `${it.name}(${it.qty}${it.unit})`).join(' | ');
      const totalQty = o.items?.reduce((sum, it) => sum + (it.qty || 0), 0) || 0;

      const usdTotal = o.items?.filter(it => it.currency !== 'KRW').reduce((sum, it) => sum + (it.amount || 0), 0) || 0;
      const krwTotal = o.items?.filter(it => it.currency === 'KRW').reduce((sum, it) => sum + (it.amount || 0), 0) || 0;
      const parts = [];
      if (usdTotal > 0) parts.push(`$${usdTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD`);
      if (krwTotal > 0) parts.push(`₩${krwTotal.toLocaleString()} KRW`);
      const amtStr = parts.length > 0 ? parts.join(' / ') : '$0.00 USD';

      return [
        o.id,
        o.custPo || '-',
        o.customer || '-',
        suppliers || '-',
        itemsSummary || '-',
        totalQty,
        amtStr,
        o.incoterms || '-',
        o.paymentTerms || '-',
        o.poDate || '-',
        o.requestedDelivery || '-',
        o.status,
        o.manager || '-'
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(val => {
        const str = typeof val === 'string' ? val.replace(/"/g, '""') : String(val);
        return str.includes(',') || str.includes('\n') || str.includes('"') ? `"${str}"` : str;
      }).join(','))
    ].join('\n');

    // Add BOM for Excel compatibility
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];
    link.href = url;
    link.setAttribute('download', `PO_목록_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const statusColors: Record<string, { bg: string, text: string }> = {
    'ORDER기본정보': { bg: '#fef3c7', text: '#d97706' },
    '발주서 발행': { bg: '#dcfce7', text: '#15803d' },
    '공급사별 납기 결정': { bg: '#eff6ff', text: '#2563eb' },
    '선적&진행현황': { bg: '#faf5ff', text: '#7c3aed' },
    '선적서류 작성 및 수출신고': { bg: '#ecfeff', text: '#0891b2' },
    '공급사 세금계산서 및 결제': { bg: '#f0fdf4', text: '#16a34a' },
    '선적서류 발송 및 은행제출': { bg: '#e0f2fe', text: '#0369a1' },
    '이익계산': { bg: '#f1f5f9', text: '#475569' }
  };

  const currentUser = userProfile?.name || '담당자';

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', margin: 0 }}>발주서 관리 (PO)</h1>
          <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '4px' }}>수주 확정 내역 관리 및 공급사 발주서 생성 모듈</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={handleExportCsv}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#fff', border: '1px solid #cbd5e1', color: '#374151', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
          >
            📊 CSV 내보내기
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#2563eb', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
          >
            ➕ 신규 PO 등록
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '18px' }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>이번달 PO 수주 건수</span>
          <span style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a' }}>{kpis.thisMonthCount} 건</span>
        </div>

        <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '10px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#d97706' }}>발주 대기 건수</span>
          <span style={{ fontSize: '24px', fontWeight: 800, color: '#d97706' }}>{kpis.waitingCount} 건</span>
        </div>

        <div style={{ background: '#f0fdf4', border: '1px solid #dcfce7', borderRadius: '10px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#16a34a' }}>발행 완료 건수</span>
          <span style={{ fontSize: '24px', fontWeight: 800, color: '#16a34a' }}>{kpis.issuedCount} 건</span>
        </div>

        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>이번달 총 수주금액</span>
          <span style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a' }}>${kpis.thisMonthTotalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: '12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', alignItems: 'center' }}>
        <input 
          type="text" 
          placeholder="PO번호, 고객사, 고객사PO 검색..." 
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', width: '250px' }}
        />

        <select 
          value={statusFilter} 
          onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', width: '150px' }}
        >
          <option value="">전체 상태</option>
          <option value="ORDER기본정보">ORDER기본정보</option>
          <option value="발주서 발행">발주서 발행</option>
          <option value="공급사별 납기 결정">공급사별 납기 결정</option>
          <option value="선적&진행현황">선적&진행현황</option>
          <option value="선적서류 작성 및 수출신고">선적서류 작성 및 수출신고</option>
          <option value="공급사 세금계산서 및 결제">공급사 세금계산서 및 결제</option>
          <option value="선적서류 발송 및 은행제출">선적서류 발송 및 은행제출</option>
          <option value="이익계산">이익계산</option>
        </select>

        <select 
          value={supplierFilter} 
          onChange={e => setSupplierFilter(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', width: '180px' }}
        >
          <option value="">전체 공급업체</option>
          {allSuppliers.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 600, color: '#475569' }}>
          총 {filteredOrders.length}건
        </span>
      </div>

      {/* Table Container */}
      <div style={{ overflowX: 'auto', backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
          <thead style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
            <tr>
              <th style={{ padding: '12px 16px', fontWeight: 700 }}>PO 번호</th>
              <th style={{ padding: '12px 16px', fontWeight: 700 }}>고객사</th>
              <th style={{ padding: '12px 16px', fontWeight: 700 }}>공급사</th>
              <th style={{ padding: '12px 16px', fontWeight: 700 }}>품목 요약</th>
              <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>총 수량</th>
              <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>총 금액</th>
              <th style={{ padding: '12px 16px', fontWeight: 700 }}>Incoterms</th>
              <th style={{ padding: '12px 16px', fontWeight: 700 }}>PO접수일</th>
              <th style={{ padding: '12px 16px', fontWeight: 700 }}>요청납기일</th>
              <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>상태</th>
              <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>발행사</th>
              <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>액션</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={12} style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                  데이터 실시간 동기화 중...
                </td>
              </tr>
            ) : filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={12} style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                  등록된 발주 내역이 없거나 검색 결과가 없습니다.
                </td>
              </tr>
            ) : (
              filteredOrders.map(o => {
                const sBadge = statusColors[o.status] || { bg: '#f1f5f9', text: '#475569' };
                const suppliers = Array.from(new Set(o.items?.map(it => it.supplier).filter(Boolean)));
                const itemsSummary = o.items?.slice(0, 2).map(it => `${it.name}`).join(', ');
                const itemsMore = o.items && o.items.length > 2 ? ` 외 ${o.items.length - 2}건` : '';
                const totalQty = o.items?.reduce((sum, it) => sum + (it.qty || 0), 0) || 0;

                return (
                  <tr 
                    key={o.id} 
                    onClick={() => navigate(`/orders/${o.id}`)}
                    style={{ borderBottom: '1px solid #e2e8f0', cursor: 'pointer', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <td style={{ padding: '12px 16px', color: '#2563eb', fontWeight: 600 }}>{o.id}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 500 }}>{o.customer || '-'}</td>
                    <td style={{ padding: '12px 16px', color: '#475569' }}>
                      {suppliers.length > 0 ? suppliers.slice(0, 2).join(', ') + (suppliers.length > 2 ? '...' : '') : '-'}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#64748b' }}>{itemsSummary}{itemsMore}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>{totalQty.toLocaleString('en-US')}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {(() => {
                        const usdTotal = o.items?.filter(it => it.currency !== 'KRW').reduce((sum, it) => sum + (it.amount || 0), 0) || 0;
                        const krwTotal = o.items?.filter(it => it.currency === 'KRW').reduce((sum, it) => sum + (it.amount || 0), 0) || 0;
                        const parts = [];
                        if (usdTotal > 0) parts.push(`$${usdTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
                        if (krwTotal > 0) parts.push(`₩${krwTotal.toLocaleString('en-US')}`);
                        if (parts.length === 0) return '$0.00';
                        return parts.join(' / ');
                      })()}
                    </td>
                    <td style={{ padding: '12px 16px' }}>{o.incoterms || '-'}</td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>{o.poDate || '-'}</td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>{o.requestedDelivery || '-'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span style={{ display: 'inline-block', padding: '4px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, backgroundColor: sBadge.bg, color: sBadge.text }}>
                        {o.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      {o.issuingCompany === 'YS' ? (
                        <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, backgroundColor: '#dcfce7', color: '#15803d', whiteSpace: 'nowrap' }}>영성ACC</span>
                      ) : (
                        <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, backgroundColor: '#dbeafe', color: '#1d4ed8', whiteSpace: 'nowrap' }}>YSACC</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button 
                          onClick={() => navigate(`/orders/${o.id}`)}
                          style={{ border: '1px solid #e2e8f0', background: '#fff', color: '#475569', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                        >
                          👁 상세
                        </button>
                        {o.status === 'ORDER기본정보' && (
                          <button 
                            onClick={e => handleIssuePo(e, o)}
                            style={{ border: 'none', background: '#e2e8f0', color: '#1e293b', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                          >
                            발주발행
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <NewOrderModal 
          onClose={() => { setIsModalOpen(false); setInitialSelectedQuoteId(''); }}
          onSaveSuccess={() => {}}
          currentUser={currentUser}
          initialQuotationId={initialSelectedQuoteId}
        />
      )}

    </div>
  );
};
