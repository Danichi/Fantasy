import * as THREE from 'three';
import { mats, paintedWood, heraldryQuartered, heraldryChevron } from './materials';

// Weapons are modelled in "grip space": origin in the centre of the fist,
// +Y out of the thumb side (blade direction), +Z = blade flat normal.
// Shields: origin at the handle, +Y up, +Z out of the shield face.

export interface SwordSpec {
  bladeLen: number;
  bladeWidth: number; // half-width at the base
  thickness: number; // half-thickness
  fullerLen: number; // fraction of the blade with a fuller
  gripLen: number;
  guardSpan: number; // half-span of the crossguard
  guardStyle: 'straight' | 'curved';
  pommel: 'wheel' | 'pear';
  guardMat?: 'darkSteel' | 'brass';
}

/** Lofted blade with bevelled edges, a fuller and a tapered point. */
function bladeGeometry(s: SwordSpec) {
  const SEG = 28;
  const ring: [number, number][] = [];
  const pos: number[] = [];
  const uv: number[] = [];
  const rings: THREE.Vector3[][] = [];
  const vs: number[] = [];
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    const y = t * s.bladeLen;
    // Distal taper plus a curved profile into the point.
    let w = s.bladeWidth * (1 - 0.3 * t);
    const tipStart = 0.8;
    if (t > tipStart) w *= Math.sqrt(Math.max(0, 1 - (t - tipStart) / (1 - tipStart))) ;
    const th = s.thickness * (1 - 0.45 * t);
    const fuller = t < s.fullerLen ? th * 0.45 * Math.min(1, (s.fullerLen - t) * 12) : 0;
    ring.length = 0;
    ring.push(
      [w, 0], [w * 0.6, th * 0.72], [w * 0.24, th], [0, th - fuller], [-w * 0.24, th], [-w * 0.6, th * 0.72],
      [-w, 0], [-w * 0.6, -th * 0.72], [-w * 0.24, -th], [0, -(th - fuller)], [w * 0.24, -th], [w * 0.6, -th * 0.72],
    );
    rings.push(ring.map(([x, z]) => new THREE.Vector3(x, y, z)));
    vs.push(t);
  }
  const tip = new THREE.Vector3(0, s.bladeLen + 0.004, 0);
  const R = 12;
  for (let i = 0; i < SEG; i++) {
    for (let k = 0; k < R; k++) {
      const a = rings[i][k], b = rings[i][(k + 1) % R], c = rings[i + 1][k], d = rings[i + 1][(k + 1) % R];
      pos.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z);
      const u0 = k / R, u1 = (k + 1) / R;
      uv.push(u0, vs[i], u0, vs[i + 1], u1, vs[i], u1, vs[i], u0, vs[i + 1], u1, vs[i + 1]);
    }
  }
  const last = rings[SEG];
  for (let k = 0; k < R; k++) {
    const a = last[k], b = last[(k + 1) % R];
    pos.push(a.x, a.y, a.z, tip.x, tip.y, tip.z, b.x, b.y, b.z);
    uv.push(k / R, 1, (k + 0.5) / R, 1, (k + 1) / R, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function guardGeometry(s: SwordSpec) {
  const sh = new THREE.Shape();
  const W = s.guardSpan, H = 0.011;
  if (s.guardStyle === 'curved') {
    // Quillons sweep gently toward the blade and flare at the tips.
    sh.moveTo(-W, 0.012);
    sh.quadraticCurveTo(-W * 0.5, -H, 0, -H);
    sh.quadraticCurveTo(W * 0.5, -H, W, 0.012);
    sh.lineTo(W + 0.004, 0.03);
    sh.quadraticCurveTo(W * 0.5, H * 0.4, 0, H);
    sh.quadraticCurveTo(-W * 0.5, H * 0.4, -W - 0.004, 0.03);
    sh.closePath();
  } else {
    sh.moveTo(-W, -H);
    sh.lineTo(W, -H);
    sh.lineTo(W + 0.006, H * 1.3);
    sh.lineTo(-W - 0.006, H * 1.3);
    sh.closePath();
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.018, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -0.009);
  return g;
}

export function buildSword(s: SwordSpec) {
  const m = mats();
  const g = new THREE.Group();
  const guardY = s.gripLen / 2 + 0.012;

  const blade = new THREE.Mesh(bladeGeometry(s), m.blade);
  blade.position.y = guardY + 0.01;
  g.add(blade);

  const guard = new THREE.Mesh(guardGeometry(s), m[s.guardMat ?? 'darkSteel']);
  guard.position.y = guardY;
  g.add(guard);

  // Grip: slightly barrelled leather-wrapped core.
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    prof.push(new THREE.Vector2(0.0135 + Math.sin(t * Math.PI) * 0.0025, -s.gripLen / 2 + t * s.gripLen));
  }
  const grip = new THREE.Mesh(new THREE.LatheGeometry(prof, 14), m.gripLeather);
  g.add(grip);
  // Ferrules at each end of the grip.
  for (const y of [-s.gripLen / 2, s.gripLen / 2]) {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.0165, 0.0165, 0.008, 14), m[s.guardMat ?? 'darkSteel']);
    f.position.y = y;
    g.add(f);
  }

  // Pommel.
  let pommelGeo: THREE.BufferGeometry;
  if (s.pommel === 'wheel') {
    pommelGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.018, 24);
    pommelGeo.rotateX(Math.PI / 2);
    const boss = new THREE.CylinderGeometry(0.014, 0.014, 0.026, 16);
    boss.rotateX(Math.PI / 2);
    const bm = new THREE.Mesh(boss, m[s.guardMat ?? 'darkSteel']);
    bm.position.y = -s.gripLen / 2 - 0.03;
    g.add(bm);
  } else {
    const pts = [
      new THREE.Vector2(0.001, -0.05), new THREE.Vector2(0.012, -0.047), new THREE.Vector2(0.022, -0.035),
      new THREE.Vector2(0.024, -0.02), new THREE.Vector2(0.016, -0.004), new THREE.Vector2(0.01, 0),
    ];
    pommelGeo = new THREE.LatheGeometry(pts, 18);
    pommelGeo.translate(0, 0.022, 0);
  }
  const pommel = new THREE.Mesh(pommelGeo, m[s.guardMat ?? 'darkSteel']);
  pommel.position.y = -s.gripLen / 2 - 0.03;
  g.add(pommel);

  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  g.userData.bladeBase = guardY + 0.01;
  g.userData.bladeTip = guardY + 0.01 + s.bladeLen;
  return g;
}

