import { test, expect, type Page } from '@playwright/test';

// Phase 2: the crypt instance, the labyrinth, hand-drawn maps, XP and saving.

async function boot(page: Page, query = '?test') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/' + query);
  await page.waitForFunction(() => (window as any).__game?.steps > 60, null, { timeout: 180_000 });
  return errors;
}

test('enter the crypt from the overworld and leave again', async ({ page }) => {
  const errors = await boot(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game;
    // Walk up to the crypt door and use it.
    const door = g.realm.cryptDoor;
    g.player.teleport(door.clone().add(new g.THREE.Vector3(0, 0.3, 1.5)));
    await new Promise((r) => setTimeout(r, 400));
    const prompt = document.querySelector('.prompt')!.textContent;
    const it = g.realm.interactables.find((i: any) => i.label() === 'Enter the crypt');
    it.action();
    await new Promise((r) => setTimeout(r, 100));
    while (g.realm.busy) await new Promise((r) => setTimeout(r, 100));
    const inside = { mode: g.realm.mode, x: g.player.pos.x, grounded: g.player.grounded, map: !document.querySelector('.dmap-mini')!.classList.contains('hidden') };
    await g.realm.leave();
    await new Promise((r) => setTimeout(r, 300));
    return { prompt, inside, after: { mode: g.realm.mode, x: g.player.pos.x } };
  });
  expect(res.prompt).toContain('Enter the crypt');
  expect(res.inside.mode).toBe('dungeon');
  expect(res.inside.x).toBeGreaterThan(2900);
  expect(res.inside.grounded).toBe(true);
  expect(res.inside.map).toBe(true);
  expect(res.after.mode).toBe('overworld');
  expect(Math.abs(res.after.x)).toBeLessThan(50);
  expect(errors).toEqual([]);
});

test('the labyrinth is connected and the gate guards the stairs', async ({ page }) => {
  await boot(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game;
    await g.realm.enter(1, 'entrance');
    const inst = g.realm.instance;
    const L = inst.layout, grid = inst.grid;
    const all = grid.bfs(L.entrance).dist;
    const reachable = Array.from(all as Int32Array).every((d: number) => d >= 0);
    const [gi, gj] = L.gate.cell;
    const dir = L.gate.dir;
    const dx = dir === 'e' ? 1 : dir === 'w' ? -1 : 0, dy = dir === 's' ? 1 : dir === 'n' ? -1 : 0;
    const opp: any = { n: 's', s: 'n', e: 'w', w: 'e' };
    const blocked = (i: number, j: number, d: string) => (i === gi && j === gj && d === dir) || (i === gi + dx && j === gj + dy && d === opp[dir]);
    const closed = grid.bfs(L.entrance, blocked).dist;
    const stairsBlocked = closed[L.exit[1] * L.w + L.exit[0]] < 0;
    const keyReachable = closed[L.key[1] * L.w + L.key[0]] >= 0;
    // Unlocking with the key removes the gate.
    g.player.equip.add('cryptKey');
    inst.interactables.find((i: any) => i.label() === 'Unlock the gate').action();
    return { reachable, stairsBlocked, keyReachable, gateOpen: g.realm.progress.gateOpen };
  });
  expect(res.reachable).toBe(true);
  expect(res.stairsBlocked).toBe(true);
  expect(res.keyReachable).toBe(true);
  expect(res.gateOpen).toBe(true);
});

test('killing an enemy awards XP and gold that fly to the player', async ({ page }) => {
  await boot(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game;
    const p = g.player;
    const s = g.slimes.spawn('blue', p.pos.x, p.pos.z - 3);
    await new Promise((r) => setTimeout(r, 200));
    const xp0 = p.prog.xp, gold0 = p.prog.gold;
    s.takeHit({ damage: 999, poise: 0, dir: new g.THREE.Vector3(0, 0, -1), at: s.center.clone(), crit: false, source: 'melee' });
    await new Promise((r) => setTimeout(r, 2500));
    return { dXp: p.prog.xp - xp0 + (p.prog.level - 1) * 1000, dGold: p.prog.gold - gold0 };
  });
  expect(res.dXp).toBeGreaterThanOrEqual(26);
  expect(res.dGold).toBeGreaterThanOrEqual(6);
});

