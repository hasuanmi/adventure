import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { TaskDto, TaskStatusAction } from '@huahua/shared-types';
import { Panel } from './ui/card';
import { Badge } from './ui/badge';
import { TaskStatusBadge } from './ui/status-badge';
import { PixelBar } from './ui/pixel-bar';
import { subjectMeta } from '../lib/constants';
import { questIconForRewardProfile } from '../lib/quest-icons';
import { taskProgress, taskProgressColor } from '../lib/task-progress';
import { ApiError } from '../lib/api/client';
import { tasksApi } from '../lib/api/tasks';
import { formatHM, parseIso } from '../lib/schedule';
import { useUser } from '../hooks/use-user';
import { cn } from '../lib/utils';

// TaskCard → 可展开任务面板（docs/p2-ui-ux-review.md §9「TaskCard 升级为可展开面板」）
// 展开内容：进度 PixelBar + 完成标准 + 行内操作（开始/完成/继续）+ 详情/编辑入口 + 像素角饰。
//
// 两个"展示层派生"的说明（不改模型）：
//  1) **进度**：见 lib/task-progress.ts（按状态映射），标题明确标注"按状态"，不让用户误以为是精细进度。
//  2) **完成标准**：复用 task.description（创建页字段标签同步改为「完成标准 / 说明」）。
//
// 行内操作调 POST /tasks/:id/status（start/complete/resume，v1.2 §8.2）：
//  - 仅"任务所属孩子"可执行（服务端同样限制）；complete 走统一完成模型：
//    无需审批 = 自动定稿并发奖；需审批 = 生成待确认申请，任务状态保持进行中。
const INLINE_ACTION: Partial<Record<string, { action: TaskStatusAction; label: string }>> = {
  pending: { action: 'start', label: '▶ 开始' },
  in_progress: { action: 'complete', label: '✓ 完成' },
  returned: { action: 'resume', label: '↻ 继续' },
};

