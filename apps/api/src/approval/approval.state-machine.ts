// Approval 状态机（参考 StaffScheduler ApprovalStateMachine.ts，MIT，Copyright (c) 2025 Luca Ostinelli）
// 本项目适配：单步状态转移表；非法转移抛 409（nextState 同款语义）
import { APPROVAL_STATUSES, APPROVAL_TRANSITIONS, ApprovalStatus } from '@huahua/shared-types';

export function assertApprovalStatus(value: string): asserts value is ApprovalStatus {
  if (!APPROVAL_STATUSES.includes(value as ApprovalStatus)) {
    throw new Error(`invalid approval status: ${value}`);
  }
}

/** 受控转移：from 是否可转移到 to（TRANSITIONS 表） */
export function canTransitionApproval(from: ApprovalStatus, to: ApprovalStatus): boolean {
  return APPROVAL_TRANSITIONS[from].includes(to);
}

/** 决策动作 → 目标状态（StaffScheduler actionForDecision 同款） */
export function approvalActionTarget(action: 'approve' | 'reject'): ApprovalStatus {
  return action === 'approve' ? 'approved' : 'rejected';
}
