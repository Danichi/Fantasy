import * as THREE from 'three';
import { heightAt, RIVER_LEVEL } from './terrainHeight';
import { FESTIVALS, FESTIVAL, sittingDay, upcoming, dateText, type FestivalDef, type FestivalId } from './calendar';
import { mulberry32 } from '../core/math';
import { newTargetId, targets, type HitInfo, type Target } from '../combat/targets';
import { Undead, type UndeadKind } from '../enemies/undead';
import { FISH } from './fishing';
import { sfx } from '../audio/sfx';
import { ITEMS } from '../items/itemDefs';
import type { FX } from '../fx/particles';
import type { Player } from '../player/player';
import type { Look } from '../npc/charBuilder';
import type { NpcRecord, Place, Settlement } from '../npc/npcManager';
import type { MapMarker } from '../ui/worldMap';
import type { Interactable } from '../dungeon/instance';

// The festivals (docs/design/calendar.md): each has a host who stands at its
// ground only while it is on, a little dressing (stalls, bunting, banners,
// candles, lanterns on the river), and something to do there. Every festival
// pays in Festival Tokens, which any host trades for the festival goods.
//
// Saved in the world flags: 'fe:<festival>:<world day>:<thing>' for what
// you've done at one sitting, 'fe:won:<prize>' for prizes given once,
// 'fe:told:<day>' for the morning notices.

type Opt = { label: string; run: () => void };
type Show = (text: string, opts: Opt[]) => void;

export interface FestivalDeps {
  scene: THREE.Scene;
  fx: FX;
  player: Player;
  flags: Record<string, boolean | number | string>;
  day(): number;
  hour(): number;
  toast(m: string): void;
  card(title: string, sub: string): void;
  give(id: string, n: number): void;
  take(id: string, n: number): boolean;
  count(id: string): number;
  gold(n: number): void;
  spend(n: number): boolean;
  xp(n: number): void;
  bless(b: { id: string; label: string; sec: number; m: Record<string, number> }): void;
  shop(name: string, title: string, intro: string, stock: [string, number][]): void;
  /** a sparring bout in a ring; the callbacks run when it ends */
  bout(spec: { name: string; look: Look; hp: number; damage: number; pace: number }, ring: THREE.Vector3, onWin: () => void, onLose: () => void): void;
  /** the black market's goods for a moon: rare things from the catalog, with prices */
  marketStock(seed: number): [string, number][];
  /** the nearest Lost Lantern still dark, for the rumour trade */
  lanternRumour(): { id: string; x: number; z: number; region: string } | null;
  riverX(z: number): number;
  save(): void;
}

/** Where each festival happens: its host's spot and the ground it dresses. */
export interface FestivalGrounds {
  harvestFair: THREE.Vector3;
  lanterns: THREE.Vector3;
  blackMarket: THREE.Vector3;
  harbourWeek: THREE.Vector3;
  tourney: THREE.Vector3;
  dawnVigil: THREE.Vector3;
  /** the tourney's ring (the Silver Lance's lists) */
  lists: THREE.Vector3;
}

interface Host { id: string; festival: FestivalId; name: string; title: string; look: Look; line: string }

const HOSTS: Host[] = [
  { id: 'fe-hollis', festival: 'harvestFair', name: 'Hollis Barley', title: 'Fair Warden of the Harvest Fair', look: { body: 'male', outfit: 'peasant', hair: 'buzzed', beard: true, skin: 0xe8b890, hairColor: 0x8a6a3a, cloth: 0xc87a2a, linen: 0xe8dcb8, height: 1.78 }, line: 'Ribbons for the best of the Glen! Step up, step up.' },
  { id: 'fe-elsa', festival: 'lanterns', name: 'Elsa Wick', title: 'Lantern-Maker', look: { body: 'female', outfit: 'peasant', hair: 'long', skin: 0xf0c8a8, hairColor: 0xd8d4cc, cloth: 0x3a4a8a, linen: 0xe8e0d0, height: 1.62 }, line: 'A lantern for someone you lost? The river carries them to the sea.' },
  { id: 'fe-jack', festival: 'blackMarket', name: 'Velvet Jack', title: 'Fence of the Two Coins', look: { body: 'male', outfit: 'ranger', hood: true, skin: 0xc89870, hairColor: 0x1a1410, cloth: 0x2a1a3a, linen: 0x5a5060, height: 1.74 }, line: 'Keep your voice down. Everything here is very, very legal.' },
  { id: 'fe-tobiah', festival: 'harbourWeek', name: 'Tobiah Reed', title: 'Derby Master of Harbour Week', look: { body: 'male', outfit: 'peasant', hair: 'buzzed', beard: true, skin: 0xd8a880, hairColor: 0x4a3a2a, cloth: 0x2a5a9a, linen: 0xe0e4e8, height: 1.8 }, line: 'Today\'s fish is chalked on the board. Heaviest by the evening bell wins.' },
  { id: 'fe-pellam', festival: 'tourney', name: 'Herald Pellam', title: 'Herald of the Crown Tourney', look: { body: 'male', outfit: 'ranger', pauldron: true, hair: 'buzzed', skin: 0xf0c8a0, hairColor: 0xb8a070, cloth: 0x2a3a8a, linen: 0xd8b040, height: 1.76 }, line: 'For Crown and Lance! Who will ride the lists today?' },
  { id: 'fe-maren', festival: 'dawnVigil', name: 'Sister Maren', title: 'Keeper of the Vigil', look: { body: 'female', outfit: 'peasant', hood: true, skin: 0xf0d0b8, hairColor: 0x6a4a2a, cloth: 0xe8dcb0, linen: 0xfff4e0, height: 1.66 }, line: 'The candles must burn till dawn. Will you stand with us?' },
];

