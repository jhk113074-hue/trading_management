import React, { useState, useEffect, useMemo } from 'react';
import { collection, doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db, COMPANY_ID } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import type { Order } from '../types/order';
import { NewOrderModal } from '../components/NewOrderModal';
import { QuickEditModal } from '../components/QuickEditModal';

const COLUMN_OPTIONS = [
  { key: 'customer', label: '고객사' },
  { key: 'issuingCompany', label: '매출사' },
  { key: 'invoiceAmount', label: '인보이스 금액' },
  { key: 'cargoReady', label: '화물준비 / CFS입고' },
  { key: 'volumeVessel', label: '선명·항차 / VOLUME' },
  { key: 'shipmentSchedule', label: '서류마감 / ETD / ETA' },
  { key: 'supplier', label: '구입사 (공급업체)' },
  { key: 'items', label: '품목' },
  { key: 'supplierAmount', label: '발주금액' },
  { key: 'supplierRemitted', label: '결제' },
  { key: 'invoiceSent', label: '인보이스 송부' },
  { key: 'inco', label: 'INCO' },
  { key: 'paymentTerms', label: 'LC/TT' },
  { key: 'exportNo', label: '수출신고번호' },
  { key: 'docsSent', label: '선적서류 송부' },
  { key: 'bankSubmitted', label: '은행 제출' },
  { key: 'trackingNo', label: 'TRACKING NO' },
  { key: 'paymentCollected', label: '대금 영수' },
  { key: 'status', label: '상태' },
  { key: 'remark', label: '비고' }
];

