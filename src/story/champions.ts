import * as THREE from 'three';
import { Bandit, type Bolts } from '../enemies/bandit';
import { Undead } from '../enemies/undead';
import { combat } from '../combat/core';
import type { HitInfo, Target } from '../combat/targets';
import type { Look } from '../npc/charBuilder';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';
import { heightAt } from '../world/terrainHeight';

// The Champions' Game (main story). The Hollow King, who has ruled the Dark
// for thousands of years, is dying, and the great powers each want his
// throne. Sworn never to fight one another, they fight through champions,
// summoned into the world at each turning of the Sunwheel: an "age". The
// wheel turns faster as he weakens. The First Age was a thousand years ago,
// the Second three hundred, the Third forty, the Fourth ten; the Fifth is now,
// and you are the Dawn's champion of it. Champions who live keep their
// patron's favour, and grow. A Fifth Age champion is a peer. A Fourth is a
// veteran; a Third a legend; a Second is something out of a war-song; and a
// First Age champion has been fed by a god for a thousand years.

export type PowerId = 'dawn' | 'dragonGod' | 'dragonKing' | 'verdant' | 'ironBelow' | 'hollow';

export interface Power {
  id: PowerId;
  name: string;
  color: string;
  /** what everyone knows */
  known: string;
  /** what its champions carry: the tells you learn to read */
  marks: string;
}

export const POWERS: Record<PowerId, Power> = {
  dawn: {
    id: 'dawn', name: 'The Dawn', color: '#ffcf6a',
    known: 'Cresha\'s own god, sung to every morning in the Temple. The Sunwheel is its mark, cut into stones older than the kingdom.',
    marks: 'The Sunwheel. Warm hands. A light that comes back however often it is put out.',
  },
  dragonGod: {
    id: 'dragonGod', name: 'The Dragon God', color: '#ff6a3a',
    known: 'Ashfang, worshipped in Valoria. A god of fire that remembers every insult.',
    marks: 'Ember-coloured eyes. A coiled flame worked into armour. Heat that does not come from any fire.',
  },
  dragonKing: {
    id: 'dragonKing', name: 'The Dragon King', color: '#e8c050',
    known: 'Veyrmos, a living dragon in the far north who has not slept in four hundred years. Not a god. He would tell you the difference does not matter.',
    marks: 'A crowned claw. Pupils that narrow in bright light. A habit of never turning their back on a door.',
  },
  verdant: {
    id: 'verdant', name: 'The Verdant Mother', color: '#7ad08a',
    known: 'The elves\' green goddess. Patience older than stone.',
    marks: 'A ring of thorns. They do not age. Plants lean toward them.',
  },
  ironBelow: {
    id: 'ironBelow', name: 'The Iron Below', color: '#a0a8b8',
    known: 'The buried god of the oldest dwarf-holds. It wants the Dark for a forge.',
    marks: 'Black iron that is cold to the touch. An anvil with an eye. Grukk\'s warband was paid in it.',
  },
  hollow: {
    id: 'hollow', name: '???', color: '#9a7aa8',
    known: 'Nobody will say who sends him.',
    marks: 'A Sunwheel on his shield, cut backwards.',
  },
};

export interface ChampionDef {
  id: string;
  name: string;
  epithet: string;
  age: 1 | 2 | 3 | 4 | 5;
  power: PowerId;
  /** the power stays hidden until you've worked it out (codex) */
  hidden?: boolean;
  look: Look;
  /** what the codex says once you've met them */
  about: string;
  /** clues to their patron, found through the story (ids → text) */
  clues?: Record<string, string>;
  /** dead (the Dawn's four before you) */
  dead?: boolean;
  taunts?: string[];
}

const L = (o: Partial<Look> & { body: Look['body'] }): Look => ({ outfit: 'ranger', hair: 'buzzed', hairColor: 0x2a1c14, skin: 0xe0b894, height: 1.85, ...o } as Look);

