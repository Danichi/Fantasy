# Spell and attack VFX: the realistic pass

Direction (Nov 2026): **realistic, cinematic effects** with each school's
colour taken from the combat reference boards (sword and Gale electric blue,
greatsword and Cross crimson, spear and holy gold, axe fire orange, mace and
void violet, daggers emerald, frost ice-blue, storm blue-violet). The world
keeps its soft Breath of the Wild light; the magic is where the game turns
cinematic.

Effects are painted, not just particles: film-like fire, ice, lightning and
light rendered with Higgsfield and played back as textures on top of the
existing particle work. Code: `src/fx/vfxSprites.ts`; art and pipeline:
`public/assets/fx/`, `tools/fx/README.md`.

## Building blocks

| Block | What it is | Where |
| --- | --- | --- |
| Burst | 16-frame painted explosion facing the camera (bloom, peak, break-up, fade) | `SkillFx.paintedBurst`, every `impact` and `burst` |
| Slash ribbon | Layered arch of braided light filaments laid along the swing | `SkillFx.slash` (and so `spinSlash`, `nova`), wind-blade projectiles |
| Magic circle | Detailed top-down sigil per school, turning slowly under the caster | `MagicCircles.ground` / `facing` |
| Orb core | Looping roiling fire (Fireball) or a school's burst held at its brightest frames | Fireball, `orb` projectiles |
| Shield | Hex-lattice energy sphere | `SkillFx.bubble` (blue schools) |
| Pillar | Column of light with god rays, tinted to the school | `SkillFx.pillar` |
| Blade trail | Painted streak along every melee swing in the weapon family's colour; charged or perfect blows burn toward white-hot and linger | `fx/weaponTrail.ts` |
| Ground mark | Lingering decal under impacts, novas and smites (scorch, frost, glowing cracks, void burn, holy sun-wheel, lightning scar, wildflower bloom); fades after 10-18 s, at most 24 at once | `fx/decals.ts` |

Every block falls back to the old procedural effect if its texture has not
loaded, so nothing breaks while art streams in.

## Attack patterns

Patterns are how the blocks combine over time. They live in `SkillFx`, so
every forged technique (bolt, nova, smite, meteor, whirl...) picks them up.

- **Crescent cut** (`slash`): the painted ribbon snaps on at full strength in
  the first frames, then thins out from the tail while it widens; the
  procedural arcs drop to a faint underlay. Two at crossed tilts make the
  reference "Gale" X-cut.
- **Cyclone** (`spinSlash`): three ribbons at random tilts around the body.
- **Shatter ring** (`nova`): one big bloom at the centre, then two rings of
  eruptions racing outward (inner at half radius, outer at 90%, staggered by
  ~90 ms, offset half a step), the reference "Frost Nova". It works for every
  school: a ring of fireballs, of lightning cracks, of void implosions.
- **Impact** (`impact`): painted burst plus the old flash, sparks, embers and
  shockwave ring. Projectiles end in one at about half size.
- **Smite** (`pillar`): painted light column swelling then narrowing, with
  the procedural core, ground ring and spiral of motes.
- **Bolts and orbs**: wind blades carry their slash ribbon in flight; orbs
  carry a rolling painted core and end in the school's burst.

## School by school

| School | Burst | Slash | Circle | Signature look |
| --- | --- | --- | --- | --- |
| Fire (Pyromancer, axe) | fireball blooming into smoke | flame arc | burning hexagram | roiling fireball core, ember storms |
| Frost (Cryomancer, Boundary) | ice shards starburst | ice-blue ribbons | snowflake seal | shatter rings, hex shield |
| Storm | forked lightning flash | violet ribbons | arcane blue | crackling ring of strikes |
| Light (Lightbinder, Dawnblade) | god-ray bloom | molten gold | sun-wheel seal | pillars of light |
| Gale (sword) | cyclone of blue wind | electric blue ribbons | arcane blue | crossed crescent cuts |
| Steel (Cross Style) | molten parry sparks | crimson ribbons | crimson war seal | spark showers on every clash |
| Blood (Warbreaker) | crimson essence | crimson | crimson war seal | red tendrils |
| Shadow / Void | black-hole implosion | violet lightning | vortex seal | implosion rings |
| Nature / Wind | leaf and light spiral | emerald | vine seal | green leaf storms |
| Earth | rock and dust eruption | crimson | magma seal | debris rings |
| Water | crown splash | blue | arcane blue | splash rings |

## Weapon trail colours

| Family | Trail |
| --- | --- |
| Sword | electric blue |
| Greatsword | crimson |
| Spear | gold |
| Axe | fire orange |
| Mace | violet |
| Daggers | emerald |
| Staff | arcane blue |

## Ground marks by school

| School | Mark |
| --- | --- |
| Fire | scorch with glowing embers |
| Frost, water | hoarfrost patch |
| Earth, blood | cracked crater, molten cracks |
| Void, shadow | spiral void burn |
| Light | seared sun-wheel |
| Storm, gale | lightning (Lichtenberg) scar |
| Nature, wind | spiral of moss and wildflowers |

Steel (Cross) leaves no mark. Marks are found with a ray down from the
impact, so they sit on floors in dungeons and towns too, and nothing is left
when a spell bursts in mid-air.

## Next ideas

- A distortion (heat haze) pass behind fire and wind bursts.
