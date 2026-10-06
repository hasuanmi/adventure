// 错题本（WrongQuestion）—— **字段与接口对齐上游 wrong-notebook v1.9.1**
// （开源登记见 docs/opensource-mapping.md；功能盘点见 docs/wrong-notebook-feature-inventory.md）
//
// 移植原则（用户要求"照上游做，不自己发挥"）：**字段名、语义、页面能力逐项对照上游**，不增删能力。
// 仅做本项目硬基线要求的适配（这些适配均已在既有文档中登记，非临时发挥）：
//  · 每表加 family_id / child_id（上游只有 userId，无租户概念）；
//  · 软删除 deleted_at（上游是物理删除）；
//  · 学科用**固定枚举**（上游 Subject 表是用户自由命名；本项目硬基线为固定枚举，已登记为未采用项）；
//  · 图片存 key/URL（上游 originalImageUrl 存 base64 data URL；本项目禁止 base64 入 DB）；
//  · 错误体 {error, reason, fields?}（上游为 {message, code?, details?}）。

/** 学科固定枚举（与任务模块同一套值；上游对应 Subject 表） */
export const WRONG_QUESTION_SUBJECTS = ['chinese', 'math', 'english', 'olympiad', 'pet'] as const;
export type WrongQuestionSubject = (typeof WRONG_QUESTION_SUBJECTS)[number];

/** 错因状态（上游 mistakeStatus：not_attempted / wrong_attempt / unknown） */
export const MISTAKE_STATUSES = ['not_attempted', 'wrong_attempt', 'unknown'] as const;
export type MistakeStatus = (typeof MISTAKE_STATUSES)[number];

/** 掌握度（上游 masteryLevel Int：0 New / 1 Reviewing / 2 Mastered） */
export const MASTERY_LEVELS = [0, 1, 2] as const;
export type MasteryLevel = (typeof MASTERY_LEVELS)[number];
export const MASTERY_LABELS: Record<MasteryLevel, string> = {
  0: '新题',
  1: '复习中',
  2: '已掌握',
};

/** 试卷层次（上游 paperLevel，实际存取小写 a/b/other） */
export const PAPER_LEVELS = ['a', 'b', 'other'] as const;
export type PaperLevel = (typeof PAPER_LEVELS)[number];

/** 练习难度（上游 PracticeRecord.difficulty） */
export const PRACTICE_DIFFICULTIES = ['easy', 'medium', 'hard', 'harder'] as const;
export type PracticeDifficulty = (typeof PRACTICE_DIFFICULTIES)[number];

/** 学段（上游 User.educationStage） */
export const EDUCATION_STAGES = ['primary', 'junior_high', 'senior_high', 'university'] as const;
export type EducationStage = (typeof EDUCATION_STAGES)[number];

/** 知识点标签（上游 KnowledgeTag：邻接表无限层级 + isSystem/userId 区分预设与自定义） */
export interface KnowledgeTagDto {
  id: string;
  name: string;
  subject: string;
  parentId: string | null;
  /** 教材顺序（上游 order） */
  order: number;
  /** 编码，如 "1.2.1"（上游 code） */
  code: string | null;
  /** true = 系统预设，false = 自定义（上游 isSystem） */
  isSystem: boolean;
  /** 自定义标签归属的孩子（上游 userId） */
  childId: string | null;
  /** 仅树形返回时带子节点 */
  children?: KnowledgeTagDto[];
}

export interface WrongQuestionDto {
  id: string;
  /** 错题本归属的孩子（上游 userId） */
  childId: string;
  createdBy: string;
  subject: string | null;
  /** 图片 key（上游 originalImageUrl；我们存 key，不存 base64） */
  originalImageKey: string | null;
  ocrText: string | null;
  questionText: string | null;
  answerText: string | null;
  analysis: string | null;
  wrongAnswerText: string | null;
  mistakeAnalysis: string | null;
  mistakeStatus: string | null;
  geogebraCommands: string | null;
  source: string | null;
  errorType: string | null;
  userNotes: string | null;
  masteryLevel: number;
  gradeSemester: string | null;
  paperLevel: string | null;
  tags: KnowledgeTagDto[];
  /** 复习轮次（上游 ReviewSchedule 计数） */
  reviewCount?: number;
  createdAt: string;
  updatedAt: string;
}

/** 复习记录（上游 ReviewSchedule：scheduledFor / completedAt / isCorrect） */
export interface WrongQuestionReviewDto {
  id: string;
  wrongQuestionId: string;
  scheduledFor: string;
  completedAt: string | null;
  isCorrect: boolean | null;
  createdAt: string;
}

export interface PracticeRecordDto {
  id: string;
  childId: string;
  subject: string | null;
  difficulty: string | null;
  isCorrect: boolean | null;
  createdAt: string;
}

export interface WrongQuestionListQuery {
  /** 关键词：题干/答案/解析/错因/笔记（上游 5 字段 contains） */
  search?: string;
  subject?: string;
  masteryLevel?: number;
  tagId?: string;
  /** 录入时间区间（YYYY-MM-DD） */
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface WrongQuestionListDto {
  items: WrongQuestionDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateWrongQuestionRequest {
  childId?: string;
  subject?: string | null;
  originalImageKey?: string | null;
  ocrText?: string | null;
  questionText?: string | null;
  answerText?: string | null;
  analysis?: string | null;
  wrongAnswerText?: string | null;
  mistakeAnalysis?: string | null;
  mistakeStatus?: string | null;
  geogebraCommands?: string | null;
  source?: string | null;
  errorType?: string | null;
  userNotes?: string | null;
  masteryLevel?: number;
  gradeSemester?: string | null;
  paperLevel?: string | null;
  /** 知识点标签 id 列表（上游 M2M） */
  tagIds?: string[];
}

export type UpdateWrongQuestionRequest = Partial<CreateWrongQuestionRequest>;

/** 分页常量（上游 pagination.ts：默认 18/页、最大 1000；我们按硬基线收敛为 100，已登记） */
export const WRONG_QUESTION_PAGE_SIZE = 18;
export const WRONG_QUESTION_MAX_PAGE_SIZE = 100;

/** 上游去重规则：题干前 100 字符 + 短时间窗（默认 2 秒）内的同题视为重复 */
export const WRONG_QUESTION_DEDUPE_CHARS = 100;
export const WRONG_QUESTION_DEDUPE_WINDOW_MS = 2000;

/** 归一化题干：供去重比较（去空白、统一大小写） */
export function normalizeQuestionText(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** 去重键：题干前 100 字符（完全对齐上游算法口径） */
export function questionDedupeKey(text: string | null | undefined): string {
  return normalizeQuestionText(text).slice(0, WRONG_QUESTION_DEDUPE_CHARS);
}

export const WRONG_QUESTION_REASON = {
  FAMILY_REQUIRED: 'family_required',
  NOT_FOUND: 'wrong_question_not_found',
  FORBIDDEN: 'forbidden',
  DUPLICATE_QUESTION: 'duplicate_question',
  NO_CONTENT: 'wrong_question_no_content',
  INVALID_TAG: 'invalid_knowledge_tag',
  TAG_IN_USE: 'knowledge_tag_in_use',
} as const;
export type WrongQuestionReason = (typeof WRONG_QUESTION_REASON)[keyof typeof WRONG_QUESTION_REASON];
