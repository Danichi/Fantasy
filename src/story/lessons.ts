import * as THREE from 'three';
import { events, type GameEvents } from '../core/events';
import { DISC, type DisciplineDef } from '../paths/data';
import type { Player } from '../player/player';
import type { DialogueUI } from '../ui/dialogue';
import type { SceneApi } from './scene';
import type { Target } from '../combat/targets';

// Lessons: when a mentor teaches you a class or a calling, you don't just get
// a toast and a skill tree. The world stops for a moment (a short scene: just
// you and them), and then they walk you through it one step at a time. Each
// step is a few words (paged, like any conversation) and one thing to do,
// shown in the lesson panel until you've done it: roll through her blade,
// put two herbs in the pot, sew a pair of bracers. The tree opens at the end.

export interface LessonHost {
  player: Player;
  dialogue: DialogueUI;
  /** play a scene (the story director) */
  scene(name: string, script: (s: SceneApi) => Promise<void>): Promise<void>;
  toast(m: string): void;
  give(id: string, n: number): void;
  count(id: string): number;
  /** a mentor's name, title and where they stand */
  mentor(npc: string): { name: string; title: string; pos: THREE.Vector3 | null };
  teach(id: string): void;
  learned(id: string): boolean;
  skillsOpen(): boolean;
  openSkills(disc: string): void;
  invOpen(): boolean;
  craftOpen(station: string): boolean;
  openCraft(station: string, where: string): void;
  brewOpen(): boolean;
  openBrew(where: string): void;
  /** go to the drill yard's ring (fighting lessons) */
  toYard(): void;
  /** the drill yard's sparring partner (null sends her away) */
  spar(moves: string[] | null, postureMax?: number): void;
  partner(): Target | null;
  /** Boundary Style's ring is up */
  boundaryUp(): boolean;
  flags: Record<string, unknown>;
  save(): void;
  /** a scene is playing (a lesson waits for it) */
  busy(): boolean;
  /** a window is open (bag, skills, a station): the panel moves to the corner */
  menuOpen(): boolean;
}

/** What the lesson has seen so far (steps count from it). */
interface Seen {
  time: number;
  rolls: number;
  lastDodge: number;
  beats: number;
  lastHand: string;
}

interface Step {
  /** what they say first (paged) */
  say: string;
  /** what you answer when you're ready to try */
  reply?: string;
  /** the goal in the lesson panel */
  task?: string;
  /** keys, shown under the goal */
  keys?: string;
  /** how many times (default 1) */
  need?: number;
  /** handed to you when the step starts */
  give?: [string, number][];
  /** the sparring partner, throwing only these (undefined: as she was; []: gone) */
  partner?: string[];
  postureMax?: number;
  /** run when the step starts (open a station) */
  start?: (h: LessonHost) => void;
  /** an event that counts toward the step */
  on?: [keyof GameEvents, ((e: any, seen: Seen, h: LessonHost) => boolean)?];
  /** or a condition that finishes it */
  check?: (h: LessonHost, seen: Seen) => boolean;
  /** how far along a counted condition is (for the panel) */
  count?: (seen: Seen) => number;
  /** what they say when you've done it */
  praise?: string;
}

interface Lesson {
  /** the first words, in the scene */
  intro: string;
  /** where it happens: by the mentor (default), or the drill yard (combat) */
  yard?: boolean;
  steps: Step[];
  /** the last words */
  outro: string;
}

const onDummyOrPartner = (e: { target: Target }, _s: Seen, h: LessonHost) => e.target === h.partner() || e.target.kind === 'dummy';
const skillsStep = (d: string, say: string): Step => ({
  say, reply: 'Show me.', task: `Open your Skills and look at the ${DISC[d].name} tree`, keys: 'K', check: (h) => h.skillsOpen(), praise: 'That\'s the road. Walk it at your own pace.',
});

