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
        { path: '/proforma_invoices.html', label: '≡ Proforma Invoice', external: true },
        { path: '/products.html', label: '◫ 상품 DB', external: true },
        { path: '/customers.html', label: '◎ 고객사 관리', external: true },
        { path: '/suppliers.html', label: '◉ 공급업체 관리', external: true }
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
    <div className="app-container">
      <aside className="sidebar">
        <Link to="/" className="sidebar-header" style={{ textDecoration: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', minHeight: '80px', borderBottom: '1px solid var(--border-color)', background: '#fff', padding: '20px 16px 18px' }}>
          <img src="/logo.png" alt="YSACC Logo" style={{ maxWidth: '100%', maxHeight: '52px', objectFit: 'contain' }} />
        </Link>

        {menuItems.map((group, gIdx) => (
          <div key={gIdx} className="sidebar-section">
            <div className="sidebar-section-title">{group.section}</div>
            {group.items.map((item: any) => (
              (item as any).external ? (
                <a 
                  key={item.path} 
                  href={item.path} 
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

      <div className="main-wrapper">
        <header className="header" style={{ height: '72px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-header)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px' }}>
          <div style={{ fontSize: '20px', fontWeight: '800', color: '#1e293b', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center' }}>
            YSACC TASK MANAGEMENT PORTAL 업무포탈
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
