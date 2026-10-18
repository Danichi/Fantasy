import * as THREE from 'three';
import { heightAt } from '../../world/terrainHeight';
import { groundPatch } from '../dens';

// Silk: orb-web sheets strung between trunks, the sticky snare that holds a
// victim's feet, wrapped cocoons and egg sacs. The web pattern is drawn once
// on a canvas: radial threads and a spiral, a little sagging and torn.

let webTex: THREE.CanvasTexture | null = null;
export function webTexture() {
  if (webTex) return webTex;
  const N = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d')!;
  g.clearRect(0, 0, N, N);
  g.strokeStyle = 'rgba(245,245,240,0.9)';
  g.lineCap = 'round';
  const cx = N / 2, cy = N / 2;
  const spokes = 22;
  const ang = Array.from({ length: spokes }, (_, i) => (i / spokes) * Math.PI * 2 + (Math.random() - 0.5) * 0.12);
  g.lineWidth = 1.6;
  for (const a of ang) {
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * N * 0.5, cy + Math.sin(a) * N * 0.5);
    g.stroke();
  }
  // The capture spiral: thread from spoke to spoke, sagging between them.
  g.lineWidth = 1.1;
  for (let r = 18; r < N * 0.47; r += 7 + r * 0.025) {
    g.beginPath();
    for (let i = 0; i <= spokes; i++) {
      const a = ang[i % spokes] + (i >= spokes ? Math.PI * 2 : 0);
      const rr = r + i * 0.3;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      if (i === 0) g.moveTo(x, y);
      else {
        const am = (ang[(i - 1) % spokes] + a + (i - 1 >= spokes ? Math.PI * 2 : 0)) / 2;
        g.quadraticCurveTo(cx + Math.cos(am) * (rr - 5), cy + Math.sin(am) * (rr - 5), x, y);
      }
      // A few torn gaps.
      if (Math.random() < 0.04) {
        g.stroke();
        g.beginPath();
        g.moveTo(x, y);
      }
    }
    g.stroke();
  }
  // Fade to nothing at the rim.
  const fade = g.createRadialGradient(cx, cy, N * 0.3, cx, cy, N * 0.5);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = fade;
  g.fillRect(0, 0, N, N);
  webTex = new THREE.CanvasTexture(cv);
  webTex.colorSpace = THREE.SRGBColorSpace;
  webTex.anisotropy = 4;
  return webTex;
}

let webMat: THREE.MeshStandardMaterial | null = null;
export function webMaterial() {
  if (webMat) return webMat;
  webMat = new THREE.MeshStandardMaterial({ map: webTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.4, alphaTest: 0.02 });
  webMat.userData.styleSoftness = 0;
  webMat.userData.styleRim = 0.6;
  return webMat;
}

/** A web sheet spanning between two anchor points (bottom-left, top-right), facing roughly `normal`. */
export function webSheet(a: THREE.Vector3, b: THREE.Vector3) {
  const c = a.clone().add(b).multiplyScalar(0.5);
  const size = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), webMaterial());
  m.position.copy(c);
  const dir = b.clone().sub(a).setY(0).normalize();
  m.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI / 2;
  m.rotation.z = (Math.random() - 0.5) * 0.4;
  m.renderOrder = 2;
  return m;
}

/** A wrapped bundle: lumpy silk around something unlucky. */
export function cocoon(len: number) {
  const g = new THREE.CapsuleGeometry(len * 0.22, len, 6, 12);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const k = 1 + Math.sin(y * 30) * 0.06 + (Math.random() - 0.5) * 0.05;
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xe9e4d6, roughness: 0.85 }));
  m.castShadow = true;
  return m;
}

