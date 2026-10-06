import { FamilyDto, JoinFamilyRequest } from '@huahua/shared-types';
import { request } from './client';

/** 家庭（P2 最小入口：仅 users.family_id 单列，无 Family 表） */
export const familyApi = {
  me: () => request<FamilyDto>('/family/me'),
  create: () => request<FamilyDto>('/family/create', { method: 'POST' }),
  join: (code: string) =>
    request<FamilyDto>('/family/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code } satisfies JoinFamilyRequest),
    }),
};
