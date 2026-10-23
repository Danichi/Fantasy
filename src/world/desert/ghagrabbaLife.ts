import * as THREE from 'three';
import { mulberry32 } from '../../core/math';
import { physics } from '../../physics/physics';
import { heightAt } from '../terrainHeight';
import { Bandit, Bolts } from '../../enemies/bandit';
import { sunspireY, SCAV_CAMPS, SUNSPIRE, campFloor } from './desertLayout';
import { cellWorld, cellTop, isStreet, cityDoors } from './cityGrid';
import {
  COURT_CENTER, GREAT_WELL, SUN_SHRINE, BAZAAR, ARTISANS, EAST_GATE, MAIN_STREET_J, AVENUE_J, RUST_MARKET, WAYSTOP,
  streetPath, pathLength, along, cityGround, tavernDoor, type XZ,
} from './ghagrabbaPlaces';
import * as P from './ghagrabbaProps';
import { Puppet, LOOKS } from './puppet';
import { Voices, type VoiceStyle } from './voices';
import { desertAudio, Murmur, OUD_TUNE, MAQSUM } from './desertAudio';
import { NOTICES } from '../../quests/ghagrabbaSide';
import { CITY_LINES } from './sunspireFolk';
import type { Interactable } from '../../dungeon/instance';
import type { Look } from '../../npc/charBuilder';
import type { Species, Range } from '../fauna';
import type { GhagrabbaDeps, Service } from './ghagrabbaTypes';

// Ghagrabba's street life. The city's residents keep their schedules through
// the NPC system; this is everything on top: criers ringing the bazaar open,
// the Queen's procession twice a day, Sun Guard patrols (with lanterns and
// the hour called at night), musicians and a dancer in the artisans' square,
// a fire-breather after dark, a snake charmer in the Court, children at their
// games, the dawn and dusk rites before the Sun Disc, and the night braziers.
// Then the furniture: awnings, jars, rugs, lanterns, stalls, carts, camels,
// the Great Well and the bazaar fountain, a notice wall, a seer's tent and
// Ubaid's dice table. Scripted people exist only near the player.

const cw = (i: number, j: number): XZ => cellWorld(i, j);
const v3 = (p: XZ, y = 0) => new THREE.Vector3(p[0], y, p[1]);
const inHours = (h: number, a: number, b: number) => (a <= b ? h >= a && h < b : h >= a || h < b);
const pick = <T,>(a: T[], r = Math.random()) => a[Math.floor(r * a.length) % a.length];

/** Fauna herds for Ghagrabba's squares (main.ts adds them to the Fauna system). */
export function ghagrabbaHerds(): { species: Species; count: number; range: Range }[] {
  const r = (p: XZ, radius: number): Range => ({ center: v3(p), radius });
  return [
    { species: 'pigeon', count: 10, range: r(COURT_CENTER, 12) },
    { species: 'pigeon', count: 8, range: r([BAZAAR[0] + 3, BAZAAR[1] - 2], 8) },
    { species: 'pigeon', count: 6, range: r(ARTISANS, 7) },
    { species: 'cat', count: 3, range: r(BAZAAR, 14) },
    { species: 'cat', count: 2, range: r(ARTISANS, 10) },
    { species: 'cat', count: 2, range: r(cw(199, 92), 18) },
    { species: 'donkey', count: 2, range: r([EAST_GATE[0] + 18, EAST_GATE[1] - 22], 8) },
    { species: 'chicken', count: 5, range: r(cw(140, 88), 8) },
    { species: 'dog', count: 1, range: r(RUST_MARKET, 18) },
    { species: 'donkey', count: 1, range: r(RUST_MARKET, 12) },
    { species: 'chicken', count: 4, range: r(WAYSTOP, 10) },
  ];
}

/** A scripted group that exists only while it is on and the player is near. */
abstract class Act {
  puppets: Puppet[] = [];
  near = false;
  constructor(protected life: GhagrabbaLife) {}
  /** where it is right now (for distance checks), or null when it isn't happening */
  abstract where(): THREE.Vector3 | null;
  abstract spawn(): void;
  abstract tick(dt: number, d: number): void;
  radius = 120;
  update(dt: number, player: THREE.Vector3) {
    const at = this.where();
    const d = at ? at.distanceTo(player) : Infinity;
    const want = !!at && d < this.radius && this.life.shown;
    if (want && !this.near) {
      this.near = true;
      this.spawn();
    } else if (!want && this.near && (!at || d > this.radius + 30 || !this.life.shown)) {
      this.near = false;
      this.clear();
    }
    if (this.near) {
      this.tick(dt, d);
      for (const p of this.puppets) p.update(dt);
    }
  }
  clear() {
    for (const p of this.puppets) p.dispose();
    this.puppets = [];
  }
  protected puppet(look: Look, at: XZ, yaw = 0) {
    const p = new Puppet(this.life.d.scene, look, at, undefined, yaw);
    p.ground = cityGround;
    this.puppets.push(p);
    return p;
  }
}

export class GhagrabbaLife {
  readonly interactables: Interactable[] = [];
  readonly services = new Map<string, Service>();
  readonly group = new THREE.Group();
  readonly voices: Voices;
  shown = true;
  private built = false;
  private acts: Act[] = [];
  private murmur = new Murmur();
  private flames: THREE.InstancedMesh | null = null;
  private flameSpots: THREE.Vector3[] = [];
  private lanternMat = new THREE.MeshStandardMaterial({ color: 0xffd090, emissive: 0xffa040, emissiveIntensity: 0, roughness: 0.4, metalness: 0.3 });
  private camels: { neck: THREE.Object3D; tail: THREE.Object3D; seed: number; at: THREE.Vector3 }[] = [];
  private shrineDisc: THREE.Mesh | null = null;
  private fountainAt = new THREE.Vector3();
  private festival: THREE.Group | null = null;
  private rustRow: THREE.Group | null = null;
  private bolts: Bolts;
  private cheat: Bandit | null = null;
  private t = 0;
  private lastHour = -1;
  rite = { on: false, dusk: false };

  constructor(readonly d: GhagrabbaDeps) {
    d.scene.add(this.group);
    this.voices = new Voices(d.camera, () => d.player.pos);
    this.bolts = new Bolts(d.scene);
    this.acts.push(
      new Crier(this, cw(218, 70), ['Sun-silk! Sun-silk from the palace looms!', 'Sunsteel from Hekat\'s forge — curved as the dunes, sharp as the noon!', 'Spice! Saffron, cumin, desert pepper — Nakht\'s finest!', 'Water at a copper a cup, while the Well still gives it!', 'Dates! Dates! Sweeter than a Vizier\'s promise!'], 'Ahmes the Crier', 0),
      new Crier(this, cw(238, 118), ['Welcome, travellers, to Ghagrabba, jewel of the Sunborn!', 'Rooms at the Oasis Rest! Clean water, no scorpions, mostly!', 'Caravan from the coast this evening — glass, salt and news!', 'By order of the Crown: weapons sheathed inside the walls!'], 'Djedi the Crier', 1),
      new Procession(this),
      new Patrol(this, [cw(238, 118), cw(218, 72), cw(150, 90), cw(199, 120)], 0),
      new Patrol(this, [cw(36, 128), cw(86, 75), cw(150, 127)], 0.5),
      new Performers(this),
      new FireBreather(this),
      new SnakeCharmer(this),
      new Children(this),
      new Rite(this),
      new RustRow(this),
    );
    this.buildInteractables();
    this.buildServices();
  }

  get hour() {
    return this.d.time.hour;
  }
  /** real seconds per game hour */
  get sph() {
    return (this.d.time.dayLengthMin * 60) / 24;
  }
  get night() {
    const h = this.hour;
    return h >= 19.5 || h < 5.5;
  }
  get ending() {
    return (this.d.flags.sbEnding as string | undefined) ?? '';
  }

  say(at: THREE.Vector3 | (() => THREE.Vector3), who: string, text: string, style: VoiceStyle = 'plain', seconds = 4.5) {
    return this.voices.say(at, who, text, style, seconds);
  }
  /** 0..1 loudness for a sound at `p`, falling to nothing by `range` metres. */
  loud(p: THREE.Vector3, range = 45) {
    return this.shown ? THREE.MathUtils.clamp(1 - p.distanceTo(this.d.player.pos) / range, 0, 1) : 0;
  }

  // ---- static furniture -------------------------------------------------------------------------------

