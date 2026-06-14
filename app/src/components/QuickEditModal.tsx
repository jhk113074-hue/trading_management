import React, { useState, useEffect } from 'react';
import { collection, doc, getDocs } from 'firebase/firestore';
import { db, COMPANY_ID } from '../firebase';
import type { Order, OrderItem, ForwarderEntry } from '../types/order';
import type { Customer } from '../types/customer';
import type { ProformaInvoice } from '../types/pi';

interface Props {
  order: Order;
  colKey: string;
  onClose: () => void;
  onSave: (fields: Partial<Order>) => Promise<void>;
  piMap: Record<string, number>;
}

export const QuickEditModal: React.FC<Props> = ({ order, colKey, onClose, onSave, piMap }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [quotations, setQuotations] = useState<ProformaInvoice[]>([]);

  // Local state fields
  const [customer, setCustomer] = useState(order.customer || '');
  const [issuingCompany, setIssuingCompany] = useState<any>(order.issuingCompany || 'YSACC');
  const [cargoReadyDate, setCargoReadyDate] = useState(order.cargoReadyDate || '');
  const [cfsEntryDate, setCfsEntryDate] = useState(order.cfsEntryDate || '');
  
  // Shipment Schedule fields
  const [etd, setEtd] = useState(order.etd || '');
  const [eta, setEta] = useState(order.eta || '');
  const [shipmentCompleted] = useState<any>(order.shipmentCompleted || '');
  const [docsDeadlineDate, setDocsDeadlineDate] = useState(order.docsDeadlineDate || '');

  const [volume, setVolume] = useState(order.containerVolumeQuantities || '');
  const [vessel, setVessel] = useState(order.vesselBooking || '');
  
  // Invoice amount fields
  const [quotationId, setQuotationId] = useState(order.quotationId || '');
  const [totalAmount, setTotalAmount] = useState(order.totalAmount || 0);
  const [exchangeRate, setExchangeRate] = useState(order.exchangeRate || 1400);

  // Items / Supplier / SupplierAmount fields
  const [items, setItems] = useState<OrderItem[]>(order.items ? JSON.parse(JSON.stringify(order.items)) : []);

  // 포워더 배열 상태 (기존 단일 필드에서 마이그레이션)
  const initForwarders = (): ForwarderEntry[] => {
    if (order.forwarders && order.forwarders.length > 0) {
      return JSON.parse(JSON.stringify(order.forwarders));
    }
    // legacy single forwarder migration
    if (order.forwarderConfirmed) {
      return [{ name: order.forwarderConfirmed, freightAmount: order.forwarderFreightAmount || 0, freightCurrency: order.forwarderFreightCurrency || 'KRW' }];
    }
    return [];
  };
  const [forwarders, setForwarders] = useState<ForwarderEntry[]>(initForwarders);

  const addForwarder = () => setForwarders(prev => [...prev, { name: '', freightAmount: 0, freightCurrency: 'KRW' }]);
  const removeForwarder = (idx: number) => setForwarders(prev => prev.filter((_, i) => i !== idx));
  const updateForwarder = (idx: number, field: keyof ForwarderEntry, value: string | number) =>
    setForwarders(prev => prev.map((f, i) => i === idx ? { ...f, [field]: value } : f));

  // Supplier payments (supplierRemitted)
  const [supplierPayments, setSupplierPayments] = useState<Record<string, { status: string; date: string }>>(
    order.supplierPayments ? JSON.parse(JSON.stringify(order.supplierPayments)) : {}
  );

  const [ciPlSentDate, setCiPlSentDate] = useState(order.ciPlSentDate || '');
  const [incoterms, setIncoterms] = useState<any>(order.incoterms || '');
  const [paymentTerms, setPaymentTerms] = useState(order.paymentTerms || '');
  const [exportNo, setExportNo] = useState(order.exportDeclarationNo || '');
  const [customsExchangeRate, setCustomsExchangeRate] = useState<number | ''>(order.customsExchangeRate || '');
  const [docsSent, setDocsSent] = useState(order.shippingDocsSentDate || '');
  const [bankSubmitted, setBankSubmitted] = useState(order.bankSubmissionDate || '');
  const [trackingNo, setTrackingNo] = useState(order.shippingDocsTrackingNo || '');
  const [paymentCollected, setPaymentCollected] = useState(order.paymentCollectedDate || '');
  const mapStatusToStep = (st: string): string => {
    if (st === "ORDER기본정보" || st === "주문") return "주문";
    if (st === "발주서 발행" || st === "공급사별 납기 결정" || st === "공급사 세금계산서 및 결제" || st === "발주") return "발주";
    if (st === "선적&진행현황" || st === "선적서류 작성 및 수출신고" || st === "선적서류 발송 및 은행제출" || st === "선적관리") return "선적관리";
    if (st === "이익계산" || st === "이익관리") return "이익관리";
    return "주문";
  };

  const [status, setStatus] = useState<any>(mapStatusToStep(order.status || ''));
  const [remark, setRemark] = useState(order.remark || '');

  // Load selection options
  useEffect(() => {
    const loadData = async () => {
      try {
        const custSnap = await getDocs(collection(doc(db, 'companies', COMPANY_ID), 'customers'));
        setCustomers(custSnap.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));

        const quoteSnap = await getDocs(collection(doc(db, 'companies', COMPANY_ID), 'proforma_invoices'));
        setQuotations(quoteSnap.docs.map(d => ({ id: d.id, ...d.data() } as ProformaInvoice)));
      } catch (err) {
        console.error("QuickEditModal: Failed to load customers/quotes:", err);
      }
    };
    loadData();
  }, []);

  // Extract unique suppliers from current items to populate payments state if empty
  const suppliers = Array.from(new Set(items.map(it => it.supplier).filter(Boolean)));
  useEffect(() => {
    if (colKey === 'supplierRemitted') {
      const updated = { ...supplierPayments };
      suppliers.forEach(sup => {
        if (!updated[sup]) {
          updated[sup] = { status: '미결제', date: '' };
        }
      });
      setSupplierPayments(updated);
    }
  }, [items, colKey]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload: Partial<Order> = {};

      switch (colKey) {
        case 'customer':
          payload.customer = customer;
          break;
        case 'issuingCompany':
          payload.issuingCompany = issuingCompany;
          break;
        case 'cargoReady':
          payload.cargoReadyDate = cargoReadyDate;
          payload.cfsEntryDate = cfsEntryDate;
          break;
        case 'shipmentSchedule':
          payload.etd = etd;
          payload.eta = eta;
          payload.shipmentCompleted = shipmentCompleted;
          payload.docsDeadlineDate = docsDeadlineDate;
          break;
        case 'volumeVessel':
          payload.containerVolumeQuantities = volume;
          payload.vesselBooking = vessel;
          break;
        case 'volume':
          payload.containerVolumeQuantities = volume;
          break;
        case 'vessel':
          payload.vesselBooking = vessel;
          break;
        case 'invoiceAmount':
          payload.quotationId = quotationId;
          payload.totalAmount = totalAmount;
          payload.exchangeRate = exchangeRate;
          payload.forwarders = forwarders;
          payload.forwarderConfirmed = forwarders[0]?.name || '';
          payload.forwarderFreightAmount = forwarders[0]?.freightAmount || 0;
          payload.forwarderFreightCurrency = forwarders[0]?.freightCurrency || 'KRW';
          break;
        case 'supplier':
        case 'items':
        case 'supplierAmount':
          payload.items = items;
          payload.forwarders = forwarders;
          // 기존 레거시 필드 동기화 (1번째 포워더로)
          payload.forwarderConfirmed = forwarders[0]?.name || '';
          payload.forwarderFreightAmount = forwarders[0]?.freightAmount || 0;
          payload.forwarderFreightCurrency = forwarders[0]?.freightCurrency || 'KRW';
          break;
        case 'supplierRemitted':
          payload.supplierPayments = supplierPayments;
          break;
        case 'invoiceSent':
          payload.ciPlSentDate = ciPlSentDate;
          break;
        case 'inco':
          payload.incoterms = incoterms;
          break;
        case 'paymentTerms':
          payload.paymentTerms = paymentTerms;
          break;
        case 'exportNo':
          payload.exportDeclarationNo = exportNo;
          payload.customsExchangeRate = customsExchangeRate === '' ? undefined : Number(customsExchangeRate);
          break;
        case 'docsSent':
          payload.shippingDocsSentDate = docsSent;
          break;
        case 'bankSubmitted':
          payload.bankSubmissionDate = bankSubmitted;
          break;
        case 'trackingNo':
          payload.shippingDocsTrackingNo = trackingNo;
          break;
        case 'paymentCollected':
          payload.paymentCollectedDate = paymentCollected;
          break;
        case 'status':
          payload.status = status;
          break;
        case 'remark':
          payload.remark = remark;
          break;
      }

      await onSave(payload);
      onClose();
    } catch (err: any) {
      alert('저장 실패: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleItemChange = (idx: number, field: keyof OrderItem, val: any) => {
    const updated = [...items];
    const item = { ...updated[idx], [field]: val };
    
    if (field === 'qty' || field === 'unitPrice' || field === 'currency') {
      const qty = field === 'qty' ? parseFloat(val) || 0 : parseFloat(item.qty as any) || 0;
      const price = field === 'unitPrice' ? parseFloat(val) || 0 : parseFloat(item.unitPrice as any) || 0;
      const curr = field === 'currency' ? val : item.currency;
      
      if (curr === 'KRW') {
        item.amount = Math.round(qty * price);
      } else {
        item.amount = parseFloat((qty * price).toFixed(2));
      }
    }
    
    updated[idx] = item;
    setItems(updated);
  };

  const addItemRow = () => {
    setItems(prev => [
      ...prev,
      { itemId: (prev.length + 1).toString(), name: '', supplier: '', supplierContact: '', grade: '', qty: 0, unit: 'kg', unitPrice: 0, amount: 0, currency: 'USD' }
    ]);
  };

  const removeItemRow = (idx: number) => {
    if (items.length === 1) return;
    setItems(prev => prev.filter((_, i) => i !== idx).map((it, i) => ({ ...it, itemId: (i + 1).toString() })));
  };

  const renderContent = () => {
    switch (colKey) {
      case 'customer':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>고객사 선택</label>
            <select
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
            >
              <option value="">고객사 직접 입력 또는 선택...</option>
              {customers.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="직접 입력 시 여기에 입력..."
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', marginTop: '4px' }}
            />
          </div>
        );

      case 'issuingCompany':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>매출사 선택</label>
            <div style={{ display: 'flex', gap: '16px', marginTop: '4px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="issuingCompany"
                  checked={issuingCompany === 'YS'}
                  onChange={() => setIssuingCompany('YS')}
                />
                영성ACC (YS)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="issuingCompany"
                  checked={issuingCompany === 'YSACC'}
                  onChange={() => setIssuingCompany('YSACC')}
                />
                YSACC CO.,LTD
              </label>
            </div>
          </div>
        );

      case 'cargoReady':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>화물준비일 (Cargo Ready Date)</label>
              <input
                type="date"
                value={cargoReadyDate}
                onChange={(e) => setCargoReadyDate(e.target.value)}
                style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>컨테이너(CFS)입고일</label>
              <input
                type="date"
                value={cfsEntryDate}
                onChange={(e) => setCfsEntryDate(e.target.value)}
                style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
              />
            </div>
          </div>
        );

      case 'shipmentSchedule':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>서류마감일</label>
              <input
                type="date"
                value={docsDeadlineDate}
                onChange={(e) => setDocsDeadlineDate(e.target.value)}
                style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>ETD (선적 예정일)</label>
              <input
                type="date"
                value={etd}
                onChange={(e) => setEtd(e.target.value)}
                style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>ETA (도착 예정일)</label>
              <input
                type="date"
                value={eta}
                onChange={(e) => setEta(e.target.value)}
                style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
              />
            </div>
          </div>
        );

      case 'volumeVessel':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>VOLUME (수량/컨테이너 볼륨)</label>
              <input
                type="text"
                placeholder="예: 1x20' GP"
                value={volume}
                onChange={(e) => setVolume(e.target.value)}
                style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>선명 / 항차 (Vessel / Voyage)</label>
              <input
                type="text"
                placeholder="예: EVER GIVEN V.0123W"
                value={vessel}
                onChange={(e) => setVessel(e.target.value)}
                style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
              />
            </div>
          </div>
        );

      case 'volume':

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>VOLUME (수량/컨테이너 볼륨)</label>
            <input
              type="text"
              placeholder="예: 1x20' GP"
              value={volume}
              onChange={(e) => setVolume(e.target.value)}
              style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
            />
          </div>
        );

      case 'vessel':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>선명 / 항차 (Vessel / Voyage)</label>
            <input
              type="text"
              placeholder="예: EVER GIVEN V.0123W"
              value={vessel}
              onChange={(e) => setVessel(e.target.value)}
              style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
            />
          </div>
        );

      case 'invoiceAmount':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>연동할 Proforma Invoice 번호 (선택)</label>
              <select
                value={quotationId}
                onChange={(e) => {
                  const val = e.target.value;
                  setQuotationId(val);
                  if (val && piMap[val] !== undefined) {
                    setTotalAmount(piMap[val]);
                  }
                  if (val) {
                    const selectedQuote = quotations.find(q => q.id === val);
                    if (selectedQuote && selectedQuote.freightTotal && selectedQuote.freightTotal > 0) {
                      setForwarders([{
                        name: '포워딩업체-운송비',
                        freightAmount: selectedQuote.freightTotal,
                        freightCurrency: 'USD'
                      }]);
                    } else {
                      setForwarders([]);
                    }
                  } else {
                    setForwarders([]);
                  }
                }}
                style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
              >
                <option value="">수동 금액 지정 (연동 없음)</option>
                {quotations.map(q => (
                  <option key={q.id} value={q.id}>
                    {q.id} ({q.customerName || '고객사 미지정'} - ${piMap[q.id]?.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD)
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>인보이스 금액 ($ USD)</label>
              <input
                type="number"
                step="0.01"
                disabled={!!quotationId}
                value={totalAmount}
                onChange={(e) => setTotalAmount(parseFloat(e.target.value) || 0)}
                style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', backgroundColor: quotationId ? '#f1f5f9' : '#fff' }}
              />
              {quotationId && (
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  ※ PI와 연동 중입니다. PI 금액을 변경하려면 PI 모듈을 편집하시거나 연동을 해제해 주세요.
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>적용 환율 (₩/1$)</label>
              <input
                type="number"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(parseInt(e.target.value, 10) || 1400)}
                style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
              />
            </div>
          </div>
        );

      case 'supplier':
      case 'items':
      case 'supplierAmount':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: '13.5px', fontWeight: 700, color: '#1e293b' }}>
                품목 및 공급사 상세 편집
              </label>
              <button
                type="button"
                onClick={addItemRow}
                style={{ padding: '6px 12px', background: '#e0f2fe', color: '#0369a1', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
              >
                + 품목 추가
              </button>
            </div>
            
            <div style={{ overflowX: 'auto', maxHeight: '350px', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', textAlign: 'left', minWidth: '700px' }}>
                <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    <th style={{ padding: '8px', fontWeight: 600, color: '#475569' }}>품명</th>
                    <th style={{ padding: '8px', fontWeight: 600, color: '#475569', width: '80px' }}>Grade</th>
                    <th style={{ padding: '8px', fontWeight: 600, color: '#475569', width: '80px' }}>수량</th>
                    <th style={{ padding: '8px', fontWeight: 600, color: '#475569', width: '70px' }}>단위</th>
                    <th style={{ padding: '8px', fontWeight: 600, color: '#475569', width: '100px' }}>구입단가</th>
                    <th style={{ padding: '8px', fontWeight: 600, color: '#475569', width: '80px' }}>통화</th>
                    <th style={{ padding: '8px', fontWeight: 600, color: '#475569', width: '120px' }}>구입사(공급처)</th>
                    <th style={{ padding: '8px', fontWeight: 600, color: '#475569', width: '50px', textAlign: 'center' }}>삭제</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '4px' }}>
                        <input
                          type="text"
                          value={it.name || ''}
                          onChange={(e) => handleItemChange(idx, 'name', e.target.value)}
                          style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', boxSizing: 'border-box' }}
                        />
                      </td>
                      <td style={{ padding: '4px' }}>
                        <input
                          type="text"
                          value={it.grade || ''}
                          onChange={(e) => handleItemChange(idx, 'grade', e.target.value)}
                          style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', boxSizing: 'border-box' }}
                        />
                      </td>
                      <td style={{ padding: '4px' }}>
                        <input
                          type="number"
                          value={it.qty || 0}
                          onChange={(e) => handleItemChange(idx, 'qty', parseFloat(e.target.value) || 0)}
                          style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', boxSizing: 'border-box' }}
                        />
                      </td>
                      <td style={{ padding: '4px' }}>
                        <select
                          value={it.unit || 'kg'}
                          onChange={(e) => handleItemChange(idx, 'unit', e.target.value)}
                          style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', boxSizing: 'border-box' }}
                        >
                          <option value="kg">kg</option>
                          <option value="MT">MT</option>
                          <option value="L">L</option>
                          <option value="drum">drum</option>
                          <option value="set">set</option>
                        </select>
                      </td>
                      <td style={{ padding: '4px' }}>
                        <input
                          type="number"
                          step="0.01"
                          value={it.unitPrice || 0}
                          onChange={(e) => handleItemChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                          style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', boxSizing: 'border-box' }}
                        />
                      </td>
                      <td style={{ padding: '4px' }}>
                        <select
                          value={it.currency || 'USD'}
                          onChange={(e) => handleItemChange(idx, 'currency', e.target.value)}
                          style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', boxSizing: 'border-box' }}
                        >
                          <option value="USD">USD ($)</option>
                          <option value="KRW">KRW (₩)</option>
                        </select>
                      </td>
                      <td style={{ padding: '4px' }}>
                        <input
                          type="text"
                          value={it.supplier || ''}
                          onChange={(e) => handleItemChange(idx, 'supplier', e.target.value)}
                          style={{ width: '100%', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px', boxSizing: 'border-box' }}
                          placeholder="공급업체명"
                        />
                      </td>
                      <td style={{ padding: '4px', textAlign: 'center' }}>
                        <button
                          type="button"
                          disabled={items.length === 1}
                          onClick={() => removeItemRow(idx)}
                          style={{ color: '#ef4444', background: 'transparent', border: 'none', fontSize: '14px', cursor: items.length === 1 ? 'not-allowed' : 'pointer' }}
                        >
                          🗑
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'right' }}>
              총 품목 수: {items.length}개
            </div>
            {/* 포워딩회사 & 운송비 입력 영역 */}
            <div style={{ marginTop: '12px', padding: '14px', background: '#f5f3ff', borderRadius: '8px', border: '1px solid #ddd6fe' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '13px', fontWeight: 700, color: '#7c3aed' }}>🚢 포워딩/운송사 & 운송비</label>
                <button
                  onClick={addForwarder}
                  style={{ padding: '5px 12px', fontSize: '12px', fontWeight: 700, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                >
                  + 운송사 추가
                </button>
              </div>
              {/* 헤더 라벨 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 80px 32px', gap: '6px', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>포워딩사/운송사명</span>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>운송비</span>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>통화</span>
                <span></span>
              </div>
              {/* 포워더 행 목록 */}
              {forwarders.length === 0 ? (
                <div style={{ padding: '10px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>운송사를 추가하세요</div>
              ) : (
                forwarders.map((fw, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 80px 32px', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={fw.name}
                      onChange={(e) => updateForwarder(idx, 'name', e.target.value)}
                      placeholder="예: Pantos Logistics"
                      style={{ padding: '8px', border: '1px solid #ddd6fe', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }}
                    />
                    <input
                      type="number"
                      step="1"
                      value={fw.freightAmount}
                      onChange={(e) => updateForwarder(idx, 'freightAmount', parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      style={{ padding: '8px', border: '1px solid #ddd6fe', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }}
                    />
                    <select
                      value={fw.freightCurrency}
                      onChange={(e) => updateForwarder(idx, 'freightCurrency', e.target.value)}
                      style={{ padding: '8px', border: '1px solid #ddd6fe', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }}
                    >
                      <option value="KRW">KRW (₩)</option>
                      <option value="USD">USD ($)</option>
                    </select>
                    <button
                      onClick={() => removeForwarder(idx)}
                      style={{ padding: '8px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
                    >✕</button>
                  </div>
                ))
              )}
            </div>
          </div>
        );

      case 'supplierRemitted':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label style={{ fontSize: '13.5px', fontWeight: 700, color: '#1e293b' }}>공급업체별 결제일 지정</label>
            {suppliers.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#94a3b8' }}>
                ※ 품목에 등록된 구입사(공급처)가 없습니다. 먼저 품목에서 공급업체를 입력해 주세요.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {suppliers.map(sup => {
                  const pay = supplierPayments[sup] || { status: '미결제', date: '' };
                  return (
                    <div key={sup} style={{ padding: '12px', border: '1px solid #e2e8f0', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ fontWeight: 600, color: '#334155', fontSize: '13px' }}>🏢 {sup}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '11px', color: '#64748b' }}>결제상태</label>
                          <select
                            value={pay.status}
                            onChange={(e) => setSupplierPayments(prev => ({
                              ...prev,
                              [sup]: { ...prev[sup], status: e.target.value }
                            }))}
                            style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12.5px' }}
                          >
                            <option value="미결제">미결제</option>
                            <option value="결제완료">결제완료</option>
                          </select>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '11px', color: '#64748b' }}>결제일자</label>
                          <input
                            type="date"
                            value={pay.date || ''}
                            onChange={(e) => setSupplierPayments(prev => ({
                              ...prev,
                              [sup]: { ...prev[sup], date: e.target.value }
                            }))}
                            style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12.5px' }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );

      case 'invoiceSent':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>인보이스 송부일 (CI/PL Sent Date)</label>
            <input
              type="date"
              value={ciPlSentDate}
              onChange={(e) => setCiPlSentDate(e.target.value)}
              style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
            />
          </div>
        );

      case 'inco':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>INCO 조건</label>
            <select
              value={incoterms}
              onChange={(e) => setIncoterms(e.target.value as any)}
              style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
            >
              <option value="">조건 선택...</option>
              <option value="FOB">FOB</option>
              <option value="CIF HCM">CIF HCM</option>
              <option value="EXW">EXW</option>
              <option value="CFR">CFR</option>
              <option value="DAP">DAP</option>
              <option value="DDP">DDP</option>
            </select>
          </div>
        );

      case 'paymentTerms':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>결제 방식 (LC/TT, Payment Terms)</label>
            <input
              type="text"
              placeholder="예: L/C 90 days, T/T 30% advance"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
            />
          </div>
        );

      case 'exportNo':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>수출신고번호</label>
              <input
                type="text"
                placeholder="예: 010-12-345678U"
                value={exportNo}
                onChange={(e) => setExportNo(e.target.value)}
                style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>면장상 환율 (₩/1$)</label>
              <input
                type="number"
                placeholder="예: 1400"
                value={customsExchangeRate}
                onChange={(e) => setCustomsExchangeRate(e.target.value === '' ? '' : Number(e.target.value))}
                style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
              />
            </div>
          </div>
        );

      case 'docsSent':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>선적서류 송부일 (Shipping Docs Sent)</label>
            <input
              type="date"
              value={docsSent}
              onChange={(e) => setDocsSent(e.target.value)}
              style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
            />
          </div>
        );

      case 'bankSubmitted':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>은행 제출일 (Bank Submission Date)</label>
            <input
              type="date"
              value={bankSubmitted}
              onChange={(e) => setBankSubmitted(e.target.value)}
              style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
            />
          </div>
        );

      case 'trackingNo':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>선적서류 TRACKING NO (DHL/FedEx 등)</label>
            <input
              type="text"
              placeholder="예: DHL 1234567890"
              value={trackingNo}
              onChange={(e) => setTrackingNo(e.target.value)}
              style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
            />
          </div>
        );

      case 'paymentCollected':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>대금 영수일 (Payment Collected Date)</label>
            <input
              type="date"
              value={paymentCollected}
              onChange={(e) => setPaymentCollected(e.target.value)}
              style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
            />
          </div>
        );

      case 'status':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>진행 상태</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
            >
              <option value="주문">주문</option>
              <option value="발주">발주</option>
              <option value="선적관리">선적관리</option>
              <option value="이익관리">이익관리</option>
            </select>
          </div>
        );

      case 'remark':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>비고 (Remark)</label>
            <textarea
              placeholder="특이사항 입력..."
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              rows={4}
              style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', fontFamily: 'inherit', resize: 'vertical' }}
            />
          </div>
        );

      default:
        return <div>정의되지 않은 셀 영역입니다.</div>;
    }
  };

  const isWide = ['supplier', 'items', 'supplierAmount'].includes(colKey);

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: isWide ? '800px' : '450px', maxWidth: '95%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
          <div>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Quick Cell Edit (PO: {order.id})
            </span>
            <h3 style={{ margin: '2px 0 0 0', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
              구분 항목 편집
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}
          >
            ✕
          </button>
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, minHeight: '80px' }}>
          {renderContent()}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
          <button
            onClick={onClose}
            disabled={isSaving}
            style={{ padding: '9px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            style={{ padding: '9px 16px', background: '#2563eb', border: 'none', color: '#fff', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {isSaving ? '저장 중...' : '저장 완료'}
          </button>
        </div>

      </div>
    </div>
  );
};
