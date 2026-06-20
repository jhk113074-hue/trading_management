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

  if (task.type === 'PERIODIC') {
    if (!task.startDate) {
      return '주기업무는 반복 시작일이 필수입니다.';
    }
    if (!task.recurrenceEndDate) {
      return '주기업무는 반복 종료일이 필수입니다.';
    }
    const start = new Date(task.startDate);
    const end = new Date(task.recurrenceEndDate);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      // Calculate 2 years from start date
      const maxEnd = new Date(start);
      maxEnd.setFullYear(maxEnd.getFullYear() + 2);
      if (end > maxEnd) {
        return '반복 종료일은 시작일 기준 최대 2년까지 설정할 수 있습니다.';
      }
    }
  }

  return null; // Valid
};