  private build() {
    this.built = true;
    const rnd = mulberry32(5150);
    const y0 = sunspireY();
    const at = (i: number, j: number) => {
      const [x, z] = cw(i, j);
      return new THREE.Vector3(x, y0 + Math.max(0, cellTop(i, j)), z);
    };
    const doors = cityDoors();
    const awnCols = [0x1f7a7a, 0xb8402e, 0xd4a640, 0x5a2a7a, 0xe8dcc0, 0x2a5a8a, 0xc8641e];
    const awnM: THREE.Matrix4[] = [], awnC: THREE.Color[] = [], jarM: THREE.Matrix4[] = [], jarC: THREE.Color[] = [], lanM: THREE.Matrix4[] = [];
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    for (const dr of doors) {
      if (dr.kind === 'palace') continue;
      const dir = new THREE.Vector3(dr.di, 0, dr.dj);
      const hit = physics.castRay(new THREE.Vector3(dr.x, y0 + 1.2, dr.z), dir, 8);
      if (hit === null) continue;
      const wall = new THREE.Vector3(dr.x, y0, dr.z).addScaledVector(dir, hit - 0.05);
      q.setFromAxisAngle(up, dr.yaw);
      if (dr.kind !== 'home' || dr.seed % 3 !== 0) {
        awnM.push(new THREE.Matrix4().compose(wall, q, one));
        awnC.push(new THREE.Color(dr.kind === 'shop' ? awnCols[dr.seed % 4] : awnCols[dr.seed % awnCols.length]));
        if (dr.seed % 2 === 0 || dr.kind !== 'home') {
          const lp = wall.clone().addScaledVector(dir, -1.35).setY(y0 + 2.75);
          lanM.push(new THREE.Matrix4().compose(lp, q, one));
        }
      }
      // A cluster of jars beside the door.
      const side = new THREE.Vector3(-dr.dj, 0, dr.di);
      const n = dr.kind === 'shop' ? 3 : dr.seed % 3;
      for (let k = 0; k < n; k++) {
        const p = wall.clone().addScaledVector(dir, -0.4 - (k % 2) * 0.35).addScaledVector(side, (dr.seed % 2 ? 1 : -1) * (1.2 + k * 0.45));
        const s = 0.75 + ((dr.seed + k * 7) % 5) * 0.1;
        jarM.push(new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromAxisAngle(up, k * 1.7), new THREE.Vector3(s, s, s)));
        jarC.push(new THREE.Color([0xb0623a, 0xa8744e, 0xc8946a, 0x8a4a2a][(dr.seed + k) % 4]));
      }
    }
    const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, ms: THREE.Matrix4[], cs?: THREE.Color[]) => {
      const m = new THREE.InstancedMesh(geo, mat, Math.max(1, ms.length));
      ms.forEach((x, i) => m.setMatrixAt(i, x));
      cs?.forEach((c, i) => m.setColorAt(i, c));
      m.count = ms.length;
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
      return m;
    };
    inst(P.awningGeometry(), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, side: THREE.DoubleSide }), awnM, awnC);
    inst(P.jarGeometry(), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), jarM, jarC);
    inst(P.lanternGeometry(), this.lanternMat, lanM);
    // Rugs laid out for sale round the bazaar, and the night braziers down the long streets.
    const rugM: THREE.Matrix4[] = [], rugC: THREE.Color[] = [];
    const rugCols = [0x8a2a2a, 0x2a4a7a, 0x6a2a5a, 0xb8642a, 0x1f6a6a];
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + 0.2, rr = 3 + (k % 3);
      const i = Math.round(215 + Math.cos(a) * rr), j = Math.round(64 + Math.sin(a) * rr);
      if (!isStreet(i, j)) continue;
      rugM.push(new THREE.Matrix4().compose(at(i, j), new THREE.Quaternion().setFromAxisAngle(up, a), one));
      rugC.push(new THREE.Color(rugCols[k % rugCols.length]));
    }
    inst(P.rugGeometry(), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), rugM, rugC);
    const brM: THREE.Matrix4[] = [];
    const brazierAt = (i: number, j: number) => {
      if (!isStreet(i, j) || !isStreet(i, j - 2) || !isStreet(i, j + 2)) return;
      // On the edge of the street, not the middle of it.
      let jj = j;
      while (isStreet(i, jj + 1) && jj - j < 3) jj++;
      const p = at(i, jj);
      brM.push(new THREE.Matrix4().compose(p, q.identity(), one));
      this.flameSpots.push(p);
    };
    for (let i = 20; i < 236; i += 9) brazierAt(i, MAIN_STREET_J);
    for (let i = 24; i < 214; i += 11) brazierAt(i, AVENUE_J);
    inst(P.brazierStandGeometry(), P.std(0x8a5a2a, 0.5, 0.7), brM);
    this.flames = inst(P.flameGeometry(), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85 }), brM);
    this.flames.castShadow = false;

    // Stalls in the artisans' square and along the avenue, carts, the seer's tent, the dice table, palms: one baked mesh.
    const props: THREE.Object3D[] = [];
    const place = (o: THREE.Object3D, p: THREE.Vector3, yaw: number) => {
      o.position.copy(p);
      o.rotation.y = yaw;
      props.push(o);
      return o;
    };
    const cols = [0x1f7a7a, 0xb8402e, 0xd4a640, 0x5a2a7a, 0x2a5a8a];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.3;
      const i = Math.round(86 + Math.cos(a) * 7), j = Math.round(71 + Math.sin(a) * 7);
      if (!isStreet(i, j) || cellTop(i, j) > 1) continue;
      place(P.stall(cols[k % cols.length], rnd), at(i, j), -a + Math.PI / 2);
    }
    for (let i = 40; i < 200; i += 23) {
      for (const j of [AVENUE_J - 2, AVENUE_J + 2]) {
        if (!isStreet(i, j) || !isStreet(i, j + (j < AVENUE_J ? -2 : 2))) continue;
        place(P.stall(cols[(i + j) % cols.length], rnd), at(i, j), j < AVENUE_J ? 0 : Math.PI);
        break;
      }
    }
    for (const [i, j, yaw] of [[220, 70, 0.6], [236, 112, 2.2], [90, 66, 4], [150, 129, 1.4], [60, 90, 3]] as const) if (isStreet(i, j)) place(P.cart(rnd), at(i, j), yaw);
    place(P.seerTent(), v3([BAZAAR[0] - 7.5, BAZAAR[1] + 7], y0), Math.PI * 0.8);
    place(P.noticeBoard(), this.noticeAt.clone().setY(cityGround(this.noticeAt.x, this.noticeAt.z)), Math.PI / 2);
    const tav = tavernDoor();
    if (tav) place(P.diceTable(), v3(tav.at, cityGround(tav.at[0], tav.at[1])), tav.door.yaw);
    for (const p of this.palms) place(P.palm(0.95), p.clone().setY(cityGround(p.x, p.z)), p.x * 7);
    const well = P.greatWell();
    place(well.group, v3(GREAT_WELL, cityGround(...GREAT_WELL)), 0);
    physics.addCylinder(v3(GREAT_WELL, cityGround(...GREAT_WELL) + 0.6), 0.6, 2.05);
    const ftn = P.fountain();
    this.fountainAt.copy(v3(BAZAAR, cityGround(...BAZAAR)));
    place(ftn.group, this.fountainAt, 0);
    physics.addCylinder(this.fountainAt.clone().setY(this.fountainAt.y + 0.4), 0.4, 2.6);
    const shrine = P.sunShrine();
    const sAt = v3(SUN_SHRINE, cityGround(...SUN_SHRINE));
    shrine.group.position.copy(sAt);
    shrine.group.rotation.y = Math.PI / 2;
    shrine.group.updateMatrixWorld(true);
    // The disc stays its own mesh so it can blaze during the rites.
    const disc = shrine.disc;
    const discWorld = new THREE.Vector3();
    disc.getWorldPosition(discWorld);
    shrine.group.remove(disc);
    props.push(shrine.group);
    physics.addBox(sAt.clone().setY(sAt.y + 1.4), new THREE.Vector3(1.0, 1.4, 1.3));
    disc.material = new THREE.MeshStandardMaterial({ color: 0xe8b850, emissive: 0xffb040, emissiveIntensity: 0.2, roughness: 0.3, metalness: 0.85 });
    disc.position.copy(discWorld);
    disc.rotation.set(0, Math.PI / 2, Math.PI / 2);
    this.shrineDisc = disc;
    this.group.add(disc);
    this.group.add(P.bake(props, 'gh-props'));

    // Camels: kneeling and standing, at the caravanserai outside the east gate, the Rust Market and the Waystop.
    const herd: [number, number, boolean, number][] = [
      [EAST_GATE[0] + 16, EAST_GATE[1] - 18, true, 0.3], [EAST_GATE[0] + 21, EAST_GATE[1] - 21, false, 1.2], [EAST_GATE[0] + 26, EAST_GATE[1] - 16, true, 2.4],
      [EAST_GATE[0] + 14, EAST_GATE[1] + 20, false, -0.4], [EAST_GATE[0] + 20, EAST_GATE[1] + 24, true, 0.9],
      [RUST_MARKET[0] + 12, RUST_MARKET[1] + 6, true, 1.9], [RUST_MARKET[0] + 9, RUST_MARKET[1] - 11, false, 3.1], [RUST_MARKET[0] - 13, RUST_MARKET[1] + 4, true, 0.2],
      [WAYSTOP[0] + 10, WAYSTOP[1] + 8, false, 2.2], [WAYSTOP[0] + 13, WAYSTOP[1] + 4, true, 1.1],
    ];
    herd.forEach(([x, z, kneel, yaw], k) => {
      const c = P.camel(kneel, [0xc49a62, 0xb08050, 0xd8b07a][k % 3], [0x8a2a2a, 0x1f7a7a, 0x5a2a7a][k % 3]);
      const camp = SCAV_CAMPS.find(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r + 20);
      const y = camp ? campFloor(camp[0], camp[1]) : heightAt(x, z);
      c.group.position.set(x, y, z);
      c.group.rotation.y = yaw;
      // The body bakes; the neck and tail stay loose to move.
      c.group.remove(c.neck, c.tail);
      c.group.updateMatrixWorld(true);
      const body = P.bake([c.group], 'camel');
      const holder = new THREE.Group();
      holder.position.copy(c.group.position);
      holder.rotation.y = yaw;
      holder.add(c.neck, c.tail);
      this.group.add(body, holder);
      this.camels.push({ neck: c.neck, tail: c.tail, seed: k, at: c.group.position.clone() });
    });
  }

  /** Where the notice wall stands: a street cell on the bazaar's edge. */
  private get noticeAt() {
    for (const [i, j] of [[223, 66], [222, 62], [224, 64], [221, 68]]) if (isStreet(i, j) && isStreet(i + 1, j)) return v3(cw(i, j));
    return v3([BAZAAR[0] + 18, BAZAAR[1] + 4]);
  }
  /** The four date palms round the Sun Disc shrine. */
  private palms = [[190, 104], [190, 116], [208, 112], [212, 104]].map(([i, j]) => v3(cw(i, j)));

  // ---- interactables ------------------------------------------------------------------------------------

  private buildInteractables() {
    const d = this.d;
    const once = (key: string) => d.flags[key] === d.time.day;
    const well = v3(GREAT_WELL);
    this.interactables.push(
      {
        pos: well.clone().add(new THREE.Vector3(0, 0, 2.6)), radius: 2.6,
        label: () => (d.quests.wants('os-cistern') ? 'Look beneath the Great Well' : 'The Great Well of the Sun'),
        enabled: () => this.built,
        action: () => this.useWell(),
      },
      {
        pos: new THREE.Vector3(BAZAAR[0], 0, BAZAAR[1] + 2.9), radius: 2.4,
        label: () => 'Drink from the bazaar fountain', enabled: () => this.built,
        action: () => {
          d.player.stamina = d.player.maxStamina;
          d.player.hp = Math.min(d.player.maxHp, d.player.hp + d.player.maxHp * 0.05);
          desertAudio.splash(0.6);
          d.toast('Warm, a little salty — and still the best thing you have tasted all day.');
        },
      },
      {
        pos: this.noticeAt, radius: 2.4, label: () => 'Read the notice wall', enabled: () => this.built,
        action: () => this.readNotices(),
      },
      {
        pos: v3(SUN_SHRINE).add(new THREE.Vector3(2.6, 0, 0)), radius: 2.6,
        label: () => (this.rite.on ? (once(this.riteKey) ? 'The rite goes on around you' : 'Join the rite before the Sun Disc') : 'Pray before the Sun Disc'),
        enabled: () => this.built && !(this.rite.on && once(this.riteKey)),
        action: () => this.pray(),
      },
      ...this.palms.map((p, k) => ({
        pos: p, radius: 2.2,
        label: () => (once('gh:palm' + k) ? 'Shaken bare (for today)' : 'Shake the date palm'),
        enabled: () => this.built && !once('gh:palm' + k),
        action: () => {
          d.flags['gh:palm' + k] = d.time.day;
          d.give('dates', 2);
          d.fx.add.spawn({ pos: p.clone().setY(cityGround(p.x, p.z) + 6.5), spread: 2, count: 18, life: [0.6, 1.2], size: [0.12, 0.04], color: 0x6a8a30, color2: 0x8a3a1a, gravity: 9 });
          d.toast('Dates patter down onto the paving. A priest pretends not to see.');
        },
      })),
    );
    const tav = tavernDoor();
    if (tav) {
      this.interactables.push({
        pos: v3(tav.at), radius: 2.4,
        label: () => `Play knucklebones with ${this.dicerName}`,
        enabled: () => this.built && !this.cheat && !(d.quests.isActive('paneb-ring', 1)) && inHours(this.hour, 9, 2),
        action: () => this.dice(),
      });
    }
    this.interactables.push(
      {
        pos: v3(this.performersAt), radius: 3.2, label: () => 'Toss the musicians a coin (2g)',
        enabled: () => this.built && inHours(this.hour, 10, 21) && d.player.prog.gold >= 2,
        action: () => {
          d.player.prog.addGold(-2);
          desertAudio.coins(0.6);
          desertAudio.zill(0.8);
          this.flourish = 3;
          this.say(v3(this.performersAt, cityGround(...this.performersAt)), 'The Dancer', pick(['For the outlander!', 'The sand thanks you, and so do my feet!', 'Another verse — for the generous one!']));
        },
      },
      {
        pos: v3(this.charmerAt), radius: 2.6, label: () => 'Toss the snake charmer a coin (2g)',
        enabled: () => this.built && inHours(this.hour, 8, 17) && d.player.prog.gold >= 2,
        action: () => {
          d.player.prog.addGold(-2);
          desertAudio.coins(0.6);
          this.say(v3(this.charmerAt, cityGround(...this.charmerAt)), 'Old Sebek', pick(['She likes you. She does not like anyone.', 'Do not look her in the eye. Too late? Ah well.', 'A copper for the snake, a copper for me. She eats more.']));
        },
      },
    );
  }

  get riteKey() {
    return 'gh:rite' + (this.rite.dusk ? 'D' : 'M');
  }
  readonly performersAt: XZ = cw(91, 74);
  readonly charmerAt: XZ = cw(204, 117);
  /** musicians' bonus flourish (seconds left) */
  flourish = 0;
  get dicerName() {
    return this.d.quests.isDone('paneb-ring') ? 'Hapu the Honest' : 'Ubaid the Sharp';
  }

  private useWell() {
    const d = this.d;
    if (d.quests.wants('os-cistern')) {
      d.quests.signal('os-cistern');
      desertAudio.splash(0.8);
      d.talk('The Great Well', 'The Court of the Sun', 'You climb down the bucket rope, past the dry stone, to where Ishara said the shaft forks. Behind a bronze grille stamped with the Sunwheel the passage opens into a vault, and the vault is full: cistern after cistern, black water to the brim, lamps burning over them, a palace servant asleep on a stool beside a ledger of who may drink. The Great Well is not dying. It has been drained, on purpose, into the palace\'s keeping, while the children at the Bone Wells drink sand.', [{ label: 'Climb back up into the light.', run: () => d.close() }]);
      return;
    }
    const opts = [
      {
        label: 'Drink', run: () => {
          d.player.stamina = d.player.maxStamina;
          d.player.hp = Math.min(d.player.maxHp, d.player.hp + d.player.maxHp * 0.08);
          d.close();
          d.toast(this.ending === 'sand' ? 'Cold and sweet. With the cisterns opened, the Well has begun to sing again.' : 'Cool, but it tastes of the bottom of the bucket.');
        },
      },
      {
        label: 'Toss in a copper for luck (1g)', run: () => {
          if (d.player.prog.gold < 1) return d.close();
          d.player.prog.addGold(-1);
          desertAudio.coins(0.5);
          desertAudio.splash(0.5);
          const luck = Number(d.flags['gh:luck'] ?? 0);
          d.flags['gh:luck'] = Math.min(3, luck + (Math.random() < 0.35 ? 1 : 0));
          d.talk('The Great Well', 'The Court of the Sun', Number(d.flags['gh:luck']) > luck ? 'The copper falls a long way. When it lands, it rings like a bell. Lucky.' : 'The copper falls a long way. You never hear it land.', [{ label: 'Leave.', run: () => d.close() }]);
        },
      },
      { label: 'Leave.', run: () => d.close() },
    ];
    d.talk('The Great Well', 'The Court of the Sun', this.ending === 'sand' ? 'The water stands higher than it has in years. Someone has hung fresh garlands on the windlass.' : 'The Well of the Sunborn: wide enough to drown a camel, and deep enough that the bucket takes a long breath to come up. The rope is wet for less of its length every year.', opts);
  }

  private readNotices() {
    const d = this.d;
    const work = Object.entries(NOTICES).filter(([id]) => d.quests.defs.has(id) && d.quests.status(id) === 'available').map(([, t]) => t);
    const rumours = this.rumours();
    const page = (title: string, lines: string[], next: { label: string; run: () => void }[]) =>
      d.talk('The Notice Wall', title, lines.length ? lines.map((l) => '— ' + l).join('\n') : 'Nothing new pinned up today.', next);
    const back = () => this.readNotices();
    page('The Grand Bazaar', work.slice(0, 5), [
      ...(work.length > 5 ? [{ label: 'Read the older notices', run: () => page('Older notices', work.slice(5, 10), [{ label: 'Back.', run: back }]) }] : []),
      { label: 'Listen to the gossip under the wall', run: () => page('Gossip', rumours, [{ label: 'Back.', run: back }]) },
      { label: 'Leave.', run: () => d.close() },
    ]);
  }

  /** What the city is saying, given how far the Sunborn's story has gone. */
  rumours() {
    const q = this.d.quests, f = this.d.flags;
    const out: string[] = [];
    if (!q.isDone('os-1')) out.push('The Great Well dropped another cubit. The Vizier blames the scavengers. The scavengers blame the Vizier.');
    if (q.isActive('os-2')) out.push('The palace is paying an outlander to hunt scavengers. Gold for every raider, they say.');
    if (q.isActive('os-3') || q.isActive('os-4')) out.push('The Vizier wants the healer of the Bone Wells dead. Ishara, they call her. She mended my cousin\'s leg for nothing.', 'They say there is more water under the palace than in the whole Expanse. They say a lot of things.');
    if (q.isActive('os-rebel')) out.push('The villages are arming! Dunewatch, Tarp Row, even the Rust Market. Bar your doors.');
    if (q.isActive('os-crown')) out.push('The Sun Guard rode out to burn the camps. The smoke went up all night.');
    if (f.sbEnding === 'queen') out.push('The sand is quiet now. The palace held a feast for its new lord, the outlander. Nobody mentions the Bone Wells.');
    if (f.sbEnding === 'sand') out.push('Scavengers trading inside the walls, bold as you like. Rust Row, they call it. And the cisterns open to all.');
    if (f.wardenDead) out.push('The southern caravans are running again now the Warden is sand.');
    else out.push('A dune stood up south-west of the Bone Wells and walked. Captain Mereth\'s scouts swear to it.');
    if (f.sawtoothDead) out.push('Old Sawtooth is dead. The caravan masters celebrated by raising their prices.');
    else out.push('Old Sawtooth took another caravan in the southern basin. Three times the size of a normal shark, and white with scars.');
    out.push(pick(['Ubaid the Sharp has not lost at knucklebones in a year. Make of that what you will.', 'Sand dolphins were seen leaping by the Caravan Way. Good luck, if you see them before noon.', 'Old Wennefer the seer read a merchant\'s fortune and he cried for an hour. Then he bought three of her charms.', 'The palace ordered forty new lamps for the throne room. Forty!']));
    return out;
  }

  private pray() {
    const d = this.d, p = d.player;
    if (this.rite.on) {
      d.flags[this.riteKey] = d.time.day;
      p.hp = p.maxHp;
      p.mana = p.maxMana;
      p.stamina = p.maxStamina;
      p.prog.addXp(30);
      desertAudio.zill(0.8);
      d.fx.add.spawn({ pos: p.center.clone(), vel: new THREE.Vector3(0, 2, 0), spread: 1.4, count: 30, life: [0.8, 1.6], size: [0.12, 0.02], color: 0xffe2a0, color2: 0xffa040, upBias: 1.2, drag: 1.2 });
      d.talk('The Sun Disc', 'The Court of the Sun', this.rite.dusk
        ? 'You raise your hands with the priests as the last light leaves the disc. For a moment the whole court is gold, and you are part of it. (Fully restored; the Sun\'s blessing.)'
        : 'You stand with the priests as the first light strikes the disc and the court catches fire, all gold. Your aches go with the dark. (Fully restored; the Sun\'s blessing.)', [{ label: 'Give thanks.', run: () => d.close() }]);
      return;
    }
    p.stamina = p.maxStamina;
    d.talk('The Sun Disc', 'The Court of the Sun', 'Gold beaten thin over a stone disc, polished every dawn. Offerings of dates and copper lie in the bowl. The rites are held here at first light and at sunset, and anyone may stand with the priests.', [{ label: 'Leave a quiet prayer.', run: () => d.close() }]);
  }

  // ---- knucklebones ---------------------------------------------------------------------------------------

  private dice() {
    const d = this.d;
    const who = this.dicerName;
    const tav = tavernDoor();
    const honest = d.quests.isDone('paneb-ring');
    const intro = honest
      ? 'Hapu shakes three knucklebones in a leather cup. "My cousin Ubaid ran this table. Ubaid is no longer running anything. Honest bones now — five, twenty-five or a hundred?"'
      : '"Three bones each, high triple beats a pair, a pair beats a plain throw, and the highest total settles the rest." Ubaid rattles the cup with a smile full of gold. "Five, twenty-five or a hundred?"';
    const stakes = [5, 25, 100].filter((s) => d.player.prog.gold >= s).map((s) => ({ label: `Stake ${s} gold`, run: () => this.throwBones(s, who, honest) }));
    d.talk(who, 'Knucklebones · the Thirsty Scarab', intro, [...stakes, { label: 'Not today.', run: () => d.close() }]);
    if (tav) desertAudio.dice(0.5);
  }

  private throwBones(stake: number, who: string, honest: boolean) {
    const d = this.d;
    const roll = () => [1, 2, 3].map(() => 1 + Math.floor(Math.random() * 6));
    const score = (b: number[]) => {
      const s = [...b].sort((a, c) => a - c);
      if (s[0] === s[2]) return 300 + s[0];
      if (s[0] === s[1] || s[1] === s[2]) return 200 + s[1] * 10 + (s[0] === s[1] ? s[2] : s[0]);
      return s[0] + s[1] + s[2];
    };
    const name = (b: number[]) => {
      const sc = score(b);
      return sc > 300 ? `a triple of ${['', 'ones', 'twos', 'threes', 'fours', 'fives', 'sixes'][b[0]]}` : sc > 200 ? 'a pair' : `${sc}`;
    };
    let mine = roll();
    let luckNote = '';
    const luck = Number(d.flags['gh:luck'] ?? 0);
    if (luck > 0) {
      // Fortune favours you: the worst bone tumbles over once more.
      const k = mine.indexOf(Math.min(...mine));
      mine[k] = Math.max(mine[k], 1 + Math.floor(Math.random() * 6));
      d.flags['gh:luck'] = luck - 1;
      luckNote = ' One bone teeters on its edge and tumbles over — the seer\'s luck, perhaps.';
    }
    let his = roll();
    const watching = d.quests.isActive('paneb-ring', 0);
    if (watching) his = [6, 6, 6];
    else if (!honest && score(his) <= score(mine) && Math.random() < 0.18) his = roll().map((x) => Math.max(x, 4)); // a "lucky" second cup
    desertAudio.dice(0.7);
    const fmt = (b: number[]) => b.join(' · ');
    const ms = score(mine), hs = score(his);
    let text = `You throw ${fmt(mine)} — ${name(mine)}.${luckNote} ${who.split(' ')[0]} throws ${fmt(his)} — ${name(his)}.`;
    const opts: { label: string; run: () => void }[] = [];
    if (watching) {
      text += '\n\nThree sixes. Again. But this time you were watching his hands, not the bones: as the cup came down his thumb slid one set of bones up his sleeve and let fall another — heavier, darker, and they all land the same way up.';
      d.player.prog.addGold(-stake);
      d.quests.signal('dice-watched');
      opts.push({ label: 'Seize his wrist. "Loaded bones, Ubaid."', run: () => this.unmask() });
    } else if (ms > hs) {
      d.player.prog.addGold(stake);
      desertAudio.coins(0.8);
      text += `\n\nYou win ${stake} gold.`;
      if (mine.every((x) => x === 6) && !d.flags['gh:jackpot']) {
        d.flags['gh:jackpot'] = true;
        d.give('dicersCharm', 1);
        text += ' Three sixes! The whole street cheers, and ' + who.split(' ')[0] + ' — scowling — pays the table\'s jackpot: a lucky knucklebone on a red thread.';
      }
      opts.push({ label: 'Again.', run: () => this.dice() });
    } else if (ms === hs) {
      text += '\n\nA tie. The bones go back in the cup.';
      opts.push({ label: 'Again.', run: () => this.dice() });
    } else {
      d.player.prog.addGold(-stake);
      text += `\n\nYou lose ${stake} gold.${honest ? '' : ' Ubaid sweeps it up without looking at it.'}`;
      opts.push({ label: 'Again.', run: () => this.dice() });
    }
    opts.push({ label: 'Enough.', run: () => d.close() });
    d.talk(who, 'Knucklebones · the Thirsty Scarab', text, opts);
  }

  /** Ubaid's knife comes out. */
  private unmask() {
    const d = this.d;
    d.close();
    this.spawnCheat();
    this.say(() => this.cheat?.position ?? v3(BAZAAR), 'Ubaid the Sharp', 'Nobody touches Ubaid\'s bones! NOBODY!', 'plain', 4);
  }

  private spawnCheat() {
    const tav = tavernDoor();
    if (!tav || this.cheat) return;
    const at = v3(tav.at, cityGround(...tav.at));
    const b = new Bandit('sword', at, this.d.scene, this.bolts, undefined, LOOKS.musician(2));
    b.kind = 'cheat';
    b.name = 'Ubaid the Sharp';
    b.alerted = true;
    b.hitDamage = 14;
    this.cheat = b;
  }

  // ---- services (the seer, the water-seller, the high priest) ------------------------------------------------

  private buildServices() {
    const d = this.d;
    this.services.set('wennefer', (show, back) => [
      {
        label: 'Have your fortune read — 10 gold',
        run: () => {
          if (d.player.prog.gold < 10) return show('Ten coppers, little one. The bones do not work for free, and neither do I.', [{ label: 'Back.', run: back }]);
          d.player.prog.addGold(-10);
          d.flags['gh:luck'] = 2;
          desertAudio.dice(0.4);
          show(this.fortune(), [{ label: 'Thank you, mother.', run: back }]);
        },
      },
      {
        label: 'Ask about Old Amaunet',
        run: () => show('Amaunet? (She lowers her voice.) The city under this city. My grandmother said its people did not bury their kings; they gave them to the sun, and the sun gave them back as gold. She said if you put your ear to the court paving at midnight you can hear the old king breathing. I have tried. All I heard was the Vizier\'s men digging.', [{ label: 'Back.', run: back }]),
      },
    ]);
    this.services.set('tjeti', (show, back) => [
      {
        label: 'A cup of well water — 1 gold',
        run: () => {
          if (d.player.prog.gold < 1) return show('A copper, friend. Even the Well isn\'t free.', [{ label: 'Back.', run: back }]);
          d.player.prog.addGold(-1);
          d.player.stamina = d.player.maxStamina;
          desertAudio.splash(0.4);
          show('He dips a brass cup into his skin and hands it over with a flourish. It is lukewarm and absolutely wonderful.', [{ label: 'Back.', run: back }]);
        },
      },
      {
        label: 'Spiced mint tea, to carry — 20 gold',
        run: () => {
          if (d.player.prog.gold < 20) return show('Twenty for the good tea. The cheap tea is just hot water and lies.', [{ label: 'Back.', run: back }]);
          d.player.prog.addGold(-20);
          d.give('spicedTea', 1);
          show('Sealed in a little clay cup with a wax lid. "Drink it hot if you can. Drink it anyway if you can\'t."', [{ label: 'Back.', run: back }]);
        },
      },
    ]);
    this.services.set('amenemope', (show, back) => [
      {
        label: 'Ask about the rites',
        run: () => show('At first light — between the fifth and seventh hours — we call the sun back over the walls. At sunset, between the eighteenth and the nineteenth and a half, we thank it and send it under the sand. Stand with us before the Sun Disc and the sun will remember you.', [{ label: 'Back.', run: back }]),
      },
      {
        label: 'Ask for a blessing (a 15 gold offering)',
        run: () => {
          if (d.player.prog.gold < 15) return show('The sun is generous. The temple roof is not. Fifteen, child.', [{ label: 'Back.', run: back }]);
          d.player.prog.addGold(-15);
          d.player.hp = d.player.maxHp;
          d.player.mana = d.player.maxMana;
          desertAudio.zill(0.7);
          show('He touches your brow with warm oil and says a word you do not know. Your wounds close as if the noon sun had pressed them shut.', [{ label: 'Thank you.', run: back }]);
        },
      },
    ]);
  }

  /** A fortune: a little flavour, and a nudge toward whatever the Sunborn's story wants next. */
  private fortune() {
    const q = this.d.quests;
    const open = [...q.defs.values()].find((x) => x.id.startsWith('os-') && q.isActive(x.id));
    const line = open ? q.lines(open.id).find(([, p, t]) => p < t)?.[0] : null;
    const opener = pick(['(She rattles the bones and spills them across the cloth, then frowns at them as though they owe her money.)', '(She takes your hand, turns it over, and looks at it for an uncomfortably long time.)', '(She stares into a cup of cold tea, then drinks it.)']);
    const hint = line
      ? `The bones say: "${line.charAt(0).toLowerCase() + line.slice(1)}." They are very insistent about it.`
      : pick(['The bones say you will cross a great deal of sand. That is not hard to see; you are in a desert.', 'The bones see a dry well, and a full one, and you standing between them.', 'The bones see you dancing at a coronation. Or a funeral. The bones are bad with hats.']);
    return `${opener} ${hint} ${pick(['And luck sits on your shoulder for a little while — throw dice while it lasts.', 'Go to the knucklebone table before the luck wears off. Do not tell Ubaid I sent you.'])}`;
  }

  // ---- per frame --------------------------------------------------------------------------------------------

  update(dt: number) {
    const d = this.d;
    this.t += dt;
    const p = d.player.pos;
    const near = this.shown && p.x < -4800 && Math.hypot(p.x - SUNSPIRE.x, p.z - SUNSPIRE.z) < 1300;
    this.group.visible = near;
    if (!this.built && d.desert.cityLoaded && near && this.t > 2) this.build();
    if (!this.built) return;
    const h = this.hour;
    const lit = this.night;
    // Night: braziers and lanterns.
    if (this.flames) {
      this.flames.visible = lit;
      if (lit && near) {
        for (const f of this.flameSpots) {
          if (f.distanceToSquared(p) > 70 * 70 || Math.random() > dt * 10) continue;
          d.fx.add.spawn({ pos: f.clone().setY(f.y + 1.7), vel: new THREE.Vector3(0, 1.6, 0), spread: 0.3, count: 1, life: [0.3, 0.6], size: [0.3, 0.05], color: 0xffc060, color2: 0xff3a00, upBias: 1.4 });
        }
      }
    }
    this.lanternMat.emissiveIntensity = lit ? 1.6 + Math.sin(this.t * 3) * 0.1 : 0;
    // Camels chew and swish.
    for (const c of this.camels) {
      if (c.at.distanceToSquared(p) > 200 * 200) continue;
      c.neck.rotation.x = Math.sin(this.t * 0.4 + c.seed) * 0.12 + Math.max(0, Math.sin(this.t * 0.13 + c.seed * 2)) * 0.25;
      c.neck.rotation.y = Math.sin(this.t * 0.23 + c.seed) * 0.2;
      c.tail.rotation.z = Math.sin(this.t * 2.2 + c.seed) * 0.25;
    }
    // The fountain plays.
    if (this.fountainAt.distanceToSquared(p) < 60 * 60 && Math.random() < dt * 30) {
      const a = Math.random() * Math.PI * 2;
      d.fx.add.spawn({ pos: this.fountainAt.clone().setY(this.fountainAt.y + 1.8), vel: new THREE.Vector3(Math.cos(a) * 1.6, 2.4, Math.sin(a) * 1.6), spread: 0.2, count: 1, life: [0.6, 0.8], size: [0.09, 0.05], color: 0xcfeaff, color2: 0x7ab8d8, gravity: 9, alpha: 0.7 });
    }
    // The bazaar murmurs by day.
    const baz = Math.hypot(p.x - BAZAAR[0], p.z - BAZAAR[1]);
    this.murmur.set(near && inHours(h, 7, 21) ? THREE.MathUtils.clamp(1 - baz / 90, 0, 1) : near && inHours(h, 21, 24) ? THREE.MathUtils.clamp(0.4 - baz / 150, 0, 1) : 0, dt);
    // The shrine disc blazes during the rites.
    if (this.shrineDisc) {
      const m = this.shrineDisc.material as THREE.MeshStandardMaterial;
      const want = this.rite.on ? 1.6 + Math.sin(this.t * 2) * 0.3 : 0.15;
      m.emissiveIntensity += (want - m.emissiveIntensity) * Math.min(1, dt);
    }
    for (const a of this.acts) a.update(dt, p);
    this.flourish = Math.max(0, this.flourish - dt);
    // The night watch calls each hour.
    const hr = Math.floor(h);
    if (hr !== this.lastHour) {
      this.lastHour = hr;
      if (this.lastHour >= 0) this.onHour(hr);
    }
    // Ubaid, once his knife is out.
    if (d.quests.isActive('paneb-ring', 1) && !this.cheat && near) {
      const tav = tavernDoor();
      if (tav && Math.hypot(p.x - tav.at[0], p.z - tav.at[1]) < 60) this.spawnCheat();
    }
    if (this.cheat) {
      this.cheat.update(dt, d.player);
      this.bolts.update(dt, d.player);
      if (this.cheat.dead || this.cheat.position.distanceTo(p) > 140 || d.player.dead || !this.shown) {
        this.cheat.dispose();
        this.cheat = null;
      }
    }
    this.festivalUpdate(dt, near);
    this.voices.hidden = !this.shown;
    this.voices.update(dt);
  }

  private onHour(hr: number) {
    if (!this.night) return;
    const patrol = this.acts.find((a): a is Patrol => a instanceof Patrol && a.near);
    if (!patrol || !patrol.puppets[0]) return;
    const lead = patrol.puppets[0];
    desertAudio.bell(this.loud(lead.pos, 40));
    const n = ['Midnight', 'The first hour', 'The second hour', 'The third hour', 'The fourth hour', 'The fifth hour'][hr] ?? `The ${hr}th hour`;
    this.say(lead.pos, 'The Night Watch', `${n}, and all is well under the Sun!`, 'night', 5);
  }

  /** The ending's mark on the city: bunting and lanterns for a coronation. */
  private festivalUpdate(dt: number, near: boolean) {
    if (this.ending === 'queen' && !this.festival && near) {
      const g = new THREE.Group();
      const y = sunspireY();
      const cols = [0x1f7a7a, 0xd4a640, 0xb8402e, 0xf0e4c8, 0x5a2a7a];
      for (const [i0, j0, i1, j1] of [[186, 98, 212, 98], [186, 122, 212, 122], [190, 100, 190, 120], [210, 100, 210, 120], [200, 98, 200, 122]]) {
        const [x0, z0] = cw(i0, j0), [x1, z1] = cw(i1, j1);
        const len = Math.hypot(x1 - x0, z1 - z0);
        const m = new THREE.Mesh(P.buntingGeometry(len, cols), new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 }));
        m.position.set(x0, y + 5.5, z0);
        m.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
        g.add(m);
      }
      this.festival = g;
      this.group.add(g);
    }
    // Floating lanterns over the Court on coronation nights.
    if (this.festival && near && inHours(this.hour, 20, 23.5) && Math.random() < dt * 3) {
      const [cx, cz] = COURT_CENTER;
      const at = new THREE.Vector3(cx + (Math.random() - 0.5) * 50, sunspireY() + 2, cz + (Math.random() - 0.5) * 40);
      if (at.distanceTo(this.d.player.pos) < 120) this.d.fx.add.spawn({ pos: at, vel: new THREE.Vector3(0.3, 1.1, 0.2), spread: 0.1, count: 1, life: [7, 10], size: [0.35, 0.3], color: 0xffc060, color2: 0xff7a20, drag: 0.05 });
    }
  }

  setVisible(v: boolean) {
    this.shown = v;
    this.group.visible = v && this.group.visible;
    if (!v) {
      this.voices.clear();
      this.murmur.set(0, 10);
      for (const a of this.acts) {
        a.clear();
        a.near = false;
      }
      this.cheat?.dispose();
      this.cheat = null;
      this.bolts.clear();
    }
  }

  /** The ending wants a Rust Row inside the walls (built on demand by its act). */
  get rustRowBuilt() {
    return !!this.rustRow;
  }
  buildRustRow() {
    if (this.rustRow) return;
    const g = new THREE.Group();
    const rnd = mulberry32(77);
    const objs: THREE.Object3D[] = [];
    for (let k = 0; k < 4; k++) {
      const i = 30 + k * 4, j = 125;
      if (!isStreet(i, j)) continue;
      const [x, z] = cw(i, j);
      const s = P.stall([0x8a6a4a, 0xa85a3a, 0x7a8a7a, 0xb8a07a][k], rnd, [0x8a5a3a, 0x6a6a6a, 0x9fe8d8, 0xe8dcc0]);
      s.position.set(x, cityGround(x, z), z);
      objs.push(s);
    }
    g.add(P.bake(objs, 'rust-row'));
    this.rustRow = g;
    this.group.add(g);
  }

}

