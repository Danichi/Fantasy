import * as THREE from 'three';
import type { Player } from '../player/player';

// Live 3D character preview for the inventory. The real player (with all
// equipped gear) is put on its own layer and drawn a second time into a
// scissored viewport under a transparent window in the inventory panel.

const LAYER = 2;

export class CharPreview {
  private cam = new THREE.PerspectiveCamera(28, 1, 0.1, 30);
  yaw = 0; // extra orbit set by dragging
  private dragging = false;
  private el: HTMLElement | null = null;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private player: Player,
    lights: THREE.Object3D[],
  ) {
    this.cam.layers.set(LAYER);
    for (const l of lights) l.layers.enable(LAYER);
  }

  /** Attach drag-to-rotate to the preview window element. */
  bind(el: HTMLElement) {
    this.el = el;
    el.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointerup', () => (this.dragging = false));
    el.addEventListener('pointermove', (e) => {
      if (this.dragging) this.yaw -= e.movementX * 0.012;
    });
  }

  render() {
    const el = this.el;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    // New gear may have been attached since last frame: keep the whole
    // character subtree on the preview layer.
    this.player.char.root.traverse((o) => o.layers.enable(LAYER));

    const R = this.renderer;
    const h = R.domElement.clientHeight;
    const x = r.left, y = h - r.bottom;
    const root = this.player.char.root;
    const target = root.position.clone().add(new THREE.Vector3(0, 0.95, 0));
    const ang = root.rotation.y + this.yaw; // yaw 0 = facing the camera
    const dist = 4.2;
    this.cam.aspect = r.width / r.height;
    this.cam.position.set(target.x + Math.sin(ang) * dist, target.y + 0.25, target.z + Math.cos(ang) * dist);
    this.cam.lookAt(target);
    this.cam.updateProjectionMatrix();

    const bg = this.scene.background, fog = this.scene.fog;
    const clearColor = R.getClearColor(new THREE.Color()), clearAlpha = R.getClearAlpha();
    const autoClear = R.autoClear;
    this.scene.background = null;
    this.scene.fog = null;
    R.autoClear = false;
    R.setScissorTest(true);
    R.setScissor(x, y, r.width, r.height);
    R.setViewport(x, y, r.width, r.height);
    R.setClearColor(0x16120d, 1);
    R.clear(true, true, false);
    R.render(this.scene, this.cam);
    R.setScissorTest(false);
    R.setViewport(0, 0, R.domElement.clientWidth, h);
    R.setClearColor(clearColor, clearAlpha);
    R.autoClear = autoClear;
    this.scene.background = bg;
    this.scene.fog = fog;
  }
}
