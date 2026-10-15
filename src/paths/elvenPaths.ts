import { SKILLS, type SkillDef, type SkillRuntime, type Pending } from './skills';
import { PASSIVES, type NodeEffect } from './effects';
import { NODE_TEXT } from './data';

// The Verdant Elves' disciplines in combat (docs/design/verdant-elves.md §6):
//   Ranger      taught by Faelan the Bowyer in the Sanctum. Its shots are
//               arrows of green light today (any weapon); with the arms
//               update's bows they become real arrows. Nodes that only make
//               sense with a bow say so, and do something small now too.
//   Wildwarden  the Hermit of the Hollow's secret druid line: wolf, bear and
//               owl. The forms are spirit-shapes around you (speed and teeth,
//               hide and weight, sight and growth) until the character kit
//               can wear animal bodies.
// Merged into the shared skill and passive tables when this module loads.

const R = (r: number) => 1 + 0.15 * (r - 1);
const pct = (v: number) => `${Math.round(v)}`;
const pl = (rt: SkillRuntime) => rt['player'];

/** An arrow of light from your hand toward the target (or straight ahead). */
function arrow(rt: SkillRuntime, p: Pending, dmg: number, o: { pierce?: boolean; size?: number; bleed?: boolean; range?: number } = {}) {
  const from = rt.castFrom();
  const dir = rt.aimDir(p, from);
  rt.vfx.projectile({
    from, dir, speed: 34, range: o.range ?? 26, style: 'wind', shape: 'spear', size: o.size ?? 0.8, pierce: o.pierce, radius: 0.6,
    onHit: (t, _at, d) => {
      rt.hit(t, dmg, { poise: 30, dir: d, source: 'melee' });
      if (o.bleed) rt.bleed(t, dmg * 0.1);
    },
  });
}

