import { test, expect } from './fixtures';

// The NPC overhaul (src/social): personalities and ties, conversations that
// remember you, tone-tagged replies, gifts and apologies, reputation on shop
// prices and quest rewards, crimes, witnesses and the Watch, people leaving
// town, favours, and the save.

test('everyone has a personality: the Glen is profiled, written characters keep their voice, ties are mutual and the same every game', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(() => {
    const g = (window as any).__game, people = g.social.people;
    const kaela = people.get('kaela'), maud = people.get('maud');
    const glen = people.all().filter((p: any) => p.settlement === 'elderGlen');
    const folk = glen.find((p: any) => p.id.startsWith('eg-') && p.ties.length);
    const tie = folk?.ties[0];
    const back = tie ? people.get(tie.id).ties.some((t: any) => t.id === folk.id) : false;
    const voices = new Set(glen.map((p: any) => p.voice));
    return {
      n: glen.length, kaela: kaela && { voice: kaela.voice, essential: kaela.essential, rival: kaela.ties.some((t: any) => t.id === 'veyr' && t.bond === 'rival') },
      maudAbout: maud?.about, back, voices: voices.size, folkTraits: folk && Object.keys(folk.traits).length,
      corvina: people.get('corvina')?.voice,
    };
  });
  expect(res.n).toBeGreaterThan(80);
  expect(res.kaela).toEqual({ voice: 'blunt', essential: true, rival: true });
  expect(res.maudAbout).toContain('chronicle');
  expect(res.back).toBe(true);
  expect(res.voices).toBeGreaterThanOrEqual(5);
  expect(res.folkTraits).toBe(7);
  expect(res.corvina).toBe('formal');
  expect(errors).toEqual([]);
});

test('a conversation remembers you: first meeting, a mood badge, tone chips, kind words count once a day, a threat sours them, an apology helps', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, d = g.dialogue, rep = g.social.rep;
    const snap = () => { d.skip?.(); return { say: document.querySelector('.dialogue .say')!.textContent, mood: document.querySelector('.dialogue .who .mood')?.textContent, opts: d.options.map((o: any) => (o.tone ? `[${o.tone}] ` : '') + o.label) }; };
    const pick = (re: RegExp) => { d.skip?.(); const o = d.options.find((x: any) => re.test(x.label)); o.run(); return snap(); };
    const kaela = g.town.npcs.find((n: any) => n.spec.id === 'kaela').spec;
    g.town.talk(kaela);
    const first = snap();
    const d0 = rep.dispOf('kaela');
    pick(/Let's talk/);
    const say = pick(/Say something/);
    const kind = d.options.find((o: any) => o.tone === 'kind');
    kind.run();
    const d1 = rep.dispOf('kaela');
    pick(/^Back/);
    pick(/Let's talk/);
    pick(/Say something/);
    d.options.find((o: any) => o.tone === 'kind').run();
    const d2 = rep.dispOf('kaela');
    pick(/^Back/);
    pick(/Let's talk/);
    pick(/Say something/);
    d.options.find((o: any) => o.tone === 'threat').run();
    const d3 = rep.dispOf('kaela');
    d.close();
    g.town.talk(kaela);
    const after = snap();
    const apology = d.options.find((o: any) => /sorry/i.test(o.label));
    d.close();
    return { first, say, d0, d1, d2, d3, after, apology: !!apology, mem: rep.memOf('kaela').met };
  });
  expect(res.first.say).toContain('Feet apart');
  expect(res.first.mood).toBe('Neutral');
  expect(res.first.opts).toContain("Let's talk.");
  expect(res.say.opts.filter((o: string) => /^\[(kind|rude|threat)\]/.test(o)).length).toBe(3);
  expect(res.d1).toBeGreaterThan(res.d0);
  expect(res.d2).toBeLessThanOrEqual(res.d1); // the second compliment of the day doesn't count
  expect(res.d3).toBeLessThan(res.d2 - 10);
  expect(res.apology).toBe(true);
  expect(res.mem).toBe(2);
  expect(errors).toEqual([]);
});

