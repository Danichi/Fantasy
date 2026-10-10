import * as THREE from 'three';
import { OrcWarlord, GRUKK, type BossSpec } from '../../enemies/orc';
import { events } from '../../core/events';
import type { KitDungeonDef } from '../kit/build';
import type { BossDef, BossFight } from '../kit/boss';
import { baseTable } from '../kit/loot';
import { CRYPT_PLANS } from './plans';

// ---------------------------------------------------------------------------
// The Crypt of Elder Glen, rebuilt with the kit (docs/design/dungeons.md §5):
// the same door on the hill, the same key and portcullis, the same Grukk.
// B1F, the Upper Crypt: the Hall of the Old Kings, ossuaries, the scriptorium
// with the carved wheel, the Sunwheel dial that seals the way down.
// B2F, the Lower Crypt: the drowned crypt as the hub, the bells and their
// hymn, the Chapel of the Old Kings where Grukk waits, the old kings' tomb
// beyond, and the kings' stair back down to the hub.
// ---------------------------------------------------------------------------

/** The crypt keeps one layout (old saves' maps and the tests line up with it). */
export const CRYPT_SEED = 1337;

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * Grukk with phases: at 60% he roars and two of his warband break in through
 * the chapel's side niches; at 25% the chapel roof starts to come in (stones
 * fall where a shadow gathers first) and he fights faster and harder.
 */
const GRUKK_BOSS: BossDef = {
  name: 'Grukk, the Orc Warlord',
  subtitle: 'Warlord of the crypt',
  kind: 'grukk',
  phases: [0.6, 0.25],
  async create(at, yaw, f) {
    const spec: BossSpec = { ...GRUKK, kind: 'grukk' };
    const o = await OrcWarlord.create(at, yaw, f.c.scene, f.c.fx, spec);
    f.s.spec = spec;
    return o;
  },
  arena(f) {
    const c = f.c, r = f.room, m = c.theme.m, O = c.inst.origin;
    // The altar at the far end, the side niches the warband comes through.
    const back = f.home.at.clone().add(V(-Math.sin(f.home.yaw) * 5, 0, -Math.cos(f.home.yaw) * 5));
    c.mesh(r, new THREE.BoxGeometry(4, 1.0, 1.6), m.trim, back.x, O.y + 0.5, back.z, f.home.yaw);
    c.mesh(r, new THREE.BoxGeometry(4.4, 0.2, 2.0), m.pillar, back.x, O.y + 1.1, back.z, f.home.yaw);
    c.solid(back.clone().setY(O.y + 0.6), V(2.1, 0.6, 1.0), f.home.yaw);
    for (const s of [-1, 1]) c.flame(r, back.clone().add(V(s * 3, 1.0, 0)), 'brazier', 1.3);
    const side = V(Math.cos(f.home.yaw), 0, -Math.sin(f.home.yaw));
    const niches: THREE.Vector3[] = [];
    for (const s of [-1, 1]) {
      const n = f.home.at.clone().addScaledVector(side, s * (r.rect.w * 2 - 1.6));
      c.mesh(r, new THREE.BoxGeometry(0.1, 2.8, 2.2), m.dark, n.x + side.x * s * 0.6, O.y + 1.4, n.z + side.z * s * 0.6, f.home.yaw);
      niches.push(n);
    }
    f.s.niches = niches;
  },
  onIntro(f) {
    f.c.hooks.banner('GRUKK');
  },
  onPhase(f, phase) {
    const o = f.target as OrcWarlord;
    o.phaseRoar();
    if (phase === 1) {
      // The warband answers his roar.
      for (const n of f.s.niches as THREE.Vector3[]) {
        f.c.fx.dust(n.clone(), 3);
        f.c.spawnNow('orc', n.clone(), f.room.id);
      }
      f.c.toast('Grukk roars, and his warband breaks in through the walls!');
    } else {
      o.phaseSpeed = 1.2;
      (f.s.spec as BossSpec).damage = 1.25;
      f.s.roof = 1.5;
      f.c.toast('The chapel roof groans. Stones begin to fall.');
    }
  },
  update(f, dt, player) {
    if (!f.target?.alive || f.s.roof === undefined || f.phase < 2) return;
    // Falling stones: a shadow gathers where one will land.
    const O = f.c.inst.origin;
    f.s.roof -= dt;
    if (f.s.roof <= 0 && !f.s.shadow) {
      const at = player.pos.clone().add(V((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3)).setY(O.y + 0.03);
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.5, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.0, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.copy(at);
      f.c.inst.group.add(shadow);
      f.s.shadow = { mesh: shadow, t: 0 };
    }
    const sh = f.s.shadow as { mesh: THREE.Mesh; t: number } | undefined;
    if (sh) {
      sh.t += dt;
      (sh.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(0.6, sh.t * 0.5);
      if (sh.t > 1.2) {
        const at = sh.mesh.position.clone();
        f.c.fx.dust(at.clone().setY(O.y + 0.3), 4);
        f.c.fx.add.spawn({ pos: at.clone().setY(O.y + 3), spread: 2, count: 20, life: [0.3, 0.7], size: [0.15, 0.05], color: 0x8a847a, color2: 0x4a463e, gravity: 14 });
        events.emit('bossSlam', { at });
        if (player.pos.distanceTo(at) < 1.7 && !player.dead) player.receiveAttack({ damage: 30, from: at.clone().add(V(0, 3, 0.01)), parryable: false, poise: 80 });
        sh.mesh.removeFromParent();
        f.s.shadow = undefined;
        f.s.roof = 2.2 + Math.random();
      }
    }
  },
  onReset(f) {
    const o = f.target as OrcWarlord | null;
    if (o) o.phaseSpeed = 1;
    if (f.s.spec) (f.s.spec as BossSpec).damage = 1;
    f.s.roof = undefined;
    (f.s.shadow as { mesh: THREE.Mesh } | undefined)?.mesh.removeFromParent();
    f.s.shadow = undefined;
  },
  loot(f: BossFight, first, at) {
    const h = f.c.hooks;
    // His hoard (the tusk and the odachi) is only won once; later a lesser purse.
    if (first) {
      h.giveGold(at, 300);
      const a = h.giveItem('warlordTusk');
      const b = h.giveItem('orcOdachi');
      return `Grukk falls. Found: ${a} and ${b}`;
    }
    h.giveGold(at, 150);
    return 'Grukk falls again. His war-chest has refilled a little.';
  },
};

export function cryptDef(): KitDungeonDef {
  return {
    id: 'crypt',
    name: 'The Crypt of Elder Glen',
    theme: 'crypt',
    // Far off the continent (the map spans about -9 to +14 km), where the old crypt stood.
    origin: new THREE.Vector3(40000, 0, 0),
    plans: CRYPT_PLANS,
    traps: ['darts', 'portcullis', 'blade', 'collapse', 'gas', 'boulder'],
    seed: CRYPT_SEED,
    mobs: (floor) => (floor === 1 ? ['orc', 'orc', 'cave'] : ['orc', 'orc', 'blue']),
    loot: baseTable([[['ringVigor', 1]], [['kiteShield', 1]], [['knightSword', 1]], []]),
    boss: { floor: 2, def: GRUKK_BOSS },
    reward: 'oldKingsSignet',
    exitLabel: (floor) => (floor === 1 ? 'Leave the crypt' : 'Climb the stairs up'),
    arrive: (floor) => (floor === 1 ? 'The Upper Crypt. Press M to draw your map.' : 'The Lower Crypt'),
  };
}
