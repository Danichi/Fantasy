import { test, expect, type Page } from '@playwright/test';

// End-to-end checks driven through the window.__game debug hook (?test mode:
// no title overlay, no slime spawner, pointer lock not required).

async function boot(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/?test');
  await page.waitForFunction(() => (window as any).__game?.steps > 60, null, { timeout: 90_000 });
  return errors;
}

const wait = (page: Page, ms: number) => page.waitForTimeout(ms);

test('player moves with WASD', async ({ page }) => {
  const errors = await boot(page);
  const start = await page.evaluate(() => (window as any).__game.player.pos.toArray());
  await page.evaluate(() => (window as any).__game.input.press('KeyW'));
  await wait(page, 1500);
  await page.evaluate(() => (window as any).__game.input.release('KeyW'));
  const end = await page.evaluate(() => (window as any).__game.player.pos.toArray());
  const moved = Math.hypot(end[0] - start[0], end[2] - start[2]);
  expect(moved).toBeGreaterThan(1.5);
  expect(errors).toEqual([]);
});

test('sword swing damages a slime', async ({ page }) => {
  await boot(page);
  const hp = await page.evaluate(async () => {
    const g = (window as any).__game;
    const p = g.player;
    const s = g.slimes.spawn('blue', p.pos.x, p.pos.z - 1.5);
    p.yaw = Math.PI;
    await new Promise((r) => setTimeout(r, 300));
    const before = s.hp;
    g.input.press('Mouse0');
    await new Promise((r) => setTimeout(r, 50));
    g.input.release('Mouse0');
    await new Promise((r) => setTimeout(r, 900));
    return { before, after: s.hp };
  });
  expect(hp.after).toBeLessThan(hp.before);
});

test('parry staggers a leaping slime', async ({ page }) => {
  await boot(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game;
    const p = g.player;
    const s = g.slimes.spawn('green', p.pos.x, p.pos.z - 2.5);
    p.yaw = Math.PI;
    // Wait for the slime to start its leap, then parry.
    for (let i = 0; i < 300 && s.state !== 'leap'; i++) await new Promise((r) => setTimeout(r, 10));
    // React as the slime closes in, like a player timing the impact.
    for (let i = 0; i < 100 && s.center.distanceTo(p.center) > 1.9; i++) await new Promise((r) => setTimeout(r, 5));
    g.input.press('KeyF');
    await new Promise((r) => setTimeout(r, 30));
    g.input.release('KeyF');
    for (let i = 0; i < 60 && s.state === 'leap'; i++) await new Promise((r) => setTimeout(r, 20));
    return { state: s.state, stunned: s.stunned, hp: p.hp, max: p.maxHp };
  });
  expect(res.state).toBe('stunned');
  expect(res.stunned).toBe(true);
  expect(res.hp).toBe(res.max);
});

test('blocking drains stamina instead of health', async ({ page }) => {
  await boot(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game;
    const p = g.player;
    g.input.press('Mouse2');
    await new Promise((r) => setTimeout(r, 400));
    const st0 = p.stamina, hp0 = p.hp;
    const from = p.pos.clone().add(p.forward.multiplyScalar(1.5));
    const result = p.receiveAttack({ damage: 20, from, parryable: true, poise: 30 });
    g.input.release('Mouse2');
    return { result, dSt: st0 - p.stamina, dHp: hp0 - p.hp };
  });
  expect(res.result).toBe('blocked');
  expect(res.dSt).toBeGreaterThan(5);
  expect(res.dHp).toBeLessThan(5);
});

test('fireball spends mana and hits', async ({ page }) => {
  await boot(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game;
    const p = g.player;
    const s = g.slimes.spawn('green', p.pos.x, p.pos.z - 7);
    p.yaw = Math.PI;
    g.cam.yaw = Math.PI;
    await new Promise((r) => setTimeout(r, 200));
    // Offensive spells need a lock-on target.
    g.input.press('Mouse1');
    await new Promise((r) => setTimeout(r, 40));
    g.input.release('Mouse1');
    await new Promise((r) => setTimeout(r, 100));
    const m0 = p.mana, hp0 = s.hp;
    g.input.press('KeyR');
    await new Promise((r) => setTimeout(r, 40));
    g.input.release('KeyR');
    await new Promise((r) => setTimeout(r, 1800));
    return { dMana: m0 - p.mana, hit: s.hp < hp0 || !s.alive };
  });
  expect(res.dMana).toBeGreaterThan(10);
  expect(res.hit).toBe(true);
});

test('equipping swaps the weapon model in the hand, and accessories apply bonuses', async ({ page }) => {
  await boot(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game;
    const eq = g.player.equip;
    const before = eq.model('main')?.userData.itemUid;
    eq.equip(eq.items.find((i: any) => i.def.id === 'armingSword').uid, 'main');
    await new Promise((r) => setTimeout(r, 100));
    const after = eq.model('main')?.userData.itemUid;
    const socket = g.player.rig.hands.Right.socket;
    const hp0 = g.player.maxHp;
    eq.equip(eq.items.find((i: any) => i.def.id === 'garnetAmulet').uid);
    return { before, after, inSocket: socket.children.some((c: any) => c.userData.itemUid === after), dMaxHp: g.player.maxHp - hp0 };
  });
  expect(res.after).not.toBe(res.before);
  expect(res.inSocket).toBe(true);
  expect(res.dMaxHp).toBe(25);
});

test('rocks block the player', async ({ page }) => {
  await boot(page);
  const z = await page.evaluate(async () => {
    const g = (window as any).__game;
    // Stand south of the boulder at (-40, 112) and run north into it.
    const h = g.player.pos.y;
    g.player.teleport(new g.THREE.Vector3(-40, h + 3, 122));
    await new Promise((r) => setTimeout(r, 800));
    g.cam.yaw = Math.PI;
    g.input.press('KeyW');
    await new Promise((r) => setTimeout(r, 3000));
    g.input.release('KeyW');
    return g.player.pos.z;
  });
  // Without collision we'd run straight through to z < 108.
  expect(z).toBeGreaterThan(112);
});

test('dual wield: off-hand attack and equip armour', async ({ page }) => {
  await boot(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game;
    const eq = g.player.equip;
    const swords = eq.items.filter((i: any) => i.def.id === 'armingSword');
    eq.equip(swords[0].uid, 'main');
    eq.equip(swords[1].uid, 'off');
    for (const id of ['ironHelm', 'breastplate', 'pauldrons', 'gauntlets', 'greaves', 'sabatons']) {
      eq.equip(eq.items.find((i: any) => i.def.id === id).uid);
    }
    g.input.press('Mouse2');
    await new Promise((r) => setTimeout(r, 60));
    g.input.release('Mouse2');
    await new Promise((r) => setTimeout(r, 100));
    return { dual: eq.dualWield, act: g.player.act?.def.id, armor: eq.armorValue };
  });
  expect(res.dual).toBe(true);
  expect(res.act).toBe('offslash1');
  expect(res.armor).toBeGreaterThan(15);
});

test('offensive spells refuse to cast without a lock-on', async ({ page }) => {
  await boot(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game;
    const p = g.player;
    g.slimes.spawn('green', p.pos.x, p.pos.z - 7);
    const m0 = p.mana;
    g.input.press('KeyR');
    await new Promise((r) => setTimeout(r, 40));
    g.input.release('KeyR');
    await new Promise((r) => setTimeout(r, 600));
    return { dMana: m0 - p.mana, toast: document.querySelector('.toast')?.textContent ?? '' };
  });
  expect(res.dMana).toBeLessThan(1);
  expect(res.toast).toContain('Lock on');
});
