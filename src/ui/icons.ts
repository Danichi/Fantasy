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
  } else if (def.id === 'warlordTusk') {
    // A curved tusk on a cord, set in gold.
    g.fillStyle = '#c9a24a';
    g.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, r = i % 2 ? 36 : 46;
      g.lineTo(m + Math.cos(a) * r, m + Math.sin(a) * r);
    }
    g.fill();
    const gr = g.createRadialGradient(m - 8, m - 8, 2, m, m, 30);
    gr.addColorStop(0, '#e8ffd0');
    gr.addColorStop(0.4, '#6fe070');
    gr.addColorStop(1, '#0f5a24');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(m, m, 28, 0, Math.PI * 2);
    g.fill();
  } else if (def.kind === 'key') {
    g.strokeStyle = '#8a8a7a';
    g.fillStyle = '#8a8a7a';
    g.lineWidth = 9;
    g.beginPath();
    g.arc(40, 40, 18, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(53, 53);
    g.lineTo(104, 104);
    g.stroke();
    g.fillRect(82, 86, 10, 22);
    g.fillRect(94, 74, 10, 16);
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

/**
 * Item icons are rendered lazily and a little at a time: whatever the UI asks
 * for first (your bag, your hotbar), then everything else in the background,
 * within a few milliseconds per frame, so the game never stalls on them.
 */
let builder: ((def: ItemDef) => void) | null = null;
let flushIcons: (() => void) | null = null;
/** baking (tools/bake-icons.mjs) wants data URLs, synchronously */
let dataUrlMode = false;
/** icons baked into public/assets/icons (see tools/bake-icons.mjs) */
const baked = { square: new Set<string>(), wide: new Set<string>() };
const BAKED_DIR = '/assets/icons/';

/** Load the baked icon manifest: those icons are plain images, no rendering at all. */
export async function loadBakedIcons() {
  try {
    const m = (await (await fetch(BAKED_DIR + 'manifest.json')).json()) as { square: string[]; wide: string[]; v: string };
    for (const id of m.square) {
      baked.square.add(id);
      cache.set(id, `${BAKED_DIR}${id}.png?v=${m.v}`);
    }
    for (const id of m.wide) {
      baked.wide.add(id);
      wideCache.set(id, `${BAKED_DIR}wide/${id}.png?v=${m.v}`);
    }
  } catch {
    /* not baked yet: icons render at runtime */
  }
}

/** Render every item's icon now and return them as data URLs (for baking). */
export function exportAllIcons() {
  dataUrlMode = true;
  cache.clear();
  wideCache.clear();
  for (const id of Object.keys(ITEMS)) {
    queued.delete(id);
    enqueue(id);
  }
  while (queue.length) pumpIcons(1e9);
  for (let k = 0; k < 8; k++) flushIcons?.(); // leftovers (wide icons)
  dataUrlMode = false;
  return { square: Object.fromEntries(cache), wide: Object.fromEntries(wideCache) };
}
const queue: string[] = [];
const queued = new Set<string>();
/** called when new icons are ready (the HUD and bag redraw) */
export let onIconsReady: (() => void) | null = null;
export function setOnIconsReady(fn: () => void) {
  onIconsReady = fn;
}

function enqueue(id: string, front = false) {
  if (cache.has(id) || queued.has(id) || !ITEMS[id]) return;
  queued.add(id);
  if (front) queue.unshift(id);
  else queue.push(id);
}

/** Render queued icons for up to `budgetMs`; call once per frame. */
export function pumpIcons(budgetMs = 4) {
  if (!builder || !queue.length) return;
  const t0 = performance.now();
  let made = 0;
  // Build models (cheap) up to the budget, then render the lot in one pass.
  while (queue.length && made < (dataUrlMode ? 12 : 10) && performance.now() - t0 < budgetMs) {
    const id = queue.shift()!;
    queued.delete(id);
    if (!cache.has(id)) builder(ITEMS[id]);
    made++;
  }
  flushIcons?.();
  if (made) onIconsReady?.();
}

export function buildIcons(renderer: THREE.WebGLRenderer, env: THREE.Texture | null, first: string[] = []) {
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(1, 2, 3);
  scene.add(key);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 20);
  const toSrgb = (c: number) => 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

  // Icons are rendered in batches into one atlas and read back once per batch:
  // each GPU readback stalls the pipeline, so one per icon froze the game.
  type Job = { holder: THREE.Object3D; w: number; h: number; fill: number; done: (url: string) => void };
  const jobs: Job[] = [];
  const AW = 1024, CW = 256, CH = 128, COLS = AW / CW, MAX_JOBS = 12;
  const atlas = new THREE.WebGLRenderTarget(AW, AW, { samples: 4, type: THREE.FloatType });
  atlas.scissorTest = true;
  const snap = (holder: THREE.Object3D, w: number, h: number, fill: number, done: (url: string) => void) => jobs.push({ holder, w, h, fill, done });
  flushIcons = () => {
    if (!jobs.length) return;
    const batch = jobs.splice(0, MAX_JOBS);
    const prevTone = renderer.toneMapping;
    const prevClear = renderer.getClearAlpha();
    const prevTarget = renderer.getRenderTarget();
    renderer.toneMapping = THREE.NoToneMapping;
    atlas.viewport.set(0, 0, AW, AW);
    atlas.scissor.set(0, 0, AW, AW);
    renderer.setRenderTarget(atlas);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    batch.forEach((j, i) => {
      const cx = (i % COLS) * CW, cy = Math.floor(i / COLS) * CH;
      scene.add(j.holder);
      j.holder.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(j.holder);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      cam.aspect = j.w / j.h;
      // Distance at which the box's height and width both fit the frame.
      const t = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      const dist = Math.max(size.y / (2 * t), size.x / (2 * t * cam.aspect)) * j.fill + size.z / 2;
      cam.position.copy(center).add(new THREE.Vector3(0, 0, dist));
      cam.lookAt(center);
      cam.updateProjectionMatrix();
      atlas.viewport.set(cx, cy, j.w, j.h);
      atlas.scissor.set(cx, cy, j.w, j.h);
      renderer.setRenderTarget(atlas);
      renderer.render(scene, cam);
      scene.remove(j.holder);
    });
    const rows = Math.ceil(batch.length / COLS) * CH;
    const pixels = new Float32Array(AW * rows * 4);
    renderer.readRenderTargetPixels(atlas, 0, 0, AW, rows, pixels);
    renderer.setRenderTarget(prevTarget);
    renderer.toneMapping = prevTone;
    renderer.setClearColor(0x000000, prevClear);
    // Render targets receive linear colour; convert to sRGB when copying out.
    batch.forEach((j, i) => {
      const cx = (i % COLS) * CW, cy = Math.floor(i / COLS) * CH;
      const canvas = document.createElement('canvas');
      canvas.width = j.w;
      canvas.height = j.h;
      const ctx = canvas.getContext('2d')!;
      const img = ctx.createImageData(j.w, j.h);
      // Flip vertically (GL origin is bottom-left) and un-premultiply edges.
      for (let y = 0; y < j.h; y++) {
        for (let x = 0; x < j.w; x++) {
          const src = ((cy + j.h - 1 - y) * AW + cx + x) * 4, dst = (y * j.w + x) * 4;
          const a = Math.min(1, pixels[src + 3]);
          for (let k = 0; k < 3; k++) img.data[dst + k] = toSrgb(Math.min(1, a > 0 ? pixels[src + k] / Math.max(a, 1e-3) : 0));
          img.data[dst + 3] = a * 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      if (dataUrlMode) {
        j.done(canvas.toDataURL());
        return;
      }
      // Encode off the main thread; the icon appears when the blob is ready.
      canvas.toBlob((blob) => {
        if (!blob) return;
        j.done(URL.createObjectURL(blob));
        onIconsReady?.();
      });
    });
  };

  const one = (def: ItemDef) => {
    if (def.kind === 'spell') {
      cache.set(def.id, paintSpell(def));
      return;
    }
    if (def.kind === 'consumable' && !def.build) {
      cache.set(def.id, paintPotion(def));
      return;
    }
    const model = buildItemModel(def);
    if (!model) {
      if (def.kind === 'accessory' || def.kind === 'key') cache.set(def.id, paintAccessory(def));
      return;
    }
    const holder = new THREE.Group();
    holder.add(model);
    // Swords lie diagonally; shields face the camera; armour is framed as-is.
    if (def.kind === 'sword') holder.rotation.set(0, 0, -Math.PI / 4);
    if (def.kind === 'shield') holder.rotation.set(0.15, -0.35, 0);
    if (def.kind === 'armor' || def.kind === 'accessory') holder.rotation.set(0.25, -0.5, 0);
    if (def.kind === 'material' || def.kind === 'consumable' || def.kind === 'key') holder.rotation.set(0.45, -0.5, 0);
    snap(holder, SIZE, SIZE, 1.15, (url) => cache.set(def.id, url));
    // Wide versions for the hand frames: blades horizontal, shields upright.
    if (def.kind === 'sword' || def.kind === 'shield') {
      const wide = new THREE.Group();
      wide.add(model.clone()); // a copy: the square icon's holder still needs the original
      if (def.kind === 'sword') wide.rotation.set(0.25, 0, -Math.PI / 2 + 0.12);
      else wide.rotation.set(0.1, -0.3, 0);
      snap(wide, 256, 112, 1.08, (url) => wideCache.set(def.id, url));
    }
  };
  builder = one;
  // Baked icons are already in the cache; only unbaked items get rendered here.
  for (const id of first) enqueue(id, true);
  for (const id of Object.keys(ITEMS)) enqueue(id);
}

const wideCache = new Map<string, string>();
/** 256x112 horizontal render for the big hand frames (falls back to the square icon). */
export function wideIconFor(id: string) {
  const got = wideCache.get(id) ?? cache.get(id);
  if (!got) enqueue(id, true);
  return got ?? '';
}

export function iconFor(id: string) {
  const got = cache.get(id);
  if (!got) enqueue(id, true);
  return got ?? '';
}
