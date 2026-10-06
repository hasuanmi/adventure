import { useEffect, useState } from 'react';
import { SCHEDULE_END_MIN, SCHEDULE_START_MIN, minuteOfDay, topForMinute } from '../../lib/schedule';

export interface CurrentTimeLineProps {
  /** 是否显示（仅真实今天列 true；明天列传 false） */
  enabled: boolean;
  /** 刷新间隔 ms（默认 60000 = 每分钟） */
  intervalMs?: number;
  className?: string;
}

// 当前时间线 —— 我们自己的产品增强（TaskLabs Calendar 无此能力，勿描述为其已有功能）
//
// 形态（2026-10-06 用户实测反馈后**由竖线改为横线**）：
//   · 横穿该列的一条 2px 红线，位置 = 当前时间（top 动态计算）
//   · 左端一枚像素小方块作为"现在"标记，右端一小枚时间标签（HH:mm）
//   · now 落在 07:30–21:30 之外时不渲染；纯前端，不改任何后端模型。
// 文档：docs/schedule-two-day-design.md §5.4 已同步更新。
export function CurrentTimeLine({ enabled, intervalMs = 60_000, className }: CurrentTimeLineProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  if (!enabled || now === null) return null;

  const minute = minuteOfDay(now);
  if (minute < SCHEDULE_START_MIN || minute > SCHEDULE_END_MIN) return null;

  const top = topForMinute(minute);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');

  return (
    <div
      aria-hidden
      data-current-time-line
      className={`pointer-events-none absolute inset-x-1 z-30 ${className ?? ''}`}
      style={{ top }}
    >
      {/* 横线（位置即"现在"） */}
      <div className="h-[2px] w-full bg-danger" />
      {/* 左端像素方块标记 */}
      <div className="absolute -left-[3px] -top-[3px] h-[8px] w-[6px] bg-danger" />
      {/* 右端时间标签 */}
      <span className="absolute right-0 -top-[15px] border border-danger bg-panel px-1 text-[10px] font-bold leading-[13px] text-danger">
        {hh}:{mm}
      </span>
    </div>
  );
}
