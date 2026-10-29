import * as THREE from 'three';
import type { QuestDef } from '../quests/questLog';
import { heightAt } from '../world/terrainHeight';
import { STANDING_STONES, sunwheelTexture } from '../world/glenLandmarks';
import { crownAt } from '../world/crownRoad';
import { CHAMPIONS } from './champions';
import type { ActCtx } from './act1';

// Act III, part one: The Four Who Came Before. The Dawn's four dead each
// carried a spoke of the Sunwheel, and each spoke is where its champion fell:
// at Elin's grave in the wilds, in Ser Oswald's lost tomb under Hollow Ridge,
// at Harrow Ford where Ser Hallam held the line and young Corvin took his
// sword, and in the rusted armour of Ser Tobin, which the Dark has been
// wearing on an old battlefield for five years. Set the spokes in the oldest
// wheel and it turns; and the turning is felt, across the Dark, by things
// that have been alive for a thousand years.

const CH = ['Act III · The Four Who Came Before', 'Act III · The Turning of the Wheel'];
const ground = (x: number, z: number) => new THREE.Vector3(x, heightAt(x, z), z);

/** Harrow Ford: a cairn by the Crown Road where Ser Hallam fell. */
const HF = crownAt(820, -42);
export const HARROW_FORD = new THREE.Vector3(HF.x, HF.y, HF.z);
const RING = ground(STANDING_STONES.x, STANDING_STONES.z);

export const ACT3_QUESTS: QuestDef[] = [
  {
    id: 'mq-four', title: 'The Four Who Came Before', giver: 'librarian', region: 'royalCapital', main: true, requires: ['mq-wheelbreaker'],
    summary: 'Each of the Dawn\'s four dead champions carried a spoke of the Sunwheel. Find where each one fell.',
    offer: 'The box Malric threw you: a spoke. The chronicles mention them: each of the summoned carried one, and each was lost where its champion fell. Elin\'s grave. Ser Oswald\'s tomb, under Hollow Ridge. Harrow Ford, where Ser Hallam died; Ser Corvin was there. And Ser Tobin... nobody knows. Find them. Find all four.',
    acceptLabel: 'I\'ll find the four.',
    stages: [
      { note: 'Find where the Dawn\'s four champions fell, and the spoke each one carried.', hook: 'four:begin', objectives: [
        { type: 'signal', id: 'spoke-elin', text: 'Elin: find the First Champion\'s grave (the lost champion\'s camps, in the wilds)' },
        { type: 'talk', npc: 'ingrid', text: 'Ser Oswald: ask Ingrid about the Hollow Ridge caves', reply: 'Mell says you went looking for an old knight\'s tomb under Hollow Ridge.', say: 'Ten years ago. My party. Five of us. We heard there was a knight buried in those caves with gold in his hands, and we went in after it. I came out. I went back for them. There was nothing to bring home. If you go: the tomb is past where the smugglers dig now. Deeper. Don\'t go alone.' },
        { type: 'signal', id: 'spoke-oswald', text: 'Ser Oswald: clear the Hollow Ridge caves and find his tomb (King\'s Road)' },
        { type: 'talk', npc: 'corvin', text: 'Ser Hallam: ask Ser Corvin about Harrow Ford', reply: 'Mell says you were at Harrow Ford.', say: 'I was nineteen. Ser Hallam held the ford with a dozen of us against things I still don\'t have names for, and when he fell the line broke, so I picked up his sword and his name and told them Ser Hallam still stood. It held. I have been him ever since. I left his seal on the cairn. It was never mine to wear. The ford is on the Crown Road, west of the outpost.' },
        { type: 'signal', id: 'spoke-hallam', text: 'Ser Hallam: do the rite at the cairn at Harrow Ford (Crown Road)', at: [HARROW_FORD.x, HARROW_FORD.z] },
        { type: 'signal', id: 'spoke-tobin', text: 'Ser Tobin: the battlefield past Kingsmile, where Malric broke him (Crown Road)' },
      ] },
      { note: 'Take what you\'ve found to Master Quill at the Royal Library.', objectives: [{ type: 'talk', npc: 'librarian', text: 'Tell Master Quill what you found', reply: 'I found all four.', say: 'All four. Gods. Elin\'s grave, Oswald\'s tomb, Hallam\'s cairn, and poor Tobin. Five spokes, with the one in the black box. The chronicles say the oldest wheel has twelve sockets: the ring of stones above your Elder Glen. Set them there. And then, I suppose, we\'ll see what turns.' }] },
    ],
    done: 'Go carefully. The chronicles all end the same way: "as the old wheel turns."',
    rewards: { gold: 600, xp: 1400 },
  },
  {
    id: 'mq-turning', title: 'The Turning of the Wheel', giver: 'librarian', region: 'cresha', main: true, requires: ['mq-four'],
    summary: 'Set the five spokes in the oldest Sunwheel, the ring of standing stones above Elder Glen.',
    offer: '',
    stages: [
      { note: 'Set the spokes in the ring of standing stones above Elder Glen.', hook: 'turning:ring', objectives: [{ type: 'signal', id: 'wheel-turned', text: 'Set the spokes in the standing stones (north-west of Elder Glen)', at: [RING.x, RING.z] }] },
      { note: 'Go back to Elder Glen. You need to sit down.', objectives: [{ type: 'talk', npc: 'maud', text: 'Go home to Elder Glen', reply: 'Maud. I saw something in the Dark.', say: 'Sit. Drink this. No, all of it. ...You look like Wren\'s father did, when he came back from the hard winter. Whatever it was, it let you go. Hold on to that. Now tell me everything, slowly.' }] },
    ],
    done: 'Whatever comes next, the Glen is behind you.',
    rewards: { gold: 400, xp: 1800, guildRep: 80 },
  },
];

