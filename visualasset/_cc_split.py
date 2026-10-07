from PIL import Image
from collections import deque
SRC = r"C:\Users\48489\.wanwuyouxu\attachments\v1\objects\d2\d2866243e4900d6e62ae0645d4992494fa26b49fabd8ace17760477145999d35"
im = Image.open(SRC).convert("RGBA")
w, h = im.size
alpha = im.split()[3].load()
seen = bytearray(w * h)
boxes = []
for y0 in range(h):
    for x0 in range(w):
        i = y0 * w + x0
        if seen[i] or alpha[x0, y0] <= 40:
            continue
        q = deque([(x0, y0)]); seen[i] = 1
        minx = maxx = x0; miny = maxy = y0; cnt = 0
        while q:
            x, y = q.popleft(); cnt += 1
            if x < minx: minx = x
            if x > maxx: maxx = x
            if y < miny: miny = y
            if y > maxy: maxy = y
            for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                nx, ny = x+dx, y+dy
                if 0 <= nx < w and 0 <= ny < h:
                    j = ny * w + nx
                    if not seen[j] and alpha[nx, ny] > 40:
                        seen[j] = 1; q.append((nx, ny))
        if cnt > 2000:
            boxes.append((minx, miny, maxx, maxy, cnt))
boxes.sort(key=lambda b: -b[4])
print("共", len(boxes), "个大于 2000 像素的连通块（按面积）:")
for b in boxes[:5]:
    print("   bbox=%s 面积=%d  中心=(%.2f, %.2f)" % (b[:4], b[4], (b[0]+b[2])/2/w, (b[1]+b[3])/2/h))