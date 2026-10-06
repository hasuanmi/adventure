// 日程（Two-Day）时间轴常量与纯函数
// 参考：TaskLabs calendar-week.tsx 定位算法（top = 分钟差/60 × HOUR_PX；HOUR_PX=56）
// 本模块只依赖原生 Date，不引入第三方时间/日历库。

export const SCHEDULE_START_MIN = 7 * 60 + 30; // 07:30
export const SCHEDULE_END_MIN = 21 * 60 + 30; // 21:30
export const SCHEDULE_HOUR_PX = 56; // 每小时像素高（TaskLabs HOUR_PX=56）
export const SCHEDULE_TOTAL_MIN = SCHEDULE_END_MIN - SCHEDULE_START_MIN; // 840（14h）
export const SCHEDULE_TOTAL_PX = (SCHEDULE_TOTAL_MIN / 60) * SCHEDULE_HOUR_PX; // 784

/** 解析 ISO 字符串为 Date（兼容带 Z/offset 的 timestamptz 序列化结果） */
export function parseIso(s: string): Date {
  return new Date(s);
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** 当日分钟数（含秒的小数，用于精确 top 定位） */
export function minuteOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

export function formatHM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * 时刻在时间轴上的 top（px），锚点 = 07:30。
 * 超出窗口（如 06:30 / 22:00 的任务）clamp 到可视区内，保证"有 startAt 的任务"不会从日程消失。
 */
export function topForMinute(minute: number): number {
  const raw = ((minute - SCHEDULE_START_MIN) / 60) * SCHEDULE_HOUR_PX;
  return Math.min(Math.max(raw, 0), SCHEDULE_TOTAL_PX - 24);
}

/** 时间刻度标签（07:30 → 20:30；每行 = 该行的起始时刻，21:30 为底边不标注） */
export function hourLabels(): string[] {
  const labels: string[] = [];
  const rows = SCHEDULE_TOTAL_MIN / 60; // 14
  for (let i = 0; i < rows; i++) {
    const total = SCHEDULE_START_MIN + i * 60;
    labels.push(
      `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`,
    );
  }
  return labels;
}

const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];

/** 日期副标题：如「10月5日 周一」 */
export function dayTitle(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日 周${WEEK_CN[d.getDay()]}`;
}

export function weekdayCn(d: Date): string {
  return WEEK_CN[d.getDay()];
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** 所在周的周一（周一为一周起点） */
export function mondayOf(d: Date): Date {
  const offset = d.getDay() === 0 ? 6 : d.getDay() - 1;
  return addDays(startOfDay(d), -offset);
}

/** 选中日所在周的 7 天（周一 ~ 周日，日期条用） */
export function weekDays7(d: Date): Date[] {
  const monday = mondayOf(d);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** 某日某分钟 → Date（本地时区；时间格点击创建用） */
export function dateAtMinute(date: Date, minute: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(minute / 60), minute % 60);
}

/** datetime-local 输入值：YYYY-MM-DDTHH:mm（本地） */
export function toLocalInputValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** date 输入值：YYYY-MM-DD */
export function toDateInputValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 新建任务的默认时长（分钟） */
export const DEFAULT_SLOT_MINUTES = 60;

/**
 * 新建任务的默认时段（datetime-local 本地字符串，日期固定为「今天」，用户可改）。
 *
 * 规则（参考 TaskLabs `schedule-constraints.ts`：新事件不得从过去开始 + 默认 60 分钟）：
 * - 开始 = 下一个整点（正好整点则用当前整点）
 * - 不早于日程窗口起点 07:30；不跨天（最晚 23:55，此时时长自动压缩到当天结束）
 * - 结束 = 开始 + 60 分钟
 * 这样新建的任务默认就落在日程上，不需要手填时间即可看到。
 */
export function defaultTaskSlot(now: Date = new Date()): { startAt: string; endAt: string } {
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const onTheHour = now.getMinutes() === 0 && now.getSeconds() === 0;
  let startMin = onTheHour ? nowMin : (Math.floor(nowMin / 60) + 1) * 60;
  startMin = Math.max(startMin, SCHEDULE_START_MIN); // 不早于 07:30
  if (startMin > 23 * 60 + 55) startMin = Math.min(Math.ceil((nowMin + 1) / 5) * 5, 23 * 60 + 55);
  if (startMin < nowMin) startMin = Math.min(Math.ceil((nowMin + 1) / 5) * 5, 23 * 60 + 55);
  const endMin = Math.min(startMin + DEFAULT_SLOT_MINUTES, 23 * 60 + 59);
  return {
    startAt: toLocalInputValue(dateAtMinute(now, startMin)),
    endAt: toLocalInputValue(dateAtMinute(now, endMin)),
  };
}

/** 由开始时间推导结束时间（+60 分钟；不跨天则压到 23:59） */
export function endAtFromStart(startLocalValue: string): string {
  const start = new Date(startLocalValue);
  if (Number.isNaN(start.getTime())) return '';
  const end = new Date(start.getTime() + DEFAULT_SLOT_MINUTES * 60 * 1000);
  const sameDayEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 59);
  return toLocalInputValue(end.getTime() > sameDayEnd.getTime() ? sameDayEnd : end);
}

export interface TaskTimeFields {
  startAt?: string | null;
  endAt?: string | null;
  repeatWeekdays?: number | null;
}

/**
 * 任务是否落在某天的两日窗口（展示层投影规则）：
 * - startAt 当天 → 是
 * - 否则若 repeatWeekdays（位掩码 bit0=周一…bit6=周日）含该天星期，且该天 >= startAt 日期 → 是（周重复）
 */
export function taskAppliesToDay(t: TaskTimeFields, day: Date): boolean {
  if (!t.startAt) return false;
  const start = parseIso(t.startAt);
  if (isSameDay(start, day)) return true;
  const bits = t.repeatWeekdays ?? 0;
  if (bits <= 0) return false;
  const bitIndex = (day.getDay() + 6) % 7; // Mon=0 … Sun=6
  if ((bits & (1 << bitIndex)) === 0) return false;
  return day.getTime() >= startOfDay(start).getTime();
}
