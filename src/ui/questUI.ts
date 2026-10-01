import * as THREE from 'three';
import type { QuestLog } from '../quests/questLog';
import type { HUD } from './hud';
import { heightAt } from '../world/terrainHeight';

// Quest presentation (World Expansion §46): side quests under the main quest
// in the HUD tracker, a journal (J) with active and completed quests, gold
// ❗ / ❓ markers over the heads of NPCs with something for you, and a compass
// strip at the top of the screen pointing to the tracked quest's next step.

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class QuestUI {
  open = false;
  onToggle?: (open: boolean) => void;
  private journal: HTMLDivElement;
  private marks = new Map<string, HTMLDivElement>();
  private selected: string | null = null;
  private tmp = new THREE.Vector3();
  private dirty = true;
  private compass: HTMLDivElement;
  private cmpTicks: { el: HTMLElement; bearing: number }[] = [];
  private cmpTarget: HTMLDivElement;
  private camDir = new THREE.Vector3();
  /** the tracked objective: a pillar of light in the world, a marker on screen, an arrow at the edge */
  private beacon: THREE.Group | null = null;
  private beaconMat: THREE.ShaderMaterial | null = null;
  private wp: HTMLDivElement;
  private visible = true;
  private target: { x: number; z: number; label: string; d: number } | null = null;
  private wpPos = new THREE.Vector3();
  /** "Show on map" in the journal */
  onShowOnMap?: (x: number, z: number) => void;

  constructor(
    private quests: QuestLog,
    private hud: HUD,
    private camera: THREE.Camera,
    /** NPC ids that can carry markers, with a head-position resolver */
    private npcHead: (id: string) => THREE.Vector3 | null,
    private npcIds: () => string[],
  ) {
    const root = document.getElementById('ui')!;
    this.journal = document.createElement('div');
    this.journal.className = 'journal interactive hidden';
    root.appendChild(this.journal);
    // Compass: cardinal points every 90 degrees, ticks every 15.
    this.compass = document.createElement('div');
    this.compass.className = 'compass';
    for (let deg = 0; deg < 360; deg += 15) {
      const el = document.createElement('i');
      const cardinal = ({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' } as Record<number, string>)[deg];
      el.className = cardinal ? 'cmp-card' : deg % 45 === 0 ? 'cmp-mid' : 'cmp-tick';
      if (cardinal) el.textContent = cardinal;
      this.compass.appendChild(el);
      // Bearing as yaw: north is -Z (yaw pi), east is +X (yaw pi/2).
      this.cmpTicks.push({ el, bearing: Math.PI - (deg * Math.PI) / 180 });
    }
    this.cmpTarget = document.createElement('div');
    this.cmpTarget.className = 'cmp-target';
    this.compass.appendChild(this.cmpTarget);
    root.appendChild(this.compass);
    this.wp = document.createElement('div');
    this.wp.className = 'waypoint';
    this.wp.innerHTML = '<i class="wp-arrow"></i><b>◆</b><span></span>';
    root.appendChild(this.wp);
    this.journal.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const pick = t.closest('[data-quest]') as HTMLElement | null;
      if (pick) {
        this.selected = pick.dataset.quest!;
        this.render();
      }
      if (t.dataset.track) {
        this.quests.tracked = t.dataset.track;
        this.dirty = true;
        this.render();
      }
      if (t.dataset.close !== undefined) this.toggle(false);
      if (t.dataset.map) {
        const m = this.quests.markers().find((x) => x.quest === t.dataset.map);
        if (m) this.onShowOnMap?.(m.x, m.z);
      }
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyJ' && !e.repeat) {
        const typing = (document.activeElement as HTMLElement | null)?.tagName === 'INPUT';
        if (typing) return;
        this.toggle(!this.open);
      } else if (e.code === 'Escape' && this.open) {
        e.stopImmediatePropagation();
        this.toggle(false);
      }
    }, true);
    quests.onChange = () => {
      this.dirty = true;
      if (this.open) this.render();
    };
  }

  /** Put the objective beacon into the world (a soft gold pillar that shows through fog). */
  attachScene(scene: THREE.Scene) {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uAlpha: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime; uniform float uAlpha; varying vec2 vUv;
        void main(){
          // No pow(): the interpolated v can overshoot 1 by a hair, and pow of a tiny
          // negative is NaN, which the bloom pass smears into a black box.
          float y = clamp(vUv.y, 0.0, 1.0), k = 1.0 - y;
          float fade = k * k * smoothstep(0.0, 0.04, y);
          float band = 0.75 + 0.25 * sin(vUv.y * 40.0 - uTime * 3.0);
          gl_FragColor = vec4(clamp(vec3(1.0, 0.78, 0.36) * fade * band * uAlpha, 0.0, 4.0), 1.0);
        }`,
    });
    const g = new THREE.Group();
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.9, 70, 16, 1, true), mat);
    pillar.position.y = 35;
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.25, 70, 8, 1, true), mat);
    core.position.y = 35;
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.9, 40), new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12;
    g.add(pillar, core, ring);
    g.traverse((o) => (o.renderOrder = 5));
    g.visible = false;
    g.name = 'questBeacon';
    scene.add(g);
    this.beacon = g;
    this.beaconMat = mat;
  }

  toggle(open: boolean) {
    if (open === this.open) return;
    this.open = open;
    this.journal.classList.toggle('hidden', !open);
    if (open) {
      this.selected ??= this.quests.tracked ?? this.quests.active()[0]?.id ?? this.quests.completed()[0]?.id ?? null;
      this.render();
    }
    this.onToggle?.(open);
  }

  private render() {
    const active = this.quests.active();
    const done = this.quests.completed();
    const item = (id: string, title: string, sub: string, cls: string) =>
      `<button class="j-item ${cls} ${this.selected === id ? 'sel' : ''}" data-quest="${id}"><b>${esc(title)}</b><small>${esc(sub)}</small></button>`;
    const list =
      `<div class="j-group">ACTIVE · ${active.length}</div>` +
      (active.length ? active.map((q) => item(q.id, q.title, q.stages[this.quests.state[q.id].stage].note, this.quests.tracked === q.id ? 'tracked' : '')).join('') : '<p class="j-empty">No active quests. Townsfolk with a gold ❗ over their heads have work for you.</p>') +
      `<div class="j-group">COMPLETED · ${done.length}</div>` +
      done.map((q) => item(q.id, q.title, 'Complete', 'done')).join('');
    let detail = '<p class="j-empty">Select a quest.</p>';
    const q = this.selected ? this.quests.defs.get(this.selected) : null;
    if (q) {
      const st = this.quests.state[q.id];
      const stages = st ? q.stages.slice(0, st.status === 'done' ? q.stages.length : st.stage + 1) : [];
      const lines = this.quests.lines(q.id);
      detail =
        `<h2>${esc(q.title)}</h2><div class="j-region">${st?.status === 'done' ? 'COMPLETED' : 'IN PROGRESS'} · ${q.region === 'cresha' ? 'Elder Glen, Kingdom of Cresha' : esc(q.region)}</div>` +
        `<p class="j-summary">${esc(q.summary)}</p>` +
        (lines.length ? `<div class="j-objs">${lines.map(([t, p, n]) => `<div class="${p >= n ? 'ok' : ''}"><i>${p >= n ? '✔' : '◇'}</i>${esc(t)}${n > 1 ? ` <span>${p}/${n}</span>` : ''}</div>`).join('')}</div>` : '') +
        `<div class="j-log">${stages.map((s, i) => `<div class="${st && (st.status === 'done' || i < st.stage) ? 'past' : ''}">${esc(s.note)}</div>`).join('')}</div>` +
        `<div class="j-rewards">Rewards · ${q.rewards.gold} gold · ${q.rewards.xp} XP${q.rewards.guildRep ? ` · ${q.rewards.guildRep} guild rep` : ''}${q.rewards.items?.length ? ' · items' : ''}</div>` +
        (st?.status === 'active' ? `<div class="j-actions">${this.quests.tracked !== q.id ? `<button class="j-track" data-track="${q.id}">Track this quest</button>` : ''}${this.quests.markers().some((m) => m.quest === q.id) ? `<button class="j-track" data-map="${q.id}">Show on map</button>` : ''}</div>` : '');
    }
    this.journal.innerHTML = `<header><span>JOURNAL</span><button data-close>✕</button></header><div class="j-body"><nav>${list}</nav><section>${detail}</section></div><footer>J · close</footer>`;
  }

  /** Per frame: tracker text, the compass and NPC head markers. */
  update(player?: THREE.Vector3) {
    if (player) {
      this.pickTarget(player);
      this.updateCompass(player);
      this.updateWaypoint(player);
    }
    if (this.dirty) {
      this.dirty = false;
      const act = this.quests.active();
      const tracked = act.find((q) => q.id === this.quests.tracked) ?? act[0];
      const others = act.filter((q) => q !== tracked).slice(0, 2);
      let html = '';
      if (tracked) {
        const lines = this.quests.lines(tracked.id);
        html += `<span class="q-kicker ${tracked.main ? 'q-mainq' : tracked.contract ? 'q-contract' : 'q-side'}">${tracked.main ? 'MAIN QUEST' : tracked.contract ? 'GUILD CONTRACT' : 'SIDE QUEST'}</span><b>${esc(tracked.title.toUpperCase())}</b>` +
          lines.map(([t, p, n]) => `<small class="${p >= n ? 'q-done' : ''}">${p >= n ? '✔' : '◇'} ${esc(t)}${n > 1 ? ` · ${p}/${n}` : ''}</small>`).join('');
      }
      if (others.length) html += `<small class="q-more">${others.map((q) => esc(q.title)).join(' · ')}${act.length > 3 ? ` · +${act.length - 3}` : ''} — J for journal</small>`;
      this.hud.sideQuestHtml = html;
    }
    // Markers over NPC heads.
    const seen = new Set<string>();
    for (const id of this.npcIds()) {
      const ind = this.quests.indicator(id);
      if (!ind) continue;
      const head = this.npcHead(id);
      if (!head) continue;
      const d = head.distanceTo(this.camera.position);
      this.tmp.copy(head).setY(head.y + 0.55).project(this.camera);
      if (d > 45 || this.tmp.z > 1 || Math.abs(this.tmp.x) > 1.05 || Math.abs(this.tmp.y) > 1.05) continue;
      seen.add(id);
      let el = this.marks.get(id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'quest-mark';
        document.getElementById('ui')!.appendChild(el);
        this.marks.set(id, el);
      }
      el.textContent = ind;
      el.classList.toggle('turnin', ind === '?');
      el.style.display = 'block';
      el.style.left = (this.tmp.x * 0.5 + 0.5) * window.innerWidth + 'px';
      el.style.top = (-this.tmp.y * 0.5 + 0.5) * window.innerHeight + 'px';
      el.style.fontSize = Math.max(14, 34 - d * 0.45) + 'px';
    }
    for (const [id, el] of this.marks) if (!seen.has(id)) el.style.display = 'none';
  }

  /** The compass strip: headings slide under a fixed centre; the tracked objective shows its distance. */
  private updateCompass(player: THREE.Vector3) {
    const HALF = (80 * Math.PI) / 180; // the strip shows 160 degrees
    this.camera.getWorldDirection(this.camDir);
    const heading = Math.atan2(this.camDir.x, this.camDir.z);
    const rel = (b: number) => Math.atan2(Math.sin(b - heading), Math.cos(b - heading));
    for (const t of this.cmpTicks) {
      const r = rel(t.bearing);
      const show = Math.abs(r) < HALF;
      t.el.style.display = show ? '' : 'none';
      if (show) t.el.style.left = `${50 - (r / HALF) * 50}%`;
    }
    const best = this.target;
    const bd = best?.d ?? Infinity;
    this.cmpTarget.style.display = best ? '' : 'none';
    if (!best) return;
    const r = rel(Math.atan2(best.x - player.x, best.z - player.z));
    const clamped = Math.max(-HALF, Math.min(HALF, r));
    this.cmpTarget.style.left = `${50 - (clamped / HALF) * 50}%`;
    const off = Math.abs(r) > HALF ? (r > 0 ? '◀ ' : '') : '';
    const offR = Math.abs(r) > HALF && r < 0 ? ' ▶' : '';
    const dist = bd < 1000 ? `${Math.round(bd)} m` : `${(bd / 1000).toFixed(1)} km`;
    this.cmpTarget.innerHTML = `<b>◆</b><span>${off}${bd < 6 ? 'here' : dist}${offR}</span>`;
    this.cmpTarget.title = best.label;
  }

  /** The tracked quest's nearest unfinished objective. */
  private pickTarget(player: THREE.Vector3) {
    const tracked = this.quests.tracked ?? this.quests.active()[0]?.id;
    let best: QuestUI['target'] = null;
    for (const m of this.quests.markers()) {
      if (m.quest !== tracked) continue;
      const d = Math.hypot(m.x - player.x, m.z - player.z);
      if (!best || d < best.d) best = { x: m.x, z: m.z, label: m.label, d };
    }
    this.target = best;
  }

  /** Beacon in the world, a marker over it on screen, and an arrow at the screen edge when it's behind or off to the side. */
  private updateWaypoint(player: THREE.Vector3) {
    const t = this.target;
    const show = this.visible && !!t && !this.open;
    if (this.beacon) {
      this.beacon.visible = show && t!.d > 6;
      if (this.beacon.visible) {
        this.beacon.position.set(t!.x, heightAt(t!.x, t!.z), t!.z);
        // Thicker with distance so it still reads from across the valley; fades out as you arrive.
        const s = THREE.MathUtils.clamp(t!.d / 60, 1, 5);
        this.beacon.scale.set(s, 1, s);
        this.beaconMat!.uniforms.uTime.value = performance.now() / 1000;
        this.beaconMat!.uniforms.uAlpha.value = THREE.MathUtils.smoothstep(t!.d, 6, 22) * 0.85;
      }
    }
    if (!show) {
      this.wp.style.display = 'none';
      return;
    }
    const y = Math.max(heightAt(t!.x, t!.z), player.y - 30) + 2.4;
    const p = this.wpPos.set(t!.x, y, t!.z).project(this.camera);
    const W = window.innerWidth, H = window.innerHeight;
    const behind = p.z > 1;
    let sx = p.x, sy = p.y;
    if (behind) (sx = -sx), (sy = -sy);
    const off = behind || Math.abs(sx) > 0.9 || Math.abs(sy) > 0.86;
    let px: number, py: number, ang = 0;
    if (off) {
      // Behind you: an arrow on the side of the screen you should turn toward.
      if (behind) (sx = sx < 0 ? -1 : 1), (sy = 0);
      // Pin to an inset ellipse round the screen edge, pointing outward (clear of the hotbar below).
      const a = Math.atan2(sy * H, sx * W);
      px = W / 2 + Math.cos(a) * (W / 2 - 70);
      py = H / 2 - Math.sin(a) * (Math.sin(a) < 0 ? H / 2 - 190 : H / 2 - 90);
      ang = -a;
    } else {
      px = (p.x * 0.5 + 0.5) * W;
      py = (-p.y * 0.5 + 0.5) * H;
    }
    this.wp.style.display = 'flex';
    this.wp.classList.toggle('off', off);
    this.wp.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
    (this.wp.firstElementChild as HTMLElement).style.transform = `rotate(${ang}rad)`;
    const d = t!.d;
    (this.wp.lastElementChild as HTMLElement).textContent = d < 6 ? 'here' : d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`;
    this.wp.title = t!.label;
  }

  setVisible(v: boolean) {
    this.visible = v;
    if (!v) this.wp.style.display = 'none';
    if (!v && this.beacon) this.beacon.visible = false;
    if (!v) for (const el of this.marks.values()) el.style.display = 'none';
    this.compass.style.display = v ? '' : 'none';
  }

  /** Force a tracker refresh (e.g. after inventory changes). */
  refresh() {
    this.dirty = true;
  }
}
