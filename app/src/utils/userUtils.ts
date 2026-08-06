import type { Task, User } from '../types';

/**
 * 전산 관리 / 모니터링 전용 외주 계정 여부 판단
 * (이메일 admin@growworks.co.kr 또는 부서 '외주' 등 모니터링 계정 제외용)
 */
export const isMonitoringUser = (user: Partial<User> | null | undefined): boolean => {
  if (!user) return false;
  const email = (user.email || '').toLowerCase().trim();
  const dept = (user.department || '').trim();
  const name = (user.name || '').trim();

  return (
    email === 'admin@growworks.co.kr' ||
    dept === '외주' ||
    name.includes('서용운')
  );
};

/**
 * 실무 업무 담당자/배정 대상 사용자 여부 판단 (모니터링 전용 계정 제외)
 */
export const isOperationalUser = (user: Partial<User> | null | undefined): boolean => {
  return !isMonitoringUser(user);
};

/**
 * 완료 보고서 제출 예외 대상 여부 판단
 * 1. 스스로 계획/등록한 업무 (SELF 타입 또는 위임자 미지정 또는 위임자 == 담당자)
 * 2. 현재 로그인 사용자가 위임자(requester)인 경우
 */
export const isCompletionReportExempt = (
  task: Partial<Task> | null | undefined,
  currentUserId?: string,
  currentUserName?: string
): boolean => {
  if (!task) return true;

  // 1. 스스로 계획/등록한 업무 (SELF, 위임자 없음, 위임자 == 담당자)
  const isSelfTask =
    task.scheduleType === 'SELF' ||
    !task.requesterId ||
    task.requesterId === task.assigneeId ||
    (Boolean(task.requesterName && task.assigneeName) && task.requesterName === task.assigneeName);

  if (isSelfTask) return true;

  // 2. 현재 작업자가 위임자(requester)인 경우
  const isRequester =
    (Boolean(currentUserId) && task.requesterId === currentUserId) ||
    (Boolean(currentUserName) && task.requesterName === currentUserName);

  return isRequester;
};
