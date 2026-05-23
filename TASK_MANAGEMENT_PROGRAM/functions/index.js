const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// 1. RECURRING 업무 자동 생성 (매일 자정 실행)
exports.generateRecurringTasks = functions.pubsub.schedule('0 0 * * *').timeZone('Asia/Seoul').onRun(async (context) => {
  const rulesRef = db.collection('recurringTaskRules');
  const activeRulesSnapshot = await rulesRef.where('isActive', '==', true).get();
  
  const todayStr = new Date().toISOString().split('T')[0];
  const batch = db.batch();
  let createdCount = 0;

  activeRulesSnapshot.forEach((docSnap) => {
    const rule = docSnap.data();
    
    // 단순 MVP 시뮬레이션: nextRunDate가 오늘 이전이거나 같으면 실행 (실제론 cron 파싱 필요)
    if (!rule.nextRunDate || rule.nextRunDate <= todayStr) {
      const newTaskRef = db.collection('tasks').doc();
      batch.set(newTaskRef, {
        title: rule.title,
        description: `자동 생성된 반복 업무 (규칙 ID: ${docSnap.id})`,
        status: 'TODO',
        type: 'PERIODIC',
        scheduleType: 'PERIODIC',
        importance: 5,
        urgency: 5,
        quadrant: 'Q4',
        assigneeId: rule.assigneeId,
        visibility: 'PUBLIC',
        createdAt: new Date().toISOString(),
        createdBy: 'SYSTEM_SCHEDULER',
        isRecurringInstance: true,
        recurringRuleId: docSnap.id
      });
      
      // 다음 실행일 갱신 (더미: 7일 뒤)
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + 7);
      batch.update(docSnap.ref, {
        nextRunDate: nextDate.toISOString().split('T')[0]
      });
      createdCount++;
    }
  });

  if (createdCount > 0) {
    await batch.commit();
    console.log(`Generated ${createdCount} recurring tasks.`);
  }
  return null;
});

// 2. 업무 상태 변경 시 taskActivityLogs 자동 생성 (Cloud Functions 트리거)
exports.onTaskUpdated = functions.firestore.document('tasks/{taskId}').onUpdate((change, context) => {
  const before = change.before.data();
  const after = change.after.data();
  const taskId = context.params.taskId;

  // 상태 변경 감지
  if (before.status !== after.status) {
    const logRef = db.collection('taskActivityLogs').doc();
    return logRef.set({
      taskId,
      actionType: after.status === 'DONE' ? 'COMPLETE' : 'MOVE',
      actionDesc: `상태 변경 (Backend Trigger): ${before.status} -> ${after.status}`,
      actionBy: after.updatedBy || 'SYSTEM',
      actionAt: new Date().toISOString(),
      fromValue: before.status,
      toValue: after.status,
    });
  }
  return null;
});
