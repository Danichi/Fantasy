import * as THREE from 'three';
import { heightAt } from './terrainHeight';
import { worldUV, type WorldMats } from './buildings';
import { registerDoor } from './doors';
import { physics } from '../physics/physics';
import { StaticBatch } from './cityKit';

// The Guild Hall of Elder Glen: the biggest building in the village, on the
// plaza's east side with its doors facing the square. A stone ground floor,
// a jettied timber upper floor, a steep slate roof, a bell tower with the
// guild's banner, a covered porch with benches and lanterns, a carved sign,
// and a trophy rack by the door that fills with what you bring back from your
// bounties (`setTrophies`). Inside is the Quest Wall (world/interior.ts,
// kind 'guild').

/** Where the hall stands and which way its doors face (toward the plaza). */
export const GUILD_HALL = { x: 25, z: -18, yaw: Math.atan2(-25, 14), w: 20, d: 15 };

/** The guild's emblem, a crossed sword and quill on a blue field, for banners and the sign. */
export function guildEmblem(size = 256, field = '#24456e', trim = '#d9b15a') {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size * 1.6;
  const g = c.getContext('2d')!;
  const W = c.width, H = c.height;
  g.fillStyle = field;
  g.beginPath();
  g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(W, H * 0.82); g.lineTo(W / 2, H); g.lineTo(0, H * 0.82); g.closePath();
  g.fill();
  g.strokeStyle = trim;
  g.lineWidth = W * 0.04;
  g.stroke();
  g.save();
  g.translate(W / 2, H * 0.44);
  // The sword.
  g.rotate(-Math.PI / 4);
  g.fillStyle = '#e8eef4';
  g.fillRect(-W * 0.035, -W * 0.38, W * 0.07, W * 0.6);
  g.fillStyle = trim;
  g.fillRect(-W * 0.14, W * 0.2, W * 0.28, W * 0.05);
  g.fillRect(-W * 0.03, W * 0.25, W * 0.06, W * 0.13);
  g.rotate(Math.PI / 2);
  // The quill.
  g.fillStyle = '#f5ead0';
  g.beginPath();
  g.moveTo(0, -W * 0.38);
  g.quadraticCurveTo(W * 0.12, -W * 0.1, 0, W * 0.3);
  g.quadraticCurveTo(-W * 0.08, -W * 0.1, 0, -W * 0.38);
  g.fill();
  g.strokeStyle = '#8a6a3a';
  g.lineWidth = W * 0.012;
  g.beginPath(); g.moveTo(0, -W * 0.34); g.lineTo(0, W * 0.38); g.stroke();
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function signTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 200;
  const g = c.getContext('2d')!;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const paint = () => {
    g.fillStyle = '#3a2614';
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = '#d9b15a';
    g.lineWidth = 10;
    g.strokeRect(10, 10, c.width - 20, c.height - 20);
    g.fillStyle = '#e8c766';
    g.font = '700 74px Cinzel, Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('ADVENTURER\'S GUILD', c.width / 2, c.height / 2 + 4, c.width - 60);
    t.needsUpdate = true;
  };
  paint();
  // (Paint again once the carved letters' font has loaded.)
  document.fonts?.load('700 74px Cinzel').then(paint).catch(() => {});
  return t;
}

export interface GuildHallBuilt {
  /** the doorstep, outside */
  door: THREE.Vector3;
  /** the porch, in front of the doors (where the regulars loiter) */
  porch: THREE.Vector3[];
  /** hang trophies on the rack by the door (ids of bounties brought in) */
  setTrophies(ids: string[]): void;
  update(dt: number, night: number): void;
}

