import * as THREE from 'three';
import { events } from '../../core/events';
import { heightAt } from '../terrainHeight';
import { Bolts, type Bandit } from '../../enemies/bandit';
import { SandShark } from '../../enemies/sandCreatures';
import { SandEel, SandCrab, DuneJelly, RaySkimmer, type SandCreature } from '../../enemies/sandCreatures2';
import { Follower } from '../caravans';
import { SCAV_CAMPS } from './desertLayout';
import {
  WEST_GATE_OUT, WATCH_BRAZIERS, PATROL_REMAINS, FALCON_PERCH, STAR_STONES, STELAE, MIRAGE_WELL, HULKS, KETTLE_ROCK, OLD_OASIS,
  sickHouses, shopDoor, streetPath, farStreet, along, pathLength, cityGround, type XZ,
} from './ghagrabbaPlaces';
import * as P from './ghagrabbaProps';
import { Puppet, LOOKS } from './puppet';
import { Pack, need, banditAt } from './pack';
import { desertAudio } from './desertAudio';
import type { GhagrabbaDeps } from './ghagrabbaTypes';
import type { GhagrabbaLife } from './ghagrabbaLife';
import type { Interactable } from '../../dungeon/instance';
import type { Interior } from '../interior';
import type { Look } from '../../npc/charBuilder';

// The world side of Ghagrabba's errands (quests/ghagrabbaSide.ts): what the
// hunts drop, the blue-ragged fever houses, the saffron thief's night run,
// the stelae and star-stones, the west wall's braziers and the raid that
// follows, the fallen patrol and the riders that killed it, Amenhir's
// turtle, Khepri on her wreck, the oasis wells, the jellies over Mirage
// Well, Pebble at the Hulks, and the clues in the palace.

const v3 = (p: XZ, y = 0) => new THREE.Vector3(p[0], y, p[1]);
const RAIDER: Look = { body: 'male', outfit: 'ranger', hood: true, hair: 'buzzed', beard: true, hairColor: 0x2a1a10, skin: 0x8a5a3a, cloth: 0x5a4030, linen: 0x7a6a50, bracers: true, height: 1.78 };
const never = () => false;

/** Hunts whose prey carries what an errand needs: [kind, quest, stage, item, target]. */
const DROPS: [string, string, number, string, number][] = [
  ['duneJelly', 'hekat-flux', 0, 'jellyCore', 4],
  ['sandCrab', 'djau-shells', 0, 'crabShell', 5],
  ['sandEel', 'meritites-fever', 0, 'eelGland', 3],
  ['sandRay', 'sitre-ink', 0, 'rayInk', 4],
  ['sandShark', 'baket-feast', 0, 'sharkFin', 2],
];

interface Prop { at: XZ; make: () => THREE.Object3D; city?: boolean; obj?: THREE.Object3D; yaw?: number }

export class GhagrabbaSideHooks {
  readonly interactables: Interactable[] = [];
  private props: Prop[] = [];
  private bolts: Bolts;
  private shown = true;
  private packs: { pack: Pack<SandCreature | Bandit>; want: () => number }[] = [];
  private thief: { p: Puppet; path: XZ[]; s: number; L: number } | null = null;
  private thiefCooldown = 0;
  private pebble: Follower | null = null;
  private pebbleBound: Puppet | null = null;
  private falcon: ReturnType<typeof P.falcon> | null = null;
  private falconFly = -1;
  private flames: THREE.Mesh[] = [];
  private t = 0;

  constructor(private d: GhagrabbaDeps, private life: GhagrabbaLife) {
    this.bolts = new Bolts(d.scene);
    const q = d.quests;
    // Drops from the hunts.
    events.on('enemyDied', ({ kind }) => {
      for (const [k, id, stage, item, target] of DROPS) {
        if (k !== kind || !q.isActive(id, stage) || d.count(item) >= target) continue;
        d.give(item, 1);
      }
    });
    this.buildProps();
    this.buildInteractables();
    this.buildPacks();
  }

