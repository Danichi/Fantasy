import * as THREE from 'three';
import { mulberry32 } from '../../core/math';
import { physics } from '../../physics/physics';
import { heightAt } from '../terrainHeight';
import { sandWeight } from '../worldMap';
import { SCRAP_TOWNS, SCAV_CAMPS, SUNSPIRE, SUNKEN_GATE, campFloor, sunspirePad } from './desertLayout';
import { bake, std } from './ghagrabbaProps';
import { Scrapshell, DuneAngler, SandUrchin } from './sandFolk';
import type { SandCreature } from '../../enemies/sandCreatures2';
import type { NpcRecord, Place, Settlement } from '../../npc/npcManager';
import type { Look } from '../../npc/charBuilder';
import type { Interactable } from '../../dungeon/instance';
import type { GhagrabbaDeps, Service } from './ghagrabbaTypes';

// The scrap towns of the deep Expanse: walls of corrugated sheet and rusted
// hull plate round a ring of shacks, watch towers on stilts, tarps and a
// water tank. Three are home to sand-folk who will trade; two are held by
// scrapshells, the crab-folk who wear hull plate for a second shell. And out
// in the open sand, the sea's other leftovers: anglers buried under their
// lures, and urchins rolling over the dunes.

const RUST = [0x8a4a2a, 0x7a5a3a, 0x6a6a60, 0x9a6a3a, 0x5a4a3a, 0xa8743a];
const SKIN = [0xa8744e, 0x7a4e32, 0x8a5a3a, 0xc08a5a, 0x6a4028];

/** The friendly towns' people (main.ts adds these to the NPC system with the rest of the desert folk). */
export function scrapTownFolk(): { settlements: Settlement[]; records: NpcRecord[] } {
  const settlements: Settlement[] = [], records: NpcRecord[] = [];
  const v = (x: number, z: number) => new THREE.Vector3(x, heightAt(x, z), z);
  const ring = (cx: number, cz: number, r: number, n: number) => Array.from({ length: n }, (_, i) => v(cx + Math.cos((i / n) * 6.28 + 0.3) * r, cz + Math.sin((i / n) * 6.28 + 0.3) * r));
  SCRAP_TOWNS.forEach((t, k) => {
    if (!t.friendly) return;
    const sid = 'scraptown' + k;
    const sp = new Map<string, Place>();
    sp.set('camp', { id: 'camp', spots: ring(t.x, t.z, t.r * 0.4, 12) });
    sp.set('fire', { id: 'fire', spots: ring(t.x, t.z, 3.4, 8) });
    sp.set('huts', { id: 'huts', spots: ring(t.x, t.z, t.r * 0.65, 6), indoors: true });
    const post = (id: string, x: number, z: number) => {
      sp.set('post:' + id, { id: 'post:' + id, spots: [v(x, z)] });
      return 'post:' + id;
    };
    const r = mulberry32(700 + k);
    const look = (child = false): Look => {
      const f = r() < 0.5;
      return {
        body: f ? 'female' : 'male', outfit: r() < 0.6 ? 'ranger' : 'peasant', hood: r() < 0.6, hair: f ? 'long' : 'buzzed', beard: !f && r() < 0.5,
        hairColor: [0x1a1410, 0x3a2a1a, 0x6a5a48][Math.floor(r() * 3)], skin: SKIN[Math.floor(r() * SKIN.length)],
        cloth: RUST[Math.floor(r() * RUST.length)], linen: [0x9a8a70, 0x8a7a60, 0xa89878][Math.floor(r() * 3)], bracers: r() < 0.5, height: child ? 1.22 : 1.6 + r() * 0.2,
      };
    };
    const elders = ['Old Brazen', 'Mother Solder', 'Grandfather Gasket'], traders = ['Tinker Ooze', 'Swapper Clank', 'Dealer Copperlung'];
    const named = (id: string, name: string, title: string, lines: string[], x: number, z: number, act: 'talk' | 'shop' | 'idle') =>
      records.push({ id, name, title, job: id, settlement: sid, look: look(), named: true, lines: { any: lines }, schedule: [{ from: 0, activity: 'sleep', place: 'huts' }, { from: 5.5, activity: act, place: post(id, x, z) }, { from: 22.5, activity: 'sleep', place: 'huts' }] });
    const e = Math.floor(k / 2) % 3;
    named('town-elder-' + k, elders[e], 'Elder of ' + t.name, [`${t.name} is sheet and rivets and stubbornness. The wind takes a wall a month and we put it back.`, 'The crab-folk out at the plate towns would eat us if they could. They can\'t. We have more rivets.', 'Mind the lights on the sand at night. A lure means an angler, and an angler means teeth.'], t.x + 3, t.z - 2, 'talk');
    named('town-trader-' + k, traders[e], 'Trader of ' + t.name, ['Scrap for water, water for scrap, and dune glass for anything.'], t.x - 4, t.z + 3, 'shop');
    for (let i = 0; i < 10; i++) {
      const jj = (h: number) => h + ((i * 37) % 10) / 10 - 0.5;
      records.push({
        id: `st-${k}-${i}`, name: ['Bolt', 'Shim', 'Rivet', 'Slag', 'Tin', 'Hasp', 'Burr', 'Cog', 'Flange', 'Wick'][i] + ' of ' + t.name, title: (i > 7 ? 'Child' : 'Scavenger') + ' of ' + t.name,
        job: i > 7 ? 'child' : 'scavenger', settlement: sid, look: look(i > 7),
        schedule: [{ from: 0, activity: 'sleep', place: 'huts' }, { from: jj(6), activity: i > 7 ? 'play' : i % 3 ? 'work' : 'idle', place: 'camp' }, { from: jj(18.5), activity: 'talk', place: 'fire' }, { from: jj(23), activity: 'sleep', place: 'huts' }],
        lines: { any: ['Hammer it flat, bolt it down, call it a house.', 'We came out here when the city closed its wells. We are still out here.', 'Watch the crab-folk. Their shells are made of the same scrap as our walls.'], night: ['Keep inside the wall after dark. The lures come out.'] },
      });
    }
    const nodes: THREE.Vector3[] = [v(t.x, t.z)], edges: number[][] = [[]];
    for (const p of sp.values()) for (const s of p.spots) {
      nodes.push(s.clone());
      edges.push([0]);
      edges[0].push(nodes.length - 1);
    }
    settlements.push({ id: sid, center: v(t.x, t.z), radius: t.r + 40, places: sp, nodes, edges });
  });
  return { settlements, records };
}

