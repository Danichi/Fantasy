import * as THREE from 'three';
import { flatDist } from './story';
import type { QuestDef } from '../quests/questLog';
import { heightAt } from '../world/terrainHeight';
import { PALACE, PLAZA } from '../world/capitalCity';
import { CHAMPIONS } from './champions';
import type { ActCtx } from './act1';

// Act II: The Academy and the Crown. At the Academy the archivist has a list
// of four names, and the count of the Game; your classmate Dorian is
// claw-sworn, a mortal in another power's pay, and you can work out whose
// champion he writes to. In the Capital the King's treasury is
// short, and the gold has been buying black iron for a quiet woman; at the
// Feast of the Dawn, under the eyes of a Second Age champion who has outlived
// every king he ever bowed to, she strikes; and at dawn on the Plaza of
// Crowns, Ser Malric meets you in the open.

const CH = ['Act II · The Academy', 'Act II · Same Year, Same Road', 'Act II · The Missing Gold', 'Act II · The Feast of the Dawn', 'Act II · The Wheelbreaker'];

const ground = (x: number, z: number) => new THREE.Vector3(x, heightAt(x, z), z);
/** The palace forecourt (the feast is held in the great hall above it). (Heights are looked
 * up when needed: not while the modules load, before the capital's terraces are in.) */
const FEAST_XZ = [PALACE[0] + 46, PALACE[1] + 8] as const;
const PLAZA_XZ = [PLAZA[0], PLAZA[1]] as const;
const feastAt = () => ground(FEAST_XZ[0], FEAST_XZ[1]);
const plazaAt = () => ground(PLAZA_XZ[0], PLAZA_XZ[1]);

