import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { riverX, RIVER_LEVEL, BRIDGE, WORLD_SIZE, heightTexture, heightAt } from './terrain';
import { physics } from '../physics/physics';
import { worldUV, type WorldMats } from './buildings';

// River surface: a strip following the river curve. Waves come from two
// scrolling procedural normal maps; colour deepens with water depth (read
// from the terrain height texture) and foam gathers along the banks.

function waveNormalTexture() {
  const N = 256;
  const h = new Float32Array(N * N);
  // Sum of wrapped sine ripples = tileable height field.
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let v = 0;
      for (let k = 1; k <= 6; k++) {
        const a = k * 1.7, fx = Math.round(Math.cos(a) * (k + 1)), fy = Math.round(Math.sin(a) * (k + 1));
        v += Math.sin(((x * fx + y * fy) / N) * Math.PI * 2 + k * 1.3) / k;
      }
      h[y * N + x] = v;
    }
  }
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = h[y * N + ((x + 1) % N)] - h[y * N + ((x - 1 + N) % N)];
      const dy = h[((y + 1) % N) * N + x] - h[((y - 1 + N) % N) * N + x];
      const n = new THREE.Vector3(-dx * 0.6, -dy * 0.6, 1).normalize();
      const k = (y * N + x) * 4;
      data[k] = (n.x * 0.5 + 0.5) * 255;
      data[k + 1] = (n.y * 0.5 + 0.5) * 255;
      data[k + 2] = (n.z * 0.5 + 0.5) * 255;
      data[k + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, N, N);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

export class River {
  private uniforms: Record<string, THREE.IUniform>;
  readonly mesh: THREE.Mesh;

