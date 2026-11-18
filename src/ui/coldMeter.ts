// The mountain cold (items/catalog/exposure.ts): a small frosted bar under the
// stamina bar, shown only while the cold has hold of you, with an arrow for
// which way it is going (closing in, or letting go by a fire).

export class ColdMeter {
  private el = document.createElement('div');
  private fill = document.createElement('i');
  private arrow = document.createElement('b');
  private shown = false;
  private last = '';

  constructor() {
    this.el.className = 'cold-meter';
    Object.assign(this.el.style, {
      position: 'fixed', right: '26px', top: '104px', width: '220px', height: '18px', zIndex: '30', pointerEvents: 'none',
      display: 'none', alignItems: 'center', gap: '8px', font: '600 11px Inter, sans-serif', letterSpacing: '0.12em', color: '#d8ecff',
      textShadow: '0 1px 2px #000a',
    } as CSSStyleDeclaration);
    const label = document.createElement('span');
    label.textContent = 'COLD';
    const bar = document.createElement('span');
    Object.assign(bar.style, { flex: '1', height: '7px', background: '#0b1622cc', border: '1px solid #8ab4d8', borderRadius: '4px', overflow: 'hidden', display: 'block' } as CSSStyleDeclaration);
    Object.assign(this.fill.style, { display: 'block', height: '100%', width: '0%', background: 'linear-gradient(90deg,#bfe4ff,#5aa0e8)', transition: 'width 0.2s linear' } as CSSStyleDeclaration);
    bar.append(this.fill);
    Object.assign(this.arrow.style, { width: '14px', textAlign: 'center' } as CSSStyleDeclaration);
    this.el.append(label, bar, this.arrow);
    document.body.append(this.el);
  }

  update(cold: number, rate: number) {
    const show = cold > 0.02;
    if (show !== this.shown) {
      this.shown = show;
      this.el.style.display = show ? 'flex' : 'none';
    }
    if (!show) return;
    const key = `${Math.round(cold * 100)}|${Math.sign(Math.round(rate * 1e4))}`;
    if (key === this.last) return;
    this.last = key;
    this.fill.style.width = `${Math.round(cold * 100)}%`;
    this.fill.style.background = cold >= 1 ? 'linear-gradient(90deg,#ffffff,#9ad0ff)' : 'linear-gradient(90deg,#bfe4ff,#5aa0e8)';
    this.arrow.textContent = rate > 0.0005 ? '▼' : rate < -0.0005 ? '▲' : '';
    this.arrow.style.color = rate > 0 ? '#9ad0ff' : '#ffb070';
  }
}