const LESSONS: Record<string, Lesson> = {
  // ---- combat ----------------------------------------------------------------------------------
  gale: {
    yard: true,
    intro: 'Just us and the yard. Everyone else fights like a door: they stand in the way and take the blow. Gale fights like the wind through the door.',
    steps: [
      { say: 'Gale starts in the feet. Space rolls you: the way you push, or straight ahead if you push nowhere. Roll three times. Left, right, forward. Feel where you land.', reply: 'Like this?', task: 'Roll three times', keys: 'Space (+ W A S D for the direction)', need: 3, count: (s) => s.rolls, check: (_h, s) => s.rolls >= 3, praise: 'Good. Light on your feet. Now someone who swings back.' },
      { say: 'She\'ll come at you now. Don\'t block, don\'t back away. Watch for the glint, and roll through the blade at the last moment. Too early and she follows you. At the very last instant, time slows. That is Slipstream: the heart of Gale.', reply: 'Through the blade. Right.', task: 'Roll through two of her attacks', keys: 'Space, just as the blow comes', need: 2, partner: ['lunge', 'cut'], on: ['attackDodged'], praise: 'There. You felt it go past.' },
      { say: 'When a blow goes through you, you are behind her guard, and she knows it. Strike then. Not a heartbeat later. A cut right after a dodge is a counter, and counters hurt.', reply: 'Dodge, then cut.', task: 'Dodge her, then hit her straight after (twice)', keys: 'Space, then left click', need: 2, partner: ['lunge', 'cut', 'cleave'], on: ['meleeHit', (e, s, h) => onDummyOrPartner(e, s, h) && s.time - s.lastDodge < 1.3], praise: 'That is the whole style, really. The rest is practice.' },
      { say: 'Gale never stands still for long. Hold Shift to sprint and attack while you run: a lunge that closes the gap before they have set their feet.', reply: 'Let\'s see.', task: 'Land a sprinting lunge on her', keys: 'Hold Shift, then left click', partner: ['cut'], on: ['meleeHit', (e, s, h) => onDummyOrPartner(e, s, h) && /sprint/i.test(e.action)], praise: 'Like weather. Good.' },
      skillsStep('gale', 'Gale has techniques I can\'t hand you in an afternoon: Gale Step, Crescent Sweep, Cyclone. You buy them with what you earn out there, the XP. Open your Skills and find Gale. Look at what is waiting.'),
    ],
    outro: 'Move like weather. Be somewhere else when the blow lands. That\'s Gale. Ask me any time to make it your fighting class, and come back to the yard when you want to get sharper.',
  },
  cross: {
    yard: true,
    intro: 'Two blades. One rhythm. People think it\'s about hitting twice as often. It isn\'t. It\'s about never letting them find the gap between blows.',
    steps: [
      { say: 'First, two swords. Put a second blade in your off hand: open your bag and equip it there. I\'ve brought a spare, in case you came with one.', reply: 'One in each hand.', task: 'Equip a sword in each hand', keys: 'I (inventory), then equip a sword to the off hand', give: [['shortsword', 1]], check: (h) => h.player.equip.dualWield, praise: 'Now you look dangerous. Let\'s make it true.' },
      { say: 'Left click is your main hand. Right click is the other one now, not a block. Alternate them: right, left, right. Every change of hand on the beat builds Tempo. Strike the same hand twice and you lose it.', reply: 'Right, left, right.', task: 'Alternate hands on the beat, five times', keys: 'Left click, right click, in turn', need: 5, count: (s) => s.beats, check: (_h, s) => s.beats >= 5, praise: 'Hear it? That\'s the rhythm. Keep it and they never get a word in.' },
      skillsStep('cross', 'The Cross Cut and everything after it, you\'ll buy yourself with what you earn. Open your Skills and find Cross Style.'),
    ],
    outro: 'Two blades, one rhythm. Keep the beat. Ask me if you want it as your fighting class.',
  },
  boundary: {
    yard: true,
    intro: 'Most people think a shield is a wall. It\'s a door you choose when to shut. Boundary is the line you draw around yourself, and nothing crosses it.',
    steps: [
      { say: 'First the plain way. Hold right click to raise your shield and take her cuts on it. Every blow costs stamina, the green bar. Two blows.', reply: 'Shield up.', task: 'Block two of her blows', keys: 'Hold right click', need: 2, partner: ['cut'], on: ['blockImpact'], praise: 'Good. Now the better way.' },
      { say: 'Stand still. Hold F. A ring rises around you, and anything that reaches into it is turned aside. Holding it spends Focus. Move and it drops. Stand inside your line and let her try.', reply: 'Draw the line.', task: 'Raise your Boundary and turn aside two blows', keys: 'Stand still and hold F', need: 2, partner: ['cut'], on: ['parrySuccess', (_e, _s, h) => h.boundaryUp()], praise: 'Nothing crosses. That\'s the whole idea.' },
      skillsStep('boundary', 'The ring can do more: hold while you walk, leave a ward behind, punish what it stops. That is the tree. Open your Skills and find Boundary Style.'),
    ],
    outro: 'Draw a line around yourself, and let nothing cross it. Ask me any time to make Boundary your fighting class.',
  },
  // ---- callings ---------------------------------------------------------------------------------
  herbalism: {
    intro: 'Sit. No, there, by the pot. Every root in these hills is a sword, if you know how to boil it. I\'ll show you the first boil. Everything after is the same, only stranger.',
    steps: [
      { say: 'Herbs first. Here: sungrass and marigold, both healing herbs, and spring water to steep them in. And a satchel, so you can brew out on the road. Open your bag and find them under Materials.', reply: 'Let me look.', task: 'Open your bag and look at the herbs', keys: 'I, then the Materials section', give: [['sungrass', 2], ['marigold', 2], ['springWater', 2], ['herbalistSatchel', 1]], check: (h) => h.invOpen(), praise: 'Gathering is half of it. Every herb you pick out there makes you better at this, even before you brew.' },
      { say: 'Now the bench. I\'ll open my table for you. On the Brew page, pick Healing Tonic from the recipes you know: the bench fills the pot from your pouch. Water is the base. Then stir, and pour when the colour turns gold. Not before.', reply: 'Show me the table.', task: 'Brew a Healing Tonic', keys: 'Pick Healing Tonic, Light the burner and brew, then pour on gold', start: (h) => h.openBrew('Wenna\'s table'), on: ['brewMade'], praise: 'Smell that? Clean. That will close a cut before the blood dries.' },
      { say: 'You can brew anywhere with the satchel: press B on the road. The Recipes page shows what you know and where to learn the rest; the Herbs page tells you what every herb does. Taste one to learn a hidden property.', reply: 'B for the satchel.', task: 'Open your Herbalist\'s Satchel', keys: 'B', check: (h) => h.brewOpen(), praise: 'Good. Keep it on you.' },
      skillsStep('herbalism', 'Last thing. Herbalism has its own tree: stronger brews, oils for your blade, flasks that burst. Open your Skills and look at Herbalism. You grow it by picking and brewing, and with the XP you earn.'),
    ],
    outro: 'That\'s the first boil. Pick everything you see, brew what you pick, and come back when you\'ve made something I haven\'t.',
  },
  cooking: {
    intro: 'Kitchen\'s mine, but I\'ll lend it. Nobody storms a crypt on an empty stomach, and nobody who cooks for the Watch goes hungry.',
    steps: [
      { say: 'Two fish, fresh this morning. That\'s supper, if you don\'t burn it. I\'ll open the hearth for you. Pick Grilled Fish from the list: it shows what it needs and whether you have it. Then watch the pan and take it off the heat while it\'s golden. Not raw, not burnt.', reply: 'Show me the hearth.', task: 'Cook Grilled Fish', keys: 'Pick the dish, then click as it turns golden', give: [['glenPerch', 2]], start: (h) => h.openCraft('kitchen', 'Mara\'s hearth'), on: ['crafted', (e) => e.calling === 'cooking'], praise: 'Now that\'s a fish. Eat it before a fight and you\'ll feel it.' },
      { say: 'Meals are buffs. Eat one from your bag or put it on your quick items, and you\'re stronger for a while: more health, more stamina, whatever the dish is good for. Cook at any campfire or inn hearth. Better dishes come from recipes and practice.', reply: 'Eat before a fight.', task: 'Open your bag and find the fish under Usables', keys: 'I', check: (h) => h.invOpen(), praise: 'That\'s it.' },
      skillsStep('cooking', 'Cooking has a tree like any trade: bigger meals, longer buffs, rations for the road. Open your Skills and find Cooking.'),
    ],
    outro: 'That\'s cooking. Feed yourself, feed the Watch, and come back when you want the good recipes.',
  },
  tailoring: {
    intro: 'Sit by the loom. A good cloak has saved more lives than a good sword. I\'ll show you how it starts: a raw hide and some patience.',
    steps: [
      { say: 'Here: a raw hide and some leather. First the hide. I\'ll open my loom. Every hide has to be tanned before you can sew it: pick Leather from the list and make it. The list shows what each thing needs, and what you\'re missing in red.', reply: 'Tan the hide.', task: 'Tan the raw hide into leather', keys: 'Pick Leather, then Make', give: [['rawHide', 1], ['leather', 2]], start: (h) => h.openCraft('loom', 'Vela\'s loom'), on: ['crafted', (e) => e.item === 'leather'], praise: 'Good. Now it\'s worth something.' },
      { say: 'Now sew. Leather Bracers: two leather. Light armour you sew yourself is light on your back and quick in a roll, and the better you get, the finer it comes off the loom.', reply: 'Bracers.', task: 'Sew a pair of Leather Bracers', keys: 'Pick Leather Bracers, then Make', start: (h) => { if (!h.craftOpen('loom')) h.openCraft('loom', 'Vela\'s loom'); }, on: ['crafted', (e) => e.calling === 'tailoring'], praise: 'Neat stitches. Wear them.' },
      skillsStep('tailoring', 'Cloth, cloaks, bags that carry more, armour that bends: that\'s the Tailoring tree. Open your Skills and find it. Every piece you sew teaches you a little.'),
    ],
    outro: 'That\'s the trade. Tan what you skin, weave what you shear, and come back for the patterns when you\'re ready.',
  },
  smithing: {
    intro: 'Stand there. No, there, where the sparks won\'t find your eyes. Good steel remembers the hammer. Let\'s make some.',
    steps: [
      { say: 'Two bars of iron and a strip of leather for the grip. That\'s a shortsword. I\'ll open the forge for you: pick the Iron Shortsword from the list, then strike when the glow crosses the gold mark. Three blows. The better the strikes, the better the blade.', reply: 'Three blows.', task: 'Forge an Iron Shortsword', keys: 'Pick the recipe, then click on the gold mark (three times)', give: [['ironIngot', 2], ['leather', 1]], start: (h) => h.openCraft('forge', 'Fröst\'s forge'), on: ['crafted', (e) => e.calling === 'smithing'], praise: 'Hm. It\'ll hold an edge. Don\'t tell anyone I said so.' },
      { say: 'The forge does more than make. Salvage breaks old gear back into some of what it was made from, and Temper makes a blade you already carry better. You\'ll find both on the forge\'s pages.', reply: 'Make, salvage, temper.', task: 'Look over the forge\'s pages, then close it', keys: 'Esc to close', check: (h) => !h.craftOpen('forge'), praise: 'Good.' },
      skillsStep('smithing', 'Better metals, sharper edges, mending in the field: the Smithing tree. Open your Skills and find it.'),
    ],
    outro: 'That\'s smithing. Bring me ore, and I\'ll show you the rest when you\'ve earned it.',
  },
};

