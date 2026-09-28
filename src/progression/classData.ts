export interface ClassAbility {
  id: string;
  name: string;
  summary: string;
  active?: boolean;
  cost?: number;
}

export interface LearnedClassData {
  id: string;
  name: string;
  abilities: ClassAbility[];
}

export const CLASS_ABILITIES: Record<string, LearnedClassData> = {
  warrior: { id: 'warrior', name: 'Warrior', abilities: [
    { id: 'heavy_swing', name: 'Heavy Swing', summary: 'Charged weapon attack with high posture damage.', active: true, cost: 20 },
    { id: 'guard_stance', name: 'Guard Stance', summary: 'Reduce incoming stagger while holding ground.', active: false },
    { id: 'battle_cry', name: 'Battle Cry', summary: 'Temporarily increase damage and poise.', active: true, cost: 15 },
    { id: 'shoulder_charge', name: 'Shoulder Charge', summary: 'Close distance and stagger a target.', active: true, cost: 18 },
    { id: 'armor_training', name: 'Armor Training', summary: 'Gain more benefit from equipped armor.', active: false },
    { id: 'brutal_momentum', name: 'Brutal Momentum', summary: 'Heavy hits gain a little extra force after successful chains.', active: false },
    { id: 'sweeping_strike', name: 'Sweeping Strike', summary: 'Broad melee strike for clustered enemies.', active: true, cost: 24 },
    { id: 'last_stand', name: 'Last Stand', summary: 'Survive a lethal hit once at low health.', active: false },
  ]},
  shieldbearer: { id: 'shieldbearer', name: 'Shieldbearer', abilities: [
    { id: 'shield_bash', name: 'Shield Bash', summary: 'Stagger an enemy with the shield edge.', active: true, cost: 14 },
    { id: 'brace', name: 'Brace', summary: 'Greatly reduce incoming knockback.', active: true, cost: 10 },
    { id: 'shield_wall', name: 'Shield Wall', summary: 'Strong frontal defense.', active: true, cost: 20 },
    { id: 'intercept', name: 'Intercept', summary: 'Step into an ally-targeted attack.', active: true, cost: 18 },
    { id: 'shield_charge', name: 'Shield Charge', summary: 'Rush forward behind the shield.', active: true, cost: 22 },
    { id: 'spiked_guard', name: 'Spiked Guard', summary: 'Deal damage to attackers while blocking.', active: false },
    { id: 'tower_stance', name: 'Tower Stance', summary: 'Anchor in place for extreme block strength.', active: false },
    { id: 'unyielding_guard', name: 'Unyielding Guard', summary: 'Heavy guards no longer break as easily.', active: false },
  ]},
  archer: { id: 'archer', name: 'Archer', abilities: [
    { id: 'aimed_shot', name: 'Aimed Shot', summary: 'High precision ranged attack.', active: true, cost: 12 },
    { id: 'quick_nock', name: 'Quick Nock', summary: 'Rapidly fire an arrow.', active: true, cost: 8 },
    { id: 'piercing_arrow', name: 'Piercing Arrow', summary: 'Ignore some armor.', active: true, cost: 16 },
    { id: 'volley', name: 'Volley', summary: 'Fire a spread of arrows.', active: true, cost: 22 },
    { id: 'hunters_mark', name: "Hunter's Mark", summary: 'Expose one target to extra ranged damage.', active: true, cost: 12 },
    { id: 'disengage', name: 'Disengage', summary: 'Leap away and reset spacing.', active: true, cost: 10 },
    { id: 'knee_shot', name: 'Knee Shot', summary: 'Slow a target with a leg hit.', active: true, cost: 11 },
    { id: 'deadeye', name: 'Deadeye', summary: 'Briefly extend precision and weak-point damage.', active: false },
  ]},
  rogue: { id: 'rogue', name: 'Rogue', abilities: [
    { id: 'backstab', name: 'Backstab', summary: 'Massively increase damage from behind.', active: true, cost: 16 },
    { id: 'smoke_bomb', name: 'Smoke Bomb', summary: 'Create a concealment cloud.', active: true, cost: 14 },
    { id: 'cheap_shot', name: 'Cheap Shot', summary: 'Stun an unaware enemy.', active: true, cost: 12 },
    { id: 'trap_sense', name: 'Trap Sense', summary: 'Reveal nearby dungeon traps.', active: false },
    { id: 'poisoned_blade', name: 'Poisoned Blade', summary: 'Apply poison on suitable weapon hits.', active: false },
    { id: 'shadowstep', name: 'Shadowstep', summary: 'Short, practical teleport behind a target.', active: true, cost: 22 },
    { id: 'pickpocket', name: 'Pickpocket', summary: 'Steal an item from a suitable NPC.', active: true, cost: 5 },
    { id: 'vanishing_act', name: 'Vanishing Act', summary: 'Break enemy targeting after a short fade.', active: true, cost: 18 },
  ]},
  hunter: { id: 'hunter', name: 'Hunter', abilities: [
    { id: 'tracking', name: 'Tracking', summary: 'Reveal recent creature trails.', active: false },
    { id: 'beast_lore', name: 'Beast Lore', summary: 'Identify creature strengths and habits.', active: false },
    { id: 'camouflage', name: 'Camouflage', summary: 'Lower detection in natural terrain.', active: true, cost: 10 },
    { id: 'marked_prey', name: 'Marked Prey', summary: 'Expose a target for your party.', active: true, cost: 10 },
    { id: 'field_dressing', name: 'Field Dressing', summary: 'Recover health outside combat.', active: true, cost: 8 },
    { id: 'snare', name: 'Snare', summary: 'Deploy a slowing trap.', active: true, cost: 12 },
    { id: 'longshot', name: 'Longshot', summary: 'Extend practical ranged reach.', active: false },
    { id: 'predators_patience', name: "Predator's Patience", summary: 'Gain damage after holding position.', active: false },
  ]},
  apprentice_mage: { id: 'apprentice_mage', name: 'Apprentice Mage', abilities: [
    { id: 'spark', name: 'Spark', summary: 'Small lightning projectile.', active: true, cost: 6 },
    { id: 'ember_bolt', name: 'Ember Bolt', summary: 'Basic fire projectile.', active: true, cost: 7 },
    { id: 'frost_shard', name: 'Frost Shard', summary: 'Slow a target with cold damage.', active: true, cost: 8 },
    { id: 'gust', name: 'Gust', summary: 'Push enemies back.', active: true, cost: 8 },
    { id: 'stone_pebble', name: 'Stone Pebble', summary: 'Fast physical magic projectile.', active: true, cost: 5 },
    { id: 'mana_focus', name: 'Mana Focus', summary: 'Improve mana recovery briefly.', active: true, cost: 10 },
    { id: 'element_swap', name: 'Element Swap', summary: 'Change a prepared spell element.', active: true, cost: 4 },
    { id: 'arcane_bolt', name: 'Arcane Bolt', summary: 'Reliable arcane projectile.', active: true, cost: 9 },
  ]},
  acolyte: { id: 'acolyte', name: 'Acolyte', abilities: [
    { id: 'minor_heal', name: 'Minor Heal', summary: 'Restore a moderate amount of health.', active: true, cost: 10 },
    { id: 'cleanse', name: 'Cleanse', summary: 'Remove a common status effect.', active: true, cost: 12 },
    { id: 'blessing', name: 'Blessing', summary: 'Grant a short defensive buff.', active: true, cost: 10 },
    { id: 'ward', name: 'Ward', summary: 'Create a temporary protection field.', active: true, cost: 16 },
    { id: 'prayer', name: 'Prayer', summary: 'Restore resources over time.', active: true, cost: 14 },
    { id: 'emergency_heal', name: 'Emergency Heal', summary: 'Strong heal when health is low.', active: true, cost: 20 },
    { id: 'radiant_bolt', name: 'Radiant Bolt', summary: 'Light damage projectile.', active: true, cost: 12 },
    { id: 'shared_grace', name: 'Shared Grace', summary: 'Spread a heal to nearby allies.', active: true, cost: 18 },
  ]},
  alchemist: { id: 'alchemist', name: 'Alchemist', abilities: [
    { id: 'ingredient_identification', name: 'Ingredient Identification', summary: 'Reveal ingredient properties.', active: false },
    { id: 'potion_brewing', name: 'Potion Brewing', summary: 'Craft potions.', active: false },
    { id: 'antidote', name: 'Antidote', summary: 'Brew status cures.', active: true, cost: 5 },
    { id: 'explosive_flask', name: 'Explosive Flask', summary: 'Throw an area explosive.', active: true, cost: 14 },
    { id: 'smoke_flask', name: 'Smoke Flask', summary: 'Create a concealment cloud.', active: true, cost: 10 },
    { id: 'catalyst', name: 'Catalyst', summary: 'Increase a potion effect.', active: true, cost: 8 },
    { id: 'mutagen', name: 'Mutagen', summary: 'Create a controlled temporary mutation.', active: true, cost: 18 },
    { id: 'quick_brew', name: 'Quick Brew', summary: 'Craft a selected consumable in the field.', active: true, cost: 12 },
  ]},
  herbalist: { id: 'herbalist', name: 'Herbalist', abilities: [
    { id: 'plant_identification', name: 'Plant Identification', summary: 'Identify useful plants.', active: false },
    { id: 'careful_harvest', name: 'Careful Harvest', summary: 'Gain more materials from plants.', active: false },
    { id: 'herb_preservation', name: 'Herb Preservation', summary: 'Prevent gathered herbs from spoiling.', active: false },
    { id: 'herbal_tea', name: 'Herbal Tea', summary: 'Create a small regeneration buff.', active: true, cost: 4 },
    { id: 'medicinal_brew', name: 'Medicinal Brew', summary: 'Create a healing consumable.', active: true, cost: 8 },
    { id: 'bitter_brew', name: 'Bitter Brew', summary: 'Create a toxin that weakens enemies.', active: true, cost: 8 },
    { id: 'foragers_eye', name: "Forager's Eye", summary: 'Highlight nearby resource plants.', active: true, cost: 5 },
    { id: 'rare_herb_knowledge', name: 'Rare Herb Knowledge', summary: 'Reveal rare gathering nodes.', active: false },
    { id: 'advanced_herbalism', name: 'Advanced Herbalism', summary: 'Improve all herb crafting.', active: false },
  ]},
  smith: { id: 'smith', name: 'Smith', abilities: [
    { id: 'basic_forging', name: 'Basic Forging', summary: 'Forge basic equipment.', active: false },
    { id: 'metal_identification', name: 'Metal Identification', summary: 'Identify metals and alloys.', active: false },
    { id: 'ore_efficiency', name: 'Ore Efficiency', summary: 'Use less material when forging.', active: false },
    { id: 'weapon_repair', name: 'Weapon Repair', summary: 'Repair damaged weapons.', active: true, cost: 3 },
    { id: 'armor_repair', name: 'Armor Repair', summary: 'Repair damaged armor.', active: true, cost: 3 },
    { id: 'fine_forging', name: 'Fine Forging', summary: 'Craft higher quality equipment.', active: false },
    { id: 'tempering', name: 'Tempering', summary: 'Improve a weapon stat at a workbench.', active: true, cost: 8 },
    { id: 'masterwork', name: 'Masterwork', summary: 'Create a rare masterwork item.', active: false },
  ]},
  miner: { id: 'miner', name: 'Miner', abilities: [
    { id: 'ore_detection', name: 'Ore Detection', summary: 'Highlight nearby ore.', active: true, cost: 4 },
    { id: 'efficient_mining', name: 'Efficient Mining', summary: 'Mine more material per swing.', active: false },
    { id: 'hard_rock_mining', name: 'Hard Rock Mining', summary: 'Break harder deposits.', active: false },
    { id: 'gem_finding', name: 'Gem Finding', summary: 'Improve gem discovery.', active: false },
    { id: 'tunnel_sense', name: 'Tunnel Sense', summary: 'Detect unstable or secret passages.', active: false },
    { id: 'ore_appraisal', name: 'Ore Appraisal', summary: 'Identify ore value.', active: false },
    { id: 'deep_mining', name: 'Deep Mining', summary: 'Access deeper resource zones.', active: false },
    { id: 'master_extraction', name: 'Master Extraction', summary: 'Maximum extraction efficiency.', active: false },
  ]},
  dungeoneer: { id: 'dungeoneer', name: 'Dungeoneer', abilities: [
    { id: 'auto_map', name: 'Auto-Map', summary: 'Reveal nearby dungeon structure.', active: true, cost: 0 },
    { id: 'trap_ping', name: 'Trap Ping', summary: 'Pulse nearby hazards.', active: true, cost: 5 },
    { id: 'route_memory', name: 'Route Memory', summary: 'Remember cleared routes.', active: false },
    { id: 'dungeon_compass', name: 'Dungeon Compass', summary: 'Point toward the current objective.', active: false },
    { id: 'secret_sense', name: 'Secret Sense', summary: 'Reveal supported secret doors.', active: true, cost: 8 },
    { id: 'safe_camp', name: 'Safe Camp', summary: 'Create a safer rest point in valid rooms.', active: true, cost: 12 },
    { id: 'cartographic_recall', name: 'Cartographic Recall', summary: 'Keep discovered map data between runs.', active: false },
    { id: 'pathfinder', name: 'Pathfinder', summary: 'Improve movement in dungeons.', active: false },
  ]},
};
