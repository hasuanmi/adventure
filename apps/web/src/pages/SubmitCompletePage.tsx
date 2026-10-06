import { useQuery } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { ApiError } from '../lib/api/client';
import { Button } from '../components/ui/button';
import { Panel, PanelHeader } from '../components/ui/card';
import { Input, Textarea } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Skeleton } from '../components/ui/skeleton';
import { TaskStatusBadge } from '../components/ui/status-badge';
import { tasksApi } from '../lib/api/tasks';

// Submit Complete（无旧项目参考——自研；表单模式参考 §二点七）
const submitSchema = z.object({
  note: z.string().max(2000).optional().or(z.literal('')),
  evidence: z.string().max(2000).optional().or(z.literal('')),
});
type SubmitValues = z.infer<typeof submitSchema>;

export function SubmitCompletePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: string; taskStatus: string; reviewComment?: string | null } | null>(null);

  const taskQuery = useQuery({ queryKey: ['task', id], queryFn: () => tasksApi.get(id) });
  const task = taskQuery.data;

  const form = useForm<SubmitValues>({
    resolver: zodResolver(submitSchema),
    defaultValues: { note: '', evidence: '' },
  });

  async function onSubmit(values: SubmitValues) {
    setSubmitError(null);
    setResult(null);
    try {
      await tasksApi.submitComplete(id, {
        note: values.note || undefined,
        evidenceJson: values.evidence ? { text: values.evidence } : undefined,
      });
      const fresh = await tasksApi.get(id);
      const completions = await tasksApi.completions(id);
      setResult({
        status: fresh.status,
        taskStatus: fresh.status,
        reviewComment: completions[0]?.reviewComment ?? null,
      });
    } catch (e) {
      setSubmitError(e instanceof ApiError ? `${e.reason ?? '错误'}: ${e.message}` : '提交失败');
    }
  }

  if (taskQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!task) {
    return (
      <Panel>
        <p className="text-sm font-bold text-danger">任务不存在</p>
        <Link to="/tasks" className="mt-3 inline-block border-2 border-ink bg-accent px-3 py-1.5 text-sm font-bold text-white shadow-pixel">返回</Link>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <Link to={`/tasks/${id}`} className="inline-flex items-center gap-1 text-sm font-bold text-inkSoft hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> 返回任务
      </Link>

      <Panel>
        <PanelHeader>提交完成</PanelHeader>
        <div className="mb-3 flex items-center gap-2">
          <span className="truncate font-bold">{task.title}</span>
          <TaskStatusBadge status={task.status} />
        </div>

        {task.status === 'completed' ? (
          <p className="text-sm font-bold text-ok">该任务已完成，无需重复提交。</p>
        ) : (
          <>
            {task.requiresApproval && (
              <p className="mb-3 text-xs text-inkSoft">本任务需要人工确认：提交后将进入待审批状态，由指定审核人确认。</p>
            )}
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <Label>完成说明</Label>
                <Textarea rows={3} placeholder="说说你完成了什么…" {...form.register('note')} />
              </div>
              <div>
                <Label>完成凭证（可选）</Label>
                <Input placeholder="凭证描述或链接" {...form.register('evidence')} />
              </div>
              {submitError && <p className="text-sm font-bold text-danger">{submitError}</p>}
              <Button type="submit" variant="ok" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? '提交中…' : '提交完成'}
              </Button>
            </form>
          </>
        )}
      </Panel>

      {/* 提交结果：按真实 API 状态反馈 */}
      {result && (
        <Panel className={result.taskStatus === 'completed' ? 'border-ok' : result.taskStatus === 'returned' ? 'border-danger/60' : ''}>
          {result.taskStatus === 'completed' && <p className="text-sm font-bold text-ok">✅ 任务已完成，成长奖励已发放。</p>}
          {result.taskStatus === 'returned' && (
            <>
              <p className="text-sm font-bold text-danger">❌ 提交被退回</p>
              {result.reviewComment && <p className="mt-1 text-sm text-ink">意见：{result.reviewComment}</p>}
            </>
          )}
          {result.taskStatus !== 'completed' && result.taskStatus !== 'returned' && (
            <p className="text-sm font-bold text-warning">⏳ 已提交，等待审核人确认（待审批）</p>
          )}
          <div className="mt-3 flex gap-2">
            <Link to={`/tasks/${id}`} className="border-2 border-ink bg-accent px-3 py-1.5 text-sm font-bold text-white shadow-pixel">返回任务</Link>
            <button onClick={() => navigate('/tasks')} className="border-2 border-ink bg-panel px-3 py-1.5 text-sm font-bold text-ink">任务列表</button>
          </div>
        </Panel>
      )}
    </div>
  );
}
