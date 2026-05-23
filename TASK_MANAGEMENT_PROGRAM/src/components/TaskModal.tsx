import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, orderBy, doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import type { Task, Visibility, Quadrant, TaskType, ScheduleType, TaskStatus, User } from '../types';
import { validateTask } from '../utils/businessRules';

interface Props {
  initialTask?: Task;
  onClose: () => void;
  onSave: (task: Partial<Task>) => void;
}

export const TaskModal: React.FC<Props> = ({ initialTask, onClose, onSave }) => {
  const [title, setTitle] = useState(initialTask?.title || '');
  const [description, setDescription] = useState(initialTask?.description || '');
  const [visibility, setVisibility] = useState<Visibility>(initialTask?.visibility || 'PUBLIC');
  const [type, setType] = useState<TaskType>(initialTask?.type || 'PROJECT');
  const [scheduleType, setScheduleType] = useState<ScheduleType>(initialTask?.scheduleType || 'SELF');
  const [status, setStatus] = useState<TaskStatus>(initialTask?.status || 'TODO');
  const [importance, setImportance] = useState<string>(initialTask?.importance ? String(initialTask.importance) : 'B');
  const [urgency, setUrgency] = useState(initialTask?.urgency || 5);
  const [dueDate, setDueDate] = useState(initialTask?.dueDate || '');
  const [projectName, setProjectName] = useState(initialTask?.projectName || '');
  const [customerName, setCustomerName] = useState(initialTask?.customerName || '');
  
  const [requesterName] = useState(initialTask?.requesterName || '');
  const [requesterId, setRequesterId] = useState(initialTask?.requesterId || '');
  
  const [assigneeName] = useState(initialTask?.assigneeName || '');
  const [assigneeId, setAssigneeId] = useState(initialTask?.assigneeId || '');

  const [repeatCycle, setRepeatCycle] = useState(initialTask?.recurrence || '매주');
  const [startDate, setStartDate] = useState(initialTask?.startDate || '');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(initialTask?.recurrenceEndDate || '');

  const [externalFileLink, setExternalFileLink] = useState(initialTask?.externalFileLink || '');
  const [relatedUsers, setRelatedUsers] = useState(initialTask?.allowedUserIds?.join(', ') || '');
  
  const [users, setUsers] = useState<User[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { userProfile } = useAuth();
  // const { attachments, uploadProgress, uploadFile, deleteAttachment, getFileUrl } = useAttachments(initialTask?.id);

  useEffect(() => {
    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usersData: User[] = [];
      snapshot.forEach(doc => {
        usersData.push({ id: doc.id, ...doc.data() } as User);
      });
      setUsers(usersData);
    });

    if (!initialTask?.id) return unsubscribeUsers;
    
    const q = query(collection(db, 'taskComments'), where('taskId', '==', initialTask.id), orderBy('createdAt', 'asc'));
    const unsubscribeComments = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setComments(fetched);
    });
    
    return () => {
      unsubscribeUsers();
      unsubscribeComments();
    };
  }, [initialTask?.id]);

  // Backwards compatibility for old tasks without IDs
  useEffect(() => {
    if (users.length > 0) {
      if (!assigneeId && assigneeName) {
        const match = users.find(u => u.name === assigneeName);
        if (match) setAssigneeId(match.id);
      }
      if (!requesterId && requesterName) {
        const match = users.find(u => u.name === requesterName);
        if (match) setRequesterId(match.id);
      }
    }
  }, [users, assigneeId, assigneeName, requesterId, requesterName]);

  const handleAddComment = async () => {
    if (!newComment.trim() || !initialTask?.id || !userProfile) return;
    
    const commentObj = {
      taskId: initialTask.id,
      content: newComment,
      createdBy: userProfile.id,
      creatorName: userProfile.name,
      createdAt: new Date().toISOString()
    };

    // 1. 입력창 즉시 초기화
    setNewComment('');
    // 2. 화면(로컬 상태)에 즉시 반영 (Optimistic UI)
    setComments(prev => [...prev, { id: 'temp-' + Date.now(), ...commentObj }]);

    try {
      await addDoc(collection(db, 'taskComments'), commentObj);
      
      const taskRef = doc(db, 'tasks', initialTask.id);
      await updateDoc(taskRef, {
        commentCount: increment(1)
      });
      
    } catch (e) {
      console.error(e);
      alert('댓글 등록 중 오류가 발생했습니다.');
    }
  };

  // Auto-calculate Quadrant: importance A=high, B=mid, C=low; urgency >=6 = high
  const calculateQuadrant = (imp: string, urg: number): Quadrant => {
    const impHigh = imp === 'A';
    const urgHigh = urg >= 6;
    if (impHigh && urgHigh) return 'Q1';
    if (impHigh && !urgHigh) return 'Q2';
    if (!impHigh && urgHigh) return 'Q3';
    return 'Q4';
  };
  const currentQuadrant = calculateQuadrant(importance, urgency);

  const [errorMsg, setErrorMsg] = useState('');

  const handleSave = async () => {
    const reqUser = users.find(u => u.id === requesterId);
    const reqName = reqUser ? reqUser.name : (requesterId ? requesterName : '');

    const assUser = users.find(u => u.id === assigneeId);
    const assName = assUser ? assUser.name : (assigneeId ? assigneeName : '');

    const taskData: any = {
      id: initialTask?.id,
      title, 
      description, 
      status,
      visibility, 
      type, 
      scheduleType,
      importance,
      urgency,
      dueDate,
      projectName,
      customerName,
      requesterId,
      requesterName: reqName,
      assigneeId,
      assigneeName: assName,
      startDate,
      recurrenceEndDate,
      externalFileLink,
      recurrence: type === 'PERIODIC' ? repeatCycle : null,
      allowedUserIds: relatedUsers.split(',').map(u => u.trim()).filter(Boolean)
    };

    const validationError = validateTask(taskData);
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(taskData);
      onClose();
    } catch (e) {
      console.error(e);
      setErrorMsg('저장 중 오류가 발생했습니다. 콘솔을 확인해주세요.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="modal-content"
        style={{ maxWidth: '850px', padding: 0, overflow: 'hidden' }}
      >
        {/* Header */}
        <div style={{
          padding: '12px 20px', borderBottom: '1px solid #f1f5f9',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: '#f8fafc'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
              {initialTask ? '업무 상세 정보' : '새로운 업무 등록'}
            </h3>
            {initialTask?.id && <span style={{ fontSize: '0.75rem', color: '#64748b', background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px' }}>ID: {initialTask.id.slice(0,8)}...</span>}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', borderRadius: '4px',
              width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#64748b', transition: 'all 0.2s',
              fontSize: '1.1rem', lineHeight: 1
            }}
            onMouseOver={e => e.currentTarget.style.background = '#e2e8f0'}
            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {errorMsg && (
            <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', color: '#dc2626', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>⚠️</span> {errorMsg}
            </div>
          )}

          {/* Title Area */}
          <div>
            <input
              value={title} onChange={e => setTitle(e.target.value)}
              placeholder="업무명을 입력하세요..."
              style={{
                width: '100%', border: 'none', borderBottom: '2px solid #e2e8f0',
                fontSize: '1.2rem', fontWeight: 700, padding: '4px 0 8px 0', outline: 'none',
                color: '#0f172a', transition: 'border-color 0.2s', background: 'transparent'
              }}
              onFocus={e => e.target.style.borderColor = '#0d9488'}
              onBlur={e => e.target.style.borderColor = '#e2e8f0'}
            />
          </div>

          {/* Description */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>업무설명 및 메모</label>
            <textarea
              rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="상세 설명이나 메모를 입력하세요..."
              style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem', resize: 'vertical', fontFamily: 'inherit' }}
              onFocus={e => e.target.style.borderColor = '#0d9488'}
              onBlur={e => e.target.style.borderColor = '#cbd5e1'}
            />
          </div>

          {/* Priority Box */}
          <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', gap: '20px', alignItems: 'center' }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', minWidth: '40px' }}>중요도</label>
              <div style={{ display: 'flex', background: '#e2e8f0', padding: '2px', borderRadius: '6px', flex: 1 }}>
                {(['A', 'B', 'C'] as const).map(v => (
                  <button
                    key={v} onClick={() => setImportance(v)}
                    style={{
                      flex: 1, padding: '4px 0', border: 'none', borderRadius: '4px', fontWeight: 700, fontSize: '0.85rem',
                      background: importance === v ? '#ffffff' : 'transparent',
                      color: importance === v ? (v === 'A' ? '#ef4444' : v === 'B' ? '#3b82f6' : '#64748b') : '#64748b',
                      boxShadow: importance === v ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                      cursor: 'pointer', transition: 'all 0.2s'
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            
            <div style={{ width: '1px', background: '#cbd5e1', height: '24px' }} />

            <div style={{ flex: 1.5, display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', whiteSpace: 'nowrap' }}>
                긴급도 <span style={{ color: urgency >= 6 ? '#ef4444' : '#3b82f6', marginLeft: '4px' }}>{urgency}</span>
              </label>
              <input
                type="range" min="1" max="10" step="1"
                value={urgency} onChange={e => setUrgency(Number(e.target.value))}
                style={{ flex: 1, cursor: 'pointer', accentColor: urgency >= 6 ? '#ef4444' : '#3b82f6', height: '4px' }}
              />
            </div>

            <div style={{ width: '1px', background: '#cbd5e1', height: '24px' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>우선순위</span>
              <div style={{
                background: currentQuadrant === 'Q1' ? '#fee2e2' : currentQuadrant === 'Q2' ? '#dbeafe' : currentQuadrant === 'Q3' ? '#fef9c3' : '#f1f5f9',
                color: currentQuadrant === 'Q1' ? '#ef4444' : currentQuadrant === 'Q2' ? '#3b82f6' : currentQuadrant === 'Q3' ? '#ca8a04' : '#64748b',
                fontWeight: 800, fontSize: '1rem', padding: '2px 8px', borderRadius: '6px', border: '1px solid currentColor'
              }}>
                {currentQuadrant}
              </div>
            </div>
          </div>

          {/* Details Row 1 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>프로젝트명</label>
              <input style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem' }} value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="선택사항" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>고객명</label>
              <input style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem' }} value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="선택사항" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>위임자 (요청자)</label>
              <select style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem', backgroundColor: '#fff' }} value={requesterId} onChange={e => setRequesterId(e.target.value)}>
                <option value="">선택안함</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name} {u.position || ''}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>수임자 (담당자)</label>
              <select style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem', backgroundColor: '#fff' }} value={assigneeId} onChange={e => setAssigneeId(e.target.value)}>
                <option value="">담당자 지정</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name} {u.position || ''}</option>)}
              </select>
            </div>
          </div>

          {/* Details Row 2 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>시작일</label>
              <input type="date" style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem' }} value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>마감일</label>
              <input type="date" style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem' }} value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>업무 유형</label>
              <select style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem' }} value={type} onChange={e => setType(e.target.value as TaskType)}>
                <option value="PROJECT">📁 프로젝트</option>
                <option value="DAILY">📝 일상업무</option>
                <option value="PERIODIC">🔄 주기업무</option>
                <option value="DELEGATED">🤝 위임업무</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>일정 방식</label>
              <select style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem' }} value={scheduleType} onChange={e => setScheduleType(e.target.value as ScheduleType)}>
                <option value="SELF">스스로 계획</option>
                <option value="SCHEDULED">일정기반</option>
                <option value="PERIODIC">반복주기</option>
                <option value="REQUESTED">담당자 지정</option>
              </select>
            </div>
          </div>

          {/* Settings Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>공개범위</label>
              <select style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem' }} value={visibility} onChange={e => setVisibility(e.target.value as Visibility)}>
                <option value="PUBLIC">🌐 전체 공개</option>
                <option value="RESTRICTED">👥 관련자 공개</option>
                <option value="PRIVATE">🔒 비공개</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>상태</label>
              <select style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem', fontWeight: 600, color: status === 'DONE' ? '#16a34a' : status === 'HOLDING' ? '#ca8a04' : '#0f172a' }} value={status} onChange={e => setStatus(e.target.value as TaskStatus)}>
                <option value="TODO">시작 안 함</option>
                <option value="IN_PROGRESS">진행중</option>
                <option value="HOLDING">Holding</option>
                <option value="DONE">완료</option>
              </select>
            </div>
          </div>

          {/* Conditional Rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {visibility === 'RESTRICTED' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>관련자 지정 (쉼표로 구분)</label>
                <input style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem' }} value={relatedUsers} onChange={e => setRelatedUsers(e.target.value)} placeholder="예: 김대리, 박과장" />
              </div>
            )}
            {type === 'PERIODIC' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>반복 시작일</label>
                  <input type="date" style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem' }} value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>반복 빈도</label>
                  <select style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem' }} value={repeatCycle} onChange={e => setRepeatCycle(e.target.value)}>
                    <option value="매일">매일</option><option value="매주">매주</option><option value="매월">매월</option>
                    <option value="매분기">매분기</option><option value="매반기">매반기</option><option value="매년">매년</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>반복 종료일</label>
                  <input type="date" style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem' }} value={recurrenceEndDate} onChange={e => setRecurrenceEndDate(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          {/* External Links */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>외부 파일 링크</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text" value={externalFileLink} onChange={e => setExternalFileLink(e.target.value)}
                placeholder='Dropbox 웹에서 우클릭 → "링크 복사" 후 https://... 형태로 붙여넣기'
                style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.85rem' }}
              />
            </div>
          </div>

          {/* Comments (Only for existing tasks) */}
          {initialTask && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>

              {/* Comments */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#0f172a' }}>댓글</h4>
                <div style={{ background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '120px', overflowY: 'auto' }}>
                  {comments.map(c => (
                    <div key={c.id}>
                      <div style={{ fontSize: '0.65rem', color: '#64748b', marginBottom: '2px' }}>{c.creatorName} • {new Date(c.createdAt).toLocaleDateString()}</div>
                      <div style={{ fontSize: '0.8rem', color: '#0f172a', background: '#fff', padding: '6px 8px', borderRadius: '0 6px 6px 6px', border: '1px solid #e2e8f0', display: 'inline-block' }}>{c.content}</div>
                    </div>
                  ))}
                  {comments.length === 0 && <div style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center', padding: '8px' }}>댓글 없음</div>}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input style={{ flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '0.8rem' }} value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="댓글 입력..." onKeyDown={e => { if (e.key === 'Enter') handleAddComment(); }} />
                  <button onClick={handleAddComment} style={{ background: '#0d9488', color: '#fff', border: 'none', padding: '0 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}>등록</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid #e2e8f0',
          display: 'flex', justifyContent: 'flex-end', gap: '8px',
          background: '#f8fafc'
        }}>
          <button
            onClick={onClose}
            disabled={isSaving}
            style={{
              padding: '8px 16px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px',
              fontSize: '0.85rem', fontWeight: 600, color: '#475569', cursor: isSaving ? 'not-allowed' : 'pointer',
              opacity: isSaving ? 0.6 : 1
            }}
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            style={{
              padding: '8px 24px', background: '#0d9488', border: 'none', borderRadius: '6px',
              fontSize: '0.85rem', fontWeight: 700, color: '#fff', cursor: isSaving ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 4px -1px rgba(13, 148, 136, 0.2)',
              opacity: isSaving ? 0.6 : 1
            }}
          >
            {isSaving ? '저장 중...' : (initialTask ? '저장' : '등록')}
          </button>
        </div>
      </div>
    </div>
  );
};
