import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { APPROVAL_REASON, ApprovalDescriptor, ApprovalRecordDto, ApprovalRequestDto, ApprovalStatus, FAMILY_REASON } from '@huahua/shared-types';
import { RequestActor } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApprovalDto } from './dto';
import { approvalActionTarget, canTransitionApproval } from './approval.state-machine';

/** 业务副作用处理器（由业务模块注册，如 completion 注册 task_completion 处理器） */
export type ApprovalSideEffect = (
  tx: Prisma.TransactionClient,
  request: {
    id: string;
    businessType: string;
    businessId: string;
    familyId: string;
    childId: string;
    applicantId: string;
    reviewerId: string;
    comment: string | null;
  },
  decision: 'approve' | 'reject',
  comment?: string,
) => Promise<void>;

/**
 * 业务对象描述解析器（由业务模块注册，审批模块保持业务无关）：
 * 输入一批 businessId，输出 businessId → 描述（标题 / 关联任务 id）。
 */
export type ApprovalDescriptorResolver = (
  businessIds: string[],
) => Promise<Map<string, ApprovalDescriptor>>;

@Injectable()
export class ApprovalService {
  /** 业务类型 → 副作用处理器注册表（保持审批模块业务无关） */
  private readonly handlers: Record<string, ApprovalSideEffect> = {};

  /** 业务类型 → 描述解析器注册表（只读展示用） */
  private readonly descriptors: Record<string, ApprovalDescriptorResolver> = {};

  constructor(private readonly prisma: PrismaService) {}

  /** 业务模块在 onModuleInit 注册自己的最终副作用（StaffScheduler PendingApprovalDispatch 思想） */
  registerHandler(businessType: string, handler: ApprovalSideEffect): void {
    this.handlers[businessType] = handler;
  }

  /** 业务模块注册只读描述解析器（列表/详情展示"这条审批是关于什么"） */
  registerDescriptor(businessType: string, resolver: ApprovalDescriptorResolver): void {
    this.descriptors[businessType] = resolver;
  }

  /** 批量解析业务描述（按 businessType 分组并行；无注册解析器则返回空 Map） */
  private async resolveDescriptors(
    rows: { businessType: string; businessId: string }[],
  ): Promise<Map<string, ApprovalDescriptor>> {
    const byType = new Map<string, string[]>();
    for (const row of rows) {
      const ids = byType.get(row.businessType) ?? [];
      ids.push(row.businessId);
      byType.set(row.businessType, ids);
    }
    const resolved = new Map<string, ApprovalDescriptor>();
    await Promise.all(
      [...byType.entries()].map(async ([businessType, ids]) => {
        const resolver = this.descriptors[businessType];
        if (!resolver) return;
        const map = await resolver(ids);
        for (const [businessId, descriptor] of map) {
          resolved.set(`${businessType}:${businessId}`, descriptor);
        }
      }),
    );
    return resolved;
  }

