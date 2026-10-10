import { test, expect } from './fixtures';

// Arms and Crafting, phases A1 and A2 (docs/design/arms-and-crafting.md §9):
// the weapon families' movesets, reach, hyper-armour, backstabs and school
// adapters; bows and crossbows, ammunition and pickups, the staff's focus.
// Waits are counted in simulation steps (window.W), not wall-clock time.

/** In-page helpers: equip an item, and a pinned target `dist` metres ahead. */
const HELPERS = `(() => {
  const g = window.__game, p = g.player;
  const equip = (id, slot = 'main') => { const it = p.equip.add(id); p.equip.equip(it.uid, slot); return it; };
  const target = (dist, kind = 'blue', hp = 9999) => {
    g.slimes.clear();
    p.yaw = Math.PI; p.lock = null;
    const s = g.slimes.spawn(kind, p.pos.x, p.pos.z - dist);
    s.update = () => {};
    s.center.set(s.position.x, s.position.y + (kind === 'blue' ? 0.9 : 0.6), s.position.z);
    s.hp = s.maxHp = hp;
    return s;
  };
  const click = async (key = 'Mouse0') => { g.input.press(key); await window.W(3); g.input.release(key); };
  return { g, p, equip, target, click };
})()`;

test('each weapon family attacks with its own clip, timing and reach', async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(async (H) => {
    const { g, p, equip, target, click } = eval(H);
    await g.arms.clips;
    const out: Record<string, unknown> = {};
    const ids: Record<string, string> = { sword: 'longsword', spear: 'ironSpear', greatsword: 'ironGreatsword', axe: 'handAxe', mace: 'flangedMace', dagger: 'ironDagger', staff: 'oakQuarterstaff' };
    const sigs = new Set<string>();
    for (const [fam, id] of Object.entries(ids)) {
      equip(id);
      const def = g.arms.runtime.actionFor('slash1') ?? null;
      const m = p.equip.model('main');
      const sig = def ? `${def.clip ?? 'proc'}|${def.dur}|${def.hit?.from}` : 'sword';
      sigs.add(sig);
      out[fam] = { reach: +(m.userData.bladeTip).toFixed(2), sig };
    }
    out.distinct = sigs.size;
    // The spear reaches a target 2.7 m away; the dagger does not.
    const hits: Record<string, number> = {};
    for (const id of ['ironSpear', 'ironDagger']) {
      equip(id);
      const s = target(2.7);
      await window.W(20);
      const hp0 = s.hp;
      await click();
      await window.W(80);
      hits[id] = hp0 - s.hp;
    }
    out.hits = hits;
    // A two-handed weapon empties the off hand.
    equip('longsword'); equip('roundShield', 'off');
    const hadShield = p.equip.hasShield;
    equip('ironGreatsword');
    out.shieldAfter2h = { hadShield, now: p.equip.hasShield };
    return out;
  }, HELPERS);
  expect(res.distinct).toBe(7); // the sword plus six melee families, each its own
  const reach = (k: string) => (res[k] as { reach: number }).reach;
  expect(reach('spear')).toBeGreaterThan(reach('greatsword'));
  expect(reach('greatsword')).toBeGreaterThan(reach('dagger'));
  expect((res.hits as Record<string, number>).ironSpear).toBeGreaterThan(0);
  expect((res.hits as Record<string, number>).ironDagger).toBe(0);
  expect(res.shieldAfter2h).toEqual({ hadShield: true, now: false });
  expect(game.errors).toEqual([]);
});

test("a greatsword's heavy has hyper-armour from the first frame; a sword's does not", async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(async (H) => {
    const { g, p, equip } = eval(H);
    await g.arms.clips;
    const out: Record<string, string> = {};
    for (const id of ['longsword', 'ironGreatsword']) {
      equip(id);
      g.slimes.clear();
      await window.W(10);
      g.input.press('Mouse0');
      for (let i = 0; i < 200 && p.act?.def.id !== 'heavy'; i++) await window.W(1);
      await window.W(4);
      // A heavy blow early in the wind-up, before the swing itself.
      const from = p.pos.clone().add(p.forward.multiplyScalar(1.2));
      p.receiveAttack({ damage: 5, from, parryable: false, poise: 999 });
      out[id] = p.act?.def.id ?? 'none';
      g.input.release('Mouse0');
      await window.W(120);
      p.hp = p.maxHp;
    }
    return out;
  }, HELPERS);
  expect(res.longsword).toBe('stagger');
  expect(res.ironGreatsword).toBe('heavy');
});

