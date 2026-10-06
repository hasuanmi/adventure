import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
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
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('');
  const [masteryLevel, setMasteryLevel] = useState<string>('');
  const [page, setPage] = useState(1);

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
          {data.items.map((item) => (
            <Link key={item.id} to={`/learning/wrong-questions/${item.id}`} className="block">
              <Panel data-wrong-question-card={item.id} className="transition hover:bg-panelLight active:translate-y-0.5">
                <div className="flex items-center gap-2">
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
            </Link>
          ))}
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
