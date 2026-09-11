/**
 * 회사명 표기 정제 유틸리티
 * 
 * 사용자 요청: 회사명에 Full name ((주), 주식회사 등)을 온전히 보존하여 표시
 */
export const cleanCompanyName = (name?: string | null): string => {
  if (!name || typeof name !== 'string') return '';
  const trimmed = name.trim();
  if (!trimmed) return '';

  // 다중 회사 목록(콤마 구분)이 있는 경우 각 항목별 공백 정리 수행
  if (trimmed.includes(',')) {
    return trimmed
      .split(',')
      .map(part => part.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join(', ');
  }

  // 연속 공백 축소 및 트림 (Full name (주), 주식회사 등은 온전히 유지)
  return trimmed.replace(/\s+/g, ' ');
};
