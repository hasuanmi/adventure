import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  MASTERY_LEVELS,
  MISTAKE_STATUSES,
  PAPER_LEVELS,
  PRINT_PREVIEW_PAGE_SIZE,
  WRONG_QUESTION_SUBJECTS,
} from '@huahua/shared-types';

/** 列表查询（对照上游 /api/error-items/list 的筛选参数 + 分页）
 *  注意：query 到达时都是字符串，故数值字段需 @Type(() => Number) 显式转换，
 *  否则 @IsInt() 会因 "18" 不是 number 而 400（本项目 ValidationPipe 未开隐式转换）。 */
export class ListWrongQuestionDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(WRONG_QUESTION_SUBJECTS as unknown as string[]) subject?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(2) masteryLevel?: number;
  @IsOptional() @IsString() tagId?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PRINT_PREVIEW_PAGE_SIZE)
  pageSize?: number;
}

/** 录入/更新（字段名与上游 ErrorItem 一致） */
export class CreateWrongQuestionDto {
  @IsOptional() @IsString() childId?: string;
  @IsOptional() @IsIn(WRONG_QUESTION_SUBJECTS as unknown as string[]) subject?: string | null;
  @IsOptional() @IsString() originalImageKey?: string | null;
  @IsOptional() @IsString() ocrText?: string | null;
  @IsOptional() @IsString() questionText?: string | null;
  @IsOptional() @IsString() answerText?: string | null;
  @IsOptional() @IsString() analysis?: string | null;
  @IsOptional() @IsString() wrongAnswerText?: string | null;
  @IsOptional() @IsString() mistakeAnalysis?: string | null;
  @IsOptional() @IsIn(MISTAKE_STATUSES as unknown as string[]) mistakeStatus?: string | null;
  @IsOptional() @IsString() geogebraCommands?: string | null;
  @IsOptional() @IsString() source?: string | null;
  @IsOptional() @IsString() errorType?: string | null;
  @IsOptional() @IsString() userNotes?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(2) masteryLevel?: number;
  @IsOptional() @IsString() gradeSemester?: string | null;
  @IsOptional() @IsIn(PAPER_LEVELS as unknown as string[]) paperLevel?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) tagIds?: string[];
}

export class UpdateWrongQuestionDto extends CreateWrongQuestionDto {}

export class SetMasteryDto {
  @IsInt() @Min(0) @Max(MASTERY_LEVELS.length - 1) masteryLevel!: number;
}

export class UpdateNotesDto {
  @IsOptional() @IsString() userNotes!: string | null;
}

/** 复习记录（上游 ReviewSchedule：scheduledFor / completedAt / isCorrect） */
export class CreateWrongQuestionReviewDto {
  @IsOptional() @IsString() scheduledFor?: string;
  @IsOptional() @IsString() completedAt?: string | null;
  @IsOptional() @IsBoolean() isCorrect?: boolean | null;
}

/** 批量删除（上游 POST /api/error-items/batch-delete） */
export class BatchDeleteDto {
  @IsArray() @IsString({ each: true }) ids!: string[];
}

/** 导入（上游 POST /api/import：JSON 备份体） */
export class ImportWrongQuestionsDto {
  @IsOptional() @IsInt() version?: number;
  @IsOptional() @IsArray() questions?: Record<string, unknown>[];
}