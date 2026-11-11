// Look-dev contact shots: boots the game once and photographs a list of viewpoints.
//   node tools/lookdev.mjs <prefix> [--set=core] [--only=a,b] [--size=1600x900] [--quality=medium] [--hour=10]
// Viewpoints live in tools/views/lookdev.json:
//   { "name": { "from": [x, yAboveGround, z], "at": [x, yAboveGround, z], "hour": 10, "player": false } }
// Shots land in screenshots/<prefix>-<name>.jpg.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(3).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=')];
  }),
);
const prefix = process.argv[2] || 'look';
const [w, h] = (args.size || '1600x900').split('x').map(Number);
const all = JSON.parse(fs.readFileSync(new URL('./views/lookdev.json', import.meta.url), 'utf8'));
const set = args.set || 'core';
let views = Object.entries(all[set] ?? {});
if (args.only) views = views.filter(([n]) => args.only.split(',').includes(n));
if (!views.length) throw new Error(`no views in set "${set}"`);

const url = `http://localhost:${args.port || 5190}/?test&quality=${args.quality || 'medium'}`;
const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: w, height: h } });
const logs = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`);
});
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const t0 = Date.now();
await page.goto(url);
try {
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 420000 });
  await page.waitForFunction(() => (window.__game?.steps ?? 0) > 60, null, { timeout: 240000 });
} catch (e) {
  console.log('boot failed:', e.message);
  for (const l of logs.slice(0, 40)) console.log(l);
  await browser.close();
  process.exit(1);
}
console.log(`booted in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
fs.mkdirSync('screenshots', { recursive: true });

await page.evaluate(() => {
  const g = window.__game;
  document.getElementById('ui').style.visibility = 'hidden';
  window.__camUpdate = g.cam.update.bind(g.cam);
  g.cam.update = () => {};
  g.weather.forced = 'clear';
});

for (const [name, v] of views) {
  const out = await page.evaluate(async (v) => {
    const g = window.__game;
    const T = g.THREE;
    // Inside a dungeon: { "dungeon": 1 | 2 | "mine", "yaw": 0, "pitch": 0.1, "dist": 5 } uses the game's own camera.
    if (v.dungeon) {
      g.cam.update = window.__camUpdate;
      if (v.dungeon === 'mine') await g.realm.enterMine();
      else await g.realm.enter(v.dungeon, 'entrance');
      await new Promise((r) => setTimeout(r, 2500));
      if (v.yaw !== undefined) { g.player.yaw = v.yaw; g.cam.yaw = v.yaw; }
      g.cam.pitch = v.pitch ?? 0.08;
      g.cam.distance = v.dist ?? 5;
      g.player.char.root.visible = v.player !== false;
      await new Promise((r) => setTimeout(r, 3500));
      return { fps: window.__fps, pos: g.player.pos.toArray().map((n) => +n.toFixed(1)) };
    }
    if (g.realm.mode !== 'overworld') {
      await g.realm.leave();
      g.cam.update = () => {};
    }
    const { heightAt } = await import('/src/world/terrain.ts');
    const [fx, fy, fz] = v.from, [ax, ay, az] = v.at;
    const stand = v.stand ?? [fx, fz];
    g.time.skipTo?.(v.hour ?? 10);
    g.weather.forced = v.weather ?? 'clear';
    g.player.teleport(new T.Vector3(stand[0], heightAt(stand[0], stand[1]) + 0.3, stand[1]));
    g.player.char.root.visible = !!v.player;
    const place = () => {
      g.r.camera.position.set(fx, heightAt(fx, fz) + fy, fz);
      g.r.camera.lookAt(ax, heightAt(ax, az) + ay, az);
    };
    // Let the tiles, props and grass around the new spot stream in.
    for (let i = 0; i < (v.settle ?? 40); i++) {
      place();
      await new Promise((r) => setTimeout(r, 100));
    }
    place();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { fps: window.__fps, ground: +heightAt(fx, fz).toFixed(1) };
  }, v);
  await page.screenshot({ path: `screenshots/${prefix}-${name}.jpg`, type: 'jpeg', quality: 88 });
  console.log(name, JSON.stringify(out));
}
const info = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return { gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown' };
});
console.log(JSON.stringify(info));
for (const l of [...new Set(logs)].slice(0, 20)) console.log(l);
await browser.close();