/** A spider hollow: webs between trunks, cocoons hanging and lying, a clutch of egg sacs, bones. */
export function spiderHollow(at: THREE.Vector3, seed: number) {
  let s = seed >>> 0 || 7;
  const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const g = new THREE.Group();
  g.position.copy(at);
  const y = (x: number, z: number) => heightAt(at.x + x, at.z + z) - at.y;
  // Dead, silk-grey ground litter.
  g.add(groundPatch(at, 7, (_x, _z, rr) => new THREE.Color(0x5a5048).lerp(new THREE.Color(0x8c877c), (1 - rr) * 0.5)));
  // Gnarled dead trunks to string webs from.
  const bark = new THREE.MeshStandardMaterial({ color: 0x4e4239, roughness: 0.95 });
  const trunks: THREE.Vector3[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r() * 0.9, d = 4 + r() * 2.5;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const h = 2.6 + r() * 2.2;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, h, 9), bark);
    t.position.set(x, y(x, z) + h / 2 - 0.1, z);
    t.rotation.set((r() - 0.5) * 0.25, 0, (r() - 0.5) * 0.25);
    t.castShadow = t.receiveShadow = true;
    g.add(t);
    trunks.push(new THREE.Vector3(x, y(x, z), z));
  }
  // Webs between neighbouring trunks, and a few low sheets over the ground.
  for (let i = 0; i < trunks.length; i++) {
    const p = trunks[i], q = trunks[(i + 1) % trunks.length];
    const w = webSheet(p.clone().setY(p.y + 0.4), q.clone().setY(q.y + 2.4 + r()));
    g.add(w);
  }
  for (let i = 0; i < 3; i++) {
    const a = r() * Math.PI * 2, d = r() * 3;
    const w = new THREE.Mesh(new THREE.CircleGeometry(1.4 + r(), 24), webMaterial());
    w.rotation.x = -Math.PI / 2 + (r() - 0.5) * 0.3;
    w.position.set(Math.cos(a) * d, y(Math.cos(a) * d, Math.sin(a) * d) + 0.12, Math.sin(a) * d);
    w.renderOrder = 2;
    g.add(w);
  }
  // Cocoons: some hanging from the trunks, some lying.
  for (let i = 0; i < 5; i++) {
    const c = cocoon(0.6 + r() * 0.7);
    if (i < 2) {
      const t = trunks[i];
      c.position.set(t.x * 0.8, t.y + 1.4 + r(), t.z * 0.8);
    } else {
      const a = r() * Math.PI * 2, d = 1 + r() * 3;
      c.position.set(Math.cos(a) * d, y(Math.cos(a) * d, Math.sin(a) * d) + 0.18, Math.sin(a) * d);
      c.rotation.set(Math.PI / 2, r() * 3, 0);
    }
    g.add(c);
  }
  // Egg sacs: a pale clutch at the heart of the hollow.
  const egg = new THREE.MeshStandardMaterial({ color: 0xf1ead8, roughness: 0.7 });
  for (let i = 0; i < 7; i++) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.16 + r() * 0.08, 12, 9), egg);
    const a = r() * Math.PI * 2, d = r() * 0.5;
    e.position.set(Math.cos(a) * d, y(0, 0) + 0.15 + (i > 4 ? 0.2 : 0), Math.sin(a) * d);
    e.castShadow = true;
    g.add(e);
  }
  // Bones.
  const bone = new THREE.MeshStandardMaterial({ color: 0xd8cdb2, roughness: 0.7 });
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.4 + r() * 0.3, 3, 6), bone);
    const a = r() * Math.PI * 2, d = 1.5 + r() * 4;
    b.position.set(Math.cos(a) * d, y(Math.cos(a) * d, Math.sin(a) * d) + 0.05, Math.sin(a) * d);
    b.rotation.set(Math.PI / 2, 0, r() * Math.PI);
    g.add(b);
  }
  return g;
}

/** The snare on a webbed victim's feet: a sticky disc and a few strands, shown while it holds. */
export class Snare {
  readonly mesh: THREE.Group;
  private strands: THREE.Mesh[] = [];
  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24), webMaterial());
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.05;
    this.mesh.add(disc);
    const silk = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.6, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 1, 4), silk);
      const a = (i / 7) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.32, 0.45, Math.sin(a) * 0.32);
      s.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      this.strands.push(s);
      this.mesh.add(s);
    }
    this.mesh.visible = false;
    scene.add(this.mesh);
  }
  update(at: THREE.Vector3, held: number) {
    this.mesh.visible = held > 0;
    if (!this.mesh.visible) return;
    this.mesh.position.copy(at);
    const k = Math.min(1, held / 0.6);
    this.mesh.scale.set(1, 0.3 + 0.7 * k, 1);
  }
}
