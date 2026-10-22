import * as THREE from 'three';

// Fur as sculpted locks: thousands of small pointed tufts grown over the body,
// each lying along the fur direction, curving a little with gravity, flattened
// like a lock of hair and wider at the root. They are skinned with the body
// and shaded with the body's own normals, so the coat reads as one soft mass
// with a crisp, spiky outline: the painted-fur look of a storybook creature.

export interface TuftOpts {
  /** Upper bound on tufts. */
  budget: number;
  /** Ignore fur shorter than this (m): left to the body's own relief. */
  minLen: number;
  /** How far tufts stand off the skin (0 = flat along it, 1 = straight out). */
  lift: number;
  /** Extra bend toward the ground at the tip. */
  droop: number;
  /** Width relative to length, and limits (m). */
  widthK: number;
  minW: number;
  maxW: number;
  /** How many tufts overlap any one spot. */
  overlap: number;
  /** Colour at the root and tip, relative to the skin colour. */
  root: number;
  tip: number;
  /** Random brightness per tuft (grizzle). */
  vary: number;
  /** Fraction of tufts with pale tips, and how pale. */
  grizzle?: number;
  grizzleTint?: THREE.ColorRepresentation;
  seed?: number;
  /** Only grow where this returns true (e.g. split crest from coat). */
  where?: (p: THREE.Vector3, fur: number) => boolean;
  /** Override lift per tuft (e.g. a crest that stands up). */
  liftAt?: (p: THREE.Vector3, n: THREE.Vector3, fur: number) => number;
  /** 'lock' = a shaped lock of hair (9 triangles); 'hair' = a single fine spike (3 triangles). */
  shape?: 'lock' | 'hair';
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export function growTufts(src: THREE.BufferGeometry, o: TuftOpts) {
  const pos = src.getAttribute('position') as THREE.BufferAttribute;
  const nor = src.getAttribute('normal') as THREE.BufferAttribute;
  const fur = src.getAttribute('fur') as THREE.BufferAttribute;
  const flow = src.getAttribute('flow') as THREE.BufferAttribute;
  const col = src.getAttribute('color') as THREE.BufferAttribute;
  const si = src.getAttribute('skinIndex') as THREE.BufferAttribute;
  const sw = src.getAttribute('skinWeight') as THREE.BufferAttribute;
  const idx = src.index!.array;
  const rand = rng(o.seed ?? 1234);
  const wOf = (L: number) => THREE.MathUtils.clamp(L * o.widthK, o.minW, o.maxW);

  // Expected tufts per triangle: area x overlap / tuft footprint.
  const ntri = idx.length / 3;
  const want = new Float64Array(ntri);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3();
  let total = 0;
  for (let t = 0; t < ntri; t++) {
    const i0 = idx[t * 3], i1 = idx[t * 3 + 1], i2 = idx[t * 3 + 2];
    const L = (fur.getX(i0) + fur.getX(i1) + fur.getX(i2)) / 3;
    if (L < o.minLen) continue;
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    if (o.where && !o.where(p.copy(a).add(b).add(c).divideScalar(3), L)) continue;
    const area = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
    want[t] = (area * o.overlap) / (wOf(L) * L);
    total += want[t];
  }
  const scale = total > o.budget ? o.budget / total : 1;

  const P: number[] = [], N: number[] = [], C: number[] = [], SI: number[] = [], SW: number[] = [], TIP: number[] = [];
  const n = new THREE.Vector3(), f = new THREE.Vector3(), side = new THREE.Vector3(), d1 = new THREE.Vector3(), d2 = new THREE.Vector3();
  const cc = new THREE.Color(), tint = new THREE.Color(o.grizzleTint ?? 0xd8c4a0);
  const ring = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const mid = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const tipP = new THREE.Vector3();
  const nn = new THREE.Vector3();
  let made = 0;
  for (let t = 0; t < ntri; t++) {
    let k = want[t] * scale;
    while (k > 0) {
      // (`continue` below moves on to the next tuft in this triangle)
      if (k < 1 && rand() > k) break;
      k -= 1;
      const i0 = idx[t * 3], i1 = idx[t * 3 + 1], i2 = idx[t * 3 + 2];
      let u = rand(), v = rand();
      if (u + v > 1) {
        u = 1 - u;
        v = 1 - v;
      }
      const w0 = 1 - u - v;
      const bary = (attr: THREE.BufferAttribute, out: THREE.Vector3) =>
        out.set(
          attr.getX(i0) * w0 + attr.getX(i1) * u + attr.getX(i2) * v,
          attr.getY(i0) * w0 + attr.getY(i1) * u + attr.getY(i2) * v,
          attr.getZ(i0) * w0 + attr.getZ(i1) * u + attr.getZ(i2) * v,
        );
      bary(pos, p);
      bary(nor, n).normalize();
      bary(flow, f);
      f.addScaledVector(n, -f.dot(n));
      if (f.lengthSq() < 1e-6) f.set(0, -1, 0).addScaledVector(n, -n.y);
      f.normalize();
      const L0 = fur.getX(i0) * w0 + fur.getX(i1) * u + fur.getX(i2) * v;
      const L = L0 * (0.75 + rand() * 0.5);
      const W = wOf(L) * (0.8 + rand() * 0.4);
      const lift = o.liftAt ? o.liftAt(p, n, L0) : o.lift;
      // A little random swirl so the coat isn't combed perfectly.
      f.applyAxisAngle(n, (rand() - 0.5) * 0.5);
      side.crossVectors(n, f).normalize();
      d1.copy(f).multiplyScalar(1 - lift).addScaledVector(n, lift + 0.08).normalize();
      d2.copy(d1).addScaledVector(f, 0.35).add(new THREE.Vector3(0, -o.droop, 0)).normalize();
      // Root triangle (left, right, ridge), sunk a little into the skin.
      const base = p.clone().addScaledVector(n, -W * 0.25);
      ring[0].copy(base).addScaledVector(side, W);
      ring[1].copy(base).addScaledVector(side, -W);
      ring[2].copy(base).addScaledVector(n, W * 0.55);
      const m = base.clone().addScaledVector(d1, L * 0.5);
      mid[0].copy(m).addScaledVector(side, W * 0.62);
      mid[1].copy(m).addScaledVector(side, -W * 0.62);
      mid[2].copy(m).addScaledVector(n, W * 0.4);
      tipP.copy(m).addScaledVector(d2, L * 0.5);

      // Colour: skin colour, darker at the root, paler at the tip, grizzled.
      bary(col as THREE.BufferAttribute, nn);
      cc.setRGB(nn.x, nn.y, nn.z);
      const vary = 1 + (rand() - 0.5) * 2 * o.vary;
      const griz = rand() < (o.grizzle ?? 0) ? 0.35 + rand() * 0.3 : 0;
      // Skin weights: from the nearest corner.
      const near = w0 >= u && w0 >= v ? i0 : u >= v ? i1 : i2;
      const s4 = [si.getX(near), si.getY(near), si.getZ(near), si.getW(near)];
      const w4 = [sw.getX(near), sw.getY(near), sw.getZ(near), sw.getW(near)];
      const push = (q: THREE.Vector3, along: number, outward: THREE.Vector3) => {
        P.push(q.x, q.y, q.z);
        // Mostly the body's normal, a little of the lock's own shape.
        nn.copy(n).multiplyScalar(0.75).addScaledVector(outward, 0.25).normalize();
        N.push(nn.x, nn.y, nn.z);
        const shade = (o.root + (o.tip - o.root) * along) * vary;
        const r = cc.r * shade, g = cc.g * shade, bl = cc.b * shade;
        const gz = griz * along * along;
        C.push(r + (tint.r - r) * gz, g + (tint.g - g) * gz, bl + (tint.b - bl) * gz);
        SI.push(...s4);
        SW.push(...w4);
        TIP.push(along);
      };
      const out0 = side, out1 = side.clone().negate(), out2 = n;
      const outs = [out0, out1, out2];
      if (o.shape === 'hair') {
        // A fine spike: three faces from the root ring straight to a curved tip.
        tipP.copy(base).addScaledVector(d1, L * 0.55).addScaledVector(d2, L * 0.45);
        for (let s = 0; s < 3; s++) {
          const s2 = (s + 1) % 3;
          const o1 = outs[s].clone().add(outs[s2]).normalize();
          push(ring[s], 0, o1);
          push(ring[s2], 0, o1);
          push(tipP, 1, d2);
        }
        made++;
        continue;
      }
      // Sides: root ring -> mid ring -> tip.
      for (let s = 0; s < 3; s++) {
        const s2 = (s + 1) % 3;
        const o1 = outs[s].clone().add(outs[s2]).normalize();
        push(ring[s], 0, o1);
        push(mid[s], 0.5, o1);
        push(ring[s2], 0, o1);
        push(ring[s2], 0, o1);
        push(mid[s], 0.5, o1);
        push(mid[s2], 0.5, o1);
        push(mid[s], 0.5, o1);
        push(tipP, 1, d2);
        push(mid[s2], 0.5, o1);
      }
      made++;
    }
  }
  // Wind each triangle to face outward from the lock's axis (front faces only render).
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
  g.setAttribute('tip', new THREE.Float32BufferAttribute(TIP, 1));
  fixWinding(g);
  g.computeBoundingSphere();
  g.userData.count = made;
  g.userData.vertsPer = o.shape === 'hair' ? 9 : 27;
  return g;
}

/** Flip any triangle whose face normal disagrees with its vertex normals. */
function fixWinding(g: THREE.BufferGeometry) {
  const p = g.getAttribute('position').array as Float32Array;
  const n = g.getAttribute('normal').array as Float32Array;
  const attrs = Object.values(g.attributes) as THREE.BufferAttribute[];
  for (let t = 0; t < p.length / 9; t++) {
    const i = t * 9;
    const ux = p[i + 3] - p[i], uy = p[i + 4] - p[i + 1], uz = p[i + 5] - p[i + 2];
    const vx = p[i + 6] - p[i], vy = p[i + 7] - p[i + 1], vz = p[i + 8] - p[i + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    const nx = n[i] + n[i + 3] + n[i + 6], ny = n[i + 1] + n[i + 4] + n[i + 7], nz = n[i + 2] + n[i + 5] + n[i + 8];
    if (fx * nx + fy * ny + fz * nz >= 0) continue;
    // swap vertex 1 and 2 in every attribute
    for (const a of attrs) {
      const s = a.itemSize, arr = a.array as Float32Array;
      const v1 = (t * 3 + 1) * s, v2 = (t * 3 + 2) * s;
      for (let k = 0; k < s; k++) {
        const tmp = arr[v1 + k];
        arr[v1 + k] = arr[v2 + k];
        arr[v2 + k] = tmp;
      }
    }
  }
}

/** Shading for tufts: soft, velvety, a gentle sway at the tips. */
export function tuftMaterial(o: { sheen?: number; sheenColor?: THREE.ColorRepresentation; rough?: number; tipGlow?: THREE.ColorRepresentation } = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: o.rough ?? 0.82,
    sheen: o.sheen ?? 0.5,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(o.sheenColor ?? 0xc8b49a),
  });
  m.userData.styleRim = 0.45;
  const time = { value: 0 };
  // Optional glow toward the tips (shadow-touched fur); black = none.
  const glow = { value: new THREE.Color(o.tipGlow ?? 0x000000) };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTuftTime = time;
    sh.uniforms.uTipGlow = glow;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float tip;\nuniform float uTuftTime;\nvarying float vTip;')
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
        {
          vTip = tip;
          float w = tip * tip;
          float ph = dot(position, vec3(9.0, 7.0, 5.0));
          transformed += vec3(sin(uTuftTime * 2.1 + ph), 0.0, cos(uTuftTime * 1.7 + ph)) * 0.004 * w;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTipGlow;\nvarying float vTip;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uTipGlow * vTip * vTip * vTip;');
  };
  m.customProgramCacheKey = () => 'creature-tuft';
  return { mat: m, time, glow };
}
