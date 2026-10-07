"""① 量出 card-frame.png 两条横带的真实纵向位置；② 校验并修正 growth-card-modal 的叠加层。

卡框内窗口/银灰带/米色带的 y 区间用颜色扫描得到（不靠估值）。
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

rows = []
for y in range(h):
    # 该行"不透明且偏灰蓝（银灰带）"的像素占比
    grey = cream = 0
    tot = 0
    for x in range(0, w, 3):
        r, g, b, a = px[x, y]
        if a < 40:
            continue
        tot += 1
        if abs(r - g) < 26 and abs(g - b) < 30 and 110 < r < 205:
            grey += 1
        if r > 220 and g > 200 and b > 170:
            cream += 1
    rows.append((grey / tot if tot else 0, cream / tot if tot else 0, tot))

# 银灰带：grey 占比高的连续区间（取中下部）
band_rows = [y for y, (gr, cr, t) in enumerate(rows) if gr > 0.55 and t > w // 6]
cream_rows = [y for y, (gr, cr, t) in enumerate(rows) if cr > 0.7 and t > w // 6]
mid = h // 2
grey_band = [y for y in band_rows if y > mid * 0.75 and y < mid * 1.6]
cream_band = [y for y in cream_rows if y > mid * 0.75 and y < mid * 1.6]
print("银灰带 y:", (min(grey_band), max(grey_band)) if grey_band else None)
print("米色带 y:", (min(cream_band), max(cream_band)) if cream_band else None)

def pct(v):
    return round(v / h * 100, 1)

src = open(MODAL, encoding="utf-8").read()
has_face = "growth-card-face" in src
print("modal 是否已含卡面底图:", has_face)

if grey_band and cream_band:
    g0, g1 = min(grey_band), max(grey_band)
    c0, c1 = min(cream_band), max(cream_band)
    print(f"标题带 -> top {pct(g0)}% 高 {pct(g1 - g0)}%；寄语带 -> top {pct(c0)}% 高 {pct(c1 - c0)}%")

    # 修正标题/寄语覆盖层
    src = re.sub(
        r'(data-growth-card-title-overlay"\s*\n\s*className="[^"]*?)top-\[[^\]]*\]',
        lambda m: m.group(1) + f"top-[{pct(g0)}%]",
        src, count=1)
    src = re.sub(
        r'(data-growth-card-title-overlay"[\s\S]{0,200}?)h-\[[^\]]*\]',
        lambda m: m.group(1) + f"h-[{max(6.0, pct(g1 - g0))}%]",
        src, count=1)
    src = re.sub(
        r'(data-growth-card-copy-overlay"\s*\n\s*className="[^"]*?)top-\[[^\]]*\]',
        lambda m: m.group(1) + f"top-[{pct(c0)}%]",
        src, count=1)
    src = re.sub(
        r'(data-growth-card-copy-overlay"[\s\S]{0,200}?)h-\[[^\]]*\]',
        lambda m: m.group(1) + f"h-[{max(6.0, pct(c1 - c0))}%]",
        src, count=1)

    # 卡面底图：内窗口 = 米色带以上、边框以内
    win_top = 4.0
    win_bottom = pct(g0) - 1.5
    face = (
        '            <img\n'
        '              data-growth-card-face\n'
        '              src="/ui/growth-card-face.jpg"\n'
        '              alt=""\n'
        '              aria-hidden\n'
        '              className="pointer-events-none absolute object-cover [image-rendering:pixelated]"\n'
        f'              style={{{{ left: "13%", top: "{win_top}%", width: "74%", height: "{round(win_bottom - win_top, 1)}%" }}}}\n'
        '            />\n'
    )
    src = re.sub(r'\s*<img\s+data-growth-card-face[\s\S]*?/>\n', '\n', src, count=1)  # 去重
    src = src.replace('            <img\n              data-growth-card-image',
                      face + '            <img\n              data-growth-card-image', 1)
    open(MODAL, 'w', encoding='utf-8').write(src)
    print("已写入：卡面底图 + 按实测位置修正的标题/寄语")
else:
    print("!! 未能量出带子位置")

after = open(MODAL, encoding='utf-8').read()
print("写入后 含卡面底图:", "growth-card-face" in after)
for m in re.finditer(r'data-growth-card-(title|copy)-overlay"[\s\S]{0,220}?className="([^"]+)"', after):
    print("  ", m.group(1), "->", m.group(2)[:120])
