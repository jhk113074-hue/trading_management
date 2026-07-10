import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ImportRequest } from '../types';
import { db, COMPANY_ID } from '../firebase';
import { collection, doc, getDocs, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { SupplierSearchModal } from '../components/SupplierSearchModal';
import { CustomerSearchModal } from '../components/CustomerSearchModal';
import type { Customer } from '../types/customer';
const getSellerAbbr = (name: string): string => {
  if (!name) return 'SUP';
  const words = name.replace(/[^a-zA-Z\s]/g, '').toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length >= 3) {
    return words.slice(0, 3).map(w => w[0]).join('');
  } else if (words.length === 2) {
    return words[0][0] + words[1][0] + (words[1][1] || 'X');
  } else if (words.length === 1) {
    return words[0].slice(0, 3).padEnd(3, 'X');
  }
  return 'SUP';
};

const computePoNumber = (importCompany: string, sellerName: string, id: string): string => {
  const compPrefix = importCompany === 'YS' ? 'YS' : 'YSACC';
  const sellerAbbr = getSellerAbbr(sellerName);
  const currentYear = new Date().getFullYear().toString();
  const serial = id.slice(-2) || '01';
  return `PO-${compPrefix}-${sellerAbbr}-${currentYear}-${serial}`;
};

import { ProductSearchModal } from '../components/ProductSearchModal';
import type { Product } from '../types/product';

export const INITIAL_IMPORTS: ImportRequest[] = [];

