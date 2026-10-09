import type { HandPose, ProcPose, V3 } from '../../player/rigLayer';
import { act, n3, type FamilyDef } from './kit';

// Bows: held in the left hand, drawn with the right. Tap attack for a quick
// shot from the hip; hold the block button (right mouse) to aim over the
// shoulder, and attack to loose: the longer the draw, the harder and flatter
// the arrow flies. Shooting itself lives in combat/ranged.ts; this is the
// family's data and its draw poses (the bandits' UAL archery clips play under
// them on the body).

/** The draw pose at draw 0..1 (character space). `pitch` tilts the aim up (+) or down. */
export function drawPose(draw: number, pitch: number, w = 1): ProcPose {
  const up = Math.sin(pitch), fw = Math.cos(pitch);
  // Bow arm straight out toward the aim, the string hand back to the cheek.
  const bowGrip: V3 = [0.1, 1.42 + up * 0.5, 0.06 + fw * 0.5];
  const nock: V3 = [bowGrip[0] - 0.02, bowGrip[1] + 0.02, bowGrip[2] - 0.08];
  const anchor: V3 = [-0.02, 1.53 + up * 0.1, 0.04];
  const k = Math.max(0, Math.min(1, draw));
  const r: V3 = [nock[0] + (anchor[0] - nock[0]) * k, nock[1] + (anchor[1] - nock[1]) * k, nock[2] + (anchor[2] - nock[2]) * k];
  const left: HandPose = { grip: bowGrip, dir: n3([0.18, fw, -up]), normal: n3([0, up, fw]), w, pole: [0.6, 1.2, -0.3] };
  const right: HandPose = { grip: r, dir: n3([0.2, 0.4, 1]), normal: n3([-1, 0, 0]), w, pole: [-0.7, 1.3, -0.6] };
  return { left, right, spineYaw: -0.32 * w, headPitch: -pitch * 0.4 * w };
}

/** The bow carried low in the left hand while not shooting. */
export const BOW_CARRY: HandPose = { grip: [0.24, 0.95, 0.16], dir: n3([0.05, 0.9, 0.42]), normal: n3([-0.5, 0, 0.85]), w: 1 };

export const BOW: FamilyDef = {
  id: 'bow', name: 'Bow', hands: 2, reach: 60,
  feel: 'Aimed shots with a draw: hold right mouse to aim, attack to loose. Arrows can be picked up again.',
  moves: {
    // A quick shot from the hip (tap attack); held, it becomes a full draw (heavy).
    slash1: act('slash1', { dur: 0.75, stamina: 6, clip: 'ual_bow_shoot', proc: (t) => drawPose(Math.min(1, t * 2.4) * (t < 0.42 ? 1 : 0), 0), events: [{ at: 0.3, name: 'arms:loose' }], cancel: 0.45, track: 0.3 }),
    heavy: act('heavy', { dur: 1.2, stamina: 10, clip: 'ual_bow_shoot', proc: (t) => drawPose(Math.min(1, t * 2) * (t < 0.6 ? 1 : 0), 0), chargeAt: 0.5, events: [{ at: 0.66, name: 'arms:looseHeavy' }], cancel: 0.85, track: 0.66 }),
  },
  schools: {
    gale: { flow: 1, drawPerFlow: 0.12, note: 'Rhythm fire: every point of Flow draws the bow 12% faster.' },
    boundary: { zone: 6, arc: 0.3, intercept: 'shot', note: 'While you aim, an enemy who enters your zone draws an automatic shot.' },
    cross: { opening: 'counterShot', mult: 1.5, note: 'After a parry or a dodge your next arrow is a counter-shot: 50% harder, always staggers.' },
  },
};
