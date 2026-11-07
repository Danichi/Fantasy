import * as THREE from 'three';
import { ITEMS, type Rarity } from '../items/itemDefs';

// A loot highlight, so a drop can be found in long grass: a soft halo round
// the item, a faint copy of it that shows through blades of grass, and a thin
// beam of light rising out of it, all coloured by rarity (white common, green
// fine, blue rare, purple epic, gold legendary). Everything is shared: one
// geometry, one texture, one set of materials per rarity, no lights. Attach
// it as a child of the drop's object, so it falls, bobs and goes with it.

export const RARITY_GLOW: Record<Rarity, number> = {
  common: 0xffffff,
  fine: 0x45ff6a,
  rare: 0x3d8bff,
  epic: 0xb84dff,
  legendary: 0xffc21a,
};
/** beam height (m) and halo size by rarity: better things shout louder */
const SIZE: Record<Rarity, { beam: number; halo: number; bright: number }> = {
  common: { beam: 1.1, halo: 0.7, bright: 1.2 },
  fine: { beam: 1.5, halo: 0.8, bright: 1.6 },
  rare: { beam: 2.1, halo: 0.95, bright: 2.9 },
  epic: { beam: 2.7, halo: 1.1, bright: 2.7 },
  legendary: { beam: 3.4, halo: 1.3, bright: 3.0 },
};

let haloTex: THREE.Texture | null = null;
let beamTex: THREE.Texture | null = null;
let beamGeo: THREE.BufferGeometry | null = null;
const mats = new Map<string, THREE.Material>();

function canvasTex(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function halo() {
  return (haloTex ??= canvasTex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.22, 'rgba(255,255,255,0.75)');
    r.addColorStop(0.55, 'rgba(255,255,255,0.18)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
  }));
}
function beam() {
  return (beamTex ??= canvasTex(16, 64, (g) => {
    // Bright at the foot, fading to nothing at the top; soft at the sides.
    const v = g.createLinearGradient(0, 64, 0, 0);
    v.addColorStop(0, 'rgba(255,255,255,1)');
    v.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    v.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = v;
    g.fillRect(0, 0, 16, 64);
    g.globalCompositeOperation = 'destination-in';
    const hz = g.createLinearGradient(0, 0, 16, 0);
    hz.addColorStop(0, 'rgba(0,0,0,0)');
    hz.addColorStop(0.5, 'rgba(0,0,0,1)');
    hz.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = hz;
    g.fillRect(0, 0, 16, 64);
  }));
}
function beamGeometry() {
  if (beamGeo) return beamGeo;
  // Two crossed planes, 1 m tall from the foot up: reads from every side.
  const a = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const b = a.clone().rotateY(Math.PI / 2);
  const g = new THREE.BufferGeometry();
  const pos = [...a.attributes.position.array, ...b.attributes.position.array];
  const uv = [...a.attributes.uv.array, ...b.attributes.uv.array];
  const idx = [...(a.index!.array as ArrayLike<number> & Iterable<number>)];
  const off = a.attributes.position.count;
  for (const i of b.index!.array as ArrayLike<number> & Iterable<number>) idx.push(i + off);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  a.dispose();
  b.dispose();
  return (beamGeo = g);
}
function mat(kind: 'halo' | 'xray' | 'beam', r: Rarity) {
  const key = kind + r;
  let m = mats.get(key);
  if (m) return m;
  // Over-bright colour so the bloom pass picks it up; never tone mapped (stays vivid).
  const col = new THREE.Color(RARITY_GLOW[r]).multiplyScalar(SIZE[r].bright);
  if (kind === 'beam') {
    m = new THREE.MeshBasicMaterial({ map: beam(), color: col, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
  } else {
    // 'xray' ignores depth at low strength: the glow still shows through grass blades.
    m = new THREE.SpriteMaterial({ map: halo(), color: col, transparent: true, opacity: kind === 'xray' ? 0.3 : 0.85, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: kind !== 'xray', toneMapped: false, fog: false });
  }
  mats.set(key, m);
  return m;
}

export function rarityOf(itemId: string): Rarity {
  return ITEMS[itemId]?.rarity ?? 'common';
}

/**
 * Hang a rarity glow on a dropped item's object. `lift` is how high its middle
 * sits above the object's origin. Returns the glow group (call removeDropGlow
 * before disposing the object's own meshes: the glow's are shared).
 */
export function addDropGlow(obj: THREE.Object3D, rarity: Rarity, lift = 0.15): THREE.Group {
  const s = SIZE[rarity];
  const g = new THREE.Group();
  g.name = 'dropGlow';
  g.userData.dropGlow = true;
  // Undo the object's own scale so every drop glows the same size.
  const k = obj.scale.x || 1;
  g.scale.setScalar(1 / k);
  g.position.y = lift * k;
  const h = new THREE.Sprite(mat('halo', rarity) as THREE.SpriteMaterial);
  h.scale.setScalar(s.halo);
  h.renderOrder = 6;
  const x = new THREE.Sprite(mat('xray', rarity) as THREE.SpriteMaterial);
  x.scale.setScalar(s.halo * 0.8);
  x.renderOrder = 7;
  const b = new THREE.Mesh(beamGeometry(), mat('beam', rarity));
  b.scale.set(0.28, s.beam, 0.28);
  b.position.y = -lift;
  b.renderOrder = 6;
  for (const o of [h, x, b]) {
    o.castShadow = o.receiveShadow = false;
    o.frustumCulled = false;
  }
  // A slow breathing pulse, staggered per drop (applied next frame: cheap and smooth enough).
  const phase = Math.random() * 6.28;
  h.onBeforeRender = () => {
    const t = performance.now() / 1000 + phase;
    const p = 1 + Math.sin(t * 3) * 0.14;
    h.scale.setScalar(s.halo * p);
    b.scale.x = b.scale.z = 0.28 * (1 + Math.sin(t * 3 + 1) * 0.18);
    b.rotation.y = t * 0.6;
  };
  g.add(b, h, x);
  obj.add(g);
  return g;
}

/** Detach the glow (its geometry and materials are shared; never dispose them). */
export function removeDropGlow(obj: THREE.Object3D) {
  const g = obj.getObjectByName('dropGlow');
  g?.removeFromParent();
}

/** Best rarity among a list of item ids (a crate shows its best find). */
export function bestRarity(ids: string[]): Rarity {
  const order: Rarity[] = ['common', 'fine', 'rare', 'epic', 'legendary'];
  let best = 0;
  for (const id of ids) best = Math.max(best, order.indexOf(rarityOf(id)));
  return order[best];
}
