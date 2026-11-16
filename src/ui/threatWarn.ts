import * as THREE from 'three';
import { events } from '../core/events';

// The warning flash (docs/design/combat-flow.md, "Crowd flow"): a foe winding
// up a blow from outside your view lights the edge of the screen on its side,
// red and brief, so you can turn, dodge or step out without seeing it.

export class ThreatWarn {
  private el = document.createElement('div');
  private left = 0;
  private from = new THREE.Vector3();

  constructor(private viewDir: () => THREE.Vector3, private origin: () => THREE.Vector3) {
    this.el.className = 'threat-warn';
    Object.assign(this.el.style, {
      position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '40', opacity: '0', transition: 'opacity 0.08s linear',
    } as CSSStyleDeclaration);
    document.body.appendChild(this.el);
    events.on('threatBehind', ({ from, left }) => {
      this.from.copy(from);
      this.left = Math.min(0.9, Math.max(0.45, left + 0.2));
    });
  }

  update(dt: number) {
    if (this.left <= 0) {
      if (this.el.style.opacity !== '0') this.el.style.opacity = '0';
      return;
    }
    this.left -= dt;
    // Where it is, round you, against where you look: 0 ahead (top), π behind (bottom).
    const v = this.viewDir().clone().setY(0).normalize();
    const to = this.from.clone().sub(this.origin()).setY(0).normalize();
    const rel = Math.atan2(v.x * to.z - v.z * to.x, v.dot(to));
    const x = 50 + Math.sin(rel) * 50, y = 50 - Math.cos(rel) * 50;
    this.el.style.background = `radial-gradient(ellipse 38% 34% at ${x.toFixed(1)}% ${y.toFixed(1)}%, rgba(255,40,24,0.55), rgba(255,40,24,0.18) 45%, rgba(255,40,24,0) 72%)`;
    const pulse = 0.65 + 0.35 * Math.sin(this.left * 28);
    this.el.style.opacity = String(Math.min(1, this.left * 3) * pulse);
  }
}
