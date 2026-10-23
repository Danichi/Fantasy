import * as THREE from 'three';
import { heightAt } from '../terrainHeight';
import { Bandit, Bolts } from '../../enemies/bandit';
import { Figure, Animal, Cart, type Prop } from './actors';
import { CHAINS, STOPS, chainAt, chainProject, isBusy, type Chain, type ChainId } from './paths';
import type { WorldMats } from '../buildings';
import type { FX } from '../../fx/particles';
import type { Player } from '../../player/player';
import type { Interactable } from '../../dungeon/instance';
import type { Look } from '../../npc/charBuilder';
import type { DialogueOption } from '../../ui/dialogue';
import type { RoadLifeHooks, Renown } from './types';
import type { Travellers } from './travellers';
import type { Wayside } from './wayside';

// Road events: small happenings that find you as you travel the roads into
// the capital. A wagon with a wheel off, a merchant held up by the Red Hand,
// a child lost from their family, a runaway horse and its unhorsed rider, a
// royal herald with the news, the tourney criers, a funeral procession, a
// farm cart bogged in the mud. One at a time, ahead of you on the road and
// away from towns and camps; each pays in coin, goods or the road's good
// opinion, and some lead on to quests.

export type EventKind = 'brokenWagon' | 'robbery' | 'lostChild' | 'runawayHorse' | 'herald' | 'tourney' | 'funeral' | 'stuckCart';

const WEIGHTS: Record<EventKind, [number, number]> = {
  // [day, night]
  brokenWagon: [2, 0.8], robbery: [1.6, 2.2], lostChild: [1.2, 0.5], runawayHorse: [1.2, 0.6],
  herald: [1.3, 0], tourney: [0.7, 0], funeral: [0.8, 0], stuckCart: [1.4, 0.4],
};

interface RoadEvent {
  kind: EventKind;
  chain: Chain;
  s: number;
  /** the direction its people travel along the road when they move on */
  dir: 1 | -1;
  center: THREE.Vector3;
  phase: 'wait' | 'active' | 'done' | 'leaving';
  t: number;
  figures: Figure[];
  animals: Animal[];
  cart: Cart | null;
  bandits: Bandit[];
  extras: THREE.Object3D[];
  /** progress (pushes, reunions...) */
  n: number;
  /** a named figure (Pell, Garrick's cousin...) and who's who */
  names: string[];
  rewarded: boolean;
  target?: THREE.Vector3;
  owner?: string;
}

const P = (female: boolean, hair: number, skin: number, linen: number, cloth?: number, extra: Partial<Look> = {}): Look => ({ body: female ? 'female' : 'male', outfit: 'peasant', hair: female ? 'buns' : 'simpleparted', hairColor: hair, skin, linen, cloth, height: female ? 1.64 : 1.76, ...extra });
const KID = (female: boolean, hair: number, skin: number): Look => ({ body: female ? 'female' : 'male', outfit: 'peasant', hair: female ? 'long' : 'buzzed', hairColor: hair, skin, linen: female ? 0xe8c8c0 : 0xc9dbe8, height: 1.14 });
const RAIDERS: Look[] = [
  { body: 'male', outfit: 'ranger', hood: true, hair: 'buzzed', beard: true, hairColor: 0x2a1a10, skin: 0xe0b894, cloth: 0x7a2a22, height: 1.8 },
  { body: 'female', outfit: 'ranger', hood: true, hair: 'long', hairColor: 0x3a2618, skin: 0xa8744e, cloth: 0x6a2a2a, height: 1.7 },
  { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, hairColor: 0x6a5a48, skin: 0xfff0e6, cloth: 0x5a3a2a, pauldron: true, height: 1.84 },
];
const FIRST = ['Bram', 'Tilda', 'Joss', 'Mabry', 'Corwin', 'Elsbeth', 'Wat', 'Rosamund', 'Huw', 'Petra', 'Aldo', 'Ivy'];
const LAST = ['Cartwright', 'Mosswell', 'Fenner', 'Lark', 'Hobday', 'Greaves', 'Underhill', 'Brook'];

export interface RoadEvents {
  interactable: Interactable & { update(p: THREE.Vector3): void };
  /** start an event now, ahead of the player (tests, the console) */
  force(kind: EventKind): boolean;
  active(): EventKind | null;
  step(dt: number, player: Player): void;
  frame(dt: number, player: Player): void;
  setVisible(v: boolean): void;
  clear(): void;
}

