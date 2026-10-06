import { useQuery } from '@tanstack/react-query';
import { MASTERY_LABELS } from '@huahua/shared-types';
import { Panel } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { WrongQuestionNav } from '../components/wrong-question-nav';
import { wrongQuestionsApi } from '../lib/api/wrong-questions';
import { subjectMeta } from '../lib/constants';

/** 像素风横条（不引入图表库，保持项目视觉一致） */
function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 truncate text-[11px] font-bold text-inkSoft">{label}</span>
      <span className="h-3 flex-1 border-2 border-ink bg-panelLight">
        <span className="block h-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </span>
      <span className="w-8 shrink-0 text-right text-[11px] font-bold text-ink">{value}</span>
    </div>
  );
}

/** 统计中心（对照上游 stats/page.tsx：总量 / 学科分布 / 掌握度 / 试卷 / 复习结果 / 近 30 天） */
export function WrongQuestionStatsPage() {
  const stats = useQuery({ queryKey: ['wrong-question-stats'], queryFn: () => wrongQuestionsApi.stats() });
  if (stats.isLoading) return <Skeleton className="h-60 w-full" />;
  if (!stats.data) return <Panel>统计加载失败</Panel>;

  const s = stats.data;
  const subjectMax = Math.max(1, ...s.bySubject.map((x) => x.count));
  const masteryMax = Math.max(1, ...s.byMastery.map((x) => x.count));
  const dayMax = Math.max(1, ...s.last30Days.map((x) => x.count));
  const reviews = s.reviewCorrect + s.reviewWrong + s.reviewPending;

  return (
    <div className="space-y-3">
      <WrongQuestionNav />

      <Panel>
        <p className="text-sm font-extrabold text-ink">统计中心</p>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div className="border-2 border-ink bg-panelLight py-2">
            <p className="text-lg font-extrabold text-ink" data-stat-total>
              {s.total}
            </p>
            <p className="text-[11px] text-inkSoft">错题总数</p>
          </div>
          <div className="border-2 border-ink bg-panelLight py-2">
            <p className="text-lg font-extrabold text-ink" data-stat-reviews>
              {reviews}
            </p>
            <p className="text-[11px] text-inkSoft">复习次数</p>
          </div>
          <div className="border-2 border-ink bg-panelLight py-2">
            <p className="text-lg font-extrabold text-ok" data-stat-correct>
              {s.reviewCorrect}
            </p>
            <p className="text-[11px] text-inkSoft">复习「会了」</p>
          </div>
        </div>
      </Panel>

      <Panel className="space-y-1.5">
        <p className="text-xs font-extrabold text-ink">学科分布</p>
        {s.bySubject.length === 0 && <p className="text-[11px] text-inkSoft">还没有错题</p>}
        {s.bySubject.map((row) => (
          <BarRow
            key={row.subject}
            label={subjectMeta(row.subject).label}
            value={row.count}
            max={subjectMax}
            color="var(--accent)"
          />
        ))}
      </Panel>

      <Panel className="space-y-1.5">
        <p className="text-xs font-extrabold text-ink">掌握度分布</p>
        {[0, 1, 2].map((level) => {
          const count = s.byMastery.find((x) => x.masteryLevel === level)?.count ?? 0;
          return (
            <BarRow
              key={level}
              label={MASTERY_LABELS[level as 0 | 1 | 2]}
              value={count}
              max={masteryMax}
              color={level === 2 ? 'var(--ok)' : level === 1 ? 'var(--warning)' : 'var(--accent)'}
            />
          );
        })}
      </Panel>

      <Panel>
        <p className="text-xs font-extrabold text-ink">近 30 天录入</p>
        <div className="mt-2 flex h-16 items-end gap-[2px]" data-stat-trend>
          {s.last30Days.map((day) => (
            <span
              key={day.date}
              title={`${day.date}：${day.count}`}
              className="flex-1 border-b-2 border-ink/30 bg-accent"
              style={{ height: `${Math.max(2, Math.round((day.count / dayMax) * 100))}%` }}
            />
          ))}
        </div>
        <p className="mt-1 text-[11px] text-inkSoft">最高一天 {dayMax} 题</p>
      </Panel>

      <Panel className="space-y-1.5">
        <p className="text-xs font-extrabold text-ink">复习结果</p>
        <BarRow label="会了" value={s.reviewCorrect} max={Math.max(1, reviews)} color="var(--ok)" />
        <BarRow label="还没会" value={s.reviewWrong} max={Math.max(1, reviews)} color="var(--danger)" />
        <BarRow label="未判定" value={s.reviewPending} max={Math.max(1, reviews)} color="var(--ink-soft)" />
      </Panel>
    </div>
  );
}
