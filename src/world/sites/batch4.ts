import * as THREE from 'three';
import { col, rockGeo } from './kit';
import { loot } from './batch1';
import { Figure, Animal } from '../roadLife/actors';
import { Undead } from '../../enemies/undead';
import { Bandit, Bolts } from '../../enemies/bandit';
import { heightAt } from '../terrainHeight';
import type { Look } from '../../npc/charBuilder';
import type { SiteAction, SiteCtx, SiteFoe, SiteType } from './types';

// The fourth batch: smugglers' caches, the sealed vault and its three keys,
// lookouts with spyglasses, shepherds' huts, charcoal burners, the travelling
// players, old skirmish grounds, the duelling ground and the crossroads gallows.

function undeadFoe(u: Undead, crowd: Undead[]): SiteFoe {
  crowd.push(u);
  return { get alive() { return u.alive; }, update: (dt, p) => u.update(dt, p, crowd), dispose: () => u.dispose() };
}
const isNight = (c: SiteCtx) => {
  const h = c.hooks.hour();
  return h >= 20.5 || h < 5;
};
function compass(dx: number, dz: number) {
  const a = Math.atan2(dx, -dz);
  return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8];
}
/** A ghost: a figure made pale and see-through. */
function ghostly(f: Figure) {
  const done = new Set<THREE.Material>();
  const go = () => f.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const out = mats.map((mt) => {
      if (done.has(mt)) return mt;
      const c = (mt as THREE.MeshStandardMaterial).clone();
      c.transparent = true;
      c.opacity = 0.45;
      c.depthWrite = false;
      c.color.lerp(new THREE.Color(0xb8d8ff), 0.6);
      c.emissive = new THREE.Color(0x6a9aff);
      c.emissiveIntensity = 0.4;
      done.add(c);
      return c;
    });
    m.material = out.length === 1 ? out[0] : out;
    m.castShadow = false;
  });
  return go;
}

// ---- Smugglers' cache ------------------------------------------------------------------------

/**
 * A heap of shore rocks with a trapdoor hidden among them, only seen when
 * you're right on top of it. Smugglers' goods; and in one of them, an odd
 * bronze key.
 */
export const CACHE: SiteType = {
  kind: 'cache', label: "Smugglers' Cache", glyph: '⚿', color: '#d8c890', count: 8, clear: 6,
  habitats: ['coast', 'lakeshore', 'river', 'marsh', 'woodEdge'],
  build(c) {
    const k = c.kit, m = k.m, r = c.rnd;
    const st = c.state;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      k.rock(Math.cos(a) * (2 + r()), Math.sin(a) * (2 + r()), 0.5 + r() * 0.6, 0.3);
    }
    const hatch = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.9), col(0x5a4a34, 0.95));
    hatch.position.copy(k.at(0, 0, 0.03));
    hatch.rotation.y = c.site.yaw + 0.3;
    hatch.visible = false;
    k.live(hatch);
    // Sand scuffed over it.
    k.add(rockGeo(r, 0.6, 0.06, 0.5, 0), col(0xa89a78, 1), 0.4, 0.02, 0.3, 0, 0, 0, 0);
    void m;
    let near = false;
    return {
      actions: [{
        at: k.at(0, 0, 0.3), radius: 2.0,
        label: () => 'Open the hidden trapdoor',
        enabled: () => near && !st.done,
        act: () => {
          hatch.rotation.x = -1.4;
          if (c.site.n === 0) {
            c.hooks.give('vaultKeyA', 1);
            c.hooks.toast('Among the smugglers\' bales: a heavy bronze key with a sun on its bow. It doesn\'t look like a door key from any house you know.');
          }
          c.hooks.toast(`Under the trapdoor: ${loot(c, 'caravan')}.`);
          c.finish();
        },
      }],
      update: (_dt, player) => {
        near = Math.hypot(player.pos.x - hatch.position.x, player.pos.z - hatch.position.z) < 5;
        hatch.visible = near || !!st.done;
      },
    };
  },
};

// ---- The sealed vault -------------------------------------------------------------------------

/**
 * A stone door set in a hillside, carved round with the Sunwheel, with three
 * keyholes: a sun, a sword and a noose. The keys are out in the country, one
 * each in a smugglers' cache, with the duelling ground's ghost, and with the
 * hanged man at the crossroads.
 */
