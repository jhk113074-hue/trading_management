import React, { useState, useRef, useMemo } from 'react';
import { useTasks } from '../contexts/TaskContext';
import { useAuth } from '../contexts/AuthContext';
import { TaskModal } from '../components/TaskModal';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import type { Task, User } from '../types';

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

export const TaskList: React.FC = () => {
  const { tasks, updateTask, updateTaskStatus, addTask, deleteTask } = useTasks();
  const { userProfile } = useAuth();
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [quickTitle, setQuickTitle] = useState('');
  const [users, setUsers] = useState<User[]>([]);

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

  // Filtering & Sorting State
  const [filterAssignee, setFilterAssignee] = useState('전체 담당자');
  const [filterType, setFilterType] = useState('모든 유형');
  const [filterStatus, setFilterStatus] = useState('모든 상태');
  
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
      
      // 완료되지 않은 일(미완료 업무)은 날짜 필터를 우회하여 화면에 항상 계속 표시합니다.
      if (!isDone) return true;

      // 완료된(DONE) 업무에 대한 날짜별 필터링 처리
      const completedAt = task.completedAt ? new Date(task.completedAt) : null;
      if (!completedAt) return false;

      if (dateMode === 'daily') {
        const compStr = completedAt.toISOString().split('T')[0];
        return compStr === selectedDate;
      } else if (dateMode === 'weekly') {
        const thisWeekStart = getWeekRange(0).start;
        const completedWeek = Math.floor((completedAt.getTime() - thisWeekStart.getTime()) / (7 * 24 * 3600 * 1000));
        return completedWeek === weekOffset;
      } else {
        // 기간 검색
        const compStr = completedAt.toISOString().split('T')[0];
        return compStr >= startDate && compStr <= endDate;
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
      const statusKey = Object.keys(statusLabels).find(k => statusLabels[k] === filterStatus);
      if (statusKey) result = result.filter(t => t.status === statusKey);
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
      // Default sorting: importance 'A' first, then 'B', 'C', 'D'. If importance is equal, newest first.
      result.sort((a, b) => {
        const impA = a.importance || 'Z';
        const impB = b.importance || 'Z';
        if (impA !== impB) {
          return impA.localeCompare(impB);
        }
        const dateA = a.createdAt || '';
        const dateB = b.createdAt || '';
        return dateB.localeCompare(dateA);
      });
    }
    return result;
  }, [tasks, filterAssignee, filterType, filterStatus, dateMode, selectedDate, startDate, endDate, weekOffset, sortField, sortDirection]);

  const [colWidths, setColWidths] = useState<Record<string, number>>({
    select: 35, urgency_icon: 30, urgency: 55, quadrant: 45, title: 280,
    status: 90, type: 80, schedule: 80, project: 120, customer: 80,
    delegator: 70, assignee: 70, startDate: 80, dueDate: 80,
    recurrence: 70, recurrenceEnd: 70, link: 40, visibility: 80,
    updatedAt: 80, doneAt: 80, actions: 60
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
      await addTask({
        title: quickTitle, status: 'TODO', type: 'PROJECT', scheduleType: 'SELF',
        importance: 'B', urgency: 5, quadrant: 'Q2',
        assigneeId: userProfile?.id || '', assigneeName: userProfile?.name || '관리자',
        createdAt: new Date().toISOString()
      } as any);
      setQuickTitle('');
    } catch (e) {
      console.error(e);
      alert('업무 등록 중 오류가 발생했습니다.');
    }
  };

  const columns = [
    { key: 'select', label: '□' }, { key: 'urgency_icon', label: '!' }, { key: 'urgency', label: '긴급' },
    { key: 'quadrant', label: 'Q' }, { key: 'title', label: '제목 *' }, { key: 'status', label: '상태' },
    { key: 'type', label: '유형' }, { key: 'schedule', label: '일정방식' }, { key: 'project', label: '프로젝트명' },
    { key: 'customer', label: '고객/요청' }, { key: 'delegator', label: '위임자' }, { key: 'assignee', label: '담당자' },
    { key: 'startDate', label: '시작일' }, { key: 'dueDate', label: '마감일' }, { key: 'recurrence', label: '주기' },
    { key: 'recurrenceEnd', label: '종료일' }, { key: 'link', label: '링크' }, { key: 'visibility', label: '공개범위' },
    { key: 'updatedAt', label: '수정일' }, { key: 'doneAt', label: '완료일' }, { key: 'actions', label: '관리' }
  ];



  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#fdfdfd' }}>
        <div style={{ padding: '16px 30px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: '1.3rem', fontWeight: '900', color: '#111827', margin: 0 }}>전체 업무 리스트</h2>

          {/* ── 조회 모드 탭 ── */}
          <div style={{ display: 'flex', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', background: '#fff', marginLeft: '12px' }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', background: '#fff', marginLeft: '8px' }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', background: '#fff', marginLeft: '8px' }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '8px', flexWrap: 'wrap' }}>
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
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <select className="btn" style={{ padding: '6px 12px' }} value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}>
              <option>전체 담당자</option>
              {users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
            </select>
            <select className="btn" style={{ padding: '6px 12px' }} value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option>모든 유형</option>
              {Object.values(typeLabels).map(l => <option key={l}>{l}</option>)}
            </select>
            <select className="btn" style={{ padding: '6px 12px' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option>모든 상태</option>
              {Object.values(statusLabels).map(l => <option key={l}>{l}</option>)}
            </select>
          </div>
          <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#6b7280' }}>총 {tasks.length}건 / {dateMode === 'daily' ? '지정일' : dateMode === 'weekly' ? '선택주' : '선택 기간'} 결과 {filteredAndSortedTasks.length}건</div>
        </div>
      </div>

      {/* 가로 스크롤 최적화 컨테이너 */}
      <div className="table-scroll-container" style={{ flex: 1, overflow: 'auto', padding: '0 30px 30px' }}>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', width: 'max-content', minWidth: '100%' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '0.82rem', tableLayout: 'fixed', width: 'max-content', backgroundColor: 'white' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#f9fafb' }}>
              <tr style={{ height: '42px', borderBottom: '1px solid #e5e7eb' }}>
                {columns.map(col => (
                  <th key={col.key} onClick={() => handleSort(col.key)} style={{ 
                    width: colWidths[col.key], padding: '0 8px', textAlign: 'left', color: '#374151', fontWeight: '700', borderRight: '1px solid #f3f4f6', position: 'relative', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    cursor: (col.key === 'select' || col.key === 'actions') ? 'default' : 'pointer',
                    ...(col.key === 'title' ? { position: 'sticky', left: 0, zIndex: 30, backgroundColor: '#f9fafb', borderRight: '2px solid #e5e7eb' } : {})
                  }}>
                    {col.label} {sortField === col.key ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
                    <div 
                      onMouseDown={(e) => onMouseDown(col.key, e)} 
                      style={{ position: 'absolute', right: -3, top: 0, width: '6px', height: '100%', cursor: 'col-resize', zIndex: 50, transition: 'background-color 0.2s' }} 
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#3b82f6'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    />
                  </th>
                ))}
              </tr>
              {/* 인라인 추가 행 - 원본 드롭다운 반영 */}
              <tr style={{ backgroundColor: '#f0fdf4', height: '48px', borderBottom: '2px solid #bbf7d0' }}>
                <td style={{ textAlign: 'center' }}><input type="checkbox" disabled /></td>
                <td style={{ textAlign: 'center' }}>
                  <button onClick={handleQuickAdd} style={{ backgroundColor: '#22c55e', color: 'white', border: 'none', borderRadius: '6px', width: '24px', height: '24px', cursor: 'pointer' }}>+</button>
                </td>
                <td style={{ padding: '0 12px' }}>5</td>
                <td style={{ padding: '0 12px' }}>Q2</td>
                <td style={{ padding: '0 8px', position: 'sticky', left: 0, zIndex: 25, backgroundColor: '#f0fdf4', borderRight: '2px solid #bbf7d0' }}>
                  <input 
                    placeholder="업무명 입력 후 + 클릭" 
                    value={quickTitle}
                    onChange={e => setQuickTitle(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleQuickAdd()}
                    style={{ width: '100%', padding: '6px 8px', border: '1px solid #86efac', borderRadius: '8px', outline: 'none', fontSize: '0.8rem' }} 
                  />
                </td>
                <td><select style={{ width: '100%', border: 'none', background: 'transparent' }}><option>시작 안 함</option></select></td>
                <td><select style={{ width: '100%', border: 'none', background: 'transparent' }}><option>프로젝트</option></select></td>
                <td><select style={{ width: '100%', border: 'none', background: 'transparent' }}><option>일정기반</option></select></td>
                {Array(13).fill(0).map((_, i) => <td key={i} style={{ borderRight: '1px solid #f3f4f6' }}></td>)}
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedTasks.map((task, idx) => {
                const isDone = task.status === 'DONE';
                return (
                  <tr key={task.id} className="task-row-hover" style={{ height: '40px', borderBottom: '1px solid #f1f5f9', backgroundColor: isDone ? '#f9fafb' : (idx % 2 === 1 ? '#fcfcfc' : 'white') }} onClick={() => setEditingTask(task)}>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isDone}
                        onClick={e => e.stopPropagation()}
                        onChange={async (e) => {
                          e.stopPropagation();
                          await updateTaskStatus(task.id, isDone ? 'TODO' : 'DONE');
                        }}
                        style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: '#16a34a' }}
                      />
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: '800', color: task.importance === 'A' ? '#ef4444' : '#94a3b8' }}>{task.importance}</td>
                    <td style={{ padding: '0 12px' }}>{task.urgency}</td>
                    <td style={{ padding: '0 12px' }}><span className={`q-badge ${task.quadrant?.toLowerCase() || 'q2'}`}>{task.quadrant || 'Q2'}</span></td>
                    <td style={{ padding: '0 8px', fontWeight: '600', color: isDone ? '#9ca3af' : '#111827', position: 'sticky', left: 0, zIndex: 10, backgroundColor: isDone ? '#f9fafb' : (idx % 2 === 1 ? '#fcfcfc' : 'white'), borderRight: '2px solid #f1f5f9' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        textDecoration: isDone ? 'line-through' : 'none',
                        opacity: isDone ? 0.6 : 1
                      }}>
                        {task.title}
                        {(task.commentCount ?? 0) > 0 && (
                          <span style={{ fontSize: '0.65rem', background: '#fef3c7', color: '#d97706', padding: '1px 4px', borderRadius: '10px', display: 'inline-flex', alignItems: 'center', gap: '2px', fontWeight: '800' }}>💬 {task.commentCount}</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '0 12px' }}>
                      <span style={{ 
                        color: isDone ? '#16a34a' : task.status === 'IN_PROGRESS' ? '#3b82f6' : task.status === 'HOLDING' ? '#ca8a04' : '#059669',
                        fontWeight: '700',
                        textDecoration: isDone ? 'line-through' : 'none'
                      }}>
                        {statusLabels[task.status] || task.status}
                      </span>
                    </td>
                    <td style={{ padding: '0 12px', opacity: isDone ? 0.5 : 1 }}>{typeLabels[task.type] || task.type}</td>
                    <td style={{ padding: '0 12px', opacity: isDone ? 0.5 : 1 }}>{scheduleLabels[task.scheduleType] || task.scheduleType}</td>
                    <td style={{ padding: '0 12px', color: '#0d9488', fontWeight: '600', opacity: isDone ? 0.5 : 1 }}>{task.projectName}</td>
                    <td style={{ padding: '0 12px', opacity: isDone ? 0.5 : 1 }}>{task.customerName || '-'}</td>
                    <td style={{ padding: '0 12px', opacity: isDone ? 0.5 : 1 }}>{task.requesterName || '-'}</td>
                    <td style={{ padding: '0 12px', fontWeight: '700', opacity: isDone ? 0.5 : 1 }}>{task.assigneeName}</td>
                    <td style={{ padding: '0 12px', opacity: isDone ? 0.5 : 1 }}>{task.startDate || '-'}</td>
                    <td style={{ padding: '0 12px', opacity: isDone ? 0.5 : 1 }}>{task.dueDate || '-'}</td>
                    <td style={{ padding: '0 12px', opacity: isDone ? 0.5 : 1 }}>{task.recurrence || '-'}</td>
                    <td style={{ padding: '0 12px', opacity: isDone ? 0.5 : 1 }}>{task.recurrenceEndDate || '-'}</td>
                    <td style={{ padding: '0 12px', textAlign: 'center', opacity: isDone ? 0.5 : 1 }}>{task.externalFileLink ? '🔗' : '-'}</td>
                    <td style={{ padding: '0 12px', opacity: isDone ? 0.5 : 1 }}>{visibilityLabels[task.visibility] || task.visibility}</td>
                    <td style={{ padding: '0 12px', color: '#9ca3af', fontSize: '0.7rem' }}>{task.updatedAt?.split('T')[0]}</td>
                    <td style={{ padding: '0 12px', color: isDone ? '#16a34a' : '#9ca3af', fontSize: '0.7rem', fontWeight: isDone ? 700 : 400 }}>{task.completedAt?.split('T')[0]}</td>
                    <td style={{ padding: '0 12px', textAlign: 'center' }}>
                      <button onClick={(e) => { e.stopPropagation(); if (window.confirm('정말 삭제하시겠습니까?')) deleteTask(task.id); }}
                        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}>삭제</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .table-scroll-container::-webkit-scrollbar {
          height: 12px;
        }
        .table-scroll-container::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 6px;
        }
        .table-scroll-container::-webkit-scrollbar-thumb {
          background: #d4d4d4;
          border-radius: 6px;
          border: 3px solid #f1f1f1;
        }
        .table-scroll-container::-webkit-scrollbar-thumb:hover {
          background: #a3a3a3;
        }
        .task-row-hover:hover {
          background-color: #f0f9ff !important;
        }
        .task-row-hover:hover td {
          background-color: #f0f9ff !important;
        }
      `}</style>

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
