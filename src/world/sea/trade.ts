// Trade at sea (docs/design/boating.md §11): goods every port makes cheaply
// and others pay dearly for, carried in a ship's hold; prices that slide as
// you buy and sell and recover with time; the Maritime Guild's contracts
// (deliver this cargo there by then) and courier runs (sealed letters, fast);
// and contraband, which the Crown's customs cutter will take off you if it
// catches you with it. Pure data and arithmetic.

export interface Good {
  id: string;
  name: string;
  /** a fair price, per unit */
  base: number;
  /** illegal in the Crown's ports */
  contraband?: boolean;
}

export const GOODS: Good[] = [
  { id: 'grain', name: 'Grain', base: 8 },
  { id: 'saltFish', name: 'Salt fish', base: 10 },
  { id: 'cloth', name: 'Cresha cloth', base: 20 },
  { id: 'ironware', name: 'Ironware', base: 26 },
  { id: 'wine', name: 'Valorian wine', base: 34 },
  { id: 'timber', name: 'Timber', base: 14 },
  { id: 'dyes', name: 'Dyes', base: 30 },
  { id: 'herbs', name: 'Island herbs', base: 22 },
  { id: 'spices', name: 'Spices', base: 40 },
  { id: 'sugar', name: 'Cane sugar', base: 18 },
  { id: 'nacre', name: 'Mother-of-pearl', base: 55 },
  { id: 'rum', name: 'Black rum', base: 16 },
  { id: 'relics', name: 'Drowned relics', base: 70 },
  { id: 'ashSilk', name: 'Ash silk', base: 90 },
  { id: 'mountainOre', name: 'Mountain ore', base: 24 },
  { id: 'gems', name: 'Rough gems', base: 65 },
  { id: 'plunder', name: 'Plunder (no questions)', base: 45, contraband: true },
  { id: 'demonGlass', name: 'Demon-glass', base: 120, contraband: true },
];
export const GOOD = Object.fromEntries(GOODS.map((g) => [g.id, g])) as Record<string, Good>;

export interface Market {
  /** made here: cheap */
  produce: string[];
  /** wanted here: dear */
  want: string[];
  /** a Crown port: won't touch contraband (and the customs cutter patrols) */
  crown?: boolean;
  /** a fence: buys contraband */
  fence?: boolean;
}

export const MARKETS: Record<string, Market> = {
  portAurelle: { produce: ['grain', 'saltFish', 'ironware', 'cloth'], want: ['spices', 'sugar', 'timber', 'nacre', 'ashSilk', 'relics', 'dyes'], crown: true },
  crownQuay: { produce: ['wine', 'cloth'], want: ['spices', 'dyes', 'nacre', 'herbs', 'saltFish', 'ashSilk'], crown: true },
  azureHaven: { produce: ['spices', 'sugar', 'nacre'], want: ['grain', 'ironware', 'cloth', 'timber', 'wine'] },
  emeraldCove: { produce: ['timber', 'dyes', 'herbs'], want: ['ironware', 'saltFish', 'wine', 'sugar', 'cloth'] },
  wreckersRest: { produce: ['rum', 'plunder'], want: ['ironware', 'wine', 'grain', 'cloth'], fence: true },
  sunkenSpire: { produce: ['relics', 'nacre'], want: ['grain', 'wine', 'cloth', 'herbs', 'rum'] },
  kettleCove: { produce: ['mountainOre', 'ironware', 'gems'], want: ['grain', 'saltFish', 'timber', 'cloth', 'wine'] },
  ashenPort: { produce: ['demonGlass', 'ashSilk'], want: ['wine', 'grain', 'timber', 'ironware', 'spices', 'sugar'] },
};

/** Market state: how glutted (+) or starved (-) each port is of each good, -1..1. */
export type Supply = Record<string, Record<string, number>>;

/** What a unit costs to buy (or fetches to sell) here now; null if not traded here. */
export function price(port: string, good: string, supply: Supply, side: 'buy' | 'sell') {
  const m = MARKETS[port];
  const g = GOOD[good];
  if (!m || !g) return null;
  if (g.contraband && m.crown) return null;
  // Contraband sells only to a fence; anything not made or wanted here trades at a fair price.
  if (side === 'sell' && g.contraband && !m.fence && !m.produce.includes(good)) return null;
  if (side === 'buy' && g.contraband && !m.produce.includes(good)) return null;
  const mult = m.produce.includes(good) ? 0.55 : m.want.includes(good) ? 1.7 : g.contraband && m.fence ? 1.25 : 1;
  const s = supply[port]?.[good] ?? 0;
  const p = g.base * mult * (1 - 0.35 * s) * (side === 'buy' ? 1.08 : 0.92);
  return Math.max(1, Math.round(p));
}

/** Buying (n > 0) or selling (n < 0) moves the market. */
export function shiftSupply(supply: Supply, port: string, good: string, n: number) {
  supply[port] ??= {};
  supply[port][good] = Math.max(-1, Math.min(1, (supply[port][good] ?? 0) - n * 0.025));
}

/** Markets drift back to normal (per game hour). */
export function recoverSupply(supply: Supply, hours: number) {
  for (const p of Object.values(supply)) for (const k of Object.keys(p)) {
    p[k] *= Math.exp(-0.08 * hours);
    if (Math.abs(p[k]) < 0.01) delete p[k];
  }
}

// ---- the Maritime Guild's contracts ------------------------------------------------------------

export interface Contract {
  id: string;
  kind: 'cargo' | 'courier';
  from: string;
  to: string;
  good?: string;
  n?: number;
  pay: number;
  /** game hour by which it must arrive (day * 24 + hour) */
  due: number;
  /** half pay for early arrival before this hour */
  early: number;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Today's offers at a port: cargo runs (a load of what's made here to a port
 * that wants it) and courier runs (sealed letters, quick). `dist(a, b)` is
 * metres between ports; game hours per real second come from the clock.
 */
export function offers(port: string, day: number, now: number, ports: string[], dist: (a: string, b: string) => number, hoursPerMetre: number): Contract[] {
  const m = MARKETS[port];
  if (!m) return [];
  const r = rng(day * 977 + port.length * 131 + port.charCodeAt(0) * 7);
  const out: Contract[] = [];
  const dests = ports.filter((p) => p !== port && MARKETS[p] && p !== 'ashenPort');
  for (let i = 0; i < 3; i++) {
    const legal = m.produce.filter((g) => !GOOD[g].contraband);
    if (!legal.length || !dests.length) break;
    const good = legal[Math.floor(r() * legal.length)];
    const wanting = dests.filter((d) => MARKETS[d].want.includes(good));
    const to = (wanting.length ? wanting : dests)[Math.floor(r() * (wanting.length || dests.length))];
    const d = dist(port, to);
    const n = 10 + Math.floor(r() * 4) * 5;
    const hours = d * hoursPerMetre;
    out.push({ id: `c-${port}-${day}-${i}`, kind: 'cargo', from: port, to, good, n, pay: Math.round(n * GOOD[good].base * 0.6 + d * 0.04), due: Math.round(now + hours * 2.2 + 3), early: Math.round(now + hours * 1.4 + 1) });
  }
  const to = dests[Math.floor(r() * dests.length)];
  if (to) {
    const d = dist(port, to);
    const hours = d * hoursPerMetre;
    out.push({ id: `k-${port}-${day}`, kind: 'courier', from: port, to, pay: Math.round(60 + d * 0.06), due: Math.round(now + hours * 1.5 + 1), early: Math.round(now + hours * 1.15 + 0.5) });
  }
  return out;
}
