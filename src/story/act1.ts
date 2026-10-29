import * as THREE from 'three';
import { flatDist } from './story';
import type { QuestDef, QuestLog } from '../quests/questLog';
import type { Player } from '../player/player';
import type { Reputation } from '../social/reputation';
import { CRYPT, GRAVEWOOD, heightAt } from '../world/terrainHeight';
import { STANDING_STONES } from '../world/glenLandmarks';
import { CAST as LOOKS } from '../npc/cast';
import { BRANNOC_LOOK } from '../raid/watchman';
import { events } from '../core/events';
import type { Story } from './story';
import { CHAMPIONS } from './champions';
import type { SceneApi } from './scene';

// Act I: The Fifth Summon (Elder Glen). You fall out of the sky into the
// south field at night, the Dark's shades already hunting you; the Glen
// takes you in warily; the Sunwheel wakes in you; under the crypt Grukk was
// digging for a Sunwheel door on a champion's coin, and the champion is
// waiting when you come up; the Gravewood is a thin place, and through the
// wheel you step into the Dark itself; and on the Night of Bells the Dark
// comes for the Glen, and the people you've befriended stand with you.

export interface ActCtx {
  story: Story;
  quests: QuestLog;
  player: Player;
  rep: Reputation;
  time: { hour: number; day: number; skipTo(h: number): void };
  raids: { start(kind: 'wolves' | 'gloam', front?: string): void; state: string };
  toast(m: string): void;
  give(id: string, n: number): void;
  count(id: string): number;
  save(): void;
  /** the game has started (past the title and the character creator) */
  ready(): boolean;
}

const CH = ['Act I · The Fall', 'Act I · A Stranger in Elder Glen', 'Act I · Lights on the Hill', 'Act I · The Dead Wood', 'Act I · The Night of Bells'];

/** Where you fall: the wheat south of the village. */
export const FALL_AT = new THREE.Vector3(14, 0, 168);
const MAUD_AT = new THREE.Vector3(10, 0, -10);
// (Places keep y = 0: distances are measured along the ground, and nothing looks up
// terrain heights while the modules load, before the world's shapes are all in.)
const CRYPT_DOOR = new THREE.Vector3(CRYPT.x, 0, CRYPT.y + 10);

/** Elder Glen's side quests: help any of these and the Glen starts to trust you. */
export const GLEN_FAVOURS = ['missing-heifer', 'crows-in-wheat', 'mill-wheel-jam', 'granary-rats', 'herbalist-list', 'smiths-ore-run', 'childrens-dare', 'night-watch', 'lost-ring', 'pips-cat', 'fish-supper', 'wool-for-vela', 'harvest-festival'];

const WARDENS = [
  { name: 'Rook Ashdown', look: { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: false, hairColor: 0x8a3f22, skin: 0xe0b894, cloth: 0x6a4a2a, height: 1.82 } },
  { name: 'Lyssa', look: { body: 'female', outfit: 'ranger', hair: 'long', hairColor: 0x2a1c14, skin: 0xa8744e, cloth: 0x3a5a3a, height: 1.72 } },
  { name: 'Garrick', look: { body: 'male', outfit: 'ranger', hair: 'buzzed', beard: true, hairColor: 0x3a2618, skin: 0xfff0e6, cloth: 0x5a5a6a, pauldron: true, height: 1.9 } },
] as const;

