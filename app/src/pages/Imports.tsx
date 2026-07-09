import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ImportRequest } from '../types';
import { db, COMPANY_ID } from '../firebase';
import { collection, doc, getDocs, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { SupplierSearchModal } from '../components/SupplierSearchModal';
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

const INITIAL_IMPORTS: ImportRequest[] = [
  {
    id: '189348',
    status: '진행 결정 요청',
    blAwb: '-',
    poNumber: '-',
    itemName: 'Fiberglass tissue',
    transportType: 'FCA | 해상LCL',
    volume: '0.8 R.TON',
    routeFrom: '중국 위해항',
    routeTo: '한국 내륙',
    manager: '김주한',
    amount: 489316,
    createdAt: '26. 07. 03.'
  },
  {
    id: '189170',
    status: '진행 결정 요청',
    blAwb: '-',
    poNumber: '-',
    itemName: 'Prepreg CNC cutting machine',
    transportType: 'FOB | 해상FCL',
    volume: '20DRY * 1',
    routeFrom: '중국 닝보항',
    routeTo: '한국 내륙',
    manager: '김주한',
    amount: 1306054,
    createdAt: '26. 07. 03.'
  },
  {
    id: '185284',
    status: '진행 결정 요청',
    blAwb: '-',
    poNumber: '-',
    itemName: 'bopp film',
    transportType: 'FOB | 해상LCL',
    volume: '4 R.TON',
    routeFrom: '중국 청도항',
    routeTo: '한국 내륙',
    manager: '김주한',
    amount: 627848,
    createdAt: '26. 07. 03.'
  },
  {
    id: '182406',
    status: '진행 결정 요청',
    blAwb: '-',
    poNumber: 'PO-YSACC-FIL-2026-06',
    itemName: 'FILTER',
    transportType: 'EXW | 해상LCL',
    volume: '0.05 R.TON',
    routeFrom: '중국 내륙',
    routeTo: '한국 내륙',
    manager: '김주한',
    amount: 516340,
    createdAt: '26. 07. 03.'
  },
  {
    id: '181346',
    status: '진행 결정 요청',
    blAwb: '-',
    poNumber: 'PO-YS-SMC-2026-46',
    itemName: 'Sheet molding compound',
    transportType: 'FOB | 해상FCL',
    volume: '20DRY * 1',
    routeFrom: '중국 청도항',
    routeTo: '한국 내륙',
    manager: '김주한',
    amount: 1729433,
    createdAt: '26. 07. 03.'
  },
  {
    id: '181345',
    status: '진행 결정 요청',
    blAwb: '-',
    poNumber: 'PO-YS-SMC-2026-45',
    itemName: 'Sheet molding compound',
    transportType: 'FOB | 해상FCL',
    volume: '20DRY * 1',
    routeFrom: '중국 청도항',
    routeTo: '한국 내륙',
    manager: '김주한',
    amount: 1544923,
    createdAt: '26. 07. 03.'
  },
  {
    id: '181264',
    status: '진행 결정 요청',
    blAwb: '-',
    poNumber: 'PO-YSACC-CSM-2026-64',
    itemName: 'Carbon surface mat',
    transportType: 'FOB | 해상LCL',
    volume: '1.505 R.TON',
    routeFrom: '중국 상해항',
    routeTo: '한국 내륙',
    manager: '김주한',
    amount: 362466,
    createdAt: '26. 07. 03.'
  },
  {
    id: '180260',
    status: '진행 결정 요청',
    blAwb: '-',
    poNumber: '-',
    itemName: 'Zinc Sulphai',
    transportType: 'FOB | 해상LCL',
    volume: '2.38 R.TON',
    routeFrom: '중국 상해항',
    routeTo: '한국 내륙',
    manager: '김주한',
    amount: 460687,
    createdAt: '26. 07. 03.'
  }
];

export const Imports: React.FC<{ mode?: 'active' | 'quotes' }> = ({ mode = 'active' }) => {
  const isQuoteMode = mode === 'quotes';
  const navigate = useNavigate();
  const [importRequests, setImportRequests] = useState<ImportRequest[]>(INITIAL_IMPORTS);

  useEffect(() => {
    const importsRef = collection(doc(db, 'companies', COMPANY_ID), 'imports');
    const unsubscribe = onSnapshot(importsRef, (snap) => {
      if (snap.empty) {
        setImportRequests(INITIAL_IMPORTS);
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
    finalCustomer: '',
    incoterms: 'FOB',
    paymentTerms: '100% T/T in advance',
    pol: '',
    pod: '',
    origin: 'CHINA',
    requestDate: new Date().toISOString().slice(0, 10),
    requestedBy: '',
    requestNote: '',
    piItems: [{ name: '', qty: '', unitPrice: '', amount: '', hsCode: '', unit: 'EA', palletSize: '', cbm: '', netWeight: '', grossWeight: '' }]
  });

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
      setModalPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y
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

    const created: ImportRequest = {
      id: reqId,
      blAwb: '-',
      poNumber: generatedPo,
      itemName: computedItemName,
      transportType: newRequest.transportType || 'By Sea',
      volume: `${totalCbm.toFixed(2)} CBM`,
      routeFrom: newRequest.pol || newRequest.routeFrom || '중국 상해항',
      routeTo: newRequest.pod || '한국 내륙',
      manager: newRequest.manager || '김주한',
      amount: Number(newRequest.amount || 0),
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
      piItems: [{ name: '', qty: '', unitPrice: '', amount: '', hsCode: '', unit: 'EA', palletSize: '', cbm: '', netWeight: '', grossWeight: '' }]
    });
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

        return {
          ...req,
          ...editingRequest,
          poNumber: generatedPo,
          itemName: computedItemName,
          volume: `${totalCbm.toFixed(2)} CBM`,
          routeFrom: editingRequest.pol || editingRequest.routeFrom || req.routeFrom,
          routeTo: editingRequest.pod || editingRequest.routeTo || req.routeTo,
          amount: Number(editingRequest.amount || 0),
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
    const base = isQuoteMode ? importRequests : importRequests.filter(req => req.customerDecision === '승인');
    if (!searchTerm.trim()) return base;
    return base.filter(req =>
      req.itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.id.includes(searchTerm) ||
      req.routeFrom.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [importRequests, searchTerm, isQuoteMode]);

  return (
    <div style={{ padding: '24px', background: '#f8fafc', minHeight: 'calc(100vh - 64px)', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Title Header */}
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>{isQuoteMode ? '수입 견적관리' : '수입관리'}</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
          {isQuoteMode
            ? '고객사 수입요청 접수 및 해외공급사 견적/원가 산정 단계입니다. 고객이 진행을 승인하면 수입관리로 자동 이동합니다.'
            : '고객사가 진행을 승인한 수입 발주/물류/통관/정산 건 목록입니다. 견적 검토 중인 건은 수입 견적관리에서 확인하세요.'}
        </p>
      </div>

      {/* Filter panel */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-color)', marginBottom: '20px', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flex: 1 }}>
          <select style={{ padding: '8px 12px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', background: '#fff', outline: 'none' }}>
            <option>기간선택</option>
            <option>최근 1주일</option>
            <option>최근 1개월</option>
          </select>
          <div style={{ display: 'flex', border: '1px solid var(--border-default)', borderRadius: '6px', background: '#fff', overflow: 'hidden', maxWidth: '320px', width: '100%' }}>
            <input 
              type="text" 
              placeholder="의뢰번호, 품명, 출발지 검색..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ border: 'none', padding: '8px 12px', fontSize: '13.5px', outline: 'none', flex: 1 }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {isQuoteMode ? (
            <button
              onClick={() => setShowAddModal(true)}
              style={{ padding: '8px 16px', background: '#eff6ff', border: '1px solid #3b82f6', color: '#2563eb', borderRadius: '6px', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer' }}
            >
              신규 수입요청 등록
            </button>
          ) : (
            <button
              onClick={() => setShowAddModal(true)}
              style={{ padding: '8px 16px', background: '#ecfdf5', border: '1px solid #10b981', color: '#047857', borderRadius: '6px', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer' }}
            >
              신규 수입 확정등록
            </button>
          )}
          <button style={{ padding: '8px 16px', background: '#fff', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', borderRadius: '6px', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer' }}>
            목록 받기
          </button>
          <button style={{ padding: '8px 16px', background: '#fff', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', borderRadius: '6px', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer' }}>
            테이블 설정
          </button>
        </div>
      </div>

      {/* Main Table Grid */}
      <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#f1f5f9', borderBottom: '1px solid var(--border-default)', height: '44px' }}>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', width: '100px' }}>주문번호</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', width: '180px' }}>PO번호</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', width: '150px' }}>수입처</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', width: '180px' }}>품명</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', width: '160px' }}>운송내용</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', width: '140px', textAlign: 'center' }}>수입주체</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', width: '160px' }}>경로</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', width: '140px' }}>최종고객</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', width: '100px' }}>담당자</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', width: '140px', textAlign: 'right' }}>수입금액</th>
              {isQuoteMode && (
                <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', width: '110px', textAlign: 'center' }}>진행상태</th>
              )}
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', width: '70px', textAlign: 'center' }}>관리</th>
            </tr>
          </thead>
          <tbody>
            {filteredRequests.map(req => (
              <tr 
                key={req.id}
                onClick={() => navigate(`/imports/${req.id}`)}
                style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', height: '80px', transition: 'background 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
              >
                {/* 주문번호 */}
                <td style={{ padding: '12px 16px', fontSize: '13.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  {req.id}
                </td>

                {/* PO번호 */}
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {req.poNumber && req.poNumber !== '-' ? req.poNumber : '-'}
                  </span>
                </td>
                
                {/* 수입처 */}
                <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                  {req.importerName || req.shipperName || '-'}
                </td>

                {/* 품명 */}
                <td style={{ padding: '12px 16px', fontSize: '13.5px', fontWeight: 600, color: '#1e3a8a' }}>
                  {req.itemName}
                </td>

                {/* 운송내용 */}
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>{req.transportType}</span>
                    <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>{req.volume}</span>
                  </div>
                </td>

                {/* 수입주체 */}
                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                  {req.importCompany ? (
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, color: req.importCompany === 'YS' ? '#0369a1' : '#15803d', background: req.importCompany === 'YS' ? '#e0f2fe' : '#dcfce7' }}>
                      {req.importCompany}
                    </span>
                  ) : '-'}
                </td>

                {/* 경로 */}
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: '4px', flexDirection: 'column', fontSize: '12.5px', color: '#334155', fontWeight: 600 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      📍 {req.routeFrom} ➔
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)' }}>
                      ⚓ {req.routeTo}
                    </span>
                  </div>
                </td>

                {/* 최종고객 */}
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#334155', fontWeight: 500 }}>
                  {req.finalCustomer || '-'}
                </td>

                {/* 담당자 */}
                <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                  {req.manager}
                </td>

                {/* 수입금액 */}
                <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                  <span style={{ fontSize: '14.5px', fontWeight: 700, color: '#0f172a' }}>
                    ₩{req.amount.toLocaleString()}
                  </span>
                </td>

                {/* 진행상태 (견적모드 전용) */}
                {isQuoteMode && (
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
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
                        <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '12px', fontSize: '11.5px', fontWeight: 700, background: c.bg, color: c.color }}>
                          {decision}
                        </span>
                      );
                    })()}
                  </td>
                )}

                {/* 관리 (수정 및 삭제 버튼) */}
                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
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
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15), 0 0 1px 1px rgba(0,0,0,0.2)',
            boxSizing: 'border-box',
            pointerEvents: 'auto',
            resize: 'both',
            overflow: 'auto',
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
            
            <form onSubmit={handleAddRequest} style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1, paddingRight: '4px' }}>
              {/* 1단계: 수입요청 접수 정보 */}
              <div style={{ background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>📥 요청 접수일</label>
                  <input
                    type="date"
                    value={newRequest.requestDate || ''}
                    onChange={e => setNewRequest(p => ({ ...p, requestDate: e.target.value }))}
                    style={{ padding: '7px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13px', outline: 'none', background: '#fff' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>고객사 담당자</label>
                  <input
                    type="text"
                    value={newRequest.requestedBy || ''}
                    onChange={e => setNewRequest(p => ({ ...p, requestedBy: e.target.value }))}
                    placeholder="예: 홍길동 과장"
                    style={{ padding: '7px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13px', outline: 'none', background: '#fff' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>요청 내용 메모</label>
                  <input
                    type="text"
                    value={newRequest.requestNote || ''}
                    onChange={e => setNewRequest(p => ({ ...p, requestNote: e.target.value }))}
                    placeholder="고객사로부터 받은 수입요청 내용 요약"
                    style={{ padding: '7px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13px', outline: 'none', background: '#fff' }}
                  />
                </div>
              </div>

              {/* 기본 수입주체 & 수입처 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>수입주체 구분</label>
                  <select 
                    value={newRequest.importCompany || 'YSACC'} 
                    onChange={e => {
                      const comp = e.target.value as any;
                      setNewRequest(p => {
                        const tempId = p.id || Math.floor(100000 + Math.random() * 900000).toString();
                        const nextPo = computePoNumber(comp, p.importerName || '', tempId);
                        return { ...p, importCompany: comp, poNumber: nextPo, id: tempId };
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
                      value={newRequest.importerName || ''}
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>PO 번호 (자동 넘버링 / 수정가능)</label>
                  <input 
                    type="text" 
                    required
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

              {/* PO 번호 & PI 번호 라인 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>PO 번호 (자동 넘버링 / 수정가능)</label>
                  <input 
                    type="text" 
                    required
                    value={newRequest.poNumber || ''} 
                    onChange={e => setNewRequest(p => ({ ...p, poNumber: e.target.value }))}
                    style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                    placeholder="예: PO-YSACC-BOR-2026-01"
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>PI 번호 (상대회사 제공)</label>
                  <input 
                    type="text" 
                    value={newRequest.piNumber || ''} 
                    onChange={e => setNewRequest(p => ({ ...p, piNumber: e.target.value }))}
                    style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                    placeholder="예: PI20260701-01"
                  />
                </div>
              </div>

              {/* 최종고객 & INCOTERMS & B/L AWB 번호 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>최종고객</label>
                  <input 
                    type="text" 
                    value={newRequest.finalCustomer || ''} 
                    onChange={e => setNewRequest(p => ({ ...p, finalCustomer: e.target.value }))}
                    style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                    placeholder="예: 최종 납품처 기입"
                  />
                </div>
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
              </div>

              {/* PAYMENT TERMS & 운송수단 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
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

              {/* 출발PORT & 도착PORT & 견적 운임 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>출발 PORT</label>
                  <input 
                    type="text" 
                    required
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
                    required
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
                    required
                    value={newRequest.origin || 'CHINA'} 
                    onChange={e => setNewRequest(p => ({ ...p, origin: e.target.value }))}
                    style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                    placeholder="예: CHINA, KOREA"
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>견적 운임 (₩)</label>
                  <input 
                    type="number" 
                    value={newRequest.amount} 
                    onChange={e => setNewRequest(p => ({ ...p, amount: Number(e.target.value) }))}
                    style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                    placeholder="예: 500000"
                  />
                </div>
              </div>

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
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15), 0 0 1px 1px rgba(0,0,0,0.2)',
            boxSizing: 'border-box',
            pointerEvents: 'auto',
            resize: 'both',
            overflow: 'auto',
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
            
            <form onSubmit={handleEditRequest} style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1, paddingRight: '4px' }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>PO 번호 (자동 넘버링 / 수정가능)</label>
                  <input 
                    type="text" 
                    required
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

              {/* 최종고객 & INCOTERMS & B/L AWB 번호 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>최종고객</label>
                  <input 
                    type="text" 
                    value={editingRequest.finalCustomer || ''} 
                    onChange={e => setEditingRequest(p => p ? ({ ...p, finalCustomer: e.target.value }) : null)}
                    style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                    placeholder="예: 최종 납품처 기입"
                  />
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
                    required
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
                    required
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
                    required
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
    </div>
  );
};
