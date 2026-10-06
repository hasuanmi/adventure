// 通用单页截图：node scripts/shot-url.mjs --url <url|file:///path> --out <png> [--width 900] [--select a,b]
// 无头 Edge/Chrome + CDP，无第三方依赖。用于快速验证一个独立 HTML（如字体试验页）。
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const argOf = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const URL_ = argOf('url');
const OUT = argOf('out', 'ui-shots/shot.png');
const PORT = argOf('port', '9555');
const WIDTH = Number(argOf('width', '900'));
if (!URL_) {
  console.error('需要 --url');
  process.exit(2);
}

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => existsSync(p));
if (!EDGE) {
  console.error('找不到 Edge/Chrome');
  process.exit(3);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = resolve(dirname(OUT), '.chrome-profile-shot');
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
    '--allow-file-access-from-files',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function browserWs() {
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
  throw new Error(`调试端口未就绪（exitCode=${child.exitCode}）`);
}

const ws = new WebSocket(await browserWs());
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  }
};
const rootSend = (method, params = {}, sessionId) =>
  new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
const { targetId } = await rootSend('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await rootSend('Target.attachToTarget', { targetId, flatten: true });
const send = (m, p) => rootSend(m, p, sessionId);

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: WIDTH,
  height: 800,
  deviceScaleFactor: 2,
  mobile: false,
});
await send('Page.navigate', { url: URL_ });
await sleep(2500);
// 等字体真正加载完（关键：字体截图必须在 fonts.ready 之后）
const r = await send('Runtime.evaluate', {
  expression: `document.fonts.ready.then(()=>[...document.fonts].map(f=>f.family+':'+f.status).join('|'))`,
  awaitPromise: true,
  returnByValue: true,
});
console.log(`fonts → ${r.result?.value}`);

const { contentSize } = await send('Page.getLayoutMetrics');
await send('Emulation.setDeviceMetricsOverride', {
  width: WIDTH,
  height: Math.ceil(contentSize.height),
  deviceScaleFactor: 2,
  mobile: false,
});
await sleep(400);
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
console.log(`OK → ${OUT}`);
ws.close();
child.kill();
process.exit(0);
