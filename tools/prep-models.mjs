// Prepare downloaded character/prop models for the game:
// simplify heavy sculpts, resize textures, convert old material formats,
// and write compact .glb files to public/assets/npc/.
//   node tools/prep-models.mjs
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, dedup, prune, metalRough, textureCompress, flatten, join, compactPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

const SRC = 'assets-src/incoming';
const OUT = 'public/assets/npc';
// name -> [source folder, triangle budget (0 = keep), texture size, keep skin?, simplify error, sloppy?]
const JOBS = {
  froest: ['mr._frost__vgdc', 0, 1024, true],
  kaela: ['female_npc', 0, 1024, true],
  magus: ['fantasy_villager', 60000, 1024, false],
  corvin: ['fallen_paladin_in_corrupted_black_plate_armor', 60000, 1024, false, 0.02, true],
  rustyArmour: ['old_rusty_gothic_worn_armor', 30000, 1024, false, 0.02, true],
  urukStatue: ['uruk_hai_-_lotr', 45000, 1024, false],
};

await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
fs.mkdirSync(OUT, { recursive: true });
const tris = (doc) => {
  let t = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) t += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  return Math.round(t);
};
for (const [name, [dir, budget, texSize, skinned, err = 0.03, sloppy = false]] of Object.entries(JOBS)) {
  if (process.argv[2] && process.argv[2] !== name) continue;
  const doc = await io.read(path.join(SRC, dir, 'scene.gltf'));
  const before = tris(doc);
  if (!skinned) {
    // AI-generated scans carry tangents and extra UV sets that stop vertices
    // welding (so nothing can be simplified). Drop everything but position,
    // normal and the first UV set.
    for (const m of doc.getRoot().listMeshes()) for (const prim of m.listPrimitives()) {
      for (const sem of prim.listSemantics()) if (!['POSITION', 'NORMAL', 'TEXCOORD_0'].includes(sem)) prim.setAttribute(sem, null);
    }
  }
  // Drop flat ground planes (baked shadow discs under statues): meshes whose
  // thinnest dimension is tiny next to their widest, in any orientation.
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh || skinned) continue;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const [a, b] = [pos.getMin([]), pos.getMax([])];
      for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], a[k]); hi[k] = Math.max(hi[k], b[k]); }
    }
    const ext = hi.map((h, k) => h - lo[k]).sort((a, b) => a - b);
    if (ext[0] < ext[2] * 0.08) node.setMesh(null);
  }
  const steps = [dedup(), metalRough()];
  if (!skinned) steps.push(flatten(), join());
  steps.push(weld());
  if (budget && before > budget && !sloppy) steps.push(simplify({ simplifier: MeshoptSimplifier, ratio: budget / before, error: err, lockBorder: false }));
  if (budget && before > budget && sloppy) {
    // Triangle soup (every triangle has its own vertices): cluster by position
    // regardless of connectivity, keeping a subset of the original vertices.
    steps.push((d) => {
      for (const m of d.getRoot().listMeshes()) for (const prim of m.listPrimitives()) {
        const idx = prim.getIndices();
        const pos = prim.getAttribute('POSITION');
        if (!idx || !pos) continue;
        const indices = new Uint32Array(idx.getArray());
        const positions = new Float32Array(pos.getArray());
        const target = Math.floor((indices.length * budget) / before / 3) * 3;
        const [out] = MeshoptSimplifier.simplifySloppy(indices, positions, 3, null, target, err);
        idx.setArray(out);
        compactPrimitive(prim);
      }
    });
  }
  // WebP keeps alpha and is far smaller than PNG; three.js loads it natively.
  steps.push(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [texSize, texSize], quality: 85 }));
  steps.push(prune());
  await doc.transform(...steps);
  const out = path.join(OUT, `${name}.glb`);
  await io.write(out, doc);
  fs.copyFileSync(path.join(SRC, dir, 'license.txt'), path.join(OUT, `${name}.license.txt`));
  console.log(`${name.padEnd(12)} ${before} -> ${tris(doc)} tris, ${(fs.statSync(out).size / 1e6).toFixed(1)} MB`);
}
