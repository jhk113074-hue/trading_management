import React, { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTasks } from '../contexts/TaskContext';
import { TaskModal } from './TaskModal';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import type { Task, User } from '../types';

export const Layout: React.FC = () => {
  const location = useLocation();
  const { userProfile, logout } = useAuth();
  const { tasks, addTask } = useTasks();
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);

  // Drag-to-resize sidebar width states
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    return window.innerWidth <= 1100 ? 180 : 240;
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return window.innerWidth <= 1028;
  });
  const [isDragging, setIsDragging] = useState(false);

  const startResizing = React.useCallback((mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    setIsDragging(true);
  }, []);

  const stopResizing = React.useCallback(() => {
    setIsDragging(false);
  }, []);

  const resize = React.useCallback((mouseMoveEvent: MouseEvent) => {
    if (isDragging) {
      // Keep sidebar width within professional bounds (180px to 450px)
      const newWidth = Math.max(180, Math.min(450, mouseMoveEvent.clientX));
      setSidebarWidth(newWidth);
    }
  }, [isDragging]);

  React.useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isDragging, resize, stopResizing]);

  React.useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usersData: User[] = [];
      snapshot.forEach(doc => {
        usersData.push({ id: doc.id, ...doc.data() } as User);
      });
      setUsers(usersData);
    });
    return () => unsubscribe();
  }, []);

  const menuItems = React.useMemo(() => {
    const groups = [
      { section: '', items: [
        { path: '/', label: '⊞ HOME' }
      ] as any },
      { section: '업무관리', items: [
        { path: '/list', label: '📋 전체 업무 리스트' }
      ] as any },
      { section: '영업관리', items: [
        { path: '/proforma-invoices', label: '≡ 견적관리(Proforma Invoice)', external: false },
        { path: '/orders', label: '📦 주문관리', external: false },
        { path: '/container-packer', label: '🚢 컨테이너 적재 (새 창)', external: true },
        { path: '/issues', label: '🛠️ 프로그램 오류/수정 게시판 (새 창)', external: true }
      ] as any },
      { section: 'DB관리', items: [
        { path: '/products', label: '◫ 상품 DB', external: false },
        { path: '/customers', label: '◎ 고객사 관리', external: false },
        { path: '/suppliers', label: '◉ 공급업체 관리', external: false },
        { path: '/my-company', label: '🏢 자사 정보 관리', external: false }
      ] as any }
    ];

    if (userProfile?.role === '관리자') {
      groups.push({
        section: '관리',
        items: [
          { path: '/team-management', label: '⚙️ 직원 계정 관리' }
        ] as any
      });
    }

    return groups;
  }, [tasks, users, userProfile]);

  return (
    <div className="app-container" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <aside 
        className="sidebar" 
        style={{ 
          width: sidebarCollapsed ? '0px' : `${sidebarWidth}px`, 
          flexShrink: 0, 
          overflowY: 'auto',
          overflowX: 'hidden',
          transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* 로고 */}
        <Link to="/" style={{ textDecoration: 'none', display: 'block' }}>
          <div className="sidebar-header">
            <img src="/logo.png" alt="YSACC Logo" style={{ maxHeight: '48px', maxWidth: '140px', objectFit: 'contain' }} />
          </div>
        </Link>

        {/* 메뉴 */}
        <nav style={{ padding: '8px 0', flex: 1 }}>
          {menuItems.map((group, gIdx) => (
            <div key={gIdx} className="sidebar-section">
              {group.section && <div className="sidebar-section-title">{group.section}</div>}
              {group.items.map((item: any) => (
                (item as any).external ? (
                  <a 
                    key={item.path} 
                    href={item.path} 
                    target="_blank"
                    rel="noopener noreferrer"
                    className="nav-item"
                  >
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
                  </a>
                ) : (
                  <Link 
                    key={item.path} 
                    to={item.path} 
                    className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
                  >
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
                    {item.count ? <span style={{ background: 'rgba(13,148,136,0.3)', color: '#2dd4bf', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 700, padding: '1px 7px', flexShrink: 0 }}>{item.count}</span> : null}
                  </Link>
                )
              ))}
            </div>
          ))}
        </nav>

        {/* 하단 사용자 영역 */}
        {userProfile && (
          <div style={{ padding: '12px 16px 20px', borderTop: '1px solid #e2e8f0', marginTop: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'linear-gradient(135deg,#be123c,#9f1239)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                {userProfile.name?.charAt(0)}
              </div>
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userProfile.name}</div>
                <div style={{ fontSize: '0.72rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userProfile.department || userProfile.role || ''}</div>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Resizable Divider Handle */}
      {!sidebarCollapsed && (
        <div 
          onMouseDown={startResizing}
          style={{
            width: '5px',
            cursor: 'col-resize',
            background: isDragging ? '#0d9488' : 'transparent',
            transition: 'background 0.15s',
            zIndex: 10,
            position: 'relative',
            height: '100%',
            alignSelf: 'stretch',
            userSelect: 'none'
          }}
          onMouseEnter={(e) => { if (!isDragging) e.currentTarget.style.background = 'rgba(13,148,136,0.3)'; }}
          onMouseLeave={(e) => { if (!isDragging) e.currentTarget.style.background = 'transparent'; }}
        />
      )}

      <div className="main-wrapper" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <header className="header" style={{ height: '72px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-header)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '28px',
                cursor: 'pointer',
                color: '#475569',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px',
                borderRadius: '6px',
                transition: 'background 0.1s',
                lineHeight: 1
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              title={sidebarCollapsed ? "메뉴 열기" : "메뉴 접기"}
            >
              ☰
            </button>
            <div style={{ fontSize: '26px', fontWeight: '800', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center' }}>
              <span style={{ color: '#be123c', marginRight: '6px' }}>YSACC</span>
              <span style={{ color: '#334155' }}>업무포탈</span>
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {userProfile && (
              <span style={{ marginRight: '16px', fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>
                {userProfile.department ? `${userProfile.department} ` : ''}{userProfile.name}님 로그인 중
              </span>
            )}
            <Link to="/profile" className="btn" style={{
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              borderRadius: '6px',
              border: '1px solid #e8ecf0',
              backgroundColor: '#ffffff',
              fontSize: '15px',
              fontWeight: 600,
              color: '#4f46e5',
              cursor: 'pointer'
            }}>
              <span style={{ color: '#4f46e5', fontSize: '17px', lineHeight: '1' }}>⚙</span> 내 정보 수정
            </Link>
            <button className="btn" onClick={logout} style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '10px 18px',
              borderRadius: '6px',
              border: '1px solid #e8ecf0',
              backgroundColor: '#ffffff',
              fontSize: '15px',
              fontWeight: 600,
              color: '#1e293b',
              cursor: 'pointer'
            }}>
              로그아웃
            </button>
          </div>
        </header>

        <main className="content-area">
          <Outlet />
        </main>
      </div>

      {isNewTaskModalOpen && (
        <TaskModal 
          initialTask={{
            title: '',
            status: 'TODO',
            type: 'PROJECT',
            scheduleType: 'SELF',
            importance: 'B',
            urgency: 5,
            quadrant: 'Q2',
            assigneeId: userProfile?.id || '',
            assigneeName: userProfile?.name || '관리자',
            createdAt: new Date().toISOString()
          } as any}
          onClose={() => setIsNewTaskModalOpen(false)}
          onSave={async (data) => {
            await addTask(data as Task);
            setIsNewTaskModalOpen(false);
          }}
        />
      )}
    </div>
  );
};
