import { RewardGrantDto, UserGrowthDto } from '@huahua/shared-types';
import { request } from './client';

// 成长接口（P1 已具备；本轮 P2 剩余 UI 接入）
// /growth/me   → 等级/XP/六维/金币（等级由 xp 派生，见 shared-types levelFromXp）
// /growth/grants → 发放流水（含 grantedAt；本周打卡即由此派生）
export const growthApi = {
  me: () => request<UserGrowthDto>('/growth/me'),
  grants: () => request<RewardGrantDto[]>('/growth/grants'),
};
