import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MASTERY_LABELS } from '@huahua/shared-types';
import { Skeleton } from '../components/ui/skeleton';
import { wrongQuestionsApi } from '../lib/api/wrong-questions';
import { subjectMeta } from '../lib/constants';

/**
 * 打印预览（对照上游 print-preview 页）：**导出 = 打印预览 → 可另存为 PDF**。
 *  · 支持按当前筛选打印，或只打印列表里勾选的题（?ids=a,b）
 *  · 三个开关：答案 / 解析 / 错因（家长可以只打题目当练习卷）
 *  · 点「打印 / 保存为 PDF」调浏览器打印（目标选"另存为 PDF"即可导出 PDF）
 */
export function WrongQuestionPrintPage() {
  const [params] = useSearchParams();
  const ids = (params.get('ids') ?? '').split(',').filter(Boolean);
  const subject = params.get('subject') ?? '';
  const masteryLevel = params.get('masteryLevel') ?? '';
  const search = params.get('search') ?? '';

  const [withAnswer, setWithAnswer] = useState(true);
  const [withAnalysis, setWithAnalysis] = useState(true);
  const [withMistake, setWithMistake] = useState(true);

  const query = useQuery({
    queryKey: ['wrong-questions-print', { ids: ids.join(','), subject, masteryLevel, search }],
    queryFn: () =>
      wrongQuestionsApi.list({
        subject: subject || undefined,
        masteryLevel: masteryLevel === '' ? undefined : Number(masteryLevel),
        search: search || undefined,
        page: 1,
        pageSize: 100,
      }),
  });

  const items = useMemo(() => {
    const all = query.data?.items ?? [];
    return ids.length ? all.filter((q) => ids.includes(q.id)) : all;
  }, [query.data, ids]);

  if (query.isLoading) return <Skeleton className="h-60 w-full" />;

  return (
    <div className="space-y-3">
      {/* 屏幕上的工具条：打印时隐藏 */}
      <div data-no-print className="space-y-2 border-2 border-ink bg-panel p-3 shadow-pixel">
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/learning/wrong-questions" className="text-sm font-bold text-inkSoft hover:text-ink">
            ← 返回错题本
          </Link>
          <h1 className="text-base font-extrabold tracking-widest">打印预览</h1>
          <span className="text-[11px] text-inkSoft">
            共 {items.length} 题{ids.length ? '（仅勾选的题）' : '（当前筛选结果）'}
          </span>
          <button
            type="button"
            data-print-now
            onClick={() => window.print()}
            className="ml-auto border-2 border-ink bg-accent px-4 py-2 text-xs font-extrabold text-white shadow-pixel active:translate-y-0.5"
          >
            打印 / 保存为 PDF
          </button>
        </div>
        <div className="flex flex-wrap gap-3 text-xs font-bold text-ink">
          {[
            ['显示答案', withAnswer, setWithAnswer, 'answer'],
            ['显示解析', withAnalysis, setWithAnalysis, 'analysis'],
            ['显示错因', withMistake, setWithMistake, 'mistake'],
          ].map(([label, value, setter, key]) => (
            <label key={key as string} className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                data-print-toggle={key as string}
                checked={value as boolean}
                onChange={(e) => (setter as (v: boolean) => void)(e.target.checked)}
              />
              {label as string}
            </label>
          ))}
        </div>
        <p className="text-[11px] text-inkSoft">
          提示：在打印对话框里把"目标打印机"选成「另存为 PDF / Save as PDF」即导出 PDF。
        </p>
      </div>

      {/* 打印内容 */}
      <div data-print-area className="space-y-4 bg-white p-4 text-black">
        <div className="border-b-2 border-black pb-2">
          <p className="text-lg font-extrabold">错题本 · {new Date().toLocaleDateString('zh-CN')}</p>
          <p className="text-xs">
            共 {items.length} 题 · 由花花时间导出
            {subject ? ` · ${subjectMeta(subject).label}` : ''}
          </p>
        </div>

        {items.length === 0 && <p className="text-sm">没有可打印的错题。</p>}

        {items.map((q, index) => (
          <section key={q.id} data-print-question={q.id} className="break-inside-avoid border-b border-black/30 pb-3">
            <p className="text-xs font-bold">
              {index + 1}. {subjectMeta(q.subject).label} · {MASTERY_LABELS[q.masteryLevel as 0 | 1 | 2] ?? '新题'}
              {q.gradeSemester ? ` · ${q.gradeSemester}` : ''}
              {q.source ? ` · ${q.source}` : ''}
              <span className="float-right">{new Date(q.createdAt).toLocaleDateString('zh-CN')}</span>
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{q.questionText ?? '（无题干）'}</p>
            {withAnswer && q.answerText && (
              <p className="mt-1 whitespace-pre-wrap text-sm">
                <span className="font-bold">答案：</span>
                {q.answerText}
              </p>
            )}
            {withAnalysis && q.analysis && (
              <p className="mt-1 whitespace-pre-wrap text-sm">
                <span className="font-bold">解析：</span>
                {q.analysis}
              </p>
            )}
            {withMistake && (q.errorType || q.mistakeAnalysis || q.wrongAnswerText) && (
              <p className="mt-1 whitespace-pre-wrap text-sm">
                <span className="font-bold">错因：</span>
                {[q.errorType, q.mistakeAnalysis, q.wrongAnswerText].filter(Boolean).join(' / ')}
              </p>
            )}
            {q.tags.length > 0 && (
              <p className="mt-1 text-xs">
                <span className="font-bold">知识点：</span>
                {q.tags.map((t) => t.name).join('、')}
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
