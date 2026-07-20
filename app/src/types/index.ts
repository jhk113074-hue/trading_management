export type Visibility = 'PUBLIC' | 'RESTRICTED' | 'PRIVATE';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'HOLDING' | 'UPCOMING';
export type TaskType = 'PROJECT' | 'DAILY' | 'PERIODIC' | 'DELEGATED';
export type ScheduleType = 'SELF' | 'SCHEDULED' | 'PERIODIC' | 'REQUESTED';
export type Quadrant = 'Q1' | 'Q2' | 'Q3' | 'Q4';

export interface User {
  id: string;
  name: string;
  role: string;
  roleCode?: 'ADMIN' | 'MANAGER' | 'USER';
  avatar?: string;
  email?: string;
  department?: string;
  position?: string;
  createdAt?: string;
  joinDate?: string;
}

export interface Project {
  id: string;
  name: string;
  status: 'ACTIVE' | 'COMPLETED';
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  type: TaskType;
  scheduleType: ScheduleType;
  projectId?: string;
  projectName?: string;
  assigneeId: string;
  assigneeName?: string;
  requesterId?: string;
  requesterName?: string;
  customerName?: string;
  meetingPerson?: string;
  importance: string; // 'A' | 'B' | 'C'
  urgency: number; // 1-10
  quadrant: Quadrant;
  startDate?: string;
  dueDate?: string;
  recurrence?: string;
  recurrenceEndDate?: string;
  externalFileLink?: string;
  externalFileLinks?: string[];
  visibility: Visibility;
  allowedUserIds?: string[];
  isPrivateNoteSeparated?: boolean;
  createdAt: string;
  createdBy?: string;
  updatedAt?: string;
  completedAt?: string;
  commentCount?: number;
  lastCommentAt?: string;
  // relations
  taskAssignees?: string[];
}

export interface TaskActivityLog {
  id: string;
  taskId: string;
  actionType: 'CREATE' | 'MOVE' | 'COMPLETE' | 'COMMENT' | 'ATTACH' | 'ASSIGN' | 'UPDATE';
  fromValue?: string;
  toValue?: string;
  actionDesc: string;
  actionBy: string;
  actionAt: string;
}

export interface TaskPrivateNote {
  noteId: string;
  taskId: string;
  noteText: string;
  visibleToUserIds: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskComment {
  id: string;
  taskId: string;
  content: string;
  createdBy: string;
  creatorName: string;
  createdAt: string;
}

export interface TaskChecklist {
  id: string;
  taskId: string;
  content: string;
  isCompleted: boolean;
}

export interface TaskAttachment {
  id: string;
  taskId: string;
  fileName: string;
  filePath: string;
  fileExt: string;
  fileSize: number;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: string;
}

export interface RecurringTaskRule {
  id: string;
  title: string;
  cronExpression: string;
  assigneeId: string;
  isActive: boolean;
}

export interface TaxDocumentRow {
  id: string;
  type: '세금계산서' | '거래명세표' | '영수증' | '기타';
  issueDate: string;
  docNumber: string;
  supplyAmount: number;
  vatAmount: number;
  grandTotal: number;
  remarks: string;
}

export interface ImportRequest {
  id: string;
  taxDocumentRows?: TaxDocumentRow[];
  importTaxDocumentRows?: TaxDocumentRow[];
  freightTaxDocumentRows?: TaxDocumentRow[];
  customsTaxDocumentRows?: TaxDocumentRow[];
  status: string;
  blAwb?: string;
  poNumber?: string;
  piNumber?: string;
  ciNumber?: string;
  ciDate?: string;
  quoteNumber?: string;
  forwarderName?: string;
  itemName: string;
  transportType: string;
  volume: string;
  routeFrom: string;
  routeTo: string;
  manager: string;
  amount: number;
  createdAt: string;
  importCompany?: 'YSACC' | 'YS' | ''; // 수입주체
  importerName?: string; // 수입처
  finalCustomer?: string; // 최종고객
  origin?: string; // 원산지 (Origin)
  
