// 用**本项目自己的 API**验证 AI 链路（注册临时用户 → /ai/status → /ai/analyze 文字 + 图片）
// 只读 .env 取配置（不打印密钥）。用法：node visualasset/_probe_api_ai.mjs
import { readFileSync } from 'node:fs';

const API = process.env.SMOKE_BASE || 'http://localhost:3000/api';
const stamp = Date.now().toString(36);

async function call(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
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

const user = `aiprobe${stamp}`;
const password = 'Probe1234';
const reg = await call('POST', '/auth/register', null, { username: user, password, role: 'child' });
console.log(`[register] ${reg.status}`);
const login = await call('POST', '/auth/login', null, { username: user, password });
const token =
  login.json?.accessToken || login.json?.access_token || login.json?.token || login.json?.tokens?.accessToken || '';
console.log(`[login] ${login.status}`);
if (!token) {
  console.log('  未取到 token，返回体：', login.text.slice(0, 300));
  process.exit(0);
}

const status = await call('GET', '/ai/status', token);
console.log(`[GET /ai/status] ${status.status} ${JSON.stringify(status.json)}`);

const t0 = Date.now();
const textCall = await call('POST', '/ai/analyze', token, {
  text: '小明把 3+4 算成了 8，请整理成结构化错题。',
});
console.log(`[POST /ai/analyze text] ${textCall.status} (${Date.now() - t0}ms)`);
if (textCall.status === 201 || textCall.status === 200) {
  const f = textCall.json?.fields ?? {};
  console.log('  fields:', JSON.stringify(f).slice(0, 400));
  console.log('  rawLen:', (textCall.json?.raw ?? '').length);
} else {
  console.log('  ', textCall.text.slice(0, 300));
}

const img = readFileSync(new URL('../apps/web/public/cards/card-01.png', import.meta.url)).toString('base64');
const t1 = Date.now();
const imgCall = await call('POST', '/ai/analyze', token, { imageBase64: img });
console.log(`[POST /ai/analyze image] ${imgCall.status} (${Date.now() - t1}ms)`);
if (imgCall.status === 201 || imgCall.status === 200) {
  console.log('  fields:', JSON.stringify(imgCall.json?.fields ?? {}).slice(0, 500));
} else {
  console.log('  ', imgCall.text.slice(0, 300));
}
