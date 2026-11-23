import * as THREE from 'three';
import type { Target } from '../combat/targets';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';
import { Bolts } from '../enemies/bandit';
import { Greyjaw, GREYJAW } from '../bosses/greyjaw';
import { WhiteStag, WHITE_STAG } from '../bosses/whiteStag';
import { BrineMaw, BRINE_MAW } from '../bosses/brineMaw';
import { MotherOoze, MOTHER_OOZE } from '../bosses/motherOoze';
import { HollowThane, HOLLOW_THANE } from '../bosses/hollowThane';
import { RustKnight, RUST_KNIGHT } from '../bosses/rustKnight';
import { Snaggletooth, SNAGGLETOOTH } from '../bosses/snaggletooth';
import { Varga, VARGA_ONE_EYE } from '../bosses/varga';
import { DISCOVERY_BOSSES } from '../bosses/discoveryBosses';
import { DeadLord, DROWNED_CAPTAIN, HANGED_LORD, WRAITH } from '../bosses/deadLords';
import { RatQueen } from '../bosses/ratQueen';
import { Delver } from '../bosses/delver';
import type { BossBody } from '../bosses/fieldBosses';
import { prepareCreature } from '../creatures/geometryStore';
import { CHAMPIONS, Champion } from '../story/champions';
import { OrcWarlord } from '../enemies/orc';
import { ABOMINATION } from '../world/gravewood';
import { CorruptedBrother, summonEdricDead } from '../enemies/corruptedBrother';
import { LivingArmour } from '../enemies/livingArmour';
import { SandGolem } from '../enemies/sandGolem';
import { SandShark } from '../enemies/sandCreatures';
import { LAIRS, LairController, type BossHandle } from '../world/wilds/lairs';
import type { WildCtx } from '../enemies/wilds/wildBeast';
import { OrcMob } from '../enemies/orcMob';
import type { Undead } from '../enemies/undead';
import { Telegraphs } from '../enemies/wilds/telegraph';
import { Missiles } from '../enemies/wilds/projectiles';
import { GRUKK_BOSS } from '../dungeon/dungeons/crypt';
import { VESS } from '../dungeon/dungeons/hollowRidge';
import { TIDE_WARDEN } from '../dungeon/dungeons/drownedShrine';
import type { BossDef, BossFight, BossActor } from '../dungeon/kit/boss';
import { theme } from '../dungeon/kit/theme';
import { physics } from '../physics/physics';
import { BEAST_NAMES, makeBeast, type BeastId } from '../world/sea/seaMonsters';
import { NavalPractice } from './navalPractice';