// ---- the acts -------------------------------------------------------------------------------------------------

/** A crier walking a few paces back and forth, ringing a handbell and shouting the bazaar's wares. */
class Crier extends Act {
  private next = 3 + Math.random() * 4;
  private shout = 0;
  constructor(life: GhagrabbaLife, private at: XZ, private lines: string[], private who: string, private k: number) {
    super(life);
  }
  where() {
    return inHours(this.life.hour, 7, 19.5) ? v3(this.at, cityGround(...this.at)) : null;
  }
  spawn() {
    const p = this.puppet(LOOKS.crier(this.k), this.at);
    p.hold(P.held.bell());
  }
  tick(dt: number) {
    const p = this.puppets[0];
    this.next -= dt;
    this.shout = Math.max(0, this.shout - dt);
    const t = this.life.d.time.hour * 40 + this.k * 3;
    const goal: XZ = [this.at[0] + Math.sin(t * 0.05) * 3, this.at[1] + Math.cos(t * 0.05) * 1.5];
    if (this.shout > 0) p.play('cheer');
    else if (p.walkTo(goal[0], goal[1], 0.9, dt, 0.5)) p.play('talk');
    if (this.next <= 0) {
      this.next = 11 + Math.random() * 7;
      this.shout = 2.2;
      desertAudio.bell(this.life.loud(p.pos, 40), 0);
      desertAudio.bell(this.life.loud(p.pos, 40) * 0.8, 0.35);
      this.life.say(p.pos, this.who, pick(this.lines));
    }
  }
}