test('crypt orcs attack and can be killed', async ({ page }) => {
  await boot(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game;
    await g.realm.enter(1, 'entrance');
    const inst = g.realm.instance;
    const a = inst.orcs[0];
    for (const o of inst.orcs.slice(1)) o.dispose();
    inst.orcs = [a];
    const p = g.player;
    p.teleport(a.position.clone().add(new g.THREE.Vector3(0, 0.3, 2)));
    const hp0 = p.hp;
    for (let i = 0; i < 60 && p.hp === hp0; i++) await new Promise((r) => setTimeout(r, 100));
    const hurt = hp0 - p.hp;
    a.takeHit({ damage: 999, poise: 0, dir: new g.THREE.Vector3(0, 0, -1), at: a.center.clone(), crit: true, source: 'melee' });
    return { hurt, alive: a.alive };
  });
  expect(res.hurt).toBeGreaterThan(0);
  expect(res.alive).toBe(false);
});

test('hand-drawn maps and progress survive a reload', async ({ page }) => {
  await boot(page, '?test&save');
  await page.evaluate(async () => {
    localStorage.clear();
    const g = (window as any).__game;
    await g.realm.enter(1, 'entrance');
    const d = g.mapUI.current;
    d.hw[3] = 1;
    d.icons['2,2'] = 'chest';
    d.notes.push({ i: 1, j: 1, t: 'mind the spikes' });
    g.player.prog.addGold(123);
    g.save();
  });
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.steps > 60, null, { timeout: 180_000 });
  const res = await page.evaluate(() => {
    const g = (window as any).__game;
    const m = g.realm.maps[g.realm.mapKey(1)];
    const out = { wall: m?.hw[3], icon: m?.icons['2,2'], note: m?.notes[0]?.t, gold: g.player.prog.gold };
    localStorage.clear();
    return out;
  });
  expect(res.wall).toBe(1);
  expect(res.icon).toBe('chest');
  expect(res.note).toBe('mind the spikes');
  expect(res.gold).toBe(123);
});

test('the Orc Warlord fights with blade and bow, and drops his loot', async ({ page }) => {
  await boot(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game;
    const T = g.THREE;
    await g.realm.enter(2, 'entrance');
    const inst = g.realm.instance;
    for (const o of inst.orcs) o.dispose();
    inst.orcs = [];
    const o = inst.bossTarget;
    const p = g.player;
    const f = new T.Vector3(Math.sin(o.yaw), 0, Math.cos(o.yaw));
    // Melee: stand close and wait to be hit.
    p.teleport(o.position.clone().addScaledVector(f, 2.2).setY(0.3));
    let hp0 = p.hp;
    for (let i = 0; i < 100 && p.hp === hp0; i++) await new Promise((r) => setTimeout(r, 100));
    const melee = hp0 - p.hp;
    // Ranged: back off and let him use the bow.
    p.hp = p.maxHp;
    hp0 = p.hp;
    o.cooldown = 0;
    o.setState('recover');
    p.teleport(o.position.clone().addScaledVector(f, 11).setY(0.3));
    o.startMove('bow', p);
    let sawArrow = false;
    for (let i = 0; i < 60 && p.hp === hp0; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (o.arrows.length) sawArrow = true;
    }
    const ranged = hp0 - p.hp;
    // Kill him.
    o.takeHit({ damage: 99999, poise: 0, dir: f.clone().negate(), at: o.center.clone(), crit: true, source: 'melee' });
    await new Promise((r) => setTimeout(r, 300));
    const ids = p.equip.items.map((i: any) => i.def.id);
    return { melee, ranged, sawArrow, bossDead: g.realm.progress.bossDead, tusk: ids.includes('warlordTusk'), odachi: ids.includes('orcOdachi'), portal: inst.interactables.some((i: any) => i.label().includes('portal')) };
  });
  expect(res.melee).toBeGreaterThan(0);
  expect(res.sawArrow).toBe(true);
  expect(res.ranged).toBeGreaterThan(0);
  expect(res.bossDead).toBe(true);
  expect(res.tusk).toBe(true);
  expect(res.odachi).toBe(true);
  expect(res.portal).toBe(true);
});
