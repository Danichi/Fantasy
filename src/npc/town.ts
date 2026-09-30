import * as THREE from 'three';
import { NPC, type NpcSpec } from './npc';
import { CAST } from './cast';
import { heightAt } from '../world/terrain';
import { physics } from '../physics/physics';
import { mats, paintedWood } from '../items/materials';
import { buildSword } from '../items/weaponModels';
import type { DialogueUI, DialogueOption } from '../ui/dialogue';
import type { Interactable } from '../dungeon/instance';
import type { Player } from '../player/player';
import { events } from '../core/events';
import { ITEMS } from '../items/itemDefs';
import { AdventurerGuild } from '../guild/adventurerGuild';
import { COMBAT_STYLES } from '../progression/styles';
import { trainingOption, starterChoiceOptions, magicOptions, shopOptions } from './services';

// The townsfolk: who they are, where they stand, and what they teach or sell.

const face = (x: number, z: number, tx = 0, tz = -4) => Math.atan2(tx - x, tz - z);

export const NPCS: NpcSpec[] = [
  {
    id: 'kaela', name: 'Kaela Voss', title: 'Gale Mentor', file: 'kaela.glb', height: 1.72, pos: [-13.5, 0.5], yaw: face(-13.5, 0.5),
    kind: 'rigged', armDrop: 0.95,
    bones: { upperArmL: 'b_MF_UpperArm_L_023', upperArmR: 'b_MF_UpperArm_R_045', spine: ['b_MF_Spine_01_011', 'B_MF_Spine_02_012', 'b_MF_Spine_03_013'], head: 'b_MF_Head_015' },
    greeting: 'Feet apart. Shoulders loose. You hold that blade like it owes you money.',
    lines: [
      { q: 'Who are you?', a: 'Kaela Voss. I teach Gale: speed, chaining and the discipline of keeping momentum alive instead of trading blows.' },
      { q: 'Teach me about Gale.', a: 'Gale rewards precise aggressive play. Every clean chain feeds Momentum, and Momentum makes your attacks faster and harder. Miss, hesitate, or get hit and the wind dies.' },
      { q: 'Any advice?', a: "Slimes crouch before they leap. Parry the leap, and they're yours for the taking. Big ones take longer to wind up. Be patient." },
    ],
    trainerStyle: 'gale',
  },
  {
    id: 'froest', name: 'Master Fröst', title: 'Smith & Merchant', file: 'froest.glb', height: 1.78, pos: [27, 19], yaw: face(27, 19, 0, 0),
    kind: 'clip', clip: 'Shop_Idle',
    greeting: 'Ah, a customer! A real town needs a real forge, and this town is finally getting one.',
    lines: [
      { q: 'What do you sell?', a: 'Steel, shields and armour. Bring coin and I will turn it into something that keeps you alive.' },
      { q: 'What do you know of the crypt?', a: 'Orcs moved into the lower crypt. The Guild is paying good money for anyone brave enough to scout the roads.' },
    ],
  },
  {
    id: 'magus', name: 'Magus Orren', title: 'Keeper of the Old Arts', file: 'magus.glb', height: 1.82, pos: [36, 25], yaw: face(36, 25),
    kind: 'statue',
    greeting: 'The ley lines are restless tonight. This town was built where three old roads of magic meet.',
    lines: [
      { q: 'Teach me magic.', a: 'Magic is separate from martial styles. Choose one of my spell lessons to learn it, then equip the spell on your MOVES bar.' },
      { q: 'The glowing sigil on the crypt?', a: 'A warding seal. It kept the dead in for three hundred years. Someone broke it, and from the inside.' },
      { q: 'Any advice?', a: 'Fire does not care about armour. Lock your eyes on your foe before you cast.' },
    ],
    magicTrainer: true,
  },
  {
    id: 'veyr', name: 'Master Veyr', title: 'Cross Mentor', file: 'urukStatue.glb', height: 1.82, pos: [17, 13], yaw: face(17, 13),
    kind: 'statue',
    greeting: 'A fighter who only knows how to attack is predictable. Cross is the art of creating the opening and being ready before it appears.',
    lines: [
      { q: 'Who are you?', a: 'Master Veyr. I teach Cross: deflect with one line, punish along another, and turn a successful parry into a real advantage.' },
      { q: 'Teach me about Cross.', a: 'A successful parry creates a Cross Opening. Your next damaging strike exploits that opening for extra damage and stagger. Different weapons express the principle differently, but the timing is universal.' },
      { q: 'Can I dual wield?', a: 'Cross works naturally with two weapons, but the school is a combat philosophy rather than a requirement. Spears, greatweapons, daggers and shields can all express the same counter principle.' },
    ],
    trainerStyle: 'cross',
  },
  {
    id: 'corvin', name: 'Ser Corvin', title: 'Boundary Mentor', file: 'corvin.glb', height: 1.98, pos: [5.5, -69], yaw: face(5.5, -69, 5.5, 0),
    kind: 'statue',
    greeting: 'You have the look of someone headed north. This town is the last safe roof before the hills.',
    lines: [
      { q: 'Why the black armour?', a: 'I swore an oath to guard this road, and failed it once. The armour remembers, even when the town forgets.' },
      { q: 'Teach me about Boundary.', a: 'Boundary is commitment. Plant your feet, manage Focus, and turn the space around you into a defensive zone where incoming attacks can be intercepted without frame-perfect timing.' },
      { q: 'About the Warlord...', a: 'Grukk swings a blade taller than you and reaches for a bow when you back away. Watch the steel redden before his heavy cut. That is your moment to parry.' },
    ],
    trainerStyle: 'boundary',
  },
  {
    id: 'innkeeper', name: 'Mara Bell', title: 'Innkeeper of the Wayfarer', file: 'kaela.glb', height: 1.75, pos: [-24, 8], yaw: face(-24, 8, -10, 0),
    kind: 'statue',
    greeting: 'Warm bed, clean water, hot stew. The road can wait until morning.',
    lines: [{ q: 'What does the inn provide?', a: 'A proper rest is worth more than carrying another potion into the dark.' }],
  },
  {
    id: 'apothecary', name: 'Ilyra Moss', title: 'Apothecary', file: 'magus.glb', height: 1.72, pos: [48, -2], yaw: face(48, -2, 0, 0),
    kind: 'statue',
    greeting: 'Roots, salts, distilled mana and enough bitter tincture to make an orc reconsider life choices.',
    lines: [{ q: 'What do you sell?', a: 'Health and mana draughts. Buy them before you need them.' }],
  },
  {
    id: 'baker', name: 'Tessa Rowan', title: 'Baker & Provisioner', file: 'froest.glb', height: 1.68, pos: [-5, 23], yaw: face(-5, 23, 0, -4),
    kind: 'statue',
    greeting: 'Fresh bread! The Guild eats like a small army after a long contract.',
    lines: [{ q: 'Can I buy provisions?', a: 'I keep travel-worthy draughts and simple field supplies by the counter.' }],
  },
  {
    id: 'tailor', name: 'Vela Thread', title: 'Tailor & Leatherworker', file: 'kaela.glb', height: 1.7, pos: [-48, 1], yaw: face(-48, 1, -20, 0),
    kind: 'statue',
    greeting: 'A cloak tells people where you have been. Mine are made for getting back alive.',
    lines: [{ q: 'What can you make?', a: 'Travel cloaks, belts and field leathers. Good gear starts long before the first monster.' }],
  },
  {
    id: 'carpenter', name: 'Bram Oakhand', title: 'Carpenter & Shieldwright', file: 'corvin.glb', height: 1.85, pos: [-44, 21], yaw: face(-44, 21, 0, 0),
    kind: 'statue',
    greeting: 'Every wall, cart and shield in town has my fingerprints on it.',
    lines: [{ q: 'What do you sell?', a: 'Light shields and practical weapons for new adventurers.' }],
  },
  {
    id: 'arcanist', name: 'Sera Lumis', title: 'Arcane Merchant', file: 'magus.glb', height: 1.78, pos: [48, 26], yaw: face(48, 26, 0, 0),
    kind: 'statue',
    greeting: 'Magic is expensive because mistakes are expensive.',
    lines: [{ q: 'What do you sell?', a: 'Beginner battle magic and a few trinkets for people who would rather glow than die.' }],
  },
  {
    id: 'stablemaster', name: 'Hobb Reed', title: 'Stablemaster', file: 'froest.glb', height: 1.74, pos: [48, -40], yaw: face(48, -40, 0, 0),
    kind: 'statue',
    greeting: 'The frontier starts at the gate. A good mount makes the frontier smaller.',
    lines: [{ q: 'Can I restock for travel?', a: 'A little coin here buys the kind of supplies that save a trip back to town.' }],
  },
];

