// Contact sheet of the painted texture kit, each tile shown repeated 2 x 2.
//   node tools/texture-sheet.mjs <out.jpg> name name ...   (up to 6 per sheet)
import sharp from 'sharp';

const [out, ...names] = process.argv.slice(2);
const tiles = [];
for (const n of names) tiles.push(await sharp(`docs/art-bible/materials/${n}.jpg`).resize(640, 640).png().toBuffer());
const rows = Math.ceil(names.length / 3);
await sharp({ create: { width: 1920, height: 640 * rows, channels: 3, background: '#222' } })
  .composite(tiles.map((input, i) => ({ input, left: (i % 3) * 640, top: Math.floor(i / 3) * 640 })))
  .jpeg({ quality: 84 })
  .toFile(out);