export const CHAMPIONS: Record<string, ChampionDef> = {
  // ---- your rivals and the others still living ---------------------------------------------
  malric: {
    id: 'malric', name: 'Ser Malric Dane', epithet: 'the Wheelbreaker', age: 4, power: 'ironBelow',
    look: L({ body: 'male', beard: true, hairColor: 0x1a1414, skin: 0xc89a74, cloth: 0x23262c, pauldron: true, height: 1.97 }),
    about: 'Summoned ten years ago, in the Fourth Age. He has spent those years hunting the Dawn\'s champions, and is good at it. He paid Grukk in black iron to dig for a Sunwheel door.',
    clues: { malricIron: 'Grukk\'s warband was paid in black iron, cold to the touch.', malricEye: 'An anvil with an eye on his pauldron.' },
    taunts: ['The Dawn sends them young now.', 'Your fourth lasted longer than this. Not much longer.', 'Every wheel I break, the Iron Below remembers.', 'Better. Not good. Better.'],
  },
  hesk: {
    id: 'hesk', name: 'Hesk the Quiet', epithet: 'the Knife Under the Table', age: 4, power: 'ironBelow', hidden: true,
    look: L({ body: 'female', hair: 'long', hairColor: 0x0e0c0c, skin: 0xa8744e, cloth: 0x15151a, hood: true, height: 1.74 }),
    about: 'A Fourth Age champion who never fights where anyone can see. She was the Chancellor\'s guest for a month.',
    clues: { heskLedger: 'The Chancellor\'s ledger pays "H." in black iron ingots.', heskIron: 'Her knife was black iron, cold even after she\'d held it.' },
    taunts: ['Shh.', 'You hear that? No? Good.'],
  },
  dorian: {
    id: 'dorian', name: 'Cadet Dorian Vale', epithet: 'Best Blade of the Year', age: 5, power: 'dragonKing', hidden: true,
    look: L({ body: 'male', hair: 'simpleparted', hairColor: 0xd8b070, skin: 0xfff0e6, cloth: 0x7a1f1f, height: 1.86 }),
    about: 'Summoned this year, like you. Arrived at the Academy a season before you did with a story about a farm in the north that nobody can find on a map.',
    clues: { dorianDoor: 'He never sits with his back to a door. Not once.', dorianEyes: 'In the noon sun on the ring, his pupils narrowed to slits.' },
    taunts: ['Same year, same road. Different master.', 'Don\'t look at me like that. You\'d do the same.'],
  },
  veyr: {
    id: 'veyr', name: 'Master Veyr', epithet: 'of the Ninefold Duels', age: 3, power: 'dragonKing', hidden: true,
    look: L({ body: 'male', hair: 'buzzed', hairColor: 0xb8b4ae, skin: 0xe0b894, cloth: 0x2a2a3a, height: 1.82 }),
    about: 'He fought the Ninefold Duels forty years ago, when the Third Age turned. He has been winning ever since. He is going blind, and he is still the best blade in the valley.',
    clues: { veyrClaw: 'A crowned claw is etched under the guard of his sword.', veyrDoor: 'He keeps his back to the wall, always, and his eyes on the door.', veyrAge: 'Kaela fought him when she was twenty. He looked the same then as now.' },
  },
  varro: {
    id: 'varro', name: 'Legate Cassius Varro', epithet: 'the Ember Legate', age: 2, power: 'dragonGod',
    look: L({ body: 'male', hair: 'buzzed', hairColor: 0x0c0a0a, skin: 0x8a5a3a, cloth: 0x6a1410, pauldron: true, height: 2.0 }),
    about: 'Valoria\'s envoy to the Crown. Summoned three hundred years ago in the Second Age. He has outlived every king who ever received him, and he is polite about it.',
    clues: {},
    taunts: ['Three hundred years, little Fifth. I have killed champions with a cup in my hand.', 'Ashfang sends his regards. All of them.'],
  },
  ysra: {
    id: 'ysra', name: 'Ysra the Undying', epithet: 'the Thornmother\'s Blade', age: 1, power: 'verdant',
    look: L({ body: 'female', hair: 'long', hairColor: 0xd8e8c8, skin: 0xe8dcc8, cloth: 0x2a4a2a, height: 1.9 }),
    about: 'A First Age champion. The first champion of the Dawn wrote of her a thousand years ago: "a woman who fought like she had been doing it for a hundred years." She has been doing it for eleven hundred now.',
    clues: {},
    taunts: ['Little sapling.', 'I knew your first. She was braver than you.'],
  },
  wheelShield: {
    id: 'wheelShield', name: 'The Wheel-Shield', epithet: 'who would not say who sent him', age: 1, power: 'hollow', hidden: true,
    look: L({ body: 'male', hair: 'buzzed', hairColor: 0x101010, skin: 0x8a8a90, cloth: 0x0a0a10, pauldron: true, height: 2.15 }),
    about: 'A First Age champion. He carries the Sunwheel on his shield, cut backwards. The Dawn\'s first champion met him a thousand years ago and wrote that he would not say who sent him. He still won\'t.',
    clues: {},
    taunts: ['...', 'Five.'],
  },
  // ---- the four before you: the Dawn's dead ----------------------------------------------
  elin: {
    id: 'elin', name: 'Elin', epithet: 'the Dawn\'s First', age: 1, power: 'dawn', dead: true,
    look: L({ body: 'female', hair: 'buns', hairColor: 0x6a4428, cloth: 0xc8a050, height: 1.7 }),
    about: 'The Dawn\'s champion of the First Age. Her camps and her grave are somewhere in Cresha, and her journal with them. She wrote that she had a life before.',
  },
  oswald: {
    id: 'oswald', name: 'Ser Oswald Marr', epithet: 'the Dawn\'s Second', age: 2, power: 'dawn', dead: true,
    look: L({ body: 'male', beard: true, cloth: 0x8a5a2a, pauldron: true }),
    about: 'The Dawn\'s champion of the Second Age, three hundred years ago. His tomb was lost in the caves under Hollow Ridge. Ingrid\'s adventuring party went looking for it ten years ago, and only Ingrid came back.',
  },
  hallam: {
    id: 'hallam', name: 'Ser Hallam', epithet: 'the Dawn\'s Third', age: 3, power: 'dawn', dead: true,
    look: L({ body: 'male', hair: 'simpleparted', cloth: 0x3a5f9e }),
    about: 'The Dawn\'s champion of the Third Age, a knight of the north road. He died holding Harrow Ford on the Crown Road. A young soldier named Corvin took his sword and his title so the line would hold.',
  },
  tobin: {
    id: 'tobin', name: 'Ser Tobin Reyes', epithet: 'the Dawn\'s Fourth', age: 4, power: 'dawn', dead: true,
    look: L({ body: 'male', hair: 'simpleparted', cloth: 0x5a7a3a, pauldron: true }),
    about: 'The Dawn\'s champion of the Fourth Age. Malric broke him on an old battlefield past Kingsmile and left him to the Dark. What the Dark made of him is still standing there: the Rust Knight.',
  },
};

