import * as THREE from 'three';

// Procedural magic circles (runes drawn on a canvas) and expanding shockwave
// rings. Both are additive, emissive-bright planes that fade over their life.

export type Style = 'fire' | 'light' | 'gale' | 'wind' | 'frost' | 'steel' | 'shadow' | 'blood';
/** which rune figure each style draws: hexagram (fire) or eight-point star (light) */
const FIGURE: Record<Style, 'fire' | 'light'> = { fire: 'fire', blood: 'fire', light: 'light', gale: 'light', wind: 'light', frost: 'light', steel: 'fire', shadow: 'fire' };

function drawCircle(style: 'fire' | 'light') {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.translate(S / 2, S / 2);
  g.strokeStyle = g.fillStyle = '#ffffff';
  g.lineCap = 'round';
  const ring = (r: number, w: number) => {
    g.lineWidth = w;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.stroke();
  };
  ring(240, 6);
  ring(222, 2.5);
  ring(150, 4);
  ring(96, 2);
  // Rune band between the outer rings.
  const glyphs = 28;
  for (let i = 0; i < glyphs; i++) {
    g.save();
    g.rotate((i / glyphs) * Math.PI * 2);
    g.translate(0, -186);
    g.lineWidth = 3;
    g.beginPath();
    const k = (i * 7) % 5;
    if (k === 0) { g.moveTo(-9, -12); g.lineTo(0, 12); g.lineTo(9, -12); }
    else if (k === 1) { g.moveTo(0, -13); g.lineTo(0, 13); g.moveTo(-8, -4); g.lineTo(8, 4); }
    else if (k === 2) { g.arc(0, 0, 9, 0.3, Math.PI * 1.7); g.moveTo(0, -13); g.lineTo(0, 13); }
    else if (k === 3) { g.moveTo(-9, 12); g.lineTo(-9, -12); g.lineTo(9, 0); g.lineTo(-9, 0); }
    else { g.moveTo(-10, -10); g.lineTo(10, 10); g.moveTo(10, -10); g.lineTo(-10, 10); }
    g.stroke();
    g.restore();
  }
  // Inner figure: a hexagram for fire, an eight-point star for light.
  g.lineWidth = 4;
  g.beginPath();
  const pts = style === 'fire' ? 6 : 8;
  const step = style === 'fire' ? 2 : 3;
  for (let i = 0; i <= pts; i++) {
    const a = ((i * step) / pts) * Math.PI * 2 - Math.PI / 2;
    g.lineTo(Math.cos(a) * 150, Math.sin(a) * 150);
  }
  g.stroke();
  // Small orbs on the middle ring.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.beginPath();
    g.arc(Math.cos(a) * 150, Math.sin(a) * 150, 9, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function drawRing() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.5);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.75, 'rgba(255,255,255,0.9)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

interface Live {
  mesh: THREE.Mesh;
  t: number;
  life: number;
  kind: 'circle' | 'ring';
  size: number;
  follow?: () => { pos: THREE.Vector3; quat?: THREE.Quaternion };
  spin: number;
}

const COLORS: Record<Style, THREE.Color> = {
  fire: new THREE.Color(3.2, 1.3, 0.35),
  light: new THREE.Color(2.8, 2.3, 1.2),
  gale: new THREE.Color(0.7, 2.6, 2.2),
  wind: new THREE.Color(1.4, 2.6, 0.9),
  frost: new THREE.Color(1.2, 1.9, 3.2),
  steel: new THREE.Color(1.9, 2.0, 2.4),
  shadow: new THREE.Color(1.6, 0.8, 2.8),
  blood: new THREE.Color(3.0, 0.5, 0.35),
};

export class MagicCircles {
  private tex: Record<'fire' | 'light', THREE.Texture>;
  private ringTex = drawRing();
  private live: Live[] = [];
  private geo = new THREE.PlaneGeometry(1, 1);

  constructor(private scene: THREE.Scene) {
    this.tex = { fire: drawCircle('fire'), light: drawCircle('light') };
  }

  private material(map: THREE.Texture, color: THREE.Color) {
    return new THREE.MeshBasicMaterial({ map, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0 });
  }

  /** Circle lying on the ground at `pos`. */
  ground(pos: THREE.Vector3, style: Style, size: number, life: number) {
    const m = new THREE.Mesh(this.geo, this.material(this.tex[FIGURE[style]], COLORS[style]));
    m.rotation.x = -Math.PI / 2;
    m.position.copy(pos).setY(pos.y + 0.05);
    m.renderOrder = 5;
    this.scene.add(m);
    this.live.push({ mesh: m, t: 0, life, kind: 'circle', size, spin: 0.9 });
  }

  /** Circle standing upright, facing `dir`, that tracks a moving anchor. */
  facing(follow: () => { pos: THREE.Vector3; quat: THREE.Quaternion }, style: Style, size: number, life: number) {
    const m = new THREE.Mesh(this.geo, this.material(this.tex[FIGURE[style]], COLORS[style]));
    m.renderOrder = 5;
    this.scene.add(m);
    this.live.push({ mesh: m, t: 0, life, kind: 'circle', size, follow, spin: -1.6 });
  }

  /** Expanding flat shockwave ring. */
  shockwave(pos: THREE.Vector3, style: Style, size: number) {
    const m = new THREE.Mesh(this.geo, this.material(this.ringTex, COLORS[style]));
    m.rotation.x = -Math.PI / 2;
    m.position.copy(pos);
    m.renderOrder = 5;
    this.scene.add(m);
    this.live.push({ mesh: m, t: 0, life: 0.55, kind: 'ring', size, spin: 0 });
  }

  update(dt: number) {
    for (const l of this.live) {
      l.t += dt;
      const u = l.t / l.life;
      const mat = l.mesh.material as THREE.MeshBasicMaterial;
      if (l.kind === 'circle') {
        // Draw in quickly, hold, fade out.
        const grow = 1 - Math.pow(1 - Math.min(1, l.t / 0.22), 3);
        l.mesh.scale.setScalar(l.size * (0.6 + 0.4 * grow));
        mat.opacity = Math.min(1, l.t / 0.15) * (1 - Math.max(0, (u - 0.7) / 0.3)) * 0.9;
        if (l.follow) {
          const f = l.follow();
          l.mesh.position.copy(f.pos);
          if (f.quat) l.mesh.quaternion.copy(f.quat);
          l.mesh.rotateZ(l.t * l.spin);
        } else l.mesh.rotation.z = l.t * l.spin;
      } else {
        l.mesh.scale.setScalar(l.size * (0.2 + 1.3 * (1 - Math.pow(1 - u, 2.5))));
        mat.opacity = (1 - u) * 0.9;
      }
    }
    for (const l of this.live.filter((l) => l.t >= l.life)) {
      this.scene.remove(l.mesh);
      (l.mesh.material as THREE.Material).dispose();
    }
    this.live = this.live.filter((l) => l.t < l.life);
  }
}
