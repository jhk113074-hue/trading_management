import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';
import type { TaskActivityLog } from '../types';

export const logActivity = async (
  taskId: string,
  actionType: TaskActivityLog['actionType'],
  actionDesc: string,
  userId: string,
  fromValue?: string,
  toValue?: string
) => {
  try {
    await addDoc(collection(db, 'taskActivityLogs'), {
      taskId,
      actionType,
      actionDesc,
      actionBy: userId,
      actionAt: new Date().toISOString(),
      fromValue: fromValue || null,
      toValue: toValue || null,
    });
  } catch (err) {
    console.error('Error logging activity: ', err);
  }
};
