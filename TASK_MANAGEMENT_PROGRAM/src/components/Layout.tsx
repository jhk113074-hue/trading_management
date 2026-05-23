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

        <div className="sidebar-info-box" style={{ background: 'none', border: 'none', padding: '0 24px', marginTop: '20px' }}>
          <div className="sidebar-section-title" style={{ padding: 0, marginBottom: '10px' }}>프랭클린 시간 관리</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div style={{ fontSize: '0.65rem' }}><span style={{ color: 'var(--q1-color)', fontWeight: 'bold' }}>Q1</span> 긴급-중요</div>
            <div style={{ fontSize: '0.65rem' }}><span style={{ color: 'var(--q2-color)', fontWeight: 'bold' }}>Q2</span> 중요-비긴급</div>
            <div style={{ fontSize: '0.65rem' }}><span style={{ color: 'var(--q3-color)', fontWeight: 'bold' }}>Q3</span> 긴급-비중요</div>
            <div style={{ fontSize: '0.65rem' }}><span style={{ color: 'var(--q4-color)', fontWeight: 'bold' }}>Q4</span> 비긴급-비중요</div>
          </div>
        </div>
        <div style={{ marginTop: 'auto', padding: '20px', borderTop: '1px solid var(--border-color)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          <div style={{ fontWeight: 700, marginBottom: '8px', color: 'var(--text-muted)' }}>권장 운영 흐름</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div>1. 아침 점검 → 대기 바스켓</div>
            <div>2. 업무 착수 → 업무중 이동</div>
            <div>3. 종료 보고 → 완료 처리</div>
          </div>
        </div>
      </aside>

      <div className="main-wrapper">
        <header className="header" style={{ height: '64px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-header)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px' }}>
          <div style={{ fontSize: '16px', fontWeight: '800', color: '#1e293b', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center' }}>
            YSACC TASK MANAGEMENT PORTAL 업무포탈
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
