import { test, expect } from './fixtures';

// The mapping update (docs/design/mapping.md): walking only sketches the map;
// ink comes from map pieces, charts, surveys and towns. Guild walls show
// rumours that are not on your map until you copy them across.

test('walking sketches, pieces ink; a full region gives a Full Chart', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, T = g.THREE, D = g.discovery, C = g.carto;
    const { heightAt } = await import('/src/world/terrainHeight.ts' as string);
    const count = (bits: Uint8Array) => { let n = 0; for (const b of bits) for (let v = b; v; v &= v - 1) n++; return n; };
    D.classic = false;
    // Out in open country, away from any town.
    const ink0 = count(D.ink), sk0 = count(D.cells);
    for (const [x, z] of [[1700, -400], [1900, -400]]) {
      g.player.teleport(new T.Vector3(x, heightAt(x, z) + 0.5, z));
      await new Promise((r) => setTimeout(r, 1500));
    }
    const ink1 = count(D.ink), sk1 = count(D.cells);
    // Read every piece of Cresha.
    const patches = C.patches().filter((p: any) => p.region === 'cresha');
    const flags0 = !!g.carto['d'].flags['chart:cresha'];
    for (const p of patches) C.read({ id: p.id, use: { kind: 'map' } });
    const inkedAll = D.explored('cresha', 'ink');
    const hasChart = g.player.equip.items.some((it: any) => it.def.id === 'fullChart_cresha');
    return { ink0, ink1, sk0, sk1, pieces: patches.length, flags0, inkedAll, hasChart, chartFlag: !!g.carto['d'].flags['chart:cresha'] };
  });
  expect(res.sk1).toBeGreaterThan(res.sk0); // walking sketched
  expect(res.ink1 - res.ink0).toBeLessThan((res.sk1 - res.sk0) / 4); // but barely inked
  expect(res.pieces).toBe(7);
  expect(res.flags0).toBe(false);
  expect(res.inkedAll).toBeGreaterThan(0.95);
  expect(res.chartFlag).toBe(true);
  expect(res.hasChart).toBe(true);
  expect(errors).toEqual([]);
});

test('every piece is somewhere: the shop, a boss hoard or a cache; caches give their piece once', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, T = g.THREE, C = g.carto;
    const { heightAt } = await import('/src/world/terrainHeight.ts' as string);
    const { REGION_PIECES } = await import('/src/items/mapItems.ts' as string);
    const all = new Set<string>();
    for (const [r, n] of Object.entries(REGION_PIECES) as [string, number][]) for (let i = 1; i <= n; i++) all.add(`mapPiece_${r}_${i}`);
    const placed = new Set<string>([...C.shopPiece.values(), ...C.bossPiece.values(), ...C.caches.flatMap((c: any) => c.items)]);
    const missing = [...all].filter((id) => !placed.has(id));
    // Walk to the first cache and search it.
    const c = C.caches[0];
    const has = (id: string) => g.player.equip.items.some((it: any) => it.def.id === id);
    g.player.teleport(new T.Vector3(c.x + 1, heightAt(c.x + 1, c.z) + 0.5, c.z));
    g.stepSim(60);
    const label = C.interactable.label();
    C.interactable.action();
    const got = c.items.every((id: string) => has(id));
    const again = C.interactable.enabled();
    return { missing, caches: C.caches.length, treasures: C.treasures.filter((t: any) => t.region).length, label, got, again };
  });
  expect(res.missing).toEqual([]);
  expect(res.caches).toBeGreaterThan(40);
  expect(res.treasures).toBe(25);
  expect(res.label).not.toBe('');
  expect(res.got).toBe(true);
  expect(res.again).toBe(false);
  expect(errors).toEqual([]);
});

