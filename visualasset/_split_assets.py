"""从用户提供的合成图中切出三张素材：卡面框 / 头像 / 金币。
做法：按可见（非透明）像素的连通区域取外接框，再按位置分派到左（卡面）、右上（头像）、右下（金币）。
"""
from PIL import Image
import os

SRC = r"C:\Users\48489\.wanwuyouxu\attachments\v1\objects\d2\d2866243e4900d6e62ae0645d4992494fa26b49fabd8ace17760477145999d35"
OUT = r"apps/web/public/ui"
os.makedirs(OUT, exist_ok=True)

im = Image.open(SRC).convert("RGBA")
w, h = im.size
print("源图尺寸", w, h)

alpha = im.split()[3]
mask = alpha.point(lambda a: 255 if a > 40 else 0)

# 简易连通区域：按 8 邻域做 flood fill（图像较大，用分块网格近似加速）
from collections import deque

visited = bytearray(w * h)
px = mask.load()
boxes = []
STEP = 2
for y0 in range(0, h, STEP):
    for x0 in range(0, w, STEP):
        if visited[y0 * w + x0] or px[x0, y0] == 0:
            continue
        q = deque([(x0, y0)])
        visited[y0 * w + x0] = 1
        minx = maxx = x0
        miny = maxy = y0
        cnt = 0
        while q:
            x, y = q.popleft()
            cnt += 1
            if x < minx: minx = x
            if x > maxx: maxx = x
            if y < miny: miny = y
            if y > maxy: maxy = y
            for dx, dy in ((STEP, 0), (-STEP, 0), (0, STEP), (0, -STEP), (STEP, STEP), (-STEP, -STEP), (STEP, -STEP), (-STEP, STEP)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and not visited[ny * w + nx] and px[nx, ny] != 0:
                    visited[ny * w + nx] = 1
                    q.append((nx, ny))
        if cnt > 400:
            boxes.append((minx, miny, maxx, maxy, cnt))

boxes.sort(key=lambda b: -b[4])
print("连通区域（按面积）:")
for b in boxes[:6]:
    print("   box", b[:4], "px", b[4])

# 位置分派：左半 -> 卡面；右上 -> 头像；右下 -> 金币
named = {}
for (x0, y0, x1, y1, cnt) in boxes[:6]:
    cx, cy = (x0 + x1) / 2 / w, (y0 + y1) / 2 / h
    key = None
    if cx < 0.5:
        key = "card-frame"
    elif cy < 0.5:
        key = "avatar-hero"
    else:
        key = "coin"
    if key not in named:
        named[key] = (x0, y0, x1, y1)

for key, (x0, y0, x1, y1) in named.items():
    crop = im.crop((max(0, x0 - 2), max(0, y0 - 2), min(w, x1 + 3), min(h, y1 + 3)))
    path = os.path.join(OUT, f"{key}.png")
    crop.save(path)
    print(f"已导出 {path}  尺寸={crop.size}")

missing = [k for k in ("card-frame", "avatar-hero", "coin") if k not in named]
print("缺失:", missing if missing else "无")