export const VAULT: SiteType = {
  kind: 'vault', label: 'The Sealed Vault', glyph: '⛬', color: '#ffd060', count: 1, clear: 14,
  habitats: ['hills', 'mountain', 'woodEdge', 'meadow'],
  minFar: 900,
  score: (_x, _z, h) => Math.min(1, h / 20),
  build(c) {
    const k = c.kit, m = k.m, r = c.rnd;
    const st = c.state;
    // The hillside: big rocks banked up behind the door.
    for (let i = 0; i < 9; i++) k.add(rockGeo(r, 2.2, 2.4, 2.0, 1), m.stone, -6 + i * 1.5, 1.6, -2.6 - Math.abs(i - 4) * 0.4, r() * 3, 0, 0, 2.5);
    k.solid(12, 5, 3, 0, 2.5, -3);
    // The door frame (dressed stone, a lintel) and the door.
    for (const sx of [-1, 1]) k.add(new THREE.BoxGeometry(0.9, 4.4, 1.1), m.stone, sx * 1.65, 2.0, -1.2, 0, 0, 0, 1.2);
    k.add(new THREE.BoxGeometry(4.4, 0.9, 1.2), m.stone, 0, 4.4, -1.2, 0, 0, 0, 1.2);
    k.add(new THREE.BoxGeometry(2.6, 3.6, 0.8), col(0x1a1814, 1), 0, 1.7, -1.3);
    // Three bronze lock plates: a sun, a sword, a noose.
    for (let i = 0; i < 3; i++) {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 12).rotateX(Math.PI / 2), col(0xb08840, 0.4, { metal: 0.8, emissive: 0x6a4a10, ei: 0.2 }));
      plate.position.copy(k.at(-0.7 + i * 0.7, -0.4, 1.0));
      plate.rotation.y = c.site.yaw;
      k.live(plate);
      const hole = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.02), col(0x0a0806, 1));
      hole.position.copy(k.at(-0.7 + i * 0.7, -0.37, 1.0));
      hole.rotation.y = c.site.yaw;
      k.live(hole);
    }
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.4, 0.3), col(0x8a8478, 0.85));
    door.position.copy(k.at(0, -0.6, 1.7));
    door.rotation.y = c.site.yaw;
    k.live(door);
    const doorCol = k.solid(2.4, 3.4, 0.5, 0, 1.7, -0.6);
    const wheel = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.7, 24), col(0xc8a050, 0.4, { metal: 0.7, emissive: 0xffc060, ei: 0.2, side: THREE.DoubleSide }));
    wheel.position.copy(k.at(0, -0.43, 2.6));
    wheel.rotation.y = c.site.yaw;
    k.live(wheel);
    const holes = ['vaultKeyA', 'vaultKeyB', 'vaultKeyC'];
    if (st.done) door.position.y -= 3.6;
    return {
      actions: [{
        at: k.at(0, 0.6, 1), radius: 2.8,
        label: () => (st.done ? 'The vault stands open' : `Try the three keyholes (${holes.filter((h) => c.hooks.count(h) > 0).length} of 3 keys)`),
        enabled: () => !st.done,
        act: () => {
          const have = holes.filter((h) => c.hooks.count(h) > 0).length;
          if (have < 3) return c.hooks.toast(`Three keyholes: a sun, a sword and a noose. You have ${have} of the keys. The rest are somewhere out in the country.`);
          for (const h of holes) c.hooks.take(h, 1);
          door.position.y -= 3.6;
          if (doorCol) c.kit.dropCollider(doorCol);
          c.hooks.gold(600);
          c.hooks.give('silversteelIngot', 2);
          c.hooks.give('greaterHealthPotion', 3);
          c.hooks.give('runeEmber', 1);
          c.hooks.xp(500);
          c.hooks.toast('The three keys turn together. The door grinds down into the earth. Inside: the strongroom of someone who kept the wheel, and kept it well. 600 gold, silversteel, potions and a rune.');
          c.finish();
        },
      }],
    };
  },
};

// ---- Lookout -----------------------------------------------------------------------------------

/** A wooden platform on stilts on a hill, a brass spyglass on a tripod. Look through it and the hidden places nearby are marked on your map. */
export const LOOKOUT: SiteType = {
  kind: 'lookout', label: 'Old Lookout', glyph: '⌖', color: '#e0d080', count: 6, clear: 8,
  habitats: ['hills', 'mountain', 'meadow'],
  score: (_x, _z, h) => Math.min(1, 0.15 + h / 25),
  build(c) {
    const k = c.kit, m = k.m;
    const st = c.state;
    // Four stout posts up to a little roof, braced crosswise; a planked platform with a rail.
    for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
      k.add(new THREE.CylinderGeometry(0.16, 0.2, 5.6, 7), m.timber, x, 2.8, z, 0, 0, 0, 1.5);
      k.post(0.2, 3.4, x, z);
    }
    const brace = Math.hypot(2.4, 3.0), tilt = Math.atan2(2.4, 3.0);
    for (const s of [-1, 1]) for (const d of [-1, 1]) {
      k.add(new THREE.BoxGeometry(0.1, brace, 0.1), m.timber, 0, 1.7, s * 1.2, 0, 0, d * tilt, 1.5);
      k.add(new THREE.BoxGeometry(0.1, brace, 0.1), m.timber, s * 1.2, 1.7, 0, Math.PI / 2, 0, d * tilt, 1.5);
    }
    k.add(new THREE.BoxGeometry(3, 0.14, 3), m.planks, 0, 3.4, 0);
    k.solid(3, 0.3, 3, 0, 3.32, 0);
    for (const s of [-1, 1]) {
      k.add(new THREE.BoxGeometry(2.8, 0.1, 0.06), m.planks, 0, 4.4, s * 1.2, 0, 0, 0, 1.5);
      k.add(new THREE.BoxGeometry(2.8, 0.1, 0.06), m.planks, 0, 3.9, s * 1.2, 0, 0, 0, 1.5);
      k.add(new THREE.BoxGeometry(0.06, 0.1, 2.8), m.planks, s * 1.2, 4.4, s > 0 ? -0.5 : 0, 0, 0, 0, 1.5);
    }
    // The roof: a low cap of planks.
    k.add(new THREE.ConeGeometry(2.4, 1.0, 4, 1).rotateY(Math.PI / 4), m.planks, 0, 6.0, 0, 0, 0, 0, 1.5);
    // A ladder.
    for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(0.06, 3.6, 0.06), m.timber, s * 0.25, 1.8, 1.9, 0, -0.25, 0);
    for (let i = 0; i < 8; i++) k.add(new THREE.BoxGeometry(0.5, 0.05, 0.05), m.timber, 0, 0.3 + i * 0.42, 1.6 + i * 0.1);
    // The spyglass on its tripod.
    const g0 = k.ground(0, 0);
    const brass = col(0xb88a3a, 0.35, { metal: 0.8 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      k.addAt(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 4), m.timber, Math.cos(a) * 0.25, g0 + 4.0, Math.sin(a) * 0.25, 0, Math.cos(a) * 0.25, -Math.sin(a) * 0.25, 0);
    }
    k.addAt(new THREE.CylinderGeometry(0.04, 0.07, 0.9, 10), brass, 0, g0 + 4.65, 0, 0.6, Math.PI / 2 - 0.15, 0, 0);
    const top = k.at(0, 0);
    top.y = g0 + 3.5;
    const foot = k.at(0, 2.6);
    return {
      actions: [
        { at: k.at(0, 2.2), radius: 2, label: () => 'Climb the ladder', act: () => c.hooks.teleport(top.clone().add(new THREE.Vector3(0.6, 0, 0.6))) },
        { at: top, radius: 1.8, label: () => 'Climb down', act: () => c.hooks.teleport(foot) },
        {
          at: top.clone().add(new THREE.Vector3(0, 0.6, 0)), radius: 1.8,
          label: () => 'Look through the spyglass',
          act: () => {
            const found: string[] = [];
            for (let i = 0; i < 4; i++) {
              const n = c.unseen(c.site.x, c.site.z);
              if (!n) break;
              n.st.seen = true;
              found.push(`${n.name} to the ${compass(n.site.x - c.site.x, n.site.z - c.site.z)}`);
            }
            c.hooks.toast(found.length ? `Through the glass you pick out: ${found.join('; ')}. They're on your map.` : 'Through the glass: nothing out there you haven\'t found already.');
            if (!st.done) c.hooks.xp(40);
            c.finish();
          },
        },
      ],
    };
  },
};

