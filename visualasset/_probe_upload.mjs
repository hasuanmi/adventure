// 上传接口冒烟：注册→登录→上传 PNG→带鉴权取回→匿名取回应 401→非图片应 400
import { readFileSync } from 'node:fs';

const API = process.env.SMOKE_BASE || 'http://localhost:3000/api';
const stamp = Date.now().toString(36);

async function json(method, path, token, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try {
    return { status: res.status, json: JSON.parse(text) };
  } catch {
    return { status: res.status, json: null, text };
  }
}

const user = `uprobe${stamp}`;
const password = 'Probe1234';
console.log('[register]', (await json('POST', '/auth/register', null, { username: user, password, role: 'parent' })).status);
const login = await json('POST', '/auth/login', null, { username: user, password });
let token = login.json?.accessToken || '';
console.log('[login]', login.status, token ? '(有 token)' : '(无 token)');
if (!token) process.exit(0);

// 文件按 family 隔离，故先建家庭（与 browser-check 同路径）
const create = await json('POST', '/family/create', token);
console.log('[POST /family/create]', create.status, JSON.stringify(create.json).slice(0, 120));
const relogin = await json('POST', '/auth/login', null, { username: user, password });
token = relogin.json?.accessToken || token;
const me = await json('GET', '/family/me', token);
console.log('[GET /family/me]', me.status, me.json?.family?.id ? '有家庭' : JSON.stringify(me.json).slice(0, 120));

const png = readFileSync(new URL('../apps/web/public/cards/card-01.png', import.meta.url));
const form = new FormData();
form.append('file', new Blob([png], { type: 'image/png' }), 'card-01.png');
const up = await fetch(`${API}/files?scope=wrong-question`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: form,
});
const upJson = await up.json().catch(() => null);
console.log('[POST /files]', up.status, JSON.stringify(upJson));

if (upJson?.key) {
  const got = await fetch(`${API}/files?key=${encodeURIComponent(upJson.key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const buf = Buffer.from(await got.arrayBuffer());
  console.log('[GET /files authed]', got.status, `bytes=${buf.length}`, `match=${buf.equals(png)}`, `mime=${got.headers.get('content-type')}`);

  const anon = await fetch(`${API}/files?key=${encodeURIComponent(upJson.key)}`);
  console.log('[GET /files anon]', anon.status);

  const escaped = await fetch(`${API}/files?key=${encodeURIComponent('../../etc/passwd')}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('[GET /files path traversal]', escaped.status);
}

const bad = new FormData();
bad.append('file', new Blob([Buffer.from('not an image')], { type: 'text/plain' }), 'x.txt');
const badRes = await fetch(`${API}/files`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: bad,
});
console.log('[POST /files txt]', badRes.status, (await badRes.text()).slice(0, 160));
