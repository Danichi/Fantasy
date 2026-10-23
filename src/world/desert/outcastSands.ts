import * as THREE from 'three';
import { Bolts, type Bandit } from '../../enemies/bandit';
import { campFloor } from './desertLayout';
import { BONE_WELLS, WAYSTOP, DUNEWATCH, TARP_ROW, RUST_MARKET, EAST_GATE, type XZ } from './ghagrabbaPlaces';
import { Puppet, LOOKS } from './puppet';
import { Pack, need, banditAt } from './pack';
import { desertAudio } from './desertAudio';
import type { GhagrabbaLife } from './ghagrabbaLife';
import type { GhagrabbaDeps } from './ghagrabbaTypes';
import type { Interactable } from '../../dungeon/instance';
import type { Look } from '../../npc/charBuilder';
import type { ScheduleEntry } from '../../npc/npcManager';

// The world side of The Outcast Sands (quests/ghagrabbaMain.ts): Ishara at
// the Bone Wells and her sick children, the Waystop waterskin, the villages
// that rally to her, the Sun Guard's last stand at the east gate, and — if
// you choose the crown — Ishara with a knife in her hand at last.

const ISHARA_LOOK: Look = { body: 'female', outfit: 'peasant', hood: true, hair: 'long', hairColor: 0x2a1a10, skin: 0x7a4e32, cloth: 0x2a6a6a, linen: 0xa89878, bracers: true, height: 1.68 };
const MERETH_LOOK: Look = { body: 'female', outfit: 'ranger', hair: 'buns', hairColor: 0x1a1410, skin: 0xa8744e, cloth: 0xd4a640, pauldron: true, bracers: true, height: 1.76 };
const SUNGUARD = (k: number): Look => ({ ...LOOKS.guard(k % 3 === 1), cloth: k % 2 ? 0x1f7a7a : 0xd4a640 });
const v3 = (p: XZ, y = 0) => new THREE.Vector3(p[0], y, p[1]);

export class OutcastSands {
  readonly interactables: Interactable[] = [];
  private bolts: Bolts;
  private ishara: Puppet | null = null;
  private kids: Puppet[] = [];
  private rebels: Puppet[] = [];
  private gate: Pack<Bandit>;
  private captain: Pack<Bandit>;
  private purge: Pack<Bandit>;
  private defenders: Pack<Bandit>;
  private merethSchedule: ScheduleEntry[] | null = null;
  private shown = true;
  private readonly home: XZ = [BONE_WELLS[0] + 3, BONE_WELLS[1] + 2];

  constructor(private d: GhagrabbaDeps, private life: GhagrabbaLife) {
    this.bolts = new Bolts(d.scene);
    const tick = (b: Bandit, dt: number) => b.update(dt, d.player);
    const gateAt = () => v3(EAST_GATE);
    this.gate = new Pack(gateAt, (k, at) => banditAt(d.scene, this.bolts, at, k, 6, { role: k % 3 === 2 ? 'crossbow' : 'sword', kind: 'sunGuard', name: 'Sun Guard', look: SUNGUARD(k), hp: 150, damage: 18, radius: 9 }), tick);
    this.captain = new Pack(gateAt, (_k, at) => banditAt(d.scene, this.bolts, at, 0, 1, { role: 'chief', kind: 'sunCaptain', name: 'Captain Mereth of the Sun Guard', look: MERETH_LOOK, hp: 620, damage: 26, radius: 2 }), tick);
    const wellsAt = () => v3(this.home, campFloor(BONE_WELLS[0], BONE_WELLS[1]));
    this.purge = new Pack(wellsAt, (_k, at) => banditAt(d.scene, this.bolts, at, 0, 1, { role: 'chief', kind: 'ishara', name: 'Ishara of the Bone Wells', look: ISHARA_LOOK, hp: 520, damage: 22, radius: 1 }), tick);
    this.defenders = new Pack(wellsAt, (k, at) => banditAt(d.scene, this.bolts, at, k, 4, { role: k === 3 ? 'crossbow' : 'sword', kind: 'scavenger', name: 'Bone Wells Defender', look: LOOKS.enforcer(k), radius: 7 }), tick);
    // The Bone Wells stand down while Ishara is talking to you, and the whole Expanse once you are on her side.
    d.desert.campPeace = (camp) => d.flags.osPath === 'rebel' || (camp === 2 && (d.quests.isActive('os-3') || d.quests.isActive('os-4')));
    this.buildInteractables();
  }

  private get iAt() {
    return v3(this.home, campFloor(BONE_WELLS[0], BONE_WELLS[1]));
  }

  /** Is Ishara at the Bone Wells as a friend right now? */
  private get present() {
    const q = this.d.quests;
    return q.isActive('os-3') || q.isActive('os-4') || q.isActive('os-rebel') || this.d.flags.sbEnding === 'sand';
  }

