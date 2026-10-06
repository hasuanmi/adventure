import { cn } from '../../lib/utils';
import { PIXEL_12 } from './pixel-font';

/**
 * BitProgress —— 8bitcn 「N 格分段 + 边框偏移覆盖层」技法的 Tailwind v3 移植版（**原型专用**）
 *
 * 来源技法（8bitcn `components/ui/8bit/progress.tsx`，MIT）：
 *   ① 填充不是一个连续 bar，而是 **N 个等宽小方块**（原版硬编码 20 格，`flex-1 mx-[1px]`），
 *      已填充块上色、未填充块透明 → 天然得到 `████████░░` 的像素观感；
 *   ② 外框用「上下 border + 绝对定位左右 border 外移」的缺角技巧。
 *
 * 与 8bitcn 原版的差异（刻意的）：
 *   · 不依赖 `@radix-ui/react-progress`（本项目未装）→ 纯 CSS，语义用 role="progressbar" 自己补
 *   · 颜色用 --xp / --accent / --ok，不用它的 `bg-primary` / `bg-yellow-500`
 *   · `segments` 可调（原版硬编码 20）→ XP 用 20、六维用 12、冒险进度用「任务数」
 *   · 新增 `marker`（进度标记，如像素星星）与 `frame`（框厚，小尺寸场景用 2）
 *
 * 注意：原型组件，不接入业务逻辑；与 `components/ui/pixel-bar.tsx` 并存、不覆盖它。
 */

const TONE = {
  xp: 'bg-xp',
  accent: 'bg-accent',
  ok: 'bg-ok',
} as const;

/** 框厚 → 静态类名（必须写死字面量，Tailwind JIT 才扫得到） */
const FRAME = {
  0: { axis: '', cross: '' },
  2: { axis: 'border-y-2 -my-0.5', cross: 'border-x-2 -mx-0.5' },
  4: { axis: 'border-y-4 -my-1', cross: 'border-x-4 -mx-1' },
} as const;

export interface BitProgressProps {
  /** 0–100；null 表示"满格"（对齐 PixelBar 的语义） */
  value: number | null;
  /** 分段数；默认 20（8bitcn 原值） */
  segments?: number;
  tone?: keyof typeof TONE;
  /** segmented = 分段方块（8bitcn）；smooth = 连续条纹（PixelBar 风格） */
  variant?: 'segmented' | 'smooth';
  /** 给填充加内高光/内阴影 bevel */
  bevel?: boolean;
  /** 缺角外框厚度；0 = 不画框 */
  frame?: keyof typeof FRAME;
  /** 进度标记（一般是 <PixelStar />），跟随百分比定位 */
  marker?: React.ReactNode;
  /** 进度条高度类（默认 h-4） */
  barClassName?: string;
  className?: string;
  /** 无障碍名称 */
  label?: string;
}

export function BitProgress({
  value,
  segments = 20,
  tone = 'xp',
  variant = 'segmented',
  bevel = false,
  frame = 4,
  marker,
  barClassName = 'h-4',
  className,
  label = '进度',
}: BitProgressProps) {
  const pct = value === null ? 100 : Math.max(0, Math.min(100, value));
  const filled = Math.round((pct / 100) * segments);
  const f = FRAME[frame];
  const bevelStyle = bevel
    ? { boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.28), inset 0 -2px 0 rgba(0,0,0,0.25)' }
    : undefined;

  return (
    <div
      className={cn('relative', className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      {variant === 'segmented' ? (
        // ① 分段方块：N 格等宽，中间留 1px 缝
        <div className={cn('flex w-full bg-panel', barClassName)}>
          {Array.from({ length: segments }).map((_, i) => (
            <span
              key={i}
              className={cn('mx-[1px] my-[2px] flex-1', i < filled ? TONE[tone] : 'bg-ink/15')}
              style={i < filled ? bevelStyle : undefined}
            />
          ))}
        </div>
      ) : (
        // smooth：连续条纹（复刻 PixelBar 的 repeating-linear-gradient + color-mix）
        <div className={cn('w-full bg-[#e7d6b0]', barClassName)}>
          <div
            className="h-full transition-all"
            style={{
              width: `${pct}%`,
              background: `repeating-linear-gradient(90deg, var(--${tone}) 0 6px, color-mix(in srgb, var(--${tone}) 55%, transparent) 6px 8px)`,
            }}
          />
        </div>
      )}

      {/* ② 缺角像素外框：上下 + 左右外移，厚度由 frame 决定 */}
      {frame !== 0 && (
        <>
          <span aria-hidden className={cn('pointer-events-none absolute inset-0 border-ink', f.axis)} />
          <span
            aria-hidden
            className={cn('pointer-events-none absolute inset-0 border-inherit', f.cross)}
          />
        </>
      )}

      {/* ③ 进度标记（像素星星）：跟随百分比移动。
          夹在 [2.5, 98.5] 内，避免 0%/100% 时半个图标探出条外（沿用 AdventureProgress 的做法）。
          key={pct} 让每次变化都重放一次 pixel-marker-pop 弹跳。 */}
      {marker !== undefined && (
        <span
          key={pct}
          className="pixel-marker-pop pointer-events-none absolute z-10 transition-[left] duration-[620ms] ease-out"
          style={{ left: `${Math.max(2.5, Math.min(98.5, pct))}%`, top: '50%', transform: 'translate(-50%, -50%)' }}
        >
          {marker}
        </span>
      )}
    </div>
  );
}

/**
 * 等级小方块（对齐本项目 [data-level-badge] 的形态）
 * 数字用中文像素字体 —— 拉丁数字在像素字体里是清晰且安全的（无 CJK 缺字风险）。
 */
export function BitLevelBadge({
  level,
  className,
  size = 'md',
}: {
  level: number | string;
  className?: string;
  size?: 'md' | 'sm';
}) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center border-2 border-ink bg-accent font-extrabold text-white',
        size === 'md' ? 'h-8 w-8 text-[12px]' : 'h-5 w-5 text-[12px]',
        PIXEL_12,
        className,
      )}
      style={{
        boxShadow: 'inset 0 0 0 2px var(--panel-light), inset 0 -3px 0 rgba(0,0,0,0.18)',
      }}
    >
      {level}
    </span>
  );
}
