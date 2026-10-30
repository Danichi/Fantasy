import * as THREE from 'three';
import { pbr } from '../props';
import { col, rockGeo, sunwheelMat } from './kit';
import { SINKHOLE, DROWNED_MERE, heightAt } from '../terrainHeight';
import type { SiteCtx, SiteType } from './types';

// The five discovery bosses' places (docs/design/sites.md). Unlike the other
// sites these stand at chosen spots (the sinkhole and the mere are cut into
// the terrain itself). Each has something you do there that wakes what lives
// in it, and it happens once.

/** Where they stand. The sinkhole and the mere are in terrainHeight.ts. */
export const DISCOVERY = {
  drownedTower: { x: DROWNED_MERE.tower.x, z: DROWNED_MERE.tower.z, yaw: DROWNED_MERE.tower.yaw },
  sinkhole: { x: SINKHOLE.x, z: SINKHOLE.z, yaw: 0.6 },
  hangingTree: { x: -1320, z: -80, yaw: 2.2 },
  wrongCircle: { x: 2200, z: -730, yaw: 0 },
  mine: { x: 900, z: -1820, yaw: 3.6 },
};

/** The boss lies dead, or never came: it's over. */
const over = (c: SiteCtx, id: string) => c.hooks.boss(id).slain;

/** Summon (once its creature is built) and wake it. */
function rouse(c: SiteCtx, id: string, at: THREE.Vector3 | undefined, wake: (b: unknown) => void) {
  const b = c.hooks.boss(id);
  if (b.slain) return false;
  const body = b.body ?? b.summon(at);
  if (!body) {
    c.hooks.toast('Something stirs, then settles again. (Try again in a moment.)');
    return false;
  }
  wake(body);
  return true;
}

// ---- The Drowned Watchtower --------------------------------------------------------------------

const CAPTAINS_LOG = '"Day 41. The water is at the second stair. The men want to leave. I will not leave my tower. The king said hold it, and I will hold it until the king says otherwise, and the king is dead, so I will hold it forever. If you are reading this, relieve me, or join me." The ink at the bottom is not ink.';

/**
 * A round watchtower that the mere rose round and half drowned, leaning,
 * weed to the second stair. The door on the shore side opens on a flooded
 * room; the captain's last log is on a shelf above the water. Read it, and the
 * captain comes up out of the mere to hold his tower.
 */
