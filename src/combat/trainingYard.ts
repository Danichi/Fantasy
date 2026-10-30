import * as THREE from 'three';
import { events } from '../core/events';
import { heightAt } from '../world/terrain';
import { Bandit, type Bolts } from '../enemies/bandit';
import { UAL_MOVES } from './ai';
import type { Player } from '../player/player';
import type { Look } from '../npc/charBuilder';
import type { Target } from './targets';

// Kaela Voss's drill yard (combat rework, phase 6): a drill for each part of
// the new fighting. Some are against the straw dummies on the plaza, the rest
// against a sparring partner who only throws the attacks the drill is about.
// Nobody dies: the partner yields, and Kaela calls the bout before you fall.

type Opt = { label: string; run: () => void };
type Show = (text: string, opts: Opt[]) => void;

interface Drill {
  id: string;
  name: string;
  /** what Kaela says when she sets it */
  brief: string;
  /** the partner's moves (UAL_MOVES ids), or a dummy drill */
  partner?: string[];
  /** a softer posture so a break comes in reach */
  postureMax?: number;
  /** how many of the goal */
  need: number;
  goal: string;
  xp: number;
}

export const DRILLS: Drill[] = [
  {
    id: 'tells', name: 'Read the tells', need: 6, goal: 'attacks weathered unhurt', xp: 60, partner: ['cut', 'cleave', 'whirl'],
    brief: 'Watch the light before the blow. A white glint: parry it or block it. Gold: a heavy blow, it will cost your guard dear. Red: no shield in the world stops it, so get out of the way. Six in a row without a scratch.',
  },
  {
    id: 'parry', name: 'Perfect parries', need: 3, goal: 'perfect parries', xp: 70, partner: ['cut', 'flurry'],
    brief: 'Parry (F) at the very last instant and the blow rings off your steel and leaves them wide open. Parry early and you only deflect it. Three perfect ones.',
  },
  {
    id: 'dodge', name: 'Perfect dodges', need: 2, goal: 'perfect dodges, each followed by a counter', xp: 70, partner: ['lunge', 'delayed', 'cleave'],
    brief: 'Roll (Space) the moment it swings, not before. Time slows for you, and the next blow you land is a counter. Twice: dodge, then hit back while the window is open.',
  },
  {
    id: 'posture', name: 'Break their guard', need: 1, goal: 'finisher', xp: 90, partner: ['cut', 'flurry'], postureMax: 70,
    brief: 'Every blow they eat or turn aside wears their posture down: the bar under their health. Parries, shoves and heavy blows wear it fastest. When it breaks they reel. Get in close and strike: a finisher.',
  },
  {
    id: 'strings', name: 'Strings and branches', need: 3, goal: 'different branch blows on the dummy', xp: 60,
    brief: 'Tap for the next cut. Hold the button into the second, third or fourth blow and it branches: a rising thrust, a whirling cut, a crushing overhead. Locked on, push toward, away or across your target as you strike for a lunge, a retreating cut or a sweep. Show me three different ones on the dummy.',
  },
  {
    id: 'charge', name: 'Charge on the beat', need: 1, goal: 'perfect charged blow', xp: 50,
    brief: 'Hold a heavy and it charges: three steps, you will hear them. Let go just as it fills, not after, and it lands on the beat, harder than anything. On the dummy.',
  },
  {
    id: 'shove', name: 'Shove and follow', need: 2, goal: 'shoves followed by a blow', xp: 50, partner: ['cut'],
    brief: 'A raised guard is a door. Kick it in (G; with a shield up, it is a shield bash), then cut while they stagger. Twice.',
  },
];

/** The basics: Kaela's first lesson, one step at a time, each moving on by itself. */
interface Step {
  id: 'cut' | 'string' | 'heavy' | 'lock' | 'block' | 'parry' | 'dodge' | 'kick' | 'finish';
  say: string;
  need: number;
  goal: string;
  /** a sparring partner, and the only attacks she throws in this step */
  partner?: string[];
  postureMax?: number;
}

