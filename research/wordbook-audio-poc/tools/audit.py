#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PoC 落盘审计：对 audio/ 下已下载文件重算 SHA256、校验头部可解码性、检查台账完整性。

这是「不要因为能下载就默认可用」的落地检查：
  * 文件确实存在于磁盘（不是只写进了 manifest）
  * SHA256 与 manifest 记录一致（可复现、可与日后生产校验对齐）
  * 头部可解析（MP3 帧头 / OggS），并有合理时长
  * attribution.csv 每行都有 source_page_url / author / license_name / license_url
"""
import csv
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from poc_fetch import mp3_info, ogg_info, sha256_bytes  # noqa: E402

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    with open(os.path.join(HERE, "manifest.json"), encoding="utf-8") as fh:
        manifest = json.load(fh)
    recs = manifest.get("records") or []

    problems = []
    checked = 0
    total_bytes = 0
    durations = []

    for r in recs:
        if r.get("status") != "allowed" or not r.get("local_path"):
            continue
        path = os.path.join(HERE, r["local_path"].replace("/", os.sep))
        checked += 1
        if not os.path.exists(path):
            problems.append(f"[缺失文件] {r['local_path']}")
            continue
        blob = open(path, "rb").read()
        total_bytes += len(blob)
        digest = sha256_bytes(blob)
        if digest != r.get("sha256"):
            problems.append(f"[SHA256 不一致] {r['local_path']} manifest={r.get('sha256')} actual={digest}")
        if path.lower().endswith(".mp3"):
            ok, dur, br, sr = mp3_info(blob)
        else:
            ok, dur, br, sr = ogg_info(blob)
        if not ok:
            problems.append(f"[头部不可解析] {r['local_path']}")
        if dur:
            durations.append((r["word"], r["accent"], dur))
            if not (0.15 <= dur <= 6.0):
                problems.append(f"[时长异常 {dur}s] {r['local_path']}")
        if r.get("bytes") != len(blob):
            problems.append(f"[字节数不一致] {r['local_path']} manifest={r.get('bytes')} actual={len(blob)}")
        # 授权台账字段完整性
        ev = r.get("evidence") or {}
        for field, val in (("author", ev.get("artist")), ("license", r.get("license_key"))):
            if not val:
                problems.append(f"[台账缺 {field}] {r['local_path']}")

    # attribution.csv 行数校验
    csv_path = os.path.join(HERE, "attribution.csv")
    csv_rows = 0
    csv_missing = 0
    if os.path.exists(csv_path):
        with open(csv_path, encoding="utf-8-sig", newline="") as fh:
            for row in csv.DictReader(fh):
                csv_rows += 1
                for col in ("source_page_url", "author_original", "license_name", "license_url", "attribution_text"):
                    if not (row.get(col) or "").strip():
                        csv_missing += 1
                        problems.append(f"[attribution.csv 空列 {col}] {row.get('commons_file')}")

    print("=" * 70)
    print("PoC 落盘审计")
    print("=" * 70)
    print(f"检查文件数        : {checked}")
    print(f"磁盘总字节        : {total_bytes} ({total_bytes/1024:.0f} KB)")
    print(f"attribution 行数  : {csv_rows}")
    print(f"attribution 空列数: {csv_missing}")
    if durations:
        ds = sorted(d for _, _, d in durations)
        print(f"时长中位数        : {ds[len(ds)//2]:.2f}s  最短 {ds[0]:.2f}s  最长 {ds[-1]:.2f}s")
    print()
    if problems:
        print(f"⚠️ 发现 {len(problems)} 个问题：")
        for p in problems[:40]:
            print("   -", p)
    else:
        print("✅ 无问题：文件存在、SHA256 一致、头部可解析、台账字段完整。")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
