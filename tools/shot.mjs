// Screenshot helper for visual checks.
//   node tools/shot.mjs <name> [--size=1920x1080] [--wait=3000] [--query=debug&test] [--script=file.js]
// The optional script runs in the page after load. It may be async and may use
// window.__game. Screenshots land in screenshots/<name>.png.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(3).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=')];
  }),
);
const name = process.argv[2] || 'shot';
const [w, h] = (args.size || '1920x1080').split('x').map(Number);
const url = `http://localhost:${args.port || 5190}/?${args.query ?? 'test'}`;

const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: w, height: h } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 150000 });
// Wait until shaders have compiled and the simulation is actually running.
await page.waitForFunction(() => (window.__game?.steps ?? 0) > 60, null, { timeout: 150000 });
await page.waitForTimeout(Number(args.wait || 2500));
if (args.script) {
  const src = fs.readFileSync(args.script, 'utf8');
  const out = await page.evaluate(`(async () => { ${src} })()`);
  if (out !== undefined) console.log('script:', JSON.stringify(out, null, 1));
}
fs.mkdirSync('screenshots', { recursive: true });
await page.screenshot({ path: `screenshots/${name}.png` });
const info = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return { gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown', fps: window.__fps };
});
console.log(JSON.stringify(info));
for (const l of logs.filter((l) => !l.includes('[vite]')).slice(0, 25)) console.log(l);
await browser.close();
