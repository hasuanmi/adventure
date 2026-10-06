// 首页改版对比截图（真实登录 + 真实数据 → 无头 Edge/Chrome + CDP）
//
// 用法：node scripts/today-compare-shot.mjs [--api http://localhost:3000/api] [--base http://localhost:4173] [--out ui-shots]
// 前置：API + Postgres 已起（docker compose up -d postgres / api），且 --base 上的 web 已构建并代理 /api。
//
// 为什么要真实登录：会话是**内存态 + httpOnly Cookie**（见 apps/web/src/store/auth.ts），
// 没法靠注入 localStorage 伪造；必须走登录接口拿到 Cookie，再让应用自己 bootstrap。
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const argOf = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const API = argOf('api', 'http://localhost:3000/api');
const BASE = argOf('base', 'http://localhost:4173');
const OUT = argOf('out', 'ui-shots');
const PORT = argOf('port', '9333');
const WIDTH = Number(argOf('width', '1100'));

if (typeof WebSocket === 'undefined') {
  console.error(`ERROR 需要 Node >= 21（内置 WebSocket），当前 ${process.version}`);
  process.exit(2);
}

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => existsSync(p));
if (!EDGE) {
  console.error('ERROR 找不到 Edge/Chrome');
  process.exit(3);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

// ============ 1. 造数据 ============
const STAMP = Math.floor(100000 + Math.random() * 899999);
const PARENT = `cmp_p_${STAMP}`;
const CHILD = `cmp_c_${STAMP}`;
const PASSWORD = 'secret123';

async function api(method, path, token, body) {
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
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 200)}`);
  return json;
}

console.log(`准备数据 parent=${PARENT} child=${CHILD}`);
await api('POST', '/auth/register', null, { username: PARENT, password: PASSWORD, role: 'parent' });
const parentLogin = await api('POST', '/auth/login', null, { username: PARENT, password: PASSWORD });
await api('POST', '/family/create', parentLogin.accessToken);

await api('POST', '/auth/register', null, { username: CHILD, password: PASSWORD, role: 'child' });
const childLogin = await api('POST', '/auth/login', null, { username: CHILD, password: PASSWORD });
await api('POST', '/family/join', childLogin.accessToken, { code: PARENT });
const childMe = await api('GET', '/auth/me', childLogin.accessToken);
const realChildId = childMe.id ?? childMe.user?.id;
if (!realChildId) throw new Error(`拿不到 childId，/auth/me = ${JSON.stringify(childMe)}`);

const todayStart = new Date();
todayStart.setHours(14, 0, 0, 0);
const todayEnd = new Date(todayStart.getTime() + 60 * 60 * 1000);

// 4 个今日任务 → 分段进度会出现 4 格
// icon 显式给上：不给的话 taskTileIconUrl 全部回退到 'crate'（木箱），4 张卡会长得一模一样
const demoTasks = [
  { title: '口算 20 题', icon: 'daily' },
  { title: '朗读课文 10 分钟', icon: 'bounty' },
  { title: '整理书桌', icon: 'chest' },
  { title: '英语单词 5 个', icon: 'world' },
];
const ids = [];
for (const t of demoTasks) {
  const created = await api('POST', '/tasks', parentLogin.accessToken, {
    childId: realChildId,
    title: t.title,
    icon: t.icon,
    description: '完成标准：做完并自查一遍',
    startAt: todayStart.toISOString(),
    endAt: todayEnd.toISOString(),
    requiresApproval: false,
  });
  ids.push(created.id);
}
// 完成第 1 个 → 进度 1/4（分段条只亮 1 格，便于验证分段语义）
await api('POST', `/tasks/${ids[0]}/status`, childLogin.accessToken, { action: 'start' });
await api('POST', `/tasks/${ids[0]}/status`, childLogin.accessToken, { action: 'complete' });
console.log(`已建 ${ids.length} 个任务并完成 1 个（childId=${realChildId}）`);

// ============ 2. 无头浏览器 ============
// ⚠️ 必须是**绝对路径**：Edge 以相对路径解析 --user-data-dir 会直接退出（exitCode=21）
const profile = resolve(OUT, '.chrome-profile-cmp');
mkdirSync(profile, { recursive: true });
const child = spawn(
  EDGE,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--hide-scrollbars',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function browserWs() {
  // 注意：机器上可能有大量其他 Edge 进程（用户自己的浏览会话），启动可能较慢 → 给足 40 秒
  for (let i = 0; i < 80; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const j = await r.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error(`浏览器调试端口 ${PORT} 未就绪（child.exitCode=${child.exitCode}）`);
}

const ws = new WebSocket(await browserWs());
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});
let msgId = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  }
};
const rootSend = (method, params = {}, sessionId) =>
  new Promise((res, rej) => {
    const id = ++msgId;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

const { targetId } = await rootSend('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await rootSend('Target.attachToTarget', { targetId, flatten: true });
const send = (m, p) => rootSend(m, p, sessionId);
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r.result?.value;
};
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: WIDTH,
  height: 900,
  deviceScaleFactor: 2,
  mobile: false,
});

async function waitFor(selector, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return true;
    if (Date.now() > deadline) {
      const where = await evaluate('location.pathname');
      const body = await evaluate('document.body.innerText.slice(0, 300)');
      throw new Error(`等待超时 ${selector} path=${where} body="${String(body).replace(/\n/g, ' ')}"`);
    }
    await sleep(250);
  }
}
async function click(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
}

/** AppLayout 的 main 自带 overflow-y-auto，全页截图需要先解除高度约束 */
const EXPAND = `(() => {
  const m = document.querySelector('main');
  if (m) { m.style.overflow = 'visible'; m.style.height = 'auto'; m.style.maxHeight = 'none'; }
  const root = document.querySelector('#root > div');
  if (root) { root.style.height = 'auto'; }
  document.body.style.overflow = 'visible';
  return true;
})()`;

async function shot(name, url, afterReady) {
  await send('Page.navigate', { url });
  await waitFor('main');
  await sleep(1500);
  if (afterReady) await afterReady();
  await evaluate(EXPAND);
  await sleep(500);
  const { contentSize } = await send('Page.getLayoutMetrics');
  const h = Math.ceil(contentSize.height);
  await send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: h,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await sleep(500);
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const file = join(OUT, `${name}.png`);
  writeFileSync(file, Buffer.from(r.data, 'base64'));
  console.log(`SHOT  ${file}  (${WIDTH}x${h} @2x)`);
}

// ---- 登录（真实表单）----
await send('Page.navigate', { url: `${BASE}/login` });
await waitFor('#username');
await evaluate(`document.querySelector('#username').focus()`);
await send('Input.insertText', { text: CHILD });
await evaluate(`document.querySelector('#password').focus()`);
await send('Input.insertText', { text: PASSWORD });
await sleep(200);
await evaluate(`document.querySelector('form button[type="submit"]').click()`);
await sleep(2500);
const afterLogin = await evaluate('location.pathname');
console.log(`登录后 path=${afterLogin}`);

// ---- 截图：新版 / 旧版 ----
await shot('today-compare-bit', `${BASE}/today-compare`, async () => {
  await waitFor('[data-cmp-mode]');
  const mode = await evaluate(`document.querySelector('[data-cmp-mode]').dataset.cmpMode`);
  if (mode !== 'bit') await click('[data-cmp-bit]');
  await sleep(1200);
});

await shot('today-compare-now', `${BASE}/today-compare`, async () => {
  await waitFor('[data-cmp-now]');
  await click('[data-cmp-now]');
  await sleep(1200);
});

ws.close();
child.kill();
process.exit(0);
