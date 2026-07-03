import React, { useState, useMemo, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTasks } from '../contexts/TaskContext';
import { useAuth } from '../contexts/AuthContext';
import { TaskModal } from '../components/TaskModal';
import { collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Task, User } from '../types';

export const Dashboard: React.FC = () => {
  const location = useLocation();
  const { tasks, addTask, updateTask, loading } = useTasks();
  const [users, setUsers] = useState<User[]>([]);
  const { userProfile, currentUser } = useAuth();

  const isCommentNew = (lastCommentAt?: string): boolean => {
    if (!lastCommentAt) return false;
    try {
      const diff = Date.now() - new Date(lastCommentAt).getTime();
      return diff > 0 && diff < 24 * 60 * 60 * 1000;
    } catch {
      return false;
    }
  };

  // ── Trading Data States ──
  const [pis, setPis] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [tradingLoading, setTradingLoading] = useState(true);
  
  useEffect(() => {
    if (!currentUser) return;
    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usersData: User[] = [];
      snapshot.forEach(doc => {
        usersData.push({ id: doc.id, ...doc.data() } as User);
      });
      usersData.sort((a, b) => {
        const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dbTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return da - dbTime;
      });
      setUsers(usersData);
    });
    return () => unsubscribe();
  }, [currentUser]);

  // ── Trading Real-time Subscriptions ──
  useEffect(() => {
    if (!currentUser) return;
    const COMPANY_ID = "YSACC";

    const unsubPIs = onSnapshot(collection(doc(db, "companies", COMPANY_ID), "proforma_invoices"), (snapshot) => {
      const piData: any[] = [];
      snapshot.forEach(doc => {
        piData.push({ id: doc.id, ...doc.data() });
      });
      piData.sort((a, b) => ((b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      setPis(piData);
      setTradingLoading(false);
    }, (err) => {
      console.error("PI subscription error:", err);
      setTradingLoading(false);
    });

    const unsubOrders = onSnapshot(collection(doc(db, "companies", COMPANY_ID), "orders"), (snapshot) => {
      const orderData: any[] = [];
      snapshot.forEach(doc => {
        orderData.push({ id: doc.id, ...doc.data() });
      });
      setOrders(orderData);
    }, (err) => {
      console.error("Orders subscription error:", err);
    });

    return () => {
      unsubPIs();
      unsubOrders();
    };
  }, [currentUser]);

  // ── Calendar States & Subscription ──
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth()); // 0 ~ 11
  const [selectedDateForEvent, setSelectedDateForEvent] = useState<string | null>(null);
  const [selectedEventForView, setSelectedEventForView] = useState<any | null>(null);
  const [activeDateEventsList, setActiveDateEventsList] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [eventForm, setEventForm] = useState({
    title: '',
    type: '개인일정' as '개인일정' | '미팅' | '출장' | '기타',
    startDate: '',
    startTime: '09:00',
    endDate: '',
    endTime: '18:00',
    isPublic: true,
    participants: '',
    description: ''
  });

  useEffect(() => {
    if (!currentUser) return;
    const COMPANY_ID = "YSACC";

    const unsubEvents = onSnapshot(collection(doc(db, "companies", COMPANY_ID), "calendar_events"), (snapshot) => {
      const events: any[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.isPublic || data.creatorId === currentUser.uid) {
          events.push({ id: docSnap.id, ...data });
        }
      });
      setCalendarEvents(events);
    }, (err) => {
      console.error("Calendar events subscription error:", err);
    });

    return () => unsubEvents();
  }, [currentUser]);

  const handlePrevMonth = () => {
    setCurrentMonth(prev => {
      if (prev === 0) {
        setCurrentYear(y => y - 1);
        return 11;
      }
      return prev - 1;
    });
  };

  const handleNextMonth = () => {
    setCurrentMonth(prev => {
      if (prev === 11) {
        setCurrentYear(y => y + 1);
        return 0;
      }
      return prev + 1;
    });
  };

  const handleGoToToday = () => {
    const today = new Date();
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
  };

  const getEventBadgeColor = (type: string) => {
    switch (type) {
      case '개인일정': return { bg: '#eff6ff', text: '#1e40af', border: '#bfdbfe' };
      case '미팅': return { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0' };
      case '출장': return { bg: '#faf5ff', text: '#5b21b6', border: '#e9d5ff' };
      default: return { bg: '#fff7ed', text: '#9a3412', border: '#fed7aa' };
    }
  };

  const renderCalendarDays = () => {
    const startDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

    const dayCells: React.ReactNode[] = [];

    // 1. Previous month padding days
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const prevDay = daysInPrevMonth - i;
      const targetYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      const targetMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const dateStr = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(prevDay).padStart(2, '0')}`;
      dayCells.push(renderDayCell(prevDay, dateStr, false));
    }

    // 2. Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      dayCells.push(renderDayCell(day, dateStr, true));
    }

    // 3. Next month padding days
    const totalCellsSoFar = dayCells.length;
    const remainingCells = (totalCellsSoFar % 7 === 0) ? 0 : 7 - (totalCellsSoFar % 7);
    for (let i = 1; i <= remainingCells; i++) {
      const targetYear = currentMonth === 11 ? currentYear + 1 : currentYear;
      const targetMonth = currentMonth === 11 ? 0 : currentMonth + 1;
      const dateStr = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      dayCells.push(renderDayCell(i, dateStr, false));
    }

    return dayCells;
  };

  const renderDayCell = (dayNum: number, dateStr: string, isCurrentMonth: boolean) => {
    const isToday = new Date().toISOString().split('T')[0] === dateStr;
    const dayOfWeek = new Date(dateStr).getDay();

    const dayEvents = calendarEvents.filter(e => {
      const start = e.startDate;
      const end = e.endDate || start;
      return dateStr >= start && dateStr <= end;
    });

    return (
      <div
        key={dateStr}
        onClick={() => {
          setActiveDateEventsList(dateStr);
        }}
        style={{
          minHeight: '48px',
          background: dateStr === activeDateEventsList ? '#f0fdf4' : (isCurrentMonth ? '#fff' : '#f8fafc'),
          border: '1px solid #e2e8f0',
          borderRadius: '6px',
          padding: '4px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          transition: 'all 0.1s',
          boxShadow: dateStr === activeDateEventsList ? 'inset 0 0 0 2px #10b981' : (isToday ? 'inset 0 0 0 1.5px #3b82f6' : 'none')
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#94a3b8'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; }}
      >
        <span style={{
          fontSize: '11px',
          fontWeight: 800,
          color: isToday ? '#fff' : (!isCurrentMonth ? '#cbd5e1' : dayOfWeek === 0 ? '#ef4444' : dayOfWeek === 6 ? '#3b82f6' : '#475569'),
          background: isToday ? '#3b82f6' : 'transparent',
          borderRadius: isToday ? '50%' : 'none',
          width: isToday ? '18px' : 'auto',
          height: isToday ? '18px' : 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {dayNum}
        </span>

        {/* Dot indicators */}
        <div style={{ display: 'flex', gap: '2px', justifyContent: 'center', flexWrap: 'wrap', width: '100%', minHeight: '6px', marginBottom: '2px' }}>
          {dayEvents.slice(0, 4).map(e => {
            const colors = getEventBadgeColor(e.type);
            return (
              <span
                key={e.id}
                style={{
                  width: '5px',
                  height: '5px',
                  borderRadius: '50%',
                  background: colors.text,
                  display: 'inline-block'
                }}
                title={`${e.title} (${e.creatorName})`}
              />
            );
          })}
          {dayEvents.length > 4 && (
            <span style={{ fontSize: '7px', fontWeight: 900, color: '#64748b', lineHeight: 1 }}>+</span>
          )}
        </div>
      </div>
    );
  };

  const handleSaveEvent = async () => {
    if (!eventForm.title.trim()) {
      alert('일정 제목을 입력해주세요.');
      return;
    }
    if (!currentUser || !userProfile) return;

    const COMPANY_ID = "YSACC";
    const eventPayload = {
      title: eventForm.title,
      type: eventForm.type,
      startDate: eventForm.startDate,
      startTime: eventForm.startTime,
      endDate: eventForm.endDate,
      endTime: eventForm.endTime,
      isPublic: eventForm.isPublic,
      participants: eventForm.participants,
      description: eventForm.description,
      creatorId: currentUser.uid,
      creatorName: userProfile.name || currentUser.displayName || '이름없음',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      if (selectedEventForView) {
        const docRef = doc(db, 'companies', COMPANY_ID, 'calendar_events', selectedEventForView.id);
        await setDoc(docRef, {
          ...eventPayload,
          creatorId: selectedEventForView.creatorId,
          creatorName: selectedEventForView.creatorName
        }, { merge: true });
        alert('✅ 일정이 수정되었습니다.');
      } else {
        await addDoc(collection(doc(db, 'companies', COMPANY_ID), 'calendar_events'), eventPayload);
        alert('✅ 일정이 등록되었습니다.');
      }
      setSelectedDateForEvent(null);
      setSelectedEventForView(null);
    } catch (e: any) {
      console.error(e);
      alert('일정 저장 중 오류가 발생했습니다: ' + e.message);
    }
  };

  const handleDeleteEvent = async () => {
    if (!selectedEventForView) return;
    if (!window.confirm('이 일정을 정말 삭제하시겠습니까?')) return;
    const COMPANY_ID = "YSACC";
    try {
      await deleteDoc(doc(db, 'companies', COMPANY_ID, 'calendar_events', selectedEventForView.id));
      alert('🗑️ 일정이 삭제되었습니다.');
      setSelectedEventForView(null);
      setSelectedDateForEvent(null);
    } catch (e: any) {
      console.error(e);
      alert('일정 삭제 중 오류가 발생했습니다: ' + e.message);
    }
  };

  // ── 일간, 주간 및 기간 검색 기준 ──────────────────────────────────────────────
  const [dateMode, setDateMode] = useState<'daily' | 'weekly' | 'range'>('weekly');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [weekOffset, setWeekOffset] = useState(0);

  const getWeekRange = (offset: number) => {
    const now = new Date();
    const day = now.getDay(); // 0=일, 1=월 ...
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { start: monday, end: sunday };
  };

  const formatWeekLabel = (offset: number) => {
    const { start, end } = getWeekRange(offset);
    const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
    if (offset === 0) return `이번 주 (${fmt(start)}~${fmt(end)})`;
    if (offset === -1) return `지난 주 (${fmt(start)}~${fmt(end)})`;
    if (offset === 1) return `다음 주 (${fmt(start)}~${fmt(end)})`;
    return `${offset > 0 ? '+' : ''}${offset}주 (${fmt(start)}~${fmt(end)})`;
  };

  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const setRangePreset = (preset: 'today' | 'week' | 'month' | 'all') => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    if (preset === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'week') {
      const day = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      setStartDate(monday.toISOString().split('T')[0]);
      setEndDate(sunday.toISOString().split('T')[0]);
    } else if (preset === 'month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setStartDate(firstDay.toISOString().split('T')[0]);
      setEndDate(lastDay.toISOString().split('T')[0]);
    } else if (preset === 'all') {
      setStartDate('2020-01-01');
      setEndDate('2030-12-31');
    }
  };

  const [filter, setFilter] = useState('내 업무');
  const [quadrantFilter, setQuadrantFilter] = useState('ALL');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverBasketId, setDragOverBasketId] = useState<string | null>(null);
  const [delegatedQuickTitle, setDelegatedQuickTitle] = useState('');

  const unassignedTasks = useMemo(() => {
    return tasks.filter(t => t.status === 'TODO' && (!t.assigneeId || !users.some(u => u.id === t.assigneeId)));
  }, [tasks, users]);

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('taskId', taskId);
    setDraggingId(taskId);
  };
  const handleDragEnd = () => setDraggingId(null);
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).style.background = 'var(--primary-light, #eff6ff)';
  };
  const handleDragLeave = (e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.background = '';
  };

  const handleStatusDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    if (!taskId) return;
    try {
      await updateTask({ ...tasks.find(t => t.id === taskId)!, status: newStatus as any });
      // 자동 날짜 기록 (IN_PROGRESS → startDate, DONE → dueDate/completedAt)
      const today = new Date().toISOString().split('T')[0];
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;
      const extraUpdates: Record<string, any> = { status: newStatus, updatedAt: new Date().toISOString() };
      if (newStatus === 'IN_PROGRESS' && !task.startDate) {
        extraUpdates.startDate = today;
        extraUpdates.completedAt = null;
      }
      if (newStatus === 'DONE') {
        extraUpdates.dueDate = today;
        extraUpdates.completedAt = new Date().toISOString();
      }
      await updateDoc(doc(db, 'tasks', taskId), extraUpdates);
    } catch (err) {
      console.error(err);
    }
    setDraggingId(null);
  };

  const handleAssigneeDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).style.background = 'rgba(190, 18, 60, 0.08)';
    (e.currentTarget as HTMLElement).style.borderColor = '#be123c';
  };

  const handleAssigneeDragLeave = (e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.background = '';
    (e.currentTarget as HTMLElement).style.borderColor = '#cbd5e1';
  };

  const handleAssigneeDrop = async (e: React.DragEvent, assigneeId: string) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).style.background = '';
    (e.currentTarget as HTMLElement).style.borderColor = '#cbd5e1';
    const taskId = e.dataTransfer.getData('taskId');
    if (!taskId) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const targetUser = users.find(u => u.id === assigneeId);
    if (!targetUser) return;
    try {
      const { id, ...rest } = task;
      await updateDoc(doc(db, 'tasks', id), {
        ...rest,
        assigneeId: targetUser.id,
        assigneeName: targetUser.name,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Failed to assign task:", err);
    }
    setDraggingId(null);
  };

  const handleUnassignedDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    if (!taskId) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    try {
      const { id, ...rest } = task;
      await updateDoc(doc(db, 'tasks', id), {
        ...rest,
        assigneeId: '',
        assigneeName: '미배정',
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Failed to unassign task:", err);
    }
    setDraggingId(null);
  };

  const handleUnassignedQuickAdd = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && delegatedQuickTitle.trim()) {
      await addTask({
        title: delegatedQuickTitle,
        description: '',
        status: 'TODO',
        type: 'DAILY',
        scheduleType: 'SELF',
        importance: 'B',
        urgency: 5,
        quadrant: 'Q2',
        assigneeId: '',
        assigneeName: '미배정',
        createdAt: new Date().toISOString()
      } as any);
      setDelegatedQuickTitle('');
    }
  };




  const TaskChip: React.FC<{ task: Task }> = ({ task }) => {
    const quad = (task.quadrant || 'Q2').toUpperCase();
    const badgeStyles: Record<string, { color: string; bg: string; border: string }> = {
      Q1: { color: '#ef4444', bg: '#fef2f2', border: '1px solid rgba(239, 68, 68, 0.2)' },
      Q2: { color: '#3b82f6', bg: '#eff6ff', border: '1px solid rgba(59, 130, 246, 0.2)' },
      Q3: { color: '#f59e0b', bg: '#fffbeb', border: '1px solid rgba(245, 158, 11, 0.2)' },
      Q4: { color: '#94a3b8', bg: '#f8fafc', border: '1px solid rgba(148, 163, 184, 0.2)' }
    };
    const badgeStyle = badgeStyles[quad] || badgeStyles.Q2;

    return (
      <div
        draggable
        onDragStart={e => handleDragStart(e, task.id)}
        onDragEnd={handleDragEnd}
        onClick={() => setEditingTask(task)}
        style={{
          background: '#fff', border: '1px solid var(--border-color)', borderRadius: '6px',
          padding: '10px 12px', marginBottom: '8px', cursor: 'grab',
          opacity: draggingId === task.id ? 0.4 : 1, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          transition: 'box-shadow 0.15s',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, flex: 1, lineHeight: 1.4 }}>{task.title}</span>
          <span style={{
            fontSize: '0.68rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
            color: badgeStyle.color, background: badgeStyle.bg, border: badgeStyle.border, flexShrink: 0,
          }}>{quad}</span>
        </div>
        <div style={{ display: 'flex', gap: '5px', marginTop: '5px', flexWrap: 'wrap' }}>
          {task.projectName && <span style={{ fontSize: '0.7rem', background: '#f1f5f9', borderRadius: '3px', padding: '1px 5px', color: '#64748b' }}>{task.projectName}</span>}
          {task.dueDate && <span style={{ fontSize: '0.7rem', color: task.dueDate < new Date().toISOString().split('T')[0] ? '#ef4444' : '#64748b' }}>📅 {task.dueDate}</span>}
          {(task.commentCount ?? 0) > 0 && (
            <span 
              className={isCommentNew(task.lastCommentAt) ? 'blink-badge' : ''}
              style={{ fontSize: '0.68rem', background: '#fef3c7', color: '#d97706', padding: '1px 6px', borderRadius: '10px', display: 'inline-flex', alignItems: 'center', gap: '2px', fontWeight: '800' }}
            >
              💬 {task.commentCount}
            </span>
          )}
        </div>
      </div>
    );
  };



  const filteredTasks = useMemo(() => {
    let base = tasks || [];
    const path = location.pathname;
    
    if (path === '/projects') base = base.filter(t => t.type === 'PROJECT');
    if (path === '/daily') base = base.filter(t => t.type === 'DAILY' || (t.type as any) === 'ROUTINE');
    if (path === '/delegated') base = base.filter(t => t.type === 'DELEGATED');
    if (path === '/periodic') base = base.filter(t => t.type === 'PERIODIC');
    
    if (path.startsWith('/team/')) {
      const teamId = path.split('/').pop();
      if (teamId !== 'all') {
        base = base.filter(t => t.assigneeId === teamId);
      }
    }

    // ── 날짜 및 기간 필터링 ──────────────────────────────────────────────
    base = base.filter(task => {
      const isDone = task.status === 'DONE';
      
      if (isDone) {
        const compDate = (task.completedAt || task.createdAt || '').split('T')[0];
        if (!compDate) return false;

        if (dateMode === 'daily') {
          return compDate === selectedDate;
        } else if (dateMode === 'weekly') {
          const { start, end } = getWeekRange(weekOffset);
          const wStartStr = start.toISOString().split('T')[0];
          const wEndStr = end.toISOString().split('T')[0];
          return compDate >= wStartStr && compDate <= wEndStr;
        } else {
          return compDate >= startDate && compDate <= endDate;
        }
      } else {
        const tStart = task.startDate || task.createdAt?.split('T')[0] || '';
        const tDue = task.dueDate || '9999-12-31';

        if (dateMode === 'daily') {
          return tStart <= selectedDate && tDue >= selectedDate;
        } else if (dateMode === 'weekly') {
          const { start, end } = getWeekRange(weekOffset);
          const wStartStr = start.toISOString().split('T')[0];
          const wEndStr = end.toISOString().split('T')[0];
          return tStart <= wEndStr && tDue >= wStartStr;
        } else {
          return tStart <= endDate && tDue >= startDate;
        }
      }
    });

    let result = base.filter(t => {
      if (filter === '전체') return true;
      if (filter === '내 업무') return t.assigneeId === userProfile?.id || t.assigneeName === userProfile?.name;
      
      const targetUser = users.find(u => u.id === filter);
      if (targetUser) {
        return t.assigneeId === targetUser.id || t.assigneeName === targetUser.name;
      }
      return true;
    });

    if (quadrantFilter !== 'ALL') {
      result = result.filter(t => t.quadrant === quadrantFilter);
    }

    const quadOrder: Record<string, number> = { Q1: 1, Q2: 2, Q3: 3, Q4: 4 };
    result.sort((a, b) => {
      const qA = (a.quadrant || 'Q2').toUpperCase();
      const qB = (b.quadrant || 'Q2').toUpperCase();
      const orderA = quadOrder[qA] || 5;
      const orderB = quadOrder[qB] || 5;
      return orderA - orderB;
    });

    return result;
  }, [tasks, location.pathname, filter, quadrantFilter, userProfile, users, dateMode, selectedDate, startDate, endDate, weekOffset]);

  const activeUser = useMemo(() => {
    if (filter === '내 업무') return userProfile;
    if (filter === '전체') return null;
    return users.find(u => u.id === filter) || null;
  }, [filter, users, userProfile]);

  const activeUserStats = useMemo(() => {
    const uTasks = tasks.filter(t => {
      if (filter === '전체') return true;
      if (filter === '내 업무') return t.assigneeId === userProfile?.id || t.assigneeName === userProfile?.name;
      const targetUser = users.find(u => u.id === filter);
      if (targetUser) return t.assigneeId === targetUser.id || t.assigneeName === targetUser.name;
      return false;
    });

    return {
      todo: uTasks.filter(t => t.status === 'TODO').length,
      doing: uTasks.filter(t => t.status === 'IN_PROGRESS').length,
      done: uTasks.filter(t => t.status === 'DONE').length,
      holding: uTasks.filter(t => t.status === 'HOLDING').length,
      total: uTasks.length
    };
  }, [tasks, filter, users, userProfile]);



  const baskets = [
    {
      id: 'TODO',
      title: '업무대기 BASKET',
      headerBg: '#eff6ff',
      headerText: '#1e40af',
      headerBorder: 'rgba(30, 64, 175, 0.2)',
      countBg: '#1e40af',
      countText: '#ffffff',
      columnBg: '#f0f7ff'
    },
    {
      id: 'IN_PROGRESS',
      title: '업무중 BASKET',
      headerBg: '#f0fdf4',
      headerText: '#166534',
      headerBorder: 'rgba(22, 101, 52, 0.2)',
      countBg: '#166534',
      countText: '#ffffff',
      columnBg: '#f4fcf7'
    },
    {
      id: 'DONE',
      title: '완료 BASKET',
      headerBg: '#f1f5f9',
      headerText: '#334155',
      headerBorder: 'rgba(51, 65, 85, 0.2)',
      countBg: '#334155',
      countText: '#ffffff',
      columnBg: '#f8fafc'
    },
    {
      id: 'HOLDING',
      title: '보류 BASKET',
      headerBg: '#fffbeb',
      headerText: '#b45309',
      headerBorder: 'rgba(180, 83, 9, 0.2)',
      countBg: '#b45309',
      countText: '#ffffff',
      columnBg: '#fffdf4'
    }
  ];

  const handleQuickAdd = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && quickTaskTitle.trim()) {
      await addTask({
        title: quickTaskTitle,
        status: 'TODO',
        type: 'DAILY',
        scheduleType: 'SELF',
        importance: 'B',
        urgency: 5,
        quadrant: 'Q2',
        assigneeId: userProfile?.id || '',
        assigneeName: userProfile?.name || '관리자',
        startDate: selectedDate || new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString()
      } as any);
      setQuickTaskTitle('');
    }
  };

  // ── Trading Metrics Calculations ──
  const tradingKPIs = useMemo(() => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // 1. 이번달 PI 건수 (piDate 기준)
    let piYsCount = 0;
    let piYsaccCount = 0;

    pis.forEach(p => {
      if ((p.piDate || "").startsWith(thisMonth)) {
        if (p.issuingCompany === 'YS') piYsCount++;
        else piYsaccCount++;
      }
    });

    // 2. 수주 금액 (발주일 poDate 기준) & 3. 매출 금액 (ETD 기준)
    let orderYsAmount = 0;
    let orderYsaccAmount = 0;
    let orderYsCount = 0;
    let orderYsaccCount = 0;

    let salesYsAmount = 0;
    let salesYsaccAmount = 0;
    let salesYsCount = 0;
    let salesYsaccCount = 0;

    orders.forEach(o => {
      const pi = pis.find(p => p.id === o.quotationId);
      const amount = pi?.totalUsd || o.totalAmount || 0;
      const isYs = o.issuingCompany === 'YS';

      if ((o.poDate || "").startsWith(thisMonth)) {
        if (isYs) {
          orderYsAmount += amount;
          orderYsCount++;
        } else {
          orderYsaccAmount += amount;
          orderYsaccCount++;
        }
      }

      if ((o.etd || "").startsWith(thisMonth)) {
        if (isYs) {
          salesYsAmount += amount;
          salesYsCount++;
        } else {
          salesYsaccAmount += amount;
          salesYsaccCount++;
        }
      }
    });

    return {
      piYsCount, piYsaccCount,
      orderYsAmount, orderYsaccAmount, orderYsCount, orderYsaccCount,
      salesYsAmount, salesYsaccAmount, salesYsCount, salesYsaccCount
    };
  }, [pis, orders]);

  if (loading) return <div className="content-area" style={{ alignItems: 'center', justifyContent: 'center' }}>데이터를 불러오는 중...</div>;

  return (
    <div style={{ padding: '24px 30px' }}>
      <div className="top-section" style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '-0.025em' }}>
          <span>📊 무역 실시간 매출 및 PI 현황</span>
          <span style={{ fontSize: '0.7rem', background: 'var(--primary-color)', color: '#fff', padding: '2px 8px', borderRadius: '20px', fontWeight: 700 }}>통합 대시보드</span>
        </h1>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>YSACC CO., LTD. 실시간 Proforma Invoice 통계 및 매출 지표</p>
      </div>

      {tradingLoading ? (
        <div style={{ padding: '20px', background: '#fff', border: '1px solid var(--border-color)', borderRadius: '10px', marginBottom: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>무역 통계 데이터를 실시간 연결 중...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px', alignItems: 'stretch' }}>
          
          {/* ── 왼쪽 (50%): 달력 및 일정 목록 ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* ── 회사 및 개인 일정 캘린더 ── */}
            <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px 18px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b' }}>
                  📅 YSACC 스케줄러
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button
                    onClick={handlePrevMonth}
                    style={{ padding: '3px 6px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '10px', cursor: 'pointer', fontWeight: 700 }}
                  >
                    ◀
                  </button>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a', minWidth: '65px', textAlign: 'center' }}>
                    {currentYear}년 {currentMonth + 1}월
                  </span>
                  <button
                    onClick={handleNextMonth}
                    style={{ padding: '3px 6px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '10px', cursor: 'pointer', fontWeight: 700 }}
                  >
                    ▶
                  </button>
                  <button
                    onClick={handleGoToToday}
                    style={{ padding: '3px 6px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '10px', cursor: 'pointer', fontWeight: 700 }}
                  >
                    오늘
                  </button>
                </div>
              </div>

              {/* 요일 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', textAlign: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px', marginBottom: '6px' }}>
                {['일', '월', '화', '수', '목', '금', '토'].map((day, idx) => (
                  <span key={day} style={{ fontSize: '10.5px', fontWeight: 800, color: idx === 0 ? '#ef4444' : idx === 6 ? '#3b82f6' : '#64748b' }}>
                    {day}
                  </span>
                ))}
              </div>

              {/* 그리드 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: 'minmax(45px, auto)', gap: '2px', flex: 1 }}>
                {renderCalendarDays()}
              </div>
            </div>

            {/* ── 대시보드 등록 일정 목록 (Event List Panel) ── */}
            <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px 18px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  📋 <span>{activeDateEventsList} 일정 목록</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDateForEvent(activeDateEventsList);
                    setEventForm({
                      title: '',
                      type: '개인일정',
                      startDate: activeDateEventsList,
                      startTime: '09:00',
                      endDate: activeDateEventsList,
                      endTime: '18:00',
                      isPublic: true,
                      participants: '',
                      description: ''
                    });
                  }}
                  style={{ padding: '4px 10px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: 700 }}
                >
                  ＋ 새 일정 등록
                </button>
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '200px', paddingRight: '4px' }}>
                {calendarEvents.filter(e => activeDateEventsList >= e.startDate && activeDateEventsList <= (e.endDate || e.startDate)).length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '12px', padding: '30px 0', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #e2e8f0' }}>
                    이 날짜에 등록된 일정이 없습니다.
                  </div>
                ) : (
                  calendarEvents.filter(e => activeDateEventsList >= e.startDate && activeDateEventsList <= (e.endDate || e.startDate)).map(e => {
                    const colors = getEventBadgeColor(e.type);
                    return (
                      <div
                        key={e.id}
                        onClick={() => {
                          setSelectedEventForView(e);
                          setEventForm({
                            title: e.title,
                            type: e.type,
                            startDate: e.startDate,
                            startTime: e.startTime || '09:00',
                            endDate: e.endDate || e.startDate,
                            endTime: e.endTime || '18:00',
                            isPublic: e.isPublic !== undefined ? e.isPublic : true,
                            participants: e.participants || '',
                            description: e.description || ''
                          });
                        }}
                        style={{
                          padding: '10px 12px',
                          background: colors.bg,
                          color: colors.text,
                          border: `1px solid ${colors.border}`,
                          borderRadius: '8px',
                          fontSize: '12.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '3px',
                          transition: 'all 0.1s'
                        }}
                        onMouseEnter={ev => { ev.currentTarget.style.transform = 'translateY(-1px)'; ev.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.03)'; }}
                        onMouseLeave={ev => { ev.currentTarget.style.transform = 'none'; ev.currentTarget.style.boxShadow = 'none'; }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#0f172a' }}>
                            {!e.isPublic && <span>🔒</span>}
                            <strong>{e.title}</strong>
                          </span>
                          <span style={{ fontSize: '10.5px', background: '#fff', padding: '1px 5px', borderRadius: '4px', border: `1px solid ${colors.border}`, color: '#64748b' }}>
                            {e.type}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', gap: '10px', marginTop: '1px' }}>
                          <span>⏱ {e.startTime || '09:00'} ~ {e.endTime || '18:00'}</span>
                          <span>👤 등록자: {e.creatorName}</span>
                          {e.participants && <span>👥 참석자: {e.participants}</span>}
                        </div>
                        {e.description && (
                          <div style={{ fontSize: '11px', color: '#475569', borderTop: '1px dashed rgba(0,0,0,0.06)', paddingTop: '4px', marginTop: '4px', whiteSpace: 'pre-wrap', fontWeight: 'normal' }}>
                            {e.description}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </div>

          {/* ── 오른쪽 (50%): 무역실시간매출및PI현황 ── */}
          <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 8px 0' }}>
              <span>📊 무역 실시간 매출 및 PI 현황</span>
              <span style={{ fontSize: '0.7rem', background: 'var(--primary-color)', color: '#fff', padding: '2px 8px', borderRadius: '20px', fontWeight: 700 }}>통합 대시보드</span>
            </h2>

            {/* 1. 이번달 PI 건수 */}
            <div style={{ background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
                <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#3b82f6' }} />
                이번달 PI 건수
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13.5px', fontWeight: 800 }}>
                <span style={{ color: 'var(--text-primary)' }}>영성ACC: <span style={{ color: '#3b82f6', fontWeight: 900 }}>{tradingKPIs.piYsCount}</span>건</span>
                <span style={{ color: '#cbd5e1' }}>|</span>
                <span style={{ color: 'var(--text-primary)' }}>(주)YSACC: <span style={{ color: '#3b82f6', fontWeight: 900 }}>{tradingKPIs.piYsaccCount}</span>건</span>
              </div>
            </div>

            {/* 2. 수주 금액 (발주일 기준) */}
            <div style={{ background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
                <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
                수주 금액
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px', fontWeight: 800 }}>
                <span style={{ color: 'var(--text-primary)' }}>영성ACC: <span style={{ color: '#10b981', fontWeight: 900 }}>${tradingKPIs.orderYsAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span> <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'normal' }}>({tradingKPIs.orderYsCount}건)</span></span>
                <span style={{ color: '#cbd5e1' }}>|</span>
                <span style={{ color: 'var(--text-primary)' }}>(주)YSACC: <span style={{ color: '#10b981', fontWeight: 900 }}>${tradingKPIs.orderYsaccAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span> <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'normal' }}>({tradingKPIs.orderYsaccCount}건)</span></span>
              </div>
            </div>

            {/* 3. 매출금액 (ETD기준) */}
            <div style={{ background: '#f8fafc', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
                <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b' }} />
                매출금액
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px', fontWeight: 800 }}>
                <span style={{ color: 'var(--text-primary)' }}>영성ACC: <span style={{ color: '#f59e0b', fontWeight: 900 }}>${tradingKPIs.salesYsAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span> <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'normal' }}>({tradingKPIs.salesYsCount}건)</span></span>
                <span style={{ color: '#cbd5e1' }}>|</span>
                <span style={{ color: 'var(--text-primary)' }}>(주)YSACC: <span style={{ color: '#f59e0b', fontWeight: 900 }}>${tradingKPIs.salesYsaccAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span> <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'normal' }}>({tradingKPIs.salesYsaccCount}건)</span></span>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* 일정 등록 모달 */}
      {selectedDateForEvent && (
        <div
          onClick={() => setSelectedDateForEvent(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '480px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ padding: '16px 20px', background: '#3b82f6', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '15px', fontWeight: 800 }}>📅 일정 등록 ({selectedDateForEvent})</span>
              <button
                onClick={() => setSelectedDateForEvent(null)}
                style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer', fontWeight: 700 }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>일정 제목 ★</label>
                <input
                  type="text"
                  placeholder="일정 제목을 입력하세요"
                  value={eventForm.title}
                  onChange={e => setEventForm(prev => ({ ...prev, title: e.target.value }))}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13.5px', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>일정 구분</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {['개인일정', '미팅', '출장', '기타'].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setEventForm(prev => ({ ...prev, type: t as any }))}
                      style={{
                        flex: 1,
                        padding: '6px 0',
                        borderRadius: '6px',
                        border: eventForm.type === t ? '2px solid #3b82f6' : '1px solid #cbd5e1',
                        background: eventForm.type === t ? '#eff6ff' : '#fff',
                        color: eventForm.type === t ? '#1e40af' : '#475569',
                        fontWeight: 700,
                        fontSize: '12.5px',
                        cursor: 'pointer'
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>시작일</label>
                  <input
                    type="date"
                    value={eventForm.startDate}
                    onChange={e => setEventForm(prev => ({ ...prev, startDate: e.target.value }))}
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>시작시간</label>
                  <input
                    type="time"
                    value={eventForm.startTime}
                    onChange={e => setEventForm(prev => ({ ...prev, startTime: e.target.value }))}
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>종료일</label>
                  <input
                    type="date"
                    value={eventForm.endDate}
                    onChange={e => setEventForm(prev => ({ ...prev, endDate: e.target.value }))}
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>종료시간</label>
                  <input
                    type="time"
                    value={eventForm.endTime}
                    onChange={e => setEventForm(prev => ({ ...prev, endTime: e.target.value }))}
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                <input
                  type="checkbox"
                  id="isPublic"
                  checked={eventForm.isPublic}
                  onChange={e => setEventForm(prev => ({ ...prev, isPublic: e.target.checked }))}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="isPublic" style={{ fontSize: '13px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}>
                  📢 부서/회사 전체에 공유 (체크 시 모든 멤버에게 보임)
                </label>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>참석자/미팅 대상</label>
                <input
                  type="text"
                  placeholder="참석 멤버 또는 바이어 명"
                  value={eventForm.participants}
                  onChange={e => setEventForm(prev => ({ ...prev, participants: e.target.value }))}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>상세 내용/메모</label>
                <textarea
                  rows={3}
                  placeholder="상세한 일정을 기록하세요"
                  value={eventForm.description}
                  onChange={e => setEventForm(prev => ({ ...prev, description: e.target.value }))}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13.5px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>
            </div>

            <div style={{ padding: '16px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setSelectedDateForEvent(null)}
                style={{ padding: '8px 16px', background: '#e2e8f0', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 700 }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveEvent}
                style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 700 }}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 일정 상세 및 수정 모달 */}
      {selectedEventForView && (
        <div
          onClick={() => setSelectedEventForView(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '480px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ padding: '16px 20px', background: '#0f172a', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '15px', fontWeight: 800 }}>📅 일정 상세 및 편집</span>
              <button
                onClick={() => setSelectedEventForView(null)}
                style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer', fontWeight: 700 }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#64748b' }}>
                <span>등록자: <strong>{selectedEventForView.creatorName}</strong></span>
                <span>{selectedEventForView.isPublic ? '📢 회사 공유 일정' : '🔒 개인 일정'}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>일정 제목 ★</label>
                <input
                  type="text"
                  value={eventForm.title}
                  onChange={e => setEventForm(prev => ({ ...prev, title: e.target.value }))}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13.5px', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>일정 구분</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {['개인일정', '미팅', '출장', '기타'].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setEventForm(prev => ({ ...prev, type: t as any }))}
                      style={{
                        flex: 1,
                        padding: '6px 0',
                        borderRadius: '6px',
                        border: eventForm.type === t ? '2px solid #3b82f6' : '1px solid #cbd5e1',
                        background: eventForm.type === t ? '#eff6ff' : '#fff',
                        color: eventForm.type === t ? '#1e40af' : '#475569',
                        fontWeight: 700,
                        fontSize: '12.5px',
                        cursor: 'pointer'
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>시작일</label>
                  <input
                    type="date"
                    value={eventForm.startDate}
                    onChange={e => setEventForm(prev => ({ ...prev, startDate: e.target.value }))}
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>시작시간</label>
                  <input
                    type="time"
                    value={eventForm.startTime}
                    onChange={e => setEventForm(prev => ({ ...prev, startTime: e.target.value }))}
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>종료일</label>
                  <input
                    type="date"
                    value={eventForm.endDate}
                    onChange={e => setEventForm(prev => ({ ...prev, endDate: e.target.value }))}
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>종료시간</label>
                  <input
                    type="time"
                    value={eventForm.endTime}
                    onChange={e => setEventForm(prev => ({ ...prev, endTime: e.target.value }))}
                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                <input
                  type="checkbox"
                  id="isPublicEdit"
                  checked={eventForm.isPublic}
                  onChange={e => setEventForm(prev => ({ ...prev, isPublic: e.target.checked }))}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="isPublicEdit" style={{ fontSize: '13px', fontWeight: 700, color: '#475569', cursor: 'pointer' }}>
                  📢 부서/회사 전체에 공유 (체크 시 모든 멤버에게 보임)
                </label>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>참석자/미팅 대상</label>
                <input
                  type="text"
                  value={eventForm.participants}
                  onChange={e => setEventForm(prev => ({ ...prev, participants: e.target.value }))}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>상세 내용/메모</label>
                <textarea
                  rows={3}
                  value={eventForm.description}
                  onChange={e => setEventForm(prev => ({ ...prev, description: e.target.value }))}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13.5px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>
            </div>

            <div style={{ padding: '16px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
              <div>
                {(selectedEventForView.creatorId === currentUser?.uid || userProfile?.role === 'admin') && (
                  <button
                    type="button"
                    onClick={handleDeleteEvent}
                    style={{ padding: '8px 16px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 700 }}
                  >
                    일정 삭제
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedEventForView(null)}
                  style={{ padding: '8px 16px', background: '#e2e8f0', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 700 }}
                >
                  닫기
                </button>
                {(selectedEventForView.creatorId === currentUser?.uid || userProfile?.role === 'admin') && (
                  <button
                    type="button"
                    onClick={handleSaveEvent}
                    style={{ padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 700 }}
                  >
                    수정 완료
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '32px 0 24px 0' }} />

      {/* Date Navigation & Kanban Header */}
      <div className="top-section" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: '800', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📋 오늘 해야 할 일을 바로 시작하는 화면</span>
            <span style={{ fontSize: '0.7rem', background: '#3b82f6', color: '#fff', padding: '2px 8px', borderRadius: '20px', fontWeight: 700 }}>실시간 칸반</span>
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>업무는 상태 바스켓, 프랭클린 중요도 기준으로 관리됩니다.</p>
        </div>

        {/* Date Mode Taps & Date Navigator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* ── 조회 모드 탭 ── */}
          <div style={{ display: 'flex', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
            <button
              onClick={() => setDateMode('daily')}
              style={{
                padding: '6px 12px',
                border: 'none',
                background: dateMode === 'daily' ? '#3b82f6' : '#fff',
                color: dateMode === 'daily' ? '#fff' : '#475569',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '12px',
                transition: 'all 0.15s'
              }}
            >
              일간
            </button>
            <button
              onClick={() => setDateMode('weekly')}
              style={{
                padding: '6px 12px',
                border: 'none',
                background: dateMode === 'weekly' ? '#3b82f6' : '#fff',
                color: dateMode === 'weekly' ? '#fff' : '#475569',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '12px',
                transition: 'all 0.15s',
                borderLeft: '1px solid #cbd5e1'
              }}
            >
              주간
            </button>
            <button
              onClick={() => setDateMode('range')}
              style={{
                padding: '6px 12px',
                border: 'none',
                background: dateMode === 'range' ? '#3b82f6' : '#fff',
                color: dateMode === 'range' ? '#fff' : '#475569',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '12px',
                transition: 'all 0.15s',
                borderLeft: '1px solid #cbd5e1'
              }}
            >
              기간 검색
            </button>
          </div>

          {/* ── 상세 날짜 선택 영역 ── */}
          {dateMode === 'daily' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
              <button onClick={handlePrevDay} style={{ padding: '6px 12px', border: 'none', background: '#f8fafc', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#374151', borderRight: '1px solid #e2e8f0' }}>‹</button>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                style={{
                  padding: '4px 10px',
                  border: 'none',
                  outline: 'none',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#1e293b',
                  cursor: 'pointer',
                  background: '#fff'
                }}
              />
              <button onClick={handleNextDay} style={{ padding: '6px 12px', border: 'none', background: '#f8fafc', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#374151', borderLeft: '1px solid #e2e8f0' }}>›</button>
              {selectedDate !== new Date().toISOString().split('T')[0] && (
                <button
                  onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                  style={{
                    padding: '6px 12px',
                    border: 'none',
                    borderLeft: '1px solid #e2e8f0',
                    background: '#f0fdf4',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#16a34a'
                  }}
                >
                  오늘
                </button>
              )}
            </div>
          )}

          {dateMode === 'weekly' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
              <button onClick={() => setWeekOffset(w => w - 1)} style={{ padding: '6px 12px', border: 'none', background: '#f8fafc', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#374151' }}>‹</button>
              <div style={{ padding: '6px 14px', background: weekOffset === 0 ? '#eff6ff' : '#f8fafc', color: weekOffset === 0 ? '#2563eb' : '#374151', fontWeight: 700, fontSize: '13px', borderLeft: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1', whiteSpace: 'nowrap' }}>
                📅 {formatWeekLabel(weekOffset)}
              </div>
              <button onClick={() => setWeekOffset(w => w + 1)} style={{ padding: '6px 12px', border: 'none', background: '#f8fafc', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#374151' }}>›</button>
              {weekOffset !== 0 && (
                <button onClick={() => setWeekOffset(0)} style={{ padding: '6px 10px', border: 'none', borderLeft: '1px solid #cbd5e1', background: '#fff7ed', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: '#ea580c' }}>이번주</button>
              )}
            </div>
          )}

          {dateMode === 'range' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    border: 'none',
                    outline: 'none',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#1e293b',
                    cursor: 'pointer'
                  }}
                />
                <span style={{ padding: '0 8px', color: '#94a3b8', fontSize: '12px', fontWeight: 700, background: '#f8fafc', borderLeft: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1', height: '30px', display: 'flex', alignItems: 'center' }}>~</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    border: 'none',
                    outline: 'none',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#1e293b',
                    cursor: 'pointer'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button onClick={() => setRangePreset('today')} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: '#475569' }}>오늘</button>
                <button onClick={() => setRangePreset('week')} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: '#475569' }}>이번주</button>
                <button onClick={() => setRangePreset('month')} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: '#475569' }}>이번달</button>
                <button onClick={() => setRangePreset('all')} style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: '#475569' }}>전체</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Kanban Container: Sidebar on left + Board on right */}
      <div className="kanban-main-layout" style={{ display: 'flex', gap: '20px', alignItems: 'stretch' }}>
        
        {/* Left Side Panel (담당자별 배당 현황 & 미배당 업무) */}
        <div className="kanban-left-panel" style={{ width: '280px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '16px', borderRight: '1px solid #e2e8f0', paddingRight: '20px' }}>
          <div>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#475569', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>담당자별 배당 현황</h3>
            <div style={{ fontSize: '0.78rem', background: '#fef9c3', border: '1px solid #fef08a', color: '#854d0e', padding: '6px 10px', borderRadius: '6px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
              <span>📂</span> 미배당 업무 <span style={{ color: '#ca8a04', fontWeight: 800 }}>{unassignedTasks.length}건</span>
            </div>
            
            {/* Assignee list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {/* 내 업무 */}
              <div
                onClick={() => setFilter('내 업무')}
                onDragOver={handleAssigneeDragOver}
                onDragLeave={handleAssigneeDragLeave}
                onDrop={e => userProfile && handleAssigneeDrop(e, userProfile.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: filter === '내 업무' ? 'rgba(190, 18, 60, 0.08)' : '#fff',
                  border: filter === '내 업무' ? '1px solid #be123c' : '1px solid #cbd5e1',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                  <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'linear-gradient(135deg,#be123c,#9f1239)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                    {userProfile?.name?.charAt(0) || '나'}
                  </div>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {userProfile?.name} (본인)
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                      총 {tasks.filter(t => t.assigneeId === userProfile?.id || t.assigneeName === userProfile?.name).length}건
                    </div>
                  </div>
                </div>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
              </div>

              {/* Other assignees */}
              {users.filter(u => u.id !== userProfile?.id).map(u => {
                const isSelected = filter === u.id;
                const mTasks = tasks.filter(t => t.assigneeId === u.id || t.assigneeName === u.name);
                return (
                  <div
                    key={u.id}
                    onClick={() => setFilter(u.id)}
                    onDragOver={handleAssigneeDragOver}
                    onDragLeave={handleAssigneeDragLeave}
                    onDrop={e => handleAssigneeDrop(e, u.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: isSelected ? 'rgba(190, 18, 60, 0.08)' : '#fff',
                      border: isSelected ? '1px solid #be123c' : '1px solid #cbd5e1',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                      <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'linear-gradient(135deg, #0d9488, #0891b2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                        {u.name?.charAt(0)}
                      </div>
                      <div style={{ overflow: 'hidden' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {u.name} ({u.department || '담당자'})
                        </div>
                        <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                          총 {mTasks.length}건
                        </div>
                      </div>
                    </div>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#94a3b8' }} />
                  </div>
                );
              })}

              {/* 전체 보기 */}
              <div
                onClick={() => setFilter('전체')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: filter === '전체' ? 'rgba(190, 18, 60, 0.08)' : '#fff',
                  border: filter === '전체' ? '1px solid #be123c' : '1px solid #cbd5e1',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: filter === '전체' ? '#be123c' : '#475569',
                  transition: 'all 0.2s'
                }}
              >
                전체 담당자 보기
              </div>
            </div>
            
            {/* 담당자 추가 */}
            <a href="/team-management" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none', color: '#64748b', marginTop: '10px', fontWeight: 600 }}>
              ✉ 담당자 추가
            </a>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '4px 0' }} />

          {/* Unassigned Tasks Section */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '300px' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#475569', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>✉</span> 미배당 — 드래그하여 배정
            </div>
            
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleUnassignedDrop}
              style={{
                flex: 1,
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                background: '#fff',
                padding: '10px',
                overflowY: 'auto',
                minHeight: '180px',
                maxHeight: '400px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}
            >
              {unassignedTasks.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed #e2e8f0', borderRadius: '6px', color: '#94a3b8', fontSize: '0.72rem', textAlign: 'center', padding: '10px' }}>
                  미배당 업무가 없습니다.<br/>여기에 카드를 놓아 배정을 취소할 수 있습니다.
                </div>
              ) : (
                unassignedTasks.map(t => <TaskChip key={t.id} task={t} />)
              )}
            </div>

            {/* Quick add unassigned task input */}
            <div style={{ marginTop: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '6px', padding: '6px 10px' }}>
                <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>＋</span>
                <input
                  value={delegatedQuickTitle}
                  onChange={e => setDelegatedQuickTitle(e.target.value)}
                  onKeyDown={handleUnassignedQuickAdd}
                  placeholder="업무 직접 입력 후 Enter"
                  style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: '0.75rem', color: 'var(--text-primary)' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Main Area (Selected Assignee profile + Info banner + 4 Baskets) */}
        <div className="kanban-right-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0, width: '100%' }}>
          
          {/* Active Assignee Info Header & Filters */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '12px 16px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg,#be123c,#9f1239)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', fontWeight: 800, color: '#fff' }}>
                {activeUser?.name?.slice(0, 2) || '전체'}
              </div>
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1e293b' }}>
                  {activeUser ? activeUser.name : '전체 담당자'}
                  <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 500, marginLeft: '6px' }}>
                    {activeUser ? (activeUser.department || activeUser.role || '담당자') : '통합 업무 조회'}
                  </span>
                </h3>
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                  대기 <span style={{ color: '#3b82f6', fontWeight: 700 }}>{activeUserStats.todo}</span> · 진행 <span style={{ color: '#166534', fontWeight: 700 }}>{activeUserStats.doing}</span> · 완료 <span style={{ color: '#475569', fontWeight: 700 }}>{activeUserStats.done}</span> · 보류 <span style={{ color: '#b45309', fontWeight: 700 }}>{activeUserStats.holding}</span> (총 {activeUserStats.total}건)
                </div>
              </div>
            </div>

            {/* Quadrant Filters */}
            <div style={{ display: 'flex', gap: '4px' }}>
              <button onClick={() => setQuadrantFilter('ALL')} style={{ padding: '4px 10px', border: '1px solid #cbd5e1', borderRadius: '20px', fontSize: '0.72rem', background: quadrantFilter === 'ALL' ? '#3b82f6' : 'white', color: quadrantFilter === 'ALL' ? 'white' : '#4b5563', cursor: 'pointer', fontWeight: 700 }}>전체</button>
              <button onClick={() => setQuadrantFilter('Q1')} style={{ padding: '4px 10px', border: '1px solid #fee2e2', borderRadius: '20px', fontSize: '0.72rem', background: quadrantFilter === 'Q1' ? '#ef4444' : 'white', color: quadrantFilter === 'Q1' ? 'white' : '#ef4444', cursor: 'pointer', fontWeight: 700 }}>Q1 긴급·중요</button>
              <button onClick={() => setQuadrantFilter('Q2')} style={{ padding: '4px 10px', border: '1px solid #dbeafe', borderRadius: '20px', fontSize: '0.72rem', background: quadrantFilter === 'Q2' ? '#3b82f6' : 'white', color: quadrantFilter === 'Q2' ? 'white' : '#2563eb', cursor: 'pointer', fontWeight: 700 }}>Q2 중요</button>
              <button onClick={() => setQuadrantFilter('Q3')} style={{ padding: '4px 10px', border: '1px solid #fef3c7', borderRadius: '20px', fontSize: '0.72rem', background: quadrantFilter === 'Q3' ? '#f59e0b' : 'white', color: quadrantFilter === 'Q3' ? 'white' : '#d97706', cursor: 'pointer', fontWeight: 700 }}>Q3</button>
              <button onClick={() => setQuadrantFilter('Q4')} style={{ padding: '4px 10px', border: '1px solid #f1f5f9', borderRadius: '20px', fontSize: '0.72rem', background: quadrantFilter === 'Q4' ? '#94a3b8' : 'white', color: quadrantFilter === 'Q4' ? 'white' : '#475569', cursor: 'pointer', fontWeight: 700 }}>Q4</button>
            </div>
          </div>

          {/* Unassigned Warning Info Bar */}
          {unassignedTasks.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fffbeb', border: '1px solid #fef08a', color: '#854d0e', padding: '10px 14px', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600 }}>
              <span>✉</span>
              <span>처리 대기 중인 위임 업무가 <strong style={{ color: '#ca8a04' }}>{unassignedTasks.length}건</strong> 있습니다. 왼쪽 패널에서 담당자에게 드래그하여 배정하세요.</span>
            </div>
          )}

          {/* 4 Baskets Kanban Board */}
          <div className="board-container kanban-board-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', alignItems: 'start' }}>
            {baskets.map(basket => (
              <div
                key={basket.id}
                className="board-column"
                onDragOver={e => {
                  e.preventDefault();
                  setDragOverBasketId(basket.id);
                }}
                onDragLeave={() => setDragOverBasketId(null)}
                onDrop={e => {
                  handleStatusDrop(e, basket.id);
                  setDragOverBasketId(null);
                }}
                style={{
                  background: dragOverBasketId === basket.id ? 'var(--primary-light, #eff6ff)' : basket.columnBg,
                  border: `2px solid ${basket.countBg}40`,
                  borderRadius: '12px',
                  padding: '10px',
                  minHeight: '400px',
                  transition: 'all 0.15s',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)'
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  background: basket.headerBg,
                  border: `1px solid ${basket.headerBorder}`
                }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 800, color: basket.headerText }}>
                    {basket.title}
                  </div>
                  <div style={{
                    background: basket.countBg,
                    color: basket.countText,
                    borderRadius: '50%',
                    width: '20px',
                    height: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.7rem',
                    fontWeight: 800
                  }}>
                    {filteredTasks.filter(t => {
                      const s = t.status?.toUpperCase();
                      if (basket.id === 'TODO') return s === 'TODO' || s === '대기';
                      if (basket.id === 'IN_PROGRESS') return s === 'IN_PROGRESS' || s === '진행중';
                      if (basket.id === 'DONE') return s === 'DONE' || s === '완료';
                      return s === 'HOLDING' || s === '보류';
                    }).length}
                  </div>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto', paddingRight: '2px' }}>
                    {filteredTasks.filter(t => {
                      const s = t.status?.toUpperCase();
                      if (basket.id === 'TODO') return s === 'TODO' || s === '대기';
                      if (basket.id === 'IN_PROGRESS') return s === 'IN_PROGRESS' || s === '진행중';
                      if (basket.id === 'DONE') return s === 'DONE' || s === '완료';
                      return s === 'HOLDING' || s === '보류';
                    }).map(task => (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={e => handleDragStart(e, task.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => setEditingTask(task)}
                        className="task-card"
                        style={{
                          background: '#fff',
                          borderRadius: '6px',
                          padding: '8px 10px',
                          border: '1px solid #e2e8f0',
                          cursor: 'grab',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                          opacity: draggingId === task.id ? 0.4 : 1
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                color: '#1e293b',
                                flex: 1,
                                lineHeight: '1.3'
                              }}>{task.title}</div>
                          {(() => {
                            const quad = (task.quadrant || 'Q2').toUpperCase();
                            const badgeStyles: Record<string, { color: string; bg: string; border: string }> = {
                              Q1: { color: '#ef4444', bg: '#fef2f2', border: '1px solid rgba(239, 68, 68, 0.2)' },
                              Q2: { color: '#3b82f6', bg: '#eff6ff', border: '1px solid rgba(59, 130, 246, 0.2)' },
                              Q3: { color: '#f59e0b', bg: '#fffbeb', border: '1px solid rgba(245, 158, 11, 0.2)' },
                              Q4: { color: '#94a3b8', bg: '#f8fafc', border: '1px solid rgba(148, 163, 184, 0.2)' }
                            };
                            const badgeStyle = badgeStyles[quad] || badgeStyles.Q2;
                            return (
                              <div style={{
                                fontSize: '0.62rem',
                                fontWeight: 800,
                                padding: '1px 4px',
                                borderRadius: '3px',
                                color: badgeStyle.color,
                                background: badgeStyle.bg,
                                border: badgeStyle.border,
                                marginLeft: '6px',
                                flexShrink: 0
                              }}>{quad}</div>
                            );
                          })()}
                        </div>
                        
                        <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.65rem', background: '#eff6ff', color: '#2563eb', padding: '0 4px', borderRadius: '3px', fontWeight: 600 }}>
                            {task.type === 'PROJECT' ? '프로젝트' : '일반'}
                          </span>
                          <span style={{ fontSize: '0.65rem', background: '#f0fdf4', color: '#16a34a', padding: '0 4px', borderRadius: '3px', fontWeight: 600 }}>
                            {task.scheduleType === 'SELF' ? '스스로 계획' : '일정기반'}
                          </span>
                          {filter === '전체' && (
                            <span style={{ fontSize: '0.65rem', background: '#f3e8ff', color: '#7c3aed', padding: '0 4px', borderRadius: '3px', fontWeight: 600 }}>
                              👤 {task.assigneeName || '미배정'}
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.68rem', color: '#64748b', marginTop: '2px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <span>마감 {task.dueDate || '-'}</span>
                            {(task.commentCount ?? 0) > 0 && (
                              <span 
                                className={isCommentNew(task.lastCommentAt) ? 'blink-badge' : ''}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', color: '#d97706', background: '#fef3c7', padding: '0 4px', borderRadius: '8px', fontWeight: 700 }}
                              >
                                💬 {task.commentCount}
                              </span>
                            )}
                          </div>
                          <div style={{ color: '#0d9488', fontWeight: 700 }}>{task.projectName || 'YSACC'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {basket.id === 'TODO' && filter !== '전체' && (
                    <input 
                      type="text" 
                      placeholder="+ 업무명 입력 후 Enter" 
                      value={quickTaskTitle}
                      onChange={(e) => setQuickTaskTitle(e.target.value)}
                      onKeyDown={handleQuickAdd}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px dashed #cbd5e1', background: 'transparent', fontSize: '0.72rem', outline: 'none' }} 
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {editingTask && (
        <TaskModal
          initialTask={editingTask}
          onClose={() => setEditingTask(null)}
          onSave={async (data) => {
            await updateTask({ ...editingTask, ...data } as Task);
            setEditingTask(null);
          }}
        />
      )}
    </div>
  );
};
