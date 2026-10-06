import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface PixelFrameProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  /** 外层硬阴影（像素主题 shadow-pixel），默认开 */
  shadow?: boolean;
}

// 复古 RPG 像素 HUD **双层边框**（2026-10-06 按用户参考图新增）：
//   外层 2px 深棕描边(--ink) → 2px 暖棕层(--inkSoft) → 内层 2px 深棕描边 + 米白底 → 内容
// 头像框与经验条框**共用同一组件**，保证"描边厚度 / 配色 / 明暗层次"完全一致
// （用户要求：避免头像与经验条像来自两套不同的 UI）。
export function PixelFrame({
  children,
  className,
  innerClassName,
  shadow = true,
  ...rest
}: PixelFrameProps) {
  return (
    <span
      data-pixel-frame
      className={cn('inline-flex border-2 border-ink bg-inkSoft p-[2px]', shadow && 'shadow-pixel', className)}
      {...rest}
    >
      <span className={cn('flex min-w-0 flex-1 items-center border-2 border-ink bg-panelLight', innerClassName)}>
        {children}
      </span>
    </span>
  );
}
