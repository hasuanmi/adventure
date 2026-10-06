"""把 public/icons 下所有任务图标做成对照表：4x 放大（看真实像素）+ 1x（看实际显示尺寸）。"""
from PIL import Image, ImageDraw
import os

SRC = os.path.join("apps", "web", "public", "icons")
OUT = os.path.join("ui-shots", "icon-contact-sheet.png")
names = sorted(f for f in os.listdir(SRC) if f.endswith(".png"))
print(f"{len(names)} icons")

COLS = 9
CELL = 150
PAD = 8
LABEL_H = 20
rows = (len(names) + COLS - 1) // COLS
W = COLS * CELL
H = rows * (CELL + LABEL_H) + 40
canvas = Image.new("RGB", (W, H), (232, 213, 174))
d = ImageDraw.Draw(canvas)
d.text((8, 10), f"task icons @ /icons  ({len(names)} files, 32x32 native)", fill=(74, 51, 38))

for i, n in enumerate(names):
    im = Image.open(os.path.join(SRC, n)).convert("RGBA")
    native = im.size
    big = im.resize((native[0] * 4, native[1] * 4), Image.NEAREST)
    small = im.resize((native[0], native[1]), Image.NEAREST)
    cx = (i % COLS) * CELL
    cy = 40 + (i // COLS) * (CELL + LABEL_H)
    # 棋盘格底，便于看透明区域
    for yy in range(0, CELL, 10):
        for xx in range(0, CELL, 10):
            if (xx // 10 + yy // 10) % 2 == 0:
                d.rectangle([cx + xx, cy + yy, cx + xx + 9, cy + yy + 9], fill=(214, 196, 160))
    canvas.paste(big, (cx + (CELL - big.width) // 2, cy + (CELL - LABEL_H - big.height) // 2), big)
    # 右下角叠一个 1x 真实尺寸
    canvas.paste(small, (cx + CELL - native[0] - PAD, cy + CELL - LABEL_H - native[1] - PAD), small)
    d.text((cx + 4, cy + CELL - LABEL_H + 4), f"{n[:-4]}  {native[0]}x{native[1]}", fill=(74, 51, 38))

canvas.save(OUT)
print(f"{OUT}  {canvas.size}")
