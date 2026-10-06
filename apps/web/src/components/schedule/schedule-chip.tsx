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
  onClick,
  className,
}: ScheduleChipProps) {
  const isTask = variant === 'task';
  return (
    <button
      type="button"
      onClick={onClick}
      data-variant={variant}
      data-schedule-chip
      className={cn(
        'flex w-full items-center gap-1 overflow-hidden px-1.5 py-0.5 text-left text-[11px] font-bold transition active:translate-y-0.5',
        isTask
          ? 'border-2 border-dashed border-inkSoft bg-panel text-ink'
          : 'border-2 border-transparent text-white shadow-pixel',
        completed && 'opacity-50',
        className,
      )}
      style={isTask ? undefined : { backgroundColor: color ?? 'var(--accent)' }}
    >
      {isTask && color && (
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 border border-ink/50"
          style={{ backgroundColor: color }}
        />
      )}
      {timeLabel && (
        <span className={cn('shrink-0 text-[9px]', isTask ? 'text-inkSoft' : 'text-white/80')}>
          {timeLabel}
        </span>
      )}
      <span className={cn('truncate', isTask && completed && 'line-through')}>{title}</span>
      {completed && <span className="ml-auto shrink-0 text-[9px]">✓</span>}
    </button>
  );
}
