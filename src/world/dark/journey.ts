import * as THREE from 'three';
import { events } from '../../core/events';
import { physics, STATIC_ONLY } from '../../physics/physics';
import { heightAt, normalAt } from '../terrainHeight';
import { waterSurfaceAt } from '../waterLevel';
import type { Renderer } from '../../render/renderer';
import type { Player } from '../../player/player';
import type { ThirdPersonCamera } from '../../player/camera';
import type { Realm } from '../../dungeon/realm';
import type { FX } from '../../fx/particles';
import type { DialogueUI } from '../../ui/dialogue';
import type { SunwheelNetwork, WheelNode } from '../../story/sunwheel';
import { DARK_X, DARK_Z, PASSAGES, SCARS, onMap } from './land';
import { Tether, type DarkFlags } from './tether';
import { DarkWorld } from './world';
import { DarkView } from './view';

interface Hooks {
  r: Renderer;
  player: Player;
  cam: ThirdPersonCamera;
  realm: Realm;
  fx: FX;
  flags: DarkFlags;
  network: SunwheelNetwork;
  dialogue: DialogueUI;
  toast(text: string): void;
  save(): void;
  blocked(): boolean;
  menuOpen(): boolean;
  wildWheels(): WheelNode[];
  prepareLiving(at: THREE.Vector3): void;
  mapMode(open: boolean): void;
}

/** The Dawn holds a connection, not a second health pool. Crossing at another
 * wheel changes geography; it never changes a nation's opinion of the hero. */
