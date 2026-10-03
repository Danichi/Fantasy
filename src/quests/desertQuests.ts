import * as THREE from 'three';
import type { QuestDef, QuestLog } from './questLog';
import type { Interactable } from '../dungeon/instance';
import type { FX } from '../fx/particles';
import { heightAt } from '../world/terrainHeight';
import { SUNSPIRE, SUNSPIRE_HALF, SUNSPIRE_GATE_Z, SCAV_CAMPS } from '../world/desert/desertLayout';
import { SAWTOOTH_BASIN, WARDEN_AT as WARDEN } from '../world/desert/goldenExpanse';

// The Golden Expanse's first stories: Zarek points you down the Caravan Way;
// the scavengers outside Ghagrabba's walls have work (and grudges); the Sun
// Guard wants the basin's old shark dead; and the Vizier has lost something
// he would rather the Queen never knew about.

const GATE: [number, number] = [SUNSPIRE.x + SUNSPIRE_HALF.x + 26, SUNSPIRE_GATE_Z];
const at = (k: number): [number, number] => [SCAV_CAMPS[k][0], SCAV_CAMPS[k][1]];
const STRONGBOX = new THREE.Vector3(SCAV_CAMPS[3][0] - 6, 0, SCAV_CAMPS[3][1] + 5);

