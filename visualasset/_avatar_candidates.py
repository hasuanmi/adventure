"""头像候选对照图：从 Kenney Toon Characters 里取若干角色/姿势，按同一规则裁头肩像，拼一张带标签的对照图。
仅用于挑选（临时脚本）；选中的角色由 build_avatar_toon.py 正式导出。
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = r"C:\Users\48489\Desktop\time"
BASE = os.path.join(ROOT, "visualasset", "kenney_toon-characters")
OUT = os.path.join(ROOT, "visualasset", "_avatar_candidates.png")
SIZE = 112
HEAD_RATIO = 0.78

CANDIDATES = [
    ("Female person", "idle", "女生·站姿"),
    ("Female person", "cheer0", "女生·欢呼"),
    ("Female person", "show", "女生·展示"),
    ("Female person", "talk", "女生·说话"),
    ("Female adventurer", "idle", "女冒险者·站姿"),
    ("Female adventurer", "cheer0", "女冒险者·欢呼"),
    ("Female adventurer", "show", "女冒险者·展示"),
    ("Female adventurer", "talk", "女冒险者·说话"),
    ("Male person", "idle", "男生·站姿"),
    ("Male adventurer", "idle", "男冒险者·站姿"),
    ("Robot", "idle", "机器人"),
]


def headshot(character: str, pose: str) -> Image.Image | None:
    import glob

    matches = sorted(glob.glob(os.path.join(BASE, character, "PNG", "Poses", f"*_{pose}.png")))
    if not matches:
        return None
    path = matches[0]
    im = Image.open(path).convert("RGBA")
    bbox = im.getbbox()
    if not bbox:
        return None
    x0, y0, x1, y1 = bbox
    w, h = x1 - x0, y1 - y0
    face_w = int(w * 0.95)
    face_h = int(h * HEAD_RATIO)
    cx = (x0 + x1) // 2
    left = max(0, cx - face_w // 2)
    top = max(0, y0 - int(h * 0.02))
    crop = im.crop((left, top, min(im.width, left + face_w), min(im.height, top + face_h)))
    side = max(crop.width, crop.height)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(crop, ((side - crop.width) // 2, (side - crop.height) // 2), crop)
    return square.resize((SIZE, SIZE), Image.LANCZOS)


def main() -> None:
    cols = 6
    rows = (len(CANDIDATES) + cols - 1) // cols
    cell_w, cell_h = SIZE + 16, SIZE + 34
    sheet = Image.new("RGBA", (cols * cell_w + 8, rows * cell_h + 8), (242, 229, 201, 255))
    d = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", 12)
    except Exception:  # noqa: BLE001
        font = None
    for i, (character, pose, label) in enumerate(CANDIDATES):
        img = headshot(character, pose)
        r, c = divmod(i, cols)
        x, y = 8 + c * cell_w, 8 + r * cell_h
        if img is None:
            d.text((x + 8, y + 40), f"{label}\n(缺)", fill=(180, 0, 0, 255), font=font)
            continue
        sheet.paste(img, (x + 8, y + 4), img)
        d.rectangle([x + 6, y + 2, x + 10 + SIZE, y + 6 + SIZE], outline=(74, 51, 38, 255), width=2)
        d.text((x + 8, y + SIZE + 10), f"{i + 1}. {label}", fill=(74, 51, 38, 255), font=font)
    sheet.save(OUT)
    print("saved", OUT, sheet.size)


if __name__ == "__main__":
    main()
