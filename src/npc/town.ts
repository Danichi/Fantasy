import * as THREE from 'three';
import { NPC, type NpcSpec } from './npc';
import { heightAt } from '../world/terrain';
import { physics } from '../physics/physics';
import { mats, paintedWood } from '../items/materials';
import { buildSword } from '../items/weaponModels';
import type { DialogueOption, DialogueUI } from '../ui/dialogue';
import type { Interactable } from '../dungeon/instance';

// The townsfolk: who they are, where they stand, and what they'll tell you.
// (Class training and the shop hook into these same conversations next.)

const face = (x: number, z: number, tx = 0, tz = -4) => Math.atan2(tx - x, tz - z);

export const NPCS: NpcSpec[] = [
  {
    id: 'kaela', name: 'Kaela Voss', title: 'Sword Master', file: 'kaela.glb', height: 1.72, pos: [-13.5, 0.5], yaw: face(-13.5, 0.5),
    kind: 'rigged', armDrop: 0.95,
    bones: { upperArmL: 'b_MF_UpperArm_L_023', upperArmR: 'b_MF_UpperArm_R_045', spine: ['b_MF_Spine_01_011', 'B_MF_Spine_02_012', 'b_MF_Spine_03_013'], head: 'b_MF_Head_015' },
    greeting: 'Feet apart. Shoulders loose. You hold that blade like it owes you money.',
    lines: [
      { q: 'Who are you?', a: "Kaela Voss. I trained the town watch, back when the watch still came home. The crypt up north swallows good steel." },
      { q: 'Teach me the sword.', a: "Not yet. The drill yard's still being cleared. Come back soon and I'll show you techniques worth the bruises." },
      { q: 'Any advice?', a: "Slimes crouch before they leap. Parry the leap, and they're yours for the taking. Big ones take longer to wind up. Be patient." },
    ],
  },
  {
    id: 'froest', name: 'Master Fröst', title: 'Smith & Merchant', file: 'froest.glb', height: 1.78, pos: [-25, 15], yaw: face(-25, 15),
    kind: 'clip', clip: 'Shop_Idle',
    greeting: "Ah, a customer! Well, a future customer. My wagon from the coast hasn't come in yet.",
    lines: [
      { q: 'What do you sell?', a: 'Blades, plate, draughts for what ails you. The wagon is due any day. Come back and I will make you a fair price.' },
      { q: 'What do you know of the crypt?', a: "An orc warlord and his lot moved into the lower crypt last winter. Folk call him Grukk. Anything you drag out of there, I'll buy. Most never come back to sell." },
    ],
  },
  {
    id: 'magus', name: 'Magus Orren', title: 'Keeper of the Old Arts', file: 'magus.glb', height: 1.82, pos: [30, 25], yaw: face(30, 25),
    kind: 'statue',
    greeting: 'The ley lines are restless tonight. Can you feel it? No? Hm. You will.',
    lines: [
      { q: 'Teach me magic.', a: 'Soon. Magic is not handed out like bread. Survive the crypt first, then we will see what wakes in you.' },
      { q: 'The glowing sigil on the crypt?', a: 'A warding seal. It kept the dead in for three hundred years. Someone broke it, and from the inside.' },
      { q: 'Any advice?', a: 'Fire does not care about armour. Lock your eyes on your foe before you cast, or the flame goes wherever it pleases.' },
    ],
  },
  {
    id: 'corvin', name: 'Ser Corvin', title: 'The Black Knight', file: 'corvin.glb', height: 1.98, pos: [5.5, -69], yaw: face(5.5, -69, 5.5, 0),
    kind: 'statue',
    greeting: 'You have the look of someone headed north. Most who take that road do not walk it twice.',
    lines: [
      { q: 'Why the black armour?', a: 'I swore an oath to guard this road, and failed it once. The armour remembers, even when the town forgets.' },
      { q: 'Teach me the shield.', a: "A shield is a promise that you'll still be standing. When you have earned it, I will teach you the Bulwark." },
      { q: 'About the Warlord...', a: 'Grukk swings a blade taller than you and reaches for a bow when you back away. Watch the steel redden before his heavy cut. That is your moment to parry.' },
    ],
  },
];

