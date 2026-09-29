import * as THREE from 'three';
import { heightAt } from './terrain';
import { WIND } from './grass';
import { mulberry32 } from '../core/math';

// Ambient life (docs/ART-DIRECTION.md rule 5 and §8): drifting pollen around
// the camera, butterflies over the flowers and flocks of birds circling the
// valley. Everything is instanced and animated in the vertex shader, so it
// costs three draw calls and almost no CPU.

const POLLEN = 260;
const POLLEN_BOX = 36;
const BUTTERFLIES = 28;
const BIRDS = 26;

export class Ambient {
  readonly group = new THREE.Group();
  private pollenCenter = { value: new THREE.Vector3() };
  private night = { value: 0 };
  private butterflies: { pos: THREE.Vector3; target: THREE.Vector3; vel: THREE.Vector3; timer: number }[] = [];
  private butterflyMesh: THREE.InstancedMesh;
  private birdMesh: THREE.InstancedMesh;
  private birds: { center: THREE.Vector3; radius: number; speed: number; phase: number; height: number }[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3(1, 1, 1);
  private rnd = mulberry32(8080);

  constructor(scene: THREE.Scene, private flowerSpots: THREE.Vector3[]) {
    scene.add(this.group);
    this.buildPollen();
    this.butterflyMesh = this.buildButterflies();
    this.birdMesh = this.buildBirds();
  }

  // ---- pollen: soft motes that drift with the wind, wrapped around the camera ----
  private buildPollen() {
    const pos = new Float32Array(POLLEN * 3);
    const seed = new Float32Array(POLLEN);
    for (let i = 0; i < POLLEN; i++) {
      pos[i * 3] = this.rnd() * POLLEN_BOX;
      pos[i * 3 + 1] = this.rnd() * 9;
      pos[i * 3 + 2] = this.rnd() * POLLEN_BOX;
      seed[i] = this.rnd();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: WIND.uTime, uCenter: this.pollenCenter, uWind: WIND.uWindDir, uBox: { value: POLLEN_BOX }, uNight: this.night },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime, uBox, uNight; uniform vec3 uCenter; uniform vec2 uWind;
        varying float vA; varying float vFly;
        void main() {
          vec3 p = position;
          p.xz += uWind * uTime * (0.6 + aSeed * 0.8);
          p.x += sin(uTime * 0.7 + aSeed * 30.0) * 0.8;
          p.y += sin(uTime * 0.5 + aSeed * 17.0) * 0.6;
          vec3 w = uCenter + vec3(mod(p.x - uCenter.x + uBox * 0.5, uBox) - uBox * 0.5, p.y - 2.0, mod(p.z - uCenter.z + uBox * 0.5, uBox) - uBox * 0.5);
          vec4 mv = viewMatrix * vec4(w, 1.0);
          gl_Position = projectionMatrix * mv;
          float d = length(w - uCenter);
          vA = (1.0 - smoothstep(uBox * 0.3, uBox * 0.5, d)) * (0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 2.0 + aSeed * 50.0)));
          // After dusk the motes become fireflies: low, slow, pulsing.
          vFly = uNight;
          float pulse = smoothstep(0.3, 1.0, sin(uTime * (1.5 + aSeed * 2.0) + aSeed * 40.0));
          vA = mix(vA, vA * pulse * 1.6, uNight);
          gl_PointSize = (1.2 + aSeed * 1.6) * (28.0 / max(-mv.z, 1.0)) * mix(1.0, 2.2, uNight);
        }`,
      fragmentShader: /* glsl */ `
        varying float vA; varying float vFly;
        void main() {
          float r = length(gl_PointCoord - 0.5);
          if (vFly > 0.5) { gl_FragColor = vec4(vec3(0.85, 1.0, 0.45) * 1.6, smoothstep(0.5, 0.0, r) * vA); return; }
          gl_FragColor = vec4(vec3(1.0, 0.96, 0.8), smoothstep(0.5, 0.0, r) * vA * 0.4);
        }`,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.group.add(pts);
  }

  // ---- butterflies: two-wing quads that flutter between flowers ------------------
  private buildButterflies() {
    // Two wings hinged on the body line (x = 0); aWing = -1 / +1 flags the side.
    const geo = new THREE.BufferGeometry();
    const p = [0, 0, -0.06, 0.12, 0, -0.1, 0.1, 0, 0.08, 0, 0, 0.06, 0, 0, -0.06, -0.12, 0, -0.1, -0.1, 0, 0.08, 0, 0, 0.06];
    const wing = [0, 1, 1, 0, 0, -1, -1, 0];
    geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    geo.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
    geo.setIndex([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6]);
    geo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0xffffff });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = WIND.uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aWing; uniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `vec3 transformed = position;
          float flap = sin(uTime * 22.0 + float(gl_InstanceID) * 1.7) * 0.9;
          float ang = aWing * flap;
          float r = abs(transformed.x);
          transformed.x = sign(transformed.x) * r * cos(ang);
          transformed.y += r * sin(abs(ang));`,
        );
    };
    const mesh = new THREE.InstancedMesh(geo, mat, BUTTERFLIES);
    const colors = [0xffffff, 0xf4d24a, 0x8fb8ff, 0xf29a4a, 0xffffff];
    for (let i = 0; i < BUTTERFLIES; i++) {
      mesh.setColorAt(i, new THREE.Color(colors[i % colors.length]));
      this.butterflies.push({ pos: new THREE.Vector3(0, -100, 0), target: new THREE.Vector3(), vel: new THREE.Vector3(), timer: 0 });
    }
    mesh.frustumCulled = false;
    this.group.add(mesh);
    return mesh;
  }

  // ---- birds: small dark V shapes flapping on wide circles ------------------------
  private buildBirds() {
    const geo = new THREE.BufferGeometry();
    const p = [0, 0, 0.25, 0, 0, -0.2, 0.9, 0, -0.1, 0, 0, 0.25, 0, 0, -0.2, -0.9, 0, -0.1];
    const wing = [0, 0, 1, 0, 0, -1];
    geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    geo.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
    const mat = new THREE.MeshBasicMaterial({ color: 0x3a4252, side: THREE.DoubleSide, fog: false });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = WIND.uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aWing; uniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `vec3 transformed = position;
          float flap = sin(uTime * 7.0 + float(gl_InstanceID) * 2.3);
          transformed.y += abs(aWing) * flap * 0.45;`,
        );
    };
    const mesh = new THREE.InstancedMesh(geo, mat, BIRDS);
    mesh.frustumCulled = false;
    const flocks = [new THREE.Vector3(-60, 0, -140), new THREE.Vector3(160, 0, 120), new THREE.Vector3(-180, 0, 60)];
    for (let i = 0; i < BIRDS; i++) {
      const f = flocks[i % flocks.length];
      this.birds.push({
        center: f.clone().add(new THREE.Vector3((this.rnd() - 0.5) * 30, 0, (this.rnd() - 0.5) * 30)),
        radius: 35 + this.rnd() * 25,
        speed: 0.12 + this.rnd() * 0.05,
        phase: this.rnd() * Math.PI * 2,
        height: 45 + this.rnd() * 25,
      });
    }
    this.group.add(mesh);
    return mesh;
  }

  update(dt: number, camera: THREE.Vector3, time: number) {
    this.pollenCenter.value.copy(camera);

    // Butterflies: pick a nearby flower, flutter toward it with jitter, move on.
    const near = this.flowerSpots.length ? this.flowerSpots : null;
    for (let i = 0; i < this.butterflies.length; i++) {
      const b = this.butterflies[i];
      const far = b.pos.distanceToSquared(camera) > 45 * 45;
      b.timer -= dt;
      if (far || b.timer <= 0) {
        // New target: a flower near the camera if there is one, else meadow near the camera.
        let t: THREE.Vector3 | null = null;
        if (near) {
          for (let k = 0; k < 6 && !t; k++) {
            const c = near[Math.floor(this.rnd() * near.length)];
            if (c.distanceToSquared(camera) < 35 * 35) t = c;
          }
        }
        if (!t) {
          const x = camera.x + (this.rnd() - 0.5) * 50, z = camera.z + (this.rnd() - 0.5) * 50;
          t = new THREE.Vector3(x, heightAt(x, z), z);
        }
        b.target.copy(t).setY(t.y + 0.4 + this.rnd() * 1.2);
        if (far) b.pos.copy(b.target).add(new THREE.Vector3((this.rnd() - 0.5) * 6, 1, (this.rnd() - 0.5) * 6));
        b.timer = 3 + this.rnd() * 5;
      }
      const to = b.target.clone().sub(b.pos);
      b.vel.addScaledVector(to, dt * 0.9);
      b.vel.x += (this.rnd() - 0.5) * dt * 6;
      b.vel.y += (this.rnd() - 0.5) * dt * 6;
      b.vel.z += (this.rnd() - 0.5) * dt * 6;
      b.vel.multiplyScalar(Math.pow(0.35, dt));
      b.pos.addScaledVector(b.vel, dt);
      const yaw = Math.atan2(b.vel.x, b.vel.z);
      this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      this.m.compose(b.pos, this.q, this.s.set(0.65, 0.65, 0.65));
      this.butterflyMesh.setMatrixAt(i, this.m);
    }
    this.butterflyMesh.instanceMatrix.needsUpdate = true;

    // Birds: circles high over the valley, slightly bobbing.
    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i];
      const a = b.phase + time * b.speed;
      const p = new THREE.Vector3(b.center.x + Math.cos(a) * b.radius, b.height + Math.sin(time * 0.6 + i) * 2, b.center.z + Math.sin(a) * b.radius);
      this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
      this.m.compose(p, this.q, this.s.set(1.4, 1.4, 1.4));
      this.birdMesh.setMatrixAt(i, this.m);
    }
    this.birdMesh.instanceMatrix.needsUpdate = true;
  }

  setVisible(v: boolean) {
    this.group.visible = v;
  }

  /** 0 day .. 1 night: pollen turns into fireflies. */
  setNight(n: number) {
    this.night.value = n;
  }
}
