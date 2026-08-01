import React, { useState, useMemo, useEffect } from 'react';
import type { Customer } from '../types/customer';
import { doc, deleteDoc, collection, onSnapshot } from 'firebase/firestore';
import { db, COMPANY_ID } from '../firebase';
import { CustomerModal } from './CustomerModal';

interface Props {
  onClose: () => void;
  onSelect: (customer: Customer) => void;
  customers: Customer[];
  onRefreshCustomers?: () => void;
}

export const CustomerSearchModal: React.FC<Props> = ({ onClose, onSelect, customers, onRefreshCustomers }) => {
  // Real-time local customers list state
  const [customerList, setCustomerList] = useState<Customer[]>(customers || []);

  // Sync when parent props update
  useEffect(() => {
    if (customers && customers.length > 0) {
      setCustomerList(customers);
    }
  }, [customers]);

  // Real-time Firestore Customer Listener
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'companies', COMPANY_ID, 'customers'), (snapshot) => {
      const fetched: Customer[] = [];
      snapshot.forEach(d => {
        fetched.push({ id: d.id, ...d.data() } as Customer);
      });
      // Sort alphabetically by Korean/English name
      fetched.sort((a, b) => (a.nameKo || a.name || '').localeCompare(b.nameKo || b.name || ''));
      setCustomerList(fetched);
    }, (err) => {
      console.error("Real-time customer search modal listener error:", err);
    });
    return () => unsub();
  }, []);

  // Modeless Drag-to-move state
  const [position, setPosition] = useState({ x: 100, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = React.useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.tagName === 'SELECT') return;
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
    customerList.forEach(c => {
      if (c.countryName) list.add(c.countryName);
    });
    return ['All', ...Array.from(list)];
  }, [customerList]);

  // Filtered customers list
  const filteredCustomers = useMemo(() => {
    return customerList.filter(c => {
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
  }, [customerList, searchTerm, selectedCountry]);

  // Sort customer list by customer code (e.g. CU00001, CU00002)
  const sortedAndFilteredCustomers = useMemo(() => {
    const list = [...filteredCustomers];
    list.sort((a, b) => (a.customerCode || '').localeCompare(b.customerCode || ''));
    return list;
  }, [filteredCustomers]);

  // Delete customer handler
  const handleDeleteCustomer = async (id: string, nameStr: string) => {
    if (!window.confirm(`'${nameStr}' 고객사를 정말로 삭제하시겠습니까?`)) return;
    try {
      await deleteDoc(doc(db, 'companies', COMPANY_ID, 'customers', id));
      onRefreshCustomers?.();
    } catch (e: any) {
      alert("고객사 삭제 중 오류가 발생했습니다: " + e.message);
    }
  };

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
        background: '#fff', borderRadius: '16px', width: '95vw', maxWidth: '1200px',
        height: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden', border: '1px solid var(--border-color)',
        pointerEvents: 'auto',
        resize: 'both',
        minWidth: '750px', minHeight: '350px'
      }}>
        {/* Header */}
        <div 
          onMouseDown={handleMouseDown}
          style={{
            padding: '20px 24px', borderBottom: '1px solid var(--border-color)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: '#f8fafc',
            cursor: 'grab',
            userSelect: 'none'
          }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
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
              transition: 'background 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            ✕
          </button>
        </div>

        {/* Toolbar */}
        <div style={{
          padding: '16px 24px', borderBottom: '1px solid var(--border-color)',
          display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'space-between',
          background: '#fff'
        }}>
          <div style={{ display: 'flex', gap: '12px', flex: 1, maxWidth: '600px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input 
                type="text" 
                placeholder="고객사명(영문/한글), 코드, 담당자, 이메일, 국가 검색..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                  width: '100%', height: '40px', padding: '0 16px 0 40px',
                  borderRadius: '8px', border: '1px solid var(--border-color)',
                  fontSize: '14px', outline: 'none', background: '#fff'
                }}
              />
              <span style={{ position: 'absolute', left: '12px', top: '10px', fontSize: '16px' }}>🔍</span>
            </div>
            <select
              value={selectedCountry}
              onChange={e => setSelectedCountry(e.target.value)}
              style={{
                height: '40px', padding: '0 12px', borderRadius: '8px',
                border: '1px solid var(--border-color)', fontSize: '14px',
                background: '#fff', outline: 'none', cursor: 'pointer'
              }}
            >
              <option value="All">전체 국가</option>
              {countries.filter(c => c !== 'All').map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {(searchTerm || selectedCountry !== 'All') && (
              <button
                onClick={() => { setSearchTerm(''); setSelectedCountry('All'); }}
                style={{
                  height: '40px', padding: '0 16px', borderRadius: '8px',
                  border: '1px solid var(--border-color)', background: '#f1f5f9',
                  fontSize: '13px', color: '#475569', cursor: 'pointer', fontWeight: 600
                }}
              >
                초기화
              </button>
            )}
          </div>

          <button
            onClick={() => { setEditingCust(undefined); setIsCustModalOpen(true); }}
            style={{
              height: '40px', padding: '0 20px', borderRadius: '8px',
              border: 'none', background: '#2563eb', color: '#fff',
              fontSize: '14px', fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px',
              boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)'
            }}
          >
            ➕ 고객 등록
          </button>
        </div>

        {/* Results Info */}
        <div style={{ padding: '8px 24px', background: '#f8fafc', borderBottom: '1px solid var(--border-color)', fontSize: '12px', color: 'var(--text-secondary)' }}>
          검색 결과: <strong style={{ color: 'var(--primary-color)' }}>{sortedAndFilteredCustomers.length}</strong>개 고객사 (고객코드 순)
        </div>

        {/* List Table */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px 24px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left', whiteSpace: 'nowrap' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)', color: '#475569', backgroundColor: '#f8fafc' }}>
                <th style={{ padding: '10px 8px', fontWeight: 750 }}>고객코드</th>
                <th style={{ padding: '10px 8px', fontWeight: 750 }}>고객사명(영문)</th>
                <th style={{ padding: '10px 8px', fontWeight: 750 }}>고객사명(한글)</th>
                <th style={{ padding: '10px 8px', fontWeight: 750 }}>약자</th>
                <th style={{ padding: '10px 8px', fontWeight: 750 }}>국가</th>
                <th style={{ padding: '10px 8px', fontWeight: 750 }}>담당자</th>
                <th style={{ padding: '10px 8px', fontWeight: 750 }}>이메일</th>
                <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 750 }}>선택 / 관리</th>
              </tr>
            </thead>
            <tbody>
              {sortedAndFilteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    검색 결과가 없습니다.
                  </td>
                </tr>
              ) : (
                sortedAndFilteredCustomers.map(cust => (
                  <tr 
                    key={cust.id}
                    onDoubleClick={() => onSelect(cust)}
                    style={{
                      borderBottom: '1px solid #cbd5e1',
                      transition: 'background 0.2s',
                      cursor: 'pointer',
                      height: '42px'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '8px' }}>
                      <span style={{
                        padding: '2px 6px', borderRadius: '4px',
                        background: '#eff6ff', color: '#1d4ed8',
                        fontWeight: 750, fontSize: '12px', border: '1px solid #bfdbfe'
                      }}>
                        {cust.customerCode}
                      </span>
                    </td>
                    <td style={{ padding: '8px', fontWeight: 700, color: '#0f172a' }}>
                      {cust.name || '-'}
                    </td>
                    <td style={{ padding: '8px', color: '#334155', fontWeight: 600 }}>
                      {cust.nameKo || '-'}
                    </td>
                    <td style={{ padding: '8px', color: '#475569', fontWeight: 600 }}>
                      {cust.nameKo ? cust.nameKo : (cust.name || '-')}
                    </td>
                    <td style={{ padding: '8px' }}>
                      📍 {cust.countryName || '-'}
                    </td>
                    <td style={{ padding: '8px', fontWeight: 600 }}>
                      👤 {cust.contactPerson || cust.representative || '-'}
                    </td>
                    <td style={{ padding: '8px', color: '#475569' }}>
                      ✉️ {cust.email || '-'}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button
                          onClick={() => onSelect(cust)}
                          style={{
                            padding: '4px 12px', borderRadius: '4px',
                            background: '#2563eb', color: '#fff',
                            border: 'none', fontSize: '12px', fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          선택
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingCust(cust); setIsCustModalOpen(true); }}
                          style={{
                            padding: '4px 8px', borderRadius: '4px',
                            background: '#f1f5f9', color: '#475569',
                            border: '1px solid var(--border-color)', fontSize: '12px',
                            cursor: 'pointer'
                          }}
                          title="고객사 정보 수정"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteCustomer(cust.id, cust.nameKo || cust.name); }}
                          style={{
                            padding: '4px 8px', borderRadius: '4px',
                            background: '#fef2f2', color: '#ef4444',
                            border: '1px solid #fecaca', fontSize: '12px',
                            cursor: 'pointer'
                          }}
                          title="고객사 삭제"
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
