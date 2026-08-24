
/**
 * 공급업체명 또는 등록된 공급업체 정보로부터 고유 영문 약자(Short Code)를 추출/반환합니다.
 * 사용자 규칙: YSACC/YS - 년도2자리(예:26) - 업체약자 - 번호(업체별 연번)
 */
export const getSupplierShortCode = (supplierName: string, suppliersList: any[] = []): string => {
  if (!supplierName) return 'SUP';

  // 1. 공급업체 마스터에서 등록된 shortCode 확인
  const matched = (suppliersList || []).find((s: any) => 
    (s.name || '').trim().toLowerCase() === supplierName.trim().toLowerCase() ||
    (s.supplierCode || '').trim().toLowerCase() === supplierName.trim().toLowerCase() ||
    (s.name && supplierName.includes(s.name)) ||
    (supplierName && s.name && s.name.includes(supplierName))
  );

  if (matched?.shortCode && matched.shortCode.trim()) {
    return matched.shortCode.trim().toUpperCase();
  }

  // 2. 주요 공급업체 사전 정의 약어 매핑
  const clean = supplierName.replace(/\(주\)|주식회사|\s+/g, '');
  if (clean.includes('투에이취켐') || clean.includes('투에이치') || clean.includes('2H')) return '2H';
  if (clean.includes('정일산') || clean.includes('정일')) return 'JS';
  if (clean.includes('램베이스') || clean.includes('람베이스') || clean.includes('LAM')) return 'LAM';
  if (clean.includes('아이오') || clean.includes('아이오트레이딩') || clean.includes('IO')) return 'IO';
  if (clean.includes('케이엠') || clean.includes('KM')) return 'KM';
  if (clean.includes('폴린트') || clean.includes('폴린트컴포지트') || clean.includes('PCK')) return 'PCK';
  if (clean.includes('하나테크') || clean.includes('하나')) return 'HT';
  if (clean.includes('코리아피티지') || clean.includes('PTG')) return 'PTG';
  if (clean.includes('동성케미컬') || clean.includes('동성')) return 'DS';
  if (clean.includes('삼양') || clean.includes('삼양사')) return 'SY';
  if (clean.includes('LG') || clean.includes('엘지')) return 'LG';
  if (clean.includes('SK') || clean.includes('에스케이')) return 'SK';
  if (clean.includes('한화') || clean.includes('HANWHA')) return 'HW';
  if (clean.includes('롯데') || clean.includes('LOTTE')) return 'LT';

  // 3. supplierCode가 의미있는 영문 코드인 경우
  if (matched?.supplierCode && matched.supplierCode.length >= 2 && !matched.supplierCode.match(/^S\d{4}$/i)) {
    return matched.supplierCode.toUpperCase();
  }

  // 4. 영문 약어가 없을 경우 이름 앞 2~3글자 추출 (알파벳 우선, 한글이면 초성/약칭)
  const engMatch = clean.match(/[a-zA-Z0-9]+/g);
  if (engMatch && engMatch.length > 0) {
    return engMatch.join('').substring(0, 3).toUpperCase();
  }

  return clean.substring(0, 2).toUpperCase();
};

/**
 * 특정 공급업체에 대한 다음 고유 발주번호(PO Number)를 자동 채번합니다.
 * 포맷: YSACC/YS - 년도2자리(26) - 업체약자 - 2자리연번(01, 02...)
 * 
 * @param issuingCompany 'YS' | 'YSACC'
 * @param dateStr '2026-08-24' or Date
 * @param supplierName 공급업체명
 * @param suppliersList 공급업체 목록
 * @param allExistingPoNumbers 시스템에 존재하는 모든 발주번호 배열
 * @param currentPoNumber 이미 현재 오더에 저장된 번호가 있다면 우선 반환
 */
export const generateSupplierPoNumber = (
  issuingCompany: string = 'YSACC',
  dateStr: string = '',
  supplierName: string,
  suppliersList: any[] = [],
  allExistingPoNumbers: string[] = [],
  currentPoNumber?: string
): string => {
  // 이미 확정/저장된 발주번호가 있는 경우 유지
  if (currentPoNumber && currentPoNumber.trim() && !currentPoNumber.startsWith('CI-YSACC-PI-YSACC') && !currentPoNumber.startsWith('CI-YS-PI-YS')) {
    return currentPoNumber.trim();
  }

  const prefix = (issuingCompany === 'YS') ? 'YS' : 'YSACC';
  
  let yearStr = '26';
  if (dateStr) {
    const matchYear = dateStr.match(/\b(20)?(\d{2})\b/);
    if (matchYear) {
      yearStr = matchYear[2];
    }
  } else {
    yearStr = new Date().getFullYear().toString().slice(-2);
  }

  const shortCode = getSupplierShortCode(supplierName, suppliersList);

  // 해당 공급업체 약어 및 패턴과 일치하는 기존 발주번호들 검색하여 최대 연번 추출
  let maxSeq = 0;
  const regex = new RegExp(`(?:YSACC|YS)[-_]${yearStr}[-_]${shortCode}[-_](\\d+)`, 'i');

  allExistingPoNumbers.forEach(po => {
    if (!po) return;
    const match = po.match(regex);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  });

  const nextSeq = maxSeq + 1;
  const seqStr = String(nextSeq).padStart(2, '0');

  return `${prefix}-${yearStr}-${shortCode}-${seqStr}`;
};
