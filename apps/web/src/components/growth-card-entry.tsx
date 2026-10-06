import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Gift } from 'lucide-react';
import { attendanceApi } from '../lib/api/attendance';
import { GrowthCardModal } from './growth-card-modal';

export interface GrowthCardEntryProps {
  /** 今日任务是否已全部完成（100% 后才出现入口） */
  allDone: boolean;
}

/**
 * 「每日打卡 → 今日成长卡」入口（2026-10-06 用户订正）：
 *  · **不是考勤**：不出现签退/打卡时间/打卡成功/考勤等表达；
 *  · 位置：**与「今日冒险」同一个框内**，紧接"今日冒险完成！"下方；仅 100% 后出现；
 *  · 未领取 → 🎁 每日打卡 / 完成今日冒险，领取今日成长卡 →；已领取 → ✓ 今日成长卡已领取。
 *  · 因为父级是深色 HUD 面板，入口本身用米色"票券"底，链接文字用浅色。
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
        className="mt-2 flex w-full items-center gap-2 border-2 border-ink bg-panel px-3 py-2 text-left shadow-pixel transition active:translate-y-0.5"
      >
        <Gift className="h-4 w-4 shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-extrabold text-ink">每日打卡</span>
          <span className="block truncate text-[11px] text-inkSoft">
            {claimed ? '今日成长卡已领取' : '完成今日冒险，领取今日成长卡'}
          </span>
        </span>
        <span className="shrink-0 text-xs font-extrabold text-inkSoft">
          {claimed ? '✓' : '→'}
        </span>
      </button>

      {claimed && (
        <Link
          to="/growth-cards"
          className="mt-1 block text-right text-[11px] font-bold text-panelLight/80 underline"
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
