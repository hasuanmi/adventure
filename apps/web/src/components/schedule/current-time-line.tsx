import { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import {
  SCHEDULE_END_MIN,
  SCHEDULE_START_MIN,
  SCHEDULE_TOTAL_PX,
  minuteOfDay,
  topForMinute,
} from '../../lib/schedule';

export interface CurrentTimeLineProps {
  /** 是否显示（仅今天列 true；明天列传 false） */
  enabled: boolean;
  /** 刷新间隔 ms（默认 60000 = 每分钟） */
  intervalMs?: number;
  className?: string;
}

// 当前时间竖线 —— 我们自己的产品增强（TaskLabs Calendar 无此能力，勿描述为其已有功能）
// 规则：橙/红 2px 竖线，仅今天列；top 随当前时间动态计算；
//      当前时间超出 07:30–21:30 区间时不显示；纯前端，不改任何后端模型。
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
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-x-1 z-30', className)}
      style={{ top, height: SCHEDULE_TOTAL_PX - top }}
    >
      <div className="h-full w-[2px] bg-danger" />
      {/* 顶部像素小方块作为"现在"标记 */}
      <div className="absolute -top-[1px] left-[-1px] h-[7px] w-[4px] bg-danger" />
    </div>
  );
}
