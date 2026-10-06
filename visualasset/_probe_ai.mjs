// 一次性探测脚本（只读 .env；不打印密钥）：
//  1) 打印 DeepSeek 可用模型
//  2) 用 deepseek-flash 跑一次纯文字补全
//  3) 测试是否接受图片消息（视觉能力）
// 用法：node visualasset/_probe_ai.mjs
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const base = (env.AI_BASE_URL || '').replace(/\/$/, '');
const key = env.AI_API_KEY || '';
const model = env.AI_MODEL || '';
console.log(`base=${base} model=${model} keyLen=${key.length}`);
if (!base || !key) {
  console.log('缺 base_url 或 key，退出');
  process.exit(0);
}

async function call(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, text };
}

const models = await call('/models');
console.log(`\n[GET /models] ${models.status}`);
try {
  const json = JSON.parse(models.text);
  console.log('  models:', (json.data || []).map((m) => m.id).join(', ') || '(空)');
} catch {
  console.log('  body:', models.text.slice(0, 300));
}

const chat = await call('/chat/completions', {
  model,
  messages: [{ role: 'user', content: '只回复两个字：通过' }],
  max_tokens: 16,
});
console.log(`\n[POST /chat/completions text] ${chat.status}`);
console.log('  ', chat.text.slice(0, 400));

// 1x1 透明 PNG，测视觉输入是否被接受
const tinyPng =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AF/9Ue0AAAAAElFTkSuQmCC';
const vision = await call('/chat/completions', {
  model,
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: '这张图里有什么？' },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${tinyPng}` } },
      ],
    },
  ],
  max_tokens: 32,
});
console.log(`\n[POST /chat/completions vision] ${vision.status}`);
console.log('  ', vision.text.slice(0, 400));
