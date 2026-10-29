import * as THREE from 'three';
import { col, rockGeo } from './kit';
import { loot } from './batch1';
import { Figure } from '../roadLife/actors';
import { Spider } from '../../creatures/spider/spider';
import { Undead } from '../../enemies/undead';
import { Bandit, Bolts } from '../../enemies/bandit';
import { heightAt } from '../terrainHeight';
import type { Look } from '../../npc/charBuilder';
import type { Player } from '../../player/player';
import type { SiteAction, SiteCtx, SiteFoe, SiteType } from './types';

// The second batch of sites: old wells, graveyards with a mausoleum, bandit
// hideouts, five hermits, ruined bridges, the three fallen statues, signal
// beacons on the hills, beehives and old orchards.

/** Undead want the others they walk with: a foe wrapper keeps that list. */
function undeadFoe(u: Undead, crowd: Undead[]): SiteFoe {
  crowd.push(u);
  return {
    get alive() {
      return u.alive;
    },
    update: (dt, p) => u.update(dt, p, crowd),
    dispose: () => u.dispose(),
  };
}

const night = (c: SiteCtx) => {
  const h = c.hooks.hour();
  return h >= 21 || h < 5;
};

// ---- Old well ---------------------------------------------------------------------------------

/**
 * A round stone well with a little roof, a crank and a bucket on a rope.
 * Look down it: there's often a coin or two at the bottom. Sometimes
 * something is looking back up.
 */
export const WELL: SiteType = {
  kind: 'well', label: 'Old Well', glyph: '◎', color: '#a8c8e8', count: 12, clear: 6,
  habitats: ['meadow', 'woodEdge', 'hills', 'forest'],
  build(c) {
    const k = c.kit, m = k.m, r = c.rnd;
    // The ring of stones.
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      k.add(new THREE.BoxGeometry(0.42, 0.85, 0.3), m.stone, Math.cos(a) * 0.82, 0.42, Math.sin(a) * 0.82, -a + Math.PI / 2);
    }
    k.add(new THREE.CylinderGeometry(0.98, 0.98, 0.12, 16), m.stone, 0, 0.86, 0, 0, 0, 0, 0);
    // Black water far down.
    k.add(new THREE.CircleGeometry(0.66, 16).rotateX(-Math.PI / 2), col(0x080a0c, 0.2), 0, 0.5, 0, 0, 0, 0, 0);
    k.post(1, 1, 0, 0);
    // Posts, a roof, the crank, the bucket.
    for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(0.14, 2.2, 0.14), m.timber, s * 0.95, 1.1, 0);
    for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(2.4, 0.06, 0.9), m.thatch, 0, 2.35, s * 0.32, 0, s * 0.62, 0, 0);
    k.add(new THREE.CylinderGeometry(0.06, 0.06, 2.0, 6), m.timber, 0, 1.75, 0, 0, 0, Math.PI / 2);
    k.add(new THREE.BoxGeometry(0.05, 0.4, 0.05), m.timber, 1.05, 1.6, 0.12);
    k.add(new THREE.CylinderGeometry(0.01, 0.01, 0.8, 4), col(0x8a7a5a, 1), 0.2, 1.3, 0);
    k.add(new THREE.CylinderGeometry(0.15, 0.12, 0.24, 10), col(0x6a5238, 0.9), 0.2, 0.86 + 0.12, 0.62, 0, 0.3, 0.2, 0);
    for (let i = 0; i < 4; i++) k.rock((r() - 0.5) * 6, 2 + r() * 2, 0.25 + r() * 0.2, 0.15);
    const st = c.state;
    const lurker = c.site.seed % 3 === 0;
    const kv = (st.k ??= {});
    let spider: Spider | null = null;
    return {
      actions: [{
        at: k.at(0, 1.4, 0.9), radius: 2.6,
        label: () => (spider?.alive ? 'Something is still down there' : kv.lurked && !st.done ? 'Fish out what it was guarding' : 'Look down the well'),
        enabled: () => !st.done,
        act: () => {
          if (spider?.alive) return;
          if (lurker && !kv.lurked && c.hooks.ready('spider')) {
            kv.lurked = true;
            const at = k.at(0, 0, 0.3);
            spider = new Spider(at, c.hooks.level(c.site.x, c.site.z) + 1, c.hooks.scene, c.hooks.fx, { size: 1.25 });
            c.spawn(spider);
            c.hooks.toast('Two rows of eyes shine up out of the dark. Something climbs, fast.');
            return;
          }
          if (kv.lurked) {
            c.hooks.toast(`Wrapped in old web at the bottom: a drowned traveller\'s purse. ${loot(c, 'chest')}.`);
          } else {
            const g = 4 + Math.round(r() * 14 * (1 + c.site.danger));
            c.hooks.gold(g);
            c.hooks.toast(`You fish ${g} gold out of the well with the bucket: years of wishes.`);
          }
          c.finish();
        },
      }],
    };
  },
};

// ---- Graves and a mausoleum ------------------------------------------------------------------

/**
 * A little graveyard nobody tends: leaning headstones in long grass behind a
 * broken fence, a dead tree, and a mausoleum with an iron door. Search the
 * graves and you'll find what was buried with them; do it at night and the
 * dead object.
 */
