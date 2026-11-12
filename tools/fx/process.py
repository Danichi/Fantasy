#!/usr/bin/env python3
"""Turn raw Higgsfield effect renders into game textures in public/assets/fx/.

  python3 tools/fx/process.py <raw_dir>

Raw files are named fxgen_<asset>.<gif|png>, e.g. fxgen_burst_fire.gif or
fxgen_sigil_frost.png. GIFs become 4x4 flipbooks (16 frames, 256 px each,
1024 px sheet); stills are squared and resized. Everything is written as
WebP on pure black: the shader in src/fx/vfxSprites.ts reads brightness as
coverage, so no alpha channel is needed. Black is crushed a little so the
compression noise in the background never shows as a faint square.
"""
import sys, os
from PIL import Image, ImageSequence, ImageOps

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets', 'fx')
STILL_SIZE = {'sigil': 1024, 'slash': 1024, 'dome': 1024, 'pillar': (512, 1024)}


def crush(im):
    # levels: 0..10 -> 0, keep the rest
    return im.point(lambda v: 0 if v < 10 else int((v - 10) * 255 / 245))


def flipbook(path, cell=256, grid=4):
    src = Image.open(path)
    # GIF frames carry a transparent index: flatten each onto black.
    frames = []
    for f in ImageSequence.Iterator(src):
        rgba = f.convert('RGBA')
        black = Image.new('RGBA', rgba.size, (0, 0, 0, 255))
        frames.append(Image.alpha_composite(black, rgba).convert('RGB'))
    n = grid * grid
    if len(frames) != n:  # resample to 16 evenly
        frames = [frames[round(i * (len(frames) - 1) / (n - 1))] for i in range(n)]
    sheet = Image.new('RGB', (cell * grid, cell * grid))
    for i, f in enumerate(frames):
        f = ImageOps.fit(f, (cell, cell), Image.LANCZOS)
        sheet.paste(crush(f), ((i % grid) * cell, (i // grid) * cell))
    return sheet


def still(path, kind):
    im = Image.open(path).convert('RGBA')
    im = Image.alpha_composite(Image.new('RGBA', im.size, (0, 0, 0, 255)), im).convert('RGB')
    size = STILL_SIZE.get(kind, 1024)
    if isinstance(size, tuple):
        return crush(ImageOps.fit(im, size, Image.LANCZOS))
    return crush(ImageOps.fit(im, (size, size), Image.LANCZOS))


def main(raw):
    os.makedirs(OUT, exist_ok=True)
    for name in sorted(os.listdir(raw)):
        if not name.startswith('fxgen_'):
            continue
        stem, ext = os.path.splitext(name[len('fxgen_'):])
        src = os.path.join(raw, name)
        kind = stem.split('_')[0]
        im = flipbook(src) if ext.lower() == '.gif' else still(src, kind)
        dst = os.path.join(OUT, stem + '.webp')
        im.save(dst, 'WEBP', quality=86, method=6)
        print(f'{name} -> {os.path.relpath(dst)} {os.path.getsize(dst) // 1024} KB')


if __name__ == '__main__':
    main(sys.argv[1])
