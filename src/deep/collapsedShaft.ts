import * as THREE from 'three';
import { SpaceBuilder, type DeepSpace } from './deepKit';
import { MountainFoe } from '../enemies/mountain/mountainFoe';
import { buildCharacter, type BuiltCharacter } from '../npc/charBuilder';
import { LOOKS } from '../world/mountains/mountainFolk';
import type { FX } from '../fx/particles';
import type { Player } from '../player/player';
import type { Interactable } from '../dungeon/instance';

// The Collapsed Shaft (docs/design/mountains.md §9, quest 4): the rescue
// dungeon under Bruni's claim. Down the ladder, along the first gallery with
// its pit-props, two side galleries where the roof came in on a miner each,
// a second gallery where cave crawlers have come up out of the cracks, and
// at the bottom the old chamber the miners broke into: crystal in the walls,
// the third miner pinned under the fall, and the golem that woke. Built
// self-contained on the realm pattern (a seam for the dungeon kit after the
// merge: src/dungeon/kit/).

export const SHAFT_ORIGIN = new THREE.Vector3(12500, 300, 7500);

export interface ShaftHooks {
  toast(m: string): void;
  /** miners already brought out (indices) */
  rescued(): number[];
  rescue(i: number, name: string): void;
  /** leave by the ladder */
  climbOut(): void;
}

const MINERS: [string, number, number][] = [['Old Fenwick', -18, -25], ['Dagny Brassjaw', 18, -33], ['Jory Hollins', 9, -94]];

export class CollapsedShaft implements DeepSpace {
  id = 'shaft';
  title = 'The Collapsed Shaft';
  readonly group: THREE.Group;
  readonly ready: Promise<void>;
  readonly interactables: Interactable[] = [];
  readonly map;
  readonly light = { hemi: 0.3, sky: 0x7186a5, ground: 0x18130f, fog: 0x06080c, far: 150, haze: 0.018 };
  spawnPoint: THREE.Vector3;
  spawnYaw = Math.PI;
  respawnPoint: THREE.Vector3;
  readonly foes: MountainFoe[] = [];
  private b: SpaceBuilder;
  private miners: (BuiltCharacter | null)[] = [null, null, null];
  private t = 0;

