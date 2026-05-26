import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { Task, User, Project } from '../types';

const sampleUsers: User[] = [
  { id: 'u1', name: '대표이사', role: 'CEO', roleCode: 'ADMIN', email: 'ceo@ysacc.com' },
  { id: 'u2', name: '설계팀 김팀장', role: 'Design Lead', roleCode: 'MANAGER', email: 'design@ysacc.com' },
  { id: 'u3', name: '생산관리 이대리', role: 'Production', roleCode: 'USER', email: 'production@ysacc.com' },
];

const sampleProjects: Project[] = [
  { id: 'p1', name: '2026 신규 장비 도입', status: 'ACTIVE' },
  { id: 'p2', name: 'A사 부품 양산 프로젝트', status: 'ACTIVE' },
];

export const seedDatabase = async () => {
  const batch = writeBatch(db);

  // Users
  sampleUsers.forEach(user => {
    const ref = doc(db, 'users', user.id);
    batch.set(ref, user);
  });

  // Projects
  sampleProjects.forEach(proj => {
    const ref = doc(db, 'projects', proj.id);
    batch.set(ref, proj);
  });

  // Tasks
  const sampleTasks: Task[] = [
    {
      id: 't1', title: '설계 도면 검토', description: 'A사 신규 도면 검토',
      status: 'TODO', type: 'PROJECT', scheduleType: 'SCHEDULED',
      projectId: 'p2', projectName: 'A사 부품 양산 프로젝트',
      assigneeId: 'u2', assigneeName: '설계팀 김팀장',
      importance: 'B', urgency: 8, quadrant: 'Q1', dueDate: '2026-05-09',
      visibility: 'PUBLIC', createdAt: new Date().toISOString(), createdBy: 'u2',
      allowedUserIds: ['u2']
    },
    {
      id: 't2', title: '생산 라인 점검', description: '주간 정기 점검',
      status: 'IN_PROGRESS', type: 'PERIODIC', scheduleType: 'PERIODIC',
      assigneeId: 'u3', assigneeName: '생산관리 이대리',
      importance: 'C', urgency: 5, quadrant: 'Q4', dueDate: '2026-05-09',
      visibility: 'PUBLIC', createdAt: new Date().toISOString(), createdBy: 'u3',
      allowedUserIds: ['u3']
    },
    {
      id: 't3', title: '임원 회의 자료 준비', description: '매출 현황 요약',
      status: 'TODO', type: 'DAILY', scheduleType: 'SELF',
      assigneeId: 'u1', assigneeName: '대표이사',
      importance: 'A', urgency: 2, quadrant: 'Q2', dueDate: '2026-05-15',
      visibility: 'PRIVATE', createdAt: new Date().toISOString(), createdBy: 'u1',
      allowedUserIds: ['u1']
    },
    {
      id: 't4', title: '외주 단가 협상', description: '협력업체 B사 단가 협상',
      status: 'TODO', type: 'DELEGATED', scheduleType: 'REQUESTED',
      assigneeId: 'u3', assigneeName: '생산관리 이대리',
      requesterId: 'u1', requesterName: '대표이사',
      importance: 'B', urgency: 8, quadrant: 'Q1', dueDate: '2026-05-10',
      visibility: 'RESTRICTED', createdAt: new Date().toISOString(), createdBy: 'u1',
      allowedUserIds: ['u1', 'u3']
    }
  ];

  sampleTasks.forEach(task => {
    const ref = doc(db, 'tasks', task.id);
    batch.set(ref, task);
  });

  // Commits
  await batch.commit();
  console.log("Database seeded successfully!");
};
