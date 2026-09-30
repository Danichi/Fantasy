import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const targetDir = join(root, 'public', 'assets', 'vendor', 'stylized');

const assets = [
  ['common-tree-1', 'CommonTree_1.glb'],
  ['common-tree-2', 'CommonTree_2.glb'],
  ['common-tree-3', 'CommonTree_3.glb'],
  ['common-tree-4', 'CommonTree_4.glb'],
  ['common-tree-5', 'CommonTree_5.glb'],
  ['pine-1', 'Pine_1.glb'],
  ['pine-2', 'Pine_2.glb'],
  ['pine-4', 'Pine_4.glb'],
  ['pine-5', 'Pine_5.glb'],
  ['fern-1', 'Fern_1.glb'],
  ['flower-3-group', 'Flower_3_Group.glb'],
  ['mushroom-common', 'Mushroom_Common.glb'],
];

mkdirSync(targetDir, { recursive: true });

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function installAsset(slug) {
  const result = spawnSync(
    npx,
    ['--yes', '@drawcall/market@0.8.10', 'install', slug],
    // Windows needs a shell to run npx.cmd (Node refuses to spawn .cmd files directly).
    { cwd: root, stdio: 'inherit', env: { ...process.env, CI: '1' }, shell: process.platform === 'win32' },
  );
  if (result.status !== 0) {
    console.warn('[visual-assets] Could not install ' + slug + '; keeping any existing/fallback visuals.');
  }
}

for (const [slug, filename] of assets) {
  const target = join(targetDir, filename);
  if (existsSync(target)) continue;

  const installed = join(root, 'public', 'model', filename);
  if (!existsSync(installed)) installAsset(slug);
  if (existsSync(installed)) {
    copyFileSync(installed, target);
  } else if (!existsSync(target)) {
    console.warn('[visual-assets] Missing ' + filename + ' after install attempt.');
  }
}

const creatureDir = join(root, 'public', 'assets', 'vendor', 'creatures');
mkdirSync(creatureDir, { recursive: true });

const creatureAssets = [
  ['wolf.glb', 'https://raw.githubusercontent.com/Master-Coder-Sudo/Claude-gaming-world/main/public/models/creatures/wolf.glb'],
  ['stag.glb', 'https://raw.githubusercontent.com/Master-Coder-Sudo/Claude-gaming-world/main/public/models/creatures/stag.glb'],
  ['goblin.glb', 'https://raw.githubusercontent.com/Master-Coder-Sudo/Claude-gaming-world/main/public/models/creatures/goblin.glb'],
  ['orc.glb', 'https://raw.githubusercontent.com/Master-Coder-Sudo/Claude-gaming-world/main/public/models/creatures/orc.glb'],
];

for (const [filename, url] of creatureAssets) {
  const target = join(creatureDir, filename);
  if (existsSync(target)) continue;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    writeFileSync(target, Buffer.from(await res.arrayBuffer()));
  } catch (error) {
    console.warn('[visual-assets] Could not fetch creature ' + filename + ':', error);
  }
}

writeFileSync(
  join(targetDir, 'README.md'),
  [
    '# Stylized visual asset manifest',
    '',
    'Runtime source: Quaternius packs mirrored through Drawcall Market.',
    'All listed Quaternius assets are CC0 1.0 / public domain.',
    '',
    'Sources:',
    '- https://quaternius.com/packs/stylizednaturemegakit.html',
    '- https://quaternius.itch.io/stylized-nature-megakit',
    '- https://market.drawcall.ai/',
    '- Creature mirror: https://github.com/Master-Coder-Sudo/Claude-gaming-world (Quaternius CC0 assets; see its CREDITS.md)',
    '',
    'Drawcall Market assets are fetched at development/build time so the game keeps its runtime assets local.',
    '',
  ].join('\n'),
);
