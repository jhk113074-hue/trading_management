export const STAGE_KEYS = ['수주정보', '소싱발주', '물류선적', '서류관리', '정산결제'] as const;
export type StageKey = typeof STAGE_KEYS[number];

export type CompletionMap = Record<StageKey, Record<string, boolean>>;

export const DEFAULT_STAGE_COMPLETION: CompletionMap = {
  수주정보: {
    '확정 CI 번호 입력': false,
    '인코텀즈/결제조건 입력': false,
    'L/C 거래 상세 정보 입력': false,
  },
  소싱발주: {
    '발주서 발행 및 저장': false,
  },
  물류선적: {
    '포워딩/운송사 및 수출 Volume 선택': false,
    'ETD 입력': false,
    '도착보고 발송 완료': false,
  },
  서류관리: {
    '수출신고번호 입력': false,
    'CI, PL, COO, BL 서류 업로드 완료': false,
  },
  정산결제: {
    '세금계산서 발행 완료': false,
    '입금 진행 완료': false,
    '공급업체 대금 결제 완료': false,
    '수금 관리 완료': false,
  },
};

/**
 * Computes effective stageCompletion map by combining default structure,
 * dynamic field auto-detection from order object, and saved manual overrides.
 */
export function getEffectiveStageCompletion(order: any): CompletionMap {
  const sc: CompletionMap = {
    수주정보: { ...DEFAULT_STAGE_COMPLETION.수주정보 },
    소싱발주: { ...DEFAULT_STAGE_COMPLETION.소싱발주 },
    물류선적: { ...DEFAULT_STAGE_COMPLETION.물류선적 },
    서류관리: { ...DEFAULT_STAGE_COMPLETION.서류관리 },
    정산결제: { ...DEFAULT_STAGE_COMPLETION.정산결제 },
  };

  if (!order) return sc;

  const basic = order.basicForm || order;
  const isLc = basic.isLc || order.isLc;

  // 1. 수주정보 Auto Detect
  if (basic.ciNumber || order.ciNumber || order.id) {
    sc.수주정보['확정 CI 번호 입력'] = true;
  }
  if ((basic.incoterms || order.incoterms) && (basic.paymentTerms || order.paymentTerms)) {
    sc.수주정보['인코텀즈/결제조건 입력'] = true;
  }
  if (isLc === 'Y') {
    if ((basic.lcNo || order.lcNo) && (basic.lcIssuingBank || order.lcIssuingBank) && (basic.lcIssuingDate || order.lcIssuingDate)) {
      sc.수주정보['L/C 거래 상세 정보 입력'] = true;
    }
  } else {
    sc.수주정보['L/C 거래 상세 정보 입력'] = true;
  }

  // 2. 소싱발주 Auto Detect
  const hasSentPo = basic.supplierPoSent || order.supplierPoSent || (order.issuedDocs && order.issuedDocs.length > 0);
  if (hasSentPo) {
    sc.소싱발주['발주서 발행 및 저장'] = true;
  }

  // 3. 물류선적 Auto Detect
  const hasForwarder = (order.forwardersList && order.forwardersList.length > 0) || (order.forwarders && order.forwarders.length > 0) || order.forwarderName || basic.forwarderName;
  const hasVolume = basic.shipmentType || order.shipmentType;
  if (hasForwarder && hasVolume) {
    sc.물류선적['포워딩/운송사 및 수출 Volume 선택'] = true;
  }
  if (basic.etd || order.etd) {
    sc.물류선적['ETD 입력'] = true;
  }
  if (basic.arrivalReportSent || order.arrivalReportSent || (order.issuedDocs?.some((d: any) => d.fileName?.startsWith('도착보고서')))) {
    sc.물류선적['도착보고 발송 완료'] = true;
  }

  // 4. 서류관리 Auto Detect
  if (basic.exportDeclarationNo || order.exportDeclarationNo) {
    sc.서류관리['수출신고번호 입력'] = true;
  }
  const isDocsUploaded = ((order.ciFiles?.length || basic.ciFiles?.length) || (order.plFiles?.length || basic.plFiles?.length)) &&
                         (order.cooFiles?.length || basic.cooFiles?.length) &&
                         (order.blFiles?.length || basic.blFiles?.length);
  if (isDocsUploaded) {
    sc.서류관리['CI, PL, COO, BL 서류 업로드 완료'] = true;
  }

  // 5. 정산결제 Auto Detect
  const taxInvoiceDetails = basic.supplierTaxInvoiceDetails || order.supplierTaxInvoiceDetails;
  if (order.taxInvoiceNo) {
    sc.정산결제['세금계산서 발행 완료'] = true;
  } else if (taxInvoiceDetails && typeof taxInvoiceDetails === 'object') {
    const taxKeys = Object.keys(taxInvoiceDetails);
    if (taxKeys.length > 0 && taxKeys.some(k => {
      const d = taxInvoiceDetails[k];
      if (Array.isArray(d)) return d.some((x: any) => !!(x?.invoiceNo || x?.issueDate || x?.approvalNo));
      return !!((d as any)?.invoiceNo || (d as any)?.issueDate || (d as any)?.approvalNo);
    })) {
      sc.정산결제['세금계산서 발행 완료'] = true;
    }
  }

  if (basic.paymentCollectedDate || order.paymentCollectedDate || (basic.paymentCollectedInstallments || order.paymentCollectedInstallments)?.some((i: any) => (i.amount || 0) > 0)) {
    sc.정산결제['입금 진행 완료'] = true;
  }

  const supplierPayments = basic.supplierPayments || order.supplierPayments;
  if (order.supplierPaymentStatus === 'COMPLETED') {
    sc.정산결제['공급업체 대금 결제 완료'] = true;
  } else if (supplierPayments && typeof supplierPayments === 'object') {
    const spKeys = Object.keys(supplierPayments);
    if (spKeys.length > 0 && spKeys.some(k => {
      const sp = supplierPayments[k];
      return sp?.status === '결제완료' || sp?.status === '입금완료' || (sp?.amount || 0) > 0 || !!sp?.paidDate;
    })) {
      sc.정산결제['공급업체 대금 결제 완료'] = true;
    }
  }
  const installments = basic.paymentCollectedInstallments || order.paymentCollectedInstallments || [];
  const totalCollected = installments.reduce((sum: number, i: any) => sum + (Number(i.amount) || 0), 0);
  if (order.collectionStatus === 'COMPLETED' || totalCollected > 0) {
    sc.정산결제['수금 관리 완료'] = true;
  }

  // Merge saved Firestore stageCompletion & manual overrides
  const savedSC = order.stageCompletion;
  const overrides = order.stageCompletionOverride || {};
  if (savedSC && typeof savedSC === 'object') {
    (Object.keys(DEFAULT_STAGE_COMPLETION) as StageKey[]).forEach((sk) => {
      if (savedSC[sk] && typeof savedSC[sk] === 'object') {
        Object.entries(savedSC[sk]).forEach(([itemKey, val]) => {
          const overrideKey = `${sk}__${itemKey}`;
          if (overrides[overrideKey]) {
            sc[sk][itemKey] = false;
          } else if (val === true) {
            sc[sk][itemKey] = true;
          }
        });
      }
    });
  }

  return sc;
}