export type BossGroup = 'Field' | 'Lair' | 'Dungeon' | 'Story' | 'Sea';
export interface PracticeBody {
  update(dt: number, player: Player): void;
  dispose(): void;
  present?(alpha: number, dt: number, player: Player): void;
}
export interface BossSession extends PracticeBody {
  ready?: Promise<void>;
  scaleReserve?(factor: number): void;
  health(): { hp: number; maxHp: number; alive: boolean } | null;
  targets(): Target[];
  phases: number[];
  naval?: NavalPractice;
  interact?(): { at: THREE.Vector3; label: string; act(): void } | null;
}
export interface BossContext {
  scene: THREE.Scene;
  fx: FX;
  bolts: Bolts;
  at: THREE.Vector3;
  say(text: string): void;
}
export interface PracticeBoss {
  id: string;
  name: string;
  description: string;
  group: BossGroup;
  art: string;
  create(c: BossContext): Promise<BossSession>;
}
const V = (x: number, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const target = (b: unknown): b is Target => !!b && typeof (b as Target).takeHit === 'function';
const simple = (
  body: PracticeBody & {
    hp: number;
    maxHp: number;
    alive: boolean;
    ready?: Promise<void>;
  },
  phases: number[] = []
): BossSession => ({
  phases,
  ready: body.ready,
  health: () => body,
  targets: () => (target(body) ? [body] : []),
  update: (dt, p) => body.update(dt, p),
  present: (a, dt, p) => body.present?.(a, dt, p),
  dispose: () => body.dispose(),
});
function field(body: BossBody): BossSession {
  return {
    ...simple(body, [0.55, 0.25]),
    scaleReserve: (factor) => {
      if (body instanceof Snaggletooth) body.scaleRiderHealth(factor);
    },
    targets: () => {
      if (body instanceof Snaggletooth) return [body.boar, ...(body.chief ? [body.chief] : []), ...body.band.map((m) => m.b)];
      if (body instanceof Varga) return [...(body.o ? [body.o] : []), ...body.band.map((m) => m.o)];
      return target(body) ? [body] : [];
    },
    interact: () => body.interact?.() ?? null,
  };
}
const fieldDefs = [GREYJAW, WHITE_STAG, BRINE_MAW, MOTHER_OOZE, HOLLOW_THANE, RUST_KNIGHT, SNAGGLETOOTH, VARGA_ONE_EYE, ...DISCOVERY_BOSSES];
const fieldFactories: Record<string, (c: BossContext) => BossBody> = {
  greyjaw: (c) => new Greyjaw(c.at, 35, c.scene, c.fx, c.at),
  whiteStag: (c) => new WhiteStag(c.at, 35, c.scene, c.fx, c.at),
  brineMaw: (c) => new BrineMaw(c.at, 35, c.scene, c.fx, c.at),
  motherOoze: (c) => new MotherOoze(c.at, 35, c.scene, c.fx, c.at),
  hollowThane: (c) => new HollowThane(c.at, 35, c.scene, c.fx, c.at),
  rustKnight: (c) => new RustKnight(c.at, 35, c.scene, c.fx, c.at),
  snaggletooth: (c) => new Snaggletooth(c.at, 35, c.scene, c.fx, c.at),
  varga: (c) => new Varga(c.at, 0, c.scene, c.fx),
  drownedCaptain: (c) => new DeadLord(DROWNED_CAPTAIN, c.at, 35, c.scene, c.fx),
  hangedLord: (c) => new DeadLord(HANGED_LORD, c.at, 35, c.scene, c.fx),
  circleWraith: (c) => new DeadLord(WRAITH, c.at, 35, c.scene, c.fx),
  ratQueen: (c) => new RatQueen(c.at, 35, c.scene, c.fx),
  delver: (c) => new Delver(c.at, 35, c.scene, c.fx),
};

/** Run the real dungeon boss definition, including its phase adds and hazards,
 * against a small arena context. Loot, dungeon flags and story intros stay out. */
async function dungeon(def: BossDef, c: BossContext): Promise<BossSession> {
  const group = new THREE.Group();
  c.scene.add(group);
  const adds: (PracticeBody & Target)[] = [];
  const colliders: ReturnType<typeof physics.addBox>[] = [];
  const th = theme(def === TIDE_WARDEN ? 'drowned' : def === VESS ? 'cave' : 'crypt');
  const ctr = c.at.clone().add(V(0, 0, 4));
  const room = { id: 'practice-boss', rect: { x: 0, y: 0, w: 8, h: 8 } };
  const ctx = {
    scene: c.scene,
    fx: c.fx,
    theme: th,
    inst: { group, origin: c.at.clone().setZ(ctr.z), bolts: c.bolts },
    centre: () => ctr.clone(),
    size: () => ({ w: 32, d: 32 }),
    group: () => group,
    faces: () => [],
    mesh: (_r: unknown, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, yaw = 0) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.rotation.y = yaw;
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    },
    solid: (at: THREE.Vector3, half: THREE.Vector3, yaw = 0) => colliders.push(physics.addBox(at, half, new THREE.Quaternion().setFromAxisAngle(V(0, 1), yaw))),
    flame: (_r: unknown, at: THREE.Vector3) => {
      const l = new THREE.PointLight(0xffc578, 6, 7);
      l.position.copy(at);
      group.add(l);
    },
    spawnNow: (kind: string, at: THREE.Vector3) => {
      const b = kind === 'orc' ? new OrcMob(at, c.scene, c.fx) : new Bandit(kind === 'crossbow' ? 'crossbow' : 'sword', at, c.scene, c.bolts);
      if (b instanceof Bandit) b.alerted = true;
      adds.push(b);
      return b;
    },
    toast: c.say,
    hooks: { banner: c.say },
  };
  const f = {
    c: ctx,
    def,
    room,
    home: { at: c.at.clone(), yaw: 0 },
    s: {},
    phase: 0,
    target: null,
  } as unknown as BossFight;
  def.arena?.(f);
  try {
    f.target = await def.create(c.at.clone(), 0, f);
  } catch (e) {
    group.removeFromParent();
    for (const col of colliders) physics.world.removeCollider(col, true);
    throw e;
  }
  def.onIntro?.(f);
  let phase = 0;
  return {
    phases: def.phases,
    ready: 'inner' in f.target! ? (f.target as BossActor & { inner: Bandit }).inner.ready : (f.target as BossActor & { ready?: Promise<void> }).ready,
    health: () => f.target,
    targets: () => {
      const t = f.target!;
      return ['inner' in t ? (t as BossActor & { inner: Target }).inner : t, ...adds];
    },
    update(dt, p) {
      f.target!.update(dt, p);
      if (f.target!.alive) {
        while (phase < def.phases.length && f.target!.hp / f.target!.maxHp < def.phases[phase]) {
          f.phase = ++phase;
          def.onPhase?.(f, phase);
        }
        def.update?.(f, dt, p);
      }
      for (const a of adds) a.update(dt, p);
    },
    present: (a, dt, p) => f.target?.present?.(a, dt, p),
    dispose() {
      def.onReset?.(f);
      f.target?.dispose();
      for (const a of adds) a.dispose();
      for (const col of colliders) physics.world.removeCollider(col, true);
      group.removeFromParent();
      group.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose();
      });
    },
  };
}
import { Bandit } from '../enemies/bandit';

