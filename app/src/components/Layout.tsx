import React, { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTasks } from '../contexts/TaskContext';
import { TaskModal } from './TaskModal';
import { Button, Card } from './ui';
import { collection, onSnapshot, query, where, doc, updateDoc, getDoc, writeBatch, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Task, User } from '../types';
import { BUILD_FULL_TEXT, APP_VERSION } from '../version';

const formatRelativeTime = (val?: string) => {
  if (!val) return '';
  try {
    const diff = Math.floor((Date.now() - new Date(val).getTime()) / 1000);
    if (diff < 60) return '방금 전';
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    if (diff < 172800) return '어제';
    return val.split('T')[0];
  } catch {
    return val;
  }
};

const stripHtml = (html: string) => {
  if (!html) return '';
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return (doc.body.textContent || doc.body.innerText || '').trim();
  } catch {
    return html.replace(/<[^>]*>?/gm, '').trim();
  }
};

const renderNotifBadge = (type?: string) => {
  switch (type) {
    case 'TASK_DELEGATED':
      return <span style={{ background: '#dbeafe', color: '#1d4ed8', fontSize: '11px', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>🤝 업무 위임</span>;
    case 'TASK_COMPLETED':
      return <span style={{ background: '#dcfce7', color: '#15803d', fontSize: '11px', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>✅ 완료 보고</span>;
    case 'APPROVAL_REQUEST':
      return <span style={{ background: '#f3e8ff', color: '#6b21a8', fontSize: '11px', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>📄 결재 요청</span>;
    default:
      return <span style={{ background: '#fef3c7', color: '#b45309', fontSize: '11px', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>📢 시스템 알림</span>;
  }
};

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

  // 실시간 기준환율 및 USD/CNY 30일 이동평균(MA30) 상태
  const [exchangeRates, setExchangeRates] = useState<{
    usd: number;
    usdMa30: number | null;
    usdTrend: 'UP' | 'DOWN' | 'SAME';
    usdDiff: number;
    eur: number;
    cny: number;
    cnyMa30: number | null;
    cnyTrend: 'UP' | 'DOWN' | 'SAME';
    cnyDiff: number;
    time: string;
    loading: boolean;
    error: boolean;
  }>({
    usd: 1391,
    usdMa30: 1432.8,
    usdTrend: 'DOWN',
    usdDiff: -41.8,
    eur: 1620,
    cny: 6.75,
    cnyMa30: 6.75,
    cnyTrend: 'SAME',
    cnyDiff: 0,
    time: '',
    loading: false,
    error: false,
  });

  const fetchExchangeRates = React.useCallback(async () => {
    setExchangeRates(prev => ({ ...prev, loading: true, error: false }));
    try {
      // 1. 최신 실시간 환율 호출 (USD 기준)
      const res = await fetch('https://open.er-api.com/v6/latest/USD');
      if (!res.ok) throw new Error('환율 정보를 불러올 수 없습니다.');
      const data = await res.json();
      const krw = data.rates?.KRW || 1390;
      const eur = data.rates?.EUR ? krw / data.rates.EUR : 1620;
      const usdToCny = data.rates?.CNY || 6.75; // 1 USD = ? CNY
      
      const currentUsd = Math.round(krw * 10) / 10;
      const currentCny = Math.round(usdToCny * 100) / 100;
      let calculatedMa30: number | null = null;
      let calculatedTrend: 'UP' | 'DOWN' | 'SAME' = 'SAME';
      let calculatedDiff = 0;

      let calculatedCnyMa30: number | null = null;
      let calculatedCnyTrend: 'UP' | 'DOWN' | 'SAME' = 'SAME';
      let calculatedCnyDiff = 0;

      // 2. 30일 전 과거 데이터 호출하여 USD(KRW) & USD/CNY 30일 이동평균(MA 30) 산출
      try {
        const d = new Date();
        const end = d.toISOString().split('T')[0];
        d.setDate(d.getDate() - 30);
        const start = d.toISOString().split('T')[0];

        // USD (KRW) 30일 데이터
        const histRes = await fetch(`https://api.frankfurter.dev/v1/${start}..${end}?base=USD&symbols=KRW`);
        if (histRes.ok) {
          const histData = await histRes.json();
          const rateValues: number[] = Object.values(histData.rates || {}).map((r: any) => r.KRW);
          if (rateValues.length > 0) {
            const sum = rateValues.reduce((a, b) => a + b, 0);
            calculatedMa30 = Math.round((sum / rateValues.length) * 10) / 10;
            calculatedDiff = Math.round((currentUsd - calculatedMa30) * 10) / 10;
            if (calculatedDiff > 1) {
              calculatedTrend = 'UP';
            } else if (calculatedDiff < -1) {
              calculatedTrend = 'DOWN';
            } else {
              calculatedTrend = 'SAME';
            }
          }
        }

        // USD/CNY 30일 데이터
        const cnyHistRes = await fetch(`https://api.frankfurter.dev/v1/${start}..${end}?base=USD&symbols=CNY`);
        if (cnyHistRes.ok) {
          const cnyHistData = await cnyHistRes.json();
          const cnyRateValues: number[] = Object.values(cnyHistData.rates || {}).map((r: any) => r.CNY);
          if (cnyRateValues.length > 0) {
            const cnySum = cnyRateValues.reduce((a, b) => a + b, 0);
            calculatedCnyMa30 = Math.round((cnySum / cnyRateValues.length) * 100) / 100;
            calculatedCnyDiff = Math.round((currentCny - calculatedCnyMa30) * 100) / 100;
            if (calculatedCnyDiff > 0.01) {
              calculatedCnyTrend = 'UP';
            } else if (calculatedCnyDiff < -0.01) {
              calculatedCnyTrend = 'DOWN';
            } else {
              calculatedCnyTrend = 'SAME';
            }
          }
        }
      } catch (histErr) {
        console.warn('30일 이동평균 조회 중 오류 (기본값 유지):', histErr);
      }

      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      
      setExchangeRates({
        usd: currentUsd,
        usdMa30: calculatedMa30 ?? 1432.8,
        usdTrend: calculatedTrend,
        usdDiff: calculatedDiff,
        eur: Math.round(eur * 10) / 10,
        cny: currentCny,
        cnyMa30: calculatedCnyMa30 ?? 6.75,
        cnyTrend: calculatedCnyTrend,
        cnyDiff: calculatedCnyDiff,
        time: timeStr,
        loading: false,
        error: false
      });
    } catch (err) {
      console.error('Failed to fetch exchange rates:', err);
      setExchangeRates(prev => ({ ...prev, loading: false, error: true }));
    }
  }, []);

  React.useEffect(() => {
    fetchExchangeRates();
    // 30분마다 자동 갱신
    const interval = setInterval(fetchExchangeRates, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchExchangeRates]);

  const [collapsedSections, setCollapsedSections] = useState<{[key: string]: boolean}>(() => {
    try {
      const saved = localStorage.getItem('sidebar_collapsed_sections');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // ignore
    }
    return {
      'DB관리': true,
      '시스템': true,
      '관리': true
    };
  });

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => {
      const next = { ...prev, [section]: !prev[section] };
      localStorage.setItem('sidebar_collapsed_sections', JSON.stringify(next));
      return next;
    });
  };


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
  const [notifFilterTab, setNotifFilterTab] = useState<'all' | 'unread' | 'tasks' | 'approvals' | 'system'>('all');
  const [latestToast, setLatestToast] = useState<any | null>(null);

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
    if (window.innerWidth <= 1028) {
      setSidebarCollapsed(true);
    }
  }, [location.pathname]);

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

  // Clean up existing auto-generated Order management tasks per user request
  React.useEffect(() => {
    const cleanUpOrderAutoTasks = async () => {
      try {
        const hasCleaned = localStorage.getItem('has_cleaned_order_auto_tasks_v1');
        if (hasCleaned) return;

        const { query, collection, getDocs, deleteDoc, doc } = await import('firebase/firestore');
        const { db } = await import('../firebase');

        const q = query(collection(db, 'tasks'));
        const snap = await getDocs(q);
        if (!snap.empty) {
          for (const docSnap of snap.docs) {
            const data = docSnap.data();
            if (data.title && typeof data.title === 'string' && data.title.includes('[자동] 주문 관리')) {
              await deleteDoc(doc(db, 'tasks', docSnap.id));
              console.log('Purged auto order task:', docSnap.id);
            }
          }
        }
        localStorage.setItem('has_cleaned_order_auto_tasks_v1', 'true');
      } catch (err) {
        console.error("Purge auto order tasks error:", err);
      }
    };
    cleanUpOrderAutoTasks();
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

  const handleDeleteNotification = async (notifId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteDoc(doc(db, 'mails', notifId));
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const handleClearReadNotifications = async () => {
    const readMails = notifications.filter(n => n.isRead);
    if (readMails.length === 0) {
      alert('정리할 읽은 알림이 없습니다.');
      return;
    }
    if (!window.confirm(`읽은 알림 ${readMails.length}건을 정리(삭제)하시겠습니까?`)) return;
    try {
      const batch = writeBatch(db);
      readMails.forEach(n => batch.delete(doc(db, 'mails', n.id)));
      await batch.commit();
    } catch (e) {
      console.error(e);
      alert('알림 정리에 실패했습니다.');
    }
  };

  const handleClearAllNotifications = async () => {
    if (notifications.length === 0) return;
    if (!window.confirm(`전체 알림 ${notifications.length}건을 모두 삭제하시겠습니까?`)) return;
    try {
      const batch = writeBatch(db);
      notifications.forEach(n => batch.delete(doc(db, 'mails', n.id)));
      await batch.commit();
    } catch (e) {
      console.error(e);
      alert('알림 일괄 삭제에 실패했습니다.');
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
        { path: '/proforma-invoices', label: '📤 수출 견적관리', external: false },
        { path: '/orders', label: '📦 수출 주문관리', external: false },
        { path: '/import-quotes', label: '📥 수입 견적관리', external: false },
        { path: '/imports', label: '⚓ 수입 주문관리', external: false },
        { path: '/domestic-quotes', label: '📋 국내 견적관리', external: false },
        { path: '/domestic-orders', label: '🏬 국내 주문관리', external: false }
      ] as any },
      { section: 'DB관리', items: [
        { path: '/products', label: '◫ 상품 DB', external: false },
        { path: '/customers', label: '◎ 고객사 관리', external: false },
        { path: '/suppliers', label: '◉ 공급업체 관리', external: false },
        { path: '/my-company', label: '🏢 자사 정보 관리', external: false },
        { path: '/credentials', label: '🔑 비밀번호 관리', external: false }
      ] as any },
      { section: '시스템', items: [
        { path: '/system-logs', label: '📜 시스템 업데이트 로그', external: false },
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
      {!sidebarCollapsed && (
        <div 
          className="sidebar-backdrop" 
          onClick={() => setSidebarCollapsed(true)} 
        />
      )}
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
          {menuItems.map((group, gIdx) => {
            const isCollapsed = group.section ? !!collapsedSections[group.section] : false;
            return (
              <div key={gIdx} className="sidebar-section" style={{ marginBottom: '12px' }}>
                {group.section && (
                  <div 
                    className="sidebar-section-title"
                    onClick={() => toggleSection(group.section)}
                    style={{ 
                      cursor: 'pointer', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      userSelect: 'none',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <span>{group.section}</span>
                    <span style={{ fontSize: '9px', opacity: 0.7 }}>
                      {isCollapsed ? '▶' : '▼'}
                    </span>
                  </div>
                )}
                {!isCollapsed && group.items.map((item: any) => (
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
            );
          })}
        </nav>

        {/* 하단 사용자 영역 및 배포 버전 정보 */}
        {userProfile && (
          <div style={{ padding: '12px 16px 16px', borderTop: '1px solid var(--border-color)', marginTop: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary-color), var(--primary-hover))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                {userProfile.name?.charAt(0)}
              </div>
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userProfile.name}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userProfile.department || userProfile.role || ''}</div>
              </div>
            </div>
            <div style={{ fontSize: '10.5px', fontWeight: 600, color: '#64748b', textAlign: 'center', background: '#f8fafc', padding: '4px 6px', borderRadius: '4px', border: '1px solid #e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {BUILD_FULL_TEXT}
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
            <div className="header-logo-text" style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: '800', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', gap: '8px' }}>
              <span style={{ color: 'var(--primary-color)', marginRight: '2px' }}>YSACC</span>
              <span style={{ color: 'var(--text-primary)' }}>업무포탈</span>
              <span 
                title={BUILD_FULL_TEXT} 
                style={{ 
                  padding: '3px 9px', 
                  background: '#eff6ff', 
                  border: '1px solid #93c5fd', 
                  color: '#1e40af', 
                  borderRadius: '12px', 
                  fontSize: '12px', 
                  fontWeight: 750,
                  letterSpacing: '0.02em',
                  marginLeft: '4px' 
                }}
              >
                {APP_VERSION}
              </span>

              {/* 오늘의 기준환율 (USD / EUR / CNY + 새로고침 🔄) */}
              <div 
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginLeft: '12px',
                  padding: '4px 10px',
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  color: '#334155',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                }}
                title={`실시간 매매기준율 (마지막 갱신: ${exchangeRates.time || '조회중'})`}
              >
                <span style={{ fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <span>💵</span>
                  <span>기준환율</span>
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                  {/* USD with 30-day moving average & trend */}
                  <span 
                    style={{ 
                      background: '#fff', 
                      padding: '2px 8px', 
                      borderRadius: '4px', 
                      border: exchangeRates.usdTrend === 'UP' ? '1px solid #fecaca' : exchangeRates.usdTrend === 'DOWN' ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title={`현재: ₩${exchangeRates.usd.toLocaleString()} | 30일 이동평균: ₩${exchangeRates.usdMa30?.toLocaleString() || '-'} (${exchangeRates.usdDiff > 0 ? '+' : ''}${exchangeRates.usdDiff}원)`}
                  >
                    <strong style={{ color: '#2563eb' }}>USD</strong> ₩{exchangeRates.usd.toLocaleString()}
                    <span style={{ 
                      fontSize: '11px', 
                      fontWeight: 800,
                      color: exchangeRates.usdTrend === 'UP' ? '#ef4444' : exchangeRates.usdTrend === 'DOWN' ? '#2563eb' : '#64748b' 
                    }}>
                      {exchangeRates.usdTrend === 'UP' ? '🔺' : exchangeRates.usdTrend === 'DOWN' ? '🔻' : '➖'}
                    </span>
                    {exchangeRates.usdMa30 && (
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                        (30일평균 ₩{exchangeRates.usdMa30.toLocaleString()})
                      </span>
                    )}
                  </span>

                  <span style={{ background: '#fff', padding: '2px 6px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                    <strong style={{ color: '#059669' }}>EUR</strong> ₩{exchangeRates.eur.toLocaleString()}
                  </span>

                  {/* USD / CNY with 30-day moving average & trend */}
                  <span 
                    style={{ 
                      background: '#fff', 
                      padding: '2px 8px', 
                      borderRadius: '4px', 
                      border: exchangeRates.cnyTrend === 'UP' ? '1px solid #fecaca' : exchangeRates.cnyTrend === 'DOWN' ? '1px solid #fed7aa' : '1px solid #e2e8f0',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title={`1 USD = ${exchangeRates.cny} CNY | 30일 이동평균: ${exchangeRates.cnyMa30 ?? '-'} CNY (${exchangeRates.cnyDiff > 0 ? '+' : ''}${exchangeRates.cnyDiff})`}
                  >
                    <strong style={{ color: '#d97706' }}>USD/CNY</strong> {exchangeRates.cny.toFixed(2)}
                    <span style={{ 
                      fontSize: '11px', 
                      fontWeight: 800,
                      color: exchangeRates.cnyTrend === 'UP' ? '#ef4444' : exchangeRates.cnyTrend === 'DOWN' ? '#d97706' : '#64748b' 
                    }}>
                      {exchangeRates.cnyTrend === 'UP' ? '🔺' : exchangeRates.cnyTrend === 'DOWN' ? '🔻' : '➖'}
                    </span>
                    {exchangeRates.cnyMa30 && (
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                        (30일평균 {exchangeRates.cnyMa30.toFixed(2)})
                      </span>
                    )}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fetchExchangeRates();
                  }}
                  disabled={exchangeRates.loading}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: exchangeRates.loading ? 'wait' : 'pointer',
                    fontSize: '13px',
                    padding: '2px 4px',
                    borderRadius: '4px',
                    color: exchangeRates.loading ? '#94a3b8' : '#2563eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s'
                  }}
                  title="실시간 환율 새로고침 🔄"
                >
                  <span style={{ display: 'inline-block', transform: exchangeRates.loading ? 'rotate(180deg)' : 'none', transition: 'transform 0.5s' }}>
                    🔄
                  </span>
                </button>
              </div>
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

            {/* ── 메이저 그룹웨어 스타일 우측 슬라이드 알림 패널 (Slide Drawer) ── */}
            {showNotifications && (
              <div 
                onClick={() => setShowNotifications(false)}
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  width: '100vw',
                  height: '100vh',
                  backgroundColor: 'rgba(15, 23, 42, 0.35)',
                  backdropFilter: 'blur(2px)',
                  zIndex: 999998,
                  display: 'flex',
                  justifyContent: 'flex-end'
                }}
              >
                <div 
                  onClick={e => e.stopPropagation()}
                  style={{
                    width: '420px',
                    maxWidth: '90vw',
                    height: '100vh',
                    backgroundColor: '#ffffff',
                    boxShadow: '-10px 0 30px rgba(15, 23, 42, 0.2)',
                    display: 'flex',
                    flexDirection: 'column',
                    zIndex: 999999
                  }}
                >
                  {/* 패널 상단 헤더 */}
                  <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>🔔 알림 센터</span>
                      {notifications.filter(n => !n.isRead).length > 0 && (
                        <span style={{ background: '#ef4444', color: '#fff', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 800 }}>
                          {notifications.filter(n => !n.isRead).length}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          playNotificationSound();
                        }}
                        style={{
                          background: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          color: '#475569',
                          fontSize: '11px',
                          cursor: 'pointer',
                          fontWeight: 700,
                          padding: '4px 8px'
                        }}
                        title="소리 테스트"
                      >
                        🔊 소리
                      </button>
                      <button
                        onClick={() => setShowNotifications(false)}
                        style={{ background: 'transparent', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b', padding: '4px' }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* 필터 탭 & 알림 관리 서브 바 */}
                  <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: '8px', backgroundColor: '#ffffff' }}>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => setNotifFilterTab('all')}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          border: '1px solid #cbd5e1',
                          background: notifFilterTab === 'all' ? '#1e293b' : '#ffffff',
                          color: notifFilterTab === 'all' ? '#ffffff' : '#475569',
                          fontSize: '11.5px',
                          fontWeight: 750,
                          cursor: 'pointer'
                        }}
                      >
                        전체 ({notifications.length})
                      </button>
                      <button
                        onClick={() => setNotifFilterTab('unread')}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          border: '1px solid #cbd5e1',
                          background: notifFilterTab === 'unread' ? '#3b82f6' : '#ffffff',
                          color: notifFilterTab === 'unread' ? '#ffffff' : '#475569',
                          fontSize: '11.5px',
                          fontWeight: 750,
                          cursor: 'pointer'
                        }}
                      >
                        안 읽음 ({notifications.filter(n => !n.isRead).length})
                      </button>
                      <button
                        onClick={() => setNotifFilterTab('tasks')}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          border: '1px solid #cbd5e1',
                          background: notifFilterTab === 'tasks' ? '#2563eb' : '#ffffff',
                          color: notifFilterTab === 'tasks' ? '#ffffff' : '#475569',
                          fontSize: '11.5px',
                          fontWeight: 750,
                          cursor: 'pointer'
                        }}
                      >
                        🤝 업무·보고
                      </button>
                      <button
                        onClick={() => setNotifFilterTab('approvals')}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '4px',
                          border: '1px solid #cbd5e1',
                          background: notifFilterTab === 'approvals' ? '#7c3aed' : '#ffffff',
                          color: notifFilterTab === 'approvals' ? '#ffffff' : '#475569',
                          fontSize: '11.5px',
                          fontWeight: 750,
                          cursor: 'pointer'
                        }}
                      >
                        📄 결재
                      </button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px', borderTop: '1px dashed #e2e8f0' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {notifications.filter(n => !n.isRead).length > 0 && (
                          <button
                            onClick={handleMarkAllAsRead}
                            style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '11.5px', fontWeight: 750, cursor: 'pointer', padding: 0 }}
                          >
                            ✓ 모두 읽음
                          </button>
                        )}
                        <button
                          onClick={handleClearReadNotifications}
                          style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                        >
                          🧹 읽은 알림 정리
                        </button>
                      </div>
                      <button
                        onClick={handleClearAllNotifications}
                        style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                      >
                        🗑️ 전체 비우기
                      </button>
                    </div>
                  </div>

                  {/* 알림 목록 피드 */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                    {(() => {
                      let list = notifications;
                      if (notifFilterTab === 'unread') {
                        list = notifications.filter(n => !n.isRead);
                      } else if (notifFilterTab === 'tasks') {
                        list = notifications.filter(n => n.type === 'TASK_DELEGATED' || n.type === 'TASK_COMPLETED');
                      } else if (notifFilterTab === 'approvals') {
                        list = notifications.filter(n => n.type === 'APPROVAL_REQUEST');
                      } else if (notifFilterTab === 'system') {
                        list = notifications.filter(n => !n.type || (n.type !== 'TASK_DELEGATED' && n.type !== 'TASK_COMPLETED' && n.type !== 'APPROVAL_REQUEST'));
                      }

                      if (list.length === 0) {
                        return (
                          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔕</div>
                            {notifFilterTab === 'unread' ? '안 읽은 알림이 없습니다.' : '해당 카테고리의 알림이 없습니다.'}
                          </div>
                        );
                      }

                      return list.map(n => {
                        const displayTitle = n.title || (n.senderName ? `${n.senderName}님의 알림` : '시스템 알림');
                        const displayContent = n.content || n.commentContent || (n.taskTitle ? `업무: ${n.taskTitle}` : '');

                        return (
                          <div
                            key={n.id}
                            onClick={() => {
                              handleNotificationClick(n);
                              setShowNotifications(false);
                            }}
                            style={{
                              padding: '14px 16px',
                              marginBottom: '10px',
                              borderRadius: '8px',
                              border: n.isRead ? '1px solid #f1f5f9' : '1px solid #bae6fd',
                              backgroundColor: n.isRead ? '#ffffff' : '#f0f9ff',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px',
                              boxShadow: n.isRead ? 'none' : '0 2px 8px rgba(56, 189, 248, 0.12)',
                              position: 'relative'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = n.isRead ? '#f8fafc' : '#e0f2fe'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = n.isRead ? '#ffffff' : '#f0f9ff'; }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {renderNotifBadge(n.type)}
                                <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#334155' }}>
                                  {n.senderName && n.senderName.toUpperCase() !== 'SYSTEM' ? n.senderName : '시스템'}
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>
                                  {formatRelativeTime(n.createdAt)}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteNotification(n.id, e)}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#94a3b8',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    padding: '2px 4px',
                                    borderRadius: '4px'
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                                  onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}
                                  title="알림 삭제"
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>

                            <div style={{ fontSize: '14px', color: '#0f172a', fontWeight: n.isRead ? 600 : 800, lineHeight: 1.35 }}>
                              {displayTitle}
                            </div>

                            {displayContent && (
                              <div style={{
                                fontSize: '12.5px',
                                color: '#475569',
                                background: n.isRead ? '#f8fafc' : '#ffffff',
                                border: '1px solid #e2e8f0',
                                padding: '10px 12px',
                                borderRadius: '6px',
                                lineHeight: 1.45,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                maxHeight: '100px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}>
                                {stripHtml(displayContent)}
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* ── 우측 하단 실시간 알림 토스트 (Real-time Toast Alert) ── */}
            {latestToast && (
              <div 
                onClick={() => {
                  handleNotificationClick(latestToast);
                  setLatestToast(null);
                }}
                style={{
                  position: 'fixed',
                  bottom: '24px',
                  right: '24px',
                  zIndex: 999999,
                  backgroundColor: '#0f172a',
                  color: '#ffffff',
                  padding: '16px 20px',
                  borderRadius: '10px',
                  boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
                  maxWidth: '380px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  border: '1px solid #334155'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    🔔 새 알림 도착
                  </div>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>방금 전</span>
                </div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>
                  {latestToast.title || latestToast.taskTitle || '새로운 알림이 도착했습니다.'}
                </div>
                {latestToast.content && (
                  <div style={{ fontSize: '12px', color: '#cbd5e1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {latestToast.content}
                  </div>
                )}
              </div>
            )}
              </div>
            )}
            {/* 세션 남은 시간 카운트다운 표시 영역 */}
            <div className="header-session-time" style={{
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
              <span className="header-session-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                🔒 남은시간: <span style={{ color: sessionTimeLeft <= 300 ? '#ef4444' : '#0f172a' }}>{formatCountdown(sessionTimeLeft)}</span>
              </span>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleExtendSession}
                style={{ padding: '2px 10px' }}
              >
                연장
              </Button>
            </div>

            <Link to="/profile" className="btn header-profile-link" style={{
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
              <span style={{ color: 'var(--text-secondary)', fontSize: '17px', lineHeight: '1' }}>⚙</span>
              <span className="header-profile-text">내 정보 수정</span>
            </Link>
            <Button variant="secondary" onClick={logout} className="header-logout-btn">
              로그아웃
            </Button>
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
          <Card
            padding="24px"
            style={{
              width: '420px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ fontSize: '36px' }}>⏰</div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>보안 자동 로그아웃 안내</h3>
            <p style={{ fontSize: '14.5px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
              장시간 활동이 감지되지 않아 <strong>{Math.floor(timeLeft / 60)}분 {timeLeft % 60}초</strong> 후 보안을 위해 자동으로 로그아웃됩니다.
              <br />
              로그인 상태를 유지하시겠습니까?
            </p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              <Button type="button" variant="secondary" onClick={logout} style={{ flex: 1 }}>
                즉시 로그아웃
              </Button>
              <Button type="button" variant="primary" onClick={handleExtendSession} style={{ flex: 1 }}>
                로그인 연장
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
