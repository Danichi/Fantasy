import type { DialogueOption } from '../ui/dialogue';
import type { Player } from '../player/player';
import type { Realm } from '../dungeon/realm';
import { COMBAT_STYLES, type CombatStyleId } from '../progression/styles';
import { events } from '../core/events';

export function trainingOption(player: Player, realm: Realm, id: CombatStyleId, talk: (text: string) => void): DialogueOption {
  const style = COMBAT_STYLES[id];
  return {
    label: player.prog.knowsStyle(id) ? `Ask about ${style.name}` : `Train in ${style.name}`,
    run: () => {
      const eligible = id === 'swordsman' ? player.prog.level >= 2 : id === 'mage' ? realm.progress.bossDead : realm.progress.bossDead && player.prog.level >= 6;
      if (!player.prog.knowsStyle(id)) {
        if (!eligible) {
          const req = id === 'swordsman' ? 'Reach level 2 first.' : id === 'mage' ? 'Defeat the Warlord in the lower crypt first.' : 'Defeat the Warlord and reach level 6 first.';
          talk(`${style.name} training is not available yet. ${req}`);
          return;
        }
        player.prog.learnStyle(id);
        talk(`You are now trained in ${style.name}. Spend your skill points in Inventory → Combat Styles. ${player.prog.styleSwapUnlocked ? 'You may change styles there now.' : 'Free style switching is not available until level 12.'}`);
        return;
      }
      if (player.prog.styleSwapUnlocked && player.prog.activeStyle !== id) {
        player.prog.setActiveStyle(id);
        talk(`Your active combat style is now ${style.name}.`);
        return;
      }
      talk(player.prog.activeStyle === id ? `You are already fighting as a ${style.name}.` : `You know ${style.name}, but free switching is unlocked at level 12.`);
    },
  };
}

export function shopOptions(player: Player, openShop: (text?: string) => void): DialogueOption[] {
  const wares = [
    ['knightSword', "Buy Knight's Broadsword — 120 gold", 120],
    ['kiteShield', 'Buy Heater Shield — 100 gold', 100],
    ['healthPotion', 'Buy Health Draught — 20 gold', 20],
    ['manaPotion', 'Buy Mana Draught — 25 gold', 25],
  ] as const;
  return wares.map(([id, label, price]) => ({
    label,
    run: () => {
      if (player.prog.gold < price) {
        openShop('You do not have enough gold for that.');
        return;
      }
      player.prog.addGold(-price);
      player.equip.add(id, 1);
      events.emit('equipmentChanged', {});
      events.emit('progressChanged', {});
      openShop('Done. Anything else?');
    },
  }));
}