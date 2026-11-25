import * as THREE from 'three';
import { fieldCatalog, type FieldDef } from './catalog';
import { FRONTS, type Front } from './context';
import { FieldProgress, fieldKey, type FieldFlags } from './progress';
import { FieldScenery, NODE_OFFSETS } from './scenery';
import { heightAt } from '../terrainHeight';
import { waterSurfaceAt } from '../waterLevel';
import { physics } from '../../physics/physics';
import { Bandit, Bolts } from '../../enemies/bandit';
import { Undead } from '../../enemies/undead';
import type { Player } from '../../player/player';
import type { FX } from '../../fx/particles';
import type { WorldMats } from '../buildings';
import type { Interactable } from '../../dungeon/instance';
import type { MapMarker } from '../../ui/worldMap';
import type { DialogueOption } from '../../ui/dialogue';
import { events } from '../../core/events';

export interface FieldNote {
  id: string;
  name: string;
  region: string;
  hint: string;
  text: string;
  done: boolean;
  x: number;
  z: number;
}
interface Hooks {
  scene: THREE.Scene;
  mats: WorldMats;
  player: Player;
  fx: FX;
  flags: FieldFlags;
  avoid: [number, number, number][];
  save(): void;
  toast(s: string): void;
  talk(name: string, title: string, text: string, choices: DialogueOption[]): void;
  close(): void;
  give(id: string, n: number): void;
  has(id: string, n: number): boolean;
  take(id: string, n: number): boolean;
  gold(): number;
  addGold(n: number): void;
  xp(n: number): void;
  ink(x: number, z: number, r: number): void;
  rumor(id: string, x: number, z: number, text: string): void;
}
type Foe = Bandit | Undead;
interface Live {
  scenery: FieldScenery;
  actors: Map<number, Foe>;
}
/** Persistent field stories with bounded scenery and enemy ownership, separate from the main quest. */
export class FrontierLife {
  readonly defs: FieldDef[];
  readonly progress: FieldProgress;
  readonly interactables: Interactable[] = [];
  readonly clearings: [number, number, number][] = [];
  readonly locations = new Map<string, THREE.Vector3>();
  private live = new Map<string, Live>();
  private bolts: Bolts;
  private visible = true;
  private timer = 0;
  private unavailable = new Set<string>();
  enabled = true;
  constructor(private h: Hooks) {
    this.progress = new FieldProgress(h.flags);
    this.bolts = new Bolts(h.scene);
    this.defs = fieldCatalog();
    for (const d of this.defs) {
      const at = this.place(d);
      this.locations.set(d.id, at);
      this.clearings.push([at.x + 10, at.z - 3, 22]);
      if (['cache', 'memory', 'vista', 'rift'].includes(d.kind)) {
        NODE_OFFSETS.forEach(([x, z], i) =>
          this.interactables.push({
            pos: new THREE.Vector3(at.x + x, heightAt(at.x + x, at.z + z) + 0.3, at.z + z),
            radius: 2.6,
            level: 2.7,
            label: () =>
              d.kind === 'rift' ? `Bind ward ${i + 1} · ${d.name}` : i === 2 ? `Recover ${d.kind === 'vista' ? 'the survey' : 'the find'}` : `Read trail mark ${i + 1} · ${d.name}`,
            enabled: () => this.active(d) && !this.progress.done(d) && this.progress.step(d) === i,
            action: () => this.investigate(d, i),
          })
        );
      }
      if (!['cache', 'memory', 'vista'].includes(d.kind))
        this.interactables.push({
          pos: at.clone().add(new THREE.Vector3(d.kind === 'rift' ? 0 : 1, 0.3, d.kind === 'rift' ? 1.8 : 0)),
          radius: 2.8,
          level: 2.7,
          label: () => (this.progress.done(d) ? `Revisit ${d.name}` : d.kind === 'rift' ? 'Seal the Dark breach' : `Talk · ${d.name}`),
          enabled: () => this.active(d) && (d.kind !== 'rift' || this.progress.step(d) === 3),
          action: () => this.situation(d),
        });
    }
  }
  private place(d: FieldDef) {
    let seed = 0;
    for (const c of d.id) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
    const island = ['azure', 'emerald', 'shattered', 'sunken'].includes(d.front);
    for (const r of [0, 20, 40, 65, 95, 130, 180, 240, 320])
      for (let n = 0; n < (r ? 16 : 1); n++) {
        const angle = (n / 16) * Math.PI * 2 + seed * 0.001;
        const x = d.at[0] + Math.cos(angle) * r,
          z = d.at[1] + Math.sin(angle) * r;
        if (this.h.avoid.some(([a, b, rr]) => Math.hypot(x - a, z - b) < (island ? Math.min(12, rr) : rr) + 12)) continue;
        if (this.clearings.some(([a, b, rr]) => Math.hypot(x + 10 - a, z - 3 - b) < rr + 24)) continue;
        if (
          !NODE_OFFSETS.every(([dx, dz]) => {
            const xx = x + dx,
              zz = z + dz,
              y = heightAt(xx, zz),
              water = waterSurfaceAt(xx, zz);
            return (
              Number.isFinite(y) &&
              (water === null || y > water + 0.3) &&
              Math.abs(heightAt(xx + 1.5, zz) - heightAt(xx - 1.5, zz)) < 2.2 &&
              Math.abs(heightAt(xx, zz + 1.5) - heightAt(xx, zz - 1.5)) < 2.2
            );
          })
        )
          continue;
        return new THREE.Vector3(x, heightAt(x, z), z);
      }
    // Keep the authored point for diagnosis, but do not spawn on an unsafe fallback.
    this.unavailable.add(d.id);
    return new THREE.Vector3(d.at[0], heightAt(...d.at), d.at[1]);
  }
  private active(d: FieldDef) {
    return this.enabled && this.visible && this.live.has(d.id) && !this.h.player.dead && !this.h.player.vehicle;
  }
  private reachable(d: FieldDef, node = 0) {
    const at = this.locations.get(d.id)!;
    const [x, z] = NODE_OFFSETS[node];
    return this.active(d) && Math.hypot(this.h.player.pos.x - at.x - x, this.h.player.pos.z - at.z - z) < 4 && Math.abs(this.h.player.pos.y - heightAt(at.x + x, at.z + z)) < 3;
  }
  private changed() {
    this.h.save();
  }
  private discover(d: FieldDef) {
    if (this.progress.discover(d)) {
      this.h.toast(`${d.name} · field note added to Journal (J).`);
      events.emit('siteSeen', { id: 'field:' + d.id, kind: d.kind });
      this.changed();
    }
  }
  private investigate(d: FieldDef, i: number) {
    if (!this.reachable(d, i) || !this.progress.advance(d, i)) return;
    this.discover(d);
    if (d.kind === 'rift') {
      this.h.toast(`Ward ${i + 1} bound. ${i === 2 ? 'The breach answers: defeat its echoes, then seal it.' : 'Follow the next notched stake.'}`);
      if (i === 2) {
        this.progress.begin(d);
        this.spawnFoes(d);
      }
    } else {
      this.h.toast(d.clues[i]);
      if (i === 2) {
        this.finish(d, 'recorded');
        if (d.kind === 'vista') {
          const p = this.locations.get(d.id)!;
          this.h.ink(p.x, p.z, 140);
        }
      }
    }
    this.changed();
  }
  private finish(d: FieldDef, outcome: string) {
    if (!this.progress.finish(d, outcome)) return false;
    if (d.reward.gold) this.h.addGold(d.reward.gold);
    this.h.xp(d.reward.xp);
    if (d.reward.item) this.h.give(d.reward.item, d.reward.count ?? 1);
    events.emit('siteDone', { id: 'field:' + d.id, kind: d.kind });
    this.h.toast(`${this.ending(d)} (+${d.reward.xp} XP${d.reward.gold ? `, ${d.reward.gold} gold` : ''})`);
    this.changed();
    return true;
  }
  private ending(d: FieldDef) {
    return this.h.flags[fieldKey(d.id, 'outcome')] === 'paid'
      ? 'You paid for your own passage. The company still holds the post; the other travelers have not been relieved.'
      : d.ending;
  }
  private situation(d: FieldDef) {
    if (!this.reachable(d) || (d.kind === 'rift' && this.progress.step(d) !== 3)) return;
    this.discover(d);
    const context = FRONTS[d.front];
    if (this.progress.done(d)) {
      this.h.talk(d.name, context.name, this.ending(d), [{ label: 'Farewell.', run: () => this.h.close() }]);
      return;
    }
    if (this.progress.fighting(d)) {
      if (this.progress.clear(d)) {
        this.h.close();
        this.finish(d, d.kind === 'rift' ? 'sealed' : 'fought');
      } else this.h.toast(this.progress.hint(d));
      return;
    }
    const choose = (label: string, run: () => void): DialogueOption => ({
      label,
      run: () => {
        this.h.close();
        if (this.reachable(d) && !this.progress.done(d)) run();
      },
    });
    const options: DialogueOption[] = [];
    if (d.kind === 'refugees') {
      const aid = (id: string, n: number) => {
        if (!this.h.take(id, n)) {
          this.h.toast('You no longer have the supplies.');
          return;
        }
        this.finish(d, 'supplied');
      };
      if (this.h.has('healthPotion', 1)) options.push(choose('Share a Health Draught (1).', () => aid('healthPotion', 1)));
      if (this.h.has('sungrass', 2)) options.push(choose('Prepare Sungrass dressings (2).', () => aid('sungrass', 2)));
      if (!options.length)
        options.push({
          label: 'What do you need?',
          run: () =>
            this.h.talk(
              d.name,
              'Relief supplies',
              'One Health Draught or two Sungrass bundles will get us to the next shelter. Nobody needs to swear allegiance to receive help.',
              [{ label: 'I’ll look for supplies.', run: () => this.h.close() }]
            ),
        });
    } else if (d.kind === 'checkpoint') {
      const proof = d.front === 'crownRoad' && this.h.flags[fieldKey('crown-payroll', 'done')];
      if (this.h.flags['field:pass:' + d.front] || proof)
        options.push(choose(proof ? 'Challenge the forged authority.' : 'Show the civilian safe-conduct.', () => this.finish(d, 'negotiated')));
      const toll = 25 + d.level * 3;
      if (this.h.gold() >= toll)
        options.push(
          choose(`Pay the local toll (${toll} gold).`, () => {
            if (this.h.gold() < toll) {
              this.h.toast('You no longer have enough gold.');
              return;
            }
            this.h.addGold(-toll);
            this.finish(d, 'paid');
          })
        );
      options.push(
        choose('Drive the armed company off.', () => {
          this.progress.begin(d);
          this.spawnFoes(d);
          this.changed();
        })
      );
    } else if (d.kind === 'convoy')
      options.push(
        choose('I’ll clear the raiders from the supply route.', () => {
          this.progress.begin(d);
          this.spawnFoes(d);
          this.changed();
        })
      );
    options.push({
      label: 'Tell me about this front.',
      run: () =>
        this.h.talk(d.name, context.sovereign, context.news, [
          {
            label: 'Mark a local lead.',
            run: () => {
              this.h.close();
              this.report(d.front);
            },
          },
          { label: 'I understand.', run: () => this.situation(d) },
        ]),
    });
    options.push({ label: 'I’ll leave for now.', run: () => this.h.close() });
    this.h.talk(
      d.name,
      context.name,
      context.pressure +
        ' ' +
        (d.kind === 'checkpoint'
          ? 'You can challenge their papers, pay for passage, or fight.'
          : d.kind === 'convoy'
            ? 'The wagons are waiting until the nearby raiders are gone.'
            : 'These travelers need medicine, not another enlistment oath.'),
      options
    );
  }
  private spawnFoes(d: FieldDef) {
    const live = this.live.get(d.id);
    if (!live || !this.progress.fighting(d) || this.progress.clear(d)) return;
    const at = this.locations.get(d.id)!;
    for (let i = 0; i < this.progress.enemyCount(d); i++) {
      if (live.actors.has(i) || this.progress.defeated(d) & (1 << i)) continue;
      let x = at.x + 16 + i * 3,
        z = at.z - 12;
      const water = waterSurfaceAt(x, z);
      if (water !== null && heightAt(x, z) < water + 0.2) {
        x = at.x + 12;
        z = at.z - 10 + i;
      }
      const p = new THREE.Vector3(x, heightAt(x, z) + 0.1, z);
      let foe: Foe;
      if (d.kind === 'rift') {
        const u = new Undead(i ? 'zombie' : 'skeleton', p, Math.PI, this.h.scene, this.h.fx);
        u.hp = u.maxHp = 110 + d.level * 38;
        u.level = d.level;
        u.damageScale = 1 + d.level * 0.065;
        foe = u;
      } else {
        const b = new Bandit(i === 2 ? 'crossbow' : 'sword', p, this.h.scene, this.bolts, p.clone(), {
          body: i % 2 ? 'female' : 'male',
          outfit: 'ranger',
          hair: 'buzzed',
          hairColor: 0x38312d,
          skin: 0xb9866a,
          cloth: FRONTS[d.front].color,
          hood: true,
          height: 1.8,
        });
        b.name = FRONTS[d.front].raiders;
        b.level = d.level;
        b.hp = b.maxHp = 180 + d.level * 48;
        b.hitDamage = 14 + d.level * 2.2;
        foe = b;
      }
      live.actors.set(i, foe);
    }
  }
  update(dt: number, enabled = true) {
    this.visible = enabled;
    if (!enabled || !this.enabled) {
      if (this.live.size) this.reset();
      return;
    }
    const player = this.h.player,
      p = player.pos;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.4;
      const nearby = this.defs
        .filter((d) => !this.unavailable.has(d.id) && this.locations.get(d.id)!.distanceTo(p) < 190)
        .sort((a, b) => this.locations.get(a.id)!.distanceToSquared(p) - this.locations.get(b.id)!.distanceToSquared(p))
        .slice(0, 3);
      const wanted = new Set(nearby.map((d) => d.id));
      for (const id of this.live.keys()) if (!wanted.has(id)) this.unload(id);
      for (const d of nearby) {
        if (!this.live.has(d.id))
          this.live.set(d.id, { scenery: new FieldScenery(this.h.scene, d, this.locations.get(d.id)!, this.h.mats, this.progress.done(d)), actors: new Map() });
        this.spawnFoes(d);
      }
    }
    for (const [id, l] of this.live) {
      const d = this.defs.find((d) => d.id === id)!,
        at = this.locations.get(id)!;
      if (at.distanceTo(p) < 42 && physics.lineOfSight(player.center, at.clone().add(new THREE.Vector3(0, 1.2, 0)))) this.discover(d);
      l.scenery.update(dt, this.progress.step(d), this.progress.done(d));
      const crowd = [...l.actors.values()].filter((a): a is Undead => a instanceof Undead);
      for (const [index, foe] of l.actors) {
        if (!foe.alive && !(this.progress.defeated(d) & (1 << index))) {
          this.progress.defeat(d, index);
          this.changed();
        }
        if (foe instanceof Bandit) foe.update(dt, player);
        else foe.update(dt, player, crowd);
      }
    }
    this.bolts.update(dt, player);
  }
  /** Road reports reveal one nearby lead, never every undiscovered site on the map. */
  report(front?: Front) {
    const d = this.defs
      .filter((d) => !this.unavailable.has(d.id) && (!front || d.front === front) && !this.progress.done(d) && !this.h.flags[fieldKey(d.id, 'heard')])
      .sort((a, b) => this.locations.get(a.id)!.distanceToSquared(this.h.player.pos) - this.locations.get(b.id)!.distanceToSquared(this.h.player.pos))[0];
    if (!d) {
      this.h.toast(front ? FRONTS[front].news : 'No new local reports.');
      return;
    }
    const at = this.locations.get(d.id)!;
    this.h.flags[fieldKey(d.id, 'heard')] = true;
    this.h.rumor(d.id, at.x, at.z, d.name);
    this.h.toast(`A local lead: ${d.name}. Check your field notes and map.`);
    this.changed();
  }
  notes(): FieldNote[] {
    return this.defs
      .filter((d) => this.progress.seen(d) || this.h.flags[fieldKey(d.id, 'heard')])
      .map((d) => {
        const p = this.locations.get(d.id)!,
          seen = this.progress.seen(d);
        return {
          id: d.id,
          name: d.name,
          region: FRONTS[d.front].name,
          done: this.progress.done(d),
          hint: this.progress.hint(d),
          text: this.progress.done(d) ? this.ending(d) : FRONTS[d.front].news,
          x: p.x + (seen ? 0 : 35),
          z: p.z - (seen ? 0 : 25),
        };
      });
  }
  markers(): MapMarker[] {
    return this.defs
      .filter((d) => this.progress.seen(d))
      .map((d) => {
        const p = this.locations.get(d.id)!;
        return {
          x: p.x,
          z: p.z,
          kind: this.progress.done(d) ? 'siteDone' : 'site',
          glyph: d.kind === 'rift' ? '◊' : '◇',
          color: d.kind === 'rift' ? '#bd96db' : '#cbbd8b',
          label: d.name,
        };
      });
  }
  hostileAt(p: THREE.Vector3) {
    return [...this.live.values()].some((l) => [...l.actors.values()].some((a) => a.alive && a.position.distanceTo(p) < 45));
  }
  private unload(id: string) {
    const l = this.live.get(id);
    if (!l) return;
    const d = this.defs.find((d) => d.id === id)!;
    for (const [index, foe] of l.actors) {
      if (!foe.alive && !(this.progress.defeated(d) & (1 << index))) {
        this.progress.defeat(d, index);
        this.changed();
      }
      foe.dispose();
    }
    l.scenery.dispose();
    this.live.delete(id);
  }
  reset() {
    for (const id of [...this.live.keys()]) this.unload(id);
    this.bolts.clear();
    this.timer = 0;
  }
  setVisible(v: boolean) {
    this.visible = v;
    if (!v) this.reset();
  }
  get stats() {
    return {
      sites: this.defs.length,
      unavailable: this.unavailable.size,
      live: this.live.size,
      actors: [...this.live.values()].reduce((n, l) => n + l.actors.size, 0),
      found: this.notes().length,
    };
  }
  /** Read-only encounter bodies for the existing developer console. */
  actors(id: string) {
    return [...(this.live.get(id)?.actors.values() ?? [])];
  }
}
