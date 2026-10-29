import * as THREE from 'three';
import { targets } from './targets';
import { peekCombat } from './core';
import { director } from './ai';
import type { Player } from '../player/player';

// F9: the combat debug overlay (combat rework, phase 6). The player's action
// and its windows (blow, parry, i-frames, combo, cancel), the counter window,
// and for every enemy near: posture, poise, wind-up, the tell it armed, super
// armour, and who holds an attack turn. Blades and hurt capsules are drawn
// in the world.

export class CombatDebug {
  on = false;
  private el: HTMLPreElement;
  private lines: THREE.LineSegments;
  private pos = new Float32Array(6 * 400);

  constructor(scene: THREE.Scene, private player: Player) {
    this.el = document.createElement('pre');
    this.el.style.cssText = 'position:fixed;left:8px;top:120px;z-index:50;margin:0;padding:6px 8px;font:11px/1.35 monospace;color:#e8f0e0;background:rgba(0,0,0,0.6);pointer-events:none;display:none;white-space:pre';
    document.body.appendChild(this.el);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x40ff90, depthTest: false, transparent: true }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 999;
    this.lines.visible = false;
    scene.add(this.lines);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F9') this.toggle();
    });
  }

  toggle(on = !this.on) {
    this.on = on;
    this.el.style.display = on ? 'block' : 'none';
    this.lines.visible = on;
  }

  update() {
    if (!this.on) return;
    const p = this.player;
    const a = p.act;
    const f = (n?: number) => (n === undefined ? '-' : n.toFixed(2));
    const out: string[] = [];
    if (a) {
      const d = a.def;
      out.push(`ACT ${d.id}  t ${f(a.t)}/${f(d.dur)}  x${f(a.speed)}  tier ${a.tier}${a.perfect ? ' PERFECT' : ''}${a.connected ? '  hit' : ''}`);
      if (d.hit) out.push(`  blow ${f(d.hit.from)}-${f(d.hit.to)}  dmg ${f(d.hit.dmg)}  poise ${d.hit.poise}  ${d.dtype ?? p.weaponDmgType(d.hit.hand)}`);
      if (d.parry) out.push(`  parry ${f(d.parry[0])}-${f(d.parry[1])}`);
      if (d.iframes) out.push(`  i-frames ${f(d.iframes[0])}-${f(d.iframes[1])}`);
      if (d.combo) out.push(`  combo ${d.combo.next} @${f(d.combo.from)}${d.combo.heavy ? '  hold: ' + d.combo.heavy : ''}${d.combo.delayed ? '  late: ' + d.combo.delayed : ''}`);
      out.push(`  cancel ${f(d.cancel)}`);
    } else out.push('ACT -');
    out.push(`counter ${f(p.counterT)}  stamina ${Math.round(p.stamina)}  load ${p.loadClass}  turns ${director.busy}/${director.capacity}`);
    let n = 0;
    const seg = (a1: THREE.Vector3, b1: THREE.Vector3) => {
      if (n >= 400) return;
      this.pos.set([a1.x, a1.y, a1.z, b1.x, b1.y, b1.z], n * 6);
      n++;
    };
    const near = [...targets].filter((t) => t.alive && t.position.distanceTo(p.pos) < 18).sort((x, y) => x.position.distanceTo(p.pos) - y.position.distanceTo(p.pos));
    for (const t of near.slice(0, 8)) {
      const s = peekCombat(t);
      const tag = t === p.lock ? '>' : ' ';
      out.push(`${tag}${t.kind.padEnd(12)} hp ${Math.round(t.hp)}/${t.maxHp}` + (s ? `  post ${Math.round(s.posture)}/${s.postureMax}${s.broken ? ' BROKEN ' + f(s.brokenT) : ''}  poise ${Math.round(s.poise)}/${s.poiseMax}${s.windupT > 0 ? '  windup ' + s.windupKind + ' ' + f(s.windupT) : ''}${s.armedT > 0 ? '  armed ' + s.armedKind : ''}${s.superArmour ? '  ARMOUR' : ''}${director.holds(t) ? '  TURN' : ''}` : ''));
      // Hurt capsule: a vertical line and a ring of four ticks.
      const h = t.halfHeight ?? 0;
      seg(new THREE.Vector3(t.center.x, t.center.y - h - t.radius, t.center.z), new THREE.Vector3(t.center.x, t.center.y + h + t.radius, t.center.z));
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * Math.PI * 2, ang2 = ((i + 1) / 4) * Math.PI * 2;
        seg(new THREE.Vector3(t.center.x + Math.cos(ang) * t.radius, t.center.y, t.center.z + Math.sin(ang) * t.radius), new THREE.Vector3(t.center.x + Math.cos(ang2) * t.radius, t.center.y, t.center.z + Math.sin(ang2) * t.radius));
      }
    }
    // The player's blades.
    for (const slot of ['main', 'off'] as const) {
      const m = p.equip?.model(slot);
      if (!m || m.userData.bladeTip === undefined) continue;
      const b0 = m.localToWorld(new THREE.Vector3(0, m.userData.bladeBase, 0)), b1 = m.localToWorld(new THREE.Vector3(0, m.userData.bladeTip, 0));
      seg(b0, b1);
    }
    const g = this.lines.geometry;
    g.setDrawRange(0, n * 2);
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.el.textContent = out.join('\n');
  }
}
