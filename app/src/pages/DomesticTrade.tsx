import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import type { DomesticTradeItem, DomesticQuoteLineItem } from '../types/domestic';
import type { Customer } from '../types/customer';
import type { Supplier } from '../types/supplier';
import type { User } from '../types/index';
import type { Product } from '../types/product';
import { CustomerSearchModal } from '../components/CustomerSearchModal';
import { SupplierSearchModal } from '../components/SupplierSearchModal';
import { ProductSearchModal } from '../components/ProductSearchModal';

export const DomesticTrade: React.FC = () => {
  const { userProfile } = useAuth();
  const [trades, setTrades] = useState<DomesticTradeItem[]>([]);
  const [loading, setLoading] = useState(true);

  // DB Masters for Customer, Supplier, Product & Users
  const [dbCustomers, setDbCustomers] = useState<Customer[]>([]);
  const [dbSuppliers, setDbSuppliers] = useState<Supplier[]>([]);
  const [dbUsers, setDbUsers] = useState<User[]>([]);
  const [dbProducts, setDbProducts] = useState<Product[]>([]);

  // Sub-modal Popups (돋보기 🔍 DB 검색)
  const [showCustomerSearchModal, setShowCustomerSearchModal] = useState(false);
  const [showSupplierSearchModal, setShowSupplierSearchModal] = useState(false);
  const [showProductSearchModal, setShowProductSearchModal] = useState(false);
  const [activeItemIndexForProduct, setActiveItemIndexForProduct] = useState<number | null>(null);

  // Filters
  const [companyFilter, setCompanyFilter] = useState<'All' | 'YSACC' | 'YS'>('All');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'COMPLETED' | 'CANCELLED'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Form Modal State (Order Create/Edit)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DomesticTradeItem | null>(null);

  // Modeless Drag-to-move & Resizable Window Position for Order Modal
  const [modalPos, setModalPos] = useState({ x: Math.max(20, (window.innerWidth - 980) / 2), y: Math.max(15, (window.innerHeight - 720) / 2) });
  const [isDraggingModal, setIsDraggingModal] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const handleMouseDownHeader = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.tagName === 'SELECT') return;
    setIsDraggingModal(true);
    dragStartRef.current = { x: e.clientX - modalPos.x, y: e.clientY - modalPos.y };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingModal) return;
      const nextX = Math.max(0, Math.min(window.innerWidth - 300, e.clientX - dragStartRef.current.x));
      const nextY = Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragStartRef.current.y));
      setModalPos({ x: nextX, y: nextY });
    };
    const handleMouseUp = () => {
      setIsDraggingModal(false);
    };

    if (isDraggingModal) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingModal]);

  // Preview Modal State
  const [previewItem, setPreviewItem] = useState<DomesticTradeItem | null>(null);

  // 📑 Transaction Statement (거래명세표) Preview Modal State
  const [statementItem, setStatementItem] = useState<DomesticTradeItem | null>(null);

  // ------------------------------------------------------------------
  // 💳 Settlement & Profitability Sub-Window Modal State
  // ------------------------------------------------------------------
  const [settlementTrade, setSettlementTrade] = useState<DomesticTradeItem | null>(null);
  const [settlementTab, setSettlementTab] = useState<'purchase' | 'taxInvoice' | 'collection' | 'profit'>('purchase');

  // Settlement Form Fields
  const [purchaseSettled, setPurchaseSettled] = useState(false);
  const [purchaseAmountActual, setPurchaseAmountActual] = useState(0);
  const [purchaseDate, setPurchaseDate] = useState('');
  const [purchaseMemo, setPurchaseMemo] = useState('');

  const [taxInvoiceStatus, setTaxInvoiceStatus] = useState<'UNISSUED' | 'ISSUED' | 'RECEIVED'>('UNISSUED');
  const [taxInvoiceType, setTaxInvoiceType] = useState<'ISSUED' | 'RECEIVED' | 'BOTH' | 'NONE'>('ISSUED');
  const [taxInvoiceNo, setTaxInvoiceNo] = useState('');
  const [taxInvoiceDate, setTaxInvoiceDate] = useState('');
  const [taxInvoiceAmount, setTaxInvoiceAmount] = useState(0);
  const [taxInvoiceVat, setTaxInvoiceVat] = useState(0);

  const [collectionStatus, setCollectionStatus] = useState<'UNPAID' | 'PARTIAL' | 'PAID'>('UNPAID');
  const [collectedAmount, setCollectedAmount] = useState(0);
  const [collectionDate, setCollectionDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('계좌이체');

  const [additionalExpenses, setAdditionalExpenses] = useState(0);

  // Order Form Fields
  const [tradeDate, setTradeDate] = useState(new Date().toISOString().split('T')[0]);
  const [tradeNo, setTradeNo] = useState('');
  const [quoteNo, setQuoteNo] = useState('');
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

  const [taxInvoiceIssued, setTaxInvoiceIssued] = useState(true);
  const [status, setStatus] = useState<'PENDING' | 'COMPLETED' | 'CANCELLED'>('COMPLETED');
  const [memo, setMemo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load Domestic Trades & DB Masters from Firestore
  const fetchTradesAndMasters = async () => {
    setLoading(true);
    try {
      const [tradesSnap, custSnap, suppSnap, userSnap, prodSnap] = await Promise.all([
        getDocs(collection(db, 'companies', 'YSACC', 'domestic_trades')),
        getDocs(collection(db, 'companies', 'YSACC', 'customers')),
        getDocs(collection(db, 'companies', 'YSACC', 'suppliers')),
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'companies', 'YSACC', 'products'))
      ]);

      const list: DomesticTradeItem[] = [];
      tradesSnap.forEach(d => {
        const data = d.data();
        let lineItems: DomesticQuoteLineItem[] = data.items || [];
        if (!lineItems.length && data.productName) {
          const qty = data.quantity || 1;
          const salesPrice = data.salesAmount ? Math.round(data.salesAmount / qty) : 0;
          const buyingPrice = data.buyingAmount ? Math.round(data.buyingAmount / qty) : 0;
          lineItems = [{
            id: 'legacy-1',
            productName: data.productName,
            spec: '',
            unit: 'EA',
            quantity: qty,
            buyingUnitPrice: buyingPrice,
            targetMarginRate: data.marginRate || 0,
            salesUnitPrice: salesPrice,
            buyingAmount: data.buyingAmount || 0,
            salesAmount: data.salesAmount || 0,
            margin: data.margin || 0,
            note: ''
          }];
        }
        list.push({ id: d.id, ...data, items: lineItems } as DomesticTradeItem);
      });
      list.sort((a, b) => (b.tradeDate || '').localeCompare(a.tradeDate || '') || b.id.localeCompare(a.id));
      setTrades(list);

      // Masters
      const custs: Customer[] = [];
      custSnap.forEach(d => custs.push({ id: d.id, ...d.data() } as Customer));
      setDbCustomers(custs);

      const supps: Supplier[] = [];
      suppSnap.forEach(d => supps.push({ id: d.id, ...d.data() } as Supplier));
      setDbSuppliers(supps);

      const users: User[] = [];
      userSnap.forEach(d => users.push({ id: d.id, ...d.data() } as User));
      setDbUsers(users);

      const prods: Product[] = [];
      prodSnap.forEach(d => prods.push({ id: d.id, ...d.data() } as Product));
      setDbProducts(prods);

    } catch (e) {
      console.error("Failed to load domestic trades:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTradesAndMasters();
  }, []);

  // Handle Customer DB selection
  const handleSelectCustomer = (cust: Customer) => {
    const displayName = cust.nameKo || cust.name || '';
    setCustomerName(displayName);
    setReceiverAttention(cust.contactPerson || cust.representative || '');
    setReceiverTel(cust.contactPhone || cust.phone || '');
    setReceiverFax(cust.fax || '');
    setShowCustomerSearchModal(false);
  };

  // Handle Supplier DB selection
  const handleSelectSupplier = (supp: Supplier) => {
    setSupplierName(supp.name);
    setShowSupplierSearchModal(false);
  };

  // Handle Product DB selection
  const handleSelectProduct = (prod: Product) => {
    if (activeItemIndexForProduct === null) return;
    const nameStr = prod.nameKo || prod.nameEn || prod.productCode;
    const specStr = prod.spec || prod.description || '';
    const unitStr = prod.unit || 'KG';

    setItems(prev => {
      const updated = [...prev];
      const idx = activeItemIndexForProduct;
      const item = { ...updated[idx] };
      item.productName = nameStr;
      item.spec = specStr;
      item.unit = unitStr;

      if ((prod as any).costPrice) {
        item.buyingUnitPrice = Number((prod as any).costPrice);
      }
      if ((prod as any).sellingPrice) {
        item.salesUnitPrice = Number((prod as any).sellingPrice);
      }

      const qty = Number(item.quantity) || 1;
      const buyingPrice = Number(item.buyingUnitPrice) || 0;
      let salesPrice = Number(item.salesUnitPrice) || 0;
      let marginRate = Number(item.targetMarginRate) || 15;

      if (buyingPrice > 0 && salesPrice === 0) {
        salesPrice = Math.round(buyingPrice * (1 + marginRate / 100));
      } else if (salesPrice > 0 && buyingPrice > 0) {
        marginRate = Math.round(((salesPrice - buyingPrice) / salesPrice) * 1000) / 10;
      }

      item.salesUnitPrice = salesPrice;
      item.targetMarginRate = marginRate;
      item.buyingAmount = qty * buyingPrice;
      item.salesAmount = qty * salesPrice;
      item.margin = item.salesAmount - item.buyingAmount;

      updated[idx] = item;
      return updated;
    });

    setShowProductSearchModal(false);
    setActiveItemIndexForProduct(null);
  };

  // Handle Sales Manager Selection from Users DB
  const handleSelectManagerFromDb = (nameVal: string) => {
    setManagerName(nameVal);
    const found = dbUsers.find(u => u.name === nameVal || u.id === nameVal);
    if (found) {
      setManagerName(found.name);
      if (found.position || found.role) {
        setManagerTitle(found.position || found.role);
      }
      if (found.phone || found.mobile || found.email) {
        setManagerContact(found.phone || found.mobile || found.email || '');
      }
    }
  };

  // Line item change calculations
  const updateLineItem = (index: number, field: keyof DomesticQuoteLineItem, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };

      const qty = Number(item.quantity) || 0;
      const buyingPrice = Number(item.buyingUnitPrice) || 0;
      let salesPrice = Number(item.salesUnitPrice) || 0;
      let marginRate = Number(item.targetMarginRate) || 0;

      if (field === 'buyingUnitPrice' || field === 'targetMarginRate') {
        if (buyingPrice > 0 && marginRate > 0) {
          salesPrice = Math.round(buyingPrice * (1 + marginRate / 100));
        }
      } else if (field === 'salesUnitPrice') {
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

  // Aggregated totals for modal
  const totals = useMemo(() => {
    const expectedBuyingAmount = items.reduce((sum, item) => sum + (Number(item.buyingAmount) || 0), 0);
    const salesAmount = items.reduce((sum, item) => sum + (Number(item.salesAmount) || 0), 0);
    const margin = salesAmount - expectedBuyingAmount;
    const marginRate = salesAmount > 0 ? Math.round((margin / salesAmount) * 1000) / 10 : 0;
    return { expectedBuyingAmount, salesAmount, margin, marginRate };
  }, [items]);

  // Open Settlement & Profitability Management Dialog
  const handleOpenSettlementModal = (item: DomesticTradeItem, initialTab: 'purchase' | 'taxInvoice' | 'collection' | 'profit' = 'purchase') => {
    setSettlementTrade(item);
    setSettlementTab(initialTab);

    setPurchaseSettled(item.purchaseSettled ?? (item.status === 'COMPLETED'));
    setPurchaseAmountActual(item.purchaseAmountActual ?? item.buyingAmount);
    setPurchaseDate(item.purchaseDate || item.tradeDate || new Date().toISOString().split('T')[0]);
    setPurchaseMemo(item.purchaseMemo || '');

    setTaxInvoiceStatus(item.taxInvoiceStatus || (item.taxInvoiceIssued ? 'ISSUED' : 'UNISSUED'));
    setTaxInvoiceType(item.taxInvoiceType || 'ISSUED');
    setTaxInvoiceNo(item.taxInvoiceNo || '');
    setTaxInvoiceDate(item.taxInvoiceDate || item.tradeDate || new Date().toISOString().split('T')[0]);
    setTaxInvoiceAmount(item.taxInvoiceAmount ?? item.salesAmount);
    setTaxInvoiceVat(item.taxInvoiceVat ?? Math.round((item.salesAmount || 0) * 0.1));

    setCollectionStatus(item.collectionStatus || (item.status === 'COMPLETED' ? 'PAID' : 'UNPAID'));
    setCollectedAmount(item.collectedAmount ?? (item.status === 'COMPLETED' ? item.salesAmount : 0));
    setCollectionDate(item.collectionDate || item.tradeDate || new Date().toISOString().split('T')[0]);
    setPaymentMethod(item.paymentMethod || '계좌이체');

    setAdditionalExpenses(item.additionalExpenses ?? 0);
  };

  // Save Settlement & Profit Data
  const handleSaveSettlement = async () => {
    if (!settlementTrade) return;
    try {
      const salesAmt = settlementTrade.salesAmount || 0;
      const actualPurchase = purchaseAmountActual || 0;
      const expenses = additionalExpenses || 0;

      const realizedProfit = salesAmt - actualPurchase - expenses;
      const realizedMarginRate = salesAmt > 0 ? Math.round((realizedProfit / salesAmt) * 1000) / 10 : 0;
      const uncollectedAmount = Math.max(0, salesAmt - collectedAmount);

      let newStatus = settlementTrade.status;
      if (collectionStatus === 'PAID' && purchaseSettled) {
        newStatus = 'COMPLETED';
      }

      const payload = {
        purchaseSettled,
        purchaseAmountActual,
        purchaseDate,
        purchaseMemo: purchaseMemo.trim(),

        taxInvoiceStatus,
        taxInvoiceType,
        taxInvoiceNo: taxInvoiceNo.trim(),
        taxInvoiceDate,
        taxInvoiceAmount,
        taxInvoiceVat,
        taxInvoiceIssued: taxInvoiceStatus === 'ISSUED' || taxInvoiceStatus === 'RECEIVED',

        collectionStatus,
        collectedAmount,
        uncollectedAmount,
        collectionDate,
        paymentMethod,

        additionalExpenses,
        realizedProfit,
        realizedMarginRate,

        status: newStatus,
        updatedAt: new Date().toISOString()
      };

      await updateDoc(doc(db, 'companies', 'YSACC', 'domestic_trades', settlementTrade.id), payload);
      alert("🎉 매입, 세금계산서, 수금 및 이익분석 정산 데이터가 성공적으로 저장되었습니다!");
      setSettlementTrade(null);
      fetchTradesAndMasters();
    } catch (e: any) {
      console.error("Failed to save settlement data:", e);
      alert("정산 저장 중 오류가 발생했습니다: " + e.message);
    }
  };

  // Open Modal for Create or Edit
  const handleOpenModal = (item?: DomesticTradeItem) => {
    setModalPos({ x: Math.max(20, (window.innerWidth - 980) / 2), y: Math.max(15, (window.innerHeight - 720) / 2) });
    if (item) {
      setEditingItem(item);
      setTradeDate(item.tradeDate || new Date().toISOString().split('T')[0]);
      setTradeNo(item.tradeNo || '');
      setQuoteNo(item.quoteNo || '');
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
          quantity: item.quantity || 1,
          buyingUnitPrice: item.buyingAmount ? Math.round(item.buyingAmount / (item.quantity || 1)) : 0,
          targetMarginRate: item.marginRate || 15,
          salesUnitPrice: item.salesAmount ? Math.round(item.salesAmount / (item.quantity || 1)) : 0,
          buyingAmount: item.buyingAmount || 0,
          salesAmount: item.salesAmount || 0,
          margin: item.margin || 0,
          note: ''
        }
      ]);
      setSpecialNotes(item.specialNotes || '');
      setVatType(item.vatType || '부가가치세(VAT): 별도');
      setPaymentTerms(item.paymentTerms || '결제조건 : 선금 30%, 잔금 70%');
      setManagerTitle(item.managerTitle || '이사');
      setManagerName(item.managerName || '이한중');
      setManagerContact(item.managerContact || '010-6277-7418');

      setTaxInvoiceIssued(item.taxInvoiceIssued ?? true);
      setStatus(item.status || 'COMPLETED');
      setMemo(item.memo || '');
    } else {
      setEditingItem(null);
      setTradeDate(new Date().toISOString().split('T')[0]);
      const year = new Date().getFullYear();
      const count = trades.length + 1;
      setTradeNo(`DOM-ORD-${year}-${String(count).padStart(3, '0')}`);
      setQuoteNo('');
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

      if (userProfile) {
        setManagerName(userProfile.name || '이한중');
        setManagerTitle(userProfile.position || userProfile.role || '이사');
        setManagerContact(userProfile.phone || userProfile.mobile || userProfile.email || '010-6277-7418');
      } else {
        setManagerTitle('이사');
        setManagerName('이한중');
        setManagerContact('010-6277-7418');
      }

      setTaxInvoiceIssued(true);
      setStatus('COMPLETED');
      setMemo('');
    }
    setIsModalOpen(true);
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || items.some(i => !i.productName.trim())) {
      alert("매출처(고객사) 정보 및 각 품목의 품명은 필수 입력 사항입니다.");
      return;
    }

    setIsSubmitting(true);
    try {
      const primaryProduct = items.map(i => i.productName).join(', ');
      const totalQty = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);

      const payload = {
        tradeDate,
        tradeNo: tradeNo || `DOM-ORD-${new Date().getFullYear()}-${Date.now().toString().slice(-3)}`,
        quoteNo: quoteNo.trim() || null,
        companyType,
        supplierName: supplierName.trim(),
        customerName: customerName.trim(),
        receiverAttention: receiverAttention.trim(),
        receiverTel: receiverTel.trim(),
        receiverFax: receiverFax.trim(),
        productName: primaryProduct,
        quantity: totalQty,
        items,
        buyingAmount: totals.expectedBuyingAmount,
        salesAmount: totals.salesAmount,
        margin: totals.margin,
        marginRate: totals.marginRate,
        specialNotes: specialNotes.trim(),
        vatType: vatType.trim(),
        paymentTerms: paymentTerms.trim(),
        managerTitle: managerTitle.trim(),
        managerName: managerName.trim(),
        managerContact: managerContact.trim(),
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
      fetchTradesAndMasters();
    } catch (err) {
      console.error("Failed to save domestic trade:", err);
      alert("저장 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Handler
  const handleDelete = async (id: string) => {
    if (!window.confirm("이 국내 주문 내역을 삭제하시겠습니까?")) return;
    try {
      await deleteDoc(doc(db, 'companies', 'YSACC', 'domestic_trades', id));
      fetchTradesAndMasters();
    } catch (e) {
      console.error("Failed to delete trade:", e);
      alert("삭제 중 오류가 발생했습니다.");
    }
  };

  // Filtered List
  const filteredTrades = useMemo(() => {
    return trades.filter(t => {
      if (companyFilter !== 'All' && t.companyType !== companyFilter) return false;
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchNo = (t.tradeNo || '').toLowerCase().includes(term);
        const matchQuoteNo = (t.quoteNo || '').toLowerCase().includes(term);
        const matchSupplier = (t.supplierName || '').toLowerCase().includes(term);
        const matchCustomer = (t.customerName || '').toLowerCase().includes(term);
        const matchProduct = (t.productName || '').toLowerCase().includes(term);
        if (!matchNo && !matchQuoteNo && !matchSupplier && !matchCustomer && !matchProduct) return false;
      }
      return true;
    });
  }, [trades, companyFilter, statusFilter, searchTerm]);

  // Overall KPI Statistics
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

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>국내 주문 데이터를 불러오는 중...</div>;
  }

  return (
    <div style={{ padding: '24px 30px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {/* 🔍 Sub-Modal Search Popups */}
      {showCustomerSearchModal && (
        <CustomerSearchModal
          customers={dbCustomers}
          onClose={() => setShowCustomerSearchModal(false)}
          onSelect={handleSelectCustomer}
          onRefreshCustomers={fetchTradesAndMasters}
        />
      )}

      {showSupplierSearchModal && (
        <SupplierSearchModal
          suppliers={dbSuppliers}
          onClose={() => setShowSupplierSearchModal(false)}
          onSelect={handleSelectSupplier}
          onRefreshSuppliers={fetchTradesAndMasters}
        />
      )}

      {showProductSearchModal && (
        <ProductSearchModal
          products={dbProducts}
          onClose={() => {
            setShowProductSearchModal(false);
            setActiveItemIndexForProduct(null);
          }}
          onSelect={handleSelectProduct}
        />
      )}

      {/* Global Datalists for DB Autocomplete */}
      <datalist id="customer-db-list">
        {dbCustomers.map(c => (
          <option key={c.id} value={c.nameKo || c.name}>
            {c.nameKo || c.name} {c.representative ? `(대표: ${c.representative})` : ''}
          </option>
        ))}
      </datalist>

      <datalist id="supplier-db-list">
        {dbSuppliers.map(s => (
          <option key={s.id} value={s.name}>
            {s.name} {s.representative ? `(대표: ${s.representative})` : ''}
          </option>
        ))}
      </datalist>

      <datalist id="user-db-list">
        {dbUsers.map(u => (
          <option key={u.id} value={u.name}>
            {u.name} {u.position || u.role ? `(${u.position || u.role})` : ''}
          </option>
        ))}
      </datalist>

      {/* Print Specific CSS */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #order-print-area, #order-print-area *, #statement-print-area, #statement-print-area * { visibility: visible; }
          #order-print-area, #statement-print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 850, color: '#1e293b', margin: 0 }}>🏪 국내 주문관리</h1>
          <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 600 }}>국내 매입/매출 주문, 세금계산서, 수금등록, 거래명세표 및 이익분석 통합 관리</span>
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
          ➕ 신규 국내 주문 등록
        </button>
      </div>

      {/* KPI Stats Banner */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>총 국내 주문</span>
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
          placeholder="매출처, 매입처, 품목명, 주문/견적번호 검색..."
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
                <th style={{ padding: '12px', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>주문일자</th>
                <th style={{ padding: '12px', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>주문번호</th>
                <th style={{ padding: '12px', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>주체</th>
                <th style={{ padding: '12px', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>국내 매입처</th>
                <th style={{ padding: '12px', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>국내 매출처</th>
                <th style={{ padding: '12px', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>품목 정보 (수량)</th>
                <th style={{ padding: '12px', textAlign: 'right', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>총 매입액 / 상태</th>
                <th style={{ padding: '12px', textAlign: 'right', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>총 매출액 / 수금</th>
                <th style={{ padding: '12px', textAlign: 'right', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>영업 마진 / 실현이익</th>
                <th style={{ padding: '12px', textAlign: 'center', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>세금계산서</th>
                <th style={{ padding: '12px', textAlign: 'center', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>상태</th>
                <th style={{ padding: '12px', textAlign: 'center', fontSize: '13px', fontWeight: 750, letterSpacing: '0.02em', textTransform: 'uppercase' }}>관리 및 명세서</th>
              </tr>
            </thead>
            <tbody>
              {filteredTrades.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '14.5px' }}>
                    등록된 국내 주문 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredTrades.map(item => {
                  const margin = (item.salesAmount || 0) - (item.buyingAmount || 0);
                  const itemCount = item.items ? item.items.length : 1;
                  const itemSummary = item.items && item.items.length > 0
                    ? `${item.items[0].productName} ${itemCount > 1 ? `외 ${itemCount - 1}건` : ''}`
                    : (item.productName || '품목');

                  const actualPurchase = item.purchaseAmountActual ?? item.buyingAmount;
                  const expenses = item.additionalExpenses ?? 0;
                  const realizedProf = item.realizedProfit ?? (item.salesAmount - actualPurchase - expenses);
                  const realizedRate = item.realizedMarginRate ?? item.marginRate;

                  const collected = item.collectedAmount ?? (item.status === 'COMPLETED' ? item.salesAmount : 0);
                  const uncollected = Math.max(0, item.salesAmount - collected);

                  return (
                    <tr 
                      key={item.id}
                      style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{ padding: '12px', color: '#475569', fontWeight: 600 }}>{item.tradeDate}</td>
                      <td style={{ padding: '12px', fontWeight: 800, color: '#1e293b' }}>
                        {item.tradeNo}
                        {item.quoteNo && (
                          <span style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: 500 }}>
                            ({item.quoteNo})
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', background: item.companyType === 'YSACC' ? '#eff6ff' : '#fef3c7', color: item.companyType === 'YSACC' ? '#2563eb' : '#d97706' }}>
                          {item.companyType}
                        </span>
                      </td>
                      <td style={{ padding: '12px', color: '#334155', fontWeight: 600 }}>{item.supplierName}</td>
                      <td style={{ padding: '12px', color: '#0f172a', fontWeight: 800 }}>
                        {item.customerName}
                        {item.receiverAttention && <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, marginLeft: '4px' }}>({item.receiverAttention})</span>}
                      </td>
                      <td style={{ padding: '12px', color: '#1e293b' }}>
                        {itemSummary}
                      </td>
                      
                      {/* 매입액 및 정산상태 */}
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <div style={{ color: '#64748b', fontWeight: 700 }}>₩{item.buyingAmount.toLocaleString()}</div>
                        <button
                          type="button"
                          onClick={() => handleOpenSettlementModal(item, 'purchase')}
                          style={{
                            fontSize: '10.5px',
                            fontWeight: 800,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            border: '1px solid',
                            borderColor: item.purchaseSettled ? '#86efac' : '#fde047',
                            background: item.purchaseSettled ? '#f0fdf4' : '#fefce8',
                            color: item.purchaseSettled ? '#166534' : '#854d0e',
                            cursor: 'pointer',
                            marginTop: '2px'
                          }}
                        >
                          {item.purchaseSettled ? '📦 매입완료' : '⏳ 매입대기'}
                        </button>
                      </td>

                      {/* 매출액 및 수금상태 */}
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, color: '#2563eb' }}>₩{item.salesAmount.toLocaleString()}</div>
                        <button
                          type="button"
                          onClick={() => handleOpenSettlementModal(item, 'collection')}
                          style={{
                            fontSize: '10.5px',
                            fontWeight: 800,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            border: '1px solid',
                            borderColor: item.collectionStatus === 'PAID' ? '#93c5fd' : item.collectionStatus === 'PARTIAL' ? '#fde047' : '#fca5a5',
                            background: item.collectionStatus === 'PAID' ? '#eff6ff' : item.collectionStatus === 'PARTIAL' ? '#fefce8' : '#fef2f2',
                            color: item.collectionStatus === 'PAID' ? '#1e40af' : item.collectionStatus === 'PARTIAL' ? '#854d0e' : '#991b1b',
                            cursor: 'pointer',
                            marginTop: '2px'
                          }}
                        >
                          {item.collectionStatus === 'PAID' ? `💰 완납` : uncollected > 0 ? `미수 ₩${uncollected.toLocaleString()}` : `수금등록`}
                        </button>
                      </td>

                      {/* 영업 마진 및 실현이익 */}
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, color: margin >= 0 ? '#10b981' : '#ef4444' }}>
                          ₩{margin.toLocaleString()} ({item.marginRate}%)
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenSettlementModal(item, 'profit')}
                          style={{
                            fontSize: '10.5px',
                            fontWeight: 800,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            border: '1px solid #d8b4fe',
                            background: '#faf5ff',
                            color: '#6b21a8',
                            cursor: 'pointer',
                            marginTop: '2px'
                          }}
                        >
                          📊 실현 ₩{realizedProf.toLocaleString()} ({realizedRate}%)
                        </button>
                      </td>

                      {/* 세금계산서 */}
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenSettlementModal(item, 'taxInvoice')}
                          style={{
                            fontSize: '11px',
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: '4px',
                            border: '1px solid',
                            borderColor: item.taxInvoiceStatus === 'ISSUED' || item.taxInvoiceIssued ? '#86efac' : '#fca5a5',
                            background: item.taxInvoiceStatus === 'ISSUED' || item.taxInvoiceIssued ? '#dcfce7' : '#fee2e2',
                            color: item.taxInvoiceStatus === 'ISSUED' || item.taxInvoiceIssued ? '#166534' : '#991b1b',
                            cursor: 'pointer'
                          }}
                        >
                          {item.taxInvoiceStatus === 'ISSUED' || item.taxInvoiceIssued ? '🧾 발행완료' : '🧾 미발행'}
                        </button>
                      </td>

                      {/* 상태 */}
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

                      {/* 관리 및 명세서 버튼 */}
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => setStatementItem(item)}
                            title="거래명세표 (Transaction Statement) 출력 및 인쇄"
                            style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', fontWeight: 800, color: '#166534', cursor: 'pointer' }}
                          >
                            📑 거래명세표
                          </button>
                          <button
                            onClick={() => handleOpenSettlementModal(item, 'profit')}
                            title="매입, 세금계산서, 수금 및 실현이익 통합 정산 분석"
                            style={{ background: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', fontWeight: 800, color: '#6d28d9', cursor: 'pointer' }}
                          >
                            💳 정산/이익관리
                          </button>
                          <button
                            onClick={() => setPreviewItem(item)}
                            title="엑셀/인쇄 양식 미리보기"
                            style={{ background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', fontWeight: 700, color: '#1d4ed8', cursor: 'pointer' }}
                          >
                            🖨️ 주문서 출력
                          </button>
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

      {/* ------------------------------------------------------------------ */}
      {/* 💳 Dedicated Settlement & Profitability Management Modeless Dialog  */}
      {/* ------------------------------------------------------------------ */}
      {settlementTrade && (
        <div
          style={{
            position: 'fixed',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 10000,
            pointerEvents: 'auto'
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '8px',
              border: '1px solid #94a3b8',
              width: '920px',
              maxWidth: '96vw',
              maxHeight: '92vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 60px rgba(15,23,42,0.4)',
              minWidth: '700px'
            }}
          >
            {/* Header */}
            <div style={{ background: 'linear-gradient(to right, #1e293b, #334155)', color: '#fff', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '18px' }}>💳</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>국내 주문 정산 & 이익 분석 관리</h3>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                    주문번호: <strong>{settlementTrade.tradeNo}</strong> | 매출처: <strong>{settlementTrade.customerName}</strong> | 매입처: <strong>{settlementTrade.supplierName}</strong>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSettlementTrade(null)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Sub-Tabs Bar */}
            <div style={{ display: 'flex', background: '#f8fafc', borderBottom: '1px solid #cbd5e1', padding: '0 16px' }}>
              <button
                type="button"
                onClick={() => setSettlementTab('purchase')}
                style={{
                  padding: '12px 20px',
                  border: 'none',
                  borderBottom: settlementTab === 'purchase' ? '3px solid #3b82f6' : '3px solid transparent',
                  background: 'none',
                  fontSize: '13.5px',
                  fontWeight: settlementTab === 'purchase' ? 800 : 600,
                  color: settlementTab === 'purchase' ? '#2563eb' : '#64748b',
                  cursor: 'pointer'
                }}
              >
                📦 1. 매입 등록
              </button>
              <button
                type="button"
                onClick={() => setSettlementTab('taxInvoice')}
                style={{
                  padding: '12px 20px',
                  border: 'none',
                  borderBottom: settlementTab === 'taxInvoice' ? '3px solid #3b82f6' : '3px solid transparent',
                  background: 'none',
                  fontSize: '13.5px',
                  fontWeight: settlementTab === 'taxInvoice' ? 800 : 600,
                  color: settlementTab === 'taxInvoice' ? '#2563eb' : '#64748b',
                  cursor: 'pointer'
                }}
              >
                🧾 2. 세금계산서 등록
              </button>
              <button
                type="button"
                onClick={() => setSettlementTab('collection')}
                style={{
                  padding: '12px 20px',
                  border: 'none',
                  borderBottom: settlementTab === 'collection' ? '3px solid #3b82f6' : '3px solid transparent',
                  background: 'none',
                  fontSize: '13.5px',
                  fontWeight: settlementTab === 'collection' ? 800 : 600,
                  color: settlementTab === 'collection' ? '#2563eb' : '#64748b',
                  cursor: 'pointer'
                }}
              >
                💰 3. 수금 등록
              </button>
              <button
                type="button"
                onClick={() => setSettlementTab('profit')}
                style={{
                  padding: '12px 20px',
                  border: 'none',
                  borderBottom: settlementTab === 'profit' ? '3px solid #6d28d9' : '3px solid transparent',
                  background: 'none',
                  fontSize: '13.5px',
                  fontWeight: settlementTab === 'profit' ? 800 : 600,
                  color: settlementTab === 'profit' ? '#6d28d9' : '#64748b',
                  cursor: 'pointer'
                }}
              >
                📊 4. 이익 분석
              </button>
            </div>

            {/* Tab Body */}
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* TAB 1: 📦 매입 등록 */}
              {settlementTab === 'purchase' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 800, color: '#1e293b' }}>📦 국내 매입처 결제 & 매입 정산 관리</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>국내 매입처</label>
                        <input type="text" readOnly value={settlementTrade.supplierName} style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 700, background: '#f1f5f9' }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>당초 매입예정액</label>
                        <input type="text" readOnly value={`₩${(settlementTrade.buyingAmount || 0).toLocaleString()}`} style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 700, background: '#f1f5f9' }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>확정 매입금액 (원가)</label>
                        <input type="number" value={purchaseAmountActual} onChange={e => setPurchaseAmountActual(Number(e.target.value))} style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 800, color: '#166534' }} />
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>매입 정산일자</label>
                      <input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600 }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>매입 정산 상태</label>
                      <button
                        type="button"
                        onClick={() => setPurchaseSettled(!purchaseSettled)}
                        style={{
                          height: '34px',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '13px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          background: purchaseSettled ? '#dcfce7' : '#fefce8',
                          color: purchaseSettled ? '#166534' : '#854d0e'
                        }}
                      >
                        {purchaseSettled ? '✅ 매입 정산 완료 (클릭 시 변경)' : '⏳ 매입 정산 대기중 (클릭 시 완료)'}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>매입 비고 & 지급 메모</label>
                    <input type="text" placeholder="예: 7/25 계좌 송금 완료, 매입 세금계산서 수취 완료" value={purchaseMemo} onChange={e => setPurchaseMemo(e.target.value)} style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px' }} />
                  </div>
                </div>
              )}

              {/* TAB 2: 🧾 세금계산서 등록 */}
              {settlementTab === 'taxInvoice' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 800, color: '#1e293b' }}>🧾 전자 세금계산서 발행 및 수취 관리</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>발행 구분</label>
                        <select value={taxInvoiceType} onChange={e => setTaxInvoiceType(e.target.value as any)} style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 700 }}>
                          <option value="ISSUED">매출 세금계산서 발행 (자사 ➔ 고객사)</option>
                          <option value="RECEIVED">매입 세금계산서 수취 (공급사 ➔ 자사)</option>
                          <option value="BOTH">매출/매입 양쪽 처리</option>
                          <option value="NONE">해당 없음</option>
                        </select>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>승인/관리 번호</label>
                        <input type="text" placeholder="예: 20260721-41000-8899" value={taxInvoiceNo} onChange={e => setTaxInvoiceNo(e.target.value)} style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 700 }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>발행/수취 일자</label>
                        <input type="date" value={taxInvoiceDate} onChange={e => setTaxInvoiceDate(e.target.value)} style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600 }} />
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>공급가액 (원)</label>
                      <input type="number" value={taxInvoiceAmount} onChange={e => { const val = Number(e.target.value); setTaxInvoiceAmount(val); setTaxInvoiceVat(Math.round(val * 0.1)); }} style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 800, color: '#2563eb' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>부가세액 (VAT 10%)</label>
                      <input type="number" value={taxInvoiceVat} onChange={e => setTaxInvoiceVat(Number(e.target.value))} style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 700, color: '#059669' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>세금계산서 상태</label>
                      <select value={taxInvoiceStatus} onChange={e => setTaxInvoiceStatus(e.target.value as any)} style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 800, background: taxInvoiceStatus === 'ISSUED' ? '#dcfce7' : '#fee2e2', color: taxInvoiceStatus === 'ISSUED' ? '#166534' : '#991b1b' }}>
                        <option value="UNISSUED">❌ 미발행</option>
                        <option value="ISSUED">✅ 발행 완료</option>
                        <option value="RECEIVED">📥 수취 완료</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: 💰 수금 등록 */}
              {settlementTab === 'collection' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 800, color: '#1e293b' }}>💰 고객사 수금 등록 & 미수금 관리</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>총 매출액 (견적/주문)</label>
                        <input type="text" readOnly value={`₩${(settlementTrade.salesAmount || 0).toLocaleString()}`} style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 800, background: '#f1f5f9', color: '#2563eb' }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>누적 수금액 (입금액)</label>
                        <input type="number" value={collectedAmount} onChange={e => { const val = Number(e.target.value); setCollectedAmount(val); if (val >= (settlementTrade.salesAmount || 0)) setCollectionStatus('PAID'); else if (val > 0) setCollectionStatus('PARTIAL'); else setCollectionStatus('UNPAID'); }} style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 800, color: '#059669' }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>미수금 잔액</label>
                        <input type="text" readOnly value={`₩${Math.max(0, (settlementTrade.salesAmount || 0) - collectedAmount).toLocaleString()}`} style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 800, background: '#fef2f2', color: Math.max(0, (settlementTrade.salesAmount || 0) - collectedAmount) > 0 ? '#dc2626' : '#059669' }} />
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>수금/입금 일자</label>
                      <input type="date" value={collectionDate} onChange={e => setCollectionDate(e.target.value)} style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 600 }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>수금 수단</label>
                      <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 700 }}>
                        <option value="계좌이체">🏦 계좌이체</option>
                        <option value="어음">📜 전자/약속 어음</option>
                        <option value="현금">💵 현금</option>
                        <option value="신용카드">💳 신용카드</option>
                        <option value="기타">기타</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>수금 정산 상태</label>
                      <select value={collectionStatus} onChange={e => setCollectionStatus(e.target.value as any)} style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 800, background: collectionStatus === 'PAID' ? '#dcfce7' : collectionStatus === 'PARTIAL' ? '#fefce8' : '#fee2e2', color: collectionStatus === 'PAID' ? '#166534' : collectionStatus === 'PARTIAL' ? '#854d0e' : '#991b1b' }}>
                        <option value="UNPAID">❌ 미수금</option>
                        <option value="PARTIAL">⏳ 부분 수금</option>
                        <option value="PAID">✅ 수금 완료 (완납)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: 📊 이익 분석 */}
              {settlementTab === 'profit' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ background: '#faf5ff', padding: '16px', borderRadius: '6px', border: '1px solid #e9d5ff' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 850, color: '#581c87', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      📊 손익 종합 계산 & 실현 이익 분석
                    </h4>

                    {/* Cost Breakdown Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                      <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '12px', textAlign: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569' }}>총 매출액</span>
                        <div style={{ fontSize: '16px', fontWeight: 900, color: '#2563eb', marginTop: '4px' }}>
                          ₩{(settlementTrade.salesAmount || 0).toLocaleString()}
                        </div>
                      </div>
                      <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '12px', textAlign: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569' }}>확정 매입액 (원가)</span>
                        <div style={{ fontSize: '16px', fontWeight: 900, color: '#64748b', marginTop: '4px' }}>
                          - ₩{(purchaseAmountActual || 0).toLocaleString()}
                        </div>
                      </div>
                      <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '12px', textAlign: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569' }}>기타 부대비용/운임</span>
                        <div style={{ fontSize: '16px', fontWeight: 900, color: '#dc2626', marginTop: '4px' }}>
                          - ₩{(additionalExpenses || 0).toLocaleString()}
                        </div>
                      </div>
                      <div style={{ border: '2px solid #9333ea', borderRadius: '4px', padding: '12px', textAlign: 'center', background: '#f3e8ff' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#6b21a8' }}>실현 영업이익 (순이익)</span>
                        <div style={{ fontSize: '18px', fontWeight: 900, color: (settlementTrade.salesAmount - purchaseAmountActual - additionalExpenses) >= 0 ? '#6b21a8' : '#dc2626', marginTop: '2px' }}>
                          ₩{(settlementTrade.salesAmount - purchaseAmountActual - additionalExpenses).toLocaleString()}
                        </div>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: '#7e22ce', marginTop: '2px' }}>
                          이익률: {settlementTrade.salesAmount > 0 ? Math.round(((settlementTrade.salesAmount - purchaseAmountActual - additionalExpenses) / settlementTrade.salesAmount) * 1000) / 10 : 0}%
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '12px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>추가 부대비용/운임 입력 (원)</label>
                      <input type="number" value={additionalExpenses} onChange={e => setAdditionalExpenses(Number(e.target.value))} style={{ height: '34px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 10px', fontSize: '13px', fontWeight: 700 }} placeholder="0" />
                    </div>

                    <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '4px', border: '1px solid #e2e8f0', display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <span style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b' }}>종합 정산 완료 상태:</span>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                          매입: {purchaseSettled ? '✅완료' : '⏳대기'} | 세금계산서: {taxInvoiceStatus === 'ISSUED' ? '✅발행' : '⏳미발행'} | 수금: {collectionStatus === 'PAID' ? '✅완납' : '⏳미수'}
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              )}

            </div>

            {/* Modal Bottom Action Bar */}
            <div style={{ padding: '12px 20px', background: '#f8fafc', borderTop: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                💡 입력하신 매입, 세금계산서, 수금 정보는 즉시 이익 분석에 실시간 반영됩니다.
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setSettlementTrade(null)}
                  style={{ height: '34px', padding: '0 16px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleSaveSettlement}
                  style={{ height: '34px', padding: '0 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 2px 4px rgba(59,130,246,0.3)' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#2563eb'}
                  onMouseLeave={e => e.currentTarget.style.background = '#3b82f6'}
                >
                  💾 정산/이익 데이터 저장
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 📝 Create / Edit Modeless Resizable Dialog */}
      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            left: `${modalPos.x}px`,
            top: `${modalPos.y}px`,
            zIndex: 9999,
            pointerEvents: 'auto',
            userSelect: isDraggingModal ? 'none' : 'auto'
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '8px',
              border: '1px solid #94a3b8',
              width: '980px',
              maxWidth: '96vw',
              maxHeight: '92vh',
              resize: 'both',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 50px rgba(15,23,42,0.3)',
              minWidth: '750px',
              minHeight: '480px'
            }}
          >
            
            {/* Draggable Header */}
            <div
              onMouseDown={handleMouseDownHeader}
              style={{
                background: 'linear-gradient(to right, #f8fafc, #f1f5f9)',
                borderBottom: '1px solid #cbd5e1',
                padding: '8px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: isDraggingModal ? 'grabbing' : 'grab',
                userSelect: 'none'
              }}
            >
              <h3 style={{ fontSize: '14.5px', fontWeight: 800, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px', color: '#3b82f6' }}>✥</span>
                {editingItem ? '✏️ 국내 주문 수정' : '➕ 신규 국내 주문 등록'}
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>✥ 상단 드래그 이동 | ↘ 오른쪽 아래 창크기 조절</span>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b', padding: '0 4px', lineHeight: 1 }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Compact Modal Form (Single Screen Fit) */}
            <form onSubmit={handleSubmit} style={{ padding: '12px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              
              {/* Section 1: Basic Header Info */}
              <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '4px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#1e293b' }}>1. 주문 기본 및 매출/매입처 정보 (고객사/공급사 🔍 DB 연결)</span>
                  <span style={{ fontSize: '10.5px', color: '#2563eb', fontWeight: 700 }}>⚡ 돋보기 버튼 클릭 시 DB 검색</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1fr 1fr', gap: '8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                      주문번호 <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={tradeNo}
                      onChange={e => setTradeNo(e.target.value)}
                      style={{ height: '30px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 8px', fontSize: '12px', fontWeight: 700, color: '#1e293b', outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                      연결 견적번호
                    </label>
                    <input
                      type="text"
                      placeholder="예: 2026-YSACC-EST-01"
                      value={quoteNo}
                      onChange={e => setQuoteNo(e.target.value)}
                      style={{ height: '30px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 8px', fontSize: '12px', fontWeight: 600, color: '#1e293b', outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                      주문일자 <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={tradeDate}
                      onChange={e => setTradeDate(e.target.value)}
                      style={{ height: '30px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 8px', fontSize: '12px', fontWeight: 600, color: '#1e293b', outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                      발주 주체 (자사) <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <select
                      value={companyType}
                      onChange={e => setCompanyType(e.target.value as any)}
                      style={{ height: '30px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 8px', fontSize: '12px', fontWeight: 600, color: '#1e293b', outline: 'none', background: '#fff' }}
                    >
                      <option value="YSACC">(주)와이에스에이씨씨 (YSACC)</option>
                      <option value="YS">영성ACC</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1.4fr', gap: '8px' }}>
                  
                  {/* Customer Input + 🔍 Button */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                      국내 매출처 (고객사) <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <input
                        type="text"
                        required
                        list="customer-db-list"
                        placeholder="매출처명..."
                        value={customerName}
                        onChange={e => setCustomerName(e.target.value)}
                        style={{ flex: 1, height: '30px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 8px', fontSize: '12px', fontWeight: 600, color: '#1e293b', outline: 'none' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowCustomerSearchModal(true)}
                        title="고객사 DB 서브창 검색"
                        style={{ height: '30px', padding: '0 8px', background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '11px', fontWeight: 800, color: '#1d4ed8', whiteSpace: 'nowrap' }}
                      >
                        🔍 DB
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                      참조 (담당자)
                    </label>
                    <input
                      type="text"
                      placeholder="예: 김성기 사장님"
                      value={receiverAttention}
                      onChange={e => setReceiverAttention(e.target.value)}
                      style={{ height: '30px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 8px', fontSize: '12px', fontWeight: 600, color: '#1e293b', outline: 'none' }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                      전화번호
                    </label>
                    <input
                      type="text"
                      placeholder="010-0000-0000"
                      value={receiverTel}
                      onChange={e => setReceiverTel(e.target.value)}
                      style={{ height: '30px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 8px', fontSize: '12px', fontWeight: 600, color: '#1e293b', outline: 'none' }}
                    />
                  </div>

                  {/* Supplier Input + 🔍 Button */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                      국내 매입처 (공급사)
                    </label>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <input
                        type="text"
                        list="supplier-db-list"
                        placeholder="매입처명..."
                        value={supplierName}
                        onChange={e => setSupplierName(e.target.value)}
                        style={{ flex: 1, height: '30px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 8px', fontSize: '12px', fontWeight: 600, color: '#1e293b', outline: 'none' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSupplierSearchModal(true)}
                        title="공급업체관리 DB 서브창 검색"
                        style={{ height: '30px', padding: '0 8px', background: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '11px', fontWeight: 800, color: '#6d28d9', whiteSpace: 'nowrap' }}
                      >
                        🔍 DB
                      </button>
                    </div>
                  </div>

                </div>

              </div>

              {/* Section 2: Line Items + 🔍 Product Sub-Modal */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#1e293b' }}>
                    2. 품목 목록 및 단가/금액 산정 (상품 DB 🔍 연결)
                  </span>
                  <button
                    type="button"
                    onClick={addLineItem}
                    style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', padding: '0 10px', height: '24px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    ➕ 제품 추가
                  </button>
                </div>

                <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1', color: '#475569' }}>
                        <th style={{ padding: '4px 6px', width: '25px', textAlign: 'center' }}>#</th>
                        <th style={{ padding: '4px 6px', minWidth: '140px' }}>품명 (🔍상품DB) *</th>
                        <th style={{ padding: '4px 6px', minWidth: '120px' }}>규격</th>
                        <th style={{ padding: '4px 6px', width: '55px', textAlign: 'center' }}>단위</th>
                        <th style={{ padding: '4px 6px', width: '65px', textAlign: 'center' }}>수량 *</th>
                        <th style={{ padding: '4px 6px', width: '85px', textAlign: 'right' }}>매입 단가</th>
                        <th style={{ padding: '4px 6px', width: '65px', textAlign: 'right' }}>마진율(%)</th>
                        <th style={{ padding: '4px 6px', width: '85px', textAlign: 'right' }}>매출 단가 *</th>
                        <th style={{ padding: '4px 6px', width: '95px', textAlign: 'right' }}>금액 (원)</th>
                        <th style={{ padding: '4px 6px', minWidth: '80px' }}>비고</th>
                        <th style={{ padding: '4px 6px', width: '35px', textAlign: 'center' }}>삭제</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={item.id || idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '4px', textAlign: 'center', fontWeight: 700, color: '#64748b' }}>{idx + 1}</td>
                          <td style={{ padding: '4px' }}>
                            <div style={{ display: 'flex', gap: '3px' }}>
                              <input
                                type="text"
                                required
                                placeholder="품명 입력 또는 🔍"
                                value={item.productName}
                                onChange={e => updateLineItem(idx, 'productName', e.target.value)}
                                style={{ flex: 1, height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 6px', fontSize: '11.5px', fontWeight: 600, boxSizing: 'border-box' }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveItemIndexForProduct(idx);
                                  setShowProductSearchModal(true);
                                }}
                                title="상품 DB 서브창 검색"
                                style={{ height: '26px', padding: '0 5px', background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 800, color: '#1d4ed8' }}
                              >
                                🔍
                              </button>
                            </div>
                          </td>
                          <td style={{ padding: '4px' }}>
                            <input
                              type="text"
                              placeholder="예: PE Mesh"
                              value={item.spec || ''}
                              onChange={e => updateLineItem(idx, 'spec', e.target.value)}
                              style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 6px', fontSize: '11.5px', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '4px' }}>
                            <input
                              type="text"
                              value={item.unit || 'KG'}
                              onChange={e => updateLineItem(idx, 'unit', e.target.value)}
                              style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', textAlign: 'center', fontSize: '11.5px', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '4px' }}>
                            <input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={e => updateLineItem(idx, 'quantity', Number(e.target.value))}
                              style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', textAlign: 'center', fontSize: '11.5px', fontWeight: 700, boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '4px' }}>
                            <input
                              type="number"
                              step={10}
                              placeholder="0"
                              value={item.buyingUnitPrice || ''}
                              onChange={e => updateLineItem(idx, 'buyingUnitPrice', Number(e.target.value))}
                              style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', textAlign: 'right', padding: '0 6px', fontSize: '11.5px', color: '#64748b', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '4px' }}>
                            <input
                              type="number"
                              step={0.5}
                              value={item.targetMarginRate ?? ''}
                              onChange={e => updateLineItem(idx, 'targetMarginRate', Number(e.target.value))}
                              style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', textAlign: 'right', padding: '0 4px', fontSize: '11.5px', color: '#10b981', fontWeight: 700, boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '4px' }}>
                            <input
                              type="number"
                              step={10}
                              value={item.salesUnitPrice || ''}
                              onChange={e => updateLineItem(idx, 'salesUnitPrice', Number(e.target.value))}
                              style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', textAlign: 'right', padding: '0 6px', fontSize: '11.5px', fontWeight: 800, color: '#2563eb', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '4px', textAlign: 'right', fontWeight: 800, color: '#1e293b' }}>
                            ₩{(item.salesAmount || 0).toLocaleString()}
                          </td>
                          <td style={{ padding: '4px' }}>
                            <input
                              type="text"
                              placeholder="비고"
                              value={item.note || ''}
                              onChange={e => updateLineItem(idx, 'note', e.target.value)}
                              style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 6px', fontSize: '11.5px', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '4px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => removeLineItem(idx)}
                              style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '4px', width: '20px', height: '20px', cursor: 'pointer', fontWeight: 800, fontSize: '11px' }}
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#f8fafc', fontWeight: 800, borderTop: '1px solid #cbd5e1' }}>
                        <td colSpan={5} style={{ padding: '6px 8px', color: '#1e293b' }}>총 합계</td>
                        <td style={{ padding: '6px', textAlign: 'right', color: '#64748b' }}>₩{totals.expectedBuyingAmount.toLocaleString()}</td>
                        <td style={{ padding: '6px', textAlign: 'right', color: '#10b981' }}>{totals.marginRate}%</td>
                        <td colSpan={2} style={{ padding: '6px', textAlign: 'right', color: '#2563eb', fontSize: '13px' }}>₩{totals.salesAmount.toLocaleString()}</td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Section 3: Terms & Footer details */}
              <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '4px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#1e293b' }}>3. 일반사항 & 결제 조건 및 담당자 (직원 DB 연동)</span>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                      ※ 특고사항
                    </label>
                    <input
                      type="text"
                      placeholder="예: 안산 도착도, 납기 4월 15일"
                      value={specialNotes}
                      onChange={e => setSpecialNotes(e.target.value)}
                      style={{ height: '30px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 8px', fontSize: '12px', fontWeight: 600, color: '#1e293b', outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                      1. 부가가치세 (VAT) 조건
                    </label>
                    <input
                      type="text"
                      value={vatType}
                      onChange={e => setVatType(e.target.value)}
                      style={{ height: '30px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 8px', fontSize: '12px', fontWeight: 600, color: '#1e293b', outline: 'none' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                      2. 결제 조건
                    </label>
                    <input
                      type="text"
                      value={paymentTerms}
                      onChange={e => setPaymentTerms(e.target.value)}
                      style={{ height: '30px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 8px', fontSize: '12px', fontWeight: 600, color: '#1e293b', outline: 'none' }}
                    />
                  </div>

                  {/* Manager fields connected to Users DB */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.5fr', gap: '6px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>담당자 성명</label>
                        <select
                          onChange={e => e.target.value && handleSelectManagerFromDb(e.target.value)}
                          style={{ fontSize: '10px', border: 'none', background: 'none', color: '#2563eb', fontWeight: 800, cursor: 'pointer', outline: 'none' }}
                        >
                          <option value="">👤 DB선택...</option>
                          {dbUsers.map(u => (
                            <option key={u.id} value={u.name}>{u.name} ({u.position || u.role})</option>
                          ))}
                        </select>
                      </div>
                      <input
                        type="text"
                        list="user-db-list"
                        placeholder="이한중"
                        value={managerName}
                        onChange={e => handleSelectManagerFromDb(e.target.value)}
                        style={{ height: '30px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 6px', fontSize: '12px', fontWeight: 700 }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>직책</label>
                      <input type="text" value={managerTitle} onChange={e => setManagerTitle(e.target.value)} style={{ height: '30px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 6px', fontSize: '12px', fontWeight: 600 }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>연락처</label>
                      <input type="text" value={managerContact} onChange={e => setManagerContact(e.target.value)} style={{ height: '30px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 6px', fontSize: '12px', fontWeight: 600 }} />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>세금계산서 발행</label>
                    <select
                      value={taxInvoiceIssued ? 'true' : 'false'}
                      onChange={e => setTaxInvoiceIssued(e.target.value === 'true')}
                      style={{ height: '30px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 8px', fontSize: '12px', fontWeight: 700, background: '#fff', color: taxInvoiceIssued ? '#059669' : '#991b1b' }}
                    >
                      <option value="true">✅ 발행 완료</option>
                      <option value="false">❌ 미발행</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>정산 상태</label>
                    <select
                      value={status}
                      onChange={e => setStatus(e.target.value as any)}
                      style={{ height: '30px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 8px', fontSize: '12px', fontWeight: 700, background: '#fff', color: status === 'COMPLETED' ? '#059669' : '#1e293b' }}
                    >
                      <option value="COMPLETED">✅ 정산 완료</option>
                      <option value="PENDING">⏳ 정산 대기</option>
                      <option value="CANCELLED">❌ 취소</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>비고</label>
                    <input type="text" placeholder="기타 사항" value={memo} onChange={e => setMemo(e.target.value)} style={{ height: '30px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0 8px', fontSize: '12px', fontWeight: 600 }} />
                  </div>
                </div>

              </div>

              {/* Modal Buttons */}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{ height: '32px', padding: '0 14px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12.5px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{ height: '32px', padding: '0 18px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#2563eb'}
                  onMouseLeave={e => e.currentTarget.style.background = '#3b82f6'}
                >
                  {isSubmitting ? '저장 중...' : editingItem ? '주문 수정 저장' : '신규 주문 등록'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* 🖨️ Order Print Preview Modal */}
      {previewItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '4px', border: '1px solid #cbd5e1', width: '100%', maxWidth: '850px', maxHeight: '95vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            
            {/* Modal Header Bar */}
            <div className="no-print" style={{ background: '#1e293b', color: '#fff', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px', fontWeight: 800 }}>📄 국내 주문서 인쇄 / 미리보기</span>
                <span style={{ fontSize: '12px', background: '#3b82f6', padding: '2px 8px', borderRadius: '4px' }}>{previewItem.tradeNo}</span>
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

            {/* Print Area */}
            <div style={{ padding: '30px', overflowY: 'auto', background: '#fff' }}>
              <div id="order-print-area" style={{ border: '2px solid #1e293b', padding: '24px', background: '#fff', fontFamily: '"Malgun Gothic", Dotum, sans-serif', color: '#000' }}>
                
                {/* Title */}
                <h1 style={{ textAlign: 'center', fontSize: '28px', fontWeight: 900, letterSpacing: '12px', margin: '0 0 20px 0', borderBottom: '2px solid #000', paddingBottom: '10px' }}>
                  주 문 서
                </h1>

                {/* Top Grid Info */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                  
                  {/* Left: Customer Info */}
                  <div style={{ border: '1px solid #000', padding: '12px', fontSize: '13px', lineHeight: '1.8' }}>
                    <div><strong>주문번호 :</strong> {previewItem.tradeNo}</div>
                    {previewItem.quoteNo && <div><strong>견적번호 :</strong> {previewItem.quoteNo}</div>}
                    <div><strong>일 자 :</strong> {previewItem.tradeDate}</div>
                    <div><strong>수 신 :</strong> <span style={{ fontSize: '15px', fontWeight: 800 }}>{previewItem.customerName}</span></div>
                    {previewItem.receiverAttention && <div><strong>참 조 :</strong> {previewItem.receiverAttention}</div>}
                    {previewItem.receiverTel && <div><strong>전화번호 :</strong> {previewItem.receiverTel}</div>}
                    {previewItem.receiverFax && <div><strong>F A X :</strong> {previewItem.receiverFax}</div>}
                    <div style={{ marginTop: '8px', fontWeight: 700 }}>하기와 같이 주문합니다.</div>
                  </div>

                  {/* Right: YSACC / YS Company Stamp Info */}
                  <div style={{ border: '1px solid #000', padding: '12px', fontSize: '12.5px', lineHeight: '1.6', position: 'relative' }}>
                    <div style={{ fontWeight: 700, color: '#1e293b' }}>▣ 취급품목 : {previewItem.specialNotes || 'S.M.C 관련 품목, 물탱크 관련 부자재'}</div>
                    <div style={{ marginTop: '8px', fontSize: '16px', fontWeight: 900 }}>
                      {previewItem.companyType === 'YS' ? '영성ACC' : '(주)와이에스에이씨씨'}
                    </div>
                    <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span><strong>대 표 :</strong> 김 주 한</span>
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
                        <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>₩ {Math.round(previewItem.salesAmount / (previewItem.quantity || 1)).toLocaleString()}</td>
                        <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right', fontWeight: 800 }}>₩ {previewItem.salesAmount.toLocaleString()}</td>
                        <td style={{ border: '1px solid #000', padding: '8px' }}>-</td>
                      </tr>
                    )}
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
                      <td style={{ border: '1px solid #000', padding: '10px', textAlign: 'right', fontSize: '15px', color: '#1e293b' }}>₩ {previewItem.salesAmount.toLocaleString()}</td>
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
                      담당자
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

      {/* 📑 Transaction Statement (거래명세표) Print Preview Modal */}
      {statementItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '4px', border: '1px solid #cbd5e1', width: '100%', maxWidth: '880px', maxHeight: '95vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            
            {/* Modal Header Bar */}
            <div className="no-print" style={{ background: '#065f46', color: '#fff', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px', fontWeight: 800 }}>📑 거래명세표 (Transaction Statement) 미리보기</span>
                <span style={{ fontSize: '12px', background: '#10b981', padding: '2px 8px', borderRadius: '4px' }}>{statementItem.tradeNo}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => window.print()}
                  style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', padding: '0 16px', height: '32px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}
                >
                  🖨️ 즉시 인쇄 / PDF 저장
                </button>
                <button
                  onClick={() => setStatementItem(null)}
                  style={{ background: '#475569', color: '#fff', border: 'none', borderRadius: '4px', padding: '0 12px', height: '32px', fontSize: '13px', cursor: 'pointer' }}
                >
                  닫기
                </button>
              </div>
            </div>

            {/* Print Area */}
            <div style={{ padding: '30px', overflowY: 'auto', background: '#fff' }}>
              <div id="statement-print-area" style={{ border: '2px solid #065f46', padding: '24px', background: '#fff', fontFamily: '"Malgun Gothic", Dotum, sans-serif', color: '#000' }}>
                
                {/* Header Title */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #065f46', paddingBottom: '8px', marginBottom: '16px' }}>
                  <h1 style={{ fontSize: '26px', fontWeight: 900, letterSpacing: '8px', margin: 0, color: '#065f46' }}>
                    거 래 명 세 표
                  </h1>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>
                    (공급받는자 보관용 / 공급자 보관용)
                  </div>
                </div>

                {/* Top Info Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                  
                  {/* Customer Box (공급받는자) */}
                  <div style={{ border: '1px solid #000', padding: '10px', fontSize: '12.5px', lineHeight: '1.7' }}>
                    <div style={{ background: '#f0fdf4', padding: '2px 6px', fontWeight: 900, marginBottom: '6px', borderBottom: '1px solid #000', color: '#065f46' }}>
                      [ 공급받는자 ]
                    </div>
                    <div><strong>거래일자 :</strong> {statementItem.tradeDate}</div>
                    <div><strong>주문번호 :</strong> {statementItem.tradeNo}</div>
                    <div><strong>상 호 명 :</strong> <span style={{ fontSize: '14px', fontWeight: 800 }}>{statementItem.customerName}</span></div>
                    {statementItem.receiverAttention && <div><strong>담당/참조 :</strong> {statementItem.receiverAttention}</div>}
                    {statementItem.receiverTel && <div><strong>전화번호 :</strong> {statementItem.receiverTel}</div>}
                    <div style={{ marginTop: '6px', fontWeight: 700 }}>아래와 같이 정히 거래(납품)하였음을 명세합니다.</div>
                  </div>

                  {/* Supplier Box (공급자 - 자사) */}
                  <div style={{ border: '1px solid #000', padding: '10px', fontSize: '12px', lineHeight: '1.6', position: 'relative' }}>
                    <div style={{ background: '#f0fdf4', padding: '2px 6px', fontWeight: 900, marginBottom: '6px', borderBottom: '1px solid #000', color: '#065f46' }}>
                      [ 공 급 자 ]
                    </div>
                    <div><strong>등록번호 :</strong> 879-81-01648</div>
                    <div><strong>상 호 명 :</strong> <span style={{ fontSize: '14px', fontWeight: 900 }}>{statementItem.companyType === 'YS' ? '영성ACC' : '(주)와이에스에이씨씨'}</span></div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span><strong>대 표 자 :</strong> 김 주 한</span>
                      <div style={{ width: '42px', height: '42px', border: '2px solid #dc2626', color: '#dc2626', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 900, transform: 'rotate(-10deg)' }}>
                        (인)
                      </div>
                    </div>
                    <div><strong>사업장 주소 :</strong> 충북 청주시 서원구 성봉로 180, 302호</div>
                    <div><strong>TEL / FAX :</strong> 070-4141-2927 / 0303-3444-1130</div>
                  </div>

                </div>

                {/* Line Items Table */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '16px', border: '1px solid #000' }}>
                  <thead>
                    <tr style={{ background: '#f0fdf4', borderBottom: '1px solid #000' }}>
                      <th style={{ border: '1px solid #000', padding: '6px', width: '30px', textAlign: 'center' }}>No</th>
                      <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'left' }}>품 명</th>
                      <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'left' }}>규 격</th>
                      <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'center', width: '55px' }}>단위</th>
                      <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'center', width: '65px' }}>수량</th>
                      <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'right', width: '90px' }}>단 가</th>
                      <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'right', width: '105px' }}>공급가액</th>
                      <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'right', width: '90px' }}>세 액(VAT)</th>
                      <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'left', width: '80px' }}>비 고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statementItem.items && statementItem.items.length > 0 ? (
                      statementItem.items.map((it, idx) => {
                        const vat = Math.round(it.salesAmount * 0.1);
                        return (
                          <tr key={it.id || idx}>
                            <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>{idx + 1}</td>
                            <td style={{ border: '1px solid #000', padding: '6px', fontWeight: 800 }}>{it.productName}</td>
                            <td style={{ border: '1px solid #000', padding: '6px' }}>{it.spec || '-'}</td>
                            <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>{it.unit || 'KG'}</td>
                            <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center', fontWeight: 700 }}>{it.quantity.toLocaleString()}</td>
                            <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>₩ {it.salesUnitPrice.toLocaleString()}</td>
                            <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right', fontWeight: 800 }}>₩ {it.salesAmount.toLocaleString()}</td>
                            <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right', color: '#059669' }}>₩ {vat.toLocaleString()}</td>
                            <td style={{ border: '1px solid #000', padding: '6px' }}>{it.note || '-'}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>1</td>
                        <td style={{ border: '1px solid #000', padding: '6px', fontWeight: 800 }}>{statementItem.productName}</td>
                        <td style={{ border: '1px solid #000', padding: '6px' }}>-</td>
                        <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>EA</td>
                        <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>{statementItem.quantity || 1}</td>
                        <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>₩ {Math.round(statementItem.salesAmount / (statementItem.quantity || 1)).toLocaleString()}</td>
                        <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right', fontWeight: 800 }}>₩ {statementItem.salesAmount.toLocaleString()}</td>
                        <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right', color: '#059669' }}>₩ {Math.round(statementItem.salesAmount * 0.1).toLocaleString()}</td>
                        <td style={{ border: '1px solid #000', padding: '6px' }}>-</td>
                      </tr>
                    )}
                    {Array.from({ length: Math.max(0, 4 - (statementItem.items?.length || 1)) }).map((_, i) => (
                      <tr key={`empty-${i}`}>
                        <td style={{ border: '1px solid #000', padding: '10px' }}>&nbsp;</td>
                        <td style={{ border: '1px solid #000', padding: '10px' }} />
                        <td style={{ border: '1px solid #000', padding: '10px' }} />
                        <td style={{ border: '1px solid #000', padding: '10px' }} />
                        <td style={{ border: '1px solid #000', padding: '10px' }} />
                        <td style={{ border: '1px solid #000', padding: '10px' }} />
                        <td style={{ border: '1px solid #000', padding: '10px' }} />
                        <td style={{ border: '1px solid #000', padding: '10px' }} />
                        <td style={{ border: '1px solid #000', padding: '10px' }} />
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    {(() => {
                      const totalSupply = statementItem.salesAmount || 0;
                      const totalVat = Math.round(totalSupply * 0.1);
                      const grandTotal = totalSupply + totalVat;
                      return (
                        <tr style={{ background: '#f0fdf4', fontWeight: 800 }}>
                          <td colSpan={6} style={{ border: '1px solid #000', padding: '8px', textAlign: 'center', fontSize: '13px' }}>
                            합 계 ( 공급가액: ₩{totalSupply.toLocaleString()} + 세액: ₩{totalVat.toLocaleString()} )
                          </td>
                          <td colSpan={3} style={{ border: '1px solid #000', padding: '8px', textAlign: 'right', fontSize: '14px', color: '#166534' }}>
                            총 합계금액: ₩ {grandTotal.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })()}
                  </tfoot>
                </table>

                {/* Footer Receipt & Signature Box */}
                <div style={{ border: '1px solid #000', padding: '12px', fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa' }}>
                  <div>
                    <strong>※ 특기사항:</strong> {statementItem.specialNotes || '납품 및 정산 관련 명세 확인'}
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '13px', color: '#1e293b' }}>
                    위 물품을 인수(정산)함 : &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; (인 / 서명)
                  </div>
                </div>

                {/* Bottom Brand */}
                <div style={{ marginTop: '16px', textAlign: 'center', borderTop: '1px solid #cbd5e1', paddingTop: '8px', fontSize: '13px', fontWeight: 900, color: '#065f46' }}>
                  {statementItem.companyType === 'YS' ? '영성ACC' : '(주)와이에스에이씨씨'}
                </div>

              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