export const Orders: React.FC = () => {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [initialSelectedQuoteId, setInitialSelectedQuoteId] = useState('');
  const [viewMode, setViewMode] = useState<'simple' | 'ledger'>('ledger');

  // Outlook-style column settings
  const defaultVisibleCols = [
    'customer', 'issuingCompany', 'invoiceAmount', 'cargoReady', 'volumeVessel', 'shipmentSchedule',
    'supplier', 'items', 'supplierAmount', 'supplierRemitted', 'invoiceSent', 'inco', 'paymentTerms',
    'exportNo', 'docsSent', 'bankSubmitted', 'trackingNo', 'paymentCollected',
    'status', 'remark'
  ];

  const [visibleCols, setVisibleCols] = useState<string[]>(() => {
    const saved = localStorage.getItem(`po_visible_cols_${userProfile?.id || 'default'}`);
    return saved ? JSON.parse(saved) : defaultVisibleCols;
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  interface EditingCell {
    order: Order;
    colKey: string;
    title: string;
  }
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);

  const toggleColVisibility = (colKey: string) => {
    setVisibleCols(prev => {
      const next = prev.includes(colKey) 
        ? prev.filter(k => k !== colKey) 
        : [...prev, colKey];
      localStorage.setItem(`po_visible_cols_${userProfile?.id || 'default'}`, JSON.stringify(next));
      return next;
    });
  };

  // Resizable column widths state
  const [colWidths, setColWidths] = useState<Record<string, number>>({
    no: 40,
    piPo: 130,
    customer: 150,
    issuingCompany: 100,
    items: 180,
    cargoReady: 120,
    volumeVessel: 150,
    shipmentSchedule: 120,
    invoiceAmount: 130,
    supplier: 160,
    supplierAmount: 160,
    invoiceSent: 80,
    inco: 60,
    paymentTerms: 60,
    exportNo: 140,
    docsSent: 85,
    bankSubmitted: 85,
    trackingNo: 120,
    paymentCollected: 100,
    supplierRemitted: 150,
    status: 120,
    remark: 120
  });

  const [piMap, setPiMap] = useState<Record<string, number>>({});

  // Sorting state
  const [sortField, setSortField] = useState<string>('poDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Load saved column widths from localStorage on load
  useEffect(() => {
    const saved = localStorage.getItem(`po_col_widths_${userProfile?.id || 'default'}`);
    if (saved) {
      setColWidths(JSON.parse(saved));
    }
  }, [userProfile]);

  const handleResizeStart = (colKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.pageX;
    const startWidth = colWidths[colKey];

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const currentWidth = Math.max(30, startWidth + (moveEvent.pageX - startX));
      setColWidths(prev => {
        const next = { ...prev, [colKey]: currentWidth };
        localStorage.setItem(`po_col_widths_${userProfile?.id || 'default'}`, JSON.stringify(next));
        return next;
      });
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

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
  const [issuingCompanyFilter, setIssuingCompanyFilter] = useState('');

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

  // Sync proforma invoices to get their final USD totals
  useEffect(() => {
    const pisRef = collection(doc(db, 'companies', COMPANY_ID), 'proforma_invoices');
    const unsubscribe = onSnapshot(pisRef, (snap) => {
      const map: Record<string, number> = {};
      snap.docs.forEach(d => {
        const data = d.data();
        map[d.id] = data.totalUsd || 0;
      });
      setPiMap(map);
    }, (err) => {
      console.error("Failed to sync proforma invoices:", err);
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

  const handleQuickSave = async (orderId: string, fields: Partial<Order>) => {
    const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', orderId);
    await setDoc(orderRef, {
      ...fields,
      updatedAt: serverTimestamp()
    }, { merge: true });
  };

  // Filter & Search logic
  const filteredOrders = useMemo(() => {
    let result = orders.filter(o => {
      // 1. Text Search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesId = (o.id || '').toLowerCase().includes(query) || (o.ciNumber || '').toLowerCase().includes(query);
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
      // 4. Issuing Company Filter (매출사 필터)
      if (issuingCompanyFilter) {
        const isYS = o.issuingCompany === 'YS';
        const matches = issuingCompanyFilter === 'YS' ? isYS : !isYS;
        if (!matches) return false;
      }
      return true;
    });

    if (sortField) {
      result = [...result].sort((a, b) => {
        let valA: any = '';
        let valB: any = '';

        if (sortField === 'piPo') {
          valA = a.id || '';
          valB = b.id || '';
        } else if (sortField === 'customer') {
          valA = a.customer || '';
          valB = b.customer || '';
        } else if (sortField === 'issuingCompany') {
          valA = a.issuingCompany || '';
          valB = b.issuingCompany || '';
        } else if (sortField === 'items') {
          valA = (a.items?.map(it => it.name).filter(Boolean) || []).join(',');
          valB = (b.items?.map(it => it.name).filter(Boolean) || []).join(',');
        } else if (sortField === 'cargoReady') {
          valA = a.cargoReadyDate || '';
          valB = b.cargoReadyDate || '';
        } else if (sortField === 'shipmentCompleted') {
          valA = a.shipmentCompleted || '';
          valB = b.shipmentCompleted || '';
        } else if (sortField === 'etd') {
          valA = a.etd || '';
          valB = b.etd || '';
        } else if (sortField === 'eta') {
          valA = a.eta || '';
          valB = b.eta || '';
        } else if (sortField === 'volume') {
          valA = a.containerVolumeQuantities || '';
          valB = b.containerVolumeQuantities || '';
        } else if (sortField === 'vessel') {
          valA = a.vesselBooking || '';
          valB = b.vesselBooking || '';
        } else if (sortField === 'invoiceAmount') {
          const piAmtA = a.quotationId ? (piMap[a.quotationId] ?? 0) : 0;
          const piAmtB = b.quotationId ? (piMap[b.quotationId] ?? 0) : 0;
          valA = piAmtA;
          valB = piAmtB;
        } else if (sortField === 'supplier') {
          valA = (a.items?.map(it => it.supplier).filter(Boolean) || []).join(',');
          valB = (b.items?.map(it => it.supplier).filter(Boolean) || []).join(',');
        } else if (sortField === 'supplierAmount') {
          const totalUsdA = a.items?.filter(it => it.currency !== 'KRW').reduce((sum, it) => sum + (it.amount || 0), 0) || 0;
          const totalKrwA = a.items?.filter(it => it.currency === 'KRW').reduce((sum, it) => sum + (it.amount || 0), 0) || 0;
          const totalUsdB = b.items?.filter(it => it.currency !== 'KRW').reduce((sum, it) => sum + (it.amount || 0), 0) || 0;
          const totalKrwB = b.items?.filter(it => it.currency === 'KRW').reduce((sum, it) => sum + (it.amount || 0), 0) || 0;
          valA = totalUsdA + (totalKrwA / (a.exchangeRate || 1400));
          valB = totalUsdB + (totalKrwB / (b.exchangeRate || 1400));
        } else if (sortField === 'invoiceSent') {
          valA = a.ciPlSentDate || '';
          valB = b.ciPlSentDate || '';
        } else if (sortField === 'inco') {
          valA = a.incoterms || '';
          valB = b.incoterms || '';
        } else if (sortField === 'paymentTerms') {
          valA = a.paymentTerms || '';
          valB = b.paymentTerms || '';
        } else if (sortField === 'exportNo') {
          valA = a.exportDeclarationNo || '';
          valB = b.exportDeclarationNo || '';
        } else if (sortField === 'docsSent') {
          valA = a.shippingDocsSentDate || '';
          valB = b.shippingDocsSentDate || '';
        } else if (sortField === 'bankSubmitted') {
          valA = a.bankSubmissionDate || '';
          valB = b.bankSubmissionDate || '';
        } else if (sortField === 'trackingNo') {
          valA = a.shippingDocsTrackingNo || '';
          valB = b.shippingDocsTrackingNo || '';
        } else if (sortField === 'paymentCollected') {
          valA = a.paymentCollectedDate || '';
          valB = b.paymentCollectedDate || '';
        } else if (sortField === 'supplierRemitted') {
          const suppliersA = Array.from(new Set(a.items?.map(it => it.supplier).filter(Boolean)));
          const suppliersB = Array.from(new Set(b.items?.map(it => it.supplier).filter(Boolean)));
          const payDateA = suppliersA.map(sup => a.supplierPayments?.[sup]?.date || '').filter(Boolean).sort().shift() || '';
          const payDateB = suppliersB.map(sup => b.supplierPayments?.[sup]?.date || '').filter(Boolean).sort().shift() || '';
          valA = payDateA;
          valB = payDateB;
        } else if (sortField === 'status') {
          valA = a.status || '';
          valB = b.status || '';
        } else if (sortField === 'remark') {
          valA = a.remark || '';
          valB = b.remark || '';
        } else {
          valA = a.poDate || '';
          valB = b.poDate || '';
        }

        if (typeof valA === 'string') {
          return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else {
          return sortOrder === 'asc' ? valA - valB : valB - valA;
        }
      });
    }

    return result;
  }, [orders, searchQuery, statusFilter, supplierFilter, issuingCompanyFilter, sortField, sortOrder, piMap]);

  // Export to CSV with UTF-8 BOM
  const handleExportCsv = () => {
    if (filteredOrders.length === 0) {
      alert('내보낼 발주 목록이 없습니다.');
      return;
    }

    const headers = [
      'CI번호', '고객사PO번호', '고객사', '공급사', '품목',
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
        o.ciNumber || o.id,
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
    link.setAttribute('download', `CI_목록_${dateStr}.csv`);
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
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', margin: 0 }}>주문관리</h1>
          <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '4px' }}>수주 확정 내역 관리 및 공급사 발주서 생성 모듈</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {/* View Mode Toggle */}
          <div style={{ display: 'inline-flex', background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '3px', borderRadius: '8px' }}>
            <button 
              onClick={() => setViewMode('simple')}
              style={{ padding: '6px 12px', border: 'none', background: viewMode === 'simple' ? '#fff' : 'transparent', color: viewMode === 'simple' ? '#1e293b' : '#64748b', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '12px', boxShadow: viewMode === 'simple' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.15s' }}
            >
              📋 심플 리스트
            </button>
            <button 
              onClick={() => setViewMode('ledger')}
              style={{ padding: '6px 12px', border: 'none', background: viewMode === 'ledger' ? '#fff' : 'transparent', color: viewMode === 'ledger' ? '#1e293b' : '#64748b', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '12px', boxShadow: viewMode === 'ledger' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.15s' }}
            >
              📊 무역 관리대장
            </button>
          </div>

          <button 
            onClick={handleExportCsv}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#fff', border: '1px solid #cbd5e1', color: '#374151', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
          >
            📊 CSV 내보내기
          </button>
          {viewMode === 'ledger' && (
            <button 
              onClick={() => setIsSettingsOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#fff', border: '1px solid #cbd5e1', color: '#374151', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
            >
              ⚙ 표시 항목 설정
            </button>
          )}
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
          placeholder="CI번호, 고객사, 고객사PO 검색..." 
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

        <select 
          value={issuingCompanyFilter} 
          onChange={e => setIssuingCompanyFilter(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', width: '160px' }}
        >
          <option value="">전체 매출사</option>
          <option value="YS">영성ACC</option>
          <option value="YSACC">YSACC CO.,LTD</option>
        </select>

        <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 600, color: '#475569' }}>
          총 {filteredOrders.length}건
        </span>
      </div>

      {/* Table Container */}
      <div style={{ overflowX: 'auto', backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
        {viewMode === 'simple' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              <tr>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>CI 번호</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>고객사</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>공급사</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>품목 요약</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>총 수량</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>총 금액</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>Incoterms</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>발주일</th>
                <th style={{ padding: '12px 16px', fontWeight: 700 }}>요청납기일</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>상태</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>매출사</th>
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
                      <td style={{ padding: '12px 16px', color: '#2563eb', fontWeight: 600 }}>{o.ciNumber || o.id}</td>
                      <td style={{ padding: '12px 16px', fontWeight: 500 }}>{o.customer || '-'}</td>
                      <td style={{ padding: '12px 16px', color: '#475569' }}>
                        {suppliers.length > 0 ? suppliers.slice(0, 2).join(', ') + (suppliers.length > 2 ? '...' : '') : '-'}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#64748b' }}>{itemsSummary}{itemsMore}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>{totalQty.toLocaleString('en-US')}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {(() => {
                          const piAmount = o.quotationId ? piMap[o.quotationId] : undefined;
                          if (piAmount !== undefined) {
                            return `$${piAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                          }
                          const usdTotal = o.items?.filter(it => it.currency !== 'KRW').reduce((sum, it) => sum + (it.amount || 0), 0) || 0;
                          const krwTotal = o.items?.filter(it => it.currency === 'KRW').reduce((sum, it) => sum + (it.amount || 0), 0) || 0;
                          const exRate = o.exchangeRate || 1400;
                          const totalUsdFallback = usdTotal + (krwTotal / exRate);
                          return `$${totalUsdFallback.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
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
        ) : (
          /* Detailed Trade Management Ledger */
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left', minWidth: '100%' }}>
            <thead style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
              <tr style={{ borderBottom: '1px solid #cbd5e1' }}>
                <th style={{ padding: '10px 8px', fontWeight: 700, textAlign: 'center', borderRight: '1px solid #cbd5e1', position: 'relative', width: colWidths.no, minWidth: colWidths.no, maxWidth: colWidths.no, boxSizing: 'border-box', overflow: 'hidden' }}>
                  No
                  <ResizeHandle onMouseDown={(e) => handleResizeStart('no', e)} />
                </th>
                <th 
                  onClick={() => handleSort('piPo')}
                  style={{ padding: '10px 8px', fontWeight: 700, textAlign: 'center', borderRight: '1px solid #cbd5e1', position: 'relative', width: colWidths.piPo, minWidth: colWidths.piPo, maxWidth: colWidths.piPo, boxSizing: 'border-box', overflow: 'hidden', cursor: 'pointer', userSelect: 'none' }}
                >
                  CI 번호 {sortField === 'piPo' && (sortOrder === 'asc' ? '▲' : '▼')}
                  <ResizeHandle onMouseDown={(e) => handleResizeStart('piPo', e)} />
                </th>
                {visibleCols.includes('customer') && (
                  <th 
                    onClick={() => handleSort('customer')}
                    style={{ padding: '10px 8px', fontWeight: 700, textAlign: 'center', borderRight: '1px solid #cbd5e1', position: 'relative', width: colWidths.customer, minWidth: colWidths.customer, maxWidth: colWidths.customer, boxSizing: 'border-box', overflow: 'hidden', cursor: 'pointer', userSelect: 'none' }}
                  >
                    고객사 {sortField === 'customer' && (sortOrder === 'asc' ? '▲' : '▼')}
                    <ResizeHandle onMouseDown={(e) => handleResizeStart('customer', e)} />
                  </th>
                )}
                {visibleCols.includes('issuingCompany') && (
                  <th 
                    onClick={() => handleSort('issuingCompany')}
                    style={{ padding: '10px 8px', fontWeight: 700, textAlign: 'center', borderRight: '1px solid #cbd5e1', position: 'relative', width: colWidths.issuingCompany, minWidth: colWidths.issuingCompany, maxWidth: colWidths.issuingCompany, boxSizing: 'border-box', overflow: 'hidden', cursor: 'pointer', userSelect: 'none' }}
                  >
                    매출사 {sortField === 'issuingCompany' && (sortOrder === 'asc' ? '▲' : '▼')}
                    <ResizeHandle onMouseDown={(e) => handleResizeStart('issuingCompany', e)} />
                  </th>
                )}
                {visibleCols.includes('cargoReady') && (
                  <th 
                    onClick={() => handleSort('cargoReady')}
                    style={{ padding: '10px 8px', fontWeight: 700, borderRight: '1px solid #cbd5e1', textAlign: 'center', position: 'relative', width: colWidths.cargoReady, minWidth: colWidths.cargoReady, maxWidth: colWidths.cargoReady, boxSizing: 'border-box', overflow: 'hidden', cursor: 'pointer', userSelect: 'none' }}
                  >
                    화물준비 / CFS입고 {sortField === 'cargoReady' && (sortOrder === 'asc' ? '▲' : '▼')}
                    <ResizeHandle onMouseDown={(e) => handleResizeStart('cargoReady', e)} />
                  </th>
                )}

                {visibleCols.includes('volumeVessel') && (
                  <th 
                    onClick={() => handleSort('volumeVessel')}
                    style={{ padding: '10px 8px', fontWeight: 700, borderRight: '1px solid #cbd5e1', textAlign: 'center', position: 'relative', width: colWidths.volumeVessel, minWidth: colWidths.volumeVessel, maxWidth: colWidths.volumeVessel, boxSizing: 'border-box', overflow: 'hidden', cursor: 'pointer', userSelect: 'none' }}
                  >
                    선명·항차 / VOLUME
                    <ResizeHandle onMouseDown={(e) => handleResizeStart('volumeVessel', e)} />
                  </th>
                )}

                {visibleCols.includes('shipmentSchedule') && (
                  <th 
                    onClick={() => handleSort('etd')}
                    style={{ padding: '10px 8px', fontWeight: 700, borderRight: '1px solid #cbd5e1', textAlign: 'center', position: 'relative', width: colWidths.shipmentSchedule, minWidth: colWidths.shipmentSchedule, maxWidth: colWidths.shipmentSchedule, boxSizing: 'border-box', overflow: 'hidden', cursor: 'pointer', userSelect: 'none' }}
                  >
                    서류마감/ETD/ETA {sortField === 'etd' && (sortOrder === 'asc' ? '▲' : '▼')}
                    <ResizeHandle onMouseDown={(e) => handleResizeStart('shipmentSchedule', e)} />
                  </th>
                )}
                {visibleCols.includes('invoiceAmount') && (
                  <th 
                    onClick={() => handleSort('invoiceAmount')}
                    style={{ padding: '10px 8px', fontWeight: 700, borderRight: '1px solid #cbd5e1', textAlign: 'center', position: 'relative', width: colWidths.invoiceAmount, minWidth: colWidths.invoiceAmount, maxWidth: colWidths.invoiceAmount, boxSizing: 'border-box', overflow: 'hidden', cursor: 'pointer', userSelect: 'none' }}
                  >
                    인보이스 금액 {sortField === 'invoiceAmount' && (sortOrder === 'asc' ? '▲' : '▼')}
                    <ResizeHandle onMouseDown={(e) => handleResizeStart('invoiceAmount', e)} />
                  </th>
                )}
                {visibleCols.includes('supplier') && (
                  <th 
                    onClick={() => handleSort('supplier')}
                    style={{ padding: '10px 8px', fontWeight: 700, textAlign: 'center', borderRight: '1px solid #cbd5e1', position: 'relative', width: colWidths.supplier, minWidth: colWidths.supplier, maxWidth: colWidths.supplier, boxSizing: 'border-box', overflow: 'hidden', cursor: 'pointer', userSelect: 'none' }}
                  >
                    구입사 (공급업체) {sortField === 'supplier' && (sortOrder === 'asc' ? '▲' : '▼')}
                    <ResizeHandle onMouseDown={(e) => handleResizeStart('supplier', e)} />
                  </th>
                )}
                {visibleCols.includes('items') && (
                  <th 
                    onClick={() => handleSort('items')}
                    style={{ padding: '10px 8px', fontWeight: 700, textAlign: 'center', borderRight: '1px solid #cbd5e1', position: 'relative', width: colWidths.items, minWidth: colWidths.items, maxWidth: colWidths.items, boxSizing: 'border-box', overflow: 'hidden', cursor: 'pointer', userSelect: 'none' }}
                  >
                    품목 {sortField === 'items' && (sortOrder === 'asc' ? '▲' : '▼')}
                    <ResizeHandle onMouseDown={(e) => handleResizeStart('items', e)} />
                  </th>
                )}
                {visibleCols.includes('supplierAmount') && (
                  <th 
                    onClick={() => handleSort('supplierAmount')}
                    style={{ padding: '10px 8px', fontWeight: 700, borderRight: '1px solid #cbd5e1', textAlign: 'center', position: 'relative', width: colWidths.supplierAmount, minWidth: colWidths.supplierAmount, maxWidth: colWidths.supplierAmount, boxSizing: 'border-box', overflow: 'hidden', cursor: 'pointer', userSelect: 'none' }}
                  >
                    발주금액 {sortField === 'supplierAmount' && (sortOrder === 'asc' ? '▲' : '▼')}
                    <ResizeHandle onMouseDown={(e) => handleResizeStart('supplierAmount', e)} />
                  </th>
                )}
                {visibleCols.includes('supplierRemitted') && (
                  <th 
                    onClick={() => handleSort('supplierRemitted')}
                    style={{ padding: '10px 8px', fontWeight: 700, textAlign: 'center', borderRight: '1px solid #cbd5e1', position: 'relative', width: colWidths.supplierRemitted, minWidth: colWidths.supplierRemitted, maxWidth: colWidths.supplierRemitted, boxSizing: 'border-box', overflow: 'hidden', cursor: 'pointer', userSelect: 'none' }}
                  >
                    결제 {sortField === 'supplierRemitted' && (sortOrder === 'asc' ? '▲' : '▼')}
                    <ResizeHandle onMouseDown={(e) => handleResizeStart('supplierRemitted', e)} />
                  </th>
                )}
                {visibleCols.includes('invoiceSent') && (
                  <th 
                    onClick={() => handleSort('invoiceSent')}
                    style={{ padding: '10px 8px', fontWeight: 700, borderRight: '1px solid #cbd5e1', textAlign: 'center', position: 'relative', width: colWidths.invoiceSent, minWidth: colWidths.invoiceSent, maxWidth: colWidths.invoiceSent, boxSizing: 'border-box', overflow: 'hidden', cursor: 'pointer', userSelect: 'none' }}
                  >
                    인보이스 송부 {sortField === 'invoiceSent' && (sortOrder === 'asc' ? '▲' : '▼')}
                    <ResizeHandle onMouseDown={(e) => handleResizeStart('invoiceSent', e)} />
                  </th>
                )}
                {visibleCols.includes('inco') && (
                  <th 
                    onClick={() => handleSort('inco')}
                    style={{ padding: '10px 8px', fontWeight: 700, borderRight: '1px solid #cbd5e1', textAlign: 'center', position: 'relative', width: colWidths.inco, minWidth: colWidths.inco, maxWidth: colWidths.inco, boxSizing: 'border-box', overflow: 'hidden', cursor: 'pointer', userSelect: 'none' }}
                  >
                    INCO {sortField === 'inco' && (sortOrder === 'asc' ? '▲' : '▼')}
                    <ResizeHandle onMouseDown={(e) => handleResizeStart('inco', e)} />
                  </th>
                )}
                {visibleCols.includes('paymentTerms') && (
                  <th 
                    onClick={() => handleSort('paymentTerms')}
                    style={{ padding: '10px 8px', fontWeight: 700, borderRight: '1px solid #cbd5e1', textAlign: 'center', position: 'relative', width: colWidths.paymentTerms, minWidth: colWidths.paymentTerms, maxWidth: colWidths.paymentTerms, boxSizing: 'border-box', overflow: 'hidden', cursor: 'pointer', userSelect: 'none' }}
                  >
                    LC/TT {sortField === 'paymentTerms' && (sortOrder === 'asc' ? '▲' : '▼')}
                    <ResizeHandle onMouseDown={(e) => handleResizeStart('paymentTerms', e)} />
                  </th>
                )}
                {visibleCols.includes('exportNo') && (
                  <th 
                    onClick={() => handleSort('exportNo')}
                    style={{ padding: '10px 8px', fontWeight: 700, textAlign: 'center', borderRight: '1px solid #cbd5e1', position: 'relative', width: colWidths.exportNo, minWidth: colWidths.exportNo, maxWidth: colWidths.exportNo, boxSizing: 'border-box', overflow: 'hidden', cursor: 'pointer', userSelect: 'none' }}
                  >
                    수출신고번호 {sortField === 'exportNo' && (sortOrder === 'asc' ? '▲' : '▼')}
                    <ResizeHandle onMouseDown={(e) => handleResizeStart('exportNo', e)} />
                  </th>
                )}
                {visibleCols.includes('docsSent') && (
                  <th 
                    onClick={() => handleSort('docsSent')}
                    style={{ padding: '10px 8px', fontWeight: 700, borderRight: '1px solid #cbd5e1', textAlign: 'center', position: 'relative', width: colWidths.docsSent, minWidth: colWidths.docsSent, maxWidth: colWidths.docsSent, boxSizing: 'border-box', overflow: 'hidden', cursor: 'pointer', userSelect: 'none' }}
                  >
                    선적서류 송부 {sortField === 'docsSent' && (sortOrder === 'asc' ? '▲' : '▼')}
                    <ResizeHandle onMouseDown={(e) => handleResizeStart('docsSent', e)} />
                  </th>
                )}
                {visibleCols.includes('bankSubmitted') && (
                  <th 
                    onClick={() => handleSort('bankSubmitted')}
                    style={{ padding: '10px 8px', fontWeight: 700, borderRight: '1px solid #cbd5e1', textAlign: 'center', position: 'relative', width: colWidths.bankSubmitted, minWidth: colWidths.bankSubmitted, maxWidth: colWidths.bankSubmitted, boxSizing: 'border-box', overflow: 'hidden', cursor: 'pointer', userSelect: 'none' }}
                  >
                    은행 제출 {sortField === 'bankSubmitted' && (sortOrder === 'asc' ? '▲' : '▼')}
                    <ResizeHandle onMouseDown={(e) => handleResizeStart('bankSubmitted', e)} />
                  </th>
                )}
                {visibleCols.includes('trackingNo') && (
                  <th 
                    onClick={() => handleSort('trackingNo')}
                    style={{ padding: '10px 8px', fontWeight: 700, textAlign: 'center', borderRight: '1px solid #cbd5e1', position: 'relative', width: colWidths.trackingNo, minWidth: colWidths.trackingNo, maxWidth: colWidths.trackingNo, boxSizing: 'border-box', overflow: 'hidden', cursor: 'pointer', userSelect: 'none' }}
                  >
                    TRACKING NO {sortField === 'trackingNo' && (sortOrder === 'asc' ? '▲' : '▼')}
                    <ResizeHandle onMouseDown={(e) => handleResizeStart('trackingNo', e)} />
                  </th>
                )}
                {visibleCols.includes('paymentCollected') && (
                  <th 
                    onClick={() => handleSort('paymentCollected')}
                    style={{ padding: '10px 8px', fontWeight: 700, textAlign: 'center', borderRight: '1px solid #cbd5e1', position: 'relative', width: colWidths.paymentCollected, minWidth: colWidths.paymentCollected, maxWidth: colWidths.paymentCollected, boxSizing: 'border-box', overflow: 'hidden', cursor: 'pointer', userSelect: 'none' }}
                  >
                    대금 영수 {sortField === 'paymentCollected' && (sortOrder === 'asc' ? '▲' : '▼')}
                    <ResizeHandle onMouseDown={(e) => handleResizeStart('paymentCollected', e)} />
                  </th>
                )}
                {visibleCols.includes('status') && (
                  <th 
                    onClick={() => handleSort('status')}
                    style={{ padding: '10px 8px', fontWeight: 700, borderRight: '1px solid #cbd5e1', textAlign: 'center', position: 'relative', width: colWidths.status, minWidth: colWidths.status, maxWidth: colWidths.status, boxSizing: 'border-box', overflow: 'hidden', cursor: 'pointer', userSelect: 'none' }}
                  >
                    상태 {sortField === 'status' && (sortOrder === 'asc' ? '▲' : '▼')}
                    <ResizeHandle onMouseDown={(e) => handleResizeStart('status', e)} />
                  </th>
                )}
                {visibleCols.includes('remark') && (
                  <th 
                    onClick={() => handleSort('remark')}
                    style={{ padding: '10px 8px', fontWeight: 700, textAlign: 'center', position: 'relative', width: colWidths.remark, minWidth: colWidths.remark, maxWidth: colWidths.remark, boxSizing: 'border-box', overflow: 'hidden', cursor: 'pointer', userSelect: 'none' }}
                  >
                    비고 {sortField === 'remark' && (sortOrder === 'asc' ? '▲' : '▼')}
                    <ResizeHandle onMouseDown={(e) => handleResizeStart('remark', e)} />
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={2 + visibleCols.length} style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                    데이터 실시간 동기화 중...
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={2 + visibleCols.length} style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                    등록된 무역 거래 내역이 없거나 검색 결과가 없습니다.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((o, idx) => {
                  const sBadge = statusColors[o.status] || { bg: '#f1f5f9', text: '#475569' };
                  const suppliers = Array.from(new Set(o.items?.map(it => it.supplier).filter(Boolean)));
                  
                  // Calculate amounts per supplier
                  const supplierAmounts: Record<string, { usd: number; krw: number }> = {};
                  o.items?.forEach(it => {
                    const sup = it.supplier || '미정';
                    if (!supplierAmounts[sup]) supplierAmounts[sup] = { usd: 0, krw: 0 };
                    if (it.currency === 'KRW') {
                      supplierAmounts[sup].krw += it.amount || 0;
                    } else {
                      supplierAmounts[sup].usd += it.amount || 0;
                    }
                  });

                  return (
                    <tr 
                      key={o.id} 
                      style={{ borderBottom: '1px solid #cbd5e1', transition: 'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td 
                        onClick={() => navigate(`/orders/${o.id}`)}
                        style={{ padding: '8px', textAlign: 'center', borderRight: '1px solid #cbd5e1', color: '#64748b', fontWeight: 600, width: colWidths.no, minWidth: colWidths.no, maxWidth: colWidths.no, boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                      >
                        {idx + 1}
                      </td>
                      
                      <td 
                        onClick={() => navigate(`/orders/${o.id}`)}
                        style={{ padding: '8px', borderRight: '1px solid #cbd5e1', color: '#2563eb', fontWeight: 700, width: colWidths.piPo, minWidth: colWidths.piPo, maxWidth: colWidths.piPo, boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                      >
                        {o.ciNumber || o.id}
                        {o.quotationId && <div style={{ fontSize: '9.5px', color: '#64748b', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis' }}>({o.quotationId})</div>}
                      </td>
                      
                      {visibleCols.includes('customer') && (
                        <td 
                          onClick={(e) => { e.stopPropagation(); setEditingCell({ order: o, colKey: 'customer', title: '고객사 수정' }); }}
                          style={{ padding: '8px', borderRight: '1px solid #cbd5e1', fontWeight: 600, color: '#1e293b', width: colWidths.customer, minWidth: colWidths.customer, maxWidth: colWidths.customer, boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                        >
                          {o.customer || '-'}
                        </td>
                      )}
                      
                      {visibleCols.includes('issuingCompany') && (
                        <td 
                          onClick={(e) => { e.stopPropagation(); setEditingCell({ order: o, colKey: 'issuingCompany', title: '매출사 수정' }); }}
                          style={{ padding: '8px', borderRight: '1px solid #cbd5e1', textAlign: 'center', width: colWidths.issuingCompany, minWidth: colWidths.issuingCompany, maxWidth: colWidths.issuingCompany, boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                        >
                          {o.issuingCompany === 'YS' ? (
                            <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, backgroundColor: '#dcfce7', color: '#15803d' }}>영성ACC</span>
                          ) : (
                            <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, backgroundColor: '#dbeafe', color: '#1d4ed8' }}>YSACC CO.,LTD</span>
                          )}
                        </td>
                      )}
                      
                      {visibleCols.includes('cargoReady') && (
                        <td 
                          onClick={(e) => { e.stopPropagation(); setEditingCell({ order: o, colKey: 'cargoReady', title: '화물준비 / CFS입고 수정' }); }}
                          style={{ padding: '0', borderRight: '1px solid #cbd5e1', verticalAlign: 'top', width: colWidths.cargoReady, minWidth: colWidths.cargoReady, maxWidth: colWidths.cargoReady, boxSizing: 'border-box', overflow: 'hidden', cursor: 'pointer' }}
                        >
                          <div style={{ padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 500, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
                            준비: {o.cargoReadyDate || '-'}
                          </div>
                          <div style={{ padding: '8px', fontSize: '11px', fontWeight: 500, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
                            입고: {o.cfsEntryDate || '-'}
                          </div>
                        </td>
                      )}
                      
                      {visibleCols.includes('volumeVessel') && (
                        <td 
                          onClick={(e) => { e.stopPropagation(); setEditingCell({ order: o, colKey: 'volumeVessel', title: 'VOLUME / 선명·항차 수정' }); }}
                          style={{ padding: '0', borderRight: '1px solid #cbd5e1', verticalAlign: 'top', width: colWidths.volumeVessel, minWidth: colWidths.volumeVessel, maxWidth: colWidths.volumeVessel, boxSizing: 'border-box', overflow: 'hidden', cursor: 'pointer' }}
                        >
                          <div style={{ padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
                            선명: {o.vesselBooking || '-'}
                          </div>
                          <div style={{ padding: '8px', fontSize: '11px', fontWeight: 500, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
                            VOL: {o.containerVolumeQuantities || '-'}
                          </div>
                        </td>
                      )}

                      {visibleCols.includes('shipmentSchedule') && (
                        <td 
                          onClick={(e) => { e.stopPropagation(); setEditingCell({ order: o, colKey: 'shipmentSchedule', title: '서류마감 / ETD / ETA 수정' }); }}
                          style={{ padding: '0', borderRight: '1px solid #cbd5e1', verticalAlign: 'top', width: colWidths.shipmentSchedule, minWidth: colWidths.shipmentSchedule, maxWidth: colWidths.shipmentSchedule, boxSizing: 'border-box', overflow: 'hidden', cursor: 'pointer' }}
                        >
                          <div style={{ padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 500, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
                            서류: {o.docsDeadlineDate || '-'}
                          </div>
                          <div style={{ padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 600, color: '#0284c7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
                            ETD: {o.etd || '-'}
                          </div>
                          <div style={{ padding: '8px', fontSize: '11px', fontWeight: 600, color: '#0369a1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
                            ETA: {o.eta || '-'}
                          </div>
                        </td>
                      )}
                      

                      {visibleCols.includes('invoiceAmount') && (
                        <td 
                          onClick={(e) => { e.stopPropagation(); setEditingCell({ order: o, colKey: 'invoiceAmount', title: '인보이스 금액 / 견적 정보 수정' }); }}
                          style={{ padding: '8px', borderRight: '1px solid #cbd5e1', textAlign: 'right', fontWeight: 700, color: '#0f172a', width: colWidths.invoiceAmount, minWidth: colWidths.invoiceAmount, maxWidth: colWidths.invoiceAmount, boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                        >
                          {(() => {
                            const piAmount = o.quotationId ? piMap[o.quotationId] : undefined;
                            if (piAmount !== undefined) {
                              return `$${piAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                            }
                            const usdTotal = o.items?.filter(it => it.currency !== 'KRW').reduce((sum, it) => sum + (it.amount || 0), 0) || 0;
                            const krwTotal = o.items?.filter(it => it.currency === 'KRW').reduce((sum, it) => sum + (it.amount || 0), 0) || 0;
                            const exRate = o.exchangeRate || 1400;
                            const totalUsdFallback = usdTotal + (krwTotal / exRate);
                            return `$${totalUsdFallback.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                          })()}
                        </td>
                      )}
                      
                      {visibleCols.includes('supplier') && (
                        <td 
                          onClick={(e) => { e.stopPropagation(); setEditingCell({ order: o, colKey: 'supplier', title: '구입사 / 포워딩사 수정' }); }}
                          style={{ padding: '0', borderRight: '1px solid #cbd5e1', verticalAlign: 'top', width: colWidths.supplier, minWidth: colWidths.supplier, maxWidth: colWidths.supplier, boxSizing: 'border-box', overflow: 'hidden', cursor: 'pointer' }}
                        >
                          {suppliers.length > 0 ? (
                            suppliers.map((sup, sIdx) => (
                              <div key={sIdx} style={{ padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 500, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {sup}
                              </div>
                            ))
                          ) : (
                            <div style={{ padding: '8px', color: '#94a3b8' }}>-</div>
                          )}
                          {o.forwarderConfirmed && (
                            <div style={{ padding: '8px', fontSize: '11px', fontWeight: 700, color: '#7c3aed', backgroundColor: '#f5f3ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderTop: '2px solid #ddd6fe' }}>
                              🚢 {o.forwarderConfirmed}
                            </div>
                          )}
                          {/* 오더 Subtotal 레이블 행 */}
                          <div style={{ padding: '8px', fontSize: '11px', fontWeight: 800, color: '#1e293b', backgroundColor: '#fef9c3', borderTop: '2px solid #fde047', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
                            오더 Subtotal
                          </div>
                        </td>
                      )}

                      {visibleCols.includes('items') && (
                        <td 
                          onClick={(e) => { e.stopPropagation(); setEditingCell({ order: o, colKey: 'items', title: '품목 수정' }); }}
                          style={{ padding: '0', borderRight: '1px solid #cbd5e1', verticalAlign: 'top', width: colWidths.items, minWidth: colWidths.items, maxWidth: colWidths.items, boxSizing: 'border-box', overflow: 'hidden', cursor: 'pointer' }}
                        >
                          {o.items && o.items.length > 0 ? (
                            o.items.map((it, iIdx) => (
                              <div key={iIdx} style={{ padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 500, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {it.name}
                              </div>
                            ))
                          ) : (
                            <div style={{ padding: '8px', color: '#94a3b8' }}>-</div>
                          )}
                          {o.forwarderConfirmed ? (
                            <div style={{ padding: '8px', fontSize: '11px', fontWeight: 700, color: '#7c3aed', backgroundColor: '#f5f3ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderTop: '2px solid #ddd6fe' }}>
                              운송비
                            </div>
                          ) : (
                            <div style={{ padding: '8px', borderTop: '1px solid #e2e8f0', color: 'transparent' }}>-</div>
                          )}
                          {/* Subtotal 지시자 행 (구입사 칸과 높이 맞춤) */}
                          <div style={{ padding: '8px', backgroundColor: '#fef9c3', borderTop: '2px solid #fde047', color: 'transparent' }}>-</div>
                        </td>
                      )}
                      
                      {visibleCols.includes('supplierAmount') && (
                        <td 
                          onClick={(e) => { e.stopPropagation(); setEditingCell({ order: o, colKey: 'supplierAmount', title: '발주금액 수정' }); }}
                          style={{ padding: '0', borderRight: '1px solid #cbd5e1', textAlign: 'right', verticalAlign: 'top', width: colWidths.supplierAmount, minWidth: colWidths.supplierAmount, maxWidth: colWidths.supplierAmount, boxSizing: 'border-box', overflow: 'hidden', cursor: 'pointer' }}
                        >
                          {suppliers.length > 0 ? (
                            suppliers.map((sup, sIdx) => {
                              const amt = supplierAmounts[sup] || { usd: 0, krw: 0 };
                              const parts = [];
                              if (amt.usd > 0) parts.push(`$${amt.usd.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
                              if (amt.krw > 0) parts.push(`₩${amt.krw.toLocaleString()}`);
                              const amtStr = parts.join(' / ') || '-';
                              return (
                                <div key={sIdx} style={{ padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {amtStr}
                                </div>
                              );
                            })
                          ) : (
                            <div style={{ padding: '8px', color: '#94a3b8' }}>-</div>
                          )}
                          {o.forwarderConfirmed && (
                            <div style={{ padding: '8px', fontSize: '11px', fontWeight: 700, color: '#7c3aed', backgroundColor: '#f5f3ff', borderTop: '2px solid #ddd6fe', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right' }}>
                              {o.forwarderFreightCurrency === 'USD'
                                ? `$${(o.forwarderFreightAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                                : `₩${(o.forwarderFreightAmount || 0).toLocaleString()}`
                              }
                            </div>
                          )}
                          {/* 합계 행 (Subtotal 레이블에 대응) */}
                          {(() => {
                            const totalUsd = Object.values(supplierAmounts).reduce((s, a) => s + (a.usd || 0), 0)
                              + (o.forwarderFreightCurrency === 'USD' ? (o.forwarderFreightAmount || 0) : 0);
                            const totalKrw = Object.values(supplierAmounts).reduce((s, a) => s + (a.krw || 0), 0)
                              + (o.forwarderFreightCurrency !== 'USD' && o.forwarderConfirmed ? (o.forwarderFreightAmount || 0) : 0);
                            const parts = [];
                            if (totalUsd > 0) parts.push(`$${totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
                            if (totalKrw > 0) parts.push(`₩${totalKrw.toLocaleString()}`);
                            return (
                              <div style={{ padding: '8px', fontSize: '11px', fontWeight: 800, color: '#1e293b', backgroundColor: '#fef9c3', borderTop: '2px solid #fde047', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right' }}>
                                {parts.join(' / ') || '-'}
                              </div>
                            );
                          })()}
                        </td>
                      )}

                      
                      {visibleCols.includes('supplierRemitted') && (
                        <td 
                          onClick={(e) => { e.stopPropagation(); setEditingCell({ order: o, colKey: 'supplierRemitted', title: '결제일 및 상태 수정' }); }}
                          style={{ padding: '0', borderRight: '1px solid #cbd5e1', verticalAlign: 'top', width: colWidths.supplierRemitted, minWidth: colWidths.supplierRemitted, maxWidth: colWidths.supplierRemitted, boxSizing: 'border-box', overflow: 'hidden', cursor: 'pointer' }}
                        >
                          {suppliers.length > 0 ? (
                            suppliers.map((sup, sIdx) => {
                              const pay = o.supplierPayments?.[sup];
                              const dateStr = pay?.date || '-';
                              return (
                                <div key={sIdx} style={{ padding: '8px', borderBottom: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 600, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>
                                  {dateStr}
                                </div>
                              );
                            })
                          ) : (
                            <div style={{ padding: '8px', color: '#94a3b8', textAlign: 'center' }}>-</div>
                          )}
                          {/* 포워더 행 (높이 맞춤) */}
                          <div style={{ padding: '8px', borderTop: '2px solid #ddd6fe', backgroundColor: '#f5f3ff', color: 'transparent' }}>-</div>
                          {/* Subtotal 행 (높이 맞춤) */}
                          <div style={{ padding: '8px', borderTop: '2px solid #fde047', backgroundColor: '#fef9c3', color: 'transparent' }}>-</div>
                        </td>
                      )}
                      
                      {visibleCols.includes('invoiceSent') && (
                        <td 
                          onClick={(e) => { e.stopPropagation(); setEditingCell({ order: o, colKey: 'invoiceSent', title: '인보이스 송부일 수정' }); }}
                          style={{ padding: '8px', borderRight: '1px solid #cbd5e1', textAlign: 'center', width: colWidths.invoiceSent, minWidth: colWidths.invoiceSent, maxWidth: colWidths.invoiceSent, boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                        >
                          {o.ciPlSentDate || '-'}
                        </td>
                      )}
                      
                      {visibleCols.includes('inco') && (
                        <td 
                          onClick={(e) => { e.stopPropagation(); setEditingCell({ order: o, colKey: 'inco', title: 'INCO 조건 수정' }); }}
                          style={{ padding: '8px', borderRight: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 600, width: colWidths.inco, minWidth: colWidths.inco, maxWidth: colWidths.inco, boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                        >
                          {o.incoterms || '-'}
                        </td>
                      )}
                      
                      {visibleCols.includes('paymentTerms') && (
                        <td 
                          onClick={(e) => { e.stopPropagation(); setEditingCell({ order: o, colKey: 'paymentTerms', title: '결제방식 (LC/TT) 수정' }); }}
                          style={{ padding: '8px', borderRight: '1px solid #cbd5e1', textAlign: 'center', width: colWidths.paymentTerms, minWidth: colWidths.paymentTerms, maxWidth: colWidths.paymentTerms, boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                        >
                          {o.isLc === 'Y' ? 'L/C' : o.isLc === 'N' ? 'T/T' : 'T/T'}
                        </td>
                      )}
                      
                      {visibleCols.includes('exportNo') && (
                        <td 
                          onClick={(e) => { e.stopPropagation(); setEditingCell({ order: o, colKey: 'exportNo', title: '수출신고번호 수정' }); }}
                          style={{ padding: '8px', borderRight: '1px solid #cbd5e1', width: colWidths.exportNo, minWidth: colWidths.exportNo, maxWidth: colWidths.exportNo, boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                        >
                          {o.exportDeclarationNo || '-'}
                        </td>
                      )}
                      
                      {visibleCols.includes('docsSent') && (
                        <td 
                          onClick={(e) => { e.stopPropagation(); setEditingCell({ order: o, colKey: 'docsSent', title: '선적서류 송부일 수정' }); }}
                          style={{ padding: '8px', borderRight: '1px solid #cbd5e1', textAlign: 'center', width: colWidths.docsSent, minWidth: colWidths.docsSent, maxWidth: colWidths.docsSent, boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                        >
                          {o.shippingDocsSentDate || '-'}
                        </td>
                      )}
                      
                      {visibleCols.includes('bankSubmitted') && (
                        <td 
                          onClick={(e) => { e.stopPropagation(); setEditingCell({ order: o, colKey: 'bankSubmitted', title: '은행 제출일 수정' }); }}
                          style={{ padding: '8px', borderRight: '1px solid #cbd5e1', textAlign: 'center', width: colWidths.bankSubmitted, minWidth: colWidths.bankSubmitted, maxWidth: colWidths.bankSubmitted, boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                        >
                          {o.bankSubmissionDate || '-'}
                        </td>
                      )}
                      
                      {visibleCols.includes('trackingNo') && (
                        <td 
                          onClick={(e) => { e.stopPropagation(); setEditingCell({ order: o, colKey: 'trackingNo', title: 'TRACKING NO 수정' }); }}
                          style={{ padding: '8px', borderRight: '1px solid #cbd5e1', width: colWidths.trackingNo, minWidth: colWidths.trackingNo, maxWidth: colWidths.trackingNo, boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                        >
                          {o.shippingDocsTrackingNo || '-'}
                        </td>
                      )}
                      
                      {/* 대금 영수 */}
                      {visibleCols.includes('paymentCollected') && (
                        <td 
                          onClick={(e) => { e.stopPropagation(); setEditingCell({ order: o, colKey: 'paymentCollected', title: '대금 영수일 수정' }); }}
                          style={{ padding: '8px', borderRight: '1px solid #cbd5e1', width: colWidths.paymentCollected, minWidth: colWidths.paymentCollected, maxWidth: colWidths.paymentCollected, boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                        >
                          {o.paymentCollectedDate || '-'}
                        </td>
                      )}
                      
                      {/* 상태 */}
                      {visibleCols.includes('status') && (
                        <td 
                          onClick={(e) => { e.stopPropagation(); setEditingCell({ order: o, colKey: 'status', title: '진행상태 수정' }); }}
                          style={{ padding: '8px', borderRight: '1px solid #cbd5e1', textAlign: 'center', width: colWidths.status, minWidth: colWidths.status, maxWidth: colWidths.status, boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                        >
                          <span style={{ display: 'inline-block', padding: '4px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, backgroundColor: sBadge.bg, color: sBadge.text }}>
                            {o.status}
                          </span>
                        </td>
                      )}
                      
                      {/* 비고 */}
                      {visibleCols.includes('remark') && (
                        <td 
                          onClick={(e) => { e.stopPropagation(); setEditingCell({ order: o, colKey: 'remark', title: '비고 수정' }); }}
                          style={{ padding: '8px', color: '#64748b', width: colWidths.remark, minWidth: colWidths.remark, maxWidth: colWidths.remark, boxSizing: 'border-box', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                        >
                          {o.remark || '-'}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot style={{ backgroundColor: '#f8fafc', borderTop: '2px solid #cbd5e1', borderBottom: '2px solid #cbd5e1', fontWeight: 800 }}>
              <tr>
                {(() => {
                  const colsBeforeInvoice = ['customer', 'issuingCompany', 'cargoReady', 'volumeVessel', 'shipmentSchedule'];
                  const span = 2 + colsBeforeInvoice.filter(key => visibleCols.includes(key)).length;
                  return (
                    <td colSpan={span} style={{ padding: '10px 8px', textAlign: 'right', borderRight: '1px solid #cbd5e1', color: '#1e293b', fontSize: '12.5px' }}>
                      합계 (Total)
                    </td>
                  );
                })()}
                
                {/* 인보이스 금액 합계 */}
                {visibleCols.includes('invoiceAmount') && (
                  <td style={{ padding: '10px 8px', textAlign: 'right', borderRight: '1px solid #cbd5e1', color: '#dc2626', fontSize: '12.5px', fontWeight: 800 }}>
                    {(() => {
                      const sum = filteredOrders.reduce((acc, o) => {
                        const piAmount = o.quotationId ? piMap[o.quotationId] : undefined;
                        if (piAmount !== undefined) return acc + piAmount;
                        const usdTotal = o.items?.filter(it => it.currency !== 'KRW').reduce((s, it) => s + (it.amount || 0), 0) || 0;
                        const krwTotal = o.items?.filter(it => it.currency === 'KRW').reduce((s, it) => s + (it.amount || 0), 0) || 0;
                        const exRate = o.exchangeRate || 1400;
                        return acc + usdTotal + (krwTotal / exRate);
                      }, 0);
                      return `$${sum.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
                    })()}
                  </td>
                )}
                
                {/* 구입사 (공급업체) */}
                {visibleCols.includes('supplier') && (
                  <td style={{ padding: '10px 8px', borderRight: '1px solid #cbd5e1' }}></td>
                )}
                
                {/* 품목 */}
                {visibleCols.includes('items') && (
                  <td style={{ padding: '10px 8px', borderRight: '1px solid #cbd5e1' }}></td>
                )}
                
                {/* 발주금액 (공급사별) 합계 */}
                {visibleCols.includes('supplierAmount') && (
                  <td style={{ padding: '10px 8px', textAlign: 'right', borderRight: '1px solid #cbd5e1', color: '#dc2626', fontSize: '12.5px', fontWeight: 800, whiteSpace: 'nowrap' }}>
                    {(() => {
                      let totalUsd = 0;
                      let totalKrw = 0;
                      filteredOrders.forEach(o => {
                        o.items?.forEach(it => {
                          if (it.currency === 'KRW') {
                            totalKrw += it.amount || 0;
                          } else {
                            totalUsd += it.amount || 0;
                          }
                        });
                      });
                      const parts = [];
                      if (totalUsd > 0) parts.push(`$${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
                      if (totalKrw > 0) parts.push(`₩${totalKrw.toLocaleString()}`);
                      return parts.join(' / ') || '$0.00';
                    })()}
                  </td>
                )}
                
                {/* 결제 */}
                {visibleCols.includes('supplierRemitted') && (
                  <td style={{ padding: '10px 8px', borderRight: '1px solid #cbd5e1' }}></td>
                )}
                
                {/* Remaining cols after supplierRemitted */}
                {(() => {
                  const remaining = [
                    'invoiceSent', 'inco', 'paymentTerms', 'exportNo', 'docsSent', 'bankSubmitted',
                    'trackingNo', 'paymentCollected', 'status', 'remark'
                  ];
                  return remaining.map(key => {
                    if (visibleCols.includes(key)) {
                      return <td key={key} style={{ padding: '10px 8px', borderRight: '1px solid #cbd5e1' }}></td>;
                    }
                    return null;
                  });
                })()}
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {isModalOpen && (
        <NewOrderModal 
          onClose={() => { setIsModalOpen(false); setInitialSelectedQuoteId(''); }}
          onSaveSuccess={() => {}}
          currentUser={currentUser}
          initialQuotationId={initialSelectedQuoteId}
        />
      )}

      {editingCell && (
        <QuickEditModal
          order={editingCell.order}
          colKey={editingCell.colKey}
          onClose={() => setEditingCell(null)}
          onSave={(fields) => handleQuickSave(editingCell.order.id, fields)}
          piMap={piMap}
        />
      )}

      {isSettingsOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '450px', maxWidth: '90%', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>⚙ 대장 표시 항목 설정</h3>
              <button onClick={() => setIsSettingsOpen(false)} style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>
            <p style={{ fontSize: '12.5px', color: '#64748b', marginTop: 0, marginBottom: '16px' }}>상세 대장 테이블에서 표시할 열을 체크하여 지정해 주세요. 설정은 사용자별로 자동 보존됩니다.</p>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px 16px', maxHeight: '300px', overflowY: 'auto', padding: '4px' }}>
              {COLUMN_OPTIONS.map(col => {
                const isVisible = visibleCols.includes(col.key);
                return (
                  <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', userSelect: 'none', color: '#334155' }}>
                    <input 
                      type="checkbox" 
                      checked={isVisible} 
                      onChange={() => toggleColVisibility(col.key)}
                      style={{ cursor: 'pointer' }}
                    />
                    <span>{col.label}</span>
                  </label>
                );
              })}
            </div>
            
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px', marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button 
                onClick={() => {
                  setVisibleCols(defaultVisibleCols);
                  localStorage.setItem(`po_visible_cols_${userProfile?.id || 'default'}`, JSON.stringify(defaultVisibleCols));
                }}
                style={{ padding: '8px 16px', background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', borderRadius: '6px', fontSize: '12.5px', cursor: 'pointer', fontWeight: 600 }}
              >
                기본값 복원
              </button>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                style={{ padding: '8px 16px', background: '#2563eb', border: 'none', color: '#fff', borderRadius: '6px', fontSize: '12.5px', cursor: 'pointer', fontWeight: 600 }}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

const ResizeHandle: React.FC<{ onMouseDown: (e: React.MouseEvent) => void }> = ({ onMouseDown }) => {
  const [hovered, setHovered] = React.useState(false);
  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: '6px',
        cursor: 'col-resize',
        zIndex: 10,
        backgroundColor: hovered ? '#cbd5e1' : 'transparent',
        transition: 'background-color 0.2s'
      }}
    />
  );
};
