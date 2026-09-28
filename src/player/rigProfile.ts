export type RigFamily = 'humanoid' | 'quadruped' | 'dragon' | 'giant' | 'generic';

export interface RigProfile {
  family: RigFamily;
  aliases: Record<string, string[]>;
  required: string[];
}

/**
 * Game-owned semantic rig contract. Imported assets only need to provide a
 * compatible set of bones; gameplay never relies on the artist's original
 * skeleton naming or hierarchy.
 */
export const RIG_PROFILES: Record<RigFamily, RigProfile> = {
  humanoid: {
    family: 'humanoid',
    aliases: {
      Hips: ['Hips','Pelvis','Root'],
      Spine: ['Spine','Spine01','Spine_01','Chest'],
      Spine1: ['Spine1','Spine02','Spine_02','Chest2'],
      Spine2: ['Spine2','Spine03','Spine_03','UpperChest','Chest3'],
      Head: ['Head','head'],
      Neck: ['Neck','neck'],
      RightArm: ['RightArm','Arm.R','UpperArm.R','upperarm_r'],
      LeftArm: ['LeftArm','Arm.L','UpperArm.L','upperarm_l'],
      RightForeArm: ['RightForeArm','ForeArm.R','LowerArm.R','forearm_r'],
      LeftForeArm: ['LeftForeArm','ForeArm.L','LowerArm.L','forearm_l'],
      RightHand: ['RightHand','Hand.R','hand_r'],
      LeftHand: ['LeftHand','Hand.L','hand_l'],
      RightUpLeg: ['RightUpLeg','Thigh.R','UpperLeg.R','thigh_r'],
      LeftUpLeg: ['LeftUpLeg','Thigh.L','UpperLeg.L','thigh_l'],
      RightLeg: ['RightLeg','Shin.R','LowerLeg.R','calf_r'],
      LeftLeg: ['LeftLeg','Shin.L','LowerLeg.L','calf_l'],
      RightFoot: ['RightFoot','Foot.R','foot_r'],
      LeftFoot: ['LeftFoot','Foot.L','foot_l'],
    },
    required: ['Hips','Spine','Head','RightArm','LeftArm','RightHand','LeftHand','RightUpLeg','LeftUpLeg','RightLeg','LeftLeg','RightFoot','LeftFoot'],
  },
  dragon: {
    family: 'dragon',
    aliases: {
      Hips: ['Pelvis','Root','Hips','Body'],
      Spine: ['Spine','Spine01','Body01'],
      Spine1: ['Spine1','Spine02','Body02'],
      Spine2: ['Spine2','Chest','Body03'],
      Head: ['Head','Skull','NeckHead'],
      Neck: ['Neck','Neck01'],
      RightArm: ['Wing.R','RightWing','Foreleg.R','RightForeleg','RightArm'],
      LeftArm: ['Wing.L','LeftWing','Foreleg.L','LeftForeleg','LeftArm'],
      RightForeArm: ['WingForearm.R','RightWingForearm','RightForeArm','RightLowerArm'],
      LeftForeArm: ['WingForearm.L','LeftWingForearm','LeftForeArm','LeftLowerArm'],
      RightHand: ['WingHand.R','RightWingHand','RightHand','RightClaw'],
      LeftHand: ['WingHand.L','LeftWingHand','LeftHand','LeftClaw'],
      RightUpLeg: ['HindLeg.R','RightHindLeg','RightUpLeg'],
      LeftUpLeg: ['HindLeg.L','LeftHindLeg','LeftUpLeg'],
      RightLeg: ['HindShin.R','RightHindShin','RightLeg'],
      LeftLeg: ['HindShin.L','LeftHindShin','LeftLeg'],
      RightFoot: ['HindFoot.R','RightHindFoot','RightFoot'],
      LeftFoot: ['HindFoot.L','LeftHindFoot','LeftFoot'],
    },
    required: ['Hips','Spine','Spine2','Head'],
  },
  quadruped: {
    family: 'quadruped',
    aliases: {
      Hips: ['Pelvis','Hip','Root'],
      Spine: ['Spine','Chest'],
      Spine1: ['Spine01','Spine1','Chest'],
      Spine2: ['Spine02','Spine2','Shoulder'],
      Head: ['Head','Skull'],
      RightArm: ['FrontLeg.R','RightFrontLeg','Foreleg.R'],
      LeftArm: ['FrontLeg.L','LeftFrontLeg','Foreleg.L'],
      RightUpLeg: ['BackLeg.R','RightBackLeg','Hindleg.R'],
      LeftUpLeg: ['BackLeg.L','LeftBackLeg','Hindleg.L'],
    },
    required: ['Hips','Spine','Head'],
  },
  giant: {
    family: 'giant',
    aliases: {},
    required: ['Hips','Spine','Head'],
  },
  generic: {
    family: 'generic',
    aliases: {},
    required: ['Hips','Head'],
  },
};

export function detectRigFamily(names: Iterable<string>): RigFamily {
  const list = [...names].map((n) => n.toLowerCase());
  if (list.some((n) => n.includes('wing') || n.includes('tail'))) return 'dragon';
  if (list.some((n) => n.includes('hindleg') || n.includes('frontleg'))) return 'quadruped';
  if (list.some((n) => n.includes('giant'))) return 'giant';
  if (list.includes('hips') || list.includes('pelvis')) return 'humanoid';
  return 'generic';
}
