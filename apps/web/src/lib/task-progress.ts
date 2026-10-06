// 任务进度（**展示层派生**：Task 无 progress 字段，按状态映射；docs/p2-closure-record.md §12 已记录）
// 任务卡与任务详情页共用，避免两处各写一份映射。
export const PROGRESS_BY_STATUS: Record<string, number> = {
  pending: 0,
  returned: 20,
  in_progress: 50,
  completed: 100,
};

export function taskProgress(status: string): number {
  return PROGRESS_BY_STATUS[status] ?? 0;
}

/** 进度条颜色：完成=绿、退回=红、其余用任务自定义色或主题橙 */
export function taskProgressColor(task: { status: string; color?: string | null }): string {
  if (task.status === 'completed') return 'var(--ok)';
  if (task.status === 'returned') return 'var(--danger)';
  return task.color ?? 'var(--accent)';
}

/** 简洁时间：M月D日 HH:mm（本地；用于详情页字段） */
export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
