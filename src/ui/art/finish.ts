// The finishing pass shared by painted and rendered icons, and the painted
// icon canvas. Kept apart from icons.ts so tools can preview art without the game.

/** the 2D painters draw in a 128-unit space */
export const SIZE = 128;
/** icon size on disk and in the UI (wide icons are OUT x OUT*7/16) */
export const OUT = 256;
/** render size: twice the output, scaled down for clean edges */
export const RS = 512;

/**
 * The finish every icon gets, painted or rendered: a soft drop shadow, a dark
 * painted outline that keeps it readable on any slot, then a scale down to OUT.
 */
export function finish(src: HTMLCanvasElement, outW = OUT, outH = OUT) {
  const w = src.width, h = src.height, k = w / RS;
  const sil = document.createElement('canvas');
  sil.width = w;
  sil.height = h;
  const sg = sil.getContext('2d')!;
  sg.drawImage(src, 0, 0);
  // Only solid parts get an outline and a shadow: soft glows and smoke stay as they are.
  const im = sg.getImageData(0, 0, w, h), d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    d[i] = 0x16;
    d[i + 1] = 0x0d;
    d[i + 2] = 0x07;
    d[i + 3] = a > 150 ? 255 : a > 90 ? (a - 90) * 4.25 : 0;
  }
  sg.putImageData(im, 0, 0);
  const big = document.createElement('canvas');
  big.width = w;
  big.height = h;
  const bg = big.getContext('2d')!;
  bg.save();
  bg.filter = `blur(${9 * k}px)`;
  bg.globalAlpha = 0.55;
  bg.drawImage(sil, 5 * k, 11 * k);
  bg.restore();
  const r = 6.5 * k;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    bg.drawImage(sil, Math.cos(a) * r, Math.sin(a) * r);
  }
  bg.drawImage(src, 0, 0);
  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const og = out.getContext('2d')!;
  og.imageSmoothingEnabled = true;
  og.imageSmoothingQuality = 'high';
  og.drawImage(big, 0, 0, outW, outH);
  return out;
}

/** A 2D painter's canvas: draw in 128 units, rendered at RS and finished like the 3D icons. */
export function painted(draw: (g: CanvasRenderingContext2D) => void, wide = false) {
  const c = document.createElement('canvas');
  c.width = RS;
  c.height = wide ? Math.round((RS * 7) / 16) : RS;
  const g = c.getContext('2d')!;
  // Wide icons (the hand frames) centre the square art at the frame's height.
  if (wide) g.translate((RS - c.height) / 2, 0);
  g.scale(c.height / SIZE, c.height / SIZE);
  // Painters draw edge to edge; leave room for the outline and shadow.
  g.translate(SIZE * 0.06, SIZE * 0.05);
  g.scale(0.88, 0.88);
  draw(g);
  return encode(wide ? finish(c, OUT, Math.round((OUT * 7) / 16)) : finish(c));
}

/** Baking wants compact WebP data URLs; at runtime a data URL is fine too. */
export function encode(c: HTMLCanvasElement) {
  return c.toDataURL('image/webp', 0.92);
}
