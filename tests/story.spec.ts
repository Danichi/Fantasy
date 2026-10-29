import { test, expect } from './fixtures';

// The main story (src/story): the opening, Act I end to end, the Sunwheel
// network, the champions of the ages and the Powers & Champions page, Act II
// and Act III part one. Scenes run in fast mode (no waiting) and choices are
// answered by `director.autoChoice`.

const HELPERS = `(() => {
  const g = window.__game, q = g.quests, T = g.THREE, S = g.story;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const tick = async (n = 10) => { for (let i = 0; i < n; i++) { g.stepSim(1); g.mainStory.frame(0.05); await sleep(15); } };
  const settle = async (ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { await tick(4); if (!S.director.active) { await tick(4); if (!S.director.active) return; } } };
  const kill = () => { for (const f of S.foes) if (f.alive) f.takeHit({ damage: 99999, poise: 0, dir: new T.Vector3(1, 0, 0), at: f.center.clone(), crit: false, source: 'melee' }); };
  const talk = (npc) => { const o = q.options(npc, () => {}, () => {}).find((o) => !o.label.startsWith('❗')); if (o) o.run(); return !!o; };
  const tp = async (x, z) => { const { heightAt } = await import('/src/world/terrainHeight.ts'); g.player.teleport(new T.Vector3(x, heightAt(x, z) + 0.4, z)); await tick(6); };
  const wheel = (id) => g.mainStory.wheels().find((w) => w.id === id);
  const rite = (id) => { const n = wheel(id) ?? { id, name: id, pos: g.player.pos.clone(), kind: 'ruin' }; for (const r of S.rites.values()) { const o = r(n); if (o) { o.run(); return o.label; } } return null; };
  const say = (npc) => { const o = S.optionsFor(npc)[0]; if (o) o.run(); return o?.label ?? null; };
  const stage = (id) => (q.state[id] ? q.state[id].status + '@' + q.state[id].stage : 'none');
  return { g, q, T, S, sleep, tick, settle, kill, talk, tp, wheel, rite, say, stage };
})()`;

