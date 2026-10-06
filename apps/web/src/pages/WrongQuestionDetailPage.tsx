import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MASTERY_LABELS, type MasteryLevel } from '@huahua/shared-types';
import { Panel } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { ApiError } from '../lib/api/client';
import { wrongQuestionsApi } from '../lib/api/wrong-questions';
import { subjectMeta } from '../lib/constants';

/** 掌握度三态配色（0 新题=橙 / 1 复习中=琥珀 / 2 已掌握=绿，与列表 Badge 一致） */
const MASTERY_COLORS: Record<MasteryLevel, string> = {
  0: 'var(--accent)',
  1: 'var(--warning)',
  2: 'var(--ok)',
};

const MISTAKE_LABELS: Record<string, string> = {
  not_attempted: '没有作答',
  wrong_attempt: '作答错误',
  unknown: '不确定',
};

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="mt-2">
      <p className="text-[11px] font-bold text-inkSoft">{label}</p>
      <p className="whitespace-pre-wrap text-sm text-ink">{value}</p>
    </div>
  );
}

/** 错题详情（对照上游详情页：题目各字段 + 知识点 + 复习记录 + 掌握标记 + 笔记 + 删除） */
export function WrongQuestionDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const question = useQuery({ queryKey: ['wrong-question', id], queryFn: () => wrongQuestionsApi.get(id) });
  const reviews = useQuery({ queryKey: ['wrong-question-reviews', id], queryFn: () => wrongQuestionsApi.reviews(id) });

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['wrong-question', id] });
    void queryClient.invalidateQueries({ queryKey: ['wrong-question-reviews', id] });
    void queryClient.invalidateQueries({ queryKey: ['wrong-questions'] });
  };

  const mastery = useMutation({
    mutationFn: (level: MasteryLevel) => wrongQuestionsApi.setMastery(id, level),
    onSuccess: refresh,
    onError: () => setError('更新掌握度失败'),
  });
  const addReview = useMutation({
    mutationFn: (isCorrect: boolean) =>
      wrongQuestionsApi.addReview(id, { scheduledFor: new Date().toISOString(), completedAt: new Date().toISOString(), isCorrect }),
    onSuccess: refresh,
    onError: () => setError('记录复习失败'),
  });
  const saveNotes = useMutation({
    mutationFn: (text: string | null) => wrongQuestionsApi.updateNotes(id, text),
    onSuccess: () => {
      setNotes(null);
      refresh();
    },
    onError: () => setError('笔记保存失败'),
  });
  const remove = useMutation({
    mutationFn: () => wrongQuestionsApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['wrong-questions'] });
      navigate('/learning/wrong-questions');
    },
    onError: (err) => setError(err instanceof ApiError ? '删除失败' : '删除失败'),
  });

  if (question.isLoading) return <Skeleton className="h-60 w-full" />;
  if (question.isError || !question.data) {
    return (
      <Panel>
        <p className="text-sm font-bold text-danger">错题不存在或无权查看</p>
        <Link to="/learning/wrong-questions" className="mt-2 inline-block text-sm font-bold text-inkSoft underline">
          返回错题本
        </Link>
      </Panel>
    );
  }

  const q = question.data;
  const notesValue = notes ?? q.userNotes ?? '';
  const reviewList = reviews.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/learning/wrong-questions" className="text-sm font-bold text-inkSoft hover:text-ink">
          ← 返回错题本
        </Link>
        <div className="flex gap-2">
          <Link
            to={`/learning/wrong-questions/${q.id}/edit`}
            className="border-2 border-ink bg-panel px-2 py-1 text-xs font-bold shadow-pixel active:translate-y-0.5"
          >
            编辑
          </Link>
          <button
            type="button"
            data-delete-wrong-question
            onClick={() => {
              setError(null);
              remove.mutate();
            }}
            className="border-2 border-danger bg-danger/10 px-2 py-1 text-xs font-bold text-danger shadow-pixel active:translate-y-0.5"
          >
            删除
          </button>
        </div>
      </div>

      <Panel>
        <div className="flex items-center gap-2">
          <span className="text-base">{subjectMeta(q.subject).emoji}</span>
          <span className="text-sm font-bold text-inkSoft">{subjectMeta(q.subject).label}</span>
          {q.source && <span className="text-[11px] text-inkSoft">· {q.source}</span>}
          {q.errorType && <span className="text-[11px] text-inkSoft">· {q.errorType}</span>}
        </div>

        {/* 掌握度切换（上游 masteryLevel 0/1/2） */}
        <div className="mt-2 flex flex-wrap gap-1.5" data-mastery-controls>
          {([0, 1, 2] as MasteryLevel[]).map((level) => (
            <button
              key={level}
              type="button"
              data-mastery-option={level}
              onClick={() => {
                setError(null);
                mastery.mutate(level);
              }}
              className={`border-2 border-ink px-2.5 py-1 text-xs font-bold shadow-pixel active:translate-y-0.5 ${
                q.masteryLevel === level ? 'text-white' : 'bg-panelLight'
              }`}
              style={q.masteryLevel === level ? { backgroundColor: MASTERY_COLORS[level] } : undefined}
            >
              {MASTERY_LABELS[level]}
            </button>
          ))}
        </div>

        <div className="mt-3 border-t-2 border-dashed border-ink/30 pt-2">
          <Field label="题干" value={q.questionText} />
          <Field label="正确答案" value={q.answerText} />
          <Field label="解析" value={q.analysis} />
          <Field label="学生的错误答案 / 过程" value={q.wrongAnswerText} />
          <Field label="错因分析" value={q.mistakeAnalysis} />
          <Field label="错因状态" value={q.mistakeStatus ? MISTAKE_LABELS[q.mistakeStatus] ?? q.mistakeStatus : null} />
          <Field label="年级学期" value={q.gradeSemester} />
          <Field label="试卷" value={q.paperLevel} />
          {q.ocrText && <Field label="OCR 原文" value={q.ocrText} />}
          {q.geogebraCommands && <Field label="GeoGebra 命令" value={q.geogebraCommands} />}
        </div>

        {q.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {q.tags.map((tag) => (
              <span key={tag.id} className="border-2 border-ink/40 bg-panelLight px-1.5 py-0.5 text-[11px] font-bold">
                {tag.name}
              </span>
            ))}
          </div>
        )}

        {error && <p className="mt-2 text-xs font-bold text-danger">{error}</p>}
      </Panel>

      {/* 笔记（上游 PATCH /:id/notes） */}
      <Panel>
        <p className="text-sm font-extrabold text-ink">笔记</p>
        <textarea
          rows={3}
          data-wrong-question-notes
          value={notesValue}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="记录自己的心得、易错点…"
          className="mt-1 w-full border-2 border-ink bg-panelLight px-2 py-1.5 text-sm"
        />
        <button
          type="button"
          data-save-notes
          disabled={saveNotes.isPending || notes === null}
          onClick={() => saveNotes.mutate(notesValue)}
          className="mt-1.5 border-2 border-ink bg-accent px-3 py-1 text-xs font-extrabold text-white shadow-pixel active:translate-y-0.5 disabled:opacity-50"
        >
          保存笔记
        </button>
      </Panel>

      {/* 复习记录（上游 ReviewSchedule） */}
      <Panel>
        <div className="flex items-center justify-between">
          <p className="text-sm font-extrabold text-ink">复习记录（{reviewList.length} 次）</p>
          <div className="flex gap-1.5">
            <button
              type="button"
              data-review-correct
              disabled={addReview.isPending}
              onClick={() => {
                setError(null);
                addReview.mutate(true);
              }}
              className="border-2 border-ink bg-ok px-2.5 py-1 text-xs font-bold text-white shadow-pixel active:translate-y-0.5"
            >
              复习：会了
            </button>
            <button
              type="button"
              data-review-wrong
              disabled={addReview.isPending}
              onClick={() => {
                setError(null);
                addReview.mutate(false);
              }}
              className="border-2 border-ink bg-danger px-2.5 py-1 text-xs font-bold text-white shadow-pixel active:translate-y-0.5"
            >
              还没会
            </button>
          </div>
        </div>
        {reviewList.length === 0 ? (
          <p className="mt-1.5 text-xs text-inkSoft">还没有复习记录：点上面按钮记一次结果。</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {reviewList.map((r, index) => (
              <li key={r.id} className="flex items-center gap-2 text-xs text-ink">
                <span className="text-inkSoft">#{index + 1}</span>
                <span>{new Date(r.completedAt ?? r.scheduledFor).toLocaleString('zh-CN')}</span>
                <span className={r.isCorrect ? 'font-bold text-ok' : 'font-bold text-danger'}>
                  {r.isCorrect === null ? '未判定' : r.isCorrect ? '会了' : '还没会'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