// ---- Shepherd's hut ---------------------------------------------------------------------------

const SHEPHERDS: { name: string; look: Look }[] = [
  { name: 'Wat the Shepherd', look: { body: 'male', outfit: 'peasant', hair: 'buzzed', beard: true, hairColor: 0x5a4a3a, skin: 0xd8a882, cloth: 0x6a6a4a, linen: 0xb8b098, height: 1.72 } },
  { name: 'Hester Fold', look: { body: 'female', outfit: 'peasant', hair: 'buns', hairColor: 0x8a6a4a, skin: 0xe0b894, cloth: 0x5a6a7a, linen: 0xc8c0a8, height: 1.64 } },
  { name: 'Young Tam', look: { body: 'male', outfit: 'peasant', hair: 'simpleparted', hairColor: 0xc8a050, skin: 0xe8c0a0, cloth: 0x7a4a2a, linen: 0xd0c8b0, height: 1.58 } },
];

/**
 * A stone hut on the high pasture, a fold of hurdles, a dozen sheep and a
 * dog. The shepherd will let you rest by the hut, and has lost a ewe.
 */
export const SHEPHERD: SiteType = {
  kind: 'shepherd', label: "Shepherd's Hut", glyph: '⌂', color: '#e8e8d0', count: 5, clear: 16,
  habitats: ['hills', 'meadow'],
  build(c) {
    const k = c.kit, m = k.m, r = c.rnd;
    const st = c.state;
    const who = SHEPHERDS[c.site.n % SHEPHERDS.length];
    // The hut: round stone walls, a thatched cone.
    k.add(new THREE.CylinderGeometry(2.0, 2.1, 2.2, 14), m.stone, -5, 1.0, -3);
    k.add(new THREE.ConeGeometry(2.6, 2.0, 14), m.thatch, -5, 3.0, -3, 0, 0, 0, 2);
    k.add(new THREE.BoxGeometry(0.8, 1.5, 0.1), col(0x4a3622, 0.9), -5, 0.75, -0.95);
    k.post(2.1, 2.4, -5, -3);
    // The fold: hurdles in a ring.
    const hurdle = col(0x8a7454, 0.95);
    for (let i = 0; i < 14; i++) {
      if (i === 3) continue;
      const a = (i / 14) * Math.PI * 2;
      k.add(new THREE.BoxGeometry(2.2, 1.0, 0.08), hurdle, 5 + Math.cos(a) * 5, 0.5, 2 + Math.sin(a) * 5, Math.PI / 2 - a);
    }
    // The flock and the dog.
    const flock: Animal[] = [];
    for (let i = 0; i < 9; i++) {
      const s = new Animal(c.hooks.scene, 'sheep');
      s.pos.copy(k.at(5 + (r() - 0.5) * 7, 2 + (r() - 0.5) * 7));
      s.yaw = r() * Math.PI * 2;
      s.play('Idle_Eating');
      flock.push(s);
    }
    const dog = new Animal(c.hooks.scene, 'dog');
    dog.pos.copy(k.at(-2, 1));
    dog.yaw = c.site.yaw;
    const fig = new Figure(c.hooks.scene, who.look, 'staff', 0x6a5a3a);
    fig.pos.copy(k.at(-2.6, 0));
    fig.yaw = c.site.yaw + 0.4;
    fig.play('idle');
    // The lost ewe, out on the hill.
    const kv = (st.k ??= {});
    const lostAt = k.at(-50, 40);
    let ewe: Animal | null = null;
    if (!kv.ewe) {
      ewe = new Animal(c.hooks.scene, 'sheep');
      ewe.pos.copy(lostAt);
      ewe.play('Idle_Eating');
    }
    const actions: SiteAction[] = [
      { at: k.at(-5, -0.4), radius: 2.4, label: () => 'Rest by the hut a while', act: () => c.hooks.rest() },
      {
        at: fig.pos.clone(), radius: 2.4, label: () => `Talk to ${who.name}`,
        act: () => {
          if (kv.ewe === 'home') {
            kv.ewe = 'paid';
            c.hooks.give('wool', 4);
            c.hooks.gold(40);
            c.hooks.xp(80);
            c.finish();
            return c.hooks.talk(who.name, 'Shepherd', '"There she is! Daft old thing. Here: wool, and a bit for your trouble."', [{ label: 'Glad she\'s safe.', run: () => {} }]);
          }
          if (kv.ewe === 'paid') return c.hooks.talk(who.name, 'Shepherd', '"Fine weather for it. Rest by the hut whenever you like."', [{ label: 'Thank you.', run: () => {} }]);
          kv.asked = true;
          c.hooks.talk(who.name, 'Shepherd', `"I'm one short. A ewe with a torn ear, she wanders. Last I saw her she was up the hill to the ${compass(lostAt.x - c.site.x, lostAt.z - c.site.z)}. If you see her, bring her down?"`, [{ label: 'I\'ll look.', run: () => {} }]);
        },
      },
    ];
    if (ewe) {
      const e = ewe;
      actions.push({
        at: e.pos, radius: 2.4, label: () => 'Lead the ewe home',
        enabled: () => !kv.ewe,
        act: () => {
          kv.ewe = 'home';
          e.pos.copy(k.at(4, 3));
          c.hooks.toast('The ewe follows you down the hill, complaining all the way.');
        },
      });
    }
    let t = 0;
    return {
      actions,
      update: (dt) => {
        t += dt;
        for (const s of flock) s.update(dt);
        ewe?.update(dt);
        dog.update(dt);
        fig.update(dt);
      },
      dispose: () => {
        for (const s of flock) s.dispose();
        ewe?.dispose();
        dog.dispose();
        fig.dispose();
      },
    };
  },
};

