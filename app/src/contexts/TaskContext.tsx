import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Task, TaskStatus } from '../types';
import { useAuth } from './AuthContext';
import { 
  syncAddTaskToMsTodo, 
  syncUpdateTaskToMsTodo, 
  syncDeleteTaskFromMsTodo,
  syncMsTodoToFirebase
} from '../utils/microsoftTodo';

interface TaskContextType {
  tasks: Task[];
  loading: boolean;
  addTask: (task: Omit<Task, 'id' | 'createdAt'>) => Promise<void>;
  updateTask: (task: Task) => Promise<void>;
  updateTaskStatus: (taskId: string, status: TaskStatus) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  syncFromMsTodo: () => Promise<{ added: number; updated: number; debugInfo?: string }>;
}

const TaskContext = createContext<TaskContextType | undefined>(undefined);

export const TaskProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const { userProfile } = useAuth();

  // Firestore 실시간 업무 데이터 구독 (로그인 여부와 상관없이 데이터 로드)
  useEffect(() => {
    const q = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const taskList: Task[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        taskList.push({ id: doc.id, ...data } as Task);
      });
      setTasks(taskList);
      setLoading(false);
    }, (error) => {
      console.error("Task fetch error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 로그인 상태 및 태스크가 로드되면 MS To Do 자동 동기화 (최초 로드, 주기적 2분 간격, 탭 포커스 시)
  useEffect(() => {
    if (!userProfile || !(userProfile as any).microsoftConnected || tasks.length === 0) return;

    let isSyncing = false;
    const runSyncSilently = async () => {
      if (isSyncing) return;
      isSyncing = true;
      try {
        await syncMsTodoToFirebase(userProfile, tasks);
      } catch (err) {
        console.error('MS To Do 자동 동기화 실패:', err);
      } finally {
        isSyncing = false;
      }
    };

    // 1. 컴포넌트 마운트/태스크 로드 시 즉시 동기화 실행
    runSyncSilently();

    // 2. 브라우저 탭 포커스 시 동기화 실행
    const handleFocus = () => {
      runSyncSilently();
    };
    window.addEventListener('focus', handleFocus);

    // 3. 2분마다 주기적으로 배경 동기화 실행
    const intervalId = setInterval(runSyncSilently, 2 * 60 * 1000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(intervalId);
    };
  }, [userProfile, tasks.length]);

  const syncFromMsTodo = async () => {
    if (!userProfile) return { added: 0, updated: 0, debugInfo: '세션 없음' };
    return await syncMsTodoToFirebase(userProfile, tasks);
  };

  const addTask = async (taskData: any) => {
    try {
      const docRef = await addDoc(collection(db, 'tasks'), {
        ...taskData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        timestamp: serverTimestamp()
      });

      // Microsoft To Do 동기화
      try {
        await syncAddTaskToMsTodo(taskData, docRef.id, userProfile);
      } catch (syncErr) {
        console.error("MS To Do sync failed on add:", syncErr);
      }
    } catch (err) {
      console.error("Add task error:", err);
      throw err;
    }
  };

  const updateTask = async (task: Task) => {
    try {
      const { id, ...data } = task;
      await updateDoc(doc(db, 'tasks', id), {
        ...data,
        updatedAt: new Date().toISOString()
      });

      // Microsoft To Do 동기화
      try {
        await syncUpdateTaskToMsTodo(task, userProfile);
      } catch (syncErr) {
        console.error("MS To Do sync failed on update:", syncErr);
      }
    } catch (err) {
      console.error("Update task error:", err);
      throw err;
    }
  };

  const updateTaskStatus = async (taskId: string, status: TaskStatus) => {
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        status,
        updatedAt: new Date().toISOString(),
        completedAt: status === 'DONE' ? new Date().toISOString() : null
      });

      // Microsoft To Do 동기화
      const task = tasks.find(t => t.id === taskId);
      if (task) {
        try {
          await syncUpdateTaskToMsTodo({ ...task, status }, userProfile);
        } catch (syncErr) {
          console.error("MS To Do sync failed on status update:", syncErr);
        }
      }
    } catch (err) {
      console.error("Update status error:", err);
    }
  };

  const deleteTask = async (taskId: string) => {
    try {
      const task = tasks.find(t => t.id === taskId);
      await deleteDoc(doc(db, 'tasks', taskId));

      // Microsoft To Do 동기화
      if (task) {
        try {
          await syncDeleteTaskFromMsTodo(task, userProfile);
        } catch (syncErr) {
          console.error("MS To Do sync failed on delete:", syncErr);
        }
      }
    } catch (err) {
      console.error("Delete task error:", err);
    }
  };

  return (
    <TaskContext.Provider value={{ tasks, loading, addTask, updateTask, updateTaskStatus, deleteTask, syncFromMsTodo }}>
      {children}
    </TaskContext.Provider>
  );
};

export const useTasks = () => {
  const context = useContext(TaskContext);
  if (context === undefined) {
    throw new Error('useTasks must be used within a TaskProvider');
  }
  return context;
};
