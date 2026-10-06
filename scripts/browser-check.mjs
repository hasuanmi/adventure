// 真实浏览器 UI 检查（无头 Edge/Chrome + CDP，无需第三方依赖）
//
// 为什么需要它：P2 阶段的两次回归（"日期点不动"、"新建任务时间默认为空"）都是**纯前端交互**
// 问题 —— typecheck/build/API 冒烟全绿也发现不了。本脚本用真实鼠标事件点 UI 并断言 DOM，
// 同时把关键页面截图到 --out 目录，供人工复核。
//
// 用法：node scripts/browser-check.mjs [--base http://localhost:18080] [--out ./ui-shots]
// 前置：Docker 栈已起（web/nginx + api + postgres），且能连到 postgres（用于清理测试数据）。
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, openSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = argOf('base', 'http://localhost:18080');
const OUT = argOf('out', join(process.cwd(), 'ui-shots'));
const API = `${BASE}/api`;
const STAMP = Math.floor(100000 + Math.random() * 899999);
const PARENT = `ui_p_${STAMP}`;
const CHILD = `ui_c_${STAMP}`;
const PASSWORD = 'secret123';

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

// CDP 客户端用 Node 内置的全局 WebSocket（Node 21+ 才有）。CI 曾用 Node 20 跑本脚本，
// 报 "WebSocket is not defined" —— 这里显式提示，避免再靠猜。
if (typeof WebSocket === 'undefined') {
  console.error(`ERROR 本脚本需要 Node >= 21（内置 WebSocket），当前 ${process.version}。请用 Node 22 LTS 运行。`);
  process.exit(2);
}

let pass = 0;
let fail = 0;
const check = (name, actual, expected) => {
  if (`${actual}` === `${expected}`) {
    pass += 1;
    console.log(`PASS  ${name}  (got ${actual})`);
  } else {
    fail += 1;
    console.log(`FAIL  ${name}  expected=${expected} got=${actual}`);
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  return { status: res.status, json, text };
}

/** 直连开发库清理测试数据（psql 可用时；否则只打印提示） */
function cleanupDb() {
  const psql = process.env.PSQL || 'C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe';
  const names = `'${PARENT}','${CHILD}'`;
  const filter = `(SELECT id FROM users WHERE username IN (${names}))`;
  const sql = [
    `DELETE FROM approval_records WHERE request_id IN (SELECT id FROM approval_requests WHERE applicant_id IN ${filter} OR reviewer_id IN ${filter});`,
    `DELETE FROM approval_requests WHERE applicant_id IN ${filter} OR reviewer_id IN ${filter};`,
    `DELETE FROM users WHERE username IN (${names});`,
  ].join(' ');
  const r = spawnSync(
    psql,
    ['-h', process.env.PGHOST || 'localhost', '-U', process.env.PGUSER || 'huahua', '-d', process.env.PGDATABASE || 'huahua', '-t', '-A', '-c', sql],
    { env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || 'huahua_dev' }, encoding: 'utf8' },
  );
  if (r.error || r.status !== 0) {
    console.log(`WARN  DB 清理失败（可在库里手动删除 ${PARENT} / ${CHILD}）: ${r.error?.message || r.stderr?.trim()}`);
  } else {
    console.log('OK    DB 清理完成');
  }
}

