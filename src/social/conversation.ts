import type { DialogueOption, DialogueUI, Tone } from '../ui/dialogue';
import { CAST, type PersonalTopic } from './cast';
import { greetFor, LINES, pickLine, type LineCtx } from './lines';
import type { People } from './people';
import { giftKind, type GiftKind, type Profile } from './profile';
import { MOOD_NAME, type Mood } from './reputation';

// A conversation with anyone (NPC overhaul, phase 1). It opens with a
// greeting built from how they feel about you, what they remember, the hour,
// the weather and what the town is saying; then their business (quests,
// wares, services), and the social side: small talk that goes deeper as they
// warm to you, things to say in a tone of your choosing, gifts, apologies,
// persuasion, bribes and threats. Everything you say is remembered.

const MOODS: Mood[] = ['hostile', 'cold', 'wary', 'neutral', 'warm', 'friend', 'devoted'];
const atLeast = (m: Mood, min: Mood) => MOODS.indexOf(m) >= MOODS.indexOf(min);

export interface GiftItem {
  id: string;
  name: string;
  kind: string;
  qty: number;
}

/** What the game lends a conversation. */
export interface ConvoHost {
  people: People;
  dialogue: DialogueUI;
  ctx(id: string): LineCtx;
  day(): number;
  gold(): number;
  addGold(n: number): void;
  level(): number;
  giftables(): GiftItem[];
  take(id: string, n: number): void;
  give(id: string, n: number): void;
  toast(msg: string): void;
  /** nearby people saw it (for crimes and threats in the street) */
  witnessed?(id: string): boolean;
  /** a conversation touched someone (for talking animations) */
  talking?(id: string, seconds: number): void;
}

export interface ConvoSpec {
  id: string;
  name: string;
  title: string;
  /** their own introduction, the first time you meet */
  intro?: string;
  /** a story beat they want to tell you about (takes the place of small talk in the greeting) */
  story?: string;
  /** their business: quests, wares, services (hidden from people they refuse) */
  services: DialogueOption[];
  /** things to ask them about (the old topics) */
  topics?: { q: string; a: string }[];
  /** the next piece of news they have */
  news?: () => string;
  /** reopen this conversation at the top (services call this to come back) */
  back: () => void;
  /** say this instead of a greeting (a mentor's answer, say) */
  say?: string;
}

const FOLLOW: Record<string, string[]> = {
  folksy: ['Anything else, then?', 'What else can I do for you?', 'Go on.'],
  gruff: ['What else?', 'Hm?', 'Something else?'],
  formal: ['Is there anything further?', 'What else may I do for you?', 'Yes?'],
  flowery: ['And what else, my dear?', 'Something more?', 'Do go on.'],
  blunt: ['Well?', 'Next.', 'What else.'],
  nervous: ['Um. Was there something else?', 'Yes? Sorry. Yes?', 'Is that all? Not that I\'m hurrying you.'],
  cheery: ['What else? Ask me anything!', 'Anything else?', 'Mm-hm?'],
};

/** Gift item ids a person loves above all (their favourite thing, by kind). */
const loved = (p: Profile): GiftKind | undefined => p.likes[0];

export class Conversation {
  /** who the current conversation is with (the greeting is kept while it lasts) */
  private cur: { id: string; text: string } | null = null;
  /** a refusal got past (a bribe), for this conversation only */
  private served = new Set<string>();

  constructor(private h: ConvoHost) {}

  private get rep() {
    return this.h.people.rep;
  }

  private moodChip(id: string) {
    const m = this.rep.moodOf(id);
    return { label: this.rep.fears(id) ? 'Afraid' : MOOD_NAME[m], cls: this.rep.fears(id) ? 'afraid' : m };
  }

  private show(spec: ConvoSpec, text: string, opts: DialogueOption[]) {
    this.h.dialogue.mood = { speaker: spec.name, ...this.moodChip(spec.id) };
    this.h.dialogue.show(spec.name, spec.title, text, opts);
    this.h.talking?.(spec.id, 1 + text.length / 60);
  }

