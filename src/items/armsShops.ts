// Where the new weapon families, ammunition, tools and materials are sold
// (appended to the existing shops' stock; nothing is taken away).

type Stock = [string, number][];

export const ARMS_STOCK: Record<string, Stock> = {
  /** Master Fröst's forge, Elder Glen: the iron tier from the start */
  froest: [['ironSpear', 70], ['ironGreatsword', 120], ['handAxe', 55], ['flangedMace', 60], ['ironDagger', 40], ['huntingBow', 65], ['arrowIron', 2], ['miningPick', 30], ['hatchet', 25], ['coal', 4], ['ironIngot', 14]],
  /** ...and the steel tier once he trusts you (the crypt, or Tempered Steel) */
  froest2: [['steelPartisan', 190], ['steelZweihander', 300], ['beardedAxe', 170], ['morningStar', 180], ['rondelDagger', 150], ['lightCrossbow', 160], ['boltIron', 3], ['arrowBroadhead', 4]],
  /** Bram Oakhand, the carpenter: staffs, bows and timber */
  carpenter: [['oakQuarterstaff', 45], ['huntingBow', 60], ['arrowIron', 2], ['hatchet', 22], ['ashWood', 12]],
  /** Ragna Ironsides, Port Aurelle's market: Aurelle steel */
  ragna: [['steelPartisan', 180], ['steelZweihander', 290], ['steelGreataxe', 260], ['warhammer', 270], ['rondelDagger', 140], ['ashLongbow', 210], ['lightCrossbow', 150], ['steelArbalest', 330], ['arrowIron', 2], ['arrowBroadhead', 4], ['boltIron', 3], ['steelIngot', 40]],
  /** Quill Mereweather's draughts: alchemy stock */
  quill: [['arrowFire', 6], ['arrowFrost', 6]],
  /** Odile Brightforge, the Royal Capital: the silversteel tier */
  bladesmith: [['silversteelGlaive', 520], ['silversteelFlamberge', 640], ['silversteelBattleaxe', 600], ['silversteelMaul', 610], ['silversteelStiletto', 480], ['yewWarbow', 520], ['ashStaff', 260], ['yewStaff', 560], ['arrowBone', 7], ['bookSmithing', 180]],
  /** the capital's alchemist and archmage */
  capAlchemist: [['bookAlchemy', 160], ['silk', 45]],
  archmage: [['ashStaff', 270], ['bookRunes', 320]],
};

/** Append the arms stock for `shop` (a copy; the caller's list is untouched). */
export function withArms(shop: string, stock: Stock): Stock {
  return [...stock, ...(ARMS_STOCK[shop] ?? [])];
}