export const DROWNED_TOWER: SiteType = {
  kind: 'drownedTower', label: 'The Drowned Watchtower', glyph: '♜', color: '#80c8b8', count: 1, clear: 20,
  habitats: [], at: DISCOVERY.drownedTower,
  build(c) {
    const k = c.kit, m = k.m;
    const water = DROWNED_MERE.water;
    // The mere's own water: dark, still, weedy.
    const pool = new THREE.Mesh(new THREE.CircleGeometry(DROWNED_MERE.r + 13, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x24403c, roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.86 }));
    pool.position.set(DROWNED_MERE.x, water, DROWNED_MERE.z);
    pool.receiveShadow = true;
    k.live(pool);
    for (let i = 0; i < 18; i++) {
      // Lily pads and scum near the edges.
      const a = c.rnd() * Math.PI * 2, d = DROWNED_MERE.r * (0.55 + c.rnd() * 0.35);
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.4 + c.rnd() * 0.4, 7).rotateX(-Math.PI / 2), col(0x3a6a2a, 0.8));
      pad.position.set(DROWNED_MERE.x + Math.cos(a) * d, water + 0.02, DROWNED_MERE.z + Math.sin(a) * d);
      k.live(pad);
    }
    // The tower: 4 m across, 13 m tall, leaning out over the water.
    const lean = 0.09;
    const stone = col(0x6a7068, 0.95);
    const shaft = new THREE.CylinderGeometry(2.1, 2.4, 13, 14, 6, true);
    k.addAt(shaft, m.stone, 0, water + 4.5, 0, 0, lean, 0, 1.5);
    const inner = new THREE.CylinderGeometry(1.8, 2.1, 13, 14, 1, true);
    k.addAt(inner, stone, 0, water + 4.5, 0, 0, lean, 0, 0);
    // Broken crenellations at the top; a collapsed hole on the lake side.
    for (let i = 0; i < 10; i++) {
      if (i === 6 || i === 7) continue;
      const a = (i / 10) * Math.PI * 2;
      k.addAt(new THREE.BoxGeometry(0.8, 0.6 + (i % 3) * 0.3, 0.45), m.stone, Math.sin(a) * 2.15, water + 11.2 + Math.sin(a) * lean * 2.2, Math.cos(a) * 2.15 + lean * 10, -a, 0, 0, 1.5);
    }
    // Weed and slime line up to the second stair.
    k.addAt(new THREE.CylinderGeometry(2.44, 2.48, 2.2, 14, 1, true), col(0x2a3a22, 1), 0, water + 0.6, 0.05, 0, lean, 0, 0);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      k.addAt(new THREE.ConeGeometry(0.08, 0.6 + (i % 4) * 0.25, 4), col(0x3a5a2a, 1), Math.sin(a) * 2.5, water + 1.4, Math.cos(a) * 2.5, 0, Math.PI, 0, 0);
    }
    // The door on the shore side (local -z), a step of stones out to dry land.
    k.addAt(new THREE.BoxGeometry(1.1, 2.0, 0.3), col(0x10120e, 1), 0, water + 1.2, -2.35, 0, 0, 0, 0);
    for (let i = 0; i < 6; i++) {
      const z = -3.3 - i * 1.3;
      k.addAt(rockGeo(c.rnd, 0.7, 0.35, 0.6, 1), stone, (i % 2 ? 0.3 : -0.25), water + 0.05, z, i, 0, 0, 0);
      k.solidAt(1.0, 0.5, 0.9, (i % 2 ? 0.3 : -0.25), water - 0.1, z);
    }
    k.solidAt(5, 14, 5, 0, water + 5, 0.5);
    // Rotten boats pulled up on the shore, a flagpole with a rag of the old colours.
    k.add(new THREE.CylinderGeometry(0.8, 0.8, 3.6, 10, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).scale(1, 0.5, 1), m.planks, 5, 0.25, -12, 0.4, 0.2, 0.2, 1.5);
    k.add(new THREE.CylinderGeometry(0.06, 0.08, 6, 6), m.timber, -4, 3, -11, 0, 0.12, 0.05);
    const rag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7, 4, 2), col(0x5a2a2a, 1, { side: THREE.DoubleSide }));
    rag.position.copy(k.at(-3.4, -11, 5.4));
    k.live(rag);
    // The log, on a shelf just inside the door.
    const st = c.state;
    const logAt = k.at(0, -2.9);
    logAt.y = water + 1.2;
    const glow = new THREE.PointLight(0x50ff9a, 0, 8, 2);
    glow.position.copy(k.at(0, 3, 0)).setY(water + 0.4);
    k.live(glow);
    let t = 0;
    return {
      actions: [{
        at: logAt, radius: 3,
        label: () => (over(c, 'drownedCaptain') ? 'The captain\'s log (read it again)' : 'Read the captain\'s last log'),
        act: () => {
          c.hooks.talk('The Captain\'s Log', 'water-stained, on a shelf above the flood', CAPTAINS_LOG, []);
          if (over(c, 'drownedCaptain')) return;
          if (!st.k?.read) {
            (st.k ??= {}).read = true;
          }
          // Beside the stepping stones, the mere heaves.
          const rise = k.at(3.2, -7);
          rise.y = water;
          rouse(c, 'drownedCaptain', rise, (b) => {
            (b as { rouse(): void }).rouse();
            c.hooks.fx.add.spawn({ pos: rise.clone().setY(water + 0.3), spread: 2, count: 50, life: [0.6, 1.2], size: [0.2, 0.05], color: 0x8ac8c0, color2: 0x1a2a2a, gravity: 6, upBias: 2 });
            c.hooks.toast('Water pours off something rising out of the mere behind you. A drowned man in a rusted helm, sword in hand. He has come to hold his tower.');
          });
        },
      }],
      update: (dt) => {
        t += dt;
        // A green light under the water while the captain sleeps.
        glow.intensity = over(c, 'drownedCaptain') ? 0 : (c.hooks.hour() >= 19 || c.hooks.hour() < 5 ? 3 : 0.8) * (0.8 + Math.sin(t * 1.3) * 0.2);
        rag.rotation.y = c.site.yaw + Math.sin(t * 2.1) * 0.25;
        if (over(c, 'drownedCaptain') && !st.done) c.finish();
      },
    };
  },
};

