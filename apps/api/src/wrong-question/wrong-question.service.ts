import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CreateWrongQuestionRequest,
  MASTERY_LEVELS,
  MISTAKE_STATUSES,
  PAPER_LEVELS,
  WRONG_QUESTION_DEDUPE_WINDOW_MS,
  WRONG_QUESTION_MAX_PAGE_SIZE,
  WRONG_QUESTION_PAGE_SIZE,
  WRONG_QUESTION_REASON,
  WRONG_QUESTION_SUBJECTS,
  WrongQuestionDto,
  WrongQuestionExportDto,
  WrongQuestionListDto,
  WrongQuestionListQuery,
  WrongQuestionReviewDto,
  WrongQuestionStatsDto,
  questionDedupeKey,
} from '@huahua/shared-types';
import type { KnowledgeTag, WrongQuestion } from '@prisma/client';
import { RequestActor } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

type QuestionWithTags = WrongQuestion & { tags: KnowledgeTag[]; _count?: { reviews: number } };

/**
 * 错题本服务 —— 逐条对齐上游 wrong-notebook v1.9.1 的能力：
 *  · 列表：关键词（题干/答案/解析/错因/笔记 5 字段）+ 学科 + 掌握度 + 标签 + 时间区间 + 分页（上游默认 18/页）
 *  · 录入：上游"2 秒时间窗 + 题干前 100 字符"去重 → 命中 409 duplicate_question（回带已有 id）
 *  · 掌握度：0/1/2；笔记单独更新（上游 PATCH :id/notes）；复习记录（上游 ReviewSchedule）
 *  · 软删除（上游物理删除 → 本项目硬基线改软删）
 */
@Injectable()
export class WrongQuestionService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: RequestActor, query: WrongQuestionListQuery): Promise<WrongQuestionListDto> {
    const { familyId } = this.requireFamily(actor);
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(
      WRONG_QUESTION_MAX_PAGE_SIZE,
      Math.max(1, Number(query.pageSize) || WRONG_QUESTION_PAGE_SIZE),
    );
    const childId = await this.resolveChildId(actor, undefined);