  constructor(private scene: THREE.Scene, private fx: FX, hooks: ShaftHooks) {
    const b = (this.b = new SpaceBuilder(SHAFT_ORIGIN, scene, 40, 40, 4));
    this.group = b.group;
    this.map = b.map;
    const m = b.m;
    // The landing at the foot of the ladder.
    b.room(-5, -8, 5, 6, 5, 0, [['n', 0, 4]]);
    b.mesh(new THREE.BoxGeometry(0.12, 5, 0.12), m.timber, -0.5, 2.5, 5.4);
    b.mesh(new THREE.BoxGeometry(0.12, 5, 0.12), m.timber, 0.5, 2.5, 5.4);
    for (let y = 0.4; y < 5; y += 0.45) b.mesh(new THREE.BoxGeometry(1.1, 0.08, 0.08), m.timber, 0, y, 5.4);
    b.lantern(3.5, 2.4, 3);
    b.light(3.5, 2.6, 3, 0xffa050, 6, 14);
    // The first gallery, propped every six metres.
    b.room(-2, -72, 2, -8, 4, 0, [['w', -25, 4], ['e', -33, 4], ['n', 0, 4], ['s', 0, 4]]);
    for (let z = -12; z > -72; z -= 6) {
      for (const x of [-1.8, 1.8]) b.mesh(new THREE.BoxGeometry(0.25, 3.9, 0.25), m.timber, x, 1.95, z);
      b.mesh(new THREE.BoxGeometry(4, 0.3, 0.3), m.timber, 0, 3.8, z);
    }
    for (const z of [-20, -44, -62]) {
      b.lantern(1.4, 2.2, z);
      b.light(1.4, 2.4, z, 0xff9a4a, 4.5, 12);
    }
    // Side galleries: the roof came down on a miner in each.
    b.room(-22, -30, -2, -20, 4, 0, [['e', -25, 4]]);
    b.room(2, -38, 22, -28, 4, 0, [['w', -33, 4]]);
    b.rubble(-16, 0, -25, 9, 2.5);
    b.rubble(16, 0, -33, 9, 2.5);
    b.light(-12, 2.5, -25, 0x7ab8ff, 2.5, 12);
    b.crystals(-21, 0, -21, 4, 0.7, m.crystalDim);
    b.light(12, 2.5, -33, 0xff9a4a, 3, 12);
    // The second gallery opens out; crawlers in the cracks.
    b.rubble(-1, 0, -52, 6, 1.2);
    b.rubble(1, 0, -66, 5, 1);
    // The old chamber the miners broke into: crystal in the walls.
    b.room(-14, -102, 14, -72, 12, 0, [['s', 0, 4]]);
    for (const [x, z] of [[-11, -76], [11, -78], [-10, -98], [12, -88], [-12, -88], [0, -100]] as const) b.crystals(x, 0, z, 5, 1.4);
    b.light(-8, 5, -84, 0x6ab8ff, 7, 26);
    b.light(8, 5, -92, 0x6ab8ff, 7, 26);
    for (const [x, z] of [[-6, -80], [6, -80], [-6, -94], [6, -94]] as const) b.block(x, 0, z, 1.8, 12, 1.8, m.stoneDark);
    b.rubble(9, 0, -97, 12, 3);
    b.finish();
    this.spawnPoint = b.at(0, 0, 3);
    this.respawnPoint = this.spawnPoint.clone();

    // Who lives down here now.
    for (const [x, z] of [[-1, -48], [1, -55], [-1, -60], [0.5, -66]]) this.foes.push(new MountainFoe('caveCrawler', b.at(x, 0, z), scene, fx, 1.3));
    this.foes.push(new MountainFoe('golem', b.at(0, 0, -88), scene, fx, 1));

    // The miners.
    const done = hooks.rescued();
    MINERS.forEach(([name, x, z], i) => {
      if (done.includes(i)) return;
      const at = b.at(x, 0, z);
      void buildCharacter(i === 2 ? LOOKS.minerM : i ? LOOKS.dwarfF : LOOKS.dwarfM, ['sit', 'idle']).then((c) => {
        if (!this.group.parent) return;
        c.root.position.copy(at);
        c.root.rotation.y = x > 0 ? -Math.PI / 2 : Math.PI / 2;
        const acts = (c.mixer as unknown as { _actions: THREE.AnimationAction[] })._actions;
        acts[0]?.play();
        scene.add(c.root);
        this.miners[i] = c;
      });
      this.interactables.push({
        pos: at, radius: 3.2,
        label: () => `Dig out ${name}`,
        enabled: () => !hooks.rescued().includes(i),
        action: () => {
          fx.dust(at.clone().setY(at.y + 0.5), 3);
          const c = this.miners[i];
          if (c) scene.remove(c.root);
          this.miners[i] = null;
          hooks.rescue(i, name);
        },
      });
    });
    this.interactables.push({ pos: b.at(0, 0, 4.6), radius: 2.4, label: () => 'Climb the ladder out of the shaft', enabled: () => true, action: () => hooks.climbOut() });
    this.ready = Promise.resolve();
  }

  groundAt = (x: number, z: number) => this.b.groundAt(x, z);
  cellAt(p: THREE.Vector3) {
    return this.b.cellAt(p);
  }

  get golem() {
    return this.foes.find((f) => f.kind === 'golem') ?? null;
  }

  update(dt: number, player: Player) {
    this.t += dt;
    this.b.flicker(this.t);
    for (const f of this.foes) f.update(dt, player);
    for (const c of this.miners) c?.mixer.update(dt);
    // Dust sifts from the cracked roof.
    if (Math.random() < dt * 4) this.fx.alpha.spawn({ pos: player.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, 3.5, (Math.random() - 0.5) * 8)), spread: 0.05, count: 1, life: [2, 4], size: [0.04, 0.04], color: 0xb9aa8f, alpha: 0.4, gravity: 0.4 });
  }

  dispose() {
    for (const f of this.foes) f.dispose();
    for (const c of this.miners) if (c) this.scene.remove(c.root);
    this.b.dispose();
  }
}
