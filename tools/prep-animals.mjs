// Slim the Quaternius animated animals (public/assets/animals/*.glb, CC0):
// keep one set of clips with short names (Idle, Walk, Gallop, Eating, Death...),
// dedupe, prune and resample keyframes.  node tools/prep-animals.mjs
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';

const DIR = 'public/assets/animals';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith('.glb'))) {
  const file = path.join(DIR, f);
  const before = fs.statSync(file).size;
  const doc = await io.read(file);
  const seen = new Set();
  for (const anim of doc.getRoot().listAnimations()) {
    const short = anim.getName().split('|').pop();
    if (seen.has(short)) anim.dispose();
    else {
      seen.add(short);
      anim.setName(short);
    }
  }
  await doc.transform(resample(), dedup(), prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 85 }));
  await io.write(file, doc);
  console.log(f, (before / 1024) | 0, '->', (fs.statSync(file).size / 1024) | 0, 'KB', [...seen].join(','));
}
