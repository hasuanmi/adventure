import { ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit , BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { COMPLETION_REASON, TaskCompletionDto } from '@huahua/shared-types';
import { RequestActor } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ApprovalService } from '../approval/approval.service';
import { GrowthService } from '../growth/growth.service';
import { SubmitCompletionDto } from './dto';

/**
 * 完成/提交（统一模型：一条流水线 + requiresApproval 可选闸门，v1.2 §8）。
 * 流程形态与事务顺序参考 StaffScheduler：
 *  - decidePendingApproval / isFinalStep 同事务副作用（ApprovalDecisionService.ts / TimeOffService.ts）
 *  - 提交 → pending → reviewer 决策 → 最终业务副作用（通过 ApprovalService 注册的处理器触发）
 */
@Injectable()
export class CompletionService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approval: ApprovalService,
    private readonly growth: GrowthService,
  ) {}

  /** 注册审批副作用处理器：approval 模块保持业务无关（StaffScheduler PendingApprovalDispatch 思想） */
  onModuleInit(): void {
    this.approval.registerHandler('task_completion', (tx, request, decision, comment) =>
      this.finalizeByApproval(tx, request, decision, comment),
    );
    // 只读描述解析器：让审批列表/详情能显示"哪个任务的完成确认"（审批模块仍不感知 task）
    this.approval.registerDescriptor('task_completion', async (businessIds) => {
      const completions = await this.prisma.taskCompletion.findMany({
        where: { id: { in: businessIds } },
        select: { id: true, taskId: true, task: { select: { title: true } } },
      });
      return new Map(
        completions.map((c) => [c.id, { label: c.task.title, taskId: c.taskId }] as const),
      );
    });
  }

  /** 孩子提交完成（统一入口：无需审批=自动批准+完成定稿；需审批=进入 pending） */
  async submit(actor: RequestActor, taskId: string, dto: SubmitCompletionDto): Promise<TaskCompletionDto[]> {
    // 完成凭证为**必选**：文字或至少一个文件；两者可同时提供
    if (!dto.proofText?.trim() && (dto.proofFileKeys?.length ?? 0) === 0) {
      throw new BadRequestException({
        error: 'bad_request',
        reason: 'proof_required',
        fields: { proof: '完成凭证必选：请上传图片/文件或输入文字' },
      });
    }
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.deletedAt) {
      throw new NotFoundException({ error: 'not_found', reason: COMPLETION_REASON.NOT_FOUND });
    }
    if (task.childId !== actor.sub || actor.role !== 'child') {
      throw new ForbiddenException({ error: 'forbidden', reason: COMPLETION_REASON.NOT_OWNER });
    }
    if (task.status === 'completed') {
      throw new ConflictException({ error: 'conflict', reason: COMPLETION_REASON.TASK_COMPLETED });
    }

    if (!task.requiresApproval) {
      // 无需审批：完成定稿（自动批准）+ 发放（同事务；FOR UPDATE 串行化防重复完成）
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM tasks WHERE id = ${taskId}::uuid FOR UPDATE`;
        const locked = await tx.task.findUnique({ where: { id: taskId } });
        if (!locked || locked.status === 'completed' || locked.deletedAt) {
          throw new ConflictException({ error: 'conflict', reason: COMPLETION_REASON.TASK_COMPLETED });
        }
        const completion = await tx.taskCompletion.create({
          data: {
            taskId,
            childId: actor.sub,
            note: dto.note,
            evidenceJson: dto.evidenceJson as Prisma.InputJsonValue | undefined,
            status: 'approved',
          },
        });
        await this.saveProofs(tx, task.familyId, completion.id, dto);
        await tx.task.update({ where: { id: taskId }, data: { status: 'completed' } });
        await this.growth.grant(tx, {
          userId: actor.sub,
          taskId,
          completionId: completion.id,
          grantedBy: actor.sub,
          profileCode: task.rewardProfile,
        });
      });
    } else {
      // 需审批：提交 pending + 生成通用审批申请（部分唯一索引兜底重复提交）
      const reviewerId = task.reviewerId;
      if (!reviewerId) {
        throw new ConflictException({ error: 'conflict', reason: COMPLETION_REASON.ILLEGAL_TRANSITION });
      }
      // 自审禁止（Quorum 守卫链思想；任务创建时已校验，此处防御性再校验）
      if (reviewerId === actor.sub) {
        throw new ForbiddenException({
          error: 'forbidden',
          reason: 'self_review_forbidden',
        });
      }
      try {
        await this.prisma.$transaction(async (tx) => {
          const completion = await tx.taskCompletion.create({
            data: {
              taskId,
              childId: actor.sub,
              note: dto.note,
              evidenceJson: dto.evidenceJson as Prisma.InputJsonValue | undefined,
              status: 'pending',
            },
          });
          await this.saveProofs(tx, task.familyId, completion.id, dto);
          const request = await tx.approvalRequest.create({
            data: {
              familyId: task.familyId,
              childId: actor.sub,
              businessType: 'task_completion',
              businessId: completion.id,
              applicantId: actor.sub,
              reviewerId,
              status: 'pending',
            },
          });
          await tx.taskCompletion.update({
            where: { id: completion.id },
            data: { approvalRequestId: request.id },
          });
          await tx.approvalRecord.create({
            data: { requestId: request.id, action: 'created', actorId: actor.sub },
          });
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException({ error: 'conflict', reason: COMPLETION_REASON.ALREADY_PENDING });
        }
        throw e;
      }
    }

    return this.list(taskId, actor);
  }

  /**
   * 审批最终副作用（由 ApprovalService 在"先副作用后决策写入"事务内调用，StaffScheduler isFinalStep 模式）。
   * approve → 完成定稿（completed + 发放，幂等）；reject → 退回（returned + 意见）。
   */
  private async finalizeByApproval(
    tx: Prisma.TransactionClient,
    request: {
      businessId: string;
      reviewerId: string;
    },
    decision: 'approve' | 'reject',
    comment?: string,
  ): Promise<void> {
    const completion = await tx.taskCompletion.findUnique({ where: { id: request.businessId } });
    if (!completion) {
      throw new NotFoundException({ error: 'not_found', reason: COMPLETION_REASON.NOT_FOUND });
    }

    if (decision === 'approve') {
      await tx.taskCompletion.update({
        where: { id: completion.id },
        data: { status: 'approved', reviewedBy: request.reviewerId, reviewedAt: new Date(), reviewComment: comment ?? null },
      });
      await tx.task.update({ where: { id: completion.taskId }, data: { status: 'completed' } });
      const task = await tx.task.findUnique({ where: { id: completion.taskId } });
      await this.growth.grant(tx, {
        userId: completion.childId,
        taskId: completion.taskId,
        completionId: completion.id,
        grantedBy: request.reviewerId,
        profileCode: task?.rewardProfile ?? null,
      });
    } else {
      await tx.taskCompletion.update({
        where: { id: completion.id },
        data: { status: 'rejected', reviewedBy: request.reviewerId, reviewedAt: new Date(), reviewComment: comment ?? null },
      });
      await tx.task.update({ where: { id: completion.taskId }, data: { status: 'returned' } });
    }
  }

  /** 完成记录列表（数据范围同任务：child 自己 / parent 家庭） */

  /** 保存完成凭证：文字一行 + 每个文件一行（**图片数量不限**） */
  private async saveProofs(
    tx: Prisma.TransactionClient,
    familyId: string,
    completionId: string,
    dto: SubmitCompletionDto,
  ): Promise<void> {
    const text = dto.proofText?.trim();
    const keys = dto.proofFileKeys ?? [];
    if (!text && keys.length === 0) return;
    const rows: {
      familyId: string;
      completionId: string;
      kind: string;
      text?: string;
      fileKey?: string;
      sortOrder: number;
    }[] = [];
    if (text) rows.push({ familyId, completionId, kind: 'text', text, sortOrder: 0 });
    keys.forEach((key: string, i: number) => {
      const kind = /\.(png|jpe?g|webp|gif|bmp)$/i.test(key) ? 'image' : 'file';
      rows.push({ familyId, completionId, kind, fileKey: key, sortOrder: i + 1 });
    });
    await tx.completionProof.createMany({ data: rows });
  }

  async list(taskId: string, actor: RequestActor): Promise<TaskCompletionDto[]> {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.deletedAt) {
      throw new NotFoundException({ error: 'not_found', reason: COMPLETION_REASON.NOT_FOUND });
    }
    const inFamily = actor.familyId !== null && task.familyId === actor.familyId;
    if (actor.sub !== task.childId && !inFamily) {
      throw new ForbiddenException({ error: 'forbidden', reason: COMPLETION_REASON.FORBIDDEN });
    }
    const rows = await this.prisma.taskCompletion.findMany({
      where: { taskId },
      include: { proofs: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { submittedAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      taskId: r.taskId,
      childId: r.childId,
      note: r.note,
      evidenceJson: r.evidenceJson,
      submittedAt: r.submittedAt.toISOString(),
      status: r.status as TaskCompletionDto['status'],
      reviewedBy: r.reviewedBy,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      reviewComment: r.reviewComment,
      approvalRequestId: r.approvalRequestId,
      // 完成凭证：检查人（家长）在这里拿到文字与全部附件的 key
      proofs: (r.proofs ?? []).map((p) => ({
        kind: p.kind,
        text: p.text,
        fileKey: p.fileKey,
        fileName: p.fileName,
        mime: p.mime,
        size: p.size,
      })),
    }));
  }
}