    const search = (query.search ?? '').trim();
    const where = {
      familyId,
      childId,
      deletedAt: null,
      ...(query.subject ? { subject: query.subject } : {}),
      ...(query.masteryLevel !== undefined && query.masteryLevel !== null
        ? { masteryLevel: Number(query.masteryLevel) }
        : {}),
      ...(query.tagId ? { tags: { some: { id: query.tagId } } } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
              ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
      // 上游：5 字段 contains 搜索
      ...(search
        ? {
            OR: [
              { questionText: { contains: search, mode: 'insensitive' as const } },
              { answerText: { contains: search, mode: 'insensitive' as const } },
              { analysis: { contains: search, mode: 'insensitive' as const } },
              { mistakeAnalysis: { contains: search, mode: 'insensitive' as const } },
              { userNotes: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.wrongQuestion.findMany({
        where,
        include: { tags: true, _count: { select: { reviews: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.wrongQuestion.count({ where }),
    ]);

    return { items: rows.map((row) => this.toDto(row)), total, page, pageSize };
  }

  async getById(actor: RequestActor, id: string): Promise<WrongQuestionDto> {
    const { familyId } = this.requireFamily(actor);
    const row = await this.prisma.wrongQuestion.findFirst({
      where: { id, familyId, deletedAt: null },
      include: { tags: true, _count: { select: { reviews: true } } },
    });
    if (!row) throw new NotFoundException({ error: 'not_found', reason: WRONG_QUESTION_REASON.NOT_FOUND });
    return this.toDto(row);
  }

  async create(actor: RequestActor, dto: CreateWrongQuestionRequest): Promise<WrongQuestionDto> {
    const { familyId } = this.requireFamily(actor);
    const childId = await this.resolveChildId(actor, dto.childId);

    if (!dto.questionText?.trim() && !dto.originalImageKey) {
      throw new BadRequestException({ error: 'bad_request', reason: WRONG_QUESTION_REASON.NO_CONTENT });
    }
    this.assertEnums(dto);

    // 上游去重：同一孩子、题干前 100 字符相同、且在 2 秒时间窗内 → 视为重复提交
    const dedupeKey = questionDedupeKey(dto.questionText);
    if (dedupeKey) {
      const since = new Date(Date.now() - WRONG_QUESTION_DEDUPE_WINDOW_MS);
      const candidates = await this.prisma.wrongQuestion.findMany({
        where: { familyId, childId, deletedAt: null, createdAt: { gte: since } },
        select: { id: true, questionText: true },
      });
      const hit = candidates.find((c) => questionDedupeKey(c.questionText) === dedupeKey);
      if (hit) {
        throw new ConflictException({
          error: 'conflict',
          reason: WRONG_QUESTION_REASON.DUPLICATE_QUESTION,
          fields: { existingId: hit.id },
        });
      }
    }

    const tagIds = await this.resolveTagIds(familyId, dto.tagIds);
    const created = await this.prisma.wrongQuestion.create({
      data: {
        familyId,
        childId,
        createdBy: actor.sub,
        subject: dto.subject ?? null,
        originalImageKey: dto.originalImageKey ?? null,
        ocrText: dto.ocrText ?? null,
        questionText: dto.questionText ?? null,
        answerText: dto.answerText ?? null,
        analysis: dto.analysis ?? null,
        wrongAnswerText: dto.wrongAnswerText ?? null,
        mistakeAnalysis: dto.mistakeAnalysis ?? null,
        mistakeStatus: dto.mistakeStatus ?? null,
        geogebraCommands: dto.geogebraCommands ?? null,
        source: dto.source ?? null,
        errorType: dto.errorType ?? null,
        userNotes: dto.userNotes ?? null,
        masteryLevel: dto.masteryLevel ?? 0,
        gradeSemester: dto.gradeSemester ?? null,
        paperLevel: dto.paperLevel ?? null,
        tags: tagIds.length ? { connect: tagIds.map((id) => ({ id })) } : undefined,
      },
      include: { tags: true, _count: { select: { reviews: true } } },
    });
    return this.toDto(created);
  }

  async update(actor: RequestActor, id: string, dto: CreateWrongQuestionRequest): Promise<WrongQuestionDto> {
    const { familyId } = this.requireFamily(actor);
    const existing = await this.prisma.wrongQuestion.findFirst({ where: { id, familyId, deletedAt: null } });
    if (!existing) throw new NotFoundException({ error: 'not_found', reason: WRONG_QUESTION_REASON.NOT_FOUND });
    this.assertEnums(dto);

    const tagIds = dto.tagIds ? await this.resolveTagIds(familyId, dto.tagIds) : null;
    const updated = await this.prisma.wrongQuestion.update({
      where: { id },
      data: {
        ...(dto.subject !== undefined ? { subject: dto.subject } : {}),
        ...(dto.originalImageKey !== undefined ? { originalImageKey: dto.originalImageKey } : {}),
        ...(dto.ocrText !== undefined ? { ocrText: dto.ocrText } : {}),
        ...(dto.questionText !== undefined ? { questionText: dto.questionText } : {}),
        ...(dto.answerText !== undefined ? { answerText: dto.answerText } : {}),
        ...(dto.analysis !== undefined ? { analysis: dto.analysis } : {}),
        ...(dto.wrongAnswerText !== undefined ? { wrongAnswerText: dto.wrongAnswerText } : {}),
        ...(dto.mistakeAnalysis !== undefined ? { mistakeAnalysis: dto.mistakeAnalysis } : {}),
        ...(dto.mistakeStatus !== undefined ? { mistakeStatus: dto.mistakeStatus } : {}),
        ...(dto.geogebraCommands !== undefined ? { geogebraCommands: dto.geogebraCommands } : {}),
        ...(dto.source !== undefined ? { source: dto.source } : {}),
        ...(dto.errorType !== undefined ? { errorType: dto.errorType } : {}),
        ...(dto.userNotes !== undefined ? { userNotes: dto.userNotes } : {}),
        ...(dto.masteryLevel !== undefined ? { masteryLevel: dto.masteryLevel } : {}),
        ...(dto.gradeSemester !== undefined ? { gradeSemester: dto.gradeSemester } : {}),
        ...(dto.paperLevel !== undefined ? { paperLevel: dto.paperLevel } : {}),
        ...(tagIds ? { tags: { set: tagIds.map((tid) => ({ id: tid })) } } : {}),
      },
      include: { tags: true, _count: { select: { reviews: true } } },
    });
    return this.toDto(updated);
  }

  /** 掌握度标记（上游 masteryLevel 0/1/2；上游 UI 只用到 0/1，我们按 schema 语义支持 2） */
  async setMastery(actor: RequestActor, id: string, masteryLevel: number): Promise<WrongQuestionDto> {
    const { familyId } = this.requireFamily(actor);
    if (!MASTERY_LEVELS.includes(masteryLevel as 0 | 1 | 2)) {
      throw new BadRequestException({ error: 'bad_request', reason: WRONG_QUESTION_REASON.NOT_FOUND });
    }
    const existing = await this.prisma.wrongQuestion.findFirst({ where: { id, familyId, deletedAt: null } });
    if (!existing) throw new NotFoundException({ error: 'not_found', reason: WRONG_QUESTION_REASON.NOT_FOUND });
    const updated = await this.prisma.wrongQuestion.update({
      where: { id },
      data: { masteryLevel },
      include: { tags: true, _count: { select: { reviews: true } } },
    });
    return this.toDto(updated);
  }

  /** 笔记（上游 PATCH /:id/notes；上游该路由缺 owner 校验 → 我们补上 family 归属） */
  async updateNotes(actor: RequestActor, id: string, userNotes: string | null): Promise<WrongQuestionDto> {
    const { familyId } = this.requireFamily(actor);
    const existing = await this.prisma.wrongQuestion.findFirst({ where: { id, familyId, deletedAt: null } });
    if (!existing) throw new NotFoundException({ error: 'not_found', reason: WRONG_QUESTION_REASON.NOT_FOUND });
    const updated = await this.prisma.wrongQuestion.update({
      where: { id },
      data: { userNotes },
      include: { tags: true, _count: { select: { reviews: true } } },
    });
    return this.toDto(updated);
  }

  /** 软删除（上游物理删除 → 本项目硬基线改软删） */
  async remove(actor: RequestActor, id: string): Promise<void> {
    const { familyId } = this.requireFamily(actor);
    const existing = await this.prisma.wrongQuestion.findFirst({ where: { id, familyId, deletedAt: null } });
    if (!existing) throw new NotFoundException({ error: 'not_found', reason: WRONG_QUESTION_REASON.NOT_FOUND });
    await this.prisma.wrongQuestion.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // ---- 复习记录（上游 ReviewSchedule） ----
  async listReviews(actor: RequestActor, id: string): Promise<WrongQuestionReviewDto[]> {
    await this.getById(actor, id);
    const rows = await this.prisma.wrongQuestionReview.findMany({
      where: { wrongQuestionId: id },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      wrongQuestionId: r.wrongQuestionId,
      scheduledFor: r.scheduledFor.toISOString(),
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
      isCorrect: r.isCorrect,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async createReview(
    actor: RequestActor,
    id: string,
    body: { scheduledFor?: string; completedAt?: string | null; isCorrect?: boolean | null },
  ): Promise<WrongQuestionReviewDto> {
    const { familyId } = this.requireFamily(actor);
    const question = await this.prisma.wrongQuestion.findFirst({ where: { id, familyId, deletedAt: null } });
    if (!question) throw new NotFoundException({ error: 'not_found', reason: WRONG_QUESTION_REASON.NOT_FOUND });
    const row = await this.prisma.wrongQuestionReview.create({
      data: {
        familyId,
        wrongQuestionId: id,
        scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : new Date(),
        completedAt: body.completedAt ? new Date(body.completedAt) : null,
        isCorrect: body.isCorrect ?? null,
      },
    });
    return {
      id: row.id,
      wrongQuestionId: row.wrongQuestionId,
      scheduledFor: row.scheduledFor.toISOString(),
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      isCorrect: row.isCorrect,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** 统计（对照上游 /api/analytics + /api/stats/practice 的口径：按学科/掌握度/时间分布 + 复习与练习） */
  async stats(actor: RequestActor): Promise<WrongQuestionStatsDto> {
    const { familyId } = this.requireFamily(actor);
    const childId = await this.resolveChildId(actor, undefined);
    const where = { familyId, childId, deletedAt: null };

    const [total, bySubjectRaw, byMasteryRaw, byPaperRaw, reviews, practiceRaw, rows] = await Promise.all([
      this.prisma.wrongQuestion.count({ where }),
      this.prisma.wrongQuestion.groupBy({ by: ['subject'], where, _count: { _all: true } }),
      this.prisma.wrongQuestion.groupBy({ by: ['masteryLevel'], where, _count: { _all: true } }),
      this.prisma.wrongQuestion.groupBy({ by: ['paperLevel'], where, _count: { _all: true } }),
      this.prisma.wrongQuestionReview.groupBy({
        by: ['isCorrect'],
        where: { familyId, wrongQuestion: { childId } },
        _count: { _all: true },
      }),
      this.prisma.practiceRecord.groupBy({ by: ['subject', 'isCorrect'], where: { familyId, childId }, _count: { _all: true } }),
      this.prisma.wrongQuestion.findMany({ where, select: { createdAt: true } }),
    ]);

    // 近 30 天按日分布（上游统计页的时间趋势）
    const days: { date: string; count: number }[] = [];
    const today = new Date();
    for (let i = 29; i >= 0; i -= 1) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      days.push({ date: d.toISOString().slice(0, 10), count: 0 });
    }
    const index = new Map(days.map((d) => [d.date, d]));
    for (const row of rows) {
      const key = row.createdAt.toISOString().slice(0, 10);
      const hit = index.get(key);
      if (hit) hit.count += 1;
    }

    return {
      total,
      bySubject: bySubjectRaw.map((r) => ({ subject: r.subject ?? 'unknown', count: r._count._all })),
      byMastery: byMasteryRaw.map((r) => ({ masteryLevel: r.masteryLevel, count: r._count._all })),
      byPaper: byPaperRaw.map((r) => ({ paperLevel: r.paperLevel ?? 'unknown', count: r._count._all })),
      reviewCorrect: reviews.find((r) => r.isCorrect === true)?._count._all ?? 0,
      reviewWrong: reviews.find((r) => r.isCorrect === false)?._count._all ?? 0,
      reviewPending: reviews.find((r) => r.isCorrect === null)?._count._all ?? 0,
      practice: practiceRaw.map((r) => ({
        subject: r.subject ?? 'unknown',
        isCorrect: r.isCorrect,
        count: r._count._all,
      })),
      last30Days: days,
    };
  }

  /** 批量删除（对照上游 POST /api/error-items/batch-delete；软删除） */
  async batchDelete(actor: RequestActor, ids: string[]): Promise<{ deleted: number }> {
    const { familyId } = this.requireFamily(actor);
    const childId = await this.resolveChildId(actor, undefined);
    if (!ids?.length) return { deleted: 0 };
    const result = await this.prisma.wrongQuestion.updateMany({
      where: { id: { in: ids }, familyId, childId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return { deleted: result.count };
  }

  /** 清空（对照上游 DELETE /api/error-items/clear；软删除本人全部） */
  async clear(actor: RequestActor): Promise<{ deleted: number }> {
    const { familyId } = this.requireFamily(actor);
    const childId = await this.resolveChildId(actor, undefined);
    const result = await this.prisma.wrongQuestion.updateMany({
      where: { familyId, childId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return { deleted: result.count };
  }

  /** 导出（对照上游 GET /api/export：JSON 备份，含知识点与复习记录） */
  async exportAll(actor: RequestActor): Promise<WrongQuestionExportDto> {
    const { familyId } = this.requireFamily(actor);
    const childId = await this.resolveChildId(actor, undefined);
    const rows = await this.prisma.wrongQuestion.findMany({
      where: { familyId, childId, deletedAt: null },
      include: { tags: true, reviews: true },
      orderBy: { createdAt: 'asc' },
    });
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      questions: rows.map((row) => ({
        ...this.toDto(row),
        // 导入时按名称回接标签（标签 id 跨库不稳定）
        tagNames: row.tags.map((t) => t.name),
        reviews: row.reviews.map((r) => ({
          scheduledFor: r.scheduledFor.toISOString(),
          completedAt: r.completedAt ? r.completedAt.toISOString() : null,
          isCorrect: r.isCorrect,
        })),
      })),
    };
  }

  /** 导入（对照上游 POST /api/import：事务化；同题干重复则跳过） */
  async importAll(
    actor: RequestActor,
    payload: { questions?: Partial<WrongQuestionDto>[] },
  ): Promise<{ imported: number; skipped: number }> {
    const { familyId } = this.requireFamily(actor);
    const childId = await this.resolveChildId(actor, undefined);
    const incoming = payload?.questions ?? [];
    let imported = 0;
    let skipped = 0;

    // 去重口径与录入一致（题干前 100 字符）：先一次性建索引，避免逐条误判
    const existingRows = await this.prisma.wrongQuestion.findMany({
      where: { familyId, childId, deletedAt: null },
      select: { questionText: true },
    });
    const existingKeys = new Set(existingRows.map((r) => questionDedupeKey(r.questionText)).filter(Boolean));

    for (const item of incoming) {
      const key = questionDedupeKey(item.questionText);
      if (key && existingKeys.has(key)) {
        skipped += 1;
        continue;
      }
      await this.prisma.wrongQuestion.create({
        data: {
          familyId,
          childId,
          createdBy: actor.sub,
          subject: item.subject ?? null,
          originalImageKey: null, // 导出的图片 key 只在本机存储有效，导入时置空
          ocrText: item.ocrText ?? null,
          questionText: item.questionText ?? null,
          answerText: item.answerText ?? null,
          analysis: item.analysis ?? null,
          wrongAnswerText: item.wrongAnswerText ?? null,
          mistakeAnalysis: item.mistakeAnalysis ?? null,
          mistakeStatus: item.mistakeStatus ?? null,
          geogebraCommands: item.geogebraCommands ?? null,
          source: item.source ?? null,
          errorType: item.errorType ?? null,
          userNotes: item.userNotes ?? null,
          masteryLevel: item.masteryLevel ?? 0,
          gradeSemester: item.gradeSemester ?? null,
          paperLevel: item.paperLevel ?? null,
        },
      });
      imported += 1;
      if (key) existingKeys.add(key); // 同一批备份里的重复项也只导入一次
    }
    return { imported, skipped };
  }

  // ---- 内部 ----
  private requireFamily(actor: RequestActor): { familyId: string } {
    if (!actor.familyId) {
      throw new BadRequestException({ error: 'bad_request', reason: WRONG_QUESTION_REASON.FAMILY_REQUIRED });
    }
    return { familyId: actor.familyId };
  }

  /** 孩子视角 = 自己；家长视角必须指定 childId（且需在同一家庭） */
  private async resolveChildId(actor: RequestActor, requested?: string): Promise<string> {
    if (actor.role === 'child') return actor.sub;
    const childId = requested;
    if (!childId) {
      throw new BadRequestException({ error: 'bad_request', reason: WRONG_QUESTION_REASON.FAMILY_REQUIRED });
    }
    const child = await this.prisma.user.findFirst({ where: { id: childId, familyId: actor.familyId ?? undefined } });
    if (!child) throw new ForbiddenException({ error: 'forbidden', reason: WRONG_QUESTION_REASON.FORBIDDEN });
    return childId;
  }

  private assertEnums(dto: CreateWrongQuestionRequest): void {
    if (dto.subject && !WRONG_QUESTION_SUBJECTS.includes(dto.subject as (typeof WRONG_QUESTION_SUBJECTS)[number])) {
      throw new BadRequestException({ error: 'bad_request', reason: WRONG_QUESTION_REASON.NO_CONTENT });
    }
    if (dto.mistakeStatus && !MISTAKE_STATUSES.includes(dto.mistakeStatus as (typeof MISTAKE_STATUSES)[number])) {
      throw new BadRequestException({ error: 'bad_request', reason: WRONG_QUESTION_REASON.NO_CONTENT });
    }
    if (dto.paperLevel && !PAPER_LEVELS.includes(dto.paperLevel as (typeof PAPER_LEVELS)[number])) {
      throw new BadRequestException({ error: 'bad_request', reason: WRONG_QUESTION_REASON.NO_CONTENT });
    }
    if (dto.masteryLevel !== undefined && !MASTERY_LEVELS.includes(dto.masteryLevel as 0 | 1 | 2)) {
      throw new BadRequestException({ error: 'bad_request', reason: WRONG_QUESTION_REASON.NO_CONTENT });
    }
  }

  private async resolveTagIds(familyId: string, tagIds?: string[]): Promise<string[]> {
    if (!tagIds?.length) return [];
    const found = await this.prisma.knowledgeTag.findMany({
      where: { id: { in: tagIds }, familyId },
      select: { id: true },
    });
    if (found.length !== tagIds.length) {
      throw new BadRequestException({ error: 'bad_request', reason: WRONG_QUESTION_REASON.INVALID_TAG });
    }
    return tagIds;
  }

  private toDto(row: QuestionWithTags): WrongQuestionDto {
    return {
      id: row.id,
      childId: row.childId,
      createdBy: row.createdBy,
      subject: row.subject,
      originalImageKey: row.originalImageKey,
      ocrText: row.ocrText,
      questionText: row.questionText,
      answerText: row.answerText,
      analysis: row.analysis,
      wrongAnswerText: row.wrongAnswerText,
      mistakeAnalysis: row.mistakeAnalysis,
      mistakeStatus: row.mistakeStatus,
      geogebraCommands: row.geogebraCommands,
      source: row.source,
      errorType: row.errorType,
      userNotes: row.userNotes,
      masteryLevel: row.masteryLevel,
      gradeSemester: row.gradeSemester,
      paperLevel: row.paperLevel,
      tags: row.tags.map((t) => ({
        id: t.id,
        name: t.name,
        subject: t.subject,
        parentId: t.parentId,
        order: t.order,
        code: t.code,
        isSystem: t.isSystem,
        childId: t.childId,
      })),
      reviewCount: row._count?.reviews ?? 0,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
