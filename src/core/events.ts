// Tiny typed event bus. Gameplay systems emit, UI/audio/VFX listen.
import type { Vector3 } from 'three';

export interface GameEvents {
  playerDamaged: { amount: number; blocked: boolean };
  playerDied: {};
  playerRespawned: {};
  parrySuccess: { at: Vector3 };
  blockImpact: { at: Vector3; guardBroken: boolean };
  enemyHit: { at: Vector3; amount: number; crit: boolean; enemyId: number };
  /** the player's blade connected (after enemyHit) */
  meleeHit: { target: import('../combat/targets').Target; amount: number; crit: boolean; action: string };
  enemyDied: { at: Vector3; enemyId: number; kind: string };
  swing: { heavy: boolean };
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
