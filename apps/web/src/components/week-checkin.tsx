import { useQuery } from '@tanstack/react-query';
import { Panel } from './ui/card';
import { growthApi } from '../lib/api/growth';
import { isSameDay, mondayOf, toDateInputValue, weekDays7, weekdayCn } from '../lib/schedule';
import { cn } from '../lib/utils';

// 本周打卡（像素格）—— 视觉对齐旧项目 Demo proto-kid-v2：
//   · 「本周打卡」为主标题；周一…周日标签在**格子上方**；格子里：✓ 已打卡（绿）/ ★ 今天（琥珀）/ · 未打卡
//   · 像素描边 + 硬阴影；今天额外一圈 accent 描边
// 数据来源：GET /growth/grants 的 grantedAt（**展示层派生，不新增模型**）：
//   某天有任意一次奖励发放 = 当天有任务完成定稿 → 该天点亮。
// 说明：P4「打卡」模块尚未开始，这里不做假数据，只用真实发放流水投影。
export function WeekCheckin({ className }: { className?: string }) {
  const grantsQuery = useQuery({ queryKey: ['growth', 'grants'], queryFn: () => growthApi.grants() });
  const today = new Date();
  const days = weekDays7(mondayOf(today));
  const hitDays = new Set((grantsQuery.data ?? []).map((g) => toDateInputValue(new Date(g.grantedAt))));
  const hitCount = days.filter((d) => hitDays.has(toDateInputValue(d))).length;

  return (
    <Panel className={className}>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-base font-extrabold text-ink">本周打卡</h2>
        <span className="text-xs font-bold text-inkSoft">
          {grantsQuery.isLoading ? '统计中…' : `已点亮 ${hitCount}/7 天`}
        </span>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const key = toDateInputValue(d);
          const hit = hitDays.has(key);
          const isToday = isSameDay(d, today);
          const future = d.getTime() > today.getTime();
          return (
            <div key={key} className="flex flex-col items-center gap-1">
              <span className={cn('text-xs font-bold', isToday ? 'text-accent' : 'text-inkSoft')}>
                周{weekdayCn(d)}
              </span>
              <div
                title={key}
                data-checkin-cell
                data-checkin-state={hit ? 'done' : isToday ? 'today' : 'none'}
                className={cn(
                  'grid h-10 w-full place-items-center border-2 border-ink text-lg font-extrabold shadow-pixel',
                  hit ? 'bg-ok text-white' : isToday ? 'bg-warning text-white' : 'bg-panelLight text-inkSoft',
                  isToday && 'ring-2 ring-accent',
                  future && !hit && !isToday && 'opacity-45',
                )}
              >
                {hit ? '✓' : isToday ? '★' : '·'}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-inkSoft">当天完成任意任务即点亮（数据来自奖励发放记录）</p>
    </Panel>
  );
}
