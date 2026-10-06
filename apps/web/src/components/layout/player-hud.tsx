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
 * 顶部 Player HUD（RPG 角色头像牌；参照用户给的《阴阳师》构图逻辑，不使用其美术素材）
 *
 * 构图关系（用户明确要求）：
 *  · **圆形头像 + 圆形像素装饰框**（视觉主体）—— 圆框用 CSS 画：
 *    Kenney UI pack 里实测**没有完整圆环**（只有圆角面板的 4 分之一弧片，见
 *    ui-shots/_ring_candidates.png），所以不用素材硬拼，改为多层圆形边框。
 *  · **LV 压在头像框左上角**（小徽章，不是独立矩形卡片）
 *  · **昵称在右上**，与 LV 同属角色身份区
 *  · **XP 在右下、与头像相连、底边水平对齐**，长度 ≈ 头像 2 倍，像素风
 *  · **首页不显示任何 XP 数字/文案**；点 HUD → /growth 看详细 XP 与成长信息
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
      {...(onClick
        ? { type: 'button' as const, onClick, 'aria-label': `角色 ${nickname}，等级 ${level}，查看成长详情` }
        : {})}
      data-player-hud
      data-hud-level={level}
      data-hud-xp-percent={pct}
      className={cn('relative flex items-end', onClick && 'cursor-pointer transition active:translate-y-0.5', className)}
    >
      {/* 昵称：头像右上区域 */}
      <span
        className="absolute right-6 top-0.5 z-30 max-w-[8rem] truncate text-[17px] font-extrabold leading-none tracking-wide text-panelLight"
        data-hud-nickname
        style={{ textShadow: '1px 1px 0 rgba(0,0,0,0.35)' }}
      >
        {nickname}
      </span>

      {/* 圆形头像 + 圆形像素装饰框（CSS 多层圆边） */}
      <span className="relative z-10 block h-14 w-14 shrink-0" data-hud-avatar-frame>
        <img
          src={avatarUrl}
          alt=""
          aria-hidden
          data-hud-avatar
          className="absolute left-1/2 top-1/2 h-[46px] w-[46px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-panelLight object-cover object-top [image-rendering:pixelated]"
        />
        {/* 外圈：像素感粗边 */}
        <span className="pointer-events-none absolute inset-0 rounded-full border-[3px] border-ink" />
        {/* 内圈高光：游戏感装饰 */}
        <span className="pointer-events-none absolute inset-[5px] rounded-full border-2 border-accent/50" />
        {/* LV：压框左上角 */}
        <span
          data-hud-level-badge
          className="absolute -left-2.5 -top-1 border-2 border-ink bg-panel px-1 text-[10px] font-extrabold leading-4 text-ink"
        >
          LV.{level}
        </span>
      </span>

      {/* XP：右下、与头像相连（-ml-1 贴住框边）、底边与头像底对齐（items-end + mb-1） */}
      <span data-hud-xp-bar className="relative z-0 -ml-6 mb-1 block h-2.5 w-28 border-2 border-ink bg-panel" aria-hidden>
        <span
          data-hud-xp-fill
          className="block h-full bg-xp transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </span>
    </Tag>
  );
}
