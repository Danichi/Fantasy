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
}

const CSS = `
.helm{position:fixed;right:18px;top:96px;width:270px;padding:12px 14px;background:linear-gradient(180deg,rgba(18,28,52,.88),rgba(12,20,40,.9));border:1px solid #c9a55a;border-radius:10px;color:#efe3c2;font:12px Inter,sans-serif;box-shadow:0 6px 22px rgba(0,0,0,.45);pointer-events:none;display:none;z-index:30}
.helm h3{margin:0;font:700 15px Cinzel,serif;color:#f2d68a;letter-spacing:.04em}
.helm .sub{color:#b9b3a0;font-size:11px;margin-bottom:6px}
.helm .danger{float:right;font:600 10px Cinzel,serif;padding:2px 6px;border-radius:6px;border:1px solid}
.helm .row{display:flex;justify-content:space-between;align-items:center;margin:3px 0}
.helm .bar{height:6px;background:rgba(255,255,255,.12);border-radius:3px;overflow:hidden;flex:1;margin-left:8px}
.helm .bar i{display:block;height:100%;border-radius:3px}
.helm .rose{position:relative;width:86px;height:86px;border-radius:50%;border:2px solid #c9a55a;margin:6px auto;background:radial-gradient(circle,rgba(40,60,100,.6),rgba(10,18,36,.9))}
.helm .rose b{position:absolute;left:50%;top:50%;width:2px;height:36px;margin-left:-1px;transform-origin:50% 0}
.helm .rose .n{position:absolute;left:50%;top:2px;transform:translateX(-50%);font:700 10px Cinzel,serif;color:#f2d68a}
.helm .ship{position:absolute;left:50%;top:50%;width:10px;height:26px;margin:-13px 0 0 -5px;background:#efe3c2;clip-path:polygon(50% 0,100% 35%,85% 100%,15% 100%,0 35%)}
.helm .keys{margin-top:6px;color:#9a947f;font-size:10px;line-height:1.45}
.helm .warn{color:#ff8a6a;font-weight:600}
.helm .note{color:#bfe3f2;font-size:11.5px}
.breath{position:fixed;left:50%;bottom:150px;transform:translateX(-50%);width:220px;height:8px;border:1px solid #c9a55a;border-radius:4px;background:rgba(10,20,40,.7);display:none;z-index:30}
.breath i{display:block;height:100%;background:linear-gradient(90deg,#7ad8ff,#e8f8ff);border-radius:3px}
.underwater{position:fixed;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,rgba(20,90,110,.25),rgba(4,30,46,.72));opacity:0;transition:opacity .4s;z-index:5}
`;

const pct = (v: number) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
const barColor = (v: number) => (v > 0.6 ? '#6ad08a' : v > 0.3 ? '#e8c060' : '#e86a4a');
const DANGER_COLS = ['#7ad8a0', '#a8d870', '#e8d060', '#e8a040', '#e86a4a', '#c04ad0'];

export class SailingHud {
  private el: HTMLDivElement;
  private breathEl: HTMLDivElement;
  private water: HTMLDivElement;
  private t = 0;

