import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Panel } from '../components/ui/card';
import { TaskCreateSheet } from '../components/task-create/task-create-sheet';
import { tasksApi } from '../lib/api/tasks';

// Task Create/Edit 路由容器（docs/task-create-and-schedule-review.md §6）
// 独立整页 → 统一 TaskCreateSheet；/tasks/new 与 /tasks/:id/edit 路由保留兼容直达。
export function TaskFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const taskQuery = useQuery({
    queryKey: ['task', id],
    queryFn: () => tasksApi.get(id!),
    enabled: isEdit,
  });

  if (isEdit && taskQuery.isLoading) {
    return <Panel><p className="text-sm text-inkSoft">加载中…</p></Panel>;
  }
  if (isEdit && taskQuery.isError) {
    return (
      <Panel>
        <p className="text-sm font-bold text-danger">
          读取任务失败：{taskQuery.error instanceof Error ? taskQuery.error.message : '未知错误'}
        </p>
        <button
          className="mt-3 border-2 border-ink bg-accent px-3 py-1.5 text-sm font-bold text-white shadow-pixel"
          onClick={() => navigate('/')}
        >
          返回
        </button>
      </Panel>
    );
  }

  // 编辑：保存后回详情；创建（/tasks/new）：保存后进新任务详情
  return (
    <TaskCreateSheet
      open
      task={isEdit ? (taskQuery.data ?? null) : null}
      onClose={() => navigate(isEdit ? `/tasks/${id}` : '/')}
      onSaved={(t) => navigate(`/tasks/${t.id}`)}
    />
  );
}
