import * as THREE from 'three';
import { heightAt } from './terrainHeight';
import { buildHouse, type WorldMats } from './buildings';
import { physics } from '../physics/physics';
import { mulberry32 } from '../core/math';
import { events } from '../core/events';
import { newTargetId, targets, type HitInfo, type Target } from '../combat/targets';
import { buildCharacter, type BuiltCharacter, type Look } from '../npc/charBuilder';
import { Bandit, Bolts } from '../enemies/bandit';
import { Voices } from './desert/voices';
import { GRASS_MASKS } from './groundWindow';
import type { FX } from '../fx/particles';
import type { Player } from '../player/player';
import type { Interactable } from '../dungeon/instance';

// The Road to Riches (the north road from Elder Glen up to the crypt hill):
// half-way up, a meadow so thick with flowers it looks painted, a cottage in
// the middle of it, and a little girl, Posy, who plays and sings there all day.
// Nothing points you here. The Gravewood pedestal's riddle does, if you read
// it right: "The prettiest people do the ugliest things on the road to riches
// and diamond rings." Her brother Edric keeps the key she wears round her neck.

/** The meadow beside the road, on the east side of the climb. */
export const MEADOW = { x: 36, z: -190, r: 27 };
export const MEADOW_CLEARING: [number, number, number] = [MEADOW.x, MEADOW.z, MEADOW.r + 4];
const HOUSE = { x: 44, z: -199, yaw: -2.4 };

const POSY_LOOK: Look = { body: 'female', outfit: 'peasant', hair: 'buns', hairColor: 0xd8a85a, skin: 0xfff0e6, linen: 0xf6e4ea, cloth: 0xe0789a, height: 1.2 };
/** Edric as he is now; the sanctum has him again, changed. */
export const EDRIC_LOOK: Look = { body: 'male', outfit: 'peasant', hair: 'simpleparted', hairColor: 0xc8903a, skin: 0xfff0e6, linen: 0xe8dcc0, cloth: 0x5a7a3a, height: 1.7 };

const SONGS = [
  '♪ Daisy, daisy, one for me, two for the bumblebee… ♪',
  '♪ Round and round the buttercup, round and round we go… ♪',
  '♪ The sun came up to see the flowers, and stayed for hours and hours… ♪',
  '♪ La la, la-la la… ♪',
  '♪ Pick a poppy, pick a rose, where the river bendy goes… ♪',
];

export interface RichesHooks {
  flags: Record<string, boolean | number | string>;
  toast(msg: string): void;
  card(title: string, subtitle: string): void;
  bossBar(t: { hp: number; maxHp: number; alive: boolean } | null, name?: string): void;
  talk(who: string, title: string, text: string, onClose?: () => void): void;
  give(item: string, n: number): void;
  take(item: string, n: number): void;
  count(item: string): number;
  save(): void;
}

/** Posy: a child in the flowers. She can be hurt; she is not an enemy. */
class FlowerGirl implements Target {
  id = newTargetId();
  kind = 'flowerGirl';
  alive = true;
  center = new THREE.Vector3();
  radius = 0.35;
  halfHeight = 0.4;
  position = new THREE.Vector3();
  stunned = false;
  lockable = true;
  hp = 18;
  maxHp = 18;
  readonly root = new THREE.Group();
  private built: BuiltCharacter | null = null;
  private acts: Record<string, THREE.AnimationAction> = {};
  private clip = '';
  private target = new THREE.Vector3();
  private wait = 0;
  yaw = 0;
  private deathT = -1;
  onDeath?: (at: THREE.Vector3) => void;

