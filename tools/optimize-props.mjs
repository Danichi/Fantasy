// Simplify the dense Poly Haven photoscans into game-ready .glb files.
//   node tools/optimize-props.mjs            (all models in public/assets/models/*)
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, dedup, prune, join, flatten } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

// Target triangle budget per model (roughly); ratio is derived from the source.
const BUDGET = { boulder_01: 5000, rock_moss_set_01: 6000, shrub_02: 3500, tree_stump_01: 3000, wooden_barrels_01: 5000, wooden_crate_01: 2000, Barrel_01: 1500, stone_fire_pit: 2000, wooden_lantern_01: 1500 };

await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const root = 'public/assets/models';
for (const id of fs.readdirSync(root)) {
  const src = path.join(root, id, `${id}.gltf`);
  if (!fs.existsSync(src)) continue;
  const doc = await io.read(src);
  let tris = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? 0) / 3;
  const ratio = Math.min(1, (BUDGET[id] ?? 4000) / tris);
  await doc.transform(dedup(), flatten(), join(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.01, lockBorder: false }), prune());
  let after = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) after += (p.getIndices()?.getCount() ?? 0) / 3;
  const out = path.join(root, `${id}.glb`);
  await io.write(out, doc);
  console.log(id, Math.round(tris), '->', Math.round(after), 'tris', (fs.statSync(out).size / 1e6).toFixed(1) + 'MB');
}