export function TaskCard({ task }: { task: TaskDto }) {
  const user = useUser();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const subj = subjectMeta(task.subject);
  const progress = taskProgress(task.status);
  const action = INLINE_ACTION[task.status];
  const isOwnChild = user?.role === 'child' && task.childId === user.userId;

  const mutation = useMutation({
    mutationFn: (a: TaskStatusAction) => tasksApi.changeStatus(task.id, { action: a }),
    onSuccess: (updated, a) => {
      setNotice(
        a !== 'complete'
          ? '状态已更新'
          : updated.status === 'completed'
            ? '已完成，奖励已发放 ✓'
            : '已提交，等待家长确认',
      );
      setExpanded(true);
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
      void queryClient.invalidateQueries({ queryKey: ['growth'] });
    },
    onError: (err, a) => {
      const e = err instanceof ApiError ? err : null;
      if (a === 'complete' && e?.status === 409) {
        // 同一任务已有 pending 完成记录（部分唯一索引兜底），对用户而言就是"已提交过"
        setNotice('已提交过，等待家长确认');
      } else if (e?.status === 403) {
        setNotice('只有任务所属的孩子可以操作');
      } else if (e?.status === 409) {
        setNotice('当前状态不允许这个操作');
      } else {
        setNotice('操作失败，请稍后再试');
      }
    },
  });

  return (
    <Panel className={cn('overflow-hidden', expanded && 'bg-panelLight')}>
      {/* 头部：整行可点，展开/收起（原来点击直接跳详情，现改为展开，详情入口在面板内） */}
      <button
        type="button"
        data-task-card-toggle
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 p-3 text-left transition hover:bg-panelLight"
      >
        <span className="relative grid h-10 w-10 shrink-0 place-items-center border-2 border-ink bg-panelLight">
          {/* 任务类型图标（奖励档分类派生：日常/世界/风物/悬赏），32px 原生像素图 */}
          <img
            src={questIconForRewardProfile(task.rewardProfile)}
            alt=""
            aria-hidden
            className="h-8 w-8 [image-rendering:pixelated]"
          />
          {/* 像素角饰（Demo 风格） */}
          <span aria-hidden className="absolute -left-1 -top-1 h-1.5 w-1.5 bg-accent" />
          <span aria-hidden className="absolute -bottom-1 -right-1 h-1.5 w-1.5 bg-accent" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-bold text-ink">{task.title}</span>
            <TaskStatusBadge status={task.status} />
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-inkSoft">
            {task.color && (
              <span aria-hidden className="h-2 w-2 border border-ink/50" style={{ backgroundColor: task.color }} />
            )}
            <span>
              {subj.emoji} {subj.label}
            </span>
            {task.requiresApproval && <Badge variant="soft">需确认</Badge>}
            {task.startAt && (
              <span>
                {formatHM(parseIso(task.startAt))}
                {task.endAt ? `–${formatHM(parseIso(task.endAt))}` : ''}
              </span>
            )}
            {task.dueDate && <span>截止 {new Date(task.dueDate).toLocaleDateString('zh-CN')}</span>}
          </span>
        </span>

        <ChevronDown
          aria-hidden
          className={cn('h-4 w-4 shrink-0 text-inkSoft transition-transform', expanded && 'rotate-180')}
        />
      </button>

      {expanded && (
        <div className="border-t-2 border-dashed border-ink/30 px-3 pb-3 pt-2">
          {/* 进度（按状态派生） */}
          <div className="flex items-center justify-between text-xs font-bold text-inkSoft">
            <span>进度（按状态）</span>
            <span>{progress}%</span>
          </div>
          <PixelBar barColor={taskProgressColor(task)} percent={progress} className="mt-1" />

          {/* 完成标准 */}
          <p className="mt-3 text-xs font-bold text-inkSoft">完成标准</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink">
            {task.description?.trim() || <span className="text-inkSoft">（未填写完成标准）</span>}
          </p>

          {/* 元信息 */}
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-inkSoft">
            <div className="flex gap-1">
              <dt>时间：</dt>
              <dd className="text-ink">
                {task.startAt
                  ? `${formatHM(parseIso(task.startAt))}${task.endAt ? `–${formatHM(parseIso(task.endAt))}` : ''}`
                  : '未安排'}
              </dd>
            </div>
            <div className="flex gap-1">
              <dt>预计用时：</dt>
              <dd className="text-ink">{task.estimatedMinutes ? `${task.estimatedMinutes} 分钟` : '未填'}</dd>
            </div>
            <div className="flex gap-1">
              <dt>截止：</dt>
              <dd className="text-ink">
                {task.dueDate ? new Date(task.dueDate).toLocaleDateString('zh-CN') : '无'}
              </dd>
            </div>
            <div className="flex gap-1">
              <dt>需确认：</dt>
              <dd className="text-ink">{task.requiresApproval ? '是' : '否'}</dd>
            </div>
          </dl>

          {notice && (
            <p className="mt-3 border-2 border-ink/40 bg-panel px-2 py-1 text-xs font-bold text-ink">{notice}</p>
          )}

          {/* 行内操作 */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {isOwnChild && action && (
              <button
                type="button"
                disabled={mutation.isPending}
                onClick={() => {
                  setNotice(null);
                  mutation.mutate(action.action);
                }}
                className="border-2 border-ink bg-accent px-3 py-1.5 text-xs font-extrabold text-white shadow-pixel transition active:translate-y-0.5 disabled:opacity-60"
              >
                {mutation.isPending ? '处理中…' : action.label}
              </button>
            )}
            {isOwnChild && task.status === 'in_progress' && (
              <Link
                to={`/tasks/${task.id}/submit`}
                className="border-2 border-ink bg-panel px-3 py-1.5 text-xs font-bold text-ink shadow-pixel transition active:translate-y-0.5"
              >
                写说明并提交
              </Link>
            )}
            <Link
              to={`/tasks/${task.id}`}
              className="border-2 border-ink bg-panel px-3 py-1.5 text-xs font-bold text-ink shadow-pixel transition active:translate-y-0.5"
            >
              查看详情 →
            </Link>
            {user?.role === 'parent' && (
              <Link
                to={`/tasks/${task.id}/edit`}
                className="border-2 border-ink/40 bg-panelLight px-3 py-1.5 text-xs font-bold text-inkSoft transition hover:text-ink"
              >
                编辑
              </Link>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
