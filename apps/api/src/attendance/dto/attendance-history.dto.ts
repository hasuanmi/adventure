import { IsOptional, Matches } from 'class-validator';

/** 历史查询：month=YYYY-MM 或 from/to=YYYY-MM-DD（迁移自 WorkPulse getTimesheet 的两种口径） */
export class AttendanceHistoryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month 需为 YYYY-MM' })
  month?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from 需为 YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to 需为 YYYY-MM-DD' })
  to?: string;
}
