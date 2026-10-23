import '../render/stylize';
import * as THREE from 'three';
import { Sky } from '../render/sky';
import { SUN_DIR } from '../render/renderer';
import { BoarVisual, tickBoarFur } from '../creatures/boar/visual';
import { boarGeometry } from '../creatures/boar/model';
import { SpiderVisual, tickSpiderFur } from '../creatures/spider/visual';
import { spiderGeometry } from '../creatures/spider/model';
import { BatVisual, tickBatFur } from '../creatures/bat/visual';
import { batGeometry } from '../creatures/bat/model';
import { WolfVisual, tickWolfFur, type WolfLook } from '../creatures/wolf/visual';
import { wolfGeometry } from '../creatures/wolf/model';
import { greyjawGeometry } from '../creatures/wolf/greyjaw';
import { stagGeometry } from '../creatures/stag/model';
import { StagVisual, tickStagFur } from '../creatures/stag/visual';
import { greyjawDark } from '../creatures/wolf/visual';

// Dev page: a creature under the game's lighting, seen from several angles in
// one frame, for quick visual iteration.
//   /tools/creature-lab.html?c=boar&pose=idle&views=side,front34,head,rear34
// window.__lab.step(seconds) advances animation; window.__lab.render() redraws.

const P = new URLSearchParams(location.search);
const W = Number(P.get('w') ?? 1600), H = Number(P.get('h') ?? 900);
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
r.setPixelRatio(1);
r.setSize(W, H);
r.outputColorSpace = THREE.SRGBColorSpace;
r.toneMapping = THREE.ACESFilmicToneMapping;
r.toneMappingExposure = 1.06;
r.shadowMap.enabled = true;
r.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(r.domElement);

const scene = new THREE.Scene();
const sky = new Sky(SUN_DIR);
scene.add(sky.mesh);
scene.environment = sky.environment(r);
scene.environmentIntensity = 0.42;
const sun = new THREE.DirectionalLight(0xfff1d6, 2.3);
sun.position.copy(SUN_DIR).multiplyScalar(10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 30 });
sun.shadow.radius = 3;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun, new THREE.HemisphereLight(0xa9c7ee, 0x6d6a4a, 1.05));
// Ground: meadow green with a little variation.
const gc = document.createElement('canvas');
gc.width = gc.height = 256;
const gx = gc.getContext('2d')!;
gx.fillStyle = '#5f9a3c';
gx.fillRect(0, 0, 256, 256);
for (let i = 0; i < 2600; i++) {
  gx.fillStyle = `hsl(${85 + Math.random() * 25},${35 + Math.random() * 20}%,${28 + Math.random() * 18}%)`;
  gx.fillRect(Math.random() * 256, Math.random() * 256, 2, 5);
}
const gt = new THREE.CanvasTexture(gc);
gt.wrapS = gt.wrapT = THREE.RepeatWrapping;
gt.repeat.set(12, 12);
gt.colorSpace = THREE.SRGBColorSpace;
const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: gt, roughness: 1 }));
ground.receiveShadow = true;
scene.add(ground);

const t0 = performance.now();
const kind = P.get('c') ?? 'boar';
const geo = kind === 'stag' ? stagGeometry() : kind === 'greyjaw' ? greyjawGeometry() : kind === 'wolf' ? wolfGeometry() : kind === 'spider' ? spiderGeometry() : kind === 'bat' ? { ...batGeometry(), far: batGeometry().body } : boarGeometry();
type Look = { root: THREE.Group; gait: { reset: (r: THREE.Object3D, g: (x: number, z: number) => number) => void }; setPose: (p: never) => void; update: (dt: number, v: THREE.Vector3, g: (x: number, z: number) => number) => void; lod: (d: number, fur: boolean) => void };
const batLook = (): Look => {
  const v = new BatVisual({ scale: Number(P.get('scale') ?? 2.5) });
  v.root.position.y = 0.6;
  return { root: v.root, gait: { reset: () => {} }, setPose: (p: never) => v.setPose(p), update: (dt) => v.update(dt, 0, 0), lod: (d, f) => v.lod(d, f) };
};
const boar: Look = kind === 'stag' ? new StagVisual() : kind === 'greyjaw' ? new WolfVisual({ look: 'greyjaw', geometry: greyjawGeometry() }) : kind === 'wolf' ? new WolfVisual({ look: (P.get('look') ?? 'grey') as WolfLook }) : kind === 'spider' ? new SpiderVisual() : kind === 'bat' ? batLook() : new BoarVisual({ furLayers: Number(P.get('layers') ?? 0) });
scene.add(boar.root);
if (P.get('dark')) greyjawDark(Number(P.get('dark')));
if (P.get('air')) (boar as unknown as { airborne: boolean }).airborne = true;
boar.setPose((P.get('pose') ?? 'idle') as never);
const vel = new THREE.Vector3();
const speed = Number(P.get('speed') ?? 0);
boar.gait.reset(boar.root, () => 0);
let simT = 0;
const step = (sec: number) => {
  const dt = 1 / 60;
  for (let i = 0; i < sec * 60; i++) {
    simT += dt;
    // Walk in place: the ground scrolls under (move the creature forward, wrap).
    vel.set(0, 0, speed);
    boar.root.position.z += speed * dt;
    tickBoarFur(dt);
    tickSpiderFur(dt);
    tickBatFur(dt);
    tickWolfFur(dt);
    tickStagFur(dt);
    boar.update(dt, vel, () => 0);
  }
};
step(Number(P.get('t') ?? 1));
if (P.get('cube')) {
  const c = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial({ color: 0xcc3333 }));
  c.position.set(0.5, 0.1, 0.3);
  c.castShadow = true;
  scene.add(c);
}
if (P.get('skel')) {
  const h = new THREE.SkeletonHelper(boar.root);
  (h.material as THREE.LineBasicMaterial).depthTest = false;
  scene.add(h);
}

