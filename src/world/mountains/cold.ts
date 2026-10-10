import * as THREE from 'three';
import { WARMTH } from '../../items/mountainItems';
import { roadNear, MTN_BOUNDS } from './mountainData';
import type { Player } from '../../player/player';
import type { WeatherParams } from '../weather';

// The cold (docs/design/mountains.md §5, decision 1): a warmth meter above
// the stamina bar that only exists in the snow zones. Wind, snow, water,
// height and night drain it; warm clothes, a hot meal, a dwarf's blood, a
// fire, a hut or an inn hold it off or fill it again. Gentle on the road with
// a cloak and a meal in you; it bites off the road and in a blizzard. At zero
// you take frost damage and move slowly.

/** Above this the passes are snow country (the region's snowline, metres). */
export const SNOWLINE = 300;

export interface ColdInputs {
  weather: WeatherParams;
  night: number;
  /** fires and hearths near you */
  fires: THREE.Vector3[];
  shelters: { pos: THREE.Vector3; r: number }[];
  origin: string;
}

export class ColdMeter {
  /** 1 warm .. 0 frozen */
  value = 1;
  /** in the cold at all (the meter shows) */
  active = false;
  /** a hot meal's warmth, seconds left */
  meal = 0;
  /** what's warming you right now (for the HUD line) */
  source = '';
  rate = 0;
  private el: HTMLElement | null = null;
  private fill: HTMLElement | null = null;
  private note: HTMLElement | null = null;
  private frostT = 0;

  /** How well you're wrapped up (0..0.85). */
  warmth(player: Player, origin: string) {
    let w = 0;
    for (const uid of Object.values(player.equip.equipped)) {
      const it = player.equip.get(uid as number);
      if (it) w += WARMTH[it.def.id] ?? 0;
    }
    if (this.meal > 0) w += 0.4;
    // Dwarves were born to it.
    if (origin === 'dwarf') w += 0.35;
    return Math.min(0.85, w);
  }

  /** Is this point in the cold country? */
  static cold(p: THREE.Vector3) {
    const B = MTN_BOUNDS;
    return p.x > B.x0 - 200 && p.x < B.x1 + 300 && p.z < B.z1 + 150 && p.z > B.z0 - 300 && p.y > SNOWLINE;
  }

  update(dt: number, player: Player, c: ColdInputs) {
    this.meal = Math.max(0, this.meal - dt);
    const p = player.pos;
    this.active = ColdMeter.cold(p) && !player.dead;
    if (!this.active) {
      this.value = Math.min(1, this.value + dt * 0.05);
      this.rate = 0;
      this.paint();
      return;
    }
    const w = c.weather;
    const fire = c.fires.some((f) => f.distanceTo(p) < 6);
    const shelter = c.shelters.some((s) => Math.hypot(s.pos.x - p.x, s.pos.z - p.z) < s.r);
    const blizzard = w.snow > 0.8 && w.wind > 0.8 ? 1 : 0;
    const height = Math.max(0, (p.y - SNOWLINE) / 450);
    const offRoad = roadNear(p.x, p.z)[0] > 30 ? 1 : 0;
    let loss = 0.0028 * (1 + w.wind * 1.2 + w.snow * 0.8 + blizzard * 2.2 + c.night * 0.6 + height + offRoad * 0.7 + (player.swimming ? 4 : 0));
    loss *= 1 - this.warmth(player, c.origin);
    if (shelter) loss *= 0.15;
    const gain = fire ? 0.09 : shelter ? 0.03 : 0;
    this.rate = gain - loss;
    this.value = Math.max(0, Math.min(1, this.value + this.rate * dt));
    this.source = fire ? 'Warming by the fire' : shelter ? 'Out of the wind' : this.meal > 0 ? 'A hot meal in you' : blizzard ? 'Blizzard!' : '';
    // Frozen: frost damage and heavy limbs.
    if (this.value <= 0) {
      this.frostT += dt;
      if (this.frostT > 1) {
        this.frostT = 0;
        player.takeDamage(Math.max(2, player.maxHp * 0.03));
      }
      player.mods.moveSpeed *= 0.6;
    } else if (this.value < 0.25) player.mods.moveSpeed *= 0.85;
    this.paint();
  }

  /** The bar sits above the stamina bar in the vitals (a small HUD hook, no HUD changes). */
  private paint() {
    if (!this.el) {
      const vit = document.querySelector('#ui .vitals');
      const st = vit?.querySelector('.bar.st');
      if (!vit || !st) return;
      const style = document.createElement('style');
      style.textContent = '.bar.cold .fill{background:linear-gradient(180deg,#d8f0ff,#7ab8e8 60%,#2a5a8a)}.bar.cold.freezing{animation:barflash .9s ease-out infinite}.bar.cold .coldnote{position:absolute;right:calc(100% + 72px);top:50%;transform:translateY(-50%);font:600 9px/1 var(--sans);color:#bfe0ff;white-space:nowrap;text-shadow:0 1px 2px #000}';
      document.head.appendChild(style);
      const el = document.createElement('div');
      el.className = 'bar cold';
      el.innerHTML = '<span class="label">WARMTH</span><div class="fill"></div><span class="coldnote"></span>';
      el.style.width = '180px';
      vit.insertBefore(el, st);
      this.el = el;
      this.fill = el.querySelector('.fill');
      this.note = el.querySelector('.coldnote');
    }
    this.el.style.display = this.active ? '' : 'none';
    if (!this.active) return;
    this.fill!.style.transform = `scaleX(${this.value.toFixed(3)})`;
    this.el.classList.toggle('freezing', this.value <= 0);
    this.note!.textContent = this.value <= 0 ? 'FREEZING' : this.source;
  }

  hide() {
    if (this.el) this.el.style.display = 'none';
  }
}
