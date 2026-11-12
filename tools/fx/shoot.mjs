// Screenshot the painted VFX in the running game, one school at a time.
//
//   node tools/fx/shoot.mjs [outDir]
//
// Starts its own Vite server on 5193, boots the game with ?test, parks the
// player, then for each school fires a slash, a ground circle and an impact
// in front of the camera and saves a frame mid-effect. Needs Chrome or the
// Playwright Chromium; PW_CHANNEL=chrome uses the system Chrome.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] ?? 'fx-shots';
mkdirSync(out, { recursive: true });
const PORT = 5193;
const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`http://localhost:${PORT}`)).ok) break; } catch {}
    await wait(1000);
  }
  const browser = await chromium.launch({
    channel: process.env.PW_CHANNEL,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.goto(`http://localhost:${PORT}/?test&quality=low`);
  await page.waitForFunction(() => window.__game?.steps > 60, null, { timeout: 400_000 });
  const schools = (process.env.FX_SCHOOLS ?? 'fire,frost,storm,steel,light,gale,void,earth,nature,blood,water').split(',');
  // Warm the texture cache, then give it time to arrive.
  await page.evaluate(() => {
    const g = window.__game, v = g.skillRt.vfx, p = g.player.pos.clone();
    for (const s of ['fire', 'frost', 'storm', 'steel', 'light', 'gale', 'void', 'earth', 'nature', 'blood', 'water']) v.impact(p.clone().setY(p.y - 50), s, 0.1);
  });
  await wait(4000);
  await page.addStyleTag({ content: '#ui, #hud, .hud { display: none !important; }' });
  for (const s of schools) {
    await page.evaluate((s) => {
      const g = window.__game, v = g.skillRt.vfx, pl = g.player;
      const f = pl.forward.clone();
      const at = pl.pos.clone().addScaledVector(f, 4.5);
      v.groundCircle(pl.pos.clone(), s, 3.2, 3);
      v.slash(pl.center.clone(), Math.atan2(f.x, f.z), 2.2, s);
      v.impact(at.setY(at.y + 1.1), s, 1);
    }, s);
    // Wait in simulation steps (60 Hz), not wall time: software rendering is slow.
    await page.evaluate(async (n) => {
      const g = window.__game, s0 = g.steps;
      while (g.steps < s0 + n) await new Promise((r) => setTimeout(r, 10));
    }, Number(process.env.FX_STEPS ?? 14));
    await page.screenshot({ path: join(out, `${s}.jpg`), quality: 80 });
    await page.evaluate(async () => {
      const g = window.__game, s0 = g.steps;
      while (g.steps < s0 + 200) await new Promise((r) => setTimeout(r, 10));
    });
  }
  await browser.close();
} finally {
  vite.kill();
}