export const ACT1_QUESTS: QuestDef[] = [
  {
    id: 'mq-fall', title: 'The Fall', giver: 'maud', region: 'cresha', main: true,
    summary: 'You fell out of the night sky into the wheat south of Elder Glen, and the Dark was waiting for you.',
    offer: '',
    stages: [
      { note: 'Survive.', hook: 'fall:night', objectives: [{ type: 'signal', id: 'fall-survived', text: 'Survive the things that came for you', at: [FALL_AT.x, FALL_AT.z] }] },
      { note: 'Kaela and Brannoc have brought you in. The village elder wants to see you.', hook: 'fall:morning', objectives: [{ type: 'talk', npc: 'maud', text: 'Speak with Elder Maud on the plaza', reply: 'Where am I?', say: 'Elder Glen, in the Kingdom of Cresha. And you came down out of the night sky in a flash of light, over Wren\'s wheat, with things out of the Dark already waiting for you. Kaela swears she saw it. Brannoc won\'t say what he saw. Sit down, dear. You\'ve frightened half my village and I\'d like to know whether I ought to be frightened too.' }] },
    ],
    done: 'There\'s an old song about people who fall out of the sky. It doesn\'t end well for them. Let\'s see if we can write you a better one.',
    rewards: { gold: 25, xp: 60, items: [['healthPotion', 3]] },
  },
  {
    id: 'mq-stranger', title: 'A Stranger in Elder Glen', giver: 'maud', region: 'cresha', main: true, requires: ['mq-fall'],
    summary: 'The Glen is frightened of you. Maud says the way to stop that is to be useful: help its people, and let them see who you are.',
    offer: 'The village is frightened of you. I can\'t blame them. So: be useful. Tom Hale has lost a heifer, Wren has crows in her wheat, Oswin\'s wheel keeps jamming, Dora has rats, Fröst needs ore. Help them. Let them see your face doing something ordinary.',
    acceptLabel: 'I\'ll make myself useful.',
    stages: [
      { note: 'Help the people of Elder Glen (any of their troubles).', objectives: [{ type: 'signal', id: 'glen-trust', count: 2, text: 'Help the people of Elder Glen: the farms, the mill, the granary, the forge, the Watch' }] },
      { note: 'Go back to Elder Maud.', objectives: [{ type: 'talk', npc: 'maud', text: 'Go back to Elder Maud', reply: 'I\'ve been making myself useful.', say: 'So I hear. Tom Hale was in here an hour ago telling me you\'re "all right, for a sky-person." From Tom that\'s a knighthood. Now: Magus Orren wants to see you. He\'s been reading about people like you, and he looks worse every day. Go and see him at his tower, by the forge.' }] },
      { note: 'See Magus Orren.', objectives: [{ type: 'talk', npc: 'magus', text: 'See Magus Orren', reply: 'Maud sent me.', say: 'Give me your hand. ...Yes. Warm. Warmer than it should be. There is a waystone at the east gate, older than the road, with a wheel cut into it: the Sunwheel. Every one of them in Cresha is the same wheel, I think. Go and put your hand on it, and tell me what it says to you. I suspect it has been waiting for you.' }] },
      { note: 'Lay your hand on the waystone at the east gate.', hook: 'wheel:wake', objectives: [{ type: 'signal', id: 'wheel-woken', text: 'Touch the Sunwheel waystone at the east gate', at: [128, -10] }] },
    ],
    done: 'The wheel answered you. It will carry you now, between any of its stones you have touched. And I think it was the wheel that called you here.',
    rewards: { gold: 60, xp: 120 },
  },
  {
    id: 'mq-crypt', title: 'Lights on the Hill', giver: 'maud', region: 'cresha', main: true, requires: ['mq-stranger'],
    summary: 'Lights in the crypt on the hill, and orcs on the path. An orc warlord, Grukk, is digging under the Glen\'s dead, and somebody is paying him to.',
    offer: 'For a week there have been lights in the old crypt on the hill, and the shepherds have seen orcs. An orc warlord called Grukk has made his den under our dead, and Dora swears his lot pay for bread in iron. Black iron. Who pays an orc in iron? The Glen Wardens are going up. Go with them.',
    acceptLabel: 'I\'ll go with the Wardens.',
    stages: [
      { note: 'Meet the Glen Wardens at the guild hall.', objectives: [{ type: 'talk', npc: 'rook', text: 'Find Rook and the Glen Wardens', reply: 'Maud says I\'m coming with you.', say: 'The sky-person! Brilliant. Lyssa, Garrick, we\'ve got a sky-person. Right. Crypt\'s up the north road. You lead. No, I lead. We\'ll argue on the way.' }] },
      { note: 'Climb to the crypt with the Wardens.', hook: 'crypt:wardens', objectives: [{ type: 'signal', id: 'crypt-door', text: 'Climb to the crypt on the hill with the Wardens (north)', at: [CRYPT_DOOR.x, CRYPT_DOOR.z] }] },
      { note: 'Go down into the crypt and kill Grukk. The Wardens hold the door.', objectives: [{ type: 'signal', id: 'grukk-dead', text: 'Defeat Grukk in the crypt\'s depths', at: [CRYPT.x, CRYPT.y] }] },
      { note: 'Come back up into the light.', hook: 'crypt:malric', objectives: [{ type: 'signal', id: 'crypt-malric', text: 'Leave the crypt', at: [CRYPT_DOOR.x, CRYPT_DOOR.z] }] },
      { note: 'Tell Elder Maud what was waiting at the door.', objectives: [{ type: 'talk', npc: 'maud', text: 'Tell Elder Maud', reply: 'Grukk is dead. Something else was waiting.', say: 'A champion, you said. Like you. From another... master. Gods. And he took whatever Grukk dug up. Go to Orren. Now. He\'ll want every word.' }] },
    ],
    done: 'You\'re not the only one, then. Somehow that\'s worse.',
    rewards: { gold: 150, xp: 280, guildRep: 20 },
  },
  {
    id: 'mq-gravewood', title: 'The Dead Wood', giver: 'magus', region: 'cresha', main: true, requires: ['mq-crypt'],
    summary: 'The dead walk in the Gravewood. Magus Orren believes it is a thin place, where the Dark presses against the world, and that through the Sunwheel you might see what is pushing.',
    offer: 'The Dark. The other side of everything. The library in the Capital has one book about it, and I have read it until the spine broke; it knows less than it pretends to. The Gravewood is a thin place: the Dark leaning on the world. Go to the standing stones on the hill north-west of here, and do what you did at the waystone. Look through the wheel. Then go to the Gravewood and break whatever is leaning.',
    acceptLabel: 'I\'ll look through the wheel.',
    stages: [
      { note: 'Look through the Sunwheel at the standing stones (north-west hills).', objectives: [{ type: 'signal', id: 'ring-rite', text: 'Do the rite at the standing stones: look through the wheel', at: [STANDING_STONES.x, STANDING_STONES.z] }] },
      { note: 'Go into the Gravewood (south-west) and break the curse.', objectives: [{ type: 'signal', id: 'gravewood-cleared', text: 'Break the curse on the Gravewood', at: [GRAVEWOOD.x, GRAVEWOOD.y] }] },
      { note: 'Step through the pedestal\'s wheel into the Dark.', hook: 'gravewood:mirror', objectives: [{ type: 'signal', id: 'mirror-walked', text: 'Do the rite at the Gravewood pedestal and step into the Dark', at: [GRAVEWOOD.x, GRAVEWOOD.y] }] },
      { note: 'Tell Magus Orren what you saw.', objectives: [{ type: 'talk', npc: 'magus', text: 'Tell Magus Orren what you saw in the Dark', reply: 'I was in the Dark. Something there is dying.', say: 'Dying. My book says only that something old rules over there, and that nothing has ever seen it die. If it is dying... no. I don\'t know what that means, and I don\'t like that I don\'t. Whatever brought you here knows. Ask it, not me. And be careful what it asks of you in return.' }] },
    ],
    done: 'This was left with the Order when the ward was raised: Dawnbreaker. It burns clean. Take it. You\'ll need it more than any of us.',
    rewards: { gold: 250, xp: 450, items: [['dawnbreaker', 1]], guildRep: 30 },
  },
  {
    id: 'mq-bells', title: 'The Night of Bells', giver: 'brannoc', region: 'cresha', main: true, requires: ['mq-gravewood'],
    summary: 'Rifts have opened all round the Glen. Brannoc is certain the Dark is coming for the village tonight, and for you.',
    offer: 'Kaela saw rifts at all four corners of the fields last night. Small ones. Feeling for the walls. It\'s coming tonight, and it\'s coming for you. Will you stand with us?',
    acceptLabel: 'I\'ll stand with the Watch.',
    stages: [
      { note: 'Wait for nightfall with the Watch.', objectives: [{ type: 'hour', from: 21, to: 4, text: 'Wait for nightfall (the Watch is at the walls)' }] },
      { note: 'Hold the Glen.', hook: 'bells:siege', objectives: [{ type: 'signal', id: 'bells-held', text: 'Hold Elder Glen through the night' }] },
      { note: 'Dawn. Find Brannoc.', hook: 'bells:dawn', objectives: [{ type: 'talk', npc: 'brannoc', text: 'Find Captain Brannoc at dawn', reply: 'It\'s over.', say: 'It\'s over. For tonight. You were everywhere. Maud\'s ringing the bell for the dead and the bell for the living, and for once the second one\'s louder. And that champion. He ran. From you. Remember that.' }] },
    ],
    done: 'The Glen owes you. Maud has something to say about where you go next.',
    rewards: { gold: 220, xp: 520, guildRep: 40, items: [['healthPotion', 4]] },
  },
];

