import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Swords } from 'lucide-react';
import { TaskDto } from '@huahua/shared-types';
import { Empty } from '../components/ui/empty';
import { Skeleton } from '../components/ui/skeleton';
import { TaskCard } from '../components/task-card';
import { WeekCheckin } from '../components/week-checkin';
import { GrowthCardEntry } from '../components/growth-card-entry';
import { TaskCreateSheet } from '../components/task-create/task-create-sheet';
import { QuickAddRow } from '../components/task-create/quick-add-row';
import { BitCard } from '../components/ui-preview/bit-card';
import { BitButton } from '../components/ui-preview/bit-button';
import { BitProgress } from '../components/ui-preview/bit-progress';
import { PixelStar } from '../components/ui-preview/pixel-star';
import { useUser } from '../hooks/use-user';
import { approvalsApi } from '../lib/api/approvals';
import { familyApi } from '../lib/api/family';
import { tasksApi } from '../lib/api/tasks';
import { TASK_ICON_ADVENTURE_URL } from '../lib/quest-icons';
import { TODAY_TABS, TodayTabKey, todayTasks } from '../lib/today';

/**
 * 首页「新版」—— 8bitcn 技法版（**用于与现状 TodayPage 对比；TodayPage 一行未改**）
 *
 * 与 `TodayPage.tsx` 的关系：**业务逻辑完全一致**（同样的查询 / 分桶 / 三态守卫 / 创建 Sheet），
 * 只把表现层换成 ui-preview 的三项技法：
 *   ① BitCard   缺角像素框   → 今日冒险 / 今日任务 / 待审批
 *   ② BitProgress 分段进度   → 今日冒险进度（**每格 = 一个任务**）
 *   ③ BitButton 缺角描边     → 新建任务 / Tab 筛选片
 *
 * ⚠️ 这是对比用页面，不是正式首页。确认采纳后再决定怎么合并回 `TodayPage.tsx`。
 */
