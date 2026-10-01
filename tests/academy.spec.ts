import { test, expect, boot, SLOW } from './fixtures';
import type { Page } from '@playwright/test';

// World Expansion phase 5, the rest of Port Aurelle: the Academy's ranks,
// sparring ladder, lore examination and dormitory, and the Quiet Hands' den
// with its black market.

test('a Squire climbs the ladder, passes Mell\'s examination and rises to Knight-Aspirant', async ({ game }) => {
  test.setTimeout(300_000 * SLOW);
  const { page } = game;
  const errors = game.errors;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game;
    const T = g.THREE;
    const { QUIZ, LADDER } = await import('/src/quests/academy.ts' as string);
    const q = g.quests;
    const a = g.academy;
    const rank0 = a.rank();
    for (const id of ['road-to-port', 'academy-trial', 'academy-lessons', 'academy-rival', 'academy-oath']) q.state[id] = { status: 'done', stage: 0, progress: [] };
    const rank1 = a.rank();
    q.accept('academy-aspirant');
    const gold0 = g.player.prog.gold;
    // Four ladder bouts on four days.
    const names: string[] = [];
    let refused = '';
    for (let k = 0; k < 4; k++) {
      g.time.day += 1;
      a.fight();
      await new Promise((r) => setTimeout(r, 400));
      const opp = g.duel.opponent;
      names.push(opp?.name);
      for (let i = 0; i < 40 && g.duel.active; i++) {
        opp.takeHit({ damage: 45, poise: 40, dir: new T.Vector3(1, 0, 0), at: opp.center.clone(), crit: false, source: 'melee' });
        await new Promise((r) => setTimeout(r, 100));
      }
      await new Promise((r) => setTimeout(r, 300));
      if (k === 0) refused = a.nextBout().why ?? '';
    }
    const ladder = g.worldFlags.ladder;
    const purse = g.player.prog.gold - gold0;
    // The examination: answer every question correctly.
    const quiz = a.services.find((s: any) => s[0] === 'mell')[1];
    let last: any = null;
    const show = (t: string, opts: any[]) => (last = { t, opts });
    quiz(show, () => {})[0].run();
    for (let i = 0; i < 5; i++) {
      const qa = QUIZ.find((x: any) => last.t.includes(x[0]));
      last.opts.find((o: any) => o.label === qa[1][0]).run();
    }
    const verdict = last.t;
    const stage = q.state['academy-aspirant'].stage;
    q.options('marrow', () => {}, () => {})[0].run();
    // The dormitory: a free night for cadets.
    const dorm = g.realm.overworldInteractables.find((i: any) => /dormitory/i.test(i.label()));
    g.time.hour = 22;
    g.player.hp = 10;
    const dormOk = dorm.enabled();
    dorm.action();
    return {
      rank0, rank1, names, refused, ladder, purse, verdict, stage, done: q.isDone('academy-aspirant'), rank2: a.rank(),
      hour: g.time.hour, hp: g.player.hp, maxHp: g.player.maxHp, dormOk, rungs: LADDER.length,
    };
  });
  expect(res.rank0).toBe('none');
  expect(res.rank1).toBe('squire');
  expect(res.names).toEqual(['Cadet Pell Ashby', 'Cadet Wren Tidewell', 'Cadet Dorian Vale', 'Instructor Lyra Quen']);
  expect(res.refused).toMatch(/One bout a day/);
  expect(res.ladder).toBe(4);
  expect(res.purse).toBe(15 + 20 + 30 + 40);
  expect(res.verdict).toMatch(/^5 of 5/);
  expect(res.stage).toBe(1);
  expect(res.done).toBe(true);
  expect(res.rank2).toBe('aspirant');
  expect(res.dormOk).toBe(true);
  expect(Math.round(res.hour)).toBe(6);
  expect(res.hp).toBe(res.maxHp);
  expect(errors).toEqual([]);
});

test('the Quiet Hands: a hidden trapdoor, Aldric\'s debt, and the black market', async ({ game }) => {
  test.setTimeout(240_000 * SLOW);
  const { page } = game;
  const errors = game.errors;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game;
    const q = g.quests;
    const door = g.realm.overworldInteractables.find((i: any) => i === g.lowerCity.interactables[0]);
    const hidden = door.label() === '' && !door.enabled();
    q.state['missing-heir'] = { status: 'done', stage: 0, progress: [1] };
    q.accept('quiet-hands');
    q.options('marlo', () => {}, () => {})[0].run();
    const known = door.label();
    g.player.prog.addGold(200);
    const gold0 = g.player.prog.gold;
    // The trapdoor leads down into the undercity, where Mother Sallow keeps the ledger.
    door.action();
    for (let k = 0; k < 200 && (g.realm.mode !== 'interior' || g.realm.busy); k++) await new Promise((r) => setTimeout(r, 50));
    const below = g.realm.mode === 'interior' && g.realm.interior?.kind === 'undercity';
    g.lowerCity.den();
    const opts = () => g.dialogue['options'].map((o: any) => o.label);
    const first = opts();
    g.dialogue['options'].find((o: any) => /Aldric/.test(o.label)).run();
    g.dialogue['options'].find((o: any) => /Pay his debt/.test(o.label)).run();
    const paid = gold0 - g.player.prog.gold;
    const stage = q.state['quiet-hands'].stage;
    q.options('corvina', () => {}, () => {})[0].run();
    const done = q.isDone('quiet-hands');
    // Nix the fence sells, once Aldric is home.
    g.lowerCity.nix();
    const after = opts();
    g.dialogue['options'].find((o: any) => /fell off the wagons/.test(o.label)).run();
    const shop = opts();
    g.dialogue.close();
    await g.realm.leaveInterior();
    return { hidden, known, below, first, paid, stage, done, after, shop };
  });
  expect(res.hidden).toBe(true);
  expect(res.known).toMatch(/Knock twice/);
  expect(res.below).toBe(true);
  expect(res.first.some((l: string) => /Aldric/.test(l))).toBe(true);
  expect(res.first.some((l: string) => /black market/.test(l))).toBe(false);
  expect(res.paid).toBe(80);
  expect(res.stage).toBe(2);
  expect(res.done).toBe(true);
  expect(res.after.some((l: string) => /fell off the wagons/.test(l))).toBe(true);
  expect(res.shop.some((l: string) => /Greater Health/i.test(l))).toBe(true);
  expect(errors).toEqual([]);
});
