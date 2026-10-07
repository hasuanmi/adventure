// 真实浏览器 UI 检查（无头 Edge/Chrome + CDP，无需第三方依赖）
//
// 为什么需要它：P2 阶段的两次回归（"日期点不动"、"新建任务时间默认为空"）都是**纯前端交互**
// 问题 —— typecheck/build/API 冒烟全绿也发现不了。本脚本用真实鼠标事件点 UI 并断言 DOM，
// 同时把关键页面截图到 --out 目录，供人工复核。
//
// 用法：node scripts/browser-check.mjs [--base http://localhost:18080] [--out ./ui-shots]
// 前置：Docker 栈已起（web/nginx + api + postgres），且能连到 postgres（用于清理测试数据）。
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync, openSync, closeSync } from 'node:fs';
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
const ROOT = process.cwd();
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
  /** 完成凭证为必选：提交前填写凭证文字，否则前端会拦截提交 */
  const fillProof = async () => {
    await cdp.evaluate(`(() => {
      const el = document.querySelector('input[placeholder*="凭证"]');
      if (!el) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, '凭证：已完成并附上记录');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
  };

  /** 仅当卡片收起时才展开（盲目 toggle 会把已展开的卡片点收起，行内按钮随之消失） */
  const expandCard = async (titlePart) => {
    await cdp.evaluate(`(() => {
      const el = [...document.querySelectorAll('[data-task-card-toggle]')].find((x) => x.textContent.includes(${JSON.stringify(titlePart)}));
      if (el && el.getAttribute('aria-expanded') === 'false') el.click();
      return Boolean(el);
    })()`);
    await sleep(400);
  };
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
  // 供"任务详情页删除"用例使用
  const detailTask = await api('POST', '/tasks', parentToken, {
    childId,
    title: `详情删除测试 ${STAMP}`,
    requiresApproval: false,
  });
  const detailTaskId = detailTask.json?.id;

  // 两个**完全同时间段**的任务（15:00–16:00）→ 验证"冲突显示 + 并排展示"
  // 各带一个颜色 → 同时验证"日程任务块用所选颜色做实色底"
  const clashStart = new Date();
  clashStart.setHours(15, 0, 0, 0);
  const clashEnd = new Date(clashStart.getTime() + 60 * 60 * 1000);
  const clashColors = ['#3b82f6', '#4a9e6b'];
  const clashTitles = [`冲突A ${STAMP}`, `冲突B ${STAMP}`];
  const clashIds = [];
  for (let i = 0; i < clashTitles.length; i += 1) {
    const res = await api('POST', '/tasks', parentToken, {
      childId,
      title: clashTitles[i],
      startAt: clashStart.toISOString(),
      endAt: clashEnd.toISOString(),
      requiresApproval: false,
      color: clashColors[i],
    });
    clashIds.push(res.json?.id);
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
    console.log(`      clicked: ${clicked.aria || clicked.label} | 首列标题: ${headerBefore} -> ${headerAfter}`);
    check('点击日期条后选中项右移一天', pressed > 0, true);
    // 连续时间轴：聚焦到"选中日"那一列（用 ISO 比较，不再依赖列号）
    const focusedColIso = () =>
      cdp.evaluate(`(() => {
        const sc = document.querySelector('[data-schedule-scroll]');
        const base = sc.getBoundingClientRect().left + 56;
        const cols = [...document.querySelectorAll('[data-day-col]')];
        let best = null, bestD = Infinity;
        cols.forEach((c) => { const d = Math.abs(c.getBoundingClientRect().left - base); if (d < bestD) { bestD = d; best = c; } });
        return { iso: best?.getAttribute('data-day-iso') ?? null, dayCount: cols.length };
      })()`);
    const focusedAfter = await focusedColIso();
    console.log(`      聚焦列：${focusedAfter.iso}（共 ${focusedAfter.dayCount} 列）`);
    check('点击日期条后网格横向滚动聚焦到该日', Boolean(focusedAfter.iso), true);
    check('初始日期范围足够长（可左右拖动看其他日期）', Number(focusedAfter.dayCount) >= 20, true);
    await cdp.shot('04-schedule-after-date-click');

    // ---------- 4. 网格列头点击（点列头 → 回写选中日） ----------
    const beforeHeaderClick = await gridHeaders();
    const focusedBefore = await focusedColIso();
    const gridHeader = await cdp.evaluate(`(() => {
      const els = [...document.querySelectorAll('[data-day-header]')];
      const sc = document.querySelector('[data-schedule-scroll]');
      const base = sc.getBoundingClientRect().left + 56;
      // 选一个"当前可见但非聚焦"的列头
      const target = els.find((e, i) => {
        const r = e.getBoundingClientRect();
        return r.left > base + 200 && r.left < base + 420;
      }) ?? els[2];
      if (!target) return null;
      const r = target.getBoundingClientRect();
      const iso = target.closest('[data-day-header-row]')?.querySelectorAll('[data-day-header]')
        ? [...document.querySelectorAll('[data-day-header]')].indexOf(target)
        : -1;
      const col = document.querySelectorAll('[data-day-col]')[iso];
      return {
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
        iso: col?.getAttribute('data-day-iso') ?? null,
      };
    })()`);
    if (gridHeader?.iso) {
      await cdp.clickAt(gridHeader.x, gridHeader.y);
      await sleep(900);
      const afterHeaderClick = await gridHeaders();
      const focusedNow = await focusedColIso();
      console.log(
        `      grid header click: ${gridHeader.iso} | 首列 ${beforeHeaderClick[0]} -> ${afterHeaderClick[0]}；聚焦 ${focusedBefore.iso} -> ${focusedNow.iso}`,
      );
      check('点击网格列头把选中日切到该列（聚焦该日）', focusedNow.iso, gridHeader.iso);
      check('聚焦列发生变化（说明确实按点击切换了）', focusedNow.iso !== focusedBefore.iso, true);
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

    // ---------- 4e. 日程网格几何：表头/表体分格线对齐 + 每日列等宽 + 格线可见 + 横向可拖 ----------
    const gridGeo = await cdp.evaluate(`(() => {
      const headers = [...document.querySelectorAll('[data-day-header]')].map((e) => e.getBoundingClientRect());
      const cols = [...document.querySelectorAll('[data-day-col]')].map((e) => e.getBoundingClientRect());
      const lines = [...document.querySelectorAll('[data-hour-line]')].map((e) => getComputedStyle(e).borderBottomColor);
      const panel = document.querySelector('[data-day-col]');
      const bg = panel ? getComputedStyle(panel).backgroundColor : '';
      const rgb = (s) => (s.match(/\\d+(\\.\\d+)?/g) || []).map(Number);
      const lum = (s) => { const [r, g, b] = rgb(s); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const sc = document.querySelector('[data-schedule-scroll]');
      // 表头与对应列是否左右对齐（逐列比较 x）
      const maxDelta = Math.max(...headers.map((h, i) => (cols[i] ? Math.abs(h.left - cols[i].left) : 999)));
      return {
        dayCount: cols.length,
        headerCount: headers.length,
        maxHeaderColDelta: Math.round(maxDelta),
        headerWidths: headers.map((r) => Math.round(r.width)),
        bodyWidths: cols.map((r) => Math.round(r.width)),
        equalWidthSpread: Math.max(...cols.map((r) => r.width)) - Math.min(...cols.map((r) => r.width)),
        scrollWidth: sc ? sc.scrollWidth : 0,
        clientWidth: sc ? sc.clientWidth : 0,
        innerVerticalScroll: sc ? sc.scrollHeight - sc.clientHeight : 0,
        lineColor: lines[0] ?? null,
        bgColor: bg,
        lineLum: lines[0] ? Math.round(lum(lines[0])) : null,
        bgLum: Math.round(lum(bg)),
      };
    })()`);
    console.log(
      `      网格：${gridGeo.dayCount} 列；表头/列最大错位 ${gridGeo.maxHeaderColDelta}px；` +
        `列宽 [${gridGeo.bodyWidths.slice(0, 3)}…] 极差 ${gridGeo.equalWidthSpread}px；` +
        `横向可滚 ${gridGeo.scrollWidth}>${gridGeo.clientWidth}；纵向内部可滚 ${gridGeo.innerVerticalScroll}px；` +
        `格线 ${gridGeo.lineColor}(亮度 ${gridGeo.lineLum}) vs 背景 ${gridGeo.bgColor}(亮度 ${gridGeo.bgLum})`,
    );
    check('日程网格渲染连续多日（可左右拖动看其他日期）', Number(gridGeo.dayCount) >= 20, true);
    check('每列都有对应表头', Number(gridGeo.headerCount), Number(gridGeo.dayCount));
    check('表头与其所在列左右对齐（|Δ| ≤ 2px）', Number(gridGeo.maxHeaderColDelta) <= 2, true);
    check('各日列等宽（极差 ≤ 1px）', Number(gridGeo.equalWidthSpread) <= 1, true);
    check(
      '横向内容宽于容器（真的有可拖动的其他日期）',
      Number(gridGeo.scrollWidth) > Number(gridGeo.clientWidth),
      true,
    );
    check('网格自身不产生纵向滚动（整页滚动，原要求不回退）', Number(gridGeo.innerVerticalScroll) <= 1, true);
    check('格线比背景深（亮度差 ≥ 12，不是看不清的浅灰）', gridGeo.bgLum - gridGeo.lineLum >= 12, true);

    // ---------- 4e2. 鼠标左右拖动真的能平移（用户报告的核心 bug） ----------
    const dragResult = await cdp.evaluate(`(() => {
      const sc = document.querySelector('[data-schedule-scroll]');
      const r = sc.getBoundingClientRect();
      return { before: Math.round(sc.scrollLeft), cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + 120) };
    })()`);
    // 按住往左拖 260px（内容向右推进）→ scrollLeft 应增大
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: dragResult.cx, y: dragResult.cy, button: 'left', clickCount: 1 });
    for (let step = 1; step <= 8; step += 1) {
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: dragResult.cx - step * 32,
        y: dragResult.cy,
        button: 'left',
        buttons: 1,
      });
      await sleep(30);
    }
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: dragResult.cx - 256, y: dragResult.cy, button: 'left', clickCount: 1 });
    await sleep(400);
    const afterDrag = await cdp.evaluate(`Math.round(document.querySelector('[data-schedule-scroll]').scrollLeft)`);
    console.log(`      拖动：scrollLeft ${dragResult.before} → ${afterDrag}`);
    check('鼠标左右拖动可平移日程（看到其他日期）', Number(afterDrag) > Number(dragResult.before), true);
    // 拖动后表头与所在列仍然对齐（表头随列移动）
    const alignedAfterDrag = await cdp.evaluate(`(() => {
      const headers = [...document.querySelectorAll('[data-day-header]')].map((e) => e.getBoundingClientRect().left);
      const cols = [...document.querySelectorAll('[data-day-col]')].map((e) => e.getBoundingClientRect().left);
      return Math.round(Math.max(...headers.map((h, i) => Math.abs(h - cols[i]))));
    })()`);
    check('拖动后表头仍与所在列对齐（表头跟着一起动）', Number(alignedAfterDrag) <= 2, true);
    await cdp.shot('40-schedule-hpan');

    // 表头与表体在**任意滚动位置**都必须同步（用户报告"第一列表头和下方不同步"）
    const syncAt = async (left) => {
      await cdp.evaluate(`document.querySelector('[data-schedule-scroll]').scrollLeft = ${left}`);
      await sleep(120);
      return cdp.evaluate(`(() => {
        const headers = [...document.querySelectorAll('[data-day-header]')].map((e) => e.getBoundingClientRect().left);
        const cols = [...document.querySelectorAll('[data-day-col]')].map((e) => e.getBoundingClientRect().left);
        const deltas = headers.map((h, i) => Math.abs(h - cols[i]));
        return {
          max: Math.round(Math.max(...deltas) * 10) / 10,
          perCol: deltas.map((d) => Math.round(d * 10) / 10),
          scrollLeft: Math.round(document.querySelector('[data-schedule-scroll]').scrollLeft),
        };
      })()`);
    };
    const maxScroll = await cdp.evaluate(
      `(() => { const sc = document.querySelector('[data-schedule-scroll]'); return Math.round(sc.scrollWidth - sc.clientWidth); })()`,
    );
    for (const pos of [0, Math.round(maxScroll / 3), Math.round((maxScroll * 2) / 3), maxScroll]) {
      const sync = await syncAt(pos);
      console.log(`      表头同步 @scrollLeft=${sync.scrollLeft}: 各列偏差 [${sync.perCol}]`);
      check(`表头与列在 scrollLeft=${sync.scrollLeft} 时同步（每列 |Δ| ≤ 2px）`, sync.max <= 2, true);
    }
    await cdp.evaluate(`document.querySelector('[data-schedule-scroll]').scrollLeft = 0`);
    await sleep(150);

    // 今天/明天的表头结构必须与其他日期一致（用户报告"结构不一致"）
    const headerStruct = await cdp.evaluate(`(() => {
      const rows = [...document.querySelectorAll('[data-day-header]')].map((e) => ({
        lines: (e.innerText || '').split('\\n').map((s) => s.trim()).filter(Boolean),
      }));
      const dateLike = rows.filter((r) => /^\\d+月\\d+日$/.test(r.lines[0] ?? '')).length;
      return { total: rows.length, dateLike, sample: rows.slice(0, 3) };
    })()`);
    console.log(`      表头结构：${JSON.stringify(headerStruct)}`);
    check('所有日期表头结构一致（首行都是 M月D日）', headerStruct.dateLike, headerStruct.total);

    // 拖到最左继续拖 → **范围向前扩展**（列数变多、日期前移、位置被补偿不跳）
    const beforeExtend = await cdp.evaluate(`(() => {
      const sc = document.querySelector('[data-schedule-scroll]');
      sc.scrollLeft = 0;
      const cols = [...document.querySelectorAll('[data-day-col]')];
      return {
        count: cols.length,
        firstIso: cols[0]?.getAttribute('data-day-iso') ?? null,
      };
    })()`);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: dragResult.cx, y: dragResult.cy, button: 'left', clickCount: 1 });
    for (let step = 1; step <= 6; step += 1) {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: dragResult.cx + step * 30, y: dragResult.cy, button: 'left', buttons: 1 });
      await sleep(30);
    }
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: dragResult.cx + 180, y: dragResult.cy, button: 'left', clickCount: 1 });
    await sleep(900);
    const afterExtend = await cdp.evaluate(`(() => {
      const sc = document.querySelector('[data-schedule-scroll]');
      const cols = [...document.querySelectorAll('[data-day-col]')];
      const headers = [...document.querySelectorAll('[data-day-header]')].map((e) => e.getBoundingClientRect().left);
      const colLefts = cols.map((e) => e.getBoundingClientRect().left);
      return {
        count: cols.length,
        firstIso: cols[0]?.getAttribute('data-day-iso') ?? null,
        scrollLeft: Math.round(sc.scrollLeft),
        maxDelta: Math.round(Math.max(...headers.map((h, i) => Math.abs(h - colLefts[i]))) * 10) / 10,
      };
    })()`);
    console.log(
      `      边缘拖动扩展：${beforeExtend.count} 列(${beforeExtend.firstIso}) → ${afterExtend.count} 列(${afterExtend.firstIso})；scrollLeft=${afterExtend.scrollLeft}`,
    );
    check('拖到最左会向前扩展日期范围（可继续往过去拖）', Number(afterExtend.count) > Number(beforeExtend.count), true);
    check('扩展后首个日期前移（真的看到更早的日程）', afterExtend.firstIso < beforeExtend.firstIso, true);
    check('扩展后滚动位置被补偿（视觉不跳）', Number(afterExtend.scrollLeft) > 0, true);
    check('扩展后表头仍与列同步', Number(afterExtend.maxDelta) <= 2, true);

    // 再拖一次 → 还能继续扩展（证明"无限"）
    await cdp.evaluate(`document.querySelector('[data-schedule-scroll]').scrollLeft = 0`);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: dragResult.cx, y: dragResult.cy, button: 'left', clickCount: 1 });
    for (let step = 1; step <= 6; step += 1) {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: dragResult.cx + step * 30, y: dragResult.cy, button: 'left', buttons: 1 });
      await sleep(30);
    }
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: dragResult.cx + 180, y: dragResult.cy, button: 'left', clickCount: 1 });
    await sleep(900);
    const secondExtend = await cdp.evaluate(`(() => {
      const cols = [...document.querySelectorAll('[data-day-col]')];
      return { count: cols.length, firstIso: cols[0]?.getAttribute('data-day-iso') ?? null };
    })()`);
    console.log(`      再次扩展：${secondExtend.count} 列（首日 ${secondExtend.firstIso}）`);
    check('可连续多次扩展（无限拖动，不是只切一周）', Number(secondExtend.count) > Number(afterExtend.count), true);

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
      // 注意：整周网格里"今天"未必是第一列，必须取当前时间线**所在的那一列**来比
      const line = document.querySelector('[data-current-time-line]');
      const col = line?.closest('[data-day-col]') ?? document.querySelector('[data-day-col]');
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
    // 任务块用所选颜色做实色底（用户反馈"选颜色效果不对"）：实色 + 圆角 + 白字
    const chipStyle = await cdp.evaluate(`(() => {
      const chips = [...document.querySelectorAll('[data-schedule-chip][data-variant="task"]')]
        .filter((c) => (c.textContent || '').includes('冲突'));
      return chips.map((c) => {
        const s = getComputedStyle(c);
        return {
          title: (c.textContent || '').trim().slice(0, 12),
          bg: s.backgroundColor,
          color: s.color,
          radius: parseFloat(s.borderTopLeftRadius) || 0,
          borderStyle: s.borderTopStyle,
        };
      });
    })()`);
    console.log(`      任务块样式：${JSON.stringify(chipStyle)}`);
    check('任务块背景 = 所选颜色（实色底）', chipStyle.some((c) => c.bg === 'rgb(59, 130, 246)'), true);
    check('任务块文字为白色（对比明显）', chipStyle.every((c) => c.color === 'rgb(255, 255, 255)'), true);
    check('任务块有圆角', chipStyle.every((c) => c.radius >= 4), true);
    check('任务块不再是虚线边框', chipStyle.every((c) => c.borderStyle !== 'dashed'), true);
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
    // 默认时长 = 60 分钟；但 defaultTaskSlot() 在深夜会主动压缩到当天 23:59（不跨天，by design），
    // 所以这里按"≤60 且 ≥55 分钟"断言，避免断言变成"几点跑才通过"的时间依赖。
    const defaultMin = Math.round((endMs - startMs) / 60000);
    const startHour = new Date(startMs).getHours();
    // 23 点前必须正好 60 分钟；23 点后 defaultTaskSlot() 会把结束压到当天 23:59（不跨天，属设计），
    // 因此 23:55 起只剩几分钟是正常行为——按时段判定，避免时间依赖的断言。
    const slotOk = startHour < 23 ? defaultMin === 60 : defaultMin >= 1 && defaultMin <= 60;
    check('默认时长为 60 分钟（>=23 点自动压缩到当天 23:59）', slotOk, true);
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
    await expandCard(taskTitle);
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

    await expandCard(taskTitle);
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
    // 真正"卡内"定位：先在文档里找到标题含「冲突A」的卡片，再在其内部点「▶ 开始」
    await cdp.evaluate(`(() => {
      const toggle = [...document.querySelectorAll('[data-task-card-toggle]')].find((x) => x.textContent.includes('冲突A'));
      const root = toggle ? toggle.closest('div')?.parentElement ?? toggle.parentElement : null;
      const btn = root ? [...root.querySelectorAll('button')].find((b) => b.textContent.includes('▶ 开始')) : null;
      if (btn) btn.click();
      return Boolean(btn);
    })()`);
    await sleep(1000);
    await cdp.clickByText('button', '✓ 完成');
    // 完成凭证必选：进入凭证页 -> 填凭证 -> 提交 -> 回到首页（后续断言在首页任务卡上）
    await cdp.waitFor('input[placeholder*="凭证"]');
    await fillProof();
    await cdp.clickByText('button', '提交完成');
    await sleep(1200);
    await cdp.send('Page.navigate', { url: `${BASE}/` });
    await cdp.waitFor('[data-task-card-toggle]');
    await sleep(600);
    await sleep(1500);
    const afterComplete = await cdp.cardText(taskTitle);
    check('需审批任务点完成后显示「待检查」', String(afterComplete).includes('待检查') || String(afterComplete).includes('等待家长确认'), true);
    check('需审批任务提交后状态仍为进行中', String(afterComplete).includes('进行中'), true);
    await cdp.shot('09-child-submitted');

    // 再点一次完成 → 409（同一任务已有 pending 完成）应给出友好提示而不是崩溃
    // 真正"卡内"定位：先在文档里找到标题含「冲突A」的卡片，再在其内部点「▶ 开始」
    await cdp.evaluate(`(() => {
      const toggle = [...document.querySelectorAll('[data-task-card-toggle]')].find((x) => x.textContent.includes('冲突A'));
      const root = toggle ? toggle.closest('div')?.parentElement ?? toggle.parentElement : null;
      const btn = root ? [...root.querySelectorAll('button')].find((b) => b.textContent.includes('▶ 开始')) : null;
      if (btn) btn.click();
      return Boolean(btn);
    })()`);
    await sleep(1000);
    await cdp.clickByText('button', '✓ 完成');
    // 完成凭证必选：进入凭证页 -> 填凭证 -> 提交 -> 回到首页（后续断言在首页任务卡上）
    await cdp.waitFor('input[placeholder*="凭证"]');
    await fillProof();
    await cdp.clickByText('button', '提交完成');
    await sleep(1200);
    await cdp.send('Page.navigate', { url: `${BASE}/` });
    await cdp.waitFor('[data-task-card-toggle]');
    await sleep(600);
    await sleep(1500);
    const afterDuplicate = await cdp.cardText(taskTitle);
    check('重复提交给出友好提示（未崩溃）', String(afterDuplicate).includes('已提交过') || String(afterDuplicate).includes('等待家长确认'), true);

    // ---------- 顶部 Player HUD（2026-10-06 重设计：圆形头像 + LV 压左上 + 昵称右上 + XP 条无数字） ----------
    const hud = await cdp.evaluate(`(() => {
      const h = document.querySelector('[data-player-hud]');
      if (!h) return null;
      const frame = h.querySelector('[data-hud-avatar-frame]');
      const avatar = h.querySelector('[data-hud-avatar]');
      const badge = h.querySelector('[data-hud-level-badge]');
      const nick = h.querySelector('[data-hud-nickname]');
      const bar = h.querySelector('[data-hud-xp-bar]');
      const fill = h.querySelector('[data-hud-xp-fill]');
      const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
      return {
        avatar: r(avatar), frame: r(frame), badge: r(badge), nick: r(nick), bar: r(bar), fill: r(fill),
        badgeText: badge ? badge.textContent.trim() : '',
        nickText: nick ? nick.textContent.trim() : '',
        headerText: (document.querySelector('header') || document.body).innerText,
      };
    })()`);
    check('顶部为 Player HUD（data-player-hud）', Boolean(hud && hud.avatar), true);
    check('HUD 含圆形头像（≥36px 且宽高近似相等）', Boolean(hud && hud.avatar) && Math.abs(Number(hud.avatar.w) - Number(hud.avatar.h)) <= 2 && Number(hud.avatar.w) >= 36, true);
    check('HUD 含等级徽章且文案为 LV.n', /^LV\.\d+$/.test(String(hud && hud.badgeText ? hud.badgeText : '')), true);
    check('等级徽章压在头像框左上', Boolean(hud && hud.badge && hud.frame) && Number(hud.badge.l) < Number(hud.frame.l) && Number(hud.badge.t) <= Number(hud.frame.t) + 8, true);
    check('HUD 含昵称且非空', Boolean(hud && String(hud.nickText || '').length > 0), true);
    check('昵称位于头像右侧（不与头像重叠）', Boolean(hud && hud.nick && hud.frame) && Number(hud.nick.l) >= Number(hud.frame.r) - 2, true);
    check('昵称不与经验条重叠', !hud || !hud.nick || !hud.bar || Number(hud.nick.b) <= Number(hud.bar.t) + 2, true);
    check('HUD 含 XP 进度条与填充', Boolean(hud && hud.bar && hud.fill), true);
    check('经验条紧贴头像右缘（≤6px）', !hud || !hud.bar || !hud.frame || (Number(hud.bar.l) - Number(hud.frame.r) <= 6 && Number(hud.bar.l) - Number(hud.frame.r) >= -32), true);
    check('经验条底边与头像底边对齐（|Δ| ≤ 3px）', !hud || !hud.bar || !hud.frame || Math.abs(Number(hud.bar.b) - Number(hud.frame.b)) <= 3, true);
    check('首页头部不显示 XP 数字/文案', /XP|\d+\s*\/\s*\d+/.test(String((hud && hud.headerText) || '')), false);

    // ---------- 三段式 Header：中部产品品牌 + 日期副信息 ----------
    const brand = await cdp.evaluate(`(() => {
      const t = document.querySelector('[data-brand-title]');
      if (!t) return null;
      const d = document.querySelector('[data-brand-date]');
      const h = document.querySelector('header') || document.body;
      const rb = t.getBoundingClientRect(); const hb = h.getBoundingClientRect();
      const rd = d ? d.getBoundingClientRect() : null;
      const hudEl = document.querySelector('[data-player-hud]');
      const rh = hudEl ? hudEl.getBoundingClientRect() : null;
      return { text: t.textContent.trim(), cx: rb.left + rb.width / 2, headerCx: hb.left + hb.width / 2,
        dateText: d ? d.textContent.trim() : '', dateBelow: rd ? rd.top >= rb.bottom - 2 : false,
        rightOfHud: rh ? rb.left >= rh.right - 2 : false };
    })()`);
    check('中部产品名为「冒险之旅」', String((brand && brand.text) || ''), '冒险之旅');
    check('产品名位于 Header 中央（|Δ| ≤ 24px）', Boolean(brand) && Math.abs(Number(brand.cx) - Number(brand.headerCx)) <= 24, true);
    check('日期在品牌下方且含「月…日」', Boolean(brand) && /月.+日/.test(String(brand.dateText)) && Boolean(brand.dateBelow), true);
    check('品牌位于左侧角色区右侧', Boolean(brand) && Boolean(brand.rightOfHud), true);

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
    check('任务卡图标尺寸贴合当前视觉（20–48px）', Number(tileSize) >= 20 && Number(tileSize) <= 48, true);

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
    // 轮询等待新任务卡片出现（最多 12s），替代固定 sleep：列表未刷新完就断言会偶发失败
    let newCard = null;
    for (let attempt = 0; attempt < 24 && !newCard; attempt += 1) {
      await sleep(500);
      newCard = await cdp.evaluate(`(() => {
      const t = [...document.querySelectorAll('[data-task-card-toggle]')].find((e) => e.textContent.includes(${JSON.stringify(customTitle)}));
      if (!t) return null;
      const img = t.querySelector('img');
      return { src: img ? img.getAttribute('src') : null, w: img ? Math.round(img.getBoundingClientRect().width) : 0 };
    })()`);
    }
    check('新建任务卡片显示自选图标', String(newCard?.src ?? '').includes('/icons/sheep.png'), true);
    check('自选图标渲染尺寸贴合当前视觉（20–48px）', Number(newCard?.w ?? 0) >= 20 && Number(newCard?.w ?? 0) <= 48, true);

    // ---------- 13b. 取消任务（前端入口 + 二次确认 + 真删除） ----------
    await expandCard(customTitle);
    await sleep(400);
    await cdp.clickSelector('[data-cancel-task]');
    await sleep(400);
    const dialogOpen = await cdp.evaluate(
      `Boolean([...document.querySelectorAll('[role="alertdialog"] *')].find((e) => (e.textContent || '').includes('删除这个任务')))`,
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

    // ---------- 13d. 任务详情页的删除入口（用户反馈"没有删除功能"） ----------
    await cdp.send('Page.navigate', { url: `${BASE}/tasks/${detailTaskId}` });
    await cdp.waitFor('[data-delete-task]');
    check('详情页有删除按钮', await cdp.evaluate(`Boolean(document.querySelector('[data-delete-task]'))`), true);
    await cdp.clickSelector('[data-delete-task]');
    await sleep(400);
    await cdp.clickSelector('[data-confirm-cancel]');
    await sleep(1800);
    const detailGone = await cdp.evaluate(`location.pathname`);
    check('详情页删除后回到今日', detailGone, '/');
    const stillThere = await api('GET', '/tasks', childToken);
    const list = Array.isArray(stillThere.json) ? stillThere.json : (stillThere.json?.tasks ?? []);
    check('详情页删除后任务确实不在列表里', list.some((t) => t.id === detailTaskId) === false, true);

    // ---------- 13e. 今日冒险进度条：像素外框 / 跟随标记 / 动画 / 100% 状态 ----------
    // 先把「冲突A」推进到 in_progress，便于稍后行内点「完成」触发真实的进度变化
    await api('POST', `/tasks/${clashIds[0]}/status`, childToken, { action: 'start' });
    await cdp.send('Page.navigate', { url: `${BASE}/` });
    await cdp.waitFor('[data-adventure-progress]');
    await sleep(700);
    const adv1 = await cdp.evaluate(`(() => {
      const wrap = document.querySelector('[data-adventure-progress]');
      const inner = wrap.firstElementChild;          // 米白内层（自带 2px 描边 + 3px 内边距）
      const track = document.querySelector('[data-progress-track]');
      const marker = document.querySelector('[data-progress-marker]');
      const fill = document.querySelector('[data-progress-fill]');
      const r = (el) => el.getBoundingClientRect();
      const cs = (el) => getComputedStyle(el);
      const tr = r(track);
      const mr = r(marker);
      const pct = Number(wrap.getAttribute('data-progress-percent'));
      return {
        pct,
        // 多层边框：外层容器 2px 描边 + 其背景色即"暖棕层"（在 2px padding 处露出）
        wrapBorder: parseFloat(cs(wrap).borderTopWidth) || 0,
        wrapBandBg: cs(wrap).backgroundColor,
        innerBorder: inner ? parseFloat(cs(inner).borderTopWidth) || 0 : 0,
        innerBg: inner ? cs(inner).backgroundColor : null,
        innerPad: inner
          ? Math.round(tr.left - (r(inner).left + (parseFloat(cs(inner).borderLeftWidth) || 0)))
          : -1,
        trackBorder: parseFloat(cs(track).borderTopWidth) || 0,
        trackBg: cs(track).backgroundColor,
        trackH: Math.round(tr.height),
        markerH: Math.round(mr.height),
        markerRatio: Number((mr.height / tr.height).toFixed(2)),
        markerOffset: Math.round((mr.left + mr.right) / 2 - (tr.left + (tr.width * pct) / 100)),
        markerFromRight: Math.round(tr.right - (mr.left + mr.right) / 2),
        fillTransition: cs(fill).transitionDuration,
        markerTransition: cs(marker).transitionDuration,
        pulseNow: Boolean(document.querySelector('[data-progress-marker][data-marker-pulse="true"]')),
      };
    })()`);
    console.log(`      冒险进度条：${JSON.stringify(adv1)}`);
    check('进度条有多层像素外框（外 2px 深棕 + 暖棕层）', adv1.wrapBorder === 2 && adv1.wrapBandBg === 'rgb(122, 92, 56)', true);
    check('内层还有 2px 描边 + 米白底（多层像素边框）', adv1.innerBorder === 2 && adv1.innerBg === 'rgb(247, 237, 217)', true);
    check('条本体不贴外框（内边距 ≥ 2px）', Number(adv1.innerPad) >= 2, true);
    check('条本体自带 2px 描边 + 米色底（与页面像素 UI 一致）', adv1.trackBorder === 2 && adv1.trackBg === 'rgb(242, 229, 201)', true);
    check('进度标记尺寸约条高 1–1.5 倍', Number(adv1.markerRatio) >= 0.9 && Number(adv1.markerRatio) <= 1.8, true);
    check('进度标记跟随当前百分比（±3px）', Math.abs(Number(adv1.markerOffset)) <= 3, true);
    check('进度标记不固定在最右端', Number(adv1.pct) >= 100 || Number(adv1.markerFromRight) > 10, true);
    check('宽度与标记都有过渡（平滑增长而非瞬变）', adv1.fillTransition !== '0s' && adv1.markerTransition !== '0s', true);
    check('首次加载不播放完成动画', adv1.pulseNow === false, true);
    // 此时进度仅 25% → 按用户规则**不应**出现成长卡入口（100% 才出现，见 13f）
    check('任务未 100% 时不显示成长卡入口', await cdp.evaluate(`Boolean(document.querySelector('[data-growth-card-entry]'))`), false);
    await cdp.shot('21-adventure-progress');

    // 行内点「完成」→ 真实进度变化 → 应出现动画（标记弹跳 + 粒子）
    await expandCard(`冲突A ${STAMP}`);
    await sleep(400);
    // 真正"卡内"定位：先在文档里找到标题含「冲突A」的卡片，再在其内部点「▶ 开始」
    await cdp.evaluate(`(() => {
      const toggle = [...document.querySelectorAll('[data-task-card-toggle]')].find((x) => x.textContent.includes('冲突A'));
      const root = toggle ? toggle.closest('div')?.parentElement ?? toggle.parentElement : null;
      const btn = root ? [...root.querySelectorAll('button')].find((b) => b.textContent.includes('▶ 开始')) : null;
      if (btn) btn.click();
      return Boolean(btn);
    })()`);
    await sleep(1000);
    await cdp.clickByText('button', '✓ 完成');
    // 完成凭证必选：进入凭证页 -> 填凭证 -> 提交 -> 回到首页（后续断言在首页任务卡上）
    await cdp.waitFor('input[placeholder*="凭证"]');
    await fillProof();
    await cdp.clickByText('button', '提交完成');
    await sleep(1200);
    await cdp.send('Page.navigate', { url: `${BASE}/` });
    await cdp.waitFor('[data-task-card-toggle]');
    await sleep(600);
    let pulseSeen = false;
    for (let i = 0; i < 12 && !pulseSeen; i += 1) {
      await sleep(120);
      pulseSeen = await cdp.evaluate(
        `Boolean(document.querySelector('[data-progress-marker][data-marker-pulse="true"]'))`,
      );
    }
    check('完成任务后进度条播放动画（标记弹跳/粒子）', pulseSeen, true);
    await cdp.shot('22-adventure-progress-pulse');
    await sleep(1400);
    const adv2 = await cdp.evaluate(`(() => {
      const wrap = document.querySelector('[data-adventure-progress]');
      return {
        pct: Number(wrap.getAttribute('data-progress-percent')),
        pulse: Boolean(document.querySelector('[data-progress-marker][data-marker-pulse="true"]')),
      };
    })()`);
    check('动画结束后恢复静止', adv2.pulse === false, true);
    check('进度确实增加（统计随之变化）', adv2.pct > adv1.pct, true);

    // 全部完成 → 100% 特殊状态。
    // 注意：带审批的任务会卡在 pending 闸门（这是正确的业务行为），故先由家长批准待审批项。
    const pendingApprovals = await api('GET', '/approvals?as=reviewer&status=pending', parentToken);
    const approvalList = Array.isArray(pendingApprovals.json)
      ? pendingApprovals.json
      : (pendingApprovals.json?.requests ?? []);
    for (const a of approvalList) {
      await api('POST', `/approvals/${a.id}/approve`, parentToken, { comment: 'browser-check 自动批准' });
    }
    const allNow = await api('GET', '/tasks', childToken);
    const allList = Array.isArray(allNow.json) ? allNow.json : (allNow.json?.tasks ?? []);
    for (const t of allList) {
      if (t.status === 'completed') continue;
      try {
        if (t.status !== 'in_progress') {
          await api('POST', `/tasks/${t.id}/status`, childToken, { action: 'start' });
        }
        await api('POST', `/tasks/${t.id}/status`, childToken, { action: 'complete' });
      } catch {
        /* 极少数任务可能仍未通过；下方按实际百分比断言 */
      }
    }
    await cdp.send('Page.navigate', { url: `${BASE}/` });
    await cdp.waitFor('[data-adventure-progress]');
    await sleep(800);
    const advDone = await cdp.evaluate(`(() => {
      const wrap = document.querySelector('[data-adventure-progress]');
      const track = document.querySelector('[data-progress-track]');
      const marker = document.querySelector('[data-progress-marker]');
      const r = (el) => el.getBoundingClientRect();
      return {
        pct: Number(wrap.getAttribute('data-progress-percent')),
        complete: wrap.getAttribute('data-progress-complete'),
        doneText: (document.querySelector('[data-adventure-done]')?.textContent ?? '').trim(),
        markerFromRight: Math.round(r(track).right - r(marker).right),
        markerCenterFromRight: Math.round(r(track).right - (r(marker).left + r(marker).right) / 2),
      };
    })()`);
    console.log(`      100% 状态：${JSON.stringify(advDone)}`);
    check('全部完成时进度达到 100%', advDone.pct, 100);
    check('100% 时进度标记移动到最右端（右缘贴终点）', Number(advDone.markerFromRight) <= 4, true);
    check('100% 时文案变为「今日冒险完成！」', advDone.doneText, '今日冒险完成！');
    await cdp.shot('23-adventure-complete');

    // ---------- 13f. 今日成长卡（P4 订正：不是考勤） ----------
    const gateAfter = await cdp.evaluate(`Boolean(document.querySelector('[data-growth-card-entry]'))`);
    check('今日任务 100% 后出现成长卡入口', gateAfter, true);
    // 用户要求：入口必须在「今日冒险」**同一个框内**（紧接"今日冒险完成！"下方）
    const samePanel = await cdp.evaluate(`(() => {
      const panel = document.querySelector('[data-adventure-panel]');
      const entry = document.querySelector('[data-growth-card-entry]');
      const done = document.querySelector('[data-adventure-done]');
      if (!panel || !entry || !done) return null;
      const r = (el) => el.getBoundingClientRect();
      return {
        inside: panel.contains(entry),
        belowDone: Math.round(r(entry).top) >= Math.round(r(done).bottom) - 2,
        gap: Math.round(r(entry).top - r(done).bottom),
      };
    })()`);
    console.log(`      同框检查：${JSON.stringify(samePanel)}`);
    check('成长卡入口与今日冒险在同一个面板内', samePanel?.inside === true, true);
    check('入口位于"今日冒险完成！"下方', samePanel?.belowDone === true, true);
    // 硬要求：页面不得出现成人考勤措辞
    const pageText = String(await cdp.evaluate('document.body.innerText'));
    for (const word of ['签退', '已打卡', '打卡时间', '考勤', '打卡成功']) {
      check(`页面不出现考勤措辞「${word}」`, pageText.includes(word), false);
    }
    const entryText = await cdp.evaluate(
      `(document.querySelector('[data-growth-card-entry]')?.innerText ?? '').replace(/\\n/g, ' ')`,
    );
    console.log(`      成长卡入口：${entryText}`);
    check('入口显示「每日成长卡」', /每日成长卡/.test(entryText), true);
    await cdp.shot('24-growth-card-entry');

    // 点击入口 → Pixel RPG 卡片弹窗（结构固定：图 → 标题带 → 一句话 → 领取条）
    await cdp.clickSelector('[data-growth-card-entry]');
    await sleep(700);
    const modal = await cdp.evaluate(`(() => {
      const box = document.querySelector('[data-growth-card-modal]');
      if (!box) return null;
      const img = document.querySelector('[data-growth-card-image]');
      const copy = document.querySelector('[data-growth-card-copy]');
      const claim = document.querySelector('[data-growth-card-claim]');
      const text = (box.innerText || '').replace(/\\n/g, ' | ');
      return {
        text,
        hasImage: Boolean(img),
        imgSrc: img ? img.getAttribute('src') : null,
        imgLoaded: img ? img.naturalWidth > 0 : false,
        copy: copy ? (copy.textContent || '').trim() : '',
        hasClaim: Boolean(claim),
        claimText: claim ? (claim.textContent || '').trim() : '',
      };
    })()`);
    console.log(`      成长卡弹窗：${JSON.stringify(modal)}`);
    check('点击入口弹出成长卡弹窗', modal !== null, true);
    check('弹窗标题为「今日成长卡」', String(modal?.text ?? '').includes('今日成长卡'), true);
    check('弹窗含像素图片且已加载', modal?.hasImage === true && modal?.imgLoaded === true, true);
    check('弹窗含当日一句话', /[。！]$/.test(modal?.copy ?? ''), true);
    check('弹窗含领取按钮', modal?.hasClaim === true && /领取今日卡片/.test(modal?.claimText ?? ''), true);
    await cdp.shot('25-growth-card-modal');

    // 领取 → 轻动画 → 关闭；入口变「已领取」
    await cdp.clickSelector('[data-growth-card-claim]');
    await sleep(350);
    const animating = await cdp.evaluate(`(() => ({
      popping: Boolean(document.querySelector('.pixel-card-pop')),
      bodyScale: (() => { const b = document.querySelector('[data-growth-card-body]'); return b ? getComputedStyle(b).transform : null; })(),
    }))()`);
    check('领取时播放轻动画（图片放大 / 卡片收起）', animating.popping === true || animating.bodyScale !== 'none', true);
    await sleep(2200);
    const afterClaim = await cdp.evaluate(`(() => {
      const entry = document.querySelector('[data-growth-card-entry]');
      return {
        modalOpen: Boolean(document.querySelector('[data-growth-card-modal]')),
        claimed: entry ? entry.getAttribute('data-growth-card-claimed') : null,
        entryText: (entry?.innerText ?? '').replace(/\\n/g, ' '),
      };
    })()`);
    console.log(`      领取后：${JSON.stringify(afterClaim)}`);
    check('领取后弹窗自动关闭', afterClaim.modalOpen, false);
    check('入口变为已领取状态', afterClaim.claimed, 'true');
    check('入口不出现打卡时刻', !/\d{2}:\d{2}/.test(afterClaim.entryText), true);
    await cdp.shot('26-growth-card-claimed');
    // 业务规则未变：每天最多一张
    const dupClaim = await api('POST', '/attendance/check-in', childToken, {});
    check('同一天重复领取 → 409（每日限一张，规则未改）', dupClaim.status, 409);

    // 今日成长记录页（收集的卡片；不展示签到时间/签退）
    await cdp.send('Page.navigate', { url: `${BASE}/growth-cards` });
    await cdp.waitFor('[data-growth-card-item]');
    await sleep(500);
    const record = await cdp.evaluate(`(() => {
      const items = [...document.querySelectorAll('[data-growth-card-item]')];
      const text = String(document.body.innerText);
      return {
        count: items.length,
        first: items[0] ? items[0].getAttribute('data-growth-card-item') : null,
        hasImg: items[0] ? Boolean(items[0].querySelector('img')) : false,
        hasAttendanceWord: ['签退', '已打卡', '打卡时间', '考勤', '打卡成功'].filter((w) => text.includes(w)),
      };
    })()`);
    console.log(`      成长记录：${JSON.stringify(record)}`);
    check('成长记录页列出已领取的卡片', Number(record.count) >= 1 && record.hasImg === true, true);
    check('成长记录页无考勤措辞', record.hasAttendanceWord.length, 0);
    await cdp.shot('27-growth-cards');

    // ---------- 13g. 学习第三格 + 错题本闭环（P6-1，对照上游 wrong-notebook） ----------
    const navTabs = await cdp.evaluate(
      `[...document.querySelectorAll('nav a')].map((a) => (a.textContent || '').trim())`,
    );
    check('底部导航变为 3 格且含「学习」', navTabs.length === 3 && navTabs.some((t) => t.includes('学习')), true);
    await cdp.send('Page.navigate', { url: `${BASE}/learning` });
    await cdp.waitFor('[data-learning-entry="wrong-questions"]');
    const hub = await cdp.evaluate(`(() => ({
      wrongQuestions: Boolean(document.querySelector('[data-learning-entry="wrong-questions"]')),
      aiRecognize: Boolean(document.querySelector('[data-learning-entry="ai-recognize"]')),
      text: String(document.body.innerText).replace(/\\n/g, ' | ').slice(0, 120),
    }))()`);
    console.log(`      学习中心：${JSON.stringify(hub)}`);
    check('学习中心含「错题本」入口', hub.wrongQuestions, true);
    check('学习中心含「AI 识别」入口（原 AI 解题）', hub.aiRecognize, true);
    check('学习中心不再出现旧名「AI 解题」', String(hub.text).includes('AI 解题'), false);

    // 「AI 识别」与错题本「上传新题」必须是**同一个功能**：三模式与拖拽区完全一致
    await cdp.send('Page.navigate', { url: `${BASE}/learning/ai-recognize` });
    await cdp.waitFor('[data-upload-zone]');
    const aiCapture = await cdp.evaluate(`(() => ({
      tabs: [...document.querySelectorAll('[data-upload-tab]')].map((b) => b.textContent.trim()),
      hasZone: Boolean(document.querySelector('[data-upload-zone]')),
      hasCapture: Boolean(document.querySelector('[data-screen-capture]')),
    }))()`);
    console.log(`      AI 识别页：${JSON.stringify(aiCapture)}`);
    check(
      'AI 识别页含三个模式（拍照上传 / AI 识别 / 直接录入）',
      aiCapture.tabs.join(',') === '拍照上传,AI 识别,直接录入',
      true,
    );
    check('AI 识别页与上传新题共用同一识别流程（拖拽区 + 屏幕截图）', aiCapture.hasZone && aiCapture.hasCapture, true);
    await cdp.shot('34-ai-recognize');

    // 录入一道错题（UI 全流程）→ 直接录入表单（上传页为 /new，手工表单为 /manual）
    await cdp.send('Page.navigate', { url: `${BASE}/learning/wrong-questions/manual` });
    await cdp.waitFor('[data-save-wrong-question]');
    const wqText = `勾股定理测试题 ${STAMP}：直角三角形两直角边 3 和 4，求斜边`;
    await cdp.evaluate(`(() => {
      const set = (sel, val) => {
        const el = document.querySelector(sel);
        if (!el) return;
        // 用元素自身的原型取 value setter（input/textarea/select 通用，避免 Illegal invocation）
        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, val);
        el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
      };
      set('textarea[name="questionText"]', ${JSON.stringify(wqText)});
      set('textarea[name="answerText"]', '5');
      set('textarea[name="analysis"]', '3²+4²=9+16=25，斜边为 5');
      set('textarea[name="mistakeAnalysis"]', '忘了开平方');
      set('input[name="source"]', '期中考试');
      set('input[name="errorType"]', '计算');
      set('select[name="subject"]', 'math');
    })()`);
    await sleep(300);
    // 新建自定义知识点标签并选中（上游自定义标签能力）
    await cdp.evaluate(`(() => {
      const input = document.querySelector('[data-new-tag]');
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set.call(input, '勾股定理');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await cdp.clickSelector('[data-add-tag]');
    await sleep(900);
    const tagCreated = await cdp.evaluate(`document.querySelectorAll('[data-tag-option]').length`);
    check('可新建并选中自定义知识点标签', Number(tagCreated) >= 1, true);
    await cdp.clickSelector('[data-save-wrong-question]');
    await sleep(1600);
    check('保存后回到错题列表', await cdp.evaluate('location.pathname'), '/learning/wrong-questions');
    const listed = await cdp.evaluate(`(() => {
      const cards = [...document.querySelectorAll('[data-wrong-question-card]')];
      return { count: cards.length, first: (cards[0]?.innerText ?? '').replace(/\\n/g, ' | ').slice(0, 90) };
    })()`);
    console.log(`      错题列表：${JSON.stringify(listed)}`);
    check('列表出现刚录入的错题', Number(listed.count) >= 1 && listed.first.includes('勾股定理'), true);
    await cdp.shot('28-wrong-question-list');

    // 上游去重规则：同题干 2 秒内重复提交 → 409 duplicate_question
    const dupBody = { subject: 'math', questionText: wqText };
    const dupWrong = await api('POST', '/wrong-questions', childToken, dupBody);
    check('同题干短时间重复录入 → 409（上游 2 秒去重规则）', dupWrong.status, 409);
    check('重复录入 reason 为 duplicate_question', dupWrong.json?.reason, 'duplicate_question');

    // 详情页：掌握标记 + 复习记录 + 笔记
    const firstId = await cdp.evaluate(
      `document.querySelector('[data-wrong-question-card]')?.getAttribute('data-wrong-question-card')`,
    );
    await cdp.send('Page.navigate', { url: `${BASE}/learning/wrong-questions/${firstId}` });
    await cdp.waitFor('[data-mastery-controls]');
    const wqDetailText = String(await cdp.evaluate('document.body.innerText'));
    check(
      '详情页展示题干/答案/解析/错因',
      ['勾股定理', '5', '斜边为 5', '忘了开平方'].every((t) => wqDetailText.includes(t)),
      true,
    );
    await cdp.clickSelector('[data-mastery-option="1"]');
    await sleep(1200);
    check(
      '掌握度可切换为「复习中」',
      await cdp.evaluate(
        `getComputedStyle(document.querySelector('[data-mastery-option="1"]')).backgroundColor !== 'rgba(0, 0, 0, 0)'`,
      ),
      true,
    );
    await cdp.clickSelector('[data-review-correct]');
    await sleep(1200);
    check('可记录一次复习结果', await cdp.evaluate(`document.body.innerText.includes('复习记录（1 次）')`), true);
    await cdp.evaluate(`(() => {
      const el = document.querySelector('[data-wrong-question-notes]');
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, '下次先画图再算');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await sleep(200);
    await cdp.clickSelector('[data-save-notes]');
    await sleep(1200);
    await cdp.send('Page.navigate', { url: `${BASE}/learning/wrong-questions/${firstId}` });
    await cdp.waitFor('[data-wrong-question-notes]');
    await sleep(500);
    const notesSaved = await cdp.evaluate(`document.querySelector('[data-wrong-question-notes]')?.value ?? ''`);
    check('笔记可保存并回显', String(notesSaved).includes('下次先画图再算'), true);
    await cdp.shot('29-wrong-question-detail');

    // 删除（软删除）
    await cdp.clickSelector('[data-delete-wrong-question]');
    await sleep(1800);
    check('删除后回到错题列表', await cdp.evaluate('location.pathname'), '/learning/wrong-questions');
    const afterDelete = await api('GET', '/wrong-questions', childToken);
    const wqList = Array.isArray(afterDelete.json) ? afterDelete.json : (afterDelete.json?.items ?? []);
    check('删除后不再出现在列表（软删除）', wqList.some((w) => w.id === firstId) === false, true);

    // ---------- 13j. 批量删除 / 清空 / 导出 / 导入 / AI 重解 ----------
    // 造两道题（走 API 更快；列表页做批量操作）
    for (const tag of ['批量A', '批量B']) {
      await api('POST', '/wrong-questions', childToken, {
        subject: 'math',
        questionText: `${tag} ${STAMP}：1+${tag === '批量A' ? '1' : '2'}=?`,
      });
    }
    const exportRes = await api('GET', '/wrong-questions/export', childToken);
    check('导出接口返回版本与题目数组', exportRes.status === 200 && Array.isArray(exportRes.json?.questions), true);
    const exportedCount = Number(exportRes.json?.questions?.length ?? 0);
    // 导入同一份备份 → 全部按题干去重跳过
    const importRes = await api('POST', '/wrong-questions/import', childToken, {
      version: 1,
      questions: exportRes.json?.questions ?? [],
    });
    check('导入接口可用且按题干去重', importRes.status === 201 && Number(importRes.json?.skipped) >= 1, true);

    // 批量删除（先取一页里的两个 id）
    const pageList = await api('GET', '/wrong-questions?pageSize=2', childToken);
    const twoIds = (pageList.json?.items ?? []).slice(0, 2).map((x) => x.id);
    if (twoIds.length === 2) {
      const bd = await api('POST', '/wrong-questions/batch-delete', childToken, { ids: twoIds });
      check('批量删除接口可用', bd.status === 201 && Number(bd.json?.deleted) === 2, true);
    }

    // UI：批量选择 → 勾选 → 删除选中（先补两道，避免前面 API 删除后列表为空）
    for (const tag of ['界面批量A', '界面批量B']) {
      await api('POST', '/wrong-questions', childToken, {
        subject: 'math',
        questionText: `${tag} ${STAMP}：2+2=?`,
      });
    }
    await cdp.send('Page.navigate', { url: `${BASE}/learning/wrong-questions` });
    await cdp.waitFor('[data-wrong-question-card]');
    await cdp.clickSelector('[data-batch-toggle]');
    await sleep(300);
    await cdp.clickSelector('[data-select-all]');
    await sleep(300);
    const selectedText = await cdp.evaluate(`document.querySelector('[data-batch-toggle]')?.textContent ?? ''`);
    check('批量选择可全选本页', /批量选择中（[1-9]/.test(selectedText), true);
    await cdp.shot('36-batch-select');
    await cdp.clickSelector('[data-batch-delete]');
    await sleep(1500);
    check('批量删除后列表清空', (await cdp.evaluate(`document.querySelectorAll('[data-wrong-question-card]').length`)) === 0, true);
    const afterBatch = await api('GET', '/wrong-questions', childToken);
    check('批量删除为软删除（列表不含已删）', (afterBatch.json?.items ?? []).length, 0);

    // 按上游设计：列表页不再有 备份 JSON / 导入备份 / 清空全部 / 重复的"上传新题"按钮
    const toolbarUi = await cdp.evaluate(`(() => ({
      backup: Boolean(document.querySelector('[data-backup-json]')),
      importBtn: Boolean(document.querySelector('[data-import]')),
      clearAll: Boolean(document.querySelector('[data-clear-all]')),
      uploadBtn: Boolean(document.querySelector('[data-wrong-question-new]')),
      hasBatch: Boolean(document.querySelector('[data-batch-toggle]')),
      hasExport: Boolean(document.querySelector('[data-export]')),
    }))()`);
    console.log(`      列表工具条：${JSON.stringify(toolbarUi)}`);
    check('列表页已移除「备份 JSON」', toolbarUi.backup, false);
    check('列表页已移除「导入备份」', toolbarUi.importBtn, false);
    check('列表页已移除「清空全部」', toolbarUi.clearAll, false);
    check('列表页已移除重复的「上传新题」按钮', toolbarUi.uploadBtn, false);
    check('列表页保留「批量选择」与「导出 / 打印」（对照上游）', toolbarUi.hasBatch && toolbarUi.hasExport, true);
    // 数据备份/清空接口仍保留（上游把它们放在设置/数据迁移，不在列表）
    const exportApi = await api('GET', '/wrong-questions/export', childToken);
    check('数据备份导出接口仍可用（仅无界面入口）', exportApi.status, 200);

    // AI 重解（详情页）：走真模型（未配置时跳过）
    const aiStatus2 = await api('GET', '/ai/status', childToken);
    if (aiStatus2.json?.configured) {
      const created = await api('POST', '/wrong-questions', childToken, {
        subject: 'math',
        questionText: `重解测试 ${STAMP}：小明把 3+4 算成了 8`,
        wrongAnswerText: '8',
      });
      const reId = created.json?.id;
      await cdp.send('Page.navigate', { url: `${BASE}/learning/wrong-questions/${reId}` });
      await cdp.waitFor('[data-ai-reanswer]');
      await cdp.clickSelector('[data-ai-reanswer]');
      await cdp.waitFor('[data-reanswer-result]', 90_000);
      const reText = await cdp.evaluate(
        `(document.querySelector('[data-reanswer-result]')?.innerText ?? '').replace(/\\n/g, ' | ').slice(0, 120)`,
      );
      console.log(`      AI 重解：${reText}`);
      check('AI 重解返回答案/解析', /答案|解析/.test(reText), true);
      await cdp.shot('37-ai-reanswer');
      await api('DELETE', `/wrong-questions/${reId}`, childToken);
    }

    // ---------- 13k. 导出 = 打印预览（可另存 PDF）+ 相似题练习 ----------
    // 准备两道题用于打印
    for (const tag of ['打印A', '打印B']) {
      await api('POST', '/wrong-questions', childToken, {
        subject: 'math',
        questionText: `${tag} ${STAMP}：5+5=?`,
        answerText: '10',
        analysis: '五加五等于十。',
        errorType: '粗心失误',
      });
    }
    await cdp.send('Page.navigate', { url: `${BASE}/learning/wrong-questions` });
    await cdp.waitFor('[data-wrong-question-card]');
    await cdp.clickSelector('[data-export]');
    await sleep(1200);
    check(
      '「导出」进入打印预览（而不是直接下载）',
      String(await cdp.evaluate('location.pathname')).endsWith('/print'),
      true,
    );
    await cdp.waitFor('[data-print-area]');
    const printUi = await cdp.evaluate(`(() => ({
      title: document.querySelector('h1')?.textContent ?? '',
      questions: document.querySelectorAll('[data-print-question]').length,
      hasPrintButton: Boolean(document.querySelector('[data-print-now]')),
      hasScale: Boolean(document.querySelector('[data-print-scale]')),
      scaleValue: document.querySelector('[data-print-scale]')?.value ?? '',
      toggles: [...document.querySelectorAll('[data-print-toggle]')].map((i) => ({
        key: i.getAttribute('data-print-toggle'),
        checked: i.checked,
      })),
      selectionLabel: document.querySelector('[data-print-selection-count]')?.textContent ?? '',
      picks: document.querySelectorAll('[data-print-pick]').length,
      hasSelectAll: Boolean(document.querySelector('[data-print-select-all]')),
      hasClearSelection: Boolean(document.querySelector('[data-print-clear-selection]')),
      bodyHasAnswer: String(document.querySelector('[data-print-area]')?.innerText || '').includes('答案：'),
      bodyHasQuestionText: String(document.querySelector('[data-print-area]')?.innerText || '').includes('5+5'),
      toolbar: Boolean(document.querySelector('[data-no-print]')),
    }))()`);
    console.log(`      打印预览：${JSON.stringify(printUi)}`);
    check('打印预览标题含选中/总数（上游 countLabel 格式）', /打印预览（\d+(?:\/\d+)? 道题目）/.test(printUi.title), true);
    check('打印预览自带「图片比例」滑块（默认 70）', printUi.hasScale && String(printUi.scaleValue) === '70', true);
    check(
      '四个内容开关齐全且**默认全不勾**（空白练习卷，同上游）',
      printUi.toggles.map((t) => t.key).join(',') === 'questionText,answer,analysis,tags' &&
        printUi.toggles.every((t) => t.checked === false),
      true,
    );
    check('有「选择题目 (n/total)」+ 全选 / 清空选择 + 逐题勾选', 
      /选择题目（\d+\/\d+）/.test(printUi.selectionLabel) &&
        printUi.hasSelectAll &&
        printUi.hasClearSelection &&
        Number(printUi.picks) >= 2,
      true,
    );
    check('默认不勾内容时打印区不含答案', printUi.bodyHasAnswer, false);
    check('工具条标记为打印时隐藏（data-no-print）', printUi.toolbar, true);
    // 未勾选任何内容时：打印区给"作答留白"而不是多余提示文案（对照上游 shouldReserveAnswerSpace）
    const blankState = await cdp.evaluate(`(() => {
      const text = String(document.querySelector('[data-print-area]')?.innerText || '');
      return {
        hasBlank: Boolean(document.querySelector('[data-print-blank]')),
        noisy: text.includes('未选择任何打印内容'),
      };
    })()`);
    console.log(`      留白检查：${JSON.stringify(blankState)}`);
    check('没有可显示内容时给作答留白（无多余提示文案）', blankState.hasBlank && blankState.noisy === false, true);

    // 勾上「显示答案 + 原题文字」→ 打印区出现答案与题干
    await cdp.clickSelector('[data-print-toggle="answer"]');
    await cdp.clickSelector('[data-print-toggle="questionText"]');
    await sleep(400);
    const afterToggle = await cdp.evaluate(`(() => {
      const text = String(document.querySelector('[data-print-area]')?.innerText || '');
      return { hasAnswer: text.includes('答案：'), hasText: text.includes('5+5') };
    })()`);
    check('可勾选内容（显示答案 + 原题文字）', afterToggle.hasAnswer && afterToggle.hasText, true);
    // 清空选择 → 打印按钮禁用 + 空状态提示
    await cdp.clickSelector('[data-print-clear-selection]');
    await sleep(400);
    const cleared = await cdp.evaluate(`(() => ({
      label: document.querySelector('[data-print-selection-count]')?.textContent ?? '',
      disabled: document.querySelector('[data-print-now]')?.disabled,
      empty: Boolean(document.querySelector('[data-print-empty-state]')),
      printed: document.querySelectorAll('[data-print-question]').length,
    }))()`);
    console.log(`      清空选择：${JSON.stringify(cleared)}`);
    check('清空选择后打印按钮禁用', cleared.disabled === true, true);
    check('清空选择后显示空状态且不打印任何题', cleared.empty === true && Number(cleared.printed) === 0, true);
    await cdp.clickSelector('[data-print-select-all]');
    await sleep(400);
    check(
      '「全选」恢复全部题目',
      Number(await cdp.evaluate(`document.querySelectorAll('[data-print-question]').length`)) >= 2,
      true,
    );
    await cdp.shot('38-print-preview');

    // ---------- 导出 PDF：真正下载文件（用户反馈"导出失败"→ 不再依赖系统打印对话框） ----------
    const downloadDir = join(ROOT, 'ui-shots', 'downloads');
    await cdp
      .send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir })
      .catch(() => {});
    await cdp.clickSelector('[data-export-pdf]');
    await cdp.waitFor('[data-pdf-result]', 30_000);
    const pdfNotice = await cdp.evaluate(`document.querySelector('[data-pdf-result]')?.textContent ?? ''`);
    console.log(`      导出 PDF：${JSON.stringify(pdfNotice)}`);
    check('点「导出 PDF」给出成功提示', /已导出 PDF（\d+ 页）/.test(pdfNotice), true);
    // 校验磁盘上的真文件：%PDF 魔数 + 体积
    await sleep(1500);
    const pdfFiles = existsSync(downloadDir)
      ? readdirSync(downloadDir).filter((f) => f.toLowerCase().endsWith('.pdf'))
      : [];
    const latest = pdfFiles.sort().at(-1);
    let pdfOk = false;
    let pdfSize = 0;
    let pdfHead = '';
    if (latest) {
      const buf = readFileSync(join(downloadDir, latest));
      pdfSize = buf.length;
      pdfHead = buf.subarray(0, 4).toString('latin1');
      pdfOk = pdfHead === '%PDF' && buf.length > 1000;
    }
    console.log(`      PDF 文件：${latest ?? '(无)'} size=${pdfSize} head=${pdfHead}`);
    check('导出的是真实 PDF 文件（%PDF 魔数 + >1KB）', pdfOk, true);
    // 打印媒体下：外壳隐藏、打印区域白底黑字
    await cdp.send('Emulation.setEmulatedMedia', { media: 'print' });
    await sleep(400);
    const printMedia = await cdp.evaluate(`(() => {
      const shell = document.querySelector('header');
      const nav = document.querySelector('nav');
      const area = document.querySelector('[data-print-area]');
      const toolbar = document.querySelector('[data-no-print]');
      return {
        headerHidden: shell ? getComputedStyle(shell).display === 'none' : true,
        navHidden: nav ? getComputedStyle(nav).display === 'none' : true,
        toolbarHidden: toolbar ? getComputedStyle(toolbar).display === 'none' : true,
        areaBg: area ? getComputedStyle(area).backgroundColor : '',
      };
    })()`);
    console.log(`      打印媒体：${JSON.stringify(printMedia)}`);
    check('打印时隐藏应用外壳（表头/底栏/工具条）', printMedia.headerHidden && printMedia.navHidden && printMedia.toolbarHidden, true);
    check('打印区域为白底（适合 PDF）', printMedia.areaBg, 'rgb(255, 255, 255)');
    await cdp.send('Emulation.setEmulatedMedia', { media: '' });

    // 相似题练习（真模型；未配置则跳过）
    if (aiStatus2.json?.configured) {
      const srcList = await api('GET', '/wrong-questions?pageSize=1', childToken);
      const srcId = srcList.json?.items?.[0]?.id;
      if (srcId) {
        await cdp.send('Page.navigate', { url: `${BASE}/learning/wrong-questions/practice?id=${srcId}` });
        await cdp.waitFor('[data-generate-similar]');
        await cdp.clickSelector('[data-generate-similar]');
        await cdp.waitFor('[data-similar-list]', 120_000);
        const generated = await cdp.evaluate(`document.querySelectorAll('[data-similar-item]').length`);
        console.log(`      生成相似题：${generated} 道`);
        check('AI 生成相似题', Number(generated) >= 1, true);
        // 显示答案 + 记一次"会了"
        await cdp.clickSelector('[data-reveal-answer="0"]');
        await sleep(300);
        await cdp.clickSelector('[data-practice-correct="0"]');
        await sleep(1200);
        const practiceTotal = await cdp.evaluate(
          `document.querySelector('[data-practice-total]')?.textContent ?? '0'`,
        );
        check('练习记录已写入统计', Number(practiceTotal) >= 1, true);
        const statsApi = await api('GET', '/practice/stats', childToken);
        check('练习统计接口口径正确', Number(statsApi.json?.total) >= 1 && Number(statsApi.json?.correct) >= 1, true);
        await cdp.shot('39-practice');
      }
    }

    // ---------- 13h. AI 适配层（P6-3 骨架）：未配置时明确报错，且密钥绝不下发 ----------
    const aiStatus = await api('GET', '/ai/status', childToken);
    console.log(`      AI 状态：${JSON.stringify(aiStatus.json)}`);
    check('AI 状态接口需登录（未带 token 401）', (await api('GET', '/ai/status', '')).status, 401);
    check(
      'AI 状态结构齐全（configured/provider/model/reason）',
      aiStatus.json &&
        typeof aiStatus.json.configured === 'boolean' &&
        'provider' in aiStatus.json &&
        'model' in aiStatus.json &&
        'reason' in aiStatus.json,
      true,
    );
    check(
      '未配置 base_url/model 时 reason 为 ai_not_configured',
      aiStatus.json?.configured === false ? aiStatus.json?.reason === 'ai_not_configured' : true,
      true,
    );
    check('AI 状态响应绝不包含密钥', String(JSON.stringify(aiStatus.json)).includes('sk-'), false);
    const aiCall = await api('POST', '/ai/analyze', childToken, { text: '1+1=?' });
    if (aiCall.status === 201) {
      // 已配置真模型（用户已给 key 且填了 base_url/model）→ 校验返回结构
      check('识题返回 raw + fields', typeof aiCall.json?.raw === 'string' && Boolean(aiCall.json?.fields), true);
    } else {
      check('未配置时调用识题返回明确错误（502）', aiCall.status, 502);
      check('识题未配置 reason 为 ai_not_configured', aiCall.json?.reason, 'ai_not_configured');
    }

    // ---------- 13i. 错题本四入口 + 上传新题（三模式）+ 标签管理 + 统计中心 ----------
    await cdp.send('Page.navigate', { url: `${BASE}/learning/wrong-questions` });
    await cdp.waitFor('[data-wrong-question-nav]');
    const navItems = await cdp.evaluate(
      `[...document.querySelectorAll('[data-wrong-question-nav] [data-nav-item]')].map((a) => a.textContent.trim())`,
    );
    console.log(`      错题本四入口：${navItems.join(' / ')}`);
    check(
      '错题本顶部四入口齐全（上游首页同款）',
      ['上传新题', '查看错题本', '标签管理', '统计中心'].every((t) => navItems.includes(t)),
      true,
    );

    // 上传新题页：三个输入模式 + 拖拽区 + 屏幕截图
    await cdp.send('Page.navigate', { url: `${BASE}/learning/wrong-questions/new` });
    await cdp.waitFor('[data-upload-zone]');
    const uploadUi = await cdp.evaluate(`(() => {
      const text = String(document.body.innerText);
      return {
        tabs: [...document.querySelectorAll('[data-upload-tab]')].map((b) => b.getAttribute('data-upload-tab')),
        zoneText: (document.querySelector('[data-upload-zone]')?.innerText ?? '').replace(/\\n/g, ' '),
        hasCapture: Boolean(document.querySelector('[data-screen-capture]')),
        hint: text.includes('AI 未配置'),
      };
    })()`);
    console.log(`      上传页：${JSON.stringify(uploadUi)}`);
    check('三个输入模式齐全（拍照上传/AI识别/直接录入）', uploadUi.tabs.join(',') === 'image,text,direct', true);
    check(
      '拖拽区文案与上游一致（AI 智能解析 / 拖拽图片到此处 / JPG、PNG）',
      uploadUi.zoneText.includes('AI 智能解析') &&
        uploadUi.zoneText.includes('拖拽图片到此处') &&
        uploadUi.zoneText.includes('JPG'),
      true,
    );
    check('含「屏幕截图」按钮', uploadUi.hasCapture, true);
    await cdp.shot('30-wrong-question-upload');

    // 真实上传：用 CDP 把本地 PNG 塞进 file input（等价拖拽）→ 点击 AI 解析
    await cdp.send('DOM.enable', {});
    const doc = await cdp.send('DOM.getDocument', { depth: -1 });
    const inputNode = await cdp.send('DOM.querySelector', {
      nodeId: doc.root.nodeId,
      selector: '[data-upload-input]',
    });
    const uploadFixture = `${ROOT}/apps/web/public/cards/card-02.png`;
    await cdp.send('DOM.setFileInputFiles', { nodeId: inputNode.nodeId, files: [uploadFixture] });
    await sleep(900);
    check('选择图片后出现预览', await cdp.evaluate(`Boolean(document.querySelector('[data-upload-preview]'))`), true);
    await cdp.shot('31-upload-preview');

    // 直接录入（不经 AI）→ **表单直接出现在 tab 下面**（用户要求：不用再点"开始手工录入"）
    await cdp.clickSelector('[data-upload-tab="direct"]');
    await sleep(400);
    const inline = await cdp.evaluate(`(() => {
      const box = document.querySelector('[data-inline-form]');
      return {
        hasBox: Boolean(box),
        hasForm: Boolean(box?.querySelector('[data-save-wrong-question]')),
        path: location.pathname,
      };
    })()`);
    console.log(`      直接录入：${JSON.stringify(inline)}`);
    check('「直接录入」下面直接就是表单', inline.hasBox && inline.hasForm, true);
    check('不再跳转到独立录入页', inline.path.endsWith('/new'), true);

    // 表单字段按用户要求调整过
    const formUi = await cdp.evaluate(`(() => {
      const text = String(document.body.innerText);
      const opts = (sel) => [...document.querySelectorAll(sel + ' option')].map((o) => o.textContent.trim());
      return {
        status: opts('select[name="mistakeStatus"]'),
        reason: opts('select[name="errorType"]'),
        gradeSelects: document.querySelectorAll('[data-grade-selects] select').length,
        gradeValues: [...document.querySelectorAll('[data-grade-selects] select')].map((s) => s.value),
        gradeText: (document.body.innerText.match(/当前：([^\\n]+)/) ?? [])[1] ?? '',
        hasPaper: Boolean(document.querySelector('select[name="paperLevel"]')) || text.includes('试卷'),
        hasErrorType: text.includes('错误类型'),
        hasLegacyNote: text.includes('图片上传（拍照录题）在下一批实现'),
      };
    })()`);
    console.log(`      表单字段：${JSON.stringify(formUi)}`);
    check('作答状态选项为「不会做 / 做错了」', formUi.status.join(',') === '不会做,做错了', true);
    check(
      '数学的错因选项正确（粗心失误/思路偏差/未掌握知识点/其他）',
      formUi.reason.slice(1).join(',') === '粗心失误,思路偏差,未掌握知识点,其他',
      true,
    );
    check('年级学期为三级下拉（学段/年级/学期）', Number(formUi.gradeSelects), 3);
    check(
      '年级学期默认「小学五年级上学期」',
      formUi.gradeValues.join('') === '小学五年级上学期' && String(formUi.gradeText).includes('小学五年级上学期'),
      true,
    );
    check('已删除「试卷」', formUi.hasPaper, false);
    check('已删除「错误类型」', formUi.hasErrorType, false);
    check('已删除"图片上传在下一批…"注释', formUi.hasLegacyNote, false);

    // 长文本输入框必须**自动撑高**（不要内部滚动条）
    const grow = await cdp.evaluate(`(() => {
      const el = document.querySelector('textarea[name="questionText"]');
      if (!el) return null;
      const before = el.getBoundingClientRect().height;
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
      setter.call(el, Array.from({ length: 12 }, (_, i) => '第' + (i + 1) + '行长文本内容').join('\\n'));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return new Promise((resolve) => setTimeout(() => resolve({
        before: Math.round(before),
        after: Math.round(el.getBoundingClientRect().height),
        overflow: getComputedStyle(el).overflowY,
        scrollable: el.scrollHeight > el.clientHeight + 1,
      }), 120));
    })()`);
    console.log(`      自适应文本框：${JSON.stringify(grow)}`);
    check('长文本输入框随内容自动撑高', Number(grow?.after) > Number(grow?.before), true);
    check('输入框不出现内部滚动条', grow?.overflow === 'hidden' && grow?.scrollable === false, true);

    // 切换学科 → 错因选项随之变为语言类
    await cdp.evaluate(`(() => {
      const el = document.querySelector('select[name="subject"]');
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, 'chinese');
      el.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await sleep(400);
    const langReasons = await cdp.evaluate(
      `[...document.querySelectorAll('select[name="errorType"] option')].map((o) => o.textContent.trim())`,
    );
    check(
      '语文/英语/PET 的错因选项正确（拼写错误/单词·词语不认识/未掌握知识点/其他）',
      langReasons.slice(1).join(',') === '拼写错误,单词/词语不认识,未掌握知识点,其他',
      true,
    );
    await cdp.shot('35-direct-entry-form');

    // 标签管理：新建 + 删除自定义标签
    await cdp.send('Page.navigate', { url: `${BASE}/learning/wrong-questions/tags` });
    await cdp.waitFor('[data-create-tag]');
    const tagName = `自测标签${STAMP}`;
    await cdp.evaluate(`(() => {
      const el = document.querySelector('[data-new-tag-name]');
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, ${JSON.stringify(tagName)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await cdp.clickSelector('[data-create-tag]');
    await sleep(1200);
    const tagCreatedUi = await cdp.evaluate(
      `String(document.body.innerText).includes(${JSON.stringify(tagName)})`,
    );
    check('标签管理可新建自定义标签', tagCreatedUi, true);
    const createdTagId = await cdp.evaluate(
      `(() => { const rows = [...document.querySelectorAll('[data-delete-tag]')]; const hit = rows.find((b) => (b.closest('div')?.innerText ?? '').includes(${JSON.stringify(tagName)})); return hit ? hit.getAttribute('data-delete-tag') : null; })()`,
    );
    if (createdTagId) {
      await cdp.evaluate(
        `document.querySelector('[data-delete-tag="${createdTagId}"]').click()`,
      );
      await sleep(1200);
      check(
        '标签管理可删除自定义标签',
        await cdp.evaluate(`!String(document.body.innerText).includes(${JSON.stringify(tagName)})`),
        true,
      );
    }
    await cdp.shot('32-knowledge-tags');

    // 标签统计 + 标签建议（上游 /api/tags/stats 与 /api/tags/suggestions）
    const tagStats = await api('GET', '/knowledge-tags/stats?subject=math', childToken);
    check(
      '标签统计接口返回每个标签的错题数',
      tagStats.status === 200 && Array.isArray(tagStats.json) && tagStats.json.every((t) => typeof t.count === 'number'),
      true,
    );
    const tagSuggest = await api('GET', '/knowledge-tags/suggestions?subject=math&q=勾股', childToken);
    check(
      '标签建议接口按关键词返回候选',
      tagSuggest.status === 200 && Array.isArray(tagSuggest.json),
      true,
    );

    // 统计中心
    await cdp.send('Page.navigate', { url: `${BASE}/learning/wrong-questions/stats` });
    await cdp.waitFor('[data-stat-total]');
    const statsUi = await cdp.evaluate(`(() => ({
      total: document.querySelector('[data-stat-total]')?.textContent ?? '',
      reviews: document.querySelector('[data-stat-reviews]')?.textContent ?? '',
      bars: document.querySelectorAll('[data-stat-trend] span').length,
    }))()`);
    console.log(`      统计中心：${JSON.stringify(statsUi)}`);
    check('统计中心渲染总量/复习次数', Number(statsUi.total) >= 0 && statsUi.reviews !== '', true);
    check('统计中心渲染近 30 天趋势', Number(statsUi.bars), 30);
    await cdp.shot('33-stats');
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
