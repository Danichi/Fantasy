import * as THREE from 'three';
import { Bandit, type Bolts } from '../../enemies/bandit';
import type { Player } from '../../player/player';
import { events } from '../../core/events';
import { ARCHETYPES, UAL_MOVES } from '../../combat/ai';
import { AURELLE } from '../portCity';
import { heightAt } from '../terrainHeight';
import type { DialogueOption } from '../../ui/dialogue';
import type { Target } from '../../combat/targets';
export type School = 'gale' | 'boundary' | 'cross';
export class AcademyExercises {
  active: School | null = null;
  partner: Bandit | null = null;
  count = 0;
  private dodgeAt = -100;
  private clock = 0;
  private off: (() => void)[] = [];
  readonly ring = new THREE.Vector3(
    AURELLE.academyRing[0],
    0,
    AURELLE.academyRing[1],
  );
  constructor(
    private scene: THREE.Scene,
    private bolts: Bolts,
    private player: Player,
    private flags: Record<string, boolean | number | string>,
    private toast: (s: string) => void,
    private save: () => void,
    private mastered: (school: School) => void,
    private prepare: () => void,
  ) {
    this.ring.y = heightAt(this.ring.x, this.ring.z);
    this.off.push(
      events.on('perfectDodge', ({ at }) => {
        if (this.active === 'gale' && this.near(at)) this.dodgeAt = this.clock;
      }),
    );
    this.off.push(
      events.on('meleeHit', ({ target }) => {
        if (
          this.active === 'gale' &&
          target === this.partner &&
          this.clock - this.dodgeAt < 1.4
        ) {
          this.dodgeAt = -100;
          this.progress();
        }
      }),
    );
    this.off.push(
      events.on('perfectParry', ({ at }) => {
        if (this.active === 'boundary' && this.near(at)) this.progress();
      }),
    );
    this.off.push(
      events.on('guardCounter', ({ at }) => {
        if (this.active === 'cross' && this.near(at)) this.progress();
      }),
    );
    this.off.push(events.on('playerDied', () => this.stop()));
  }
  private near(at: THREE.Vector3) {
    return !!this.partner && this.partner.center.distanceTo(at) < 5;
  }
  options(
    school: School,
    show: (s: string, o: DialogueOption[]) => void,
    back: () => void,
    canStart: () => boolean,
    close: () => void,
  ): DialogueOption[] {
    const title = {
      gale: 'Gale: evade and answer',
      boundary: 'Boundary: perfect parries',
      cross: 'Cross: guard counters',
    }[school];
    const brief = {
      gale: 'Make two perfect dodges, each followed by a cut. Watch the tell, roll at the last moment, then answer while the opening lasts.',
      boundary:
        'Stand your ground and make three perfect parries. Tap F at the last moment. An early deflect is safe, but this lesson asks for precision.',
      cross:
        'Block a blow, then answer immediately with an attack. Two guard counters. You need a weapon or shield that can guard.',
    }[school];
    return [
      {
        label: title + (this.flags['pa:drill:' + school] ? ' · mastered' : ''),
        run: () =>
          show(brief, [
            {
              label: 'Begin the practical lesson.',
              run: () => {
                if (!canStart()) {
                  this.toast(
                    'Finish the current bout before starting another lesson.',
                  );
                  return;
                }
                close();
                this.start(school);
              },
            },
            { label: 'Back.', run: back },
          ]),
      },
    ];
  }
  start(school: School) {
    this.prepare();
    this.stop();
    this.active = school;
    this.count = 0;
    const b = new Bandit(
      'sword',
      this.ring.clone().add(new THREE.Vector3(0, 0.2, -4)),
      this.scene,
      this.bolts,
      this.ring.clone(),
    );
    b.name = b.label = {
      gale: 'Gale Practice Partner',
      boundary: 'Boundary Practice Partner',
      cross: 'Cross Practice Partner',
    }[school];
    b.hp = b.maxHp = 12000;
    b.hitDamage = 46;
    b.nonLethal = true;
    b.alerted = true;
    b.level = 16;
    b.postureMax = 300;
    b.poiseMax = 110;
    (b as Target).boss = false;
    Object.assign(
      b.brain.arch,
      ARCHETYPES[
        school === 'gale'
          ? 'skirmisher'
          : school === 'boundary'
            ? 'grunt'
            : 'brute'
      ],
    );
    b.brain.setMoves(
      UAL_MOVES.filter((m) =>
        school === 'gale'
          ? ['cleave', 'lunge'].includes(m.id)
          : ['cut', 'flurry'].includes(m.id),
      ),
    );
    this.partner = b;
    this.player.teleport(this.ring.clone().add(new THREE.Vector3(0, 0.3, 4)));
    this.player.hp = this.player.maxHp;
    this.player.stamina = this.player.maxStamina;
    this.player.damageFloor = this.player.maxHp * 0.15;
    this.toast(
      `${school.toUpperCase()} practical · 0/${school === 'boundary' ? 3 : 2} · Leave the ring to stop.`,
    );
  }
  private progress() {
    if (!this.active) return;
    this.count++;
    const goal = this.active === 'boundary' ? 3 : 2;
    if (this.count < goal) {
      this.toast(`${this.active.toUpperCase()} · ${this.count}/${goal}`);
      return;
    }
    const key = 'pa:drill:' + this.active;
    if (!this.flags[key]) {
      this.flags[key] = true;
      this.player.prog.addXp(450);
      this.toast('Practical mastered. +450 XP.');
    } else this.toast('Practical complete. Your instructor nods.');
    this.mastered(this.active);
    this.save();
    this.stop();
  }
  update(dt: number) {
    this.clock += dt;
    const b = this.partner;
    if (!b) return;
    if (this.player.pos.distanceTo(this.ring) > 15 || this.player.dead) {
      this.stop();
      return;
    }
    if (this.player.hp <= this.player.maxHp * 0.2) {
      this.player.hp = this.player.maxHp;
      this.count = 0;
      this.toast('The instructor calls a pause. Take a breath and try again.');
    }
    if (b.hp < b.maxHp * 0.2) b.hp = b.maxHp;
    b.update(dt, this.player);
  }
  stop() {
    if (this.partner) {
      this.partner.dispose();
      this.player.damageFloor = 0;
    }
    this.partner = null;
    this.active = null;
    this.count = 0;
  }
  dispose() {
    this.stop();
    for (const off of this.off) off();
  }
}