export const BASICS: Step[] = [
  { id: 'cut', need: 3, goal: 'cuts on the dummy', say: 'Left click: a cut. Go to the straw dummy and hit it three times. Watch the blade land, not your feet.' },
  { id: 'string', need: 2, goal: 'strings of three cuts', say: 'Click again just as each cut lands, not before, and the blows run together into a string. Two strings of three on the dummy.' },
  { id: 'heavy', need: 2, goal: 'heavy blows on the dummy', say: 'Hold left click instead of tapping it: you wind up a heavy blow. Let go to swing. Slow, but it breaks a guard. Two on the dummy.' },
  { id: 'lock', need: 1, goal: 'locked on', partner: ['cut'], say: 'Now someone who hits back. Press Q (or the middle mouse button) to lock on to her. Locked on, you circle her instead of wandering off.' },
  { id: 'block', need: 2, goal: 'blows blocked', partner: ['cut'], say: 'Hold right click to raise your guard, shield or blade. Take two of her cuts on it. Blocking costs stamina: the green bar. When it runs out, your guard breaks.' },
  { id: 'parry', need: 1, goal: 'parry', partner: ['cut'], say: 'Better than a block: a parry. Press F just as her blade arrives. Too early and you only knock it aside. Turn one blow.' },
  { id: 'dodge', need: 2, goal: 'attacks dodged', partner: ['lunge', 'cleave'], say: 'Some blows can\'t be stopped. A red glint means get out of the way. Space rolls you clear (with no direction held, you hop back). Dodge two of her attacks.' },
  { id: 'kick', need: 1, goal: 'kick, then a cut', partner: ['cut'], say: 'When someone hides behind their guard, kick it in: G. Then cut while they stagger.' },
  { id: 'finish', need: 1, goal: 'finisher', partner: ['cut', 'flurry'], postureMax: 70, say: 'Everything you land, block or parry wears down her posture: the bar under her health. When it breaks she reels. Get close and strike for a finisher.' },
];
const BASICS_DRILL: Drill = { id: 'basics', name: 'The basics', brief: '', need: BASICS.length, goal: 'lessons', xp: 120 };

const PARTNER_LOOK: Look = { body: 'female', outfit: 'ranger', hair: 'buzzedfemale', hairColor: 0x3a2618, skin: 0xe0b894, cloth: 0x3a4a6a, height: 1.74 };

export class TrainingYard {
  active: Drill | null = null;
  private partner: Bandit | null = null;
  private count = 0;
  private flags: Record<string, unknown>;
  /** drill bookkeeping: the last blow types and windows */
  private lastPerfectDodge = -9;
  private lastShove = -9;
  private lastPerfectCharge = -9;
  private streak = 0;
  private branchesSeen = new Set<string>();
  private time = 0;
  private ring = new THREE.Vector3();
  /** the basics: which step, and the coach panel that says what to do */
  private step = -1;
  private stepCount = 0;
  private lastHit = -9;
  private chain = 0;
  private lastTell = -9;
  private wasDodging = false;
  private coach: HTMLDivElement | null = null;
  /** close the conversation when a lesson starts (main.ts) */
  close?: () => void;

  constructor(
    private scene: THREE.Scene,
    private bolts: Bolts,
    private player: Player,
    private kaelaAt: THREE.Vector3,
    flags: Record<string, unknown>,
    private notify: (msg: string) => void,
    private award: (xp: number) => void,
  ) {
    this.flags = flags;
    const on = events.on.bind(events);
    on('perfectParry', () => this.active?.id === 'parry' && this.progress());
    on('perfectDodge', () => (this.lastPerfectDodge = this.time));
    on('meleeHit', ({ target, action }) => {
      const d = this.active;
      if (!d) return;
      const mine = (t: Target) => t === this.partner || t.kind === 'dummy';
      if (!mine(target)) return;
      if (d.id === 'dodge' && this.time - this.lastPerfectDodge < 1.2) {
        this.lastPerfectDodge = -9;
        this.progress();
      }
      if (d.id === 'strings' && ['link1', 'link2', 'link3', 'thrust', 'retreatCut', 'sideSweep', 'delay2'].includes(action) && !this.branchesSeen.has(action)) {
        this.branchesSeen.add(action);
        this.progress();
      }
      if (d.id === 'shove') {
        if (action === 'barge' || action === 'shieldBash') this.lastShove = this.time;
        else if (this.time - this.lastShove < 1.6) {
          this.lastShove = -9;
          this.progress();
        }
      }
    });
    // ---- the basics ----
    on('meleeHit', ({ target, action }) => {
      const st = this.cur();
      if (!st || !(target === this.partner || target.kind === 'dummy')) return;
      if (st.id === 'cut' && target.kind === 'dummy') this.stepProgress();
      if (st.id === 'string' && target.kind === 'dummy') {
        this.chain = this.time - this.lastHit < 1.3 ? this.chain + 1 : 1;
        this.lastHit = this.time;
        if (this.chain >= 3) {
          this.chain = 0;
          this.stepProgress();
        }
      }
      if (st.id === 'kick') {
        if (action === 'barge' || action === 'shieldBash') this.lastShove = this.time;
        else if (this.time - this.lastShove < 1.6) {
          this.lastShove = -9;
          this.stepProgress();
        }
      }
    });
    on('strike', ({ target, heavy }) => this.cur()?.id === 'heavy' && heavy && target.kind === 'dummy' && this.stepProgress());
    on('blockImpact', () => this.cur()?.id === 'block' && this.stepProgress());
    on('parrySuccess', () => this.cur()?.id === 'parry' && this.stepProgress());
    on('finisher', ({ target }) => this.cur()?.id === 'finish' && target === this.partner && this.stepProgress());
    on('telegraph', ({ target }) => target === this.partner && (this.lastTell = this.time));
    on('chargeTier', ({ perfect }) => perfect && this.active?.id === 'charge' && (this.lastPerfectCharge = this.time));
    on('strike', ({ target, heavy }) => {
      // A perfect charge that lands on the dummy.
      if (this.active?.id === 'charge' && target.kind === 'dummy' && heavy && this.time - this.lastPerfectCharge < 2) {
        this.lastPerfectCharge = -9;
        this.progress();
      }
    });
    on('finisher', ({ target }) => this.active?.id === 'posture' && target === this.partner && this.progress());
    on('telegraph', ({ target }) => {
      if (this.active?.id !== 'tells' || target !== this.partner) return;
      // The blow before this one went by without hurting you.
      this.streak++;
      if (this.streak > this.count + 1) this.progress();
    });
    on('playerDamaged', ({ amount }) => {
      if (this.active?.id === 'tells' && amount > 0) {
        if (this.count > 0) this.notify('Hit. Start the count again.');
        this.count = 0;
        this.streak = 0;
      }
    });
  }

