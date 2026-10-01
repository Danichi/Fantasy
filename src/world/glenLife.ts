import * as THREE from 'three';
import { heightAt, roadDist, streetDist, riverX, TOWN_R } from './terrainHeight';
import { physics } from '../physics/physics';
import type { FX } from '../fx/particles';

// The working countryside round Elder Glen: hay bales and stacks in the
// fields, loaded carts by the barns, beehives at the orchard edge humming
// with bees by day, a field bonfire the farmhands light at dusk, and wash
// lines flapping between posts. All cheap: a few instanced meshes and
// particles near the player.

const mulberry32 = (a: number) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Wheat (FarmLife) and the crops.ts fields: centre x, z, width, depth. */
const FIELDS: [number, number, number, number][] = [
  [4, 150, 72, 38], [-48, 211, 72, 46], [145, 208, 76, 44],
  [48, 287, 70, 26], [-40, 268, 36, 20], [-172, 160, 42, 28], [-150, 205, 40, 26],
];
const inField = (x: number, z: number, pad: number) => FIELDS.some(([cx, cz, w, d]) => Math.abs(x - cx) < w / 2 + pad && Math.abs(z - cz) < d / 2 + pad);

/** Open ground: off roads, streets and crops, clear of the river, the palisade and the farm buildings. */
function open(x: number, z: number, clearings: [number, number, number][], pad = 2) {
  if (inField(x, z, pad)) return false;
  if (roadDist(x, z) < 6 + pad || streetDist(x, z) < 3 + pad) return false;
  if (Math.abs(x - riverX(z)) < 16) return false;
  if (Math.abs(Math.hypot(x, z) - TOWN_R) < 6) return false;
  return !clearings.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r + pad);
}

const HIVES: [number, number][] = [[80, -118], [83, -119.5], [86, -118.5], [89, -120]];
const CARTS: [number, number, number][] = [[-24, 132, 0.4], [58, 116, -1.1], [-118, 88, 2.2], [96, 96, 1.6]];
const WASH_LINES: [number, number, number][] = [[-70, 128, 0.2], [44, 132, 1.3], [-100, 40, -0.4]];

