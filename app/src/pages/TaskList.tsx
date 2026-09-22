import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTasks } from '../contexts/TaskContext';
import { useAuth } from '../contexts/AuthContext';
import { TaskModal } from '../components/TaskModal';
import { TaskCompletionModal } from '../components/TaskCompletionModal';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import type { Task, User } from '../types';
import { calculateQuadrant } from '../utils/businessRules';
import { isCompletionReportExempt } from '../utils/userUtils';

const typeLabels: Record<string, string> = {
  PROJECT: '📁 프로젝트', DAILY: '📝 일상업무', PERIODIC: '🔄 주기업무', DELEGATED: '🤝 위임업무'
};
const scheduleLabels: Record<string, string> = {
  SELF: '스스로 계획', SCHEDULED: '일정기반', PERIODIC: '반복주기', REQUESTED: '담당자 지정'
};
const visibilityLabels: Record<string, string> = {
  PUBLIC: '🌐 전체 공개', RESTRICTED: '👥 관련자 공개', PRIVATE: '🔒 비공개'
};
const statusLabels: Record<string, string> = {
  TODO: '시작 안 함', IN_PROGRESS: '진행중', DONE: '완료', HOLDING: '보류'
};

const columns = [
  { key: 'select', label: '□' }, { key: 'urgency_icon', label: '!' }, { key: 'urgency', label: '긴급' },
  { key: 'quadrant', label: 'Q' }, { key: 'title', label: '제목 *' }, { key: 'status', label: '상태' },
  { key: 'type', label: '유형' }, { key: 'delegator', label: '위임자' }, { key: 'assignee', label: '담당자' },
  { key: 'startDate', label: '시작일' }, { key: 'dueDate', label: '마감일' }, { key: 'createdAt', label: '등록일' },
  { key: 'recurrence', label: '주기' }, { key: 'recurrenceEnd', label: '종료일' }, { key: 'link', label: '링크' },
  { key: 'visibility', label: '공개범위' }, { key: 'updatedAt', label: '수정일' }, { key: 'doneAt', label: '완료일' },
  { key: 'actions', label: '관리' }
];

