"""把首页「旧版 / 新版」两张截图并排合成一张对比图（带标题条）。"""
from PIL import Image, ImageDraw
import os

OUT = os.path.join("ui-shots", "today-compare-side-by-side.png")
now = Image.open(os.path.join("ui-shots", "today-compare-now.png"))
bit = Image.open(os.path.join("ui-shots", "today-compare-bit.png"))

# 统一高度（两张本来就同尺寸）
h = max(now.height, bit.height)
gap = 40
bar = 96

W = now.width + bit.width + gap * 3
canvas = Image.new("RGB", (W, h + bar + gap * 2), (232, 213, 174))  # brandBg
d = ImageDraw.Draw(canvas)

canvas.paste(now, (gap, bar + gap))
canvas.paste(bit, (gap * 2 + now.width, bar + gap))

# 标题条
d.rectangle([gap, gap, gap + now.width, gap + 56], fill=(242, 229, 201), outline=(74, 51, 38), width=4)
d.text((gap + 20, gap + 20), "OLD  /  TodayPage  (Panel + PixelBar + Button)", fill=(74, 51, 38))
d.rectangle(
    [gap * 2 + now.width, gap, gap * 2 + now.width + bit.width, gap + 56],
    fill=(227, 134, 40),
    outline=(74, 51, 38),
    width=4,
)
d.text((gap * 2 + now.width + 20, gap + 20), "NEW  /  TodayBitPage  (notched Card + segmented Progress + BitButton)", fill=(255, 255, 255))

canvas.save(OUT)
print(f"{OUT}  {canvas.size}")
