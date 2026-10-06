# -*- coding: utf-8 -*-
"""
"成长冒险" 儿童 RPG — 五种任务类型图标 (pixel art, 32x32 native)

所有图形都在 32x32 的原生像素网格上绘制, 再用 NEAREST 整数倍放大,
因此边缘永远是硬像素, 不会出现模糊 / 抗锯齿 / 3D 写实感。
五个图标共用同一套调色板 + 同一套 1px 深藏青描边引擎。
"""

import math
import os

import numpy as np
from PIL import Image, ImageDraw

S = 32          # 原生图标栅格
SCALE = 8       # 导出倍数 -> 256x256
CELL = S * SCALE
GAP = 64        # 图标间距
MARGIN = 64     # 外留白

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "quest_icons")

# ---------------------------------------------------------------- 统一调色板
NAVY   = (36, 38, 62, 255)      # 统一 1px 描边
NAVY2  = (70, 74, 110, 255)
CREAM  = (255, 248, 231, 255)   # 纸 / 高光
PAPER  = (246, 222, 175, 255)
PAPER2 = (224, 186, 128, 255)
PAPER3 = (186, 140, 90, 255)
GOLD1  = (255, 231, 138, 255)
GOLD2  = (247, 183, 54, 255)
GOLD3  = (196, 130, 22, 255)
RED1   = (240, 124, 102, 255)
RED2   = (203, 74, 68, 255)
RED3   = (144, 45, 50, 255)
BROWN1 = (205, 148, 98, 255)
BROWN2 = (160, 104, 64, 255)
BROWN3 = (108, 65, 42, 255)
GREEN1 = (158, 221, 118, 255)
GREEN2 = (98, 175, 88, 255)
GREEN3 = (52, 118, 70, 255)
BLUE1  = (128, 201, 244, 255)
BLUE2  = (72, 146, 214, 255)
BLUE3  = (40, 88, 148, 255)
PINK1  = (255, 233, 235, 255)
PINK2  = (243, 146, 162, 255)
PINK3  = (198, 84, 108, 255)

# ---------------------------------------------------------------- 基础工具
YY, XX = np.mgrid[0:S, 0:S]
XXf = XX.astype(np.float64)
YYf = YY.astype(np.float64)


def new():
    return Image.new("RGBA", (S, S), (0, 0, 0, 0))


def shift(m, dx, dy):
    out = np.zeros_like(m)
    ys, xs = np.nonzero(m)
    ny, nx = ys + dy, xs + dx
    ok = (ny >= 0) & (ny < S) & (nx >= 0) & (nx < S)
    out[ny[ok], nx[ok]] = True
    return out


def dilate(m, diag=True):
    out = m.copy()
    offs = [(-1, 0), (1, 0), (0, -1), (0, 1)]
    if diag:
        offs += [(-1, -1), (-1, 1), (1, -1), (1, 1)]
    for dx, dy in offs:
        out |= shift(m, dx, dy)
    return out


def mask_rect(box):
    x0, y0, x1, y1 = box
    return (XX >= x0) & (XX <= x1) & (YY >= y0) & (YY <= y1)


def mask_circle(cx, cy, r):
    return (XXf - cx) ** 2 + (YYf - cy) ** 2 <= (r + 0.05) ** 2


def mask_rrect(box, r=3):
    x0, y0, x1, y1 = box
    m = mask_rect(box)
    for ccx, ccy, sx, sy in ((x0 + r, y0 + r, -1, -1), (x1 - r, y0 + r, 1, -1),
                             (x0 + r, y1 - r, -1, 1), (x1 - r, y1 - r, 1, 1)):
        dist = np.sqrt((XXf - ccx) ** 2 + (YYf - ccy) ** 2)
        corner = ((XXf - ccx) * sx > 0.5) & ((YYf - ccy) * sy > 0.5)
        m &= ~(corner & (dist > r))
    return m


def mask_ell(box):
    x0, y0, x1, y1 = box
    cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    rx, ry = (x1 - x0) / 2.0 + 0.5, (y1 - y0) / 2.0 + 0.5
    return ((XXf - cx) / rx) ** 2 + ((YYf - cy) / ry) ** 2 <= 1.0


def mask_poly(pts):
    m = Image.new("L", (S, S), 0)
    ImageDraw.Draw(m).polygon([(float(x), float(y)) for x, y in pts], fill=255)
    return np.array(m) > 127


def star_pts(cx, cy, ro, ri, n=5, rot=-90.0):
    pts = []
    for i in range(2 * n):
        r = ro if i % 2 == 0 else ri
        a = math.radians(rot + i * 180.0 / n)
        pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
    return pts


