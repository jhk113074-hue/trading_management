import React, { useState, useMemo } from 'react';
import type { Supplier } from '../types/supplier';
import { SupplierModal } from './SupplierModal';

interface Props {
  onClose: () => void;
  onSelect: (supplier: Supplier) => void;
  suppliers: Supplier[];
  onRefreshSuppliers?: () => void;
}

export const SupplierSearchModal: React.FC<Props> = ({ onClose, onSelect, suppliers, onRefreshSuppliers }) => {
  // Modeless Drag-to-move state
  const [position, setPosition] = useState({ x: 120, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = React.useRef({ x: 0, y: 0 });

  // 공급업체 신규등록/수정 서브 모달리스 상태
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | undefined>(undefined);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const nextX = Math.max(0, Math.min(window.innerWidth - 300, e.clientX - dragStartRef.current.x));
      const nextY = Math.max(0, Math.min(window.innerHeight - 150, e.clientY - dragStartRef.current.y));
      setPosition({ x: nextX, y: nextY });
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
  }, [isDragging]);

  const [searchTerm, setSearchTerm] = useState('');

  // Filtered suppliers list
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(s => {
      return (
        (s.supplierCode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.representative || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.bizNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.managerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.purchaseEmail || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.address || '').toLowerCase().includes(searchTerm.toLowerCase())
      );
    });
  }, [suppliers, searchTerm]);

  return (
    <div style={{
      position: 'fixed',
      left: `${position.x}px`,
      top: `${position.y}px`,
      zIndex: 30000,
      background: '#fff', 
      width: '1150px', 
      maxWidth: '95vw',
      height: '82vh', 
      maxHeight: '95vh',
      display: 'flex', 
      flexDirection: 'column',
      overflow: 'hidden', 
      border: '1px solid #cbd5e1',
      resize: 'both',
      minWidth: '800px', 
      minHeight: '400px',
      borderRadius: '4px',
      boxShadow: '0 20px 40px rgba(15,23,42,0.2)',
      userSelect: isDragging ? 'none' : 'auto'
    }}>
        {/* Header */}
        <div 
          onMouseDown={handleMouseDown}
          style={{
            padding: '16px 24px', borderBottom: '1px solid #cbd5e1',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: '#fafafa',
            cursor: 'move',
            userSelect: 'none'
          }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>
              🔍 공급업체 검색 및 불러오기 (Subwindow)
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#64748b', fontWeight: 500 }}>
              더블 클릭하거나 [선택] 버튼을 눌러 연계 참여 공급업체로 지정할 수 있습니다.
            </p>
          </div>
          <button 
            type="button"
            onClick={onClose}
            style={{
              background: 'none', border: 'none', fontSize: '20px',
              color: '#64748b', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              padding: '4px', borderRadius: '4px', width: '32px', height: '32px',
              transition: 'background-color 0.2s, color 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#e2e8f0';
              e.currentTarget.style.color = '#1e293b';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#64748b';
            }}
          >
            ✕
          </button>
        </div>

        {/* Filters */}
        <div style={{
          padding: '12px 24px', background: '#fff', borderBottom: '1px solid #cbd5e1',
          display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center'
        }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <span style={{
              position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
              color: '#94a3b8', fontSize: '13px'
            }}>🔍</span>
            <input
              type="text"
              placeholder="공급사코드, 업체명, 대표자, 이메일, 담당자 등 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%', padding: '0 12px 0 32px',
                border: '1px solid #cbd5e1', borderRadius: '4px',
                fontSize: '13px', color: '#1e293b', outline: 'none',
                boxSizing: 'border-box', height: '34px'
              }}
              onFocus={e => e.target.style.borderColor = '#3b82f6'}
              onBlur={e => e.target.style.borderColor = '#cbd5e1'}
              autoFocus
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingSupplier(undefined);
              setShowSupplierModal(true);
            }}
            style={{
              padding: '0 16px', background: '#3b82f6', color: '#fff',
              border: 'none', borderRadius: '4px', fontSize: '13px',
              fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', height: '34px',
              transition: 'background 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2563eb'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#3b82f6'}
          >
            ＋ 신규등록
          </button>
        </div>

        {/* Results Info */}
        <div style={{
          padding: '8px 24px', background: '#f8fafc', borderBottom: '1px solid #cbd5e1',
          fontSize: '11px', color: '#64748b', fontWeight: 500
        }}>
          검색 결과: <span style={{ color: '#3b82f6', fontWeight: 800 }}>{filteredSuppliers.length}</span>개 공급업체
        </div>

        {/* Table View */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px 24px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
            <thead>
              <tr style={{
                position: 'sticky', top: 0, background: '#fff', zIndex: 10,
                borderBottom: '1px solid #cbd5e1', color: '#475569', fontWeight: 750
              }}>
                <th style={{ padding: '10px 8px' }}>공급사코드</th>
                <th style={{ padding: '10px 8px' }}>업체명</th>
                <th style={{ padding: '10px 8px' }}>사업자번호 / 대표자</th>
                <th style={{ padding: '10px 8px' }}>담당자 / 연락처</th>
                <th style={{ padding: '10px 8px' }}>이메일</th>
                <th style={{ padding: '10px 8px', width: '130px', textAlign: 'center' }}>액션</th>
              </tr>
            </thead>
            <tbody>
              {filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                    검색 결과가 없습니다. 다른 검색어를 입력해보세요.
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map(s => (
                  <tr
                    key={s.id}
                    onDoubleClick={() => onSelect(s)}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer',
                      transition: 'background-color 0.15s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <td style={{ padding: '10px 8px', fontWeight: 600, color: '#3b82f6' }}>{s.supplierCode}</td>
                    <td style={{ padding: '10px 8px', fontWeight: 700, color: '#1e293b' }}>{s.name}</td>
                    <td style={{ padding: '10px 8px' }}>
                      <div>{s.bizNumber || '-'}</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>대표: {s.representative || '-'}</div>
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <div>{s.managerName || '-'}</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>{s.managerPhone || s.phone || '-'}</div>
                    </td>
                    <td style={{ padding: '10px 8px', color: '#1e293b' }}>{s.purchaseEmail || '-'}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSupplier(s);
                            setShowSupplierModal(true);
                          }}
                          title="수정"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '32px',
                            height: '32px',
                            background: '#f1f5f9',
                            border: '1px solid #cbd5e1',
                            borderRadius: '4px',
                            color: '#475569',
                            cursor: 'pointer',
                            boxSizing: 'border-box',
                            transition: 'background 0.2s'
                          }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelect(s)}
                          title="선택"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '32px',
                            height: '32px',
                            background: '#3b82f6',
                            border: 'none',
                            borderRadius: '4px',
                            color: '#fff',
                            cursor: 'pointer',
                            boxSizing: 'border-box',
                            transition: 'background 0.2s'
                          }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2563eb'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#3b82f6'}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

      {/* Supplier Modal for Register/Edit Supplier */}
      {showSupplierModal && (
        <SupplierModal
          initialSupplier={editingSupplier}
          onClose={() => {
            setShowSupplierModal(false);
            if (onRefreshSuppliers) onRefreshSuppliers();
          }}
          onSave={() => {
            setShowSupplierModal(false);
            if (onRefreshSuppliers) onRefreshSuppliers();
          }}
        />
      )}
    </div>
  );
};