export const GRAVES: SiteType = {
  kind: 'graves', label: 'Forgotten Graves', glyph: '✝', color: '#c8c0d8', count: 12, clear: 14,
  habitats: ['meadow', 'woodEdge', 'hills', 'forest'],
  build(c) {
    const k = c.kit, m = k.m, r = c.rnd;
    const grey = col(0x8a8a86, 0.95), moss = col(0x5a6a3a, 1);
    // Headstones in rows, leaning.
    const graves: THREE.Vector3[] = [];
    for (let row = 0; row < 3; row++) for (let i = 0; i < 4; i++) {
      if (r() < 0.2) continue;
      const x = -4.5 + i * 2.4 + (r() - 0.5) * 0.4, z = -3 + row * 2.6;
      const tall = 0.7 + r() * 0.5;
      const kind = r();
      const g = kind < 0.4 ? new THREE.BoxGeometry(0.6, tall, 0.14) : kind < 0.75 ? new THREE.CylinderGeometry(0.3, 0.3, 0.14, 12, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2) : new THREE.BoxGeometry(0.12, tall + 0.3, 0.12);
      k.add(g, grey, x, tall / 2 - 0.05, z, (r() - 0.5) * 0.3, (r() - 0.5) * 0.25, (r() - 0.5) * 0.25);
      if (kind >= 0.75) k.add(new THREE.BoxGeometry(0.55, 0.11, 0.11), grey, x, tall * 0.85, z);
      // A low mound in front.
      k.add(rockGeo(r, 0.45, 0.12, 0.9, 1), moss, x, 0.0, z + 0.9, 0, 0, 0, 0);
      graves.push(k.at(x, z + 0.9));
    }
    // A fence with a gap, mostly fallen.
    const iron = col(0x2a2a2c, 0.6, { metal: 0.6 });
    for (let i = 0; i < 18; i++) {
      if (r() < 0.35) continue;
      const a = (i / 18) * Math.PI * 2;
      k.add(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 4), iron, Math.cos(a) * 9, 0.6, Math.sin(a) * 7, 0, (r() - 0.5) * 0.4, (r() - 0.5) * 0.4, 0);
    }
    // The dead tree.
    k.add(new THREE.CylinderGeometry(0.18, 0.32, 4.5, 7), col(0x3a3028, 1), 6.5, 2.2, 3.5, 0, 0.1, 0.05);
    for (let i = 0; i < 5; i++) k.add(new THREE.CylinderGeometry(0.03, 0.08, 1.8, 5), col(0x3a3028, 1), 6.5 + (r() - 0.5), 3.2 + i * 0.3, 3.5 + (r() - 0.5), r() * 6, 0.9 + r() * 0.5, 0);
    k.post(0.3, 4, 6.5, 3.5);
    // The mausoleum.
    const mx = 0, mz = -7.5;
    k.add(new THREE.BoxGeometry(3.2, 2.6, 3.6), m.stone, mx, 1.2, mz);
    for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(3.6, 0.15, 2.2), m.slate, mx, 2.95, mz + s * 0.85, 0, s * 0.45, 0, 0);
    k.add(new THREE.BoxGeometry(1.0, 1.7, 0.08), iron, mx, 0.85, mz + 1.82);
    for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(0.35, 2.5, 0.35), m.stone, mx + s * 1.2, 1.25, mz + 1.85);
    k.solid(3.6, 3, 3.8, mx, 1.5, mz);
    const st = c.state;
    const kv = (st.k ??= {});
    const crowd: Undead[] = [];
    let risen: { alive: boolean }[] = [];
    const raise = (n: number) => {
      for (let i = 0; i < n; i++) {
        const at = graves[i % graves.length].clone();
        const u = new Undead(i === 0 && c.site.danger > 0.4 ? 'zombie' : 'skeleton', at, c.site.yaw + Math.PI, c.hooks.scene, c.hooks.fx);
        const f = undeadFoe(u, crowd);
        risen.push(f);
        c.spawn(f);
      }
    };
    const busy = () => risen.some((x) => x.alive);
    return {
      actions: [
        {
          at: k.at(0, 0), radius: 4.5,
          label: () => (busy() ? 'The dead are up' : 'Search the graves'),
          enabled: () => !kv.graves,
          act: () => {
            if (busy()) return;
            if (night(c) && !kv.rose) {
              kv.rose = true;
              raise(2 + Math.floor(c.site.danger * 3));
              c.hooks.toast('The ground heaves. The dead object to being robbed in the dark.');
              return;
            }
            kv.graves = true;
            c.hooks.toast(`Grave goods: ${loot(c, 'chest')}.`);
            if (kv.tomb) c.finish();
          },
        },
        {
          at: k.at(mx, mz + 2.4), radius: 2.4,
          label: () => (busy() ? 'The dead are up' : 'Force the mausoleum door'),
          enabled: () => !kv.tomb,
          act: () => {
            if (busy()) return;
            kv.tomb = true;
            if (night(c)) {
              raise(2);
              c.hooks.toast('Something in the dark of the tomb gets up to meet you.');
            }
            const g = 40 + Math.round(c.site.danger * 160);
            c.hooks.gold(g);
            c.hooks.give(c.site.danger > 0.5 ? 'silverOre' : 'boneDust', 2);
            c.hooks.toast(`On the bier inside: ${g} gold in a burial purse, and what's left of a lord.`);
            if (kv.graves) c.finish();
          },
        },
      ],
    };
  },
};

// ---- Bandit hideout ---------------------------------------------------------------------------

/**
 * A ring of sharpened stakes round a camp in the trees: a tent, a fire, a
 * lookout platform, stolen crates. The band inside fights; their leader
 * carries the key to the strongbox.
 */
