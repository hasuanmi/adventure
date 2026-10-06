// 打卡（Attendance）—— 数据模型与业务规则迁移自 WorkPulse（MIT；见 docs/opensource-mapping.md）
//
// 已定产品/架构口径（v1.2 文档，勿擅自扩大）：
//  · 打卡**完全独立于 Task**：仅 user_id + attendance_date，不与任务/计时耦合；
//  · **不奖励单纯打卡**，也不惩罚漏打；V1 仅 present（不采用 WorkPulse 的 ABSENT/HALF_DAY 与工时换算）；
//  · 明确不做：GPS/QR/人脸打卡、补卡、连续 streak、薪资/排班；
//  · 与「本周打卡」（任务完成周格，数据源 /growth/grants）**语义分离**，两者互不影响。

/** 打卡记录状态（V1 仅 present；枚举用 VARCHAR + 应用层白名单） */
export const ATTENDANCE_STATUSES = ['present'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** 今日三态（前端按钮显隐依据；迁移自 WorkPulse getTodayState） */
export const ATTENDANCE_TODAY_STATES = ['NOT_CHECKED_IN', 'CHECKED_IN', 'CHECKED_OUT'] as const;
export type AttendanceTodayState = (typeof ATTENDANCE_TODAY_STATES)[number];

export interface AttendanceDto {
  id: string;
  userId: string;
  /** 日历日（家庭时区），YYYY-MM-DD */
  attendanceDate: string;
  /** 打卡时刻（UTC ISO） */
  checkInAt: string;
  /** 签退时刻（UTC ISO）；null = 未签退 */
  checkOutAt: string | null;
  /** 由 checkIn/checkOut 派生的时长（分钟）；未签退为 null */
  totalMinutes: number | null;
  status: AttendanceStatus;
}

export interface AttendanceTodayDto {
  state: AttendanceTodayState;
  /** 家庭时区下的"今天"（YYYY-MM-DD） */
  date: string;
  record: AttendanceDto | null;
}

export const ATTENDANCE_REASON = {
  FAMILY_REQUIRED: 'family_required',
  ALREADY_CHECKED_IN: 'attendance_already_checked_in',
  NOT_CHECKED_IN: 'attendance_not_checked_in',
  ALREADY_CHECKED_OUT: 'attendance_already_checked_out',
  INVALID_MONTH: 'invalid_month',
} as const;
export type AttendanceReason = (typeof ATTENDANCE_REASON)[keyof typeof ATTENDANCE_REASON];

/** 默认家庭时区（可用 ATTENDANCE_TIMEZONE 覆盖） */
export const DEFAULT_ATTENDANCE_TIMEZONE = 'Asia/Shanghai';

/**
 * 把某个时刻换算为指定时区的**日历日**（YYYY-MM-DD）。
 * 纯函数（Intl 为标准库，无 IO/框架依赖）→ API 与客户端共用，避免"今天"口径不一致。
 */
export function calendarDateInTimeZone(instant: Date, timeZone: string = DEFAULT_ATTENDANCE_TIMEZONE): string {
  // en-CA 输出即 YYYY-MM-DD，避免手工拼接与时区偏移
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** 由打卡/签退时刻派生时长（分钟）；未签退或时间倒挂 → null / 0（迁移自 WorkPulse checkOut） */
export function attendanceMinutes(checkInAt: string | Date, checkOutAt: string | Date | null): number | null {
  if (!checkOutAt) return null;
  const start = new Date(checkInAt).getTime();
  const end = new Date(checkOutAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.round((end - start) / 60_000));
}

/** 由记录派生今日三态 */
export function attendanceTodayState(record: Pick<AttendanceDto, 'checkOutAt'> | null): AttendanceTodayState {
  if (!record) return 'NOT_CHECKED_IN';
  return record.checkOutAt ? 'CHECKED_OUT' : 'CHECKED_IN';
}
