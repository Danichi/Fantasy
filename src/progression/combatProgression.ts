/**
 * Data-driven character progression.
 *
 * Origin = innate identity. Heroic Legacy = the protagonist's slow legendary
 * class. Combat disciplines = how the character fights. Learned classes =
 * professions/general training.
 */
export type OriginId = 'human' | 'dragon' | 'demon';
export type DisciplineId = 'gale' | 'boundary' | 'crossblade';
export type SpecializationId =
  | 'gale_vanguard' | 'gale_duelist' | 'gale_skirmisher'
  | 'boundary_sentinel' | 'boundary_controller' | 'boundary_counterblade'
  | 'crossblade_ravager' | 'crossblade_crossguard' | 'crossblade_twin_dancer';
export type LearnedClassId =
  | 'warrior' | 'smith' | 'herbalist' | 'hunter' | 'dungeoneer'
  | 'alchemist' | 'rogue' | 'archer' | 'apprentice_mage' | 'acolyte'
  | 'miner' | 'cook' | 'farmer' | 'fisherman' | 'carpenter'
  | 'leatherworker' | 'tailor' | 'tinkerer' | 'summoner' | 'barrier_mage'
  | 'spellbreaker' | 'geomancer' | 'battlefield_architect';

export interface TrackState { level: number; xp: number; mastery: number; skillPoints: number; }
export interface OriginDefinition { id: OriginId; name: string; summary: string; passives: string[]; abilities: string[]; }
export interface DisciplineDefinition { id: DisciplineId; name: string; resource: 'momentum' | 'focus' | 'opening'; summary: string; specializations: SpecializationId[]; }
export interface SpecializationDefinition { id: SpecializationId; name: string; discipline: DisciplineId; summary: string; pinnacle: string; }
export interface ClassDefinition { id: LearnedClassId; name: string; rarity: 'common' | 'uncommon' | 'rare'; summary: string; }

export const ORIGINS: Record<OriginId, OriginDefinition> = {
  human: { id: 'human', name: 'Human', summary: 'Adaptable hero with broad learning potential.', passives: ['Rapid Learning', 'Flexible Training'], abilities: ['Heroic Adaptation'] },
  dragon: { id: 'dragon', name: 'Dragon', summary: 'Draconic blood grants fire resistance, flight and breath weapons.', passives: ['Innate Fire Resistance', 'Draconic Physique', 'Dragon Senses', 'Minor Flight'], abilities: ['Dragon Breath', "Dragon's Descent"] },
  demon: { id: 'demon', name: 'Demon', summary: 'Demonic physiology grants regeneration and infernal combat traits.', passives: ['Demonic Regeneration', 'Demonic Physiology', 'Darkvision', 'Infernal Affinity'], abilities: ['Hellstep', 'Demonic Hide', 'Blood Awakening', 'Demon Form'] },
};

export const DISCIPLINES: Record<DisciplineId, DisciplineDefinition> = {
  gale: { id: 'gale', name: 'Gale', resource: 'momentum', summary: 'Speed, rhythm and continuous chains.', specializations: ['gale_vanguard', 'gale_duelist', 'gale_skirmisher'] },
  boundary: { id: 'boundary', name: 'Boundary', resource: 'focus', summary: 'Anchored space control and interception.', specializations: ['boundary_sentinel', 'boundary_controller', 'boundary_counterblade'] },
  crossblade: { id: 'crossblade', name: 'Crossblade', resource: 'opening', summary: 'Offhand parries create openings for the main hand.', specializations: ['crossblade_ravager', 'crossblade_crossguard', 'crossblade_twin_dancer'] },
};

