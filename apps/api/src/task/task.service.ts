import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TASK_REASON, TaskDto, TaskStatus } from '@huahua/shared-types';
import { RequestActor } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { CompletionService } from '../completion/completion.service';
import { RewardProfileService } from '../reward-profile/reward-profile.service';
import { CreateTaskDto, UpdateTaskDto } from './dto';
import { nextTaskStatus } from './task.constants';

function parseDate(value: string | null | undefined, field: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException({ error: 'bad_request', reason: 'invalid_date', fields: { [field]: value } });
  }
  return d;
}

@Injectable()
export class TaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly completion: CompletionService,
    private readonly rewardProfile: RewardProfileService,
  ) {}

  /** 校验奖励档：传入则必须存在且 isActive（NULL 业务上视为 CUSTOM） */
  private async assertRewardProfile(code?: string | null): Promise<void> {
    if (code) {
      await this.rewardProfile.findByCodeOrThrow(code);
    }
  }

  async create(actor: RequestActor, dto: CreateTaskDto): Promise<TaskDto> {
    if (!actor.familyId) {
      throw new BadRequestException({ error: 'bad_request', reason: TASK_REASON.FAMILY_REQUIRED });
    }
    const childId = dto.childId ?? (actor.role === 'child' ? actor.sub : undefined);
    if (!childId) {
      throw new BadRequestException({ error: 'bad_request', reason: 'child_required' });
    }
    if (dto.requiresApproval && !dto.reviewerId) {
      throw new BadRequestException({ error: 'bad_request', reason: TASK_REASON.REVIEWER_REQUIRED });
    }
    // 基本审核人校验：需审批时审核人必须存在且不是任务归属孩子本人（自审禁止）
    if (dto.reviewerId) {
      const reviewer = await this.prisma.user.findUnique({ where: { id: dto.reviewerId } });
      if (!reviewer) {
        throw new BadRequestException({ error: 'bad_request', reason: 'reviewer_not_found' });
      }
      if (dto.requiresApproval && dto.reviewerId === childId) {
        throw new BadRequestException({ error: 'bad_request', reason: 'self_review_forbidden' });
      }
    }
    await this.assertRewardProfile(dto.rewardProfile);
    const startAt = parseDate(dto.startAt, 'startAt');
    const endAt = parseDate(dto.endAt, 'endAt');
    if (startAt && endAt && endAt.getTime() <= startAt.getTime()) {
      throw new BadRequestException({ error: 'bad_request', reason: 'invalid_range', fields: { endAt: dto.endAt } });
    }

    const task = await this.prisma.task.create({
      data: {
        familyId: actor.familyId,
        childId,
        title: dto.title,
        description: dto.description,
        subject: dto.subject,
        priority: dto.priority ?? 0,
        startAt,
        endAt,
        dueDate: parseDate(dto.dueDate, 'dueDate'),
        estimatedMinutes: dto.estimatedMinutes,
        color: dto.color,
        icon: dto.icon ?? null,
        repeatWeekdays: dto.repeatWeekdays,
        requiresApproval: dto.requiresApproval ?? false,
        reviewerId: dto.reviewerId,
        rewardProfile: dto.rewardProfile ?? null,
        status: 'pending',
        createdBy: actor.sub,
      },
    });
    return this.toDto(task);
  }

  async list(actor: RequestActor, status?: string): Promise<TaskDto[]> {
    const where: Record<string, unknown> = { deletedAt: null };
    if (actor.role === 'child') where.childId = actor.sub;
    else if (actor.role === 'parent') {
      // 无家庭 = 无家庭范围数据 → 返回空列表（不是权限错误）。
      // 新注册家长在"创建/加入家庭"之前就属于这种状态，若这里抛 403，
      // 今日/日程页会先显示"读取任务失败"，把"去创建家庭"的引导顶掉（P2 实测踩到）。
      if (!actor.familyId) return [];
      where.familyId = actor.familyId;
    } else {
      throw new ForbiddenException({ error: 'forbidden', reason: TASK_REASON.FORBIDDEN });
    }
    if (status) where.status = status;
    const rows = await this.prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => this.toDto(r));
  }

  async getById(actor: RequestActor, taskId: string): Promise<TaskDto> {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.deletedAt) throw new NotFoundException({ error: 'not_found', reason: TASK_REASON.NOT_FOUND });
    this.assertScope(actor, task);
    return this.toDto(task);
  }

  async update(actor: RequestActor, taskId: string, dto: UpdateTaskDto): Promise<TaskDto> {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.deletedAt) throw new NotFoundException({ error: 'not_found', reason: TASK_REASON.NOT_FOUND });
    this.assertScope(actor, task);
    if (task.status === 'completed') {
      throw new ConflictException({ error: 'conflict', reason: TASK_REASON.ILLEGAL_TRANSITION });
    }
    const requiresApproval = dto.requiresApproval ?? task.requiresApproval;
    const reviewerId = dto.reviewerId ?? task.reviewerId;
    if (requiresApproval && !reviewerId) {
      throw new BadRequestException({ error: 'bad_request', reason: TASK_REASON.REVIEWER_REQUIRED });
    }
    // 已存在待审批完成记录时，禁止"取消人工确认"：否则孩子可再次提交走自动批准路径，
    // 产生第二条 completion + 第二条发放（发放按 completionId 幂等，拦不住），原 pending 永久悬挂。
    if (task.requiresApproval && requiresApproval === false) {
      const pending = await this.prisma.taskCompletion.count({ where: { taskId, status: 'pending' } });
      if (pending > 0) {
        throw new ConflictException({ error: 'conflict', reason: 'pending_completion_exists' });
      }
    }
    // 与 create 保持一致：审核人必须存在、同家庭，且不是任务归属孩子本人（自审禁止）
    if (reviewerId && (dto.reviewerId !== undefined || dto.requiresApproval !== undefined)) {
      const reviewer = await this.prisma.user.findUnique({
        where: { id: reviewerId },
        select: { familyId: true },
      });
      if (!reviewer || reviewer.familyId !== task.familyId) {
        throw new BadRequestException({ error: 'bad_request', reason: 'reviewer_not_found' });
      }
      if (requiresApproval && reviewerId === task.childId) {
        throw new BadRequestException({ error: 'bad_request', reason: 'self_review_forbidden' });
      }
    }
    const rewardProfile = dto.rewardProfile !== undefined ? dto.rewardProfile : task.rewardProfile;
    await this.assertRewardProfile(rewardProfile);
    const startAt = dto.startAt !== undefined ? parseDate(dto.startAt, 'startAt') : undefined;
    const endAt = dto.endAt !== undefined ? parseDate(dto.endAt, 'endAt') : undefined;
    // 区间校验用"生效值"（只改一端时也要与另一端现值比较，避免绕过 invalid_range）
    const effStart = dto.startAt !== undefined ? startAt : task.startAt;
    const effEnd = dto.endAt !== undefined ? endAt : task.endAt;
    if (effStart && effEnd && effEnd.getTime() <= effStart.getTime()) {
      throw new BadRequestException({ error: 'bad_request', reason: 'invalid_range', fields: { endAt: dto.endAt } });
    }
    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        title: dto.title,
        description: dto.description,
        subject: dto.subject,
        priority: dto.priority,
        startAt,
        endAt,
        dueDate: dto.dueDate !== undefined ? parseDate(dto.dueDate, 'dueDate') : undefined,
        estimatedMinutes: dto.estimatedMinutes,
        color: dto.color,
        // 图标：'' 表示清空回中性默认图标（DTO 白名单已放行空串）
        icon: dto.icon === undefined ? undefined : dto.icon === '' ? null : dto.icon,
        repeatWeekdays: dto.repeatWeekdays,
        requiresApproval,
        reviewerId,
        rewardProfile,
      },
    });
    return this.toDto(updated);
  }

  /** 软删除（completed 不可删） */
  async remove(actor: RequestActor, taskId: string): Promise<void> {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.deletedAt) throw new NotFoundException({ error: 'not_found', reason: TASK_REASON.NOT_FOUND });
    this.assertScope(actor, task);
    if (task.status === 'completed') {
      throw new ConflictException({ error: 'conflict', reason: TASK_REASON.NOT_DELETABLE });
    }
    await this.prisma.task.update({ where: { id: taskId }, data: { deletedAt: new Date() } });
  }

  /**
   * 状态动作（v1.2 §8.2 矩阵；start/resume 由孩子执行；complete 走统一完成模型）。
   * 完成动作委托 CompletionService.submit（无需审批=自动批准定稿；需审批=pending 闸门）。
   */
  async changeStatus(actor: RequestActor, taskId: string, action: 'start' | 'complete' | 'resume'): Promise<TaskDto> {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.deletedAt) throw new NotFoundException({ error: 'not_found', reason: TASK_REASON.NOT_FOUND });
    if (actor.role !== 'child' || task.childId !== actor.sub) {
      throw new ForbiddenException({ error: 'forbidden', reason: TASK_REASON.FORBIDDEN });
    }

    if (action === 'complete') {
      await this.completion.submit(actor, taskId, {});
      const after = await this.prisma.task.findUniqueOrThrow({ where: { id: taskId } });
      return this.toDto(after);
    }

    const target: TaskStatus = action === 'start' || action === 'resume' ? 'in_progress' : task.status as TaskStatus;
    if (!nextTaskStatus(task.status as TaskStatus, target)) {
      throw new ConflictException({ error: 'conflict', reason: TASK_REASON.ILLEGAL_TRANSITION });
    }
    const updated = await this.prisma.task.update({ where: { id: taskId }, data: { status: target } });
    return this.toDto(updated);
  }

  // ---- 内部 ----
  private assertScope(
    actor: RequestActor,
    task: { id: string; familyId: string; childId: string },
  ): void {
    const inFamily = actor.familyId !== null && task.familyId === actor.familyId;
    if (actor.sub !== task.childId && !inFamily) {
      throw new ForbiddenException({ error: 'forbidden', reason: TASK_REASON.FORBIDDEN });
    }
  }

  private toDto(r: {
    id: string;
    familyId: string;
    childId: string;
    title: string;
    description: string | null;
    subject: string | null;
    priority: number;
    startAt: Date | null;
    endAt: Date | null;
    dueDate: Date | null;
    estimatedMinutes: number | null;
    color: string | null;
    icon: string | null;
    repeatWeekdays: number | null;
    requiresApproval: boolean;
    reviewerId: string | null;
    rewardProfile: string | null;
    status: string;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
  }): TaskDto {
    return {
      id: r.id,
      familyId: r.familyId,
      childId: r.childId,
      title: r.title,
      description: r.description,
      subject: r.subject,
      priority: r.priority,
      startAt: r.startAt?.toISOString() ?? null,
      endAt: r.endAt?.toISOString() ?? null,
      dueDate: r.dueDate?.toISOString() ?? null,
      estimatedMinutes: r.estimatedMinutes,
      color: r.color,
      icon: r.icon,
      repeatWeekdays: r.repeatWeekdays,
      requiresApproval: r.requiresApproval,
      reviewerId: r.reviewerId,
      rewardProfile: r.rewardProfile,
      status: r.status as TaskStatus,
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}
