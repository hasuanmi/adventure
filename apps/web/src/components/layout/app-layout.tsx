import { BookOpen, CalendarDays, Home, LogOut, Users } from 'lucide-react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { levelProgressFromXp } from '@huahua/shared-types';
import { PlayerHud } from './player-hud';
import { cn } from '../../lib/utils';
import { useUser } from '../../hooks/use-user';
import { authApi } from '../../lib/api/auth';
import { growthApi } from '../../lib/api/growth';
import { clearSession } from '../../store/auth';
import { BitHudHeader, BitNav } from '../ui-preview/bit-hud';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

/**
 * variant：
 *   'default' = 现状外壳（老页面/正式页面用，**行为与改动前完全一致**）
 *   'bit'     = 8bitcn 风格外壳（顶部头像/等级/XP + 底部金色功能栏 + 中文像素字），仅原型对比页使用
 */
export function AppLayout({
  children,
  variant = 'default',
}: {
  children: React.ReactNode;
  variant?: 'default' | 'bit';
}) {
  const user = useUser();
  const navigate = useNavigate();
  const now = new Date();
  const dateLabel = `${now.getMonth() + 1}月${now.getDate()}日 · 周${WEEK[now.getDay()]}`;
  // 左上角成长入口的数据（等级由 xp 派生；与成长页共用 queryKey 缓存）
  const growthQuery = useQuery({
    queryKey: ['growth', 'me'],
    queryFn: () => growthApi.me(),
    enabled: Boolean(user),
  });
  const xp = growthQuery.data?.xp ?? 0;
  const xpProgress = growthQuery.data ? levelProgressFromXp(growthQuery.data.xp) : null;

  // 底栏 3 格：今日 | 日程 | 学习（用户 2026-10-06 指定加入第三格「学习」，
  // 内含「AI 解题」「错题本」，以后继续加别的学习功能）
  const nav = [
    { to: '/', label: '今日', icon: Home },
    { to: '/schedule', label: '日程', icon: CalendarDays },
    { to: '/learning', label: '学习', icon: BookOpen },
  ];

  function onLogout() {
    // 先撤销服务端 Refresh（httpOnly Cookie），再清本地会话
    void authApi.logout().catch(() => undefined).finally(() => {
      clearSession();
      navigate('/login', { replace: true });
    });
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-brandBg text-ink">
      {/* HUD 顶部（docs/ui-reference.md §2）
          bit 变体：数据仍由这里算（等级/经验/角色），只是把表现换成 bit-hud.tsx 里的实现。 */}
      {variant === 'bit' && (
        <BitHudHeader
          level={xpProgress?.level ?? null}
          xp={xp}
          current={xpProgress?.current ?? 0}
          needed={xpProgress?.needed ?? 100}
          ratio={xpProgress?.ratio ?? 0}
          dateLabel={dateLabel}
          roleLabel={
            user ? (user.role === 'child' ? '小冒险家' : user.role === 'parent' ? '家长' : user.role) : null
          }
          onLogout={onLogout}
        />
      )}
      {variant === 'default' && (
      <header className="shrink-0 border-b-4 border-ink bg-ink text-panelLight">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          {/* 顶部 Player HUD（RPG 角色头像牌）：圆形头像 + 圆形素材装饰框 + 左上压框 LV + 右上昵称 + 下方 XP 进度条。
              首页**不显示任何 XP 数字**；点击整个 HUD → /growth 角色详情（详情里才看 XP 数值与成长信息）。
              构图与约束见 components/layout/player-hud.tsx 顶部注释。 */}
          <Link to="/growth" data-growth-entry aria-label="我的成长" title="我的成长" className="shrink-0">
            <PlayerHud
              avatarUrl="/avatar-girl-toon.png"
              level={xpProgress ? xpProgress.level : 1}
              xpInLevel={xpProgress?.current ?? 0}
              xpNeed={xpProgress?.needed ?? 0}
              nickname={user?.username ?? '小冒险家'}
            />
          </Link>
          {/* 中部：产品品牌（整个 Header 的视觉中心）+ 日期作副信息（无边框/无按钮/不占卡片） */}
          <span className="relative flex min-w-0 flex-1 items-center justify-center leading-none">
            <span
              data-brand-title
              className="whitespace-nowrap text-[19px] font-extrabold tracking-[0.28em] text-panelLight"
              style={{ textShadow: '2px 2px 0 rgba(0,0,0,0.35)' }}
            >
              冒险之旅
            </span>
            <span data-brand-date className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold tracking-wider text-panelLight/70">
              {dateLabel}
            </span>
          </span>
          <div className="flex shrink-0 items-center gap-2 text-xs">
            {user ? (
              <>
                {/* 角色文字窄屏隐藏：360px 实测会把 XP 条挤到不足 80px（角色信息在成长页/家庭页仍可见） */}
                <span className="hidden border-2 border-panel/40 bg-panel/10 px-2 py-1 sm:inline-block">
                  {user.role === 'child' ? '小冒险家' : user.role === 'parent' ? '家长' : user.role}
                </span>
                <Link
                  to="/family"
                  className="flex items-center gap-1 border-2 border-panel/40 px-2 py-1 hover:bg-panel/10"
                  aria-label="我的家庭"
                  title="我的家庭"
                >
                  <Users className="h-3.5 w-3.5" />
                </Link>
                <button
                  onClick={onLogout}
                  className="flex items-center gap-1 border-2 border-panel/40 px-2 py-1 hover:bg-panel/10"
                  aria-label="退出登录"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </>
            ) : null}
          </div>
        </div>
      </header>
      )}

      {/* 内容区：**自身滚动**（flex-1 + overflow-y-auto），导航是 shell 的独立一行 →
          任何滚动位置都不会被导航压住（此前用 `sticky bottom-2` 浮层 + pb-28 兜底，
          日程页 62vh 网格仍会被盖住，用户实测反馈）。 */}
      <main className="mx-auto w-full max-w-md flex-1 overflow-y-auto px-3 pb-4 pt-4 md:max-w-2xl">
        {children}
      </main>

      {/* 底部两格导航（今日｜日程）：shell 的一行，非浮层 */}
      <div className="shrink-0 bg-brandBg px-3 pb-3">
        {/* bit 变体：金色双线功能栏（用户参考图风格 + 中文像素字）。
            默认变体保持原样，老页面不受影响。 */}
        {variant === 'bit' ? (
          <BitNav items={nav.map((item) => ({ to: item.to, label: item.label }))} />
        ) : (
          <nav
            data-app-nav
            // 列数跟随 nav 长度（加第三格「学习」时不能写死 2 列，否则第三格会掉到第二行）
            style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}
            className="pixel-frame-flat mx-auto grid w-full max-w-md gap-1 p-1.5 md:max-w-2xl"
          >
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-0.5 py-1.5 text-xs',
                    isActive ? 'bg-[var(--gold-deep)] text-white' : 'text-[var(--gold-dark)] hover:bg-white/25',
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
