import { test, expect } from './fixtures';

// Conversations, shops, quest NPCs who keep hours, quests that must be done
// at a certain hour, shields and parries. Waits are simulation steps.

test('a click while an NPC is still talking finishes the sentence instead of choosing a reply', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, d = g.dialogue;
    let ran = 0;
    d.show('Tester', 'Talker', 'This is a long sentence that takes a good while to type itself out on the page, word by word by word.', [{ label: 'Farewell.', run: () => ran++ }]);
    const typingAtStart = d.typing;
    (document.querySelector('.dialogue .opts button') as HTMLElement).click(); // mid-sentence
    const afterFirst = { open: d.open, ran, typing: d.typing, text: document.querySelector('.dialogue .say')!.textContent };
    (document.querySelector('.dialogue .opts button') as HTMLElement).click(); // now it's a real choice
    const afterSecond = { ran };
    d.close();
    return { typingAtStart, afterFirst, afterSecond };
  });
  expect(res.typingAtStart).toBe(true);
  expect(res.afterFirst.open).toBe(true);
  expect(res.afterFirst.ran).toBe(0);
  expect(res.afterFirst.typing).toBe(false);
  expect(res.afterFirst.text).toContain('word by word by word.');
  expect(res.afterSecond.ran).toBe(1);
  expect(errors).toEqual([]);
});

test('townsfolk greet you by the hour and story, have topics, and share news', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, d = g.dialogue, W = (window as any).waitSteps;
    const kaela = g.town.npcs.find((n: any) => n.spec.id === 'kaela').spec;
    const said = () => document.querySelector('.dialogue .say')!.textContent;
    const opts = () => [...document.querySelectorAll('.dialogue .opts button')].map((b) => b.textContent!.replace(/^\d/, ''));
    const pick = async (re: RegExp) => {
      d.skip?.();
      (([...document.querySelectorAll('.dialogue .opts button')] as HTMLElement[]).find((b) => re.test(b.textContent!))!).click();
      await W(2);
      (d as any).skip();
    };
    g.town.talk(kaela);
    (d as any).skip();
    const first = { text: said(), opts: opts() };
    d.close();
    g.time.skipTo(23.2);
    g.town.talk(kaela);
    (d as any).skip();
    const night = said();
    await pick(/Let's talk/);
    const topics = opts();
    await pick(/news/);
    const news1 = said();
    await pick(/news/);
    const news2 = said();
    d.close();
    return { first, night, topics, news1, news2 };
  });
  expect(res.first.text).toContain('Feet apart');
  expect(res.first.opts.some((o: string) => o.includes("Let's talk"))).toBe(true);
  expect(res.night).toContain('late');
  expect(res.topics.length).toBeGreaterThan(4);
  expect(res.topics.some((o: string) => o.includes('news'))).toBe(true);
  expect(res.news1.length).toBeGreaterThan(30);
  expect(res.news2).not.toBe(res.news1);
  expect(errors).toEqual([]);
});

test('shops: buy five, buy and equip, sell a stack, and buy it back', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, p = g.player, ui = g.town.shopUI;
    const count = (id: string) => p.equip.items.filter((i: any) => i.def.id === id).reduce((n: number, i: any) => n + i.qty, 0);
    p.prog.addGold(2000 - p.prog.gold);
    ui.show({ speaker: 'Test', title: 'Shop', intro: 'Hello.', stock: [['healthPotion', 20], ['bastardSword', 150]] });
    const click = (sel: string) => (document.querySelector('.shop2 ' + sel) as HTMLElement).click();
    const chips = document.querySelectorAll('.shop2 .sc-chips button').length;
    const pots0 = count('healthPotion');
    click('[data-act=buy][data-id=healthPotion][data-n="5"]');
    const pots1 = count('healthPotion');
    click('[data-act=buy][data-id=bastardSword][data-equip="1"]');
    const wielding = p.equip.mainWeapon?.def.id;
    const gold1 = p.prog.gold;
    click('[data-tab=sell]');
    const potName = (await import('/src/items/itemDefs.ts')).ITEMS.healthPotion.name;
    const potCard = [...document.querySelectorAll('.shop2 .sc')].find((c) => c.querySelector('.sc-name')?.textContent === potName)!;
    (potCard.querySelector('[data-all="1"]') as HTMLElement).click();
    const potsSold = count('healthPotion');
    const gold2 = p.prog.gold;
    click('[data-tab=back]');
    const backCards = document.querySelectorAll('.shop2 .sc').length;
    click('[data-act=buyback]');
    const potsBack = count('healthPotion');
    ui.close();
    return { chips, pots0, pots1, wielding, gold1, potsSold, gold2, backCards, potsBack };
  });
  expect(res.chips).toBeGreaterThan(1);
  expect(res.pots1 - res.pots0).toBe(5);
  expect(res.wielding).toBe('bastardSword');
  expect(res.gold1).toBe(2000 - 100 - 150);
  expect(res.potsSold).toBe(0);
  expect(res.gold2).toBeGreaterThan(res.gold1);
  expect(res.backCards).toBe(1);
  expect(res.potsBack).toBe(1);
  expect(errors).toEqual([]);
});

