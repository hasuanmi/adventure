import { Link } from 'react-router-dom';
import { TaskDto } from '@huahua/shared-types';
import { Badge } from './ui/badge';
import { TaskStatusBadge } from './ui/status-badge';
import { subjectMeta } from '../lib/constants';

// TaskCard（docs/ui-reference.md §3 / §4：像素图标块 + 标题 + 状态 Tag + 元信息）
export function TaskCard({ task }: { task: TaskDto }) {
  const subj = subjectMeta(task.subject);
  return (
    <Link
      to={`/tasks/${task.id}`}
      className="block border-2 border-ink bg-panel p-3 shadow-pixel transition hover:bg-panelLight active:translate-y-0.5"
    >
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center border-2 border-ink bg-panelLight text-xl">
          {subj.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-bold text-ink">{task.title}</span>
            <TaskStatusBadge status={task.status} />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-inkSoft">
            {task.color && (
              <span aria-hidden className="h-2 w-2 border border-ink/50" style={{ backgroundColor: task.color }} />
            )}
            <span>{subj.label}</span>
            {task.requiresApproval && <Badge variant="soft">需确认</Badge>}
            {task.dueDate && <span>截止 {new Date(task.dueDate).toLocaleDateString('zh-CN')}</span>}
          </div>
        </div>
      </div>
    </Link>
  );
}