// ---- The Sinkhole -------------------------------------------------------------------------------

/**
 * A collapsed pit in the hills, ringed with a broken fence and a warning cut
 * in a board. The rim is rotten: go near the edge and it gives way, and you
 * come down in front of the Rat Queen. A slope of fallen earth on one side is
 * the way out.
 */
export const SINKHOLE_SITE: SiteType = {
  kind: 'sinkhole', label: 'The Sinkhole', glyph: '◉', color: '#b89a70', count: 1, clear: SINKHOLE.r + 12,
  habitats: [], at: DISCOVERY.sinkhole,
  build(c) {
    const k = c.kit, m = k.m, r = c.rnd;
    const R = SINKHOLE.r;
    const st = c.state;
    // The broken fence round the rim, and the warning.
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      if (i % 5 === 2) continue;
      const x = Math.cos(a) * (R + 4), z = Math.sin(a) * (R + 4);
      k.add(new THREE.CylinderGeometry(0.07, 0.09, 1.3, 5), m.timber, x, 0.55, z, 0, (r() - 0.5) * 0.3, (r() - 0.5) * 0.3);
      if (i % 3 !== 1) k.add(new THREE.BoxGeometry(0.06, 0.1, 2 * Math.PI * (R + 4) / 16), m.planks, Math.cos(a + 0.2) * (R + 4), 0.9, Math.sin(a + 0.2) * (R + 4), -a - 0.2 + Math.PI / 2, 0, (r() - 0.5) * 0.3);
    }
    const sx = Math.cos(-0.4) * (R + 6), sz = Math.sin(-0.4) * (R + 6);
    k.add(new THREE.CylinderGeometry(0.06, 0.07, 1.6, 5), m.timber, sx, 0.8, sz);
    k.add(new THREE.BoxGeometry(0.9, 0.45, 0.05), m.planks, sx, 1.4, sz + 0.05, 0.4);
    // Bones and a dead sheep at the bottom; burrow mouths in the walls.
    const floor = SINKHOLE.floor;
    // The walls: raw dark earth and broken stone (the open side to the east is the slope out).
    {
      let rim = 0;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        rim += heightAt(SINKHOLE.x + Math.cos(a) * (R + 3), SINKHOLE.z + Math.sin(a) * (R + 3));
      }
      rim /= 12;
      const depth = rim - floor;
      const wall = new THREE.CylinderGeometry(R + 0.6, R - 2.6, depth + 0.4, 40, 4, true, Math.PI / 2 + 0.5, Math.PI * 2 - 1.0);
      const p = wall.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const j = 1 - 0.035 * Math.abs(Math.sin(x * 1.7 + y * 2.3) + Math.cos(z * 1.3 - y * 1.9));
        p.setXYZ(i, x * j, y, z * j);
      }
      wall.computeVertexNormals();
      // Raw earth and rock: a real rock face, tinted to warm earth, tiled to the wall's size.
      const wallMat = pbr(new THREE.TextureLoader(), 'rock_face_03', { color: new THREE.Color(1.15, 0.95, 0.78), roughness: 1, side: THREE.DoubleSide }, 8, 0.25);
      for (const t of [wallMat.map, wallMat.normalMap, wallMat.roughnessMap, wallMat.aoMap]) t?.repeat.set(Math.round((2 * Math.PI * R) / 7), Math.max(1, Math.round(depth / 7)));
      const earth = new THREE.Mesh(wall, wallMat);
      earth.position.set(SINKHOLE.x, floor + (depth + 0.4) / 2 - 0.2, SINKHOLE.z);
      earth.receiveShadow = true;
      k.live(earth);
      for (let i = 0; i < 16; i++) {
        const a = 0.6 + (i / 16) * (Math.PI * 2 - 1.2);
        const rk = new THREE.Mesh(rockGeo(r, 0.9 + r() * 0.6, 0.6 + r() * 0.5, 0.8, 1), k.m.stone);
        // Fallen from the walls: heaped at their foot.
        const y = r() * 1.2;
        const rad = R - 2.9 + (y / depth) * 3.2;
        rk.position.set(SINKHOLE.x + Math.cos(a) * rad, floor + 0.2 + y, SINKHOLE.z + Math.sin(a) * rad);
        k.live(rk);
      }
    }
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2, d = r() * (R - 6);
      k.addAt(new THREE.CylinderGeometry(0.03, 0.035, 0.4 + r() * 0.3, 5), col(0xd8d0b8, 0.7), Math.cos(a) * d, floor + 0.05, Math.sin(a) * d, r() * 3, Math.PI / 2, 0, 0);
    }
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      const hole = new THREE.CircleGeometry(0.8, 10);
      hole.scale(1, 0.7, 1);
      const p = k.at(Math.cos(a) * (R - 2.4), Math.sin(a) * (R - 2.4));
      p.y = floor + 1.0;
      const mesh = new THREE.Mesh(hole, col(0x0a0806, 1));
      mesh.position.copy(p);
      mesh.lookAt(k.at(0, 0).setY(floor + 1.0));
      k.batch.addObject(mesh);
    }
    // Her nest: straw, bones and filth heaped against the wall.
    for (let i = 0; i < 14; i++) k.addAt(rockGeo(r, 0.8, 0.3, 0.6, 0), col([0x8a7a4a, 0x5a4a30, 0xb8a888][i % 3], 1), -3 + (r() - 0.5) * 5, floor + 0.1, 2 + (r() - 0.5) * 4, r() * 3, 0, 0, 0);
    let fell = false;
    const giveWay = (drop: boolean) => {
      if (fell || over(c, 'ratQueen')) return;
      fell = true;
      const p = c.hooks.player.pos;
      c.hooks.fx.add.spawn({ pos: p.clone(), spread: 2.5, count: 50, life: [0.5, 1.2], size: [0.2, 0.05], color: 0x6a5a40, color2: 0x2a2018, gravity: 7, upBias: 1 });
      c.hooks.toast('The edge gives way under you!');
      if (drop) {
        // Down the crumbling side to the floor of the pit.
        const a = Math.atan2(p.z - SINKHOLE.z, p.x - SINKHOLE.x);
        const at = new THREE.Vector3(SINKHOLE.x + Math.cos(a) * (R - 5), floor + 0.3, SINKHOLE.z + Math.sin(a) * (R - 5));
        c.hooks.teleport(at, a + Math.PI / 2);
      }
      rouse(c, 'ratQueen', undefined, (b) => {
        (b as { wake(): void }).wake();
        c.hooks.toast('Something huge uncurls in the dark at the bottom of the pit. A rat, the size of an ox, with a crown of bone.');
      });
    };
    return {
      actions: [{
        at: k.at(Math.cos(-0.4) * (R + 2), Math.sin(-0.4) * (R + 2)), radius: 3.5,
        label: () => (over(c, 'ratQueen') ? 'The sinkhole is quiet now' : 'Look over the edge'),
        enabled: () => !over(c, 'ratQueen'),
        act: () => giveWay(true),
      }],
      update: (_dt, player) => {
        if (over(c, 'ratQueen')) {
          if (!st.done) c.finish();
          return;
        }
        // Walk onto the rotten rim and it goes.
        const d = Math.hypot(player.pos.x - SINKHOLE.x, player.pos.z - SINKHOLE.z);
        if (!fell && d < R + 0.5) giveWay(false);
        if (d > R + 40) fell = false;
      },
    };
  },
};

