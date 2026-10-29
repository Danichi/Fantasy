// Tiny typed event bus. Gameplay systems emit, UI/audio/VFX listen.
import type { Vector3 } from 'three';

export interface GameEvents {
  playerDamaged: { amount: number; blocked: boolean };
  playerDied: {};
  playerRespawned: {};
  /** perfect: inside the parry's first frames (a late parry only deflects) */
  parrySuccess: { at: Vector3; perfect?: boolean };
  blockImpact: { at: Vector3; guardBroken: boolean };
  /** a blow got round a raised shield (from the side or behind) */
  guardMissed: { from: Vector3 };
  enemyHit: { at: Vector3; amount: number; crit: boolean; enemyId: number };
  /** the player's blade connected (after enemyHit) */
  meleeHit: { target: import('../combat/targets').Target; amount: number; crit: boolean; action: string };
  enemyDied: { at: Vector3; enemyId: number; kind: string; level?: number };
  /** a night raid: the horn sounded / it was beaten back or ran its course */
  raidStarted: { kind: string; front: string };
  raidEnded: { kind: string; won: boolean; lost: number };
  /** field bosses: first seen, and killed */
  bossFound: { id: string };
  bossSlain: { id: string; first: boolean };
  /** a boss says something (shown as a toast) */
  bossSpeaks: { id: string; line: string };
  /** a site (sites/): first seen within sight, and finished (looted, read, cleared, lit) */
  siteSeen: { id: string; kind: string };
  siteDone: { id: string; kind: string };
  /** a creature den (boar wallow, spider hollow, bat roost) was emptied */
  denCleared: { id: string; species: string };
  swing: { heavy: boolean };
  // ---- combat rework (combat/core.ts) ----
  /** every blow the player lands, after the target took it */
  strike: { target: import('../combat/targets').Target; at: Vector3; damage: number; crit: boolean; reason?: import('../combat/core').CritReason; react: import('../combat/core').Reaction; broke: boolean; armour: import('../combat/core').Armour; type: import('../combat/core').DmgType; heavy: boolean; typeMult: number; killed: boolean };
  /** an enemy winds up an attack: its tell (the colour says how to answer it) */
  telegraph: { target: import('../combat/targets').Target; kind: import('../combat/core').AttackKind; sec: number };
  /** an enemy's posture broke (open to a finisher), and recovered */
  postureBreak: { target: import('../combat/targets').Target; at: Vector3 };
  postureRecover: { target: import('../combat/targets').Target };
  /** the defence ladder: a parry inside the first frames, a last-moment dodge, a block answered with a counter */
  perfectParry: { at: Vector3 };
  perfectDodge: { at: Vector3 };
  guardCounter: { at: Vector3 };
  /** a finisher landed on a broken or downed enemy */
  finisher: { target: import('../combat/targets').Target; at: Vector3 };
  /** a heavy reached a charge tier (1-3), or was released on the beat */
  chargeTier: { tier: number; perfect: boolean };
  /** time briefly slows (perfect defence, finishers): scale and seconds */
  slowMo: { scale: number; sec: number };
  /** an attack the player couldn't block: unblockables, grabs */
  unblockable: { kind: import('../combat/core').AttackKind; from: Vector3 };
  spellCast: { spell: string };
  spellImpact: { at: Vector3; spell: string };
  footstep: { at: Vector3; surface: string };
  notEnough: { stat: 'stamina' | 'mana' };
  needTarget: {};
  levelUp: { level: number };
  disciplineLevel: { id: string; level: number };
  disciplineLearned: { id: string };
  pathsChanged: {};
  progressChanged: {};
  pickup: { kind: 'xp' | 'gold' };
  bossSlam: { at: Vector3 };
  equipmentChanged: {};
  originAbility: { origin: string; ability: string; };
  slimeLand: { at: Vector3; size: number };
  mapRevealed: { cells: number };
  regionEntered: { id: string; name: string; subtitle: string; first: boolean };
  placeDiscovered: { id: string; name: string; kind: string };
  questChanged: { id: string; status: 'active' | 'done' };
  /** a great deed (a named boss, a legendary beast, a first landfall...): Renown for the Legendary Hero */
  deed: { id: string; renown: number; label: string };
  /** a plant, fungus or reagent was gathered (foraging, harvesting, beast drops) */
  herbGathered: { id: string; qty: number; at: Vector3; source: 'forage' | 'drop' | 'harvest' };
  /** a herbal brew was made (herbalism crafting) */
  brewMade: { id: string; quality: number; qty: number };
}

type Handler<T> = (payload: T) => void;

class Bus {
  private map = new Map<keyof GameEvents, Set<Handler<any>>>();
  on<K extends keyof GameEvents>(k: K, h: Handler<GameEvents[K]>) {
    let s = this.map.get(k);
    if (!s) this.map.set(k, (s = new Set()));
    s.add(h);
    return () => s!.delete(h);
  }
  emit<K extends keyof GameEvents>(k: K, payload: GameEvents[K]) {
    this.map.get(k)?.forEach((h) => h(payload));
  }
}

export const events = new Bus();
