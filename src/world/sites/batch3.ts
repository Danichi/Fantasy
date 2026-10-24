import * as THREE from 'three';
import { col, rockGeo } from './kit';
import { loot } from './batch1';
import { Wolf, Pack } from '../../creatures/wolf/wolf';
import { Undead } from '../../enemies/undead';
import type { SiteAction, SiteCtx, SiteFoe, SiteType } from './types';

// The third batch: the lost champion's three camps, Dark scars, fallen
// stars, ruined chapels, fairy rings, spring grottos and hollow great trees.

function undeadFoe(u: Undead, crowd: Undead[]): SiteFoe {
  crowd.push(u);
  return { get alive() { return u.alive; }, update: (dt, p) => u.update(dt, p, crowd), dispose: () => u.dispose() };
}

// ---- The lost champion's camps ---------------------------------------------------------------

/** What she wrote, camp by camp. */
export const CHAMPION_PAGES = [
  'The voice said I was chosen. It said it like a gift. I woke in a field with a sword I had never held and knew how to use it, and a name for a country I had never heard of: Cresha. I am writing this down so I remember that I had a life before. I had a life before.',
  'There are others. Not from my voice: a man with a wheel on his shield who would not say who sent him, and a woman who fought like she had been doing it for a hundred years. They are not my friends. The voice says the others are my rivals for "the chair". I asked what chair. It did not answer. I have started carving the wheel on the stones where I sleep, the right way round, because somewhere out here someone has carved it backwards.',
  'I was the first. I will not be the last; it as good as told me so. If you are reading this you were called too, and you are further along the same road. Listen: the one who calls you is not your friend, and not your enemy. It wants the chair, and it will spend you to get it. Take my sword. It was given to me; I give it to you, freely, which is more than either of us got.',
];

/**
 * The first champion's trail: three old camps, a few days' walk apart. A cold
 * fire, a rotted bedroll, her things, and a page of her journal at each; the
 * last is her grave, with her sword planted on it. Each page marks the next
 * camp on your map.
 */
export const CHAMPION: SiteType = {
  kind: 'championCamp', label: "A Lost Champion's Camp", glyph: '✦', color: '#ffd0f0', count: 3, clear: 10,
  habitats: ['forest', 'woodEdge', 'hills', 'meadow'],
  minFar: 700,
  name: (s) => (s.n === 2 ? "The First Champion's Grave" : "A Lost Champion's Camp"),
  build(c) {
    const k = c.kit, m = k.m, r = c.rnd, n = c.site.n;
    const st = c.state;
    // Cold fire, a rotted bedroll, a broken lean-to.
    k.campfire(0, 0, 1, false);
    k.add(new THREE.BoxGeometry(0.8, 0.08, 1.9), col(0x4a4038, 1), 2, 0.04, -0.5, 0.3);
    for (const s of [-1, 1]) k.add(new THREE.CylinderGeometry(0.05, 0.06, 1.9, 5), m.bark, 2 + s * 1.1, 0.9, -2, 0, 0, s * 0.15);
    k.add(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 5), m.bark, 2, 0.7, -2.6, 0, 0, Math.PI / 2 + 0.3);
    // The wheel carved on a stone, the right way round.
    k.add(rockGeo(r, 0.7, 0.6, 0.5), m.stone, -2.5, 0.35, -1.5, 0, 0, 0, 0);
    const wheel = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.24, 16), col(0xd8c088, 0.8, { emissive: 0xffc860, ei: 0.3, side: THREE.DoubleSide }));
    wheel.position.copy(k.at(-2.5, -1.05, 0.5));
    wheel.rotation.y = c.site.yaw;
    k.live(wheel);
    let sword: THREE.Object3D | null = null;
    if (n === 2) {
      // Her grave: a long cairn, and her sword standing in it.
      for (let i = 0; i < 18; i++) k.add(rockGeo(r, 0.3, 0.22, 0.3, 0), col(0x8a867e, 0.95), -0.6 + (i % 3) * 0.6, 0.1 + Math.floor(i / 9) * 0.25, 2.2 + Math.floor(i / 3) % 3 * 0.6, 0, 0, 0, 0);
      if (!st.done) {
        const blade = new THREE.Group();
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 0.012).translate(0, 0.5, 0), col(0xd8e0f0, 0.25, { metal: 0.9, emissive: 0xffe8c0, ei: 0.15 }));
        const g = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.05), col(0xc8a050, 0.4, { metal: 0.8 }));
        g.position.y = 1.0;
        const h = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 6), col(0x3a2a1a, 0.8));
        h.position.y = 1.12;
        blade.add(b, g, h);
        blade.position.copy(k.at(0, 2.8, 0.15));
        blade.rotation.set(0.1, c.site.yaw, 0.05);
        sword = k.live(blade);
      }
    } else {
      // Her pack, a broken spear.
      k.add(new THREE.BoxGeometry(0.45, 0.55, 0.3), col(0x5a4a32, 1), 1.2, 0.27, 1.4, 0.4);
      k.add(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 5), m.timber, -1.3, 0.04, 1.6, 0.7, Math.PI / 2, 0);
    }
    const kv = (st.k ??= {});
    return {
      actions: [{
        at: k.at(0.5, n === 2 ? 2 : 1), radius: 3.2,
        label: () => (kv.read ? 'Read her journal page again' : n === 2 ? 'Read the page tucked under the stones' : 'Pick up the journal page'),
        act: () => {
          if (!kv.read) {
            kv.read = true;
            c.hooks.give('championPage' + (n + 1), 1);
            c.hooks.xp(80);
            const next = c.siblings().find((s) => s.n === n + 1);
            if (next) c.markSeen(next.id);
          }
          const tail = n < 2 ? ' On the back, a rough map: another camp, a few days on. It is on your map now.' : '';
          c.hooks.talk('A Journal Page', `The first champion (${n + 1} of 3)`, CHAMPION_PAGES[n] + tail, [{ label: 'Put it away.', run: () => {} }]);
          if (n === 2 && !st.done) {
            c.hooks.give('firstlight', 1);
            c.hooks.toast('You draw her sword out of the cairn. It comes easily, as if it had been waiting. Firstlight.');
            if (sword) sword.visible = false;
          }
          c.finish();
        },
      }],
    };
  },
};