/** Homes for one kind of creature, spawned as the player comes near and packed away behind. */
class Stream {
  readonly live = new Map<number, SandCreature>();
  private respawnAt = new Map<number, number>();
  constructor(readonly homes: THREE.Vector3[], private max: number, private near: number, private far: number, private respawn: number, private make: (h: THREE.Vector3) => SandCreature) {}
  update(dt: number, d: GhagrabbaDeps, time: number, sheltered: (p: THREE.Vector3) => boolean) {
    const p = d.player.pos;
    this.homes.forEach((h, i) => {
      const dist = Math.hypot(p.x - h.x, p.z - h.z);
      const c = this.live.get(i);
      if (!c && dist < this.near && this.live.size < this.max && (this.respawnAt.get(i) ?? 0) < time) this.live.set(i, this.make(h));
      if (c && (dist > this.far || c.dead)) {
        if (c.dead) this.respawnAt.set(i, time + this.respawn);
        c.dispose();
        this.live.delete(i);
      }
    });
    for (const c of this.live.values()) c.update(dt, d.player, sheltered);
  }
  clear() {
    for (const c of this.live.values()) c.dispose();
    this.live.clear();
  }
}

export class ScrapTowns {
  readonly interactables: Interactable[] = [];
  readonly services = new Map<string, Service>();
  private towns: { group: THREE.Group | null; fire: THREE.Vector3; garrison: Stream | null }[];
  private streams: Stream[] = [];
  private time = 0;
  private shown = true;

