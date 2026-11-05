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
}

const WATERY = /water|tea|ale|wine|rum|cider|milk|stout|mead|grog|dew|spirit|draught|tonic|phial|brew_|potion|juice|broth|soup/i;

export class Exposure {
  heat = 0;
  thirst = 0;
  private warned = { heat: 0, thirst: 0, storm: 0 };

  constructor(private d: ExposureDeps) {
    this.heat = Number(d.flags['exp:heat'] ?? 0);
    this.thirst = Number(d.flags['exp:thirst'] ?? 0);
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
    // At the end of it, the sun and the dry start to hurt.
    if (this.heat >= 1) p.hp = Math.max(1, p.hp - p.maxHp * 0.006 * dt);
    if (this.thirst >= 1) p.hp = Math.max(1, p.hp - p.maxHp * 0.004 * dt);
    // A word when it starts to bite (not every second).
    const warn = (k: 'heat' | 'thirst' | 'storm', v: number, msg: string) => {
      if (v > 0.6 && this.warned[k] < 1) {
        this.warned[k] = 1;
        d.toast(msg);
      } else if (v < 0.3) this.warned[k] = 0;
    };
    warn('heat', this.heat, 'The sun is hammering on you. Find shade, drink water, or take a Heatward.');
    warn('thirst', this.thirst, 'Your mouth is dry as the sand. Drink something.');
    warn('storm', storm, 'The sandstorm leans on you. Every step is work.');
    d.flags['exp:heat'] = +this.heat.toFixed(3);
    d.flags['exp:thirst'] = +this.thirst.toFixed(3);
  }
}
