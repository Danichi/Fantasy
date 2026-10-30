import { Equipment } from './equipment';

/**
 * What a new character starts with: nothing. You fall out of the sky with the
 * clothes you're wearing; the first thing you hold is a rusted blade pulled out
 * of the wheat (story/act1.ts). The test harness starts armed and armoured
 * instead (`testKit`), since most tests are about using the kit.
 */
export function setupLoadout(eq: Equipment, testKit = false) {
  eq.quick = [null, null, null, null];
  eq.moves = [null, null, null, null, null, null];
  if (!testKit) return;
  const longsword = eq.add('longsword');
  eq.add('armingSword');
  eq.add('armingSword');
  eq.add('knightSword');
  const round = eq.add('roundShield');
  eq.add('kiteShield');
  eq.add('ironHelm');
  eq.add('pauldrons');
  eq.add('breastplate');
  eq.add('gauntlets');
  eq.add('greaves');
  eq.add('sabatons');
  eq.add('wayfarerCloak');
  eq.add('garnetAmulet');
  eq.add('ringVigor');
  eq.add('ringSage');
  eq.add('warriorBelt');
  eq.add('luckyCharm');
  const hp = eq.add('healthPotion', 5);
  const mp = eq.add('manaPotion', 3);

  eq.equip(longsword.uid, 'main');
  eq.equip(round.uid, 'off');

  eq.quick = [hp.uid, mp.uid, null, null];
  eq.moves = [null, null, null, null, null, null];
}
