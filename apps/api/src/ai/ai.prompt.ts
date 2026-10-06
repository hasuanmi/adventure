/**
 * AI 提示词 —— **结构对照上游 `src/lib/ai/prompts.ts`**（wrong-notebook v1.9.1，MIT 意向复用，
 * 许可与署名见 docs/opensource-mapping.md §二 第 58 行决策；仅个人自用）。
 *
 * 上游设计要点（逐项保留）：
 *  · 用**自定义 XML 标签**输出，明确禁止 JSON / Markdown 代码块；
 *  · analyze 9 个标签、reanswer 6 个标签；
 *  · 严禁 LaTeX 反斜杠二次转义、严禁输出任何图片链接；
 *  · 每题最多 5 个知识点标签；
 *  · 解析固定简体中文，questionText 随原题语言。
 *
 * 说明：上游模板共 665 行（含表格转录 5 组规则等细节）。本文件是其**结构性移植**；
 * P6-3 完整落地时把上游模板全文搬入（保留版权声明），本文件即为唯一落点。
 */

export const ANALYZE_TAGS = [
  'subject',
  'knowledge_points',
  'requires_image',
  'wrong_answer_text',
  'mistake_status',
  'mistake_analysis',
  'question_text',
  'answer_text',
  'analysis',
] as const;

export const REANSWER_TAGS = [
  'answer_text',
  'analysis',
  'mistake_status',
  'mistake_analysis',
  'wrong_answer_text',
  'geogebra_commands',
] as const;

function tagBlock(tags: readonly string[]): string {
  return tags.map((t) => `  <${t}>…</${t}>`).join('\n');
}

export function buildAnalyzePrompt(params: { subjectHint?: string; gradeHint?: string }): string {
  return [
    '你是一位严谨的中小学老师，正在把学生上传的错题图片/文字整理成结构化数据。',
    '',
    '必须严格按下面的 XML 标签输出，且**只输出这些标签**（不要开场白、不要结束语、不要 Markdown 代码块、不要 JSON）：',
    tagBlock(ANALYZE_TAGS),
    '',
    '字段要求：',
    '- subject：学科，取值仅限 chinese/math/english/olympiad/pet 之一；',
    '- knowledge_points：知识点名称列表（**每题最多 5 个**，用 ; 分隔）；',
    '- requires_image：true/false，题目是否必须有图才能解答；',
    '- wrong_answer_text：学生在图上写出的错误答案或过程（看不到则留空）；',
    '- mistake_status：not_attempted | wrong_attempt | unknown；',
    '- mistake_analysis：为什么会错（针对学生这次的具体错误，不要泛泛而谈）；',
    '- question_text：题干全文；表格请用 Markdown 表格转录，空单元格写 "-"，看不清处写 "[?]"；',
    '- answer_text：正确答案；',
    '- analysis：分步解析，**固定简体中文**（question_text 保持原题语言）。',
    '',
    '硬性约束：',
    '- 严禁使用 JSON 或 Markdown 代码块包裹结果；',
    '- 严禁 LaTeX 反斜杠二次转义（写 \\frac 而不是 \\\\frac）；',
    '- 严禁输出任何图片链接或 Markdown 图片语法；',
    params.subjectHint ? `- 学科提示：${params.subjectHint}（若与图片明显不符，以图片为准）` : '',
    params.gradeHint ? `- 年级提示：${params.gradeHint}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildReanswerPrompt(params: { questionText: string; wrongAnswerText?: string }): string {
  return [
    '你是一位严谨的中小学老师。下面是一道学生做错的题，请重新审题并给出结论。',
    '',
    '必须严格按下面的 XML 标签输出，且只输出这些标签（不要 Markdown 代码块、不要 JSON）：',
    tagBlock(REANSWER_TAGS),
    '',
    `题目：\n${params.questionText}`,
    params.wrongAnswerText ? `\n学生原答案：\n${params.wrongAnswerText}` : '',
    '',
    '约束：与识题相同（禁止 JSON/Markdown、禁止 LaTeX 二次转义、禁止图片链接）。',
  ]
    .filter(Boolean)
    .join('\n');
}

/** 上游 `extractTag()` 的等价实现：按标签名截取第一个开始与最后一个结束之间的内容 */
export function extractTag(text: string, tag: string): string | null {
  const open = text.indexOf(`<${tag}>`);
  const close = text.lastIndexOf(`</${tag}>`);
  if (open === -1 || close === -1 || close <= open) return null;
  const value = text.slice(open + tag.length + 2, close).trim();
  return value.length ? value : null;
}

export function extractTags(text: string, tags: readonly string[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const tag of tags) out[tag] = extractTag(text, tag);
  return out;
}
