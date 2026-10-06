import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import {
  ATTENDANCE_REASON,
  ATTENDANCE_STATUSES,
  DEFAULT_ATTENDANCE_TIMEZONE,
  AttendanceDto,
  AttendanceTodayDto,
  calendarDateInTimeZone,
  attendanceMinutes,
  attendanceTodayState,
} from '@huahua/shared-types';
import type { Attendance } from '@prisma/client';
import { RequestActor } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

/** 月度参数：month=YYYY-MM 或 from/to=YYYY-MM-DD（迁移自 WorkPulse getTimesheet） */
export interface AttendanceHistoryQuery {
  month?: string;
  from?: string;
  to?: string;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_ONLY = /^\d{4}-\d{2}$/;

/**
 * 打卡服务（WorkPulse attendance.service 逻辑重写为 NestJS/Prisma，未逐行拷贝）：
 *  · checkIn：预检（当天已有 → 409）+ 创建时捕获 PG 23505 → 409（并发双保险）
 *  · checkOut：无记录/未打卡 → 400；已签退 → 409；total_minutes = max(0, round((now − checkIn)/60000))
 *  · today：三态（NOT_CHECKED_IN / CHECKED_IN / CHECKED_OUT）
 *  · history：月（YYYY-MM）或区间（from/to）
 * 时区：以 ATTENDANCE_TIMEZONE（默认 Asia/Shanghai）计算"日历日"，时间戳存 UTC。
 */
@Injectable()
export class AttendanceService {
  private readonly timeZone = process.env.ATTENDANCE_TIMEZONE ?? DEFAULT_ATTENDANCE_TIMEZONE;

  constructor(private readonly prisma: PrismaService) {}

  /** 今日状态（家庭时区口径） */
  async today(actor: RequestActor): Promise<AttendanceTodayDto> {
    const familyId = this.requireFamily(actor);
    const date = calendarDateInTimeZone(new Date(), this.timeZone);
    const record = await this.prisma.attendance.findFirst({
      where: { familyId, userId: actor.sub, attendanceDate: new Date(`${date}T00:00:00.000Z`) },
    });
    const dto = record ? this.toDto(record) : null;
    return { state: attendanceTodayState(dto), date, record: dto };
  }

  /** 打卡（今日）；重复打卡 → 409 */
  async checkIn(actor: RequestActor): Promise<AttendanceTodayDto> {
    const familyId = this.requireFamily(actor);
    const date = calendarDateInTimeZone(new Date(), this.timeZone);
    const attendanceDate = new Date(`${date}T00:00:00.000Z`);

    // 预检（第一道：给出明确错误语义）
    const existing = await this.prisma.attendance.findFirst({
      where: { familyId, userId: actor.sub, attendanceDate },
    });
    if (existing) {
      throw new ConflictException({ error: 'conflict', reason: ATTENDANCE_REASON.ALREADY_CHECKED_IN });
    }

    try {
      const created = await this.prisma.attendance.create({
        data: {
          familyId,
          userId: actor.sub,
          attendanceDate,
          checkInAt: new Date(),
          status: ATTENDANCE_STATUSES[0],
        },
      });
      return { state: attendanceTodayState(this.toDto(created)), date, record: this.toDto(created) };
    } catch (error) {
      // 并发双保险：唯一索引冲突（Prisma P2002 / PG 23505）同样映射为 409
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({ error: 'conflict', reason: ATTENDANCE_REASON.ALREADY_CHECKED_IN });
      }
      throw error;
    }
  }

  /** 签退（必须先打卡且未签退）；派生 total_minutes */
  async checkOut(actor: RequestActor): Promise<AttendanceTodayDto> {
    const familyId = this.requireFamily(actor);
    const date = calendarDateInTimeZone(new Date(), this.timeZone);
    const attendanceDate = new Date(`${date}T00:00:00.000Z`);

    const record = await this.prisma.attendance.findFirst({
      where: { familyId, userId: actor.sub, attendanceDate },
    });
    if (!record) {
      throw new BadRequestException({ error: 'bad_request', reason: ATTENDANCE_REASON.NOT_CHECKED_IN });
    }
    if (record.checkOutAt) {
      throw new ConflictException({ error: 'conflict', reason: ATTENDANCE_REASON.ALREADY_CHECKED_OUT });
    }

    const checkOutAt = new Date();
    const updated = await this.prisma.attendance.update({
      where: { id: record.id },
      data: { checkOutAt, totalMinutes: attendanceMinutes(record.checkInAt, checkOutAt) },
    });
    return { state: attendanceTodayState(this.toDto(updated)), date, record: this.toDto(updated) };
  }

  /** 历史：?month=YYYY-MM 或 ?from=&to=（按 attendance_date 过滤，纯日期无时区歧义） */
  async history(actor: RequestActor, query: AttendanceHistoryQuery): Promise<AttendanceDto[]> {
    const familyId = this.requireFamily(actor);
    const range = this.resolveRange(query);
    const rows = await this.prisma.attendance.findMany({
      where: {
        familyId,
        userId: actor.sub,
        attendanceDate: { gte: range.from, lt: range.to },
      },
      orderBy: { attendanceDate: 'desc' },
    });
    return rows.map((row) => this.toDto(row));
  }

  private resolveRange(query: AttendanceHistoryQuery): { from: Date; to: Date } {
    if (query.month) {
      if (!MONTH_ONLY.test(query.month)) {
        throw new BadRequestException({ error: 'bad_request', reason: ATTENDANCE_REASON.INVALID_MONTH });
      }
      const [year, month] = query.month.split('-').map(Number);
      const from = new Date(Date.UTC(year, month - 1, 1));
      const to = new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1));
      return { from, to };
    }
    if (query.from && query.to) {
      if (!DATE_ONLY.test(query.from) || !DATE_ONLY.test(query.to)) {
        throw new BadRequestException({ error: 'bad_request', reason: ATTENDANCE_REASON.INVALID_MONTH });
      }
      const from = new Date(`${query.from}T00:00:00.000Z`);
      const to = new Date(`${query.to}T00:00:00.000Z`);
      // to 为闭区间右端 → 次日零点作为开区间上界
      to.setUTCDate(to.getUTCDate() + 1);
      return { from, to };
    }
    // 默认：本月
    const now = calendarDateInTimeZone(new Date(), this.timeZone);
    return this.resolveRange({ month: now.slice(0, 7) });
  }

  private requireFamily(actor: RequestActor): string {
    if (!actor.familyId) {
      throw new BadRequestException({ error: 'bad_request', reason: ATTENDANCE_REASON.FAMILY_REQUIRED });
    }
    return actor.familyId;
  }

  private isUniqueViolation(error: unknown): boolean {
    const code = (error as { code?: string } | null)?.code;
    return code === 'P2002';
  }

  private toDto(row: Attendance): AttendanceDto {
    return {
      id: row.id,
      userId: row.userId,
      // attendance_date 是 DATE → 取 UTC 日期部分，避免时区回退一天
      attendanceDate: row.attendanceDate.toISOString().slice(0, 10),
      checkInAt: row.checkInAt.toISOString(),
      checkOutAt: row.checkOutAt ? row.checkOutAt.toISOString() : null,
      totalMinutes: row.totalMinutes,
      status: (row.status as AttendanceDto['status']) ?? ATTENDANCE_STATUSES[0],
    };
  }
}