/** A spoken lesson for the disciplines without a hands-on one. */
function spoken(d: DisciplineDef): Lesson {
  return {
    intro: `${d.flavour} Sit a moment. I'll tell you how it works, and then it's yours to grow.`,
    steps: [
      { say: `${d.how} That's the heart of ${d.name}. Everything else is built on it.`, reply: 'I understand.' },
      skillsStep(d.id, `${d.name} grows with the XP you bring back, and with practice. Its techniques are in your Skills: open them and look at the ${d.name} tree.`),
    ],
    outro: `That's the first lesson of ${d.name}. The rest you pay for in sweat, and in the XP you bring me.`,
  };
}

export class Lessons {
  private lesson: Lesson | null = null;
  private disc: DisciplineDef | null = null;
  private who = { name: '', title: '' };
  private step = -1;
  private got = 0;
  /** waiting for you to answer the mentor (the panel waits too) */
  private talking = false;
  private seen: Seen = { time: 0, rolls: 0, lastDodge: -9, beats: 0, lastHand: '' };
  private wasRolling = false;
  private panel: HTMLDivElement | null = null;
  private onDone: (() => void) | null = null;
  /** a lesson asked for while a conversation is still open (a trial's turn-in) */
  private pending: DisciplineDef | null = null;

  constructor(private h: LessonHost) {
    const watch = <K extends keyof GameEvents>(k: K) => events.on(k, (e: GameEvents[K]) => this.event(k, e));
    for (const k of ['attackDodged', 'meleeHit', 'blockImpact', 'parrySuccess', 'brewMade', 'crafted', 'spellCast'] as (keyof GameEvents)[]) watch(k);
    events.on('attackDodged', () => (this.seen.lastDodge = this.seen.time));
    window.addEventListener('keydown', (e) => {
      if (!this.lesson || this.talking || e.code !== 'Backspace') return;
      e.preventDefault();
      this.h.toast('Step skipped.');
      this.advance();
    });
  }

