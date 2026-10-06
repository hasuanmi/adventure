import { Badge } from './badge';
import type { TaskStatus } from '@huahua/shared-types';

// 任务状态 → 像素徽章（v1.2 四态；不引入旧项目 uncompleted/cancelled）
const STATUS_META: Record<TaskStatus, { label: string; variant: 'warning' | 'accent' | 'ok' | 'danger' }> = {
  pending: { label: '待开始', variant: 'warning' },
  in_progress: { label: '进行中', variant: 'accent' },
  completed: { label: '已完成', variant: 'ok' },
  returned: { label: '已退回', variant: 'danger' },
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status] ?? { label: status, variant: 'accent' as const };
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}
