import * as THREE from 'three';
import { col, rockGeo, sunwheelMat } from './kit';
import { Figure } from '../roadLife/actors';
import { Boar } from '../../creatures/boar/boar';
import { Wolf, Pack } from '../../creatures/wolf/wolf';
import { Rat } from '../../enemies/vermin';
import { heightAt } from '../terrainHeight';
import type { Look } from '../../npc/charBuilder';
import type { Site, SiteAction, SiteCtx, SiteLive, SiteType } from './types';

// The first six kinds of site: ruined watchtowers, abandoned farmsteads,
// hunters' camps, wayside shrines, the Sunwheel standing stones, and wrecked
// caravans.

// ---- shared bits ------------------------------------------------------------------------------

/** A few things of value, better further out. */
export function loot(c: SiteCtx, kind: 'tower' | 'cellar' | 'caravan' | 'chest') {
  const r = c.rnd, d = c.site.danger, h = c.hooks;
  const got: string[] = [];
  const gold = Math.round((kind === 'caravan' ? 30 : kind === 'cellar' ? 12 : 40) * (1 + d * 3) * (0.7 + r() * 0.6));
  h.gold(gold);
  got.push(`${gold} gold`);
  const give = (id: string, n: number, label: string) => {
    h.give(id, n);
    got.push(n > 1 ? `${n} ${label}` : label);
  };
  if (kind === 'cellar') {
    const food: [string, string][] = [['apple', 'apples'], ['pear', 'pears'], ['egg', 'eggs'], ['carrot', 'carrots']];
    const [id, l] = food[Math.floor(r() * food.length)];
    give(id, 2 + Math.floor(r() * 3), l);
    if (r() < 0.5) give('healthPotion', 1, 'a health potion');
    if (r() < 0.3) give('wheatSeed', 3, 'wheat seed');
  } else if (kind === 'caravan') {
    const goods: [string, string][] = [['woolCloth', 'bolts of wool cloth'], ['linen', 'bolts of linen'], ['leather', 'hides of leather'], ['ironIngot', 'iron ingots']];
    const [id, l] = goods[Math.floor(r() * goods.length)];
    give(id, 2 + Math.floor(r() * 3), l);
    if (r() < 0.15 + d * 0.2) give('silk', 1, 'a bolt of silk');
    if (r() < 0.4) give('healthPotion', 1, 'a health potion');
  } else {
    give(r() < 0.5 ? 'healthPotion' : 'manaPotion', 1 + Math.floor(r() * 2), 'potions');
    if (r() < 0.35 + d * 0.3) give(d > 0.5 ? 'steelIngot' : 'ironIngot', 1 + Math.floor(r() * 2), 'ingots');
    if (r() < 0.12 + d * 0.15) give('greaterHealthPotion', 1, 'a greater health potion');
  }
  return got.join(', ');
}

// ---- Ruined watchtower ------------------------------------------------------------------------

/**
 * A square stone tower, ruined: its walls broken off at different heights,
 * one corner fallen in a heap of blocks. A wooden stair climbs round inside
 * to a floor near the top. Climb it and you can see for miles (the map is
 * revealed all around); some towers still have a chest up there.
 */