const RANGER: Record<string, SkillDef> = {
  'ranger:Piercing Shot': {
    action: 'sk_cast', cd: 2, stamina: 12, freeAim: true,
    text: (r, rt) => `Loose an arrow of green light that flies 26 m and passes through everything in its path for ${pct(140 * R(r))}% weapon damage.${rt?.has('barbed') ? ' Barbed: enemies bleed.' : ''}`,
    on: (rt, p) => arrow(rt, p, rt.weapon() * 1.4 * R(p.rank) * (1 + rt.x('shotDmg')), { pierce: true, bleed: rt.has('barbed') }),
  },
  "ranger:Hunter's Mark": {
    action: 'sk_cast', cd: 10, stamina: 8, needTarget: 30, freeAim: true,
    text: (r) => `Mark your quarry for ${(10 * R(r)).toFixed(0)} seconds: it takes 25% more damage from everything.`,
    on: (rt, p) => {
      const t = p.target?.alive ? p.target : pl(rt).aimTarget(30);
      if (!t) return;
      rt.brand(t, 10 * R(p.rank));
      rt.vfx.burst(t.center, 'wind', 0.6, 3);
    },
  },
  'ranger:Volley': {
    action: 'sk_castBig', cd: 10, stamina: 24, freeAim: true, range: 22,
    text: (r) => `Three waves of arrows rain on the ground around your target: each hits everything within 3.5 m for ${pct(70 * R(r))}% weapon damage.`,
    on: (rt, p) => {
      const at = (p.target?.alive ? p.target.position : p.point).clone();
      for (let k = 0; k < 3; k++) rt.later(0.15 + k * 0.3, () => {
        rt.area(at, 3.5, rt.weapon() * 0.7 * R(p.rank) * (1 + rt.x('shotDmg')), { poise: 25, source: 'melee' });
        rt.vfx.burst(at.clone().setY(at.y + 0.4), 'wind', 0.7, 6);
        rt.vfx.ring(at, 'wind', 7);
      });
    },
  },
  'ranger:Starfall Arrow': {
    action: 'sk_castBig', cd: 40, stamina: 30, freeAim: true, range: 26,
    text: (r) => `An arrow loosed straight up comes down as a falling star on your target: ${pct(320 * R(r))}% weapon damage across 4 m, and everything hit is staggered.`,
    on: (rt, p) => {
      const at = (p.target?.alive ? p.target.position : p.point).clone();
      rt.vfx.pillar(at, 'light', 1.2, 14);
      rt.later(0.45, () => {
        rt.area(at, 4, rt.weapon() * 3.2 * R(p.rank), { poise: 200, stun: true, source: 'melee' });
        rt.vfx.ring(at, 'light', 10);
        pl(rt).onShake?.(0.35);
      });
    },
  },
  'ranger:Disengage': {
    action: 'sk_dash', cd: 5, stamina: 12,
    text: (r) => `Roll clear, and run ${(30 * R(r)).toFixed(0)}% faster for 3 seconds.`,
    on: (rt, p, ev) => ev === 'cast' && p.n === 0 && rt.addBuff('haste', 3),
  },
  'ranger:Snare': {
    action: 'sk_cast', cd: 12, stamina: 10, freeAim: true, range: 16,
    text: (r, rt) => `Throw a snare of roots: the first enemies to step in within ${(6 * R(r)).toFixed(0)} seconds are caught and left open to a critical hit.${rt?.has('rootSnare') ? ' It holds three.' : ''}`,
    on: (rt, p) => {
      const at = (p.target?.alive ? p.target.position : pl(rt).pos.clone().addScaledVector(pl(rt).forward, 6)).clone();
      let left = rt.has('rootSnare') ? 3 : 1;
      const caught = new Set<number>();
      rt.vfx.zone({
        pos: at, radius: 1.8, life: 6 * R(p.rank), style: 'wind', every: 0.2, motes: 20,
        onTick: (z) => {
          if (left <= 0) return;
          for (const t of rt.vfx.near(z.pos, z.radius)) {
            if (caught.has(t.id) || left <= 0) continue;
            caught.add(t.id);
            left--;
            rt.hit(t, rt.weapon() * 0.4 * (rt.has('barbedSnare') ? 2 : 1), { poise: 160, stun: true, source: 'melee' });
          }
        },
      });
    },
  },
  'ranger:Shadow Roll': {
    action: 'sk_dash', cd: 8, stamina: 14,
    text: (r) => `A low roll through the undergrowth: nothing can hurt you for ${(1.2 * R(r)).toFixed(1)} seconds.`,
    on: (rt, p, ev) => ev === 'cast' && p.n === 0 && rt.addBuff('invuln', 1.2 * R(p.rank)),
  },
  'ranger:The Hunt': {
    action: 'sk_warcry', cd: 60, stamina: 20,
    text: (r) => `For ${(12 * R(r)).toFixed(0)} seconds you run 30% faster, attack 15% faster and deal 20% more damage.`,
    on: (rt, p) => {
      rt.addBuff('haste', 12 * R(p.rank));
      rt.addBuff('composure', 12 * R(p.rank));
      rt.vfx.ring(pl(rt).pos, 'wind', 12);
    },
  },
  'ranger:Spirit Hawk': {
    action: 'sk_cast', cd: 6, mana: 15, freeAim: true,
    text: (r) => `A hawk of green light stoops on your target for ${Math.round(40 * R(r))} damage.`,
    on: (rt, p) => {
      const from = rt.castFrom().setY(pl(rt).pos.y + 3);
      rt.vfx.projectile({ from, dir: rt.aimDir(p, from), speed: 26, range: 30, style: 'gale', shape: 'orb', size: 1.2, onHit: (t, _a, d) => { rt.hit(t, rt.spell(40, 'wind') * R(p.rank) * (rt.has('hawkTalon') ? 1.5 : 1), { poise: 40, dir: d }); if (rt.has('hawkEye')) rt.brand(t, 5); } });
    },
  },
  'ranger:Thornburst': {
    action: 'sk_castSelf', cd: 9, mana: 18,
    text: (r) => `Thorns burst from the ground around you: everything within 3.5 m takes ${Math.round(34 * R(r))} damage and bleeds.`,
    on: (rt, p) => {
      for (const t of rt.area(pl(rt).pos, 3.5, rt.spell(34, 'wind') * R(p.rank), { poise: 70 })) rt.bleed(t, 4);
      rt.vfx.ring(pl(rt).pos, 'wind', 8);
      rt.vfx.burst(pl(rt).center, 'wind', 1, 6);
    },
  },
  'ranger:Call of the Wild': {
    action: 'sk_warcry', cd: 25, stamina: 10,
    text: (r) => `Call to the forest: heal ${pct(15 * R(r))}% of your health and run 30% faster for 6 seconds.`,
    on: (rt, p) => {
      pl(rt).heal(pl(rt).maxHp * 0.15 * R(p.rank));
      rt.addBuff('haste', 6);
      rt.vfx.ring(pl(rt).pos, 'gale', 9);
    },
  },
  'ranger:Heart of the Greenwood': {
    action: 'sk_castSelf', cd: 60, mana: 30,
    text: (r) => `For ${(10 * R(r)).toFixed(0)} seconds the forest shelters you: 40% less damage taken and 3 health a second.`,
    on: (rt, p) => {
      rt.addBuff('cathedral', 10 * R(p.rank));
      rt.vfx.bubble(() => pl(rt).pos, 'wind', 1.3, () => rt.buff('cathedral'));
    },
  },
};