export const HIDEOUT: SiteType = {
  kind: 'hideout', label: 'Bandit Hideout', glyph: '⚔', color: '#e86a5a', count: 8, clear: 18,
  habitats: ['forest', 'woodEdge', 'deepForest', 'hills'],
  minFar: 600,
  build(c) {
    const k = c.kit, m = k.m, r = c.rnd;
    const stake = col(0x6a5238, 0.95);
    // The palisade: stakes in a ring with a gap at the front.
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.24) continue;
      const x = Math.cos(a) * 11, z = Math.sin(a) * 11;
      k.add(new THREE.CylinderGeometry(0.0, 0.16, 2.8 + r() * 0.6, 6).translate(0, 1.4, 0), stake, x, -0.1, z, 0, (r() - 0.5) * 0.15, (r() - 0.5) * 0.15, 0);
      if (i % 2 === 0) k.solid(1.8, 2.6, 0.4, x, 1.3, z, Math.PI / 2 - a);
    }
    // A tent, a fire, crates and a lookout.
    const canvas = col(0x8a7a5a, 1, { side: THREE.DoubleSide });
    for (const s of [-1, 1]) k.add(new THREE.PlaneGeometry(3.4, 2.4), canvas, -4 + s * 0.85, 1.0, -4, 0, 0, s * 0.82, 0);
    k.solid(3.4, 2, 2.8, -4, 1, -4);
    k.campfire(1, 0);
    for (let i = 0; i < 6; i++) k.crate(4 + r() * 3, -5 + r() * 3, 0.55 + r() * 0.2, r() * 2);
    for (let i = 0; i < 3; i++) k.barrel(5 + r() * 2, -1 + r() * 2);
    for (const [x, z] of [[6, 5], [8, 5], [6, 7], [8, 7]]) k.add(new THREE.CylinderGeometry(0.1, 0.12, 3.6, 6), m.timber, x, 1.8, z);
    k.add(new THREE.BoxGeometry(2.6, 0.12, 2.6), m.planks, 7, 3.6, 6);
    // The strongbox.
    const st = c.state;
    const kv = (st.k ??= {});
    const box = k.chest(-6, 2, 0.6, !!st.done);
    // The band.
    const bolts = new Bolts(c.hooks.scene);
    const band: Bandit[] = [];
    if (!kv.cleared) {
      const roles = c.site.danger > 0.45 ? ['chief', 'sword', 'sword', 'crossbow', 'crossbow'] : ['chief', 'sword', 'crossbow'];
      roles.forEach((role, i) => {
        const at = i === 0 ? k.at(-3, 1) : k.at(-6 + i * 3, -1 + (i % 2) * 3);
        const b = new Bandit(role as 'chief' | 'sword' | 'crossbow', at, c.hooks.scene, bolts);
        if (role === 'chief') {
          b.name = BANDIT_CHIEFS[c.site.n % BANDIT_CHIEFS.length];
          b.hp = b.maxHp = 260 + Math.round(c.site.danger * 260);
        }
        band.push(b);
        c.spawn(b);
      });
    }
    const chief = band[0];
    return {
      actions: [{
        at: box.at.clone(), radius: 2.2,
        label: () => (chief?.alive ? `Locked. ${chief.name} has the key` : 'Open the strongbox'),
        enabled: () => !st.done,
        act: () => {
          if (chief?.alive) return c.hooks.toast(`The strongbox is locked. ${chief.name} wears the key round their neck.`);
          box.open();
          kv.cleared = true;
          c.hooks.toast(`In the strongbox, with the chief's key: ${loot(c, 'chest')}.`);
          c.hooks.xp(150);
          c.finish();
        },
      }],
      update: (dt, p) => {
        bolts.update(dt, p);
        if (chief && !chief.alive && !kv.cleared && band.every((b) => !b.alive)) kv.cleared = true;
      },
      dispose: () => bolts.clear(),
    };
  },
};
const BANDIT_CHIEFS = ['Hal Crookback', 'Red Isolde', 'Morrow the Fence', 'One-Ear Doss', 'Lark Harrow', 'Gammer Fen', 'Bastian Coyle', 'Sabel the Quick'];

// ---- Hermits -----------------------------------------------------------------------------------

interface Hermit {
  name: string;
  title: string;
  look: Look;
  greet: string;
  talk: (c: SiteCtx, done: () => void) => { label: string; run: () => void }[];
}

/** The nearest site you haven't found, told as a rumour, and marked. */
function rumour(c: SiteCtx) {
  const near = c.unseen(c.site.x, c.site.z);
  if (!near) return 'I\'ve nothing to tell you that you don\'t know already. You get about.';
  near.st.seen = true;
  const dir = compass(near.site.x - c.site.x, near.site.z - c.site.z);
  const d = Math.round(Math.hypot(near.site.x - c.site.x, near.site.z - c.site.z) / 50) * 50;
  return `There\'s ${near.name.toLowerCase().startsWith('the') ? near.name.toLowerCase() : 'a ' + near.name.toLowerCase()} about ${d} paces ${dir} of here. I\'ve marked it on your map, if you can read a map.`;
}
function compass(dx: number, dz: number) {
  // Map north is -z.
  const a = Math.atan2(dx, -dz);
  return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8];
}
function buy(c: SiteCtx, item: string, n: number, cost: number, what: string) {
  if (!c.hooks.spend(cost)) return c.hooks.toast(`You need ${cost} gold for that.`);
  c.hooks.give(item, n);
  c.hooks.toast(`Bought ${what} for ${cost} gold.`);
}
function fetchQuest(c: SiteCtx, key: string, item: string, n: number, ask: string, thanks: string, reward: () => void, done: () => void) {
  const kv = (c.state.k ??= {});
  if (kv[key] === 'paid') return [];
  if (c.hooks.count(item) >= n) {
    return [{
      label: `Hand over the ${n}`, run: () => {
        if (!c.hooks.take(item, n)) return;
        kv[key] = 'paid';
        reward();
        c.hooks.toast(thanks);
        done();
      },
    }];
  }
  return [{ label: 'Is there anything you need?', run: () => c.hooks.toast(ask) }];
}

