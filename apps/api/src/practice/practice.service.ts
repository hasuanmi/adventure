import { BadRequestException, Injectable } from '@nestjs/common';
import { PRACTICE_DIFFICULTIES, PracticeRecordDto, PRACTICE_REASON } from '@huahua/shared-types';
import { RequestActor } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

export interface PracticeStatsDto {
  total: number;
  correct: number;
  wrong: number;
  bySubject: { subject: string; total: number; correct: number }[];
  byDifficulty: { difficulty: string; total: number; correct: number }[];
}

/**
 * 练习记录（对照上游 POST /api/practice/record、GET /api/stats/practice、DELETE /api/stats/practice/clear）
 * 表结构保持上游口径：subject / difficulty / isCorrect。
 */
@Injectable()
export class PracticeService {
  constructor(private readonly prisma: PrismaService) {}

  private requireFamily(actor: RequestActor): string {
    if (!actor.familyId) {
      throw new BadRequestException({ error: 'bad_request', reason: PRACTICE_REASON.FAMILY_REQUIRED });
    }
    return actor.familyId;
  }

  private async childId(actor: RequestActor): Promise<string> {
    if (actor.role === 'child') return actor.sub;
    return actor.sub; // 家长记录时也记在自己名下（与上游"本人练习"一致）
  }

  async record(
    actor: RequestActor,
    body: { subject?: string | null; difficulty?: string | null; isCorrect?: boolean | null },
  ): Promise<PracticeRecordDto> {
    const familyId = this.requireFamily(actor);
    if (body.difficulty && !PRACTICE_DIFFICULTIES.includes(body.difficulty as (typeof PRACTICE_DIFFICULTIES)[number])) {
      throw new BadRequestException({ error: 'bad_request', reason: PRACTICE_REASON.INVALID_DIFFICULTY });
    }
    const childId = await this.childId(actor);
    const row = await this.prisma.practiceRecord.create({
      data: {
        familyId,
        childId,
        subject: body.subject ?? null,
        difficulty: body.difficulty ?? null,
        isCorrect: body.isCorrect ?? null,
      },
    });
    return {
      id: row.id,
      childId: row.childId,
      subject: row.subject,
      difficulty: row.difficulty,
      isCorrect: row.isCorrect,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** 练习统计（上游 /api/stats/practice） */
  async stats(actor: RequestActor): Promise<PracticeStatsDto> {
    const familyId = this.requireFamily(actor);
    const childId = await this.childId(actor);
    const where = { familyId, childId };
    const [total, correct, bySubject, byDifficulty] = await Promise.all([
      this.prisma.practiceRecord.count({ where }),
      this.prisma.practiceRecord.count({ where: { ...where, isCorrect: true } }),
      this.prisma.practiceRecord.groupBy({ by: ['subject', 'isCorrect'], where, _count: { _all: true } }),
      this.prisma.practiceRecord.groupBy({ by: ['difficulty', 'isCorrect'], where, _count: { _all: true } }),
    ]);

    const merge = (
      rows: { key: string; isCorrect: boolean | null; count: number }[],
    ): { key: string; total: number; correct: number }[] => {
      const map = new Map<string, { key: string; total: number; correct: number }>();
      for (const row of rows) {
        const entry = map.get(row.key) ?? { key: row.key, total: 0, correct: 0 };
        entry.total += row.count;
        if (row.isCorrect === true) entry.correct += row.count;
        map.set(row.key, entry);
      }
      return [...map.values()];
    };

    return {
      total,
      correct,
      wrong: total - correct,
      bySubject: merge(
        bySubject.map((r) => ({ key: r.subject ?? 'unknown', isCorrect: r.isCorrect, count: r._count._all })),
      ).map((e) => ({ subject: e.key, total: e.total, correct: e.correct })),
      byDifficulty: merge(
        byDifficulty.map((r) => ({ key: r.difficulty ?? 'unknown', isCorrect: r.isCorrect, count: r._count._all })),
      ).map((e) => ({ difficulty: e.key, total: e.total, correct: e.correct })),
    };
  }

  /** 清空练习统计（上游 DELETE /api/stats/practice/clear） */
  async clear(actor: RequestActor): Promise<{ deleted: number }> {
    const familyId = this.requireFamily(actor);
    const childId = await this.childId(actor);
    const result = await this.prisma.practiceRecord.deleteMany({ where: { familyId, childId } });
    return { deleted: result.count };
  }
}
