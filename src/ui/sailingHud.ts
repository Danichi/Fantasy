// The helm's instruments (docs/design/boating.md §5.9), in the navy-and-gold
// of the menus: the ship and the sea it's on, a compass rose with the wind,
// speed and point of sail, the trim telltales, sail, hull sections and water
// in the hold, the waves against what the hull can take, the guns, the crew.
// Plus a breath meter and an underwater tint when diving.

export interface HelmReadout {
  name: string;
  hull: string;
  danger: number;
  dangerName: string;
  heading: number; // rad (0 = +z, south on the map)
  windRel: number; // rad: wind direction relative to the bow
  windSpeed: number;
  knots: number;
  point: string;
  trim: number; // 0..1
  assisted: boolean;
  sail: number;
  reefed: boolean;
  anchored: boolean;
  sections: number[]; // 0..1
  sails: number; // 0..1
  water: number; // 0..1
  waves: number; // m
  rated: number; // m
  storm: number;
  guns: number;
  reload: [number, number]; // port, starboard (s; 0 = ready)
  harpoon: boolean;
  crew: number;
  crewMin: number;
  morale: number;
  courseError: number; // rad/s being kicked
  atHelm: boolean;
  level: number;
  xpFrac: number;
  /** extra lines: heading, bearing to the pin, the safe angle, surfing, a current, timers */
  notes?: string[];
  /** extra keys learned (Y windcaller, U full press, T shot) */
  extraKeys?: string;
  skiff?: boolean;
  rowboat?: boolean;
  order?: number;
  advanced?: boolean;
  units?: 'kmh' | 'knots';
  travelMode?: string;
  modeLabel?: string;
  destination?: string;
  warning?: string;
  target?: string;
  ammunition?: string;
  tether?: string;
  hints?: string;
}

