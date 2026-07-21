import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import type { DomesticTradeItem } from '../types/domestic';

export const DomesticTrade: React.FC = () => {
  const [trades, setTrades] = useState<DomesticTradeItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [companyFilter, setCompanyFilter] = useState<'All' | 'YSACC' | 'YS'>('All');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'COMPLETED' | 'CANCELLED'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DomesticTradeItem | null>(null);

  // Form State
  const [tradeDate, setTradeDate] = useState(new Date().toISOString().split('T')[0]);
  const [tradeNo, setTradeNo] = useState('');
  const [companyType, setCompanyType] = useState<'YSACC' | 'YS'>('YSACC');
  const [supplierName, setSupplierName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [productName, setProductName] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [buyingAmount, setBuyingAmount] = useState<number>(0);
  const [salesAmount, setSalesAmount] = useState<number>(0);
  const [taxInvoiceIssued, setTaxInvoiceIssued] = useState(true);
  const [status, setStatus] = useState<'PENDING' | 'COMPLETED' | 'CANCELLED'>('COMPLETED');
  const [memo, setMemo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load Domestic Trades from Firestore
  const fetchTrades = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'companies', 'YSACC', 'domestic_trades'));
      const list: DomesticTradeItem[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as DomesticTradeItem);
      });
      // Sort desc by tradeDate
      list.sort((a, b) => (b.tradeDate || '').localeCompare(a.tradeDate || '') || b.id.localeCompare(a.id));
      setTrades(list);
    } catch (e) {
      console.error("Failed to load domestic trades:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrades();
  }, []);

  // Filtered List
  const filteredTrades = useMemo(() => {
    return trades.filter(t => {
      if (companyFilter !== 'All' && t.companyType !== companyFilter) return false;
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchNo = (t.tradeNo || '').toLowerCase().includes(term);
        const matchSupplier = (t.supplierName || '').toLowerCase().includes(term);
        const matchCustomer = (t.customerName || '').toLowerCase().includes(term);
        const matchProduct = (t.productName || '').toLowerCase().includes(term);
        if (!matchNo && !matchSupplier && !matchCustomer && !matchProduct) return false;
      }
      return true;
    });
  }, [trades, companyFilter, statusFilter, searchTerm]);

  // Statistics
  const stats = useMemo(() => {
    const totalCount = filteredTrades.length;
    const totalBuying = filteredTrades.reduce((sum, t) => sum + (Number(t.buyingAmount) || 0), 0);
    const totalSales = filteredTrades.reduce((sum, t) => sum + (Number(t.salesAmount) || 0), 0);
    const totalMargin = totalSales - totalBuying;
    const marginRate = totalSales > 0 ? Math.round((totalMargin / totalSales) * 1000) / 10 : 0;

    const ysaccSales = filteredTrades.filter(t => t.companyType === 'YSACC').reduce((sum, t) => sum + (Number(t.salesAmount) || 0), 0);
    const ysSales = filteredTrades.filter(t => t.companyType === 'YS').reduce((sum, t) => sum + (Number(t.salesAmount) || 0), 0);

    return { totalCount, totalBuying, totalSales, totalMargin, marginRate, ysaccSales, ysSales };
  }, [filteredTrades]);

  // Open Modal for Create or Edit
  const handleOpenModal = (item?: DomesticTradeItem) => {
    if (item) {
      setEditingItem(item);
      setTradeDate(item.tradeDate || new Date().toISOString().split('T')[0]);
      setTradeNo(item.tradeNo || '');
      setCompanyType(item.companyType || 'YSACC');
      setSupplierName(item.supplierName || '');
      setCustomerName(item.customerName || '');
      setProductName(item.productName || '');
      setQuantity(item.quantity || 1);
      setBuyingAmount(item.buyingAmount || 0);
      setSalesAmount(item.salesAmount || 0);
      setTaxInvoiceIssued(item.taxInvoiceIssued ?? true);
      setStatus(item.status || 'COMPLETED');
      setMemo(item.memo || '');
    } else {
      setEditingItem(null);
      setTradeDate(new Date().toISOString().split('T')[0]);
      // Auto-generate tradeNo
      const year = new Date().getFullYear();
      const count = trades.length + 1;
      setTradeNo(`DOM-${year}-${String(count).padStart(3, '0')}`);
      setCompanyType('YSACC');
      setSupplierName('');
      setCustomerName('');
      setProductName('');
      setQuantity(1);
      setBuyingAmount(0);
      setSalesAmount(0);
      setTaxInvoiceIssued(true);
      setStatus('COMPLETED');
      setMemo('');
    }
    setIsModalOpen(true);
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName.trim() || !customerName.trim() || !productName.trim()) {
      alert("매입처, 매출처 및 품목명을 모두 입력해 주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      const margin = salesAmount - buyingAmount;
      const marginRate = salesAmount > 0 ? Math.round((margin / salesAmount) * 1000) / 10 : 0;

      const payload = {
        tradeDate,
        tradeNo: tradeNo || `DOM-${new Date().getFullYear()}-${Date.now().toString().slice(-3)}`,
        companyType,
        supplierName: supplierName.trim(),
        customerName: customerName.trim(),
        productName: productName.trim(),
        quantity: Number(quantity) || 1,
        buyingAmount: Number(buyingAmount) || 0,
        salesAmount: Number(salesAmount) || 0,
        margin,
        marginRate,
        taxInvoiceIssued,
        status,
        memo: memo.trim(),
        updatedAt: new Date().toISOString()
      };

      if (editingItem) {
        await updateDoc(doc(db, 'companies', 'YSACC', 'domestic_trades', editingItem.id), payload);
      } else {
        await addDoc(collection(db, 'companies', 'YSACC', 'domestic_trades'), {
          ...payload,
          createdAt: new Date().toISOString()
        });
      }

      setIsModalOpen(false);
      fetchTrades();
    } catch (err) {
      console.error("Failed to save domestic trade:", err);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Handler
  const handleDelete = async (id: string) => {
    if (!window.confirm("이 국내 거래 내역을 삭제하시겠습니까?")) return;
    try {
      await deleteDoc(doc(db, 'companies', 'YSACC', 'domestic_trades', id));
      fetchTrades();
    } catch (e) {
      console.error("Failed to delete item:", e);
      alert("삭제 중 오류가 발생했습니다.");
    }
  };

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>국내 거래 데이터를 불러오는 중...</div>;
  }

  return (
    <div style={{ padding: '24px 30px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 850, color: '#1e293b', margin: 0 }}>🏬 국내 거래관리</h1>
          <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 600 }}>국내 매입 및 판매 매출 장부 통합 관리</span>
        </div>
        <button
          onClick={() => handleOpenModal()}
          style={{
            background: '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            padding: '0 16px',
            height: '34px',
            fontSize: '14.5px',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'background 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            boxSizing: 'border-box'
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#2563eb'}
          onMouseLeave={e => e.currentTarget.style.background = '#3b82f6'}
        >
          ➕ 신규 국내 거래 등록
        </button>
      </div>

      {/* KPI Stats Banner */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>총 국내 거래</span>
          <div style={{ fontSize: '20px', fontWeight: 900, color: '#1e293b' }}>{stats.totalCount} 건</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>총 매입액 (원)</span>
          <div style={{ fontSize: '20px', fontWeight: 900, color: '#64748b' }}>₩{stats.totalBuying.toLocaleString()}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>총 매출액 (원)</span>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>(YSACC: ₩{stats.ysaccSales.toLocaleString()} / 영성: ₩{stats.ysSales.toLocaleString()})</span>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 900, color: '#2563eb' }}>₩{stats.totalSales.toLocaleString()}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>총 영업이익 (마진율)</span>
            <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 700 }}>이익률: {stats.marginRate}%</span>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 900, color: stats.totalMargin >= 0 ? '#10b981' : '#ef4444' }}>
            ₩{stats.totalMargin.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', background: '#fff', padding: '12px 16px', border: '1px solid #cbd5e1', borderRadius: '4px', flexWrap: 'wrap' }}>
        <select
          value={companyFilter}
          onChange={e => setCompanyFilter(e.target.value as any)}
          style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none', background: '#fff', cursor: 'pointer' }}
        >
          <option value="All">🏢 전체 주체 (YSACC + 영성)</option>
          <option value="YSACC">YSACC</option>
          <option value="YS">영성ACC</option>
        </select>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as any)}
          style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none', background: '#fff', cursor: 'pointer' }}
        >
          <option value="ALL">📌 전체 정산 상태</option>
          <option value="COMPLETED">✅ 정산 완료</option>
          <option value="PENDING">⏳ 정산 대기</option>
          <option value="CANCELLED">❌ 취소됨</option>
        </select>

        <input
          type="text"
          placeholder="매출처, 매입처, 품목명, 관리번호 검색..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 12px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none', width: '260px' }}
        />
      </div>

      {/* Data Table */}
      <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '15px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1', color: '#475569' }}>
                <th style={{ padding: '12px', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>거래일자</th>
                <th style={{ padding: '12px', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>관리번호</th>
                <th style={{ padding: '12px', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>주체</th>
                <th style={{ padding: '12px', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>국내 매입처</th>
                <th style={{ padding: '12px', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>국내 매출처</th>
                <th style={{ padding: '12px', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>품목명</th>
                <th style={{ padding: '12px', textAlign: 'center', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>수량</th>
                <th style={{ padding: '12px', textAlign: 'right', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>매입액 (원)</th>
                <th style={{ padding: '12px', textAlign: 'right', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>매출액 (원)</th>
                <th style={{ padding: '12px', textAlign: 'right', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>마진 (원)</th>
                <th style={{ padding: '12px', textAlign: 'center', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>세금계산서</th>
                <th style={{ padding: '12px', textAlign: 'center', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>상태</th>
                <th style={{ padding: '12px', textAlign: 'center', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {filteredTrades.length === 0 ? (
                <tr>
                  <td colSpan={13} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '14.5px' }}>
                    등록된 국내 거래 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredTrades.map(item => {
                  const margin = (item.salesAmount || 0) - (item.buyingAmount || 0);
                  return (
                    <tr 
                      key={item.id}
                      style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{ padding: '12px', color: '#475569', fontWeight: 600 }}>{item.tradeDate}</td>
                      <td style={{ padding: '12px', fontWeight: 800, color: '#1e293b' }}>{item.tradeNo}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', background: item.companyType === 'YSACC' ? '#eff6ff' : '#fef3c7', color: item.companyType === 'YSACC' ? '#2563eb' : '#d97706' }}>
                          {item.companyType}
                        </span>
                      </td>
                      <td style={{ padding: '12px', color: '#334155', fontWeight: 600 }}>{item.supplierName}</td>
                      <td style={{ padding: '12px', color: '#0f172a', fontWeight: 800 }}>{item.customerName}</td>
                      <td style={{ padding: '12px', color: '#1e293b' }}>{item.productName}</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontWeight: 700 }}>{item.quantity.toLocaleString()}</td>
                      <td style={{ padding: '12px', textAlign: 'right', color: '#64748b' }}>₩{item.buyingAmount.toLocaleString()}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 800, color: '#2563eb' }}>₩{item.salesAmount.toLocaleString()}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 800, color: margin >= 0 ? '#10b981' : '#ef4444' }}>
                        ₩{margin.toLocaleString()}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        {item.taxInvoiceIssued ? (
                          <span style={{ fontSize: '12px', color: '#166534', background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>발행완료</span>
                        ) : (
                          <span style={{ fontSize: '12px', color: '#991b1b', background: '#fee2e2', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>미발행</span>
                        )}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <span style={{
                          fontSize: '12.5px',
                          fontWeight: 800,
                          padding: '3px 8px',
                          borderRadius: '20px',
                          background: item.status === 'COMPLETED' ? '#d1fae5' : item.status === 'PENDING' ? '#fef3c7' : '#fee2e2',
                          color: item.status === 'COMPLETED' ? '#065f46' : item.status === 'PENDING' ? '#92400e' : '#991b1b'
                        }}>
                          {item.status === 'COMPLETED' ? '정산완료' : item.status === 'PENDING' ? '정산대기' : '취소'}
                        </span>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button
                            onClick={() => handleOpenModal(item)}
                            style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}
                          >
                            수정
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', fontWeight: 700, color: '#dc2626', cursor: 'pointer' }}
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredTrades.length > 0 && (
              <tfoot>
                <tr style={{ background: '#f8fafc', borderTop: '2px solid #cbd5e1', fontWeight: 800 }}>
                  <td colSpan={6} style={{ padding: '12px 16px', color: '#1e293b' }}>합계 ({filteredTrades.length}건)</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>{filteredTrades.reduce((s, t) => s + t.quantity, 0).toLocaleString()}</td>
                  <td style={{ padding: '12px', textAlign: 'right', color: '#64748b' }}>₩{stats.totalBuying.toLocaleString()}</td>
                  <td style={{ padding: '12px', textAlign: 'right', color: '#2563eb' }}>₩{stats.totalSales.toLocaleString()}</td>
                  <td style={{ padding: '12px', textAlign: 'right', color: stats.totalMargin >= 0 ? '#10b981' : '#ef4444' }}>₩{stats.totalMargin.toLocaleString()}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '4px', border: '1px solid #cbd5e1', width: '100%', maxWidth: '600px', boxShadow: '0 20px 40px rgba(15,23,42,0.2)', overflow: 'hidden' }}>
            
            {/* Modal Header */}
            <div style={{ background: '#fafafa', borderBottom: '1px solid #cbd5e1', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#1e293b', margin: 0 }}>
                {editingItem ? '✏️ 국내 거래 내역 수정' : '➕ 신규 국내 거래 등록'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                    거래일자 <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={tradeDate}
                    onChange={e => setTradeDate(e.target.value)}
                    style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                    주체 (자사 구분) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    value={companyType}
                    onChange={e => setCompanyType(e.target.value as any)}
                    style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none', background: '#fff', boxSizing: 'border-box' }}
                  >
                    <option value="YSACC">YSACC</option>
                    <option value="YS">영성ACC</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                    국내 매입처 (공급사) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="예: 삼오인서트, (주)한국소재"
                    value={supplierName}
                    onChange={e => setSupplierName(e.target.value)}
                    style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 12px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                    국내 매출처 (고객사) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="예: 현대모비스, 하영비나"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 12px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                    품목명 <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="예: 너트, FRP 부품, 플라스틱 원료 등"
                    value={productName}
                    onChange={e => setProductName(e.target.value)}
                    style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 12px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                    수량
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={e => setQuantity(Number(e.target.value))}
                    style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                    총 매입액 (원화 KRW)
                  </label>
                  <input
                    type="number"
                    step={1000}
                    value={buyingAmount}
                    onChange={e => setBuyingAmount(Number(e.target.value))}
                    style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 12px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                    총 매출액 (원화 KRW)
                  </label>
                  <input
                    type="number"
                    step={1000}
                    value={salesAmount}
                    onChange={e => setSalesAmount(Number(e.target.value))}
                    style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 12px', fontSize: '13px', fontWeight: 600, color: '#2563eb', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Auto calculated Margin Banner */}
              <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: '#475569', fontWeight: 700 }}>예상 매출 이익 / 마진율:</span>
                <strong style={{ color: (salesAmount - buyingAmount) >= 0 ? '#10b981' : '#ef4444', fontSize: '14px' }}>
                  ₩{(salesAmount - buyingAmount).toLocaleString()} ({salesAmount > 0 ? (Math.round(((salesAmount - buyingAmount) / salesAmount) * 1000) / 10) : 0}%)
                </strong>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                    세금계산서 발행 여부
                  </label>
                  <select
                    value={taxInvoiceIssued ? 'YES' : 'NO'}
                    onChange={e => setTaxInvoiceIssued(e.target.value === 'YES')}
                    style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none', background: '#fff', boxSizing: 'border-box' }}
                  >
                    <option value="YES">발행 완료</option>
                    <option value="NO">미발행 / 진행중</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                    정산 상태
                  </label>
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value as any)}
                    style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none', background: '#fff', boxSizing: 'border-box' }}
                  >
                    <option value="COMPLETED">정산 완료</option>
                    <option value="PENDING">정산 대기</option>
                    <option value="CANCELLED">취소됨</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                  비고 / 메모
                </label>
                <input
                  type="text"
                  placeholder="특이사항, 결제 조건 등"
                  value={memo}
                  onChange={e => setMemo(e.target.value)}
                  style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 12px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              {/* Modal Buttons */}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{ height: '34px', padding: '0 16px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{ height: '34px', padding: '0 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#2563eb'}
                  onMouseLeave={e => e.currentTarget.style.background = '#3b82f6'}
                >
                  {isSubmitting ? '저장 중...' : editingItem ? '수정 저장' : '등록'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
};