  private line(cat: string, p: Profile, extra: Record<string, string> = {}) {
    return pickLine(cat, p, this.h.ctx(p.id), this.rep.memOf(p.id), extra);
  }

  /** Open (or return to) a conversation. */
  open(spec: ConvoSpec) {
    const p = this.h.people.get(spec.id);
    if (!p) return void this.h.dialogue.show(spec.name, spec.title, spec.intro ?? 'Hello.', [...spec.services, { label: 'Farewell.', run: () => this.close() }]);
    const continuing = this.h.dialogue.open && this.cur?.id === spec.id;
    if (!continuing) this.served.delete(spec.id);
    const text = spec.say ?? (continuing ? this.follow(p) : this.greet(spec, p));
    this.cur = { id: spec.id, text };
    if (this.rep.refuses(spec.id) && !this.served.has(spec.id)) return this.refusal(spec, p, text);
    this.show(spec, text, this.menu(spec, p));
  }

  close() {
    this.cur = null;
    this.h.dialogue.close();
  }

  private follow(p: Profile) {
    const pool = FOLLOW[p.voice] ?? FOLLOW.folksy;
    return pool[(this.rep.memOf(p.id).said.length + p.id.length) % pool.length];
  }

  /** The opening words: who they are to you, and what's on their mind. */
  private greet(spec: ConvoSpec, p: Profile) {
    const m = this.rep.memOf(p.id);
    const c = this.h.ctx(p.id);
    const today = this.h.day();
    const first = m.met === 0;
    const firstToday = m.lastDay !== today;
    m.met++;
    m.lastDay = today;
    if (this.rep.fears(p.id) && !this.rep.refuses(p.id)) return this.line('bark.fear', p);
    if (first) return spec.intro ?? this.line('greet.first', p);
    const mood = this.rep.moodOf(p.id);
    const parts = [this.line(greetFor(mood), p)];
    if (spec.story) parts.push(spec.story);
    else if (firstToday) {
      // One thing on their mind: you've been away, the weather, the hour, or what you did.
      const deed = this.rep.told.find((t) => t.community === this.h.people.communityFor(p.id) || t.community === 'roads');
      const heard = deed && today - deed.day <= 3 && !m.said.includes('deed:' + deed.text);
      if (heard) {
        m.said.push('deed:' + deed.text);
        parts.push(this.line(deed.good ? 'greet.goodDeed' : 'greet.badDeed', p, { deed: deed.text }));
      } else if (c.away >= 3) parts.push(this.line('greet.back', p));
      else if (c.rain) parts.push(this.line('greet.rain', p));
      else if (c.hour >= 5 && c.hour < 9) parts.push(this.line('greet.morning', p));
      else if (c.hour >= 18 && c.hour < 22) parts.push(this.line('greet.evening', p));
      else if (c.hour >= 22 || c.hour < 5) parts.push(this.line('greet.night', p));
      // Friends bring you things now and then.
      const gift = atLeast(mood, 'friend') && today - (m.lastGiftFrom ?? -99) >= 3 ? this.keepsake(p) : null;
      if (gift) {
        m.lastGiftFrom = today;
        this.h.give(gift.id, gift.n);
        parts.push(gift.say);
      }
    }
    return parts.filter(Boolean).join(' ');
  }

  /** Something a friend presses into your hands (by what they do for a living). */
  private keepsake(p: Profile): { id: string; n: number; say: string } | null {
    const k = (p.id.length + this.h.day()) % 3;
    if (k !== 0) return null;
    const byJob: Record<string, [string, number, string]> = {
      farmer: ['apple', 3, 'Here, take a few apples for the road. Off my own trees.'],
      herbalist: ['healthPotion', 1, 'I made one extra. Take it. No, I insist.'],
      innfolk: ['healthPotion', 1, 'On the house. Don\'t tell the others.'],
      smith: ['healthPotion', 1, 'Brannoc\'s lot left this at the forge. You\'ll get more use of it.'],
      child: ['apple', 1, 'I saved you an apple! I only took one bite. Two.'],
    };
    const [id, n, say] = byJob[p.job] ?? ['healthPotion', 1, 'I\'ve been meaning to give you this. For luck.'];
    return { id, n, say };
  }

