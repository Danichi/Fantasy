import * as THREE from 'three';
import { Bandit, type Bolts } from '../enemies/bandit';
import { newTargetId, targets, type HitInfo, type Target } from '../combat/targets';
import { heightAt } from '../world/terrainHeight';
import type { NpcManager } from '../npc/npcManager';
import type { Player } from '../player/player';
import type { DialogueOption, DialogueUI } from '../ui/dialogue';
import { WATCH_LOOKS } from '../raid/watchman';
import { pickLine } from './lines';
import { rollProfile, type Profile } from './profile';
import { communityOf } from './reputation';
import type { Social } from './wiring';

// Trouble (NPC overhaul, phase 3): townsfolk can be struck. A blow makes
// them cry out and run; the people who saw it scream and scatter; ordinary
// folk can be killed (story people and children are only knocked down). A
// crime someone saw puts a bounty on you, and the Watch comes: pay the fine,
// go quietly to the cells, talk or pay your way out, or fight.

/** Communities with a Watch to send after you. */
const WATCHED = new Set(['elderGlen', 'royalCapital', 'portAurelle']);
const WITNESS_R = 18;

/** A townsperson as something your blade can find. */
class PersonTarget implements Target {
  id = newTargetId();
  kind = 'person';
  alive = true;
  center = new THREE.Vector3();
  radius = 0.34;
  halfHeight = 0.75;
  position = new THREE.Vector3();
  stunned = false;
  lockable = false;
  hp: number;
  maxHp: number;
  label: string;
  /** no posture to break and no finishers on the defenceless */
  postureMax = 1e6;
  poiseMax = 1e6;
  constructor(readonly who: string, name: string, hp: number, private onHit: (t: PersonTarget, h: HitInfo) => void) {
    this.hp = this.maxHp = hp;
    this.label = name;
  }
  place(feet: THREE.Vector3) {
    this.position.copy(feet);
    this.center.set(feet.x, feet.y + 0.95, feet.z);
  }
  takeHit(h: HitInfo) {
    if (this.alive) this.onHit(this, h);
  }
}

/** A watchman sent for you: walks up and calls a halt; fights if you resist. */
class Warden extends Bandit {
  mode: 'arrest' | 'fight' | 'leave' = 'arrest';
  arrived = false;
  /** struck while trying to arrest you */
  onStruck?: () => void;
  constructor(at: THREE.Vector3, scene: THREE.Scene, bolts: Bolts, readonly community: string, look: (typeof WATCH_LOOKS)[number]) {
    super('sword', at, scene, bolts, at.clone(), look);
    this.kind = 'watchGuard';
    this.name = 'Watchman';
    this.maxHp = this.hp = 150;
    this.hitDamage = 15;
    this.lockable = false;
  }
  takeHit(h: HitInfo) {
    if (this.mode !== 'fight') {
      this.mode = 'fight';
      this.lockable = true;
      this.onStruck?.();
    }
    super.takeHit(h);
  }
  update(dt: number, player: Player) {
    if (this.mode === 'fight' || !this.alive) {
      this.alerted = true;
      return super.update(dt, player);
    }
    this.alerted = false;
    this.built?.mixer.update(dt);
    const to = player.pos.clone().sub(this.position).setY(0);
    const d = to.length();
    let speed = 0;
    if (this.mode === 'arrest') {
      this.arrived = d < 2.8;
      if (!this.arrived) speed = d > 8 ? 4.4 : 1.8;
      this.yaw = Math.atan2(to.x, to.z);
    } else {
      speed = 2.2;
      this.yaw = Math.atan2(-to.x, -to.z);
    }
    this.play(speed > 3 ? 'jog' : speed > 0 ? 'walk' : 'sword_idle');
    if (speed > 0) {
      const dx = Math.sin(this.yaw) * speed * dt, dz = Math.cos(this.yaw) * speed * dt;
      const ny = heightAt(this.position.x + dx, this.position.z + dz);
      this.carry(dx, ny - this.position.y, dz);
    }
    this.sync();
  }
}

