from PIL import Image
from collections import deque
p = r"C:\Users\48489\Desktop\time\apps\web\public\ui\coin.png"
im = Image.open(p).convert("RGBA")
w, h = im.size
a = im.split()[3]
# 逐行找"连续不透明"的起点：卡框残条是顶部很薄的几条，金币主体在下方
rows = []
for y in range(h):
    cnt = sum(1 for x in range(0, w, 2) if a.getpixel((x, y)) > 40)
    rows.append(cnt)
# 从下往上找到金币顶端：从底部连续宽度较大处开始
start = 0
for y in range(h):
    if rows[y] > w * 0.25:
        start = max(0, y - 4)
        break
im2 = im.crop((0, start, w, h))
box = im2.split()[3].point(lambda v: 255 if v > 40 else 0).getbbox()
if box:
    im2 = im2.crop(box)
im2.save(p)
print("裁剪后", im2.size)
cw, ch = im2.size
print("四角 alpha:", [im2.getpixel(q)[3] for q in ((0,0),(cw-1,0),(0,ch-1),(cw-1,ch-1))])
print("中心:", im2.getpixel((cw//2, ch//2))[:3], im2.getpixel((cw//2, ch//2))[3])