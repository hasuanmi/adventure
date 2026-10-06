import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Sparkles } from 'lucide-react';
import { PRACTICE_DIFFICULTY_LABELS, SimilarQuestionDto } from '@huahua/shared-types';
import { Panel } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { WrongQuestionNav } from '../components/wrong-question-nav';
import { aiApi } from '../lib/api/ai';
import { practiceApi } from '../lib/api/practice';
import { wrongQuestionsApi } from '../lib/api/wrong-questions';
import { subjectMeta } from '../lib/constants';

/**
 * 练习（对照上游 practice/page.tsx + /api/practice/generate + /api/practice/record + /api/stats/practice）：
 *  选一道错题 → AI 生成同知识点相似题 → 逐题标记"会了 / 还没会"（写入练习记录）→ 练习统计。
 */
export function WrongQuestionPracticePage() {
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const [questionId, setQuestionId] = useState(params.get('id') ?? '');
  const [count, setCount] = useState(3);
  const [items, setItems] = useState<SimilarQuestionDto[]>([]);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ['wrong-questions', 'practice-picker'],
    queryFn: () => wrongQuestionsApi.list({ page: 1, pageSize: 50 }),
  });
  const statsQuery = useQuery({ queryKey: ['practice-stats'], queryFn: () => practiceApi.stats() });
  const aiStatus = useQuery({ queryKey: ['ai', 'status'], queryFn: () => aiApi.status() });

  const generate = useMutation({
    mutationFn: () => {
      const source = (listQuery.data?.items ?? []).find((q) => q.id === questionId);
      return aiApi.similar({
        questionText: source?.questionText ?? '',
        subject: source?.subject ?? null,
        count,
      });
    },
    onSuccess: (result) => {
      setError(null);
      setItems(result.items);
      setRevealed({});
      if (result.items.length === 0) setError('AI 没生成出题目，稍后再试或换一道题');
    },
    onError: (err) =>
      setError(
        err instanceof Error && err.message.includes('ai_not_configured')
          ? 'AI 未配置：无法生成相似题'
          : '生成失败，请稍后再试',
      ),
  });

  const record = useMutation({
    mutationFn: (payload: { isCorrect: boolean; subject: string | null; difficulty: string }) =>
      practiceApi.record(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['practice-stats'] });
    },
  });

  const clearStats = useMutation({
    mutationFn: () => practiceApi.clear(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['practice-stats'] }),
  });

  const source = (listQuery.data?.items ?? []).find((q) => q.id === questionId);
  const s = statsQuery.data;

  return (
    <div className="space-y-3">
      <WrongQuestionNav />

      <Panel className="space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <p className="text-sm font-extrabold text-ink">相似题练习</p>
          {!aiStatus.data?.configured && <span className="text-[11px] font-bold text-warning">AI 未配置</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            data-practice-question
            value={questionId}
            onChange={(e) => setQuestionId(e.target.value)}
            className="min-w-0 flex-1 border-2 border-ink bg-panelLight px-2 py-1.5 text-xs"
          >
            <option value="">选择一道错题…</option>
            {(listQuery.data?.items ?? []).map((q) => (
              <option key={q.id} value={q.id}>
                {subjectMeta(q.subject).label} · {(q.questionText ?? '').slice(0, 30)}
              </option>
            ))}
          </select>
          <select
            data-practice-count
            value={String(count)}
            onChange={(e) => setCount(Number(e.target.value))}
            className="border-2 border-ink bg-panelLight px-2 py-1.5 text-xs"
          >
            {[3, 5, 10].map((n) => (
              <option key={n} value={n}>
                {n} 道
              </option>
            ))}
          </select>
          <button
            type="button"
            data-generate-similar
            disabled={!questionId || generate.isPending || !aiStatus.data?.configured}
            onClick={() => generate.mutate()}
            className="inline-flex items-center gap-1.5 border-2 border-ink bg-accent px-3 py-1.5 text-xs font-extrabold text-white shadow-pixel active:translate-y-0.5 disabled:opacity-50"
          >
            {generate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {generate.isPending ? '生成中…' : '生成相似题'}
          </button>
        </div>
        {source && (
          <p className="text-[11px] text-inkSoft">
            原题：{(source.questionText ?? '').slice(0, 80)}
          </p>
        )}
        {error && (
          <p data-practice-error className="text-xs font-bold text-danger">
            {error}
          </p>
        )}
      </Panel>

      {items.length > 0 && (
        <Panel className="space-y-3" data-similar-list>
          <p className="text-xs font-extrabold text-ink">生成的相似题（{items.length} 道）</p>
          {items.map((item, index) => (
            <div key={index} data-similar-item className="border-2 border-ink/40 bg-panelLight p-2">
              <p className="text-sm font-bold text-ink">
                {index + 1}. {item.question}
              </p>
              {revealed[index] ? (
                <div className="mt-1">
                  {item.hint && <p className="text-[11px] text-inkSoft">提示：{item.hint}</p>}
                  {item.answer && <p className="text-sm text-ok">答案：{item.answer}</p>}
                </div>
              ) : (
                <button
                  type="button"
                  data-reveal-answer={index}
                  onClick={() => setRevealed((r) => ({ ...r, [index]: true }))}
                  className="mt-1 border-2 border-ink bg-panel px-2 py-0.5 text-[11px] font-bold"
                >
                  显示答案
                </button>
              )}
              <div className="mt-1.5 flex gap-1.5">
                <button
                  type="button"
                  data-practice-correct={index}
                  onClick={() =>
                    record.mutate({ isCorrect: true, subject: source?.subject ?? null, difficulty: 'medium' })
                  }
                  className="border-2 border-ink bg-ok px-2 py-0.5 text-[11px] font-bold text-white shadow-pixel active:translate-y-0.5"
                >
                  会了
                </button>
                <button
                  type="button"
                  data-practice-wrong={index}
                  onClick={() =>
                    record.mutate({ isCorrect: false, subject: source?.subject ?? null, difficulty: 'medium' })
                  }
                  className="border-2 border-ink bg-danger px-2 py-0.5 text-[11px] font-bold text-white shadow-pixel active:translate-y-0.5"
                >
                  还没会
                </button>
              </div>
            </div>
          ))}
        </Panel>
      )}

      <Panel>
        <div className="flex items-center justify-between">
          <p className="text-sm font-extrabold text-ink">练习统计</p>
          <div className="flex gap-2">
            <Link
              to="/learning/wrong-questions/stats"
              className="border-2 border-ink bg-panel px-2 py-1 text-xs font-bold shadow-pixel"
            >
              错题统计
            </Link>
            <button
              type="button"
              data-clear-practice
              onClick={() => clearStats.mutate()}
              className="border-2 border-danger bg-danger/10 px-2 py-1 text-xs font-bold text-danger shadow-pixel active:translate-y-0.5"
            >
              清空练习记录
            </button>
          </div>
        </div>
        {statsQuery.isLoading ? (
          <Skeleton className="mt-2 h-16 w-full" />
        ) : (
          <>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div className="border-2 border-ink bg-panelLight py-1.5">
                <p className="text-base font-extrabold text-ink" data-practice-total>
                  {s?.total ?? 0}
                </p>
                <p className="text-[11px] text-inkSoft">练习次数</p>
              </div>
              <div className="border-2 border-ink bg-panelLight py-1.5">
                <p className="text-base font-extrabold text-ok">{s?.correct ?? 0}</p>
                <p className="text-[11px] text-inkSoft">会了</p>
              </div>
              <div className="border-2 border-ink bg-panelLight py-1.5">
                <p className="text-base font-extrabold text-danger">{s?.wrong ?? 0}</p>
                <p className="text-[11px] text-inkSoft">还没会</p>
              </div>
            </div>
            {(s?.byDifficulty ?? []).length > 0 && (
              <div className="mt-2 space-y-1">
                {(s?.byDifficulty ?? []).map((row) => (
                  <p key={row.difficulty} className="text-[11px] text-inkSoft">
                    {PRACTICE_DIFFICULTY_LABELS[row.difficulty] ?? row.difficulty}：{row.correct}/{row.total} 会了
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
