import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { attendanceApi } from '../lib/api/attendance';
import { GrowthCardModal } from './growth-card-modal';
import { cn } from '../lib/utils';

export interface GrowthCardEntryProps {
  /** 今日任务是否已全部完成（100% 后才出现入口） */
  allDone: boolean;
}

/**
 * 「每日打卡 → 今日成长卡」入口（2026-10-06 用户重设计为**圆形像素徽章**）：
 *
 *  · 视觉中心 = **圆形像素徽章**（圆形描边 + 四角像素转角 + 硬像素阴影 + 中心宝箱图标）
 *    —— 不是横向矩形按钮，也不是现代圆角/胶囊组件；
 *  · 右侧文字：主标题「每日成长卡」 + 副信息「完成今日冒险后领取」；已领取 → 「✓ 今日已领取」；
 *  · 点击徽章/整块 → 打开今日成长卡（领取逻辑、数据结构、路由均未改动）；
 *  · **不是考勤**：不出现签退/打卡时间/打卡成功/考勤等表达；
 *  · 父级是深色 HUD 面板，所以文字用浅色、徽章用米色底（对比清晰）。
 */
export function GrowthCardEntry({ allDone }: GrowthCardEntryProps) {
  const [open, setOpen] = useState(false);
  const todayQuery = useQuery({
    queryKey: ['attendance', 'today'],
    queryFn: () => attendanceApi.today(),
    enabled: allDone,
  });

  if (!allDone) return null;

  const date = todayQuery.data?.date ?? '';
  const claimed = Boolean(todayQuery.data?.record);

  return (
    <>
      <button
        type="button"
        data-growth-card-entry
        data-growth-card-claimed={claimed ? 'true' : 'false'}
        onClick={() => setOpen(true)}
        className="mt-3 flex w-full items-center gap-3 text-left transition active:translate-y-1"
      >
        {/* 圆形像素徽章：中心视觉 + 圆周像素转角 + 硬阴影 */}
        <span
          data-growth-card-badge
          className={cn(
            'relative grid h-14 w-14 shrink-0 place-items-center rounded-full border-[3px] shadow-pixel',
            claimed ? 'border-ink bg-ok/25' : 'border-ink bg-panelLight',
          )}
        >
          <img
            src="/icons/chest.png"
            alt=""
            aria-hidden
            className="h-8 w-8 [image-rendering:pixelated]"
          />
          {/* 四角像素转角（保留像素风缺角装饰） */}
          <span aria-hidden className="absolute -left-1 -top-1 h-1.5 w-1.5 bg-accent" />
          <span aria-hidden className="absolute -right-1 -top-1 h-1.5 w-1.5 bg-accent" />
          <span aria-hidden className="absolute -bottom-1 -left-1 h-1.5 w-1.5 bg-accent" />
          <span aria-hidden className="absolute -bottom-1 -right-1 h-1.5 w-1.5 bg-accent" />
          {/* 已领取：徽章上盖一枚像素勾 */}
          {claimed && (
            <span
              data-growth-card-badge-check
              className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center border-2 border-ink bg-ok text-[11px] font-extrabold leading-none text-white"
            >
              ✓
            </span>
          )}
        </span>

        {/* 右侧信息：主标题 + 副信息（不是按钮、不是胶囊） */}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-extrabold text-panelLight">每日成长卡</span>
          <span className="block truncate text-[11px] text-panelLight/75">
            {claimed ? '✓ 今日已领取' : '完成今日冒险后领取'}
          </span>
        </span>

        <span className="shrink-0 text-base font-extrabold text-accent" aria-hidden>
          {claimed ? '' : '→'}
        </span>
      </button>

      {claimed && (
        <Link
          to="/growth-cards"
          className="mt-1 block pl-[4.25rem] text-left text-[11px] font-bold text-panelLight/80 underline"
        >
          查看今日成长记录 →
        </Link>
      )}

      <GrowthCardModal
        date={date || new Date().toISOString().slice(0, 10)}
        open={open}
        onClose={() => setOpen(false)}
        onClaimed={() => void todayQuery.refetch()}
      />
    </>
  );
}
