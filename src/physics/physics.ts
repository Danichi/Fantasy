import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

// Collision membership bits.
export const G_STATIC = 0x0001;
export const G_PLAYER = 0x0002;
export const G_ENEMY = 0x0004;

/** Interaction-group word: high 16 bits = membership, low 16 = filter. */
export const groups = (membership: number, filter: number) => ((membership & 0xffff) << 16) | (filter & 0xffff);
/** Query groups that only see static world geometry. */
export const STATIC_ONLY = groups(0xffff, G_STATIC);

export class Physics {
  world!: RAPIER.World;
  R = RAPIER;

  async init() {
    await RAPIER.init();
    // Gravity is handled by the character controllers themselves.
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  }

  step(dt: number) {
    this.world.timestep = dt;
    this.world.step();
  }

  private fixedBody(pos: THREE.Vector3, rot?: THREE.Quaternion) {
    const d = RAPIER.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z);
    if (rot) d.setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w });
    return this.world.createRigidBody(d);
  }

  addBox(pos: THREE.Vector3, half: THREE.Vector3, rot?: THREE.Quaternion) {
    const b = this.fixedBody(pos, rot);
    return this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z).setCollisionGroups(groups(G_STATIC, 0xffff)),
      b,
    );
  }

  addCylinder(pos: THREE.Vector3, halfHeight: number, radius: number) {
    const b = this.fixedBody(pos);
    return this.world.createCollider(
      RAPIER.ColliderDesc.cylinder(halfHeight, radius).setCollisionGroups(groups(G_STATIC, 0xffff)),
      b,
    );
  }

  addTrimesh(vertices: Float32Array, indices: Uint32Array) {
    const b = this.fixedBody(new THREE.Vector3());
    return this.world.createCollider(
      RAPIER.ColliderDesc.trimesh(vertices, indices).setCollisionGroups(groups(G_STATIC, 0xffff)),
      b,
    );
  }

  /** Ray against static geometry. Returns hit distance or null. */
  castRay(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, filterGroups = STATIC_ONLY): number | null {
    const ray = new RAPIER.Ray(origin, dir);
    const hit = this.world.castRay(ray, maxDist, true, undefined, filterGroups);
    return hit ? hit.timeOfImpact : null;
  }

  createCharacterController(offset = 0.02) {
    const c = this.world.createCharacterController(offset);
    c.setUp({ x: 0, y: 1, z: 0 });
    c.setMaxSlopeClimbAngle((48 * Math.PI) / 180);
    c.setMinSlopeSlideAngle((55 * Math.PI) / 180);
    c.enableAutostep(0.4, 0.15, false);
    c.enableSnapToGround(0.35);
    c.setApplyImpulsesToDynamicBodies(false);
    c.setSlideEnabled(true);
    return c;
  }
}

/** Wireframe of every collider (?debug=physics). Call update() each frame. */
export class PhysicsDebug {
  private lines: THREE.LineSegments;
  constructor(scene: THREE.Scene) {
    this.lines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.8 }),
    );
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 999;
    scene.add(this.lines);
  }
  update() {
    const { vertices, colors } = physics.world.debugRender();
    const g = this.lines.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  }
}

export const physics = new Physics();
