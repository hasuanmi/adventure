import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  REWARD_PROFILE_DEFAULT_CODE,
  RewardGrantDto,
  UserGrowthDto,
  dimensionLevelFromPoints,
  levelFromXp,
} from '@huahua/shared-types';
import { PrismaService } from '../prisma/prisma.service';

type GrantAmounts = {
  xp: number;
  intelligence: number;
  logic: number;
  expression: number;
  exploration: number;
  connection: number;
  vitality: number;
  coins: number;
};

/** 构造全零/默认金额（Decimal 以 number 传入 Prisma 自动转换） */
function amounts(a: Partial<GrantAmounts> = {}): GrantAmounts {
  return {
    xp: a.xp ?? 0,
    intelligence: a.intelligence ?? 0,
    logic: a.logic ?? 0,
    expression: a.expression ?? 0,
    exploration: a.exploration ?? 0,
    connection: a.connection ?? 0,
    vitality: a.vitality ?? 0,
    coins: a.coins ?? 0,
  };
}

@Injectable()
export class GrowthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 发放（在调用方事务内执行；幂等：UNIQUE(completion_id)）。
   * v1.2 §8：完成定稿节点发放。奖励数值来自 RewardProfile 配置表：
   *   Task.rewardProfile → RewardProfile；NULL 业务上视为 CUSTOM（不强制写入 Task）。
   */
  async grant(
    tx: Prisma.TransactionClient,
    params: { userId: string; taskId: string; completionId: string; grantedBy: string; profileCode?: string | null },
  ): Promise<void> {
    const existing = await tx.rewardGrant.findUnique({ where: { completionId: params.completionId } });
    if (existing) return; // 幂等：同完成记录只发一次

    // 解析奖励档：profileCode ?? CUSTOM；缺失（防御）→ 回退 CUSTOM
    const code = params.profileCode ?? REWARD_PROFILE_DEFAULT_CODE;
    const profile =
      (await tx.rewardProfile.findUnique({ where: { code } })) ??
      (await tx.rewardProfile.findUnique({ where: { code: REWARD_PROFILE_DEFAULT_CODE } }));
    if (!profile) {
      throw new Error('reward profile missing');
    }
    const grant: GrantAmounts = {
      xp: Number(profile.xp),
      intelligence: Number(profile.intelligence),
      logic: Number(profile.logic),
      expression: Number(profile.expression),
      exploration: Number(profile.exploration),
      connection: Number(profile.connection),
      vitality: Number(profile.vitality),
      coins: Number(profile.coins),
    };
    const { userId, taskId, completionId, grantedBy } = params;
    await tx.rewardGrant.create({
      data: { userId, taskId, completionId, grantedBy, type: 'base', ...grant },
    });

    const row = await tx.userGrowth.findUnique({ where: { userId: params.userId } });
    if (!row) {
      await tx.userGrowth.create({ data: { userId: params.userId, ...grant } });
    } else {
      await tx.userGrowth.update({
        where: { userId: params.userId },
        data: {
          xp: { increment: grant.xp },
          intelligence: { increment: grant.intelligence },
          logic: { increment: grant.logic },
          expression: { increment: grant.expression },
          exploration: { increment: grant.exploration },
          connection: { increment: grant.connection },
          vitality: { increment: grant.vitality },
          coins: { increment: grant.coins },
        },
      });
    }
  }

  /** 我的成长：余额 + 派生等级（等级不存储，v1.2 §18#3） */

  /**
   * Parent view: resolve the CHILD of the same family; other roles resolve to themselves.
   * Read-side only — no change to XP / level / dimension calculation logic.
   */
  async subjectUserId(actor: {
    sub: string;
    role?: string | null;
    familyId?: string | null;
  }): Promise<string> {
    if (actor.role !== 'parent' || !actor.familyId) return actor.sub;
    const child = await this.prisma.user.findFirst({
      where: { familyId: actor.familyId, role: 'child' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    return child?.id ?? actor.sub;
  }

  async me(userId: string): Promise<UserGrowthDto> {
    const row = await this.prisma.userGrowth.findUnique({ where: { userId } });
    const zero = amounts();
    const g = row
      ? {
          xp: Number(row.xp),
          intelligence: Number(row.intelligence),
          logic: Number(row.logic),
          expression: Number(row.expression),
          exploration: Number(row.exploration),
          connection: Number(row.connection),
          vitality: Number(row.vitality),
          coins: Number(row.coins),
        }
      : zero;
    return {
      userId,
      ...g,
      xpLevel: levelFromXp(g.xp),
      dimensionLevels: {
        intelligence: dimensionLevelFromPoints(g.intelligence),
        logic: dimensionLevelFromPoints(g.logic),
        expression: dimensionLevelFromPoints(g.expression),
        exploration: dimensionLevelFromPoints(g.exploration),
        connection: dimensionLevelFromPoints(g.connection),
        vitality: dimensionLevelFromPoints(g.vitality),
      },
    };
  }

  /** 发放流水 */
  async grants(userId: string): Promise<RewardGrantDto[]> {
    const rows = await this.prisma.rewardGrant.findMany({
      where: { userId },
      orderBy: { grantedAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      taskId: r.taskId,
      completionId: r.completionId,
      type: r.type,
      xp: Number(r.xp),
      intelligence: Number(r.intelligence),
      logic: Number(r.logic),
      expression: Number(r.expression),
      exploration: Number(r.exploration),
      connection: Number(r.connection),
      vitality: Number(r.vitality),
      coins: Number(r.coins),
      grantedAt: r.grantedAt.toISOString(),
      grantedBy: r.grantedBy,
    }));
  }
}
