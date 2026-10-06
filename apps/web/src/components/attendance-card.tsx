import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, LogIn, LogOut } from 'lucide-react';
import { Panel } from './ui/card';
import { ApiError } from '../lib/api/client';
import { attendanceApi } from '../lib/api/attendance';
import { formatHM } from '../lib/schedule';

export interface AttendanceCardProps {
  /** 今日任务是否已全部完成（用户规则：100% 后才出现打卡入口） */
  allDone: boolean;
}

/**
 * 打卡卡（P4）—— **只有今日任务 100% 完成后才出现**（用户明确要求）。
 * 语义边界（勿混）：这里的"打卡"= 每日签到（独立表 attendances）；
 * 与成长页「本周打卡」（任务完成周格，数据源 /growth/grants）是两件事。
 */
export function AttendanceCard({ allDone }: AttendanceCardProps) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const todayQuery = useQuery({
    queryKey: ['attendance', 'today'],
    queryFn: () => attendanceApi.today(),
    enabled: allDone,
  });

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['attendance'] });
  };

  const checkIn = useMutation({
    mutationFn: () => attendanceApi.checkIn(),
    onSuccess: () => {
      setNotice('打卡成功！今天也要加油 ⚔️');
      refresh();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        setNotice('今天已经打过卡啦');
        refresh();
      } else {
        setNotice('打卡失败，请稍后再试');
      }
    },
  });

  const checkOut = useMutation({
    mutationFn: () => attendanceApi.checkOut(),
    onSuccess: refresh,
    onError: (err) => {
      setNotice(err instanceof ApiError && err.status === 409 ? '今天已经签退啦' : '签退失败，请稍后再试');
    },
  });

  // 打卡卡尚未加载出状态时保持占位，避免按钮状态闪烁
  const record = todayQuery.data?.record ?? null;
  const state = todayQuery.data?.state ?? 'NOT_CHECKED_IN';

  useEffect(() => {
    if (allDone) setNotice(null);
  }, [allDone]);

  if (!allDone) return null;

  return (
    <Panel data-attendance-card className="border-2 border-ink bg-ink text-panelLight">
      <div className="flex items-center gap-2">
        <img src="/icons/daily.png" alt="" aria-hidden className="h-6 w-6 [image-rendering:pixelated]" />
        <p className="text-sm font-extrabold tracking-widest">每日打卡</p>
        <Link to="/attendance" className="ml-auto text-xs font-bold text-panelLight/80 underline">
          打卡历史 →
        </Link>
      </div>

      {todayQuery.isLoading ? (
        <p className="mt-2 text-xs text-panelLight/70">读取今日状态…</p>
      ) : (
        <>
          <p className="mt-2 text-sm" data-attendance-state={state}>
            {state === 'NOT_CHECKED_IN' && '今日任务全部完成，来打个卡吧！'}
            {state === 'CHECKED_IN' && (
              <>
                已打卡 <span className="font-extrabold">{record ? formatHM(new Date(record.checkInAt)) : ''}</span>
                ，签退后记录今日时长。
              </>
            )}
            {state === 'CHECKED_OUT' && (
              <>
                今日已签退 · 时长{' '}
                <span className="font-extrabold" data-attendance-minutes>
                  {record?.totalMinutes ?? 0}
                </span>{' '}
                分钟
              </>
            )}
          </p>

          <div className="mt-3 flex gap-2">
            {state === 'NOT_CHECKED_IN' && (
              <button
                type="button"
                data-attendance-check-in
                disabled={checkIn.isPending}
                onClick={() => {
                  setNotice(null);
                  checkIn.mutate();
                }}
                className="flex items-center gap-1.5 border-2 border-ink bg-ok px-4 py-2 text-sm font-extrabold text-white shadow-pixel transition active:translate-y-1 disabled:opacity-60"
              >
                <LogIn className="h-4 w-4" />
                {checkIn.isPending ? '打卡中…' : '打卡'}
              </button>
            )}
            {state === 'CHECKED_IN' && (
              <button
                type="button"
                data-attendance-check-out
                disabled={checkOut.isPending}
                onClick={() => {
                  setNotice(null);
                  checkOut.mutate();
                }}
                className="flex items-center gap-1.5 border-2 border-ink bg-accent px-4 py-2 text-sm font-extrabold text-white shadow-pixel transition active:translate-y-1 disabled:opacity-60"
              >
                <LogOut className="h-4 w-4" />
                {checkOut.isPending ? '签退中…' : '签退'}
              </button>
            )}
            {state === 'CHECKED_OUT' && (
              <span className="flex items-center gap-1.5 border-2 border-panel/40 bg-panel/10 px-3 py-2 text-xs font-bold">
                <Clock className="h-3.5 w-3.5" /> 今日打卡已完成
              </span>
            )}
          </div>
        </>
      )}

      {notice && <p className="mt-2 text-xs font-bold text-warning">{notice}</p>}
    </Panel>
  );
}
