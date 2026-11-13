// ---------------------------------------------------------------------------
// Portraits for the conversation box (painted in Higgsfield, cut into
// public/assets/art/npc/<slug>.webp and art/arch/<kind>.webp).
//
// Named people have their own portrait. Anyone else who is plainly a person
// gets one by what they are (a guard, a farmer, a sailor...), picked from the
// words in their name and title. A sign, a scroll or a place gets none.
// ---------------------------------------------------------------------------

import ART from './artManifest.json';

const NAMED = ART.npc as Record<string, string>;
const ARCH = new Set<string>((ART as { arch?: string[] }).arch ?? []);

/** [archetype (male), archetype (female) or null, words that mean it] */
const KINDS: [string, string | null, RegExp][] = [
  ['desertM', null, /\bsun guard\b|ghagrabba|bazaar|expanse|water-seller/],
  ['guardM', 'guardF', /\b(guard|watch(man)?|sentry|sergeant|corporal|warden|gate)\b/],
  ['soldierM', null, /\b(soldier|knight|ser|militia|lance|rider|veteran|captain)\b/],
  ['monkM', null, /\b(monk|brother|abbot|friar|hermit)\b/],
  ['priestF', 'priestF', /\b(priest(ess)?|sister|temple|dawn|acolyte|pilgrim)\b/],
  ['sailorM', 'sailorF', /\b(sailor|fisher(man|wife)?|boat(wo)?man|deckhand|harbour|quay|mariner|bosun)\b/],
  ['nobleM', 'nobleF', /\b(lord|lady|noble|duke|baron|count(ess)?|envoy|herald|court)\b/],
  ['merchantM', 'merchantF', /\b(merchant|trader|hawker|peddler|pedlar|tinker|shop|seller|fence|market|smith|baker|tailor|keeper|innkeeper|alchemist|apothecary|stablemaster|ostler)\b/],
  ['farmerM', 'farmerF', /\b(farmer|shepherd|drover|hay|wheat|cattle|miller|granary|egg|charcoal|refugee|villager)\b/],
  ['boy', 'girl', /\b(child|lad|lass|boy|girl|urchin|grandson|granddaughter)\b/],
  ['oldM', 'oldF', /\b(old (?:man|woman|soldier|timer)|grandfather|grandmother|crone|seer|hermit)\b/],
];

const FEMALE = /\b(woman|wife|lady|lass|girl|sister|mother|widow|queen|priestess|countess|maid|daughter|grandmother|crone|she)\b/;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The portrait for whoever is speaking, or null for a sign, a place, a scroll. */
export function portraitFor(name: string, title = ''): string | null {
  const own = NAMED[name] ?? NAMED[name.replace(/[’']/g, '’')];
  if (own) return `/assets/art/${own}.webp`;
  const words = `${name} ${title}`.toLowerCase().replace(/[’]/g, "'");
  for (const [m, f, re] of KINDS) {
    if (!re.test(words)) continue;
    const kind = f && FEMALE.test(words) ? f : m;
    if (ARCH.has(kind)) return `/assets/art/arch/${kind}.webp`;
  }
  return null;
}

/** for tests: the slug a named portrait is filed under */
export const portraitSlug = slug;

const REGION_ART = new Set<string>((ART as { region?: string[] }).region ?? []);
/** A painted view of a region (art/region/<id>.webp), or null. */
export function regionArt(id: string): string | null {
  return REGION_ART.has(id) ? `/assets/art/region/${id}.webp` : null;
}
