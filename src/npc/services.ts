import type { DialogueOption } from '../ui/dialogue';
import type { Player } from '../player/player';
import { events } from '../core/events';

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
