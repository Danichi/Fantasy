import * as THREE from 'three';
import { heightAt } from '../world/terrainHeight';
import { DISCOVERY } from '../world/sites/batch5';
import { DeadLord, DROWNED_CAPTAIN, HANGED_LORD, WRAITH } from './deadLords';
import { Delver } from './delver';
import { RAT_QUEEN } from './ratQueen';
import type { BossDef } from './fieldBosses';

// The five discovery bosses (docs/design/sites.md): each lives at one of the
// discovery sites, only comes out when you do the thing there that wakes it,
// and happens once. They're field bosses in every other way: a bar of their
// own, a first sight, phases, a unique drop and a deed. They are never posted
// as bounties: you find them yourself.

const at = (p: { x: number; z: number }, dx = 0, dz = 0) => new THREE.Vector3(p.x + dx, heightAt(p.x + dx, p.z + dz), p.z + dz);
const noBounty = { title: '', description: '', gold: 0, xp: 0, rep: 0, minRank: 99 };

export const DROWNED_CAPTAIN_DEF: BossDef = {
  id: 'drownedCaptain', kind: 'drownedCaptain', name: 'Captain Ansel Hale', title: 'the drowned keeper of the watchtower',
  home: { x: DISCOVERY.drownedTower.x, z: DISCOVERY.drownedTower.z, r: 40 },
  levelBonus: 3, looks: ['undeadDrowned'], abroad: () => true, summoned: true, once: true,
  spawn: (p, level, scene, fx) => new DeadLord(DROWNED_CAPTAIN, p, level, scene, fx),
  rumour: 'East of the old road there\'s a mere that came up over a watchtower in my grandfather\'s day. The garrison drowned at their posts rather than leave it. Fishermen see a green light under the water at night.',
  found: 'Captain Ansel Hale, the drowned keeper of the tower. Weed hangs off his ribs and his sword is a rust-eaten cutlass. His crew are still down there.',
  phaseLines: ['The captain raises his sword, and more of his drowned crew climb out of the mere.', 'The light in the drowned captain\'s skull has gone from green to violet.'],
  unique: 'drownedCompass', uniqueAlso: ['captainsLog'], renown: 2,
  deed: 'Relieved the drowned captain of his watch',
  slain: 'Captain Hale goes down on one knee in the shallows, and then he is only bones and weed. "Relieved," the water seems to say. In his hand: a brass compass, its needle swinging to something that is not north.',
  again: { items: [], gold: [0, 0] }, bounty: noBounty,
};

export const HANGED_LORD_DEF: BossDef = {
  id: 'hangedLord', kind: 'hangedLord', name: 'Red Corwen', title: 'the hanged lord of the road',
  home: { x: DISCOVERY.hangingTree.x, z: DISCOVERY.hangingTree.z, r: 45 },
  levelBonus: 3, looks: ['undeadRevenant'], abroad: () => true, summoned: true, once: true,
  spawn: (p, level, scene, fx) => new DeadLord(HANGED_LORD, p, level, scene, fx),
  rumour: 'You know the Hanging Tree, out west by the road? Red Corwen swung there, the robber lord who took the king\'s silver train. They never found the silver. They say he\'s buried with it, and at midnight he gets up to count it.',
  found: 'Red Corwen, the Hanged Lord. Dried grey skin, a long coat, the noose still round his neck and his lantern burning. He wants his silver back.',
  phaseLines: ['Red Corwen lifts his lantern, and the hanged men under the tree get up.', 'Red Corwen\'s lantern burns violet.'],
  unique: 'hangmansKnot', renown: 2,
  deed: 'Put Red Corwen back in his grave',
  slain: 'Red Corwen\'s lantern goes out, and he falls in a heap of coat and rope. The noose comes loose in your hand, knotted the old way, thirteen turns.',
  again: { items: [], gold: [0, 0] }, bounty: noBounty,
};

export const WRAITH_DEF: BossDef = {
  id: 'circleWraith', kind: 'circleWraith', name: 'The Wraith of the Wrong Circle', title: 'what the backwards wheel let in',
  home: { x: DISCOVERY.wrongCircle.x, z: DISCOVERY.wrongCircle.z, r: 35 },
  levelBonus: 4, looks: ['undeadWraith'], abroad: () => true, summoned: true, once: true,
  spawn: (p, level, scene, fx) => new DeadLord(WRAITH, p, level, scene, fx),
  rumour: 'There\'s a ring of stones on the highest hill in the kingdom, east of here. Somebody cut the Sunwheel into them backwards. The priests say that\'s a door, not a prayer. Don\'t go up there at the full moon.',
  found: 'The Wraith of the Wrong Circle: a skull in a deep hood, a robe of grave-black, long clawed hands. The light of the warding stones clings to it. Put them out.',
  phaseLines: ['The wraith shrieks, and the warding stones flare.', 'The wraith\'s eyes burn violet.'],
  unique: 'backwardsWheel', renown: 3,
  deed: 'Closed the door in the Wrong Stone Circle',
  slain: 'The wraith comes apart like smoke in the wind. The stones go dark. On the altar, where it stood: an amulet, the Sunwheel cut backwards, cold as the moon.',
  again: { items: [], gold: [0, 0] }, bounty: noBounty,
};

export const DELVER_DEF: BossDef = {
  id: 'delver', kind: 'delver', name: 'The Delver', title: 'the blind thing in the old mine',
  home: { x: DISCOVERY.mine.x, z: DISCOVERY.mine.z, r: 40 },
  levelBonus: 4, looks: ['delver'], abroad: () => true, summoned: true, once: true,
  spawn: (p, level, scene, fx) => new Delver(p, level, scene, fx),
  rumour: 'The silver mine up in the north hills closed when the miners started going missing in the deep workings. Something dug through from below, they said. The ground still shakes up there if you walk heavy.',
  found: 'The Delver. Blind, the size of a cart, with spade claws as long as your arm and stone grown into its back. It hunts by the sound of your feet: walk soft.',
  phaseLines: ['The Delver tears back into the earth, faster now.', 'The crystals in the Delver\'s back have gone violet.'],
  unique: 'delverCrystal', uniqueAlso: ['delverClaw'], renown: 3,
  deed: 'Killed the Delver of the old mine',
  slain: 'The Delver rolls onto its side and the ground stops shaking. One of the crystals in its back comes away in your hand, still warm, still faintly glowing.',
  again: { items: [], gold: [0, 0] }, bounty: noBounty,
};

export const DISCOVERY_BOSSES: BossDef[] = [DROWNED_CAPTAIN_DEF, RAT_QUEEN, HANGED_LORD_DEF, WRAITH_DEF, DELVER_DEF];
void at;
