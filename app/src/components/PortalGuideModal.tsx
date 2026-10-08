import React, { useState } from 'react';
import { PORTAL_GUIDES, type PortalGuide } from '../constants/portalGuides';
import { Link } from 'react-router-dom';

interface PortalGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialGuideId?: string;
}

export const PortalGuideModal: React.FC<PortalGuideModalProps> = ({
  isOpen,
  onClose,
  initialGuideId
}) => {
  const [selectedId, setSelectedId] = useState<string>(initialGuideId || 'orders-detail');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('전체');

  React.useEffect(() => {
    if (initialGuideId) {
      setSelectedId(initialGuideId);
    }
  }, [initialGuideId]);

  if (!isOpen) return null;

  const categories = ['전체', '영업관리', '구매관리', '업무관리', 'DB관리', '시스템', '홈/대시보드'];

  const filteredGuides = PORTAL_GUIDES.filter(g => {
    const matchCategory = selectedCategory === '전체' || g.category === selectedCategory;
    const q = searchQuery.toLowerCase().trim();
    if (!q) return matchCategory;
    const matchText = 
      g.title.toLowerCase().includes(q) ||
      g.subtitle.toLowerCase().includes(q) ||
      g.summary.toLowerCase().includes(q) ||
      g.instructions.some(i => i.title.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q)) ||
      g.workflow.some(w => w.toLowerCase().includes(q));
    return matchCategory && matchText;
  });

  const activeGuide: PortalGuide = PORTAL_GUIDES.find(g => g.id === selectedId) || PORTAL_GUIDES[0];

  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999990,
        padding: '16px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        style={{
          backgroundColor: '#fff',
          borderRadius: '8px',
          border: '1px solid #cbd5e1',
          boxShadow: '0 20px 40px rgba(15,23,42,0.25)',
          width: '100%',
          maxWidth: '1160px',
          height: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{
          background: '#fafafa',
          padding: '14px 20px',
          borderBottom: '1px solid #cbd5e1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '22px' }}>📖</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#1e293b' }}>
                YSACC 업무포탈 사용방법 & 업무 매뉴얼
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                화면별 핵심 업무 프로세스, 주요 기능 및 지속 업데이트 안내
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ 
              background: '#eff6ff', 
              color: '#2563eb', 
              border: '1px solid #bfdbfe', 
              padding: '3px 8px', 
              borderRadius: '4px', 
              fontSize: '11.5px', 
              fontWeight: 750 
            }}>
              🔄 지속 업데이트 중
            </span>
            <button
              onClick={onClose}
              style={{
                height: '32px',
                padding: '0 12px',
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                color: '#475569',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              ✕ 닫기
            </button>
          </div>
        </div>

        {/* Content Body: Sidebar + Main Details */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* Left Navigation Sidebar */}
          <div style={{
            width: '320px',
            borderRight: '1px solid #e2e8f0',
            backgroundColor: '#f8fafc',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0
          }}>
            {/* Search Input */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #e2e8f0' }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="🔍 포탈명, 기능, 키워드 검색..."
                style={{
                  width: '100%',
                  height: '34px',
                  padding: '0 10px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  color: '#1e293b',
                  boxSizing: 'border-box',
                  outline: 'none'
                }}
              />
            </div>

            {/* Category Filter Pills */}
            <div style={{ 
              padding: '8px 12px', 
              borderBottom: '1px solid #e2e8f0', 
              display: 'flex', 
              gap: '4px', 
              flexWrap: 'wrap',
              backgroundColor: '#fff'
            }}>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    padding: '3px 7px',
                    borderRadius: '12px',
                    border: '1px solid',
                    borderColor: selectedCategory === cat ? '#3b82f6' : '#e2e8f0',
                    background: selectedCategory === cat ? '#3b82f6' : '#f8fafc',
                    color: selectedCategory === cat ? '#fff' : '#64748b',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Portal List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
              {filteredGuides.length === 0 ? (
                <div style={{ padding: '24px 12px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                  검색 결과가 없습니다.
                </div>
              ) : (
                filteredGuides.map(guide => {
                  const isSelected = guide.id === selectedId;
                  return (
                    <div
                      key={guide.id}
                      onClick={() => setSelectedId(guide.id)}
                      style={{
                        padding: '10px 12px',
                        marginBottom: '4px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        border: isSelected ? '1px solid #93c5fd' : '1px solid transparent',
                        background: isSelected ? '#eff6ff' : 'transparent',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span style={{ 
                          fontSize: '10px', 
                          fontWeight: 750, 
                          color: isSelected ? '#1d4ed8' : '#64748b',
                          background: isSelected ? '#dbeafe' : '#f1f5f9',
                          padding: '1px 5px',
                          borderRadius: '3px'
                        }}>
                          {guide.category}
                        </span>
                        <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                          {guide.lastUpdated}
                        </span>
                      </div>
                      <div style={{ 
                        fontSize: '13px', 
                        fontWeight: 750, 
                        color: isSelected ? '#1e3a8a' : '#1e293b',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <span>{guide.icon}</span>
                        <span>{guide.title}</span>
                      </div>
                      <div style={{ 
                        fontSize: '11px', 
                        color: '#64748b', 
                        marginTop: '2px', 
                        whiteSpace: 'nowrap', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis' 
                      }}>
                        {guide.subtitle}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Main Detail View */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', backgroundColor: '#ffffff' }}>
            {/* Title Section */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '16px', marginBottom: '20px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ 
                    background: '#e0f2fe', 
                    color: '#0369a1', 
                    fontSize: '11px', 
                    fontWeight: 800, 
                    padding: '2px 8px', 
                    borderRadius: '4px' 
                  }}>
                    {activeGuide.category}
                  </span>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                    경로: <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: '3px' }}>{activeGuide.path}</code>
                  </span>
                  <span style={{ fontSize: '11px', color: '#059669', fontWeight: 700 }}>
                    최종 업데이트: {activeGuide.lastUpdated}
                  </span>
                </div>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{activeGuide.icon}</span>
                  <span>{activeGuide.title}</span>
                </h2>
                <p style={{ margin: '6px 0 0', fontSize: '13.5px', color: '#475569', fontWeight: 600 }}>
                  {activeGuide.subtitle}
                </p>
              </div>

              {activeGuide.path !== '/orders/:id' && (
                <Link
                  to={activeGuide.path}
                  onClick={onClose}
                  style={{
                    height: '34px',
                    padding: '0 14px',
                    background: '#3b82f6',
                    color: '#fff',
                    borderRadius: '4px',
                    fontSize: '13px',
                    fontWeight: 750,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: '0 2px 4px rgba(59,130,246,0.25)'
                  }}
                >
                  <span>이동하기</span>
                  <span>➔</span>
                </Link>
              )}
            </div>

            {/* Summary Box */}
            <div style={{
              background: '#f8fafc',
              borderLeft: '4px solid #3b82f6',
              padding: '12px 16px',
              borderRadius: '0 6px 6px 0',
              marginBottom: '24px',
              fontSize: '13.5px',
              color: '#334155',
              lineHeight: '1.6'
            }}>
              <strong>💡 업무 목적:</strong> {activeGuide.summary}
            </div>

            {/* Workflow Steps */}
            <div style={{ marginBottom: '28px' }}>
              <h4 style={{ margin: '0 0 12px', fontSize: '14.5px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🔄</span>
                <span>표준 업무 진행 프로세스</span>
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {activeGuide.workflow.map((step, idx) => (
                  <div 
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      padding: '10px 14px',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: 650,
                      color: '#1e293b'
                    }}
                  >
                    <span style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: '#3b82f6',
                      color: '#fff',
                      fontSize: '11px',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      {idx + 1}
                    </span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Key Instructions / Features */}
            <div style={{ marginBottom: '28px' }}>
              <h4 style={{ margin: '0 0 12px', fontSize: '14.5px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>⭐</span>
                <span>핵심 기능 및 버튼 사용 설명</span>
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
                {activeGuide.instructions.map((inst, idx) => (
                  <div 
                    key={idx}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      padding: '12px 16px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#0f172a' }}>
                        {inst.title}
                      </span>
                      {inst.badge && (
                        <span style={{
                          background: inst.badge.includes('최신') ? '#dcfce7' : '#eff6ff',
                          color: inst.badge.includes('최신') ? '#15803d' : '#2563eb',
                          border: `1px solid ${inst.badge.includes('최신') ? '#86efac' : '#bfdbfe'}`,
                          fontSize: '11px',
                          fontWeight: 750,
                          padding: '1px 6px',
                          borderRadius: '4px'
                        }}>
                          {inst.badge}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '13px', color: '#475569', lineHeight: '1.6' }}>
                      {inst.desc}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tips & Notices */}
            <div style={{ display: 'grid', gridTemplateColumns: activeGuide.notices?.length ? '1fr 1fr' : '1fr', gap: '14px', marginBottom: '24px' }}>
              <div style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '6px',
                padding: '14px 16px'
              }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#166534', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>💡</span>
                  <span>업무 꿀팁 & 편의 기능</span>
                </div>
                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12.5px', color: '#14532d', lineHeight: '1.6' }}>
                  {activeGuide.tips.map((tip, idx) => (
                    <li key={idx} style={{ marginBottom: '4px' }}>{tip}</li>
                  ))}
                </ul>
              </div>

              {activeGuide.notices && activeGuide.notices.length > 0 && (
                <div style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '6px',
                  padding: '14px 16px'
                }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#991b1b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>⚠️</span>
                    <span>주의사항</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12.5px', color: '#7f1d1d', lineHeight: '1.6' }}>
                    {activeGuide.notices.map((notice, idx) => (
                      <li key={idx} style={{ marginBottom: '4px' }}>{notice}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Related Navigation */}
            {activeGuide.relatedPaths && activeGuide.relatedPaths.length > 0 && (
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                <span style={{ fontSize: '12px', fontWeight: 750, color: '#64748b', marginRight: '8px' }}>
                  연계 업무 포탈:
                </span>
                <div style={{ display: 'inline-flex', gap: '6px', flexWrap: 'wrap' }}>
                  {activeGuide.relatedPaths.map((rel, idx) => (
                    <Link
                      key={idx}
                      to={rel.path}
                      onClick={onClose}
                      style={{
                        fontSize: '12px',
                        padding: '3px 8px',
                        background: '#f1f5f9',
                        border: '1px solid #cbd5e1',
                        borderRadius: '4px',
                        color: '#334155',
                        textDecoration: 'none',
                        fontWeight: 600
                      }}
                    >
                      {rel.label} ↗
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
