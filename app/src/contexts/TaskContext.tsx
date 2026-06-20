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

  // Firestore 실시간 업무 데이터 구독
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

  const getOccurrenceDates = (startStr: string, endStr: string, cycle: string): string[] => {
    const dates: string[] = [];
    if (!startStr || !endStr) return [startStr];
    let current = new Date(startStr);
    const end = new Date(endStr);
    if (isNaN(current.getTime()) || isNaN(end.getTime()) || current > end) {
      return [startStr];
    }

    let count = 0;
    while (current <= end && count < 100) {
      dates.push(current.toISOString().split('T')[0]);
      const next = new Date(current);
      if (cycle === '매일') {
        next.setDate(next.getDate() + 1);
      } else if (cycle === '매주') {
        next.setDate(next.getDate() + 7);
      } else if (cycle === '매월') {
        next.setMonth(next.getMonth() + 1);
      } else if (cycle === '매분기') {
        next.setMonth(next.getMonth() + 3);
      } else if (cycle === '매반기') {
        next.setMonth(next.getMonth() + 6);
      } else if (cycle === '매년') {
        next.setFullYear(next.getFullYear() + 1);
      } else {
        next.setDate(next.getDate() + 7);
      }
      if (next.getTime() <= current.getTime()) {
        next.setDate(next.getDate() + 1);
      }
      current = next;
      count++;
    }
    return dates;
  };

  const addTask = async (taskData: any) => {
    try {
      if (taskData.type === 'PERIODIC' && taskData.startDate && taskData.recurrenceEndDate) {
        const occurrences = getOccurrenceDates(taskData.startDate, taskData.recurrenceEndDate, taskData.recurrence || '매주');
        let durationDays = 0;
        if (taskData.startDate && taskData.dueDate) {
          const s = new Date(taskData.startDate);
          const d = new Date(taskData.dueDate);
          if (!isNaN(s.getTime()) && !isNaN(d.getTime())) {
            durationDays = Math.max(0, Math.round((d.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)));
          }
        }

        for (const occDate of occurrences) {
          const occDueDate = new Date(occDate);
          occDueDate.setDate(occDueDate.getDate() + durationDays);
          const occDueDateStr = occDueDate.toISOString().split('T')[0];

          await addDoc(collection(db, 'tasks'), {
            ...taskData,
            startDate: occDate,
            dueDate: occDueDateStr,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            timestamp: serverTimestamp()
          });
        }
      } else {
        await addDoc(collection(db, 'tasks'), {
          ...taskData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          timestamp: serverTimestamp()
        });
      }
    } catch (err) {
      console.error("Add task error:", err);
      throw err;
    }
  };

  const updateTask = async (task: Task) => {
    try {
      const { id, ...data } = task;
      
      // If it is updated to a PERIODIC task and we need to generate periodic items:
      if (data.type === 'PERIODIC' && data.startDate && data.recurrenceEndDate) {
        // Find existing tasks that might belong to the same repetition cycle so we don't duplicate them,
        // or simple rule: if updating this specific task, update this one, but also generate the remaining ones.
        // To be safe and clean: if it is periodic, we can update the clicked task (this one),
        // and if there are other occurrences from getOccurrenceDates that don't exist yet, we add them.
        const occurrences = getOccurrenceDates(data.startDate, data.recurrenceEndDate, data.recurrence || '매주');
        let durationDays = 0;
        if (data.startDate && data.dueDate) {
          const s = new Date(data.startDate);
          const d = new Date(data.dueDate);
          if (!isNaN(s.getTime()) && !isNaN(d.getTime())) {
            durationDays = Math.max(0, Math.round((d.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)));
          }
        }

        // We update the clicked task itself first
        await updateDoc(doc(db, 'tasks', id), {
          ...data,
          updatedAt: new Date().toISOString()
        });

        // Generate the other occurrences. We filter out the one that matches this updated task's start date (which is already updated)
        const otherOccurrences = occurrences.filter(occDate => occDate !== data.startDate);
        for (const occDate of otherOccurrences) {
          // Check if a task with the same title and same startDate already exists to prevent duplicate generation
          const duplicateExists = tasks.some(t => t.title === data.title && t.startDate === occDate);
          if (!duplicateExists) {
            const occDueDate = new Date(occDate);
            occDueDate.setDate(occDueDate.getDate() + durationDays);
            const occDueDateStr = occDueDate.toISOString().split('T')[0];

            await addDoc(collection(db, 'tasks'), {
              ...data,
              startDate: occDate,
              dueDate: occDueDateStr,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              timestamp: serverTimestamp()
            });
          }
        }
      } else {
        await updateDoc(doc(db, 'tasks', id), {
          ...data,
          updatedAt: new Date().toISOString()
        });
      }
    } catch (err) {
      console.error("Update task error:", err);
      throw err;
    }
  };

  const updateTaskStatus = async (taskId: string, status: TaskStatus) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const existingTask = tasks.find(t => t.id === taskId);

      const updates: Record<string, any> = {
        status,
        updatedAt: new Date().toISOString(),
      };

      // 업무중으로 이동: 시작일이 없을 때만 오늘 날짜 자동 기록
      if (status === 'IN_PROGRESS') {
        if (!existingTask?.startDate) {
          updates.startDate = today;
        }
        updates.completedAt = null; // 완료 취소 시 초기화
      }

      // 완료로 이동: 마감일(종료일)에 오늘 날짜 자동 기록, completedAt도 기록
      if (status === 'DONE') {
        updates.dueDate = today;
        updates.completedAt = new Date().toISOString();
      }

      await updateDoc(doc(db, 'tasks', taskId), updates);
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
