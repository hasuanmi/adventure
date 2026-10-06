// 精确替换剩余文案（避免缩进匹配问题）
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../apps/web/src/pages/TaskDetailPage.tsx', import.meta.url);
const text = readFileSync(file, 'utf8');
const next = text.split('>奖励档位<').join('>任务类型<');
writeFileSync(file, next);
console.log(text === next ? '未找到目标' : '已替换 TaskDetailPage 的「奖励档位」→「任务类型」');
