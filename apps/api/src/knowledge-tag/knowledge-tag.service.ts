import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { KnowledgeTagDto, WRONG_QUESTION_REASON, WRONG_QUESTION_SUBJECTS } from '@huahua/shared-types';
import type { KnowledgeTag } from '@prisma/client';
import { RequestActor } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 知识点标签（上游 KnowledgeTag）：邻接表无限层级、系统预设 vs 用户自定义、按学科过滤。
 * 上游接口：/api/tags（含 stats、migrate-tags 等）；本轮实现列表（含树形）/新建/删除（stats 等随 P6-4 统计一起）。
 */
@Injectable()
export class KnowledgeTagService {
  constructor(private readonly prisma: PrismaService) {}

  /** 列表：默认只返回"系统预设 + 该孩子的自定义"；tree=true 时组装成树 */
  async list(
    actor: RequestActor,
    params: { subject?: string; parentId?: string; tree?: boolean },
  ): Promise<KnowledgeTagDto[]> {
    const familyId = this.requireFamily(actor);
    const rows = await this.prisma.knowledgeTag.findMany({
      where: {
        familyId,
        ...(params.subject ? { subject: params.subject } : {}),
        // 同家庭内所有标签（系统 + 各孩子自定义）都在同一张表：这里只取系统 + 自己
        OR: [{ childId: null }, { childId: actor.sub }],
      },
      orderBy: [{ subject: 'asc' }, { order: 'asc' }, { name: 'asc' }],
    });
    const dtos = rows.map((r) => this.toDto(r));
    if (!params.tree) return dtos;
    return this.buildTree(dtos);
  }

  /** 新建自定义标签（上游自定义标签绑定 userId → 我们绑定 childId） */
  async create(
    actor: RequestActor,
    body: { name: string; subject: string; parentId?: string | null; order?: number; code?: string | null },
  ): Promise<KnowledgeTagDto> {
    const familyId = this.requireFamily(actor);
    if (!WRONG_QUESTION_SUBJECTS.includes(body.subject as (typeof WRONG_QUESTION_SUBJECTS)[number])) {
      throw new BadRequestException({ error: 'bad_request', reason: WRONG_QUESTION_REASON.INVALID_TAG });
    }
    if (body.parentId) {
      const parent = await this.prisma.knowledgeTag.findFirst({
        where: { id: body.parentId, familyId },
        select: { id: true },
      });
      if (!parent) {
        throw new BadRequestException({ error: 'bad_request', reason: WRONG_QUESTION_REASON.INVALID_TAG });
      }
    }
    const duplicate = await this.prisma.knowledgeTag.findFirst({
      where: {
        familyId,
        subject: body.subject,
        name: body.name,
        parentId: body.parentId ?? null,
        childId: actor.sub,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException({ error: 'conflict', reason: WRONG_QUESTION_REASON.INVALID_TAG });
    }
    const created = await this.prisma.knowledgeTag.create({
      data: {
        familyId,
        name: body.name,
        subject: body.subject,
        parentId: body.parentId ?? null,
        order: body.order ?? 0,
        code: body.code ?? null,
        isSystem: false,
        childId: actor.sub,
      },
    });
    return this.toDto(created);
  }

  /** 删除自定义标签（系统标签不可删；被错题引用则拒绝，避免静默丢标签） */
  async remove(actor: RequestActor, id: string): Promise<void> {
    const familyId = this.requireFamily(actor);
    const tag = await this.prisma.knowledgeTag.findFirst({ where: { id, familyId } });
    if (!tag) throw new NotFoundException({ error: 'not_found', reason: WRONG_QUESTION_REASON.INVALID_TAG });
    if (tag.isSystem) {
      throw new BadRequestException({ error: 'bad_request', reason: WRONG_QUESTION_REASON.INVALID_TAG });
    }
    const used = await this.prisma.wrongQuestion.count({
      where: { deletedAt: null, tags: { some: { id } } },
    });
    if (used > 0) {
      throw new ConflictException({ error: 'conflict', reason: WRONG_QUESTION_REASON.TAG_IN_USE });
    }
    await this.prisma.knowledgeTag.delete({ where: { id } });
  }

  private requireFamily(actor: RequestActor): string {
    if (!actor.familyId) {
      throw new BadRequestException({ error: 'bad_request', reason: WRONG_QUESTION_REASON.FAMILY_REQUIRED });
    }
    return actor.familyId;
  }

  private buildTree(flat: KnowledgeTagDto[]): KnowledgeTagDto[] {
    const byId = new Map(flat.map((t) => [t.id, { ...t, children: [] as KnowledgeTagDto[] }]));
    const roots: KnowledgeTagDto[] = [];
    for (const node of byId.values()) {
      if (node.parentId && byId.has(node.parentId)) {
        byId.get(node.parentId)?.children?.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  private toDto(row: KnowledgeTag): KnowledgeTagDto {
    return {
      id: row.id,
      name: row.name,
      subject: row.subject,
      parentId: row.parentId,
      order: row.order,
      code: row.code,
      isSystem: row.isSystem,
      childId: row.childId,
    };
  }
}