export const ACT2_QUESTS: QuestDef[] = [
  {
    id: 'mq-archive', title: 'The Archivist\'s Index', giver: 'mell', region: 'portAurelle', main: true, requires: ['academy-lessons'],
    summary: 'Archivist Mell keeps an index of the summoned. There are four names in it before yours.',
    offer: 'You came back. I hoped you would. I have been keeping an index, you see: of the summoned. Sit. You should read it before anyone else tells you what it says.',
    acceptLabel: 'Show me.',
    stages: [
      { note: 'Read Archivist Mell\'s index.', hook: 'archive:read', objectives: [{ type: 'signal', id: 'archive-read', text: 'Read the index of the summoned with Archivist Mell' }] },
      { note: 'Close the index with Archivist Mell.', objectives: [{ type: 'talk', npc: 'mell', text: 'Speak with Archivist Mell', reply: 'You went quiet just then.', say: 'Did I? I was watching your face while you read. You looked like someone hearing a voice. ...Don\'t tell me. An archivist should only keep what\'s written down.' }] },
    ],
    done: 'Four names. Four graves, somewhere. And every one of them died with another power\'s champion close by. I am sorry. I thought you should know. Come back when you\'ve settled in at the Academy: there is a classmate of yours I would like you to watch.',
    rewards: { gold: 60, xp: 200 },
  },
  {
    id: 'mq-dorian', title: 'The Claw-Sworn', giver: 'mell', region: 'portAurelle', main: true, requires: ['academy-rival', 'mq-archive'],
    summary: 'Dorian Vale arrived a season before you, from a farm in the north no map shows, and he fights in a style nobody teaches any more. He writes a letter every week. Find out who he answers to.',
    offer: 'One more thing. Your classmate, Dorian Vale. He came a season before you, with a story about a farm in the north. I have looked. There is no farm. And every week, at noon, he sends a letter to somewhere in your Elder Glen. Watch him.',
    acceptLabel: 'I\'ll watch him.',
    stages: [
      { note: 'Watch Dorian at the ring at noon.', objectives: [{ type: 'hour', from: 11.5, to: 14, text: 'Be at the Academy ring around noon' }] },
      { note: 'Watch Dorian write his letter.', hook: 'dorian:noon', objectives: [{ type: 'signal', id: 'dorian-watched', text: 'Watch Dorian at noon (the Academy ring)' }] },
      { note: 'Work out whose champion Dorian writes to (Powers & Champions, P).', objectives: [{ type: 'signal', id: 'named-dorian', text: 'Name the patron of the master Dorian writes to (the Powers & Champions page, P)' }] },
      { note: 'Confront Dorian.', hook: 'dorian:confront', objectives: [{ type: 'signal', id: 'dorian-faced', text: 'Talk to Dorian about who he answers to' }] },
      { note: 'Tell Archivist Mell what Dorian is.', objectives: [{ type: 'talk', npc: 'mell', text: 'Tell Archivist Mell what you learned about Dorian', reply: 'Dorian answers to Master Veyr. The Dragon King.', say: 'The Dragon King. Then the letters to your Glen were going to Veyr himself, and Veyr has been living next to you the whole time, sharpening a sword nobody taught him in Cresha. ...I will add a line to the index. Not a name. A question mark, under the mountains.' }] },
    ],
    done: 'Claw-sworn. Not a champion: a squire, for one. And his master\'s real Fifth is still up in the mountains.',
    rewards: { gold: 80, xp: 320 },
  },
  {
    id: 'mq-ledger', title: 'The Missing Gold', giver: 'king', region: 'royalCapital', main: true, requires: ['oldest-prayer'],
    summary: 'The King\'s treasury is short by a sum the Chancellor won\'t name. A street child says a woman in black has been visiting the Chancery at night.',
    offer: 'One more thing, Champion, and this one stays between us. My treasury is short. My Chancellor says it is an error in the counting. Vaun does not make errors. The street children see everything in this city; start with the one who sleeps in the Temple porch. Twig, they call her.',
    acceptLabel: 'I\'ll find your gold.',
    stages: [
      { note: 'Ask Twig what she has seen at the Chancery.', objectives: [{ type: 'talk', npc: 'twig', text: 'Ask Twig about the Chancery', reply: 'The King says you see everything.', say: 'Course I do. A lady in black goes in the Chancery back door, every night for a month. Quiet as a cat. She pays the door guards in iron. Black iron, cold, I touched one. Then she\'s gone, like she was never. That worth a hot meal?' }] },
      { note: 'Confront the Lord Chancellor.', hook: 'ledger:vaun', objectives: [{ type: 'signal', id: 'ledger-found', text: 'Confront Lord Chancellor Vaun at the Chancery' }] },
      { note: 'Tell the King, and say what should become of his Chancellor.', objectives: [{ type: 'choose', npc: 'king', key: 'vaun', reply: 'Your Chancellor has been paying a champion.', text: 'Tell King Aldric what you found, and what you think should be done with Vaun', prompt: '"H." Paid in black iron. For a month. And the Feast of the Dawn is in three days, with every envoy in the world at my table. ...Vaun. Thirty years he has stood at my left hand. You found him out. You tell me, Champion: what do I do with him?', options: [
        { id: 'mercy', label: 'Spare him. Find out who he really answers to.', tone: 'kind', say: 'Mercy, then, and a long talk in a cold room. He will tell us who "H" serves, or he will tell us nothing and we will know that too. Thorne will double the guard for the Feast. You will be at my right hand. If she comes, I want her to meet you.' },
        { id: 'justice', label: 'Make an example of him, before the envoys.', tone: 'threat', say: 'The envoys will see a king who does not forgive. Good. Some of them need to. Thorne will double the guard for the Feast. You will be at my right hand, Champion. If she comes, I want her to meet you.' },
      ] }] },
    ],
    done: 'Vaun is in the cells. I have known him thirty years. I will think about that later.',
    doneIf: [['vaun=justice', 'Vaun hangs at dawn the day after the Feast, in front of every envoy in the world. I have known him thirty years. I will think about that later.']],
    rewards: { gold: 300, xp: 500, guildRep: 30 },
  },
  {
    id: 'mq-feast', title: 'The Feast of the Dawn', giver: 'king', region: 'royalCapital', main: true, requires: ['mq-ledger'],
    summary: 'Every envoy in the world sits at the King\'s table tonight. Somewhere in the palace, a quiet woman is waiting.',
    offer: 'The Feast is tonight. Stay close.',
    acceptLabel: 'I\'ll be at your right hand.',
    stages: [
      { note: 'Come to the palace for the Feast of the Dawn, after dark. A knife will come; be ready for it.', anyOrder: true, objectives: [
        { type: 'hour', from: 19, to: 2, text: 'Wait for the Feast (after dark)' },
        { type: 'craft', gear: 'meal', minQ: 2, count: 1, optional: true, flag: 'feast:dish', bonus: { gold: 80, xp: 80 }, text: 'Cook a dish fit for the King\'s table (Fine or better)' },
        { type: 'craft', calling: 'herbalism', count: 2, optional: true, flag: 'feast:antidote', bonus: { xp: 120 }, text: 'Brew two draughts against poison, in case (Herbalism)' },
      ] },
      { note: 'Go to the palace forecourt.', hook: 'feast:hall', objectives: [{ type: 'signal', id: 'feast-done', text: 'Attend the Feast of the Dawn (the palace)', at: [FEAST_XZ[0], FEAST_XZ[1]] }] },
      { note: 'See the King, now the hall is quiet.', objectives: [{ type: 'talk', npc: 'king', text: 'See King Aldric after the Feast', reply: 'How is the wound?', say: 'Deep, and clean, and I will live, which is more than she intended. Every envoy at that table saw a knife come for the King of Cresha and saw who stopped it. By morning that story will be in seven languages.' }] },
    ],
    done: 'Cresha owes you a king. I will not forget it, and neither will Valoria, I suspect. ...But you should see this before you go to bed. It was nailed to the palace door while we were still mopping up the hall.',
    rewards: { gold: 400, xp: 700, guildRep: 50 },
  },
  {
    id: 'mq-wheelbreaker', title: 'The Wheelbreaker', giver: 'king', region: 'royalCapital', main: true, requires: ['mq-feast'],
    summary: 'A letter nailed to the palace door, sealed in black iron: "Plaza of Crowns. Dawn. Come alone. M."',
    offer: 'Black iron, for a seal. "Plaza of Crowns. Dawn. Come alone. M." Malric, then: the champion who took what Grukk dug up under your crypt. Thorne wants to fill the plaza with crossbows. I told him that a man who nails his challenges to a king\'s door wants to be seen, and that the city should see him lose. Will you meet him?',
    acceptLabel: 'I\'ll meet him at dawn.',
    stages: [
      { note: 'Meet Ser Malric on the Plaza of Crowns at dawn. Come ready.', anyOrder: true, objectives: [
        { type: 'hour', from: 5, to: 8, text: 'Be on the Plaza of Crowns at dawn (5:00 to 8:00)' },
        { type: 'craft', gear: 'weapon', temper: true, minQ: 3, count: 1, optional: true, flag: 'duel:tempered', bonus: { xp: 150 }, text: 'Temper your blade to Superior or better before dawn (a forge)' },
        { type: 'craft', gear: 'armor', minQ: 2, count: 1, optional: true, flag: 'duel:armour', bonus: { xp: 100 }, text: 'Make yourself Fine armour or better for the duel' },
      ] },
      { note: 'Face Ser Malric Dane.', hook: 'wheelbreaker:duel', objectives: [{ type: 'signal', id: 'malric-beaten', text: 'Face Ser Malric on the Plaza of Crowns', at: [PLAZA_XZ[0], PLAZA_XZ[1]] }] },
      { note: 'Bring the black iron box to the King.', objectives: [{ type: 'talk', npc: 'king', text: 'Bring Malric\'s box to King Aldric', reply: 'Malric yielded. He threw me this.', say: 'A box with the Sunwheel on its lid, from the hand of the man who stole it. And a Legate of Valoria toasting you from a balcony, Thorne tells me. ...Take it to Master Quill at the Royal Library. If anyone in my kingdom knows what goes in a box like that, it is that old man.' }] },
    ],
    done: 'You beat a Fourth Age champion in front of half the city. They\'ll be singing it in the Gilded Stag by tonight.',
    rewards: { gold: 500, xp: 1000, items: [['knightSword', 1]], guildRep: 60 },
  },
];