// ---- Charcoal burners -------------------------------------------------------------------------

/** A clearing with a smoking earth clamp, stacked cordwood, a lean-to and the burners. They sell coal and tools. */
export const CHARCOAL: SiteType = {
  kind: 'charcoal', label: "Charcoal Burners' Camp", glyph: '♨', color: '#a89888', count: 5, clear: 14,
  habitats: ['forest', 'woodEdge', 'deepForest'],
  build(c) {
    const k = c.kit, m = k.m, r = c.rnd;
    // The clamp: a squat earth dome, smoking.
    const clampAt = k.add(new THREE.SphereGeometry(2.4, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1), col(0x3a3228, 1), 0, -0.1, 0, 0, 0, 0, 0);
    k.post(2.2, 1.6, 0, 0);
    // Cordwood stacks.
    for (let s = 0; s < 2; s++) for (let i = 0; i < 18; i++) k.add(new THREE.CylinderGeometry(0.1, 0.1, 1.1, 6), m.bark, 4.5 + s * 1.4, 0.12 + Math.floor(i / 6) * 0.22, -2 + (i % 6) * 0.22, 0, Math.PI / 2, 0, 0);
    // A lean-to, sacks of charcoal.
    for (const sx of [-1, 1]) k.add(new THREE.CylinderGeometry(0.05, 0.06, 2, 5), m.bark, -5 + sx * 1.2, 1, 2);
    k.add(new THREE.PlaneGeometry(2.8, 2.2), col(0x7a6a4a, 1, { side: THREE.DoubleSide }), -5, 1.0, 1.2, 0, -0.9, 0, 0);
    for (let i = 0; i < 5; i++) k.add(rockGeo(r, 0.3, 0.35, 0.25, 0), col(0x2a2622, 1), -4 + r() * 2, 0.3, 3 + r(), 0, 0, 0, 0);
    const burners = [
      new Figure(c.hooks.scene, { body: 'male', outfit: 'peasant', hair: 'buzzed', beard: true, hairColor: 0x1a1612, skin: 0x8a6a52, cloth: 0x3a3632, linen: 0x6a6258, height: 1.78 }),
      new Figure(c.hooks.scene, { body: 'female', outfit: 'peasant', hair: 'buns', hairColor: 0x2a1a12, skin: 0xa8846a, cloth: 0x4a3a2a, linen: 0x7a7060, height: 1.66 }),
    ];
    burners[0].pos.copy(k.at(2.8, 2));
    burners[0].yaw = c.site.yaw + Math.PI;
    burners[0].play('fix');
    burners[1].pos.copy(k.at(-3.4, 2.6));
    burners[1].yaw = c.site.yaw + 2;
    burners[1].play('sit');
    const st = c.state;
    const buy = (item: string, n: number, cost: number, what: string) => () => {
      if (!c.hooks.spend(cost)) return c.hooks.toast(`You need ${cost} gold.`);
      c.hooks.give(item, n);
      c.hooks.toast(`Bought ${what}.`);
    };
    return {
      actions: [{
        at: burners[0].pos.clone(), radius: 2.6, label: () => 'Talk to the charcoal burners',
        act: () => {
          c.finish();
          c.hooks.talk('The Burners', "Charcoal Burners' Camp", 'Soot to the eyebrows and cheerful with it. "Coal, charcoal, good as any from the mines. Tools too, if you\'re heading for the hills."', [
            { label: 'Buy 4 coal (16 gold)', run: buy('coal', 4, 16, 'four coal') },
            { label: 'Buy a hatchet (40 gold)', run: buy('hatchet', 1, 40, 'a hatchet') },
            { label: 'Buy a mining pick (60 gold)', run: buy('miningPick', 1, 60, 'a mining pick') },
            { label: 'Goodbye.', run: () => {} },
          ]);
        },
      }],
      update: (dt) => {
        for (const b of burners) b.update(dt);
        if (Math.random() < dt * 5) c.hooks.fx.add.spawn({ pos: clampAt.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 1.5, (Math.random() - 0.5) * 1.5)), spread: 0.4, count: 1, life: [2, 4], size: [0.6, 1.6], color: 0x6a6460, color2: 0x3a3634, upBias: 0.8, drag: 0.4, alpha: 0.35 });
        void st;
      },
      dispose: () => burners.forEach((b) => b.dispose()),
    };
  },
};