/** Fröst's forge stall: table, awning, crates, an anvil and weapon rack. */
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
  const c = document.createElement('canvas');
  c.width = 128; c.height = 16;
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
  for (let i = 0; i < 2; i++) {
    const s = buildSword({ bladeLen: 0.75, bladeWidth: 0.025, thickness: 0.004, fullerLen: 0.6, gripLen: 0.12, guardSpan: 0.1, guardStyle: 'straight', pommel: 'wheel' });
    s.rotation.set(Math.PI / 2, 0, Math.PI / 2 + 0.2 * i);
    s.position.set(-0.6 + i * 0.35, 1.0, 0.1 - i * 0.15);
    g.add(s);
  }
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

/** What each merchant will buy back, per unit. */
const BUYS: Record<string, [string, number][]> = {
  baker: [['wheat', 3], ['carrot', 2], ['cabbage', 4], ['pumpkin', 8], ['egg', 2], ['milk', 4], ['apple', 2], ['pear', 3]],
  innkeeper: [['apple', 3], ['pear', 3], ['milk', 4], ['egg', 3], ['pumpkin', 7]],
  tailor: [['wool', 7]],
  froest: [['ironOre', 9]],
  apothecary: [['sungrass', 3], ['moongrass', 6], ['wildmint', 3], ['ironleaf', 6], ['redcap', 5], ['silverthistle', 8], ['duskbloom', 18], ['emberroot', 9]],
  zarek: [['duskbloom', 22], ['emberroot', 11], ['silverthistle', 9], ['honeycomb', 8], ['wool', 8], ['ironOre', 10], ['riverReed', 3], ['wildGarlic', 3]],
  // Nix the Fence, in the Quiet Hands' den: over the odds, no questions.
  nix: [['ironOre', 12], ['duskbloom', 25], ['moongrass', 8], ['honeycomb', 10], ['wool', 9], ['silverthistle', 10], ['emberroot', 12]],
  hester: [['wheat', 4], ['milk', 5], ['egg', 3], ['apple', 3], ['pumpkin', 9], ['wildGarlic', 4], ['brambleBerries', 3], ['cabbage', 5], ['carrot', 3]],
};

