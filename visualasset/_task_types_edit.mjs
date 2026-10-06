// 任务类型改造：默认码 + 分类白名单 + 表单文案/默认值
import { readFileSync, writeFileSync } from 'node:fs';

const edits = [
  {
    file: new URL('../packages/shared-types/src/reward-profile.ts', import.meta.url),
    pairs: [
      [
        "export const REWARD_PROFILE_DEFAULT_CODE = 'CUSTOM';",
        "export const REWARD_PROFILE_DEFAULT_CODE = 'TYPE_DAILY';",
      ],
      [
        "export const REWARD_PROFILE_CATEGORIES = ['daily', 'world', 'scenery', 'custom'] as const;",
        "export const REWARD_PROFILE_CATEGORIES = [\n  'daily',\n  'world',\n  'scenery',\n  'bounty',\n  'physical',\n  'custom',\n] as const;",
      ],
    ],
  },
  {
    file: new URL('../apps/web/src/components/task-create/task-create-sheet.tsx', import.meta.url),
    pairs: [
      ['<Label>奖励档位</Label>', '<Label>任务类型</Label>'],
      ["rewardProfile: '',", "rewardProfile: 'TYPE_DAILY',"],
    ],
  },
];

for (const { file, pairs } of edits) {
  let text = readFileSync(file, 'utf8');
  for (const [from, to] of pairs) {
    if (!text.includes(from)) {
      console.log(`!! 未找到：${from.slice(0, 50)}`);
      continue;
    }
    text = text.replace(from, to);
    console.log(`ok: ${from.slice(0, 40)} → ${to.slice(0, 40)}`);
  }
  writeFileSync(file, text);
}
