import * as THREE from 'three';
import type { QuestDef, QuestLog } from './questLog';
import type { Interactable } from '../dungeon/instance';
import type { BeastSpawner } from '../enemies/beastSpawner';
import type { FX } from '../fx/particles';
import { heightAt } from '../world/terrainHeight';

// More of Elder Glen's troubles, and a way up through the village: help
// enough people and Maud names you a Friend of the Glen; help Fröst at the
// forge and his better steel goes on sale.

const WOLF_DEN: [number, number] = [-222, 60];
const RING_AT = new THREE.Vector3(104, 0, -101); // in the orchard grass
const CAT_AT = new THREE.Vector3(14, 0, 121); // on the granary hay

export const GLEN_MORE_QUESTS: QuestDef[] = [
  {
    id: 'wolves-at-the-fold', title: 'Wolves at the Fold', giver: 'lyssa', region: 'cresha', requires: ['mq-stranger'],
    summary: 'Lyssa Fen of the Glen Wardens wants the wolf packs west of the village thinned before they take more sheep.',
    offer: 'Three lambs gone this week and a ewe torn open by the west fence. The packs in the western woods have grown bold. Thin them out — five wolves — and the Wardens will pay. Stay away from them in the dark; they hunt better than you see.',
    acceptLabel: 'I\'ll hunt them.',
    stages: [
      { note: 'Hunt wolves in the western woods.', hook: 'wolves:pack', objectives: [{ type: 'kill', kind: 'green', count: 5, text: 'Hunt wolves in the western woods', at: WOLF_DEN, radius: 170 }] },
      { note: 'Report to Lyssa Fen at the guild hall.', objectives: [{ type: 'talk', npc: 'lyssa', text: 'Report to Lyssa Fen', reply: 'The packs are thinned.', say: 'Five? The shepherds will sleep tonight. Here — Warden\'s pay, and a couple of the good draughts.' }] },
    ],
    done: 'You\'ve an eye for the hunt. If you ever want a Warden\'s badge, Garrick and I could use the help.',
    rewards: { gold: 90, xp: 120, items: [['greaterHealthPotion', 2]], guildRep: 15 },
  },
  {
    id: 'echoes-in-the-crypt', title: 'Echoes in the Crypt', giver: 'garrick', region: 'cresha', requires: ['mq-stranger'],
    summary: 'Garrick Stone wants the orc raiders on the crypt hill cut down before they come looking for the village.',
    offer: 'Orcs, on the crypt hill. Not just Grukk — his raiders. I\'d go myself, but the captain has me on the gate. Kill six of them and bring me the tally. A shield-man\'s word: it\'ll be worth your while.',
    stages: [
      { note: 'Cut down the orc raiders around the crypt.', objectives: [{ type: 'kill', kind: 'orc', count: 6, text: 'Cut down orc raiders (the crypt)' }] },
      { note: 'Report to Garrick Stone.', objectives: [{ type: 'talk', npc: 'garrick', text: 'Report to Garrick Stone', reply: 'Six orcs. As promised.', say: 'Six! Ha. I\'ll hear about this at the Wayfarer for a month. Take this — I had it from a knight who didn\'t need it any more.' }] },
    ],
    done: 'A tower shield, for a tower of a fighter. Now go on — I\'ve a gate to stand at.',
    rewards: { gold: 130, xp: 160, items: [['towerShield', 1]], guildRep: 25 },
  },
  {
    id: 'tempered-steel', title: 'Tempered Steel', giver: 'froest', region: 'cresha', requires: ['smiths-ore-run'],
    summary: 'Master Fröst wants to try an old Cinder Guild quench. He needs Emberroot and Silverthistle from the wilds.',
    offer: 'That ore you brought me is good, but plain water makes plain steel. The Cinder Guild quench their blades in an oil of Emberroot and Silverthistle — two of each. They grow wild out past the fields. Bring them, and I\'ll show you what steel can be. And I\'ll open the back of the stall to you.',
    stages: [
      { note: 'Gather Emberroot and Silverthistle from the wilds.', objectives: [
        { type: 'collect', item: 'emberroot', count: 2, text: 'Gather Emberroot' },
        { type: 'collect', item: 'silverthistle', count: 2, text: 'Gather Silverthistle' },
      ] },
      { note: 'Bring them to Master Fröst.', objectives: [{ type: 'talk', npc: 'froest', text: 'Bring the herbs to Master Fröst', reply: 'Your Cinder Guild quench.', say: 'Hssss — listen to that. Smell it. That\'s a blade with a temper.', take: [['emberroot', 2], ['silverthistle', 2]] }] },
    ],
    done: 'The first of the batch is yours: a falchion, single-edged, and it bites deep. The rest is on the stall — the good steel, for you, from now on.',
    rewards: { gold: 60, xp: 140, items: [['falchion', 1]] },
  },
  {
    id: 'lost-ring', title: 'A Ring in the Orchard', giver: 'innkeeper', region: 'cresha',
    summary: 'Mara Bell lost her mother\'s ring picking apples in the north-east orchard.',
    offer: 'You\'ll think me foolish. My mother\'s ring — plain gold, too big for me — slipped off while I was picking apples for the cider. Somewhere in the orchard, north-east of the village. I\'ve looked till dark. You\'ve younger eyes.',
    stages: [
      { note: 'Search the north-east orchard for Mara\'s ring.', hook: 'ring:drop', objectives: [{ type: 'signal', id: 'ring-found', text: 'Find Mara\'s ring in the orchard (look for a glint)', at: [RING_AT.x, RING_AT.z] }] },
      { note: 'Return the ring to Mara Bell.', objectives: [{ type: 'talk', npc: 'innkeeper', text: 'Return the ring to Mara Bell', reply: 'I found your ring.', say: 'Oh — oh, that\'s it. I\'d know it anywhere.' }] },
    ],
    done: 'Your supper\'s on the house for as long as I keep the Wayfarer. And take this.',
    rewards: { gold: 70, xp: 80, items: [['healthPotion', 3]] },
  },
  {
    id: 'bakers-round', title: 'The Baker\'s Round', giver: 'baker', region: 'cresha', requires: ['mq-stranger'],
    summary: 'Tessa Rowan\'s delivery boy is sick. Take the morning loaves round the farms.',
    offer: 'My delivery lad\'s down with a fever and the farms still want their bread. Tom Hale at the cattle pasture, Old Wren in the wheat, and Oswin at the mill. It\'s a nice walk and they\'ll likely feed you.',
    stages: [
      { note: 'Deliver bread to Tom Hale at the cattle pasture.', objectives: [{ type: 'talk', npc: 'hale', text: 'Deliver bread to Tom Hale (west pasture)', reply: 'Bread from Tessa.', say: 'Still warm! Tell Tessa I\'ll bring her butter Friday.' }] },
      { note: 'Deliver bread to Old Wren in the wheat.', objectives: [{ type: 'talk', npc: 'wren', text: 'Deliver bread to Old Wren (south fields)', reply: 'Bread from Tessa.', say: 'Rye! The girl remembered. Bless her.' }] },
      { note: 'Deliver bread to Oswin at the mill.', objectives: [{ type: 'talk', npc: 'oswin', text: 'Deliver bread to Oswin (the mill)', reply: 'Bread from Tessa.', say: 'My own flour, come back to me as a loaf. Tell her thanks.' }] },
      { note: 'Tell Tessa the round is done.', objectives: [{ type: 'talk', npc: 'baker', text: 'Tell Tessa Rowan the round is done', reply: 'All three delivered.', say: 'All three, and before noon! You\'ve legs on you.' }] },
    ],
    done: 'Here — honeycomb from the Hales\' hives, and a bit of coin. Come by any morning.',
    rewards: { gold: 45, xp: 90, items: [['honeycomb', 2]] },
  },
  {
    id: 'pips-cat', title: 'Where\'s Whiskers?', giver: 'pip', region: 'cresha',
    summary: 'Pip\'s cat Whiskers hasn\'t come home. Pip thinks she\'s hiding by the granaries.',
    offer: 'Whiskers didn\'t come home! She\'s grey with one white foot and she hates rain. Dora says she saw her by the granaries chasing rats. Can you look? Please? I\'m not allowed past the fields.',
    acceptLabel: 'I\'ll find Whiskers.',
    stages: [
      { note: 'Look for Whiskers by the granaries, south of the village.', hook: 'cat:hide', objectives: [{ type: 'signal', id: 'cat-found', text: 'Find Whiskers by the granaries', at: [CAT_AT.x, CAT_AT.z] }] },
      { note: 'Tell Pip that Whiskers is safe.', objectives: [{ type: 'talk', npc: 'pip', text: 'Tell Pip that Whiskers is safe', reply: 'Whiskers is on her way home.', say: 'She came in the window an hour ago, all covered in straw! You found her!' }] },
    ],
    done: 'This is my lucky stone. It has a hole all the way through, see? You can have it. It works, honest.',
    rewards: { gold: 15, xp: 60, items: [['luckyCharm', 1]] },
  },
  {
    id: 'letter-for-hester', title: 'A Letter for the Wayfarer', giver: 'stablemaster', region: 'cresha', requires: ['mq-stranger'],
    summary: 'Hobb Reed needs a sealed letter carried east along the King\'s Road to Hester Brightwater at the Wayfarer\'s Rest.',
    offer: 'You look like you\'ve legs for a long walk. This letter goes to Hester Brightwater at the Wayfarer\'s Rest, half-way to the sea along the King\'s Road. My sister. She worries if she doesn\'t hear from me. Take a horse if you like — the road\'s long.',
    stages: [
      { note: 'Carry Hobb\'s letter east to the Wayfarer\'s Rest.', objectives: [{ type: 'talk', npc: 'hester', text: 'Deliver the letter to Hester (Wayfarer\'s Rest, King\'s Road east)', reply: 'A letter from your brother Hobb.', say: 'From Hobb? The great lump never writes. Oh — he\'s bought another horse he can\'t afford. Tell him I said he\'s an idiot, and I love him.' }] },
      { note: 'Bring Hester\'s reply back to Hobb Reed.', objectives: [{ type: 'talk', npc: 'stablemaster', text: 'Bring Hester\'s reply to Hobb Reed', reply: 'Hester says you\'re an idiot. And that she loves you.', say: 'Ha! That\'s her. That\'s exactly her.' }] },
    ],
    done: 'Here — and you can ride any of the mares on the house for a week.',
    rewards: { gold: 60, xp: 130, items: [['healthPotion', 2]] },
  },
  {
    id: 'veyrs-lesson', title: 'The Old Duelist\'s Lesson', giver: 'veyr', region: 'cresha', requires: ['mq-stranger'],
    summary: 'Master Veyr will teach you something worth knowing — once you\'ve shown him you can handle a goblin pack.',
    offer: 'You swing like a farmer threshing. Strength, no patience. Find the goblins that raid the fields and hills after dark and break four of them. Watch their feet, not their blades. Then come back and we\'ll talk about what you learned.',
    stages: [
      { note: 'Defeat goblins.', objectives: [{ type: 'kill', kind: 'cave', count: 4, text: 'Defeat goblins (the hills and fields after dark)' }] },
      { note: 'Return to Master Veyr.', objectives: [{ type: 'talk', npc: 'veyr', text: 'Return to Master Veyr', reply: 'I watched their feet.', say: 'And? They step before they strike. Everything does. Learn to see the step and you will never be surprised again.' }] },
    ],
    done: 'Take this blade. It belonged to a student who stopped listening. You won\'t.',
    rewards: { gold: 110, xp: 160, items: [['bastardSword', 1]] },
  },
  {
    id: 'fish-supper', title: 'Fish for the Wayfarer Inn', giver: 'dora', region: 'cresha',
    summary: 'Dora Sheaf has promised Mara a fish supper for the granary workers. Catch three Glen Perch in the river.',
    offer: 'I told Mara the granary lads would get fish on Friday and now my rod\'s snapped. Three Glen Perch from the river — any stretch, they bite all day. Take them straight to Mara at the inn and she\'ll fry them up.',
    stages: [
      { note: 'Catch three Glen Perch in the river.', objectives: [{ type: 'collect', item: 'glenPerch', count: 3, text: 'Catch Glen Perch in the river' }] },
      { note: 'Bring the fish to Mara Bell at the inn.', objectives: [{ type: 'deliver', npc: 'innkeeper', item: 'glenPerch', count: 3, text: 'Bring 3 Glen Perch to Mara Bell', say: 'Lovely fat ones. Dora\'s lads will eat well tonight — and so will you.' }] },
    ],
    done: 'Dora left your coin with me. And there\'s a plate with your name on it.',
    rewards: { gold: 45, xp: 80, items: [['healthPotion', 1]] },
  },
  {
    id: 'wool-for-vela', title: 'Wool for the Looms', giver: 'tailor', region: 'cresha',
    summary: 'Vela Thread needs raw wool to finish the capital\'s cloak order. Shear the sheep in the north pasture.',
    offer: 'The capital wants forty travelling cloaks by the new moon and I\'m out of wool. The flock in the north pasture is due for shearing — four fleeces would see me through the week. I\'ll make it worth your while.',
    stages: [
      { note: 'Shear four fleeces in the north pasture.', objectives: [{ type: 'collect', item: 'wool', count: 4, text: 'Shear sheep in the north pasture', at: [-62, -172] }] },
      { note: 'Bring the wool to Vela Thread.', objectives: [{ type: 'deliver', npc: 'tailor', item: 'wool', count: 4, text: 'Bring 4 wool to Vela Thread', say: 'Good thick fleece. The capital will think I have magic fingers.' }] },
    ],
    done: 'One of the first cloaks off the loom — lined, and it won\'t let the rain through.',
    rewards: { gold: 40, xp: 90, items: [['wayfarerCloak', 1]] },
  },
  {
    id: 'corvins-rounds', title: 'Walking the Bounds', giver: 'corvin', region: 'cresha', requires: ['mq-stranger'],
    summary: 'Ser Corvin wants the Glen\'s boundary stones checked: the horse paddock, the western woods and the far fields.',
    offer: 'Three boundary stones mark the edge of the Glen\'s land: by the horse paddock in the north-east, at the edge of the western woods, and beyond the far fields in the south. Walk them. If any are toppled or marked, I need to know — that is how raids begin.',
    stages: [
      { note: 'Check the three boundary stones.', objectives: [
        { type: 'reach', at: [60, -176], radius: 12, text: 'Check the north-east stone (horse paddock)' },
        { type: 'reach', at: [-168, -60], radius: 12, text: 'Check the western stone (woods edge)' },
        { type: 'reach', at: [-40, 300], radius: 14, text: 'Check the southern stone (beyond the far fields)' },
      ] },
      { note: 'Report to Ser Corvin.', objectives: [{ type: 'talk', npc: 'corvin', text: 'Report to Ser Corvin', reply: 'All three stones stand.', say: 'Good. Then nothing has crossed our line — yet. You walk the land like a Warden.' }] },
    ],
    done: 'The Wardens will hear of this. Here is a boundary-rider\'s pay.',
    rewards: { gold: 80, xp: 130, guildRep: 20 },
  },
  {
    id: 'milk-for-the-bakery', title: 'Fresh Milk for Tessa', giver: 'baker', region: 'cresha', requires: ['bakers-round'],
    summary: 'Tessa Rowan needs fresh milk for the week\'s cream buns. Milk the cows at Tom Hale\'s pasture.',
    offer: 'Now you know the farms — would you fetch me milk? Three pails from Tom Hale\'s cows. He won\'t mind; he owes me for the bread. Cream buns on Sunday if you do.',
    stages: [
      { note: 'Milk the cows at Tom Hale\'s pasture.', objectives: [{ type: 'collect', item: 'milk', count: 3, text: 'Milk the cows (west pasture)', at: [-150, 60] }] },
      { note: 'Bring the milk to Tessa.', objectives: [{ type: 'deliver', npc: 'baker', item: 'milk', count: 3, text: 'Bring 3 milk to Tessa Rowan', say: 'Still cool from the pail. Perfect.' }] },
    ],
    done: 'A whole tray of yesterday\'s buns and a bit of coin. Don\'t eat them all at once.',
    rewards: { gold: 35, xp: 70, items: [['greaterHealthPotion', 1]] },
  },
  {
    id: 'friend-of-the-glen', title: 'Friend of the Glen', giver: 'maud', region: 'cresha',
    requires: ['missing-heifer', 'crows-in-wheat', 'mill-wheel-jam', 'granary-rats', 'wolves-at-the-fold', 'bakers-round'],
    summary: 'Word of your help has gone round every hearth in Elder Glen. Elder Maud wants to thank you properly.',
    offer: 'Heifers found, crows run off, the mill turning, the granaries clean, the wolves thinned and bread on every table. There\'s not a hearth in Elder Glen that hasn\'t heard your name. Come to the plaza — the village wants to say thank you.',
    acceptLabel: 'I\'d be honoured.',
    stages: [
      { note: 'Stand before the village on the plaza.', objectives: [{ type: 'reach', at: [0, -4], radius: 8, text: 'Stand on the plaza' }] },
      { note: 'Speak with Elder Maud.', objectives: [{ type: 'talk', npc: 'maud', text: 'Speak with Elder Maud', say: 'By the word of the elders, you are a Friend of the Glen. Every door here is open to you, and every table has a place.' }] },
    ],
    done: 'Fröst made this for you — the whole village put coin toward it. A Warden\'s Claymore. Carry it well.',
    rewards: { gold: 300, xp: 400, items: [['claymore', 1]], guildRep: 40 },
  },
];

