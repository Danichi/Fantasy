import type { DialogueOption } from '../ui/dialogue';
import type { Player } from '../player/player';
import { COMBAT_STYLES, type CombatStyleId } from '../progression/styles';
import { events } from '../core/events';

export function trainingOption(player: Player, id: CombatStyleId, talk: (text: string) => void): DialogueOption {
  const style = COMBAT_STYLES[id];
  return {
    label: player.prog.starterStyleChosen ? `Train ${style.name}` : player.prog.styleIntroductions.includes(id) ? `Review ${style.name}` : `Learn about ${style.name}`,
    run: () => {
      if (!player.prog.starterStyleChosen) {
        const firstTime = player.prog.markStyleIntroduction(id);
        if (firstTime) {
          talk(`${style.name}: ${style.mechanic} You have studied ${player.prog.starterQuestCount}/3 combat schools. Speak with the other mentors before choosing your starter school.`);
          return;
        }
        if (!player.prog.starterStyleQuestComplete) {
          talk(`${style.name}: ${style.mechanic} You have studied ${player.prog.starterQuestCount}/3 combat schools. There are still mentors you have not met.`);
          return;
        }
        talk(`${style.name}: ${style.mechanic} You have now heard from all three mentors. Choose ${style.name} as your starter school to begin.`);
        return;
      }
      if (player.prog.knowsStyle(id)) {
        talk(`You are trained in ${style.name}. Mastery: ${player.prog.styleMastery[id]}. Spend skill points in Inventory → Skills to unlock its techniques.`);
        return;
      }
      talk(`You chose ${COMBAT_STYLES[player.prog.primaryStyle!].name} as your starter school. A second school can be earned later through mastery, but it is not available yet.`);
    },
  };
}

export function starterChoiceOptions(player: Player, talk: (text: string) => void): DialogueOption[] {
  if (player.prog.starterStyleChosen || !player.prog.starterStyleQuestComplete) return [];
  return (Object.keys(COMBAT_STYLES) as CombatStyleId[]).map((id) => ({
    label: `Choose ${COMBAT_STYLES[id].name}`,
    run: () => {
      if (!player.prog.choosePrimaryStyle(id)) {
        talk('You must study all three combat schools before choosing your starter.');
        return;
      }
      talk(`You chose the ${COMBAT_STYLES[id].name} style. Your core combat mechanic is now active. Open Inventory → Skills to shape its techniques with skill points.`);
    },
  }));
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
      talk('The spell is yours. Magic is a separate progression system from the three combat schools.');
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
