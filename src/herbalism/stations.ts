import * as THREE from 'three';
import { heightAt } from '../world/terrainHeight';
import { MARKET as CAP_MARKET } from '../world/capitalCity';
import type { Interior } from '../world/interior';
import type { Interactable } from '../dungeon/instance';

// The alchemy tables: a workbench with a copper still, a mortar, a spirit
// burner under a bubbling retort and racks of vials. One stands inside Ilyra
// Moss's shop in Elder Glen and in the House of Balms in Ghagrabba (both built
// with the room when you walk in), and beside the alchemists' stalls in Port
// Aurelle's market and the Royal Capital's.

export interface StationSite {
  id: string;
  name: string;
  /** where the station stands (ground height filled in) */
  x: number;
  z: number;
  yaw: number;
}

/** Open-air tables next to the alchemists who keep a market stall. */
export const OUTDOOR_STATIONS: StationSite[] = [
  { id: 'quill', name: "Quill Mereweather's alchemy table", x: 2776 + 2.4, z: 158 + 1.2, yaw: -Math.PI / 2 },
  { id: 'capAlchemist', name: "Fenwick Ashgrove's alchemy table", x: CAP_MARKET[0] - 6 + 2.4, z: CAP_MARKET[1] + 15 + 1.2, yaw: -Math.PI / 2 },
];
/** Shop keepers whose rooms hold a table. */
export const INTERIOR_STATIONS: Record<string, string> = {
  apothecary: "Ilyra Moss's alchemy table",
  'gh-apoth': 'The House of Balms\' alchemy table',
};

const std = (color: number, p: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...p });

/** The table model (origin at the floor, front toward +Z). */
export function buildAlchemyTable(): { group: THREE.Group; flame: THREE.Mesh; liquid: THREE.Mesh } {
  const g = new THREE.Group();
  const wood = std(0x6a4526, { roughness: 0.9 }), dark = std(0x3a2414, { roughness: 0.9 });
  const copper = std(0xb8693a, { metalness: 0.85, roughness: 0.32 });
  const brass = std(0xc9a25a, { metalness: 0.8, roughness: 0.35 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xd8ece8, roughness: 0.06, transparent: true, opacity: 0.35, depthWrite: false });
  const add = (m: THREE.Mesh, x: number, y: number, z: number) => {
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.07, 0.72), wood), 0, 0.86, 0);
  for (const [x, z] of [[-0.68, -0.3], [0.68, -0.3], [-0.68, 0.3], [0.68, 0.3]]) add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.86, 0.07), dark), x, 0.43, z);
  add(new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.04, 0.6), dark), 0, 0.22, 0); // shelf
  // The still: a copper pot, a coiled neck and a glass receiver.
  add(new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), copper), -0.42, 1.06, -0.1);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.22, 10), copper), -0.42, 1.3, -0.1);
  const pipe = add(new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.014, 6, 16, Math.PI * 0.8), copper), -0.27, 1.38, -0.1);
  pipe.rotation.z = Math.PI * 0.1;
  add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), glass), -0.08, 0.99, -0.1);
  // A retort over a spirit burner, bubbling.
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.07, 10), brass), 0.28, 0.93, 0.05);
  const flame = add(new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 8), new THREE.MeshBasicMaterial({ color: 0x7ab8ff })), 0.28, 1.0, 0.05);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), glass), 0.28, 1.16, 0.05);
  const liquid = add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65), new THREE.MeshStandardMaterial({ color: 0x6ad07a, emissive: 0x2a8a3a, emissiveIntensity: 0.8, roughness: 0.2 })), 0.28, 1.16, 0.05);
  const neck = add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.28, 8), glass), 0.42, 1.28, 0.05);
  neck.rotation.z = -0.9;
  // Mortar and pestle, bottles, a bundle of drying herbs.
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.08, 12), std(0x8a8a82)), 0.6, 0.93, 0.2);
  const pestle = add(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.16, 8), std(0x9a9a90)), 0.63, 1.0, 0.2);
  pestle.rotation.z = -0.5;
  const tints = [0xd8463a, 0x3f7fe0, 0x5fc06a, 0xe0c040, 0x7a5ad0];
  tints.forEach((c, i) => {
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.14, 10), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.25, roughness: 0.25 })), -0.62 + i * 0.09, 0.97, 0.24);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8), std(0x8a5a34)), -0.62 + i * 0.09, 1.055, 0.24);
  });
  for (let i = 0; i < 6; i++) {
    const s = add(new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.22, 4), std(i % 2 ? 0x6faa4a : 0x9ab05a)), 0.1 + i * 0.03, 0.97, -0.24);
    s.rotation.set(Math.PI / 2, 0, (i - 2.5) * 0.12);
  }
  // Jars on the low shelf.
  for (let i = 0; i < 4; i++) add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.16, 10), std([0x8a6a3a, 0x5a7a4a, 0x6a4a6a, 0x9a8a6a][i])), -0.45 + i * 0.3, 0.32, 0);
  return { group: g, flame, liquid };
}

/** A living station: the burner flickers and the retort glows. */
export class StationProp {
  private t = Math.random() * 10;
  constructor(readonly group: THREE.Group, private flame: THREE.Mesh, private liquid: THREE.Mesh) {}
  update(dt: number) {
    this.t += dt;
    this.flame.scale.set(1, 0.8 + Math.sin(this.t * 17) * 0.15 + Math.sin(this.t * 7.3) * 0.1, 1);
    const m = this.liquid.material as THREE.MeshStandardMaterial;
    m.emissiveIntensity = 0.6 + Math.sin(this.t * 2.2) * 0.25;
  }
}

/** Build the open-air tables in the world; returns their props (for animation/visibility) and interactables. */
export function buildOutdoorStations(scene: THREE.Scene, open: (site: StationSite) => void) {
  const props: StationProp[] = [];
  const interactables: Interactable[] = [];
  for (const s of OUTDOOR_STATIONS) {
    const { group, flame, liquid } = buildAlchemyTable();
    const y = heightAt(s.x, s.z);
    group.position.set(s.x, y, s.z);
    group.rotation.y = s.yaw;
    scene.add(group);
    props.push(new StationProp(group, flame, liquid));
    const front = new THREE.Vector3(Math.sin(s.yaw), 0, Math.cos(s.yaw)).multiplyScalar(0.9);
    interactables.push({ pos: new THREE.Vector3(s.x + front.x, y, s.z + front.z), radius: 1.8, label: () => `Brew at ${s.name}`, enabled: () => true, action: () => open(s) });
  }
  return { props, interactables };
}

/** A table inside a shop room, beside the counter; null if this keeper has none. */
export function buildInteriorStation(it: Interior, open: (name: string) => void): { prop: StationProp; interactable: Interactable } | null {
  const keeper = it.door.keeper;
  const name = keeper ? INTERIOR_STATIONS[keeper] : undefined;
  if (!name) return null;
  const x = it.W / 2 - 1.3, z = -it.D / 2 + it.D * 0.45 + 1.25;
  const { group, flame, liquid } = buildAlchemyTable();
  group.position.set(x, 0, z);
  group.rotation.y = -Math.PI / 2; // front faces into the room
  it.group.add(group);
  return {
    prop: new StationProp(group, flame, liquid),
    interactable: { pos: it.at(x - 0.9, z), radius: 1.6, label: () => `Brew at ${name}`, enabled: () => true, action: () => open(name) },
  };
}
