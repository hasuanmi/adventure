import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
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

/** 错题列表（对照上游错题列表：关键词/学科/掌握度筛选 + 分页；后续批加统计与图片缩略图） */
export function WrongQuestionListPage() {
  const queryClient = useQueryClient();
  const importInput = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('');
  const [masteryLevel, setMasteryLevel] = useState<string>('');
  const [page, setPage] = useState(1);
  const [batch, setBatch] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);
  const [imported, setImported] = useState<{ imported: number; skipped: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
    onError: () => setNotice('批量删除失败'),
  });
  const clearAll = useMutation({
    mutationFn: () => wrongQuestionsApi.clear(),
    onSuccess: () => {
      setSelected([]);
      refresh();
    },
    onError: () => setNotice('清空失败'),
  });

  /** 导出备份：前端生成 JSON 文件下载（上游 /api/export 同构） */
  const onExport = async (): Promise<void> => {
    try {
      const data = await wrongQuestionsApi.exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wrong-questions-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice(`已导出 ${data.questions.length} 题`);
    } catch {
      setNotice('导出失败');
    }
  };

  /** 导入备份（后端按题干去重，重复的跳过） */
  const onImport = async (file: File): Promise<void> => {
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as { version?: number; questions?: unknown[] };
      const result = await wrongQuestionsApi.importAll({
        version: payload.version ?? 1,
        questions: payload.questions ?? [],
      });
      setImported(result);
      setNotice(null);
      refresh();
    } catch {
      setNotice('导入失败：请选择本应用导出的 JSON 备份文件');
    }
  };

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
        <Link
          to="/learning/wrong-questions/new"
          data-wrong-question-new
          className="inline-flex items-center gap-1 border-2 border-ink bg-accent px-3 py-1.5 text-xs font-extrabold text-white shadow-pixel active:translate-y-0.5"
        >
          <Plus className="h-3.5 w-3.5" /> 上传新题
        </Link>
      </div>

      {/* 工具条：批量选择 / 导出 / 导入 / 清空（对照上游 batch-delete、clear、export、import） */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          data-batch-toggle
          onClick={() => {
            setBatch((b) => !b);
            setSelected([]);
            setConfirmClear(false);
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
          onClick={() => void onExport()}
          className="border-2 border-ink bg-panel px-2 py-1 text-xs font-bold shadow-pixel active:translate-y-0.5"
        >
          导出备份
        </button>
        <button
          type="button"
          data-import
          onClick={() => importInput.current?.click()}
          className="border-2 border-ink bg-panel px-2 py-1 text-xs font-bold shadow-pixel active:translate-y-0.5"
        >
          导入备份
        </button>
        <input
          ref={importInput}
          type="file"
          accept="application/json,.json"
          data-import-input
          className="hidden"
          onChange={(e) => {
            const picked = e.target.files?.[0];
            if (picked) void onImport(picked);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          data-clear-all
          onClick={() => {
            if (!confirmClear) {
              setConfirmClear(true);
              return;
            }
            setConfirmClear(false);
            clearAll.mutate();
          }}
          className={`border-2 border-danger px-2 py-1 text-xs font-bold shadow-pixel active:translate-y-0.5 ${
            confirmClear ? 'bg-danger text-white' : 'bg-danger/10 text-danger'
          }`}
        >
          {confirmClear ? '再点一次确认清空全部' : '清空全部'}
        </button>
      </div>
      {(batchDelete.data || clearAll.data || imported || notice) && (
        <p data-batch-result className="text-[11px] font-bold text-ok">
          {batchDelete.data && `已删除 ${batchDelete.data.deleted} 题 · `}
          {clearAll.data && `已清空 ${clearAll.data.deleted} 题 · `}
          {imported && `导入 ${imported.imported} 题（跳过重复 ${imported.skipped} 题）`}
          {notice && <span className="text-inkSoft">{notice}</span>}
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
