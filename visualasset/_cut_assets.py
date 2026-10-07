"""按 alpha 通道裁切用户提供的两张透明底素材（不做去背，保留原 alpha）：
  · 80df2e24-...png -> avatar-hero.png（头像）
  · 3465406b-...png -> card-frame.png（卡框）
"""
from PIL import Image
import os

BASE = r"C:\Users\48489\Desktop\time"
OUT = os.path.join(BASE, "apps/web/public/ui")
JOBS = [
    ("80df2e24-4c9c-4f0d-8800-fa9bc23b65cd.png", "avatar-hero.png"),
    ("3465406b-9577-4ddc-88b5-e780bdcff82d.png", "card-frame.png"),
]

os.makedirs(OUT, exist_ok=True)
for src_name, out_name in JOBS:
    src = os.path.join(BASE, "visualasset", src_name)
    img = Image.open(src).convert("RGBA")
    w, h = img.size
    alpha = img.split()[3]
    hist = alpha.histogram()
    opaque = sum(hist[40:])
    print(f"{src_name}: {w}x{h}  不透明像素占比 {opaque / (w * h):.1%}")
    box = alpha.point(lambda a: 255 if a > 40 else 0).getbbox()
    if not box:
        print("  !! 全透明，跳过")
        continue
    pad = 4
    x0, y0, x1, y1 = box
    crop = img.crop((max(0, x0 - pad), max(0, y0 - pad), min(w, x1 + pad), min(h, y1 + pad)))
    path = os.path.join(OUT, out_name)
    crop.save(path)
    print(f"  -> {out_name}  {crop.size}  bytes={os.path.getsize(path)}")
