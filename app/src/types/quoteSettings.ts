export interface QuoteSettings {
  exchangeRateDiff: number; // 실시간 USD 환율 대비 가감차액 (KRW, 예: -50)
  defaultMarginRate?: number; // 기본 마진율 (%, 예: 15)
  defaultValidityDays?: number; // 기본 유효기간 (일, 예: 30)
  updatedAt?: any;
  updatedBy?: string;
}

export const DEFAULT_QUOTE_SETTINGS: QuoteSettings = {
  exchangeRateDiff: -50,
  defaultMarginRate: 15,
  defaultValidityDays: 30,
};
