import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import type { DomesticQuoteItem, DomesticQuoteLineItem } from '../types/domestic';

export const DomesticQuotes: React.FC = () => {
  const [quotes, setQuotes] = useState<DomesticQuoteItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [companyFilter, setCompanyFilter] = useState<'All' | 'YSACC' | 'YS'>('All');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'REVIEW' | 'APPROVED' | 'REJECTED'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Form Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DomesticQuoteItem | null>(null);

  // Preview Modal State
  const [previewItem, setPreviewItem] = useState<DomesticQuoteItem | null>(null);

  // Form Fields
  const [quoteDate, setQuoteDate] = useState(new Date().toISOString().split('T')[0]);
  const [quoteNo, setQuoteNo] = useState('');
  const [revision, setRevision] = useState(0);
  const [parentQuoteId, setParentQuoteId] = useState<string | undefined>(undefined);
  const [companyType, setCompanyType] = useState<'YSACC' | 'YS'>('YSACC');
  const [supplierName, setSupplierName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [receiverAttention, setReceiverAttention] = useState('');
  const [receiverTel, setReceiverTel] = useState('');
  const [receiverFax, setReceiverFax] = useState('');
  
  // Line Items
  const [items, setItems] = useState<DomesticQuoteLineItem[]>([
    {
      id: 'item-1',
      productName: '',
      spec: '',
      unit: 'KG',
      quantity: 1,
      buyingUnitPrice: 0,
      targetMarginRate: 15,
      salesUnitPrice: 0,
      buyingAmount: 0,
      salesAmount: 0,
      margin: 0,
      note: ''
    }
  ]);

  // Terms & Footer
  const [specialNotes, setSpecialNotes] = useState('');
  const [vatType, setVatType] = useState('부가가치세(VAT): 별도');
  const [paymentTerms, setPaymentTerms] = useState('결제조건 : 선금 30%, 잔금 70%');
  const [managerTitle, setManagerTitle] = useState('이사');
  const [managerName, setManagerName] = useState('이한중');
  const [managerContact, setManagerContact] = useState('010-6277-7418');

  const [status, setStatus] = useState<'REVIEW' | 'APPROVED' | 'REJECTED'>('REVIEW');
  const [validUntil, setValidUntil] = useState('');
  const [memo, setMemo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load Quotes from Firestore
  const fetchQuotes = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'companies', 'YSACC', 'domestic_quotes'));
      const list: DomesticQuoteItem[] = [];
      snap.forEach(d => {
        const data = d.data();
        // Fallback for single item quotes created earlier
        let lineItems: DomesticQuoteLineItem[] = data.items || [];
        if (!lineItems.length && data.productName) {
          const qty = data.quantity || 1;
          const salesPrice = data.quoteAmount ? Math.round(data.quoteAmount / qty) : 0;
          const buyingPrice = data.expectedBuyingAmount ? Math.round(data.expectedBuyingAmount / qty) : 0;
          lineItems = [{
            id: 'legacy-1',
            productName: data.productName,
            spec: '',
            unit: 'EA',
            quantity: qty,
            buyingUnitPrice: buyingPrice,
            targetMarginRate: data.expectedMarginRate || 0,
            salesUnitPrice: salesPrice,
            buyingAmount: data.expectedBuyingAmount || 0,
            salesAmount: data.quoteAmount || 0,
            margin: data.expectedMargin || 0,
            note: ''
          }];
        }
        list.push({ id: d.id, ...data, items: lineItems } as DomesticQuoteItem);
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

  // Calculate Line Item values
  const updateLineItem = (index: number, field: keyof DomesticQuoteLineItem, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };

      const qty = Number(item.quantity) || 0;
      const buyingPrice = Number(item.buyingUnitPrice) || 0;
      let salesPrice = Number(item.salesUnitPrice) || 0;
      let marginRate = Number(item.targetMarginRate) || 0;

      if (field === 'buyingUnitPrice' || field === 'targetMarginRate') {
        // Recalculate salesUnitPrice from marginRate
        if (buyingPrice > 0 && marginRate > 0) {
          salesPrice = Math.round(buyingPrice * (1 + marginRate / 100));
        }
      } else if (field === 'salesUnitPrice') {
        // Recalculate marginRate from salesUnitPrice
        if (salesPrice > 0 && buyingPrice > 0) {
          marginRate = Math.round(((salesPrice - buyingPrice) / salesPrice) * 1000) / 10;
        }
      }

      const buyingAmt = qty * buyingPrice;
      const salesAmt = qty * salesPrice;
      const marginAmt = salesAmt - buyingAmt;

      item.salesUnitPrice = salesPrice;
      item.targetMarginRate = marginRate;
      item.buyingAmount = buyingAmt;
      item.salesAmount = salesAmt;
      item.margin = marginAmt;

      updated[index] = item;
      return updated;
    });
  };

  const addLineItem = () => {
    setItems(prev => [
      ...prev,
      {
        id: `item-${Date.now()}-${prev.length + 1}`,
        productName: '',
        spec: '',
        unit: 'KG',
        quantity: 1,
        buyingUnitPrice: 0,
        targetMarginRate: 15,
        salesUnitPrice: 0,
        buyingAmount: 0,
        salesAmount: 0,
        margin: 0,
        note: ''
      }
    ]);
  };

  const removeLineItem = (index: number) => {
    if (items.length <= 1) {
      alert("최소 1개 이상의 품목이 필요합니다.");
      return;
    }
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  // Aggregated Totals
  const totals = useMemo(() => {
    const expectedBuyingAmount = items.reduce((sum, item) => sum + (Number(item.buyingAmount) || 0), 0);
    const quoteAmount = items.reduce((sum, item) => sum + (Number(item.salesAmount) || 0), 0);
    const expectedMargin = quoteAmount - expectedBuyingAmount;
    const expectedMarginRate = quoteAmount > 0 ? Math.round((expectedMargin / quoteAmount) * 1000) / 10 : 0;
    return { expectedBuyingAmount, quoteAmount, expectedMargin, expectedMarginRate };
  }, [items]);

  // Open Modal for Create, Edit, or Revise
  const handleOpenModal = (item?: DomesticQuoteItem, isRevise: boolean = false) => {
    if (item) {
      if (isRevise) {
        // Create new Revision
        setEditingItem(null);
        setParentQuoteId(item.id);
        const nextRev = (item.revision || 0) + 1;
        setRevision(nextRev);
        // Base Quote No e.g. 2026-YSACC-KPI-01 -> 2026-YSACC-KPI-01-R1
        const cleanNo = (item.quoteNo || '').replace(/-R\d+$/, '');
        setQuoteNo(`${cleanNo}-R${nextRev}`);
        setQuoteDate(new Date().toISOString().split('T')[0]);
      } else {
        // Edit existing item
        setEditingItem(item);
        setParentQuoteId(item.parentQuoteId);
        setRevision(item.revision || 0);
        setQuoteNo(item.quoteNo || '');
        setQuoteDate(item.quoteDate || new Date().toISOString().split('T')[0]);
      }

      setCompanyType(item.companyType || 'YSACC');
      setSupplierName(item.supplierName || '');
      setCustomerName(item.customerName || '');
      setReceiverAttention(item.receiverAttention || '');
      setReceiverTel(item.receiverTel || '');
      setReceiverFax(item.receiverFax || '');
      setItems(item.items && item.items.length > 0 ? item.items : [
        {
          id: 'item-1',
          productName: item.supplierName || '',
          spec: '',
          unit: 'KG',
          quantity: 1,
          buyingUnitPrice: item.expectedBuyingAmount || 0,
          targetMarginRate: item.expectedMarginRate || 0,
          salesUnitPrice: item.quoteAmount || 0,
          buyingAmount: item.expectedBuyingAmount || 0,
          salesAmount: item.quoteAmount || 0,
          margin: item.expectedMargin || 0,
          note: ''
        }
      ]);
      setSpecialNotes(item.specialNotes || '');
      setVatType(item.vatType || '부가가치세(VAT): 별도');
      setPaymentTerms(item.paymentTerms || '결제조건 : 선금 30%, 잔금 70%');
      setManagerTitle(item.managerTitle || '이사');
      setManagerName(item.managerName || '이한중');
      setManagerContact(item.managerContact || '010-6277-7418');
      setStatus(isRevise ? 'REVIEW' : (item.status || 'REVIEW'));
      setValidUntil(item.validUntil || '');
      setMemo(item.memo || '');
    } else {
      // Create Brand New
      setEditingItem(null);
      setParentQuoteId(undefined);
      setRevision(0);
      setQuoteDate(new Date().toISOString().split('T')[0]);
      const year = new Date().getFullYear();
      const count = quotes.length + 1;
      setQuoteNo(`${year}-YSACC-EST-${String(count).padStart(2, '0')}`);
      setCompanyType('YSACC');
      setSupplierName('');
      setCustomerName('');
      setReceiverAttention('');
      setReceiverTel('');
      setReceiverFax('');
      setItems([
        {
          id: 'item-1',
          productName: '',
          spec: '',
          unit: 'KG',
          quantity: 1,
          buyingUnitPrice: 0,
          targetMarginRate: 15,
          salesUnitPrice: 0,
          buyingAmount: 0,
          salesAmount: 0,
          margin: 0,
          note: ''
        }
      ]);
      setSpecialNotes('');
      setVatType('부가가치세(VAT): 별도');
      setPaymentTerms('결제조건 : 선금 30%, 잔금 70%');
      setManagerTitle('이사');
      setManagerName('이한중');
      setManagerContact('010-6277-7418');
      setStatus('REVIEW');
      setValidUntil('');
      setMemo('');
    }
    setIsModalOpen(true);
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || items.some(i => !i.productName.trim())) {
      alert("수신(고객사) 정보 및 각 품목의 품명은 필수 입력 사항입니다.");
      return;
    }

    setIsSubmitting(true);
    try {
      const primaryProduct = items.map(i => i.productName).join(', ');
      const totalQty = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);

      const payload = {
        quoteDate,
        quoteNo: quoteNo || `${new Date().getFullYear()}-YSACC-EST-${Date.now().toString().slice(-3)}`,
        revision,
        parentQuoteId: parentQuoteId || null,
        companyType,
        supplierName: supplierName.trim(),
        customerName: customerName.trim(),
        receiverAttention: receiverAttention.trim(),
        receiverTel: receiverTel.trim(),
        receiverFax: receiverFax.trim(),
        productName: primaryProduct,
        quantity: totalQty,
        items,
        expectedBuyingAmount: totals.expectedBuyingAmount,
        quoteAmount: totals.quoteAmount,
        expectedMargin: totals.expectedMargin,
        expectedMarginRate: totals.expectedMarginRate,
        specialNotes: specialNotes.trim(),
        vatType: vatType.trim(),
        paymentTerms: paymentTerms.trim(),
        managerTitle: managerTitle.trim(),
        managerName: managerName.trim(),
        managerContact: managerContact.trim(),
        status,
        validUntil: validUntil || '',
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
        supplierName: item.supplierName || '',
        customerName: item.customerName,
        productName: item.productName || (item.items && item.items[0]?.productName) || '품목',
        quantity: item.quantity || (item.items && item.items[0]?.quantity) || 1,
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

  // Overall KPI Statistics
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

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>국내 견적 데이터를 불러오는 중...</div>;
  }

  return (
    <div style={{ padding: '24px 30px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {/* Print Specific CSS */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #quotation-print-area, #quotation-print-area * { visibility: visible; }
          #quotation-print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
          .no-print { display: none !important; }
        }
      `}</style>

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
          ➕ 신규 국내 견적 작성
        </button>
      </div>

      {/* KPI Stats Banner */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>총 국내 견적</span>
          <div style={{ fontSize: '20px', fontWeight: 900, color: '#1e293b' }}>{stats.totalCount} 건</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>총 원가 / 예상 매입액</span>
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
          placeholder="수신(고객사), 매입처, 품목명, 견적번호 검색..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 12px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none', width: '280px' }}
        />
      </div>

      {/* Data Table */}
      <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14.5px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1', color: '#475569' }}>
                <th style={{ padding: '12px', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>견적일자</th>
                <th style={{ padding: '12px', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>견적번호</th>
                <th style={{ padding: '12px', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>주체</th>
                <th style={{ padding: '12px', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>수신 (고객사)</th>
                <th style={{ padding: '12px', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>품목 정보 (수량)</th>
                <th style={{ padding: '12px', textAlign: 'right', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>총 원가</th>
                <th style={{ padding: '12px', textAlign: 'right', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>총 견적 금액</th>
                <th style={{ padding: '12px', textAlign: 'right', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>예상 마진</th>
                <th style={{ padding: '12px', textAlign: 'center', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>상태</th>
                <th style={{ padding: '12px', textAlign: 'center', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>관리 및 견적서</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuotes.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '14.5px' }}>
                    등록된 국내 견적 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredQuotes.map(item => {
                  const margin = (item.quoteAmount || 0) - (item.expectedBuyingAmount || 0);
                  const itemCount = item.items ? item.items.length : 1;
                  const itemSummary = item.items && item.items.length > 0
                    ? `${item.items[0].productName} ${itemCount > 1 ? `외 ${itemCount - 1}건` : ''}`
                    : (item.productName || '품목');

                  return (
                    <tr 
                      key={item.id}
                      style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{ padding: '12px', color: '#475569', fontWeight: 600 }}>{item.quoteDate}</td>
                      <td style={{ padding: '12px', fontWeight: 800, color: '#1e293b' }}>
                        {item.quoteNo}
                        {item.revision > 0 && (
                          <span style={{ fontSize: '11px', background: '#e0e7ff', color: '#3730a3', padding: '1px 5px', borderRadius: '4px', marginLeft: '6px', fontWeight: 800 }}>
                            Rev {item.revision}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', background: item.companyType === 'YSACC' ? '#eff6ff' : '#fef3c7', color: item.companyType === 'YSACC' ? '#2563eb' : '#d97706' }}>
                          {item.companyType}
                        </span>
                      </td>
                      <td style={{ padding: '12px', color: '#0f172a', fontWeight: 800 }}>
                        {item.customerName}
                        {item.receiverAttention && <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, marginLeft: '4px' }}>({item.receiverAttention})</span>}
                      </td>
                      <td style={{ padding: '12px', color: '#1e293b' }}>
                        {itemSummary}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right', color: '#64748b' }}>₩{item.expectedBuyingAmount.toLocaleString()}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 800, color: '#2563eb' }}>₩{item.quoteAmount.toLocaleString()}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 800, color: margin >= 0 ? '#10b981' : '#ef4444' }}>
                        ₩{margin.toLocaleString()} ({item.expectedMarginRate}%)
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
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => setPreviewItem(item)}
                            title="엑셀/인쇄 양식 미리보기"
                            style={{ background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', fontWeight: 700, color: '#1d4ed8', cursor: 'pointer' }}
                          >
                            🖨️ 견적서 출력
                          </button>
                          <button
                            onClick={() => handleOpenModal(item, true)}
                            title="새 버전(Revise) 생성"
                            style={{ background: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', fontWeight: 700, color: '#6d28d9', cursor: 'pointer' }}
                          >
                            🔄 Revise
                          </button>
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
                            onClick={() => handleOpenModal(item, false)}
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
                  <td colSpan={5} style={{ padding: '12px 16px', color: '#1e293b' }}>합계 ({filteredQuotes.length}건)</td>
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

      {/* 📝 Create / Edit / Revise Modal */}
      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '4px', border: '1px solid #cbd5e1', width: '100%', maxWidth: '900px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(15,23,42,0.2)', overflow: 'hidden' }}>
            
            {/* Modal Header */}
            <div style={{ background: '#fafafa', borderBottom: '1px solid #cbd5e1', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                {parentQuoteId ? '🔄 국내 견적서 Revise (개정 작성)' : editingItem ? '✏️ 국내 견적서 수정' : '➕ 신규 국내 견적서 작성'}
                {revision > 0 && <span style={{ fontSize: '12px', background: '#3b82f6', color: '#fff', padding: '2px 8px', borderRadius: '4px' }}>Rev {revision}</span>}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            {/* Modal Scrollable Form */}
            <form onSubmit={handleSubmit} style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Section 1: Basic Header Info */}
              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '4px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b' }}>1. 견적 기본 및 수신자 정보</span>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                      견적번호 <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={quoteNo}
                      onChange={e => setQuoteNo(e.target.value)}
                      style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                      견적일자 <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={quoteDate}
                      onChange={e => setQuoteDate(e.target.value)}
                      style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                      발신 주체 (자사) <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <select
                      value={companyType}
                      onChange={e => setCompanyType(e.target.value as any)}
                      style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none', background: '#fff' }}
                    >
                      <option value="YSACC">(주)와이에스에이씨씨 (YSACC)</option>
                      <option value="YS">영성ACC</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                      수신 (고객사) <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="예: 강남KPI, 현대모비스"
                      value={customerName}
                      onChange={e => setCustomerName(e.target.value)}
                      style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 12px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                      참조
                    </label>
                    <input
                      type="text"
                      placeholder="예: 민재준 이사님"
                      value={receiverAttention}
                      onChange={e => setReceiverAttention(e.target.value)}
                      style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                      전화번호
                    </label>
                    <input
                      type="text"
                      placeholder="010-0000-0000"
                      value={receiverTel}
                      onChange={e => setReceiverTel(e.target.value)}
                      style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                      국내 매입처 (공급사)
                    </label>
                    <input
                      type="text"
                      placeholder="예: 삼오인서트, 한국소재"
                      value={supplierName}
                      onChange={e => setSupplierName(e.target.value)}
                      style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none' }}
                    />
                  </div>
                </div>

              </div>

              {/* Section 2: Line Items (다중 품목 & 원가/마진 산정) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b' }}>
                    2. 품목 목록 및 원가/마진산정 (제품 추가 가능)
                  </span>
                  <button
                    type="button"
                    onClick={addLineItem}
                    style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', padding: '0 12px', height: '28px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    ➕ 제품 추가
                  </button>
                </div>

                <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1', color: '#475569' }}>
                        <th style={{ padding: '8px', width: '30px', textAlign: 'center' }}>#</th>
                        <th style={{ padding: '8px', minWidth: '120px' }}>품명 *</th>
                        <th style={{ padding: '8px', minWidth: '140px' }}>규격</th>
                        <th style={{ padding: '8px', width: '70px', textAlign: 'center' }}>단위</th>
                        <th style={{ padding: '8px', width: '80px', textAlign: 'center' }}>수량 *</th>
                        <th style={{ padding: '8px', width: '100px', textAlign: 'right' }}>원가 (매입단가)</th>
                        <th style={{ padding: '8px', width: '80px', textAlign: 'right' }}>마진율(%)</th>
                        <th style={{ padding: '8px', width: '100px', textAlign: 'right' }}>견적 단가 *</th>
                        <th style={{ padding: '8px', width: '110px', textAlign: 'right' }}>금액 (원)</th>
                        <th style={{ padding: '8px', minWidth: '100px' }}>비고</th>
                        <th style={{ padding: '8px', width: '40px', textAlign: 'center' }}>삭제</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={item.id || idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '6px', textAlign: 'center', fontWeight: 700, color: '#64748b' }}>{idx + 1}</td>
                          <td style={{ padding: '6px' }}>
                            <input
                              type="text"
                              required
                              placeholder="예: GP525"
                              value={item.productName}
                              onChange={e => updateLineItem(idx, 'productName', e.target.value)}
                              style={{ width: '100%', height: '28px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 6px', fontSize: '12px', fontWeight: 600, boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '6px' }}>
                            <input
                              type="text"
                              placeholder="예: GPPS (25KG/BAG)"
                              value={item.spec || ''}
                              onChange={e => updateLineItem(idx, 'spec', e.target.value)}
                              style={{ width: '100%', height: '28px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 6px', fontSize: '12px', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '6px' }}>
                            <input
                              type="text"
                              value={item.unit || 'KG'}
                              onChange={e => updateLineItem(idx, 'unit', e.target.value)}
                              style={{ width: '100%', height: '28px', border: '1px solid #cbd5e1', borderRadius: '4px', textAlign: 'center', fontSize: '12px', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '6px' }}>
                            <input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={e => updateLineItem(idx, 'quantity', Number(e.target.value))}
                              style={{ width: '100%', height: '28px', border: '1px solid #cbd5e1', borderRadius: '4px', textAlign: 'center', fontSize: '12px', fontWeight: 700, boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '6px' }}>
                            <input
                              type="number"
                              step={10}
                              placeholder="0"
                              value={item.buyingUnitPrice || ''}
                              onChange={e => updateLineItem(idx, 'buyingUnitPrice', Number(e.target.value))}
                              style={{ width: '100%', height: '28px', border: '1px solid #cbd5e1', borderRadius: '4px', textAlign: 'right', padding: '0 6px', fontSize: '12px', color: '#64748b', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '6px' }}>
                            <input
                              type="number"
                              step={0.5}
                              value={item.targetMarginRate ?? ''}
                              onChange={e => updateLineItem(idx, 'targetMarginRate', Number(e.target.value))}
                              style={{ width: '100%', height: '28px', border: '1px solid #cbd5e1', borderRadius: '4px', textAlign: 'right', padding: '0 4px', fontSize: '12px', color: '#10b981', fontWeight: 700, boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '6px' }}>
                            <input
                              type="number"
                              step={10}
                              value={item.salesUnitPrice || ''}
                              onChange={e => updateLineItem(idx, 'salesUnitPrice', Number(e.target.value))}
                              style={{ width: '100%', height: '28px', border: '1px solid #cbd5e1', borderRadius: '4px', textAlign: 'right', padding: '0 6px', fontSize: '12px', fontWeight: 800, color: '#2563eb', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '6px', textAlign: 'right', fontWeight: 800, color: '#1e293b' }}>
                            ₩{(item.salesAmount || 0).toLocaleString()}
                          </td>
                          <td style={{ padding: '6px' }}>
                            <input
                              type="text"
                              placeholder="예: 안산 도착도"
                              value={item.note || ''}
                              onChange={e => updateLineItem(idx, 'note', e.target.value)}
                              style={{ width: '100%', height: '28px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 6px', fontSize: '12px', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '6px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => removeLineItem(idx)}
                              style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', width: '22px', height: '22px', cursor: 'pointer', fontWeight: 800 }}
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#f8fafc', fontWeight: 800, borderTop: '2px solid #cbd5e1' }}>
                        <td colSpan={5} style={{ padding: '10px 12px', color: '#1e293b' }}>총 합계</td>
                        <td style={{ padding: '10px', textAlign: 'right', color: '#64748b' }}>₩{totals.expectedBuyingAmount.toLocaleString()}</td>
                        <td style={{ padding: '10px', textAlign: 'right', color: '#10b981' }}>{totals.expectedMarginRate}%</td>
                        <td colSpan={2} style={{ padding: '10px', textAlign: 'right', color: '#2563eb', fontSize: '14px' }}>₩{totals.quoteAmount.toLocaleString()}</td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Section 3: Terms & Footer details */}
              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '4px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b' }}>3. 일반사항 & 결제 조건 및 담당자</span>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                      ※ 특고사항
                    </label>
                    <input
                      type="text"
                      placeholder="예: SMC 관련 품목, 물탱크 관련 부자재"
                      value={specialNotes}
                      onChange={e => setSpecialNotes(e.target.value)}
                      style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                      1. 부가가치세 (VAT) 조건
                    </label>
                    <input
                      type="text"
                      value={vatType}
                      onChange={e => setVatType(e.target.value)}
                      style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                      2. 결제 조건
                    </label>
                    <input
                      type="text"
                      value={paymentTerms}
                      onChange={e => setPaymentTerms(e.target.value)}
                      style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600, color: '#1e293b', outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr', gap: '6px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>담당자 직책</label>
                      <input type="text" value={managerTitle} onChange={e => setManagerTitle(e.target.value)} style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 6px', fontSize: '12px', fontWeight: 600 }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>담당자 성명</label>
                      <input type="text" value={managerName} onChange={e => setManagerName(e.target.value)} style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 6px', fontSize: '12px', fontWeight: 600 }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>연락처</label>
                      <input type="text" value={managerContact} onChange={e => setManagerContact(e.target.value)} style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 6px', fontSize: '12px', fontWeight: 600 }} />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>견적 상태</label>
                    <select value={status} onChange={e => setStatus(e.target.value as any)} style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600, background: '#fff' }}>
                      <option value="REVIEW">검토중</option>
                      <option value="APPROVED">고객승인 (주문확정)</option>
                      <option value="REJECTED">반려</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>견적 유효기간</label>
                    <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600 }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>비고</label>
                    <input type="text" placeholder="기타 사항" value={memo} onChange={e => setMemo(e.target.value)} style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600 }} />
                  </div>
                </div>

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
                  {isSubmitting ? '저장 중...' : editingItem ? '수정 저장' : parentQuoteId ? 'Revise 저장' : '등록'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* 🖨️ Quotation Print & Excel Format Preview Modal */}
      {previewItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '4px', border: '1px solid #cbd5e1', width: '100%', maxWidth: '850px', maxHeight: '95vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            
            {/* Modal Header Bar */}
            <div className="no-print" style={{ background: '#1e293b', color: '#fff', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px', fontWeight: 800 }}>📄 국내 견적서 인쇄 / 미리보기</span>
                <span style={{ fontSize: '12px', background: '#3b82f6', padding: '2px 8px', borderRadius: '4px' }}>{previewItem.quoteNo}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => window.print()}
                  style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', padding: '0 16px', height: '32px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                >
                  🖨️ 즉시 인쇄 / PDF 저장
                </button>
                <button
                  onClick={() => setPreviewItem(null)}
                  style={{ background: '#475569', color: '#fff', border: 'none', borderRadius: '4px', padding: '0 12px', height: '32px', fontSize: '13px', cursor: 'pointer' }}
                >
                  닫기
                </button>
              </div>
            </div>

            {/* Print Area matching Excel Format */}
            <div style={{ padding: '30px', overflowY: 'auto', background: '#fff' }}>
              <div id="quotation-print-area" style={{ border: '2px solid #1e293b', padding: '24px', background: '#fff', fontFamily: '"Malgun Gothic", Dotum, sans-serif', color: '#000' }}>
                
                {/* Title */}
                <h1 style={{ textAlign: 'center', fontSize: '28px', fontWeight: 900, letterSpacing: '12px', margin: '0 0 20px 0', borderBottom: '2px solid #000', paddingBottom: '10px' }}>
                  견 적 서
                </h1>

                {/* Top Grid Info */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                  
                  {/* Left: Customer Receiver Info */}
                  <div style={{ border: '1px solid #000', padding: '12px', fontSize: '13px', lineHeight: '1.8' }}>
                    <div><strong>견적번호 :</strong> {previewItem.quoteNo}</div>
                    <div><strong>일 자 :</strong> {previewItem.quoteDate}</div>
                    <div><strong>수 신 :</strong> <span style={{ fontSize: '15px', fontWeight: 800 }}>{previewItem.customerName}</span></div>
                    {previewItem.receiverAttention && <div><strong>참 조 :</strong> {previewItem.receiverAttention}</div>}
                    {previewItem.receiverTel && <div><strong>전화번호 :</strong> {previewItem.receiverTel}</div>}
                    {previewItem.receiverFax && <div><strong>F A X :</strong> {previewItem.receiverFax}</div>}
                    <div style={{ marginTop: '8px', fontWeight: 700 }}>하기와 같이 견적 드립니다.</div>
                  </div>

                  {/* Right: YSACC / YS Company Stamp Info */}
                  <div style={{ border: '1px solid #000', padding: '12px', fontSize: '12.5px', lineHeight: '1.6', position: 'relative' }}>
                    <div style={{ fontWeight: 700, color: '#1e293b' }}>▣ 취급품목 : {previewItem.specialNotes || 'S.M.C 관련 품목, 물탱크 관련 부자재'}</div>
                    <div style={{ marginTop: '8px', fontSize: '16px', fontWeight: 900 }}>
                      {previewItem.companyType === 'YS' ? '영성ACC' : '(주)와이에스에이씨씨'}
                    </div>
                    <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span><strong>대 표 :</strong> 김 주 한</span>
                      {/* Stamp Seal Image Placeholder / Text */}
                      <div style={{ width: '45px', height: '45px', border: '2px solid #dc2626', color: '#dc2626', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 900, transform: 'rotate(-10deg)' }}>
                        (인)
                      </div>
                    </div>
                    <div style={{ marginTop: '6px', fontSize: '11px', color: '#334155' }}>
                      ◆ 주소 : 충북 청주시 서원구 성봉로 180, 302호<br/>
                      TEL: 070) 4141-2927, FAX: 0303) 3444-1130
                    </div>
                  </div>

                </div>

                {/* Table of Items */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', marginBottom: '20px', border: '1px solid #000' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #000' }}>
                      <th style={{ border: '1px solid #000', padding: '8px', width: '35px', textAlign: 'center' }}>No</th>
                      <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'left' }}>품 명</th>
                      <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'left' }}>규 격</th>
                      <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'center', width: '90px' }}>수량({previewItem.items && previewItem.items[0]?.unit ? previewItem.items[0].unit : 'KG'})</th>
                      <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'right', width: '100px' }}>단 가</th>
                      <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'right', width: '120px' }}>금 액</th>
                      <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'left', width: '110px' }}>비 고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewItem.items && previewItem.items.length > 0 ? (
                      previewItem.items.map((it, idx) => (
                        <tr key={it.id || idx}>
                          <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'center' }}>{idx + 1}</td>
                          <td style={{ border: '1px solid #000', padding: '8px', fontWeight: 800 }}>{it.productName}</td>
                          <td style={{ border: '1px solid #000', padding: '8px' }}>{it.spec || '-'}</td>
                          <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'center', fontWeight: 700 }}>{it.quantity.toLocaleString()}</td>
                          <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>₩ {it.salesUnitPrice.toLocaleString()}</td>
                          <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right', fontWeight: 800 }}>₩ {it.salesAmount.toLocaleString()}</td>
                          <td style={{ border: '1px solid #000', padding: '8px' }}>{it.note || '-'}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'center' }}>1</td>
                        <td style={{ border: '1px solid #000', padding: '8px', fontWeight: 800 }}>{previewItem.productName}</td>
                        <td style={{ border: '1px solid #000', padding: '8px' }}>-</td>
                        <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'center' }}>{previewItem.quantity || 1}</td>
                        <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>₩ {Math.round(previewItem.quoteAmount / (previewItem.quantity || 1)).toLocaleString()}</td>
                        <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right', fontWeight: 800 }}>₩ {previewItem.quoteAmount.toLocaleString()}</td>
                        <td style={{ border: '1px solid #000', padding: '8px' }}>-</td>
                      </tr>
                    )}
                    {/* Padding rows if items < 4 for visual height */}
                    {Array.from({ length: Math.max(0, 4 - (previewItem.items?.length || 1)) }).map((_, i) => (
                      <tr key={`empty-${i}`}>
                        <td style={{ border: '1px solid #000', padding: '12px' }}>&nbsp;</td>
                        <td style={{ border: '1px solid #000', padding: '12px' }} />
                        <td style={{ border: '1px solid #000', padding: '12px' }} />
                        <td style={{ border: '1px solid #000', padding: '12px' }} />
                        <td style={{ border: '1px solid #000', padding: '12px' }} />
                        <td style={{ border: '1px solid #000', padding: '12px' }} />
                        <td style={{ border: '1px solid #000', padding: '12px' }} />
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#f8fafc', fontWeight: 800 }}>
                      <td colSpan={5} style={{ border: '1px solid #000', padding: '10px', textAlign: 'center', fontSize: '14px' }}>합 계</td>
                      <td style={{ border: '1px solid #000', padding: '10px', textAlign: 'right', fontSize: '15px', color: '#1e293b' }}>₩ {previewItem.quoteAmount.toLocaleString()}</td>
                      <td style={{ border: '1px solid #000', padding: '10px' }} />
                    </tr>
                  </tfoot>
                </table>

                {/* Footer Notes & Manager Table */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', alignItems: 'end' }}>
                  
                  {/* Left: Notes */}
                  <div style={{ fontSize: '12px', lineHeight: '1.8' }}>
                    <div style={{ fontWeight: 800 }}>※ 특기사항</div>
                    <div style={{ marginBottom: '8px', color: '#334155' }}>{previewItem.specialNotes || '-'}</div>

                    <div style={{ fontWeight: 800 }}>※ 一 般 事 項</div>
                    <div>1. {previewItem.vatType || '부가가치세(VAT): 별도'}</div>
                    <div>2. {previewItem.paymentTerms || '결제조건 : 선금 30%, 잔금 70%'}</div>
                  </div>

                  {/* Right: Sales Manager Stamp Table */}
                  <div style={{ border: '1px solid #000', fontSize: '12px' }}>
                    <div style={{ background: '#f1f5f9', borderBottom: '1px solid #000', padding: '4px', textAlign: 'center', fontWeight: 800 }}>
                      판매 담당자
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <tbody>
                        <tr>
                          <td style={{ borderBottom: '1px solid #000', borderRight: '1px solid #000', padding: '4px 8px', width: '60px', textAlign: 'center', fontWeight: 700 }}>직 책</td>
                          <td style={{ borderBottom: '1px solid #000', padding: '4px 8px', textAlign: 'right' }}>{previewItem.managerTitle || '이사'}</td>
                        </tr>
                        <tr>
                          <td style={{ borderBottom: '1px solid #000', borderRight: '1px solid #000', padding: '4px 8px', textAlign: 'center', fontWeight: 700 }}>담 당 자</td>
                          <td style={{ borderBottom: '1px solid #000', padding: '4px 8px', textAlign: 'right', fontWeight: 800 }}>{previewItem.managerName || '이한중'}</td>
                        </tr>
                        <tr>
                          <td style={{ borderRight: '1px solid #000', padding: '4px 8px', textAlign: 'center', fontWeight: 700 }}>연 락 처</td>
                          <td style={{ padding: '4px 8px', textAlign: 'right' }}>{previewItem.managerContact || '010-6277-7418'}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                </div>

                {/* Footer Brand Logo */}
                <div style={{ marginTop: '24px', textAlign: 'center', borderTop: '1px solid #cbd5e1', paddingTop: '12px', fontSize: '14px', fontWeight: 900, color: '#1e293b' }}>
                  {previewItem.companyType === 'YS' ? '영성ACC' : '(주)와이에스에이씨씨'}
                </div>

              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