  constructor(root: HTMLElement = document.getElementById('ui') ?? document.body) {
    if (!document.getElementById('helm-css')) {
      const st = document.createElement('style');
      st.id = 'helm-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.el = document.createElement('div');
    this.el.className = 'helm';
    this.breathEl = document.createElement('div');
    this.breathEl.className = 'breath';
    this.breathEl.innerHTML = '<i></i>';
    this.water = document.createElement('div');
    this.water.className = 'underwater';
    root.append(this.el, this.breathEl);
    document.body.appendChild(this.water);
  }

  hide() {
    this.el.style.display = 'none';
  }

  /** Breath (0..1) while diving; the screen goes blue-green under the water. */
  setBreath(breath: number, under: boolean) {
    this.breathEl.style.display = under || breath < 0.999 ? 'block' : 'none';
    (this.breathEl.firstChild as HTMLElement).style.width = pct(breath);
    (this.breathEl.firstChild as HTMLElement).style.background = breath < 0.25 ? '#e86a4a' : '';
    this.water.style.opacity = under ? '1' : '0';
  }

  update(dt: number, r: HelmReadout) {
    this.el.style.display = 'block';
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.12;
    const d = Math.min(5, Math.round(r.danger));
    const over = r.waves > r.rated;
    const sec = ['Bow', 'Mid', 'Stern'].map((n, i) => `<div class="row"><span>${n}</span><span class="bar"><i style="width:${pct(r.sections[i])};background:${barColor(r.sections[i])}"></i></span></div>`).join('');
    const gun = (s: number, label: string) => (r.guns ? `<span>${label} ${s <= 0 ? '<b style="color:#6ad08a">READY</b>' : s.toFixed(1) + 's'}</span>` : '');
    const deg = (a: number) => (a * 180) / Math.PI;
    this.el.innerHTML = `
      <span class="danger" style="color:${DANGER_COLS[d]};border-color:${DANGER_COLS[d]}">${r.dangerName}</span>
      <h3>${r.name}</h3>
      <div class="sub">${r.hull} · Seamanship ${r.level} <span class="bar" style="display:inline-block;width:60px;vertical-align:middle"><i style="width:${pct(r.xpFrac)};background:#c9a55a"></i></span></div>
      <div class="rose">
        <span class="n">N</span>
        <div class="ship" style="transform:rotate(${(180 - deg(r.heading)).toFixed(0)}deg)"></div>
        <b style="background:#7ad8ff;transform:rotate(${(180 - deg(r.heading) + deg(r.windRel) + 180).toFixed(0)}deg)"></b>
      </div>
      <div class="row"><span><b>${r.knots.toFixed(1)}</b> kn · ${r.point}</span><span>wind ${(r.windSpeed * 1.94).toFixed(0)} kn</span></div>
      <div class="row"><span>Trim ${r.assisted ? '(auto)' : ''}</span><span class="bar"><i style="width:${pct(r.trim)};background:${barColor(r.trim)}"></i></span></div>
      <div class="row"><span>Sail ${r.reefed ? '(reefed)' : ''}${r.anchored ? ' · at anchor' : ''}</span><span class="bar"><i style="width:${pct(r.sail)};background:#efe3c2"></i></span></div>
      <div class="row"><span>Canvas</span><span class="bar"><i style="width:${pct(r.sails)};background:${barColor(r.sails)}"></i></span></div>
      ${sec}
      <div class="row"><span class="${r.water > 0.4 ? 'warn' : ''}">Water in the hold</span><span class="bar"><i style="width:${pct(r.water)};background:#4a9ae8"></i></span></div>
      <div class="row"><span class="${over ? 'warn' : ''}">Waves ${r.waves.toFixed(1)} m / hull ${r.rated.toFixed(1)} m</span>${r.storm > 0.3 ? '<span class="warn">STORM</span>' : ''}</div>
      ${Math.abs(r.courseError) > 0.08 ? `<div class="row warn"><span>Thrown off course ${r.courseError > 0 ? '◀' : '▶'} ${deg(Math.abs(r.courseError)).toFixed(0)}°/s</span></div>` : ''}
      ${r.guns ? `<div class="row">${gun(r.reload[0], '◀ Port')}${gun(r.reload[1], 'Starboard ▶')}</div>` : ''}
      ${(r.notes ?? []).map((n) => `<div class="row note"><span>${n}</span></div>`).join('')}
      <div class="row"><span>Crew ${r.crew}${r.crewMin ? ' / ' + r.crewMin + ' needed' : ''}</span><span>Morale ${pct(r.morale)}</span></div>
      <div class="keys">${r.atHelm
        ? 'A/D helm · W/S sail · R reef · F anchor · C row · ' + (r.assisted ? 'G: full sailing' : 'Z/X trim · G: assisted') + (r.skiff ? ' · Shift lean out' : '') + (r.guns ? '<br>Left click: fire the broadside you face' : '') + (r.harpoon ? ' · Right click: harpoon' : '') + (r.extraKeys ? '<br>' + r.extraKeys : '') + '<br>E leave the helm' + (r.skiff ? '' : ' · L lash it') + ' · hold B spyglass'
        : 'On deck · E at the wheel to take the helm'}</div>`;
  }
}