  // ---- props ----------------------------------------------------------------------------------------------

  private buildProps() {
    const add = (at: XZ, make: () => THREE.Object3D, city = false, yaw = 0) => this.props.push({ at, make, city, yaw });
    STELAE.forEach((at, k) => add(at, () => P.stele(k), false, k * 1.3));
    STAR_STONES.forEach((at, k) => add(at, () => {
      const s = P.starStone();
      s.starMat.userData.star = true;
      return s.group;
    }, k === 0, k));
    add(PATROL_REMAINS, P.fallenPatrol);
    add([PATROL_REMAINS[0] + 3, PATROL_REMAINS[1] - 2], () => P.obelisk(1.2, true));
    // Khepri's wreck: a hull half under the sand and a broken mast.
    add(FALCON_PERCH, () => {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 9, 12, 1, true, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.9, side: THREE.DoubleSide }));
      hull.rotation.set(Math.PI / 2, 0, Math.PI + 0.3);
      hull.position.y = 0.6;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 6, 6), P.std(0x5a4028));
      mast.position.set(0.4, 3, 0.5);
      mast.rotation.z = 0.12;
      g.add(hull, mast);
      return g;
    });
    // The Hulks' stake where Pebble is tied, the Old Oasis well, the west wall's watch braziers, the fever rags.
    add([HULKS[0] + 10, HULKS[1] + 8], P.stake);
    WATCH_BRAZIERS.forEach((at) => add(at, () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(P.brazierStandGeometry(), P.std(0x8a5a2a, 0.5, 0.7)));
      const flame = new THREE.Mesh(P.flameGeometry(), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85 }));
      flame.visible = false;
      flame.userData.watchFlame = true;
      g.add(flame);
      return g;
    }));
    sickHouses().forEach((at) => add(at, () => {
      const rag = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6), new THREE.MeshStandardMaterial({ color: 0x2a4ac8, roughness: 1, side: THREE.DoubleSide }));
      rag.position.y = 2.7;
      const g = new THREE.Group();
      g.add(rag);
      return g;
    }, true));
  }

  private updateProps() {
    const p = this.d.player.pos;
    for (const pr of this.props) {
      const dist = Math.hypot(p.x - pr.at[0], p.z - pr.at[1]);
      if (!pr.obj && dist < 600 && (!pr.city || this.d.desert.cityLoaded)) {
        pr.obj = pr.make();
        pr.obj.position.set(pr.at[0], pr.city ? cityGround(...pr.at) : heightAt(...pr.at), pr.at[1]);
        pr.obj.rotation.y = pr.yaw ?? 0;
        pr.obj.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
          if (o.userData.watchFlame) this.flames.push(o as THREE.Mesh);
        });
        this.d.scene.add(pr.obj);
      }
      if (pr.obj) pr.obj.visible = this.shown && dist < 800;
    }
  }

  // ---- interactables -----------------------------------------------------------------------------------------

  private buildInteractables() {
    const d = this.d, q = d.quests;
    const flag = (k: string) => !!d.flags[k];
    const note = (who: string, title: string, text: string) => d.talk(who, title, text, [{ label: 'Leave.', run: () => d.close() }]);
    // Meritites' fever balm at the blue-ragged doors.
    sickHouses().forEach((at, k) => this.interactables.push({
      pos: v3(at), radius: 2, label: () => 'Leave a pot of fever balm at the door',
      enabled: () => q.wants('fever-balm') && d.count('feverBalm') > 0 && !flag('gh:fever' + k),
      action: () => {
        d.take('feverBalm', 1);
        d.flags['gh:fever' + k] = true;
        q.signal('fever-balm');
        d.toast('You set the balm on the step. Someone inside coughs, and says thank you through the door.');
      },
    }));
    // Ipuwer's stelae.
    STELAE.forEach((at, k) => this.interactables.push({
      pos: v3(at), radius: 3, label: () => (flag('gh:stele' + k) ? 'A stele of old Amaunet (rubbed)' : 'Take a charcoal rubbing of the stele'),
      enabled: () => q.wants('stele-rubbing') && !flag('gh:stele' + k),
      action: () => {
        d.flags['gh:stele' + k] = true;
        q.signal('stele-rubbing');
        note('A Stele of Amaunet', 'Old Amaunet', ['"...the king gave his name to the sun..."', '"...and the wells were sung full every spring by the people of the sand..."', '"...the gate in the ring of dunes, which the Warden keeps..."', '"...let no crown be worn that thirsts its people..."'][k] + '\n\n(You rub charcoal over the cloth until the old script stands out black.)');
      },
    }));
    // Nefret's star-stones, by night.
    STAR_STONES.forEach((at, k) => this.interactables.push({
      pos: v3(at), radius: 2.6, label: () => (this.dark ? 'Read the star-stone by starlight' : 'A star-stone (the stars show only after dark)'),
      enabled: () => q.wants('star-read') && !flag('gh:star' + k) && this.dark,
      action: () => {
        d.flags['gh:star' + k] = true;
        q.signal('star-read');
        note('A Star-Stone', 'By starlight', 'The three cut stars glow faintly blue, and when you sight along them they line up with three real ones low in the sky — all pointing south-west, past the Warden\'s sands.');
      },
    }));
    // Rahotep's watch braziers.
    WATCH_BRAZIERS.forEach((at, k) => this.interactables.push({
      pos: v3(at), radius: 2.2, label: () => 'Light the watch brazier',
      enabled: () => q.wants('watch-brazier') && d.flags['gh:watch' + k] !== d.time.day,
      action: () => {
        d.flags['gh:watch' + k] = d.time.day;
        q.signal('watch-brazier');
        desertAudio.whoosh(0.4);
      },
    }));
    // The fallen patrol's badges.
    this.interactables.push({
      pos: v3(PATROL_REMAINS), radius: 3, label: () => 'Recover the fallen guards\' badges', enabled: () => q.wants('patrol-badges'),
      action: () => {
        d.give('sunGuardBadge', 2);
        q.signal('patrol-badges');
        note('The Fallen Patrol', 'South of the Caravan Way', 'Two shields in the sand, a torn teal banner, and under them what the riders and the sun have left. You take the two gold badges and say their names, Ib and Seneb, because someone should.');
      },
    });
    // Hassun's ledger, into Amenhir's own hands.
    const amenhir: Interactable = {
      pos: new THREE.Vector3(0, -999, 0), radius: 7, label: () => 'Give Hassun\'s ledger to Caravan Master Amenhir',
      enabled: () => q.wants('amenhir-met') && d.count('bazaarLedger') > 0,
      action: () => {
        d.take('bazaarLedger', 1);
        q.signal('amenhir-met');
        d.talk('Caravan Master Amenhir', 'The Caravan Way', 'Hassun\'s scarab — good. (He tucks it into his robe and his eyes go past you, to the sky.) And here they come. Gulls after the fishing boats. Riders! Keep them off the turtle!', [{ label: 'Draw steel.', run: () => d.close() }]);
      },
    };
    this.interactables.push(amenhir);
    this.amenhir = amenhir;
    // Khepri on the mast.
    this.interactables.push({
      pos: v3(FALCON_PERCH), radius: 6, label: () => 'Whistle for Khepri', enabled: () => q.wants('falcon-whistle'),
      action: () => {
        q.signal('falcon-whistle');
        this.falconFly = 0;
        d.toast('Khepri drops off the mast, circles you once, and makes for the palace like an arrow.');
      },
    });
    // Sweet water at the Old Oasis well, for the palace garden.
    const [ox, oz] = [SCAV_CAMPS[15][0] + 6, SCAV_CAMPS[15][1] - 4];
    this.interactables.push({
      pos: new THREE.Vector3(ox, 0, oz), radius: 2.4, label: () => 'Fill waterskins for the palace garden',
      enabled: () => q.isActive('garden-water', 0) && d.count('oasisWater') < 3,
      action: () => {
        d.give('oasisWater', 3 - d.count('oasisWater'));
        desertAudio.splash(0.6);
      },
    });
    // Pebble at the Hulks.
    this.interactables.push({
      pos: v3([HULKS[0] + 10, HULKS[1] + 8]), radius: 2.6, label: () => 'Cut Pebble free', enabled: () => q.wants('pebble-found'),
      action: () => {
        q.signal('pebble-found');
        d.talk('Pebble', 'Kettle Rock', '(A small girl with a split lip glares up at you until she sees you are cutting the rope, not tying it.) Are you from Grandmother? I KNEW she\'d send someone. I bit one of them. Can we go? Before they come back?', [{ label: 'Stay close to me.', run: () => d.close() }]);
      },
    });
  }
  private amenhir: Interactable | null = null;

  /** Inside the Palace of the Sun: Senmut's three clues (main.ts calls this when a palace interior opens). */
  onInterior(it: Interior): Interactable[] {
    if (it.kind !== 'palace') return [];
    const d = this.d, q = d.quests;
    const clues: [string, string, string, string][] = [
      ['treasurer', 'gh:clue0', 'Read the treasury ledger', 'Two hands keep this ledger: Senmut\'s neat one, and another that has gone back over his figures and made every sevens a one. The second hand belongs to the Vizier — you have seen it on his orders.'],
      ['vizier', 'gh:clue1', 'Search the Vizier\'s writing-desk', 'Under the petitions: a sheaf of pay-chits, stamped with a purple eye, for "diggers, night work, the cisterns" — paid out of the Queen\'s own gold.'],
      ['garden', 'gh:clue2', 'Fish in the garden pool', 'Something glints under the water lilies: a weighted leather bag of gold coins, tied off with purple cord, waiting for someone to collect it.'],
    ];
    const out: Interactable[] = [];
    for (const [spot, key, label, text] of clues) {
      const s = it.spots[spot];
      if (!s) continue;
      const pos = s.pos.clone().add(new THREE.Vector3(spot === 'garden' ? 2.2 : 1.2, 0, spot === 'vizier' ? 1.2 : 0));
      out.push({
        pos, radius: 1.8, label: () => label, enabled: () => q.wants('gold-clue') && !d.flags[key],
        action: () => {
          d.flags[key] = true;
          q.signal('gold-clue');
          d.talk('The Palace of the Sun', 'Senmut\'s errand', text, [{ label: 'Remember it.', run: () => d.close() }]);
        },
      });
    }
    return out;
  }

  // ---- fights -------------------------------------------------------------------------------------------------

  private buildPacks() {
    const d = this.d, q = d.quests;
    const creature = (m: SandCreature, dt: number) => m.update(dt, d.player, never);
    const bandit = (b: Bandit, dt: number) => b.update(dt, d.player);
    const ring = (at: THREE.Vector3, k: number, n: number, r: number) => {
      const a = (k / n) * Math.PI * 2;
      const x = at.x + Math.cos(a) * r, z = at.z + Math.sin(a) * r;
      return new THREE.Vector3(x, heightAt(x, z), z);
    };
    const add = (pack: Pack<SandCreature | Bandit>, want: () => number) => this.packs.push({ pack, want });
    // Raiders out of the dark at the west gate.
    add(new Pack<SandCreature | Bandit>(() => v3([WEST_GATE_OUT[0] - 30, WEST_GATE_OUT[1]]), (k, at) => banditAt(d.scene, this.bolts, at, k, 6, { role: k % 3 === 2 ? 'crossbow' : 'sword', kind: 'scavenger', name: 'Night Raider', look: RAIDER, radius: 8 }), (m, dt) => bandit(m as Bandit, dt), 120),
      () => (q.isActive('night-watch', 2) ? Math.max(need(q, 'night-watch', 2), 1) + 1 : 0));
    // The riders who killed the patrol.
    const rider = (at: THREE.Vector3, k: number) => {
      const r = new RaySkimmer(ring(at, k, 2, 30), d.scene, d.fx, this.bolts, RAIDER);
      r.onDismount = (p) => {
        const b = banditAt(d.scene, this.bolts, p, 0, 1, { role: 'sword', kind: 'scavenger', name: 'Unhorsed Ray-Rider', look: RAIDER, radius: 0.5 });
        b.alerted = true;
        this.loose.push(b);
      };
      return r;
    };
    add(new Pack<SandCreature | Bandit>(() => v3(PATROL_REMAINS), (k, at) => rider(at, k), (m, dt) => creature(m as SandCreature, dt), 250), () => need(q, 'lost-patrol', 1));
    // Riders on Amenhir's caravan.
    add(new Pack<SandCreature | Bandit>(() => this.caravanAt(), (k, at) => rider(at, k), (m, dt) => creature(m as SandCreature, dt), 160), () => need(q, 'caravan-ledger', 1));
    // Sharks round Khepri's wreck, jellies over Mirage Well, eels at the Old Oasis.
    add(new Pack<SandCreature | Bandit>(() => v3(FALCON_PERCH), (k, at) => new SandShark(ring(at, k, 2, 20), d.scene, d.fx), (m, dt) => creature(m as SandCreature, dt), 170), () => need(q, 'sethi-falcon', 1));
    add(new Pack<SandCreature | Bandit>(() => v3(MIRAGE_WELL), (k, at) => new DuneJelly(ring(at, k, 5, 18).setY(0), d.scene, d.fx), (m, dt) => creature(m as SandCreature, dt), 160), () => need(q, 'mirage-lights', 0));
    add(new Pack<SandCreature | Bandit>(() => v3(OLD_OASIS), (k, at) => new SandEel(ring(at, k, 4, 14), d.scene, d.fx), (m, dt) => creature(m as SandCreature, dt), 130), () => need(q, 'oasis-eels', 0));
    // A crab guards each unread stele.
    STELAE.forEach((at, k) => add(new Pack<SandCreature | Bandit>(() => v3(at), (_k, c) => new SandCrab(ring(c, 0, 1, 6), d.scene, d.fx), (m, dt) => creature(m as SandCreature, dt), 60),
      () => (q.wants('stele-rubbing') && !d.flags['gh:stele' + k] && !d.flags['gh:steleCrab' + k] ? 1 : 0)));
  }
  private loose: Bandit[] = [];

  private caravanAt() {
    const c = this.d.desert.caravanList.find((x) => x.name === 'Caravan Master Amenhir');
    return c ? c.pos.clone() : null;
  }

  private get dark() {
    const h = this.d.time.hour;
    return h >= 21 || h < 4;
  }

  // ---- per frame ----------------------------------------------------------------------------------------------

  update(dt: number) {
    const d = this.d, p = d.player.pos;
    this.t += dt;
    if (!this.shown || d.mode() !== 'overworld') return;
    this.updateProps();
    if (p.x > -2500) return;
    for (const { pack, want } of this.packs) pack.update(dt, d.player, want());
    // A stele's crab, once killed, stays dead.
    STELAE.forEach((_at, k) => {
      const pk = this.packs[this.packs.length - STELAE.length + k].pack;
      if (pk.live.length) this.crabSeen[k] = true;
      else if (this.crabSeen[k]) d.flags['gh:steleCrab' + k] = true;
    });
    for (const b of this.loose) b.update(dt, d.player);
    for (const b of this.loose.filter((b) => b.dead)) b.dispose();
    this.loose = this.loose.filter((b) => !b.dead && b.position.distanceTo(p) < 300);
    this.bolts.update(dt, d.player);
    // Amenhir's turtle carries his interactable.
    const c = this.caravanAt();
    if (c && this.amenhir) this.amenhir.pos.copy(c);
    // The watch braziers burn once lit, through the night.
    WATCH_BRAZIERS.forEach((_at, k) => {
      const f = this.flames[k];
      if (!f) return;
      f.visible = d.flags['gh:watch' + k] === d.time.day && (d.time.hour >= 19 || d.time.hour < 6);
      if (f.visible) f.scale.y = 0.85 + Math.sin(this.t * 13 + k) * 0.15;
    });
    // Star-stones glow after dark.
    for (const pr of this.props) pr.obj?.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m?.userData?.star) m.emissiveIntensity = this.dark ? 1.4 : 0;
    });
    this.updateThief(dt);
    this.updatePebble(dt);
    this.updateFalcon(dt);
  }
  private crabSeen: boolean[] = [];

  /** Nakht's saffron thief: slips out of the spice house after dark and runs. */
  private updateThief(dt: number) {
    const d = this.d, q = d.quests, p = d.player.pos;
    this.thiefCooldown -= dt;
    const shop = shopDoor('gh-spice');
    if (!shop || !d.desert.cityLoaded) return;
    const want = q.wants('thief-caught') && (d.time.hour >= 22 || d.time.hour < 4);
    if (!want) {
      if (this.thief) this.thief.p.dispose();
      this.thief = null;
      return;
    }
    if (!this.thief && this.thiefCooldown <= 0 && Math.hypot(p.x - shop.at[0], p.z - shop.at[1]) < 40) {
      const to = farStreet(shop.at, 60, 140, Math.floor(this.t * 1000) + 7);
      const path = streetPath(shop.at, to);
      if (!path) return;
      const pp = new Puppet(d.scene, LOOKS.child(0), shop.at, undefined, 0);
      pp.ground = cityGround;
      this.thief = { p: pp, path, s: 0, L: pathLength(path) };
      this.life.say(pp.pos, 'Spicer Nakht (from inside)', 'THIEF! There — the drain! Stop him!', 'night', 4);
    }
    const th = this.thief;
    if (!th) return;
    const dist = th.p.pos.distanceTo(p);
    // He runs while you chase, and tires.
    const speed = dist < 25 ? Math.max(3.2, 4.6 - th.s / 120) : 1.8;
    th.s = Math.min(th.L, th.s + speed * dt);
    const a = along(th.path, th.s);
    th.p.pos.set(a.x, 0, a.z);
    th.p.yaw = a.yaw;
    th.p.play(speed > 2.4 ? 'jog' : 'walk', speed > 2.4 ? speed / 3.6 : 1);
    th.p.update(dt);
    if (th.s >= th.L) {
      // Cornered at the end of his run, he doubles back somewhere else.
      const next = streetPath([a.x, a.z], farStreet([a.x, a.z], 40, 110, Math.floor(this.t * 977)));
      if (next) Object.assign(th, { path: next, s: 0, L: pathLength(next) });
    }
    if (dist < 2.2) {
      q.signal('thief-caught');
      th.p.dispose();
      this.thief = null;
      d.talk('The Saffron Thief', 'Caught', '(You catch a fistful of tunic and the thief stops struggling at once. It is a boy, no more than ten, all elbows and sand, with a twist of saffron in his fist.) Don\'t give me to the guard! Please. It\'s for water. The water-seller at Tarp Row takes saffron. My sister\'s sick. My name\'s Wick. ...Are you going to tell Nakht?', [{ label: 'Nakht will want to hear this.', run: () => d.close() }]);
    } else if (dist > 90) {
      th.p.dispose();
      this.thief = null;
      this.thiefCooldown = 20;
      d.toast('The thief has slipped away into the alleys. He will be back at the Spice House before long.');
    }
  }

  /** Pebble: bound at the Hulks, then at your heels all the way to Kettle Rock. */
  private updatePebble(dt: number) {
    const d = this.d, q = d.quests, p = d.player.pos;
    const bound = q.isActive('lost-pebble', 1), escort = q.isActive('lost-pebble', 2);
    const stake: XZ = [HULKS[0] + 10, HULKS[1] + 8];
    if (bound && !this.pebbleBound && Math.hypot(p.x - stake[0], p.z - stake[1]) < 120) {
      this.pebbleBound = new Puppet(d.scene, LOOKS.child(1), stake, undefined, Math.PI);
    } else if (this.pebbleBound && !bound) {
      this.pebbleBound.dispose();
      this.pebbleBound = null;
    }
    if (this.pebbleBound) {
      this.pebbleBound.play('sit');
      this.pebbleBound.update(dt);
    }
    if (escort && !this.pebble) {
      const near = Math.hypot(p.x - stake[0], p.z - stake[1]) < 60;
      this.pebble = new Follower(d.scene, LOOKS.child(1), near ? v3(stake) : p.clone().add(new THREE.Vector3(2, 0, 2)), 'Pebble');
      this.pebble.following = true;
    } else if (this.pebble && !escort) {
      this.pebble.dispose();
      this.pebble = null;
    }
    if (this.pebble) {
      this.pebble.update(dt, p);
      if (Math.hypot(this.pebble.pos.x - KETTLE_ROCK[0], this.pebble.pos.z - KETTLE_ROCK[1]) < 30) q.signal('pebble-home');
    }
  }

  /** Khepri on the mast, and flying home. */
  private updateFalcon(dt: number) {
    const d = this.d, q = d.quests, p = d.player.pos;
    const waiting = q.isActive('sethi-falcon') && (q.state['sethi-falcon']?.stage ?? 0) <= 2;
    const near = Math.hypot(p.x - FALCON_PERCH[0], p.z - FALCON_PERCH[1]) < 300;
    if ((waiting || this.falconFly >= 0) && near && !this.falcon) {
      this.falcon = P.falcon();
      this.falcon.group.position.set(FALCON_PERCH[0] + 0.45, heightAt(...FALCON_PERCH) + 6, FALCON_PERCH[1] + 0.5);
      d.scene.add(this.falcon.group);
    }
    const f = this.falcon;
    if (!f) return;
    if (this.falconFly >= 0) {
      this.falconFly += dt;
      const t = this.falconFly;
      f.wings.forEach((w, k) => (w.rotation.z = (k ? 1 : -1) * (0.4 + Math.sin(t * 14) * 0.8)));
      // Once round you, then off toward the city.
      if (t < 3) f.group.position.set(p.x + Math.cos(t * 2.1) * 6, p.y + 5 + Math.sin(t * 2) * 0.5, p.z + Math.sin(t * 2.1) * 6);
      else f.group.position.add(new THREE.Vector3(-0.8, 0.12, 0.4).normalize().multiplyScalar(18 * dt));
      if (t > 12) {
        d.scene.remove(f.group);
        this.falcon = null;
        this.falconFly = -1;
      }
    } else {
      f.wings.forEach((w, k) => (w.rotation.z = (k ? 1 : -1) * 1.3));
      f.group.rotation.y = Math.sin(this.t * 0.7) * 0.6;
      if (!waiting || !near) {
        d.scene.remove(f.group);
        this.falcon = null;
      }
    }
  }

  setVisible(v: boolean) {
    this.shown = v;
    for (const pr of this.props) if (pr.obj) pr.obj.visible = v;
    if (!v) {
      for (const { pack } of this.packs) pack.clear();
      for (const b of this.loose) b.dispose();
      this.loose = [];
      this.bolts.clear();
      this.thief?.p.dispose();
      this.thief = null;
      this.pebbleBound?.dispose();
      this.pebbleBound = null;
      if (this.falcon) this.d.scene.remove(this.falcon.group);
      this.falcon = null;
    }
  }
}
