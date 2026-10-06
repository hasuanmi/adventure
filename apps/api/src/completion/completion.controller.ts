import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { TaskCompletionDto } from '@huahua/shared-types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard, RequestActor } from '../auth/jwt-auth.guard';
import { CompletionService } from './completion.service';
import { SubmitCompletionDto } from './dto';

@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class CompletionController {
  constructor(private readonly completion: CompletionService) {}

  @Post(':taskId/complete')
  async submit(
    @CurrentUser() actor: RequestActor,
    @Param('taskId') taskId: string,
    @Body() dto: SubmitCompletionDto,
  ): Promise<TaskCompletionDto[]> {
    return this.completion.submit(actor, taskId, dto);
  }

  @Get(':taskId/completions')
  async list(@CurrentUser() actor: RequestActor, @Param('taskId') taskId: string): Promise<TaskCompletionDto[]> {
    return this.completion.list(taskId, actor);
  }
}
