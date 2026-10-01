import type { QuestDef, QuestLog, Objective } from './questLog';
import type { AdventurerGuild, GuildQuest } from '../guild/adventurerGuild';

// Adventurer's Guild contracts in the quest log: each accepted contract is
// mirrored as a quest (tracker, journal, map marker, waypoint) while the guild
// keeps counting progress and paying out. Mirrored objectives are signals
// nothing fires, so the log never advances them on its own.

const KIND_NAME: Record<string, string> = { green: 'wolves', blue: 'stags', cave: 'goblins', orc: 'orcs', armour: 'animated armour', rat: 'rats', any: 'hostile creatures' };

function objective(g: GuildQuest): Objective {
  const id = 'guild:' + g.id;
  const n = g.targetCount ?? 1;
  if (g.objective === 'explore') return { type: 'signal', id, text: `Reach ${g.targetName ?? 'the site'}`, at: g.target };
  if (g.objective === 'survey') return { type: 'signal', id, count: n, text: 'Map new sectors around Elder Glen' };
  if (g.objective === 'gather') return { type: 'signal', id, count: n, text: `Gather ${g.targetItem ? g.targetItem.replace(/([A-Z])/g, ' $1').toLowerCase() : 'supplies'}` };
  return { type: 'signal', id, count: n, text: `Defeat ${KIND_NAME[g.targetKind ?? 'any'] ?? g.targetKind}` };
}

function defFor(g: GuildQuest): QuestDef {
  return {
    id: g.id, title: g.title, giver: 'guild', region: 'Adventurer\'s Guild contract', contract: true,
    summary: g.description, offer: g.description,
    stages: [{ note: g.description, objectives: [objective(g)] }],
    done: 'Contract fulfilled. The guild has paid out.',
    rewards: { gold: g.rewardGold, xp: g.rewardXp, guildRep: g.rewardRep },
  };
}

export function linkGuildContracts(guild: AdventurerGuild, quests: QuestLog) {
  const sync = (quiet: boolean) => {
    for (const g of guild.activeContracts) quests.mirror(defFor(g), [Math.min(g.progress, g.targetCount ?? 1)], quiet);
  };
  guild.onContract = (g, what) => {
    if (what === 'accepted') quests.mirror(defFor(g), [g.progress]);
    else quests.unmirror(g.id, what === 'completed');
  };
  let t = 0;
  return {
    /** After the save has loaded: contracts already on the books, without fanfare. */
    restore() {
      sync(true);
    },
    update(dt: number) {
      t += dt;
      if (t < 0.5) return;
      t = 0;
      sync(true);
    },
  };
}
