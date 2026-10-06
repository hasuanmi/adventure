import { useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { findOverlaps, type CreateTaskRequest, type TaskDto } from '@huahua/shared-types';
import { ApiError } from '../../lib/api/client';
import { familyApi } from '../../lib/api/family';
import { tasksApi } from '../../lib/api/tasks';
import { rewardProfilesApi } from '../../lib/api/reward-profiles';
import { taskFormSchema, type TaskFormValues } from '../../lib/task-form-schema';
import { toDateInputValue, toLocalInputValue, defaultTaskSlot, endAtFromStart } from '../../lib/schedule';
import {
  rewardProfileIconUrl,
} from '../../lib/quest-icons';
import { TASK_ICONS } from '../../lib/task-icons';
import { useUser } from '../../hooks/use-user';
import { COLOR_PRESETS, PRIORITY_OPTIONS, SUBJECT_OPTIONS, WEEKDAY_REPEAT_OPTIONS } from '../../lib/constants';
import { cn } from '../../lib/utils';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../ui/sheet';
import { Button } from '../ui/button';
import { Input, Textarea } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

// 统一 Task Create Sheet（docs/task-create-and-schedule-review.md §6）
// 创建/编辑二合一（task===null 即创建）；Today / Schedule / 时间格 / 路由全部走此组件；
// 4 分组：任务信息 / 时间安排 / 任务设置 / 完成确认；字段严格对齐 Task DTO（不新增）。

export interface TaskCreateSheetProps {
  open: boolean;
  /** null = 创建；非 null = 编辑 */
  task: TaskDto | null;
  /** 创建预填：开始时间（Schedule 时间格点击传入；YYYY-MM-DDTHH:mm 本地） */
  defaultStartAt?: string;
  onClose: () => void;
  /** 保存成功后（不传则仅关闭；传则接管跳转） */
  onSaved?: (task: TaskDto) => void;
}

export function TaskCreateSheet({ open, task, defaultStartAt, onClose, onSaved }: TaskCreateSheetProps) {
  // 切换目标（另一任务 / 创建模式）时强制重建表单，避免脏状态串页
  const identity = task?.id ?? '__create__';
  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent>
        <TaskCreateSheetForm
          key={identity}
          task={task}
          defaultStartAt={defaultStartAt}
          onClose={onClose}
          onSaved={onSaved}
        />
      </SheetContent>
    </Sheet>
  );
}

