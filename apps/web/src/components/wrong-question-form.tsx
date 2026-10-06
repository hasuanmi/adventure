import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ASSIGNMENT_STATUSES,
  CreateWrongQuestionRequest,
  DEFAULT_GRADE_SEMESTER,
  GRADE_LABELS,
  GRADE_STAGES,
  MASTERY_LEVELS,
  MASTERY_LABELS,
  SEMESTERS,
  WRONG_QUESTION_SUBJECTS,
  mistakeReasonsFor,
  parseGradeSemester,
  type GradeStage,
} from '@huahua/shared-types';
import { Panel } from './ui/card';
import { AutoGrowTextarea } from './ui/auto-grow-textarea';
import { ApiError } from '../lib/api/client';
import { filesApi } from '../lib/api/files';
import { knowledgeTagsApi, wrongQuestionsApi } from '../lib/api/wrong-questions';
import { subjectMeta } from '../lib/constants';

export interface WrongQuestionFormInitial {
  prefill?: Partial<CreateWrongQuestionRequest>;
  /** AI 识别出的知识点（可一键变标签） */
  knowledgePoints?: string[];
  imageKey?: string | null;
}

interface Props extends WrongQuestionFormInitial {
  /** 编辑已有错题时传 id */
  id?: string;
  onSaved?: () => void;
}

const EMPTY: CreateWrongQuestionRequest = {
  subject: 'math',
  questionText: '',
  answerText: '',
  analysis: '',
  wrongAnswerText: '',
  mistakeAnalysis: '',
  mistakeStatus: 'wrong_attempt',
  source: '',
  userNotes: '',
  masteryLevel: 0,
  gradeSemester: DEFAULT_GRADE_SEMESTER,
  tagIds: [],
};

/**
 * 错题表单（录入 / 编辑 / AI 识别后的确认**共用同一个组件**）。
 * 按用户 2026-10-06 的字段调整：
 *  · 下拉「作答状态」= 不会做 / 做错了（存 mistake_status）
 *  · 下拉「错因」= **分学科**选项（数学/奥数：粗心失误·思路偏差·未掌握知识点·其他；
 *    语文/英语/PET：拼写错误·单词/词语不认识·未掌握知识点·其他）→ 存 error_type
 *  · 「年级学期」= 学段 + 年级 + 上/下学期 三级下拉，默认「小学五年级上学期」
 *  · **删除**「试卷」「错误类型」两项（DB 列保留以对齐上游 `paperLevel`，仅不在界面出现）
 */
