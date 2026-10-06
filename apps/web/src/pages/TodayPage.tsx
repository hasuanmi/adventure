import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Swords } from 'lucide-react';
import { TaskDto } from '@huahua/shared-types';
import { Empty } from '../components/ui/empty';
import { Panel, PanelHeader } from '../components/ui/card';
import { AdventureProgress } from '../components/adventure-progress';
import { AttendanceCard } from '../components/attendance-card';
import { Skeleton } from '../components/ui/skeleton';
import { TaskCard } from '../components/task-card';
import { WeekCheckin } from '../components/week-checkin';
import { TaskCreateSheet } from '../components/task-create/task-create-sheet';
import { QuickAddRow } from '../components/task-create/quick-add-row';
import { useUser } from '../hooks/use-user';
import { approvalsApi } from '../lib/api/approvals';
import { familyApi } from '../lib/api/family';
import { tasksApi } from '../lib/api/tasks';
import { TASK_ICON_ADVENTURE_URL } from '../lib/quest-icons';
import { TODAY_TABS, TodayTabKey, todayTasks } from '../lib/today';

// Today（docs/ui-reference.md §4 + docs/p2-ui-ux-review.md §8：
// 今日任务分桶 + 冒险进度条 + 状态筛选 + 待审批提示 + 新建入口）
export function TodayPage() {
  const user = useUser();
  const [createOpen, setCreateOpen] = useState(false);
  const [tab, setTab] = useState<TodayTabKey>('all');

  const tasksQuery = useQuery({ queryKey: ['tasks'], queryFn: () => tasksApi.list() });
  const familyQuery = useQuery({ queryKey: ['family'], queryFn: () => familyApi.me() });
  const pendingApprovalQuery = useQuery({
    queryKey: ['approvals', 'reviewer', 'pending'],
    queryFn: () => approvalsApi.list({ as: 'reviewer', status: 'pending' }),
    enabled: user?.role === 'parent', // 待审批提示：仅审核人侧
  });

  if (tasksQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  // 未加入家庭：先给"创建/加入家庭"引导（P2 实测：不能让它被任务读取报错顶掉）
  const noFamily = familyQuery.data !== undefined && familyQuery.data.familyId === null;
  if (noFamily) {
    return (
      <div className="space-y-4">
        <Panel className="border-warning/70">
          <p className="text-sm font-bold text-ink">🏠 你还没有加入家庭</p>
          <p className="mt-1 text-xs text-inkSoft">
            {user?.role === 'parent'
              ? '创建家庭后，你就是家庭邀请码的持有者，才能给孩子布置任务。'
              : '请向家长要邀请码（家长用户名），加入后才能看到任务。'}
          </p>
          <Link
            to="/family"
            className="mt-2 inline-block border-2 border-ink bg-accent px-3 py-1.5 text-sm font-bold text-white shadow-pixel"
          >
            {user?.role === 'parent' ? '创建家庭（1 步）' : '加入家庭'}
          </Link>
        </Panel>
        <Panel>
          <p className="text-xs text-inkSoft">
            加入家庭后这里会显示今日任务与进度。现在也可以先去
            <Link to="/schedule" className="mx-1 font-bold text-accent underline">
              日程
            </Link>
            看看。
          </p>
        </Panel>
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
          onClick={() => void tasksQuery.refetch()}
        >
          重试
        </button>
      </Panel>
    );
  }

  const all = tasksQuery.data ?? [];
  // 只统计"今日"范围（含未安排与逾期未完成），避免把历史任务算进今日进度
  const scoped = todayTasks(all);
  const completedCount = scoped.filter((t) => t.status === 'completed').length;
  const percent = scoped.length > 0 ? Math.round((completedCount / scoped.length) * 100) : 0;
  const visible = tab === 'all' ? scoped : scoped.filter((t) => t.status === tab);
  const pendingCount = pendingApprovalQuery.data?.length ?? 0;

  return (
    <div className="space-y-4">
      {/* 今日冒险（PixelBar 进度） */}
      <Panel className="border-2 border-ink bg-ink text-panelLight">
        <PanelHeader className="flex items-center gap-2 !text-panelLight">
          <img
            src={TASK_ICON_ADVENTURE_URL}
            alt=""
            aria-hidden
            className="h-6 w-6 [image-rendering:pixelated]"
          />
          今日冒险
        </PanelHeader>
        <p className="mb-2 text-sm">
          已完成 {completedCount}/{scoped.length} 个任务 · 进度 {percent}%
        </p>
        {/* 冒险进度条：多层像素边框 + 跟随百分比的进度标记 + 变化时的轻量动画
            （统计逻辑不变；ready 用于避免首次加载误播"完成"动画） */}
        <AdventureProgress percent={percent} ready={tasksQuery.isSuccess} />
        <p className="mt-2 flex items-center gap-1.5 text-xs text-panelLight/80">
          {scoped.length > 0 && percent >= 100 ? (
            <>
              <img
                src="/icons/chest.png"
                alt=""
                aria-hidden
                className="h-4 w-4 [image-rendering:pixelated]"
              />
              <span data-adventure-done className="font-extrabold text-panelLight">
                今日冒险完成！
              </span>
            </>
          ) : (
            '继续加油，小冒险家！'
          )}
        </p>
      </Panel>

      {/* 待审批提示（真实 API；仅审核人可见）→ 进入审批页处理 */}
      {pendingCount > 0 && (
        <Link to="/approvals" className="block">
          <Panel className="border-warning/70 transition hover:bg-panelLight active:translate-y-0.5">
            <p className="flex items-center gap-2 text-sm font-bold text-ink">
              <Swords className="h-4 w-4 text-warning" />
              有 {pendingCount} 个任务待你确认
            </p>
            <p className="mt-1 text-xs text-inkSoft">点击进入「完成确认」，通过或驳回孩子的提交 →</p>
          </Panel>
        </Link>
      )}

      {/* 新建任务（顶部入口 → 统一 TaskCreateSheet） */}
      <button
        type="button"
        onClick={() => setCreateOpen(true)}
        className="flex w-full items-center justify-center gap-2 border-2 border-ink bg-accent px-3 py-2.5 text-sm font-extrabold text-white shadow-pixel transition active:translate-y-1"
      >
        ＋ 新建任务
      </button>

      {/* 今日任务 */}
      <section>
        <PanelHeader className="!mb-2">今日任务</PanelHeader>

        <div className="mb-3 flex gap-1 overflow-x-auto">
          {TODAY_TABS.map((item) => {
            const count = item.key === 'all' ? scoped.length : scoped.filter((t) => t.status === item.key).length;
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`shrink-0 border-2 border-ink px-2.5 py-1 text-xs font-bold shadow-pixel transition active:translate-y-0.5 ${
                  active ? 'bg-accent text-white' : 'bg-panel text-ink'
                }`}
              >
                {item.label}
                {count > 0 ? ` ${count}` : ''}
              </button>
            );
          })}
        </div>

        {visible.length === 0 ? (
          <Panel>
            <Empty
              icon={tab === 'all' ? '⚔️' : '🗂️'}
              title={tab === 'all' ? '今日暂无任务' : '这个状态下没有任务'}
              description={
                tab === 'all'
                  ? scoped.length === 0 && all.length > 0
                    ? '今天就到这里，去日程看看明天的安排'
                    : '点击上方「新建任务」创建你的第一个任务吧'
                  : '切换到「全部」看看其它任务'
              }
            />
          </Panel>
        ) : (
          <div className="space-y-3">
            {visible.map((task: TaskDto) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        )}

        <div className="mt-3">
          <QuickAddRow onClick={() => setCreateOpen(true)} />
        </div>
      </section>

      {/* 打卡（P4）：**仅当今日任务 100% 完成后出现**（用户规则）；
          语义与下面「本周打卡」（任务完成周格）不同：这里=每日签到 */}
      <AttendanceCard allDone={scoped.length > 0 && percent >= 100} />

      {/* 本周打卡（像素格）：孩子的"我"视角才有意义（数据是本人流水） */}
      {user?.role === 'child' && <WeekCheckin />}

      {/* 统一 TaskCreateSheet */}
      <TaskCreateSheet open={createOpen} task={null} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