export const TOWER: SiteType = {
  kind: 'tower', label: 'Ruined Watchtower', glyph: '♜', color: '#d8ccb0', count: 16, clear: 14,
  habitats: ['hills', 'meadow', 'woodEdge', 'mountain'],
  score: (_x, _z, h) => 0.35 + Math.min(0.65, h / 40),
  build(c) {
    const k = c.kit, m = k.m, r = c.rnd;
    const W = 4.6, T = 0.65, H = 10.5, FLOOR = 8.6;
    const g0 = Math.min(k.ground(-W / 2, -W / 2), k.ground(W / 2, -W / 2), k.ground(-W / 2, W / 2), k.ground(W / 2, W / 2));
    const base = g0 - 0.3;
    // Walls in columns, broken off at different heights; the door in front.
    const COLS = 5, cw = W / COLS;
    for (let side = 0; side < 4; side++) {
      for (let i = 0; i < COLS; i++) {
        const fall = side === 1 && i >= 3 ? 0.42 : 1; // one corner has come down
        const h = (H - r() * 2.6) * fall;
        const along = -W / 2 + cw * (i + 0.5);
        const door = side === 0 && i === 2;
        const lo = door ? 2.5 : 0;
        const hh = h - lo;
        let x = 0, z = 0, ry = 0;
        if (side === 0) [x, z] = [along, W / 2 - T / 2];
        else if (side === 2) [x, z] = [along, -W / 2 + T / 2];
        else if (side === 1) [x, z, ry] = [W / 2 - T / 2, along, Math.PI / 2];
        else [x, z, ry] = [-W / 2 + T / 2, along, Math.PI / 2];
        k.addAt(new THREE.BoxGeometry(cw + 0.02, hh, T), m.stone, x, base + lo + hh / 2, z, ry);
        // Crenels on the tallest stretches.
        if (h > H - 1.2 && !door) k.addAt(new THREE.BoxGeometry(cw * 0.55, 0.6, T), m.stone, x, base + h + 0.3, z, ry);
        if (!door) k.solidAt(ry ? T : cw, h, ry ? cw : T, x, base + h / 2, z);
        else k.solidAt(cw, hh, T, x, base + lo + hh / 2, z);
      }
    }
    // A battered plinth round the foot, and arrow slits.
    k.addAt(new THREE.CylinderGeometry(W * 0.62, W * 0.74, 1.4, 4, 1).rotateY(Math.PI / 4), m.stone, 0, base + 0.5, 0);
    const slit = col(0x14100c, 1);
    for (const [x, z, ry, y] of [[0, W / 2 + 0.01, 0, 5.4], [W / 2 + 0.01, 0.6, Math.PI / 2, 4.2], [-W / 2 - 0.01, -0.4, Math.PI / 2, 6.6], [0.5, -W / 2 - 0.01, 0, 3.8]] as [number, number, number, number][]) k.addAt(new THREE.BoxGeometry(0.16, 0.9, 0.04), slit, x, base + y, z, ry, 0, 0, 0);
    // Ivy up one face.
    const ivy = col(0x3a5a26, 1);
    for (let i = 0; i < 26; i++) {
      const y = r() * 6.5, x = -W / 2 + 0.4 + r() * 1.6 + Math.sin(y) * 0.3;
      k.addAt(new THREE.IcosahedronGeometry(0.22 + r() * 0.18, 0), ivy, x, base + y, W / 2 + 0.06, r() * 3, 0, 0, 0);
    }
    // A string course of darker stone, and the door's lintel.
    k.addAt(new THREE.BoxGeometry(W + 0.12, 0.25, W + 0.12), col(0x6a665e, 0.9), 0, base + 3.2, 0);
    // The fallen corner: blocks in a heap.
    for (let i = 0; i < 14; i++) k.add(new THREE.BoxGeometry(0.5 + r() * 0.4, 0.35 + r() * 0.2, 0.4 + r() * 0.3), m.stone, W / 2 + 0.8 + r() * 3, 0.15, -W / 2 + 1 + r() * 3.5, r() * 3, (r() - 0.5) * 0.6, (r() - 0.5) * 0.6, 1.5);
    // The top floor, planks with a hole where they've rotted through.
    const planks = col(0x6a5238, 0.95);
    for (let i = 0; i < 6; i++) {
      if (i === 4) continue;
      k.addAt(new THREE.BoxGeometry(W - 2 * T, 0.12, (W - 2 * T) / 6 - 0.02), planks, 0, base + FLOOR, -W / 2 + T + ((W - 2 * T) / 6) * (i + 0.5));
    }
    k.solidAt(W - 2 * T, 0.2, W - 2 * T, 0, base + FLOOR - 0.04, 0);
    // The stair winding up inside (seen through the door and the fallen corner).
    for (let i = 0; i < 22; i++) {
      const t = i / 22, a = t * Math.PI * 3.2;
      const rr = (W / 2 - T) * 0.62;
      k.addAt(new THREE.BoxGeometry(1.1, 0.12, 0.45), planks, Math.cos(a) * rr, base + 0.4 + t * (FLOOR - 0.6), Math.sin(a) * rr, -a);
    }
    // Rubble and weeds round the foot.
    for (let i = 0; i < 6; i++) k.rock((r() - 0.5) * 12, -W / 2 - 2 - r() * 4, 0.35 + r() * 0.3, 0.25);
    const top = k.at(0, 0);
    top.y = base + FLOOR + 0.15;
    const door = k.at(0, W / 2 + 1.2);
    const s = c.state;
    const hasChest = (c.site.seed % 5) < 2;
    const chest = hasChest ? k.chest(0.6, -0.9, 0, !!s.k?.opened) : null;
    if (chest) chest.group.position.y = base + FLOOR + 0.06;
    const actions: SiteAction[] = [
      {
        at: door, radius: 2.6, label: () => 'Climb the tower stair',
        act: () => {
          c.hooks.teleport(top.clone().add(new THREE.Vector3(0, 0.3, 0)), c.site.yaw + Math.PI);
          if (!s.k?.top) {
            (s.k ??= {}).top = true;
            c.hooks.reveal(c.site.x, c.site.z, 800);
            c.hooks.xp(40);
            c.hooks.toast('From the top of the old tower you can see for miles. The country round about is drawn on your map.');
            if (!hasChest) c.finish();
          }
        },
      },
      { at: top, radius: 2.4, label: () => 'Climb back down', act: () => c.hooks.teleport(door.clone().add(new THREE.Vector3(0, 0.2, 0)), c.site.yaw) },
    ];
    if (chest) {
      actions.push({
        at: chest.at.clone().setY(base + FLOOR + 0.4), radius: 1.8,
        label: () => 'Open the old chest',
        enabled: () => !s.k?.opened,
        act: () => {
          (s.k ??= {}).opened = true;
          chest.open();
          c.hooks.toast(`In the chest: ${loot(c, 'tower')}.`);
          if (s.k.top) c.finish();
        },
      });
    }
    return { actions };
  },
};

// ---- Abandoned farmstead -----------------------------------------------------------------------

/**
 * A farm nobody works any more: the house's walls stand to the eaves with no
 * roof, its chimney alone at full height; the barn leans; the fences have
 * fallen in places. There's a cellar hatch by the house. Sometimes there's
 * still something put by down there; sometimes the rats got there first.
 */
