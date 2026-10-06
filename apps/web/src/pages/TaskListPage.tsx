import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { TaskDto, TaskStatus } from '@huahua/shared-types';
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
} from '../components/ui/alert-dialog';
import { Badge } from '../components/ui/badge';
import { Empty } from '../components/ui/empty';
import { Panel } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { TaskCard } from '../components/task-card';
import { tasksApi } from '../lib/api/tasks';
import { cn } from '../lib/utils';

const FILTERS: { value: TaskStatus | 'all'; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待开始' },
  { value: 'in_progress', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'returned', label: '已退回' },
];

// Task List（docs/ui-reference.md §4：状态筛选 + TaskCard + 创建入口 + 删除确认）
export function TaskListPage() {
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all');
  const tasksQuery = useQuery({
    queryKey: ['tasks', filter],
    queryFn: () => tasksApi.list(filter === 'all' ? undefined : filter),
  });

  if (tasksQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (tasksQuery.isError) {
    return (
      <Panel>
        <p className="text-sm font-bold text-danger">
          读取任务失败：{tasksQuery.error instanceof Error ? tasksQuery.error.message : '未知错误'}
        </p>
        <button className="mt-3 border-2 border-ink bg-accent px-3 py-1.5 text-sm font-bold text-white shadow-pixel" onClick={() => tasksQuery.refetch()}>
          重试
        </button>
      </Panel>
    );
  }

  const tasks = tasksQuery.data ?? [];

  async function confirmDelete(id: string) {
    try {
      await tasksApi.remove(id);
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除失败');
    }
    await tasksQuery.refetch();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-extrabold tracking-widest">任务</h2>
        <Link to="/tasks/new" className="flex items-center gap-1 border-2 border-ink bg-accent px-3 py-1.5 text-sm font-bold text-white shadow-pixel active:translate-y-1">
          <Plus className="h-4 w-4" /> 新建任务
        </Link>
      </div>

      {/* 状态筛选（v1.2 四态） */}
      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              'border-2 border-ink px-2 py-1 text-xs font-bold',
              filter === f.value ? 'bg-accent text-white shadow-pixel' : 'bg-panel text-ink hover:bg-panelLight',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {tasks.length === 0 ? (
        <Panel>
          <Empty icon="📋" title="暂无任务" description="点击右上角「新建任务」开始" />
        </Panel>
      ) : (
        <div className="space-y-3">
          {tasks.map((task: TaskDto) => (
            <div key={task.id} className="relative">
              <TaskCard task={task} />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center border-2 border-ink bg-panelLight text-inkSoft hover:text-danger"
                    aria-label="删除任务"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>删除任务</AlertDialogTitle>
                    <AlertDialogDescription>
                      <Badge variant="warning">已完成的任务不可删除</Badge>
                      <span className="mt-1 block">确定删除「{task.title}」吗？</span>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction onClick={() => confirmDelete(task.id)}>删除</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