/** The Queen's procession: heralds, standards, the Sun Guard, the palanquin and its bearers, drummers behind. */
class Procession extends Act {
  private route: XZ[] | null = null;
  private L = 0;
  private palanquin: THREE.Object3D | null = null;
  private say = 6;
  private beat = 0;
  private beatT = 0;
  private readonly speed = 1.15;
  private readonly pause = 60;
  radius = 150;
  private members = [
    { role: 'herald', off: 0, lat: 0 },
    { role: 'standard', off: 2.4, lat: -1.1 }, { role: 'standard', off: 2.4, lat: 1.1 },
    { role: 'guard', off: 5, lat: -1.2 }, { role: 'guard', off: 5, lat: 1.2 },
    { role: 'bearer', off: 8, lat: -0.75 }, { role: 'bearer', off: 8, lat: 0.75 }, { role: 'bearer', off: 10.4, lat: -0.75 }, { role: 'bearer', off: 10.4, lat: 0.75 },
    { role: 'queen', off: 9.2, lat: 0 },
    { role: 'guard', off: 13.5, lat: -1.2 }, { role: 'guard', off: 13.5, lat: 1.2 },
    { role: 'drum', off: 16.5, lat: -0.8 }, { role: 'drum', off: 16.5, lat: 0.8 },
  ];

