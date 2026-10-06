import { useEffect, useRef, useState, type CSSProperties } from 'react';

export interface AdventureProgressProps {
  /** 已完成百分比（0–100，由调用方按任务状态统计，本组件不改任何统计逻辑） */
  percent: number;
  /** 数据是否已就绪：未就绪时只同步基准值、**不播放**动画（避免首次加载误播"完成"动画） */
  ready?: boolean;
  /** 进度标记图（默认复用角色头像 → "我走到这里了"） */
  markerSrc?: string;
  className?: string;
}

// 动画时长（用户要求整体 500–800ms）
const ANIM_MS = 620;
const MARKER_PX = 20;

const SPARKS: { dx: string; dy: string }[] = [
  { dx: '-11px', dy: '-9px' },
  { dx: '12px', dy: '-7px' },
  { dx: '-9px', dy: '10px' },
  { dx: '11px', dy: '11px' },
  { dx: '0px', dy: '-14px' },
];

/**
 * 「今日冒险」进度条（2026-10-06 按用户要求重做）：
 *  · **多层像素边框**：外层 2px 深棕(--ink) → 2px 暖棕(--inkSoft) → 内层 2px 深棕 + 3px 内边距
 *    → 条本体不贴外框；与页面其它像素 UI 同厚度、直角、无现代圆角卡片感；
 *  · **进度标记**：角色头像跟随百分比移动（`left = percent%`，非固定右侧），约条高 1.25 倍；
 *  · **动画**：进度变化时宽度平滑过渡 + 标记同步移动，到达后标记轻微弹跳 + 少量像素粒子；
 *    100% 时额外一次高亮扫过；**首次加载不播放**（只在数据就绪后发生变化时播放）。
 */
export function AdventureProgress({
  percent,
  ready = true,
  markerSrc = '/avatar-girl-toon.png',
  className,
}: AdventureProgressProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const prev = useRef<number | null>(null);
  const initialized = useRef(false);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (!ready) return; // 数据未就绪：不记录、不播放
    if (!initialized.current) {
      // 首次拿到数据 → 直接同步基准，不播放动画（用户要求：首次加载不播放）
      initialized.current = true;
      prev.current = clamped;
      return;
    }
    if (prev.current === clamped) return;
    prev.current = clamped;
    setPulse(true);
    const timer = setTimeout(() => setPulse(false), ANIM_MS + 180);
    return () => clearTimeout(timer);
  }, [clamped, ready]);

  const complete = clamped >= 100;
  // 标记的左端夹在条内：100% 时右缘基本贴到终点（98.5% + 半宽 ≈ 条右缘）
  const markerLeft = Math.max(2.5, Math.min(98.5, clamped));

  return (
    <div
      data-adventure-progress
      data-progress-percent={clamped}
      data-progress-complete={complete ? 'true' : undefined}
      className={`border-2 border-ink bg-inkSoft p-[2px] ${className ?? ''}`}
    >
      {/* 内层米白 + 内边距：条本体与边框之间留白，不直接贴外框 */}
      <div className="border-2 border-ink bg-panelLight p-[3px]">
        <div data-progress-track className="relative h-4 border-2 border-ink bg-panel">
          {/* 已完成进度（绿色条纹，沿用既有像素质感） */}
          <div
            data-progress-fill
            className="h-full transition-[width] ease-out"
            style={{
              width: `${clamped}%`,
              transitionDuration: `${ANIM_MS}ms`,
              background:
                'repeating-linear-gradient(90deg, var(--ok) 0 6px, color-mix(in srgb, var(--ok) 55%, transparent) 6px 8px)',
            }}
          />
          {/* 100% 完成时的一次轻微高亮扫过 */}
          {pulse && complete && (
            <span
              aria-hidden
              data-progress-sheen
              className="pixel-sheen pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-white/40"
            />
          )}
          {/* 当前进度标记：跟随百分比移动；到达新位置时轻微弹跳 + 少量像素粒子 */}
          <span
            data-progress-marker
            data-marker-pulse={pulse ? 'true' : undefined}
            className={`pointer-events-none absolute top-1/2 transition-[left] ease-out ${
              pulse ? 'pixel-marker-pop' : ''
            }`}
            style={{
              left: `${markerLeft}%`,
              width: MARKER_PX,
              height: MARKER_PX,
              transform: 'translate(-50%, -50%)',
              transitionDuration: `${ANIM_MS}ms`,
            }}
          >
            <img src={markerSrc} alt="" aria-hidden className="h-full w-full object-contain" />
            {pulse && (
              <span aria-hidden className="pointer-events-none absolute inset-0">
                {SPARKS.map((s, i) => (
                  <span
                    key={i}
                    className="pixel-spark absolute left-1/2 top-1/2 h-[3px] w-[3px] bg-accent"
                    style={{ '--dx': s.dx, '--dy': s.dy } as CSSProperties}
                  />
                ))}
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