// ---- The Hanging Tree ---------------------------------------------------------------------------

const GRAVE_BOARD = 'Cut into a board, nearly gone: "RED CORWEN. HANGED HERE BY THE KING\'S JUSTICE FOR THE ROBBING OF THE SILVER TRAIN. THE SILVER WAS NEVER FOUND." Somebody has scratched underneath: "dig at midnight if you dare".';

/**
 * A great dead oak alone by the road, a rope still on its hanging branch, and
 * a robber's grave among its roots. At midnight, dig, and Red Corwen climbs
 * out for his silver.
 */
export const HANGING_TREE: SiteType = {
  kind: 'hangingTree', label: 'The Hanging Tree', glyph: '♆', color: '#c89070', count: 1, clear: 16,
  habitats: [], at: DISCOVERY.hangingTree,
  build(c) {
    const k = c.kit, r = c.rnd;
    const st = c.state;
    const bark = k.m.bark;
    // The tree, built in the site's frame: a twisted trunk, roots, and limbs that reach out and up.
    const tree = new THREE.Group();
    const limb = (from: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number) => {
      const d = to.clone().sub(from);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, d.length(), 7, 3), bark);
      mesh.position.copy(from).addScaledVector(d, 0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      tree.add(mesh);
      return to;
    };
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    limb(V(0, -0.5, 0), V(0.2, 7, 0.1), 1.5, 0.85);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + r() * 0.4;
      limb(V(Math.cos(a) * 0.6, 1.0, Math.sin(a) * 0.6), V(Math.cos(a) * 3.2, -0.3, Math.sin(a) * 3.2), 0.45, 0.12);
    }
    const crown: [number, number, number][] = [[-3.5, 10.5, -1], [-1.5, 12, 2], [1.2, 11.5, -2.4], [-0.5, 13, -0.3]];
    for (const [x, y, z] of crown) {
      const mid = limb(V(0.2, 6.6, 0.1), V(x * 0.6, y * 0.82, z * 0.6), 0.5, 0.3);
      const tip = limb(mid, V(x, y, z), 0.3, 0.1);
      limb(mid, V(x * 0.9 + 1, y - 0.6, z * 0.9 + 0.8), 0.18, 0.05);
      limb(tip, V(x * 1.15, y + 1.2, z * 1.15), 0.1, 0.03);
    }
    // The hanging branch: out level over the grave.
    const hang = limb(V(0.4, 6.4, 0), V(5.6, 7.5, 0.1), 0.42, 0.14);
    limb(hang, V(6.4, 8.4, 0.3), 0.14, 0.04);
    k.addObject(tree, 0, 0, 0);
        const rope = new THREE.Group();
    rope.add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.4, 5).translate(0, -1.2, 0), col(0x8a7a52, 1)));
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.03, 5, 12), col(0x8a7a52, 1));
    loop.position.y = -2.55;
    rope.add(loop);
    rope.position.copy(k.at(4.6, 0, 7.2));
    k.live(rope);
    k.post(1.1, 7, 0, 0);
    // The grave: a sunken mound, the board, a spade left in it.
    k.add(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.25, 2), col(0x4a3a2a, 1), 4.6, -0.05, 0.6, 0.2, 0, 0, 0);
    void r;
    k.add(new THREE.BoxGeometry(0.7, 0.9, 0.06), col(0x6a5a44, 1), 4.6, 0.6, -1.7, 0.1, -0.1, 0.08);
    k.add(new THREE.BoxGeometry(0.22, 0.32, 0.03), col(0x7a7a78, 0.4, { metal: 0.6 }), 5.6, 0.2, 1.4, 0.4, 0.25, 0);
    k.add(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 5), k.m.timber, 5.6, 0.85, 1.4, 0.4, 0.25, 0);
    const midnight = () => {
      const h = c.hooks.hour();
      return h >= 23.5 || h < 1;
    };
    let t = 0;
    return {
      actions: [
        { at: k.at(4.6, -1.7, 0.6), radius: 2.2, label: () => 'Read the grave board', act: () => c.hooks.talk('A Grave Board', 'under the Hanging Tree', GRAVE_BOARD, []) },
        {
          at: k.at(4.6, 0.6), radius: 2.6,
          label: () => (over(c, 'hangedLord') ? 'The grave is empty now' : 'Dig at the grave'),
          enabled: () => !over(c, 'hangedLord'),
          act: () => {
            if (!midnight()) {
              c.hooks.toast('The earth on the grave is packed as hard as iron. The spade rings off it. (Midnight, the board said.)');
              return;
            }
            rouse(c, 'hangedLord', k.at(4.6, 1.2), (b) => {
              (b as { rouse(): void }).rouse();
              c.hooks.fx.add.spawn({ pos: k.at(4.6, 0.6, 0.4), spread: 1.2, count: 40, life: [0.5, 1.1], size: [0.15, 0.04], color: 0x5a4a38, color2: 0x2a2018, gravity: 7, upBias: 1.6 });
              c.hooks.toast('The spade goes in once, and a grey hand comes up round it. Red Corwen climbs out of his grave, the rope still round his neck, a lantern lit in his fist.');
            });
          },
        },
      ],
      update: (dt) => {
        t += dt;
        rope.rotation.z = Math.sin(t * 0.7) * 0.06;
        rope.rotation.x = Math.sin(t * 0.5 + 1) * 0.04;
        if (over(c, 'hangedLord') && !st.done) {
          // His silver, at the bottom of the empty grave.
          c.hooks.gold(320);
          c.hooks.toast('At the bottom of the empty grave: a rotted strongbox, and the king\'s silver. 320 gold, give or take what the worms took.');
          c.finish();
        }
      },
    };
  },
};

