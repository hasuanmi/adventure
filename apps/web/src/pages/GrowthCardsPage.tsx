import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { growthCardOf } from '@huahua/shared-types';
import { Panel, PanelHeader } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { attendanceApi } from '../lib/api/attendance';

function monthKey(year: number, month0: number): string {
  return `${year}-${String(month0 + 1).padStart(2, '0')}`;
}

/**
 * 今日成长记录（2026-10-06 由"打卡历史"改版）：
 * 展示已领取的每日成长卡（图片 + 一句话），**不展示签到时间/签退/考勤统计**。
 * 卡片内容由日期确定性派生（shared-types `growthCardOf`），刷新不变。
 */
export function GrowthCardsPage() {
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month0: now.getMonth() });
  const month = monthKey(cursor.year, cursor.month0);

  const historyQuery = useQuery({
    queryKey: ['attendance', 'history', month],
    queryFn: () => attendanceApi.history({ month }),
  });

  const records = useMemo(
    () => [...(historyQuery.data ?? [])].sort((a, b) => a.attendanceDate.localeCompare(b.attendanceDate)),
    [historyQuery.data],
  );

  const shift = (delta: number): void => {
    const next = new Date(cursor.year, cursor.month0 + delta, 1);
    setCursor({ year: next.getFullYear(), month0: next.getMonth() });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-1 text-sm font-bold text-inkSoft hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> 返回今日
        </Link>
        <span className="text-xs font-bold text-inkSoft">每天最多一张 · 完成今日冒险即可领取</span>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <PanelHeader className="!mb-0">
            {cursor.year} 年 {cursor.month0 + 1} 月 · 收集 {records.length} 张
          </PanelHeader>
          <div className="flex gap-1">
            <button
              type="button"
              aria-label="上个月"
              data-cards-prev
              onClick={() => shift(-1)}
              className="grid h-7 w-7 place-items-center border-2 border-ink bg-panel shadow-pixel active:translate-y-0.5"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="下个月"
              data-cards-next
              onClick={() => shift(1)}
              className="grid h-7 w-7 place-items-center border-2 border-ink bg-panel shadow-pixel active:translate-y-0.5"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <Panel>
          {historyQuery.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : records.length === 0 ? (
            <p className="text-xs text-inkSoft">
              这个月还没有成长卡：完成当天全部任务后，在「今日」领取。
            </p>
          ) : (
            <div className="space-y-3">
              {records.map((record) => {
                const card = growthCardOf(record.attendanceDate);
                return (
                  <div
                    key={record.id}
                    data-growth-card-item={record.attendanceDate}
                    className="flex items-center gap-3 border-2 border-ink bg-panelLight p-2"
                  >
                    <img
                      src={`/cards/card-0${card.imageNo}.png`}
                      alt=""
                      className="h-14 w-[100px] shrink-0 border-2 border-ink object-cover [image-rendering:pixelated]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-extrabold text-ink">{card.date}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-inkSoft">{card.copy}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </section>
    </div>
  );
}