export interface Act3Hooks {
  scene: THREE.Scene;
  /** Elin's grave read (the site's journal page) */
  elinRead(): boolean;
  /** the Hollow Ridge caves cleared */
  hollowCleared(): boolean;
  /** the Rust Knight brought down */
  rustKnightDown(): boolean;
}

/** The cairn at Harrow Ford: piled stones, a broken lance, and the Sunwheel on the standing stone. */
function buildCairn(scene: THREE.Scene) {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 0.95 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x5a564e, roughness: 1 });
  const y = HARROW_FORD.y;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2, r = 1.1 + (i % 3) * 0.3;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35 + (i % 4) * 0.08, 0), i % 2 ? stone : dark);
    m.position.set(Math.cos(a) * r, 0.25 + (i % 3) * 0.18, Math.sin(a) * r);
    m.rotation.set(i, i * 2, 0);
    g.add(m);
  }
  const mound = new THREE.Mesh(new THREE.ConeGeometry(1.3, 1.4, 7), dark);
  mound.position.y = 0.6;
  g.add(mound);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.6, 0.45), stone);
  post.position.set(0, 1.3, -1.9);
  g.add(post);
  const wheel = new THREE.Mesh(new THREE.CircleGeometry(0.34, 24), new THREE.MeshStandardMaterial({ map: sunwheelTexture('rgba(255, 214, 120, 1)'), emissive: 0xffc060, emissiveMap: sunwheelTexture(), emissiveIntensity: 0.5, transparent: true }));
  wheel.position.set(0, 1.9, -1.66);
  g.add(wheel);
  const lance = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 3.2, 6), new THREE.MeshStandardMaterial({ color: 0x6a4a2a }));
  lance.position.set(0.9, 1.2, 0.2);
  lance.rotation.z = 0.35;
  g.add(lance);
  g.position.set(HARROW_FORD.x, y, HARROW_FORD.z);
  g.rotation.y = HF.yaw;
  g.traverse((o) => ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true)));
  scene.add(g);
  return g;
}

