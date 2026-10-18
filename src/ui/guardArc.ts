import * as THREE from 'three';
import { events } from '../core/events';
import type { Player } from '../player/player';

// Where your shield covers: while it is raised, a soft golden arc on the
// ground in front of you spans exactly the directions it stops (it covers
// your front, not your flanks or back). It flashes bright when it turns a
// blow, and a red mark flares on the ring where a blow got round it. A small
// crosshair in the middle of the screen shows where the shield will face when
// nothing is close enough for you to square up to on your own.

/** Half-angle of the shield's cover (player.receiveAttack: facing > 0.3). */
const COVER = Math.acos(0.3);
const R0 = 0.7, R1 = 2.1;

const VERT = /* glsl */ `
varying vec2 vPolar;
void main() {
  vPolar = vec2(atan(position.x, position.z), length(position.xz));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uFlash;
uniform float uCover;
uniform float uTime;
varying vec2 vPolar;
void main() {
  float a = abs(vPolar.x), r = vPolar.y;
  float edgeA = smoothstep(uCover, uCover - 0.08, a);
  float band = smoothstep(${R0.toFixed(2)}, ${(R0 + 0.15).toFixed(2)}, r) * smoothstep(${R1.toFixed(2)}, ${(R1 - 0.45).toFixed(2)}, r);
  // A brighter rim at the edges of the cover and a faint ripple outward.
  float rim = smoothstep(uCover - 0.12, uCover - 0.02, a) * edgeA;
  float ripple = 0.75 + 0.25 * sin(r * 14.0 - uTime * 4.0);
  float alpha = (band * ripple * 0.55 + rim * 0.9 * band) * edgeA * uAlpha + uFlash * band * edgeA;
  gl_FragColor = vec4(uColor + uFlash * 0.6, alpha);
}`;

export class GuardArc {
  private mesh: THREE.Mesh;
  private tick: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private alpha = 0;
  private flash = 0;
  private tickT = 0;
  private xhair: HTMLDivElement;

  constructor(scene: THREE.Scene, private readonly player: Player) {
    // A fan of quads covering the arc, in the player's local XZ (forward = +Z).
    const seg = 40, rings = 4;
    const pos: number[] = [], idx: number[] = [];
    for (let j = 0; j <= rings; j++)
      for (let i = 0; i <= seg; i++) {
        const a = -COVER + (2 * COVER * i) / seg, r = R0 + ((R1 - R0) * j) / rings;
        pos.push(Math.sin(a) * r, 0, Math.cos(a) * r);
      }
    for (let j = 0; j < rings; j++)
      for (let i = 0; i < seg; i++) {
        const a = j * (seg + 1) + i;
        idx.push(a, a + seg + 1, a + 1, a + 1, a + seg + 1, a + seg + 2);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(0xffc861) }, uAlpha: { value: 0 }, uFlash: { value: 0 }, uCover: { value: COVER }, uTime: { value: 0 } },
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.renderOrder = 5;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
    // The red mark for a blow that got round.
    const tg = new THREE.RingGeometry(R0, R1 * 0.9, 8, 1, -0.25, 0.5);
    tg.rotateX(-Math.PI / 2);
    this.tick = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.tick.renderOrder = 5;
    this.tick.frustumCulled = false;
    this.tick.visible = false;
    scene.add(this.tick);

    this.xhair = document.createElement('div');
    this.xhair.className = 'guard-xhair';
    this.xhair.innerHTML = '<i></i><b></b>';
    document.body.appendChild(this.xhair);

    events.on('blockImpact', ({ guardBroken }) => {
      this.flash = guardBroken ? 0.5 : 1;
      this.mat.uniforms.uColor.value.set(guardBroken ? 0xff7a40 : 0xffc861);
      this.xhair.classList.remove('hit');
      void this.xhair.offsetWidth;
      this.xhair.classList.add('hit');
    });
    events.on('guardMissed', ({ from }) => {
      const p = this.player.pos;
      // Ring geometry's zero angle is +X; aim it at the attacker.
      this.tick.rotation.y = Math.atan2(-(from.z - p.z), from.x - p.x);
      this.tickT = 0.7;
    });
  }

  update(dt: number) {
    const pl = this.player;
    const up = pl.blocking && pl.equip.hasShield && !pl.dead;
    this.alpha += ((up ? 1 : 0) - this.alpha) * (1 - Math.exp(-dt * 12));
    this.flash = Math.max(0, this.flash - dt * 3.5);
    this.tickT = Math.max(0, this.tickT - dt);
    const show = this.alpha > 0.01 || this.flash > 0.01;
    this.mesh.visible = show;
    const u = this.mat.uniforms;
    u.uAlpha.value = this.alpha;
    u.uFlash.value = this.flash;
    u.uTime.value += dt;
    if (!this.flash) u.uColor.value.set(0xffc861);
    const at = pl.char.root.position;
    this.mesh.position.set(at.x, at.y + 0.06, at.z);
    this.mesh.rotation.y = pl.yaw;
    this.tick.visible = this.tickT > 0;
    this.tick.position.copy(this.mesh.position);
    (this.tick.material as THREE.MeshBasicMaterial).opacity = Math.min(1, this.tickT * 2) * 0.8;
    // Crosshair: up with the shield; dim while you're squared up to a nearby foe.
    const near = up && !!pl.nearestThreat(7);
    this.xhair.classList.toggle('on', up);
    this.xhair.classList.toggle('locked', near || !!pl.lock);
  }
}
