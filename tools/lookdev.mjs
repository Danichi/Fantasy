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
    // A portrait: { "focus": "hero" | "npc", "stand": [x, z], "pick": 0, "dist": 2.4, "height": 1.35, "turn": 0.4 }
    // puts the camera in front of the hero, or of the pick-th nearest townsperson to `stand`.
    if (v.focus) {
      // { "focus": "cast", "id": "kaela" }: one of the named townspeople at their post.
      const cast = v.focus === 'cast' ? g.town.npcs.find((n) => n.spec.id === v.id) : null;
      if (v.focus === 'cast' && !cast) return { error: 'no such cast member: ' + v.id };
      const [sx, sz] = cast ? [cast.pos.x + 3, cast.pos.z + 3] : v.stand;
      g.time.skipTo?.(v.hour ?? 10);
      g.weather.forced = 'clear';
      g.player.teleport(new T.Vector3(sx, heightAt(sx, sz) + 0.3, sz));
      g.player.char.root.visible = v.focus === 'hero';
      g.r.camera.position.set(sx, heightAt(sx, sz) + 2, sz + 4);
      for (let i = 0; i < (v.settle ?? 60); i++) await new Promise((r) => setTimeout(r, 100));
      let pos, yaw, who = null;
      if (cast) {
        await cast.loaded;
        pos = cast.pos.clone();
        const [tx, tz] = v.toward ?? [0, 0];
        yaw = Math.atan2(tx - pos.x, tz - pos.z);
      } else if (v.focus === 'hero') {
        g.player.yaw = v.yaw ?? 0;
        await new Promise((r) => setTimeout(r, 600));
        pos = g.player.pos.clone();
        yaw = g.player.yaw;
      } else {
        const near = g.npcs.npcs.filter((n) => n.actor && !n.hidden && !n.moving).sort((p, q) => Math.hypot(p.pos.x - sx, p.pos.z - sz) - Math.hypot(q.pos.x - sx, q.pos.z - sz));
        const n = near[Math.min(v.pick ?? 0, near.length - 1)];
        if (!n) return { error: 'no townsperson nearby' };
        who = n;
        pos = n.pos.clone();
        yaw = n.yaw;
      }
      // (The hero's yaw 0 faces -Z; a townsperson's faces +Z.)
      const d = v.dist ?? 2.4, hgt = v.height ?? 1.35;
      const set = () => {
        if (who) { pos.copy(who.pos); yaw = who.yaw; }
        const a = yaw + (v.focus === 'hero' ? Math.PI : 0) + (v.turn ?? 0.45);
        g.r.camera.position.set(pos.x + Math.sin(a) * d, pos.y + hgt, pos.z + Math.cos(a) * d);
        g.r.camera.lookAt(pos.x, pos.y + (v.lookAt ?? hgt - 0.15), pos.z);
      };
      for (let i = 0; i < 12; i++) { set(); await new Promise((r) => setTimeout(r, 100)); }
      set();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const starter = [];
      if (v.focus === 'hero') g.player.char.model.traverse((o) => { if (o.userData.starterSlot) starter.push(o.name + ':' + o.visible); });
      return { fps: window.__fps, starter, worn: v.focus === 'hero' ? Object.keys(g.player.equip.equipped ?? {}) : undefined, at: pos.toArray().map((n) => +n.toFixed(1)), who: who ? { name: who.rec.name, job: who.rec.job, look: who.rec.look } : undefined };
    }
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
