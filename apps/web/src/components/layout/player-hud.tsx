import { cn } from '../../lib/utils';

interface PlayerHudProps {
  avatarUrl: string;
  level: number;
  /** 当前等级内 XP 与升级所需 —— 只算进度，首页不显示数字 */
  xpInLevel: number;
  xpNeed: number;
  nickname: string;
  onClick?: () => void;
  className?: string;
}

/**
 * 顶部 Player HUD（RPG 角色头像牌；参照《阴阳师》构图逻辑，不使用其美术素材）
 *
 * 构图（用户最终确认，勿再改成别的排法）：
 *
 *   ┌──────────┬──────────────────┐
 *   │          │  昵称（右上，独立列）│
 *   │  圆形头像 ├──────────────────┤
 *   │  + 圆框   │  XP 像素条（右下） │
 *   └──────────┴──────────────────┘
 *
 *  · 左列 = **圆形头像 + 圆形像素框**（中心主体；素材包里没有完整圆环，
 *    只有圆角面板的 4 分之一弧片，故圆框用 CSS 多层圆边画）
 *  · **LV 压在头像框左上角**（小徽章，不是独立卡片）
 *  · 右列 = **昵称在上、XP 条在下**：两者各占一行，**永远不会互相遮挡**；
 *    XP 条通过负外边距贴住头像右缘（相连），底边与头像底对齐
 *  · **首页不显示任何 XP 数字/文案**；点 HUD → /growth 看详细 XP 与成长信息
 *  · 层级：头像 > 昵称 / XP
 */
export function PlayerHud({
  avatarUrl,
  level,
  xpInLevel,
  xpNeed,
  nickname,
  onClick,
  className,
}: PlayerHudProps) {
  const pct = xpNeed > 0 ? Math.max(0, Math.min(100, Math.round((xpInLevel / xpNeed) * 100))) : 0;
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      {...(onClick
        ? { type: 'button' as const, onClick, 'aria-label': `角色 ${nickname}，等级 ${level}，查看成长详情` }
        : {})}
      data-player-hud
      data-hud-level={level}
      data-hud-xp-percent={pct}
      className={cn('relative flex items-center', onClick && 'cursor-pointer transition active:translate-y-0.5', className)}
    >
      {/* 左列：圆形头像 + 圆形像素框 + 左上 LV */}
      <span className="relative z-10 block h-14 w-14 shrink-0" data-hud-avatar-frame>
        <img
          src={avatarUrl}
          alt=""
          aria-hidden
          data-hud-avatar
          className="absolute left-1/2 top-1/2 h-[46px] w-[46px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-panelLight object-cover object-top [image-rendering:pixelated]"
        />
        <span className="pointer-events-none absolute inset-0 rounded-full border-[3px] border-ink" />
        <span className="pointer-events-none absolute inset-[5px] rounded-full border-2 border-accent/50" />
        <span
          data-hud-level-badge
          className="absolute -left-2.5 -top-1 border-2 border-ink bg-panel px-1 text-[10px] font-extrabold leading-4 text-ink"
        >
          LV.{level}
        </span>
      </span>

      {/* 右列：昵称（上） + XP 条（下）；两行各自独立，天然不遮挡 */}
      <span className="flex h-14 flex-col justify-end">
        <span
          data-hud-nickname
          className="mb-1 max-w-[9rem] truncate text-[17px] font-extrabold leading-none tracking-wide text-panelLight"
          style={{ textShadow: '1px 1px 0 rgba(0,0,0,0.35)' }}
        >
          {nickname}
        </span>
        <span
          data-hud-xp-bar
          className="relative z-0 -ml-6 block h-2.5 w-28 border-2 border-ink bg-panel"
          aria-hidden
        >
          <span
            data-hud-xp-fill
            className="block h-full bg-xp transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </span>
      </span>
    </Tag>
  );
}
