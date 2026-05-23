import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import type { Task, TaskStatus } from '../types';

export const useTasks = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const { userProfile } = useAuth();

  useEffect(() => {
    if (!userProfile) {
      setTasks([]);
      setLoading(false);
      return;
    }

    const tasksRef = collection(db, 'tasks');
    const unsubscribe = onSnapshot(tasksRef, (snapshot) => {
      const fetchedTasks: Task[] = [];
      snapshot.forEach((doc) => {
        fetchedTasks.push({ id: doc.id, ...doc.data() } as Task);
      });
      
      // Client-side filtering based on visibility rules
      const finalTasks = fetchedTasks.filter(task => {
        if (userProfile.roleCode === 'ADMIN') return true;
        if (task.visibility === 'PUBLIC') return true;
        
        const isRelated = 
          task.createdBy === userProfile.id || 
          task.assigneeId === userProfile.id ||
          (task.taskAssignees && task.taskAssignees.includes(userProfile.id)) ||
          (task.allowedUserIds && task.allowedUserIds.includes(userProfile.id));

        if (task.visibility === 'RESTRICTED') {
          return isRelated || userProfile.roleCode === 'MANAGER';
        }
        
        if (task.visibility === 'PRIVATE') {
          return task.createdBy === userProfile.id || task.assigneeId === userProfile.id;
        }

        return false;
      });

      setTasks(finalTasks);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching tasks: ", error);
      setLoading(false);
    });

    return unsubscribe;
  }, [userProfile]);

  const addTask = async (taskData: Partial<Task>) => {
    if (!userProfile) return;
    try {
      const newTask = {
        ...taskData,
        createdAt: new Date().toISOString(),
        createdBy: userProfile.id,
        allowedUserIds: [userProfile.id, ...(taskData.taskAssignees || []), taskData.assigneeId].filter(Boolean)
      };
      await addDoc(collection(db, 'tasks'), newTask);
    } catch (error) {
      console.error("Error adding task: ", error);
    }
  };

  const updateTaskStatus = async (taskId: string, newStatus: TaskStatus) => {
    try {
      const taskRef = doc(db, 'tasks', taskId);
      await updateDoc(taskRef, {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error updating task status: ", error);
    }
  };

  return { tasks, loading, addTask, updateTaskStatus };
};