  constructor(private scene: THREE.Scene, private fx: FX) {
    this.position.set(MEADOW.x - 6, 0, MEADOW.z + 4);
    this.position.y = heightAt(this.position.x, this.position.z);
    this.target.copy(this.position);
    scene.add(this.root);
    targets.add(this);
    void buildCharacter(POSY_LOOK, ['idle', 'walk', 'dance', 'cheer', 'hit', 'death', 'crouch']).then((b) => {
      this.built = b;
      for (const a of (b.mixer as unknown as { _actions: THREE.AnimationAction[] })._actions) this.acts[a.getClip().name] = a;
      b.root.traverse((o) => ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true)));
      this.root.add(b.root);
      this.play('dance');
    });
  }
  private play(name: string, once = false) {
    if (this.clip === name) return;
    const next = this.acts[name];
    if (!next) return;
    const prev = this.acts[this.clip];
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.play();
    if (prev && prev !== next) prev.crossFadeTo(next, 0.25, false);
    this.clip = name;
  }
  takeHit(h: HitInfo) {
    if (!this.alive) return;
    this.hp -= h.damage;
    this.fx.add.spawn({ pos: h.at ?? this.center, spread: 1, count: 8, life: [0.3, 0.6], size: [0.05, 0.01], color: 0x8a1a10, color2: 0x300808, gravity: 8 });
    events.emit('enemyHit', { at: this.center.clone(), amount: h.damage, crit: h.crit, enemyId: this.id });
    if (this.hp > 0) {
      // She runs from you.
      const away = this.position.clone().sub(h.at ?? this.center).setY(0).normalize().multiplyScalar(10);
      this.target.copy(this.position).add(away);
      this.wait = 0;
      return;
    }
    this.alive = false;
    this.lockable = false;
    targets.delete(this);
    this.deathT = 0;
    this.play('death', true);
    events.emit('enemyDied', { at: this.center.clone(), enemyId: this.id, kind: this.kind });
    this.onDeath?.(this.position.clone());
  }
  update(dt: number) {
    this.built?.mixer.update(dt);
    if (this.deathT >= 0) {
      this.deathT += dt;
      return;
    }
    const to = this.target.clone().sub(this.position).setY(0);
    const d = to.length();
    if (d > 0.4) {
      const fleeing = this.hp < this.maxHp;
      const sp = fleeing ? 3.2 : 1.4;
      this.yaw = Math.atan2(to.x, to.z);
      this.position.addScaledVector(to.normalize(), Math.min(d, sp * dt));
      this.play('walk');
      const walk = this.acts.walk;
      if (walk) walk.timeScale = fleeing ? 2 : 1.2;
    } else {
      this.wait -= dt;
      this.play(this.wait > 2.5 ? 'dance' : this.wait > 1 ? 'cheer' : 'idle');
      if (this.wait <= 0) {
        // Off to another patch of flowers (never far from the cottage).
        const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * (MEADOW.r - 8);
        this.target.set(MEADOW.x + Math.cos(a) * r, 0, MEADOW.z + Math.sin(a) * r);
        this.wait = 3 + Math.random() * 5;
      }
    }
    this.position.y = heightAt(this.position.x, this.position.z);
    this.root.position.copy(this.position);
    this.root.rotation.y = this.yaw;
    this.center.set(this.position.x, this.position.y + 0.6, this.position.z);
  }
  dispose() {
    targets.delete(this);
    this.scene.remove(this.root);
    this.built?.mixer.stopAllAction();
  }
}

export class RoadToRiches {
  readonly interactables: Interactable[] = [];
  readonly group = new THREE.Group();
  private girl: FlowerGirl | null = null;
  private brother: Bandit | null = null;
  private yielded: { root: THREE.Object3D; mixer: THREE.AnimationMixer; t: number } | null = null;
  private bolts: Bolts;
  private keyMesh: THREE.Group;
  private keyAt = new THREE.Vector3();
  private voices: Voices;
  private songT = 2;
  private wasDead = false;
  private shown = true;
  private flowerMat: THREE.MeshStandardMaterial;
  private t = 0;