  get active() {
    return !!this.lesson;
  }
  /** which step (tests) */
  get stepIndex() {
    return this.step;
  }

  /** Is there a hands-on lesson for this (mentors offer to go over it again)? */
  has(id: string) {
    return id in LESSONS;
  }

  /** Ask for a lesson: now, or (wait) once the conversation that led to it is over. */
  request(d: DisciplineDef, wait = false) {
    if (this.lesson || this.pending) return false;
    if (wait) {
      this.pending = d;
      return true;
    }
    return this.start(d);
  }

  /** Two-blade rhythm: a change of hand on the beat (combat.ts calls it). */
  beat() {
    this.seen.beats++;
  }

  /**
   * Start the lesson for a discipline (a mentor has agreed to teach you).
   * `done` runs when it's over. Returns false when there's nothing to run.
   */
  start(d: DisciplineDef, done?: () => void) {
    if (this.lesson) return false;
    const L = LESSONS[d.id] ?? spoken(d);
    const m = this.h.mentor(d.mentorNpc ?? '');
    this.lesson = L;
    this.disc = d;
    this.who = { name: m.name, title: m.title };
    this.onDone = done ?? null;
    this.step = -1;
    this.seen = { time: 0, rolls: 0, lastDodge: -9, beats: 0, lastHand: '' };
    this.h.dialogue.close();
    // The calling works from the first step (recipes need it); the tree is the last step.
    if (!this.h.learned(d.id)) this.h.teach(d.id);
    const p = this.h.player;
    void this.h.scene('lesson:' + d.id, async (s) => {
      s.bars(true);
      await s.fade(1, 0.6);
      // Just the two of you: stand in front of them (or in the yard, for a fighting style).
      if (L.yard) this.h.toYard();
      else if (m.pos) {
        const away = p.pos.clone().sub(m.pos).setY(0);
        if (away.lengthSq() < 0.01) away.set(0, 0, 1);
        away.normalize().multiplyScalar(1.9);
        p.teleport(m.pos.clone().add(away).setY(p.pos.y));
        p.yaw = Math.atan2(-away.x, -away.z);
      }
      const at = p.pos.clone();
      const look = (m.pos ?? at).clone().lerp(at, 0.5).setY(at.y + 1.3);
      const side = new THREE.Vector3(-(look.z - at.z), 0, look.x - at.x).normalize();
      await s.cam(look.clone().addScaledVector(side, 4.2).setY(at.y + 2.1), look, 0);
      await s.fade(0, 0.8);
      await s.card('A lesson', d.name, `with ${m.name}`, 2.4);
      await s.say(m.name, L.intro, 4.5);
    }).then(() => this.next());
    return true;
  }

