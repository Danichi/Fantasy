import type { QuestDef } from './questLog';
import { ISLANDS, REGIONS, THEMES, SITES, wardsOf, bossOf } from '../world/islands/layout';
const ports = { azureIsles: 'azureHaven', emeraldIsles: 'emeraldCove', shatteredIsles: 'wreckersRest', sunkenIsles: 'sunkenSpire' };
const titles = {
  azureIsles: ['Beyond the Turquoise Quay', 'The Three Reef Bells', "Pearlback's Claim", 'Pearls Below the Light'],
  emeraldIsles: ['The Rain-Isle Paths', 'Root, Rain and Sun', 'The Hollow Grove', 'What the Wood Remembers'],
  shatteredIsles: ['Nobody Owns the Shore', "The Wreckers' Watchcode", 'The Shorebreaker', 'The Price of a Free Harbour'],
  sunkenIsles: ['Where the Causeways End', 'The First Turning', 'The Drowned Archive', 'Lights Below the Water'],
};
export const ISLAND_QUESTS: QuestDef[] = [];
for (const region of REGIONS) {
  const theme = THEMES[region],
    islands = ISLANDS.filter((i) => i.region === region),
    giver = 'hm-' + ports[region],
    names = titles[region];
  const report = {
    type: 'talk' as const,
    npc: giver,
    text: 'Report to the harbourmaster',
    say: 'You have put names and paths back on our charts. The islands remember who comes ashore to help.',
  };
  ISLAND_QUESTS.push({
    id: `isles-${region}-landfall`,
    title: names[0],
    giver,
    region,
    summary: `Leave the harbour and discover ${islands
      .slice(0, 3)
      .map((i) => i.name)
      .join(', ')}.`,
    offer: `${theme.blurb} Our harbour is only the beginning. Go ashore on ${islands
      .slice(0, 3)
      .map((i) => i.name)
      .join(', ')}. Walk the paths, meet the people, and bring back your bearings.`,
    acceptLabel: 'I will explore the islands.',
    stages: [
      {
        note: 'Go ashore on the three marked islands. An anchored ship and a swim count as a voyage, but you must set foot on land.',
        anyOrder: true,
        objectives: islands.slice(0, 3).map((i) => ({ type: 'signal' as const, id: 'isle:visited:' + i.id, text: `Set foot on ${i.name}`, at: i.at as [number, number] })),
      },
      { note: 'Return to the harbourmaster with your discoveries.', objectives: [report] },
    ],
    done: 'The inner isles are on the harbour chart again. The old sanctuaries are your next bearing.',
    rewards: { gold: 180, xp: 550, items: [['islandTrailRation', 3]] },
  });
  ISLAND_QUESTS.push({
    id: `isles-${region}-wards`,
    title: names[1],
    giver,
    region,
    requires: [`isles-${region}-landfall`],
    summary: 'Wake the three sanctuaries that guard the old island routes.',
    offer: `The old route was kept by three sanctuaries. Their inscriptions still tell you how to wake them: ${theme.hint} Read each inscription and answer it. Then we can face what holds the main island.`,
    stages: [
      {
        note: 'Read the inscriptions at the three marked sanctuaries and solve their sequences.',
        anyOrder: true,
        objectives: wardsOf(region).map((s) => ({ type: 'signal' as const, id: 'isle:done:' + s.id, text: `Wake ${s.name}`, at: [s.x, s.z] })),
      },
      { note: 'Tell the harbourmaster the sanctuaries are awake.', objectives: [report] },
    ],
    done: 'The sanctuary lights answer one another across the sea. The old ward at the stronghold is open.',
    rewards: { gold: 350, xp: 1000, items: [[theme.material, 3]] },
  });
  const boss = bossOf(region);
  ISLAND_QUESTS.push({
    id: `isles-${region}-boss`,
    title: names[2],
    giver,
    region,
    requires: [`isles-${region}-wards`],
    summary: `Defeat ${theme.boss} and reclaim the island stronghold.`,
    offer: `${theme.boss} holds the old stronghold. The three sanctuaries have opened its ward. Go prepared: these are not the raiders you met on the shore. End the fight, then search what they guarded.`,
    stages: [
      { note: `Enter ${boss.name} and win the fight.`, objectives: [{ type: 'signal', id: 'isle:clear:' + boss.id, text: `Defeat ${theme.boss}`, at: [boss.x, boss.z] }] },
      { note: 'Return to the harbourmaster.', objectives: [report] },
    ],
    done: `${theme.boss} no longer holds the islands. Take our mark, and come back whenever the tide brings you.`,
    rewards: { gold: 850, xp: 2200, guildRep: 60, items: [[theme.keepsake, 1], ...(region === 'sunkenIsles' ? [['keepersRubbing', 1] as [string, number]] : [])] },
  });
  const finds = SITES.filter((s) => s.region === region && (s.kind === 'dive' || s.kind === 'cache')).slice(0, 3);
  ISLAND_QUESTS.push({
    id: `isles-${region}-finds`,
    title: names[3],
    giver,
    region,
    summary: 'Find three lost caches beyond the main harbour.',
    offer: `The old charts mention finds on ${finds.map((s) => s.name).join(', ')}. Bring a bow and a blade for the shore camps. For a blue lantern below the water, dive: swimming over it is not enough.`,
    stages: [
      {
        note: 'Search the marked finds. Each cache can be recovered once.',
        anyOrder: true,
        objectives: finds.map((s) => ({ type: 'signal' as const, id: 'isle:done:' + s.id, text: `Recover ${s.name}`, at: [s.x, s.z] })),
      },
      { note: 'Share what you found with the harbourmaster.', objectives: [report] },
    ],
    done: 'A chart made from things you have actually seen is worth a dozen copied in an office.',
    rewards: {
      gold: 300,
      xp: 850,
      items: [
        ['greaterHealthPotion', 2],
        [theme.material, 2],
      ],
    },
  });
}
ISLAND_QUESTS.push({
  id: 'isles-ashen-truce',
  title: 'Under the Ash Harbour Truce',
  giver: 'hm-ashenPort',
  region: 'demonContinent',
  summary: "Carry news from the Ash Exchange and recover the exiles' dead drop.",
  offer:
    'A berth is not a welcome, little captain. The Exchange keeps the harbour truce; the exiles keep their own counsel. Find their dead drop and visit the Exchange. Then we will decide whether you may carry my writ.',
  stages: [
    {
      note: "Visit the Ash Exchange and search the exiles' dead drop.",
      anyOrder: true,
      objectives: [
        { type: 'signal', id: 'isle:done:ashen:0', text: 'Visit the Ash Exchange', at: [SITES.find((s) => s.id === 'ashen:0')!.x, SITES.find((s) => s.id === 'ashen:0')!.z] },
        { type: 'signal', id: 'isle:done:ashen:2', text: "Search the exiles' dead drop", at: [SITES.find((s) => s.id === 'ashen:2')!.x, SITES.find((s) => s.id === 'ashen:2')!.z] },
      ],
    },
    {
      note: 'Return to Portwarden Vashka.',
      objectives: [
        {
          type: 'talk',
          npc: 'hm-ashenPort',
          text: 'Speak to Vashka',
          say: 'You listened before drawing steel. An uncommon habit. Carry my writ. It opens the harbour, and gives the gate guards a reason to let you speak.',
        },
      ],
    },
  ],
  done: 'You may trade and shelter under the ash harbour truce.',
  rewards: { gold: 450, xp: 1200, items: [['ashenHarbourWrit', 1]] },
});
ISLAND_QUESTS.push({
  id: 'isles-four-seas',
  title: 'Across the Four Seas',
  giver: 'hm-azureHaven',
  region: 'azureIsles',
  summary: 'Visit all four archipelagos and return with their bearings.',
  offer: 'The chart has four corners. Most captains know one. Set foot in the Azure, Emerald, Shattered and Sunken Isles, then come back and tell me what the sea connects.',
  stages: [
    {
      note: 'Set foot in each archipelago.',
      anyOrder: true,
      objectives: REGIONS.map((region) => ({
        type: 'signal' as const,
        id: 'isle:region:' + region,
        text: `Explore ${THEMES[region].name}`,
        at: ISLANDS.find((i) => i.region === region)!.at as [number, number],
      })),
    },
    {
      note: 'Return to Sela Marin in Azure Haven.',
      objectives: [
        {
          type: 'talk',
          npc: 'hm-azureHaven',
          text: 'Give Sela your bearings',
          say: 'Four seas, four peoples, and the same tide between them. Here: a compass that has waited a long time for a captain who looks past the quay.',
        },
      ],
    },
  ],
  done: 'You have walked the shores of the four archipelagos.',
  rewards: { gold: 650, xp: 1800, items: [['fourSeasCompass', 1]] },
});
