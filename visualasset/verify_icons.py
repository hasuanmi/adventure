# -*- coding: utf-8 -*-
"""交付前自检: 透明背景 / 像素整数倍 / 调色板统一 / 无裁切 / 间距可裁切。"""

import os

import numpy as np
from PIL import Image

import build_icons as B

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "quest_icons")
ok = True


def check(cond, msg):
    global ok
    ok &= bool(cond)
    print(("  PASS  " if cond else "  FAIL  ") + msg)


print("== 1. 单个图标 (256x256) ==")
for name, _ in B.ICONS:
    im = Image.open(os.path.join(OUT, name + ".png")).convert("RGBA")
    a = np.array(im)
    alpha = a[:, :, 3]
    check(im.size == (256, 256), "%s 尺寸 256x256" % name)
    check(set(np.unique(alpha)).issubset({0, 255}),
          "%s alpha 只有 0/255 (无半透明/抗锯齿), 实测 %s" % (name, sorted(np.unique(alpha))[:6]))
    # 每个 8x8 块必须是纯色 -> 证明是 NEAREST 整数倍放大
    blocks = a.reshape(32, 8, 32, 8, 4).transpose(0, 2, 1, 3, 4).reshape(32, 32, 64, 4)
    uniform = np.all(blocks == blocks[:, :, 0:1, :], axis=2)
    check(uniform.all(), "%s 每 8x8 像素块为纯色 (真·像素放大)" % name)
    # 四角透明
    check(a[0, 0, 3] == 0 and a[0, -1, 3] == 0 and a[-1, 0, 3] == 0 and a[-1, -1, 3] == 0,
          "%s 四角透明" % name)

print("== 2. 原生 32x32 未被画布裁切 (描边完整) ==")
for name, fn in B.ICONS:
    raw = np.array(fn())[:, :, 3] > 0
    edge = raw[0, :].any() or raw[-1, :].any() or raw[:, 0].any() or raw[:, -1].any()
    check(not edge, "%s 图形不贴边, 1px 描边不被裁切" % name)

print("== 3. 1x5 横向排列图 ==")
strip = Image.open(os.path.join(OUT, "quest_icons_1x5.png")).convert("RGBA")
s = np.array(strip)
CELL, GAP, MARGIN = B.CELL, B.GAP, B.MARGIN
check(strip.size == (MARGIN * 2 + CELL * 5 + GAP * 4, MARGIN * 2 + CELL),
      "画布 %s = 5 格 256px + 4 条 64px 间距 + 64px 外留白" % (strip.size,))
# 每格完全相同于单独图标, 且位于预期位置
for i, (name, _) in enumerate(B.ICONS):
    x = MARGIN + i * (CELL + GAP)
    cell = s[MARGIN:MARGIN + CELL, x:x + CELL]
    ref = np.array(Image.open(os.path.join(OUT, name + ".png")).convert("RGBA"))
    check(np.array_equal(cell, ref), "第 %d 格 (%s) 位于 x=%d 且与单图逐像素一致" % (i + 1, name, x))
# 间距区域必须完全透明, 保证可整块裁切
for i in range(4):
    gx = MARGIN + CELL + i * (CELL + GAP)
    gap = s[:, gx:gx + GAP, 3]
    check(gap.max() == 0, "第 %d 条 64px 间距完全透明 (可裁切)" % (i + 1))
# 列方向不得有相邻图标重叠
cols = (s[:, :, 3] > 0).any(axis=0)
runs, prev, start = [], False, 0
for x, v in enumerate(cols):
    if v and not prev:
        start = x
    if prev and not v:
        runs.append((start, x - 1))
    prev = v
if prev:
    runs.append((start, len(cols) - 1))
check(len(runs) == 5, "横向 5 个互不相邻的独立图形块: %s" % runs)

print("== 4. 统一色彩体系 ==")
px = s.reshape(-1, 4)
used = sorted({tuple(v) for v in px.tolist() if v[3] > 0})
check(len(used) <= 26, "全图仅使用 %d 种颜色 (统一有限调色板)" % len(used))
for name in used:
    print("      #%02X%02X%02X" % name[:3])

print("== 5. 交付文件 ==")
for rel in ["quest_icons_1x5.png", "preview_light_dark.png"] + \
           [n + ".png" for n, _ in B.ICONS] + \
           [os.path.join("native32", n + ".png") for n, _ in B.ICONS]:
    p = os.path.join(OUT, rel)
    check(os.path.isfile(p), "%s (%d bytes)" % (rel, os.path.getsize(p)))

print("\nRESULT:", "ALL CHECKS PASSED" if ok else "SOME CHECKS FAILED")