export class Town {
  readonly npcs: NPC[];
  readonly guild: AdventurerGuild;
  /** quests add options (offers, turn-ins) to a townsperson's menu */
  questOptions?: (npcId: string, show: (text: string, opts: DialogueOption[]) => void, back: () => void) => DialogueOption[];
  /** services from other systems (stables, coaches) */
  serviceOptions?: (npcId: string, show: (text: string, opts: DialogueOption[]) => void, back: () => void) => DialogueOption[];
  private tags = new Map<string, HTMLDivElement>();
  private tmp = new THREE.Vector3();

  constructor(private scene: THREE.Scene, private camera: THREE.Camera, private dialogue: DialogueUI, private player: Player) {
    // Swap in the stylised cast (src/npc/cast.ts) for every character that has a look.
    for (const s of NPCS) {
      const look = CAST[s.id];
      if (look) {
        s.kind = 'built';
        s.look = look;
        s.height = look.body === 'female' ? 1.72 : 1.82;
      }
    }
    this.npcs = NPCS.map((s) => new NPC(s, scene));
    const f = NPCS.find((n) => n.id === 'froest')!;
    const fwd = new THREE.Vector2(Math.sin(f.yaw), Math.cos(f.yaw));
    buildStall(this.scene, f.pos[0] + fwd.x * 1.3, f.pos[1] + fwd.y * 1.3, f.yaw);
    this.guild = new AdventurerGuild(scene, player.prog, dialogue);
    const root = document.getElementById('ui')!;
    for (const n of NPCS) {
      const t = document.createElement('div');
      t.className = 'npc-tag';
      t.innerHTML = n.name + '<small>' + n.title + '</small>';
      root.appendChild(t);
      this.tags.set(n.id, t);
    }
  }

