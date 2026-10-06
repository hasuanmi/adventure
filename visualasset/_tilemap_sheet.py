"""把 Kenney tilemap_packed.png 渲染成带 (行,列) 标注的对照图，便于挑选场景 tile（只读用途）。"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = r"C:\Users\48489\Desktop\time"
PACKS = [
    ("farm", os.path.join(ROOT, "visualasset", "kenney_tiny-farm", "Tilemap", "tilemap_packed.png")),
    ("factory", os.path.join(ROOT, "visualasset", "kenney_tiny-factory", "Tilemap", "tilemap_packed.png")),
]
OUT = os.path.join(ROOT, "visualasset", "_tilemap_sheet.png")
TILE = 16
SCALE = 3
LABEL = 14


def sheet(name: str, path: str) -> tuple[Image.Image, int, int]:
    im = Image.open(path).convert("RGBA")
    cols, rows = im.width // TILE, im.height // TILE
    cell = TILE * SCALE
    canvas = Image.new("RGBA", (cols * cell + 60, rows * cell + 30), (242, 229, 201, 255))
    d = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", 11)
    except Exception:  # noqa: BLE001
        font = None
    for r in range(rows):
        d.text((2, 24 + r * cell), str(r), fill=(74, 51, 38, 255), font=font)
        for c in range(cols):
            tile = im.crop((c * TILE, r * TILE, (c + 1) * TILE, (r + 1) * TILE)).resize(
                (cell, cell), Image.NEAREST
            )
            canvas.paste(tile, (60 + c * cell, 24 + r * cell), tile)
    for c in range(cols):
        d.text((60 + c * cell + cell // 2 - 6, 6), str(c), fill=(74, 51, 38, 255), font=font)
    d.text((60, 24 + rows * cell + 4), f"{name}: {cols} cols x {rows} rows", fill=(74, 51, 38, 255), font=font)
    return canvas, cols, rows


def main() -> None:
    images = []
    for name, path in PACKS:
        if os.path.exists(path):
            canvas, cols, rows = sheet(name, path)
            images.append(canvas)
            print(name, cols, "x", rows)
    if not images:
        raise SystemExit("没找到 tilemap")
    width = max(i.width for i in images)
    height = sum(i.height for i in images) + 10 * (len(images) - 1)
    out = Image.new("RGBA", (width, height), (242, 229, 201, 255))
    y = 0
    for i in images:
        out.paste(i, (0, y))
        y += i.height + 10
    out.save(OUT)
    print("saved", OUT, out.size)


if __name__ == "__main__":
    main()