  /** Stop wherever it is (left the area, died); what you learned stays learned. */
  stop(msg?: string) {
    if (!this.lesson) return;
    this.h.spar(null);
    this.lesson = null;
    this.panel?.remove();
    this.panel = null;
    if (msg) this.h.toast(msg);
  }

  private next() {
    const L = this.lesson;
    if (!L) return;
    this.step++;
    this.got = 0;
    const st = L.steps[this.step];
    if (!st) return this.finish();
    // (Counted things count from the start of each step.)
    this.seen.rolls = this.seen.beats = 0;
    for (const [id, n] of st.give ?? []) this.h.give(id, n);
    if (st.partner) this.h.spar(st.partner.length ? st.partner : null, st.postureMax);
    if (!st.task) {
      // Words only: listen, then on.
      this.talking = true;
      this.h.dialogue.show(this.who.name, this.who.title, st.say, [{ label: st.reply ?? 'Go on.', run: () => { this.talking = false; this.h.dialogue.close(); this.next(); } }]);
      this.render();
      return;
    }
    this.talking = true;
    this.render();
    this.h.dialogue.show(this.who.name, this.who.title, st.say, [{
      label: st.reply ?? 'Show me.',
      run: () => {
        this.talking = false;
        this.h.dialogue.close();
        st.start?.(this.h);
        this.render();
      },
    }]);
  }

