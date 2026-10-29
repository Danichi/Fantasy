import * as THREE from 'three';
import type { NpcManager } from '../npc/npcManager';
import type { QuestLog } from '../quests/questLog';
import type { NpcSpec } from '../npc/npc';
import type { DialogueUI } from '../ui/dialogue';
import type { ShopUI } from '../ui/shopUI';
import { Barks, type Speaker } from './barks';
import { Conversation, type ConvoSpec, type GiftItem } from './conversation';
import { pickLine, type LineCtx } from './lines';
import { People, type PersonInfo } from './people';
import type { SocialSave } from './reputation';

// Hooks the NPC overhaul into the game: profiles for every resident, the
// conversation engine behind every "Talk to", speech bubbles, reputation on
// shop prices, and the save.

const TOWN_NAME: Record<string, string> = {
  elderGlen: 'Elder Glen', royalCapital: 'the Capital', portAurelle: 'Port Aurelle', sunspire: 'Sunspire', herbCamp: 'the herb camp',
  waystation: 'the Wayfarer\'s Rest', kingsmile: 'the Kingsmile',
};
const townName = (sid: string) => TOWN_NAME[sid] ?? sid.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

export interface SocialHooks {
  npcs: NpcManager;
  townSpecs: NpcSpec[];
  /** Town NPCs' heads (for bubbles) */
  townHeads: () => { id: string; head: THREE.Vector3; visible: boolean }[];
  dialogue: DialogueUI;
  shopUI: ShopUI;
  camera: THREE.Camera;
  hour: () => number;
  day: () => number;
  rain: () => boolean;
  gold: () => number;
  addGold: (n: number) => void;
  level: () => number;
  items: () => GiftItem[];
  take: (id: string, n: number) => void;
  give: (id: string, n: number) => void;
  toast: (m: string) => void;
  weaponOut: () => boolean;
  playerPos: () => THREE.Vector3;
  save?: SocialSave;
}