const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 4000);
type View = { name: string; from: [number, number, number]; at: [number, number, number]; fov: number };
const VIEWS: Record<string, View> = {
  side: { name: 'side', from: [3.2, 0.75, 0.15], at: [0, 0.55, 0.15], fov: 30 },
  front34: { name: 'front 3/4', from: [1.7, 1.0, 2.3], at: [0, 0.55, 0.25], fov: 32 },
  rear34: { name: 'rear 3/4', from: [-1.9, 1.2, -2.2], at: [0, 0.55, -0.1], fov: 32 },
  head: { name: 'head', from: [0.75, 0.75, 1.55], at: [0, 0.62, 0.75], fov: 28 },
  top: { name: 'top', from: [0.6, 3.2, 0.2], at: [0, 0.5, 0.05], fov: 32 },
  flank: { name: 'flank', from: [1.1, 0.95, 0.1], at: [0.1, 0.75, 0.05], fov: 30 },
  crest: { name: 'crest', from: [0.9, 1.3, 0.5], at: [0, 0.9, 0.15], fov: 30 },
  sside: { name: 'stag side', from: [5.2, 1.3, 0.05], at: [0, 1.15, 0.05], fov: 32 },
  sfront: { name: 'stag 3/4', from: [3.0, 1.9, 3.8], at: [0, 1.25, 0.3], fov: 34 },
  shead: { name: 'stag head', from: [1.1, 1.95, 2.1], at: [0, 1.85, 0.9], fov: 34 },
  srear: { name: 'stag rear', from: [-3.0, 1.9, -3.6], at: [0, 1.2, -0.2], fov: 34 },
  slow: { name: 'stag low', from: [2.2, 0.6, 3.0], at: [0, 1.3, 0.3], fov: 40 },
  hl: { name: 'head left', from: [0.42, 0.93, 1.02], at: [0, 0.88, 0.74], fov: 30 },
  hr: { name: 'head right', from: [-0.42, 0.93, 1.02], at: [0, 0.88, 0.74], fov: 30 },
  hf: { name: 'head front', from: [0.0, 0.95, 1.25], at: [0, 0.87, 0.74], fov: 26 },
  whead: { name: 'wolf head', from: [0.6, 0.98, 1.35], at: [0, 0.86, 0.72], fov: 30 },
  abdo: { name: 'abdomen', from: [0.9, 1.15, -1.25], at: [0, 0.6, -0.5], fov: 30 },
  low: { name: 'low', from: [1.4, 0.25, 1.8], at: [0, 0.5, 0.1], fov: 34 },
  game: { name: 'game cam', from: [2.5, 2.4, 4.5], at: [0, 0.7, 0], fov: 58 },
  far: { name: 'far', from: [6, 3, 12], at: [0, 0.5, 0], fov: 58 },
};
// ?seq=side&n=6&dt=0.1 : the same view at successive moments (animation strip).
const seq = P.get('seq');
const seqDt = Number(P.get('dt') ?? 0.1);
const views = seq ? Array.from({ length: Number(P.get('n') ?? 6) }, () => VIEWS[seq]) : (P.get('views') ?? 'side,front34,head,rear34,low,game').split(',').map((v) => VIEWS[v]).filter(Boolean);
const cols = Math.ceil(Math.sqrt(views.length * (W / H) / 1.6)), rows = Math.ceil(views.length / cols);
const render = () => {
  r.setScissorTest(true);
  const vw = Math.floor(W / cols), vh = Math.floor(H / rows);
  const off = boar.root.position;
  views.forEach((v, i) => {
    if (seq && i > 0) step(seqDt);
    const x = (i % cols) * vw, y = H - (Math.floor(i / cols) + 1) * vh;
    r.setViewport(x, y, vw, vh);
    r.setScissor(x, y, vw, vh);
    cam.aspect = vw / vh;
    cam.fov = v.fov;
    cam.position.set(v.from[0] + off.x, v.from[1], v.from[2] + off.z);
    cam.lookAt(v.at[0] + off.x, v.at[1], v.at[2] + off.z);
    cam.updateProjectionMatrix();
    const d = cam.position.distanceTo(off);
    boar.lod(d, true);
    sky.mesh.position.copy(cam.position);
    sun.target.position.copy(off);
    sun.position.copy(off).addScaledVector(SUN_DIR, 10);
    sun.target.updateMatrixWorld();
    r.shadowMap.needsUpdate = true;
    r.render(scene, cam);
  });
};
render();
const info = { buildMs: Math.round(geo.ms), verts: geo.body.getAttribute('position').count, tris: (geo.body.index?.count ?? 0) / 3, farTris: (geo.far.index?.count ?? 0) / 3, totalMs: Math.round(performance.now() - t0) };
document.getElementById('info')!.textContent = JSON.stringify(info);
(window as any).__lab = { step, render, boar, info, setPose: (p: string) => boar.setPose(p as never) };
(window as any).__done = true;
