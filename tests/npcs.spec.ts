import { test, expect } from './fixtures';

// The NPC revamp: townsfolk with names of their own, streets that connect,
// crowds that spread across the road instead of filing down its middle, and
// lines that belong to the person saying them.

test('every townsperson has a name of their own and a title naming their own town', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(() => {
    const N = (window as any).__game.npcs;
    const dupes: string[] = [], roles: string[] = [], wrongTown: string[] = [];
    const seen = new Map<string, Set<string>>();
    for (const st of N.npcs) {
      const r = st.rec, set = seen.get(r.settlement) ?? new Set<string>();
      seen.set(r.settlement, set);
      if (set.has(r.name)) dupes.push(r.settlement + ':' + r.name);
      set.add(r.name);
      if (/^(Traveller|Teamster|Adventurer|Pilgrim|Refugee|Child|Market-goer|Hawker|Crown Guard|Gate Market Hawker)$|^(Farmer|Villager) of /.test(r.name)) roles.push(r.name);
      if (r.settlement !== 'elderGlen' && / of Elder Glen$/.test(r.title ?? '')) wrongTown.push(r.name);
    }
    return { dupes, roles, wrongTown, n: N.npcs.length };
  });
  expect(res.n).toBeGreaterThan(500);
  expect(res.dupes).toEqual([]);
  expect(res.roles).toEqual([]);
  expect(res.wrongTown).toEqual([]);
  expect(errors).toEqual([]);
});

test('every town is one connected walk, and two people heading the same way keep different lanes', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(() => {
    const N = (window as any).__game.npcs;
    const split: string[] = [];
    for (const s of N.settlements.values()) {
      if (s.nodes.length < 2) continue;
      const seen = new Set([0]), stack = [0];
      while (stack.length) for (const v of s.edges[stack.pop()!]) if (!seen.has(v)) (seen.add(v), stack.push(v));
      if (seen.size !== s.nodes.length) split.push(s.id);
    }
    // Two farmers routed from the plaza to the fields: different sides of the road.
    const glen = N.settlements.get('elderGlen');
    const [a, b] = N.npcs.filter((n: any) => n.rec.settlement === 'elderGlen' && n.rec.job === 'farmer' && Math.abs(n.lane) > 0.4).sort((x: any, y: any) => x.lane - y.lane).filter((_: any, i: number, arr: any[]) => i === 0 || i === arr.length - 1);
    const from = glen.places.get('plaza').spots[0], to = glen.places.get('fields').spots[0];
    const pa = N.route(glen, from, to, a), pb = N.route(glen, from, to, b);
    const mid = Math.floor(Math.min(pa.length, pb.length) / 2);
    return { split, gap: pa[mid].distanceTo(pb[mid]), lanes: [a.lane, b.lane] };
  });
  expect(res.split).toEqual([]);
  expect(res.gap).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

test('lines belong to the speaker: a Glen farmer talks about the fields and the hard year, a scavenger about the sand', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, S = g.social, N = g.npcs;
    const { MORE_LINES } = await import('/src/social/voices.ts');
    const { LINES } = await import('/src/social/lines.ts');
    const text = (k: string) => [...(MORE_LINES[k] ?? []), ...((LINES as any)[k] ?? [])].map((e: any) => (typeof e === 'string' ? e : e.t));
    const farmer = N.npcs.find((n: any) => n.rec.settlement === 'elderGlen' && n.rec.job === 'farmer');
    const scav = N.npcs.find((n: any) => /^village\d+$/.test(n.rec.settlement) && n.rec.job === 'scavenger');
    const own = [...text('small.work.farmer'), ...text('small.work.hard')];
    let farmerOwn = 0;
    for (let i = 0; i < 12; i++) if (own.includes(S.line(farmer.rec.id, 'small.work'))) farmerOwn++;
    const sandy = text('small.work.scavenger');
    let scavOwn = 0;
    for (let i = 0; i < 12; i++) if (sandy.includes(S.line(scav.rec.id, 'small.work'))) scavOwn++;
    // Neighbours don't share a life story.
    const glen = N.npcs.filter((n: any) => n.rec.settlement === 'elderGlen').map((n: any) => S.people.get(n.rec.id)).filter(Boolean);
    const abouts = new Set(glen.map((p: any) => p.about)).size / glen.length;
    const ctx = S.ctx(farmer.rec.id);
    return { farmerOwn, scavOwn, abouts, region: ctx.region, hard: ctx.hard };
  });
  expect(res.region).toBe('glen');
  expect(res.hard).toBe(true);
  expect(res.farmerOwn).toBeGreaterThan(6);
  expect(res.scavOwn).toBeGreaterThan(6);
  expect(res.abouts).toBeGreaterThan(0.8);
  expect(errors).toEqual([]);
});
