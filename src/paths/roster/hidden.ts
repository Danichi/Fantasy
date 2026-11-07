import { EXPANDED_TREES } from '../expandedTrees';
import type { AscSpec, BranchSpec, ClassSpec, MechSpec, TeacherSpec } from './types';

// Hidden classes (wave C7-C8). The fifteen gateway classes already have trees
// and techniques (expandedTrees.ts, forge.ts); here they get a mechanic,
// written passives, Ascensions and a hidden teacher somewhere in the world.
// Opening a gateway capstone no longer teaches the class: it shows you where
// the teacher waits. Oathbreaker and Voidwalker, which nothing taught, get
// teachers too.

type Over = { id: string; fam: 'combat' | 'magic'; name: string; color: string; core: string; lead: string; how: string; mech: MechSpec; asc: [AscSpec, AscSpec]; teacher: TeacherSpec; field?: ClassSpec['field']; requires?: [string, number]; tree?: [BranchSpec, BranchSpec, BranchSpec]; noEngine?: boolean };

const treeOf = (id: string): [BranchSpec, BranchSpec, BranchSpec] => EXPANDED_TREES[id].map((b) => [b.name, b.sub, b.tiers, b.cap]) as [BranchSpec, BranchSpec, BranchSpec];
const a = (name: string, flavour: string, nodes: [string, string, string, string], lean: 'edge' | 'guard'): AscSpec => ({ name, flavour, nodes, lean });

