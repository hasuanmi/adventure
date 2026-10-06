import { useEffect, useRef } from 'react';
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

interface ScheduleGridProps {
  /** 横向排列的多日（日程页传整周 7 天） */
  days: ScheduleDay[];
  /** 真实今天（决定「今天/明天」标签与当前时间线） */
  today: Date;
  /** 需要滚入视野的日期（通常是当前选中日） */
  focusDate?: Date;
  onSelectTask?: (task: TaskDto) => void;
  /** 点击时间轴空白区 → 创建任务（date + 当天分钟数；点击任务块不触发） */
  onSlotClick?: (date: Date, minute: number) => void;
  /** 点击列头日期 → 跳到该日日程 */
  onSelectDay?: (date: Date) => void;
  /** 左右拖动到边缘 → 请求切到上/下一周（-1 = 往前，1 = 往后） */
  onEdgePan?: (direction: -1 | 1) => void;
}

/** 单日列宽（保证一周 7 列在桌面端也宽于容器，横向拖动才有内容可看） */
const DAY_COL_PX = 168;
/** 左侧时间刻度宽 */
const GUTTER_PX = 56;
/** 拖动判定阈值：超过它才算"拖动"，否则按点击处理 */
const DRAG_THRESHOLD_PX = 6;
const HEADER_H = 46;

/**
 * 日程网格（多日横向时间轴）
 *
 * 用户要求："日程表左右拖动可以看到其他日期的日程，且上方日历跟着一起动"。
 * 实现要点：
 *  · 表头**单独一行**并 ``sticky top-0``（纵向固定在视口，保住"整页滚动 + 表头常驻"）；
 *    它的横向位移由表体 ``scrollLeft`` 通过 transform 同步 → 拖动时日期一起动；
 *    不把表头塞进横向滚动容器，是因为 ``overflow-x:auto`` 会让 sticky top 相对该容器失效。
 *  · 表体是横向滚动容器（``overflow-x-auto`` + ``overflow-y-clip``）：x 轴自己滚，y 轴交给页面；
 *  · 左侧时间刻度 ``sticky left-0``，横拖时固定不动；
 *  · 鼠标/触屏**按住左右拖动**即可平移（超过阈值才算拖动，避免误吞点击）；
 *  · 拖到两端继续拖 → 通过 ``onEdgePan`` 切上一周/下一周，实现连续浏览。
 */
export function ScheduleGrid({
  days,
  today,
  focusDate,
  onSelectTask,
  onSlotClick,
  onSelectDay,
  onEdgePan,
}: ScheduleGridProps) {
  const labels = hourLabels();
  const scroller = useRef<HTMLDivElement>(null);
  const headerRow = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startLeft: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  /**
   * 表头横向位移：**直接写 DOM，不走 React state**。
   * 之前用 state 驱动 → 拖动时表头比表体晚一帧渲染，用户看到"第一列表头和下方不同步"。
   */
  const syncHeader = (left: number): void => {
    if (headerRow.current) headerRow.current.style.transform = `translateX(${-left}px)`;
  };

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
  }, [focusDate?.toDateString(), days.length]);

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
    drag.current = { startX: e.clientX, startLeft: el.scrollLeft, moved: false };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = scroller.current;
    const d = drag.current;
    if (!el || !d) return;
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
    if (!d.moved) {
      d.moved = true;
      el.setPointerCapture?.(e.pointerId);
    }
    const max = el.scrollWidth - el.clientWidth;
    // 拖到边缘还要继续拖 → 切换相邻周（连续浏览）
    if (onEdgePan && ((el.scrollLeft <= 0 && dx > 60) || (el.scrollLeft >= max - 1 && dx < -60))) {
      drag.current = null;
      suppressClick.current = true;
      onEdgePan(dx > 0 ? -1 : 1);
      return;
    }
    el.scrollLeft = d.startLeft - dx;
    syncHeader(el.scrollLeft);
    suppressClick.current = true;
  }

  function endDrag() {
    drag.current = null;
  }

  const headerWidth = days.length * DAY_COL_PX;

  return (
    <div className="border-2 border-ink bg-panel shadow-pixel">
      {/* 表头行：纵向 sticky；横向位移与表体同步 */}
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
              // 表头结构对**所有日期完全一致**：第一行 = M月D日，第二行 = 周X（今天/明天加标记）
              const title = `${d.date.getMonth() + 1}月${d.date.getDate()}日`;
              const weekday = `周${weekdayCn(d.date)}`;
              const subtitle = isToday ? `今天 · ${weekday}` : isTomorrow ? `明天 · ${weekday}` : weekday;
              const content = (
                <>
                  <div
                    className={cn(
                      'text-xs font-extrabold tracking-widest',
                      isToday ? 'text-accent' : 'text-ink',
                    )}
                    style={{ textShadow: '1px 1px 0 rgba(58,42,30,0.25)' }}
                  >
                    {title}
                  </div>
                  <div className={cn('mt-0.5 text-[11px] font-bold', isToday ? 'text-accent' : 'text-inkSoft')}>
                    {subtitle}
                  </div>
                </>
              );
              const headerClass = cn(
                'shrink-0 border-r-2 border-ink/40 px-1 py-2 text-center',
                isToday && 'bg-accent/10',
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

      {/* 表体：横向滚动（y 轴交给页面） */}
      <div
        ref={scroller}
        data-schedule-scroll
        onScroll={(e) => syncHeader((e.target as HTMLDivElement).scrollLeft)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
        // 拖动后吞掉随之而来的 click，避免"拖完顺手新建了任务"
        onClickCapture={(e) => {
          if (suppressClick.current) {
            suppressClick.current = false;
            e.stopPropagation();
            e.preventDefault();
          }
        }}
        className="relative flex cursor-grab select-none overflow-x-auto overflow-y-clip active:cursor-grabbing [touch-action:pan-x]"
      >
        {/* 左时间刻度（横拖时固定在左侧） */}
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

                {isToday && <CurrentTimeLine enabled />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
