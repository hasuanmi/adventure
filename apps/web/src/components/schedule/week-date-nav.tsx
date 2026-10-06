import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import { cn } from '../../lib/utils';
import { addDays, isSameDay, weekDays7, weekdayCn } from '../../lib/schedule';

// 7 日日期条（docs/task-create-and-schedule-review.md §2）
// 结构/交互参考 huahuastudy WeekDateNav（拖动整格步进+惯性、滚轮横向防抖、点击），
// 视觉 = 现有 Pixel token（panel/ink/accent/shadow-pixel）。
// 逻辑：唯一 selectedDate（无边界，可左右翻任意周）；下方 TwoDayGrid = selectedDate + nextDate。
export function WeekDateNav({
  selectedDate,
  today,
  onSelect,
}: {
  selectedDate: Date;
  today: Date;
  onSelect: (date: Date) => void;
}) {
  // 交互中偏移天数（拖动/滚轮累计；0 = 未交互）；显示条 = 选中日所在周
  const [shift, setShift] = useState(0);
  const dragRef = useRef<{
    startX: number;
    startDate: Date;
    accum: number;
    active: boolean;
    moved: boolean;
    captured: boolean;
    lastX: number;
    lastT: number;
    v: number;
    samples: number;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const wheelAccumRef = useRef(0);
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const selected = addDays(selectedDate, shift);
  const days = weekDays7(selected);

  useEffect(() => () => clearTimeout(wheelTimerRef.current), []);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = {
      startX: e.clientX, startDate: selectedDate, accum: 0, active: true, moved: false, captured: false,
      lastX: e.clientX, lastT: performance.now(), v: 0, samples: 0,
    };
    suppressClickRef.current = false;
    // 关键：这里**不能**立刻 setPointerCapture。指针捕获会把后续 click 事件重定向到
    // 捕获元素（=本容器），日期按钮自身的 onClick 就永远不会触发 —— 之前"日期点不动"
    // 就是这个原因。改为移动超过阈值后才捕获（见 onPointerMove）。
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d?.active) return;
    // 超过 8px 才算拖动：此时才捕获指针，保证普通点击仍由按钮处理
    if (!d.captured && Math.abs(e.clientX - d.startX) > 8) {
      d.captured = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    const now = performance.now();
    const dt = now - d.lastT;
    const dx = e.clientX - d.lastX;
    if (dt > 0) {
      d.v = d.v * 0.7 + (-dx / dt) * 0.3;
      d.samples += 1;
    }
    d.lastX = e.clientX;
    d.lastT = now;
    const cellW = e.currentTarget.clientWidth / 7 || 44;
    const daysMoved = Math.round((d.startX - e.clientX) / cellW);
    if (daysMoved !== d.accum) {
      d.accum = daysMoved;
      d.moved = daysMoved !== 0;
      setShift(daysMoved);
    }
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.moved) {
      suppressClickRef.current = true;
      const fling = d.samples >= 2 ? Math.min(2, Math.max(-2, Math.round(d.v * 100))) : 0;
      const total = d.accum + fling;
      if (total !== 0) onSelect(addDays(d.startDate, total));
    } else if (d.captured) {
      // 捕获过指针但未跨格（例如 8–21px 的手抖）：此时 click 可能被重定向到容器，
      // 按最终指针坐标兜底选中对应日期，保证"点了就是选中"。
      suppressClickRef.current = true;
      const rect = e.currentTarget.getBoundingClientRect();
      const index = Math.floor(((e.clientX - rect.left) / rect.width) * days.length);
      onSelect(days[Math.min(days.length - 1, Math.max(0, index))]);
    }
    dragRef.current = null;
    setShift(0);
  };

  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) return; // 纵向滚动不劫持
    const cellW = e.currentTarget.clientWidth / 7 || 44;
    wheelAccumRef.current += e.deltaX;
    const next = Math.min(7, Math.max(-7, Math.round(wheelAccumRef.current / cellW)));
    if (next !== shift) setShift(next);
    clearTimeout(wheelTimerRef.current);
    wheelTimerRef.current = setTimeout(() => {
      const total = Math.min(7, Math.max(-7, Math.round(wheelAccumRef.current / cellW)));
      if (total !== 0) onSelect(addDays(selectedDate, total));
      wheelAccumRef.current = 0;
      setShift(0);
    }, 160);
  };

  return (
    <div className="flex items-center gap-2">
      {/* 「今天」快捷（TaskLabs calendar-header Today 语义） */}
      <button
        type="button"
        onClick={() => onSelect(today)}
        className="shrink-0 border-2 border-ink bg-accent px-3 py-2 text-xs font-extrabold text-white shadow-pixel transition active:translate-y-1"
      >
        今天
      </button>

      {/* 可横向滑动的 7 日条 */}
      <div
        role="group"
        aria-label="日期导航"
        className="grid flex-1 cursor-grab touch-none select-none grid-cols-7 gap-1 border-2 border-ink bg-panel p-1 shadow-pixel active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={onWheel}
      >
        {days.map((d) => {
          const isSelected = isSameDay(d, selected);
          const isToday = isSameDay(d, today);
          return (
            <button
              key={d.toISOString()}
              type="button"
              aria-pressed={isSelected}
              aria-label={`选择 ${d.getMonth() + 1}月${d.getDate()}日`}
              onClick={() => {
                if (suppressClickRef.current) {
                  suppressClickRef.current = false;
                  return;
                }
                onSelect(d);
              }}
              className={cn(
                'flex cursor-pointer flex-col items-center gap-0.5 border-b-2 px-1 pb-1 pt-1.5 text-xs font-bold transition-colors',
                isSelected ? 'border-accent bg-panelLight text-ink' : 'border-transparent text-ink hover:bg-panelLight',
              )}
            >
              <span className={isToday ? 'text-accent' : 'text-inkSoft'}>{weekdayCn(d)}</span>
              <span className={cn('leading-none', isToday ? 'font-extrabold text-accent' : 'text-ink')}>
                {d.getDate()}
              </span>
              {/* 今天：橙色小圆点（轻量强调） */}
              <span className={cn('h-1 w-1 rounded-full', isToday ? 'bg-accent' : 'bg-transparent')} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