const HERMITS: Hermit[] = [
  {
    name: 'Agathe Bonereader', title: 'Hermit', look: { body: 'female', outfit: 'peasant', hair: 'long', hairColor: 0xb8b0a8, skin: 0xd8b49a, cloth: 0x4a3a5a, linen: 0x9a9080, height: 1.58 },
    greet: 'Sit, sit. The bones rattle when someone\'s coming. Shall I throw them for you? They know the country better than I do.',
    talk: (c) => [{ label: 'Throw the bones (once a day)', run: () => {
      const kv = (c.state.k ??= {});
      if (kv.thrown === c.hooks.day()) return c.hooks.toast('"Not twice in a day. The bones get tired, same as me."');
      kv.thrown = c.hooks.day();
      c.hooks.talk('Agathe Bonereader', 'Hermit', rumour(c), [{ label: 'Thank you.', run: () => {} }]);
    } }],
  },
  {
    name: 'Brother Aldous', title: 'Hermit of the Dawn', look: { body: 'male', outfit: 'peasant', hair: 'buzzed', beard: true, hairColor: 0x8a8278, skin: 0xe0b894, cloth: 0x6a5a3a, linen: 0xb0a890, height: 1.74 },
    greet: 'Dawn keep you, traveller. I make remedies from what grows round here, and I bless what I can. Take what you need; leave what you can.',
    talk: (c) => [
      { label: 'Buy a health potion (25 gold)', run: () => buy(c, 'healthPotion', 1, 25, 'a health potion') },
      { label: 'Buy a mana potion (25 gold)', run: () => buy(c, 'manaPotion', 1, 25, 'a mana potion') },
      { label: 'Ask for a blessing (10 gold)', run: () => {
        if (!c.hooks.spend(10)) return c.hooks.toast('You need 10 gold for the poor box.');
        c.hooks.bless({ id: 'aldous', label: 'Brother Aldous\'s blessing: healing does more', sec: 600, m: { heal: 0.3, hp: 15 } });
      } },
    ],
  },
  {
    name: 'Mad Pell', title: 'Hermit', look: { body: 'male', outfit: 'peasant', hair: 'simpleparted', beard: true, hairColor: 0x3a2a1a, skin: 0xc8a080, cloth: 0x3a3a3a, linen: 0x7a7060, height: 1.7 },
    greet: '"It\'s leaking," he says before you\'ve said a word. "Violet, at the edges, where you don\'t look straight at it. The old lord over there is dying, and the walls are going thin. Nobody listens to Pell."',
    talk: (c, done) => [
      { label: 'What\'s leaking?', run: () => c.hooks.talk('Mad Pell', 'Hermit', '"The Dark. The other side of everything. There\'s a lord over there older than the hills, and he\'s dying, and the walls go thin when a thing like that dies. Things lean through. Things come through." He peers at you. "You came through. Didn\'t you. You smell of it."', [{ label: 'Like me?', run: () => {} }]) },
      ...fetchQuest(c, 'bones', 'boneDust', 3, '"Bone dust. Three pinches. From the walking dead, not the honest kind. I need it for a ward. Don\'t ask me what for."', '"Good, good." He packs it into a little bag and hangs it on his door. "Take this. I won\'t need it once the ward\'s up."',
        () => { c.hooks.gold(80); c.hooks.give('greaterHealthPotion', 2); c.hooks.xp(120); }, done),
    ],
  },
  {
    name: 'Ysolde', title: 'Beekeeper', look: { body: 'female', outfit: 'peasant', hair: 'buns', hairColor: 0xd8a848, skin: 0xe8c4a4, cloth: 0x8a7a3a, linen: 0xd0c8b0, height: 1.66 },
    greet: 'Mind the bees; they don\'t mind you if you don\'t flap. I sell comb, and I\'ll pay for wild mint if you find any. The bees like a mint garden.',
    talk: (c, done) => [
      { label: 'Buy honeycomb (12 gold)', run: () => buy(c, 'honeycomb', 2, 12, 'two pieces of honeycomb') },
      ...fetchQuest(c, 'mint', 'wildmint', 4, '"Wild mint, four sprigs. It grows on the verges near the Glen."', '"Lovely. The bees will be beside themselves." She presses a pot and a purse on you.',
        () => { c.hooks.gold(60); c.hooks.give('honeycomb', 3); c.hooks.give('greaterHealthPotion', 1); c.hooks.xp(80); }, done),
    ],
  },
  {
    name: 'Corrin Ashfoot', title: 'Old Soldier', look: { body: 'male', outfit: 'ranger', hood: false, hair: 'buzzed', beard: true, hairColor: 0x6a6a64, skin: 0xb88a6a, cloth: 0x5a2a22, height: 1.8, pauldron: true },
    greet: 'Twenty years in the Crown\'s colours and they gave me a field of stones for it. Still, it\'s quiet. Mostly. The wolves have got bold.',
    talk: (c, done) => [
      { label: 'Ask for a soldier\'s advice', run: () => c.hooks.talk('Corrin Ashfoot', 'Old Soldier', '"Watch the shoulders, not the blade. A big man winds up before he swings, every time. And a shield\'s no good if they get round it; keep them in front of you."', [{ label: 'I\'ll remember.', run: () => {} }]) },
      ...fetchQuest(c, 'pelts', 'wolfPelt', 3, '"Bring me three wolf pelts and I\'ll know the bold ones are dead. My old knees can\'t chase them."', '"Three! Then that\'s that." He digs out an old kit bag. "Here, I\'ve no use for these now."',
        () => { c.hooks.gold(70); c.hooks.give('steelIngot', 3); c.hooks.xp(120); }, done),
    ],
  },
];

/**
 * A small cottage alone in the wilds, smoke from the chimney, a vegetable
 * plot and a bench by the door, and its strange resident: five of them, each
 * with something to say, sell or ask.
 */