test('the opening: you fall into the wheat, the Dark comes, Kaela and Brannoc come over the wall, and Maud takes you in', async ({ game }) => {
  test.setTimeout(300_000);
  const { page, errors } = game;
  const res = await page.evaluate(async (src) => {
    const h = eval(src), { g, q, S } = h;
    q.state = {};
    S.reset();
    q.accept('mq-fall');
    await h.settle();
    const fight = { pos: [g.player.pos.x, g.player.pos.z].map(Math.round), foes: S.foes.length, at: Math.hypot(g.player.pos.x - 14, g.player.pos.z - 168) < 8, dark: S.darkness };
    h.kill();
    await h.tick(20);
    const second = { allies: S.allies.length, foes: S.foes.length };
    h.kill();
    await h.tick(20);
    await h.settle();
    const morning = { stage: h.stage('mq-fall'), nearMaud: Math.hypot(g.player.pos.x - 10, g.player.pos.z + 10) < 12, allies: S.allies.length };
    h.talk('maud');
    await h.tick(4);
    return { fight, second, morning, after: [h.stage('mq-fall'), h.stage('mq-stranger')], log: S.state.log.length };
  }, HELPERS);
  expect(res.fight.foes).toBe(3);
  expect(res.fight.at, String(res.fight.pos)).toBe(true);
  expect(res.second.allies).toBe(2);
  expect(res.second.foes).toBeGreaterThanOrEqual(4);
  expect(res.morning.stage).toBe('active@1');
  expect(res.morning.nearMaud).toBe(true);
  expect(res.morning.allies).toBe(0);
  expect(res.after).toEqual(['done@1', 'active@0']);
  expect(res.log).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('Act I: trust, the wheel wakes and carries you, the crypt and the Wheelbreaker, the Dark mirror, and the Night of Bells', async ({ game }) => {
  test.setTimeout(480_000);
  const { page, errors } = game;
  const res = await page.evaluate(async (src) => {
    const h = eval(src), { g, q, S, T } = h;
    g.director = S.director;
    S.director.autoChoice = 1; // ask Malric about the fourth
    const out: Record<string, unknown> = {};
    // ---- A Stranger: two of the Glen's troubles, Maud, Orren, the waystone.
    q.signal('glen-trust'); q.signal('glen-trust');
    h.talk('maud'); h.talk('magus');
    out.beforeWake = { awake: S.wheelAwake, stage: h.stage('mq-stranger') };
    await h.tp(126, -10);
    out.riteLabel = h.rite('glen');
    await h.settle();
    out.afterWake = { awake: S.wheelAwake, crypt: h.stage('mq-crypt'), stranger: h.stage('mq-stranger') };
    // Travel: attune Millbrook, then touch the east gate's wheel again.
    g.worldFlags['way:millbrook'] = true;
    S.wheel.touch(h.wheel('glen'));
    out.travelOpts = g.dialogue.options.map((o) => o.label);
    g.dialogue.options.find((o) => /Millbrook/.test(o.label)).run();
    await h.tick(4);
    out.atMillbrook = g.player.pos.distanceTo(new T.Vector3(600, 0, 104)) < 8;
    // ---- Lights on the Hill.
    h.talk('rook');
    await h.tp(0, -300);
    await h.tick(10);
    out.wardens = S.allies.length;
    await h.settle();
    h.kill();
    await h.tick(10);
    out.door = h.stage('mq-crypt');
    g.realm.progress.bossDead = true;
    for (let i = 0; i < 20 && h.stage('mq-crypt') !== 'active@3'; i++) { g.mainQuest?.update?.(1); await h.tick(4); }
    await h.tp(0, -305);
    await h.tick(10);
    await h.settle();
    const m = S.champions.find((c) => c.def.id === 'malric');
    out.malric = m ? { age: m.def.age, hp: m.maxHp, floor: m.floor } : null;
    if (m) m.takeHit({ damage: m.maxHp, poise: 0, dir: new T.Vector3(1, 0, 0), at: m.center.clone(), crit: false, source: 'melee' });
    await h.settle();
    out.malricChoice = S.flags.malricChoice;
    out.clues = [...S.state.clues];
    h.talk('maud');
    out.crypt = h.stage('mq-crypt');
    // ---- The Dead Wood.
    out.ringRite = h.rite('ring');
    await h.settle();
    q.signal('gravewood-cleared');
    await h.tick(4);
    out.mirrorRite = h.rite('gravewood');
    await h.settle();
    out.mirrorFoes = S.foes.length;
    h.kill();
    await h.tick(10);
    await h.settle();
    h.talk('magus');
    out.gravewood = h.stage('mq-gravewood');
    out.bells = h.stage('mq-bells');
    // ---- The Night of Bells.
    h.talk('brannoc');
    g.time.hour = 22;
    for (let i = 0; i < 10 && h.stage('mq-bells') !== 'active@1'; i++) { q.update(1, g.player.pos); await h.tick(2); }
    await h.tp(10, 40);
    await h.settle();
    out.siege = { raid: g.raids.state, allies: S.allies.length };
    g.raids.state = 'done';
    for (let i = 0; i < 40 && h.stage('mq-bells') !== 'active@2'; i++) await h.tick(4);
    await h.settle();
    h.talk('brannoc');
    out.after = { bells: h.stage('mq-bells'), road: h.stage('road-to-port') };
    out.log = S.state.log.length;
    return out;
  }, HELPERS);
  expect(res.beforeWake).toEqual({ awake: false, stage: 'active@3' });
  expect(res.riteLabel).toContain('hand');
  expect(res.afterWake).toEqual({ awake: true, crypt: 'active@0', stranger: 'done@3' });
  expect(res.travelOpts.some((o: string) => /Millbrook/.test(o))).toBe(true);
  expect(res.atMillbrook).toBe(true);
  expect(res.wardens).toBe(3);
  expect(res.door).toBe('active@2');
  expect(res.malric).toEqual({ age: 4, hp: 1500, floor: 0.55 });
  expect(res.malricChoice).toBe('ask');
  expect(res.clues).toEqual(expect.arrayContaining(['malricIron', 'malricEye']));
  expect(res.crypt).toBe('done@4');
  expect(res.ringRite).toContain('wheel');
  expect(res.mirrorRite).toContain('Dark');
  expect(res.mirrorFoes).toBe(6);
  expect(res.gravewood).toBe('done@3');
  expect(res.bells).toBe('active@0');
  expect(res.siege.allies).toBeGreaterThanOrEqual(2);
  expect(res.after).toEqual({ bells: 'done@2', road: 'active@0' });
  expect(res.log).toBeGreaterThanOrEqual(5);
  expect(errors).toEqual([]);
});

test('champions of the ages: each older age is far stronger, the First is all but untouchable; you can read who serves whom', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async (src) => {
    const h = eval(src), { g, S, T } = h;
    const { AGE_STATS, CHAMPIONS } = await import('/src/story/champions.ts');
    const ages = [5, 4, 3, 2, 1].map((a) => AGE_STATS[a]);
    const ws = S.champion('wheelShield', g.player.pos.clone().add(new T.Vector3(30, 0, 0)), { intro: false });
    const before = ws.hp;
    ws.takeHit({ damage: 500, poise: 400, dir: new T.Vector3(1, 0, 0), at: ws.center.clone(), crit: false, source: 'melee' });
    const firstAge = { lost: before - ws.hp, max: ws.maxHp };
    S.clearFight();
    // Dorian: two clues, a wrong name, then the right one.
    S.state.clue('dorianDoor');
    S.state.clue('dorianEyes');
    const codex = S.state.codex();
    const wrong = S.state.nameAs('dorian', 'ironBelow');
    const right = S.state.nameAs('dorian', 'dragonKing');
    return {
      hp: ages.map((s) => s.hp), dmg: ages.map((s) => s.dmg), poise: ages.map((s) => s.poiseK),
      firstAge, wrong, right, patron: S.state.patronOf('dorian'), naming: /data-name="dorian"/.test(codex),
      ages: Object.values(CHAMPIONS).map((c) => c.age).sort(),
    };
  }, HELPERS);
  for (let i = 1; i < 5; i++) {
    expect(res.hp[i]).toBeGreaterThan(res.hp[i - 1] * 2);
    expect(res.dmg[i]).toBeGreaterThan(res.dmg[i - 1]);
    expect(res.poise[i]).toBeLessThan(res.poise[i - 1]);
  }
  expect(res.firstAge.max).toBeGreaterThanOrEqual(60000);
  expect(res.firstAge.lost).toBeLessThan(res.firstAge.max * 0.01);
  expect(res.naming).toBe(true);
  expect(res.wrong).toBe(false);
  expect(res.right).toBe(true);
  expect(res.patron).toBe('dragonKing');
  expect(new Set(res.ages).size).toBe(5);
  expect(errors).toEqual([]);
});