export const FARMSTEAD: SiteType = {
  kind: 'farmstead', label: 'Abandoned Farmstead', glyph: '⌂', color: '#d8b884', count: 16, clear: 20,
  habitats: ['meadow', 'woodEdge', 'hills'],
  build(c) {
    const k = c.kit, m = k.m, r = c.rnd;
    // The house: low broken walls, a gable end, the chimney.
    const HW = 6.4, HD = 4.6, hx = -3, hz = 2;
    const wall = (x: number, z: number, len: number, along: 'x' | 'z', h: number) => {
      const g = new THREE.BoxGeometry(along === 'x' ? len : 0.45, h, along === 'z' ? len : 0.45);
      k.add(g, m.stone, x, h / 2 - 0.1, z);
      k.solid(along === 'x' ? len : 0.45, h, along === 'z' ? len : 0.45, x, h / 2, z);
    };
    for (let i = 0; i < 3; i++) wall(hx - HW / 2 + (HW / 3) * (i + 0.5), hz + HD / 2, HW / 3, 'x', i === 1 ? 1.0 : 1.4 + r() * 1.2);
    for (let i = 0; i < 3; i++) wall(hx - HW / 2 + (HW / 3) * (i + 0.5), hz - HD / 2, HW / 3, 'x', 1.6 + r() * 1.3);
    wall(hx + HW / 2, hz, HD, 'z', 2.2 + r() * 0.6);
    wall(hx - HW / 2, hz, HD, 'z', 2.8);
    // The gable end still standing, and the chimney.
    const tri = new THREE.Shape([new THREE.Vector2(-HD / 2, 0), new THREE.Vector2(HD / 2, 0), new THREE.Vector2(0, 2)]);
    const gable = new THREE.ExtrudeGeometry(tri, { depth: 0.45, bevelEnabled: false });
    gable.translate(0, 0, -0.225);
    k.addAt(gable, m.stone, hx - HW / 2, k.ground(hx - HW / 2, hz) + 2.7, hz, Math.PI / 2);
    k.add(new THREE.BoxGeometry(0.9, 5.4, 0.9), m.stone, hx - HW / 2 - 0.3, 2.6, hz + 0.6);
    k.post(0.6, 5, hx - HW / 2 - 0.3, hz + 0.6);
    // Fallen roof beams across the inside.
    for (let i = 0; i < 4; i++) k.add(new THREE.BoxGeometry(0.16, 0.16, HD + 1.2), m.timber, hx - 2 + i * 1.3, 0.6 + r() * 0.5, hz, (r() - 0.5) * 0.4, (r() - 0.5) * 0.5, 0.3 + r() * 0.3);
    // The barn: leaning posts, a sagging ridge, some planks.
    const bx = 7, bz = -2;
    for (const [px, pz] of [[-3, -4], [3, -4], [-3, 4], [3, 4], [-3, 0], [3, 0]]) k.add(new THREE.CylinderGeometry(0.14, 0.16, 4.2, 6), m.timber, bx + px, 2.0, bz + pz, 0, (r() - 0.5) * 0.12, 0.08 + (r() - 0.5) * 0.05);
    k.add(new THREE.BoxGeometry(0.2, 0.2, 8.6), m.timber, bx + 0.3, 4.0, bz, 0, 0.06, 0.08);
    for (let i = 0; i < 7; i++) k.add(new THREE.BoxGeometry(3.4, 0.06, 0.28), col(0x6a5640, 0.95), bx - 1.6, 3.2 - (i % 3) * 0.1, bz - 3.6 + i * 1.1, 0, 0, 0.55, 2);
    for (let i = 0; i < 5; i++) k.add(new THREE.BoxGeometry(3.4, 0.06, 0.28), col(0x6a5640, 0.95), bx + 1.8, 0.4, bz - 3 + i * 1.3, r() * 0.6, 0, 1.3, 2);
    // Rotten hay.
    for (let i = 0; i < 3; i++) k.add(rockGeo(r, 0.8, 0.45, 0.6), col(0x8a7a4a, 1), bx + (r() - 0.5) * 4, 0.2, bz + (r() - 0.5) * 6, r() * 3, 0, 0, 0);
    // Fences round the yard, broken.
    const fence = col(0x7a6248, 0.95);
    const yard = [[-13, -9], [15, -9], [15, 11], [-13, 11]];
    for (let e = 0; e < 4; e++) {
      const [ax, az] = yard[e], [bx2, bz2] = yard[(e + 1) % 4];
      const len = Math.hypot(bx2 - ax, bz2 - az), n = Math.floor(len / 2.6);
      for (let i = 0; i <= n; i++) {
        if (r() < 0.22) continue;
        const t = i / n, x = ax + (bx2 - ax) * t, z = az + (bz2 - az) * t;
        const lean = r() < 0.2 ? 0.5 : 0.05;
        k.add(new THREE.CylinderGeometry(0.07, 0.08, 1.3, 5), fence, x, 0.55, z, 0, (r() - 0.5) * lean, (r() - 0.5) * lean);
        if (i < n && r() > 0.3) {
          const ry = Math.atan2(bx2 - ax, bz2 - az);
          k.add(new THREE.BoxGeometry(0.06, 0.1, 2.6), fence, x + (bx2 - ax) / n / 2, 0.85, z + (bz2 - az) / n / 2, ry);
        }
      }
    }
    // An old trough, a cart wheel, nettles of rock.
    k.add(new THREE.BoxGeometry(1.6, 0.45, 0.55), col(0x6a5640, 0.95), 2, 0.22, 7, 0.4);
    // The cellar hatch: two plank doors in a frame.
    const hatch = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.18, 1.2), m.timber);
    hatch.add(frame);
    const lids: THREE.Object3D[] = [];
    for (const s of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set(s * 0.68, 0.1, 0);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.06, 1.06).translate(-s * 0.33, 0, 0), col(0x5a4632, 0.95));
      hinge.add(lid);
      hatch.add(hinge);
      lids.push(hinge);
    }
    const st = c.state;
    const setOpen = (o: boolean) => lids.forEach((l, i) => (l.rotation.z = o ? (i === 0 ? 1.7 : -1.7) : 0));
    setOpen(!!st.done);
    hatch.position.copy(k.at(hx + 1.5, hz + HD / 2 + 1.6, 0.05));
    hatch.rotation.y = c.site.yaw;
    k.live(hatch);
    const ratty = c.site.seed % 2 === 0;
    return {
      actions: [{
        at: hatch.position.clone(), radius: 2.2,
        label: () => 'Open the cellar hatch',
        enabled: () => !st.done,
        act: () => {
          setOpen(true);
          if (ratty) {
            c.hooks.toast('Rats pour up out of the dark! Whatever was down there, they have been at it.');
            for (let i = 0; i < 5; i++) {
              const p = hatch.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2));
              p.y = heightAt(p.x, p.z);
              c.spawn(new Rat(p, c.hooks.scene, c.hooks.fx));
            }
          }
          c.hooks.toast(`In the cellar: ${loot(c, 'cellar')}.`);
          c.finish();
        },
      }],
    };
  },
};