export const HERMIT: SiteType = {
  kind: 'hermit', label: "Hermit's Cottage", glyph: '☗', color: '#b8e0a0', count: 5, clear: 14,
  habitats: ['forest', 'woodEdge', 'hills', 'meadow', 'lakeshore'],
  name: (s) => `${HERMITS[s.n % HERMITS.length].name}'s Cottage`,
  build(c) {
    const k = c.kit, m = k.m, r = c.rnd;
    const H = HERMITS[c.site.n % HERMITS.length];
    // The cottage: stone walls, a thatched roof, a door, a chimney.
    const W = 4.6, D = 3.8;
    k.add(new THREE.BoxGeometry(W, 2.4, D), m.stone, 0, 1.1, 0);
    k.solid(W, 2.6, D, 0, 1.3, 0);
    // A thick thatched gable roof (a prism along the cottage's length) over stone gable ends.
    const tri = (w: number, h: number) => new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]);
    const roof = new THREE.ExtrudeGeometry(tri(D + 1.0, 2.1), { depth: W + 0.8, bevelEnabled: false });
    roof.translate(0, 0, -(W + 0.8) / 2).rotateY(Math.PI / 2);
    k.add(roof, m.thatch, 0, 2.2, 0, 0, 0, 0, 2);
    for (const sx of [-1, 1]) {
      const gable = new THREE.ExtrudeGeometry(tri(D, 1.8), { depth: 0.3, bevelEnabled: false });
      gable.translate(0, 0, -0.15).rotateY(Math.PI / 2);
      k.add(gable, m.stone, sx * (W / 2 - 0.15), 2.3, 0, 0, 0, 0, 1.5);
    }
    k.add(new THREE.BoxGeometry(0.9, 1.7, 0.08), col(0x5a3e28, 0.9), 0.6, 0.85, D / 2 + 0.02);
    k.add(new THREE.BoxGeometry(0.6, 0.6, 0.06), col(0xffd890, 0.5, { emissive: 0xffb050, ei: 0.6 }), -1.3, 1.4, D / 2 + 0.02);
    k.add(new THREE.BoxGeometry(0.6, 3.6, 0.6), m.stone, -W / 2 + 0.3, 2.4, -0.6);
    // A vegetable plot, a bench, a woodpile, a water butt.
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) k.add(new THREE.SphereGeometry(0.18, 6, 5), col([0x4a7a2a, 0x6a8a3a, 0x3a6a2a][j], 1), 3.6 + i * 0.6, 0.1, 1 + j * 0.7, 0, 0, 0, 0);
    k.add(new THREE.BoxGeometry(1.6, 0.08, 0.4), m.planks, -0.9, 0.45, D / 2 + 0.7);
    for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(0.08, 0.45, 0.35), m.planks, -0.9 + s * 0.65, 0.22, D / 2 + 0.7);
    for (let i = 0; i < 8; i++) k.add(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 6), m.bark, -3.2, 0.1 + Math.floor(i / 3) * 0.2, -1.2 + (i % 3) * 0.22, 0, Math.PI / 2, 0, 0);
    k.barrel(2.6, -1.6);
    // The hermit, by the door.
    const fig = new Figure(c.hooks.scene, H.look);
    fig.pos.copy(k.at(-0.9, D / 2 + 1.0, 0.0));
    fig.yaw = c.site.yaw;
    fig.play('idle');
    const st = c.state;
    void r;
    return {
      actions: [{
        at: fig.pos.clone(), radius: 2.6, label: () => `Talk to ${H.name}`,
        act: () => {
          if (!st.done) {
            // Meeting them is enough to mark the cottage as known and visited.
            (st.k ??= {}).met = true;
          }
          c.hooks.talk(H.name, H.title, H.greet, [...H.talk(c, () => c.finish()), { label: 'Goodbye.', run: () => {} }]);
          if (H.name === 'Agathe Bonereader' || H.name === 'Brother Aldous') c.finish();
        },
      }],
      update: (dt) => fig.update(dt),
      dispose: () => fig.dispose(),
    };
  },
};

// ---- Old bridge -------------------------------------------------------------------------------

/**
 * What's left of an old stone bridge: two piers and a broken arch at the
 * water, a road that goes nowhere. A toll-keeper of the wrong sort sometimes
 * stands at its foot, and would like a word, and some coin.
 */
export const BRIDGE: SiteType = {
  kind: 'bridge', label: 'Ruined Bridge', glyph: '⌒', color: '#c8b898', count: 8, clear: 12,
  habitats: ['lakeshore', 'river', 'marsh', 'coast'],
  build(c) {
    const k = c.kit, m = k.m, r = c.rnd;
    // Two piers and a broken arch running out over the water.
    for (const z of [0, 7]) {
      k.add(new THREE.BoxGeometry(3.2, 4.2, 1.8), m.stone, 0, 0.6, z);
      k.solid(3.2, 4.2, 1.8, 0, 0.6, z);
    }
    const arch = new THREE.TorusGeometry(3.5, 0.6, 6, 14, Math.PI * 0.62);
    arch.scale(1, 0.75, 4);
    k.add(arch, m.stone, 0, 1.6, 3.5, Math.PI / 2, 0, 0, 1.5);
    // The deck from the shore pier, broken off.
    k.add(new THREE.BoxGeometry(3.4, 0.4, 5.5), m.stone, 0, 2.6, -2.2);
    k.solid(3.4, 0.4, 5.5, 0, 2.6, -2.2);
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) k.add(new THREE.BoxGeometry(0.3, 0.6, 1.1), m.stone, s * 1.55, 3.1, -4.4 + i * 1.2);
    // Fallen blocks in the shallows.
    for (let i = 0; i < 8; i++) k.add(new THREE.BoxGeometry(0.7, 0.45, 0.6), m.stone, (r() - 0.5) * 5, -0.2 + r() * 0.3, 3 + r() * 7, r() * 3, (r() - 0.5) * 0.5, (r() - 0.5) * 0.5);
    // The stream it crossed has gone dry: a bed of grey shingle under the arch, reeds along its banks.
    const shingle = col(0x7a7468, 1), wet = col(0x5a564c, 1);
    for (let i = 0; i < 9; i++) {
      const x = -14 + i * 3.5, w = 4.2 + Math.sin(i * 1.7) * 0.8;
      k.add(new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2).scale(2.3, 1, w / 2), i % 2 ? shingle : wet, x, 0.04, 3.5 + Math.sin(i * 0.9) * 0.8, 0, 0, 0, 0);
    }
    for (let i = 0; i < 26; i++) k.add(rockGeo(r, 0.22 + r() * 0.2, 0.12, 0.18, 0), col(0x8a867e, 0.95), (r() - 0.5) * 30, 0.05, 3.5 + (r() - 0.5) * 3.6, r() * 3, 0, 0, 0);
    const reed = col(0x6a7a3a, 1);
    for (const side of [-1, 1]) for (let i = 0; i < 14; i++) {
      const x = (r() - 0.5) * 30, z = 3.5 + side * (2.4 + r() * 0.8);
      for (let j = 0; j < 4; j++) k.add(new THREE.ConeGeometry(0.03, 1.2 + r() * 0.6, 3), reed, x + (r() - 0.5) * 0.3, 0.6, z + (r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3, (r() - 0.5) * 0.3, 0);
    }
    const st = c.state;
    const kv = (st.k ??= {});
    const toll = c.site.seed % 2 === 0 && !kv.settled;
    const bolts = new Bolts(c.hooks.scene);
    // He stands at the foot of the bridge, peaceable enough until you refuse.
    const fig = toll ? new Figure(c.hooks.scene, { body: 'male', outfit: 'ranger', hood: true, hair: 'buzzed', beard: true, hairColor: 0x2a1a10, skin: 0xd0a080, cloth: 0x6a2a22, height: 1.84 }) : null;
    if (fig) {
      fig.pos.copy(k.at(0, -6));
      fig.yaw = c.site.yaw + Math.PI;
      fig.play('arms');
    }
    let keeper: Bandit | null = null;
    const actions: SiteAction[] = [];
    if (fig) {
      actions.push({
        at: fig.pos.clone(), radius: 3, label: () => 'Talk to the toll-keeper',
        enabled: () => !kv.settled && !keeper,
        act: () => {
          const fee = 20 + Math.round(c.site.danger * 40);
          c.hooks.talk('The Toll-Keeper', 'Self-appointed', `"Bridge toll. ${fee} gold." He looks at the broken arch, then back at you, and doesn't smile. "It's for upkeep."`, [
            { label: `Pay ${fee} gold`, run: () => {
              if (!c.hooks.spend(fee)) return c.hooks.toast('You haven\'t got it. He shrugs, and puts his hand on his sword.');
              kv.settled = true;
              c.hooks.toast('He pockets it. "Mind how you go." Then, almost kindly, he tells you where a traveller lost a purse in the reeds.');
              c.hooks.gold(Math.round(fee * 0.6));
              c.finish();
            } },
            { label: 'Fight him for it', run: () => {
              keeper = new Bandit('sword', fig.pos.clone(), c.hooks.scene, bolts);
              keeper.name = 'The Toll-Keeper';
              keeper.hp = keeper.maxHp = 160 + Math.round(c.site.danger * 160);
              c.spawn(keeper);
              fig.visible = false;
              c.hooks.toast('"Your funeral." He draws.');
            } },
            { label: 'Walk away.', run: () => {} },
          ]);
        },
      });
    } else {
      actions.push({
        at: k.at(0, -3.5, 2.8), radius: 3.5, label: () => 'Look out over the water from the old bridge',
        enabled: () => !st.done,
        act: () => {
          c.hooks.xp(25);
          c.hooks.toast('The road the bridge carried is long gone; the water has had the rest. Someone has carved initials and a date into the parapet, older than the Crown.');
          c.finish();
        },
      });
    }
    return {
      actions,
      update: (dt, p: Player) => {
        bolts.update(dt, p);
        if (fig?.visible) fig.update(dt);
        if (keeper && !keeper.alive && !kv.settled) {
          kv.settled = true;
          c.hooks.toast(`On the toll-keeper: ${loot(c, 'chest')}.`);
          c.finish();
        }
      },
      dispose: () => {
        bolts.clear();
        fig?.dispose();
      },
    };
  },
};