/** A wild shape: a spirit of the animal around you while the form lasts. */
function shape(rt: SkillRuntime, style: 'gale' | 'steel' | 'light', sec: number, buffs: string[]) {
  for (const b of buffs) rt.addBuff(b, sec);
  rt.addBuff('wildShape', sec);
  rt.vfx.bubble(() => pl(rt).pos, style, 1.1, () => rt.buff('wildShape'));
  rt.vfx.burst(pl(rt).center, style, 1.2, 6);
}

const WILDWARDEN: Record<string, SkillDef> = {
  'wildwarden:Wolf Form': {
    action: 'sk_vow', cd: 30, stamina: 10,
    text: (r) => `Take the wolf's shape for ${(25 * R(r)).toFixed(0)} seconds: 30% faster, 15% quicker strikes and 20% more damage.`,
    on: (rt, p) => shape(rt, 'gale', 25 * R(p.rank), ['haste', 'composure']),
  },
  'wildwarden:Pounce': {
    action: 'sk_galeStep', cd: 5, stamina: 16,
    text: (r) => `Leap on your quarry like a wolf, tearing it for ${pct(160 * R(r))}% weapon damage.`,
    on: (rt, p, ev) => {
      if (ev !== 'galeStep') return;
      rt.vfx.burst(pl(rt).center, 'gale', 0.6, 4);
      rt.later(0.4, () => {
        for (const t of rt.area(pl(rt).pos.clone().addScaledVector(pl(rt).forward, 1), 2.2, rt.weapon() * 1.6 * R(p.rank), { poise: 60, source: 'melee' })) if (rt.has('rend')) rt.bleed(t, rt.weapon() * 0.12);
      });
    },
  },
  'wildwarden:Pack Howl': {
    action: 'sk_warcry', cd: 20, stamina: 12,
    text: (r) => `A howl that makes every enemy within 10 m flinch, and gives you 20% more damage for ${(8 * R(r)).toFixed(0)} seconds.`,
    on: (rt, p) => {
      for (const t of rt.vfx.near(pl(rt).pos, 10)) rt.hit(t, 1, { poise: 60 });
      rt.addBuff('composure', 8 * R(p.rank));
      rt.vfx.ring(pl(rt).pos, 'gale', 16);
    },
  },
  'wildwarden:Leader of the Pack': {
    action: 'sk_warcry', cd: 60, stamina: 20,
    text: (r) => `For ${(20 * R(r)).toFixed(0)} seconds: run 30% faster, strike 15% quicker, deal 20% more and take 25% less.`,
    on: (rt, p) => shape(rt, 'gale', 20 * R(p.rank), ['haste', 'composure', 'challenge']),
  },
  'wildwarden:Bear Form': {
    action: 'sk_vow', cd: 30, stamina: 10,
    text: (r) => `Take the bear's shape for ${(25 * R(r)).toFixed(0)} seconds: take 25% less damage, and heal 15% now.`,
    on: (rt, p) => {
      shape(rt, 'steel', 25 * R(p.rank), ['challenge']);
      pl(rt).heal(pl(rt).maxHp * 0.15);
    },
  },
  'wildwarden:Maul': {
    action: 'sk_quake', cd: 9, stamina: 22,
    text: (r) => `Rear up and come down with both paws: everything within 3.5 m takes ${pct(170 * R(r))}% weapon damage and is knocked flat.`,
    on: (rt, p) => {
      rt.area(pl(rt).pos, 3.5 * (rt.has('earthpaw') ? 1.4 : 1), rt.weapon() * 1.7 * R(p.rank), { poise: 220, source: 'melee' });
      rt.vfx.ring(pl(rt).pos, 'steel', 9);
      rt.vfx.fx.dust(pl(rt).pos, 2);
      pl(rt).onShake?.(0.35);
    },
  },
  'wildwarden:Roar': {
    action: 'sk_warcry', cd: 18, stamina: 10,
    text: (r) => `Roar: enemies within 10 m flinch, and you take 50% less damage for ${(4 * R(r)).toFixed(0)} seconds.`,
    on: (rt, p) => {
      for (const t of rt.vfx.near(pl(rt).pos, 10)) rt.hit(t, 1, { poise: 80 });
      rt.addBuff('oathKept', 4 * R(p.rank));
      rt.vfx.ring(pl(rt).pos, 'steel', 14);
    },
  },
  'wildwarden:The Great Bear': {
    action: 'sk_vow', cd: 60, stamina: 20,
    text: (r) => `For ${(12 * R(r)).toFixed(0)} seconds take half damage from everything, and heal 30% now.`,
    on: (rt, p) => {
      shape(rt, 'steel', 12 * R(p.rank), ['oathKept']);
      pl(rt).heal(pl(rt).maxHp * 0.3);
    },
  },
  'wildwarden:Owl Form': {
    action: 'sk_vow', cd: 30, mana: 10,
    text: (r) => `Take the owl's shape for ${(15 * R(r)).toFixed(0)} seconds: 40% faster, dodges cost nothing, and 30 mana back.`,
    on: (rt, p) => {
      shape(rt, 'light', 15 * R(p.rank), ['windwalk']);
      pl(rt).mana = Math.min(pl(rt).maxMana, pl(rt).mana + 30);
    },
  },
  'wildwarden:Moonbeam': {
    action: 'sk_cast', cd: 4, mana: 20, freeAim: true, range: 20,
    text: (r, rt) => `Call a shaft of moonlight down on your target: ${Math.round(50 * R(r) * (rt?.has('starlight') ? 1.3 : 1))} holy damage across 2.5 m.`,
    on: (rt, p) => {
      const at = (p.target?.alive ? p.target.position : p.point).clone();
      rt.vfx.pillar(at, 'light', 0.9, 10);
      rt.area(at, 2.5, rt.spell(50, 'holy') * R(p.rank) * (rt.has('starlight') ? 1.3 : 1), { poise: 50 });
    },
  },
  'wildwarden:Wild Growth': {
    action: 'sk_castSelf', cd: 14, mana: 26,
    text: (r) => `Green things grow round you and through you: heal ${Math.round(70 * R(r))} over 6 seconds.`,
    on: (rt, p) => {
      pl(rt).healOverTime(70 * R(p.rank), 6);
      rt.vfx.groundCircle(pl(rt).pos, 'wind', 3, 6);
    },
  },
  'wildwarden:Spirit of the Wood': {
    action: 'sk_castSelf', cd: 60, mana: 30,
    text: (r) => `For ${(10 * R(r)).toFixed(0)} seconds the wood itself guards you: 40% less damage and 3 health a second.`,
    on: (rt, p) => shape(rt, 'light', 10 * R(p.rank), ['cathedral']),
  },
};

