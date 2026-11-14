# title.py icons|orn <png> : cut the title-screen icon and ornament sheets into public/assets/art/title/
import sys, os
from PIL import Image
OUT = 'public/assets/art/title'
os.makedirs(OUT, exist_ok=True)
kind, src = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGBA'); W, H = im.size
def cell(n, k):
    r, c = divmod(k, n)
    x = im.crop((c * W // n, r * H // n, (c + 1) * W // n, (r + 1) * H // n))
    b = x.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
    return x.crop(b) if b else x
def fit(x, w, h):
    s = min(w / x.width, h / x.height)
    x = x.resize((max(1, round(x.width * s)), max(1, round(x.height * s))), Image.LANCZOS)
    o = Image.new('RGBA', (w, h)); o.alpha_composite(x, ((w - x.width) // 2, (h - x.height) // 2)); return o
if kind == 'icons':
    for k, name in enumerate(['continue', 'newgame', 'load', 'sandbox', 'settings', 'controls', 'music', 'quit', 'fullscreen']):
        fit(cell(3, k), 128, 128).save(f'{OUT}/icon-{name}.webp', 'WEBP', quality=88)
else:
    fit(cell(2, 0), 320, 320).save(f'{OUT}/crest.webp', 'WEBP', quality=88)
    d = cell(2, 1); fit(d, 900, max(1, round(900 * d.height / d.width))).save(f'{OUT}/divider.webp', 'WEBP', quality=88)
    fit(cell(2, 2), 160, 160).save(f'{OUT}/corner.webp', 'WEBP', quality=88)
    fit(cell(2, 3), 64, 64).save(f'{OUT}/gem.webp', 'WEBP', quality=88)
print('ok', kind)