/** Domed round shield: painted planks, iron rim, central boss, rivets. */
export function buildRoundShield(paint: 'quartered' | 'plain', colors: [string, string] = ['#7a1d1a', '#d9c7a0']) {
  const m = mats();
  const g = new THREE.Group();
  const R = 0.38;
  const woodTex = paintedWood(29, paint === 'quartered' ? heraldryQuartered(colors[0], colors[1]) : () => {}, 7);
  const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.78, metalness: 0 });
  const backMat = new THREE.MeshStandardMaterial({ map: paintedWood(31, () => {}, 7), roughness: 0.85, color: 0x9a8a78 });

  // Face: a shallow dome.
  const face = new THREE.CircleGeometry(R, 48, 0, Math.PI * 2);
  const pa = face.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), y = pa.getY(i);
    const r2 = (x * x + y * y) / (R * R);
    pa.setZ(i, (1 - r2) * 0.045);
  }
  face.computeVertexNormals();
  const faceMesh = new THREE.Mesh(face, woodMat);
  const back = faceMesh.clone();
  back.material = backMat;
  back.rotation.y = Math.PI;
  back.position.z = -0.012;
  const edge = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.014, 48, 1, true), backMat);
  edge.rotation.x = Math.PI / 2;
  edge.position.z = -0.005;
  g.add(faceMesh, back, edge);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.011, 8, 64), m.iron);
  rim.scale.z = 1.5;
  rim.position.z = 0.0;
  g.add(rim);

  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.085, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), m.darkSteel);
  boss.rotation.x = Math.PI / 2;
  boss.position.z = 0.04;
  boss.scale.set(1, 0.75, 1);
  const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.008, 28), m.darkSteel);
  flange.rotation.x = Math.PI / 2;
  flange.position.z = 0.043;
  g.add(boss, flange);

  const rivetGeo = new THREE.SphereGeometry(0.008, 8, 6);
  const rivets = new THREE.InstancedMesh(rivetGeo, m.darkSteel, 20);
  const mm = new THREE.Matrix4();
  // 14 rivets around the rim, 6 around the boss flange.
  for (let i = 0; i < 20; i++) {
    const onRim = i < 14;
    const a = onRim ? (i / 14) * Math.PI * 2 : ((i - 14) / 6) * Math.PI * 2;
    const r = onRim ? R - 0.03 : 0.1;
    const z = onRim ? (1 - (r * r) / (R * R)) * 0.045 + 0.002 : 0.048;
    mm.makeTranslation(Math.cos(a) * r, Math.sin(a) * r, z);
    rivets.setMatrixAt(i, mm);
  }
  g.add(rivets);

  // Handle on the back.
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.14, 10), m.leather);
  handle.position.z = -0.05;
  g.add(handle);
  for (const y of [-0.075, 0.075]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.05), m.iron);
    post.position.set(0, y, -0.032);
    g.add(post);
  }

  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  // Grip sits at the fist: shift the whole shield so the handle is at the origin.
  const holder = new THREE.Group();
  g.position.z = 0.05;
  holder.add(g);
  holder.userData.radius = R;
  return holder;
}

