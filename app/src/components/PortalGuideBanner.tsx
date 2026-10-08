import React, { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { getPortalGuideByPath } from '../constants/portalGuides';

interface PortalGuideBannerProps {
  onOpenFullManual: (guideId?: string) => void;
}

export const PortalGuideBanner: React.FC<PortalGuideBannerProps> = ({ onOpenFullManual }) => {
  const location = useLocation();
  const guide = getPortalGuideByPath(location.pathname);

  // Read initial expand/collapse state from localStorage (default: false to keep it compact and clean)
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem('ysacc_portal_guide_expanded') === 'true';
    } catch {
      return false;
    }
  });

  const toggleExpand = () => {
    setIsExpanded(prev => {
      const next = !prev;
      try {
        localStorage.setItem('ysacc_portal_guide_expanded', String(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  };

  return (
    <div 
      className="portal-guide-banner"
      style={{
        background: '#ffffff',
        borderBottom: '1px solid #cbd5e1',
        boxShadow: '0 2px 4px rgba(15,23,42,0.03)',
        transition: 'all 0.2s ease',
        flexShrink: 0
      }}
    >
      {/* Top Bar Row */}
      <div 
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 20px',
          background: isExpanded ? '#f8fafc' : '#ffffff',
          borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none',
          gap: '12px',
          flexWrap: 'wrap'
        }}
      >
        {/* Left: Portal Identity & Summary */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: '1 1 auto' }}>
          <span style={{ 
            fontSize: '11px', 
            fontWeight: 800, 
            color: '#1d4ed8', 
            background: '#dbeafe', 
            padding: '2px 8px', 
            borderRadius: '4px',
            whiteSpace: 'nowrap'
          }}>
            {guide.category}
          </span>
          <span style={{ fontSize: '16px' }}>{guide.icon}</span>
          <span style={{ 
            fontSize: '13.5px', 
            fontWeight: 800, 
            color: '#0f172a', 
            whiteSpace: 'nowrap'
          }}>
            {guide.title}
          </span>
          <span style={{ color: '#cbd5e1', fontSize: '13px' }}>|</span>
          <span style={{ 
            fontSize: '12.5px', 
            color: '#475569', 
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {guide.summary}
          </span>
        </div>

        {/* Right: Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <button
            type="button"
            onClick={toggleExpand}
            style={{
              height: '28px',
              padding: '0 10px',
              background: isExpanded ? '#e2e8f0' : '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 700,
              color: '#334155',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}
            title={isExpanded ? '가이드 영역 간략히 접기' : '이 화면의 사용방법과 업무 흐름 펼쳐보기'}
          >
            <span>{isExpanded ? '▲' : '▼'}</span>
            <span>{isExpanded ? '가이드 접기' : '사용방법 보기'}</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenFullManual(guide.id)}
            style={{
              height: '28px',
              padding: '0 10px',
              background: '#3b82f6',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 750,
              color: '#ffffff',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              boxShadow: '0 1px 3px rgba(59,130,246,0.2)'
            }}
            title="전체 업무포탈 사용 매뉴얼 모달 열기"
          >
            <span>📖</span>
            <span>전체 매뉴얼</span>
          </button>
        </div>
      </div>

      {/* Expanded Details Drawer */}
      {isExpanded && (
        <div style={{
          padding: '16px 20px',
          background: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          fontSize: '13px',
          color: '#334155'
        }}>
          {/* Workflow Chain */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.02em' }}>
              📌 표준 업무 처리 프로세스
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              {guide.workflow.map((step, idx) => (
                <React.Fragment key={idx}>
                  <div style={{
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    padding: '4px 10px',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#1e293b',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                  }}>
                    {step}
                  </div>
                  {idx < guide.workflow.length - 1 && (
                    <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 800 }}>➔</span>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Key Instructions Grid */}
          <div>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.02em' }}>
              ⭐ 핵심 기능 & 버튼 사용방법
            </div>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', 
              gap: '8px' 
            }}>
              {guide.instructions.map((inst, idx) => (
                <div 
                  key={idx}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                    padding: '8px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '12.5px' }}>
                      {inst.title}
                    </span>
                    {inst.badge && (
                      <span style={{
                        background: inst.badge.includes('최신') ? '#dcfce7' : '#eff6ff',
                        color: inst.badge.includes('최신') ? '#15803d' : '#2563eb',
                        border: `1px solid ${inst.badge.includes('최신') ? '#86efac' : '#bfdbfe'}`,
                        fontSize: '10.5px',
                        fontWeight: 750,
                        padding: '1px 5px',
                        borderRadius: '3px'
                      }}>
                        {inst.badge}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: '#475569', lineHeight: '1.5' }}>
                    {inst.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer Bar inside Guide */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '6px',
            borderTop: '1px solid #e2e8f0',
            fontSize: '11.5px',
            color: '#64748b',
            flexWrap: 'wrap',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>💡 <strong>업무 팁:</strong> {guide.tips[0] || '각 항목을 정확히 입력하면 통계 및 정산 데이터에 자동 반영됩니다.'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ color: '#059669', fontWeight: 700 }}>
                ✓ 포탈 매뉴얼 최종 업데이트: {guide.lastUpdated}
              </span>
              <Link
                to="/system-logs"
                style={{
                  color: '#2563eb',
                  textDecoration: 'none',
                  fontWeight: 700,
                  fontSize: '11.5px'
                }}
              >
                📜 시스템 업데이트 로그 ↗
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