export function setupSocial(h: SocialHooks) {
  const people = new People();
  const rep = people.rep;
  rep.day = h.day;
  rep.notify = h.toast;
  rep.onLeave = (id) => {
    const p = people.get(id);
    if (p) h.toast(`${p.name} has packed up and left ${townName(p.settlement)}. Make amends, and they may come back.`);
  };
  rep.load(h.save);
  const townIds = new Set(h.townSpecs.map((s) => s.id));
  people.settlementOf = (id) => (townIds.has(id) ? 'elderGlen' : h.npcs.find(id)?.rec.settlement);
  people.residents = (sid) => {
    const out: PersonInfo[] = h.npcs.npcs.filter((n) => n.rec.settlement === sid).map((n) => ({ id: n.rec.id, name: n.rec.name, job: n.rec.job, settlement: sid, named: n.rec.named, title: n.rec.title }));
    if (sid === 'elderGlen') out.push(...h.townSpecs.filter((s) => s.id !== 'guild').map((s) => ({ id: s.id, name: s.name, job: s.id, settlement: 'elderGlen', named: true, title: s.title })));
    return out;
  };

  /** How this person sees the moment. */
  const ctx = (id: string): LineCtx => {
    const p = people.get(id);
    const m = rep.mem[id];
    const mood = rep.moodOf(id);
    const you = mood === 'friend' || mood === 'devoted' ? 'friend' : mood === 'hostile' || mood === 'cold' ? 'you' : (m?.met ?? 0) > 2 ? 'traveller' : 'stranger';
    const told = rep.told.find((t) => t.community === people.communityFor(id));
    return {
      hour: h.hour(), rain: h.rain(), you,
      town: townName(p?.settlement ?? 'elderGlen'),
      deed: told?.text, deedGood: told?.good,
      other: p?.ties[0] ? people.get(p.ties[0].id)?.first : undefined,
      away: m && m.lastDay >= 0 ? h.day() - m.lastDay : -1,
    };
  };

  const convo = new Conversation({
    people, dialogue: h.dialogue, ctx, day: h.day, gold: h.gold, addGold: h.addGold, level: h.level,
    giftables: h.items, take: h.take, give: h.give, toast: h.toast,
    witnessed: (id) => {
      // Someone else close enough to see (the street, not behind closed doors).
      const me = h.npcs.find(id)?.pos ?? h.playerPos();
      return h.npcs.npcs.some((n) => n.rec.id !== id && n.actor && n.pos.distanceTo(me) < 14);
    },
  });

  // Speech bubbles over the people near you.
  const speakers = (): Speaker[] => {
    const out: Speaker[] = [];
    for (const n of h.npcs.npcs) {
      if (!n.actor || n.hidden) continue;
      out.push({ id: n.rec.id, head: n.pos.clone().setY(n.pos.y + (n.rec.look.height ?? 1.75) + 0.45), busy: h.npcs.engaged === n });
    }
    for (const t of h.townHeads()) if (t.visible) out.push({ id: t.id, head: t.head.clone().setY(t.head.y + 0.5), busy: h.dialogue.open && h.dialogue.speaker === h.townSpecs.find((s) => s.id === t.id)?.name });
    return out;
  };
  const barks = new Barks(people, h.camera, speakers, ctx, h.weaponOut);

  // Shop prices follow how the shopkeeper feels about you.
  const show = h.shopUI.show.bind(h.shopUI);
  h.shopUI.show = (o) => {
    const p = people.byName(o.speaker);
    if (!p) return show(o);
    const k = rep.priceMult(p.id), s = rep.sellMult(p.id);
    if (Math.abs(k - 1) < 0.01) return show(o);
    const rate = o.buyRate ? Object.fromEntries(Object.entries(o.buyRate).map(([kk, v]) => [kk, (v ?? 0) * s])) : { default: 0.35 * s };
    const note = k < 1 ? ` (A friend's price: ${Math.round((1 - k) * 100)}% off.)` : ` (They're charging you ${Math.round((k - 1) * 100)}% over the odds.)`;
    show({
      ...o,
      intro: o.intro + note,
      stock: o.stock.map(([id, price]) => [id, Math.max(1, Math.round(price * k))] as [string, number]),
      wants: o.wants?.map(([id, price]) => [id, Math.max(1, Math.round(price * s))] as [string, number]),
      buyRate: rate,
    });
  };

  /** Talk to anyone: their business (services) plus everything social. */
  const talk = (spec: ConvoSpec) => convo.open(spec);

  /** A line from a pool in someone's voice. */
  const line = (id: string, cat: string, extra: Record<string, string> = {}) => {
    const p = people.get(id);
    return p ? pickLine(cat, p, ctx(id), rep.memOf(id), extra) : '';
  };

  /** Quests: people who dislike you keep their work to themselves; rewards follow goodwill. */
  const hookQuests = (q: QuestLog) => {
    q.rewardMult = (g) => (people.has(g) ? rep.rewardMult(g) : 1);
    q.offerGate = (g) => {
      if (!people.has(g)) return null;
      const m = rep.moodOf(g);
      return m === 'hostile' || m === 'cold' || m === 'wary' ? line(g, 'refuse.quest') : null;
    };
    q.onDone = (d) => {
      if (d.contract) return;
      const p = people.get(d.giver);
      if (p) rep.act('questDone', { who: p.id, text: `you helped ${p.first} (${d.title})`, scale: d.main ? 1.5 : 1 });
    };
  };

  let lastHour = -1;
  return {
    line,
    hookQuests,
    people,
    rep,
    convo,
    barks,
    talk,
    ctx,
    townName,
    update(dt: number) {
      barks.update(dt, h.playerPos());
      // Rumours spread and people come home as the hours pass.
      const now = h.day() * 24 + h.hour();
      if (lastHour < 0) lastHour = now;
      if (now - lastHour >= 0.25) {
        rep.tick(now - lastHour);
        lastHour = now;
      }
    },
    save: () => rep.save(),
  };
}

export type Social = ReturnType<typeof setupSocial>;