/** How strong a champion of each age is. */
export const AGE_STATS: Record<number, { hp: number; dmg: number; posture: number; pace: number; poiseK: number; special: number }> = {
  5: { hp: 480, dmg: 15, posture: 170, pace: 1.0, poiseK: 0.9, special: 9 },
  4: { hp: 1500, dmg: 26, posture: 420, pace: 1.15, poiseK: 0.55, special: 7 },
  3: { hp: 3800, dmg: 44, posture: 950, pace: 1.25, poiseK: 0.3, special: 5.5 },
  2: { hp: 9500, dmg: 80, posture: 2400, pace: 1.35, poiseK: 0.12, special: 4.5 },
  1: { hp: 60000, dmg: 170, posture: 1e6, pace: 1.5, poiseK: 0, special: 3.5 },
};

export interface ChampionHooks {
  fx: FX;
  scene: THREE.Scene;
  /** speak a line over the fight */
  say(name: string, line: string): void;
  shake(n: number): void;
  /** a thing it called up (the Dark's shades) */
  enemies: Target[];
}

/**
 * A champion in a fight: the humanoid brain of a swordsman, scaled to their
 * age, with the gifts their patron gave them: a surge that closes any gap
 * (Fourth Age and older), a burst of the Dark around them (Third), shades
 * called up out of the ground (Second), and from a First Age champion a step
 * through the air to stand behind you.
 */
