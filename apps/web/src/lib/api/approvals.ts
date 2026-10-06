import { ApprovalRecordDto, ApprovalRequestDto, ApprovalStatus } from '@huahua/shared-types';
import { request } from './client';

export type ApprovalScope = 'reviewer' | 'applicant';

/** 通用审批（decision 只在后端；前端按 canAct 显隐按钮） */
export const approvalsApi = {
  list: (params: { as?: ApprovalScope; status?: ApprovalStatus } = {}) => {
    const qs = new URLSearchParams();
    if (params.as) qs.set('as', params.as);
    if (params.status) qs.set('status', params.status);
    const query = qs.toString();
    return request<ApprovalRequestDto[]>(`/approvals${query ? `?${query}` : ''}`);
  },
  get: (id: string) => request<ApprovalRequestDto>(`/approvals/${id}`),
  audit: (id: string) => request<{ records: ApprovalRecordDto[] }>(`/approvals/${id}/audit`),
  approve: (id: string, comment?: string) =>
    request<ApprovalRequestDto>(`/approvals/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment: comment || undefined }),
    }),
  /** 驳回必须带意见（服务端 DTO @IsNotEmpty） */
  reject: (id: string, comment: string) =>
    request<ApprovalRequestDto>(`/approvals/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment }),
    }),
  cancel: (id: string) => request<void>(`/approvals/${id}/cancel`, { method: 'POST' }),
};
