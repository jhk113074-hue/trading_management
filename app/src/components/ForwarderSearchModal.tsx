import React, { useState, useMemo } from 'react';
import { db, COMPANY_ID } from '../firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import type { Supplier } from '../types/supplier';

interface Props {
  onClose: () => void;
  onSelect: (supplier: Supplier) => void;
  suppliers: Supplier[];
}

export const ForwarderSearchModal: React.FC<Props> = ({ onClose, onSelect, suppliers }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newForwarder, setNewForwarder] = useState({
    name: '',
    bizNumber: '',
    representative: '',
    phone: '',
    address: ''
  });

  const filteredForwarders = useMemo(() => {
    // Filter only suppliers where category is "포워딩사"
    return suppliers.filter(s => {
      const isForwarder = s.category === '포워딩사';
      const matchesSearch = 
        (s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.representative || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.address || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.bizNumber || '').toLowerCase().includes(searchTerm.toLowerCase());
      return isForwarder && matchesSearch;
    });
  }, [suppliers, searchTerm]);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000
    }}>
      <div style={{
        background: '#fff', borderRadius: '16px', width: '90%', maxWidth: '800px',
        height: '70vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden', border: '1px solid #e2e8f0'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid #e2e8f0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: '#f8fafc'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#1e293b' }}>
              🔍 포워딩/운송 업체 검색 및 선택 (Subwindow)
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
              더블 클릭하거나 [선택] 버튼을 눌러 지정할 수 있습니다.
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
          >
            ✕
          </button>
        </div>

        {/* Search Input & Add Button */}
        <div style={{ padding: '16px 24px', background: '#fff', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="업체명, 대표자, 주소 등으로 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              flex: 1, padding: '10px 14px',
              border: '1px solid #cbd5e1', borderRadius: '8px',
              fontSize: '13px', color: '#1e293b', outline: 'none',
              boxSizing: 'border-box'
            }}
            autoFocus
          />
          <button 
            onClick={() => setIsAdding(!isAdding)}
            style={{
              padding: '10px 16px', background: isAdding ? '#e2e8f0' : '#10b981', color: isAdding ? '#475569' : '#fff',
              border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap'
            }}
          >
            {isAdding ? '취소' : '신규등록'}
          </button>
        </div>

        {isAdding && (
          <div style={{ padding: '16px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#4b5563', marginBottom: '4px' }}>업체명 *</label>
                <input type="text" value={newForwarder.name} onChange={e => setNewForwarder({...newForwarder, name: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#4b5563', marginBottom: '4px' }}>사업자번호</label>
                <input type="text" value={newForwarder.bizNumber} onChange={e => setNewForwarder({...newForwarder, bizNumber: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#4b5563', marginBottom: '4px' }}>대표자</label>
                <input type="text" value={newForwarder.representative} onChange={e => setNewForwarder({...newForwarder, representative: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#4b5563', marginBottom: '4px' }}>전화번호</label>
                <input type="text" value={newForwarder.phone} onChange={e => setNewForwarder({...newForwarder, phone: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ marginTop: '12px', textAlign: 'right' }}>
              <button
                onClick={async () => {
                  if (!newForwarder.name.trim()) {
                    alert('업체명을 입력해주세요.');
                    return;
                  }
                  try {
                    const newId = `FWD_${Date.now()}`;
                    const newData = {
                      ...newForwarder,
                      category: '포워딩사',
                      createdAt: serverTimestamp()
                    };
                    await setDoc(doc(db, 'companies', COMPANY_ID, 'suppliers', newId), newData);
                    alert('성공적으로 등록되었습니다.');
                    setIsAdding(false);
                    setNewForwarder({ name: '', bizNumber: '', representative: '', phone: '', address: '' });
                    // Provide a partial object sufficient for onSelect
                    onSelect({ id: newId, ...newData } as Supplier);
                  } catch (e: any) {
                    alert('등록 중 오류가 발생했습니다: ' + e.message);
                  }
                }}
                style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
              >
                저장 및 선택
              </button>
            </div>
          </div>
        )}


        {/* List Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {filteredForwarders.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
              검색된 포워더/운송 업체가 없습니다.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#475569', fontWeight: 600 }}>
                  <th style={{ padding: '10px 8px' }}>업체명</th>
                  <th style={{ padding: '10px 8px' }}>사업자번호</th>
                  <th style={{ padding: '10px 8px' }}>대표자</th>
                  <th style={{ padding: '10px 8px' }}>전화번호</th>
                  <th style={{ padding: '10px 8px', width: '80px', textAlign: 'center' }}>선택</th>
                </tr>
              </thead>
              <tbody>
                {filteredForwarders.map(s => (
                  <tr 
                    key={s.id} 
                    onDoubleClick={() => onSelect(s)}
                    style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background-color 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <td style={{ padding: '12px 8px', fontWeight: 600, color: '#0f172a' }}>{s.name}</td>
                    <td style={{ padding: '12px 8px', color: '#475569' }}>{s.bizNumber || '-'}</td>
                    <td style={{ padding: '12px 8px', color: '#475569' }}>{s.representative || '-'}</td>
                    <td style={{ padding: '12px 8px', color: '#475569' }}>{s.phone || '-'}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                      <button
                        onClick={() => onSelect(s)}
                        style={{
                          padding: '4px 10px', background: '#3b82f6', color: '#fff',
                          border: 'none', borderRadius: '4px', cursor: 'pointer',
                          fontSize: '12px', fontWeight: 600
                        }}
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
