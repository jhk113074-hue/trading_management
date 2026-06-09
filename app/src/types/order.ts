export interface OrderItem {
  itemId: string;
  name: string;
  supplier: string;
  supplierContact: string;
  grade: string;
  qty: number;
  unit: "kg" | "MT" | "L" | "drum" | "set";
  unitPrice: number;
  amount: number;
  currency: "USD" | "KRW";
}

export interface Order {
  id: string; // PO-YYYY-NNNN
  custPo: string;
  quotationId: string;
  customer: string;
  manager: string;
  incoterms: "CIF HCM" | "FOB" | "EXW" | "CFR" | "DAP" | "DDP" | "";
  paymentTerms: string;
  poDate: string; // YYYY-MM-DD
  requestedDelivery: string;
  remark: string;
  status: "대기" | "발행완료" | "선적&진행현황" | "CI,PL작성" | "수출신고" | "COO,BL 작성" | "선적서류 발송" | "각업체별 대금결재" | "이익관리";
  items: OrderItem[];
  totalAmount: number;
  currency: "USD" | "KRW" | "mixed";
  exchangeRate?: number;
  poIssuedAt: any | null;
  createdAt: any;
  updatedAt: any;
  externalLinks?: string[]; // Dropbox / Google Drive links
  attachments?: Array<{ name: string; url: string; size: number; path: string }>;
  issuingCompany?: 'YSACC' | 'YS';
  
  // New progress tracking fields
  ciNumber?: string; // CI번호 확정
  vesselBooking?: string; // Vessel 부킹
  forwarderConfirmed?: string; // 포워더확정
  cargoReadyDate?: string; // 화물준비일
  cfsEntryDate?: string; // CFS입고일
  cfsContactInfo?: string; // CFS주소 및 담당자 정보
  docCutoffDate?: string; // 서류마감일
  etd?: string; // ETD
  eta?: string; // ETA
  containerVolumeQuantities?: string; // Container Volume and quantities
  exportDeclarationNo?: string; // 수출신고번호
  lcNo?: string; // LC번호
  customsExchangeRate?: number; // 면장환율
  dispatchStatusByVendor?: string; // 거래처별 배차여부
  containerWorkspaceType?: 'CFS' | 'Door' | ''; // 콘테이너작업장 (CFS/Door)
  shipmentCompleted?: 'Y' | 'N' | ''; // 선적완료여부
  docsSentOrBankSubmitted?: string; // 선적서류발송/은행제출여부
  purchaseCertificateByVendor?: string; // 구매확인서(업체별, 여부)
  paymentStatusByVendor?: string; // 대금지급(업체별여부)

  // 9-step updates
  isLc?: 'Y' | 'N' | ''; // LC 여부
  supplierPoSent?: Record<string, boolean>; // 업체별 발주서 발송완료 여부
  supplierProductionDates?: Record<string, string>; // 업체별 생산완료일
  forwarderQuotationAmount?: number; // 포워더 견적금액
  cfsAddress?: string; // CFS 주소
  cfsContact?: string; // CFS 담당자 정보
  ciPlStatus?: 'Y' | 'N' | ''; // CI, PL 작성여부
  containerWorkStatus?: string; // 컨테이너 작업 내용
  cooStatus?: 'Y' | 'N' | ''; // COO 작성여부
  blStatus?: 'Y' | 'N' | ''; // B/L 작성여부
  shippingDocsSentStatus?: 'Y' | 'N' | ''; // 선적서류 발송 여부
  shippingDocsSentDate?: string; // 발송일자
  shippingDocsTrackingNo?: string; // Tracking 번호
  supplierPayments?: Record<string, { status: string; date: string; }>; // 업체별 대금결재 상태
}
