export const STAGE_KEYS = ['수주정보', '소싱발주', '물류선적', '서류관리', '정산결제'] as const;
export type StageKey = typeof STAGE_KEYS[number];

export type CompletionMap = Record<StageKey, Record<string, boolean>>;

/**
 * Calculates overall order progress (%) across all 5 stages.
 * Filter key for non-L/C orders: 'L/C 정보 입력'
 */
export function getOverallProgress(
  stageCompletion: CompletionMap | undefined,
  isLc: string | undefined
): { done: number; total: number; pct: number } {
  const sc = stageCompletion;
  if (!sc) return { done: 0, total: 0, pct: 0 };

  const allKeys = STAGE_KEYS.flatMap((k) => {
    const keys = Object.keys(sc[k] || {});
    if (k === '수주정보' && isLc !== 'Y') {
      return keys.filter((x) => x !== 'L/C 정보 입력' && x !== 'L/C 거래 상세 정보 입력');
    }
    return keys;
  });

  const allDone = STAGE_KEYS.flatMap((k) => {
    const entries = Object.entries(sc[k] || {});
    let validEntries = entries;
    if (k === '수주정보' && isLc !== 'Y') {
      validEntries = entries.filter(([x]) => x !== 'L/C 정보 입력' && x !== 'L/C 거래 상세 정보 입력');
    }
    return validEntries.map(([, v]) => v).filter(Boolean);
  });

  if (allKeys.length === 0) return { done: 0, total: 0, pct: 0 };
  return {
    done: allDone.length,
    total: allKeys.length,
    pct: Math.round((allDone.length / allKeys.length) * 100),
  };
}

/**
 * Calculates progress for a specific stage.
 * Filter key for non-L/C orders in stage '수주정보': 'L/C 정보 입력' & 'L/C 거래 상세 정보 입력'
 */
export function getStageProgress(
  stageCompletion: CompletionMap | undefined,
  isLc: string | undefined,
  stage: StageKey
): { done: number; total: number; pct: number } {
  let items = { ...((stageCompletion || {})[stage] || {}) };
  if (stage === '수주정보' && isLc !== 'Y') {
    delete items['L/C 정보 입력'];
    delete items['L/C 거래 상세 정보 입력'];
  }
  const total = Object.keys(items).length;
  const done = Object.values(items).filter(Boolean).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return { done, total, pct };
}
