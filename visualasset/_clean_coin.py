from PIL import Image
from collections import deque
p = r"C:\Users\48489\Desktop\time\apps\web\public\ui\coin.png"
im = Image.open(p).convert("RGBA")
w, h = im.size
a = im.split()[3].load()
seen = bytearray(w * h)
comps = []
for y0 in range(h):
    for x0 in range(w):
        i = y0 * w + x0
        if seen[i] or a[x0, y0] <= 40:
            continue
        q = deque([(x0, y0)]); seen[i] = 1
        px_list = [(x0, y0)]
        while q:
            x, y = q.popleft()
            for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                nx, ny = x+dx, y+dy
                if 0 <= nx < w and 0 <= ny < h:
                    j = ny * w + nx
                    if not seen[j] and a[nx, ny] > 40:
                        seen[j] = 1; q.append((nx, ny)); px_list.append((nx, ny))
        comps.append(px_list)
comps.sort(key=len, reverse=True)
print("连通块数量:", len(comps), "各块像素数:", [len(c) for c in comps[:5]])
# 只保留最大的连通块（金币本体），其余（漏出的卡框残条）置透明
keep = set(comps[0]) if comps else set()
for c in comps[1:]:
    for (x, y) in c:
        r, g, b, _ = im.getpixel((x, y))
        im.putpixel((x, y), (r, g, b, 0))
box = im.split()[3].point(lambda v: 255 if v > 40 else 0).getbbox()
if box:
    im = im.crop(box)
im.save(p)
cw, ch = im.size
print("清理后", im.size)
print("四角 alpha:", [im.getpixel(q)[3] for q in ((0,0),(cw-1,0),(0,ch-1),(cw-1,ch-1))])
print("中心:", im.getpixel((cw//2, ch//2))[:3], im.getpixel((cw//2, ch//2))[3])