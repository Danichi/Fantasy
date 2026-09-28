export type QuestCondition =
  | { type: 'heroicLevel'; value: number }
  | { type: 'disciplineLevel'; discipline: 'gale' | 'boundary' | 'crossblade'; value: number }
  | { type: 'mastery'; discipline: 'gale' | 'boundary' | 'crossblade'; value: number }
  | { type: 'origin'; value: 'human' | 'dragon' | 'demon' }
  | { type: 'actionCount'; action: string; value: number };

export interface ClassQuest {
  id: string;
  name: string;
  classId: string;
  summary: string;
  requirements: QuestCondition[];
  rewards: string[];
}

export const CLASS_QUESTS: ClassQuest[] = [
  { id: 'warrior_trial', name: 'Trial of the Blade', classId: 'warrior', summary: 'Defeat enemies with direct weapon attacks and survive a hard fight.', requirements: [{ type: 'heroicLevel', value: 2 }], rewards: ['Learn Warrior'] },
  { id: 'smith_trial', name: 'The First Forge', classId: 'smith', summary: 'Craft and repair equipment for a working adventurer.', requirements: [{ type: 'heroicLevel', value: 2 }], rewards: ['Learn Smith'] },
  { id: 'herbalist_trial', name: 'Field Herbalism', classId: 'herbalist', summary: 'Identify and safely harvest useful plants.', requirements: [{ type: 'heroicLevel', value: 2 }], rewards: ['Learn Herbalist'] },
  { id: 'hunter_trial', name: 'Hunter in the Wild', classId: 'hunter', summary: 'Track and defeat a creature outside town.', requirements: [{ type: 'heroicLevel', value: 2 }], rewards: ['Learn Hunter'] },
  { id: 'dungeoneer_trial', name: 'Into the Deep', classId: 'dungeoneer', summary: 'Explore a dungeon, survive a trap, and map a new room.', requirements: [{ type: 'heroicLevel', value: 3 }], rewards: ['Learn Dungeoneer'] },
  { id: 'alchemist_trial', name: 'Catalyst and Flask', classId: 'alchemist', summary: 'Brew a useful potion and an offensive flask.', requirements: [{ type: 'heroicLevel', value: 4 }], rewards: ['Learn Alchemist'] },
  { id: 'archer_trial', name: 'Three Perfect Shots', classId: 'archer', summary: 'Land three clean ranged attacks in succession.', requirements: [{ type: 'heroicLevel', value: 3 }], rewards: ['Learn Archer'] },
  { id: 'mage_trial', name: 'First Circle', classId: 'apprentice_mage', summary: 'Cast elemental magic in a live encounter.', requirements: [{ type: 'heroicLevel', value: 3 }], rewards: ['Learn Apprentice Mage'] },
  { id: 'rogue_trial', name: 'The Unseen Edge', classId: 'rogue', summary: 'Avoid detection, use a trap, and land a rear attack.', requirements: [{ type: 'heroicLevel', value: 4 }], rewards: ['Learn Rogue'] },
  { id: 'barrier_trial', name: 'Hold the Line', classId: 'barrier_mage', summary: 'Absorb a heavy magical attack without breaking.', requirements: [{ type: 'heroicLevel', value: 8 }], rewards: ['Learn Barrier Mage'] },
  { id: 'spellbreaker_trial', name: 'Break the Circle', classId: 'spellbreaker', summary: 'Interrupt a hostile spell using a tagged anti-magic ability.', requirements: [{ type: 'heroicLevel', value: 10 }], rewards: ['Learn Spellbreaker'] },
  { id: 'field_architect_trial', name: 'Shape the Battlefield', classId: 'battlefield_architect', summary: 'Create a practical cover route through a dangerous arena.', requirements: [{ type: 'heroicLevel', value: 12 }], rewards: ['Learn Battlefield Architect'] },
  { id: 'storm_sentinel_trial', name: 'Storm Sentinel', classId: 'warrior', summary: 'Master motion and stillness without losing control.', requirements: [
    { type: 'disciplineLevel', discipline: 'gale', value: 15 },
    { type: 'mastery', discipline: 'gale', value: 70 },
    { type: 'disciplineLevel', discipline: 'boundary', value: 10 },
    { type: 'mastery', discipline: 'boundary', value: 50 },
  ], rewards: ['Unlock Storm Sentinel hybrid techniques'] },
];

export function canCompleteQuest(q: ClassQuest, state: {
  heroicLevel: number;
  origin: 'human' | 'dragon' | 'demon';
  disciplines: Record<'gale' | 'boundary' | 'crossblade', { level: number; mastery: number }>;
  counters?: Record<string, number>;
}) {
  return q.requirements.every((r) => {
    if (r.type === 'heroicLevel') return state.heroicLevel >= r.value;
    if (r.type === 'origin') return state.origin === r.value;
    if (r.type === 'disciplineLevel') return state.disciplines[r.discipline].level >= r.value;
    if (r.type === 'mastery') return state.disciplines[r.discipline].mastery >= r.value;
    return (state.counters?.[r.action] ?? 0) >= r.value;
  });
}