// ---- Hunter's camp ----------------------------------------------------------------------------

const HUNTERS: { name: string; look: Look; task: 'boar' | 'wolves'; line: string }[] = [
  { name: 'Tamsin Reed', look: { body: 'female', outfit: 'ranger', hood: true, hair: 'long', hairColor: 0x5a3a1e, skin: 0xd8a882, cloth: 0x4a5a2a, height: 1.7 }, task: 'boar', line: 'There\'s a boar about, a big old sow gone rogue. She\'s torn up every snare I set this week.' },
  { name: 'Old Hob', look: { body: 'male', outfit: 'ranger', hood: false, hair: 'buzzed', beard: true, hairColor: 0x9a9a92, skin: 0xc89874, cloth: 0x5a4a2a, height: 1.74 }, task: 'wolves', line: 'Wolves have been following me home three nights running. Bold ones. I\'m too old to see them off myself.' },
  { name: 'Brin of the Fells', look: { body: 'male', outfit: 'ranger', hood: true, hair: 'buzzed', beard: true, hairColor: 0x2a1a10, skin: 0x8a5a3a, cloth: 0x3a4a3a, height: 1.82 }, task: 'boar', line: 'A boar\'s got into the fells, a big tusker. He\'ll have someone\'s leg off before the month is out.' },
  { name: 'Kestrel', look: { body: 'female', outfit: 'ranger', hood: false, hair: 'buns', hairColor: 0x8a4a22, skin: 0xe8c0a0, cloth: 0x6a3a2a, height: 1.68 }, task: 'wolves', line: 'A pack\'s taken to the woods behind my camp. I could use a second blade before I lose my traps to them.' },
];

/**
 * A lean-to of hides on poles, a fire, a rack of drying pelts, log seats.
 * Rest by the fire to heal and save, or sleep until morning. In about half
 * the camps the hunter's at home, and has a job for you.
 */
