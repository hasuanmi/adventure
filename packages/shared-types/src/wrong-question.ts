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

/** 作答状态（用户 2026-10-06 指定：不会做 / 做错了）→ 存 mistakeStatus */
export const ASSIGNMENT_STATUSES = [
  { value: 'not_attempted', label: '不会做' },
  { value: 'wrong_attempt', label: '做错了' },
] as const;

/**
 * 错因（用户 2026-10-06 指定：**分学科**选项）→ 存 errorType
 *  数学 / 奥数：粗心失误 · 思路偏差 · 未掌握知识点 · 其他
 *  语文 / 英语 / PET 英语：拼写错误 · 单词/词语不认识 · 未掌握知识点 · 其他
 */
export const MISTAKE_REASONS_MATH = ['粗心失误', '思路偏差', '未掌握知识点', '其他'] as const;
export const MISTAKE_REASONS_LANGUAGE = ['拼写错误', '单词/词语不认识', '未掌握知识点', '其他'] as const;
export function mistakeReasonsFor(subject?: string | null): readonly string[] {
  return subject === 'math' || subject === 'olympiad' ? MISTAKE_REASONS_MATH : MISTAKE_REASONS_LANGUAGE;
}

/** 年级学期（三级下拉：学段 + 年级 + 上/下学期），默认「小学五年级上学期」 */
export const GRADE_STAGES = ['小学', '初中', '高中', '大学'] as const;
export type GradeStage = (typeof GRADE_STAGES)[number];
export const GRADE_LABELS: Record<GradeStage, readonly string[]> = {
  小学: ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级'],
  初中: ['初一', '初二', '初三'],
  高中: ['高一', '高二', '高三'],
  大学: ['大一', '大二', '大三', '大四'],
};
export const SEMESTERS = ['上学期', '下学期'] as const;
export const DEFAULT_GRADE_STAGE: GradeStage = '小学';
export const DEFAULT_GRADE_LABEL = '五年级';
export const DEFAULT_SEMESTER = '上学期';
export const DEFAULT_GRADE_SEMESTER = `${DEFAULT_GRADE_STAGE}${DEFAULT_GRADE_LABEL}${DEFAULT_SEMESTER}`;

/** 把 "小学五年级上学期" 解析回三级下拉 */
export function parseGradeSemester(value?: string | null): {
  stage: GradeStage;
  gradeLabel: string;
  semester: string;
} {
  const text = value ?? '';
  const stage = GRADE_STAGES.find((s) => text.startsWith(s)) ?? DEFAULT_GRADE_STAGE;
  const gradeLabel = GRADE_LABELS[stage].find((g) => text.includes(g)) ?? GRADE_LABELS[stage][0];
  const semester = SEMESTERS.find((s) => text.includes(s)) ?? DEFAULT_SEMESTER;
  return { stage, gradeLabel, semester };
}

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

/** 练习难度中文（界面用） */
export const PRACTICE_DIFFICULTY_LABELS: Record<string, string> = {
  easy: '基础',
  medium: '中等',
  hard: '较难',
  harder: '挑战',
};

export const PRACTICE_REASON = {
  FAMILY_REQUIRED: 'family_required',
  INVALID_DIFFICULTY: 'invalid_difficulty',
} as const;

/** 相似题（上游 /api/practice/generate 的返回项） */
export interface SimilarQuestionDto {
  question: string;
  answer: string | null;
  hint: string | null;
}

/** 练习统计（上游 /api/stats/practice） */
export interface PracticeStatsDto {
  total: number;
  correct: number;
  wrong: number;
  bySubject: { subject: string; total: number; correct: number }[];
  byDifficulty: { difficulty: string; total: number; correct: number }[];
}

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

/** 导出/导入（对照上游 /api/export 与 /api/import：JSON 备份；导入按题干去重） */
export interface WrongQuestionExportItem extends WrongQuestionDto {
  tagNames: string[];
  reviews: { scheduledFor: string; completedAt: string | null; isCorrect: boolean | null }[];
}

export interface WrongQuestionExportDto {
  version: number;
  exportedAt: string;
  questions: WrongQuestionExportItem[];
}

export interface WrongQuestionImportResult {
  imported: number;
  skipped: number;
}

/** 统计（对照上游 /api/analytics + /api/stats/practice 的口径） */
export interface WrongQuestionStatsDto {
  total: number;
  bySubject: { subject: string; count: number }[];
  byMastery: { masteryLevel: number; count: number }[];
  byPaper: { paperLevel: string; count: number }[];
  reviewCorrect: number;
  reviewWrong: number;
  reviewPending: number;
  practice: { subject: string; isCorrect: boolean | null; count: number }[];
  last30Days: { date: string; count: number }[];
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

/** 分页常量（上游 pagination.ts：默认 18/页、打印预览 200/页；我们最大页收敛为 100，已登记） */
export const WRONG_QUESTION_PAGE_SIZE = 18;
export const WRONG_QUESTION_MAX_PAGE_SIZE = 100;
export const PRINT_PREVIEW_PAGE_SIZE = 200;

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

// ---------------------------------------------------------------------------
// 文件上传（本项目新增；上游用 base64 直存 DB，见 docs/p6-fidelity-audit.md §1.1）
// ---------------------------------------------------------------------------

export const FILE_REASON = {
  FAMILY_REQUIRED: 'family_required',
  NO_FILE: 'file_required',
  UNSUPPORTED_TYPE: 'unsupported_file_type',
  TOO_LARGE: 'file_too_large',
  NOT_FOUND: 'file_not_found',
} as const;

/** 前端提示用的限制（与后端一致：JPG/PNG/WebP、≤10MB；上游前端提示 5MB） */
export const FILE_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const FILE_MAX_BYTES = 10 * 1024 * 1024;
export const IMAGE_COMPRESS_MAX_BYTES = 1 * 1024 * 1024;
export const IMAGE_COMPRESS_MAX_EDGE = 1920;

export interface StoredFileDto {
  key: string;
  url: string;
  size: number;
  mime: string;
}

// ---------------------------------------------------------------------------
// AI（P6-3）：对照上游 lib/ai（gemini / openai / azure 三选一 + 9 个错误码）
// 本项目决策：**先搭适配层，晚点接真模型** —— 未配置时返回明确错误码，不静默失败。
// ---------------------------------------------------------------------------

/** provider 类型（当前实现 OpenAI 兼容通道；上游另有 gemini/azure） */
export const AI_PROVIDER_KINDS = ['openai-compatible'] as const;
export type AiProviderKind = (typeof AI_PROVIDER_KINDS)[number];

export const DEFAULT_AI_MODEL = 'gpt-4o-mini';

export const AI_STATUS_REASON = {
  NOT_CONFIGURED: 'ai_not_configured',
} as const;

/** 上游 9 个 AI 错误码的等价集合（前端按码提示，不做字符串匹配） */
export const AI_ERROR_CODES = [
  'ai_not_configured',
  'ai_auth_error',
  'ai_connection_failed',
  'ai_timeout_error',
  'ai_quota_exceeded',
  'ai_service_unavailable',
  'ai_response_error',
  'ai_unknown_error',
] as const;
export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

export interface AiStatusDto {
  configured: boolean;
  provider: string;
  model: string;
  visionModel: string;
  reason: string | null;
}
