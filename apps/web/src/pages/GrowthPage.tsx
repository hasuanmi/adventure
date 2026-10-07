import { useQuery } from '@tanstack/react-query';
import {
  DIMENSION_LABELS,
  SIX_DIMENSIONS,
  dimensionProgressFromPoints,
  levelProgressFromXp,
} from '@huahua/shared-types';
import { Panel, PanelHeader } from '../components/ui/card';
import { PixelBar } from '../components/ui/pixel-bar';
import { Link } from 'react-router-dom';
import { Skeleton } from '../components/ui/skeleton';
import { Empty } from '../components/ui/empty';
import { WeekCheckin } from '../components/week-checkin';
import { growthApi } from '../lib/api/growth';

// 成长页（docs/opensource-mapping.md §二点七 第 9/11 项：无开源参考 → 自研）
// 入口：表头左上角「小女孩头像 + 等级经验栏」（用户决策：不占底部导航）
// 数据：GET /growth/me（等级由 xp 派生）+ GET /growth/grants（流水）
export function GrowthPage() {
  const meQuery = useQuery({ queryKey: ['growth', 'me'], queryFn: () => growthApi.me() });
  const grantsQuery = useQuery({ queryKey: ['growth', 'grants'], queryFn: () => growthApi.grants() });

  if (meQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (meQuery.isError) {
    return (
      <Panel>
        <p className="text-sm font-bold text-danger">
          读取成长数据失败：{meQuery.error instanceof Error ? meQuery.error.message : '未知错误'}
        </p>
        <button
          className="mt-3 border-2 border-ink bg-accent px-3 py-1.5 text-sm font-bold text-white shadow-pixel"
          onClick={() => void meQuery.refetch()}
        >
          重试
        </button>
      </Panel>
    );
  }

  const me = meQuery.data!;
  const xpProgress = levelProgressFromXp(me.xp);
  const grants = grantsQuery.data ?? [];

  return (
    <div className="space-y-4">
      {/* 等级卡（与表头同一套等级 UI：徽章 + 条内文字 "cur / need XP"） */}
      <Panel className="border-2 border-ink bg-ink text-panelLight">
        <div className="flex items-center gap-3">
          <img
            src="/ui/avatar-hero.png"
            alt="我的头像"
            className="h-16 w-16 shrink-0 rounded-md border-2 border-ink/60 bg-panelLight object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-extrabold tracking-widest">
              我的等级
              <span className="ml-2 text-xs font-bold text-panelLight/80">
                累计 {me.xp} XP
              </span>
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              {/* 与表头同一套结构：等级小方框与 XP 条**并列、各自独立**，外面不套大框 */}
              <span
                data-level-badge
                className="grid h-8 w-8 shrink-0 place-items-center border-2 border-ink bg-accent text-base font-extrabold text-white"
                style={{ boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.2)' }}
              >
                {xpProgress.level}
              </span>
              <span
                data-xp-bar
                className="relative h-8 min-w-0 flex-1 overflow-hidden border-2 border-ink bg-panel"
              >
                <span
                  data-xp-fill
                  aria-hidden
                  className="absolute inset-y-0 left-0 bg-xp transition-all"
                  style={{
                    width: `${Math.round(xpProgress.ratio * 100)}%`,
                    boxShadow: 'inset 0 2px 0 var(--xp-light), inset 0 -2px 0 var(--xp-dark)',
                  }}
                />
                {/* 文字绝对定位叠加居中，无独立底色块 */}
                <span
                  data-xp-label
                  className="pointer-events-none absolute inset-0 grid place-items-center text-xs font-extrabold leading-none text-white sm:text-sm"
                  style={{
                    textShadow:
                      '1px 1px 0 #1a2438, -1px 1px 0 #1a2438, 1px -1px 0 #1a2438, -1px -1px 0 #1a2438',
                  }}
                >
                  {xpProgress.current} / {xpProgress.needed} XP
                </span>
              </span>
            </div>
          </div>
          <div className="shrink-0 px-2 py-1.5 text-center">
            <img
              src="/ui/coin.png"
              alt=""
              aria-hidden
              className="mx-auto mb-0.5 h-6 w-6 object-contain [image-rendering:pixelated]"
            />
            <p className="text-[10px] text-panelLight/75">金币</p>
            <p className="text-base font-extrabold">{me.coins}</p>
          </div>
        </div>
      </Panel>

      {/* 六维 */}
      <Panel>
        <PanelHeader>六维成长</PanelHeader>
        <div className="space-y-2.5">
          {SIX_DIMENSIONS.map((dim) => {
            const points = me[dim];
            const p = dimensionProgressFromPoints(points);
            return (
              <div key={dim}>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-bold text-ink">
                    {DIMENSION_LABELS[dim]}
                    <span className="ml-1.5 text-inkSoft">Lv.{p.level}</span>
                  </span>
                  <span className="text-inkSoft">
                    {points} 点 · 距下一级 {Math.max(0, p.needed - p.current)}
                  </span>
                </div>
                <PixelBar barColor="var(--accent)" percent={Math.round(p.ratio * 100)} className="mt-1" />
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-inkSoft">
          完成任务的奖励按任务性质发放到六维（数值唯一来源为奖励档配置）。
        </p>
      </Panel>

      {/* 本周打卡（与今日页同一组件/同一数据源） */}
<WeekCheckin />
      {/* 查看成长记录：放在「本周打卡」下方（用户要求：只加在这个位置） */}
      <Link
        to="/growth-cards"
        className="mt-2 inline-block text-xs font-bold text-inkSoft underline"
      >
        查看成长记录 →
      </Link>

      {/* 奖励流水 */}
      <Panel>
        <PanelHeader>奖励记录</PanelHeader>
        {grantsQuery.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : grants.length === 0 ? (
          <Empty icon="🎁" title="还没有奖励记录" description="完成并通过确认的任务会在这里留下记录" />
        ) : (
          <ul className="divide-y-2 divide-ink/15">
            {grants.slice(0, 20).map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-2 py-2 text-xs">
                <span className="text-inkSoft">
                  {new Date(g.grantedAt).toLocaleString('zh-CN', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span className="flex flex-wrap items-center justify-end gap-1.5 font-bold text-ink">
                  <span className="border-2 border-ink/30 bg-panelLight px-1.5 py-0.5">+{g.xp} XP</span>
                  <span className="border-2 border-ink/30 bg-panelLight px-1.5 py-0.5">+{g.coins} 金币</span>
                  {g.taskId && <span className="text-inkSoft">任务奖励</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