const toLocalDateStr = (val?: string | Date): string => {
  if (!val) return '';
  if (typeof val === 'string') {
    if (val.length === 10 && val.includes('-') && !val.includes('T')) {
      return val;
    }
  }
  try {
    const d = typeof val === 'string' ? new Date(val) : val;
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (e) {
    return '';
  }
};

const formatDateShort = (val?: string | Date): string => {
  const full = toLocalDateStr(val);
  if (!full) return '-';
  if (full.length === 10 && full.startsWith('20')) {
    return full.substring(2); // YYYY-MM-DD -> YY-MM-DD
  }
  return full;
};

export const TaskList: React.FC = () => {
  const { tasks, updateTask, updateTaskStatus, addTask, deleteTask } = useTasks();
  const { userProfile, currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('taskList_visibleColumns');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return columns.map(c => c.key);
  });
  const [showColMenu, setShowColMenu] = useState(false);

  React.useEffect(() => {
    try {
      localStorage.setItem('taskList_visibleColumns', JSON.stringify(visibleColumns));
    } catch (e) {
      console.error(e);
    }
  }, [visibleColumns]);
  
  const isCommentNew = (lastCommentAt?: string): boolean => {
    if (!lastCommentAt) return false;
    try {
      const diff = Date.now() - new Date(lastCommentAt).getTime();
      return diff > 0 && diff < 24 * 60 * 60 * 1000;
    } catch {
      return false;
    }
  };

  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [completingTask, setCompletingTask] = useState<Task | null>(null);
  
  // 빠른 인라인 추가 State
  const [quickTitle, setQuickTitle] = useState('');
  const [inlineStatus, setInlineStatus] = useState<string>('TODO');
  const [inlineType, setInlineType] = useState<string>('DAILY');
  const [inlineSchedule, setInlineSchedule] = useState<string>('SELF');
  const [inlineImportance, setInlineImportance] = useState<string>('B');
  const [inlineUrgency, setInlineUrgency] = useState<number>(5);
  const [inlineAssignee, setInlineAssignee] = useState<string>('');
  const [inlineProjectName, setInlineProjectName] = useState<string>('');
  const [inlineCustomerName, setInlineCustomerName] = useState<string>('');
  const [users, setUsers] = useState<User[]>([]);

  const handleOpenTask = (task: Task) => {
    setEditingTask(task);
    setSearchParams({ taskId: task.id }, { replace: true });
  };

  const handleCloseTask = () => {
    setEditingTask(null);
    setSearchParams({}, { replace: true });
  };

  useEffect(() => {
    const queryTaskId = searchParams.get('taskId') || searchParams.get('id');
    if (queryTaskId && tasks.length > 0) {
      const found = tasks.find(t => t.id === queryTaskId);
      if (found) {
        if (!editingTask || editingTask.id !== found.id) {
          setEditingTask(found);
        }
      }
    } else if (!queryTaskId && editingTask) {
      setEditingTask(null);
    }
  }, [searchParams, tasks]);

  // ── 일간, 주간 및 기간 검색 기준 ──────────────────────────────────────────────
  const [dateMode, setDateMode] = useState<'daily' | 'weekly' | 'range'>('weekly');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
  });
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

  // Filtering & Sorting State
  const [filterAssignee, setFilterAssignee] = useState('전체 담당자');
  const [filterType, setFilterType] = useState('모든 유형');
  const [filterStatus, setFilterStatus] = useState('시작 안 함 + 진행중');
  const [searchKeyword, setSearchKeyword] = useState('');
  
  const [sortField, setSortField] = useState<keyof Task | 'urgency_icon' | ''>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

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

  const handleSort = (field: string) => {
    if (field === 'select' || field === 'actions') return;
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field as any);
      setSortDirection('asc');
    }
  };

  const filteredAndSortedTasks = useMemo(() => {
    let result = [...tasks];

    // ── 날짜 및 기간 필터링 ──────────────────────────────────────────────
    result = result.filter(task => {
      const isDone = task.status === 'DONE';

      if (isDone) {
        // 완료 업무: completedAt → dueDate → startDate 순으로 기준 날짜 결정
        const compDate = (
          toLocalDateStr(task.completedAt) ||
          task.dueDate ||
          task.startDate ||
          toLocalDateStr(task.createdAt) ||
          ''
        );
        if (!compDate) return true; // 날짜 정보 없으면 항상 표시

        if (dateMode === 'daily') {
          return compDate === selectedDate;
        } else if (dateMode === 'weekly') {
          const { start, end } = getWeekRange(weekOffset);
          const wStartStr = toLocalDateStr(start);
          const wEndStr = toLocalDateStr(end);
          return compDate >= wStartStr && compDate <= wEndStr;
        } else {
          return compDate >= startDate && compDate <= endDate;
        }
      } else {
        // 미완료 업무: 날짜 범위 겹침 여부로 판단
        const tStart = task.startDate || toLocalDateStr(task.createdAt) || '';
        const tDue = task.dueDate || '';

        // 시작일·마감일 둘 다 없으면 모든 기간에 표시
        if (!tStart && !tDue) return true;

        // 시작일만 있고 마감일 없는 경우 → 시작일 이후 모든 날에 포함
        const effectiveDue = tDue || '9999-12-31';
        // 마감일만 있고 시작일 없는 경우 → 마감일 이전 모든 날에 포함
        const effectiveStart = tStart || '2000-01-01';

        if (dateMode === 'daily') {
          return effectiveStart <= selectedDate && effectiveDue >= selectedDate;
        } else if (dateMode === 'weekly') {
          const { start, end } = getWeekRange(weekOffset);
          const wStartStr = toLocalDateStr(start);
          const wEndStr = toLocalDateStr(end);
          return effectiveStart <= wEndStr && effectiveDue >= wStartStr;
        } else {
          return effectiveStart <= endDate && effectiveDue >= startDate;
        }
      }
    });

    if (filterAssignee !== '전체 담당자') {
      result = result.filter(t => t.assigneeName === filterAssignee || t.assigneeId === filterAssignee);
    }
    if (filterType !== '모든 유형') {
      const typeKey = Object.keys(typeLabels).find(k => typeLabels[k] === filterType);
      if (typeKey) result = result.filter(t => t.type === typeKey);
    }
    if (filterStatus !== '모든 상태') {
      if (filterStatus === '시작 안 함 + 진행중') {
        result = result.filter(t => t.status === 'TODO' || t.status === 'IN_PROGRESS');
      } else {
        const statusKey = Object.keys(statusLabels).find(k => statusLabels[k] === filterStatus);
        if (statusKey) result = result.filter(t => t.status === statusKey);
      }
    }

    // 키워드 통합 검색 (업무명, 담당자, 프로젝트명, 고객명, 위임자)
    if (searchKeyword.trim()) {
      const kw = searchKeyword.trim().toLowerCase();
      result = result.filter(t =>
        (t.title && t.title.toLowerCase().includes(kw)) ||
        (t.assigneeName && t.assigneeName.toLowerCase().includes(kw)) ||
        (t.projectName && t.projectName.toLowerCase().includes(kw)) ||
        (t.customerName && t.customerName.toLowerCase().includes(kw)) ||
        (t.requesterName && t.requesterName.toLowerCase().includes(kw))
      );
    }

    if (sortField) {
      result.sort((a, b) => {
        let valA = a[sortField as keyof Task];
        let valB = b[sortField as keyof Task];
        if (sortField === 'urgency_icon') { valA = a.importance; valB = b.importance; }
        if (valA === undefined) valA = '';
        if (valB === undefined) valB = '';
        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      // Default sorting: newest first (so new tasks appear at the top immediately)
      result.sort((a, b) => {
        const dateA = a.createdAt || '';
        const dateB = b.createdAt || '';
        return dateB.localeCompare(dateA);
      });
    }
    return result;
  }, [tasks, filterAssignee, filterType, filterStatus, searchKeyword, dateMode, selectedDate, startDate, endDate, weekOffset, sortField, sortDirection]);

  // ── 4대 핵심 KPI 요약 카드 통계 ─────────────────────────────────────────────
  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const list = filteredAndSortedTasks;
    const total = list.length;
    const inProgress = list.filter(t => t.status === 'IN_PROGRESS').length;
    const todo = list.filter(t => t.status === 'TODO').length;
    const done = list.filter(t => t.status === 'DONE').length;
    const holding = list.filter(t => t.status === 'HOLDING').length;
    
    // 긴급/지연 업무: 미완료 중 마감일 경과(지연) 또는 오늘 마감, 또는 중요도 A / 긴급도 >= 8 / Q1
    const urgentTasks = list.filter(t => {
      if (t.status === 'DONE') return false;
      const isOverdue = Boolean(t.dueDate && t.dueDate < todayStr);
      const isToday = Boolean(t.dueDate && t.dueDate === todayStr);
      const isHighUrgency = t.importance === 'A' || (t.urgency && t.urgency >= 8) || t.quadrant === 'Q1';
      return isOverdue || isToday || isHighUrgency;
    });

    const overdueCount = list.filter(t => t.status !== 'DONE' && t.dueDate && t.dueDate < todayStr).length;
    const donePercent = total > 0 ? Math.round((done / total) * 100) : 0;

    return {
      total,
      inProgress,
      todo,
      done,
      holding,
      urgent: urgentTasks.length,
      overdueCount,
      donePercent
    };
  }, [filteredAndSortedTasks]);

  const isFilterActive = 
    dateMode !== 'weekly' || 
    weekOffset !== 0 || 
    filterAssignee !== '전체 담당자' || 
    filterType !== '모든 유형' || 
    filterStatus !== '시작 안 함 + 진행중' || 
    searchKeyword.trim() !== '';

  const handleResetFilters = () => {
    setDateMode('weekly');
    setWeekOffset(0);
    setFilterAssignee('전체 담당자');
    setFilterType('모든 유형');
    setFilterStatus('시작 안 함 + 진행중');
    setSearchKeyword('');
    setSelectedDate(new Date().toISOString().split('T')[0]);
  };

  const [colWidths, setColWidths] = useState<Record<string, number>>({
    select: 40, urgency_icon: 38, urgency: 55, quadrant: 55, title: 450,
    status: 105, type: 110,
    delegator: 90, assignee: 90, startDate: 95, dueDate: 105, createdAt: 95,
    recurrence: 85, recurrenceEnd: 95, link: 55, visibility: 110,
    updatedAt: 95, doneAt: 95, actions: 65
  });

  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  const mouseMoveHandlerRef = useRef<((e: MouseEvent) => void) | null>(null);
  const mouseUpHandlerRef = useRef<(() => void) | null>(null);

  const onMouseDown = (key: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { key, startX: e.pageX, startWidth: colWidths[key] };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingRef.current) return;
      const { key: rKey, startX, startWidth } = resizingRef.current;
      const newWidth = Math.max(30, startWidth + (moveEvent.pageX - startX));
      setColWidths(prev => ({ ...prev, [rKey]: newWidth }));
    };

    const handleMouseUp = () => {
      resizingRef.current = null;
      document.body.style.cursor = 'default';
      document.body.style.userSelect = '';
      if (mouseMoveHandlerRef.current) document.removeEventListener('mousemove', mouseMoveHandlerRef.current);
      if (mouseUpHandlerRef.current) document.removeEventListener('mouseup', mouseUpHandlerRef.current);
      mouseMoveHandlerRef.current = null;
      mouseUpHandlerRef.current = null;
    };

    mouseMoveHandlerRef.current = handleMouseMove;
    mouseUpHandlerRef.current = handleMouseUp;

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleQuickAdd = async () => {
    if (!quickTitle.trim()) return;
    try {
      // Get default startDate matching the current date filter
      let defaultStartDate = selectedDate;
      if (dateMode === 'weekly') {
        const { start } = getWeekRange(weekOffset);
        defaultStartDate = start.toISOString().split('T')[0];
      } else if (dateMode === 'range') {
        defaultStartDate = startDate;
      }

      await addTask({
        title: quickTitle,
        status: inlineStatus,
        type: inlineType,
        scheduleType: inlineSchedule,
        importance: inlineImportance,
        urgency: inlineUrgency,
        quadrant: calculateQuadrant(inlineImportance, inlineUrgency),
        assigneeId: inlineAssignee || userProfile?.id || '',
        assigneeName: users.find(u => u.id === inlineAssignee)?.name || userProfile?.name || '관리자',
        projectName: inlineProjectName,
        customerName: inlineCustomerName,
        startDate: defaultStartDate || new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString()
      } as any);
      setQuickTitle('');
      setInlineProjectName('');
      setInlineCustomerName('');
    } catch (e) {
      console.error(e);
      alert('업무 등록 중 오류가 발생했습니다.');
    }
  };

  const renderedColumns = columns.filter(col => visibleColumns.includes(col.key));
  const todayDateStr = new Date().toISOString().split('T')[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#fdfdfd' }}>
      <div style={{ padding: '24px 30px 10px' }}>
        {/* ── 1. 페이지 헤더 (타이틀, 배지 및 신규 등록 버튼) ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.025em' }}>
              전체 업무 리스트
            </h1>
            <span style={{ 
              fontSize: '12px', 
              fontWeight: 700, 
              color: '#475569', 
              background: '#f1f5f9', 
              padding: '4px 12px', 
              borderRadius: '20px', 
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
            }}>
              총 {tasks.length}건 / {dateMode === 'weekly' ? formatWeekLabel(weekOffset) : dateMode === 'daily' ? selectedDate : `${startDate} ~ ${endDate}`} 결과 {filteredAndSortedTasks.length}건
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsNewTaskModalOpen(true)}
            style={{
              height: '34px',
              padding: '0 16px',
              background: '#3b82f6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '13px',
              fontWeight: 750,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 1px 3px rgba(59, 130, 246, 0.25)',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#2563eb'}
            onMouseLeave={e => e.currentTarget.style.background = '#3b82f6'}
          >
            <span>➕</span>
            <span>신규 업무 등록</span>
          </button>
        </div>

        {/* ── 2. 4대 핵심 KPI 요약 카드 ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '14px' }}>
          {/* 카드 1: 전체/조회 업무 */}
          <div 
            style={{ 
              background: '#fff', 
              border: '1px solid #e2e8f0', 
              borderRadius: '8px', 
              padding: '14px 18px', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.03)'; }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '6px', background: '#eff6ff', color: '#2563eb', fontSize: '13px' }}>📋</span>
                <span style={{ fontSize: '12.5px', fontWeight: 750, color: '#64748b' }}>조회 업무 현황</span>
              </div>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                완료 {stats.done}건 ({stats.donePercent}%) · 보류 {stats.holding}건
              </span>
            </div>
            <div style={{ fontSize: '22px', fontWeight: 850, color: '#0f172a', letterSpacing: '-0.02em' }}>
              {stats.total} <span style={{ fontSize: '13px', fontWeight: 700, color: '#64748b' }}>건</span>
            </div>
          </div>

          {/* 카드 2: 진행 중 업무 */}
          <div 
            style={{ 
              background: '#fff', 
              border: '1px solid #e2e8f0', 
              borderRadius: '8px', 
              padding: '14px 18px', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.03)'; }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '6px', background: '#eff6ff', color: '#2563eb', fontSize: '13px' }}>⚡</span>
                <span style={{ fontSize: '12.5px', fontWeight: 750, color: '#64748b' }}>진행 중 업무</span>
              </div>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                현재 집중 실행 중인 태스크
              </span>
            </div>
            <div style={{ fontSize: '22px', fontWeight: 850, color: '#2563eb', letterSpacing: '-0.02em' }}>
              {stats.inProgress} <span style={{ fontSize: '13px', fontWeight: 700, color: '#64748b' }}>건</span>
            </div>
          </div>

          {/* 카드 3: 착수 대기 업무 */}
          <div 
            style={{ 
              background: '#fff', 
              border: '1px solid #e2e8f0', 
              borderRadius: '8px', 
              padding: '14px 18px', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.03)'; }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '6px', background: '#f8fafc', color: '#64748b', fontSize: '13px' }}>⏳</span>
                <span style={{ fontSize: '12.5px', fontWeight: 750, color: '#64748b' }}>착수 대기 업무</span>
              </div>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                시작 전 대기 태스크
              </span>
            </div>
            <div style={{ fontSize: '22px', fontWeight: 850, color: '#475569', letterSpacing: '-0.02em' }}>
              {stats.todo} <span style={{ fontSize: '13px', fontWeight: 700, color: '#64748b' }}>건</span>
            </div>
          </div>

          {/* 카드 4: 긴급 / 지연 업무 */}
          <div 
            style={{ 
              background: stats.urgent > 0 ? '#fff1f2' : '#fff', 
              border: `1px solid ${stats.urgent > 0 ? '#fecdd3' : '#e2e8f0'}`, 
              borderRadius: '8px', 
              padding: '14px 18px', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.03)'; }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', borderRadius: '6px', background: stats.urgent > 0 ? '#ffe4e6' : '#f1f5f9', color: stats.urgent > 0 ? '#e11d48' : '#64748b', fontSize: '13px' }}>
                  {stats.urgent > 0 ? '🚨' : '⚡'}
                </span>
                <span style={{ fontSize: '12.5px', fontWeight: 750, color: stats.urgent > 0 ? '#e11d48' : '#64748b' }}>
                  긴급 / 지연 업무
                </span>
              </div>
              <span style={{ fontSize: '11px', color: stats.urgent > 0 ? '#be123c' : '#64748b', fontWeight: 600 }}>
                {stats.overdueCount > 0 ? `마감 지연 ${stats.overdueCount}건 포함` : '마감일 임박 및 중요도A'}
              </span>
            </div>
            <div style={{ fontSize: '22px', fontWeight: 850, color: stats.urgent > 0 ? '#e11d48' : '#0f172a', letterSpacing: '-0.02em' }}>
              {stats.urgent} <span style={{ fontSize: '13px', fontWeight: 700, color: stats.urgent > 0 ? '#e11d48' : '#64748b' }}>건</span>
            </div>
          </div>
        </div>

        {/* ── 3. 필터 바(FilterBar) 모던 통합 카드 ── */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          gap: '10px',
          background: '#ffffff',
          padding: '12px 16px',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
          marginBottom: '14px'
        }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'nowrap', width: '100%', overflowX: 'auto', paddingBottom: '2px' }}>
            
            {/* (1) 조회 모드 탭 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flexShrink: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                조회 기준
              </label>
              <div style={{ display: 'flex', border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden', background: '#fff', height: '34px', boxSizing: 'border-box' }}>
                <button
                  type="button"
                  onClick={() => {
                    setDateMode('daily');
                    setSelectedDate(new Date().toISOString().split('T')[0]);
                  }}
                  style={{
                    padding: '0 14px',
                    border: 'none',
                    background: dateMode === 'daily' ? '#3b82f6' : '#fff',
                    color: dateMode === 'daily' ? '#fff' : '#475569',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '12px',
                    transition: 'all 0.15s',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  일간
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDateMode('weekly');
                    setWeekOffset(0);
                  }}
                  style={{
                    padding: '0 14px',
                    border: 'none',
                    background: dateMode === 'weekly' ? '#3b82f6' : '#fff',
                    color: dateMode === 'weekly' ? '#fff' : '#475569',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '12px',
                    transition: 'all 0.15s',
                    borderLeft: '1px solid #cbd5e1',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  주간
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDateMode('range');
                    const today = new Date();
                    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
                    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                    setStartDate(firstDay.toISOString().split('T')[0]);
                    setEndDate(lastDay.toISOString().split('T')[0]);
                  }}
                  style={{
                    padding: '0 14px',
                    border: 'none',
                    background: dateMode === 'range' ? '#3b82f6' : '#fff',
                    color: dateMode === 'range' ? '#fff' : '#475569',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '12px',
                    transition: 'all 0.15s',
                    borderLeft: '1px solid #cbd5e1',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  기간 검색
                </button>
              </div>
            </div>

            {/* (2) 상세 날짜 컨트롤 */}
            {dateMode === 'daily' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flexShrink: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  일자 선택
                </label>
                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden', background: '#fff', height: '34px', boxSizing: 'border-box' }}>
                  <button type="button" onClick={handlePrevDay} style={{ padding: '0 10px', height: '100%', border: 'none', background: '#f8fafc', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#374151', borderRight: '1px solid #cbd5e1', display: 'flex', alignItems: 'center' }}>‹</button>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    style={{
                      padding: '0 10px',
                      border: 'none',
                      outline: 'none',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      color: '#1e293b',
                      cursor: 'pointer',
                      height: '100%',
                      background: '#fff',
                      boxSizing: 'border-box'
                    }}
                  />
                  <button type="button" onClick={handleNextDay} style={{ padding: '0 10px', height: '100%', border: 'none', background: '#f8fafc', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#374151', borderLeft: '1px solid #cbd5e1', display: 'flex', alignItems: 'center' }}>›</button>
                  {selectedDate !== todayDateStr && (
                    <button
                      type="button"
                      onClick={() => setSelectedDate(todayDateStr)}
                      style={{
                        padding: '0 10px',
                        height: '100%',
                        border: 'none',
                        borderLeft: '1px solid #cbd5e1',
                        background: '#fff7ed',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#ea580c',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                    >
                      오늘
                    </button>
                  )}
                </div>
              </div>
            )}

            {dateMode === 'weekly' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flexShrink: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#2563eb', letterSpacing: '0.02em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  주간 선택
                </label>
                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #3b82f6', borderRadius: '4px', overflow: 'hidden', background: '#fff', height: '34px', boxSizing: 'border-box' }}>
                  <button type="button" onClick={() => setWeekOffset(w => w - 1)} style={{ padding: '0 10px', height: '100%', border: 'none', background: '#eff6ff', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#2563eb', display: 'flex', alignItems: 'center' }}>‹</button>
                  <div style={{ padding: '0 12px', height: '100%', background: weekOffset === 0 ? '#eff6ff' : '#f8fafc', color: weekOffset === 0 ? '#1d4ed8' : '#374151', fontWeight: 750, fontSize: '12.5px', borderLeft: '1px solid #bfdbfe', borderRight: '1px solid #bfdbfe', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}>
                    📅 {formatWeekLabel(weekOffset)}
                  </div>
                  <button type="button" onClick={() => setWeekOffset(w => w + 1)} style={{ padding: '0 10px', height: '100%', border: 'none', background: '#eff6ff', cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#2563eb', display: 'flex', alignItems: 'center' }}>›</button>
                  {weekOffset !== 0 && (
                    <button type="button" onClick={() => setWeekOffset(0)} style={{ padding: '0 10px', height: '100%', border: 'none', borderLeft: '1px solid #cbd5e1', background: '#fff7ed', cursor: 'pointer', fontSize: '11px', fontWeight: 700, color: '#ea580c', display: 'flex', alignItems: 'center' }}>이번주</button>
                  )}
                </div>
              </div>
            )}

            {dateMode === 'range' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flexShrink: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  조회 기간
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden', background: '#fff', height: '34px', boxSizing: 'border-box' }}>
                    <input
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      style={{ padding: '0 8px', border: 'none', outline: 'none', fontSize: '12px', fontWeight: 650, color: '#1e293b', cursor: 'pointer', height: '100%', boxSizing: 'border-box' }}
                    />
                    <span style={{ padding: '0 6px', color: '#94a3b8', fontSize: '12px', fontWeight: 700, background: '#f8fafc', borderLeft: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1', height: '100%', display: 'flex', alignItems: 'center', boxSizing: 'border-box' }}>~</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      style={{ padding: '0 8px', border: 'none', outline: 'none', fontSize: '12px', fontWeight: 650, color: '#1e293b', cursor: 'pointer', height: '100%', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '3px', height: '34px' }}>
                    <button type="button" onClick={() => setRangePreset('today')} style={{ padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', background: '#fff', cursor: 'pointer', fontSize: '11.5px', fontWeight: 700, color: '#475569', height: '100%', boxSizing: 'border-box' }}>오늘</button>
                    <button type="button" onClick={() => setRangePreset('week')} style={{ padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', background: '#fff', cursor: 'pointer', fontSize: '11.5px', fontWeight: 700, color: '#475569', height: '100%', boxSizing: 'border-box' }}>이번주</button>
                    <button type="button" onClick={() => setRangePreset('month')} style={{ padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', background: '#fff', cursor: 'pointer', fontSize: '11.5px', fontWeight: 700, color: '#475569', height: '100%', boxSizing: 'border-box' }}>이번달</button>
                    <button type="button" onClick={() => setRangePreset('all')} style={{ padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', background: '#fff', cursor: 'pointer', fontSize: '11.5px', fontWeight: 700, color: '#475569', height: '100%', boxSizing: 'border-box' }}>전체</button>
                  </div>
                </div>
              </div>
            )}

            {/* 수직 구분선 */}
            <div style={{ width: '1px', height: '28px', background: '#e2e8f0', margin: '0 4px 4px', flexShrink: 0 }} />

            {/* (3) 담당자 필터 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flexShrink: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: filterAssignee !== '전체 담당자' ? '#2563eb' : '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                담당자
              </label>
              <select
                style={{
                  padding: '0 10px',
                  height: '34px',
                  border: filterAssignee !== '전체 담당자' ? '1.5px solid #3b82f6' : '1px solid #cbd5e1',
                  borderRadius: '4px',
                  fontSize: '12.5px',
                  fontWeight: filterAssignee !== '전체 담당자' ? 750 : 600,
                  color: filterAssignee !== '전체 담당자' ? '#1d4ed8' : '#1e293b',
                  backgroundColor: filterAssignee !== '전체 담당자' ? '#eff6ff' : '#fff',
                  cursor: 'pointer',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                value={filterAssignee}
                onChange={e => setFilterAssignee(e.target.value)}
              >
                <option>전체 담당자</option>
                {users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
              </select>
            </div>

            {/* (4) 유형 필터 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flexShrink: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: filterType !== '모든 유형' ? '#2563eb' : '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                유형
              </label>
              <select
                style={{
                  padding: '0 10px',
                  height: '34px',
                  border: filterType !== '모든 유형' ? '1.5px solid #3b82f6' : '1px solid #cbd5e1',
                  borderRadius: '4px',
                  fontSize: '12.5px',
                  fontWeight: filterType !== '모든 유형' ? 750 : 600,
                  color: filterType !== '모든 유형' ? '#1d4ed8' : '#1e293b',
                  backgroundColor: filterType !== '모든 유형' ? '#eff6ff' : '#fff',
                  cursor: 'pointer',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
              >
                <option>모든 유형</option>
                {Object.values(typeLabels).map(l => <option key={l}>{l}</option>)}
              </select>
            </div>

            {/* (5) 상태 필터 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flexShrink: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: filterStatus !== '시작 안 함 + 진행중' ? '#2563eb' : '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                상태
              </label>
              <select
                style={{
                  padding: '0 10px',
                  height: '34px',
                  border: filterStatus !== '시작 안 함 + 진행중' ? '1.5px solid #3b82f6' : '1px solid #cbd5e1',
                  borderRadius: '4px',
                  fontSize: '12.5px',
                  fontWeight: filterStatus !== '시작 안 함 + 진행중' ? 750 : 600,
                  color: filterStatus !== '시작 안 함 + 진행중' ? '#1d4ed8' : '#1e293b',
                  backgroundColor: filterStatus !== '시작 안 함 + 진행중' ? '#eff6ff' : '#fff',
                  cursor: 'pointer',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
              >
                <option>모든 상태</option>
                <option>시작 안 함 + 진행중</option>
                {Object.values(statusLabels).map(l => <option key={l}>{l}</option>)}
              </select>
            </div>

            {/* (6) 통합 검색창 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flexShrink: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: 750, color: searchKeyword.trim() ? '#2563eb' : '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                통합 검색
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <span style={{ position: 'absolute', left: '10px', color: '#94a3b8', fontSize: '12px' }}>🔍</span>
                <input
                  type="text"
                  placeholder="업무명·담당자·프로젝트 검색"
                  value={searchKeyword}
                  onChange={e => setSearchKeyword(e.target.value)}
                  style={{
                    padding: '0 28px 0 28px',
                    height: '34px',
                    width: '210px',
                    border: searchKeyword.trim() ? '1.5px solid #3b82f6' : '1px solid #cbd5e1',
                    borderRadius: '4px',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    color: '#1e293b',
                    backgroundColor: searchKeyword.trim() ? '#eff6ff' : '#fff',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'all 0.15s ease'
                  }}
                />
                {searchKeyword && (
                  <button
                    type="button"
                    onClick={() => setSearchKeyword('')}
                    style={{ position: 'absolute', right: '8px', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '12px', padding: 0 }}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* (7) 우측 컨트롤 버튼: 초기화 & 열 설정 */}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', marginLeft: 'auto', flexShrink: 0 }}>
              {isFilterActive && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  style={{
                    padding: '0 12px',
                    height: '34px',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    background: '#f8fafc',
                    color: '#475569',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    boxSizing: 'border-box',
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = '#fca5a5'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#475569'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
                  title="모든 필터를 기본 상태로 복원"
                >
                  🔄 초기화
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowColMenu(true)}
                style={{
                  padding: '0 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  height: '34px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  background: '#ffffff',
                  cursor: 'pointer',
                  fontSize: '12.5px',
                  fontWeight: 750,
                  color: '#1e293b',
                  boxSizing: 'border-box',
                  transition: 'all 0.15s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
              >
                ⚙️ 열 설정
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. 열 설정 최상위 모달 (YSACC Modal 규격 일치) ── */}
      {showColMenu && (
        <div 
          onClick={() => setShowColMenu(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(2px)',
            zIndex: 999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div 
            onClick={e => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: '4px',
              border: '1px solid #cbd5e1',
              boxShadow: '0 20px 40px rgba(15,23,42,0.2)',
              width: '340px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              animation: 'fadeIn 0.15s ease-out'
            }}
          >
            {/* 헤더 */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fafafa' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                ⚙️ 표시할 열 설정
              </div>
              <button 
                onClick={() => setShowColMenu(false)}
                style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            {/* 컨트롤 버튼 */}
            <div style={{ padding: '12px 20px 8px', display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  const selectable = columns.filter(c => c.key !== 'select' && c.key !== 'title' && c.key !== 'actions').map(c => c.key);
                  setVisibleColumns(['select', 'title', 'actions', ...selectable]);
                }}
                style={{ flex: 1, padding: '7px 0', fontSize: '12px', fontWeight: 700, cursor: 'pointer', border: '1px solid #cbd5e1', borderRadius: '4px', backgroundColor: '#f1f5f9', color: '#334155' }}
              >
                전체 선택
              </button>
              <button
                type="button"
                onClick={() => {
                  setVisibleColumns(['select', 'title', 'actions']);
                }}
                style={{ flex: 1, padding: '7px 0', fontSize: '12px', fontWeight: 700, cursor: 'pointer', border: '1px solid #cbd5e1', borderRadius: '4px', backgroundColor: '#f1f5f9', color: '#334155' }}
              >
                전체 해제
              </button>
            </div>

            {/* 열 목록 */}
            <div style={{ padding: '8px 20px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
              {columns.map(col => {
                if (col.key === 'select' || col.key === 'title' || col.key === 'actions') return null;
                const checked = visibleColumns.includes(col.key);
                return (
                  <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer', color: '#1e293b', fontWeight: 600, padding: '4px 0' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        if (checked) {
                          setVisibleColumns(prev => prev.filter(k => k !== col.key));
                        } else {
                          setVisibleColumns(prev => [...prev, col.key]);
                        }
                      }}
                      style={{ width: '16px', height: '16px', accentColor: '#3b82f6', cursor: 'pointer' }}
                    />
                    {col.label}
                  </label>
                );
              })}
            </div>

            {/* 하단 푸터 버튼 */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid #cbd5e1', backgroundColor: '#fafafa', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowColMenu(false)}
                style={{ height: '34px', padding: '0 20px', background: '#3b82f6', color: '#ffffff', border: 'none', borderRadius: '4px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
              >
                확인 및 닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 5. 데이터 그리드 테이블 컨테이너 ── */}
      <div className="table-scroll-container" style={{ flex: 1, overflow: 'auto', padding: '0 30px 30px' }}>
        <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', width: 'max-content', minWidth: '100%' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '13px', tableLayout: 'fixed', width: 'max-content', backgroundColor: '#ffffff' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#f8fafc' }}>
              {/* 메인 헤더 행 */}
              <tr style={{ height: '44px', borderBottom: '1.5px solid #cbd5e1' }}>
                {renderedColumns.map(col => (
                  <th 
                    key={col.key} 
                    onClick={() => handleSort(col.key)} 
                    style={{ 
                      width: colWidths[col.key], 
                      padding: '0 10px', 
                      textAlign: (col.key === 'select' || col.key === 'actions' || col.key === 'urgency_icon' || col.key === 'urgency' || col.key === 'quadrant') ? 'center' : 'left', 
                      color: sortField === col.key ? '#2563eb' : '#475569', 
                      fontWeight: '750', 
                      borderRight: '1px solid #e2e8f0', 
                      position: 'relative', 
                      whiteSpace: 'nowrap', 
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis',
                      cursor: (col.key === 'select' || col.key === 'actions') ? 'default' : 'pointer',
                      fontSize: '12px', 
                      letterSpacing: '0.02em', 
                      textTransform: 'uppercase',
                      backgroundColor: sortField === col.key ? '#eff6ff' : '#f8fafc',
                      ...(col.key === 'title' ? { position: 'sticky', left: 0, zIndex: 30, backgroundColor: '#f8fafc', borderRight: '2px solid #cbd5e1' } : {})
                    }}
                  >
                    <span>{col.label}</span>
                    {sortField === col.key && (
                      <span style={{ marginLeft: '4px', color: '#2563eb' }}>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                    <div 
                      onMouseDown={(e) => onMouseDown(col.key, e)} 
                      style={{ position: 'absolute', right: -3, top: 0, width: '6px', height: '100%', cursor: 'col-resize', zIndex: 50, transition: 'background-color 0.2s' }} 
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#3b82f6'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    />
                  </th>
                ))}
              </tr>

              {/* ── 인라인 빠른 업무 추가 행 (Quick Add Row) ── */}
              <tr style={{ backgroundColor: '#f0fdf4', height: '46px', borderBottom: '2px solid #bbf7d0' }}>
                {renderedColumns.map(col => {
                  if (col.key === 'select') {
                    return (
                      <td key={col.key} style={{ textAlign: 'center', borderRight: '1px solid #e2e8f0' }}>
                        <span style={{ color: '#16a34a', fontSize: '13px', fontWeight: 800 }}>➕</span>
                      </td>
                    );
                  }
                  if (col.key === 'actions') {
                    return (
                      <td key={col.key} style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={handleQuickAdd}
                          style={{ 
                            background: '#16a34a', 
                            color: '#ffffff', 
                            border: 'none', 
                            borderRadius: '4px', 
                            width: '28px', 
                            height: '28px', 
                            cursor: 'pointer', 
                            fontWeight: 'bold', 
                            fontSize: '16px', 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            boxShadow: '0 1px 2px rgba(22, 163, 74, 0.3)',
                            transition: 'background 0.15s ease'
                          }}
                          title="빠른 업무 추가"
                          onMouseEnter={e => e.currentTarget.style.background = '#15803d'}
                          onMouseLeave={e => e.currentTarget.style.background = '#16a34a'}
                        >
                          +
                        </button>
                      </td>
                    );
                  }
                  if (col.key === 'urgency_icon') {
                    return (
                      <td key={col.key} style={{ padding: '0 6px', borderRight: '1px solid #e2e8f0' }}>
                        <select
                          value={inlineImportance}
                          onChange={e => setInlineImportance(e.target.value)}
                          style={{ width: '100%', padding: '0 4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12.5px', height: '32px', backgroundColor: '#fff', outline: 'none', cursor: 'pointer', fontWeight: 700, color: inlineImportance === 'A' ? '#ef4444' : '#1e293b', textAlign: 'center' }}
                        >
                          <option value="A">A</option>
                          <option value="B">B</option>
                          <option value="C">C</option>
                        </select>
                      </td>
                    );
                  }
                  if (col.key === 'urgency') {
                    return (
                      <td key={col.key} style={{ padding: '0 6px', borderRight: '1px solid #e2e8f0' }}>
                        <select
                          value={inlineUrgency}
                          onChange={e => setInlineUrgency(Number(e.target.value))}
                          style={{ width: '100%', padding: '0 4px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12.5px', height: '32px', backgroundColor: '#fff', outline: 'none', cursor: 'pointer', fontWeight: 700, textAlign: 'center' }}
                        >
                          {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </td>
                    );
                  }
                  if (col.key === 'quadrant') {
                    const quad = calculateQuadrant(inlineImportance, inlineUrgency);
                    const qColors: Record<string, { bg: string; text: string; border: string }> = {
                      Q1: { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
                      Q2: { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' },
                      Q3: { bg: '#fffbeb', text: '#d97706', border: '#fde68a' },
                      Q4: { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' },
                    };
                    const color = qColors[quad] || qColors.Q2;
                    return (
                      <td key={col.key} style={{ padding: '0 6px', textAlign: 'center', borderRight: '1px solid #e2e8f0' }}>
                        <span style={{ background: color.bg, color: color.text, border: `1px solid ${color.border}`, padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 800 }}>
                          {quad}
                        </span>
                      </td>
                    );
                  }
                  if (col.key === 'title') {
                    return (
                      <td key={col.key} style={{ padding: '0 8px', position: 'sticky', left: 0, zIndex: 25, backgroundColor: '#f0fdf4', borderRight: '2px solid #bbf7d0' }}>
                        <input 
                          placeholder="새 업무명을 입력하고 Enter 또는 ➕ 클릭" 
                          value={quickTitle}
                          onChange={e => setQuickTitle(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleQuickAdd()}
                          style={{ 
                            width: '100%', 
                            padding: '0 10px', 
                            border: '1px solid #cbd5e1', 
                            borderRadius: '4px', 
                            outline: 'none', 
                            fontSize: '13px', 
                            fontWeight: 600,
                            height: '32px', 
                            boxSizing: 'border-box',
                            backgroundColor: '#ffffff'
                          }} 
                        />
                      </td>
                    );
                  }
                  if (col.key === 'status') {
                    return (
                      <td key={col.key} style={{ padding: '0 6px', borderRight: '1px solid #e2e8f0' }}>
                        <select
                          value={inlineStatus}
                          onChange={e => setInlineStatus(e.target.value)}
                          style={{ width: '100%', padding: '0 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', height: '32px', backgroundColor: '#fff', outline: 'none', cursor: 'pointer', fontWeight: 650 }}
                        >
                          <option value="TODO">시작 안 함</option>
                          <option value="IN_PROGRESS">진행중</option>
                          <option value="HOLDING">보류</option>
                          <option value="DONE">완료</option>
                        </select>
                      </td>
                    );
                  }
                  if (col.key === 'type') {
                    return (
                      <td key={col.key} style={{ padding: '0 6px', borderRight: '1px solid #e2e8f0' }}>
                        <select
                          value={inlineType}
                          onChange={e => setInlineType(e.target.value)}
                          style={{ width: '100%', padding: '0 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', height: '32px', backgroundColor: '#fff', outline: 'none', cursor: 'pointer', fontWeight: 650 }}
                        >
                          <option value="DAILY">📝 일상업무</option>
                          <option value="PROJECT">📁 프로젝트</option>
                          <option value="PERIODIC">🔄 주기업무</option>
                          <option value="DELEGATED">🤝 위임업무</option>
                        </select>
                      </td>
                    );
                  }
                  if (col.key === 'assignee') {
                    return (
                      <td key={col.key} style={{ padding: '0 6px', borderRight: '1px solid #e2e8f0' }}>
                        <select
                          value={inlineAssignee}
                          onChange={e => setInlineAssignee(e.target.value)}
                          style={{ width: '100%', padding: '0 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', height: '32px', backgroundColor: '#fff', outline: 'none', cursor: 'pointer', fontWeight: 650 }}
                        >
                          <option value="">담당자 지정</option>
                          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      </td>
                    );
                  }
                  return <td key={col.key} style={{ borderRight: '1px solid #e2e8f0' }}></td>;
                })}
              </tr>
            </thead>

            {/* ── 테이블 본문 (Rows) ── */}
            <tbody>
              {filteredAndSortedTasks.length === 0 ? (
                <tr>
                  <td colSpan={renderedColumns.length} style={{ padding: '60px 20px', textAlign: 'center', backgroundColor: '#fff' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '32px' }}>🔍</span>
                      <div style={{ fontSize: '15px', fontWeight: 750, color: '#1e293b' }}>
                        일치하는 업무가 없습니다
                      </div>
                      <div style={{ fontSize: '12.5px', color: '#64748b' }}>
                        설정된 조회 기간 또는 필터 조건에 해당하는 업무가 없습니다.
                      </div>
                      {isFilterActive && (
                        <button
                          type="button"
                          onClick={handleResetFilters}
                          style={{
                            marginTop: '8px',
                            padding: '6px 16px',
                            background: '#eff6ff',
                            border: '1px solid #bfdbfe',
                            color: '#2563eb',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          🔄 필터 초기화하기
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredAndSortedTasks.map((task, idx) => {
                  const isDone = task.status === 'DONE';
                  const isOverdue = !isDone && Boolean(task.dueDate && task.dueDate < todayDateStr);
                  const isToday = !isDone && Boolean(task.dueDate && task.dueDate === todayDateStr);
                  
                  const renderCell = (colKey: string) => {
                    switch (colKey) {
                      case 'select':
                        return (
                          <td style={{ textAlign: 'center', borderRight: '1px solid #f1f5f9' }}>
                            <input
                              type="checkbox"
                              checked={isDone}
                              onClick={e => e.stopPropagation()}
                              onChange={async (e) => {
                                e.stopPropagation();
                                if (isDone) {
                                  await updateTaskStatus(task.id, 'TODO');
                                } else {
                                  const currentUserId = userProfile?.id || currentUser?.uid || '';
                                  const currentUserName = userProfile?.name || currentUser?.displayName || '';
                                  if (isCompletionReportExempt(task, currentUserId, currentUserName)) {
                                    await updateTaskStatus(task.id, 'DONE');
                                  } else {
                                    setCompletingTask(task);
                                  }
                                }
                              }}
                              style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#16a34a' }}
                            />
                          </td>
                        );
                      case 'urgency_icon':
                        return (
                          <td style={{ textAlign: 'center', fontWeight: '800', fontSize: '13px', color: task.importance === 'A' ? '#ef4444' : task.importance === 'B' ? '#475569' : '#94a3b8', borderRight: '1px solid #f1f5f9' }}>
                            {task.importance || 'B'}
                          </td>
                        );
                      case 'urgency':
                        return (
                          <td style={{ textAlign: 'center', fontSize: '13px', fontWeight: 700, color: (task.urgency || 0) >= 8 ? '#dc2626' : '#334155', borderRight: '1px solid #f1f5f9' }}>
                            {task.urgency}
                          </td>
                        );
                      case 'quadrant': {
                        const quad = task.quadrant || 'Q2';
                        const qColors: Record<string, { bg: string; text: string; border: string }> = {
                          Q1: { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
                          Q2: { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' },
                          Q3: { bg: '#fffbeb', text: '#d97706', border: '#fde68a' },
                          Q4: { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' },
                        };
                        const c = qColors[quad] || qColors.Q2;
                        return (
                          <td style={{ textAlign: 'center', borderRight: '1px solid #f1f5f9' }}>
                            <span style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}`, padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 800 }}>
                              {quad}
                            </span>
                          </td>
                        );
                      }
                      case 'title':
                        return (
                          <td style={{ 
                            padding: '0 12px', 
                            fontWeight: '650', 
                            fontSize: '13.5px', 
                            color: isDone ? '#94a3b8' : '#0f172a', 
                            position: 'sticky', 
                            left: 0, 
                            zIndex: 10, 
                            backgroundColor: isDone ? '#f9fafb' : (idx % 2 === 1 ? '#fcfcfc' : '#ffffff'), 
                            borderRight: '2px solid #e2e8f0' 
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              textDecoration: isDone ? 'line-through' : 'none',
                              opacity: isDone ? 0.65 : 1
                            }}>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {task.title}
                              </span>
                              {task.projectName && (
                                <span style={{ fontSize: '10.5px', fontWeight: 700, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '1px 5px', borderRadius: '3px', flexShrink: 0 }}>
                                  {task.projectName}
                                </span>
                              )}
                              {(task.commentCount ?? 0) > 0 && (
                                <span 
                                  className={isCommentNew(task.lastCommentAt) ? 'blink-badge' : ''}
                                  style={{ fontSize: '11px', background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '1px 5px', borderRadius: '10px', display: 'inline-flex', alignItems: 'center', gap: '2px', fontWeight: '800', flexShrink: 0 }}
                                  title={`댓글 ${task.commentCount}개`}
                                >
                                  💬 {task.commentCount}
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      case 'status': {
                        const sColors: Record<string, { bg: string; text: string; border: string }> = {
                          IN_PROGRESS: { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' },
                          TODO: { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' },
                          DONE: { bg: '#ecfdf5', text: '#059669', border: '#a7f3d0' },
                          HOLDING: { bg: '#fffbeb', text: '#d97706', border: '#fde68a' }
                        };
                        const sc = sColors[task.status] || sColors.TODO;
                        return (
                          <td style={{ padding: '0 10px', textAlign: 'center', whiteSpace: 'nowrap', borderRight: '1px solid #f1f5f9' }}>
                            <span style={{ 
                              background: sc.bg, 
                              color: sc.text, 
                              border: `1px solid ${sc.border}`, 
                              padding: '3px 8px', 
                              borderRadius: '12px', 
                              fontSize: '11.5px', 
                              fontWeight: 750, 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              whiteSpace: 'nowrap' 
                            }}>
                              {statusLabels[task.status] || task.status}
                            </span>
                          </td>
                        );
                      }
                      case 'type':
                        return (
                          <td style={{ padding: '0 10px', fontSize: '12.5px', color: '#334155', opacity: isDone ? 0.6 : 1, whiteSpace: 'nowrap', borderRight: '1px solid #f1f5f9' }}>
                            {typeLabels[task.type] || task.type}
                          </td>
                        );
                      case 'schedule':
                        return (
                          <td style={{ padding: '0 10px', fontSize: '12.5px', color: '#475569', opacity: isDone ? 0.6 : 1, whiteSpace: 'nowrap', borderRight: '1px solid #f1f5f9' }}>
                            {scheduleLabels[task.scheduleType] || task.scheduleType}
                          </td>
                        );
                      case 'project':
                        return (
                          <td style={{ padding: '0 10px', fontSize: '12.5px', color: '#2563eb', fontWeight: '700', opacity: isDone ? 0.6 : 1, whiteSpace: 'nowrap', borderRight: '1px solid #f1f5f9' }}>
                            {task.projectName || '-'}
                          </td>
                        );
                      case 'customer':
                        return (
                          <td style={{ padding: '0 10px', fontSize: '12.5px', color: '#334155', opacity: isDone ? 0.6 : 1, whiteSpace: 'nowrap', borderRight: '1px solid #f1f5f9' }}>
                            {task.customerName || '-'}
                          </td>
                        );
                      case 'delegator':
                        return (
                          <td style={{ padding: '0 10px', fontSize: '12.5px', color: '#475569', opacity: isDone ? 0.6 : 1, whiteSpace: 'nowrap', borderRight: '1px solid #f1f5f9' }}>
                            {task.requesterName || '-'}
                          </td>
                        );
                      case 'assignee':
                        return (
                          <td style={{ padding: '0 10px', fontSize: '12.5px', fontWeight: '750', color: task.assigneeName === userProfile?.name ? '#2563eb' : '#0f172a', opacity: isDone ? 0.6 : 1, whiteSpace: 'nowrap', borderRight: '1px solid #f1f5f9' }}>
                            {task.assigneeName}
                          </td>
                        );
                      case 'startDate':
                        return (
                          <td style={{ padding: '0 10px', fontSize: '12px', color: '#475569', fontWeight: '600', opacity: isDone ? 0.6 : 1, whiteSpace: 'nowrap', borderRight: '1px solid #f1f5f9' }}>
                            {formatDateShort(task.startDate)}
                          </td>
                        );
                      case 'dueDate':
                        return (
                          <td style={{ padding: '0 10px', fontSize: '12px', fontWeight: isOverdue || isToday ? '750' : '600', whiteSpace: 'nowrap', borderRight: '1px solid #f1f5f9' }}>
                            {isOverdue ? (
                              <span style={{ color: '#ef4444', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                🚨 {formatDateShort(task.dueDate)}
                              </span>
                            ) : isToday ? (
                              <span style={{ color: '#ea580c', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                🔥 {formatDateShort(task.dueDate)}
                              </span>
                            ) : (
                              <span style={{ color: '#475569', opacity: isDone ? 0.6 : 1 }}>
                                {formatDateShort(task.dueDate)}
                              </span>
                            )}
                          </td>
                        );
                      case 'createdAt':
                        return (
                          <td style={{ padding: '0 10px', fontSize: '12px', color: '#64748b', fontWeight: '600', opacity: isDone ? 0.6 : 1, whiteSpace: 'nowrap', borderRight: '1px solid #f1f5f9' }}>
                            {formatDateShort(task.createdAt)}
                          </td>
                        );
                      case 'recurrence':
                        return (
                          <td style={{ padding: '0 10px', fontSize: '12px', color: '#475569', opacity: isDone ? 0.6 : 1, whiteSpace: 'nowrap', borderRight: '1px solid #f1f5f9' }}>
                            {task.recurrence || '-'}
                          </td>
                        );
                      case 'recurrenceEnd':
                        return (
                          <td style={{ padding: '0 10px', fontSize: '12px', color: '#64748b', fontWeight: '600', opacity: isDone ? 0.6 : 1, whiteSpace: 'nowrap', borderRight: '1px solid #f1f5f9' }}>
                            {formatDateShort(task.recurrenceEndDate)}
                          </td>
                        );
                      case 'link':
                        return (
                          <td style={{ padding: '0 10px', textAlign: 'center', fontSize: '13px', opacity: isDone ? 0.6 : 1, whiteSpace: 'nowrap', borderRight: '1px solid #f1f5f9' }}>
                            {task.externalFileLink ? (
                              <a 
                                href={task.externalFileLink} 
                                target="_blank" 
                                rel="noreferrer" 
                                onClick={e => e.stopPropagation()} 
                                title="외부 파일 링크 열기"
                                style={{ textDecoration: 'none' }}
                              >
                                🔗
                              </a>
                            ) : '-'}
                          </td>
                        );
                      case 'visibility':
                        return (
                          <td style={{ padding: '0 10px', fontSize: '12px', color: '#475569', opacity: isDone ? 0.6 : 1, whiteSpace: 'nowrap', borderRight: '1px solid #f1f5f9' }}>
                            {visibilityLabels[task.visibility] || task.visibility}
                          </td>
                        );
                      case 'updatedAt':
                        return (
                          <td style={{ padding: '0 10px', color: '#64748b', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap', borderRight: '1px solid #f1f5f9' }}>
                            {formatDateShort(task.updatedAt)}
                          </td>
                        );
                      case 'doneAt':
                        return (
                          <td style={{ padding: '0 10px', color: isDone ? '#059669' : '#94a3b8', fontSize: '12px', fontWeight: isDone ? '700' : '500', whiteSpace: 'nowrap', borderRight: '1px solid #f1f5f9' }}>
                            {formatDateShort(task.completedAt)}
                          </td>
                        );
                      case 'actions':
                        return (
                          <td style={{ padding: '0 10px', textAlign: 'center' }}>
                            <button 
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                if (window.confirm('정말 삭제하시겠습니까?')) deleteTask(task.id); 
                              }}
                              title="삭제"
                              style={{ 
                                background: 'transparent', 
                                border: 'none', 
                                borderRadius: '4px',
                                width: '28px',
                                height: '28px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#ef4444', 
                                cursor: 'pointer', 
                                fontSize: '14px',
                                transition: 'all 0.15s ease'
                              }}
                              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fee2e2'}
                              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                              🗑️
                            </button>
                          </td>
                        );
                      default:
                        return <td></td>;
                    }
                  };

                  return (
                    <tr 
                      key={task.id} 
                      className="task-row-hover" 
                      style={{ 
                        height: '46px', 
                        borderBottom: '1px solid #f1f5f9', 
                        backgroundColor: isDone ? '#f9fafb' : (idx % 2 === 1 ? '#fcfcfc' : '#ffffff'),
                        cursor: 'pointer',
                        transition: 'background-color 0.15s ease'
                      }} 
                      onClick={() => handleOpenTask(task)}
                    >
                      {renderedColumns.map(col => (
                        <React.Fragment key={col.key}>
                          {renderCell(col.key)}
                        </React.Fragment>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .table-scroll-container::-webkit-scrollbar {
          height: 10px;
          width: 10px;
        }
        .table-scroll-container::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 4px;
        }
        .table-scroll-container::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 4px;
          border: 2px solid #f1f5f9;
        }
        .table-scroll-container::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
        .task-row-hover:hover {
          background-color: #f0f9ff !important;
        }
        .task-row-hover:hover td {
          background-color: #f0f9ff !important;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>

      {/* ── 6. 완료 승인/확인 모달 ── */}
      {completingTask && (
        <TaskCompletionModal
          taskTitle={completingTask.title}
          assigneeName={completingTask.assigneeName}
          requesterName={completingTask.requesterName}
          onConfirm={async (comment) => {
            await updateTaskStatus(completingTask.id, 'DONE', comment);
            setCompletingTask(null);
          }}
          onCancel={() => setCompletingTask(null)}
        />
      )}

      {/* ── 7. 업무 수정 모달 ── */}
      {editingTask && (
        <TaskModal
          initialTask={editingTask}
          onClose={handleCloseTask}
          onSave={async (data) => {
            await updateTask({ ...editingTask, ...data } as Task);
            handleCloseTask();
          }}
          onDelete={async (taskId) => {
            await deleteTask(taskId);
            handleCloseTask();
          }}
        />
      )}

      {/* ── 8. 신규 업무 등록 모달 ── */}
      {isNewTaskModalOpen && (
        <TaskModal
          onClose={() => setIsNewTaskModalOpen(false)}
          onSave={async (data) => {
            await addTask(data as any);
            setIsNewTaskModalOpen(false);
          }}
        />
      )}
    </div>
  );
};