// ---- Travelling players ----------------------------------------------------------------------

/**
 * Two painted wagons drawn up off the road, a little stage, a juggler
 * practising and a fortune teller in a striped tent. Watch the show for a lift
 * in your step; have your fortune told and she tells you of somewhere you
 * haven't been.
 */
export const PLAYERS: SiteType = {
  kind: 'players', label: 'Travelling Players', glyph: '♪', color: '#ff90b0', count: 3, clear: 18,
  habitats: ['meadow', 'woodEdge'],
  nearRoad: 200,
  build(c) {
    const k = c.kit, m = k.m;
    const st = c.state;
    const paint = [0xb83a3a, 0x2a6a9a, 0xd8a838];
    // Two painted wagons with curved roofs.
    for (let w = 0; w < 2; w++) {
      const x = -6 + w * 12, z = -4;
      k.add(new THREE.BoxGeometry(2.0, 1.8, 3.6), col(paint[w], 0.8), x, 1.4, z, w * 0.3);
      k.add(new THREE.CylinderGeometry(1.05, 1.05, 3.7, 12, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2), col(paint[(w + 2) % 3], 0.8, { side: THREE.DoubleSide }), x, 2.3, z, w * 0.3, 0, 0, 0);
      for (const [dx, dz] of [[-1.05, 1.2], [1.05, 1.2], [-1.05, -1.2], [1.05, -1.2]]) {
        const wheel = new THREE.TorusGeometry(0.45, 0.06, 5, 16).rotateY(Math.PI / 2);
        k.add(wheel, col(0xd8a838, 0.7), x + dx, 0.45, z + dz, w * 0.3, 0, 0, 0);
      }
      k.solid(2.2, 2.8, 3.8, x, 1.4, z, w * 0.3);
    }
    // The stage: planks on trestles, bunting.
    k.add(new THREE.BoxGeometry(5, 0.2, 3), m.planks, 0, 0.8, 4);
    for (const [x, z] of [[-2.2, 2.8], [2.2, 2.8], [-2.2, 5.2], [2.2, 5.2]]) k.add(new THREE.BoxGeometry(0.15, 0.8, 0.15), m.timber, x, 0.4, z);
    k.solid(5, 1, 3, 0, 0.45, 4);
    for (let i = 0; i < 9; i++) k.add(new THREE.ConeGeometry(0.12, 0.25, 3).rotateX(Math.PI), col(paint[i % 3], 0.9), -2.4 + i * 0.6, 2.6, 2.6, 0, 0, 0, 0);
    // The fortune teller's tent: a striped cone.
    k.add(new THREE.ConeGeometry(1.8, 2.8, 10, 1, true), col(0x7a3a8a, 0.95, { side: THREE.DoubleSide }), 7, 1.4, 4, 0, 0, 0, 0);
    for (let i = 0; i < 5; i++) k.add(new THREE.ConeGeometry(1.82, 2.82, 4, 1, true, (i / 5) * Math.PI * 2, Math.PI / 5), col(0xe8c050, 0.9, { side: THREE.DoubleSide }), 7, 1.41, 4, 0, 0, 0, 0);
    k.add(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 5), m.timber, 7, 3.2, 4);
    const pennant = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.25, 0), new THREE.Vector3(0.7, 0.1, 0), new THREE.Vector3(0, -0.05, 0)]);
    pennant.computeVertexNormals();
    k.add(pennant, col(0xc83a3a, 0.9, { side: THREE.DoubleSide }), 7, 3.45, 4, 0, 0, 0, 0);
    // Players.
    const juggler = new Figure(c.hooks.scene, { body: 'male', outfit: 'peasant', hair: 'simpleparted', hairColor: 0xc8502a, skin: 0xe8c0a0, cloth: 0xc83a3a, linen: 0xe8d8a8, height: 1.7 });
    juggler.pos.copy(k.at(0, 4, 0.9));
    juggler.yaw = c.site.yaw;
    juggler.play('dance');
    const teller = new Figure(c.hooks.scene, { body: 'female', outfit: 'peasant', hair: 'long', hairColor: 0x1a1212, skin: 0xb88a6a, cloth: 0x6a2a7a, linen: 0xd8c8a0, height: 1.62 });
    teller.pos.copy(k.at(7, 2.4));
    teller.yaw = c.site.yaw;
    teller.play('sit');
    // Juggling balls.
    const balls = [0, 1, 2].map((i) => {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshStandardMaterial({ color: paint[i] }));
      k.live(b);
      return b;
    });
    let t = 0;
    return {
      actions: [
        {
          at: k.at(0, 2), radius: 3.2, label: () => 'Watch the show',
          act: () => {
            if (st.day === c.hooks.day()) return c.hooks.toast('You\'ve seen the show today; it\'s the same jokes.');
            st.day = c.hooks.day();
            c.hooks.bless({ id: 'players', label: 'A good laugh: your stamina lasts', sec: 600, m: { staminaCost: -0.12, staminaRegen: 0.15 } });
            c.finish();
          },
        },
        {
          at: teller.pos.clone(), radius: 2.4, label: () => 'Have your fortune told (10 gold)',
          act: () => {
            const kv = (st.k ??= {});
            if (kv.told === c.hooks.day()) return c.hooks.toast('"The cards are tired, love. Come back tomorrow."');
            if (!c.hooks.spend(10)) return c.hooks.toast('"Ten gold, love. The cards don\'t work for free."');
            kv.told = c.hooks.day();
            const n = c.unseen(c.site.x, c.site.z);
            if (n) n.st.seen = true;
            c.hooks.bless({ id: 'fortune', label: 'A good fortune: a little luck in your blows', sec: 900, m: { crit: 0.04 } });
            c.hooks.talk('Madame Sorrel', 'Fortune Teller', n ? `She turns a card: a tower, a road, a wheel. "You'll find ${n.name.toLowerCase().startsWith('the') ? n.name : 'a ' + n.name.toLowerCase()} to the ${compass(n.site.x - c.site.x, n.site.z - c.site.z)} of here. And you were brought here by someone who won't tell you why. Both true. Ten gold, thank you."` : '"I see you\'ve been everywhere already. I see you need a rest."', [{ label: 'Thank you.', run: () => {} }]);
            c.finish();
          },
        },
      ],
      update: (dt) => {
        t += dt;
        juggler.update(dt);
        teller.update(dt);
        const hand = juggler.pos;
        balls.forEach((b, i) => {
          const ph = t * 4 + (i * Math.PI * 2) / 3;
          b.position.set(hand.x + Math.cos(ph) * 0.3, hand.y + 1.6 + Math.abs(Math.sin(ph)) * 0.7, hand.z + 0.3);
        });
      },
      dispose: () => {
        juggler.dispose();
        teller.dispose();
      },
    };
  },
};

