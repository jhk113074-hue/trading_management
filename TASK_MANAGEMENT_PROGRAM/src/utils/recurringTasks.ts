import { collection, getDocs, addDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { RecurringTaskRule } from '../types';

/**
 * Placeholder for a Cloud Function or cron job.
 * Checks all active rules and creates tasks if nextRunDate <= today.
 * Normally this runs securely in a backend Scheduled Function.
 */
export const processRecurringTasks = async () => {
  try {
    const rulesRef = collection(db, 'recurringTaskRules');
    const q = query(rulesRef, where('isActive', '==', true));
    const snapshot = await getDocs(q);
    
    // In a real app, you would check "nextRunDate <= today"
    // For this MVP simulation, we just create instances for all active rules
    for (const ruleDoc of snapshot.docs) {
      const rule = ruleDoc.data() as RecurringTaskRule;
      
      const newTask = {
        title: rule.title,
        description: `반복 업무 자동 생성 (규칙 ID: ${ruleDoc.id})`,
        status: 'TODO',
        type: 'PERIODIC',
        scheduleType: 'PERIODIC',
        importance: 5,
        urgency: 5,
        quadrant: 'Q4', // will be auto-recalculated on save if through context
        assigneeId: rule.assigneeId,
        visibility: 'PUBLIC',
        createdAt: new Date().toISOString(),
        createdBy: 'SYSTEM', // Indicated it's auto-generated
        isRecurringInstance: true,
        recurringRuleId: ruleDoc.id
      };
      
      await addDoc(collection(db, 'tasks'), newTask);
      // Here you would also update rule's nextRunDate
    }
  } catch (error) {
    console.error("Error processing recurring tasks: ", error);
  }
};
