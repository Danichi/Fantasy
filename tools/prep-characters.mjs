// Prepare Quaternius character packs (CC0) for the game: the Universal Base
// Characters and the Modular Character Outfits - Fantasy.
//
//   node tools/prep-characters.mjs <extracted folder>
//
// The folder holds three subfolders extracted from the downloaded zips:
//   base/     Base Characters/Godot - UE/*      (Superhero_*_FullBody.gltf + pngs)
//   outfits/  Exports/glTF (Godot-Unreal)/Outfits/*
//   hair/     Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/*
//
// Output: compact .glb files in public/assets/characters/. Skinning is kept;
// only base colour textures survive (1024px WebP): the stylised lighting
// (docs/ART-DIRECTION.md) replaces normal/roughness/AO maps.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress } from '@gltf-transform/functions';

const SRC = process.argv[2];
if (!SRC) throw new Error('usage: node tools/prep-characters.mjs <extracted folder>');
const OUT = 'public/assets/characters';
fs.mkdirSync(OUT, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const JOBS = [
  ['base', 'Superhero_Female_FullBody', 'base_female'],
  ['base', 'Superhero_Male_FullBody', 'base_male'],
  ['outfits', 'Female_Peasant', 'outfit_female_peasant'],
  ['outfits', 'Female_Ranger', 'outfit_female_ranger'],
  ['outfits', 'Male_Peasant', 'outfit_male_peasant'],
  ['outfits', 'Male_Ranger', 'outfit_male_ranger'],
  ...['Hair_Beard', 'Hair_Buns', 'Hair_Buzzed', 'Hair_BuzzedFemale', 'Hair_Long', 'Hair_SimpleParted', 'Eyebrows_Female', 'Eyebrows_Regular'].map((n) => ['hair', n, n.toLowerCase()]),
];

// Some .gltf files reference images under slightly different names than the
// files shipped beside them (e.g. T_Eye_Normal_png.png). Point those at the
// closest existing file so the document loads; normal maps are dropped anyway.
function fixImageUris(file) {
  const dir = path.dirname(file);
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  let changed = false;
  for (const img of j.images ?? []) {
    if (!img.uri || fs.existsSync(path.join(dir, decodeURIComponent(img.uri)))) continue;
    const alt = decodeURIComponent(img.uri).replace(/_png\.png$/, '.png');
    const any = fs.existsSync(path.join(dir, alt)) ? alt : fs.readdirSync(dir).find((f) => f.endsWith('.png'));
    console.log(`  ${path.basename(file)}: ${img.uri} -> ${any}`);
    img.uri = any;
    changed = true;
  }
  if (changed) {
    const fixed = file.replace(/\.gltf$/, '.fixed.gltf');
    fs.writeFileSync(fixed, JSON.stringify(j));
    return fixed;
  }
  return file;
}

for (const [dir, name, out] of JOBS) {
  const file = fixImageUris(path.join(SRC, dir, name + '.gltf'));
  const doc = await io.read(file);
  for (const mat of doc.getRoot().listMaterials()) {
    for (const t of [mat.getNormalTexture(), mat.getOcclusionTexture(), mat.getMetallicRoughnessTexture()]) t?.dispose();
    mat.setNormalTexture(null).setOcclusionTexture(null).setMetallicRoughnessTexture(null);
    mat.setMetallicFactor(0).setRoughnessFactor(0.85);
  }
  await doc.transform(
    prune(),
    dedup(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 85 }),
  );
  const dst = path.join(OUT, out + '.glb');
  await io.write(dst, doc);
  console.log(`${out}: ${(fs.statSync(dst).size / 1024).toFixed(0)} KB`);
}

fs.writeFileSync(path.join(OUT, 'LICENSE.txt'), `Characters, outfits and hairstyles by Quaternius (quaternius.com):
Universal Base Characters and Modular Character Outfits - Fantasy.
License: CC0 1.0 Universal (public domain). Credit appreciated, not required.
`);
