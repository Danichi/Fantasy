import * as THREE from 'three';
import type { QuestDef, QuestLog } from './questLog';
import type { Interactable } from '../dungeon/instance';
import type { Encounters } from '../world/encounters';
import type { BeastSpawner } from '../enemies/beastSpawner';
import type { Player } from '../player/player';
import type { WorldMats } from '../world/buildings';
import { Bandit } from '../enemies/bandit';
import { Wagon, Follower } from '../world/caravans';
import { heightAt } from '../world/terrainHeight';
import { road, pointAlong, distanceAlong } from '../world/roadNetwork';
import { HOLLOW_RIDGE, PILGRIM_SPOT, CHAPEL, WAYFARERS_REST, GULL_RIDGE, BROKEN_MILESTONE } from '../world/kingsRoad';

// The King's Road side quests (World Expansion phase 4): the bandits of
// Hollow Ridge, the lost pilgrim, the Wayfarer's supply run, the wolf among
// Millbrook's sheep, escorting Zarek's spice wagon, the broken milestone
// (another Sunwheel) and a small favour for the Iron Lanterns.

const SHEEP_FIELD = new THREE.Vector3(600, 0, 34);

export const ROAD_QUESTS: QuestDef[] = [
  {
    id: 'hollow-ridge', title: 'The Bandits of Hollow Ridge', giver: 'tove', region: 'kingsRoad',
    summary: 'Varn the Hollow and his cutthroats rob travellers from a camp up the Hollow Ridge trail. Sergeant Tove wants them gone.',
    offer: 'Three wardens for forty miles of road, and a bandit chief named Varn sitting pretty on Hollow Ridge. His crossbowmen have killed two carters this month. Take the trail north from the old mile-post, burn his camp out and bring me proof Varn is done.',
    stages: [
      { note: 'Follow the Hollow Ridge trail north to the bandit camp.', objectives: [{ type: 'reach', at: [HOLLOW_RIDGE.x, HOLLOW_RIDGE.z], radius: 30, text: 'Find the bandit camp on Hollow Ridge' }] },
      { note: 'Defeat Varn the Hollow and his bandits.', hook: 'hollow:camp', objectives: [
        { type: 'kill', kind: 'bandit', count: 6, text: 'Defeat the bandits', at: [HOLLOW_RIDGE.x, HOLLOW_RIDGE.z], radius: 120 },
        { type: 'kill', kind: 'banditChief', count: 1, text: 'Defeat Varn the Hollow', at: [HOLLOW_RIDGE.x, HOLLOW_RIDGE.z], radius: 160 },
      ] },
      { note: 'Report to Sergeant Tove at the Wayfarer\'s Rest.', objectives: [{ type: 'talk', npc: 'tove', text: 'Report to Sergeant Tove', say: 'Varn\'s crossbow? Then it\'s done. The carters will drink to you tonight, and so will I.' }] },
    ],
    done: 'The Crown pays bounties, and this one is yours. The Guild will hear of it too.',
    rewards: { gold: 240, xp: 280, items: [['healthPotion', 3]], guildRep: 70 },
  },
  {
    id: 'lost-pilgrim', title: 'The Lost Pilgrim', giver: 'aldous', region: 'kingsRoad',
    summary: 'Sister Wynne left the road to pray at a woodland shrine and never came back. Brother Aldous fears the worst.',
    offer: 'Sister Wynne walked into the woods north of the road three days ago to pray at the old shrine, and she has not come back. The wolves are bold this year. Would you look for her? She\'ll be somewhere past the road, north of the Lantern Camp.',
    stages: [
      { note: 'Search the woods north of the road for Sister Wynne.', hook: 'pilgrim:lost', objectives: [{ type: 'reach', at: [PILGRIM_SPOT.x, PILGRIM_SPOT.z], radius: 10, text: 'Find Sister Wynne in the northern woods' }] },
      { note: 'Bring Sister Wynne safely back to the Chapel of the Dawn.', hook: 'pilgrim:follow', objectives: [{ type: 'signal', id: 'pilgrim-home', text: 'Escort Sister Wynne to the chapel', at: [CHAPEL.x, CHAPEL.z] }] },
      { note: 'Speak with Brother Aldous.', objectives: [{ type: 'talk', npc: 'aldous', text: 'Speak with Brother Aldous', say: 'Wynne! Praise the Dawn. And praise you, traveller, who walked into the dark for a stranger.' }] },
    ],
    done: 'Take this with the chapel\'s blessing. May your roads be short and your fires warm.',
    rewards: { gold: 90, xp: 150, items: [['healthPotion', 2], ['manaPotion', 2]] },
  },
  {
    id: 'wayfarer-supply', title: 'The Wayfarer\'s Supply Run', giver: 'hester', region: 'kingsRoad',
    summary: 'Hester needs fresh supplies from Elder Glen\'s farms for the inn\'s kitchen.',
    offer: 'The caravan that brings my eggs and milk from Elder Glen broke an axle, and I\'ve a full house tonight. Six wheat sheaves, two jugs of milk and six eggs, from the Glen\'s farms, and you\'ll eat free for a week.',
    stages: [
      { note: 'Bring wheat, milk and eggs from Elder Glen\'s farms to Hester.', objectives: [
        { type: 'deliver', npc: 'hester', item: 'wheat', count: 6, text: 'Bring 6 wheat sheaves to Hester', say: 'Good golden wheat. That\'s tomorrow\'s bread.' },
        { type: 'deliver', npc: 'hester', item: 'milk', count: 2, text: 'Bring 2 jugs of milk to Hester', say: 'Still sweet. Lovely.' },
        { type: 'deliver', npc: 'hester', item: 'egg', count: 6, text: 'Bring 6 eggs to Hester', say: 'Not a crack among them. You carry eggs like a baker.' },
      ] },
    ],
    done: 'You\'ve saved my supper service. Here, and the stew is on the house whenever you pass.',
    rewards: { gold: 90, xp: 90 },
  },
  {
    id: 'wolf-among-sheep', title: 'A Wolf Among the Sheep', giver: 'garth', region: 'kingsRoad',
    summary: 'Something far bigger than a wolf has been taking Millbrook\'s sheep at night. Old Garth wants it stopped.',
    offer: 'Four ewes gone in a fortnight, and the tracks... big as a dinner plate. That\'s no wolf. That\'s a dire wolf, come down from the hills. It comes after dark. Watch the flock tonight and put it down, and I\'ll give you the best fleeces I have.',
    stages: [
      { note: 'Watch Millbrook\'s flock after dark.', objectives: [
        { type: 'hour', from: 20.5, to: 4.5, text: 'Wait for dark (20:30)' },
        { type: 'reach', at: [SHEEP_FIELD.x, SHEEP_FIELD.z], radius: 30, text: 'Watch over Millbrook\'s sheep' },
      ] },
      { note: 'Kill the dire wolf.', hook: 'dire:hunt', objectives: [{ type: 'kill', kind: 'dire', count: 1, text: 'Kill the dire wolf', at: [SHEEP_FIELD.x, SHEEP_FIELD.z], radius: 200 }] },
      { note: 'Tell Old Garth the beast is dead.', objectives: [{ type: 'talk', npc: 'garth', text: 'Tell Old Garth', say: 'Dead? You\'re sure? Then my flock sleeps easy for the first time since spring.' }] },
    ],
    done: 'The best fleeces from the spring shearing. And a shepherd\'s thanks, which is worth more than it sounds.',
    rewards: { gold: 150, xp: 220, items: [['wool', 4]], guildRep: 30 },
  },
  {
    id: 'spice-wagon', title: 'Escort the Spice Wagon', giver: 'zarek', region: 'kingsRoad',
    summary: 'Zarek\'s spice wagon must reach Gull Ridge, where a Port Aurelle buyer waits. Bandits know it is coming.',
    offer: 'My spice wagon leaves for Gull Ridge today. A buyer from Port Aurelle waits there with a purse the size of a melon. But the road talks, and bandits listen. Ride beside my driver, keep her safe, and a fair share of that purse is yours.',
    acceptLabel: 'I\'ll guard the wagon.',
    stages: [
      { note: 'Escort the spice wagon from the Wayfarer\'s Rest to Gull Ridge. Stay close: it waits for you.', hook: 'wagon:go', objectives: [{ type: 'signal', id: 'wagon-arrived', text: 'Escort the wagon to Gull Ridge', at: [GULL_RIDGE.x, GULL_RIDGE.z] }] },
    ],
    done: 'The wagon made it! Zarek\'s share of the purse will find you through the guild.',
    rewards: { gold: 200, xp: 200, items: [['emberroot', 2], ['honeycomb', 2]] },
  },
  {
    id: 'broken-milestone', title: 'The Broken Milestone', giver: 'milestone', region: 'kingsRoad',
    summary: 'A cracked milestone on the King\'s Road bears the same Sunwheel as the stone by the crypt.',
    offer: '', stages: [
      { note: 'Tell Magus Orren about the Sunwheel on the broken milestone.', objectives: [{ type: 'talk', npc: 'magus', text: 'Tell Magus Orren about the milestone', reply: 'There\'s a Sunwheel on a milestone on the King\'s Road.', say: 'On the road itself? Then the King\'s Road was laid on something older — an ancient way, marked with the wheel, running to the sea. Whoever built it wanted to reach the coast. I wonder what they sailed to.' }] },
    ],
    done: 'Every Sunwheel you find is a step along their road. Keep walking it.',
    rewards: { gold: 60, xp: 160 },
  },
  {
    id: 'lantern-wax', title: 'Wax for the Lanterns', giver: 'dagna', region: 'kingsRoad',
    summary: 'The Iron Lanterns need beeswax to make new candles for their lamps.',
    offer: 'The Iron Lanterns without lanterns. Pell used our last candles to light his pipe. Wild honeycomb has good wax in it; find two in the woods and we\'ll make it worth your while.',
    stages: [{ note: 'Find two wild honeycombs for the Iron Lanterns.', objectives: [{ type: 'deliver', npc: 'dagna', item: 'honeycomb', count: 2, text: 'Bring 2 wild honeycombs to Dagna', say: 'That\'ll make a dozen candles. Pell, apologise to the nice adventurer.' }] }],
    done: 'You ever want to run with the Lanterns for a job, you know where our fire is.',
    rewards: { gold: 60, xp: 80, guildRep: 15 },
  },
];

