import type * as THREE from 'three';
import type { QuestDef, QuestLog } from './questLog';
import type { DialogueOption } from '../ui/dialogue';
import type { Player } from '../player/player';
import type { Interactable } from '../dungeon/instance';

// Port Aurelle's Lower City underworld (World Expansion phase 5): the Guild
// of Quiet Hands, whose den lies under a trapdoor beside the Drowned Lantern.
// The door shows nothing until someone tells you about it. Settling Aldric
// Aurelle's debt (in gold or in a favour owed) opens their black market and
// Nix the fence, who pays over the odds for goods nobody asks about.

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

/** The black market: better than the Grand Market on some things, and nobody asks. */
export const BLACK_MARKET: [string, number][] = [
  ['greaterHealthPotion', 42], ['greaterManaPotion', 46], ['duskbloom', 26], ['emberroot', 14], ['knightSword', 92], ['kiteShield', 76], ['ringSage', 165],
];

interface Deps {
  quests: QuestLog;
  player: Player;
  flags: Record<string, unknown>;
  door: THREE.Vector3;
  talk: (who: string, title: string, text: string, opts: DialogueOption[]) => void;
  close: () => void;
  shop: (who: string, title: string, intro: string, stock: [string, number][]) => void;
  sell: (back: () => void) => DialogueOption[];
  save: () => void;
}

export function setupLowerCity(d: Deps) {
  const { quests, flags } = d;
  quests.add(...LOWER_CITY_QUESTS);
  quests.hooks.set('quiet:door', () => (flags.denKnown = true));
  quests.hooks.set('quiet-hands:done', () => {
    flags.denKnown = true;
    flags.aldricFreed = true;
  });
  const open = () => !!flags.aldricFreed || quests.isDone('quiet-hands');

  const den = () => {
    const show = (t: string, opts: DialogueOption[]) => d.talk('Mother Sallow', 'The Quiet Hands', t, opts);
    const back = () => den();
    const opts: DialogueOption[] = [];
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
    if (open()) {
      opts.push({ label: 'Browse the black market', run: () => d.shop('Nix the Fence', 'Black Market of the Quiet Hands', 'Fell off a wagon, all of it. Very clumsy wagons, in this city.', BLACK_MARKET) });
      opts.push(...d.sell(back));
    }
    opts.push({ label: 'Climb back up to the alley.', run: () => d.close() });
    show(open()
      ? 'Candle-smoke and brine. Nix waves from behind his crates; Mother Sallow does not look up from her ledger.'
      : 'You drop down a ladder into a low cellar lit by guttering candles. Crates stamped with half the merchant marks in Cresha line the walls. A grey-haired woman looks up from a ledger. “The lantern is drowned. So someone talked. Well, sit.”', opts);
  };
  const free = (line: string) => {
    flags.aldricFreed = true;
    quests.signal('aldric-freed');
    d.save();
    d.talk('Mother Sallow', 'The Quiet Hands', line, [{ label: 'Back.', run: den }, { label: 'Leave.', run: () => d.close() }]);
  };

  const trapdoor: Interactable = {
    pos: d.door, radius: 2,
    // Hidden: an unmarked alley until someone tells you where to knock.
    label: () => (flags.denKnown ? 'Knock twice on the trapdoor' : ''),
    enabled: () => !!flags.denKnown,
    action: den,
  };
  return { interactables: [trapdoor], den, open };
}
