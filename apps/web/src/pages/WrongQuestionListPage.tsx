import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MASTERY_LABELS, WRONG_QUESTION_SUBJECTS } from '@huahua/shared-types';
import { Badge } from '../components/ui/badge';
import { Panel } from '../components/ui/card';
import { Empty } from '../components/ui/empty';
import { Skeleton } from '../components/ui/skeleton';
import { wrongQuestionsApi } from '../lib/api/wrong-questions';
import { subjectMeta } from '../lib/constants';
import { WrongQuestionNav } from '../components/wrong-question-nav';

const PAGE_SIZE = 18; // 与上游一致

function excerpt(text: string | null, len = 80): string {
  if (!text) return '（无题干文本）';
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > len ? `${flat.slice(0, len)}…` : flat;
}

/**
 * 错题列表（**对照上游 error-list.tsx**）：
 *  · 筛选：关键词 / 学科 / 掌握度 + 分页（默认 18/页，同上游）
 *  · 工具条只有两件事：**批量选择（→ 批量删除）** 与 **导出 / 打印**（跳打印预览页，在那里选题与选内容）
 *  · 按上游设计，数据备份（JSON 导出/导入）与"清空全部"不放在这里（清空属于设置项；备份是数据迁移工具）
 */
export function WrongQuestionListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('');
  const [masteryLevel, setMasteryLevel] = useState<string>('');
  const [page, setPage] = useState(1);
  const [batch, setBatch] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['wrong-questions'] });
    void queryClient.invalidateQueries({ queryKey: ['wrong-question-stats'] });
  };

  const batchDelete = useMutation({
    mutationFn: (ids: string[]) => wrongQuestionsApi.batchDelete(ids),
    onSuccess: () => {
      setSelected([]);
      refresh();
    },
  });

  const query = useQuery({
    queryKey: ['wrong-questions', { search, subject, masteryLevel, page }],
    queryFn: () =>
      wrongQuestionsApi.list({
        search: search || undefined,
        subject: subject || undefined,
        masteryLevel: masteryLevel === '' ? undefined : Number(masteryLevel),
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  const data = query.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <WrongQuestionNav />
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-extrabold tracking-widest">查看错题本</h1>
      </div>

      {/* 工具条（对照上游 error-list：多选 → 批量删除；导出 / 打印 → 打印预览页里选题与选项） */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          data-batch-toggle
          onClick={() => {
            setBatch((b) => !b);
            setSelected([]);
          }}
          className={`border-2 border-ink px-2 py-1 text-xs font-bold shadow-pixel active:translate-y-0.5 ${
            batch ? 'bg-ink text-panelLight' : 'bg-panel'
          }`}
        >
          {batch ? `批量选择中（${selected.length}）` : '批量选择'}
        </button>
        {batch && (
          <>
            <button
              type="button"
              data-select-all
              onClick={() => setSelected(selected.length === (data?.items.length ?? 0) ? [] : (data?.items ?? []).map((i) => i.id))}
              className="border-2 border-ink bg-panel px-2 py-1 text-xs font-bold shadow-pixel"
            >
              {selected.length === (data?.items.length ?? 0) && (data?.items.length ?? 0) > 0 ? '取消全选' : '全选本页'}
            </button>
            <button
              type="button"
              data-batch-delete
              disabled={selected.length === 0 || batchDelete.isPending}
              onClick={() => batchDelete.mutate(selected)}
              className="border-2 border-danger bg-danger/10 px-2 py-1 text-xs font-bold text-danger shadow-pixel active:translate-y-0.5 disabled:opacity-50"
            >
              删除选中（{selected.length}）
            </button>
          </>
        )}
        <button
          type="button"
          data-export
          onClick={() => {
            // 导出 = 打印预览页里选题目 + 选内容 → 打印对话框另存为 PDF（对照上游 error-list 的 handleExportPrint）
            const qs = new URLSearchParams();
            if (subject) qs.set('subject', subject);
            if (masteryLevel !== '') qs.set('masteryLevel', masteryLevel);
            if (search) qs.set('search', search);
            const query = qs.toString();
            navigate(`/learning/wrong-questions/print${query ? `?${query}` : ''}`);
          }}
          className="border-2 border-ink bg-panel px-2 py-1 text-xs font-bold shadow-pixel active:translate-y-0.5"
        >
          导出 / 打印
        </button>
      </div>
      {batchDelete.data && (
        <p data-batch-result className="text-[11px] font-bold text-ok">
          已删除 {batchDelete.data.deleted} 题
        </p>
      )}

      <Panel className="space-y-2">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="搜索题干 / 答案 / 解析 / 错因 / 笔记"
          data-wrong-question-search
          className="w-full border-2 border-ink bg-panelLight px-2 py-1.5 text-sm"
        />
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => {
              setSubject('');
              setPage(1);
            }}
            className={`border-2 border-ink px-2 py-1 text-xs font-bold shadow-pixel active:translate-y-0.5 ${
              subject === '' ? 'bg-accent text-white' : 'bg-panel'
            }`}
          >
            全部学科
          </button>
          {WRONG_QUESTION_SUBJECTS.map((value) => (
            <button
              key={value}
              type="button"
              data-wrong-question-subject={value}
              onClick={() => {
                setSubject(value);
                setPage(1);
              }}
              className={`border-2 border-ink px-2 py-1 text-xs font-bold shadow-pixel active:translate-y-0.5 ${
                subject === value ? 'bg-accent text-white' : 'bg-panel'
              }`}
            >
              {subjectMeta(value).label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[['', '全部掌握度'], ['0', MASTERY_LABELS[0]], ['1', MASTERY_LABELS[1]], ['2', MASTERY_LABELS[2]]].map(
            ([value, label]) => (
              <button
                key={value}
                type="button"
                data-wrong-question-mastery={value}
                onClick={() => {
                  setMasteryLevel(value);
                  setPage(1);
                }}
                className={`border-2 border-ink px-2 py-1 text-xs font-bold shadow-pixel active:translate-y-0.5 ${
                  masteryLevel === value ? 'bg-ok text-white' : 'bg-panel'
                }`}
              >
                {label}
              </button>
            ),
          )}
        </div>
      </Panel>

      {query.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !data || data.items.length === 0 ? (
        <Panel>
          <Empty
            icon="📕"
            title="还没有错题"
            description="点右上角「录入错题」开始建立错题本；复习与掌握标记在详情页"
          />
        </Panel>
      ) : (
        <div className="space-y-3" data-wrong-question-list>
          {data.items.map((item) => {
            const checked = selected.includes(item.id);
            const cardBody = (
              <Panel
                data-wrong-question-card={item.id}
                className={`transition active:translate-y-0.5 ${
                  batch
                    ? checked
                      ? 'border-accent bg-accent/10'
                      : 'hover:bg-panelLight'
                    : 'hover:bg-panelLight'
                }`}
              >
                <div className="flex items-center gap-2">
                  {batch && (
                    <span
                      data-select-card={item.id}
                      className={`grid h-4 w-4 shrink-0 place-items-center border-2 border-ink text-[10px] font-bold ${
                        checked ? 'bg-accent text-white' : 'bg-panelLight'
                      }`}
                    >
                      {checked ? '✓' : ''}
                    </span>
                  )}
                  <span className="text-sm">{subjectMeta(item.subject).emoji}</span>
                  <span className="text-xs font-bold text-inkSoft">{subjectMeta(item.subject).label}</span>
                  <Badge variant={item.masteryLevel === 2 ? 'ok' : item.masteryLevel === 1 ? 'warning' : 'accent'}>
                    {MASTERY_LABELS[item.masteryLevel as 0 | 1 | 2] ?? '新题'}
                  </Badge>
                  {item.reviewCount ? (
                    <span className="text-[11px] text-inkSoft">复习 {item.reviewCount} 次</span>
                  ) : null}
                  <span className="ml-auto text-[11px] text-inkSoft">
                    {new Date(item.createdAt).toLocaleDateString('zh-CN')}
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-bold text-ink">{excerpt(item.questionText)}</p>
                {item.tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {item.tags.slice(0, 6).map((tag) => (
                      <span key={tag.id} className="border border-ink/40 bg-panelLight px-1 text-[10px] text-inkSoft">
                        {tag.name}
                      </span>
                    ))}
                  </div>
                )}
              </Panel>
            );
            // 批量模式下点卡片 = 勾选，不跳转（避免链接里套可点元素）
            return batch ? (
              <button
                key={item.id}
                type="button"
                className="block w-full text-left"
                onClick={() =>
                  setSelected((list) => (checked ? list.filter((x) => x !== item.id) : [...list, item.id]))
                }
              >
                {cardBody}
              </button>
            ) : (
              <Link key={item.id} to={`/learning/wrong-questions/${item.id}`} className="block">
                {cardBody}
              </Link>
            );
          })}
        </div>
      )}

      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="border-2 border-ink bg-panel px-3 py-1 text-xs font-bold shadow-pixel disabled:opacity-50"
          >
            ← 上一页
          </button>
          <span className="text-xs text-inkSoft" data-wrong-question-page>
            第 {data.page}/{totalPages} 页 · 共 {data.total} 题
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="border-2 border-ink bg-panel px-3 py-1 text-xs font-bold shadow-pixel disabled:opacity-50"
          >
            下一页 →
          </button>
        </div>
      )}
    </div>
  );
}