export interface RoadQuestWorld {
  quests: QuestLog;
  scene: THREE.Scene;
  player: Player;
  mats: WorldMats;
  encounters: Encounters;
  beasts: BeastSpawner;
  toast(msg: string): void;
  talk(who: string, title: string, text: string, opts: { label: string; run: () => void }[]): void;
  close(): void;
}

export function setupRoadQuests(w: RoadQuestWorld) {
  const q = w.quests;
  q.add(...ROAD_QUESTS);
  const interactables: Interactable[] = [];
  const kr = road('kings');
  const v = (x: number, z: number) => new THREE.Vector3(x, heightAt(x, z), z);

  // ---- Hollow Ridge camp ----------------------------------------------------------------
  let campUp = false;
  q.hooks.set('hollow:camp', () => {
    if (campUp) return;
    campUp = true;
    const h = HOLLOW_RIDGE;
    const spots: [number, number, 'sword' | 'crossbow'][] = [[-6, 4, 'sword'], [5, 5, 'sword'], [-2, -4, 'sword'], [8, -3, 'sword'], [-12, -6, 'crossbow'], [11, -8, 'crossbow']];
    for (const [dx, dz, role] of spots) w.encounters.addBandit(new Bandit(role, v(h.x + dx, h.z + dz), w.scene, w.encounters.bolts));
    w.encounters.addBandit(new Bandit('chief', v(h.x + 2, h.z - 9), w.scene, w.encounters.bolts));
  });

  // ---- The Lost Pilgrim ----------------------------------------------------------------
  let wynne: Follower | null = null;
  const makeWynne = () => (wynne ??= new Follower(w.scene, { body: 'female', outfit: 'peasant', hair: 'buns', hairColor: 0xd2b26a, skin: 0xfff0e6, linen: 0xf0e0a8, cloth: 0xe0c060, height: 1.64 }, v(PILGRIM_SPOT.x, PILGRIM_SPOT.z), 'Sister Wynne'));
  q.hooks.set('pilgrim:lost', () => {
    makeWynne();
    w.beasts.spawn('green', PILGRIM_SPOT.x + 18, PILGRIM_SPOT.z + 10);
    w.beasts.spawn('green', PILGRIM_SPOT.x - 14, PILGRIM_SPOT.z + 16);
  });
  q.hooks.set('pilgrim:follow', () => {
    makeWynne().following = true;
    w.toast('Sister Wynne: "Bless you! Lead on, I\'ll keep up."');
  });
  q.hooks.set('lost-pilgrim:done', () => {
    if (wynne) {
      wynne.following = false;
      wynne.pos.copy(v(CHAPEL.x + 3, CHAPEL.z - 13));
    }
  });

  // ---- A Wolf Among the Sheep ----------------------------------------------------------------
  q.hooks.set('dire:hunt', () => {
    if (w.beasts.slimes.some((b) => b.alive && b.kind === 'dire')) return;
    w.beasts.spawn('dire', SHEEP_FIELD.x - 40, SHEEP_FIELD.z - 35);
    w.toast('A low howl rolls down from the hills. Something is coming for the flock.');
  });

  // ---- Escort the Spice Wagon -----------------------------------------------------------
  let wagon: Wagon | null = null;
  let driver: Follower | null = null;
  let s0 = 0, s1 = 0, ambushed = false;
  const ambush: Bandit[] = [];
  q.hooks.set('wagon:go', () => {
    s0 = distanceAlong(kr, WAYFARERS_REST.x, WAYFARERS_REST.z + 26);
    s1 = distanceAlong(kr, GULL_RIDGE.x, GULL_RIDGE.z + 40);
    wagon ??= new Wagon(w.scene, w.mats, 0x7a3f8a);
    wagon.s = s0;
    driver ??= new Follower(w.scene, { body: 'female', outfit: 'ranger', hair: 'long', hairColor: 0x1f1a17, skin: 0x7a4e32, cloth: 0x7a3f8a, height: 1.7 }, v(WAYFARERS_REST.x, WAYFARERS_REST.z + 26), 'Dessa the Driver');
    ambushed = false;
  });

  // ---- The Broken Milestone ----------------------------------------------------------------
  interactables.push({
    pos: BROKEN_MILESTONE, radius: 2.6,
    label: () => (q.status('broken-milestone') === 'available' ? 'Examine the broken milestone' : 'A broken milestone, carved with a Sunwheel'),
    enabled: () => q.status('broken-milestone') === 'available',
    action: () => w.talk('A Broken Milestone', 'King\'s Road', 'The milestone has cracked in two. On the back of the fallen half, under the lichen, someone long ago carved a wheel of eight bent rays: the Sunwheel. The King\'s masons never cut this.', [
      { label: 'Remember it for Magus Orren.', run: () => { q.accept('broken-milestone'); w.talk('A Broken Milestone', 'King\'s Road', 'You trace the wheel with your finger and fix it in your memory.', [{ label: 'Leave.', run: () => w.close() }]); } },
    ]),
  });

  return {
    interactables,
    update(dt: number) {
      if (wynne) wynne.update(dt, w.player.pos, wynne.following ? 'idle' : q.isActive('lost-pilgrim', 0) ? 'sit' : 'idle');
      if (wynne?.following && wynne.pos.distanceTo(CHAPEL) < 22) q.signal('pilgrim-home');
      if (wagon && q.isActive('spice-wagon')) {
        const wp = pointAlong(kr, wagon.s);
        const near = Math.hypot(w.player.pos.x - wp.x, w.player.pos.z - wp.z) < 28;
        const blocked = ambush.some((b) => !b.dead && b.alive);
        wagon.speed = near && !blocked ? 2.6 : 0;
        wagon.s = Math.min(s1, wagon.s + wagon.speed * dt);
        wagon.place(wagon.s, 1, dt);
        if (driver) {
          driver.following = false;
          const seat = pointAlong(kr, wagon.s - 1);
          driver.pos.set(seat.x, 0, seat.z);
          driver.yaw = wagon.yaw;
          driver.update(dt, driver.pos, wagon.speed > 0.2 ? 'walk' : 'idle');
        }
        // Halfway, bandits spring from the brush.
        if (!ambushed && wagon.s > (s0 + s1) / 2) {
          ambushed = true;
          const p = pointAlong(kr, wagon.s + 18);
          const side = new THREE.Vector2(-p.dir.y, p.dir.x);
          for (const [lat, along, role] of [[12, 0, 'sword'], [-12, 6, 'sword'], [18, 14, 'crossbow']] as const) {
            const b = new Bandit(role, v(p.x + side.x * lat + p.dir.x * along, p.z + side.y * lat + p.dir.y * along), w.scene, w.encounters.bolts);
            b.alerted = true;
            ambush.push(b);
            w.encounters.addBandit(b);
          }
          w.toast('Dessa: "Ambush! Keep them off the wagon!"');
        }
        if (wagon.s >= s1 - 0.5) {
          q.signal('wagon-arrived');
          wagon.speed = 0;
        }
      }
    },
  };
}