def band(p0, p1, w):
    """从 p0 到 p1、宽度 w 的斜矩形带 (斜放的卷轴 / 叶脉)。"""
    (x0, y0), (x1, y1) = p0, p1
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy)
    ux, uy = dx / L, dy / L
    px, py = -uy * w / 2.0, ux * w / 2.0
    return [(x0 + px, y0 + py), (x1 + px, y1 + py),
            (x1 - px, y1 - py), (x0 - px, y0 - py)]


def along(p0, p1, t):
    return (p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t)


class Ctx:
    def __init__(self, img):
        self.img = img
        self.d = ImageDraw.Draw(img)

    def raw_rect(self, box, color):
        self.d.rectangle(box, fill=color)

    def fill(self, m, color):
        if not m.any():
            return
        self.img.paste(color, (0, 0),
                       Image.fromarray(np.where(m, 255, 0).astype("uint8")))

    def fill_outlined(self, m, color, oc=NAVY):
        self.fill(dilate(m), oc)
        self.fill(m, color)

    def edge(self, m, color, where="tl", n=1):
        """在 mask 的左上 / 右下侧填充 n 像素宽的受光或压暗带。"""
        cur = m.copy()
        for _ in range(n):
            cur = cur & (shift(cur, 1, 1) if where == "tl" else shift(cur, -1, -1))
        self.fill(m & ~cur, color)

    def bottom(self, m, color, n=1):
        cur = m.copy()
        for _ in range(n):
            self.fill(cur & ~shift(cur, 0, -1), color)
            cur &= shift(cur, 0, -1)

    def top(self, m, color, n=1):
        cur = m.copy()
        for _ in range(n):
            self.fill(cur & ~shift(cur, 0, 1), color)
            cur &= shift(cur, 0, 1)


# ================================================================ 1. 日常任务
def icon_daily():
    """打开的书本 + 小星星 — 每天要完成的学习与日常。"""
    art = new()
    c = Ctx(art)

    # 红色封面 (比书页外扩 2px, 形成清楚的包边)
    cover = mask_poly([(15, 12.5), (3, 14.8), (3, 28), (15, 25.5)]) | \
            mask_poly([(17, 12.5), (29, 14.8), (29, 28), (17, 25.5)])
    c.fill(cover, RED2)
    c.edge(cover, RED1, "tl", 1)
    c.edge(cover, RED3, "br", 2)

    # 书页
    page_l = mask_poly([(14, 14), (5, 16), (5, 26), (14, 24)])
    page_r = mask_poly([(18, 14), (27, 16), (27, 26), (18, 24)])
    c.fill(page_l | page_r, CREAM)
    c.bottom(page_l, PAPER, 2)
    c.bottom(page_r, PAPER, 2)

    # 书脊内缝
    c.raw_rect((15, 13, 16, 25), NAVY2)

    # 页面横线 (代表 "每天要写的功课", 是线条不是文字)
    for y in (18, 21):
        c.raw_rect((7, y, 12, y), PAPER2)
        c.raw_rect((19, y, 24, y), PAPER2)

    # 小星星 (与书本留出干净的 1px 间隙, 描边不会粘连)
    st = mask_poly(star_pts(16, 6.4, 4.1, 1.95))
    c.fill_outlined(st, GOLD2)
    c.edge(st, GOLD1, "tl", 1)
    c.edge(st, GOLD3, "br", 1)
    return art


# ================================================================ 2. 冒险任务
def icon_adventure():
    """小背包 + 冒险地图卷轴 + 指南针 — 长期成长与旅程。"""
    art = new()
    c = Ctx(art)

    # --- 立在包口的地图卷轴 (三色圆柱明暗, 左侧受光)
    tube = mask_rrect((2, 3, 7, 15), 2)
    c.fill_outlined(tube, PAPER2)
    c.fill(mask_rect((2, 3, 7, 15)) & tube & mask_rect((2, 0, 3, 31)), CREAM)
    c.fill(mask_rect((2, 3, 7, 15)) & tube & mask_rect((3, 0, 4, 31)), PAPER)
    c.fill(mask_rect((6, 3, 7, 15)) & tube, PAPER2)
    c.fill(mask_rect((7, 3, 7, 15)) & tube, PAPER3)
    # 红色绑带
    c.fill(mask_rect((2, 9, 7, 10)) & tube, RED2)
    c.fill(mask_rect((2, 9, 2, 10)) & tube, RED1)

    # --- 提手 (拱形)
    arch = mask_ell((11, 6, 21, 16)) & ~mask_ell((13, 9, 19, 16))
    c.fill_outlined(arch, BROWN2)
    c.edge(arch, (188, 128, 82, 255), "tl", 1)

    # --- 背包主体
    body = mask_rrect((6, 12, 26, 28), 3)
    c.fill_outlined(body, BROWN1)
    c.edge(body, (228, 174, 120, 255), "tl", 1)
    c.edge(body, BROWN2, "br", 2)

    # --- 顶盖
    flap = mask_rect((7, 12, 25, 18)) & body
    c.fill(dilate(flap) & body, NAVY)
    c.fill(flap, RED2)
    c.edge(flap, RED1, "tl", 1)
    c.bottom(flap, RED3, 2)

    # --- 前袋缝线
    c.fill(mask_rect((8, 20, 24, 20)) & body, BROWN2)

    # --- 指南针徽章
    face = mask_circle(16.0, 23.2, 4.2)
    c.fill_outlined(face, GOLD2)
    c.edge(face, GOLD1, "tl", 1)
    c.edge(face, GOLD3, "br", 1)
    inner = mask_circle(16.0, 23.2, 3.2)
    c.fill(inner, CREAM)
    c.fill(mask_poly(band((16.0, 23.2), (17.6, 20.4), 1.4)) & inner, RED2)
    c.fill(mask_poly(band((16.0, 23.2), (14.2, 25.8), 1.4)) & inner, NAVY2)
    c.fill(mask_circle(16.0, 23.2, 0.7), GOLD1)
    return art