// ---- The Wrong Stone Circle ---------------------------------------------------------------------

const CIRCLE_STONES = 9;
/** The stones whose light shields the wraith. */
const WARD_STONES = [0, 2, 5, 7];

/**
 * Nine tall stones on the highest hill in Cresha, carved with the Sunwheel
 * cut backwards. At the full moon they burn violet, and if you touch the
 * altar a wraith steps out. While the warding stones burn it can barely be
 * hurt: put them out. Worn down, it lights them again.
 */
export const WRONG_CIRCLE: SiteType = {
  kind: 'wrongCircle', label: 'The Wrong Stone Circle', glyph: '⊛', color: '#b090ff', count: 1, clear: 18,
  habitats: [], at: DISCOVERY.wrongCircle,
  build(c) {
    const k = c.kit, r = c.rnd;
    const st = c.state;
    const R = 9;
    const lights: THREE.Mesh[] = [];
    const lit = new Array(CIRCLE_STONES).fill(false);
    const glowMat = () => new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.5, 2.4), transparent: true, opacity: 0 });
    for (let i = 0; i < CIRCLE_STONES; i++) {
      const a = (i / CIRCLE_STONES) * Math.PI * 2;
      const x = Math.cos(a) * R, z = Math.sin(a) * R;
      const h = 3 + r() * 1.2;
      k.add(rockGeo(r, 0.6, h / 2, 0.36, 1), k.m.stone, x, h / 2 - 0.3, z, -a + Math.PI / 2, (r() - 0.5) * 0.08, (r() - 0.5) * 0.1, 1.5);
      k.post(0.6, h, x, z);
      // The wheel cut backwards on its inner face, burning at the full moon.
      const wheel = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.32, 16, 1), glowMat());
      wheel.position.copy(k.at(x * 0.965, z * 0.965, h * 0.6));
      wheel.lookAt(k.at(0, 0, h * 0.6));
      wheel.scale.x = -1;
      k.live(wheel);
      lights.push(wheel);
    }
    // The altar stone, and the backwards wheel on it.
    k.add(new THREE.BoxGeometry(2.2, 0.9, 1.3), k.m.stone, 0, 0.4, 0, 0.3, 0, 0, 1.2);
    k.solid(2.2, 0.9, 1.3, 0, 0.45, 0, 0.3);
    const altarWheel = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.45, 16), sunwheelMat());
    altarWheel.rotation.set(-Math.PI / 2, 0, 0);
    altarWheel.scale.x = -1;
    altarWheel.position.copy(k.at(0, 0, 0.87));
    k.live(altarWheel);
    const glow = new THREE.PointLight(0xa060ff, 0, 22, 1.6);
    glow.position.copy(k.at(0, 0, 2.5));
    k.live(glow);
    const night = () => {
      const h = c.hooks.hour();
      return h >= 21 || h < 4.5;
    };
    const tonight = () => c.hooks.fullMoon() && night();
    let fight: { warded: () => boolean; phase: number } | null = null;
    let lastPhase = 1;
    let t = 0;
    const actions = [
      {
        at: k.at(0, 0, 0.5), radius: 2.8,
        label: () => (over(c, 'circleWraith') ? 'The altar is only a stone now' : tonight() ? 'Lay your hand on the altar' : 'Examine the altar'),
        enabled: () => !over(c, 'circleWraith') && !fight,
        act: () => {
          if (!tonight()) {
            const n = c.hooks.moonIn();
            c.hooks.toast(`The Sunwheel, cut backwards into every stone. The stone is cold. ${n === 0 ? 'The moon will be full tonight, after dark.' : `The moon will be full in ${n} night${n === 1 ? '' : 's'}.`}`);
            return;
          }
          rouse(c, 'circleWraith', k.at(0, 3), (b) => {
            const body = b as { rouse(): void; warded: () => boolean; phase: number };
            for (const i of WARD_STONES) lit[i] = true;
            body.warded = () => WARD_STONES.some((i) => lit[i]);
            body.rouse();
            fight = body;
            lastPhase = 1;
            c.hooks.toast('The stones flare violet, and the air in the middle of the circle tears like cloth. Something in a long black robe steps through. The light of four of the stones wraps round it like armour.');
          });
        },
      },
      ...WARD_STONES.map((i) => {
        const a = (i / CIRCLE_STONES) * Math.PI * 2;
        return {
          at: k.at(Math.cos(a) * (R - 1.2), Math.sin(a) * (R - 1.2), 1), radius: 2.4,
          label: () => 'Scrape out the burning wheel',
          enabled: () => !!fight && lit[i],
          act: () => {
            lit[i] = false;
            c.hooks.fx.add.spawn({ pos: lights[i].position.clone(), spread: 0.5, count: 24, life: [0.3, 0.7], size: [0.12, 0.02], color: 0xc8a0ff, color2: 0x3a1a6a, upBias: 0.6 });
            const left = WARD_STONES.filter((j) => lit[j]).length;
            c.hooks.toast(left ? `The light goes out of the stone. ${left} still burn${left === 1 ? 's' : ''}.` : 'The last warding stone goes dark. The wraith\'s armour of light is gone.');
          },
        };
      }),
    ];
    return {
      actions,
      update: (dt) => {
        t += dt;
        const on = !over(c, 'circleWraith') && (tonight() || !!fight);
        glow.intensity = on ? 4 + Math.sin(t * 2) * 1 : 0;
        for (let i = 0; i < CIRCLE_STONES; i++) {
          const mat = lights[i].material as THREE.MeshBasicMaterial;
          const want = !on ? 0 : fight ? (lit[i] ? 1 : 0.1) : 0.6 + Math.sin(t * 1.5 + i) * 0.2;
          mat.opacity += (want - mat.opacity) * Math.min(1, dt * 4);
        }
        if (fight) {
          // Worn down, it lights two of them again.
          if (fight.phase > lastPhase) {
            lastPhase = fight.phase;
            const dark = WARD_STONES.filter((i) => !lit[i]).slice(0, 2);
            for (const i of dark) lit[i] = true;
            if (dark.length) c.hooks.toast('The wraith lifts a claw, and two of the stones burn again.');
          }
          const b = c.hooks.boss('circleWraith');
          if (!b.body || !b.body.alive) {
            fight = null;
            lit.fill(false);
          }
        }
        if (over(c, 'circleWraith') && !st.done) c.finish();
      },
    };
  },
};

