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

  /** 按选择器点击元素中心：**先滚动进视口再量坐标**（否则点击落空，甚至被 Radix 当成"点外部"关掉弹窗） */
  async clickSelector(selector) {
    const found = await this.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      return true;
    })()`);
    if (!found) throw new Error(`找不到元素: ${selector}`);
    await sleep(150);
    const box = await this.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: (el.textContent || '').trim() };
    })()`);
    await this.clickAt(box.x, box.y);
    return box;
  }

  /** 在选择器匹配的元素中，点击文本包含 text 的第一个（先滚动进视口） */
  async clickByText(selector, text) {
    const found = await this.evaluate(`(() => {
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const el = els.find((e) => (e.textContent || '').includes(${JSON.stringify(text)}));
      if (!el) return false;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      return true;
    })()`);
    if (!found) throw new Error(`找不到含文本「${text}」的 ${selector}`);
    await sleep(150);
    const box = await this.evaluate(`(() => {
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const el = els.find((e) => (e.textContent || '').includes(${JSON.stringify(text)}));
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: (el.textContent || '').trim().slice(0, 50) };
    })()`);
    if (!box) throw new Error(`滚动后找不到含文本「${text}」的 ${selector}`);
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
  const createdTask = await api('POST', '/tasks', parentToken, {
    childId,
    title: taskTitle,
    description: '做完 20 道口算并自查（UI 检查用完成标准）',
    startAt: todayStart.toISOString(),
    endAt: todayEnd.toISOString(),
    requiresApproval: true,
    reviewerId: parentId,
  });
  const taskId = createdTask.json?.id;

  // 第二个任务：**无需审批** → 用于验证"提交页提交后自动定稿发奖 + 表单隐藏 + 打卡点亮"
  const task2Title = `UI 提交页任务 ${STAMP}`;
  const createdTask2 = await api('POST', '/tasks', parentToken, {
    childId,
    title: task2Title,
    description: '读完一章并写三句话总结（提交页用完成标准）',
    requiresApproval: false,
  });
  const task2Id = createdTask2.json?.id;
  check('prepare: 两个任务已创建', Boolean(taskId && task2Id), true);

  // 两个**完全同时间段**的任务（15:00–16:00）→ 验证"冲突显示 + 并排展示"
  const clashStart = new Date();
  clashStart.setHours(15, 0, 0, 0);
  const clashEnd = new Date(clashStart.getTime() + 60 * 60 * 1000);
  for (const title of [`冲突A ${STAMP}`, `冲突B ${STAMP}`]) {
    await api('POST', '/tasks', parentToken, {
      childId,
      title,
      startAt: clashStart.toISOString(),
      endAt: clashEnd.toISOString(),
      requiresApproval: false,
    });
  }

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

    // ---------- 4b. 底部导航不得遮挡内容（用户实测：日程网格被浮层导航压住） ----------
    // 结构保证：main 是 flex-1 的滚动容器，nav 是 shell 的独立一行 → main 底 <= nav 顶
    const layout = await cdp.evaluate(`(() => {
      const main = document.querySelector('main');
      const nav = document.querySelector('nav');
      if (!main || !nav) return null;
      const m = main.getBoundingClientRect();
      const n = nav.getBoundingClientRect();
      return { mainBottom: Math.round(m.bottom), navTop: Math.round(n.top), gap: Math.round(n.top - m.bottom) };
    })()`);
    if (layout) {
      console.log(`      布局：main 底 ${layout.mainBottom} / nav 顶 ${layout.navTop}（gap ${layout.gap}px）`);
      check('内容区与底部导航不重叠（结构性）', layout.gap >= -1, true);
    } else {
      check('能取到 main 与 nav 的位置', 'not-found', 'found');
    }
    // 整页不应出现文档级滚动（shell 是 100dvh；否则导航下面会漏出内容）
    const docScroll = await cdp.evaluate(`(() => {
      const nav = document.querySelector('nav');
      const root = document.getElementById('root');
      const shell = root ? root.firstElementChild : null;
      const kids = shell ? [...shell.children] : [];
      const last = kids[kids.length - 1];
      return {
        docH: document.documentElement.scrollHeight,
        winH: window.innerHeight,
        navBottom: nav ? Math.round(nav.getBoundingClientRect().bottom) : null,
        shellH: shell ? Math.round(shell.getBoundingClientRect().height) : null,
        lastChildIsNav: last ? last.contains(nav) : null,
        lastChildBottom: last ? Math.round(last.getBoundingClientRect().bottom) : null,
      };
    })()`);
    console.log(
      `      外壳：doc 高 ${docScroll.docH} / 视口 ${docScroll.winH}；shell 高 ${docScroll.shellH}；` +
        `nav 底 ${docScroll.navBottom}；最后一子元素含 nav=${docScroll.lastChildIsNav}（底 ${docScroll.lastChildBottom}）`,
    );
    check('无文档级滚动（doc 高 ≤ 视口高）', docScroll.docH <= docScroll.winH + 1, true);
    check('导航是外壳最后一个元素且底边不出视口', docScroll.lastChildIsNav === true && docScroll.navBottom <= docScroll.winH + 1, true);
    // 日程页网格滚到底后也不得越过导航顶
    await cdp.evaluate(`(() => { const m = document.querySelector('main'); if (m) m.scrollTop = m.scrollHeight; })()`);
    await sleep(400);
    const overlap = await cdp.evaluate(`(() => {
      const nav = document.querySelector('nav');
      const grid = document.querySelector('[data-day-header]')?.closest('div.border-2');
      const main = document.querySelector('main');
      if (!nav || !grid || !main) return null;
      const n = nav.getBoundingClientRect();
      const g = grid.getBoundingClientRect();
      const m = main.getBoundingClientRect();
      // 视觉可见范围受 main 盒子裁剪：取 grid 底与 main 底中较小者
      const visibleBottom = Math.min(g.bottom, m.bottom);
      return { gridBottom: Math.round(g.bottom), mainBottom: Math.round(m.bottom), navTop: Math.round(n.top), gap: Math.round(n.top - visibleBottom) };
    })()`);
    if (overlap) {
      console.log(`      滚到底：网格可见底 ${Math.min(overlap.gridBottom, overlap.mainBottom)} vs 导航顶 ${overlap.navTop}（gap ${overlap.gap}px）`);
      check('日程网格滚到底也不被导航遮住', overlap.gap >= -1, true);
    } else {
      check('能取到网格与导航位置', 'not-found', 'found');
    }

    // ---------- 4c. 当前时间线必须是**横线**（用户实测反馈：原来是竖线） ----------
    const timeLine = await cdp.evaluate(`(() => {
      const el = document.querySelector('[data-current-time-line]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), text: (el.textContent || '').trim() };
    })()`);
    if (timeLine) {
      console.log(`      当前时间线：${timeLine.w}x${timeLine.h} 标签=${timeLine.text}`);
      check('当前时间线是横线（宽 >> 高）', timeLine.w >= timeLine.h * 5, true);
      check('当前时间线带 HH:mm 标签', /^\d{2}:\d{2}$/.test(timeLine.text), true);
    } else {
      console.log('      当前时间线：此刻不在 07:30–21:30，改为固定时钟（14:00）覆盖');
    }

    // ---------- 4d. 固定时钟覆盖"当前时间线=横线"（不依赖真实时间） ----------
    const clock = await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        (() => {
          const RealDate = Date;
          const fixed = new RealDate(2026, 9, 6, 14, 0, 0).getTime(); // 本地 2026-10-06 14:00
          class MockDate extends RealDate {
            constructor(...args) { if (args.length === 0) super(fixed); else super(...args); }
            static now() { return fixed; }
          }
          window.Date = MockDate;
        })();
      `,
    });
    await cdp.send('Page.navigate', { url: `${BASE}/schedule` });
    await cdp.waitFor('[data-day-header]');
    await sleep(600);
    const fixedLine = await cdp.evaluate(`(() => {
      const el = document.querySelector('[data-current-time-line]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), text: (el.textContent || '').trim() };
    })()`);
    check('固定时钟下当前时间线存在', Boolean(fixedLine), true);
    if (fixedLine) {
      console.log(`      固定 14:00：时间线 ${fixedLine.w}x${fixedLine.h} 标签=${fixedLine.text}`);
      check('当前时间线是横线（宽 >> 高）', fixedLine.w >= fixedLine.h * 5, true);
      check('当前时间线标签为 14:00', fixedLine.text, '14:00');
    }
    await cdp.shot('15-schedule-current-time-line');
    if (clock?.identifier) await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: clock.identifier });
    await cdp.send('Page.navigate', { url: `${BASE}/schedule` });
    await cdp.waitFor('[data-day-header]');

    // ---------- 4e. 日程网格几何：表头/表体分格线对齐 + 两列等宽 + 格线可见 ----------
    const gridGeo = await cdp.evaluate(`(() => {
      const headers = [...document.querySelectorAll('[data-day-header]')].map((e) => e.getBoundingClientRect());
      const cols = [...document.querySelectorAll('[data-day-col]')].map((e) => e.getBoundingClientRect());
      const lines = [...document.querySelectorAll('[data-hour-line]')].map((e) => getComputedStyle(e).borderBottomColor);
      const panel = document.querySelector('[data-day-col]');
      const bg = panel ? getComputedStyle(panel).backgroundColor : '';
      const rgb = (s) => (s.match(/\\d+(\\.\\d+)?/g) || []).map(Number);
      const lum = (s) => { const [r, g, b] = rgb(s); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      return {
        headerDivider: headers.length === 2 ? Math.round(headers[1].left) : null,
        bodyDivider: cols.length === 2 ? Math.round(cols[1].left) : null,
        headerWidths: headers.map((r) => Math.round(r.width)),
        bodyWidths: cols.map((r) => Math.round(r.width)),
        lineColor: lines[0] ?? null,
        bgColor: bg,
        lineLum: lines[0] ? Math.round(lum(lines[0])) : null,
        bgLum: Math.round(lum(bg)),
      };
    })()`);
    console.log(
      `      网格：表头分格 x=${gridGeo.headerDivider} / 表体 x=${gridGeo.bodyDivider}；` +
        `列宽 表头[${gridGeo.headerWidths}] 表体[${gridGeo.bodyWidths}]；` +
        `格线 ${gridGeo.lineColor}(亮度 ${gridGeo.lineLum}) vs 背景 ${gridGeo.bgColor}(亮度 ${gridGeo.bgLum})`,
    );
    check('表头与表体的分格线对齐（|Δ| ≤ 2px）', Math.abs(gridGeo.headerDivider - gridGeo.bodyDivider) <= 2, true);
    check('表头两列等宽（|Δ| ≤ 1px）', Math.abs(gridGeo.headerWidths[0] - gridGeo.headerWidths[1]) <= 1, true);
    check('表体两列等宽（|Δ| ≤ 1px）', Math.abs(gridGeo.bodyWidths[0] - gridGeo.bodyWidths[1]) <= 1, true);
    check('格线比背景深（亮度差 ≥ 12，不是看不清的浅灰）', gridGeo.bgLum - gridGeo.lineLum >= 12, true);

    // ---------- 4f. 当前时间线的胶囊标签在左侧时间轴列内 ----------
    const clock2 = await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        (() => {
          const RealDate = Date;
          const fixed = new RealDate(2026, 9, 6, 14, 0, 0).getTime();
          class MockDate extends RealDate {
            constructor(...args) { if (args.length === 0) super(fixed); else super(...args); }
            static now() { return fixed; }
          }
          window.Date = MockDate;
        })();
      `,
    });
    await cdp.send('Page.navigate', { url: `${BASE}/schedule` });
    await cdp.waitFor('[data-current-time-line]');
    await sleep(400);
    const pill = await cdp.evaluate(`(() => {
      const label = document.querySelector('[data-current-time-label]');
      const col = document.querySelector('[data-day-col]');
      const line = document.querySelector('[data-current-time-line]');
      if (!label || !col || !line) return null;
      const l = label.getBoundingClientRect();
      const c = col.getBoundingClientRect();
      const ln = line.getBoundingClientRect();
      const radius = parseFloat(getComputedStyle(label).borderRadius) || 0;
      return {
        labelLeft: Math.round(l.left), colLeft: Math.round(c.left),
        radius, w: Math.round(l.width), h: Math.round(l.height),
        lineW: Math.round(ln.width), lineH: Math.round(ln.height),
        text: (label.textContent || '').trim(),
      };
    })()`);
    if (pill) {
      console.log(
        `      时间标签：left=${pill.labelLeft}（列左 ${pill.colLeft}）圆角=${pill.radius}px 尺寸=${pill.w}x${pill.h}；` +
          `横线 ${pill.lineW}x${pill.lineH} 文本=${pill.text}`,
      );
      check('时间标签位于左侧时间轴栏内（在列左边界之左）', pill.labelLeft < pill.colLeft, true);
      check('时间标签是胶囊（圆角 ≥ 8px）', pill.radius >= 8, true);
      check('时间标签文本为 HH:mm', /^\d{2}:\d{2}$/.test(pill.text), true);
      check('当前时间仍是横线（宽 >> 高）', pill.lineW >= pill.lineH * 5, true);
      await cdp.shot('16-current-time-pill');
    } else {
      check('固定时钟下能取到时间标签与横线', 'not-found', 'found');
    }
    if (clock2?.identifier) await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: clock2.identifier });

    // ---------- 4g. 整页滚动（上方日期条跟着滚走，表头仍固定） ----------
    const scrollInfo = await cdp.evaluate(`(() => {
      const sc = document.querySelector('[data-schedule-scroll]');
      const main = document.querySelector('main');
      const strip = document.querySelector('div[aria-label="日期导航"]');
      const header = document.querySelector('[data-day-header]');
      if (!sc || !main || !strip || !header) return null;
      main.scrollTop = 0;
      const before = { strip: Math.round(strip.getBoundingClientRect().top), header: Math.round(header.getBoundingClientRect().top) };
      main.scrollTop = 240;
      const after = {
        strip: Math.round(strip.getBoundingClientRect().top),
        header: Math.round(header.getBoundingClientRect().top),
        mainTop: Math.round(main.getBoundingClientRect().top),
      };
      return { inner: sc.scrollHeight - sc.clientHeight, before, after };
    })()`);
    if (scrollInfo) {
      console.log(
        `      滚动：网格自身可滚 ${scrollInfo.inner}px；日期条 ${scrollInfo.before.strip}→${scrollInfo.after.strip}；` +
          `表头 ${scrollInfo.before.header}→${scrollInfo.after.header}（main 顶 ${scrollInfo.after.mainTop}）`,
      );
      check('日程网格自身不再内部滚动（整页一起滚）', scrollInfo.inner <= 1, true);
      check('滚动后上方日期条跟着滚走', scrollInfo.after.strip < scrollInfo.before.strip - 50, true);
      check('滚动后表头仍固定在顶部', Math.abs(scrollInfo.after.header - scrollInfo.after.mainTop) <= 24, true);
    } else {
      check('能取到日程滚动容器/日期条/表头', 'not-found', 'found');
    }

    // ---------- 4h. 时间冲突：并排显示 + 冲突标记 ----------
    await cdp.evaluate(`(() => { const m = document.querySelector('main'); if (m) m.scrollTop = 0; })()`);
    await sleep(300);
    const clash = await cdp.evaluate(`(() => {
      const blocks = [...document.querySelectorAll('[data-task-block]')].filter((b) => (b.textContent || '').includes('冲突'));
      return {
        count: blocks.length,
        blocks: blocks.map((b) => {
          const r = b.getBoundingClientRect();
          return { left: Math.round(r.left), width: Math.round(r.width), lane: b.getAttribute('data-lane'), lanes: b.getAttribute('data-lane-count') };
        }),
        marked: document.querySelectorAll('[data-schedule-chip][data-conflict="true"]').length,
      };
    })()`);
    console.log(`      冲突：${clash.count} 个块 ${JSON.stringify(clash.blocks)}；标记冲突 ${clash.marked} 个`);
    check('同时间段的两个任务都渲染（不互相遮挡）', clash.count, 2);
    check('两个重叠任务分属不同车道', new Set(clash.blocks.map((b) => b.lane)).size, 2);
    check('重叠任务并排等宽（各约半列）', Math.abs(clash.blocks[0].width - clash.blocks[1].width) <= 2, true);
    check('重叠任务被标记冲突', clash.marked >= 2, true);
    await cdp.shot('17-schedule-conflict');

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
    // 图标选择器（每个任务可从素材库自选图标，而不是所有任务一个默认图标）
    const iconOptions = await cdp.evaluate(`document.querySelectorAll('[data-icon-option]').length`);
    check('创建弹窗提供素材库图标选择器（≥30 枚）', iconOptions >= 30, true);
    const iconLoaded = await cdp.evaluate(`(() => {
      const imgs = [...document.querySelectorAll('[data-icon-option] img')];
      return { total: imgs.length, ok: imgs.filter((i) => i.naturalWidth > 0).length };
    })()`);
    check('图标库图片全部可加载', iconLoaded.ok, iconLoaded.total);

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

    // ---------- 8. 表头成长入口（小女孩头像 + 等级经验栏）→ 成长页 ----------
    await cdp.send('Page.navigate', { url: `${BASE}/` });
    await cdp.waitFor('[data-growth-entry]');
    const headerText = await cdp.evaluate(
      `document.querySelector('[data-growth-entry]').innerText.replace(/\\n/g, ' ')`,
    );
    check('表头含等级徽章', /Lv\.\d+/.test(String(headerText)), true);
    check('表头含 XP 进度', String(headerText).includes('XP'), true);
    const avatarWidth = await cdp.evaluate(
      `(() => { const i = document.querySelector('[data-growth-entry] img'); return i ? i.naturalWidth : 0; })()`,
    );
    check('表头头像可加载（/avatar-girl.png 存在且可访问）', Number(avatarWidth) > 0, true);
    check('底部导航仍为 2 格（成长不占导航）', await cdp.evaluate(`document.querySelectorAll('nav a').length`), 2);
    await cdp.shot('10-header-growth-entry');

    await cdp.clickSelector('[data-growth-entry]');
    await sleep(1200);
    check('点击表头进入成长页', await cdp.evaluate('location.pathname'), '/growth');
    const growthText = String(await cdp.evaluate('document.body.innerText'));
    check(
      '成长页含六维全部标签',
      ['智识', '逻辑', '表达', '探索', '羁绊', '体魄'].every((l) => growthText.includes(l)),
      true,
    );
    check('成长页含金币', growthText.includes('金币'), true);
    check('成长页含奖励记录区', growthText.includes('奖励记录'), true);
    check('成长页含本周打卡', growthText.includes('本周打卡'), true);
    await cdp.shot('11-growth-page');

    // ---------- 9. 任务类型图标（quest_icons 接入：卡片 tile + HUD「冒险」） ----------
    await cdp.send('Page.navigate', { url: `${BASE}/` });
    await cdp.waitFor('[data-task-card-toggle]');
    const questImgs = await cdp.evaluate(`(() => {
      const imgs = [...document.querySelectorAll('img[src^="/icons/"]')];
      return { count: imgs.length, loaded: imgs.filter((i) => i.naturalWidth > 0).length };
    })()`);
    check('今日页使用素材库图标（HUD + 任务卡 tile，≥2 处）', questImgs.count >= 2, true);
    check('素材库图标全部加载成功（public/icons 资源可用）', questImgs.loaded, questImgs.count);
    // 卡片尺寸对齐 Demo 比例：图标约 32px（tile 44px），不要做成"大图标巨卡"
    const tileSize = await cdp.evaluate(`(() => {
      const t = document.querySelector('[data-task-card-toggle]');
      const img = t ? t.querySelector('img[src^="/icons/"]') : null;
      return img ? Math.round(img.getBoundingClientRect().width) : 0;
    })()`);
    check('任务卡图标尺寸贴合 Demo 比例（28–48px）', Number(tileSize) >= 28 && Number(tileSize) <= 48, true);

    // ---------- 10. 任务详情页微调（类型图标/进度/完成标准） ----------
    await cdp.send('Page.navigate', { url: `${BASE}/tasks/${taskId}` });
    await cdp.waitFor('dl');
    const detailText = String(await cdp.evaluate('document.body.innerText'));
    check('详情页含「完成标准」标题', detailText.includes('完成标准'), true);
    check('详情页完成标准取到 description', detailText.includes('做完 20 道口算'), true);
    check('详情页含「进度（按状态）」', detailText.includes('进度（按状态）'), true);
    const detailIcon = await cdp.evaluate(
      `(() => { const i = document.querySelector('img[src^="/icons/"]'); return i ? i.naturalWidth : 0; })()`,
    );
    check('详情页类型图标已加载', Number(detailIcon) > 0, true);
    await cdp.shot('12-task-detail');

    // ---------- 11. 提交页：提交后自动定稿发奖 + 表单隐藏（防重复提交） ----------
    await cdp.send('Page.navigate', { url: `${BASE}/tasks/${task2Id}/submit` });
    await cdp.waitFor('textarea');
    const submitText = String(await cdp.evaluate('document.body.innerText'));
    check('提交页显示完成标准', submitText.includes('读完一章'), true);
    await cdp.type('textarea', '读完了，写好了三句话总结');
    await cdp.clickByText('button', '提交完成');
    await sleep(2000);
    const afterSubmit = String(await cdp.evaluate('document.body.innerText'));
    check('无需审批任务提交后提示奖励已发放', afterSubmit.includes('成长奖励已发放'), true);
    const textareaGone = await cdp.evaluate(`document.querySelectorAll('textarea').length`);
    check('提交成功后表单已隐藏（避免重复提交）', textareaGone, 0);
    await cdp.shot('13-submit-result');

    // ---------- 12. 奖励闭环：打卡点亮 + 成长页累计 XP ----------
    await cdp.send('Page.navigate', { url: `${BASE}/` });
    await cdp.waitFor('[data-checkin-cell]');
    const checkinText = String(await cdp.evaluate('document.body.innerText'));
    check('完成任务后本周打卡点亮 1/7', checkinText.includes('已点亮 1/7'), true);
    // 打卡栏结构（对齐 Demo）：周一…周日标签在格子上方；今天=★、已打卡=✓
    const checkin = await cdp.evaluate(`(() => {
      const cells = [...document.querySelectorAll('[data-checkin-cell]')];
      const pad = (n) => String(n).padStart(2, '0');
      const d = new Date();
      const todayKey = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      return {
        labels: ['周一','周二','周三','周四','周五','周六','周日'].filter((l) => document.body.innerText.includes(l)).length,
        states: cells.map((c) => ({ key: c.getAttribute('title'), state: c.getAttribute('data-checkin-state') })),
        todayKey,
      };
    })()`);
    check('打卡栏含周一~周日 7 个标签', checkin.labels, 7);
    check('打卡栏恰有一格是今天', checkin.states.filter((c) => c.key === checkin.todayKey).length, 1);
    check(
      '打卡栏今天的格子已点亮（✓）',
      checkin.states.find((c) => c.key === checkin.todayKey)?.state,
      'done',
    );
    check('已打卡格数 ≥1', checkin.states.filter((c) => c.state === 'done').length >= 1, true);
    // 打卡格几何（对齐 Demo：正方形小格 + 格间留白，不是全宽矩形）
    const checkinGeo = await cdp.evaluate(`(() => {
      const cells = [...document.querySelectorAll('[data-checkin-cell]')].map((c) => c.getBoundingClientRect());
      const gaps = cells.slice(1).map((r, i) => Math.round(r.left - cells[i].right));
      return {
        w: Math.round(cells[0].width),
        h: Math.round(cells[0].height),
        maxWidth: Math.round(Math.max(...cells.map((r) => r.width))),
        minGap: Math.round(Math.min(...gaps)),
      };
    })()`);
    check('打卡格是正方形（宽高差 ≤2px）', Math.abs(checkinGeo.w - checkinGeo.h) <= 2, true);
    check('打卡格不铺满整宽（≤56px）', checkinGeo.maxWidth <= 56, true);
    check('打卡格之间有留白（≥8px）', checkinGeo.minGap >= 8, true);
    // 滚动到打卡区再截图（否则被浮动导航压住，人工复核看不到）
    await cdp.evaluate(
      `document.querySelector('[data-checkin-cell]')?.closest('div.border-2')?.scrollIntoView({ block: 'center' })`,
    );
    await sleep(400);
    await cdp.shot('14b-week-checkin');
    await cdp.clickSelector('[data-growth-entry]');
    await sleep(1200);
    const growthAfter = String(await cdp.evaluate('document.body.innerText'));
    check('成长页累计 XP 已增加', /累计 [1-9]\d* XP/.test(growthAfter), true);
    check('成长页奖励记录非空', growthAfter.includes('+') && growthAfter.includes('XP'), true);
    await cdp.shot('14-growth-after-reward');

    // ---------- 13. 自选图标：孩子经界面新建任务并选定素材库图标 ----------
    await cdp.send('Page.navigate', { url: `${BASE}/` });
    await cdp.waitFor('[data-task-card-toggle]');
    await cdp.clickByText('button', '新建任务');
    await cdp.waitFor('[data-icon-option]');
    const customTitle = `自选图标任务 ${STAMP}`;
    await cdp.type('input[name="title"]', customTitle);
    await cdp.clickSelector('[data-icon-option="sheep"]');
    await sleep(200);
    const picked = await cdp.evaluate(
      `document.querySelector('[data-icon-option="sheep"]').getAttribute('aria-pressed')`,
    );
    check('图标选择器可选中（aria-pressed 生效）', picked, 'true');
    await cdp.clickByText('button', '创建任务');
    await sleep(2500);
    const newCard = await cdp.evaluate(`(() => {
      const t = [...document.querySelectorAll('[data-task-card-toggle]')].find((e) => e.textContent.includes(${JSON.stringify(customTitle)}));
      if (!t) return null;
      const img = t.querySelector('img');
      return { src: img ? img.getAttribute('src') : null, w: img ? Math.round(img.getBoundingClientRect().width) : 0 };
    })()`);
    check('新建任务卡片显示自选图标', String(newCard?.src ?? '').includes('/icons/sheep.png'), true);
    check('自选图标渲染尺寸贴合 Demo（28–48px）', Number(newCard?.w ?? 0) >= 28 && Number(newCard?.w ?? 0) <= 48, true);

    // ---------- 13b. 取消任务（前端入口 + 二次确认 + 真删除） ----------
    await cdp.clickByText('[data-task-card-toggle]', customTitle);
    await sleep(400);
    await cdp.clickSelector('[data-cancel-task]');
    await sleep(400);
    const dialogOpen = await cdp.evaluate(
      `Boolean([...document.querySelectorAll('[role="alertdialog"] h2, [role="alertdialog"] *')].find((e) => (e.textContent || '').includes('取消这个任务')))`,
    );
    check('取消任务有二次确认弹窗', dialogOpen, true);
    await cdp.clickSelector('[data-confirm-cancel]');
    await sleep(2000);
    const afterCancel = await cdp.evaluate(
      `[...document.querySelectorAll('[data-task-card-toggle]')].some((e) => e.textContent.includes(${JSON.stringify(customTitle)}))`,
    );
    check('确认后任务从列表消失（软删除生效）', afterCancel, false);
    await cdp.shot('18-after-cancel');

    // ---------- 13c. 创建/编辑时的冲突提示（不阻止保存） ----------
    await cdp.clickByText('button', '新建任务');
    await cdp.waitFor('input[name="startAt"]');
    await cdp.evaluate(`(() => {
      const setVal = (sel, val) => {
        const el = document.querySelector(sel);
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const d = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const day = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      setVal('input[name="startAt"]', day + 'T15:10');
      setVal('input[name="endAt"]', day + 'T15:40');
    })()`);
    await sleep(600);
    const warn = await cdp.evaluate(`(() => {
      const el = document.querySelector('[data-conflict-warning]');
      return el ? (el.innerText || '').replace(/\\n/g, ' | ') : null;
    })()`);
    console.log(`      冲突提示：${warn}`);
    check('时间与已有任务重叠时给出冲突提示', Boolean(warn && warn.includes('时间冲突')), true);
    check('冲突提示列出冲突任务', String(warn ?? '').includes('冲突A'), true);
    await cdp.shot('19-conflict-warning');
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