/** What the token stall trades (any host). */
const TOKEN_GOODS: [string, number][] = [['harvestCrown', 15], ['lanternCharm', 12], ['banquet', 3], ['huntersFeast', 2], ['healthPotion', 1], ['manaPotion', 1]];

/** Produce and dishes the Fair judges, with how well each tends to show. */
const PRODUCE: Record<string, number> = { pumpkin: 7, honeycomb: 6, cabbage: 5, apple: 4.5, carrot: 4, wheat: 3, milk: 3 };
const DISHES: Record<string, number> = { banquet: 11, ironRation: 9, huntersFeast: 8, battleBread: 7, warmStew: 7, heartyStew: 6, trailRation: 4, sailorsRation: 4, grilledFish: 3 };
const RIVALS = ['Wren', 'Old Garth', 'Hester', 'Maud', 'Tam the miller'];
const DERBY_FISH = ['mackerel', 'seaBream'];
const KNIGHTS: { name: string; look: Look }[] = [
  { name: 'Ser Aldric Penn', look: { body: 'male', outfit: 'ranger', pauldron: true, bracers: true, hair: 'buzzed', skin: 0xe8c0a0, hairColor: 0x6a4a2a, cloth: 0x8a2a2a, linen: 0xd8c8a0, height: 1.8 } },
  { name: 'Dame Ysolde Marr', look: { body: 'female', outfit: 'ranger', pauldron: true, bracers: true, hair: 'long', skin: 0xf0d0b8, hairColor: 0x1a1410, cloth: 0x2a6a3a, linen: 0xe8e0d0, height: 1.74 } },
  { name: 'Ser Corlan the Unbowed', look: { body: 'male', outfit: 'ranger', pauldron: true, bracers: true, beard: true, hair: 'buzzed', skin: 0xc89870, hairColor: 0x2a2018, cloth: 0xd8b040, linen: 0x2a3a8a, height: 1.86 } },
];

/** The Fair's striking post: a target that only remembers how hard you hit it. */
class StrikePost implements Target {
  id = newTargetId();
  kind = 'dummy';
  alive = true;
  center = new THREE.Vector3();
  radius = 0.45;
  halfHeight = 0.9;
  position = new THREE.Vector3();
  stunned = false;
  lockable = true;
  hp = 9999;
  maxHp = 9999;
  label = "Strongman's Post";
  blows: number[] = [];
  onBlow?: (d: number) => void;
  constructor(at: THREE.Vector3) {
    this.position.copy(at);
    this.center.copy(at).setY(at.y + 0.9);
  }
  takeHit(h: HitInfo) {
    this.blows.push(h.damage);
    this.onBlow?.(h.damage);
  }
}

