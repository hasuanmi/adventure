import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApprovalRequestDto } from '@huahua/shared-types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard, RequestActor } from '../auth/jwt-auth.guard';
import { ApprovalService } from './approval.service';
import { CreateApprovalDto, DecideApprovalDto, RejectApprovalDto } from './dto';

@UseGuards(JwtAuthGuard)
@Controller('approvals')
export class ApprovalController {
  constructor(private readonly approval: ApprovalService) {}

  /** 通用创建申请（P1 主要由 completion 适配器内部调用；HTTP 通道的越权校验在 service） */
  @Post()
  @HttpCode(201)
  async create(@CurrentUser() actor: RequestActor, @Body() dto: CreateApprovalDto): Promise<ApprovalRequestDto> {
    // 通用创建：familyId/childId 以申请人为准（业务模块内部会传入业务上下文）
    return this.approval.createRequest(actor, dto, { familyId: actor.familyId ?? '', childId: actor.sub });
  }

  @Get()
  async list(
    @CurrentUser() actor: RequestActor,
    @Query('as') as?: string,
    @Query('status') status?: string,
  ): Promise<ApprovalRequestDto[]> {
    return this.approval.list(actor, as, status);
  }

  @Get(':id')
  async get(@CurrentUser() actor: RequestActor, @Param('id') id: string): Promise<ApprovalRequestDto> {
    return this.approval.getById(id, actor);
  }

  @Get(':id/audit')
  async audit(@CurrentUser() actor: RequestActor, @Param('id') id: string) {
    return { records: await this.approval.audit(id, actor) };
  }

  @Post(':id/approve')
  async approve(
    @CurrentUser() actor: RequestActor,
    @Param('id') id: string,
    @Body() dto: DecideApprovalDto,
  ): Promise<ApprovalRequestDto> {
    return this.approval.decide(id, actor, 'approve', dto.comment);
  }

  @Post(':id/reject')
  async reject(
    @CurrentUser() actor: RequestActor,
    @Param('id') id: string,
    @Body() dto: RejectApprovalDto,
  ): Promise<ApprovalRequestDto> {
    return this.approval.decide(id, actor, 'reject', dto.comment);
  }

  @Post(':id/cancel')
  @HttpCode(204)
  async cancel(@CurrentUser() actor: RequestActor, @Param('id') id: string): Promise<void> {
    await this.approval.cancel(id, actor);
  }
}
