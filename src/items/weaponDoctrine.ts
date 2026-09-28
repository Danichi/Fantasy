export type WeaponType = 'sword' | 'greatsword' | 'dagger' | 'spear' | 'axe' | 'mace' | 'hammer' | 'shield' | 'bow';

export interface WeaponDoctrineVariant {
  id: string;
  weapon: WeaponType;
  discipline: 'gale' | 'boundary' | 'crossblade';
  name: string;
  summary: string;
  tags: string[];
}

export const WEAPON_DOCTRINE_VARIANTS: WeaponDoctrineVariant[] = [
  { id:'sword_gale', weapon:'sword', discipline:'gale', name:'Flowing Sword', summary:'Fast chained swordplay with momentum.', tags:['light','sharp','chain'] },
  { id:'spear_gale', weapon:'spear', discipline:'gale', name:'Windlance', summary:'Maintain reach and passing-thrust rhythm.', tags:['reach','piercing','mobility'] },
  { id:'greatsword_gale', weapon:'greatsword', discipline:'gale', name:'Flowing Greatsword', summary:'Carry momentum through heavy recovery.', tags:['heavy','sweeping','follow-through'] },
  { id:'axe_gale', weapon:'axe', discipline:'gale', name:'Rising Reaver', summary:'Repeated swings ramp force and movement.', tags:['cleave','ramp'] },
  { id:'hammer_gale', weapon:'hammer', discipline:'gale', name:'Impact Flow', summary:'Movement into impact increases force.', tags:['blunt','impact'] },
  { id:'dagger_gale', weapon:'dagger', discipline:'gale', name:'Flash Dancer', summary:'Tiny chain windows and rapid momentum.', tags:['very-fast','precision'] },
  { id:'sword_boundary', weapon:'sword', discipline:'boundary', name:'Boundary Sword', summary:'Circular defensive field around the blade.', tags:['parry','zone'] },
  { id:'spear_boundary', weapon:'spear', discipline:'boundary', name:'Reach Boundary', summary:'Forward-biased zone controls approaches.', tags:['reach','anti-charge'] },
  { id:'greatsword_boundary', weapon:'greatsword', discipline:'boundary', name:'Iron Boundary', summary:'Smaller field with stronger interception force.', tags:['heavy','posture'] },
  { id:'axe_boundary', weapon:'axe', discipline:'boundary', name:'Cleaving Ward', summary:'Broad defensive arcs catch close threats.', tags:['cleave','guard'] },
  { id:'hammer_boundary', weapon:'hammer', discipline:'boundary', name:'Hammer Ward', summary:'Interceptions deal exceptional stagger.', tags:['blunt','stagger'] },
  { id:'dagger_boundary', weapon:'dagger', discipline:'boundary', name:'Needle Boundary', summary:'Small efficient personal field.', tags:['compact','cheap'] },
  { id:'sword_crossblade', weapon:'sword', discipline:'crossblade', name:'Crossblade', summary:'One hand opens, the other exploits.', tags:['dual-wield','parry'] },
  { id:'spear_crossblade', weapon:'spear', discipline:'crossblade', name:'Lancer', summary:'Short offhand sets precise long-range counters.', tags:['reach','dual-wield'] },
  { id:'axe_crossblade', weapon:'axe', discipline:'crossblade', name:'Reaver', summary:'Offhand setup into brutal cleaves.', tags:['dual-wield','cleave'] },
  { id:'hammer_crossblade', weapon:'hammer', discipline:'crossblade', name:'Breaker', summary:'Openings become armor-breaking impacts.', tags:['dual-wield','armor-break'] },
  { id:'dagger_crossblade', weapon:'dagger', discipline:'crossblade', name:'Assassin', summary:'Fast parry-to-finisher kill windows.', tags:['stealth','finisher'] },
];
