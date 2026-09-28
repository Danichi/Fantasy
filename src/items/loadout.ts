import { Equipment } from './equipment';

/** Starting inventory, equipment, quick items and moves for a new character. */
export function setupLoadout(eq: Equipment) {
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
  const fire = eq.add('fireball');
  const heal = eq.add('healingLight');
  const hp = eq.add('healthPotion', 5);
  const mp = eq.add('manaPotion', 3);

  eq.equip(longsword.uid, 'main');
  eq.equip(round.uid, 'off');
  eq.equip(fire.uid);

  eq.quick = [hp.uid, mp.uid, null, null];
  eq.moves = [fire.uid, heal.uid, null, null, null, null];
}