// ---- Skirmish ground --------------------------------------------------------------------------

/** An old fight: broken spears and rusted blades in the grass, a split shield, a cairn. Salvage the iron by day; at night the soldiers stand up again. */
export const SKIRMISH: SiteType = {
  kind: 'skirmish', label: 'Skirmish Ground', glyph: '⚔', color: '#b8a898', count: 6, clear: 14,
  habitats: ['meadow', 'hills', 'woodEdge'],
  build(c) {
    const k = c.kit, r = c.rnd;
    const st = c.state;
    const rust = col(0x6a4a36, 0.8, { metal: 0.4 }), wood = col(0x5a4632, 0.9);
    for (let i = 0; i < 16; i++) {
      const a = r() * Math.PI * 2, d = 1 + r() * 9;
      const len = 0.6 + r() * 0.4;
      k.add(new THREE.BoxGeometry(0.05, len, 0.01).translate(0, len / 2, 0), rust, Math.cos(a) * d, -0.15, Math.sin(a) * d, r() * 3, (r() - 0.5) * 0.7, (r() - 0.5) * 0.7, 0);
    }
    for (let i = 0; i < 6; i++) k.add(new THREE.CylinderGeometry(0.02, 0.025, 2 + r(), 5), wood, (r() - 0.5) * 16, 0.05, (r() - 0.5) * 16, r() * 3, Math.PI / 2, 0, 0);
    for (let i = 0; i < 4; i++) k.add(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 14, 1, false, 0, Math.PI * (1.2 + r() * 0.6)), col([0x7a2a22, 0x2a4a6a][i % 2], 0.9), (r() - 0.5) * 12, 0.05, (r() - 0.5) * 12, r() * 3, 0.1, 0, 0);
    for (let i = 0; i < 12; i++) k.add(rockGeo(r, 0.28, 0.2, 0.26, 0), col(0x8a867e, 0.95), 5 + (i % 3) * 0.5, 0.1 + Math.floor(i / 6) * 0.25, 4 + Math.floor(i / 3) % 2 * 0.5, 0, 0, 0, 0);
    // Pikes still standing where they were planted, leaning every which way; a torn standard; burial cairns.
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2, d = 2 + r() * 8;
      k.add(new THREE.CylinderGeometry(0.03, 0.04, 3 + r() * 0.8, 5), wood, Math.cos(a) * d, 1.4, Math.sin(a) * d, r() * 3, (r() - 0.5) * 0.7, (r() - 0.5) * 0.7, 0);
    }
    k.add(new THREE.CylinderGeometry(0.05, 0.06, 4.6, 6), wood, -3, 2.2, -2, 0, 0.1, 0.12, 0);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9, 6, 3), col(0x7a2a22, 1, { side: THREE.DoubleSide }));
    flag.position.copy(k.at(-2.3, -2, 3.9));
    flag.rotation.y = c.site.yaw;
    k.live(flag);
    for (const [cx, cz] of [[6, -5], [-6, 5], [1, 7]]) {
      for (let i = 0; i < 9; i++) k.add(rockGeo(r, 0.4, 0.3, 0.35, 0), col(0x8a867e, 0.95), cx + (i % 3 - 1) * 0.55, 0.15 + Math.floor(i / 6) * 0.3, cz + (Math.floor(i / 3) % 3 - 1) * 0.6, 0, 0, 0, 0);
      k.add(new THREE.BoxGeometry(0.08, 1.2, 0.08), wood, cx, 1.0, cz - 1.1, 0, 0.1, 0);
      k.add(new THREE.BoxGeometry(0.6, 0.08, 0.08), wood, cx, 1.3, cz - 1.1, 0, 0.1, 0);
    }
    const kv = (st.k ??= {});
    const crowd: Undead[] = [];
    let risen = false;
    return {
      actions: [{
        at: k.at(0, 0, 0.5), radius: 5,
        label: () => (st.day !== undefined && c.hooks.day() - st.day < 3 ? 'Picked over for now' : 'Salvage the rusted iron'),
        enabled: () => st.day === undefined || c.hooks.day() - st.day >= 3,
        act: () => {
          st.day = c.hooks.day();
          c.hooks.give('scrapMetal', 3 + Math.floor(r() * 3));
          if (r() < 0.4) c.hooks.give('ironIngot', 1);
          c.hooks.toast('You gather up the rusted iron: scrap for a smith.');
          c.finish();
        },
      }],
      update: (_dt, player) => {
        if (risen || !isNight(c) || kv.night === c.hooks.day()) return;
        if (Math.hypot(player.pos.x - c.site.x, player.pos.z - c.site.z) > 18) return;
        risen = true;
        kv.night = c.hooks.day();
        for (let i = 0; i < 3; i++) c.spawn(undeadFoe(new Undead('skeleton', k.at(Math.cos(i * 2.1) * 5, Math.sin(i * 2.1) * 5), c.site.yaw, c.hooks.scene, c.hooks.fx), crowd));
        c.hooks.toast('In the dark the old soldiers stand up out of the grass, and turn to face the enemy. You.');
      },
    };
  },
};