  constructor(scene: THREE.Scene) {
    // Strip mesh along z, 30 m wide, following riverX(z).
    const H = WORLD_SIZE / 2, W = 15, segZ = 256, segX = 6;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let j = 0; j <= segZ; j++) {
      const z = -H + (j / segZ) * WORLD_SIZE;
      const cx = riverX(z);
      for (let i = 0; i <= segX; i++) pos.push(cx - W + (i / segX) * W * 2, RIVER_LEVEL, z);
    }
    for (let j = 0; j < segZ; j++) {
      for (let i = 0; i < segX; i++) {
        const a = j * (segX + 1) + i, b = a + 1, c = a + segX + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill([0, 1, 0]).flat(), 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();

    this.uniforms = {
      uTime: { value: 0 },
      tWave: { value: waveNormalTexture() },
      tHeight: { value: heightTexture() },
      uSize: { value: WORLD_SIZE },
      uLevel: { value: RIVER_LEVEL },
    };
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a5560, roughness: 0.12, metalness: 0.0, transparent: true, envMapIntensity: 0.0 });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vWPos;
          uniform sampler2D tWave, tHeight;
          uniform float uTime, uSize, uLevel;
          float wDepth;`,
        )
        .replace(
          '#include <map_fragment>',
          `float ground = texture2D(tHeight, vWPos.xz / uSize + 0.5).r;
          wDepth = max(0.0, uLevel - ground);
          // Shallow water shows the tinted bed; deep water goes dark teal.
          vec3 shallow = vec3(0.2, 0.28, 0.22), deep = vec3(0.03, 0.09, 0.11);
          diffuseColor.rgb = mix(shallow, deep, smoothstep(0.0, 1.1, wDepth));
          // Foam lines along the banks.
          float foam = smoothstep(0.12, 0.01, wDepth) * (0.5 + 0.5 * sin(vWPos.z * 0.9 + uTime * 1.6));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.84, 0.82), foam * 0.6);
          diffuseColor.a = smoothstep(0.0, 0.08, wDepth) * mix(0.8, 0.97, smoothstep(0.0, 1.0, wDepth));`,
        )
        .replace(
          '#include <opaque_fragment>',
          `// Fresnel: the sky shows at grazing angles, the depths when looking down.
          float cosV = clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);
          float fres = 0.03 + 0.97 * pow(1.0 - cosV, 5.0);
          vec3 skyCol = vec3(0.55, 0.68, 0.82);
          outgoingLight = mix(outgoingLight, skyCol, fres * 0.8);
          diffuseColor.a = mix(diffuseColor.a, 1.0, fres * 0.6);
          #include <opaque_fragment>`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `{
            // Current flows toward +z; two layers of ripples at different scales.
            vec2 uv1 = vWPos.xz * 0.11 + vec2(0.0, uTime * 0.09);
            vec2 uv2 = vWPos.xz * 0.043 + vec2(uTime * 0.012, uTime * 0.05);
            vec3 n1 = texture2D(tWave, uv1).xyz * 2.0 - 1.0;
            vec3 n2 = texture2D(tWave, uv2).xyz * 2.0 - 1.0;
            vec3 nm = normalize(vec3(n1.xy + n2.xy, n1.z * n2.z));
            vec3 Nv = normal;
            vec3 Tv = normalize((viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
            vec3 Bv = normalize(cross(Nv, Tv));
            normal = normalize(Tv * nm.x * 0.35 - Bv * nm.y * 0.35 + Nv * nm.z);
          }`,
        );
    };
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }

  update(dt: number) {
    this.uniforms.uTime.value += dt;
  }
}

/** True when a point is in the river channel (below the waterline). */
export function waterDepthAt(x: number, z: number) {
  return Math.max(0, RIVER_LEVEL - heightAt(x, z));
}

/** Stone arch bridge carrying the east road over the river. */
export function buildBridge(scene: THREE.Scene, m: WorldMats) {
  const len = 34, width = 5.4, deckY = RIVER_LEVEL + 1.9, hump = 0.7, rampLen = 7;
  const bankY = heightAt(BRIDGE.x - 24, BRIDGE.y), bankY2 = heightAt(BRIDGE.x + 24, BRIDGE.y);
  const topAt = (x: number) => {
    if (x < -len / 2) return THREE.MathUtils.lerp(bankY, deckY, (x + len / 2 + rampLen) / rampLen);
    if (x > len / 2) return THREE.MathUtils.lerp(deckY, bankY2, (x - len / 2) / rampLen);
    return deckY + Math.sin(((x + len / 2) / len) * Math.PI) * hump;
  };
  // Side elevation: humped deck on top, three arches cut through.
  const x0 = -len / 2 - rampLen, x1 = len / 2 + rampLen, base = RIVER_LEVEL - 1.6;
  const shape = new THREE.Shape();
  shape.moveTo(x0, base);
  shape.lineTo(x1, base);
  for (let i = 0; i <= 40; i++) {
    const x = x1 - (i / 40) * (x1 - x0);
    shape.lineTo(x, topAt(x));
  }
  shape.closePath();
  for (const cx of [-9, 0, 9]) {
    // Arches stay below the deck: crown about half a metre under the road.
    const r = cx === 0 ? 2.8 : 2.3;
    const spring = RIVER_LEVEL - 0.7;
    const hole = new THREE.Path();
    hole.moveTo(cx - r, base + 0.08); // holes must stay inside the outline
    hole.lineTo(cx - r, spring);
    hole.absarc(cx, spring, r, Math.PI, 0, true);
    hole.lineTo(cx + r, base + 0.08);
    hole.closePath();
    shape.holes.push(hole);
  }
  const body = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 16 });
  body.translate(0, 0, -width / 2);
  const parts: THREE.BufferGeometry[] = [worldUV(body.index ? body.toNonIndexed() : body, 2.2)];
  // Parapets following the deck line, with a coping stone on top.
  for (const side of [-1, 1]) {
    const pshape = new THREE.Shape();
    const px0 = -len / 2 - rampLen * 0.6, px1 = len / 2 + rampLen * 0.6;
    pshape.moveTo(px0, topAt(px0));
    for (let i = 0; i <= 30; i++) {
      const x = px0 + (i / 30) * (px1 - px0);
      pshape.lineTo(x, topAt(x));
    }
    for (let i = 30; i >= 0; i--) {
      const x = px0 + (i / 30) * (px1 - px0);
      pshape.lineTo(x, topAt(x) + 0.95);
    }
    pshape.closePath();
    const wall = new THREE.ExtrudeGeometry(pshape, { depth: 0.4, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1 });
    wall.translate(0, 0, side > 0 ? width / 2 - 0.4 : -width / 2);
    parts.push(worldUV(wall.index ? wall.toNonIndexed() : wall, 2.2));
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts.map((g) => {
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    return g;
  }))!, m.bridgeStone ?? m.stone);
  mesh.castShadow = mesh.receiveShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  g.position.set(BRIDGE.x, 0, BRIDGE.y);
  g.rotation.y = -0.1;
  scene.add(g);

  // Collision: the walkable deck as short sloped boxes, plus the parapets.
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, g.rotation.y, 0));
  const steps = 16;
  for (let i = 0; i < steps; i++) {
    const xa = x0 + (i / steps) * (x1 - x0), xb = x0 + ((i + 1) / steps) * (x1 - x0);
    const ya = topAt(xa), yb = topAt(xb);
    const L = Math.hypot(xb - xa, yb - ya);
    const ang = Math.atan2(yb - ya, xb - xa);
    const rq = q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, ang)));
    const c = new THREE.Vector3((xa + xb) / 2, (ya + yb) / 2 - 0.3, 0).applyQuaternion(q).add(g.position);
    physics.addBox(c, new THREE.Vector3(L / 2 + 0.05, 0.3, width / 2), rq);
    for (const s of [-1, 1]) {
      const p = new THREE.Vector3((xa + xb) / 2, (ya + yb) / 2 + 0.5, s * (width / 2 - 0.2)).applyQuaternion(q).add(g.position);
      physics.addBox(p, new THREE.Vector3(L / 2 + 0.05, 0.5, 0.2), rq);
    }
  }
  return g;
}
