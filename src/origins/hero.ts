import type { Player } from '../player/player';
import type { Character } from '../player/character';
import type { Look } from '../npc/charBuilder';
import { HERO } from '../npc/cast';
import { normalizeOrigin } from '../progression/progression';
import { addOriginParts, fitHeight, shapeBones, type PartsHandle } from '../npc/charParts';
import { cleanLook, type OriginLook } from './data';

// The hero's body from the character creator's look: which kit pieces it is
// built from (charBuilder), then the people's proportions, the chosen height
// and the origin parts (npc/charParts). Set up before the player first loads,
// so a saved hero is built right the first time.

/** The kit look for a creator look: the hero's ranger outfit in sky blue, the creator's face and colours. */
export function kitLook(l: OriginLook): Look {
  return { ...HERO, body: l.body, hair: l.hair, beard: l.beard, hairColor: l.hairColor, skin: l.skin, height: l.height };
}

/** The parts currently grown on the hero (replaced whenever the body is rebuilt). */
export const heroBody: { look: OriginLook | null; parts: PartsHandle | null } = { look: null, parts: null };

/** Point the player's body at a look: used at boot (from the save) and by the creator. */
export function setHeroLook(player: Player, look: OriginLook) {
  player.look = kitLook(look);
  player.lookHeight = look.height;
  player.shapeBody = (char: Character) => {
    const bone = (n: string) => char.bone(n);
    shapeBones(bone, look);
    fitHeight(char.model, look.height);
    heroBody.parts?.dispose();
    heroBody.parts = addOriginParts(char.root, char.model, bone, look);
    heroBody.look = look;
  };
}

/** Boot: the saved look (or a default one for the saved origin) before the player loads. */
export function prepareHero(player: Player, save: { prog?: { origin?: string; combat?: { origin?: string } | null }; look?: Partial<OriginLook> } | null) {
  const origin = normalizeOrigin(save?.prog?.origin ?? save?.prog?.combat?.origin);
  setHeroLook(player, cleanLook(save?.look, origin));
}
