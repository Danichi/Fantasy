# rslice.py <ids.json> <png> : cut a 3x3 sheet of paintings separated by black bars
import sys, json, os
import numpy as np
from PIL import Image
ids = json.load(open(sys.argv[1])); im = Image.open(sys.argv[2]).convert('RGB'); a = np.asarray(im).astype(float)
def spans(prof, n=3):
    on = prof > 28
    segs, s = [], None
    for i, v in enumerate(on):
        if v and s is None: s = i
        if not v and s is not None: segs.append((s, i)); s = None
    if s is not None: segs.append((s, len(on)))
    segs = sorted(sorted(segs, key=lambda t: t[1] - t[0])[-n:])
    return segs
rows = spans(a.mean(axis=(1, 2))); cols = spans(a.mean(axis=(0, 2)))
print('rows', rows, 'cols', cols)
assert len(rows) == 3 and len(cols) == 3
ROOT = 'public/assets/art/region'; os.makedirs(ROOT, exist_ok=True)
prev = Image.new('RGB', (3 * 320, 3 * 180))
for k, i in enumerate(ids):
    (y0, y1), (x0, x1) = rows[k // 3], cols[k % 3]
    p = 4  # shave the bar's soft edge
    c = im.crop((x0 + p, y0 + p, x1 - p, y1 - p))
    # cover-crop to 16:9 at 1280x720
    w, h = c.size; t = 16 / 9
    if w / h > t: nw = round(h * t); c = c.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else: nh = round(w / t); c = c.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    c = c.resize((1280, 720), Image.LANCZOS)
    c.save(f'{ROOT}/{i}.webp', 'WEBP', quality=84, method=4)
    prev.paste(c.resize((320, 180)), ((k % 3) * 320, (k // 3) * 180))
prev.save('/tmp/art_preview.jpg', quality=80); print('cut', len(ids))
