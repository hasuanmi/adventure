// 清理因删文案产生的空 <p ...> ... </p> 段落
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../apps/web/src/components/task-create/task-create-sheet.tsx', import.meta.url);
const lines = readFileSync(file, 'utf8').split('\n');
const out = [];
let removed = 0;
for (let i = 0; i < lines.length; i += 1) {
  const line = lines[i];
  const next = lines[i + 1] ?? '';
  // <p ...> 紧接 </p>（中间只有空白）→ 整段删除
  if (/^\s*<p\b[^>]*>\s*$/.test(line) && /^\s*<\/p>\s*$/.test(next)) {
    removed += 1;
    i += 1;
    continue;
  }
  out.push(line);
}
writeFileSync(file, out.join('\n'));
console.log(`清理空段落 ${removed} 处`);