  constructor(private d: GhagrabbaDeps) {
    this.towns = SCRAP_TOWNS.map((t) => ({ group: null, fire: new THREE.Vector3(t.x, 0, t.z), garrison: null }));
    // Hostile towns keep a garrison of scrapshells and urchins (back a while after they're broken).
    SCRAP_TOWNS.forEach((t, k) => {
      if (t.friendly) return;
      const homes: THREE.Vector3[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        homes.push(new THREE.Vector3(t.x + Math.cos(a) * t.r * 0.45, 0, t.z + Math.sin(a) * t.r * 0.45));
      }
      this.towns[k].garrison = new Stream(homes, 6, 170, 320, 600, (h) => (homes.indexOf(h) % 3 === 2 ? new SandUrchin(h, d.scene, d.fx) : new Scrapshell(h, d.scene, d.fx, homes.indexOf(h) / 6)));
    });
    // The open sand: anglers buried under their lures, urchins, and wandering scrapshell bands.
    const rnd = mulberry32(9931);
    const homes = (n: number, ok: (x: number, z: number) => boolean) => {
      const out: THREE.Vector3[] = [];
      for (let tries = 0; tries < n * 80 && out.length < n; tries++) {
        const a = rnd() * Math.PI * 2, r = 300 + rnd() * 2900;
        const x = SUNSPIRE.x + 700 + Math.cos(a) * r, z = SUNSPIRE.z + 300 + Math.sin(a) * r * 0.7;
        if (sandWeight(x, z) < 0.6 || this.settledNear(x, z, 90) || !ok(x, z)) continue;
        out.push(new THREE.Vector3(x, 0, z));
      }
      return out;
    };
    this.streams.push(
      new Stream(homes(28, () => true), 4, 100, 170, 300, (h) => new DuneAngler(h, d.scene, d.fx)),
      new Stream(homes(34, () => true), 6, 110, 180, 240, (h) => new SandUrchin(h, d.scene, d.fx)),
      new Stream(homes(18, () => true).flatMap((h) => [h, h.clone().add(new THREE.Vector3(4, 0, 3)), h.clone().add(new THREE.Vector3(-3, 0, 4))]), 6, 150, 240, 420, (h) => new Scrapshell(h, d.scene, d.fx, Math.abs(h.x % 1))),
    );
    // The friendly towns' traders and their water barrels.
    SCRAP_TOWNS.forEach((t, k) => {
      if (!t.friendly) return;
      this.services.set('town-trader-' + k, (show, back) => [{
        label: 'Trade scrap and water',
        run: () => (d.shop ? d.shop(`Trader of ${t.name}`, t.name, 'Rivets, water, glass. If it rusts, we have it.', [['healthPotion', 18], ['manaPotion', 22], ['scrapCleaver', 55], ['buckler', 110], ['dates', 5], ['spicedTea', 22]]) : show('Scrap for water, water for scrap.', [{ label: 'Back.', run: back }])),
      }]);
      const barrel = new THREE.Vector3(t.x + 5, 0, t.z + 5);
      this.interactables.push({
        pos: barrel, radius: 2.4, label: () => `Drink from ${t.name}'s water tank`, enabled: () => !!this.towns[k].group,
        action: () => {
          d.player.stamina = d.player.maxStamina;
          d.player.hp = Math.min(d.player.maxHp, d.player.hp + d.player.maxHp * 0.1);
          d.toast('It tastes of iron. It is the best water you have ever had.');
        },
      });
    });
  }