test('quest NPCs keep hours: the tracker says when they are asleep, and you are told near their door', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, W = (window as any).waitSteps, Q = g.quests;
    const toasts: string[] = [];
    const t0 = g.hud.toast.bind(g.hud);
    g.hud.toast = (m: string) => (toasts.push(m), t0(m));
    if (Q.status('mq-stranger') !== 'active') Q.accept('mq-stranger');
    const day = Q.lines('mq-stranger').map((l: any) => l[0]);
    g.time.skipTo(23.5);
    await W(30);
    const night = Q.lines('mq-stranger').map((l: any) => l[0]);
    const maud = g.npcs.find('maud');
    g.player.teleport(maud.pos.clone().setY(maud.pos.y + 1));
    await W(40);
    g.hud.toast = t0;
    return { day, night, toasts, notes: Q.awayNotes('mq-stranger') };
  });
  expect(res.day[0]).not.toContain('asleep');
  expect(res.night[0]).toContain('asleep');
  expect(res.notes[0]).toMatch(/gone to bed/);
  expect(res.toasts.some((t: string) => /gone to bed/.test(t))).toBe(true);
  expect(errors).toEqual([]);
});

test('"be there at night" quests only count while it is night', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, W = (window as any).waitSteps, Q = g.quests;
    Q.accept('night-watch');
    g.time.skipTo(12);
    g.player.teleport(new g.THREE.Vector3(4, 2, 150));
    await W(40);
    const noon = [...Q.state['night-watch'].progress];
    g.player.teleport(new g.THREE.Vector3(4, 2, 40)); // wait for dark somewhere else
    g.time.skipTo(22);
    await W(40);
    const nightAway = { stage: Q.state['night-watch'].stage, progress: [...Q.state['night-watch'].progress] };
    g.player.teleport(new g.THREE.Vector3(4, 2, 150));
    await W(40);
    return { noon, nightAway, stage: Q.state['night-watch'].stage };
  });
  expect(res.noon[1]).toBe(0); // stood there at noon: doesn't count
  expect(res.nightAway.stage).toBe(0); // dark, but not there
  expect(res.stage).toBe(1); // there, at night
  expect(errors).toEqual([]);
});

test('a raised shield covers the sides, and you keep facing the threat', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, pl = g.player, W = (window as any).waitSteps;
    const s = g.slimes.spawn('blue', pl.pos.x + 3, pl.pos.z);
    s.cooldown = 1e9;
    g.input.press('Mouse2');
    await W(30);
    const toThreat = Math.atan2(s.position.x - pl.pos.x, s.position.z - pl.pos.z);
    const facing = Math.cos(pl.yaw - toThreat);
    const side = pl.pos.clone().add(new g.THREE.Vector3(pl.forward.z, 0, -pl.forward.x).multiplyScalar(2));
    const st0 = pl.stamina;
    const r = pl.receiveAttack({ damage: 25, from: side, parryable: true, poise: 40 });
    const cost = st0 - pl.stamina;
    const behind = pl.receiveAttack({ damage: 5, from: pl.pos.clone().addScaledVector(pl.forward, -2), parryable: true, poise: 5 });
    g.input.release('Mouse2');
    return { facing, r, cost, behind };
  });
  expect(res.facing).toBeGreaterThan(0.8);
  expect(res.r).toBe('blocked');
  expect(res.cost).toBeLessThan(25);
  expect(res.behind).toBe('hit');
  expect(errors).toEqual([]);
});
