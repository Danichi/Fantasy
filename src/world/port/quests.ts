import type { QuestDef, Objective } from '../../quests/questLog';
import { AURELLE } from '../portCity';
const signal = (
  id: string,
  text: string,
  at: keyof typeof AURELLE,
): Objective => ({ type: 'signal', id, text, at: AURELLE[at] });
const talk = (npc: string, text: string, say: string): Objective => ({
  type: 'talk',
  npc,
  text,
  say,
});
const q = (
  id: string,
  title: string,
  giver: string,
  summary: string,
  offer: string,
  requires: string[],
  stages: QuestDef['stages'],
  done: string,
  gold: number,
  xp: number,
): QuestDef => ({
  id,
  title,
  giver,
  region: 'portAurelle',
  summary,
  offer,
  requires,
  stages,
  done,
  rewards: { gold, xp },
});

/** Six chapters with physically located evidence, alternative routes and a saved ending. */
export const AURELLE_QUESTS: QuestDef[] = [
  q(
    'aurelle-empty-berth',
    'An Empty Berth',
    'mira',
    'The Brightwater should have come home. Mira needs someone who will look beyond the official report.',
    'The Brightwater’s berth has been empty three mornings. Nell knows her crew. Tallow has called it weather already, without asking one person on this quay. Look at her mooring and ask the people who knew her.',
    [],
    [
      {
        note: 'Inspect the Brightwater’s empty berth, then ask Nell about the crew.',
        objectives: [
          signal(
            'pa-berth',
            'Inspect the abandoned mooring in the inner harbour',
            'regatta',
          ),
          talk(
            'nell',
            'Ask Nell about the Brightwater',
            'I packed their supper myself. Edda’s lamp showed the inner channel was open. They followed it. The sea did not choose the wrong channel; somebody showed them one.',
          ),
        ],
      },
      {
        note: 'Bring Nell’s account to Mira.',
        objectives: [
          talk(
            'mira',
            'Tell Mira what Nell said',
            'A false light? Then there may be someone to bring home. Here. Keep this quiet until you have something stronger than an old woman’s word.',
          ),
        ],
      },
    ],
    'Mira trusts you with the missing crew. The berth remains empty, but it is no longer forgotten.',
    160,
    400,
  ),
  q(
    'aurelle-cargo',
    'Marks on the Cargo',
    'tallow',
    'A shipment registered as lamp oil arrived under three different company marks.',
    'Before you accuse my office, read its books. A lamp-oil consignment passed the Exchange, Renn’s warehouse and my desk. The marks should agree. They do not. Get a copy from the archive, or find the warehouse’s original tally. Bring something I can sign my name against.',
    ['aurelle-empty-berth'],
    [
      {
        note: 'Obtain the original tally. Use the customs archive or the warehouse service entrance.',
        anyOrder: true,
        objectives: [
          {
            ...signal(
              'pa-records-official',
              'Read the customs archive beneath the bell',
              'customs',
            ),
            group: 'records',
            flag: 'official',
          },
          {
            ...signal(
              'pa-records-covert',
              'Inspect the warehouse’s rear tally board',
              'warehouse',
            ),
            group: 'records',
            flag: 'covert',
          },
        ],
      },
      {
        note: 'Compare the tally with the cargo marks at the Great Quays.',
        objectives: [
          signal(
            'pa-cargo',
            'Compare the double-stamped lamp-oil barrels',
            'hoist',
          ),
        ],
      },
      {
        note: 'Show Tallow the mismatch.',
        objectives: [
          talk(
            'tallow',
            'Confront Tallow with the tally',
            'Renn insured the cargo twice. I suppressed the first report because panic would close the port. That was my mistake. The lie has grown teeth. Find Edda; she knows what a lamp can and cannot show.',
          ),
        ],
      },
    ],
    'The Harbourmaster puts his seal on your evidence. Renn Maritime has questions to answer.',
    230,
    600,
  ),
  q(
    'aurelle-wreck',
    'What the Water Keeps',
    'aurelle-keeper',
    'The wreck outside the inner basin holds a record of the signal the crew followed.',
    'My light was burning true. Somebody copied it from the old signal chamber. The wreck south of Netters’ Reach lies in sheltered water. Take a boat or swim from the last pier. The oilskin log should still be above the waterline. Watch your breath and your way home.',
    ['aurelle-cargo'],
    [
      {
        note: 'Reach the wreck outside the inner basin and recover its oilskin log.',
        objectives: [
          signal(
            'pa-wreck',
            'Recover the log from the wreck’s broken deck',
            'wreck',
          ),
        ],
      },
      {
        note: 'Compare the log with Edda’s signal book.',
        objectives: [
          talk(
            'aurelle-keeper',
            'Show Edda the ship’s log',
            'Three short flashes. The harbour has used two for forty years. They saw a lamp in the lower chamber, shuttered by hand. The men on that boat did everything right. Bring this to Marlo. If cargo passed beneath the city, he heard the oars.',
          ),
        ],
      },
    ],
    'The log proves the false signal was deliberate. Edda marks the safe channel on your chart.',
    280,
    750,
  ),
  q(
    'aurelle-favour',
    'A Favour Below',
    'marlo',
    'The Quiet Hands know the route used to move the counterfeit lamp oil.',
    'You can stop staring at that log. There’s an old customs vault south of the bridge. Renn’s runners use its lower landing. Sallow can give you the ledger outright, for a price. Or you can get into the vault and see what the runners left behind.',
    ['aurelle-wreck'],
    [
      {
        note: 'Choose how to obtain the Quiet Landing ledger.',
        objectives: [
          {
            type: 'choose',
            npc: 'marlo',
            key: 'route',
            text: 'Choose an approach',
            prompt:
              'The archive stairs, or a bargain with Sallow? Both roads reach the same water.',
            options: [
              {
                id: 'vault',
                label: 'I’ll search the old customs vault.',
                say: 'Northern door. Listen before you go down. The hired blades answer to Renn.',
              },
              {
                id: 'hands',
                label: 'Arrange a bargain with the Quiet Hands.',
                say: 'The red-hand trapdoor beside the Lantern. Sallow will hear you. Whether you like her terms is your affair.',
              },
            ],
          },
        ],
      },
      {
        note: 'Find the ledger in the old vault, or secure Sallow’s help in the den.',
        hook: 'aurelle:den',
        anyOrder: true,
        objectives: [
          {
            ...signal(
              'pa-vault-ledger',
              'Recover the ledger from the old customs vault',
              'oldCustoms',
            ),
            group: 'ledger',
            flag: 'vault',
          },
          {
            ...signal(
              'pa-hands-ledger',
              'Settle the ledger bargain with the Quiet Hands',
              'thievesDoor',
            ),
            group: 'ledger',
            flag: 'hands',
          },
        ],
      },
      {
        note: 'Bring the ledger to Mira.',
        objectives: [
          talk(
            'mira',
            'Show Mira the Quiet Landing ledger',
            'Renn sold the recovered cargo before the ships were even declared missing. There are people named here, not just crates. We need witnesses who will stand beside those names.',
          ),
        ],
      },
    ],
    'The ledger ties Renn Maritime to the false lights and the missing cargo.',
    340,
    900,
  ),
  q(
    'aurelle-witnesses',
    'The Harbour’s Witnesses',
    'mira',
    'Protect the people willing to testify before Renn can silence them.',
    'Nell will speak for the crews. Edda will swear to the signals. Tallow can preserve the books. Tell them what we have, then choose who should hold the evidence. The Academy can keep the peace, the Hands can move unseen, or the Exchange can make a scandal too public to bury.',
    ['aurelle-favour'],
    [
      {
        note: 'Secure the testimony of the fish market, lighthouse keeper and Harbourmaster.',
        anyOrder: true,
        objectives: [
          talk(
            'nell',
            'Ask Nell to testify',
            'Every name. I’ll say every name, and they can look me in the eye while I do it.',
          ),
          talk(
            'aurelle-keeper',
            'Ask Edda to testify',
            'I kept the shutters. The tool marks match the lamp below. I will bring them.',
          ),
          talk(
            'tallow',
            'Secure the customs books',
            'I have made certified copies. One for the Crown, one for you. My signature belongs on the first page, including the part I wish I had not written.',
          ),
        ],
      },
      {
        note: 'Choose who protects the witnesses and holds the evidence.',
        objectives: [
          {
            type: 'choose',
            npc: 'mira',
            key: 'allies',
            text: 'Choose your allies',
            prompt: 'Who carries this with us?',
            options: [
              {
                id: 'academy',
                label: 'Ask the Academy to guard the witnesses.',
                say: 'Marrow will put cadets at the approaches. You’ll have fewer hired blades to deal with.',
              },
              {
                id: 'hands',
                label: 'Let the Quiet Hands move the witnesses.',
                say: 'They know a maintenance door beneath the light. Sallow will leave you its key.',
              },
              {
                id: 'public',
                label: 'Read the evidence at the Exchange.',
                say: 'Then every captain in the harbour will be watching the light. They’ll help bring the stricken ship in.',
              },
            ],
          },
        ],
      },
    ],
    'The witnesses are safe. Renn knows the city is watching. One more ship is due tonight.',
    420,
    1100,
  ),
  q(
    'aurelle-false-lights',
    'The Night of False Lights',
    'aurelle-keeper',
    'Renn’s last ship is approaching a false signal. Restore the lighthouse and bring the crew home.',
    'A merchantman is due after dusk. Someone has barred the keeper’s stair and lit the old lamp. Renn means to take one last ship, then disappear. Tell me when you’re ready; we will wait here together until the light is needed.',
    ['aurelle-witnesses'],
    [
      {
        note: 'Tell Edda you are ready to begin the night operation.',
        objectives: [
          talk(
            'aurelle-keeper',
            'Begin the operation at dusk',
            'Then take the breakwater. I will hold the harbour bell. Bring that ship home.',
          ),
        ],
      },
      {
        note: 'Defeat Renn’s signal captain at the lighthouse. Your allies change the approach.',
        hook: 'aurelle:finale',
        objectives: [
          signal(
            'pa-captain',
            'Defeat Captain Serrat at the Aurelle Light',
            'lighthouse',
          ),
        ],
      },
      {
        note: 'Restore the true signal and sound the harbour bell to guide the ship home.',
        objectives: [
          signal('pa-lens', 'Restore the lighthouse signal', 'lens'),
          signal(
            'pa-rescue',
            'Sound the rescue signal at the Harbour Bell',
            'bell',
          ),
        ],
      },
      {
        note: 'Return to Mira and decide the future of the confiscated warehouse.',
        objectives: [
          {
            type: 'choose',
            npc: 'mira',
            key: 'warehouse',
            text: 'Settle the harbour’s claim',
            prompt:
              'Renn’s cargo will cover the crews’ losses. What should become of the empty warehouse?',
            options: [
              {
                id: 'families',
                label: 'Make it a storehouse for the fishing families.',
                say: 'Dry nets, winter grain and an honest tally. Maren has already found a key.',
              },
              {
                id: 'school',
                label: 'Give it to the harbour’s sailing school.',
                say: 'Mira looks at the empty floor as though she can already see the boats. “No more children learning the hard way.”',
              },
            ],
          },
        ],
      },
    ],
    'The true light burns over Aurelle. The rescued crew has come home, and the harbour remembers who brought them back.',
    1000,
    2400,
  ),
];

