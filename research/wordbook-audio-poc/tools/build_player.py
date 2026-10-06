#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""由 manifest.json 生成本地播放验证页 player.html（真实浏览器播放验证用）。

产物是**独立 research 文件**，不接入现有 Web 应用。
"""
import html
import json
import os
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    src = os.path.join(HERE, "manifest.json")
    if not os.path.exists(src):
        print("manifest.json 不存在，先跑 poc_fetch.py")
        return 1
    with open(src, encoding="utf-8") as fh:
        m = json.load(fh)

    words = m.get("words") or []
    recs = m.get("records") or []

    by_word = {}
    for r in recs:
        by_word.setdefault(r["word"], {})[r["accent"]] = r

    rows = []
    stats = {"downloadable": 0, "us": 0, "uk": 0, "none": 0, "screened_out": 0}
    for w in words:
        cells = []
        for acc in ("us", "uk"):
            r = by_word.get(w, {}).get(acc) or {}
            status = r.get("status")
            if status == "allowed" and r.get("local_path"):
                stats["downloadable"] += 1
                stats[acc] += 1
                rel = "../" + r["local_path"] if r["local_path"].startswith("audio/") else r["local_path"]
                attr = html.escape(f"{r.get('license_key','')} · {r.get('evidence',{}).get('artist','')}")
                cells.append(
                    f'<td class="ok"><button onclick="play(this)" data-src="{html.escape(rel)}">▶ {acc.upper()}</button>'
                    f'<div class="meta">{attr}</div>'
                    f'<div class="meta">{r.get("bytes","")} B · {r.get("duration_sec","?")}s</div></td>'
                )
            elif status == "no_file":
                stats["none"] += 1
                cells.append('<td class="none">无音频文件</td>')
            else:
                stats["screened_out"] += 1
                cells.append(f'<td class="skip">{html.escape(status or "?")}<div class="meta">{html.escape((r.get("reason") or "")[:60])}</div></td>')
        rows.append(f"<tr><th>{html.escape(w)}</th>{''.join(cells)}</tr>")

    page = f"""<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<title>Wordbook 发音 PoC · 播放验证</title>
<style>
  body {{ font: 15px/1.6 system-ui, "Segoe UI", sans-serif; margin: 24px; color: #1b1b1b; }}
  h1 {{ font-size: 20px; margin: 0 0 4px; }}
  .sub {{ color: #666; font-size: 13px; margin-bottom: 16px; }}
  table {{ border-collapse: collapse; width: 100%; max-width: 900px; }}
  th, td {{ border: 1px solid #dcdcdc; padding: 8px 10px; text-align: left; vertical-align: top; }}
  thead th {{ background: #f6f6f6; }}
  tbody th {{ width: 150px; font-weight: 600; }}
  td.ok {{ background: #f2fbf3; }}
  td.none {{ background: #fff8f2; color: #a15c00; }}
  td.skip {{ background: #fdf2f2; color: #9b2c2c; }}
  button {{ font: inherit; padding: 4px 12px; border: 1px solid #bbb; border-radius: 6px;
            background: #fff; cursor: pointer; }}
  button:hover {{ background: #f0f0f0; }}
  .meta {{ color: #777; font-size: 12px; margin-top: 2px; word-break: break-all; }}
  .bar {{ margin: 12px 0 18px; padding: 10px 12px; background: #f6f6f6; border-radius: 8px; font-size: 13px; }}
  audio {{ margin-top: 12px; width: 100%; max-width: 600px; display: block; }}
</style>
<h1>Wordbook 发音 PoC · 播放验证</h1>
<div class="sub">30 词 · US/UK · 本地文件（非 hotlink）· 生成于 {html.escape(m.get('generated_at',''))}</div>
<div class="bar">
  可下载播放：<b>{stats['downloadable']}</b> 条（US {stats['us']} / UK {stats['uk']}） ·
  无音频文件：{stats['none']} 项 ·
  被授权筛选拦下：{stats['screened_out']} 项
</div>
<audio id="player" controls preload="none"></audio>
<table>
<thead><tr><th>单词</th><th>US（美音）</th><th>UK（英音）</th></tr></thead>
<tbody>
{''.join(rows)}
</tbody>
</table>
<script>
function play(btn) {{
  const a = document.getElementById('player');
  a.src = btn.getAttribute('data-src');
  a.play().catch(e => alert('播放失败：' + e.message));
}}
</script>
</html>
"""
    dst = os.path.join(HERE, "player.html")
    with open(dst, "w", encoding="utf-8") as fh:
        fh.write(page)
    print(f"已生成 {dst}")
    print(f"统计：{stats}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
