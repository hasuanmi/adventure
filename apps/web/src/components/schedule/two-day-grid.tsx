import type { TaskDto } from '@huahua/shared-types';
import { cn } from '../../lib/utils';
import {
  SCHEDULE_END_MIN,
  SCHEDULE_HOUR_PX,
  SCHEDULE_START_MIN,
  SCHEDULE_TOTAL_PX,
  addDays,
  dayTitle,
  formatHM,
  hourLabels,
  isSameDay,
  minuteOfDay,
  parseIso,
  topForMinute,
  weekdayCn,
} from '../../lib/schedule';
import { ScheduleChip } from './schedule-chip';
import { CurrentTimeLine } from './current-time-line';

/** Event 渲染契约（P4 预留：当前无 Event 模型/API，events 为空即不渲染） */
export interface ScheduleEvent {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  color?: string;
}

export interface ScheduleDay {
  date: Date;
  /** startAt 落在当天的任务（含 completed，完成态划线展示） */
  tasks: TaskDto[];
  /** P4 Event 预留，默认空数组 */
  events?: ScheduleEvent[];
}

interface TwoDayGridProps {
  /** 两列：selectedDate + nextDate（由页面日期条决定，不写死今天/明天） */
  days: ScheduleDay[];
  /** 真实今天（决定「今天/明天」标签与当前时间线） */
  today: Date;
  onSelectTask?: (task: TaskDto) => void;
  /** 点击时间轴空白区 → 创建任务（date + 当天分钟数；点击任务块不触发） */
  onSlotClick?: (date: Date, minute: number) => void;
}

// 主体结构参考 TaskLabs CalendarWeek（header 网格 + 左 sticky 时间刻度 + 日列 + 绝对定位事件块）
// 改造：7 列 → 2 列；24h → 07:30–21:30；列标签 = 今天/明天/日期；视觉 = 旧 Demo 像素。
export function TwoDayGrid({ days, today, onSelectTask, onSlotClick }: TwoDayGridProps) {
  const labels = hourLabels();

  function handleColumnClick(e: React.MouseEvent<HTMLDivElement>, d: Date) {
    if (!onSlotClick) return;
    // 点击已有任务块 → 不触发创建（其自身按钮进任务详情）
    if ((e.target as HTMLElement).closest('[data-schedule-chip]')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const hourFrac = (e.clientY - rect.top) / SCHEDULE_HOUR_PX;
    // 点击位置 → 分钟（取整到 15 分钟；clamp 到窗口内）
    const minute = Math.min(
      Math.max(Math.round((SCHEDULE_START_MIN + hourFrac * 60) / 15) * 15, SCHEDULE_START_MIN),
      SCHEDULE_END_MIN - 15,
    );
    onSlotClick(d, minute);
  }

  return (
    <div className="border-2 border-ink bg-panel shadow-pixel">
      {/* 日期 Header：左侧占位 + 两列标题（今天/明天/日期） */}
      <div className="grid grid-cols-[3.5rem_1fr_1fr] divide-x-2 divide-ink/30 border-b-2 border-ink">
        <div />
        {days.map((d) => {
          const isToday = isSameDay(d.date, today);
          const isTomorrow = isSameDay(d.date, addDays(today, 1));
          return (
            <div key={d.date.toISOString()} className="px-1 py-2 text-center">
              <div
                className="text-xs font-extrabold tracking-widest text-ink"
                style={{ textShadow: '1px 1px 0 rgba(58,42,30,0.25)' }}
              >
                {isToday ? '今天' : isTomorrow ? '明天' : `${d.date.getMonth() + 1}月${d.date.getDate()}日`}
              </div>
              <div className="mt-0.5 text-[11px] font-bold text-inkSoft">
                {isToday || isTomorrow ? dayTitle(d.date) : `周${weekdayCn(d.date)}`}
              </div>
            </div>
          );
        })}
      </div>

      {/* 时间轴主体（07:30–21:30） */}
      <div className="relative max-h-[62vh] overflow-auto">
        <div className="flex">
          {/* 左时间刻度（横向滚动时 sticky） */}
          <div className="sticky left-0 z-20 w-14 shrink-0 border-r-2 border-ink bg-panel">
            {labels.map((l) => (
              <div
                key={l}
                style={{ height: SCHEDULE_HOUR_PX }}
                className="border-b-2 border-ink/15 px-1 text-right text-[10px] font-bold text-inkSoft"
              >
                {l}
              </div>
            ))}
          </div>

          {/* 两列（点击空白时间格 → 创建任务） */}
          <div className="grid flex-1 grid-cols-2 divide-x-2 divide-ink/30">
            {days.map((d) => {
              const isToday = isSameDay(d.date, today);
              return (
                <div
                  key={d.date.toISOString()}
                  data-day-col
                  onClick={(e) => handleColumnClick(e, d.date)}
                  className={cn('relative', isToday && 'bg-accent/5', onSlotClick && 'cursor-pointer')}
                >
                  {/* 小时格线 */}
                  {labels.map((l) => (
                    <div
                      key={l}
                      style={{ height: SCHEDULE_HOUR_PX }}
                      className="border-b-2 border-ink/15"
                    />
                  ))}

                  {/* Task 虚线块：有 startAt 才投影；有 endAt → 时段块，仅 startAt → 24px 点块；不推测时长 */}
                  {d.tasks.map((t) => {
                    if (!t.startAt) return null;
                    const start = parseIso(t.startAt);
                    const end = t.endAt ? parseIso(t.endAt) : null;
                    const durationMin = end ? minuteOfDay(end) - minuteOfDay(start) : null;
                    const rawTop = ((minuteOfDay(start) - SCHEDULE_START_MIN) / 60) * SCHEDULE_HOUR_PX;
                    const height =
                      durationMin !== null && durationMin > 0
                        ? Math.max(20, (durationMin / 60) * SCHEDULE_HOUR_PX)
                        : 24;
                    const top = Math.min(Math.max(rawTop, 0), Math.max(0, SCHEDULE_TOTAL_PX - height));
                    return (
                      <div
                        key={t.id}
                        className="absolute inset-x-1 z-10"
                        style={{ top, height }}
                      >
                        <ScheduleChip
                          variant="task"
                          title={t.title}
                          timeLabel={formatHM(start)}
                          color={t.color ?? undefined}
                          completed={t.status === 'completed'}
                          onClick={onSelectTask ? () => onSelectTask(t) : undefined}
                          className="h-full"
                        />
                      </div>
                    );
                  })}

                  {/* Event 实色块（P4 预留：无数据不渲染） */}
                  {d.events?.map((e) => {
                    const start = parseIso(e.startAt);
                    const end = parseIso(e.endAt);
                    const height = Math.max(
                      20,
                      ((minuteOfDay(end) - minuteOfDay(start)) / 60) * SCHEDULE_HOUR_PX,
                    );
                    return (
                      <div
                        key={e.id}
                        className="absolute inset-x-1 z-10"
                        style={{ top: topForMinute(minuteOfDay(start)), height }}
                      >
                        <ScheduleChip
                          variant="event"
                          title={e.title}
                          timeLabel={formatHM(start)}
                          color={e.color}
                          className="h-full"
                        />
                      </div>
                    );
                  })}

                  {/* 当前时间线：仅真实今天列；区间外自动隐藏 */}
                  {isToday && <CurrentTimeLine enabled />}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
