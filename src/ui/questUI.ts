import * as THREE from 'three';
import type { QuestDef, QuestLog } from '../quests/questLog';
import type { HUD } from './hud';
import { heightAt } from '../world/terrainHeight';
import { ITEMS } from '../items/itemDefs';
import { iconFor } from './icons';
import './journal.css';

// Quest presentation (World Expansion §46): side quests under the main quest
// in the HUD tracker, a journal (J) with active and completed quests, gold
// ❗ / ❓ markers over the heads of NPCs with something for you, and a compass
// strip at the top of the screen pointing to the tracked quest's next step.
// The journal is shelved (Main Story / Side Quests / Contracts / Completed):
// a card per quest with its progress, and a page that leads with what to do
// now and what it pays; the summary and the stage-by-stage log fold away.

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

type Shelf = 'main' | 'side' | 'contract' | 'done';
const svg = (body: string) => `<svg viewBox="0 0 32 32" aria-hidden="true">${body}</svg>`;
/** The crest on each shelf's tab, card and page. */
const CREST: Record<Shelf | 'story', string> = {
  // a sun-crown
  main: svg('<circle cx="16" cy="18" r="6.5"/><path d="M16 3l2 6h-4zM5 9l5 4-3 2zM27 9l-5 4 3 2zM3 20h6v2H3zM23 20h6v2h-6zM8 27h16v2H8z"/>'),
  // a scroll
  side: svg('<path d="M8 5h15a4 4 0 0 1 0 8h-2v12a4 4 0 0 1-4 4H8a4 4 0 0 1 0-8h2V9a4 4 0 0 0-2-4z"/><path d="M13 13h6M13 17h6M13 21h4" class="ln"/>'),
  // a guild shield
  contract: svg('<path d="M16 3l11 4v8c0 7-5 12-11 14C10 27 5 22 5 15V7z"/><path d="M16 9v14M10 14h12" class="ln"/>'),
  // a wax seal with a tick
  done: svg('<circle cx="16" cy="16" r="12"/><path d="M10 16l4 4 8-9" class="ln"/>'),
  // an open book
  story: svg('<path d="M4 7c4-1.5 8-1 12 1.5C20 6 24 5.5 28 7v18c-4-1.5-8-1-12 1.5C12 24 8 23.5 4 25z"/><path d="M16 8.5v18" class="ln"/>'),
};
const EMPTY: Record<Shelf, string> = {
  main: 'The story will find you.',
  side: 'No side quests. Townsfolk with a gold ❗ over their heads have work for you.',
  contract: 'No guild contracts. The Adventurer\'s Guild board has them.',
  done: 'Nothing finished yet.',
};