// ---------------- 极简 CDP 客户端 ----------------
class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    // 握手必须有超时：Chrome 偶尔接受 TCP 却完不成 WS 握手，会把脚本永久挂住
    // （CI 上实测过一次：本地 40 秒的检查在 CI 里卡了 15 分钟以上）
    this.ready = Promise.race([
      new Promise((resolve, reject) => {
        this.ws.addEventListener('open', () => resolve());
        this.ws.addEventListener('error', (e) => reject(new Error(`CDP 连接失败: ${e.message ?? e.type}`)));
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('CDP WebSocket 握手超时（15s）')), 15000)),
    ]);
    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
        else resolve(msg.result);
      }
    });
  }

  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      // sessionId 必须在消息根级（放进 params 会得到 -32601 method not found）
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP 超时: ${method}`));
        }
      }, 20000);
    });
  }

  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      const detail = r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? 'unknown';
      throw new Error(`页面脚本异常: ${detail.split('\n')[0]}`);
    }
    return r.result.value;
  }

  /** 真实鼠标点击（走 pointer/mouse 事件链，能复现 pointer capture 之类的问题） */
  async clickAt(x, y) {
    const base = { x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 };
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...base });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
    await sleep(30);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
  }

  /** 按选择器点击元素中心（元素必须在视口内） */
  async clickSelector(selector) {
    const box = await this.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, text: (el.textContent || '').trim() };
    })()`);
    if (!box) throw new Error(`找不到元素: ${selector}`);
    await this.clickAt(box.x, box.y);
    return box;
  }

  /** 在选择器匹配的元素中，点击文本包含 text 的第一个（用于"某张卡片上的某个按钮"） */
  async clickByText(selector, text) {
    const box = await this.evaluate(`(() => {
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const el = els.find((e) => (e.textContent || '').includes(${JSON.stringify(text)}));
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: (el.textContent || '').trim().slice(0, 50) };
    })()`);
    if (!box) throw new Error(`找不到含文本「${text}」的 ${selector}`);
    await this.clickAt(box.x, box.y);
    return box;
  }

  /** 某张任务卡（按标题定位）的完整文本，用于断言卡片内状态 */
  cardText(title) {
    return this.evaluate(`(() => {
      const t = [...document.querySelectorAll('[data-task-card-toggle]')].find((e) => (e.textContent || '').includes(${JSON.stringify(title)}));
      return t ? (t.parentElement.innerText || '').replace(/\\n/g, ' | ') : null;
    })()`);
  }

  async type(selector, text) {
    await this.evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
    await this.send('Input.insertText', { text });
  }

  async shot(name) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    const file = join(OUT, `${name}.png`);
    writeFileSync(file, Buffer.from(r.data, 'base64'));
    console.log(`SHOT  ${file}`);
    return file;
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }

  /** 轮询等待选择器出现（SPA 启动引导/拉数据需要时间，固定 sleep 不可靠） */
  async waitFor(selector, timeoutMs = 12000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = await this.evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
      if (found) return true;
      if (Date.now() > deadline) {
        const where = await this.evaluate('location.pathname');
        const text = await this.evaluate('document.body.innerText.slice(0, 200)');
        throw new Error(`等待元素超时: ${selector}（path=${where} body="${String(text).replace(/\n/g, ' ')}"）`);
      }
      await sleep(250);
    }
  }
}

