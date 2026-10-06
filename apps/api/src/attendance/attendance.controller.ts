import { Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { AttendanceDto, AttendanceTodayDto } from '@huahua/shared-types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard, RequestActor } from '../auth/jwt-auth.guard';
import { AttendanceHistoryDto } from './dto';
import { AttendanceService } from './attendance.service';

// /attendance（v1.2 §14：POST check-in / POST check-out / GET today / GET ?month=）
// 归属：一律取 JWT 里的 familyId + userId（本产品无 Family 子路由，硬基线见 v1.2 §18）
@UseGuards(JwtAuthGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('today')
  async today(@CurrentUser() actor: RequestActor): Promise<AttendanceTodayDto> {
    return this.attendance.today(actor);
  }

  @Post('check-in')
  @HttpCode(201)
  async checkIn(@CurrentUser() actor: RequestActor): Promise<AttendanceTodayDto> {
    return this.attendance.checkIn(actor);
  }

  @Post('check-out')
  @HttpCode(200)
  async checkOut(@CurrentUser() actor: RequestActor): Promise<AttendanceTodayDto> {
    return this.attendance.checkOut(actor);
  }

  @Get()
  async history(
    @CurrentUser() actor: RequestActor,
    @Query() query: AttendanceHistoryDto,
  ): Promise<AttendanceDto[]> {
    return this.attendance.history(actor, query);
  }
}
