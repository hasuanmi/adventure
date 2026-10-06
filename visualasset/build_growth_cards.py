"""用**项目已有素材**拼「今日成长卡」场景图（不引入新风格）。

素材（全部 CC0，已登记 docs/opensource-mapping.md）：
  · visualasset/kenney_tiny-farm/Tilemap/tilemap_packed.png —— 16×16 tile，按 (行,列) 取
  · visualasset/kenney_toon-characters/Female adventurer/PNG/Poses/*.png —— 98×128 角色
配色：沿用项目主题（米色/棕/金），天与地是主题色平带 → 与参考图"平带天空 + 像素前景"同构。

输出：apps/web/public/cards/card-01..06.png（320×180 → ×2 NEAREST = 640×360）
"""
import glob
import os
from PIL import Image

ROOT = r"C:\Users\48489\Desktop\time"
FARM = os.path.join(ROOT, "visualasset", "kenney_tiny-farm", "Tilemap", "tilemap_packed.png")
TOON_DIR = os.path.join(ROOT, "visualasset", "kenney_toon-characters", "Female adventurer", "PNG", "Poses")
OUT_DIR = os.path.join(ROOT, "apps", "web", "public", "cards")
CHECK = os.path.join(ROOT, "visualasset", "_cards_check.png")

TILE = 16
W, H = 320, 180
SCALE = 2

# —— 主题色（与 index.css 一致；天/地平带用） ——
SKY_TOP = (242, 229, 201)      # panelLight 米色
SKY_MID = (232, 213, 174)      # brandBg
HILL = (122, 92, 56)           # inkSoft 暖棕（远山）
GROUND = (122, 158, 74)        # 草地绿（取自 farm tile 实测）
GROUND_DARK = (86, 120, 56)

# —— farm tilemap 的 (行, 列) 映射（与 build_icon_library.py 同一坐标口径） ——
# 纯草地/纯土块由脚本实测挑出（绿占比 224/256、棕占比 256/256），避免带花纹的杂色 tile
T_GRASS = [(8, 11), (9, 11), (8, 9), (9, 9)]
T_DIRT = (8, 7)
T_TREE = (0, 3)                # 小杉树
T_CHEST = (8, 1)
T_BARREL = (8, 0)
T_FLOWER = (6, 11)
T_MUSHROOM = (6, 10)
T_BERRY = (6, 7)
T_TOMATO = (3, 8)
T_CABBAGE = (4, 5)
T_WELL = (10, 4)
T_MAILBOX = (10, 3)
T_SHEEP = (10, 0)
T_COW = (10, 1)
T_CHICKEN = (10, 2)
T_TREE_BIG = (6, 9)            # 大松树左上角（3 宽 × 4 高）

# 6 张卡：结构固定，只有"角色姿势 + 道具摆放"变；道具坐标一律给**贴地底边 y**
SCENES = [
    {"pose": "idle", "heroX": 40, "props": [("tree_big", 6, 146), ("chest", 236, 162), ("flower", 268, 170), ("sheep", 176, 164)]},
    {"pose": "cheer0", "heroX": 150, "props": [("tree_big", 214, 146), ("barrel", 26, 160), ("mushroom", 106, 170), ("chicken", 258, 164)]},
    {"pose": "talk", "heroX": 30, "props": [("tree", 132, 150), ("well", 250, 160), ("berry", 196, 168), ("cow", 84, 164)]},
    {"pose": "show", "heroX": 190, "props": [("tree_big", 20, 148), ("chest", 118, 160), ("cabbage", 244, 168), ("sheep", 156, 166)]},
    {"pose": "idle", "heroX": 120, "props": [("tree", 16, 152), ("tree", 282, 152), ("mailbox", 236, 160), ("chicken", 200, 166)]},
    {"pose": "cheer0", "heroX": 60, "props": [("tree_big", 196, 144), ("barrel", 130, 162), ("flower", 168, 170), ("cow", 254, 164)]},
]


def farm_tile(row: int, col: int, size: int = TILE) -> Image.Image:
    im = Image.open(FARM).convert("RGBA")
    return im.crop((col * TILE, row * TILE, col * TILE + size, row * TILE + size))


