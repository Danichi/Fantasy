import type { QuestDef, Objective } from './questLog';
import { FOREST_NODES as N } from '../world/elves/layout';
const talk = (npc: string, text: string, say: string): Objective => ({ type: 'talk', npc, text, say });
const signal = (id: string, text: string, at?: readonly [number, number]): Objective => ({
  type: 'signal',
  id: 'elf:' + id,
  text,
  ...(at ? { at: [...at] as [number, number] } : {}),
});
const report = (npc: string) => talk(npc, 'Return with your news.', 'The forest remembers deeds, not promises. You have earned its welcome.');
const make = (id: string, title: string, giver: string, offer: string, stages: QuestDef['stages'], rewards: QuestDef['rewards'], requires?: string[], main = false): QuestDef => ({
  id: 'elf-' + id,
  title,
  giver,
  region: 'verdantElves',
  summary: offer,
  offer,
  stages,
  done: 'Your deed is written into the living record of the forest.',
  rewards,
  requires: requires?.map((s) => 'elf-' + s),
  main,
});
export const ELF_QUESTS: QuestDef[] = [
  make(
    'marker',
    'The Marker Stone',
    'elf-nimri',
    'Beyond this stone, the paths remember where you meant to go. Ask for passage before entering the Verdant Woods.',
    [
      {
        note: 'Ask Nimri for passage. She waits on the Glen side of the Greenwood marker.',
        objectives: [
          talk(
            'elf-nimri',
            'Ask for passage into the woods.',
            'Keep to the lantern road. Thornwick lies beyond the northern hills. The marker will let you pass; hire me here if you need a guide.'
          ),
        ],
      },
    ],
    { gold: 80, xp: 350 },
    undefined,
    true
  ),
  make(
    'token',
    'The Guide’s Token',
    'elf-nimri',
    'Cleanse the Silver Spring and settle Thornwick’s quarrel. The Council will recognise a guide who mends what others break.',
    [
      {
        note: 'Nimri can guide you for one day. Follow the lantern road. Speak to Corwen about the loggers and clear the marked spring.',
        anyOrder: true,
        hook: 'elf:sync',
        objectives: [signal('clear:spring', 'Clear the spiders from Silver Spring.', N.spring), signal('dispute', 'Settle the Loggers’ Grievance with Corwen.', N.thornwick)],
      },
      { note: 'Return to Nimri at the Greenwood marker for your permanent token.', objectives: [report('elf-nimri')] },
    ],
    { gold: 250, xp: 1600, items: [['elfGuideToken', 1]] },
    ['marker'],
    true
  ),
  make(
    'council',
    'The Council of Leaves',
    'elf-lirael',
    'The World Tree has heard the wheel turn before. Climb the living stair and hear what the Council remembers of the fifth summon.',
    [
      {
        note: 'Read the three canopy archives. The spiral ramp begins at the World Tree’s southern root.',
        anyOrder: true,
        hook: 'elf:sync',
        objectives: [signal('archive:turning', 'Read the First Turning.'), signal('archive:summon', 'Read the Fifth Summon.'), signal('archive:roots', 'Read the roots’ warning.')],
      },
      {
        note: 'Speak to Elder Lirael on the canopy Council bough.',
        objectives: [
          talk(
            'elf-lirael',
            'Ask what the histories mean.',
            'The Sunwheel does not call a saviour. It calls a witness. The fifth summon broke the old pact; a wound under our roots now points towards the mountains and the desert. Heal the Elder before entering Starfall.'
          ),
        ],
      },
    ],
    { gold: 350, xp: 2000 },
    ['token'],
    true
  ),
  make(
    'blight',
    'What Takes Root',
    'elf-lirael',
    'The Blighted Elder bars the temple. Free the guardian from its sickness; watch the root lanes and the pulsing ground.',
    [
      {
        note: 'Defeat the Blighted Elder in the Ancient Forest. Recommended level 35.',
        hook: 'elf:sync',
        objectives: [signal('clear:elder', 'Free the Blighted Elder.', N.elder)],
      },
      { note: 'Tell Lirael that the temple ward has fallen.', objectives: [report('elf-lirael')] },
    ],
    { gold: 650, xp: 3500, items: [['elfSpiritAmber', 3]] },
    ['council'],
    true
  ),
  make(
    'starfall',
    'The Temple of Starfall',
    'elf-lirael',
    'The temple keeps a map of the sky before the first Turning. Align its light and bring back the Star Chart from its guardian.',
    [
      {
        note: 'Enter the Temple of Starfall, solve its two light seals, and defeat Asterion. Recommended level 38–40.',
        hook: 'elf:sync',
        anyOrder: true,
        objectives: [
          signal('temple', 'Defeat the Last Starwarden.', N.temple),
          { type: 'collect', item: 'elfStarChart', count: 1, text: 'Recover the Starfall Chart from the chamber beyond the guardian.' },
        ],
      },
      { note: 'Take the chart to Lirael.', objectives: [report('elf-lirael')] },
    ],
    { gold: 900, xp: 4500, items: [['elfStarward', 1]] },
    ['blight'],
    true
  ),
  make(
    'stars',
    'What the Stars Say',
    'elf-sylwen',
    'Bring the Starfall Chart to Moonlight Glade after dusk. Sylwen can read the old constellations.',
    [
      {
        note: 'Meet Sylwen in Moonlight Glade between 20:00 and 05:00. A nearby shelter lets you wait until dusk.',
        objectives: [
          { type: 'hour', from: 20, to: 5, text: 'Wait for the moon to rise.' },
          talk(
            'elf-sylwen',
            'Ask Sylwen to interpret the Starfall Chart.',
            'Two bearings: the roots descend beneath the White Mountains; the broken wheel’s other half sleeps beyond the desert. If you have already walked those roads, you know these are pieces of the same wound. The chart confirms what you found; it does not undo it.'
          ),
        ],
      },
    ],
    { gold: 700, xp: 4000, items: [['elfSpiritAmber', 4]] },
    ['starfall'],
    true
  ),
  make(
    'loggers',
    'The Loggers’ Grievance',
    'elf-corwen',
    'Corwen needs timber; the elves need the old grove left standing. Put a lasting settlement to both sides.',
    [
      {
        note: 'Hear Thessaly’s account in Silverbough.',
        objectives: [
          talk('elf-thessaly', 'Hear the grovekeeper’s terms.', 'The living grove must stand. We can offer fallen timber from the southern concession if Corwen marks every cut.'),
        ],
      },
      {
        note: 'Choose an agreement with Corwen. Both choices grant passage and remain in your save.',
        objectives: [
          {
            type: 'choose',
            npc: 'elf-corwen',
            key: 'agreement',
            text: 'Settle the logging dispute.',
            prompt: 'Close the old operation, or work only the fallen southern timber?',
            options: [
              { id: 'withdraw', label: 'Withdraw from the old grove.', say: 'We will dismantle the cutting camp. The mill can turn grain until the woods recover.' },
              { id: 'concession', label: 'Accept the marked fallen-timber concession.', say: 'No living ironbark. No sacred trees. Our sawyers will keep the elves’ marks.' },
            ],
          },
        ],
      },
    ],
    { gold: 220, xp: 1000, items: [['elfHeartwood', 4]] }
  ),
  make(
    'webs',
    'Webs in the Spring',
    'elf-thessaly',
    'The spring no longer reaches our gardens. Remove the spiders and bring back its clear water.',
    [
      { note: 'Clear the Silver Spring encounter.', hook: 'elf:sync', objectives: [signal('clear:spring', 'Clear the Silver Spring.', N.spring)] },
      { note: 'Tell Thessaly the water runs freely.', objectives: [report('elf-thessaly')] },
    ],
    { gold: 180, xp: 1200, items: [['elfMoonblossom', 2]] }
  ),
  make(
    'fox',
    'The Fox Who Stole the Moon',
    'elf-faelan',
    'A spirit fox has taken my moonstone. It means to be followed, not hunted. Read the pawprint stones beyond Silverbough.',
    [
      { note: 'Follow the fox through its three pawprint stones.', hook: 'elf:sync', objectives: [signal('fox', 'Recover the bowyer’s moonstone.', N.fox)] },
      { note: 'Return Faelan’s moonstone.', objectives: [report('elf-faelan')] },
    ],
    {
      gold: 140,
      xp: 1200,
      items: [
        ['elfSilverboughBow', 1],
        ['elfIronbark', 3],
      ],
    }
  ),
  make(
    'hunter',
    'A Hunter out of Time',
    'elf-faelan',
    'Eryndis went after a blighted pack and never returned. Find her trail west of Silver Spring.',
    [
      { note: 'Defeat the pack surrounding the lost hunter’s camp.', hook: 'elf:sync', objectives: [signal('clear:hunter', 'Rescue Eryndis and recover her journal.', N.hunter)] },
      { note: 'Return her trail journal to Faelan.', objectives: [report('elf-faelan')] },
    ],
    { gold: 250, xp: 1500, items: [['elfTrailRation', 3]] }
  ),
  make(
    'song',
    'A Song for the World Tree',
    'elf-lirael',
    'The oldest root harps have fallen silent. Give them leaf, rain and starlight, in that order.',
    [
      { note: 'Play the root harps in the Ancient Forest: leaf, rain, starlight.', hook: 'elf:sync', objectives: [signal('song', 'Restore the First Song.', N.song)] },
      { note: 'Tell Lirael the song has returned.', objectives: [report('elf-lirael')] },
    ],
    { gold: 280, xp: 1800, items: [['elfSpiritAmber', 2]] }
  ),
  make(
    'bloom',
    'The Night Bloom',
    'elf-sylwen',
    'Moonblossoms open beside the glade only after dusk. Gather three without disturbing their roots.',
    [
      {
        note: 'Gather night blossoms after 20:00; the patch replenishes each day.',
        objectives: [
          {
            type: 'deliver',
            npc: 'elf-sylwen',
            item: 'elfMoonblossom',
            count: 3,
            text: 'Bring three moonblossoms to Sylwen.',
            say: 'Their light is borrowed, and now returned. I can teach you to hold it without fear.',
          },
        ],
      },
    ],
    { gold: 240, xp: 1500, items: [['elfSpiritAmber', 2]] }
  ),
  {
    ...make(
      'name',
      'A Name Among the Leaves',
      'elf-lirael',
      'An elf returning to the old homeland is asked to learn its memories before adding a name to them.',
      [
        {
          note: 'Restore the First Song and read the canopy archive of roots.',
          hook: 'elf:sync',
          anyOrder: true,
          objectives: [signal('song', 'Restore the First Song.', N.song), signal('archive:roots', 'Read the living archive.')],
        },
        {
          note: 'Speak your name before the Council.',
          objectives: [
            talk(
              'elf-lirael',
              'Speak your name among the leaves.',
              'We do not ask you to become who you were. Your name is welcome here as you are. The bough you left is still yours.'
            ),
          ],
        },
      ],
      { gold: 300, xp: 2000, items: [['elfStarward', 1]] }
    ),
  },
];
