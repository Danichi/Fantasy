// Armour as a breakable layer over your health.
//
// Every piece of worn armour adds to two things:
//   - an armour POOL (the grey bar laid over the red health bar), and
//   - how much of each blow that pool turns aside while it holds.
// Blows wear the pool down. While it holds, part of every hit is absorbed and
// the rest reaches your health. Once it breaks, hits land in full until you
// get a breather and the straps and plates settle back into place.
//
// A whole coat turns aside about what the old flat armour did (starter gear
// ~23%, a tier-1 plate set ~51%); it lasts roughly ten ordinary blows, and
// each blow past that lands in full.
//
// The numbers, all in one place:
//   pool          = armour × 9 + 12                       (0 when you wear none)
//   full cut  R   = armour / (armour + 20), capped at 72%
//   cut now   r   = R × (0.6 + 0.4 × pool / max)          (a battered coat cuts less)
//   kind of blow:
//     arrows, bolts, thrown things   r × 0.75, wear × 0.8   (points find the gaps)
//     fire / burning blows           r × 0.6,  wear × 0.6   (heat goes through steel)
//     heavy, slams, grabs            r × 1,    wear × 1.75  (crushing dents plates)
//   absorbed      = damage × r
//   wear on pool  = (absorbed + damage × 0.2) × wear
//   If the pool can't pay the full wear, it pays what it has, absorbs that
//   share, and the rest of the blow goes through: the armour breaks.
//   health        = damage − absorbed
// Regaining it: 5 s after the last blow it mends at 10% of the pool a second;
// resting, sleeping, respawning, levelling up and loading fill it at once; a
// Repair Kit mends half of it on the spot.

export const ARMOUR = {
  perPoint: 9,
  base: 12,
  k: 20,
  cap: 0.72,
  floor: 0.6,
  rawShare: 0.2,
  regenDelay: 5,
  regenRate: 0.1,
} as const;

/** The size of the armour pool for this much worn armour. */
export function maxArmourOf(armorValue: number) {
  return armorValue > 0 ? Math.round(armorValue * ARMOUR.perPoint + ARMOUR.base) : 0;
}

/** The share of a blow a whole, unbroken coat of this armour turns aside. */
export function armourCut(armorValue: number) {
  return armorValue > 0 ? Math.min(ARMOUR.cap, armorValue / (armorValue + ARMOUR.k)) : 0;
}

export interface ArmourBlow {
  damage: number;
  projectile?: boolean;
  /** fire (a burning blow) */
  elemental?: boolean;
  /** heavy, unblockable or a grab */
  crushing?: boolean;
}

export interface ArmourResult {
  /** what reaches your health (before other modifiers) */
  toHealth: number;
  /** taken off the armour pool */
  wear: number;
  /** the pool went from something to nothing on this blow */
  broke: boolean;
}

/** Run one blow through the armour pool. */
export function armourBlow(pool: number, max: number, armorValue: number, b: ArmourBlow): ArmourResult {
  const dmg = Math.max(0, b.damage);
  if (pool <= 0 || max <= 0 || dmg <= 0) return { toHealth: dmg, wear: 0, broke: false };
  let r = armourCut(armorValue) * (ARMOUR.floor + (1 - ARMOUR.floor) * Math.min(1, pool / max));
  let wear = 1;
  if (b.projectile) (r *= 0.75), (wear *= 0.8);
  if (b.elemental) (r *= 0.6), (wear *= 0.6);
  if (b.crushing) wear *= 1.75;
  let absorbed = dmg * r;
  let cost = (absorbed + dmg * ARMOUR.rawShare) * wear;
  let broke = false;
  if (cost >= pool) {
    // It gives way part-way through the blow: it only stops its share.
    absorbed *= pool / cost;
    cost = pool;
    broke = true;
  }
  return { toHealth: dmg - absorbed, wear: cost, broke };
}