/** Fröst's market stall: table, awning, crates, an anvil and a weapon rack. */
function buildStall(scene: THREE.Scene, x: number, z: number, yaw: number) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ map: paintedWood(61, () => {}, 6), roughness: 0.85, color: 0x9a7a5a });
  const table = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.9), wood);
  table.position.set(0, 0.95, 0);
  g.add(table);
  for (const [lx, lz] of [[-1.1, -0.38], [1.1, -0.38], [-1.1, 0.38], [1.1, 0.38]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.95, 0.08), wood);
    leg.position.set(lx, 0.47, lz);
    g.add(leg);
  }
  // Striped canvas awning on two posts.
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 16;
  const cg = c.getContext('2d')!;
  for (let i = 0; i < 8; i++) {
    cg.fillStyle = i % 2 ? '#e8dcc0' : '#8a2a22';
    cg.fillRect(i * 16, 0, 16, 16);
  }
  const canvasTex = new THREE.CanvasTexture(c);
  canvasTex.colorSpace = THREE.SRGBColorSpace;
  const awning = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.8), new THREE.MeshStandardMaterial({ map: canvasTex, side: THREE.DoubleSide, roughness: 0.95 }));
  awning.position.set(0, 2.45, -0.3);
  awning.rotation.x = -Math.PI / 2 + 0.3;
  g.add(awning);
  for (const px of [-1.4, 1.4]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.6, 8), wood);
    post.position.set(px, 1.3, 0.45);
    g.add(post);
  }
  // Wares: a couple of swords and a helm-shaped bundle on the table.
  for (let i = 0; i < 2; i++) {
    const s = buildSword({ bladeLen: 0.75, bladeWidth: 0.025, thickness: 0.004, fullerLen: 0.6, gripLen: 0.12, guardSpan: 0.1, guardStyle: 'straight', pommel: 'wheel' });
    s.rotation.set(Math.PI / 2, 0, Math.PI / 2 + 0.2 * i);
    s.position.set(-0.6 + i * 0.35, 1.0, 0.1 - i * 0.15);
    g.add(s);
  }
  // Anvil beside the stall.
  const anvil = new THREE.Group();
  const iron = mats().iron;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.45, 10), wood);
  base.position.y = 0.22;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.22), iron);
  body.position.y = 0.55;
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 10), iron);
  horn.rotation.z = Math.PI / 2;
  horn.position.set(0.44, 0.58, 0);
  anvil.add(base, body, horn);
  anvil.position.set(1.9, 0, 0.9);
  g.add(anvil);
  g.traverse((o) => ((o as THREE.Mesh).isMesh && ((o.castShadow = true), (o.receiveShadow = true))));
  g.position.set(x, heightAt(x, z), z);
  g.rotation.y = yaw;
  scene.add(g);
  physics.addBox(new THREE.Vector3(x, heightAt(x, z) + 0.5, z), new THREE.Vector3(1.3, 0.5, 0.55), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)));
}

export class Town {
  readonly npcs: NPC[];
  private tags = new Map<string, HTMLDivElement>();
  private tmp = new THREE.Vector3();

  constructor(private scene: THREE.Scene, private camera: THREE.Camera, private dialogue: DialogueUI) {
    this.npcs = NPCS.map((s) => new NPC(s, scene));
    // Fröst's stall stands between him and the square.
    const f = NPCS.find((n) => n.id === 'froest')!;
    const fwd = new THREE.Vector2(Math.sin(f.yaw), Math.cos(f.yaw));
    buildStall(this.scene, f.pos[0] + fwd.x * 1.3, f.pos[1] + fwd.y * 1.3, f.yaw);
    const root = document.getElementById('ui')!;
    for (const n of NPCS) {
      const t = document.createElement('div');
      t.className = 'npc-tag';
      t.innerHTML = `${n.name}<small>${n.title}</small>`;
      root.appendChild(t);
      this.tags.set(n.id, t);
    }
  }

  get ready() {
    return Promise.all(this.npcs.map((n) => n.loaded)).then(() => undefined);
  }

  interactables(): Interactable[] {
    return this.npcs.map((n) => ({
      pos: n.pos,
      radius: 2.6,
      label: () => `Talk to ${n.spec.name}`,
      enabled: () => true,
      action: () => this.talk(n.spec),
    }));
  }

  /** Extra replies from the discipline system (teach, switch class, respec). */
  mentorOptions?: (s: NpcSpec, say: (text: string) => void) => DialogueOption[];

  talk(s: NpcSpec, text = s.greeting) {
    const opts: DialogueOption[] = s.lines.map((l) => ({ label: l.q, run: () => this.talk(s, l.a) }));
    opts.push(...(this.mentorOptions?.(s, (t) => this.talk(s, t)) ?? []));
    opts.push({ label: 'Farewell.', run: () => this.dialogue.close() });
    this.dialogue.show(s.name, s.title, text, opts);
  }

  setVisible(v: boolean) {
    for (const n of this.npcs) n.root.visible = v;
    if (!v) for (const t of this.tags.values()) t.style.display = 'none';
  }

  update(dt: number, player: THREE.Vector3) {
    for (const n of this.npcs) {
      if (!n.root.visible) continue;
      n.update(dt, player);
      const tag = this.tags.get(n.spec.id)!;
      const d = n.pos.distanceTo(player);
      this.tmp.copy(n.head).project(this.camera);
      const on = d < 14 && this.tmp.z < 1 && Math.abs(this.tmp.x) < 1 && Math.abs(this.tmp.y) < 1;
      tag.style.display = on ? 'block' : 'none';
      if (on) {
        tag.style.left = `${(this.tmp.x * 0.5 + 0.5) * window.innerWidth}px`;
        tag.style.top = `${(-this.tmp.y * 0.5 + 0.5) * window.innerHeight}px`;
        tag.style.opacity = `${Math.min(1, (14 - d) / 4)}`;
      }
    }
  }
}
