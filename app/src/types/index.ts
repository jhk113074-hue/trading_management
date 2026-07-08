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
}
