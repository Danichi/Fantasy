import * as THREE from 'three';
import { heightAt } from '../terrainHeight';
import { roadPoint } from '../roadData';
import { physics } from '../../physics/physics';
import { REAGENTS, propLine } from '../../items/reagents';
import { ITEMS } from '../../items/itemDefs';
import type { NpcRecord, Place, Settlement } from '../../npc/npcManager';
import { FORAGE, RARE_SPOTS, type HerbId } from './flora';

// Herbalist folk: Wenna Thistledown, a wandering herbalist camped by the
// Crown Road short of the Crown checkpoint. She sells the herbalist's tools,
// a few dried herbs, buys whatever you gather, and — a different one each
// day — tells you where the rare plants grow.

/** What a herbalist pays per reagent, by tier. */
const TIER_PRICE = { 1: 4, 2: 9, 3: 20, 4: 38, 5: 80 } as const;
/** Every reagent at herbalist prices (a shop's `wants`; apothecaries can use it too). */
export const REAGENT_WANTS: [string, number][] = Object.entries(REAGENTS).map(([id, r]) => [id, TIER_PRICE[r.tier]]);

/** Wenna's stock: the tools and dried common herbs. */
export const WENNA_STOCK: [string, number][] = [
  ['herbSickle', 60], ['thornGloves', 45], ['herbAlmanac', 140],
  ['chamomile', 7], ['yarrow', 6], ['marigold', 6], ['nettle', 6], ['oakmoss', 9], ['marshmallow', 8],
  ['foxglove', 20], ['glowmoss', 22], ['stoneroot', 22], ['wolfsbane', 48],
];
/** Tools and a few reagents for the apothecaries in town (Elder Glen, Port Aurelle, the capital). */
export const APOTHECARY_HERB_STOCK: [string, number][] = [
  ['herbSickle', 70], ['thornGloves', 50], ['chamomile', 8], ['yarrow', 7], ['marigold', 7], ['glowmoss', 24], ['bogbean', 22],
];

export interface HerbFolkHooks {
  /** open a merchant window: who, title, intro, stock, what they pay */
  shop: (who: string, title: string, intro: string, stock: [string, number][], wants: [string, number][]) => void;
  /** today's day number (the rare-plant hint changes daily) */
  day: () => number;
  /** carries an item? */
  has: (id: string) => boolean;
  /** how many of each reagent the player has gathered (to praise them a little) */
  gathered?: (id: string) => number;
}

type Show = (t: string, opts: { label: string; run: () => void }[]) => void;

export interface HerbFolk {
  settlement: Settlement;
  records: NpcRecord[];
  /** folk services by NPC id (main's folkServices) */
  services: [string, (show: Show, back: () => void) => { label: string; run: () => void }[]][];
  /** builds the camp when the player first comes near; call every frame or so */
  update(player: THREE.Vector3): void;
  setVisible(v: boolean): void;
}

const S_CAMP = 420, LAT_CAMP = -20;

