import React, { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTasks } from '../contexts/TaskContext';
import { TaskModal } from './TaskModal';
import { collection, onSnapshot, query, where, doc, updateDoc, getDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { Task, User } from '../types';
export const Layout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { userProfile, logout } = useAuth();
  const { tasks, addTask } = useTasks();
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [activeNotificationTask, setActiveNotificationTask] = useState<Task | null>(null);

  // Session Timeout (2 hours) States
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes countdown

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

  // TEMPORARY: Clean up duplicate auto-tasks for UNG-05
  React.useEffect(() => {
    const cleanUpDuplicates = async () => {
      try {
        const hasCleaned = localStorage.getItem('has_cleaned_duplicates_ung_05_layout_v2');
        if (hasCleaned) return;

        const { query, collection, where, getDocs, deleteDoc, updateDoc, doc } = await import('firebase/firestore');
        const { db } = await import('../firebase');

        const q = query(
          collection(db, 'tasks'),
          where('title', '==', `[자동] 견적서 작성: United Neama Group Gem Trad & Con... (PI: PI-YS-2026-UNG-05)`)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const sortedDocs = snap.docs.sort((a, b) => {
            const dateA = new Date(a.data().createdAt || 0).getTime();
            const dateB = new Date(b.data().createdAt || 0).getTime();
            return dateA - dateB;
          });
          
          // Update the first one to correct ID/name
          await updateDoc(doc(db, 'tasks', sortedDocs[0].id), {
            assigneeId: 'jhkim1130',
            assigneeName: '김주한',
            createdBy: 'jhkim1130'
          });

          // Delete duplicates
          for (let i = 1; i < sortedDocs.length; i++) {
            await deleteDoc(doc(db, 'tasks', sortedDocs[i].id));
          }
          console.log(`Successfully purged ${sortedDocs.length - 1} duplicate tasks and updated original assignee`);
        }
        localStorage.setItem('has_cleaned_duplicates_ung_05_layout_v2', 'true');
      } catch (err) {
        console.error("Purge duplicates error in Layout:", err);
      }
    };
    cleanUpDuplicates();
  }, []);

  // 2 Hours Session Timeout Monitor Hook
  React.useEffect(() => {
    if (!userProfile) return;

    const updateActivity = () => {
      setLastActivity(Date.now());
    };

    // Activity Listeners
    window.addEventListener('mousemove', updateActivity);
    window.addEventListener('mousedown', updateActivity);
    window.addEventListener('keydown', updateActivity);
    window.addEventListener('scroll', updateActivity);
    window.addEventListener('touchstart', updateActivity);

    const timeoutInterval = setInterval(() => {
      const now = Date.now();
      const inactiveTime = now - lastActivity;

      // 115 Minutes Inactive (6900000 ms) -> Trigger Warning Countdown
      if (inactiveTime >= 6900000) {
        setShowTimeoutWarning(true);
      } else {
        setShowTimeoutWarning(false);
        setTimeLeft(300); // Reset timer if activity was updated
      }
    }, 1000);

    return () => {
      window.removeEventListener('mousemove', updateActivity);
      window.removeEventListener('mousedown', updateActivity);
      window.removeEventListener('keydown', updateActivity);
      window.removeEventListener('scroll', updateActivity);
      window.removeEventListener('touchstart', updateActivity);
      clearInterval(timeoutInterval);
    };
  }, [lastActivity, userProfile]);

  // Countdown decrement hook when warning modal is active
  React.useEffect(() => {
    if (!showTimeoutWarning) return;

    const countdownInterval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          logout(); // Session Expired -> Trigger Logout
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownInterval);
  }, [showTimeoutWarning, logout]);

  const handleExtendSession = () => {
    setLastActivity(Date.now());
    setShowTimeoutWarning(false);
    setTimeLeft(300);
  };

  // 2시간 (7200000 ms) 중 남은 세션 시간(초 단위) 계산 상태
  const [sessionTimeLeft, setSessionTimeLeft] = useState(7200); // 2 hours = 7200 seconds

  React.useEffect(() => {
    if (!userProfile) return;

    const timerId = setInterval(() => {
      const elapsed = Date.now() - lastActivity;
      const remainingMs = Math.max(0, 7200000 - elapsed);
      setSessionTimeLeft(Math.floor(remainingMs / 1000));
    }, 1000);

    return () => clearInterval(timerId);
  }, [lastActivity, userProfile]);

  const formatCountdown = (totalSeconds: number) => {
    const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const ss = String(totalSeconds % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  };

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

  const prevUnreadIdsRef = React.useRef<string[]>([]);
  const isFirstLoadRef = React.useRef(true);

  const playNotificationSound = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      
      const playTone = (freq: number, start: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.15, start + 0.05); // volume
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(start);
        osc.stop(start + duration);
      };

      const now = ctx.currentTime;
      playTone(587.33, now, 0.4); // D5
      playTone(880, now + 0.1, 0.5); // A5
    } catch (err) {
      console.warn("Failed to play notification sound:", err);
    }
  };

  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [newMeetingsCount, setNewMeetingsCount] = useState(0);

  // 1. approvals snapshot listener (approvals pending signature)
  React.useEffect(() => {
    if (!userProfile?.id) return;
    const q = query(
      collection(db, 'approvals'), 
      where('approverId', '==', userProfile.id),
      where('status', '==', 'PENDING')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPendingApprovalsCount(snapshot.size);
    });
    return () => unsubscribe();
  }, [userProfile?.id]);

  // 2. meetings snapshot listener (meetings unread)
  React.useEffect(() => {
    if (!userProfile?.id) return;
    
    const unsubscribe = onSnapshot(collection(db, 'meetings'), (snapshot) => {
      const lastVisitedStr = localStorage.getItem(`meetings_last_visited_${userProfile.id}`) || '1970-01-01T00:00:00.000Z';
      const lastVisited = new Date(lastVisitedStr);
      
      let count = 0;
      snapshot.forEach(doc => {
        const data = doc.data();
        const createdAt = data.createdAt ? new Date(data.createdAt) : null;
        if (createdAt && createdAt > lastVisited && data.createdBy !== userProfile.id) {
          count++;
        }
      });
      setNewMeetingsCount(count);
    });
    
    return () => unsubscribe();
  }, [userProfile?.id]);

  // 3. reset meeting unread count on page navigation
  React.useEffect(() => {
    if (location.pathname === '/meetings' && userProfile?.id) {
      localStorage.setItem(`meetings_last_visited_${userProfile.id}`, new Date().toISOString());
      setNewMeetingsCount(0);
    }
  }, [location.pathname, userProfile?.id]);

  React.useEffect(() => {
    if (!userProfile?.id) return;
    const q = query(collection(db, 'mails'), where('receiverId', '==', userProfile.id));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched: any[] = [];
      snapshot.forEach(doc => {
        fetched.push({ id: doc.id, ...doc.data() });
      });
      // Sort in memory to avoid Firebase composite index errors
      fetched.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
      
      const unread = fetched.filter((n: any) => !n.isRead);
      const unreadIds = unread.map((n: any) => n.id);

      if (isFirstLoadRef.current) {
        isFirstLoadRef.current = false;
        prevUnreadIdsRef.current = unreadIds;
      } else {
        const hasNewUnread = unreadIds.some(id => !prevUnreadIdsRef.current.includes(id));
        if (hasNewUnread) {
          playNotificationSound();
          setShowNotifications(true);
        }
        prevUnreadIdsRef.current = unreadIds;
      }

      setNotifications(fetched);
    });
    return () => {
      unsubscribe();
      isFirstLoadRef.current = true;
      prevUnreadIdsRef.current = [];
    };
  }, [userProfile?.id]);

  const handleMarkAllAsRead = async () => {
    const unread = notifications.filter(n => !n.isRead);
    if (unread.length === 0) return;
    try {
      const batch = writeBatch(db);
      unread.forEach(n => {
        batch.update(doc(db, 'mails', n.id), { isRead: true });
      });
      await batch.commit();
    } catch (e) {
      console.error("Failed to mark all as read:", e);
    }
  };

  const handleNotificationClick = async (notif: any) => {
    setShowNotifications(false);
    try {
      if (!notif.isRead) {
        await updateDoc(doc(db, 'mails', notif.id), { isRead: true });
      }
      if (notif.taskId) {
        const taskSnap = await getDoc(doc(db, 'tasks', notif.taskId));
        if (taskSnap.exists()) {
          setActiveNotificationTask({ id: taskSnap.id, ...taskSnap.data() } as Task);
        } else {
          alert('존재하지 않거나 이미 삭제된 업무입니다.');
        }
      } else {
        navigate('/mails');
      }
    } catch (e) {
      console.error("Failed to process notification click:", e);
      alert('데이터를 불러오지 못했습니다.');
    }
  };

  const handleSaveNotificationTask = async (data: Partial<Task>) => {
    if (activeNotificationTask) {
      try {
        await updateDoc(doc(db, 'tasks', activeNotificationTask.id), data);
        setActiveNotificationTask(null);
      } catch (e) {
        console.error("Failed to save task:", e);
        alert('업무 저장에 실패했습니다.');
      }
    }
  };

  const menuItems = React.useMemo(() => {
    const groups = [
      { section: '', items: [
        { path: '/', label: '⊞ HOME' }
      ] as any },
      { section: '업무관리', items: [
        { path: '/list', label: '📋 전체 업무 리스트' },
        { path: '/leave-management', label: '📅 연월차 관리' },
        { path: '/approvals', label: '✍️ 전자결재', badgeCount: pendingApprovalsCount },
        { path: '/mails', label: '✉️ 사내 메일', badgeCount: notifications.filter(n => !n.isRead).length },
        { path: '/meetings', label: '📝 회의록 관리', badgeCount: newMeetingsCount }
      ] as any },
      { section: '영업관리', items: [
        { path: '/proforma-invoices', label: '≡ 견적관리', external: false },
        { path: '/orders', label: '📦 주문관리', external: false },
        { path: '/imports', label: '⚓ 수입관리', external: false }
      ] as any },
      { section: 'DB관리', items: [
        { path: '/products', label: '◫ 상품 DB', external: false },
        { path: '/customers', label: '◎ 고객사 관리', external: false },
        { path: '/suppliers', label: '◉ 공급업체 관리', external: false },
        { path: '/my-company', label: '🏢 자사 정보 관리', external: false }
      ] as any },
      { section: '시스템', items: [
        { path: '/issues', label: '🛠️ 오류/수정 게시판 (새 창)', external: true }
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
  }, [tasks, users, userProfile, pendingApprovalsCount, notifications, newMeetingsCount]);

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
                    onClick={e => {
                      e.preventDefault();
                      window.open(item.path, '_blank', 'width=1100,height=800,toolbar=no,menubar=no,scrollbars=yes,resizable=yes,location=no,status=no');
                    }}
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
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {item.label}
                      {item.badgeCount > 0 && (
                        <span 
                          className="blink-dot"
                          style={{ 
                            width: '6px', 
                            height: '6px', 
                            borderRadius: '50%', 
                            backgroundColor: '#ef4444', 
                            display: 'inline-block',
                            boxShadow: '0 0 4px rgba(239, 68, 68, 0.6)'
                          }} 
                        />
                      )}
                    </span>
                    {item.count ? <span style={{ background: 'rgba(13,148,136,0.3)', color: '#2dd4bf', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 700, padding: '1px 7px', flexShrink: 0 }}>{item.count}</span> : null}
                  </Link>
                )
              ))}
            </div>
          ))}
        </nav>

        {/* 하단 사용자 영역 */}
        {userProfile && (
          <div style={{ padding: '12px 16px 20px', borderTop: '1px solid var(--border-color)', marginTop: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary-color), var(--primary-hover))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                {userProfile.name?.charAt(0)}
              </div>
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userProfile.name}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userProfile.department || userProfile.role || ''}</div>
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
            background: isDragging ? 'var(--focus-ring)' : 'transparent',
            transition: 'background 0.15s',
            zIndex: 10,
            position: 'relative',
            height: '100%',
            alignSelf: 'stretch',
            userSelect: 'none'
          }}
          onMouseEnter={(e) => { if (!isDragging) e.currentTarget.style.background = 'rgba(42,162,177,0.3)'; }}
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
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px',
                borderRadius: 'var(--radius-md)',
                transition: 'background 0.1s',
                lineHeight: 1
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              title={sidebarCollapsed ? "메뉴 열기" : "메뉴 접기"}
            >
              ☰
            </button>
            <div className="header-logo-text" style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: '800', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
              <span style={{ color: 'var(--primary-color)', marginRight: '6px' }}>YSACC</span>
              <span style={{ color: 'var(--text-primary)' }}>업무포탈</span>
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {userProfile && (
              <span className="header-user-text" style={{ marginRight: '16px', fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                {userProfile.department ? `${userProfile.department} ` : ''}{userProfile.name}님 로그인 중
              </span>
            )}

            {/* 알림 종 아이콘 및 드롭다운 */}
            {userProfile && (
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    fontSize: '20px',
                    cursor: 'pointer',
                    position: 'relative',
                    padding: '8px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'background 0.2s',
                    outline: 'none',
                    color: 'var(--text-secondary)'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  title="알림 확인"
                >
                  🔔
                  {notifications.filter(n => !n.isRead).length > 0 && (
                    <span
                      style={{
                        position: 'absolute',
                        top: '2px',
                        right: '2px',
                        background: '#ef4444',
                        color: '#fff',
                        borderRadius: '50%',
                        fontSize: '10px',
                        width: '16px',
                        height: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        boxShadow: '0 0 0 2px #fff'
                      }}
                    >
                      {notifications.filter(n => !n.isRead).length}
                    </span>
                  )}
                </button>

                {showNotifications && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '40px',
                      right: '0',
                      width: '320px',
                      background: '#fff',
                      borderRadius: 'var(--radius-md)',
                      boxShadow: 'var(--shadow-lg)',
                      border: '1px solid var(--border-color)',
                      zIndex: 1000,
                      display: 'flex',
                      flexDirection: 'column',
                      maxHeight: '400px',
                      overflow: 'hidden'
                    }}
                  >
                    <div
                      style={{
                        padding: '10px 12px',
                        borderBottom: '1px solid var(--border-color)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: '#f8fafc'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>알림</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            playNotificationSound();
                          }}
                          style={{
                            background: '#f1f5f9',
                            border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-xs)',
                            color: 'var(--text-secondary)',
                            fontSize: '10px',
                            cursor: 'pointer',
                            fontWeight: 700,
                            padding: '2px 6px',
                          }}
                          title="알림 사운드 미리 듣기 및 브라우저 오디오 블록 해제"
                        >
                          🔊 소리 테스트
                        </button>
                      </div>
                      {notifications.filter(n => !n.isRead).length > 0 && (
                        <button
                          onClick={handleMarkAllAsRead}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-link)',
                            fontSize: '11px',
                            cursor: 'pointer',
                            fontWeight: 600
                          }}
                        >
                          ✓ 모두 읽음 처리
                        </button>
                      )}
                    </div>
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                      {notifications.length === 0 ? (
                        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                          새로운 알림이 없습니다.
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <div
                            key={n.id}
                            onClick={() => handleNotificationClick(n)}
                            style={{
                              padding: '10px 12px',
                              borderBottom: '1px solid #f1f5f9',
                              cursor: 'pointer',
                              background: n.isRead ? '#ffffff' : '#f0f9ff',
                              transition: 'background 0.2s',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '2px',
                              textAlign: 'left'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = n.isRead ? '#f8fafc' : '#e0f2fe'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = n.isRead ? '#ffffff' : '#f0f9ff'; }}
                          >
                            <div style={{ fontSize: '12px', color: '#0f172a', fontWeight: n.isRead ? 400 : 600 }}>
                              📢 <strong>{(!n.senderName || n.senderName.toUpperCase() === 'SYSTEM') ? '알림' : n.senderName}</strong>님이 검토를 요청했습니다.
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              업무: {n.taskTitle}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', background: '#f1f5f9', padding: '4px 6px', borderRadius: 'var(--radius-xs)', marginTop: '4px', fontStyle: 'italic' }}>
                              "{n.commentContent}"
                            </div>
                            <div style={{ fontSize: '9px', color: 'var(--text-muted)', alignSelf: 'flex-end', marginTop: '2px' }}>
                              {new Date(n.createdAt).toLocaleString()}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 세션 남은 시간 카운트다운 표시 영역 */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: '#f8fafc',
              border: '1px solid var(--border-color)',
              fontSize: '13.5px',
              fontWeight: 700,
              color: 'var(--text-secondary)',
              marginRight: '6px',
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                🔒 남은시간: <span style={{ color: sessionTimeLeft <= 300 ? '#ef4444' : '#0f172a' }}>{formatCountdown(sessionTimeLeft)}</span>
              </span>
              <button
                type="button"
                onClick={handleExtendSession}
                style={{
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: 'var(--primary-color)',
                  color: '#ffffff',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--primary-color)'}
              >
                연장
              </button>
            </div>

            <Link to="/profile" className="btn" style={{
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              backgroundColor: '#ffffff',
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              cursor: 'pointer'
            }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '17px', lineHeight: '1' }}>⚙</span> 내 정보 수정
            </Link>
            <button className="btn" onClick={logout} style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '10px 18px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
              backgroundColor: '#ffffff',
              fontSize: '15px',
              fontWeight: 600,
              color: 'var(--text-primary)',
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

      {activeNotificationTask && (
        <TaskModal
          initialTask={activeNotificationTask}
          onClose={() => setActiveNotificationTask(null)}
          onSave={handleSaveNotificationTask}
        />
      )}

      {showTimeoutWarning && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999999,
          pointerEvents: 'auto'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: 'var(--radius-lg)',
            padding: '24px',
            width: '420px',
            boxShadow: 'var(--shadow-lg)',
            textAlign: 'center',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ fontSize: '36px' }}>⏰</div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>보안 자동 로그아웃 안내</h3>
            <p style={{ fontSize: '14.5px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
              장시간 활동이 감지되지 않아 <strong>{Math.floor(timeLeft / 60)}분 {timeLeft % 60}초</strong> 후 보안을 위해 자동으로 로그아웃됩니다.
              <br />
              로그인 상태를 유지하시겠습니까?
            </p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={logout}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: '#f8fafc',
                  color: 'var(--text-secondary)',
                  fontSize: '14.5px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                즉시 로그아웃
              </button>
              <button
                type="button"
                onClick={handleExtendSession}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  background: 'var(--primary-color)',
                  color: '#ffffff',
                  fontSize: '14.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-brand)'
                }}
              >
                로그인 연장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
