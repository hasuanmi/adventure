// Completion 契约（P1；流程形态参考 StaffScheduler：提交→pending→reviewer 决策→最终业务副作用）

export const COMPLETION_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type CompletionStatus = (typeof COMPLETION_STATUSES)[number];

export const COMPLETION_TRANSITIONS: Record<CompletionStatus, CompletionStatus[]> = {
  pending: ['approved', 'rejected'],
  approved: [],
  rejected: [],
};

export interface TaskCompletionDto {
  id: string;
  taskId: string;
  childId: string;
  note?: string | null;
  evidenceJson?: unknown;
  submittedAt: string;
  status: CompletionStatus;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewComment?: string | null;
  approvalRequestId?: string | null;
}

export interface SubmitCompletionRequest {
  note?: string;
  evidenceJson?: unknown;
}

export const COMPLETION_REASON = {
  NOT_FOUND: 'completion_not_found',
  NOT_OWNER: 'not_owner',
  TASK_COMPLETED: 'task_completed',
  ALREADY_PENDING: 'already_pending',
  ILLEGAL_TRANSITION: 'illegal_transition',
  FORBIDDEN: 'forbidden',
} as const;
export type CompletionReason = (typeof COMPLETION_REASON)[keyof typeof COMPLETION_REASON];