export function buildRoadEvents(scene: THREE.Scene, m: WorldMats, fx: FX, hooks: RoadLifeHooks, renown: Renown, travellers: Travellers, wayside: Wayside): RoadEvents {
  const bolts = new Bolts(scene);
  let ev: RoadEvent | null = null;
  let cooldown = 60;
  let lastKind: EventKind | null = null;
  let player: Player | null = null;
  let visible = true;
  const proclaim = new Proclamation();
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
  const g = (x: number, z: number) => new THREE.Vector3(x, heightAt(x, z), z);
  const at = (c: Chain, s: number, lat = 0) => {
    const p = chainAt(c, s, lat);
    return g(p.x, p.z);
  };
  const heading = (c: Chain, s: number, dir: number) => {
    const p = chainAt(c, s);
    return Math.atan2(p.dx * dir, p.dz * dir);
  };
  const say = (f: Figure, text: string) => travellers.barks.say(text, () => (f.visible ? f.pos.clone().setY(f.pos.y + f.lift + (f.look.height ?? 1.75) + 0.35) : null));
  const fig = (e: RoadEvent, look: Look, pos: THREE.Vector3, yaw: number, prop?: Prop, propColor?: number) => {
    const f = new Figure(scene, look, prop, propColor);
    f.pos.copy(pos);
    f.yaw = yaw;
    f.visible = visible;
    e.figures.push(f);
    return f;
  };
  const someone = () => `${pick(FIRST)} ${pick(LAST)}`;

  // ---- the news (heralds) ---------------------------------------------------------------------------
  function news(tourney: boolean): [string, string][] {
    const q = hooks.quests;
    const out: [string, string][] = [];
    if (tourney) out.push(['The Crown’s Tourney', 'Hear ye! The Grand Marshal of the Silver Lance, Ser Roland Hart, opens the lists at the Commandery to any of good heart and steady hand. Ser Gawen Ashby holds the ring against all comers. Present yourselves to the Marshal!']);
    if (q && !q.isDone('red-hand')) out.push(['A Crown Bounty', 'By order of His Majesty King Aldric the Fourth: two hundred and sixty crowns for Red Morwen of the Red Hand, who tolls the Crown Road in blood from the Old Watchtower. Claim it of Sergeant Brask at the checkpoint.']);
    else out.push(['The Red Hand Broken', 'Hear ye! Red Morwen of the Red Hand is fallen, and the Old Watchtower stands empty. The Crown gives thanks to the cadet of the Academy who did the deed.']);
    if (q && !q.isDone('bonebreaker')) out.push(['The Marches', 'Travellers east of the Kingsmile go in company and by daylight. The warband of Gorrak Bonebreaker is abroad. Four hundred and twenty crowns to whoever ends him.']);
    else out.push(['Gorrak Is Dead', 'Gorrak Bonebreaker’s skull hangs on his own totem! The marches are quieter, and the families of Ditchley may yet go home.']);
    out.push(['The Barrow', 'Travellers are warned: keep clear of the Barrow of the Old Kings after dark. The Crown accepts no responsibility for the restless dead.']);
    const days = (3 - (hooks.day() % 3)) % 3;
    out.push(['Market Day', days === 0 ? 'Today is the great market at the Wayfork, where the Caravan Way meets the Crown Road! Spice, silk, cheese and song!' : `The great market at the Wayfork is held in ${days} day${days > 1 ? 's' : ''}. All honest traders welcome; the Red Hand not.`]);
    out.push(['Charity for the Marches', 'The Crown asks charity of all travellers for the burnt-out families of the marches, camped by the road below the Kingsmile.']);
    if (q && !q.isDone('rl-silk-steel')) out.push(['The Queen’s Road', 'Outlaws calling themselves the Red Hand have taken old Fort Rennick above the Queen’s Road. Merchants are bidden ride with the Crown riders until it is cleared.']);
    return out;
  }

  // ---- spawning -------------------------------------------------------------------------------------
  function spawn(kind: EventKind, chain: Chain, s: number, fwd: 1 | -1): RoadEvent | null {
    const c = chain;
    s = Math.max(40, Math.min(c.len - 40, s));
    const center = at(c, s);
    if (isBusy(center.x, center.z) || travellers.near(center.x, center.z, 45)) return null;
    const e: RoadEvent = { kind, chain: c, s, dir: (-fwd) as 1 | -1, center, phase: 'wait', t: 0, figures: [], animals: [], cart: null, bandits: [], extras: [], n: 0, names: [], rewarded: false };
    const side = Math.random() < 0.5 ? 1 : -1;
    const along = heading(c, s, 1);
    switch (kind) {
      case 'brokenWagon': {
        const cart = new Cart(scene, m, { animal: Math.random() < 0.5 ? 'donkey' : 'horse', coat: pick(['bay', 'dun', 'chestnut']), cargo: pick(['barrels', 'wool', 'hay', 'cabbages']) as never, hood: Math.random() < 0.5 ? 0xd8c8a0 : undefined });
        cart.pos.copy(at(c, s, side * 4.4));
        cart.yaw = along + (Math.random() < 0.5 ? 0 : Math.PI);
        cart.setBroken(true);
        cart.update(0);
        e.cart = cart;
        const name = someone();
        e.names.push(name);
        const p = at(c, s - 1.2, side * 6.2);
        fig(e, P(Math.random() < 0.4, pick([0x3a2618, 0x6a4428, 0xb8b4ae]), pick([0xe0b894, 0xfff0e6, 0xa8744e]), 0xd8c29a, 0x7a5a3a), p, along).play('fix');
        fig(e, KID(Math.random() < 0.5, 0x6a4428, 0xe0b894), at(c, s + 2.5, side * 6.4), along + Math.PI).play('idle_tired');
        break;
      }
      case 'stuckCart': {
        const cart = new Cart(scene, m, { animal: Math.random() < 0.5 ? 'bull' : 'donkey', cargo: pick(['cabbages', 'hay', 'barrels']) as never });
        cart.pos.copy(at(c, s, side * 3.2));
        cart.yaw = along + (fwd < 0 ? 0 : Math.PI);
        cart.setStuck(0.32);
        cart.update(0);
        e.cart = cart;
        const mud = new THREE.Mesh(new THREE.CircleGeometry(2.6, 18), new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.35, metalness: 0.05 }));
        mud.rotation.x = -Math.PI / 2;
        mud.scale.set(1, 1.6, 1);
        mud.rotation.z = -cart.yaw;
        mud.position.copy(cart.pos).setY(cart.pos.y + 0.04);
        mud.receiveShadow = true;
        scene.add(mud);
        e.extras.push(mud);
        e.names.push(someone());
        const back = new THREE.Vector3(-Math.sin(cart.yaw) * 2.2, 0, -Math.cos(cart.yaw) * 2.2).add(cart.pos);
        fig(e, P(false, pick([0x8a3f22, 0x1f1a17]), 0xe0b894, 0xd8c29a, 0x6a7f3a, { beard: true }), g(back.x, back.z), cart.yaw).play('fix');
        break;
      }
      case 'robbery': {
        const p = at(c, s, side * 5);
        const merchant = fig(e, P(false, 0x1f1a17, pick([0xa8744e, 0xe0b894]), 0xe8c8c0, pick([0x2f7f86, 0x7a2a6a, 0xc9922a])), p, along + Math.PI / 2);
        merchant.play('crouch');
        e.names.push(someone());
        const d = new Animal(scene, 'donkey', { packs: true });
        d.pos.copy(at(c, s + 2.5, side * 6.5));
        d.yaw = along;
        e.animals.push(d);
        const roles: ('sword' | 'crossbow')[] = ['sword', 'sword', 'crossbow'];
        roles.forEach((role, k) => {
          const q = at(c, s + (k - 1) * 3.2, side * (k === 2 ? 11 : 2.2 + k * 1.2));
          const b = new Bandit(role, q.setY(q.y + 0.3), scene, bolts, undefined, RAIDERS[k % RAIDERS.length]);
          b.name = role === 'crossbow' ? 'Red Hand Crossbowman' : 'Red Hand Cutthroat';
          e.bandits.push(b);
        });
        break;
      }
      case 'lostChild': {
        const p = at(c, s, side * 4.6);
        const female = Math.random() < 0.5;
        const kid = fig(e, KID(female, pick([0xd2b26a, 0x3a2618, 0x8a3f22]), pick([0xe0b894, 0xfff0e6, 0xa8744e])), p, along + side * Math.PI / 2);
        kid.play('idle_tired');
        e.names.push(pick(female ? ['Daisy', 'Wren', 'Poppy', 'Nan', 'Elsie'] : ['Tom', 'Kit', 'Robin', 'Ned', 'Ollie']));
        // The family waits at the nearest camp, inn or post along this road.
        const stops = STOPS.filter((st) => st.kind !== 'town').map((st) => ({ st, ...chainProject(c, st.at[0], st.at[1]) })).filter((x) => x.off < 80 && Math.abs(x.s - s) < 900 && Math.abs(x.s - s) > 60).sort((a, b) => Math.abs(a.s - s) - Math.abs(b.s - s));
        const home = stops[0];
        if (!home) {
          for (const f of e.figures) f.dispose();
          return null;
        }
        const rest = wayside.rest[home.st.id];
        const pp = rest ? rest.look.clone().add(new THREE.Vector3(2.5, 0, 2.5)) : g(home.st.at[0] + 3, home.st.at[1] + 3);
        e.target = g(pp.x, pp.z);
        e.owner = home.st.name;
        e.names.push(someone());
        fig(e, P(true, pick([0x6a4428, 0x3a2618]), pick([0xe0b894, 0xfff0e6]), 0xc9dbe8, 0x6a7f3a), e.target, 0).play('idle');
        break;
      }
      case 'runawayHorse': {
        const h = new Animal(scene, 'horse', { coat: pick(['bay', 'grey', 'chestnut', 'black']), saddle: pick([0x24467e, 0xb8402e, 0x3d7a45]) });
        h.pos.copy(at(c, s, side * rnd(22, 30)));
        h.yaw = Math.random() * 6.28;
        e.animals.push(h);
        e.target = h.pos.clone();
        const pell = !hooks.flags['rl:pellHorse'];
        e.owner = pell ? 'pell' : '';
        e.names.push(pell ? 'Pell Swiftwater' : someone());
        const look: Look = pell ? { body: 'male', outfit: 'ranger', hood: true, hair: 'buzzed', hairColor: 0xd2b26a, skin: 0xfff0e6, cloth: 0x24467e, height: 1.84 } : { body: Math.random() < 0.5 ? 'female' : 'male', outfit: 'ranger', hair: 'buns', hairColor: 0x3a2618, skin: 0xe0b894, cloth: pick([0x8a3a2a, 0x3d7a45, 0x7a5a3a]), height: 1.76 };
        // The rider is somewhere behind you on the road, on foot and limping after it.
        const o = fig(e, look, at(c, s - fwd * 120, 1.5), heading(c, s, fwd));
        o.play('walk');
        break;
      }
      case 'herald':
      case 'tourney': {
        const h = new Animal(scene, 'horse', { coat: kind === 'tourney' ? 'white' : 'grey', saddle: kind === 'tourney' ? 0xc9d6e6 : 0x24467e });
        h.pos.copy(at(c, s, -1.6 * fwd));
        h.yaw = heading(c, s, -fwd);
        e.animals.push(h);
        const herald = fig(e, { body: 'male', outfit: 'peasant', hair: 'simpleparted', hairColor: 0x6a4428, skin: 0xfff0e6, linen: 0xf0e0a8, cloth: 0x24467e, height: 1.78 }, h.pos, h.yaw);
        herald.ride = 1;
        herald.lift = 0.5;
        fig(e, kind === 'tourney' ? { body: 'female', outfit: 'ranger', hair: 'buns', hairColor: 0xd2b26a, skin: 0xfff0e6, cloth: 0xc9d6e6, pauldron: true, height: 1.72 } : P(false, 0x3a2618, 0xe0b894, 0xf0e0a8, 0x24467e), at(c, s - fwd * 2.4, 2.4 * fwd), h.yaw, 'banner', kind === 'tourney' ? 0xc9d6e6 : 0x24467e);
        if (kind === 'tourney') fig(e, { body: 'male', outfit: 'peasant', hair: 'buzzed', hairColor: 0x8a3f22, skin: 0xe0b894, linen: 0xe8dcb8, cloth: 0xc9d6e6, height: 1.5 }, at(c, s - fwd * 4.6, 1.2 * fwd), h.yaw, 'banner', 0xb8402e);
        e.names.push(kind === 'tourney' ? 'Crier of the Tourney' : 'Royal Herald Tobias Penn');
        break;
      }
      case 'funeral': {
        const yaw = heading(c, s, -fwd);
        const priest = fig(e, { body: 'male', outfit: 'peasant', hair: 'buzzed', hairColor: 0xe6e2da, skin: 0xe0b894, linen: 0xfff4dc, cloth: 0xe8c060, height: 1.72 }, at(c, s, -fwd * 1.4), yaw, 'bell');
        priest.play('walk');
        const cart = new Cart(scene, m, { animal: 'donkey', cargo: 'coffin' });
        cart.pos.copy(at(c, s - -fwd * 6, -fwd * 1.4));
        cart.yaw = yaw;
        e.cart = cart;
        for (let k = 0; k < 4; k++) fig(e, P(k % 2 === 0, [0x3a2618, 0x6a4428, 0x1f1a17, 0xb8b4ae][k], [0xe0b894, 0xfff0e6, 0xa8744e, 0xe0b894][k], 0x3a3a40, 0x2a2a30), at(c, s + fwd * (11 + Math.floor(k / 2) * 1.6), -fwd * (0.6 + (k % 2) * 1.2)), yaw);
        e.names.push(someone());
        break;
      }
    }
    return e;
  }

  function dispose(e: RoadEvent) {
    for (const f of e.figures) f.dispose();
    for (const a of e.animals) a.dispose();
    e.cart?.dispose();
    for (const b of e.bandits) b.dispose();
    for (const x of e.extras) x.removeFromParent();
    proclaim.hide();
  }

  function tryStart(p: Player, forced?: EventKind) {
    // Which road is the player on?
    let best: { c: Chain; s: number; off: number } | null = null;
    for (const id of Object.keys(CHAINS) as ChainId[]) {
      const pr = chainProject(CHAINS[id], p.pos.x, p.pos.z);
      if (!best || pr.off < best.off) best = { c: CHAINS[id], ...pr };
    }
    if (!best || (best.off > 45 && !forced)) return false;
    const here = chainAt(best.c, best.s);
    const v = p.vel.x * here.dx + p.vel.z * here.dz;
    if (!forced && Math.abs(v) < 1.2) return false;
    const fwd: 1 | -1 = v >= 0 ? 1 : -1;
    const h = hooks.hour();
    const night = h >= 20.5 || h < 5.5;
    let kind = forced;
    if (!kind) {
      const table = (Object.keys(WEIGHTS) as EventKind[]).filter((k) => k !== lastKind).map((k) => [k, WEIGHTS[k][night ? 1 : 0]] as [EventKind, number]).filter(([, w]) => w > 0);
      let r = Math.random() * table.reduce((a, [, w]) => a + w, 0);
      kind = table[0][0];
      for (const [k, w] of table) if ((r -= w) <= 0) { kind = k; break; }
    }
    for (const dist of [rnd(85, 110), rnd(120, 150), rnd(60, 80)]) {
      const e = spawn(kind!, best.c, best.s + fwd * dist, fwd);
      if (e) {
        ev = e;
        lastKind = kind!;
        return true;
      }
    }
    return false;
  }

  const finish = (e: RoadEvent, gold: number, renownN: number, why: string, items: [string, number][] = []) => {
    if (e.rewarded) return;
    e.rewarded = true;
    if (gold) hooks.gold(gold);
    for (const [id, n] of items) hooks.give(id, n);
    hooks.xp(25 + renownN * 10);
    renown.add(renownN, why + (gold ? ` (+${gold}g)` : ''));
    hooks.flags['rl:deeds'] = Number(hooks.flags['rl:deeds'] ?? 0) + 1;
    hooks.save();
  };

  // ---- talking to the event's people ----------------------------------------------------------------
  const ipos = new THREE.Vector3(0, -999, 0);
  let label = '';
  let act: (() => void) | null = null;
  const talk = (who: string, title: string, text: string, opts: DialogueOption[]) => hooks.talk(who, title, text, opts);
  const bye = (t = 'Safe travels.') => ({ label: t, run: () => hooks.close() });

  function interaction(e: RoadEvent, p: THREE.Vector3): { at: THREE.Vector3; label: string; run: () => void } | null {
    const f0 = e.figures[0];
    switch (e.kind) {
      case 'brokenWagon':
        if (e.phase === 'leaving' || !e.cart) return null;
        return {
          at: f0.pos, label: `Help ${e.names[0]} with the wagon`,
          run: () => talk(e.names[0], 'Carter, stranded', 'The wheel came off over a stone and the pin’s sheared. If someone could heave the axle up while I knock the wheel home… my back won’t do it alone.', [
            ...(hooks.count('planks') > 0 ? [{ label: 'Brace the axle with a plank (use 1 Oak Planks)', run: () => fix(true) }] : []),
            { label: 'Heave the axle up (stamina)', run: () => fix(false) },
            bye('Sorry, I can’t stop.'),
          ]),
        };
      case 'stuckCart':
        if (e.phase === 'leaving' || !e.cart) return null;
        return {
          at: f0.pos, label: `Put your shoulder to the cart (${e.n}/3)`,
          run: () => {
            if (!player) return;
            if (player.stamina < 30) return hooks.toast('You’re too winded to push. Catch your breath first.');
            player.stamina -= 30;
            e.n++;
            fx.add.spawn({ pos: e.cart!.pos.clone().setY(e.cart!.pos.y + 0.3), vel: new THREE.Vector3(0, 2.2, 0), spread: 2.2, count: 26, life: [0.4, 0.9], size: [0.16, 0.05], color: 0x4a3420, color2: 0x2a1c10, gravity: 9 });
            e.cart!.setStuck(0.32 * (1 - e.n / 3));
            if (e.n < 3) return say(f0, ['Heave!', 'Again! She’s moving!', 'Once more!'][e.n - 1] ?? 'Heave!');
            e.cart!.setStuck(0);
            say(f0, 'She’s out! Bless you!');
            const gift = pick([['cabbage', 2], ['apple', 3], ['carrot', 3], ['milk', 1]] as [string, number][]);
            finish(e, 8, 2, `${e.names[0]} thanks you, mud to the knees, and presses some of the load on you.`, [gift]);
            e.phase = 'leaving';
            e.t = 0;
          },
        };
      case 'robbery':
        if (e.bandits.some((b) => !b.dead && b.alive) || e.rewarded) return null;
        return {
          at: f0.pos, label: `Talk to ${e.names[0]}`,
          run: () => {
            const first = !hooks.flags['rl:robberyTold'];
            hooks.flags['rl:robberyTold'] = true;
            talk(e.names[0], 'Merchant, rescued', `Dawn bless you, I thought that was my last road. ${first ? 'They wore red hands painted on their sleeves. The Red Hand: they’ve a nest in old Fort Rennick on the Queen’s Road, so the riders say, and they’ve robbed half the Wayfork. Garrick Vell lost every bolt of silk he had.' : 'Red Hand again. They’re getting bold.'} Here, take this. It’s not what my life’s worth, but it’s what my purse is.`, [{
              label: 'Glad you’re safe.',
              run: () => {
                hooks.close();
                finish(e, Math.round(rnd(35, 60)), 3, `${e.names[0]} pays you for your trouble.`, [['healthPotion', 1]]);
                e.phase = 'leaving';
                e.t = 0;
              },
            }]);
          },
        };
      case 'lostChild': {
        if (e.phase === 'wait') return {
          at: f0.pos, label: `Talk to the crying child`,
          run: () => talk(e.names[0], 'Lost on the road', `*sniff* I went to look at a b-bird and when I came back everyone was gone. We were going to ${e.owner}. Mum’ll be so cross…`, [
            { label: 'I’ll take you there. Stay close.', run: () => { hooks.close(); e.phase = 'active'; say(f0, 'Okay… don’t walk too fast.'); } },
            bye('Wait here; someone will come.'),
          ]),
        };
        if (e.phase === 'done' && !e.rewarded) return {
          at: e.figures[1].pos, label: `Talk to ${e.names[1]}`,
          run: () => talk(e.names[1], 'Parent, relieved', `${e.names[0]}! Oh, you wicked, wonderful child. And you, stranger: I’d turned the whole camp out looking. Here, it’s little enough. The road needs more like you.`, [{
            label: 'Keep an eye on them.',
            run: () => { hooks.close(); finish(e, 12, 3, `${e.names[1]} hugs ${e.names[0]} and thanks you over and over.`, [['travellersBread', 2]]); },
          }]),
        };
        return null;
      }
      case 'runawayHorse': {
        const h = e.animals[0];
        if (e.phase === 'wait' && h.pos.distanceTo(p) < 3.4) return { at: h.pos, label: 'Catch the runaway horse', run: () => { e.phase = 'active'; hooks.toast('You catch the trailing reins. The horse snorts, rolls an eye at you, and decides you’ll do.'); } };
        const o = e.figures[0];
        if (e.phase === 'done' && !e.rewarded) return {
          at: o.pos, label: `Talk to ${e.names[0]}`,
          run: () => {
            const pell = e.owner === 'pell';
            const show = (t: string, opts: DialogueOption[]) => talk(e.names[0], pell ? 'Crown Courier, unhorsed' : 'Rider, unhorsed', t, opts);
            const done = () => {
              hooks.close();
              if (pell) hooks.flags['rl:pellHorse'] = true;
              finish(e, pell ? 30 : 22, 2, pell ? 'Pell swings up into the saddle with a grin.' : `${e.names[0]} takes the reins back gratefully.`);
              e.phase = 'leaving';
              e.t = 0;
            };
            const back = () => show(pell ? 'Bramble! You daft beast. A fox in the hedge and she’s gone like a loosed arrow, me in the ditch. The Crown’s post would have waited a week. Thank you.' : 'There she is! I’ve been walking an hour after her. Thank you, thank you.', [...(pell ? hooks.quests?.options('pell', show, back) ?? [] : []), { label: 'Ride safe.', run: done }]);
            back();
          },
        };
        return null;
      }
      case 'herald':
      case 'tourney': {
        if (e.phase !== 'active') return null;
        return {
          at: f0.pos, label: e.kind === 'tourney' ? 'Ask about the tourney' : 'Ask the herald for the news',
          run: () => {
            const items = news(e.kind === 'tourney');
            talk(e.names[0], e.kind === 'tourney' ? 'Crier of the Crown’s Tourney' : 'Royal Herald', items.map(([t, b]) => `• ${t}: ${b}`).join('\n\n'), [
              ...(e.kind === 'tourney' && !e.rewarded ? [{ label: 'Take a tourney favour', run: () => { hooks.close(); finish(e, 0, 1, 'The squire ties a red-and-white ribbon to your arm: a tourney favour.'); } }] : []),
              bye('Thank you.'),
            ]);
          },
        };
      }
      case 'funeral':
        if (e.rewarded) return null;
        return {
          at: f0.pos, label: 'Stand aside and pay your respects',
          run: () => {
            if (player) {
              player.hp = player.maxHp;
              player.stamina = player.maxStamina;
            }
            talk('Brother of the Dawn', 'Funeral procession', `We carry ${e.names[0]} home to the churchyard. Sixty years a carter on this road, and never once late. You honour the dead, traveller. The Dawn sees it.`, [{ label: 'Bow your head.', run: () => { hooks.close(); finish(e, 0, 1, 'The mourners nod to you as they pass.'); } }]);
          },
        };
    }
  }

  function fix(plank: boolean) {
    const e = ev;
    if (!e || !e.cart || !player) return;
    if (plank) hooks.take('planks', 1);
    else {
      if (player.stamina < 40) {
        hooks.close();
        return hooks.toast('You strain at the axle, but you’re too winded. Get your breath back first.');
      }
      player.stamina -= 40;
    }
    hooks.close();
    e.cart.setBroken(false);
    fx.dust(e.cart.pos, 2);
    say(e.figures[0], 'She’s on! Good as new. Better!');
    finish(e, plank ? 30 : 16, 2, `${e.names[0]} knocks the wheel home and pumps your hand.`, [[pick(['travellersBread', 'roadCheese', 'spicedCider']), plank ? 2 : 1]]);
    e.phase = 'leaving';
    e.t = 0;
  }

  const interactable: RoadEvents['interactable'] = {
    pos: ipos, radius: 2.8,
    label: () => label,
    enabled: () => !!act,
    action: () => act?.(),
    update(p: THREE.Vector3) {
      act = null;
      label = '';
      ipos.set(0, -999, 0);
      if (!ev) return;
      const it = interaction(ev, p);
      if (!it) return;
      ipos.copy(it.at);
      label = it.label;
      act = it.run;
    },
  };

  // ---- per frame ----------------------------------------------------------------------------------------
  /** Move along the road at `speed`, easing sideways onto lane `lat` (to the right of the direction of travel). */
  function walkAlong(f: Figure | Animal | Cart, e: RoadEvent, speed: number, lat: number, dt: number) {
    const pr = chainProject(e.chain, f.pos.x, f.pos.z);
    const p0 = chainAt(e.chain, pr.s);
    const cur = (f.pos.x - p0.x) * -p0.dz + (f.pos.z - p0.z) * p0.dx;
    const want = lat * e.dir;
    const next = cur + (want - cur) * (1 - Math.exp(-1.5 * dt));
    const p = chainAt(e.chain, pr.s + e.dir * speed * dt, next);
    f.pos.set(p.x, heightAt(p.x, p.z), p.z);
    f.yaw = Math.atan2(p.dx * e.dir, p.dz * e.dir);
  }

  function follow(f: Figure | Animal, target: THREE.Vector3, keep: number, dt: number) {
    const dx = target.x - f.pos.x, dz = target.z - f.pos.z, d = Math.hypot(dx, dz);
    if (d <= keep) return 0;
    const sp = d > 10 ? 4.6 : 1.7;
    const step = Math.min(d - keep, sp * dt);
    f.pos.x += (dx / d) * step;
    f.pos.z += (dz / d) * step;
    f.pos.y = heightAt(f.pos.x, f.pos.z);
    f.yaw = Math.atan2(dx, dz);
    return sp;
  }

  return {
    interactable,
    force(kind) {
      if (!player) return false;
      if (ev) {
        dispose(ev);
        ev = null;
      }
      return tryStart(player, kind);
    },
    active: () => ev?.kind ?? null,
    step(dt, p) {
      player = p;
      if (!ev) return;
      for (const b of ev.bandits) {
        if (!b.alerted && b.position.distanceTo(p.pos) < 30) b.alerted = true;
        b.update(dt, p);
      }
      bolts.update(dt, p);
      ev.bandits = ev.bandits.filter((b) => !b.dead);
    },
    frame(dt, p) {
      player = p;
      cooldown -= dt;
      if (!ev) {
        if (cooldown <= 0 && !hooks.dialogueOpen()) {
          if (!tryStart(p)) cooldown = 8;
        }
        return;
      }
      const e = ev;
      e.t += dt;
      const dist = Math.hypot(p.pos.x - e.center.x, p.pos.z - e.center.z);
      switch (e.kind) {
        case 'brokenWagon':
        case 'stuckCart': {
          if (e.phase === 'leaving' && e.cart) {
            walkAlong(e.cart, e, 1.5, 2, dt);
            e.cart.speed = 1.5;
            const f = e.figures[0];
            const lead = chainAt(e.chain, chainProject(e.chain, e.cart.pos.x, e.cart.pos.z).s + e.dir * 3, 3.6 * e.dir);
            f.pos.set(lead.x, heightAt(lead.x, lead.z), lead.z);
            f.yaw = e.cart.yaw;
            f.play('walk');
            if (e.figures[1]) {
              const k = chainAt(e.chain, chainProject(e.chain, e.cart.pos.x, e.cart.pos.z).s - e.dir * 3, 2.6 * e.dir);
              e.figures[1].pos.set(k.x, heightAt(k.x, k.z), k.z);
              e.figures[1].yaw = e.cart.yaw;
              e.figures[1].play('walk');
            }
          } else if (e.cart) e.cart.speed = 0;
          if (e.phase === 'wait' && dist < 20 && e.t > 1) {
            e.phase = 'active';
            say(e.figures[0], e.kind === 'stuckCart' ? 'Hoy! Could you lend a shoulder? She’s stuck fast!' : 'You there! Could you spare a hand?');
          }
          e.cart?.update(dt);
          break;
        }
        case 'robbery': {
          const m0 = e.figures[0];
          if (e.phase === 'wait' && dist < 40) {
            e.phase = 'active';
            say(m0, 'Help! Thieves! Help!');
          }
          if (!e.bandits.some((b) => !b.dead && b.alive) && !e.rewarded) m0.play('idle');
          if (e.phase === 'leaving') {
            walkAlong(m0, e, 1.4, 2, dt);
            m0.play('walk');
            const d0 = e.animals[0];
            const k = chainAt(e.chain, chainProject(e.chain, m0.pos.x, m0.pos.z).s - e.dir * 2.4, 2.8 * e.dir);
            d0.pos.set(k.x, heightAt(k.x, k.z), k.z);
            d0.yaw = m0.yaw;
            d0.speed = 1.4;
          }
          for (const a of e.animals) {
            a.gait(e.phase !== 'leaving');
            a.update(dt);
          }
          break;
        }
        case 'lostChild': {
          const kid = e.figures[0], parent = e.figures[1];
          if (e.phase === 'active') {
            const sp = follow(kid, p.pos, 2.4, dt);
            kid.play(sp > 3 ? 'jog' : sp > 0 ? 'walk' : 'idle');
            if (kid.pos.distanceTo(e.target!) < 7) {
              e.phase = 'done';
              say(parent, `${e.names[0]}! There you are!`);
              say(kid, 'MUM!');
            }
          } else if (e.phase === 'done') {
            follow(kid, parent.pos, 1.0, dt);
            kid.play('cheer');
            parent.play(e.rewarded ? 'idle' : 'cheer');
            parent.yaw = Math.atan2(kid.pos.x - parent.pos.x, kid.pos.z - parent.pos.z);
          }
          e.center.copy(kid.pos);
          break;
        }
        case 'runawayHorse': {
          const h = e.animals[0], o = e.figures[0];
          if (e.phase === 'wait') {
            // Skittish: wanders about, trots off if you run at it.
            if (!e.target || h.pos.distanceTo(e.target) < 1 || Math.random() < dt * 0.15) e.target = h.pos.clone().add(new THREE.Vector3(rnd(-14, 14), 0, rnd(-14, 14)));
            const run = p.sprinting && h.pos.distanceTo(p.pos) < 9;
            const dx = e.target.x - h.pos.x, dz = e.target.z - h.pos.z, d = Math.hypot(dx, dz) || 1;
            const sp = run ? 4.5 : 1.1;
            h.pos.x += (dx / d) * sp * dt;
            h.pos.z += (dz / d) * sp * dt;
            h.pos.y = heightAt(h.pos.x, h.pos.z);
            h.yaw = Math.atan2(dx, dz);
            h.speed = sp;
            if (e.t > 3 && Math.random() < dt * 0.06) say(o, 'Has anyone seen a horse?!');
          } else if (e.phase === 'active') {
            h.speed = follow(h, p.pos, 3, dt);
            if (h.speed > 0 && p.mounted) h.speed = follow(h, p.pos, 3, dt * 2);
          } else if (e.phase === 'done') h.speed = 0;
          // The rider makes for the horse.
          if (e.phase !== 'leaving') {
            const sp = follow(o, h.pos, 2.6, dt * (o.pos.distanceTo(h.pos) > 30 ? 1.6 : 1));
            o.play(sp > 3 ? 'jog' : sp > 0 ? 'walk' : e.phase === 'done' ? 'talk' : 'idle');
            if (e.phase === 'active' && o.pos.distanceTo(h.pos) < 6) {
              e.phase = 'done';
              say(o, e.owner === 'pell' ? 'Bramble! You found her!' : 'My horse! You caught her!');
            }
          } else {
            o.ride = 1;
            o.lift = 0.5;
            walkAlong(h, e, 7, 1.8, dt);
            h.speed = 7;
            o.pos.copy(h.pos);
            o.yaw = h.yaw;
            o.play('idle');
          }
          h.gait(e.phase === 'done');
          h.update(dt);
          e.center.copy(h.pos);
          break;
        }
        case 'herald':
        case 'tourney': {
          const h = e.animals[0], herald = e.figures[0];
          const close = h.pos.distanceTo(p.pos) < 14;
          if (e.phase === 'wait' && close) {
            e.phase = 'active';
            e.t = 0;
            const items = news(e.kind === 'tourney');
            const [title, body] = e.kind === 'tourney' ? items[0] : items[Math.floor(Math.random() * items.length)];
            proclaim.show(title, body);
            say(herald, e.kind === 'tourney' ? 'To the lists! To the lists!' : 'Hear ye! Hear ye!');
          }
          const moving = e.phase === 'wait' || (e.phase === 'active' && e.t > 26) || e.phase === 'leaving';
          if (e.phase === 'active' && e.t > 26) e.phase = 'leaving';
          if (moving) {
            walkAlong(h, e, 1.5, 1.6, dt);
            h.speed = 1.5;
            herald.pos.copy(h.pos);
            herald.yaw = h.yaw;
            e.figures.slice(1).forEach((f, k) => {
              const q = chainAt(e.chain, chainProject(e.chain, h.pos.x, h.pos.z).s - e.dir * (2.6 + k * 2.2), (2.6 - k * 1.4) * e.dir);
              f.pos.set(q.x, heightAt(q.x, q.z), q.z);
              f.yaw = h.yaw;
              f.play('walk', 1.2);
            });
          } else {
            h.speed = 0;
            herald.yaw = h.yaw;
            e.figures.slice(1).forEach((f) => {
              f.play('idle');
              f.yaw = Math.atan2(p.pos.x - f.pos.x, p.pos.z - f.pos.z);
            });
          }
          herald.play(e.phase === 'active' ? 'talk' : 'idle');
          h.gait();
          h.update(dt);
          e.center.copy(h.pos);
          break;
        }
        case 'funeral': {
          if (e.phase === 'wait' && dist < 30) {
            e.phase = 'active';
            say(e.figures[0], 'Make way for the dead…');
          }
          // A slow walk along the road; it pauses while you speak with them.
          const sp = hooks.dialogueOpen() && dist < 8 ? 0 : 0.7;
          e.figures.forEach((f, k) => {
            if (sp > 0) {
              const lat = k === 0 ? 1.4 : 0.6 + ((k - 1) % 2) * 1.2;
              walkAlong(f, e, sp, lat, dt);
            }
            f.play(sp > 0 ? 'walk' : 'idle', 0.65);
          });
          if (e.cart) {
            if (sp > 0) walkAlong(e.cart, e, sp, 1.4, dt);
            e.cart.speed = sp;
            e.cart.update(dt);
          }
          if (Math.random() < dt * 0.4 && dist < 40) say(e.figures[0], '*dong*');
          e.center.copy(e.figures[0].pos);
          break;
        }
      }
      for (const f of e.figures) {
        f.visible = visible;
        f.update(dt, f.pos.distanceTo(p.pos) < 60);
      }
      // Done with: far behind, or long gone down the road.
      const gone = (e.phase === 'leaving' && e.t > 45) || dist > 260 || (e.kind === 'lostChild' && e.phase === 'active' && e.figures[0].pos.distanceTo(p.pos) > 140);
      if (gone) {
        dispose(e);
        ev = null;
        cooldown = rnd(80, 160);
      }
      proclaim.update(dt);
    },
    setVisible(v) {
      visible = v;
      if (!ev) return;
      for (const f of ev.figures) f.visible = v;
      for (const a of ev.animals) a.root.visible = v;
      if (ev.cart) ev.cart.root.visible = v;
      for (const x of ev.extras) x.visible = v;
      if (!v) proclaim.hide();
    },
    clear() {
      if (ev) dispose(ev);
      ev = null;
      bolts.clear();
      cooldown = 60;
    },
  };
}

/** A herald's proclamation: a parchment notice at the top of the screen for a few seconds. */
class Proclamation {
  private el: HTMLDivElement | null = null;
  private t = 0;

  show(title: string, body: string) {
    const ui = document.getElementById('ui');
    if (!ui) return;
    this.hide();
    const el = document.createElement('div');
    el.className = 'rl-proclaim';
    const h = document.createElement('h3');
    h.textContent = title;
    const p = document.createElement('p');
    p.textContent = body;
    const seal = document.createElement('i');
    el.append(seal, h, p);
    ui.appendChild(el);
    requestAnimationFrame(() => el.classList.add('on'));
    this.el = el;
    this.t = 11;
  }

  update(dt: number) {
    if (!this.el) return;
    this.t -= dt;
    if (this.t <= 0) this.hide();
  }

  hide() {
    const el = this.el;
    if (!el) return;
    this.el = null;
    el.classList.remove('on');
    setTimeout(() => el.remove(), 600);
  }
}
