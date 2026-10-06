import { cn } from '../../lib/utils';

export interface ScheduleChipProps {
  /** task = 虚线（时间点 Chip）；event = 实色（P4 预留，当前无数据不渲染） */
  variant: 'task' | 'event';
  title: string;
  timeLabel?: string;
  /** Event 实色底色（P4 预留；缺省用 accent） */
  color?: string;
  /** Task 完成态：半透明 + 删除线 + ✓ */
  completed?: boolean;
  /** 与同一天其它任务时间重叠（展示层标记，不阻止保存） */
  conflicting?: boolean;
  onClick?: () => void;
  className?: string;
}

// 像素版 TaskLabs EventChip 语义（task=虚线、event=实色）
// 视觉 = 旧 Demo 像素：硬 2px 描边 / 硬阴影 / 无圆角 / active 下压
export function ScheduleChip({
  variant,
  title,
  timeLabel,
  color,
  completed,
  conflicting,
  onClick,
  className,
}: ScheduleChipProps) {
  const isTask = variant === 'task';
  // Task 有两种形态（2026-10-06 用户要求）：
  //  · **选了颜色** → 实色底（就是所选颜色）+ 圆角 + 白字，一眼能在日程上认出
  //    （此前只把颜色画成一个小方块/虚线边框，用户反馈"选颜色效果不对"）
  //  · 未选颜色 → 保留虚线中性样式（与 Event 实色仍可区分）
  const colored = isTask && Boolean(color);
  return (
    <button
      type="button"
      onClick={onClick}
      data-variant={variant}
      data-schedule-chip
      data-conflict={conflicting ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-1 overflow-hidden px-1.5 py-0.5 text-left text-[11px] font-bold transition active:translate-y-0.5',
        isTask && !colored && 'border-2 border-dashed border-inkSoft bg-panel text-ink',
        colored && 'rounded-md border-2 border-transparent text-white',
        !isTask && 'rounded-md border-2 border-transparent text-white shadow-pixel',
        // 冲突：红描边 + ⚠（实色块用 ring 更醒目）
        isTask && conflicting && (colored ? 'ring-2 ring-danger' : 'border-solid border-danger bg-danger/10'),
        completed && 'opacity-50',
        className,
      )}
      style={!isTask || colored ? { backgroundColor: color ?? 'var(--accent)' } : undefined}
    >
      {conflicting && <span className="shrink-0 text-[9px] text-danger">⚠</span>}
      {timeLabel && (
        <span className={cn('shrink-0 text-[9px]', isTask && !colored ? 'text-inkSoft' : 'text-white/85')}>
          {timeLabel}
        </span>
      )}
      <span className={cn('truncate', isTask && completed && 'line-through')}>{title}</span>
      {completed && <span className="ml-auto shrink-0 text-[9px]">✓</span>}
    </button>
  );
}
