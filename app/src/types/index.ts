export type Visibility = 'PUBLIC' | 'RESTRICTED' | 'PRIVATE';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'HOLDING';
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
