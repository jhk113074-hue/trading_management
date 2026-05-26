import type { Quadrant, Task } from '../types';

export const calculateQuadrant = (importance: string, urgency: number): Quadrant => {
  const impHigh = importance === 'A';
  const urgHigh = urgency >= 6;
  if (impHigh && urgHigh) return 'Q1';
  if (impHigh && !urgHigh) return 'Q2';
  if (!impHigh && urgHigh) return 'Q3';
  return 'Q4';
};

export const validateTask = (task: Partial<Task>): string | null => {
  if (!task.title?.trim()) return '업무명은 필수입니다.';
  if (!task.type) return '업무 유형은 필수입니다.';
  if (!task.status) return '상태값은 필수입니다.';
  if (!task.importance) return '중요도(A/B/C)는 필수입니다.';
  if (!task.urgency) return '긴급도(1-10)는 필수입니다.';
  
  if (task.type === 'DELEGATED' && !task.requesterName?.trim()) {
    return '위임업무는 요청자명이 필수입니다.';
  }

  if (task.type === 'PERIODIC' && !task.recurrence?.trim()) {
    return '주기업무는 반복 주기가 필수입니다.';
  }

  return null; // Valid
};
