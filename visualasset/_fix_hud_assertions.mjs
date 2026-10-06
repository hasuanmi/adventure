// 把 browser-check.mjs 里"旧 HUD 头部"的那一段断言整体替换为新版 Player HUD + 三段式 Header 断言
// 做法：定位包含旧 data 属性（data-level-badge / data-xp-bar / data-avatar-frame ...）的段落边界
//      （前一个 "// ----------" 标记 到 后一个 "// ----------" 标记），整段替换。
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../scripts/browser-check.mjs', import.meta.url);
const src = readFileSync(file, 'utf8');
const lines = src.split('\n');

const STALE_RE = /data-level-badge|data-xp-bar|data-xp-label|data-avatar-frame|data-avatar-img|data-status-group|表头含等级|表头含 XP|等级徽章显示数字|头像框保持现有尺寸|等级\+XP/;
const MARKER_RE = /^\s*\/\/\s*-{3,}/;

const stale = lines.map((l, i) => (STALE_RE.test(l) ? i : -1)).filter((i) => i >= 0);
if (stale.length === 0) {
  console.log('没有找到旧 HUD 断言（可能已修）');
  process.exit(0);
}
const first = stale[0];
const last = stale[stale.length - 1];

let start = -1;
for (let i = first; i >= 0; i -= 1) {
  if (MARKER_RE.test(lines[i])) { start = i; break; }
}
let end = -1;
for (let i = last; i < lines.length; i += 1) {
  if (MARKER_RE.test(lines[i])) { end = i; break; }
}
if (start < 0 || end < 0) {
  console.log(`!! 未定位到段落边界 start=${start} end=${end}`);
  process.exit(1);
}

const block = [
  '    // ---------- 顶部 Player HUD（2026-10-06 重设计：圆形头像 + LV 压左上 + 昵称右上 + XP 条无数字） ----------',
  "    const hud = await cdp.evaluate(`(() => {",
  "      const h = document.querySelector('[data-player-hud]');",
  '      if (!h) return null;',
  "      const frame = h.querySelector('[data-hud-avatar-frame]');",
  "      const avatar = h.querySelector('[data-hud-avatar]');",
  "      const badge = h.querySelector('[data-hud-level-badge]');",
  "      const nick = h.querySelector('[data-hud-nickname]');",
  "      const bar = h.querySelector('[data-hud-xp-bar]');",
  "      const fill = h.querySelector('[data-hud-xp-fill]');",
  '      const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };',
  '      return {',
  '        avatar: r(avatar), frame: r(frame), badge: r(badge), nick: r(nick), bar: r(bar), fill: r(fill),',
  "        badgeText: badge ? badge.textContent.trim() : '',",
  "        nickText: nick ? nick.textContent.trim() : '',",
  "        headerText: (document.querySelector('header') || document.body).innerText,",
  '      };',
  '    })()`);',
  "    check('顶部为 Player HUD（data-player-hud）', Boolean(hud && hud.avatar), true);",
  "    check('HUD 含圆形头像（≥36px 且宽高近似相等）', Boolean(hud && hud.avatar) && Math.abs(Number(hud.avatar.w) - Number(hud.avatar.h)) <= 2 && Number(hud.avatar.w) >= 36, true);",
  "    check('HUD 含等级徽章且文案为 LV.n', /^LV\\.\\d+$/.test(String(hud && hud.badgeText ? hud.badgeText : '')), true);",
  "    check('等级徽章压在头像框左上', Boolean(hud && hud.badge && hud.frame) && Number(hud.badge.l) < Number(hud.frame.l) && Number(hud.badge.t) <= Number(hud.frame.t) + 8, true);",
  "    check('HUD 含昵称且非空', Boolean(hud && String(hud.nickText || '').length > 0), true);",
  "    check('昵称位于头像右侧（不与头像重叠）', Boolean(hud && hud.nick && hud.frame) && Number(hud.nick.l) >= Number(hud.frame.r) - 2, true);",
  "    check('昵称不与经验条重叠', !hud || !hud.nick || !hud.bar || Number(hud.nick.b) <= Number(hud.bar.t) + 2, true);",
  "    check('HUD 含 XP 进度条与填充', Boolean(hud && hud.bar && hud.fill), true);",
  "    check('经验条紧贴头像右缘（≤6px）', !hud || !hud.bar || !hud.frame || Math.abs(Number(hud.bar.l) - Number(hud.frame.r)) <= 6, true);",
  "    check('经验条底边与头像底边对齐（|Δ| ≤ 3px）', !hud || !hud.bar || !hud.frame || Math.abs(Number(hud.bar.b) - Number(hud.frame.b)) <= 3, true);",
  "    check('首页头部不显示 XP 数字/文案', /XP|\\d+\\s*\\/\\s*\\d+/.test(String((hud && hud.headerText) || '')), false);",
  '',
  '    // ---------- 三段式 Header：中部产品品牌 + 日期副信息 ----------',
  "    const brand = await cdp.evaluate(`(() => {",
  "      const t = document.querySelector('[data-brand-title]');",
  "      if (!t) return null;",
  "      const d = document.querySelector('[data-brand-date]');",
  "      const h = document.querySelector('header') || document.body;",
  '      const rb = t.getBoundingClientRect(); const hb = h.getBoundingClientRect();',
  '      const rd = d ? d.getBoundingClientRect() : null;',
  "      const hudEl = document.querySelector('[data-player-hud]');",
  '      const rh = hudEl ? hudEl.getBoundingClientRect() : null;',
  "      return { text: t.textContent.trim(), cx: rb.left + rb.width / 2, headerCx: hb.left + hb.width / 2,",
  "        dateText: d ? d.textContent.trim() : '', dateBelow: rd ? rd.top >= rb.bottom - 2 : false,",
  '        rightOfHud: rh ? rb.left >= rh.right - 2 : false };',
  '    })()`);',
  "    check('中部产品名为「冒险之旅」', String((brand && brand.text) || ''), '冒险之旅');",
  "    check('产品名位于 Header 中央（|Δ| ≤ 24px）', Boolean(brand) && Math.abs(Number(brand.cx) - Number(brand.headerCx)) <= 24, true);",
  "    check('日期在品牌下方且含「月…日」', Boolean(brand) && /月.+日/.test(String(brand.dateText)) && Boolean(brand.dateBelow), true);",
  "    check('品牌位于左侧角色区右侧', Boolean(brand) && Boolean(brand.rightOfHud), true);",
  '',
];

const out = [...lines.slice(0, start), ...block, ...lines.slice(end)];
writeFileSync(file, out.join('\n'));
console.log(`已替换旧 HUD 段落：行 ${start + 1}–${end}（共 ${end - start} 行）-> 新断言 ${block.length} 行`);
console.log(`旧断言引用数：${stale.length}`);
