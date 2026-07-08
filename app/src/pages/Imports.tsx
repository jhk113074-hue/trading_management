import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ImportRequest } from '../types';

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
  
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // 신규 등록 폼 상태
  const [newRequest, setNewRequest] = useState<Partial<ImportRequest>>({
    itemName: '',
    transportType: 'FOB | 해상LCL',
    volume: '1.0 R.TON',
    routeFrom: '중국 상해항',
    routeTo: '한국 내륙',
    manager: '김주한',
    amount: 500000
  });

  const saveToStorage = (data: ImportRequest[]) => {
    localStorage.setItem('import_requests', JSON.stringify(data));
    setImportRequests(data);
  };

  const handleAddRequest = (e: React.FormEvent) => {
    e.preventDefault();
    const reqId = String(Math.floor(100000 + Math.random() * 900000));
    const created: ImportRequest = {
      id: reqId,
      status: '진행 결정 요청',
      blAwb: '-',
      poNumber: '-',
      itemName: newRequest.itemName || '미지정 품목',
      transportType: newRequest.transportType || 'FOB | 해상LCL',
      volume: newRequest.volume || '1.0 R.TON',
      routeFrom: newRequest.routeFrom || '중국 상해항',
      routeTo: '한국 내륙',
      manager: newRequest.manager || '김주한',
      amount: Number(newRequest.amount || 0),
      createdAt: '26. 07. 08.',
      // Default 상세
      portOfLoading: newRequest.routeFrom,
      portOfDischarge: '인천항',
      packingQty: 10,
      packingUnit: 'BOXES',
      dimensions: '120*80*100(CM)',
      weight: '150KG',
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
      routeFrom: '중국 상해항',
      routeTo: '한국 내륙',
      manager: '김주한',
      amount: 500000
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
        <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>수입운송 - 의뢰</h2>
        <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>운송 진행 전 단계의 의뢰 목록입니다.</p>
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
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: '#475569', width: '130px' }}>상태</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: '#475569', width: '180px' }}>의뢰정보</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: '#475569' }}>품명</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: '#475569' }}>운송내용</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: '#475569' }}>경로</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: '#475569', width: '100px', textAlign: 'center' }}>운송일정</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: '#475569', width: '100px' }}>담당자</th>
              <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: '#475569', width: '140px', textAlign: 'right' }}>운임</th>
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
                {/* 상태 */}
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, color: '#d97706', background: '#fef3c7', textAlign: 'center', width: 'fit-content' }}>
                      {req.status}
                    </span>
                    <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>수출자 정보 입력 &gt;</span>
                  </div>
                </td>
                
                {/* 의뢰정보 */}
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>의뢰번호: {req.id}</span>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>BL(AWB): {req.blAwb}</span>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>PO번호: {req.poNumber}</span>
                  </div>
                </td>

                {/* 품명 */}
                <td style={{ padding: '12px 16px', fontSize: '13.5px', fontWeight: 600, color: '#334155' }}>
                  {req.itemName}
                </td>

                {/* 운송내용 */}
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>{req.transportType}</span>
                    <span style={{ fontSize: '11.5px', color: '#64748b' }}>{req.volume}</span>
                  </div>
                </td>

                {/* 경로 */}
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: '4px', flexDirection: 'column', fontSize: '12.5px', color: '#334155', fontWeight: 600 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      📍 {req.routeFrom} ➔
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#475569' }}>
                      ⚓ {req.routeTo}
                    </span>
                  </div>
                </td>

                {/* 운송일정 */}
                <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '13px', color: '#94a3b8' }}>
                  -
                </td>

                {/* 담당자 */}
                <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                  {req.manager}
                </td>

                {/* 운임 */}
                <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '14.5px', fontWeight: 700, color: '#1e293b' }}>
                      ₩{req.amount.toLocaleString()}
                    </span>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>(견적 금액)</span>
                  </div>
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
          <div style={{ background: '#fff', borderRadius: '12px', width: '480px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 800 }}>신규 수입운송 의뢰 등록</h3>
            <form onSubmit={handleAddRequest} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 600, color: '#475569' }}>수입 품명</label>
                <input 
                  type="text" 
                  required
                  value={newRequest.itemName} 
                  onChange={e => setNewRequest(p => ({ ...p, itemName: e.target.value }))}
                  style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                  placeholder="예: Fiberglass tissue"
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 600, color: '#475569' }}>운송 조건 및 수단</label>
                <input 
                  type="text" 
                  value={newRequest.transportType} 
                  onChange={e => setNewRequest(p => ({ ...p, transportType: e.target.value }))}
                  style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 600, color: '#475569' }}>물량 / 단위</label>
                <input 
                  type="text" 
                  value={newRequest.volume} 
                  onChange={e => setNewRequest(p => ({ ...p, volume: e.target.value }))}
                  style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 600, color: '#475569' }}>출발지</label>
                <input 
                  type="text" 
                  value={newRequest.routeFrom} 
                  onChange={e => setNewRequest(p => ({ ...p, routeFrom: e.target.value }))}
                  style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 600, color: '#475569' }}>견적 운임 (₩)</label>
                <input 
                  type="number" 
                  value={newRequest.amount} 
                  onChange={e => setNewRequest(p => ({ ...p, amount: Number(e.target.value) }))}
                  style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                />
              </div>
              
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