export class Champion extends Bandit {
  readonly def: ChampionDef;
  private specialT: number;
  private surge: { t: number; from: THREE.Vector3; to: THREE.Vector3; hit: boolean } | null = null;
  private nova: { t: number } | null = null;
  shades: Undead[] = [];
  private tauntT = 6;
  private said = new Set<number>();
  /** never drops below this fraction of health (scripted fights you're meant to survive, not win) */
  floor = 0;
  /** at the floor: the scene takes over */
  onFloor?: () => void;
  private floored = false;
  /** a level the hit points are scaled for */
  constructor(def: ChampionDef, at: THREE.Vector3, scene: THREE.Scene, bolts: Bolts, private hooks: ChampionHooks, scale = 1) {
    super('sword', at, scene, bolts, at.clone(), def.look);
    this.def = def;
    const s = AGE_STATS[def.age];
    this.kind = 'champion';
    this.name = `${def.name}, ${def.epithet}`;
    this.label = def.name;
    this.maxHp = this.hp = Math.round(s.hp * scale);
    this.hitDamage = Math.round(s.dmg * Math.sqrt(scale));
    this.pace = s.pace;
    this.postureMax = s.posture * scale;
    this.specialT = s.special;
    this.alerted = true;
  }
  label: string;
  get age() {
    return this.def.age;
  }
  get boss() {
    return true;
  }

  takeHit(h: HitInfo) {
    const s = AGE_STATS[this.def.age];
    // Old champions barely notice a blow.
    const hh = { ...h, poise: h.poise * s.poiseK, react: s.poiseK < 0.2 ? 'none' as const : h.react };
    if (this.floor > 0 && this.hp - h.damage <= this.maxHp * this.floor) {
      this.hp = this.maxHp * this.floor + 1;
      if (!this.floored) {
        this.floored = true;
        this.onFloor?.();
      }
      return;
    }
    super.takeHit(hh);
    // Bloodied: a word for you.
    const k = this.hp / this.maxHp;
    for (const [i, at] of [[0, 0.75], [1, 0.45], [2, 0.2]] as const) {
      if (k < at && !this.said.has(i) && this.def.taunts?.length) {
        this.said.add(i);
        this.hooks.say(this.def.name, this.def.taunts[(i + 1) % this.def.taunts.length]);
      }
    }
  }

  update(dt: number, player: Player) {
    for (const s of this.shades) s.update(dt, player, this.shades);
    this.shades = this.shades.filter((s) => !s.dead || (s.dispose(), false));
    if (!this.alive || player.dead) return super.update(dt, player);
    this.specialT -= dt;
    this.tauntT -= dt;
    if (this.tauntT <= 0 && this.def.taunts?.length) {
      this.tauntT = 14 + Math.random() * 10;
      if (Math.random() < 0.5) this.hooks.say(this.def.name, this.def.taunts[Math.floor(Math.random() * this.def.taunts.length)]);
    }
    if (this.surge) return this.runSurge(dt, player);
    if (this.nova) return this.runNova(dt, player);
    const d = this.position.distanceTo(player.pos);
    if (this.specialT <= 0 && !this.brain.attacking) {
      this.specialT = AGE_STATS[this.def.age].special * (0.8 + Math.random() * 0.5);
      const age = this.def.age;
      const pick = Math.random();
      if (age <= 1 && pick < 0.3) this.step(player);
      else if (age <= 2 && pick < 0.55 && this.shades.length < 3) this.callShades(player);
      else if (age <= 3 && d < 6 && pick < 0.8) this.startNova();
      else if (age <= 4 && d > 4) this.startSurge(player);
    }
    super.update(dt, player);
  }