test('small talk goes deeper with trust: secrets for friends, personal topics unlock, and lines are not repeated', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(() => {
    const g = (window as any).__game, d = g.dialogue, rep = g.social.rep;
    const veyr = g.town.npcs.find((n: any) => n.spec.id === 'veyr').spec;
    // Every topic, across the pages ("Something else..." turns them).
    const labels = () => {
      const all = new Set<string>();
      for (let k = 0; k < 8; k++) {
        for (const o of d.options) all.add(o.label);
        const more = d.options.find((o: any) => /Something else/.test(o.label));
        if (!more) break;
        more.run();
        d.skip?.();
      }
      return [...all];
    };
    const pick = (re: RegExp) => { d.skip?.(); d.options.find((x: any) => re.test(x.label)).run(); d.skip?.(); return document.querySelector('.dialogue .say')!.textContent; };
    g.town.talk(veyr);
    pick(/Let's talk/);
    const strangerTopics = labels();
    d.close();
    g.town.talk(veyr);
    pick(/Let's talk/);
    const guarded = pick(/not tell just anyone/);
    const guardedOpts = d.options.map((o: any) => o.tone ?? '');
    d.close();
    rep.disp.veyr = 60; // a friend now
    g.town.talk(veyr);
    pick(/Let's talk/);
    const friendTopics = labels();
    d.close();
    g.town.talk(veyr);
    pick(/Let's talk/);
    const secret = pick(/not tell just anyone/);
    d.close();
    // Greetings over several days don't repeat.
    const greets: string[] = [];
    for (let i = 0; i < 4; i++) {
      g.time.day++;
      g.town.talk(veyr);
      d.skip?.();
      greets.push(document.querySelector('.dialogue .say')!.textContent!);
      d.close();
    }
    return { strangerTopics, guarded, guardedOpts, friendTopics, secret, greets };
  });
  expect(res.strangerTopics.some((l: string) => /Kaela/.test(l))).toBe(false);
  expect(res.friendTopics.some((l: string) => /Kaela/.test(l))).toBe(true);
  expect(res.guardedOpts).toEqual(expect.arrayContaining(['persuade', 'threat']));
  expect(res.secret).toContain('eye');
  expect(new Set(res.greets).size).toBe(res.greets.length);
  expect(errors).toEqual([]);
});

test('gifts: a loved gift counts most, a second gift in a day hardly at all', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(() => {
    const g = (window as any).__game, d = g.dialogue, rep = g.social.rep, p = g.player;
    p.equip.add('wheat', 3);
    p.equip.add('apple', 3);
    const tom = g.social.people.get('baker'); // Tessa: sweets first
    const baker = g.town.npcs.find((n: any) => n.spec.id === 'baker').spec;
    const give = (name: RegExp) => {
      g.town.talk(baker);
      d.options.find((o: any) => /Let's talk/.test(o.label)).run();
      d.options.find((o: any) => /brought you something/.test(o.label)).run();
      const before = rep.dispOf('baker');
      for (let k = 0; k < 8 && !d.options.some((o: any) => name.test(o.label)); k++) d.options.find((o: any) => /Something else/.test(o.label))?.run();
      d.options.find((o: any) => name.test(o.label)).run();
      d.close();
      return rep.dispOf('baker') - before;
    };
    const loved = give(/Apple/);
    const again = give(/Wheat/);
    return { likes: tom.likes, loved, again };
  });
  expect(res.likes[0]).toBe('sweets');
  expect(res.loved).toBeGreaterThanOrEqual(14);
  expect(res.again).toBeLessThan(4);
  expect(errors).toEqual([]);
});

test('reputation moves prices and quest rewards, and people who dislike you keep their work to themselves', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(() => {
    const g = (window as any).__game, rep = g.social.rep, ui = g.town.shopUI;
    const price = () => (ui as any).opts.stock[0][1];
    rep.disp.baker = 0;
    ui.show({ speaker: 'Tessa Rowan', title: 'Baker', intro: 'Hi.', stock: [['healthPotion', 100]] });
    const neutral = price();
    ui.close();
    rep.disp.baker = 80;
    ui.show({ speaker: 'Tessa Rowan', title: 'Baker', intro: 'Hi.', stock: [['healthPotion', 100]] });
    const friend = price();
    ui.close();
    rep.disp.baker = -45;
    ui.show({ speaker: 'Tessa Rowan', title: 'Baker', intro: 'Hi.', stock: [['healthPotion', 100]] });
    const cold = price();
    ui.close();
    rep.disp.baker = 0;
    // Rewards and offers.
    const q = g.quests;
    const k = { neutral: q.rewardMult('hale'), friend: 0, cold: 0 };
    rep.disp.hale = 80; k.friend = q.rewardMult('hale');
    rep.disp.hale = -45; k.cold = q.rewardMult('hale');
    const gate = q.offerGate('hale', { title: 'x' });
    rep.disp.hale = 0;
    const open = q.offerGate('hale', { title: 'x' });
    return { neutral, friend, cold, k, gate, open };
  });
  expect(res.neutral).toBe(100);
  expect(res.friend).toBeLessThan(95);
  expect(res.cold).toBeGreaterThan(115);
  expect(res.k.neutral).toBe(1);
  expect(res.k.friend).toBeGreaterThan(1.2);
  expect(res.k.cold).toBeLessThan(0.8);
  expect(typeof res.gate).toBe('string');
  expect(res.open).toBeNull();
  expect(errors).toEqual([]);
});

test('striking townsfolk: witnesses, a bounty, the Watch calls a halt, and paying the fine clears it', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, T = g.THREE, rep = g.social.rep;
    const { heightAt } = await import('/src/world/terrainHeight.ts' as string);
    // Fröst at his stall, with Master Veyr close enough to see.
    const smith = g.town.npcs.find((n: any) => n.spec.id === 'froest');
    g.player.teleport(new T.Vector3(smith.pos.x + 1.6, heightAt(smith.pos.x + 1.6, smith.pos.z) + 0.3, smith.pos.z));
    for (let i = 0; i < 10 && !g.trouble.persons.get('froest'); i++) { g.trouble.update(1 / 60); await new Promise((r) => setTimeout(r, 50)); }
    const t = g.trouble.persons.get('froest');
    const blow = () => t.takeHit({ damage: 20, poise: 10, dir: new T.Vector3(1, 0, 0), at: t.center.clone(), crit: false, source: 'melee' });
    const d0 = rep.dispOf('froest');
    blow();
    blow();
    const after = { disp: rep.dispOf('froest'), bounty: rep.bountyOf('elderGlen'), told: rep.told.map((x: any) => x.text), fears: rep.fears('froest') };
    // The Watch arrives (sent at once here) and calls a halt.
    const w = g.trouble.summon('elderGlen');
    w.position.copy(g.player.pos).add(new T.Vector3(1.5, 0, 0));
    for (let i = 0; i < 30 && !g.dialogue.open; i++) { g.trouble.update(1 / 60); await new Promise((r) => setTimeout(r, 30)); }
    g.dialogue.skip?.();
    const halt = { open: g.dialogue.open, say: document.querySelector('.dialogue .say')!.textContent, opts: g.dialogue.options.map((o: any) => o.label) };
    g.player.prog.addGold(5000);
    g.dialogue.options.find((o: any) => /Pay the fine/.test(o.label)).run();
    g.dialogue.close();
    return { d0, after, halt, cleared: rep.bountyOf('elderGlen') };
  });
  expect(res.after.disp).toBeLessThan(res.d0 - 40);
  expect(res.after.fears).toBe(true);
  expect(res.after.bounty).toBeGreaterThan(0);
  expect(res.after.told.some((t: string) => /Fröst/.test(t))).toBe(true);
  expect(res.halt.open).toBe(true);
  expect(res.halt.opts.some((o: string) => /Pay the fine/.test(o))).toBe(true);
  expect(res.halt.opts.some((o: string) => /come quietly/.test(o))).toBe(true);
  expect(res.halt.opts).toContain('Make me.');
  expect(res.cleared).toBe(0);
  expect(errors).toEqual([]);
});

