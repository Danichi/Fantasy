import * as THREE from 'three';
import { heightAt } from '../terrainHeight';
import { physics } from '../../physics/physics';
import { roadPoint } from '../roadData';
import { Bandit, Bolts } from '../../enemies/bandit';
import { Kit } from './kit';
import { Animal } from './actors';
import { GRASS_MASKS } from '../groundWindow';
import { RL_FRAMES, RL_SITES, WARDLIGHTS, RL_MILESTONES, milestonePoint, type RlFrame } from './paths';
import type { WorldMats } from '../buildings';
import type { FX } from '../../fx/particles';
import type { Player } from '../../player/player';
import type { Interactable } from '../../dungeon/instance';
import type { Activity, NpcRecord, Place, Settlement } from '../../npc/npcManager';
import type { Look } from '../../npc/charBuilder';
import type { Range, Species } from '../fauna';
import type { RoadLifeHooks, Renown, Service } from './types';

// The wayside places on the roads into the capital:
//
//   The Wayfork           a market crossroads where the Caravan Way leaves the
//                         Crown Road; a great market every third day
//   Halfpenny Bridge      a toll bridge on the Queen's Road, and Miller's Ford
//                         beside it for anyone who'd rather get wet than pay
//   Ser Tobin's camp      a hedge knight who challenges passers-by to a bout
//   The Pilgrims' Rest    a campfire by the shrine of the Dawn
//   Old Wendel's hut      a hermit in the woods south of the Crown Road
//   The Drover's Well     a well, a sheep fold and a big fire for the night
//   The Ashby camp        refugees from the orc marches, near the Kingsmile
//   The wardlights        three old lantern-posts nobody lights any more
//   The King's Prospect   the first sight of the capital from the Crown Road
//   Fort Rennick          a ruined border fort above the Queen's Road
//   The Queen's Camp      a travellers' fire on the Queen's Road
//   Saint Aveline         a wayside shrine (and a well) for travellers
//   The Copper Kettle     a caravan camp on the Caravan Way
//   Milestones            the distance to the capital, on every road in

const v = (x: number, z: number) => new THREE.Vector3(x, heightAt(x, z), z);

/** A road's frame at a wayside place. */
function frame(k: RlFrame) {
  const { road, s, lat } = RL_FRAMES[k];
  const a = roadPoint(road, s - 2), b = roadPoint(road, s + 2);
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const dx = (b[0] - a[0]) / l, dz = (b[1] - a[1]) / l;
  const sg = Math.sign(lat) || 1;
  const at = (ds = 0, dl = 0) => {
    const [x, z] = roadPoint(road, s + ds, lat + dl);
    return v(x, z);
  };
  return { at, dx, dz, along: Math.atan2(dx, dz), toRoad: Math.atan2(sg * dz, -sg * dx), sg };
}

const yawTo = (from: THREE.Vector3, to: THREE.Vector3) => Math.atan2(to.x - from.x, to.z - from.z);

// ---- people ----------------------------------------------------------------------------------------

interface Person {
  id: string;
  name: string;
  title: string;
  look: Look;
  named?: boolean;
  /** where they spend their waking hours */
  spots: THREE.Vector3[];
  yaw?: number;
  seated?: boolean;
  /** a shared place id (crowds); defaults to their own post */
  place?: string;
  /** [from hour, activity]; 'sleep' goes home (out of sight) */
  sched: [number, Activity][];
  lines: NpcRecord['lines'];
}

function settle(id: string, center: THREE.Vector3, radius: number, people: Person[]) {
  const places = new Map<string, Place>();
  places.set('home', { id: 'home', spots: [center.clone()], indoors: true });
  const records: NpcRecord[] = [];
  for (const p of people) {
    const pid = p.place ?? 'post:' + p.id;
    if (!places.has(pid)) places.set(pid, { id: pid, spots: p.spots, yaw: p.yaw, seated: p.seated });
    const schedule = [...p.sched].sort((a, b) => a[0] - b[0]).map(([from, activity]) => ({ from, activity, place: activity === 'sleep' ? 'home' : pid }));
    records.push({ id: p.id, name: p.name, title: p.title, job: p.id, settlement: id, look: p.look, schedule, lines: p.lines, named: p.named });
  }
  const settlement: Settlement = { id, center, radius, places, nodes: [], edges: [] };
  return { settlement, records };
}

const peasant = (female: boolean, hair: number, skin: number, linen: number, cloth?: number, height?: number): Look => ({ body: female ? 'female' : 'male', outfit: 'peasant', hair: female ? 'buns' : 'simpleparted', beard: !female && (hair & 1) === 1, hairColor: hair, skin, linen, cloth, height: height ?? (female ? 1.64 : 1.76) });
const child = (female: boolean, hair: number, skin: number, linen: number): Look => ({ body: female ? 'female' : 'male', outfit: 'peasant', hair: female ? 'long' : 'buzzed', hairColor: hair, skin, linen, height: 1.18 });

export const LOOKS = {
  tobin: { body: 'male', outfit: 'ranger', hair: 'simpleparted', beard: true, hairColor: 0x8a5a2a, skin: 0xe0b894, cloth: 0x3d7a45, pauldron: true, bracers: true, height: 1.86 } as Look,
  garrick: { body: 'male', outfit: 'peasant', hair: 'simpleparted', beard: true, hairColor: 0x3a2618, skin: 0xa8744e, linen: 0xe8c8c0, cloth: 0x7a2a6a, height: 1.78 } as Look,
  tam: child(false, 0x8a3f22, 0xe0b894, 0xd8c29a),
};

// ---- the builder ---------------------------------------------------------------------------------

export interface Wayside {
  settlements: { settlement: Settlement; records: NpcRecord[] }[];
  clearings: [number, number, number][];
  interactables: Interactable[];
  herds: { species: Species; count: number; range: Range }[];
  services: Map<string, Service>;
  /** where travellers rest at each stop: seats round a fire, or standing room */
  rest: Record<string, { seats: THREE.Vector3[]; look: THREE.Vector3 }>;
  /** the hedge knight's sparring ring */
  ring: THREE.Vector3;
  isMarketDay(): boolean;
  /** raise the toll pole for a traveller passing */
  tollTraffic(x: number, z: number): void;
  spawnGarrison(): void;
  garrison(): Bandit[];
  step(dt: number, player: Player): void;
  frame(dt: number, player: Player, night: number): void;
  setVisible(v: boolean): void;
  clear(): void;
}

