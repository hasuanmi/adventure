"""构建「任务图标库」：从 visualasset 的像素素材里精选可用图标，统一为 32×32，输出到 Web public。

来源与许可：
- visualasset/quest_icons/native32/*.png（本项目自研，32×32）
- visualasset/kenney_tiny-farm/Tiles/tile_XXXX.png（Kenney，CC0，16×16 → ×2 NEAREST 到 32×32）
- visualasset/kenney_tiny-factory/Tiles/tile_XXXX.png（Kenney，CC0，16×16 → ×2 NEAREST 到 32×32）

产物：
- apps/web/public/icons/<key>.png（32×32）
- apps/web/src/lib/task-icons.ts（key/label 清单，前端选择器与渲染共用；本脚本生成，勿手改）
- visualasset/_lib_preview.png（带标签的库预览，供人工复核）
"""
import json
import os
from PIL import Image, ImageDraw

ROOT = r"C:\Users\48489\Desktop\time"
VA = os.path.join(ROOT, "visualasset")
OUT_ICONS = os.path.join(ROOT, "apps", "web", "public", "icons")
OUT_TS = os.path.join(ROOT, "apps", "web", "src", "lib", "task-icons.ts")
OUT_KEYS_TS = os.path.join(ROOT, "packages", "shared-types", "src", "task-icon.ts")
PREVIEW = os.path.join(VA, "_lib_preview.png")

# (key, 中文标签, 来源, 取值)
#   来源 quest  ：native32 文件名
#   来源 farm/factory：(行, 列) —— **必须按 tilemap_packed.png 的行列坐标**！
#   （Kenney 的 Tiles/tile_XXXX.png 编号与打包图行列顺序不一致，按编号取会错位——本轮踩过）
LIBRARY = [
    # —— 任务类型（quest_icons，1:1 对应奖励档分类 + 冒险）——
    ("daily", "日常学习", "quest", "01_daily"),
    ("adventure", "长期挑战", "quest", "02_adventure"),
    ("world", "世界探索", "quest", "03_world"),
    ("nature", "自然风物", "quest", "04_nature"),
    ("bounty", "特别任务", "quest", "05_bounty"),
    # —— 植物 / 自然（农场 r/c）——
    ("plant", "植物", "farm", (0, 5)),      # 胡萝卜苗
    ("tree", "树木", "farm", (0, 3)),       # 杉树
    ("flower", "花朵", "farm", (6, 11)),    # 向日葵
    ("mushroom", "蘑菇", "farm", (6, 10)),
    ("wheat", "麦子", "farm", (5, 8)),      # 玉米/麦穗
    ("tomato", "番茄", "farm", (3, 8)),
    ("cabbage", "蔬菜", "farm", (4, 5)),
    ("berry", "浆果", "farm", (6, 7)),      # 结红果的灌木
    ("stone", "石头", "farm", (6, 6)),
    # —— 用品 / 工具（农场 r/c）——
    ("hammer", "锤子", "farm", (7, 2)),
    ("axe", "斧头", "farm", (7, 3)),
    ("chest", "宝箱", "farm", (8, 1)),
    ("barrel", "木桶", "farm", (8, 0)),
    ("bag", "袋子", "farm", (6, 2)),      # 粮袋（原误标"桌子"）
    ("table", "桌子", "farm", (6, 3)),    # 带腿的桌/凳
    ("bed", "床", "farm", (9, 3)),
    # —— 动物 / 生活（农场 r/c）——
    ("sheep", "小羊", "farm", (10, 0)),
    ("cow", "奶牛", "farm", (10, 1)),
    ("chicken", "小鸡", "farm", (10, 2)),
    ("mailbox", "信箱", "farm", (10, 3)),
    ("well", "水井", "farm", (10, 4)),
    ("bread", "面包", "farm", (10, 5)),
    # —— 机械 / 动手（工厂 r/c）——
    ("gear", "机械", "factory", (9, 0)),      # 大齿轮
    ("robot", "机器人", "factory", (9, 1)),
    ("crate", "箱子", "factory", (7, 1)),     # 木箱
    ("screen", "屏幕", "factory", (9, 4)),    # 蓝色面板
    ("spring", "弹簧", "factory", (8, 2)),
    ("machine", "设备", "factory", (2, 6)),   # 带屏幕的机器
]

_TILE = 16