# ================================================================ 3. 世界任务
def icon_world():
    """卷轴 + 小型世界地图 + 地图标记 — 阶段性重要目标与世界事件。"""
    art = new()
    c = Ctx(art)

    # 羊皮纸
    sheet = mask_rect((6, 6, 25, 26))
    c.fill_outlined(sheet, CREAM)

    # 左右卷筒
    for x0, x1 in ((3, 8), (23, 28)):
        roll = mask_rrect((x0, 4, x1, 28), 2)
        c.fill_outlined(roll, PAPER2)
        c.top(roll, PAPER, 2)
        c.bottom(roll, PAPER3, 3)

    # 世界地图
    globe = mask_circle(14.0, 14.5, 6.0)
    c.fill(dilate(globe), NAVY)
    c.fill(globe, BLUE2)
    c.edge(globe, BLUE1, "tl", 1)
    c.edge(globe, BLUE3, "br", 1)

    land = (mask_poly([(15.8, 10.0), (19.2, 11.5), (18.8, 14.2), (16.2, 15.2), (14.6, 12.6)]) |
            mask_poly([(9.2, 11.8), (12.0, 10.0), (13.8, 12.2), (12.8, 16.2),
                       (10.2, 17.2), (8.8, 14.6)]) |
            mask_circle(15.5, 18.0, 1.3) |
            mask_circle(10.4, 18.6, 1.0)) & globe
    c.fill(land, GREEN2)
    c.edge(land, GREEN1, "tl", 1)

    # 地图标记 pin
    pin = mask_poly([(18.7, 20.5), (22.3, 20.5), (20.5, 25.3)]) | mask_circle(20.5, 18.5, 2.6)
    c.fill(dilate(pin), NAVY)
    c.fill(pin, RED2)
    c.edge(pin, RED1, "tl", 1)
    c.fill(mask_circle(20.5, 18.5, 1.0), CREAM)
    return art


# ================================================================ 4. 风物任务
def icon_nature():
    """小花 + 叶片 + 草丛 — 户外活动、生活体验与观察自然。"""
    art = new()
    c = Ctx(art)

    # 草丛
    grass = (mask_poly([(10.5, 28), (12.2, 23.5), (13.8, 28)]) |
             mask_poly([(15.4, 28), (17.0, 22.2), (18.6, 28)]) |
             mask_poly([(19.2, 28), (20.4, 24.6), (21.8, 28)]))
    c.fill_outlined(grass, GREEN2)
    c.edge(grass, GREEN1, "tl", 1)

    # 叶片
    leaf_l = mask_poly([(14.5, 19.8), (11.5, 17.8), (8, 16.8), (4, 17.2), (8, 20.4), (11.5, 21.6)])
    leaf_r = mask_poly([(15.5, 21.8), (19, 19.8), (23, 19.2), (27.5, 21.0), (23, 23.4), (19, 24.2)])
    for leaf in (leaf_l, leaf_r):
        c.fill_outlined(leaf, GREEN2)
        c.edge(leaf, GREEN1, "tl", 1)
        c.edge(leaf, GREEN3, "br", 1)
    c.fill(mask_poly(band((13.5, 19.4), (5.0, 17.3), 1.2)) & leaf_l, GREEN3)
    c.fill(mask_poly(band((16.5, 21.4), (26.5, 20.2), 1.2)) & leaf_r, GREEN3)

    # 花茎
    stem = mask_rect((15, 14, 16, 26))
    c.fill_outlined(stem, GREEN2)
    c.fill(mask_rect((15, 14, 15, 26)), GREEN1)
    c.fill(mask_rect((16, 14, 16, 26)), GREEN3)

    # 花瓣 (5 片各自描边, 小尺寸下花瓣分界清晰)
    for i in range(5):
        a = math.radians(-90 + i * 72)
        petal = mask_circle(16 + math.cos(a) * 4.3, 10.2 + math.sin(a) * 4.3, 3.0)
        c.fill_outlined(petal, PINK2)
        c.edge(petal, PINK1, "tl", 1)
        c.edge(petal, PINK3, "br", 1)

    # 花心
    core = mask_circle(16.0, 10.2, 2.6)
    c.fill_outlined(core, GOLD2)
    c.edge(core, GOLD1, "tl", 1)
    c.edge(core, GOLD3, "br", 1)
    return art