export function buildGlenLife(scene: THREE.Scene, fx: FX, clearings: [number, number, number][], hour: () => number) {
  const rnd = mulberry32(90210);
  const group = new THREE.Group();
  group.name = 'glenLife';
  scene.add(group);
  const straw = new THREE.MeshStandardMaterial({ color: 0xd8b15a, roughness: 1 });
  const strawDark = new THREE.MeshStandardMaterial({ color: 0xb58f44, roughness: 1 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6e4d30, roughness: 0.9 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x3a3a3c, roughness: 0.6, metalness: 0.6 });
  const taken: THREE.Vector2[] = [];
  const freeSpot = (x: number, z: number, r: number) => open(x, z, clearings) && !taken.some((p) => Math.hypot(p.x - x, p.y - z) < r);

  // ---- round bales and haystacks through the south fields ------------------------------------------
  const baleGeo = new THREE.CylinderGeometry(0.75, 0.75, 1.25, 16, 1);
  baleGeo.rotateZ(Math.PI / 2);
  const bales: THREE.Matrix4[] = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  for (let tries = 0; tries < 1200 && bales.length < 34; tries++) {
    const x = -140 + rnd() * 330, z = 118 + rnd() * 150;
    if (!freeSpot(x, z, 5)) continue;
    // Bales come in little rows of two or three where the baler left them.
    const yaw = rnd() * Math.PI;
    const n = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const bx = x + Math.cos(yaw) * k * 1.4, bz = z - Math.sin(yaw) * k * 1.4;
      q.setFromAxisAngle(up, yaw);
      m4.compose(new THREE.Vector3(bx, heightAt(bx, bz) + 0.7, bz), q, one);
      bales.push(m4.clone());
      physics.addCylinder(new THREE.Vector3(bx, heightAt(bx, bz) + 0.7, bz), 0.7, 0.72);
    }
    taken.push(new THREE.Vector2(x, z));
  }
  const baleMesh = new THREE.InstancedMesh(baleGeo, straw, bales.length);
  bales.forEach((b, i) => baleMesh.setMatrixAt(i, b));
  baleMesh.castShadow = baleMesh.receiveShadow = true;
  group.add(baleMesh);

  const stackGeo = new THREE.CylinderGeometry(1.5, 1.8, 2.2, 12);
  stackGeo.translate(0, 1.1, 0);
  const capGeo = new THREE.ConeGeometry(1.7, 1.8, 12);
  capGeo.translate(0, 3.1, 0);
  for (let tries = 0, made = 0; tries < 300 && made < 7; tries++) {
    const x = -110 + rnd() * 230, z = 125 + rnd() * 110;
    if (!freeSpot(x, z, 9)) continue;
    const s = 0.8 + rnd() * 0.4;
    const st = new THREE.Group();
    st.add(new THREE.Mesh(stackGeo, straw), new THREE.Mesh(capGeo, strawDark));
    // A pole through the top, the way they're built round a stake.
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6), wood);
    pole.position.y = 4.1;
    st.add(pole);
    st.scale.setScalar(s);
    st.position.set(x, heightAt(x, z) - 0.1, z);
    st.rotation.y = rnd() * 6;
    st.traverse((o) => ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true)));
    group.add(st);
    physics.addCylinder(new THREE.Vector3(x, heightAt(x, z) + 2, z), 2, 1.7 * s);
    taken.push(new THREE.Vector2(x, z));
    made++;
  }

  // ---- hay carts by the barns ---------------------------------------------------------------------
  for (const [x, z, yaw] of CARTS) {
    const cart = new THREE.Group();
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 2.6), wood);
    bed.position.y = 0.85;
    cart.add(bed);
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 2.6), wood);
      side.position.set(sx * 0.72, 1.1, 0);
      cart.add(side);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 14), wood);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * 0.85, 0.55, -0.3);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 5, 18), iron);
      rim.rotation.y = Math.PI / 2;
      rim.position.copy(wheel.position);
      cart.add(wheel, rim);
    }
    for (const sx of [-1, 1]) {
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 2.2), wood);
      shaft.position.set(sx * 0.45, 0.55, 2.2);
      shaft.rotation.x = 0.28;
      cart.add(shaft);
    }
    const load = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), straw);
    load.scale.set(0.72, 0.55, 1.25);
    load.position.y = 1.25;
    cart.add(load);
    cart.position.set(x, heightAt(x, z), z);
    cart.rotation.y = yaw;
    cart.traverse((o) => ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true)));
    group.add(cart);
    physics.addBox(new THREE.Vector3(x, heightAt(x, z) + 1, z), new THREE.Vector3(0.8, 1, 1.4), new THREE.Quaternion().setFromAxisAngle(up, yaw));
  }

  // ---- beehives at the orchard edge -----------------------------------------------------------------
  const skepGeo = new THREE.SphereGeometry(0.42, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  skepGeo.scale(1, 1.35, 1);
  const hiveAt: THREE.Vector3[] = [];
  const bench = new THREE.Mesh(new THREE.BoxGeometry(12, 0.1, 0.9), wood);
  const bx = (HIVES[0][0] + HIVES[3][0]) / 2, bz = (HIVES[0][1] + HIVES[3][1]) / 2;
  bench.position.set(bx, heightAt(bx, bz) + 0.5, bz);
  bench.rotation.y = -Math.atan2(HIVES[3][1] - HIVES[0][1], HIVES[3][0] - HIVES[0][0]);
  bench.scale.x = (Math.hypot(HIVES[3][0] - HIVES[0][0], HIVES[3][1] - HIVES[0][1]) + 1) / 12;
  group.add(bench);
  for (const [x, z] of HIVES) {
    const y = heightAt(bx, bz) + 0.55;
    const skep = new THREE.Mesh(skepGeo, straw);
    skep.position.set(x, y, z);
    skep.castShadow = true;
    group.add(skep);
    // Straw coils round the skep.
    for (let k = 0; k < 3; k++) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.4 - k * 0.1, 0.03, 5, 18), strawDark);
      coil.rotation.x = Math.PI / 2;
      coil.position.set(x, y + 0.1 + k * 0.17, z);
      group.add(coil);
    }
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), wood);
      leg.position.set(x + sx * 0.3, heightAt(x, z) + 0.25, z);
      group.add(leg);
    }
    hiveAt.push(new THREE.Vector3(x, y + 0.3, z));
  }

  // ---- wash lines ----------------------------------------------------------------------------------
  const cloths: THREE.Mesh[] = [];
  const clothCols = [0xf2ede0, 0xb8402e, 0x2f5f9a, 0xe0c080, 0x7a8a6a, 0xf2ede0];
  for (const [x, z, yaw] of WASH_LINES) {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.1, 6), wood);
      post.position.set(s * 3, 1.05, 0);
      g.add(post);
    }
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 6, 4), wood);
    line.rotation.z = Math.PI / 2;
    line.position.y = 1.95;
    g.add(line);
    for (let k = 0; k < 5; k++) {
      const w = 0.5 + ((k * 37) % 5) * 0.08, h = 0.6 + ((k * 13) % 4) * 0.12;
      const geo = new THREE.PlaneGeometry(w, h, 1, 3);
      geo.translate(0, -h / 2, 0);
      const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: clothCols[k % clothCols.length], roughness: 1, side: THREE.DoubleSide }));
      cloth.position.set(-2.3 + k * 1.15, 1.95, 0);
      cloth.userData.phase = k * 1.7 + x;
      g.add(cloth);
      cloths.push(cloth);
    }
    g.position.set(x, heightAt(x, z), z);
    g.rotation.y = yaw;
    group.add(g);
  }

  // ---- the field bonfire: on open grass between the south fields -------------------------------------
  const BONFIRE = new THREE.Vector3(-2, 0, 182);
  for (let r = 0; r < 60; r += 3) {
    let hit = false;
    for (let a = 0; a < 12 && !hit; a++) {
      const x = -2 + Math.cos(a * 0.52) * r, z = 182 + Math.sin(a * 0.52) * r;
      if (open(x, z, clearings, 6)) (BONFIRE.set(x, 0, z), (hit = true));
    }
    if (hit) break;
  }
  const fire = new THREE.Group();
  const fy = heightAt(BONFIRE.x, BONFIRE.z);
  for (let k = 0; k < 8; k++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.5, 6), wood);
    const a = (k / 8) * Math.PI * 2;
    log.position.set(Math.cos(a) * 0.35, 0.5, Math.sin(a) * 0.35);
    log.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55);
    fire.add(log);
  }
  for (let k = 0; k < 12; k++) {
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), new THREE.MeshStandardMaterial({ color: 0x6f6a62, roughness: 1 }));
    const a = (k / 12) * Math.PI * 2;
    stone.position.set(Math.cos(a) * 1.2, 0.08, Math.sin(a) * 1.2);
    fire.add(stone);
  }
  for (let k = 0; k < 3; k++) {
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.2, 8), wood);
    const a = (k / 3) * Math.PI * 2 + 0.4;
    seat.rotation.z = Math.PI / 2;
    seat.rotation.y = a;
    seat.position.set(Math.cos(a) * 3.2, 0.22, Math.sin(a) * 3.2);
    fire.add(seat);
  }
  fire.position.set(BONFIRE.x, fy, BONFIRE.z);
  group.add(fire);
  const glow = new THREE.PointLight(0xff9a4a, 0, 18, 1.6);
  glow.position.set(BONFIRE.x, fy + 1.4, BONFIRE.z);
  group.add(glow);
  physics.addCylinder(new THREE.Vector3(BONFIRE.x, fy + 0.6, BONFIRE.z), 0.6, 0.9);

  let t = 0;
  const lit = (h: number) => h >= 18 || h < 1;
  return {
    group,
    hives: hiveAt,
    bonfire: BONFIRE,
    update(dt: number, player: THREE.Vector3) {
      t += dt;
      const h = hour();
      // Bees drift round the hives by day.
      if (h > 7 && h < 19) {
        for (const p of hiveAt) {
          if (p.distanceToSquared(player) > 60 * 60) continue;
          if (Math.random() < dt * 6) fx.add.spawn({ pos: p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, Math.random() * 0.8, (Math.random() - 0.5) * 1.6)), vel: new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.2, (Math.random() - 0.5) * 1.2), spread: 0.1, count: 1, life: [1.2, 2.2], size: [0.05, 0.05], color: 0x2a2208, color2: 0xd8a820, jitter: 2.2, drag: 0.6 });
        }
      }
      // Laundry sways in the breeze.
      for (const c of cloths) {
        if (c.parent!.position.distanceToSquared(player) > 90 * 90) continue;
        c.rotation.x = Math.sin(t * 1.7 + c.userData.phase) * 0.22 + 0.1;
        c.rotation.y = Math.sin(t * 0.9 + c.userData.phase) * 0.12;
      }
      // The bonfire: lit from dusk to past midnight.
      const on = lit(h);
      const near = BONFIRE.distanceToSquared(player) < 140 * 140;
      glow.intensity = on && near ? 14 + Math.sin(t * 13) * 2 + Math.sin(t * 7.3) * 2 : 0;
      if (on && near) {
        const base = new THREE.Vector3(BONFIRE.x, fy + 0.7, BONFIRE.z);
        if (Math.random() < dt * 40) fx.add.spawn({ pos: base, vel: new THREE.Vector3(0, 2.2, 0), spread: 0.5, count: 2, life: [0.35, 0.7], size: [0.5, 0.08], color: 0xffc060, color2: 0xff3a00, upBias: 1.5 });
        if (Math.random() < dt * 6) fx.add.spawn({ pos: base.clone().setY(base.y + 1), vel: new THREE.Vector3(0, 3, 0), spread: 0.4, count: 1, life: [0.8, 1.6], size: [0.06, 0.02], color: 0xffe0a0, color2: 0xff6020, jitter: 1.5, upBias: 2 });
        if (Math.random() < dt * 5) fx.add.spawn({ pos: base.clone().setY(base.y + 2), vel: new THREE.Vector3(0.3, 1.4, 0), spread: 0.6, count: 1, life: [2, 3.5], size: [0.6, 1.8], color: 0x6a645c, color2: 0x3a3632, alpha: 0.35, drag: 0.4 });
      }
    },
  };
}
