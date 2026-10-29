import * as THREE from 'three';
import type { QuestDef } from '../quests/questLog';
import { heightAt } from '../world/terrainHeight';
import { PALACE, PLAZA } from '../world/capitalCity';
import { CHAMPIONS } from './champions';
import type { ActCtx } from './act1';

// Act II: The Academy and the Crown. At the Academy the archivist has a list
// of four names; your classmate Dorian is another power's champion of your
// own year, and you can work out whose. In the Capital the King's treasury is
// short, and the gold has been buying black iron for a quiet woman; at the
// Feast of the Dawn, under the eyes of a Second Age champion who has outlived
// every king he ever bowed to, she strikes; and at dawn on the Plaza of
// Crowns, Ser Malric meets you in the open.

const CH = ['Act II · The Academy', 'Act II · Same Year, Same Road', 'Act II · The Missing Gold', 'Act II · The Feast of the Dawn', 'Act II · The Wheelbreaker'];

const ground = (x: number, z: number) => new THREE.Vector3(x, heightAt(x, z), z);
/** The palace forecourt (the feast is held in the great hall above it). */
const FEAST_AT = ground(PALACE[0] + 46, PALACE[1] + 8);
const PLAZA_AT = ground(PLAZA[0], PLAZA[1]);

export const ACT2_QUESTS: QuestDef[] = [
  {
    id: 'mq-archive', title: 'The Archivist\'s Index', giver: 'mell', region: 'portAurelle', main: true, requires: ['academy-lessons'],
    summary: 'Archivist Mell keeps an index of the summoned. There are four names in it before yours.',
    offer: 'You came back. I hoped you would. I have been keeping an index, you see: of the summoned. Sit. You should read it before anyone else tells you what it says.',
    acceptLabel: 'Show me.',
    stages: [
      { note: 'Read Archivist Mell\'s index.', hook: 'archive:read', objectives: [{ type: 'signal', id: 'archive-read', text: 'Read the index of the summoned with Archivist Mell' }] },
    ],
    done: 'Four names. Four graves, somewhere. And every one of them died with another power\'s champion close by. I am sorry. I thought you should know.',
    rewards: { gold: 60, xp: 200 },
  },
  {
    id: 'mq-dorian', title: 'Same Year, Same Road', giver: 'mell', region: 'portAurelle', main: true, requires: ['academy-rival', 'mq-archive'],
    summary: 'Dorian Vale arrived a season before you, from a farm in the north no map shows. He never sits with his back to a door. Find out who sent him.',
    offer: 'One more thing. Your classmate, Dorian Vale. He came a season before you, with a story about a farm in the north. I have looked. There is no farm. Watch him.',
    acceptLabel: 'I\'ll watch him.',
    stages: [
      { note: 'Watch Dorian at the ring at noon.', objectives: [{ type: 'hour', from: 11.5, to: 14, text: 'Be at the Academy ring around noon' }] },
      { note: 'Watch Dorian practise in the noon sun.', hook: 'dorian:noon', objectives: [{ type: 'signal', id: 'dorian-watched', text: 'Watch Dorian practise (the Academy ring)' }] },
      { note: 'Name Dorian\'s patron (Powers & Champions, P).', objectives: [{ type: 'signal', id: 'named-dorian', text: 'Work out who sent Dorian (the Powers & Champions page, P)' }] },
      { note: 'Confront Dorian.', hook: 'dorian:confront', objectives: [{ type: 'signal', id: 'dorian-faced', text: 'Talk to Dorian about who sent him' }] },
    ],
    done: 'Same year, same road. Different master.',
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
      { note: 'Tell the King.', objectives: [{ type: 'talk', npc: 'king', text: 'Tell King Aldric what you found', reply: 'Your Chancellor has been paying a champion.', say: '"H." Paid in black iron. For a month. And the Feast of the Dawn is in three days, with every envoy in the world at my table. Thorne will double the guard. You will be at my right hand, Champion. If she comes, I want her to meet you.' }] },
    ],
    done: 'Vaun is in the cells. I have known him thirty years. I will think about that later.',
    rewards: { gold: 300, xp: 500, guildRep: 30 },
  },
  {
    id: 'mq-feast', title: 'The Feast of the Dawn', giver: 'king', region: 'royalCapital', main: true, requires: ['mq-ledger'],
    summary: 'Every envoy in the world sits at the King\'s table tonight. Somewhere in the palace, a quiet woman is waiting.',
    offer: 'The Feast is tonight. Stay close.',
    acceptLabel: 'I\'ll be at your right hand.',
    stages: [
      { note: 'Come to the palace for the Feast of the Dawn, after dark.', objectives: [{ type: 'hour', from: 19, to: 2, text: 'Wait for the Feast (after dark)' }] },
      { note: 'Go to the palace forecourt.', hook: 'feast:hall', objectives: [{ type: 'signal', id: 'feast-done', text: 'Attend the Feast of the Dawn (the palace)', at: [FEAST_AT.x, FEAST_AT.z] }] },
    ],
    done: 'Cresha owes you a king. I will not forget it, and neither will Valoria, I suspect.',
    rewards: { gold: 400, xp: 700, guildRep: 50 },
  },
  {
    id: 'mq-wheelbreaker', title: 'The Wheelbreaker', giver: 'king', region: 'royalCapital', main: true, requires: ['mq-feast'],
    summary: 'A letter nailed to the palace door, sealed in black iron: "Plaza of Crowns. Dawn. Come alone. M."',
    offer: '',
    stages: [
      { note: 'Meet Ser Malric on the Plaza of Crowns at dawn.', objectives: [{ type: 'hour', from: 5, to: 8, text: 'Be on the Plaza of Crowns at dawn (5:00 to 8:00)' }] },
      { note: 'Face Ser Malric Dane.', hook: 'wheelbreaker:duel', objectives: [{ type: 'signal', id: 'malric-beaten', text: 'Face Ser Malric on the Plaza of Crowns', at: [PLAZA_AT.x, PLAZA_AT.z] }] },
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
      await s.say('Archivist Mell', 'Four names, each in a different hand, a different century. The Temple calls them "the Dawn\'s summoned." I call them the dead.');
      await s.say('Archivist Mell', 'Elin. A thousand years ago. She wrote a journal, and walked into the wilds, and her grave was never found.');
      await s.say('Archivist Mell', 'Ser Oswald Marr. Three hundred years ago. Buried somewhere under Hollow Ridge, the chronicle says, with a spoke of gold in his hands.');
      await s.say('Archivist Mell', 'Ser Hallam. Forty years. He died holding Harrow Ford on the Crown Road. Your Ser Corvin was there. Ask him, if you dare.');
      await s.say('Archivist Mell', 'Ser Tobin Reyes. Ten years. He simply stopped writing to the Temple. Nobody knows where he fell.');
      await s.say('Archivist Mell', 'And every one of them died with another power\'s champion close by. Every one.');
      for (const id of ['elin', 'oswald', 'hallam', 'tobin']) story.state.meet(id);
    });
    story.note(CH[0], 'At the Knight\'s Academy, Archivist Mell showed you her index of the Dawn\'s summoned. Four names: Elin, a thousand years ago; Ser Oswald Marr, three hundred, buried under Hollow Ridge; Ser Hallam, forty, who died at Harrow Ford with Ser Corvin beside him; Ser Tobin Reyes, ten, who simply stopped writing. Every one died with another power\'s champion close by.');
    quests.signal('archive-read');
  };

  // ---- Dorian ----------------------------------------------------------------------------
  // (Winning the rival bout shows you the first thing: he keeps his back to the wall.)
  const prev = quests.hooks.get('academy-rival:done');
  quests.hooks.set('academy-rival:done', (q) => {
    prev?.(q);
    story.state.clue('dorianDoor');
  });
  quests.hooks.set('dorian:noon', () => {
    story.saying('dorian-noon', 'dorian', () => quests.wants('dorian-watched') ? { label: '(Watch him practise in the noon sun.)', run: () => { story.h.dialogue.close(); watchDorian(); } } : null);
  });
  const watchDorian = () => {
    void story.play('dorian-noon', async (s) => {
      s.bars(true);
      await s.say(null, 'Dorian runs the forms alone in the full noon sun, sweat in his eyes. He turns, and for a heartbeat, in the glare, the pupils of his eyes are not round. They are slits, like a cat\'s. Like something older than a cat\'s.', 5);
      await s.voice('There. Did you see? Whose eyes do that?', 3);
    });
    story.state.clue('dorianEyes');
    if (!story.state.met.has('dorian')) story.state.meet('dorian');
    quests.signal('dorian-watched');
  };
  story.state.onNamed = (id) => {
    if (id === 'dorian') quests.signal('named-dorian');
    if (id === 'hesk') F.heskNamed = true;
    if (id === 'veyr') F.veyrNamed = true;
  };
  quests.hooks.set('dorian:confront', () => {
    story.saying('dorian-confront', 'dorian', () => quests.wants('dorian-faced') ? { label: 'You serve the Dragon King.', run: () => { story.h.dialogue.close(); confrontDorian(); } } : null);
  });
  const confrontDorian = () => {
    void story.play('dorian-confront', async (s) => {
      s.bars(true);
      await s.say('Cadet Dorian Vale', '...Took you long enough. Yes. Veyrmos, in the north. He found me in a field the same week the wheel found you.');
      await s.say('Cadet Dorian Vale', 'Same year, same road. Different master. He told me to watch you. Not to kill you. Not this year.');
      const pick = await s.choose('Cadet Dorian Vale', 'Fifth Age · the Dragon King', 'So. What are we?', [
        { label: 'Then let\'s not be enemies. Not this year.', tone: 'kind' },
        { label: 'Stay out of my way, Dorian.', tone: 'threat' },
      ]);
      F.dorian = pick === 0 ? 'friend' : 'rival';
      if (pick === 0) await s.say('Cadet Dorian Vale', 'Deal. And when it\'s next year, I\'ll tell you first. That\'s more than any of the old ones will do.');
      else await s.say('Cadet Dorian Vale', 'Fine. Then I\'ll see you on the road.');
      story.note(CH[1], `Dorian Vale is the Dragon King's champion of the Fifth Age: your own year, a different master. ${F.dorian === 'friend' ? 'You agreed not to be enemies, this year.' : 'You told him to stay out of your way.'}`);
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
    if (player.pos.distanceTo(FEAST_AT) > 24) return;
    F.feastBegun = true;
    const at = FEAST_AT;
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
      await s.say('Legate Cassius Varro', 'Three hundred years, little Fifth. I have killed champions with a cup in my hand. Tonight I am only here for the wine. Probably.');
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
        player.hp = Math.max(1, Math.round(player.hp * 0.5));
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
    story.note(CH[3], F.feast === 'shield'
      ? 'At the Feast of the Dawn you took Hesk the Quiet\'s black-iron knife meant for the King. Legate Cassius Varro, a champion of the Second Age who serves the Dragon God, crossed the hall faster than anyone could see and burned her to ash with one hand. "Not at dinner, child."'
      : 'At the Feast of the Dawn, under the eyes of Legate Cassius Varro of the Second Age, Hesk the Quiet put her knife into the King\'s side. You ran her down in the palace forecourt and killed her. The King lives.');
    story.clearFight();
    quests.signal('feast-done');
  };
  const heskStep = () => {
    // (You fell chasing her: she's still in the forecourt when you come back.)
    if (F.feast === 'chase' && !F.heskFight && !F.feastDone && F.feastBegun && !busy() && !player.dead && player.pos.distanceTo(FEAST_AT) < 24) {
      story.champion('hesk', FEAST_AT.clone().add(new THREE.Vector3(-6, 0, 4)), { scale: 0.75 });
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
    if (player.pos.distanceTo(PLAZA_AT) > 30) return;
    F.duelBegun = true;
    const at = PLAZA_AT.clone().add(new THREE.Vector3(0, 0, -8));
    void story.play('duel', async (s) => {
      s.bars(true);
      const m = await s.actor(CHAMPIONS.malric.look, at, 0);
      m.face(player.pos);
      await s.cam(at.clone().add(new THREE.Vector3(5, 2.4, 6)), at.clone().setY(at.y + 1.6), 0);
      await s.say('Ser Malric Dane', 'Hesk was my friend. Did you know that? No. Why would you.');
      await s.say('Ser Malric Dane', 'Ten years I\'ve hunted the Dawn\'s champions. Your fourth begged. Your fourth begged, and I left him for the Dark.');
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
      await s.say('Ser Malric Dane', 'Ten years. Nobody\'s put me on my knees in ten years.');
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
      feastStep();
      heskStep();
      duelStep();
    },
  };
}
