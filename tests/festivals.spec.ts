import { test, expect } from './fixtures';

// The bestiary's hunt marks, the Lost Lanterns and the calendar's festivals
// (docs/design/bestiary.md, lanterns.md, calendar.md).

test('hunt marks make you hit a kind harder, a whole family brings a charm, and the Warden\'s Rank adds health', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, B = g.bestiary;
    const { familyMembers, MARKS } = await import('/src/progression/bestiary.ts');
    B.unlock();
    const hp0 = g.player.maxHp;
    for (let i = 0; i < 50; i++) B.record('wolf');
    const wolf = B.dmgBonus('wolf');
    const mark = B.mark('wolf');
    // Every slime to the first mark: the family's page, and Rook's charm.
    const slimes = familyMembers().slime;
    for (const id of slimes) for (let i = 0; i < MARKS.common[0]; i++) B.record(id);
    const fam = B.familyDmg('slime');
    const charm = g.player.equip.items.some((it: any) => it.def.id === 'wardenCharm_slime');
    const pts = B.points(), rank = B.rank();
    return { wolf, mark, fam, charm, pts, rank, hpUp: g.player.maxHp - hp0, slimeBonus: B.dmgBonus('green') };
  });
  expect(res.mark).toBe(2);
  expect(res.wolf).toBeCloseTo(0.04, 5);
  expect(res.fam).toBeCloseTo(0.03, 5);
  expect(res.charm).toBe(true);
  expect(res.rank).toBeGreaterThanOrEqual(2);
  expect(res.hpUp).toBe(res.rank * 5);
  expect(res.slimeBonus).toBeCloseTo(0.05, 5);
  expect(errors).toEqual([]);
});

test('Lost Lanterns cover the world and the Dark, relight, are told of at the Temple, and a lit region wards you by night', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, L = g.lanterns, T = g.THREE;
    const { heightAt } = await import('/src/world/terrainHeight.ts');
    const sets = L.sets();
    // Relight the one nearest a spot in the Glen, by walking up to it.
    const s = L.spots.filter((x: any) => !x.dark && x.style === 'post' && Math.hypot(x.x, x.z) < 600)[0];
    g.player.teleport(new T.Vector3(s.x + 1.2, heightAt(s.x + 1.2, s.z) + 0.3, s.z));
    g.stepSim(40);
    const built = L.built.has(s.id);
    const near = L.interactable.enabled();
    L.interactable.action();
    const lit = L.isLit(s.id);
    // Nine more anywhere, then tell Brother Aldous.
    for (const x of L.spots.filter((x: any) => !L.isLit(x.id)).slice(0, 9)) L.lightUp(x.id);
    const hp0 = g.player.maxHp;
    let said = '';
    const opts = g.folkServices.get('aldous')((t: string) => (said = t), () => {});
    opts.find((o: any) => /Tell of the lanterns/.test(o.label))?.run();
    const hpUp = g.player.maxHp - hp0;
    // Every lantern of Port Aurelle lit: by night its foes hit softer there.
    for (const x of L.spots.filter((x: any) => x.region === 'portAurelle')) L.lightUp(x.id);
    const port = L.spots.find((x: any) => x.region === 'portAurelle');
    g.time.skipTo(23);
    const ward = L.wardAt(port.x, port.z), wardElsewhere = L.wardAt(0, 300);
    return { total: L.spots.length, dark: sets.find((x: any) => x.id === 'dark')?.total ?? 0, regions: sets.length, built, near, lit, told: L.told, said, hpUp, ward, wardElsewhere, title: L.title() };
  });
  expect(res.total).toBeGreaterThan(600);
  expect(res.dark).toBeGreaterThan(50);
  expect(res.regions).toBeGreaterThanOrEqual(18);
  expect(res.built).toBe(true);
  expect(res.near).toBe(true);
  expect(res.lit).toBe(true);
  expect(res.told).toBe(10);
  expect(res.said).toMatch(/lanterns burning again/);
  expect(res.hpUp).toBe(2);
  expect(res.title).toBe('Wick-Trimmer');
  expect(res.ward).toBeCloseTo(0.15, 5);
  expect(res.wardElsewhere).toBe(0);
  expect(errors).toEqual([]);
});

