import React, { useState, useMemo } from 'react';
import type { ProformaInvoice } from '../types/pi';

interface Props {
  onClose: () => void;
  onSelect: (pi: ProformaInvoice) => void;
  pis: ProformaInvoice[];
}

export const PISearchModal: React.FC<Props> = ({ onClose, onSelect, pis }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Filtered PI list
  const filteredPIs = useMemo(() => {
    return pis.filter(p => {
      const q = searchTerm.toLowerCase();
      const matchSearch = 
        (p.piNumber || '').toLowerCase().includes(q) ||
        (p.customerName || '').toLowerCase().includes(q) ||
        (p.piDate || '').toLowerCase().includes(q) ||
        (p.status || '').toLowerCase().includes(q);

      const matchStatus = statusFilter === 'All' || p.status === statusFilter;

      return matchSearch && matchStatus;
    });
  }, [pis, searchTerm, statusFilter]);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'none',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000,
      pointerEvents: 'none'
    }}>
      <div style={{
        background: '#fff', borderRadius: '16px', width: '90%', maxWidth: '1000px',
        height: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden', border: '1px solid #e2e8f0',
        pointerEvents: 'auto',
        resize: 'both',
        minWidth: '600px', minHeight: '350px'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid #e2e8f0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: '#f8fafc'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>
              🔍 견적서(PI) 검색 및 불러오기 (Subwindow)
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
              더블 클릭하거나 [선택] 버튼을 눌러 주문서에 연결할 견적서(PI)를 지정할 수 있습니다.
            </p>
          </div>
          <button 
            onClick={onClose}
            style={{
              background: 'none', border: 'none', fontSize: '24px',
              color: '#94a3b8', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              padding: '4px', borderRadius: '50%', width: '36px', height: '36px',
              transition: 'background-color 0.2s, color 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f1f5f9';
              e.currentTarget.style.color = '#475569';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#94a3b8';
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
              color: '#94a3b8', fontSize: '14px'
            }}>🔍</span>
            <input
              type="text"
              placeholder="PI 번호, 고객사명, 날짜 등 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px 10px 36px',
                border: '1px solid #cbd5e1', borderRadius: '8px',
                fontSize: '13px', color: '#1e293b', outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s, box-shadow 0.2s'
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#3b82f6';
                e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.15)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#cbd5e1';
                e.target.style.boxShadow = 'none';
              }}
              autoFocus
            />
          </div>

          {/* Status Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>상태</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1',
                fontSize: '13px', color: '#334155', outline: 'none', background: '#fff',
                cursor: 'pointer'
              }}
            >
              <option value="All">전체 상태</option>
              <option value="draft">초안 (draft)</option>
              <option value="confirmed">확정 (confirmed)</option>
              <option value="sent">발송 (sent)</option>
              <option value="PO확정">PO확정</option>
            </select>
          </div>

          {/* Reset Search */}
          {(searchTerm !== '' || statusFilter !== 'All') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('All');
              }}
              style={{
                padding: '9px 16px', background: '#f1f5f9', border: 'none',
                borderRadius: '8px', fontSize: '13px', color: '#475569',
                cursor: 'pointer', fontWeight: 600, transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e2e8f0'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
            >
              필터 초기화
            </button>
          )}
        </div>

        {/* Table Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px 24px' }}>
          {filteredPIs.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '48px 0', color: '#94a3b8',
              fontSize: '14px', border: '1px dashed #e2e8f0', borderRadius: '12px',
              marginTop: '16px'
            }}>
              검색 조건에 맞는 견적서(PI)가 존재하지 않습니다.
            </div>
          ) : (
            <table style={{
              width: '100%', borderCollapse: 'collapse', marginTop: '16px',
              fontSize: '13px', textAlign: 'left'
            }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: '#475569' }}>PI 번호</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: '#475569' }}>고객사</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: '#475569' }}>발행일</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: '#475569' }}>금액 (USD)</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, color: '#475569' }}>상태</th>
                  <th style={{ padding: '12px 16px', width: '80px' }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredPIs.map((p, idx) => (
                  <tr 
                    key={p.id}
                    onDoubleClick={() => onSelect(p)}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#fff' : '#fafafa'}
                  >
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#1e293b' }}>{p.piNumber}</td>
                    <td style={{ padding: '12px 16px', color: '#334155' }}>{p.customerName}</td>
                    <td style={{ padding: '12px 16px', color: '#64748b' }}>{p.piDate}</td>
                    <td style={{ padding: '12px 16px', color: '#0f766e', fontWeight: 700 }}>
                      ${p.totalUsd?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700,
                        background: p.status === 'PO확정' ? '#ecfdf5' : p.status === 'confirmed' ? '#eff6ff' : '#f1f5f9',
                        color: p.status === 'PO확정' ? '#059669' : p.status === 'confirmed' ? '#2563eb' : '#475569',
                      }}>
                        {p.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => onSelect(p)}
                        style={{
                          padding: '6px 12px', background: '#3b82f6', color: '#fff',
                          border: 'none', borderRadius: '6px', cursor: 'pointer',
                          fontWeight: 600, fontSize: '12px', transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
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
    </div>
  );
};
