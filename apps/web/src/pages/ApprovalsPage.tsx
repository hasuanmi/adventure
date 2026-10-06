import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApprovalRequestDto, ApprovalStatus } from '@huahua/shared-types';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Panel, PanelHeader } from '../components/ui/card';
import { Empty } from '../components/ui/empty';
import { Textarea } from '../components/ui/input';
import { Skeleton } from '../components/ui/skeleton';
import { useUser } from '../hooks/use-user';
import { ApiError } from '../lib/api/client';
import { approvalsApi } from '../lib/api/approvals';
import { familyApi } from '../lib/api/family';

type Tab = 'reviewer' | 'applicant';

const STATUS_META: Record<ApprovalStatus, { label: string; variant: 'warning' | 'ok' | 'danger' | 'soft' }> = {
  pending: { label: '待确认', variant: 'warning' },
  approved: { label: '已通过', variant: 'ok' },
  rejected: { label: '已驳回', variant: 'danger' },
  cancelled: { label: '已撤回', variant: 'soft' },
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// 审批（P2 补齐闭环：家长在这里确认孩子的完成提交，替代只能用 curl 的场景）
export function ApprovalsPage() {
  const user = useUser();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('reviewer');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ['approvals', tab],
    queryFn: () => approvalsApi.list(tab === 'reviewer' ? { as: 'reviewer' } : { as: 'applicant' }),
  });
  const familyQuery = useQuery({ queryKey: ['family'], queryFn: () => familyApi.me() });

  const nameOf = (id: string): string => {
    const member = familyQuery.data?.members.find((m) => m.id === id);
    return member ? member.username : `${id.slice(0, 8)}…`;
  };

  async function afterDecision(): Promise<void> {
    setRejectingId(null);
    setRejectComment('');
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['approvals'] }),
      queryClient.invalidateQueries({ queryKey: ['tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['task'] }),
      queryClient.invalidateQueries({ queryKey: ['completions'] }),
    ]);
  }

  const approveMutation = useMutation({
    mutationFn: (id: string) => approvalsApi.approve(id),
    onSuccess: afterDecision,
    onError: (err) => setActionError(err instanceof ApiError ? `${err.reason ?? '错误'}：${err.message}` : '操作失败'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) => approvalsApi.reject(id, comment),
    onSuccess: afterDecision,
    onError: (err) => setActionError(err instanceof ApiError ? `${err.reason ?? '错误'}：${err.message}` : '操作失败'),
  });

  const busy = approveMutation.isPending || rejectMutation.isPending;
  const rows = listQuery.data ?? [];
  const pendingRows = rows.filter((row) => row.status === 'pending');

  const tabClass = (active: boolean) =>
    `flex-1 border-2 border-ink px-3 py-2 text-sm font-extrabold shadow-pixel transition active:translate-y-1 ${
      active ? 'bg-accent text-white' : 'bg-panel text-ink'
    }`;

  function renderRow(row: ApprovalRequestDto) {
    const meta = STATUS_META[row.status] ?? { label: row.status, variant: 'soft' as const };
    const isRejecting = rejectingId === row.id;
    return (
      <Panel key={row.id} className={row.status === 'pending' ? 'border-warning/70' : undefined}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-bold text-ink">{row.descriptor?.label ?? '任务完成确认'}</p>
            <p className="mt-0.5 text-xs text-inkSoft">
              {tab === 'reviewer' ? `申请人：${nameOf(row.applicantId)}` : `确认人：${nameOf(row.reviewerId)}`}
              {' · '}
              {formatTime(row.createdAt)}
            </p>
          </div>
          <Badge variant={meta.variant}>{meta.label}</Badge>
        </div>

        {row.comment && (
          <p className="mt-2 border-2 border-ink/30 bg-panelLight px-2 py-1 text-xs text-ink">
            {row.status === 'rejected' ? '驳回意见：' : '意见/备注：'}
            {row.comment}
          </p>
        )}

        {row.descriptor?.taskId && (
          <Link to={`/tasks/${row.descriptor.taskId}`} className="mt-2 inline-block text-xs font-bold text-accent underline">
            查看任务详情 →
          </Link>
        )}

        {row.status === 'pending' && row.canAct && (
          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ok"
                disabled={busy}
                onClick={() => {
                  setActionError(null);
                  approveMutation.mutate(row.id);
                }}
              >
                同意
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={() => {
                  setActionError(null);
                  setRejectingId(isRejecting ? null : row.id);
                  setRejectComment('');
                }}
              >
                {isRejecting ? '取消驳回' : '驳回'}
              </Button>
            </div>
            {isRejecting && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!rejectComment.trim()) {
                    setActionError('驳回必须填写意见');
                    return;
                  }
                  setActionError(null);
                  rejectMutation.mutate({ id: row.id, comment: rejectComment.trim() });
                }}
              >
                <Textarea
                  rows={2}
                  value={rejectComment}
                  onChange={(e) => setRejectComment(e.target.value)}
                  placeholder="说明需要重做的地方（必填）"
                />
                <Button type="submit" size="sm" variant="danger" className="mt-2" disabled={busy}>
                  确认驳回
                </Button>
              </form>
            )}
          </div>
        )}

        {row.status === 'pending' && !row.canAct && (
          <p className="mt-2 text-xs text-inkSoft">等待指定确认人处理。</p>
        )}
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader>🛡️ 完成确认</PanelHeader>
        <p className="text-sm text-inkSoft">
          孩子提交完成后，会进入这里等待<strong>指定确认人</strong>通过或驳回；通过后自动发放成长奖励。
        </p>
        {user?.role === 'child' && (
          <p className="mt-2 text-xs text-inkSoft">你可以在「我的申请」里看到自己提交的确认进度。</p>
        )}
      </Panel>

      <div className="flex gap-2">
        <button type="button" className={tabClass(tab === 'reviewer')} onClick={() => setTab('reviewer')}>
          待我确认{tab === 'reviewer' && pendingRows.length > 0 ? `（${pendingRows.length}）` : ''}
        </button>
        <button type="button" className={tabClass(tab === 'applicant')} onClick={() => setTab('applicant')}>
          我的申请
        </button>
      </div>

      {actionError && (
        <p className="border-2 border-danger bg-panelLight px-2 py-1 text-sm font-bold text-danger">{actionError}</p>
      )}

      {listQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : listQuery.isError ? (
        <Panel>
          <p className="text-sm font-bold text-danger">
            读取失败：{listQuery.error instanceof Error ? listQuery.error.message : '未知错误'}
          </p>
          <Button className="mt-3" onClick={() => void listQuery.refetch()}>
            重试
          </Button>
        </Panel>
      ) : rows.length === 0 ? (
        <Panel>
          <Empty
            icon="🛡️"
            title={tab === 'reviewer' ? '没有需要你确认的提交' : '你还没有提交过完成确认'}
            description={tab === 'reviewer' ? '孩子提交后会自动出现在这里' : '去今日页完成一个任务试试'}
          />
        </Panel>
      ) : (
        <div className="space-y-3">{rows.map(renderRow)}</div>
      )}

      <Link to="/" className="inline-block text-sm font-bold text-inkSoft hover:text-ink">
        ← 返回今日
      </Link>
    </div>
  );
}