// ---- Dark scars -------------------------------------------------------------------------------

/**
 * A place where the Dark leaks through: a blackened patch of dead grass, cold
 * underfoot, violet motes rising, and a jagged violet crystal pulsing at its
 * heart. Touch it and the things on the other side notice. Kill them and the
 * crystal shatters; its shards are worth a great deal to a runesmith.
 */
export const DARKSCAR: SiteType = {
  kind: 'darkScar', label: 'Dark Scar', glyph: '✷', color: '#b070ff', count: 8, clear: 10,
  habitats: ['meadow', 'forest', 'woodEdge', 'hills', 'deepForest', 'marsh'],
  minFar: 900,
  build(c) {
    const k = c.kit, r = c.rnd;
    const st = c.state;
    const dead = col(0x1a1418, 1), ash = col(0x2a2430, 1);
    // The blackened ground: a lumpy disc of dead earth.
    k.add(new THREE.CircleGeometry(6, 24).rotateX(-Math.PI / 2), dead, 0, 0.04, 0, 0, 0, 0, 0);
    for (let i = 0; i < 10; i++) k.add(rockGeo(r, 0.5 + r() * 0.5, 0.15, 0.6), ash, (r() - 0.5) * 9, 0.02, (r() - 0.5) * 9, r() * 3, 0, 0, 0);
    // Withered stalks.
    for (let i = 0; i < 30; i++) k.add(new THREE.CylinderGeometry(0.005, 0.012, 0.6 + r() * 0.5, 3), col(0x3a3036, 1), (r() - 0.5) * 11, 0.3, (r() - 0.5) * 11, 0, (r() - 0.5) * 0.6, (r() - 0.5) * 0.6, 0);
    // The crystal, live (it pulses, and shatters).
    const crystal = new THREE.Group();
    const cm = new THREE.MeshStandardMaterial({ color: 0x6a2ab8, emissive: 0x9a4aff, emissiveIntensity: 1.2, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.92 });
    for (let i = 0; i < 7; i++) {
      const sh = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), cm);
      sh.scale.set(0.5, 1.6 + r() * 1.4, 0.5);
      sh.position.set((r() - 0.5) * 0.9, 0.6, (r() - 0.5) * 0.9);
      sh.rotation.set((r() - 0.5) * 0.7, r() * 3, (r() - 0.5) * 0.7);
      crystal.add(sh);
    }
    crystal.position.copy(k.at(0, 0));
    k.live(crystal);
    const light = new THREE.PointLight(0xa060ff, 3, 14, 2);
    light.position.copy(k.at(0, 0, 1.5));
    k.live(light);
    if (st.done) {
      crystal.visible = false;
      light.intensity = 0.3;
    }
    const kv = (st.k ??= {});
    let shades: { alive: boolean }[] = [];
    let t = 0;
    return {
      actions: [{
        at: k.at(0, 0, 1), radius: 2.8,
        label: () => (shades.some((s) => s.alive) ? 'Things from the other side are here' : kv.woke ? 'Shatter the crystal' : 'Touch the violet crystal'),
        enabled: () => !st.done,
        act: () => {
          if (shades.some((s) => s.alive)) return;
          if (!kv.woke && c.hooks.ready('wolf')) {
            kv.woke = true;
            const pack = new Pack();
            const lvl = c.hooks.level(c.site.x, c.site.z) + 2;
            shades = [0, 1, 2].map((i) => {
              const w = new Wolf(k.at(Math.cos(i * 2.1) * 5, Math.sin(i * 2.1) * 5), lvl, c.hooks.scene, c.hooks.fx, { pack, look: 'gloam', leader: i === 0 });
              c.spawn(w);
              return w;
            });
            c.hooks.toast('The crystal is cold enough to burn. The air tears beside it, and things with violet eyes step through.');
            return;
          }
          crystal.visible = false;
          light.intensity = 0.3;
          c.hooks.fx.add.spawn({ pos: crystal.position.clone().add(new THREE.Vector3(0, 1, 0)), spread: 2, count: 40, life: [0.5, 1.2], size: [0.14, 0.02], color: 0xb070ff, color2: 0x2a0a4a, upBias: 1, drag: 1 });
          c.hooks.give('voidCrystal', 2 + Math.floor(c.site.danger * 3));
          c.hooks.xp(160);
          c.hooks.toast('The crystal shatters. The cold goes out of the ground. You gather the shards: violet, and humming faintly.');
          c.finish();
        },
      }],
      update: (dt) => {
        if (!crystal.visible) return;
        t += dt;
        cm.emissiveIntensity = 1.0 + Math.sin(t * 2.2) * 0.4;
        light.intensity = 2.6 + Math.sin(t * 2.2) * 0.8;
        if (Math.random() < dt * 6) c.hooks.fx.add.spawn({ pos: crystal.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, 0.2, (Math.random() - 0.5) * 8)), spread: 0.2, count: 1, life: [1, 2], size: [0.1, 0.02], color: 0x8a4aff, color2: 0x10061a, upBias: 0.6, drag: 1 });
      },
    };
  },
};

