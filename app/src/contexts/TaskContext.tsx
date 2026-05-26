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

interface TaskContextType {
  tasks: Task[];
  loading: boolean;
  addTask: (task: Omit<Task, 'id' | 'createdAt'>) => Promise<void>;
  updateTask: (task: Task) => Promise<void>;
  updateTaskStatus: (taskId: string, status: TaskStatus) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
}

const TaskContext = createContext<TaskContextType | undefined>(undefined);

export const TaskProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

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

  const addTask = async (taskData: any) => {
    try {
      await addDoc(collection(db, 'tasks'), {
        ...taskData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        timestamp: serverTimestamp()
      });
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
    } catch (err) {
      console.error("Update status error:", err);
    }
  };

  const deleteTask = async (taskId: string) => {
    try {
      await deleteDoc(doc(db, 'tasks', taskId));
    } catch (err) {
      console.error("Delete task error:", err);
    }
  };

  return (
    <TaskContext.Provider value={{ tasks, loading, addTask, updateTask, updateTaskStatus, deleteTask }}>
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
