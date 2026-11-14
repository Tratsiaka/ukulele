#!/usr/bin/env python3
"""Рисует иконки «Уке» в src/static/icons/: favicon.svg и PNG (32, 180, 192, 512, maskable 512, ярлыки 96).

Запуск: python3 tools/make-icons.py (нужен Pillow). Геометрия одна для SVG и PNG:
укулеле кремового цвета, наклонённая вправо, на тёплом градиенте «закат».
PNG рисуются с 4-кратным запасом и уменьшаются — так края гладкие без cairo/rsvg.
"""
import math
import pathlib

from PIL import Image, ImageChops, ImageDraw

OUT = pathlib.Path(__file__).resolve().parent.parent / "src" / "static" / "icons"
SS = 4  # суперсэмплинг

# Цвета (совпадают с токенами: коралл, янтарь, тёплый крем, дерево)
GRAD_A = (255, 168, 82)   # верх-лево, янтарь
GRAD_B = (226, 81, 63)    # низ-право, коралл
CREAM = (255, 245, 234)
WOOD = (110, 53, 32)
STRING = (217, 160, 127)
SUN = (255, 255, 255, 38)
TILT = 38  # градусов по часовой

# Укулеле в локальных координатах (вертикально, y вниз). Примитивы: circle, rrect, line.
UKE_SIMPLE = [
    ("circle", CREAM, (0, 64, 92)),            # нижняя дека
    ("circle", CREAM, (0, -52, 72)),           # верхняя дека
    ("rrect", CREAM, (-24, -262, 48, 56, 13)), # голова грифа
    ("rrect", WOOD, (-15, -214, 30, 152, 7)),  # гриф
    ("circle", WOOD, (0, -40, 27)),            # розетка (резонаторное отверстие)
    ("rrect", WOOD, (-34, 102, 68, 14, 7)),    # подставка
]
UKE_DETAIL = UKE_SIMPLE + [
    ("circle", CREAM, (-33, -248, 7)),         # колки
    ("circle", CREAM, (33, -248, 7)),
    ("circle", CREAM, (-33, -222, 7)),
    ("circle", CREAM, (33, -222, 7)),
] + [("line", (238, 200, 170), (-15, y, 15, y, 2.4)) for y in (-186, -160, -137, -116, -97)] + [
    ("line", STRING, (x, -256, x, 108, 2)) for x in (-9, -3, 3, 9)
]


def rot(x, y, deg):
    a = math.radians(deg)
    return x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a)


def circle_pts(cx, cy, r, n=180):
    return [(cx + r * math.cos(2 * math.pi * k / n), cy + r * math.sin(2 * math.pi * k / n)) for k in range(n)]


def rrect_pts(x, y, w, h, r, n=24):
    pts = []
    corners = [(x + w - r, y + r, -90), (x + w - r, y + h - r, 0), (x + r, y + h - r, 90), (x + r, y + r, 180)]
    for cx, cy, start in corners:
        for k in range(n + 1):
            a = math.radians(start + 90 * k / n)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def line_pts(x1, y1, x2, y2, w):
    dx, dy = x2 - x1, y2 - y1
    ln = math.hypot(dx, dy) or 1
    nx, ny = -dy / ln * w / 2, dx / ln * w / 2
    return [(x1 + nx, y1 + ny), (x2 + nx, y2 + ny), (x2 - nx, y2 - ny), (x1 - nx, y1 - ny)]


def prim_pts(kind, args):
    if kind == "circle":
        return circle_pts(*args)
    if kind == "rrect":
        return rrect_pts(*args)
    return line_pts(*args)


def fit(prims, size, mode):
    """Масштаб и сдвиг: mode 'box' — вписать в квадрат size; 'circle' — в круг радиуса size."""
    pts = [rot(x, y, TILT) for kind, _, a in prims for (x, y) in prim_pts(kind, a)]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    if mode == "box":
        s = size / max(max(xs) - min(xs), max(ys) - min(ys))
    else:
        s = size / max(math.hypot(x - cx, y - cy) for x, y in pts)
    return s, cx, cy


def to_canvas(pts, s, ocx, ocy, W):
    out = []
    for x, y in pts:
        rx, ry = rot(x, y, TILT)
        out.append(((rx - ocx) * s + W / 2, (ry - ocy) * s + W / 2))
    return out


def gradient(W):
    v = Image.linear_gradient("L").resize((W, W))
    h = v.transpose(Image.Transpose.ROTATE_90).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    mask = ImageChops.add(v, h, scale=2)
    a = Image.new("RGB", (W, W), GRAD_A)
    b = Image.new("RGB", (W, W), GRAD_B)
    return Image.composite(b, a, mask)  # RGB: рисование с альфой смешивается, а не заменяет


