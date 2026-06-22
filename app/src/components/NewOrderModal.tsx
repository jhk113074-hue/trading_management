import React, { useState, useEffect } from 'react';
import { collection, doc, setDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { db, COMPANY_ID } from '../firebase';
import type { Order, OrderItem, ForwarderEntry } from '../types/order';
import type { Customer } from '../types/customer';
import type { ProformaInvoice } from '../types/pi';
import type { Product } from '../types/product';
import { ProductModal } from './ProductModal';
import { ProductSearchModal } from './ProductSearchModal';
import { CustomerSearchModal } from './CustomerSearchModal';
import { PISearchModal } from './PISearchModal';

const getRawProductCode = (code: string | undefined): string => {
  if (!code) return '';
  const val = code.trim();
  if (val.startsWith('[') && val.includes(']')) {
    return val.substring(1, val.indexOf(']')).trim();
  }
  return val;
};

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
  const [products, setProducts] = useState<Product[]>([]);
  const [isProdModalOpen, setIsProdModalOpen] = useState(false);
  const [editingProd, setEditingProd] = useState<Product | undefined>(undefined);
  const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
  const [searchItemIndex, setSearchItemIndex] = useState<number | null>(null);
  const [isCustomerSearchOpen, setIsCustomerSearchOpen] = useState(false);
  const [isPISearchOpen, setIsPISearchOpen] = useState(false);
  
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

  // Auto-generate PO Number: PO-YS-26-xxxx or PO-YSACC-26-xxxx
  useEffect(() => {
    const generatePoNumber = async () => {
      try {
        const currentYear2d = new Date().getFullYear().toString().substring(2); // '26'
        const companyPrefix = formData.issuingCompany === 'YS' ? 'YS' : 'YSACC';
        const prefix = `PO-${companyPrefix}-${currentYear2d}-`;
        const ordersRef = collection(doc(db, 'companies', COMPANY_ID), 'orders');
        const snap = await getDocs(ordersRef);
        
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
  }, [formData.issuingCompany]);

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
          budgetAmountUsd: selectedQuote.freightTotal
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
              
              // The user requested that the order (PO) registration screen displays the received order details in USD (i.e. salePriceUsd from PI line items)
              const orderPrice = qi.salePriceUsd || 0;
              const itemCurrency: 'USD' | 'KRW' = 'USD';

              const qty = qi.quantity || 0;
              const amt = parseFloat((qty * orderPrice).toFixed(2));

              // Load purchase price from the PI item or fallback to Product master
              let purchasePrice = 0;
              let purchaseCurrency: 'USD' | 'KRW' = 'USD';
              if (qi.purchasePriceKrw && qi.purchasePriceKrw > 0) {
                purchasePrice = qi.purchasePriceKrw;
                purchaseCurrency = 'KRW';
              } else if (qi.purchasePriceUsd && qi.purchasePriceUsd > 0) {
                purchasePrice = qi.purchasePriceUsd;
                purchaseCurrency = 'USD';
              } else if (matchedProd) {
                purchasePrice = matchedProd.purchasePrice || 0;
                purchaseCurrency = (matchedProd.currency === 'KRW' ? 'KRW' : 'USD') as any;
              }

              return {
                itemId: (idx + 1).toString(),
                name: qi.productCode ? `[${qi.productCode}] ${qi.description || matchedProd?.nameEn || matchedProd?.nameKo || ''}` : (qi.description || matchedProd?.nameEn || matchedProd?.nameKo || ''),
                supplier: matchedProd?.supplierName || (qi.supplierName !== 'undefined' ? qi.supplierName : '') || '',
                supplierContact: contactInfo || '',
                grade: qi.grade || '',
                qty,
                unit: (qi.unit || 'kg') as any,
                unitPrice: orderPrice,
                purchaseUnitPrice: purchasePrice,
                purchaseUnitCurrency: purchaseCurrency,
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
      let it = { ...updated[index], [field]: value };
      
      if (field === 'name') {
        const parsedCode = getRawProductCode(value);
        const prod = products.find(p => p.productCode === parsedCode || p.id === parsedCode);
        if (prod) {
          const contactInfo = [prod.supplierEmail, prod.supplierPhone].filter(Boolean).join(' / ');
          const displayName = prod.nameEn || prod.nameKo || '';
          
          let buyPrice = prod.purchasePrice || 0;
          let itemCurrency: 'USD' | 'KRW' = (prod.currency === 'KRW' ? 'KRW' : 'USD');
          const qty = it.qty || 0;
          const amt = itemCurrency === 'KRW' ? Math.round(qty * buyPrice) : parseFloat((qty * buyPrice).toFixed(2));

          it = {
            ...it,
            name: `[${prod.productCode}] ${displayName}`,
            supplier: prod.supplierName || '',
            supplierContact: contactInfo || '',
            grade: prod.spec || '',
            unit: (prod.unit || 'kg') as any,
            unitPrice: buyPrice,
            purchaseUnitPrice: buyPrice,
            currency: itemCurrency,
            amount: amt
          };
        }
      }

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

      if (field === 'purchaseUnitPrice' || field === 'purchaseUnitCurrency') {
        const pPrice = field === 'purchaseUnitPrice' ? parseFloat(value) || 0 : parseFloat(it.purchaseUnitPrice as any) || 0;
        const pCurr = field === 'purchaseUnitCurrency' ? value : it.purchaseUnitCurrency;
        it.purchaseUnitPrice = pPrice;
        it.purchaseUnitCurrency = pCurr;
      }
      
      updated[index] = it;
      return updated;
    });
  };

  const handleSelectProduct = (idx: number, prod: Product) => {
    setItems(prev => {
      const updated = [...prev];
      const contactInfo = [prod.supplierEmail, prod.supplierPhone].filter(Boolean).join(' / ');
      
      let buyPrice = prod.purchasePrice || 0;
      let itemCurrency: 'USD' | 'KRW' = (prod.currency === 'KRW' ? 'KRW' : 'USD');
      const qty = updated[idx].qty || 0;
      const amt = itemCurrency === 'KRW' ? Math.round(qty * buyPrice) : parseFloat((qty * buyPrice).toFixed(2));

      const displayName = prod.nameEn || prod.nameKo || '';

      updated[idx] = {
        ...updated[idx],
        name: `[${prod.productCode}] ${displayName}`,
        supplier: prod.supplierName || '',
        supplierContact: contactInfo || '',
        grade: prod.spec || '',
        unit: (prod.unit || 'kg') as any,
        unitPrice: buyPrice,
        purchaseUnitPrice: buyPrice,
        currency: itemCurrency,
        amount: amt
      };
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
          purchaseUnitPrice: parseFloat(it.purchaseUnitPrice as any) || 0,
          purchaseUnitCurrency: (it.purchaseUnitCurrency || 'USD') as any,
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
        forwarderFreightCurrency: (forwarders[0] ? (forwarders[0].amountUsd ? 'USD' : 'KRW') : 'KRW') as any,
        
        // fields copied from selected PI to prevent data loss in PO접수 step
        piNumber: formData.quotationId || '',
        customerAddress: quotations.find(q => q.id === formData.quotationId)?.customerAddress || '',
        portOfLoading: quotations.find(q => q.id === formData.quotationId)?.departurePort || '',
        portOfDischarge: quotations.find(q => q.id === formData.quotationId)?.destinationPort || '',
        destinationCountry: quotations.find(q => q.id === formData.quotationId)?.destinationPort || ''
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
      <div style={{ background: '#fff', borderRadius: '12px', width: '95%', maxWidth: '1150px', maxHeight: '96vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.12)' }}>
        
        {/* Header */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #e8ecf0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa', borderRadius: '12px 12px 0 0' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>신규 PO(발주서) 등록</div>
            <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '1px' }}>고객사로부터 수신한 PO 정보를 등록하고 발주를 진행합니다.</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#6b7280', fontSize: '18px', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '12px 16px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          
          {/* Form Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <label style={{ fontSize: '10px', fontWeight: 600, color: '#6b7280' }}>PO 번호 (자동 생성) ★</label>
              <input type="text" value={formData.poId} onChange={e => handleFormDataChange('poId', e.target.value)} style={{ padding: '5px 8px', border: '1px solid #e8ecf0', borderRadius: '6px', fontSize: '12px' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <label style={{ fontSize: '10px', fontWeight: 600, color: '#6b7280' }}>발행사 ★</label>
              <select value={formData.issuingCompany} onChange={e => handleFormDataChange('issuingCompany', e.target.value)} style={{ padding: '5px 8px', border: '1px solid #e8ecf0', borderRadius: '6px', fontSize: '12px' }}>
                <option value="YSACC">YSACC</option>
                <option value="YS">영성ACC</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <label style={{ fontSize: '10px', fontWeight: 600, color: '#6b7280' }}>고객사 PO 번호</label>
              <input type="text" value={formData.custPo} onChange={e => handleFormDataChange('custPo', e.target.value)} placeholder="예: PO-12345" style={{ padding: '5px 8px', border: '1px solid #e8ecf0', borderRadius: '6px', fontSize: '12px' }} />
            </div>

            {/* 연결할 견적서 (PI) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <label style={{ fontSize: '10px', fontWeight: 600, color: '#6b7280' }}>연결할 견적서(PI)</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input 
                  type="text" 
                  value={(() => {
                    const q = quotations.find(item => item.id === formData.quotationId);
                    return q ? `${q.piNumber} (${q.customerName})` : '';
                  })()}
                  placeholder="견적서 검색/선택"
                  readOnly
                  onClick={() => setIsPISearchOpen(true)}
                  style={{
                    width: '100%',
                    padding: '5px 42px 5px 8px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    fontSize: '12px',
                    outline: 'none',
                    cursor: 'pointer',
                    background: '#fff',
                    boxSizing: 'border-box'
                  }} 
                />
                {formData.quotationId && (
                  <button
                    type="button"
                    onClick={() => handleFormDataChange('quotationId', '')}
                    style={{
                      position: 'absolute',
                      right: '24px',
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      fontSize: '11px',
                      padding: '2px',
                      zIndex: 5,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title="비우기"
                  >
                    ✕
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsPISearchOpen(true)}
                  style={{
                    position: 'absolute',
                    right: '6px',
                    background: 'transparent',
                    border: 'none',
                    color: '#3b82f6',
                    cursor: 'pointer',
                    fontSize: '12px',
                    zIndex: 5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title="검색"
                >
                  🔍
                </button>
              </div>
            </div>

            {/* 고객사 선택 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <label style={{ fontSize: '10px', fontWeight: 600, color: '#6b7280' }}>고객사 선택 ★</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input 
                  type="text" 
                  value={formData.customerName || ''} 
                  placeholder="고객사 검색/선택"
                  readOnly
                  onClick={() => setIsCustomerSearchOpen(true)}
                  style={{
                    width: '100%',
                    padding: '5px 42px 5px 8px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    fontSize: '12px',
                    outline: 'none',
                    cursor: 'pointer',
                    background: '#fff',
                    boxSizing: 'border-box'
                  }} 
                />
                {formData.customerId && (
                  <button
                    type="button"
                    onClick={() => handleFormDataChange('customerId', '')}
                    style={{
                      position: 'absolute',
                      right: '24px',
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      fontSize: '11px',
                      padding: '2px',
                      zIndex: 5,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title="비우기"
                  >
                    ✕
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsCustomerSearchOpen(true)}
                  style={{
                    position: 'absolute',
                    right: '6px',
                    background: 'transparent',
                    border: 'none',
                    color: '#3b82f6',
                    cursor: 'pointer',
                    fontSize: '12px',
                    zIndex: 5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title="검색"
                >
                  🔍
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <label style={{ fontSize: '10px', fontWeight: 600, color: '#6b7280' }}>인코텀즈 ★</label>
              <select value={formData.incoterms} onChange={e => handleFormDataChange('incoterms', e.target.value)} style={{ padding: '5px 8px', border: '1px solid #e8ecf0', borderRadius: '6px', fontSize: '12px' }}>
                <option value="FOB">FOB</option>
                <option value="CIF HCM">CIF HCM</option>
                <option value="EXW">EXW</option>
                <option value="CFR">CFR</option>
                <option value="DAP">DAP</option>
                <option value="DDP">DDP</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <label style={{ fontSize: '10px', fontWeight: 600, color: '#6b7280' }}>결제 조건 (Payment Terms)</label>
              <input type="text" value={formData.paymentTerms} onChange={e => handleFormDataChange('paymentTerms', e.target.value)} placeholder="예: 30 days after BL" style={{ padding: '5px 8px', border: '1px solid #e8ecf0', borderRadius: '6px', fontSize: '12px' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <label style={{ fontSize: '10px', fontWeight: 600, color: '#6b7280' }}>PO 접수일 ★</label>
              <input type="date" value={formData.poDate} onChange={e => handleFormDataChange('poDate', e.target.value)} style={{ padding: '5px 8px', border: '1px solid #e8ecf0', borderRadius: '6px', fontSize: '12px' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <label style={{ fontSize: '10px', fontWeight: 600, color: '#6b7280' }}>요청 납기일</label>
              <input type="date" value={formData.requestedDelivery} onChange={e => handleFormDataChange('requestedDelivery', e.target.value)} style={{ padding: '5px 8px', border: '1px solid #e8ecf0', borderRadius: '6px', fontSize: '12px' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', gridColumn: 'span 2' }}>
              <label style={{ fontSize: '10px', fontWeight: 600, color: '#6b7280' }}>비고 (Remarks)</label>
              <input type="text" value={formData.remark} onChange={e => handleFormDataChange('remark', e.target.value)} placeholder="특이사항 입력" style={{ padding: '5px 8px', border: '1px solid #e8ecf0', borderRadius: '6px', fontSize: '12px' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <label style={{ fontSize: '10px', fontWeight: 600, color: '#6b7280' }}>담당 영업 사원</label>
              <input type="text" value={formData.manager} onChange={e => handleFormDataChange('manager', e.target.value)} style={{ padding: '5px 8px', border: '1px solid #e8ecf0', borderRadius: '6px', fontSize: '12px' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <label style={{ fontSize: '10px', fontWeight: 600, color: '#6b7280' }}>상태</label>
              <input type="text" value={formData.status} disabled style={{ padding: '5px 8px', border: '1px solid #e8ecf0', borderRadius: '6px', fontSize: '12px', background: '#f3f4f6' }} />
            </div>
          </div>

          {/* Items Section */}
          <div style={{ marginTop: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>📦 발주 품목 목록</span>
              <button type="button" onClick={addItemRow} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #2563eb', background: '#fff', color: '#2563eb', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>➕ 품목 행 추가</button>
            </div>
            
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '11px' }}>
              <thead>
                <tr style={{ background: '#1e3a5f', color: '#ffffff' }}>
                  <th style={{ padding: '8px 4px', textAlign: 'center', width: '35px', borderTopLeftRadius: '6px', borderBottomLeftRadius: '6px' }}>No</th>
                  <th style={{ padding: '8px 4px', textAlign: 'left', width: '250px' }}>상품코드</th>
                  <th style={{ padding: '8px 4px', textAlign: 'left', width: '150px' }}>공급사</th>
                  <th style={{ padding: '8px 4px', textAlign: 'center', width: '100px' }}>수량 / 단위</th>
                  <th style={{ padding: '8px 4px', textAlign: 'center', width: '120px' }}>매출 통화 / 단가</th>
                  <th style={{ padding: '8px 4px', textAlign: 'center', width: '120px' }}>매입 통화 / 단가</th>
                  <th style={{ padding: '8px 4px', textAlign: 'right', width: '100px' }}>금액</th>
                  <th style={{ padding: '8px 4px', textAlign: 'center', width: '45px', borderTopRightRadius: '6px', borderBottomRightRadius: '6px' }}>삭제</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 4px', textAlign: 'center', color: '#64748b', verticalAlign: 'middle' }}>{idx + 1}</td>
                    
                    {/* 상품코드 */}
                    <td style={{ padding: '4px 4px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <input
                              type="text"
                              list={`po_products_datalist_${idx}`}
                              value={item.name || ''}
                              onChange={e => handleItemChange(idx, 'name', e.target.value)}
                              placeholder="상품코드 검색/입력"
                              style={{ width: '100%', padding: '0 40px 0 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', boxSizing: 'border-box', height: '26px', outline: 'none' }}
                            />
                            {item.name && (
                              <button
                                type="button"
                                onClick={() => handleItemChange(idx, 'name', '')}
                                style={{
                                  position: 'absolute',
                                  right: '20px',
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#94a3b8',
                                  cursor: 'pointer',
                                  fontSize: '10px',
                                  padding: '2px',
                                  zIndex: 5,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                                title="비우기"
                              >
                                ✕
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setSearchItemIndex(idx);
                                setIsProductSearchOpen(true);
                              }}
                              style={{
                                position: 'absolute',
                                right: '4px',
                                background: 'transparent',
                                border: 'none',
                                color: '#3b82f6',
                                cursor: 'pointer',
                                fontSize: '11px',
                                padding: '2px',
                                zIndex: 5,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                              title="상품 검색 (Subwindow)"
                            >
                              🔍
                            </button>
                            <datalist id={`po_products_datalist_${idx}`}>
                              {products.map(p => {
                                const displayName = p.nameEn || p.nameKo || '';
                                return (
                                  <option key={p.id} value={`[${p.productCode}] ${displayName}`}>
                                    [{p.productCode}] {displayName}
                                  </option>
                                );
                              })}
                            </datalist>
                          </div>
                          {(() => {
                            const rawCode = getRawProductCode(item.name);
                            const p = products.find(prod => prod.productCode === rawCode || prod.id === rawCode);
                            return (
                              <button
                                type="button"
                                onClick={() => {
                                  if (p) {
                                    setEditingProd(p);
                                    setIsProdModalOpen(true);
                                  } else {
                                    alert('먼저 등록된 상품을 검색/선택해주세요.');
                                  }
                                }}
                                disabled={!p}
                                title="선택된 상품 수정"
                                style={{
                                  background: p ? '#fef08a' : '#f1f5f9',
                                  border: p ? '1px solid #cbd5e1' : '1px solid #e2e8f0',
                                  color: p ? '#a16207' : '#94a3b8',
                                  borderRadius: '4px',
                                  padding: '2px 4px',
                                  cursor: p ? 'pointer' : 'not-allowed',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  height: '26px',
                                  width: '26px',
                                  boxSizing: 'border-box'
                                }}
                              >
                                ✏️
                              </button>
                            );
                          })()}
                        </div>
                      </div>
                    </td>

                    {/* 공급사 */}
                    <td style={{ padding: '4px 4px', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input
                          type="text"
                          value={item.supplier || ''}
                          onChange={e => handleItemChange(idx, 'supplier', e.target.value)}
                          placeholder="공급사명"
                          style={{ flex: 1, padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', boxSizing: 'border-box', height: '26px', outline: 'none' }}
                        />
                        {(() => {
                          const rawCode = getRawProductCode(item.name);
                          const p = products.find(prod => prod.productCode === rawCode || prod.id === rawCode);
                          if (p && p.supplierName) {
                            return (
                              <span style={{ fontSize: '10px', color: '#475569', fontWeight: 500, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: '80px' }} title={p.supplierName}>
                                {p.supplierName.replace(/\(주\)/g, '').replace(/주식회사/g, '').trim()}
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </td>

                    {/* 수량 / 단위 */}
                    <td style={{ padding: '4px 4px' }}>
                      <div style={{ display: 'flex', flexDirection: 'row', gap: '3px', alignItems: 'center' }}>
                        <input
                          type="number"
                          value={item.qty || ''}
                          onChange={e => handleItemChange(idx, 'qty', e.target.value)}
                          placeholder="수량"
                          style={{ width: '65px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', textAlign: 'right', boxSizing: 'border-box', height: '26px', outline: 'none' }}
                        />
                        <select
                          value={item.unit || 'kg'}
                          onChange={e => handleItemChange(idx, 'unit', e.target.value)}
                          style={{ width: '55px', padding: '0 4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', boxSizing: 'border-box', height: '26px', outline: 'none' }}
                        >
                          <option value="kg">kg</option>
                          <option value="MT">MT</option>
                          <option value="L">L</option>
                          <option value="drum">drum</option>
                          <option value="set">set</option>
                        </select>
                      </div>
                    </td>

                    {/* 매출 통화 / 단가 */}
                    <td style={{ padding: '4px 4px' }}>
                      <div style={{ display: 'flex', flexDirection: 'row', gap: '3px', alignItems: 'center' }}>
                        <select
                          value={item.currency || 'USD'}
                          onChange={e => handleItemChange(idx, 'currency', e.target.value)}
                          style={{ width: '70px', padding: '0 4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', boxSizing: 'border-box', height: '26px', outline: 'none' }}
                        >
                          <option value="USD">USD ($)</option>
                          <option value="KRW">KRW (₩)</option>
                        </select>
                        <input
                          type="number"
                          step={item.currency === 'KRW' ? '1' : '0.01'}
                          value={item.unitPrice || ''}
                          onChange={e => handleItemChange(idx, 'unitPrice', e.target.value)}
                          placeholder="매출 단가"
                          style={{ width: '75px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', textAlign: 'right', boxSizing: 'border-box', height: '26px', outline: 'none' }}
                        />
                      </div>
                    </td>

                    {/* 매입 통화 / 단가 */}
                    <td style={{ padding: '4px 4px' }}>
                      <div style={{ display: 'flex', flexDirection: 'row', gap: '3px', alignItems: 'center' }}>
                        <select
                          value={item.purchaseUnitCurrency || 'USD'}
                          onChange={e => handleItemChange(idx, 'purchaseUnitCurrency', e.target.value)}
                          style={{ width: '70px', padding: '0 4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', boxSizing: 'border-box', height: '26px', outline: 'none' }}
                        >
                          <option value="USD">USD ($)</option>
                          <option value="KRW">KRW (₩)</option>
                        </select>
                        <input
                          type="number"
                          step={item.purchaseUnitCurrency === 'KRW' ? '1' : '0.01'}
                          value={item.purchaseUnitPrice || ''}
                          onChange={e => handleItemChange(idx, 'purchaseUnitPrice', e.target.value)}
                          placeholder="매입 단가"
                          style={{ width: '75px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', textAlign: 'right', boxSizing: 'border-box', height: '26px', outline: 'none' }}
                        />
                      </div>
                    </td>

                    {/* 금액 */}
                    <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 600, color: '#1e293b', verticalAlign: 'middle', fontSize: '11.5px' }}>
                      {item.currency === 'KRW' ? '₩' : '$'}{(item.amount || 0).toLocaleString('en-US', item.currency === 'KRW' ? {} : { minimumFractionDigits: 2 })}
                    </td>

                    {/* 삭제 */}
                    <td style={{ padding: '6px 4px', textAlign: 'center', verticalAlign: 'middle' }}>
                      <button
                        type="button"
                        onClick={() => removeItemRow(idx)}
                        disabled={items.length === 1}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: items.length === 1 ? '#cbd5e1' : '#ef4444',
                          fontSize: '14px',
                          cursor: items.length === 1 ? 'not-allowed' : 'pointer'
                        }}
                      >
                        ✕
                      </button>
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
                onClick={() => {
                  if (forwarders.length >= 4) {
                    alert("운송사는 최대 4개까지 추가 가능합니다.");
                    return;
                  }
                  setForwarders(prev => [...prev, { name: '', amountUsd: 0, budgetAmountUsd: 0 }]);
                }}
                style={{ padding: '5px 12px', fontSize: '12px', fontWeight: 700, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
              >
                + 운송사 추가
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px 32px', gap: '6px', marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>포워딩사/운송사명</span>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>해상운임 (USD $)</span>
              <span></span>
            </div>
            {forwarders.length === 0 ? (
              <div style={{ padding: '10px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>운송사를 추가하세요</div>
            ) : (
              forwarders.map((fw, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 200px 32px', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={fw.name || ''}
                    onChange={e => setForwarders(prev => prev.map((f, i) => i === idx ? { ...f, name: e.target.value } : f))}
                    placeholder="포워딩사명 입력"
                    style={{ padding: '8px', border: '1px solid #ddd6fe', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }}
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={(fw.amountUsd ?? 0) === 0 ? '' : (fw.amountUsd ?? 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    onChange={e => {
                      const raw = e.target.value.replace(/,/g, '');
                      const num = parseFloat(raw) || 0;
                      setForwarders(prev => prev.map((f, i) => i === idx ? { ...f, amountUsd: num, budgetAmountUsd: num } : f));
                    }}
                    placeholder="0.00"
                    style={{ padding: '8px', border: '1px solid #ddd6fe', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box', textAlign: 'right' }}
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
        <div style={{ padding: '8px 16px', borderTop: '1px solid #e8ecf0', background: '#fafafa', display: 'flex', justifyContent: 'flex-end', gap: '12px', borderRadius: '0 0 12px 12px' }}>
          <button onClick={onClose} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #e8ecf0', background: '#fff', fontWeight: 600, color: '#6b7280', cursor: 'pointer', fontSize: '12px' }}>취소</button>
          <button onClick={handleSave} disabled={isSaving} style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '12px' }}>
            {isSaving ? '등록 중...' : '✔ 등록 완료'}
          </button>
        </div>

      </div>

      {isProductSearchOpen && searchItemIndex !== null && (
        <ProductSearchModal
          products={products}
          onClose={() => setIsProductSearchOpen(false)}
          onSelect={(prod) => {
            handleSelectProduct(searchItemIndex, prod);
            setIsProductSearchOpen(false);
          }}
        />
      )}

      {isProdModalOpen && (
        <ProductModal
          initialProduct={editingProd}
          products={products}
          onClose={() => {
            setIsProdModalOpen(false);
            setEditingProd(undefined);
            // Refresh products list
            const refreshProducts = async () => {
              const prodSnap = await getDocs(collection(doc(db, 'companies', COMPANY_ID), 'products'));
              setProducts(prodSnap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
            };
            refreshProducts();
          }}
        />
      )}
      {isCustomerSearchOpen && (
        <CustomerSearchModal
          customers={customers}
          onClose={() => setIsCustomerSearchOpen(false)}
          onSelect={(cust) => {
            handleFormDataChange('customerId', cust.id);
            setIsCustomerSearchOpen(false);
          }}
        />
      )}

      {isPISearchOpen && (
        <PISearchModal
          pis={quotations}
          onClose={() => setIsPISearchOpen(false)}
          onSelect={(pi) => {
            handleFormDataChange('quotationId', pi.id);
            setIsPISearchOpen(false);
          }}
        />
      )}
    </div>
  );
};