test('the guild wall: a rumour is only on your map once you buy or copy it; finding the beast snaps it to a skull', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, C = g.carto, D = g.discovery;
    const marks0 = D.marks.length;
    const wall = C.wallMarks();
    const rumour = wall.find((m: any) => m.kind === 'rumour');
    g.player.prog.gold = 500;
    C.openWall('cresha', 'Cresha Guild Hall');
    const paper = g.worldMap.papers().find((p: any) => p.id.startsWith('guild:'));
    const err = paper.buy(rumour.id);
    const copied = D.marks.find((m: any) => m.rumour === rumour.id);
    g.worldMap.toggle(false);
    const after = g.worldMap.papers().some((p: any) => p.id.startsWith('guild:'));
    // Pretend the beast was found: the mark snaps.
    const bossId = rumour.id.slice(5);
    const b0 = C['d'].bosses().find((b: any) => b.id === bossId);
    const real = C['d'].bosses;
    C['d'].bosses = () => real().map((b: any) => (b.id === bossId ? { ...b, found: true } : b));
    C['checkMarks'](g.player.pos);
    C['d'].bosses = real;
    const fee = C.unreported();
    const gold0 = g.player.prog.gold;
    const n = C.reportFinds();
    return { marks0, wallN: wall.length, err, kind0: 'rumour', copied: !!copied, kind1: copied?.kind, glyph: copied?.glyph, at: copied && Math.hypot(copied.x - b0.x, copied.z - b0.z), after, fee, n, paid: g.player.prog.gold - gold0, gold: gold0 };
  });
  expect(res.wallN).toBeGreaterThan(0);
  expect(res.err).toBe(null);
  expect(res.copied).toBe(true);
  expect(res.after).toBe(false);
  expect(res.kind1).toBe('pin');
  expect(res.glyph).toBe('skull');
  expect(res.at).toBeLessThan(1);
  expect(res.fee).toBe(1);
  expect(res.n).toBe(1);
  expect(res.paid).toBe(80);
  expect(errors).toEqual([]);
});

test('marks you draw save and load; an old chart has errors you strike out by going there', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, T = g.THREE, D = g.discovery, C = g.carto;
    const { heightAt } = await import('/src/world/terrainHeight.ts' as string);
    D.addMark({ kind: 'note', x: 1000, z: 200, text: 'good fishing' });
    D.addMark({ kind: 'circle', x: 1200, z: 300, r: 80, color: '#2a5' });
    const json = JSON.parse(JSON.stringify(D.toJSON()));
    const n0 = D.marks.length;
    D.marks.length = 0;
    D.fromJSON(json);
    const n1 = D.marks.length;
    C.read({ id: 'oldChart_cresha', use: { kind: 'map' } });
    const err = D.marks.find((m: any) => m.err);
    let struck = null;
    if (err) {
      g.player.teleport(new T.Vector3(err.x, heightAt(err.x, err.z) + 0.5, err.z));
      g.stepSim(60);
      struck = err.struck;
    }
    return { n0, n1, note: D.marks.some((m: any) => m.text === 'good fishing'), hasErr: !!err, struck };
  });
  expect(res.n1).toBe(res.n0);
  expect(res.note).toBe(true);
  expect(res.hasErr).toBe(true);
  expect(res.struck).toBe(true);
  expect(errors).toEqual([]);
});

test('dungeon plans: pieces lie on the floors, read ones lay brown walls over your map (a few wrong), notes pin where found', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, R = g.realm, M = g.mapUI;
    await R.enter(1, 'entrance');
    const before = M.plan;
    const finds = R.interactables.filter((i: any) => /torn plan|grimy page/.test(i.label()));
    const labels = finds.map((f: any) => f.label());
    // Pick them all up, then read them.
    const bag0 = g.player.equip.items.map((it: any) => it.def.id);
    for (const f of finds) f.action();
    const got = g.player.equip.items.map((it: any) => it.def.id).filter((id: string) => !bag0.includes(id) && /floorPlan_|delverNote_/.test(id));
    const again = R.interactables.filter((i: any) => /torn plan|grimy page/.test(i.label())).length;
    for (const id of got) g.player.onConsume({ id, use: { kind: id.startsWith('delverNote_') ? 'note' : 'plan' } });
    const plan = M.plan;
    const shown = plan ? plan.fill.reduce((a: number, b: number) => a + b, 0) : 0;
    const total = plan ? plan.fill.length : 0;
    const notes = g.realm.maps[g.realm.mapKey(1)].notes.length;
    // The guild's plan: the whole floor.
    g.player.onConsume({ id: 'guildPlan_crypt', use: { kind: 'plan' } });
    const all = M.plan.fill.reduce((a: number, b: number) => a + b, 0);
    const open = R.instance.fg.roomAt.filter((r: number) => r >= 0).length;
    const wrong = M.plan.wrongH.length + M.plan.wrongV.length;
    await R.leave();
    return { before, labels, got, again, shown, total, notes, all, open, wrong, afterLeave: M.plan };
  });
  expect(res.before).toBe(null);
  expect(res.labels.length).toBeGreaterThan(0);
  expect(res.got.length).toBe(res.labels.length);
  expect(res.again).toBe(0);
  expect(res.shown).toBeGreaterThan(0);
  expect(res.notes).toBeGreaterThanOrEqual(res.got.filter((id: string) => id.startsWith('delverNote_')).length);
  expect(res.all).toBe(res.open);
  expect(res.wrong).toBeGreaterThan(0);
  expect(res.afterLeave).toBe(null);
  expect(errors).toEqual([]);
});