// ---- Fallen star ------------------------------------------------------------------------------

/**
 * A crater where something fell from the sky: a ring of thrown-up earth, a
 * scorched bowl, smoke, and a black-and-silver stone still warm in the middle.
 * With a pick you can break starmetal out of it, once.
 */
export const FALLENSTAR: SiteType = {
  kind: 'fallenStar', label: 'Fallen Star', glyph: '☄', color: '#c8e8ff', count: 4, clear: 14,
  habitats: ['meadow', 'hills', 'woodEdge', 'mountain'],
  minFar: 800,
  build(c) {
    const k = c.kit, r = c.rnd;
    const st = c.state;
    const earth = col(0x5a4a38, 1), burnt = col(0x2a2420, 1);
    // The thrown-up rim, and the scorched bowl.
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      k.add(rockGeo(r, 1.4, 0.6, 1.0, 1), earth, Math.cos(a) * 7, 0.15, Math.sin(a) * 7, -a, 0, 0, 0);
    }
    k.add(new THREE.CircleGeometry(6.4, 24).rotateX(-Math.PI / 2), burnt, 0, 0.05, 0, 0, 0, 0, 0);
    for (let i = 0; i < 12; i++) k.add(new THREE.CylinderGeometry(0.06, 0.1, 1.2 + r(), 5), col(0x1a1612, 1), (r() - 0.5) * 18, 0.4, (r() - 0.5) * 18, r() * 3, Math.PI / 2 - 0.2, 0, 0);
    // The star.
    const star = new THREE.Mesh(rockGeo(r, 1.0, 0.75, 0.9, 1), new THREE.MeshStandardMaterial({ color: 0x3a3634, metalness: 0.6, roughness: 0.55, flatShading: true, emissive: 0x6a9aff, emissiveIntensity: st.done ? 0 : 0.05 }));
    // Smoke still curls off it; the ground round it is scorched black and glassy.
    k.add(new THREE.CircleGeometry(3.2, 20).rotateX(-Math.PI / 2), col(0x14120f, 0.4), 0, 0.07, 0, 0, 0, 0, 0);
    star.position.copy(k.at(0, 0, 0.4));
    k.live(star);
    k.post(0.9, 1.4, 0, 0);
    const veins: THREE.Mesh[] = [];
    if (!st.done) for (let i = 0; i < 9; i++) {
      const v = new THREE.Mesh(new THREE.OctahedronGeometry(0.1 + r() * 0.08, 0).scale(0.6, 1.6, 0.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.8, 2.6) }));
      const a = r() * Math.PI * 2, h = r();
      v.position.copy(k.at(Math.cos(a) * 0.95, Math.sin(a) * 0.82, 0.25 + h * 0.75));
      v.rotation.set(r() * 3, r() * 3, r() * 3);
      k.live(v);
      veins.push(v);
    }
    let t = 0;
    return {
      actions: [{
        at: k.at(0, 0, 1), radius: 2.8,
        label: () => (c.hooks.count('miningPick') > 0 ? 'Break starmetal out of the fallen star' : 'You\'d need a mining pick for this'),
        enabled: () => !st.done,
        act: () => {
          if (c.hooks.count('miningPick') <= 0) return c.hooks.toast('The stone is harder than anything you\'ve touched. You\'d need a mining pick.');
          c.hooks.give('starmetal', 2 + Math.floor(r() * 2));
          c.hooks.xp(150);
          (star.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
          for (const v of veins) v.visible = false;
          c.hooks.toast('Sparks fly blue. You break away a few lumps of starmetal, still warm, lighter than they should be.');
          c.finish();
        },
      }],
      update: (dt) => {
        if (st.done) return;
        t += dt;
        if (Math.random() < dt * 4) c.hooks.fx.add.spawn({ pos: star.position.clone().add(new THREE.Vector3(0, 0.8, 0)), spread: 0.6, count: 1, life: [1.5, 3], size: [0.4, 0.9], color: 0x6a6460, color2: 0x2a2826, upBias: 0.6, drag: 0.5, alpha: 0.4 } as never);
      },
    };
  },
};

