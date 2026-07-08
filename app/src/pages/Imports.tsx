import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ImportRequest } from '../types';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';

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
    poNumber: '-',
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
    poNumber: '-',
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
    poNumber: '-',
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
    poNumber: '-',
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

export const Imports: React.FC = () => {
  const navigate = useNavigate();
  const [importRequests, setImportRequests] = useState<ImportRequest[]>(() => {
    const saved = localStorage.getItem('import_requests');
    return saved ? JSON.parse(saved) : INITIAL_IMPORTS;
  });
  
  const [suppliers, setSuppliers] = useState<any[]>([]);
  
  useEffect(() => {
    const loadSuppliers = async () => {
      try {
        const snap = await getDocs(collection(db, 'companies', 'YSACC', 'suppliers'));
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setSuppliers(list);
      } catch (err) {
        console.error("Failed to load suppliers inside Imports:", err);
      }
    };
    loadSuppliers();
  }, []);

  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // 신규 등록 폼 상태
  const [newRequest, setNewRequest] = useState<Partial<ImportRequest>>({
    itemName: '',
    transportType: 'FOB | 해상LCL',
    volume: '1.0 R.TON',
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
    piItems: [{ name: '', qty: '', unitPrice: '', amount: '', hsCode: '' }],
    packingPallets: [{ palletSize: '', qty: '', cbm: '', weight: '' }]
  });

  const saveToStorage = (data: ImportRequest[]) => {
    localStorage.setItem('import_requests', JSON.stringify(data));
    setImportRequests(data);
  };

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

    const created: ImportRequest = {
      id: reqId,
      status: '진행 결정 요청',
      blAwb: '-',
      poNumber: '-',
      itemName: computedItemName,
      transportType: newRequest.transportType || 'FOB | 해상LCL',
      volume: newRequest.volume || '1.0 R.TON',
      routeFrom: newRequest.pol || newRequest.routeFrom || '중국 상해항',
      routeTo: newRequest.pod || '한국 내륙',
      manager: newRequest.manager || '김주한',
      amount: Number(newRequest.amount || 0),
      createdAt: '26. 07. 08.',
      importCompany: newRequest.importCompany || 'YSACC',
      importerName: newRequest.importerName || '',
      finalCustomer: newRequest.finalCustomer || '',
      
      incoterms: newRequest.incoterms || 'FOB',
      paymentTerms: newRequest.paymentTerms || '100% T/T in advance',
      pol: newRequest.pol || '',
      pod: newRequest.pod || '',
      piItems: newRequest.piItems || [],
      packingPallets: newRequest.packingPallets || [],
      
      // Default 상세
      portOfLoading: newRequest.pol || newRequest.routeFrom,
      portOfDischarge: newRequest.pod || '인천항',
      packingQty: newRequest.packingPallets ? newRequest.packingPallets.reduce((sum, p) => sum + (Number(p.qty) || 0), 0) : 10,
      packingUnit: 'PALLET',
      dimensions: newRequest.packingPallets && newRequest.packingPallets[0] ? newRequest.packingPallets[0].palletSize : '120*80*100(CM)',
      weight: newRequest.packingPallets ? `${newRequest.packingPallets.reduce((sum, p) => sum + (Number(p.weight) || 0), 0)}KG` : '150KG',
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
      transportType: 'FOB | 해상LCL',
      volume: '1.0 R.TON',
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
      piItems: [{ name: '', qty: '', unitPrice: '', amount: '', hsCode: '' }],
      packingPallets: [{ palletSize: '', qty: '', cbm: '', weight: '' }]
    });
  };

  const handleDeleteRequest = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`의뢰번호 ${id} 수입운송 건을 삭제하시겠습니까?`)) {
      const nextList = importRequests.filter(req => req.id !== id);
      saveToStorage(nextList);
    }
  };

  const filteredRequests = useMemo(() => {
    if (!searchTerm.trim()) return importRequests;
    return importRequests.filter(req => 
      req.itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      req.id.includes(searchTerm) ||
      req.routeFrom.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [importRequests, searchTerm]);

  return (
    <div style={{ padding: '24px', background: '#f8fafc', minHeight: 'calc(100vh - 64px)', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Title Header */}
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>수입관리</h2>
        <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>수입운송 진행 및 의뢰관리 목록입니다.</p>
      </div>

      {/* Filter panel */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '20px', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flex: 1 }}>
          <select style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13.5px', background: '#fff', outline: 'none' }}>
            <option>기간선택</option>
            <option>최근 1주일</option>
            <option>최근 1개월</option>
          </select>
          <div style={{ display: 'flex', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#fff', overflow: 'hidden', maxWidth: '320px', width: '100%' }}>
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
          <button 
            onClick={() => setShowAddModal(true)}
            style={{ padding: '8px 16px', background: '#eff6ff', border: '1px solid #3b82f6', color: '#2563eb', borderRadius: '6px', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer' }}
          >
            운송의뢰 추가
          </button>
          <button style={{ padding: '8px 16px', background: '#fff', border: '1px solid #cbd5e1', color: '#475569', borderRadius: '6px', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer' }}>
            목록 받기
          </button>
          <button style={{ padding: '8px 16px', background: '#fff', border: '1px solid #cbd5e1', color: '#475569', borderRadius: '6px', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer' }}>
            테이블 설정
          </button>
        </div>
      </div>

      {/* Main Table Grid */}
      <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', height: '44px' }}>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: '#475569', width: '130px' }}>주문번호</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: '#475569', width: '150px' }}>수입처</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: '#475569', width: '180px' }}>품명</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: '#475569', width: '160px' }}>운송내용</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: '#475569', width: '140px', textAlign: 'center' }}>수입주체</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: '#475569', width: '160px' }}>경로</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: '#475569', width: '140px' }}>최종고객</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: '#475569', width: '100px' }}>담당자</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: '#475569', width: '140px', textAlign: 'right' }}>수입금액</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: '#475569', width: '70px', textAlign: 'center' }}>관리</th>
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
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#1e293b' }}>{req.id}</span>
                    {req.poNumber && req.poNumber !== '-' && (
                      <span style={{ fontSize: '11px', color: '#64748b' }}>PO: {req.poNumber}</span>
                    )}
                  </div>
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
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>{req.transportType}</span>
                    <span style={{ fontSize: '11.5px', color: '#64748b' }}>{req.volume}</span>
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
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#64748b' }}>
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
                
                {/* 관리 (삭제 버튼) */}
                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10009 }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '800px', maxWidth: '95%', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#1e293b' }}>신규수입등록</h3>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>
            
            <form onSubmit={handleAddRequest} style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '70vh', overflowY: 'auto', paddingRight: '6px' }}>
              {/* 기본 수입주체 & 수입처 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#475569' }}>수입주체 구분</label>
                  <select 
                    value={newRequest.importCompany || 'YSACC'} 
                    onChange={e => setNewRequest(p => ({ ...p, importCompany: e.target.value as any }))}
                    style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13.5px', outline: 'none', background: '#fff' }}
                  >
                    <option value="YSACC">YSACC</option>
                    <option value="YS">YS (영성ACC)</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#475569' }}>수입처 (공급업체관리 연결)</label>
                  <select 
                    required
                    value={newRequest.importerName || ''} 
                    onChange={e => setNewRequest(p => ({ ...p, importerName: e.target.value }))}
                    style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13.5px', outline: 'none', background: '#fff' }}
                  >
                    <option value="">-- 공급업체 선택 --</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.nameKo || s.nameEn || s.companyName || s.id}>
                        {s.nameKo || s.nameEn || s.companyName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 최종고객 & INCOTERMS */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#475569' }}>최종고객</label>
                  <input 
                    type="text" 
                    value={newRequest.finalCustomer || ''} 
                    onChange={e => setNewRequest(p => ({ ...p, finalCustomer: e.target.value }))}
                    style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                    placeholder="예: 최종 납품처 기입"
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#475569' }}>INCOTERMS</label>
                  <select 
                    value={newRequest.incoterms || 'FOB'} 
                    onChange={e => setNewRequest(p => ({ ...p, incoterms: e.target.value }))}
                    style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13.5px', outline: 'none', background: '#fff' }}
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
              </div>

              {/* PAYMENT TERMS & 운송수단 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#475569' }}>PAYMENT TERMS</label>
                  <input 
                    type="text" 
                    value={newRequest.paymentTerms || ''} 
                    onChange={e => setNewRequest(p => ({ ...p, paymentTerms: e.target.value }))}
                    style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                    placeholder="예: 100% T/T in advance"
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#475569' }}>운송 형태 및 수단</label>
                  <input 
                    type="text" 
                    value={newRequest.transportType} 
                    onChange={e => setNewRequest(p => ({ ...p, transportType: e.target.value }))}
                    style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                    placeholder="예: FOB | 해상LCL"
                  />
                </div>
              </div>

              {/* 출발PORT & 도착PORT */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#475569' }}>출발 PORT</label>
                  <input 
                    type="text" 
                    required
                    value={newRequest.pol || ''} 
                    onChange={e => setNewRequest(p => ({ ...p, pol: e.target.value }))}
                    style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                    placeholder="예: SHANGHAI PORT, CHINA"
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#475569' }}>도착 PORT</label>
                  <input 
                    type="text" 
                    required
                    value={newRequest.pod || ''} 
                    onChange={e => setNewRequest(p => ({ ...p, pod: e.target.value }))}
                    style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                    placeholder="예: INCHEON PORT, KOREA"
                  />
                </div>
              </div>

              {/* 물량단위 및 견적운임 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#475569' }}>총 물량 / 단위</label>
                  <input 
                    type="text" 
                    value={newRequest.volume} 
                    onChange={e => setNewRequest(p => ({ ...p, volume: e.target.value }))}
                    style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#475569' }}>견적 운임 (₩)</label>
                  <input 
                    type="number" 
                    value={newRequest.amount} 
                    onChange={e => setNewRequest(p => ({ ...p, amount: Number(e.target.value) }))}
                    style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                  />
                </div>
              </div>

              {/* 4. 동적 수입 제품 라인 테이블 */}
              <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '12px', background: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>📦 수입 제품 세부 목록 (DESCRIPTION OF COMMODITY)</span>
                  <button 
                    type="button" 
                    onClick={() => setNewRequest(p => ({ ...p, piItems: [...(p.piItems || []), { name: '', qty: '', unitPrice: '', amount: '', hsCode: '' }] }))}
                    style={{ padding: '2px 8px', border: '1px solid #2563eb', borderRadius: '4px', background: '#fff', color: '#2563eb', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    ＋ 품목 추가
                  </button>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#e2e8f0', borderBottom: '1px solid #cbd5e1', height: '28px' }}>
                      <th style={{ padding: '4px', width: '30px', textAlign: 'center' }}>No</th>
                      <th style={{ padding: '4px', textAlign: 'left' }}>DESCRIPTION OF COMMODITY</th>
                      <th style={{ padding: '4px', width: '90px' }}>HS CODE</th>
                      <th style={{ padding: '4px', width: '70px', textAlign: 'right' }}>QUANTITY</th>
                      <th style={{ padding: '4px', width: '50px', textAlign: 'center' }}>UNIT</th>
                      <th style={{ padding: '4px', width: '80px', textAlign: 'right' }}>UNIT PRICE</th>
                      <th style={{ padding: '4px', width: '90px', textAlign: 'right' }}>TOTAL</th>
                      <th style={{ padding: '4px', width: '30px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(newRequest.piItems || []).map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '4px', textAlign: 'center', fontWeight: 'bold' }}>{idx + 1}</td>
                        <td style={{ padding: '4px' }}>
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
                            style={{ width: '100%', padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', outline: 'none', boxSizing: 'border-box' }}
                            placeholder="예: E-GLASS SURFACE TISSUE"
                          />
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
                            style={{ width: '100%', padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', outline: 'none', boxSizing: 'border-box' }}
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
                            style={{ width: '100%', padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }}
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
                            style={{ width: '100%', padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', outline: 'none', textAlign: 'center', boxSizing: 'border-box' }}
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
                            style={{ width: '100%', padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }}
                          />
                        </td>
                        <td style={{ padding: '4px' }}>
                          <input 
                            type="text" 
                            value={item.amount} 
                            onChange={e => {
                              const val = e.target.value;
                              setNewRequest(p => {
                                const next = [...(p.piItems || [])];
                                next[idx] = { ...next[idx], amount: val };
                                return { ...p, piItems: next };
                              });
                            }}
                            style={{ width: '100%', padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }}
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
                  </tbody>
                </table>
              </div>

              {/* 7. 동적 패킹 사양 테이블 (PALLET SIZE / NOS of PLT / CBM / WEIGHT) */}
              <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '12px', background: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>📦 패킹 사양 목록 (PALLET SIZE / NOS of PLT / CBM / WEIGHT)</span>
                  <button 
                    type="button" 
                    onClick={() => setNewRequest(p => ({ ...p, packingPallets: [...(p.packingPallets || []), { palletSize: '', qty: '', cbm: '', weight: '' }] }))}
                    style={{ padding: '2px 8px', border: '1px solid #2563eb', borderRadius: '4px', background: '#fff', color: '#2563eb', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    ＋ 패킹 사양 추가
                  </button>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#e2e8f0', borderBottom: '1px solid #cbd5e1', height: '28px' }}>
                      <th style={{ padding: '4px', textAlign: 'left' }}>PALLET SIZE</th>
                      <th style={{ padding: '4px', width: '100px', textAlign: 'right' }}>NOS of PLT</th>
                      <th style={{ padding: '4px', width: '100px', textAlign: 'right' }}>CBM</th>
                      <th style={{ padding: '4px', width: '110px', textAlign: 'right' }}>WEIGHT (KG)</th>
                      <th style={{ padding: '4px', width: '30px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(newRequest.packingPallets || []).map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '4px' }}>
                          <input 
                            type="text" 
                            value={item.palletSize} 
                            onChange={e => {
                              const val = e.target.value;
                              setNewRequest(p => {
                                const next = [...(p.packingPallets || [])];
                                next[idx] = { ...next[idx], palletSize: val };
                                return { ...p, packingPallets: next };
                              });
                            }}
                            style={{ width: '100%', padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', outline: 'none', boxSizing: 'border-box' }}
                            placeholder="예: 110*110*120(CM)"
                          />
                        </td>
                        <td style={{ padding: '4px' }}>
                          <input 
                            type="text" 
                            value={item.qty} 
                            onChange={e => {
                              const val = e.target.value;
                              setNewRequest(p => {
                                const next = [...(p.packingPallets || [])];
                                next[idx] = { ...next[idx], qty: val };
                                return { ...p, packingPallets: next };
                              });
                            }}
                            style={{ width: '100%', padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }}
                            placeholder="예: 2"
                          />
                        </td>
                        <td style={{ padding: '4px' }}>
                          <input 
                            type="text" 
                            value={item.cbm} 
                            onChange={e => {
                              const val = e.target.value;
                              setNewRequest(p => {
                                const next = [...(p.packingPallets || [])];
                                next[idx] = { ...next[idx], cbm: val };
                                return { ...p, packingPallets: next };
                              });
                            }}
                            style={{ width: '100%', padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }}
                            placeholder="예: 2.8"
                          />
                        </td>
                        <td style={{ padding: '4px' }}>
                          <input 
                            type="text" 
                            value={item.weight} 
                            onChange={e => {
                              const val = e.target.value;
                              setNewRequest(p => {
                                const next = [...(p.packingPallets || [])];
                                next[idx] = { ...next[idx], weight: val };
                                return { ...p, packingPallets: next };
                              });
                            }}
                            style={{ width: '100%', padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }}
                            placeholder="예: 850"
                          />
                        </td>
                        <td style={{ padding: '4px', textAlign: 'center' }}>
                          {newRequest.packingPallets && newRequest.packingPallets.length > 1 && (
                            <button 
                              type="button" 
                              onClick={() => setNewRequest(p => ({ ...p, packingPallets: (p.packingPallets || []).filter((_, i) => i !== idx) }))}
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                              ✕
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 하단 제어 */}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button 
                  type="button" 
                  onClick={() => setShowAddModal(false)}
                  style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', color: '#475569', borderRadius: '6px', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer' }}
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

    </div>
  );
};