async function main() {
  // 看门狗：任何未预料的挂起都在 3 分钟后以明确退出码结束，避免 CI 卡到 job 超时
  const watchdog = setTimeout(() => {
    console.error('ERROR 全局超时（180s）：检查脚本疑似挂起，强制退出');
    process.exit(3);
  }, 180000);
  watchdog.unref();

  mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();
  const mark = (label) => console.log(`STEP  +${Math.round((Date.now() - t0) / 1000)}s  ${label}`);

  // ---------- 0. 造数据：家长（已建家庭）+ 孩子 + 今天的任务 ----------
  mark('准备测试数据');
  console.log(`=== BROWSER CHECK (base=${BASE}) ===`);
  await api('POST', '/auth/register', null, { username: PARENT, password: PASSWORD, role: 'parent' });
  const parentLogin = await api('POST', '/auth/login', null, { username: PARENT, password: PASSWORD });
  const parentToken = parentLogin.json?.accessToken;
  if (!parentToken) throw new Error(`家长登录失败: ${parentLogin.status} ${parentLogin.text}`);
  const family = await api('POST', '/family/create', parentToken);
  check('prepare: family created', Boolean(family.json?.familyId), true);
  await api('POST', '/auth/register', null, { username: CHILD, password: PASSWORD, role: 'child' });
  const childLogin = await api('POST', '/auth/login', null, { username: CHILD, password: PASSWORD });
  const childToken = childLogin.json?.accessToken;
  await api('POST', '/family/join', childToken, { code: PARENT });
  const me = await api('GET', '/family/me', parentToken);
  const childId = me.json.members.find((m) => m.username === CHILD)?.id;
  const parentId = me.json.members.find((m) => m.username === PARENT)?.id;

  // 今天 14:00–15:00 的日程任务（让日程页有内容可看；同时用于可展开面板/行内操作断言）
  const todayStart = new Date();
  todayStart.setHours(14, 0, 0, 0);
  const todayEnd = new Date(todayStart.getTime() + 60 * 60 * 1000);
  const taskTitle = `UI 检查任务 ${STAMP}`;
  await api('POST', '/tasks', parentToken, {
    childId,
    title: taskTitle,
    description: '做完 20 道口算并自查（UI 检查用完成标准）',
    startAt: todayStart.toISOString(),
    endAt: todayEnd.toISOString(),
    requiresApproval: true,
    reviewerId: parentId,
  });

  // ---------- 1. 启动无头浏览器 ----------
  const exe = EDGE_CANDIDATES.find((p) => existsSync(p));
  if (!exe) throw new Error('找不到 Chromium 内核浏览器（Edge/Chrome）');
  mark(`启动浏览器 ${exe}`);
  const port = 9333 + Math.floor(Math.random() * 200);
  const profile = join(tmpdir(), `ui-check-${STAMP}`);
  const chromeLog = join(tmpdir(), `ui-check-chrome-${STAMP}.log`);
  const chromeLogFd = openSync(chromeLog, 'w');
  const browser = spawn(exe, [
    // 用 --headless（Chrome 132+ 即新 headless；旧版也支持 CDP），比 --headless=new 跨版本更稳
    '--headless',
    '--disable-gpu',
    // CI（Linux root 容器）下必须关沙箱；本地 Windows 会忽略这些参数
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    `--remote-debugging-port=${port}`,
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--window-size=1280,900',
    'about:blank',
  ], { stdio: ['ignore', chromeLogFd, chromeLogFd] });

  /** 浏览器启动失败时，把 Chrome 自己的输出打出来（否则只能靠猜） */
  const dumpChromeLog = (why) => {
    let tail = '';
    try {
      tail = readFileSync(chromeLog, 'utf8').split('\n').filter(Boolean).slice(-25).join('\n  ');
    } catch {
      /* ignore */
    }
    console.error(`--- Chrome 日志（${why}）---\n  ${tail || '(无输出)'}\n--- /Chrome 日志 ---`);
  };

  const wsUrl = await (async () => {
    // 两条路径都试：
    // ① user-data-dir 下的 DevToolsActivePort（puppeteer 用的方式，Chrome 自己写端口+路径）
    // ② HTTP /json/version（最常见，但某些环境下端点不可达）
    const devtoolsPortFile = join(profile, 'DevToolsActivePort');
    const deadline = Date.now() + 60000; // CI 上 Chrome 冷启动可能明显更慢
    for (;;) {
      if (existsSync(devtoolsPortFile)) {
        try {
          const [p, path] = readFileSync(devtoolsPortFile, 'utf8').split('\n');
          if (p && path) return `ws://127.0.0.1:${p.trim()}${path.trim()}`;
        } catch {
          /* 文件可能正在写，下一轮再试 */
        }
      }
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/version`);
        const j = await res.json();
        if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
      } catch {
        /* 还没起来 */
      }
      // Chrome 已经退出 → 立刻失败并给出它自己的报错，不要白等 60 秒
      if (browser.exitCode !== null) {
        dumpChromeLog(`Chrome 已退出，exitCode=${browser.exitCode}`);
        throw new Error(`浏览器启动即退出（exitCode=${browser.exitCode}），见上方 Chrome 日志`);
      }
      if (Date.now() > deadline) {
        dumpChromeLog('等待调试端口超时 60s');
        throw new Error('浏览器调试端口未就绪（60s 超时）');
      }
      await sleep(300);
    }
  })();
  mark('调试端口就绪');

  const cdp = new Cdp(wsUrl);
  await cdp.ready;
  mark('CDP 已连接');
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const raw = cdp.send.bind(cdp);
  cdp.send = (method, params = {}) => raw(method, params, sessionId);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  try {
    // ---------- 2. 登录（真实输入 + 真实点击） ----------
    await cdp.send('Page.navigate', { url: `${BASE}/login` });
    await cdp.waitFor('#username');
    await cdp.shot('01-login');
    await cdp.type('#username', PARENT);
    await cdp.type('#password', PASSWORD);
    // 注意：页面上有多个含"登录"字样的按钮（切换 tab 的也是），必须精确定位表单提交按钮
    const submit = await cdp.evaluate(`(() => {
      const b = document.querySelector('form button[type="submit"]');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    if (!submit) throw new Error('找不到登录表单的提交按钮');
    await cdp.clickAt(submit.x, submit.y);
    await sleep(2500);
    const path1 = await cdp.evaluate('location.pathname');
    check('登录后进入首页', path1, '/');
    await cdp.shot('02-today');
    if (path1 !== '/') throw new Error(`登录失败（仍在 ${path1}），后续 UI 断言无意义`);

    // ---------- 2b. 整页刷新后仍保持登录（会话引导 bootstrap） ----------
    await cdp.send('Page.reload', { ignoreCache: true });
    await sleep(2500);
    const pathAfterReload = await cdp.evaluate('location.pathname');
    check('刷新页面后仍在首页（会话可恢复）', pathAfterReload, '/');
    await cdp.shot('02b-after-reload');

    // ---------- 3. 日程页：日期条点击（本轮修复点） ----------
    await cdp.send('Page.navigate', { url: `${BASE}/schedule` });
    await cdp.waitFor('div[aria-label="日期导航"]');
    await sleep(500);
    await cdp.shot('03-schedule');

    // 日期条内点击"明天"那一格：期望网格左列标题从「今天」变成「明天」
    const stripCount = await cdp.evaluate(`document.querySelectorAll('div[aria-label="日期导航"] button').length`);
    check('日程页日期条渲染 7 天', stripCount, 7);
    // 只取两日网格的列头（data-day-header）；不要用 body.innerText 找"今天"——
    // HUD 顶部也有一行固定日期，会串味（第一次写这个断言就踩了）
    const gridHeaders = () =>
      cdp.evaluate(`[...document.querySelectorAll('[data-day-header]')].map((e) => e.innerText.replace(/\\n/g, ' '))`);
    const headerBefore = (await gridHeaders())[0];
    const clicked = await cdp.evaluate(`(() => {
      const buttons = [...document.querySelectorAll('div[aria-label="日期导航"] button')];
      const idx = buttons.findIndex((b) => b.getAttribute('aria-pressed') === 'true');
      const next = buttons[Math.min(buttons.length - 1, idx + 1)];
      const r = next.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: next.textContent.trim(), aria: next.getAttribute('aria-label') };
    })()`);
    await cdp.clickAt(clicked.x, clicked.y);
    await sleep(800);
    const pressed = await cdp.evaluate(
      `[...document.querySelectorAll('div[aria-label="日期导航"] button')].findIndex((b) => b.getAttribute('aria-pressed') === 'true')`,
    );
    const headerAfter = (await gridHeaders())[0];
    console.log(`      clicked: ${clicked.aria || clicked.label} | 左列标题: ${headerBefore} -> ${headerAfter}`);
    check('点击日期条后选中项右移一天', pressed > 0, true);
    check('点击日期条后网格标题随之变化', headerAfter !== headerBefore, true);
    await cdp.shot('04-schedule-after-date-click');

    // ---------- 4. 网格表头点击（今天/明天） ----------
    const beforeHeaderClick = await gridHeaders();
    const gridHeader = await cdp.evaluate(`(() => {
      const els = [...document.querySelectorAll('[data-day-header]')];
      const b = els[1] ?? els[0];
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: b.innerText.replace(/\\n/g, ' ') };
    })()`);
    if (gridHeader) {
      await cdp.clickAt(gridHeader.x, gridHeader.y);
      await sleep(800);
      const afterHeaderClick = await gridHeaders();
      console.log(`      grid header click: ${gridHeader.label} | ${beforeHeaderClick[0]} -> ${afterHeaderClick[0]}`);
      check('点击网格表头可切换该日日程', afterHeaderClick[0] !== beforeHeaderClick[0], true);
    } else {
      check('网格表头可点', 'not-found', 'found');
    }
    await cdp.shot('05-schedule-after-header-click');

    // ---------- 4b. 底部导航不得遮挡内容（日程页实测被压住过） ----------
    await cdp.evaluate(`window.scrollTo(0, document.body.scrollHeight)`);
    await sleep(400);
    const overlap = await cdp.evaluate(`(() => {
      const nav = document.querySelector('nav');
      const grid = document.querySelector('[data-day-header]')?.closest('div.border-2');
      if (!nav || !grid) return null;
      const n = nav.getBoundingClientRect();
      const g = grid.getBoundingClientRect();
      return { gridBottom: Math.round(g.bottom), navTop: Math.round(n.top), gap: Math.round(n.top - g.bottom) };
    })()`);
    if (overlap) {
      console.log(`      滚到底：网格底 ${overlap.gridBottom} vs 导航顶 ${overlap.navTop}（gap ${overlap.gap}px）`);
      check('底部导航不遮挡日程网格', overlap.gap >= 0, true);
    } else {
      check('能取到网格与导航位置', 'not-found', 'found');
    }

    // ---------- 5. 新建任务：开始/结束时间默认今天 ----------
    await cdp.send('Page.navigate', { url: `${BASE}/` });
    await cdp.waitFor(`button`);
    const openBtn = await cdp.evaluate(`(() => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('新建任务'));
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    if (!openBtn) throw new Error('首页找不到「新建任务」按钮');
    await cdp.clickAt(openBtn.x, openBtn.y);
    await cdp.waitFor('input[type="datetime-local"]');
    await sleep(400);
    await cdp.shot('06-create-sheet');
    const slot = await cdp.evaluate(`(() => {
      const inputs = [...document.querySelectorAll('input[type="datetime-local"]')];
      return { count: inputs.length, start: inputs[0]?.value ?? null, end: inputs[1]?.value ?? null, now: new Date().toString() };
    })()`);
    const todayStr = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD（本地）
    console.log(`      默认时段: ${slot.start} -> ${slot.end}（今天=${todayStr}）`);
    check('存在开始/结束时间输入', slot.count, 2);
    check('开始时间默认今天', (slot.start || '').slice(0, 10), todayStr);
    check('结束时间默认今天', (slot.end || '').slice(0, 10), todayStr);
    const startMs = slot.start ? new Date(slot.start).getTime() : 0;
    const endMs = slot.end ? new Date(slot.end).getTime() : 0;
    check('默认开始时间不早于现在', startMs >= Date.now() - 60 * 1000, true);
    check('默认时长为 60 分钟', Math.round((endMs - startMs) / 60000), 60);
    check('两个时间都可编辑（非 disabled/readonly）', await cdp.evaluate(
      `[...document.querySelectorAll('input[type="datetime-local"]')].every((i) => !i.disabled && !i.readOnly)`,
    ), true);

    // 关掉新建任务 Sheet（Esc），回到干净的今日页
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(500);

    // ---------- 6. 今日页：TaskCard → 可展开任务面板（家长视角） ----------
    await cdp.send('Page.navigate', { url: `${BASE}/` });
    await cdp.waitFor('[data-task-card-toggle]');
    const collapsed = await cdp.evaluate(`document.querySelector('[data-task-card-toggle]').getAttribute('aria-expanded')`);
    check('任务卡默认收起', collapsed, 'false');
    await cdp.clickByText('[data-task-card-toggle]', taskTitle);
    await sleep(500);
    const expandedFlag = await cdp.evaluate(
      `[...document.querySelectorAll('[data-task-card-toggle]')].find((e) => e.textContent.includes(${JSON.stringify(taskTitle)})).getAttribute('aria-expanded')`,
    );
    check('点击任务卡展开', expandedFlag, 'true');
    const cardPanel = await cdp.cardText(taskTitle);
    check('展开面板含「进度（按状态）」', String(cardPanel).includes('进度（按状态）'), true);
    check('展开面板含「完成标准」', String(cardPanel).includes('完成标准'), true);
    check('完成标准取到 description', String(cardPanel).includes('做完 20 道口算'), true);
    check('展开面板含详情入口', String(cardPanel).includes('查看详情'), true);
    check('家长侧含编辑入口', String(cardPanel).includes('编辑'), true);
    await cdp.shot('07-task-card-expanded');

    // ---------- 7. 切换到孩子：行内「开始 / 完成」真实改状态 + 审批闸门 ----------
    await cdp.clickSelector('button[aria-label="退出登录"]');
    await cdp.waitFor('#username');
    await cdp.type('#username', CHILD);
    await cdp.type('#password', PASSWORD);
    const childSubmit = await cdp.evaluate(`(() => {
      const b = document.querySelector('form button[type="submit"]');
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    await cdp.clickAt(childSubmit.x, childSubmit.y);
    await cdp.waitFor('[data-task-card-toggle]');
    check('孩子登录后进入首页', await cdp.evaluate('location.pathname'), '/');

    // 本周打卡（孩子侧）
    const cells = await cdp.evaluate(`document.querySelectorAll('[data-checkin-cell]').length`);
    check('本周打卡渲染 7 格', cells, 7);
    check('本周打卡初始 0/7（新孩子无流水）', String(await cdp.evaluate('document.body.innerText')).includes('已点亮 0/7'), true);

    await cdp.clickByText('[data-task-card-toggle]', taskTitle);
    await sleep(400);
    check('孩子侧出现行内「开始」', String(await cdp.cardText(taskTitle)).includes('▶ 开始'), true);
    await cdp.clickByText('button', '▶ 开始');
    await sleep(1200);
    const afterStart = await cdp.cardText(taskTitle);
    check('点「开始」后状态变进行中', String(afterStart).includes('进行中'), true);
    check('点「开始」后出现行内「完成」', String(afterStart).includes('✓ 完成'), true);
    check('点「开始」后进度变为 50%', String(afterStart).includes('50%'), true);
    await cdp.shot('08-child-after-start');

    // 完成（该任务 requiresApproval=true）→ 应进入"等待家长确认"，任务状态不变
    await cdp.clickByText('button', '✓ 完成');
    await sleep(1500);
    const afterComplete = await cdp.cardText(taskTitle);
    check('需审批任务点完成后提示等待家长确认', String(afterComplete).includes('等待家长确认'), true);
    check('需审批任务提交后状态仍为进行中', String(afterComplete).includes('进行中'), true);
    await cdp.shot('09-child-submitted');

    // 再点一次完成 → 409（同一任务已有 pending 完成）应给出友好提示而不是崩溃
    await cdp.clickByText('button', '✓ 完成');
    await sleep(1500);
    const afterDuplicate = await cdp.cardText(taskTitle);
    check('重复提交给出友好提示（未崩溃）', String(afterDuplicate).includes('已提交过') || String(afterDuplicate).includes('等待家长确认'), true);
  } finally {
    clearTimeout(watchdog);
    try {
      cdp.close();
    } catch {
      /* ignore */
    }
    try {
      // Linux 下 Chrome 会有子进程，SIGKILL 更干净
      browser.kill(process.platform === 'win32' ? undefined : 'SIGKILL');
    } catch {
      /* ignore */
    }
    try {
      closeSync(chromeLogFd);
    } catch {
      /* ignore */
    }
    try {
      rmSync(profile, { recursive: true, force: true });
      rmSync(chromeLog, { force: true });
    } catch {
      /* ignore */
    }
    cleanupDb();
  }

  console.log(`=== RESULT: pass=${pass} fail=${fail} (${Math.round((Date.now() - t0) / 1000)}s) ===`);
  // 必须显式退出：残留的 WS/子进程句柄会让 Node 不退出，CI 步骤就会一直挂着
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`ERROR ${err.message}`);
  try {
    cleanupDb();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
