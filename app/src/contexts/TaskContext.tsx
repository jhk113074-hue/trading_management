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

interface TaskContextType {
  tasks: Task[];
  loading: boolean;
  addTask: (task: Omit<Task, 'id' | 'createdAt'>) => Promise<void>;
  updateTask: (task: Task) => Promise<void>;
  updateTaskStatus: (taskId: string, status: TaskStatus, comment?: string) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
}

const TaskContext = createContext<TaskContextType | undefined>(undefined);

export const TaskProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const { currentUser } = useAuth();

  // Firestore 실시간 업무 데이터 구독
  useEffect(() => {
    if (!currentUser) {
      setTasks([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const taskList: Task[] = [];
      
      const today = new Date();
      const threeDaysLater = new Date();
      threeDaysLater.setDate(today.getDate() + 3);
      const threeDaysLaterStr = threeDaysLater.toISOString().split('T')[0];

      snapshot.forEach((taskDoc) => {
        const data = taskDoc.data();
        let status = data.status as TaskStatus;

        // 시작일(startDate)이 오늘로부터 3일 이내로 진입한 UPCOMING 주기 업무는 TODO로 자동 활성화
        if (
          data.type === 'PERIODIC' &&
          status === 'UPCOMING' &&
          data.startDate &&
          data.startDate <= threeDaysLaterStr
        ) {
          status = 'TODO';
          updateDoc(doc(db, 'tasks', taskDoc.id), { 
            status: 'TODO', 
            updatedAt: new Date().toISOString() 
          }).catch((e: any) => console.error("Error auto-activating upcoming task:", e));
        }

        taskList.push({ id: taskDoc.id, ...data, status } as Task);
      });
      setTasks(taskList);
      setLoading(false);
    }, (error) => {
      console.error("Task fetch error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const getOccurrenceDates = (startStr: string, endStr: string, cycle: string): string[] => {
    const dates: string[] = [];
    if (!startStr || !endStr) return [startStr];
    let current = new Date(startStr);
    const end = new Date(endStr);
    if (isNaN(current.getTime()) || isNaN(end.getTime()) || current > end) {
      return [startStr];
    }

    let count = 0;
    while (current <= end && count < 3) {
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

  const formatPeriodicTitle = (baseTitle: string, dateStr: string) => {
    if (!dateStr) return baseTitle;
    const match = dateStr.match(/^(\d{4})-(\d{2})/);
    if (match) {
      const year = match[1];
      const month = match[2];
      const cleanedTitle = baseTitle.replace(/\s*\(\d{4}년\s*\d{2}월\)$/, '');
      return `${cleanedTitle} (${year}년 ${month}월)`;
    }
    return baseTitle;
  };

  // 위임 알림 발송
  const sendDelegationNotification = async (taskData: any, taskId: string) => {
    if (!taskData.assigneeId || !currentUser) return;
    const requesterId = taskData.createdBy || taskData.requesterId || currentUser.uid;
    if (taskData.assigneeId === requesterId) return;

    try {
      await addDoc(collection(db, 'mails'), {
        receiverId: taskData.assigneeId,
        senderName: taskData.requesterName || currentUser.displayName || '위임자',
        senderId: requesterId,
        title: `🤝 [업무 위임] ${taskData.title || '새로운 업무가 위임되었습니다.'}`,
        content: `${taskData.requesterName || currentUser.displayName || '위임자'}님이 업무를 위임하셨습니다.\n\n- 업무명: ${taskData.title}\n- 마감일: ${taskData.dueDate || '미정'}\n- 등록일: ${new Date().toLocaleDateString()}`,
        taskId: taskId,
        type: 'TASK_DELEGATED',
        isRead: false,
        createdAt: new Date().toISOString()
      });
    } catch (e) {
      console.error('Failed to send delegation notification:', e);
    }
  };

  // 완료 보고 알림 발송
  const sendCompletionNotification = async (task: Task, comment?: string) => {
    if (!currentUser) return;
    const requesterId = task.createdBy || task.requesterId;
    if (!requesterId || requesterId === currentUser.uid) return;

    try {
      const senderName = task.assigneeName || currentUser.displayName || '담당자';
      await addDoc(collection(db, 'mails'), {
        receiverId: requesterId,
        senderName: senderName,
        senderId: currentUser.uid,
        title: `✅ [업무 완료 보고] ${task.title}`,
        content: `${senderName}님이 위임받은 업무를 완료 처리했습니다.\n\n- 업무명: ${task.title}\n- 완료 시각: ${new Date().toLocaleString()}\n\n💬 [완료 코멘트]\n${comment || '코멘트 없음'}`,
        taskId: task.id,
        type: 'TASK_COMPLETED',
        isRead: false,
        createdAt: new Date().toISOString()
      });
    } catch (e) {
      console.error('Failed to send completion notification:', e);
    }
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

        const today = new Date();
        const threeDaysLater = new Date();
        threeDaysLater.setDate(today.getDate() + 3);
        const threeDaysLaterStr = threeDaysLater.toISOString().split('T')[0];

        for (const occDate of occurrences) {
          const occDueDate = new Date(occDate);
          occDueDate.setDate(occDueDate.getDate() + durationDays);
          const occDueDateStr = occDueDate.toISOString().split('T')[0];
          
          const initialStatus = occDate <= threeDaysLaterStr ? 'TODO' : 'UPCOMING';

          const docRef = await addDoc(collection(db, 'tasks'), {
            ...taskData,
            title: formatPeriodicTitle(taskData.title || '', occDate),
            status: initialStatus,
            startDate: occDate,
            dueDate: occDueDateStr,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            timestamp: serverTimestamp()
          });
          await sendDelegationNotification(taskData, docRef.id);
        }
      } else {
        const docRef = await addDoc(collection(db, 'tasks'), {
          ...taskData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          timestamp: serverTimestamp()
        });
        await sendDelegationNotification(taskData, docRef.id);
      }
    } catch (err) {
      console.error("Add task error:", err);
      throw err;
    }
  };

  const updateTask = async (task: Task) => {
    try {
      const { id, ...data } = task;
      const prevTask = tasks.find(t => t.id === id);
      
      // If assignee changed, trigger delegation notification
      if (data.assigneeId && data.assigneeId !== prevTask?.assigneeId) {
        await sendDelegationNotification(data, id);
      }

      // If it is updated to a PERIODIC task and we need to generate periodic items:
      if (data.type === 'PERIODIC' && data.startDate && data.recurrenceEndDate) {
        const occurrences = getOccurrenceDates(data.startDate, data.recurrenceEndDate, data.recurrence || '매주');
        let durationDays = 0;
        if (data.startDate && data.dueDate) {
          const s = new Date(data.startDate);
          const d = new Date(data.dueDate);
          if (!isNaN(s.getTime()) && !isNaN(d.getTime())) {
            durationDays = Math.max(0, Math.round((d.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)));
          }
        }

        const today = new Date();
        const threeDaysLater = new Date();
        threeDaysLater.setDate(today.getDate() + 3);
        const threeDaysLaterStr = threeDaysLater.toISOString().split('T')[0];

        const initialStatusForSelf = data.startDate <= threeDaysLaterStr ? (data.status === 'UPCOMING' ? 'TODO' : data.status) : 'UPCOMING';

        await updateDoc(doc(db, 'tasks', id), {
          ...data,
          title: formatPeriodicTitle(data.title || '', data.startDate),
          status: initialStatusForSelf,
          updatedAt: new Date().toISOString()
        });

        const otherOccurrences = occurrences.filter(occDate => occDate !== data.startDate);
        for (const occDate of otherOccurrences) {
          const occTitle = formatPeriodicTitle(data.title || '', occDate);
          const duplicateExists = tasks.some(t => t.title === occTitle && t.startDate === occDate);
          if (!duplicateExists) {
            const occDueDate = new Date(occDate);
            occDueDate.setDate(occDueDate.getDate() + durationDays);
            const occDueDateStr = occDueDate.toISOString().split('T')[0];
            
            const initialStatus = occDate <= threeDaysLaterStr ? 'TODO' : 'UPCOMING';

            const docRef = await addDoc(collection(db, 'tasks'), {
              ...data,
              title: occTitle,
              status: initialStatus,
              startDate: occDate,
              dueDate: occDueDateStr,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              timestamp: serverTimestamp()
            });
            await sendDelegationNotification(data, docRef.id);
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

  const updateTaskStatus = async (taskId: string, status: TaskStatus, comment?: string) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const existingTask = tasks.find(t => t.id === taskId);

      const updates: Record<string, any> = {
        status,
        updatedAt: new Date().toISOString(),
      };

      if (status === 'IN_PROGRESS') {
        if (!existingTask?.startDate) {
          updates.startDate = today;
        }
        updates.completedAt = null;
      }

      if (status === 'DONE') {
        updates.dueDate = today;
        updates.completedAt = new Date().toISOString();
        if (comment) {
          updates.completionComment = comment;
        }
      }

      await updateDoc(doc(db, 'tasks', taskId), updates);

      if (status === 'DONE' && existingTask) {
        await sendCompletionNotification(existingTask, comment);
      }
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
