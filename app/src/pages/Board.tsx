import React, { useState } from 'react';
import { useTasks } from '../contexts/TaskContext';
import { useAuth } from '../contexts/AuthContext';
import { TaskCard } from '../components/TaskCard';
import type { TaskStatus, Task } from '../types';
import { TaskModal } from '../components/TaskModal';

const STATUS_COLUMNS: { status: TaskStatus; label: string; color: string; bg: string }[] = [
  { status: 'TODO',        label: '업무대기', color: '#64748b', bg: '#f1f5f9' },
  { status: 'IN_PROGRESS', label: '업무중',   color: '#2563eb', bg: '#eff6ff' },
  { status: 'DONE',        label: '완료',     color: '#16a34a', bg: '#f0fdf4' },
  { status: 'HOLDING',     label: '보류',     color: '#d97706', bg: '#fffbeb' },
];

export const Board: React.FC = () => {
  const { tasks, updateTaskStatus, addTask } = useTasks();
  const { userProfile } = useAuth();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [dragOverCol, setDragOverCol] = useState<TaskStatus | null>(null);
  const [showOnlyMine, setShowOnlyMine] = useState(false);

  // Filter: show only my tasks if toggled
  const visibleTasks = showOnlyMine
    ? tasks.filter(t => t.assigneeId === userProfile?.id || t.assigneeName === userProfile?.name)
    : tasks;

  const getColTasks = (status: TaskStatus) => visibleTasks.filter(t => t.status === status);

  /* ─── Drag handlers ─── */
  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('taskId', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCol(status);
  };

  const handleDragLeave = () => setDragOverCol(null);

  const handleDrop = async (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    setDragOverCol(null);
    const id = e.dataTransfer.getData('taskId');
    if (id) await updateTaskStatus(id, status);
  };

  /* ─── Quick add ─── */
  const handleSaveTask = async (newTask: Partial<Task>) => {
    await addTask({
      title: newTask.title || '',
      description: newTask.description || '',
      status: 'TODO',
      type: newTask.type || 'PROJECT',
      scheduleType: 'SELF',
      assigneeId: userProfile?.id || '',
      assigneeName: userProfile?.name || '관리자',
      importance: 'B',
      urgency: 5,
      quadrant: newTask.quadrant || 'Q2',
      visibility: newTask.visibility || 'PUBLIC',
      createdBy: userProfile?.id || '',
      ...newTask
    } as any);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
      {/* Filter Bar */}
      <div style={{ padding: '14px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px', background: '#fff' }}>
        <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#111827' }}>📋 업무 보드</h2>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
          color: showOnlyMine ? '#2563eb' : '#6b7280',
          background: showOnlyMine ? '#eff6ff' : '#f1f5f9',
          padding: '5px 12px', borderRadius: '20px', border: showOnlyMine ? '1px solid #93c5fd' : '1px solid #e2e8f0',
          transition: 'all 0.2s'
        }}>
          <input type="checkbox" checked={showOnlyMine} onChange={e => setShowOnlyMine(e.target.checked)}
            style={{ accentColor: '#2563eb', width: '14px', height: '14px' }} />
          내 업무만 보기
        </label>
        <span style={{ fontSize: '12px', color: '#9ca3af', marginLeft: '4px' }}>
          총 {visibleTasks.length}건
        </span>
        <button
          onClick={() => setIsModalOpen(true)}
          style={{ marginLeft: 'auto', background: '#2563eb', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}
        >
          ＋ 업무 등록
        </button>
      </div>

      {/* Kanban Columns */}
      <div style={{ display: 'flex', flex: 1, gap: '16px', padding: '20px 24px', overflowX: 'auto', overflowY: 'hidden' }}>
        {STATUS_COLUMNS.map(col => {
          const colTasks = getColTasks(col.status);
          const isDragOver = dragOverCol === col.status;
          return (
            <div
              key={col.status}
              onDragOver={e => handleDragOver(e, col.status)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, col.status)}
              style={{
                flex: '1 1 0', minWidth: '240px', maxWidth: '340px',
                display: 'flex', flexDirection: 'column',
                background: isDragOver ? '#dbeafe' : col.bg,
                borderRadius: '12px',
                border: isDragOver ? '2px dashed #3b82f6' : '2px solid transparent',
                transition: 'all 0.2s',
                boxShadow: isDragOver ? '0 0 0 3px rgba(59,130,246,0.15)' : '0 1px 4px rgba(0,0,0,0.05)',
              }}
            >
              {/* Column Header */}
              <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: `2px solid ${col.color}20` }}>
                <span style={{ fontWeight: 800, fontSize: '13px', color: col.color }}>{col.label}</span>
                <span style={{
                  background: col.color, color: '#fff', borderRadius: '10px',
                  fontSize: '11px', fontWeight: 700, padding: '1px 8px', minWidth: '22px', textAlign: 'center'
                }}>{colTasks.length}</span>
              </div>

              {/* Cards */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {colTasks.map(task => {
                  const isOwn = task.assigneeId === userProfile?.id || task.assigneeName === userProfile?.name;
                  return (
                    <div
                      key={task.id}
                      draggable={isOwn}
                      onDragStart={isOwn ? (e) => handleDragStart(e, task.id) : undefined}
                      style={{
                        cursor: isOwn ? 'grab' : 'default',
                        opacity: isOwn ? 1 : 0.7,
                        borderRadius: '8px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                        transition: 'box-shadow 0.15s, transform 0.15s',
                      }}
                      onMouseEnter={e => { if (isOwn) (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)'; }}
                    >
                      <TaskCard task={task} onClick={() => setSelectedTask(task)} />
                      {/* 내 업무일 때: 빠른 상태 이동 버튼 */}
                      {isOwn && (
                        <div style={{ display: 'flex', gap: '4px', padding: '4px 8px 8px', background: '#fff', borderRadius: '0 0 8px 8px' }}>
                          {STATUS_COLUMNS.filter(c => c.status !== col.status).slice(0, 3).map(target => (
                            <button
                              key={target.status}
                              onClick={async (e) => { e.stopPropagation(); await updateTaskStatus(task.id, target.status); }}
                              style={{
                                flex: 1, fontSize: '10px', fontWeight: 600, border: 'none', borderRadius: '4px',
                                padding: '3px 0', cursor: 'pointer',
                                background: target.bg, color: target.color,
                                transition: 'opacity 0.15s'
                              }}
                            >
                              → {target.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {colTasks.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#cbd5e1', fontSize: '12px', padding: '30px 0' }}>
                    여기에 드래그하세요
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {isModalOpen && <TaskModal onClose={() => setIsModalOpen(false)} onSave={handleSaveTask} />}

      {selectedTask && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setSelectedTask(null)}>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', maxWidth: '480px', width: '90%', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>{selectedTask.title}</h3>
              <button onClick={() => setSelectedTask(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#6b7280' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
              <div><span style={{ color: '#6b7280' }}>담당자:</span> <strong>{selectedTask.assigneeName}</strong></div>
              <div><span style={{ color: '#6b7280' }}>마감일:</span> <strong>{selectedTask.dueDate || '-'}</strong></div>
              <div><span style={{ color: '#6b7280' }}>유형:</span> {selectedTask.type}</div>
              <div><span style={{ color: '#6b7280' }}>사분면:</span> {selectedTask.quadrant}</div>
              {selectedTask.projectName && <div style={{ gridColumn: 'span 2' }}><span style={{ color: '#6b7280' }}>프로젝트:</span> {selectedTask.projectName}</div>}
              {selectedTask.description && <div dangerouslySetInnerHTML={{ __html: selectedTask.description }} style={{ gridColumn: 'span 2', color: '#475569', marginTop: '8px', overflowX: 'auto' }} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
