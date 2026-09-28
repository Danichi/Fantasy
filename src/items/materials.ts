import * as THREE from 'three';
import { mulberry32 } from '../core/math';

// Procedural canvas textures for weapons and armour, generated once and shared.

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function tex(c: HTMLCanvasElement, srgb: boolean, repeat = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Roughness map: long brushing streaks plus scattered scratches and pitting. */
function brushedRoughness(seed: number, along: 'u' | 'v') {
  const [c, g] = canvas(256, 256);
  const r = mulberry32(seed);
  g.fillStyle = 'rgb(90,90,90)';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const v = 60 + r() * 70;
    g.strokeStyle = `rgba(${v},${v},${v},${0.15 + r() * 0.25})`;
    g.lineWidth = r() * 1.6;
    g.beginPath();
    const p = r() * 256;
    if (along === 'v') {
      g.moveTo(p, r() * 256);
      g.lineTo(p + (r() - 0.5) * 3, r() * 256);
    } else {
      g.moveTo(r() * 256, p);
      g.lineTo(r() * 256, p + (r() - 0.5) * 3);
    }
    g.stroke();
  }
  for (let i = 0; i < 140; i++) {
    const v = 150 + r() * 80;
    g.strokeStyle = `rgba(${v},${v},${v},0.5)`;
    g.lineWidth = 0.6;
    g.beginPath();
    const x = r() * 256, y = r() * 256, a = r() * Math.PI, l = 4 + r() * 18;
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  for (let i = 0; i < 400; i++) {
    const v = 170 + r() * 60;
    g.fillStyle = `rgba(${v},${v},${v},0.35)`;
    g.fillRect(r() * 256, r() * 256, 1.2, 1.2);
  }
  return tex(c, false);
}

function leather(seed: number, wrap: boolean) {
  const [c, g] = canvas(128, 256);
  const r = mulberry32(seed);
  g.fillStyle = '#3b2518';
  g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 2500; i++) {
    const l = 30 + r() * 40;
    g.fillStyle = `rgba(${l + 20},${l},${l - 10},0.25)`;
    g.fillRect(r() * 128, r() * 256, 2, 2);
  }
  if (wrap) {
    // Diagonal wrap bands.
    for (let y = -128; y < 384; y += 22) {
      g.strokeStyle = 'rgba(10,5,2,0.85)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(128, y + 40);
      g.stroke();
      g.strokeStyle = 'rgba(120,80,50,0.25)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, y + 6);
      g.lineTo(128, y + 46);
      g.stroke();
    }
  }
  return tex(c, true);
}

/** Planked wood with grain; optional painted heraldic field over it. */
export function paintedWood(seed: number, paint: (g: CanvasRenderingContext2D, s: number) => void, planks = 6) {
  const S = 512;
  const [c, g] = canvas(S, S);
  const r = mulberry32(seed);
  const pw = S / planks;
  for (let p = 0; p < planks; p++) {
    const base = 95 + r() * 30;
    g.fillStyle = `rgb(${base + 20},${base - 5},${base - 40})`;
    g.fillRect(p * pw, 0, pw, S);
    for (let i = 0; i < 70; i++) {
      const x = p * pw + r() * pw;
      const d = r() * 40;
      g.strokeStyle = `rgba(${40 + d},${25 + d * 0.6},${10},${0.18 + r() * 0.2})`;
      g.lineWidth = 0.5 + r() * 1.8;
      g.beginPath();
      g.moveTo(x, 0);
      for (let y = 0; y <= S; y += 32) g.lineTo(x + Math.sin(y * 0.02 + r() * 2) * 3, y);
      g.stroke();
    }
    g.fillStyle = 'rgba(20,10,4,0.9)';
    g.fillRect(p * pw - 1.5, 0, 3, S);
  }
  // Paint layer, then wear it back to the wood with noise.
  g.save();
  paint(g, S);
  g.restore();
  const img = g.getImageData(0, 0, S, S);
  const d = img.data;
  // Chip the paint: pull random speckles back toward bare wood.
  for (let i = 0; i < 1400; i++) {
    const x = (r() * S) | 0, y = (r() * S) | 0, rad = 1 + ((r() * r() * 5) | 0);
    for (let yy = -rad; yy <= rad; yy++) {
      for (let xx = -rad; xx <= rad; xx++) {
        const px = x + xx, py = y + yy;
        if (px < 0 || py < 0 || px >= S || py >= S) continue;
        const k = (py * S + px) * 4;
        d[k] = d[k] * 0.55 + 70;
        d[k + 1] = d[k + 1] * 0.55 + 48;
        d[k + 2] = d[k + 2] * 0.55 + 25;
      }
    }
  }
  g.putImageData(img, 0, 0);
  return tex(c, true);
}

export function heraldryQuartered(colA: string, colB: string) {
  return (g: CanvasRenderingContext2D, S: number) => {
    g.globalAlpha = 0.92;
    g.fillStyle = colA;
    g.fillRect(0, 0, S / 2, S / 2);
    g.fillRect(S / 2, S / 2, S / 2, S / 2);
    g.fillStyle = colB;
    g.fillRect(S / 2, 0, S / 2, S / 2);
    g.fillRect(0, S / 2, S / 2, S / 2);
    g.globalAlpha = 1;
  };
}

export function heraldryChevron(field: string, charge: string) {
  return (g: CanvasRenderingContext2D, S: number) => {
    g.fillStyle = field;
    g.fillRect(0, 0, S, S);
    g.fillStyle = charge;
    g.beginPath();
    g.moveTo(0, S * 0.78);
    g.lineTo(S / 2, S * 0.36);
    g.lineTo(S, S * 0.78);
    g.lineTo(S, S * 0.98);
    g.lineTo(S / 2, S * 0.56);
    g.lineTo(0, S * 0.98);
    g.closePath();
    g.fill();
    // Three roundels in chief.
    for (const x of [0.25, 0.5, 0.75]) {
      g.beginPath();
      g.arc(S * x, S * (x === 0.5 ? 0.16 : 0.2), S * 0.055, 0, Math.PI * 2);
      g.fill();
    }
  };
}

let cache: ReturnType<typeof build> | null = null;
function build() {
  const steelRough = brushedRoughness(7, 'v');
  const armorRough = brushedRoughness(19, 'u');
  return {
    blade: new THREE.MeshStandardMaterial({ color: 0xdfe4ea, metalness: 1, roughness: 0.55, roughnessMap: steelRough, envMapIntensity: 1.4 }),
    darkSteel: new THREE.MeshStandardMaterial({ color: 0x6d6a66, metalness: 1, roughness: 0.6, roughnessMap: steelRough, envMapIntensity: 1.1, side: THREE.DoubleSide }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc9a25a, metalness: 1, roughness: 0.45, roughnessMap: steelRough, envMapIntensity: 1.2 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x55524e, metalness: 0.9, roughness: 0.7, roughnessMap: armorRough, envMapIntensity: 1 }),
    armor: new THREE.MeshStandardMaterial({ color: 0xaeb4ba, metalness: 1, roughness: 0.62, roughnessMap: armorRough, envMapIntensity: 1.25, side: THREE.DoubleSide }),
    gripLeather: new THREE.MeshStandardMaterial({ map: leather(3, true), roughness: 0.8, metalness: 0 }),
    leather: new THREE.MeshStandardMaterial({ map: leather(11, false), roughness: 0.75, metalness: 0, color: 0xcfb9a6 }),
  };
}
export function mats() {
  return (cache ??= build());
}