export const SPECIALIZATIONS: Record<SpecializationId, SpecializationDefinition> = {
  gale_vanguard: { id: 'gale_vanguard', name: 'Gale Vanguard', discipline: 'gale', summary: 'Mobile sword-and-shield flow.', pinnacle: 'Stormguard' },
  gale_duelist: { id: 'gale_duelist', name: 'Gale Duelist', discipline: 'gale', summary: 'High-speed precision with a small offhand.', pinnacle: 'Flashblade' },
  gale_skirmisher: { id: 'gale_skirmisher', name: 'Gale Skirmisher', discipline: 'gale', summary: 'In-and-out movement fighting.', pinnacle: 'Windrunner' },
  boundary_sentinel: { id: 'boundary_sentinel', name: 'Boundary Sentinel', discipline: 'boundary', summary: 'Maximum defensive stability.', pinnacle: 'Sword Warden' },
  boundary_controller: { id: 'boundary_controller', name: 'Boundary Controller', discipline: 'boundary', summary: 'Expands and shapes the defensive field.', pinnacle: 'Field Master' },
  boundary_counterblade: { id: 'boundary_counterblade', name: 'Boundary Counterblade', discipline: 'boundary', summary: 'Turns interceptions into violent counters.', pinnacle: 'Edge Reaver' },
  crossblade_ravager: { id: 'crossblade_ravager', name: 'Crossblade Ravager', discipline: 'crossblade', summary: 'High damage and posture breaking.', pinnacle: 'Bloodfang' },
  crossblade_crossguard: { id: 'crossblade_crossguard', name: 'Crossblade Crossguard', discipline: 'crossblade', summary: 'Defensive parry specialist.', pinnacle: 'Parry Master' },
  crossblade_twin_dancer: { id: 'crossblade_twin_dancer', name: 'Twin Dancer', discipline: 'crossblade', summary: 'Mobile dual-wielding specialist.', pinnacle: 'Twinblade Dancer' },
};

const C = (id: LearnedClassId, name: string, rarity: ClassDefinition['rarity'], summary: string): ClassDefinition => ({ id, name, rarity, summary });
export const LEARNED_CLASSES: Record<LearnedClassId, ClassDefinition> = {
  warrior: C('warrior','Warrior','common','General weapon and frontline training.'), smith: C('smith','Smith','common','Forge, repair and temper equipment.'), herbalist: C('herbalist','Herbalist','common','Gather plants and brew teas and remedies.'), hunter: C('hunter','Hunter','common','Track creatures and harvest materials.'), dungeoneer: C('dungeoneer','Dungeoneer','common','Explore, map and understand dungeon hazards.'),
  alchemist: C('alchemist','Alchemist','uncommon','Create potions, catalysts, antidotes and toxins.'), rogue: C('rogue','Rogue','uncommon','Traps, ambushes, poisons and evasive techniques.'), archer: C('archer','Archer','uncommon','Precision ranged combat and mobility.'), apprentice_mage: C('apprentice_mage','Apprentice Mage','common','Foundational elemental and arcane magic.'), acolyte: C('acolyte','Acolyte','common','Healing, blessing and ward magic.'),
  miner: C('miner','Miner','common','Find and refine ore and gems.'), cook: C('cook','Cook','common','Prepare meals that grant temporary bonuses.'), farmer: C('farmer','Farmer','common','Grow crops and cultivate rare plants.'), fisherman: C('fisherman','Fisherman','common','Fish, craft bait and find rare catches.'), carpenter: C('carpenter','Carpenter','common','Build structures and field tools.'), leatherworker: C('leatherworker','Leatherworker','common','Process hides and make light equipment.'), tailor: C('tailor','Tailor','common','Make clothing, insulation, cloaks and robes.'), tinkerer: C('tinkerer','Tinkerer','uncommon','Build practical gadgets and deployables.'),
  summoner: C('summoner','Summoner','rare','Call and command temporary combat companions.'), barrier_mage: C('barrier_mage','Barrier Mage','rare','Create defensive magical barriers and reflective wards.'), spellbreaker: C('spellbreaker','Spellbreaker','rare','Dispel, silence and dismantle hostile magic.'), geomancer: C('geomancer','Geomancer','uncommon','Alter supported battlefield terrain states.'), battlefield_architect: C('battlefield_architect','Battlefield Architect','rare','Create cover, chokepoints, ramps and hazard zones.'),
};

export function xpToNextTrack(level: number, scale = 1) { return Math.round((120 + level * 42) * Math.pow(level, 1.22) * scale); }
export function masteryGainFor(event: 'attackHit'|'perfectChain'|'dodge'|'parry'|'perfectParry'|'openingConvert'|'boundaryIntercept'|'boundaryHold') {
  switch (event) { case 'perfectChain': return 1.5; case 'perfectParry': return 1.4; case 'boundaryIntercept': return 1.2; case 'openingConvert': return 1.1; case 'parry': return .8; case 'boundaryHold': return .35; case 'dodge': return .35; default: return .5; }
}

