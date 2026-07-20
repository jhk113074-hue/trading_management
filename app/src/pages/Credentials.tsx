import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, deleteDoc } from 'firebase/firestore';
import { db, COMPANY_ID } from '../firebase';
import type { Credential } from '../types';
import { CredentialModal } from '../components/CredentialModal';
import { useColumnResize } from '../hooks/useColumnResize';

export const Credentials: React.FC = () => {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCred, setEditingCred] = useState<Credential | undefined>(undefined);

  // PW visibility state: { [credId]: boolean }
  const [visiblePws, setVisiblePws] = useState<{ [key: string]: boolean }>({});

  // Column resize hook (Name, URL, ID, PW, Remarks, Actions)
  const { thStyle, resizerProps } = useColumnResize([200, 220, 180, 180, 250, 100]);

  useEffect(() => {
    const unsub = onSnapshot(collection(doc(db, 'companies', COMPANY_ID), 'credentials'), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Credential));
      // Sort by siteName alphabetically
      data.sort((a, b) => (a.siteName || '').localeCompare(b.siteName || '', 'ko'));
      setCredentials(data);
      setLoading(false);
    }, (err) => {
      console.error('Failed to load credentials:', err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // Filter credentials based on search query
  const filteredCredentials = useMemo(() => {
    return credentials.filter(c => {
      const q = searchQuery.toLowerCase();
      return (
        (c.siteName || '').toLowerCase().includes(q) ||
        (c.loginId || '').toLowerCase().includes(q) ||
        (c.remarks || '').toLowerCase().includes(q)
      );
    });
  }, [credentials, searchQuery]);

  const togglePwVisibility = (id: string) => {
    setVisiblePws(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert(`✅ ${label}가 클립보드에 복사되었습니다.`);
    } catch (err) {
      alert('❌ 복사에 실패했습니다.');
    }
  };

  const handleDelete = async (id: string, siteName: string) => {
    if (!window.confirm(`⚠️ 정말로 [${siteName}] 사이트 계정 정보를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    try {
      await deleteDoc(doc(db, 'companies', COMPANY_ID, 'credentials', id));
      alert('✅ 성공적으로 삭제되었습니다.');
    } catch (e: any) {
      alert('❌ 삭제 실패: ' + e.message);
    }
  };

  return (
    <div className="page-container" style={{ padding: '24px 30px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#1e293b', margin: 0 }}>🔑 공동작업 사이트 비밀번호 관리</h1>
          <p style={{ color: '#64748b', fontSize: '13px', marginTop: '2px' }}>협업 시 사용하는 국세청, 무역인증 등 공용 사이트 계정 정보 모음</p>
        </div>
        <button 
          onClick={() => { setEditingCred(undefined); setIsModalOpen(true); }}
          style={{
            backgroundColor: '#3b82f6',
            color: 'white',
            padding: '0 16px',
            borderRadius: '4px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 700,
            fontSize: '12.5px',
            transition: 'background 0.2s',
            height: '34px',
            boxSizing: 'border-box'
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2563eb'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#3b82f6'}
        >
          ➕ 신규 사이트 등록
        </button>
      </header>

      {/* Search Bar */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', backgroundColor: '#fff', padding: '16px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
        <input 
          type="text" 
          placeholder="사이트명, ID, 비고 내용 검색..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            padding: '0 12px',
            border: '1px solid #cbd5e1',
            borderRadius: '4px',
            flex: '1',
            maxWidth: '400px',
            fontSize: '13px',
            outline: 'none',
            height: '34px',
            boxSizing: 'border-box'
          }}
        />
      </div>

      <div style={{ marginBottom: '12px', fontSize: '13px', color: '#64748b', fontWeight: 700 }}>
        총 {filteredCredentials.length}건
      </div>

      {/* Grid Table */}
      <div style={{ overflowX: 'auto', backgroundColor: 'white', border: '1px solid #cbd5e1', borderRadius: '4px' }}>
        <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', textAlign: 'left', tableLayout: 'fixed' }}>
          <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
            <tr>
              <th style={thStyle(0, { padding: '12px 10px', fontWeight: 750, color: '#475569', fontSize: '12.5px' })}>이름<span {...resizerProps(0)} /></th>
              <th style={thStyle(1, { padding: '12px 10px', fontWeight: 750, color: '#475569', fontSize: '12.5px' })}>홈페이지<span {...resizerProps(1)} /></th>
              <th style={thStyle(2, { padding: '12px 10px', fontWeight: 750, color: '#475569', fontSize: '12.5px' })}>ID<span {...resizerProps(2)} /></th>
              <th style={thStyle(3, { padding: '12px 10px', fontWeight: 750, color: '#475569', fontSize: '12.5px' })}>PW<span {...resizerProps(3)} /></th>
              <th style={thStyle(4, { padding: '12px 10px', fontWeight: 750, color: '#475569', fontSize: '12.5px' })}>비고<span {...resizerProps(4)} /></th>
              <th style={thStyle(5, { padding: '12px 10px', textAlign: 'right', fontWeight: 750, color: '#475569', fontSize: '12.5px' })}>작업<span {...resizerProps(5)} /></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>데이터 로딩 중...</td></tr>
            ) : filteredCredentials.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>등록된 사이트 계정 정보가 없습니다.</td></tr>
            ) : (
              filteredCredentials.map(c => {
                const id = c.id || '';
                const isPwVisible = !!visiblePws[id];
                return (
                  <tr 
                    key={id} 
                    style={{ borderBottom: '1px solid #cbd5e1', fontSize: '13px', height: '56px', transition: 'background-color 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    {/* 이름 */}
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 700, color: '#1e293b' }}>{c.siteName}</div>
                      {c.updatedBy && (
                        <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>
                          수정: {c.updatedBy} ({c.updatedAt ? new Date(c.updatedAt.seconds * 1000).toLocaleDateString() : ''})
                        </div>
                      )}
                    </td>

                    {/* 홈페이지 바로가기 */}
                    <td style={{ padding: '10px 12px' }}>
                      {c.homepageUrl ? (
                        <a 
                          href={c.homepageUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title="새 탭에서 열기"
                        >
                          🔗 {c.homepageUrl}
                        </a>
                      ) : (
                        <span style={{ color: '#cbd5e1' }}>-</span>
                      )}
                    </td>

                    {/* ID & 복사 */}
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 600, color: '#334155', wordBreak: 'break-all' }}>{c.loginId}</span>
                        <button 
                          onClick={() => copyToClipboard(c.loginId, 'ID')}
                          style={{
                            background: '#f1f5f9',
                            border: '1px solid #cbd5e1',
                            padding: '2px 6px',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            fontSize: '11px',
                            color: '#475569'
                          }}
                        >
                          복사
                        </button>
                      </div>
                    </td>

                    {/* PW (마스킹 & 눈동자 & 복사) */}
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ 
                          fontFamily: isPwVisible ? 'inherit' : 'monospace', 
                          fontWeight: 600, 
                          color: '#334155',
                          fontSize: isPwVisible ? '13px' : '15px',
                          letterSpacing: isPwVisible ? 'normal' : '2px'
                        }}>
                          {isPwVisible ? c.loginPw : '••••••••'}
                        </span>
                        <button 
                          onClick={() => togglePwVisibility(id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '14px',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center'
                          }}
                          title={isPwVisible ? "숨기기" : "보기"}
                        >
                          {isPwVisible ? '🙈' : '👁️'}
                        </button>
                        <button 
                          onClick={() => copyToClipboard(c.loginPw, 'PW')}
                          style={{
                            background: '#f1f5f9',
                            border: '1px solid #cbd5e1',
                            padding: '2px 6px',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            fontSize: '11px',
                            color: '#475569'
                          }}
                        >
                          복사
                        </button>
                      </div>
                    </td>

                    {/* 비고 */}
                    <td style={{ padding: '10px 12px', color: '#475569', fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {c.remarks || '-'}
                    </td>

                    {/* 작업 (수정, 삭제) */}
                    <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button 
                        onClick={() => { setEditingCred(c); setIsModalOpen(true); }}
                        style={{
                          background: '#f1f5f9',
                          color: '#475569',
                          border: '1px solid #cbd5e1',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: 600,
                          marginRight: '4px',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                      >
                        ✏ 수정
                      </button>
                      <button 
                        onClick={() => handleDelete(id, c.siteName)}
                        title="삭제"
                        style={{
                          background: '#fef2f2',
                          color: '#ef4444',
                          border: '1px solid #cbd5e1',
                          padding: '4px 6px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '13px',
                          transition: 'background 0.2s',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fee2e2'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fef2f2'}
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <CredentialModal 
          initialCredential={editingCred}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  );
};