def load_icon(source: str, ref) -> Image.Image:
    if source == "quest":
        p = os.path.join(VA, "quest_icons", "native32", f"{ref}.png")
        return Image.open(p).convert("RGBA")
    pack = "kenney_tiny-farm" if source == "farm" else "kenney_tiny-factory"
    sheet_path = os.path.join(VA, pack, "Tilemap", "tilemap_packed.png")
    row, col = ref
    sheet = Image.open(sheet_path).convert("RGBA")
    tile = sheet.crop((col * _TILE, row * _TILE, (col + 1) * _TILE, (row + 1) * _TILE))
    return tile.resize((32, 32), Image.NEAREST)


def main() -> None:
    os.makedirs(OUT_ICONS, exist_ok=True)
    entries = []
    for key, label, source, ref in LIBRARY:
        im = load_icon(source, ref)
        if im.size != (32, 32):
            raise ValueError(f"{key} 非 32x32: {im.size}")
        im.save(os.path.join(OUT_ICONS, f"{key}.png"))
        entries.append({"key": key, "label": label, "source": source, "ref": str(ref)})

    # 前端清单（生成物，勿手改）
    lines = [
        "// 任务图标库（**由 visualasset/build_icon_library.py 生成，请勿手改**）",
        "// 素材：quest_icons（本项目自研）+ Kenney Tiny Farm/Tiny Factory（CC0），统一 32×32。",
        "// 登记见 docs/opensource-mapping.md §二点十一。",
        "",
        "export interface TaskIconOption {",
        "  key: string;",
        "  label: string;",
        "}",
        "",
        "export const TASK_ICONS: TaskIconOption[] = [",
    ]
    for e in entries:
        lines.append(f"  {{ key: '{e['key']}', label: '{e['label']}' }},")
    lines += [
        "];",
        "",
        "export const TASK_ICON_KEYS = TASK_ICONS.map((i) => i.key);",
        "",
        "/** 未分类/未选择时的中性图标（避免所有任务都长成同一个默认图标） */",
        "export const TASK_ICON_FALLBACK = 'crate';",
        "",
        "export function taskIconUrl(key?: string | null): string {",
        "  const k = key && TASK_ICON_KEYS.includes(key) ? key : TASK_ICON_FALLBACK;",
        "  return `/icons/${k}.png`;",
        "}",
        "",
        "export function taskIconLabel(key?: string | null): string | undefined {",
        "  return TASK_ICONS.find((i) => i.key === key)?.label;",
        "}",
        "",
    ]
    with open(OUT_TS, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines))

    # 契约侧白名单（API DTO 校验用；与 UI 清单同源生成，避免两处漂移）
    keys_ts = [
        "// 任务图标 key 白名单（**由 visualasset/build_icon_library.py 生成，请勿手改**）",
        "// 契约层只放 key（稳定的枚举语义）；中文标签等 UI 文案在 apps/web 的 task-icons.ts。",
        "",
        "export const TASK_ICON_KEYS = [",
    ]
    keys_ts += [f"  '{e['key']}'," for e in entries]
    keys_ts += ["] as const;", "", "export type TaskIconKey = (typeof TASK_ICON_KEYS)[number];", ""]
    with open(OUT_KEYS_TS, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(keys_ts))

    # 预览图（带中文标签，供人工复核；PIL 默认字体无中文，优先用系统雅黑）
    cols = 8
    cell, pad = 64, 22
    rows = (len(entries) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * cell + 8, rows * (cell + pad) + 8), (45, 48, 70, 255))
    d = ImageDraw.Draw(sheet)
    try:
        from PIL import ImageFont

        font = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", 12)
    except Exception:  # noqa: BLE001
        font = None
    for i, e in enumerate(entries):
        r, c = divmod(i, cols)
        x, y = 8 + c * cell, 8 + r * (cell + pad)
        icon = Image.open(os.path.join(OUT_ICONS, f"{e['key']}.png")).resize((56, 56), Image.NEAREST)
        sheet.paste(icon, (x + 4, y), icon)
        d.text((x, y + 58), f"{e['key']}={e['label']}", fill=(255, 255, 255, 255), font=font)
    sheet.save(PREVIEW)

    with open(os.path.join(VA, "icon-library.json"), "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)
    print(f"生成 {len(entries)} 枚图标 -> {OUT_ICONS}")
    print(f"清单 -> {OUT_TS}")
    print(f"预览 -> {PREVIEW} {sheet.size}")


if __name__ == "__main__":
    main()
