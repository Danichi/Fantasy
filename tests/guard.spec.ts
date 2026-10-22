import { test, expect } from './fixtures';

// The shield's cover on screen: a ground arc while it is raised, a flash when
// it stops a blow, a red mark when one gets round it, and a crosshair.

test('a raised shield shows its cover, flashes on a block, and marks a blow that got round', async ({ game }) => {
  const { page, errors } = game;
  const res = await page.evaluate(async () => {
    const g = (window as any).__game, pl = g.player, W = (window as any).W;
    const xh = () => document.querySelector('.guard-xhair')!.className;
    const before = xh();
    let flashes = 0, missed = 0;
    const off1 = g.events.on('blockImpact', () => flashes++);
    const off2 = g.events.on('guardMissed', () => missed++);
    g.input.press('Mouse2');
    await W(30);
    const up = xh();
    const front = pl.receiveAttack({ damage: 10, from: pl.pos.clone().addScaledVector(pl.forward, 2), parryable: true, poise: 10 });
    const side = pl.receiveAttack({ damage: 4, from: pl.pos.clone().add(new g.THREE.Vector3(pl.forward.z, 0, -pl.forward.x).multiplyScalar(2)), parryable: true, poise: 4 });
    await W(2);
    const arc = g.r.scene.children.find((o: any) => o.material?.uniforms?.uCover);
    const arcVisible = !!arc?.visible;
    // The middle of the arc lies straight ahead of the hero.
    const mid = arc.localToWorld(new g.THREE.Vector3(0, 0, 1.4)).sub(arc.position).setY(0).normalize();
    const ahead = mid.dot(pl.forward);
    g.input.release('Mouse2');
    await W(40);
    const down = xh();
    off1();
    off2();
    return { before, up, down, front, side, flashes, missed, arcVisible, ahead };
  });
  expect(res.before).not.toContain('on');
  expect(res.up).toContain('on');
  expect(res.front).toBe('blocked');
  expect(res.side).toBe('hit');
  expect(res.flashes).toBe(1);
  expect(res.missed).toBe(1);
  expect(res.arcVisible).toBe(true);
  expect(res.ahead).toBeGreaterThan(0.95);
  expect(res.down).not.toMatch(/\bon\b/);
  expect(errors).toEqual([]);
});
