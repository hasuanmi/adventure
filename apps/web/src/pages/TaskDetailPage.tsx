import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Play, RotateCcw, Send } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Panel } from '../components/ui/card';
import { PixelBar } from '../components/ui/pixel-bar';
import { Textarea } from '../components/ui/input';
import { Skeleton } from '../components/ui/skeleton';
import { TaskStatusBadge } from '../components/ui/status-badge';
import { useUser } from '../hooks/use-user';
import { ApiError } from '../lib/api/client';
import { approvalsApi } from '../lib/api/approvals';
import { familyApi } from '../lib/api/family';
import { tasksApi } from '../lib/api/tasks';
import { rewardProfilesApi } from '../lib/api/reward-profiles';
import { subjectMeta } from '../lib/constants';
import { taskTileIconUrl, taskTypeLabel } from '../lib/quest-icons';
import { formatDateTime, taskProgress, taskProgressColor } from '../lib/task-progress';

const WEEK_CN = ['一', '二', '三', '四', '五', '六', '日'];

function repeatLabel(bits: number | null | undefined): string {
  if (!bits) return '不重复';
  const days = WEEK_CN.filter((_, index) => (bits & (1 << index)) !== 0);
  return days.length === 0 ? '不重复' : `每周${days.join('、')}`;
}