/**
 * Calculates overall order progress (%) across all 5 stages.
 * Filter key for non-L/C orders: 'L/C 정보 입력' & 'L/C 거래 상세 정보 입력'
 */
export function getOverallProgress(
  stageCompletionOrOrder: CompletionMap | any | undefined,
  isLcParam?: string | undefined
): { done: number; total: number; pct: number } {
  let sc: CompletionMap;
  let isLc = isLcParam;

  if (!stageCompletionOrOrder) {
    sc = DEFAULT_STAGE_COMPLETION;
  } else if ('수주정보' in stageCompletionOrOrder && '소싱발주' in stageCompletionOrOrder) {
    sc = stageCompletionOrOrder as CompletionMap;
  } else {
    sc = getEffectiveStageCompletion(stageCompletionOrOrder);
    if (!isLc) {
      isLc = stageCompletionOrOrder.isLc || stageCompletionOrOrder.basicForm?.isLc;
    }
  }

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
  stageCompletionOrOrder: CompletionMap | any | undefined,
  isLcParam: string | undefined,
  stage: StageKey
): { done: number; total: number; pct: number } {
  let sc: CompletionMap;
  let isLc = isLcParam;

  if (!stageCompletionOrOrder) {
    sc = DEFAULT_STAGE_COMPLETION;
  } else if ('수주정보' in stageCompletionOrOrder && '소싱발주' in stageCompletionOrOrder) {
    sc = stageCompletionOrOrder as CompletionMap;
  } else {
    sc = getEffectiveStageCompletion(stageCompletionOrOrder);
    if (!isLc) {
      isLc = stageCompletionOrOrder.isLc || stageCompletionOrOrder.basicForm?.isLc;
    }
  }

  let items = { ...((sc || {})[stage] || {}) };
  if (stage === '수주정보' && isLc !== 'Y') {
    delete items['L/C 정보 입력'];
    delete items['L/C 거래 상세 정보 입력'];
  }
  const total = Object.keys(items).length;
  const done = Object.values(items).filter(Boolean).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return { done, total, pct };
}