  constructor(private scene: THREE.Scene, mats: WorldMats, private fx: FX, camera: THREE.Camera, private player: Player, private hooks: RichesHooks) {
    scene.add(this.group);
    this.bolts = new Bolts(scene);
    this.voices = new Voices(camera, () => player.pos);
    GRASS_MASKS.push({ x: MEADOW.x, z: MEADOW.z, r: MEADOW.r, amount: 0.35 });
    this.flowerMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide });
    this.buildMeadow();
    this.buildCottage(mats);
    // The key Posy wears: it lies where she fell until someone takes it.
    this.keyMesh = buildKey();
    this.keyMesh.visible = false;
    this.group.add(this.keyMesh);
    this.interactables.push({
      pos: this.keyAt, radius: 1.8,
      label: () => 'Take the little iron key',
      enabled: () => this.keyMesh.visible,
      action: () => {
        this.keyMesh.visible = false;
        this.hooks.flags.gwKeyOnGround = false;
        this.hooks.give('gravewoodKey', 1);
        this.hooks.toast('An old iron key on a ribbon. Cold, and heavier than it looks.');
        this.hooks.save();
      },
    });
    if (this.hooks.flags.gwKeyOnGround && typeof this.hooks.flags.gwKeyAt === 'string') {
      const [x, z] = (this.hooks.flags.gwKeyAt as string).split(',').map(Number);
      this.dropKey(new THREE.Vector3(x, 0, z));
    }
  }

  private get girlDead() {
    return !!this.hooks.flags.posyDead;
  }
  private get beaten() {
    return !!this.hooks.flags.edricBeaten;
  }

  // ---- the meadow -----------------------------------------------------------------------------

  private buildMeadow() {
    const rnd = mulberry32(4207);
    // Thousands of flowers: a stem, a cup of petals, a bright heart.
    const parts: THREE.BufferGeometry[] = [];
    const petal = new THREE.ConeGeometry(0.09, 0.08, 6, 1, true);
    petal.rotateX(Math.PI);
    const stem = new THREE.CylinderGeometry(0.008, 0.01, 0.34, 3);
    const col = new THREE.Color();
    const PETALS = [0xf2d84a, 0xe8505a, 0xf6f2ea, 0xb070e0, 0xf08a3a, 0x7aa8f0, 0xf48ac0];
    const N = 3600;
    const flower = new THREE.BufferGeometry();
    const pos: number[] = [], colors: number[] = [];
    const push = (g: THREE.BufferGeometry, m: THREE.Matrix4, c: THREE.Color) => {
      const n = g.index ? g.toNonIndexed() : g;
      const p = n.getAttribute('position');
      const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m);
        pos.push(v.x, v.y, v.z);
        colors.push(c.r, c.g, c.b);
      }
    };
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * MEADOW.r;
      const x = MEADOW.x + Math.cos(a) * r, z = MEADOW.z + Math.sin(a) * r;
      if (Math.hypot(x - HOUSE.x, z - HOUSE.z) < 5) continue;
      const y = heightAt(x, z);
      const sc = 0.7 + rnd() * 0.8;
      q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.3, rnd() * 6.28, (rnd() - 0.5) * 0.3));
      s.setScalar(sc);
      m.compose(new THREE.Vector3(x, y + 0.17 * sc, z), q, s);
      push(stem, m, col.setHex(0x4a8a30));
      m.compose(new THREE.Vector3(x, y + 0.36 * sc, z), q, s);
      push(petal, m, col.setHex(PETALS[Math.floor(rnd() * PETALS.length)]).multiplyScalar(0.9 + rnd() * 0.2));
    }
    flower.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    flower.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    flower.computeVertexNormals();
    parts.push(flower);
    const mesh = new THREE.Mesh(flower, this.flowerMat);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    // A ring of butterflies over the meadow, drifting all day.
    for (let i = 0; i < 18; i++) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.1), new THREE.MeshBasicMaterial({ color: PETALS[i % PETALS.length], side: THREE.DoubleSide }));
      b.userData.seed = i * 1.7;
      b.name = 'butterfly';
      this.group.add(b);
    }
  }

  private buildCottage(mats: WorldMats) {
    const { group, half } = buildHouse({ w: 6.5, d: 5.5, floors: 1, roof: 'thatch', seed: 7731 }, mats);
    const y = heightAt(HOUSE.x, HOUSE.z) - 0.1;
    group.position.set(HOUSE.x, y, HOUSE.z);
    group.rotation.y = HOUSE.yaw;
    group.traverse((o) => ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = (o as THREE.Mesh).receiveShadow = true)));
    this.group.add(group);
    physics.addBox(new THREE.Vector3(HOUSE.x, y + half.y, HOUSE.z), half, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), HOUSE.yaw));
    // A swing on the old oak by the cottage, and a fence of daisies.
    const oak = new THREE.Group();
    const bark = new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 1 });
    const leaves = new THREE.MeshStandardMaterial({ color: 0x4f8a34, roughness: 0.9 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 5, 8), bark);
    trunk.position.y = 2.5;
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(3.2, 1), leaves);
    crown.position.y = 6;
    crown.scale.set(1.2, 0.8, 1.2);
    const bough = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 3.4, 6), bark);
    bough.rotation.z = Math.PI / 2;
    bough.position.set(1.6, 4.2, 0);
    for (const sz of [-0.3, 0.3]) {
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 3, 4), new THREE.MeshStandardMaterial({ color: 0xc8b088 }));
      rope.position.set(2.4, 2.7, sz);
      oak.add(rope);
    }
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.8), bark);
    seat.position.set(2.4, 1.2, 0);
    oak.add(trunk, crown, bough, seat);
    const ox = HOUSE.x - 9, oz = HOUSE.z + 6;
    oak.position.set(ox, heightAt(ox, oz), oz);
    oak.traverse((o) => ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true)));
    this.group.add(oak);
    physics.addCylinder(new THREE.Vector3(ox, heightAt(ox, oz) + 2.5, oz), 2.5, 0.5);
  }

  // ---- the story --------------------------------------------------------------------------------

  private dropKey(at: THREE.Vector3) {
    this.keyAt.set(at.x, heightAt(at.x, at.z) + 0.05, at.z);
    this.keyMesh.position.copy(this.keyAt);
    this.keyMesh.visible = true;
    this.hooks.flags.gwKeyOnGround = true;
    this.hooks.flags.gwKeyAt = `${at.x.toFixed(2)},${at.z.toFixed(2)}`;
  }

  private posyDied(at: THREE.Vector3) {
    this.hooks.flags.posyDead = true;
    this.dropKey(at);
    this.hooks.save();
    // The cottage door bangs open.
    setTimeout(() => {
      this.voices.say(new THREE.Vector3(HOUSE.x, heightAt(HOUSE.x, HOUSE.z) + 2, HOUSE.z), 'Edric', 'POSY? Posy! What have you — what have you DONE?', 'plain', 5);
    }, 900);
  }

  private spawnBrother() {
    const at = new THREE.Vector3(HOUSE.x - 3.5, 0, HOUSE.z + 3);
    at.y = heightAt(at.x, at.z);
    const b = new Bandit('sword', at, this.scene, this.bolts, at.clone(), EDRIC_LOOK);
    b.kind = 'edric';
    b.name = 'Edric, Posy\'s Brother';
    b.maxHp = b.hp = 240;
    b.hitDamage = 11;
    b.pace = 1.35; // slower between swings: he is a farm boy, not a swordsman
    b.nonLethal = true;
    b.alerted = true;
    this.brother = b;
  }

  /** Beaten down to his knees: he yields, swears revenge, and goes back inside. */
  private brotherYields(b: Bandit) {
    const at = b.position.clone();
    b.dispose();
    this.brother = null;
    this.hooks.bossBar(null);
    this.hooks.flags.edricBeaten = true;
    this.hooks.flags.gwKeyWithEdric = false;
    if (!this.hooks.count('gravewoodKey') && !this.keyMesh.visible) this.hooks.give('gravewoodKey', 1);
    this.hooks.save();
    void buildCharacter(EDRIC_LOOK, ['crouch', 'idle']).then((c) => {
      c.root.position.copy(at);
      c.root.rotation.y = Math.atan2(this.player.pos.x - at.x, this.player.pos.z - at.z);
      this.scene.add(c.root);
      const acts = (c.mixer as unknown as { _actions: THREE.AnimationAction[] })._actions;
      (acts.find((a) => a.getClip().name === 'crouch') ?? acts[0])?.play();
      this.yielded = { root: c.root, mixer: c.mixer, t: 0 };
    });
    this.hooks.talk('Edric', 'On his knees in the flowers',
      'Enough… enough. You\'ve beaten me. Take it — take the cursed key, it\'s what you came for, isn\'t it?\n\nBut hear me. I\'ll come back stronger. However long it takes, whatever it costs me, I will find you, and I will kill you. For Posy.');
  }

  update(dt: number) {
    this.t += dt;
    this.voices.update(dt);
    const p = this.player.pos;
    const d = Math.hypot(p.x - MEADOW.x, p.z - MEADOW.z);
    const near = this.shown && d < 160;
    this.group.visible = this.shown && d < 400;
    // Butterflies.
    if (this.group.visible) for (const o of this.group.children) {
      if (o.name !== 'butterfly') continue;
      const s = o.userData.seed as number, tt = this.t * 0.4 + s;
      const x = MEADOW.x + Math.sin(tt * 0.7 + s) * (8 + (s % 9)), z = MEADOW.z + Math.cos(tt * 0.5 + s * 2) * (8 + (s % 7));
      o.position.set(x, heightAt(x, z) + 0.6 + Math.sin(tt * 6) * 0.15, z);
      o.rotation.set(Math.sin(this.t * 20 + s) * 0.9, tt, 0);
    }
    // Posy plays in the flowers until the day someone kills her.
    if (!this.girlDead && near && !this.girl) {
      this.girl = new FlowerGirl(this.scene, this.fx);
      this.girl.onDeath = (at) => this.posyDied(at);
    }
    if (this.girl && (!near && this.girl.alive)) {
      this.girl.dispose();
      this.girl = null;
    }
    if (this.girl) {
      this.girl.update(dt);
      if (this.girl.alive) {
        this.songT -= dt;
        if (this.songT <= 0 && Math.hypot(p.x - this.girl.position.x, p.z - this.girl.position.z) < 30) {
          this.songT = 6 + Math.random() * 5;
          this.voices.say(() => this.girl!.center.clone().setY(this.girl!.center.y + 0.9), 'Posy', SONGS[Math.floor(Math.random() * SONGS.length)], 'plain', 4);
        }
      }
    }
    // Edric: out of the cottage once she's dead, until he has been beaten.
    if (this.girlDead && !this.beaten) {
      if (!this.brother && near && !this.player.dead) {
        this.spawnBrother();
        this.hooks.card('Edric', 'Posy\'s brother');
      }
      const b = this.brother;
      if (b) {
        b.update(dt, this.player);
        this.bolts.update(dt, this.player);
        const engaged = Math.hypot(p.x - b.position.x, p.z - b.position.z) < 40;
        this.hooks.bossBar(engaged ? b : null, b.name);
        if (b.hp <= b.maxHp * 0.12) this.brotherYields(b);
        else if (!near) {
          // Walk away and he goes back inside; he'll be waiting, rested, when you return.
          b.dispose();
          this.brother = null;
          this.hooks.bossBar(null);
        }
      }
      // He kills you: he takes the key back, and is waiting at the cottage, healed, when you return.
      if (this.player.dead && !this.wasDead && this.brother) {
        if (this.hooks.count('gravewoodKey')) this.hooks.take('gravewoodKey', 1);
        this.keyMesh.visible = false;
        this.hooks.flags.gwKeyOnGround = false;
        this.hooks.flags.gwKeyWithEdric = true;
        this.brother.dispose();
        this.brother = null;
        this.hooks.bossBar(null);
        this.hooks.save();
        setTimeout(() => this.hooks.toast('Edric took the key from your hand as you fell.'), 2500);
      }
    }
    this.wasDead = this.player.dead;
    if (this.keyMesh.visible) {
      this.keyMesh.rotation.y += dt * 1.5;
      if (Math.random() < dt * 3) this.fx.add.spawn({ pos: this.keyAt.clone().setY(this.keyAt.y + 0.2), spread: 0.1, count: 1, life: [0.3, 0.6], size: [0.15, 0.02], color: 0xfff0c0, color2: 0xc8a050 });
    }
    if (this.yielded) {
      this.yielded.t += dt;
      this.yielded.mixer.update(dt);
      if (this.yielded.t > 12) {
        this.scene.remove(this.yielded.root);
        this.yielded.mixer.stopAllAction();
        this.yielded = null;
      }
    }
  }

  setVisible(v: boolean) {
    this.shown = v;
    this.group.visible = v;
    if (!v) {
      this.girl?.dispose();
      this.girl = null;
      this.brother?.dispose();
      this.brother = null;
      this.hooks.bossBar(null);
    }
  }
}

/** A small iron key on a pink ribbon. */
export function buildKey() {
  const g = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: 0x6a6a70, metalness: 0.8, roughness: 0.35 });
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 6, 14), iron);
  bow.position.y = 0.06;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 6), iron);
  shaft.rotation.z = Math.PI / 2;
  shaft.position.set(0.15, 0.06, 0);
  const bit = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.015), iron);
  bit.position.set(0.24, 0.04, 0);
  const ribbon = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.008, 4, 16), new THREE.MeshStandardMaterial({ color: 0xe0789a }));
  ribbon.position.set(-0.08, 0.06, 0);
  g.add(bow, shaft, bit, ribbon);
  g.rotation.x = -Math.PI / 2;
  return g;
}