// ---- The duelling ground ----------------------------------------------------------------------

/**
 * A square of standing stones on a rise, worn smooth, and a pale duellist who
 * waits in the middle. He'll fight anyone who accepts; he fights fair, and
 * yields when beaten.
 */
export const DUEL: SiteType = {
  kind: 'duel', label: 'Duelling Ground', glyph: '⚚', color: '#c0d8ff', count: 4, clear: 12,
  habitats: ['meadow', 'hills'],
  build(c) {
    const k = c.kit, m = k.m;
    const st = c.state;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      k.add(new THREE.BoxGeometry(0.5, 1.6, 0.4), m.stone, Math.cos(a) * 6, 0.7, Math.sin(a) * 6, -a);
      k.post(0.35, 1.6, Math.cos(a) * 6, Math.sin(a) * 6);
    }
    k.add(new THREE.CircleGeometry(5.4, 24).rotateX(-Math.PI / 2), col(0x7a6a50, 1), 0, 0.04, 0, 0, 0, 0, 0);
    const look: Look = { body: 'male', outfit: 'ranger', hair: 'long', hairColor: 0xd8d8e0, skin: 0xd0d8e0, cloth: 0x4a5a7a, height: 1.86, pauldron: true };
    const ghost = new Figure(c.hooks.scene, look, 'banner', 0x4a5a7a);
    ghost.pos.copy(k.at(0, 0));
    ghost.yaw = c.site.yaw;
    ghost.play('arms');
    const fade = ghostly(ghost);
    const bolts = new Bolts(c.hooks.scene);
    let foe: Bandit | null = null;
    let faded = false;
    const kv = (st.k ??= {});
    return {
      actions: [{
        at: ghost.pos.clone(), radius: 3, label: () => (kv.won ? 'The duellist bows to you' : 'Accept the pale duellist\'s challenge'),
        enabled: () => !foe,
        act: () => {
          if (kv.won) return c.hooks.toast('He bows, and says nothing. He has already given you what he had.');
          c.hooks.talk('The Pale Duellist', 'Ghost', '"Steel and nothing else. First to yield." His voice comes from a long way off.', [
            { label: 'Draw.', run: () => {
              foe = new Bandit('sword', ghost.pos.clone(), c.hooks.scene, bolts, undefined, look);
              foe.name = 'The Pale Duellist';
              foe.hp = foe.maxHp = 260 + Math.round(c.site.danger * 300);
              foe.nonLethal = true;
              c.spawn(foe);
              ghost.visible = false;
            } },
            { label: 'Not today.', run: () => {} },
          ]);
        },
      }],
      update: (dt, player) => {
        bolts.update(dt, player);
        if (!faded && ghost.ready) {
          faded = true;
          fade();
        }
        ghost.update(dt);
        if (foe && foe.alive && foe.hp <= 1) {
          // He yields.
          foe.dispose();
          foe = null;
          ghost.visible = true;
          kv.won = true;
          if (c.site.n === 0) {
            c.hooks.give('vaultKeyB', 1);
            c.hooks.toast('"Well fought." He holds out a bronze key with a sword on its bow. "I was set to guard this. I am tired of guarding it."');
          } else {
            c.hooks.gold(120);
            c.hooks.toast('"Well fought." He leaves a purse on the stones, and is a shape in the mist, and then not.');
          }
          c.hooks.xp(220);
          c.finish();
        }
      },
      dispose: () => {
        bolts.clear();
        ghost.dispose();
        foe?.dispose();
      },
    };
  },
};

// ---- Crossroads gallows -----------------------------------------------------------------------

const HANGED = [
  { ghost: 'Jory Fletch', killer: 'Magistrate Corwen Vell', grave: 'CORWEN VELL, MAGISTRATE. HE KEPT THE KING\'S PEACE.' },
  { ghost: 'Ansel Brook', killer: 'Captain Idris Harrow', grave: 'IDRIS HARROW, CAPTAIN OF THE WATCH. FAITHFUL UNTO DEATH.' },
  { ghost: 'Meg Tolly', killer: 'Sir Aldric Penn', grave: 'SIR ALDRIC PENN. A JUST MAN.' },
  { ghost: 'Old Noll', killer: 'Reeve Haskett', grave: 'THOMAS HASKETT, REEVE OF THIS HUNDRED.' },
];

