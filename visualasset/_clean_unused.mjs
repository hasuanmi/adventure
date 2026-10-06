// 清理因改用平铺下拉而不再使用的导入/常量
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../apps/web/src/components/task-create/task-create-sheet.tsx', import.meta.url);
let t = readFileSync(file, 'utf8');

// 逐行删除不再使用的项
const drop = [
  "import type { RewardProfileCategory } from '@huahua/shared-types';",
  '  categoryIconUrl,',
  '  SelectGroup,',
  '  SelectLabel,',
];
for (const d of drop) {
  if (t.includes(d + '\n')) t = t.replace(d + '\n', '');
  else if (t.includes(d)) t = t.replace(d, '');
}

// 删除 profileGroups 常量定义（多行数组）
t = t.replace(/const profileGroups: \{ category: string; label: string \}\[\] = \[[\s\S]*?\];\n/, '');

writeFileSync(file, t);
console.log('已清理未使用导入与 profileGroups');