export class QuestUI {
  open = false;
  onToggle?: (open: boolean) => void;
  readonly journal: HTMLDivElement;
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
  /** the main story's recap ("The Story So Far", top of the journal) */
  storyRecap?: () => string;
  /** "Show on map" in the journal */
  onShowOnMap?: (x: number, z: number) => void;
  /** an NPC id's name (the quest giver on cards and pages) */
  giverName?: (id: string) => string | undefined;
  /** the journal's shelf, and whether the player picked it (else it follows the selection) */
  private cat: Shelf = 'main';
  private catPicked = false;

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
      const t0 = e.target as HTMLElement;
      const cat = t0.closest('[data-cat]') as HTMLElement | null;
      if (cat) {
        this.cat = cat.dataset.cat as Shelf;
        this.catPicked = true;
        // Show the first quest on that shelf.
        const first = this.cat === 'done' ? this.quests.completed().slice(-1)[0] : this.quests.active().find((q) => (this.cat === 'main' ? q.main : this.cat === 'contract' ? q.contract && !q.main : !q.main && !q.contract));
        this.selected = first?.id ?? (this.cat === 'main' && this.storyRecap ? '__story' : null);
        this.render();
        return;
      }
      const pick = t0.closest('[data-quest]') as HTMLElement | null;
      if (pick) {
        this.selected = pick.dataset.quest!;
        this.render();
      }
      // (Buttons hold an icon glyph; act on the button, not the glyph clicked.)
      const t = (t0.closest('[data-track],[data-map],[data-close]') as HTMLElement | null) ?? t0;
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
      this.catPicked = false; // open on the shelf of what's selected
      this.render();
    }
    this.onToggle?.(open);
  }

  /** Which shelf of the journal a quest sits on. */
  private catOf(q: QuestDef): 'main' | 'side' | 'contract' {
    return q.main ? 'main' : q.contract ? 'contract' : 'side';
  }

  /** How far along a quest is, 0..1: its stages, and the objectives of the current one. */
  private progressOf(q: QuestDef) {
    const st = this.quests.state[q.id];
    if (!st) return 0;
    if (st.status === 'done') return 1;
    const lines = this.quests.lines(q.id).filter(([t]) => !t.startsWith('Optional: '));
    const inStage = lines.length ? lines.reduce((a, [, p, n]) => a + Math.min(1, p / Math.max(1, n)), 0) / lines.length : 0;
    return Math.min(1, (st.stage + inStage) / Math.max(1, q.stages.length));
  }

  private regionName(r: string) {
    return r === 'cresha' ? 'Elder Glen' : r;
  }

  private render() {
    const active = this.quests.active();
    const done = this.quests.completed();
    // Open on the shelf of whatever's selected.
    const selQ = this.selected && this.selected !== '__story' ? this.quests.defs.get(this.selected) ?? null : null;
    if (!this.catPicked && selQ) this.cat = this.quests.state[selQ.id]?.status === 'done' ? 'done' : this.catOf(selQ);
    this.catPicked = true;
    const shelves = {
      main: active.filter((q) => q.main),
      side: active.filter((q) => !q.main && !q.contract),
      contract: active.filter((q) => q.contract),
      done: done.slice().reverse(),
    };
    const tabs = ([['main', 'Main Story'], ['side', 'Side Quests'], ['contract', 'Contracts'], ['done', 'Completed']] as const)
      .map(([k, label]) => `<button class="jq-tab cat-${k} ${this.cat === k ? 'on' : ''}" data-cat="${k}">${CREST[k]}<span>${label}</span><em>${shelves[k].length}</em></button>`).join('');
    const card = (q: QuestDef) => {
      const st = this.quests.state[q.id];
      const isDone = st?.status === 'done';
      const pct = Math.round(this.progressOf(q) * 100);
      const giver = this.giverName?.(q.giver);
      const tracked = this.quests.tracked === q.id && !isDone;
      return `<button class="jq-card cat-${this.catOf(q)} ${this.selected === q.id ? 'sel' : ''} ${tracked ? 'tracked' : ''} ${isDone ? 'done' : ''}" data-quest="${q.id}">
        <i class="jq-crest">${isDone ? CREST.done : CREST[this.catOf(q)]}</i>
        <span class="jq-mid"><b>${esc(q.title)}</b><small>${esc(this.regionName(q.region))}${giver ? ` · ${esc(giver)}` : ''}</small>
        ${isDone ? '' : `<span class="jq-prog"><i style="width:${pct}%"></i></span>`}</span>
        ${tracked ? '<span class="jq-pin" title="Tracked">◆</span>' : ''}</button>`;
    };
    const list = shelves[this.cat];
    let nav = '';
    if (this.cat === 'main' && this.storyRecap) nav += `<button class="jq-card story ${this.selected === '__story' ? 'sel' : ''}" data-quest="__story"><i class="jq-crest">${CREST.story}</i><span class="jq-mid"><b>The Story So Far</b><small>Everything that has happened to you</small></span></button>`;
    // Between chapters, the main shelf says who has the story's next step.
    const leads = this.cat === 'main' && !list.length ? this.quests.leads() : [];
    nav += list.length ? list.map(card).join('')
      : leads.length ? leads.map((l) => `<p class="jq-empty">Next chapter: <b>${esc(l.quest.title)}</b>. Speak with ${esc(l.name)}.</p>`).join('')
      : `<p class="jq-empty">${EMPTY[this.cat]}</p>`;

    let detail = `<div class="jq-blank">${CREST.story}<p>Pick a quest from the list.</p></div>`;
    if (this.selected === '__story' && this.storyRecap) detail = `<div class="jq-recap">${this.storyRecap()}</div>`;
    if (selQ) detail = this.detail(selQ);
    const tracked = active.find((x) => x.id === this.quests.tracked);
    this.journal.innerHTML = `<header><span>JOURNAL</span><div class="jq-sum"><b>${active.length}</b> active · <b>${done.length}</b> completed${tracked ? ` · tracking <i>${esc(tracked.title)}</i>` : ''}</div><button data-close>✕</button></header>
      <div class="jq-tabs">${tabs}</div>
      <div class="j-body"><nav>${nav}</nav><section>${detail}</section></div><footer><span>Click a quest to read it · Track one to follow its beacon</span><span>J · close</span></footer>`;
  }

  /** One quest's page: what to do now, what it pays, and the story so far tucked away below. */
  private detail(q: QuestDef) {
    const st = this.quests.state[q.id];
    const isDone = st?.status === 'done';
    const cat = this.catOf(q);
    const giver = this.giverName?.(q.giver);
    const stageN = q.stages.length;
    const cur = st ? Math.min(st.stage, stageN - 1) : 0;
    const kicker = `${cat === 'main' ? 'MAIN QUEST' : cat === 'contract' ? 'GUILD CONTRACT' : 'SIDE QUEST'} · ${isDone ? 'COMPLETED' : 'IN PROGRESS'}`;
    const initial = giver ? giver.replace(/^(Elder|Magus|Master|Ser|Sister|Brother|Captain|Lady|Lord|Old)\s+/, '').charAt(0) : '';
    const chips = [
      giver ? `<span class="jq-chip giver"><i>${esc(initial)}</i>${esc(giver)}</span>` : '',
      `<span class="jq-chip">⌖ ${esc(this.regionName(q.region))}</span>`,
      isDone ? '<span class="jq-chip ok">✔ Done</span>' : `<span class="jq-chip">Step ${cur + 1} of ${stageN}</span>`,
    ].join('');
    const steps = `<div class="jq-steps">${q.stages.map((_s, i) => `<i class="${isDone || i < cur ? 'past' : i === cur ? 'now' : ''}"></i>`).join('')}</div>`;
    // What to do now.
    let now = '';
    if (!isDone && st) {
      const objs = this.quests.lines(q.id).map(([t, p, n]) => {
        const opt = t.startsWith('Optional: ');
        const alt = /^(Either|Or): /.exec(t);
        const text = t.replace(/^(Optional|Either|Or): /, '');
        const ok = p >= n;
        return `<li class="${ok ? 'ok' : ''} ${opt ? 'opt' : ''}"><i class="jq-box">${ok ? '✔' : ''}</i><div><span>${alt ? `<em class="jq-tag">${alt[1]}</em>` : ''}${opt ? '<em class="jq-tag opt">Optional</em>' : ''}${esc(text)}</span>${n > 1 ? `<div class="jq-obar"><i style="width:${Math.min(100, (p / n) * 100)}%"></i><b>${Math.min(p, n)} / ${n}</b></div>` : ''}</div></li>`;
      }).join('');
      now = `<div class="jq-now"><h4>Now</h4><p class="jq-note">${esc(this.quests.note(q, cur))}</p>${objs ? `<ul class="jq-objs">${objs}</ul>` : ''}
        ${this.quests.awayNotes(q.id).map((n) => `<p class="j-away">☾ ${esc(n)}</p>`).join('')}</div>`;
    } else if (isDone) {
      now = `<blockquote class="jq-done-line">“${esc(this.quests.doneFor(q))}”${giver ? `<cite>${esc(giver)}</cite>` : ''}</blockquote>`;
    }
    // Rewards as chips.
    const r = q.rewards;
    const rew = [
      r.gold ? `<span class="jq-rw gold"><i>●</i>${r.gold} gold</span>` : '',
      r.xp ? `<span class="jq-rw xp"><i>✦</i>${r.xp} XP</span>` : '',
      r.guildRep ? `<span class="jq-rw rep"><i>⚑</i>${r.guildRep} guild rep</span>` : '',
      ...(r.items ?? []).map(([id, n]) => {
        const d = ITEMS[id];
        const ic = d ? iconFor(id) : '';
        return `<span class="jq-rw item r-${d?.rarity ?? 'common'}"><i class="ic">${ic ? `<img src="${ic}" alt="">` : '◆'}</i>${esc(d?.name ?? id)}${n > 1 ? ` ×${n}` : ''}</span>`;
      }),
    ].join('');
    // The story of it so far, folded away.
    const last = isDone ? stageN - 1 : cur;
    const shown = st ? q.stages.map((s, i) => ({ i, when: s.when })).filter((x) => x.i <= last && (!x.when || this.quests.test(q.id, x.when) || x.i === cur)) : [];
    const log = shown.map(({ i }) => `<div class="${isDone || i < cur ? 'past' : 'now'}"><b>${i + 1}</b><span>${esc(this.quests.note(q, i))}</span></div>`).join('');
    const actions = st?.status === 'active'
      ? `<div class="jq-actions">${this.quests.tracked !== q.id ? `<button class="jq-btn primary" data-track="${q.id}">◆ Track this quest</button>` : '<span class="jq-tracking">◆ Tracking</span>'}${this.quests.markers().some((m) => m.quest === q.id) ? `<button class="jq-btn" data-map="${q.id}">⌖ Show on map</button>` : ''}</div>`
      : '';
    return `<div class="jq-page cat-${cat} ${isDone ? 'is-done' : ''}">
      <div class="jq-head"><div class="jq-seal">${isDone ? CREST.done : CREST[cat]}</div><div class="jq-head-txt"><div class="jq-kicker">${kicker}</div><h2>${esc(q.title)}</h2><div class="jq-meta">${chips}</div></div></div>
      ${steps}${actions}${now}
      ${rew ? `<div class="jq-rewards"><h4>Rewards</h4><div>${rew}</div></div>` : ''}
      ${this.choices(q)}
      <details class="jq-more" ${isDone ? 'open' : ''}><summary>About this quest</summary><p>${esc(q.summary)}</p></details>
      ${log ? `<details class="jq-more"><summary>Journal entries · ${shown.length}</summary><div class="jq-log">${log}</div></details>` : ''}
    </div>`;
  }

  /** The decisions you made and the extra things you did, in this quest. */
  private choices(q: QuestDef) {
    const flags = this.quests.state[q.id]?.flags;
    if (!flags) return '';
    const out: string[] = [];
    for (const stg of q.stages) for (const o of stg.objectives) {
      if (o.type === 'choose' && flags[o.key]) {
        const pick = o.options.find((c) => c.id === flags[o.key]);
        if (pick) out.push(`You chose: ${pick.label.replace(/^\(|\)$/g, '')}`);
      } else if (o.flag && flags[o.flag] && (o.optional || o.group)) out.push(`You did: ${o.text}`);
    }
    return out.length ? `<div class="j-choices">${out.map((t) => `<div>✦ ${esc(t)}</div>`).join('')}</div>` : '';
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
      // Between chapters: who has the story's next step.
      const leads = this.quests.leads();
      if (leads.length) {
        html += `<span class="q-kicker q-mainq">MAIN QUEST · NEXT</span>` +
          leads.slice(0, 3).map((l) => `<b>${esc(l.quest.title.toUpperCase())}</b><small>◇ Speak with ${esc(l.name)}</small>`).join('');
      }
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

  /** Something urgent (a raid) overrides the tracked quest on the compass and in the world. */
  urgent: { x: number; z: number; label: string } | null = null;

  /** The tracked quest's nearest unfinished objective. */
  private pickTarget(player: THREE.Vector3) {
    if (this.urgent) {
      this.target = { ...this.urgent, d: Math.hypot(this.urgent.x - player.x, this.urgent.z - player.z) };
      return;
    }
    const lead = this.quests.leads()[0];
    const tracked = this.quests.tracked ?? this.quests.active()[0]?.id ?? (lead ? 'lead:' + lead.quest.id : undefined);
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
      this.beacon.visible = show && t!.d > 6 && !this.lost;
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

  /** A sandstorm: no compass and no waypoint; you navigate by the sun, if you can see it. */
  private lost = false;
  setLost(lost: boolean) {
    if (lost === this.lost) return;
    this.lost = lost;
    this.compass.classList.toggle('lost', lost);
    this.wp.classList.toggle('lost', lost);
    if (this.beacon) this.beacon.userData.lost = lost;
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