export function buildWayside(scene: THREE.Scene, m: WorldMats, fx: FX, hooks: RoadLifeHooks, renown: Renown): Wayside {
  const kit = new Kit(scene, m, fx);
  const rnd = kit.rnd;
  const interactables: Interactable[] = [];
  const settlements: Wayside['settlements'] = [];
  const herds: Wayside['herds'] = [];
  const services = new Map<string, Service>();
  const rest: Wayside['rest'] = {};
  const flags = () => hooks.flags;
  const quests = () => hooks.quests;
  const wants = (sig: string) => !!quests()?.wants(sig);
  const night = () => { const h = hooks.hour(); return h >= 20 || h < 5; };
  const isMarketDay = () => hooks.day() % 3 === 0;
  let player: Player | null = null;
  const marketGroup = new THREE.Group();
  scene.add(marketGroup);
  const dynamic: THREE.Object3D[] = [marketGroup];
  const drink = () => {
    if (!player) return;
    player.stamina = player.maxStamina;
    player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.1);
    hooks.toast('Cold, clear well water.');
  };

  // ---- Milestones on the Queen's Road, the Caravan Way, the Logging Road and the Kingsbridge Road --------
  for (const ms of RL_MILESTONES) {
    const [x, z] = milestonePoint(ms);
    const [rx, rz] = roadPoint(ms.road, ms.s);
    const yaw = Math.atan2(rx - x, rz - z);
    const miles = ms.toCapital / 1609;
    const dist = miles >= 0.95 ? `${miles.toFixed(1)} MI` : `${Math.round(ms.toCapital)} PACES`;
    kit.milestone(x, z, yaw, ['ROYAL CAPITAL', dist, ms.other]);
    interactables.push({
      pos: v(x + Math.sin(yaw) * 0.9, z + Math.cos(yaw) * 0.9), radius: 2.2,
      label: () => (wants('rl-milestone') && !flags()['rl:mileq:' + ms.id] ? 'Check the milestone for the Mile-Reeve' : 'Read the milestone'),
      enabled: () => true,
      action: () => {
        const text = `ROYAL CAPITAL, ${dist} ${ms.via}. ${ms.other.replace('►', '').trim()}.`;
        if (wants('rl-milestone') && !flags()['rl:mileq:' + ms.id]) {
          flags()['rl:mileq:' + ms.id] = true;
          quests()?.signal('rl-milestone');
          const mossy = ms.id === 'c1200' || ms.id === 'q800';
          hooks.toast(mossy ? `${text} The carving is choked with moss; you scrape it clean and note it for Osric.` : `${text} Sound and true. You note it for Osric.`);
          hooks.save();
        } else hooks.toast(text);
      },
    });
  }

  // ---- The Wayfork: the market crossroads -------------------------------------------------------------
  {
    const W = v(RL_SITES.wayfork[0], RL_SITES.wayfork[1]);
    kit.clearings.push([W.x, W.z, 26]);
    const drinkAt = kit.well(W.x, W.z);
    interactables.push({ pos: drinkAt, radius: 2.2, label: () => 'Drink from the Wayfork well', enabled: () => true, action: drink });
    const colours = [0x7a2a6a, 0xc9922a, 0x2f7f86, 0xb8402e, 0x3d7a45, 0x2f5f9a];
    const keepers: THREE.Vector3[] = [], fronts: THREE.Vector3[] = [];
    [50, 100, 150, 210, 260, 310].forEach((deg, k) => {
      const a = (deg * Math.PI) / 180;
      const sx = W.x + Math.cos(a) * 12.5, sz = W.z + Math.sin(a) * 12.5;
      const faceIn = Math.atan2(W.x - sx, W.z - sz);
      // The stall's counter faces the well; its keeper stands behind it.
      keepers.push(kit.stall(sx, sz, faceIn + Math.PI, colours[k]));
      fronts.push(v(W.x + Math.cos(a) * 9.6, W.z + Math.sin(a) * 9.6));
    });
    const seats = kit.benches(W.x, W.z, 6, 4.4);
    // The Wayfork pole: a tall mast in the gap toward the fork, garlanded on market days.
    const P = v(W.x + 8, W.z);
    kit.put(new THREE.CylinderGeometry(0.12, 0.16, 7, 8), m.timber, P.x, 3.5, P.z);
    kit.put(new THREE.SphereGeometry(0.22, 8, 6), kit.col(0xd8b04a, 0.4), P.x, 7.1, P.z);
    physics.addCylinder(new THREE.Vector3(P.x, P.y + 3.5, P.z), 3.5, 0.18);
    [50, 100, 260, 310].forEach((deg, k) => {
      const a = (deg * Math.PI) / 180;
      kit.bunting(P.x, P.z, W.x + Math.cos(a) * 12.5, W.z + Math.sin(a) * 12.5, k % 2 ? 6.6 : 6.2, [0xb8402e, 0xe8c050, 0x2f5f9a, 0xf1e6cc, 0x3d7a45], marketGroup);
    });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 5.6), kit.cloth([0xb8402e, 0xe8c050, 0x2f5f9a][k % 3]));
      ribbon.position.set(P.x + Math.cos(a) * 0.6, P.y + 4.2, P.z + Math.sin(a) * 0.6);
      ribbon.rotation.set(0.14 * Math.sin(a), -a, 0.14 * Math.cos(a));
      marketGroup.add(ribbon);
    }
    // A puppet booth (busy on market days) and a hitching rail.
    {
      const a = Math.PI, bx = W.x + Math.cos(a) * 19, bz = W.z + Math.sin(a) * 19;
      const yaw = Math.atan2(W.x - bx, W.z - bz);
      kit.put(new THREE.BoxGeometry(2.4, 2.2, 1.0), kit.col(0x7a2a2a), bx, 1.1, bz, yaw);
      kit.put(new THREE.BoxGeometry(2.6, 0.5, 1.2), kit.col(0xd8b04a, 0.5), bx, 3.0, bz, yaw);
      kit.put(new THREE.BoxGeometry(1.6, 0.8, 0.05), kit.col(0x1a1010), bx + Math.sin(yaw) * 0.52, 2.35, bz + Math.cos(yaw) * 0.52, yaw);
      kit.solid(2.4, 2.4, 1, bx, heightAt(bx, bz) + 1.2, bz, yaw);
      const curtain = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), kit.cloth(0xb8402e));
      curtain.position.set(bx + Math.sin(yaw) * 0.54, heightAt(bx, bz) + 2.35, bz + Math.cos(yaw) * 0.54);
      curtain.rotation.y = yaw;
      marketGroup.add(curtain);
    }
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      kit.lantern(W.x + Math.cos(a) * 17, W.z + Math.sin(a) * 17);
    }
    for (let k = 0; k < 10; k++) {
      const a = rnd() * Math.PI * 2, r = 15 + rnd() * 5;
      kit.crate(W.x + Math.cos(a) * r, W.z + Math.sin(a) * r);
    }
    kit.fence(W.x - 6, W.z + 18, W.x + 4, W.z + 19);
    kit.sign(['THE WAYFORK', 'Great market every third day'], W.x + 15, W.z - 3, Math.PI / 2, 1.8);
    rest.wayfork = { seats, look: W.clone() };

    const crowdLooks = [peasant(true, 0x6a4428, 0xfff0e6, 0xd9cfe8, 0x2f5f9a), peasant(false, 0x3a2618, 0xe0b894, 0xd8c29a), peasant(true, 0xb8b4ae, 0xa8744e, 0xe8c8c0, 0x7a3f8a), peasant(false, 0xd2b26a, 0xfff0e6, 0xc9dbe8, 0x3d7a45), peasant(false, 0x1f1a17, 0x7a4e32, 0xe8d8b8, 0xb8402e)];
    const people: Person[] = [
      { id: 'garrick', name: 'Garrick Vell', title: 'Silk Merchant · The Wayfork', named: true, look: LOOKS.garrick, spots: [keepers[0]], sched: [[0, 'sleep'], [8, 'shop'], [19, 'sleep']],
        lines: { any: ['Valorian silk, softest thing this side of a cloud. What I have left of it.', 'The Red Hand took three bolts of my best off me on the Queen’s Road. Three!'] } },
      { id: 'bessa', name: 'Bessa Crumb', title: 'Baker · The Wayfork', named: true, look: peasant(true, 0xd2b26a, 0xfff0e6, 0xf0e0a8, 0xc9922a, 1.6), spots: [keepers[1]], sched: [[0, 'sleep'], [6, 'shop'], [19, 'sleep']],
        lines: { any: ['Road loaves! Bake ’em hard, they keep a week and stop a crossbow bolt besides.', 'Thornfield cheese, Kingsmile cider, my bread. That’s a traveller’s whole larder.'], morning: ['Fresh from the oven! Well. From the oven at four this morning.'] } },
      { id: 'tolliver', name: 'Tolliver Brass', title: 'Tinker · The Wayfork', named: true, look: { body: 'male', outfit: 'peasant', hair: 'buzzed', beard: true, hairColor: 0x6a6a6a, skin: 0xe0b894, linen: 0xc9dbe8, cloth: 0x2f7f86, height: 1.7 }, spots: [keepers[2]], sched: [[0, 'sleep'], [8, 'shop'], [18, 'sleep']],
        lines: { any: ['Pots mended, knives ground, lanterns fixed. Potions, if you’ve the coin.', 'I’ve walked every road in Cresha twice. The Crown Road’s the only one that walks back at you.'] } },
      { id: 'osric', name: 'Osric Penhallow', title: 'The Crown’s Mile-Reeve', named: true, look: { body: 'male', outfit: 'peasant', hair: 'simpleparted', hairColor: 0xb8b4ae, skin: 0xfff0e6, linen: 0xe8dcb8, cloth: 0x24467e, height: 1.74 }, spots: [v(W.x + 13, W.z - 4)], yaw: -Math.PI / 2, sched: [[0, 'sleep'], [8, 'idle'], [18, 'sleep']],
        lines: { any: ['Every milestone between here and the Queen’s Gate is my responsibility. Every one. Do you know how many milestones that is?', 'A milestone that lies is worse than none. Travellers plan their water by them.'] } },
      { id: 'lio', name: 'Lio Quickstring', title: 'Minstrel of the Wayfork', named: true, look: { body: 'male', outfit: 'peasant', hair: 'long', hairColor: 0xb0562a, skin: 0xfff0e6, linen: 0xe8c8c0, cloth: 0x7a3f8a, height: 1.74 }, spots: [v(P.x - 1.6, P.z + 1.4)], sched: [[0, 'sleep'], [10, 'play'], [21, 'sleep']],
        lines: { any: ['♪ Oh the Crown Road’s long and the Crown Road’s wide, and the orcs are on the eastern side… ♪', 'Every road has a song in it. I just walk until I trip over one.'], evening: ['One more! One more! Somebody stop me.'] } },
      { id: 'rl-hawker-0', name: 'Hawker', title: 'Market Hawker', look: crowdLooks[0], spots: keepers.slice(3), place: 'stalls', sched: [[0, 'sleep'], [7, 'shop'], [18, 'sleep']], lines: { any: ['Ribbons! Thimbles! Lucky Wayfork horseshoes!', 'Market day’s every third day. Today’s just the warm-up.'] } },
      { id: 'rl-hawker-1', name: 'Hawker', title: 'Market Hawker', look: crowdLooks[3], spots: keepers.slice(3), place: 'stalls', sched: [[0, 'sleep'], [7, 'shop'], [18, 'sleep']], lines: { any: ['Honey from Thornfield! Wax from the same bees!', 'You look like someone who needs a new pair of boots.'] } },
      { id: 'rl-hawker-2', name: 'Hawker', title: 'Market Hawker', look: crowdLooks[4], spots: keepers.slice(3), place: 'stalls', sched: [[0, 'sleep'], [8, 'shop'], [17, 'sleep']], lines: { any: ['Spice from the Expanse, straight off the Caravan Way!', 'Pepper’s dear this season. The Expanse traders say the sand’s moving.'] } },
      ...[0, 1, 2, 3, 4].map((i): Person => ({ id: 'rl-shopper-' + i, name: 'Market-goer', title: 'At the Wayfork', look: crowdLooks[(i + 1) % crowdLooks.length], spots: fronts, place: 'fronts', sched: [[0, 'sleep'], [8 + (i % 3), 'talk'], [16 + (i % 2), 'sleep']],
        lines: { any: ['Came all the way from Elder Glen for a new kettle. Worth it.', 'The Caravan Way runs all the way to Sunspire, they say. I’ve never been past the Copper Kettle.', 'Mind your purse in the crowd, friend.', 'Did you see the puppets? The orc one fell off its stick.'] } })),
      ...[0, 1].map((i): Person => ({ id: 'rl-wayforkkid-' + i, name: 'Child', title: 'At the Wayfork', look: child(i === 0, i ? 0x3a2618 : 0xd2b26a, 0xfff0e6, 0xe8c8c0), spots: [v(P.x + 2, P.z + 2), v(P.x + 1, P.z - 2.5)], place: 'pole', sched: [[0, 'sleep'], [9, 'play'], [18, 'sleep']], lines: { any: ['Catch me! You can’t!', 'Lio knows forty songs. FORTY.'] } })),
    ];
    settlements.push(settle('rl-wayfork', W, 45, people));
    services.set('bessa', () => [{ label: 'Buy provisions', run: () => hooks.shop('Bessa Crumb', 'Baker · The Wayfork', 'Bread for the road, cheese, cider. Eat well, walk far.', [['travellersBread', renown.price(6)], ['roadCheese', renown.price(9)], ['spicedCider', renown.price(8)], ['apple', renown.price(4)], ['healthPotion', renown.price(24)]]) }]);
    services.set('tolliver', () => [{ label: 'See what the tinker has', run: () => hooks.shop('Tolliver Brass', 'Tinker · The Wayfork', 'Bits and bobs. Every bob guaranteed, the bits less so.', [['healthPotion', renown.price(22)], ['manaPotion', renown.price(26)], ['minersLantern', renown.price(36)], ['planks', renown.price(8)], ['buckler', renown.price(110)], ['roundShield', renown.price(55)]]) }]);
    services.set('garrick', () => [{ label: 'Browse Garrick’s silks', run: () => hooks.shop('Garrick Vell', 'Silk Merchant · The Wayfork', 'What the Red Hand didn’t take. Cloaks, sashes, and the odd ribbon.', [['wayfarerCloak', renown.price(98)], ['warriorBelt', renown.price(84)], ['luckyCharm', renown.price(150)]]) }]);
    services.set('lio', (show, back) => [{
      label: 'Ask Lio for a song — 2g',
      run: () => {
        if (hooks.goldNow() < 2) return show('Two pennies, friend. Minstrels eat too. Mostly bread. Bessa’s bread.', [{ label: 'Back.', run: back }]);
        hooks.gold(-2);
        if (player) player.stamina = player.maxStamina;
        const ballad = quests()?.isDone('rl-road-ballad');
        show(ballad
          ? '♪ …and the stranger came down the Crown Road’s length, with a bridge-wife’s box and a hedge-knight’s strength… ♪\n\nThe crowd at the Wayfork turns to look at you. Someone cheers. You feel ten feet tall and not at all tired.'
          : '♪ Oh the Crown Road’s long and the Crown Road’s wide, and the orcs are on the eastern side; but the Kingsmile’s ale is cold and kind, so leave the marching to those behind… ♪\n\nYour feet stop aching for a while.', [{ label: 'Bravo!', run: back }]);
      },
    }]);
  }

  // ---- Halfpenny Bridge and Miller's Ford (the Queen's Road) ------------------------------------------
  const toll = frame('toll');
  let pole: THREE.Group;
  let poleCollider: ReturnType<typeof physics.addBox> | null = null;
  let poleUp = 0, poleWant = 0, trafficT = 0;
  const stream: THREE.Vector3[] = [];
  {
    // The brook: a ribbon of water across the road, wandering a little either side.
    for (let l = -50; l <= 50; l += 2.5) {
      const k = Math.max(0, Math.min(1, (Math.abs(l) - 22) / 12));
      const ds = k * (Math.sin(l * 0.09) * 4 + (l > 0 ? 1 : -1) * Math.sin(l * 0.031) * 3);
      stream.push(toll.at(ds, l));
    }
    const W2 = 1.7;
    const pos: number[] = [], idx: number[] = [];
    stream.forEach((p, i) => {
      const n = stream[Math.min(stream.length - 1, i + 1)], q = stream[Math.max(0, i - 1)];
      const tx = n.x - q.x, tz = n.z - q.z, tl = Math.hypot(tx, tz) || 1;
      const nx = -tz / tl, nz = tx / tl;
      for (const s of [-1, 1]) {
        const x = p.x + nx * W2 * s, z = p.z + nz * W2 * s;
        pos.push(x, Math.max(heightAt(x, z), heightAt(p.x, p.z)) + 0.07, z);
      }
      if (i > 0) idx.push((i - 1) * 2, i * 2, (i - 1) * 2 + 1, (i - 1) * 2 + 1, i * 2, i * 2 + 1);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const water = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x3d6f86, roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.82, side: THREE.DoubleSide }));
    water.receiveShadow = true;
    scene.add(water);
    dynamic.push(water);
    // Stones and reeds along the banks.
    stream.forEach((p, i) => {
      if (i % 2) return;
      for (const s of [-1, 1]) {
        const n = stream[Math.min(stream.length - 1, i + 1)];
        const tx = n.x - p.x, tz = n.z - p.z, tl = Math.hypot(tx, tz) || 1;
        const x = p.x - (tz / tl) * (W2 + 0.4) * s, z = p.z + (tx / tl) * (W2 + 0.4) * s;
        if (Math.abs(i - stream.length / 2) < 3) continue;
        if (rnd() < 0.5) kit.rock(x, z, 0.2 + rnd() * 0.25, false);
        else for (let r = 0; r < 4; r++) kit.put(new THREE.ConeGeometry(0.04, 0.9 + rnd() * 0.5, 4), kit.col(0x5a7a3a), x + (rnd() - 0.5) * 0.6, 0.45, z + (rnd() - 0.5) * 0.6);
      }
    });
    // The bridge: a plank deck with rails, humped a little over the water.
    const deckMat = m.planks;
    for (let k = -3; k <= 3; k++) {
      const p = toll.at(k * 0.9, 0);
      const hump = 0.22 + (1 - Math.abs(k) / 3) * 0.25;
      kit.add(new THREE.BoxGeometry(4.4, 0.14, 0.86), deckMat, p.x, p.y + hump, p.z, toll.along + Math.PI / 2);
    }
    for (const s of [-1, 1]) {
      for (let k = -3; k <= 3; k += 1.5) {
        const p = toll.at(k * 0.9, s * 2.15);
        kit.add(new THREE.BoxGeometry(0.14, 1.2, 0.14), m.timber, p.x, p.y + 0.7, p.z);
      }
      const c = toll.at(0, s * 2.15);
      kit.add(new THREE.BoxGeometry(0.1, 0.1, 5.8), m.timber, c.x, c.y + 1.25, c.z, toll.along);
      kit.solid(0.3, 1.4, 5.8, c.x, c.y + 0.7, c.z, toll.along);
    }
    // The toll pole on its post at the north end, and the toll house.
    const pp = toll.at(-4.4, 2.8);
    kit.add(new THREE.BoxGeometry(0.3, 1.4, 0.3), m.timber, pp.x, pp.y + 0.7, pp.z);
    pole = new THREE.Group();
    pole.position.set(pp.x, pp.y + 1.2, pp.z);
    pole.rotation.y = toll.along + Math.PI / 2;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.14, 0.14), kit.col(0xb8402e));
    bar.position.x = 2.9;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(5.82, 0.15, 0.15), kit.col(0xf1e6cc));
    stripe.scale.set(0.25, 1, 1);
    stripe.position.x = 2.2;
    const weight = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.3), m.stone);
    weight.position.x = -0.35;
    pole.add(bar, stripe, weight);
    pole.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
    scene.add(pole);
    dynamic.push(pole);
    const hp = toll.at(-12, 10);
    kit.house(hp.x, hp.z, yawTo(hp, toll.at(-12, 0)), { w: 6, d: 5, floors: 1, roof: 'thatch', seed: 77101 }, { kind: 'hall', name: 'the toll house', keeper: 'turnpenny' });
    const sp = toll.at(-9, -4.4);
    kit.sign(['HALFPENNY BRIDGE', 'Toll 3d · Ford free (wet feet)'], sp.x, sp.z, toll.along + Math.PI, 1.8);
    kit.lantern(toll.at(-5.5, -3.2).x, toll.at(-5.5, -3.2).z, 2.6);
    // Miller's Ford: stepping stones downstream.
    for (let k = -2; k <= 2; k++) {
      const q = toll.at(k * 0.8, -17 + (k % 2) * 0.3);
      kit.add(new THREE.CylinderGeometry(0.35, 0.42, 0.25, 8), m.stone, q.x, q.y + 0.12, q.z, rnd() * 3);
    }
    const ford = v(RL_SITES.ford[0], RL_SITES.ford[1]);
    kit.sign(['MILLER’S FORD', 'Mind the slippery stones'], ford.x - toll.dx * 6, ford.z - toll.dz * 6, toll.along, 1.4);
    kit.clearings.push([toll.at().x, toll.at().z, 22]);
    rest.toll = { seats: [toll.at(-7, 4.5), toll.at(-8, 5.5), toll.at(7, 4), toll.at(8, -4)], look: toll.at() };

    const box = v(RL_SITES.strongbox[0], RL_SITES.strongbox[1]);
    interactables.push({
      pos: box, radius: 2.6,
      label: () => 'Fish the strongbox out of the ford',
      enabled: () => !!quests()?.isActive('rl-drowned-strongbox') && hooks.count('tollStrongbox') === 0,
      action: () => {
        hooks.give('tollStrongbox', 1);
        hooks.toast('You plunge your arm into the cold ford up to the shoulder. Weed, weed, a boot, and: iron. The strongbox comes up streaming.');
        fx.add.spawn({ pos: box.clone().setY(box.y + 0.3), vel: new THREE.Vector3(0, 2, 0), spread: 1.6, count: 30, life: [0.4, 0.9], size: [0.12, 0.03], color: 0xcfe8ff, color2: 0x5a8aa6, gravity: 8 });
        hooks.save();
      },
    });
    settlements.push(settle('rl-toll', toll.at(), 30, [
      { id: 'turnpenny', name: 'Mags Turnpenny', title: 'Toll-Keeper of Halfpenny Bridge', named: true, look: { body: 'female', outfit: 'peasant', hair: 'buns', hairColor: 0x9a9a98, skin: 0xe0b894, linen: 0xd8c29a, cloth: 0x8a3a2a, height: 1.62 }, spots: [toll.at(-6.2, 4.2)], yaw: toll.along + Math.PI / 2, sched: [[0, 'sleep'], [6, 'idle'], [21, 'sleep']],
        lines: { any: ['Three pennies for the bridge, or the ford’s free for them as like wet boots.', 'Forty years I’ve kept this bridge. My mother kept it before me. The pole’s older than both of us.'], evening: ['Bridge closes when I say it closes, and I say it’s getting late.'] } },
      { id: 'pip', name: 'Pip Turnpenny', title: 'The Toll-Keeper’s Grandson', look: child(false, 0x8a5a2a, 0xe0b894, 0xc9dbe8), spots: [toll.at(3, 6), toll.at(-2, 8)], sched: [[0, 'sleep'], [8, 'play'], [19, 'sleep']], lines: { any: ['I can skip a stone five times! Four. Three and a bit.', 'Gran says the fish under the bridge are older than the King.'] } },
    ]));
    services.set('turnpenny', (show, back) => {
      const free = renown.tier >= 2 || quests()?.isDone('rl-drowned-strongbox');
      const paid = Number(flags()['rl:tollDay'] ?? -1) === hooks.day();
      if (paid) return [{ label: 'Ask about the road', run: () => show('Queen’s Road’s quiet, mostly. Robbers up at the old fort, mind. Rennick, the soldiers called it. Nobody calls it anything now but trouble.', [{ label: 'Back.', run: back }]) }];
      return [{
        label: free ? 'Cross the bridge (free for you)' : 'Pay the toll — 3g',
        run: () => {
          if (!free) {
            if (hooks.goldNow() < 3) return show('Three pennies. Not two. Not a promise. Three. The ford’s that way, love.', [{ label: 'Back.', run: back }]);
            hooks.gold(-3);
          }
          flags()['rl:tollDay'] = hooks.day();
          show(free ? 'For you? Put your purse away. Up she goes!' : 'Thank you kindly. Up she goes! And down she’ll come behind you, so don’t dawdle.', [{ label: 'Thanks.', run: back }]);
        },
      }];
    });
  }

  // ---- Ser Tobin Halloway, hedge knight (Crown Road) ------------------------------------------------
  const tob = frame('hedge');
  const ring = tob.at(0, -16);
  let tobinHorse: Animal | null = null;
  const horseAt = tob.at(-10, 6);
  {
    const pv = tob.at(0, 6);
    kit.pavilion(pv.x, pv.z, 0x3d7a45, 0xf1e6cc);
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const x = ring.x + Math.cos(a) * 8.6, z = ring.z + Math.sin(a) * 8.6;
      kit.put(new THREE.CylinderGeometry(0.07, 0.08, 1.1, 6), m.timber, x, 0.55, z);
      const b = Math.atan2(Math.sin(((k + 1) / 14) * Math.PI * 2) - Math.sin(a), Math.cos(((k + 1) / 14) * Math.PI * 2) - Math.cos(a));
      const nx = ring.x + Math.cos(a + Math.PI / 14) * 8.5, nz = ring.z + Math.sin(a + Math.PI / 14) * 8.5;
      kit.put(new THREE.CylinderGeometry(0.02, 0.02, 3.86, 4).rotateZ(Math.PI / 2), kit.col(0xd8c8a0), nx, 0.95, nz, -b);
    }
    GRASS_TRAMPLE(ring.x, ring.z, 8);
    // The challenge shield on its post.
    const sh = tob.at(-9.5, -9);
    kit.put(new THREE.BoxGeometry(0.16, 2.2, 0.16), m.timber, sh.x, 1.1, sh.z);
    const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 20), kit.col(0x3d7a45, 0.6));
    shield.rotation.x = Math.PI / 2;
    shield.rotation.y = tob.toRoad;
    shield.position.set(sh.x - Math.sin(tob.toRoad) * -0.12, sh.y + 1.7, sh.z - Math.cos(tob.toRoad) * -0.12);
    scene.add(shield);
    dynamic.push(shield);
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), kit.col(0xd8b04a, 0.3));
    boss.position.copy(shield.position).add(new THREE.Vector3(Math.sin(tob.toRoad) * 0.06, 0, Math.cos(tob.toRoad) * 0.06));
    scene.add(boss);
    dynamic.push(boss);
    const fire = tob.at(10, 3);
    kit.campfire(fire.x, fire.z);
    kit.benches(fire.x, fire.z, 3, 2.4);
    const rack = tob.at(7, -5);
    kit.put(new THREE.BoxGeometry(2, 0.1, 0.1), m.timber, rack.x, 1.5, rack.z, tob.along);
    for (let k = 0; k < 4; k++) kit.put(new THREE.CylinderGeometry(0.03, 0.03, 2.6, 5).rotateX(0.1), m.timber, rack.x + tob.dx * (k - 1.5) * 0.5, 1.3, rack.z + tob.dz * (k - 1.5) * 0.5);
    kit.put(new THREE.BoxGeometry(0.14, 1.2, 0.14), m.timber, horseAt.x + tob.dx * 2, 0.6, horseAt.z + tob.dz * 2);
    const sg = tob.at(-14, -30);
    kit.sign(['SER TOBIN HALLOWAY', 'Strike the shield to challenge'], sg.x, sg.z, tob.toRoad, 1.8);
    kit.clearings.push([tob.at().x, tob.at().z, 26]);
    interactables.push({
      pos: sh, radius: 2.4,
      label: () => (Number(flags()['rl:tobinDay'] ?? -1) === hooks.day() ? 'Ser Tobin has had enough for today' : 'Strike the shield (challenge Ser Tobin)'),
      enabled: () => Number(flags()['rl:tobinDay'] ?? -1) !== hooks.day() && hooks.hour() >= 7 && hooks.hour() < 20,
      action: () => {
        hooks.talk('Ser Tobin Halloway', 'Hedge Knight', 'BONG. The shield rings like a bell. Ser Tobin is on his feet at once, grinning.\n\n“A challenger! Into the ring, then. Blunted steel, first to yield. No hard feelings either way.”', [
          {
            label: 'Into the ring.',
            run: () => {
              hooks.close();
              flags()['rl:tobinDay'] = hooks.day();
              hooks.spar({ name: 'Ser Tobin Halloway', look: LOOKS.tobin, hp: 260, damage: 15, pace: 0.95, ring: ring.clone(), radius: 8.4 }, () => {
                quests()?.signal('rl-tobin-bested');
                if (!flags()['rl:tobinBeat']) {
                  flags()['rl:tobinBeat'] = true;
                  hooks.gold(40);
                  renown.add(2, 'Ser Tobin yields, laughing, and pays the forty pennies he wagers on every bout.');
                } else hooks.toast('Ser Tobin yields. “Again tomorrow? I’m learning, I swear it.”');
                hooks.save();
              });
            },
          },
          { label: 'Not today.', run: () => hooks.close() },
        ]);
      },
    });
    settlements.push(settle('rl-hedge', tob.at(), 36, [
      { id: 'tobin', name: 'Ser Tobin Halloway', title: 'Hedge Knight', named: true, look: LOOKS.tobin, spots: [tob.at(-7.5, -11)], yaw: tob.toRoad, sched: [[0, 'sleep'], [7, 'patrol'], [20, 'sit'], [23, 'sleep']],
        lines: { any: ['No lands, no lord, no horse worth the name. But a knight’s a knight, and the road needs keeping.', 'Strike my shield if you’d spar. I wager forty pennies on every bout, and I’m poorer every week.'], evening: ['Sit, sit. The fire’s free, and so’s the advice, and both are worth about that.'] } },
      { id: 'jory', name: 'Jory', title: 'Ser Tobin’s Squire', look: child(false, 0x3a2618, 0xa8744e, 0xd8c29a), spots: [tob.at(8, 0), tob.at(6, -4)], sched: [[0, 'sleep'], [7, 'work'], [20, 'sleep']], lines: { any: ['Ser Tobin is the finest knight in Cresha. He says so. And I believe him.', 'I polish the shield every morning. People hit it, and then I polish it again.'] } },
    ]));
  }

  // ---- The Pilgrims' Rest (by the shrine of the Dawn) ----------------------------------------------------
  {
    const f = frame('pilgrims');
    const c = f.at();
    kit.campfire(c.x, c.z, 1.1);
    const seats = kit.benches(c.x, c.z, 10, 2.9);
    for (const [ds, dl, col] of [[-7, 7, 0xe8dcc0], [1, 9, 0xd8c8a0], [8, 5, 0xe0c060]] as [number, number, number][]) {
      const t = f.at(ds, dl);
      kit.tent(t.x, t.z, yawTo(t, c), kit.cloth(col));
    }
    for (const ds of [-9, 9]) kit.put(new THREE.CylinderGeometry(0.05, 0.06, 3, 5), m.timber, f.at(ds, -4).x, 1.5, f.at(ds, -4).z);
    const flagsGroup = new THREE.Group();
    scene.add(flagsGroup);
    dynamic.push(flagsGroup);
    kit.bunting(f.at(-9, -4).x, f.at(-9, -4).z, f.at(9, -4).x, f.at(9, -4).z, 2.9, [0xf2f0ea, 0xe8c040, 0xd84a5a, 0x8a6ad8, 0xf2a7c0], flagsGroup);
    kit.lantern(f.at(-4, -6).x, f.at(-4, -6).z, 2.4);
    kit.clearings.push([c.x, c.z, 16]);
    rest.pilgrims = { seats: seats.slice(4), look: c.clone() };
    const pl = (i: number) => peasant(i % 2 === 0, [0xe6e2da, 0xb8b4ae, 0x6a4428][i % 3], [0xe0b894, 0xfff0e6, 0xa8744e][i % 3], 0xfff4dc, 0xe0c060);
    settlements.push(settle('rl-pilgrims', c, 26, [
      { id: 'agnes', name: 'Mother Agnes', title: 'Keeper of the Pilgrims’ Rest', named: true, look: { body: 'female', outfit: 'peasant', hair: 'buns', hairColor: 0xe6e2da, skin: 0xe0b894, linen: 0xfff4dc, cloth: 0xe8c060, height: 1.6 }, spots: [seats[0]], yaw: yawTo(seats[0], c), seated: true, sched: [[0, 'sit'], [2, 'sleep'], [6, 'idle'], [17, 'sit']],
        lines: { any: ['Rest, child. The Dawn sees the road from end to end, and the fire is free.', 'Pilgrims sleep here on their way to the Temple in the capital. Two more days’ walk, for old knees.'], night: ['Hush. They’re sleeping. Sit, if you like. Watch the fire with me.'] } },
      ...[1, 2, 3].map((i): Person => ({ id: 'rl-pilgrim-' + i, name: 'Pilgrim', title: 'Pilgrim of the Dawn', look: pl(i), spots: seats.slice(1, 4), place: 'seats', seated: true, sched: [[0, 'sleep'], [6, 'talk'], [9, 'sleep'], [18, 'sit'], [23, 'sleep']],
        lines: { any: ['We’ve walked from the Glen. My feet have opinions about it.', 'Mother Agnes has kept this fire burning thirty years. She says the Dawn lit it first.', 'Saint Aveline’s shrine is on the Queen’s Road, they say. Next year.'] } })),
    ]));
    services.set('agnes', (show, back) => [{
      label: 'Ask for Mother Agnes’s blessing',
      run: () => {
        if (player) {
          player.hp = player.maxHp;
          player.stamina = player.maxStamina;
        }
        show('She lays a dry hand on your brow. “May your road be short and your fire warm. Go with the Dawn.”\n\nThe weariness goes out of you like a breath.', [{ label: 'Thank you, Mother.', run: back }]);
      },
    }]);
  }

  // ---- Old Wendel's hut (the hermit of the south wood) ------------------------------------------------
  {
    const f = frame('hermit');
    const c = f.at();
    kit.house(c.x, c.z, f.toRoad, { w: 5, d: 4.5, floors: 1, roof: 'thatch', seed: 77201 }, { kind: 'home', name: 'Old Wendel’s hut', keeper: 'wendel' });
    kit.smokeAt(c.x + Math.cos(f.toRoad) * 1.4, c.y + 5.2, c.z - Math.sin(f.toRoad) * 1.4);
    const front = f.at(0, 6);
    // A drying rack of herbs, bee skeps, a woodpile, a little fenced garden.
    const rk = f.at(4, 5);
    for (const s of [-1, 1]) kit.put(new THREE.BoxGeometry(0.1, 1.8, 0.1), m.timber, rk.x + f.dx * s, 0.9, rk.z + f.dz * s);
    kit.put(new THREE.BoxGeometry(0.06, 0.06, 2.1), m.timber, rk.x, 1.75, rk.z, f.along);
    for (let k = 0; k < 6; k++) kit.put(new THREE.ConeGeometry(0.12, 0.45, 5).rotateX(Math.PI), kit.col([0x6a8a3a, 0x8a6a3a, 0x5a7a4a][k % 3]), rk.x + f.dx * (k - 2.5) * 0.32, 1.5, rk.z + f.dz * (k - 2.5) * 0.32);
    for (let k = 0; k < 3; k++) {
      const b = f.at(-5 - k * 1.3, 5);
      kit.put(new THREE.CylinderGeometry(0.25, 0.25, 0.5, 8), m.planks, b.x, 0.25, b.z);
      kit.put(new THREE.SphereGeometry(0.42, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.3, 1), kit.col(0xc8a85a), b.x, 0.5, b.z);
    }
    const wp = f.at(3.5, -3);
    for (let k = 0; k < 9; k++) kit.put(new THREE.CylinderGeometry(0.16, 0.16, 1.2, 7).rotateZ(Math.PI / 2), m.bark, wp.x + f.dx * ((k % 3) - 1) * 0.1, 0.2 + Math.floor(k / 3) * 0.3, wp.z + f.dz * ((k % 3) - 1) * 0.1, f.along + Math.PI / 2 + (k % 3) * 0.02);
    const g0 = f.at(-3, 10), g1 = f.at(4, 10), g2 = f.at(4, 15), g3 = f.at(-3, 15);
    kit.fence(g0.x, g0.z, g1.x, g1.z);
    kit.fence(g1.x, g1.z, g2.x, g2.z);
    kit.fence(g3.x, g3.z, g0.x, g0.z);
    // An old ring of little standing stones under the trees.
    const sc = f.at(12, -8);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      kit.put(new THREE.BoxGeometry(0.5, 1 + rnd() * 0.6, 0.35), m.stone, sc.x + Math.cos(a) * 4, 0.5, sc.z + Math.sin(a) * 4, -a);
    }
    for (let k = 0; k < 16; k++) {
      const a = rnd() * Math.PI * 2, r = 14 + rnd() * 18;
      const tx = c.x + Math.cos(a) * r, tz = c.z + Math.sin(a) * r;
      if (Math.hypot(tx - front.x, tz - front.z) < 10) continue;
      kit.tree(tx, tz, 0.8 + rnd() * 0.6);
    }
    kit.clearings.push([c.x, c.z, 14]);
    // A path of flat stones out to the road.
    for (let k = 1; k < 12; k++) {
      const p = f.at(Math.sin(k * 0.7) * 2, 8 + k * ((Math.abs(RL_FRAMES.hermit.lat) - 12) / 12));
      kit.add(new THREE.CylinderGeometry(0.42, 0.48, 0.1, 7), m.stone, p.x, p.y + 0.03, p.z, rnd() * 3);
    }
    settlements.push(settle('rl-hermit', c, 30, [
      { id: 'wendel', name: 'Old Wendel', title: 'The Hermit of the South Wood', named: true, look: { body: 'male', outfit: 'peasant', hood: true, hair: 'long', beard: true, hairColor: 0xd8d4cc, skin: 0xe0b894, linen: 0x8a7a5a, cloth: 0x4a5a3a, height: 1.7 }, spots: [front], yaw: f.toRoad + Math.PI, sched: [[0, 'sleep'], [6, 'work'], [22, 'sleep']],
        lines: { any: ['Visitors. Hm. Mind the bees; they mind you.', 'The road was here before the Crown. The lights along it, too. Nobody lights them now.', 'I came out here forty winters ago to be alone. The road keeps sending me company.'], night: ['Can’t sleep either? The barrow’s restless tonight. You can hear it, if you listen.'] } },
    ]));
    services.set('wendel', (show, back) => [
      {
        label: 'Ask Old Wendel for a fortune — 2g',
        run: () => {
          if (hooks.goldNow() < 2) return show('Two pennies, for the stones. The stones like pennies.', [{ label: 'Back.', run: back }]);
          hooks.gold(-2);
          const f = ['The stones say: a bridge, a box, and wet sleeves. Make of that what you will.', 'You will walk further than you mean to, and come home by a road you didn’t take.', 'Something old is waking under the long mounds. Not tonight. Soon.', 'A lady will lose something bright where the King can see it. You’ll find it, if you look up from your feet.', 'The red hand that takes will be cut off by a hand that gives. Bah. They always say that.', 'Mind the fifth milestone. Or the third. The stones aren’t good at counting.'];
          show(f[(hooks.day() * 7 + Math.floor(hooks.hour())) % f.length], [{ label: 'Hm.', run: back }]);
        },
      },
      { label: 'Buy Wendel’s remedies', run: () => hooks.shop('Old Wendel', 'The Hermit of the South Wood', 'Honey, garlic, and things that taste worse. All good for you.', [['healthPotion', renown.price(20)], ['honeycomb', renown.price(12)], ['wildGarlic', renown.price(5)], ['silverthistle', renown.price(15)]]) },
    ]);
  }

  // ---- The Drover's Well ---------------------------------------------------------------------------------
  {
    const f = frame('drovers');
    const c = f.at();
    const wl = f.at(-8, 2);
    const drinkAt = kit.well(wl.x, wl.z);
    interactables.push({ pos: drinkAt, radius: 2.2, label: () => 'Drink from the Drover’s Well', enabled: () => true, action: drink });
    const fire = f.at(4, -1);
    kit.campfire(fire.x, fire.z, 1.3);
    const seats = kit.benches(fire.x, fire.z, 8, 3.1);
    // A hurdle fold for the sheep.
    const fold = f.at(5, -18);
    const corners = [[-6, -6], [6, -6], [6, 6], [-6, 6]].map(([a, b]) => f.at(5 + a, -18 + b));
    for (let k = 0; k < 4; k++) kit.fence(corners[k].x, corners[k].z, corners[(k + 1) % 4].x, corners[(k + 1) % 4].z, kit.col(0x8a6a44));
    herds.push({ species: 'sheep', count: 5, range: { center: new THREE.Vector3(fold.x, 0, fold.z), radius: 4.5 } });
    herds.push({ species: 'dog', count: 1, range: { center: new THREE.Vector3(fire.x, 0, fire.z), radius: 8 } });
    const rail = f.at(-14, -4);
    kit.put(new THREE.BoxGeometry(0.1, 0.1, 4), m.timber, rail.x, 1.05, rail.z, f.along);
    for (const s of [-1.9, 1.9]) kit.put(new THREE.BoxGeometry(0.14, 1.2, 0.14), m.timber, rail.x + f.dx * s, 0.6, rail.z + f.dz * s);
    for (let k = 0; k < 5; k++) kit.crate(f.at(-12 + rnd() * 6, 6 + rnd() * 4).x, f.at(-12 + rnd() * 6, 6 + rnd() * 4).z);
    kit.lantern(f.at(-3, 5).x, f.at(-3, 5).z, 2.6);
    kit.clearings.push([c.x, c.z, 20]);
    rest.drovers = { seats: seats.slice(2), look: fire.clone() };
    settlements.push(settle('rl-drovers', c, 30, [
      { id: 'cobb', name: 'Cobb Shearling', title: 'Drover of the Drover’s Well', named: true, look: { body: 'male', outfit: 'peasant', hair: 'buzzed', beard: true, hairColor: 0x6a4428, skin: 0xa8744e, linen: 0xd8c29a, cloth: 0x6a7f3a, height: 1.8 }, spots: [f.at(5, -11)], sched: [[0, 'sleep'], [6, 'work'], [20, 'sit'], [23, 'sleep']],
        lines: { any: ['Wolves in the north wood, bandits on the knoll, and me in the middle with forty sheep. Living the dream.', 'Keep the fire high and the wolves keep off. Mostly. Keep a stick handy for the rest.'], evening: ['Pull up a log. Cheese? It’s Thornfield. The good stuff.'] } },
      { id: 'rl-drover-1', name: 'Drover’s Lad', title: 'At the Drover’s Well', look: peasant(false, 0xd2b26a, 0xfff0e6, 0xd8c29a, 0x6a7f3a, 1.7), spots: [seats[0], seats[1]], place: 'seats', seated: true, sched: [[0, 'sleep'], [6, 'work'], [19, 'sit'], [23, 'sleep']], lines: { any: ['Cobb says I’ll make a drover yet. Cobb says a lot of things.'] } },
    ]));
    services.set('cobb', () => [{ label: 'Buy cheese and wool', run: () => hooks.shop('Cobb Shearling', 'Drover', 'Thornfield cheese, raw wool, and a dog that isn’t for sale.', [['roadCheese', renown.price(8)], ['wool', renown.price(6)], ['milk', renown.price(7)]]) }]);
  }

  // ---- The Ashby camp (refugees from the marches) ---------------------------------------------------------
  {
    const f = frame('refugee');
    const c = f.at();
    kit.campfire(c.x, c.z, 0.9);
    const seats = kit.benches(c.x, c.z, 7, 2.5);
    for (let k = 0; k < 3; k++) {
      const a = Math.PI * 0.2 + k * 0.75 + Math.atan2(-f.dx, -f.dz);
      const lx = c.x + Math.cos(a) * 7, lz = c.z + Math.sin(a) * 7, ly = heightAt(lx, lz);
      const yaw = Math.atan2(c.x - lx, c.z - lz);
      const roof = new THREE.PlaneGeometry(3, 2.6);
      roof.rotateX(-Math.PI / 2 + 0.85);
      kit.add(roof, kit.cloth([0x8a7a5a, 0x6a5a4a, 0x9a8a6a][k]), lx, ly + 1.0, lz, yaw);
      for (const s of [-1, 1]) kit.add(new THREE.BoxGeometry(0.1, 1.9, 0.1), m.timber, lx + Math.cos(yaw) * s * 1.4 + Math.sin(yaw) * 0.85, ly + 0.95, lz - Math.sin(yaw) * s * 1.4 + Math.cos(yaw) * 0.85);
      kit.add(new THREE.BoxGeometry(1.8, 0.2, 0.9), kit.col(0x7a6a5a), lx - Math.sin(yaw) * 0.3, ly + 0.1, lz - Math.cos(yaw) * 0.3, yaw);
    }
    const w0 = f.at(-6, -6), w1 = f.at(4, -7);
    for (const p of [w0, w1]) kit.put(new THREE.CylinderGeometry(0.04, 0.05, 2, 5), m.timber, p.x, 1, p.z);
    const line = new THREE.Group();
    scene.add(line);
    dynamic.push(line);
    kit.bunting(w0.x, w0.z, w1.x, w1.z, 1.85, [0xe8e0d0, 0x9ab8c8, 0xc8a890, 0xe8e0d0], line);
    for (let k = 0; k < 6; k++) kit.crate(f.at(-9 + rnd() * 4, 3 + rnd() * 5).x, f.at(-9 + rnd() * 4, 3 + rnd() * 5).z, rnd() * 3, 0.7);
    const cart = f.at(8, 6);
    kit.put(new THREE.BoxGeometry(1.4, 0.4, 2), m.planks, cart.x, 0.75, cart.z, f.along + 0.3);
    kit.put(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 12).rotateZ(Math.PI / 2), m.planks, cart.x, 0.5, cart.z, f.along + 0.3);
    kit.clearings.push([c.x, c.z, 16]);
    rest.refugee = { seats: seats.slice(3), look: c.clone() };
    settlements.push(settle('rl-refugee', c, 28, [
      { id: 'edda', name: 'Edda Ashby', title: 'Of the Burnt Farm', named: true, look: { body: 'female', outfit: 'peasant', hair: 'long', hairColor: 0x8a3f22, skin: 0xe0b894, linen: 0xc8b896, cloth: 0x6a5a4a, height: 1.66 }, spots: [f.at(-2.5, -3.5)], sched: [[0, 'sleep'], [6, 'idle'], [22, 'sleep']],
        lines: { any: ['The orcs came at night. We got out with the cart and what we had on. The house… you’ll have seen the house.', 'The Kingsmile is full and the capital won’t open its gates to farmers without papers. So: here.'] } },
      { id: 'harl', name: 'Old Harl Ashby', title: 'Of the Burnt Farm', named: true, look: { body: 'male', outfit: 'peasant', hair: 'buzzed', beard: true, hairColor: 0xe6e2da, skin: 0xe0b894, linen: 0xb8a888, height: 1.68 }, spots: [seats[0]], yaw: yawTo(seats[0], c), seated: true, sched: [[0, 'sleep'], [7, 'sit'], [21, 'sleep']],
        lines: { any: ['Sixty years on that land. My father’s, his father’s. Orcs don’t care for any of it.', 'Our Gawen’s a knight in the capital, you know. Silver Lance. Too grand to write to his old uncle now.'] } },
      ...[1, 2].map((i): Person => ({ id: 'rl-refugee-' + i, name: 'Refugee', title: 'From the Orc Marches', look: peasant(i === 1, i === 1 ? 0x3a2618 : 0x6a4428, i === 1 ? 0xa8744e : 0xfff0e6, 0xb8a888, 0x6a5a4a), spots: [seats[1], seats[2]], place: 'seats', seated: true, sched: [[0, 'sleep'], [7, 'sit'], [21, 'sleep']],
        lines: { any: ['We’re from Ditchley, past the barrow. Was Ditchley. There’s nothing there now.', 'Edda feeds everyone who comes. I don’t know where she finds it.', 'If the Lance would ride out for one week, just one, we could go home.'] } })),
      { id: 'rl-refugee-kid', name: 'Nell', title: 'From the Orc Marches', look: child(true, 0x8a3f22, 0xe0b894, 0xc9dbe8), spots: [f.at(4, 3), f.at(-4, 4)], sched: [[0, 'sleep'], [8, 'play'], [19, 'sleep']], lines: { any: ['Tam’s my brother. He’s brave. Mum says he’s an idiot.', 'Have you got any bread? Just asking.'] } },
    ]));
  }

  // ---- The wardlights ---------------------------------------------------------------------------------
  const wardMats: THREE.MeshStandardMaterial[] = [];
  WARDLIGHTS.forEach((p, i) => {
    const w = v(p[0], p[1]);
    kit.put(new THREE.BoxGeometry(0.42, 2.2, 0.42), m.stone, w.x, 1.1, w.z);
    kit.put(new THREE.BoxGeometry(0.62, 0.12, 0.62), m.stone, w.x, 2.25, w.z);
    for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) kit.put(new THREE.BoxGeometry(0.03, 0.5, 0.03), kit.col(0x2a2a2c, 0.5), w.x + dx, 2.55, w.z + dz);
    kit.put(new THREE.ConeGeometry(0.36, 0.3, 4).rotateY(Math.PI / 4), kit.col(0x2a2a2c, 0.5), w.x, 2.95, w.z);
    kit.solid(0.45, 2.3, 0.45, w.x, w.y + 1.1, w.z);
    const mat = new THREE.MeshStandardMaterial({ color: 0xfff0c0, emissive: 0xffc070, emissiveIntensity: 0 });
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), mat);
    flame.position.set(w.x, w.y + 2.5, w.z);
    scene.add(flame);
    dynamic.push(flame);
    wardMats.push(mat);
    interactables.push({
      pos: w, radius: 2.3,
      label: () => (flags()['rl:ward:' + i] ? 'The wardlight burns' : wants('rl-wardlight') ? (night() ? 'Relight the wardlight' : 'Relight the wardlight (after dark)') : 'An old wardlight, cold and empty'),
      enabled: () => true,
      action: () => {
        if (flags()['rl:ward:' + i]) return hooks.toast('The little flame burns steady behind its iron. Travellers will see it from a mile off.');
        if (!wants('rl-wardlight')) return hooks.toast('A lantern-post far older than the milestones, its iron cage rusted and empty. Someone has scratched a little eight-rayed wheel on the stone.');
        if (!night()) return hooks.toast('Old Wendel said: light them after dark, when they mean something. The wick waits for nightfall.');
        flags()['rl:ward:' + i] = true;
        quests()?.signal('rl-wardlight');
        fx.add.spawn({ pos: w.clone().setY(w.y + 2.5), vel: new THREE.Vector3(0, 1, 0), spread: 0.8, count: 24, life: [0.4, 1], size: [0.18, 0.02], color: 0xffd080, color2: 0xff7a2a, upBias: 1 });
        hooks.toast('You trim Wendel’s wick and strike a light. The wardlight catches, small and fierce, and the dark down the road seems to step back.');
        hooks.save();
      },
    });
  });

  // ---- The King's Prospect ----------------------------------------------------------------------------
  {
    // The highest ground near the planned spot: the view is the point.
    const f = frame('prospect');
    let best = f.at(), bh = -Infinity;
    for (let dx = -24; dx <= 24; dx += 6) for (let dl = -24; dl <= 24; dl += 6) {
      const q = f.at(dx, dl);
      if (q.y > bh) (bh = q.y), (best = q);
    }
    const P = best;
    const capital = new THREE.Vector3(-3440, 0, -1060);
    const look = Math.atan2(capital.x - P.x, capital.z - P.z);
    kit.add(new THREE.CylinderGeometry(4.4, 4.7, 0.6, 20), m.bridgeStone ?? m.stone, P.x, P.y + 0.05, P.z);
    for (let k = 0; k < 11; k++) {
      const a = look + Math.PI / 2 + (k / 10) * Math.PI;
      kit.add(new THREE.BoxGeometry(1.4, 0.7, 0.4), m.stone, P.x + Math.sin(a) * 4.3, P.y + 0.6, P.z + Math.cos(a) * 4.3, a);
    }
    for (let k = 0; k < 8; k++) {
      const a = look - Math.PI / 2 + (k / 7) * Math.PI;
      kit.solid(1.4, 0.8, 0.4, P.x + Math.sin(a) * 4.3, P.y + 0.6, P.z + Math.cos(a) * 4.3, a);
    }
    const bench = new THREE.Vector3(P.x - Math.sin(look) * 1.5, P.y, P.z - Math.cos(look) * 1.5);
    kit.add(new THREE.BoxGeometry(2, 0.12, 0.5), m.planks, bench.x, bench.y + 0.8, bench.z, look + Math.PI / 2);
    for (const s of [-0.8, 0.8]) kit.add(new THREE.BoxGeometry(0.2, 0.5, 0.45), m.stone, bench.x + Math.cos(look) * s, bench.y + 0.55, bench.z - Math.sin(look) * s, look + Math.PI / 2);
    const ped = new THREE.Vector3(P.x + Math.sin(look) * 2.2, P.y, P.z + Math.cos(look) * 2.2);
    kit.add(new THREE.CylinderGeometry(0.22, 0.3, 1.1, 10), m.stone, ped.x, ped.y + 0.85, ped.z);
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 24), new THREE.MeshStandardMaterial({ color: 0xc9a040, metalness: 0.8, roughness: 0.35 }));
    dial.position.set(ped.x, ped.y + 1.43, ped.z);
    dial.rotation.x = 0.35;
    dial.rotation.y = look;
    scene.add(dial);
    dynamic.push(dial);
    kit.clearings.push([P.x, P.z, 8]);
    GRASS_TRAMPLE(P.x, P.z, 5);
    interactables.push({
      pos: ped.clone(), radius: 2.6,
      label: () => 'Take in the view',
      enabled: () => true,
      action: () => {
        hooks.card('The King’s Prospect', 'The Royal Capital, from the last rise of the Crown Road');
        hooks.toast('Below you the Crown Road runs between golden fields to the East Gate; behind white walls the city climbs Crown Hill in rings, and the palace’s golden spires catch the light. The brass dial names it all: the Commandery, the Temple of the Dawn, the Kingsbridge, the river.');
        if (!flags()['rl:prospect']) {
          flags()['rl:prospect'] = true;
          hooks.xp(40);
          renown.add(1);
          hooks.save();
        }
      },
    });
    interactables.push({
      pos: bench.clone(), radius: 2.2,
      label: () => 'Search under the bench',
      enabled: () => !!quests()?.isActive('rl-ladys-locket') && hooks.count('ladysLocket') === 0,
      action: () => {
        hooks.give('ladysLocket', 1);
        hooks.toast('Wedged in a crack under the bench, where it slid when the clasp gave: a gold locket with a blue stone.');
        hooks.save();
      },
    });
  }

  // ---- Fort Rennick (a ruined border fort on the Queen's Road) ------------------------------------------
  const fortF = frame('fort');
  const fortC = fortF.at();
  const bolts = new Bolts(scene);
  let garrison: Bandit[] = [];
  {
    const H = 12;
    const face = fortF.toRoad;
    const c = Math.cos(face), s = Math.sin(face);
    const L = (u: number, w: number) => new THREE.Vector3(fortC.x + w * c + u * s, 0, fortC.z - w * s + u * c); // u toward the road, w across
    const wall = (u0: number, w0: number, u1: number, w1: number, gaps: [number, number][]) => {
      const len = Math.hypot(u1 - u0, w1 - w0);
      const n = Math.round(len / 2);
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        if (gaps.some(([a, b]) => t > a && t < b)) continue;
        const p = L(u0 + (u1 - u0) * t, w0 + (w1 - w0) * t);
        const y = heightAt(p.x, p.z);
        const h = 1.6 + Math.abs(Math.sin(k * 1.7 + u0)) * 3.2;
        const yaw = Math.atan2(L(u1, w1).x - L(u0, w0).x, L(u1, w1).z - L(u0, w0).z);
        kit.add(new THREE.BoxGeometry(1.3, h, len / n + 0.05), m.stone, p.x, y + h / 2 - 0.2, p.z, yaw, 1.2);
        kit.solid(1.3, h, len / n, p.x, y + h / 2 - 0.2, p.z, yaw);
      }
    };
    wall(H, -H, H, H, [[0.38, 0.62]]); // the gate, toward the road
    wall(-H, -H, -H, H, [[0.15, 0.3]]); // a breach behind
    wall(-H, H, H, H, []);
    wall(-H, -H, H, -H, [[0.55, 0.75]]);
    // The gatehouse's two stumps and a fallen lintel.
    for (const w of [-2.6, 2.6]) {
      const p = L(H, w);
      kit.add(new THREE.BoxGeometry(1.8, 5.2, 1.8), m.stone, p.x, heightAt(p.x, p.z) + 2.4, p.z, face);
      kit.solid(1.8, 5.2, 1.8, p.x, heightAt(p.x, p.z) + 2.4, p.z, face);
    }
    { const p = L(H + 2.4, 0.6); kit.add(new THREE.BoxGeometry(5.6, 0.7, 0.9), m.stone, p.x, heightAt(p.x, p.z) + 0.4, p.z, face + 0.25); }
    // The corner tower's broken drum.
    const tw = L(-H, H);
    kit.add(new THREE.CylinderGeometry(3, 3.3, 6.5, 14, 1, true), m.stone, tw.x, heightAt(tw.x, tw.z) + 3, tw.z, 0, 1.2);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const h = 0.6 + rnd() * 1.8;
      kit.add(new THREE.BoxGeometry(1.2, h, 0.8), m.stone, tw.x + Math.cos(a) * 3.1, heightAt(tw.x, tw.z) + 6.2 + h / 2, tw.z + Math.sin(a) * 3.1, -a);
    }
    physics.addCylinder(new THREE.Vector3(tw.x, heightAt(tw.x, tw.z) + 3, tw.z), 3.2, 3.2);
    for (let k = 0; k < 18; k++) kit.rock(fortC.x + (rnd() - 0.5) * 34, fortC.z + (rnd() - 0.5) * 34, 0.3 + rnd() * 0.7);
    const wl = L(-3, -5);
    kit.add(new THREE.CylinderGeometry(1, 1.1, 0.8, 12, 1, true), m.stone, wl.x, heightAt(wl.x, wl.z) + 0.4, wl.z);
    physics.addCylinder(new THREE.Vector3(wl.x, heightAt(wl.x, wl.z) + 0.4, wl.z), 0.4, 1.1);
    // The robbers' leavings: a tarp, a fire pit, crates of loot.
    const camp = L(-4, 4);
    kit.campfire(camp.x, camp.z, 0.9, () => !!quests()?.isActive('rl-silk-steel') && !garrisonDead());
    kit.tent(camp.x - 4, camp.z + 2, face, kit.cloth(0x6a2a2a));
    for (let k = 0; k < 6; k++) kit.crate(camp.x + (rnd() - 0.5) * 8, camp.z + (rnd() - 0.5) * 8);
    const plaque = L(H + 1.2, -4.2);
    interactables.push({
      pos: v(plaque.x, plaque.z), radius: 2.4,
      label: () => 'Read the weathered plaque',
      enabled: () => true,
      action: () => hooks.toast('FORT RENNICK · RAISED BY THE COMMAND OF QUEEN AVELINE THE FIRST · SO THAT THE SOUTH ROAD BE KEPT. The rest has been chiselled away, and someone has daubed a red hand over it.'),
    });
    const chest = L(-6, -6);
    kit.put(new THREE.BoxGeometry(1.1, 0.7, 0.7), kit.col(0x5a3a22), chest.x, 0.35, chest.z, face);
    kit.put(new THREE.BoxGeometry(1.15, 0.12, 0.75), kit.col(0x3a3a3c, 0.5), chest.x, 0.72, chest.z, face);
    interactables.push({
      pos: v(chest.x, chest.z), radius: 2.2,
      label: () => (garrisonDead() ? 'Open the robbers’ chest' : 'The robbers’ chest (clear the fort first)'),
      enabled: () => !!quests()?.isActive('rl-silk-steel') && hooks.count('valorianSilk') === 0,
      action: () => {
        if (!garrisonDead()) return hooks.toast('Not with the Red Hand still breathing down your neck.');
        hooks.give('valorianSilk', 1);
        hooks.gold(30);
        hooks.toast('Under a heap of stolen boots and a crate of somebody’s wine: Garrick’s silks, plum and gold, wrapped in oilcloth. And thirty pennies of toll money the Red Hand “collected”.');
        hooks.save();
      },
    });
    kit.clearings.push([fortC.x, fortC.z, 22]);
  }
  function garrisonDead() {
    return !garrison.some((b) => !b.dead && b.alive) && !!flags()['rl:fortSpawned'];
  }

  // ---- The Queen's Camp ---------------------------------------------------------------------------------
  {
    const f = frame('queensCamp');
    const c = f.at();
    kit.campfire(c.x, c.z);
    const seats = kit.benches(c.x, c.z, 8, 2.8);
    const t = f.at(-6, -6);
    kit.tent(t.x, t.z, yawTo(t, c), kit.cloth(0x2f5f9a));
    const ct = f.at(7, -5);
    kit.put(new THREE.BoxGeometry(1.5, 0.4, 2.4), m.planks, ct.x, 0.8, ct.z, f.along);
    for (const s of [-1, 1]) kit.put(new THREE.CylinderGeometry(0.55, 0.55, 0.1, 12).rotateZ(Math.PI / 2), m.planks, ct.x + Math.cos(f.along) * s * 0.85, 0.55, ct.z - Math.sin(f.along) * s * 0.85, f.along);
    kit.lantern(f.at(-3, 4).x, f.at(-3, 4).z, 2.6);
    kit.clearings.push([c.x, c.z, 14]);
    rest.queensCamp = { seats, look: c.clone() };
  }

  // ---- Saint Aveline's shrine and well ---------------------------------------------------------------------
  {
    const f = frame('aveline');
    const c = f.at();
    const face = f.toRoad;
    kit.add(new THREE.BoxGeometry(2.4, 0.5, 2.4), m.stone, c.x, c.y + 0.25, c.z, face);
    kit.add(new THREE.ConeGeometry(0.55, 1.7, 10), kit.col(0xe8e4dc, 0.7), c.x, c.y + 1.35, c.z);
    kit.add(new THREE.SphereGeometry(0.22, 10, 8), kit.col(0xe8e4dc, 0.7), c.x, c.y + 2.35, c.z);
    kit.add(new THREE.ConeGeometry(0.28, 0.5, 10), kit.col(0x5a7aa8, 0.8), c.x, c.y + 2.45, c.z);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.03, 6, 20), new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffc060, emissiveIntensity: 0.6, metalness: 0.5 }));
    halo.position.set(c.x - Math.sin(face) * 0.1, c.y + 2.45, c.z - Math.cos(face) * 0.1);
    halo.rotation.y = face;
    scene.add(halo);
    dynamic.push(halo);
    kit.glows.push({ mat: halo.material as THREE.MeshStandardMaterial, base: 0.6, lit: () => true });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffb050, emissiveIntensity: 0.4 });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.16), lampMat);
    lamp.position.set(c.x + Math.sin(face) * 0.45 + Math.cos(face) * 0.3, c.y + 1.6, c.z + Math.cos(face) * 0.45 - Math.sin(face) * 0.3);
    scene.add(lamp);
    dynamic.push(lamp);
    kit.glows.push({ mat: lampMat, base: 0.4, lit: () => true });
    kit.solid(1, 2.8, 1, c.x, c.y + 1.4, c.z);
    const altar = new THREE.Vector3(c.x + Math.sin(face) * 1.7, c.y, c.z + Math.cos(face) * 1.7);
    kit.add(new THREE.BoxGeometry(1.2, 0.8, 0.6), m.stone, altar.x, altar.y + 0.4, altar.z, face);
    kit.add(new THREE.CylinderGeometry(0.22, 0.14, 0.12, 12), kit.col(0x8a8a88, 0.4), altar.x, altar.y + 0.86, altar.z);
    for (let k = 0; k < 6; k++) {
      const a = face + (k - 2.5) * 0.4;
      kit.add(new THREE.SphereGeometry(0.18, 6, 5), kit.col([0xf2f0ea, 0xe8c040, 0x8a6ad8, 0xf2a7c0][k % 4]), c.x + Math.sin(a) * 1.4, c.y + 0.55, c.z + Math.cos(a) * 1.4);
    }
    const wl = f.at(7, 2);
    const drinkAt = kit.well(wl.x, wl.z);
    interactables.push({ pos: drinkAt, radius: 2.2, label: () => 'Drink from Saint Aveline’s well', enabled: () => true, action: drink });
    kit.clearings.push([c.x, c.z, 12]);
    rest.aveline = { seats: [f.at(-2, 3), f.at(2, 3.4), f.at(-3, 4.5), f.at(3, 5)], look: c.clone() };
    interactables.push({
      pos: new THREE.Vector3(altar.x + Math.sin(face) * 0.9, altar.y, altar.z + Math.cos(face) * 0.9), radius: 2.2,
      label: () => 'Leave an offering for Saint Aveline (1g)',
      enabled: () => true,
      action: () => {
        if (hooks.goldNow() < 1) return hooks.toast('Your purse is empty. The saint, they say, understands.');
        hooks.gold(-1);
        if (player) {
          player.hp = player.maxHp;
          player.stamina = player.maxStamina;
        }
        const n = Number(flags()['rl:aveline'] ?? 0) + 1;
        flags()['rl:aveline'] = n;
        if (n === 5) {
          hooks.give('pilgrimsBadge', 1);
          hooks.toast('A coin rings in the bowl for the fifth time, and a pilgrim resting by the well presses a pewter badge into your hand: “You’re one of us now.”');
        } else hooks.toast('The coin rings in the bowl. Saint Aveline, keeper of travellers, smiles her worn stone smile, and your aches ease.');
        hooks.save();
      },
    });
  }

  // ---- The Copper Kettle (a caravan camp on the Caravan Way) ------------------------------------------------
  {
    const f = frame('kettle');
    const c = f.at();
    kit.campfire(c.x, c.z, 1.2);
    const seats = kit.benches(c.x, c.z, 8, 3);
    // The kettle itself, huge and green with age, over its own fire.
    const kt = f.at(-7, 1);
    kit.campfire(kt.x, kt.z, 0.8);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      kit.put(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 5).rotateX(0.35).rotateY(-a), m.timber, kt.x + Math.cos(a) * 0.5, 1.1, kt.z + Math.sin(a) * 0.5);
    }
    kit.put(new THREE.SphereGeometry(0.55, 14, 10).scale(1, 0.85, 1), new THREE.MeshStandardMaterial({ color: 0x7a9a6a, metalness: 0.6, roughness: 0.45 }) as THREE.Material, kt.x, 1.0, kt.z);
    kit.smokeAt(kt.x, kt.y + 1.8, kt.z);
    for (const [ds, dl, hood] of [[6, 8, 0xc8b896], [-3, 10, 0xb8402e]] as [number, number, number][]) {
      const w = f.at(ds, dl);
      kit.put(new THREE.BoxGeometry(1.7, 0.5, 3.2), m.planks, w.x, 1.05, w.z, f.along + 0.3);
      kit.put(new THREE.CylinderGeometry(0.95, 0.95, 3, 14, 1, true, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2), kit.cloth(hood), w.x, 1.3, w.z, f.along + 0.3);
      kit.solid(1.8, 2.3, 3.3, w.x, w.y + 1.1, w.z, f.along + 0.3);
    }
    const aw = f.at(8, -2);
    for (const [u, w] of [[-1.5, -1.2], [1.5, -1.2], [-1.5, 1.2], [1.5, 1.2]]) kit.put(new THREE.BoxGeometry(0.1, 2.4, 0.1), m.timber, aw.x + u * f.dx + w * -f.dz, 1.2, aw.z + u * f.dz + w * f.dx);
    kit.put(new THREE.BoxGeometry(3.4, 0.05, 2.8), kit.cloth(0xc9922a), aw.x, 2.45, aw.z, f.along);
    for (let k = 0; k < 8; k++) kit.crate(aw.x + (rnd() - 0.5) * 4, aw.z + (rnd() - 0.5) * 4);
    const pen = f.at(-4, 16);
    herds.push({ species: 'donkey', count: 2, range: { center: new THREE.Vector3(pen.x, 0, pen.z), radius: 5 } });
    kit.sign(['THE COPPER KETTLE', 'Caravans welcome · Water · Fire'], f.at(-12, -8).x, f.at(-12, -8).z, f.toRoad, 1.8);
    kit.clearings.push([c.x, c.z, 20]);
    rest.kettle = { seats, look: c.clone() };
  }

  // Standing room at the posts and inns (the travellers' system uses these too).
  kit.build();

  // ---- per frame ----------------------------------------------------------------------------------------
  let wadeT = 0;
  return {
    settlements, clearings: kit.clearings, interactables, herds, services, rest, ring,
    isMarketDay,
    tollTraffic(x, z) {
      if (Math.hypot(x - toll.at().x, z - toll.at().z) < 16) trafficT = 3;
    },
    spawnGarrison() {
      if (garrison.some((b) => !b.dead)) return;
      flags()['rl:fortSpawned'] = true;
      const face = fortF.toRoad;
      const c = Math.cos(face), s = Math.sin(face);
      const spots: [number, number, 'sword' | 'crossbow' | 'chief'][] = [[6, -4, 'sword'], [4, 5, 'sword'], [-3, 7, 'sword'], [-8, -2, 'crossbow'], [9, 8, 'crossbow'], [-5, -6, 'chief']];
      const looks: Look[] = [
        { body: 'male', outfit: 'ranger', hood: true, hair: 'buzzed', beard: true, hairColor: 0x2a1a10, skin: 0xe0b894, cloth: 0x7a2a22, height: 1.8 },
        { body: 'female', outfit: 'ranger', hood: true, hair: 'long', hairColor: 0x3a2618, skin: 0xa8744e, cloth: 0x6a2a2a, height: 1.7 },
        { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, hairColor: 0x6a5a48, skin: 0xfff0e6, cloth: 0x5a3a2a, pauldron: true, height: 1.84 },
      ];
      spots.forEach(([u, w, role], i) => {
        const x = fortC.x + w * c + u * s, z = fortC.z - w * s + u * c;
        const b = new Bandit(role, v(x, z).setY(heightAt(x, z) + 0.3), scene, bolts, undefined, role === 'chief' ? { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, hairColor: 0xb8402e, skin: 0xe0b894, cloth: 0x7a1a1a, pauldron: true, bracers: true, height: 1.9 } : looks[i % looks.length]);
        b.name = role === 'chief' ? 'Hask, Quartermaster of the Red Hand' : role === 'crossbow' ? 'Red Hand Crossbowman' : 'Red Hand Cutthroat';
        garrison.push(b);
      });
    },
    garrison: () => garrison,
    step(dt, p) {
      player = p;
      if (garrison.length) {
        const near = Math.hypot(p.pos.x - fortC.x, p.pos.z - fortC.z) < 260;
        if (near) for (const b of garrison) b.update(dt, p);
        bolts.update(dt, p);
        garrison = garrison.filter((b) => !b.dead);
      }
    },
    frame(dt, p, nightAmt) {
      player = p;
      kit.update(dt, p.pos, nightAmt);
      marketGroup.visible = isMarketDay();
      // The toll pole: up for paying travellers, for whoever paid today, and for the road's friends.
      trafficT = Math.max(0, trafficT - dt);
      const paid = Number(flags()['rl:tollDay'] ?? -1) === hooks.day();
      poleWant = trafficT > 0 || paid || hooks.hour() >= 21 || hooks.hour() < 6 ? 1 : 0;
      poleUp += Math.sign(poleWant - poleUp) * Math.min(Math.abs(poleWant - poleUp), dt * 0.9);
      pole.rotation.z = poleUp * 1.35;
      const nearToll = Math.hypot(p.pos.x - toll.at().x, p.pos.z - toll.at().z) < 20;
      if (poleUp < 0.05 && !poleCollider && !(nearToll && Math.hypot(p.pos.x - toll.at(-4.4).x, p.pos.z - toll.at(-4.4).z) < 2)) {
        const at = toll.at(-4.4, 0);
        poleCollider = kit.solid(5.6, 2.2, 0.3, at.x, at.y + 1.1, at.z, toll.along + Math.PI / 2);
      } else if (poleUp > 0.05 && poleCollider) {
        physics.removeStatic(poleCollider);
        poleCollider = null;
      }
      // Wading Miller's Ford (or the brook anywhere off the bridge).
      wadeT = Math.max(0, wadeT - dt);
      if (nearToll || Math.hypot(p.pos.x - toll.at().x, p.pos.z - toll.at().z) < 60) {
        const inWater = stream.some((q) => Math.hypot(p.pos.x - q.x, p.pos.z - q.z) < 1.9);
        const onBridge = Math.hypot(p.pos.x - toll.at().x, p.pos.z - toll.at().z) < 3.4;
        if (inWater && !onBridge && wadeT <= 0 && !p.mounted) {
          wadeT = 90;
          hooks.toast('You splash through the brook. Cold enough to make you gasp, and free.');
        }
      }
      // Tobin's horse grazes at its picket while you're near.
      const dh = Math.hypot(p.pos.x - horseAt.x, p.pos.z - horseAt.z);
      if (dh < 120 && !tobinHorse) {
        tobinHorse = new Animal(scene, 'horse', { coat: 'dun', saddle: 0x3d7a45 });
        tobinHorse.pos.copy(horseAt);
        tobinHorse.yaw = tob.along;
      } else if (dh > 160 && tobinHorse) {
        tobinHorse.dispose();
        tobinHorse = null;
      }
      if (tobinHorse) {
        tobinHorse.play(Math.floor(performance.now() / 8000) % 3 === 0 ? 'Idle' : 'Eating');
        tobinHorse.update(dt);
      }
      // The wardlights burn at night once relit.
      const h = hooks.hour();
      const dark = h >= 19.5 || h < 5.5;
      wardMats.forEach((mat, i) => (mat.emissiveIntensity = flags()['rl:ward:' + i] && dark ? 2.6 + Math.sin(performance.now() / 160 + i) * 0.3 : 0));
      // A glint in the ford while Mags's strongbox waits there.
      if (quests()?.isActive('rl-drowned-strongbox') && hooks.count('tollStrongbox') === 0 && Math.random() < dt * 1.5) {
        fx.add.spawn({ pos: v(RL_SITES.strongbox[0], RL_SITES.strongbox[1]).add(new THREE.Vector3(0, 0.25, 0)), spread: 0.3, count: 2, life: [0.3, 0.6], size: [0.14, 0.02], color: 0xfff4c0, color2: 0xffffff, upBias: 0.6 });
      }
    },
    setVisible(vis: boolean) {
      for (const o of dynamic) o.visible = vis && (o !== marketGroup || isMarketDay());
      if (tobinHorse) tobinHorse.root.visible = vis;
    },
    clear() {
      for (const b of garrison) b.dispose();
      garrison = [];
      bolts.clear();
    },
  };
}

/** Trample the grass flat in a ring (the sparring ring, the prospect). */
function GRASS_TRAMPLE(x: number, z: number, r: number) {
  GRASS_MASKS.push({ x, z, r, amount: 0.6 });
}
