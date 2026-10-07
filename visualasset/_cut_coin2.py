"""从合成图右下角取金币：
1) 按坐标裁出金币所在区域；
2) 从四角泛洪，把"棋盘格"（浅灰/近白、低饱和）像素变透明 —— 金币有深色描边，泛洪会停在描边上；
3) 按 alpha 收紧并保存为 apps/web/public/ui/coin.png。
"""
from PIL import Image
from collections import deque
import os

SRC = r"C:\Users\48489\.wanwuyouxu\attachments\v1\objects\d2\d2866243e4900d6e62ae0645d4992494fa26b49fabd8ace17760477145999d35"
OUT = r"C:\Users\48489\Desktop\time\apps\web\public\ui\coin.png"

im = Image.open(SRC).convert("RGBA")
w, h = im.size
region = im.crop((int(w * 0.63), int(h * 0.57), int(w * 0.91), int(h * 0.95)))
rw, rh = region.size
px = region.load()
print("裁剪区域", region.size)


def is_checker(p):
    r, g, b, a = p
    if a < 40:
        return True
    mx, mn = max(r, g, b), min(r, g, b)
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    return lum > 198 and (mx - mn) < 26  # 浅灰/近白且低饱和 = 棋盘格


seen = bytearray(rw * rh)
q = deque()
for sx, sy in ((0, 0), (rw - 1, 0), (0, rh - 1), (rw - 1, rh - 1), (rw // 2, 0), (rw // 2, rh - 1), (0, rh // 2), (rw - 1, rh // 2)):
    if not seen[sy * rw + sx] and is_checker(px[sx, sy]):
        seen[sy * rw + sx] = 1
        q.append((sx, sy))

cleared = 0
while q:
    x, y = q.popleft()
    r, g, b, a = px[x, y]
    px[x, y] = (r, g, b, 0)
    cleared += 1
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nx, ny = x + dx, y + dy
        if 0 <= nx < rw and 0 <= ny < rh:
            j = ny * rw + nx
            if not seen[j] and is_checker(px[nx, ny]):
                seen[j] = 1
                q.append((nx, ny))
print("去背像素", cleared)

box = region.split()[3].point(lambda a: 255 if a > 40 else 0).getbbox()
print("不透明外接框", box)
if box:
    pad = 3
    region = region.crop((max(0, box[0] - pad), max(0, box[1] - pad), min(rw, box[2] + pad), min(rh, box[3] + pad)))
region.save(OUT)
print("已保存", OUT, region.size, os.path.getsize(OUT), "bytes")

# 自检：四角是否透明（棋盘格已去除）、中心是否不透明（金币本体保留）
chk = Image.open(OUT).convert("RGBA")
cw, ch = chk.size
print("角落 alpha:", [chk.getpixel(p)[3] for p in ((0, 0), (cw - 1, 0), (0, ch - 1), (cw - 1, ch - 1))])
print("中心 alpha:", chk.getpixel((cw // 2, ch // 2))[3], "中心色:", chk.getpixel((cw // 2, ch // 2))[:3])
