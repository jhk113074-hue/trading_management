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

export interface ImportRequest {
  id: string;
  status: string;
  blAwb?: string;
  poNumber?: string;
  piNumber?: string;
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
  
  // PI / 운송비 견적서 유첨 파일 데이터
  customerPiFile?: { name: string; url: string; path?: string } | null;
  freightInvoiceFile?: { name: string; url: string; path?: string } | null;
  piItemName?: string;
  piItemQty?: string;
  piItemUnitPrice?: string;
  piItemAmount?: string;
  freightInvoiceAmount?: string;
  piItems?: Array<{ name: string; qty: string; unitPrice: string; amount: string; hsCode?: string; unit?: string; palletSize?: string; cbm?: string; weight?: string; netWeight?: string; grossWeight?: string }>;
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

  // 문서함 (Firestore 이관: key별 {name,url})
  documents?: { [key: string]: { name: string; url: string; path?: string } };

  // ── 1단계: 수입요청 접수 ──
  requestDate?: string; // 고객사 수입요청 접수일
  requestedBy?: string; // 고객사 담당자
  requestNote?: string; // 요청 상세 내용

  // ── 2단계: 견적/원가 산정 ──
  supplierQuotes?: Array<{
    id: string;
    supplierId?: string;
    supplierName: string;
    itemName?: string;
    amount: number;
    currency?: string; // USD/CNY/KRW 등
    quoteDate?: string;
    file?: { name: string; url: string; path?: string } | null;
    note?: string;
  }>;
  costBreakdown?: {
    productCost?: number; // 제품 원가 (KRW 환산)
    freightCost?: number; // 예상 운임
    customsCost?: number; // 예상 관세/통관비
    otherCost?: number; // 기타 비용
    // 엑셀 수입원가 고도화 필드
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
  paymentCollectedDate?: string; // 대금 수령일
  paymentCollectedAmount?: number; // 수령 금액

  // ── 6단계: 손익검토 (최종) ──
  profitReviewNote?: string; // 검토 코멘트 (마진 차이 원인 등)
  profitReviewedBy?: string; // 검토자
  profitReviewedDate?: string; // 검토 완료일
  profitReviewCompleted?: boolean; // 손익검토 완료 여부
}