  /** People who won't deal with you: you can apologise, pay, or go. */
  private refusal(spec: ConvoSpec, p: Profile, greeting: string) {
    const opts: DialogueOption[] = [];
    const m = this.rep.memOf(p.id);
    const today = this.h.day();
    const text = `${greeting} ${this.line('refuse.service', p)}`;
    if (m.apologyDay !== today) opts.push({ label: 'I\'m sorry. Truly.', tone: 'kind', run: () => this.apologise(spec, p) });
    const price = this.bribePrice(p) * 2;
    if (p.traits.greed > -0.2 && this.h.gold() >= price) opts.push({
      label: `(Press ${price} gold into their hand.) Just this once.`, tone: 'bribe', run: () => {
        if (p.traits.honesty > 0.55) {
          this.rep.act('rude', { who: p.id });
          return this.show(spec, this.line('bribe.no', p), [{ label: 'Farewell.', run: () => this.close() }]);
        }
        this.h.addGold(-price);
        this.rep.act('bribe', { who: p.id });
        this.served.add(p.id);
        this.cur = { id: p.id, text: this.line('bribe.ok', p) };
        this.show(spec, this.cur.text, this.menu(spec, p));
      },
    });
    const amends = this.amends(spec, p);
    if (amends) opts.push(amends);
    opts.push({ label: 'Farewell.', run: () => this.close() });
    this.show(spec, text, opts);
  }

  /** The top of the conversation: their business, then the social side. */
  private menu(spec: ConvoSpec, p: Profile): DialogueOption[] {
    const m = this.rep.memOf(p.id);
    const mood = this.rep.moodOf(p.id);
    const opts: DialogueOption[] = [...spec.services];
    opts.push({ label: 'Let\'s talk.', run: () => this.talk(spec, p, this.chatOpener(p)) });
    opts.push({ label: 'Say something...', run: () => this.say(spec, p) });
    if (this.h.giftables().length) opts.push({ label: 'I brought you something.', tone: 'gift', run: () => this.gifts(spec, p) });
    if ((m.insults > 0 || m.threats > 0 || MOODS.indexOf(mood) <= MOODS.indexOf('wary')) && m.apologyDay !== this.h.day()) {
      opts.push({ label: 'About before... I\'m sorry.', tone: 'kind', run: () => this.apologise(spec, p) });
    }
    const amends = this.amends(spec, p);
    if (amends) opts.push(amends);
    opts.push({ label: 'Farewell.', run: () => this.close() });
    return opts;
  }

  /** Elders and priests take amends for the whole town (a gift to the poor). */
  private amends(spec: ConvoSpec, p: Profile): DialogueOption | null {
    const c = this.h.people.communityFor(p.id);
    if (!(p.job === 'elder' || p.job === 'priest' || p.id === 'maud' || p.id === 'priestess') || this.rep.standingOf(c) >= -60) return null;
    const cost = Math.round(60 + Math.min(600, -this.rep.standingOf(c)) * 0.6);
    const town = this.h.ctx(p.id).town;
    return {
      label: `I want to make amends to ${town}. (${cost} gold to the poor box)`, tone: 'kind', run: () => {
        if (this.h.gold() < cost) return this.show(spec, 'Words are a start. Come back when you can put something behind them.', [{ label: 'Farewell.', run: () => this.close() }]);
        this.h.addGold(-cost);
        this.rep.act('atonement', { who: p.id, community: c, text: `you gave ${cost} gold to the poor of ${town}` });
        this.show(spec, 'It will feed a good many people this winter. It won\'t undo what was done. But it\'s a beginning, and people will hear of it.', [{ label: 'Farewell.', run: () => this.close() }]);
      },
    };
  }

