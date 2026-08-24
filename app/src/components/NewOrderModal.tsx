import React, { useState, useEffect, useRef } from 'react';
import { subscribeCustomCurrencies, handleCurrencySelection, DEFAULT_CURRENCIES } from '../utils/currency';
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

import { DateInput } from './ui/DateInput';

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
  initialOrder?: Order;
  isCopy?: boolean;
}

export const NewOrderModal: React.FC<Props> = ({ onClose, onSaveSuccess, currentUser, initialQuotationId, initialOrder, isCopy }) => {
  const [customCurrencies, setCustomCurrencies] = useState<string[]>([]);
  useEffect(() => {
    return subscribeCustomCurrencies(setCustomCurrencies);
  }, []);
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
    type: 'trade' as 'trade' | 'consulting',
    poId: '', // Auto-generated e.g., PO-YYYY-NNNN
    custPo: '',
    quotationId: initialQuotationId || '',
    customerId: '',
    customerName: '',
    customerAddress: '',
    contactPerson: '',
    manager: currentUser,
    incoterms: 'FOB' as any,
    paymentTerms: '',
    poDate: new Date().toISOString().split('T')[0],
    requestedDelivery: '',
    remark: '',
    status: '주문' as any,
    exchangeRate: 1400,
    issuingCompany: 'YSACC' as 'YSACC' | 'YS' | '영성ACC',
    // PI-derived shipping fields
    departurePort: '',
    destinationPort: '',
    packagingSpec: '',
    shippingMethod: '',
    deliveryTerm: '',
    origin: '',
    yourRef: '',
    piDate: '',
    validUntilDate: ''
  });

  const [items, setItems] = useState<Partial<OrderItem>[]>([
    { itemId: '1', name: '', supplier: '', supplierContact: '', grade: '', qty: 0, unit: 'kg', unitPrice: 0, amount: 0, currency: 'USD' }
  ]);

  const [forwarders, setForwarders] = useState<ForwarderEntry[]>([]);
  const [editingFwAmount, setEditingFwAmount] = useState<{ idx: number; value: string } | null>(null);

  // Load Customers, Quotations & Products
  useEffect(() => {
    const loadSelectionData = async () => {
      try {
        const custSnap = await getDocs(collection(doc(db, 'companies', COMPANY_ID), 'customers'));
        setCustomers(custSnap.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));

        const quoteSnap = await getDocs(collection(doc(db, 'companies', COMPANY_ID), 'proforma_invoices'));
        setQuotations(quoteSnap.docs.map(d => ({ id: d.id, ...d.data() } as ProformaInvoice)));

        const prodSnap = await getDocs(collection(doc(db, 'companies', COMPANY_ID), 'products'));
        setProducts(prodSnap.docs.map(d => ({ ...d.data(), id: d.id } as Product)));
      } catch (err) {
        console.error("Failed to load initial selection data:", err);
      }
    };
    loadSelectionData();
  }, []);

  // Pre-load from initialQuotationId if passed — direct setFormData to avoid stale closure
  useEffect(() => {
    if (initialQuotationId && quotations.length > 0) {
      const selectedQuote = quotations.find(q => q.id === initialQuotationId);
      if (selectedQuote) {
        const selectedCust = customers.find(c => c.id === selectedQuote.customerId);
        setFormData(prev => ({
          ...prev,
          quotationId: initialQuotationId,
          customerId: selectedQuote.customerId || '',
          customerName: selectedQuote.customerName || (selectedCust ? selectedCust.name : ''),
          customerAddress: selectedQuote.customerAddress || '',
          contactPerson: selectedQuote.contactPerson || '',
          incoterms: (selectedQuote.incoterms as any) || prev.incoterms,
          paymentTerms: selectedQuote.paymentTerms || prev.paymentTerms,
          exchangeRate: selectedQuote.exchangeRate || prev.exchangeRate,
          issuingCompany: selectedQuote.issuingCompany || prev.issuingCompany,
          departurePort: selectedQuote.departurePort || '',
          destinationPort: selectedQuote.destinationPort || '',
          packagingSpec: selectedQuote.packagingSpec || '',
          shippingMethod: selectedQuote.shippingMethod || '',
          deliveryTerm: selectedQuote.deliveryTerm || '',
          origin: selectedQuote.origin || '',
          yourRef: selectedQuote.yourRef || '',
          piDate: selectedQuote.piDate || '',
          validUntilDate: selectedQuote.validUntilDate || '',
          remark: prev.remark || selectedQuote.remarks || '',
        }));
        fetchQuoteItems(initialQuotationId);
        if (selectedQuote.freightCharges && selectedQuote.freightCharges.length > 0) {
          setForwarders(selectedQuote.freightCharges.map(fc => ({
            name: fc.type || fc.name || 'FOB CHARGES',
            amountUsd: fc.amount || ((fc.qty || 1) * (fc.price || 0)),
            budgetAmountUsd: fc.amount || ((fc.qty || 1) * (fc.price || 0))
          })));
        } else if (selectedQuote.freightTotal && selectedQuote.freightTotal > 0) {
          setForwarders([{ name: '포워딩업체-운송비', amountUsd: selectedQuote.freightTotal, budgetAmountUsd: selectedQuote.freightTotal }]);
        }
      }
    }
  }, [initialQuotationId, quotations]);

  // Pre-load from initialOrder if passed (PO 복사 및 수정)
  useEffect(() => {
    if (initialOrder) {
      setFormData(prev => ({
        ...prev,
        type: (initialOrder as any).type || 'trade',
        poId: isCopy ? '' : (initialOrder.ciNumber || initialOrder.id || ''),
        custPo: initialOrder.custPo || '',
        quotationId: initialOrder.quotationId || '',
        customerId: (initialOrder as any).customerId || '',
        customerName: initialOrder.customer || (initialOrder as any).customerName || '',
        customerAddress: (initialOrder as any).customerAddress || '',
        contactPerson: (initialOrder as any).contactPerson || '',
        manager: currentUser || initialOrder.manager || '',
        incoterms: (initialOrder.incoterms as any) || prev.incoterms,
        paymentTerms: initialOrder.paymentTerms || prev.paymentTerms,
        poDate: isCopy ? new Date().toISOString().split('T')[0] : (initialOrder.poDate || new Date().toISOString().split('T')[0]),
        requestedDelivery: initialOrder.requestedDelivery || '',
        remark: initialOrder.remark || '',
        status: isCopy ? '주문' : (initialOrder.status || '주문'),
        exchangeRate: initialOrder.exchangeRate || prev.exchangeRate,
        issuingCompany: initialOrder.issuingCompany || prev.issuingCompany,
        departurePort: (initialOrder as any).departurePort || '',
        destinationPort: (initialOrder as any).destinationPort || '',
        packagingSpec: (initialOrder as any).packagingSpec || '',
        shippingMethod: (initialOrder as any).shippingMethod || '',
        deliveryTerm: (initialOrder as any).deliveryTerm || '',
        origin: (initialOrder as any).origin || '',
        yourRef: (initialOrder as any).yourRef || '',
        piDate: (initialOrder as any).piDate || '',
        validUntilDate: (initialOrder as any).validUntilDate || ''
      }));

      if (Array.isArray(initialOrder.items) && initialOrder.items.length > 0) {
        setItems(initialOrder.items.map((it, idx) => ({
          ...it,
          itemId: (idx + 1).toString()
        })));
      }

      if (Array.isArray(initialOrder.forwarders) && initialOrder.forwarders.length > 0) {
        setForwarders(initialOrder.forwarders);
      }
    }
  }, [initialOrder, isCopy, currentUser]);

  // Auto-generate PO Number has been removed. ID is inputted manually as Confirmed CI Number.

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
          updated.customerAddress = selectedQuote.customerAddress || '';
          updated.contactPerson = selectedQuote.contactPerson || '';
          updated.incoterms = selectedQuote.incoterms as any || prev.incoterms;
          updated.paymentTerms = selectedQuote.paymentTerms || prev.paymentTerms;
          updated.exchangeRate = selectedQuote.exchangeRate || prev.exchangeRate;
          updated.issuingCompany = selectedQuote.issuingCompany || prev.issuingCompany;
          // Additional PI shipping info
          updated.departurePort = selectedQuote.departurePort || '';
          updated.destinationPort = selectedQuote.destinationPort || '';
          updated.packagingSpec = selectedQuote.packagingSpec || '';
          updated.shippingMethod = selectedQuote.shippingMethod || '';
          updated.deliveryTerm = selectedQuote.deliveryTerm || '';
          updated.origin = selectedQuote.origin || '';
          updated.yourRef = selectedQuote.yourRef || '';
          updated.piDate = selectedQuote.piDate || '';
          updated.validUntilDate = selectedQuote.validUntilDate || '';
          updated.remark = prev.remark || selectedQuote.remarks || '';
        }
      }
      return updated;
    });

    if (field === 'quotationId' && value) {
      fetchQuoteItems(value);

      const selectedQuote = quotations.find(q => q.id === value);
      if (selectedQuote && selectedQuote.freightCharges && selectedQuote.freightCharges.length > 0) {
        setForwarders(selectedQuote.freightCharges.map(fc => ({
          name: fc.type || fc.name || 'FOB CHARGES',
          amountUsd: fc.amount || ((fc.qty || 1) * (fc.price || 0)),
          budgetAmountUsd: fc.amount || ((fc.qty || 1) * (fc.price || 0))
        })));
      } else if (selectedQuote && selectedQuote.freightTotal && selectedQuote.freightTotal > 0) {
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
          // Also pull shipping metadata from latest revision to fill any revision-level fields
          const latestRevData = latestRev as any;
          setFormData(prev => ({
            ...prev,
            type: latestRevData.type || 'trade',
            deliveryTerm: prev.deliveryTerm || latestRevData.deliveryTerm || '',
            origin: prev.origin || latestRevData.origin || '',
            yourRef: prev.yourRef || latestRevData.yourRef || '',
            packagingSpec: prev.packagingSpec || latestRevData.packagingSpec || '',
            shippingMethod: prev.shippingMethod || latestRevData.shippingMethod || '',
            destinationPort: prev.destinationPort || latestRevData.destinationPort || '',
            incoterms: prev.incoterms || latestRevData.incoterms || 'FOB',
            paymentTerms: prev.paymentTerms || latestRevData.paymentTerms || '',
            customerAddress: prev.customerAddress || latestRevData.customerAddress || '',
          }));

          const liSnap = await getDocs(collection(latestRevDoc.ref, 'line_items'));
          const quoteItems = liSnap.docs
            .map(d => d.data() as any)
            .sort((a, b) => (Number(a.lineNumber) || 0) - (Number(b.lineNumber) || 0));
          
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
                grade: qi.spec || qi.grade || matchedProd?.spec || '',
                qty,
                unit: qi.unit || 'kg',
                unitPrice: orderPrice,
                purchaseUnitPrice: purchasePrice,
                purchaseUnitCurrency: purchaseCurrency,
                originalPurchasePrice: purchasePrice,
                originalPurchaseCurrency: purchaseCurrency,
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

  const draggedItemIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleItemNoChange = (index: number, val: string) => {
    setItems(prev => {
      const list = [...prev];
      list[index] = { ...list[index], itemId: val };
      return list;
    });
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    draggedItemIndexRef.current = index;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    const sourceIndex = draggedItemIndexRef.current;
    if (sourceIndex === null || sourceIndex === targetIndex) return;

    setItems(prev => {
      const newItems = [...prev];
      const [movedItem] = newItems.splice(sourceIndex, 1);
      newItems.splice(targetIndex, 0, movedItem);
      return newItems.map((it, idx) => ({ ...it, itemId: (idx + 1).toString() }));
    });
    draggedItemIndexRef.current = null;
  };

  const copyItemRow = (index: number) => {
    const target = items[index];
    if (!target) return;
    const newItem = { ...target };
    setItems(prev => {
      const newItems = [...prev];
      newItems.splice(index + 1, 0, newItem);
      return newItems.map((it, idx) => ({ ...it, itemId: (idx + 1).toString() }));
    });
  };

  const removeItemRow = (index: number) => {
    if (items.length === 1) return;
    setItems(prev => prev.filter((_, idx) => idx !== index).map((it, idx) => ({ ...it, itemId: (idx + 1).toString() })));
  };

  const totalAmount = items.reduce((sum, item) => sum + (item.amount || 0), 0)
    + forwarders.reduce((sum, fw) => sum + (fw.amountUsd || 0), 0);

  const handleSave = async () => {
    if (!formData.poId.trim()) { alert('확정 CI 번호는 필수 항목입니다.'); return; }
    if (!formData.customerId) { alert('고객사를 선택해야 합니다.'); return; }
    if (items.some(item => !item.name?.trim())) { alert('모든 품목의 품명을 입력해야 합니다.'); return; }

    setIsSaving(true);
    try {
      const orderRef = doc(collection(db, 'companies', COMPANY_ID, 'orders'));
      
      const hasUsd = items.some(it => it.currency === 'USD');
      const hasKrw = items.some(it => it.currency === 'KRW');
      let orderCurrency: 'USD' | 'KRW' | 'mixed' = 'USD';
      if (hasUsd && hasKrw) {
        orderCurrency = 'mixed';
      } else if (hasKrw) {
        orderCurrency = 'KRW';
      }
      
      const orderPayload: Order = {
        id: orderRef.id,
        ciNumber: formData.poId,
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
          originalPurchasePrice: parseFloat(it.originalPurchasePrice as any) || 0,
          originalPurchaseCurrency: (it.originalPurchaseCurrency || 'USD') as any,
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
        
        // fields copied from selected PI
        piNumber: formData.quotationId || '',
        customerAddress: formData.customerAddress || '',
        contactPerson: formData.contactPerson || '',
        portOfLoading: formData.departurePort || '',
        portOfDischarge: formData.destinationPort || '',
        destinationCountry: '',
        packagingSpec: formData.packagingSpec || '',
        shippingMethod: formData.shippingMethod || '',
        deliveryTerm: formData.deliveryTerm || '',
        origin: formData.origin || '',
        yourRef: formData.yourRef || '',
        piDate: formData.piDate || '',
        validUntilDate: formData.validUntilDate || ''
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

  const [position, setPosition] = useState({ x: 80, y: 60 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    const nextX = Math.max(10, Math.min(window.innerWidth - 300, e.clientX - dragStartRef.current.x));
    const nextY = Math.max(10, Math.min(window.innerHeight - 150, e.clientY - dragStartRef.current.y));
    setPosition({ x: nextX, y: nextY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <>
      <div style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: '95%',
        maxWidth: '1150px',
        zIndex: 1000,
        userSelect: isDragging ? 'none' : 'auto'
      }}>
        <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(15,23,42,0.3)', border: '2px solid var(--border-default)' }}>
          
          {/* Header */}
          <div 
            onMouseDown={handleMouseDown}
            style={{ padding: '12px 18px', borderBottom: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff', borderRadius: '12px 12px 0 0', cursor: 'move', userSelect: 'none' }}>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>
                {isCopy ? '📋 PO 복사 등록 (신규 작성)' : (initialOrder ? '✏️ PO 정보 수정' : '➕ 신규 PO(발주서) 등록')}
              </div>
              <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                {isCopy ? '기존 PO의 고객사 및 품목 정보 기반으로 신규 PO를 빠르게 복사 등록합니다.' : '고객사로부터 수신한 PO 정보를 등록하고 발주를 진행합니다.'}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = '#475569'} onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}>✕</button>
          </div>

        {/* Body */}
        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          {/* Form Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>확정 CI 번호 <span style={{ color: '#ef4444' }}>*</span></label>
              <input type="text" value={formData.poId} onChange={e => handleFormDataChange('poId', e.target.value)} placeholder="예: YS(SU)-26-04" style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', outline: 'none', background: '#fff', color: '#1e293b', boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>발행사 <span style={{ color: '#ef4444' }}>*</span></label>
              <select value={formData.issuingCompany} onChange={e => handleFormDataChange('issuingCompany', e.target.value)} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', outline: 'none', background: '#fff', color: '#1e293b', boxSizing: 'border-box', cursor: 'pointer' }}>
                <option value="YSACC">YSACC</option>
                <option value="YS">영성ACC</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>고객사 PO 번호</label>
              <input type="text" value={formData.custPo} onChange={e => handleFormDataChange('custPo', e.target.value)} placeholder="예: PO-12345" style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', outline: 'none', background: '#fff', color: '#1e293b', boxSizing: 'border-box' }} />
            </div>

            {/* 연결할 견적서 (PI) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>연결할 견적서(PI)</label>
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
                    padding: '6px 42px 6px 10px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    fontSize: '13px',
                    height: '34px',
                    outline: 'none',
                    cursor: 'pointer',
                    background: '#fff',
                    color: '#1e293b',
                    boxSizing: 'border-box'
                  }} 
                />
                {formData.quotationId && (
                  <button
                    type="button"
                    onClick={() => handleFormDataChange('quotationId', '')}
                    style={{
                      position: 'absolute',
                      right: '28px',
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      fontSize: '12px',
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
                    right: '8px',
                    background: 'transparent',
                    border: 'none',
                    color: '#3b82f6',
                    cursor: 'pointer',
                    fontSize: '14px',
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>고객사 선택 <span style={{ color: '#ef4444' }}>*</span></label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input 
                  type="text" 
                  value={formData.customerName || ''} 
                  placeholder="고객사 검색/선택"
                  readOnly
                  onClick={() => setIsCustomerSearchOpen(true)}
                  style={{
                    width: '100%',
                    padding: '6px 42px 6px 10px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    fontSize: '13px',
                    height: '34px',
                    outline: 'none',
                    cursor: 'pointer',
                    background: '#fff',
                    color: '#1e293b',
                    boxSizing: 'border-box'
                  }} 
                />
                {formData.customerId && (
                  <button
                    type="button"
                    onClick={() => handleFormDataChange('customerId', '')}
                    style={{
                      position: 'absolute',
                      right: '28px',
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      fontSize: '12px',
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
                    right: '8px',
                    background: 'transparent',
                    border: 'none',
                    color: '#3b82f6',
                    cursor: 'pointer',
                    fontSize: '14px',
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

            {formData.type !== 'consulting' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>인코텀즈 <span style={{ color: '#ef4444' }}>*</span></label>
              <select value={formData.incoterms} onChange={e => handleFormDataChange('incoterms', e.target.value)} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', outline: 'none', background: '#fff', color: '#1e293b', boxSizing: 'border-box', cursor: 'pointer' }}>
                <option value="FOB">FOB</option>
                <option value="CIF">CIF</option>
                <option value="EXW">EXW</option>
                <option value="CFR">CFR</option>
                <option value="DAP">DAP</option>
                <option value="DDP">DDP</option>
              </select>
            </div>
          )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>결제 조건 (Payment Terms)</label>
              <input type="text" value={formData.paymentTerms} onChange={e => handleFormDataChange('paymentTerms', e.target.value)} placeholder="예: 30 days after BL" style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', outline: 'none', background: '#fff', color: '#1e293b', boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>PO 접수일 <span style={{ color: '#ef4444' }}>*</span></label>
              <DateInput value={formData.poDate} onChange={e => handleFormDataChange('poDate', e.target.value)} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', outline: 'none', background: '#fff', color: '#1e293b', boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>요청 납기일</label>
              <DateInput value={formData.requestedDelivery} onChange={e => handleFormDataChange('requestedDelivery', e.target.value)} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', outline: 'none', background: '#fff', color: '#1e293b', boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', gridColumn: 'span 2' }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>비고 (Remarks)</label>
              <textarea 
                value={formData.remark} 
                onChange={e => handleFormDataChange('remark', e.target.value)} 
                placeholder="특이사항 입력" 
                style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '48px', resize: 'vertical', fontFamily: 'inherit', outline: 'none', background: '#fff', color: '#1e293b', boxSizing: 'border-box' }} 
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>담당 영업 사원</label>
              <input type="text" value={formData.manager} onChange={e => handleFormDataChange('manager', e.target.value)} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', outline: 'none', background: '#fff', color: '#1e293b', boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>상태</label>
              <input type="text" value={formData.status} disabled style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', background: '#f1f5f9', color: '#64748b', boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* PI-derived shipping/shipping info — always visible, editable */}
          <div style={{ 
            background: '#f8fafc', 
            border: '1px solid #e2e8f0', 
            borderRadius: '8px', 
            padding: '12px 16px' 
          }}>
            <div style={{ fontSize: '12.5px', fontWeight: 750, color: '#334155', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>📋</span>
              <span>{formData.quotationId ? '견적서(PI) 연결 정보 및 선적 기본 정보 (자동 입력)' : '견적서(PI) 및 선적 기본 정보 (수동 입력 가능)'}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>출발항 (Port of Loading)</label>
                <input type="text" value={formData.departurePort} onChange={e => handleFormDataChange('departurePort', e.target.value)} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', outline: 'none', background: '#fff', color: '#1e293b', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>도착항 (Destination Port)</label>
                <input type="text" value={formData.destinationPort} onChange={e => handleFormDataChange('destinationPort', e.target.value)} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', outline: 'none', background: '#fff', color: '#1e293b', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>운송방법 (Shipping)</label>
                <input type="text" value={formData.shippingMethod} onChange={e => handleFormDataChange('shippingMethod', e.target.value)} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', outline: 'none', background: '#fff', color: '#1e293b', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>포장 사양 (Packing Spec.)</label>
                <input type="text" value={formData.packagingSpec} onChange={e => handleFormDataChange('packagingSpec', e.target.value)} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', outline: 'none', background: '#fff', color: '#1e293b', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', gridColumn: 'span 2' }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>납기 조건 (Delivery Term)</label>
                <input type="text" value={formData.deliveryTerm} onChange={e => handleFormDataChange('deliveryTerm', e.target.value)} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', outline: 'none', background: '#fff', color: '#1e293b', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>원산지 (Origin)</label>
                <input type="text" value={formData.origin} onChange={e => handleFormDataChange('origin', e.target.value)} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', outline: 'none', background: '#fff', color: '#1e293b', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>PI 담당자 (Contact)</label>
                <input type="text" value={formData.contactPerson} onChange={e => handleFormDataChange('contactPerson', e.target.value)} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', outline: 'none', background: '#fff', color: '#1e293b', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>Your Ref (고객 PO Ref)</label>
                <input type="text" value={formData.yourRef} onChange={e => handleFormDataChange('yourRef', e.target.value)} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', outline: 'none', background: '#fff', color: '#1e293b', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>PI 발행일</label>
                <DateInput value={formData.piDate} onChange={e => handleFormDataChange('piDate', e.target.value)} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', outline: 'none', background: '#fff', color: '#1e293b', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>PI 유효기한</label>
                <DateInput value={formData.validUntilDate} onChange={e => handleFormDataChange('validUntilDate', e.target.value)} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', outline: 'none', background: '#fff', color: '#1e293b', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', gridColumn: 'span 2' }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>고객사 주소 (Customer Address)</label>
                <input type="text" value={formData.customerAddress} onChange={e => handleFormDataChange('customerAddress', e.target.value)} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', outline: 'none', background: '#fff', color: '#1e293b', boxSizing: 'border-box' }} />
              </div>
            </div>
          </div>

          {/* Items Section */}
          <div style={{ marginTop: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 750, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>📦</span>
                <span>발주 품목 목록</span>
              </span>
              <button type="button" onClick={addItemRow} style={{ padding: '5px 12px', borderRadius: '4px', border: '1px solid #3b82f6', background: '#fff', color: '#3b82f6', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.background = '#eff6ff'; }} onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>+ 품목 행 추가</button>
            </div>
            
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#1e3a8a', color: '#ffffff' }}>
                  <th style={{ padding: '10px 4px', textAlign: 'center', width: '55px', fontWeight: 700, borderTopLeftRadius: '4px', borderBottomLeftRadius: '4px' }}>No.</th>
                  <th style={{ padding: '10px 6px', textAlign: 'left', width: '220px', fontWeight: 700 }}>{formData.type === 'consulting' ? '수행 용역/컨설팅 항목' : '상품코드'}</th>
                  <th style={{ padding: '10px 6px', textAlign: 'left', width: '150px', fontWeight: 700 }}>스펙 (Spec)</th>
                  <th style={{ padding: '10px 6px', textAlign: 'left', width: '130px', fontWeight: 700 }}>공급사</th>
                  <th style={{ padding: '10px 6px', textAlign: 'center', width: '110px', fontWeight: 700 }}>수량 / 단위</th>
                  <th style={{ padding: '10px 6px', textAlign: 'center', width: '130px', fontWeight: 700 }}>매출 통화 / 단가</th>
                  <th style={{ padding: '10px 6px', textAlign: 'center', width: '130px', fontWeight: 700 }}>매입 통화 / 단가</th>
                  <th style={{ padding: '10px 6px', textAlign: 'right', width: '110px', fontWeight: 700 }}>금액</th>
                  <th style={{ padding: '10px 6px', textAlign: 'center', width: '62px', fontWeight: 700, borderTopRightRadius: '4px', borderBottomRightRadius: '4px' }}>관리</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const isDragOver = dragOverIndex === idx;
                  return (
                  <tr 
                    key={`po-item-${item.itemId || (idx + 1)}-${item.name || idx}`}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, idx)}
                    style={{ 
                      borderBottom: isDragOver ? '2px solid #2563eb' : '1px solid #e2e8f0',
                      backgroundColor: isDragOver ? '#dbeafe' : 'transparent'
                    }}
                  >
                    <td style={{ padding: '4px', textAlign: 'center', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                        <span 
                          draggable={true}
                          onDragStart={(e) => handleDragStart(e, idx)}
                          onDragEnd={() => { draggedItemIndexRef.current = null; setDragOverIndex(null); }}
                          style={{ cursor: 'grab', fontSize: '13px', color: '#94a3b8', userSelect: 'none', padding: '0 2px' }} 
                          title="드래그하여 순서 변경"
                        >
                          ⋮⋮
                        </span>
                        <input
                          type="text"
                          value={item.itemId || (idx + 1).toString()}
                          onChange={e => handleItemNoChange(idx, e.target.value)}
                          style={{
                            width: '32px',
                            textAlign: 'center',
                            padding: '2px',
                            fontWeight: 700,
                            color: '#1e293b',
                            border: '1px solid #cbd5e1',
                            borderRadius: '4px',
                            fontSize: '12px'
                          }}
                          title="순번 수동 입력"
                        />
                      </div>
                    </td>
                    
                    {/* 상품코드 */}
                    <td style={{ padding: '6px 6px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <input
                              type="text"
                              list={`po_products_datalist_${idx}`}
                              value={item.name || ''}
                              onChange={e => handleItemChange(idx, 'name', e.target.value)}
                              placeholder={formData.type === 'consulting' ? '수행 용역명 입력' : '상품코드 검색/입력'}
                              style={{ width: '100%', padding: '0 40px 0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box', height: '28px', outline: 'none' }}
                            />
                            {item.name && (
                              <button
                                type="button"
                                onClick={() => handleItemChange(idx, 'name', '')}
                                style={{
                                  position: 'absolute',
                                  right: '22px',
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
                              onClick={() => {
                                setSearchItemIndex(idx);
                                setIsProductSearchOpen(true);
                              }}
                              style={{
                                position: 'absolute',
                                right: '6px',
                                background: 'transparent',
                                border: 'none',
                                color: '#3b82f6',
                                cursor: 'pointer',
                                fontSize: '13px',
                                padding: '2px',
                                zIndex: 5,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                              title="상품 검색"
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
                                  border: p ? '1px solid #cbd5e1' : '1px solid #cbd5e1',
                                  color: p ? '#a16207' : '#94a3b8',
                                  borderRadius: '4px',
                                  padding: '2px 4px',
                                  cursor: p ? 'pointer' : 'not-allowed',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  height: '28px',
                                  width: '28px',
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

                    {/* 스펙 (Spec) */}
                    <td style={{ padding: '6px 6px' }}>
                      <textarea
                        value={item.grade || ''}
                        onChange={e => handleItemChange(idx, 'grade', e.target.value)}
                        placeholder="스펙 (Spec)"
                        rows={1}
                        style={{ width: '100%', padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box', minHeight: '28px', outline: 'none', resize: 'both', minWidth: '80px', fontFamily: 'inherit', overflow: 'auto' }}
                      />
                    </td>

                    {/* 공급사 */}
                    <td style={{ padding: '6px 6px', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input
                           type="text"
                           value={item.supplier || ''}
                           onChange={e => handleItemChange(idx, 'supplier', e.target.value)}
                           placeholder="공급사명"
                           style={{ flex: 1, padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box', height: '28px', outline: 'none' }}
                        />
                        {(() => {
                          const rawCode = getRawProductCode(item.name);
                          const p = products.find(prod => prod.productCode === rawCode || prod.id === rawCode);
                          if (p && p.supplierName) {
                            return (
                              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: '80px' }} title={p.supplierName}>
                                {p.supplierName.replace(/\(주\)/g, '').replace(/주식회사/g, '').trim()}
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </td>

                    {/* 수량 / 단위 */}
                    <td style={{ padding: '6px 6px' }}>
                      <div style={{ display: 'flex', flexDirection: 'row', gap: '3px', alignItems: 'center' }}>
                        <input
                          type="number"
                          value={item.qty || ''}
                          onChange={e => handleItemChange(idx, 'qty', e.target.value)}
                          placeholder="수량"
                          style={{ width: '65px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', textAlign: 'right', boxSizing: 'border-box', height: '28px', outline: 'none' }}
                        />
                        <input
                          type="text"
                          value={item.unit || ''}
                          onChange={e => handleItemChange(idx, 'unit', e.target.value)}
                          placeholder="단위"
                          style={{ width: '55px', padding: '0 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box', height: '28px', outline: 'none', textAlign: 'center' }}
                        />
                      </div>
                    </td>

                    {/* 매출 통화 / 단가 */}
                    <td style={{ padding: '6px 6px' }}>
                      <div style={{ display: 'flex', flexDirection: 'row', gap: '3px', alignItems: 'center' }}>
                        <select
                          value={item.currency || 'USD'}
                          onChange={e => handleCurrencySelection(e.target.value, item.currency || 'USD', customCurrencies, val => handleItemChange(idx, 'currency', val))}
                          style={{ width: '70px', padding: '0 4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box', height: '28px', outline: 'none', cursor: 'pointer' }}
                        >
                          {[...DEFAULT_CURRENCIES, ...customCurrencies].map(c => <option key={c} value={c}>{c}</option>)}
                          <option value="ADD_NEW_CURRENCY" style={{ color: '#2563eb', fontWeight: 'bold' }}>+</option>
                        </select>
                        <input
                          type="number"
                          step={item.currency === 'KRW' ? '1' : '0.01'}
                          value={item.unitPrice || ''}
                          onChange={e => handleItemChange(idx, 'unitPrice', e.target.value)}
                          placeholder="매출 단가"
                          style={{ width: '75px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', textAlign: 'right', boxSizing: 'border-box', height: '28px', outline: 'none' }}
                        />
                      </div>
                    </td>

                    {/* 매입 통화 / 단가 */}
                    <td style={{ padding: '6px 6px' }}>
                      <div style={{ display: 'flex', flexDirection: 'row', gap: '3px', alignItems: 'center' }}>
                        <select
                          value={item.purchaseUnitCurrency || 'USD'}
                          onChange={e => handleCurrencySelection(e.target.value, item.purchaseUnitCurrency || 'USD', customCurrencies, val => handleItemChange(idx, 'purchaseUnitCurrency', val))}
                          style={{ width: '70px', padding: '0 4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', boxSizing: 'border-box', height: '28px', outline: 'none', cursor: 'pointer' }}
                        >
                          {[...DEFAULT_CURRENCIES, ...customCurrencies].map(c => <option key={c} value={c}>{c}</option>)}
                          <option value="ADD_NEW_CURRENCY" style={{ color: '#2563eb', fontWeight: 'bold' }}>+</option>
                        </select>
                        <input
                          type="number"
                          step={item.purchaseUnitCurrency === 'KRW' ? '1' : '0.01'}
                          value={item.purchaseUnitPrice || ''}
                          onChange={e => handleItemChange(idx, 'purchaseUnitPrice', e.target.value)}
                          placeholder="매입 단가"
                          style={{ width: '75px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', textAlign: 'right', boxSizing: 'border-box', height: '28px', outline: 'none' }}
                        />
                      </div>
                    </td>

                    {/* 금액 */}
                    <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: '#1e293b', verticalAlign: 'middle', fontSize: '12.5px' }}>
                      {item.currency === 'KRW' ? '₩' : '$'}{(item.amount || 0).toLocaleString('en-US', item.currency === 'KRW' ? {} : { minimumFractionDigits: 2 })}
                    </td>

                    {/* 관리 (복사 / 삭제) */}
                    <td style={{ padding: '8px 6px', textAlign: 'center', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => copyItemRow(idx)}
                          title="동일 품목 복사 추가"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#2563eb',
                            fontSize: '13px',
                            cursor: 'pointer'
                          }}
                        >
                          📋
                        </button>
                        <button
                          type="button"
                          onClick={() => removeItemRow(idx)}
                          disabled={items.length === 1}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: items.length === 1 ? '#cbd5e1' : '#ef4444',
                            fontSize: '15px',
                            cursor: items.length === 1 ? 'not-allowed' : 'pointer',
                            transition: 'color 0.2s'
                          }}
                          onMouseEnter={e => { if (items.length > 1) e.currentTarget.style.color = '#b91c1c'; }}
                          onMouseLeave={e => { if (items.length > 1) e.currentTarget.style.color = '#ef4444'; }}
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              </tbody>
            </table>
          </div>
 
          {/* Forwarder/Transport Section */}
          <div style={{ marginTop: '8px', padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 750, color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>🚢</span>
                <span>포워딩/운송사 & 운송비</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  if (forwarders.length >= 4) {
                    alert("운송사는 최대 4개까지 추가 가능합니다.");
                    return;
                  }
                  setForwarders(prev => [...prev, { name: '', amountUsd: 0, budgetAmountUsd: 0 }]);
                }}
                style={{ padding: '5px 12px', fontSize: '11.5px', fontWeight: 700, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', transition: 'background 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#2563eb'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#3b82f6'; }}
              >
                + 운송사 추가
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px 32px', gap: '10px', marginBottom: '6px' }}>
              <span style={{ fontSize: '11px', color: '#475569', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>포워딩사/운송사명</span>
              <span style={{ fontSize: '11px', color: '#475569', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>해상운임 (USD $)</span>
              <span></span>
            </div>
            {forwarders.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '12.5px', border: '1px dashed #cbd5e1', borderRadius: '6px', background: '#ffffff' }}>운송사를 추가해 주세요.</div>
            ) : (
              forwarders.map((fw, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 200px 32px', gap: '10px', marginBottom: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={fw.name || ''}
                    onChange={e => setForwarders(prev => prev.map((f, i) => i === idx ? { ...f, name: e.target.value } : f))}
                    placeholder="포워딩사명 입력"
                    style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', outline: 'none', background: '#fff', color: '#1e293b', boxSizing: 'border-box' }}
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editingFwAmount && editingFwAmount.idx === idx ? editingFwAmount.value : ((fw.amountUsd ?? 0) === 0 ? '' : (fw.amountUsd ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}
                    onFocus={() => setEditingFwAmount({ idx, value: String(fw.amountUsd || '') })}
                    onBlur={() => setEditingFwAmount(null)}
                    onChange={e => {
                      const val = e.target.value.replace(/[^0-9.]/g, '');
                      const parts = val.split('.');
                      const cleanVal = parts[0] + (parts.length > 1 ? '.' + parts.slice(1).join('') : '');
                      setEditingFwAmount({ idx, value: cleanVal });
                      const num = parseFloat(cleanVal) || 0;
                      setForwarders(prev => prev.map((f, i) => i === idx ? { ...f, amountUsd: num, budgetAmountUsd: num } : f));
                    }}
                    placeholder="0.00"
                    style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', height: '34px', outline: 'none', background: '#fff', color: '#1e293b', boxSizing: 'border-box', textAlign: 'right' }}
                  />
                  <button
                    type="button"
                    onClick={() => setForwarders(prev => prev.filter((_, i) => i !== idx))}
                    style={{ height: '34px', width: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 700, transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#fecaca'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#fee2e2'; }}
                  >✕</button>
                </div>
              ))
            )}
          </div>

          {/* Real-time Total sum */}
          <div style={{ alignSelf: 'flex-end', marginTop: '12px', fontSize: '15px', fontWeight: 800, color: '#1e293b', display: 'flex', gap: '16px', alignItems: 'center' }}>
            <span>총 발주 금액 (Grand Total):</span>
            {(() => {
              const usdTotal = items.filter(it => it.currency !== 'KRW').reduce((sum, it) => sum + (it.amount || 0), 0)
                + forwarders.reduce((sum, fw) => sum + (fw.amountUsd || 0), 0);
              const krwTotal = items.filter(it => it.currency === 'KRW').reduce((sum, it) => sum + (it.amount || 0), 0);
              return (
                <span style={{ color: '#dc2626', fontSize: '17px', fontWeight: 900 }}>
                  {usdTotal > 0 && `$${usdTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD`}
                  {usdTotal > 0 && krwTotal > 0 && ' / '}
                  {krwTotal > 0 && `₩${krwTotal.toLocaleString('en-US')} KRW`}
                  {usdTotal === 0 && krwTotal === 0 && '$0.00 USD'}
                </span>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Footer */}
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border-default)', background: '#ffffff', display: 'flex', justifyContent: 'flex-end', gap: '10px', borderRadius: '0 0 12px 12px' }}>
          <button onClick={onClose} style={{ padding: '6px 14px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, color: '#475569', cursor: 'pointer', fontSize: '12.5px', transition: 'all 0.2s' }} onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }} onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>취소</button>
          <button onClick={handleSave} disabled={isSaving} style={{ padding: '6px 16px', borderRadius: '4px', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '12.5px', transition: 'background 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }} onMouseEnter={e => { e.currentTarget.style.background = '#2563eb'; }} onMouseLeave={e => { e.currentTarget.style.background = '#3b82f6'; }}>
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
              setProducts(prodSnap.docs.map(d => ({ ...d.data(), id: d.id } as Product)));
            };
            refreshProducts();
          }}
        />
      )}
      {isCustomerSearchOpen && (
        <CustomerSearchModal
          customers={customers}
          initialSearchQuery={formData.customerName || ''}
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
    </>
  );
};
