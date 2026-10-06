// RewardProfile 契约（仅稳定 code/type/摘要；奖励数值唯一来源是数据库 reward_profiles 表，此处不复制数值）

export const REWARD_PROFILE_CODES = [
  'DAILY_CHINESE',
  'DAILY_MATH',
  'DAILY_ENGLISH',
  'DAILY_OLYMPIAD',
  'DAILY_PET',
  'WORLD_SCIENCE_READING',
  'WORLD_HUMANITIES_READING',
  'WORLD_SCIENCE_QUESTION',
  'WORLD_SCIENCE_EXPERIMENT',
  'WORLD_HISTORY_CULTURE',
  'SCENERY_NEW_FRIEND',
  'SCENERY_FAMILY_TALK',
  'SCENERY_GROUP_ACTIVITY',
  'SCENERY_COLLABORATION',
  'SCENERY_CARE',
  'CUSTOM',
// 2026-10-06 用户新增的 5 个任务类型
'TYPE_DAILY',
'TYPE_SCIENCE_HUMANITIES',
'TYPE_SOCIAL',
'TYPE_BOUNTY',
'TYPE_PHYSICAL',
] as const;
export type RewardProfileCode = (typeof REWARD_PROFILE_CODES)[number];

/** Task.rewardProfile = NULL 业务上视为 CUSTOM（不强制写入） */
export const REWARD_PROFILE_DEFAULT_CODE = 'TYPE_DAILY';

export const REWARD_PROFILE_CATEGORIES = [
  'daily',
  'world',
  'scenery',
  'bounty',
  'physical',
  'CUSTOM',
// 2026-10-06 用户新增的 5 个任务类型
'TYPE_DAILY',
'TYPE_SCIENCE_HUMANITIES',
'TYPE_SOCIAL',
'TYPE_BOUNTY',
'TYPE_PHYSICAL',
] as const;
export type RewardProfileCategory = (typeof REWARD_PROFILE_CATEGORIES)[number];

/** 前端摘要（不含奖励数值——创建下拉不显示数值） */
export interface RewardProfileSummary {
  code: RewardProfileCode;
  label: string;
  category: RewardProfileCategory;
  isActive: boolean;
}

export interface RewardProfilesResponse {
  profiles: RewardProfileSummary[];
}

export const REWARD_REASON = {
  NOT_FOUND: 'reward_profile_not_found',
  INACTIVE: 'reward_profile_inactive',
  FORBIDDEN: 'forbidden',
} as const;
export type RewardReason = (typeof REWARD_REASON)[keyof typeof REWARD_REASON];
