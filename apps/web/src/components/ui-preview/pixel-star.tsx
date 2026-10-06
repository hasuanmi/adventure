/**
 * PixelStar —— 9×9 点阵星星（纯内联 SVG，零素材、零依赖、任意尺寸不糊）
 *
 * 用途：替换「今日冒险」进度条上的角色头像标记（用户 2026-10-06：不用头像，星星之类的就行）。
 * 用 rect 逐格绘制而非 polygon，保证是**真正的点阵图形**（polygon + crispEdges 会有半像素毛边）。
 */

/** 9×9 点阵图案，1 = 实心 */
const STAR: string[] = [
  '000010000',
  '000111000',
  '000111000',
  '111111111',
  '011111110',
  '001111100',
  '001111100',
  '011101110',
  '011000110',
];

export interface PixelStarProps {
  /** 边长（px）。建议用 12 的整数倍或 9 的整数倍，避免重采样 */
  size?: number;
  className?: string;
}

export function PixelStar({ size = 18, className }: PixelStarProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 9 9"
      shapeRendering="crispEdges"
      fill="currentColor"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {STAR.flatMap((row, y) =>
        row
          .split('')
          .map((cell, x) =>
            cell === '1' ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} /> : null,
          ),
      )}
    </svg>
  );
}
