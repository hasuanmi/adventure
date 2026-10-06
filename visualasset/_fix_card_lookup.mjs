// browser-check：把"创建任务后固定 sleep(2500) 再找一次卡片"改为轮询等待（最多 12s）
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../scripts/browser-check.mjs', import.meta.url);
let src = readFileSync(file, 'utf8');

const re = /(await cdp\.clickByText\('button', '创建任务'\);)(\s*\n)(\s*)await sleep\(2500\);(\s*\n)(\s*)const newCard = (await cdp\.evaluate\(`[\s\S]*?`\);)/;

if (!re.test(src)) {
  console.log('!! 未匹配到「创建任务 + sleep(2500) + 查找卡片」这段');
  process.exit(1);
}

src = src.replace(
  re,
  (_m, click, nl1, indent, nl2, indent2, evalExpr) =>
    `${click}${nl1}${indent}// 轮询等待新任务卡片出现（最多 12s），替代固定 sleep：列表未刷新完就断言会偶发失败${nl1}` +
    `${indent}let newCard = null;${nl1}` +
    `${indent}for (let attempt = 0; attempt < 24 && !newCard; attempt += 1) {${nl1}` +
    `${indent}  await sleep(500);${nl1}` +
    `${indent}  newCard = ${evalExpr}${nl1}` +
    `${indent}}`,
);

writeFileSync(file, src);
console.log('✓ 已改为轮询等待（最多 24×500ms = 12s）');