// ---- Fallen statues ---------------------------------------------------------------------------

const STATUES = [
  { name: 'the Stone King', reward: 'runeAnvil', line: 'A king of the old line, his crown worn smooth. The inscription on the plinth names him the Wheel-Keeper.' },
  { name: 'the Shield Maiden', reward: 'runeWarding', line: 'A woman in mail with a round shield. On the shield, where you\'d expect arms, the Sunwheel.' },
  { name: 'the Watcher', reward: 'runeSwift', line: 'A hooded figure with one hand over its eyes. The plinth says only: WE LOOKED SO THAT YOU NEED NOT.' },
];

/**
 * A giant statue, toppled long ago and scattered down a hillside: the head,
 * the torso, a hand still gripping a sword, the shield, the legs on the
 * plinth. Find every piece of it for a reward.
 */
export const STATUE: SiteType = {
  kind: 'statue', label: 'Fallen Statue', glyph: '♛', color: '#e8d8b8', count: 3, clear: 30,
  habitats: ['hills', 'meadow', 'mountain', 'woodEdge'],
  name: (s) => `The Fallen Statue of ${STATUES[s.n % 3].name.replace('the ', '')}`,
  score: (_x, _z, h) => 0.3 + Math.min(0.7, h / 30),
  build(c) {
    const k = c.kit, r = c.rnd;
    const S = STATUES[c.site.n % 3];
    const stone = col(0xa8a49a, 0.9), dark = col(0x7a766e, 0.95);
    const st = c.state;
    const kv = (st.k ??= {});
    const spots: [number, number][] = [[0, 0], [14, 8], [-12, 10], [6, -14], [-9, -11]];
    const pieces: SiteAction[] = [];
    const names = ['the plinth and the legs', 'the head', 'the torso', 'a hand on a sword hilt', 'the shield'];
    spots.forEach(([x, z], i) => {
      if (i === 0) {
        // The plinth with the legs to the knee.
        k.add(new THREE.BoxGeometry(3.4, 1.4, 3.4), dark, x, 0.5, z);
        for (const s of [-1, 1]) k.add(new THREE.CylinderGeometry(0.55, 0.65, 2.4, 10), stone, x + s * 0.7, 2.4, z, 0, 0, (r() - 0.5) * 0.05, 0);
        k.solid(3.4, 3.6, 3.4, x, 1.6, z);
      } else if (i === 1) {
        // The head, on its side, crowned.
        // A bearded king's face under a crowned helm, lying on one cheek.
        const head = new THREE.Group();
        const part = (g: THREE.BufferGeometry, mat: THREE.Material, px: number, py: number, pz: number, rx = 0, ry = 0, rz = 0) => {
          const mesh = new THREE.Mesh(g, mat);
          mesh.position.set(px, py, pz);
          mesh.rotation.set(rx, ry, rz);
          head.add(mesh);
        };
        part(new THREE.SphereGeometry(1.0, 16, 12).scale(1, 1.2, 1.05), stone, 0, 0, 0);
        part(new THREE.BoxGeometry(1.5, 0.22, 0.4), stone, 0, 0.32, 0.86, -0.2);
        part(new THREE.ConeGeometry(0.2, 0.75, 4).rotateX(-Math.PI / 2 + 0.35), stone, 0, -0.05, 1.12, 0, Math.PI / 4);
        for (const sx of [-1, 1]) part(new THREE.SphereGeometry(0.13, 8, 6), dark, sx * 0.36, 0.14, 0.95);
        part(new THREE.BoxGeometry(0.6, 0.08, 0.12), dark, 0, -0.42, 1.0);
        part(new THREE.ConeGeometry(0.75, 1.3, 10).rotateX(Math.PI), stone, 0, -1.05, 0.55, 0.35);
        part(new THREE.SphereGeometry(1.08, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.85, 1.05), dark, 0, 0.42, -0.05);
        part(new THREE.TorusGeometry(1.05, 0.1, 6, 20).rotateX(Math.PI / 2), dark, 0, 0.42, -0.02);
        for (let j = 0; j < 7; j++) {
          const a = -Math.PI / 2 + ((j - 3) / 7) * Math.PI * 1.4;
          part(new THREE.ConeGeometry(0.13, 0.5, 4), dark, Math.cos(a) * 0.98, 0.72, -Math.sin(a) * 0.98 - 0.02);
        }
        head.rotation.set(0.25, r() * 0.6, Math.PI / 2 - 0.3);
        head.position.y = 1.0;
        const holder = new THREE.Group();
        holder.add(head);
        k.addObject(holder, x, 0, z, r() * Math.PI * 2);
        k.post(1.2, 2, x, z);
      } else if (i === 2) {
        k.add(new THREE.BoxGeometry(2.6, 3.4, 1.6), stone, x, 0.6, z, r() * 3, Math.PI / 2 - 0.2, 0.3);
        k.solid(3.4, 1.8, 2.6, x, 0.8, z);
      } else if (i === 3) {
        k.add(new THREE.SphereGeometry(0.6, 10, 8), stone, x, 0.4, z, 0, 0, 0, 0);
        k.add(new THREE.BoxGeometry(0.25, 0.25, 4.2), dark, x, 0.25, z + 2.2, 0.2, 0, 0, 0);
        k.add(new THREE.BoxGeometry(1.4, 0.2, 0.25), dark, x, 0.4, z + 0.3, 0.2);
      } else {
        k.add(new THREE.CylinderGeometry(1.6, 1.6, 0.3, 18), stone, x, 0.4, z, r(), 1.2, 0.2, 0);
      }
      // Grass and rubble round each piece.
      for (let j = 0; j < 3; j++) k.add(rockGeo(r, 0.3, 0.2, 0.3, 0), dark, x + (r() - 0.5) * 4, 0.05, z + (r() - 0.5) * 4, 0, 0, 0, 0);
      pieces.push({
        at: k.at(x, z, 0.8), radius: i === 0 ? 3.5 : 3,
        label: () => (kv['p' + i] ? `You've found ${names[i]}` : `Examine ${names[i]}`),
        enabled: () => !kv['p' + i],
        act: () => {
          kv['p' + i] = true;
          const found = [0, 1, 2, 3, 4].filter((j) => kv['p' + j]).length;
          if (i === 0) c.hooks.toast(S.line);
          c.hooks.toast(`Pieces of ${S.name} found: ${found} of 5.`);
          c.hooks.xp(20);
          if (found === 5) {
            c.hooks.give(S.reward, 1);
            c.hooks.gold(150);
            c.hooks.xp(200);
            c.hooks.toast(`You have found every piece of ${S.name}. Under the shield, wrapped in rotted oilcloth, someone left a rune.`);
            c.finish();
          }
        },
      });
    });
    return { actions: pieces };
  },
};

