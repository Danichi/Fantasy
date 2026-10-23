import * as THREE from 'three';
import { OrcWarlord, type BossSpec } from '../enemies/orc';
import { OrcMob } from '../enemies/orcMob';
import { events } from '../core/events';
import { sfx } from '../audio/sfx';
import { heightAt } from '../world/terrainHeight';
import { crownAt } from '../world/crownRoad';
import type { HitInfo } from '../combat/targets';
import type { Player } from '../player/player';
import type { FX } from '../fx/particles';
import type { BossBody, BossDef } from './fieldBosses';
import { raidCamp } from './lairs';

// Varga One-Eye: captain of an orc warband that raids the Crown Road by night,
// out of a camp in the marches between Kingsmile and Gorrak's warcamp. A big
// orc in war-paint with a black braid and a patch over her left eye; a red
// war-banner with one eye painted on it rides on her back.
//
// The fight:
//   - She never comes alone: her warband rushes you with her.
//   - She fights with the warlord's moves (the mocap orc boss): cleaves,
//     sweeps, combos, a kick, and a leaping slam when you keep your distance.
//   - Her blind side: she can't see out of the left. Blows from her left and
//     behind it land half again as hard and stagger her sooner.
//   - At 60% she blows her war-horn and more of the band come up the road.
//   - At 30% she tears off the patch. Where the eye was, violet light burns:
//     she gave it to the Dark for strength. She has no blind side any more, and
//     she is faster.

const VARGA: BossSpec = { name: 'Varga One-Eye', model: '/assets/npc/orcWarrior.glb', height: 1.75, hp: 2000, scale: 1.4, kind: 'varga', bow: false, damage: 1.05, wake: 22 };

const BAND = 5;

export class Varga implements BossBody {
  readonly label = 'Varga One-Eye';
  o: OrcWarlord | null = null;
  private pending = true;
  private gone = false;
  band: { o: OrcMob; deadT: number }[] = [];
  private horned = false;
  private darkT = -1;
  private toldBlind = false;
  private warned = false;
  private peak = 1;
  private patch: THREE.Object3D | null = null;
  private violet: THREE.Object3D | null = null;
  private violetLight: THREE.PointLight | null = null;
  private bodyKept = 0;
  stats = { blindHits: 0, called: 0, front: 0 };

  constructor(private home: THREE.Vector3, private yaw: number, private scene: THREE.Scene, private fx: FX) {
    void OrcWarlord.create(home.clone(), yaw, scene, fx, VARGA).then((o) => {
      this.pending = false;
      if (this.gone) return o.dispose();
      this.o = o;
      this.dress(o);
      this.blindSide(o);
      o.onRoar = () => {
        sfx.roar(0.7);
        if (!this.warned) {
          this.warned = true;
          events.emit('bossSpeaks', { id: 'varga', line: '"Blood on the road!" Varga One-Eye roars, and her warband comes at you.' });
        }
      };
    });
    this.muster(BAND, home, 6);
  }

