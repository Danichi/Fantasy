import type { DisciplineId } from '../progression/combatProgression';

/** Runtime resources for the three sword disciplines. No renderer dependency. */
export class CombatDisciplineRuntime {
  discipline: DisciplineId = 'gale';

  momentum = 0;
  focus = 0;
  boundaryActive = false;
  boundaryRadius = 3;
  openings = 0;

  private chainTimer = 0;
  private chainWindow = 0.72;
  private decayTimer = 0;
  private lastAttackStarted = -999;
  private lastAttackHit = -999;

  tick(dt: number, moving: boolean, hit: boolean) {
    if (this.momentum > 0) {
      this.decayTimer += dt;
      if (this.decayTimer > 1.15 && this.chainTimer <= 0) {
        this.momentum = Math.max(0, this.momentum - dt * 1.6);
      }
    }
    this.chainTimer = Math.max(0, this.chainTimer - dt);

    if (this.boundaryActive) {
      if (moving || hit) this.breakBoundary(hit);
      else {
        this.focus = Math.min(100, this.focus + dt * 24 - Math.max(0, this.boundaryRadius - 3) * dt * 3);
        if (this.focus <= 0) { this.focus = 0; this.breakBoundary(false); }
        else this.boundaryRadius = this.radiusForFocus();
      }
    }
  }

  startAttack(now: number) {
    this.lastAttackStarted = now;
  }

  onAttackHit(now: number) {
    const gap = now - this.lastAttackHit;
    const chain = now - this.lastAttackStarted;
    const fast = gap >= 0 && gap <= 0.34;
    const perfect = gap >= 0 && gap <= 0.19 && chain <= 0.23;
    this.momentum = Math.min(6, this.momentum + (perfect ? 3 : fast ? 2 : 1));
    this.chainWindow = perfect ? 0.34 : fast ? 0.52 : 0.72;
    this.chainTimer = this.chainWindow;
    this.decayTimer = 0;
    this.lastAttackHit = now;
    return { perfect, fast };
  }

  onParry(perfect = false) {
    this.openings = Math.min(3, this.openings + (perfect ? 2 : 1));
  }

  spendOpening(cost: number) {
    if (this.openings < cost) return false;
    this.openings -= cost;
    return true;
  }

  activateBoundary() {
    this.boundaryActive = true;
    this.focus = Math.max(0, this.focus - 2);
    this.boundaryRadius = Math.max(3, this.radiusForFocus());
    return true;
  }

  breakBoundary(hit = false) {
    this.boundaryActive = false;
    this.focus = hit ? Math.max(0, this.focus - 35) : Math.max(0, this.focus - 12);
    this.boundaryRadius = 3;
  }

  canIntercept(fromX: number, fromZ: number, px: number, pz: number, parryable: boolean) {
    if (!this.boundaryActive || !parryable) return false;
    const d = Math.hypot(fromX - px, fromZ - pz);
    return d <= this.boundaryRadius;
  }

  get speedMultiplier() {
    return 1 + this.momentum * 0.055;
  }

  get damageMultiplier() {
    return 1 + this.momentum * 0.08;
  }

  get openingDamageMultiplier() {
    return 1 + this.openings * 0.12;
  }

  private radiusForFocus() {
    if (this.focus < 18) return 3;
    if (this.focus < 38) return 4;
    if (this.focus < 60) return 5;
    if (this.focus < 82) return 6;
    return 8;
  }

  toJSON() {
    return {
      momentum: this.momentum,
      focus: this.focus,
      boundaryActive: false,
      boundaryRadius: 3,
      openings: this.openings,
    };
  }

  fromJSON(data: any) {
    if (!data) return;
    this.momentum = Math.max(0, Math.min(6, data.momentum ?? 0));
    this.focus = Math.max(0, Math.min(100, data.focus ?? 0));
    this.openings = Math.max(0, Math.min(3, data.openings ?? 0));
  }
}
