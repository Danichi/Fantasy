import * as THREE from 'three';
import { heightAt } from './terrainHeight';
import type { NpcRecord, Place, Settlement } from '../npc/npcManager';
import type { Look } from '../npc/charBuilder';
import { ROSTER_TEACHERS } from '../paths/roster';
import { DISC } from '../paths/data';
import { HEX } from '../ui/skillTree';
import type { MapMarker } from '../ui/worldMap';

// The hidden teachers (docs/design/classes.md): one for each hidden class,
// waiting at a spot in the world with a small shrine of their own. Opening a
// gateway capstone tells you where yours is and marks it on the world map;
// finding them is the quest. They teach through the usual mentor dialogue.

const LOOKS: Record<string, Partial<Look>> = {
  robed: { outfit: 'peasant', hair: 'long' },
  armoured: { outfit: 'ranger', pauldron: true, bracers: true, hair: 'buzzed' },
  hooded: { outfit: 'ranger', hood: true },
  wild: { outfit: 'ranger', hair: 'long', bracers: true },
};

export interface HiddenTeachers {
  settlements: Settlement[];
  records: NpcRecord[];
  /** a gateway opened: where its teacher is, in words (null if it has none) */
  reveal(id: string): string | null;
  markers(): MapMarker[];
  update(player: THREE.Vector3): void;
  setVisible(v: boolean): void;
}

export function buildHiddenTeachers(scene: THREE.Scene, flags: Record<string, unknown>): HiddenTeachers {
  const settlements: Settlement[] = [], records: NpcRecord[] = [];
  const shrines: { at: THREE.Vector3; color: number; g: THREE.Group | null }[] = [];
  ROSTER_TEACHERS.forEach((t, i) => {
    const [x, z] = t.at;
    const at = new THREE.Vector3(x, heightAt(x, z), z);
    const places = new Map<string, Place>();
    places.set('post', { id: 'post', spots: [at.clone()] });
    const id = `teacher-${t.id}`;
    settlements.push({ id, center: at.clone(), radius: 40, places, nodes: [], edges: [] });
    const look: Look = { body: i % 2 ? 'male' : 'female', outfit: 'ranger', skin: 0xe0b894, hairColor: [0x2a2018, 0xb8b4ae, 0x6a4428, 0x1f1a17][i % 4], cloth: t.cloth, linen: 0xd8ccb0, height: 1.7, ...LOOKS[t.look] };
    records.push({
      id: t.npc, name: t.name, title: t.title, job: 'teacher', settlement: id, named: true, look,
      schedule: [{ from: 0, activity: 'idle', place: 'post' }],
      lines: { any: [t.idle] },
    });
    const color = parseInt((HEX[DISC[t.id]?.color ?? ''] ?? '#d9b15a').slice(1), 16);
    shrines.push({ at: at.clone().add(new THREE.Vector3(1.6, 0, 1.2)), color, g: null });
  });

  // A small shrine beside each teacher: a ring of stones and a glowing brazier in the class's colour.
  const group = new THREE.Group();
  scene.add(group);
  const stone = new THREE.MeshStandardMaterial({ color: 0x6a665e, roughness: 0.95 });
  const build = (s: (typeof shrines)[number]) => {
    const g = new THREE.Group();
    g.position.copy(s.at);
    g.position.y = heightAt(s.at.x, s.at.z);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 + (k % 3) * 0.05, 0), stone);
      r.position.set(Math.cos(a) * 0.8, 0.1, Math.sin(a) * 0.8);
      g.add(r);
    }
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.18, 0.5, 8), stone);
    bowl.position.y = 0.25;
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshStandardMaterial({ color: s.color, emissive: s.color, emissiveIntensity: 2.2 }));
    glow.position.y = 0.6;
    g.add(bowl, glow);
    group.add(g);
    s.g = g;
  };

  return {
    settlements,
    records,
    reveal(id) {
      const t = ROSTER_TEACHERS.find((x) => x.id === id);
      if (!t) return null;
      flags[`teacher:${id}`] = 1;
      return `${t.name} teaches ${DISC[id]?.name ?? id}. Find them ${t.where}.`;
    },
    markers() {
      return ROSTER_TEACHERS.filter((t) => flags[`teacher:${t.id}`]).map((t) => ({ x: t.at[0], z: t.at[1], kind: 'site' as const, glyph: '✧', color: HEX[DISC[t.id]?.color ?? ''] ?? '#d9b15a', label: `${t.name} (${DISC[t.id]?.name})` }));
    },
    update(player) {
      for (const s of shrines) if (!s.g && Math.hypot(player.x - s.at.x, player.z - s.at.z) < 160) build(s);
    },
    setVisible(v) {
      group.visible = v;
    },
  };
}
