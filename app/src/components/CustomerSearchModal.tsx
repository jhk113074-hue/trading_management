import React, { useState, useMemo } from 'react';
import type { Customer } from '../types/customer';
import { doc, deleteDoc } from 'firebase/firestore';
import { db, COMPANY_ID } from '../firebase';
import { CustomerModal } from './CustomerModal';

interface Props {
  onClose: () => void;
  onSelect: (customer: Customer) => void;
  customers: Customer[];
}

export const CustomerSearchModal: React.FC<Props> = ({ onClose, onSelect, customers }) => {

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
  const [selectedCountry, setSelectedCountry] = useState('All');
  const [isCustModalOpen, setIsCustModalOpen] = useState(false);
  const [editingCust, setEditingCust] = useState<Customer | undefined>(undefined);

  // Extract unique countries for filtering
  const countries = useMemo(() => {
    const list = new Set<string>();
    customers.forEach(c => {
      if (c.countryName) list.add(c.countryName);
    });
    return ['All', ...Array.from(list)];
  }, [customers]);

  // Filtered customers list
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const matchSearch = 
        (c.customerCode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.nameKo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.representative || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.contactPerson || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.countryName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.shippingPort || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchCountry = selectedCountry === 'All' || c.countryName === selectedCountry;

      return matchSearch && matchCountry;
    });
  }, [customers, searchTerm, selectedCountry]);

  return (
    <div style={{
      position: 'fixed',
      left: `${position.x}px`,
      top: `${position.y}px`,
      zIndex: 20000,
      pointerEvents: 'none',
      userSelect: isDragging ? 'none' : 'auto'
    }}>
      <div style={{
        background: '#fff', borderRadius: '16px', width: '90%', maxWidth: '1000px',
        height: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden', border: '1px solid var(--border-color)',
        pointerEvents: 'auto',
        resize: 'both',
        minWidth: '600px', minHeight: '350px'
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
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
              🔍 고객사 검색 및 불러오기 (Subwindow)
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
              더블 클릭하거나 [선택] 버튼을 눌러 견적서의 고객으로 지정할 수 있습니다.
            </p>
          </div>
          <button 
            onClick={onClose}
            style={{
              background: 'none', border: 'none', fontSize: '24px',
              color: 'var(--text-muted)', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              padding: '4px', borderRadius: '50%', width: '36px', height: '36px',
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
          padding: '16px 24px', background: '#fff', borderBottom: '1px solid #f1f5f9',
          display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center'
        }}>
          {/* Text Search */}
          <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
            <span style={{
              position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
              color: 'var(--text-muted)', fontSize: '14px'
            }}>🔍</span>
            <input
              type="text"
              placeholder="고객코드, 고객사명, 담당자, 이메일, 도착항 등 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px 10px 36px',
                border: '1px solid var(--border-default)', borderRadius: '8px',
                fontSize: '13px', color: 'var(--text-primary)', outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s, box-shadow 0.2s'
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#3b82f6';
                e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.15)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--border-default)';
                e.target.style.boxShadow = 'none';
              }}
              autoFocus
            />
          </div>

          {/* Country Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>국가</label>
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              style={{
                padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border-default)',
                fontSize: '13px', color: '#334155', outline: 'none', background: '#fff',
                cursor: 'pointer'
              }}
            >
              {countries.map(cnt => (
                <option key={cnt} value={cnt}>{cnt === 'All' ? '전체 국가' : cnt}</option>
              ))}
            </select>
          </div>

          {/* Reset Search */}
          {(searchTerm !== '' || selectedCountry !== 'All') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedCountry('All');
              }}
              style={{
                background: '#f1f5f9', border: 'none', padding: '9px 14px',
                borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                color: 'var(--text-secondary)', cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--border-color)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
            >
              초기화
            </button>
          )}
          <button
            onClick={() => {
              setEditingCust(undefined);
              setIsCustModalOpen(true);
            }}
            style={{
              background: '#2563eb', border: 'none', padding: '9px 16px',
              borderRadius: '8px', fontSize: '12px', fontWeight: 600,
              color: '#fff', cursor: 'pointer', marginLeft: 'auto',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
          >
            ➕ 고객 등록
          </button>
        </div>

        {/* Results Info */}
        <div style={{
          padding: '8px 24px', background: '#f8fafc', borderBottom: '1px solid var(--border-color)',
          fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500
        }}>
          검색 결과: <span style={{ color: '#2563eb', fontWeight: 700 }}>{filteredCustomers.length}</span>개 고객사
        </div>

        {/* Table View */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px 24px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{
                position: 'sticky', top: 0, background: '#fff', zIndex: 10,
                borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 600
              }}>
                <th style={{ padding: '12px 8px' }}>고객코드</th>
                <th style={{ padding: '12px 8px' }}>고객사명 (영문/국문)</th>
                <th style={{ padding: '12px 8px' }}>국가</th>
                <th style={{ padding: '12px 8px' }}>담당자 / 이메일</th>
                <th style={{ padding: '12px 8px' }}>도착항 / 인코텀즈 / 결제조건</th>
                <th style={{ padding: '12px 8px', width: '160px', textAlign: 'center' }}>선택 / 관리</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{
                    textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)',
                    fontSize: '14px'
                  }}>
                    검색 결과가 없습니다. 다른 검색어를 입력해보세요.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((c) => (
                  <tr
                    key={c.id}
                    onDoubleClick={() => onSelect(c)}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer',
                      transition: 'background-color 0.15s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f8fafc';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <td style={{ padding: '12px 8px', fontWeight: 600, color: '#0f172a' }}>
                      <span style={{
                        background: '#eff6ff', color: '#1d4ed8',
                        padding: '3px 8px', borderRadius: '4px', fontSize: '11px',
                        border: '1px solid #bfdbfe'
                      }}>
                        {c.customerCode || '없음'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <div style={{ fontWeight: 600, color: '#334155' }}>{c.name || '-'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{c.nameKo || '-'}</div>
                    </td>
                    <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>
                      📍 {c.countryName || '-'}
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <div style={{ fontWeight: 500 }}>👤 {c.contactPerson || c.representative || '-'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>✉ {c.email || c.contactEmail || '-'}</div>
                    </td>
                    <td style={{ padding: '12px 8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <div>⚓ {c.shippingPort || '-'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        Incoterms: <strong>{c.preferredIncoterms || '-'}</strong> | Pay: <strong>{c.paymentTerms || '-'}</strong>
                      </div>
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelect(c);
                          }}
                          style={{
                            background: '#2563eb', color: '#fff', border: 'none',
                            padding: '6px 10px', borderRadius: '6px', fontSize: '11px',
                            fontWeight: 600, cursor: 'pointer',
                            transition: 'background-color 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
                        >
                          선택
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCust(c);
                            setIsCustModalOpen(true);
                          }}
                          style={{
                            background: '#f1f5f9', color: 'var(--text-secondary)', border: '1px solid var(--border-default)',
                            padding: '6px 8px', borderRadius: '6px', fontSize: '11px',
                            fontWeight: 600, cursor: 'pointer',
                            transition: 'background-color 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--border-color)'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                          title="수정"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (window.confirm(`정말 "${c.name || c.customerCode}" 고객사를 삭제하시겠습니까?`)) {
                              try {
                                const cRef = doc(db, 'companies', COMPANY_ID, 'customers', c.id);
                                await deleteDoc(cRef);
                                alert('고객사가 삭제되었습니다.');
                              } catch (err) {
                                console.error('Failed to delete customer:', err);
                                alert('고객사 삭제에 실패했습니다.');
                              }
                            }
                          }}
                          style={{
                            background: '#fef2f2', color: '#dc2626', border: '1px solid #fee2e2',
                            padding: '6px 8px', borderRadius: '6px', fontSize: '11px',
                            fontWeight: 600, cursor: 'pointer',
                            transition: 'background-color 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#fee2e2';
                            e.currentTarget.style.borderColor = '#fca5a5';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = '#fef2f2';
                            e.currentTarget.style.borderColor = '#fee2e2';
                          }}
                          title="삭제"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {isCustModalOpen && (
        <CustomerModal
          initialCustomer={editingCust}
          onClose={() => setIsCustModalOpen(false)}
        />
      )}
    </div>
  );
};