   // PI / 운송비 견적서/ 수입처 PI 유첨 파일 데이터
  customerPiFile?: { name: string; url: string; path?: string }[] | { name: string; url: string; path?: string } | null;
  freightInvoiceFile?: { name: string; url: string; path?: string }[] | { name: string; url: string; path?: string } | null;
  supplierPiFile?: { name: string; url: string; path?: string }[] | { name: string; url: string; path?: string } | null;
  piItemName?: string;
  piItemQty?: string;
  piItemUnitPrice?: string;
  piItemAmount?: string;
  freightInvoiceAmount?: string;
  piItems?: Array<{ name: string; qty: string; unitPrice: string; amount: string; hsCode?: string; unit?: string; palletSize?: string; cbm?: string; weight?: string; netWeight?: string; grossWeight?: string; productId?: string }>;
  incoterms?: string;
  paymentTerms?: string;
  pol?: string;
  pod?: string;
  packingPallets?: Array<{ palletSize: string; qty: string; cbm: string; weight: string }>;
  
  
  // 상세
  portOfLoading?: string;
  portOfDischarge?: string;
  vesselName?: string;
  etd?: string;
  eta?: string;
  shipperName?: string;
  shipperPhone?: string;
  shipperEmail?: string;
  packingQty?: number;
  packingUnit?: string;
  dimensions?: string;
  weight?: string;
  dangerousCargo?: string;
  msdsStatus?: string;
  lssIncluded?: string;
  localTransportType?: string;
  customsAgent?: string;
  customsAgentId?: string;
  cargoInsurance?: string;
  ftaOriginCert?: string;
  taxAmount?: number;
  taxVat?: number;
  freightAmount?: number;
  freightVat?: number;
  customsTaxAmount?: number;
  
  supplierBankInfo?: {
    bankName?: string;
    swiftCode?: string;
    accountNumber?: string;
    accountName?: string;
    beneficiaryAddress?: string;
    bankAddress?: string;
  };
  payments?: Array<{
    id: string;
    round: number;
    date: string;
    amountUsd: number;
    amountKrw: number;
    currency?: 'USD' | 'RMB' | 'EUR' | 'KRW';
    amount?: number;
    fxMemoFiles?: Array<{ name: string; url: string; path?: string }>;
    remittanceSlipFiles?: Array<{ name: string; url: string; path?: string }>;
    remarks?: string;
  }>;

  // 문서함 (Firestore 이관: key별 {name,url})
  documents?: { [key: string]: { name: string; url: string; path?: string } };

  // 거래명세표 개별 관리 정보
  dealStatementName?: string;
  dealStatementBizNo?: string;
  dealStatementCEO?: string;
  dealStatementAddr?: string;
  dealStatementType?: string;
  dealStatementItem?: string;
  dealStatementItems?: Array<{
    month: string;
    day: string;
    name: string;
    spec: string;
    qty: number;
    price: number;
    remarks: string;
    currency?: 'KRW' | 'USD';
  }>;
  dealStatementReceivable?: number;
  dealStatementCurrency?: 'KRW' | 'USD';
  settlementBasis?: 'TAX_INVOICE' | 'DEAL_STATEMENT';

  // ── 1단계: 수입요청 접수 ──
  requestDate?: string; // 고객사 수입요청 접수일
  requestedBy?: string; // 고객사 담당자
  requestNote?: string; // 요청 상세 내용

