import './traversalView.css';
import * as THREE from 'three';
import type { Player } from './player';
import type { Input } from '../core/input';
import { grappleAnchors } from './traversalSurfaces';
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
function glider() {
  const root = new THREE.Group(),
    v: number[] = [],
    ix: number[] = [];
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 9; col++) {
      const x = (col / 8 - 0.5) * 3.7,
        z = (row / 2 - 0.5) * 1.8,
        y = 0.35 * (1 - (x / 1.85) ** 2) - 0.13 * (z / 0.9) ** 2;
      v.push(x, y, z);
    }
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 8; c++) {
      const i = r * 9 + c;
      ix.push(i, i + 9, i + 1, i + 1, i + 9, i + 10);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(ix);
  g.computeVertexNormals();
  const sail = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x8bb9a4, side: THREE.DoubleSide, roughness: 0.85 }));
  sail.position.y = 2.0;
  sail.castShadow = true;
  root.add(sail);
  const wood = new THREE.LineBasicMaterial({ color: 0x64482a });
  for (const col of [0, 2, 4, 6, 8]) {
    const points = [];
    for (let row = 0; row < 3; row++) {
      const i = (row * 9 + col) * 3;
      points.push(new THREE.Vector3(v[i], v[i + 1] + 2.01, v[i + 2]));
    }
    root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), wood));
  }
  for (const side of [-1, 1])
    root.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(side * 1.6, 2.05, -0.6), new THREE.Vector3(side * 0.65, 1.5, 0.25), new THREE.Vector3(side * 1.6, 2.05, 0.6)]),
        wood
      )
    );
  return root;
}
/** Shared rendering for anchor rings, the rope, glider and context controls. */
export class TraversalView {
  readonly panel = document.createElement('aside');
  readonly reticle = document.createElement('div');
  readonly wing = glider();
  private rings: THREE.InstancedMesh;
  private posts: THREE.InstancedMesh;
  private rope: THREE.Line;
  private timer = 0;
  private fold = 0;
  constructor(
    scene: THREE.Scene,
    private player: Player,
    private camera: THREE.Camera,
    private input: Input
  ) {
    const material = new THREE.MeshStandardMaterial({ color: 0xe9cb78, emissive: 0x3a2a07, roughness: 0.4, metalness: 0.6 });
    this.rings = new THREE.InstancedMesh(new THREE.TorusGeometry(0.3, 0.055, 5, 12), material, 128);
    this.posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 1.7, 5), material, 128);
    this.rings.frustumCulled = this.posts.frustumCulled = false;
    this.rings.count = this.posts.count = 0;
    scene.add(this.rings, this.posts);
    this.rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xc7af7e }));
    this.rope.frustumCulled = false;
    this.rope.visible = false;
    scene.add(this.rope);
    player.char.root.add(this.wing);
    this.wing.visible = false;
    this.panel.className = 'traversal-controls';
    this.panel.setAttribute('aria-label', 'Traversal controls');
    this.reticle.className = 'grapple-reticle';
    document.body.append(this.panel, this.reticle);
    this.panel.hidden = this.reticle.hidden = true;
  }
  update(dt: number, enabled = true) {
    if (this.wing.parent !== this.player.char.root) this.player.char.root.add(this.wing);
    const p = this.player,
      a = p.adventure,
      origin = new THREE.Vector3(),
      direction = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    this.camera.getWorldDirection(direction);
    const anchor = enabled ? a.aimedAnchor(origin, direction) : null;
    const desired = a.gliding && !p.dead ? 1 : 0;
    this.fold = THREE.MathUtils.damp(this.fold, desired, 14, dt);
    this.wing.visible = this.fold > 0.015;
    this.wing.scale.set(this.fold, Math.max(0.1, this.fold), this.fold);
    this.wing.rotation.z = Math.sin(performance.now() * 0.002) * 0.025;
    this.rope.visible = !!a.rope;
    if (a.rope) {
      const pos = this.rope.geometry.attributes.position as THREE.BufferAttribute;
      pos.setXYZ(0, p.pos.x, p.pos.y + 1.45, p.pos.z);
      pos.setXYZ(1, a.rope.hook.x, a.rope.hook.y, a.rope.hook.z);
      pos.needsUpdate = true;
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.1;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(direction.x, direction.z)),
        m = new THREE.Matrix4(),
        one = new THREE.Vector3(1, 1, 1);
      let count = 0;
      for (const marker of [...grappleAnchors.values()].sort((a, b) => a.point.distanceToSquared(p.pos) - b.point.distanceToSquared(p.pos))) {
        if (count >= 128 || marker.point.distanceTo(p.pos) > 90) continue;
        this.rings.setMatrixAt(count, m.compose(marker.point, q, one));
        this.rings.setColorAt(count, new THREE.Color(marker === anchor ? 0xa6e8ff : 0xffffff));
        this.posts.setMatrixAt(count, m.compose(marker.point.clone().add(new THREE.Vector3(0, -0.9, 0)), new THREE.Quaternion(), one));
        count++;
      }
      this.rings.count = this.posts.count = enabled ? count : 0;
      this.rings.instanceMatrix.needsUpdate = this.posts.instanceMatrix.needsUpdate = true;
      if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
    }
    const hidden = !enabled || p.dead || this.input.uiMode || p.mounted || !!p.vehicle || p.swimming || p.flying;
    this.reticle.hidden = hidden || !anchor || a.busy;
    if (anchor && !this.reticle.hidden) {
      const pos = anchor.point.clone().project(this.camera);
      this.reticle.style.left = `${(pos.x * 0.5 + 0.5) * innerWidth}px`;
      this.reticle.style.top = `${(-pos.y * 0.5 + 0.5) * innerHeight}px`;
      this.reticle.textContent = `E · Grapple · ${Math.round(anchor.point.distanceTo(p.center))} m`;
    }
    let title = '',
      keys = '';
    if (a.mode === 'climb') {
      title = 'Climbing';
      keys = 'W / S climb · A / D traverse · C push off · Space drop';
    } else if (a.mode === 'hang') {
      title = 'Ledge grip';
      keys = 'A / D shimmy · W or C pull up · S or Space drop';
    } else if (a.mode === 'hoist') {
      title = 'Pulling up';
      keys = 'Moving onto the ledge';
    } else if (a.mode === 'rope') {
      title = 'Grappling';
      keys = 'Space releases the rope';
    } else if (a.gliding) {
      title = p.fieldGlide?.() ? 'Wind-assisted glide' : 'Gliding';
      keys = 'Hold C to stay open · A / D steer · S brake · Release C to fold';
    } else if (anchor) {
      title = p.equip.items.some((i) => i.def.id === 'grapplingHook') ? 'Marked grapple anchor' : 'Grappling hook required';
      keys = 'Aim at the brass ring · E to grapple';
    } else if (!p.act && !p.mantling && a.face(direction)) {
      title = 'Climbable rock';
      keys = 'E to grip · W / S climb · A / D traverse';
    } else if (!p.grounded && p.vel.y < -0.8) {
      title = 'Travel glider';
      keys = 'Hold C while falling to glide';
    }
    this.panel.hidden = hidden || (!title && !a.notice);
    if (!this.panel.hidden)
      this.panel.innerHTML = `<strong>${esc(title || 'Traversal')}</strong><span>${esc(keys)}</span>${a.busy || (a.gliding && !p.fieldGlide?.()) ? `<div class="tr-grip ${p.stamina / p.maxStamina < 0.2 ? 'low' : ''}"><i style="width:${Math.max(0, (100 * p.stamina) / p.maxStamina)}%"></i></div><small>Stamina ${Math.ceil(p.stamina)} / ${p.maxStamina}</small>` : ''}${a.notice ? `<em>${esc(a.notice)}</em>` : ''}`;
  }
}