/** Heater/kite shield: curved board, painted chevron, steel trim. */
export function buildKiteShield() {
  const m = mats();
  const outline = new THREE.Shape();
  const W = 0.3, TOP = 0.36, BOT = -0.5;
  outline.moveTo(-W, TOP);
  outline.quadraticCurveTo(0, TOP + 0.05, W, TOP);
  outline.bezierCurveTo(W, 0.0, W * 0.55, BOT * 0.55, 0, BOT);
  outline.bezierCurveTo(-W * 0.55, BOT * 0.55, -W, 0.0, -W, TOP);

  const geo = new THREE.ExtrudeGeometry(outline, { depth: 0.022, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.004, bevelSegments: 2, curveSegments: 24 });
  // Curve the board around the vertical axis.
  const pa = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), y = pa.getY(i);
    pa.setZ(i, pa.getZ(i) - (x * x) * 0.9);
    uv.setXY(i, (x + W) / (2 * W), (y - BOT) / (TOP + 0.05 - BOT));
  }
  geo.computeVertexNormals();
  const tex = paintedWood(41, heraldryChevron('#1d3b6b', '#d8b44a'), 5);
  const board = new THREE.Mesh(geo, [
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.72 }),
    new THREE.MeshStandardMaterial({ color: 0x4a3526, roughness: 0.9 }),
  ]);

  // Steel trim along the outline.
  const pts = outline.getSpacedPoints(90).map((p) => new THREE.Vector3(p.x, p.y, 0.028 - p.x * p.x * 0.9));
  const trim = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 160, 0.009, 6, true),
    m.darkSteel,
  );
  const g = new THREE.Group();
  g.add(board, trim);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.13, 10), m.leather);
  handle.position.z = -0.035;
  g.add(handle);
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  const holder = new THREE.Group();
  g.position.set(0, -0.02, 0.05);
  holder.add(g);
  holder.userData.radius = 0.42;
  return holder;
}

/**
 * Odachi: a very long, gently curved single-edged blade with a long wrapped
 * grip and a round tsuba. `scale` 1 = a 2.3 m warlord's blade.
 */