function TaskCreateSheetForm({
  task,
  defaultStartAt,
  onClose,
  onSaved,
}: {
  task: TaskDto | null;
  defaultStartAt?: string;
  onClose: () => void;
  onSaved?: (task: TaskDto) => void;
}) {
  const isEdit = task !== null;
  const user = useUser();
  const isParent = user?.role === 'parent';
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const profilesQuery = useQuery({ queryKey: ['reward-profiles'], queryFn: () => rewardProfilesApi.list() });
  // 家庭成员（P2 家庭入口）：替代手填 user uuid 作为审核人/孩子
  const familyQuery = useQuery({ queryKey: ['family'], queryFn: () => familyApi.me() });

  // 新建时的默认时段：点日程时间格 → 所点时刻 + 1 小时；否则「今天 · 下一个整点起 1 小时」
  const createSlot = defaultStartAt
    ? { startAt: defaultStartAt, endAt: endAtFromStart(defaultStartAt) }
    : defaultTaskSlot();

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: isEdit && task
      ? {
          title: task.title,
          description: task.description ?? '',
          subject: task.subject ?? '',
          priority: task.priority,
          // 编辑预填用本地时间（避免 toISOString 的 UTC 偏移显示错误时间）
          startAt: task.startAt ? toLocalInputValue(new Date(task.startAt)) : '',
          endAt: task.endAt ? toLocalInputValue(new Date(task.endAt)) : '',
          dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
          estimatedMinutes: task.estimatedMinutes ?? '',
          color: task.color ?? '',
          icon: task.icon ?? '',
          repeatWeekdays: task.repeatWeekdays ?? 0,
          requiresApproval: task.requiresApproval,
          reviewerId: task.reviewerId ?? '',
          rewardProfile: task.rewardProfile ?? '',
          childId: task.childId,
        }
      : {
          // 创建默认：截止日期统一今天（用户确认 #2；不随 Schedule 选中日期变化）
          // 开始/结束时间默认「今天 + 下一个整点起 1 小时」（用户要求：默认今天、可修改）
          // —— 这样新建任务默认就出现在日程上；点日程时间格创建时沿用所点时刻 + 1 小时。
          title: '',
          description: '',
          subject: '',
          priority: 0,
          startAt: createSlot.startAt,
          endAt: createSlot.endAt,
          dueDate: toDateInputValue(new Date()),
          estimatedMinutes: '',
          color: '',
          icon: '',
          repeatWeekdays: 0,
          requiresApproval: false,
          reviewerId: '',
          rewardProfile: 'TYPE_DAILY',
          childId: '',
        },
  });

  // 切换编辑对象/创建模式时清空提交错误
  useEffect(() => setSubmitError(null), [task?.id]);

  const profiles = profilesQuery.data?.profiles ?? [];
  const members = familyQuery.data?.members ?? [];
  const parentOptions = members.filter((m) => m.role === 'parent' || m.role === 'teacher');
  const childOptions = members.filter((m) => m.role === 'child');
  const hasFamily = Boolean(familyQuery.data?.familyId);

  // 唯一的候选自动预选（减少无意义的手动选择；依赖用稳定标量避免每次渲染都执行）
  const singleChildId = childOptions.length === 1 ? childOptions[0].id : null;
  const singleParentId = parentOptions.length === 1 ? parentOptions[0].id : null;
  useEffect(() => {
    if (isEdit || !hasFamily) return;
    if (!form.getValues('childId') && singleChildId) form.setValue('childId', singleChildId);
    if (!form.getValues('reviewerId') && singleParentId) form.setValue('reviewerId', singleParentId);
  }, [isEdit, hasFamily, singleChildId, singleParentId, form]);

  
  // 时间冲突提示：与"该孩子当天已有任务"比对（纯函数 findOverlaps 来自 shared-types，Mobile 可复用）。
  // 产品决策：**允许重叠**（家庭场景常见），所以这里只提示、不阻止保存；日程页会并排显示并标冲突。
  const tasksQuery = useQuery({ queryKey: ['tasks'], queryFn: () => tasksApi.list() });
  const startAtValue = form.watch('startAt');
  const endAtValue = form.watch('endAt');
  const childIdValue = form.watch('childId');
  const conflicts = useMemo<{ id: string; start: number; end: number; title?: string }[]>(() => {
    if (!startAtValue) return [];
    const start = new Date(startAtValue);
    if (Number.isNaN(start.getTime())) return [];
    const end = endAtValue ? new Date(endAtValue) : new Date(start.getTime() + 30 * 60_000);
    if (Number.isNaN(end.getTime())) return [];
    const targetChildId = isParent ? childIdValue : user?.userId;
    if (!targetChildId) return [];
    const sameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const minutes = (d: Date) => d.getHours() * 60 + d.getMinutes();
    const candidates = (tasksQuery.data ?? [])
      .filter(
        (t) =>
          t.id !== task?.id &&
          t.status !== 'completed' &&
          t.childId === targetChildId &&
          Boolean(t.startAt) &&
          sameDay(new Date(t.startAt as string), start),
      )
      .map((t) => {
        const s = new Date(t.startAt as string);
        const e = t.endAt ? new Date(t.endAt) : new Date(s.getTime() + 30 * 60_000);
        return { id: t.id, start: minutes(s), end: Math.max(minutes(e), minutes(s) + 15), title: t.title };
      });
    return findOverlaps({ start: minutes(start), end: Math.max(minutes(end), minutes(start) + 15) }, candidates);
  }, [startAtValue, endAtValue, childIdValue, isParent, user?.userId, tasksQuery.data, task?.id]);

  function onSubmit(values: TaskFormValues): void {
    void doSubmit(values);
  }

  async function doSubmit(values: TaskFormValues) {
    setSubmitError(null);
    // 结束时间需晚于开始时间（客户端预检；服务端同规则）
    if (values.startAt && values.endAt && new Date(values.endAt).getTime() <= new Date(values.startAt).getTime()) {
      setSubmitError('结束时间需晚于开始时间');
      return;
    }
    // 需人工确认时必须选到具体确认人（服务端同规则，避免无谓的 400 往返）
    if (values.requiresApproval && !values.reviewerId) {
      setSubmitError('需要人工确认时必须选择确认人');
      return;
    }
    // 家长创建任务必须指定归属孩子
    if (isParent && !values.childId) {
      setSubmitError('请选择任务归属的孩子');
      return;
    }
    const requiresApproval = values.requiresApproval;
    const estimatedMinutes =
      typeof values.estimatedMinutes === 'number' && Number.isFinite(values.estimatedMinutes)
        ? values.estimatedMinutes
        : undefined;
    const repeatWeekdays = values.repeatWeekdays || undefined;
    const body = {
      title: values.title,
      description: values.description || undefined,
      subject: values.subject || undefined,
      priority: values.priority,
      startAt: values.startAt ? new Date(values.startAt).toISOString() : undefined,
      endAt: values.endAt ? new Date(values.endAt).toISOString() : (isEdit ? null : undefined),
      dueDate: values.dueDate ? new Date(values.dueDate).toISOString() : undefined,
      estimatedMinutes: isEdit ? (estimatedMinutes ?? null) : estimatedMinutes,
      color: isEdit ? (values.color || null) : (values.color || undefined),
      // 图标：编辑态传空串=清空（服务端映射为 NULL → 中性默认图标）
      icon: isEdit ? (values.icon || '') : (values.icon || undefined),
      repeatWeekdays: isEdit ? (repeatWeekdays ?? null) : repeatWeekdays,
      requiresApproval,
      reviewerId: requiresApproval ? (values.reviewerId || undefined) : undefined,
      rewardProfile: values.rewardProfile || undefined,
      childId: isParent ? (values.childId || undefined) : undefined,
    };
    try {
      // create 分支运行时不会发送 null（编辑清空语义只在 update 生效），此处仅作类型收敛
      const saved = isEdit && task
        ? await tasksApi.update(task.id, body)
        : await tasksApi.create(body as CreateTaskRequest);
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      if (isEdit && task) await queryClient.invalidateQueries({ queryKey: ['task', task.id] });
      if (onSaved) onSaved(saved);
      else onClose();
    } catch (e) {
      setSubmitError(e instanceof ApiError ? `${e.reason ?? '错误'}: ${e.message}` : '保存失败');
    }
  }

  const titleValue = form.watch('title');
  const requiresApproval = form.watch('requiresApproval');

  return (
    <div className="space-y-5">
      <SheetHeader>
        <SheetTitle>{isEdit ? '编辑任务' : '新建任务'}</SheetTitle>
        <SheetDescription>
        </SheetDescription>
      </SheetHeader>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        {/* 任务信息 */}
        <section>
          <GroupLabel>任务信息</GroupLabel>
          <div className="space-y-3">
            <div>
              <Label>标题 *</Label>
              <Input placeholder="任务名称" {...form.register('title')} />
              {form.formState.errors.title && <p className="mt-1 text-xs text-danger">{form.formState.errors.title.message}</p>}
            </div>
            <div>
              <Label>完成标准 / 说明</Label>
              <Textarea
                rows={3}
                placeholder="例：做完 20 道口算并自查；或写下要求与提示"
                {...form.register('description')}
              />
            </div>
            <div>
              <Label>学科</Label>
              <Select value={form.watch('subject')} onValueChange={(v) => form.setValue('subject', v)}>
                <SelectTrigger><SelectValue placeholder="选择学科" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">未分类</SelectItem>
                  {SUBJECT_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {/* 时间安排 */}
        <section>
          <div className="flex items-end justify-between gap-2">
            <GroupLabel className="flex-1">时间安排</GroupLabel>
            <button
              type="button"
              onClick={() => {
                form.setValue('startAt', '');
                form.setValue('endAt', '');
              }}
              className="mb-2 shrink-0 border-2 border-ink/40 bg-panelLight px-2 py-0.5 text-[11px] font-bold text-inkSoft hover:text-ink"
              title="清空时间后该任务不进日程，只出现在今日待办"
            >
              清除时间（不排入日程）
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>开始时间</Label>
              <Input type="datetime-local" {...form.register('startAt')} />
            </div>
            <div>
              <Label>结束时间</Label>
              <Input type="datetime-local" {...form.register('endAt')} />
            </div>
            <div>
              <Label>预计用时（分钟）</Label>
              <Input type="number" min={1} max={1440} placeholder="如 30" {...form.register('estimatedMinutes', { valueAsNumber: true })} />
            </div>
            <div>
              <Label>截止日期</Label>
              <Input type="date" {...form.register('dueDate')} />
            </div>
          </div>
          {conflicts.length > 0 && (
            <div
              data-conflict-warning
              className="mt-2 border-2 border-danger bg-danger/10 px-2 py-1.5"
            >
              <p className="text-xs font-extrabold text-danger">
                ⚠️ 时间冲突：该时段已有 {conflicts.length} 个任务
              </p>
              <ul className="mt-0.5 space-y-0.5">
                {conflicts.map((c) => (
                  <li key={c.id} className="text-xs text-ink">
                    · {c.title}（{String(Math.floor(c.start / 60)).padStart(2, '0')}:
                    {String(c.start % 60).padStart(2, '0')}–
                    {String(Math.floor(c.end / 60)).padStart(2, '0')}:{String(c.end % 60).padStart(2, '0')}）
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-inkSoft">仍可保存；两个任务会在日程上并排显示并标记冲突。</p>
            </div>
          )}
        </section>

        {/* 任务设置 */}
        <section>
          <GroupLabel>任务设置</GroupLabel>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>优先级</Label>
              <Select value={String(form.watch('priority'))} onValueChange={(v) => form.setValue('priority', Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={String(p.value)}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>任务类型</Label>
              <Select
                value={form.watch('rewardProfile') || 'TYPE_DAILY'}
                onValueChange={(v) => form.setValue('rewardProfile', v)}
              >
                <SelectTrigger>
                  <span className="flex items-center gap-2">
                    <img
                      src={rewardProfileIconUrl(form.watch('rewardProfile') || 'TYPE_DAILY')}
                      alt=""
                      aria-hidden
                      className="h-5 w-5 [image-rendering:pixelated]"
                    />
                    <SelectValue />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.code} value={p.code}>
                      <span className="flex items-center gap-2">
                        <img
                          src={rewardProfileIconUrl(p.code)}
                          alt=""
                          aria-hidden
                          className="h-4 w-4 [image-rendering:pixelated]"
                        />
                        {p.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 图标（来自素材库，每个任务自选；不选则按任务类型给出图标） */}
          <div className="mt-3">
            <Label>图标（可选，来自像素素材库）</Label>
            <div className="mt-1 flex flex-wrap gap-1.5 rounded border-2 border-dashed border-ink/30 p-2">
              <button
                type="button"
                data-icon-option=""
                aria-pressed={!form.watch('icon')}
                onClick={() => form.setValue('icon', '')}
                className={cn(
                  'grid h-11 w-11 place-items-center border-2 text-[10px] font-bold',
                  !form.watch('icon') ? 'border-accent bg-panelLight text-accent' : 'border-ink/30 bg-panel text-inkSoft',
                )}
                title="不指定（按任务类型自动显示）"
              >
                自动
              </button>
              {TASK_ICONS.map((icon) => {
                const active = form.watch('icon') === icon.key;
                return (
                  <button
                    key={icon.key}
                    type="button"
                    data-icon-option={icon.key}
                    aria-pressed={active}
                    aria-label={`选择图标 ${icon.label}`}
                    title={icon.label}
                    onClick={() => form.setValue('icon', active ? '' : icon.key)}
                    className={cn(
                      'grid h-11 w-11 place-items-center border-2 transition active:translate-y-0.5',
                      active ? 'border-accent bg-panelLight ring-2 ring-accent' : 'border-ink/40 bg-panel hover:bg-panelLight',
                    )}
                  >
                    <img src={`/icons/${icon.key}.png`} alt={icon.label} className="h-8 w-8 [image-rendering:pixelated]" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* 颜色（8 预设色块，huahuastudy 样式；日程/卡片用色） */}
          <div className="mt-3">
            <Label>颜色（可选）</Label>
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((c) => {
                const active = form.watch('color') === c;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-label={`选择颜色 ${c}`}
                    aria-pressed={active}
                    onClick={() => form.setValue('color', active ? '' : c)}
                    className={cn(
                      'h-8 w-8 border-2 transition active:translate-y-0.5',
                      active ? 'border-ink shadow-pixel' : 'border-ink/30',
                    )}
                    style={{ background: c }}
                  />
                );
              })}
            </div>
          </div>

          {/* 重复（默认不重复；可勾选每周一~日，仅日程展示层展开） */}
          <div className="mt-3">
            <Label>重复（默认不重复）</Label>
            <div className="flex flex-wrap gap-1">
              {WEEKDAY_REPEAT_OPTIONS.map((w) => {
                const active = (form.watch('repeatWeekdays') & w.bit) !== 0;
                return (
                  <button
                    key={w.bit}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      form.setValue('repeatWeekdays', active ? form.watch('repeatWeekdays') & ~w.bit : form.watch('repeatWeekdays') | w.bit)
                    }
                    className={cn(
                      'border-2 px-2 py-1.5 text-xs font-extrabold transition active:translate-y-0.5',
                      active ? 'border-ink bg-accent text-white shadow-pixel' : 'border-ink/40 bg-panelLight text-inkSoft',
                    )}
                  >
                    {w.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* 完成确认 */}
        <section>
          <GroupLabel>完成确认</GroupLabel>
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" className="h-4 w-4 accent-[#e38628]" {...form.register('requiresApproval')} />
              需要人工确认
            </label>

            {!hasFamily && (
              <p className="border-2 border-warning/70 bg-panelLight px-2 py-1 text-xs text-inkSoft">
                你还没有加入家庭，无法选择成员。<Link to="/family" className="font-bold text-accent underline">先去家庭设置</Link>
                （届时家长可创建家庭、孩子用家长用户名加入）。
              </p>
            )}

            {requiresApproval && (
              <div>
                <Label>指定确认人 *</Label>
                <Select
                  value={form.watch('reviewerId') || ''}
                  onValueChange={(v) => form.setValue('reviewerId', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={parentOptions.length ? '选择家长' : '家庭内暂无家长'} />
                  </SelectTrigger>
                  <SelectContent>
                    {parentOptions.length === 0 ? (
                      <SelectItem value="">家庭内暂无家长</SelectItem>
                    ) : (
                      parentOptions.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.username}
                          {m.isSelf ? '（我）' : ''}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-inkSoft">仅该确认人可通过/驳回；这一条由后端强制，不能自审。</p>
              </div>
            )}

            {isParent && (
              <div>
                <Label>任务归属孩子 *</Label>
                <Select value={form.watch('childId') || ''} onValueChange={(v) => form.setValue('childId', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={childOptions.length ? '选择孩子' : '家庭内暂无孩子账号'} />
                  </SelectTrigger>
                  <SelectContent>
                    {childOptions.length === 0 ? (
                      <SelectItem value="">家庭内暂无孩子账号</SelectItem>
                    ) : (
                      childOptions.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.username}
                          {m.isSelf ? '（我）' : ''}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-inkSoft">孩子账号创建任务时自动归属自己，无需选择。</p>
              </div>
            )}
          </div>
        </section>

        {submitError && <p className="text-sm font-bold text-danger">{submitError}</p>}

        <div className="flex gap-2">
          <Button type="submit" disabled={form.formState.isSubmitting || !titleValue.trim()}>
            {form.formState.isSubmitting ? '保存中…' : isEdit ? '保存更改' : '创建任务'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>取消</Button>
        </div>
      </form>
    </div>
  );
}

function GroupLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'mb-2 border-b-2 border-dashed border-ink/40 pb-1 text-xs font-extrabold tracking-widest text-inkSoft',
        className,
      )}
    >
      {children}
    </div>
  );
}