# ================================================================ 5. 悬赏任务
def icon_bounty():
    """悬赏卷轴 + 金色星标 — 临时发布、限时完成。"""
    art = new()
    c = Ctx(art)

    # 竖向卷轴纸面
    sheet = mask_rect((7, 7, 24, 25))
    c.fill_outlined(sheet, CREAM)

    # 上下卷筒
    for y0, y1 in ((4, 8), (24, 28)):
        roll = mask_rrect((5, y0, 26, y1), 2)
        c.fill_outlined(roll, PAPER2)
        c.top(roll, PAPER, 2)
        c.bottom(roll, PAPER3, 2)

    # 金色星标
    st = mask_poly(star_pts(15.5, 16.2, 6.4, 2.9))
    c.fill(dilate(st), NAVY)
    c.fill(st, GOLD2)
    c.edge(st, GOLD1, "tl", 1)
    c.edge(st, GOLD3, "br", 1)
    st2 = mask_poly(star_pts(15.0, 15.6, 3.8, 1.7))
    c.fill(st2 & ~shift(st, 1, 1), GOLD1)
    return art


# ================================================================ 组装 / 导出
ICONS = [
    ("01_daily", icon_daily),
    ("02_adventure", icon_adventure),
    ("03_world", icon_world),
    ("04_nature", icon_nature),
    ("05_bounty", icon_bounty),
]


def outlined(native):
    """把整张 32x32 的 alpha 轮廓外扩 1px 描成海军蓝 — 五个图标描边绝对一致。"""
    alpha = np.array(native)[:, :, 3] > 0
    ring = dilate(alpha) & ~alpha
    base = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    base.paste(NAVY, (0, 0), Image.fromarray(np.where(ring, 255, 0).astype("uint8")))
    base.alpha_composite(native)
    return base


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(os.path.join(OUT_DIR, "native32"), exist_ok=True)

    natives = []
    for name, fn in ICONS:
        art = outlined(fn())
        natives.append(art)
        art.save(os.path.join(OUT_DIR, "native32", name + ".png"))
        art.resize((CELL, CELL), Image.NEAREST).save(os.path.join(OUT_DIR, name + ".png"))

    W = MARGIN * 2 + CELL * 5 + GAP * 4
    H = MARGIN * 2 + CELL
    strip = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for i, art in enumerate(natives):
        strip.alpha_composite(art.resize((CELL, CELL), Image.NEAREST),
                              (MARGIN + i * (CELL + GAP), MARGIN))
    strip.save(os.path.join(OUT_DIR, "quest_icons_1x5.png"))

    # 自检预览: 深底 / 浅底 (验证透明背景 + 描边可读性)
    prev = Image.new("RGBA", (W, H * 2 + 8), (0, 0, 0, 0))
    dark = Image.new("RGBA", (W, H), (44, 48, 72, 255))
    light = Image.new("RGBA", (W, H), (248, 246, 240, 255))
    dark.alpha_composite(strip)
    light.alpha_composite(strip)
    prev.alpha_composite(dark, (0, 0))
    prev.alpha_composite(light, (0, H + 8))
    prev.save(os.path.join(OUT_DIR, "preview_light_dark.png"))

    px = np.array(strip)
    cols = {tuple(v) for v in px.reshape(-1, 4).tolist() if v[3] > 0}
    print("icons:", len(natives), "| strip:", strip.size, "| opaque colors:", len(cols))
    for name, art in zip([n for n, _ in ICONS], natives):
        a = np.array(art)[:, :, 3] > 0
        ys, xs = np.nonzero(a)
        print("  %-12s bbox x:%d-%d y:%d-%d" % (name, xs.min(), xs.max(), ys.min(), ys.max()))


if __name__ == "__main__":
    main()
