import { cn } from '../../lib/utils';

interface PlayerHudProps {
  /** 圆形头像（无头像时用默认像素头像） */
  avatarUrl: string;
  /** 等级（LV.n） */
  level: number;
  /** 当前等级内 XP 与升级所需 XP —— **只用来算进度，首页不显示数字** */
  xpInLevel: number;
  xpNeed: number;
  /** 昵称 */
  nickname: string;
  /** 点击整个 HUD → 角色详情（现有 /growth） */
  onClick?: () => void;
  className?: string;
}

/**
 * 顶部 Player HUD（RPG 角色头像牌，参照用户给的《阴阳师》构图逻辑，**不使用其美术素材**）
 *
 * 构图关系（用户明确要求，勿改成横排三件套）：
 *  · 中心 = **圆形头像 + 圆形像素装饰框**（视觉主体，不用 SaaS 圆角卡片）
 *  · **LV 在头像框左上角**，轻微压框，不做独立矩形卡片
 *  · **昵称在头像框右上区域**，与 LV 同属"角色身份区"，字号不必大
 *  · **XP 在头像右下/下方**，长度 ≈ 头像 2 倍，像素风经验条
 *  · **首页不显示任何 XP 数字/文案**；点 HUD → 角色详情页才看当前 XP / 下一级所需 / 成长信息
 *  · 层级：头像 > Level/昵称 > XP 进度
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
      {...(onClick ? { type: 'button' as const, onClick, 'aria-label': `角色 ${nickname}，等级 ${level}，查看成长详情` } : {})}
      data-player-hud
      data-hud-level={level}
      data-hud-xp-percent={pct}
      className={cn(
        'relative flex shrink-0 flex-col items-center',
        onClick && 'cursor-pointer transition active:translate-y-0.5',
        className,
      )}
    >
      {/* 昵称：头像框右上区域 */}
      <span
        className="absolute -top-1 right-0 max-w-[7rem] truncate text-[11px] font-extrabold tracking-wide text-ink"
        style={{ textShadow: '1px 1px 0 rgba(58,42,30,0.25)' }}
      >
        {nickname}
      </span>

      {/* 圆形头像 + 圆形装饰框（素材来自 Kenney UI pack） */}
      <span className="relative mt-2 block h-14 w-14" data-hud-avatar-frame>
        <img
          src={avatarUrl}
          alt=""
          aria-hidden
          data-hud-avatar
          className="absolute left-1/2 top-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full object-cover object-top [image-rendering:pixelated]"
        />
        <img
          src="/ui/avatar-frame.png"
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-14 w-14 [image-rendering:pixelated]"
        />
        {/* LV：压在头像框左上角（不是独立卡片） */}
        <span
          data-hud-level-badge
          className="absolute -left-2 top-0 border-2 border-ink bg-panel px-1 text-[10px] font-extrabold leading-4 text-ink shadow-pixel"
        >
          LV.{level}
        </span>
      </span>

      {/* XP 进度：约头像 2 倍长，像素风；**只有进度、没有数字** */}
      <span
        data-hud-xp-bar
        className="mt-1 block h-2 w-28 border-2 border-ink bg-panel"
        aria-hidden
      >
        <span
          data-hud-xp-fill
          className="block h-full bg-xp transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </span>
    </Tag>
  );
}
