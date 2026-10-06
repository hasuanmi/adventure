// PixelBar（docs/ui-reference.md §3：条纹填充 + 硬描边 + 宽度过渡）
export interface PixelBarProps {
  barColor: string;
  percent: number | null;
  className?: string;
}

export function PixelBar({ barColor, percent, className }: PixelBarProps) {
  const stripe = `repeating-linear-gradient(90deg, ${barColor} 0 6px, color-mix(in srgb, ${barColor} 55%, transparent) 6px 8px)`;
  return (
    <div className={`h-4 border-2 border-ink bg-[#e7d6b0] ${className ?? ''}`}>
      <div
        className="h-full transition-all"
        style={{
          width: percent === null ? '100%' : `${Math.max(0, Math.min(100, percent))}%`,
          background: stripe,
        }}
      />
    </div>
  );
}