// ---- Signal beacon ----------------------------------------------------------------------------

/**
 * A stone beacon on a hilltop: a round tower stump with an iron brazier full
 * of wood on top. Light it and the whole country round about is drawn on your
 * map; the beasts see it too, and stay off Elder Glen for a night.
 */
export const BEACON: SiteType = {
  kind: 'beacon', label: 'Signal Beacon', glyph: '♨', color: '#ffb060', count: 8, clear: 8,
  habitats: ['hills', 'mountain', 'meadow'],
  score: (_x, _z, h) => Math.min(1, 0.1 + h / 25),
  build(c) {
    const k = c.kit, m = k.m;
    k.add(new THREE.CylinderGeometry(1.5, 1.9, 3.2, 10), m.stone, 0, 1.4, 0);
    k.post(1.8, 3.2, 0, 0);
    // A stair of blocks up one side.
    for (let i = 0; i < 6; i++) k.add(new THREE.BoxGeometry(0.9, 0.5, 0.6), m.stone, 2.0, 0.25 + i * 0.5, -1.5 + i * 0.55, 0);
    const iron = col(0x2a2826, 0.6, { metal: 0.6 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      k.add(new THREE.BoxGeometry(0.06, 1.2, 0.06), iron, Math.cos(a) * 0.9, 3.6, Math.sin(a) * 0.9, 0, 0, -Math.cos(a) * 0.25 * 0 + 0, 0);
    }
    k.add(new THREE.TorusGeometry(1.0, 0.05, 4, 16).rotateX(Math.PI / 2), iron, 0, 3.9, 0, 0, 0, 0, 0);
    for (let i = 0; i < 6; i++) k.add(new THREE.CylinderGeometry(0.08, 0.1, 1.6, 5), m.bark, 0, 3.4, 0, (i / 6) * Math.PI, 0.5, 0, 0);
    const st = c.state;
    const lit = () => st.day !== undefined && c.hooks.day() - st.day <= 1;
    if (lit()) k.fire(0, 3.5, 0, 1.8);
    return {
      actions: [{
        at: k.at(2.0, 0.8, 0.5), radius: 3.2,
        label: () => (lit() ? 'The beacon is burning' : 'Light the beacon'),
        enabled: () => !lit(),
        act: () => {
          st.day = c.hooks.day();
          k.fire(0, 3.5, 0, 1.8);
          c.hooks.reveal(c.site.x, c.site.z, 1400);
          c.hooks.calmRaids(1);
          c.hooks.xp(60);
          c.hooks.toast('The beacon catches with a roar. From up here you can see for miles, and every beast in the hills can see the fire. Nothing will come at Elder Glen tonight.');
          c.finish();
        },
      }],
    };
  },
};

// ---- Beehives and orchards --------------------------------------------------------------------

/** Straw skeps on a bench among the flowers. Honeycomb every couple of days, if you don't mind a sting. */
export const HIVES: SiteType = {
  kind: 'hives', label: 'Wild Beehives', glyph: '⬢', color: '#f0c840', count: 10, clear: 6,
  habitats: ['meadow', 'woodEdge', 'hills'],
  build(c) {
    const k = c.kit, m = k.m, r = c.rnd;
    k.add(new THREE.BoxGeometry(3.2, 0.1, 0.7), m.planks, 0, 0.55, 0);
    for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(0.1, 0.55, 0.6), m.planks, s * 1.4, 0.27, 0);
    const straw = col(0xc8a050, 1);
    for (let i = 0; i < 3; i++) {
      k.add(new THREE.SphereGeometry(0.42, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.3, 1), straw, -1 + i, 0.6, 0, 0, 0, 0, 0);
      for (let j = 0; j < 3; j++) k.add(new THREE.TorusGeometry(0.41 - j * 0.1, 0.02, 4, 16).rotateX(Math.PI / 2), col(0xa88038, 1), -1 + i, 0.72 + j * 0.15, 0, 0, 0, 0, 0);
    }
    for (let i = 0; i < 24; i++) k.add(new THREE.SphereGeometry(0.06, 5, 4), col([0xe8c040, 0xb85ae8, 0xf0f0e0][i % 3], 0.9), (r() - 0.5) * 6, 0.08, 1 + r() * 3, 0, 0, 0, 0);
    // Bees.
    const bees = new THREE.Points(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 30 }, () => new THREE.Vector3())), new THREE.PointsMaterial({ color: 0x2a2208, size: 0.05 }));
    k.live(bees);
    const hive = k.at(0, 0, 0.9);
    const st = c.state;
    let t = 0;
    return {
      actions: [{
        at: hive, radius: 2.4,
        label: () => (st.day !== undefined && c.hooks.day() - st.day < 2 ? 'The bees are rebuilding' : 'Take some honeycomb'),
        enabled: () => st.day === undefined || c.hooks.day() - st.day >= 2,
        act: () => {
          st.day = c.hooks.day();
          c.hooks.give('honeycomb', 2 + Math.floor(c.rnd() * 2));
          if (c.rnd() < 0.3) {
            c.hooks.player.hp = Math.max(1, c.hooks.player.hp - 6);
            c.hooks.toast('You get the comb, and a sting on the wrist for it.');
          } else c.hooks.toast('You lift out the comb slowly, and the bees let you.');
          c.finish();
        },
      }],
      update: (dt) => {
        t += dt;
        const p = bees.geometry.getAttribute('position');
        for (let i = 0; i < p.count; i++) {
          const a = t * (1.5 + (i % 5) * 0.4) + i;
          p.setXYZ(i, hive.x + Math.cos(a) * (0.5 + (i % 7) * 0.2), hive.y + 0.6 + Math.sin(a * 1.7) * 0.4, hive.z + Math.sin(a) * (0.5 + (i % 4) * 0.3));
        }
        p.needsUpdate = true;
      },
    };
  },
};

