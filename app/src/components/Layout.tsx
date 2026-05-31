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
  const [sidebarWidth, setSidebarWidth] = useState(240);
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
      { section: '무역 관리 시스템', items: [
        { path: '/', label: '⊞ Dashboard' },
        { path: '/list', label: '📋 전체 업무 리스트' },
        { path: '/proforma-invoices', label: '≡ Proforma Invoice', external: false },
        { path: '/products', label: '◫ 상품 DB', external: false },
        { path: '/customers', label: '◎ 고객사 관리', external: false },
        { path: '/suppliers', label: '◉ 공급업체 관리', external: false },
        { path: '/container/index.html', label: '🚢 컨테이너 적재 (새 창)', external: true }
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
      <aside className="sidebar" style={{ width: `${sidebarWidth}px`, flexShrink: 0, overflowY: 'auto' }}>
        <Link to="/" className="sidebar-header" style={{ textDecoration: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', height: '64px', borderBottom: '1px solid var(--border-color)', background: '#fff', padding: '0 16px' }}>
          <img src="/logo.png" alt="YSACC Logo" style={{ maxWidth: '100%', maxHeight: '44px', objectFit: 'contain' }} />
        </Link>

        {menuItems.map((group, gIdx) => (
          <div key={gIdx} className="sidebar-section">
            <div className="sidebar-section-title">{group.section}</div>
            {group.items.map((item: any) => (
              (item as any).external ? (
                <a 
                  key={item.path} 
                  href={item.path} 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="nav-item"
                  style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}
                >
                  <div>
                    <span>{item.label}</span>
                  </div>
                </a>
              ) : (
                <Link 
                  key={item.path} 
                  to={item.path} 
                  className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
                >
                  <div>
                    <span>{item.label}</span>
                    {(item as any).subLabel && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: '5px' }}>{(item as any).subLabel}</span>}
                  </div>
                  {item.count ? <span className="count">{item.count}</span> : null}
                </Link>
              )
            ))}
          </div>
        ))}


      </aside>

      {/* Resizable Divider Handle with premium micro-interactions */}
      <div 
        onMouseDown={startResizing}
        style={{
          width: '6px',
          cursor: 'col-resize',
          background: isDragging ? '#3b82f6' : 'transparent',
          borderLeft: '1px solid var(--border-color)',
          transition: 'background 0.1s',
          zIndex: 10,
          position: 'relative',
          marginLeft: '-3px',
          marginRight: '-3px',
          height: '100%',
          alignSelf: 'stretch',
          userSelect: 'none'
        }}
        onMouseEnter={(e) => { if (!isDragging) e.currentTarget.style.background = '#e2e8f0'; }}
        onMouseLeave={(e) => { if (!isDragging) e.currentTarget.style.background = 'transparent'; }}
      />

      <div className="main-wrapper" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <header className="header" style={{ height: '64px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-header)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px' }}>
          <div style={{ fontSize: '22px', fontWeight: '800', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center' }}>
            <span style={{ color: '#dc2626', marginRight: '6px' }}>YSACC</span>
            <span style={{ color: '#334155' }}>업무포탈</span>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {userProfile && (
              <span style={{ marginRight: '12px', fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
                {userProfile.department ? `${userProfile.department} ` : ''}{userProfile.name}님 로그인 중
              </span>
            )}
            <Link to="/profile" className="btn" style={{
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '6px',
              border: '1px solid #e8ecf0',
              backgroundColor: '#ffffff',
              fontSize: '13px',
              fontWeight: 600,
              color: '#4f46e5',
              cursor: 'pointer'
            }}>
              <span style={{ color: '#4f46e5', fontSize: '14px', lineHeight: '1' }}>⚙</span> 내 정보 수정
            </Link>
            <button className="btn" onClick={logout} style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '8px 16px',
              borderRadius: '6px',
              border: '1px solid #e8ecf0',
              backgroundColor: '#ffffff',
              fontSize: '13px',
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