export interface TroubleHooks {
  social: Social;
  npcs: NpcManager;
  /** Elder Glen's town NPCs (static) */
  townNpcs: () => { id: string; name: string; pos: THREE.Vector3; visible: boolean }[];
  player: Player;
  scene: THREE.Scene;
  bolts: Bolts;
  dialogue: DialogueUI;
  hour: () => number;
  /** let a night (or a few) pass in the cells */
  serve: (days: number) => void;
  toast: (m: string) => void;
  /** the settlement the player is in, if any */
  settlementAt: (p: THREE.Vector3) => string | undefined;
  /** raids and other battles: blows in town don't count against you */
  truce: () => boolean;
}

export function setupTrouble(h: TroubleHooks) {
  const { social, npcs, player } = h;
  const { rep, people, barks } = social;
  const persons = new Map<string, PersonTarget>();
  const lastHit = new Map<string, number>();
  let now = 0;
  let warden: Warden | null = null;
  let wardenLook = 0;
  /** when the next watchman sets out (-1: nobody on the way), and a lull after one gives up */
  let due = -1;
  let quietUntil = 0;
  let talked = false;
  const watchProfile = new Map<string, Profile>();
  const watchVoice = (c: string) => {
    let p = watchProfile.get(c);
    if (!p) watchProfile.set(c, (p = { ...rollProfile({ id: 'watch-' + c, name: 'Watchman', job: 'guard', settlement: c }), first: 'Watchman' }));
    return p;
  };
  const say = (c: string, cat: string) => pickLine(cat, watchVoice(c), { ...social.ctx('watch'), town: social.townName(c) });

  /** Who saw it: anyone close enough (in the open). */
  const witnesses = (at: THREE.Vector3, except: string) => {
    const out: string[] = [];
    for (const n of npcs.npcs) if (n.rec.id !== except && n.actor && !n.hidden && !npcs.troubled(n.rec.id) && n.pos.distanceTo(at) < WITNESS_R) out.push(n.rec.id);
    for (const t of h.townNpcs()) if (t.id !== except && t.visible && t.pos.distanceTo(at) < WITNESS_R) out.push(t.id);
    return out;
  };

  /** A blow landed on someone who never asked for it. */
  const struck = (t: PersonTarget, hit: HitInfo) => {
    const p = people.get(t.who);
    if (!p) return;
    const essential = people.isEssential(p.id) || p.child;
    t.hp -= hit.damage;
    const seenBy = witnesses(t.center, p.id);
    const seen = seenBy.length > 0;
    const repeat = now - (lastHit.get(p.id) ?? -99) < 30;
    lastHit.set(p.id, now);
    rep.recentlyHurt.set(p.id, now);
    const k = p.child ? 2 : 1;
    if (t.hp <= 0) {
      t.alive = false;
      targets.delete(t);
      persons.delete(p.id);
      if (essential) {
        rep.act('knockout', { who: p.id, seen, scale: k, text: seen ? `you beat ${p.first} senseless in the street` : undefined });
        npcs.react(p.id, 'down', player.pos, 25);
        barks.sayLine(p.id, 'knockedOut');
        if (!seen) rep.nudge(p.id, -40);
      } else {
        rep.act('murder', { who: p.id, seen, scale: k, text: seen ? `you killed ${p.first}` : undefined });
        rep.dead.add(p.id);
        npcs.react(p.id, 'dead', player.pos, 10);
        // The people who loved them will know, seen or not.
        for (const tie of p.ties) rep.nudge(tie.id, tie.bond === 'friend' || tie.bond === 'rival' ? (tie.bond === 'rival' ? -5 : -35) : -70);
        h.toast(`${p.name} is dead.`);
      }
    } else {
      rep.act('assault', { who: p.id, seen, scale: (repeat ? 1 : 0.4) * k, text: seen && repeat ? `you attacked ${p.first} in the street` : undefined });
      npcs.react(p.id, 'hit', player.pos, 6);
      barks.sayLine(p.id, p.traits.courage > 0.4 && !p.child ? 'hurt.brave' : 'hurt', 'hostile');
    }
    // The people who saw it scream and scatter.
    let screams = 0;
    for (const w of seenBy) {
      const wp = people.get(w);
      if (!wp) continue;
      rep.nudge(w, t.hp <= 0 ? -30 : -12);
      if (screams < 2 && Math.random() < 0.7) {
        barks.sayLine(w, 'scream', 'hostile');
        screams++;
      }
      if (!wp.guard) npcs.react(w, 'flee', player.pos, 6);
    }
    if (seen) due = due < 0 ? now + 3 : Math.min(due, now + 3);
  };

  /** Keep a target on everyone near enough to be struck. */
  const syncTargets = () => {
    const want = new Set<string>();
    if (!h.truce()) {
      for (const n of npcs.npcs) {
        if (!n.actor || n.hidden || npcs.troubled(n.rec.id) || !people.present(n.rec.id)) continue;
        if (n.pos.distanceTo(player.pos) > 30) continue;
        want.add(n.rec.id);
        let t = persons.get(n.rec.id);
        if (!t) {
          const p = people.get(n.rec.id);
          if (!p) continue;
          persons.set(n.rec.id, (t = new PersonTarget(n.rec.id, n.rec.name, p.hp, struck)));
          targets.add(t);
        }
        t.place(n.pos);
      }
      for (const n of h.townNpcs()) {
        if (!n.visible || n.pos.distanceTo(player.pos) > 30) continue;
        want.add(n.id);
        let t = persons.get(n.id);
        if (!t) {
          if (!people.get(n.id)) continue;
          persons.set(n.id, (t = new PersonTarget(n.id, n.name, 80, struck)));
          targets.add(t);
        }
        t.place(n.pos);
      }
    }
    for (const [id, t] of persons) if (!want.has(id)) {
      targets.delete(t);
      persons.delete(id);
    }
  };

  // ---- the Watch ----------------------------------------------------------------
  const sendWarden = (c: string) => {
    const a = Math.random() * Math.PI * 2;
    const at = new THREE.Vector3(player.pos.x + Math.cos(a) * 18, 0, player.pos.z + Math.sin(a) * 18);
    at.y = heightAt(at.x, at.z);
    warden = new Warden(at, h.scene, h.bolts, c, WATCH_LOOKS[wardenLook++ % WATCH_LOOKS.length]);
    talked = false;
    warden.onStruck = () => {
      rep.act('resistArrest', { community: c, seen: true, text: 'you drew steel on the Watch' });
      barks.say('warden', say(c, 'guard.attack'), 'hostile');
    };
  };

  const dismiss = (w: Warden) => {
    w.mode = 'leave';
    setTimeout(() => {
      if (warden === w) warden = null;
      w.dispose();
    }, 7000);
  };

  /** The halt: what the Watch offers you. */
  const halt = (w: Warden) => {
    const c = w.community;
    const bounty = rep.bountyOf(c);
    const town = social.townName(c);
    const title = `The Watch of ${town}`;
    const done = (text: string) => h.dialogue.show('Watchman', title, text, [{ label: 'Farewell.', run: () => h.dialogue.close() }]);
    const opts: DialogueOption[] = [];
    opts.push({
      label: `Pay the fine (${bounty} gold)${player.prog.gold < bounty ? ' - you don\'t have it' : ''}`,
      run: () => {
        if (player.prog.gold < bounty) return void halt(w);
        player.prog.addGold(-bounty);
        rep.clearBounty(c);
        rep.act('finePaid', { community: c });
        dismiss(w);
        done(say(c, 'guard.cleared'));
      },
    });
    const days = Math.max(1, Math.min(3, Math.ceil(bounty / 250)));
    opts.push({
      label: `I'll come quietly. (${days} ${days === 1 ? 'night' : 'nights'} in the cells)`,
      run: () => {
        rep.clearBounty(c);
        rep.act('jailed', { community: c });
        h.dialogue.close();
        w.dispose();
        warden = null;
        h.serve(days);
        h.toast(`${days === 1 ? 'A night' : `${days} nights`} in the cells. Your debt to ${town} is paid.`);
      },
    });
    if (bounty < 250) opts.push({
      label: 'It was a misunderstanding. It won\'t happen again.', tone: 'persuade', run: () => {
        const chance = 0.25 + player.prog.level * 0.01 + rep.standingOf(c) / 2000;
        if (Math.random() < chance) {
          if (bounty <= 40) rep.clearBounty(c);
          else rep.bounty[c] = Math.round(bounty / 2);
          dismiss(w);
          done(bounty <= 40 ? 'Fine. Off you go. And I\'ll be watching.' : `Hm. I'll halve it, and only because you asked nicely. ${Math.round(bounty / 2)} gold, next time I see you.`);
        } else {
          opts.splice(opts.findIndex((o) => o.tone === 'persuade'), 1);
          h.dialogue.show('Watchman', title, 'Nice try. The fine stands.', opts);
        }
      },
    });
    const bribe = Math.round(bounty * 0.5) + 10;
    if (player.prog.gold >= bribe) opts.push({
      label: `(Slip them ${bribe} gold.) Let's say you never saw me.`, tone: 'bribe', run: () => {
        if (Math.random() < 0.55) {
          player.prog.addGold(-bribe);
          rep.clearBounty(c);
          dismiss(w);
          done('Saw who? Move along.');
        } else {
          rep.bounty[c] = bounty + 25;
          opts.splice(opts.findIndex((o) => o.tone === 'bribe'), 1);
          h.dialogue.show('Watchman', title, `Bribing the Watch, now? That's another 25 on your fine.`, opts);
        }
      },
    });
    opts.push({
      label: 'Make me.', tone: 'threat', run: () => {
        h.dialogue.close();
        w.takeHit({ damage: 0, poise: 0, dir: new THREE.Vector3(), at: w.center.clone(), crit: false, source: 'melee' });
      },
    });
    h.dialogue.show('Watchman', title, `${say(c, 'guard.halt')} ${bounty} gold, or you come with me.`, opts);
  };

  barks.more = () => (warden ? [{ id: 'warden', head: warden.center.clone().setY(warden.center.y + 1.1) }] : []);

  return {
    persons,
    get warden() {
      return warden;
    },
    /** Clear it all (tests). */
    reset() {
      warden?.dispose();
      warden = null;
      due = -1;
      quietUntil = 0;
      lastHit.clear();
      for (const t of persons.values()) targets.delete(t);
      persons.clear();
      npcs.calm();
    },
    /** Send the Watch now (tests, debug). */
    summon(c: string) {
      if (warden) warden.dispose();
      sendWarden(c);
      return warden;
    },
    update(dt: number) {
      now += dt;
      syncTargets();
      const sid = h.settlementAt(player.pos);
      const c = sid ? communityOf(sid) : undefined;
      if (warden) {
        const w = warden;
        w.update(dt, player);
        if (!w.alive) {
          // Cut down: the Watch remembers.
          if (w.hp <= 0) {
            rep.act('murder', { community: w.community, seen: true, text: 'you cut down a man of the Watch' });
            rep.shift('watch', -200);
            warden = null;
            quietUntil = now + 8;
          }
        } else if (w.mode === 'arrest' && (w.position.distanceTo(player.pos) > 45 || c !== w.community)) {
          // You got away (for now).
          dismiss(w);
          quietUntil = now + 90;
        } else if (w.mode === 'arrest' && w.arrived && !talked && !h.dialogue.open) {
          talked = true;
          halt(w);
        } else if (w.mode === 'arrest' && talked && !h.dialogue.open && rep.bountyOf(w.community) > 0 && w.position.distanceTo(player.pos) > 6) {
          // Walked off mid-conversation: that's resisting.
          w.takeHit({ damage: 0, poise: 0, dir: new THREE.Vector3(), at: w.center.clone(), crit: false, source: 'melee' });
        }
        return;
      }
      if (c && WATCHED.has(c) && rep.bountyOf(c) > 0 && now >= quietUntil && !h.truce() && !h.dialogue.open) {
        if (due < 0) due = now + 6; // (just walked into town: give them a moment)
        if (now >= due) {
          sendWarden(c);
          due = -1;
        }
      }
    },
  };
}

export type Trouble = ReturnType<typeof setupTrouble>;
