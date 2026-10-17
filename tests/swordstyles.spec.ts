import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

// The reworked sword styles: Gale's Flow from dodging through attacks, Cross
// Style's Tempo from alternating blades, Boundary's ring and Focus, their
// trials, and sane cooldowns. Waits are simulation steps.

const LEARN = `(disc, name, rank = 1) => {
  const g = window.__game, P = g.player.paths;
  P.lv[disc] = Math.max(P.lv[disc], 25);
  const tree = window.__trees[disc];
  const n = tree.nodes.find((n) => n.name === name || n.name.split('|').includes(name));
  P.nodes[disc][n.id] = { r: rank, pick: n.type === 'choice' ? n.name.split('|').indexOf(name) : undefined };
  g.skillRt.recompute();
  return 'skill:' + disc + ':' + n.id;
}`;

async function setup(page: Page) {
  await page.evaluate(async () => {
    const paths = await import('/src/paths/paths.ts');
    const data = await import('/src/paths/data.ts');
    (window as any).__trees = Object.fromEntries(data.DISCIPLINES.map((d: any) => [d.id, paths.treeOf(d)]));
  });
}

test('every sword-style technique has a cooldown of at least 5 seconds, and no wind is thrown', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const { SKILLS } = await import('/src/paths/skills.ts');
    const short: string[] = [];
    let n = 0;
    for (const [k, d] of Object.entries(SKILLS) as [string, any][]) {
      if (!/^(gale|boundary|cross):/.test(k)) continue;
      n++;
      if (d.cd < 5) short.push(`${k} ${d.cd}`);
    }
    const src = (await (await fetch('/src/paths/classes/gale.ts')).text());
    return { n, short, windBlades: /windBlade|projectile\(/.test(src) };
  });
  expect(res.n).toBeGreaterThan(25);
  expect(res.short).toEqual([]);
  expect(res.windBlades).toBe(false);
  expect(errors).toEqual([]);
});

test('Gale: dodging through an attack builds Flow and sharpens the next cut', async ({ game }) => {
  const { page, errors } = game;
  await setup(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, pl = g.player, rt = g.skillRt, W = (window as any).waitSteps;
    pl.paths.teach('gale');
    await W(2);
    const flow0 = rt.flow;
    pl.startAction('roll');
    pl.act.t = (pl.act.def.iframes[0] + pl.act.def.iframes[1]) / 2; // inside the roll's i-frames
    const r = pl.receiveAttack({ damage: 30, from: pl.pos.clone().addScaledVector(pl.forward, 2), parryable: true, poise: 30 });
    const after = { r, flow: rt.flow, slip: rt.buff('slip'), hp: pl.hp === pl.maxHp };
    pl.act = null;
    // Getting hit costs Flow.
    pl.receiveAttack({ damage: 5, from: pl.pos.clone().addScaledVector(pl.forward, 2), parryable: false, poise: 0 });
    return { flow0, after, hurtFlow: rt.flow };
  });
  expect(res.after.r).toBe('dodged');
  expect(res.after.flow).toBeGreaterThanOrEqual(res.flow0 + 2);
  expect(res.after.slip).toBe(true);
  expect(res.after.hp).toBe(true);
  expect(res.hurtFlow).toBeLessThan(res.after.flow);
  expect(errors).toEqual([]);
});

