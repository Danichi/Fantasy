// Contact sheet of player poses: node tools/poses.mjs <name> <action> t1,t2,... [--yaw=1.6] [--cols=4]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const [name, action, times] = process.argv.slice(2);
const opts = Object.fromEntries(process.argv.slice(5).map((a) => a.replace(/^--/, '').split('=')));
const ts = times.split(',').map(Number);
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 640 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://localhost:5190/?test');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
// Wait until shaders have compiled and the simulation is actually running.
await page.waitForFunction(() => (window.__game?.steps ?? 0) > 60, null, { timeout: 60000 });
await page.waitForTimeout(1500);
const shots = [];
for (const t of ts) {
  await page.evaluate(([a, t, yaw, pitch, dist, setup]) => {
    const g = window.__game;
    if (setup) eval(setup);
    g.pose(a, t);
    g.cam.yaw = g.player.yaw + yaw; g.cam.pitch = pitch; g.cam.distance = dist; g.cam.lockTarget = null;
    for (let i = 0; i < 30; i++) g.cam.update(1 / 30, g.player.pos, false);
  }, [action, t, Number(opts.yaw ?? 1.6) + Math.PI, Number(opts.pitch ?? 0.12), Number(opts.dist ?? 2.8), opts.setup ?? '']);
  await page.waitForTimeout(250);
  shots.push((await page.screenshot()).toString('base64'));
}
const cols = Number(opts.cols ?? 4);
const html = `<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${cols},320px);gap:2px">${shots
  .map((b, i) => `<div style="position:relative"><img src="data:image/png;base64,${b}" width=320 height=320><span style="position:absolute;left:6px;top:4px;color:#fff;font:14px sans-serif;text-shadow:0 0 3px #000">t=${ts[i]}</span></div>`)
  .join('')}</body>`;
const sheet = await browser.newPage({ viewport: { width: cols * 322, height: Math.ceil(shots.length / cols) * 322 } });
await sheet.setContent(html);
fs.mkdirSync('screenshots', { recursive: true });
await sheet.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
await browser.close();
