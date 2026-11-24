// The Proving Grounds' move list (docs/design/combat-flow.md): every fluid move,
// how to do it, and the scenario that suits it best. A move is ticked the first
// time you pull it off (its `combatMove` id, or `impact:<kind>` for the world).

export interface MoveEntry {
  id: string;
  name: string;
  how: string;
  group: 'Flow' | 'Movement' | 'Vertical' | 'Crowd' | 'World';
  /** the scenario that suits it */
  where?: string;
}

export const MOVE_LIST: MoveEntry[] = [
  { group: 'Flow', id: 'heavy', name: 'Heavy Attack', how: 'Press R for a heavy. Hold R to charge; release on the full-charge cue.' },
  { group: 'Flow', id: 'link1', name: 'Heavy Branch', how: 'Light attack, then R as the follow-up window opens. The live guide shows the branch.' },
  { group: 'Flow', id: 'dodgeCounter', name: 'Counter Slide', how: 'Dodge (Space) just as a blow lands, then attack.', where: 'melee' },
  { group: 'Flow', id: 'riposte', name: 'Riposte', how: 'Parry (F) just as a blow lands, then attack.', where: 'melee' },
  { group: 'Flow', id: 'dodgeOffset', name: 'Dodge Offset', how: 'Dodge out of a string, then attack: the string carries on where it was.' },
  { group: 'Flow', id: 'feint', name: 'Feint', how: 'Dodge during the wind-up of a swing (costs stamina).' },
  { group: 'Flow', id: 'shieldPush', name: 'Shield Drive', how: 'Guard, move forward and press R for Shield Drive. After blocking a blow, attack for the guard counter.', where: 'shield' },
  { group: 'Flow', id: 'skillWeave', name: 'Skill Weave', how: 'Use a technique right after a blow lands, before the swing ends.' },
  { group: 'Movement', id: 'thrust', name: 'Lunge', how: 'Move forward and light attack. Sprint + light gives the running attack.' },
  { group: 'Movement', id: 'retreatCut', name: 'Retreat Cut', how: 'Move away from a foe and attack.' },
  { group: 'Movement', id: 'sideSweep', name: 'Sweep', how: 'Move across a foe and attack.' },
  { group: 'Movement', id: 'sprintAttack', name: 'Charging Strike', how: 'Sprint (Shift) and attack.' },
  { group: 'Movement', id: 'slideTackle', name: 'Slide Tackle', how: 'Sprint and kick (G). It slides much further down the slope off the high ground.' },
  { group: 'Movement', id: 'risingCut', name: 'Rising Cut', how: 'Attack as a roll or step ends.' },
  { group: 'Vertical', id: 'launcher', name: 'Launcher', how: 'Jump (C) during a string, once a cut has swung. Light foes go up.', where: 'dummy' },
  { group: 'Vertical', id: 'airSlash1', name: 'Air String', how: 'After a launcher, attack in the air to keep them up.', where: 'dummy' },
  { group: 'Vertical', id: 'airSlash3', name: 'Falling Strike', how: 'Finish the air string: the third cut drives them down.', where: 'dummy' },
  { group: 'Vertical', id: 'airAttack', name: 'Plunge', how: 'Kick (G) in the air, or attack while falling with nothing to cut.' },
  { group: 'Vertical', id: 'vault', name: 'Vault', how: 'Dodge toward a reeling or shield-raised foe close in front: you go over and land behind.', where: 'shield' },
  { group: 'Vertical', id: 'wallKick', name: 'Wall Kick', how: 'Jump, then jump again against a wall (the slam wall, east).' },
  { group: 'Vertical', id: 'hookYank', name: 'Hook Yank', how: 'Grappling hook (key 4) at a light foe: it is pulled off its feet to you.', where: 'dummy' },
  { group: 'Vertical', id: 'hookZip', name: 'Hook Zip', how: 'Grappling hook at a heavy foe: you fly in and arrive cutting.', where: 'iron' },
  { group: 'Crowd', id: 'dashStrike', name: 'Dash Strike', how: 'Use the grappling hook to arrive cutting; normal attacks never choose a dash from enemy distance.', where: 'crowd' },
  { group: 'World', id: 'impact:wall', name: 'Wall Slam', how: 'Kick (G) or charge a foe into a wall.', where: 'world' },
  { group: 'World', id: 'impact:fence', name: 'Through the Fence', how: 'Knock a foe into the fence (north).', where: 'world' },
  { group: 'World', id: 'impact:brazier', name: 'Into the Fire', how: 'Knock a foe into a brazier.', where: 'world' },
  { group: 'World', id: 'impact:water', name: 'Soaked', how: 'Knock a foe into the pool (south-east).', where: 'world' },
  { group: 'World', id: 'impact:barrel', name: 'Barrel Roll', how: 'Kick a barrel at a foe.', where: 'world' },
  { group: 'World', id: 'impact:ledge', name: 'Off the Edge', how: 'Knock a foe off the high ground (north-west).', where: 'world' },
];

export const MOVE_IDS = new Set(MOVE_LIST.map((m) => m.id));
