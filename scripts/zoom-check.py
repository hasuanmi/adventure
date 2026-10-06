"""放大检查像素字体是否真的生效：裁头部 HUD / 冒险卡 / Tab / 底部功能栏。"""
from PIL import Image
import os

im = Image.open(os.path.join("ui-shots", "today-compare-bit.png"))
print(f"source {im.size}")
regions = {
    "z-header": (400, 0, 1700, 135),
    "z-adventure": (400, 335, 1800, 620),
    "z-tabs": (400, 855, 1800, 985),
    "z-nav": (400, 2160, 1800, 2300),
}
outdir = os.path.join("ui-shots", "crops")
os.makedirs(outdir, exist_ok=True)
for name, box in regions.items():
    box = (max(0, box[0]), max(0, box[1]), min(im.width, box[2]), min(im.height, box[3]))
    sub = im.crop(box)
    # 2x 再放大，方便看单像素笔画
    sub = sub.resize((sub.width * 2, sub.height * 2), Image.NEAREST)
    p = os.path.join(outdir, f"{name}.png")
    sub.save(p)
    print(f"{name:14} {box} -> {p} {sub.size}")