// ---- The Abandoned Mine -------------------------------------------------------------------------

/**
 * An old silver working in the north hills: a timbered adit in a crag of
 * rock, rails running out to a spoil heap, an overturned cart, a fallen winch.
 * The adit is choked with rubble, and the rubble has claw marks in it from the
 * inside. Clear it, and what dug through the mine comes up through the yard.
 */
export const MINE: SiteType = {
  kind: 'mine', label: 'The Abandoned Mine', glyph: '⚒', color: '#d0b080', count: 1, clear: 24,
  habitats: [], at: DISCOVERY.mine,
  build(c) {
    const k = c.kit, m = k.m, r = c.rnd;
    const st = c.state;
    const rock = col(0x6a6258, 0.95);
    // The crag the adit is cut into (behind, local +z).
    for (let i = 0; i < 7; i++) k.add(rockGeo(r, 4 + r() * 2, 3.5 + r() * 2.5, 3.5, 1), k.m.stone, -9 + i * 3, 1.5, 9 + r() * 2, r() * 3, 0, 0, 3);
    k.solid(22, 7, 6, 0, 3, 10);
    // The adit's timber frame, and the rubble choking it.
    for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(0.3, 3, 0.3), m.timber, s * 1.3, 1.5, 6.6, 0, 0, s * 0.05);
    k.add(new THREE.BoxGeometry(3.2, 0.32, 0.36), m.timber, 0, 3.05, 6.6);
    k.add(new THREE.PlaneGeometry(2.3, 2.8), col(0x080706, 1), 0, 1.45, 6.8, Math.PI);
    const rubble: THREE.Mesh[] = [];
    if (!over(c, 'delver')) for (let i = 0; i < 9; i++) {
      const mesh = new THREE.Mesh(rockGeo(r, 0.6 + r() * 0.4, 0.5, 0.5, 0), rock);
      mesh.position.copy(k.at(-0.9 + (i % 3) * 0.9, 6.4 - Math.floor(i / 3) * 0.3, 0.3 + Math.floor(i / 3) * 0.6));
      k.live(mesh);
      rubble.push(mesh);
    }
    // Rails out to the spoil heap; an overturned cart; the fallen winch.
    for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(0.06, 0.06, 12), col(0x4a3a30, 0.5, { metal: 0.6 }), s * 0.45, 0.08, 0.5);
    for (let i = 0; i < 9; i++) k.add(new THREE.BoxGeometry(1.3, 0.08, 0.2), m.planks, 0, 0.04, 6 - i * 1.4);
    k.add(rockGeo(r, 5, 1.6, 4, 1), col(0x5a5048, 1), 0.5, 0.2, -9, 0, 0, 0, 0);
    k.add(new THREE.BoxGeometry(1.1, 0.7, 1.6), m.planks, 2.5, 0.45, -3, 0.5, 0, Math.PI / 2 + 0.2);
    k.add(new THREE.CylinderGeometry(0.4, 0.4, 2.4, 10), m.timber, -4, 0.4, 2, 0.3, 0, Math.PI / 2);
    for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(0.2, 2.4, 0.2), m.timber, -4 + s * 1.3, 0.6, 2, 0.3, 0, 1.2);
    // Deep claw marks in the timbers, and fresh earth thrown up in the yard.
    for (let i = 0; i < 4; i++) k.add(new THREE.BoxGeometry(0.04, 1.2, 0.03), col(0xc8b090, 0.9), 1.3 + 0.06 * (i - 1.5), 1.6, 6.42, 0, 0, 0.2);
    for (let i = 0; i < 5; i++) k.add(rockGeo(r, 1.2, 0.4, 1, 0), col(0x4a3a2a, 1), (r() - 0.5) * 12, 0.05, (r() - 0.5) * 8, r() * 3, 0, 0, 0);
    const actions = [{
      at: k.at(0, 5.6, 0.8), radius: 2.8,
      label: () => (over(c, 'delver') ? 'The adit, open now (it goes nowhere: it\'s all fallen in)' : 'Clear the rubble from the adit'),
      enabled: () => !over(c, 'delver') && !c.hooks.boss('delver').body,
      act: () => {
        for (const mesh of rubble) mesh.visible = false;
        c.hooks.toast('You heave the stones aside. Beyond them the adit is a burrow, round and huge and clawed. Behind you the ground of the yard begins to heave.');
        rouse(c, 'delver', c.hooks.player.pos.clone(), (b) => (b as { rouse(at?: THREE.Vector3): void }).rouse(c.hooks.player.pos.clone()));
      },
    }];
    return {
      actions,
      update: () => {
        if (over(c, 'delver') && !st.done) {
          for (const mesh of rubble) mesh.visible = false;
          c.finish();
        }
      },
    };
  },
};

export const BATCH5: SiteType[] = [DROWNED_TOWER, SINKHOLE_SITE, HANGING_TREE, WRONG_CIRCLE, MINE];
