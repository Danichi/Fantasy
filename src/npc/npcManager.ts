import { LEAN_TEST } from '../core/settings';
import * as THREE from 'three';
import { buildCharacter, type Look, type BuiltCharacter } from './charBuilder';
import { heightAt } from '../world/terrainHeight';
import type { WorldTime } from '../world/worldTime';
import { damp, dampAngle } from '../core/math';
import { isRole, knownNames, personName, rerollAlways, townName } from './names';

// Living-world NPCs (prompt §§30, 36, 37, 73, 74).
//
//   Level 3 (settlement far away)  nothing runs. Where anyone is follows from
//                                  their schedule and the clock.
//   Level 2 (in range, off-camera) an NPC's position is derived from its
//                                  schedule each tick; no actor exists.
//   Level 1 (near the player)      a pooled, animated character walks the
//                                  settlement's waypoint graph, works, sits
//                                  and talks, and can be spoken to.
// Characters are built once per look and reused (a small pool per look).

/** Where a resident has gone (see NpcManager.whereabouts). */
export interface Whereabouts {
  name: string;
  why: 'asleep' | 'inside' | 'away';
  /** when they're back at their post */
  back: string;
  /** where they are now, in words ("the inn") */
  where: string;
  /** their usual post, if they have one */
  post?: THREE.Vector3;
}