  private chatOpener(p: Profile) {
    const mood = this.rep.moodOf(p.id);
    if (atLeast(mood, 'friend')) return ['For you? Always. What\'s on your mind?', 'Pull up a seat. What is it?', 'Ask me anything.'][p.id.length % 3];
    if (!atLeast(mood, 'neutral')) return ['Make it quick.', 'What.', 'I\'ve a minute. Barely.'][p.id.length % 3];
    return ['What would you like to know?', 'Ask away.', 'I have a minute. What is it?', 'Go on, then.'][(p.id.length + this.rep.memOf(p.id).met) % 4];
  }

  // ---- small talk ----------------------------------------------------------------
  private talk(spec: ConvoSpec, p: Profile, text: string, page = 0) {
    const mood = this.rep.moodOf(p.id);
    const again = (t: string) => this.talk(spec, p, t);
    const fixed: DialogueOption[] = [];
    fixed.push({ label: 'Tell me about yourself.', run: () => again(atLeast(mood, 'wary') ? p.about : this.line('refuse.secret', p)) });
    fixed.push({
      label: 'What do you want most, if you could have anything?', run: () => {
        if (!atLeast(mood, 'neutral')) return again(this.line('refuse.secret', p));
        again(this.line('small.want', p));
      },
    });
    fixed.push({ label: 'Is there anything you\'d not tell just anyone?', run: () => this.secret(spec, p) });
    // Then their own topics (some only once they trust you), the old ones, the news, the people in their life.
    const extra: DialogueOption[] = [];
    if (spec.news) extra.push({ label: 'Heard any news?', run: () => again(spec.news!()) });
    const personal: PersonalTopic[] = CAST[p.id]?.topics ?? [];
    for (const t of personal) if (!t.min || atLeast(mood, t.min)) extra.push({ label: t.q, run: () => again(t.a) });
    for (const t of spec.topics ?? []) extra.push({ label: t.q, run: () => again(t.a) });
    for (const t of p.ties.filter((t) => this.h.people.present(t.id)).slice(0, 2)) {
      const o = this.h.people.get(t.id);
      if (o) extra.push({ label: `What do you make of ${o.first}?`, run: () => again(this.line('tie.' + t.bond, p, { other: o.first, bond: t.bond })) });
    }
    extra.push({ label: `How are things in ${this.h.ctx(p.id).town}?`, run: () => again(this.line('small.town', p)) });
    extra.push({ label: 'What do people say about me?', run: () => again(this.aboutYou(p)) });
    // Nine replies at most (one per number key): the rest go on a second page.
    const PAGE = 5;
    const pages = Math.max(1, Math.ceil(extra.length / (PAGE - 1)));
    const pg = Math.min(page, pages - 1);
    const shown = extra.length <= PAGE ? extra : extra.slice(pg * (PAGE - 1), pg * (PAGE - 1) + PAGE - 1);
    const more: DialogueOption[] = extra.length > PAGE ? [{ label: 'Something else...', run: () => this.talk(spec, p, text, (pg + 1) % pages) }] : [];
    this.show(spec, text, [...(pg === 0 ? fixed : []), ...shown, ...more, { label: 'Back.', run: () => spec.back() }]);
  }

  /** What the town says about you, as they'd put it. */
  private aboutYou(p: Profile) {
    const c = this.h.people.communityFor(p.id);
    const tier = this.rep.tierOf(c);
    const town = this.h.ctx(p.id).town;
    const said = this.rep.told.find((t) => t.community === c)?.text;
    const head = {
      hated: `Honestly? Folk in ${town} would sooner spit than say your name.`,
      distrusted: `People in ${town} keep an eye on you. A wary one.`,
      neutral: `Not much, yet. You're just another face passing through ${town}.`,
      liked: `They like you in ${town}. You've done right by us.`,
      respected: `You're well thought of round here. People stand a bit straighter when you pass.`,
      honoured: `In ${town}? They'll be naming children after you before long.`,
    }[tier];
    const bounty = this.rep.bountyOf(c);
    return [head, said ? `Last I heard, ${said}.` : '', bounty > 0 ? `And the Watch is asking after you. ${bounty} gold's worth of asking.` : ''].filter(Boolean).join(' ');
  }

