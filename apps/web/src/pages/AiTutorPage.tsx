import { Link } from 'react-router-dom';
import { Panel } from '../components/ui/card';

/**
 * AI 解题（P6-3 才接真模型）。
 * 用户 2026-10-06 决策：**先搭好适配层，晚点接真模型** —— 所以本页目前只呈现能力入口与
 * "AI 未配置"状态；后端 provider 适配层（含未配置时的明确错误码）随 P6-3 落地，
 * 视觉与交互照上游（识题 → 解析 → 相似题）。
 */
export function AiTutorPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/learning" className="text-sm font-bold text-inkSoft hover:text-ink">
          ← 返回学习
        </Link>
        <h1 className="text-base font-extrabold tracking-widest">AI 解题</h1>
      </div>

      <Panel className="space-y-2">
        <p className="text-sm font-extrabold text-ink">计划能力（对照上游 wrong-notebook）</p>
        <ul className="list-inside list-disc space-y-1 text-xs text-inkSoft">
          <li>拍照 / 上传题目图片 → AI 识题（题干、知识点、错因状态）</li>
          <li>AI 解析：正确答案 + 分步解析（默认简体中文）</li>
          <li>AI 重解（可带图重判错因）</li>
          <li>相似题生成（练习）</li>
        </ul>
        <p data-ai-status className="border-2 border-warning bg-warning/10 px-2 py-1.5 text-xs font-bold text-ink">
          AI 未配置：后端 provider 适配层尚未接入模型密钥（用户决策：先搭适配层，晚点接真模型）。
          其余错题本功能不受影响。
        </p>
      </Panel>
    </div>
  );
}
