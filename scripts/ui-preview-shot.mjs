// Pixel UI 原型页截图（无头 Edge/Chrome + CDP，无第三方依赖）
// 用法：node scripts/ui-preview-shot.mjs [--base http://localhost:4173] [--out ui-shots/ui-preview.png]
//
// 为什么单独写：scripts/browser-check.mjs 依赖完整业务栈（postgres + API + 登录 + 造数据），
// 而 /ui-preview 是**纯静态原型页、无 API / 无会话**，不需要那套前置。
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const argOf = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const BASE = argOf('base', 'http://localhost:4173');
const OUT = argOf('out', join('ui-shots', 'ui-preview.png'));
const PORT = argOf('port', '9222');
const PATH = argOf('path', '/ui-preview');
const WIDTH = Number(argOf('width', '1200'));

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
  console.error('ERROR 找不到 Edge/Chrome 可执行文件');
  process.exit(3);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 启动无头浏览器 ----------
const profile = join(process.cwd(), 'ui-shots', '.chrome-profile');
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
    '--disable-extensions',
    'about:blank',
  ],
  { stdio: 'ignore', detached: false },
);

async function browserWs() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const j = await r.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {
      /* 还没起来 */
    }
    await sleep(250);
  }
  throw new Error('浏览器调试端口未就绪');
}

const wsUrl = await browserWs();
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});

let msgId = 0;
const pending = new Map();
const events = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  } else if (m.method) {
    events.push(m);
  }
};
const send = (method, params = {}, sessionId) =>
  new Promise((res, rej) => {
    const id = ++msgId;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

// ---------- 开页面 + attach ----------
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });

await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send(
  'Emulation.setDeviceMetricsOverride',
  { width: WIDTH, height: 900, deviceScaleFactor: 2, mobile: false },
  sessionId,
);

const url = `${BASE}${PATH}`;
console.log(`navigate → ${url}`);
await send('Page.navigate', { url }, sessionId);

// 等 data-ui-preview 出现
let ready = false;
for (let i = 0; i < 60; i += 1) {
  await sleep(250);
  const r = await send(
    'Runtime.evaluate',
    { expression: `!!document.querySelector('[data-ui-preview]')`, returnByValue: true },
    sessionId,
  );
  if (r.result?.value === true) {
    ready = true;
    break;
  }
}
if (!ready) {
  const title = await send('Runtime.evaluate', { expression: 'document.title', returnByValue: true }, sessionId);
  console.error(`ERROR 未等到 [data-ui-preview]（title=${title.result?.value}）`);
  child.kill();
  process.exit(4);
}

// 等 Web 字体/像素图（本页是内联本地资源，给一个稳定窗口即可）
await sleep(800);

// ---------- 全页截图 ----------
const { contentSize } = await send('Page.getLayoutMetrics', {}, sessionId);
const h = Math.ceil(contentSize.height);
console.log(`content ${Math.ceil(contentSize.width)}x${h}`);
await send(
  'Emulation.setDeviceMetricsOverride',
  { width: WIDTH, height: h, deviceScaleFactor: 2, mobile: false },
  sessionId,
);
await sleep(400);

const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sessionId);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
console.log(`OK 截图已写出 → ${OUT}  (${h}px 高 @2x)`);

ws.close();
child.kill();
process.exit(0);
