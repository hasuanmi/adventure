// Approval 契约（P1；状态机复用 StaffScheduler ApprovalStateMachine 模式；决策求值参考 Quorum evaluateWithCounts）

export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

/** 单步审批状态转移表（V1 不做多级；非法转移 → 409） */
export const APPROVAL_TRANSITIONS: Record<ApprovalStatus, ApprovalStatus[]> = {
  pending: ['approved', 'rejected', 'cancelled'],
  approved: [],
  rejected: [],
  cancelled: [],
};

export const APPROVAL_BUSINESS_TYPES = ['task_completion'] as const;
export type ApprovalBusinessType = (typeof APPROVAL_BUSINESS_TYPES)[number];

export type ApprovalDecision = 'approve' | 'reject';

/**
 * 业务对象描述（只读展示用）：由业务模块注册解析器提供，审批模块保持业务无关。
 * 典型用途：列表里显示"这条审批是关于哪个任务的"，并给出可跳转的 taskId。
 */
export interface ApprovalDescriptor {
  label: string;
  taskId?: string | null;
  /** 完成凭证（检查人/家长在审批列表直接可见）：文字与全部附件 */
  proofs?: {
    kind: string;
    text?: string | null;
    fileKey?: string | null;
    fileName?: string | null;
    mime?: string | null;
    size?: number | null;
  }[];
}

export interface ApprovalRequestDto {
  id: string;
  familyId: string;
  childId: string;
  businessType: string;
  businessId: string;
  applicantId: string;
  reviewerId: string;
  status: ApprovalStatus;
  comment?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  /** 当前查看者是否可操作（Quorum CanViewerAct 思想：只读预判，UI 按钮显隐） */
  canAct?: boolean;
  /** 业务对象描述（可选；由业务模块注册的解析器提供） */
  descriptor?: ApprovalDescriptor | null;
}

export interface ApprovalRecordDto {
  id: string;
  requestId: string;
  action: string;
  actorId: string;
  comment?: string | null;
  createdAt: string;
}

export interface CreateApprovalRequest {
  businessType: ApprovalBusinessType;
  businessId: string;
  applicantId: string;
  reviewerId: string;
  comment?: string;
}

export interface DecideApprovalRequest {
  comment?: string;
}

export const APPROVAL_REASON = {
  NOT_FOUND: 'approval_not_found',
  NOT_PENDING: 'approval_not_pending',
  NOT_REVIEWER: 'not_reviewer',
  SELF_REVIEW_FORBIDDEN: 'self_review_forbidden',
  NOT_APPLICANT: 'not_applicant',
  UNKNOWN_BUSINESS_TYPE: 'unknown_business_type',
  ILLEGAL_TRANSITION: 'illegal_transition',
  CONFLICT: 'approval_conflict',
  FORBIDDEN: 'forbidden',
} as const;
export type ApprovalReason = (typeof APPROVAL_REASON)[keyof typeof APPROVAL_REASON];
