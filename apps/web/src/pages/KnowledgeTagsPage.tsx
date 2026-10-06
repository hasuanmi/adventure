import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { WRONG_QUESTION_SUBJECTS } from '@huahua/shared-types';
import { Panel } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { WrongQuestionNav } from '../components/wrong-question-nav';
import { knowledgeTagsApi } from '../lib/api/wrong-questions';
import { subjectMeta } from '../lib/constants';

/** 标签管理（对照上游 tags/page.tsx：按学科查看系统标签 + 增删自定义标签） */
export function KnowledgeTagsPage() {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState<string>(WRONG_QUESTION_SUBJECTS[1]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const tagsQuery = useQuery({
    queryKey: ['knowledge-tags', subject],
    queryFn: () => knowledgeTagsApi.list({ subject }),
  });
  /** 标签统计（每个标签挂了多少道错题；上游 /api/tags/stats） */
  const statsQuery = useQuery({
    queryKey: ['knowledge-tags-stats', subject],
    queryFn: () => knowledgeTagsApi.stats(subject),
  });
  const countOf = (id: string): number => statsQuery.data?.find((s) => s.id === id)?.count ?? 0;

  const create = useMutation({
    mutationFn: () => knowledgeTagsApi.create({ name: name.trim(), subject }),
    onSuccess: () => {
      setName('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['knowledge-tags'] });
    },
    onError: () => setError('新建失败：同级已有同名标签'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => knowledgeTagsApi.remove(id),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['knowledge-tags'] });
    },
    onError: () => setError('删除失败：系统标签不可删，或已被错题引用'),
  });

  const system = (tagsQuery.data ?? []).filter((t) => t.isSystem);
  const custom = (tagsQuery.data ?? []).filter((t) => !t.isSystem);

  return (
    <div className="space-y-3">
      <WrongQuestionNav />

      <Panel>
        <p className="text-sm font-extrabold text-ink">标签管理</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {WRONG_QUESTION_SUBJECTS.map((value) => (
            <button
              key={value}
              type="button"
              data-tag-subject={value}
              onClick={() => setSubject(value)}
              className={`border-2 border-ink px-2 py-1 text-xs font-bold shadow-pixel active:translate-y-0.5 ${
                subject === value ? 'bg-accent text-white' : 'bg-panel'
              }`}
            >
              {subjectMeta(value).label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex gap-1.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="新建自定义标签（如：勾股定理）"
            data-new-tag-name
            className="min-w-0 flex-1 border-2 border-ink bg-panelLight px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            data-create-tag
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate()}
            className="border-2 border-ink bg-accent px-3 py-1.5 text-xs font-extrabold text-white shadow-pixel active:translate-y-0.5 disabled:opacity-50"
          >
            新建
          </button>
        </div>
        {error && <p className="mt-2 text-xs font-bold text-danger">{error}</p>}
      </Panel>

      {tagsQuery.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <>
          <Panel>
            <p className="text-xs font-bold text-inkSoft">系统标签（{system.length}）</p>
            <div className="mt-1.5 flex flex-wrap gap-1" data-system-tags>
              {system.length === 0 && <span className="text-[11px] text-inkSoft">该学科暂无系统标签</span>}
              {system.map((tag) => (
                <span
                  key={tag.id}
                  data-tag-count={tag.id}
                  className="border-2 border-ink/40 bg-panelLight px-2 py-0.5 text-[11px] font-bold"
                >
                  {tag.name}
                  {countOf(tag.id) > 0 && <span className="ml-1 text-inkSoft">({countOf(tag.id)})</span>}
                </span>
              ))}
            </div>
          </Panel>

          <Panel>
            <p className="text-xs font-bold text-inkSoft">我的自定义标签（{custom.length}）</p>
            <div className="mt-1.5 space-y-1" data-custom-tags>
              {custom.length === 0 && <span className="text-[11px] text-inkSoft">还没有自定义标签</span>}
              {custom.map((tag) => (
                <div key={tag.id} className="flex items-center gap-2 border-2 border-ink/40 bg-panelLight px-2 py-1">
                  <span className="flex-1 text-xs font-bold text-ink">
                    {tag.name}
                    <span data-tag-count={tag.id} className="ml-1 text-[11px] text-inkSoft">
                      {countOf(tag.id)} 题
                    </span>
                  </span>
                  <button
                    type="button"
                    data-delete-tag={tag.id}
                    onClick={() => remove.mutate(tag.id)}
                    className="inline-flex items-center gap-1 border-2 border-danger px-1.5 py-0.5 text-[11px] font-bold text-danger"
                  >
                    <Trash2 className="h-3 w-3" /> 删除
                  </button>
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
