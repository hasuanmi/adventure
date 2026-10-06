// Task 契约（P1；状态矩阵 = v1.2 §8.2 产品规则；状态机实现参考 StaffScheduler ApprovalStateMachine 模式）

export const TASK_STATUSES = ['pending', 'in_progress', 'completed', 'returned'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** v1.2 §8.2 任务状态转换矩阵 */
export const TASK_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ['in_progress', 'completed'],
  in_progress: ['completed'],
  completed: [],
  returned: ['in_progress', 'completed'],
};

export type TaskStatusAction = 'start' | 'complete' | 'resume';

export interface TaskDto {
  id: string;
  familyId: string;
  childId: string;
  title: string;
  description?: string | null;
  subject?: string | null;
  priority: number;
  startAt?: string | null;
  endAt?: string | null;
  dueDate?: string | null;
  /** 预计用时（分钟；仅展示，不参与日程定位） */
  estimatedMinutes?: number | null;
  /** 8 预设色之一（huahuastudy 色板；日程/卡片用色） */
  color?: string | null;
  /** 重复：位掩码 bit0=周一 … bit6=周日；0/空 = 不重复（仅日程展示层展开） */
  repeatWeekdays?: number | null;
  requiresApproval: boolean;
  reviewerId?: string | null;
  /** 奖励档（RewardProfile.code；NULL 业务上视为 CUSTOM） */
  rewardProfile?: string | null;
  status: TaskStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskRequest {
  childId?: string;
  title: string;
  description?: string;
  subject?: string;
  priority?: number;
  startAt?: string;
  endAt?: string;
  dueDate?: string;
  estimatedMinutes?: number;
  color?: string;
  repeatWeekdays?: number;
  /** 需人工确认时必填：任务创建人指定的审核人 */
  requiresApproval?: boolean;
  reviewerId?: string;
  /** 奖励档（可选；不存在/未启用 → 400；缺省视为 CUSTOM） */
  rewardProfile?: string;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  subject?: string;
  priority?: number;
  startAt?: string;
  endAt?: string | null;
  dueDate?: string;
  estimatedMinutes?: number | null;
  color?: string | null;
  repeatWeekdays?: number | null;
  requiresApproval?: boolean;
  reviewerId?: string;
  rewardProfile?: string | null;
}

export interface TaskStatusActionRequest {
  action: TaskStatusAction;
}

export const TASK_REASON = {
  NOT_FOUND: 'task_not_found',
  FAMILY_REQUIRED: 'family_required',
  REVIEWER_REQUIRED: 'reviewer_required',
  ILLEGAL_TRANSITION: 'illegal_transition',
  FORBIDDEN: 'forbidden',
  ALREADY_COMPLETED: 'task_already_completed',
  NOT_DELETABLE: 'task_not_deletable',
} as const;
export type TaskReason = (typeof TASK_REASON)[keyof typeof TASK_REASON];