export class Festivals {
  readonly settlements: Settlement[] = [];
  readonly records: NpcRecord[] = [];
  readonly services = new Map<string, (show: Show, back: () => void) => Opt[]>();
  readonly interactables: Interactable[] = [];
  /** dressing built per festival while it is on and you are near */
  private dressed = new Map<FestivalId, THREE.Group>();
  private t = 0;
  private wasOpen = new Set<FestivalId>();
  // The Fair's post, the vigil's dead, the river's lanterns.
  private post: StrikePost | null = null;
  private postT = 0;
  private puck: THREE.Mesh | null = null;
  private vigil: { wave: number; mobs: Undead[]; lull: number; sitting: number } | null = null;
  private floats: { m: THREE.Mesh; z: number; x: number; v: number; sky: boolean; y: number }[] = [];
  private floatT = 0;
  private floatGeo = new THREE.BoxGeometry(0.22, 0.26, 0.22);
  private floatMat = new THREE.MeshStandardMaterial({ color: 0xffd28a, emissive: 0xffa040, emissiveIntensity: 2.2, roughness: 0.5 });
  private skyMat = new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xff9030, emissiveIntensity: 2.6, roughness: 0.6 });
  /** for tests */
  readonly stats = { derbyBest: 0 };

  constructor(private d: FestivalDeps, private at: FestivalGrounds) {
    for (const h of HOSTS) {
      const spot = at[h.festival].clone();
      const places = new Map<string, Place>();
      places.set('post', { id: 'post', spots: [spot] });
      const sid = `fest-${h.festival}`;
      this.settlements.push({ id: sid, center: spot.clone(), radius: 60, places, nodes: [], edges: [] });
      this.records.push({ id: h.id, name: h.name, title: h.title, job: 'festival', settlement: sid, named: true, look: h.look, schedule: [{ from: 0, activity: 'idle', place: 'post' }], lines: { any: [h.line] } });
      this.services.set(h.id, (show, back) => this.options(h, show, back));
    }
  }

  // ---- the calendar ------------------------------------------------------------------------------
  /** The festival's sitting day if it is on now, else null. */
  sitting(id: FestivalId) {
    return sittingDay(FESTIVAL[id], this.d.day(), this.d.hour());
  }
  isOn(id: FestivalId) {
    return this.sitting(id) !== null;
  }
  open(): FestivalDef[] {
    return FESTIVALS.filter((f) => this.isOn(f.id));
  }
  upcoming(n = 6) {
    return upcoming(this.d.day(), this.d.hour(), n);
  }
  /** Is a festival's host at their ground (npcs.absent asks)? null: not a festival host. */
  absent(npcId: string): boolean | null {
    const h = HOSTS.find((x) => x.id === npcId);
    return h ? !this.isOn(h.festival) : null;
  }
  markers(): MapMarker[] {
    return this.open().map((f) => {
      const p = this.at[f.id];
      return { x: p.x, z: p.z, kind: 'site' as const, glyph: '✺', color: '#ffc860', label: `${f.name} (until ${f.close}:00)` };
    });
  }

  private key(f: FestivalId, what: string) {
    return `fe:${f}:${this.sitting(f) ?? 0}:${what}`;
  }
  private did(f: FestivalId, what: string) {
    return !!this.d.flags[this.key(f, what)];
  }
  private mark(f: FestivalId, what: string, v: number | boolean = 1) {
    this.d.flags[this.key(f, what)] = v;
  }
  private tokens(n: number) {
    this.d.give('festivalToken', n);
  }
  /** A prize that is only ever given once; later wins pay tokens instead. */
  private prize(id: string, orTokens: number) {
    if (this.d.flags['fe:won:' + id]) {
      this.tokens(orTokens);
      return `${orTokens} Festival Tokens (you already have the ${ITEMS[id]?.name ?? id})`;
    }
    this.d.flags['fe:won:' + id] = 1;
    this.d.give(id, 1);
    return ITEMS[id]?.name ?? id;
  }

  // ---- what each host offers -------------------------------------------------------------------------
  private options(h: Host, show: Show, back: () => void): Opt[] {
    const f = FESTIVAL[h.festival];
    if (!this.isOn(f.id)) return [];
    const opts: Opt[] = [];
    const say = (t: string) => show(t, [{ label: 'Go on.', run: back }]);
    switch (f.id) {
      case 'harvestFair': opts.push(...this.fairOptions(say)); break;
      case 'lanterns': opts.push(...this.lanternOptions(say)); break;
      case 'blackMarket': opts.push(...this.marketOptions(h, say)); break;
      case 'harbourWeek': opts.push(...this.derbyOptions(say)); break;
      case 'tourney': opts.push(...this.tourneyOptions(say)); break;
      case 'dawnVigil': opts.push(...this.vigilOptions(say)); break;
    }
    opts.push({ label: `Trade Festival Tokens (you have ${this.d.count('festivalToken')}).`, run: () => this.tokenStall(h, show, back) });
    opts.push({ label: `What is the ${f.name.replace(/^The /, '')}?`, run: () => say(`"${f.blurb} ${f.what}"`) });
    return opts;
  }

  private tokenStall(h: Host, show: Show, back: () => void) {
    const have = this.d.count('festivalToken');
    show(`"Tokens from any festival spend the same here. You have ${have}."`, [
      ...TOKEN_GOODS.filter(([id]) => ITEMS[id]).map(([id, price]) => ({
        label: `${ITEMS[id].name}: ${price} token${price > 1 ? 's' : ''}`,
        run: () => {
          if (!this.d.take('festivalToken', price)) return show(`"That's ${price} tokens, friend. You've ${this.d.count('festivalToken')}."`, [{ label: 'Back.', run: () => this.tokenStall(h, show, back) }]);
          this.d.give(id, 1);
          this.d.save();
          this.tokenStall(h, show, back);
        },
      })),
      { label: 'Back.', run: back },
    ]);
  }

  // The Harvest Fair: the produce show, the cookery, the Strongman's Post.
  private judge(kind: 'produce' | 'cookery', id: string): { place: number; score: number; rivals: [string, number][] } {
    const day = this.sitting('harvestFair') ?? 0;
    const rnd = mulberry32(day * 977 + (kind === 'produce' ? 1 : 2));
    const table = kind === 'produce' ? PRODUCE : DISHES;
    const top = Math.max(...Object.values(table));
    const rivals: [string, number][] = [0, 1, 2].map((i) => [RIVALS[(day + i * 2 + (kind === 'produce' ? 0 : 1)) % RIVALS.length], +(top * (0.55 + rnd() * 0.4) + 1).toFixed(1)]);
    const score = +(table[id] + Math.random() * 3.5).toFixed(1);
    const place = 1 + rivals.filter(([, s]) => s > score).length;
    return { place, score, rivals: rivals.sort((a, b) => b[1] - a[1]) };
  }
  private ribbon(place: number) {
    return place === 1 ? 'the blue ribbon' : place === 2 ? 'the red ribbon' : place === 3 ? 'the yellow ribbon' : 'a handshake';
  }
  private fairOptions(say: (t: string) => void): Opt[] {
    const out: Opt[] = [];
    const contest = (kind: 'produce' | 'cookery') => {
      const table = kind === 'produce' ? PRODUCE : DISHES;
      if (this.did('harvestFair', kind)) return;
      const have = Object.keys(table).filter((id) => this.d.count(id) > 0 && ITEMS[id]).sort((a, b) => table[b] - table[a]);
      out.push({
        label: kind === 'produce' ? 'Enter the produce show.' : 'Enter the cookery.',
        run: () => {
          if (!have.length) return say(kind === 'produce' ? '"Bring me something you grew or gathered: a pumpkin, a cabbage, honeycomb, apples. The judges will be round at noon."' : '"Bring me something you cooked: a stew, a feast, a good loaf. The judges are hungry."');
          const id = have[0];
          this.d.take(id, 1);
          const r = this.judge(kind, id);
          this.mark('harvestFair', kind, r.place);
          const tok = [0, 6, 4, 2][r.place] ?? 1;
          this.tokens(tok);
          this.d.xp(40 + (4 - Math.min(4, r.place)) * 30);
          if (r.place === 1) this.d.gold(60);
          this.checkCrown();
          this.d.save();
          say(`The judges taste and turn and whisper. Your ${ITEMS[id].name} scores ${r.score}. ${r.rivals.map(([n, s]) => `${n}: ${s}`).join(', ')}. You take ${this.ribbon(r.place)}, and ${tok} Festival Tokens.${r.place === 1 ? ' And 60 gold from the Glen\'s purse!' : ''}`);
        },
      });
    };
    contest('produce');
    contest('cookery');
    if (!this.did('harvestFair', 'post')) out.push({ label: 'Try the Strongman\'s Post.', run: () => { this.startPost(); say('"Three blows with whatever you carry. Ring the bell and you\'ll have the whole Glen cheering. Go on, then!"'); } });
    return out;
  }
  private checkCrown() {
    if (this.did('harvestFair', 'produce') && this.did('harvestFair', 'cookery') && this.did('harvestFair', 'post')) {
      const firsts = ['produce', 'cookery', 'post'].filter((k) => this.d.flags[this.key('harvestFair', k)] === 1).length;
      if (firsts === 3 && !this.d.flags['fe:won:harvestCrown']) {
        const got = this.prize('harvestCrown', 6);
        this.d.card('Champion of the Fair', `Three blue ribbons: the ${got}`);
      }
    }
  }
  private startPost() {
    if (this.post) return;
    const at = this.at.harvestFair.clone().add(new THREE.Vector3(6, 0, 4));
    at.y = heightAt(at.x, at.z);
    const post = new StrikePost(at);
    this.post = post;
    this.postT = 25;
    targets.add(post);
    const lvl = this.d.player.paths.charLevel;
    const need = 22 + lvl * 4;
    post.onBlow = (dmg) => {
      const frac = Math.min(1, dmg / (need * 1.5));
      if (this.puck) this.puck.userData.target = frac;
      if (frac >= 1) sfx.clang('perfect', 0.7);
      else sfx.impact('wood', true, 0.4);
      this.d.toast(`Blow ${post.blows.length}: ${Math.round(dmg)}${frac >= 1 ? ' - the bell rings!' : ''}`);
      if (post.blows.length >= 3) this.endPost();
    };
    this.d.toast('The Strongman\'s Post: three blows. Hit it as hard as you can.');
  }
  private endPost() {
    const post = this.post;
    if (!post) return;
    targets.delete(post);
    post.alive = false;
    this.post = null;
    const best = Math.max(0, ...post.blows);
    const lvl = this.d.player.paths.charLevel, need = 22 + lvl * 4;
    const place = best >= need * 1.5 ? 1 : best >= need ? 2 : best > 0 ? 3 : 4;
    this.mark('harvestFair', 'post', place);
    const tok = [0, 6, 4, 2, 0][place];
    if (tok) this.tokens(tok);
    this.d.xp(30 + (4 - place) * 25);
    this.checkCrown();
    this.d.save();
    this.d.toast(best ? `Your best blow: ${Math.round(best)}. ${place === 1 ? 'The bell rang! The blue ribbon' : place === 2 ? 'Close! The red ribbon' : 'The yellow ribbon'}, and ${tok} Festival Tokens.` : 'The Strongman\'s Post: you never swung. Hollis looks disappointed.');
  }

  // The Night of Lanterns.
  private lanternOptions(say: (t: string) => void): Opt[] {
    if (this.did('lanterns', 'floated')) return [];
    return [{
      label: 'Float a lantern on the river (10 gold).',
      run: () => {
        if (!this.d.spend(10)) return say('"Ten gold for the paper and the candle, love. I don\'t make them for nothing."');
        this.mark('lanterns', 'floated');
        this.tokens(2);
        this.d.bless({ id: 'nightOfLanterns', label: 'Lantern-light: the lost are remembered', sec: 1800, m: { hp: 25, heal: 0.2 } });
        this.launch(true, this.at.lanterns.clone(), false);
        this.d.save();
        say('You set the lantern on the water. It turns once, catches the current, and goes to join the others: a long line of little lights all the way to the bend. "There. They\'ll see it, wherever they are." (+2 Festival Tokens)');
      },
    }];
  }
  /** A lantern on the river (or one rising into the sky). */
  private launch(yours: boolean, at: THREE.Vector3, sky: boolean) {
    const m = new THREE.Mesh(this.floatGeo, sky ? this.skyMat : this.floatMat);
    if (yours) {
      m.scale.setScalar(1.5);
      at = new THREE.Vector3(this.d.riverX(at.z) + 1.5, RIVER_LEVEL + 0.12, at.z);
    }
    m.position.copy(at);
    this.d.scene.add(m);
    this.floats.push({ m, x: at.x, z: at.z, y: at.y, v: sky ? 0.9 + Math.random() * 0.6 : 0.6 + Math.random() * 0.4, sky });
  }

  // The Black Market.
  private marketOptions(h: Host, say: (t: string) => void): Opt[] {
    const sit = this.sitting('blackMarket') ?? 0;
    return [
      {
        label: 'See tonight\'s goods.',
        run: () => {
          const stock = this.d.marketStock(sit);
          if (!this.d.flags['fe:won:moonMask']) stock.push(['moonMask', 420]);
          this.d.shop(h.name, h.title, '"New moon, new goods. Don\'t ask where any of it came from, and I won\'t ask where you\'re taking it."', stock);
        },
      },
      {
        label: 'Buy a rumour of a Lost Lantern (60 gold).',
        run: () => {
          const r = this.d.lanternRumour();
          if (!r) return say('"Lanterns? You\'ve lit them all. I\'ve nothing to sell you there."');
          if (!this.d.spend(60)) return say('"Sixty gold. Rumours cost what they cost."');
          this.d.flags['llHint:' + r.id] = 1;
          this.d.save();
          const p = this.d.player.pos, dx = r.x - p.x, dz = r.z - p.z, km = Math.hypot(dx, dz) / 1000;
          const dir = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(((Math.atan2(dx, -dz) / (Math.PI * 2)) * 8 + 8)) % 8];
          say(`Jack leans in. "There's one still dark ${km < 1 ? 'not far from here' : `about ${km.toFixed(1)} km`} to the ${dir}. ${r.region === 'dark' ? 'In the Dark, mind. Rather you than me.' : 'I\'ve marked it on your map, and I never did.'}"`);
        },
      },
    ];
  }

  // Harbour Week's derby.
  private derbyFish() {
    const sit = this.sitting('harbourWeek') ?? 0;
    return FISH.find((f) => f.id === DERBY_FISH[sit % DERBY_FISH.length])!;
  }
  private rivalsFor(sit: number): [string, number][] {
    const f = FISH.find((x) => x.id === DERBY_FISH[sit % DERBY_FISH.length])!;
    const rnd = mulberry32(sit * 7919 + 3);
    return ['Old Nell', 'Captain Tallow', 'Mira Vane'].map((n) => [n, +(f.size[0] + (f.size[1] - f.size[0]) * (0.45 + rnd() * 0.45)).toFixed(2)] as [string, number]).sort((a, b) => b[1] - a[1]);
  }
  /** A fish landed (main's fishing.onCatch): counts if you are in today's derby. */
  onCatch(c: { id: string; name: string; kg: number }) {
    if (!this.isOn('harbourWeek') || !this.did('harbourWeek', 'entered') || this.did('harbourWeek', 'done')) return;
    if (c.id !== this.derbyFish().id) return;
    const best = Number(this.d.flags[this.key('harbourWeek', 'best')] ?? 0);
    if (c.kg > best) {
      this.mark('harbourWeek', 'best', c.kg);
      this.stats.derbyBest = c.kg;
      this.d.toast(`Derby: a ${c.kg} kg ${c.name} is your best yet. Weigh in with Tobiah before the evening bell.`);
    }
  }
  private derbyOptions(say: (t: string) => void): Opt[] {
    const f = this.derbyFish(), sit = this.sitting('harbourWeek') ?? 0;
    if (this.did('harbourWeek', 'done')) return [];
    if (!this.did('harbourWeek', 'entered')) return [{
      label: `Enter today's derby (${f.name}).`,
      run: () => {
        this.mark('harbourWeek', 'entered');
        this.d.save();
        say(`"Today it's ${f.name}. Fish anywhere in the harbour, bring me your heaviest before six. ${this.rivalsFor(sit).length} of the old hands are out already."`);
      },
    }];
    return [{
      label: 'Weigh in your best catch.',
      run: () => {
        const best = Number(this.d.flags[this.key('harbourWeek', 'best')] ?? 0);
        if (!best) return say(`"Nothing on the scale yet. ${f.name}, remember. Off you go."`);
        const rivals = this.rivalsFor(sit);
        const place = 1 + rivals.filter(([, kg]) => kg > best).length;
        this.mark('harbourWeek', 'done', place);
        const medal = place === 1 ? this.prize('derbyMedalGold', 8) : place === 2 ? this.prize('derbyMedalSilver', 5) : place === 3 ? this.prize('derbyMedalBronze', 3) : null;
        if (place > 3) this.tokens(1);
        this.d.gold([0, 150, 80, 40, 0][place] ?? 0);
        this.d.xp(60 + (4 - Math.min(4, place)) * 40);
        this.d.save();
        say(`Your ${f.name}: ${best} kg. ${rivals.map(([n, kg]) => `${n} ${kg} kg`).join(', ')}. ${place <= 3 ? `${['', 'First', 'Second', 'Third'][place]} place: the ${medal}, and ${[0, 150, 80, 40][place]} gold.` : 'Not this time. A token for trying.'}`);
      },
    }];
  }

  // The Crown Tourney.
  private tourneyOptions(say: (t: string) => void): Opt[] {
    if (this.did('tourney', 'champion') || this.did('tourney', 'out')) return [];
    const round = Number(this.d.flags[this.key('tourney', 'round')] ?? 0);
    const k = KNIGHTS[round];
    return [{
      label: `${round === 0 ? 'Enter the tourney' : 'Ride the next bout'}: ${k.name} (${['first round', 'semi-final', 'final'][round]}).`,
      run: () => {
        const lvl = this.d.player.paths.charLevel;
        const ring = this.at.lists.clone();
        ring.y = heightAt(ring.x, ring.z);
        this.d.toast(`Herald Pellam: "${k.name}! For Crown and Lance. Begin!"`);
        this.d.bout({ name: k.name, look: k.look, hp: 200 + round * 70 + lvl * 9, damage: 11 + round * 2 + lvl * 0.35, pace: 1 - round * 0.04 }, ring, () => {
          const next = round + 1;
          this.d.flags[this.key('tourney', 'round')] = next;
          if (next >= KNIGHTS.length) {
            this.mark('tourney', 'champion');
            const got = this.prize('tourneyFavour', 8);
            this.tokens(4);
            this.d.gold(250);
            this.d.xp(400);
            this.d.card('Champion of the Crown Tourney', `The ${got}, 250 gold and the cheers of the capital`);
          } else {
            this.tokens(2);
            this.d.toast(`${k.name} yields! Talk to Herald Pellam for the ${['', 'semi-final', 'final'][next]}.`);
          }
          this.d.save();
        }, () => {
          this.mark('tourney', 'out');
          this.tokens(1);
          this.d.toast('Beaten in the lists. The tourney rides again tomorrow.');
          this.d.save();
        });
      },
    }];
  }

  // The Dawn Vigil.
  private vigilOptions(say: (t: string) => void): Opt[] {
    if (this.vigil || this.did('dawnVigil', 'kept')) return [];
    return [{
      label: 'Stand the vigil.',
      run: () => {
        this.vigil = { wave: 0, mobs: [], lull: 4, sitting: this.sitting('dawnVigil') ?? 0 };
        say('"Then stand by the candles, and don\'t let them reach the door. They come three times. They always come three times."');
      },
    }];
  }
  private vigilCenter() {
    const c = this.at.dawnVigil.clone().add(new THREE.Vector3(0, 0, -6));
    c.y = heightAt(c.x, c.z);
    return c;
  }
  private stepVigil(dt: number) {
    const v = this.vigil;
    if (!v) return;
    const p = this.d.player;
    for (const m of v.mobs) m.update(dt, p, v.mobs);
    for (const m of v.mobs.filter((m) => m.dead)) m.dispose();
    v.mobs = v.mobs.filter((m) => !m.dead);
    const c = this.vigilCenter();
    const away = Math.hypot(p.pos.x - c.x, p.pos.z - c.z) > 60;
    if (p.dead || away || (!this.isOn('dawnVigil') && v.wave < 3)) {
      for (const m of v.mobs) m.dispose();
      this.vigil = null;
      this.d.toast(p.dead ? 'The vigil is broken. The candles gutter out.' : away ? 'You left the vigil. The candles gutter out.' : 'Dawn comes, and the vigil ends unfinished.');
      return;
    }
    if (v.mobs.length) return;
    if (v.wave >= 3) {
      this.vigil = null;
      this.mark('dawnVigil', 'kept');
      const got = this.prize('vigilCandle', 4);
      this.tokens(6);
      this.d.xp(350);
      this.d.bless({ id: 'dawnVigil', label: 'Kept the vigil: the Dawn is with you', sec: 1800, m: { hp: 30, heal: 0.25 } });
      this.d.card('The Vigil Is Kept', `The ${got} and 6 Festival Tokens`);
      this.d.save();
      return;
    }
    v.lull -= dt;
    if (v.lull > 0) return;
    const n = [5, 7, 9][v.wave];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, r = 9 + Math.random() * 5;
      const at = c.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      at.y = heightAt(at.x, at.z);
      const kind: UndeadKind = Math.random() < 0.5 + v.wave * 0.1 ? 'skeleton' : 'zombie';
      v.mobs.push(new Undead(kind, at, Math.atan2(c.x - at.x, c.z - at.z), this.d.scene, this.d.fx));
    }
    v.wave++;
    v.lull = 6;
    sfx.rumble(1.5, 0.7);
    this.d.toast(`The dead rise around the chapel (${v.wave} of 3)!`);
  }

  // ---- the dressing ---------------------------------------------------------------------------------
  private dress(f: FestivalId) {
    const g = new THREE.Group();
    const base = this.at[f];
    g.position.set(base.x, heightAt(base.x, base.z), base.z);
    const M = (c: number, e = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...(e ? { emissive: c, emissiveIntensity: e } : {}) });
    const wood = M(0x6a4a2a), cloth = [M(0xc83a2a), M(0xe8d8a8), M(0x2a5aa8), M(0xd8a830), M(0x3a8a4a)];
    const box = (w: number, h: number, dd: number, x: number, y: number, z: number, m: THREE.Material, ry = 0) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), m);
      b.position.set(x, heightAt(base.x + x, base.z + z) - g.position.y + y, z);
      b.rotation.y = ry;
      b.castShadow = b.receiveShadow = true;
      g.add(b);
      return b;
    };
    const stall = (x: number, z: number, ry: number, c: THREE.Material) => {
      const s = new THREE.Group();
      s.position.set(x, heightAt(base.x + x, base.z + z) - g.position.y, z);
      s.rotation.y = ry;
      const add = (w: number, h: number, dd: number, px: number, py: number, pz: number, m: THREE.Material) => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), m);
        b.position.set(px, py, pz);
        b.castShadow = true;
        s.add(b);
      };
      add(2.4, 0.9, 0.8, 0, 0.45, 0, wood);
      add(2.5, 0.05, 0.9, 0, 0.92, 0, cloth[1]);
      for (const sx of [-1.15, 1.15]) for (const sz of [-0.35, 0.35]) add(0.08, 2.2, 0.08, sx, 1.1, sz, wood);
      const awn = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.06, 1.3), c);
      awn.position.set(0, 2.25, 0.15);
      awn.rotation.x = 0.18;
      s.add(awn);
      g.add(s);
    };
    const bunting = (pts: [number, number][], h: number) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const n = Math.max(3, Math.round(Math.hypot(bx - ax, bz - az) / 0.7));
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          const sag = Math.sin(t * Math.PI) * 0.5;
          const flag = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.3, 3), cloth[k % cloth.length]);
          flag.position.set(x, heightAt(base.x + x, base.z + z) - g.position.y + h - sag - 0.15, z);
          flag.rotation.x = Math.PI;
          g.add(flag);
        }
      }
      for (const [x, z] of pts) box(0.12, h + 0.2, 0.12, x, (h + 0.2) / 2, z, wood);
    };
    const banner = (x: number, z: number, c: THREE.Material) => {
      box(0.1, 4.2, 0.1, x, 2.1, z, wood);
      box(0.9, 1.6, 0.04, x + 0.5, 3.2, z, c);
    };
    const candle = (x: number, z: number) => {
      box(0.08, 0.3, 0.08, x, 0.15, z, M(0xf4ead0));
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4).scale(1, 1.8, 1), new THREE.MeshBasicMaterial({ color: 0xffe0a0 }));
      fl.position.set(x, heightAt(base.x + x, base.z + z) - g.position.y + 0.36, z);
      g.add(fl);
    };
    switch (f) {
      case 'harvestFair': {
        stall(-4, -3, 0.2, cloth[0]);
        stall(0, -5, 0, cloth[3]);
        stall(4.5, -3, -0.25, cloth[2]);
        bunting([[-8, -6], [-3, -9], [3, -9], [8, -6], [9, 2]], 3.2);
        for (let i = 0; i < 6; i++) box(1.1, 0.6, 0.6, -7 + i * 2.6, 0.3, 6, M(0xd8b860), 0.3 * i);
        // The Strongman's Post: a tall pole, a scale, a bell, and a puck that jumps.
        const px = 6, pz = 4;
        box(0.25, 5.2, 0.25, px, 2.6, pz, wood);
        box(0.5, 0.4, 0.5, px, 0.2, pz, M(0x8a3a2a));
        const bell = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), M(0xd8a830));
        bell.position.set(px, heightAt(base.x + px, base.z + pz) - g.position.y + 5.25, pz);
        g.add(bell);
        const puck = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.34), M(0xc83a2a, 0.4));
        puck.position.set(px, heightAt(base.x + px, base.z + pz) - g.position.y + 0.5, pz);
        puck.userData = { base: puck.position.y, target: 0, at: 0 };
        g.add(puck);
        this.puck = puck;
        break;
      }
      case 'lanterns': {
        stall(1.5, 1.5, 0.6, cloth[2]);
        for (let i = 0; i < 9; i++) {
          const lamp = new THREE.Mesh(this.floatGeo, this.floatMat);
          lamp.position.set(-2 + (i % 3) * 0.6 + 1.5, 1.05 + Math.floor(i / 3) * 0.3, 1.5);
          g.add(lamp);
        }
        break;
      }
      case 'blackMarket': {
        box(2.6, 0.03, 1.6, 0, 0.02, 1.2, M(0x3a1a4a));
        for (let i = 0; i < 5; i++) box(0.4, 0.3, 0.3, -1 + i * 0.5, 0.17, 1.2 + (i % 2) * 0.3, M([0x8a6a3a, 0x5a5a6a, 0xa88a30, 0x4a2a2a, 0x2a4a6a][i]));
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), M(0x9a6aff, 2));
        lamp.position.set(-1.4, heightAt(base.x - 1.4, base.z + 0.2) - g.position.y + 1.8, 0.2);
        g.add(lamp);
        const light = new THREE.PointLight(0xa080ff, 2.5, 9, 1.6);
        light.position.copy(lamp.position);
        g.add(light);
        break;
      }
      case 'harbourWeek': {
        stall(0, -2, 0, cloth[2]);
        bunting([[-6, -4], [-2, -6], [2, -6], [6, -4]], 3);
        box(1.6, 1.1, 0.08, -2.4, 1.6, -1.2, M(0x2a2a2a));
        box(0.1, 1.6, 0.1, -2.4, 0.8, -1.2, wood);
        // The scale: a beam on a post with two pans.
        box(0.1, 1.8, 0.1, 2.2, 0.9, -1, wood);
        box(1.4, 0.06, 0.06, 2.2, 1.8, -1, M(0x8a6a30));
        for (const sx of [-0.6, 0.6]) box(0.4, 0.04, 0.4, 2.2 + sx, 1.4, -1, M(0x8a6a30));
        break;
      }
      case 'tourney': {
        stall(0, -2, 0, cloth[2]);
        for (let i = 0; i < 6; i++) banner(-10 + i * 4, 4 + (i % 2) * 1.5, cloth[i % 2 ? 3 : 2]);
        bunting([[-12, 0], [-6, -3], [0, -3], [6, -3], [12, 0]], 3.4);
        break;
      }
      case 'dawnVigil': {
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          candle(Math.cos(a) * 4.5, -6 + Math.sin(a) * 4.5);
        }
        for (const sx of [-3, 3]) {
          box(0.5, 1, 0.5, sx, 0.5, -1, M(0x5a5a5a));
          const fire = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb050 }));
          fire.position.set(sx, heightAt(base.x + sx, base.z - 1) - g.position.y + 1.15, -1);
          g.add(fire);
        }
        break;
      }
    }
    this.d.scene.add(g);
    this.dressed.set(f, g);
  }
  private undress(f: FestivalId) {
    const g = this.dressed.get(f);
    if (!g) return;
    this.d.scene.remove(g);
    g.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    this.dressed.delete(f);
    if (f === 'harvestFair') this.puck = null;
  }

  /** Back to a fresh world (tests). */
  reset() {
    if (this.post) {
      targets.delete(this.post);
      this.post = null;
    }
    if (this.vigil) for (const m of this.vigil.mobs) m.dispose();
    this.vigil = null;
    for (const f of this.floats) this.d.scene.remove(f.m);
    this.floats = [];
    for (const f of [...this.dressed.keys()]) this.undress(f);
    this.wasOpen.clear();
  }

    // ---- per frame ----------------------------------------------------------------------------------------
  update(dt: number) {
    const p = this.d.player.pos;
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 1;
      const day = this.d.day(), hour = this.d.hour();
      // The morning notices: what's on today, and what opens tomorrow.
      if (hour >= 7 && hour < 20 && !this.d.flags['fe:told:' + day]) {
        this.d.flags['fe:told:' + day] = 1;
        const today = this.upcoming(8).filter((u) => u.in === 0 && !u.open);
        const soon = this.upcoming(8).filter((u) => u.in === 1);
        for (const u of today) this.d.toast(`Today, ${dateText(day)}: ${u.f.name} at ${u.f.where}, from ${u.f.open}:00.`);
        for (const u of soon) this.d.toast(`Tomorrow: ${u.f.name} at ${u.f.where}.`);
      }
      for (const f of FESTIVALS) {
        const on = this.isOn(f.id);
        if (on && !this.wasOpen.has(f.id)) {
          this.wasOpen.add(f.id);
          if (hour >= f.open && hour < f.open + 1) this.d.toast(`${f.name} has begun at ${f.where}.`);
        }
        if (!on) this.wasOpen.delete(f.id);
        const here = this.at[f.id];
        const near = Math.hypot(here.x - p.x, here.z - p.z) < 260;
        if (on && near && !this.dressed.has(f.id)) this.dress(f.id);
        if ((!on || !near) && this.dressed.has(f.id)) this.undress(f.id);
      }
    }
    // The post's puck rises with the blow, and falls back.
    if (this.puck) {
      const u = this.puck.userData;
      u.at += (u.target - u.at) * Math.min(1, dt * 8);
      u.target = Math.max(0, u.target - dt * 0.6);
      this.puck.position.y = u.base + u.at * 4.4;
    }
    if (this.post) {
      this.postT -= dt;
      if (this.postT <= 0 || Math.hypot(this.post.position.x - p.x, this.post.position.z - p.z) > 30) this.endPost();
    }
    this.stepVigil(dt);
    this.stepRiver(dt);
  }

  /** The Night of Lanterns: lanterns drift down the river, and sky lanterns rise over the Glen. */
  private stepRiver(dt: number) {
    const on = this.isOn('lanterns');
    const home = this.at.lanterns, p = this.d.player.pos;
    const near = Math.hypot(home.x - p.x, home.z - p.z) < 400;
    if (on && near) {
      // The first time you come: the river is already full of them.
      if (!this.floats.length) for (let k = 0; k < 70; k++) {
        const z = home.z - 160 + k * 8 + Math.random() * 6, x = this.d.riverX(z) + (Math.random() - 0.5) * 6;
        this.launch(false, new THREE.Vector3(x, RIVER_LEVEL + 0.12, z), false);
      }
      this.floatT -= dt;
      if (this.floatT <= 0) {
        this.floatT = 1.6;
        const z = home.z - 160 + Math.random() * 40, x = this.d.riverX(z) + (Math.random() - 0.5) * 6;
        this.launch(false, new THREE.Vector3(x, RIVER_LEVEL + 0.12, z), false);
        if (Math.random() < 0.6) {
          const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 120;
          const sx = Math.cos(a) * r, sz = Math.sin(a) * r;
          this.launch(false, new THREE.Vector3(sx, heightAt(sx, sz) + 2, sz), true);
        }
      }
    }
    for (const f of this.floats) {
      if (f.sky) {
        f.y += f.v * dt;
        f.x += Math.sin(f.y * 0.3) * dt * 0.4;
      } else {
        f.z += f.v * dt;
        f.x = this.d.riverX(f.z) + (f.x - this.d.riverX(f.z - f.v * dt));
      }
      f.m.position.set(f.x, f.y + (f.sky ? 0 : Math.sin(f.z) * 0.03), f.z);
    }
    const keep = (f: (typeof this.floats)[number]) => (f.sky ? f.y < 140 : f.z < home.z + 420) && (on || f.sky ? true : Math.random() > dt * 0.3);
    for (const f of this.floats) if (!keep(f) || !near) this.d.scene.remove(f.m);
    this.floats = near ? this.floats.filter(keep) : [];
  }
}
