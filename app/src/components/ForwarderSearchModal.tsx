import React, { useState, useMemo } from 'react';
import { SupplierModal } from './SupplierModal';
import type { Supplier } from '../types/supplier';

interface Props {
  onClose: () => void;
  onSelect: (supplier: Supplier) => void;
  suppliers: Supplier[];
}

export const ForwarderSearchModal: React.FC<Props> = ({ onClose, onSelect, suppliers }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showRegisterModal, setShowRegisterModal] = useState(false);

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
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'none',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000,
      pointerEvents: 'none'
    }}>
      <div style={{
        background: '#fff', borderRadius: '14px', width: '92%', maxWidth: '850px',
        height: '75vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)',
        overflow: 'hidden', border: '1px solid #e2e8f0',
        pointerEvents: 'auto',
        resize: 'both',
        minWidth: '550px', minHeight: '300px'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #e2e8f0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: '#f8fafc'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🔍</span> 포워딩/운송 업체 검색 및 선택 (Subwindow)
            </h3>
            <p style={{ margin: '3px 0 0 0', fontSize: '11px', color: '#64748b' }}>
              목록의 업체를 더블 클릭하거나 [선택] 버튼을 눌러 지정할 수 있습니다.
            </p>
          </div>
          <button 
            onClick={onClose}
            style={{
              background: 'none', border: 'none', fontSize: '20px',
              color: '#94a3b8', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              padding: '4px', width: '32px', height: '32px',
              transition: 'color 0.15s'
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
            onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
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
              border: '1px solid #cbd5e1', borderRadius: '6px',
              fontSize: '12.5px', color: '#0f172a', outline: 'none',
              boxSizing: 'border-box',
              transition: 'border-color 0.15s'
            }}
            onFocus={e => e.target.style.borderColor = '#2563eb'}
            onBlur={e => e.target.style.borderColor = '#cbd5e1'}
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
            <div style={{ padding: '60px 0', textAlign: 'center', color: '#94a3b8', fontSize: '12.5px' }}>
              검색된 포워더/운송 업체가 없습니다.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 700, background: '#f8fafc' }}>
                  <th style={{ padding: '8px 10px' }}>업체명</th>
                  <th style={{ padding: '8px 10px' }}>사업자번호</th>
                  <th style={{ padding: '8px 10px' }}>대표자</th>
                  <th style={{ padding: '8px 10px' }}>전화번호</th>
                  <th style={{ padding: '8px 10px', width: '80px', textAlign: 'center' }}>선택</th>
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
                    <td style={{ padding: '10px', color: '#475569' }}>{s.bizNumber || '-'}</td>
                    <td style={{ padding: '10px', color: '#475569' }}>{s.representative || '-'}</td>
                    <td style={{ padding: '10px', color: '#475569' }}>{s.phone || '-'}</td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <button
                        onClick={() => onSelect(s)}
                        style={{
                          padding: '4px 10px', background: '#3b82f6', color: '#fff',
                          border: 'none', borderRadius: '4px', cursor: 'pointer',
                          fontSize: '11.5px', fontWeight: 700, transition: 'background-color 0.15s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2563eb'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#3b82f6'}
                      >
                        선택
                      </button>
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
    </div>
  );
};
