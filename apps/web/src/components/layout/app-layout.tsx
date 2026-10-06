import { CalendarDays, Home, LogOut, Users } from 'lucide-react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { useUser } from '../../hooks/use-user';
import { authApi } from '../../lib/api/auth';
import { clearSession } from '../../store/auth';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const user = useUser();
  const navigate = useNavigate();
  const now = new Date();
  const dateLabel = `${now.getMonth() + 1}月${now.getDate()}日 周${WEEK[now.getDay()]}`;

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
    <div className="min-h-screen bg-brandBg text-ink">
      {/* HUD 顶部（docs/ui-reference.md §2） */}
      <header className="border-b-4 border-ink bg-ink text-panelLight">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-extrabold tracking-widest" style={{ textShadow: '2px 2px 0 #2c2015' }}>
              话话成长 · 学习冒险岛
            </h1>
            <p className="text-xs text-panelLight/80">{dateLabel}</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {user ? (
              <>
                <span className="border-2 border-panel/40 bg-panel/10 px-2 py-1">
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

      {/* 内容区：移动窄栏 / 桌面加宽（docs/ui-reference.md §2）
          pb 需大于底部导航高度：导航是 sticky bottom-2，否则内容会被压在导航下面
          （日程页的 62vh 网格实测被遮住，见 scripts/browser-check.mjs） */}
      <main className="mx-auto w-full max-w-md px-3 pb-28 pt-4 md:max-w-2xl">{children}</main>

      {/* 底部两格导航（今日｜日程） */}
      <nav className="sticky bottom-2 mx-auto mt-4 grid max-w-md grid-cols-2 gap-1 border-2 border-ink bg-ink p-1.5 shadow-pixel">
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
  );
}
