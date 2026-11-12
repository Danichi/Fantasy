#!/usr/bin/env python3
"""Slice a Higgsfield icon sheet (an n x n grid on a transparent background)
into the game's baked inventory icons.

  python3 tools/fx/slice-icons.py <sheet.png> <n> <id1,id2,...> [--wide-list wide.txt]

Each cell is trimmed to its item, padded square and written as
public/assets/icons/<id>.webp (256 px). Ids listed in --wide-list (the long
weapons) also get public/assets/icons/wide/<id>.webp (256 x 112): the diagonal
weapon turned level, grip on the left.
"""
import sys, os
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets', 'icons')


def trim(im, thr=24):
    a = im.getchannel('A').point(lambda v: 255 if v > thr else 0)
    box = a.getbbox()
    return im.crop(box) if box else im


def fit(im, w, h, margin):
    im = trim(im)
    iw, ih = im.size
    s = min((w * (1 - 2 * margin)) / iw, (h * (1 - 2 * margin)) / ih)
    im = im.resize((max(1, round(iw * s)), max(1, round(ih * s))), Image.LANCZOS)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.alpha_composite(im, ((w - im.width) // 2, (h - im.height) // 2))
    return out


def main():
    sheet, n, ids = sys.argv[1], int(sys.argv[2]), sys.argv[3].split(',')
    wide = set()
    if '--wide-list' in sys.argv:
        wide = set(open(sys.argv[sys.argv.index('--wide-list') + 1]).read().split())
    im = Image.open(sheet).convert('RGBA')
    W, H = im.size
    cw, ch = W / n, H / n
    os.makedirs(os.path.join(ROOT, 'wide'), exist_ok=True)
    for k, id_ in enumerate(ids):
        if not id_ or id_ == '-':
            continue
        r, c = divmod(k, n)
        cell = im.crop((round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch)))
        fit(cell, 256, 256, 0.06).save(os.path.join(ROOT, id_ + '.webp'), 'WEBP', quality=88, method=6)
        if id_ in wide:
            level = trim(cell).rotate(-45, resample=Image.BICUBIC, expand=True)
            fit(level, 256, 112, 0.04).save(os.path.join(ROOT, 'wide', id_ + '.webp'), 'WEBP', quality=88, method=6)
    print(f'{os.path.basename(sheet)}: {len([i for i in ids if i and i != "-"])} icons')


if __name__ == '__main__':
    main()
