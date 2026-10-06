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
 *  · 视觉中心 = **圆形像素徽章**，徽章**居中**，标签「每日成长卡」写在徽章**下方**；
 *  · 徽章外围 = **放射状散射光**（自绘像素放射线素材 ui/badge-rays.png，缓慢旋转）；
 *    不再使用四角小像素点（用户反馈：不要那些小点）；
 *  · 状态：未领取 → 米色徽章 + 「完成今日冒险后领取」；已领取 → 徽章转低饱和绿 + 右下像素勾
 *    + 「✓ 今日已领取」+「查看今日成长记录 →」；
 *  · 点击徽章 → 打开今日成长卡（领取逻辑、数据结构、路由均未改动）；
 *  · **不是考勤**：不出现签退/打卡时间/打卡成功/考勤等表达。
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
      <div className="mt-3 flex flex-col items-center overflow-visible">
        <button
          type="button"
          data-growth-card-entry
          data-growth-card-claimed={claimed ? 'true' : 'false'}
          onClick={() => setOpen(true)}
          className="group relative flex flex-col items-center overflow-visible transition active:translate-y-1"
          aria-label={claimed ? '今日成长卡已领取，查看成长卡' : '领取今日成长卡'}
        >

          {/* 圆形像素徽章（居中主体） */}
          <span
            data-growth-card-badge
            className={cn(
              'relative grid h-14 w-14 place-items-center overflow-visible rounded-full border-[3px] border-ink',
            )}
          >
            <img
              src="/ui/badge-rays.png"
              alt=""
              aria-hidden
              data-growth-card-rays
              style={{ width: 200, height: 200 }}
              className="pixel-blink pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 object-contain [image-rendering:pixelated]"
            />
            <img
              src="/icons/chest.png"
              alt=""
              aria-hidden
              className="h-8 w-8 [image-rendering:pixelated]"
            />
            {claimed && (
              <span
                data-growth-card-badge-check
                className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center border-2 border-ink bg-ok text-[11px] font-extrabold leading-none text-white"
              >
                ✓
              </span>
            )}
          </span>
          <span className="mt-1.5 text-sm font-extrabold text-panelLight">每日成长卡</span>
          <span className="text-[11px] text-panelLight/75">
            {claimed ? '✓ 今日已领取' : '完成今日冒险后领取'}
          </span>
        </button>

        {claimed && (
          <Link to="/growth-cards" className="mt-0.5 text-[11px] font-bold text-panelLight/80 underline">
            查看今日成长记录 →
          </Link>
        )}
      </div>

      <GrowthCardModal
        date={date || new Date().toISOString().slice(0, 10)}
        open={open}
        onClose={() => setOpen(false)}
        onClaimed={() => void todayQuery.refetch()}
      />
    </>
  );
}