  /** Kaela's drill menu. */
  menu(show: Show, back: () => void) {
    if (this.active) {
      show(`We are in the middle of "${this.active.name}". ${this.count}/${this.active.need} ${this.active.goal}. Want to stop?`, [
        { label: 'Stop the drill.', run: () => (this.stop('Drill stopped.'), back()) },
        { label: 'Carry on.', run: back },
      ]);
      return;
    }
    const basics = { label: `${this.flags.drill_basics ? '✓ ' : ''}The basics (start here)`, run: () => (this.close?.(), this.startBasics()) };
    if (!this.flags.drill_basics) {
      show('You hold that blade like a farmer holds a snake. Out there, that gets you killed by the second night. The basics first. I\'ll talk you through it step by step.', [
        { label: 'Teach me.', run: basics.run },
        { label: 'Not now.', run: back },
      ]);
      return;
    }
    show('Pick your lesson. Each one is a thing that will keep you alive one more night.', [
      basics,
      ...DRILLS.map((d) => ({
        label: `${this.flags['drill_' + d.id] ? '✓ ' : ''}${d.name}`,
        run: () => show(d.brief, [
          { label: 'Ready.', run: () => (this.close?.(), this.start(d)) },
          { label: 'Another time.', run: back },
        ]),
      })),
      { label: 'Back.', run: back },
    ]);
  }

  start(d: Drill) {
    this.stop();
    this.active = d;
    this.count = 0;
    this.streak = 0;
    this.branchesSeen.clear();
    this.lastPerfectDodge = this.lastShove = -9;
    // The ring: open ground a few steps in front of Kaela.
    this.placeRing();
    if (d.partner) this.spar(d.partner, d.postureMax);
    this.player.hp = this.player.maxHp;
    this.player.stamina = this.player.maxStamina;
    this.player.damageFloor = this.player.maxHp * 0.2;
    this.notify(`Drill: ${d.name} · 0/${d.need} ${d.goal}`);
  }

  private placeRing() {
    const k = this.kaelaAt;
    const toward = new THREE.Vector3(-k.x, 0, -4 - k.z).normalize();
    this.ring.set(k.x + toward.x * 7, 0, k.z + toward.z * 7);
    this.ring.y = heightAt(this.ring.x, this.ring.z);
  }

  /** A sparring partner who only throws `moves` (a new one stands in if the moves change). */
  private spar(moves: string[], postureMax?: number) {
    const fresh = !this.partner;
    if (!fresh) this.partner!.dispose();
    const at = this.ring.clone().add(new THREE.Vector3(0, 0.05, -2.5));
    const b = new Bandit('sword', at, this.scene, this.bolts, this.ring.clone(), PARTNER_LOOK);
    b.name = 'Sparring partner';
    b.kind = 'duelist';
    b.alerted = true;
    b.nonLethal = true;
    b.hitDamage = 7;
    b.pace = 1.25;
    b.maxHp = b.hp = 600;
    if (postureMax) b.postureMax = postureMax;
    b.brain.setMoves(UAL_MOVES.filter((m) => moves.includes(m.id)).map((m) => ({ ...m, cooldown: 0, next: m.next?.filter((n) => moves.includes(n)) })));
    this.partner = b;
    if (fresh) {
      this.player.teleport(this.ring.clone().add(new THREE.Vector3(0, 0.05, 2.5)));
      this.player.yaw = Math.PI;
    }
  }

  // ---- the basics ------------------------------------------------------------------------
  private cur() {
    return this.active === BASICS_DRILL && this.step >= 0 ? BASICS[this.step] : null;
  }