  private buildInteractables() {
    const d = this.d, q = d.quests;
    const say = (text: string, opts = [{ label: 'Farewell.', run: () => d.close() }]) => d.talk('Ishara', 'Healer of the Bone Wells', text, opts);
    this.interactables.push({
      pos: this.iAt, radius: 2.6,
      label: () => (q.wants('os-ishara') ? 'Face the woman by the dry well' : 'Speak with Ishara'),
      enabled: () => !!this.ishara && this.present,
      action: () => {
        this.ishara?.face(d.player.pos.x, d.player.pos.z, 1, 20);
        if (q.wants('os-ishara')) {
          say('(She is kneeling over a sleeping child with a cloth in her hand, and she does not stand up when you come. Her knife stays in her belt.) So the Vizier has bought himself a sword. Go on, then. But be quick and be quiet; these two have only just stopped crying. ...No? Then sit. Look at them. Sand fever, from drinking the bottom of a well that used to be full. The palace says the Great Well is dying. Ask yourself why the palace never goes thirsty.', [
            { label: 'Lower your blade.', run: () => { q.signal('os-ishara'); say('Good. Then make yourself useful. The Waystop well, east on the Caravan Way, still has sweet water. Bring me a skin of it for the children — and then go and look under the Great Well in the Court of the Sun. Climb down the bucket rope. Look where the shaft forks.'); } },
          ]);
        } else if (q.wants('os-water')) {
          say('The Waystop well, east on the Caravan Way. One skin of sweet water. They will not last long on what we have.');
        } else if (q.wants('os-water-given')) {
          if (!d.flags.osWater) return say('You came back without water? The Waystop, outlander. East.');
          d.flags.osWater = false;
          q.signal('os-water-given');
          this.kidsWell = true;
          desertAudio.splash(0.6);
          say('(She tips the skin to the smaller one\'s lips, then the other\'s, a little at a time.) There. There. ...Now go to the city. Go down the Great Well. And when you have seen what is under it, come back and tell me whose side you are on.');
        } else if (q.wants('os-cistern')) {
          say('The Great Well, in the Court of the Sun. Climb down. Look where the shaft forks. Then come back.');
        } else if (q.wants('os-choice')) {
          say('You have seen it. Water to the brim under the palace, and children drinking sand out here. So. The Vizier is paying you to kill me. I am asking you to help me make them open the wells. I will not beg, and I will not blame you either way. What will you do?', [
            {
              label: 'Lead the outcasts. The wells will open.', run: () => {
                d.flags.osPath = 'rebel';
                q.signal('os-choice');
                say('(For a moment she only looks at you.) Then we rise. Go to Dunewatch, to Tarp Row, to the Rust Market — tell them Ishara sent you, and tell them what you saw under the Well. When they are ready, we go to the east gate. All of us.');
                d.save();
              },
            },
            {
              label: 'I serve the crown.', run: () => {
                d.flags.osPath = 'crown';
                q.signal('os-choice');
                say('(She stands up, slowly, and puts herself between you and the children. Now the knife comes out.) Then do what you came to do. But not here. Not in front of them. I will be waiting by the well when you are ready — and I will not make it easy.');
                d.save();
              },
            },
          ]);
        } else if (q.isActive('os-rebel')) {
          say('Dunewatch, Tarp Row, the Rust Market. Then the gate. The sand is waiting for you.');
        } else {
          say(d.flags.sbEnding === 'sand' ? 'The cisterns are open and the children drink from the Great Well. I keep coming out here anyway. Old habits; sand in my bones.' : 'Sit. Drink. You look like the desert has been chewing on you.');
        }
      },
    });
    // The Waystop well: a skin of sweet water for the children.
    const [wx, wz] = [WAYSTOP[0] + 6, WAYSTOP[1] - 4];
    this.interactables.push({
      pos: new THREE.Vector3(wx, 0, wz), radius: 2.4,
      label: () => 'Fill a waterskin for the Bone Wells', enabled: () => q.wants('os-water'),
      action: () => {
        d.flags.osWater = true;
        q.signal('os-water');
        desertAudio.splash(0.6);
        d.toast('You fill a skin with sweet, cold water from the Waystop well.');
      },
    });
    // The rally: each village hears what is under the Great Well.
    const rally: [XZ, string, string, string][] = [
      [DUNEWATCH, 'os-rally-dunewatch', 'Old Mother Huy', 'Under the palace? Full? (The old woman is quiet a long time.) We buried four children last dry season. Dunewatch will come to the gate. Every one of us who can walk.'],
      [TARP_ROW, 'os-rally-tarprow', 'Wise Ta-Nedjem', 'Ishara sent you. Then the songs were right: the walls keep their water like a miser keeps gold. Tarp Row will sing the villages to the gate.'],
      [RUST_MARKET, 'os-rally-rust', 'Old Rusk', 'Full cisterns. Ha! And they pay us a tenth for scrap and sell us back our own water. The Rust Market rides. Bring your sword; we\'ll bring everything else.'],
    ];
    for (const [at, sig, who, line] of rally) {
      this.interactables.push({
        pos: v3([at[0] + 2, at[1] + 2]), radius: 4,
        label: () => 'Speak for Ishara\'s cause', enabled: () => q.wants(sig),
        action: () => {
          q.signal(sig);
          desertAudio.drum('doum', 0.8);
          d.talk(who, 'The sand-folk rise', line, [{ label: 'To the gate.', run: () => d.close() }]);
        },
      });
    }
  }

