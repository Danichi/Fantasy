// Download CC0 Poly Haven assets at 1k.
//   node tools/fetch-polyhaven.mjs models fir_tree_01 boulder_01 ...
//   node tools/fetch-polyhaven.mjs textures bark_brown_02 ...
import fs from 'node:fs';
import path from 'node:path';
const [kind, ...ids] = process.argv.slice(2);
const get = async (u) => {
  const r = await fetch(u);
  if (!r.ok) throw new Error(`${r.status} ${u}`);
  return Buffer.from(await r.arrayBuffer());
};
for (const id of ids) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  if (kind === 'models') {
    const g = files.gltf?.['1k']?.gltf;
    if (!g) { console.log('no gltf', id); continue; }
    const dir = path.join('public/assets/models', id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${id}.gltf`), await get(g.url));
    for (const [p, f] of Object.entries(g.include ?? {})) {
      fs.mkdirSync(path.join(dir, path.dirname(p)), { recursive: true });
      fs.writeFileSync(path.join(dir, p), await get(f.url));
    }
    console.log('model', id);
  } else {
    const dir = 'public/assets/textures';
    for (const [map, key] of [['diff', 'Diffuse'], ['nor_gl', 'nor_gl'], ['arm', 'arm']]) {
      const f = files[key]?.['1k']?.jpg;
      if (!f) { console.log('missing', id, map); continue; }
      fs.writeFileSync(path.join(dir, `${id}_${map}_1k.jpg`), await get(f.url));
    }
    console.log('texture', id);
  }
}
