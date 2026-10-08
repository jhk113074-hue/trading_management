import React, { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { PORTAL_GUIDES, getPortalGuideByPath, type PortalGuide } from '../constants/portalGuides';
import { PortalScreenMockup } from './PortalScreenMockup';

interface PortalModelessDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialGuideId?: string;
}

export const PortalModelessDialog: React.FC<PortalModelessDialogProps> = ({
  isOpen,
  onClose,
  initialGuideId
}) => {
  const location = useLocation();
  const currentGuide = getPortalGuideByPath(location.pathname);

  const [selectedGuideId, setSelectedGuideId] = useState<string>(initialGuideId || currentGuide.id);
  const [selectedSubTabId, setSelectedSubTabId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'screen' | 'workflow' | 'features' | 'all'>('screen');
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dockPosition, setDockPosition] = useState<'right' | 'floating'>('right');

  // Whenever the user navigates to a new page, automatically sync the guide if not manually browsing another
  useEffect(() => {
    if (!initialGuideId) {
      setSelectedGuideId(currentGuide.id);
    }
  }, [location.pathname, currentGuide.id, initialGuideId]);

  const activeGuide: PortalGuide = PORTAL_GUIDES.find(g => g.id === selectedGuideId) || currentGuide;

  // Sync sub-tab ID when guide changes
  useEffect(() => {
    if (activeGuide.tabGuides && activeGuide.tabGuides.length > 0) {
      setSelectedSubTabId(activeGuide.tabGuides[0].tabId);
    } else {
      setSelectedSubTabId('');
    }
  }, [selectedGuideId, activeGuide.tabGuides]);

  // Filtered guides for the "all portals" selector
  const filteredGuides = PORTAL_GUIDES.filter(g => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return g.title.toLowerCase().includes(q) || g.category.toLowerCase().includes(q) || g.summary.toLowerCase().includes(q);
  });

  // When dialog is opened from header button, ensure it's not stuck in minimized state
  useEffect(() => {
    if (isOpen) {
      setIsMinimized(false);
    }
  }, [isOpen]);

  // If dialog is closed, do not render anything
  if (!isOpen) return null;

  /* ── 1. 최소화 모드 (Minimized Floating Bar) ── */
  if (isMinimized) {
    return (
      <div 
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '24px',
          zIndex: 99990,
          background: '#1e293b',
          color: '#ffffff',
          borderRadius: '30px',
          padding: '8px 18px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          cursor: 'pointer',
          border: '1.5px solid #3b82f6',
          transition: 'all 0.2s ease'
        }}
        onClick={() => setIsMinimized(false)}
        title="업무포탈 사용방법 가이드 창 복원하기"
      >
        <span style={{ fontSize: '18px' }}>📖</span>
        <span style={{ fontSize: '13px', fontWeight: 800 }}>
          {activeGuide.title} 사용방법
        </span>
        <span style={{
          background: '#3b82f6',
          color: '#fff',
          fontSize: '11px',
          fontWeight: 750,
          padding: '2px 8px',
          borderRadius: '12px'
        }}>
          🗖 펼치기
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            fontSize: '14px',
            cursor: 'pointer',
            padding: '2px',
            display: 'flex',
            alignItems: 'center'
          }}
          title="가이드 닫기"
        >
          ✕
        </button>
      </div>
    );
  }

  /* ── 2. 모달리스 창 모드 (Modeless Floating / Docked Dialog) ── */
  return (
    <div 
      className="portal-modeless-dialog"
      style={{
        position: 'fixed',
        top: dockPosition === 'right' ? '65px' : '90px',
        right: dockPosition === 'right' ? '12px' : '40px',
        width: dockPosition === 'right' ? '760px' : '720px',
        maxWidth: '94vw',
        height: dockPosition === 'right' ? 'calc(100vh - 80px)' : '82vh',
        backgroundColor: '#ffffff',
        borderRadius: '8px',
        border: '1.5px solid #94a3b8',
        boxShadow: '0 12px 36px rgba(15, 23, 42, 0.28), 0 0 0 1px rgba(15, 23, 42, 0.05)',
        zIndex: 99990,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        pointerEvents: 'auto',
        transition: 'all 0.2s ease'
      }}
    >
      {/* ── Dialog Header (Draggable / Title Bar) ── */}
      <div style={{
        background: '#1e293b',
        color: '#ffffff',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        cursor: 'default',
        userSelect: 'none',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span style={{ fontSize: '18px' }}>📖</span>
          <span style={{
            background: '#3b82f6',
            color: '#ffffff',
            padding: '2px 7px',
            borderRadius: '4px',
            fontSize: '10.5px',
            fontWeight: 800,
            whiteSpace: 'nowrap'
          }}>
            모달리스 매뉴얼
          </span>
          <h3 style={{
            margin: 0,
            fontSize: '14px',
            fontWeight: 800,
            color: '#f8fafc',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {activeGuide.title}
          </h3>
        </div>

        {/* Window Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {/* Quick Portal Switcher Dropdown */}
          <select
            value={selectedGuideId}
            onChange={(e) => setSelectedGuideId(e.target.value)}
            style={{
              height: '26px',
              padding: '0 6px',
              fontSize: '11.5px',
              fontWeight: 600,
              borderRadius: '4px',
              border: '1px solid #475569',
              background: '#334155',
              color: '#f8fafc',
              outline: 'none',
              cursor: 'pointer',
              maxWidth: '170px'
            }}
            title="다른 업무포탈 매뉴얼로 변경"
          >
            {PORTAL_GUIDES.map(g => (
              <option key={g.id} value={g.id}>
                {g.category} - {g.title}
              </option>
            ))}
          </select>

          {/* Dock toggle */}
          <button
            type="button"
            onClick={() => setDockPosition(prev => prev === 'right' ? 'floating' : 'right')}
            style={{
              background: '#334155',
              border: '1px solid #475569',
              color: '#cbd5e1',
              borderRadius: '4px',
              padding: '3px 8px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
            title={dockPosition === 'right' ? '중앙 플로팅으로 전환' : '우측 고정으로 전환'}
          >
            {dockPosition === 'right' ? '⛶ 플로팅' : '➔| 우측고정'}
          </button>

          {/* Minimize button */}
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            style={{
              background: '#334155',
              border: '1px solid #475569',
              color: '#cbd5e1',
              borderRadius: '4px',
              width: '26px',
              height: '26px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
            title="하단 작은 바로 최소화 (업무창 방해 방지)"
          >
            🗕
          </button>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#ef4444',
              border: 'none',
              color: '#ffffff',
              borderRadius: '4px',
              width: '26px',
              height: '26px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
            title="매뉴얼 창 닫기"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── Subheader Notice ── */}
      <div style={{
        background: '#eff6ff',
        padding: '6px 16px',
        borderBottom: '1px solid #bfdbfe',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '11.5px',
        color: '#1e40af',
        flexShrink: 0
      }}>
        <span>
          💡 <strong>모달리스 안내:</strong> 이 가이드 창을 띄워둔 상태에서 <strong>왼쪽 실제 화면을 직접 클릭하고 데이터를 입력</strong>하실 수 있습니다.
        </span>
        <span style={{ fontSize: '11px', color: '#64748b' }}>
          갱신일: {activeGuide.lastUpdated}
        </span>
      </div>

      {/* ── Tab Bar ── */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid #e2e8f0',
        backgroundColor: '#f8fafc',
        padding: '6px 12px 0 12px',
        gap: '4px',
        flexShrink: 0
      }}>
        <button
          onClick={() => setActiveTab('screen')}
          style={{
            padding: '7px 14px',
            border: '1px solid',
            borderColor: activeTab === 'screen' ? '#cbd5e1' : 'transparent',
            borderBottom: activeTab === 'screen' ? '2px solid #2563eb' : 'none',
            background: activeTab === 'screen' ? '#ffffff' : 'transparent',
            color: activeTab === 'screen' ? '#1e3a8a' : '#64748b',
            fontWeight: 800,
            fontSize: '12.5px',
            borderRadius: '4px 4px 0 0',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}
        >
          <span>🖥️</span>
          <span>화면 예시 & 입력 가이드</span>
        </button>

        <button
          onClick={() => setActiveTab('workflow')}
          style={{
            padding: '7px 14px',
            border: '1px solid',
            borderColor: activeTab === 'workflow' ? '#cbd5e1' : 'transparent',
            borderBottom: activeTab === 'workflow' ? '2px solid #2563eb' : 'none',
            background: activeTab === 'workflow' ? '#ffffff' : 'transparent',
            color: activeTab === 'workflow' ? '#1e3a8a' : '#64748b',
            fontWeight: 800,
            fontSize: '12.5px',
            borderRadius: '4px 4px 0 0',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}
        >
          <span>🔄</span>
          <span>업무 진행 프로세스</span>
        </button>

        <button
          onClick={() => setActiveTab('features')}
          style={{
            padding: '7px 14px',
            border: '1px solid',
            borderColor: activeTab === 'features' ? '#cbd5e1' : 'transparent',
            borderBottom: activeTab === 'features' ? '2px solid #2563eb' : 'none',
            background: activeTab === 'features' ? '#ffffff' : 'transparent',
            color: activeTab === 'features' ? '#1e3a8a' : '#64748b',
            fontWeight: 800,
            fontSize: '12.5px',
            borderRadius: '4px 4px 0 0',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}
        >
          <span>⭐</span>
          <span>핵심 기능 & 버튼 설명</span>
        </button>

        <button
          onClick={() => setActiveTab('all')}
          style={{
            padding: '7px 14px',
            border: '1px solid',
            borderColor: activeTab === 'all' ? '#cbd5e1' : 'transparent',
            borderBottom: activeTab === 'all' ? '2px solid #2563eb' : 'none',
            background: activeTab === 'all' ? '#ffffff' : 'transparent',
            color: activeTab === 'all' ? '#1e3a8a' : '#64748b',
            fontWeight: 800,
            fontSize: '12.5px',
            borderRadius: '4px 4px 0 0',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}
        >
          <span>📚</span>
          <span>전체 포탈 매뉴얼 목록</span>
        </button>
      </div>

      {/* ── Dialog Body (Scrollable) ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px', backgroundColor: '#ffffff' }}>
        {/* Summary Banner */}
        <div style={{
          background: '#f8fafc',
          borderLeft: '4px solid #3b82f6',
          padding: '10px 14px',
          borderRadius: '0 4px 4px 0',
          marginBottom: '18px',
          fontSize: '13px',
          color: '#334155',
          lineHeight: '1.5'
        }}>
          <strong>💡 {activeGuide.title}:</strong> {activeGuide.summary}
        </div>

        {/* ── TAB 1: 화면 예시 & 입력 가이드 (Screen Mockup + Step-by-Step Table) ── */}
        {activeTab === 'screen' && (() => {
          const activeSubTab = activeGuide.tabGuides?.find(t => t.tabId === selectedSubTabId) || (activeGuide.tabGuides && activeGuide.tabGuides[0]);
          const effectiveMockup = activeSubTab ? activeSubTab.screenMockup : activeGuide.screenMockup;
          const effectiveFieldSteps = activeSubTab ? activeSubTab.fieldSteps : activeGuide.fieldSteps;

          return (
            <div>
              {/* If tabGuides exist, render a dedicated sub-tab selector bar */}
              {activeGuide.tabGuides && activeGuide.tabGuides.length > 0 && (
                <div style={{
                  marginBottom: '16px',
                  background: '#f8fafc',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1'
                }}>
                  <div style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    color: '#475569',
                    letterSpacing: '0.02em',
                    marginBottom: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <span>📑 탭 메뉴별 상세 화면 & 입력 가이드 선택:</span>
                    <span style={{ color: '#2563eb', fontWeight: 700 }}>
                      총 {activeGuide.tabGuides.length}개 세부 탭 가이드
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {activeGuide.tabGuides.map(tab => {
                      const isTabActive = activeSubTab?.tabId === tab.tabId;
                      return (
                        <button
                          key={tab.tabId}
                          type="button"
                          onClick={() => setSelectedSubTabId(tab.tabId)}
                          style={{
                            height: '34px',
                            padding: '0 12px',
                            borderRadius: '4px',
                            border: isTabActive ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                            background: isTabActive ? '#2563eb' : '#ffffff',
                            color: isTabActive ? '#ffffff' : '#334155',
                            fontSize: '12px',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: isTabActive ? '0 2px 6px rgba(37, 99, 235, 0.25)' : 'none',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <span>{tab.tabIcon}</span>
                          <span>{tab.tabName}</span>
                        </button>
                      );
                    })}
                  </div>

                  {activeSubTab && (
                    <div style={{
                      marginTop: '8px',
                      padding: '8px 10px',
                      background: '#eff6ff',
                      borderRadius: '4px',
                      border: '1px solid #bfdbfe',
                      fontSize: '11.5px',
                      color: '#1e40af',
                      lineHeight: '1.45'
                    }}>
                      <strong>💡 [{activeSubTab.tabName}] 주요 가이드:</strong> {activeSubTab.tabSummary}
                    </div>
                  )}
                </div>
              )}

              <PortalScreenMockup
                mockup={effectiveMockup}
                fieldSteps={effectiveFieldSteps}
                portalId={activeGuide.id}
              />

              {/* Sub-tab specific tips if present */}
              {activeSubTab?.tips && activeSubTab.tips.length > 0 && (
                <div style={{
                  marginTop: '12px',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '6px',
                  padding: '10px 14px'
                }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#166534', marginBottom: '4px' }}>
                    💡 [{activeSubTab.tabName}] 업무 팁
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '11.5px', color: '#14532d', lineHeight: '1.5' }}>
                    {activeSubTab.tips.map((tip, idx) => (
                      <li key={idx}>{tip}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* If no custom mockup, show default helpful prompt */}
              {!effectiveMockup && (!effectiveFieldSteps || effectiveFieldSteps.length === 0) && (
                <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>🖥️</div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b', marginBottom: '4px' }}>
                    {activeGuide.title} 입력 가이드
                  </div>
                  <p style={{ fontSize: '12.5px', margin: 0 }}>
                    상단 [업무 진행 프로세스] 및 [핵심 기능 설명] 탭을 확인하여 업무를 진행해 주세요.
                  </p>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── TAB 2: 업무 진행 프로세스 (Workflow Steps) ── */}
        {activeTab === 'workflow' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h4 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 800, color: '#1e293b' }}>
              📌 {activeGuide.title} 표준 업무 처리 절차
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {activeGuide.workflow.map((step, idx) => (
                <div 
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
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

            {/* Tips Box */}
            <div style={{
              marginTop: '16px',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '6px',
              padding: '12px 16px'
            }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#166534', marginBottom: '6px' }}>
                💡 업무 팁 & 편의 기능
              </div>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12.5px', color: '#14532d', lineHeight: '1.6' }}>
                {activeGuide.tips.map((tip, idx) => (
                  <li key={idx} style={{ marginBottom: '4px' }}>{tip}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* ── TAB 3: 핵심 기능 & 버튼 설명 (Key Features) ── */}
        {activeTab === 'features' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h4 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 800, color: '#1e293b' }}>
              ⭐ 핵심 기능 & 화면 버튼 사용방법
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {activeGuide.instructions.map((inst, idx) => (
                <div 
                  key={idx}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '12px 14px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                      {inst.title}
                    </span>
                    {inst.badge && (
                      <span style={{
                        background: inst.badge.includes('최신') ? '#dcfce7' : '#eff6ff',
                        color: inst.badge.includes('최신') ? '#15803d' : '#2563eb',
                        border: `1px solid ${inst.badge.includes('최신') ? '#86efac' : '#bfdbfe'}`,
                        fontSize: '10.5px',
                        fontWeight: 750,
                        padding: '1px 6px',
                        borderRadius: '4px'
                      }}>
                        {inst.badge}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: '#475569', lineHeight: '1.55' }}>
                    {inst.desc}
                  </div>
                </div>
              ))}
            </div>

            {activeGuide.notices && activeGuide.notices.length > 0 && (
              <div style={{
                marginTop: '12px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                padding: '12px 16px'
              }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#991b1b', marginBottom: '6px' }}>
                  ⚠️ 주의사항
                </div>
                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12.5px', color: '#7f1d1d', lineHeight: '1.6' }}>
                  {activeGuide.notices.map((n, idx) => (
                    <li key={idx} style={{ marginBottom: '4px' }}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 4: 전체 포탈 매뉴얼 목록 & 검색 ── */}
        {activeTab === 'all' && (
          <div>
            <div style={{ marginBottom: '12px' }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="🔍 업무포탈 이름, 키워드 검색..."
                style={{
                  width: '100%',
                  height: '34px',
                  padding: '0 10px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
              {filteredGuides.map(guide => (
                <div
                  key={guide.id}
                  onClick={() => {
                    setSelectedGuideId(guide.id);
                    setActiveTab('screen');
                  }}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '6px',
                    border: guide.id === selectedGuideId ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                    background: guide.id === selectedGuideId ? '#eff6ff' : '#f8fafc',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#2563eb' }}>{guide.category}</span>
                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>{guide.lastUpdated}</span>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>
                    {guide.icon} {guide.title}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {guide.subtitle}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Dialog Footer ── */}
      <div style={{
        padding: '10px 16px',
        backgroundColor: '#f8fafc',
        borderTop: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11.5px', color: '#059669', fontWeight: 750 }}>
            ✓ 프로그램 변경 시 매뉴얼 실시간 자동 동기화 적용 중
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Link
            to="/system-logs"
            onClick={onClose}
            style={{
              fontSize: '11.5px',
              color: '#2563eb',
              textDecoration: 'none',
              fontWeight: 700
            }}
          >
            📜 시스템 업데이트 로그 ↗
          </Link>
          <button
            onClick={onClose}
            style={{
              height: '28px',
              padding: '0 10px',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 700,
              color: '#475569',
              cursor: 'pointer'
            }}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
