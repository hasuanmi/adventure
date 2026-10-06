// 复测：1) 文字补全（大 max_tokens，看 content 是否为空）2) 视觉（用真实 640×360 PNG）
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
const key = env.AI_API_KEY;
const model = env.AI_MODEL;

async function chat(body) {
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

const t = await chat({
  model,
  messages: [{ role: 'user', content: '只回复两个字：通过' }],
  max_tokens: 256,
});
const msg = t.json?.choices?.[0]?.message;
console.log(`[text] ${t.status} content=${JSON.stringify(msg?.content)} reasoningLen=${(msg?.reasoning_content || '').length} finish=${t.json?.choices?.[0]?.finish_reason}`);

const big = readFileSync(new URL('../apps/web/public/cards/card-01.png', import.meta.url)).toString('base64');
const v = await chat({
  model,
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: '这张图片里有哪些像素元素？用一句话回答。' },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${big}` } },
      ],
    },
  ],
  max_tokens: 256,
});
console.log(`[vision 640x360] ${v.status}`);
if (v.status === 200) {
  const m = v.json?.choices?.[0]?.message;
  console.log(`  content=${JSON.stringify((m?.content || '').slice(0, 200))} reasoningLen=${(m?.reasoning_content || '').length}`);
} else {
  console.log('  ', v.text.slice(0, 300));
}