  startBasics() {
    this.stop();
    this.active = BASICS_DRILL;
    this.placeRing();
    this.player.hp = this.player.maxHp;
    this.player.stamina = this.player.maxStamina;
    this.player.damageFloor = this.player.maxHp * 0.2;
    this.goStep(0);
  }

  private goStep(i: number) {
    this.step = i;
    this.stepCount = 0;
    this.chain = 0;
    this.lastShove = -9;
    const st = BASICS[i];
    if (st.partner) this.spar(st.partner, st.postureMax);
    this.showCoach();
  }

  private stepProgress() {
    const st = this.cur();
    if (!st) return;
    this.stepCount++;
    if (this.stepCount < st.need) return this.showCoach();
    if (this.step + 1 < BASICS.length) {
      this.notify('Good.');
      return this.goStep(this.step + 1);
    }
    this.complete(BASICS_DRILL);
    this.showCoach('That\'s enough to keep you alive one more night. Maybe. Come back when you want to get sharper: the drills will be here.');
    const el = this.coach;
    setTimeout(() => el === this.coach && this.hideCoach(), 7000);
  }

  /** Kaela's voice in the corner: what to do now, and how far along you are. */
  private showCoach(final?: string) {
    if (!this.coach) {
      const el = document.createElement('div');
      el.className = 'yard-coach';
      el.style.cssText = 'position:absolute;left:50%;top:14vh;transform:translateX(-50%);width:min(560px,calc(100vw - 32px));padding:12px 18px;background:rgba(14,12,10,.78);border:1px solid rgba(232,200,140,.35);border-radius:8px;color:#f3ead8;font:15px/1.45 Georgia,serif;pointer-events:none;z-index:20;text-align:left;box-shadow:0 6px 24px rgba(0,0,0,.4)';
      document.getElementById('ui')?.appendChild(el);
      this.coach = el;
    }
    const st = BASICS[this.step];
    const head = final ? 'Kaela Voss' : `Kaela Voss · the basics ${this.step + 1}/${BASICS.length}`;
    const body = final ?? st.say;
    const goal = final ? '' : `<div style="margin-top:6px;color:#e8c47a;font:600 13px system-ui,sans-serif;letter-spacing:.04em">${this.stepCount}/${st.need} ${st.goal}</div>`;
    this.coach.innerHTML = `<div style="color:#e8c47a;font:600 12px system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px">${head}</div>${body}${goal}`;
  }

  private hideCoach() {
    this.coach?.remove();
    this.coach = null;
  }

  /** where the basics are (tests) */
  get basicsStep() {
    return this.cur()?.id ?? null;
  }

  private progress() {
    const d = this.active;
    if (!d) return;
    this.count++;
    if (this.count >= d.need) return this.complete(d);
    this.notify(`${d.name} · ${this.count}/${d.need} ${d.goal}`);
  }

  private complete(d: Drill) {
    const first = !this.flags['drill_' + d.id];
    this.flags['drill_' + d.id] = true;
    if (first) this.award(d.xp);
    this.stop(first ? `Drill passed: ${d.name} · +${d.xp} XP` : `Drill passed: ${d.name}`);
  }

  stop(msg?: string) {
    if (this.partner) {
      const p = this.partner;
      setTimeout(() => p.dispose(), 600);
    }
    this.partner = null;
    if (this.active) this.player.damageFloor = 0;
    if (this.active === BASICS_DRILL && this.step >= 0 && !msg?.startsWith('Drill passed')) this.hideCoach();
    this.active = null;
    this.step = -1;
    if (msg) this.notify(msg);
  }

  update(dt: number) {
    this.time += dt;
    const d = this.active;
    if (!d) return;
    const st = this.cur();
    if (st?.id === 'lock' && this.partner && this.player.lock === this.partner) this.stepProgress();
    if (st?.id === 'dodge') {
      const dodging = this.player.act?.def.id === 'roll' || this.player.act?.def.id === 'backstep';
      if (dodging && !this.wasDodging && this.time - this.lastTell < 1.4) this.stepProgress();
      this.wasDodging = dodging;
    }
    const p = this.partner;
    if (p) {
      if (!p.alive || p.hp < p.maxHp * 0.1) p.hp = p.maxHp; // the partner never yields mid-drill
      p.update(dt, this.player);
      if (this.player.pos.distanceTo(this.ring) > 16) this.stop('You left the yard. Drill stopped.');
    } else if (this.player.pos.distanceTo(this.kaelaAt) > 45) this.stop('You left the yard. Drill stopped.');
    if (this.player.hp <= this.player.maxHp * 0.22) {
      this.player.hp = this.player.maxHp;
      this.notify('Kaela calls it: back on your feet. Again.');
      this.count = 0;
      this.streak = 0;
    }
  }
}