const OVERLAYS: Over[] = [
  // ---- Gale's gateways ------------------------------------------------------------------
  {
    id: 'stormdancer', fam: 'combat', name: 'Stormdancer', color: '--c-gale', core: 'Squall Heart',
    lead: 'Stormdancer never stands where the blow lands: every dodge is a step in a storm, and the storm strikes back.',
    how: 'Dodge through blows and strike in the air: Squall builds, and breaks as a Thunderstep.',
    mech: { res: 'Squall', color: '#6fd6c6', gain: { dodge: 20, hit: 5, air: 10 }, per: { moveSpeed: 0.15, attackSpeed: 0.15 }, full: { kind: 'chain', name: 'Thunderstep', when: 'next', style: 'storm', n: 4, d: 90, fx: 'stun' } },
    field: { name: 'Cloud Dancer', kind: 'airJump', text: 'Jump again in mid-air.' },
    asc: [a('Tempest Dancer', 'The storm moves when you do.', ['Lightning Feet', 'Squall Fury', 'Quick Storm', 'The Endless Dance'], 'edge'), a('Eye Dancer', 'At the centre, nothing touches you.', ['Wind Skin', 'Cloud Ward', 'Untouchable', 'The Calm Step'], 'guard')],
    teacher: { npc: 'ht-stormdancer', name: 'Marisol of the Squalls', title: 'A dancer in the storm', at: [2244, 98], where: 'on Gull Ridge Overlook, above the sea east of the Wayfarer\'s Rest', idle: 'The wind up here never stops. Neither do I. Come back when your feet have learned to listen.', look: 'wild', cloth: 0x4ab4c8 },
  },
  {
    id: 'moonblade', fam: 'combat', name: 'Moonblade', color: '--c-gale', core: 'Silver Draw',
    lead: 'Moonblade is the single drawn cut: patience, then one stroke that ends it.',
    how: 'Land critical blows and parry: Moonlight builds into a Moonfall Cut.',
    mech: { res: 'Moonlight', color: '#cfe4ff', gain: { hit: 5, crit: 12, parry: 10 }, per: { crit: 0.15 }, full: { kind: 'execute', name: 'Moonfall Cut', when: 'next', style: 'frost', d: 260 }, mark: { name: 'Waning', on: 'crit', at: 3, per: 0.04, burst: 'bleed', style: 'frost' } },
    asc: [a('Crescent', 'One cut, shaped like the moon.', ['Silver Edge', 'Waxing', 'Quick Draw', 'The Last Crescent'], 'edge'), a('Eclipse Guard', 'In the dark, you wait.', ['Night Mail', 'Pale Ward', 'Patient Moon', 'The Dark Side'], 'guard')],
    teacher: { npc: 'ht-moonblade', name: 'Sister Selene', title: 'Keeper of the night stones', at: [-292, -342], where: 'among the Sunwheel Stones, south-west of Elder Glen', idle: 'I keep the stones by moonlight. Come back when your blade has learned to wait.', look: 'robed', cloth: 0xa0b8e0 },
  },
  {
    id: 'swordsaint', fam: 'combat', name: 'Sword Saint', color: '--c-gale', core: 'Perfect Clarity',
    lead: 'Sword Saint has stopped trying to win: parry, dodge, and one cut when the moment is perfect.',
    how: 'Parry and dodge to build Clarity, then let it out as One Cut.',
    mech: { res: 'Clarity', color: '#e6fffb', gain: { parry: 20, dodge: 15, hit: 4 }, decay: 3, per: { crit: 0.2, parryWindow: 0.4 }, full: { kind: 'blast', name: 'One Cut', when: 'next', style: 'gale', r: 2.5, d: 300, fx: 'bleed' } },
    asc: [a('Saint of the Edge', 'There is only the cut.', ['Pure Steel', 'Clear Strike', 'No Hesitation', 'The Perfect Cut'], 'edge'), a('Saint of the Ward', 'No blade has touched her in forty years.', ['Empty Hand', 'Still Ward', 'Unmoved', 'Forty Years'], 'guard')],
    teacher: { npc: 'ht-swordsaint', name: 'The Blind Swordswoman', title: 'Sword Saint of the Hollow Ridge', at: [1962, -170], where: 'at the mouth of the Hollow Ridge caves, north-east along the King\'s Road', idle: 'I cannot see you. I can hear how you stand. Not yet.', look: 'hooded', cloth: 0xd8d0c0 },
  },
  // ---- Cross Style's gateways ---------------------------------------------------------------
  {
    id: 'reaver', fam: 'combat', name: 'Reaver', color: '--c-steel', core: 'No Mercy',
    lead: 'Reaver fights with two blades and no mercy: every kill feeds the next, until you are Reaving.',
    how: 'Kill and keep killing: Carnage builds until you start Reaving, and you fight harder when hurt.',
    mech: { res: 'Carnage', color: '#d8574a', gain: { hit: 6, kill: 15 }, per: { melee: 0.2, attackSpeed: 0.1 }, full: { kind: 'buff', name: 'Reaving', when: 'auto', style: 'blood', t: 8, m: { attackSpeed: 0.3, melee: 0.25 } }, low: { below: 0.5, m: { melee: 0.2 } } },
    asc: [a('Butcher', 'They stop counting the bodies.', ['Red Blades', 'Carnage Fury', 'Quick Cleavers', 'The Slaughter'], 'edge'), a('Survivor', 'Somehow, always the last one standing.', ['Scar Armour', 'Thick Skin', 'Last Standing', 'Too Mean to Die'], 'guard')],
    teacher: { npc: 'ht-reaver', name: 'Kord the Reaver', title: 'An outlaw with two cleavers', at: [-172, -252], where: 'in the Old Quarry, south-west of Elder Glen', idle: 'You want to learn the Reaving? Ha. Get more blood on you first.', look: 'wild', cloth: 0x6a3020 },
  },
  {
    id: 'nightblade', fam: 'combat', name: 'Nightblade', color: '--c-steel', core: 'The Wrong Hand',
    lead: 'Nightblade is the hand you are not watching: strikes from behind, shadows that stun, and a cut at nightfall.',
    how: 'Strike from behind and dodge: Shadow builds into Nightfall.',
    mech: { res: 'Shadow', color: '#b48cff', gain: { back: 20, hit: 5, dodge: 10 }, per: { crit: 0.15 }, full: { kind: 'execute', name: 'Nightfall', when: 'next', style: 'shadow', d: 240 }, mark: { name: 'Shadowed', on: 'hit', at: 4, per: 0.03, burst: 'stun', style: 'shadow' } },
    asc: [a('Midnight', 'The darkest hour is yours.', ['Black Steel', 'Night Fury', 'Quick Shadow', 'The Hour of Knives'], 'edge'), a('Dusk', 'Half seen, never caught.', ['Shade Cloak', 'Dusk Ward', 'Half Seen', 'The Long Dusk'], 'guard')],
    teacher: { npc: 'ht-nightblade', name: 'Vesper', title: 'A shadow among the trees', at: [-330, 318], where: 'at the edge of the Gravewood, west of Elder Glen', idle: 'You saw me. That means you are not ready.', look: 'hooded', cloth: 0x30283a },
  },
  {
    id: 'bladedancer', fam: 'combat', name: 'Bladedancer', color: '--c-steel', core: 'The Steps',
    lead: 'Bladedancer turns the fight into a dance: every dodge and parry a step, every step a cut.',
    how: 'Dodge, parry and keep cutting: Rhythm builds into a Dance of Blades.',
    mech: { res: 'Rhythm', color: '#c8d2e6', gain: { hit: 6, dodge: 12, parry: 12 }, per: { attackSpeed: 0.25, moveSpeed: 0.1 }, full: { kind: 'blast', name: 'Dance of Blades', when: 'next', style: 'steel', r: 4, d: 160, fx: 'bleed' } },
    asc: [a('Whirling Steel', 'The dance never ends.', ['Bright Blades', 'Quickening', 'Light Feet', 'The Last Dance'], 'edge'), a('Veil Dancer', 'They never learned the steps.', ['Silk Guard', 'Flowing Ward', 'Graceful', 'The Slow Waltz'], 'guard')],
    teacher: { npc: 'ht-bladedancer', name: 'Lio Silverstep', title: 'A dancer at the Lantern Camp', at: [1080, 54], where: 'at the Lantern Camp on the King\'s Road', idle: 'Watch my feet. No, not my blades. My feet. Come back when you have.', look: 'robed', cloth: 0xc0a0e0 },
  },
  // ---- Boundary's gateways -----------------------------------------------------------------
  {
    id: 'stillmind', fam: 'combat', name: 'Stillmind', color: '--c-ward', core: 'The Still Ring',
    lead: 'Stillmind does not move: stillness gathers on its own, and whatever reaches into it is turned back.',
    how: 'Stand your ground: Stillness gathers on its own and from parries, and breaks as the Still Point.',
    mech: { res: 'Stillness', color: '#5fa8ff', regen: 3, decay: 0, gain: { parry: 10, block: 8 }, per: { parryWindow: 0.5, dmgTaken: -0.15 }, full: { kind: 'blast', name: 'The Still Point', when: 'next', style: 'light', r: 4, d: 150, fx: 'stun' } },
    asc: [a('Unmoving', 'The ring does not move.', ['Firm Ring', 'Deep Calm', 'Quiet Mind', 'The Unmoved Centre'], 'guard'), a('Still Strike', 'From stillness, one blow.', ['Still Edge', 'Calm Fury', 'Quick Calm', 'The Still Blow'], 'edge')],
    teacher: { npc: 'ht-stillmind', name: 'Abbot Hollin', title: 'A monk who sits by the mill race', at: [162, -28], where: 'by the River Mill, east of Elder Glen', idle: 'Sit with me. No? Then you are not ready to be still.', look: 'robed', cloth: 0x8a7a5a },
  },
  {
    id: 'ironwall', fam: 'combat', name: 'Ironwall', color: '--c-ward', core: 'Unyielding Iron',
    lead: 'Ironwall takes every blow and sends it back broken.',
    how: 'Block and be hit: Iron builds into Retribution.',
    mech: { res: 'Iron', color: '#aeb8cc', gain: { block: 12, hurt: 8, parry: 10 }, per: { dmgTaken: -0.2, poise: 0.4 }, full: { kind: 'blast', name: 'Retribution', when: 'next', style: 'steel', r: 3.5, d: 170, fx: 'stun' } },
    asc: [a('Vengeance', 'Everything comes back.', ['Spiked Shield', 'Payback', 'Quick Return', 'The Iron Answer'], 'edge'), a('Fortress', 'Nothing gets in.', ['Iron Skin', 'Wall Ward', 'Unbreakable', 'The Last Gate'], 'guard')],
    teacher: { npc: 'ht-ironwall', name: 'Ser Branwen Holt', title: 'A knight who will not leave the old road', at: [1395, 112], where: 'on the road just past the Wayfarer\'s Rest', idle: 'I swore to hold this road. I still do. You are not strong enough to share it yet.', look: 'armoured', cloth: 0x707a8a },
  },
  {
    id: 'shieldwarden', fam: 'combat', name: 'Shieldwarden', color: '--c-ward', core: 'The Warden\'s Vow',
    lead: 'Shieldwarden stands so others may sleep: it challenges, holds, and heals itself through the worst of it.',
    how: 'Block, take blows and win: Resolve builds until the Warden\'s Vow heals you.',
    mech: { res: 'Resolve', color: '#5fa8ff', gain: { block: 10, hurt: 6, kill: 8 }, per: { dmgTaken: -0.15, heal: 0.2 }, full: { kind: 'heal', name: 'Warden\'s Vow', when: 'auto', style: 'light', d: 25 }, mark: { name: 'Challenged', on: 'hit', at: 3, per: 0.03, burst: 'stun', style: 'light' } },
    asc: [a('Warden', 'Those behind the line sleep soundly.', ['Watchful Plate', 'Vow Kept', 'Steady Guard', 'The Long Night'], 'guard'), a('Challenger', 'Come and try.', ['Challenge Edge', 'Call Out', 'Quick Answer', 'The Last Challenge'], 'edge')],
    teacher: { npc: 'ht-shieldwarden', name: 'Old Captain Ferris', title: 'Keeper of the crypt road', at: [12, -300], where: 'on the road to the Old Crypt, south of Elder Glen', idle: 'Somebody has to watch the crypt road. It might as well be me. Come back stronger.', look: 'armoured', cloth: 0x4a6a8a },
  },
  // ---- Lightbinder's gateways ---------------------------------------------------------------
  {
    id: 'lifewarden', fam: 'magic', name: 'Lifewarden', color: '--c-light', core: 'Mercy Beyond Reason',
    lead: 'Lifewarden carries mercy past the point of reason: every spell feeds a wellspring that heals you.',
    how: 'Cast: Mercy builds and pours out as a Wellspring.',
    mech: { res: 'Mercy', color: '#ffe08a', gain: { spell: 8, cast: 6 }, per: { heal: 0.4 }, full: { kind: 'heal', name: 'Wellspring', when: 'auto', style: 'light', d: 30 } },
    asc: [a('Mercy', 'Nobody dies while you are here.', ['Kind Light', 'Wellspring Ward', 'Calm Hands', 'The Last Mercy'], 'guard'), a('Wrath of Mercy', 'Mercy for them. Not for you.', ['Bright Mercy', 'Burning Grace', 'Quick Grace', 'The Hard Mercy'], 'edge')],
    teacher: { npc: 'ht-lifewarden', name: 'Mother Agathe', title: 'A healer who tends travellers', at: [676, 194], where: 'by the Chapel of the Dawn on the King\'s Road', idle: 'Sit, sit, you look terrible. No, I will not teach you yet. Eat something.', look: 'robed', cloth: 0xe0d0a0 },
  },
  {
    id: 'inquisitor', fam: 'magic', name: 'Inquisitor', color: '--c-light', core: 'Conviction',
    lead: 'Inquisitor judges without waiting for evidence: accuse, condemn, and pass sentence.',
    how: 'Cast and kill: Conviction builds into a Sentence that kills the weak outright.',
    mech: { res: 'Conviction', color: '#ffe08a', gain: { spell: 9, kill: 10 }, per: { spell: 0.2 }, full: { kind: 'execute', name: 'Sentence', when: 'next', style: 'light', d: 120 }, mark: { name: 'Accused', on: 'spell', at: 3, per: 0.05, burst: 'execute', style: 'light' } },
    asc: [a('Judge', 'The verdict is in.', ['Harsh Light', 'Swift Verdict', 'Quick Trial', 'The Final Judgment'], 'edge'), a('Confessor', 'Confess, and be spared. Perhaps.', ['Grey Robes', 'Penance', 'Iron Faith', 'The Long Confession'], 'guard')],
    teacher: { npc: 'ht-inquisitor', name: 'Inquisitor Vale', title: 'A grey-robed judge', at: [652, 80], where: 'in Millbrook, on the King\'s Road', idle: 'I judge the guilty. You are not yet worth judging.', look: 'hooded', cloth: 0x8a8a8a },
  },
  {
    id: 'lightweaver', fam: 'magic', name: 'Lightweaver', color: '--c-light', core: 'Threads of Light',
    lead: 'Lightweaver weaves every thread of light into one cloth: chains that bind, needles that stitch.',
    how: 'Cast: Threads build and leap between enemies as Woven Light.',
    mech: { res: 'Threads', color: '#ffe08a', gain: { spell: 8 }, per: { spell: 0.15, castSpeed: 0.15 }, full: { kind: 'chain', name: 'Woven Light', when: 'next', style: 'light', n: 6, d: 70, fx: 'stun' }, mark: { name: 'Woven', on: 'spell', at: 4, per: 0.03, burst: 'root', style: 'light' } },
    asc: [a('Loom of Stars', 'Every star a thread.', ['Bright Thread', 'Star Weave', 'Quick Loom', 'The Great Tapestry'], 'edge'), a('Shroud Weaver', 'A cloth of light around you.', ['Light Cloth', 'Woven Ward', 'Tight Weave', 'The Seamless Shroud'], 'guard')],
    teacher: { npc: 'ht-lightweaver', name: 'Ysolde the Weaver', title: 'Keeper of the Aurelle Light', at: [2924, -12], where: 'at the Aurelle Light, the lighthouse of Port Aurelle', idle: 'The lamp needs tending, and so do you. Not yet.', look: 'robed', cloth: 0xfff0c0 },
  },
  // ---- Pyromancer's gateways -----------------------------------------------------------------
  {
    id: 'sunbreaker', fam: 'magic', name: 'Sunbreaker', color: '--c-fire', core: 'Broken Sun',
    lead: 'Sunbreaker breaks the sun itself: flares, plasma and a star that dies at your feet.',
    how: 'Cast: Corona builds into a Solar Flare.',
    mech: { res: 'Corona', color: '#ff8246', gain: { spell: 10 }, per: { spell: 0.25 }, full: { kind: 'blast', name: 'Solar Flare', when: 'next', style: 'fire', r: 5, d: 80, fx: 'burn' } },
    asc: [a('Supernova', 'Burn brightest at the end.', ['Hot Core', 'Flare Fury', 'Quick Burn', 'The Dying Star'], 'edge'), a('Corona Guard', 'The sun\'s crown, around you.', ['Sun Mail', 'Corona Ward', 'Steady Flame', 'The Crown of the Sun'], 'guard')],
    teacher: { npc: 'ht-sunbreaker', name: 'Akhet the Sunbreaker', title: 'A fire-priest exiled to the Rust Market', at: [-5250, 470], where: 'at the edge of the Rust Market, in the Golden Expanse', idle: 'They cast me out for breaking the sun. You could not even crack it. Go.', look: 'robed', cloth: 0xd8783a },
  },
  {
    id: 'ashwalker', fam: 'magic', name: 'Ashwalker', color: '--c-fire', core: 'Where Nothing Grows',
    lead: 'Ashwalker leaves only ash: fire that smoulders in everything it touches, and kills that feed the burning.',
    how: 'Cast and kill: Ash builds into Ashfall.',
    mech: { res: 'Ash', color: '#ff8246', gain: { spell: 7, kill: 12 }, per: { spell: 0.15, moveSpeed: 0.1 }, full: { kind: 'blast', name: 'Ashfall', when: 'next', style: 'fire', r: 6, d: 60, fx: 'burn' }, mark: { name: 'Smouldering', on: 'spell', at: 4, per: 0.03, burst: 'blast', style: 'fire' } },
    asc: [a('Cinderlord', 'Everything burns, eventually.', ['Hot Ash', 'Spreading Fire', 'Quick Ember', 'The Year of Ash'], 'edge'), a('Ashen', 'Ash does not burn twice.', ['Ash Skin', 'Cinder Ward', 'Fireproof', 'The Grey Walk'], 'guard')],
    teacher: { npc: 'ht-ashwalker', name: 'The Ash Widow', title: 'A woman who walks the Bone Wells', at: [-5940, 1272], where: 'at the Bone Wells, deep in the Golden Expanse', idle: 'Where I walk, nothing grows. You would not survive the walk. Not yet.', look: 'hooded', cloth: 0x4a4440 },
  },
  {
    id: 'phoenix', fam: 'magic', name: 'Phoenix', color: '--c-fire', core: 'Every Ending',
    lead: 'Phoenix treats every ending as kindling: wounds feed the fire, and the fire brings you back.',
    how: 'Cast and be hurt: Rebirth builds until it heals you.',
    mech: { res: 'Rebirth', color: '#ffb24a', gain: { spell: 8, hurt: 6 }, per: { spell: 0.15, heal: 0.2 }, full: { kind: 'heal', name: 'Rebirth', when: 'auto', style: 'fire', d: 40 } },
    field: { name: 'Phoenix Wings', kind: 'glide', text: 'Hold Jump while falling to glide down on wings of flame.' },
    asc: [a('Firebird', 'Burn, and fly.', ['Flame Feathers', 'Wing Fury', 'Quick Flight', 'The Blazing Sky'], 'edge'), a('Undying Flame', 'Every ending is kindling.', ['Ember Skin', 'Ash Ward', 'Rising Again', 'The Eternal Flame'], 'guard')],
    teacher: { npc: 'ht-phoenix', name: 'Keeper of the Nest', title: 'A flame-haired hermit', at: [-5300, 1042], where: 'in the ruins of Glasswind, in the Golden Expanse', idle: 'The nest is not for the living. Not yet. Come back when you have burned.', look: 'wild', cloth: 0xe05a20 },
  },
  // ---- the two nothing taught ---------------------------------------------------------------
  {
    id: 'oathbreaker', fam: 'combat', name: 'Oathbreaker', color: '--c-gold', core: 'The Broken Vow', requires: ['boundary', 15],
    lead: 'Oathbreaker carries a broken vow like armour: guilt that hurts, and hurt that becomes strength.',
    how: 'Take blows and land them: Guilt builds into Penance, and you fight harder when wounded.',
    mech: { res: 'Guilt', color: '#d9b15a', gain: { hurt: 10, hit: 5, kill: 8 }, per: { melee: 0.2, dmgTaken: -0.1 }, full: { kind: 'blast', name: 'Penance', when: 'next', style: 'shadow', r: 3.5, d: 170, fx: 'leech' }, low: { below: 0.5, m: { melee: 0.2 } } },
    asc: [a('Forsworn', 'The vow is broken. So are they.', ['Black Steel', 'Bitter Fury', 'Quick Shame', 'The Knight Who Fell'], 'edge'), a('Penitent', 'Every blow, a penance.', ['Hair Shirt', 'Penance Ward', 'Bearing It', 'Absolution'], 'guard')],
    tree: [
      ['Black Shield', 'Cursed defence', [['Heavy Heart', 'Cold Plate'], ['*Black Shield', 'Spite', 'Grim Guard'], ['*Penance Strike', '?Shame|Fury', 'Bitter Iron'], ['!Broken Vow', '*Forsworn Wall', 'Rust'], ['Unforgiven', 'Hollow']], 'The Knight Who Fell'],
      ['Guilt', 'Pain into power', [['Bleed Out', 'Remember'], ['*Self Flagellation', 'Guilt Well', 'Scar Tissue'], ['*Reckoning', '?Atone|Embrace', 'Grief'], ['!Martyrdom', '*Last Confession', 'Numb'], ['Weight of Years', 'Old Wounds']], 'Absolution'],
      ['Road', 'The failed watch', [['Road Dust', 'Night Watch'], ['*Sentinel', 'Unseen', 'Tireless'], ['*Ambush', '?Lantern|Darkness', 'Patrol'], ['!Lone Guard', '*Hold the Road', 'Old Oath'], ['Watchman', 'Grave Vigil']], 'None Shall Pass'],
    ],
    teacher: { npc: 'ht-oathbreaker', name: 'The Fallen Knight', title: 'Once of the Silver Lance', at: [-318, 346], where: 'in the Gravewood, west of Elder Glen', idle: 'I broke my word once. It cost a village. You have not yet earned the right to hear how. Hold a line first: Boundary, to fifteen.', look: 'armoured', cloth: 0x3a3428 },
  },
  {
    id: 'voidwalker', fam: 'magic', name: 'Voidwalker', color: '--c-shadow', core: 'Entropy', requires: ['shadowcaller', 15], noEngine: true,
    lead: '', how: 'Build Entropy with void spells until it collapses on everything near.',
    mech: { res: 'Entropy', color: '#8a5aff', gain: {} },
    asc: [a('-', '-', ['-', '-', '-', '-'], 'edge'), a('-', '-', ['-', '-', '-', '-'], 'guard')],
    teacher: { npc: 'ht-voidwalker', name: 'The Starless Man', title: 'He stares at the sky where a star went out', at: [-312, -366], where: 'by the Sunwheel Stones, south-west of Elder Glen', idle: 'There was a star there. Now there is a hunger. You cannot hear it yet. Learn the dark first: Shadowcaller, to fifteen.', look: 'hooded', cloth: 0x1a1430 },
  },
];

export const HIDDEN: ClassSpec[] = OVERLAYS.map((o) => ({
  id: o.id, fam: o.fam, tier: 'hidden', name: o.name, color: o.color, overlay: true, noEngine: o.noEngine,
  mentor: `${o.teacher.name}, ${o.teacher.where}`, mentorNpc: o.teacher.npc, requires: o.requires,
  gateFrom: undefined, flavour: '', how: o.how, core: o.core, lead: o.lead, mech: o.mech, field: o.field,
  tree: o.tree ?? treeOf(o.id), skills: {}, asc: o.asc, teacher: o.teacher,
}));
