// Mixamo -> game importer.
//   1. Put character.fbx and the animation .fbx files (see tools/mixamo-checklist.md)
//      into assets-src/mixamo/
//   2. npm run import:mixamo
// Converts FBX to GLB, strips meshes from animation files, extracts forward
// root motion from attacks/rolls, and writes public/assets/character/manifest.json.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, resample } from '@gltf-transform/functions';

const SRC = 'assets-src/mixamo';
const OUT = 'public/assets/character';

// Game clip key -> how to treat it.
const CLIPS = {
  idle: { loop: true }, walk: { loop: true, inPlace: true }, run: { loop: true, inPlace: true },
  sprint: { loop: true, inPlace: true }, strafe_l: { loop: true, inPlace: true }, strafe_r: { loop: true, inPlace: true },
  walk_back: { loop: true, inPlace: true }, jump: {},
  roll: { rootMotion: true }, backstep: { rootMotion: true },
  attack_light_1: { rootMotion: true }, attack_light_2: { rootMotion: true }, attack_light_3: { rootMotion: true },
  attack_heavy: { rootMotion: true }, attack_off_1: { rootMotion: true }, attack_off_2: { rootMotion: true },
  parry_shield: {}, parry_dual: {}, hit_react: {}, guard_break: {}, death: {},
  cast_fireball: {}, cast_heal: {},
};

let convert;
try {
  convert = (await import('fbx2gltf')).default;
} catch {
  console.error('The FBX converter is not installed. Run:\n\n  npm i -D fbx2gltf\n\nthen run this again.');
  process.exit(1);
}

if (!fs.existsSync(SRC)) {
  fs.mkdirSync(SRC, { recursive: true });
  console.error(`Put your Mixamo .fbx files in ${SRC}/ (see tools/mixamo-checklist.md), then run this again.`);
  process.exit(1);
}
const files = fs.readdirSync(SRC).filter((f) => f.toLowerCase().endsWith('.fbx'));
if (!files.some((f) => f.toLowerCase() === 'character.fbx')) {
  console.error(`Missing ${SRC}/character.fbx (the character downloaded "With Skin").`);
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mixamo-'));
const manifest = { model: 'character.glb', height: 1.8, clips: {} };

for (const f of files) {
  const key = path.basename(f, path.extname(f)).toLowerCase();
  const tmpGlb = path.join(tmp, `${key}.glb`);
  process.stdout.write(`${f} ... `);
  await convert(path.join(SRC, f), tmpGlb, ['--binary']);
  const doc = await io.read(tmpGlb);
  const root = doc.getRoot();

  if (key === 'character') {
    await doc.transform(dedup(), prune());
    await io.write(path.join(OUT, 'character.glb'), doc);
    // The character file often carries a T-pose clip; it isn't used.
    console.log('character');
    continue;
  }
  const spec = CLIPS[key];
  if (!spec) {
    console.log(`skipped (unknown name; see tools/mixamo-checklist.md)`);
    continue;
  }

  // Animation-only file: drop meshes, skins and materials.
  for (const m of root.listMeshes()) m.dispose();
  for (const s of root.listSkins()) s.dispose();
  for (const m of root.listMaterials()) m.dispose();
  for (const t of root.listTextures()) t.dispose();

  const entry = { file: `${key}.glb`, loop: !!spec.loop };
  const hips = root.listNodes().find((n) => /Hips$/.test(n.getName()));
  const anim = root.listAnimations()[0];
  if (hips && anim) {
    const ch = anim.listChannels().find((c) => c.getTargetNode() === hips && c.getTargetPath() === 'translation');
    const out = ch?.getSampler()?.getOutput();
    if (out) {
      const v = out.getArray();
      const n = out.getCount();
      const x0 = v[0], y0 = v[1], z0 = v[2];
      const dz = v[(n - 1) * 3 + 2] - z0;
      if (spec.rootMotion || spec.inPlace) {
        // Forward travel as a fraction of hips height; the game converts it to
        // metres for whatever character is loaded.
        if (spec.rootMotion && y0 > 0) entry.rootMotionRatio = +(dz / y0).toFixed(4);
        for (let i = 0; i < n; i++) {
          v[i * 3] = x0;
          v[i * 3 + 2] = z0;
        }
        out.setArray(v);
      }
    }
  }
  await doc.transform(resample(), prune());
  await io.write(path.join(OUT, `${key}.glb`), doc);
  manifest.clips[key] = entry;
  console.log(entry.rootMotionRatio !== undefined ? `ok (root motion ${entry.rootMotionRatio})` : 'ok');
}

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
fs.rmSync(tmp, { recursive: true, force: true });
const missing = Object.keys(CLIPS).filter((k) => !manifest.clips[k]);
console.log(`\nWrote ${OUT}/manifest.json with ${Object.keys(manifest.clips).length} clips.`);
if (missing.length) console.log(`Not provided (procedural fallback is used): ${missing.join(', ')}`);
if (!manifest.clips.idle || !manifest.clips.walk || !manifest.clips.run) {
  console.log('Warning: idle, walk and run are needed for locomotion.');
}
