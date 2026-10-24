import * as THREE from 'three';
import { placeSites } from './place';
import { SiteKit } from './kit';
import { mulberry32 } from '../../core/math';
import { events } from '../../core/events';
import type { Site, SiteAction, SiteFoe, SiteHooks, SiteLive, SiteState, SiteType } from './types';
import type { Player } from '../../player/player';

// The sites manager: places every site once (a fixed seed), builds a site
// when you come within reach and takes it down when you leave, keeps what's
// happened at each (saved), marks the ones you've seen on the map, and offers
// whatever you can do at the nearest one.

/** Build within this (metres), take down beyond BUILD + HYST. */
const BUILD = 330;
const HYST = 120;
/** Seen (marked on the map) within this. */
const SEE = 70;

interface Built {
  site: Site;
  kit: SiteKit;
  live: SiteLive;
}

export class Sites {
  readonly types = new Map<string, SiteType>();
  sites: Site[] = [];
  state: Record<string, SiteState> = {};
  private built = new Map<string, Built>();
  private foes: { f: SiteFoe; site: string; t: number }[] = [];
  /** the trees keep clear of these (filled by place) */
  readonly clearings: [number, number, number][] = [];
  enabled = true;
  private scan = 0;

  constructor(private hooks: SiteHooks) {}

  /** Register the kinds, then find them homes, keeping clear of `avoid` ([x, z, r]). */
  place(types: SiteType[], avoid: [number, number, number][]) {
    for (const t of types) this.types.set(t.kind, t);
    const t0 = performance.now();
    this.sites = placeSites(types, avoid);
    for (const s of this.sites) this.clearings.push([s.x, s.z, this.types.get(s.kind)!.clear]);
    return performance.now() - t0;
  }

  st(id: string): SiteState {
    return (this.state[id] ??= {});
  }
  type(s: Site) {
    return this.types.get(s.kind)!;
  }
  name(s: Site) {
    const t = this.type(s);
    return t.name?.(s) ?? t.label;
  }

  /** The site with this id. */
  get(id: string) {
    return this.sites.find((s) => s.id === id) ?? null;
  }
  /** Sites of a kind. */
  of(kind: string) {
    return this.sites.filter((s) => s.kind === kind);
  }
  /** The foes a site has let loose (tests). */
  foesFor(id: string) {
    return this.foes.filter((x) => x.site === id).map((x) => x.f);
  }
  /** Is it built right now (tests)? */
  live(id: string) {
    return this.built.get(id)?.live ?? null;
  }

  private build(s: Site) {
    const t = this.type(s);
    const kit = new SiteKit(this.hooks.scene, this.hooks.mats, this.hooks.fx, new THREE.Vector3(s.x, s.y, s.z), s.yaw, s.seed);
    const state = this.st(s.id);
    const live = t.build({
      site: s,
      kit,
      state,
      hooks: this.hooks,
      rnd: mulberry32(s.seed ^ 0x9e3779b9),
      spawn: (f) => this.foes.push({ f, site: s.id, t: 0 }),
      others: (kind) => this.of(kind).map((o) => this.st(o.id)),
      siblings: () => this.of(s.kind),
      markSeen: (id) => {
        this.st(id).seen = true;
      },
      unseen: (x, z) => {
        let best: Site | null = null, bd = Infinity;
        for (const o of this.sites) {
          if (o.id === s.id || this.state[o.id]?.seen) continue;
          const d = Math.hypot(o.x - x, o.z - z);
          if (d < bd) {
            bd = d;
            best = o;
          }
        }
        return best ? { site: best, st: this.st(best.id), name: this.name(best) } : null;
      },
      finish: () => {
        if (!state.done) {
          state.done = true;
          events.emit('siteDone', { id: s.id, kind: s.kind });
        }
      },
    });
    kit.finish();
    this.built.set(s.id, { site: s, kit, live });
  }

  private unbuild(id: string) {
    const b = this.built.get(id);
    if (!b) return;
    b.live.dispose?.();
    b.kit.dispose();
    this.built.delete(id);
    // Foes it let loose go with it once you're gone.
    this.foes = this.foes.filter((x) => {
      if (x.site !== id) return true;
      x.f.dispose();
      return false;
    });
  }

  update(dt: number, player: Player) {
    const p = player.pos;
    // Build and take down (a few sites checked each step).
    this.scan -= dt;
    if (this.scan <= 0) {
      this.scan = 0.25;
      for (const s of this.sites) {
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        if (this.enabled && d < BUILD && !this.built.has(s.id)) this.build(s);
        else if (this.built.has(s.id) && (d > BUILD + HYST || !this.enabled)) this.unbuild(s.id);
        if (d < SEE) {
          const st = this.st(s.id);
          if (!st.seen) {
            st.seen = true;
            events.emit('siteSeen', { id: s.id, kind: s.kind });
          }
        }
      }
    }
    for (const b of this.built.values()) {
      b.kit.update(dt);
      b.live.update?.(dt, player);
    }
    for (const x of this.foes) {
      x.f.update(dt, player);
      if (!x.f.alive) x.t += dt;
    }
    this.foes = this.foes.filter((x) => {
      if (x.t < 12) return true;
      x.f.dispose();
      return false;
    });
  }

  /** What you can do here (the nearest action in reach). */
  action(at: THREE.Vector3): SiteAction | null {
    let best: SiteAction | null = null, bd = Infinity;
    for (const b of this.built.values()) {
      if (Math.hypot(b.site.x - at.x, b.site.z - at.z) > 60) continue;
      for (const a of b.live.actions) {
        if (a.enabled && !a.enabled()) continue;
        const d = a.at.distanceTo(at);
        if (d < a.radius && d < bd) {
          bd = d;
          best = a;
        }
      }
    }
    return best;
  }

  /** Map marks: the sites you've seen, faded once they're done. */
  markers() {
    const out: { x: number; z: number; kind: 'site' | 'siteDone'; glyph: string; color: string; label: string }[] = [];
    for (const s of this.sites) {
      const st = this.state[s.id];
      if (!st?.seen) continue;
      const t = this.type(s);
      out.push({ x: s.x, z: s.z, kind: st.done ? 'siteDone' : 'site', glyph: t.glyph, color: t.color, label: this.name(s) });
    }
    return out;
  }

  /** Everything taken down (realm change, tests). */
  clear() {
    for (const id of [...this.built.keys()]) this.unbuild(id);
    for (const x of this.foes) x.f.dispose();
    this.foes = [];
  }

  toJSON() {
    return structuredClone(this.state);
  }
  fromJSON(s?: Record<string, SiteState>) {
    this.clear();
    this.state = structuredClone(s ?? {});
  }
}
