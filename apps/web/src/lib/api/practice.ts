import { PracticeRecordDto, PracticeStatsDto } from '@huahua/shared-types';
import { request } from './client';

/** 练习（对照上游 /api/practice/record、/api/stats/practice、/api/stats/practice/clear） */
export const practiceApi = {
  record: (body: { subject?: string | null; difficulty?: string | null; isCorrect?: boolean | null }) =>
    request<PracticeRecordDto>('/practice/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  stats: () => request<PracticeStatsDto>('/practice/stats'),
  clear: () => request<{ deleted: number }>('/practice/stats', { method: 'DELETE' }),
};
