import type { QuestDef, QuestLog, Objective } from './questLog';
import type { AdventurerGuild, GuildQuest } from '../guild/adventurerGuild';

// Adventurer's Guild contracts in the quest log: each accepted contract is
// mirrored as a quest (tracker, journal, map marker, waypoint) while the guild
// keeps counting progress and paying out. Mirrored objectives are signals
// nothing fires, so the log never advances them on its own.

const KIND_NAME: Record<string, string> = { greyjaw: 'Old Greyjaw', varga: 'Varga One-Eye', ratQueen: 'the Rat Queen', drownedCaptain: 'the drowned captain', hangedLord: 'Red Corwen', circleWraith: 'the wraith of the circle', delver: 'the Delver', snaggletooth: 'Snaggletooth', warBoar: 'war-boars', rustKnight: 'the Rust Knight', hollowThane: 'the Hollow Thane', motherOoze: 'Mother Ooze', brineMaw: 'Brine-Maw', whiteStag: 'the White Stag (bring its antler)', green: 'wolves', blue: 'stags', cave: 'goblins', orc: 'orcs', armour: 'animated armour', rat: 'rats', any: 'hostile creatures' };

const FAMILY_NAME: Record<string, string> = { beast: 'wolves, boars and other beasts', slime: 'slimes', goblin: 'goblins', undead: 'the restless dead', bandit: 'bandits', sea: 'sea creatures', insect: 'giant vermin', construct: 'war-engines', orc: 'orcs', gloam: 'shades', wyrm: 'wyrms' };

function objective(g: GuildQuest): Objective {
  const id = 'guild:' + g.id;
  const n = g.targetCount ?? 1;
  if (g.trophy) return { type: 'signal', id, text: `Bring ${g.targetName}'s trophy to a guild Registrar`, at: [25, -18] };
  if (g.exam && g.objective === 'kill') return { type: 'signal', id, count: n, text: `Bring down ${n > 1 ? `${n} named beasts or dungeon masters` : 'a named beast or dungeon master'}` };
  if (g.objective === 'explore') return { type: 'signal', id, text: `Reach ${g.targetName ?? 'the site'}`, at: g.target };
  if (g.objective === 'deliver') return { type: 'signal', id, text: `Deliver the parcel to ${g.targetName}`, at: g.target };
  if (g.objective === 'survey') return { type: 'signal', id, count: n, text: 'Explore parts of the land you haven\'t seen' };
  if (g.objective === 'gather') return { type: 'signal', id, count: n, text: `Gather ${g.targetItem ? g.targetItem.replace(/([A-Z])/g, ' $1').toLowerCase() : 'supplies'}` };
  if (g.objective === 'hunt') return { type: 'signal', id, count: n, text: `Kill ${FAMILY_NAME[g.targetFamily ?? ''] ?? g.targetFamily}` };
  if (g.objective === 'clear') return { type: 'signal', id, count: n, text: `Clear out ${g.targetName}`, at: g.target };
  return { type: 'signal', id, count: n, text: `Defeat ${KIND_NAME[g.targetKind ?? 'any'] ?? g.targetKind}`, at: g.target };
}

function defFor(g: GuildQuest): QuestDef {
  return {
    id: g.id, title: g.title, giver: 'guild', region: 'Adventurer\'s Guild contract', contract: true,
    summary: g.description, offer: g.description,
    stages: [{ note: g.description, objectives: [objective(g)] }],
    done: 'Contract fulfilled. The guild has paid out.',
    rewards: { gold: g.rewardGold, xp: g.rewardXp, guildRep: g.rewardRep },
    // (A trophy waiting on a Registrar changes the objective: the mirror is rebuilt each sync.)
  };
}

export function linkGuildContracts(guild: AdventurerGuild, quests: QuestLog) {
  const sync = (quiet: boolean) => {
    for (const g of guild.activeContracts) quests.mirror(defFor(g), [g.trophy ? 0 : Math.min(g.progress, g.targetCount ?? 1)], quiet);
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
