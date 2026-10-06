"""从 Kenney Toon Characters（CC0）里导出表头/成长页用的**头肩像**。
来源：visualasset/kenney_toon-characters/Female person/PNG/Poses/character_femalePerson_idle.png（96×128，透明）
输出：apps/web/public/avatar-girl-toon.png（128×128，头肩裁切 + 正方形 + LANCZOS 重采样）
      （Toon 是平滑卡通风而非像素风，故用 LANCZOS；像素风头像另见 build_avatar.py）
"""
import os
from PIL import Image

ROOT = r"C:\Users\48489\Desktop\time"
SRC = os.path.join(
    ROOT, "visualasset", "kenney_toon-characters", "Female person", "PNG", "Poses",
    "character_femalePerson_idle.png",
)
OUT = os.path.join(ROOT, "apps", "web", "public", "avatar-girl-toon.png")
CHECK = os.path.join(ROOT, "visualasset", "_avatar_toon_check.png")
SIZE = 128
# 头肩比例：取角色 alpha 包围盒的上部（含完整头部 + 肩部/上胸，避免裁到下巴）
HEAD_RATIO = 0.78


def main() -> None:
    im = Image.open(SRC).convert("RGBA")
    bbox = im.getbbox()  # alpha 包围盒
    if not bbox:
        raise SystemExit("源图完全透明")
    x0, y0, x1, y1 = bbox
    w, h = x1 - x0, y1 - y0
    # 头肩区域：宽度取"身体宽度 + 留白"，高度取 bbox 高度的 HEAD_RATIO
    face_w = int(w * 0.95)
    face_h = int(h * HEAD_RATIO)
    cx = (x0 + x1) // 2
    left = max(0, cx - face_w // 2)
    top = max(0, y0 - int(h * 0.02))
    crop = im.crop((left, top, min(im.width, left + face_w), min(im.height, top + face_h)))

    # 补成正方形（透明填充），再缩放到 SIZE
    side = max(crop.width, crop.height)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(crop, ((side - crop.width) // 2, (side - crop.height) // 2), crop)
    out = square.resize((SIZE, SIZE), Image.LANCZOS)
    out.save(OUT)
    print(f"{SRC} bbox={bbox} -> {OUT} {out.size}")

    # 自检图：浅底 + 深底各一份，确认透明背景与裁切位置
    sheet = Image.new("RGBA", (SIZE * 2 + 24, SIZE + 16), (60, 64, 88, 255))
    light = Image.new("RGBA", (SIZE, SIZE), (242, 229, 201, 255))
    light.paste(out, (0, 0), out)
    sheet.paste(light, (8, 8))
    sheet.paste(out, (SIZE + 16, 8), out)
    sheet.save(CHECK)
    print("check ->", CHECK)


if __name__ == "__main__":
    main()