export const HUNTER: SiteType = {
  kind: 'hunter', label: "Hunter's Camp", glyph: '⛺', color: '#c8a868', count: 14, clear: 10,
  habitats: ['forest', 'woodEdge', 'deepForest', 'hills'],
  build(c) {
    const k = c.kit, m = k.m, r = c.rnd;
    // The lean-to: a ridge pole on two forked posts, hides sloping to the ground.
    const hide = col(0x8a6a48, 1, { side: THREE.DoubleSide });
    for (const s of [-1, 1]) k.add(new THREE.CylinderGeometry(0.06, 0.07, 2.2, 5), m.bark, s * 1.4, 1.05, -2);
    k.add(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 5), m.bark, 0, 2.1, -2, 0, 0, Math.PI / 2);
    const roof = new THREE.PlaneGeometry(3.2, 2.6, 3, 3);
    const rp = roof.getAttribute('position');
    for (let i = 0; i < rp.count; i++) rp.setZ(i, Math.sin(rp.getX(i) * 2.1) * 0.05);
    roof.computeVertexNormals();
    k.add(roof, hide, 0, 1.05, -2.85, 0, 0.71, 0, 0);
    k.solid(3, 2, 1.6, 0, 1, -2.8);
    // A bedroll under it.
    k.add(new THREE.BoxGeometry(0.8, 0.12, 1.9), col(0x5a4a3a, 1), 0.5, 0.06, -2.8);
    // The fire, with a spit.
    k.campfire(0, 1.2);
    for (const s of [-1, 1]) k.add(new THREE.CylinderGeometry(0.03, 0.035, 1.2, 5), m.bark, s * 0.9, 0.55, 1.2);
    k.add(new THREE.CylinderGeometry(0.02, 0.02, 2.0, 5), m.bark, 0, 1.1, 1.2, 0, 0, Math.PI / 2);
    // A drying rack of pelts.
    for (const s of [-1, 1]) k.add(new THREE.CylinderGeometry(0.05, 0.05, 2.0, 5), m.bark, 3.4 + s * 1.1, 1.0, 0.5);
    k.add(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 5), m.bark, 3.4, 1.9, 0.5, 0, 0, Math.PI / 2);
    for (let i = 0; i < 3; i++) k.add(new THREE.PlaneGeometry(0.6, 0.9), col([0x7a5a3a, 0x9a8a72, 0x5a4a3a][i], 1, { side: THREE.DoubleSide }), 2.75 + i * 0.65, 1.42, 0.5, 0, 0, 0, 0);
    // Log seats and an antlered skull on a post.
    for (const [x, z, a] of [[-1.8, 1.6, 0.4], [1.6, 2.6, -0.8]]) k.add(new THREE.CylinderGeometry(0.22, 0.24, 1.3, 7), m.bark, x, 0.22, z, a, 0, Math.PI / 2);
    k.add(new THREE.CylinderGeometry(0.06, 0.07, 1.8, 5), m.bark, -3, 0.9, -0.5);
    k.add(new THREE.SphereGeometry(0.16, 8, 6), col(0xe0d4b4, 0.7), -3, 1.85, -0.45, 0, 0, 0, 0);
    for (const s of [-1, 1]) k.add(new THREE.CylinderGeometry(0.02, 0.03, 0.6, 4), col(0xd8c8a0, 0.7), -3 + s * 0.25, 2.05, -0.45, 0, 0, s * 0.7, 0);
    for (let i = 0; i < 4; i++) k.rock(-5 + r() * 10, 4 + r() * 3, 0.3 + r() * 0.4, 0.2);
    // The hunter (in about half the camps).
    const st = c.state;
    const fire = k.at(0, 1.2);
    const who = c.site.n % 2 === 0 ? HUNTERS[(c.site.n / 2) % HUNTERS.length] : null;
    let fig: Figure | null = null;
    if (who) {
      fig = new Figure(c.hooks.scene, who.look);
      fig.pos.copy(k.at(-1.8, 1.6, 0.25));
      fig.yaw = c.site.yaw + Math.atan2(1.8, -0.4);
      fig.play('sit');
    }
    const kv = (st.k ??= {});
    let foes: { alive: boolean }[] = [];
    const startJob = () => {
      kv.job = 'on';
      const away = k.at(0, -38);
      const lvl = c.hooks.level(c.site.x, c.site.z) + 1;
      if (who!.task === 'boar' && c.hooks.ready('boar')) {
        const b = new Boar(away, lvl, c.hooks.scene, c.hooks.fx, { size: 1.45 });
        foes = [b];
        c.spawn(b);
      } else if (c.hooks.ready('wolf')) {
        const pack = new Pack();
        foes = [0, 1, 2].map((i) => {
          const w = new Wolf(away.clone().add(new THREE.Vector3(i * 1.5, 0, i)), lvl, c.hooks.scene, c.hooks.fx, { pack, leader: i === 0 });
          c.spawn(w);
          return w;
        });
      } else foes = [];
      c.hooks.toast(who!.task === 'boar' ? 'The rogue boar is somewhere in the trees beyond the camp.' : 'The wolves are out in the trees beyond the camp.');
    };
    const talk = () => {
      const name = who!.name, title = 'Hunter';
      if (kv.job === 'paid') return c.hooks.talk(name, title, 'Sit, warm yourself. You\'ve earned a place at this fire any time.', [{ label: 'Thank you.', run: () => {} }]);
      if (kv.job === 'on') {
        if (foes.length && foes.every((f) => !f.alive)) {
          kv.job = 'paid';
          c.hooks.gold(60 + Math.round(c.site.danger * 120));
          c.hooks.give(who!.task === 'boar' ? 'boarHide' : 'wolfPelt', 2);
          c.hooks.xp(120);
          c.finish();
          return c.hooks.talk(name, title, who!.task === 'boar' ? 'You got her? Ha! Here, take your share of the coin, and the hide. I\'ll sleep tonight.' : 'All three? Then my traps are safe. Here: coin, and pelts from my own stock.', [{ label: 'Glad to help.', run: () => {} }]);
        }
        if (!foes.length || foes.every((f) => !f.alive)) {
          // Gone while you were away (the camp was out of reach): set it going again.
          return c.hooks.talk(name, title, 'They\'re still out there. I heard them last night.', [{ label: 'I\'ll go now.', run: startJob }]);
        }
        return c.hooks.talk(name, title, 'They\'re out there in the trees. Mind yourself.', [{ label: 'On my way.', run: () => {} }]);
      }
      c.hooks.talk(name, title, `${who!.line} Would you see to it? I'll make it worth your while.`, [
        { label: 'I\'ll deal with it.', run: startJob },
        { label: 'Not now.', run: () => {} },
      ]);
    };
    const restMenu = () => {
      const h = c.hooks.hour(), night = h >= 19 || h < 5;
      const opts = [{ label: 'Rest a while by the fire (heal, save)', run: () => { c.hooks.rest(); if (!who) c.finish(); } }];
      if (night) opts.push({ label: 'Sleep until morning', run: () => { c.hooks.sleep(); if (!who) c.finish(); } });
      opts.push({ label: 'Move on.', run: () => {} });
      c.hooks.talk('The Fire', "Hunter's Camp", night ? 'The fire is warm and the night is long. You could sleep here until morning.' : 'A good fire, and nobody minds you sitting by it.', opts);
    };
    const actions: SiteAction[] = [{ at: fire, radius: 2.6, label: () => 'Rest by the fire', act: restMenu }];
    if (who && fig) actions.push({ at: fig.pos.clone(), radius: 2.2, label: () => `Talk to ${who.name}`, act: talk });
    return {
      actions,
      update: (dt) => fig?.update(dt),
      dispose: () => fig?.dispose(),
    };
  },
};

