// 任务类型图标/文案映射：补 bounty + physical，并把文案改为用户命名
import { readFileSync, writeFileSync } from 'node:fs';

const icons = new URL('../apps/web/src/lib/task-icons.ts', import.meta.url);
const keys = [...readFileSync(icons, 'utf8').matchAll(/\{ key: '([a-z0-9-]+)'/g)].map((m) => m[1]);
console.log('可用图标：', keys.join(','));

// 体能锻炼没有专门图标 → 优先选山/石/树，否则退回中性箱子
const physicalKey = ['mountain', 'rock', 'tree', 'crate'].find((k) => keys.includes(k)) ?? 'crate';

const file = new URL('../apps/web/src/lib/quest-icons.ts', import.meta.url);
let text = readFileSync(file, 'utf8');

text = text.replace(
  /const ICON_KEY_BY_CATEGORY: Record<RewardProfileCategory, string> = \{[\s\S]*?\};/,
  `const ICON_KEY_BY_CATEGORY: Record<RewardProfileCategory, string> = {
  daily: 'daily',
  world: 'world',
  scenery: 'nature',
  bounty: 'bounty',
  physical: '${physicalKey}',
  custom: 'bounty',
};`,
);

text = text.replace(
  /const TYPE_LABEL_BY_CATEGORY: Record<RewardProfileCategory, string> = \{[\s\S]*?\};/,
  `const TYPE_LABEL_BY_CATEGORY: Record<RewardProfileCategory, string> = {
  daily: '日常任务',
  world: '科学人文素养',
  scenery: '人际交往',
  bounty: '悬赏任务',
  physical: '体能锻炼',
  custom: '自定义任务',
};`,
);

writeFileSync(file, text);
console.log(`体能锻炼图标 key = ${physicalKey}`);
