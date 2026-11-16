import { test, expect } from './fixtures';

// The hero's pose is sampled once per fixed step and drawn between samples
// (player/poseFrames.ts). Rendering between steps must not change the next
// sample: at a high refresh rate (the desktop app) a pose that differs every
// other step makes the body shake back and forth.

test('the hero holds steady when frames are drawn between steps, facing any way', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(() => {
    const g = (window as any).__game, P = g.player, T = g.THREE;
    g.sleep(true);
    const out: { yaw: number; worstTurn: number; worstSide: number }[] = [];
    const hips = P.char.bones.get('Hips') ?? [...P.char.bones.values()][0];
    const w = new T.Vector3(), fwd = new T.Vector3();
    for (const yaw of [0, 1.2, 2.2, Math.PI, -2.2, -1.2]) {
      g.input.releaseAll();
      P.yaw = P.prevYaw = yaw;
      g.cam.yaw = yaw;
      g.stepSim(10);
      g.input.press('KeyW');
      let worstTurn = 0, worstSide = 0;
      let acc = 0;
      const rootRow = () => P.poses.rows.find((r: any) => r.node === P.char.root);
      for (let f = 0; f < 72; f++) {
        // A 144 Hz display: about 2.4 drawn frames per 60 Hz step.
        acc += 1 / 144;
        while (acc >= 1 / 60) {
          acc -= 1 / 60;
          g.stepSim(1);
          const r = rootRow();
          worstTurn = Math.max(worstTurn, r.before.q.angleTo(r.now.q));
        }
        P.present(acc * 60, 1 / 144);
        P.char.root.updateMatrixWorld(true);
        hips.getWorldPosition(w);
        // How far the hips stray sideways from the line the hero walks along.
        fwd.set(Math.sin(P.yaw), 0, Math.cos(P.yaw));
        const off = w.clone().sub(P.char.root.position).setY(0);
        worstSide = Math.max(worstSide, Math.abs(off.x * fwd.z - off.z * fwd.x));
      }
      g.input.release('KeyW');
      out.push({ yaw, worstTurn, worstSide });
    }
    g.sleep(false);
    return out;
  });
  for (const r of res) {
    // Between two steps the body turns a little at most, never half round.
    expect(r.worstTurn, `yaw ${r.yaw}`).toBeLessThan(0.2);
    expect(r.worstSide, `yaw ${r.yaw}`).toBeLessThan(0.03);
  }
  expect(errors).toEqual([]);
});