export function buildHerbFolk(scene: THREE.Scene, hooks: HerbFolkHooks): HerbFolk {
  const at = (s: number, lat: number) => {
    const [x, z] = roadPoint('capital', s, lat);
    return new THREE.Vector3(x, heightAt(x, z), z);
  };
  const camp = at(S_CAMP, LAT_CAMP);
  const patch = at(S_CAMP + 9, LAT_CAMP - 6);
  const fire = at(S_CAMP - 3, LAT_CAMP + 4);
  const places = new Map<string, Place>();
  places.set('home', { id: 'home', spots: [camp.clone()], indoors: true });
  places.set('patch', { id: 'patch', spots: [patch.clone(), at(S_CAMP + 13, LAT_CAMP - 3)] });
  places.set('fire', { id: 'fire', spots: [at(S_CAMP - 1, LAT_CAMP + 6)], yaw: 0 });
  const records: NpcRecord[] = [{
    id: 'wenna', name: 'Wenna Thistledown', title: 'Wandering Herbalist', job: 'herbalist', settlement: 'herbCamp', named: true,
    look: { body: 'female', outfit: 'ranger', hood: true, hair: 'long', hairColor: 0xc8c0b0, skin: 0xe0b894, cloth: 0x5a7a3a, linen: 0xd8ccb0, height: 1.6 },
    schedule: [
      { from: 0, activity: 'sleep', place: 'home' },
      { from: 5.5, activity: 'farm', place: 'patch' },
      { from: 11, activity: 'idle', place: 'fire' },
      { from: 13, activity: 'farm', place: 'patch' },
      { from: 18, activity: 'idle', place: 'fire' },
      // Moon-flowers are picked at night: she is out again till midnight.
      { from: 21, activity: 'farm', place: 'patch' },
    ],
    lines: {
      morning: ['Dew still on the yarrow. Best time to cut it — the oils are strongest.', 'You walk like someone who tramples chamomile. Mind your feet, love.'],
      any: ['Nettles, foxglove, wolfsbane — the useful ones always bite. Wear gloves.', 'Every plant has its properties. Gather a thing often enough and you learn what it does.'],
      evening: ['When the sun goes, the ghostcaps come up in the woods. Pale as milk, and they glow.', 'Moonpetal only opens for the moon. Wilts by dawn. Most folk never see one.'],
      night: ['Shh. Listen. You can hear the duskbloom opening.', 'Out gathering by night? Then you know the best of it.'],
    },
  }];
  const settlement: Settlement = { id: 'herbCamp', center: camp.clone(), radius: 40, places, nodes: [], edges: [] };

  // ---- the camp (built when the player first comes near) ----
  const group = new THREE.Group();
  let built = false;
  const build = () => {
    built = true;
    const std = (c: number, r = 0.85, e: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, ...e });
    const wood = std(0x6a4a2e), canvas = std(0x9a8a62, 0.95);
    const y = heightAt(camp.x, camp.z);
    const [ax, az] = roadPoint('capital', S_CAMP + 1, LAT_CAMP);
    const yaw = Math.atan2(ax - camp.x, az - camp.z) + Math.PI / 2;
    const tent = new THREE.Group();
    tent.position.set(camp.x, y, camp.z);
    tent.rotation.y = yaw;
    // A canvas lean-to on two poles.
    for (const x of [-1.4, 1.4]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.1, 6), wood);
      pole.position.set(x, 1.05, 0.9);
      tent.add(pole);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.04, 2.3), canvas);
    roof.position.set(0, 1.05, 0);
    roof.rotation.x = -0.72;
    tent.add(roof);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.14, 0.8), std(0x7a5a3a, 1));
    bed.position.set(0, 0.07, -0.3);
    tent.add(bed);
    // A drying rack hung with bundles of herbs.
    const rack = new THREE.Group();
    rack.position.set(2.6, 0, 0.6);
    for (const x of [-0.9, 0.9]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 1.6, 5), wood);
      leg.position.set(x, 0.8, 0);
      rack.add(leg);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.9, 5).rotateZ(Math.PI / 2), wood);
    bar.position.y = 1.55;
    rack.add(bar);
    const bundles = [0xd7ce4a, 0x5fbf6a, 0xf5a020, 0xb04aa8, 0xf6f2e6, 0x2f6a28, 0xb8d8f0];
    bundles.forEach((c, k) => {
      const b = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.38, 6), std(c, 0.9));
      b.position.set(-0.75 + k * 0.25, 1.33, 0);
      rack.add(b);
      const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 6), std(0x8a6a3a));
      tie.position.set(-0.75 + k * 0.25, 1.52, 0);
      rack.add(tie);
    });
    tent.add(rack);
    // Baskets of the day's gathering.
    for (const [x, z, c] of [[-2.2, 0.9, 0xf5a020], [-2.0, 1.6, 0x5a9a3a]] as const) {
      const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.3, 10, 1, true), std(0xa07a42, 0.95, { side: THREE.DoubleSide }));
      basket.position.set(x, 0.15, z);
      tent.add(basket);
      const fill = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.5, 1), std(c, 0.9));
      fill.position.set(x, 0.25, z);
      tent.add(fill);
    }
    group.add(tent);
    // A little fire ring with a pot on it.
    const fy = heightAt(fire.x, fire.z);
    for (let k = 0; k < 8; k++) {
      const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13, 0), std(0x7a7470, 0.95, { flatShading: true }));
      st.position.set(fire.x + Math.cos(k * 0.785) * 0.55, fy + 0.06, fire.z + Math.sin(k * 0.785) * 0.55);
      group.add(st);
    }
    const embers = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.12, 8), std(0x3a2a20, 0.9, { emissive: 0xff5a10, emissiveIntensity: 0.9 }));
    embers.position.set(fire.x, fy + 0.06, fire.z);
    group.add(embers);
    const pot = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8, 0, Math.PI * 2, Math.PI * 0.25, Math.PI * 0.75), std(0x2a2a2a, 0.5, { metalness: 0.6, side: THREE.DoubleSide }));
    pot.position.set(fire.x, fy + 0.5, fire.z);
    group.add(pot);
    const brew = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12).rotateX(-Math.PI / 2), std(0x5a8a3a, 0.3, { emissive: 0x2a5a10, emissiveIntensity: 0.6 }));
    brew.position.set(fire.x, fy + 0.68, fire.z);
    group.add(brew);
    group.traverse((o) => ((o as THREE.Mesh).isMesh && (((o as THREE.Mesh).castShadow = true), ((o as THREE.Mesh).receiveShadow = true))));
    scene.add(group);
    physics.addBox(new THREE.Vector3(camp.x, y + 0.9, camp.z), new THREE.Vector3(1.5, 0.9, 0.9), new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw));
  };

  // ---- what she knows ----
  const RARE_HINTS = RARE_SPOTS.filter((s, i, all) => (REAGENTS[FORAGE[s.herb].item]?.tier ?? 1) >= 3 && all.findIndex((o) => o.herb === s.herb && o.place === s.place) === i);
  const hintText = (s: (typeof RARE_SPOTS)[number]) => {
    const id = FORAGE[s.herb].item;
    const name = ITEMS[id]?.name ?? id;
    const night = FORAGE[s.herb].night ? ' Only after dark, mind — it hides by day.' : '';
    const props = hooks.has('herbAlmanac') ? ` (${propLine(id)})` : '';
    return `${name}${props}: try ${s.place}.${night}`;
  };
  const lore = (show: Show, back: () => void) => {
    const d = hooks.day();
    const a = RARE_HINTS[d % RARE_HINTS.length], b = RARE_HINTS[(d * 7 + 3) % RARE_HINTS.length];
    show(`Rare things, is it? Here's what the wind told me this week.\n\n${hintText(a)}\n${a === b ? '' : hintText(b)}\n\nThe rarest ones don't show themselves to just anyone. The better you get, the more of them you'll see.`, [{ label: 'Back.', run: back }]);
  };
  const advice = (show: Show, back: () => void) => {
    const tips: string[] = [];
    if (!hooks.has('thornGloves')) tips.push('Get yourself gloves before you go grabbing nettles or wolfsbane. They sting, and wolfsbane does worse.');
    if (!hooks.has('herbSickle')) tips.push('A proper sickle cuts clean — more stems from each plant, and it grows back sooner.');
    if (!hooks.has('herbAlmanac')) tips.push('Every plant you pick teaches you a little of what it\'s good for. Or buy my almanac and know it all at once.');
    const known = (['foxglove', 'ghostcap', 'bloodcap', 'moonpetal'] as HerbId[]).filter((h) => (hooks.gathered?.(h) ?? 0) > 0);
    if (known.length) tips.push(`You've been picking ${ITEMS[known[0]]?.name ?? known[0]}, I see. Good eye.`);
    tips.push('Meadows give marigold and chamomile; wood edges give nettle; the deep woods give bloodcap and, at night, ghostcap. River banks: marsh mallow and glowmoss. The coast: kelp and saltwort. The heights: stoneroot, eagle fern, and frostbloom up in the snow.');
    show(tips.join('\n\n'), [{ label: 'Back.', run: back }]);
  };
  const services: HerbFolk['services'] = [[
    'wenna',
    (show, back) => [
      { label: 'Browse herbs and tools', run: () => hooks.shop('Wenna Thistledown', 'Wandering Herbalist', 'Sickles, gloves, and the good dried stuff. And I pay fair for anything you pick, rare things best of all.', WENNA_STOCK, REAGENT_WANTS) },
      { label: 'Where do the rare herbs grow?', run: () => lore(show, back) },
      { label: 'Any advice for a forager?', run: () => advice(show, back) },
    ],
  ]];

  return {
    settlement, records, services,
    update(player: THREE.Vector3) {
      if (built) return;
      if (Math.abs(player.x - camp.x) < 260 && Math.abs(player.z - camp.z) < 260) build();
    },
    setVisible(v: boolean) {
      group.visible = v;
    },
  };
}
