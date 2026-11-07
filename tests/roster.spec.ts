import { test, expect } from './fixtures';

// The class roster (paths/roster, docs/design/classes.md): every class's tree
// is complete and every node does something written for it; mechanics build,
// mark and release; mentors set trials and teach.

test('every roster class is complete: tree, techniques, written passives, Ascensions', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const { ROSTER } = await import('/src/paths/roster/index.ts');
    const { treeOf } = await import('/src/paths/paths.ts');
    const { DISC } = await import('/src/paths/data.ts');
    const { PASSIVES } = await import('/src/paths/effects.ts');
    const { SKILLS } = await import('/src/paths/skills.ts');
    const { ASCENSIONS } = await import('/src/paths/ascensions.ts');
    const bad: string[] = [];
    const g = (window as any).__game;
    const ids = new Set([...g.npcs.npcs.map((n: any) => n.rec.id), ...(g.town.npcs ?? []).map((n: any) => n.spec?.id)]);
    for (const s of ROSTER) {
      const d = DISC[s.id];
      if (!d) { bad.push(`${s.id}: no discipline`); continue; }
      const t = treeOf(d);
      if (!t) { bad.push(`${s.id}: no tree`); continue; }
      if (!PASSIVES[`${s.id}:${t.nodes[0].name}`]) bad.push(`${s.id}: no core passive`);
      for (const n of t.nodes) {
        if (n.type === 'center') continue;
        const names = n.type === 'choice' ? n.name.split('|') : [n.name];
        for (const nm of names) {
          const key = `${s.id}:${nm}`;
          if (n.type === 'active' || n.type === 'cap') { if (!SKILLS[key]) bad.push(`${key}: no technique`); }
          else if (!PASSIVES[key]) bad.push(`${key}: no passive`);
        }
      }
      if (!ASCENSIONS[s.id]) bad.push(`${s.id}: no Ascensions`);
      // Every node name once per tree (a passive is keyed by its name).
      const names = t.nodes.flatMap((n: any) => (n.type === 'choice' ? n.name.split('|') : [n.name]));
      const dup = names.filter((x: string, i: number) => names.indexOf(x) !== i);
      if (dup.length) bad.push(`${s.id}: repeated ${dup.join(', ')}`);
      // The mentor or teacher is somebody in the world.
      if (s.mentorNpc && !ids.has(s.mentorNpc)) bad.push(`${s.id}: mentor ${s.mentorNpc} is nowhere`);
    }
    return { n: ROSTER.length, bad };
  });
  expect(res.bad).toEqual([]);
  expect(res.n).toBeGreaterThanOrEqual(52);
  expect(errors).toEqual([]);
});

test('Ranger: arrows build Tension and lay Quarry; a full draw looses a Hail of Arrows', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, rt = g.skillRt, P = g.player.paths, pl = g.player, W = (window as any).waitSteps;
    P.setLevelFromRenown('ranger', 5);
    P.setActive('ranger');
    pl.equip.equip(pl.equip.add('huntingBow').uid, 'main');
    rt.recompute();
    const s = g.slimes.spawn('blue', pl.pos.x + 4, pl.pos.z + 4);
    s.hp = s.maxHp = 5000;
    await W(3);
    g.events.emit('shotHit', { target: s, amount: 10 });
    g.events.emit('shotHit', { target: s, amount: 10 });
    const tension = rt.roster.value('ranger');
    const quarry = rt.statusOf(s)?.marks?.ranger?.n;
    rt.roster.set('ranger', 100);
    const ready = rt.roster.ready('ranger');
    const hp0 = s.hp;
    g.events.emit('shotHit', { target: s, amount: 10 });
    await W(40);
    const bars = rt.resources().map((r: any) => r.name);
    return { tension, quarry, ready, after: rt.roster.value('ranger'), hurt: hp0 - s.hp, bars, wield: pl.equip.mainWeapon?.def.kind };
  });
  expect(res.wield).toBe('bow');
  expect(res.tension).toBe(24);
  expect(res.quarry).toBe(2);
  expect(res.ready).toBe(true);
  expect(res.after).toBe(0);
  expect(res.hurt).toBeGreaterThan(5);
  expect(res.bars).toContain('TENSION');
  expect(errors).toEqual([]);
});

