import type * as THREE from 'three';
import type { QuestDef, QuestLog } from './questLog';
import type { DialogueOption } from '../ui/dialogue';
import type { Player } from '../player/player';
import type { Interactable } from '../dungeon/instance';
import type { Look } from '../npc/charBuilder';

// Port Aurelle's Lower City underworld (World Expansion phase 5): the Guild
// of Quiet Hands, whose den lies under a trapdoor beside the Drowned Lantern.
// The door shows nothing until someone tells you about it. Below it is the
// undercity (world/interior.ts, kind 'undercity'): a tunnel along the old
// sewer channel, the den with Mother Sallow and Nix the fence, a canal landing
// for the smugglers' skiffs, and the flooded cistern behind an iron gate.
// Settling Aldric Aurelle's debt (in gold or in a favour owed) opens their
// black market; after that the Hands have work for you down there.

export const DEN_DEBT = 80;

export const LOWER_CITY_QUESTS: QuestDef[] = [
  {
    id: 'quiet-hands', title: 'The Guild of Quiet Hands', giver: 'corvina', region: 'portAurelle', requires: ['missing-heir'],
    summary: 'Aldric Aurelle owes the thieves of the Lower City. Find their den and settle his debt.',
    offer: 'The Quiet Hands. Of course it is. Find them and bring my son home. Whatever it costs — within reason, and without the Watch.',
    acceptLabel: 'I’ll find them.',
    stages: [
      { note: 'Ask Slick Marlo at the Drowned Lantern how to reach the Quiet Hands (evenings).', objectives: [{ type: 'talk', npc: 'marlo', text: 'Get the way in from Slick Marlo (evenings, by the Drowned Lantern)', reply: 'Lady Corvina wants her son back. How do I find the Quiet Hands?', say: 'You don’t. They find you. …Fine. The alley beside the Lantern. There’s a trapdoor with a little red hand on it. Knock twice and say the lantern is drowned. And I never spoke to you.' }] },
      { note: 'Find the trapdoor beside the Drowned Lantern and settle Aldric’s debt.', hook: 'quiet:door', objectives: [{ type: 'signal', id: 'aldric-freed', text: 'Settle Aldric’s debt in the Quiet Hands’ den', at: [2873.4, 300] }] },
      { note: 'Tell Lady Corvina her son is free.', objectives: [{ type: 'talk', npc: 'corvina', text: 'Tell Lady Corvina Aurelle', say: 'He came home an hour ago, pale as milk and swearing he will never touch a card again. Thank you. The Aurelles remember their friends.' }] },
    ],
    done: 'Aldric Aurelle is home. The Quiet Hands know your face now, and their black market is open to you.',
    rewards: { gold: 140, xp: 250 },
  },
];

/** The Quiet Hands' own jobs, once they know your face (after Aldric). */
export const UNDERCITY_QUESTS: QuestDef[] = [
  {
    id: 'cistern-rats', title: 'Rats in the Cistern', giver: 'sallow', region: 'portAurelle', requires: ['quiet-hands'],
    summary: 'Something big is breeding in the old cistern behind the Quiet Hands’ den. Mother Sallow wants it gone.',
    offer: 'The old cistern, through the gate. Rats. Not the little dock kind: the kind that ate half a sack of pepper and one of Nix’s boots. There’s a mother one, fat as a hound. Kill it and its brood and I’ll pay like honest folk.',
    acceptLabel: 'I’ll clear the cistern.',
    stages: [
      { note: 'Go through the iron gate at the back of the den and kill the rats in the old cistern.', objectives: [{ type: 'kill', kind: 'cistern-rat', count: 8, text: 'Kill the cistern rats and their mother' }] },
      { note: 'Tell Mother Sallow the cistern is clear.', objectives: [{ type: 'talk', npc: 'sallow', text: 'Tell Mother Sallow', say: 'Quiet again. Good. Here: honest pay, and don’t spread it about that we have any.' }] },
    ],
    done: 'The cistern is quiet. Mother Sallow pays in clean coin, which surprised everyone.',
    rewards: { gold: 110, xp: 220 },
  },
  {
    id: 'drowned-satchel', title: 'The Drowned Satchel', giver: 'nix', region: 'portAurelle', requires: ['quiet-hands'],
    summary: 'A courier of the Hands fled the Watch through the cistern and dropped his satchel in the water. Nix wants it back unopened.',
    offer: 'Little Pim came down the cistern with the Watch on his heels and lost the satchel in the dark. Far corner, past the pool. It’s oilskin, it’ll float in the muck. Bring it back and don’t read what’s inside. I’ll know.',
    acceptLabel: 'I’ll fish it out.',
    stages: [
      { note: 'Find the courier’s satchel in the far corner of the old cistern.', objectives: [{ type: 'signal', id: 'satchel-found', text: 'Fish the satchel out of the cistern' }] },
      { note: 'Bring the satchel to Nix, unopened.', objectives: [{ type: 'talk', npc: 'nix', text: 'Give the satchel to Nix', reply: 'Here. I didn’t open it.', say: 'Seal’s whole. You’re either honest or very good. Either way: good.' }] },
    ],
    done: 'Nix has his satchel, seal unbroken. The Hands remember a courier who keeps their mouth shut.',
    rewards: { gold: 75, xp: 160, items: [['greaterHealthPotion', 2]] },
  },
];

