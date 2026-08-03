import type { User } from '../types';

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
