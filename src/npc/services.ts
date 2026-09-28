import type { DialogueOption } from '../ui/dialogue';
import type { Player } from '../player/player';
import { COMBAT_STYLES, type CombatStyleId } from '../progression/styles';
import { events } from '../core/events';

export function trainingOption(player: Player, id: CombatStyleId, talk: (text: string) => void): DialogueOption {
  const style = COMBAT_STYLES[id];
  return {
    label: player.prog.knowsStyle(id) ? `Ask about ${style.name}` : `Learn ${style.name}`,
    run: () => {
      if (!player.prog.knowsStyle(id)) {
        player.prog.learnStyle(id);
        talk(`You learned ${style.name}. Open Inventory → Skills to spend skill points on its moves. Only one martial style can be active at a time.`);
        return;
      }
      talk(player.prog.activeStyle === id
        ? `You are currently fighting as a ${style.name}. Train its moves with skill points in Inventory → Skills.`
        : `You already know ${style.name}. Choose it in Inventory → Skills when you want to fight with its moves.`);
    },
  };
}

export function magicOptions(player: Player, talk: (text: string) => void): DialogueOption[] {
  const spells: [string, string][] = [
    ['fireball', 'Learn Fireball'],
    ['healingLight', 'Learn Healing Light'],
  ];
  return spells.map(([id, label]) => ({
    label: player.equip.items.some((i) => i.def.id === id) ? `${label.replace('Learn ', '')} — learned` : label,
    run: () => {
      if (player.equip.items.some((i) => i.def.id === id)) {
        talk('You already know that spell.');
        return;
      }
      player.equip.add(id, 1);
      events.emit('equipmentChanged', {});
      events.emit('progressChanged', {});
      talk(`The spell is yours. Equip it from Inventory and place it on the MOVES bar; magic does not use martial style skill points.`);
    },
  }));
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