/** The hollow trees' bark, seen from inside too. */
let hollowBark: THREE.Material | null = null;

// ---- Ruined chapel ----------------------------------------------------------------------------

/**
 * A roofless chapel of the Dawn: its walls still up to the window arches, a
 * stone altar, a lectern with a hymn page under glass long broken, and a bell
 * hung in a frame by the door. Ring it by day for a blessing. At night the
 * dead in the yard hear it too.
 */
export const CHAPEL: SiteType = {
  kind: 'chapel', label: 'Ruined Chapel', glyph: '⛪', color: '#ffe0b0', count: 6, clear: 16,
  habitats: ['meadow', 'hills', 'woodEdge'],
  build(c) {
    const k = c.kit, m = k.m, r = c.rnd;
    const st = c.state;
    const W = 6, L = 11;
    // The nave walls in bays, with window gaps, broken off.
    for (const s of [-1, 1]) for (let i = 0; i < 5; i++) {
      const z = -L / 2 + 1.1 + i * 2.2;
      const h = 3.2 + r() * 1.6;
      k.add(new THREE.BoxGeometry(0.6, 1.4, 2.2), m.stone, s * W / 2, 0.6, z);
      k.add(new THREE.BoxGeometry(0.6, h - 1.4, 0.6), m.stone, s * W / 2, 1.3 + (h - 1.4) / 2, z - 0.8);
      k.add(new THREE.BoxGeometry(0.6, h - 1.4, 0.6), m.stone, s * W / 2, 1.3 + (h - 1.4) / 2, z + 0.8);
      if (r() > 0.4) k.add(new THREE.TorusGeometry(0.5, 0.18, 4, 8, Math.PI), m.stone, s * W / 2, h - 0.2, z, Math.PI / 2, 0, 0);
      k.solid(0.6, h, 2.2, s * W / 2, h / 2, z);
    }
    // The east end with a round window; the west front with a door gap.
    k.add(new THREE.BoxGeometry(W + 0.6, 5.5, 0.6), m.stone, 0, 2.6, -L / 2);
    k.solid(W + 0.6, 5.5, 0.6, 0, 2.6, -L / 2);
    k.add(new THREE.TorusGeometry(0.7, 0.14, 6, 16), col(0x2a2620, 1), 0, 3.9, -L / 2 + 0.31, 0, 0, 0, 0);
    for (const s of [-1, 1]) {
      k.add(new THREE.BoxGeometry(2.2, 3.8, 0.6), m.stone, s * 2.0, 1.8, L / 2);
      k.solid(2.2, 3.8, 0.6, s * 2.0, 1.8, L / 2);
    }
    // Altar, broken pews, the lectern.
    k.add(new THREE.BoxGeometry(2.0, 1.0, 0.9), m.stone, 0, 0.5, -L / 2 + 1.4);
    k.add(new THREE.BoxGeometry(2.2, 0.12, 1.1), col(0xc8c0b0, 0.8), 0, 1.04, -L / 2 + 1.4);
    for (let i = 0; i < 6; i++) k.add(new THREE.BoxGeometry(2.0, 0.08, 0.4), m.planks, (i % 2 ? 1 : -1) * 1.4, 0.4, -1.5 + Math.floor(i / 2) * 1.6, (r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4);
    k.add(new THREE.CylinderGeometry(0.08, 0.12, 1.1, 6), m.timber, 1.6, 0.55, -L / 2 + 2.6);
    k.add(new THREE.BoxGeometry(0.6, 0.06, 0.45), m.timber, 1.6, 1.15, -L / 2 + 2.6, 0, -0.4, 0);
    // The bell in its frame, outside the door.
    for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(0.16, 3.2, 0.16), m.timber, 4.2 + s * 0.8, 1.6, L / 2 + 2);
    k.add(new THREE.BoxGeometry(1.9, 0.16, 0.16), m.timber, 4.2, 3.1, L / 2 + 2);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.42, 0.65, 14, 1, true), col(0x8a6a3a, 0.4, { metal: 0.8, side: THREE.DoubleSide }));
    const bellPivot = new THREE.Group();
    bell.position.y = -0.4;
    bellPivot.add(bell);
    bellPivot.position.copy(k.at(4.2, L / 2 + 2, 3.0));
    bellPivot.rotation.y = c.site.yaw;
    k.live(bellPivot);
    // Graves in the yard.
    const graves: THREE.Vector3[] = [];
    for (let i = 0; i < 5; i++) {
      const x = -6 - (i % 2) * 2, z = -3 + i * 2;
      k.add(new THREE.BoxGeometry(0.5, 0.8, 0.12), col(0x8a8a86, 0.95), x, 0.35, z, (r() - 0.5) * 0.3, (r() - 0.5) * 0.2, (r() - 0.5) * 0.2);
      graves.push(k.at(x + 0.9, z));
    }
    const kv = (st.k ??= {});
    const crowd: Undead[] = [];
    let swing = 0;
    return {
      actions: [
        {
          at: k.at(1.6, -L / 2 + 2.6, 1), radius: 2.2,
          label: () => 'Read the hymn on the lectern',
          act: () => {
            c.hooks.talk('A Hymn of the Dawn', 'On the lectern, half rotted', 'Turn, turn, the wheel of day; / the long night will not stay. / Eight to keep and one to see, / and the door shut fast for thee. / When the old one\'s eye is closed, / keep the wheel as it was posed.', [{ label: 'Close the book.', run: () => {} }]);
            if (!kv.read) {
              kv.read = true;
              c.hooks.xp(40);
            }
            c.finish();
          },
        },
        {
          at: k.at(4.2, L / 2 + 2, 1), radius: 2.4,
          label: () => 'Ring the chapel bell',
          act: () => {
            swing = 1;
            const h = c.hooks.hour();
            if (h >= 21 || h < 5) {
              if (kv.rang !== c.hooks.day()) {
                kv.rang = c.hooks.day();
                for (let i = 0; i < 3; i++) c.spawn(undeadFoe(new Undead('skeleton', graves[i % graves.length].clone(), c.site.yaw, c.hooks.scene, c.hooks.fx), crowd));
                c.hooks.toast('The bell booms out into the dark, and in the yard the earth heaves. The dead come to the call.');
              }
              return;
            }
            if (st.day === c.hooks.day()) return c.hooks.toast('The bell rings out. You have already had the chapel\'s blessing today.');
            st.day = c.hooks.day();
            c.hooks.bless({ id: 'chapelBell', label: 'The bell of the Dawn: you take less damage, healing does more', sec: 600, m: { dmgTaken: -0.06, heal: 0.2 } });
          },
        },
      ],
      update: (dt) => {
        swing = Math.max(0, swing - dt * 0.4);
        bellPivot.rotation.x = Math.sin(performance.now() / 260) * 0.5 * swing;
      },
    };
  },
};