  /** Their secret: friends tell you; others can be talked round, paid or scared. */
  private secret(spec: ConvoSpec, p: Profile) {
    const m = this.rep.memOf(p.id);
    const mood = this.rep.moodOf(p.id);
    const tell = () => {
      m.confided = true;
      this.talk(spec, p, this.line('small.secret', p));
    };
    if (m.confided || atLeast(mood, 'friend')) return tell();
    const today = this.h.day();
    const opts: DialogueOption[] = [];
    if (m.persuadeDay !== today) opts.push({
      label: 'You can trust me. I won\'t tell a soul.', tone: 'persuade', run: () => {
        m.persuadeDay = today;
        if (Math.random() < this.persuadeChance(p)) {
          this.rep.act('persuaded', { who: p.id });
          this.h.toast('Persuaded');
          return tell();
        }
        this.rep.nudge(p.id, -2);
        this.talk(spec, p, this.line('persuade.fail', p));
      },
    });
    const price = this.bribePrice(p);
    if (this.h.gold() >= price) opts.push({
      label: `(Slide ${price} gold across.) Maybe this helps.`, tone: 'bribe', run: () => {
        if (p.traits.greed < -0.1 || p.traits.honesty > 0.6) {
          this.rep.act('rude', { who: p.id, scale: 0.6 });
          return this.talk(spec, p, this.line('bribe.no', p));
        }
        this.h.addGold(-price);
        this.rep.act('bribe', { who: p.id });
        tell();
      },
    });
    opts.push({
      label: 'Tell me. Now.', tone: 'threat', run: () => {
        const yields = !p.child && p.traits.courage < 0.1;
        this.threat(p);
        if (yields) return tell();
        this.talk(spec, p, this.line(p.child ? 'react.childThreat' : 'react.threat', p));
      },
    });
    opts.push({ label: 'Never mind.', run: () => this.talk(spec, p, this.chatOpener(p)) });
    this.show(spec, this.line('refuse.secret', p), opts);
  }

  private persuadeChance(p: Profile) {
    const d = this.rep.dispOf(p.id);
    return Math.max(0.1, Math.min(0.9, 0.3 + this.h.level() * 0.015 + d / 150 - p.traits.honesty * 0.15 + p.traits.warmth * 0.1));
  }

  private bribePrice(p: Profile) {
    return Math.round(15 + Math.max(0, p.traits.greed) * 30 + (p.job === 'noble' ? 60 : p.job === 'merchant' ? 15 : 0));
  }

  private threat(p: Profile) {
    const seen = this.h.witnessed?.(p.id) ?? true;
    this.rep.act('threat', { who: p.id, scale: p.child ? 2.5 : 1, seen, text: p.child ? `you threatened a child, ${p.first}` : undefined });
  }

