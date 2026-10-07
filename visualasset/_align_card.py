"""精确量出 card-frame.png 的：透明内窗口矩形 + 银灰带 + 米色带，并写入 growth-card-modal。

· 内窗口：上半部分"整行/整列都透明"的最大矩形（卡框内部是透明的）
· 银灰带：灰蓝像素占主导的行区间（y 约 599-699）
· 米色带：银灰带**下方**米色像素占主导的行区间（限制在下半部分，避免误判）
写完后回读并打印关键行做验证。
"""
from PIL import Image
import os, re

BASE = r"C:\Users\48489\Desktop\time"
FRAME = os.path.join(BASE, "apps/web/public/ui/card-frame.png")
MODAL = os.path.join(BASE, "apps/web/src/components/growth-card-modal.tsx")

im = Image.open(FRAME).convert("RGBA")
w, h = im.size
px = im.load()
print(f"card-frame.png {w}x{h}")

# ---- 内窗口：在上半区域找"完全透明"的最大矩形 ----
def row_all_transparent(y, x0, x1):
    for x in range(x0, x1):
        if px[x, y][3] > 20:
            return False
    return True

def col_all_transparent(x, y0, y1):
    for y in range(y0, y1):
        if px[x, y][3] > 20:
            return False
    return True

top_limit = int(h * 0.62)
# 找最大的透明行区间（上半）
best = None
y = 0
while y < top_limit:
    if row_all_transparent(y, int(w * 0.05), int(w * 0.95)):
        y0 = y
        while y < top_limit and row_all_transparent(y, int(w * 0.05), int(w * 0.95)):
            y += 1
        y1 = y
        if not best or (y1 - y0) > (best[1] - best[0]):
            best = (y0, y1)
    else:
        y += 1
win_y0, win_y1 = best if best else (0, 0)
# 在该行区间内找最大透明列区间
x = 0
bestx = None
while x < int(w * 0.95):
    if col_all_transparent(x, win_y0 + 3, win_y1 - 3):
        x0 = x
        while x < w and col_all_transparent(x, win_y0 + 3, win_y1 - 3):
            x += 1
        x1 = x
        if not bestx or (x1 - x0) > (bestx[1] - bestx[0]):
            bestx = (x0, x1)
    else:
        x += 1
win_x0, win_x1 = bestx if bestx else (0, 0)
print(f"内窗口: x {win_x0}-{win_x1}  y {win_y0}-{win_y1}")
print(f"  比例: left {win_x0/w*100:.1f}%  top {win_y0/h*100:.1f}%  width {(win_x1-win_x0)/w*100:.1f}%  height {(win_y1-win_y0)/h*100:.1f}%")

# ---- 两条带 ----
def row_stats(y):
    grey = cream = tot = 0
    for x in range(0, w, 3):
        r, g, b, a = px[x, y]
        if a < 40:
            continue
        tot += 1
        if abs(r - g) < 26 and abs(g - b) < 32 and 110 < r < 210:
            grey += 1
        if r > 215 and g > 195 and b > 165:
            cream += 1
    return (grey / tot if tot else 0), (cream / tot if tot else 0), tot

grey_rows = [y for y in range(int(h * 0.55), int(h * 0.78)) if row_stats(y)[0] > 0.5]
cream_rows = [y for y in range((max(grey_rows) + 2) if grey_rows else int(h * 0.7), int(h * 0.95)) if row_stats(y)[1] > 0.6]
g0, g1 = (min(grey_rows), max(grey_rows)) if grey_rows else (0, 0)
c0, c1 = (min(cream_rows), max(cream_rows)) if cream_rows else (0, 0)
print(f"银灰带 y {g0}-{g1} -> top {g0/h*100:.1f}% 高 {(g1-g0)/h*100:.1f}%")
print(f"米色带 y {c0}-{c1} -> top {c0/h*100:.1f}% 高 {(c1-c0)/h*100:.1f}%")

src = open(MODAL, encoding="utf-8").read()
face_block = (
    '            <img\n'
    '              data-growth-card-face\n'
    '              src="/ui/growth-card-face.jpg"\n'
    '              alt=""\n'
    '              aria-hidden\n'
    '              className="pointer-events-none absolute object-cover [image-rendering:pixelated]"\n'
    f'              style={{{{ left: "{win_x0/w*100:.1f}%", top: "{win_y0/h*100:.1f}%", width: "{(win_x1-win_x0)/w*100:.1f}%", height: "{(win_y1-win_y0)/h*100:.1f}%" }}}}\n'
    '            />\n'
)
# 删除旧的卡面底图块，再插到卡框图之前
src = re.sub(r'[ \t]*<img\s+data-growth-card-face[\s\S]*?/>\n', '', src, count=1)
src = src.replace('            <img\n              data-growth-card-image', face_block + '            <img\n              data-growth-card-image', 1)

# 标题/寄语：整条带 + flex 居中
src = re.sub(r'(data-growth-card-title-overlay[\s\S]{0,200}?className="[^"]*?top-\[)[^\]]*(\][^"]*?h-\[)[^\]]*(\])',
             lambda m: f"{m.group(1)}{g0/h*100:.1f}%{m.group(2)}{(g1-g0)/h*100:.1f}%{m.group(3)}", src, count=1)
src = re.sub(r'(data-growth-card-copy-overlay[\s\S]{0,200}?className="[^"]*?top-\[)[^\]]*(\][^"]*?h-\[)[^\]]*(\])',
             lambda m: f"{m.group(1)}{c0/h*100:.1f}%{m.group(2)}{(c1-c0)/h*100:.1f}%{m.group(3)}", src, count=1)

open(MODAL, 'w', encoding='utf-8').write(src)

after = open(MODAL, encoding='utf-8').read()
print("回读验证：")
print("  卡面底图存在:", "growth-card-face" in after)
for m in re.finditer(r'data-growth-card-face[\s\S]{0,220}?style=\{\{([^}]*)\}\}', after):
    print("   面:", m.group(1).strip())
for m in re.finditer(r'data-growth-card-(title|copy)-overlay"[\s\S]{0,200}?className="([^"]+)"', after):
    print("  ", m.group(1), "->", m.group(2)[:130])
