import { test, expect } from './fixtures';

// The rest of the classes plan (docs/design/classes.md): mastery quests and
// mentors' keepsakes, the Ascension ceremony, townsfolk who notice your class,
// guild jobs that suit a class, and the Loadout.

test('a mastery quest opens at level 20, counts kills with the class, and gives the mentor\'s keepsake', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, P = g.player.paths, W = (window as any).waitSteps;
    const { ITEMS } = await import('/src/items/itemDefs.ts');
    P.setLevelFromRenown('gale', 19);
    P.setActive('gale');
    const before = g.quests.status('mastery-gale');
    P.setLevelFromRenown('gale', 20);
    const offered = g.quests.status('mastery-gale');
    g.quests.accept('mastery-gale');
    for (let i = 0; i < 30; i++) g.events.emit('enemyDied', { at: g.player.pos.clone(), enemyId: 900000 + i, kind: 'wolf' });
    await W(3);
    const stage = g.quests.state['mastery-gale']?.stage;
    const opts = g.quests.options('kaela', () => {}, () => {});
    opts.find((o: any) => o.label === 'It is done.')?.run();
    await W(5);
    const count = g.player.equip.items.filter((it: any) => it.def.id === 'keepsake_gale').length;
    return { before, offered, stage, done: g.quests.isDone('mastery-gale'), count, name: ITEMS.keepsake_gale?.name, ranger: !!ITEMS.keepsake_ranger, teacher: ITEMS.keepsake_swordsaint?.name };
  });
  expect(res.before).toBe('locked');
  expect(res.offered).toBe('available');
  expect(res.stage).toBe(1);
  expect(res.done).toBe(true);
  expect(res.count).toBe(1);
  expect(res.name).toBe("Kaela's Token of the Gale Style");
  expect(res.ranger).toBe(true);
  expect(res.teacher).toBe("The Blind Swordswoman's Token of the Sword Saint");
  expect(errors).toEqual([]);
});

test('the Ascension is a ceremony with the mentor', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, P = g.player.paths;
    const { mentorOptions } = await import('/src/paths/mentors.ts');
    P.setLevelFromRenown('gale', 31);
    const said: string[] = [];
    const opts = mentorOptions(P, { id: 'kaela' }, (t: string) => said.push(t), () => {});
    const labels = opts.map((o: any) => o.label);
    opts.find((o: any) => o.label === 'I am ready to ascend in Gale Style.')?.run();
    opts.find((o: any) => o.label === 'Ascend: Still Blade.')?.run();
    // The Skills screen sends you to the mentor instead of a button.
    g.skills.show('gale');
    const panel = document.querySelector('.sk-panel')?.textContent ?? '';
    g.skills.toggle(false);
    P.setLevelFromRenown('cross', 31);
    g.skills.show('cross');
    const crossPanel = document.querySelector('.sk-panel')?.textContent ?? '';
    const buttons = document.querySelectorAll('[data-ascend]').length;
    g.skills.toggle(false);
    return { labels, said: said.join(' '), asc: P.ascension('gale'), panel: /Ascension: Still Blade/.test(panel), goTo: /Go to Ilse/.test(crossPanel), buttons };
  });
  expect(res.labels).toContain('Ascend: Tempest.');
  expect(res.labels).toContain('Ascend: Still Blade.');
  expect(res.said).toMatch(/Tempest/);
  expect(res.asc).toBe(1);
  expect(res.panel).toBe(true);
  expect(res.goTo).toBe(true);
  expect(res.buttons).toBe(0);
  expect(errors).toEqual([]);
});

test('townsfolk notice your class, guild jobs suit some classes, and the Loadout changes at a Registrar', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, P = g.player.paths, G = g.town.guild;
    const { classRemark } = await import('/src/npc/classRemarks.ts');
    const { makeContract, HALLS, seeded } = await import('/src/guild/contracts.ts');
    P.setLevelFromRenown('ranger', 5);
    P.setLevelFromRenown('lancer', 5);
    P.setActive('ranger');
    // Some days, some people remark on how you fight.
    const remarks = Array.from({ length: 30 }, (_, d) => classRemark('lyssa', 'ranger', d)).filter(Boolean);
    // A hunt of beasts suits a Ranger, and pays a quarter more for one.
    let spec: any = null;
    for (let s = 1; s < 400 && !spec; s++) {
      const c = makeContract(HALLS.glen, 0, 1, seeded(s));
      if (c.kind === 'hunt' && c.targetFamily === 'beast' && c.suits?.includes('ranger')) spec = c;
    }
    const fits = G.classFits(spec.suits);
    const gold0 = g.player.prog.gold;
    G.complete({ id: 'guild-x', templateId: 'glen:hunt', title: 't', description: '', objective: 'hunt', progress: 0, rewardGold: 100, rewardXp: 0, rewardRep: 0, minRank: 0, suits: spec.suits });
    const paid = g.player.prog.gold - gold0;
    // The Loadout: read-only on its own, changeable at a Registrar's desk.
    g.skills.setTab('load');
    g.skills.toggle(true);
    const locked = document.querySelectorAll('[data-primary]').length;
    g.skills.toggle(false);
    g.skills.showLoadout();
    (document.querySelector('[data-primary="lancer"]') as HTMLElement)?.click();
    const active = P.active;
    (document.querySelector('[data-second2="ranger"]') as HTMLElement)?.click();
    g.skills.toggle(false);
    return { remarks: remarks.length, sample: remarks[0], fits, paid, locked, active, second: P.secondary };
  });
  expect(res.remarks).toBeGreaterThan(3);
  expect(res.fits).toBe('Ranger');
  expect(res.paid).toBe(125);
  expect(res.locked).toBe(0);
  expect(res.active).toBe('lancer');
  expect(res.second).toBe('ranger');
  expect(errors).toEqual([]);
});
