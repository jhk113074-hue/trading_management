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

/**
 * 동일 회사 판별 및 그룹핑/인덱싱을 위한 표준 정규화 키 생성 함수
 * 
 * - 대소문자 무시 (toLowerCase)
 * - 괄호 변형 대응: (), （）, [], 【】 등
 * - 법인 표기 통일/제거: (주), ㈜, 주식회사, (유), 유한회사, (합), 합자회사, (사), 사단법인, (재), 재단법인
 * - 영문 법인 표기 제거: co., ltd., co ltd, coltd, inc, corp, llc, gmbh
 * - 공백 및 특수문자 제거: 오직 영문, 숫자, 한글만 남김
 * 
 * 예시:
 * - "강남 KPI" / "강남KPI" -> "강남kpi"
 * - "(주)대원로지피아" / "대원로지피아" / "대원로지피아(주)" -> "대원로지피아"
 * - "주식회사 라온해운항공" / "(주)라온해운항공" / "라온해운항공" -> "라온해운항공"
 * - "(주) 삼오" / "(주)삼오" / "삼오" -> "삼오"
 */
export const normalizeCompanyKey = (name?: string | null): string => {
  if (!name || typeof name !== 'string') return '';
  let str = name.trim().toLowerCase();
  if (!str) return '';

  // 1. 괄호 문자 통일 (전각 괄호 -> 반각 괄호)
  str = str.replace(/[（【［]/g, '(').replace(/[）】］]/g, ')');

  // 2. 법인 표기 통일/제거
  str = str
    .replace(/\(\s*주\s*\)|㈜|\b주식회사\b|주식회사/gi, '')
    .replace(/\(\s*유\s*\)|유한회사/gi, '')
    .replace(/\(\s*합\s*\)|합자회사/gi, '')
    .replace(/\(\s*사\s*\)|사단법인/gi, '')
    .replace(/\(\s*재\s*\)|재단법인/gi, '')
    .replace(/\b(co\.?,?\s*ltd\.?|corp\.?|inc\.?|llc\.?|gmbh)\b/gi, '');

  // 3. 특수문자 및 모든 공백 제거 (영문, 숫자, 한글만 남김)
  const normalized = str.replace(/[^a-z0-9가-힣]/gi, '');

  // 법인 표기 제거 후 빈 문자열이 되는 경우(예: "(주)")는 원본에서 특수문자만 제거한 값 사용
  if (!normalized) {
    return name.trim().toLowerCase().replace(/[^a-z0-9가-힣]/gi, '');
  }

  return normalized;
};

/**
 * 두 회사명이 실질적으로 동일한 회사인지 판별
 */
export const isSameCompany = (a?: string | null, b?: string | null): boolean => {
  if (!a || !b) return false;
  const cleanA = cleanCompanyName(a);
  const cleanB = cleanCompanyName(b);
  if (cleanA.toLowerCase() === cleanB.toLowerCase()) return true;

  const normA = normalizeCompanyKey(a);
  const normB = normalizeCompanyKey(b);
  if (normA && normB && normA === normB) return true;

  const strippedA = cleanA.toLowerCase().replace(/[^a-z0-9가-힣]/gi, '');
  const strippedB = cleanB.toLowerCase().replace(/[^a-z0-9가-힣]/gi, '');
  if (strippedA && strippedB && strippedA === strippedB) return true;

  return false;
};

/**
 * 두 개의 회사 표기 중 공식 표기((주), 주식회사 포함) 또는 더 상세한 이름을 우선 선택
 */
export const preferBetterCompanyName = (currentName: string, candidateName: string): string => {
  if (!currentName) return cleanCompanyName(candidateName);
  if (!candidateName) return cleanCompanyName(currentName);

  const cleanCurr = cleanCompanyName(currentName);
  const cleanCand = cleanCompanyName(candidateName);

  // 1. (주) / 주식회사 등 법인 명칭이 포함된 표기 우선
  const hasCorpCurr = /\(주\)|㈜|주식회사/.test(cleanCurr);
  const hasCorpCand = /\(주\)|㈜|주식회사/.test(cleanCand);
  if (!hasCorpCurr && hasCorpCand) return cleanCand;
  if (hasCorpCurr && !hasCorpCand) return cleanCurr;

  // 2. 더 구체적이거나 긴 이름 우선 (단, 괄호 공백 정제된 것)
  if (cleanCand.length > cleanCurr.length) return cleanCand;
  return cleanCurr;
};