export class CombatProgression {
  origin: OriginId = 'human';
  heroic: TrackState = { level: 1, xp: 0, mastery: 0, skillPoints: 0 };
  primary: DisciplineId = 'gale';
  secondary: DisciplineId | null = null;
  disciplines: Record<DisciplineId, TrackState> = { gale:{level:1,xp:0,mastery:0,skillPoints:0}, boundary:{level:0,xp:0,mastery:0,skillPoints:0}, crossblade:{level:0,xp:0,mastery:0,skillPoints:0} };
  specializations: Partial<Record<DisciplineId, SpecializationId>> = {};
  learnedClasses: Partial<Record<LearnedClassId, TrackState>> = {};
  hybridUnlocks: string[] = [];
  pinnacleUnlocks: string[] = [];

  setPrimary(id: DisciplineId) { if (id === this.secondary) this.secondary = this.primary; this.primary = id; if (this.disciplines[id].level < 1) this.disciplines[id].level = 1; }
  unlockSecondary(id: DisciplineId) { if (id === this.primary || this.heroic.level < 10) return false; this.secondary = id; if (this.disciplines[id].level < 1) this.disciplines[id].level = 1; return true; }
  private award(state: TrackState, amount: number, scale: number) { state.xp += amount * scale; const xpScale = state === this.heroic ? .30 : 1; while (state.xp >= xpToNextTrack(state.level, xpScale)) { state.xp -= xpToNextTrack(state.level, xpScale); state.level++; state.skillPoints++; } }
  addHeroicXp(amount: number) { this.award(this.heroic, amount, 1); }
  addDisciplineXp(id: DisciplineId, amount: number, mastery = 0, secondary = false) { const s=this.disciplines[id]; this.award(s, amount, secondary ? .5 : 1); s.mastery=Math.min(100,s.mastery+mastery*(secondary?.5:1)); this.tryUnlockSpecialization(id); this.tryUnlockHybrids(); }
  addCombatEvent(event: 'attackHit'|'perfectChain'|'dodge'|'parry'|'perfectParry'|'openingConvert'|'boundaryIntercept'|'boundaryHold', xp=1) { const m=masteryGainFor(event); this.addDisciplineXp(this.primary,xp,m); if(this.secondary)this.addDisciplineXp(this.secondary,xp,m,true); this.addHeroicXp(Math.max(1,xp*.18)); }
  learnClass(id: LearnedClassId) { if(!this.learnedClasses[id]) this.learnedClasses[id]={level:1,xp:0,mastery:0,skillPoints:0}; return this.learnedClasses[id]!; }
  addClassXp(id: LearnedClassId, amount: number, mastery=0) { const s=this.learnClass(id); this.award(s,amount,1); s.mastery=Math.min(100,s.mastery+mastery); }
  tryUnlockSpecialization(id: DisciplineId) { const s=this.disciplines[id]; if(s.level<10||s.mastery<50||this.specializations[id])return; this.specializations[id]=DISCIPLINES[id].specializations[0]; }
  chooseSpecialization(id: DisciplineId,spec: SpecializationId) { const s=this.disciplines[id]; if(!DISCIPLINES[id].specializations.includes(spec)||s.level<10||s.mastery<50)return false; this.specializations[id]=spec; return true; }
  tryUnlockHybrids() { const pairs:[DisciplineId,DisciplineId,string][]=[['gale','boundary','storm_sentinel'],['gale','crossblade','flash_reaver'],['boundary','crossblade','edge_warden']]; for(const [a,b,id] of pairs)if(this.disciplines[a].level>=15&&this.disciplines[a].mastery>=70&&this.disciplines[b].level>=10&&this.disciplines[b].mastery>=50&&!this.hybridUnlocks.includes(id))this.hybridUnlocks.push(id); }
  toJSON(){return {origin:this.origin,heroic:this.heroic,primary:this.primary,secondary:this.secondary,disciplines:this.disciplines,specializations:this.specializations,learnedClasses:this.learnedClasses,hybridUnlocks:this.hybridUnlocks,pinnacleUnlocks:this.pinnacleUnlocks};}
  fromJSON(d:any){if(!d)return; this.origin=d.origin??this.origin; this.heroic={...this.heroic,...(d.heroic??{})}; this.primary=d.primary??this.primary; this.secondary=d.secondary??this.secondary; for(const id of Object.keys(this.disciplines) as DisciplineId[])this.disciplines[id]={...this.disciplines[id],...(d.disciplines?.[id]??{})}; this.specializations={...(d.specializations??{})}; this.learnedClasses={...(d.learnedClasses??{})}; this.hybridUnlocks=[...(d.hybridUnlocks??[])]; this.pinnacleUnlocks=[...(d.pinnacleUnlocks??[])];}
}
