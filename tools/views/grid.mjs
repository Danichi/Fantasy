// 2x2 contact sheet of look-dev shots: node tools/views/grid.mjs <prefix>
import sharp from 'sharp';
const p = process.argv[2];
const names = ['spawn', 'vista', 'meadow', 'street'];
const W = 960, H = 540;
const tiles = await Promise.all(names.map((n) => sharp(`screenshots/${p}-${n}.png`).resize(W, H).png().toBuffer()));
await sharp({ create: { width: W * 2, height: H * 2, channels: 3, background: '#000' } })
  .composite(tiles.map((t, i) => ({ input: t, left: (i % 2) * W, top: Math.floor(i / 2) * H }))).png().toFile(`screenshots/${p}-grid.png`);
