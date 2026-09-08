/**
 * 회사명 표기 정제 유틸리티
 * 
 * 사용자 요청: '주식회사', '(주)' 등은 제외하고 순수한 회사명만 표시
 */

/**
 * 회사명에서 '주식회사', '(주)', '（주）' 등을 제거하고 순수한 회사 이름만 표시하도록 정제합니다.
 * 
 * 예시:
 * - '(주)삼양' -> '삼양'
 * - '삼양(주)' -> '삼양'
 * - '( 주 ) 삼양' -> '삼양'
 * - '（주）삼양' -> '삼양'
 * - '주식회사 켐베이스' -> '켐베이스'
 * - '켐베이스 주식회사' -> '켐베이스'
 * - '주식회사정도' -> '정도'
 * - '(주)에어로지스, 주식회사 태웅' -> '에어로지스, 태웅'
 */
export const cleanCompanyName = (name?: string | null): string => {
  if (!name || typeof name !== 'string') return '';
  const trimmed = name.trim();
  if (!trimmed) return '';

  // 1. 괄호 안 '주' 패턴 제거: (주), ( 주 ), （주）, （ 주 ） 등
  let result = trimmed.replace(/[\(（]\s*주\s*[\)）]/g, ' ');

  // 2. '주식회사' 단어 제거
  result = result.replace(/주식회사/g, ' ');

  // 3. 콤마가 포함된 경우 (예: 여러 운송사 목록 등) 각 파트별 정리
  if (result.includes(',')) {
    result = result
      .split(',')
      .map(part => part.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join(', ');
  }

  // 4. 연속 공백 축소 및 트림
  result = result.replace(/\s+/g, ' ').trim();

  // 만약 전체가 주식회사/(주)만 있어서 빈 문자열이 된 경우는 원래 문자열 반환
  return result || trimmed;
};