export const Imports: React.FC<{ mode?: 'active' | 'quotes' }> = ({ mode = 'active' }) => {
  const calculateAddTotalCost = (req: Partial<ImportRequest>) => {
    const cb = req.costBreakdown || {};
    const applied = cb.appliedExchangeRate || 1450;
    const priceUsd = cb.buyingPriceUsd || 0;
    const qty = cb.buyingQty || 1;
    const totalBuyingKrw = priceUsd * applied * qty;
    
    const ftaDuty = totalBuyingKrw * ((cb.ftaTaxRate || 0) / 100);
    const antidumpDuty = totalBuyingKrw * ((cb.antiDumpingRate || 0) / 100);
    
    return totalBuyingKrw + ftaDuty + antidumpDuty + (cb.transferFee || 0) + (cb.importDeclareFee || 0) + (cb.localTransportCost || 0);
  };

  const calculateEditTotalCost = (req: Partial<ImportRequest>) => {
    const cb = req.costBreakdown || {};
    const applied = cb.appliedExchangeRate || 1450;
    const priceUsd = cb.buyingPriceUsd || 0;
    const qty = cb.buyingQty || 1;
    const totalBuyingKrw = priceUsd * applied * qty;
    
    const ftaDuty = totalBuyingKrw * ((cb.ftaTaxRate || 0) / 100);
    const antidumpDuty = totalBuyingKrw * ((cb.antiDumpingRate || 0) / 100);
    
    return totalBuyingKrw + ftaDuty + antidumpDuty + (cb.transferFee || 0) + (cb.importDeclareFee || 0) + (cb.localTransportCost || 0);
  };

  const recalculateAddCosts = (prev: Partial<ImportRequest>, nextB: any) => {
    const totalCost = calculateAddTotalCost({ ...prev, costBreakdown: nextB });
    const rate = prev.marginRate || 0;
    const marginAmount = Math.round(totalCost * (rate / 100));
    return { ...prev, costBreakdown: nextB, marginAmount, customerQuoteAmount: totalCost + marginAmount };
  };

  const recalculateEditCosts = (prev: Partial<ImportRequest>, nextB: any) => {
    const totalCost = calculateEditTotalCost({ ...prev, costBreakdown: nextB });
    const rate = prev.marginRate || 0;
    const marginAmount = Math.round(totalCost * (rate / 100));
    return { ...prev, costBreakdown: nextB, marginAmount, customerQuoteAmount: totalCost + marginAmount };
  };
  const isQuoteMode = mode === 'quotes';
  const navigate = useNavigate();
  const [importRequests, setImportRequests] = useState<ImportRequest[]>([]);

  // 📅 날짜/기간 필터링 상태 추가 (수입견적: 월별 default, 수입관리: 날짜 default)
  const [dateFilterType, setDateFilterType] = useState<string>(isQuoteMode ? 'Monthly' : 'Range');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [rangeStart, setRangeStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [rangeEnd, setRangeEnd] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10);
  });

  useEffect(() => {
    const importsRef = collection(doc(db, 'companies', COMPANY_ID), 'imports');
    const unsubscribe = onSnapshot(importsRef, (snap) => {
      if (snap.empty) {
        setImportRequests([]);
      } else {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ImportRequest));
        setImportRequests(list);
      }
    }, (error) => {
      console.error('Failed to sync imports from Firestore:', error);
    });
    return () => unsubscribe();
  }, []);

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerSelectTarget, setCustomerSelectTarget] = useState<'new' | 'edit'>('new');

  // 고객사(바이어) DB 실시간 동기화 로드
  useEffect(() => {
    const unsub = onSnapshot(collection(doc(db, 'companies', COMPANY_ID), 'customers'), (snap) => {
      setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
    });
    return () => unsub();
  }, []);
  const [products, setProducts] = useState<Product[]>([]);
  
  const loadSuppliers = async () => {
    try {
      const snap = await getDocs(collection(db, 'companies', 'YSACC', 'suppliers'));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSuppliers(list);
    } catch (err) {
      console.error("Failed to load suppliers inside Imports:", err);
    }
  };

  const loadProducts = async () => {
    try {
      const snap = await getDocs(collection(db, 'companies', 'YSACC', 'products'));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
      setProducts(list);
    } catch (err) {
      console.error("Failed to load products inside Imports:", err);
    }
  };

  useEffect(() => {
    loadSuppliers();
    loadProducts();
  }, []);

  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSupplierSearch, setShowSupplierSearch] = useState(false);
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [productSearchTargetIdx, setProductSearchTargetIdx] = useState<number | null>(null);

  // 신규 등록 폼 상태
  const [newRequest, setNewRequest] = useState<Partial<ImportRequest>>({
    itemName: '',
    transportType: 'By Sea',
    routeFrom: '',
    routeTo: '',
    manager: '김주한',
    amount: 500000,
    importCompany: 'YSACC',
    importerName: '',
    quoteNumber: '',
    finalCustomer: '',
    incoterms: 'FOB',
    paymentTerms: '100% T/T in advance',
    pol: '',
    pod: '',
    origin: 'CHINA',
    requestDate: new Date().toISOString().slice(0, 10),
    requestedBy: '',
    requestNote: '',
    piItems: [{ name: '', qty: '', unitPrice: '', amount: '', hsCode: '', unit: 'EA', palletSize: '', cbm: '', netWeight: '', grossWeight: '' }],
    supplierQuotes: [{ id: 'q1', supplierName: '', itemName: '', amount: 0, currency: 'USD', quoteDate: new Date().toISOString().slice(0, 10) }],
    costBreakdown: { 
      productCost: 0, 
      freightCost: 0, 
      customsCost: 0, 
      otherCost: 0,
      todayExchangeRate: 0,
      appliedExchangeRate: 0,
      buyingPriceUsd: 0,
      buyingQty: 0,
      ftaTaxRate: 0,
      antiDumpingRate: 0,
      transferFee: 0,
      importDeclareFee: 0,
      localTransportCost: 0
    },
    marginRate: 0,
    marginAmount: 0,
    customerQuoteAmount: 0
  });

  const resetNewRequestForm = () => {
    setNewRequest({
      itemName: '',
      transportType: 'By Sea',
      routeFrom: '',
      routeTo: '',
      manager: '김주한',
      amount: 500000,
      importCompany: 'YSACC',
      importerName: '',
      finalCustomer: '',
      incoterms: 'FOB',
      paymentTerms: '100% T/T in advance',
      pol: '',
      pod: '',
      origin: 'CHINA',
      requestDate: new Date().toISOString().slice(0, 10),
      requestedBy: '',
      requestNote: '',
      piItems: [{ name: '', qty: '', unitPrice: '', amount: '', hsCode: '', unit: 'EA', palletSize: '', cbm: '', netWeight: '', grossWeight: '' }],
      supplierQuotes: [{ id: 'q1', supplierName: '', itemName: '', amount: 0, currency: 'USD', quoteDate: new Date().toISOString().slice(0, 10) }],
      costBreakdown: { 
        productCost: 0, 
        freightCost: 0, 
        customsCost: 0, 
        otherCost: 0,
        todayExchangeRate: 0,
        appliedExchangeRate: 0,
        buyingPriceUsd: 0,
        buyingQty: 0,
        ftaTaxRate: 0,
        antiDumpingRate: 0,
        transferFee: 0,
        importDeclareFee: 0,
        localTransportCost: 0
      },
      marginRate: 0,
      marginAmount: 0,
      customerQuoteAmount: 0
    });
  };

  const saveToStorage = (data: ImportRequest[]) => {
    const prevIds = new Set(importRequests.map(r => r.id));
    const nextIds = new Set(data.map(r => r.id));
    setImportRequests(data); // 낙관적 업데이트 (Firestore onSnapshot이 곧 확정값으로 재동기화)

    prevIds.forEach(pid => {
      if (!nextIds.has(pid)) {
        deleteDoc(doc(db, 'companies', COMPANY_ID, 'imports', pid)).catch(err => {
          console.error('Failed to delete import doc:', err);
        });
      }
    });
    data.forEach(item => {
      const { id: itemId, ...rest } = item;
      setDoc(doc(db, 'companies', COMPANY_ID, 'imports', itemId), rest, { merge: true }).catch(err => {
        console.error('Failed to save import doc:', err);
      });
    });
  };

  // 모달리스 위치 및 리사이즈 상태
  const [modalPosition, setModalPosition] = useState({ x: 80, y: 35 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    // Input/Select/Button을 드래그 영역에서 제외
    const targetTag = (e.target as HTMLElement).tagName.toLowerCase();
    if (targetTag === 'input' || targetTag === 'select' || targetTag === 'button') {
      return;
    }
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - modalPosition.x,
      y: e.clientY - modalPosition.y
    });
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const nextX = Math.max(10, Math.min(window.innerWidth - 300, e.clientX - dragOffset.x));
      const nextY = Math.max(10, Math.min(window.innerHeight - 150, e.clientY - dragOffset.y));
      setModalPosition({
        x: nextX,
        y: nextY
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const handleAddRequest = (e: React.FormEvent) => {
    e.preventDefault();
    const reqId = String(Math.floor(100000 + Math.random() * 900000));
    
    // Determine overall item name from piItems if itemName not custom set
    let computedItemName = newRequest.itemName || '';
    if (!computedItemName && newRequest.piItems && newRequest.piItems.length > 0) {
      computedItemName = newRequest.piItems[0].name || '';
      if (newRequest.piItems.length > 1) {
        computedItemName += ` 외 ${newRequest.piItems.length - 1}건`;
      }
    }
    if (!computedItemName) computedItemName = '미지정 품목';

    const itemsList = (newRequest.piItems || []).map(it => ({
      ...it,
      amount: String(((Number(it.qty) || 0) * (Number(it.unitPrice) || 0)).toFixed(2))
    }));
    const totalCbm = itemsList.reduce((sum, it) => sum + (Number(it.cbm) || 0), 0);
    const totalNetWeight = itemsList.reduce((sum, it) => sum + (Number(it.netWeight) || 0), 0);
    const totalGrossWeight = itemsList.reduce((sum, it) => sum + (Number(it.grossWeight) || 0), 0);
    const totalQty = itemsList.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);

    const getSellerAbbr = (name: string): string => {
      if (!name) return 'SUP';
      const words = name.replace(/[^a-zA-Z\s]/g, '').toUpperCase().split(/\s+/).filter(Boolean);
      if (words.length >= 3) {
        return words.slice(0, 3).map(w => w[0]).join('');
      } else if (words.length === 2) {
        return words[0][0] + words[1][0] + (words[1][1] || 'X');
      } else if (words.length === 1) {
        return words[0].slice(0, 3).padEnd(3, 'X');
      }
      return 'SUP';
    };

    const compPrefix = (newRequest.importCompany === 'YS' ? 'YS' : 'YSACC');
    const sellerAbbr = getSellerAbbr(newRequest.importerName || '');
    const currentYear = new Date().getFullYear().toString();
    const serial = reqId.slice(-2) || '01';
    const generatedPo = `PO-${compPrefix}-${sellerAbbr}-${currentYear}-${serial}`;

    const currentYearStr = new Date().getFullYear().toString();
    const currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const currentDay = new Date().getDate().toString().padStart(2, '0');
    const dateStr = `${currentYearStr.slice(-2)}${currentMonth}${currentDay}`;
    const randomSerial = String(Math.floor(100 + Math.random() * 900));
    const generatedQuoteNo = `QT-${dateStr}-${randomSerial}`;

    const created: ImportRequest = {
      id: reqId,
      quoteNumber: generatedQuoteNo,
      blAwb: '-',
      poNumber: generatedPo,
      itemName: computedItemName,
      transportType: newRequest.transportType || 'By Sea',
      volume: `${totalCbm.toFixed(2)} CBM`,
      routeFrom: newRequest.pol || newRequest.routeFrom || '중국 상해항',
      routeTo: newRequest.pod || '한국 내륙',
      manager: newRequest.manager || '김주한',
      amount: (() => {
        const totalUsd = itemsList.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0);
        const appliedExchange = newRequest.costBreakdown?.appliedExchangeRate || 1450;
        return (newRequest.amount === 500000 && totalUsd > 0)
          ? Math.round(totalUsd * appliedExchange)
          : Number(newRequest.amount || 0);
      })(),
      createdAt: '26. 07. 08.',
      importCompany: newRequest.importCompany || 'YSACC',
      importerName: newRequest.importerName || '',
      finalCustomer: newRequest.finalCustomer || '',
      origin: newRequest.origin || 'CHINA',
      requestDate: newRequest.requestDate || new Date().toISOString().slice(0, 10),
      requestedBy: newRequest.requestedBy || '',
      requestNote: newRequest.requestNote || '',
      customerDecision: isQuoteMode ? '검토중' : '승인',
      status: isQuoteMode ? '진행 결정 요청' : '발주 진행',

      incoterms: newRequest.incoterms || 'FOB',
      paymentTerms: newRequest.paymentTerms || '100% T/T in advance',
      pol: newRequest.pol || '',
      pod: newRequest.pod || '',
      piItems: itemsList,
      supplierQuotes: newRequest.supplierQuotes || [],
      costBreakdown: newRequest.costBreakdown || {
        productCost: 0,
        freightCost: 0,
        customsCost: 0,
        otherCost: 0,
        todayExchangeRate: 0,
        appliedExchangeRate: 0,
        buyingPriceUsd: 0,
        buyingQty: 0,
        ftaTaxRate: 0,
        antiDumpingRate: 0,
        transferFee: 0,
        importDeclareFee: 0,
        localTransportCost: 0
      },
      marginRate: newRequest.marginRate || 0,
      marginAmount: newRequest.marginAmount || 0,
      customerQuoteAmount: newRequest.customerQuoteAmount || 0,
      
      // Default 상세
      portOfLoading: newRequest.pol || newRequest.routeFrom,
      portOfDischarge: newRequest.pod || '인천항',
      packingQty: totalQty || 1,
      packingUnit: 'PALLET',
      dimensions: itemsList[0]?.palletSize || '120*80*100(CM)',
      weight: `${totalGrossWeight}KG (Net: ${totalNetWeight}KG)`,
      dangerousCargo: '미포함',
      msdsStatus: '미포함',
      lssIncluded: '포함',
      localTransportType: '독차',
      customsAgent: '이음관세사무소',
      cargoInsurance: '미신청',
      ftaOriginCert: '미신청'
    };

    const nextList = [created, ...importRequests];
    saveToStorage(nextList);
    setShowAddModal(false);
    resetNewRequestForm();
  };

  // 수입 수정 모달 상태
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRequest, setEditingRequest] = useState<Partial<ImportRequest> | null>(null);

  const handleEditRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRequest || !editingRequest.id) return;

    let computedItemName = editingRequest.itemName || '';
    if (editingRequest.piItems && editingRequest.piItems.length > 0) {
      computedItemName = editingRequest.piItems[0].name || '';
      if (editingRequest.piItems.length > 1) {
        computedItemName += ` 외 ${editingRequest.piItems.length - 1}건`;
      }
    }
    if (!computedItemName) computedItemName = '미지정 품목';

    const itemsList = (editingRequest.piItems || []).map(it => ({
      ...it,
      amount: String(((Number(it.qty) || 0) * (Number(it.unitPrice) || 0)).toFixed(2))
    }));
    const totalCbm = itemsList.reduce((sum, it) => sum + (Number(it.cbm) || 0), 0);
    const totalNetWeight = itemsList.reduce((sum, it) => sum + (Number(it.netWeight) || 0), 0);
    const totalGrossWeight = itemsList.reduce((sum, it) => sum + (Number(it.grossWeight) || 0), 0);
    const totalQty = itemsList.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);

    const getSellerAbbr = (name: string): string => {
      if (!name) return 'SUP';
      const words = name.replace(/[^a-zA-Z\s]/g, '').toUpperCase().split(/\s+/).filter(Boolean);
      if (words.length >= 3) {
        return words.slice(0, 3).map(w => w[0]).join('');
      } else if (words.length === 2) {
        return words[0][0] + words[1][0] + (words[1][1] || 'X');
      } else if (words.length === 1) {
        return words[0].slice(0, 3).padEnd(3, 'X');
      }
      return 'SUP';
    };

    const nextList = importRequests.map(req => {
      if (req.id === editingRequest.id) {
        const compPrefix = (editingRequest.importCompany === 'YS' ? 'YS' : 'YSACC');
        const sellerAbbr = getSellerAbbr(editingRequest.importerName || req.importerName || '');
        const currentYear = new Date().getFullYear().toString();
        const serial = req.id.slice(-2) || '01';
        const generatedPo = `PO-${compPrefix}-${sellerAbbr}-${currentYear}-${serial}`;

        const totalUsd = itemsList.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0);
        const appliedExchange = editingRequest.costBreakdown?.appliedExchangeRate || req.costBreakdown?.appliedExchangeRate || 1450;
        
        return {
          ...req,
          ...editingRequest,
          poNumber: generatedPo,
          itemName: computedItemName,
          volume: `${totalCbm.toFixed(2)} CBM`,
          routeFrom: editingRequest.pol || editingRequest.routeFrom || req.routeFrom,
          routeTo: editingRequest.pod || editingRequest.routeTo || req.routeTo,
          amount: totalUsd > 0 ? Math.round(totalUsd * appliedExchange) : Number(editingRequest.amount || req.amount || 0),
          packingQty: totalQty || 1,
          weight: `${totalGrossWeight}KG (Net: ${totalNetWeight}KG)`,
          dimensions: itemsList[0]?.palletSize || req.dimensions
        } as ImportRequest;
      }
      return req;
    });

    saveToStorage(nextList);
    setShowEditModal(false);
    setEditingRequest(null);
  };

  const handleDeleteRequest = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`의뢰번호 ${id} 수입운송 건을 삭제하시겠습니까?`)) {
      const nextList = importRequests.filter(req => req.id !== id);
      saveToStorage(nextList);
    }
  };

  const filteredRequests = useMemo(() => {
    let base = isQuoteMode 
      ? importRequests.filter(req => req.customerDecision !== '승인') 
      : importRequests.filter(req => req.customerDecision === '승인');

    // 📅 날짜/기간 실필터 적용
    base = base.filter(req => {
      if (!req.requestDate) return false;
      const d = new Date(req.requestDate);
      if (isNaN(d.getTime())) return false;
      const y = d.getFullYear();
      const m = d.getMonth() + 1;

      if (dateFilterType === 'Monthly') {
        return y === selectedYear && m === selectedMonth;
      } else if (dateFilterType === 'Range') {
        if (rangeStart && req.requestDate < rangeStart) return false;
        if (rangeEnd && req.requestDate > rangeEnd) return false;
      }
      return true;
    });

    if (!searchTerm.trim()) return base;
    return base.filter(req =>
      req.itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.id.includes(searchTerm) ||
      req.routeFrom.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [importRequests, searchTerm, isQuoteMode, dateFilterType, selectedYear, selectedMonth, rangeStart, rangeEnd]);

  return (
    <div style={{ padding: '24px', background: '#f8fafc', minHeight: 'calc(100vh - 64px)', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Title Header */}
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#1e293b', margin: '0 0 6px 0' }}>{isQuoteMode ? '수입 견적관리' : '수입관리'}</h2>
        <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
          {isQuoteMode
            ? '고객사 수입요청 접수 및 해외공급사 견적/원가 산정 단계입니다. 고객이 진행을 승인하면 수입관리로 자동 이동합니다.'
            : '고객사가 진행을 승인한 수입 발주/물류/통관/정산 건 목록입니다. 견적 검토 중인 건은 수입 견적관리에서 확인하세요.'}
        </p>
      </div>

      {/* Filter panel */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '16px', borderRadius: '4px', border: '1px solid #cbd5e1', marginBottom: '20px', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flex: 1, flexWrap: 'wrap' }}>
          
          {/* 조회 기간 대분류 */}
          <select 
            value={dateFilterType}
            onChange={(e) => setDateFilterType(e.target.value)}
            style={{ padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', background: '#fff', outline: 'none', height: '34px', boxSizing: 'border-box', color: '#1e293b', cursor: 'pointer' }}
          >
            <option value="All">전체 기간</option>
            <option value="Monthly">월별 조회</option>
            <option value="Range">날짜 지정</option>
          </select>

          {/* 월별 서브 옵션 */}
          {dateFilterType === 'Monthly' && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                style={{ padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', background: '#fff', height: '34px', boxSizing: 'border-box', color: '#1e293b', cursor: 'pointer' }}
              >
                {[2024, 2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}년</option>)}
              </select>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                style={{ padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', background: '#fff', height: '34px', boxSizing: 'border-box', color: '#1e293b', cursor: 'pointer' }}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
              </select>
            </div>
          )}

          {/* 날짜 범위 서브 옵션 */}
          {dateFilterType === 'Range' && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input
                type="date"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                style={{ padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', outline: 'none', height: '34px', boxSizing: 'border-box', color: '#1e293b' }}
              />
              <span style={{ fontSize: '13px', color: '#94a3b8' }}>~</span>
              <input
                type="date"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                style={{ padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', outline: 'none', height: '34px', boxSizing: 'border-box', color: '#1e293b' }}
              />
            </div>
          )}

          <div style={{ display: 'flex', border: '1px solid #cbd5e1', borderRadius: '4px', background: '#fff', overflow: 'hidden', maxWidth: '320px', width: '100%', height: '34px', boxSizing: 'border-box' }}>
            <input 
              type="text" 
              placeholder="의뢰번호, 품명, 출발지 검색..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ border: 'none', padding: '0 12px', fontSize: '13px', outline: 'none', flex: 1, height: '100%', color: '#1e293b' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', height: '34px' }}>
          {isQuoteMode ? (
            <button
              onClick={() => { resetNewRequestForm(); setShowAddModal(true); }}
              style={{ padding: '0 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', transition: 'background 0.2s', height: '100%', display: 'flex', alignItems: 'center', boxSizing: 'border-box' }}
              onMouseEnter={e => e.currentTarget.style.background = '#2563eb'}
              onMouseLeave={e => e.currentTarget.style.background = '#3b82f6'}
            >
              신규 수입요청 등록
            </button>
          ) : (
            <button
              onClick={() => { resetNewRequestForm(); setShowAddModal(true); }}
              style={{ padding: '0 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', transition: 'background 0.2s', height: '100%', display: 'flex', alignItems: 'center', boxSizing: 'border-box' }}
              onMouseEnter={e => e.currentTarget.style.background = '#2563eb'}
              onMouseLeave={e => e.currentTarget.style.background = '#3b82f6'}
            >
              신규 수입 확정등록
            </button>
          )}
          <button 
            style={{ padding: '0 16px', background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', borderRadius: '4px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', height: '100%', display: 'flex', alignItems: 'center', boxSizing: 'border-box', transition: 'background 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
            onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}
          >
            목록 받기
          </button>
          <button 
            style={{ padding: '0 16px', background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', borderRadius: '4px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', height: '100%', display: 'flex', alignItems: 'center', boxSizing: 'border-box', transition: 'background 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
            onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}
          >
            테이블 설정
          </button>
        </div>
      </div>

      {/* Main Table Grid */}
      <div style={{ background: '#ffffff', borderRadius: '4px', border: '1px solid #cbd5e1', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1', height: '40px' }}>
              {isQuoteMode ? (
                <>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', width: '120px' }}>견적일</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', width: '150px' }}>견적번호</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', width: '160px', textAlign: 'center' }}>견적주체(YSACC/영성ACC)</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', width: '200px' }}>품명</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', width: '130px', textAlign: 'right' }}>견적가</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', width: '150px' }}>수입처</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', width: '150px' }}>최종고객</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', width: '100px', textAlign: 'center' }}>진행상태</th>
                </>
              ) : (
                <>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', width: '100px' }}>주문번호</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', width: '180px' }}>PO번호</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', width: '150px' }}>수입처</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', width: '180px' }}>품명</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', width: '160px' }}>운송내용</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', width: '140px', textAlign: 'center' }}>수입주체</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', width: '160px' }}>경로</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', width: '140px' }}>최종고객</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', width: '100px' }}>담당자</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', width: '140px', textAlign: 'right' }}>수입금액</th>
                </>
              )}
              <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', width: '70px', textAlign: 'center' }}>관리</th>
            </tr>
          </thead>
          <tbody>
            {filteredRequests.map(req => (
              <tr 
                key={req.id}
                onClick={() => {
                  if (isQuoteMode) {
                    navigate(`/imports/${req.id}?mode=quote`);
                  } else {
                    navigate(`/imports/${req.id}?mode=active`);
                  }
                }}
                style={{ borderBottom: '1px solid #cbd5e1', cursor: 'pointer', height: '64px', transition: 'background 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
              >
                {isQuoteMode ? (
                  <>
                    {/* 견적일 */}
                    <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: 600, color: '#475569' }}>
                      {req.requestDate || req.createdAt || '-'}
                    </td>

                    {/* 견적번호 */}
                    <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                      {req.quoteNumber || `QT-${req.id}`}
                    </td>

                    {/* 견적주체(YSACC/영성ACC) */}
                    <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, color: (req.importCompany === 'YSACC' || req.importCompany === 'YS') ? '#15803d' : '#0369a1', background: (req.importCompany === 'YSACC' || req.importCompany === 'YS') ? '#dcfce7' : '#e0f2fe' }}>
                        {(req.importCompany === 'YSACC' || req.importCompany === 'YS') ? 'YSACC' : '영성ACC'}
                      </span>
                    </td>

                    {/* 품명 */}
                    <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                      {req.itemName}
                    </td>

                    {/* 견적가 */}
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                      <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#1e293b' }}>
                        ₩{(req.customerQuoteAmount || 0).toLocaleString()}
                      </span>
                    </td>

                    {/* 수입처 */}
                    <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: 600, color: '#475569' }}>
                      {req.importerName || '-'}
                    </td>

                    {/* 최종고객 */}
                    <td style={{ padding: '10px 16px', fontSize: '12.5px', color: '#475569', fontWeight: 500 }}>
                      {req.finalCustomer || '-'}
                    </td>

                    {/* 진행상태 */}
                    <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                      {(() => {
                        const decision = req.customerDecision || '검토중';
                        const colorMap: Record<string, { bg: string; color: string }> = {
                          '검토중': { bg: '#fef3c7', color: '#b45309' },
                          '승인': { bg: '#dcfce7', color: '#15803d' },
                          '보류': { bg: '#f1f5f9', color: '#64748b' },
                          '거절': { bg: '#fee2e2', color: '#dc2626' }
                        };
                        const c = colorMap[decision] || colorMap['검토중'];
                        return (
                          <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, background: c.bg, color: c.color }}>
                            {decision}
                          </span>
                        );
                      })()}
                    </td>
                  </>
                ) : (
                  <>
                    {/* 주문번호 */}
                    <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: 700, color: '#64748b' }}>
                      {req.id}
                    </td>

                    {/* PO번호 */}
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>
                        {req.poNumber && req.poNumber !== '-' ? req.poNumber : '-'}
                      </span>
                    </td>
                    
                    {/* 수입처 */}
                    <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: 600, color: '#475569' }}>
                      {req.importerName || req.shipperName || '-'}
                    </td>

                    {/* 품명 */}
                    <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                      {req.itemName}
                    </td>

                    {/* 운송내용 */}
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#475569' }}>{req.transportType}</span>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>{req.volume}</span>
                      </div>
                    </td>

                    {/* 수입주체 */}
                    <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                      {req.importCompany ? (
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, color: req.importCompany === 'YS' ? '#0369a1' : '#15803d', background: req.importCompany === 'YS' ? '#e0f2fe' : '#dcfce7' }}>
                          {req.importCompany}
                        </span>
                      ) : '-'}
                    </td>

                    {/* 경로 */}
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', gap: '2px', flexDirection: 'column', fontSize: '12.5px', color: '#475569', fontWeight: 600 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          📍 {req.routeFrom} ➔
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#64748b' }}>
                          ⚓ {req.routeTo}
                        </span>
                      </div>
                    </td>

                    {/* 최종고객 */}
                    <td style={{ padding: '10px 16px', fontSize: '12.5px', color: '#475569', fontWeight: 500 }}>
                      {req.finalCustomer || '-'}
                    </td>

                    {/* 담당자 */}
                    <td style={{ padding: '10px 16px', fontSize: '12.5px', fontWeight: 600, color: '#475569' }}>
                      {req.manager}
                    </td>

                    {/* 수입금액 */}
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                      <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#1e293b' }}>
                        ₩{req.amount.toLocaleString()}
                      </span>
                    </td>
                  </>
                )}

                {/* 관리 (수정 및 삭제 버튼) */}
                <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingRequest(JSON.parse(JSON.stringify(req)));
                        setShowEditModal(true);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#3b82f6',
                        fontSize: '15px',
                        cursor: 'pointer',
                        padding: '4px',
                        borderRadius: '4px',
                        fontWeight: 'bold'
                      }}
                      title="의뢰 수정"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={(e) => handleDeleteRequest(req.id, e)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ef4444',
                        fontSize: '16px',
                        cursor: 'pointer',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        transition: 'background 0.2s',
                        fontWeight: 'bold'
                      }}
                      title="의뢰 삭제"
                      onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Modal (Modalless & Resizeable/Draggable Window) */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10009, pointerEvents: 'none' }}>
          <div style={{
            position: 'absolute',
            left: `${modalPosition.x}px`,
            top: `${modalPosition.y}px`,
            background: '#fff',
            borderRadius: '12px',
            width: '1240px',
            minWidth: '600px',
            maxWidth: '98vw',
            height: '85vh',
            maxHeight: '90vh',
            padding: '16px 20px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15), 0 0 1px 1px rgba(0,0,0,0.2)',
            boxSizing: 'border-box',
            pointerEvents: 'auto',
            resize: 'both',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div 
              onMouseDown={handleHeaderMouseDown}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px', cursor: 'move', userSelect: 'none' }}
            >
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>신규수입등록 📌 <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>(헤더를 잡고 드래그 이동 / 우측하단 드래그로 크기조절 가능)</span></h3>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>
            
            <form onSubmit={handleAddRequest} style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, overflowY: 'auto', paddingRight: '6px' }}>
              {/* 📥 신규수입등록 초소형 접수 정보 그리드 (2줄 압축형) */}
              <div style={{ background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
                
                {/* 1줄: 기본 수신/접수 메타 정보 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr 1.8fr', gap: '10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>📅 요청 접수일</label>
                    <input
                      type="date"
                      value={newRequest.requestDate || ''}
                      onChange={e => setNewRequest(p => ({ ...p, requestDate: e.target.value }))}
                      style={{ padding: '5px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12px', outline: 'none', background: '#fff' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>고객사 담당자</label>
                    <input
                      type="text"
                      value={newRequest.requestedBy || ''}
                      onChange={e => setNewRequest(p => ({ ...p, requestedBy: e.target.value }))}
                      placeholder="예: 홍길동 과장"
                      style={{ padding: '5px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12px', outline: 'none', background: '#fff' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>수입주체 구분</label>
                    <select 
                      value={newRequest.importCompany || 'YSACC'} 
                      onChange={e => {
                        const comp = e.target.value as any;
                        setNewRequest(p => {
                          const tempId = p.id || Math.floor(100000 + Math.random() * 900000).toString();
                          const nextQuoteNo = `QT-${comp}-${new Date().toISOString().slice(2,10).replace(/-/g,'')}-${tempId.slice(-3)}`;
                          return { ...p, importCompany: comp, quoteNumber: nextQuoteNo, id: tempId };
                        });
                      }}
                      style={{ padding: '5px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12px', outline: 'none', background: '#fff' }}
                    >
                      <option value="YSACC">YSACC</option>
                      <option value="YS">YS (영성ACC)</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>최종고객 (고객사 DB 연계)</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input 
                        type="text" 
                        readOnly
                        value={newRequest.finalCustomer || ''} 
                        style={{ flex: 1, padding: '5px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12px', outline: 'none', background: '#e2e8f0', color: '#334155' }}
                        placeholder="우측 [검색] 지정"
                      />
                      <button
                        type="button"
                        onClick={() => { setCustomerSelectTarget('new'); setShowCustomerModal(true); }}
                        style={{ padding: '5px 10px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        🔍 검색
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2줄: 공급업체 연결 및 고객 제시용 견적번호 단일화 */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr', gap: '10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>🤝 수입처 (공급업체관리 연결)</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input 
                        type="text"
                        readOnly
                        required
                        placeholder="우측 [검색] 버튼을 눌러 공급업체 선택"
                        value={newRequest.importerName || ''}
                        style={{ flex: 1, padding: '5px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12px', outline: 'none', background: '#e2e8f0', color: '#334155', fontWeight: 600 }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSupplierSearch(true)}
                        style={{ padding: '5px 10px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        🔍 검색
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>📄 고객 제시용 견적번호 (자동생성/수정가능)</label>
                    <input 
                      type="text" 
                      required
                      value={newRequest.quoteNumber || ''} 
                      onChange={e => setNewRequest(p => ({ ...p, quoteNumber: e.target.value }))}
                      style={{ padding: '5px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12px', outline: 'none' }}
                      placeholder="예: QT-YSACC-20260709-001"
                    />
                  </div>
                </div>

                {/* 3줄: 요청 상세 메모 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>📝 요청 내용 메모</label>
                  <input
                    type="text"
                    value={newRequest.requestNote || ''}
                    onChange={e => setNewRequest(p => ({ ...p, requestNote: e.target.value }))}
                    placeholder="고객사로부터 받은 수입요청 내용 요약"
                    style={{ padding: '5px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12px', outline: 'none', background: '#fff' }}
                  />
                </div>
              </div>

              {/* 수입 실무에 필요한 무역정보 세팅 영역 (실무모드일 경우에만 표시) */}
              {!isQuoteMode && (
                <div style={{ background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>INCOTERMS</label>
                      <select 
                        value={newRequest.incoterms || 'FOB'} 
                        onChange={e => setNewRequest(p => ({ ...p, incoterms: e.target.value }))}
                        style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none', background: '#fff' }}
                      >
                        <option value="FOB">FOB</option>
                        <option value="FCA">FCA</option>
                        <option value="EXW">EXW</option>
                        <option value="CIF">CIF</option>
                        <option value="CFR">CFR</option>
                        <option value="DDP">DDP</option>
                        <option value="DAP">DAP</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>B/L (AWB) 번호</label>
                      <input 
                        type="text" 
                        value={newRequest.blAwb || ''} 
                        onChange={e => setNewRequest(p => ({ ...p, blAwb: e.target.value }))}
                        style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                        placeholder="예: B/L 번호 직접 입력"
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>운송수단</label>
                      <select 
                        value={newRequest.transportType || 'By Sea'} 
                        onChange={e => setNewRequest(p => ({ ...p, transportType: e.target.value }))}
                        style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none', background: '#fff' }}
                      >
                        <option value="By Sea">By Sea</option>
                        <option value="By Air">By Air</option>
                        <option value="By courier">By courier</option>
                      </select>
                    </div>
                  </div>

                  {/* PAYMENT TERMS & 운송수단 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px', marginTop: '8px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>PAYMENT TERMS</label>
                      <input 
                        type="text" 
                        value={newRequest.paymentTerms || ''} 
                        onChange={e => setNewRequest(p => ({ ...p, paymentTerms: e.target.value }))}
                        style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                        placeholder="예: 100% T/T in advance"
                      />
                    </div>
                  </div>

                  {/* 출발PORT & 도착PORT & 원산지 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginTop: '8px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>출발 PORT</label>
                      <input 
                        type="text" 
                        required={!isQuoteMode}
                        value={newRequest.pol || ''} 
                        onChange={e => setNewRequest(p => ({ ...p, pol: e.target.value }))}
                        style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                        placeholder="예: SHANGHAI PORT, CHINA"
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>도착 PORT</label>
                      <input 
                        type="text" 
                        required={!isQuoteMode}
                        value={newRequest.pod || ''} 
                        onChange={e => setNewRequest(p => ({ ...p, pod: e.target.value }))}
                        style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                        placeholder="예: INCHEON PORT, KOREA"
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>원산지 (Origin)</label>
                      <input 
                        type="text" 
                        required={!isQuoteMode}
                        value={newRequest.origin || 'CHINA'} 
                        onChange={e => setNewRequest(p => ({ ...p, origin: e.target.value }))}
                        style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                        placeholder="예: CHINA, KOREA"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 4. 동적 통합 수입 제품 및 패킹 테이블 */}
              <div style={{ border: '1px solid var(--border-default)', borderRadius: '8px', padding: '12px', background: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>📦 수입 제품 및 패킹 명세 목록</span>
                  <button 
                    type="button" 
                    onClick={() => setNewRequest(p => ({ ...p, piItems: [...(p.piItems || []), { name: '', qty: '', unitPrice: '', amount: '', hsCode: '', unit: 'EA', palletSize: '', cbm: '', netWeight: '', grossWeight: '' }] }))}
                    style={{ padding: '2px 8px', border: '1px solid #2563eb', borderRadius: '4px', background: '#fff', color: '#2563eb', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    ＋ 항목 추가
                  </button>
                </div>
                
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', minWidth: '1000px' }}>
                    <thead>
                      <tr style={{ background: 'var(--border-color)', borderBottom: '1px solid var(--border-default)', height: '30px' }}>
                        <th style={{ padding: '4px', width: '30px', textAlign: 'center' }}>No</th>
                        <th style={{ padding: '4px', textAlign: 'left', minWidth: '180px' }}>DESCRIPTION OF COMMODITY</th>
                        <th style={{ padding: '4px', width: '90px' }}>HS CODE</th>
                        <th style={{ padding: '4px', width: '70px', textAlign: 'right' }}>QTY</th>
                        <th style={{ padding: '4px', width: '50px', textAlign: 'center' }}>UNIT</th>
                        <th style={{ padding: '4px', width: '80px', textAlign: 'right' }}>U.PRICE</th>
                        <th style={{ padding: '4px', width: '90px', textAlign: 'right' }}>TOTAL AMOUNT</th>
                        <th style={{ padding: '4px', width: '130px' }}>PALLET SIZE</th>
                        <th style={{ padding: '4px', width: '70px', textAlign: 'right' }}>CBM</th>
                        <th style={{ padding: '4px', width: '80px', textAlign: 'right' }}>N.WT (KG)</th>
                        <th style={{ padding: '4px', width: '80px', textAlign: 'right' }}>G.WT (KG)</th>
                        <th style={{ padding: '4px', width: '30px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(newRequest.piItems || []).map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '4px', textAlign: 'center', fontWeight: 'bold' }}>{idx + 1}</td>
                          <td style={{ padding: '4px' }}>
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              <input 
                                type="text" 
                                value={item.name} 
                                onChange={e => {
                                  const val = e.target.value;
                                  setNewRequest(p => {
                                    const next = [...(p.piItems || [])];
                                    next[idx] = { ...next[idx], name: val };
                                    return { ...p, piItems: next };
                                  });
                                }}
                                style={{ flex: 1, padding: '3px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '11px', outline: 'none', boxSizing: 'border-box' }}
                                placeholder="예: E-GLASS SURFACE TISSUE"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setProductSearchTargetIdx(idx);
                                  setShowProductSearch(true);
                                }}
                                style={{ padding: '3px 6px', background: 'var(--border-color)', border: '1px solid var(--border-default)', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                                title="상품 DB에서 가져오기"
                              >
                                🔍
                              </button>
                            </div>
                          </td>
                          <td style={{ padding: '4px' }}>
                            <input 
                              type="text" 
                              value={item.hsCode || ''} 
                              onChange={e => {
                                const val = e.target.value;
                                setNewRequest(p => {
                                  const next = [...(p.piItems || [])];
                                  next[idx] = { ...next[idx], hsCode: val };
                                  return { ...p, piItems: next };
                                });
                              }}
                              style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '11px', outline: 'none', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '4px' }}>
                            <input 
                              type="text" 
                              value={item.qty} 
                              onChange={e => {
                                const val = e.target.value;
                                setNewRequest(p => {
                                  const next = [...(p.piItems || [])];
                                  next[idx] = { ...next[idx], qty: val };
                                  return { ...p, piItems: next };
                                });
                              }}
                              style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '11px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '4px' }}>
                            <input 
                              type="text" 
                              value={item.unit || 'EA'} 
                              onChange={e => {
                                const val = e.target.value;
                                setNewRequest(p => {
                                  const next = [...(p.piItems || [])];
                                  next[idx] = { ...next[idx], unit: val };
                                  return { ...p, piItems: next };
                                });
                              }}
                              style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '11px', outline: 'none', textAlign: 'center', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '4px' }}>
                            <input 
                              type="text" 
                              value={item.unitPrice} 
                              onChange={e => {
                                const val = e.target.value;
                                setNewRequest(p => {
                                  const next = [...(p.piItems || [])];
                                  next[idx] = { ...next[idx], unitPrice: val };
                                  return { ...p, piItems: next };
                                });
                              }}
                              style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '11px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '4px' }}>
                            <input 
                              type="text" 
                              readOnly
                              value={
                                ((Number(item.qty) || 0) * (Number(item.unitPrice) || 0))
                                  ? String(((Number(item.qty) || 0) * (Number(item.unitPrice) || 0)).toFixed(2))
                                  : ''
                              } 
                              style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '11px', outline: 'none', textAlign: 'right', boxSizing: 'border-box', background: '#f1f5f9', color: 'var(--text-secondary)', fontWeight: 'bold' }}
                            />
                          </td>
                          <td style={{ padding: '4px' }}>
                            <input 
                              type="text" 
                              value={item.palletSize || ''} 
                              onChange={e => {
                                const val = e.target.value;
                                setNewRequest(p => {
                                  const next = [...(p.piItems || [])];
                                  next[idx] = { ...next[idx], palletSize: val };
                                  return { ...p, piItems: next };
                                });
                              }}
                              style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '11px', outline: 'none', boxSizing: 'border-box' }}
                              placeholder="예: 110*110*120"
                            />
                          </td>
                          <td style={{ padding: '4px' }}>
                            <input 
                              type="text" 
                              value={item.cbm || ''} 
                              onChange={e => {
                                const val = e.target.value;
                                setNewRequest(p => {
                                  const next = [...(p.piItems || [])];
                                  next[idx] = { ...next[idx], cbm: val };
                                  return { ...p, piItems: next };
                                });
                              }}
                              style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '11px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }}
                              placeholder="0.0"
                            />
                          </td>
                          <td style={{ padding: '4px' }}>
                            <input 
                              type="text" 
                              value={item.netWeight || ''} 
                              onChange={e => {
                                const val = e.target.value;
                                setNewRequest(p => {
                                  const next = [...(p.piItems || [])];
                                  next[idx] = { ...next[idx], netWeight: val };
                                  return { ...p, piItems: next };
                                });
                              }}
                              style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '11px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }}
                              placeholder="0"
                            />
                          </td>
                          <td style={{ padding: '4px' }}>
                            <input 
                              type="text" 
                              value={item.grossWeight || ''} 
                              onChange={e => {
                                const val = e.target.value;
                                setNewRequest(p => {
                                  const next = [...(p.piItems || [])];
                                  next[idx] = { ...next[idx], grossWeight: val };
                                  return { ...p, piItems: next };
                                });
                              }}
                              style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '11px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }}
                              placeholder="0"
                            />
                          </td>
                          <td style={{ padding: '4px', textAlign: 'center' }}>
                            {newRequest.piItems && newRequest.piItems.length > 1 && (
                              <button 
                                type="button" 
                                onClick={() => setNewRequest(p => ({ ...p, piItems: (p.piItems || []).filter((_, i) => i !== idx) }))}
                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}
                              >
                                ✕
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}

                      {/* 제일 밑줄에 nos of package and CBM and weight의 합계를 보여주는 요약행 */}
                      <tr style={{ background: '#f1f5f9', fontWeight: 'bold', height: '32px', borderTop: '2px solid var(--border-default)' }}>
                        <td colSpan={3} style={{ padding: '6px 8px', textAlign: 'center' }}>[합계 요약 (Total Summary)]</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#1e3a8a' }}>
                          {(newRequest.piItems || []).reduce((sum, it) => sum + (Number(it.qty) || 0), 0)}
                        </td>
                        <td colSpan={3} style={{ padding: '6px 8px' }}></td>
                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>NOS of PLT/PKG</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#0f766e' }}>
                          {(newRequest.piItems || []).reduce((sum, it) => sum + (Number(it.cbm) || 0), 0).toFixed(2)}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#b45309' }}>
                          {(newRequest.piItems || []).reduce((sum, it) => sum + (Number(it.netWeight) || 0), 0)} kg
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#b45309' }}>
                          {(newRequest.piItems || []).reduce((sum, it) => sum + (Number(it.grossWeight) || 0), 0)} kg
                        </td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>


              {/* 📥 해외공급사 견적 비교 & 원가/마진 산정 통합 세션 (isQuoteMode 전용) */}
              {isQuoteMode && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', borderTop: '2px solid #e2e8f0', paddingTop: '16px', marginTop: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>💵 해외공급사 견적 비교</span>
                    <button
                      type="button"
                      onClick={() => setNewRequest(p => ({ ...p, supplierQuotes: [...(p.supplierQuotes || []), { id: 'q' + Date.now(), supplierName: '', itemName: '', amount: 0, currency: 'USD', quoteDate: new Date().toISOString().slice(0, 10) }] }))}
                      style={{ padding: '4px 8px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      + 견적 추가
                    </button>
                  </div>
                  <div style={{ border: '1px solid var(--border-default)', borderRadius: '8px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9', borderBottom: '1px solid var(--border-default)', height: '28px' }}>
                          <th style={{ padding: '4px 8px', textAlign: 'left' }}>공급사명</th>
                          <th style={{ padding: '4px 8px', textAlign: 'left' }}>품목</th>
                          <th style={{ padding: '4px 8px', textAlign: 'right', width: '120px' }}>견적금액</th>
                          <th style={{ padding: '4px 8px', width: '70px' }}>통화</th>
                          <th style={{ padding: '4px 8px', width: '110px' }}>견적일</th>
                          <th style={{ padding: '4px 8px', width: '40px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(newRequest.supplierQuotes && newRequest.supplierQuotes.length > 0) ? newRequest.supplierQuotes.map((q, idx) => (
                          <tr key={q.id} style={{ borderBottom: '1px solid var(--border-color)', height: '32px' }}>
                            <td style={{ padding: '2px 4px' }}>
                              <input type="text" value={q.supplierName} onChange={(e) => {
                                const next = [...(newRequest.supplierQuotes || [])];
                                next[idx] = { ...next[idx], supplierName: e.target.value };
                                setNewRequest(p => ({ ...p, supplierQuotes: next }));
                              }} style={{ width: '100%', padding: '4px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '11.5px', outline: 'none', boxSizing: 'border-box' }} />
                            </td>
                            <td style={{ padding: '2px 4px' }}>
                              <input type="text" value={q.itemName || ''} onChange={(e) => {
                                const next = [...(newRequest.supplierQuotes || [])];
                                next[idx] = { ...next[idx], itemName: e.target.value };
                                setNewRequest(p => ({ ...p, supplierQuotes: next }));
                              }} style={{ width: '100%', padding: '4px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '11.5px', outline: 'none', boxSizing: 'border-box' }} />
                            </td>
                            <td style={{ padding: '2px 4px' }}>
                              <input type="number" value={q.amount || ''} onChange={(e) => {
                                const next = [...(newRequest.supplierQuotes || [])];
                                next[idx] = { ...next[idx], amount: Number(e.target.value) || 0 };
                                setNewRequest(p => ({ ...p, supplierQuotes: next }));
                              }} style={{ width: '100%', padding: '4px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '11.5px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }} />
                            </td>
                            <td style={{ padding: '2px 4px' }}>
                              <select value={q.currency || 'USD'} onChange={(e) => {
                                const next = [...(newRequest.supplierQuotes || [])];
                                next[idx] = { ...next[idx], currency: e.target.value };
                                setNewRequest(p => ({ ...p, supplierQuotes: next }));
                              }} style={{ width: '100%', padding: '3px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '11.5px', outline: 'none', boxSizing: 'border-box' }}>
                                <option value="USD">USD</option>
                                <option value="CNY">CNY</option>
                                <option value="KRW">KRW</option>
                              </select>
                            </td>
                            <td style={{ padding: '2px 4px' }}>
                              <input type="date" value={q.quoteDate || ''} onChange={(e) => {
                                const next = [...(newRequest.supplierQuotes || [])];
                                next[idx] = { ...next[idx], quoteDate: e.target.value };
                                setNewRequest(p => ({ ...p, supplierQuotes: next }));
                              }} style={{ width: '100%', padding: '3px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '11px', outline: 'none', boxSizing: 'border-box' }} />
                            </td>
                            <td style={{ padding: '2px 4px', textAlign: 'center' }}>
                              <button type="button" onClick={() => {
                                const next = (newRequest.supplierQuotes || []).filter((_, i) => i !== idx);
                                setNewRequest(p => ({ ...p, supplierQuotes: next }));
                              }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                            </td>
                          </tr>
                        )) : (
                          <tr><td colSpan={6} style={{ padding: '12px', textAlign: 'center', color: 'var(--text-secondary)' }}>등록된 공급사 견적이 없습니다.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                        <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px', gridColumn: 'span 2' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '2px solid #cbd5e1', paddingBottom: '6px' }}>📊 엑셀 연동 수입원가 산정 (Trade Cost Calculator)</span>
                      
                      {/* 환율 및 기본정보 그리드 */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px', background: '#f1f5f9', padding: '10px', borderRadius: '6px', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <label style={{ fontSize: '11px', color: '#475569', fontWeight: 'bold' }}>오늘환율 (EXCHANGE RATE)</label>
                          <input type="number" value={newRequest.costBreakdown?.todayExchangeRate || ''} onChange={e => {
                            const val = Number(e.target.value) || 0;
                            setNewRequest(p => {
                              const nextB = { ...(p.costBreakdown || {}), todayExchangeRate: val, appliedExchangeRate: val + 20 };
                              return recalculateAddCosts(p, nextB);
                            });
                          }} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', outline: 'none', background: '#fff' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <label style={{ fontSize: '11px', color: '#475569', fontWeight: 'bold' }}>수입기준환율 (APPLIED)</label>
                          <input type="number" value={newRequest.costBreakdown?.appliedExchangeRate || ''} onChange={e => {
                            const val = Number(e.target.value) || 0;
                            setNewRequest(p => {
                              const nextB = { ...(p.costBreakdown || {}), appliedExchangeRate: val };
                              return recalculateAddCosts(p, nextB);
                            });
                          }} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', outline: 'none', background: '#fff' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <label style={{ fontSize: '11px', color: '#475569', fontWeight: 'bold' }}>FOB 단가 (USD)</label>
                          <input type="number" value={newRequest.costBreakdown?.buyingPriceUsd || ''} onChange={e => {
                            const val = Number(e.target.value) || 0;
                            setNewRequest(p => {
                              const nextB = { ...(p.costBreakdown || {}), buyingPriceUsd: val };
                              return recalculateAddCosts(p, nextB);
                            });
                          }} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', outline: 'none', background: '#fff' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <label style={{ fontSize: '11px', color: '#475569', fontWeight: 'bold' }}>구매 수량 (Q'TY / KG)</label>
                          <input type="number" value={newRequest.costBreakdown?.buyingQty || ''} onChange={e => {
                            const val = Number(e.target.value) || 1;
                            setNewRequest(p => {
                              const nextB = { ...(p.costBreakdown || {}), buyingQty: val };
                              return recalculateAddCosts(p, nextB);
                            });
                          }} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', outline: 'none', background: '#fff' }} />
                        </div>
                      </div>

                      {/* 세부 비용 항목 상세 입력 테이블 */}
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', marginBottom: '8px' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                            <th style={{ padding: '4px', textAlign: 'left' }}>항목명 (EXPENSE ITEM)</th>
                            <th style={{ padding: '4px', textAlign: 'center', width: '80px' }}>요율 (%)</th>
                            <th style={{ padding: '4px', textAlign: 'right', width: '130px' }}>원화 단가 (KRW)</th>
                            <th style={{ padding: '4px', textAlign: 'right', width: '150px' }}>원화 총액 (KRW)</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr style={{ borderBottom: '1px solid #e2e8f0', height: '26px' }}>
                            <td>구매 단가 (Buying Price FOB)</td>
                            <td style={{ textAlign: 'center' }}>-</td>
                            <td style={{ textAlign: 'right', color: '#64748b' }}>
                              {Math.round((newRequest.costBreakdown?.buyingPriceUsd || 0) * (newRequest.costBreakdown?.appliedExchangeRate || 1450)).toLocaleString()} 원
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                              {Math.round((newRequest.costBreakdown?.buyingPriceUsd || 0) * (newRequest.costBreakdown?.appliedExchangeRate || 1450) * (newRequest.costBreakdown?.buyingQty || 1)).toLocaleString()} 원
                            </td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #e2e8f0', height: '26px' }}>
                            <td>FTA 관세 (FTA CO / Tax)</td>
                            <td style={{ padding: '2px 4px' }}>
                              <input type="number" value={newRequest.costBreakdown?.ftaTaxRate || ''} onChange={e => {
                                const val = Number(e.target.value) || 0;
                                setNewRequest(p => {
                                  const nextB = { ...(p.costBreakdown || {}), ftaTaxRate: val };
                                  return recalculateAddCosts(p, nextB);
                                });
                              }} style={{ width: '100%', padding: '2px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '11px', outline: 'none', textAlign: 'center' }} />
                            </td>
                            <td style={{ textAlign: 'right', color: '#64748b' }}>
                              {Math.round(((newRequest.costBreakdown?.buyingPriceUsd || 0) * (newRequest.costBreakdown?.appliedExchangeRate || 1450)) * ((newRequest.costBreakdown?.ftaTaxRate || 0) / 100)).toLocaleString()} 원
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {Math.round(((newRequest.costBreakdown?.buyingPriceUsd || 0) * (newRequest.costBreakdown?.appliedExchangeRate || 1450) * (newRequest.costBreakdown?.buyingQty || 1)) * ((newRequest.costBreakdown?.ftaTaxRate || 0) / 100)).toLocaleString()} 원
                            </td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #e2e8f0', height: '26px' }}>
                            <td>반덤핑 관세 (Anti-Dumping Duty)</td>
                            <td style={{ padding: '2px 4px' }}>
                              <input type="number" value={newRequest.costBreakdown?.antiDumpingRate || ''} onChange={e => {
                                const val = Number(e.target.value) || 0;
                                setNewRequest(p => {
                                  const nextB = { ...(p.costBreakdown || {}), antiDumpingRate: val };
                                  return recalculateAddCosts(p, nextB);
                                });
                              }} style={{ width: '100%', padding: '2px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '11px', outline: 'none', textAlign: 'center' }} />
                            </td>
                            <td style={{ textAlign: 'right', color: '#64748b' }}>
                              {Math.round(((newRequest.costBreakdown?.buyingPriceUsd || 0) * (newRequest.costBreakdown?.appliedExchangeRate || 1450)) * ((newRequest.costBreakdown?.antiDumpingRate || 0) / 100)).toLocaleString()} 원
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {Math.round(((newRequest.costBreakdown?.buyingPriceUsd || 0) * (newRequest.costBreakdown?.appliedExchangeRate || 1450) * (newRequest.costBreakdown?.buyingQty || 1)) * ((newRequest.costBreakdown?.antiDumpingRate || 0) / 100)).toLocaleString()} 원
                            </td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #e2e8f0', height: '26px' }}>
                            <td>해외 송금/이체 수수료 (Money transfer fee)</td>
                            <td style={{ textAlign: 'center' }}>-</td>
                            <td style={{ textAlign: 'right', color: '#64748b' }}>
                              {Math.round((newRequest.costBreakdown?.transferFee || 0) / (newRequest.costBreakdown?.buyingQty || 1)).toLocaleString()} 원
                            </td>
                            <td style={{ padding: '2px 4px' }}>
                              <input type="number" value={newRequest.costBreakdown?.transferFee || ''} onChange={e => {
                                const val = Number(e.target.value) || 0;
                                setNewRequest(p => {
                                  const nextB = { ...(p.costBreakdown || {}), transferFee: val };
                                  return recalculateAddCosts(p, nextB);
                                });
                              }} style={{ width: '100%', padding: '2px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '11px', outline: 'none', textAlign: 'right' }} />
                            </td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #e2e8f0', height: '26px' }}>
                            <td>수입 통관대행료/대행 수수료 (Import declare)</td>
                            <td style={{ textAlign: 'center' }}>-</td>
                            <td style={{ textAlign: 'right', color: '#64748b' }}>
                              {Math.round((newRequest.costBreakdown?.importDeclareFee || 0) / (newRequest.costBreakdown?.buyingQty || 1)).toLocaleString()} 원
                            </td>
                            <td style={{ padding: '2px 4px' }}>
                              <input type="number" value={newRequest.costBreakdown?.importDeclareFee || ''} onChange={e => {
                                const val = Number(e.target.value) || 0;
                                setNewRequest(p => {
                                  const nextB = { ...(p.costBreakdown || {}), importDeclareFee: val };
                                  return recalculateAddCosts(p, nextB);
                                });
                              }} style={{ width: '100%', padding: '2px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '11px', outline: 'none', textAlign: 'right' }} />
                            </td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #cbd5e1', height: '26px' }}>
                            <td>국내 비용 + 내륙 운송비 (Local cost / FCL)</td>
                            <td style={{ textAlign: 'center' }}>-</td>
                            <td style={{ textAlign: 'right', color: '#64748b' }}>
                              {Math.round((newRequest.costBreakdown?.localTransportCost || 0) / (newRequest.costBreakdown?.buyingQty || 1)).toLocaleString()} 원
                            </td>
                            <td style={{ padding: '2px 4px' }}>
                              <input type="number" value={newRequest.costBreakdown?.localTransportCost || ''} onChange={e => {
                                const val = Number(e.target.value) || 0;
                                setNewRequest(p => {
                                  const nextB = { ...(p.costBreakdown || {}), localTransportCost: val };
                                  return recalculateAddCosts(p, nextB);
                                });
                              }} style={{ width: '100%', padding: '2px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '11px', outline: 'none', textAlign: 'right' }} />
                            </td>
                          </tr>
                        </tbody>
                      </table>

                      {/* 총 합계 요약 그리드 */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', borderTop: '2px solid #0f766e', paddingTop: '8px' }}>
                        <div>
                          <strong style={{ fontSize: '12px', color: '#0f766e' }}>총 수입 원가 (Actual Cost): </strong>
                          <span style={{ fontSize: '13px', fontWeight: 'bold' }}>{Math.round(calculateAddTotalCost(newRequest)).toLocaleString()} 원</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <strong style={{ fontSize: '12px', color: '#0f766e' }}>{(newRequest.piItems?.[0]?.unit || 'UNIT')}당 단위 원가: </strong>
                          <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#b45309' }}>
                            {Math.round(calculateAddTotalCost(newRequest) / (newRequest.costBreakdown?.buyingQty || 1)).toLocaleString()} 원 / {(newRequest.piItems?.[0]?.unit || 'UNIT')}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-default)', paddingBottom: '4px' }}>마진 및 고객 견적</span>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>마진율 (%)</label>
                        <input type="number" value={newRequest.marginRate ?? ''} onChange={(e) => {
                          const rate = Number(e.target.value) || 0;
                          setNewRequest(p => {
                            const totalCost = calculateAddTotalCost(p);
                            const marginAmount = Math.round(totalCost * (rate / 100));
                            return { ...p, marginRate: rate, marginAmount, customerQuoteAmount: totalCost + marginAmount };
                          });
                        }} style={{ width: '120px', padding: '4px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12px', outline: 'none', textAlign: 'right' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>마진 금액 (₩)</label>
                        <strong style={{ fontSize: '12px', color: '#b45309' }}>{(newRequest.marginAmount || 0).toLocaleString()} 원</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-default)', paddingTop: '6px', marginTop: '2px' }}>
                        <strong style={{ fontSize: '12px' }}>고객 제시 견적금액</strong>
                        <strong style={{ fontSize: '13px', color: '#1e3a8a' }}>{(newRequest.customerQuoteAmount || 0).toLocaleString()} 원</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                        <strong style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>{(newRequest.piItems?.[0]?.unit || 'UNIT')}당 최종 판매단가</strong>
                        <strong style={{ fontSize: '12.5px', color: '#10b981' }}>
                          {Math.round((newRequest.customerQuoteAmount || 0) / (newRequest.costBreakdown?.buyingQty || 1)).toLocaleString()} 원 / {(newRequest.piItems?.[0]?.unit || 'UNIT')}
                        </strong>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', borderTop: '1px solid var(--border-default)', paddingTop: '6px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>고객사 진행 결정 (수입확정여부)</label>
                        <select
                          value={newRequest.customerDecision || '검토중'}
                          onChange={(e) => {
                            const val = e.target.value as any;
                            const nextStatus = val === '승인' ? '발주 진행' : '진행 결정 요청';
                            setNewRequest(p => ({ ...p, customerDecision: val, status: nextStatus }));
                          }}
                          style={{ padding: '4px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12px', outline: 'none', background: '#fff' }}
                        >
                          <option value="검토중">검토중 (Under Review)</option>
                          <option value="승인">승인 (Approved - 실무 진행)</option>
                          <option value="반려">반려 (Rejected)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 하단 제어 */}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button 
                  type="button" 
                  onClick={() => setShowAddModal(false)}
                  style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', color: 'var(--text-secondary)', borderRadius: '6px', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer' }}
                >
                  취소
                </button>
                <button 
                  type="submit"
                  style={{ padding: '8px 16px', background: '#2563eb', border: 'none', color: '#fff', borderRadius: '6px', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer' }}
                >
                  등록
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Supplier Search Modal (Subwindow) */}
      {showSupplierSearch && (
        <SupplierSearchModal
          suppliers={suppliers}
          onClose={() => setShowSupplierSearch(false)}
          onRefreshSuppliers={loadSuppliers}
          onSelect={(sup) => {
            if (showEditModal) {
              setEditingRequest(p => p ? { ...p, importerName: sup.name || '' } : null);
            } else {
              setNewRequest(p => ({ ...p, importerName: sup.name || '' }));
            }
            setShowSupplierSearch(false);
          }}
        />
      )}
      {/* Product Search Modal (Subwindow) */}
      {showProductSearch && productSearchTargetIdx !== null && (
        <ProductSearchModal
          products={products}
          onClose={() => {
            setShowProductSearch(false);
            setProductSearchTargetIdx(null);
          }}
          onSelect={(prod) => {
            if (showEditModal) {
              setEditingRequest(p => {
                if (!p) return null;
                const next = [...(p.piItems || [])];
                const idx = productSearchTargetIdx;
                if (next[idx]) {
                  next[idx] = {
                    ...next[idx],
                    name: prod.nameEn || prod.nameKo || '',
                    hsCode: prod.hsCode || '',
                    unitPrice: String(prod.purchasePrice || ''),
                    unit: prod.unit || 'EA',
                    weight: String(prod.weight || '')
                  };
                }
                return { ...p, piItems: next };
              });
            } else {
              setNewRequest(p => {
                const next = [...(p.piItems || [])];
                const idx = productSearchTargetIdx;
                if (next[idx]) {
                  next[idx] = {
                    ...next[idx],
                    name: prod.nameEn || prod.nameKo || '',
                    hsCode: prod.hsCode || '',
                    unitPrice: String(prod.purchasePrice || ''),
                    unit: prod.unit || 'EA',
                    weight: String(prod.weight || '')
                  };
                }
                return { ...p, piItems: next };
              });
            }
            setShowProductSearch(false);
            setProductSearchTargetIdx(null);
          }}
        />
      )}
      {/* Edit Modal (Modalless & Resizeable/Draggable Window) */}
      {showEditModal && editingRequest && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10009, pointerEvents: 'none' }}>
          <div style={{
            position: 'absolute',
            left: `${modalPosition.x}px`,
            top: `${modalPosition.y}px`,
            background: '#fff',
            borderRadius: '12px',
            width: '1240px',
            minWidth: '600px',
            maxWidth: '98vw',
            height: '85vh',
            maxHeight: '90vh',
            padding: '16px 20px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15), 0 0 1px 1px rgba(0,0,0,0.2)',
            boxSizing: 'border-box',
            pointerEvents: 'auto',
            resize: 'both',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div 
              onMouseDown={handleHeaderMouseDown}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px', cursor: 'move', userSelect: 'none' }}
            >
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>수입 의뢰 건 수정 📌 <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>(헤더를 잡고 드래그 이동 / 우측하단 드래그로 크기조절 가능)</span></h3>
              <button onClick={() => { setShowEditModal(false); setEditingRequest(null); }} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>
            
            <form onSubmit={handleEditRequest} style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, overflowY: 'auto', paddingRight: '6px' }}>
              {/* 기본 수입주체 & 수입처 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>수입주체 구분</label>
                  <select 
                    value={editingRequest?.importCompany || 'YSACC'} 
                    onChange={e => {
                      const comp = e.target.value as any;
                      setEditingRequest(p => {
                        if (!p) return null;
                        const nextPo = computePoNumber(comp, p.importerName || '', p.id || '');
                        return { ...p, importCompany: comp, poNumber: nextPo };
                      });
                    }}
                    style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none', background: '#fff' }}
                  >
                    <option value="YSACC">YSACC</option>
                    <option value="YS">YS (영성ACC)</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>수입처 (공급업체관리 연결)</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input 
                      type="text"
                      readOnly
                      required
                      placeholder="우측 [검색] 버튼을 눌러 공급업체 선택"
                      value={editingRequest.importerName || ''}
                      style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none', background: '#f8fafc', color: '#334155', fontWeight: 600 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSupplierSearch(true)}
                      style={{ padding: '8px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      🔍 검색
                    </button>
                  </div>
                </div>
              </div>

              {/* PO 번호 & PI 번호 라인 */}
              {!isQuoteMode && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>PO 번호 (자동 넘버링 / 수정가능)</label>
                    <input 
                      type="text" 
                      required={!isQuoteMode}
                      value={editingRequest?.poNumber || ''} 
                      onChange={e => setEditingRequest(p => p ? ({ ...p, poNumber: e.target.value }) : null)}
                      style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                      placeholder="예: PO-YSACC-BOR-2026-01"
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>PI 번호 (상대회사 제공)</label>
                    <input 
                      type="text" 
                      value={editingRequest?.piNumber || ''} 
                      onChange={e => setEditingRequest(p => p ? ({ ...p, piNumber: e.target.value }) : null)}
                      style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                      placeholder="예: PI20260701-01"
                    />
                  </div>
                </div>
              )}

              {/* 최종고객 & INCOTERMS & B/L AWB 번호 */}
              {isQuoteMode ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>최종고객 (고객사 DB 연계)</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input 
                      type="text" 
                      readOnly
                      value={editingRequest.finalCustomer || ''} 
                      style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none', background: '#f8fafc' }}
                      placeholder="우측 [검색] 버튼으로 고객사 지정"
                    />
                    <button
                      type="button"
                      onClick={() => { setCustomerSelectTarget('edit'); setShowCustomerModal(true); }}
                      style={{ padding: '8px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      🔍 검색
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>최종고객 (고객사 DB 연계)</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input 
                          type="text" 
                          readOnly
                          value={editingRequest.finalCustomer || ''} 
                          style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none', background: '#f8fafc' }}
                          placeholder="우측 [검색] 버튼으로 고객사 지정"
                        />
                        <button
                          type="button"
                          onClick={() => { setCustomerSelectTarget('edit'); setShowCustomerModal(true); }}
                          style={{ padding: '8px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          🔍 검색
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>INCOTERMS</label>
                      <select 
                        value={editingRequest.incoterms || 'FOB'} 
                        onChange={e => setEditingRequest(p => p ? ({ ...p, incoterms: e.target.value }) : null)}
                        style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none', background: '#fff' }}
                      >
                        <option value="EXW">EXW</option>
                        <option value="FCA">FCA</option>
                        <option value="FOB">FOB</option>
                        <option value="CFR">CFR</option>
                        <option value="CIF">CIF</option>
                        <option value="DAP">DAP</option>
                        <option value="DDP">DDP</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>B/L (AWB) 번호</label>
                      <input 
                        type="text" 
                        value={editingRequest.blAwb || ''} 
                        onChange={e => setEditingRequest(p => p ? ({ ...p, blAwb: e.target.value }) : null)}
                        style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                        placeholder="예: B/L 번호 직접 입력"
                      />
                    </div>
                  </div>

                  {/* PAYMENT TERMS & 운송수단 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>PAYMENT TERMS</label>
                      <input 
                        type="text" 
                        value={editingRequest.paymentTerms || ''} 
                        onChange={e => setEditingRequest(p => p ? ({ ...p, paymentTerms: e.target.value }) : null)}
                        style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                        placeholder="예: 100% T/T in advance"
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>운송수단</label>
                      <select 
                        value={editingRequest.transportType || 'By Sea'} 
                        onChange={e => setEditingRequest(p => p ? ({ ...p, transportType: e.target.value }) : null)}
                        style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none', background: '#fff' }}
                      >
                        <option value="By Sea">By Sea</option>
                        <option value="By Air">By Air</option>
                        <option value="By courier">By courier</option>
                      </select>
                    </div>
                  </div>

                  {/* 출발PORT & 도착PORT & 견적 운임 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>출발 PORT</label>
                      <input 
                        type="text" 
                        required={!isQuoteMode}
                        value={editingRequest.pol || ''} 
                        onChange={e => setEditingRequest(p => p ? ({ ...p, pol: e.target.value }) : null)}
                        style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                        placeholder="예: SHANGHAI PORT, CHINA"
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>도착 PORT</label>
                      <input 
                        type="text" 
                        required={!isQuoteMode}
                        value={editingRequest.pod || ''} 
                        onChange={e => setEditingRequest(p => p ? ({ ...p, pod: e.target.value }) : null)}
                        style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                        placeholder="예: INCHEON PORT, KOREA"
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>원산지 (Origin)</label>
                      <input 
                        type="text" 
                        required={!isQuoteMode}
                        value={editingRequest.origin || 'CHINA'} 
                        onChange={e => setEditingRequest(p => p ? ({ ...p, origin: e.target.value }) : null)}
                        style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                        placeholder="예: CHINA, KOREA"
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>견적 운임 (₩)</label>
                      <input 
                        type="number" 
                        value={editingRequest.amount} 
                        onChange={e => setEditingRequest(p => p ? ({ ...p, amount: Number(e.target.value) }) : null)}
                        style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* 4. 동적 통합 수입 제품 및 패킹 테이블 */}
              <div style={{ border: '1px solid var(--border-default)', borderRadius: '8px', padding: '12px', background: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>📦 수입 제품 및 패킹 명세 목록</span>
                  <button 
                    type="button" 
                    onClick={() => setEditingRequest(p => p ? ({ ...p, piItems: [...(p.piItems || []), { name: '', qty: '', unitPrice: '', amount: '', hsCode: '', unit: 'EA', palletSize: '', cbm: '', netWeight: '', grossWeight: '' }] }) : null)}
                    style={{ padding: '2px 8px', border: '1px solid #2563eb', borderRadius: '4px', background: '#fff', color: '#2563eb', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    ＋ 항목 추가
                  </button>
                </div>
                
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', minWidth: '1000px' }}>
                    <thead>
                      <tr style={{ background: 'var(--border-color)', borderBottom: '1px solid var(--border-default)', height: '30px' }}>
                        <th style={{ padding: '4px', width: '30px', textAlign: 'center' }}>No</th>
                        <th style={{ padding: '4px', textAlign: 'left', minWidth: '180px' }}>DESCRIPTION OF COMMODITY</th>
                        <th style={{ padding: '4px', width: '90px' }}>HS CODE</th>
                        <th style={{ padding: '4px', width: '70px', textAlign: 'right' }}>QTY</th>
                        <th style={{ padding: '4px', width: '50px', textAlign: 'center' }}>UNIT</th>
                        <th style={{ padding: '4px', width: '80px', textAlign: 'right' }}>U.PRICE</th>
                        <th style={{ padding: '4px', width: '90px', textAlign: 'right' }}>TOTAL AMOUNT</th>
                        <th style={{ padding: '4px', width: '130px' }}>PALLET SIZE</th>
                        <th style={{ padding: '4px', width: '70px', textAlign: 'right' }}>CBM</th>
                        <th style={{ padding: '4px', width: '80px', textAlign: 'right' }}>N.WT (KG)</th>
                        <th style={{ padding: '4px', width: '80px', textAlign: 'right' }}>G.WT (KG)</th>
                        <th style={{ padding: '4px', width: '30px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(editingRequest.piItems || []).map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '4px', textAlign: 'center', fontWeight: 'bold' }}>{idx + 1}</td>
                          <td style={{ padding: '4px' }}>
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              <input 
                                type="text" 
                                value={item.name} 
                                onChange={e => {
                                  const val = e.target.value;
                                  setEditingRequest(p => {
                                    if (!p) return null;
                                    const next = [...(p.piItems || [])];
                                    next[idx] = { ...next[idx], name: val };
                                    return { ...p, piItems: next };
                                  });
                                }}
                                style={{ flex: 1, padding: '3px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '11px', outline: 'none', boxSizing: 'border-box' }}
                                placeholder="예: E-GLASS SURFACE TISSUE"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setProductSearchTargetIdx(idx);
                                  setShowProductSearch(true);
                                }}
                                style={{ padding: '3px 6px', background: 'var(--border-color)', border: '1px solid var(--border-default)', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                                title="상품 DB에서 가져오기"
                              >
                                🔍
                              </button>
                            </div>
                          </td>
                          <td style={{ padding: '4px' }}>
                            <input 
                              type="text" 
                              value={item.hsCode || ''} 
                              onChange={e => {
                                const val = e.target.value;
                                setEditingRequest(p => {
                                  if (!p) return null;
                                  const next = [...(p.piItems || [])];
                                  next[idx] = { ...next[idx], hsCode: val };
                                  return { ...p, piItems: next };
                                });
                              }}
                              style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '11px', outline: 'none', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '4px' }}>
                            <input 
                              type="text" 
                              value={item.qty} 
                              onChange={e => {
                                const val = e.target.value;
                                setEditingRequest(p => {
                                  if (!p) return null;
                                  const next = [...(p.piItems || [])];
                                  next[idx] = { ...next[idx], qty: val };
                                  return { ...p, piItems: next };
                                });
                              }}
                              style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '11px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '4px' }}>
                            <input 
                              type="text" 
                              value={item.unit || 'EA'} 
                              onChange={e => {
                                const val = e.target.value;
                                setEditingRequest(p => {
                                  if (!p) return null;
                                  const next = [...(p.piItems || [])];
                                  next[idx] = { ...next[idx], unit: val };
                                  return { ...p, piItems: next };
                                });
                              }}
                              style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '11px', outline: 'none', textAlign: 'center', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '4px' }}>
                            <input 
                              type="text" 
                              value={item.unitPrice} 
                              onChange={e => {
                                const val = e.target.value;
                                setEditingRequest(p => {
                                  if (!p) return null;
                                  const next = [...(p.piItems || [])];
                                  next[idx] = { ...next[idx], unitPrice: val };
                                  return { ...p, piItems: next };
                                });
                              }}
                              style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '11px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '4px' }}>
                            <input 
                              type="text" 
                              readOnly
                              value={
                                ((Number(item.qty) || 0) * (Number(item.unitPrice) || 0))
                                  ? String(((Number(item.qty) || 0) * (Number(item.unitPrice) || 0)).toFixed(2))
                                  : ''
                              } 
                              style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '11px', outline: 'none', textAlign: 'right', boxSizing: 'border-box', background: '#f1f5f9', color: 'var(--text-secondary)', fontWeight: 'bold' }}
                            />
                          </td>
                          <td style={{ padding: '4px' }}>
                            <input 
                              type="text" 
                              value={item.palletSize || ''} 
                              onChange={e => {
                                const val = e.target.value;
                                setEditingRequest(p => {
                                  if (!p) return null;
                                  const next = [...(p.piItems || [])];
                                  next[idx] = { ...next[idx], palletSize: val };
                                  return { ...p, piItems: next };
                                });
                              }}
                              style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '11px', outline: 'none', boxSizing: 'border-box' }}
                              placeholder="예: 110*110*120"
                            />
                          </td>
                          <td style={{ padding: '4px' }}>
                            <input 
                              type="text" 
                              value={item.cbm || ''} 
                              onChange={e => {
                                const val = e.target.value;
                                setEditingRequest(p => {
                                  if (!p) return null;
                                  const next = [...(p.piItems || [])];
                                  next[idx] = { ...next[idx], cbm: val };
                                  return { ...p, piItems: next };
                                });
                              }}
                              style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '11px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }}
                              placeholder="0.0"
                            />
                          </td>
                          <td style={{ padding: '4px' }}>
                            <input 
                              type="text" 
                              value={item.netWeight || ''} 
                              onChange={e => {
                                const val = e.target.value;
                                setEditingRequest(p => {
                                  if (!p) return null;
                                  const next = [...(p.piItems || [])];
                                  next[idx] = { ...next[idx], netWeight: val };
                                  return { ...p, piItems: next };
                                });
                              }}
                              style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '11px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }}
                              placeholder="0"
                            />
                          </td>
                          <td style={{ padding: '4px' }}>
                            <input 
                              type="text" 
                              value={item.grossWeight || ''} 
                              onChange={e => {
                                const val = e.target.value;
                                setEditingRequest(p => {
                                  if (!p) return null;
                                  const next = [...(p.piItems || [])];
                                  next[idx] = { ...next[idx], grossWeight: val };
                                  return { ...p, piItems: next };
                                });
                              }}
                              style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '11px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }}
                              placeholder="0"
                            />
                          </td>
                          <td style={{ padding: '4px', textAlign: 'center' }}>
                            {editingRequest.piItems && editingRequest.piItems.length > 1 && (
                              <button 
                                type="button" 
                                onClick={() => setEditingRequest(p => p ? ({ ...p, piItems: (p.piItems || []).filter((_, i) => i !== idx) }) : null)}
                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}
                              >
                                ✕
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}

                      {/* 제일 밑줄에 nos of package and CBM and weight의 합계를 보여주는 요약행 */}
                      <tr style={{ background: '#f1f5f9', fontWeight: 'bold', height: '32px', borderTop: '2px solid var(--border-default)' }}>
                        <td colSpan={3} style={{ padding: '6px 8px', textAlign: 'center' }}>[합계 요약 (Total Summary)]</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#1e3a8a' }}>
                          {(editingRequest.piItems || []).reduce((sum, it) => sum + (Number(it.qty) || 0), 0)}
                        </td>
                        <td colSpan={3} style={{ padding: '6px 8px' }}></td>
                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>NOS of PLT/PKG</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#0f766e' }}>
                          {(editingRequest.piItems || []).reduce((sum, it) => sum + (Number(it.cbm) || 0), 0).toFixed(2)}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#b45309' }}>
                          {(editingRequest.piItems || []).reduce((sum, it) => sum + (Number(it.netWeight) || 0), 0)} kg
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#b45309' }}>
                          {(editingRequest.piItems || []).reduce((sum, it) => sum + (Number(it.grossWeight) || 0), 0)} kg
                        </td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 📥 해외공급사 견적 비교 & 원가/마진 산정 통합 세션 (isQuoteMode 전용) */}
              {isQuoteMode && editingRequest && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', borderTop: '2px solid #e2e8f0', paddingTop: '16px', marginTop: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>💵 해외공급사 견적 비교</span>
                    <button
                      type="button"
                      onClick={() => setEditingRequest(p => p ? ({ ...p, supplierQuotes: [...(p.supplierQuotes || []), { id: `q${Date.now()}`, supplierName: '', itemName: '', amount: 0, currency: 'USD', quoteDate: new Date().toISOString().slice(0, 10) }] }) : null)}
                      style={{ padding: '4px 8px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      + 견적 추가
                    </button>
                  </div>
                  <div style={{ border: '1px solid var(--border-default)', borderRadius: '8px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9', borderBottom: '1px solid var(--border-default)', height: '28px' }}>
                          <th style={{ padding: '4px 8px', textAlign: 'left' }}>공급사명</th>
                          <th style={{ padding: '4px 8px', textAlign: 'left' }}>품목</th>
                          <th style={{ padding: '4px 8px', textAlign: 'right', width: '120px' }}>견적금액</th>
                          <th style={{ padding: '4px 8px', width: '70px' }}>통화</th>
                          <th style={{ padding: '4px 8px', width: '110px' }}>견적일</th>
                          <th style={{ padding: '4px 8px', width: '40px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(editingRequest.supplierQuotes && editingRequest.supplierQuotes.length > 0) ? editingRequest.supplierQuotes.map((q, idx) => (
                          <tr key={q.id} style={{ borderBottom: '1px solid var(--border-color)', height: '32px' }}>
                            <td style={{ padding: '2px 4px' }}>
                              <input type="text" value={q.supplierName} onChange={(e) => {
                                const next = [...(editingRequest.supplierQuotes || [])];
                                next[idx] = { ...next[idx], supplierName: e.target.value };
                                setEditingRequest(p => p ? ({ ...p, supplierQuotes: next }) : null);
                              }} style={{ width: '100%', padding: '4px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '11.5px', outline: 'none', boxSizing: 'border-box' }} />
                            </td>
                            <td style={{ padding: '2px 4px' }}>
                              <input type="text" value={q.itemName || ''} onChange={(e) => {
                                const next = [...(editingRequest.supplierQuotes || [])];
                                next[idx] = { ...next[idx], itemName: e.target.value };
                                setEditingRequest(p => p ? ({ ...p, supplierQuotes: next }) : null);
                              }} style={{ width: '100%', padding: '4px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '11.5px', outline: 'none', boxSizing: 'border-box' }} />
                            </td>
                            <td style={{ padding: '2px 4px' }}>
                              <input type="number" value={q.amount || ''} onChange={(e) => {
                                const next = [...(editingRequest.supplierQuotes || [])];
                                next[idx] = { ...next[idx], amount: Number(e.target.value) || 0 };
                                setEditingRequest(p => p ? ({ ...p, supplierQuotes: next }) : null);
                              }} style={{ width: '100%', padding: '4px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '11.5px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }} />
                            </td>
                            <td style={{ padding: '2px 4px' }}>
                              <select value={q.currency || 'USD'} onChange={(e) => {
                                const next = [...(editingRequest.supplierQuotes || [])];
                                next[idx] = { ...next[idx], currency: e.target.value };
                                setEditingRequest(p => p ? ({ ...p, supplierQuotes: next }) : null);
                              }} style={{ width: '100%', padding: '3px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '11.5px', outline: 'none', boxSizing: 'border-box' }}>
                                <option value="USD">USD</option>
                                <option value="CNY">CNY</option>
                                <option value="KRW">KRW</option>
                              </select>
                            </td>
                            <td style={{ padding: '2px 4px' }}>
                              <input type="date" value={q.quoteDate || ''} onChange={(e) => {
                                const next = [...(editingRequest.supplierQuotes || [])];
                                next[idx] = { ...next[idx], quoteDate: e.target.value };
                                setEditingRequest(p => p ? ({ ...p, supplierQuotes: next }) : null);
                              }} style={{ width: '100%', padding: '3px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '11.5px', outline: 'none', boxSizing: 'border-box' }} />
                            </td>
                            <td style={{ padding: '2px 4px', textAlign: 'center' }}>
                              <button type="button" onClick={() => {
                                const next = (editingRequest.supplierQuotes || []).filter((_, i) => i !== idx);
                                setEditingRequest(p => p ? ({ ...p, supplierQuotes: next }) : null);
                              }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                            </td>
                          </tr>
                        )) : (
                          <tr><td colSpan={6} style={{ padding: '12px', textAlign: 'center', color: 'var(--text-secondary)' }}>등록된 공급사 견적이 없습니다.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                        <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px', gridColumn: 'span 2' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '2px solid #cbd5e1', paddingBottom: '6px' }}>📊 엑셀 연동 수입원가 산정 (Trade Cost Calculator)</span>
                      
                      {/* 환율 및 기본정보 그리드 */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px', background: '#f1f5f9', padding: '10px', borderRadius: '6px', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <label style={{ fontSize: '11px', color: '#475569', fontWeight: 'bold' }}>오늘환율 (EXCHANGE RATE)</label>
                          <input type="number" value={editingRequest.costBreakdown?.todayExchangeRate || ''} onChange={e => {
                            const val = Number(e.target.value) || 0;
                            setEditingRequest(p => {
                              if (!p) return null;
                              const nextB = { ...(p.costBreakdown || {}), todayExchangeRate: val, appliedExchangeRate: val + 20 };
                              return recalculateEditCosts(p, nextB);
                            });
                          }} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', outline: 'none', background: '#fff' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <label style={{ fontSize: '11px', color: '#475569', fontWeight: 'bold' }}>수입기준환율 (APPLIED)</label>
                          <input type="number" value={editingRequest.costBreakdown?.appliedExchangeRate || ''} onChange={e => {
                            const val = Number(e.target.value) || 0;
                            setEditingRequest(p => {
                              if (!p) return null;
                              const nextB = { ...(p.costBreakdown || {}), appliedExchangeRate: val };
                              return recalculateEditCosts(p, nextB);
                            });
                          }} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', outline: 'none', background: '#fff' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <label style={{ fontSize: '11px', color: '#475569', fontWeight: 'bold' }}>FOB 단가 (USD)</label>
                          <input type="number" value={editingRequest.costBreakdown?.buyingPriceUsd || ''} onChange={e => {
                            const val = Number(e.target.value) || 0;
                            setEditingRequest(p => {
                              if (!p) return null;
                              const nextB = { ...(p.costBreakdown || {}), buyingPriceUsd: val };
                              return recalculateEditCosts(p, nextB);
                            });
                          }} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', outline: 'none', background: '#fff' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <label style={{ fontSize: '11px', color: '#475569', fontWeight: 'bold' }}>구매 수량 (Q'TY / KG)</label>
                          <input type="number" value={editingRequest.costBreakdown?.buyingQty || ''} onChange={e => {
                            const val = Number(e.target.value) || 1;
                            setEditingRequest(p => {
                              if (!p) return null;
                              const nextB = { ...(p.costBreakdown || {}), buyingQty: val };
                              return recalculateEditCosts(p, nextB);
                            });
                          }} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', outline: 'none', background: '#fff' }} />
                        </div>
                      </div>

                      {/* 세부 비용 항목 상세 입력 테이블 */}
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', marginBottom: '8px' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                            <th style={{ padding: '4px', textAlign: 'left' }}>항목명 (EXPENSE ITEM)</th>
                            <th style={{ padding: '4px', textAlign: 'center', width: '80px' }}>요율 (%)</th>
                            <th style={{ padding: '4px', textAlign: 'right', width: '130px' }}>원화 단가 (KRW)</th>
                            <th style={{ padding: '4px', textAlign: 'right', width: '150px' }}>원화 총액 (KRW)</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr style={{ borderBottom: '1px solid #e2e8f0', height: '26px' }}>
                            <td>구매 단가 (Buying Price FOB)</td>
                            <td style={{ textAlign: 'center' }}>-</td>
                            <td style={{ textAlign: 'right', color: '#64748b' }}>
                              {Math.round((editingRequest.costBreakdown?.buyingPriceUsd || 0) * (editingRequest.costBreakdown?.appliedExchangeRate || 1450)).toLocaleString()} 원
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                              {Math.round((editingRequest.costBreakdown?.buyingPriceUsd || 0) * (editingRequest.costBreakdown?.appliedExchangeRate || 1450) * (editingRequest.costBreakdown?.buyingQty || 1)).toLocaleString()} 원
                            </td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #e2e8f0', height: '26px' }}>
                            <td>FTA 관세 (FTA CO / Tax)</td>
                            <td style={{ padding: '2px 4px' }}>
                              <input type="number" value={editingRequest.costBreakdown?.ftaTaxRate || ''} onChange={e => {
                                const val = Number(e.target.value) || 0;
                                setEditingRequest(p => {
                                  if (!p) return null;
                                  const nextB = { ...(p.costBreakdown || {}), ftaTaxRate: val };
                                  return recalculateEditCosts(p, nextB);
                                });
                              }} style={{ width: '100%', padding: '2px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '11px', outline: 'none', textAlign: 'center' }} />
                            </td>
                            <td style={{ textAlign: 'right', color: '#64748b' }}>
                              {Math.round(((editingRequest.costBreakdown?.buyingPriceUsd || 0) * (editingRequest.costBreakdown?.appliedExchangeRate || 1450)) * ((editingRequest.costBreakdown?.ftaTaxRate || 0) / 100)).toLocaleString()} 원
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {Math.round(((editingRequest.costBreakdown?.buyingPriceUsd || 0) * (editingRequest.costBreakdown?.appliedExchangeRate || 1450) * (editingRequest.costBreakdown?.buyingQty || 1)) * ((editingRequest.costBreakdown?.ftaTaxRate || 0) / 100)).toLocaleString()} 원
                            </td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #e2e8f0', height: '26px' }}>
                            <td>반덤핑 관세 (Anti-Dumping Duty)</td>
                            <td style={{ padding: '2px 4px' }}>
                              <input type="number" value={editingRequest.costBreakdown?.antiDumpingRate || ''} onChange={e => {
                                const val = Number(e.target.value) || 0;
                                setEditingRequest(p => {
                                  if (!p) return null;
                                  const nextB = { ...(p.costBreakdown || {}), antiDumpingRate: val };
                                  return recalculateEditCosts(p, nextB);
                                });
                              }} style={{ width: '100%', padding: '2px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '11px', outline: 'none', textAlign: 'center' }} />
                            </td>
                            <td style={{ textAlign: 'right', color: '#64748b' }}>
                              {Math.round(((editingRequest.costBreakdown?.buyingPriceUsd || 0) * (editingRequest.costBreakdown?.appliedExchangeRate || 1450)) * ((editingRequest.costBreakdown?.antiDumpingRate || 0) / 100)).toLocaleString()} 원
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {Math.round(((editingRequest.costBreakdown?.buyingPriceUsd || 0) * (editingRequest.costBreakdown?.appliedExchangeRate || 1450) * (editingRequest.costBreakdown?.buyingQty || 1)) * ((editingRequest.costBreakdown?.antiDumpingRate || 0) / 100)).toLocaleString()} 원
                            </td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #e2e8f0', height: '26px' }}>
                            <td>해외 송금/이체 수수료 (Money transfer fee)</td>
                            <td style={{ textAlign: 'center' }}>-</td>
                            <td style={{ textAlign: 'right', color: '#64748b' }}>
                              {Math.round((editingRequest.costBreakdown?.transferFee || 0) / (editingRequest.costBreakdown?.buyingQty || 1)).toLocaleString()} 원
                            </td>
                            <td style={{ padding: '2px 4px' }}>
                              <input type="number" value={editingRequest.costBreakdown?.transferFee || ''} onChange={e => {
                                const val = Number(e.target.value) || 0;
                                setEditingRequest(p => {
                                  if (!p) return null;
                                  const nextB = { ...(p.costBreakdown || {}), transferFee: val };
                                  return recalculateEditCosts(p, nextB);
                                });
                              }} style={{ width: '100%', padding: '2px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '11px', outline: 'none', textAlign: 'right' }} />
                            </td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #e2e8f0', height: '26px' }}>
                            <td>수입 통관대행료/대행 수수료 (Import declare)</td>
                            <td style={{ textAlign: 'center' }}>-</td>
                            <td style={{ textAlign: 'right', color: '#64748b' }}>
                              {Math.round((editingRequest.costBreakdown?.importDeclareFee || 0) / (editingRequest.costBreakdown?.buyingQty || 1)).toLocaleString()} 원
                            </td>
                            <td style={{ padding: '2px 4px' }}>
                              <input type="number" value={editingRequest.costBreakdown?.importDeclareFee || ''} onChange={e => {
                                const val = Number(e.target.value) || 0;
                                setEditingRequest(p => {
                                  if (!p) return null;
                                  const nextB = { ...(p.costBreakdown || {}), importDeclareFee: val };
                                  return recalculateEditCosts(p, nextB);
                                });
                              }} style={{ width: '100%', padding: '2px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '11px', outline: 'none', textAlign: 'right' }} />
                            </td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #cbd5e1', height: '26px' }}>
                            <td>국내 비용 + 내륙 운송비 (Local cost / FCL)</td>
                            <td style={{ textAlign: 'center' }}>-</td>
                            <td style={{ textAlign: 'right', color: '#64748b' }}>
                              {Math.round((editingRequest.costBreakdown?.localTransportCost || 0) / (editingRequest.costBreakdown?.buyingQty || 1)).toLocaleString()} 원
                            </td>
                            <td style={{ padding: '2px 4px' }}>
                              <input type="number" value={editingRequest.costBreakdown?.localTransportCost || ''} onChange={e => {
                                const val = Number(e.target.value) || 0;
                                setEditingRequest(p => {
                                  if (!p) return null;
                                  const nextB = { ...(p.costBreakdown || {}), localTransportCost: val };
                                  return recalculateEditCosts(p, nextB);
                                });
                              }} style={{ width: '100%', padding: '2px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '11px', outline: 'none', textAlign: 'right' }} />
                            </td>
                          </tr>
                        </tbody>
                      </table>

                      {/* 총 합계 요약 그리드 */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', borderTop: '2px solid #0f766e', paddingTop: '8px' }}>
                        <div>
                          <strong style={{ fontSize: '12px', color: '#0f766e' }}>총 수입 원가 (Actual Cost): </strong>
                          <span style={{ fontSize: '13px', fontWeight: 'bold' }}>{Math.round(calculateEditTotalCost(editingRequest)).toLocaleString()} 원</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <strong style={{ fontSize: '12px', color: '#0f766e' }}>{(editingRequest.piItems?.[0]?.unit || 'UNIT')}당 단위 원가: </strong>
                          <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#b45309' }}>
                            {Math.round(calculateEditTotalCost(editingRequest) / (editingRequest.costBreakdown?.buyingQty || 1)).toLocaleString()} 원 / {(editingRequest.piItems?.[0]?.unit || 'UNIT')}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-default)', paddingBottom: '4px' }}>마진 및 고객 견적</span>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>마진율 (%)</label>
                        <input type="number" value={editingRequest.marginRate ?? ''} onChange={(e) => {
                          const rate = Number(e.target.value) || 0;
                          setEditingRequest(p => {
                            if (!p) return null;
                            const totalCost = calculateEditTotalCost(p);
                            const marginAmount = Math.round(totalCost * (rate / 100));
                            return { ...p, marginRate: rate, marginAmount, customerQuoteAmount: totalCost + marginAmount };
                          });
                        }} style={{ width: '120px', padding: '4px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12px', outline: 'none', textAlign: 'right' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>마진 금액 (₩)</label>
                        <strong style={{ fontSize: '12px', color: '#b45309' }}>{(editingRequest.marginAmount || 0).toLocaleString()} 원</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-default)', paddingTop: '6px', marginTop: '2px' }}>
                        <strong style={{ fontSize: '12px' }}>고객 제시 견적금액</strong>
                        <strong style={{ fontSize: '13px', color: '#1e3a8a' }}>{(editingRequest.customerQuoteAmount || 0).toLocaleString()} 원</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                        <strong style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>{(editingRequest.piItems?.[0]?.unit || 'UNIT')}당 최종 판매단가</strong>
                        <strong style={{ fontSize: '12.5px', color: '#10b981' }}>
                          {Math.round((editingRequest.customerQuoteAmount || 0) / (editingRequest.costBreakdown?.buyingQty || 1)).toLocaleString()} 원 / {(editingRequest.piItems?.[0]?.unit || 'UNIT')}
                        </strong>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', borderTop: '1px solid var(--border-default)', paddingTop: '6px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>고객사 진행 결정 (수입확정여부)</label>
                        <select
                          value={editingRequest.customerDecision || '검토중'}
                          onChange={(e) => {
                            const val = e.target.value as any;
                            const nextStatus = val === '승인' ? '발주 진행' : '진행 결정 요청';
                            setEditingRequest(p => p ? ({ ...p, customerDecision: val, status: nextStatus }) : null);
                          }}
                          style={{ padding: '4px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12px', outline: 'none', background: '#fff' }}
                        >
                          <option value="검토중">검토중 (Under Review)</option>
                          <option value="승인">승인 (Approved - 실무 진행)</option>
                          <option value="반려">반려 (Rejected)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 하단 제어 */}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button 
                  type="button" 
                  onClick={() => { setShowEditModal(false); setEditingRequest(null); }}
                  style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', color: 'var(--text-secondary)', borderRadius: '6px', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer' }}
                >
                  취소
                </button>
                <button 
                  type="submit"
                  style={{ padding: '8px 16px', background: '#2563eb', border: 'none', color: '#fff', borderRadius: '6px', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer' }}
                >
                  수정완료
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🔍 바이어(최종고객) 검색 모달 */}
      {showCustomerModal && (
        <CustomerSearchModal
          customers={customers}
          onClose={() => setShowCustomerModal(false)}
          onSelect={(cust) => {
            if (customerSelectTarget === 'new') {
              setNewRequest(p => ({ ...p, finalCustomer: cust.name }));
            } else {
              setEditingRequest(p => p ? ({ ...p, finalCustomer: cust.name }) : null);
            }
            setShowCustomerModal(false);
          }}
        />
      )}
    </div>
  );
};
