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

export function buildIcons(renderer: THREE.WebGLRenderer, env: THREE.Texture | null) {
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(1, 2, 3);
  scene.add(key);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 20);
  // Render targets receive linear colour; convert to sRGB when copying out.
  const rt = new THREE.WebGLRenderTarget(SIZE, SIZE, { samples: 4, type: THREE.FloatType });
  const pixels = new Float32Array(SIZE * SIZE * 4);
  const toSrgb = (c: number) => 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const prevTone = renderer.toneMapping;
  const prevClear = renderer.getClearAlpha();
  renderer.toneMapping = THREE.NoToneMapping;

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
    if (!model) continue;
    const holder = new THREE.Group();
    holder.add(model);
    // Swords lie diagonally; shields face the camera; armour is framed as-is.
    if (def.kind === 'sword') holder.rotation.set(0, 0, -Math.PI / 4);
    if (def.kind === 'shield') holder.rotation.set(0.15, -0.35, 0);
    if (def.kind === 'armor') holder.rotation.set(0.25, -0.5, 0);
    scene.add(holder);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    cam.position.copy(center).add(new THREE.Vector3(0, 0, size * 1.75));
    cam.lookAt(center);
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, SIZE, SIZE, pixels);
    const img = ctx.createImageData(SIZE, SIZE);
    // Flip vertically (GL origin is bottom-left).
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const src = ((SIZE - 1 - y) * SIZE + x) * 4, dst = (y * SIZE + x) * 4;
        const a = Math.min(1, pixels[src + 3]);
        // Un-premultiply so soft edges don't darken.
        for (let k = 0; k < 3; k++) img.data[dst + k] = toSrgb(Math.min(1, a > 0 ? pixels[src + k] / Math.max(a, 1e-3) : 0));
        img.data[dst + 3] = a * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    cache.set(def.id, canvas.toDataURL());
    scene.remove(holder);
  }
  renderer.setRenderTarget(null);
  renderer.toneMapping = prevTone;
  renderer.setClearColor(0x000000, prevClear);
  rt.dispose();
}

export function iconFor(id: string) {
  return cache.get(id) ?? '';
}
