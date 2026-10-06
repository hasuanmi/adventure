import { RewardProfileCategory, RewardProfilesResponse } from '@huahua/shared-types';
import { request } from './client';

export const rewardProfilesApi = {
  list: (category?: RewardProfileCategory) =>
    request<RewardProfilesResponse>(`/reward-profiles${category ? `?category=${category}` : ''}`),
};
