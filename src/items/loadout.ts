import { Equipment } from './equipment';

/** Starting inventory, equipment and hotbar for a new character. */
export function setupLoadout(eq: Equipment) {
  const longsword = eq.add('longsword');
  const arming1 = eq.add('armingSword');
  const arming2 = eq.add('armingSword');
  eq.add('knightSword');
  const round = eq.add('roundShield');
  eq.add('kiteShield');
  eq.add('ironHelm');
  eq.add('pauldrons');
  eq.add('breastplate');
  eq.add('gauntlets');
  eq.add('greaves');
  eq.add('sabatons');
  const fire = eq.add('fireball');
  const heal = eq.add('healingLight');
  const hp = eq.add('healthPotion', 5);
  const mp = eq.add('manaPotion', 3);

  eq.equip(longsword.uid, 'main');
  eq.equip(round.uid, 'off');
  eq.equip(fire.uid);

  eq.hotbar = [longsword.uid, arming1.uid, arming2.uid, round.uid, fire.uid, heal.uid, hp.uid, mp.uid];
}
