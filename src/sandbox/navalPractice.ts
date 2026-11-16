import * as THREE from 'three';
import { Ship } from '../world/sea/ship';
import { STOCK_FIT } from '../world/sea/shipTypes';
import { Gunnery } from '../world/sea/gunnery';
import { Part, type BeastId, type SeaBeast, type makeBeast } from '../world/sea/seaMonsters';
import { SEA_LEVEL } from '../world/worldMap';
import type { BossContext, BossSession } from './bossRoster';
import type { Player } from '../player/player';

/** A separate, anchored naval range. Uses the real ship, beast AI, projectiles
 * and tethers; nothing is added to the adventure's fleet or voyage manager. */
export class NavalPractice {
  readonly ship: Ship;
  readonly beast: SeaBeast;
  readonly guns: Gunnery;
  readonly session: BossSession;
  readonly spawn: THREE.Vector3;
  readonly centre: THREE.Vector3;
  onDamage?: (damage: number) => void;
  private beforeShotHp = 0;
  private partHp = new Map<Part, number>();
  private stage = new THREE.Group();
  private reload = 0;
  private immune = true;
  private ai = true;
  constructor(
    private c: BossContext,
    factory: typeof makeBeast,
    id: BeastId
  ) {
    this.centre = c.at
      .clone()
      .add(new THREE.Vector3(0, 0, 1000))
      .setY(SEA_LEVEL);
    const fit = STOCK_FIT();
    fit.guns = 2;
    fit.harpoon = 2;
    this.ship = new Ship(c.scene, 'brigantine', fit, {
      name: 'Proving Grounds · training ship',
    });
    this.ship.pos.copy(this.centre);
    this.ship.place();
    this.ship.enableDeck();
    this.spawn = this.ship.toWorld(new THREE.Vector3(0, this.ship.def.deckY + 0.4, -3));
    this.guns = new Gunnery(c.scene, c.fx);
    this.beast = factory(id, c.scene, c.fx, this.centre.clone().add(new THREE.Vector3(18, 0, 0)), 2);
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600, 50, 50),
      new THREE.MeshStandardMaterial({
        color: 0x15475a,
        roughness: 0.32,
        metalness: 0.45,
      })
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.copy(this.centre).setY(SEA_LEVEL - 0.1);
    this.stage.add(sea);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(280, 24, 12),
      new THREE.MeshBasicMaterial({
        color: 0x809caf,
        side: THREE.BackSide,
        fog: false,
      })
    );
    sky.position.copy(this.centre);
    this.stage.add(sky);
    c.scene.add(this.stage);
    this.guns.onMonsterHit = (part) => {
      const healthLost = part instanceof Part ? Math.max(0, (this.partHp.get(part) ?? part.hp) - part.hp) : 0;
      const damage = Math.max(0, this.beforeShotHp - this.beast.hp) || healthLost;
      if (part instanceof Part) this.partHp.set(part, part.hp);
      this.beforeShotHp = this.beast.hp;
      if (damage > 0) this.onDamage?.(damage);
    };
    this.session = {
      phases: [],
      naval: this,
      health: () => this.beast,
      targets: () => this.beast.parts().filter((p): p is Part => p instanceof Part),
      update: (dt, p) => this.update(dt, p),
      dispose: () => this.dispose(),
    };
  }
  setAI(on: boolean) {
    this.ai = on;
  }
  setImmortal(on: boolean) {
    this.immune = on;
  }
  fire(kind: 'swivel' | 'harpoon' | 'broadside', player: Player, aim: THREE.Vector3) {
    if (this.reload > 0) return false;
    const parts = this.beast.parts().filter((p) => p.alive);
    const locked = parts.find((p) => p instanceof Part && p === player.lock);
    const focus = locked ?? parts.slice().sort((a, b) => a.pos.distanceTo(player.pos) - b.pos.distanceTo(player.pos))[0];
    const dir = focus ? focus.pos.clone().sub(player.center).normalize() : aim;
    if (kind === 'harpoon') this.guns.harpoon(this.ship, dir, true, focus, 1);
    else if (kind === 'swivel') this.guns.swivel(this.ship, dir, focus, 2);
    else {
      const at = focus?.pos ?? this.beast.pos;
      const local = this.ship.toLocal(at);
      this.guns.broadside(this.ship, local.x > 0 ? -1 : 1, at.distanceTo(this.ship.pos), at, focus?.vel, { spread: 0.2 });
    }
    this.reload = kind === 'broadside' ? 3 : kind === 'harpoon' ? 1.2 : 0.45;
    return true;
  }
  private update(dt: number, p: Player) {
    this.reload = Math.max(0, this.reload - dt);
    if (this.immune) this.ship.repairAll();
    if (this.ai)
      this.beast.update(dt, this.ship, p, {
        toast: this.c.say,
        shake: () => {},
        crewOverboard: () => {},
        crewLost: () => null,
        weak: 1,
        lore: false,
        earplugs: false,
        monster: 1,
      });
    this.beforeShotHp = this.beast.hp;
    this.partHp.clear();
    for (const part of this.beast.parts()) if (part instanceof Part) this.partHp.set(part, part.hp);
    this.guns.update(dt, [], this.beast.parts());
    // An anchored trial: tethers can restrain a beast without dragging the
    // training deck outside the range. The adventure sailing system stays idle.
    this.ship.pos.copy(this.centre);
    this.ship.place();
  }
  dispose() {
    this.guns.clear();
    this.beast.dispose();
    this.ship.dispose();
    this.stage.removeFromParent();
    this.stage.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const m = o as THREE.Mesh;
        m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((m) => m.dispose());
      }
    });
  }
}
