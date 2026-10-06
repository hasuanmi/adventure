// Family 契约（P2 最小家庭入口）
//
// 架构基线（《新项目V1-开源模块整合架构方案》§3.5）：**不做 Family 完整模块**——
// 仅 users.family_id 单列，无 families / family_members 表、无邀请码列、无角色矩阵。
// 因此本契约的"邀请码"= 创建家庭的家长 username；familyId = 该家长的 user id
// （与 docs/P1-人工验收指南.md §0.4 用 SQL 赋 family_id=parent1.id 的口径完全一致）。

import { UserRole } from './auth';

export interface FamilyMemberDto {
  id: string;
  username: string;
  role: UserRole;
  /** 是否为当前请求者本人 */
  isSelf: boolean;
}

export interface FamilyDto {
  /** null = 尚未加入任何家庭 */
  familyId: string | null;
  /** 家庭邀请码（= 创建家庭的家长 username）；未入家庭为 null */
  inviteCode: string | null;
  ownerUsername: string | null;
  members: FamilyMemberDto[];
}

export interface JoinFamilyRequest {
  /** 家庭邀请码 = 家长 username（服务端 trim，忽略大小写） */
  code: string;
}

export const FAMILY_REASON = {
  /** 已在家庭中（不可重复创建/加入） */
  ALREADY_IN_FAMILY: 'already_in_family',
  /** 仅家长可创建家庭 */
  PARENT_REQUIRED: 'parent_required',
  /** 邀请码不存在 */
  INVALID_CODE: 'invalid_code',
  /** 邀请码对应的账号不是家长 */
  CODE_NOT_PARENT: 'code_not_parent',
  /** 该家长尚未创建家庭 */
  CODE_OWNER_NO_FAMILY: 'code_owner_no_family',
  /** 不能加入自己创建的家庭 */
  CANNOT_JOIN_SELF: 'cannot_join_self',
  /** 该操作需要先加入家庭 */
  FAMILY_REQUIRED: 'family_required',
} as const;
export type FamilyReason = (typeof FAMILY_REASON)[keyof typeof FAMILY_REASON];
