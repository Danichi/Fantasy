#!/usr/bin/env python3
"""Recolour one painted steel icon into the eight metal tiers.

  python3 tools/fx/tier-tint.py <base.webp|png> <base-id>

Writes public/assets/icons/<metal>_<base-id>.webp for every metal whose item
exists in the manifest (and the wide variant if the steel one has one). Only
the metal is recoloured: grey, unsaturated pixels are remapped through the
metal's dark-to-light ramp; leather, wood and gems keep their colour.
"""
import sys, os, json
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets', 'icons')
RAMPS = {  # dark, mid, light
    'iron': [(34, 34, 37), (98, 98, 103), (182, 182, 188)],
    'steel': None,
    'silversteel': [(62, 72, 94), (172, 188, 214), (248, 251, 255)],
    'deepsteel': [(12, 18, 36), (50, 70, 112), (150, 176, 220)],
    'duskiron': [(14, 9, 22), (58, 34, 86), (184, 118, 250)],
    'starmetal': [(7, 9, 24), (36, 42, 86), (178, 188, 255)],
    'sunbrass': [(62, 36, 6), (196, 140, 34), (255, 238, 160)],
    'tideglass': [(0, 44, 52), (28, 160, 166), (196, 255, 250)],
}


def ramp(lum, stops):
    stops = np.array(stops, dtype=np.float32)
    t = np.clip(lum, 0, 1)[..., None]
    lo = stops[0] + (stops[1] - stops[0]) * np.clip(t * 2, 0, 1)
    hi = stops[1] + (stops[2] - stops[1]) * np.clip(t * 2 - 1, 0, 1)
    return np.where(t < 0.5, lo, hi)


def tint(im, metal):
    a = np.asarray(im.convert('RGBA')).astype(np.float32)
    rgb, al = a[..., :3], a[..., 3:]
    mx, mn = rgb.max(-1), rgb.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1)
    lum = (rgb @ np.array([0.299, 0.587, 0.114], dtype=np.float32)) / 255
    # metal = unsaturated; fade the effect out between saturation 0.12 and 0.3
    w = np.clip((0.3 - sat) / 0.18, 0, 1)[..., None]
    new = ramp(lum, RAMPS[metal])
    if metal == 'starmetal':  # a scatter of tiny stars in the metal
        rng = np.random.default_rng(7)
        stars = (rng.random(lum.shape) > 0.997) & (w[..., 0] > 0.5)
        new[stars] = (235, 240, 255)
    out = rgb * (1 - w) + new * w
    if metal == 'tideglass':  # a little see-through
        al = al * (1 - 0.18 * w)
    return Image.fromarray(np.concatenate([out, al], -1).clip(0, 255).astype(np.uint8), 'RGBA')


def main():
    src, base = sys.argv[1], sys.argv[2]
    m = json.load(open(os.path.join(ROOT, 'manifest.json')))
    sq, wide = set(m['square']), set(m['wide'])
    im = Image.open(src)
    wim = None
    wpath = os.path.join(os.path.dirname(src), 'wide', os.path.basename(src))
    if os.path.exists(wpath):
        wim = Image.open(wpath)
    n = 0
    for metal in RAMPS:
        id_ = f'{metal}_{base}'
        if id_ not in sq:
            continue
        out = im.convert('RGBA') if RAMPS[metal] is None else tint(im, metal)
        out.save(os.path.join(ROOT, id_ + '.webp'), 'WEBP', quality=88, method=6)
        if wim is not None and id_ in wide:
            wo = wim.convert('RGBA') if RAMPS[metal] is None else tint(wim, metal)
            wo.save(os.path.join(ROOT, 'wide', id_ + '.webp'), 'WEBP', quality=88, method=6)
        n += 1
    print(f'{base}: {n} tiers')


if __name__ == '__main__':
    main()
