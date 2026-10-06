import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { Panel, PanelHeader } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { attendanceApi } from '../lib/api/attendance';
import { formatHM } from '../lib/schedule';

const WEEK_CN = ['一', '二', '三', '四', '五', '六', '日'];
const STATE_LABEL: Record<string, string> = {
  NOT_CHECKED_IN: '今日未打卡',
  CHECKED_IN: '已打卡（未签退）',
  CHECKED_OUT: '今日已签退',
};

function monthKey(year: number, month0: number): string {
  return `${year}-${String(month0 + 1).padStart(2, '0')}`;
}

// 打卡（P4）：今日状态 + 月度历史点阵（迁移自 WorkPulse today/history 的两个查询口径）
export function AttendancePage() {
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month0: now.getMonth() });
  const month = monthKey(cursor.year, cursor.month0);

  const todayQuery = useQuery({ queryKey: ['attendance', 'today'], queryFn: () => attendanceApi.today() });
  const historyQuery = useQuery({
    queryKey: ['attendance', 'history', month],
    queryFn: () => attendanceApi.history({ month }),
  });

  const days = useMemo(() => {
    const first = new Date(cursor.year, cursor.month0, 1);
    const daysInMonth = new Date(cursor.year, cursor.month0 + 1, 0).getDate();
    // 周一为一周起点（与本周打卡视觉一致）
    const lead = (first.getDay() + 6) % 7;
    const cells: (number | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
    return cells;
  }, [cursor]);

  const byDate = new Map((historyQuery.data ?? []).map((r) => [r.attendanceDate, r]));
  const todayStr = todayQuery.data?.date ?? '';
  const thisMonth = month === todayStr.slice(0, 7);
  const count = historyQuery.data?.length ?? 0;
  const todayRecord = todayQuery.data?.record ?? null;

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
        <span className="text-xs font-bold text-inkSoft">打卡 = 每日签到（与任务完成周格无关）</span>
      </div>

      {/* 今日状态 */}
      <Panel className="border-2 border-ink bg-ink text-panelLight">
        <PanelHeader className="flex items-center gap-2 !text-panelLight">
          <img src="/icons/daily.png" alt="" aria-hidden className="h-6 w-6 [image-rendering:pixelated]" />
          今日打卡
        </PanelHeader>
        <p className="text-sm" data-today-state={todayQuery.data?.state ?? ''}>
          {STATE_LABEL[todayQuery.data?.state ?? ''] ?? '读取中…'}
          {todayRecord?.checkOutAt
            ? ` · 时长 ${todayRecord.totalMinutes ?? 0} 分钟`
            : todayRecord
              ? ` · ${formatHM(new Date(todayRecord.checkInAt))} 起`
              : ''}
        </p>
        <p className="mt-2 text-xs text-panelLight/75">
          {todayQuery.data?.state === 'NOT_CHECKED_IN'
            ? '今日任务全部完成后，「今日」页会出现打卡按钮。'
            : `打卡日期（家庭时区）：${todayQuery.data?.date ?? ''}`}
        </p>
      </Panel>

      {/* 月度历史点阵 */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <PanelHeader className="!mb-0">
            {cursor.year} 年 {cursor.month0 + 1} 月 · 共 {count} 天
          </PanelHeader>
          <div className="flex gap-1">
            <button
              type="button"
              aria-label="上个月"
              data-attendance-prev
              onClick={() => shift(-1)}
              className="grid h-7 w-7 place-items-center border-2 border-ink bg-panel shadow-pixel active:translate-y-0.5"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="下个月"
              data-attendance-next
              onClick={() => shift(1)}
              className="grid h-7 w-7 place-items-center border-2 border-ink bg-panel shadow-pixel active:translate-y-0.5"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <Panel>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-inkSoft">
            {WEEK_CN.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          {historyQuery.isLoading ? (
            <Skeleton className="mt-2 h-32 w-full" />
          ) : (
            <div className="mt-1 grid grid-cols-7 gap-1">
              {days.map((day, index) => {
                if (day === null) return <span key={`pad-${index}`} />;
                const key = `${month}-${String(day).padStart(2, '0')}`;
                const record = byDate.get(key);
                const isToday = key === todayStr;
                return (
                  <span
                    key={key}
                    data-attendance-day={key}
                    data-attendance-hit={record ? 'true' : undefined}
                    title={record ? `${key} 已打卡${record.totalMinutes !== null ? ` · ${record.totalMinutes} 分钟` : ''}` : key}
                    className={`grid h-8 place-items-center border-2 text-xs font-bold ${
                      record
                        ? 'border-ink bg-ok text-white'
                        : isToday
                          ? 'border-accent bg-panelLight text-ink'
                          : 'border-ink/25 bg-panelLight text-inkSoft/70'
                    }`}
                  >
                    {record ? '✓' : day}
                  </span>
                );
              })}
            </div>
          )}
          <p className="mt-2 text-xs text-inkSoft">
            {thisMonth && count === 0
              ? '本月还没有打卡记录：完成今日任务后即可打卡。'
              : `绿色 ✓ = 当天已打卡；本月共打卡 ${count} 天。`}
          </p>
        </Panel>
      </section>
    </div>
  );
}
