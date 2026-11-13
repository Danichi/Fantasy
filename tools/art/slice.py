# slice.py <sheetname> <png> : cut an n x n transparent sheet into public/assets/art/<id>.webp
import sys, json, os
from PIL import Image
S = {s['name']: s for s in json.load(open('tools/art/sheets.json'))}
s = S[sys.argv[1]]; n = s['n']; ids = s['ids']
ROOT = 'public/assets/art'
size = 384 if ids[0].startswith('beast/') else 320
im = Image.open(sys.argv[2]).convert('RGBA'); W, H = im.size
FLOOR = int(os.environ.get('FLOOR', '0'))
if FLOOR:  # strip a faint fog/halo the painter left around the subjects
    r_, g_, b_, a_ = im.split()
    a_ = a_.point(lambda v: 0 if v <= FLOOR else min(255, round((v - FLOOR) * 255 / (255 - FLOOR) * 1.15)))
    im = Image.merge('RGBA', (r_, g_, b_, a_))
def trim(c):
    b = c.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
    return c.crop(b) if b else c
prev = Image.new('RGB', (n * 128, n * 128), (40, 40, 40))
for k, i in enumerate(ids):
    r, c = divmod(k, n)
    cell = trim(im.crop((round(c * W / n), round(r * H / n), round((c + 1) * W / n), round((r + 1) * H / n))))
    iw, ih = cell.size; m = 0.04
    sc = min(size * (1 - 2 * m) / iw, size * (1 - 2 * m) / ih)
    cell = cell.resize((max(1, round(iw * sc)), max(1, round(ih * sc))), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    # portraits sit on the bottom edge (cut-off shoulders); creatures centre
    y = size - cell.height if i.startswith(('npc/', 'arch/')) else (size - cell.height) // 2
    out.alpha_composite(cell, ((size - cell.width) // 2, y))
    p = os.path.join(ROOT, i + '.webp'); os.makedirs(os.path.dirname(p), exist_ok=True)
    out.save(p, 'WEBP', quality=86, method=4)
    prev.paste(out.resize((128, 128)).convert('RGB'), (c * 128, r * 128), out.resize((128, 128)))
prev.save('/tmp/art_preview.jpg', quality=80)
print(sys.argv[1], len(ids), 'cut')
