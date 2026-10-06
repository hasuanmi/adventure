import { Link } from 'react-router-dom';
import { BookOpen, Sparkles } from 'lucide-react';
import { Panel } from '../components/ui/card';

/**
 * 学习中心（用户 2026-10-06 指定：底部导航第三格「学习」，内含「AI 解题」「错题本」两个功能，
 * 以后继续加别的功能）。错题本与 AI 解题均对照上游 wrong-notebook 的能力实现。
 */
export function LearningPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-extrabold tracking-widest">学习</h1>

      <Link to="/learning/wrong-questions" className="block" data-learning-entry="wrong-questions">
        <Panel className="flex items-center gap-3 transition hover:bg-panelLight active:translate-y-0.5">
          <span className="grid h-12 w-12 shrink-0 place-items-center border-2 border-ink bg-accent text-white shadow-pixel">
            <BookOpen className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-extrabold text-ink">错题本</span>
            <span className="block text-[11px] text-inkSoft">录入错题 · 知识点标签 · 复习 · 掌握标记</span>
          </span>
          <span className="shrink-0 text-xs font-extrabold text-inkSoft">→</span>
        </Panel>
      </Link>

      <Link to="/learning/ai-tutor" className="block" data-learning-entry="ai-tutor">
        <Panel className="flex items-center gap-3 transition hover:bg-panelLight active:translate-y-0.5">
          <span className="grid h-12 w-12 shrink-0 place-items-center border-2 border-ink bg-[#7a5c38] text-white shadow-pixel">
            <Sparkles className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-extrabold text-ink">AI 解题</span>
            <span className="block text-[11px] text-inkSoft">拍照/输入题目 → 识别 · 解析 · 相似题</span>
          </span>
          <span className="shrink-0 text-xs font-extrabold text-inkSoft">→</span>
        </Panel>
      </Link>

      <p className="text-center text-[11px] text-inkSoft">以后会在这里继续加新的学习功能</p>
    </div>
  );
}