export function setupAct3(c: ActCtx, h: Act3Hooks) {
  const { story, quests, player } = c;
  const F = story.flags;
  quests.add(...ACT3_QUESTS);
  const busy = () => !!story.director.active;
  buildCairn(h.scene);
  const spoke = (id: string, who: string, text: string) => {
    if (F['spoke:' + id]) return;
    F['spoke:' + id] = true;
    c.give('sunwheelSpoke', 1);
    story.note(CH[0], text);
    story.voice(who);
    quests.signal('spoke-' + id);
    c.save();
  };

  // Harrow Ford's rite.
  story.rites.set('harrow', (node) => {
    if (node.id !== 'harrow' || !quests.wants('spoke-hallam')) return null;
    return {
      label: '(Lay your hand on the stone, for Ser Hallam.)', run: () => {
        story.h.dialogue.close();
        void story.play('harrow', async (s) => {
          s.bars(true);
          await s.dark(0.6, 1.4);
          await s.say(null, 'For a moment the ford is full of shapes. A dozen soldiers, and a tall knight at the front with the Sunwheel on his shield, and a boy of nineteen just behind him.', 4.4);
          await s.say('Ser Hallam', 'Hold. Hold! Nothing crosses!', 2.6);
          await s.say(null, 'The knight goes down. The boy picks up his sword. The line holds.', 3.2);
          await s.dark(0, 1.4);
          await s.say(null, 'Under the stone, where your hand was: a spoke of old gold, and a knight\'s seal ring.', 3);
        });
        c.give('hallamsSeal', 1);
        spoke('hallam', 'Hallam. My third. He held. They always hold, my champions, right up until they don\'t.', 'At Harrow Ford on the Crown Road you laid your hand on the cairn and saw Ser Hallam, the Dawn\'s third, hold the ford until he fell, and nineteen-year-old Corvin pick up his sword. Under the stone was a spoke, and Hallam\'s seal ring.');
      },
    };
  });

  // The turning: five spokes in the oldest wheel.
  quests.hooks.set('turning:ring', () => {
    story.rites.set('turning', (node) => {
      if (node.id !== 'ring' || !quests.wants('wheel-turned')) return null;
      const n = c.count('sunwheelSpoke') + c.count('blackIronBox');
      if (n < 5) return { label: `(The sockets wait. You carry ${n} of the five spokes.)`, run: () => story.h.dialogue.close() };
      return { label: '(Set the five spokes in the wheel.)', run: () => { story.h.dialogue.close(); turnWheel(); } };
    });
  });
  const turnWheel = () => {
    if (F.turning) return;
    F.turning = 1;
    void story.play('turning', async (s) => {
      s.bars(true);
      await s.cam(RING.clone().add(new THREE.Vector3(9, 5, 9)), RING.clone().setY(RING.y + 1.5), 0);
      await s.say(null, 'One by one the spokes go into the sockets, and lock, and the ring of stones begins, very slowly, to turn.', 3.6);
      await s.voice('Yes. Yes. Five spokes. Five of twelve. It has been a thousand years since my wheel turned this far.', 4);
      s.shake(0.4);
      await s.dark(1, 2.4);
      await s.say(null, 'And across the Dark, something notices.', 2.6);
      await s.voice('...Oh. Oh no. Get away from the wheel. Get away from the wheel!', 3);
    });
    const go = () => {
      if (busy()) return void setTimeout(go, 200);
      const at = RING.clone().add(new THREE.Vector3(-8, 0, -6));
      const ws = story.champion('wheelShield', at, { floor: 0.999 });
      ws.onFloor = () => {};
      F.turning = 2;
      F.turningT = 0;
      story.ui.subtitle('The Wheel-Shield', 'Five.');
      setTimeout(() => story.ui.subtitle(null, null), 2400);
    };
    go();
  };
  // You cannot win this. You can only last, until someone older than the Game decides to step in.
  const turningStep = (dt: number) => {
    if (F.turning !== 2) return;
    F.turningT = Number(F.turningT) + dt;
    const near = player.hp < player.maxHp * 0.22;
    if (Number(F.turningT) < 35 && !near) return;
    F.turning = 3;
    player.invulnerable = true;
    const ws = story.champions.find((x) => x.def.id === 'wheelShield');
    void story.play('ysra', async (s) => {
      s.bars(true);
      const at = player.pos.clone();
      await s.cam(at.clone().add(new THREE.Vector3(6, 3, 6)), at.clone().setY(at.y + 1.4), 0);
      await s.say(null, 'The Wheel-Shield raises his backwards wheel over you, and the air under it is thick as tar, and you understand that this is how the four died. Every one of them. Exactly like this.', 4.6);
      const y = await s.actor(CHAMPIONS.ysra.look, at.clone().add(new THREE.Vector3(4, 0, -3)), 0);
      y.face(ws?.position ?? at);
      await s.champion(1, 'Ysra the Undying', 'the Thornmother\'s Blade', 'Champion of the Verdant Mother', 3.6);
      await s.say('Ysra the Undying', 'Not this one. Not yet.', 2.6);
      await s.say('The Wheel-Shield', '...', 2);
      await s.say(null, 'Two things that have been alive for a thousand years look at each other over your head. The grass between them goes grey. Then the Wheel-Shield lowers his shield, and is simply not there any more.', 5);
      await s.say('Ysra the Undying', 'Little sapling. I knew your first. Elin. She was braver than you, and she died anyway.', 3.6);
      await s.say('Ysra the Undying', 'The Thornmother has not decided what you are for. When she has, I will come for you. Grow, until then. Grow fast.', 4);
      s.remove(y);
      await s.dark(0, 2);
      await s.voice('I... I did not think he still walked. He killed my first. He kills them all, in the end. Every age.', 4);
      await s.voice('Whose is he? I don\'t know. Even I don\'t know. Find out. Please.', 3.6);
      await s.card('End of Act III, Part One', 'The Four Who Came Before', 'The story continues in the elven woods, under the mountains and across the sea.', 5);
    });
    const after = () => {
      if (busy()) return void setTimeout(after, 200);
      story.clearFight();
      player.invulnerable = false;
      player.hp = Math.max(player.hp, player.maxHp * 0.5);
      story.state.meet('ysra');
      story.note(CH[1], 'You set five spokes in the oldest wheel and it turned, and something across the Dark noticed: the Wheel-Shield, a champion of the First Age with a backwards Sunwheel on his shield, who has killed every one of the Dawn\'s champions, in every age. You could not touch him. Ysra the Undying, the Verdant Mother\'s First Age champion, stepped in: "Not this one. Not yet." Then she told you to grow fast, because one day she will come for you too. Even the voice does not know whose the Wheel-Shield is.');
      F.turning = 4;
      quests.signal('wheel-turned');
      c.save();
    };
    after();
  };

  return {
    step(dt: number) {
      if (quests.wants('spoke-elin') && h.elinRead()) spoke('elin', 'Elin. My first. She asked me, at the end, whether it had been worth it. I didn\'t know what to tell her.', 'Elin\'s grave lay at the last of her three camps in the wilds, her sword planted on it. Under her last journal page: a spoke of the Sunwheel. "The one who calls you is not your friend, and not your enemy. It wants the chair, and it will spend you to get it."');
      if (quests.wants('spoke-oswald') && h.hollowCleared() && story.h.outdoors()) spoke('oswald', 'Oswald. My second. He went down into the Dark after something of mine, and I let him.', 'Deep under Hollow Ridge, past where the smugglers dig, you found Ser Oswald Marr\'s tomb, and Ingrid\'s lost party beside it. In his hands, a spoke of the Sunwheel.');
      if (quests.wants('spoke-tobin') && h.rustKnightDown()) {
        if (!F.tobinScene) {
          F.tobinScene = true;
          void story.play('tobin', async (s) => {
            s.bars(true);
            await s.say(null, 'The rusted helm rolls clear. Inside, something like a man\'s face, for a moment, and a man\'s voice, very tired.', 3.6);
            await s.say('Ser Tobin Reyes', 'You\'re the fifth? ...I\'m sorry. I\'m sorry. Malric was stronger. Then the Dark was. Don\'t let it in. Don\'t ever let it in.', 4.4);
            await s.say(null, 'In the breastplate, where a heart would be: a spoke of old gold, black with rust.', 3);
          });
        }
        spoke('tobin', 'Tobin. My fourth. I could not reach him, after. I tried.', 'The Rust Knight on the old battlefield past Kingsmile was Ser Tobin Reyes, the Dawn\'s fourth, broken by Malric and left for the Dark. When you brought him down he spoke, for a moment, in his own voice: "Don\'t ever let it in." In his breastplate was a spoke.');
      }
      turningStep(dt);
    },
  };
}
