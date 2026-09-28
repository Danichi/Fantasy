// Mixamo -> game importer.
//   1. Put the Mixamo .fbx files (a whole pack is fine) into assets-src/mixamo/
//   2. npm run import:mixamo
// Converts FBX to GLB, strips meshes from animation files, removes horizontal
// hips travel (recording it as speed / root-motion curves for the game), and
// writes public/assets/character/manifest.json.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup } from '@gltf-transform/functions';

const SRC = 'assets-src/mixamo';
const OUT = 'public/assets/character';

// Source file name (lower case, no extension) -> game clip key.
// Covers the checklist names plus Mixamo's "Pro Sword and Shield Pack".
const ALIASES = {
  'x bot': 'character', 'y bot': 'character', 'paladin j nordstrom': 'character',
  'sword and shield idle': 'idle',
  'sword and shield walk': 'walk', 'sword and shield walk (2)': 'walk_back',
  'sword and shield run': 'run', 'sword and shield run (2)': 'run_back',
  'sword and shield strafe (2)': 'strafe_l', 'sword and shield strafe': 'strafe_r',
  'sword and shield strafe (3)': 'strafe_run_l', 'sword and shield strafe (4)': 'strafe_run_r',
  'sword and shield slash': 'attack_light_1', 'sword and shield attack (4)': 'attack_light_2',
  'sword and shield slash (3)': 'attack_light_3', 'sword and shield attack (3)': 'attack_heavy',
  'sword and shield attack (2)': 'attack_sprint', 'sword and shield attack': 'attack_leap',
  'sword and shield slash (2)': 'skill_combo', 'sword and shield slash (4)': 'skill_spin',
  'sword and shield slash (5)': 'attack_low', 'sword and shield kick': 'kick',
  'sword and shield block': 'parry_shield', 'sword and shield block idle': 'block_idle',
  'sword and shield block (2)': 'block_hit',
  'sword and shield impact': 'hit_react', 'sword and shield impact (3)': 'guard_break',
  'sword and shield death': 'death',
  'sword and shield casting (2)': 'cast_fireball', 'sword and shield casting': 'cast_big',
  'sword and shield power up': 'cast_heal',
  'sword and shield jump (2)': 'jump', 'sword and shield jump': 'jump_run',
  'sword and shield turn': 'turn', 'sword and shield 180 turn': 'turn_180',
  'draw sword 1': 'draw', 'sheath sword 1': 'sheath',
};

