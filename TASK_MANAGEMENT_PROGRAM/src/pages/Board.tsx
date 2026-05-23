import React, { useState } from 'react';
import { dummyTasks } from '../store/dummyData';
import { TaskCard } from '../components/TaskCard';
import type { TaskStatus, Task } from '../types';
import { TaskModal } from '../components/TaskModal';

export const Board: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>(dummyTasks);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const todoTasks = tasks.filter(t => t.status === 'TODO');
  const inProgressTasks = tasks.filter(t => t.status === 'IN_PROGRESS');
  const holdingTasks = tasks.filter(t => t.status === 'HOLDING');
  const doneTasks = tasks.filter(t => t.status === 'DONE');

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('taskId', id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('taskId');
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
  };

  const handleSaveTask = (newTask: Partial<Task>) => {
    const task: Task = {
      id: `t${Date.now()}`,
      title: newTask.title || '',
      description: newTask.description || '',
      status: 'TODO',
      type: newTask.type || 'PROJECT',
      scheduleType: 'SELF',
      assigneeId: 'u1',
      assigneeName: '김대표',
      importance: 'B',
      urgency: 5,
      quadrant: newTask.quadrant || 'Q2',
      visibility: newTask.visibility || 'PUBLIC',
      createdAt: new Date().toISOString().split('T')[0],
      createdBy: 'u1',
      ...newTask
    };
    setTasks(prev => [...prev, task]);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="filter-bar">
        <select className="form-control" style={{ width: '130px' }}>
          <option>전체 담당자</option>
          <option>김대표</option>
          <option>이설계</option>
          <option>박생산</option>
        </select>
        <select className="form-control" style={{ width: '130px' }}>
          <option>전체 공개범위</option>
          <option>PUBLIC</option>
          <option>RESTRICTED</option>
          <option>PRIVATE</option>
        </select>
        <select className="form-control" style={{ width: '130px' }}>
          <option>업무 유형</option>
          <option>PROJECT</option>
          <option>DAILY</option>
          <option>PERIODIC</option>
          <option>DELEGATED</option>
        </select>
        <select className="form-control" style={{ width: '130px' }}>
          <option>일정 방식</option>
          <option>SELF</option>
          <option>SCHEDULED</option>
          <option>PERIODIC</option>
          <option>REQUESTED</option>
        </select>
        <select className="form-control" style={{ width: '130px' }}>
          <option>프로젝트 전체</option>
          <option>A사 신제품 개발</option>
          <option>B사 공정 개선</option>
        </select>
        <select className="form-control" style={{ width: '100px' }}>
          <option>사분면</option>
          <option>Q1</option>
          <option>Q2</option>
          <option>Q3</option>
          <option>Q4</option>
        </select>
        <input type="text" className="form-control" placeholder="검색어 입력..." style={{ width: '200px' }} />
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setIsModalOpen(true)}>업무 등록</button>
      </div>
      
      <div className="board-container">
        <div 
          className="board-column"
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, 'TODO')}
        >
          <div className="column-header">
            <span>업무대기</span>
            <span className="badge" style={{ background: '#e2e8f0' }}>{todoTasks.length}</span>
          </div>
          <div className="column-body">
            {todoTasks.map(task => (
              <div key={task.id} draggable onDragStart={(e) => handleDragStart(e, task.id)}>
                <TaskCard task={task} onClick={() => setSelectedTask(task)} />
              </div>
            ))}
          </div>
        </div>

        <div 
          className="board-column"
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, 'IN_PROGRESS')}
        >
          <div className="column-header">
            <span>업무중</span>
            <span className="badge" style={{ background: '#e2e8f0' }}>{inProgressTasks.length}</span>
          </div>
          <div className="column-body">
            {inProgressTasks.map(task => (
              <div key={task.id} draggable onDragStart={(e) => handleDragStart(e, task.id)}>
                <TaskCard task={task} onClick={() => setSelectedTask(task)} />
              </div>
            ))}
          </div>
        </div>

        <div 
          className="board-column"
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, 'DONE')}
        >
          <div className="column-header">
            <span>완료</span>
            <span className="badge" style={{ background: '#e2e8f0' }}>{doneTasks.length}</span>
          </div>
          <div className="column-body">
            {doneTasks.map(task => (
              <div key={task.id} draggable onDragStart={(e) => handleDragStart(e, task.id)}>
                <TaskCard task={task} onClick={() => setSelectedTask(task)} />
              </div>
            ))}
          </div>
        </div>

        <div 
          className="board-column"
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, 'HOLDING')}
        >
          <div className="column-header">
            <span>보류</span>
            <span className="badge" style={{ background: '#e2e8f0' }}>{holdingTasks.length}</span>
          </div>
          <div className="column-body">
            {holdingTasks.map(task => (
              <div key={task.id} draggable onDragStart={(e) => handleDragStart(e, task.id)}>
                <TaskCard task={task} onClick={() => setSelectedTask(task)} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {isModalOpen && <TaskModal onClose={() => setIsModalOpen(false)} onSave={handleSaveTask} />}
      
      {selectedTask && (
        <div className="modal-overlay" onClick={() => setSelectedTask(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3>{selectedTask.title}</h3>
              <div>
                <span className={`badge ${selectedTask.quadrant.toLowerCase()}`}>{selectedTask.quadrant}</span>
                <span className={`badge ${selectedTask.visibility.toLowerCase()}`} style={{ marginLeft: 8 }}>{selectedTask.visibility === 'PRIVATE' ? '🔒 PRIVATE' : selectedTask.visibility}</span>
              </div>
            </div>
            
            {selectedTask.visibility === 'PRIVATE' && selectedTask.assigneeId !== 'u1' && selectedTask.createdBy !== 'u1' ? (
              <div style={{ color: 'var(--q1-color)', fontWeight: 600, padding: '20px', textAlign: 'center', background: '#fee2e2', borderRadius: '8px' }}>
                🔒 이 업무는 제한공개입니다. 접근 권한이 없습니다.
              </div>
            ) : (
              <>
                <div style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
                  {selectedTask.description}
                </div>
                <div className="form-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.875rem' }}>
                  <div><strong>담당자:</strong> {selectedTask.assigneeName}</div>
                  <div><strong>요청자:</strong> {selectedTask.requesterName || '-'}</div>
                  <div><strong>업무유형:</strong> {selectedTask.type}</div>
                  <div><strong>일정방식:</strong> {selectedTask.scheduleType}</div>
                  <div><strong>마감일:</strong> {selectedTask.dueDate}</div>
                  <div><strong>프로젝트명:</strong> {selectedTask.projectName || '-'}</div>
                  <div><strong>고객명:</strong> {selectedTask.customerName || '-'}</div>
                </div>
              </>
            )}
            
            <div className="flex justify-between mt-4">
              <button className="btn" style={{ background: '#e2e8f0' }} onClick={() => setSelectedTask(null)}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