/** How the den's people look (built like the townsfolk). */
export const SALLOW_LOOK: Look = { body: 'female', outfit: 'ranger', hood: true, hair: 'long', hairColor: 0x9c9690, skin: 0xd9b89a, cloth: 0x3a2e40, linen: 0x6a5a58, height: 1.64 };
export const NIX_LOOK: Look = { body: 'male', outfit: 'peasant', hair: 'buzzed', beard: true, hairColor: 0x6a3a1c, skin: 0xc49070, cloth: 0x7a3a24, height: 1.72 };

/** The black market: better than the Grand Market on some things, and nobody asks. */
export const BLACK_MARKET: [string, number][] = [
  ['greaterHealthPotion', 42], ['greaterManaPotion', 46], ['duskbloom', 26], ['emberroot', 14], ['knightSword', 92], ['kiteShield', 76], ['ringSage', 165],
];

interface Deps {
  quests: QuestLog;
  player: Player;
  flags: Record<string, unknown>;
  door: THREE.Vector3;
  /** go down the trapdoor into the undercity */
  enter: () => void;
  talk: (who: string, title: string, text: string, opts: DialogueOption[]) => void;
  close: () => void;
  shop: (who: string, title: string, intro: string, stock: [string, number][]) => void;
  sell: (back: () => void) => DialogueOption[];
  save: () => void;
}

export function setupLowerCity(d: Deps) {
  const { quests, flags } = d;
  quests.add(...LOWER_CITY_QUESTS, ...UNDERCITY_QUESTS);
  quests.hooks.set('quiet:door', () => (flags.denKnown = true));
  quests.hooks.set('quiet-hands:done', () => {
    flags.denKnown = true;
    flags.aldricFreed = true;
  });
  const open = () => !!flags.aldricFreed || quests.isDone('quiet-hands');

  const den = () => {
    const show = (t: string, opts: DialogueOption[]) => d.talk('Mother Sallow', 'The Quiet Hands', t, opts);
    const back = () => den();
    const opts: DialogueOption[] = [...quests.options('sallow', show, back)];
    if (quests.wants('aldric-freed')) {
      opts.push({
        label: 'I’m here for Aldric Aurelle.',
        run: () => show(`The lordling. He owes us ${DEN_DEBT} gold and a great deal of pride. Pay the gold, or owe us a favour in his place. We always collect favours.`, [
          {
            label: `Pay his debt — ${DEN_DEBT}g`,
            run: () => {
              if (d.player.prog.gold < DEN_DEBT) return show(`${DEN_DEBT}, not a copper less. Come back when your purse agrees with you.`, [{ label: 'Back.', run: back }]);
              d.player.prog.addGold(-DEN_DEBT);
              free('Paid in full. Somebody fetch the boy. He can take the stairs this time.');
            },
          },
          { label: 'I’ll owe you a favour instead.', run: () => { flags.quietFavour = true; free('A favour, then. We will come asking one day, and you will not refuse. Somebody fetch the boy.'); } },
          { label: 'Not yet.', run: back },
        ]),
      });
    }
    opts.push({ label: 'Farewell.', run: () => d.close() });
    show(open()
      ? 'Mother Sallow does not look up from her ledger. “Well? Nix does the selling. I do the owing.”'
      : 'A grey-haired woman looks up from a ledger stamped with half the merchant marks in Cresha. “The lantern is drowned. So someone talked. Well, sit.”', opts);
  };
  /** Nix the fence, behind his stall in the den. */
  const nix = () => {
    const show = (t: string, opts: DialogueOption[]) => d.talk('Nix the Fence', 'Black Market of the Quiet Hands', t, opts);
    const back = () => nix();
    const opts: DialogueOption[] = [...quests.options('nix', show, back)];
    if (open()) {
      opts.push({ label: 'Let me see what fell off the wagons.', run: () => d.shop('Nix the Fence', 'Black Market of the Quiet Hands', 'Fell off a wagon, all of it. Very clumsy wagons, in this city.', BLACK_MARKET) });
      opts.push(...d.sell(back));
    }
    opts.push({ label: 'Farewell.', run: () => d.close() });
    show(open() ? 'Nix spreads his hands over the counter. “Everything’s legal down here. Just not up there.”' : '“Friend of Sallow’s? No? Then we haven’t met.” Nix goes back to counting spoons.', opts);
  };
  const free = (line: string) => {
    flags.aldricFreed = true;
    quests.signal('aldric-freed');
    d.save();
    d.talk('Mother Sallow', 'The Quiet Hands', line, [{ label: 'Back.', run: den }, { label: 'Farewell.', run: () => d.close() }]);
  };

  const trapdoor: Interactable = {
    pos: d.door, radius: 2,
    // Hidden: an unmarked alley until someone tells you where to knock.
    label: () => (flags.denKnown ? 'Knock twice on the trapdoor' : ''),
    enabled: () => !!flags.denKnown,
    action: d.enter,
  };
  return { interactables: [trapdoor], den, nix, open };
}
