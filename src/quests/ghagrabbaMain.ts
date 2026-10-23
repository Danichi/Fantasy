import type { QuestDef, QuestLog } from './questLog';
import { GREAT_WELL, BONE_WELLS, EAST_GATE, WAYSTOP, DUNEWATCH, TARP_ROW, RUST_MARKET } from '../world/desert/ghagrabbaPlaces';

// The Outcast Sands: Ghagrabba's own story. The royals of the Sunborn rule
// the city and its wells; everyone outside the walls was thrown out to
// scavenge. The palace hires you to exterminate the scavengers. You kill
// some, and then one of them, Ishara of the Bone Wells, stops you, and shows
// you what the palace is doing. Then you choose: lead the outcasts' rebellion
// against the crown, or finish the purge for the Queen.

const R = 'Golden Expanse';
export const OUTCAST_CHAIN = ['os-1', 'os-2', 'os-3', 'os-4'];

export const OUTCAST_QUESTS: QuestDef[] = [
  {
    id: 'os-1', title: 'The Outcast Sands I: A Summons from the Throne', giver: 'mereth', region: R, main: true, requires: ['silk-road-west'],
    summary: 'The Vizier of Ghagrabba wants a word with the outlander who walked the Caravan Way alive.',
    offer: 'You. Outlander. The Vizier has heard you walked the Caravan Way and lived — the scavengers took the last two caravans. He wants to see you in the Palace of the Sun. Now, if you value his good opinion. Through the Court of the Sun, the great doors at the west end.',
    acceptLabel: 'Take me to the Vizier.',
    stages: [
      { note: 'Speak with Vizier Ankhet in the Palace of the Sun.', objectives: [{ type: 'talk', npc: 'ankhet', text: 'Speak with Vizier Ankhet (the Palace of the Sun)', reply: 'Captain Mereth said you wanted me.', say: 'The scavengers. Thieves, raiders, a plague of rags on our sand. They rob our caravans, they foul our roads, they crowd our gates begging for water we cannot spare. Her Radiance has a task for a blade with no friends in this desert. Kneel to her, and hear it.' }] },
      { note: 'Kneel before Queen Neferah in the throne room.', objectives: [{ type: 'talk', npc: 'neferah', text: 'Kneel before Queen Neferah on the Sun Throne', reply: 'Your Radiance.', say: 'Ankhet tells me you are good with a sword and short of scruples. Good. The sand-folk have forgotten whose desert this is. Remind them. Burn their camps, break their raiders, and the Sun Throne will make you rich. You have my leave — and my gold.' }] },
    ],
    done: 'Go with the sun, outlander. Come back with their blood on your blade.',
    rewards: { gold: 120, xp: 300 },
  },
  {
    id: 'os-2', title: 'The Outcast Sands II: Clearing the Sands', giver: 'ankhet', region: R, main: true, requires: ['os-1'],
    summary: 'The palace is paying you to kill scavengers. The raider camps around the city are full of them.',
    offer: '',
    stages: [
      { note: 'Kill scavengers in the raider camps around Ghagrabba.', objectives: [{ type: 'kill', kind: 'scavenger', count: 8, text: 'Kill scavengers in the raider camps (Glasswind, the Hulks, Saltreach, Rattle Hollow...)' }] },
      { note: 'Report to Vizier Ankhet.', objectives: [{ type: 'talk', npc: 'ankhet', text: 'Report to Vizier Ankhet (the Palace of the Sun)', reply: 'Eight of them are dead.', say: 'Eight fewer mouths at our wells. Good. But there is one more. A woman at the Bone Wells — they call her Ishara, a witch, a healer, it hardly matters. They listen to her. While she breathes they will keep crawling back. Go to the Bone Wells. Kill her.' }] },
    ],
    done: 'Her head will buy you a house in the city. Two, if you are quick.',
    rewards: { gold: 260, xp: 500 },
  },
  {
    id: 'os-3', title: 'The Outcast Sands III: The Woman at the Bone Wells', giver: 'ankhet', region: R, main: true, requires: ['os-2'],
    summary: 'The Vizier sent you to kill Ishara of the Bone Wells. She was waiting for you, and she did not reach for a weapon.',
    offer: '',
    stages: [
      { note: 'Go to the Bone Wells, south of the city, and find Ishara.', hook: 'os:ishara', objectives: [{ type: 'reach', at: BONE_WELLS, radius: 26, text: 'Go to the Bone Wells (south of Ghagrabba) and find Ishara' }] },
      { note: 'Face Ishara.', hook: 'os:ishara', objectives: [{ type: 'signal', id: 'os-ishara', text: 'Face Ishara by the dry well', at: BONE_WELLS }] },
      { note: 'Bring water for the Bone Wells\' children from the Waystop well.', hook: 'os:ishara', objectives: [
        { type: 'signal', id: 'os-water', text: 'Fill a waterskin at the Waystop well (east, on the Caravan Way)', at: WAYSTOP },
      ] },
      { note: 'Give the water to Ishara.', hook: 'os:ishara', objectives: [{ type: 'signal', id: 'os-water-given', text: 'Bring the water back to Ishara at the Bone Wells', at: BONE_WELLS }] },
      { note: 'See for yourself: look under the Great Well in the Court of the Sun.', hook: 'os:ishara', objectives: [{ type: 'signal', id: 'os-cistern', text: 'Look beneath the Great Well (the Court of the Sun)', at: GREAT_WELL }] },
    ],
    done: '',
    rewards: { gold: 0, xp: 700 },
  },
  {
    id: 'os-4', title: 'The Outcast Sands IV: Two Sands', giver: 'ankhet', region: R, main: true, requires: ['os-3'],
    summary: 'You have seen the palace\'s full cisterns and the outcasts\' dry wells. Ishara is waiting for your answer.',
    offer: '',
    stages: [
      { note: 'Go back to Ishara and choose.', hook: 'os:ishara', objectives: [{ type: 'signal', id: 'os-choice', text: 'Tell Ishara what you will do (the Bone Wells)', at: BONE_WELLS }] },
    ],
    done: '',
    rewards: { gold: 0, xp: 500 },
  },
  // ---- the rebellion -----------------------------------------------------------------------------
  {
    id: 'os-rebel', title: 'The Outcast Sands V: The Rising', giver: 'ishara', region: R, main: true, requires: ['os-4'],
    summary: 'You chose the outcasts. Rally the villages, break the Sun Guard at the gate, and make the Queen open the wells.',
    offer: '',
    stages: [
      { note: 'Rally the villages to Ishara\'s cause.', hook: 'os:rally', objectives: [
        { type: 'signal', id: 'os-rally-dunewatch', text: 'Rally Dunewatch (east, by the Caravan Way)', at: DUNEWATCH },
        { type: 'signal', id: 'os-rally-tarprow', text: 'Rally Tarp Row', at: TARP_ROW },
        { type: 'signal', id: 'os-rally-rust', text: 'Rally the Rust Market', at: RUST_MARKET },
      ] },
      { note: 'Storm the east gate: break the Sun Guard and Captain Mereth.', hook: 'os:gate', objectives: [
        { type: 'kill', kind: 'sunGuard', count: 6, text: 'Break the Sun Guard at the east gate', at: EAST_GATE, radius: 160 },
        { type: 'kill', kind: 'sunCaptain', count: 1, text: 'Defeat Captain Mereth', at: EAST_GATE, radius: 160 },
      ] },
      { note: 'Face Queen Neferah on the Sun Throne.', objectives: [{ type: 'talk', npc: 'neferah', text: 'Face Queen Neferah on the Sun Throne', reply: 'Open the wells.', say: '(The guards in the doorway look at you, at the sand-folk crowding the Court behind you, and lower their spears.) …So. This is how it ends, with a mob in my court and an outlander at my throne. Very well. The cisterns are opened. The gates are opened. Ankhet is in chains — he will be easier to blame than I am. I do not give up my crown. I give up the walls.' }] },
    ],
    done: 'The scavengers are coming home. Ishara sent this for you — she said you would know what it means.',
    rewards: { gold: 900, xp: 2200, items: [['twoSandsBlade', 1], ['scarabAmulet', 1]], guildRep: 40 },
  },
  // ---- the purge ---------------------------------------------------------------------------------
  {
    id: 'os-crown', title: 'The Outcast Sands V: The Purge', giver: 'ankhet', region: R, main: true, requires: ['os-4'],
    summary: 'You chose the crown. Finish what the Vizier asked: break the outcasts and kill Ishara.',
    offer: '',
    stages: [
      { note: 'Break the raider camps and kill Ishara at the Bone Wells.', hook: 'os:purge', objectives: [
        { type: 'kill', kind: 'scavenger', count: 12, text: 'Kill scavengers across the Expanse' },
        { type: 'kill', kind: 'ishara', count: 1, text: 'Kill Ishara at the Bone Wells', at: BONE_WELLS, radius: 140 },
      ] },
      { note: 'Return to Queen Neferah.', objectives: [{ type: 'talk', npc: 'neferah', text: 'Return to Queen Neferah on the Sun Throne', reply: 'It is done. Ishara is dead.', say: 'Then the sand is quiet. You have done what my own guard could not. Rise, outlander — Sword of the Sun Throne. The city is yours to walk as a lord. Do not think of what is outside the walls. Nobody here does.' }] },
    ],
    done: 'Take this from my own armoury. And this — a seal that opens any door in Ghagrabba.',
    rewards: { gold: 1600, xp: 2200, items: [['sunsteelScimitar', 1], ['sunSilkMantle', 1]], guildRep: 40 },
  },
];

/**
 * Chain the chapters: the summons opens once the Caravan Way's letter is
 * delivered, each chapter hands on to the next, and the choice picks the
 * last chapter. (Done hooks also run on load.)
 */
export function chainOutcast(quests: QuestLog, flags: Record<string, boolean | number | string>, onEnding: (ending: 'sand' | 'queen') => void) {
  quests.add(...OUTCAST_QUESTS);
  OUTCAST_CHAIN.forEach((id, k) => {
    const prev = quests.hooks.get(id + ':done');
    quests.hooks.set(id + ':done', (q) => {
      prev?.(q);
      const next = OUTCAST_CHAIN[k + 1];
      if (next) quests.accept(next);
      else quests.accept(flags.osPath === 'crown' ? 'os-crown' : 'os-rebel');
    });
  });
  quests.hooks.set('os-rebel:done', () => {
    flags.sbEnding = 'sand';
    onEnding('sand');
  });
  quests.hooks.set('os-crown:done', () => {
    flags.sbEnding = 'queen';
    onEnding('queen');
  });
}