// ---- Wayside shrine ---------------------------------------------------------------------------

const SHRINES: { id: string; name: string; text: string; m: Record<string, number>; mark: (g: CanvasRenderingContext2D) => void; tint: number }[] = [
  {
    id: 'dawn', name: 'the Dawn', text: 'Blessing of the Dawn: +30 health, healing does more', m: { hp: 30, heal: 0.25 }, tint: 0xffd890,
    mark: (g) => { g.beginPath(); g.arc(32, 36, 12, 0, Math.PI * 2); g.fill(); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.fillRect(32 + Math.cos(a) * 16 - 2, 36 + Math.sin(a) * 16 - 2, 4, 4); } },
  },
  {
    id: 'wheel', name: 'the Wheel', text: 'Blessing of the Wheel: stamina comes back faster, and costs less', m: { staminaRegen: 0.3, staminaCost: -0.12 }, tint: 0xffe0a0,
    mark: (g) => { g.lineWidth = 4; g.beginPath(); g.arc(32, 36, 15, 0, Math.PI * 2); g.stroke(); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.beginPath(); g.moveTo(32, 36); g.lineTo(32 + Math.cos(a) * 15, 36 + Math.sin(a) * 15); g.stroke(); } },
  },
  {
    id: 'kings', name: 'the Old Kings', text: 'Blessing of the Old Kings: you take less damage, and stand firmer', m: { dmgTaken: -0.1, poise: 0.25 }, tint: 0xc8e0b0,
    mark: (g) => { g.beginPath(); g.moveTo(14, 46); g.lineTo(14, 26); g.lineTo(22, 34); g.lineTo(32, 20); g.lineTo(42, 34); g.lineTo(50, 26); g.lineTo(50, 46); g.closePath(); g.fill(); },
  },
  {
    id: 'moon', name: 'the Moon', text: 'Blessing of the Moon: mana comes back faster, spells hit harder', m: { manaRegen: 0.4, spell: 0.1 }, tint: 0xb8c8ff,
    mark: (g) => { g.beginPath(); g.arc(32, 36, 15, 0, Math.PI * 2); g.fill(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(40, 30, 13, 0, Math.PI * 2); g.fill(); g.globalCompositeOperation = 'source-over'; },
  },
];
const shrineTex = new Map<string, THREE.Texture>();
function shrineMark(i: number) {
  const s = SHRINES[i];
  let t = shrineTex.get(s.id);
  if (!t) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#7a7266';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = g.strokeStyle = '#e8d8a8';
    s.mark(g);
    t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    shrineTex.set(s.id, t);
  }
  return t;
}

/**
 * A little roofed shrine by an old path: a stone plinth, a carved plaque, an
 * offering bowl, candles. Four kinds (the Dawn, the Wheel, the Old Kings and
 * the Moon), each with its own blessing for ten minutes, once a day.
 */
export const SHRINE: SiteType = {
  kind: 'shrine', label: 'Wayside Shrine', glyph: '✚', color: '#f0e0a0', count: 16, clear: 6,
  habitats: ['meadow', 'woodEdge', 'hills', 'forest', 'lakeshore'],
  name: (s) => `Shrine of ${SHRINES[s.n % 4].name}`,
  build(c) {
    const k = c.kit, m = k.m;
    const S = SHRINES[c.site.n % 4];
    k.add(new THREE.BoxGeometry(1.5, 0.35, 1.2), m.stone, 0, 0.1, 0);
    k.add(new THREE.BoxGeometry(1.1, 1.0, 0.7), m.stone, 0, 0.75, -0.1);
    k.solid(1.5, 1.4, 1.2, 0, 0.6, 0);
    // Posts and a little gable roof.
    for (const [x, z] of [[-0.7, -0.5], [0.7, -0.5], [-0.7, 0.5], [0.7, 0.5]]) k.add(new THREE.BoxGeometry(0.12, 2.1, 0.12), m.timber, x, 1.05, z);
    for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(1.8, 0.07, 0.95), m.thatch, 0, 2.3, s * 0.36, 0, s * 0.55, 0, 0);
    k.add(new THREE.BoxGeometry(1.85, 0.1, 0.1), m.timber, 0, 2.55, 0);
    // The carved plaque.
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshStandardMaterial({ map: shrineMark(c.site.n % 4), roughness: 0.9 }));
    plaque.position.copy(k.at(0, 0.26, 0.95));
    plaque.rotation.y = c.site.yaw;
    k.live(plaque);
    // Offering bowl, flowers, candles.
    k.add(new THREE.CylinderGeometry(0.18, 0.1, 0.1, 10), col(0x8a6a4a, 0.6), 0, 1.3, 0.12);
    const st = c.state;
    const candles: THREE.Mesh[] = [];
    const flameMat = new THREE.MeshBasicMaterial({ color: S.tint });
    for (const x of [-0.38, 0.38]) {
      k.add(new THREE.CylinderGeometry(0.035, 0.04, 0.22, 6), col(0xeee4cc, 0.6), x, 1.36, 0.1);
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), flameMat);
      f.scale.set(1, 1.8, 1);
      f.position.copy(k.at(x, 0.1, 1.52));
      k.live(f);
      candles.push(f);
    }
    const light = new THREE.PointLight(S.tint, 0.8, 5, 2);
    light.position.copy(k.at(0, 0.3, 1.7));
    k.live(light);
    for (let i = 0; i < 5; i++) k.add(new THREE.SphereGeometry(0.06, 5, 4), col([0xe8c040, 0xe86a7a, 0xf0f0e0][i % 3], 0.8), -0.6 + c.rnd() * 1.2, 0.02, 0.8 + c.rnd() * 0.3, 0, 0, 0, 0);
    const today = () => c.hooks.day();
    let t = 0;
    return {
      actions: [{
        at: k.at(0, 1.2, 1.0), radius: 2.4,
        label: () => (st.day === today() ? `You have prayed at the shrine of ${S.name} today` : `Pray at the shrine of ${S.name}`),
        act: () => {
          if (st.day === today()) return c.hooks.toast('The candles burn steady. Come back tomorrow.');
          st.day = today();
          c.hooks.bless({ id: 'shrine:' + S.id, label: S.text, sec: 600, m: S.m });
          c.finish();
        },
      }],
      update: (dt) => {
        t += dt;
        for (const f of candles) f.scale.y = 1.6 + Math.sin(t * 11 + f.position.x) * 0.25;
        light.intensity = 0.7 + Math.sin(t * 9) * 0.1;
      },
    };
  },
};

