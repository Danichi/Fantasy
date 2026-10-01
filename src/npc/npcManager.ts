import { LEAN_TEST } from '../core/settings';
import * as THREE from 'three';
import { buildCharacter, type Look, type BuiltCharacter } from './charBuilder';
import { heightAt } from '../world/terrainHeight';
import type { WorldTime } from '../world/worldTime';
import { damp, dampAngle } from '../core/math';

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
const ACTIVE_R = 32; // metres: actors spawn inside this radius
const LIVE_R = 80; // settlements are simulated (schedules snap) within this of their edge
const FAR_R = 170; // sprite impostors between ACTIVE_R and this
const SPRITE_CAP = 240;
// 256 baked looks: Elder Glen, the road and Port Aurelle have more than 128 residents.
const CELL_W = 64, CELL_H = 128, ATLAS_COLS = 16, ATLAS_ROWS = 16;
const DESPAWN_R = 40; // released beyond this (hysteresis over ACTIVE_R)
const MAX_ACTORS = 22;
/** Walking pace for a 1.8 m person (m/s); taller people stride further. */
const WALK_SPEED = 1.15;
/** How far the walk clip carries a 1.8 m body per second at normal playback (measured from its planted feet). */
const WALK_CLIP_SPEED = 0.82;

const lookKey = (l: Look) => JSON.stringify(l);
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
  // Far LOD: one sprite per look, baked from the real character in an idle pose.
  private atlas: THREE.WebGLRenderTarget;
  private cells = new Map<string, number>();
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
    this.spriteData = new THREE.InstancedBufferAttribute(new Float32Array(SPRITE_CAP * 2), 2); // cell, height
    quad.setAttribute('aSprite', this.spriteData);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.spriteUniforms,
      vertexShader: /* glsl */ `
        attribute vec2 aSprite;
        uniform vec3 uCam;
        varying vec2 vUv; varying float vCell;
        void main() {
          vec3 base = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vec3 toCam = uCam - base; toCam.y = 0.0;
          vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x) + vec3(1e-5, 0.0, 0.0));
          float h = aSprite.y * 1.1;
          vec3 wp = base + right * position.x * h * 0.5 + vec3(0.0, position.y * h, 0.0);
          vUv = uv; vCell = aSprite.x;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tAtlas; uniform vec2 uGrid; uniform float uNight;
        varying vec2 vUv; varying float vCell;
        void main() {
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
  }

  addSettlement(s: Settlement) {
    this.settlements.set(s.id, s);
  }

  add(rec: NpcRecord) {
    const s = this.settlements.get(rec.settlement);
    if (!s) throw new Error('unknown settlement ' + rec.settlement);
    const seed = hash(rec.id);
    const st: NpcState = { rec, seed, pos: s.center.clone(), yaw: 0, entry: -1, placeKey: '', spot: s.center.clone(), path: [], moving: false, actor: null, talkT: 0, hidden: false };
    this.npcs.push(st);
    this.placeBySchedule(st, true);
  }

  // ---- schedules ---------------------------------------------------------------

  private entryIndex(rec: NpcRecord) {
    const h = this.time.hour;
    let idx = rec.schedule.length - 1; // before the first entry: still on the last one (overnight)
    for (let i = 0; i < rec.schedule.length; i++) if (rec.schedule[i].from <= h) idx = i;
    return idx;
  }

  /** Heavy rain sends people at leisure under a roof: adults to the inn, children home. */
  raining = false;
  private lastBuild = 0;
  /** The harvest festival: the town gathers on the plaza on this day's evening. */
  festivalDay = -1;

  /** A resident by id (quest markers, scripted scenes). */
  find(id: string) {
    return this.npcs.find((n) => n.rec.id === id) ?? null;
  }

  private effective(st: NpcState) {
    const e = st.rec.schedule[this.entryIndex(st.rec)];
    const h = this.time.hour;
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
    }
  }

  /** Waypoint path from a position to a spot (Dijkstra on the settlement graph). */
  private route(s: Settlement, from: THREE.Vector3, to: THREE.Vector3) {
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
      // Schedule changes: head to the new place along the waypoint graph.
      const idx = this.entryIndex(st.rec);
      // A quest giver doesn't walk off while the player is still with them.
      const stay = st.rec.named && !st.moving && st.pos.distanceTo(player) < 12;
      if (!stay && (idx !== st.entry || this.effective(st).place !== st.placeKey)) {
        this.placeBySchedule(st, false);
        st.path = this.route(s, st.pos, st.spot);
        st.moving = true;
        st.hidden = false; // visible while walking there
      }
      // Someone talking with the player stops and turns to face them.
      const held = st === this.engaged || st.talkT > 0;
      if (held) st.yaw = dampAngle(st.yaw, Math.atan2(player.x - st.pos.x, player.z - st.pos.z), 6, dt);
      // Walk along the path (level 1 and 2 alike, so positions stay consistent).
      if (st.moving && !held) {
        const target = st.path[0];
        if (!target) st.moving = false;
        else {
          const dx = target.x - st.pos.x, dz = target.z - st.pos.z;
          const d = Math.hypot(dx, dz);
          const step = WALK_SPEED * ((st.rec.look.height ?? 1.75) / 1.8) * dt;
          if (d <= step) {
            st.pos.set(target.x, 0, target.z);
            st.path.shift();
            if (!st.path.length) {
              st.moving = false;
              const e = this.effective(st);
              const place = this.settlements.get(st.rec.settlement)!.places.get(e.place);
              st.hidden = !!place?.indoors || e.activity === 'sleep';
              if (place?.yaw !== undefined) st.yaw = place.yaw;
            }
          } else {
            st.pos.x += (dx / d) * step;
            st.pos.z += (dz / d) * step;
            st.yaw = dampAngle(st.yaw, Math.atan2(dx, dz), 8, dt);
          }
          st.pos.y = heightAt(st.pos.x, st.pos.z);
        }
      }
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
          const cell = own ?? (this.cells.size ? 0 : undefined);
          if (cell !== undefined) {
            m.makeTranslation(st.pos.x, st.pos.y, st.pos.z);
            this.sprites.setMatrixAt(nSprites, m);
            this.spriteData.setXY(nSprites, cell, st.rec.look.height ?? 1.75);
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
      if (st === this.engaged || st.talkT > 0) clip = 'talk';
      else if (st.moving) clip = 'walk';
      this.play(a, clip);
      // Legs keep pace with the ground: the walk plays fast enough that planted feet don't slide.
      const walkAct = a.actions.walk;
      if (walkAct) walkAct.timeScale = WALK_SPEED / WALK_CLIP_SPEED;
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
    if (farLook && !LEAN_TEST && !waiting && this.building.size === 0 && performance.now() - this.lastBuild > 250) {
      this.lastBuild = performance.now();
      void this.buildActor(lookKey(farLook), farLook);
    }
  }

  private finishSprites(n: number) {
    this.sprites.count = n;
    this.sprites.instanceMatrix.needsUpdate = true;
    this.spriteData.needsUpdate = true;
  }

  /** The nearest visible NPC within reach (for talking), if any. */
  nearest(p: THREE.Vector3, reach = 2.6) {
    let best: NpcState | null = null, bd = reach;
    for (const st of this.npcs) {
      if (!st.actor) continue;
      const d = st.pos.distanceTo(p);
      if (d < bd) (bd = d), (best = st);
    }
    return best;
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
