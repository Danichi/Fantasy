import type { Player } from '../../player/player';
import type { ArmsRuntime } from '../../combat/armsRuntime';
import type { ItemDef } from '../itemDefs';

// The Golden Expanse wears you down (the region's "heat, thirst, sand
// monsters"): out in the open under the midday sun, heat builds; anywhere in the
// Expanse, thirst grows; a sandstorm slows you. Shade, night and water cool you,
// and anything you drink slakes thirst. The Sun Guard's armour and a Heatward
// elixir keep the heat off, the Sun Guard keep their feet in a sandstorm,
// and the Dune Striders never go thirsty.

export interface ExposureDeps {
  player: Player;
  arms: ArmsRuntime;
  toast: (m: string) => void;
  region: () => string;
  hour: () => number;
  /** under a roof, in a dungeon, aboard and below decks: out of the sun */
  sheltered: () => boolean;
  /** in a town or village (shade, wells) */
  inTown: () => boolean;
  /** the sandstorm's strength here, 0..1 */
  storm: () => number;
  /** gear effects in force (gearRuntime fx) */
  fx: () => Record<string, number>;
  flags: Record<string, boolean | number | string>;
  // ---- the mountain cold (world/mountains) ----
  /** snowfall times wind here, 0..1 (a blizzard is 1) */
  snow?: () => number;
  /** by a fire, in a cairn hut, at a forge: warming up */
  warmSpot?: () => boolean;
  /** a dwarf or a dragonkin: the cold is home */
  warmBlood?: () => boolean;
}

/** Where the cold bites: the high snow (Kettle Cove's shore is mild). */
const COLD_REGIONS = new Set(['whiteMountains', 'deepMountains', 'frostedPeaks']);
const SNOWLINE = 140;

const WATERY = /water|tea|ale|wine|rum|cider|milk|stout|mead|grog|dew|spirit|draught|tonic|phial|brew_|potion|juice|broth|soup/i;

export class Exposure {
  heat = 0;
  thirst = 0;
  /** the mountain cold, 0..1 (docs/design/mountains.md §5) */
  cold = 0;
  private warned = { heat: 0, thirst: 0, storm: 0, cold: 0 };

  constructor(private d: ExposureDeps) {
    this.heat = Number(d.flags['exp:heat'] ?? 0);
    this.thirst = Number(d.flags['exp:thirst'] ?? 0);
    this.cold = Number(d.flags['exp:cold'] ?? 0);
  }

  private frostT = 0;
  /** How fast the cold is closing in right now (per second; negative: warming up). For the meter's arrow. */
  coldRate = 0;

  private stepCold(dt: number, f: Record<string, number>) {
    const d = this.d, p = d.player;
    const high = COLD_REGIONS.has(d.region()) && !p.dead && p.pos.y > SNOWLINE;
    const snow = d.snow?.() ?? 0;
    const sheltered = d.sheltered(), town = d.inTown(), fire = d.warmSpot?.() ?? false;
    const resist = f.coldImmune ? 1 : Math.min(0.92, (f.warm ?? 0) + (d.warmBlood?.() ? 0.45 : 0));
    let rate: number;
    if (!high || sheltered || fire) rate = -1 / (fire ? 12 : sheltered ? 20 : 45);
    else if (town && snow < 0.6) rate = -1 / 60;
    else {
      // Four minutes to the bone on a calm day; a blizzard is four times that; night and height make it worse.
      const h = d.hour(), night = h > 20 || h < 6 ? 1.4 : 1;
      const alt = 1 + Math.max(0, p.pos.y - 400) / 400;
      const wet = p.swimming ? 4 : 1;
      rate = ((1 + snow * 3) * night * alt * wet * (1 - resist)) / 240;
    }
    this.coldRate = rate;
    this.cold = Math.max(0, Math.min(1, this.cold + rate * dt));
    if (f.coldImmune) this.cold = 0;
  }

