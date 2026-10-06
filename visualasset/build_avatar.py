"""自研像素头像：16×16 小女孩（表头「等级经验栏」用）。
与 visualasset/build_icons.py 同一套路：脚本化像素绘制 → 可复现、可改色改形。
输出：apps/web/public/avatar-girl-16.png（原生 16×16）与 avatar-girl.png（×8 = 128×128，NEAREST）。
许可：本项目自研（脚本生成），无第三方素材依赖。
"""
from PIL import Image

PALETTE = {
    ".": None,                    # 透明
    "H": (92, 60, 34, 255),       # 头发
    "h": (124, 84, 49, 255),      # 头发高光
    "S": (247, 203, 161, 255),    # 皮肤
    "s": (216, 158, 117, 255),    # 皮肤暗部
    "B": (208, 71, 63, 255),      # 蝴蝶结
    "E": (44, 32, 21, 255),       # 眼睛
    "W": (247, 237, 217, 255),    # 白（领口）
    "O": (74, 111, 165, 255),     # 背带裤
    "o": (55, 82, 124, 255),      # 背带裤暗部
    "M": (181, 84, 74, 255),      # 嘴
}

# 16×16（每行必须 16 字符）
SPRITE = [
    "....HHHHHHHH....",
    "..HHHHHHHHHHHH..",
    ".HHHHHHHHHHHHBB.",
    ".HHhHHHHHHHHHBB.",
    ".HHHHHHHHHHHHHH.",
    ".HHSSSSSSSSSSHH.",
    ".HSSSSSSSSSSSSH.",
    ".SSEESSSSSSEESS.",
    ".SSEESSSSSSEESS.",
    ".SSSSSSSSSSSSSS.",
    ".SSSSSSMMSSSSSS.",
    "..SSSSSSSSSSSS..",
    "...sSSSSSSSSs...",
    "..WWWWWWWWWWWW..",
    ".OOOOOOOOOOOOOO.",
    ".ooOOOOOOOOOOoo.",
]


def build() -> Image.Image:
    assert len(SPRITE) == 16, f"行数应为 16，实际 {len(SPRITE)}"
    for i, row in enumerate(SPRITE):
        assert len(row) == 16, f"第 {i} 行应为 16 字符，实际 {len(row)}: {row!r}"
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    px = img.load()
    for y, row in enumerate(SPRITE):
        for x, ch in enumerate(row):
            color = PALETTE[ch]
            if color:
                px[x, y] = color
    return img


if __name__ == "__main__":
    import os

    native = build()
    pub = r"C:\Users\48489\Desktop\time\apps\web\public"
    os.makedirs(pub, exist_ok=True)
    native.save(os.path.join(pub, "avatar-girl-16.png"))

    big = native.resize((128, 128), Image.NEAREST)
    big.save(os.path.join(pub, "avatar-girl.png"))

    # 自检图：每格 8px + 硬描边，看是否存在错位/空洞
    preview = Image.new("RGBA", (16 * 8, 16 * 8), (40, 40, 60, 255))
    preview.paste(native.resize((128, 128), Image.NEAREST), (0, 0), native.resize((128, 128), Image.NEAREST))
    preview = preview.resize((512, 512), Image.NEAREST)
    preview.save(r"C:\Users\48489\Desktop\time\visualasset\_tmp_avatar_check.png")
    print("built: avatar-girl-16.png (16x16) / avatar-girl.png (128x128) / _tmp_avatar_check.png (preview)")
