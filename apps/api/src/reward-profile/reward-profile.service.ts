import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { REWARD_REASON, RewardProfileSummary, RewardProfileCategory } from '@huahua/shared-types';
import { PrismaService } from '../prisma/prisma.service';

/** RewardProfile 为系统配置（非用户 CRUD）；本服务只读。 */
@Injectable()
export class RewardProfileService {
  constructor(private readonly prisma: PrismaService) {}

  /** 列表：仅 isActive=true；可选 category 筛选（返回摘要，不含奖励数值） */
  async listActive(category?: RewardProfileCategory): Promise<RewardProfileSummary[]> {
    const where: Prisma.RewardProfileWhereInput = { isActive: true };
    if (category) where.category = category;
    const rows = await this.prisma.rewardProfile.findMany({ where, orderBy: { code: 'asc' } });
    return rows.map((r) => ({
      code: r.code as RewardProfileSummary['code'],
      label: r.label,
      category: r.category as RewardProfileCategory,
      isActive: r.isActive,
    }));
  }

  /** 内部读取完整配置（含数值；仅服务内部使用，不暴露给前端 API） */
  async findByCodeOrThrow(code: string): Promise<{
    code: string;
    xp: Prisma.Decimal;
    intelligence: Prisma.Decimal;
    logic: Prisma.Decimal;
    expression: Prisma.Decimal;
    exploration: Prisma.Decimal;
    connection: Prisma.Decimal;
    vitality: Prisma.Decimal;
    coins: Prisma.Decimal;
  }> {
    const row = await this.prisma.rewardProfile.findUnique({ where: { code } });
    if (!row) throw new BadRequestException({ error: 'bad_request', reason: REWARD_REASON.NOT_FOUND });
    if (!row.isActive) throw new BadRequestException({ error: 'bad_request', reason: REWARD_REASON.INACTIVE });
    return row;
  }
}