export const DESERT_QUESTS: QuestDef[] = [
  {
    id: 'the-warden-below', title: 'The Warden Below', giver: 'mereth', region: 'Golden Expanse', requires: ['silk-road-west'],
    summary: 'Captain Mereth\'s scouts have seen the southern dunes heave like something breathing. The old scrolls call it the Warden: a golem of the old kingdom, asleep under the sand.',
    offer: 'Four scouts went south of the Bone Wells. Two came back, and they will not say what they saw — only that a dune stood up. Princess Nefret says the palace scrolls speak of a Warden left by the kings before ours. Go south-west of the city, past the Bone Wells. Walk softly. When the ground shakes, do not stand still.',
    acceptLabel: 'I\'ll find the Warden.',
    stages: [
      { note: 'Find the Warden under the southern sands, and destroy it.', objectives: [{ type: 'kill', kind: 'sandGolem', count: 1, text: 'Destroy the Warden of the Sands (south-west of the city)', at: [WARDEN.x, WARDEN.z], radius: 300 }] },
      { note: 'Report to Captain Mereth.', objectives: [{ type: 'talk', npc: 'mereth', text: 'Report to Captain Mereth at the east gate', reply: 'The Warden is sand again.', say: 'Then the southern caravans can run again. The Queen will hear of it — and the Princess will want every detail.' }] },
    ],
    done: 'From the palace armoury, by the Queen\'s leave. You have earned the right to carry the sun.',
    rewards: { gold: 600, xp: 1100, items: [['sunsteelScimitar', 1], ['greaterHealthPotion', 3]], guildRep: 50 },
  },
  {
    id: 'raider-season', title: 'Raider Season', giver: 'elder-6', region: 'Golden Expanse',
    summary: 'The raider camps strike the friendly villages every few weeks. The elder of Dunewatch wants them driven off.',
    offer: 'Rattle Hollow, the Cinder Pits, Skifftown, Bleached Ribs — raider camps, all of them, and every one feeds on villages like ours. Break their fighters. Ten of them. Then they will think twice before coming for our water.',
    stages: [
      { note: 'Defeat raiders from the hostile camps.', objectives: [{ type: 'kill', kind: 'scavenger', count: 10, text: 'Defeat scavenger raiders (any raider camp)' }] },
      { note: 'Return to the elder of Dunewatch.', objectives: [{ type: 'talk', npc: 'elder-6', text: 'Return to the elder of Dunewatch', reply: 'The raiders have been taught a lesson.', say: 'Ten! The children can fetch water without a guard again. You are welcome at every fire in the Expanse.' }] },
    ],
    done: 'We have little, but we share it.',
    rewards: { gold: 160, xp: 380, items: [['greaterHealthPotion', 2], ['duneGlass', 2]] },
  },
  {
    id: 'silk-road-west', title: 'The Caravan Way', giver: 'zarek', region: 'Golden Expanse', requires: ['mq-crypt'],
    summary: 'Zarek the Wanderer wants a letter carried west along the Caravan Way to Bazaar Master Hassun in Ghagrabba, the gold city of the Sunborn.',
    offer: 'You have the look of someone who walks far. Ghagrabba — the gold city in the Golden Expanse — sits at the end of the Caravan Way, west off the Crown Road before the capital gate. Carry this letter to Bazaar Master Hassun. Keep to the road: the sand out there has teeth.',
    acceptLabel: 'I\'ll take the letter west.',
    stages: [
      { note: 'Follow the Caravan Way west to the Waystop.', objectives: [{ type: 'reach', at: at(5), radius: 30, text: 'Reach the Waystop on the Caravan Way (far west)' }] },
      { note: 'Reach the gates of Ghagrabba.', objectives: [{ type: 'reach', at: GATE, radius: 28, text: 'Reach Ghagrabba\'s east gate' }] },
      { note: 'Deliver Zarek\'s letter to Bazaar Master Hassun.', objectives: [{ type: 'talk', npc: 'hassun', text: 'Deliver the letter to Hassun (the Grand Bazaar)', reply: 'A letter from Zarek the Wanderer.', say: 'Zarek! Still alive, the old goat. He writes that you are reliable. In Ghagrabba that is rarer than water.' }] },
    ],
    done: 'For your trouble: Ghagrabba silk, and a merchant prince\'s good opinion. Spend both wisely.',
    rewards: { gold: 150, xp: 320, items: [['sunSilk', 1]] },
  },
  {
    id: 'scrap-for-rusk', title: 'Rust and Glass', giver: 'rusk', region: 'Golden Expanse',
    summary: 'Old Rusk of the Rust Market pays for scrap dug out of the wreck-heaps at the Hulks and the Bone Wells.',
    offer: 'You\'ve got two arms and no sense — perfect for digging. The heaps at the Hulks and the Bone Wells are full of plate and bolt. Six pieces of scrap and I\'ll pay you fair. Fairer than the city, anyway. Mind the raiders squatting out there.',
    stages: [
      { note: 'Dig six pieces of scrap from the wreck-heaps.', objectives: [{ type: 'collect', item: 'scrapMetal', count: 6, text: 'Dig scrap at the Hulks or the Bone Wells', at: at(4) }] },
      { note: 'Bring the scrap to Old Rusk.', objectives: [{ type: 'deliver', npc: 'rusk', item: 'scrapMetal', count: 6, text: 'Bring 6 scrap metal to Old Rusk', say: 'Good heavy plate. The furnaces will melt it and sell it back to us as nails. That\'s the city for you.' }] },
    ],
    done: 'Here — I hammered this out of a skiff\'s keel. It\'s ugly. So am I. We both work.',
    rewards: { gold: 80, xp: 160, items: [['scrapCleaver', 1]] },
  },
  {
    id: 'teeth-of-the-dunes', title: 'Teeth of the Dunes', giver: 'rusk', region: 'Golden Expanse',
    summary: 'Sand sharks have been taking scavengers off the dune trails. Old Rusk wants three of them dead.',
    offer: 'Lost two diggers to sharks this month. You see a fin cutting the sand, you don\'t run — they\'re faster. You wait for the leap, step aside, and while it\'s flopping on the sand you put steel in it. Three of them. Then come back and tell me how scared you were.',
    stages: [
      { note: 'Hunt three sand sharks.', objectives: [{ type: 'kill', kind: 'sandShark', count: 3, text: 'Hunt sand sharks (dodge or parry the leap, strike while it\'s stranded)' }] },
      { note: 'Return to Old Rusk.', objectives: [{ type: 'talk', npc: 'rusk', text: 'Return to Old Rusk', reply: 'Three sharks.', say: 'Three! The diggers will sing about you. Badly, but they will.' }] },
    ],
    done: 'Take these. A shark tooth on a cord keeps the next one away. So they say.',
    rewards: { gold: 140, xp: 260, items: [['sharkTooth', 2], ['greaterHealthPotion', 2]] },
  },
  {
    id: 'glasswind-raiders', title: 'The Queen of Glasswind', giver: 'tamsa', region: 'Golden Expanse',
    summary: 'Raiders squatting at Glasswind rob the Waystop\'s travellers. Their leader calls herself a queen.',
    offer: 'The raiders at Glasswind took my brother\'s skiff and two waterskins off a family of five last week. Their boss — Vash — calls herself the Queen of Glasswind, as if the dunes need another queen. Break them. North-east of the city, past the Rust Market.',
    stages: [
      { note: 'Break the raiders at Glasswind and defeat Vash.', objectives: [
        { type: 'kill', kind: 'scavenger', count: 4, text: 'Defeat Glasswind raiders', at: at(1), radius: 160 },
        { type: 'kill', kind: 'scavengerChief', count: 1, text: 'Defeat Vash, Queen of Glasswind', at: at(1), radius: 160 },
      ] },
      { note: 'Tell Tamsa the road is safe.', objectives: [{ type: 'talk', npc: 'tamsa', text: 'Return to Tamsa at the Waystop', reply: 'Glasswind is broken.', say: 'Then the families can walk to the city again. You don\'t know what that means out here. Thank you.' }] },
    ],
    done: 'It\'s not much — everything we have is not much — but take it.',
    rewards: { gold: 220, xp: 420, items: [['greaterHealthPotion', 3], ['duneGlass', 2]] },
  },
  {
    id: 'old-sawtooth', title: 'Old Sawtooth', giver: 'mereth', region: 'Golden Expanse', requires: ['teeth-of-the-dunes'],
    summary: 'Captain Mereth has posted a bounty on Old Sawtooth, the giant sand shark of the southern basin.',
    offer: 'You are the one who hunts sharks for the scavengers. Then hunt one for the Crown. Old Sawtooth — three times the length of any other, scarred white — has taken four caravans in the southern basin. He leaps more than once. Kill him and the Sun Guard will owe you a debt.',
    stages: [
      { note: 'Slay Old Sawtooth in the southern basin.', objectives: [{ type: 'kill', kind: 'sawtooth', count: 1, text: 'Slay Old Sawtooth (the southern basin)', at: [SAWTOOTH_BASIN.x, SAWTOOTH_BASIN.z], radius: 400 }] },
      { note: 'Report to Captain Mereth at the east gate.', objectives: [{ type: 'talk', npc: 'mereth', text: 'Report to Captain Mereth', reply: 'Old Sawtooth is dead.', say: 'Truly? The caravan masters will weep with joy. Or they will raise their prices. One of the two.' }] },
    ],
    done: 'The palace smiths made this from his own jaw, by the Queen\'s order. Bear it in her name.',
    rewards: { gold: 500, xp: 900, items: [['sawtoothFang', 1]], guildRep: 40 },
  },
  {
    id: 'the-lost-caravan', title: 'The Vizier\'s Seal', giver: 'ankhet', region: 'Golden Expanse', requires: ['silk-road-west'],
    summary: 'A palace caravan carrying the Queen\'s seal never arrived. Vizier Ankhet wants it found before the Queen asks.',
    offer: 'A caravan left the palace for the coast carrying the Queen\'s own seal — a writ that opens every gate in the Expanse. It never reached the Waystop. The Saltreach scavengers are... resourceful. Find the seal. Quietly. The Queen need not be troubled.',
    acceptLabel: 'I\'ll find it. Quietly.',
    stages: [
      { note: 'Search Saltreach for the lost caravan\'s strongbox.', objectives: [{ type: 'signal', id: 'seal-found', text: 'Find the caravan\'s strongbox at Saltreach (west of the city)', at: [STRONGBOX.x, STRONGBOX.z] }] },
      { note: 'Return the seal to Vizier Ankhet.', objectives: [{ type: 'talk', npc: 'ankhet', text: 'Return the seal to Vizier Ankhet', reply: 'Your seal.', say: 'Ah. And intact. You have saved me a very unpleasant conversation. The Queen would like to meet you — I may have mentioned you.', take: [['sunSeal', 1]] }] },
      { note: 'Kneel before Queen Neferah in the Court of the Sun.', objectives: [{ type: 'talk', npc: 'neferah', text: 'Present yourself to Queen Neferah (the Court of the Sun)', reply: 'Your Majesty.', say: 'So you are Ankhet\'s secret. He thinks I do not know about the seal. I know everything that happens in my city — and a great deal outside it. You did well.' }] },
    ],
    done: 'Take a sunsteel blade from my own armoury. Should you ever wish to serve the Sun, my door is open. Ankhet\'s is not, but mine is.',
    rewards: { gold: 300, xp: 600, items: [['sunsteelScimitar', 1], ['sunSilk', 2]] },
  },
];

