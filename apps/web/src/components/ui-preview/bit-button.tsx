import { forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
import { PIXEL_12 } from './pixel-font';

/**
 * BitButton —— 两种像素按钮技法（**原型专用**）
 *
 * ① 缺角描边（来自 8bitcn `components/ui/8bit/button.tsx`，MIT）：
 *    按钮自身 `border-none`，描边由 **12 个绝对定位的实心小方块**拼出：
 *      上下各 2 块（中间留缝）、四角各 1 块、左右各 1 条
 *    + 4 条 `bg-ink/20` 做上高光 / 下阴影 bevel。
 *    方块在按钮**外侧**，所以每个 size 都预留外边距防裁切。
 *
 * ② 双线描边 + 金色填充（来自用户给的参考图 "Start for free"）：
 *    外深棕边框 + 内米色环（`inset 0 0 0 2px var(--panel-light)`）+ 金色填充，**不画方块装饰**。
 *    用于底部功能栏、以及需要"干净金色按钮"的地方。
 *
 * 文字统一用**中文像素字体 12px**（Fusion Pixel）——
 * 注意 PIXEL_12 里带 font-normal：这套字体只有 400 字重，font-bold 会触发伪粗体糊掉点阵。
 *
 * 注意：原型组件；与 `components/ui/button.tsx`（业务语义变体 accent/ok/danger/warning）并存。
 */

const buttonVariants = cva(
  'relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap border-none text-white transition-transform active:translate-y-1 disabled:opacity-50 disabled:active:translate-y-0',
  {
    variants: {
      variant: {
        accent: 'bg-accent',
        ok: 'bg-ok',
        ink: 'bg-ink',
        // ghost：8bitcn 原版对 ghost 不画描边装饰
        ghost: 'border-2 border-ink bg-panel text-ink',
        // gold：参考图风格（双线描边 + 金色填充），也不画方块装饰
        gold: 'border-2 border-ink bg-accent shadow-[inset_0_0_0_2px_var(--panel-light)]',
      },
      size: {
        // margin 放在 size 里：装饰方块在按钮外侧，必须预留空间
        default: 'm-1.5 px-4 py-2',
        sm: 'm-1.5 px-3 py-1.5',
        // chip：Tab / 筛选片，margin 收到 4px，避免 5 个片排不下
        chip: 'm-1 px-2.5 py-1',
        // block：整宽主按钮；宽度补偿左右各 6px margin
        block: 'm-1.5 w-[calc(100%-0.75rem)] px-4 py-2.5',
      },
    },
    defaultVariants: { variant: 'accent', size: 'default' },
  },
);

export interface BitButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

/** 12 块描边 + 4 条 bevel；ghost / gold 不画（它们自带边框） */
function Decorations({ ghost }: { ghost: boolean }) {
  if (ghost) return null;
  return (
    <span aria-hidden className="pointer-events-none contents">
      {/* 上下：各 2 块，中间留缝 */}
      <span className="absolute -top-1.5 left-1.5 h-1.5 w-1/2 bg-ink" />
      <span className="absolute -top-1.5 right-1.5 h-1.5 w-1/2 bg-ink" />
      <span className="absolute -bottom-1.5 left-1.5 h-1.5 w-1/2 bg-ink" />
      <span className="absolute -bottom-1.5 right-1.5 h-1.5 w-1/2 bg-ink" />
      {/* 四角 */}
      <span className="absolute left-0 top-0 h-1.5 w-1.5 bg-ink" />
      <span className="absolute right-0 top-0 h-1.5 w-1.5 bg-ink" />
      <span className="absolute bottom-0 left-0 h-1.5 w-1.5 bg-ink" />
      <span className="absolute bottom-0 right-0 h-1.5 w-1.5 bg-ink" />
      {/* 左右 */}
      <span className="absolute -left-1.5 top-1.5 h-[calc(100%-12px)] w-1.5 bg-ink" />
      <span className="absolute -right-1.5 top-1.5 h-[calc(100%-12px)] w-1.5 bg-ink" />
      {/* bevel：上高光 + 下阴影 */}
      <span className="absolute left-0 top-0 h-1.5 w-full bg-ink/20" />
      <span className="absolute left-0 top-1.5 h-1.5 w-3 bg-ink/20" />
      <span className="absolute bottom-0 left-0 h-1.5 w-full bg-ink/20" />
      <span className="absolute bottom-1.5 right-0 h-1.5 w-3 bg-ink/20" />
    </span>
  );
}

export const BitButton = forwardRef<HTMLButtonElement, BitButtonProps>(
  ({ className, variant, size, children, ...props }, ref) => (
    // PIXEL_12 放在 buttonVariants 之后 → twMerge 保证 font-normal / text-[12px] 生效
    <button ref={ref} className={cn(buttonVariants({ variant, size }), PIXEL_12, className)} {...props}>
      {children}
      <Decorations ghost={variant === 'ghost' || variant === 'gold'} />
    </button>
  ),
);
BitButton.displayName = 'BitButton';

export { buttonVariants as bitButtonVariants };
