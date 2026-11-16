import * as THREE from 'three';
import { physics } from '../physics/physics';
import { addProp, clearProps } from '../combat/props';
import { resetImpacts } from '../combat/impacts';
import type { Interior } from '../world/interior';

// The Proving Grounds' breakables (docs/design/combat-flow.md, "The world as a
// weapon"): barrels to kick, a fence to throw someone through, braziers to
// knock someone into, a pool to soak them in. A reset puts them all back.

const mats = () => ({
  wood: new THREE.MeshStandardMaterial({ color: 0x8a5e34, roughness: 0.9 }),
  band: new THREE.MeshStandardMaterial({ color: 0x3a3530, roughness: 0.6, metalness: 0.5 }),
  iron: new THREE.MeshStandardMaterial({ color: 0x2c2a28, roughness: 0.5, metalness: 0.7 }),
  coal: new THREE.MeshStandardMaterial({ color: 0xff7a2a, emissive: 0xff5010, emissiveIntensity: 2.2, roughness: 1 }),
  water: new THREE.MeshStandardMaterial({ color: 0x2f6f8f, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.82 }),
  rim: new THREE.MeshStandardMaterial({ color: 0x6d5a43, roughness: 1 }),
});

export class ArenaProps {
  private root = new THREE.Group();
  private m = mats();
  private flames: { light: THREE.PointLight; coal: THREE.Mesh; t: number }[] = [];

  constructor(private scene: THREE.Scene, private it: Interior) {
    scene.add(this.root);
    this.build();
  }

  /** Everything back where it started. */
  reset(training = true) {
    clearProps();
    resetImpacts();
    this.root.traverse(o=>{if((o as THREE.Mesh).isMesh)(o as THREE.Mesh).geometry.dispose();});
    this.root.clear();
    this.flames.length = 0;
    if(training) this.build();
    else {this.brazier(-21,8);this.brazier(21,8);}
  }

  update(dt: number) {
    for (const f of this.flames) {
      f.t += dt;
      f.light.intensity = 9 + Math.sin(f.t * 13) * 1.2 + Math.sin(f.t * 7.3) * 0.8;
      f.coal.scale.y = 1 + Math.sin(f.t * 11) * 0.08;
    }
  }

  dispose() {
    clearProps();
    this.scene.remove(this.root);
  }

  private build() {
    // Barrels: a cluster in the ring and a few by the slam wall.
    for (const [x, z] of [[6.5, 3], [7.4, 4.1], [5.8, 4.6], [12.5, -3], [12.8, -8.5], [-6, -9]] as const) this.barrel(x, z);
    // A fence in front of the north wall.
    this.fence(2, -15, 8);
    // Two braziers flanking the ring.
    this.brazier(-8, 4);
    this.brazier(10.5, -11);
    // A pool in the south-east corner.
    this.pool(16, 14, 3.2);
  }

  private barrel(x: number, z: number) {
    const at = this.it.at(x, z);
    const g = new THREE.Group();
    const roll = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.95, 14), this.m.wood);
    body.rotation.z = Math.PI / 2; // lying on its side, axis across
    roll.add(body);
    for (const off of [-0.32, 0.32]) {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.405, 0.025, 6, 16), this.m.band);
      hoop.rotation.y = Math.PI / 2;
      hoop.position.x = off;
      roll.add(hoop);
    }
    body.castShadow = true;
    g.add(roll);
    g.position.set(at.x, at.y + 0.4, at.z);
    g.rotation.y = (x * 1.7 + z) % Math.PI;
    this.root.add(g);
    const collider = physics.addBox(at.clone().setY(at.y + 0.4), new THREE.Vector3(0.36, 0.36, 0.36), new THREE.Quaternion());
    addProp({ kind: 'barrel', pos: at.clone(), radius: 0.42, mesh: g, collider, onBreak: () => this.root.remove(g) });
  }

  private fence(x: number, z: number, length: number) {
    const at = this.it.at(x, z);
    const g = new THREE.Group();
    for (let i = 0; i <= 4; i++) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.2, 0.14), this.m.wood);
      post.position.set(-length / 2 + (length * i) / 4, 0.6, 0);
      g.add(post);
    }
    for (const y of [0.45, 0.95]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.1, 0.06), this.m.wood);
      rail.position.y = y;
      g.add(rail);
    }
    g.position.copy(at);
    this.root.add(g);
    const collider = physics.addBox(at.clone().setY(at.y + 0.6), new THREE.Vector3(length / 2, 0.6, 0.08), new THREE.Quaternion());
    addProp({ kind: 'fence', pos: at.clone(), radius: length / 2, along: new THREE.Vector3(1, 0, 0), mesh: g, collider, onBreak: () => this.splinter(g) });
  }

  /** A broken fence: the rails fall flat, the posts lean. */
  private splinter(g: THREE.Group) {
    g.children.forEach((c, i) => {
      if (i > 4) {
        c.position.y = 0.05;
        c.rotation.y = i === 5 ? 0.25 : -0.2;
      } else c.rotation.z = (i % 2 ? 1 : -1) * 0.6;
    });
  }

  private brazier(x: number, z: number) {
    const at = this.it.at(x, z);
    const g = new THREE.Group();
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.22, 0.9, 8), this.m.iron);
    stand.position.y = 0.45;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.28, 0.32, 12, 1, true), this.m.iron);
    bowl.position.y = 1.02;
    const coal = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), this.m.coal);
    coal.position.y = 1.0;
    const light = new THREE.PointLight(0xff8a3a, 10, 12, 1.6);
    light.position.y = 1.6;
    g.add(stand, bowl, coal, light);
    g.position.copy(at);
    this.root.add(g);
    this.flames.push({ light, coal, t: x });
    const collider = physics.addBox(at.clone().setY(at.y + 0.6), new THREE.Vector3(0.32, 0.6, 0.32), new THREE.Quaternion());
    // Braziers don't break: anything knocked into one is set alight.
    addProp({ kind: 'brazier', pos: at.clone(), radius: 0.5, mesh: g, collider });
  }

  private pool(x: number, z: number, half: number) {
    const at = this.it.at(x, z);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2), this.m.water);
    water.rotation.x = -Math.PI / 2;
    water.position.set(at.x, at.y + 0.03, at.z);
    this.root.add(water);
    for (const [dx, dz, w, d] of [[0, -half, half * 2 + 0.4, 0.2], [0, half, half * 2 + 0.4, 0.2], [-half, 0, 0.2, half * 2], [half, 0, 0.2, half * 2]] as const) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, d), this.m.rim);
      rim.position.set(at.x + dx, at.y + 0.08, at.z + dz);
      this.root.add(rim);
    }
    addProp({ kind: 'pool', pos: at.clone(), radius: half });
  }
}
