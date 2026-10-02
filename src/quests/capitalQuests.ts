import type { QuestDef } from './questLog';
import { EAST_GATE, TEMPLE, COLLEGIUM, PALACE } from '../world/capitalCity';

// The Royal Capital's quests (World Expansion phase 8): Act III of the main
// story, "The Crown's Summons" (an audience with King Aldric, and what the
// Royal Library and the Temple of the Dawn know of the Sunwheel and the
// summoned), and the city's own threads: the tourney at the Silver Lance,
// the Chancery's famous paperwork, letters between nations, the Collegium's
// first test, and the crystal that hums at night.

const outFrom = (p: [number, number], d: number): [number, number] => {
  const dx = p[0] - PALACE[0], dz = p[1] - PALACE[1], l = Math.hypot(dx, dz);
  return [p[0] + (dx / l) * d, p[1] + (dz / l) * d];
};

export const CAPITAL_QUESTS: QuestDef[] = [
  // ---- Main story: Act III ------------------------------------------------------------------
  {
    id: 'crown-summons', title: 'The Crown’s Summons', giver: 'marrow', region: 'portAurelle', main: true, requires: ['academy-oath'],
    summary: 'A rider in royal blue has brought a sealed letter to the Academy: King Aldric IV wishes to meet the summoned hero.',
    offer: 'A Crown rider came in at dawn with this. The King’s own seal. He wants to see you, Squire, in the Royal Capital. Take the King’s Road back to Elder Glen, then the Crown Road west; the checkpoint will let a registered cadet through. Present yourself at the East Gate. And for pity’s sake, bow.',
    acceptLabel: 'To the capital.',
    stages: [
      { note: 'Take the Crown Road west to the Royal Capital.', objectives: [{ type: 'reach', at: [EAST_GATE[0] + 30, EAST_GATE[1]], radius: 40, text: 'Reach the Royal Capital’s East Gate' }] },
      { note: 'Show the King’s letter to the Captain of the Crown Guard.', objectives: [{ type: 'talk', npc: 'crownCaptain', text: 'Show the letter to Captain Mara Thorne', reply: 'The King summoned me.', say: 'The King’s seal. Then you’re expected. Up the Royal Avenue, both ramps, to the palace. The King holds court in the Throne Hall. You’ll know it: it’s the one with the throne.' }] },
      { note: 'Climb the Royal Avenue and present yourself to King Aldric in the Throne Hall.', objectives: [{ type: 'talk', npc: 'king', text: 'Speak to King Aldric IV in the Throne Hall', reply: 'Your Majesty.', say: 'So you are the one the wheel turned for. Four times in a thousand years someone has been pulled into Cresha from somewhere else, always when something old was stirring. The orcs in the crypt, the dead walking in the Gravewood: Maud Hollis writes to me too. I will not pretend to know why you are here. But I know who might.' }] },
    ],
    done: 'ACT III BEGINS — the Crown’s Summons. The King has given you the freedom of the capital.',
    rewards: { gold: 300, xp: 600, guildRep: 60 },
  },
  {
    id: 'oldest-prayer', title: 'The Oldest Prayer', giver: 'king', region: 'royalCapital', main: true, requires: ['crown-summons'],
    summary: 'King Aldric wants to know why the summoned arrive when they do. The Royal Library keeps the chronicles; the Temple of the Dawn keeps the Sunwheel.',
    offer: 'Master Quill in the Royal Library keeps the chronicles of the summoned, such as they are. And the High Priestess of the Dawn keeps the Sunwheel, the same mark you found on the stones above Elder Glen. Speak to them both. Then come back and tell me what an old king should be afraid of.',
    acceptLabel: 'I’ll find out.',
    stages: [
      { note: 'Ask Master Tobias Quill at the Royal Library about the summoned.', objectives: [{ type: 'talk', npc: 'librarian', text: 'Ask Master Quill about the chronicles', reply: 'The King sent me about the summoned.', say: 'The summoned. Yes. Four in a thousand years, and each chronicle ends the same way: “as the old wheel turns.” I took it for poetry for thirty years. Then a letter came from Mell at the Academy, about a hero who found the wheel carved on a crypt door. It is not poetry. It is a calendar. Go to the Temple. Ask Seraphine what the Sunwheel counts.' }] },
      { note: 'Ask High Priestess Seraphine what the Sunwheel counts.', objectives: [{ type: 'talk', npc: 'priestess', text: 'Ask the High Priestess about the Sunwheel', reply: 'What does the wheel count?', say: 'Twelve spokes. Twelve ages, the oldest hymns say, and at the turning of each the dawn is “won again.” We sing it every morning without thinking what it means. If Quill is right, then the summoned are not an accident. They are what the wheel does when an age turns. And the wheel, summoned one, is turning now.' }] },
      { note: 'Return to King Aldric with what you have learned.', objectives: [{ type: 'talk', npc: 'king', text: 'Report to King Aldric', reply: 'The wheel is turning, Majesty.', say: 'Then I was right to be afraid, and right to send for you. The Silver Lance is yours to call on, and the Collegium’s doors are open. The chronicles speak of ruins older than the Crown, in the elven woods, under the mountains, beneath the sand. Whoever cut those wheels left more than prayers. Find what they left. Cresha will want to know before the wheel finishes turning.' }] },
    ],
    done: 'The King has named you Champion of the Crown. The ruins of the old wheel-cutters wait in the elven woods, under the mountains and beneath the sand.',
    rewards: { gold: 400, xp: 900, guildRep: 120, items: [['knightSword', 1]] },
  },
  // ---- The city's own stories -----------------------------------------------------------------
  {
    id: 'crown-tourney', title: 'The Crown’s Tourney', giver: 'marshal', region: 'royalCapital',
    summary: 'Grand Marshal Hart invites the summoned hero to try a bout in the Commandery’s tourney ring against Ser Gawen Ashby.',
    offer: 'Every Squire who comes up the Crown Road wants to know if Academy steel holds up against the Silver Lance. So: a bout. Ser Gawen Ashby, in the tourney ring, blunted blades and honour. Win, and the Lance will remember your name.',
    acceptLabel: 'Bring on Ser Gawen.',
    stages: [
      { note: 'Defeat Ser Gawen Ashby in the Commandery’s tourney ring.', hook: 'duel:gawen', objectives: [{ type: 'signal', id: 'tourney-won', text: 'Win the bout against Ser Gawen', at: [-3264, -1162] }] },
      { note: 'Report to Grand Marshal Hart.', objectives: [{ type: 'talk', npc: 'marshal', text: 'Report to the Grand Marshal', say: 'Gawen will be insufferable about this for a month. About losing, for once. Well fought. The Lance has a long memory and a good armoury.' }] },
    ],
    done: 'The Silver Lance salutes you.',
    rewards: { gold: 220, xp: 450, guildRep: 50, items: [['kiteShield', 1]] },
  },
  {
    id: 'form-twelve', title: 'Form Twelve, in Triplicate', giver: 'chancellor', region: 'royalCapital',
    summary: 'To petition the Crown you need Form Twelve, stamped by the Herald, countersigned at the Grand Hall and sealed at the Chancery.',
    offer: 'A petition to the Crown, for the record. Form Twelve: here. It must be stamped by the Royal Herald on the Plaza of Crowns, countersigned by the Grandmaster of the Guild, and returned to me for the Seal. In that order. Yes, it is always this hard. No, I don’t make the rules. Well. I do. But I didn’t make these ones.',
    acceptLabel: 'Form Twelve it is.',
    stages: [
      { note: 'Have Form Twelve stamped by the Royal Herald on the Plaza of Crowns.', objectives: [{ type: 'talk', npc: 'herald', text: 'Get the Herald’s stamp', reply: 'The Chancellor needs your stamp.', say: 'Hear ye! A Form Twelve! Stamped, sealed… no, just stamped. The seal is the Chancellor’s. Hear ye, everyone, a Form Twelve!' }] },
      { note: 'Have it countersigned by Grandmaster Brannoc Steel at the Grand Hall.', objectives: [{ type: 'talk', npc: 'grandmaster', text: 'Get the Grandmaster’s countersignature', reply: 'Could you countersign this?', say: 'Vaun’s forms. I sign forty a day. Here. Tell him the Guild wants its own form for complaining about his forms.' }] },
      { note: 'Return Form Twelve to Lord Chancellor Vaun for the Royal Seal.', objectives: [{ type: 'talk', npc: 'chancellor', text: 'Return the form to the Chancellor', say: 'Stamped, countersigned, and in the right order. Remarkable. Most people give up at the Herald. The Seal, then; your petition is entered. Here: a small writ of the Crown’s gratitude. Paperwork, it turns out, is rewarded.' }] },
    ],
    done: 'Your petition is entered in the rolls of the Royal Chancery.',
    rewards: { gold: 150, xp: 300 },
  },
  {
    id: 'stone-letters', title: 'Letters Between Nations', giver: 'dwarfEnvoy', region: 'royalCapital',
    summary: 'Thrain Ironbrow, envoy of the Dwarven Holds, needs a sealed letter carried to Bruni Stonevein in Port Aurelle before her expedition sails.',
    offer: 'Bruni Stonevein sails for the White Mountains from Port Aurelle, and the Holds have words for her that can’t go by a Crown rider. Sealed, dwarf to dwarf. You know the road. Put this in her hand and nobody else’s.',
    acceptLabel: 'I’ll carry it.',
    stages: [
      { note: 'Carry Thrain’s sealed letter to Bruni Stonevein in Port Aurelle’s Dwarven Quarter.', objectives: [{ type: 'talk', npc: 'bruni', text: 'Give the letter to Bruni Stonevein', reply: 'A letter from Thrain Ironbrow.', say: 'From Thrain? Then the Holds know we’re coming. Good. Very good. And very bad, if I read his hand right: the deep halls have gone quiet. Tell him the Iron Kettle sails regardless.' }] },
      { note: 'Bring Bruni’s answer back to Thrain Ironbrow in the envoys’ quarter.', objectives: [{ type: 'talk', npc: 'dwarfEnvoy', text: 'Bring Bruni’s answer to Thrain', reply: 'She sails regardless.', say: 'Of course she does. Stonevein stubbornness. Here, for your boots, and for keeping a dwarf’s seal unbroken.' }] },
    ],
    done: 'The Dwarven Holds will remember the courier who kept their seal.',
    rewards: { gold: 180, xp: 350, guildRep: 30 },
  },
  {
    id: 'grammar-of-fire', title: 'The Grammar of Fire', giver: 'archmage', region: 'royalCapital',
    summary: 'Archmage Isolde Venn will teach a summoned hero, if they can prove they can gather a reagent without setting it alight.',
    offer: 'Students of the Collegium begin with reagents. Moongrass, three bundles, picked whole and unburnt. Bring them, and I will consider you a student of the Collegium, whatever the Registrar says about summoned heroes.',
    acceptLabel: 'Three bundles of moongrass.',
    stages: [
      { note: 'Gather three bundles of moongrass and bring them to Archmage Venn.', objectives: [{ type: 'deliver', npc: 'archmage', item: 'moongrass', count: 3, text: 'Bring 3 moongrass to the Archmage', say: 'Whole, unburnt, and cut at the stem. Somebody taught you. Welcome to the Collegium, student.' }] },
    ],
    done: 'You are a student of the Arcane Collegium.',
    rewards: { gold: 80, xp: 300, items: [['greaterManaPotion', 2], ['ringSage', 1]] },
  },
  {
    id: 'humming-crystal', title: 'The Crystal That Hums', giver: 'twig', region: 'royalCapital',
    summary: 'Twig the urchin swears the Collegium’s floating crystal hums at night, and that the rune circle under it glows brighter after midnight.',
    offer: 'You don’t believe me. Nobody believes me. Go and stand in the rune circle in front of the Collegium after midnight, before dawn. Listen. Then tell the Archmage you heard it, and watch her face.',
    acceptLabel: 'Midnight, then.',
    stages: [
      { note: 'Stand in the Collegium’s rune circle between midnight and dawn.', objectives: [
        { type: 'hour', from: 0, to: 4, text: 'Wait until after midnight' },
        { type: 'reach', at: outFrom(COLLEGIUM, 20), radius: 5, text: 'Stand in the rune circle' },
      ] },
      { note: 'Tell Archmage Venn what you heard.', objectives: [{ type: 'talk', npc: 'archmage', text: 'Tell the Archmage about the humming', reply: 'The crystal hums. Like a wheel turning.', say: 'Like a wheel turning. Yes. It began the night you were summoned. Do not tell the urchin I said so; he is insufferable enough. Here. For your silence and your ears.' }] },
    ],
    done: 'The crystal’s hum has the same rhythm as the Sunwheel’s hymn.',
    rewards: { gold: 60, xp: 250, items: [['manaPotion', 3]] },
  },
  {
    id: 'dawn-vigil', title: 'The Dawn Vigil', giver: 'priestess', region: 'royalCapital', requires: ['oldest-prayer'],
    summary: 'High Priestess Seraphine asks the summoned hero to keep the Dawn Vigil in the Temple square, as the first priests did.',
    offer: 'Once, the first priests of the Dawn kept a vigil in the square every morning to see the light come back over Crown Hill. Nobody has kept it in a hundred years. Keep it for me, once: stand in the Temple square at dawn.',
    stages: [
      { note: 'Keep vigil in the Temple square at dawn (5:00–7:00).', objectives: [
        { type: 'hour', from: 5, to: 7, text: 'Wait for the dawn' },
        { type: 'reach', at: [TEMPLE[0], TEMPLE[1] - 30], radius: 9, text: 'Stand in the Temple square' },
      ] },
      { note: 'Return to the High Priestess.', objectives: [{ type: 'talk', npc: 'priestess', text: 'Tell Seraphine the dawn came', say: 'It came. It always does. That is the whole of the faith, and it is worth more than it sounds. Take this, and the Dawn’s blessing.' }] },
    ],
    done: 'You kept the first Dawn Vigil in a hundred years.',
    rewards: { gold: 100, xp: 300, items: [['greaterHealthPotion', 2]] },
  },
];