  /** War-paint, a braid, the eyepatch, and the one-eyed banner. */
  private dress(o: OrcWarlord) {
    const k = 1 / VARGA.scale;
    const head = o.socket('Head', 'varga-head');
    // The patch: a leather disc over the left eye, its strap round the head.
    const leather = new THREE.MeshStandardMaterial({ color: 0x1e1610, roughness: 0.7 });
    const patch = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), leather);
    disc.position.set(0.04 * k * 1.4, 0.085 * k * 1.4, 0.118 * k * 1.4);
    disc.scale.setScalar(k * 1.4);
    disc.rotation.y = 0.35;
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.006, 4, 24), leather);
    strap.position.set(0, 0.095 * k * 1.4, 0.0);
    strap.rotation.set(Math.PI / 2 - 0.25, 0, 0.2);
    strap.scale.setScalar(k * 1.4);
    patch.add(disc, strap);
    head.add(patch);
    this.patch = patch;
    // Under it, later: the violet light where the eye was.
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.8, 3.6) }));
    glow.position.copy(disc.position);
    glow.scale.setScalar(k * 1.4);
    glow.visible = false;
    head.add(glow);
    this.violet = glow;
    const light = new THREE.PointLight(0xa06aff, 0, 4, 2);
    light.position.copy(disc.position).add(new THREE.Vector3(0, 0, 0.1 * k));
    head.add(light);
    this.violetLight = light;
    // A long black braid down her back.
    const hair = new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 0.8 });
    const braid = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.028 - i * 0.0018, 8, 6), hair);
      b.scale.set(1, 1.3, 1);
      b.position.set(0, 0.12 - i * 0.05, -0.1 - i * 0.012);
      braid.add(b);
    }
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.005, 4, 10), new THREE.MeshStandardMaterial({ color: 0x8a2a1e }));
    tie.position.set(0, 0.12 - 9 * 0.05, -0.2);
    tie.rotation.x = Math.PI / 2;
    braid.add(tie);
    braid.scale.setScalar(k * 1.4);
    head.add(braid);
    // The banner on her back: a red rag with one great eye painted on it.
    const back = o.socket('Spine2', 'varga-banner');
    const banner = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 0.9 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 1.5, 6).translate(0, 0.75, 0), wood);
    const cross = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 5), wood);
    cross.rotation.z = Math.PI / 2;
    cross.position.set(0, 1.45, 0);
    const cv = document.createElement('canvas');
    cv.width = 64;
    cv.height = 96;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#7a1a14';
    g.fillRect(0, 0, 64, 96);
    for (let i = 0; i < 6; i++) {
      g.fillStyle = 'rgba(0,0,0,0)';
      g.clearRect(i * 11 + (i % 2) * 4, 84 + (i % 3) * 4, 6, 16);
    }
    g.fillStyle = '#e8d8b0';
    g.beginPath();
    g.ellipse(32, 40, 20, 11, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1a0a08';
    g.beginPath();
    g.arc(32, 40, 8, 0, Math.PI * 2);
    g.fill();
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.68, 4, 6).translate(0, 1.08, 0.01), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95 }));
    const fp = flag.geometry.getAttribute('position');
    for (let i = 0; i < fp.count; i++) fp.setZ(i, 0.01 + Math.sin(fp.getX(i) * 9 + fp.getY(i) * 4) * 0.025);
    flag.geometry.computeVertexNormals();
    banner.add(pole, cross, flag);
    banner.position.set(0.06, -0.15, -0.16);
    banner.rotation.set(-0.12, Math.PI, 0.08);
    banner.scale.setScalar(k * 1.4);
    back.add(banner);
    banner.traverse((m) => ((m as THREE.Mesh).isMesh && ((m as THREE.Mesh).castShadow = true)));
  }

  /** Her left eye is gone: blows from that side land harder. */
  private blindSide(o: OrcWarlord) {
    const take = o.takeHit.bind(o);
    o.takeHit = (h: HitInfo) => {
      if (o.alive && !this.dark) {
        const from = h.dir.clone().negate().setY(0).normalize();
        const left = new THREE.Vector3(Math.cos(o.facing), 0, -Math.sin(o.facing));
        const fwd = new THREE.Vector3(Math.sin(o.facing), 0, Math.cos(o.facing));
        if (from.dot(left) > 0.3 || (from.dot(fwd) < -0.3 && from.dot(left) > -0.2)) {
          this.stats.blindHits++;
          h = { ...h, damage: h.damage * 1.5, poise: h.poise * 1.6 };
          if (!this.toldBlind) {
            this.toldBlind = true;
            events.emit('bossSpeaks', { id: 'varga', line: 'Varga lurches round too late: she can\'t see you on her left. That\'s her blind side.' });
          }
        } else this.stats.front++;
      }
      take(h);
    };
  }

  private get dark() {
    return this.darkT >= 0;
  }

  /** Orcs of the warband, round a point. */
  private muster(n: number, at: THREE.Vector3, r: number) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const x = at.x + Math.cos(a) * r, z = at.z + Math.sin(a) * r;
      this.band.push({ o: new OrcMob(new THREE.Vector3(x, heightAt(x, z) + 0.3, z), this.scene, this.fx), deadT: 0 });
      this.stats.called++;
    }
  }

  get alive() {
    return this.pending || !!this.o?.alive;
  }
  get dead() {
    return !this.pending && (!this.o || this.o.dead);
  }
  get hp() {
    return this.o?.hp ?? VARGA.hp;
  }
  set hp(v: number) {
    if (this.o) this.o.hp = v;
  }
  get maxHp() {
    return this.o?.maxHp ?? VARGA.hp;
  }
  get position() {
    return this.o?.position ?? this.home;
  }
  get center() {
    return this.o?.center ?? this.home;
  }
  get engaged() {
    return !!this.o && this.o.alive && this.o.awake;
  }
  get phase() {
    const f = this.hp / this.maxHp;
    this.peak = Math.max(this.peak, f < 0.3 ? 3 : f < 0.6 ? 2 : 1);
    return this.peak;
  }

  leash() {
    // She lets you go, and is back in camp with the band when you return.
    if (!this.o) return;
    this.o.reset(this.home, this.yaw);
    for (const m of this.band) m.o.dispose();
    this.band = [];
    this.muster(BAND, this.home, 6);
  }

  update(dt: number, player: Player) {
    const o = this.o;
    if (o) {
      o.update(dt, player);
      o.present(1, dt, player);
      if (o.alive && o.awake) {
        const f = o.hp / o.maxHp;
        // The war-horn: more of the band up the road.
        if (!this.horned && f < 0.6) {
          this.horned = true;
          sfx.horn(0.8);
          const back = o.position.clone().sub(player.pos).setY(0).normalize().multiplyScalar(14).add(o.position);
          this.muster(3, back, 3);
        }
        // The patch comes off.
        if (!this.dark && f < 0.3) {
          this.darkT = 0;
          o.phaseSpeed = 1.25;
          o.phaseRoar();
          if (this.patch) this.patch.visible = false;
          if (this.violet) this.violet.visible = true;
          events.emit('bossSpeaks', { id: 'varga', line: 'Varga tears off her eyepatch. Where her left eye was, violet light burns. "I gave the dark an eye for this," she snarls. "It gives back."' });
        }
      }
      if (this.dark) {
        this.darkT += dt;
        if (this.violetLight) this.violetLight.intensity = o.alive ? 2.5 + Math.sin(this.darkT * 8) * 0.6 : Math.max(0, this.violetLight.intensity - dt * 2);
        if (o.alive && Math.random() < dt * 6) {
          this.fx.add.spawn({ pos: o.center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8)), spread: 0.2, count: 1, life: [0.6, 1.2], size: [0.14, 0.03], color: 0x6a3aa8, color2: 0x10061a, upBias: 0.7, drag: 1 });
        }
      }
      if (!o.alive && (this.bodyKept += dt) > 4 && this.bodyKept - dt <= 4) o.releaseBody();
    }
    for (const m of this.band) {
      m.o.update(dt, player);
      if (!m.o.alive) m.deadT += dt;
    }
    this.band = this.band.filter((m) => {
      if (m.deadT > 8) m.o.dispose();
      return m.deadT <= 8;
    });
  }

  dispose() {
    this.gone = true;
    this.o?.dispose();
    this.o = null;
    for (const m of this.band) m.o.dispose();
    this.band = [];
  }
}