def scaled(img: Image.Image, factor: int) -> Image.Image:
    return img.resize((img.width * factor, img.height * factor), Image.NEAREST)


def big_tree() -> Image.Image:
    """大松树：3 宽 × 4 高（48×64）"""
    im = Image.open(FARM).convert("RGBA")
    r, c = T_TREE_BIG
    return im.crop((c * TILE, r * TILE, (c + 3) * TILE, (r + 4) * TILE))


def prop(name: str) -> tuple[Image.Image, int]:
    """返回 (精灵, 放大倍数)：放大倍数为 2 的常规道具、4 的树（当前景）。"""
    mapping = {
        "tree": T_TREE, "chest": T_CHEST, "barrel": T_BARREL, "flower": T_FLOWER,
        "mushroom": T_MUSHROOM, "berry": T_BERRY, "tomato": T_TOMATO, "cabbage": T_CABBAGE,
        "well": T_WELL, "mailbox": T_MAILBOX, "sheep": T_SHEEP, "cow": T_COW, "chicken": T_CHICKEN,
    }
    if name == "tree_big":
        return farm_tile(*T_TREE), 2  # farm 包内无大松树（实测：(6,9) 是田地块）→ 用 ×2 小杉树当前景树
    if name == "dirt":
        return farm_tile(*T_DIRT), 2
    return farm_tile(*mapping[name]), 2


def hero(pose: str) -> Image.Image:
    matches = sorted(glob.glob(os.path.join(TOON_DIR, f"*_{pose}.png")))
    if not matches:
        raise SystemExit(f"缺角色姿势：{pose}")
    return Image.open(matches[0]).convert("RGBA")


def render(scene: dict) -> Image.Image:
    canvas = Image.new("RGBA", (W, H), SKY_TOP + (255,))
    # 天空 → 远山 → 地面（主题色平带，与参考图"平带天空 + 像素前景"同构）
    for y in range(0, 96):
        t = y / 96
        canvas.paste(
            tuple(int(SKY_TOP[i] + (SKY_MID[i] - SKY_TOP[i]) * t) for i in range(3)) + (255,),
            (0, y, W, y + 1),
        )
    # 远山：暖棕平带 + 一层更浅的远山（营造纵深）
    for x in range(0, W, TILE):
        h = 96 - (20 if (x // TILE) % 3 == 0 else 12)
        canvas.paste(HILL + (255,), (x, h, x + TILE, 96))
    canvas.paste(tuple(min(255, HILL[i] + 28) for i in range(3)) + (255,), (0, 88, W, 96))
    # 地面：纯色平带（farm 的草地 tile 非无缝，平铺会出现竖向色带 → 实测后改用纯色 + 地平线）
    canvas.paste(GROUND + (255,), (0, 96, W, H))
    canvas.paste(GROUND_DARK + (255,), (0, 96, W, 99))

    for name, x, bottom in scene["props"]:
        sprite, factor = prop(name)
        sprite = scaled(sprite, factor)
        canvas.paste(sprite, (x, bottom - sprite.height), sprite)

    character = hero(scene["pose"])
    canvas.paste(character, (scene["heroX"], H - character.height - 6), character)
    return canvas


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    outs = []
    for i, scene in enumerate(SCENES, start=1):
        img = render(scene)
        big = img.resize((W * SCALE, H * SCALE), Image.NEAREST)
        path = os.path.join(OUT_DIR, f"card-{i:02d}.png")
        big.save(path)
        outs.append(big)
        print("saved", path, big.size)
    # 自检对照图
    cols, rows = 2, 3
    sheet = Image.new("RGBA", (cols * W * SCALE + 8 * (cols + 1), rows * H * SCALE + 8 * (rows + 1)), (242, 229, 201, 255))
    for idx, img in enumerate(outs):
        r, c = divmod(idx, cols)
        sheet.paste(img, (8 + c * (W * SCALE + 8), 8 + r * (H * SCALE + 8)))
    sheet = sheet.resize((sheet.width // 2, sheet.height // 2), Image.LANCZOS)
    sheet.save(CHECK)
    print("check ->", CHECK, sheet.size)


if __name__ == "__main__":
    main()
