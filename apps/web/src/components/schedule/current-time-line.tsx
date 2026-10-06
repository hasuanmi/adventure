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
// 形态（2026-10-06 用户两次实测反馈后定型）：
//   · **横线**：横穿今天列的一条 2px 红线，位置即"现在"（top 动态计算）
//   · **胶囊时间标签**：落在**左侧时间刻度栏内**（与时间轴同列，参考 iOS 日历），
//     红底白字、`rounded-full` 胶囊（不是方形），垂直居中对齐横线
//   · now 落在 07:30–21:30 之外时不渲染；纯前端，不改任何后端模型。
// 文档：docs/schedule-two-day-design.md §5.4 已同步。
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
      className={`pointer-events-none absolute inset-x-0 z-30 ${className ?? ''}`}
      style={{ top }}
    >
      {/* 胶囊标签：铺满左侧时间刻度栏（-3.5rem = w-14），与刻度同列 */}
      <span
        data-current-time-label
        className="absolute -left-14 top-0 w-14 -translate-y-1/2 rounded-full bg-danger py-[1px] text-center text-[10px] font-extrabold leading-[14px] text-white"
      >
        {hh}:{mm}
      </span>
      {/* 横线：从时间刻度栏右缘开始贯穿本列 */}
      <span className="absolute inset-x-0 top-0 h-[2px] bg-danger" />
    </div>
  );
}