  // ── 2단계: 견적수령 및 네고 ──
  supplierQuotes?: Array<{
    id: string;
    supplierId?: string;
    supplierName: string;
    itemName?: string;
    amount: number; // 현재 협상 금액 (네고 중 바뀌면 이 값을 직접 수정)
    currency?: string; // USD/CNY/KRW 등
    quoteDate?: string; // 견적 접수일
    file?: { name: string; url: string; path?: string } | null;
    note?: string; // 협상 메모 (예: "1차 3.8→3.6 협의")
    status?: '검토중' | '네고중' | '확정' | '거절'; // 이 공급사 견적의 진행 상태
    itemIndices?: number[]; // 이 견적이 커버하는 piItems의 인덱스 목록 (다품목일 때 품목별로 다른 공급사 사용 가능). 미지정 시 전체 품목으로 간주.
  }>;
  costBreakdown?: {
    productCost?: number; // 제품 원가 (KRW 환산)
    freightCost?: number; // 예상 운임
    customsCost?: number; // 예상 관세/통관비
    otherCost?: number; // 기타 비용
    incoterms?: string;
    freightUsd?: number;
    insuranceUsd?: number;
    originInlandUsd?: number;
    clearanceFee?: number;
    portFee?: number;
    domesticTransportFee?: number;
    handlingFee?: number;
    otherFee?: number;
    todayExchangeRate?: number;    // 오늘환율 (예: 1430)
    appliedExchangeRate?: number;  // 수입기준환율 (예: 1450)
    buyingPriceUsd?: number;       // 외화 단가 (USD)
    buyingQty?: number;            // 수량
    ftaTaxRate?: number;           // FTA 관세율 (%)
    antiDumpingRate?: number;      // 반덤핑세율 (%)
    transferFee?: number;          // 송금/통관 수수료 (원화)
    importDeclareFee?: number;     // 통관 대행료/수수료 (원화)
    localTransportCost?: number;   // 국내비용 + 내륙운송비 (원화)
  };
  marginRate?: number; // 마진율 (%)
  marginAmount?: number; // 마진 금액 (KRW)
  customerQuoteAmount?: number; // 고객 제시 견적금액 (원가+마진)
  customerQuoteFile?: { name: string; url: string; path?: string } | null;
  customerDecision?: '검토중' | '승인' | '보류' | '거절';
  customerDecisionDate?: string;

  // ── 5단계: 정산/완료 (고객사 청구) ──
  dealStatementSentDate?: string; // 거래명세표 발송일
  dealStatementConfirmedDate?: string; // 고객 확인일
  taxInvoiceNumber?: string; // 세금계산서 승인번호
  taxInvoiceIssuedDate?: string; // 세금계산서 발행일
  taxInvoiceItemName?: string; // 세금계산서 품명
  taxInvoiceUnitPrice?: number; // 세금계산서 단가
  taxInvoiceTotalAmount?: number; // 세금계산서 총액
  taxInvoiceVat?: number; // 세금계산서 부가세
  taxInvoiceGrandTotal?: number; // 세금계산서 합계
  paymentCollectedDate?: string; // 대금 수령일
  paymentCollectedAmount?: number; // 수령 금액 (총액 호환성용)
  collections?: Array<{
    id: string;
    round: number;
    date: string;
    amount: number;
    remarks?: string;
  }>;

  // ── 6단계: 손익검토 (최종) ──
  profitReviewNote?: string; // 검토 코멘트 (마진 차이 원인 등)
  profitReviewedBy?: string; // 검토자
  profitReviewedDate?: string; // 검토 완료일
  profitReviewCompleted?: boolean; // 손익검토 완료 여부

  // ── 수입관리(실무) 전용: 실행/정산 원가 ──
  // costBreakdown은 "견적 시점" 예상원가로 그대로 두고,
  // 실제 청구서 기준 확정 금액은 actualCostBreakdown에 별도로 입력한다.
  actualCostBreakdown?: {
    incoterms?: string;
    freightUsd?: number;
    insuranceUsd?: number;
    originInlandUsd?: number;
    clearanceFee?: number;
    portFee?: number;
    domesticTransportFee?: number;
    handlingFee?: number;
    otherFee?: number;
    appliedExchangeRate?: number;  // 실제 결제/정산 기준 환율
    buyingPriceUsd?: number;       // 실제 청구된 외화 단가 (USD)
    buyingQty?: number;            // 실제 수량
    ftaTaxRate?: number;           // 실제 관세율 (%)
    antiDumpingRate?: number;      // 실제 반덤핑세율 (%)
  };
  settlementCompleted?: boolean;  // 수입원가 정산완료 여부
  settledAt?: string;             // 정산완료 처리일
  settledBy?: string;             // 정산 처리자
}

export * from './credential';

