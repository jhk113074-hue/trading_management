import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import type { DomesticQuoteItem } from '../types/domestic';

export const DomesticQuotes: React.FC = () => {
  const [quotes, setQuotes] = useState<DomesticQuoteItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [companyFilter, setCompanyFilter] = useState<'All' | 'YSACC' | 'YS'>('All');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'REVIEW' | 'APPROVED' | 'REJECTED'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DomesticQuoteItem | null>(null);

  // Form State
  const [quoteDate, setQuoteDate] = useState(new Date().toISOString().split('T')[0]);
  const [quoteNo, setQuoteNo] = useState('');
  const [companyType, setCompanyType] = useState<'YSACC' | 'YS'>('YSACC');
  const [supplierName, setSupplierName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [productName, setProductName] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [expectedBuyingAmount, setExpectedBuyingAmount] = useState<number>(0);
  const [quoteAmount, setQuoteAmount] = useState<number>(0);
  const [validUntil, setValidUntil] = useState('');
  const [status, setStatus] = useState<'REVIEW' | 'APPROVED' | 'REJECTED'>('REVIEW');
  const [memo, setMemo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load Domestic Quotes from Firestore
  const fetchQuotes = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'companies', 'YSACC', 'domestic_quotes'));
      const list: DomesticQuoteItem[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as DomesticQuoteItem);
      });
      list.sort((a, b) => (b.quoteDate || '').localeCompare(a.quoteDate || '') || b.id.localeCompare(a.id));
      setQuotes(list);
    } catch (e) {
      console.error("Failed to load domestic quotes:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotes();
  }, []);

  // Filtered List
  const filteredQuotes = useMemo(() => {
    return quotes.filter(q => {
      if (companyFilter !== 'All' && q.companyType !== companyFilter) return false;
      if (statusFilter !== 'ALL' && q.status !== statusFilter) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchNo = (q.quoteNo || '').toLowerCase().includes(term);
        const matchSupplier = (q.supplierName || '').toLowerCase().includes(term);
        const matchCustomer = (q.customerName || '').toLowerCase().includes(term);
        const matchProduct = (q.productName || '').toLowerCase().includes(term);
        if (!matchNo && !matchSupplier && !matchCustomer && !matchProduct) return false;
      }
      return true;
    });
  }, [quotes, companyFilter, statusFilter, searchTerm]);

  // Statistics
  const stats = useMemo(() => {
    const totalCount = filteredQuotes.length;
    const totalBuying = filteredQuotes.reduce((sum, q) => sum + (Number(q.expectedBuyingAmount) || 0), 0);
    const totalQuote = filteredQuotes.reduce((sum, q) => sum + (Number(q.quoteAmount) || 0), 0);
    const totalMargin = totalQuote - totalBuying;
    const marginRate = totalQuote > 0 ? Math.round((totalMargin / totalQuote) * 1000) / 10 : 0;

    const ysaccQuote = filteredQuotes.filter(q => q.companyType === 'YSACC').reduce((sum, q) => sum + (Number(q.quoteAmount) || 0), 0);
    const ysQuote = filteredQuotes.filter(q => q.companyType === 'YS').reduce((sum, q) => sum + (Number(q.quoteAmount) || 0), 0);

    return { totalCount, totalBuying, totalQuote, totalMargin, marginRate, ysaccQuote, ysQuote };
  }, [filteredQuotes]);

  // Open Modal
  const handleOpenModal = (item?: DomesticQuoteItem) => {
    if (item) {
      setEditingItem(item);
      setQuoteDate(item.quoteDate || new Date().toISOString().split('T')[0]);
      setQuoteNo(item.quoteNo || '');
      setCompanyType(item.companyType || 'YSACC');
      setSupplierName(item.supplierName || '');
      setCustomerName(item.customerName || '');
      setProductName(item.productName || '');
      setQuantity(item.quantity || 1);
      setExpectedBuyingAmount(item.expectedBuyingAmount || 0);
      setQuoteAmount(item.quoteAmount || 0);
      setValidUntil(item.validUntil || '');
      setStatus(item.status || 'REVIEW');
      setMemo(item.memo || '');
    } else {
      setEditingItem(null);
      setQuoteDate(new Date().toISOString().split('T')[0]);
      const year = new Date().getFullYear();
      const count = quotes.length + 1;
      setQuoteNo(`DOM-EST-${year}-${String(count).padStart(3, '0')}`);
      setCompanyType('YSACC');
      setSupplierName('');
      setCustomerName('');
      setProductName('');
      setQuantity(1);
      setExpectedBuyingAmount(0);
      setQuoteAmount(0);
      setValidUntil('');
      setStatus('REVIEW');
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
      const expectedMargin = quoteAmount - expectedBuyingAmount;
      const expectedMarginRate = quoteAmount > 0 ? Math.round((expectedMargin / quoteAmount) * 1000) / 10 : 0;

      const payload = {
        quoteDate,
        quoteNo: quoteNo || `DOM-EST-${new Date().getFullYear()}-${Date.now().toString().slice(-3)}`,
        companyType,
        supplierName: supplierName.trim(),
        customerName: customerName.trim(),
        productName: productName.trim(),
        quantity: Number(quantity) || 1,
        expectedBuyingAmount: Number(expectedBuyingAmount) || 0,
        quoteAmount: Number(quoteAmount) || 0,
        expectedMargin,
        expectedMarginRate,
        validUntil: validUntil || '',
        status,
        memo: memo.trim(),
        updatedAt: new Date().toISOString()
      };

      if (editingItem) {
        await updateDoc(doc(db, 'companies', 'YSACC', 'domestic_quotes', editingItem.id), payload);
      } else {
        await addDoc(collection(db, 'companies', 'YSACC', 'domestic_quotes'), {
          ...payload,
          createdAt: new Date().toISOString()
        });
      }

      setIsModalOpen(false);
      fetchQuotes();
    } catch (err) {
      console.error("Failed to save domestic quote:", err);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Convert Quote to Order
  const handleConvertToOrder = async (item: DomesticQuoteItem) => {
    if (!window.confirm(`'${item.quoteNo}' 견적을 국내 주문관리로 확정 등록하시겠습니까?`)) return;

    try {
      const margin = item.quoteAmount - item.expectedBuyingAmount;
      const marginRate = item.quoteAmount > 0 ? Math.round((margin / item.quoteAmount) * 1000) / 10 : 0;

      await addDoc(collection(db, 'companies', 'YSACC', 'domestic_trades'), {
        tradeDate: new Date().toISOString().split('T')[0],
        tradeNo: `DOM-ORD-${new Date().getFullYear()}-${Date.now().toString().slice(-3)}`,
        companyType: item.companyType,
        supplierName: item.supplierName,
        customerName: item.customerName,
        productName: item.productName,
        quantity: item.quantity,
        buyingAmount: item.expectedBuyingAmount,
        salesAmount: item.quoteAmount,
        margin,
        marginRate,
        taxInvoiceIssued: true,
        status: 'PENDING',
        memo: `[견적확정] ${item.quoteNo} - ${item.memo || ''}`,
        createdAt: new Date().toISOString()
      });

      // Update quote status to APPROVED
      await updateDoc(doc(db, 'companies', 'YSACC', 'domestic_quotes', item.id), {
        status: 'APPROVED',
        updatedAt: new Date().toISOString()
      });

      alert("국내 주문으로 성공적으로 확정 등록되었습니다!");
      fetchQuotes();
    } catch (e) {
      console.error("Failed to convert quote to order:", e);
      alert("주문 전환 중 오류가 발생했습니다.");
    }
  };

  // Delete Handler
  const handleDelete = async (id: string) => {
    if (!window.confirm("이 국내 견적 내역을 삭제하시겠습니까?")) return;
    try {
      await deleteDoc(doc(db, 'companies', 'YSACC', 'domestic_quotes', id));
      fetchQuotes();
    } catch (e) {
      console.error("Failed to delete quote:", e);
      alert("삭제 중 오류가 발생했습니다.");
    }
  };

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>국내 견적 데이터를 불러오는 중...</div>;
  }

  return (
    <div style={{ padding: '24px 30px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 850, color: '#1e293b', margin: 0 }}>📋 국내 견적관리</h1>
          <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 600 }}>국내 매입/매출 견적 및 단가 검토 통합 관리</span>
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
          ➕ 신규 국내 견적 등록
        </button>
      </div>

      {/* KPI Stats Banner */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>총 국내 견적</span>
          <div style={{ fontSize: '20px', fontWeight: 900, color: '#1e293b' }}>{stats.totalCount} 건</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>총 예상 매입액</span>
          <div style={{ fontSize: '20px', fontWeight: 900, color: '#64748b' }}>₩{stats.totalBuying.toLocaleString()}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>총 견적 금액</span>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>(YSACC: ₩{stats.ysaccQuote.toLocaleString()} / 영성: ₩{stats.ysQuote.toLocaleString()})</span>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 900, color: '#2563eb' }}>₩{stats.totalQuote.toLocaleString()}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>예상 영업이익 (마진율)</span>
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
          <option value="ALL">📌 전체 견적 상태</option>
          <option value="REVIEW">⏳ 검토중</option>
          <option value="APPROVED">✅ 고객 승인 (주문 전환)</option>
          <option value="REJECTED">❌ 반려</option>
        </select>

        <input
          type="text"
          placeholder="매출처, 매입처, 품목명, 견적번호 검색..."
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
                <th style={{ padding: '12px', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>견적일자</th>
                <th style={{ padding: '12px', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>견적번호</th>
                <th style={{ padding: '12px', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>주체</th>
                <th style={{ padding: '12px', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>국내 매입처</th>
                <th style={{ padding: '12px', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>국내 매출처</th>
                <th style={{ padding: '12px', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>품목명</th>
                <th style={{ padding: '12px', textAlign: 'center', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>수량</th>
                <th style={{ padding: '12px', textAlign: 'right', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>예상 매입액</th>
                <th style={{ padding: '12px', textAlign: 'right', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>견적 금액</th>
                <th style={{ padding: '12px', textAlign: 'right', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>예상 마진</th>
                <th style={{ padding: '12px', textAlign: 'center', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>상태</th>
                <th style={{ padding: '12px', textAlign: 'center', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuotes.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '14.5px' }}>
                    등록된 국내 견적 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredQuotes.map(item => {
                  const margin = (item.quoteAmount || 0) - (item.expectedBuyingAmount || 0);
                  return (
                    <tr 
                      key={item.id}
                      style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{ padding: '12px', color: '#475569', fontWeight: 600 }}>{item.quoteDate}</td>
                      <td style={{ padding: '12px', fontWeight: 800, color: '#1e293b' }}>{item.quoteNo}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', background: item.companyType === 'YSACC' ? '#eff6ff' : '#fef3c7', color: item.companyType === 'YSACC' ? '#2563eb' : '#d97706' }}>
                          {item.companyType}
                        </span>
                      </td>
                      <td style={{ padding: '12px', color: '#334155', fontWeight: 600 }}>{item.supplierName}</td>
                      <td style={{ padding: '12px', color: '#0f172a', fontWeight: 800 }}>{item.customerName}</td>
                      <td style={{ padding: '12px', color: '#1e293b' }}>{item.productName}</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontWeight: 700 }}>{item.quantity.toLocaleString()}</td>
                      <td style={{ padding: '12px', textAlign: 'right', color: '#64748b' }}>₩{item.expectedBuyingAmount.toLocaleString()}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 800, color: '#2563eb' }}>₩{item.quoteAmount.toLocaleString()}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 800, color: margin >= 0 ? '#10b981' : '#ef4444' }}>
                        ₩{margin.toLocaleString()}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <span style={{
                          fontSize: '12.5px',
                          fontWeight: 800,
                          padding: '3px 8px',
                          borderRadius: '20px',
                          background: item.status === 'APPROVED' ? '#d1fae5' : item.status === 'REVIEW' ? '#fef3c7' : '#fee2e2',
                          color: item.status === 'APPROVED' ? '#065f46' : item.status === 'REVIEW' ? '#92400e' : '#991b1b'
                        }}>
                          {item.status === 'APPROVED' ? '고객승인' : item.status === 'REVIEW' ? '검토중' : '반려'}
                        </span>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          {item.status !== 'APPROVED' && (
                            <button
                              onClick={() => handleConvertToOrder(item)}
                              title="국내 주문으로 확정 전환"
                              style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', fontWeight: 700, color: '#166534', cursor: 'pointer' }}
                            >
                              주문전환
                            </button>
                          )}
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
            {filteredQuotes.length > 0 && (
              <tfoot>
                <tr style={{ background: '#f8fafc', borderTop: '2px solid #cbd5e1', fontWeight: 800 }}>
                  <td colSpan={6} style={{ padding: '12px 16px', color: '#1e293b' }}>합계 ({filteredQuotes.length}건)</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>{filteredQuotes.reduce((s, q) => s + q.quantity, 0).toLocaleString()}</td>
                  <td style={{ padding: '12px', textAlign: 'right', color: '#64748b' }}>₩{stats.totalBuying.toLocaleString()}</td>
                  <td style={{ padding: '12px', textAlign: 'right', color: '#2563eb' }}>₩{stats.totalQuote.toLocaleString()}</td>
                  <td style={{ padding: '12px', textAlign: 'right', color: stats.totalMargin >= 0 ? '#10b981' : '#ef4444' }}>₩{stats.totalMargin.toLocaleString()}</td>
                  <td colSpan={2} />
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
                {editingItem ? '✏️ 국내 견적 내역 수정' : '➕ 신규 국내 견적 등록'}
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
                    견적일자 <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={quoteDate}
                    onChange={e => setQuoteDate(e.target.value)}
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
                    국내 매입처 (공급처) <span style={{ color: '#ef4444' }}>*</span>
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
                    placeholder="예: 너트, FRP 부품 등"
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
                    예상 매입액 (원화 KRW)
                  </label>
                  <input
                    type="number"
                    step={1000}
                    value={expectedBuyingAmount}
                    onChange={e => setExpectedBuyingAmount(Number(e.target.value))}
                    style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 12px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                    견적 금액 (원화 KRW)
                  </label>
                  <input
                    type="number"
                    step={1000}
                    value={quoteAmount}
                    onChange={e => setQuoteAmount(Number(e.target.value))}
                    style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 12px', fontSize: '13px', fontWeight: 600, color: '#2563eb', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Margin Banner */}
              <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: '#475569', fontWeight: 700 }}>예상 매출 이익 / 마진율:</span>
                <strong style={{ color: (quoteAmount - expectedBuyingAmount) >= 0 ? '#10b981' : '#ef4444', fontSize: '14px' }}>
                  ₩{(quoteAmount - expectedBuyingAmount).toLocaleString()} ({quoteAmount > 0 ? (Math.round(((quoteAmount - expectedBuyingAmount) / quoteAmount) * 1000) / 10) : 0}%)
                </strong>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                    견적 상태
                  </label>
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value as any)}
                    style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none', background: '#fff', boxSizing: 'border-box' }}
                  >
                    <option value="REVIEW">검토중</option>
                    <option value="APPROVED">고객승인 (주문확정)</option>
                    <option value="REJECTED">반려</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                    유효기간
                  </label>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={e => setValidUntil(e.target.value)}
                    style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                  비고 / 메모
                </label>
                <input
                  type="text"
                  placeholder="특이사항, 단가 조건 등"
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