test('daggers strike from behind for double damage', async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(async (H) => {
    const { g, p, equip, target, click } = eval(H);
    await g.arms.clips;
    const one = async (away: boolean) => {
      equip('ironDagger');
      const s = target(1.1, 'green');
      s.yaw = away ? Math.PI : 0; // a wolf facing away from (or toward) the player
      await window.W(20);
      const hp0 = s.hp;
      p.mods.crit = 0;
      await click();
      await window.W(80);
      return hp0 - s.hp;
    };
    const front = await one(false), back = await one(true);
    return { front, back, backstabs: g.arms.runtime.stats.backstabs };
  }, HELPERS);
  expect(res.front).toBeGreaterThan(0);
  expect(res.backstabs).toBeGreaterThan(0);
  expect(res.back).toBeGreaterThan(res.front * 1.5);
});

test('each school adapter changes its number: Gale Flow, the Boundary zone, Cross openings', async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(async (H) => {
    const { g, p, equip, target, click } = eval(H);
    await g.arms.clips;
    const rt = g.skillRt, P = p.paths;
    // Gale: Flow from one hit with a sword, then with a greatsword (worth two).
    const flowFor = async (id: string, dist: number) => {
      equip(id);
      target(dist, 'blue');
      await window.W(20);
      rt.flow = 0;
      await click();
      for (let i = 0; i < 120 && rt.flow === 0; i++) await window.W(1);
      await window.W(4);
      return rt.flow;
    };
    const gale = { sword: await flowFor('longsword', 1.6), greatsword: await flowFor('ironGreatsword', 1.8), dagger: await flowFor('ironDagger', 1.1) };
    // Boundary: the spear's zone is 40% wider, and an enemy who walks into it is intercepted.
    P.lv.boundary = Math.max(P.lv.boundary, 1);
    P.setActive('boundary');
    const zone = { sword: 0, spear: 0, intercepts: 0 };
    equip('longsword');
    zone.sword = g.arms.runtime.zoneRadius();
    equip('ironSpear');
    zone.spear = g.arms.runtime.zoneRadius();
    const i0 = g.arms.runtime.stats.zoneIntercepts;
    g.input.press('Mouse2');
    await window.W(10);
    target(3.0, 'green');
    await window.W(30);
    g.input.release('Mouse2');
    zone.intercepts = g.arms.runtime.stats.zoneIntercepts - i0;
    // Cross: after a parry the next blow is an opening, its size set by the family.
    P.lv.cross = Math.max(P.lv.cross, 1);
    P.setActive('cross');
    const opening = (id: string) => {
      equip(id);
      g.events.emit('parrySuccess', { at: p.center });
      return g.arms.runtime.takeOpening()?.mult ?? 0;
    };
    const cross = { sword: opening('longsword'), dagger: opening('ironDagger'), greatsword: opening('ironGreatsword') };
    P.setActive('gale');
    return { gale, zone, cross };
  }, HELPERS);
  expect(res.gale.sword).toBeCloseTo(1, 5);
  expect(res.gale.greatsword).toBeCloseTo(2, 5);
  expect(res.gale.dagger).toBeCloseTo(1.4, 5);
  expect(res.zone.spear).toBeCloseTo(res.zone.sword * 1.4, 5);
  expect(res.zone.intercepts).toBeGreaterThan(0);
  expect(res.cross.sword).toBeCloseTo(1.3, 5);
  expect(res.cross.dagger).toBeCloseTo(2, 5);
  expect(res.cross.greatsword).toBeCloseTo(1.6, 5);
});

test('the new families are for sale at Fröst\'s forge and Ragna\'s stall', async ({ game }) => {
  const { page } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game;
    const froest = g.town.npcs.find((n: any) => n.spec.id === 'froest').spec;
    g.town.talk(froest, froest.greeting, true);
    const opt = g.dialogue.options.find((o: any) => /Browse Fr/.test(o.label));
    opt.run();
    const stock = (g.town.shopUI as any).opts.stock.map((s: [string, number]) => s[0]);
    g.town.shopUI.close();
    return { stock };
  });
  for (const id of ['ironSpear', 'ironGreatsword', 'handAxe', 'flangedMace', 'ironDagger', 'huntingBow', 'arrowIron', 'longsword']) expect(res.stock).toContain(id);
});
