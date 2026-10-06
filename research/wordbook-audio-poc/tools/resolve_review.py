#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""人工复核工具：把 review_queue.csv 里的待复核条目，按人工决定放行或丢弃。

背景（本 PoC 实测结论）：44 条白名单里 27 条必须先做一次人工判断
（GFDL 双标注 / 自发布 Own work）。自动化脚本永远判不了这一刀，
所以把"人工拍板"做成**显式的、可审计的一步**，而不是一句建议。

用法：
  1) python tools/resolve_review.py --init          # 生成 review_decisions.json 模板
  2) 人工编辑 review_decisions.json：把 verdict 改成 accept / reject，填 reason 与 reviewer
  3) python tools/resolve_review.py --apply         # 只对 accept 的条目下载并重建台账
     （--apply 只下载"尚未落盘"的文件，不会重复下载已有文件）

不依赖网络上的授权重新查询：复用 manifest.json 里已抓到的 extmetadata 证据。
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from poc_fetch import (  # noqa: E402
    ACCENTS, ALLOW_LICENSES, Fetcher, WORDS, mp3_info, mp3_transcode_url,
    ogg_info, pick_download_url, sha256_bytes, slug, write_artifacts,
)

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DECISIONS = os.path.join(HERE, "review_decisions.json")


def load_manifest():
    with open(os.path.join(HERE, "manifest.json"), encoding="utf-8") as fh:
        return json.load(fh)


def init_template():
    m = load_manifest()
    items = []
    for r in m["records"]:
        if r["status"] != "needs_review" or not r.get("title"):
            continue
        ev = r.get("evidence") or {}
        items.append({
            "word": r["word"],
            "accent": r["accent"],
            "commons_file": r["title"],
            "license": ALLOW_LICENSES.get(r.get("license_key"), r.get("license_key") or ""),
            "artist": ev.get("artist", ""),
            "uploader": ev.get("uploader", ""),
            "credit": ev.get("credit", ""),
            "reason": r.get("reason", ""),
            "source_page_url": "https://commons.wikimedia.org/wiki/" + (r["title"] or "").replace(" ", "_"),
            "verdict": "pending",          # pending / accept / reject
            "reviewer": "",                # 人工填写：谁核对的
            "reviewed_at": "",             # 人工填写：何时核对（ISO8601）
            "note": "",                    # 人工填写：依据（例如"已打开文件页确认作者=录音者"）
        })
    data = {
        "instructions": [
            "逐条打开 source_page_url，确认：① 原作者是谁 ② 许可是否允许商用 + 再分发 ③ 是否改动过音频",
            "verdict=accept 时必须填 reviewer / reviewed_at / note（工具会写入 attribution.csv 的 verified_by/verified_at）",
            "verdict=reject 表示弃用该条（不进白名单，继续走 speechSynthesis 兜底）",
            "本文件是人工决策记录，与自动筛选规则分离，便于审计与回滚",
        ],
        "items": items,
    }
    with open(DECISIONS, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
    print(f"已生成 {DECISIONS}（{len(items)} 条待复核）")
    return 0


def apply_decisions(args):
    if not os.path.exists(DECISIONS):
        print("缺少 review_decisions.json，先跑 --init")
        return 1
    with open(DECISIONS, encoding="utf-8") as fh:
        data = json.load(fh)

    by_key = {(i["word"], i["accent"]): i for i in data.get("items", [])}
    m = load_manifest()
    f = Fetcher(delay=args.delay, max_retries=args.retries)
    audio_dir = os.path.join(HERE, "audio")

    accepted, rejected, skipped, errors = 0, 0, 0, 0
    for r in m["records"]:
        if r["status"] != "needs_review" or not r.get("title"):
            continue
        item = by_key.get((r["word"], r["accent"]))
        if not item or item.get("verdict") not in ("accept", "reject"):
            skipped += 1
            continue
        if item["verdict"] == "reject":
            rejected += 1
            r["status"] = "rejected"
            r["reason"] = f"人工复核弃用：{item.get('note') or '未说明'}"
            r["evidence"] = {**(r.get("evidence") or {}), "reviewer": item.get("reviewer", ""),
                             "reviewed_at": item.get("reviewed_at", "")}
            continue

        # accept：补齐必填审计字段
        if not (item.get("reviewer") and item.get("reviewed_at") and item.get("note")):
            print(f"  ! {r['word']}/{r['accent']} verdict=accept 但缺 reviewer/reviewed_at/note -> 跳过")
            errors += 1
            continue

        meta = {"file_url": r.get("file_url")}
        if not meta["file_url"]:
            print(f"  ! {r['word']}/{r['accent']} manifest 缺 file_url，需先重跑 poc_fetch.py")
            errors += 1
            continue
        try:
            dl_url, kind = pick_download_url(meta)
            blob = f.get(dl_url, download=True)
        except Exception as e:
            print(f"  ! 下载失败 {r['word']}/{r['accent']}: {type(e).__name__}: {str(e)[:80]}")
            errors += 1
            continue

        ext = ".mp3" if kind == "mp3-transcode" or dl_url.lower().endswith(".mp3") else ".ogg"
        fname = f"{slug(r['word'])}-{r['accent']}{ext}"
        path = os.path.join(audio_dir, r["accent"], fname)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as fh:
            fh.write(blob)
        ok, dur, br, sr = mp3_info(blob) if ext == ".mp3" else ogg_info(blob)

        r.update({
            "status": "allowed",
            "reason": f"人工复核放行：{item['note']}",
            "local_path": os.path.relpath(path, HERE).replace("\\", "/"),
            "download_url": dl_url, "download_kind": kind,
            "bytes": len(blob), "sha256": sha256_bytes(blob),
            "playable_header_ok": ok, "duration_sec": dur,
            "bitrate_kbps": br, "sample_rate": sr,
        })
        ev = r.get("evidence") or {}
        ev.update({"reviewer": item["reviewer"], "reviewed_at": item["reviewed_at"],
                   "resolution": f"manual accept: {item['note']}"})
        r["evidence"] = ev
        accepted += 1
        print(f"  [OK ] {r['word']:<12} {r['accent']} {fname:<20} {len(blob):>6}B dur={dur}")

    # 注意：人工复核路径不重算 input 层面统计（不重跑 search），found 传 None 即跳过 stats.json
    write_artifacts(m, HERE, words=WORDS, accents=ACCENTS, found=None,
                    requests=None, rate429=0, downloads=None)
    print(f"\n人工复核结果：accept {accepted} / reject {rejected} / 待决 {skipped} / 错误 {errors}")
    print("已重建 manifest.json / attribution.csv / review_queue.csv")
    return 0 if errors == 0 else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--init", action="store_true", help="生成 review_decisions.json 模板")
    ap.add_argument("--apply", action="store_true", help="按人工决定应用（下载 + 重建台账）")
    ap.add_argument("--delay", type=float, default=12.0)
    ap.add_argument("--retries", type=int, default=3)
    args = ap.parse_args()
    if args.init:
        return init_template()
    if args.apply:
        return apply_decisions(args)
    ap.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
