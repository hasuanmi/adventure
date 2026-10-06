// 审批决策求值（参考 Quorum `evaluateWithCounts`，MIT，Copyright (c) 2025 Olawale Lawal）
// 本项目适配：单步审批 → 无票数阈值/阶段，仅"approve→approved / reject→rejected"终态求值。
import { ApprovalDecision } from '@huahua/shared-types';

export type ApprovalOutcome = 'approved' | 'rejected';

/** 单阶段决策求值（V1 单步即终；后续引入多阶段时在此扩展为 evaluateWithCounts 完整翻译） */
export function evaluateSingleStepDecision(decision: ApprovalDecision): ApprovalOutcome {
  return decision === 'approve' ? 'approved' : 'rejected';
}
