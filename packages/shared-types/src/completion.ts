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
  /** 完成凭证（检查人/家长可见）：文字与全部附件 */
  proofs?: {
    kind: string;
    text?: string | null;
    fileKey?: string | null;
    fileName?: string | null;
    mime?: string | null;
    size?: number | null;
  }[];
}

export interface SubmitCompletionRequest {
  note?: string;
  evidenceJson?: unknown;
  /** 完成凭证：文字（与 proofFileKeys 至少一项） */
  proofText?: string;
  /** 完成凭证：文件 key 列表（数量不限） */
  proofFileKeys?: string[];
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