// Task Detail（docs/ui-reference.md §4：字段展示 + 状态动作 + 完成确认操作 + 奖励档 label）
export function TaskDetailPage() {
  const { id = '' } = useParams();
  const user = useUser();
  const queryClient = useQueryClient();
  const isChild = user?.role === 'child';
  const [rejecting, setRejecting] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const taskQuery = useQuery({ queryKey: ['task', id], queryFn: () => tasksApi.get(id) });
  const completionsQuery = useQuery({ queryKey: ['completions', id], queryFn: () => tasksApi.completions(id) });
  const profilesQuery = useQuery({ queryKey: ['reward-profiles'], queryFn: () => rewardProfilesApi.list() });
  const familyQuery = useQuery({ queryKey: ['family'], queryFn: () => familyApi.me() });

  const task = taskQuery.data;
  const latestCompletion = completionsQuery.data?.[0];
  const approvalId = latestCompletion?.status === 'pending' ? latestCompletion.approvalRequestId : null;
  const approvalQuery = useQuery({
    queryKey: ['approval', approvalId],
    queryFn: () => approvalsApi.get(approvalId as string),
    enabled: Boolean(approvalId),
  });
  const approval = approvalQuery.data;

  async function afterDecision(): Promise<void> {
    setRejecting(false);
    setRejectComment('');
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['task', id] }),
      queryClient.invalidateQueries({ queryKey: ['completions', id] }),
      queryClient.invalidateQueries({ queryKey: ['tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['approvals'] }),
    ]);
  }

  const approveMutation = useMutation({
    mutationFn: () => approvalsApi.approve(approvalId as string),
    onSuccess: afterDecision,
    onError: (err) => setActionError(err instanceof ApiError ? `${err.reason ?? '错误'}：${err.message}` : '操作失败'),
  });
  const rejectMutation = useMutation({
    mutationFn: (comment: string) => approvalsApi.reject(approvalId as string, comment),
    onSuccess: afterDecision,
    onError: (err) => setActionError(err instanceof ApiError ? `${err.reason ?? '错误'}：${err.message}` : '操作失败'),
  });

  if (taskQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (taskQuery.isError || !task) {
    return (
      <Panel>
        <p className="text-sm font-bold text-danger">
          任务不存在或无权查看：{taskQuery.error instanceof Error ? taskQuery.error.message : '未知错误'}
        </p>
        <Link to="/" className="mt-3 inline-block border-2 border-ink bg-accent px-3 py-1.5 text-sm font-bold text-white shadow-pixel">
          返回今日
        </Link>
      </Panel>
    );
  }

  const subj = subjectMeta(task.subject);
  const current = task; // 供函数/闭包内使用（TS 窄化不进入函数体）
  const rewardLabel =
    profilesQuery.data?.profiles.find((p) => p.code === current.rewardProfile)?.label ??
    (current.rewardProfile ? current.rewardProfile : '自定义任务');
  const childName = familyQuery.data?.members.find((m) => m.id === current.childId)?.username;
  const reviewerName = current.reviewerId
    ? familyQuery.data?.members.find((m) => m.id === current.reviewerId)?.username
    : undefined;

  async function changeStatus(action: 'start' | 'resume') {
    try {
      setActionError(null);
      await tasksApi.changeStatus(current.id, { action });
      await taskQuery.refetch();
    } catch (e) {
      // 原来是 alert()（不可断言、打断操作）→ 改为页面内提示
      setActionError(
        e instanceof ApiError
          ? e.status === 403
            ? '只有任务所属的孩子可以操作'
            : e.status === 409
              ? '当前状态不允许这个操作'
              : `${e.reason ?? '错误'}：${e.message}`
          : '操作失败，请稍后再试',
      );
    }
  }

  const canStart = isChild && task.status === 'pending';
  const canResume = isChild && task.status === 'returned';
  const canSubmit = isChild && task.status !== 'completed';
  const canEdit = task.status !== 'completed';
  const busy = approveMutation.isPending || rejectMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-1 text-sm font-bold text-inkSoft hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> 返回今日
        </Link>
        {canEdit && (
          <Link
            to={`/tasks/${task.id}/edit`}
            className="inline-flex items-center gap-1 border-2 border-ink bg-panel px-2 py-1 text-xs font-bold shadow-pixel active:translate-y-0.5"
          >
            <Pencil className="h-3.5 w-3.5" /> 编辑
          </Link>
        )}
      </div>

      <Panel>
        <div className="flex items-center gap-3">
          <span className="relative grid h-12 w-12 place-items-center border-2 border-ink bg-panelLight">
            <img
              src={taskTileIconUrl(task)}
              alt=""
              aria-hidden
              className="h-9 w-9 [image-rendering:pixelated]"
            />
            <span aria-hidden className="absolute -left-1 -top-1 h-1.5 w-1.5 bg-accent" />
            <span aria-hidden className="absolute -bottom-1 -right-1 h-1.5 w-1.5 bg-accent" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-extrabold">{task.title}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <TaskStatusBadge status={task.status} />
              <Badge variant="soft">{taskTypeLabel(task.rewardProfile)}</Badge>
              <Badge variant="soft">
                {subj.emoji} {subj.label}
              </Badge>
              {task.color && (
                <span
                  aria-label="任务颜色"
                  className="h-3.5 w-3.5 border-2 border-ink"
                  style={{ backgroundColor: task.color }}
                />
              )}
              {task.requiresApproval && <Badge variant="warning">需人工确认</Badge>}
            </div>
          </div>
        </div>

        {/* 进度（按状态派生；与任务卡同一映射） */}
        <div className="mt-3 flex items-center justify-between text-xs font-bold text-inkSoft">
          <span>进度（按状态）</span>
          <span>{taskProgress(task.status)}%</span>
        </div>
        <PixelBar barColor={taskProgressColor(task)} percent={taskProgress(task.status)} className="mt-1" />

        {/* 完成标准（= task.description；与创建页字段、任务卡标签一致） */}
        <p className="mt-3 text-xs font-bold text-inkSoft">完成标准</p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-ink">
          {task.description?.trim() || <span className="text-inkSoft">（未填写完成标准）</span>}
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-xs font-bold text-inkSoft">优先级</dt>
            <dd className="text-ink">{task.priority === 2 ? '高' : task.priority === 1 ? '普通' : '低'}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold text-inkSoft">奖励档位</dt>
            <dd className="text-ink">{rewardLabel}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold text-inkSoft">开始时间</dt>
            <dd className="text-ink">{formatDateTime(task.startAt)}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold text-inkSoft">结束时间</dt>
            <dd className="text-ink">{formatDateTime(task.endAt)}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold text-inkSoft">截止日期</dt>
            <dd className="text-ink">{task.dueDate ? new Date(task.dueDate).toLocaleDateString('zh-CN') : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold text-inkSoft">预计用时</dt>
            <dd className="text-ink">{task.estimatedMinutes ? `${task.estimatedMinutes} 分钟` : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold text-inkSoft">重复</dt>
            <dd className="text-ink">{repeatLabel(task.repeatWeekdays)}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold text-inkSoft">任务归属</dt>
            <dd className="text-ink">{childName ?? `${task.childId.slice(0, 8)}…`}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs font-bold text-inkSoft">指定确认人</dt>
            <dd className="break-all text-ink">
              {task.requiresApproval ? reviewerName ?? task.reviewerId ?? '未指定' : '无需确认'}
            </dd>
          </div>
        </dl>
      </Panel>

      {/* 提交状态：待确认 / 退回意见 */}
      {latestCompletion?.status === 'pending' && (
        <Panel className="border-warning/70">
          <p className="text-sm font-bold text-warning">⏳ 已提交，等待确认</p>
          <p className="mt-1 text-xs text-inkSoft">
            提交时间：{new Date(latestCompletion.submittedAt).toLocaleString('zh-CN')}
            {latestCompletion.note ? ` · 说明：${latestCompletion.note}` : ''}
          </p>
        </Panel>
      )}

      {task.status === 'returned' && latestCompletion?.reviewComment && (
        <Panel className="border-danger/60">
          <p className="text-sm font-bold text-danger">退回意见</p>
          <p className="mt-1 text-sm text-ink">{latestCompletion.reviewComment}</p>
        </Panel>
      )}

      {/* 完成确认操作区（仅指定确认人 + pending 时可操作） */}
      {approval && approval.status === 'pending' && (
        <Panel className="border-2 border-ink">
          <p className="text-sm font-extrabold">🛡️ 完成确认</p>
          {approval.canAct ? (
            <div className="mt-3 space-y-2">
              <div className="flex gap-2">
                <Button
                  variant="ok"
                  disabled={busy}
                  onClick={() => {
                    setActionError(null);
                    approveMutation.mutate();
                  }}
                >
                  通过并发奖励
                </Button>
                <Button variant="danger" disabled={busy} onClick={() => setRejecting((v) => !v)}>
                  {rejecting ? '取消驳回' : '驳回'}
                </Button>
              </div>
              {rejecting && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!rejectComment.trim()) {
                      setActionError('驳回必须填写意见');
                      return;
                    }
                    setActionError(null);
                    rejectMutation.mutate(rejectComment.trim());
                  }}
                >
                  <Textarea
                    rows={2}
                    value={rejectComment}
                    onChange={(e) => setRejectComment(e.target.value)}
                    placeholder="说明需要重做的地方（必填）"
                  />
                  <Button type="submit" variant="danger" size="sm" className="mt-2" disabled={busy}>
                    确认驳回
                  </Button>
                </form>
              )}
            </div>
          ) : (
            <p className="mt-1 text-xs text-inkSoft">
              等待指定确认人处理
              {reviewerName ? `（${reviewerName}）` : ''}。
              {task.childId === user?.userId ? '' : ' 你不是该任务的确认人。'}
            </p>
          )}
          {actionError && (
            <p className="mt-2 border-2 border-danger bg-panelLight px-2 py-1 text-sm font-bold text-danger">
              {actionError}
            </p>
          )}
        </Panel>
      )}

      {/* 执行区（孩子） */}
      {isChild && (
        <Panel>
          <div className="flex flex-wrap gap-2">
            {canStart && (
              <Button variant="accent" onClick={() => void changeStatus('start')}>
                <Play className="h-4 w-4" /> 开始
              </Button>
            )}
            {canResume && (
              <Button variant="accent" onClick={() => void changeStatus('resume')}>
                <RotateCcw className="h-4 w-4" /> 重新开始
              </Button>
            )}
            {canSubmit && latestCompletion?.status !== 'pending' && (
              <Link
                to={`/tasks/${task.id}/submit`}
                className="inline-flex items-center gap-2 border-2 border-ink bg-ok px-4 py-2 text-sm font-bold text-white shadow-pixel active:translate-y-1"
              >
                <Send className="h-4 w-4" /> {task.status === 'returned' ? '重新提交' : '提交完成'}
              </Link>
            )}
            {latestCompletion?.status === 'pending' && <p className="text-sm font-bold text-warning">等待确认中…</p>}
            {task.status === 'completed' && <p className="text-sm font-bold text-ok">✅ 已完成</p>}
          </div>
          {actionError && (
            <p className="mt-2 border-2 border-danger bg-panelLight px-2 py-1 text-sm font-bold text-danger">
              {actionError}
            </p>
          )}
        </Panel>
      )}
    </div>
  );
}
