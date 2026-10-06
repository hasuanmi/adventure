// 一次性脚本：删除用户圈出的说明性文案（task-create-sheet.tsx）
// 规则：命中目标文案的行整行删除；若该行同时是 <p ...>text</p> 的单行形式，一并删掉。
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../apps/web/src/components/task-create/task-create-sheet.tsx', import.meta.url);
const targets = [
  '填写任务信息；可设置开始时间让它出现在日程',
  '默认「今天 · 下一个整点起 1 小时」，可直接改',
  '来自系统配置，只显示名称',
  '选择后该任务在今日列表/详情显示这枚图标',
  '勾选后该任务每周固定星期出现在日程',
];

const src = readFileSync(file, 'utf8');
const lines = src.split('\n');
const kept = [];
const removed = [];

for (const line of lines) {
  const hit = targets.find((t) => line.includes(t));
  if (hit) {
    removed.push({ text: hit, line: line.trim() });
    continue;
  }
  kept.push(line);
}

writeFileSync(file, kept.join('\n'));
console.log(`删除 ${removed.length} 行：`);
for (const r of removed) console.log(`  - [${r.text}]  ← ${r.line.slice(0, 80)}`);