async function lair(id: string, c: BossContext): Promise<BossSession> {
  await Promise.all(['boar'].map(prepareCreature));
  const tele = new Telegraphs(c.scene),
    missiles = new Missiles(c.scene, c.fx);
  const ctx: WildCtx = { tele, missiles };
  const adds: LairController['adds'] = [];
  const def = LAIRS.find((d) => d.id === id)!;
  // Relocate the lair's own summon helpers to the practice ring, retaining
  // their original species, ranks, scaling, pack behaviour and callbacks.
  const controller = {
    def: { ...def, at: [c.at.x, c.at.z], arena: 16, leash: 100 },
    adds,
    hooks: { toast: c.say },
    home: () => c.at.clone(),
    openYaw: 0,
    scene: c.scene,
    fx: c.fx,
    ctx,
    disposed: false,
    mats: {},
    woke: () => c.say(def.boss),
    phase: (n: number) => c.say(`Phase ${n + 1}`),
  } as unknown as LairController;
  controller.summonBeasts = LairController.prototype.summonBeasts.bind(controller);
  controller.summonSounder = LairController.prototype.summonSounder.bind(controller);
  controller.summonOrcs = LairController.prototype.summonOrcs.bind(controller);
  const handle: BossHandle = def.make(controller);
  return {
    ready: Promise.resolve(handle.ready).then(() => (handle.target() as (Target & { ready?: Promise<void> }) | null)?.ready),
    phases: handle.phases,
    health: () => handle.target(),
    targets: () => [...(handle.target() ? [handle.target()!] : []), ...adds.map((a) => a.t)],
    update(dt, p) {
      handle.update(dt, p);
      for (const a of adds) a.update(dt, p);
      tele.update(dt);
      missiles.update(dt, p);
    },
    present: (a, dt, p) => handle.present(a, dt, p),
    dispose() {
      controller.disposed = true;
      handle.dispose();
      adds.forEach((a) => a.dispose());
      tele.clear();
      missiles.clear();
    },
  };
}
export const PRACTICE_BOSSES: PracticeBoss[] = [
  ...fieldDefs.map((d) => ({
    id: d.id,
    name: d.name,
    description: d.id === 'whiteStag' ? 'A hunt, not a kill: approach quietly and earn its trust.' : d.title,
    group: 'Field' as const,
    art: d.id,
    async create(c: BossContext) {
      await Promise.all(d.looks.map(prepareCreature));
      return field(fieldFactories[d.id](c));
    },
  })),
  ...LAIRS.map((d) => ({
    id: d.id,
    name: d.boss,
    description: d.title,
    group: 'Lair' as const,
    art: d.id === 'ulgra' ? 'exileOrc' : d.id,
    create: (c: BossContext) => lair(d.id, c),
  })),
  ...[GRUKK_BOSS, VESS, TIDE_WARDEN].map((d) => ({
    id: d.kind,
    name: d.name,
    description: d.subtitle,
    group: 'Dungeon' as const,
    art: d.kind === 'grukk' ? 'orc' : d.kind,
    create: (c: BossContext) => dungeon(d, c),
  })),
  {
    id: 'sandGolem',
    name: 'The Warden of the Sands',
    description: 'Buried fists, shockwaves and falling stones.',
    group: 'Field',
    art: 'sandGolem',
    async create(c) {
      return simple(new SandGolem(c.at, c.scene, c.fx), [0.5]);
    },
  },
  {
    id: 'sawtooth',
    name: 'Old Sawtooth',
    description: 'The giant sand shark of Sawtooth Basin.',
    group: 'Field',
    art: 'sawtooth',
    async create(c) {
      const b = new SandShark(c.at, c.scene, c.fx, {
        boss: true,
        scale: 2.4,
        hp: 1400,
        damage: 34,
        name: 'Old Sawtooth',
        kind: 'sawtooth',
      });
      return {
        phases: [],
        health: () => b,
        targets: () => [b],
        update: (dt, p) => b.update(dt, p, () => false),
        dispose: () => b.dispose(),
      };
    },
  },
  {
    id: 'abomination',
    name: 'The Stitched Abomination',
    description: 'The Gravewood horror, with its full moveset.',
    group: 'Story',
    art: 'abomination',
    async create(c) {
      const b = await OrcWarlord.create(c.at, 0, c.scene, c.fx, {
        ...ABOMINATION,
      });
      b.wake();
      return simple(b);
    },
  },
  {
    id: 'edricHollowed',
    name: 'Edric, the Hollowed',
    description: 'Cursed fire, shadow steps and summoned Gravewood dead.',
    group: 'Story',
    art: 'circleWraith',
    async create(c) {
      const b = new CorruptedBrother(c.at, 0, c.scene, c.fx, {
        x0: c.at.x - 23,
        x1: c.at.x + 23,
        z0: c.at.z - 15,
        z1: c.at.z + 30,
      });
      const adds: Undead[] = [];
      b.onSummon = (at) => adds.push(...summonEdricDead(at, c.scene, c.fx, c.at.y));
      const ready = b.ready.then(() => b.wake());
      const s = { ...simple(b, [0.5]), ready };
      return {
        ...s,
        targets: () => [b, ...adds],
        update: (dt, p) => {
          b.update(dt, p);
          adds.forEach((a) => a.update(dt, p, adds));
        },
        dispose: () => {
          b.dispose();
          adds.forEach((a) => a.dispose());
        },
      };
    },
  },
  {
    id: 'livingArmour',
    name: 'The Living Armour',
    description: 'An empty suit with a sword, shield and a guarded front.',
    group: 'Dungeon',
    art: 'armour',
    async create(c) {
      return simple(new LivingArmour(c.at, c.scene, c.fx));
    },
  },
  ...Object.values(CHAMPIONS)
    .filter((d) => !d.dead && d.power !== 'dawn')
    .map((d) => ({
      id: 'champion:' + d.id,
      name: d.name,
      description: d.epithet,
      group: 'Story' as const,
      art: d.power === 'drowned' ? 'drownedCaptain' : 'banditChief',
      async create(c: BossContext) {
        const b = new Champion(d, c.at, c.scene, c.bolts, {
          fx: c.fx,
          scene: c.scene,
          say: (n, l) => c.say(n + ': ' + l),
          shake: () => {},
          enemies: [],
        });
        return simple(b, [0.65, 0.3]);
      },
    })),
  ...Object.entries(BEAST_NAMES).map(([id, name]) => ({
    id: 'sea:' + id,
    name,
    description: 'Naval trial · training ship, swivel guns and heavy harpoons.',
    group: 'Sea' as const,
    art: id,
    async create(c: BossContext) {
      const naval = new NavalPractice(c, makeBeast, id as BeastId);
      return naval.session;
    },
  })),
];
export const practiceBoss = (id: string) => PRACTICE_BOSSES.find((b) => b.id === id) ?? PRACTICE_BOSSES[0];