export function buildOdachi(scale = 1) {
  const m = mats();
  const g = new THREE.Group();
  const bladeLen = 1.62 * scale, gripLen = 0.52 * scale, width = 0.034 * scale, thick = 0.007 * scale, sori = 0.09 * scale;
  // Blade: loft a single-edged section (spine at -X, edge at +X) along a curve.
  const SEG = 36;
  const pos: number[] = [];
  const rings: THREE.Vector3[][] = [];
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    const y = t * bladeLen;
    const bend = sori * Math.sin(t * Math.PI * 0.9); // curve toward the spine
    let w = width * (1 - 0.25 * t);
    if (t > 0.9) w *= Math.max(0.05, 1 - (t - 0.9) / 0.1);
    const th = thick * (1 - 0.4 * t);
    const edgeLift = t > 0.9 ? (t - 0.9) / 0.1 * width * 0.6 : 0; // kissaki sweeps up to the spine
    rings.push([
      new THREE.Vector3(-w - bend, y, 0), // spine
      new THREE.Vector3(-w * 0.6 - bend, y, th),
      new THREE.Vector3(w * 0.4 - bend - edgeLift, y, th * 0.45),
      new THREE.Vector3(w - bend - edgeLift, y, 0), // edge
      new THREE.Vector3(w * 0.4 - bend - edgeLift, y, -th * 0.45),
      new THREE.Vector3(-w * 0.6 - bend, y, -th),
    ]);
  }
  for (let i = 0; i < SEG; i++) {
    for (let k = 0; k < 6; k++) {
      const a = rings[i][k], b = rings[i][(k + 1) % 6], c = rings[i + 1][k], d = rings[i + 1][(k + 1) % 6];
      pos.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z);
    }
  }
  const tip = rings[SEG][0].clone().setY(bladeLen + 0.02 * scale);
  for (let k = 0; k < 6; k++) {
    const a = rings[SEG][k], b = rings[SEG][(k + 1) % 6];
    pos.push(a.x, a.y, a.z, tip.x, tip.y, tip.z, b.x, b.y, b.z);
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  bg.computeVertexNormals();
  const bladeMat = m.blade.clone();
  bladeMat.color.set(0xd8dade);
  const blade = new THREE.Mesh(bg, bladeMat);
  const guardY = gripLen / 2 + 0.02 * scale;
  blade.position.y = guardY + 0.02 * scale;
  // Habaki (brass collar) and round tsuba.
  const habaki = new THREE.Mesh(new THREE.BoxGeometry(width * 2.3, 0.05 * scale, thick * 3.5), m.brass);
  habaki.position.y = guardY + 0.04 * scale;
  const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(0.075 * scale, 0.075 * scale, 0.012 * scale, 24), m.darkSteel);
  tsuba.position.y = guardY;
  // Long grip: dark wrap over pale ray-skin.
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.018 * scale, 0.02 * scale, gripLen, 12), m.gripLeather);
  const kashira = new THREE.Mesh(new THREE.CylinderGeometry(0.021 * scale, 0.019 * scale, 0.03 * scale, 12), m.darkSteel);
  kashira.position.y = -gripLen / 2 - 0.015 * scale;
  g.add(blade, habaki, tsuba, grip, kashira);
  g.traverse((o) => ((o as THREE.Mesh).isMesh && (o.castShadow = true)));
  g.userData.bladeBase = guardY + 0.05 * scale;
  g.userData.bladeTip = guardY + 0.02 * scale + bladeLen;
  return g;
}

/** Recurve war bow, held at the grip (+Y = upper limb, string toward -Z). */
export function buildBow(scale = 1) {
  const m = mats();
  const g = new THREE.Group();
  const H = 0.78 * scale;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20 * 2 - 1; // -1..1
    const y = t * H;
    // Limbs bow forward (+Z) then recurve back at the tips.
    const z = (1 - t * t) * 0.16 * scale - Math.pow(Math.abs(t), 6) * 0.1 * scale;
    pts.push(new THREE.Vector3(0, y, z));
  }
  const limb = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.018 * scale, 6), new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.6 }));
  const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.026 * scale, 0.026 * scale, 0.14 * scale, 8), m.leather);
  wrap.position.z = 0.16 * scale;
  const top = pts[0], bot = pts[pts.length - 1];
  const stringGeo = new THREE.BufferGeometry().setFromPoints([top, new THREE.Vector3(0, 0, top.z), bot]);
  const string = new THREE.Line(stringGeo, new THREE.LineBasicMaterial({ color: 0xd8d0b8 }));
  g.add(limb, wrap, string);
  g.traverse((o) => ((o as THREE.Mesh).isMesh && (o.castShadow = true)));
  // Grip at the origin.
  g.children.forEach((c) => (c.position.z -= 0.16 * scale));
  g.userData.string = string;
  g.userData.nock = new THREE.Vector3(0, 0, top.z - 0.16 * scale);
  return g;
}

export function buildArrow(scale = 1) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008 * scale, 0.008 * scale, 0.9 * scale, 5), new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.8 }));
  shaft.rotation.x = Math.PI / 2;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.022 * scale, 0.09 * scale, 4), mats().darkSteel);
  head.rotation.x = Math.PI / 2;
  head.position.z = 0.49 * scale;
  const fl = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, side: THREE.DoubleSide });
  for (let k = 0; k < 3; k++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.03 * scale, 0.12 * scale), fl);
    f.position.z = -0.4 * scale;
    f.rotation.set(Math.PI / 2, 0, (k / 3) * Math.PI * 2);
    f.translateX(0.015 * scale);
    g.add(f);
  }
  g.add(shaft, head);
  return g;
}
