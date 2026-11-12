#!/usr/bin/env python3
"""Make the five quality versions of a brewed potion icon from one painted base.

usage: python3 tools/fx/brew-tiers.py <base.webp> <recipeId>
writes public/assets/icons/brew_<recipeId>_<1..5>.webp

Crude is dulled; Common is the painting as is; Fine, Superior and Masterwork
gain a growing halo in the quality colour. Every tier carries a row of small
gem pips in the bottom-left corner (one per quality step) so tiers read at a glance.
"""
import sys, os
from PIL import Image, ImageFilter, ImageEnhance, ImageDraw, ImageChops

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets', 'icons')
# pip / halo colours per quality (1-5): crude, common, fine, superior, masterwork
QC = [None, (150, 128, 104), (214, 214, 200), (92, 214, 120), (96, 150, 255), (255, 170, 60)]
HALO = [0, 0, 0, 0.45, 0.65, 0.9]


def halo(img, col, strength):
    a = img.split()[3]
    g = a.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(14))
    g = g.point(lambda v: int(min(255, v * strength)))
    layer = Image.new('RGBA', img.size, col + (0,))
    layer.putalpha(g)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    out.alpha_composite(layer)
    out.alpha_composite(img)
    return out


def pips(img, q):
    d = ImageDraw.Draw(img)
    W = img.size[0]
    r = max(6, W // 32)
    x0, y0 = int(W * 0.07), int(W * 0.93)
    col = QC[q]
    for i in range(q):
        cx = x0 + i * (r * 2 + r // 2) + r
        # dark rim, coloured gem, small highlight
        d.ellipse((cx - r - 2, y0 - r - 2, cx + r + 2, y0 + r + 2), fill=(20, 16, 12, 230))
        d.ellipse((cx - r, y0 - r, cx + r, y0 + r), fill=col + (255,))
        h = max(2, r // 2)
        d.ellipse((cx - r // 2 - h // 2, y0 - r // 2 - h // 2, cx - r // 2 + h // 2, y0 - r // 2 + h // 2), fill=(255, 255, 255, 200))
    return img


def main():
    base, rid = sys.argv[1], sys.argv[2]
    src = Image.open(base).convert('RGBA')
    for q in range(1, 6):
        im = src.copy()
        if q == 1:
            a = im.split()[3]
            im = ImageEnhance.Color(im).enhance(0.55)
            im = ImageEnhance.Brightness(im).enhance(0.82)
            im.putalpha(a)
        if HALO[q]:
            im = halo(im, QC[q], HALO[q] * 2.2)
        im = pips(im, q)
        im.save(os.path.join(ROOT, f'brew_{rid}_{q}.webp'), 'WEBP', quality=88, method=4)


if __name__ == '__main__':
    main()