  private kidsWell = false;

  private spawnIshara() {
    const d = this.d;
    if (!this.ishara) {
      const p = new Puppet(d.scene, ISHARA_LOOK, this.iAt, undefined, Math.PI);
      this.ishara = p;
      const [cx, cz] = BONE_WELLS;
      this.kids = [0, 1].map((k) => new Puppet(d.scene, LOOKS.child(k), [cx + 1.2 + k * 1.4, cz + 3.4], undefined, -Math.PI / 2));
    }
  }
  private despawnIshara() {
    this.ishara?.dispose();
    this.ishara = null;
    for (const k of this.kids) k.dispose();
    this.kids = [];
  }

  update(dt: number) {
    const d = this.d, q = d.quests, p = d.player.pos;
    if (!this.shown || d.mode() !== 'overworld') return;
    const near = Math.hypot(p.x - BONE_WELLS[0], p.z - BONE_WELLS[1]) < 160;
    if (near && this.present) this.spawnIshara();
    else if (this.ishara && (!near || !this.present)) this.despawnIshara();
    if (this.ishara) {
      const talking = this.ishara.pos.distanceTo(p) < 5;
      this.ishara.play(q.wants('os-ishara') ? 'crouch' : talking ? 'talk' : 'idle');
      if (talking) this.ishara.face(p.x, p.z, dt);
      this.ishara.update(dt);
      const sick = q.isActive('os-3') && !this.kidsWell && !q.isDone('os-3');
      for (const k of this.kids) {
        k.play(sick ? 'sit' : 'dance');
        k.update(dt);
      }
    }
    // The east gate: the Sun Guard's last stand (and Captain Mereth off her post while she leads it).
    const gateFight = q.isActive('os-rebel', 1);
    this.gate.update(dt, d.player, need(q, 'os-rebel', 1, 0));
    this.captain.update(dt, d.player, need(q, 'os-rebel', 1, 1));
    this.mereth(gateFight);
    this.rebelCrowd(dt, gateFight);
    // The purge: Ishara and her last defenders.
    this.purge.update(dt, d.player, need(q, 'os-crown', 0, 1));
    this.defenders.update(dt, d.player, need(q, 'os-crown', 0, 1) ? 4 : 0);
    this.bolts.update(dt, d.player);
  }

  /** Captain Mereth leaves her post for the fight, and comes back once it is over. */
  private mereth(away: boolean) {
    const st = this.d.npcs.find('mereth');
    if (!st) return;
    if (away && !this.merethSchedule) {
      this.merethSchedule = st.rec.schedule;
      st.rec.schedule = [{ from: 0, activity: 'sleep', place: 'homes' }];
    } else if (!away && this.merethSchedule) {
      st.rec.schedule = this.merethSchedule;
      this.merethSchedule = null;
    }
  }

  /** Sand-folk at your back while you storm the gate. */
  private rebelCrowd(dt: number, on: boolean) {
    const p = this.d.player.pos;
    const near = on && Math.hypot(p.x - EAST_GATE[0], p.z - EAST_GATE[1]) < 150;
    if (near && !this.rebels.length) {
      for (let k = 0; k < 5; k++) {
        const pp = new Puppet(this.d.scene, LOOKS.enforcer(k), [EAST_GATE[0] + 34 + (k % 3) * 2.5, EAST_GATE[1] - 6 + k * 3], undefined, -Math.PI / 2);
        this.rebels.push(pp);
      }
      this.life.say(this.rebels[0].pos, 'The Sand-Folk', 'Open the wells! OPEN THE WELLS!', 'plain', 5);
    } else if (!near && this.rebels.length) {
      for (const r of this.rebels) r.dispose();
      this.rebels = [];
    }
    for (const r of this.rebels) {
      r.play('cheer');
      r.update(dt);
    }
  }

  setVisible(v: boolean) {
    this.shown = v;
    if (!v) {
      this.despawnIshara();
      for (const r of this.rebels) r.dispose();
      this.rebels = [];
      this.gate.clear();
      this.captain.clear();
      this.purge.clear();
      this.defenders.clear();
      this.bolts.clear();
    }
  }
}