  /** You drank something: water quenches you, anything wet helps. */
  drink(def: ItemDef) {
    if (!WATERY.test(def.id) && !WATERY.test(def.name) && def.buff?.id !== 'drink') return;
    const water = /water|oasis|spring/i.test(def.id);
    this.thirst = Math.max(0, this.thirst - (water ? 1 : 0.45));
    this.heat = Math.max(0, this.heat - (water ? 0.5 : 0.15));
  }

  update(dt: number) {
    const d = this.d, p = d.player, f = d.fx();
    const desert = d.region() === 'goldenExpanse' && !p.dead;
    const sheltered = d.sheltered(), town = d.inTown();
    const h = d.hour(), noon = h >= 10 && h < 17;
    // Heat: the open sand at midday. Shade, night and the towns cool you.
    if (desert && noon && !sheltered && !town && !f.heatImmune) this.heat = Math.min(1, this.heat + dt / 100);
    else this.heat = Math.max(0, this.heat - dt / (sheltered || town || !noon ? 40 : 80));
    if (f.heatImmune) this.heat = 0;
    // Thirst: anywhere in the Expanse, slower in the towns.
    if (desert && !f.thirstImmune) this.thirst = Math.min(1, this.thirst + dt / (town || sheltered ? 1500 : 520));
    else if (!desert) this.thirst = Math.max(0, this.thirst - dt / 300);
    if (f.thirstImmune) this.thirst = 0;
    this.stepCold(dt, f);
    const storm = desert && !f.sandImmune ? d.storm() : 0;
    // What it does: shows on the buff bar as a debuff while it lasts.
    const B = d.arms.buffs;
    const set = (id: string, label: string, on: boolean, m: Record<string, number>) => {
      if (on) B.set(id, { id, label, left: 2, m });
      else B.delete(id);
    };
    const hk = Math.max(0, (this.heat - 0.4) / 0.6);
    set('heat', this.heat >= 1 ? 'Sunstroke' : 'Heat', hk > 0, { staminaRegen: -0.5 * hk, stamina: -25 * hk, moveSpeed: -0.08 * hk });
    const tk = Math.max(0, (this.thirst - 0.5) / 0.5);
    set('thirst', this.thirst >= 1 ? 'Parched' : 'Thirst', tk > 0, { staminaRegen: -0.3 * tk, manaRegen: -0.3 * tk, heal: -0.3 * tk });
    set('sandstorm', 'Sandstorm', storm > 0.15, { moveSpeed: -0.3 * storm, staminaRegen: -0.15 * storm });
    const ck = Math.max(0, (this.cold - 0.45) / 0.55);
    set('cold', this.cold >= 1 ? 'Freezing' : 'Chilled', ck > 0, { staminaRegen: -0.4 * ck, moveSpeed: -0.12 * ck, attackSpeed: -0.08 * ck });
    // At the end of it, the sun and the dry start to hurt.
    if (this.heat >= 1) p.hp = Math.max(1, p.hp - p.maxHp * 0.006 * dt);
    if (this.thirst >= 1) p.hp = Math.max(1, p.hp - p.maxHp * 0.004 * dt);
    // Frozen through: the cold can kill (it is the one exposure that can).
    if (this.cold >= 1 && (this.frostT += dt) >= 1) {
      this.frostT = 0;
      p.takeDamage(p.maxHp * 0.008);
    }
    // A word when it starts to bite (not every second).
    const warn = (k: 'heat' | 'thirst' | 'storm' | 'cold', v: number, msg: string) => {
      if (v > 0.6 && this.warned[k] < 1) {
        this.warned[k] = 1;
        d.toast(msg);
      } else if (v < 0.3) this.warned[k] = 0;
    };
    warn('heat', this.heat, 'The sun is hammering on you. Find shade, drink water, or take a Heatward.');
    warn('thirst', this.thirst, 'Your mouth is dry as the sand. Drink something.');
    warn('storm', storm, 'The sandstorm leans on you. Every step is work.');
    warn('cold', this.cold, 'The cold is in your bones. Find a fire, a cairn hut or a hot meal, or put on furs.');
    d.flags['exp:heat'] = +this.heat.toFixed(3);
    d.flags['exp:thirst'] = +this.thirst.toFixed(3);
    d.flags['exp:cold'] = +this.cold.toFixed(3);
  }
}
