// Re-encode the textures embedded in shipped .glb files as WebP, at most
// 1024 px (EXT_texture_webp: three.js reads it natively, no decoder needed).
// Geometry is untouched. A file is only rewritten when it gets smaller.
//   node tools/compress-textures.mjs                 (models, npc, animals, vendor)
//   node tools/compress-textures.mjs public/assets/npc/orcWarchief.glb
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress, dedup, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const DIRS = ['public/assets/models', 'public/assets/npc', 'public/assets/animals', 'public/assets/vendor'];
const MAX = 1024;

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.glb') ? [path.join(d, e.name)] : []));
const files = process.argv.length > 2 ? process.argv.slice(2) : DIRS.filter((d) => fs.existsSync(d)).flatMap(walk);

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
// (Some files already carry meshopt-compressed geometry; it round-trips as is.)
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
let before = 0, after = 0;
for (const f of files) {
  const size0 = fs.statSync(f).size;
  let doc;
  try {
    doc = await io.read(f);
  } catch (e) {
    console.log(`${f}  skipped (${String(e.message).slice(0, 60)})`); // e.g. Draco geometry
    continue;
  }
  if (!doc.getRoot().listTextures().some((t) => t.getMimeType() !== 'image/webp')) continue;
  await doc.transform(
    dedup(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [MAX, MAX], quality: 86 }),
    prune(),
  );
  const out = await io.writeBinary(doc);
  before += size0;
  if (out.byteLength < size0 * 0.95) {
    fs.writeFileSync(f, out);
    after += out.byteLength;
    console.log(`${f}  ${(size0 / 1e6).toFixed(2)} MB -> ${(out.byteLength / 1e6).toFixed(2)} MB`);
  } else after += size0;
}
console.log(`total ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB`);