const CSS = `
body:is([data-sea-travel="helm"],[data-sea-travel="rowing"],[data-sea-travel="swimming"],[data-sea-travel="diving"]) :is(.loadout-wrap,.quest-tracker,.hint,.book-button,.compass,.waypoint){display:none !important}
body:is([data-sea-travel="helm"],[data-sea-travel="rowing"],[data-sea-travel="swimming"],[data-sea-travel="diving"]) .sea-hud{bottom:16px}
body:is([data-sea-travel="helm"],[data-sea-travel="rowing"],[data-sea-travel="swimming"],[data-sea-travel="diving"]) .prompt{top:auto;bottom:calc(var(--sea-hud-height,220px) + 28px);z-index:45;max-width:calc(100vw - 40px);box-sizing:border-box}

.sea-hud{position:fixed;left:50%;bottom:94px;transform:translateX(-50%);width:min(760px,calc(100vw - 32px));box-sizing:border-box;color:#f5ead4;background:linear-gradient(135deg,rgba(13,31,43,.96),rgba(11,20,33,.93));border:1px solid #a48d60;border-top:3px solid #d4b875;border-radius:10px;padding:12px 18px;font:13px Inter,sans-serif;z-index:42;pointer-events:none;box-shadow:0 6px 28px #0008}
.sea-hud header{display:flex;align-items:center;justify-content:space-between;gap:12px}.sea-hud h3{font:600 17px Cinzel,serif;margin:0;color:#f7dfaa}.sea-hud .sea-mode{color:#a9c8cf;font-size:11px;text-transform:uppercase;letter-spacing:.12em}.sea-hud .sea-grid{display:flex;flex-wrap:wrap;gap:14px;margin:10px 0}.sea-hud .sea-stat{flex:1;min-width:75px}.sea-hud small{display:block;color:#b4c7ca;font-size:10px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px}.sea-hud strong{font-size:16px;font-weight:600}.sea-hud .sea-track{height:5px;margin-top:5px;background:#ffffff18;border-radius:3px;overflow:hidden}.sea-hud .sea-track i{display:block;height:100%;background:#76c8ac}.sea-hud .sea-route{color:#e8d29d}.sea-hud .sea-message{color:#97c3d0;margin-top:7px}.sea-hud .warn{color:#ffb18c}.sea-hud footer{border-top:1px solid #ffffff20;margin-top:9px;padding-top:8px;color:#c4d3d4;font-size:11px;line-height:1.6}.sea-hud kbd{font:600 10px Inter,sans-serif;color:#fff1cc;padding:2px 4px;border:1px solid #9d8c66;border-radius:3px}.sea-hud details{margin-top:8px;color:#b4c7ca}.sea-hud .sea-extra{display:flex;gap:12px;flex-wrap:wrap;font-size:11px;margin-top:8px}.sea-hud .sea-battery{position:fixed;left:50%;top:28%;transform:translateX(-50%);font-size:13px;color:#fff3d4;padding:5px 10px;background:#0c2030b8;border:1px solid #c9a55a;border-radius:4px}.sea-water{position:fixed;inset:0;pointer-events:none;opacity:0;transition:opacity .25s;background:radial-gradient(ellipse at center,rgba(20,90,110,.1),rgba(4,30,46,.6));z-index:5}
@media(max-height:500px){.sea-hud{bottom:48px;padding:6px 10px;font-size:11px;max-height:calc(100vh - 100px);overflow:hidden}.sea-hud .sea-grid{margin:5px 0}.sea-hud h3{font-size:13px}.sea-hud footer{margin-top:4px;padding-top:3px;line-height:1.3}.sea-hud .sea-extra{margin-top:4px}}
@media(max-width:800px){.sea-hud{bottom:82px;padding:10px 12px}.sea-hud strong{font-size:13px}.sea-hud .sea-grid{gap:8px}.sea-hud .sea-stat{min-width:60px}.sea-hud h3{font-size:14px}}
`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const pct = (n: number) => `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;
const track = (n: number) => `<div class="sea-track"><i style="width:${pct(n)};background:${n < 0.25 ? '#ef9b73' : '#76c8ac'}"></i></div>`;
const stat = (label: string, value: string, bar?: number) =>
  `<div class="sea-stat"><small>${label}</small><strong>${value}</strong>${bar === undefined ? '' : track(bar)}</div>`;
export class SailingHud {
  readonly el: HTMLDivElement;
  private water: HTMLDivElement;
  private air = 1;
  private under = false;
  private t = 0;
  constructor(root: HTMLElement = document.getElementById('ui') ?? document.body) {
    if (!document.getElementById('helm-css')) {
      const st = document.createElement('style');
      st.id = 'helm-css';
      st.textContent = CSS;
      document.head.append(st);
    }
    this.el = document.createElement('div');
    this.el.className = 'sea-hud helm';
    this.el.style.display = 'none';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-label', 'Sailing and swimming');
    this.water = document.createElement('div');
    this.water.className = 'sea-water';
    root.append(this.el);
    document.body.append(this.water);
    new ResizeObserver(() => document.body.style.setProperty('--sea-hud-height', `${this.el.getBoundingClientRect().height}px`)).observe(
      this.el,
    );
  }
  hide() {
    this.el.style.display = 'none';
    delete document.body.dataset.seaTravel;
    this.t = 0;
  }
  setBreath(breath: number, under: boolean) {
    this.air = breath;
    this.under = under;
    this.water.style.opacity = under ? '1' : '0';
  }
  swim(stamina: number, depth: number, fast: boolean, nearBoat: boolean, hints: string) {
    this.el.style.display = 'block';
    this.el.dataset.mode = this.under ? 'diving' : 'swimming';
    document.body.dataset.seaTravel = this.el.dataset.mode;
    this.el.innerHTML = `<header><h3>${this.under ? 'Below the surface' : fast ? 'Swimming fast' : 'Swimming'}</h3><span class="sea-mode">${this.under ? depth.toFixed(1) + ' m deep' : 'Surface water'}</span></header><div class="sea-grid">${stat('Stamina', pct(stamina), stamina)}${stat('Breath', pct(this.air), this.air)}</div><div class="sea-message ${this.air < 0.3 || stamina < 0.15 ? 'warn' : ''}">${this.air < 0.3 ? 'Air is running low — rise to the surface.' : stamina < 0.15 ? 'Rest at the surface or climb aboard.' : nearBoat ? 'A boat is nearby. Swim to its side to climb aboard.' : 'Rest at the surface to recover. Look for a ladder or a shallow shore.'}</div><footer>${hints}</footer>`;
  }
  update(dt: number, r: HelmReadout) {
    this.el.style.display = 'block';
    this.el.dataset.mode = r.travelMode ?? (r.atHelm ? 'helm' : 'deck');
    document.body.dataset.seaTravel = this.el.dataset.mode;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.1;
    const speed = r.knots / 1.94;
    const heading = (((180 - (r.heading * 180) / Math.PI) % 360) + 360) % 360;
    const compass = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(heading / 45) % 8];
    const windFrom = (((r.windRel * 180) / Math.PI + 540) % 360) - 180;
    const hull = r.sections.reduce((a, b) => a + b, 0) / 3;
    const sail = r.rowboat
      ? (r.order ?? 0) < 0.05
        ? 'Stopped'
        : 'Rowing'
      : r.anchored
        ? 'Stopped · anchored'
        : r.reefed
          ? 'Reefed'
          : (r.order ?? r.sail) < 0.05
            ? 'Stopped'
            : (r.order ?? r.sail) < 0.38
              ? 'Slow'
              : (r.order ?? r.sail) < 0.8
                ? 'Half'
                : 'Full';
    const wind = r.rowboat
      ? 'Oars'
      : r.point === 'In irons'
        ? 'Ahead — turn to catch it'
        : Math.abs(windFrom) < 45
          ? 'From behind'
          : windFrom < 0
            ? 'From the left'
            : 'From the right';
    this.el.innerHTML = `<header><div><span class="sea-mode">${esc(r.modeLabel ?? (r.atHelm ? 'At the helm' : 'On deck'))} · ${r.assisted ? 'Assisted' : 'Advanced'}</span><h3>${esc(r.name)}</h3></div><span class="sea-mode">${esc(r.dangerName)}</span></header><div class="sea-grid">${stat('Speed', `${(r.units === 'knots' ? r.knots : speed * 3.6).toFixed(1)} ${r.units === 'knots' ? 'kn' : 'km/h'}`)}${stat('Heading', `${compass} · ${Math.round(heading)}°`)}${stat(r.rowboat ? 'Oars' : 'Sails', sail)}${stat('Hull', hull > 0.7 ? 'Good' : hull > 0.35 ? 'Damaged' : 'Critical', hull)}${stat('Wind', `<span aria-hidden="true" style="display:inline-block;transform:rotate(${windFrom.toFixed(0)}deg)">↑</span> ${esc(wind)}`)}</div><div class="sea-route">${esc(r.destination ?? 'P: choose a destination or a voyage')}</div>${r.warning ? `<div class="sea-message warn">${esc(r.warning)}</div>` : ''}${r.guns ? `<div class="sea-extra"><span>◀ Left battery ${r.reload[0] <= 0 ? 'READY' : Math.ceil(r.reload[0]) + 's'}</span><span>Right battery ▶ ${r.reload[1] <= 0 ? 'READY' : Math.ceil(r.reload[1]) + 's'}</span><span>${esc(r.ammunition ?? 'Round shot')} · ${esc(r.target ?? 'Look along a side to aim')}</span></div>` : ''}${r.tether ? `<div class="sea-message">${esc(r.tether)}</div>` : ''}${r.advanced ? `<div class="sea-extra"><span>${esc(r.point)} · trim ${pct(r.trim)}</span><span>Wind ${(r.windSpeed * 3.6).toFixed(0)} km/h · waves ${r.waves.toFixed(1)} m / rating ${r.rated.toFixed(1)} m</span><span>Flooding ${pct(r.water)} · crew ${r.crew}/${r.crewMin} · morale ${pct(r.morale)}</span><span>Bow ${pct(r.sections[0])} · middle ${pct(r.sections[1])} · stern ${pct(r.sections[2])}</span></div>` : ''}${r.advanced && r.notes?.length ? `<div class="sea-extra">${r.notes.map(esc).join(' · ')}</div>` : ''}<footer>${r.hints ?? 'W/S speed · A/D steer · E leave helm · P ship & navigation'}</footer>`;
  }
}