test('Act II and Act III part one: the index, Dorian, the ledger, the Feast, the Wheelbreaker, the four, and the First Age', async ({ game }) => {
  test.setTimeout(480_000);
  const { page, errors } = game;
  const res = await page.evaluate(async (src) => {
    const h = eval(src), { g, q, S, T } = h;
    const out: Record<string, unknown> = {};
    const done = (id) => (q.state[id] = { status: 'done', stage: 0, progress: [] });
    for (const id of ['mq-fall', 'mq-stranger', 'mq-crypt', 'mq-gravewood', 'mq-bells', 'road-to-port', 'academy-trial', 'academy-lessons', 'academy-rival', 'academy-oath', 'crown-summons']) done(id);
    // The index.
    q.accept('mq-archive');
    out.archiveSay = h.say('mell');
    await h.settle();
    out.archive = { stage: h.stage('mq-archive'), met: ['elin', 'oswald', 'hallam', 'tobin'].every((id) => S.state.met.has(id)) };
    // Dorian.
    S.state.clue('dorianDoor');
    q.accept('mq-dorian');
    g.time.hour = 12;
    for (let i = 0; i < 6; i++) { q.update(1, g.player.pos); await h.tick(2); }
    h.say('dorian');
    await h.settle();
    S.state.nameAs('dorian', 'dragonKing');
    S.director.autoChoice = 0;
    h.say('dorian');
    await h.settle();
    out.dorian = { stage: h.stage('mq-dorian'), flag: S.flags.dorian };
    // The ledger (accepted when the Oldest Prayer is done).
    q.accept('oldest-prayer');
    q.state['oldest-prayer'] = { status: 'active', stage: 2, progress: [0] };
    h.talk('king');
    out.ledger0 = h.stage('mq-ledger');
    h.talk('twig');
    S.director.autoChoice = 1;
    h.say('chancellor');
    await h.settle();
    h.talk('king');
    out.ledger = { stage: h.stage('mq-ledger'), feast: h.stage('mq-feast'), clue: S.state.clues.has('heskLedger') };
    // The Feast: shield the King.
    g.time.hour = 20;
    for (let i = 0; i < 6; i++) { q.update(1, g.player.pos); await h.tick(2); }
    const { PALACE } = await import('/src/world/capitalCity.ts');
    S.director.autoChoice = 0;
    await h.tp(PALACE[0] + 46, PALACE[1] + 8);
    await h.tick(10);
    await h.settle();
    for (let i = 0; i < 20 && h.stage('mq-feast') !== 'done@1'; i++) await h.tick(4);
    out.feast = { stage: h.stage('mq-feast'), choice: S.flags.feast, varro: S.state.met.has('varro'), clue: S.state.clues.has('heskIron') };
    // The Wheelbreaker at dawn.
    g.time.hour = 6;
    for (let i = 0; i < 6; i++) { q.update(1, g.player.pos); await h.tick(2); }
    const { PLAZA } = await import('/src/world/capitalCity.ts');
    await h.tp(PLAZA[0], PLAZA[1] + 4);
    await h.tick(10);
    await h.settle();
    const m = S.champions.find((c) => c.def.id === 'malric');
    if (m) m.takeHit({ damage: m.maxHp, poise: 0, dir: new T.Vector3(1, 0, 0), at: m.center.clone(), crit: false, source: 'melee' });
    await h.settle();
    out.duel = { stage: h.stage('mq-wheelbreaker'), box: g.player.equip.items.some((i) => i.def.id === 'blackIronBox'), four: h.stage('mq-four') };
    // The four.
    g.sites.state.championCamp2 = { k: { read: true } };
    g.bosses.state.rustKnight = { kills: 1 };
    g.realm.progress.kit = { ...(g.realm.progress.kit ?? {}), hollowRidge: { ...(g.realm.progress.kit?.hollowRidge ?? {}), boss: true } };
    h.talk('ingrid'); h.talk('corvin');
    await h.tick(20);
    await h.settle();
    const { HARROW_FORD } = await import('/src/story/act3.ts');
    await h.tp(HARROW_FORD.x + 2, HARROW_FORD.z);
    h.rite('harrow');
    await h.settle();
    await h.tick(10);
    out.spokes = g.player.equip.items.filter((i) => i.def.id === 'sunwheelSpoke').reduce((n, i) => n + i.qty, 0);
    out.fourStage = h.stage('mq-four');
    h.talk('librarian');
    out.turning = h.stage('mq-turning');
    // The turning, and the First Age.
    out.turnLabel = h.rite('ring');
    await h.settle();
    const ws = S.champions.find((c) => c.def.id === 'wheelShield');
    out.wheelShield = ws ? { age: ws.def.age } : null;
    S.flags.turningT = 40;
    await h.tick(10);
    await h.settle();
    for (let i = 0; i < 20 && h.stage('mq-turning') !== 'active@1'; i++) await h.tick(4);
    out.ysra = S.state.met.has('ysra');
    h.talk('maud');
    out.end = h.stage('mq-turning');
    out.alive = !g.player.dead;
    return out;
  }, HELPERS);
  expect(res.archiveSay).toContain('index');
  expect(res.archive).toEqual({ stage: 'done@0', met: true });
  expect(res.dorian).toEqual({ stage: 'done@3', flag: 'friend' });
  expect(res.ledger0).toBe('active@0');
  expect(res.ledger).toEqual({ stage: 'done@2', feast: 'active@0', clue: true });
  expect(res.feast).toEqual({ stage: 'done@1', choice: 'shield', varro: true, clue: true });
  expect(res.duel).toEqual({ stage: 'done@1', box: true, four: 'active@0' });
  expect(res.spokes).toBe(4);
  expect(res.fourStage).toBe('active@1');
  expect(res.turning).toBe('active@0');
  expect(res.turnLabel).toContain('five spokes');
  expect(res.wheelShield).toEqual({ age: 1 });
  expect(res.ysra).toBe(true);
  expect(res.end).toBe('done@1');
  expect(res.alive).toBe(true);
  expect(errors).toEqual([]);
});