  get ready() {
    return Promise.all(this.npcs.map((n) => n.loaded)).then(() => undefined);
  }

  interactables(): Interactable[] {
    return [
      ...this.npcs.map((n) => ({
        pos: n.pos,
        radius: 2.6,
        label: () => n.spec.id === 'guild' ? 'Enter the Adventurer\'s Guild' : 'Talk to ' + n.spec.name,
        enabled: () => true,
        action: () => this.talk(n.spec),
      })),
      this.guild.interactable() as Interactable,
    ];
  }

  showShop(speaker: string, title: string, intro: string, stock: [string, number][]) {
    const opts = stock.map(([id, price]) => ({
      label: 'Buy ' + ITEMS[id].name + ' — ' + price + 'g',
      run: () => {
        if (this.player.prog.gold < price) {
          this.dialogue.show(speaker, title, 'You need ' + price + ' gold for that. Come back with more coin.', [{ label: 'Back.', run: () => this.showShop(speaker, title, intro, stock) }]);
          return;
        }
        this.player.prog.addGold(-price);
        this.player.equip.add(id);
        this.dialogue.show(speaker, title, 'Sold. Take good care of it.', [{ label: 'Back to shop.', run: () => this.showShop(speaker, title, intro, stock) }]);
      },
    }));
    opts.push({ label: 'Farewell.', run: () => this.dialogue.close() });
    this.dialogue.show(speaker, title, intro, opts);
  }

  private service(speaker: string, title: string, text: string, cost: number) {
    this.dialogue.show(speaker, title, text, [
      {
        label: 'Rest and recover — ' + cost + 'g',
        run: () => {
          if (this.player.prog.gold < cost) {
            this.dialogue.show(speaker, title, 'You do not have enough gold for a proper rest.', [{ label: 'Back.', run: () => this.service(speaker, title, text, cost) }]);
            return;
          }
          this.player.prog.addGold(-cost);
          this.player.hp = this.player.maxHp;
          this.player.mana = this.player.maxMana;
          this.player.stamina = this.player.maxStamina;
          this.dialogue.show(speaker, title, 'You are restored. The frontier can wait.', [{ label: 'Good. Thanks.', run: () => this.dialogue.close() }]);
          events.emit('progressChanged', {});
        },
      },
      { label: 'Farewell.', run: () => this.dialogue.close() },
    ]);
  }

  private talkShop(s: NpcSpec) {
    switch (s.id) {
      case 'innkeeper':
        this.service(s.name, s.title, 'A warm room and a full meal will restore your health, mana and stamina.', 18);
        return true;
      case 'apothecary':
        this.showShop(s.name, s.title, 'Carefully brewed field medicine.', [['healthPotion', 20], ['manaPotion', 25]]);
        return true;
      case 'baker':
        this.showShop(s.name, s.title, 'Travel provisions — and seed for anyone working a plot. Plant it, water it, and it is ready in half a day.', [['healthPotion', 15], ['manaPotion', 20], ['wheatSeed', 3], ['carrotSeed', 3], ['cabbageSeed', 4], ['pumpkinSeed', 6]]);
        return true;
      case 'tailor':
        this.showShop(s.name, s.title, 'Cloaks and belts made for long expeditions.', [['wayfarerCloak', 95], ['warriorBelt', 80]]);
        return true;
      case 'carpenter':
        this.showShop(s.name, s.title, 'Reliable beginner gear, built to survive rough travel.', [['roundShield', 55], ['armingSword', 60]]);
        return true;
      case 'arcanist':
        this.showShop(s.name, s.title, 'Battle magic for people who have already learned to respect fire.', [['fireball', 150], ['healingLight', 165], ['ringSage', 190]]);
        return true;
      case 'stablemaster':
        this.showShop(s.name, s.title, 'Restock before you leave the walls.', [['healthPotion', 18], ['manaPotion', 22]]);
        return true;
    }
    return false;
  }

  private count(id: string) {
    return this.player.equip.items.filter((i) => i.def.id === id).reduce((n, i) => n + i.qty, 0);
  }