  private ensureRoute() {
    if (this.route) return this.route;
    const palace = cityDoors().find((d) => d.kind === 'palace');
    if (!palace) return null;
    const r = streetPath([palace.x + 6, palace.z], BAZAAR);
    if (r) {
      this.route = r;
      this.L = pathLength(r);
    }
    return this.route;
  }
  /** Lead position along the route and the direction of travel (null when no procession is out). */
  private state() {
    const h = this.life.hour;
    const route = this.ensureRoute();
    if (!route) return null;
    const out = this.L / this.speed, total = out * 2 + this.pause;
    for (const start of [9, 16]) {
      const e = (h - start) * this.life.sph;
      if (e < 0 || e > total) continue;
      if (e < out) return { s: e * this.speed, dir: 1, moving: true };
      if (e < out + this.pause) return { s: this.L, dir: 1, moving: false };
      return { s: this.L - (e - out - this.pause) * this.speed, dir: -1, moving: true };
    }
    return null;
  }
  where() {
    if (!this.life.d.desert.cityLoaded) return null;
    const st = this.state();
    if (!st || !this.route) return null;
    const a = along(this.route, st.s);
    return new THREE.Vector3(a.x, cityGround(a.x, a.z), a.z);
  }
  spawn() {
    let g = 0, b = 0, s = 0, dr = 0;
    for (const m of this.members) {
      const look = m.role === 'guard' ? LOOKS.guard(g++ % 2 === 1) : m.role === 'bearer' ? LOOKS.bearer(b++) : m.role === 'standard' ? LOOKS.herald() : m.role === 'drum' ? LOOKS.musician(dr++) : m.role === 'queen'
        ? (this.life.d.npcs.find('neferah')?.rec.look ?? LOOKS.herald()) : LOOKS.herald();
      const p = this.puppet(look, [0, 0]);
      if (m.role === 'guard') p.hold(P.held.spear());
      if (m.role === 'standard') p.hold(P.held.standard(s++ % 2 ? 0xd4a640 : 0x1f7a7a));
      if (m.role === 'drum') p.hold(P.held.drum(), 'hand_l');
      if (m.role === 'herald') p.hold(P.held.bell());
    }
    this.palanquin = P.palanquin();
    this.life.d.scene.add(this.palanquin);
  }
  clear() {
    super.clear();
    if (this.palanquin) this.life.d.scene.remove(this.palanquin);
    this.palanquin = null;
  }
  tick(dt: number) {
    const st = this.state();
    if (!st || !this.route) return;
    const life = this.life;
    this.members.forEach((m, k) => {
      const p = this.puppets[k];
      const s = st.s - st.dir * m.off;
      const a = along(this.route!, s);
      const yaw = st.dir > 0 ? a.yaw : a.yaw + Math.PI;
      const nx = Math.cos(yaw), nz = -Math.sin(yaw);
      p.pos.set(a.x + nx * m.lat, 0, a.z + nz * m.lat);
      p.yaw = yaw;
      if (m.role === 'queen') {
        p.lift = 0.95;
        p.play('sit');
      } else if (!st.moving) p.play(m.role === 'drum' ? 'talk' : m.role === 'herald' ? 'cheer' : 'idle');
      else p.play('walk', this.speed / 1.15);
    });
    if (this.palanquin) {
      const q = this.puppets[9].pos;
      const yaw = this.puppets[9].yaw;
      this.palanquin.position.set(q.x, cityGround(q.x, q.z) + (st.moving ? Math.abs(Math.sin(life.d.time.hour * 900)) * 0.04 : 0), q.z);
      this.palanquin.rotation.y = yaw;
    }
    // The herald calls out; the drums keep the maqsum; petals scatter behind.
    const herald = this.puppets[0];
    this.say -= dt;
    if (this.say <= 0) {
      this.say = 14 + Math.random() * 6;
      const title = life.ending === 'sand' ? 'Queen of the Open Gates' : 'Queen of Ghagrabba';
      life.say(herald.pos, 'Herald of the Court', pick([`Make way! Make way for Her Radiance, Neferah Sunborn, ${title}!`, 'Bow your heads! The Sun walks among you!', 'Clear the street! The Queen\'s procession passes!', life.ending === 'sand' ? 'Make way for the Queen — and for Ishara of the Bone Wells, her guest!' : 'Kneel, people of Ghagrabba, and be seen by the Sun!']), 'royal', 5);
      desertAudio.bell(life.loud(herald.pos, 45));
    }
    const drum = this.puppets[12];
    const vol = life.loud(drum.pos, 55);
    if (vol > 0) {
      this.beatT -= dt;
      if (this.beatT <= 0) {
        this.beatT += 0.26;
        const hit = MAQSUM[this.beat++ % MAQSUM.length];
        if (hit) desertAudio.drum(hit, vol * 0.8);
      }
    }
    if (Math.random() < dt * 6) {
      const back = this.puppets[13].pos;
      life.d.fx.add.spawn({ pos: back.clone().setY(back.y + 2), vel: new THREE.Vector3(0, 0.6, 0), spread: 1.2, count: 2, life: [1.5, 2.5], size: [0.08, 0.06], color: pick([0xff8aa0, 0xffd76a, 0xff5a5a]), gravity: 0.8, drag: 1.5 });
    }
  }
}