// ---- Fairy rings -------------------------------------------------------------------------------

/**
 * A ring of red-capped mushrooms in the grass, faintly glowing. At dusk the
 * ring wakes: step in and you step out of another ring somewhere else in
 * Cresha. The first time, the fair folk leave you a little luck.
 */
export const FAIRYRING: SiteType = {
  kind: 'fairyRing', label: 'Fairy Ring', glyph: '❀', color: '#f0a0e0', count: 6, clear: 6,
  habitats: ['meadow', 'woodEdge', 'forest', 'deepForest'],
  build(c) {
    const k = c.kit;
    const st = c.state;
    const cap = new THREE.MeshStandardMaterial({ color: 0xc83030, roughness: 0.5, emissive: 0xff60c0, emissiveIntensity: 0.15 });
    const stem = col(0xe8e0cc, 0.7);
    const caps: THREE.Object3D[] = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const g = new THREE.Group();
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.22, 6).translate(0, 0.11, 0), stem);
      const cp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), cap);
      cp.position.y = 0.2;
      cp.scale.y = 0.7;
      g.add(s, cp);
      g.position.copy(k.at(Math.cos(a) * 2.6, Math.sin(a) * 2.6));
      g.scale.setScalar((0.8 + Math.sin(i * 7.3) * 0.3) * 1.7);
      k.live(g);
      caps.push(g);
    }
    // The ring itself: a band of darker, lusher grass where the mushrooms grow.
    k.add(new THREE.RingGeometry(2.2, 3.0, 36).rotateX(-Math.PI / 2), col(0x2a5a22, 1), 0, 0.05, 0, 0, 0, 0, 0);
    const glow = new THREE.PointLight(0xff80e0, 0, 8, 2);
    glow.position.copy(k.at(0, 0, 0.6));
    k.live(glow);
    const dusk = () => {
      const h = c.hooks.hour();
      return h >= 18 && h < 21.5;
    };
    let t = 0;
    return {
      actions: [{
        at: k.at(0, 0, 0.5), radius: 2.6,
        label: () => (dusk() ? 'Step into the ring' : 'The ring is quiet; it wakes at dusk'),
        act: () => {
          if (!dusk()) return c.hooks.toast('Nothing happens. The old stories say the rings only wake at dusk.');
          const rings = c.siblings().filter((s) => s.id !== c.site.id);
          const to = rings[(c.hooks.day() + c.site.n) % rings.length];
          c.markSeen(to.id);
          c.hooks.teleport(new THREE.Vector3(to.x + 1, to.y + 0.3, to.z + 1));
          if (!st.done) {
            c.hooks.bless({ id: 'feyLuck', label: 'Fey luck: your blows find the weak places', sec: 900, m: { crit: 0.06 } });
            c.finish();
          }
          c.hooks.toast('The world tips over sideways, and the grass under your feet is different grass.');
        },
      }],
      update: (dt) => {
        t += dt;
        const on = dusk() ? 1 : 0;
        cap.emissiveIntensity += ((on ? 0.9 + Math.sin(t * 3) * 0.3 : 0.15) - cap.emissiveIntensity) * Math.min(1, dt * 2);
        glow.intensity = on * (1.6 + Math.sin(t * 2) * 0.4);
        if (on && Math.random() < dt * 5) c.hooks.fx.add.spawn({ pos: k.at(Math.cos(t) * 2.6, Math.sin(t * 1.3) * 2.6, 0.3), spread: 0.4, count: 1, life: [1, 2], size: [0.08, 0.01], color: 0xffa0f0, color2: 0x8040ff, upBias: 0.6, drag: 1 });
      },
    };
  },
};

