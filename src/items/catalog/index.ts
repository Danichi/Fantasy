// The item catalog (the item plan): every module adds its items, recipes,
// icons and sources to the registries in kit.ts when it loads.
import './weapons';
import './armour';
import './sets';
import './factionWeapons';
import './materials';
import './jewels';
import './consumables';
import './uniques';
import './classKeepsakes';
import './wardens';
import './festival';

export { CAT as CATALOG_ITEMS, CAT_RECIPES, ART as CATALOG_ART, SOURCES } from './kit';
export { SETS, SET } from './sets';
export { TIERS, tierOfRegion, tierOfLevel } from './tiers';
export { FACTIONS } from './factions';
export { TOKENS } from './jewels';
