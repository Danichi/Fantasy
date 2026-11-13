# seg.py <sheet> <png> [row sizes override e.g. 4,5,5,5,5 with skip list]
# Finds each subject by the transparent gaps around it: rows first, then items in each row.
import sys, json, os
import numpy as np
from PIL import Image
S = {s['name']: s for s in json.load(open('tools/art/sheets.json'))}
s = S[sys.argv[1]]; ids = list(s['ids']); n = s['n']
skip = sys.argv[3].split(',') if len(sys.argv) > 3 else []
ids = [i for i in ids if i not in skip]
im = Image.open(sys.argv[2]).convert('RGBA'); A = np.asarray(im)[:, :, 3] > 40
def runs(prof, minlen, gap):
    on = prof > 0; out = []; s0 = None; last = -10**9
    for i, v in enumerate(on):
        if v:
            if s0 is None: s0 = i
            last = i
        elif s0 is not None and i - last > gap:
            if last - s0 >= minlen: out.append((s0, last + 1))
            s0 = None
    if s0 is not None and last - s0 >= minlen: out.append((s0, last + 1))
    return out
H, W = A.shape
rows = runs(A.sum(1) > W * 0.004, H // 20, 6)
boxes = []
for (y0, y1) in rows:
    for (x0, x1) in runs(A[y0:y1].sum(0) > 2, W // 30, 4):
        boxes.append((x0, y0, x1, y1))
print('rows', len(rows), 'items per row', [sum(1 for b in boxes if b[1] == r[0]) for r in rows], 'ids', len(ids))
if len(boxes) != len(ids): print('MISMATCH'); sys.exit(1)
ROOT = 'public/assets/art'; size = 320
prev = Image.new('RGB', (n * 128, n * 128), (40, 40, 40))
for k, (i, b) in enumerate(zip(ids, boxes)):
    c = im.crop(b); bb = c.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox(); c = c.crop(bb) if bb else c
    iw, ih = c.size; sc = min(size * 0.92 / iw, size * 0.96 / ih)
    c = c.resize((max(1, round(iw * sc)), max(1, round(ih * sc))), Image.LANCZOS)
    out = Image.new('RGBA', (size, size)); out.alpha_composite(c, ((size - c.width) // 2, size - c.height))
    p = f'{ROOT}/{i}.webp'; os.makedirs(os.path.dirname(p), exist_ok=True); out.save(p, 'WEBP', quality=86, method=4)
    prev.paste(out.resize((128, 128)).convert('RGB'), ((k % n) * 128, (k // n) * 128), out.resize((128, 128)))
prev.save('/tmp/art_preview.jpg', quality=80); print('cut', len(ids))
