import * as THREE from 'three';

// Shields for the catalog (the item plan, §3): six shapes, each in any tier's
// colours. Grip space as the other shields (items/weaponModels.ts): the board
// lies in XY with its face toward +Z and the hand at the origin.

export type ShieldShape = 'buckler' | 'round' | 'heater' | 'kite' | 'tower' | 'targe' | 'pavise' | 'scutum' | 'hatch' | 'shell';

export interface ShieldLook {
  shape: ShieldShape;
  /** the face: painted wood, metal, shell */
  face: number;
  /** a second colour: a stripe, a crest, the boss */
  accent: number;
  /** the rim and the boss */
  rim: number;
  /** the face is metal (shiny) rather than wood */
  metalFace?: boolean;
  /** a glowing rim (star and dusk tiers) */
  glow?: number;
  /** a device painted on the face */
  device?: 'quartered' | 'chevron' | 'pale' | 'sun' | 'stars' | 'wave' | 'cross' | 'none';
  /** spikes on the boss (a spiked targe) */
  spikes?: number;
}

function outline(shape: ShieldShape): { s: THREE.Shape; w: number; top: number; bot: number } {
  const s = new THREE.Shape();
  switch (shape) {
    case 'buckler': case 'round': case 'targe': case 'shell': {
      const R = shape === 'buckler' ? 0.2 : shape === 'targe' ? 0.32 : shape === 'shell' ? 0.36 : 0.38;
      s.absarc(0, 0, R, 0, Math.PI * 2, false);
      return { s, w: R, top: R, bot: -R };
    }
    case 'heater': {
      const W = 0.3, T = 0.34, B = -0.42;
      s.moveTo(-W, T);
      s.lineTo(W, T);
      s.bezierCurveTo(W, -0.05, W * 0.6, B * 0.6, 0, B);
      s.bezierCurveTo(-W * 0.6, B * 0.6, -W, -0.05, -W, T);
      return { s, w: W, top: T, bot: B };
    }
    case 'kite': {
      const W = 0.3, T = 0.36, B = -0.56;
      s.moveTo(-W, T);
      s.quadraticCurveTo(0, T + 0.06, W, T);
      s.bezierCurveTo(W, 0, W * 0.5, B * 0.5, 0, B);
      s.bezierCurveTo(-W * 0.5, B * 0.5, -W, 0, -W, T);
      return { s, w: W, top: T + 0.06, bot: B };
    }
    case 'tower': case 'pavise': case 'scutum': case 'hatch': {
      const W = shape === 'hatch' ? 0.34 : 0.32, T = shape === 'pavise' ? 0.5 : 0.55, B = -0.6;
      s.moveTo(-W, B);
      s.lineTo(W, B);
      s.lineTo(W, T - 0.05);
      if (shape === 'pavise') s.lineTo(0, T + 0.08);
      else s.quadraticCurveTo(W, T, W - 0.05, T);
      if (shape !== 'pavise') s.lineTo(-W + 0.05, T);
      s.quadraticCurveTo(-W, T, -W, T - 0.05);
      s.lineTo(-W, B);
      return { s, w: W, top: T, bot: B };
    }
  }
}

const texCache = new Map<string, THREE.Texture>();
function faceTexture(L: ShieldLook) {
  const key = JSON.stringify([L.face, L.accent, L.device, L.metalFace, L.shape]);
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const css = (n: number) => '#' + n.toString(16).padStart(6, '0');
  g.fillStyle = css(L.face);
  g.fillRect(0, 0, 128, 128);
  if (!L.metalFace) {
    // Boards: dark seams and grain.
    g.globalAlpha = 0.25;
    g.fillStyle = '#000';
    for (let x = 0; x < 128; x += 21) g.fillRect(x, 0, 2, 128);
    g.globalAlpha = 0.08;
    for (let i = 0; i < 160; i++) g.fillRect(Math.random() * 128, Math.random() * 128, 1, 6 + Math.random() * 10);
    g.globalAlpha = 1;
  }
  g.fillStyle = css(L.accent);
  switch (L.device) {
    case 'quartered': g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64); break;
    case 'chevron': g.beginPath(); g.moveTo(0, 90); g.lineTo(64, 40); g.lineTo(128, 90); g.lineTo(128, 115); g.lineTo(64, 65); g.lineTo(0, 115); g.fill(); break;
    case 'pale': g.fillRect(48, 0, 32, 128); break;
    case 'cross': g.fillRect(52, 0, 24, 128); g.fillRect(0, 44, 128, 24); break;
    case 'sun': {
      g.beginPath(); g.arc(64, 64, 22, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 12; i++) { g.save(); g.translate(64, 64); g.rotate((i / 12) * Math.PI * 2); g.fillRect(-3, 26, 6, 26); g.restore(); }
      break;
    }
    case 'stars': for (let i = 0; i < 26; i++) { const r = Math.random() * 2 + 0.8; g.beginPath(); g.arc(Math.random() * 128, Math.random() * 128, r, 0, Math.PI * 2); g.fill(); } break;
    case 'wave': g.lineWidth = 6; g.strokeStyle = css(L.accent); for (let y = 24; y < 128; y += 30) { g.beginPath(); for (let x = 0; x <= 128; x += 4) g.lineTo(x, y + Math.sin(x / 10) * 6); g.stroke(); } break;
  }
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

