import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GROWTH_CARD_TITLE, growthCardOf } from '@huahua/shared-types';
import { ApiError } from '../lib/api/client';
import { attendanceApi } from '../lib/api/attendance';

export interface GrowthCardModalProps {
  /** 卡片日期（YYYY-MM-DD，家庭时区） */
  date: string;
  open: boolean;
  onClose: () => void;
  /** 领取成功（父级刷新入口状态） */
  onClaimed?: () => void;
}

/** 领取反馈动画时长（用户要求"非常轻"） */
const COLLECT_MS = 900;

/**
 * 「今日成长卡」弹窗（2026-10-06 按用户参考图重做：Pixel RPG 奖励卡，非表单）
 *
 * 结构固定（参考 Wildermyth 奖励卡）：像素边框 → 图片 → 标题带 → 一句话面板 → 领取条。
 * 每天只变「图片」与「一句话」；领取后播放极轻动画（图片放大 → 星星 → 收入记录）后关闭。
 */
export function GrowthCardModal({ date, open, onClose, onClaimed }: GrowthCardModalProps) {
  const queryClient = useQueryClient();
  const card = growthCardOf(date);
  const [collecting, setCollecting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const todayQuery = useQuery({
    queryKey: ['attendance', 'today'],
    queryFn: () => attendanceApi.today(),
    enabled: open,
  });
  const alreadyClaimed = Boolean(todayQuery.data?.record) && todayQuery.data?.date === date;

  // 关闭时复位动画/提示，避免下次打开残留
  useEffect(() => {
    if (!open) {
      setCollecting(false);
      setNotice(null);
    }
  }, [open]);

  const claim = useMutation({
    mutationFn: () => attendanceApi.checkIn(),
    onSuccess: () => {
      setCollecting(true);
      void queryClient.invalidateQueries({ queryKey: ['attendance'] });
      setTimeout(() => {
        onClaimed?.();
        onClose();
      }, COLLECT_MS);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        // 今天已领过（业务规则：每天最多一张）
        void queryClient.invalidateQueries({ queryKey: ['attendance'] });
        setNotice('今天已经领过啦，明天再来！');
        setTimeout(onClose, 1200);
      } else {
        setNotice('领取失败，请稍后再试');
      }
    },
  });

  if (!open) return null;

  return (
    <div
      data-growth-card-modal
      role="dialog"
      aria-modal="true"
      aria-label={GROWTH_CARD_TITLE}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/75 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !collecting) onClose();
      }}
    >
      {/* 卡片本体：外层深棕描边 + 金色内层 → RPG 奖励卡 */}
      <div
        data-growth-card-body
        className={`w-full max-w-[300px] border-2 border-ink bg-inkSoft p-[3px] shadow-pixel transition-all duration-700 ${
          collecting ? 'scale-90 opacity-0' : 'scale-100 opacity-100'
        }`}
      >
        <div className="border-2 border-ink bg-panel p-[6px]">
          {/* 图片区：再套一层内描边（参考图的三层边框） */}
          <div className="relative border-2 border-ink bg-panelLight p-[3px]">
            <img
              data-growth-card-image
              src={`/cards/card-0${card.imageNo}.png`}
              alt=""
              className={`block w-full [image-rendering:pixelated] ${
                collecting ? 'pixel-card-pop' : ''
              }`}
            />
            {collecting && (
              <span aria-hidden className="pointer-events-none absolute inset-0">
                {[
                  { left: '18%', top: '30%' },
                  { left: '72%', top: '24%' },
                  { left: '38%', top: '62%' },
                  { left: '80%', top: '66%' },
                  { left: '52%', top: '44%' },
                ].map((p, i) => (
                  <span
                    key={i}
                    className="pixel-spark absolute h-[4px] w-[4px] bg-panelLight"
                    style={{ left: p.left, top: p.top, ['--dx' as string]: `${i % 2 ? 10 : -10}px`, ['--dy' as string]: '-14px' }}
                  />
                ))}
              </span>
            )}
          </div>

          {/* 标题带（参考图的银色横带 → 我们的金色带） */}
          <div className="mt-[6px] border-2 border-ink bg-accent px-2 py-1 text-center">
            <p className="text-sm font-extrabold tracking-widest text-ink">{GROWTH_CARD_TITLE}</p>
          </div>

          {/* 一句话面板（羊皮纸 + 四角小方块装饰） */}
          <div className="relative mt-[6px] border-2 border-ink bg-panelLight px-3 py-3">
            <span aria-hidden className="absolute left-1 top-1 h-1 w-1 bg-ink/50" />
            <span aria-hidden className="absolute right-1 top-1 h-1 w-1 bg-ink/50" />
            <span aria-hidden className="absolute bottom-1 left-1 h-1 w-1 bg-ink/50" />
            <span aria-hidden className="absolute bottom-1 right-1 h-1 w-1 bg-ink/50" />
            <p data-growth-card-copy className="text-center text-xs font-bold leading-relaxed text-ink">
              {card.copy}
            </p>
          </div>

          {/* 领取条 */}
          {alreadyClaimed && !collecting ? (
            <p
              data-growth-card-claimed
              className="mt-[6px] border-2 border-ink bg-panelLight px-3 py-2 text-center text-xs font-extrabold text-inkSoft"
            >
              ✓ {date} 已收入成长记录
            </p>
          ) : (
            <button
              type="button"
              data-growth-card-claim
              disabled={claim.isPending || collecting}
              onClick={() => {
                setNotice(null);
                claim.mutate();
              }}
              className="mt-[6px] w-full border-2 border-ink bg-ink px-3 py-2 text-xs font-extrabold tracking-widest text-panelLight transition active:translate-y-0.5 disabled:opacity-60"
            >
              {collecting ? '★ 收入成长记录…' : claim.isPending ? '领取中…' : '领取今日卡片'}
            </button>
          )}

          {notice && <p className="mt-1.5 text-center text-[11px] font-bold text-warning">{notice}</p>}
        </div>
      </div>
    </div>
  );
}