export class DarkJourney {
  readonly tether: Tether;
  readonly view: DarkView;
  world: DarkWorld | null = null;
  private livingProps = new THREE.Group();
  private extra: WheelNode[];
  private anchor: THREE.Vector3 | null = null;
  private warning = 0;
  constructor(private h: Hooks) {
    this.tether = new Tether(h.flags);
    this.extra = PASSAGES.map((p) => ({ id: p.id, name: p.name, kind: 'ruin', pos: this.placeLivingWheel(p.x, p.z) }));
    h.network.extraNodes = () => [...this.extra, ...h.wildWheels()];
    h.network.passage = (n) => ({
      label: `Use the Dawn • enter the Dark (${this.time(this.tether.capacity)} tether)`,
      run: () => {
        h.dialogue.close();
        this.enter(n.id);
      },
    });
    this.view = new DarkView(
      () => this.recall(),
      (open) => h.mapMode(open)
    );
    this.buildLivingWheels();
    h.r.scene.add(this.livingProps);
    events.on('playerDamaged', (e) => {
      if (this.active && !e.blocked) this.tether.damage(e.amount);
    });
  }
  get active() {
    return this.h.realm.mode === 'dark' && !!this.tether.run;
  }
  get saveAnchor() {
    return this.active ? this.anchor : null;
  }
  private time(s: number) {
    const t = Math.ceil(s);
    return `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, '0')}`;
  }
  private nodes() {
    return this.h.network.nodes();
  }
  get clearings(): [number, number, number][] {
    return this.extra.map((n) => [n.pos.x, n.pos.z, 12]);
  }
  private placeLivingWheel(x: number, z: number) {
    for (const radius of [0, 8, 16, 24, 40, 64])
      for (let i = 0; i < (radius ? 12 : 1); i++) {
        const angle = (i * Math.PI) / 6,
          a = x + Math.cos(angle) * radius,
          b = z + Math.sin(angle) * radius;
        const y = heightAt(a, b),
          water = waterSurfaceAt(a, b);
        if ((water === null || y > water + 0.4) && normalAt(a, b).y > 0.84) return new THREE.Vector3(a, y, b);
      }
    return new THREE.Vector3(x, heightAt(x, z), z);
  }
  private buildLivingWheels() {
    const ringGeo = new THREE.TorusGeometry(1.05, 0.15, 6, 16),
      baseGeo = new THREE.CylinderGeometry(1.4, 1.7, 0.45, 10);
    const stone = new THREE.MeshStandardMaterial({ color: 0x77756c, roughness: 0.9 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xe0bc6d, emissive: 0x826222, emissiveIntensity: 0.55, roughness: 0.6 });
    for (const n of this.extra) {
      const g = new THREE.Group();
      g.position.copy(n.pos);
      const ring = new THREE.Mesh(ringGeo, gold);
      ring.position.y = 1.65;
      g.add(ring);
      const base = new THREE.Mesh(baseGeo, stone);
      base.position.y = 0.08;
      g.add(base);
      this.livingProps.add(g);
      this.h.realm.overworldInteractables.push({
        pos: n.pos,
        radius: 3.6,
        level: 4,
        label: () => `Sunwheel • ${n.name}`,
        enabled: () => !this.h.blocked(),
        action: () => this.h.network.touch(n),
      });
    }
  }
  setLivingVisible(visible: boolean) {
    this.livingProps.visible = visible;
  }
  /** The source must be a physical, nearby wheel: stale dialogue cannot warp. */
  enter(id: string) {
    const h = this.h,
      n = this.nodes().find((n) => n.id === id);
    if (this.active || h.realm.mode !== 'overworld' || h.realm.busy || h.blocked() || h.player.dead || !n || n.pos.distanceTo(h.player.pos) > 9) return false;
    if (h.player.vehicle || h.player.mounted || h.player.swimming) {
      h.toast('Stand on dry ground and dismount before crossing a Sunwheel.');
      return false;
    }
    this.anchor = h.player.pos.clone();
    h.network.attune(n.id);
    this.tether.begin(n.id, n.pos.x + 3.2, n.pos.z);
    if (!this.openWorld()) {
      this.tether.end();
      return false;
    }
    this.attune(n);
    this.warning = 0;
    h.toast('The Dark • thousands of years beneath the living world. Your health remains; your tether is running. Find wheels to extend your connection.');
    this.sync();
    h.save();
    return true;
  }
  private openWorld() {
    const h = this.h,
      run = this.tether.run!;
    const world = new DarkWorld(
      h.r.scene,
      h.fx,
      this.tether,
      (n) => this.touch(n),
      (id, text) => this.memory(id, text)
    );
    world.start(this.nodes());
    if (!h.realm.enterDark(world.ground, world.actions)) {
      world.dispose();
      return false;
    }
    this.world = world;
    let at = world.at(run.x, run.z, 0.4);
    if (run.y !== undefined) at.y = Math.max(at.y, run.y + 0.05);
    world.warm(at);
    physics.step(1 / 60);
    const clear = (p: THREE.Vector3) =>
      !physics.world.intersectionWithShape(
        { x: p.x, y: p.y + 0.92, z: p.z },
        { x: 0, y: 0, z: 0, w: 1 },
        new physics.R.Capsule(0.55, 0.32),
        physics.R.QueryFilterFlags.EXCLUDE_SENSORS,
        STATIC_ONLY
      );
    if (!clear(at)) {
      let safe: THREE.Vector3 | null = null;
      for (const radius of [2, 4, 8, 12, 16]) {
        for (let i = 0; i < 12; i++) {
          const a = (i * Math.PI) / 6,
            candidate = world.at(run.x + Math.cos(a) * radius, run.z + Math.sin(a) * radius, 0.5);
          if (clear(candidate)) {
            safe = candidate;
            break;
          }
        }
        if (safe) break;
      }
      const entry = this.nodes().find((n) => n.id === run.entry)!;
      at = safe ?? world.at(entry.pos.x + 3.2, entry.pos.z, 0.5);
      world.warm(at);
    }
    h.realm.darkRespawn.copy(at);
    h.player.clearCombatInput();
    h.player.act = null;
    h.player.blocking = false;
    h.player.lock = null;
    h.cam.lockTarget = null;
    if (run.hp !== undefined) h.player.hp = Math.min(h.player.maxHp, Math.max(1, run.hp));
    h.player.teleport(at);
    h.cam.snapTo(at);
    this.frame();
    return true;
  }
  private attune(n: WheelNode) {
    const before = this.tether.capacity;
    this.h.network.attune(n.id);
    const livingGain = this.tether.capacity - before;
    const fresh = this.tether.discover('wheel', n.id);
    // Both the living attunement and the ancient echo count, once each.
    if (this.tether.run) this.tether.run.left = Math.min(this.tether.capacity, this.tether.run.left + livingGain);
    if (fresh) {
      this.h.toast(`Ancient Sunwheel attuned • tether capacity ${this.time(this.tether.capacity)} (+${this.tether.capacity - before}s). Its living counterpart now knows you.`);
      this.sync();
      this.h.save();
    }
  }
  touch(n: WheelNode) {
    if (!this.active || !this.near(n)) return;
    this.attune(n);
    const p = PASSAGES.find((p) => p.id === n.id);
    this.h.dialogue.show(
      'The Dawn',
      n.name,
      `Your tether holds steady within this wheel. Emerge at its living counterpart, or continue through the ancient world. ${p?.warning ?? 'The living world waits on the other side.'} Crossing does not grant safe passage from wartime patrols.`,
      [
        {
          label: 'Step into the living world here.',
          run: () => {
            this.h.dialogue.close();
            this.emerge(n.id);
          },
        },
        {
          label: 'Recall to my entry Sunwheel.',
          run: () => {
            this.h.dialogue.close();
            this.recall();
          },
        },
        { label: 'Keep exploring.', run: () => this.h.dialogue.close() },
      ]
    );
  }
  private near(n: WheelNode) {
    const p = this.h.player.pos;
    return !!this.world && this.world.at(n.pos.x, n.pos.z).distanceTo(p) < 5.3;
  }
  private memory(id: string, text: string) {
    if (!this.active || this.h.player.dead) return;
    const s = SCARS.find((s) => s.id === id);
    if (!s || this.world!.at(s.x + s.r * 0.84, s.z).distanceTo(this.h.player.pos) > 4.5) return;
    const before = this.tether.capacity;
    const first = this.tether.discover('memory', id);
    const gain = this.tether.capacity - before;
    this.h.dialogue.show(
      'An ancient memory',
      s.name,
      text +
        (first
          ? gain
            ? ` Your connection deepens: +${gain} seconds of permanent tether.`
            : ' Your tether is already at its full strength. You carry this memory onward.'
          : ' The Dawn remembers this place; its gift is already yours.'),
      [{ label: 'Carry the memory onward.', run: () => this.h.dialogue.close() }]
    );
    this.sync();
    this.h.save();
  }
  private safeLiving(n: WheelNode) {
    this.h.prepareLiving(n.pos);
    // Refresh broad phase after warming destination terrain and structures.
    physics.step(1 / 60);
    const shape = new physics.R.Capsule(0.55, 0.32),
      rot = { x: 0, y: 0, z: 0, w: 1 };
    for (const r of [3.2, 5, 8, 12])
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6,
          x = n.pos.x + Math.cos(a) * r,
          z = n.pos.z + Math.sin(a) * r;
        const y = heightAt(x, z),
          water = waterSurfaceAt(x, z);
        if (!Number.isFinite(y) || (water !== null && water - y > 0.4) || normalAt(x, z).y < 0.72) continue;
        const at = new THREE.Vector3(x, y + 0.22, z);
        if (!physics.world.intersectionWithShape({ x, y: at.y + 0.92, z }, rot, shape, physics.R.QueryFilterFlags.EXCLUDE_SENSORS, STATIC_ONLY)) return at;
      }
    return null;
  }
  emerge(id: string) {
    if (!this.active || this.h.player.dead) return false;
    const n = this.nodes().find((n) => n.id === id);
    if (!n || !this.near(n)) return false;
    const at = this.safeLiving(n);
    if (!at) {
      this.h.toast('The living side is obstructed. Use another wheel, or recall to your entry.');
      return false;
    }
    this.attune(n);
    this.finish(at, `You emerge at ${n.name}. The war has not paused for you.`);
    return true;
  }
  recall() {
    if (!this.active || this.h.player.dead) return false;
    const at = this.anchor?.clone();
    if (!at) return false;
    // A recall retraces the connection to the safe place where this run began.
    this.h.prepareLiving(at);
    at.y = Math.max(at.y, heightAt(at.x, at.z) + 0.3);
    this.finish(at, 'The Dawn draws you back to your entry Sunwheel. Your discoveries remain.');
    return true;
  }
  private finish(at: THREE.Vector3, message: string, save = true) {
    this.h.dialogue.close();
    this.view.toggleMap(false);
    this.world?.dispose();
    this.world = null;
    this.h.realm.leaveDark();
    this.tether.end();
    this.h.player.clearCombatInput();
    this.h.player.act = null;
    this.h.player.blocking = false;
    this.h.player.lock = null;
    this.h.cam.lockTarget = null;
    this.h.player.teleport(at);
    this.h.cam.snapTo(at);
    this.anchor = null;
    this.frame();
    if (message) this.h.toast(message);
    if (save) this.h.save();
  }
  /** Called by the normal death handler after its death-screen delay. */
  recoverDeath() {
    if (!this.active) return false;
    const at = this.anchor?.clone() ?? this.h.realm.respawnPoint;
    this.finish(at, 'Your tether breaks. The Dawn returns your light to its entry wheel.', false);
    this.h.player.respawn(at);
    this.h.cam.snapTo(at);
    this.h.save();
    return true;
  }
  update(dt: number) {
    if (!this.active || !this.world || this.h.player.dead || this.h.menuOpen()) return;
    const run = this.tether.run!,
      p = this.h.player.pos;
    run.x = p.x - DARK_X;
    run.z = p.z - DARK_Z;
    run.y = p.y;
    run.hp = this.h.player.hp;
    if (!onMap(run.x, run.z) || !Number.isFinite(p.y)) {
      this.recall();
      return;
    }
    const nearby = this.nodes().find((n) => this.near(n));
    if (nearby) this.attune(nearby);
    const threatened = [...this.world.foes.values()].some((f) => f.alive && f.position.distanceTo(p) < 15);
    this.tether.tick(dt, !!nearby && !threatened);
    if (run.left <= 0) {
      this.recall();
      this.h.toast('Tether exhausted • the Dawn pulls you back before your connection is lost.');
      return;
    }
    const threshold = run.left <= 10 ? 10 : run.left <= 30 ? 30 : 0;
    if (threshold && threshold !== this.warning) {
      this.warning = threshold;
      this.h.toast(`${threshold} seconds of tether remain. Find a Sunwheel or recall with the tether panel.`);
    }
    this.world.update(dt, this.h.player);
  }
  frame() {
    const run = this.active ? this.tether.run : null;
    this.view.update(run, this.tether.capacity, this.nodes(), this.h.flags, this.h.player.pos, this.h.player.dead, this.h.menuOpen());
  }
  sync() {
    if (this.active && this.tether.run) {
      this.tether.run.x = this.h.player.pos.x - DARK_X;
      this.tether.run.z = this.h.player.pos.z - DARK_Z;
      this.tether.run.y = this.h.player.pos.y;
      this.tether.run.hp = this.h.player.hp;
    }
    this.tether.sync();
    this.h.flags.darkAnchor = this.anchor ? JSON.stringify(this.anchor.toArray()) : '';
  }
  restore() {
    this.tether.restore();
    const run = this.tether.run;
    if (!run || run.hp === 0 || !onMap(run.x, run.z) || !this.nodes().some((n) => n.id === run.entry)) {
      this.tether.end();
      return false;
    }
    try {
      const a = JSON.parse(String(this.h.flags.darkAnchor));
      if (!Array.isArray(a) || a.length !== 3 || !a.every(Number.isFinite) || !onMap(a[0], a[2])) throw Error('anchor');
      this.anchor = new THREE.Vector3(...(a as [number, number, number]));
    } catch {
      this.anchor = this.nodes()
        .find((n) => n.id === run.entry)!
        .pos.clone()
        .add(new THREE.Vector3(3.2, 0.4, 0));
    }
    if (!this.openWorld()) {
      this.tether.end();
      return false;
    }
    return true;
  }
  reset() {
    if (this.active) this.finish(this.anchor!.clone(), '', false);
    else {
      this.world?.dispose();
      this.world = null;
      this.tether.end();
    }
    this.view.toggleMap(false);
    this.anchor = null;
    this.frame();
  }
}