test('ordinary folk can die and story characters only fall; the hated leave town, and the save remembers it all', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(() => {
    const g = (window as any).__game, rep = g.social.rep, people = g.social.people;
    const folk = people.all().find((p: any) => p.id.startsWith('eg-') && !p.child && !p.essential);
    // A beating bad enough to drive them off.
    rep.nudge(folk.id, -200);
    const gone = !people.present(folk.id) && g.npcs.absent(folk.id);
    // Story characters never leave.
    rep.nudge('maud', -200);
    const maudHere = people.present('maud');
    rep.act('kind', { who: 'hale', text: 'you were kind to Tom' });
    const saved = JSON.parse(JSON.stringify(rep.save()));
    rep.reset();
    const wiped = people.present(folk.id);
    rep.load(saved);
    return { gone, maudHere, wiped, back: !people.present(folk.id), hale: rep.dispOf('hale') > 0, told: rep.told.length };
  });
  expect(res.gone).toBe(true);
  expect(res.maudHere).toBe(true);
  expect(res.wiped).toBe(true);
  expect(res.back).toBe(true);
  expect(res.hale).toBe(true);
  expect(res.told).toBe(1);
  expect(errors).toEqual([]);
});

test('favours: someone who likes you asks for a hand, it shows in the journal, and doing it pays and pleases', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(() => {
    const g = (window as any).__game, rep = g.social.rep, q = g.quests;
    rep.disp.hale = 60;
    let id = '';
    for (let day = 0; day < 6 && !id; day++) {
      g.time.day += 3;
      g.requests.prepare('hale');
      id = q.offers('hale').find((d: any) => d.id.startsWith('req:'))?.id ?? '';
    }
    if (!id) return { id };
    const def = q.defs.get(id);
    q.accept(id);
    const active = q.isActive(id);
    const before = { disp: rep.dispOf('hale'), gold: g.player.prog.gold };
    // Do it the quick way: give what they asked for, or tell the quest it's done.
    const o = def.stages[0].objectives[0];
    if (o.type === 'deliver') g.player.equip.add(o.item, o.count);
    const show = () => {};
    const run = () => { for (const opt of q.options(def.stages[0].objectives[0].npc ?? 'hale', show, () => {})) if (!/❗/.test(opt.label)) opt.run(); };
    if (o.type === 'kill') for (let i = 0; i < o.count; i++) g.events.emit('enemyDied', { at: g.player.pos.clone(), enemyId: 1, kind: 'wildWolf' });
    run();
    if (def.stages.length > 1) for (const opt of q.options('hale', show, () => {})) if (!/❗/.test(opt.label)) opt.run();
    return { id, title: def.title, active, done: q.isDone(id), gold: g.player.prog.gold - before.gold, disp: rep.dispOf('hale') - before.disp, items: def.rewards.items };
  });
  expect(res.id).toMatch(/^req:hale:/);
  expect(res.active).toBe(true);
  expect(res.done).toBe(true);
  expect(res.gold).toBeGreaterThan(30);
  expect(res.disp).toBeGreaterThan(10);
  expect(errors).toEqual([]);
});