/**
 * A gallows where two old tracks cross, a rope still hanging, a worn
 * signpost. At night a ghost stands under it and asks you to find the name of
 * the one who hanged him; it's on a grave not far off, under a lie.
 */
export const GALLOWS: SiteType = {
  kind: 'gallows', label: 'Crossroads Gallows', glyph: '⊓', color: '#a8b8c8', count: 4, clear: 14,
  habitats: ['meadow', 'hills', 'woodEdge'],
  build(c) {
    const k = c.kit, m = k.m, r = c.rnd;
    const st = c.state;
    const H = HANGED[c.site.n % HANGED.length];
    // Two tracks crossing (worn earth).
    for (const ry of [0, Math.PI / 2]) k.add(new THREE.PlaneGeometry(2.2, 26).rotateX(-Math.PI / 2), col(0x6a5a40, 1), 0, 0.03, 0, ry + 0.2, 0, 0, 0);
    // The gallows.
    k.add(new THREE.BoxGeometry(0.25, 4.2, 0.25), m.timber, -1.4, 2.1, -3);
    k.add(new THREE.BoxGeometry(2.4, 0.22, 0.22), m.timber, -0.4, 4.1, -3);
    k.add(new THREE.BoxGeometry(0.15, 1.2, 0.15), m.timber, -1.0, 3.6, -3, 0, 0, 0.8);
    k.add(new THREE.CylinderGeometry(0.015, 0.015, 1.4, 4), col(0x8a7a5a, 1), 0.5, 3.4, -3);
    k.add(new THREE.TorusGeometry(0.12, 0.02, 4, 10), col(0x8a7a5a, 1), 0.5, 2.62, -3, 0, Math.PI / 2, 0, 0);
    k.post(0.2, 4.2, -1.4, -3);
    // The signpost.
    k.add(new THREE.BoxGeometry(0.12, 2.4, 0.12), m.timber, 2.4, 1.2, 2.4);
    for (const a of [0.3, 1.9, -1.2]) k.add(new THREE.BoxGeometry(0.9, 0.18, 0.04), m.planks, 2.4, 1.9 + a * 0.05, 2.4, a);
    // The killer's grave, a little way off.
    const gx = 16 + r() * 4, gz = -6 + r() * 4;
    k.add(new THREE.BoxGeometry(0.7, 1.1, 0.16), col(0x9a9890, 0.9), gx, 0.5, gz);
    k.add(rockGeo(r, 0.5, 0.12, 0.9, 1), col(0x5a6a3a, 1), gx, 0, gz + 1, 0, 0, 0, 0);
    // The ghost.
    const look: Look = { body: 'male', outfit: 'peasant', hair: 'simpleparted', hairColor: 0x9a9a9a, skin: 0xc8d0d8, cloth: 0x5a5a6a, linen: 0x8a8a90, height: 1.72 };
    const ghost = new Figure(c.hooks.scene, look);
    ghost.pos.copy(k.at(0.5, -2.4));
    ghost.yaw = c.site.yaw;
    ghost.play('idle_tired');
    const fade = ghostly(ghost);
    let faded = false;
    const kv = (st.k ??= {});
    return {
      actions: [
        {
          at: ghost.pos.clone(), radius: 2.6, label: () => `Speak to the ghost of ${H.ghost}`,
          enabled: () => isNight(c) && !st.done,
          act: () => {
            if (kv.read) {
              kv.told = true;
              if (c.site.n === 0) {
                c.hooks.give('vaultKeyC', 1);
                c.hooks.talk(H.ghost, 'Ghost', `"${H.killer}." He says it slowly, like tasting it. "A just man, the stone says. Ha." He presses something cold into your hand: a bronze key with a noose on its bow. "They hanged me for stealing it. I never did. Take it; open what it opens." And he's gone.`, [{ label: 'Rest easy.', run: () => {} }]);
              } else {
                c.hooks.gold(80);
                c.hooks.talk(H.ghost, 'Ghost', `"${H.killer}." He nods. "Then somebody knows." He points at the foot of the gallows, where the earth is loose, and is gone. Under it, a purse.`, [{ label: 'Rest easy.', run: () => {} }]);
              }
              c.hooks.xp(150);
              c.finish();
              return;
            }
            kv.asked = true;
            c.hooks.talk(H.ghost, 'Ghost', `"They hanged me here for something I never did. I never knew the name of the one who gave the order; I want to. He's buried near. Under a stone that tells lies. Find his name for me."`, [{ label: 'I\'ll find it.', run: () => {} }]);
          },
        },
        {
          at: k.at(gx, gz, 0.6), radius: 2.2, label: () => 'Read the grave',
          act: () => {
            kv.read = true;
            c.hooks.toast(`The stone reads: "${H.grave}"${kv.asked ? ' That\'s the name the ghost wants.' : ''}`);
          },
        },
      ],
      update: (dt) => {
        if (!faded && ghost.ready) {
          faded = true;
          fade();
        }
        ghost.visible = isNight(c) && !st.done;
        ghost.update(dt);
      },
      dispose: () => ghost.dispose(),
    };
  },
};

export const BATCH4: SiteType[] = [CACHE, VAULT, LOOKOUT, SHEPHERD, CHARCOAL, PLAYERS, SKIRMISH, DUEL, GALLOWS];
void heightAt;
