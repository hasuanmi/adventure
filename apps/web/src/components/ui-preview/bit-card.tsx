import { forwardRef } from 'react';
import { cn } from '../../lib/utils';
import { PIXEL_12 } from './pixel-font';

/**
 * BitCard —— 8bitcn 「缺角像素框」技法的 Tailwind v3 移植版（**原型专用**）
 *
 * 来源技法（8bitcn `components/ui/8bit/card.tsx`，MIT）：
 *   外层只画上下边框 `border-y-6`，再用一个绝对定位的覆盖层
 *   `absolute inset-0 -mx-1.5 border-x-6 border-inherit` 把左右边框**向外偏移 6px** 绘制。
 *   两条边框因此不在同一深度交汇 —— 交界处自然形成「像素块拼接」的缺角，
 *   而不是 CSS 圆角/描边那种连续直线。
 *
 * 与 8bitcn 原版的差异（刻意的）：
 *   · 颜色改用花花现有 token（border-ink / bg-panel / bg-accent），不用它的 `--foreground` / `--primary`
 *   · 去掉了 `p-0!` / `w-full!`（Tailwind v4 尾部 important 语法，v3 会静默丢弃）
 *   · 去掉了对 shadcn `Card/CardHeader/...` 的依赖（本项目 card.tsx 只有 Panel/Card/PanelHeader）
 *
 * 注意：这是原型组件，**不接入业务逻辑**，与 `components/ui/card.tsx` 并存、不覆盖它。
 */

/** 框厚 → 静态类名映射（必须写死字面量，否则 Tailwind JIT 扫不到任意值类） */
const FRAME = {
  4: { axis: 'border-y-4', cross: '-mx-1 border-x-4' },
  6: { axis: 'border-y-[6px]', cross: '-mx-1.5 border-x-[6px]' },
  8: { axis: 'border-y-[8px]', cross: '-mx-2 border-x-[8px]' },
} as const;

/** 内部底色（正文与标题文字颜色跟随底色，避免深色卡上出现深色字） */
const TONE = {
  panel: 'bg-panel text-ink',
  panelLight: 'bg-panelLight text-ink',
  ink: 'bg-ink text-panelLight',
} as const;

/** 缺角框颜色（覆盖层用 border-inherit，会自动继承这里的颜色） */
const FRAME_TONE = {
  ink: 'border-ink',
  accent: 'border-accent',
  ok: 'border-ok',
  warning: 'border-warning',
  danger: 'border-danger',
  panelLight: 'border-panelLight',
} as const;

export interface BitCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** 卡片标题（渲染在标题带里）。Omit 掉原生 title，允许传 ReactNode */
  title?: React.ReactNode;
  /** 标题带样式：无 / 橙色带 / 深棕带 */
  titleBar?: 'none' | 'accent' | 'ink';
  /** 框厚（像素）。默认 6 */
  frame?: keyof typeof FRAME;
  /** 缺角框颜色 */
  frameTone?: keyof typeof FRAME_TONE;
  /** 内部底色（会同时决定正文文字色） */
  tone?: keyof typeof TONE;
  /** 标题左侧的像素图标（一般是 <img> 像素图） */
  icon?: React.ReactNode;
  /** 正文内边距：紧凑 / 常规 */
  padding?: 'sm' | 'md';
}

export const BitCard = forwardRef<HTMLDivElement, BitCardProps>(
  (
    {
      className,
      title,
      titleBar = 'none',
      frame = 6,
      frameTone = 'ink',
      tone = 'panel',
      icon,
      padding = 'md',
      children,
      ...props
    },
    ref,
  ) => {
    const f = FRAME[frame];
    const dark = tone === 'ink';
    return (
      <div
        ref={ref}
        className={cn('relative', TONE[tone], FRAME_TONE[frameTone], f.axis, className)}
        {...props}
      >
        <div className={cn('flex h-full w-full flex-col', padding === 'md' ? 'p-3' : 'p-2')}>
          {title !== undefined && (
            <div
              className={cn(
                'mb-2 flex items-center gap-2',
                titleBar === 'accent' && '-mx-3 -mt-3 mb-2 border-b-2 border-ink bg-accent px-3 py-1.5 text-ink',
                titleBar === 'ink' && '-mx-3 -mt-3 mb-2 border-b-2 border-ink bg-ink px-3 py-1.5 text-panelLight',
              )}
            >
              {icon}
              {/* 深色底上标题用米色；标题用中文像素字体（12px 是设计下限） */}
              <span className={cn(PIXEL_12, dark && 'text-panelLight')}>{title}</span>
            </div>
          )}
          <div className="min-w-0 flex-1">{children}</div>
        </div>

        {/* 左右边框覆盖层：向外偏移 = 框厚，形成缺角拼接
            border-inherit 让它继承上面那层 border-{frameTone} 的颜色（8bitcn 同款技巧） */}
        <span
          aria-hidden
          className={cn('pointer-events-none absolute inset-0 border-inherit', f.cross)}
        />
      </div>
    );
  },
);
BitCard.displayName = 'BitCard';
