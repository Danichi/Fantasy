import * as THREE from 'three';
import { TideWarden } from '../../enemies/tideWarden';
import type { KitDungeonDef } from '../kit/build';
import type { BossDef, BossFight } from '../kit/boss';
import { baseTable } from '../kit/loot';
import { SHRINE_PLANS } from './plans';

// ---------------------------------------------------------------------------
// The Drowned Shrine (docs/design/dungeons.md §5): a flooded temple of the
// wheel-cutters under Sunken Spire's island, its stair going down beside the
// harbour. B1F, the flooded nave: a beam of daylight and two mirrors open the
// tide gate's seal. B2F, the Warden's basin: the sluice hall, an old lever,
// and the Tide-Warden in a basin with four raised daises.
//
// The water rises in the fight: at 60% the sluices open and it comes up to
// the knee (you wade, except up on the daises), and the Warden starts sending
// waves; at 25% it is waist-deep and the Warden turns its jet on you.
// ---------------------------------------------------------------------------

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const WATER = [0.12, 0.5, 0.85];

const TIDE_WARDEN: BossDef = {
  name: 'The Tide-Warden',
  subtitle: 'Guardian of the wheel-cutters\' basin',
  kind: 'tideWarden',
  phases: [0.6, 0.25],
  async create(at, yaw, f) {
    const w = new TideWarden(at, yaw, f.c.scene, f.c.fx);
    w.onHigh = (p) => (f.s.daises as THREE.Box3[]).some((b) => p.x > b.min.x && p.x < b.max.x && p.z > b.min.z && p.z < b.max.z && p.y > f.c.inst.origin.y + 0.4);
    return w;
  },
  arena(f) {
    const c = f.c, r = f.room, m = c.theme.m, O = c.inst.origin;
    const ctr = c.centre(r);
    // Four daises (two steps up), standing clear of the rising water.
    const daises: THREE.Box3[] = [];
    for (const [dx, dz] of [[-9, -4], [9, -4], [-9, 4], [9, 4]]) {
      const p = ctr.clone().add(V(dx, 0, dz));
      c.mesh(r, new THREE.BoxGeometry(4.2, 0.35, 4.2), m.trim, p.x, O.y + 0.175, p.z);
      c.mesh(r, new THREE.BoxGeometry(3.2, 0.7, 3.2), m.pillar, p.x, O.y + 0.35, p.z);
      c.solid(p.clone().setY(O.y + 0.175), V(2.1, 0.175, 2.1));
      c.solid(p.clone().setY(O.y + 0.35), V(1.6, 0.35, 1.6));
      c.flame(r, p.clone().setY(O.y + 1.4), 'cold', 0.8);
      daises.push(new THREE.Box3(p.clone().add(V(-1.6, -1, -1.6)), p.clone().add(V(1.6, 2, 1.6))));
    }
    f.s.daises = daises;
    // Sluice gates in the walls that open to let the sea in.
    const g = c.group(r);
    const sluices: THREE.Mesh[] = [];
    for (const fc of c.faces(r).filter((q) => q.dir === 'n' || q.dir === 'w' || q.dir === 'e').filter((_, k) => k % 3 === 1)) {
      const p = fc.pos.clone().addScaledVector(fc.inward, 0.1);
      const gate = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.6, 0.12), m.iron);
      gate.position.copy(p).setY(O.y + 0.8);
      gate.rotation.y = Math.atan2(fc.inward.x, fc.inward.z);
      g.add(gate);
      sluices.push(gate);
    }
    f.s.sluices = sluices;
    // The water over the basin floor (it rises in the fight).
    const s = c.size(r);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.d), c.theme.m.water);
    water.rotation.x = -Math.PI / 2;
    water.position.copy(ctr).setY(O.y + WATER[0]);
    g.add(water);
    f.s.water = water;
    f.s.level = WATER[0];
    f.s.target = WATER[0];
    f.s.rect = new THREE.Box2(new THREE.Vector2(ctr.x - s.w / 2, ctr.z - s.d / 2), new THREE.Vector2(ctr.x + s.w / 2, ctr.z + s.d / 2));
  },
  onIntro(f) {
    f.c.hooks.banner('THE TIDE-WARDEN');
  },
  onPhase(f, phase) {
    const w = f.target as TideWarden;
    w.phase = phase;
    f.s.target = WATER[phase];
    if (phase === 2) w.speedMul = 1.25;
    for (const s of f.s.sluices as THREE.Mesh[]) s.userData.open = true;
    f.c.toast(phase === 1 ? 'The sluices grind open. The sea pours into the basin!' : 'The water surges higher. The Warden\'s core blazes.');
  },
  update(f, dt) {
    const O = f.c.inst.origin;
    const want = f.s.target as number;
    f.s.level += Math.sign(want - f.s.level) * Math.min(Math.abs(want - f.s.level), dt * 0.12);
    const water = f.s.water as THREE.Mesh;
    water.position.y = O.y + f.s.level + Math.sin(performance.now() * 0.001) * 0.02;
    for (const s of f.s.sluices as THREE.Mesh[]) {
      if (s.userData.open && s.position.y < O.y + 2.4) s.position.y += dt * 0.8;
      if (s.userData.open && f.s.level < f.s.target && Math.random() < dt * 12) f.c.fx.alpha.spawn({ pos: s.position.clone().setY(O.y + 0.5), spread: 0.8, count: 1, life: [0.5, 1], size: [0.3, 0.6], color: 0xd8fff8, alpha: 0.6, upBias: 0.5 });
    }
  },
  groundAt(f, x, z) {
    // Knee-deep and more: you wade, except up on the daises.
    if ((f.s.level ?? 0) < 0.3) return null;
    const r = f.s.rect as THREE.Box2;
    if (x < r.min.x || x > r.max.x || z < r.min.y || z > r.max.y) return null;
    if ((f.s.daises as THREE.Box3[]).some((b) => x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z)) return f.c.inst.origin.y + 0.7;
    return f.c.inst.origin.y - 0.9;
  },
  onReset(f) {
    // The sea drains back out through the sluices.
    f.s.target = WATER[0];
    for (const s of f.s.sluices as THREE.Mesh[]) {
      s.userData.open = false;
      s.position.y = f.c.inst.origin.y + 0.8;
    }
  },
  loot(f: BossFight, first, at) {
    const h = f.c.hooks;
    f.s.target = WATER[0];
    if (first) {
      h.giveGold(at, 380);
      const a = h.giveItem('tidewardenHeart');
      return `The Tide-Warden kneels and is still. Found: ${a}`;
    }
    h.giveGold(at, 180);
    return 'The Warden falls again, and the basin drains.';
  },
};

export function drownedShrineDef(): KitDungeonDef {
  return {
    id: 'drownedShrine',
    name: 'The Drowned Shrine',
    theme: 'drowned',
    origin: new THREE.Vector3(46000, 0, 0),
    plans: SHRINE_PLANS,
    traps: ['darts', 'gas', 'blade', 'collapse'],
    mobs: (floor) => (floor === 1 ? ['blue', 'zombie', 'cave'] : ['armour', 'zombie', 'blue']),
    loot: baseTable([[['tideKey', 0]], [], [['tideglassBlade', 1]], [['tideglassBlade', 1]]]),
    boss: { floor: 2, def: TIDE_WARDEN },
    reward: 'tideglassBlade',
    exitLabel: (floor) => (floor === 1 ? 'Climb back up to the island' : 'Climb the stairs up'),
    arrive: (floor) => (floor === 1 ? 'The Drowned Shrine. Sea water stands in the old halls.' : "The Warden's Basin. Something vast is waiting in the dark."),
  };
}
