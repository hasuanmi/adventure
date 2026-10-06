import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { PracticeRecordDto } from '@huahua/shared-types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard, RequestActor } from '../auth/jwt-auth.guard';
import { PracticeService, PracticeStatsDto } from './practice.service';

// /practice（对照上游 /api/practice/record、/api/stats/practice、/api/stats/practice/clear）
@UseGuards(JwtAuthGuard)
@Controller('practice')
export class PracticeController {
  constructor(private readonly practice: PracticeService) {}

  @Post('records')
  async record(
    @CurrentUser() actor: RequestActor,
    @Body() body: { subject?: string | null; difficulty?: string | null; isCorrect?: boolean | null },
  ): Promise<PracticeRecordDto> {
    return this.practice.record(actor, body);
  }

  @Get('stats')
  async stats(@CurrentUser() actor: RequestActor): Promise<PracticeStatsDto> {
    return this.practice.stats(actor);
  }

  @Delete('stats')
  async clear(@CurrentUser() actor: RequestActor): Promise<{ deleted: number }> {
    return this.practice.clear(actor);
  }
}