  /** Sell everything of the kinds this merchant buys. */
  sellOptions(id: string, name: string, title: string, back: () => void): DialogueOption[] {
    const buys = BUYS[id];
    if (!buys) return [];
    const have = buys.filter(([item]) => this.count(item) > 0);
    if (!have.length) return [];
    const total = have.reduce((g, [item, price]) => g + this.count(item) * price, 0);
    return [{
      label: `Sell produce and materials — ${total}g (${have.map(([item]) => this.count(item) + ' ' + ITEMS[item].name).join(', ')})`,
      run: () => {
        for (const [item] of have) {
          const it = this.player.equip.items.find((i) => i.def.id === item);
          if (it) this.player.equip.items.splice(this.player.equip.items.indexOf(it), 1);
        }
        this.player.prog.addGold(total);
        events.emit('equipmentChanged', {});
        events.emit('progressChanged', {});
        this.dialogue.show(name, title, `A fair trade. ${total} gold for the lot.`, [{ label: 'Back.', run: back }, { label: 'Farewell.', run: () => this.dialogue.close() }]);
      },
    }];
  }

  /** Extra replies from the discipline system (teach, switch class, respec). */
  mentorOptions?: (s: NpcSpec, say: (text: string) => void) => DialogueOption[];

  talk(s: NpcSpec, text = s.greeting, skipQuests = false) {
    const npc = this.npcs.find((n) => n.spec.id === s.id);
    if (npc) npc.talkT = 6 + text.length * 0.035;
    // Quests and trade come first; "Something else" opens the usual menu.
    if (!skipQuests) {
      const show = (t: string, opts: DialogueOption[]) => this.dialogue.show(s.name, s.title, t, opts);
      const quest = [...(this.questOptions?.(s.id, show, () => this.talk(s)) ?? []), ...(this.serviceOptions?.(s.id, show, () => this.talk(s)) ?? [])];
      const sell = this.sellOptions(s.id, s.name, s.title, () => this.talk(s, s.greeting, true));
      if (quest.length || sell.length) {
        this.dialogue.show(s.name, s.title, text, [...quest, ...sell, { label: BUYS[s.id] || s.id === 'innkeeper' ? 'Let me see your wares.' : 'Something else…', run: () => this.talk(s, text, true) }, { label: 'Farewell.', run: () => this.dialogue.close() }]);
        return;
      }
    }
    if (this.talkShop(s)) return;
    if (s.trainerStyle && text === s.greeting && !this.player.prog.styleIntroductions.includes(s.trainerStyle)) {
      this.player.prog.markStyleIntroduction(s.trainerStyle);
      const style = COMBAT_STYLES[s.trainerStyle];
      text = `${s.greeting} ${style.name} is the art of ${style.mechanic.charAt(0).toLowerCase() + style.mechanic.slice(1)}`;
    }
    const opts: DialogueOption[] = s.lines.map((l) => ({ label: l.q, run: () => this.talk(s, l.a) }));
    opts.push(...(this.mentorOptions?.(s, (t) => this.talk(s, t)) ?? []));
    if (s.trainerStyle) {
      const train = trainingOption(this.player, s.trainerStyle, (next) => this.talk(s, next));
      opts.unshift(...starterChoiceOptions(this.player, (next) => this.talk(s, next)), train);
    }
    if (s.magicTrainer) {
      opts.unshift(...magicOptions(this.player, (next) => this.talk(s, next)));
    }
    if (s.id === 'froest') {
      opts.unshift({ label: "Browse Fröst's wares", run: () => this.shop() });
    }
    opts.push({ label: 'Farewell.', run: () => this.dialogue.close() });
    this.dialogue.show(s.name, s.title, text, opts);
  }

  private shop(text = "Pick something useful. I can sell you the steel; what you do with it is your business.") {
    const opts = shopOptions(this.player, (next) => this.shop(next));
    opts.push({ label: 'Leave the stall.', run: () => this.dialogue.close() });
    this.dialogue.show('Master Fröst', 'Smith & Merchant', text, opts);
  }

  setVisible(v: boolean) {
    for (const n of this.npcs) n.root.visible = v;
    this.guild.setVisible(v);
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
        tag.style.left = (this.tmp.x * 0.5 + 0.5) * window.innerWidth + 'px';
        tag.style.top = (-this.tmp.y * 0.5 + 0.5) * window.innerHeight + 'px';
        tag.style.opacity = String(Math.min(1, (14 - d) / 4));
      }
    }
    this.guild.update(dt, player);
  }
}
