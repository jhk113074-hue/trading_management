import React, { useState, useEffect } from 'react';
import { collection, doc, setDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { db, COMPANY_ID } from '../firebase';
import type { Order, OrderItem, ForwarderEntry } from '../types/order';
import type { Customer } from '../types/customer';
import type { ProformaInvoice } from '../types/pi';
import type { Product } from '../types/product';

interface Props {
  onClose: () => void;
  onSaveSuccess: () => void;
  currentUser: string;
  initialQuotationId?: string;
}

export const NewOrderModal: React.FC<Props> = ({ onClose, onSaveSuccess, currentUser, initialQuotationId }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [quotations, setQuotations] = useState<ProformaInvoice[]>([]);
  const [, setProducts] = useState<Product[]>([]);
  
  const [formData, setFormData] = useState({
    poId: '', // Auto-generated e.g., PO-YYYY-NNNN
    custPo: '',
    quotationId: initialQuotationId || '',
    customerId: '',
    customerName: '',
    manager: currentUser,
    incoterms: 'FOB' as any,
    paymentTerms: '',
    poDate: new Date().toISOString().split('T')[0],
    requestedDelivery: '',
    remark: '',
    status: '주문' as const,
    exchangeRate: 1400,
    issuingCompany: 'YSACC' as 'YSACC' | 'YS'
  });

  const [items, setItems] = useState<Partial<OrderItem>[]>([
    { itemId: '1', name: '', supplier: '', supplierContact: '', grade: '', qty: 0, unit: 'kg', unitPrice: 0, amount: 0, currency: 'USD' }
  ]);

  const [forwarders, setForwarders] = useState<ForwarderEntry[]>([]);

  // Load Customers, Quotations & Products
  useEffect(() => {
    const loadSelectionData = async () => {
      try {
        const custSnap = await getDocs(collection(doc(db, 'companies', COMPANY_ID), 'customers'));
        setCustomers(custSnap.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));

        const quoteSnap = await getDocs(collection(doc(db, 'companies', COMPANY_ID), 'proforma_invoices'));
        setQuotations(quoteSnap.docs.map(d => ({ id: d.id, ...d.data() } as ProformaInvoice)));

        const prodSnap = await getDocs(collection(doc(db, 'companies', COMPANY_ID), 'products'));
        setProducts(prodSnap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
      } catch (err) {
        console.error("Failed to load initial selection data:", err);
      }
    };
    loadSelectionData();
  }, []);

  // Pre-load from initialQuotationId if passed
  useEffect(() => {
    if (initialQuotationId && quotations.length > 0) {
      handleFormDataChange('quotationId', initialQuotationId);
    }
  }, [initialQuotationId, quotations]);

  // Auto-generate PO Number: PO-YYYY-NNNN
  useEffect(() => {
    const generatePoNumber = async () => {
      try {
        const currentYear = new Date().getFullYear().toString();
        const ordersRef = collection(doc(db, 'companies', COMPANY_ID), 'orders');
        const snap = await getDocs(ordersRef);
        
        const prefix = `PO-${currentYear}-`;
        const seqNums = snap.docs
          .map(d => d.id)
          .filter(id => id.startsWith(prefix))
          .map(id => parseInt(id.replace(prefix, ''), 10))
          .filter(n => !isNaN(n));
        
        const nextSeq = seqNums.length > 0 ? Math.max(...seqNums) + 1 : 1;
        const generatedId = `${prefix}${nextSeq.toString().padStart(4, '0')}`;
        
        setFormData(prev => ({ ...prev, poId: generatedId }));
      } catch (err) {
        console.error("Failed to auto-generate PO Number:", err);
      }
    };
    generatePoNumber();
  }, []);

  const handleFormDataChange = (field: string, value: any) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      if (field === 'customerId') {
        const selectedCust = customers.find(c => c.id === value);
        updated.customerName = selectedCust ? selectedCust.name : '';
        updated.paymentTerms = selectedCust ? selectedCust.paymentTerms : prev.paymentTerms;
        updated.incoterms = selectedCust ? (selectedCust.preferredIncoterms as any || prev.incoterms) : prev.incoterms;
      }
      if (field === 'quotationId' && value) {
        const selectedQuote = quotations.find(q => q.id === value);
        if (selectedQuote) {
          updated.customerId = selectedQuote.customerId;
          const selectedCust = customers.find(c => c.id === selectedQuote.customerId);
          updated.customerName = selectedQuote.customerName || (selectedCust ? selectedCust.name : '');
          updated.incoterms = selectedQuote.incoterms as any || prev.incoterms;
          updated.paymentTerms = selectedQuote.paymentTerms || prev.paymentTerms;
          updated.exchangeRate = selectedQuote.exchangeRate || prev.exchangeRate;
          updated.issuingCompany = selectedQuote.issuingCompany || prev.issuingCompany;
        }
      }
      return updated;
    });

    if (field === 'quotationId' && value) {
      fetchQuoteItems(value);

      const selectedQuote = quotations.find(q => q.id === value);
      if (selectedQuote && selectedQuote.freightTotal && selectedQuote.freightTotal > 0) {
        setForwarders([{
          name: '포워딩업체-운송비',
          amountUsd: selectedQuote.freightTotal,
          amountKrw: 0
        }]);
      } else {
        setForwarders([]);
      }
    } else if (field === 'quotationId' && !value) {
      setForwarders([]);
    }
  };

  const fetchQuoteItems = async (quoteId: string) => {
    try {
      const revSnap = await getDocs(collection(doc(db, 'companies', COMPANY_ID, 'proforma_invoices', quoteId), 'revisions'));
      if (!revSnap.empty) {
        const sortedRevs = revSnap.docs.map(d => ({ id: d.id, ...d.data() } as any))
          .sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0));
        
        const latestRev = sortedRevs[0];
        const latestRevDoc = revSnap.docs.find(d => d.id === latestRev.id);
        if (latestRevDoc) {
          const liSnap = await getDocs(collection(latestRevDoc.ref, 'line_items'));
          const quoteItems = liSnap.docs.map(d => d.data() as any);
          
          if (quoteItems.length > 0) {
            // Always fetch the fresh products list directly from Firestore to avoid stale React closure state
            const prodSnap = await getDocs(collection(doc(db, 'companies', COMPANY_ID), 'products'));
            const currentProducts = prodSnap.docs.map(d => ({ id: d.id, ...d.data() } as Product));
            setProducts(currentProducts);

            setItems(quoteItems.map((qi, idx) => {
              let rawCode = qi.productCode || '';
              if (rawCode.startsWith('[') && rawCode.includes(']')) {
                rawCode = rawCode.substring(1, rawCode.indexOf(']')).trim();
              }
              
              const cleanRaw = rawCode.trim().toUpperCase();
              const matchedProd = currentProducts.find(p => 
                (p.productCode || '').trim().toUpperCase() === cleanRaw || 
                p.id.trim().toUpperCase() === cleanRaw
              );

              console.log(`PO item load [${idx}]: rawCode="${rawCode}", matchedProd=`, matchedProd ? { id: matchedProd.id, supplier: matchedProd.supplierName } : "NOT_FOUND");
              
              const contactInfo = [matchedProd?.supplierEmail, matchedProd?.supplierPhone].filter(Boolean).join(' / ');
              
              let buyPrice = 0;
              let itemCurrency: 'USD' | 'KRW' = 'USD';

              if (qi.purchasePriceKrw && qi.purchasePriceKrw > 0) {
                buyPrice = qi.purchasePriceKrw;
                itemCurrency = 'KRW';
              } else if (qi.purchasePriceUsd && qi.purchasePriceUsd > 0) {
                buyPrice = qi.purchasePriceUsd;
                itemCurrency = 'USD';
              } else if (matchedProd) {
                buyPrice = matchedProd.purchasePrice || 0;
                itemCurrency = (matchedProd.currency === 'KRW' ? 'KRW' : 'USD') as any;
              }

              const qty = qi.quantity || 0;
              const amt = itemCurrency === 'KRW' ? Math.round(qty * buyPrice) : parseFloat((qty * buyPrice).toFixed(2));

              return {
                itemId: (idx + 1).toString(),
                name: qi.description || matchedProd?.nameEn || matchedProd?.nameKo || '',
                supplier: matchedProd?.supplierName || (qi.supplierName !== 'undefined' ? qi.supplierName : '') || '',
                supplierContact: contactInfo || '',
                grade: qi.grade || '',
                qty,
                unit: (qi.unit || 'kg') as any,
                unitPrice: buyPrice,
                amount: amt,
                currency: itemCurrency
              };
            }));
          }
        }
      }
    } catch (e) {
      console.error("Failed to fetch quotation items:", e);
    }
  };

  const handleItemChange = (index: number, field: keyof OrderItem, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      const it = { ...updated[index], [field]: value };
      
      if (field === 'qty' || field === 'unitPrice' || field === 'currency') {
        const qty = field === 'qty' ? parseFloat(value) || 0 : parseFloat(it.qty as any) || 0;
        const price = field === 'unitPrice' ? parseFloat(value) || 0 : parseFloat(it.unitPrice as any) || 0;
        const curr = field === 'currency' ? value : it.currency;
        if (curr === 'KRW') {
          it.amount = Math.round(qty * price);
        } else {
          it.amount = parseFloat((qty * price).toFixed(2));
        }
      }
      
      updated[index] = it;
      return updated;
    });
  };

  const addItemRow = () => {
    setItems(prev => [
      ...prev,
      { itemId: (prev.length + 1).toString(), name: '', supplier: '', supplierContact: '', grade: '', qty: 0, unit: 'kg', unitPrice: 0, amount: 0, currency: 'USD' }
    ]);
  };

  const removeItemRow = (index: number) => {
    if (items.length === 1) return;
    setItems(prev => prev.filter((_, idx) => idx !== index).map((it, idx) => ({ ...it, itemId: (idx + 1).toString() })));
  };

  const totalAmount = items.reduce((sum, item) => sum + (item.amount || 0), 0);

  const handleSave = async () => {
    if (!formData.poId.trim()) { alert('PO 번호는 필수 항목입니다.'); return; }
    if (!formData.customerId) { alert('고객사를 선택해야 합니다.'); return; }
    if (items.some(item => !item.name?.trim())) { alert('모든 품목의 품명을 입력해야 합니다.'); return; }

    setIsSaving(true);
    try {
      const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', formData.poId);
      
      const hasUsd = items.some(it => it.currency === 'USD');
      const hasKrw = items.some(it => it.currency === 'KRW');
      let orderCurrency: 'USD' | 'KRW' | 'mixed' = 'USD';
      if (hasUsd && hasKrw) {
        orderCurrency = 'mixed';
      } else if (hasKrw) {
        orderCurrency = 'KRW';
      }
      
      const orderPayload: Order = {
        id: formData.poId,
        custPo: formData.custPo,
        quotationId: formData.quotationId,
        customer: formData.customerName,
        manager: formData.manager,
        incoterms: formData.incoterms,
        paymentTerms: formData.paymentTerms,
        poDate: formData.poDate,
        requestedDelivery: formData.requestedDelivery,
        remark: formData.remark,
        status: formData.status,
        items: items.map(it => ({
          itemId: it.itemId || '',
          name: it.name || '',
          supplier: it.supplier || '',
          supplierContact: it.supplierContact || '',
          grade: it.grade || '',
          qty: parseFloat(it.qty as any) || 0,
          unit: (it.unit || 'kg') as any,
          unitPrice: parseFloat(it.unitPrice as any) || 0,
          amount: it.amount || 0,
          currency: (it.currency || 'USD') as any
        })),
        totalAmount,
        currency: orderCurrency,
        exchangeRate: formData.exchangeRate || 1400,
        poIssuedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        issuingCompany: formData.issuingCompany,
        forwarders: forwarders,
        forwarderConfirmed: forwarders[0]?.name || '',
        forwarderFreightAmount: forwarders[0] ? (forwarders[0].amountUsd || forwarders[0].amountKrw || 0) : 0,
        forwarderFreightCurrency: (forwarders[0] ? (forwarders[0].amountUsd ? 'USD' : 'KRW') : 'KRW') as any
      };

      // 1. Save to orders collection
      await setDoc(orderRef, orderPayload);

      // 2. If quotationId is selected, update proforma_invoices status to "PO확정"
      if (formData.quotationId) {
        const quoteRef = doc(db, 'companies', COMPANY_ID, 'proforma_invoices', formData.quotationId);
        await setDoc(quoteRef, { status: 'PO확정', updatedAt: serverTimestamp() }, { merge: true });
      }

      alert('✅ PO가 성공적으로 등록되었습니다.');
      onSaveSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      alert('❌ PO 등록 실패: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(6px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: '14px', width: '95%', maxWidth: '1100px', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.12)' }}>
        
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e8ecf0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa', borderRadius: '14px 14px 0 0' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#111827' }}>신규 PO(발주서) 등록</div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>고객사로부터 수신한 PO 정보를 등록하고 발주를 진행합니다.</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#6b7280', fontSize: '22px', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Form Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>PO 번호 (자동 생성) ★</label>
              <input type="text" value={formData.poId} onChange={e => handleFormDataChange('poId', e.target.value)} style={{ padding: '9px 11px', border: '1px solid #e8ecf0', borderRadius: '6px', fontSize: '13px' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>고객사 PO 번호</label>
              <input type="text" value={formData.custPo} onChange={e => handleFormDataChange('custPo', e.target.value)} placeholder="예: PO-12345" style={{ padding: '9px 11px', border: '1px solid #e8ecf0', borderRadius: '6px', fontSize: '13px' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>연결할 견적서(PI)</label>
              <select value={formData.quotationId} onChange={e => handleFormDataChange('quotationId', e.target.value)} style={{ padding: '9px 11px', border: '1px solid #e8ecf0', borderRadius: '6px', fontSize: '13px' }}>
                <option value="">선택 안 함</option>
                {quotations.map(q => (
                  <option key={q.id} value={q.id}>{q.piNumber} ({q.customerName})</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>고객사 선택 ★</label>
              <select value={formData.customerId} onChange={e => handleFormDataChange('customerId', e.target.value)} style={{ padding: '9px 11px', border: '1px solid #e8ecf0', borderRadius: '6px', fontSize: '13px' }}>
                <option value="">고객사 선택</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>인코텀즈 ★</label>
              <select value={formData.incoterms} onChange={e => handleFormDataChange('incoterms', e.target.value)} style={{ padding: '9px 11px', border: '1px solid #e8ecf0', borderRadius: '6px', fontSize: '13px' }}>
                <option value="FOB">FOB</option>
                <option value="CIF HCM">CIF HCM</option>
                <option value="EXW">EXW</option>
                <option value="CFR">CFR</option>
                <option value="DAP">DAP</option>
                <option value="DDP">DDP</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>결제 조건 (Payment Terms)</label>
              <input type="text" value={formData.paymentTerms} onChange={e => handleFormDataChange('paymentTerms', e.target.value)} placeholder="예: 30 days after BL" style={{ padding: '9px 11px', border: '1px solid #e8ecf0', borderRadius: '6px', fontSize: '13px' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>PO 접수일 ★</label>
              <input type="date" value={formData.poDate} onChange={e => handleFormDataChange('poDate', e.target.value)} style={{ padding: '9px 11px', border: '1px solid #e8ecf0', borderRadius: '6px', fontSize: '13px' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>요청 납기일</label>
              <input type="date" value={formData.requestedDelivery} onChange={e => handleFormDataChange('requestedDelivery', e.target.value)} style={{ padding: '9px 11px', border: '1px solid #e8ecf0', borderRadius: '6px', fontSize: '13px' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', gridColumn: 'span 2' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>비고 (Remarks)</label>
              <input type="text" value={formData.remark} onChange={e => handleFormDataChange('remark', e.target.value)} placeholder="특이사항 입력" style={{ padding: '9px 11px', border: '1px solid #e8ecf0', borderRadius: '6px', fontSize: '13px' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>담당 영업 사원</label>
              <input type="text" value={formData.manager} onChange={e => handleFormDataChange('manager', e.target.value)} style={{ padding: '9px 11px', border: '1px solid #e8ecf0', borderRadius: '6px', fontSize: '13px' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>상태</label>
              <input type="text" value={formData.status} disabled style={{ padding: '9px 11px', border: '1px solid #e8ecf0', borderRadius: '6px', fontSize: '13px', background: '#f3f4f6' }} />
            </div>
          </div>

          {/* Items Section */}
          <div style={{ marginTop: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>📦 발주 품목 목록</span>
              <button type="button" onClick={addItemRow} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #2563eb', background: '#fff', color: '#2563eb', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>➕ 품목 행 추가</button>
            </div>
            
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '8px', textAlign: 'center', width: '40px' }}>No</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>품목명 ★</th>
                  <th style={{ padding: '8px', textAlign: 'left', width: '150px' }}>공급사</th>
                  <th style={{ padding: '8px', textAlign: 'left', width: '120px' }}>공급사 연락처</th>
                  <th style={{ padding: '8px', textAlign: 'left', width: '80px' }}>Grade</th>
                  <th style={{ padding: '8px', textAlign: 'right', width: '90px' }}>수량</th>
                  <th style={{ padding: '8px', textAlign: 'center', width: '70px' }}>단위</th>
                  <th style={{ padding: '8px', textAlign: 'center', width: '80px' }}>통화</th>
                  <th style={{ padding: '8px', textAlign: 'right', width: '100px' }}>단가</th>
                  <th style={{ padding: '8px', textAlign: 'right', width: '110px' }}>금액</th>
                  <th style={{ padding: '8px', textAlign: 'center', width: '50px' }}>삭제</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px', textAlign: 'center', color: '#64748b' }}>{idx + 1}</td>
                    <td style={{ padding: '4px' }}>
                      <input type="text" value={item.name || ''} onChange={e => handleItemChange(idx, 'name', e.target.value)} placeholder="품명 입력" style={{ width: '100%', padding: '6px', border: '1px solid #e8ecf0', borderRadius: '4px', fontSize: '12px' }} />
                    </td>
                    <td style={{ padding: '4px' }}>
                      <input type="text" value={item.supplier || ''} onChange={e => handleItemChange(idx, 'supplier', e.target.value)} placeholder="공급사명" style={{ width: '100%', padding: '6px', border: '1px solid #e8ecf0', borderRadius: '4px', fontSize: '12px' }} />
                    </td>
                    <td style={{ padding: '4px' }}>
                      <input type="text" value={item.supplierContact || ''} onChange={e => handleItemChange(idx, 'supplierContact', e.target.value)} placeholder="이메일 등" style={{ width: '100%', padding: '6px', border: '1px solid #e8ecf0', borderRadius: '4px', fontSize: '12px' }} />
                    </td>
                    <td style={{ padding: '4px' }}>
                      <input type="text" value={item.grade || ''} onChange={e => handleItemChange(idx, 'grade', e.target.value)} placeholder="Grade" style={{ width: '100%', padding: '6px', border: '1px solid #e8ecf0', borderRadius: '4px', fontSize: '12px' }} />
                    </td>
                    <td style={{ padding: '4px' }}>
                      <input type="number" value={item.qty || ''} onChange={e => handleItemChange(idx, 'qty', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #e8ecf0', borderRadius: '4px', fontSize: '12px', textAlign: 'right' }} />
                    </td>
                    <td style={{ padding: '4px' }}>
                      <select value={item.unit || 'kg'} onChange={e => handleItemChange(idx, 'unit', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #e8ecf0', borderRadius: '4px', fontSize: '12px' }}>
                        <option value="kg">kg</option>
                        <option value="MT">MT</option>
                        <option value="L">L</option>
                        <option value="drum">drum</option>
                        <option value="set">set</option>
                      </select>
                    </td>
                    <td style={{ padding: '4px' }}>
                      <select value={item.currency || 'USD'} onChange={e => handleItemChange(idx, 'currency', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #e8ecf0', borderRadius: '4px', fontSize: '12px' }}>
                        <option value="USD">USD ($)</option>
                        <option value="KRW">KRW (₩)</option>
                      </select>
                    </td>
                    <td style={{ padding: '4px' }}>
                      <input type="number" step={item.currency === 'KRW' ? '1' : '0.01'} value={item.unitPrice || ''} onChange={e => handleItemChange(idx, 'unitPrice', e.target.value)} style={{ width: '100%', padding: '6px', border: '1px solid #e8ecf0', borderRadius: '4px', fontSize: '12px', textAlign: 'right' }} />
                    </td>
                    <td style={{ padding: '6px', textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>
                      {item.currency === 'KRW' ? '₩' : '$'}{(item.amount || 0).toLocaleString('en-US', item.currency === 'KRW' ? {} : { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '4px', textAlign: 'center' }}>
                      <button type="button" onClick={() => removeItemRow(idx)} disabled={items.length === 1} style={{ background: 'transparent', border: 'none', color: items.length === 1 ? '#cbd5e1' : '#ef4444', fontSize: '16px', cursor: items.length === 1 ? 'not-allowed' : 'pointer' }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
 
          {/* Forwarder/Transport Section */}
          <div style={{ marginTop: '4px', padding: '14px', background: '#f5f3ff', borderRadius: '8px', border: '1px solid #ddd6fe' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ fontSize: '13px', fontWeight: 700, color: '#7c3aed' }}>🚢 포워딩/운송사 & 운송비</label>
              <button
                type="button"
                onClick={() => setForwarders(prev => [...prev, { name: '', amountUsd: 0, amountKrw: 0 }])}
                style={{ padding: '5px 12px', fontSize: '12px', fontWeight: 700, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
              >
                + 운송사 추가
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 140px 32px', gap: '6px', marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>포워딩사/운송사명</span>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>해상운임 (USD $)</span>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>국내운송 및 비용 (KRW ₩)</span>
              <span></span>
            </div>
            {forwarders.length === 0 ? (
              <div style={{ padding: '10px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>운송사를 추가하세요</div>
            ) : (
              forwarders.map((fw, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 140px 32px', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={fw.name || ''}
                    onChange={e => setForwarders(prev => prev.map((f, i) => i === idx ? { ...f, name: e.target.value } : f))}
                    placeholder="포워딩사명 입력"
                    style={{ padding: '8px', border: '1px solid #ddd6fe', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }}
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={fw.amountUsd ?? 0}
                    onChange={e => setForwarders(prev => prev.map((f, i) => i === idx ? { ...f, amountUsd: parseFloat(e.target.value) || 0 } : f))}
                    placeholder="0.00"
                    style={{ padding: '8px', border: '1px solid #ddd6fe', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }}
                  />
                  <input
                    type="number"
                    step="1"
                    value={fw.amountKrw ?? 0}
                    onChange={e => setForwarders(prev => prev.map((f, i) => i === idx ? { ...f, amountKrw: parseFloat(e.target.value) || 0 } : f))}
                    placeholder="0"
                    style={{ padding: '8px', border: '1px solid #ddd6fe', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }}
                  />
                  <button
                    type="button"
                    onClick={() => setForwarders(prev => prev.filter((_, i) => i !== idx))}
                    style={{ padding: '8px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
                  >✕</button>
                </div>
              ))
            )}
          </div>

          {/* Real-time Total sum */}
          <div style={{ alignSelf: 'flex-end', marginTop: '10px', fontSize: '16px', fontWeight: 800, color: '#0f172a', display: 'flex', gap: '20px' }}>
            <span>총 발주 금액 (Grand Total):</span>
            {(() => {
              const usdTotal = items.filter(it => it.currency !== 'KRW').reduce((sum, it) => sum + (it.amount || 0), 0);
              const krwTotal = items.filter(it => it.currency === 'KRW').reduce((sum, it) => sum + (it.amount || 0), 0);
              return (
                <span style={{ color: '#dc2626' }}>
                  {usdTotal > 0 && `$${usdTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD`}
                  {usdTotal > 0 && krwTotal > 0 && ' / '}
                  {krwTotal > 0 && `₩${krwTotal.toLocaleString('en-US')} KRW`}
                  {usdTotal === 0 && krwTotal === 0 && '$0.00 USD'}
                </span>
              );
            })()}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #e8ecf0', background: '#fafafa', display: 'flex', justifyContent: 'flex-end', gap: '12px', borderRadius: '0 0 14px 14px' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: '7px', border: '1px solid #e8ecf0', background: '#fff', fontWeight: 600, color: '#6b7280', cursor: 'pointer' }}>취소</button>
          <button onClick={handleSave} disabled={isSaving} style={{ padding: '9px 18px', borderRadius: '7px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
            {isSaving ? '등록 중...' : '✔ 등록 완료'}
          </button>
        </div>

      </div>
    </div>
  );
};