const PLACE_WORDS: Record<string, string> = {
  tavern: 'the inn', plaza: 'the plaza', market: 'the market', forge: 'the forge', mill: 'the mill', guild: 'the guild hall',
  training: 'the training yard', fields: 'the fields', pasture: 'the pasture', looms: 'the looms', lanes: 'the lanes', homes: 'home',
  southGate: 'the south gate', northGate: 'the north gate', eastGate: 'the east gate', westGate: 'the west gate', home: 'home',
};
function placeLabel(id: string) {
  if (/^home\d*$/.test(id) || /^yard\d*$/.test(id)) return 'home';
  return PLACE_WORDS[id] ?? id.replace(/^post:/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

export type Activity = 'sleep' | 'idle' | 'work' | 'sit' | 'talk' | 'patrol' | 'play' | 'shop' | 'drink' | 'farm';

export interface ScheduleEntry {
  /** start hour (0..24); the entry lasts until the next entry's start */
  from: number;
  activity: Activity;
  /** a place id in the NPC's settlement */
  place: string;
}

export interface NpcRecord {
  id: string;
  name: string;
  job: string;
  settlement: string;
  look: Look;
  schedule: ScheduleEntry[];
  /** a line or two they say, chosen by time of day */
  lines?: { any?: string[]; morning?: string[]; evening?: string[]; night?: string[] };
  /** shown under the name in dialogue (defaults to the job) */
  title?: string;
  /** authored residents (quest givers): never pooled out of town */
  named?: boolean;
}

export interface Place {
  id: string;
  /** spots NPCs spread across (benches, stalls, field rows...) */
  spots: THREE.Vector3[];
  /** facing yaw at the spots (optional) */
  yaw?: number;
  /** a building interior: NPCs here are hidden (inside) */
  indoors?: boolean;
  /** benches or chairs at the spots: only here does 'sit' actually sit down */
  seated?: boolean;
}

export interface Settlement {
  id: string;
  /** what people call it ("Waystop", "the Wayfork"); see npc/names.ts for the rest */
  name?: string;
  center: THREE.Vector3;
  /** simulation radius: records beyond this from the player stay at level 3 */
  radius: number;
  places: Map<string, Place>;
  /** waypoint graph: nodes and undirected edges */
  nodes: THREE.Vector3[];
  edges: number[][];
}

interface NpcState {
  /** distance to the player at the last update */
  dist?: number;
  rec: NpcRecord;
  seed: number;
  /** current world position (level 1 and 2) */
  pos: THREE.Vector3;
  yaw: number;
  entry: number;
  /** effective place (schedule, or shelter when it rains) */
  placeKey: string;
  spot: THREE.Vector3;
  path: THREE.Vector3[];
  moving: boolean;
  actor: Actor | null;
  talkT: number;
  hidden: boolean;
  /** their own side of the street (metres off the centre line) */
  lane: number;
  /** their own walking pace (1 = average) */
  pace: number;
  /** a short stroll about the place they're at (not a schedule move) */
  strolling: boolean;
  /** seconds until they next shift about where they stand */
  millT: number;
  /** who they've turned to (a little group at the inn, the plaza...) */
  faceYaw: number | null;
  /** seconds left of waiting before they set off (people don't all leave at once) */
  waitT: number;
  /** off on an errand in their free time: the spot to come back to */
  errand: THREE.Vector3 | null;
}

interface Actor {
  key: string;
  built: BuiltCharacter;
  actions: Record<string, THREE.AnimationAction | undefined>;
  current: string;
  headBone?: THREE.Bone;
  headYaw: number;
  /** casting shadows (only close to the camera: the shadow pass re-skins every mesh) */
  shadow?: boolean;
}

const SHADOW_R = 20;

// Full animated characters cost ~10 draw calls each (twice with shadows), so
// they only live close to the camera; baked sprites carry the crowd beyond.
const ACTIVE_R = 50; // metres: actors spawn inside this radius
const LIVE_R = 80; // settlements are simulated (schedules snap) within this of their edge
const FAR_R = 190; // sprite impostors between ACTIVE_R and this (dissolving out over the last stretch)
const SPRITE_CAP = 400;
// 256 baked looks: Elder Glen, the road and Port Aurelle have more than 128 residents.
const CELL_W = 64, CELL_H = 128, ATLAS_COLS = 16, ATLAS_ROWS = 16;
const DESPAWN_R = 58; // released beyond this (hysteresis over ACTIVE_R)
const MAX_ACTORS = 30;
/** Walking pace for a 1.8 m person (m/s); taller people stride further. */
const WALK_SPEED = 1.15;
/** How far the walk clip carries a 1.8 m body per second at normal playback (measured from its planted feet). */
const WALK_CLIP_SPEED = 0.82;

const lookKey = (l: Look) => JSON.stringify(l);
/** A look's silhouette: what a stand-in sprite must match so a crowd doesn't turn into clones of one person. */
const shapeKey = (l: Look) => `${l.body}|${l.outfit}|${l.hood ? 1 : 0}|${(l.height ?? 1.75) < 1.4 ? 'child' : 'adult'}`;
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** Animation clip for each activity (the talk clip doubles for shopkeeping). */
const ACTIVITY_CLIP: Record<Activity, string> = {
  sleep: 'idle', idle: 'idle', work: 'fix', sit: 'sit', talk: 'talk', patrol: 'arms', play: 'dance', shop: 'talk', drink: 'drink', farm: 'farm',
};
/** Per-job clip for 'work' (the smith hammers, the miller hauls, weavers fix). */
const WORK_CLIP: Record<string, string> = { smith: 'chop', miller: 'fix', shepherd: 'arms', weaver: 'fix', innfolk: 'talk', farmer: 'farm' };
const CLIPS = ['idle', 'idle_tired', 'talk', 'walk', 'sit', 'farm', 'water', 'chop', 'cheer', 'drink', 'arms', 'fix', 'dance'];
/** loaded onto an actor only once trouble finds them (NPC overhaul) */
const TROUBLE_CLIPS = ['hit', 'death', 'jog', 'crouch'];

export class NpcManager {
  readonly settlements = new Map<string, Settlement>();
  readonly npcs: NpcState[] = [];
  private pool = new Map<string, Actor[]>();
  private building = new Set<string>();
  private active = 0;
  private tick = 0;
  /** settlements currently simulated (level 1/2); entering snaps everyone to their schedule */
  private live = new Set<string>();
  /** the NPC the player is talking to (held still, facing them) */
  engaged: NpcState | null = null;
  /**
   * The world's solid shapes (main.ts: a static-geometry ray cast): distance to the
   * first wall along a ray, null if clear. Lets people walk round stalls and walls
   * and not stand inside them. (Colliders only exist near the player: far away
   * nobody can see a person clip, so nobody checks.)
   */
  ray?: (from: THREE.Vector3, dir: THREE.Vector3, max: number) => number | null;
  /** NPC overhaul: people who aren't here any more (dead, or left town) */
  absent?: (id: string) => boolean;
  /** NPC overhaul: what trouble does to people (hurt, fleeing, knocked out, killed) */
  private upset = new Map<NpcState, { mode: 'hit' | 'flee' | 'down' | 'dead' | 'hide'; t: number; from: THREE.Vector3 }>();
  // Far LOD: one sprite per look, baked from the real character in an idle pose.
  private atlas: THREE.WebGLRenderTarget;
  private cells = new Map<string, number>();
  /** baked cells by silhouette (body, outfit, hood), for stand-ins while a look is still baking */
  private shapeCells = new Map<string, number>();
  private sprites: THREE.InstancedMesh;
  private spriteData: THREE.InstancedBufferAttribute;
  private bakeScene = new THREE.Scene();
  private bakeCam = new THREE.OrthographicCamera(-0.55, 0.55, 2.1, -0.1, 0.1, 20);
  private spriteUniforms = { tAtlas: { value: null as THREE.Texture | null }, uCam: { value: new THREE.Vector3() }, uGrid: { value: new THREE.Vector2(ATLAS_COLS, ATLAS_ROWS) }, uNight: { value: 0 } };

  constructor(private scene: THREE.Scene, private time: WorldTime, private renderer?: THREE.WebGLRenderer) {
    this.atlas = new THREE.WebGLRenderTarget(CELL_W * ATLAS_COLS, CELL_H * ATLAS_ROWS);
    this.atlas.texture.colorSpace = THREE.SRGBColorSpace;
    this.spriteUniforms.tAtlas.value = this.atlas.texture;
    this.bakeScene.add(new THREE.HemisphereLight(0xc8dcff, 0x6a6048, 1.6));
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
    sun.position.set(-2, 4, 5);
    this.bakeScene.add(sun);
    // The ortho frustum (-0.1..2.1 m) is relative to the camera: keep it at ground level.
    this.bakeCam.position.set(0, 0, 6);
    this.bakeCam.lookAt(0, 0, 0);
    const quad = new THREE.PlaneGeometry(1, 1);
    quad.translate(0, 0.5, 0);
    this.spriteData = new THREE.InstancedBufferAttribute(new Float32Array(SPRITE_CAP * 4), 4); // cell, height, walk phase (-1 standing), fade
    quad.setAttribute('aSprite', this.spriteData);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.spriteUniforms,
      vertexShader: /* glsl */ `
        attribute vec4 aSprite;
        uniform vec3 uCam;
        varying vec2 vUv; varying float vCell; varying float vFade;
        void main() {
          vec3 base = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vec3 toCam = uCam - base; toCam.y = 0.0;
          vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x) + vec3(1e-5, 0.0, 0.0));
          float h = aSprite.y * 1.1;
          vec3 wp = base + right * position.x * h * 0.5 + vec3(0.0, position.y * h, 0.0);
          // Walking: a stride bob and a shoulder sway, so a far walker doesn't glide.
          if (aSprite.z >= 0.0) {
            float s = sin(aSprite.z);
            wp.y += abs(s) * 0.045 * h;
            wp += right * s * 0.035 * h * position.y;
          }
          vUv = uv; vCell = aSprite.x; vFade = aSprite.w;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tAtlas; uniform vec2 uGrid; uniform float uNight;
        varying vec2 vUv; varying float vCell; varying float vFade;
        void main() {
          // Dissolve (screen-door) at the edge of sprite range instead of popping.
          if (fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453) > vFade) discard;
          float col = mod(vCell, uGrid.x), row = floor(vCell / uGrid.x);
          vec4 c = texture2D(tAtlas, vec2((col + vUv.x) / uGrid.x, (uGrid.y - row - 1.0 + vUv.y) / uGrid.y));
          if (c.a < 0.5) discard;
          gl_FragColor = vec4(c.rgb * mix(1.0, 0.35, uNight), 1.0);
        }`,
    });
    this.sprites = new THREE.InstancedMesh(quad, mat, SPRITE_CAP);
    this.sprites.count = 0;
    this.sprites.frustumCulled = false;
    scene.add(this.sprites);
  }

  /** Render a freshly built character into its atlas cell (standing idle, facing the camera). */
  private bakeSprite(key: string, built: BuiltCharacter) {
    if (!this.renderer || this.cells.has(key) || this.cells.size >= ATLAS_COLS * ATLAS_ROWS) return;
    const cell = this.cells.size;
    const r = this.renderer;
    const parent = built.root.parent;
    const vis = built.root.visible;
    const pos = built.root.position.clone(), rot = built.root.rotation.y;
    built.root.position.set(0, 0, 0);
    built.root.rotation.y = 0;
    built.root.visible = true;
    this.bakeScene.add(built.root);
    const idle = (built.mixer as unknown as { _actions: THREE.AnimationAction[] })._actions.find((a) => a.getClip().name === 'idle');
    idle?.reset().play();
    built.mixer.update(0.5);
    const prevTarget = r.getRenderTarget();
    const prevAlpha = r.getClearAlpha();
    const prevColor = r.getClearColor(new THREE.Color());
    // A render target's own viewport/scissor apply while it's bound (the
    // renderer's setViewport doesn't): baking through those once scattered
    // half-cut figures across the atlas, and the crowd stood waist-deep.
    const col = cell % ATLAS_COLS, row = Math.floor(cell / ATLAS_COLS);
    const vx = col * CELL_W, vy = (ATLAS_ROWS - 1 - row) * CELL_H;
    const rt = this.atlas;
    rt.viewport.set(vx, vy, CELL_W, CELL_H);
    rt.scissor.set(vx, vy, CELL_W, CELL_H);
    rt.scissorTest = true;
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.bakeScene, this.bakeCam);
    rt.viewport.set(0, 0, rt.width, rt.height);
    rt.scissor.set(0, 0, rt.width, rt.height);
    rt.scissorTest = false;
    r.setRenderTarget(prevTarget);
    r.setClearColor(prevColor, prevAlpha);
    idle?.stop();
    this.bakeScene.remove(built.root);
    if (parent) parent.add(built.root);
    built.root.position.copy(pos);
    built.root.rotation.y = rot;
    built.root.visible = vis;
    this.cells.set(key, cell);
    const shape = shapeKey(JSON.parse(key) as Look);
    if (!this.shapeCells.has(shape)) this.shapeCells.set(shape, cell);
  }

  addSettlement(s: Settlement) {
    if (s.name) knownNames.set(s.id, s.name);
    NpcManager.connect(s);
    this.settlements.set(s.id, s);
  }

  /**
   * Stitch a walking graph into one piece: every island of streets gets a link
   * from its nearest node to the rest. (A route into an island used to give up
   * and walk straight there, through houses and walls.)
   */
  static connect(s: Settlement) {
    const n = s.nodes.length;
    if (n < 2) return;
    for (let guard = 0; guard < 64; guard++) {
      const comp = new Array<number>(n).fill(-1);
      let c = 0;
      for (let i = 0; i < n; i++) {
        if (comp[i] >= 0) continue;
        const stack = [i];
        comp[i] = c;
        while (stack.length) {
          const u = stack.pop()!;
          for (const v of s.edges[u]) if (comp[v] < 0) (comp[v] = c), stack.push(v);
        }
        c++;
      }
      if (c <= 1) return;
      // The biggest piece takes in whichever island lies nearest to it.
      const size = new Array<number>(c).fill(0);
      for (const k of comp) size[k]++;
      const main = size.indexOf(Math.max(...size));
      let best = Infinity, bi = -1, bj = -1;
      for (let i = 0; i < n; i++) {
        if (comp[i] === main) continue;
        for (let j = 0; j < n; j++) {
          if (comp[j] !== main) continue;
          const d = s.nodes[i].distanceToSquared(s.nodes[j]);
          if (d < best) (best = d), (bi = i), (bj = j);
        }
      }
      if (bi < 0) return;
      s.edges[bi].push(bj);
      s.edges[bj].push(bi);
    }
  }

  /** names already used in each settlement (no two people share one) */
  private names = new Map<string, Set<string>>();

  add(rec: NpcRecord) {
    const s = this.settlements.get(rec.settlement);
    if (!s) throw new Error('unknown settlement ' + rec.settlement);
    // A name of their own (see names.ts): a job for a name becomes the title,
    // and nobody shares a name with a neighbour. Named residents keep theirs.
    const used = this.names.get(rec.settlement) ?? new Set<string>();
    this.names.set(rec.settlement, used);
    if (!rec.named) {
      const town = townName(rec.settlement);
      const role = isRole(rec.name, rec.title);
      if (role && (!rec.title || rec.title === rec.name)) rec.title = rec.name;
      if (!rec.title) rec.title = rec.job.charAt(0).toUpperCase() + rec.job.slice(1) + ' of ' + town;
      const placeName = /^(.+?) of /.exec(rec.title)?.[0] ? rec.title.replace(/^.+? of /, '') : town;
      if (role || rerollAlways(rec.settlement, rec.job) || used.has(rec.name)) {
        for (let k = 0; k < 40; k++) {
          const n = personName(rec.id, rec.settlement, placeName, k);
          if (!used.has(n)) {
            rec.name = n;
            break;
          }
        }
      }
    }
    used.add(rec.name);
    const seed = hash(rec.id);
    const r = (k: number) => ((hash(rec.id + ':' + k) % 10000) / 10000);
    // Each person their own lane and pace: elders slower, children quicker, nobody in lockstep.
    const base = rec.job === 'elder' ? 0.78 : rec.job === 'child' ? 1.18 : rec.job === 'guard' ? 1.05 : 1;
    const st: NpcState = {
      rec, seed, pos: s.center.clone(), yaw: 0, entry: -1, placeKey: '', spot: s.center.clone(), path: [], moving: false, actor: null, talkT: 0, hidden: false,
      lane: (r(1) - 0.5) * 3.0, pace: base * (0.86 + r(2) * 0.3), strolling: false, millT: 4 + r(3) * 20, faceYaw: null, waitT: 0, errand: null,
    };
    this.npcs.push(st);
    this.placeBySchedule(st, true);
  }

  // ---- schedules ---------------------------------------------------------------

  private entryIndex(rec: NpcRecord) {
    // Townsfolk set off when they're ready, not on the stroke of the hour: up to
    // forty minutes late, so a schedule change isn't a column marching out of town.
    // (Named residents keep exact hours: players and quests look for them.)
    const late = rec.named ? 0 : ((hash(rec.id + ':late') % 1000) / 1000) * 0.66;
    const h = (this.time.hour - late + 24) % 24;
    let idx = rec.schedule.length - 1; // before the first entry: still on the last one (overnight)
    for (let i = 0; i < rec.schedule.length; i++) if (rec.schedule[i].from <= h) idx = i;
    return idx;
  }

  /** Heavy rain sends people at leisure under a roof: adults to the inn, children home. */
  raining = false;
  private lastBuild = 0;
  /** The harvest festival: the town gathers on the plaza on this day's evening. */
  festivalDay = -1;
  /** A night raid: everyone in this settlement bars their door (the watch fight as raid/watchman.ts). */
  raidOn: string | null = null;

  /** What a resident is doing right now (barks: hawkers call, drinkers toast). */
  activityOf(id: string) {
    const st = this.find(id);
    if (!st || st.hidden) return undefined;
    return st.moving ? 'walk' : this.effective(st).activity;
  }

  /** A resident by id (quest markers, scripted scenes). */
  find(id: string) {
    return this.npcs.find((n) => n.rec.id === id) ?? null;
  }

  private effective(st: NpcState) {
    const e = st.rec.schedule[this.entryIndex(st.rec)];
    const h = this.time.hour;
    if (this.raidOn === st.rec.settlement) {
      const home = st.rec.schedule.find((x) => x.activity === 'sleep')?.place ?? e.place;
      return { activity: 'sleep' as Activity, place: home };
    }
    if (this.festivalDay === this.time.day && h >= 19 && h < 23.5 && st.rec.job !== 'guard' && st.rec.job !== 'brannoc') {
      return { activity: 'play' as Activity, place: 'plaza' };
    }
    const leisure = e.activity === 'sit' || e.activity === 'play' || e.activity === 'idle' || e.activity === 'talk';
    const outdoors = !(this.settlements.get(st.rec.settlement)!.places.get(e.place)?.indoors);
    // Named residents (quest givers) keep their posts in the rain: players come looking for them.
    if (this.raining && leisure && outdoors && !(st.rec.named && e.place.startsWith('post:'))) {
      if (st.rec.job === 'child') {
        const home = st.rec.schedule.find((x) => x.activity === 'sleep')?.place ?? e.place;
        return { activity: 'idle' as Activity, place: home };
      }
      return { activity: 'drink' as Activity, place: 'tavern' };
    }
    return e;
  }

  /** Who holds which spot: "settlement:place" -> spot index -> resident. */
  private claims = new Map<string, Map<number, NpcState>>();
  private claimed = new Map<NpcState, { key: string; i: number }>();

  /**
   * A free spot at a place: start from the resident's own favourite and take
   * the next one nobody holds, so a crowd spreads across every spot there.
   * Once they're all taken, people share, standing further apart.
   */
  private claimSpot(st: NpcState, placeId: string, n: number) {
    const key = st.rec.settlement + ':' + placeId;
    const old = this.claimed.get(st);
    if (old && old.key === key) return { i: old.i, crowded: false };
    if (old) this.claims.get(old.key)?.delete(old.i);
    const held = this.claims.get(key) ?? new Map<number, NpcState>();
    this.claims.set(key, held);
    const start = st.seed % n;
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      if (held.has(i)) continue;
      held.set(i, st);
      this.claimed.set(st, { key, i });
      return { i, crowded: false };
    }
    this.claimed.delete(st);
    return { i: start, crowded: true };
  }

  private spotFor(st: NpcState, placeId: string) {
    const s = this.settlements.get(st.rec.settlement)!;
    const p = s.places.get(placeId);
    if (!p || !p.spots.length) return { spot: s.center.clone(), indoors: false, yaw: 0 };
    const { i, crowded } = this.claimSpot(st, placeId, p.spots.length);
    const spot = p.spots[i].clone();
    // A personal offset so people sharing a place stand apart instead of piling up.
    const a = ((st.seed >> 8) % 360) * (Math.PI / 180);
    const r = p.seated ? 0.4 : (crowded ? 2.2 : 0.4) + (((st.seed >> 3) % 97) / 97) * (crowded ? 2.4 : 1.0);
    spot.x += Math.cos(a) * r;
    spot.z += Math.sin(a) * r;
    spot.y = heightAt(spot.x, spot.z);
    return { spot, indoors: !!p.indoors, yaw: p.yaw ?? a };
  }

  /** Put an NPC where its schedule says it should be (spawn, teleports, level changes). */
  private placeBySchedule(st: NpcState, snap: boolean) {
    const idx = this.entryIndex(st.rec);
    const e = this.effective(st);
    const { spot, indoors, yaw } = this.spotFor(st, e.place);
    st.entry = idx;
    st.placeKey = e.place;
    st.spot.copy(spot);
    st.hidden = indoors || e.activity === 'sleep';
    if (snap) {
      st.pos.copy(spot);
      st.yaw = yaw;
      st.path = [];
      st.moving = false;
      st.strolling = false;
      st.waitT = 0;
      st.faceYaw = null;
    }
    st.errand = null;
  }

  /** Waypoint path from a position to a spot (Dijkstra on the settlement graph). */
  private route(s: Settlement, from: THREE.Vector3, to: THREE.Vector3, st?: NpcState) {
    const path = this.graphRoute(s, from, to);
    if (!st || path.length < 2) return path;
    // Walk your own side of the street: each waypoint shifted off the centre line
    // by this person's lane (and a little wobble), so a crowd heading the same way
    // spreads across the road instead of filing down its middle.
    for (let i = 0; i < path.length - 1; i++) {
      const a = i === 0 ? from : path[i - 1], b = path[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      const off = st.lane + (((hash(st.rec.id + ':' + i + ':' + this.time.day) % 1000) / 1000) - 0.5) * 1.2;
      path[i].x += (-dz / l) * off;
      path[i].z += (dx / l) * off;
    }
    return path;
  }

  private graphRoute(s: Settlement, from: THREE.Vector3, to: THREE.Vector3) {
    if (!s.nodes.length || from.distanceTo(to) < 18) return [to.clone()];
    const nearest = (p: THREE.Vector3) => {
      let best = 0, bd = Infinity;
      s.nodes.forEach((n, i) => {
        const d = n.distanceToSquared(p);
        if (d < bd) (bd = d), (best = i);
      });
      return best;
    };
    const a = nearest(from), b = nearest(to);
    const dist = new Array(s.nodes.length).fill(Infinity);
    const prev = new Array(s.nodes.length).fill(-1);
    const done = new Array(s.nodes.length).fill(false);
    dist[a] = 0;
    for (let iter = 0; iter < s.nodes.length; iter++) {
      let u = -1;
      for (let i = 0; i < s.nodes.length; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || dist[u] === Infinity || u === b) break;
      done[u] = true;
      for (const v of s.edges[u]) {
        const d = dist[u] + s.nodes[u].distanceTo(s.nodes[v]);
        if (d < dist[v]) (dist[v] = d), (prev[v] = u);
      }
    }
    const path: THREE.Vector3[] = [];
    for (let v = b; v >= 0; v = prev[v]) path.unshift(s.nodes[v].clone());
    path.push(to.clone());
    return path;
  }

  // ---- actors (level 1) ----------------------------------------------------------

  private async buildActor(key: string, look: Look) {
    if (this.building.has(key)) return;
    this.building.add(key);
    try {
      const built = await buildCharacter(look, CLIPS);
      const acts = (built.mixer as unknown as { _actions: THREE.AnimationAction[] })._actions;
      const actions: Actor['actions'] = {};
      for (const a of acts) actions[a.getClip().name] = a;
      const actor: Actor = { key, built, actions, current: '', headBone: built.bones.get('Head'), headYaw: 0 };
      // Out of the scene until someone uses it: parked actors (dozens, one per
      // look baked for its sprite) otherwise cost a matrix update per bone every frame.
      this.bakeSprite(key, built);
      built.root.visible = false;
      const list = this.pool.get(key) ?? [];
      list.push(actor);
      this.pool.set(key, list);
    } finally {
      this.building.delete(key);
    }
  }

  private take(st: NpcState): Actor | null {
    const key = lookKey(st.rec.look);
    const list = this.pool.get(key);
    const free = list?.find((a) => !a.built.root.parent);
    if (free) return free;
    // Nothing free: build another in the background (one at a time: each build
    // is a burst of main-thread work), try next tick.
    const now = performance.now();
    if (this.building.size === 0 && now - this.lastBuild > 350) {
      this.lastBuild = now;
      void this.buildActor(key, st.rec.look);
    }
    return null;
  }

  private release(st: NpcState) {
    if (!st.actor) return;
    st.actor.built.root.visible = false;
    st.actor.built.root.removeFromParent();
    st.actor.current = '';
    for (const a of Object.values(st.actor.actions)) a?.stop();
    st.actor = null;
    this.active--;
  }

  private play(actor: Actor, name: string) {
    if (actor.current === name) return;
    const next = actor.actions[name] ?? actor.actions.idle;
    const prev = actor.current ? actor.actions[actor.current] : undefined;
    if (!next) return;
    next.reset().play();
    if (prev && prev !== next) prev.crossFadeTo(next, 0.35, false);
    actor.current = name;
  }

  // ---- per frame ----------------------------------------------------------------

  update(dt: number, player: THREE.Vector3, camera?: THREE.Vector3, night = 0) {
    this.tick += dt;
    this.clock += dt;
    this.nearby = this.npcs.filter((n) => !n.hidden && (n.dist ?? 1e9) < ACTIVE_R + 10);
    const slow = this.tick >= 0.25;
    if (slow) this.tick = 0;
    let nSprites = 0;
    const wanting: NpcState[] = [];
    let farLook: Look | null = null;
    let farDist = Infinity;
    const m = new THREE.Matrix4();
    if (camera) this.spriteUniforms.uCam.value.copy(camera);
    this.spriteUniforms.uNight.value = night * 0.6;
    for (const s of this.settlements.values()) {
      // Enter and leave at different distances: flickering at the edge snapped
      // everyone to their schedule over and over (NPCs teleporting).
      const d = s.center.distanceTo(player);
      if (d < s.radius + LIVE_R && !this.live.has(s.id)) {
        // Level 3 -> 2: nobody was simulated, so put everyone where the clock says.
        this.live.add(s.id);
        for (const st of this.npcs) if (st.rec.settlement === s.id) this.placeBySchedule(st, true);
      } else if (d > s.radius + LIVE_R + 60) this.live.delete(s.id);
    }
    for (const st of this.npcs) {
      const s = this.settlements.get(st.rec.settlement)!;
      const inRange = this.live.has(s.id);
      if (!inRange) {
        // Level 3: nothing to do; release any actor.
        if (st.actor) this.release(st);
        continue;
      }
      // Gone for good (or gone away): nobody there.
      if (this.absent?.(st.rec.id) && !this.upset.has(st)) {
        st.hidden = true;
        if (st.actor) this.release(st);
        continue;
      }
      if (this.trouble(st, dt, player)) {
        if (st.hidden && st.actor) this.release(st);
        continue;
      }
      // Schedule changes: head to the new place along the waypoint graph.
      const idx = this.entryIndex(st.rec);
      // A quest giver doesn't walk off while the player is still with them.
      const stay = st.rec.named && !st.moving && st.pos.distanceTo(player) < 12;
      if (!stay && (idx !== st.entry || this.effective(st).place !== st.placeKey)) {
        this.placeBySchedule(st, false);
        st.path = this.route(s, st.pos, st.spot, st);
        st.moving = true;
        st.strolling = false;
        st.faceYaw = null;
        // A moment to finish what they were doing before they go.
        st.waitT = st.rec.named ? 0 : ((hash(st.rec.id + ':wait:' + idx) % 1000) / 1000) * 6;
        st.hidden = false; // visible while walking there
      }
      // Someone talking with the player stops and turns to face them.
      const held = st === this.engaged || st.talkT > 0;
      if (held) st.yaw = dampAngle(st.yaw, Math.atan2(player.x - st.pos.x, player.z - st.pos.z), 6, dt);
      // Walk along the path (level 1 and 2 alike, so positions stay consistent).
      if (st.moving && !held && st.waitT > 0) st.waitT -= dt;
      else if (st.moving && !held) {
        const target = st.path[0];
        if (!target) st.moving = st.strolling = false;
        else {
          const dx = target.x - st.pos.x, dz = target.z - st.pos.z;
          const d = Math.hypot(dx, dz);
          const speed = this.speedOf(st);
          const step = speed * dt;
          // Turn the corner a little early instead of touching every waypoint.
          const cut = st.path.length > 1 ? 1.4 : 0;
          if (d <= Math.max(step, cut)) {
            if (st.path.length === 1) st.pos.set(target.x, 0, target.z);
            st.path.shift();
            if (!st.path.length) this.arrive(st);
          } else {
            const push = this.avoid(st, player, dx / d, dz / d);
            let mx = dx / d + push.x, mz = dz / d + push.z;
            const ml = Math.hypot(mx, mz) || 1;
            [mx, mz] = this.steer(st, mx / ml, mz / ml);
            st.pos.x += mx * step;
            st.pos.z += mz * step;
            st.yaw = dampAngle(st.yaw, Math.atan2(mx, mz), 7, dt);
          }
          st.pos.y = heightAt(st.pos.x, st.pos.z);
        }
      } else if (!st.moving && !held && !st.hidden) this.idleLife(st, dt, player);
      const dist = st.pos.distanceTo(player);
      st.dist = dist;
      const wantActor = !st.hidden && dist < ACTIVE_R;
      if (st.actor && (st.hidden || dist > DESPAWN_R)) this.release(st);
      if (st.actor) {
        const cast = dist < SHADOW_R;
        if (st.actor.shadow !== cast) {
          st.actor.shadow = cast;
          st.actor.built.root.traverse((o) => ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = cast)));
        }
      }
      // At the cap, the farthest actor gives way to someone clearly nearer, or to
      // a named resident (quest givers are always animated when close).
      if (!st.actor && wantActor && slow && this.active >= MAX_ACTORS) {
        let far: NpcState | null = null;
        for (const o of this.npcs) if (o.actor && !o.rec.named && (!far || (o.dist ?? 0) > (far.dist ?? 0))) far = o;
        if (far && ((far.dist ?? 0) > dist + 12 || st.rec.named)) this.release(far);
      }
      if (!st.actor && wantActor && slow) wanting.push(st);
      if (!st.actor) {
        // Far LOD: a sprite, once this look has been baked (queue a build if not).
        // (Also near ones still waiting for an actor, so nobody blinks out.)
        if (!st.hidden && dist < FAR_R && nSprites < SPRITE_CAP) {
          const key = lookKey(st.rec.look);
          const own = this.cells.get(key);
          // Until this look is baked, stand in with the first baked one: an
          // unbaked crowd used to be simply invisible (Port Aurelle's market).
          const cell = own ?? this.shapeCells.get(shapeKey(st.rec.look)) ?? (this.cells.size ? 0 : undefined);
          if (cell !== undefined) {
            m.makeTranslation(st.pos.x, st.pos.y, st.pos.z);
            this.sprites.setMatrixAt(nSprites, m);
            const walk = st.moving && st.waitT <= 0 ? (performance.now() / 1000) * 6.5 * st.pace + (st.seed % 13) : -1;
            this.spriteData.setXYZW(nSprites, cell, st.rec.look.height ?? 1.75, walk, Math.min(1, (FAR_R - dist) / 30));
            nSprites++;
          }
          // Queue the nearest unbaked look (near ones too: at the actor cap they stay sprites).
          if (own === undefined && slow && !this.pool.has(key) && !this.building.has(key) && (!farLook || dist < farDist)) {
            farLook = st.rec.look;
            farDist = dist;
          }
        }
        continue;
      }
      // Level 1: animate.
      const a = st.actor;
      a.built.root.position.copy(st.pos);
      a.built.root.rotation.y = st.yaw;
      st.talkT = Math.max(0, st.talkT - dt);
      const e = this.effective(st);
      // Some variety: farmers alternate harvesting and watering; kids play or cheer.
      const alt = Math.floor(this.time.hour * 4 + (st.seed % 7)) % 2 === 0;
      let clip = e.activity === 'work' ? WORK_CLIP[st.rec.job] ?? 'fix' : ACTIVITY_CLIP[e.activity];
      if (e.activity === 'farm' && alt) clip = 'water';
      if (e.activity === 'play' && alt) clip = 'cheer';
      // 'sit' is a chair sit: without a seat it sank people into the ground.
      if (e.activity === 'sit' && !this.settlements.get(st.rec.settlement)!.places.get(e.place)?.seated) clip = st.seed % 3 === 0 ? 'talk' : 'idle';
      // Shopkeepers mind the stall: mostly standing, now and then calling out (not talking at nobody all day).
      if (e.activity === 'shop' && st.faceYaw === null && Math.floor(this.clock / 4 + (st.seed % 7)) % 3 !== 0) clip = 'idle';
      // In a little group, people take turns: one talks while the others listen.
      if (st.faceYaw !== null && (clip === 'idle' || clip === 'drink') && Math.floor(this.clock / 3.5 + (st.seed % 5)) % 3 === 0) clip = 'talk';
      if (clip === 'idle' && (this.time.hour >= 21 || this.time.hour < 5 || st.rec.job === 'elder') && st.seed % 2 === 0) clip = 'idle_tired';
      if (st === this.engaged || st.talkT > 0) clip = 'talk';
      else if (st.moving && st.waitT <= 0) clip = 'walk';
      this.play(a, clip);
      // Legs keep pace with the ground: the walk plays fast enough that planted feet don't slide.
      const walkAct = a.actions.walk;
      if (walkAct) walkAct.timeScale = (this.speedOf(st) / ((st.rec.look.height ?? 1.75) / 1.8)) / WALK_CLIP_SPEED;
      // Far actors animate at a lower rate.
      a.built.mixer.update(dist > 45 ? (slow ? 0.25 : 0) : dt);
      // Turn the head toward the player when close and idle.
      const toP = Math.atan2(player.x - st.pos.x, player.z - st.pos.z) - st.yaw;
      const want = !st.moving && dist < 6 ? Math.max(-0.9, Math.min(0.9, Math.atan2(Math.sin(toP), Math.cos(toP)))) : 0;
      a.headYaw = damp(a.headYaw, want, 4, dt);
      if (a.headBone && Math.abs(a.headYaw) > 0.01) a.headBone.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), a.headYaw * 0.7);
    }
    this.finishSprites(nSprites);
    // Hand out actors nearest-first; the nearest without a built look gets built next.
    if (wanting.length) {
      // Named residents first, then nearest.
      wanting.sort((a, b) => Number(!!b.rec.named) - Number(!!a.rec.named) || (a.dist ?? 0) - (b.dist ?? 0));
      for (const st of wanting) {
        if (this.active >= MAX_ACTORS) break;
        const a = this.take(st);
        if (!a) continue;
        st.actor = a;
        this.active++;
        // Place it before it shows, or it flashes where it last stood.
        a.built.root.position.copy(st.pos);
        a.built.root.rotation.y = st.yaw;
        a.built.root.visible = true;
        this.scene.add(a.built.root);
      }
    }
    // Only when nobody nearby is waiting does a distant look get built (for its sprite).
    // (Headless software-GL test runs skip far sprites: they cost seconds a bake and nobody sees them.)
    // At the actor cap nobody waiting will get one anyway, so baking goes ahead.
    const waiting = wanting.some((w) => !w.actor) && this.active < MAX_ACTORS;
    if (farLook && !LEAN_TEST && !waiting && this.building.size === 0 && performance.now() - this.lastBuild > 120) {
      this.lastBuild = performance.now();
      void this.buildActor(lookKey(farLook), farLook);
    }
  }

  private clock = 0;
  /** residents near the player last frame (for keeping out of each other's way) */
  private nearby: NpcState[] = [];

  /** How fast someone walks right now (m/s): their pace, their height, an amble when strolling. */
  private speedOf(st: NpcState) {
    const sway = 1 + 0.07 * Math.sin(this.clock * 0.6 + (st.seed % 100));
    const amble = st.rec.job === 'child' ? 1.5 : st.rec.job === 'guard' ? 0.8 : 0.62;
    return WALK_SPEED * ((st.rec.look.height ?? 1.75) / 1.8) * st.pace * sway * (st.strolling ? amble : 1);
  }

  /** Is this point inside something solid (at chest height)? */
  private inside(p: THREE.Vector3) {
    if (!this.ray) return false;
    const o = new THREE.Vector3(p.x, p.y + 1, p.z);
    let n = 0;
    for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.ray(o, new THREE.Vector3(x, 0, z), 0.05) === 0) n++;
    return n >= 3;
  }

  /** The nearest open ground to a point (rings out to 6 m), or null. */
  private freeNear(p: THREE.Vector3) {
    for (let r = 0.8; r <= 6; r += 0.8) {
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 + r;
        const q = new THREE.Vector3(p.x + Math.cos(a) * r, 0, p.z + Math.sin(a) * r);
        q.y = heightAt(q.x, q.z);
        if (!this.inside(q)) return q;
      }
    }
    return null;
  }

  /**
   * Walk round what's in the way: a wall, a stall, a fence a step ahead turns the
   * walker along it (whichever way is clear, nearest to where they're headed).
   * Someone already inside something just walks on out.
   */
  private steer(st: NpcState, fx: number, fz: number): [number, number] {
    if (!this.ray || (st.dist ?? 1e9) > ACTIVE_R + 10) return [fx, fz];
    const o = new THREE.Vector3(st.pos.x, st.pos.y + 0.9, st.pos.z);
    const look = (x: number, z: number) => this.ray!(o, new THREE.Vector3(x, 0, z), 0.9);
    const ahead = look(fx, fz);
    if (ahead === null || ahead === 0) return [fx, fz];
    for (const t of [0.5, -0.5, 1.0, -1.0, 1.5, -1.5]) {
      const c = Math.cos(t), s = Math.sin(t);
      const x = fx * c - fz * s, z = fx * s + fz * c;
      if (look(x, z) === null) return [x, z];
    }
    return [fx, fz];
  }

  /** At the end of the road (or of a stroll). */
  private arrive(st: NpcState) {
    st.moving = false;
    const stroll = st.strolling;
    st.strolling = false;
    if (stroll) return;
    const e = this.effective(st);
    const place = this.settlements.get(st.rec.settlement)!.places.get(e.place);
    st.hidden = !!place?.indoors || e.activity === 'sleep';
    if (place?.yaw !== undefined) st.yaw = place.yaw;
  }

  /** A sidestep: away from people in the way (walkers pass on the right) and from the player. */
  private avoid(st: NpcState, player: THREE.Vector3, fx: number, fz: number) {
    const out = { x: 0, z: 0 };
    if ((st.dist ?? 1e9) > ACTIVE_R + 10) return out; // nobody to see it
    for (const o of this.nearby) {
      if (o === st || o.hidden) continue;
      const dx = st.pos.x - o.pos.x, dz = st.pos.z - o.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 2.6 || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      // Only what's ahead matters; and someone coming the other way: both keep right.
      const ahead = -(dx * fx + dz * fz) / d;
      if (ahead < -0.2) continue;
      const k = (1.6 - d) * 0.9;
      out.x += (dx / d) * k + fz * 0.35 * k;
      out.z += (dz / d) * k - fx * 0.35 * k;
    }
    const px = st.pos.x - player.x, pz = st.pos.z - player.z;
    const pd = Math.hypot(px, pz);
    if (pd < 2.2 && pd > 1e-4) {
      const k = (2.2 - pd) * 1.1;
      out.x += (px / pd) * k + fz * 0.4 * k;
      out.z += (pz / pd) * k - fx * 0.4 * k;
    }
    return out;
  }

  /**
   * Standing about: shuffle to a new spot now and then (children chase about),
   * turn toward whoever is standing nearby so people gather in little groups,
   * and step aside if the player walks right into them.
   */
  private idleLife(st: NpcState, dt: number, player: THREE.Vector3) {
    if ((st.dist ?? 1e9) > ACTIVE_R + 10) return;
    const e = this.effective(st);
    const place = this.settlements.get(st.rec.settlement)!.places.get(e.place);
    // Standing inside a wall or a stall (a spot laid out over a building): step out to open ground.
    if (this.tick === 0 && !place?.seated && this.inside(st.pos)) {
      const free = this.freeNear(st.pos);
      if (free) {
        st.spot.copy(free);
        st.path = [free];
        st.moving = true;
        st.strolling = true;
        return;
      }
    }
    // Out of the way of the player.
    const px = st.pos.x - player.x, pz = st.pos.z - player.z;
    const pd = Math.hypot(px, pz);
    if (pd < 0.9 && pd > 1e-4 && st !== this.engaged && !place?.seated) {
      st.pos.x += (px / pd) * 1.6 * dt;
      st.pos.z += (pz / pd) * 1.6 * dt;
      st.pos.y = heightAt(st.pos.x, st.pos.z);
    }
    const leisure = e.activity === 'idle' || e.activity === 'talk' || e.activity === 'drink' || e.activity === 'play' || e.activity === 'shop';
    const onBeat = e.activity === 'patrol' && !st.rec.named && !place?.indoors;
    const free = (leisure || onBeat) && !place?.seated && !place?.indoors && !(st.rec.named && e.place.startsWith('post:'));
    // Whom to face: the nearest person standing within a few steps.
    if (this.tick === 0) {
      let best: NpcState | null = null, bd = 3.6;
      if (free && e.activity !== 'shop' && !onBeat) {
        for (const o of this.nearby) {
          if (o === st || o.moving || o.hidden) continue;
          const d = Math.hypot(o.pos.x - st.pos.x, o.pos.z - st.pos.z);
          if (d < bd) (bd = d), (best = o);
        }
      }
      st.faceYaw = best ? Math.atan2(best.pos.x - st.pos.x, best.pos.z - st.pos.z) : null;
    }
    if (st.faceYaw !== null) st.yaw = dampAngle(st.yaw, st.faceYaw, 3, dt);
    if (!free) return;
    st.millT -= dt;
    if (st.millT > 0) return;
    const child = st.rec.job === 'child' && e.activity === 'play';
    // Free time isn't spent on one spot: now and then an errand across town (the
    // market, the plaza, the inn), a while there, and back again.
    if (st.errand || (!child && !st.rec.named && (e.activity === 'idle' || e.activity === 'talk') && Math.random() < 0.14)) {
      const s = this.settlements.get(st.rec.settlement)!;
      let to: THREE.Vector3 | null = null;
      if (st.errand) {
        to = st.errand;
        st.errand = null;
      } else {
        const options = ['market', 'plaza', 'lanes', 'tavern', 'square', 'harbour', 'docks', 'well', 'fire'].filter((k) => k !== e.place && s.places.get(k)?.spots.length && !s.places.get(k)!.indoors);
        if (options.length) {
          const pl = s.places.get(options[Math.floor(Math.random() * options.length)])!;
          to = pl.spots[Math.floor(Math.random() * pl.spots.length)].clone();
          to.x += (Math.random() - 0.5) * 3;
          to.z += (Math.random() - 0.5) * 3;
          to.y = heightAt(to.x, to.z);
          if (to.distanceTo(st.pos) > 140) to = null; // not a day's walk
          else st.errand = st.spot.clone();
        }
      }
      if (to) {
        st.spot.copy(to);
        st.path = this.route(s, st.pos, to, st);
        st.moving = true;
        st.strolling = false;
        st.faceYaw = null;
        st.millT = 40 + Math.random() * 80;
        return;
      }
    }
    st.millT = child ? 2 + Math.random() * 4 : onBeat ? 14 + Math.random() * 20 : 9 + Math.random() * 22;
    // Mostly a step or two from their own spot; children run further; the Watch walks a beat.
    const r = child ? 1.5 + Math.random() * 3 : onBeat ? 3 + Math.random() * 6 : 0.6 + Math.random() * 1.8;
    const a = Math.random() * Math.PI * 2;
    const to = new THREE.Vector3(st.spot.x + Math.cos(a) * r, 0, st.spot.z + Math.sin(a) * r);
    to.y = heightAt(to.x, to.z);
    if (this.ray && (this.inside(to) || this.ray(new THREE.Vector3(st.pos.x, st.pos.y + 1, st.pos.z), new THREE.Vector3(to.x - st.pos.x, 0, to.z - st.pos.z).normalize(), Math.hypot(to.x - st.pos.x, to.z - st.pos.z)) !== null)) return; // a wall in the way: stay put
    st.path = [to];
    st.moving = true;
    st.strolling = true;
    st.waitT = 0;
    st.faceYaw = null;
  }

  private finishSprites(n: number) {
    this.sprites.count = n;
    this.sprites.instanceMatrix.needsUpdate = true;
    this.spriteData.needsUpdate = true;
  }

  /**
   * Trouble (NPC overhaul): a blow staggers them, then they run from `from`;
   * 'down' knocks them out for a while; 'dead' is the end; 'flee' just runs.
   * Runners hide indoors for a while once they're clear.
   */
  react(id: string, mode: 'hit' | 'flee' | 'down' | 'dead', from: THREE.Vector3, sec = 5) {
    const st = this.find(id);
    if (!st) return;
    const cur = this.upset.get(st);
    if (cur?.mode === 'dead' || (cur?.mode === 'down' && mode !== 'dead')) return;
    this.upset.set(st, { mode, t: mode === 'hit' ? 0.55 : sec, from: from.clone() });
    const a = st.actor;
    if (a && !a.actions.death && a.built.addClips) {
      void a.built.addClips(TROUBLE_CLIPS).then(() => {
        const acts = (a.built.mixer as unknown as { _actions: THREE.AnimationAction[] })._actions;
        for (const x of acts) a.actions[x.getClip().name] ??= x;
        a.current = '';
      });
    }
    if (this.engaged === st) this.engaged = null;
    if (st.actor) st.actor.current = '';
  }
  /** Everyone calms down and goes back to their day (tests). */
  calm() {
    for (const st of this.upset.keys()) this.placeBySchedule(st, true);
    this.upset.clear();
  }
  /** Shaken up right now (running, down, dead or hiding): can't be talked to. */
  troubled(id: string) {
    const st = this.find(id);
    return !!st && this.upset.has(st);
  }

  private playOnce(actor: Actor, name: string) {
    if (actor.current === name) return;
    const next = actor.actions[name];
    if (!next) return this.play(actor, 'idle');
    const prev = actor.current ? actor.actions[actor.current] : undefined;
    next.reset();
    next.setLoop(THREE.LoopOnce, 1);
    next.clampWhenFinished = true;
    next.play();
    if (prev && prev !== next) prev.crossFadeTo(next, 0.15, false);
    actor.current = name;
  }

  /** Move and animate someone in trouble; true while it overrides their routine. */
  private trouble(st: NpcState, dt: number, player: THREE.Vector3) {
    const u = this.upset.get(st);
    if (!u) return false;
    u.t -= dt;
    const a = st.actor;
    switch (u.mode) {
      case 'hit':
        if (a) this.playOnce(a, 'hit');
        if (u.t <= 0) Object.assign(u, { mode: 'flee', t: 6 });
        break;
      case 'flee': {
        const away = st.pos.clone().sub(u.from).setY(0);
        if (away.lengthSq() < 1e-4) away.set(Math.sin(st.seed), 0, Math.cos(st.seed));
        away.normalize();
        st.pos.addScaledVector(away, 4.6 * dt);
        st.pos.y = heightAt(st.pos.x, st.pos.z);
        st.yaw = dampAngle(st.yaw, Math.atan2(away.x, away.z), 10, dt);
        st.moving = false;
        if (a) {
          this.play(a, a.actions.jog ? 'jog' : 'walk');
          if (!a.actions.jog && a.actions.walk) a.actions.walk.timeScale = 2.2;
        }
        // Clear of you: duck indoors for a while.
        if (u.t <= 0 || st.pos.distanceTo(player) > 28) Object.assign(u, { mode: 'hide', t: 90 });
        break;
      }
      case 'down':
        if (a) this.playOnce(a, u.t > 2.5 ? 'death' : 'crouch');
        if (u.t <= 0) {
          this.upset.delete(st);
          if (a) a.current = '';
        }
        break;
      case 'dead':
        if (a) this.playOnce(a, 'death');
        if (u.t <= 0) {
          st.hidden = true;
          if (st.actor) this.release(st);
        }
        break;
      case 'hide':
        st.hidden = true;
        if (u.t <= 0) {
          this.upset.delete(st);
          this.placeBySchedule(st, true);
        }
        break;
    }
    if (st.actor) {
      st.actor.built.root.position.copy(st.pos);
      st.actor.built.root.rotation.y = st.yaw;
      st.actor.built.mixer.update(dt);
    }
    return true;
  }

  /** The nearest visible NPC within reach (for talking), if any. */
  nearest(p: THREE.Vector3, reach = 2.6) {
    let best: NpcState | null = null, bd = reach;
    for (const st of this.npcs) {
      if (!st.actor || this.upset.has(st)) continue;
      const d = st.pos.distanceTo(p);
      if (d < bd) (bd = d), (best = st);
    }
    return best;
  }

  /**
   * Where a resident is when they're not where you'd expect: asleep, inside a
   * building, or (for people with a post, like Elder Maud) off somewhere else.
   * Null while they're at their post or out and about. `back` is when they're
   * next back at their post (or at least up and outdoors).
   */
  whereabouts(id: string): Whereabouts | null {
    const st = this.find(id);
    if (!st) return null;
    const s = this.settlements.get(st.rec.settlement)!;
    const sched = st.rec.schedule;
    const postIdx = sched.findIndex((x) => x.place.startsWith('post:'));
    const post = postIdx >= 0 ? s.places.get(sched[postIdx].place)?.spots[0]?.clone() : undefined;
    const e = this.effective(st);
    const atPost = postIdx >= 0 ? e.place === sched[postIdx].place : true;
    if (!st.hidden && atPost) return null;
    const usable = (k: number) => (postIdx >= 0 ? sched[k].place === sched[postIdx].place : sched[k].activity !== 'sleep' && !s.places.get(sched[k].place)?.indoors);
    const n = sched.length, idx = this.entryIndex(st.rec);
    let next = -1;
    for (let k = 1; k <= n && next < 0; k++) if (usable((idx + k) % n)) next = (idx + k) % n;
    const h = next < 0 ? null : sched[next].from % 24;
    const back = h === null ? '' : `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
    const why: Whereabouts['why'] = e.activity === 'sleep' ? 'asleep' : st.hidden ? 'inside' : 'away';
    return { name: st.rec.name, why, back, where: placeLabel(e.place), post };
  }

  /** Something the NPC says right now (time-of-day aware). */
  lineFor(st: NpcState) {
    const L = st.rec.lines ?? {};
    const phase = this.time.phase;
    const pool = [
      ...(phase === 'morning' || phase === 'dawn' ? L.morning ?? [] : []),
      ...(phase === 'evening' || phase === 'dusk' ? L.evening ?? [] : []),
      ...(phase === 'night' ? L.night ?? [] : []),
      ...(L.any ?? []),
    ];
    st.talkT = 4;
    return pool.length ? pool[(st.seed + Math.floor(this.time.hour * 3)) % pool.length] : 'Good day.';
  }

  setVisible(v: boolean) {
    this.sprites.visible = v;
    for (const list of this.pool.values()) for (const a of list) if (!v) (a.built.root.visible = false), a.built.root.removeFromParent();
    if (!v) for (const st of this.npcs) if (st.actor) this.release(st);
  }

  get activeCount() {
    return this.active;
  }

  dispose() {
    for (const st of this.npcs) this.release(st);
    for (const list of this.pool.values()) for (const a of list) this.scene.remove(a.built.root);
    this.pool.clear();
  }
}
