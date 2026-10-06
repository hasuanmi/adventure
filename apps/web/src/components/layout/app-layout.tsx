import { CalendarDays, Home, LogOut, Users } from 'lucide-react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { levelProgressFromXp } from '@huahua/shared-types';
import { cn } from '../../lib/utils';
import { useUser } from '../../hooks/use-user';
import { authApi } from '../../lib/api/auth';
import { growthApi } from '../../lib/api/growth';
import { clearSession } from '../../store/auth';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const user = useUser();
  const navigate = useNavigate();
  const now = new Date();
  const dateLabel = `${now.getMonth() + 1}月${now.getDate()}日 周${WEEK[now.getDay()]}`;
  // 左上角成长入口的数据（等级由 xp 派生；与成长页共用 queryKey 缓存）
  const growthQuery = useQuery({
    queryKey: ['growth', 'me'],
    queryFn: () => growthApi.me(),
    enabled: Boolean(user),
  });
  const xp = growthQuery.data?.xp ?? 0;
  const xpProgress = growthQuery.data ? levelProgressFromXp(growthQuery.data.xp) : null;

  // 底栏 2 格：今日 | 日程（docs/p2-ui-ux-review.md §3：任务并入今日；成长等后续阶段再加入）
  const nav = [
    { to: '/', label: '今日', icon: Home },
    { to: '/schedule', label: '日程', icon: CalendarDays },
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
      {/* HUD 顶部（docs/ui-reference.md §2） */}
      <header className="shrink-0 border-b-4 border-ink bg-ink text-panelLight">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          {/* 左上角顶部信息栏（2026-10-06 按用户订正的结构重做）：
              **三个互相独立的组件** —— 头像框 | 等级数字小方框 | XP 条 —— 各自有边框；
              **不在它们外面再套任何大外框**（用户明确禁止"大框套小框"）。
              三者等高（h-9 → 36px）、顶部对齐、间距统一 gap-2；日期与累计 XP 在整行下方。 */}
          <Link
            to="/growth"
            data-growth-entry
            aria-label="我的成长"
            title="我的成长"
            className="flex min-w-0 flex-1 flex-col gap-1 transition active:translate-y-0.5"
          >
            <span className="flex min-w-0 items-start gap-2">
              {/* 1) 头像框：独立小框，尺寸贴着头像（内边距仅 2px） */}
              <span
                data-avatar-frame
                className="shrink-0 border-2 border-ink bg-panelLight p-0.5"
              >
                <img
                  data-avatar-img
                  src="/avatar-girl-toon.png"
                  alt=""
                  aria-hidden
                  className="block h-7 w-7 object-contain"
                />
              </span>

              {/* 2) 等级数字：独立小方框，与 XP 条横向排列（不共外套） */}
              <span
                data-level-badge
                className="grid h-9 w-9 shrink-0 place-items-center border-2 border-ink bg-accent text-base font-extrabold text-white"
                style={{ boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.2)' }}
              >
                {xpProgress ? xpProgress.level : '—'}
              </span>

              {/* 3) XP 条：边框只包住进度条本体（一个高度、一个水平面）；
                    蓝色已完成 + 米色未完成同面；文字**绝对定位叠加居中**，没有自己的底色块 */}
              <span
                data-xp-bar
                className="relative h-9 min-w-0 flex-1 overflow-hidden border-2 border-ink bg-panel"
              >
                <span
                  data-xp-fill
                  aria-hidden
                  className="absolute inset-y-0 left-0 bg-xp transition-all"
                  style={{
                    width: `${Math.round((xpProgress?.ratio ?? 0) * 100)}%`,
                    boxShadow: 'inset 0 2px 0 var(--xp-light), inset 0 -2px 0 var(--xp-dark)',
                  }}
                />
                <span
                  data-xp-label
                  className="pointer-events-none absolute inset-0 grid place-items-center text-[11px] font-extrabold leading-none text-white"
                  style={{
                    textShadow:
                      '1px 1px 0 #1a2438, -1px 1px 0 #1a2438, 1px -1px 0 #1a2438, -1px -1px 0 #1a2438',
                  }}
                >
                  {xpProgress ? `${xpProgress.current} / ${xpProgress.needed} XP` : '— XP'}
                </span>
              </span>
            </span>
            {/* 日期与累计 XP：整行下方 */}
            <span className="block truncate text-[10px] text-panelLight/70">
              {dateLabel} · 累计 {xp} XP
            </span>
          </Link>
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

      {/* 内容区：**自身滚动**（flex-1 + overflow-y-auto），导航是 shell 的独立一行 →
          任何滚动位置都不会被导航压住（此前用 `sticky bottom-2` 浮层 + pb-28 兜底，
          日程页 62vh 网格仍会被盖住，用户实测反馈）。 */}
      <main className="mx-auto w-full max-w-md flex-1 overflow-y-auto px-3 pb-4 pt-4 md:max-w-2xl">
        {children}
      </main>

      {/* 底部两格导航（今日｜日程）：shell 的一行，非浮层 */}
      <div className="shrink-0 bg-brandBg px-3 pb-3">
        <nav className="mx-auto grid w-full max-w-md grid-cols-2 gap-1 border-2 border-ink bg-ink p-1.5 shadow-pixel md:max-w-2xl">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 py-1.5 text-xs',
                  isActive ? 'bg-accent text-white shadow-pixel' : 'text-panelLight hover:bg-panel/10',
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