/** An old orchard gone wild: rows of gnarled apple and pear trees, a fallen ladder. Fruit every few days. */
export const ORCHARD: SiteType = {
  kind: 'orchard', label: 'Wild Orchard', glyph: '♣', color: '#88d070', count: 8, clear: 16,
  habitats: ['meadow', 'woodEdge', 'hills'],
  build(c) {
    const k = c.kit, m = k.m, r = c.rnd;
    const leaf = col(0x4a7a2a, 1), leaf2 = col(0x5a8a32, 1);
    const pears = c.site.n % 2 === 1;
    const fruit = col(pears ? 0xb8b040 : 0xc83828, 0.6);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      if (r() < 0.15) continue;
      const x = -7 + i * 7 + (r() - 0.5), z = -7 + j * 7 + (r() - 0.5);
      k.add(new THREE.CylinderGeometry(0.14, 0.22, 2.0, 7), m.bark, x, 1.0, z, 0, (r() - 0.5) * 0.2, (r() - 0.5) * 0.2, 0);
      const blobs: [number, number, number, number][] = [];
      for (let b = 0; b < 3; b++) {
        const rad = 1.1 + r() * 0.4, bx = x + (r() - 0.5) * 1.4, by = 2.4 + r() * 0.6, bz = z + (r() - 0.5) * 1.4;
        blobs.push([bx, by, bz, rad]);
        k.add(new THREE.IcosahedronGeometry(rad, 1), b % 2 ? leaf : leaf2, bx, by, bz, r() * 3, 0, 0, 0);
      }
      // Fruit hanging on the outside of the canopy, mostly round its sides and underneath.
      for (let f = 0; f < 16; f++) {
        const [bx, by, bz, rad] = blobs[f % 3];
        const a = r() * Math.PI * 2, el = -0.7 + r() * 1.0;
        const d = rad * 0.93;
        k.add(new THREE.SphereGeometry(0.11, 6, 5), fruit, bx + Math.cos(a) * Math.cos(el) * d, by + Math.sin(el) * d, bz + Math.sin(a) * Math.cos(el) * d, 0, 0, 0, 0);
      }
      for (let f = 0; f < 3; f++) k.add(new THREE.SphereGeometry(0.08, 6, 5), fruit, x + (r() - 0.5) * 2, 0.06, z + (r() - 0.5) * 2, 0, 0, 0, 0);
      k.post(0.25, 2, x, z);
    }
    // A fallen ladder.
    for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(0.06, 0.06, 3), m.timber, 1 + s * 0.25, 0.05, 2, 0.4);
    for (let i = 0; i < 6; i++) k.add(new THREE.BoxGeometry(0.5, 0.05, 0.05), m.timber, 1, 0.08, 0.8 + i * 0.45, 0.4);
    const st = c.state;
    return {
      actions: [{
        at: k.at(0, 0), radius: 6,
        label: () => (st.day !== undefined && c.hooks.day() - st.day < 3 ? 'Nothing ripe yet' : pears ? 'Pick pears' : 'Pick apples'),
        enabled: () => st.day === undefined || c.hooks.day() - st.day >= 3,
        act: () => {
          st.day = c.hooks.day();
          const n = 4 + Math.floor(c.rnd() * 4);
          c.hooks.give(pears ? 'pear' : 'apple', n);
          c.hooks.toast(`You fill your pack with ${n} ${pears ? 'pears' : 'apples'}.`);
          c.finish();
        },
      }],
    };
  },
};

export const BATCH2: SiteType[] = [WELL, GRAVES, HIDEOUT, HERMIT, BRIDGE, STATUE, BEACON, HIVES, ORCHARD];
void heightAt;
