import { BRANCHES, SEA_NODES, canBuy, seaPoints, spentPoints } from '../world/sea/seamanship';

// The Seamanship screen (N, and a page of the book): the calling's seven
// branches side by side, each node with its ranks, the level that opens it and
// what it does; click to learn. Styled like the Skills screen (it borrows its
// .sk frame) in the navy and gold of the menus.

export interface SeamanshipSource {
  level: number;
  xpFrac: number;
  picks: Record<string, number>;
  stats: { metres: number; pirates: number; monsters: number; storms: number };
  learn(id: string): string | null;
}

const CSS = `
.sea-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:10px;padding:14px 16px;overflow:auto;flex:1;min-height:0}
.sea-col{display:flex;flex-direction:column;gap:7px;min-width:0}
.sea-col h3{margin:0;font:700 14px Cinzel,serif;color:#f2d68a;letter-spacing:.04em}
.sea-col .blurb{font-size:11px;color:#968f80;min-height:44px;line-height:1.35}
.sea-node{position:relative;padding:8px 9px;border:1px solid #363f55;border-radius:4px;background:linear-gradient(180deg,#1b2130,#141925);cursor:pointer;transition:border-color .15s,transform .1s}
.sea-node:hover{border-color:#d9b15a;transform:translateY(-1px)}
.sea-node.locked{opacity:.5;cursor:default}
.sea-node.locked:hover{transform:none;border-color:#363f55}
.sea-node.have{border-color:#8fbf6a;background:linear-gradient(180deg,#1f2b24,#151d19)}
.sea-node.cap{border-color:#b08a3a}
.sea-node b{display:block;font:600 12.5px Inter,sans-serif;color:#ece5d3}
.sea-node .req{position:absolute;right:7px;top:7px;font:600 10px Inter,sans-serif;color:#d9b15a}
.sea-node p{margin:3px 0 0;font-size:11px;line-height:1.35;color:#b9b3a0}
.sea-node .pips{margin-top:4px;display:flex;gap:3px}
.sea-node .pips i{width:9px;height:9px;border-radius:50%;border:1px solid #d9b15a}
.sea-node .pips i.on{background:#d9b15a}
.sea-node .why{margin-top:3px;font-size:10px;color:#d8574a}
.sea-foot{padding:8px 18px 14px;color:#968f80;font-size:12px;display:flex;gap:22px;flex-wrap:wrap}
.sea-foot b{color:#ece5d3}
.sea-msg{color:#f6dc9a}
`;

export class SeamanshipPanel {
  open = false;
  onToggle?: (open: boolean) => void;
  private el: HTMLDivElement;
  private backdrop: HTMLDivElement;
  private grid: HTMLDivElement;
  private foot: HTMLDivElement;
  private msg = '';

  constructor(private src: () => SeamanshipSource) {
    if (!document.getElementById('sea-css')) {
      const st = document.createElement('style');
      st.id = 'sea-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    const root = document.getElementById('ui') ?? document.body;
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'sk-backdrop hidden';
    this.backdrop.addEventListener('click', () => this.toggle(false));
    this.el = document.createElement('div');
    this.el.className = 'sk sea hidden';
    this.el.innerHTML = `
      <div class="sk-top">
        <div class="sk-title"><div class="sk-crumb">THE CALLING OF THE SEA</div><h2>Seamanship</h2></div>
        <div class="sk-purse">
          <div class="sk-coin xp"><span class="v" data-k="pts">0</span><span class="l">Points to spend</span></div>
          <div class="sk-coin"><span class="v" data-k="lv">1</span><span class="l">Seamanship</span></div>
          <button class="sk-close" type="button" aria-label="Close">✕</button>
        </div>
      </div>
      <div class="sea-grid"></div>
      <div class="sea-foot"></div>`;
    root.append(this.backdrop, this.el);
    this.grid = this.el.querySelector('.sea-grid')!;
    this.foot = this.el.querySelector('.sea-foot')!;
    this.el.querySelector('.sk-close')!.addEventListener('click', () => this.toggle(false));
    this.grid.addEventListener('click', (e) => {
      const n = (e.target as HTMLElement).closest<HTMLElement>('[data-node]');
      if (!n) return;
      const err = this.src().learn(n.dataset.node!);
      this.msg = err ? err : `Learned: ${SEA_NODES.find((x) => x.id === n.dataset.node)?.name}`;
      this.render();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.open || e.code !== 'Escape') return;
      e.stopImmediatePropagation();
      this.toggle(false);
    });
  }

  toggle(force?: boolean) {
    const next = force ?? !this.open;
    if (next === this.open) return;
    this.open = next;
    this.el.classList.toggle('hidden', !next);
    this.backdrop.classList.toggle('hidden', !next);
    this.msg = '';
    if (next) this.render();
    this.onToggle?.(next);
  }

  render() {
    const s = this.src();
    const free = seaPoints(s.level) - spentPoints(s.picks);
    (this.el.querySelector('[data-k="pts"]') as HTMLElement).textContent = String(free);
    (this.el.querySelector('[data-k="lv"]') as HTMLElement).textContent = String(s.level);
    this.grid.innerHTML = BRANCHES.map((b) => {
      const nodes = SEA_NODES.filter((n) => n.branch === b.id).map((n) => {
        const have = s.picks[n.id] ?? 0;
        const why = canBuy(n.id, s.picks, s.level);
        const locked = !!why && why !== 'Mastered' && have === 0;
        return `<div class="sea-node${have ? ' have' : ''}${locked ? ' locked' : ''}${n.capstone ? ' cap' : ''}" data-node="${n.id}">
          <span class="req">${n.capstone ? '★ ' : ''}${n.level}</span>
          <b>${n.name}</b>
          <p>${n.desc}</p>
          <div class="pips">${Array.from({ length: n.ranks }, (_, i) => `<i class="${i < have ? 'on' : ''}"></i>`).join('')}</div>
          ${why && why !== 'Mastered' ? `<div class="why">${why}${n.cost > 1 ? ` · ${n.cost} points` : ''}</div>` : ''}
        </div>`;
      }).join('');
      return `<div class="sea-col"><h3>${b.name}</h3><div class="blurb">${b.blurb}</div>${nodes}</div>`;
    }).join('');
    const st = s.stats;
    this.foot.innerHTML = `<span>Next level <b>${Math.round(s.xpFrac * 100)}%</b></span><span>Sailed <b>${(st.metres / 1000).toFixed(1)} km</b></span><span>Storms weathered <b>${st.storms}</b></span><span>Pirates beaten <b>${st.pirates}</b></span><span>Monsters slain <b>${st.monsters}</b></span>${this.msg ? `<span class="sea-msg">${this.msg}</span>` : ''}`;
  }
}
