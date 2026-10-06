"""把 ui-preview.png 裁成几张原生分辨率特写，便于核对像素细节（缺角/裁切/对齐）。"""
from PIL import Image
import os

src = os.path.join("ui-shots", "ui-preview.png")
im = Image.open(src)
W, H = im.size
print(f"source {W}x{H}")

# 裁剪框按 2x 实际像素（源图 2400x4344）
crops = {
    # Card 对照 + 三档标题带
    "card": (440, 290, W - 20, 740),
    # Progress 对照 + 三档配色
    "progress": (440, 790, W - 20, 1330),
    # Button 对照（重点看外框是否被裁 / 对齐偏移）
    "button": (440, 2260, W - 20, 2500),
    # 场景合成（左现状 / 右 8bitcn 技法）
    "scene": (440, 2520, W - 20, 3320),
}

outdir = os.path.join("ui-shots", "ui-preview-crops")
os.makedirs(outdir, exist_ok=True)
for name, box in crops.items():
    box = (max(0, box[0]), max(0, box[1]), min(W, box[2]), min(H, box[3]))
    sub = im.crop(box)
    p = os.path.join(outdir, f"{name}.png")
    sub.save(p)
    print(f"{name:10} {box} -> {p}  {sub.size}")