const BOW = '(bows: the arms update)';
const P: Record<string, NodeEffect> = {
  // Ranger: Marksman
  'ranger:Steady Aim': { text: '+3% crit chance', m: { crit: 0.03 } },
  'ranger:Keen Eye': { text: '+5% class damage', m: { melee: 0.05 } },
  'ranger:Long Draw': { text: `+10% bow damage ${BOW}, and Ranger shots deal 10% more`, x: { bowDmg: 0.1, shotDmg: 0.1 } },
  'ranger:Fletcher': { text: `Arrows are recovered 25% of the time ${BOW}, and +4% crit chance`, m: { crit: 0.04 }, x: { arrowSave: 0.25 } },
  'ranger:Called Shot': { text: 'Ranger shots deal 25% more damage', x: { shotDmg: 0.25 } },
  'ranger:Quick Nock': { text: `+15% draw speed ${BOW}, and +8% attack speed`, m: { attackSpeed: 0.08 }, x: { drawSpeed: 0.15 } },
  'ranger:Windage': { text: '+10% poise damage', m: { poise: 0.1 } },
  'ranger:Deadeye': { text: '+15% crit chance, but 15% more damage taken', m: { crit: 0.15, dmgTaken: 0.15 } },
  'ranger:Patience': { text: '+12% stamina regen', m: { staminaRegen: 0.12 } },
  'ranger:Heartseeker': { text: 'Ranger shots deal 20% more damage', x: { shotDmg: 0.2 } },
  'ranger:Arrowstorm': { text: `Volleys loose a fourth wave ${BOW}, and +6% class damage`, m: { melee: 0.06 }, x: { arrowstorm: 1 } },
  // Ranger: Skirmisher
  'ranger:Light Tread': { text: '+5% movement speed', m: { moveSpeed: 0.05 } },
  'ranger:Forest Stride': { text: 'Dodging costs 10% less stamina', m: { dodgeCost: -0.1 } },
  'ranger:Fleet': { text: '+6% movement speed', m: { moveSpeed: 0.06 } },
  'ranger:Bramble Step': { text: 'Dodging costs 15% less stamina', m: { dodgeCost: -0.15 } },
  'ranger:Barbed Snare': { text: 'Snares hit twice as hard; Piercing Shot makes enemies bleed', x: { barbedSnare: 1, barbed: 1 } },
  'ranger:Root Snare': { text: 'Snares hold three enemies', x: { rootSnare: 1 } },
  "ranger:Hunter's Wind": { text: '+10% stamina regen', m: { staminaRegen: 0.1 } },
  'ranger:Wild Heart': { text: '+20% movement and attack speed, but 20 less max health', m: { moveSpeed: 0.2, attackSpeed: 0.2, hp: -20 } },
  'ranger:Second Breath': { text: '+15 max stamina', m: { stamina: 15 } },
  'ranger:Untouchable': { text: 'Dodging costs 20% less stamina', m: { dodgeCost: -0.2 } },
  'ranger:Pathfinder': { text: '+8% movement speed', m: { moveSpeed: 0.08 } },
  // Ranger: Warden of the Wood
  'ranger:Bark Skin': { text: 'Take 4% less damage', m: { dmgTaken: -0.04 } },
  'ranger:Green Blood': { text: '+10% healing received', m: { heal: 0.1 } },
  'ranger:Hawk Eye': { text: 'Spirit Hawk marks what it strikes', x: { hawkEye: 1 } },
  'ranger:Hawk Talon': { text: 'Spirit Hawk strikes 50% harder', x: { hawkTalon: 1 } },
  'ranger:Sylvan Bond': { text: '+25% spell damage and healing, but 10% less class damage', m: { spell: 0.25, heal: 0.25, melee: -0.1 } },
  // Wildwarden
  'wildwarden:Thick Hide': { text: 'Take 5% less damage', m: { dmgTaken: -0.05 } },
  'wildwarden:Rend': { text: 'Pounce makes enemies bleed', x: { rend: 1 } },
  'wildwarden:Hamstring Bite': { text: '+10% poise damage', m: { poise: 0.1 } },
  'wildwarden:Earthpaw': { text: 'Maul reaches 40% farther', x: { earthpaw: 1 } },
  'wildwarden:Bear Hug': { text: '+25 max health', m: { hp: 25 } },
  'wildwarden:Starlight': { text: 'Moonbeam deals 30% more damage', x: { starlight: 1 } },
  'wildwarden:Hush': { text: '-10% mana cost', m: { manaCost: -0.1 } },
  'wildwarden:Alpha': { text: '+20% class damage, but 10% more damage taken', m: { melee: 0.2, dmgTaken: 0.1 } },
  'wildwarden:Ursine Fury': { text: '+30 max health and 10% less damage taken, but 10% slower', m: { hp: 30, dmgTaken: -0.1, moveSpeed: -0.1 } },
  'wildwarden:Sky Warden': { text: '+20% spell damage and +15% movement speed, but 20 less max health', m: { spell: 0.2, moveSpeed: 0.15, hp: -20 } },
};

Object.assign(SKILLS, RANGER, WILDWARDEN);
Object.assign(PASSIVES, P);
Object.assign(NODE_TEXT, {
  'Piercing Shot': 'An arrow of light that passes through every enemy in its path.',
  "Hunter's Mark": 'Mark your quarry: it takes 25% more damage from everything.',
  Volley: 'Three waves of arrows rain on the ground around your target.',
  'Starfall Arrow': 'An arrow shot straight up falls as a star on your target.',
  'Wolf Form': 'Take the wolf’s shape: faster, quicker, fiercer.',
  'Bear Form': 'Take the bear’s shape: harder to hurt, and healed.',
  'Owl Form': 'Take the owl’s shape: swift, light-footed, clear-minded.',
});
export const ELVEN_SKILLS = { ...RANGER, ...WILDWARDEN };