test('the calendar: seasons, festivals on their days, the Harvest Fair\'s shows, the derby, the Black Market and the vigil', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, F = g.festivals;
    const C = await import('/src/world/calendar.ts');
    const dates = [C.dateText(1), C.dateText(22), C.dateText(33), C.seasonOf(30)];
    const at = (day: number, hour: number) => {
      g.time.day = day;
      g.time.skipTo(hour);
      if (g.time.day !== day) { g.time.day = day; }
      F.update(1.1);
    };
    const run = (id: string, label: RegExp) => {
      let said = '';
      const opts = g.folkServices.get(id)((t: string) => (said = t), () => {});
      opts.find((o: any) => label.test(o.label))?.run();
      return said;
    };
    // The Harvest Fair, Harvest 6 (day 22) at noon.
    at(22, 12);
    const fairOn = F.isOn('harvestFair'), hostHere = F.absent('fe-hollis') === false, hostGone = F.absent('fe-tobiah') === true;
    g.player.equip.add('pumpkin', 1);
    const tok0 = g.player.equip.count?.('festivalToken') ?? 0;
    const produce = run('fe-hollis', /produce show/);
    const tokens = g.player.equip.items.filter((it: any) => it.def.id === 'festivalToken').reduce((n: number, it: any) => n + (it.qty ?? it.count ?? 1), 0);
    // The derby, High Sun 3 (day 11) at 8:00.
    at(11, 8);
    run('fe-tobiah', /Enter today/);
    const fish = F.derbyFish?.() ?? null;
    F.onCatch({ id: fish.id, name: fish.name, kg: fish.size[1] });
    const weigh = run('fe-tobiah', /Weigh in/);
    const medal = g.player.equip.items.some((it: any) => it.def.id === 'derbyMedalGold');
    // The Black Market, the full moon (day 8) at 22:00: a rumour of a lantern, marked on the map.
    at(8, 22);
    const marketOn = F.isOn('blackMarket');
    g.player.prog.addGold(100);
    const rumour = run('fe-jack', /rumour/);
    const hinted = Object.keys(g.worldFlags).some((k) => k.startsWith('llHint:'));
    // The Dawn Vigil, Frost 4 (day 28) at 23:00: the dead rise around the chapel.
    const { CHAPEL } = await import('/src/world/kingsRoad.ts');
    const { heightAt } = await import('/src/world/terrainHeight.ts');
    at(28, 23);
    const vigilOn = F.isOn('dawnVigil');
    g.player.teleport(new g.THREE.Vector3(CHAPEL.x + 2, heightAt(CHAPEL.x + 2, CHAPEL.z - 10) + 0.3, CHAPEL.z - 10));
    g.player.invulnerable = true;
    run('fe-maren', /Stand the vigil/);
    for (let i = 0; i < 6; i++) F.update(1);
    const risen = F.vigil?.mobs.length ?? 0;
    const up = F.upcoming(6).map((u: any) => u.f.id);
    // The Almanac stays out of sight until opened, then shows the calendar and the lanterns.
    const hiddenAtFirst = getComputedStyle(g.almanac.el).display === 'none';
    g.almanac.openTab('calendar');
    const cal = g.almanac.el.textContent;
    g.almanac.openTab('lanterns');
    const lan = g.almanac.el.textContent;
    g.almanac.toggle(false);
    return { hiddenAtFirst, cal: /Frost 4, year 1/.test(cal) && /The Harvest Fair/.test(cal), lan: /Lanternbearer|LANTERNBEARER/i.test(lan) && /The Dark/.test(lan), dates, fairOn, hostHere, hostGone, produce, tokens, tok0, weigh, medal, marketOn, rumour, hinted, vigilOn, risen, up };
  });
  expect(res.dates).toEqual(['Thaw 1, year 1', 'Harvest 6, year 1', 'Thaw 1, year 2', 'Frost']);
  expect(res.fairOn).toBe(true);
  expect(res.hostHere).toBe(true);
  expect(res.hostGone).toBe(true);
  expect(res.produce).toMatch(/ribbon|handshake/);
  expect(res.tokens).toBeGreaterThan(0);
  expect(res.weigh).toMatch(/First place/);
  expect(res.medal).toBe(true);
  expect(res.marketOn).toBe(true);
  expect(res.rumour).toMatch(/still dark/);
  expect(res.hinted).toBe(true);
  expect(res.vigilOn).toBe(true);
  expect(res.risen).toBeGreaterThan(0);
  expect(res.up.length).toBeGreaterThan(3);
  expect(res.hiddenAtFirst).toBe(true);
  expect(res.cal).toBe(true);
  expect(res.lan).toBe(true);
  expect(errors).toEqual([]);
});