def render(px, *, shape="rounded", mode="box", fill=0.8, detail=True, sun=True):
    """Иконка px×px. shape: rounded (скруглённый квадрат) | square (во весь холст)."""
    W = px * SS
    img = gradient(W)
    draw = ImageDraw.Draw(img, "RGBA")
    if sun:
        r = W * 0.36
        draw.ellipse((W / 2 - r, W * 0.44 - r, W / 2 + r, W * 0.44 + r), fill=SUN)
    prims = UKE_DETAIL if detail else UKE_SIMPLE
    s, ocx, ocy = fit(prims, W * fill if mode == "box" else W * fill / 2, mode)
    for kind, color, args in prims:
        draw.polygon(to_canvas(prim_pts(kind, args), s, ocx, ocy, W), fill=color)
    img = img.convert("RGBA")
    if shape == "rounded":
        m = Image.new("L", (W, W), 0)
        ImageDraw.Draw(m).rounded_rectangle((0, 0, W - 1, W - 1), radius=W * 0.225, fill=255)
        img.putalpha(m)
    return img.resize((px, px), Image.Resampling.LANCZOS)


def svg_icon():
    """favicon.svg с той же геометрией (512×512)."""
    W = 512
    s, ocx, ocy = fit(UKE_DETAIL, W * 0.8, "box")
    hexc = lambda c: "#%02x%02x%02x" % c[:3]
    parts = []
    for kind, color, a in UKE_DETAIL:
        if kind == "circle":
            parts.append(f'<circle cx="{a[0]}" cy="{a[1]}" r="{a[2]}" fill="{hexc(color)}"/>')
        elif kind == "rrect":
            parts.append(f'<rect x="{a[0]}" y="{a[1]}" width="{a[2]}" height="{a[3]}" rx="{a[4]}" fill="{hexc(color)}"/>')
        else:
            parts.append(f'<line x1="{a[0]}" y1="{a[1]}" x2="{a[2]}" y2="{a[3]}" stroke="{hexc(color)}" stroke-width="{a[4]}"/>')
    tx, ty = W / 2 - ocx * s, W / 2 - ocy * s
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
        f'<stop offset="0" stop-color="{hexc(GRAD_A)}"/><stop offset="1" stop-color="{hexc(GRAD_B)}"/>'
        "</linearGradient></defs>"
        '<rect width="512" height="512" rx="115" fill="url(#g)"/>'
        f'<circle cx="256" cy="{W * 0.44:.1f}" r="{W * 0.36:.1f}" fill="#fff" fill-opacity="0.15"/>'
        f'<g transform="translate({tx:.2f} {ty:.2f}) scale({s:.4f}) rotate({TILT})">' + "".join(parts) + "</g></svg>\n"
    )


def shortcut(px, glyph):
    """Иконка ярлыка: градиент во весь холст, белый значок в безопасной зоне."""
    W = px * SS
    img = gradient(W)
    d = ImageDraw.Draw(img, "RGBA")
    c = W / 2
    white = (255, 255, 255, 255)
    if glyph == "play":
        r = W * 0.2
        pts = [(c - r * 0.75, c - r), (c - r * 0.75, c + r), (c + r * 1.0, c)]
        d.polygon(pts, fill=white)
        d.line(pts + [pts[0]], fill=white, width=int(W * 0.05), joint="curve")
    elif glyph == "tuner":
        r = W * 0.24
        box = (c - r, c - r + W * 0.06, c + r, c + r + W * 0.06)
        d.arc(box, 200, 340, fill=white, width=int(W * 0.055))
        cy = c + W * 0.06
        nx, ny = c + r * 0.55 * math.cos(math.radians(-70)), cy + r * 0.95 * math.sin(math.radians(-70))
        d.line((c, cy, nx, ny), fill=white, width=int(W * 0.05))
        k = W * 0.05
        d.ellipse((c - k, cy - k, c + k, cy + k), fill=white)
    elif glyph == "note":
        hx, hy, hr = c - W * 0.08, c + W * 0.13, W * 0.095
        d.ellipse((hx - hr * 1.15, hy - hr, hx + hr * 1.15, hy + hr), fill=white)
        sx = hx + hr * 1.05
        d.rectangle((sx - W * 0.035, c - W * 0.24, sx, hy), fill=white)
        d.polygon([(sx - W * 0.01, c - W * 0.24), (sx + W * 0.16, c - W * 0.13), (sx + W * 0.16, c - W * 0.06), (sx - W * 0.01, c - W * 0.15)], fill=white)
    return img.resize((px, px), Image.Resampling.LANCZOS)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "favicon.svg").write_text(svg_icon(), encoding="utf-8")
    render(32, detail=False, fill=0.86, sun=False).save(OUT / "icon-32.png", optimize=True)
    render(180, shape="square", fill=0.74).convert("RGB").save(OUT / "apple-touch-icon.png", optimize=True)
    render(192, fill=0.8).save(OUT / "icon-192.png", optimize=True)
    render(512, fill=0.8).save(OUT / "icon-512.png", optimize=True)
    render(512, shape="square", mode="circle", fill=0.74).convert("RGB").save(OUT / "icon-maskable-512.png", optimize=True)
    for name, glyph in (("practice", "play"), ("tuner", "tuner"), ("songs", "note")):
        shortcut(96, glyph).convert("RGB").save(OUT / f"shortcut-{name}.png", optimize=True)
    for p in sorted(OUT.iterdir()):
        print(f"{p.name:28} {p.stat().st_size / 1024:6.1f} KB")


if __name__ == "__main__":
    main()
