import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { FAMILY_REASON, FamilyDto, FamilyMemberDto, UserRole } from '@huahua/shared-types';
import { RequestActor } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 最小家庭入口（P2）。
 *
 * 架构基线：**不做 Family 完整模块**（仅 users.family_id 单列，见《新项目V1》§3.5）。
 * 约定：familyId = 创建家庭的家长 user id；邀请码 = 该家长 username。
 * 该口径与 docs/P1-人工验收指南.md §0.4 的 `family_id = parent1.id` 一致，
 * 因此历史数据（parent1 / dcparent 等）无需迁移即可继续使用。
 */
@Injectable()
export class FamilyService {
  constructor(private readonly prisma: PrismaService) {}

  /** 家长创建家庭：familyId = 自己（幂等性由"已在家庭"409 保证） */
  async create(actor: RequestActor): Promise<FamilyDto> {
    if (actor.role !== 'parent') {
      throw new BadRequestException({ error: 'bad_request', reason: FAMILY_REASON.PARENT_REQUIRED });
    }
    if (actor.familyId) {
      throw new ConflictException({ error: 'conflict', reason: FAMILY_REASON.ALREADY_IN_FAMILY });
    }
    await this.prisma.user.update({ where: { id: actor.sub }, data: { familyId: actor.sub } });
    return this.me({ ...actor, familyId: actor.sub });
  }

  /** 凭邀请码（家长 username）加入家庭 */
  async join(actor: RequestActor, code: string): Promise<FamilyDto> {
    if (actor.familyId) {
      throw new ConflictException({ error: 'conflict', reason: FAMILY_REASON.ALREADY_IN_FAMILY });
    }
    const owner = await this.prisma.user.findFirst({
      where: { username: { equals: code.trim(), mode: 'insensitive' } },
      select: { id: true, role: true, familyId: true },
    });
    if (!owner) {
      throw new BadRequestException({ error: 'bad_request', reason: FAMILY_REASON.INVALID_CODE });
    }
    if (owner.role !== 'parent') {
      throw new BadRequestException({ error: 'bad_request', reason: FAMILY_REASON.CODE_NOT_PARENT });
    }
    if (!owner.familyId) {
      throw new BadRequestException({ error: 'bad_request', reason: FAMILY_REASON.CODE_OWNER_NO_FAMILY });
    }
    if (owner.id === actor.sub) {
      throw new BadRequestException({ error: 'bad_request', reason: FAMILY_REASON.CANNOT_JOIN_SELF });
    }
    await this.prisma.user.update({ where: { id: actor.sub }, data: { familyId: owner.familyId } });
    return this.me({ ...actor, familyId: owner.familyId });
  }

  /** 我的家庭 + 成员列表（未入家庭返回 null 字段与空成员，不报错） */
  async me(actor: RequestActor): Promise<FamilyDto> {
    if (!actor.familyId) {
      return { familyId: null, inviteCode: null, ownerUsername: null, members: [] };
    }
    const familyId = actor.familyId;
    const [owner, members] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: familyId }, select: { username: true } }),
      this.prisma.user.findMany({
        where: { familyId },
        select: { id: true, username: true, role: true },
        orderBy: [{ role: 'desc' }, { username: 'asc' }],
      }),
    ]);
    return {
      familyId,
      inviteCode: owner?.username ?? null,
      ownerUsername: owner?.username ?? null,
      members: members.map(
        (m): FamilyMemberDto => ({
          id: m.id,
          username: m.username,
          role: m.role as UserRole,
          isSelf: m.id === actor.sub,
        }),
      ),
    };
  }
}