// Game clip key -> how to treat it.
//   loop:       looping clip
//   locomotion: travel is removed and recorded as speed (m/s per metre of hips height)
//   rootMotion: travel is removed and recorded as a forward-distance curve
const LOCO = ['walk', 'walk_back', 'run', 'run_back', 'strafe_l', 'strafe_r', 'strafe_run_l', 'strafe_run_r', 'sprint', 'jump_run'];
const CLIPS = {
  idle: { loop: true }, block_idle: { loop: true },
  ...Object.fromEntries(LOCO.map((k) => [k, { loop: k !== 'jump_run', locomotion: true }])),
  jump: {}, turn: {}, turn_180: {}, draw: {}, sheath: {},
  roll: { rootMotion: true }, backstep: { rootMotion: true },
  attack_light_1: { rootMotion: true }, attack_light_2: { rootMotion: true }, attack_light_3: { rootMotion: true },
  attack_heavy: { rootMotion: true }, attack_sprint: { rootMotion: true }, attack_leap: { rootMotion: true },
  attack_low: { rootMotion: true }, attack_off_1: { rootMotion: true }, attack_off_2: { rootMotion: true },
  skill_combo: { rootMotion: true }, skill_spin: { rootMotion: true }, kick: { rootMotion: true },
  parry_shield: {}, parry_dual: {}, block_hit: {}, hit_react: {}, guard_break: {}, death: {},
  cast_fireball: {}, cast_heal: {}, cast_big: {},
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
const keyOf = (f) => {
  const base = path.basename(f, path.extname(f)).toLowerCase().trim();
  return ALIASES[base] ?? base;
};
if (!files.some((f) => keyOf(f) === 'character')) {
  console.error(`Missing the character file in ${SRC}/ (character.fbx, or the pack's "X Bot.fbx").`);
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mixamo-'));
const manifest = { model: 'character.glb', height: 1.8, clips: {} };
const r4 = (x) => +x.toFixed(4);

for (const f of files.sort()) {
  const key = keyOf(f);
  const tmpGlb = path.join(tmp, `${key}.glb`);
  process.stdout.write(`${f.padEnd(40)} -> ${key.padEnd(16)} `);
  if (key !== 'character' && !CLIPS[key]) {
    console.log('skipped (not used)');
    continue;
  }
  await convert(path.join(SRC, f), tmpGlb, ['--binary']);
  const doc = await io.read(tmpGlb);
  const root = doc.getRoot();

  if (key === 'character') {
    // The skinned model; any clip inside it (a T-pose) isn't used.
    for (const a of root.listAnimations()) a.dispose();
    await doc.transform(dedup(), prune());
    await io.write(path.join(OUT, 'character.glb'), doc);
    // Mixamo's stock mannequins get the game's gambeson styling.
    if (/^[xy] bot/i.test(f)) manifest.placeholderStyle = true;
    console.log('character');
    continue;
  }
  const spec = CLIPS[key];

  // Animation-only file: drop meshes, skins and materials.
  for (const m of root.listMeshes()) m.dispose();
  for (const s of root.listSkins()) s.dispose();
  for (const m of root.listMaterials()) m.dispose();
  for (const t of root.listTextures()) t.dispose();

  const entry = { file: `${key}.glb`, loop: !!spec.loop };
  const hips = root.listNodes().find((n) => /Hips$/.test(n.getName()));
  const anim = root.listAnimations()[0];
  const ch = hips && anim?.listChannels().find((c) => c.getTargetNode() === hips && c.getTargetPath() === 'translation');
  const input = ch?.getSampler()?.getInput();
  const out = ch?.getSampler()?.getOutput();
  let note = '';
  if (out && input && (spec.locomotion || spec.rootMotion)) {
    const v = out.getArray();
    const t = input.getArray();
    const n = out.getCount();
    const x0 = v[0], y0 = v[1] || 1, z0 = v[2];
    const dur = t[n - 1] - t[0] || 1;
    const dx = v[(n - 1) * 3] - x0, dz = v[(n - 1) * 3 + 2] - z0;
    if (spec.locomotion) {
      // Travel speed relative to hips height, and the direction of travel in
      // the character's frame (+Z forward, +X left).
      entry.speedRatio = r4(Math.hypot(dx, dz) / dur / y0);
      entry.dir = [r4(dx / (Math.hypot(dx, dz) || 1)), r4(dz / (Math.hypot(dx, dz) || 1))];
      note = `speed ${(Math.hypot(dx, dz) / dur).toFixed(2)} m/s`;
    } else {
      // Forward distance over time (sampled at 30 fps) as a fraction of hips height.
      entry.rootMotionRatio = r4(dz / y0);
      const curve = [];
      for (let s = 0; s <= Math.ceil(dur * 30); s++) {
        const time = t[0] + s / 30;
        let i = 0;
        while (i < n - 2 && t[i + 1] < time) i++;
        const u = Math.min(1, Math.max(0, (time - t[i]) / ((t[i + 1] - t[i]) || 1)));
        curve.push(r4((v[i * 3 + 2] + (v[(i + 1) * 3 + 2] - v[i * 3 + 2]) * u - z0) / y0));
      }
      entry.rootCurve = curve;
      note = `travel ${dz.toFixed(2)} m`;
    }
    // Keep the body over the capsule: remove horizontal travel from the hips.
    for (let i = 0; i < n; i++) {
      v[i * 3] = x0;
      v[i * 3 + 2] = z0;
    }
    out.setArray(v);
  }
  await doc.transform(prune());
  await io.write(path.join(OUT, `${key}.glb`), doc);
  manifest.clips[key] = entry;
  console.log(`ok ${note}`);
}

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
fs.rmSync(tmp, { recursive: true, force: true });
const missing = Object.keys(CLIPS).filter((k) => !manifest.clips[k]);
console.log(`\nWrote ${OUT}/manifest.json with ${Object.keys(manifest.clips).length} clips.`);
if (missing.length) console.log(`Not provided (procedural fallback is used): ${missing.join(', ')}`);