// ---- Spring grotto ----------------------------------------------------------------------------

/**
 * A little cliff of mossy rock with a spring falling down it into a clear
 * pool, ferns all round. Bathe in it and you come out mended and lighter on
 * your feet. Behind the falling water, someone once hid something.
 */
export const SPRING: SiteType = {
  kind: 'spring', label: 'Spring Grotto', glyph: '♒', color: '#80d8ff', count: 6, clear: 12,
  habitats: ['forest', 'woodEdge', 'hills', 'deepForest'],
  build(c) {
    const k = c.kit, m = k.m, r = c.rnd;
    const st = c.state;
    // The rock face behind, in big mossy blocks.
    for (let i = 0; i < 7; i++) {
      const x = -4 + i * 1.35;
      k.add(rockGeo(r, 1.2, 2.2 + r() * 1.2, 1.2, 1), m.stone, x, 1.2, -3.2 - Math.abs(x) * 0.2, r() * 3, 0, 0, 0);
    }
    k.solid(9, 4, 2.4, 0, 2, -3.6);
    const moss = col(0x3e6a2a, 1);
    for (let i = 0; i < 12; i++) k.add(rockGeo(r, 0.5, 0.15, 0.4, 0), moss, -4 + r() * 8, 2.6 + r() * 1.5, -2.6 - r(), 0, 0, 0, 0);
    // The pool, its stones, ferns.
    const water = new THREE.Mesh(new THREE.CircleGeometry(2.6, 24).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a8aa8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.75 }));
    water.position.copy(k.at(0, -0.3, 0.12));
    k.live(water);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      k.add(rockGeo(r, 0.4, 0.25, 0.35, 0), m.stone, Math.cos(a) * 2.8, 0.05, -0.3 + Math.sin(a) * 2.8, 0, 0, 0, 0);
    }
    for (let i = 0; i < 16; i++) {
      const a = r() * Math.PI * 2, d = 3.4 + r() * 2;
      for (let f = 0; f < 4; f++) k.add(new THREE.PlaneGeometry(0.25, 0.9).translate(0, 0.45, 0), col(0x4a8a3a, 1, { side: THREE.DoubleSide }), Math.cos(a) * d, 0, Math.sin(a) * d, f * 1.6, 0.6, 0, 0);
    }
    // The falling water: a strip that scrolls.
    const fallTex = (() => {
      const cv = document.createElement('canvas');
      cv.width = 32;
      cv.height = 128;
      const g = cv.getContext('2d')!;
      g.fillStyle = 'rgba(200,235,255,0.35)';
      g.fillRect(0, 0, 32, 128);
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.5})`;
        g.fillRect(Math.random() * 32, Math.random() * 128, 2, 10 + Math.random() * 20);
      }
      const t = new THREE.CanvasTexture(cv);
      t.wrapT = THREE.RepeatWrapping;
      return t;
    })();
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 3.6), new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, depthWrite: false }));
    fall.position.copy(k.at(0, -2.0, 1.8));
    fall.rotation.y = c.site.yaw;
    k.live(fall);
    const kv = (st.k ??= {});
    return {
      actions: [
        {
          at: k.at(0, 0.2, 0.5), radius: 3,
          label: () => (st.day === c.hooks.day() ? 'You have bathed here today' : 'Bathe in the spring'),
          act: () => {
            if (st.day === c.hooks.day()) return c.hooks.toast('The water is just as cold as it was this morning.');
            st.day = c.hooks.day();
            c.hooks.player.hp = c.hooks.player.maxHp;
            c.hooks.player.stamina = c.hooks.player.maxStamina;
            c.hooks.bless({ id: 'spring', label: 'Spring water: lighter on your feet, tougher', sec: 600, m: { staminaRegen: 0.25, hp: 20 } });
            c.finish();
          },
        },
        {
          at: k.at(0, -1.8, 0.8), radius: 2,
          label: () => 'Reach in behind the falling water',
          enabled: () => !kv.cache,
          act: () => {
            kv.cache = true;
            c.hooks.toast(`Behind the falls, in a dry cleft, an oilcloth bundle: ${loot(c, 'chest')}.`);
          },
        },
      ],
      update: (dt) => {
        fallTex.offset.y -= dt * 1.4;
      },
    };
  },
};

// ---- Hollow great tree ------------------------------------------------------------------------

/**
 * An enormous old tree, hollow, with a split in the trunk you could walk
 * into. Climb up inside to a great nest in the crown: eggs, and the bright
 * things a magpie-minded bird has stolen over the years.
 */
export const HOLLOWTREE: SiteType = {
  kind: 'hollowTree', label: 'Hollow Great Tree', glyph: '♠', color: '#90c070', count: 6, clear: 12,
  habitats: ['forest', 'deepForest', 'woodEdge'],
  build(c) {
    const k = c.kit, r = c.rnd;
    const st = c.state;
    const bark = col(0x4a3a2a, 1), leaf = col(0x3a6a2a, 1), leaf2 = col(0x4a7a30, 1);
    // The trunk: a wide flared cylinder with a split in front.
    const trunk = new THREE.CylinderGeometry(1.6, 2.4, 13, 14, 6, true, 0.35, Math.PI * 2 - 0.7);
    const p = trunk.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), a = Math.atan2(p.getZ(i), p.getX(i));
      const k2 = 1 + Math.sin(a * 5 + y * 0.4) * 0.08;
      p.setXYZ(i, p.getX(i) * k2, y, p.getZ(i) * k2);
    }
    trunk.rotateY(Math.PI / 2);
    trunk.computeVertexNormals();
    if (!hollowBark) {
      hollowBark = (k.m.bark as THREE.MeshStandardMaterial).clone();
      hollowBark.side = THREE.DoubleSide;
    }
    k.add(trunk, hollowBark, 0, 6.3, 0, 0, 0, 0, 2);
    // Roots, flaring out.
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      k.add(new THREE.CylinderGeometry(0.15, 0.55, 4, 6), k.m.bark, Math.cos(a) * 2.4, 0.4, Math.sin(a) * 2.4, -a, 0, Math.PI / 2 - 0.25, 1.5);
    }
    // Colliders round the trunk (leaving the split open).
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.5) continue;
      k.solid(1.4, 12, 0.4, Math.cos(a) * 2.0, 6, Math.sin(a) * 2.0, Math.PI / 2 - a);
    }
    // Great limbs and the crown.
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      k.add(new THREE.CylinderGeometry(0.3, 0.6, 7, 7), bark, Math.cos(a) * 2.8, 13, Math.sin(a) * 2.8, -a, 0, 0.9, 0);
    }
    for (let i = 0; i < 12; i++) {
      const a = r() * Math.PI * 2, d = 2 + r() * 5;
      k.add(new THREE.IcosahedronGeometry(2.2 + r() * 1.4, 1), i % 2 ? leaf : leaf2, Math.cos(a) * d, 15 + r() * 4, Math.sin(a) * d, r() * 3, 0, 0, 0);
    }
    // The nest at the top of the hollow.
    const ny = 12.6;
    const g0 = k.ground(0, 0);
    k.addAt(new THREE.TorusGeometry(1.2, 0.35, 6, 16).rotateX(Math.PI / 2), col(0x6a5a3a, 1), 0, g0 + ny, 0);
    k.addAt(new THREE.CircleGeometry(1.4, 16).rotateX(-Math.PI / 2), col(0x5a4a32, 1), 0, g0 + ny - 0.15, 0);
    k.solidAt(3, 0.3, 3, 0, g0 + ny - 0.3, 0);
    for (let i = 0; i < 3; i++) k.addAt(new THREE.SphereGeometry(0.12, 8, 6).scale(1, 1.3, 1), col(0xe8e0c8, 0.6), (i - 1) * 0.3, g0 + ny, 0.2, 0, 0, 0, 0);
    const top = k.at(0, 0);
    top.y = g0 + ny;
    const foot = k.at(0, 3.4);
    const kv = (st.k ??= {});
    return {
      actions: [
        { at: k.at(0, 1.6), radius: 2.4, label: () => 'Climb up inside the hollow trunk', act: () => c.hooks.teleport(top.clone().add(new THREE.Vector3(0.6, 0.1, 0))) },
        { at: top, radius: 2.2, label: () => 'Climb back down', act: () => c.hooks.teleport(foot) },
        {
          at: top.clone().add(new THREE.Vector3(0, 0.3, 0)), radius: 2,
          label: () => 'Search the great nest',
          enabled: () => !kv.nest,
          act: () => {
            kv.nest = true;
            c.hooks.give('egg', 3);
            c.hooks.toast(`In the nest, among the eggs and the bones of small things: ${loot(c, 'chest')}, and a great many buttons.`);
            c.finish();
          },
        },
      ],
    };
  },
};

export const BATCH3: SiteType[] = [CHAMPION, DARKSCAR, FALLENSTAR, CHAPEL, FAIRYRING, SPRING, HOLLOWTREE];
export type { SiteAction, SiteCtx };
