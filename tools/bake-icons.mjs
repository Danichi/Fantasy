// Bake every item's inventory icon to PNG (public/assets/icons), so the game
// never renders icons at runtime. Run with the dev server up:
//   node tools/bake-icons.mjs [--port=5190]
// Re-run whenever items or their models change.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const port = (process.argv.find((a) => a.startsWith('--port=')) ?? '--port=5190').split('=')[1];
const out = 'public/assets/icons';
fs.mkdirSync(path.join(out, 'wide'), { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
// Bake without any previous bake loaded, so every icon renders fresh.
await page.route('**/assets/icons/manifest.json', (r) => r.fulfill({ status: 404, body: '' }));
await page.goto(`http://localhost:${port}/?test`);
await page.waitForFunction(() => window.__game?.steps > 20, null, { timeout: 240000 });
const icons = await page.evaluate(() => window.__game.exportIcons());
const write = (dir, id, url) => fs.writeFileSync(path.join(dir, id + '.png'), Buffer.from(url.split(',')[1], 'base64'));
for (const [id, url] of Object.entries(icons.square)) write(out, id, url);
for (const [id, url] of Object.entries(icons.wide)) write(path.join(out, 'wide'), id, url);
const manifest = { v: Date.now().toString(36), square: Object.keys(icons.square).sort(), wide: Object.keys(icons.wide).sort() };
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`baked ${manifest.square.length} icons (+${manifest.wide.length} wide) into ${out}`);
await browser.close();