// ---- Sunwheel standing stones ------------------------------------------------------------------

/** What the twelve stones say, in the order you're meant to read them (any order works). */
export const STONE_LINES = [
  'Eight rays bent round one eye. The wheel watches the dark so that the rest of us need not.',
  'When the old lord of the dark grows old, the wheel turns. Mark it: every turning has a price.',
  'We raised these stones where the dark runs thin. Do not sleep inside a ring that is wrong.',
  'The great ones swore by the wheel never to strike one another. They keep the letter of it.',
  'A champion is a vow kept by other hands.',
  'They called the first one from very far away. The wheel did not know her face.',
  'Count the summoned. When the count reaches five, look hard at the one who calls.',
  'Light sees the wheel as a sun. The dark sees it as a door.',
  'The eye in the wheel is open. On the day it closes, the dark has a new master.',
  'The barrow kings kept the wheel before the Crown was thought of. Ask the dead; they remember.',
  'Where violet light leaks out, the wheel is cracked. It is mended with fire, or with blood.',
  'I carved these alone, and I am the last who can read them. If you have read all twelve, you are the one who was called. Go carefully, fifth.',
];

/**
 * A single tall standing stone, leaning a little, the Sunwheel carved on its
 * face, small stones round its foot. Read it for a line of the old lore; read
 * all twelve and the wheel gives you something back.
 */
export const STONE: SiteType = {
  kind: 'stone', label: 'Sunwheel Stone', glyph: '◈', color: '#ffd88a', count: 12, clear: 6,
  habitats: ['meadow', 'hills', 'woodEdge', 'mountain', 'lakeshore'],
  score: (_x, _z, h) => 0.4 + Math.min(0.6, h / 30),
  build(c) {
    const k = c.kit, r = c.rnd;
    const stoneMat = col(0x8a8680, 0.95);
    const g = rockGeo(r, 0.62, 2.1, 0.42, 2);
    k.add(g, stoneMat, 0, 1.5, 0, 0, 0.06, (r() - 0.5) * 0.08, 0);
    k.post(0.55, 3.2, 0, 0);
    // The wheel on its face (a decal that glows once read).
    const st = c.state;
    const glyph = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), (sunwheelMat() as THREE.MeshStandardMaterial).clone());
    glyph.position.copy(k.at(0, 0.44, 2.0));
    glyph.rotation.y = c.site.yaw;
    k.live(glyph);
    const gm = glyph.material as THREE.MeshStandardMaterial;
    gm.emissiveIntensity = st.done ? 1.4 : 0.25;
    // Lichen, and a ring of small stones.
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      k.add(rockGeo(r, 0.22, 0.16, 0.2, 0), stoneMat, Math.cos(a) * 2.2, 0.05, Math.sin(a) * 2.2, 0, 0, 0, 0);
    }
    const line = STONE_LINES[c.site.n % STONE_LINES.length];
    return {
      actions: [{
        at: k.at(0, 1.1), radius: 2.6,
        label: () => (st.done ? 'Read the stone again' : 'Read the carving on the stone'),
        act: () => {
          const first = !st.done;
          c.finish();
          gm.emissiveIntensity = 1.4;
          const read = c.others('stone').filter((s) => s.done).length;
          c.hooks.toast(`"${line}" (Sunwheel stone ${read} of 12)`);
          if (first) {
            c.hooks.xp(30);
            if (read === 12) {
              c.hooks.give('sunwheelCharm', 1);
              c.hooks.toast('As you read the last stone, warmth runs out of it into your hands, and a small disc of gold with the Sunwheel on it is lying at its foot. You have read all twelve.');
            }
          }
        },
      }],
    };
  },
};

// ---- Wrecked caravan --------------------------------------------------------------------------

/**
 * A wagon on its side off an old track, its cover torn, its load spilled
 * across the grass: crates, barrels, sacks, a broken wheel. Arrows in the
 * planks, or claw marks. Often whatever wrecked it is still close by.
 */
