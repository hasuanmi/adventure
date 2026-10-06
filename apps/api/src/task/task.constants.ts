// Task 状态机（v1.2 §8.2 产品规则；状态机实现参考 StaffScheduler ApprovalStateMachine 模式）
import {
  TASK_REASON,
  TASK_STATUS_TRANSITIONS,
  TASK_STATUSES,
  TaskReason,
  TaskStatus,
} from '@huahua/shared-types';

export { TASK_STATUSES, TASK_STATUS_TRANSITIONS, TASK_REASON };
export type { TaskReason, TaskStatus };

/** 状态白名单校验 */
export function assertTaskStatus(value: string): asserts value is TaskStatus {
  if (!TASK_STATUSES.includes(value as TaskStatus)) {
    throw new Error(`invalid task status: ${value}`);
  }
}

/** 基于转换矩阵的受控转移（StaffScheduler nextState 模式：非法转移 → 冲突） */
export function nextTaskStatus(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_STATUS_TRANSITIONS[from].includes(to);
}