/** The quests, plus the Saltreach strongbox the Vizier's errand needs. */
export function setupDesertQuests(quests: QuestLog, scene: THREE.Scene, fx: FX, give: (item: string, n: number) => void, toast: (m: string) => void) {
  quests.add(...DESERT_QUESTS);
  const y = heightAt(STRONGBOX.x, STRONGBOX.z);
  STRONGBOX.y = y;
  const box = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.85 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd4a640, roughness: 0.35, metalness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.7), wood);
  body.position.y = 0.3;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.1, 10, 1, false, 0, Math.PI), wood);
  lid.rotation.z = Math.PI / 2;
  lid.position.y = 0.6;
  const band = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.08, 0.72), gold);
  band.position.y = 0.45;
  box.add(body, lid, band);
  box.position.copy(STRONGBOX);
  box.rotation.y = 0.6;
  scene.add(box);
  const interactables: Interactable[] = [{
    pos: STRONGBOX, radius: 2.2,
    label: () => (quests.wants('seal-found') ? 'Break open the strongbox' : 'An empty strongbox, gold-banded'),
    enabled: () => quests.wants('seal-found'),
    action: () => {
      give('sunSeal', 1);
      fx.add.spawn({ pos: STRONGBOX.clone().setY(y + 0.8), spread: 1, count: 20, life: [0.4, 0.9], size: [0.1, 0.02], color: 0xffd76a, color2: 0xb88a29, upBias: 1 });
      toast('Under a tarp of sand-silk: a gold seal stamped with the Sunwheel.');
      quests.signal('seal-found');
    },
  }];
  return { interactables };
}