export const CARAVAN: SiteType = {
  kind: 'caravan', label: 'Wrecked Caravan', glyph: '✣', color: '#e0b878', count: 16, clear: 10,
  habitats: ['meadow', 'woodEdge', 'hills', 'forest'],
  nearRoad: 260,
  build(c) {
    const k = c.kit, r = c.rnd;
    const wood = col(0x7a5e40, 0.9), canvas = col(0xc8b896, 1, { side: THREE.DoubleSide });
    // The wagon on its side.
    const wagon = new THREE.Group();
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 3.6), wood);
    wagon.add(bed);
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 3.6), wood);
      side.position.set(s * 0.86, 0.32, 0);
      wagon.add(side);
    }
    for (let i = 0; i < 4; i++) {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.03, 4, 12, Math.PI), wood);
      hoop.position.set(0, 0.55, -1.4 + i * 0.93);
      wagon.add(hoop);
    }
    const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.93, 0.93, 2.4, 12, 1, true, -Math.PI / 2, Math.PI * 0.7).rotateX(Math.PI / 2), canvas);
    cover.position.set(0, 0.55, -0.5);
    wagon.add(cover);
    for (const [x, z] of [[-0.95, 1.3], [0.95, 1.3], [0.95, -1.3]]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 5, 16), wood);
      wheel.rotation.y = Math.PI / 2;
      wheel.position.set(x, -0.1, z);
      wagon.add(wheel);
      for (let sp = 0; sp < 6; sp++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.95, 0.03), wood);
        spoke.position.copy(wheel.position);
        spoke.rotation.set(sp * 0.52, Math.PI / 2, 0);
        wagon.add(spoke);
      }
    }
    // Arrows in the planks (bandits), or long gouges (beasts).
    const beasts = c.site.seed % 3 !== 0;
    if (!beasts) for (let i = 0; i < 5; i++) {
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.6, 4), col(0x6a5a3a, 0.9));
      a.position.set(-0.9, 0.3 + r() * 0.2, -1.2 + r() * 2.4);
      a.rotation.z = Math.PI / 2 + (r() - 0.5) * 0.4;
      wagon.add(a);
    }
    wagon.rotation.z = Math.PI / 2 - 0.12;
    k.addObject(wagon, 0, 0.92, 0, 0.3);
    k.solid(1.4, 1.9, 3.8, 0, 0.95, 0, 0.3);
    // The loose wheel, spilled crates, barrels and sacks, torn canvas.
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 5, 16), wood);
    wheel.rotation.x = Math.PI / 2;
    k.addObject(wheel, 2.6, 0.06, 2.2, r());
    for (let i = 0; i < 4; i++) k.crate(-3 + r() * 6, 2 + r() * 4, 0.5 + r() * 0.2, r() * 3);
    for (let i = 0; i < 3; i++) k.barrel(2 + r() * 3, -2 + r() * 4, 1, r() < 0.6);
    for (let i = 0; i < 6; i++) k.add(rockGeo(r, 0.32, 0.22, 0.42, 0), col(0xa8986a, 1), -4 + r() * 8, 0.12, -3 + r() * 8, r() * 3, 0, 0, 0);
    k.add(new THREE.PlaneGeometry(2.2, 1.6, 3, 2), canvas, -2.5, 0.05, -2.5, r() * 3, -Math.PI / 2 + 0.05, 0, 0);
    // Bolts of cloth tumbled out.
    for (let i = 0; i < 3; i++) k.add(new THREE.CylinderGeometry(0.16, 0.16, 1.1, 10), col([0x8a2a2a, 0x2a4a7a, 0x6a7a3a][i], 0.95), -1 + i * 0.6, 0.16, 3 + r(), r() * 3, 0, Math.PI / 2, 0);
    const st = c.state;
    const kv = (st.k ??= {});
    let guards: { alive: boolean }[] = [];
    const guarded = !st.done && (c.site.seed % 2 === 0 || c.site.danger > 0.4) && !kv.cleared;
    let roused = false;
    return {
      actions: [{
        at: k.at(1.5, 2.5), radius: 3.2,
        label: () => (guards.some((g) => g.alive) ? 'Not while they are still about' : 'Search the wreckage'),
        enabled: () => !st.done,
        act: () => {
          if (guards.some((g) => g.alive)) return;
          c.hooks.toast(`Among the wreckage: ${loot(c, 'caravan')}.`);
          c.finish();
        },
      }],
      update: (_dt, player) => {
        if (!guarded || roused) {
          if (roused && guards.length && guards.every((g) => !g.alive) && !kv.cleared) kv.cleared = true;
          return;
        }
        if (Math.hypot(player.pos.x - c.site.x, player.pos.z - c.site.z) > 30) return;
        roused = true;
        const lvl = c.hooks.level(c.site.x, c.site.z);
        const at = (i: number) => k.at(-5 + i * 2.4, -6 - (i % 2) * 2);
        if (beasts && c.hooks.ready('wolf')) {
          const pack = new Pack();
          const n = 2 + (c.site.danger > 0.4 ? 2 : 1);
          for (let i = 0; i < n; i++) {
            const w = new Wolf(at(i), lvl, c.hooks.scene, c.hooks.fx, { pack, leader: i === 0 });
            guards.push(w);
            c.spawn(w);
          }
          c.hooks.toast('Wolves are feeding at the wreck. They lift their heads.');
        } else if (c.hooks.ready('boar')) {
          const b = new Boar(at(0), lvl + 1, c.hooks.scene, c.hooks.fx, { size: 1.3 });
          guards.push(b);
          c.spawn(b);
          c.hooks.toast('A boar is rooting through the spilled grain, and doesn\'t mean to share it.');
        }
      },
    };
  },
};

export const BATCH1: SiteType[] = [TOWER, FARMSTEAD, HUNTER, SHRINE, STONE, CARAVAN];
export type { Site, SiteLive };
