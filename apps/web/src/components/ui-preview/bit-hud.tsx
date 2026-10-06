import { Link, NavLink, useLocation } from 'react-router-dom';
import { LogOut, Users } from 'lucide-react';
import { cn } from '../../lib/utils';
import { PIXEL_12 } from './pixel-font';

/**
 * 顶部 HUD / 底部功能栏的 8bitcn 风格版本（**原型专用**，由 AppLayout 按 variant="bit" 渲染）
 *
 * 为什么单独建文件：`components/layout/app-layout.tsx` 是业务外壳，尽量少动它 ——
 * 这里只做**纯表现**，数据（等级/经验/角色）由 AppLayout 传入，业务逻辑不重复实现。
 *
 * 视觉来源：
 *   · 头像框 / 等级框 / 右侧按钮 = 用户给的参考图「双线描边 + 金色填充」风格
 *   · 底部功能栏 = 同一套参考图风格（金色条 + 外深棕描边 + 内米色环 + 中文像素字）
 *
 * ⚠️ 严格遵守 docs/ui-reference.md §1.2 的既有约定（用户订正过三次，不要回退）：
 *   高头像 + 低状态条、**底对齐**（不是居中）、等级框与 XP 条**边框重叠共享一条缝**、
 *   **不给「等级+XP」再套外框**、**不把 XP 文字做成独立底色块**。
 */

/** 参考图的双线描边：外深棕边框 + 内米色/金色内环 */
const DOUBLE_RING = 'shadow-[inset_0_0_0_2px_var(--panel-light)]';
/** 金色条 + 内米色环 + 硬阴影（组合成一个 box-shadow，避免 Tailwind 后写覆盖前写） */
const GOLD_BAR = 'shadow-[inset_0_0_0_2px_var(--panel-light),4px_4px_0_#3a2a1e]';

export interface BitHudHeaderProps {
  level: number | null;
  xp: number;
  current: number;
  needed: number;
  /** 0–1 */
  ratio: number;
  dateLabel: string;
  roleLabel: string | null;
  onLogout: () => void;
}

export function BitHudHeader({
  level,
  xp,
  current,
  needed,
  ratio,
  dateLabel,
  roleLabel,
  onLogout,
}: BitHudHeaderProps) {
  // XP 分 10 格（每格 10 XP）—— 语义干净，窄屏（360px）也不会挤成一团
  const SEGMENTS = 10;
  const filled = Math.round(ratio * SEGMENTS);

  return (
    <header className="shrink-0 border-b-4 border-ink bg-ink text-panelLight">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
        <Link
          to="/growth"
          data-growth-entry
          aria-label="我的成长"
          title="我的成长"
          className="flex min-w-0 flex-1 flex-col gap-1 transition active:translate-y-0.5"
        >
          {/* 高头像 + 低状态条，底对齐（既有约定） */}
          <span className="flex min-w-0 items-end gap-1.5">
            {/* 头像框：外深棕 + 内金环 → 角色立绘框 */}
            <span
              data-avatar-frame
              className="shrink-0 border-2 border-ink bg-ink p-0.5 shadow-[inset_0_0_0_2px_var(--accent)]"
            >
              <img
                data-avatar-img
                src="/avatar-girl-toon.png"
                alt=""
                aria-hidden
                className="block h-7 w-7 object-contain"
              />
            </span>

            {/* 【等级 + XP】：仍是连续组件、仍底部对齐、仍不套外框 */}
            <span data-status-group className="flex min-w-0 flex-1 items-stretch">
              <span
                data-level-badge
                className={cn(
                  'grid h-5 w-5 shrink-0 place-items-center border-2 border-ink bg-accent text-white',
                  PIXEL_12,
                )}
                style={{ boxShadow: 'inset 0 0 0 1px var(--panel-light)' }}
              >
                {level ?? '—'}
              </span>
              {/* -ml-0.5：与等级框边框重叠，共享一条 2px 缝（既有约定，不要改） */}
              <span
                data-xp-bar
                className={cn('relative -ml-0.5 h-5 min-w-0 flex-1 overflow-hidden border-2 border-ink bg-panel')}
              >
                {/* 分段填充：一格一格（用户偏好） */}
                <span aria-hidden className="absolute inset-0 flex py-px">
                  {Array.from({ length: SEGMENTS }).map((_, i) => (
                    <span
                      key={i}
                      className={cn('mx-px flex-1', i < filled ? 'bg-xp' : 'bg-ink/10')}
                      style={
                        i < filled
                          ? { boxShadow: 'inset 0 1px 0 var(--xp-light), inset 0 -1px 0 var(--xp-dark)' }
                          : undefined
                      }
                    />
                  ))}
                </span>
                <span
                  data-xp-label
                  className={cn(
                    'pointer-events-none absolute inset-0 grid place-items-center text-white',
                    PIXEL_12,
                  )}
                  style={{
                    textShadow:
                      '1px 1px 0 #1a2438, -1px 1px 0 #1a2438, 1px -1px 0 #1a2438, -1px -1px 0 #1a2438',
                  }}
                >
                  {current} / {needed} XP
                </span>
              </span>
            </span>
          </span>
          {/* 日期与累计 XP：整行下方（既有约定） */}
          <span className="block truncate text-[10px] text-panelLight/70">
            {dateLabel} · 累计 {xp} XP
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          {roleLabel ? (
            <>
              <span
                className={cn(
                  'hidden border-2 border-panelLight/50 bg-ink px-2 py-1 text-panelLight sm:inline-block',
                  PIXEL_12,
                )}
              >
                {roleLabel}
              </span>
              <Link
                to="/family"
                aria-label="我的家庭"
                title="我的家庭"
                className={cn(
                  'flex items-center gap-1 border-2 border-panelLight/50 bg-ink px-2 py-1 text-panelLight hover:bg-panel/10',
                )}
              >
                <Users className="h-3.5 w-3.5" />
              </Link>
              <button
                type="button"
                onClick={onLogout}
                aria-label="退出登录"
                className="flex items-center gap-1 border-2 border-panelLight/50 bg-ink px-2 py-1 text-panelLight hover:bg-panel/10"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}

export interface BitNavItem {
  to: string;
  label: string;
}

/**
 * 底部功能栏 —— 用户参考图风格：
 * 金色条 + 外深棕描边 + 内米色环，文字用**中文像素字体**；当前项是深棕块 + 内金环。
 * 参考图本身是纯文字按钮（无图标），所以这里也去掉了 lucide 线性图标（否则是"线性图标 + 像素字"混搭）。
 */
export function BitNav({ items }: { items: BitNavItem[] }) {
  const { pathname } = useLocation();
  return (
    <nav
      data-app-nav
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      className={cn('mx-auto grid w-full max-w-md gap-1 border-2 border-ink bg-accent p-1.5 md:max-w-2xl', GOLD_BAR)}
    >
      {items.map((item) => {
        // 「今日」这一格：/、/today-bit、/today-compare 都算它（否则原型页上看不到当前项高亮）
        const isActive =
          pathname === item.to || (item.to === '/' && pathname.startsWith('/today-'));
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={cn(
              'grid place-items-center border-2 py-2 transition',
              PIXEL_12,
              isActive
                ? 'border-ink bg-ink text-panelLight shadow-[inset_0_0_0_2px_var(--accent)]'
                : 'border-transparent text-ink hover:bg-panel/25',
            )}
          >
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}

/** 供其它 bit 组件复用的双线描边类名 */
export { DOUBLE_RING };
