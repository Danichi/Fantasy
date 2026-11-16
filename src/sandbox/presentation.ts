import * as THREE from 'three';
import type { Interior } from '../world/interior';

function label(text: string, sub: string) {
  const c = document.createElement('canvas');
  c.width = 768;
  c.height = 192;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0f1e2c';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = '#cbaa68';
  ctx.lineWidth = 3;
  ctx.strokeRect(8, 8, 752, 176);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f1dbad';
  ctx.font = '28px Georgia';
  ctx.fillText(text, 384, 84);
  ctx.fillStyle = '#a5c0ce';
  ctx.font = '18px sans-serif';
  ctx.fillText(sub, 384, 130);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  sprite.scale.set(4.8, 1.2, 1);
  return sprite;
}
/** Physical stations make the menus discoverable from inside the arena. */
export function dressPracticeArena(it: Interior, open: (tab: string) => void, retry: () => void) {
  const root = new THREE.Group();
  it.group.add(root);
  const dark = new THREE.MeshStandardMaterial({
    color: 0x263a45,
    roughness: 0.75,
    metalness: 0.2,
  });
  const gold = new THREE.MeshStandardMaterial({
    color: 0xc6a263,
    roughness: 0.5,
    metalness: 0.65,
  });
  const blue = new THREE.MeshBasicMaterial({
    color: 0x78bdd3,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  });
  const ring = (r: number, width: number, x: number, z: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(r - width, r, 96), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.025, z);
    root.add(m);
  };
  // Paved fighting circle: concentric courses and radial stone joints.
  const paving = document.createElement('canvas');
  paving.width = paving.height = 1024;
  const pc = paving.getContext('2d')!;
  pc.fillStyle = '#6c7e87';
  pc.fillRect(0, 0, 1024, 1024);
  for (let y = 0; y < 1024; y += 64)
    for (let x = 0; x < 1024; x += 64) {
      pc.fillStyle = `rgba(210,227,235,${((x * 13 + y * 7) % 31) / 700})`;
      pc.fillRect(x, y, 64, 64);
    }
  pc.strokeStyle = '#465b65';
  pc.lineWidth = 2;
  for (let r = 55; r < 740; r += 55) {
    pc.beginPath();
    pc.arc(512, 512, r, 0, Math.PI * 2);
    pc.stroke();
    const count = Math.max(8, Math.round(r / 18));
    for (let i = 0; i < count; i++) {
      const a = (i * Math.PI * 2) / count + (r % 110 ? 0.04 : 0);
      pc.beginPath();
      pc.moveTo(512 + Math.cos(a) * (r - 55), 512 + Math.sin(a) * (r - 55));
      pc.lineTo(512 + Math.cos(a) * r, 512 + Math.sin(a) * r);
      pc.stroke();
    }
  }
  const pavingTex = new THREE.CanvasTexture(paving);
  pavingTex.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(17.9, 96),
    new THREE.MeshStandardMaterial({
      map: pavingTex,
      color: 0xc8d1d5,
      roughness: 0.95,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.018, -2);
  root.add(floor);
  // Inlaid rings and radial marks make spacing readable without a debug grid.
  for (const r of [5, 10, 18]) ring(r, r === 18 ? 0.14 : 0.035, 0, -2, r === 18 ? gold : blue);
  for (let i = 0; i < 48; i++) {
    const a = (i * Math.PI * 2) / 48;
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.016, i % 4 === 0 ? 0.6 : 0.26), gold);
    tick.position.set(Math.sin(a) * 17.5, 0.03, -2 + Math.cos(a) * 17.5);
    tick.rotation.y = a;
    root.add(tick);
  }
  for (const [x, tab, title, sub] of [
    [-10, 'bosses', 'BOSS TRIALS', 'Every boss · every phase'],
    [0, 'fight', 'TRAINING RING', 'Choose a drill · build a combo'],
    [10, 'build', 'BUILD BENCH', 'Every class · every technique'],
  ] as const) {
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.85, 0.9, 8), dark);
    stand.position.set(x, 0.45, 20);
    root.add(stand);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.08, 8), gold);
    top.position.set(x, 0.94, 20);
    root.add(top);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), blue);
    gem.position.set(x, 1.35, 20);
    root.add(gem);
    const sign = label(title, sub);
    sign.position.set(x, 2.2, 20);
    root.add(sign);
    it.interactables.push({
      enabled: () => true,
      pos: it.at(x, 20),
      radius: 3,
      label: () => `E · ${title.toLowerCase()}`,
      action: () => open(tab),
    });
  }
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 4.8),
    new THREE.MeshStandardMaterial({
      color: 0x234d60,
      roughness: 0.9,
      side: THREE.DoubleSide,
    })
  );
  backdrop.position.set(0, 3.7, -25);
  root.add(backdrop);
  const crest = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.055, 8, 64), gold);
  crest.position.set(0, 3.9, -24.94);
  root.add(crest);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const ray = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.42, 0.035), gold);
    ray.position.set(Math.sin(a) * 0.72, 3.9 + Math.cos(a) * 0.72, -24.9);
    ray.rotation.z = -a;
    root.add(ray);
  }
  it.interactables.push({
    enabled: () => true,
    pos: it.at(0, 22),
    radius: 2,
    label: () => 'E · Reset the arena',
    action: retry,
  });
  // Academy pennants on the stone walls, with a restrained gold motif.
  for (const side of [-1, 1])
    for (const z of [-18, -6, 6, 18]) {
      const banner = new THREE.Mesh(
        new THREE.PlaneGeometry(1.8, 3.4),
        new THREE.MeshStandardMaterial({
          color: 0x244f65,
          roughness: 0.9,
          side: THREE.DoubleSide,
        })
      );
      banner.position.set(side * 24.9, 3, z);
      banner.rotation.y = (side * Math.PI) / 2;
      root.add(banner);
      const emblem = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 6, 32), gold);
      emblem.position.set(side * 24.85, 3.3, z);
      emblem.rotation.y = (side * Math.PI) / 2;
      root.add(emblem);
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd59a }));
      light.position.set(side * 24.7, 1.8, z);
      root.add(light);
    }
}