test('Cross: alternating blades builds Tempo and speed; the same hand twice costs it; Ilse counts the beat', async ({ game }) => {
  const { page, errors } = game;
  await setup(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, pl = g.player, rt = g.skillRt, W = (window as any).waitSteps, Q = g.quests;
    // Two swords.
    const off = pl.equip.add('shortsword');
    pl.equip.equip(off.uid, 'off');
    pl.paths.teach('cross');
    pl.paths.setActive('cross');
    Q.accept('trial-cross');
    await W(2);
    const s = g.slimes.spawn('blue', pl.pos.x + 2, pl.pos.z);
    s.cooldown = 1e9;
    s.hp = 5000;
    const hit = (action: string) => g.events.emit('meleeHit', { target: s, amount: 1, crit: false, action });
    const seq: number[] = [];
    for (const a of ['slash1', 'offslash1', 'slash2', 'offslash2', 'slash3', 'offslash1']) {
      hit(a);
      seq.push(rt.cc.tempo);
    }
    await W(2);
    const speed = pl.mods.attackSpeed;
    hit('offslash2'); // same hand again
    const dropped = rt.cc.tempo;
    const trial = Q.state['trial-cross'].progress[0];
    return { dual: pl.equip.dualWield, seq, speed, dropped, trial, ilse: !!g.npcs.find('ilse') };
  });
  expect(res.dual).toBe(true);
  expect(res.seq).toEqual([0, 1, 2, 3, 4, 5]);
  expect(res.speed).toBeGreaterThan(1.15);
  expect(res.dropped).toBe(4);
  expect(res.trial).toBe(5);
  expect(res.ilse).toBe(true);
  expect(errors).toEqual([]);
});

test('Boundary: hold F still to raise a small ring that turns attacks aside and spends Focus', async ({ game }) => {
  const { page, errors } = game;
  await setup(page);
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, pl = g.player, rt = g.skillRt, W = (window as any).waitSteps;
    pl.paths.teach('boundary');
    pl.paths.setActive('boundary');
    await W(5);
    g.input.press('KeyF');
    for (let i = 0; i < 400 && !rt.cc.domainOn; i++) await W(1);
    const up = rt.cc.domainOn;
    await W(60);
    const r = rt.cc.domainR;
    const f0 = rt.cc.focus;
    const near = pl.receiveAttack({ damage: 25, from: pl.pos.clone().addScaledVector(pl.forward, 1.5), parryable: true, poise: 30 });
    const arrow = pl.receiveAttack({ damage: 15, from: pl.pos.clone().addScaledVector(pl.forward, 9), at: pl.pos.clone().addScaledVector(pl.forward, 0.8).setY(pl.pos.y + 1), parryable: false, poise: 10, projectile: true });
    const spent = f0 - rt.cc.focus;
    const stillUp = rt.cc.domainOn;
    // A blow it can't turn breaks it.
    pl.receiveAttack({ damage: 5, from: pl.pos.clone().addScaledVector(pl.forward, 1), parryable: false, poise: 5 });
    const broken = !rt.cc.domainOn;
    const far = pl.receiveAttack({ damage: 5, from: pl.pos.clone().addScaledVector(pl.forward, 6), parryable: true, poise: 5 });
    g.input.release('KeyF');
    await W(150);
    return { up, r, near, arrow, far, spent, stillUp, broken, refilled: rt.cc.focus > f0 - spent };
  });
  expect(res.up).toBe(true);
  expect(res.r).toBeGreaterThan(1.5);
  expect(res.r).toBeLessThan(3.5); // small
  expect(res.near).toBe('parried');
  expect(res.arrow).toBe('blocked');
  expect(res.far).not.toBe('parried');
  expect(res.spent).toBeGreaterThan(5);
  expect(res.stillUp).toBe(true);
  expect(res.broken).toBe(true);
  expect(res.refilled).toBe(true);
  expect(errors).toEqual([]);
});

test('Corvin sets a trial: turn aside fifteen blows, then he teaches the Boundary', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, P = g.player.paths, Q = g.quests;
    const corvin = g.town.npcs.find((n: any) => n.spec.id === 'corvin').spec;
    g.town.mentorOptions(corvin, () => {}).find((o: any) => o.label.startsWith('Teach me Boundary')).run();
    const accepted = Q.status('trial-boundary');
    for (let i = 0; i < 15; i++) g.events.emit('parrySuccess', { at: g.player.center.clone() });
    const stage = Q.state['trial-boundary'].stage;
    Q.options('corvin', () => {}, () => {}).find((o: any) => /still standing/.test(o.label))?.run();
    return { accepted, stage, learned: P.learned('boundary') };
  });
  expect(res.accepted).toBe('active');
  expect(res.stage).toBe(1);
  expect(res.learned).toBe(true);
  expect(errors).toEqual([]);
});