/** A Sun Guard patrol of three walking a loop of the streets; lanterns at night. */
class Patrol extends Act {
  private loop: XZ[] | null = null;
  private L = 0;
  private lit = false;
  constructor(life: GhagrabbaLife, private stops: XZ[], private phase: number) {
    super(life);
  }
  private ensure() {
    if (this.loop) return this.loop;
    const pts: XZ[] = [];
    for (let k = 0; k < this.stops.length; k++) {
      const seg = streetPath(this.stops[k], this.stops[(k + 1) % this.stops.length]);
      if (!seg) return null;
      pts.push(...(pts.length ? seg.slice(1) : seg));
    }
    this.loop = pts;
    this.L = pathLength(pts);
    return pts;
  }
  private s() {
    const t = (this.life.d.time.day * 24 + this.life.hour) * this.life.sph * 1.1;
    return (((t + this.phase * this.L) % this.L) + this.L) % this.L;
  }
  where() {
    if (!this.life.d.desert.cityLoaded || !this.ensure() || this.L < 1) return null;
    const a = along(this.loop!, this.s());
    return new THREE.Vector3(a.x, cityGround(a.x, a.z), a.z);
  }
  spawn() {
    for (let k = 0; k < 3; k++) this.puppet(LOOKS.guard(k === 1), [0, 0]);
    this.lit = !this.life.night;
  }
  tick() {
    const s = this.s();
    const night = this.life.night;
    if (night !== this.lit) {
      // Lanterns out at dusk, spears by day.
      this.lit = night;
      this.puppets.forEach((p, k) => p.hold(night && k !== 1 ? P.held.lantern() : P.held.spear()));
    }
    this.puppets.forEach((p, k) => {
      const a = along(this.loop!, s - k * 2.2);
      const side = k === 0 ? 0 : k === 1 ? -0.7 : 0.7;
      p.pos.set(a.x + Math.cos(a.yaw) * side, 0, a.z - Math.sin(a.yaw) * side);
      p.yaw = a.yaw;
      p.play('walk', 1.1 / 1.15);
    });
  }
}