export interface GlenMoreWorld {
  quests: QuestLog;
  scene: THREE.Scene;
  fx: FX;
  beasts: BeastSpawner;
  toast(msg: string): void;
}

const onGround = (v: THREE.Vector3, dy = 0) => v.clone().setY(heightAt(v.x, v.z) + dy);

/** A small gold ring, lying in the grass with a glint. */
function buildRing() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 8, 20), new THREE.MeshStandardMaterial({ color: 0xffd36a, metalness: 1, roughness: 0.2, emissive: 0x6a4a10, emissiveIntensity: 0.6 }));
  ring.rotation.x = Math.PI / 2 - 0.25;
  ring.position.y = 0.04;
  g.add(ring);
  return g;
}

/** Whiskers: grey, curled up, one white foot. */
function buildCat() {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0x7c7f86, roughness: 1 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 1 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), fur);
  body.scale.set(1.3, 0.8, 1);
  body.position.y = 0.16;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), fur);
  head.position.set(0.24, 0.26, 0);
  g.add(body, head);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.08, 4), fur);
    ear.position.set(0.25, 0.37, s * 0.05);
    g.add(ear);
  }
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 6, 14, Math.PI * 1.2), fur);
  tail.rotation.x = Math.PI / 2;
  tail.position.set(-0.05, 0.05, 0);
  const paw = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), white);
  paw.position.set(0.28, 0.04, 0.08);
  g.add(tail, paw);
  g.traverse((o) => (o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true));
  return g;
}

