import React, { useState, useMemo } from 'react';
import { SupplierModal } from './SupplierModal';
import type { Supplier } from '../types/supplier';

interface Props {
  onClose: () => void;
  onSelect: (supplier: Supplier) => void;
  suppliers: Supplier[];
}

export const ForwarderSearchModal: React.FC<Props> = ({ onClose, onSelect, suppliers }) => {

  // Modeless Drag-to-move state
  const [position, setPosition] = useState({ x: 100, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = React.useRef({ x: 0, y: 0 });

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
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const filteredForwarders = useMemo(() => {
    // Filter only suppliers where category is "포워딩사"
    return (suppliers || []).filter(s => {
      const isForwarder = s && s.category === '포워딩사';
      const matchesSearch = s && (
        (s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.representative || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.address || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.bizNumber || '').toLowerCase().includes(searchTerm.toLowerCase())
      );
      return isForwarder && matchesSearch;
    });
  }, [suppliers, searchTerm]);

  return (
    <div style={{
      position: 'fixed',
      left: `${position.x}px`,
      top: `${position.y}px`,
      zIndex: 2000,
      pointerEvents: 'none',
      userSelect: isDragging ? 'none' : 'auto'
    }}>
      <div style={{
        background: '#fff', borderRadius: '14px', width: '92%', maxWidth: '850px',
        height: '75vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)',
        overflow: 'hidden', border: '1px solid var(--border-color)',
        pointerEvents: 'auto',
        resize: 'both',
        minWidth: '550px', minHeight: '300px'
      }}>
        {/* Header */}
        <div 
          onMouseDown={handleMouseDown}
          style={{
            padding: '16px 20px', borderBottom: '1px solid var(--border-color)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: '#f8fafc',
            cursor: 'move',
            userSelect: 'none'
          }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🔍</span> 포워딩/운송 업체 검색 및 선택 (Subwindow)
            </h3>
            <p style={{ margin: '3px 0 0 0', fontSize: '11px', color: 'var(--text-secondary)' }}>
              목록의 업체를 더블 클릭하거나 [선택] 버튼을 눌러 지정할 수 있습니다.
            </p>
          </div>
          <button 
            onClick={onClose}
            style={{
              background: 'none', border: 'none', fontSize: '20px',
              color: 'var(--text-muted)', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              padding: '4px', width: '32px', height: '32px',
              transition: 'color 0.15s'
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
          >
            ✕
          </button>
        </div>
 
        {/* Search Input & Add Button */}
        <div style={{ padding: '12px 20px', background: '#fff', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="업체명, 대표자, 주소 등으로 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              flex: 1, padding: '8px 12px',
              border: '1px solid var(--border-default)', borderRadius: '6px',
              fontSize: '12.5px', color: '#0f172a', outline: 'none',
              boxSizing: 'border-box',
              transition: 'border-color 0.15s'
            }}
            onFocus={e => e.target.style.borderColor = '#2563eb'}
            onBlur={e => e.target.style.borderColor = 'var(--border-default)'}
            autoFocus
          />
          <button 
            onClick={() => setShowRegisterModal(true)}
            style={{
              padding: '8px 16px', background: '#10b981', color: '#fff',
              border: 'none', borderRadius: '6px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
              boxShadow: '0 2px 4px rgba(16,185,129,0.15)', transition: 'background-color 0.15s'
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#059669'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#10b981'}
          >
            ➕ 신규등록
          </button>
        </div>

        {/* List Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {filteredForwarders.length === 0 ? (
            <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12.5px' }}>
              검색된 포워더/운송 업체가 없습니다.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 700, background: '#f8fafc' }}>
                  <th style={{ padding: '8px 10px' }}>업체명</th>
                  <th style={{ padding: '8px 10px' }}>사업자번호</th>
                  <th style={{ padding: '8px 10px' }}>대표자</th>
                  <th style={{ padding: '8px 10px' }}>전화번호</th>
                  <th style={{ padding: '8px 10px', width: '130px', textAlign: 'center' }}>관리</th>
                </tr>
              </thead>
              <tbody>
                {filteredForwarders.map(s => (
                  <tr 
                    key={s.id} 
                    onDoubleClick={() => onSelect(s)}
                    style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background-color 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <td style={{ padding: '10px', fontWeight: 700, color: '#0f172a' }}>{s.name}</td>
                    <td style={{ padding: '10px', color: 'var(--text-secondary)' }}>{s.bizNumber || '-'}</td>
                    <td style={{ padding: '10px', color: 'var(--text-secondary)' }}>{s.representative || '-'}</td>
                    <td style={{ padding: '10px', color: 'var(--text-secondary)' }}>{s.phone || '-'}</td>
                    <td style={{ padding: '10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                        <button
                          onClick={() => onSelect(s)}
                          title="선택"
                          style={{
                            width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                            background: '#3b82f6', color: '#fff',
                            border: 'none', borderRadius: '4px', cursor: 'pointer',
                            fontSize: '13px', transition: 'background-color 0.15s'
                          }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2563eb'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#3b82f6'}
                        >
                          ✔️
                        </button>
                        <button
                          onClick={() => {
                            setEditingSupplier(s);
                            setShowEditModal(true);
                          }}
                          title="편집"
                          style={{
                            width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                            background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569',
                            borderRadius: '4px', cursor: 'pointer',
                            fontSize: '12px', transition: 'background-color 0.15s'
                          }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => {
                            const { id: _, supplierCode: __, ...copied } = s;
                            setEditingSupplier({
                              ...copied,
                              name: `${s.name} (복사본)`
                            } as any);
                            setShowEditModal(true);
                          }}
                          title="복사"
                          style={{
                            width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                            background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534',
                            borderRadius: '4px', cursor: 'pointer',
                            fontSize: '12px', transition: 'background-color 0.15s'
                          }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#dcfce7'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f0fdf4'}
                        >
                          📋
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (window.confirm(`${s.name} 업체를 삭제하시겠습니까?`)) {
                              try {
                                const { deleteDoc, doc } = await import('firebase/firestore');
                                const { db, COMPANY_ID } = await import('../firebase');
                                await deleteDoc(doc(db, 'companies', COMPANY_ID, 'suppliers', s.id));
                              } catch (err) {
                                console.error('Failed to delete supplier:', err);
                                alert('삭제에 실패했습니다.');
                              }
                            }
                          }}
                          title="삭제"
                          style={{
                            width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                            background: '#fef2f2', border: '1px solid #fee2e2', color: '#991b1b',
                            borderRadius: '4px', cursor: 'pointer',
                            fontSize: '12px', transition: 'background-color 0.15s'
                          }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fee2e2'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fef2f2'}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 신규 공급사 정식 등록 모달 오버레이 연결 */}
      {showRegisterModal && (
        <SupplierModal 
          defaultCategory="포워딩사"
          onClose={() => setShowRegisterModal(false)} 
          onSave={(newForwarder) => {
            onSelect(newForwarder);
            setShowRegisterModal(false);
          }}
        />
      )}

      {/* 포워딩사 수정 및 복사 모달 오버레이 연결 */}
      {showEditModal && editingSupplier && (
        <SupplierModal 
          initialSupplier={editingSupplier}
          defaultCategory="포워딩사"
          onClose={() => {
            setShowEditModal(false);
            setEditingSupplier(null);
          }} 
          onSave={() => {
            setShowEditModal(false);
            setEditingSupplier(null);
          }}
        />
      )}
    </div>
  );
};