export function buildShield(L: ShieldLook): THREE.Group {
  const g = new THREE.Group();
  const { s, w, top, bot } = outline(L.shape);
  const depth = L.shape === 'buckler' ? 0.012 : 0.022;
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.004, bevelSegments: 2, curveSegments: 32 });
  const pa = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const round = L.shape === 'buckler' || L.shape === 'round' || L.shape === 'targe' || L.shape === 'shell';
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), y = pa.getY(i);
    // Dish the round ones; curve the long ones around the arm.
    const bend = round ? -((x * x + y * y) / (w * w)) * 0.06 : -(x * x) * (L.shape === 'scutum' ? 1.6 : 0.8);
    pa.setZ(i, pa.getZ(i) + bend);
    uv.setXY(i, (x + w) / (2 * w), (y - bot) / (top - bot));
  }
  geo.computeVertexNormals();
  const faceMat = new THREE.MeshStandardMaterial({ map: faceTexture(L), roughness: L.metalFace ? 0.35 : 0.8, metalness: L.metalFace ? 0.75 : 0 });
  const rimMat = new THREE.MeshStandardMaterial({ color: L.rim, roughness: 0.35, metalness: 0.85, ...(L.glow ? { emissive: new THREE.Color(L.glow), emissiveIntensity: 0.6 } : {}) });
  const board = new THREE.Mesh(geo, faceMat);
  g.add(board);
  // The rim: a tube along the outline.
  const pts = s.getPoints(48).map((p) => {
    const bend = round ? -((p.x * p.x + p.y * p.y) / (w * w)) * 0.06 : -(p.x * p.x) * (L.shape === 'scutum' ? 1.6 : 0.8);
    return new THREE.Vector3(p.x, p.y, depth + 0.004 + bend);
  });
  const rim = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 96, L.shape === 'buckler' ? 0.008 : 0.011, 6, true), rimMat);
  g.add(rim);
  // A boss in the middle (the hand is behind it).
  if (L.shape !== 'hatch') {
    const R = L.shape === 'buckler' ? 0.07 : 0.085;
    const boss = new THREE.Mesh(new THREE.SphereGeometry(R, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), rimMat);
    boss.rotation.x = Math.PI / 2;
    boss.position.z = depth + 0.002;
    g.add(boss);
    for (let i = 0; i < (L.spikes ?? 0); i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.014, i === 0 ? 0.16 : 0.07, 8), rimMat);
      sp.rotation.x = Math.PI / 2;
      const a = (i / Math.max(1, (L.spikes ?? 1) - 1)) * Math.PI * 2;
      if (i === 0) sp.position.set(0, 0, depth + R + 0.06);
      else sp.position.set(Math.cos(a) * R * 1.8, Math.sin(a) * R * 1.8, depth + 0.03);
      g.add(sp);
    }
  } else {
    // A ship's hatch-lid: iron straps and a ring pull.
    for (const y of [-0.3, 0.25]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(w * 2, 0.05, 0.01), rimMat);
      strap.position.set(0, y, depth + 0.004 - 0.02);
      g.add(strap);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 16), rimMat);
    ring.position.z = depth + 0.01;
    g.add(ring);
  }
  // The back: a strap for the arm.
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.02), new THREE.MeshStandardMaterial({ color: 0x4a2e1a, roughness: 0.8 }));
  strap.position.z = -0.02;
  g.add(strap);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return g;
}
