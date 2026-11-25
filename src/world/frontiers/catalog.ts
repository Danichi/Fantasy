import { roadPoint } from '../roadData';
import { ISLANDS } from '../islands/layout';
import type { Front } from './context';
export type FieldKind = 'cache' | 'vista' | 'memory' | 'refugees' | 'checkpoint' | 'convoy' | 'rift';
export interface FieldDef {
  id: string;
  name: string;
  kind: FieldKind;
  front: Front;
  at: readonly [number, number];
  level: number;
  clues: [string, string, string];
  ending: string;
  reward: { gold?: number; xp: number; item?: string; count?: number };
}
const find = (
  id: string,
  name: string,
  kind: FieldKind,
  front: Front,
  at: readonly [number, number],
  level: number,
  clues: FieldDef['clues'],
  ending: string,
  item = 'wildmint'
): FieldDef => ({ id, name, kind, front, at, level, clues, ending, reward: { xp: 45 + level * 8, item, count: kind === 'cache' ? 3 : 1 } });
const encounter = (id: string, name: string, kind: FieldKind, front: Front, at: readonly [number, number], level: number, ending: string): FieldDef => ({
  id,
  name,
  kind,
  front,
  at,
  level,
  clues: ['Read the situation and speak to the people here.', 'Choose a response; you can leave and return.', 'Return to the camp once the way is safe.'],
  ending,
  reward: { xp: 90 + level * 12, gold: kind === 'checkpoint' ? 0 : 25 + level * 4 },
});
/** Authored field stories on the current playable terrain, not a replacement geographic map. */
export function fieldCatalog(): FieldDef[] {
  const defs: FieldDef[] = [
    find(
      'glen-letters',
      'Letters that never arrived',
      'cache',
      'heartland',
      [268, 174],
      3,
      [
        'A split courier case bears three different military route stamps. Follow the dropped ribbon northeast.',
        'The second letter asks the miller to feed a family displaced by a border raid. The bundle lies farther east, beside a leaning marker.',
        'The remaining letters name living people, not enemy agents. Recover the courier’s emergency supplies.',
      ],
      'You preserve the letters for the next Crown courier. Three fronts have drawn supplies from the same little valley.',
      'healthPotion'
    ),
    find(
      'glen-names',
      'Names on the milestone',
      'memory',
      'heartland',
      [-210, 194],
      3,
      [
        'Someone has scratched names beneath the old road distances. A second stone stands northeast.',
        'These are households evacuated from the border, not a list of fallen soldiers. Follow the small cairn east.',
        'An intact family seal rests beneath the last stone. Record it for travelers searching for relatives.',
      ],
      'Your field notes preserve a list the official dispatches overlooked.'
    ),
    find(
      'ridge-signals',
      'Three silent signals',
      'vista',
      'heartland',
      roadPoint('kings', 780, -28),
      7,
      [
        'A shuttered lantern faces the eastern road. Look northeast for its survey stake.',
        'The stake measures the river bend, not the city walls. The last sightline lies east.',
        'From the final marker the bridge, road and grain fields fit together: a supply route worth protecting.',
      ],
      'You record a useful lookout and the route the relief wagons need.',
      'sungrass'
    ),
    find(
      'crown-payroll',
      'The borrowed banner',
      'cache',
      'crownRoad',
      roadPoint('capital', 1250, 30),
      12,
      [
        'A discarded toll notice uses the Crown’s colors. Follow its torn cord northeast.',
        'Its dates do not match the wardens’ orders. The real ledger is wrapped in oilcloth farther east.',
        'The ledger names a hired company charging civilians for passage. Recover the hidden travel supplies.',
      ],
      'You can recognize this company’s false checkpoints. A coat of paint is not royal authority.',
      'manaPotion'
    ),
    find(
      'crown-vigil',
      'A watch without relief',
      'memory',
      'crownRoad',
      roadPoint('capital', 1950, -30),
      15,
      [
        'Three watch posts requested relief on the same morning. The next message is northeast.',
        'The same six wardens were assigned to all three. Follow the old dispatch trail east.',
        'The last post kept a small reserve for civilian runners. Record the supply shortage.',
      ],
      'The exposed heartland is being defended by people, not an inexhaustible army.'
    ),
    find(
      'forest-truce',
      'Two halves of a safe-conduct',
      'cache',
      'forest',
      [-1210, -1970],
      18,
      [
        'A leaf seal is tied to a human survey ribbon. The matching witness mark lies northeast.',
        'Both councils signed the crossing agreement. Someone has cut the copy in half; look farther east.',
        'The restored safe-conduct distinguishes protected travelers from armed logging crews.',
      ],
      'The forest frontier has agreements as well as enemies. You record a lawful crossing.',
      'sungrass'
    ),
    find(
      'forest-resonance',
      'The root that hears two worlds',
      'vista',
      'forest',
      [-2150, -2610],
      24,
      [
        'The nearest root hums after the wind stops. A second listening stone stands northeast.',
        'There are two echoes, but only one birdcall. Follow the last stone east.',
        'The second echo comes from the Dark. Record the thin place without disturbing the living tree.',
      ],
      'This scar crosses the war’s borders. No neighboring kingdom created the other sky.',
      'manaPotion'
    ),
    find(
      'holds-marks',
      'The missing grain tally',
      'cache',
      'holds',
      [4278, -4530],
      23,
      [
        'Ore weights have been written over flour counts. The next tally lies northeast.',
        'The holds accuse each other, but both wagons used the same hired pass guards. Follow the final crate east.',
        'A hidden tally records the diverted provisions. Gather the surviving stores.',
      ],
      'The theft belongs to a supply racket, not a decree from every dwarf or the Iron Below.',
      'healthPotion'
    ),
    find(
      'holds-skyline',
      'The convoy’s last lantern',
      'vista',
      'holds',
      [3810, -4930],
      27,
      [
        'A sheltered route marker points northeast beneath the wind.',
        'The second marker keeps the cliff between the road and the storm. The final cairn lies east.',
        'A sightline connects three safe rests for heavily laden travelers.',
      ],
      'Your notes preserve a route for food and ore through the contested passes.',
      'sungrass'
    ),
    find(
      'desert-well',
      'The well with two prices',
      'cache',
      'desert',
      [-2950, 390],
      23,
      [
        'The stone well tariff is older than the nailed military notice. Check the tally northeast.',
        'The extra charge was levied by a hired escort company. Its locked account lay farther east.',
        'The account lists which families were turned away. Recover the emergency herbs left for them.',
      ],
      'Water access is this front’s weapon. You preserve evidence of the unauthorized levy.',
      'wildmint'
    ),
    find(
      'desert-passage',
      'A caravan without a banner',
      'memory',
      'desert',
      [-3400, 730],
      26,
      [
        'Three nations’ coins lie beside one caravan mark. A scratched route arrow points northeast.',
        'The travelers struck their flags to cross the fighting. Follow the last cairn east.',
        'A message asks the next caravan to carry names of the missing, not another royal claim.',
      ],
      'The Golden Expanse has its own people and government. Its travelers are not a great power’s disposable followers.'
    ),
    encounter(
      'glen-relief',
      'The families at the roadside',
      'refugees',
      'heartland',
      roadPoint('kings', 520, 26),
      5,
      'The families have enough medicine for the next stretch. Their safe-conduct can help you with lawful supply posts.'
    ),
    encounter(
      'crown-toll',
      'A second toll',
      'checkpoint',
      'crownRoad',
      roadPoint('capital', 1550, -25),
      13,
      'The hired company no longer bars this crossing. This is a local opening, not victory in the whole war.'
    ),
    encounter(
      'crown-convoy',
      'The grain that must get through',
      'convoy',
      'crownRoad',
      roadPoint('capital', 2250, 24),
      16,
      'The grain convoy leaves under its own colors. The next travelers on this road will hear what you did.'
    ),
    encounter(
      'forest-relief',
      'Across the logging line',
      'refugees',
      'forest',
      [-1140, -1680],
      16,
      'You help wounded civilians on both sides of the logging line without declaring either council your enemy.'
    ),
    encounter(
      'forest-rift',
      'The clearing with a second shadow',
      'rift',
      'forest',
      [-2260, -3020],
      26,
      'The breach closes. A local war cannot explain every creature walking out of the trees.'
    ),
    encounter(
      'holds-convoy',
      'Provisions beneath the ore',
      'convoy',
      'holds',
      [4350, -4610],
      25,
      'The hold’s food stores are moving again. The convoy carries a practical pass, not a divine allegiance.'
    ),
    encounter(
      'desert-toll',
      'The seized water account',
      'checkpoint',
      'desert',
      [-2670, 650],
      24,
      'The well route is open to travelers again. The Sultanate remains independent of any great power.'
    ),
    encounter(
      'heartland-rift',
      'The ditch that faces the wrong sky',
      'rift',
      'heartland',
      [390, 370],
      7,
      'You bind the thin place before it can swallow the old lane. The public war and the Dark remain separate dangers.'
    ),
    encounter(
      'eastern-stores',
      'Beyond the crossing',
      'convoy',
      'eastern',
      [10040, 180],
      38,
      'The civilian work crew escapes with the requisition ledger. The eastern army still has to break the Queen’s crossing.'
    ),
  ];
  // Existing islands provide dry authored path locations instead of guessing positions in open sea.
  for (const [region, front] of [
    ['azureIsles', 'azure'],
    ['emeraldIsles', 'emerald'],
    ['shatteredIsles', 'shattered'],
    ['sunkenIsles', 'sunken'],
  ] as const) {
    const isle = ISLANDS.find((i) => i.region === region)!;
    const path = isle.paths.find((p) => p.length > 2) ?? [isle.landing, ...isle.sites.map((s) => s.at)];
    const a = path[Math.floor(path.length / 2)] ?? isle.landing;
    defs.push(
      find(
        front + '-dispatch',
        { azure: 'The false convoy signal', emerald: 'The forest cargo marks', shattered: 'The letter of salvage', sunken: 'A diver’s double echo' }[front],
        'cache',
        front,
        [a[0] + 14, a[1] + 10],
        25 + (defs.length % 8),
        [
          'An abandoned dispatch points to another bundle northeast.',
          'Its markings distinguish a civilian harbor from the fleets fighting over the crossing. Follow the last trail east.',
          'Recover the supplies and record the port’s own account of the war.',
        ],
        'You record an independent island community’s story, not a claim that the Queen owns every shore.',
        'manaPotion'
      )
    );
    defs.push(
      encounter(
        front + '-situation',
        { azure: 'A convoy short of medicine', emerald: 'The timber landing party', shattered: 'Survivors are not salvage', sunken: 'The drowned ward' }[front],
        front === 'sunken' ? 'rift' : front === 'azure' ? 'refugees' : 'checkpoint',
        front,
        [isle.landing[0] - 18, isle.landing[1] - 24],
        26 + (defs.length % 7),
        'The islanders keep their own account of what happened. The sea war continues beyond their harbor.'
      )
    );
  }
  return defs;
}
