import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Panel } from '../components/ui/card';
import { Empty } from '../components/ui/empty';
import { Skeleton } from '../components/ui/skeleton';
import { ScheduleGrid } from '../components/schedule/schedule-grid';
import { WeekDateNav } from '../components/schedule/week-date-nav';
import { TaskCreateSheet } from '../components/task-create/task-create-sheet';
import { tasksApi } from '../lib/api/tasks';
import {
  addDays,
  dateAtMinute,
  taskAppliesToDay,
  toLocalInputValue,
} from '../lib/schedule';

// 日程页（docs/task-create-and-schedule-review.md §7）
// 日期条（selectedDate，无边界）+ 两日时间轴（selectedDate + nextDate，不写死今天/明天）
// +【新建任务】按钮 + 时间格点击 → 统一 TaskCreateSheet（预填 startAt）
export function SchedulePage() {
  const navigate = useNavigate();
  const tasksQuery = useQuery({ queryKey: ['tasks'], queryFn: () => tasksApi.list() });

  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [createOpen, setCreateOpen] = useState(false);
  const [slotStartAt, setSlotStartAt] = useState<string | undefined>(undefined);
  // 连续日期范围（默认选中日往前 7 天起、共 28 天）；拖到边缘按 EXTEND_DAYS 扩展 → 可无限左右拖
  // 注意：必须在任何 early return **之前**声明，否则 hook 数量在渲染间变化会直接报错
  const EXTEND_DAYS = 14;
  const RANGE_DAYS = 28;
  const [rangeStart, setRangeStart] = useState(() => addDays(new Date(), -7));
  const [rangeDays, setRangeDays] = useState(RANGE_DAYS);

  const today = new Date();

  if (tasksQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (tasksQuery.isError) {
    return (
      <Panel>
        <p className="text-sm font-bold text-danger">
          读取任务失败：{tasksQuery.error instanceof Error ? tasksQuery.error.message : '未知错误'}
        </p>
        <button
          className="mt-3 border-2 border-ink bg-accent px-3 py-1.5 text-sm font-bold text-white shadow-pixel"
          onClick={() => tasksQuery.refetch()}
        >
          重试
        </button>
      </Panel>
    );
  }

  const tasks = tasksQuery.data ?? [];
  // 投影：startAt 落在当天，或周重复（repeatWeekdays）命中当天且 >= startAt 日期
  const byDay = (d: Date) => tasks.filter((t) => taskAppliesToDay(t, d));
  const rangeDates = Array.from({ length: rangeDays }, (_, i) => addDays(rangeStart, i));
  // 未安排 N：startAt = null 且未完成（真实 API 数据计算，不 mock）
  const unScheduled = tasks.filter((t) => !t.startAt && t.status !== 'completed').length;
  const hasPlan = rangeDates.some((d) => byDay(d).length > 0);

  /** 扩展范围：-1 往过去插、1 往未来加（grid 会补偿 scrollLeft，位置不跳） */
  function extendRange(direction: -1 | 1) {
    if (direction === -1) {
      setRangeStart((prev) => addDays(prev, -EXTEND_DAYS));
      setRangeDays((n) => n + EXTEND_DAYS);
    } else {
      setRangeDays((n) => n + EXTEND_DAYS);
    }
  }

  /** 选中日不在当前范围内时，把范围重新围绕它铺开（并保持聚焦） */
  function ensureRangeContains(date: Date) {
    const offset = Math.floor((date.getTime() - rangeStart.getTime()) / 86400000);
    if (offset < 0 || offset >= rangeDays) {
      setRangeStart(addDays(date, -7));
      setRangeDays(Math.max(RANGE_DAYS, rangeDays));
    }
  }

  function openCreate(startAt?: string) {
    setSlotStartAt(startAt);
    setCreateOpen(true);
  }

  return (
    <div className="space-y-4">
      {/* 日期条：7 日导航（唯一 selectedDate；下方 = selectedDate + nextDate） */}
      <WeekDateNav selectedDate={selectedDate} today={today} onSelect={setSelectedDate} />

      {/* 新建任务（accent 像素按钮） */}
      <button
        type="button"
        onClick={() => openCreate()}
        className="pixel-frame pixel-notch relative flex w-full items-center justify-center gap-2 px-3 py-2 text-sm font-extrabold tracking-wider text-white transition active:translate-y-1"
        style={{ background: 'var(--accent)', textShadow: '1px 1px 0 rgba(90,60,20,0.55)' }}
      >
        ＋ 新建任务
      </button>

      <ScheduleGrid
        today={today}
        focusDate={selectedDate}
        days={rangeDates.map((d) => ({ date: d, tasks: byDay(d) }))}
        onSelectTask={(t) => navigate(`/tasks/${t.id}`)}
        onSlotClick={(d, minute) => openCreate(toLocalInputValue(dateAtMinute(d, minute)))}
        onSelectDay={(d) => {
          setSelectedDate(d);
          ensureRangeContains(d);
        }}
        // 拖到边缘 → 扩展日期范围（grid 会补偿滚动位置）→ 可无限左右拖
        onExtendRange={extendRange}
        extendBy={EXTEND_DAYS}
      />

      {!hasPlan && (
        <Panel>
          <Empty
            icon="🗓️"
            title="这段时间暂无安排"
            description="去「今日」创建任务，或点击上方「＋ 新建任务」并设置开始时间"
          />
        </Panel>
      )}

      {/* 未安排时间任务提示（不渲染第二套任务列表） */}
      {unScheduled > 0 && (
        <button
          onClick={() => navigate('/')}
          className="block w-full border-2 border-ink bg-panelLight px-3 py-2.5 text-center text-sm shadow-pixel transition active:translate-y-0.5"
        >
          <span className="font-bold text-accent">今日还有 {unScheduled} 个任务未安排时间</span>
          <span className="text-inkSoft"> · 去「今日」查看 →</span>
        </button>
      )}

      {/* 统一 TaskCreateSheet（时间格点击 → 预填 startAt；dueDate 默认仍为今天） */}
      <TaskCreateSheet
        open={createOpen}
        task={null}
        defaultStartAt={slotStartAt}
        onClose={() => {
          setCreateOpen(false);
          setSlotStartAt(undefined);
        }}
      />
    </div>
  );
}
