import { useEffect, useLayoutEffect, useRef } from 'react';
import type { TaskDto } from '@huahua/shared-types';
import { assignLanes } from '@huahua/shared-types';
import { cn } from '../../lib/utils';
import {
  SCHEDULE_END_MIN,
  SCHEDULE_HOUR_PX,
  SCHEDULE_START_MIN,
  SCHEDULE_TOTAL_PX,
  addDays,
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

export interface ScheduleEvent {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  color?: string;
}

export interface ScheduleDay {
  date: Date;
  tasks: TaskDto[];
  events?: ScheduleEvent[];
}

interface ScheduleGridProps {
  /** 连续多日（范围由页面维护，可无限扩展） */
  days: ScheduleDay[];
  today: Date;
  focusDate?: Date;
  onSelectTask?: (task: TaskDto) => void;
  onSlotClick?: (date: Date, minute: number) => void;
  onSelectDay?: (date: Date) => void;
  /**
   * 拖到接近边缘 → 请求扩展日期范围：
   *  ``-1`` = 在前面插入 ``extendBy`` 天；``1`` = 在后面追加 ``extendBy`` 天。
   *  页面扩展后本组件自动补偿 scrollLeft（视觉位置不跳），从而**可以一直往两边拖**。
   */
  onExtendRange?: (direction: -1 | 1) => void;
  /** 每次扩展的天数（必须与页面实际扩展的天数一致） */
  extendBy?: number;
}

export const DAY_COL_PX = 168;
const GUTTER_PX = 56;
const DRAG_THRESHOLD_PX = 6;
const HEADER_H = 46;
/** 距两端多少像素内触发扩展（约 2 列） */
const EDGE_TRIGGER_PX = DAY_COL_PX * 2;

/**
 * 日程网格（可**无限**左右拖动的时间轴）
 *
 * 针对用户反馈"划动有延迟 / 只能拖一周"的设计：
 *  · 无限拖动：日期范围由页面维护，拖到距边缘 2 列时请求扩展；扩展后在 layoutEffect 里补偿
 *    scrollLeft（前面插入 N 天就补 N×列宽），位置不跳 → 可以一直往两边拖。
 *  · 不卡顿：表头位移**直接写 DOM**（不走 state）；并且
 *    - 鼠标：自己写 scrollLeft（瞬时）；
 *    - 触屏/笔：**交给浏览器原生滚动**（只同步表头），避免"手动写 + 原生滚动"互相打架造成卡顿。
 *  · 表头独立一行 ``sticky top-0``（纵向常驻），横向随表体位移；左时间刻度 ``sticky left-0``。
 */
export function ScheduleGrid({
  days,
  today,
  focusDate,
  onSelectTask,
  onSlotClick,
  onSelectDay,
  onExtendRange,
  extendBy = 14,
}: ScheduleGridProps) {
  const labels = hourLabels();
  const scroller = useRef<HTMLDivElement>(null);
  const headerRow = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startLeft: number; moved: boolean; pointerType: string } | null>(null);
  const suppressClick = useRef(false);
  /** 已请求扩展（等 days 变化后补偿并复位），避免重复请求 */
  const pendingExtend = useRef<-1 | 1 | null>(null);
  const lastDayCount = useRef(days.length);

  const syncHeader = (left: number): void => {
    if (headerRow.current) headerRow.current.style.transform = `translateX(${-left}px)`;
  };

  // 范围变化后的补偿：前面插入了 N 天 → scrollLeft 前移 N×列宽（视觉位置保持不变）
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const delta = days.length - lastDayCount.current;
    if (delta > 0 && pendingExtend.current === -1) {
      el.scrollLeft += extendBy * DAY_COL_PX;
      syncHeader(el.scrollLeft);
    }
    if (delta !== 0) {
      lastDayCount.current = days.length;
      pendingExtend.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.length]);

  // 选中日滚入视野
  useEffect(() => {
    const el = scroller.current;
    if (!el || !focusDate) return;
    const index = days.findIndex((d) => isSameDay(d.date, focusDate));
    if (index < 0) return;
    const next = Math.max(0, index * DAY_COL_PX);
    el.scrollLeft = next;
    syncHeader(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusDate?.toDateString()]);

  function maybeExtend(el: HTMLDivElement): void {
    if (!onExtendRange || pendingExtend.current) return;
    const max = el.scrollWidth - el.clientWidth;
    if (el.scrollLeft < EDGE_TRIGGER_PX) {
      pendingExtend.current = -1;
      onExtendRange(-1);
    } else if (el.scrollLeft > max - EDGE_TRIGGER_PX) {
      pendingExtend.current = 1;
      onExtendRange(1);
    }
  }

  function handleColumnClick(e: React.MouseEvent<HTMLDivElement>, d: Date) {
    if (!onSlotClick) return;
    if ((e.target as HTMLElement).closest('[data-schedule-chip]')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const hourFrac = (e.clientY - rect.top) / SCHEDULE_HOUR_PX;
    const minute = Math.min(
      Math.max(Math.round((SCHEDULE_START_MIN + hourFrac * 60) / 15) * 15, SCHEDULE_START_MIN),
      SCHEDULE_END_MIN - 15,
    );
    onSlotClick(d, minute);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = scroller.current;
    if (!el) return;
    drag.current = { startX: e.clientX, startLeft: el.scrollLeft, moved: false, pointerType: e.pointerType };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = scroller.current;
    const d = drag.current;
    if (!el || !d) return;
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
    if (!d.moved) {
      d.moved = true;
      if (d.pointerType === 'mouse') el.setPointerCapture?.(e.pointerId);
    }
    if (d.pointerType === 'mouse') {
      el.scrollLeft = d.startLeft - dx;
      syncHeader(el.scrollLeft);
      suppressClick.current = true;
      maybeExtend(el);
    }
  }

  function endDrag() {
    drag.current = null;
  }

  const headerWidth = days.length * DAY_COL_PX;

  return (
    <div className="border-2 border-ink bg-panel shadow-pixel">
      {/* 表头行：纵向 sticky；横向与表体同步（直接写 DOM，无渲染延迟） */}
      <div className="sticky top-0 z-30 flex border-b-2 border-ink bg-panel">
        <div className="shrink-0 border-r-2 border-ink bg-panel" style={{ width: GUTTER_PX, height: HEADER_H }} />
        <div className="min-w-0 flex-1 overflow-hidden">
          <div
            ref={headerRow}
            data-day-header-row
            className="flex will-change-transform"
            style={{ width: headerWidth }}
          >
            {days.map((d) => {
              const isToday = isSameDay(d.date, today);
              const isTomorrow = isSameDay(d.date, addDays(today, 1));
              // 结构对所有日期一致：第一行 = M月D日，第二行 = 周X（今天/明天加标记）
              const title = `${d.date.getMonth() + 1}月${d.date.getDate()}日`;
              const weekday = `周${weekdayCn(d.date)}`;
              const subtitle = isToday ? `今天 · ${weekday}` : isTomorrow ? `明天 · ${weekday}` : weekday;
              const headerClass = cn(
                'shrink-0 border-r-2 border-ink/40 px-1 py-2 text-center',
                isToday && 'bg-accent/10',
              );
              const content = (
                <>
                  <div
                    className={cn('text-xs font-extrabold tracking-widest', isToday ? 'text-accent' : 'text-ink')}
                    style={{ textShadow: '1px 1px 0 rgba(58,42,30,0.25)' }}
                  >
                    {title}
                  </div>
                  <div className={cn('mt-0.5 text-[11px] font-bold', isToday ? 'text-accent' : 'text-inkSoft')}>
                    {subtitle}
                  </div>
                </>
              );
              return onSelectDay ? (
                <button
                  key={d.date.toISOString()}
                  type="button"
                  data-day-header
                  onClick={() => onSelectDay(d.date)}
                  aria-label={`跳到 ${d.date.getMonth() + 1}月${d.date.getDate()}日 日程`}
                  style={{ width: DAY_COL_PX, height: HEADER_H }}
                  className={cn(headerClass, 'cursor-pointer transition-colors hover:bg-panelLight')}
                >
                  {content}
                </button>
              ) : (
                <div
                  key={d.date.toISOString()}
                  data-day-header
                  style={{ width: DAY_COL_PX, height: HEADER_H }}
                  className={headerClass}
                >
                  {content}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 表体：横向滚动容器（y 交给页面） */}
      <div
        ref={scroller}
        data-schedule-scroll
        onScroll={(e) => {
          const el = e.target as HTMLDivElement;
          syncHeader(el.scrollLeft);
          maybeExtend(el);
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            suppressClick.current = false;
            e.stopPropagation();
            e.preventDefault();
          }
        }}
        className="relative flex cursor-grab select-none overflow-x-auto overflow-y-clip overscroll-x-contain active:cursor-grabbing [touch-action:pan-x]"
      >
        {/* 左时间刻度（横拖时固定） */}
        <div className="sticky left-0 z-20 shrink-0 border-r-2 border-ink bg-panel" style={{ width: GUTTER_PX }}>
          {labels.map((l) => (
            <div
              key={l}
              style={{ height: SCHEDULE_HOUR_PX }}
              data-hour-line
              className="border-b-2 border-ink/30 px-1 text-right text-[10px] font-bold text-inkSoft"
            >
              {l}
            </div>
          ))}
        </div>

        {days.map((d) => {
          const isToday = isSameDay(d.date, today);
          const ranges = d.tasks
            .filter((t) => t.startAt)
            .map((t) => {
              const s = minuteOfDay(parseIso(t.startAt as string));
              const e = t.endAt ? minuteOfDay(parseIso(t.endAt)) : s + 30;
              return { id: t.id, start: s, end: Math.max(e, s + 15), title: t.title };
            });
          const laneOf = new Map(assignLanes(ranges).map((a) => [a.id, a]));

          return (
            <div
              key={d.date.toISOString()}
              data-day-col
              data-day-iso={d.date.toISOString().slice(0, 10)}
              style={{ width: DAY_COL_PX }}
              className={cn('shrink-0 border-r-2 border-ink/40 bg-panel', isToday && 'bg-accent/5')}
            >
              <div
                className={cn('relative', onSlotClick && 'cursor-pointer')}
                onClick={(e) => handleColumnClick(e, d.date)}
              >
                {labels.map((l) => (
                  <div
                    key={l}
                    style={{ height: SCHEDULE_HOUR_PX }}
                    data-hour-line
                    className="border-b-2 border-ink/30"
                  />
                ))}

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
                  const lane = laneOf.get(t.id);
                  const laneCount = lane?.laneCount ?? 1;
                  const widthPct = 100 / laneCount;
                  return (
                    <div
                      key={t.id}
                      data-task-block
                      data-lane={(lane?.lane ?? 0) + 1}
                      data-lane-count={laneCount}
                      className="absolute z-10"
                      style={{
                        top,
                        height,
                        left: `calc(${(lane?.lane ?? 0) * widthPct}% + 3px)`,
                        width: `calc(${widthPct}% - 5px)`,
                      }}
                    >
                      <ScheduleChip
                        variant="task"
                        title={t.title}
                        timeLabel={formatHM(start)}
                        color={t.color ?? undefined}
                        completed={t.status === 'completed'}
                        conflicting={laneCount > 1}
                        onClick={onSelectTask ? () => onSelectTask(t) : undefined}
                        className="h-full"
                      />
                    </div>
                  );
                })}

                {(d.events ?? []).map((e) => {
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

                {isToday && <CurrentTimeLine enabled />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
