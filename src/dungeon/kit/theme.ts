import * as THREE from 'three';
import { pbr } from '../../world/props';
import { mats, paintedWood } from '../../items/materials';

// ---------------------------------------------------------------------------
// A dungeon's look: its material set, its wall height and the colour of its
// light and air (docs/design/dungeons.md §3 "Lighting and atmosphere"). The
// crypt is warm torchlight on grey ashlar, the caves are lantern light on
// brown rock with cold mushrooms, the drowned shrine is teal stone and
// sea-glass light over standing water.
// ---------------------------------------------------------------------------

export type ThemeId = 'crypt' | 'cave' | 'drowned';

export interface ThemeMats {
  wall: THREE.Material;
  floor: THREE.Material;
  ceil: THREE.MeshStandardMaterial;
  pillar: THREE.Material;
  trim: THREE.Material;
  wood: THREE.Material;
  planks: THREE.Material;
  iron: THREE.Material;
  brass: THREE.Material;
  bone: THREE.Material;
  wax: THREE.Material;
  cloth: THREE.Material;
  rock: THREE.Material;
  moss: THREE.Material;
  water: THREE.MeshStandardMaterial;
  glow: THREE.MeshStandardMaterial;
  rune: THREE.MeshStandardMaterial;
  dark: THREE.MeshBasicMaterial;
  flame: THREE.SpriteMaterial;
  coldFlame: THREE.SpriteMaterial;
}

export interface Theme {
  id: ThemeId;
  wallH: number;
  m: ThemeMats;
  /** the colour of torch and lantern light */
  warm: number;
  /** the dungeon's cold accent light (crystals, sea-glass) */
  cold: number;
  /** the player's lantern */
  lantern: { color: number; intensity: number; distance: number };
  /** fog colour, near and far (when post-processing is off) */
  fog: [number, number, number];
  hemi: { sky: number; ground: number; intensity: number };
}

function glowTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 36, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,200,120,0.8)');
  gr.addColorStop(1, 'rgba(255,90,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

let tex: THREE.Texture | null = null;
const cache = new Map<ThemeId, Theme>();

export function theme(id: ThemeId): Theme {
  const hit = cache.get(id);
  if (hit) return hit;
  const L = new THREE.TextureLoader();
  tex ??= glowTex();
  const flame = new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(3.5, 1.9, 0.7), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const coldFlame = new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(0.6, 2.2, 2.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const std = (color: number, roughness = 0.8, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const rep = (m: THREE.MeshStandardMaterial, k: number) => {
    for (const t of [m.map, m.normalMap, m.roughnessMap]) t?.repeat.set(k, k);
    return m;
  };
  const wood = new THREE.MeshStandardMaterial({ map: paintedWood(51, () => {}, 5), roughness: 0.85, color: 0x9a7a5a });
  const common = {
    wood,
    iron: mats().iron,
    brass: mats().brass,
    bone: std(0xd8cfb4, 0.75),
    wax: std(0xf0e6c8, 0.6, 0, { emissive: 0x3a2a10, emissiveIntensity: 0.6 }),
    dark: new THREE.MeshBasicMaterial({ color: 0x000000 }),
    flame,
    coldFlame,
  };
  let t: Theme;
  if (id === 'cave') {
    const rock = pbr(L, 'rock_face_03', { color: 0x9a8c78 }, 4, 0.5);
    t = {
      id, wallH: 5.2, warm: 0xffb066, cold: 0x6ad0c8,
      lantern: { color: 0xffe2b0, intensity: 5.6, distance: 13 },
      fog: [0x07070a, 10, 40],
      hemi: { sky: 0x8090a8, ground: 0x241a12, intensity: 0.3 },
      m: {
        ...common,
        wall: rep(rock, 1.4),
        floor: rep(pbr(L, 'rock_face_03', { color: 0x6f665a }, 4, 0.6), 1.2),
        ceil: rep(pbr(L, 'rock_face_03', { color: 0x4a443c }, 4, 0.6), 4),
        pillar: rep(pbr(L, 'rock_face_03', { color: 0x857a6a }, 4, 0.5), 1.4),
        trim: pbr(L, 'weathered_peeling_timber', { color: 0x6a523a }, 4),
        planks: pbr(L, 'wood_planks_grey', { color: 0x80684e }, 4),
        cloth: std(0x6a4a30, 0.95),
        rock: std(0x5e564c, 1, 0, { flatShading: true }),
        moss: std(0x4a5a30, 1),
        water: std(0x1a3a40, 0.08, 0.1, { transparent: true, opacity: 0.82 }),
        glow: std(0x2a6a60, 0.4, 0, { emissive: 0x3ac0a8, emissiveIntensity: 1.6 }),
        rune: std(0x4a3a2a, 0.6, 0, { emissive: 0xb86a20, emissiveIntensity: 0.8 }),
      },
    };
  } else if (id === 'drowned') {
    t = {
      id, wallH: 5.0, warm: 0xffc88a, cold: 0x58d8d0,
      lantern: { color: 0xe8fff8, intensity: 5.4, distance: 13 },
      fog: [0x061014, 9, 34],
      hemi: { sky: 0x70a8b0, ground: 0x10221e, intensity: 0.32 },
      m: {
        ...common,
        wall: rep(pbr(L, 'castle_brick_07', { color: 0x86a8a0 }, 4, 0.6), 1.6),
        floor: rep(pbr(L, 'cobblestone_floor_08', { color: 0x7c9894, roughness: 0.35 }, 4, 0.4), 1.5),
        ceil: rep(pbr(L, 'rock_face_03', { color: 0x4a6a6a }, 4, 0.7), 4),
        pillar: rep(pbr(L, 'white_plaster_rough_01', { color: 0xb8ccc4 }, 4, 0.3), 1.2),
        trim: rep(pbr(L, 'white_plaster_rough_01', { color: 0x9cb4ac }, 4, 0.3), 1.2),
        planks: pbr(L, 'wood_planks_grey', { color: 0x5a6a64 }, 4),
        cloth: std(0x2a5a5a, 0.95),
        rock: std(0x4e6460, 1, 0, { flatShading: true }),
        moss: std(0x3a6a4a, 0.9),
        water: std(0x1f5a60, 0.06, 0.15, { transparent: true, opacity: 0.8 }),
        glow: std(0x2a6a70, 0.3, 0, { emissive: 0x40e0d8, emissiveIntensity: 1.8 }),
        rune: std(0x2a4a50, 0.5, 0, { emissive: 0x30c8d0, emissiveIntensity: 1.2 }),
      },
    };
  } else {
    t = {
      id, wallH: 4.4, warm: 0xffcf9a, cold: 0x7ab0ff,
      lantern: { color: 0xfff0c8, intensity: 5.2, distance: 13 },
      fog: [0x050608, 8, 30],
      hemi: { sky: 0x7d8aa6, ground: 0x2a2018, intensity: 0.22 },
      m: {
        ...common,
        wall: rep(pbr(L, 'castle_brick_07', { color: 0xb5c0bd }, 4, 0.72), 1.6),
        floor: rep(pbr(L, 'cobblestone_floor_08', { color: 0xa0aaa7 }, 4, 0.32), 1.5),
        ceil: rep(pbr(L, 'rock_face_03', { color: 0x687b82 }, 4, 0.72), 4),
        pillar: rep(pbr(L, 'rock_face_03', { color: 0xbac6c2 }, 4, 0.72), 1.6),
        trim: rep(pbr(L, 'rock_face_03', { color: 0x9aa4a0 }, 4, 0.72), 1.6),
        planks: pbr(L, 'wood_planks_grey', { color: 0x75604d }, 4),
        cloth: std(0x6a2a2a, 0.95),
        rock: std(0x6a6862, 1, 0, { flatShading: true }),
        moss: std(0x4a5a34, 1),
        water: std(0x1d3a44, 0.08, 0.1, { transparent: true, opacity: 0.84 }),
        glow: std(0x2a3a60, 0.4, 0, { emissive: 0x5a8aff, emissiveIntensity: 1.4 }),
        rune: std(0x3a3a48, 0.6, 0, { emissive: 0x7ab8ff, emissiveIntensity: 1.0 }),
      },
    };
  }
  cache.set(id, t);
  return t;
}