const CAMP = crownAt(2460, 48);
const CAMP_YAW = Math.atan2(-CAMP.side.x, -CAMP.side.y);

export const VARGA_ONE_EYE: BossDef = {
  id: 'varga',
  kind: 'varga',
  name: 'Varga One-Eye',
  title: 'captain of the warband that raids the Crown Road',
  home: { x: Math.round(CAMP.x), z: Math.round(CAMP.z), r: 50 },
  levelBonus: 4,
  lair: raidCamp,
  clearing: 24,
  looks: [],
  // She raids by night.
  abroad: (h) => h >= 19 || h < 5,
  spawn: (_at, _level, scene, fx) => new Varga(new THREE.Vector3(CAMP.x, heightAt(CAMP.x, CAMP.z), CAMP.z), CAMP_YAW, scene, fx),
  rumour: 'Don\'t take the Crown Road past the cottage after dark. There\'s a warband camped off the road there, orcs, and they\'re led by a she-orc with one eye. Varga, they call her. They took a wool caravan last week, drivers and all.',
  found: 'Varga One-Eye. A big she-orc in war-paint, a patch over her left eye and a one-eyed banner on her back, and around her the warband that has been bleeding the Crown Road.',
  phaseLines: ['Varga\'s war-horn sounds, and more of the band come running up the road.', 'Varga One-Eye fights with the Dark in her now: no blind side, and no mercy.'],
  unique: 'vargasEye',
  renown: 3,
  deed: 'Broke Varga One-Eye\'s warband on the Crown Road',
  slain: 'Varga One-Eye falls. Tied to her belt you find a small pouch, and in it a glass eye, violet and cold, that seems to look back at you.',
  again: { items: [['steelIngot', 2]], gold: [120, 200] },
  bounty: {
    title: 'Commission: Varga One-Eye',
    description: 'An orc warband led by a one-eyed she-orc is raiding the Crown Road by night between Kingsmile and Gorrak\'s warcamp. The Crown wants the road open, and her head.',
    gold: 380, xp: 460, rep: 200, minRank: 2,
  },
};