/** An oud player, a drummer and a dancer in the artisans' square. */
class Performers extends Act {
  private note = 0;
  private noteT = 0;
  private beat = 0;
  private beatT = 0;
  where() {
    const at = this.life.performersAt;
    return inHours(this.life.hour, 10, 21) ? v3(at, cityGround(...at)) : null;
  }
  spawn() {
    const [x, z] = this.life.performersAt;
    const oud = this.puppet(LOOKS.musician(0), [x - 1.6, z], Math.PI / 2);
    oud.hold(P.held.oud());
    const drum = this.puppet(LOOKS.musician(1), [x - 1.6, z + 1.5], Math.PI / 2);
    drum.hold(P.held.drum(), 'hand_l');
    this.puppet(LOOKS.dancer(), [x + 1, z + 0.6], -Math.PI / 2);
  }
  tick(dt: number, d: number) {
    const [oud, drum, dancer] = this.puppets;
    oud.play('sit');
    drum.play('talk');
    dancer.play(this.life.flourish > 0 ? 'cheer' : 'dance');
    const [x, z] = this.life.performersAt;
    dancer.pos.set(x + 1 + Math.sin(this.life.d.time.hour * 30) * 0.8, 0, z + 0.6 + Math.cos(this.life.d.time.hour * 22) * 0.6);
    dancer.yaw = -Math.PI / 2 + Math.sin(this.life.d.time.hour * 60) * 0.8;
    const vol = THREE.MathUtils.clamp(1 - d / 45, 0, 1);
    if (vol <= 0) return;
    const beat = this.life.flourish > 0 ? 0.2 : 0.27;
    this.noteT -= dt;
    if (this.noteT <= 0) {
      const [step, len] = OUD_TUNE[this.note++ % OUD_TUNE.length];
      desertAudio.oud(step, vol);
      this.noteT += len * beat * 2;
      if (Math.random() < 0.5) this.life.d.fx.add.spawn({ pos: oud.pos.clone().setY(oud.pos.y + 1.2), vel: new THREE.Vector3(0, 1.2, 0), spread: 0.4, count: 1, life: [0.8, 1.4], size: [0.1, 0.03], color: 0xffe2a0, color2: 0xd4a640, upBias: 1, drag: 1 });
    }
    this.beatT -= dt;
    if (this.beatT <= 0) {
      this.beatT += beat;
      const hit = MAQSUM[this.beat++ % MAQSUM.length];
      if (hit) desertAudio.drum(hit, vol * 0.7);
      if (this.beat % 16 === 0) desertAudio.zill(vol * 0.6);
    }
  }
}

/** A fire-breather in the bazaar after dark. */
class FireBreather extends Act {
  private at: XZ = [BAZAAR[0] + 3, BAZAAR[1] - 5];
  private next = 2;
  where() {
    return inHours(this.life.hour, 18.5, 23.5) ? v3(this.at, cityGround(...this.at)) : null;
  }
  spawn() {
    const p = this.puppet(LOOKS.musician(2), this.at, Math.PI);
    p.hold(P.held.torch());
  }
  tick(dt: number) {
    const p = this.puppets[0];
    this.next -= dt;
    p.play(this.next < 1.2 ? 'cheer' : 'idle');
    if (this.next <= 0) {
      this.next = 5 + Math.random() * 3;
      const dir = new THREE.Vector3(Math.sin(p.yaw), 0.35, Math.cos(p.yaw));
      const mouth = p.pos.clone().setY(p.pos.y + 1.65).addScaledVector(dir, 0.3);
      this.life.d.fx.add.spawn({ pos: mouth, vel: dir.clone().multiplyScalar(7), spread: 1.5, count: 40, life: [0.4, 0.9], size: [0.6, 0.15], color: 0xffd060, color2: 0xff3a00, upBias: 0.8, drag: 1.2 });
      desertAudio.whoosh(this.life.loud(p.pos, 50));
      if (Math.random() < 0.5) this.life.say(p.pos, 'Wadj the Fire-Eater', pick(['Behold — the breath of the noon sun!', 'Stand back, or lose your eyebrows!', 'A copper for the fire! Two if you want to keep your hat!']));
    }
  }
}

/** A snake charmer in the Court of the Sun, and his cobra. */
class SnakeCharmer extends Act {
  private basket: ReturnType<typeof P.cobraBasket> | null = null;
  private note = 0;
  private noteT = 0;
  where() {
    const at = this.life.charmerAt;
    return inHours(this.life.hour, 8, 17) ? v3(at, cityGround(...at)) : null;
  }
  spawn() {
    const [x, z] = this.life.charmerAt;
    this.puppet({ body: 'male', outfit: 'peasant', hood: true, hair: null, beard: true, hairColor: 0xd8d0c4, skin: 0x6a4028, linen: 0xe8dcc0, cloth: 0x8a6a2a, height: 1.7 }, [x, z], Math.PI);
    this.basket = P.cobraBasket();
    this.basket.group.position.set(x, cityGround(x, z), z - 1.1);
    this.life.d.scene.add(this.basket.group);
  }
  clear() {
    super.clear();
    if (this.basket) this.life.d.scene.remove(this.basket.group);
    this.basket = null;
  }
  tick(dt: number, d: number) {
    this.puppets[0].play('sit');
    const t = this.life.d.time.hour * 120;
    if (this.basket) {
      this.basket.cobra.rotation.z = Math.sin(t) * 0.25;
      this.basket.cobra.rotation.x = Math.sin(t * 0.7) * 0.12;
      this.basket.segs.forEach((s, k) => (s.position.x = Math.sin(t * 1.3 - k * 0.6) * 0.03 * k));
    }
    const vol = THREE.MathUtils.clamp(1 - d / 30, 0, 1) * 0.7;
    if (vol <= 0) return;
    this.noteT -= dt;
    if (this.noteT <= 0) {
      const [step, len] = OUD_TUNE[(this.note++ * 3) % OUD_TUNE.length];
      desertAudio.oud(step + 8, vol);
      this.noteT += len * 0.45;
    }
  }
}