export function setupAct2(c: ActCtx & { lookOf: (id: string) => unknown }) {
  const { story, quests, player } = c;
  const F = story.flags;
  quests.add(...ACT2_QUESTS);
  const busy = () => !!story.director.active;

  // ---- The Archivist's index ------------------------------------------------------------
  quests.hooks.set('archive:read', () => {
    story.saying('archive', 'mell', () => quests.wants('archive-read') ? { label: 'Show me the index.', run: () => { story.h.dialogue.close(); readIndex(); } } : null);
  });
  const readIndex = () => {
    void story.play('archive', async (s) => {
      s.bars(true);
      await s.say('Archivist Mell', 'Four names, each in a different hand, twenty years apart. The Temple sings of them as the Dawn\'s knights: heroes who came out of nowhere with the Sunwheel on them. I call them the dead.');
      await s.say('Archivist Mell', 'Elin. Eighty years ago. She wrote a journal, and walked into the wilds, and her grave was never found.');
      await s.say('Archivist Mell', 'Ser Oswald Marr. Sixty years ago. Buried somewhere under Hollow Ridge, the chronicle says, with a spoke of gold in his hands.');
      await s.say('Archivist Mell', 'Ser Hallam. Forty years. He died holding Harrow Ford on the Crown Road. Your Ser Corvin was there. Ask him, if you dare.');
      await s.say('Archivist Mell', 'Ser Tobin Reyes. Twenty years. He simply stopped writing to the Temple. Nobody knows where he fell.');
      await s.say('Archivist Mell', 'And every one of them died with some famous blade of another land close by. Every one. I don\'t know what that means. I only keep the index.');
      for (const id of ['elin', 'oswald', 'hallam', 'tobin']) story.state.meet(id);
      // What nobody in this world knows: the voice tells you how the Game is counted.
      await s.dark(0.35, 1.4);
      await s.voice('She has found my four. She will never find the rest, so listen to me now. No one else in this world will tell you how the Game is counted.', 5);
      await s.voice('Eighty years ago the seven of us who want his chair swore an Accord. We do not fight each other. Each of us may call one champion every twenty years. Each calling is an age.', 6);
      await s.voice('Seven came in the First Age. Two still walk. Fewer are left of every age, and every one left is worse: twenty, forty, sixty, eighty years at a god\'s table.', 6);
      await s.voice('The six who came with you were carried home to be taught. You will not meet them for a long while. The old ones are already out here with you.', 5);
      await s.voice('This world knows our names. It knows some of our champions\' names, as heroes, as legends. It does not know the Game. Keep it that way.', 5);
      F.censusKnown = true;
      await s.dark(0, 1.4);
    });
    story.note(CH[0], 'At the Knight\'s Academy, Archivist Mell showed you her index of the Dawn\'s summoned. Four names, twenty years apart: Elin, eighty years ago; Ser Oswald Marr, sixty, buried under Hollow Ridge; Ser Hallam, forty, who died at Harrow Ford with Ser Corvin beside him; Ser Tobin Reyes, twenty, who simply stopped writing. Every one died with some famous blade of another land close by. Afterwards the voice told you what no one else in this world knows: eighty years ago the seven powers who want the Hollow King\'s chair swore an Accord. They never fight each other; each may call one champion every twenty years, and each calling is an age. The old ages are thin now, and what is left of them is the worst of it. The world knows the powers, and some of their champions as heroes; it does not know the Game. (The count is on the Powers & Champions page.)');
    quests.signal('archive-read');
  };

  // ---- Dorian ----------------------------------------------------------------------------
  // (Crossing blades with him in the rival bout shows you the first thing: whose school he fights in.)
  const prev = quests.hooks.get('academy-rival:done');
  quests.hooks.set('academy-rival:done', (q) => {
    prev?.(q);
    story.state.clue('veyrStyle');
  });
  quests.hooks.set('dorian:noon', () => {
    story.saying('dorian-noon', 'dorian', () => quests.wants('dorian-watched') ? { label: '(Watch him, from across the ring.)', run: () => { story.h.dialogue.close(); watchDorian(); } } : null);
  });
  const watchDorian = () => {
    void story.play('dorian-noon', async (s) => {
      s.bars(true);
      await s.say(null, 'At noon, with the ring empty, Dorian sits on the wall and writes. He folds the letter, drips wax on it, and presses a ring into the wax. When the courier rides out, you see the seal: a crowned claw. The letter is going to Elder Glen.', 5.5);
      await s.voice('A crowned claw. Who in your village fights in the old style, and never turns his back on a door?', 3.6);
    });
    story.state.clue('veyrLetters');
    quests.signal('dorian-watched');
  };
  story.state.onNamed = (id) => {
    if (id === 'veyr') {
      F.veyrNamed = true;
      quests.signal('named-dorian');
    }
    if (id === 'hesk') F.heskNamed = true;
  };
  quests.hooks.set('dorian:confront', () => {
    story.saying('dorian-confront', 'dorian', () => quests.wants('dorian-faced') ? { label: 'You\'re writing to Master Veyr.', run: () => { story.h.dialogue.close(); confrontDorian(); } } : null);
  });
  const confrontDorian = () => {
    void story.play('dorian-confront', async (s) => {
      s.bars(true);
      await s.say('Cadet Dorian Vale', '...Took you long enough. Yes. Master Veyr took me in when I was eight. I\'m claw-sworn: the Dragon King pays my fees, and I write down what I see. This year, that\'s you.');
      await s.say('Cadet Dorian Vale', 'I\'m not one of you. Nobody summoned me. I\'m a farm boy who\'s good with a sword, and the Dragon King lets me be useful.');
      await s.say('Cadet Dorian Vale', 'I don\'t know what you are. I know the Dragon King has one too: a stranger who fell out of the sky into the Deep Mountains the same night you fell into the wheat. Master Veyr says I\'m not to ask about it. They\'re making something out of him up there. When they let him come down, I\'ll know his face. Will you?');
      const pick = await s.choose('Cadet Dorian Vale', 'Claw-sworn · the Dragon King', 'So. What are we?', [
        { label: 'Then let\'s not be enemies. Not this year.', tone: 'kind' },
        { label: 'Stay out of my way, Dorian.', tone: 'threat' },
      ]);
      F.dorian = pick === 0 ? 'friend' : 'rival';
      if (pick === 0) await s.say('Cadet Dorian Vale', 'Deal. And when he comes down out of the mountains, I\'ll tell you first. That\'s more than Master Veyr would.');
      else await s.say('Cadet Dorian Vale', 'Fine. Then I\'ll write that down too.');
      story.note(CH[1], `Dorian Vale is claw-sworn: no champion, but a mortal in the Dragon King's pay, who writes every week to Master Veyr of Elder Glen, a champion of the Third Age. The Dragon King's own Fifth Age champion is in the Deep Mountains, being made into something. ${F.dorian === 'friend' ? 'You agreed not to be enemies, and he will tell you when the Dragon King\'s Fifth comes down.' : 'You told him to stay out of your way.'}`);
      quests.signal('dorian-faced');
    });
  };

  // ---- The Chancellor ----------------------------------------------------------------------
  quests.hooks.set('ledger:vaun', () => {
    story.saying('ledger', 'chancellor', () => quests.wants('ledger-found') ? { label: 'Who is "H.", Chancellor?', tone: 'threat', run: () => { story.h.dialogue.close(); faceVaun(); } } : null);
  });
  const faceVaun = () => {
    void story.play('vaun', async (s) => {
      s.bars(true);
      await s.say('Lord Chancellor Vaun', 'I beg your pardon?');
      const pick = await s.choose('Lord Chancellor Edric Vaun', 'Keeper of the Royal Seal', 'I have no idea what you mean. Leave, before I call the Guard.', [
        { label: 'The King already knows. Help yourself while you still can.', tone: 'persuade' },
        { label: 'Hand over the ledger, or I hand you to Captain Thorne.', tone: 'threat' },
        { label: '(Say nothing. Wait.)' },
      ]);
      F.vaun = ['persuade', 'threat', 'wait'][pick];
      if (pick === 0) await s.say('Lord Chancellor Vaun', '...He knows. Of course he knows. Thirty years. Very well. The ledger is in the second drawer. I was promised the Iron Below would remember its friends when it sits in the chair.');
      else if (pick === 1) await s.say('Lord Chancellor Vaun', 'You would not dare. ...You would. Gods. The second drawer. Take it. Take it!');
      else {
        await s.wait(1.5);
        await s.say('Lord Chancellor Vaun', '...Stop looking at me like that. Like the King does. The second drawer. I did it for Cresha. When the Iron Below sits in the chair, Cresha will be on the right side of the Dark.');
      }
      await s.say(null, 'The ledger. Payments, a month of them, in a careful hand, to "H." In black iron ingots.', 3.4);
      story.state.clue('heskLedger');
      story.state.meet('hesk');
      story.note(CH[2], `The King's treasury was short. Twig saw a woman in black pay the Chancery's door guards in black iron. ${F.vaun === 'persuade' ? 'You talked' : F.vaun === 'threat' ? 'You frightened' : 'You stared'} Lord Chancellor Vaun into giving up his ledger: a month of payments to "H." in black iron, so that the Iron Below would remember Cresha when it sat in the chair.`);
      quests.signal('ledger-found');
    });
  };

  // ---- The Feast of the Dawn ----------------------------------------------------------------
  quests.hooks.set('feast:hall', () => {
    F.feastReady = true;
  });
  const feastStep = () => {
    if (!F.feastReady || F.feastBegun || busy() || !quests.wants('feast-done')) return;
    if (flatDist(player.pos, feastAt()) > 24) return;
    F.feastBegun = true;
    const at = feastAt();
    void story.play('feast', async (s) => {
      s.bars(true);
      await s.card('Act II', 'The Feast of the Dawn', '', 2.6);
      const varro = await s.actor(CHAMPIONS.varro.look, at.clone().add(new THREE.Vector3(3, 0, 2)), 0);
      varro.face(player.pos);
      await s.cam(at.clone().add(new THREE.Vector3(7, 2.6, 6)), at.clone().add(new THREE.Vector3(3, 1.7, 2)), 0);
      story.ui.dread(0.45, false);
      await s.say(null, 'The hall is gold and noise. Then a man in dark red walks through it, and the noise goes out of the room ahead of him like air.', 4);
      await s.champion(2, 'Legate Cassius Varro', 'the Ember Legate', 'Champion of the Dragon God', 3.6);
      await s.say('Legate Cassius Varro', 'So you are the Dawn\'s new one. Sit, sit. I have had dinner with your second, and your third. Your second had better manners.');
      await s.say('Legate Cassius Varro', 'Sixty years, little Fifth. I have killed champions with a cup in my hand. Tonight I am only here for the wine. Probably.');
      await s.say('Legate Cassius Varro', 'Ashfang\'s own Fifth is still in the Ember Temples, learning which fork to stab with. Pray you meet that one late.');
      if (quests.flag('mq-feast', 'feast:dish')) await s.say('Legate Cassius Varro', 'And somebody in this kitchen can actually cook. ...Yours? Hm. The Dawn has started choosing better.', 3.2);
      story.state.meet('varro');
      await s.say(null, 'Behind the King, a serving woman sets down a jug, and her hand comes up with a knife in it, black as a hole.', 3.2);
      const pick = await s.choose('The Feast of the Dawn', 'The King\'s right hand', 'The knife is already moving.', [
        { label: 'Throw yourself between the King and the knife.' },
        { label: 'Go for the assassin.' },
      ]);
      F.feast = pick === 0 ? 'shield' : 'chase';
      story.ui.dread(0, false);
      if (pick === 0) {
        await s.say(null, 'The knife goes into your shoulder instead of his heart. It is cold, colder than ice, and the cold spreads.', 3.4);
        const antidote = !!quests.flag('mq-feast', 'feast:antidote');
        if (antidote) await s.say(null, 'You get the stopper out of your draught with your teeth and swallow. The cold stops at your elbow.', 3);
        player.hp = Math.max(1, Math.round(player.hp * (antidote ? 0.8 : 0.5)));
        await s.say('Hesk the Quiet', 'Shh.', 1.6);
        await s.say(null, 'She draws back for the second blow, and a hand closes round her wrist. Varro has crossed the hall without anyone seeing him do it.', 3.6);
        await s.say('Legate Cassius Varro', 'Not at dinner, child.', 2.2);
        s.shake(0.6);
        await s.say(null, 'There is heat, a great deal of it, for one moment. Then there is a shape of ash where Hesk the Quiet was, and it falls in on itself.', 4);
        await s.say('Legate Cassius Varro', 'Black iron. The Iron Below. Tell your King he is welcome, and that Valoria does not care for knives in the soup.');
        story.state.clue('heskIron');
      } else {
        await s.say('Hesk the Quiet', 'Shh.', 1.6);
        await s.say(null, 'The knife goes into the King\'s side as you reach her. She is already through the window and down into the forecourt.', 3.4);
        if (quests.flag('mq-feast', 'feast:antidote')) {
          F.feastAntidote = true;
          await s.say(null, 'You press your draught into the Queen\'s hands on your way past. "Make him drink it. All of it." Behind you the King coughs, and keeps breathing.', 3.8);
        }
      }
      s.remove(varro);
    });
    const go = () => {
      if (busy() || !F.feast) return void story.whenFree(go);
      if (F.feast !== 'chase') return finishFeast();
      story.champion('hesk', at.clone().add(new THREE.Vector3(-6, 0, 4)), { scale: 0.75 });
      F.heskFight = true;
    };
    go();
  };
  const finishFeast = () => {
    if (F.feastDone) return;
    F.feastDone = true;
    story.state.slay('hesk');
    story.note(CH[3], F.feast === 'shield'
      ? 'At the Feast of the Dawn you took Hesk the Quiet\'s black-iron knife meant for the King. Legate Cassius Varro, a champion of the Second Age who serves the Dragon God, crossed the hall faster than anyone could see and burned her to ash with one hand. "Not at dinner, child."'
      : `At the Feast of the Dawn, under the eyes of Legate Cassius Varro of the Second Age, Hesk the Quiet put her knife into the King's side. You ran her down in the palace forecourt and killed her. The King lives${F.feastAntidote ? ': the draught you had brewed against poison kept the black iron\'s cold out of his heart' : ''}.`);
    story.clearFight();
    quests.signal('feast-done');
  };
  const heskStep = () => {
    // (You fell chasing her: she's still in the forecourt when you come back.)
    if (F.feast === 'chase' && !F.heskFight && !F.feastDone && F.feastBegun && !busy() && !player.dead && flatDist(player.pos, feastAt()) < 24) {
      story.champion('hesk', feastAt().clone().add(new THREE.Vector3(-6, 0, 4)), { scale: 0.75 });
      F.heskFight = true;
    }
    if (!F.heskFight || F.feastDone) return;
    const h = story.champions.find((x) => x.def.id === 'hesk');
    if (!h || !h.alive) {
      story.state.clue('heskIron');
      finishFeast();
    }
  };

  // ---- The Wheelbreaker ----------------------------------------------------------------------
  quests.hooks.set('wheelbreaker:duel', () => {
    F.duelReady = true;
  });
  const duelStep = () => {
    if (!F.duelReady || F.duelBegun || busy() || !quests.wants('malric-beaten')) return;
    if (flatDist(player.pos, plazaAt()) > 30) return;
    F.duelBegun = true;
    // Ready or not: a tempered edge bites harder, armour that fits turns more.
    if (quests.flag('mq-wheelbreaker', 'duel:tempered')) c.buff('duelEdge', 'A tempered edge', 600, { melee: 0.1 });
    if (quests.flag('mq-wheelbreaker', 'duel:armour')) c.buff('duelGuard', 'Armour that fits', 600, { dmgTaken: -0.1 });
    const at = plazaAt().clone().add(new THREE.Vector3(0, 0, -8));
    void story.play('duel', async (s) => {
      s.bars(true);
      const m = await s.actor(CHAMPIONS.malric.look, at, 0);
      m.face(player.pos);
      await s.cam(at.clone().add(new THREE.Vector3(5, 2.4, 6)), at.clone().setY(at.y + 1.6), 0);
      await s.say('Ser Malric Dane', 'Hesk was my friend. Did you know that? No. Why would you.');
      await s.say('Ser Malric Dane', 'Twenty years I\'ve hunted the Dawn\'s champions. Your fourth begged. Your fourth begged, and I left him for the Dark.');
      if (quests.flag('mq-wheelbreaker', 'duel:tempered')) await s.say('Ser Malric Dane', 'You took that blade to a forge last night. I can see it. Good. I hate killing someone with a bad sword.', 3.2);
      if (quests.flag('mq-wheelbreaker', 'duel:armour')) await s.say(null, 'Your armour sits right on you, the way only something you made yourself does.', 2.8);
      await s.say('Ser Malric Dane', 'In the open, then. In front of all of them. Let\'s see what it means.');
      s.remove(m);
    });
    const go = () => {
      if (busy()) return void story.whenFree(go);
      const ch = story.champion('malric', at, { floor: 0.12, scale: 1.1, intro: false });
      ch.onFloor = () => beaten();
    };
    go();
  };
  story.fallen.set('act2', () => {
    if (F.heskFight && !F.feastDone) F.heskFight = false;
    if (F.duelBegun && !F.malricBeaten) F.duelBegun = false;
  });
  const beaten = () => {
    if (F.malricBeaten) return;
    F.malricBeaten = true;
    const m = story.champions.find((x) => x.def.id === 'malric');
    player.invulnerable = true;
    void story.play('duel-after', async (s) => {
      s.bars(true);
      await s.say('Ser Malric Dane', '...Huh.', 1.8);
      await s.say('Ser Malric Dane', 'Twenty years. Nobody\'s put me on my knees in twenty years.');
      await s.say(null, 'He pulls something from his belt and tosses it at your feet: the black iron box, with the Sunwheel on its lid.', 3.2);
      await s.say('Ser Malric Dane', 'Keep it. It\'s only a spoke. The Iron Below has everything it needs from it already.');
      await s.say(null, 'High on a balcony over the plaza, a man in dark red raises a cup to you.', 2.8);
      await s.say('Legate Cassius Varro', 'Not bad, little Fifth. Not bad at all.', 2.6);
      await s.fade(1, 0.8);
      m?.dispose();
      story.champions = story.champions.filter((x) => x !== m);
      player.invulnerable = false;
      await s.fade(0, 1);
      await s.card('End of Act II', 'The Academy and the Crown', '', 3.4);
    });
    c.give('blackIronBox', 1);
    story.note(CH[4], 'At dawn on the Plaza of Crowns you faced Ser Malric Dane in front of half the city and put him on his knees. He threw you the black iron box Grukk dug up: a spoke of the Sunwheel. "The Iron Below has everything it needs from it already." Legate Varro raised a cup to you from a balcony.');
    quests.signal('malric-beaten');
  };

  return {
    step() {
      // (Already named, or named before Dorian's letters: the chapter moves on.)
      if (quests.wants('named-dorian') && story.state.patronOf('veyr')) quests.signal('named-dorian');
      if (!F.censusKnown && quests.isDone('mq-archive')) F.censusKnown = true;
      feastStep();
      heskStep();
      duelStep();
    },
  };
}
