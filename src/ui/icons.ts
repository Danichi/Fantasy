import * as THREE from 'three';
import { ITEMS, buildItemModel, type ItemDef } from '../items/itemDefs';

// Item icons: 3D items are rendered from their real models once at startup;
// spells and potions are painted in 2D.

const SIZE = 128;
const cache = new Map<string, string>();

function paintSpell(def: ItemDef) {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d')!;
  const m = SIZE / 2;
  if (def.id === 'fireball') {
    for (let i = 0; i < 3; i++) {
      const gr = g.createRadialGradient(m, m + 6, 2, m, m, 44 - i * 10);
      gr.addColorStop(0, 'rgba(255,250,220,1)');
      gr.addColorStop(0.35, 'rgba(255,190,80,0.95)');
      gr.addColorStop(0.7, 'rgba(230,70,10,0.6)');
      gr.addColorStop(1, 'rgba(120,20,0,0)');
      g.fillStyle = gr;
      g.beginPath();
      // Teardrop flame.
      g.moveTo(m, 14 + i * 6);
      g.bezierCurveTo(m + 40 - i * 8, 50, m + 34 - i * 8, 104 - i * 4, m, 108 - i * 6);
      g.bezierCurveTo(m - 34 + i * 8, 104 - i * 4, m - 40 + i * 8, 50, m, 14 + i * 6);
      g.fill();
    }
  } else {
    g.translate(m, m);
    for (let i = 0; i < 12; i++) {
      g.rotate(Math.PI / 6);
      const gr = g.createLinearGradient(0, 0, 0, -56);
      gr.addColorStop(0, 'rgba(255,240,190,0.9)');
      gr.addColorStop(1, 'rgba(255,200,90,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(-5, 0);
      g.lineTo(0, i % 2 ? -44 : -58);
      g.lineTo(5, 0);
      g.fill();
    }
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 26);
    gr.addColorStop(0, 'rgba(255,255,240,1)');
    gr.addColorStop(1, 'rgba(255,210,120,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, 26, 0, Math.PI * 2);
    g.fill();
  }
  return c.toDataURL();
}

function paintPotion(def: ItemDef) {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d')!;
  const col = def.id === 'healthPotion' ? ['#ff6b6b', '#8a0e16'] : ['#7cc4ff', '#0f2f8a'];
  // Flask body.
  g.save();
  g.beginPath();
  g.moveTo(52, 30);
  g.lineTo(52, 50);
  g.bezierCurveTo(22, 60, 20, 110, 64, 112);
  g.bezierCurveTo(108, 110, 106, 60, 76, 50);
  g.lineTo(76, 30);
  g.closePath();
  g.fillStyle = 'rgba(200,220,230,0.25)';
  g.fill();
  g.clip();
  const gr = g.createLinearGradient(0, 60, 0, 112);
  gr.addColorStop(0, col[0]);
  gr.addColorStop(1, col[1]);
  g.fillStyle = gr;
  g.fillRect(0, 66, SIZE, 60);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.beginPath();
  g.ellipse(46, 80, 6, 16, 0.3, 0, Math.PI * 2);
  g.fill();
  g.restore();
  g.strokeStyle = 'rgba(220,235,240,0.8)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(52, 30);
  g.lineTo(52, 50);
  g.bezierCurveTo(22, 60, 20, 110, 64, 112);
  g.bezierCurveTo(108, 110, 106, 60, 76, 50);
  g.lineTo(76, 30);
  g.stroke();
  // Cork.
  g.fillStyle = '#8a5a34';
  g.fillRect(50, 18, 28, 14);
  return c.toDataURL();
}

function paintAccessory(def: ItemDef) {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d')!;
  const m = SIZE / 2;
  if (def.slot === 'ring1' || def.slot === 'ring2') {
    const metal = def.id === 'ringSage' ? ['#f1f3f6', '#8d949c'] : ['#9a958e', '#4d4944'];
    const gr = g.createLinearGradient(30, 30, 98, 98);
    gr.addColorStop(0, metal[0]);
    gr.addColorStop(1, metal[1]);
    g.strokeStyle = gr;
    g.lineWidth = 13;
    g.beginPath();
    g.ellipse(m, m + 8, 34, 26, 0, 0, Math.PI * 2);
    g.stroke();
    if (def.id === 'ringSage') {
      const st = g.createRadialGradient(m - 4, 30, 2, m, 34, 16);
      st.addColorStop(0, '#ffffff');
      st.addColorStop(0.5, '#bcd8ff');
      st.addColorStop(1, '#6d8fc7');
      g.fillStyle = st;
      g.beginPath();
      g.arc(m, 34, 15, 0, Math.PI * 2);
      g.fill();
    }
  } else {
    // Charm: a knotted cord and a curved tusk.
    g.strokeStyle = '#8a5a34';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(40, 22);
    g.quadraticCurveTo(m, 58, 88, 22);
    g.stroke();
    g.fillStyle = '#efe6d2';
    g.beginPath();
    g.moveTo(m - 8, 56);
    g.quadraticCurveTo(m + 30, 70, m + 6, 110);
    g.quadraticCurveTo(m + 14, 76, m - 12, 64);
    g.closePath();
    g.fill();
  }
  return c.toDataURL();
}

export function buildIcons(renderer: THREE.WebGLRenderer, env: THREE.Texture | null) {
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(1, 2, 3);
  scene.add(key);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 20);
  const toSrgb = (c: number) => 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  const prevTone = renderer.toneMapping;
  const prevClear = renderer.getClearAlpha();
  renderer.toneMapping = THREE.NoToneMapping;

  /** Render `holder` into a w x h image, framed to fit, and return a data URL. */
  const snap = (holder: THREE.Object3D, w: number, h: number, fill = 1.75) => {
    // Render targets receive linear colour; convert to sRGB when copying out.
    const rt = new THREE.WebGLRenderTarget(w, h, { samples: 4, type: THREE.FloatType });
    const pixels = new Float32Array(w * h * 4);
    scene.add(holder);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    cam.aspect = w / h;
    // Distance at which the box's height and width both fit the frame.
    const t = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const dist = Math.max(size.y / (2 * t), size.x / (2 * t * cam.aspect)) * fill + size.z / 2;
    cam.position.copy(center).add(new THREE.Vector3(0, 0, dist));
    cam.lookAt(center);
    cam.updateProjectionMatrix();
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, pixels);
    scene.remove(holder);
    rt.dispose();
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(w, h);
    // Flip vertically (GL origin is bottom-left) and un-premultiply edges.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const src = ((h - 1 - y) * w + x) * 4, dst = (y * w + x) * 4;
        const a = Math.min(1, pixels[src + 3]);
        for (let k = 0; k < 3; k++) img.data[dst + k] = toSrgb(Math.min(1, a > 0 ? pixels[src + k] / Math.max(a, 1e-3) : 0));
        img.data[dst + 3] = a * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL();
  };

  for (const def of Object.values(ITEMS)) {
    if (def.kind === 'spell') {
      cache.set(def.id, paintSpell(def));
      continue;
    }
    if (def.kind === 'consumable') {
      cache.set(def.id, paintPotion(def));
      continue;
    }
    const model = buildItemModel(def);
    if (!model) {
      if (def.kind === 'accessory') cache.set(def.id, paintAccessory(def));
      continue;
    }
    const holder = new THREE.Group();
    holder.add(model);
    // Swords lie diagonally; shields face the camera; armour is framed as-is.
    if (def.kind === 'sword') holder.rotation.set(0, 0, -Math.PI / 4);
    if (def.kind === 'shield') holder.rotation.set(0.15, -0.35, 0);
    if (def.kind === 'armor' || def.kind === 'accessory') holder.rotation.set(0.25, -0.5, 0);
    cache.set(def.id, snap(holder, SIZE, SIZE, 1.15));
    // Wide versions for the hand frames: blades horizontal, shields upright.
    if (def.kind === 'sword' || def.kind === 'shield') {
      const wide = new THREE.Group();
      const m2 = buildItemModel(def)!;
      wide.add(m2);
      if (def.kind === 'sword') wide.rotation.set(0.25, 0, -Math.PI / 2 + 0.12);
      else wide.rotation.set(0.1, -0.3, 0);
      wideCache.set(def.id, snap(wide, 256, 112, 1.08));
    }
  }
  renderer.setRenderTarget(null);
  renderer.toneMapping = prevTone;
  renderer.setClearColor(0x000000, prevClear);
}

const wideCache = new Map<string, string>();
/** 256x112 horizontal render for the big hand frames (falls back to the square icon). */
export function wideIconFor(id: string) {
  return wideCache.get(id) ?? cache.get(id) ?? '';
}

export function iconFor(id: string) {
  return cache.get(id) ?? '';
}