/** Children chasing each other round an open square, stopping to shriek with laughter. */
class Children extends Act {
  private c: XZ = cw(199, 92);
  private laugh = 4;
  where() {
    return inHours(this.life.hour, 8.5, 18) ? v3(this.c, cityGround(...this.c)) : null;
  }
  spawn() {
    for (let k = 0; k < 3; k++) this.puppet(LOOKS.child(k), this.c);
  }
  tick(dt: number) {
    const t = this.life.d.time.hour * this.life.sph;
    const rest = Math.sin(t * 0.18) > 0.82;
    this.puppets.forEach((p, k) => {
      if (rest) {
        p.play('cheer');
        p.face(this.c[0], this.c[1], dt);
        return;
      }
      const a = t * 0.55 - k * 0.9;
      const r = 4.5 + Math.sin(t * 0.3 + k) * 1.2;
      p.walkTo(this.c[0] + Math.cos(a) * r, this.c[1] + Math.sin(a) * r, 3.2, dt, 0.05);
    });
    this.laugh -= dt;
    if (this.laugh <= 0) {
      this.laugh = 9 + Math.random() * 8;
      this.life.say(pick(this.puppets).pos, pick(['Little Meri', 'Bebi', 'Kawa']), pick(['You\'re IT!', 'Can\'t catch me, can\'t catch me!', 'I\'m the Warden! RAAAH!', 'No fair, you cheated!', 'I\'m a sand shark, I\'m a sand shark!']), 'plain', 3);
    }
  }
}

/** The dawn and dusk rites before the Sun Disc: priests in an arc, the gong, the chant. */
class Rite extends Act {
  private chantT = 0;
  private sayT = 3;
  private pose = 0;
  where() {
    const h = this.life.hour;
    const on = inHours(h, 5.5, 7) || inHours(h, 18, 19.5);
    this.life.rite.on = on && this.near;
    this.life.rite.dusk = h >= 12;
    return on ? v3(SUN_SHRINE, cityGround(...SUN_SHRINE)) : null;
  }
  spawn() {
    const [sx, sz] = SUN_SHRINE;
    // The shrine faces east (+x); the priests stand in an arc before it, the High Priest at the front.
    for (let k = 0; k < 6; k++) {
      const a = -1 + (k / 5) * 2;
      const x = sx + 4.6 * Math.cos(a), z = sz + 4.6 * Math.sin(a);
      this.puppet(LOOKS.priest(k), [x, z], Math.atan2(sx - x, sz - z));
    }
    const hp = this.life.d.npcs.find('amenemope')?.rec.look ?? LOOKS.priest(0);
    this.puppet(hp, [sx + 2.2, sz], -Math.PI / 2);
    desertAudio.gong(this.life.loud(v3(SUN_SHRINE), 90));
    this.life.rite.on = true;
  }
  clear() {
    super.clear();
    this.life.rite.on = false;
  }
  tick(dt: number, d: number) {
    const life = this.life;
    this.pose += dt;
    const up = Math.floor(this.pose / 4) % 2 === 0;
    this.puppets.forEach((p, k) => p.play(k === 6 ? (up ? 'cheer' : 'talk') : up === (k % 2 === 0) ? 'cheer' : 'idle'));
    const vol = THREE.MathUtils.clamp(1 - d / 70, 0, 1);
    this.chantT -= dt;
    if (this.chantT <= 0 && vol > 0) {
      this.chantT = 6.5;
      desertAudio.chant(pick([0, 3, 4, 0, 7]), 6.4, vol);
    }
    const disc = v3(SUN_SHRINE, cityGround(...SUN_SHRINE) + 3.2);
    if (Math.random() < dt * 12) life.d.fx.add.spawn({ pos: disc, vel: new THREE.Vector3(0, 0.8, 0), spread: 1.2, count: 1, life: [1.5, 2.6], size: [0.09, 0.02], color: 0xfff0b0, color2: 0xffb040, upBias: 0.6, drag: 0.8, jitter: 1 });
    if (Math.random() < dt * 4) life.d.fx.alpha.spawn({ pos: disc.clone().setY(disc.y - 2.3).add(new THREE.Vector3(0.5, 0, 1.1)), vel: new THREE.Vector3(0, 0.5, 0), spread: 0.15, count: 1, life: [2.5, 4], size: [0.2, 0.9], color: 0xcfc4b0, alpha: 0.25, drag: 0.4 });
    this.sayT -= dt;
    if (this.sayT <= 0) {
      this.sayT = 11 + Math.random() * 5;
      const lines = life.rite.dusk
        ? ['Go gently under the sand, Eye of the World, and come back to us.', 'We thank you for the day, and for the water, and for the walls.', 'Sleep, and remember Ghagrabba in the dark.']
        : ['Rise, Eye of the World! Rise over the walls!', 'We have kept the night for you. Take back the day!', 'Light on the gold, light on the Well, light on the Queen!'];
      life.say(this.puppets[6].pos, 'High Priest Amenemope', pick(lines), 'chant', 5.5);
    }
  }
}

/** After the crown goes back to the sand-folk: Rust Row, the scavengers' market inside the west gate. */
class RustRow extends Act {
  private c: XZ = cw(38, 127);
  private talkT = 5;
  where() {
    if (this.life.ending !== 'sand' || !this.life.d.desert.cityLoaded) return null;
    if (!this.life.rustRowBuilt) this.life.buildRustRow();
    return inHours(this.life.hour, 7, 21) ? v3(this.c, cityGround(...this.c)) : null;
  }
  spawn() {
    const looks = [
      { body: 'male' as const, outfit: 'ranger' as const, hood: true, hair: 'buzzed' as const, beard: true, hairColor: 0x8a8070, skin: 0x8a5a3a, cloth: 0x6a5a48, linen: 0x9a8a70, height: 1.72 },
      { body: 'female' as const, outfit: 'ranger' as const, hood: true, hair: 'long' as const, hairColor: 0x2a1a10, skin: 0xa8744e, cloth: 0x7a6040, linen: 0xa89878, height: 1.64 },
      { body: 'male' as const, outfit: 'peasant' as const, hood: false, hair: 'simpleparted' as const, hairColor: 0x3a2a1a, skin: 0x7a4e32, cloth: 0x5a4a3a, linen: 0x8a7a60, height: 1.78 },
    ];
    looks.forEach((l, k) => this.puppet(l, [this.c[0] - 9 + k * 12, this.c[1] - 1.8], 0));
    this.puppet(LOOKS.child(2), [this.c[0] + 4, this.c[1] + 1.5]);
  }
  tick(dt: number) {
    this.puppets.forEach((p, k) => p.play(k === 3 ? 'dance' : 'talk'));
    this.talkT -= dt;
    if (this.talkT <= 0) {
      this.talkT = 10 + Math.random() * 6;
      this.life.say(pick(this.puppets.slice(0, 3)).pos, 'Rust Row Trader', pick(['Scrap! Good scrap, sold inside the walls at last!', 'Dune glass, shark teeth — honest prices, the Queen says so!', 'Two hundred years outside. Now look at us. A stall with a ROOF.']));
    }
  }
}

/** The scavenger lines grow kinder (or warier) with the ending; called once the ending is known. */
export function endingLines(ending: string) {
  const L = CITY_LINES;
  const add = (job: string, lines: string[]) => {
    const pool = (L[job] ??= {});
    pool.any = [...(pool.any ?? []), ...lines.filter((x) => !(pool.any ?? []).includes(x))];
  };
  if (ending === 'queen') {
    add('citizen', ['The sand-folk are gone from the gates. It is very quiet. I do not like how quiet.', 'They made the outlander a lord. Sword of the Sun Throne. I would not want that title.']);
    add('noble', ['At last the roads are safe and the rabble is gone. The Queen chose her blade well.']);
    add('guard', ['Orders are: no sand-folk within a mile of the walls. Not that there are many left.']);
  } else if (ending === 'sand') {
    add('citizen', ['The Great Well sings again. I dropped a stone in this morning just to hear it.', 'Rust Row is cheaper than the bazaar. Don\'t tell Hassun I said so.', 'The Vizier in chains, sweeping the Court of the Sun with a guard watching him!']);
    add('scavenger', ['Inside the walls! A stall with a roof! My mother would weep.', 'Ishara walks in the palace now. She still mends legs for nothing.']);
    add('noble', ['Scavengers in the bazaar. Next they will want seats at the royal table.']);
    add('guard', ['Orders are: sand-folk through the gates like anyone else. Took some getting used to.']);
  }
}

