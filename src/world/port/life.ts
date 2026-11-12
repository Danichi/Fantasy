import * as THREE from 'three';
import type { PortAurelle } from '../portAurelle';
import { AURELLE, PORT_DISTRICTS, type P2 } from '../portCity';
import type { Player } from '../../player/player';
import type { QuestLog } from '../../quests/questLog';
import type { Interactable } from '../../dungeon/instance';
import type { Interior } from '../interior';
import type { Door } from '../doors';
import type { DialogueOption } from '../../ui/dialogue';
import type { NpcManager } from '../../npc/npcManager';
import { Bandit, type Bolts } from '../../enemies/bandit';
import { heightAt } from '../terrainHeight';
import { AURELLE_QUESTS, AURELLE_SIDE_QUESTS } from './quests';
import { PORT_SECRETS } from './discoveries';
import { AcademyExercises } from './exercises';
import { events } from '../../core/events';
import { ITEMS } from '../../items/itemDefs';
import { FESTIVALS, isOpen } from '../calendar';
import { sfx } from '../../audio/sfx';
import type { DuelSpec } from '../../combat/duel';
import type { StationKind } from '../../crafting/recipes';

type Show = (text: string, opts: DialogueOption[]) => void;
type Stored = { id: string; qty: number; q?: number; rune?: string };
interface Deps {
  scene: THREE.Scene;
  port: PortAurelle;
  player: Player;
  quests: QuestLog;
  bolts: Bolts;
  npcs: NpcManager;
  flags: Record<string, boolean | number | string>;
  time: { day: number; hour: number; skipTo(h: number): void };
  toast(s: string): void;
  card(a: string, b: string): void;
  read(title: string, text: string, opts?: DialogueOption[]): void;
  close(): void;
  save(): void;
  give(id: string, n: number): void;
  count(id: string): number;
  take(id: string, n: number): void;
  trade(show: Show, back: () => void): DialogueOption[];
  pennant(): void;
  enter(door: Door): void;
  craft(kind: StationKind, name: string): void;
  duelling(): boolean;
  bout(spec: Omit<DuelSpec, 'ring' | 'radius'>, win: () => void): void;
}
export class PortLife {
  readonly interactables: Interactable[] = [];
  readonly services = new Map<
    string,
    (show: Show, back: () => void) => DialogueOption[]
  >();
  readonly drills: AcademyExercises;
  private enemies: Bandit[] = [];
  private interiorEnemies: Bandit[] = [];
  private captain: Bandit | null = null;
  private eventCd = 0;
  private district = '';
  private off: (() => void)[] = [];
  private visible = true;
  private carried: THREE.Mesh[] = [];
  private bellHour = -1;
  constructor(private d: Deps) {
    const { quests: q, flags: f } = d;
    q.add(...AURELLE_QUESTS, ...AURELLE_SIDE_QUESTS);
    q.defs.get('aurelle-favour-due')!.offerIf = () => !!f.quietFavour;
    q.hooks.set('aurelle:den', () => {
      f.denKnown = true;
    });
    q.hooks.set('aurelle:finale', () => {
      if (!f['pa:nightStarted']) {
        f['pa:nightStarted'] = true;
        d.time.skipTo(19);
      }
    });
    this.drills = new AcademyExercises(
      d.scene,
      d.bolts,
      d.player,
      f,
      d.toast,
      d.save,
    );
    for (const [npc, school] of [
      ['lyra', 'gale'],
      ['hadrik', 'boundary'],
      ['sable', 'cross'],
    ] as const)
      this.services.set(npc, (show, back) =>
        this.drills.options(school, show, back, () => !d.duelling(), d.close),
      );
    this.services.set('bess', (show, back) => [
      {
        label: f['pa:room'] ? 'About my room.' : 'Rent a room at the Anchor.',
        run: () => this.roomMenu(show, back),
      },
    ]);
    this.services.set('aurelle-apprentice', () =>
      q.isDone('aurelle-frame')
        ? [
            {
              label: 'Use Tessa’s workbench.',
              run: () => {
                d.close();
                d.craft('workbench', 'Tessa’s workbench');
              },
            },
          ]
        : [],
    );
    this.services.set('aurelle-factor', () => []);
    this.services.set('shipwright', () =>
      f['pa:pennant']
        ? [
            {
              label: 'Fly Aurelle’s rescuer pennant · free.',
              run: () => {
                d.pennant();
                d.save();
                d.toast('Barrow raises Aurelle’s gold pennant on your ships.');
              },
            },
          ]
        : [],
    );
    this.services.set('mira', () =>
      q.isDone('aurelle-false-lights') &&
      q.flag('aurelle-false-lights', 'warehouse') === 'school'
        ? [
            {
              label: 'Use the harbour school’s training supplies.',
              run: () => {
                d.player.stamina = d.player.maxStamina;
                d.toast(
                  'Mira checks your rig and hands over a chart of the practice course.',
                );
              },
            },
          ]
        : [],
    );
    this.services.set('aurelle-cook', () => [
      {
        label: 'Use the communal kitchen.',
        run: () => {
          d.close();
          d.craft('kitchen', 'Netters’ communal kitchen');
        },
      },
      ...(q.isDone('aurelle-supper')
        ? [{ label: 'Share a bowl of supper.', run: () => this.supper() }]
        : []),
    ]);
    this.addClues();
    this.addDiscoveries();
    this.addActivities();
    for (let i = 0; i < 5; i++) {
      const crate = new THREE.Mesh(
        new THREE.BoxGeometry(0.65, 0.5, 0.55),
        d.port.kit.m.planks,
      );
      crate.visible = false;
      d.port.kit.root.add(crate);
      this.carried.push(crate);
    }

    this.off.push(
      events.on('questChanged', ({ id, status }) => {
        if (status !== 'done') return;
        if (id === 'aurelle-bruni' && !f['pa:lanternGift']) {
          f['pa:lanternGift'] = true;
          d.give('minersLantern', 1);
          d.save();
        }
        if (id === 'aurelle-favour-due') {
          f.quietFavour = false;
        }
        if (id === 'aurelle-false-lights') {
          f['pa:rescued'] = true;
          f['pa:pennant'] = true;
          events.emit('deed', {
            id: 'aurelle-light',
            renown: 8,
            label: 'Brought the harbour home',
          });
        }
      }),
    );
    this.off.push(
      events.on('playerDied', () => {
        this.clearEnemies();
        this.drills.stop();
      }),
    );
  }
  private at(a: P2, dy = 0) {
    return new THREE.Vector3(a[0], heightAt(a[0], a[1]) + dy, a[1]);
  }
  private near(a: P2, r = 7) {
    return (
      Math.hypot(this.d.player.pos.x - a[0], this.d.player.pos.z - a[1]) < r
    );
  }
  private hotspot(
    at: P2,
    label: string,
    action: () => void,
    enabled = () => true,
    radius = 2.1,
  ) {
    const obj: Interactable = {
      pos: this.at(at),
      radius,
      label: () => (enabled() ? label : ''),
      enabled,
      action: () => {
        if (enabled()) action();
      },
    };
    this.interactables.push(obj);
    return obj;
  }
  private read(title: string, text: string) {
    this.d.read(title, text);
  }
  private clue(
    at: P2,
    label: string,
    id: string,
    text: string,
    after?: () => void,
  ) {
    return this.hotspot(at, label, () => {
      if (this.d.quests.wants(id)) {
        after?.();
        this.d.quests.signal(id);
        this.d.save();
      }
      this.read(label, text);
    });
  }
  private addClues() {
    const { quests: q } = this.d;
    this.clue(
      AURELLE.regatta,
      'Inspect the Brightwater’s empty berth',
      'pa-berth',
      'A clean mooring rope, an untouched bait basket and three chalk marks: the Brightwater has been expected for three mornings.',
    );
    this.clue(
      [2890, 125],
      'Read the rear warehouse tally',
      'pa-records-covert',
      'Renn’s original tally lists six lamp-oil barrels. The customs copy says three. Both carry the same inspector’s mark.',
    );
    this.clue(
      AURELLE.hoist,
      'Inspect the double-stamped barrels',
      'pa-cargo',
      'Beneath the fresh Renn Maritime stamp is the mark of a fishing cooperative. These barrels were recovered from a ship that has not yet been declared lost.',
    );
    const wreck = this.clue(
      AURELLE.wreck,
      'Recover the wreck’s oilskin log',
      'pa-wreck',
      '“Three short flashes from the inner light. Channel clear. Turning in.” The final line trails off into a long stroke of ink.',
    );
    wreck.pos.y = 0.6;
    this.clue(
      AURELLE.drydock,
      'Inspect the split keel chock',
      'pa-frame',
      'The oak support is cracked beneath its tar coating. A full load would pull the frame out of line. Tessa’s chalk marks were right.',
    );
    this.clue(
      AURELLE.apprentice,
      'Test the starboard fastening',
      'pa-fastening',
      'You take the strain slowly. The fastening holds, but the split support shifts by a thumb. The failure is beneath the hull.',
    );
    this.clue(
      AURELLE.sailLoft,
      'Look beneath the sail loft',
      'pa-navigator',
      'A worn navigator’s coat hangs beside a dry bedroll. Its owner accepts Bess’s message with a very long silence.',
    );
    this.clue(
      [2890, 320],
      'Help mend the kitchen’s nets',
      'pa-net-work',
      'You lay out the torn mesh and show Aldric how to begin. He listens carefully. For once, he asks what he can do instead of what it will cost.',
    );
    this.clue(
      AURELLE.forge,
      'Test the expedition lantern',
      'pa-lantern-test',
      'A full wick, sound glass, a vent that stays clear when tilted. Bruni’s lantern burns through every test.',
    );
    this.clue(
      AURELLE.berth,
      'Secure the expedition supplies',
      'pa-expedition-load',
      'You lash the supply chests against the marked stanchions. Nothing shifts when the gangway takes a load.',
    );
    this.clue(
      [2914, 42],
      'Test the expedition rope',
      'pa-expedition-rope',
      'The test weight lifts cleanly. You inspect the fibres before bringing it down: no fraying, no hidden splice.',
    );
    this.hotspot(
      AURELLE.kitchen,
      'Prepare the communal supper',
      () => {
        q.signal('pa-supper');
        this.d.player.hp = this.d.player.maxHp;
        this.read(
          'A Bowl for Every Boat',
          'Maren shows you when to add the grain and when to lower the flame. By the time the bowls are laid, there is enough for the whole court.',
        );
        this.d.save();
      },
      () => q.wants('pa-supper'),
    );
    this.hotspot(
      [2960, -13],
      'Restore the Aurelle Light',
      () => {
        q.signal('pa-lens');
        this.d.flags['pa:lens'] = true;
        sfx.kindle(0.15);
        this.read(
          'The True Light',
          'The damaged shutter drops away. Two steady flashes sweep the approaches. Far out in the dark, a ship answers.',
        );
        this.d.save();
      },
      () => q.wants('pa-lens'),
    );
    this.hotspot(
      AURELLE.bell,
      'Sound the rescue signal',
      () => {
        q.signal('pa-rescue');
        this.d.flags['pa:crewHome'] = true;
        sfx.harbourBell(0.25);
        this.read(
          'Homeward',
          'The harbour bell answers the lighthouse. Boats push out from Netters’ Reach; the merchantman follows their lamps between the marks and into safe water.',
        );
        this.d.save();
      },
      () => q.wants('pa-rescue'),
    );
    this.hotspot(
      [2938, 190],
      'Read the harbour memorial',
      () =>
        this.read(
          'For Those Still Seeking Home',
          'The names of the rescued stand beside the names of the missing. Beneath them: “The light is a promise. We keep it together.”',
        ),
      () => q.isDone('aurelle-false-lights'),
    );
    this.hotspot(
      [2956, -12],
      'Use the Quiet Hands’ maintenance stair',
      () => {
        this.d.player.teleport(this.at([2964, -20], 0.3));
        this.d.toast(
          'Sallow’s key opens the service passage behind the signal captain.',
        );
      },
      () =>
        q.wants('pa-captain') &&
        q.flag('aurelle-witnesses', 'allies') === 'hands',
    );
  }
  private addDiscoveries() {
    for (const s of PORT_SECRETS) {
      const key = 'pa:secret:' + s.id;
      // A modest brass marker makes authored details discoverable without map clutter.
      this.d.port.kit.mesh(
        new THREE.IcosahedronGeometry(0.11, 0),
        this.d.port.kit.brass,
        s.at[0],
        heightAt(...s.at) + 0.7,
        s.at[1],
      );
      this.hotspot(
        s.at,
        `Discover: ${s.name}`,
        () => {
          if (!this.d.flags[key]) {
            this.d.flags[key] = true;
            this.d.player.prog.addXp(80);
            this.d.player.prog.addGold(s.gold);
            this.d.toast(`Discovery · ${s.name} · +80 XP, +${s.gold}g`);
            this.d.save();
          }
          this.read(s.name, s.text);
        },
        () => !this.d.flags[key],
      );
    }
    // These markers are added after the main architecture was merged.
    this.d.port.kit.finish();
  }
  private addActivities() {
    this.hotspot(AURELLE.tradeBoard, 'Read the harbour trade board', () => {
      const show: Show = (text, opts) =>
        this.d.read('The Harbour Trade Board', text, opts);
      const back = () =>
        show(
          'The public tally lists cargo, contracts and destinations.',
          this.d.trade(show, back),
        );
      back();
    });
    this.hotspot(AURELLE.marketBoard, 'Read the city noticeboard', () =>
      this.read(
        'Aurelle Today',
        'Academy practicals: Lyra, Hadrik and Sable teach in the upper court.\n\nFish auction: Netters’ Reach, dawn to noon.\nCargo hoist: work available at the Great Quays by day.\nSparring exhibition: Academy ring, afternoons.\nEvening music: the Salty Anchor after six.\n\nHarbour Week brings visiting stalls, races and special catches. Ask Mira about the Regatta.',
      ),
    );
    this.hotspot(
      AURELLE.fishAuction,
      'Join the morning fish auction',
      () => {
        const day = this.d.time.day,
          key = 'pa:auctionDay';
        if (this.d.flags[key] === day)
          return this.d.toast('You have already bought today’s catch.');
        this.d.read(
          'The Morning Auction',
          'Nell raises a basket: three fine bream, landed at dawn. The bidding stands at 28 gold.',
          [
            {
              label: 'Bid 30 gold for the basket.',
              run: () => {
                if (this.d.flags[key] === day || !this.spend(30)) return;
                this.d.flags[key] = day;
                this.d.give('seaBream', 3);
                this.d.close();
                this.d.toast(
                  'Nell brings down the little wooden hammer. Sold!',
                );
                this.d.save();
              },
            },
            {
              label: 'Watch the bidding.',
              run: () =>
                this.read(
                  'The Morning Auction',
                  'A cook, a ship’s steward and a fisher’s daughter all know exactly what the basket is worth. Nell knows what each of them can afford.',
                ),
            },
          ],
        );
      },
      () => this.d.time.hour >= 5 && this.d.time.hour < 12,
    );
    this.hotspot(
      AURELLE.hoist,
      'Help the dockhands repair the hoist',
      () => {
        const key = 'pa:hoistDay';
        if (this.d.flags[key] === this.d.time.day)
          return this.d.toast(
            'The hoist is working. The next shift has things in hand.',
          );
        this.d.read(
          'A Broken Hoist',
          'A bent pin has stopped the cargo gang. Fit a replacement from two iron ore, or help shift the load by hand.',
          [
            {
              label: 'Fit a replacement · 2 iron ore · earn 65g.',
              run: () => {
                if (this.d.flags[key] === this.d.time.day) return;
                if (this.d.count('ironOre') < 2)
                  return this.d.toast('You need two iron ore.');
                this.d.take('ironOre', 2);
                this.workDone(
                  key,
                  65,
                  'The pulley turns freely. The dock gang pays you from the shift purse.',
                );
              },
            },
            {
              label: 'Help move the cargo by hand · earn 30g.',
              run: () => {
                if (this.d.flags[key] === this.d.time.day) return;
                this.d.player.stamina = Math.max(0, this.d.player.stamina - 35);
                this.workDone(
                  key,
                  30,
                  'Together you take the strain off the jammed wheel. The cargo is safely landed.',
                );
              },
            },
          ],
        );
      },
      () => this.d.time.hour >= 8 && this.d.time.hour < 18,
    );
    this.hotspot(
      [2822, 96],
      'Enter the afternoon cadet exhibition',
      () => {
        if (this.d.duelling() || this.drills.active)
          return this.d.toast('Finish your current bout first.');
        if (this.d.flags['pa:exhibitionDay'] === this.d.time.day)
          return this.d.toast(
            'You have fought today’s exhibition. Come back tomorrow.',
          );
        this.d.flags['pa:exhibitionDay'] = this.d.time.day;
        this.d.close();
        this.d.bout(
          {
            name: 'Senior Cadet Wren Tidewell',
            look: {
              body: 'female',
              outfit: 'ranger',
              hair: 'buns',
              cloth: 0x3a627e,
              height: 1.75,
            },
            hp: 2600,
            damage: 76,
            pace: 0.88,
            level: 17,
            style: 'gale',
          },
          () => {
            this.d.player.prog.addGold(110);
            this.d.toast('The spectators applaud. +110 gold.');
            this.d.save();
          },
        );
        this.d.save();
      },
      () => this.d.time.hour >= 12 && this.d.time.hour < 18,
    );
    this.hotspot(
      [2776, 264],
      'Listen to the Anchor’s evening music',
      () => {
        sfx.chime(0.1);
        this.read(
          'The Anchor Holds',
          'A fiddler starts a tune the whole room knows. Bess joins the chorus without looking up from her work. A sailor at the last table finally sings the missing verse.',
        );
      },
      () => this.d.time.hour >= 18 || this.d.time.hour < 2,
    );
    this.hotspot(
      [2888, 204],
      'Watch the customs inspection',
      () =>
        this.read(
          'An Honest Tally',
          'A clerk reads each crate aloud while a dockworker checks its mark. This time, the public copy and the cargo agree.',
        ),
      () => this.d.time.hour >= 9 && this.d.time.hour < 17,
    );
    this.hotspot(
      AURELLE.room,
      'Go up to your room',
      () => this.d.enter(this.roomDoor()),
      () => !!this.d.flags['pa:room'],
    );
  }
  private spend(n: number) {
    if (this.d.player.prog.gold < n) {
      this.d.toast(`You need ${n} gold.`);
      return false;
    }
    this.d.player.prog.addGold(-n);
    return true;
  }
  private workDone(key: string, gold: number, text: string) {
    this.d.flags[key] = this.d.time.day;
    this.d.player.prog.addGold(gold);
    this.d.close();
    this.d.toast(`${text} +${gold}g.`);
    this.d.save();
  }
  private roomDoor(): Door {
    return {
      pos: this.at([2784, 259.5]),
      yaw: 0,
      spec: { w: 9, d: 10, floors: 1, roof: 'slate', seed: 9241 },
      kind: 'home',
      name: 'Your Room at the Salty Anchor',
    };
  }
  private roomMenu(show: Show, back: () => void) {
    const f = this.d.flags,
      price = this.d.quests.isDone('aurelle-old-crew') ? 75 : 120;
    show(
      f['pa:room']
        ? 'Your key is still on its blue cord. Bess has kept the room ready.'
        : `A quiet room, a chest and a chart table. ${price} gold secures the room for your visits to Aurelle.`,
      [
        ...(!f['pa:room']
          ? [
              {
                label: `Take the room · ${price}g.`,
                run: () => {
                  if (f['pa:room'] || !this.spend(price)) return;
                  f['pa:room'] = true;
                  this.d.save();
                  show(
                    'Bess puts a key in your hand. “Upstairs. Mind the third board.”',
                    [
                      {
                        label: 'Go to my room.',
                        run: () => {
                          this.d.close();
                          this.d.enter(this.roomDoor());
                        },
                      },
                    ],
                  );
                },
              },
            ]
          : [
              {
                label: 'Go to my room.',
                run: () => {
                  this.d.close();
                  this.d.enter(this.roomDoor());
                },
              },
            ]),
        { label: 'Back.', run: back },
      ],
    );
  }
  private supper() {
    const key = 'pa:supperDay';
    if (this.d.flags[key] === this.d.time.day)
      return this.d.toast('You have eaten with the kitchen today.');
    this.d.flags[key] = this.d.time.day;
    this.rest();
    this.d.toast('A bowl of hot supper restores you.');
    this.d.close();
    this.d.save();
  }
  private rest() {
    const p = this.d.player;
    p.hp = p.maxHp;
    p.mana = p.maxMana;
    p.stamina = p.maxStamina;
    p.restoreArmour();
  }
  private stash(): Stored[] {
    try {
      const x = JSON.parse(String(this.d.flags['pa:stash'] ?? '[]'));
      return Array.isArray(x)
        ? x.filter((i) => ITEMS[i.id] && Number.isInteger(i.qty) && i.qty > 0)
        : [];
    } catch {
      return [];
    }
  }
  private storage(mode: 'deposit' | 'withdraw' = 'deposit', page = 0) {
    const eq = this.d.player.equip,
      stored = this.stash();
    const eligible = eq.items.filter(
      (i) =>
        !Object.values(eq.equipped).includes(i.uid) &&
        !eq.quick.includes(i.uid) &&
        !eq.moves.includes(i.uid) &&
        eq.activeSpell !== i.uid,
    );
    const rows = mode === 'deposit' ? eligible : stored;
    const opts: DialogueOption[] = rows
      .slice(page * 8, page * 8 + 8)
      .map((it, index) => ({
        label:
          mode === 'deposit'
            ? `Store ${eligible[page * 8 + index].def.name} ×${it.qty}`
            : `Take ${ITEMS[(it as Stored).id].name} ×${it.qty}`,
        run: () => {
          if (mode === 'deposit') {
            if (stored.length >= 40)
              return this.d.toast('The chest has forty stacks already.');
            const item = eligible[page * 8 + index];
            if (!eq.items.includes(item)) return;
            stored.push({
              id: item.def.id,
              qty: item.qty,
              q: item.q,
              rune: item.rune,
            });
            eq.items.splice(eq.items.indexOf(item), 1);
          } else {
            const item = stored.splice(page * 8 + index, 1)[0];
            if (!item) return;
            eq.add(item.id, item.qty, item.q, item.rune);
          }
          this.d.flags['pa:stash'] = JSON.stringify(stored);
          events.emit('equipmentChanged', {});
          this.d.save();
          this.storage(mode, page);
        },
      }));
    if (page > 0)
      opts.push({
        label: 'Previous page.',
        run: () => this.storage(mode, page - 1),
      });
    if (rows.length > (page + 1) * 8)
      opts.push({
        label: 'Next page.',
        run: () => this.storage(mode, page + 1),
      });
    opts.push(
      {
        label: mode === 'deposit' ? 'Take something out.' : 'Store something.',
        run: () => this.storage(mode === 'deposit' ? 'withdraw' : 'deposit'),
      },
      { label: 'Close the chest.', run: this.d.close },
    );
    this.d.read(
      'Your Storage Chest',
      `${stored.length}/40 stacks. Equipped items and items on your bars stay with you.`,
      opts,
    );
  }
  /** Attach the same story to useful interior locations, including alternate undercity entrances. */
  interior(it: Interior, extras: Interactable[]) {
    const name = it.door.name ?? '',
      q = this.d.quests;
    const add = (
      pos: THREE.Vector3,
      label: string,
      fn: () => void,
      enabled = () => true,
    ) =>
      extras.push({
        pos,
        radius: 1.8,
        label: () => (enabled() ? label : ''),
        enabled,
        action: () => {
          if (enabled()) fn();
        },
      });
    const inspect = (
      x: number,
      z: number,
      label: string,
      id: string,
      text: string,
      enabled = () => true,
    ) =>
      add(
        it.at(x, z),
        label,
        () => {
          if (q.wants(id)) {
            q.signal(id);
            this.d.save();
          }
          this.read(label, text);
        },
        enabled,
      );
    if (it.kind === 'lighthouse' && it.spots.signal) {
      add(
        it.spots.signal.pos,
        'Restore the true signal',
        () => {
          q.signal('pa-lens');
          this.d.flags['pa:lens'] = true;
          this.d.save();
          this.read(
            'The True Light',
            'Two steady flashes sweep the approaches. The ship answers from the dark.',
          );
        },
        () => q.wants('pa-lens'),
      );
    }
    if (name.includes('Bonded Warehouse') && q.isDone('aurelle-false-lights')) {
      add(it.at(0, 0), 'Read the new warehouse charter', () =>
        this.read(
          'The Harbour’s Warehouse',
          q.flag('aurelle-false-lights', 'warehouse') === 'families'
            ? 'The confiscated warehouse now stores the fishing families’ winter supplies. Maren signs the tally in public.'
            : 'The warehouse now holds the harbour sailing school’s training boats, charts and rescue gear. Mira has pinned a course above the old desk.',
        ),
      );
    }
    if (name.includes('Customs House')) {
      inspect(
        -2,
        -it.D / 2 + 2,
        'Read the customs archive',
        'pa-records-official',
        'The public tally records three barrels. Renn’s receipt records six. Tallow’s seal is on the public copy.',
      );
      inspect(
        2,
        -it.D / 2 + 2,
        'Read the arrival slate',
        'pa-arrival-slate',
        'A sea chest, marked “Bess Harrow”, was landed by the Night Heron. Its navigator came ashore earlier with the fish boats.',
      );
    }
    if (it.kind === 'undercity') {
      const vault = it.spots.ledger?.pos ?? it.at(-4, -12),
        den = it.keeperSpot?.pos ?? it.at(0, 0);
      inspect(
        vault.x - it.group.position.x,
        vault.z - it.group.position.z,
        'Recover the Quiet Landing ledger',
        'pa-vault-ledger',
        'Renn Maritime purchased salvage before the ships were reported missing. The ledger records the runners, the lamps and the payments.',
        () => q.wants('pa-vault-ledger') && !!this.d.flags['pa:vaultCleared'],
      );
      add(
        den.clone().add(new THREE.Vector3(2, 0, 1)),
        'Bargain with Sallow for the ledger',
        () => {
          this.d.read(
            'Mother Sallow',
            '“Two hundred gold, or the favour you already owe me. I am precise about debts.”',
            [
              {
                label: 'Pay 200 gold.',
                run: () => {
                  if (!q.wants('pa-hands-ledger') || !this.spend(200)) return;
                  q.signal('pa-hands-ledger');
                  this.d.save();
                  this.d.close();
                },
              },
              ...(this.d.flags.quietFavour
                ? [
                    {
                      label: 'Settle the existing favour for the ledger.',
                      run: () => {
                        if (!q.wants('pa-hands-ledger')) return;
                        this.d.flags.quietFavour = false;
                        q.signal('pa-hands-ledger');
                        this.d.save();
                        this.d.close();
                      },
                    },
                  ]
                : []),
              { label: 'I’ll find another way.', run: this.d.close },
            ],
          );
        },
        () => q.wants('pa-hands-ledger'),
      );
      inspect(
        -6,
        2,
        'Read the runner’s customs copy',
        'pa-debt-copy',
        'The Crown’s duty was paid in full. Renn added a private “harbour levy” to medicine carried to Netters’ Reach.',
      );
      if (
        q.wants('pa-vault-ledger') &&
        (q.flag('aurelle-favour', 'route') === 'vault' ||
          name.includes('Vaults')) &&
        !this.d.flags['pa:vaultCleared']
      ) {
        for (const [x, z] of [
          [-4, -8],
          [4, -11],
        ]) {
          const b = this.makeFoe(
            it.at(x, z),
            'Renn’s Vault Guard',
            1600,
            65,
            16,
          );
          this.interiorEnemies.push(b);
        }
      }
    }
    if (name === 'Your Room at the Salty Anchor') {
      add(it.at(-2, -2), 'Open your storage chest', () => this.storage());
      add(it.at(2, -2), 'Rest until morning', () => {
        this.d.time.skipTo(7);
        this.rest();
        this.d.save();
        this.read(
          'A Room of Your Own',
          'Gulls, a distant bell, and clean morning light. Your equipment and strength are restored.',
        );
      });
      add(it.at(0, -3), 'Read your letters and chart table', () =>
        this.read('Letters from the Harbour', this.letters()),
      );
    }
  }
  private letters() {
    return [
      'Bess has pinned a chart of Aurelle above the desk. Three blue pins mark the Academy, the Exchange and your berth.',
      ...(this.d.quests.isDone('aurelle-old-crew')
        ? ['Bess: “He came back. We are arguing already. Thank you.”']
        : []),
      ...(this.d.quests.isDone('aurelle-frame')
        ? ['Tessa: “Load test passed. I put your mark beside mine.”']
        : []),
      ...(this.d.quests.isDone('aurelle-false-lights')
        ? [
            'Mira: “The crew came home. The light is burning. There will always be a berth for you here.”',
          ]
        : []),
      `Discovered places: ${PORT_SECRETS.filter((s) => this.d.flags['pa:secret:' + s.id]).length}/${PORT_SECRETS.length}.`,
    ].join('\n\n');
  }
  private makeFoe(
    at: THREE.Vector3,
    name: string,
    hp: number,
    damage: number,
    level: number,
  ) {
    const b = new Bandit('sword', at, this.d.scene, this.d.bolts, at.clone(), {
      body: 'male',
      outfit: 'ranger',
      hair: 'buzzed',
      cloth: 0x643d48,
      pauldron: true,
      height: 1.85,
    });
    b.name = b.label = name;
    b.hp = b.maxHp = hp;
    b.hitDamage = damage;
    b.level = level;
    b.alerted = true;
    b.postureMax = 260;
    b.poiseMax = 100;
    return b;
  }
  private clearEnemies() {
    for (const b of this.enemies) b.dispose();
    this.enemies = [];
    this.captain = null;
  }
  leaveInterior() {
    for (const b of this.interiorEnemies) b.dispose();
    this.interiorEnemies = [];
  }
  updateInterior(dt: number) {
    for (const b of this.interiorEnemies)
      if (!b.dead) b.update(dt, this.d.player);
    if (
      this.interiorEnemies.length &&
      this.interiorEnemies.every((b) => !b.alive)
    )
      this.d.flags['pa:vaultCleared'] = true;
  }
  update(dt: number, running: boolean) {
    const { quests: q, flags: f, port, time } = this.d;
    if (this.d.duelling() && this.drills.active) this.drills.stop();
    if (running) this.drills.update(dt);
    port.stateGroups.get('memorial')!.visible = q.isDone(
      'aurelle-false-lights',
    );
    port.stateGroups.get('room')!.visible = !!f['pa:room'];
    port.stateGroups.get('expedition')!.visible = q.isDone('aurelle-bruni');
    port.stateGroups.get('returnedCrew')!.visible = !!f['pa:crewHome'];
    const festival = FESTIVALS.find((x) => x.id === 'harbourWeek')!;
    port.stateGroups.get('festival')!.visible = isOpen(
      festival,
      time.day,
      time.hour,
    );
    const traffic = port.landmarks.get('traffic')!;
    const arrival =
      time.hour >= 6 && time.hour < 7
        ? time.hour - 6
        : time.hour >= 7 && time.hour < 17
          ? 1
          : time.hour >= 17 && time.hour < 18
            ? 18 - time.hour
            : 0;
    traffic.visible = arrival > 0;
    traffic.position.set(3210 - 205 * arrival, -0.5, 190 - 30 * arrival);
    traffic.rotation.y = time.hour < 17 ? -Math.PI / 2 : Math.PI / 2;
    const workers = this.d.npcs.npcs.filter(
      (n) =>
        n.rec.settlement === 'portAurelle' &&
        n.rec.job === 'dockworker' &&
        n.actor &&
        n.moving &&
        !n.hidden,
    );
    this.carried.forEach((crate, i) => {
      const worker = workers[i];
      crate.visible = !!worker;
      if (worker) {
        crate.position
          .copy(worker.pos)
          .add(
            new THREE.Vector3(
              Math.sin(worker.yaw) * 0.45,
              1,
              Math.cos(worker.yaw) * 0.45,
            ),
          );
        crate.rotation.y = worker.yaw;
      }
    });
    const h = Math.floor(time.hour);
    if (h !== this.bellHour) {
      if (
        this.bellHour >= 0 &&
        [6, 12, 18].includes(h) &&
        this.near(AURELLE.bell, 200)
      )
        sfx.harbourBell(0.12);
      this.bellHour = h;
    }
    const lens = port.landmarks.get('lens') as THREE.Mesh;
    const mat = lens.material as THREE.MeshStandardMaterial;
    const falseLight = q.isActive('aurelle-false-lights', 1);
    mat.emissive.set(falseLight ? '#bd4e32' : '#ffce76');
    mat.emissiveIntensity = falseLight ? 0.8 : 2;
    port.landmarks.get('beam')!.visible =
      !falseLight && (time.hour >= 18 || time.hour < 6);
    if (!running || !this.visible) return;
    this.eventCd -= dt;
    if (this.eventCd <= 0) {
      this.eventCd = 3;
      const district = PORT_DISTRICTS.filter((x) =>
        this.near(x.at, x.radius),
      ).sort(
        (a, b) =>
          Math.hypot(
            this.d.player.pos.x - a.at[0],
            this.d.player.pos.z - a.at[1],
          ) -
          Math.hypot(
            this.d.player.pos.x - b.at[0],
            this.d.player.pos.z - b.at[1],
          ),
      )[0];
      if (district && district.id !== this.district) {
        this.district = district.id;
        this.d.card(district.name, district.description);
      }
    }
    if (
      q.wants('pa-captain') &&
      this.near(AURELLE.lighthouse, 35) &&
      !this.captain &&
      !this.d.player.dead
    ) {
      const allied = q.flag('aurelle-witnesses', 'allies');
      this.captain = this.makeFoe(
        this.at([2958, -10], 0.1),
        'Captain Serrat · False Signal',
        4800,
        98,
        23,
      );
      this.captain.armour = 'plate';
      this.captain.pace = 0.83;
      this.enemies.push(this.captain);
      if (allied !== 'academy') {
        const guard = this.makeFoe(
          this.at([2947, -3], 0.1),
          'Renn’s Signal Guard',
          1900,
          72,
          18,
        );
        this.enemies.push(guard);
      }
      this.d.toast(
        allied === 'academy'
          ? 'Marrow’s cadets hold the harbour approach. Serrat is alone.'
          : allied === 'hands'
            ? 'The maintenance stair gives you a way behind Serrat.'
            : 'Bells answer across the harbour. The rescue boats are ready.',
      );
    }
    for (const b of this.enemies) if (!b.dead) b.update(dt, this.d.player);
    if (this.captain && !this.captain.alive && q.wants('pa-captain')) {
      q.signal('pa-captain');
      this.d.save();
    }
    if (
      this.enemies.length &&
      (!this.near(AURELLE.lighthouse, 90) ||
        !q.isActive('aurelle-false-lights'))
    )
      this.clearEnemies();
    // Persistent changes are reflected in the residents' real schedules.
    const aldric = this.d.npcs.find('aldric-aurelle');
    if (aldric && q.isDone('aurelle-aldric')) {
      const work = aldric.rec.schedule.find((s) => s.from === 6);
      if (work) work.place = 'kitchen';
    }
  }
  absent(id: string): boolean | undefined {
    if (id === 'aldric-aurelle') return !this.d.flags.aldricFreed;
    if (id === 'aurelle-factor')
      return (
        this.d.quests.isActive('aurelle-false-lights', 1) ||
        this.d.quests.isDone('aurelle-false-lights')
      );
    if (id === 'aurelle-navigator')
      return !this.d.quests.isDone('aurelle-old-crew');
    if (id.startsWith('aurelle-returned')) return !this.d.flags['pa:crewHome'];
  }
  setVisible(visible: boolean) {
    this.visible = visible;
    this.d.port.kit.root.visible = visible;
    if (!visible) {
      this.drills.stop();
      this.clearEnemies();
    }
  }
  reset() {
    this.drills.stop();
    this.clearEnemies();
    this.leaveInterior();
    this.district = '';
  }
  dispose() {
    this.reset();
    for (const off of this.off) off();
    this.drills.dispose();
  }
}