export function buildGuildHall(scene: THREE.Scene, m: WorldMats): GuildHallBuilt {
  const { x, z, yaw, w: W, d: D } = GUILD_HALL;
  // Sit on the lowest corner so the plinth never floats.
  let gy = Infinity;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const cx = x + (Math.cos(yaw) * sx * W) / 2 + (Math.sin(yaw) * sz * D) / 2;
    const cz = z - (Math.sin(yaw) * sx * W) / 2 + (Math.cos(yaw) * sz * D) / 2;
    gy = Math.min(gy, heightAt(cx, cz));
  }
  const root = new THREE.Group();
  root.position.set(x, gy, z);
  root.rotation.y = yaw;
  const solid = new THREE.Group(); // batched (static, no special materials)
  const live = new THREE.Group(); // kept as meshes (canvas textures, glow)
  root.add(solid, live);

  const B = (mat: THREE.Material, w: number, h: number, d: number, px: number, py: number, pz: number, rx = 0, ry = 0, rz = 0, uv = 1.5) => {
    const mesh = new THREE.Mesh(worldUV(new THREE.BoxGeometry(w, h, d), uv), mat);
    mesh.position.set(px, py, pz);
    mesh.rotation.set(rx, ry, rz);
    solid.add(mesh);
    return mesh;
  };
  const stone = m.bridgeStone ?? m.stone;
  const PL = 0.8, G1 = 4.6, G2 = 4.0, J = 0.45;
  const top1 = PL + G1, top2 = top1 + G2;

  // ---- the body ------------------------------------------------------------------------
  B(m.stone, W + 0.6, PL + 2, D + 0.6, 0, PL / 2 - 1, 0);
  B(stone, W, G1, D, 0, PL + G1 / 2, 0, 0, 0, 0, 2);
  // Quoins: big corner stones up the ground floor.
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) for (let i = 0; i < 6; i++) B(m.stone, 0.7, 0.62, 0.7, sx * (W / 2 - 0.25), PL + 0.35 + i * 0.75, sz * (D / 2 - 0.25));
  // A string course, then the jettied timber floor.
  B(m.timber, W + 2 * J + 0.2, 0.3, D + 2 * J + 0.2, 0, top1 + 0.15, 0);
  B(m.plaster, W + 2 * J, G2, D + 2 * J, 0, top1 + 0.3 + G2 / 2, 0, 0, 0, 0, 2);
  // The timber frame on the upper floor: posts, a rail and braces.
  for (const face of [-1, 1]) {
    for (let i = 0; i <= 10; i++) {
      const px = -W / 2 - J + (i * (W + 2 * J)) / 10;
      B(m.timber, 0.24, G2, 0.12, px, top1 + 0.3 + G2 / 2, face * (D / 2 + J + 0.02));
      if (i < 10 && i % 2 === 0) B(m.timber, 0.16, Math.hypot(2.1, G2) * 0.92, 0.1, px + 1.05, top1 + 0.3 + G2 / 2, face * (D / 2 + J + 0.03), 0, 0, (i % 4 ? 1 : -1) * 0.48);
    }
    B(m.timber, W + 2 * J, 0.18, 0.12, 0, top1 + 0.3 + G2 * 0.5, face * (D / 2 + J + 0.04));
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i <= 7; i++) B(m.timber, 0.12, G2, 0.24, side * (W / 2 + J + 0.02), top1 + 0.3 + G2 / 2, -D / 2 - J + (i * (D + 2 * J)) / 7);
  }
  // ---- the roof: a steep slate gable along the length, with dormers ----------------------
  const RH = 5.2, ov = 0.7, rw = (D + 2 * J) / 2 + ov;
  const slope = Math.atan2(RH, rw), len = Math.hypot(RH, rw);
  for (const s of [-1, 1]) B(m.slate, W + 2 * J + 2 * ov, 0.3, len, 0, top2 + 0.3 + RH / 2, (s * rw) / 2, s * slope, 0, 0);
  // Gable ends (triangles of plaster).
  const gable = new THREE.Shape([new THREE.Vector2(-(D + 2 * J) / 2, 0), new THREE.Vector2((D + 2 * J) / 2, 0), new THREE.Vector2(0, RH)]);
  for (const s of [-1, 1]) {
    const gg = new THREE.Mesh(worldUV(new THREE.ExtrudeGeometry(gable, { depth: 0.2, bevelEnabled: false }), 2), m.plaster);
    gg.rotation.y = Math.PI / 2;
    gg.position.set(s * (W / 2 + J) - 0.1, top2 + 0.3, 0);
    solid.add(gg);
  }
  B(m.timber, W + 2 * J + 2 * ov, 0.35, 0.35, 0, top2 + 0.3 + RH + 0.05, 0);
  for (const dx of [-6, 0, 6]) {
    B(m.plaster, 2.4, 1.8, 1.6, dx, top2 + 1.6, D / 2 + J - 0.2);
    for (const s of [-1, 1]) B(m.slate, 1.7, 0.16, 2.1, dx + s * 0.75, top2 + 2.75, D / 2 + J - 0.2, 0, 0, -s * 0.75);
  }
  // Chimneys.
  for (const dx of [-W / 2 + 2, W / 2 - 3]) B(stone, 1.3, 4, 1.3, dx, top2 + RH - 0.6, -2.4);

  // ---- the bell tower, at the back corner -------------------------------------------------
  const TX = W / 2 - 2.6, TZ = -D / 2 - 1.2, TS = 4.6, TH = 15.5;
  B(stone, TS, TH, TS, TX, TH / 2, TZ, 0, 0, 0, 2);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) for (let i = 0; i < 12; i++) B(m.stone, 0.6, 0.6, 0.6, TX + sx * (TS / 2 - 0.2), PL + i * 1.2, TZ + sz * (TS / 2 - 0.2));
  // The open belfry: four corner posts, a rail, the bell.
  const BF = TH, BH = 3.2;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B(m.timber, 0.45, BH, 0.45, TX + sx * (TS / 2 - 0.3), BF + BH / 2, TZ + sz * (TS / 2 - 0.3));
  B(m.timber, TS + 0.3, 0.3, TS + 0.3, TX, BF + 0.15, TZ);
  B(m.timber, TS + 0.3, 0.3, TS + 0.3, TX, BF + BH, TZ);
  const bellMat = new THREE.MeshStandardMaterial({ color: 0xb08a3a, metalness: 0.85, roughness: 0.35 });
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.0, 1.4, 16, 1, true), bellMat);
  bell.position.set(TX, BF + BH - 1.0, TZ);
  live.add(bell);
  // A steep pyramid roof and the banner pole.
  const spire = new THREE.Mesh(new THREE.ConeGeometry(TS * 0.78, 4.8, 4), m.slate);
  spire.rotation.y = Math.PI / 4;
  spire.position.set(TX, BF + BH + 2.4, TZ);
  solid.add(spire);
  B(m.timber, 0.14, 4.2, 0.14, TX, BF + BH + 6.6, TZ);
  const emblem = guildEmblem();
  const bannerMat = new THREE.MeshStandardMaterial({ map: emblem, side: THREE.DoubleSide, roughness: 0.9 });
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5, 8, 1), bannerMat);
  flag.position.set(TX + 1.25, BF + BH + 7.8, TZ);
  live.add(flag);

  // ---- the front: doors, porch, sign, banners, windows ------------------------------------
  const FZ = D / 2;
  // Double doors in a stone arch.
  B(m.stone, 3.8, 0.6, 0.6, 0, PL + 3.6, FZ + 0.15);
  for (const s of [-1, 1]) B(m.stone, 0.6, 3.6, 0.6, s * 1.6, PL + 1.8, FZ + 0.15);
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x4a2e18, roughness: 0.8 });
  for (const s of [-1, 1]) {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.25, 3.2, 0.12), doorMat);
    leaf.position.set(s * 0.64, PL + 1.6, FZ + 0.05);
    live.add(leaf);
    for (const yy of [0.8, 2.4]) B(m.timber, 1.2, 0.1, 0.06, s * 0.64, PL + yy, FZ + 0.13);
  }
  // The porch: a stone platform, four posts, a lean-to roof.
  const PD = 3.4, PW = 9;
  B(m.stone, PW, PL + 0.2, PD, 0, PL / 2 + 0.05, FZ + PD / 2);
  for (let i = 0; i < 3; i++) B(m.stone, 2.6, 0.25 * (i + 1), 0.5, 0, (0.25 * (i + 1)) / 2, FZ + PD + 0.25 + (2 - i) * 0.5);
  const posts: THREE.Vector3[] = [];
  for (const px of [-PW / 2 + 0.3, -1.6, 1.6, PW / 2 - 0.3]) {
    B(m.timber, 0.32, 3.4, 0.32, px, PL + 1.7, FZ + PD - 0.3);
    posts.push(new THREE.Vector3(px, PL + 1.7, FZ + PD - 0.3));
  }
  B(m.timber, PW + 0.4, 0.3, 0.3, 0, PL + 3.5, FZ + PD - 0.3);
  B(m.slate, PW + 1, 0.2, PD + 1, 0, PL + 4.0, FZ + PD / 2, 0.22, 0, 0);
  // Benches either side of the door.
  for (const s of [-1, 1]) {
    B(m.planks, 2.4, 0.12, 0.5, s * 3.1, PL + 0.5, FZ + 0.6);
    for (const k of [-1, 1]) B(m.timber, 0.12, 0.45, 0.4, s * 3.1 + k, PL + 0.25, FZ + 0.6);
  }
  // The carved sign over the doors.
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.28), new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.7 }));
  sign.position.set(0, PL + 4.75, FZ + J + 0.08);
  live.add(sign);
  // Banners hanging either side of the doors.
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.25), bannerMat);
    b.position.set(s * 2.75, PL + 2.6, FZ + 0.33);
    live.add(b);
    B(m.timber, 1.6, 0.08, 0.08, s * 2.75, PL + 3.75, FZ + 0.33);
  }
  // Windows: tall arched ones below, square ones above; they glow at night.
  const glow = new THREE.MeshStandardMaterial({ color: 0x2c3440, emissive: 0xffa040, emissiveIntensity: 0.28, roughness: 0.25, metalness: 0.2 });
  const win = (w: number, h: number, px: number, py: number, pz: number, ry: number) => {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glow);
    g.position.set(px, py, pz);
    g.rotation.y = ry;
    live.add(g);
    const n = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
    const f = (fw: number, fh: number, ox: number, oy: number) => {
      const t = new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry));
      B(m.timber, fw, fh, 0.14, px + t.x * ox + n.x * 0.04, py + oy, pz + t.z * ox + n.z * 0.04, 0, ry);
    };
    f(w + 0.24, 0.14, 0, h / 2); f(w + 0.24, 0.14, 0, -h / 2); f(0.14, h, w / 2, 0); f(0.14, h, -w / 2, 0); f(0.08, h, 0, 0);
  };
  for (const px of [-7.5, -5, 5, 7.5]) win(1.3, 2.2, px, PL + 2.2, FZ + 0.02, 0);
  for (const px of [-8, -4.8, -1.6, 1.6, 4.8, 8]) win(1.2, 1.4, px, top1 + 2.3, FZ + J + 0.04, 0);
  for (const s of [-1, 1]) {
    for (const pz of [-4, 0, 4]) {
      win(1.3, 2.2, s * (W / 2 + 0.02), PL + 2.2, pz, s * Math.PI / 2);
      win(1.2, 1.4, s * (W / 2 + J + 0.04), top1 + 2.3, pz, s * Math.PI / 2);
    }
  }
  // Porch lanterns.
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffd28a, emissive: 0xffb050, emissiveIntensity: 0.6 });
  const lamps: THREE.Mesh[] = [];
  for (const p of [posts[1], posts[2]]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.42, 0.28), lampMat);
    l.position.set(p.x, PL + 2.8, p.z + 0.3);
    live.add(l);
    lamps.push(l);
  }

  // ---- the trophy rack, by the porch: heads and horns from bounties brought in -------------
  const rack = new THREE.Group();
  rack.position.set(-PW / 2 - 1.6, 0, FZ + 1.2);
  live.add(rack);
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.2, 0.22), m.timber);
    post.position.set(s * 1.3, PL + 1.6, 0);
    rack.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(3, 0.24, 0.24), m.timber);
  beam.position.set(0, PL + 3.0, 0);
  rack.add(beam);
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.9, 0.1), m.planks);
  board.position.set(0, PL + 1.9, -0.05);
  rack.add(board);
  const boneMat = new THREE.MeshStandardMaterial({ color: 0xe0d6be, roughness: 0.8 });
  const furMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 });
  const trophyGroup = new THREE.Group();
  rack.add(trophyGroup);
  const trophy = (i: number, id: string) => {
    const g = new THREE.Group();
    const col = i % 3, row = Math.floor(i / 3);
    g.position.set(-0.85 + col * 0.85, PL + 2.4 - row * 0.75, 0.12);
    const h = Array.from(id).reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), (h & 1) ? furMat : boneMat);
    skull.scale.set(1, 0.85, 1.25);
    g.add(skull);
    const hornL = 0.25 + ((h >> 3) % 5) * 0.06;
    for (const s of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, hornL, 6), boneMat);
      horn.position.set(s * 0.17, 0.16, -0.02);
      horn.rotation.z = -s * (0.5 + ((h >> 5) % 3) * 0.2);
      g.add(horn);
    }
    trophyGroup.add(g);
  };

  // ---- into the world ----------------------------------------------------------------------
  root.updateMatrixWorld(true);
  const batch = new StaticBatch();
  batch.addObject(solid);
  root.remove(solid);
  batch.build(scene, 120);
  scene.add(root);
  // Colliders: the body, the tower, the porch posts and platform, the rack.
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
  const wp = (lx: number, ly: number, lz: number) => new THREE.Vector3(lx, ly, lz).applyMatrix4(root.matrixWorld);
  physics.addBox(wp(0, PL + G1, 0), new THREE.Vector3(W / 2 + J, PL + G1, D / 2), q);
  physics.addBox(wp(TX, TH / 2, TZ), new THREE.Vector3(TS / 2, TH / 2, TS / 2), q);
  physics.addBox(wp(0, PL / 2 - 0.2, FZ + PD / 2), new THREE.Vector3(PW / 2, PL / 2 + 0.1, PD / 2), q);
  for (const p of [posts[0], posts[3]]) physics.addBox(wp(p.x, p.y, p.z), new THREE.Vector3(0.18, 1.7, 0.18), q);
  physics.addBox(wp(-PW / 2 - 1.6, PL + 1.6, FZ + 1.2), new THREE.Vector3(1.5, 1.6, 0.2), q);
  // The door: inside is the guild (world/interior.ts).
  registerDoor(root, new THREE.Vector3(0, PL, FZ + PD + 0.6), { w: W, d: D, floors: 2, roof: 'slate', seed: 90 }, { kind: 'guild', name: 'the Guild Hall', keeper: 'registrar' });

  let t = 0;
  return {
    door: wp(0, PL, FZ + PD + 0.8),
    porch: [wp(-2.6, PL, FZ + 1.6), wp(2.6, PL, FZ + 1.6), wp(-3.8, 0, FZ + PD + 2.2), wp(3.8, 0, FZ + PD + 2.2)],
    setTrophies(ids: string[]) {
      for (const c of [...trophyGroup.children]) trophyGroup.remove(c);
      ids.slice(0, 9).forEach((id, i) => trophy(i, id));
    },
    update(dt: number, night: number) {
      t += dt;
      // The banner stirs; lanterns and windows warm up at night.
      const pos = flag.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const u = (pos.getX(i) + 1.2) / 2.4;
        pos.setZ(i, Math.sin(t * 3 + u * 4) * 0.18 * u);
      }
      pos.needsUpdate = true;
      lampMat.emissiveIntensity = 0.4 + night * 2.2;
      glow.emissiveIntensity = 0.28 + night * 0.9;
    },
  };
}
