import {
  CreateWrongQuestionRequest,
  KnowledgeTagDto,
  WrongQuestionDto,
  WrongQuestionListDto,
  WrongQuestionReviewDto,
  WrongQuestionStatsDto,
  WrongQuestionExportDto,
  WrongQuestionImportResult,
} from '@huahua/shared-types';
import { request } from './client';

export interface WrongQuestionListParams {
  search?: string;
  subject?: string;
  masteryLevel?: number;
  tagId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

/** 错题本（对照上游 /api/error-items*） */
export const wrongQuestionsApi = {
  list: (params: WrongQuestionListParams = {}) => {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
    }
    const query = qs.toString();
    return request<WrongQuestionListDto>(`/wrong-questions${query ? `?${query}` : ''}`);
  },
  get: (id: string) => request<WrongQuestionDto>(`/wrong-questions/${id}`),
  create: (body: CreateWrongQuestionRequest) =>
    request<WrongQuestionDto>('/wrong-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  update: (id: string, body: CreateWrongQuestionRequest) =>
    request<WrongQuestionDto>(`/wrong-questions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  remove: (id: string) => request<void>(`/wrong-questions/${id}`, { method: 'DELETE' }),
  setMastery: (id: string, masteryLevel: number) =>
    request<WrongQuestionDto>(`/wrong-questions/${id}/mastery`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ masteryLevel }),
    }),
  updateNotes: (id: string, userNotes: string | null) =>
    request<WrongQuestionDto>(`/wrong-questions/${id}/notes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userNotes }),
    }),
  reviews: (id: string) => request<WrongQuestionReviewDto[]>(`/wrong-questions/${id}/reviews`),
  stats: () => request<WrongQuestionStatsDto>('/wrong-questions/stats'),
  /** 批量删除（上游 /api/error-items/batch-delete） */
  batchDelete: (ids: string[]) =>
    request<{ deleted: number }>('/wrong-questions/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }),
  /** 清空（上游 DELETE /api/error-items/clear） */
  clear: () => request<{ deleted: number }>('/wrong-questions/clear', { method: 'DELETE' }),
  /** 导出（上游 GET /api/export） */
  exportAll: () => request<WrongQuestionExportDto>('/wrong-questions/export'),
  /** 导入（上游 POST /api/import） */
  importAll: (payload: { version?: number; questions: unknown[] }) =>
    request<WrongQuestionImportResult>('/wrong-questions/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  addReview: (id: string, body: { scheduledFor?: string; completedAt?: string | null; isCorrect?: boolean | null }) =>
    request<WrongQuestionReviewDto>(`/wrong-questions/${id}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
};

/** 知识点标签（对照上游 /api/tags） */
export const knowledgeTagsApi = {
  list: (params: { subject?: string; tree?: boolean } = {}) => {
    const qs = new URLSearchParams();
    if (params.subject) qs.set('subject', params.subject);
    if (params.tree) qs.set('tree', 'true');
    const query = qs.toString();
    return request<KnowledgeTagDto[]>(`/knowledge-tags${query ? `?${query}` : ''}`);
  },
  create: (body: { name: string; subject: string; parentId?: string | null; order?: number; code?: string | null }) =>
    request<KnowledgeTagDto>('/knowledge-tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  remove: (id: string) => request<void>(`/knowledge-tags/${id}`, { method: 'DELETE' }),
  /** 标签统计（上游 /api/tags/stats） */
  stats: (subject?: string) =>
    request<{ id: string; name: string; subject: string; isSystem: boolean; count: number }[]>(
      `/knowledge-tags/stats${subject ? `?subject=${subject}` : ''}`,
    ),
  /** 标签建议（上游 /api/tags/suggestions） */
  suggestions: (params: { subject?: string; q?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.subject) qs.set('subject', params.subject);
    if (params.q) qs.set('q', params.q);
    const query = qs.toString();
    return request<{ id: string; name: string; count: number }[]>(
      `/knowledge-tags/suggestions${query ? `?${query}` : ''}`,
    );
  },
};