export const AURELLE_SIDE_QUESTS: QuestDef[] = [
  q(
    'aurelle-supper',
    'A Bowl for Every Boat',
    'aurelle-cook',
    'Keep the communal kitchen running while the fishing boats are missing.',
    'We feed the families before we sell the catch. Nell has fish; I need grain and someone who can watch a pot. Bring three wheat, then help me cook a supper at the kitchen table.',
    [],
    [
      {
        note: 'Bring Maren grain, then prepare supper at the kitchen.',
        objectives: [
          {
            type: 'deliver',
            npc: 'aurelle-cook',
            item: 'wheat',
            count: 3,
            text: 'Bring Maren three wheat',
            say: 'Enough for bread and a thick pot. Come to the table; I’ll show you the rest.',
          },
          signal('pa-supper', 'Prepare the communal supper', 'kitchen'),
        ],
      },
      {
        note: 'Share the finished meal with Maren.',
        objectives: [
          talk(
            'aurelle-cook',
            'Serve supper',
            'Sit. People do better work after they’ve been fed, including heroes. There will always be a bowl here for you.',
          ),
        ],
      },
    ],
    'The kitchen keeps a place for you. A shared supper restores your strength once each day.',
    150,
    380,
  ),
  q(
    'aurelle-frame',
    'The Crooked Frame',
    'aurelle-apprentice',
    'Find what is twisting the new merchantman’s hull before launch.',
    'The keel reads true but the ribs lean by a thumb. Barrow says the oak will settle. I think the lower chock split. Look beneath the scaffold, then test the starboard fastening. I need proof before he launches her.',
    [],
    [
      {
        note: 'Inspect the dry dock supports and test the ship’s fastening.',
        objectives: [
          signal('pa-frame', 'Inspect the split keel chock', 'drydock'),
          signal('pa-fastening', 'Test the starboard fastening', 'apprentice'),
        ],
      },
      {
        note: 'Tell Tessa what you found.',
        objectives: [
          talk(
            'aurelle-apprentice',
            'Show Tessa the damaged chock',
            'There. Not my chalk line, not my eyes. I’ll replace it and have Barrow watch the load test. You saved more than my apprenticeship.',
          ),
        ],
      },
    ],
    'The launch is postponed for repairs. Tessa’s workbench becomes available to you.',
    210,
    600,
  ),
  q(
    'aurelle-old-crew',
    'The Anchor Holds',
    'bess',
    'An old crewmate’s effects have returned without their owner.',
    'A sea chest came off the last merchantman. My old navigator’s name is on it. Nobody remembers the man. Read the arrival slate at customs, then ask Nell who came ashore with the night catch. I’m too old to stand on a quay pretending I don’t care.',
    [],
    [
      {
        note: 'Follow the chest’s arrival record to the fish market.',
        objectives: [
          signal('pa-arrival-slate', 'Read the arrival slate', 'customs'),
          talk(
            'nell',
            'Ask Nell about Bess’s navigator',
            'Grey beard, blue coat, bad leg? Came in on a fishing boat after his ship sold. Wouldn’t go to the Anchor owing Bess twelve years of explanations. He’s sleeping under the old sail loft.',
          ),
        ],
      },
      {
        note: 'Find the navigator’s camp, then speak to Bess.',
        objectives: [
          signal(
            'pa-navigator',
            'Find the navigator beneath the sail loft',
            'sailLoft',
          ),
          talk(
            'bess',
            'Tell Bess he has come home',
            'That fool. That absolute fool. Put another bowl out. And do not tell him I asked first.',
          ),
        ],
      },
    ],
    'A place is laid at the Anchor for Bess’s old navigator. Her room rates are kinder to you now.',
    180,
    450,
  ),
  q(
    'aurelle-aldric',
    'A Better Debt',
    'aldric-aurelle',
    'Aldric wants to repay what his mother could pay away.',
    'Mother paid someone, or someone promised Sallow something, and I walked home. The people down there do not get to walk away. Let me pay one honest debt. Take me a list from Maren; I’ll do the carrying.',
    ['quiet-hands'],
    [
      {
        note: 'Ask Maren what Netters’ Reach needs.',
        objectives: [
          talk(
            'aurelle-cook',
            'Ask Maren for a job for Aldric',
            'The nets beside the kitchen need mending and the pantry needs counting. Tell him to turn up before breakfast. I have no use for an apology that arrives after lunch.',
          ),
        ],
      },
      {
        note: 'Show Aldric the work at the net racks.',
        objectives: [
          signal(
            'pa-net-work',
            'Prepare the torn nets beside the kitchen',
            'kitchen',
          ),
          talk(
            'aldric-aurelle',
            'Give Aldric an honest job',
            'Tomorrow at dawn. Without my coat with the crest on it. I can carry a basket, at least.',
          ),
        ],
      },
    ],
    'Aldric now helps in Netters’ Reach each morning. Corvina comes down to see him sometimes.',
    240,
    650,
  ),
  q(
    'aurelle-bruni',
    'Proof Against the North',
    'bruni',
    'Test the expedition’s gear before the Iron Kettle sails.',
    'Mountains do not forgive a lantern that goes out or a rope that slips. Test the lantern at the foundry, load the expedition chests, and check the fastening at the dry dock. Then I can put my name against the lot.',
    [],
    [
      {
        note: 'Complete Bruni’s three practical checks.',
        anyOrder: true,
        objectives: [
          signal(
            'pa-lantern-test',
            'Test the expedition lantern at the foundry',
            'forge',
          ),
          signal(
            'pa-expedition-load',
            'Secure the Iron Kettle’s supply chests',
            'berth',
          ),
          signal(
            'pa-expedition-rope',
            'Test the expedition’s rope at the dry dock',
            'drydock',
          ),
        ],
      },
      {
        note: 'Report the results to Bruni.',
        objectives: [
          talk(
            'bruni',
            'Report the equipment tests',
            'Good. Someone who tests a thing before trusting their life to it. Come north with us when you’re ready. I’ll keep your name on the list.',
          ),
        ],
      },
    ],
    'The expedition’s chests are packed and checked. Bruni gives you a properly tested lantern.',
    260,
    650,
  ),
  q(
    'aurelle-favour-due',
    'The Favour Comes Due',
    'marlo',
    'The Quiet Hands want their promised favour repaid.',
    'Sallow remembers who owes her. A customs copy in the old vault names one of her runners. She wants it gone. Read it first if you must, but decide whether to hand it over or put it on Tallow’s desk.',
    ['quiet-hands'],
    [
      {
        note: 'Recover the runner’s customs copy from the vault.',
        objectives: [
          signal(
            'pa-debt-copy',
            'Read the runner’s customs copy',
            'oldCustoms',
          ),
        ],
      },
      {
        note: 'Choose how to settle the obligation.',
        objectives: [
          {
            type: 'choose',
            npc: 'marlo',
            key: 'debt',
            text: 'Settle the promised favour',
            prompt:
              'The copy names a runner carrying medicine without paying Renn’s private levy. The Crown’s duty was already paid.',
            options: [
              {
                id: 'hands',
                label: 'Give Sallow the copy. The favour is settled.',
                say: 'No knives, no bodies. Just paper in the right hands. Sallow says you are square.',
              },
              {
                id: 'watch',
                label: 'Give Tallow the evidence against the levy.',
                say: 'Sallow will call you difficult. She may even mean it kindly. Tallow can clear the runner in daylight.',
              },
            ],
          },
        ],
      },
    ],
    'The obligation is settled, and the person who carried it remembers your decision.',
    220,
    600,
  ),
];