export function TodayBitPage() {
  const user = useUser();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [tab, setTab] = useState<TodayTabKey>('all');

  const tasksQuery = useQuery({ queryKey: ['tasks'], queryFn: () => tasksApi.list() });
  const familyQuery = useQuery({ queryKey: ['family'], queryFn: () => familyApi.me() });
  const pendingApprovalQuery = useQuery({
    queryKey: ['approvals', 'reviewer', 'pending'],
    queryFn: () => approvalsApi.list({ as: 'reviewer', status: 'pending' }),
    enabled: user?.role === 'parent',
  });

  if (tasksQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const noFamily = familyQuery.data !== undefined && familyQuery.data.familyId === null;
  if (noFamily) {
    return (
      <div className="space-y-4">
        <BitCard frameTone="warning" title="🏠 你还没有加入家庭">
          <p className="text-xs leading-relaxed text-inkSoft">
            {user?.role === 'parent'
              ? '创建家庭后，你就是家庭邀请码的持有者，才能给孩子布置任务。'
              : '请向家长要邀请码（家长用户名），加入后才能看到任务。'}
          </p>
          <div className="mt-2">
            <BitButton
              variant="accent"
              size="sm"
              className="!m-0"
              onClick={() => navigate('/family')}
            >
              {user?.role === 'parent' ? '创建家庭（1 步）' : '加入家庭'}
            </BitButton>
          </div>
        </BitCard>
        <BitCard>
          <p className="text-xs leading-relaxed text-inkSoft">
            加入家庭后这里会显示今日任务与进度。现在也可以先去
            <Link to="/schedule" className="mx-1 font-bold text-accent underline">
              日程
            </Link>
            看看。
          </p>
        </BitCard>
      </div>
    );
  }

  if (tasksQuery.isError) {
    return (
      <BitCard frameTone="danger" title="读取失败">
        <p className="text-sm font-bold text-danger">
          读取任务失败：{tasksQuery.error instanceof Error ? tasksQuery.error.message : '未知错误'}
        </p>
        <div className="mt-2">
          <BitButton variant="accent" size="sm" className="!m-0" onClick={() => void tasksQuery.refetch()}>
            重试
          </BitButton>
        </div>
      </BitCard>
    );
  }

  const all = tasksQuery.data ?? [];
  const scoped = todayTasks(all);
  const completedCount = scoped.filter((t) => t.status === 'completed').length;
  const percent = scoped.length > 0 ? Math.round((completedCount / scoped.length) * 100) : 0;
  const visible = tab === 'all' ? scoped : scoped.filter((t) => t.status === tab);
  const pendingCount = pendingApprovalQuery.data?.length ?? 0;
  // 技法②的关键用法：**一格 = 一个任务**（比连续百分比更贴合「3/5 个任务」的语义）
  const adventureSegments = Math.min(Math.max(scoped.length, 1), 20);
  const allDone = scoped.length > 0 && percent >= 100;

  return (
    <div className="space-y-5">
      {/* ① 今日冒险 —— 深色卡 + 橙色缺角框 */}
      <BitCard
        data-adventure-panel
        frame={6}
        frameTone="accent"
        tone="ink"
        title="今日冒险"
        icon={
          <img src={TASK_ICON_ADVENTURE_URL} alt="" aria-hidden className="h-6 w-6 [image-rendering:pixelated]" />
        }
      >
        <p className="mb-2 text-sm text-panelLight">
          已完成 {completedCount}/{scoped.length} 个任务 · 进度 {percent}%
        </p>
        <BitProgress
          value={percent}
          segments={adventureSegments}
          tone="ok"
          label="今日冒险进度"
          barClassName="h-5"
          marker={<PixelStar size={20} className="text-accent drop-shadow-[1px_1px_0_#3a2a1e]" />}
        />
        <p className="mt-2 flex items-center gap-1.5 text-xs text-panelLight/80">
          {allDone ? (
            <>
              <img src="/icons/chest.png" alt="" aria-hidden className="h-4 w-4 [image-rendering:pixelated]" />
              <span data-adventure-done className="font-extrabold text-panelLight">
                今日冒险完成！
              </span>
            </>
          ) : (
            '继续加油，小冒险家！'
          )}
        </p>
        {/* 成长卡入口：沿用现有业务组件（本身已是像素票券样式，与深色卡兼容） */}
        <GrowthCardEntry allDone={allDone} />
      </BitCard>

      {/* 待审批（真实 API；仅审核人可见）—— 警示色缺角框 */}
      {pendingCount > 0 && (
        <Link to="/approvals" className="block">
          <BitCard frameTone="warning" className="transition hover:bg-panelLight">
            <p className="flex items-center gap-2 text-sm font-bold text-ink">
              <Swords className="h-4 w-4 text-warning" />
              有 {pendingCount} 个任务待你确认
            </p>
            <p className="mt-1 text-xs text-inkSoft">点击进入「完成确认」，通过或驳回孩子的提交 →</p>
          </BitCard>
        </Link>
      )}

      {/* ③ 新建任务 —— 整宽缺角按钮 */}
      <BitButton
        variant="accent"
        size="block"
        data-create-task
        onClick={() => setCreateOpen(true)}
      >
        ＋ 新建任务
      </BitButton>

      {/* ① + ③ 今日任务：缺角框「任务面板」+ 缺角 Tab 片 */}
      <BitCard frame={6} frameTone="ink" title="今日任务">
        <div data-today-tabs className="-mx-1 -my-1 mb-1 flex overflow-x-auto">
          {TODAY_TABS.map((item) => {
            const count = item.key === 'all' ? scoped.length : scoped.filter((t) => t.status === item.key).length;
            const active = tab === item.key;
            return (
              <BitButton
                key={item.key}
                type="button"
                size="chip"
                variant={active ? 'accent' : 'ghost'}
                onClick={() => setTab(item.key)}
              >
                {item.label}
                {count > 0 ? ` ${count}` : ''}
              </BitButton>
            );
          })}
        </div>

        {visible.length === 0 ? (
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
      </BitCard>

      {/* 本周打卡：沿用现有业务组件（还没轮到它改） */}
      {user?.role === 'child' && <WeekCheckin />}

      <TaskCreateSheet open={createOpen} task={null} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
