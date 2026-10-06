import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { TaskDto, TaskStatusAction } from '@huahua/shared-types';
import { Panel } from './ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './ui/alert-dialog';
import { TaskStatusBadge } from './ui/status-badge';
import { PixelBar } from './ui/pixel-bar';
import { ApiError } from '../lib/api/client';
import { tasksApi } from '../lib/api/tasks';
import { formatHM, parseIso } from '../lib/schedule';
import { taskTileIconUrl, taskTypeLabel } from '../lib/quest-icons';
import { taskProgress, taskProgressColor } from '../lib/task-progress';
import { useUser } from '../hooks/use-user';
import { cn } from '../lib/utils';

// TaskCard → 可展开任务面板（docs/p2-closure-record.md §12/§15；视觉对齐旧项目 Demo proto-kid-v2）
// 尺寸与信息密度按 Demo：64px 图标 tile、大字标题、两个 chip（状态 + 任务类型）、
// 一行元信息（预计用时 · 计划/截止）、右侧 chevron；展开后 = 虚线分隔 + 进度 + 完成标准 + 行内操作。
//
// 两个"展示层派生"（不改模型）：
//  1) 进度：见 lib/task-progress.ts（按状态映射），标题写明"按状态"。
//  2) 完成标准：复用 task.description；图标/类型：见 lib/quest-icons.ts。
const INLINE_ACTION: Partial<Record<string, { action: TaskStatusAction; label: string }>> = {
  pending: { action: 'start', label: '▶ 开始' },
  in_progress: { action: 'complete', label: '✓ 完成' },
  returned: { action: 'resume', label: '↻ 继续' },
};

export function TaskCard({ task, onCancelled }: { task: TaskDto; onCancelled?: () => void }) {
  const user = useUser();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const progress = taskProgress(task.status);
  const action = INLINE_ACTION[task.status];
  const isOwnChild = user?.role === 'child' && task.childId === user.userId;

  // 取消任务（软删除）：完成后由父级列表负责跳转/刷新
  const removeMutation = useMutation({
    mutationFn: () => tasksApi.remove(task.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
      setNotice('任务已取消');
    },
    onError: (err) => {
      const e = err instanceof ApiError ? err : null;
      setNotice(
        e?.status === 409
          ? '已完成的任务不能取消'
          : e?.status === 403
            ? '你没有权限取消这个任务'
            : '取消失败，请稍后再试',
      );
    },
  });

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

  const meta: string[] = [];
  if (task.estimatedMinutes) meta.push(`预计 ${task.estimatedMinutes} 分钟`);
  if (task.dueDate) meta.push(`计划 ${new Date(task.dueDate).toLocaleDateString('zh-CN')}`);
  if (task.startAt) {
    meta.push(`${formatHM(parseIso(task.startAt))}${task.endAt ? `–${formatHM(parseIso(task.endAt))}` : ''}`);
  }

  return (
    <Panel className={cn('overflow-hidden', expanded && 'bg-panelLight')}>
      <button
        type="button"
        data-task-card-toggle
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2.5 p-2.5 pr-2 text-left transition hover:bg-panelLight"
      >
        {/* 图标 tile（44px 见方，对齐 Demo 比例；内嵌 32px 原生图标 → 像素不糊）+ 像素角饰 */}
        <span className="relative grid h-11 w-11 shrink-0 place-items-center border-2 border-ink bg-panelLight shadow-pixel">
          <img src={taskTileIconUrl(task)} alt="" aria-hidden className="h-8 w-8 [image-rendering:pixelated]" />
          <span aria-hidden className="absolute -left-1 -top-1 h-1.5 w-1.5 bg-accent" />
          <span aria-hidden className="absolute -bottom-1 -right-1 h-1.5 w-1.5 bg-accent" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            {task.color && (
              <span aria-hidden className="h-3 w-3 shrink-0 border-2 border-ink" style={{ backgroundColor: task.color }} />
            )}
            <span className="truncate text-[15px] font-extrabold text-ink">{task.title}</span>
          </span>
          {/* 两个 chip：状态 + 任务类型（Demo 一致） */}
          <span className="mt-1 flex flex-wrap items-center gap-1">
            <TaskStatusBadge status={task.status} />
            <span className="border-2 border-ink bg-panel px-1 py-0.5 text-[11px] font-bold text-ink">
              {taskTypeLabel(task.rewardProfile)}
            </span>
            {task.requiresApproval && (
              <span className="border-2 border-warning/70 bg-panelLight px-1 py-0.5 text-[11px] font-bold text-ink">
                需确认
              </span>
            )}
          </span>
          {meta.length > 0 && (
            <span className="mt-0.5 block truncate text-[11px] text-inkSoft">{meta.join(' · ')}</span>
          )}
        </span>

        <ChevronDown
          aria-hidden
          className={cn('h-4 w-4 shrink-0 text-inkSoft transition-transform', expanded && 'rotate-180')}
        />
      </button>

      {expanded && (
        <div className="mx-3 border-t-2 border-dashed border-ink/40 pb-3 pt-2">
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

          {notice && (
            <p className="mt-3 border-2 border-ink/40 bg-panel px-2 py-1 text-xs font-bold text-ink">{notice}</p>
          )}

          {/* 行内操作（大按钮，Demo 一致） */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {isOwnChild && action && (
              <button
                type="button"
                disabled={mutation.isPending}
                onClick={() => {
                  setNotice(null);
                  mutation.mutate(action.action);
                }}
                className={cn(
                  'border-2 border-ink px-4 py-2 text-sm font-extrabold text-white shadow-pixel transition active:translate-y-1 disabled:opacity-60',
                  action.action === 'complete' ? 'bg-ok' : 'bg-accent',
                )}
              >
                {mutation.isPending ? '处理中…' : action.label}
              </button>
            )}
            {isOwnChild && task.status === 'in_progress' && (
              <Link
                to={`/tasks/${task.id}/submit`}
                className="border-2 border-ink bg-panel px-4 py-2 text-sm font-bold text-ink shadow-pixel transition active:translate-y-1"
              >
                写说明并提交
              </Link>
            )}
            <Link
              to={`/tasks/${task.id}`}
              className="border-2 border-ink bg-panel px-4 py-2 text-sm font-bold text-ink shadow-pixel transition active:translate-y-1"
            >
              查看详情 →
            </Link>
            {user?.role === 'parent' && (
              <Link
                to={`/tasks/${task.id}/edit`}
                className="border-2 border-ink/40 bg-panelLight px-4 py-2 text-sm font-bold text-inkSoft transition hover:text-ink"
              >
                编辑
              </Link>
            )}
            {/* 删除任务（后端是软删除；已完成任务不可删）
                原先前端没有任何删除入口，用户两次反馈"没有删除功能" → 改为醒目的「删除任务」+ 二次确认 */}
            {task.status !== 'completed' && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    data-cancel-task
                    data-delete-task
                    className="border-2 border-danger bg-danger/10 px-3 py-2 text-sm font-bold text-danger transition hover:bg-danger/20"
                  >
                    删除任务
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>删除这个任务？</AlertDialogTitle>
                    <AlertDialogDescription>
                      「{task.title}」将从今日与日程移除（软删除，可联系管理员恢复）。已完成的任务不能删除。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>再想想</AlertDialogCancel>
                    <AlertDialogAction
                      data-confirm-cancel
                      onClick={() => {
                        if (onCancelled) {
                          onCancelled();
                          return;
                        }
                        setNotice(null);
                        removeMutation.mutate();
                      }}
                    >
                      确认删除
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
