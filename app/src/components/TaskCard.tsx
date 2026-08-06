import React from 'react';
import type { Task } from '../types';

interface Props {
  task: Task;
  onClick?: () => void;
}

export const TaskCard: React.FC<Props> = ({ task, onClick }) => {
  const isCommentNew = (lastCommentAt?: string): boolean => {
    if (!lastCommentAt) return false;
    try {
      const diff = Date.now() - new Date(lastCommentAt).getTime();
      return diff > 0 && diff < 24 * 60 * 60 * 1000;
    } catch {
      return false;
    }
  };

  const hasNewComment = isCommentNew(task.lastCommentAt);

  return (
    <div className="task-card" onClick={onClick}>
      <div className="task-card-title">
        {task.title}
        <span className={`q-badge ${task.quadrant.toLowerCase()}`}>{task.quadrant}</span>
      </div>
      <div className="task-tags">
        <span className="tag">{task.type === 'PROJECT' ? '프로젝트 업무' : task.type === 'DAILY' ? '일상 업무' : task.type === 'PERIODIC' ? '주기 업무' : '위임 업무'}</span>
        <span className="tag">{task.scheduleType === 'SELF' ? '스스로 계획' : task.scheduleType === 'SCHEDULED' ? '일정 기반' : task.scheduleType === 'PERIODIC' ? '반복 주기' : '요청 기반'}</span>
        <span className="tag">{task.assigneeName}</span>
      </div>
      <div className="task-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {(() => {
            const todayStr = new Date().toISOString().split('T')[0];
            const isDone = task.status === 'DONE';
            const hasDueDate = !!task.dueDate;
            const isOverdue = hasDueDate && !isDone && Boolean(task.dueDate && task.dueDate < todayStr);
            const isTodayDue = hasDueDate && !isDone && task.dueDate === todayStr;
            const isNoDueDate = !hasDueDate && !isDone;
            const blinkClass = isOverdue ? 'blink-due-red' : isTodayDue ? 'blink-due-amber' : '';

            return (
              <span
                className={blinkClass}
                style={{
                  fontSize: '0.72rem',
                  fontWeight: (isOverdue || isTodayDue || isNoDueDate) ? 800 : 600,
                  color: isOverdue ? '#ef4444' : isTodayDue ? '#d97706' : isNoDueDate ? '#ef4444' : '#475569',
                  background: isOverdue ? '#fef2f2' : isTodayDue ? '#fffbeb' : isNoDueDate ? '#fef2f2' : '#f1f5f9',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  border: isNoDueDate ? '1px solid #fecaca' : isOverdue ? '1px solid #fecaca' : isTodayDue ? '1px solid #fef08a' : '1px solid #cbd5e1',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '2px'
                }}
              >
                {isOverdue ? `🚨 마감초과 ${task.dueDate}` : isTodayDue ? `🔥 오늘마감 ${task.dueDate}` : isNoDueDate ? '🚨 마감일 등록요..' : `📅 마감 ${task.dueDate}`}
              </span>
            );
          })()}
          {(task.commentCount ?? 0) > 0 && (
            <div 
              className={hasNewComment ? 'blink-badge' : ''}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#f59e0b', fontWeight: 600, fontSize: '0.75rem', background: '#fef3c7', padding: '2px 6px', borderRadius: '12px' }}
            >
              💬 <span>{(task.commentCount ?? 0)}</span>
            </div>
          )}
        </div>
        <div>
          {task.visibility === 'PRIVATE' && <span style={{ color: 'var(--q1-color)', marginRight: 4 }}>🔒</span>}
          {task.projectName || task.customerName || '담당자 지정'}
        </div>
      </div>
    </div>
  );
};