export function WrongQuestionForm({ id, prefill, knowledgePoints, imageKey, onSaved }: Props) {
  const isEdit = Boolean(id);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateWrongQuestionRequest>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [newTag, setNewTag] = useState('');
  const [pendingPoints, setPendingPoints] = useState<string[]>(knowledgePoints ?? []);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [grade, setGrade] = useState(parseGradeSemester(DEFAULT_GRADE_SEMESTER));

  const existing = useQuery({
    queryKey: ['wrong-question', id],
    queryFn: () => wrongQuestionsApi.get(id as string),
    enabled: isEdit,
  });
  const tagsQuery = useQuery({ queryKey: ['knowledge-tags'], queryFn: () => knowledgeTagsApi.list() });

  // 编辑：载入原值
  useEffect(() => {
    if (!existing.data) return;
    const q = existing.data;
    setForm({
      subject: q.subject ?? 'math',
      questionText: q.questionText ?? '',
      answerText: q.answerText ?? '',
      analysis: q.analysis ?? '',
      wrongAnswerText: q.wrongAnswerText ?? '',
      mistakeAnalysis: q.mistakeAnalysis ?? '',
      mistakeStatus: q.mistakeStatus ?? 'wrong_attempt',
      source: q.source ?? '',
      errorType: q.errorType ?? '',
      userNotes: q.userNotes ?? '',
      masteryLevel: q.masteryLevel,
      gradeSemester: q.gradeSemester ?? DEFAULT_GRADE_SEMESTER,
      originalImageKey: q.originalImageKey ?? null,
      tagIds: q.tags.map((t) => t.id),
    });
    setGrade(parseGradeSemester(q.gradeSemester));
  }, [existing.data]);

  // 新建：应用 AI 预填 / 上传的图片
  useEffect(() => {
    if (isEdit) return;
    if (prefill || imageKey) {
      setForm((f) => ({ ...f, ...prefill, originalImageKey: imageKey ?? f.originalImageKey ?? null }));
    }
  }, [isEdit, prefill, imageKey]);

  // 已上传图片预览（鉴权接口 → blob URL）
  useEffect(() => {
    const key = form.originalImageKey;
    if (!key) {
      setImagePreview(null);
      return;
    }
    let revoked: string | null = null;
    let cancelled = false;
    void filesApi
      .objectUrl(key)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        revoked = url;
        setImagePreview(url);
      })
      .catch(() => setImagePreview(null));
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [form.originalImageKey]);

  const availableTags = useMemo(
    () => (tagsQuery.data ?? []).filter((t) => !form.subject || t.subject === form.subject),
    [tagsQuery.data, form.subject],
  );
  const reasons = mistakeReasonsFor(form.subject);

  const save = useMutation({
    mutationFn: () =>
      isEdit
        ? wrongQuestionsApi.update(id as string, form)
        : wrongQuestionsApi.create(form),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['wrong-questions'] });
      void queryClient.invalidateQueries({ queryKey: ['wrong-question'] });
      void queryClient.invalidateQueries({ queryKey: ['wrong-question-stats'] });
      onSaved?.();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        setError('这道题刚刚已经录入过了（同学科、题干前 100 字相同）');
      } else {
        setError(err instanceof Error ? err.message : '保存失败');
      }
    },
  });

  const createTag = useMutation({
    mutationFn: (name: string) => knowledgeTagsApi.create({ name, subject: form.subject ?? 'math' }),
    onSuccess: (tag) => {
      setNewTag('');
      setForm((f) => ({ ...f, tagIds: [...(f.tagIds ?? []), tag.id] }));
      void queryClient.invalidateQueries({ queryKey: ['knowledge-tags'] });
    },
    onError: () => setError('标签创建失败（可能已存在同名标签）'),
  });

  // 大段文字一律用自适应高度输入框（题干/解析/笔记…），不要内部滚动条
  const field = (label: string, key: keyof CreateWrongQuestionRequest, placeholder = '') => (
    <label className="block">
      <span className="text-xs font-bold text-inkSoft">{label}</span>
      <AutoGrowTextarea
        name={key}
        value={(form[key] as string) ?? ''}
        placeholder={placeholder}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className="mt-0.5 min-h-[3rem] w-full border-2 border-ink bg-panelLight px-2 py-1.5 text-sm"
      />
    </label>
  );

  return (
    <Panel className="space-y-3" >
      <label className="block">
        <span className="text-xs font-bold text-inkSoft">学科</span>
        <select
          name="subject"
          value={form.subject ?? 'math'}
          onChange={(e) => {
            const next = e.target.value;
            // 换学科时：错因选项随之变化，故清掉旧错因；标签也只留同学科的
            setForm((f) => ({ ...f, subject: next, errorType: '', tagIds: [] }));
          }}
          className="mt-0.5 w-full border-2 border-ink bg-panelLight px-2 py-1.5 text-sm"
        >
          {WRONG_QUESTION_SUBJECTS.map((s) => (
            <option key={s} value={s}>
              {subjectMeta(s).label}
            </option>
          ))}
        </select>
      </label>

      {imagePreview && (
        <div data-form-image>
          <span className="text-xs font-bold text-inkSoft">题目图片（已上传）</span>
          <img
            src={imagePreview}
            alt="题目图片"
            className="mt-0.5 max-h-56 border-2 border-ink bg-panelLight object-contain"
          />
        </div>
      )}

      {pendingPoints.length > 0 && (
        <div data-ai-knowledge-points>
          <span className="text-xs font-bold text-inkSoft">AI 识别的知识点（点击可加为标签）</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {pendingPoints.map((point) => (
              <button
                key={point}
                type="button"
                data-pending-point={point}
                onClick={() => {
                  setPendingPoints((list) => list.filter((p) => p !== point));
                  createTag.mutate(point);
                }}
                className="border-2 border-ink bg-panelLight px-2 py-0.5 text-[11px] font-bold"
              >
                + {point}
              </button>
            ))}
          </div>
        </div>
      )}

      {field('题干（必填）', 'questionText', '把题目抄进来，或用「拍照上传 / AI 识别」自动填入')}
      {field('正确答案', 'answerText')}
      {field('解析', 'analysis')}
      {field('学生的错误答案 / 过程', 'wrongAnswerText')}
      {field('错因分析', 'mistakeAnalysis')}

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-xs font-bold text-inkSoft">作答状态</span>
          <select
            name="mistakeStatus"
            value={form.mistakeStatus ?? 'wrong_attempt'}
            onChange={(e) => setForm({ ...form, mistakeStatus: e.target.value })}
            className="mt-0.5 w-full border-2 border-ink bg-panelLight px-2 py-1.5 text-sm"
          >
            {ASSIGNMENT_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-bold text-inkSoft">错因</span>
          <select
            name="errorType"
            data-mistake-reason
            value={form.errorType ?? ''}
            onChange={(e) => setForm({ ...form, errorType: e.target.value })}
            className="mt-0.5 w-full border-2 border-ink bg-panelLight px-2 py-1.5 text-sm"
          >
            <option value="">请选择</option>
            {reasons.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* 年级学期：学段 + 年级 + 上/下学期（默认 小学五年级上学期） */}
      <div>
        <span className="text-xs font-bold text-inkSoft">年级学期</span>
        <div className="mt-0.5 grid grid-cols-3 gap-2" data-grade-selects>
          <select
            name="gradeStage"
            value={grade.stage}
            onChange={(e) => {
              const stage = e.target.value as GradeStage;
              const gradeLabel = GRADE_LABELS[stage].includes(grade.gradeLabel)
                ? grade.gradeLabel
                : GRADE_LABELS[stage][0];
              const next = { ...grade, stage, gradeLabel };
              setGrade(next);
              setForm((f) => ({ ...f, gradeSemester: `${next.stage}${next.gradeLabel}${next.semester}` }));
            }}
            className="border-2 border-ink bg-panelLight px-2 py-1.5 text-sm"
          >
            {GRADE_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            name="gradeLabel"
            value={grade.gradeLabel}
            onChange={(e) => {
              const next = { ...grade, gradeLabel: e.target.value };
              setGrade(next);
              setForm((f) => ({ ...f, gradeSemester: `${next.stage}${next.gradeLabel}${next.semester}` }));
            }}
            className="border-2 border-ink bg-panelLight px-2 py-1.5 text-sm"
          >
            {GRADE_LABELS[grade.stage].map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <select
            name="semester"
            value={grade.semester}
            onChange={(e) => {
              const next = { ...grade, semester: e.target.value };
              setGrade(next);
              setForm((f) => ({ ...f, gradeSemester: `${next.stage}${next.gradeLabel}${next.semester}` }));
            }}
            className="border-2 border-ink bg-panelLight px-2 py-1.5 text-sm"
          >
            {SEMESTERS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-1 text-[11px] text-inkSoft">
          当前：{form.gradeSemester ?? DEFAULT_GRADE_SEMESTER}
        </p>
      </div>

      <label className="block">
        <span className="text-xs font-bold text-inkSoft">来源（如：期中考试）</span>
        <input
          name="source"
          value={form.source ?? ''}
          onChange={(e) => setForm({ ...form, source: e.target.value })}
          className="mt-0.5 w-full border-2 border-ink bg-panelLight px-2 py-1.5 text-sm"
        />
      </label>

      {field('笔记', 'userNotes')}

      {/* 知识点标签（上游 M2M + 自定义标签） */}
      <div>
        <span className="text-xs font-bold text-inkSoft">知识点标签</span>
        <div className="mt-1 flex flex-wrap gap-1">
          {availableTags.map((tag) => {
            const active = (form.tagIds ?? []).includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                data-tag-option={tag.id}
                onClick={() =>
                  setForm({
                    ...form,
                    tagIds: active
                      ? (form.tagIds ?? []).filter((t) => t !== tag.id)
                      : [...(form.tagIds ?? []), tag.id],
                  })
                }
                className={`border-2 border-ink px-2 py-0.5 text-[11px] font-bold ${
                  active ? 'bg-accent text-white' : 'bg-panelLight'
                }`}
              >
                {tag.name}
              </button>
            );
          })}
          {availableTags.length === 0 && (
            <span className="text-[11px] text-inkSoft">该学科暂无系统标签，可在下面新建</span>
          )}
        </div>
        <div className="mt-1.5 flex gap-1.5">
          <input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="新建自定义标签"
            data-new-tag
            className="min-w-0 flex-1 border-2 border-ink bg-panelLight px-2 py-1 text-xs"
          />
          <button
            type="button"
            data-add-tag
            disabled={!newTag.trim() || createTag.isPending}
            onClick={() => {
              setError(null);
              createTag.mutate(newTag.trim());
            }}
            className="border-2 border-ink bg-panel px-2 py-1 text-xs font-bold shadow-pixel disabled:opacity-50"
          >
            新建
          </button>
        </div>
      </div>

      <label className="block">
        <span className="text-xs font-bold text-inkSoft">掌握度</span>
        <select
          name="masteryLevel"
          value={String(form.masteryLevel ?? 0)}
          onChange={(e) => setForm({ ...form, masteryLevel: Number(e.target.value) })}
          className="mt-0.5 w-full border-2 border-ink bg-panelLight px-2 py-1.5 text-sm"
        >
          {MASTERY_LEVELS.map((level) => (
            <option key={level} value={level}>
              {MASTERY_LABELS[level]}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="text-xs font-bold text-danger">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          data-save-wrong-question
          disabled={!form.questionText?.trim() || save.isPending}
          onClick={() => {
            setError(null);
            save.mutate();
          }}
          className="border-2 border-ink bg-accent px-4 py-2 text-sm font-extrabold text-white shadow-pixel active:translate-y-0.5 disabled:opacity-50"
        >
          {save.isPending ? '保存中…' : isEdit ? '保存修改' : '保存错题'}
        </button>
        {isEdit && (
          <Link
            to={`/learning/wrong-questions/${id}`}
            className="border-2 border-ink bg-panel px-4 py-2 text-sm font-bold shadow-pixel"
          >
            取消
          </Link>
        )}
      </div>
    </Panel>
  );
}
