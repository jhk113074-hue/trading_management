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
      borderRadius: '16px', 
      width: '1150px', 
      maxWidth: '95vw',
      height: '82vh', 
      maxHeight: '95vh',
      display: 'flex', 
      flexDirection: 'column',
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
      overflow: 'hidden', 
      border: '1px solid var(--border-color)',
      resize: 'both',
      minWidth: '800px', 
      minHeight: '400px',
      userSelect: isDragging ? 'none' : 'auto'
    }}>
        {/* Header */}
        <div 
          onMouseDown={handleMouseDown}
          style={{
            padding: '20px 24px', borderBottom: '1px solid var(--border-color)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: '#f8fafc',
            cursor: 'move',
            userSelect: 'none'
          }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
              🔍 공급업체 검색 및 불러오기 (Subwindow)
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
              더블 클릭하거나 [선택] 버튼을 눌러 연계 참여 공급업체로 지정할 수 있습니다.
            </p>
          </div>
          <button 
            type="button"
            onClick={onClose}
            style={{
              background: 'none', border: 'none', fontSize: '20px',
              color: 'var(--text-muted)', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              padding: '4px', borderRadius: '50%', width: '32px', height: '32px',
              transition: 'background-color 0.2s, color 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f1f5f9';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'var(--text-muted)';
            }}
          >
            ✕
          </button>
        </div>

        {/* Filters */}
        <div style={{
          padding: '12px 24px', background: '#fff', borderBottom: '1px solid #f1f5f9',
          display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center'
        }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <span style={{
              position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-muted)', fontSize: '13px'
            }}>🔍</span>
            <input
              type="text"
              placeholder="공급사코드, 업체명, 대표자, 이메일, 담당자 등 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px 8px 32px',
                border: '1px solid var(--border-default)', borderRadius: '8px',
                fontSize: '12.5px', color: 'var(--text-primary)', outline: 'none',
                boxSizing: 'border-box'
              }}
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
              padding: '8px 16px', background: '#2563eb', color: '#fff',
              border: 'none', borderRadius: '8px', fontSize: '12.5px',
              fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
            }}
          >
            ＋ 신규등록
          </button>
        </div>

        {/* Results Info */}
        <div style={{
          padding: '8px 24px', background: '#f8fafc', borderBottom: '1px solid var(--border-color)',
          fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 500
        }}>
          검색 결과: <span style={{ color: '#2563eb', fontWeight: 700 }}>{filteredSuppliers.length}</span>개 공급업체
        </div>

        {/* Table View */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px 24px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
            <thead>
              <tr style={{
                position: 'sticky', top: 0, background: '#fff', zIndex: 10,
                borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 600
              }}>
                <th style={{ padding: '10px 8px' }}>공급사코드</th>
                <th style={{ padding: '10px 8px' }}>업체명</th>
                <th style={{ padding: '10px 8px' }}>사업자번호 / 대표자</th>
                <th style={{ padding: '10px 8px' }}>담당자 / 연락처</th>
                <th style={{ padding: '10px 8px' }}>이메일</th>
                <th style={{ padding: '10px 8px', width: '100px', textAlign: 'center' }}>선택</th>
              </tr>
            </thead>
            <tbody>
              {filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
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
                    <td style={{ padding: '10px 8px', fontWeight: 600, color: 'var(--focus-ring)' }}>{s.supplierCode}</td>
                    <td style={{ padding: '10px 8px', fontWeight: 700, color: 'var(--text-primary)' }}>{s.name}</td>
                    <td style={{ padding: '10px 8px' }}>
                      <div>{s.bizNumber || '-'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>대표: {s.representative || '-'}</div>
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <div>{s.managerName || '-'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{s.managerPhone || s.phone || '-'}</div>
                    </td>
                    <td style={{ padding: '10px 8px', color: '#4b5563' }}>{s.purchaseEmail || '-'}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSupplier(s);
                            setShowSupplierModal(true);
                          }}
                          style={{
                            background: '#f1f5f9', border: '1px solid var(--border-default)', padding: '6px 10px',
                            borderRadius: '6px', fontSize: '11.5px', fontWeight: 700,
                            color: 'var(--text-secondary)', cursor: 'pointer'
                          }}
                        >
                          ✏️ 수정
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelect(s)}
                          style={{
                            background: 'var(--primary-color)', border: 'none', padding: '6px 12px',
                            borderRadius: '6px', fontSize: '11.5px', fontWeight: 700,
                            color: '#fff', cursor: 'pointer'
                          }}
                        >
                          선택
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