// ---------------------------------------------------------------------------------------------

/** A spot on the ground near a point. */
const ground = (x: number, z: number) => new THREE.Vector3(x, heightAt(x, z), z);
const around = (p: THREE.Vector3, r: number, a: number) => ground(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r);

export function setupAct1(c: ActCtx) {
  const { story, quests, player } = c;
  const F = story.flags;
  quests.add(...ACT1_QUESTS);
  const busy = () => !!story.director.active;

  // ---- 1. The Fall -----------------------------------------------------------------------
  const fallNight = () => {
    if (F.fallFought || F.fallStarted) return;
    F.fallStarted = true;
    if (!story.h.test) c.time.skipTo(22.8);
    story.h.teleport(ground(FALL_AT.x, FALL_AT.z).add(new THREE.Vector3(0, 0.6, 0)));
    player.yaw = Math.PI; // facing the village
    void story.play('fall', async (s) => {
      await s.fade(1, 0);
      s.bars(true);
      await s.card('Act I', 'The Fifth Summon', '', 3);
      const me = player.pos.clone();
      await s.cam(me.clone().add(new THREE.Vector3(0, 9, 3)), me, 0);
      await s.fade(0, 2.2);
      await s.voice('Five.', 2.2);
      await s.cam(me.clone().add(new THREE.Vector3(3, 2.2, 5)), me.clone().setY(me.y + 0.8), 3);
      await s.voice('Get up. Quickly now. They felt you arrive.', 3.4);
      // A rift tears open in the wheat.
      const rift = around(me, 11, -0.6);
      for (let k = 0; k < 6; k++) story.h.fx.add.spawn({ pos: rift.clone().setY(rift.y + 1.2), spread: 1.6, count: 30, life: [0.4, 1.2], size: [0.3, 0.06], color: 0x7a2aaa, color2: 0x050008, upBias: 1.6 });
      s.shake(0.4);
      await s.cam(me.clone().add(new THREE.Vector3(-2, 2.6, 4)), rift.clone().setY(rift.y + 1), 1.6);
      await s.dark(0.35, 0.8);
      await s.say(null, 'The air splits. Something comes through.', 2.4);
      F.fallRift = `${rift.x},${rift.z}`;
    });
    // When the scene ends, the shades.
    const go = () => {
      if (busy()) return void story.whenFree(go);
      story.darkTo(0.18);
      const [x, z] = String(F.fallRift ?? `${FALL_AT.x + 9},${FALL_AT.z - 6}`).split(',').map(Number);
      story.shades(3, ground(x, z), 3);
      F.fallWave = 1;
      story.voice('Fight. You know how. Your hands remember even if you don\'t.');
    };
    go();
  };
  // The fight in the field: a second wave, then help comes over the wall.
  const fallStep = () => {
    if (!quests.isActive('mq-fall', 0) || !F.fallWave || F.fallFought) return;
    if (F.fallWave === 1 && story.aliveFoes <= 1) {
      F.fallWave = 2;
      const gate = ground(0, 112);
      story.ally('Kaela Voss', LOOKS.kaela, gate.clone().add(new THREE.Vector3(-4, 0, 6)));
      story.ally('Captain Brannoc', BRANNOC_LOOK, gate.clone().add(new THREE.Vector3(4, 0, 6)), true);
      story.ui.subtitle('Kaela Voss', 'There! In the wheat! Brannoc, with me!');
      setTimeout(() => story.ui.subtitle(null, null), 2800);
      story.shades(4, player.pos, 9);
    } else if (F.fallWave === 2 && story.aliveFoes === 0) {
      F.fallFought = true;
      story.darkTo(0);
      quests.signal('fall-survived');
    }
  };
  // (The opening plays once the game has really started: past the title and the creator.)
  quests.hooks.set('fall:night', () => {});
  quests.hooks.set('fall:morning', () => {
    if (F.fallMorning) return;
    F.fallMorning = true;
    void story.play('fall-after', async (s) => {
      s.bars(true);
      await s.say('Captain Brannoc', 'That\'s the third rift this month. They\'ve never come for a person before.');
      await s.say('Kaela Voss', 'Can you stand? You fell out of the sky. I watched you do it.');
      await s.say('Captain Brannoc', 'Get them to Maud. Morning\'s soon enough.');
      await s.fade(1, 1.2);
      story.clearFight();
      if (!story.h.test) c.time.skipTo(8);
      story.h.teleport(ground(MAUD_AT.x, MAUD_AT.z).add(new THREE.Vector3(0, 0.6, 3)));
      story.note(CH[0], 'You fell out of the night sky into the wheat south of Elder Glen. Things from the Dark were waiting. Kaela Voss and Captain Brannoc came over the wall and fought beside you. A voice in your head said one word: "Five."');
      await s.fade(0, 1.4);
    });
  });

  // ---- 2. A stranger: the Glen's troubles count toward its trust -------------------------
  const prevDone = quests.onDone;
  quests.onDone = (q) => {
    prevDone?.(q);
    if (quests.isActive('mq-stranger', 0) && (GLEN_FAVOURS.includes(q.id) || (q.id.startsWith('req:') && q.region === 'elderGlen'))) quests.signal('glen-trust');
  };
  // The waystone at the east gate wakes.
  quests.hooks.set('wheel:wake', () => {
    story.rites.set('wake', (node) => {
      if (node.id !== 'glen' || !quests.wants('wheel-woken')) return null;
      return { label: '(Press your hand flat to the wheel, and listen.)', run: () => { story.h.dialogue.close(); wakeWheel(); } };
    });
  });
  const wakeWheel = () => {
    void story.play('wheel', async (s) => {
      s.bars(true);
      await s.dark(0.1, 0.5);
      await s.say(null, 'The carving goes hot under your palm. Gold light runs out of the spokes and up your arm.', 3);
      await s.voice('There you are.', 2.2);
      await s.voice('I called you. Out of your own world, into this one, as I have called four before you.', 4.2);
      await s.voice('Every wheel in this land is mine. Touch them, and they will carry you.', 3.6);
      await s.voice('Six others fell out of the sky the same night as you. The other powers caught theirs and carried them home: to the Deep Mountains, to the Deep Continent, under the sea. They are being taught. I could only catch you in a wheat field.', 6);
      await s.voice('You will not meet them for a while. When you do, they will be ready. Be readier. And the older ones are already out here, little Fifth. Be quick. Be quicker than the four.', 5);
      await s.dark(0, 0.8);
      await s.card('', 'The Sunwheel Wakes', 'Touch any wheel to travel to another you have touched, or to rest.', 3.6);
    });
    story.awakenWheel();
    story.note(CH[1], 'Elder Glen was afraid of you, so you made yourself useful, and the village began to trust you. Magus Orren sent you to the waystone at the east gate. When you touched it the voice spoke again: it called you here, out of your own world, as it called four before you. Six other champions were summoned the same night, it said, and their masters carried them home to train; you will not meet them for a while. The Sunwheels answer you now.');
    quests.signal('wheel-woken');
    c.save();
  };

  // ---- 3. Lights on the Hill --------------------------------------------------------------
  quests.hooks.set('crypt:wardens', () => {
    if (F.cryptDoor) return;
    // The Wardens walk with you while this stage lasts (and only outdoors).
    F.wardensOut = true;
  });
  const wardensStep = () => {
    if (!story.h.outdoors()) return;
    const want = quests.isActive('mq-crypt', 1) && F.wardensOut;
    if (want && !story.allies.length) {
      const from = player.pos.clone();
      WARDENS.forEach((w, i) => story.ally(w.name, w.look as never, around(from, 4, i * 2), i === 0));
    }
    // At the door: the diggers' leavings come boiling up.
    if (want && !F.cryptDoor && flatDist(player.pos, CRYPT_DOOR) < 22) {
      F.cryptDoor = true;
      void story.play('crypt-door', async (s) => {
        s.bars(true);
        await s.say('Rook Ashdown', 'Hear that? That\'s not orcs.', 2.2);
        await s.say('Lyssa', 'Something\'s coming up out of the dig. Bows!', 2.2);
      }, { holdWorld: false });
      story.shades(4, CRYPT_DOOR, 6);
    }
    if (want && F.cryptDoor && story.aliveFoes === 0 && !F.cryptHeld) {
      F.cryptHeld = true;
      story.ui.subtitle('Garrick', 'Go on down. We\'ll hold the door. Nothing comes up behind you.');
      setTimeout(() => story.ui.subtitle(null, null), 3200);
      quests.signal('crypt-door');
    }
  };
  // Coming up out of the crypt: he is waiting.
  quests.hooks.set('crypt:malric', () => {
    F.wardensOut = false;
  });
  const malricStep = () => {
    if (!quests.isActive('mq-crypt', 3) || F.malricMet || !story.h.outdoors() || busy()) return;
    if (flatDist(player.pos, CRYPT_DOOR) > 30) return;
    F.malricMet = true;
    story.dismissAllies();
    const at = around(CRYPT_DOOR, 7, 1.2);
    void story.play('malric', async (s) => {
      s.bars(true);
      const rook = await s.actor(WARDENS[0].look as never, around(CRYPT_DOOR, 5, 2.4), 0);
      rook.play('crouch', true);
      const m = await s.actor(CHAMPIONS.malric.look, at, 0);
      m.face(player.pos);
      await s.cam(at.clone().add(new THREE.Vector3(3, 2.4, 4)), at.clone().setY(at.y + 1.6), 0);
      await s.say('Ser Malric Dane', 'So you\'re the fifth.');
      await s.champion(4, 'Ser Malric Dane', 'the Wheelbreaker', 'Champion of the Iron Below', 3.2);
      await s.say('Ser Malric Dane', 'Your wardens are breathing. I\'m not a butcher. Grukk was, but Grukk was cheap.');
      await s.say(null, 'He turns a box of black iron over in his gauntlet. The Sunwheel is cut into its lid. Grukk dug it up for him.', 3.4);
      await s.say('Ser Malric Dane', 'Twenty years I\'ve been at this. I came down the same night as your fourth, and I broke him myself. Here is my offer, Fifth: walk away from the Game. Go and be a farmer. The Iron Below will let you.');
      const pick = await s.choose('Ser Malric Dane', 'the Wheelbreaker', 'Walk away. Live a small life. Last chance.', [
        { label: 'Put the box down.', tone: 'threat' },
        { label: 'What happened to the fourth?', tone: 'persuade' },
        { label: 'Maybe you\'re right.', tone: 'kind' },
      ]);
      F.malricChoice = ['defy', 'ask', 'yield'][pick];
      if (pick === 0) await s.say('Ser Malric Dane', 'Ha. Good. They\'re no fun when they don\'t.');
      else if (pick === 1) {
        await s.say('Ser Malric Dane', 'Past Kingsmile, off the Crown Road, there\'s an old battlefield. I broke him there and left him for the Dark. He\'s still standing there. Go and say hello.');
        story.state.clue('malricIron');
      } else await s.say('Ser Malric Dane', 'No you don\'t. None of you ever do. Pity.');
      await s.say('Ser Malric Dane', 'Let\'s see what the Dawn sends me these days.');
      s.remove(m);
      s.remove(rook);
    });
    // A lesson, not a fight you can win: when it's gone far enough, he stops.
    const go = () => {
      if (busy()) return void story.whenFree(go);
      const ch = story.champion('malric', at, { floor: 0.55, intro: false });
      F.malricSpar = 1;
      story.lesson(true);
      ch.onFloor = () => endSpar(true);
    };
    go();
  };
  const endSpar = (hurtHim: boolean) => {
    if (F.malricSpar !== 1) return;
    F.malricSpar = 2;
    story.lesson(false);
    player.invulnerable = true;
    const m = story.champions.find((x) => x.def.id === 'malric');
    void story.play('malric-after', async (s) => {
      s.bars(true);
      if (hurtHim) await s.say('Ser Malric Dane', 'Oh, now. That one I felt.');
      else await s.say('Ser Malric Dane', 'Not yet. You\'re not worth breaking yet.');
      await s.say('Ser Malric Dane', 'Get stronger, Fifth. It\'ll mean more when I do it.');
      await s.fade(1, 0.8);
      m?.dispose();
      story.champions = story.champions.filter((x) => x !== m);
      player.invulnerable = false;
      player.hp = Math.max(player.hp, player.maxHp * 0.4);
      story.state.clue('malricEye');
      story.note(CH[2], `You went up to the crypt with the Glen Wardens and killed Grukk under the Glen's dead. Coming back up, you met Ser Malric Dane, the Wheelbreaker: a champion of the Fourth Age who serves the Iron Below. He paid Grukk in black iron to dig up a box with the Sunwheel on its lid, and he took it. He told you he broke the Dawn's fourth champion himself.${F.malricChoice === 'ask' ? ' He said he broke the fourth on an old battlefield past Kingsmile and left him to the Dark, and that he is still standing there.' : ''} He let you live. "It'll mean more when I do it."`);
      quests.signal('crypt-malric');
      await s.fade(0, 1);
    });
  };

  // ---- 4. The Dead Wood: two rites --------------------------------------------------------
  story.rites.set('ring', (node) => {
    if (node.id !== 'ring' || !quests.wants('ring-rite')) return null;
    return { label: '(Look through the wheel.)', run: () => { story.h.dialogue.close(); ringRite(); } };
  });
  const ringRite = () => {
    const at = ground(STANDING_STONES.x, STANDING_STONES.z);
    void story.play('ring', async (s) => {
      s.bars(true);
      await s.dark(1, 2.2);
      await s.say(null, 'The hill is still there. The stones are still there. But the sky is the colour of a wound, and everything is wrong.', 3.6);
      const gw = ground(GRAVEWOOD.x, GRAVEWOOD.y);
      await s.cam(at.clone().add(new THREE.Vector3(0, 60, 40)), gw, 2.4);
      await s.cam(gw.clone().add(new THREE.Vector3(30, 26, -40)), gw, 2.6);
      await s.say(null, 'Far off, the Gravewood. In the Dark it is a hole, and something on the other side is pushing through it, the way a hand pushes through cloth.', 4);
      await s.voice('He is dying. The king of this place. When he is gone, someone will sit in his chair.', 4);
      await s.voice('Every power in your new world wants it. They sent champions. So did I.', 3.6);
      await s.dark(0, 1.6);
    });
    story.note(CH[3], 'At the standing stones you looked through the Sunwheel and saw the world as it is in the Dark: the same hills under a wounded sky. The Gravewood is a hole in it, and something is pushing through. The voice said the king of the Dark is dying, and every power in the world wants his chair.');
    quests.signal('ring-rite');
  };
  quests.hooks.set('gravewood:mirror', () => {
    story.rites.set('gravewood', (node) => {
      if (node.id !== 'gravewood' || !quests.wants('mirror-walked')) return null;
      return { label: '(Step through the wheel, into the Dark.)', run: () => { story.h.dialogue.close(); mirrorWalk(); } };
    });
  });
  const mirrorWalk = () => {
    void story.play('mirror', async (s) => {
      s.bars(true);
      await s.dark(1, 1.8);
      await s.say(null, 'You step through. The graveyard is the same, and not. The graves are open. Nothing has ever been buried here; everything has only been waiting.', 4);
      await s.voice('Do not stay long. The Dark remembers the shape of anyone who walks in it.', 3.4);
    });
    const go = () => {
      if (busy()) return void story.whenFree(go);
      story.shades(6, player.pos, 8);
      F.mirrorFight = 1;
    };
    go();
  };
  const mirrorStep = () => {
    if (F.mirrorFight !== 1 || story.aliveFoes) return;
    F.mirrorFight = 2;
    void story.play('mirror-out', async (s) => {
      s.bars(true);
      await s.say(null, 'Under the last of them, a voice. Not the one in your head. Older. So tired it is barely a sound at all.', 3.6);
      await s.say('???', '...five...', 2.6);
      await s.say('???', '...they are all so hungry... so hungry for my chair...', 3.6);
      await s.voice('That was him. The Hollow King. Come away now.', 2.8);
      await s.dark(0, 1.6);
    });
    story.note(CH[3], 'You broke the curse on the Gravewood, then stepped through the pedestal\'s wheel into the Dark itself and fought the shades waiting there. Under them, a voice so old and tired it was barely a sound: "they are all so hungry for my chair." The Hollow King.');
    quests.signal('mirror-walked');
  };

  // ---- 5. The Night of Bells --------------------------------------------------------------
  quests.hooks.set('bells:siege', () => {
    if (F.bellsStarted || !story.h.outdoors()) return;
    F.bellsStarted = true;
    void story.play('bells', async (s) => {
      s.bars(true);
      await s.card('Act I', 'The Night of Bells', '', 2.6);
      await s.say('Captain Brannoc', 'Here they come. Every rift at once. Watch! To the pens!');
    }, { holdWorld: false });
    c.raids.start('gloam', 'cows');
    // Who stands with you depends on who you've stood with.
    const friends: { name: string; look: unknown; id: string }[] = [
      { name: 'Kaela Voss', look: LOOKS.kaela, id: 'kaela' },
      { name: 'Rook Ashdown', look: WARDENS[0].look, id: 'rook' },
      { name: 'Garrick', look: WARDENS[2].look, id: 'garrick' },
      { name: 'Lyssa', look: WARDENS[1].look, id: 'lyssa' },
    ];
    let n = 0;
    for (const f of friends) {
      const m = c.rep.moodOf(f.id);
      if (m === 'hostile' || m === 'cold') continue;
      story.ally(f.name, f.look as never, around(player.pos, 4, n * 1.6), n === 0);
      n++;
    }
    F.bellsAllies = n;
    if (n < 2) story.voice('Fewer stand with you than might have. Remember that, when you are kind and when you are not.');
    F.bellsT = 0;
  });
  const bellsStep = (dt: number) => {
    if (!quests.isActive('mq-bells', 1) || !F.bellsStarted || F.bellsHeld) return;
    F.bellsT = Number(F.bellsT ?? 0) + dt;
    // Half-way through the night, he comes himself.
    if (!F.bellsMalric && Number(F.bellsT) > 50 && c.raids.state === 'waves') {
      F.bellsMalric = true;
      const ch = story.champion('malric', around(player.pos, 14, Math.random() * 6), { floor: 0.5, scale: 1 });
      story.ui.subtitle('Ser Malric Dane', 'I said it would mean more. Let\'s see.');
      setTimeout(() => story.ui.subtitle(null, null), 3000);
      ch.onFloor = () => {
        story.ui.subtitle('Ser Malric Dane', 'Enough. Enough! Keep your village. I\'ll take something better.');
        setTimeout(() => story.ui.subtitle(null, null), 3200);
        F.malricRan = true;
        story.h.fx.add.spawn({ pos: ch.center.clone(), spread: 1.4, count: 60, life: [0.4, 1], size: [0.3, 0.06], color: 0x2a2a3a, color2: 0x000000, upBias: 1.2 });
        ch.dispose();
        story.champions = story.champions.filter((x) => x !== ch);
      };
    }
    if (c.raids.state === 'done' || c.raids.state === 'idle') {
      if (Number(F.bellsT) < 5) return;
      F.bellsHeld = true;
      story.clearFight();
      quests.signal('bells-held');
    }
  };
  events.on('raidEnded', ({ won }) => {
    if (quests.isActive('mq-bells', 1)) F.bellsWon = !!won;
  });
  quests.hooks.set('bells:dawn', () => {
    if (F.bellsDawn) return;
    F.bellsDawn = true;
    void story.play('bells-dawn', async (s) => {
      s.bars(true);
      await s.fade(1, 0.8);
      if (!story.h.test && c.time.hour > 4 && c.time.hour < 20) {
        /* (it's day already) */
      } else if (!story.h.test) c.time.skipTo(6);
      await s.fade(0, 1.6);
      await s.voice('You lived. Good. That is more than my fourth managed, his first year.', 3.6);
      await s.voice('There is an Academy by the sea where they make knights. Go there. Grow teeth.', 3.4);
      await s.voice('And find out who killed my four. I would very much like to know.', 3.4);
      await s.card('End of Act I', 'The Fifth Summon', '', 3.6);
    });
    story.note(CH[4], `On the Night of Bells the Dark came for Elder Glen from every rift at once. ${Number(F.bellsAllies) >= 3 ? 'Kaela and the Glen Wardens stood beside you.' : 'Fewer friends stood beside you than might have.'} ${F.malricRan ? 'Ser Malric came himself, and you drove him off.' : ''} ${F.bellsWon === false ? 'The Glen lost animals, but no people.' : 'The Glen held.'} At dawn the voice told you to go to the Knight's Academy in Port Aurelle and grow teeth, and to find out who killed its four champions.`);
  });

  // ---- If you fall: the beat you fell in plays again when you come back ----------------------
  story.fallen.set('act1', () => {
    if (quests.isActive('mq-fall', 0) && F.fallStarted && !F.fallFought) {
      delete F.fallStarted;
      delete F.fallWave;
      delete F.fallRift;
      story.dismissAllies();
    }
    if (quests.isActive('mq-crypt', 1) && F.cryptDoor && !F.cryptHeld) F.cryptDoor = false;
    if (F.malricSpar === 1) {
      story.lesson(false);
      F.malricSpar = 0;
      F.malricMet = false;
    }
    if (F.mirrorFight === 1) F.mirrorFight = 0;
    // He'll be back before the night's out.
    if (F.bellsMalric && !F.malricRan && !F.bellsHeld) {
      F.bellsMalric = false;
      F.bellsT = Math.min(Number(F.bellsT ?? 0), 30);
    }
  });

  return {
    /** fixed step */
    step(dt: number) {
      if (quests.isActive('mq-fall', 0) && !F.fallStarted && !player.dead && story.h.outdoors() && c.ready() && !busy()) fallNight();
      fallStep();
      wardensStep();
      malricStep();
      mirrorStep();
      bellsStep(dt);
      // The lesson at the crypt door: stop before it kills you.
      if (F.malricSpar === 1 && player.hp < player.maxHp * 0.3) endSpar(false);
    },
  };
}

export type { SceneApi };