  private event(k: keyof GameEvents, e: unknown) {
    const st = this.lesson?.steps[this.step];
    if (!st || this.talking || !st.on || st.on[0] !== k) return;
    if (st.on[1] && !st.on[1](e, this.seen, this.h)) return;
    this.got++;
    if (this.got >= (st.need ?? 1)) this.advance();
    else this.render();
  }

  private advance() {
    const st = this.lesson?.steps[this.step];
    if (!st) return;
    this.got = st.need ?? 1;
    this.render(st.praise);
    this.talking = true; // (no double counting while the praise shows)
    setTimeout(() => {
      if (!this.lesson) return;
      this.talking = false;
      this.next();
    }, 1600);
  }

  private finish() {
    const d = this.disc!, L = this.lesson!;
    this.h.spar(null);
    this.panel?.remove();
    this.panel = null;
    this.talking = true;
    this.h.flags['lesson_' + d.id] = true;
    this.h.dialogue.show(this.who.name, this.who.title, L.outro, [{
      label: 'Thank you.',
      run: () => {
        this.talking = false;
        this.lesson = null;
        this.h.dialogue.close();
        this.h.toast(`Learned ${d.name} · its tree is in your Skills (K)`);
        this.h.save();
        this.onDone?.();
      },
    }]);
  }

  update(dt: number) {
    if (this.pending && !this.lesson && !this.h.dialogue.open && !this.h.busy()) {
      const d = this.pending;
      this.pending = null;
      this.start(d);
    }
    if (!this.lesson) return;
    this.seen.time += dt;
    const p = this.h.player;
    if (p.dead) return this.stop('The lesson is over for today.');
    this.panel?.classList.toggle('corner', this.h.menuOpen());
    const rolling = !!p.act?.def.roll;
    if (rolling && !this.wasRolling) this.seen.rolls++;
    this.wasRolling = rolling;
    const st = this.lesson.steps[this.step];
    if (!st || this.talking) return;
    if (st.count) {
      const n = Math.min(st.need ?? 1, st.count(this.seen));
      if (n !== this.got) {
        this.got = n;
        this.render();
      }
    }
    if (st.check?.(this.h, this.seen)) this.advance();
  }

  /** The lesson panel: whose lesson, the step, the goal and the keys. */
  private render(praise?: string) {
    const L = this.lesson, d = this.disc;
    if (!L || !d) return;
    const st = L.steps[this.step];
    if (!this.panel) {
      this.panel = document.createElement('div');
      this.panel.className = 'lesson-panel';
      document.getElementById('ui')?.appendChild(this.panel);
    }
    const n = L.steps.length;
    const need = st?.need ?? 1;
    const dots = L.steps.map((_, i) => `<i class="${i < this.step ? 'done' : i === this.step ? 'on' : ''}"></i>`).join('');
    const goal = praise
      ? `<div class="lp-praise">“${praise}”</div>`
      : st?.task
        ? `<div class="lp-task">${this.talking ? '…' : ''}${st.task}${need > 1 ? ` <b>${this.got}/${need}</b>` : ''}</div>${st.keys ? `<div class="lp-keys">${st.keys}</div>` : ''}`
        : '<div class="lp-task">Listen.</div>';
    this.panel.innerHTML = `<div class="lp-head"><span>${d.name} · ${this.who.name}</span><span class="lp-dots">${dots}</span></div>${goal}<div class="lp-skip">Step ${Math.min(this.step + 1, n)} of ${n} · Backspace skips a step</div>`;
    this.panel.classList.toggle('waiting', this.talking && !praise);
  }
}
