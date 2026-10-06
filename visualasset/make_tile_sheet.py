"""为素材包生成带行列坐标的 tile 对照图，便于精确挑选图标。
用法：python make_tile_sheet.py <pack_dir> <out_png> [scale]
读取 <pack_dir>/Tilemap/tilemap_packed.png（按 16px 网格切片）。
"""
import sys
from PIL import Image, ImageDraw

TILE = 16


def main() -> None:
    pack = sys.argv[1]
    out = sys.argv[2]
    scale = int(sys.argv[3]) if len(sys.argv) > 3 else 5
    src = f"{pack}/Tilemap/tilemap_packed.png"
    im = Image.open(src).convert("RGBA")
    cols, rows = im.width // TILE, im.height // TILE
    cell = TILE * scale
    pad_top, pad_left = 18, 34
    sheet = Image.new("RGBA", (pad_left + cols * cell, pad_top + rows * cell), (45, 48, 70, 255))
    d = ImageDraw.Draw(sheet)
    for r in range(rows):
        for c in range(cols):
            t = im.crop((c * TILE, r * TILE, (c + 1) * TILE, (r + 1) * TILE))
            t = t.resize((cell, cell), Image.NEAREST)
            x, y = pad_left + c * cell, pad_top + r * cell
            sheet.paste(t, (x, y), t)
            # 索引 = 行优先（Kenney tilesheet 惯例）
            d.text((x + 2, y + 2), str(r * cols + c), fill=(255, 255, 0, 255))
    for c in range(cols + 1):
        d.line([(pad_left + c * cell, 0), (pad_left + c * cell, sheet.height)], fill=(255, 0, 255, 120))
    for r in range(rows + 1):
        d.line([(0, pad_top + r * cell), (sheet.width, pad_top + r * cell)], fill=(255, 0, 255, 120))
    for c in range(cols):
        d.text((pad_left + c * cell + 2, 3), f"c{c}", fill=(0, 255, 255, 255))
    for r in range(rows):
        d.text((3, pad_top + r * cell + 2), f"r{r}", fill=(0, 255, 255, 255))
    sheet.save(out)
    print(f"{src}: {cols}x{rows} tiles -> {out} {sheet.size}")


if __name__ == "__main__":
    main()
