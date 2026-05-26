import React from 'react';
import type { Task } from '../types';

interface Props {
  task: Task;
  onClick?: () => void;
}

export const TaskCard: React.FC<Props> = ({ task, onClick }) => {
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
          <span>마감 {task.dueDate}</span>
          {(task.commentCount ?? 0) > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#f59e0b', fontWeight: 600, fontSize: '0.75rem', background: '#fef3c7', padding: '2px 6px', borderRadius: '12px' }}>
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
