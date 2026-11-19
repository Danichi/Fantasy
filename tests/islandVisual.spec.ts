import { test, expect, SLOW } from './fixtures';

test('regional island outposts and the field journal render at desktop and small viewports', async ({ game }) => {
  test.setTimeout(360_000 * SLOW);
  const page = game.page;
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.pause(true);
    g.sleep(true);
    g.player.invulnerable = true;
  });
  await test.step('regional outposts and the field journal render at desktop and small viewports', async () => {
    await page.addStyleTag({ content: '.region-card{display:none!important}' });
    for (const region of ['azureIsles', 'emeraldIsles', 'shatteredIsles', 'sunkenIsles']) {
      await page.evaluate(async (region) => {
        const g = (window as any).__game,
          L = await import('/src/world/islands/layout.ts' as string),
          T = await import('/src/world/terrainHeight.ts' as string);
        const s = L.SITES.find((s: any) => s.region === region && s.kind === 'village');
        g.sleep(true);
        g.dialogue.close();
        g.player.teleport(new g.THREE.Vector3(s.x, T.heightAt(s.x, s.z) + 0.1, s.z + 7));
        g.archipelagos.update(0.3, true);
        g.cam.frozen = true;
        // Stay above the Emerald canopy and inside its village clearing.
        g.r.camera.position.set(
          s.x + (region === 'emeraldIsles' ? 22 : 42),
          T.heightAt(s.x, s.z) + (region === 'emeraldIsles' ? 35 : 30),
          s.z + (region === 'emeraldIsles' ? 25 : 45)
        );
        g.r.camera.lookAt(s.x, T.heightAt(s.x, s.z) + 2, s.z);
        g.time.skipTo(12);
        g.npcs.update(0.25, g.player.pos, g.r.camera.position);
        g.r.basePixelRatio = 0.8;
        g.r.resize();
        g.pause(false);
        g.sleep(false);
      }, region);
      await page.waitForTimeout(1500);
      await page.evaluate(() => {
        const g = (window as any).__game;
        g.pause(true);
        g.sleep(true);
        g.r.render();
      });
      await page.screenshot({ path: test.info().outputPath(region + '.png') });
    }
    await page.setViewportSize({ width: 700, height: 860 });
    await page.evaluate(() => {
      const g = (window as any).__game;
      g.archipelagos.journal('sunkenIsles');
      g.dialogue.update(100);
      g.r.render();
    });
    await page.screenshot({ path: test.info().outputPath('journal-small.png') });
    const bounds = await page.locator('.dialogue').boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.width).toBeLessThanOrEqual(700);
  });
  expect(game.errors).toEqual([]);
});