  /** A burst of speed that closes the gap and cuts as it arrives. */
  private startSurge(player: Player) {
    const to = player.pos.clone().sub(this.position).setY(0);
    const len = to.length();
    to.normalize().multiplyScalar(Math.max(0, len - 1.4)).add(this.position);
    this.surge = { t: 0, from: this.position.clone(), to, hit: false };
    combat.windup(this, 0.45, this.def.age <= 2 ? 'unblockable' : 'heavy');
    this.play('sword_idle');
  }
  private runSurge(dt: number, player: Player) {
    const s = this.surge!;
    s.t += dt;
    this.built?.mixer.update(dt);
    this.yaw = Math.atan2(player.pos.x - this.position.x, player.pos.z - this.position.z);
    if (s.t > 0.45) {
      const k = Math.min(1, (s.t - 0.45) / 0.18);
      const want = s.from.clone().lerp(s.to, k);
      want.y = heightAt(want.x, want.z);
      this.carry(want.x - this.position.x, want.y - this.position.y, want.z - this.position.z);
      this.play('sword_attack', true);
      if (Math.random() < 0.6) this.hooks.fx.add.spawn({ pos: this.center.clone(), spread: 0.5, count: 4, life: [0.2, 0.5], size: [0.18, 0.04], color: 0x6a3a8a, color2: 0x0a0010 });
      if (k >= 1 && !s.hit) {
        s.hit = true;
        if (player.pos.distanceTo(this.position) < 2.6) {
          player.receiveAttack({ damage: this.hitDamage * 1.4, from: this.position.clone(), parryable: this.def.age > 2, poise: 60, kind: this.def.age <= 2 ? 'unblockable' : 'heavy', attacker: this });
        }
      }
    }
    if (s.t > 0.9) this.surge = null;
    this.sync();
  }

  /** The Dark bursts out of them: get clear or be thrown. */
  private startNova() {
    this.nova = { t: 0 };
    combat.windup(this, 0.9, 'unblockable');
    this.play('crouch', true);
    this.hooks.say(this.def.name, this.def.age <= 2 ? '' : '');
  }
  private runNova(dt: number, player: Player) {
    const n = this.nova!;
    n.t += dt;
    this.built?.mixer.update(dt);
    if (n.t < 0.9 && Math.random() < 0.7) this.hooks.fx.add.spawn({ pos: this.center.clone(), spread: 2.6, count: 3, life: [0.3, 0.6], size: [0.2, 0.05], color: 0x8a4aaa, color2: 0x10001a, gravity: -2 });
    if (n.t >= 0.9 && n.t - dt < 0.9) {
      const r = this.def.age <= 2 ? 7 : 5;
      this.hooks.fx.add.spawn({ pos: this.position.clone().setY(this.position.y + 0.3), spread: r, count: 80, life: [0.3, 0.8], size: [0.3, 0.05], color: 0xa060ff, color2: 0x200030, upBias: 0.4, drag: 2 });
      this.hooks.shake(0.35);
      const d = player.pos.distanceTo(this.position);
      if (d < r) player.receiveAttack({ damage: this.hitDamage * 1.6, from: this.position.clone(), parryable: false, poise: 120, kind: 'unblockable', knock: 9, attacker: this });
    }
    if (n.t > 1.4) this.nova = null;
    this.sync();
  }

  /** Shades of the Dark, called up out of the ground. */
  private callShades(player: Player) {
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      const p = player.pos.clone().add(new THREE.Vector3(Math.cos(a) * 5, 0, Math.sin(a) * 5));
      p.y = heightAt(p.x, p.z);
      const u = new Undead('skeleton', p, a, this.hooks.scene, this.hooks.fx);
      this.shades.push(u);
      this.hooks.enemies.push(u);
    }
    this.hooks.fx.add.spawn({ pos: player.pos.clone(), spread: 5, count: 50, life: [0.4, 1], size: [0.25, 0.05], color: 0x5a2a7a, color2: 0x000000, upBias: 1 });
  }

  /** A First Age champion steps through the air and is simply behind you. */
  private step(player: Player) {
    const back = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw)).multiplyScalar(1.8);
    const to = player.pos.clone().add(back);
    to.y = heightAt(to.x, to.z);
    this.hooks.fx.add.spawn({ pos: this.center.clone(), spread: 0.8, count: 40, life: [0.3, 0.7], size: [0.25, 0.05], color: 0x200010, color2: 0x000000 });
    this.carry(to.x - this.position.x, to.y - this.position.y, to.z - this.position.z);
    this.hooks.fx.add.spawn({ pos: this.center.clone(), spread: 0.8, count: 40, life: [0.3, 0.7], size: [0.25, 0.05], color: 0x200010, color2: 0x000000 });
    this.yaw = Math.atan2(player.pos.x - to.x, player.pos.z - to.z);
    this.hooks.shake(0.25);
    this.sync();
  }

  dispose() {
    for (const s of this.shades) s.dispose();
    this.shades = [];
    super.dispose();
  }
}
