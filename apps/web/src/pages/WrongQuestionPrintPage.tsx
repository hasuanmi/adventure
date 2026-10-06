import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MASTERY_LABELS, PRINT_PREVIEW_PAGE_SIZE, WrongQuestionDto } from '@huahua/shared-types';
import { ArrowLeft } from 'lucide-react';
import { Skeleton } from '../components/ui/skeleton';
import { useAuthedImages } from '../hooks/use-authed-images';
import { exportQuestionsToPdf } from '../lib/pdf';
import { wrongQuestionsApi } from '../lib/api/wrong-questions';
import { subjectMeta } from '../lib/constants';

/** 单题的打印块（图片按比例缩放；答案区留白规则与上游一致） */
function PrintItem({
  item,
  index,
  imageUrl,
  imageScale,
  showQuestionText,
  showAnswers,
  showAnalysis,
  showTags,
  reserveAnswerSpace,
}: {
  item: WrongQuestionDto;
  index: number;
  imageUrl?: string;
  imageScale: number;
  showQuestionText: boolean;
  showAnswers: boolean;
  showAnalysis: boolean;
  showTags: boolean;
  reserveAnswerSpace: boolean;
}) {
  return (
    <div
      data-print-question={item.id}
      className={`mb-4 border-b border-black/40 last:border-b-0 print:break-inside-avoid ${
        reserveAnswerSpace ? 'pb-20 print:pb-16' : 'pb-6'
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-lg font-bold">题目 {index + 1}</span>
        {item.subject && <span className="text-sm text-inkSoft">{subjectMeta(item.subject).label}</span>}
        {item.gradeSemester && <span className="text-sm text-inkSoft">{item.gradeSemester}</span>}
        {item.source && <span className="text-sm text-inkSoft">{item.source}</span>}
        <span className="text-sm text-inkSoft">
          {MASTERY_LABELS[item.masteryLevel as 0 | 1 | 2] ?? '新题'}
        </span>
        <span className="ml-auto text-xs text-inkSoft">
          {new Date(item.createdAt).toLocaleDateString('zh-CN')}
        </span>
      </div>

      {/* 题目图片：按「图片比例」缩放 */}
      {imageUrl && (
        <div className="mb-2">
          <img
            src={imageUrl}
            alt={`题目 ${index + 1} 图片`}
            data-print-image={item.id}
            style={{ width: `${imageScale}%` }}
            className="max-w-full border border-black/30 object-contain"
          />
        </div>
      )}

      {showQuestionText && item.questionText && (
        <p data-print-text className="whitespace-pre-wrap text-sm leading-7">
          {item.questionText}
        </p>
      )}
      {showAnswers && item.answerText && (
        <p data-print-answer className="mt-1 whitespace-pre-wrap text-sm leading-7">
          <span className="font-bold">答案：</span>
          {item.answerText}
        </p>
      )}
      {showAnalysis && item.analysis && (
        <p data-print-analysis className="mt-1 whitespace-pre-wrap text-sm leading-7">
          <span className="font-bold">解析：</span>
          {item.analysis}
        </p>
      )}
      {showTags && item.tags.length > 0 && (
        <p data-print-tags className="mt-1 text-sm">
          <span className="font-bold">知识点：</span>
          {item.tags.map((t) => t.name).join('、')}
        </p>
      )}
      {/* 与上游一致：没有可显示内容时**给出作答留白**（不写多余提示文案） */}
      {!showQuestionText && !showAnswers && !showAnalysis && !showTags && !imageUrl && (
        <div className="h-24" data-print-blank />
      )}
    </div>
  );
}

/**
 * 打印预览（**逐项对照上游 print-preview/page.tsx**）：
 *  · 顶部：返回 + 「打印预览 (选中/总数 道题目)」+ 打印 / 保存 PDF（未选中时禁用）
 *  · 控制行：**图片比例 slider(30–100, 默认 70)** + 4 个内容开关：
 *    **原题文字 / 显示答案 / 显示解析 / 显示知识点（默认全部不勾 = 空白练习卷）**
 *  · 选择区：「选择题目 (n/total)」+ 全选 / 清空选择 + 逐题勾选（默认全选）
 *  · 打印区：只打印选中的题；图片按比例缩放；答案/解析都不显示时**留出作答空间**（上游 shouldReserveAnswerSpace）
 *  · 数据源：列表页「导出 / 打印」带过来的筛选条件，pageSize = PRINT_PREVIEW_PAGE_SIZE(200)
 */
export function WrongQuestionPrintPage() {
  const [params] = useSearchParams();
  const subject = params.get('subject') ?? '';
  const masteryLevel = params.get('masteryLevel') ?? '';
  const search = params.get('search') ?? '';

  // 上游默认：内容开关全不勾（打出来是空白练习卷）
  const [showQuestionText, setShowQuestionText] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [imageScale, setImageScale] = useState(70);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportedPages, setExportedPages] = useState<number | null>(null);

  const query = useQuery({
    queryKey: ['wrong-questions-print', { subject, masteryLevel, search }],
    queryFn: () =>
      wrongQuestionsApi.list({
        subject: subject || undefined,
        masteryLevel: masteryLevel === '' ? undefined : Number(masteryLevel),
        search: search || undefined,
        page: 1,
        pageSize: PRINT_PREVIEW_PAGE_SIZE,
      }),
  });

  const items = query.data?.items ?? [];

  // 载入后默认全选（与上游一致）
  useEffect(() => {
    if (query.isSuccess) setSelectedIds(new Set(items.map((i) => i.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.isSuccess, query.dataUpdatedAt]);

  const selectedItems = useMemo(() => items.filter((i) => selectedIds.has(i.id)), [items, selectedIds]);
  const imageUrls = useAuthedImages(
    selectedItems.map((i) => ({ id: i.id, key: i.originalImageKey })),
  );

  /** 真正的文件导出：自己生成 PDF 下载（不依赖系统打印对话框，WebView 里也能用） */
  const handleExportPdf = async (): Promise<void> => {
    if (selectedItems.length === 0) return;
    setExporting(true);
    setExportError(null);
    setExportedPages(null);
    try {
      const pages = await exportQuestionsToPdf({
        items: selectedItems,
        imageUrls,
        show: { questionText: showQuestionText, answer: showAnswers, analysis: showAnalysis, tags: showTags },
        imageScale,
        fileName: `错题本-${new Date().toISOString().slice(0, 10)}.pdf`,
      });
      setExportedPages(pages);
    } catch (err) {
      setExportError(err instanceof Error ? `导出失败：${err.message}` : '导出失败');
    } finally {
      setExporting(false);
    }
  };
  const reserveAnswerSpace = !showAnswers && !showAnalysis;
  const countLabel = selectedItems.length === items.length ? String(items.length) : `${selectedItems.length}/${items.length}`;
  const emptyState = items.length === 0 ? 'noItems' : selectedItems.length === 0 ? 'noSelection' : null;

  const toggle = (id: string): void =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (query.isLoading) return <Skeleton className="h-60 w-full" />;

  return (
    <div className="space-y-3">
      {/* 控制区（打印时隐藏） */}
      <div data-no-print className="space-y-3 border-2 border-ink bg-panel p-3 shadow-pixel">
        <div className="flex items-center gap-3">
          <Link to="/learning/wrong-questions" className="inline-flex items-center gap-1 text-sm font-bold text-inkSoft hover:text-ink">
            <ArrowLeft className="h-4 w-4" /> 返回错题本
          </Link>
          <h1 className="flex-1 text-base font-extrabold tracking-widest">
            打印预览（{countLabel} 道题目）
          </h1>
          <button
            type="button"
            data-export-pdf
            disabled={selectedItems.length === 0 || exporting}
            onClick={() => void handleExportPdf()}
            className="border-2 border-ink bg-ok px-4 py-2 text-xs font-extrabold text-white shadow-pixel active:translate-y-0.5 disabled:opacity-50"
          >
            {exporting ? '导出中…' : '导出 PDF（下载文件）'}
          </button>
          <button
            type="button"
            data-print-now
            disabled={selectedItems.length === 0}
            onClick={() => window.print()}
            className="border-2 border-ink bg-accent px-4 py-2 text-xs font-extrabold text-white shadow-pixel active:translate-y-0.5 disabled:opacity-50"
          >
            打印 / 保存 PDF
          </button>
        </div>
        {(exportError || exportedPages !== null) && (
          <p
            data-pdf-result
            className={`text-xs font-bold ${exportError ? 'text-danger' : 'text-ok'}`}
          >
            {exportError ?? `已导出 PDF（${exportedPages} 页），请查看浏览器下载`}
          </p>
        )}

        {/* 图片比例 + 内容开关 */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <label className="flex items-center gap-2 border-2 border-ink/40 bg-panelLight px-2 py-1 text-xs font-bold">
            <span>图片比例：{imageScale}%</span>
            <input
              type="range"
              min="30"
              max="100"
              value={imageScale}
              data-print-scale
              onChange={(e) => setImageScale(Number(e.target.value))}
              className="w-20"
            />
          </label>
          {(
            [
              ['原题文字', showQuestionText, setShowQuestionText, 'questionText'],
              ['显示答案', showAnswers, setShowAnswers, 'answer'],
              ['显示解析', showAnalysis, setShowAnalysis, 'analysis'],
              ['显示知识点', showTags, setShowTags, 'tags'],
            ] as const
          ).map(([label, value, setter, key]) => (
            <label key={key} className="inline-flex items-center gap-1.5 text-xs font-bold text-ink">
              <input
                type="checkbox"
                data-print-toggle={key}
                checked={value}
                onChange={(e) => (setter as (v: boolean) => void)(e.target.checked)}
              />
              {label}
            </label>
          ))}
        </div>

        {/* 选择题目 */}
        <div className="border-2 border-ink/40 bg-panelLight p-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span data-print-selection-count className="text-xs font-extrabold text-ink">
              选择题目（{selectedItems.length}/{items.length}）
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                data-print-select-all
                onClick={() => setSelectedIds(new Set(items.map((i) => i.id)))}
                className="border-2 border-ink bg-panel px-2 py-1 text-xs font-bold shadow-pixel active:translate-y-0.5"
              >
                全选
              </button>
              <button
                type="button"
                data-print-clear-selection
                onClick={() => setSelectedIds(new Set())}
                className="border-2 border-ink bg-panel px-2 py-1 text-xs font-bold shadow-pixel active:translate-y-0.5"
              >
                清空选择
              </button>
            </div>
          </div>
          {items.length === 0 ? (
            <p data-print-empty className="mt-2 text-[11px] text-inkSoft">
              没有符合条件的错题：先在错题本里录入，或换个筛选。
            </p>
          ) : (
            <div className="mt-2 grid max-h-44 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item, index) => (
                <label
                  key={item.id}
                  data-print-pick={item.id}
                  className="flex cursor-pointer items-start gap-2 border-2 border-ink/30 bg-panel p-2 text-[11px] hover:border-accent"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggle(item.id)}
                    className="mt-0.5"
                  />
                  <span className="line-clamp-2">
                    <span className="font-extrabold">题目 {index + 1}</span>
                    {item.questionText ? `：${item.questionText}` : ''}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
        <p className="text-center text-[11px] text-inkSoft">
          提示：打印对话框里把"目标打印机"选成「另存为 PDF」即导出 PDF。
        </p>
      </div>

      {/* 打印区 */}
      <div data-print-area className="mx-auto max-w-4xl space-y-4 bg-white p-4 text-black print:p-0">
        {emptyState === 'noItems' && (
          <p data-print-empty-state className="text-sm">
            没有符合条件的错题可打印。
          </p>
        )}
        {emptyState === 'noSelection' && (
          <p data-print-empty-state className="text-sm">
            还没有选择要打印的题目（用上面的勾选或"全选"）。
          </p>
        )}
        {selectedItems.map((item, index) => (
          <PrintItem
            key={item.id}
            item={item}
            index={index}
            imageUrl={imageUrls[item.id]}
            imageScale={imageScale}
            showQuestionText={showQuestionText}
            showAnswers={showAnswers}
            showAnalysis={showAnalysis}
            showTags={showTags}
            reserveAnswerSpace={reserveAnswerSpace}
          />
        ))}
      </div>
    </div>
  );
}