export function setupGlenMoreQuests(w: GlenMoreWorld) {
  const q = w.quests;
  q.add(...GLEN_MORE_QUESTS);
  const interactables: Interactable[] = [];
  let t = 0;

  // ---- Wolves at the Fold: a pack is waiting in the woods ---------------------------------------
  q.hooks.set('wolves:pack', () => {
    const [x, z] = WOLF_DEN;
    const near = w.beasts.slimes.filter((b) => b.alive && b.kind === 'green' && Math.hypot(b.position.x - x, b.position.z - z) < 90).length;
    const spots: [number, number][] = [[x + 10, z - 8], [x - 6, z + 12], [x + 18, z + 16], [x - 14, z - 14], [x + 4, z + 26]];
    for (let k = near; k < 5; k++) w.beasts.spawn('green', spots[k][0], spots[k][1]);
  });

  // ---- The ring in the orchard ---------------------------------------------------------------------
  const ring = buildRing();
  ring.position.copy(onGround(RING_AT, 0.02));
  ring.visible = false;
  w.scene.add(ring);
  q.hooks.set('ring:drop', () => (ring.visible = true));
  interactables.push({
    pos: onGround(RING_AT), radius: 2,
    label: () => 'Pick up the gold ring',
    enabled: () => q.wants('ring-found'),
    action: () => {
      ring.visible = false;
      w.toast('Plain gold, worn thin. This must be Mara\'s.');
      q.signal('ring-found');
    },
  });

  // ---- Whiskers ---------------------------------------------------------------------------------
  const cat = buildCat();
  cat.position.copy(onGround(CAT_AT));
  cat.rotation.y = 2.2;
  cat.visible = false;
  w.scene.add(cat);
  q.hooks.set('cat:hide', () => (cat.visible = true));
  interactables.push({
    pos: onGround(CAT_AT), radius: 2.2,
    label: () => 'Pick up Whiskers (she\'s purring)',
    enabled: () => q.wants('cat-found'),
    action: () => {
      w.fx.add.spawn({ pos: cat.position.clone().setY(cat.position.y + 0.3), spread: 0.6, count: 14, life: [0.4, 0.9], size: [0.08, 0.02], color: 0xe8d890, color2: 0xb89a50, gravity: 3, upBias: 0.6 });
      cat.visible = false;
      w.toast('Whiskers squirms free and bolts for home.');
      q.signal('cat-found');
    },
  });

  return {
    interactables,
    update(dt: number) {
      t += dt;
      // The ring catches the light now and then so it can be found in the grass.
      if (ring.visible && Math.random() < dt * 1.5) w.fx.add.spawn({ pos: ring.position.clone().setY(ring.position.y + 0.1), spread: 0.05, count: 1, life: [0.2, 0.4], size: [0.22, 0.02], color: 0xfff4c0, color2: 0xffc850 });
      if (cat.visible) cat.children[0].scale.y = 0.8 + Math.sin(t * 2.4) * 0.03; // breathing
      if (!q.wants('ring-found')) ring.visible = false;
      if (!q.wants('cat-found')) cat.visible = false;
    },
  };
}