  // ---- saying something, in a tone ----------------------------------------------
  private say(spec: ConvoSpec, p: Profile) {
    const pick = (cat: string) => {
      const pool = LINES[cat] as string[];
      const k = (this.rep.memOf(p.id).met * 3 + p.id.length + this.h.day()) % pool.length;
      return pool[k].replace(/\{town\}/g, this.h.ctx(p.id).town);
    };
    const kindLine = pick('you.kind'), rudeLine = pick('you.rude'), threatLine = pick('you.threat');
    const react = (t: string) => this.show(spec, t, [{ label: 'Back.', run: () => spec.back() }, { label: 'Farewell.', run: () => this.close() }]);
    this.show(spec, this.follow(p), [
      {
        label: kindLine, tone: 'kind', run: () => {
          const m = this.rep.memOf(p.id);
          const today = this.h.day();
          if (m.kindDay === today) {
            this.rep.nudge(p.id, -1);
            return react(['You said that already. But thank you.', 'Twice in a day? Now I\'m suspicious.', 'Hm. Yes. You mentioned.'][p.id.length % 3]);
          }
          m.kindDay = today;
          m.lastTone = 'kind';
          this.rep.act('kind', { who: p.id });
          react(this.line('react.kind', p));
        },
      },
      {
        label: rudeLine, tone: 'rude', run: () => {
          this.rep.memOf(p.id).lastTone = 'rude';
          this.rep.act('rude', { who: p.id, seen: this.h.witnessed?.(p.id) });
          react(this.line('react.rude', p));
        },
      },
      {
        label: threatLine, tone: 'threat', run: () => {
          this.rep.memOf(p.id).lastTone = 'threat';
          this.threat(p);
          react(this.line(p.child ? 'react.childThreat' : 'react.threat', p));
        },
      },
      { label: 'Never mind.', run: () => spec.back() },
    ]);
  }

  // ---- gifts and apologies ------------------------------------------------------
  private gifts(spec: ConvoSpec, p: Profile) {
    const items = this.h.giftables().slice(0, 8);
    this.show(spec, 'For me?', [
      ...items.map((it) => ({ label: `${it.name}${it.qty > 1 ? ` (${it.qty})` : ''}`, tone: 'gift' as Tone, run: () => this.give(spec, p, it) })),
      { label: 'Never mind.', run: () => spec.back() },
    ]);
  }

  private give(spec: ConvoSpec, p: Profile, it: GiftItem) {
    const m = this.rep.memOf(p.id);
    const today = this.h.day();
    const kind = giftKind(it.id, it.kind);
    this.h.take(it.id, 1);
    m.gifts++;
    let cat: string;
    if (m.giftDay === today) {
      // Only the first gift of the day really lands.
      this.rep.act('gift', { who: p.id, scale: 0.25 });
      cat = 'gift.tooMany';
    } else if (kind && kind === loved(p)) {
      this.rep.act('giftLoved', { who: p.id });
      cat = 'gift.loved';
    } else if (kind && p.likes.includes(kind)) {
      this.rep.act('gift', { who: p.id });
      cat = 'gift.liked';
    } else if (kind && p.dislikes.includes(kind)) {
      this.rep.act('giftDisliked', { who: p.id });
      cat = 'gift.disliked';
    } else {
      this.rep.act('gift', { who: p.id, scale: 0.4 });
      cat = 'gift.neutral';
    }
    m.giftDay = today;
    this.show(spec, this.line(cat, p, { item: it.name }), [{ label: 'Back.', run: () => spec.back() }, { label: 'Farewell.', run: () => this.close() }]);
  }

  private apologise(spec: ConvoSpec, p: Profile) {
    const m = this.rep.memOf(p.id);
    m.apologyDay = this.h.day();
    // Warm, forgiving people take it; hot-tempered people who've been threatened twice don't.
    const grudge = m.threats * 0.25 + m.insults * 0.08 - p.traits.warmth * 0.3 + p.traits.temper * 0.2;
    const ok = Math.random() > Math.max(0.1, Math.min(0.85, 0.35 + grudge));
    if (ok) {
      this.rep.act('apology', { who: p.id });
      m.insults = Math.max(0, m.insults - 1);
      m.threats = Math.max(0, m.threats - 1);
    }
    const text = this.line(ok ? 'apology.ok' : 'apology.no', p);
    if (ok && this.rep.refuses(p.id)) return this.show(spec, text, [{ label: 'Farewell.', run: () => this.close() }]);
    this.cur = { id: p.id, text };
    if (this.rep.refuses(p.id)) return this.show(spec, text, [{ label: 'Farewell.', run: () => this.close() }]);
    this.show(spec, text, this.menu(spec, p));
  }
}
