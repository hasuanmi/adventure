import { AiStatusDto, SimilarQuestionDto } from '@huahua/shared-types';
import { request } from './client';

export interface AiAnalyzeResult {
  raw: string;
  fields: Record<string, string | null>;
}

/** AI（对照上游 /api/analyze、/api/reanswer、/api/ai/*；密钥只在服务端） */
export const aiApi = {
  status: () => request<AiStatusDto>('/ai/status'),
  analyze: (body: { imageBase64?: string | null; text?: string | null }) =>
    request<AiAnalyzeResult>('/ai/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  reanswer: (body: { questionText: string; wrongAnswerText?: string | null }) =>
    request<AiAnalyzeResult>('/ai/reanswer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  /** 相似题生成（上游 /api/practice/generate） */
  similar: (body: { questionText: string; subject?: string | null; count?: number }) =>
    request<{ raw: string; items: SimilarQuestionDto[] }>('/ai/similar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
};

/** File → data URL（上游 /api/analyze 直接收 base64） */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

/** 把 AI 返回的 9 个字段映射为错题表单可用的结构（字段名对齐上游） */
export function mapAiFieldsToForm(fields: Record<string, string | null>): {
  subject?: string;
  questionText?: string;
  answerText?: string;
  analysis?: string;
  wrongAnswerText?: string;
  mistakeAnalysis?: string;
  mistakeStatus?: string;
  knowledgePoints: string[];
} {
  const subject = (fields.subject ?? '').trim().toLowerCase();
  return {
    subject: ['chinese', 'math', 'english', 'olympiad', 'pet'].includes(subject) ? subject : undefined,
    questionText: fields.question_text ?? undefined,
    answerText: fields.answer_text ?? undefined,
    analysis: fields.analysis ?? undefined,
    wrongAnswerText: fields.wrong_answer_text ?? undefined,
    mistakeAnalysis: fields.mistake_analysis ?? undefined,
    mistakeStatus: fields.mistake_status ?? undefined,
    knowledgePoints: (fields.knowledge_points ?? '')
      .split(/[;；,，、]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5), // 上游约束：每题最多 5 个知识点
  };
}
