import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CRYPT, heightAt } from './terrain';
import { physics } from '../physics/physics';
import { worldUV, type WorldMats } from './buildings';
import type { FX } from '../fx/particles';

// The crypt entrance in the northern hills: a weathered stone facade set into
// the hillside, an arched doorway onto darkness, twin braziers and a glowing
// sigil over the arch. Phase 2 makes the doorway the way into the dungeon.

function sigilTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.translate(128, 128);
  g.strokeStyle = 'rgba(140, 220, 255, 1)';
  g.shadowColor = 'rgba(120, 200, 255, 1)';
  g.shadowBlur = 12;
  g.lineWidth = 5;
  g.beginPath();
  g.arc(0, 0, 100, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 3;
  g.beginPath();
  g.arc(0, 0, 82, 0, Math.PI * 2);
  g.stroke();
  // Runes around the ring.
  for (let i = 0; i < 12; i++) {
    g.save();
    g.rotate((i / 12) * Math.PI * 2);
    g.translate(0, -91);
    g.beginPath();
    g.moveTo(-5, -5);
    g.lineTo(0, 5);
    g.lineTo(5, -5);
    if (i % 3 === 0) g.moveTo(0, -6), g.lineTo(0, 6);
    g.stroke();
    g.restore();
  }
  // Inner star.
  g.beginPath();
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * Math.PI * 2 * 2 - Math.PI / 2;
    g.lineTo(Math.cos(a) * 62, Math.sin(a) * 62);
  }
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildCrypt(scene: THREE.Scene, m: WorldMats, fx: FX) {
  const gz = CRYPT.y + 3;
  const baseY = heightAt(CRYPT.x, CRYPT.y + 10) - 0.2;
  // Mossy grey ashlar, darker than the bridge.
  const stone = m.bridgeStone ?? m.stone;
  const parts: THREE.BufferGeometry[] = [];
  const W = 11, H = 8.5, D = 3.2, doorW = 3.4, doorH = 4.6;

  // Facade with an arched doorway.
  const face = new THREE.Shape();
  face.moveTo(-W / 2, 0);
  face.lineTo(W / 2, 0);
  face.lineTo(W / 2, H * 0.82);
  face.lineTo(W * 0.3, H);
  face.lineTo(-W * 0.3, H);
  face.lineTo(-W / 2, H * 0.82);
  face.closePath();
  const door = new THREE.Path();
  door.moveTo(-doorW / 2, 0.05);
  door.lineTo(-doorW / 2, doorH - doorW / 2);
  door.absarc(0, doorH - doorW / 2, doorW / 2, Math.PI, 0, true);
  door.lineTo(doorW / 2, 0.05);
  door.closePath();
  face.holes.push(door);
  const facade = new THREE.ExtrudeGeometry(face, { depth: D, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 1 });
  facade.translate(0, 0, -D);
  parts.push(worldUV(facade.toNonIndexed(), 2.5));
  // Pillars and a heavy lintel.
  for (const sx of [-1, 1]) {
    const col = new THREE.CylinderGeometry(0.42, 0.5, H * 0.78, 12);
    col.translate(sx * (doorW / 2 + 1.1), (H * 0.78) / 2, 0.5);
    parts.push(worldUV(col.toNonIndexed(), 2));
    const cap = new THREE.BoxGeometry(1.3, 0.45, 1.3);
    cap.translate(sx * (doorW / 2 + 1.1), H * 0.78 + 0.2, 0.5);
    parts.push(worldUV(cap.toNonIndexed(), 2));
    const plinth = new THREE.BoxGeometry(1.4, 0.6, 1.4);
    plinth.translate(sx * (doorW / 2 + 1.1), 0.3, 0.5);
    parts.push(worldUV(plinth.toNonIndexed(), 2));
  }
  const lintel = new THREE.BoxGeometry(doorW + 4.4, 0.7, 1.6);
  lintel.translate(0, H * 0.78 + 0.75, 0.4);
  parts.push(worldUV(lintel.toNonIndexed(), 2));
  // Worn steps down to the threshold.
  for (let i = 0; i < 3; i++) {
    const st = new THREE.BoxGeometry(doorW + 2.4 - i * 0.5, 0.25, 1.1);
    st.translate(0, -0.12 - i * 0.25 + 0.25 * 2, 1.4 + (2 - i) * 1.0);
    parts.push(worldUV(st.toNonIndexed(), 2));
  }
  const clean = parts.map((g) => {
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    return g;
  });
  const mesh = new THREE.Mesh(mergeGeometries(clean)!, stone);
  mesh.castShadow = mesh.receiveShadow = true;

  // Darkness beyond the door: a short tunnel that fades to black.
  const tunnel = new THREE.Mesh(
    new THREE.BoxGeometry(doorW - 0.1, doorH, 9),
    new THREE.MeshStandardMaterial({ color: 0x050404, roughness: 1, side: THREE.BackSide, envMapIntensity: 0 }),
  );
  tunnel.position.set(0, doorH / 2, -D - 4.4);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(doorW, doorH), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  // Darkness that thickens a couple of metres inside the doorway.
  const shade = document.createElement('canvas');
  shade.width = 4;
  shade.height = 64;
  const sg = shade.getContext('2d')!;
  const grad = sg.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0.95)');
  sg.fillStyle = grad;
  sg.fillRect(0, 0, 4, 64);
  const gloom = new THREE.Mesh(new THREE.PlaneGeometry(doorW, doorH), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shade), transparent: true, depthWrite: false }));
  gloom.position.set(0, doorH / 2, -D - 1.2);
  back.position.set(0, doorH / 2, -D - 8.8);

  // Glowing sigil over the arch.
  const sigil = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 1.6),
    new THREE.MeshBasicMaterial({ map: sigilTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(2.2, 2.6, 3.0) }),
  );
  sigil.position.set(0, H * 0.78 + 0.75, 1.22);

  // Braziers.
  const brazierMat = m.stone;
  const braziers: THREE.Vector3[] = [];
  const group = new THREE.Group();
  const houseLoader = new GLTFLoader();
  for (const sx of [-1, 1]) {
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.28, 0.5, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0x3a3632, metalness: 0.7, roughness: 0.5, side: THREE.DoubleSide }));
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.2, 8), brazierMat);
    const coals = new THREE.Mesh(new THREE.CircleGeometry(0.5, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 1.1, 0.3) }));
    const x = sx * 4.2;
    stand.position.set(x, 0.6, 3.2);
    bowl.position.set(x, 1.35, 3.2);
    coals.position.set(x, 1.45, 3.2);
    group.add(stand, bowl, coals);
    braziers.push(new THREE.Vector3(x, 1.5, 3.2));
  }
  group.add(mesh, tunnel, back, gloom, sigil);
  group.position.set(CRYPT.x, baseY, gz);
  scene.add(group);
  group.updateMatrixWorld(true);

  // Orc house: this is now the visible entrance landmark for the first dungeon.
  // The GLB is supplied separately at /assets/npc/orc_house.glb.
  void houseLoader.loadAsync('/assets/npc/orc_house.glb').then((g) => {
    if (!group.parent) return;
    const house = g.scene;
    house.updateMatrixWorld(true);
    const hb = new THREE.Box3().setFromObject(house);
    const h = Math.max(0.01, hb.max.y - hb.min.y);
    const scale = 8.2 / h;
    house.scale.setScalar(scale);
    house.updateMatrixWorld(true);
    const hb2 = new THREE.Box3().setFromObject(house);
    const center = hb2.getCenter(new THREE.Vector3());
    // Face the same direction as the existing crypt approach: the player's
    // interaction point is placed directly in front of the house.
    house.position.set(CRYPT.x - center.x, baseY - hb2.min.y, gz + 0.2 - center.z);
    house.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    group.add(house);
    // The old stone facade remains only as the collision/tunnel foundation;
    // the supplied Orc House is the visible landmark and doorway.
    mesh.visible = false;
    tunnel.visible = false;
    back.visible = false;
    gloom.visible = false;
    sigil.visible = false;
  }).catch((e) => console.warn('orc house failed to load', e));
  const world = braziers.map((b) => b.clone().applyMatrix4(group.matrixWorld));

  // Collision: the facade either side of the door, and the (for now) sealed tunnel.
  const addBox = (x: number, y: number, z: number, hx: number, hy: number, hz: number) =>
    physics.addBox(new THREE.Vector3(CRYPT.x + x, baseY + y, gz + z), new THREE.Vector3(hx, hy, hz));
  const side = (W - doorW) / 4;
  addBox(-(doorW / 2 + side), H / 2, -D / 2, side, H / 2, D / 2 + 0.1);
  addBox(doorW / 2 + side, H / 2, -D / 2, side, H / 2, D / 2 + 0.1);
  addBox(0, doorH + (H - doorH) / 2, -D / 2, doorW / 2, (H - doorH) / 2, D / 2);
  addBox(0, doorH / 2, -D - 2, doorW / 2, doorH / 2, 0.3); // sealed until the dungeon opens
  for (const sx of [-1, 1]) addBox(sx * (doorW / 2 + 1.1), H * 0.4, 0.5, 0.5, H * 0.4, 0.5);

  let t = 0;
  return {
    /** the doorway (world position) */
    door: new THREE.Vector3(CRYPT.x, baseY, gz + 4.8),
    update(dt: number) {
      t += dt;
      (sigil.material as THREE.MeshBasicMaterial).opacity = 0.7 + Math.sin(t * 1.6) * 0.25;
      for (const b of world) {
        if (Math.random() < dt * 30) fx.add.spawn({ pos: b, vel: new THREE.Vector3(0, 1.8, 0), spread: 0.35, count: 1, life: [0.35, 0.7], size: [0.4, 0.06], color: 0xffc060, color2: 0xff2a00, jitter: 0.35 });
      }
      // Faint mist drifting out of the doorway.
      if (Math.random() < dt * 4) fx.alpha.spawn({ pos: new THREE.Vector3(CRYPT.x, baseY + 0.6, gz - 1), vel: new THREE.Vector3(0, 0.1, 0.6), spread: 0.4, count: 1, life: [2, 3.5], size: [0.8, 2.2], color: 0x8fa6b8, alpha: 0.18, jitter: 1.4 });
    },
  };
}