test('Earthshaper: its techniques build Stone and lay Tremor; Brawler fights bare-handed', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, rt = g.skillRt, P = g.player.paths, pl = g.player, W = (window as any).waitSteps;
    P.setLevelFromRenown('earthshaper', 5);
    P.setLevelFromRenown('brawler', 5);
    P.setActive('brawler');
    rt.recompute();
    const s = g.slimes.spawn('blue', pl.pos.x + 4, pl.pos.z + 4);
    s.hp = s.maxHp = 5000;
    await W(3);
    rt.roster.set('earthshaper', 0);
    rt.hit(s, 5, { disc: 'earthshaper', school: 'earth' });
    rt.hit(s, 5, { disc: 'earthshaper', school: 'earth' });
    const stone = rt.roster.value('earthshaper'), tremor = rt.statusOf(s)?.marks?.earthshaper?.n;
    // Bare hands: unequip and see the Brawler may attack.
    const w = pl.equip.mainWeapon;
    if (w) pl.equip.unequip?.('main');
    const fists = pl.canFightUnarmed?.() && pl.fistDamage?.() > 10;
    g.events.emit('meleeHit', { target: s, amount: 10, crit: false, action: 'slash1' });
    g.events.emit('meleeHit', { target: s, amount: 10, crit: true, action: 'slash2' });
    return { stone, tremor, fists, combo: rt.roster.value('brawler'), noWeapon: !pl.equip.mainWeapon };
  });
  expect(res.stone).toBe(16);
  expect(res.tremor).toBe(2);
  expect(res.fists).toBe(true);
  expect(res.noWeapon).toBe(true);
  expect(res.combo).toBe(3);
  expect(errors).toEqual([]);
});

test('a mentor sets the trial, it counts with the right weapon, and teaches the class', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, P = g.player.paths, pl = g.player, W = (window as any).waitSteps;
    const { mentorOptions } = await import('/src/paths/mentors.ts');
    const said: string[] = [];
    const trials = { status: (id: string) => g.quests.status(id), accept: (id: string) => g.quests.accept(id), offer: (id: string) => g.quests.defs.get(id)?.offer ?? '', note: () => '' };
    const opts = mentorOptions(P, { id: 'lyssa' }, (t: string) => said.push(t), () => {}, trials);
    opts.find((o: any) => o.label === 'Teach me Ranger.')?.run();
    const accepted = g.quests.status('trial-ranger');
    pl.equip.equip(pl.equip.add('huntingBow').uid, 'main');
    const s = g.slimes.spawn('blue', pl.pos.x + 4, pl.pos.z + 4);
    s.hp = s.maxHp = 5000;
    await W(3);
    for (let i = 0; i < 15; i++) g.events.emit('shotHit', { target: s, amount: 1 });
    await W(3);
    const st = g.quests.state['trial-ranger'];
    return { accepted, stage: st?.stage, said: said[0]?.slice(0, 20) };
  });
  expect(res.accepted).toBe('active');
  expect(res.stage).toBe(1);
  expect(errors).toEqual([]);
});

test('hidden classes: a gateway reveals its teacher, who then teaches; hybrids need both classes; origin classes wake in the blood', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, P = g.player.paths, W = (window as any).waitSteps;
    const { treeOf } = await import('/src/paths/paths.ts');
    const { DISC } = await import('/src/paths/data.ts');
    const { mentorOptions } = await import('/src/paths/mentors.ts');
    // Open Pyromancer's Sunbreaker gateway the proper way.
    P.teach('pyromancer');
    P.lv.pyromancer = 25;
    g.player.prog.addXp(999999);
    const tree = treeOf(DISC.pyromancer);
    const cap = tree.nodes.find((n: any) => n.type === 'cap' && DISC.pyromancer.branches[n.branch].gate === 'sunbreaker');
    for (const n of tree.nodes) if (n.branch === cap.branch && n.type !== 'cap') P.nodes.pyromancer[n.id] = n.type === 'choice' ? { r: 1, pick: 0 } : { r: 1 };
    const before = P.canTeach('sunbreaker');
    const learned = P.learn('pyromancer', cap);
    await W(3);
    const flag = !!g.worldFlags['teacher:sunbreaker'];
    const marked = g.worldMap.siteMarkers().some((m: any) => /Sunbreaker/.test(m.label ?? ''));
    const notTaughtYet = !P.learned('sunbreaker');
    const opts = mentorOptions(P, { id: 'ht-sunbreaker' }, () => {}, () => {});
    opts.find((o: any) => o.label === 'Teach me Sunbreaker.')?.run();
    await W(3);
    // A hybrid needs both of its classes.
    P.setLevelFromRenown('ranger', 15);
    const oneOnly = P.canTeach('beastmaster'), why = P.teachWhyNot('beastmaster');
    P.setLevelFromRenown('druid', 15);
    const both = P.canTeach('beastmaster');
    // An origin class: only for its people, and only when the legend has grown.
    const human = P.canTeach('dragonheart');
    g.player.prog.origin = 'dragonkin';
    P.setLevelFromRenown('legendaryHero', 2);
    await W(150);
    return { before, learned, flag, marked, notTaughtYet, taught: P.learned('sunbreaker'), oneOnly, why, both, human, woke: P.learned('dragonheart') };
  });
  expect(res.before).toBe(false);
  expect(res.learned).toBe(true);
  expect(res.flag).toBe(true);
  expect(res.marked).toBe(true);
  expect(res.notTaughtYet).toBe(true);
  expect(res.taught).toBe(true);
  expect(res.oneOnly).toBe(false);
  expect(res.why).toMatch(/Druid at level 15/);
  expect(res.both).toBe(true);
  expect(res.human).toBe(false);
  expect(res.woke).toBe(true);
  expect(errors).toEqual([]);
});