  /** Inside a town, a camp, the city or the Sunken Gate's ring (no wild creatures there). */
  private settledNear(x: number, z: number, pad: number) {
    return sunspirePad(x, z) > 0 || SCAV_CAMPS.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r + pad) || SCRAP_TOWNS.some((t) => Math.hypot(x - t.x, z - t.z) < t.r + pad) || Math.hypot(x - SUNKEN_GATE.x, z - SUNKEN_GATE.z) < SUNKEN_GATE.r + pad;
  }
  /** The player is sheltered (creatures leave them be) in the city, a camp or a friendly town. */
  private sheltered = (p: THREE.Vector3) => sunspirePad(p.x, p.z) > 0.3 || SCAV_CAMPS.some(([cx, cz, r]) => Math.hypot(p.x - cx, p.z - cz) < r + 12) || SCRAP_TOWNS.some((t) => t.friendly && Math.hypot(p.x - t.x, p.z - t.z) < t.r + 4);

  private build(k: number) {
    const t = SCRAP_TOWNS[k];
    const rnd = mulberry32(4400 + k);
    const y = campFloor(t.x, t.z);
    const objs: THREE.Object3D[] = [];
    const add = (o: THREE.Object3D, x: number, z: number, yaw = 0, dy = 0) => {
      o.position.set(t.x + x, y + dy, t.z + z);
      o.rotation.y = yaw;
      objs.push(o);
      return o;
    };
    const box = (w: number, h: number, dd: number, color: number, metal = 0.5) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), std(color, 0.8, metal));
      return m;
    };
    // The wall: corrugated sheets and hull plates, each a little crooked, a gap for the gate.
    const n = Math.round((Math.PI * 2 * t.r) / 2.1);
    const gate = rnd() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a - gate), Math.cos(a - gate))) < 0.12) continue;
      const hull = rnd() < 0.18;
      const h = hull ? 3.6 + rnd() : 2.6 + rnd() * 0.8;
      const panel = new THREE.Group();
      const sheet = box(2.25, h, 0.1, RUST[Math.floor(rnd() * RUST.length)], 0.6);
      sheet.position.y = h / 2;
      panel.add(sheet);
      // Corrugation ribs, or rivet rows on a hull plate.
      for (let r = 0; r < (hull ? 3 : 5); r++) {
        const rib = hull ? box(2.2, 0.08, 0.14, 0x4a4a44, 0.8) : box(0.07, h, 0.16, 0x6a5a48, 0.6);
        if (hull) rib.position.set(0, 0.6 + r * (h / 3), 0);
        else rib.position.set(-0.9 + r * 0.45, h / 2, 0);
        panel.add(rib);
      }
      panel.rotation.z = (rnd() - 0.5) * 0.06;
      add(panel, Math.cos(a) * t.r, Math.sin(a) * t.r, -a + Math.PI / 2);
      physics.addBox(new THREE.Vector3(t.x + Math.cos(a) * t.r, y + h / 2, t.z + Math.sin(a) * t.r), new THREE.Vector3(1.12, h / 2, 0.12), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + Math.PI / 2));
    }
    // Watch towers on stilts, one by the gate.
    for (const a of [gate + 0.25, gate + 2.3, gate + 4.2]) {
      const tw = new THREE.Group();
      for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const post = box(0.16, 6, 0.16, 0x5a4028, 0);
        post.position.set(px, 3, pz);
        tw.add(post);
      }
      const floor = box(2.6, 0.15, 2.6, 0x6a5a48, 0.3);
      floor.position.y = 6;
      const rail = box(2.6, 1, 0.06, RUST[k % RUST.length], 0.6);
      rail.position.set(0, 6.5, 1.3);
      const rail2 = rail.clone();
      rail2.position.z = -1.3;
      const roof = box(3, 0.08, 3, RUST[(k + 2) % RUST.length], 0.6);
      roof.position.y = 8.2;
      roof.rotation.x = 0.15;
      for (const [px, pz] of [[-1.2, -1.2], [1.2, 1.2]]) {
        const pole = box(0.08, 2.2, 0.08, 0x5a4028, 0);
        pole.position.set(px, 7.1, pz);
        tw.add(pole);
      }
      tw.add(floor, rail, rail2, roof);
      add(tw, Math.cos(a) * (t.r - 3), Math.sin(a) * (t.r - 3), -a);
      physics.addBox(new THREE.Vector3(t.x + Math.cos(a) * (t.r - 3), y + 3, t.z + Math.sin(a) * (t.r - 3)), new THREE.Vector3(1.2, 3, 1.2));
    }
    // Shacks: sheet walls, a roof slab with a lip, a tarp door.
    const shacks = 7;
    for (let s = 0; s < shacks; s++) {
      const a = (s / shacks) * Math.PI * 2 + gate + 0.45;
      const r = t.r * (0.55 + (s % 2) * 0.12);
      const g = new THREE.Group();
      const W = 3 + rnd() * 1.2, D = 2.6 + rnd() * 0.8, H = 2.3 + rnd() * 0.5;
      const body = box(W, H, D, RUST[Math.floor(rnd() * RUST.length)], 0.55);
      body.position.y = H / 2;
      const roof = box(W + 0.7, 0.07, D + 0.7, RUST[Math.floor(rnd() * RUST.length)], 0.6);
      roof.position.y = H + 0.12;
      roof.rotation.x = 0.1;
      const door = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.9), new THREE.MeshStandardMaterial({ color: [0x8a3a2a, 0x2a6a6a, 0xa88a50][s % 3], roughness: 1, side: THREE.DoubleSide }));
      door.position.set(0, 0.95, D / 2 + 0.02);
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.2, 8), std(0x4a4a44, 0.6, 0.7));
      pipe.position.set(W / 2 - 0.4, H + 0.6, -D / 4);
      g.add(body, roof, door, pipe);
      add(g, Math.cos(a) * r, Math.sin(a) * r, -a - Math.PI / 2);
      physics.addBox(new THREE.Vector3(t.x + Math.cos(a) * r, y + H / 2, t.z + Math.sin(a) * r), new THREE.Vector3(W / 2, H / 2, D / 2), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a - Math.PI / 2));
    }
    // A great hull plate leaning against the wall, tarps strung between shacks, a water tank on legs.
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 7, 14, 1, true, 0, Math.PI * 0.8), new THREE.MeshStandardMaterial({ color: 0x7a4a2a, roughness: 0.8, metalness: 0.5, side: THREE.DoubleSide }));
    hull.rotation.z = Math.PI / 2;
    add(hull, Math.cos(gate + Math.PI) * (t.r - 5), Math.sin(gate + Math.PI) * (t.r - 5), -gate, 1.5);
    for (let s = 0; s < 4; s++) {
      const a = gate + 0.9 + s * 1.4;
      const tarp = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.6), new THREE.MeshStandardMaterial({ color: [0xb8a07a, 0x8a6a4a, 0x7a8a7a, 0xa85a3a][s], roughness: 1, side: THREE.DoubleSide }));
      tarp.rotation.x = -Math.PI / 2 + 0.2;
      add(tarp, Math.cos(a) * t.r * 0.3, Math.sin(a) * t.r * 0.3, a, 2.6);
    }
    const tank = new THREE.Group();
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.8, 14), std(0x6a6a60, 0.6, 0.7));
    drum.position.y = 3;
    tank.add(drum);
    for (const [px, pz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) {
      const leg = box(0.12, 2.1, 0.12, 0x5a4028, 0);
      leg.position.set(px, 1.05, pz);
      tank.add(leg);
    }
    const tap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6), std(0xb8863a, 0.4, 0.8));
    tap.position.set(0, 2.1, 1.1);
    tank.add(tap);
    add(tank, 5, 5);
    // A fire pit in the middle; raider towns plant bone pikes and red rags at the gate.
    for (let s = 0; s < 8; s++) {
      const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), std(0x6a6058));
      add(st, Math.cos(s * 0.785) * 1, Math.sin(s * 0.785) * 1, 0, 0.08);
    }
    if (!t.friendly) {
      for (const s of [-1, 1]) {
        const pike = box(0.1, 2.8, 0.1, 0x5a4028, 0);
        const skull = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.8, 5), std(0xe8dcc0, 0.7));
        skull.rotation.x = Math.PI / 2;
        skull.position.y = 1.5;
        const rag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.9), new THREE.MeshStandardMaterial({ color: 0x7a1a10, side: THREE.DoubleSide, roughness: 1 }));
        rag.position.set(0.3, 0.8, 0);
        const g = new THREE.Group();
        pike.position.y = 0;
        g.add(pike, skull, rag);
        const a = gate + s * 0.18;
        add(g, Math.cos(a) * (t.r + 3), Math.sin(a) * (t.r + 3), 0, 1.4);
      }
    }
    const group = new THREE.Group();
    group.add(bake(objs, 'scraptown:' + t.name));
    this.d.scene.add(group);
    this.towns[k].fire.y = y + 0.4;
    this.towns[k].group = group;
  }

  update(dt: number) {
    this.time += dt;
    const p = this.d.player.pos;
    if (!this.shown || p.x > -2500) return;
    const night = this.d.time.hour >= 19 || this.d.time.hour < 6;
    SCRAP_TOWNS.forEach((t, k) => {
      const town = this.towns[k];
      const dist = Math.hypot(p.x - t.x, p.z - t.z);
      if (!town.group && dist < 900) this.build(k);
      if (town.group) town.group.visible = dist < 1100;
      if (town.garrison) town.garrison.update(dt, this.d, this.time, this.sheltered);
      if (night && dist < 140 && Math.random() < dt * 14) this.d.fx.add.spawn({ pos: town.fire, vel: new THREE.Vector3(0, 1.8, 0), spread: 0.4, count: 1, life: [0.4, 0.8], size: [0.45, 0.08], color: 0xffc060, color2: 0xff3a00, upBias: 1.5 });
    });
    for (const s of this.streams) s.update(dt, this.d, this.time, this.sheltered);
  }

  setVisible(v: boolean) {
    this.shown = v;
    for (const t of this.towns) if (t.group) t.group.visible = v;
    if (!v) {
      for (const s of this.streams) s.clear();
      for (const t of this.towns) t.garrison?.clear();
    }
  }
}
