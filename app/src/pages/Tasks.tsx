import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  getDocs, 
  addDoc, 
  deleteDoc,
  updateDoc,
  doc, 
  orderBy 
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

export const Tasks: React.FC = () => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const { userProfile } = useAuth();

  const [currentTask, setCurrentTask] = useState({
    title: '',
    description: '',
    priority: '보통',
    status: '대기',
    assignee: '',
    dueDate: new Date().toISOString().split('T')[0]
  });

  // 상태값 매핑 (DB의 영문 상태와 UI의 한글 상태 호환)
  const statusMap: any = {
    '대기': 'TODO',
    '진행중': 'IN_PROGRESS',
    '완료': 'DONE',
    'TODO': '대기',
    'IN_PROGRESS': '진행중',
    'DONE': '완료',
    'todo': '대기',
    'in_progress': '진행중',
    'done': '완료'
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const qTasks = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'));
      const taskSnap = await getDocs(qTasks);
      const taskList: any[] = [];
      taskSnap.forEach(doc => {
        const data = doc.data();
        // DB 상태값을 UI용으로 변환 (없으면 대기)
        const uiStatus = statusMap[data.status] || data.status || '대기';
        taskList.push({ id: doc.id, ...data, uiStatus });
      });
      setTasks(taskList);

      const qMembers = query(collection(db, 'users'));
      const memberSnap = await getDocs(qMembers);
      const memberList: any[] = [];
      memberSnap.forEach(doc => memberList.push({ id: doc.id, ...doc.data() }));
      setMembers(memberList);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenAdd = () => {
    setIsEditing(false);
    setCurrentTask({ title: '', description: '', priority: '보통', status: '대기', assignee: '', dueDate: new Date().toISOString().split('T')[0] });
    setShowModal(true);
  };

  const handleOpenEdit = (task: any) => {
    setIsEditing(true);
    setEditingId(task.id);
    setCurrentTask({
      title: task.title,
      description: task.description || '',
      priority: task.priority || '보통',
      status: task.uiStatus || '대기',
      assignee: task.assignee || '',
      dueDate: task.dueDate || new Date().toISOString().split('T')[0]
    });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!currentTask.title) return;
    try {
      // DB에는 UI에서 선택한 상태를 DB용 영문으로 저장할 수도 있고 그대로 한글로 저장할 수도 있음
      // 여기서는 호환성을 위해 UI 선택값 그대로 저장 (fetch 시 매핑)
      const dataToSave = { ...currentTask };
      
      if (isEditing && editingId) {
        await updateDoc(doc(db, 'tasks', editingId), dataToSave);
      } else {
        await addDoc(collection(db, 'tasks'), {
          ...dataToSave,
          createdAt: new Date().toISOString(),
          createdBy: userProfile?.name || '관리자'
        });
      }
      setShowModal(false);
      fetchData();
    } catch (error) {
      console.error(error);
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (!window.confirm("정말 삭제하시겠습니까?")) return;
    try {
      await deleteDoc(doc(db, 'tasks', id));
      fetchData();
    } catch (error) {
      console.error(error);
    }
  };

  const columns = ['대기', '진행중', '완료'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '1.6rem', color: '#1a1a2e', fontWeight: 'bold', margin: 0 }}>📋 업무 보드</h2>
        <button 
          onClick={handleOpenAdd}
          style={{ 
            padding: '12px 25px', 
            backgroundColor: '#4f46e5', 
            color: 'white', 
            border: 'none', 
            borderRadius: '12px', 
            fontWeight: 'bold', 
            cursor: 'pointer',
            boxShadow: '0 8px 20px rgba(79, 70, 229, 0.3)'
          }}
        >+ 새 업무 등록</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', minHeight: '600px' }}>
        {columns.map(col => (
          <div key={col} style={{ backgroundColor: '#f4f7fe', borderRadius: '20px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', padding: '0 5px' }}>
              <h3 style={{ fontSize: '1rem', color: '#1a1a2e', margin: 0 }}>{col}</h3>
              <span style={{ backgroundColor: 'white', padding: '2px 10px', borderRadius: '15px', fontSize: '0.8rem', fontWeight: 'bold', color: '#4f46e5' }}>
                {tasks.filter(t => t.uiStatus === col).length}
              </span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', flex: 1 }}>
              {tasks.filter(t => t.uiStatus === col).map(task => (
                <div 
                  key={task.id} 
                  onClick={() => handleOpenEdit(task)}
                  style={{ 
                    backgroundColor: 'white', 
                    padding: '20px', 
                    borderRadius: '15px', 
                    boxShadow: '0 5px 15px rgba(0,0,0,0.05)',
                    cursor: 'pointer',
                    transition: 'transform 0.2s'
                  }}
                  onMouseOver={e => e.currentTarget.style.transform = 'translateY(-3px)'}
                  onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span style={{ 
                      fontSize: '0.7rem', 
                      padding: '2px 8px', 
                      borderRadius: '5px', 
                      fontWeight: 'bold',
                      backgroundColor: task.priority === '높음' ? '#fee2e2' : '#e0e7ff',
                      color: task.priority === '높음' ? '#ef4444' : '#4f46e5'
                    }}>{task.priority}</span>
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#cbd5e0' }}>✕</button>
                  </div>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '1rem', color: '#1a1a2e' }}>{task.title}</h4>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: '0.8rem', color: '#718096' }}>👤 {task.assignee || '미지정'}</span>
                    <span style={{ fontSize: '0.8rem', color: '#a0aec0' }}>{new Date(task.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: 'white', padding: '40px', borderRadius: '25px', width: '500px', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
            <h3 style={{ marginBottom: '25px', fontSize: '1.4rem' }}>{isEditing ? '업무 상세 및 수정' : '새 업무 등록'}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <input className="form-control" placeholder="제목" value={currentTask.title} onChange={e => setCurrentTask({...currentTask, title: e.target.value})} style={{ padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }} />
              <textarea className="form-control" placeholder="설명" value={currentTask.description} onChange={e => setCurrentTask({...currentTask, description: e.target.value})} style={{ padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', height: '100px' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <select value={currentTask.priority} onChange={e => setCurrentTask({...currentTask, priority: e.target.value})} style={{ padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <option>높음</option>
                  <option>보통</option>
                  <option>낮음</option>
                </select>
                <select value={currentTask.assignee} onChange={e => setCurrentTask({...currentTask, assignee: e.target.value})} style={{ padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <option value="">담당자 선택</option>
                  {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <input type="date" value={currentTask.dueDate} onChange={e => setCurrentTask({...currentTask, dueDate: e.target.value})} style={{ padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }} />
                <select value={currentTask.status} onChange={e => setCurrentTask({...currentTask, status: e.target.value})} style={{ padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  {columns.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '15px' }}>
                <button onClick={handleSubmit} style={{ flex: 1, padding: '15px', backgroundColor: '#4f46e5', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold' }}>저장하기</button>
                <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: '15px', backgroundColor: '#f4f7fe', color: '#4a5568', border: 'none', borderRadius: '12px' }}>취소</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