  /** 通用创建申请（completion 等业务模块内部调用） */
  async createRequest(
    actor: RequestActor,
    dto: CreateApprovalDto,
    meta: { familyId: string; childId: string },
  ): Promise<ApprovalRequestDto> {
    // 越权防护（HTTP 通道）：申请人必须是请求者本人、必须有家庭、审核人必须同家庭
    if (!meta.familyId) {
      throw new BadRequestException({ error: 'bad_request', reason: FAMILY_REASON.FAMILY_REQUIRED });
    }
    if (dto.applicantId !== actor.sub) {
      throw new ForbiddenException({ error: 'forbidden', reason: APPROVAL_REASON.FORBIDDEN });
    }
    const reviewer = await this.prisma.user.findUnique({
      where: { id: dto.reviewerId },
      select: { familyId: true },
    });
    if (!reviewer || reviewer.familyId !== meta.familyId) {
      throw new BadRequestException({ error: 'bad_request', reason: 'reviewer_not_found' });
    }
    if (dto.applicantId === dto.reviewerId) {
      throw new BadRequestException({ error: 'bad_request', reason: APPROVAL_REASON.SELF_REVIEW_FORBIDDEN });
    }
    try {
      const row = await this.prisma.approvalRequest.create({
        data: {
          familyId: meta.familyId,
          childId: meta.childId,
          businessType: dto.businessType,
          businessId: dto.businessId,
          applicantId: dto.applicantId,
          reviewerId: dto.reviewerId,
          status: 'pending',
          comment: dto.comment,
        },
      });
      await this.prisma.approvalRecord.create({
        data: { requestId: row.id, action: 'created', actorId: actor.sub },
      });
      return this.toDto(row, actor);
    } catch (e) {
      // 部分唯一索引（business_type,business_id）WHERE pending：重复申请兜底
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException({ error: 'conflict', reason: APPROVAL_REASON.CONFLICT });
      }
      throw e;
    }
  }

  /**
   * 决策（approve/reject）。
   * 并发/事务（StaffScheduler + Quorum）：
   *  - FOR UPDATE 行锁串行化并发决策；
   *  - 仅 pending 可操作（状态守卫 + 决策 UPDATE 带 WHERE status='pending'）；
   *  - 事务顺序：先业务副作用（最终动作），后写审批决定（isFinalStep 同事务模式）。
   */
  async decide(
    requestId: string,
    actor: RequestActor,
    decision: 'approve' | 'reject',
    comment?: string,
  ): Promise<ApprovalRequestDto> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM approval_requests WHERE id = ${requestId}::uuid FOR UPDATE`;
      const row = await tx.approvalRequest.findUnique({ where: { id: requestId } });
      if (!row) throw new NotFoundException({ error: 'not_found', reason: APPROVAL_REASON.NOT_FOUND });
      if (row.status !== 'pending') {
        throw new ConflictException({ error: 'conflict', reason: APPROVAL_REASON.NOT_PENDING });
      }
      if (row.reviewerId !== actor.sub) {
        throw new ForbiddenException({ error: 'forbidden', reason: APPROVAL_REASON.NOT_REVIEWER });
      }
      if (row.applicantId === actor.sub) {
        throw new ForbiddenException({ error: 'forbidden', reason: APPROVAL_REASON.SELF_REVIEW_FORBIDDEN });
      }

      const handler = this.handlers[row.businessType];
      if (!handler) {
        throw new BadRequestException({ error: 'bad_request', reason: APPROVAL_REASON.UNKNOWN_BUSINESS_TYPE });
      }

      // 1) 先执行业务副作用（StaffScheduler TimeOffService 顺序）
      await handler(tx, row, decision, comment);

      // 2) 最后写审批决定（status='pending' 守卫，受影响行数=0 → 409）
      const target = approvalActionTarget(decision);
      if (!canTransitionApproval(row.status as ApprovalStatus, target)) {
        throw new ConflictException({ error: 'conflict', reason: APPROVAL_REASON.ILLEGAL_TRANSITION });
      }
      const updated = await tx.approvalRequest.updateMany({
        where: { id: requestId, status: 'pending' },
        data: {
          status: target,
          reviewedBy: actor.sub,
          reviewedAt: new Date(),
          comment: comment ?? null,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException({ error: 'conflict', reason: APPROVAL_REASON.CONFLICT });
      }
      await tx.approvalRecord.create({
        data: { requestId, action: decision, actorId: actor.sub, comment: comment ?? null },
      });

      const after = await tx.approvalRequest.findUniqueOrThrow({ where: { id: requestId } });
      const descriptors = await this.resolveDescriptors([after]);
      return this.toDto(after, actor, descriptors.get(`${after.businessType}:${after.businessId}`) ?? null);
    });
  }

  /** 撤回（仅申请人，仅 pending） */
  async cancel(requestId: string, actor: RequestActor): Promise<void> {
    const row = await this.prisma.approvalRequest.findUnique({ where: { id: requestId } });
    if (!row) throw new NotFoundException({ error: 'not_found', reason: APPROVAL_REASON.NOT_FOUND });
    if (row.applicantId !== actor.sub) {
      throw new ForbiddenException({ error: 'forbidden', reason: APPROVAL_REASON.NOT_APPLICANT });
    }
    if (row.status !== 'pending') {
      throw new ConflictException({ error: 'conflict', reason: APPROVAL_REASON.NOT_PENDING });
    }
    await this.prisma.$transaction([
      this.prisma.approvalRequest.update({
        where: { id: requestId },
        data: { status: 'cancelled' },
      }),
      this.prisma.approvalRecord.create({
        data: { requestId, action: 'cancelled', actorId: actor.sub },
      }),
    ]);
  }

  /** 列表：as=reviewer（待我审批/历史）| as=applicant（我的申请）| 默认家庭范围 */
  async list(actor: RequestActor, as?: string, status?: string): Promise<ApprovalRequestDto[]> {
    const where: Prisma.ApprovalRequestWhereInput = {};
    if (as === 'reviewer') where.reviewerId = actor.sub;
    else if (as === 'applicant') where.applicantId = actor.sub;
    else {
      // 无家庭 = 无家庭范围数据（不得因 familyId 为 null 而退化为"全库"）
      if (!actor.familyId) return [];
      where.familyId = actor.familyId;
    }
    if (status) where.status = status;
    const rows = await this.prisma.approvalRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const descriptors = await this.resolveDescriptors(rows);
    return rows.map((r) =>
      this.toDto(r, actor, descriptors.get(`${r.businessType}:${r.businessId}`) ?? null),
    );
  }

  async getById(requestId: string, actor: RequestActor): Promise<ApprovalRequestDto> {
    const row = await this.prisma.approvalRequest.findUnique({ where: { id: requestId } });
    if (!row) throw new NotFoundException({ error: 'not_found', reason: APPROVAL_REASON.NOT_FOUND });
    this.assertCanRead(row, actor);
    const descriptors = await this.resolveDescriptors([row]);
    return this.toDto(row, actor, descriptors.get(`${row.businessType}:${row.businessId}`) ?? null);
  }

  async audit(requestId: string, actor: RequestActor): Promise<ApprovalRecordDto[]> {
    const row = await this.prisma.approvalRequest.findUnique({ where: { id: requestId } });
    if (!row) throw new NotFoundException({ error: 'not_found', reason: APPROVAL_REASON.NOT_FOUND });
    this.assertCanRead(row, actor);
    const records = await this.prisma.approvalRecord.findMany({
      where: { requestId },
      orderBy: { createdAt: 'asc' },
    });
    return records.map((r) => ({
      id: r.id,
      requestId: r.requestId,
      action: r.action,
      actorId: r.actorId,
      comment: r.comment,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // ---- 内部 ----
  /** 读取范围：applicant / reviewer / 家庭内（Quorum CanViewerAct 思想的读取侧） */
  private assertCanRead(row: { applicantId: string; reviewerId: string; familyId: string }, actor: RequestActor): void {
    const inFamily = actor.familyId !== null && row.familyId === actor.familyId;
    if (actor.sub !== row.applicantId && actor.sub !== row.reviewerId && !inFamily) {
      throw new ForbiddenException({ error: 'forbidden', reason: APPROVAL_REASON.FORBIDDEN });
    }
  }

  private toDto(row: {
    id: string;
    familyId: string;
    childId: string;
    businessType: string;
    businessId: string;
    applicantId: string;
    reviewerId: string;
    status: string;
    comment: string | null;
    reviewedBy: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }, actor: RequestActor, descriptor: ApprovalDescriptor | null = null): ApprovalRequestDto {
    // canAct：仅指定审核人 + pending + 非自审（Quorum CanViewerAct 只读预判）
    const canAct = row.status === 'pending' && row.reviewerId === actor.sub && row.applicantId !== actor.sub;
    return {
      id: row.id,
      familyId: row.familyId,
      childId: row.childId,
      businessType: row.businessType,
      businessId: row.businessId,
      applicantId: row.applicantId,
      reviewerId: row.reviewerId,
      status: row.status as ApprovalRequestDto['status'],
      comment: row.comment,
      reviewedBy: row.reviewedBy,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      canAct,
      descriptor,
    };
  }
}
