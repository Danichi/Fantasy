import { test, expect, SLOW } from './fixtures';

test('codex hints replace native titles, support keyboard access, fit the viewport and release stale owners', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/codex-audit.html', (r) =>
    r.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="ui"><button id="owner" title="A traveller’s note">Inspect</button></div></body></html>'
    })
  );
  await page.goto('/codex-audit.html');
  await page.evaluate(async () => {
    const F = await import('/src/ui/typography.ts' as string),
      T = await import('/src/ui/codexTooltip.ts' as string);
    await F.loadGameFonts();
    (window as any).help = new T.CodexTooltip();
    document.querySelector('button')!.style.cssText = 'position:fixed;left:20px;top:20px;width:120px;height:40px';
  });
  const owner = page.locator('#owner'),
    tip = page.getByRole('tooltip');
  await owner.hover();
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('A traveller’s note');
  await expect(owner).not.toHaveAttribute('title');
  await expect(owner).toHaveAttribute('aria-describedby', 'codex-tooltip');
  await page.keyboard.press('Escape');
  await expect(tip).toBeHidden();
  await owner.focus();
  await expect(tip).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await expect(tip).toBeHidden();
  await page.mouse.move(300, 300);
  await owner.hover();
  await expect(tip).toBeVisible();
  await page.evaluate(() => document.querySelector('#owner')!.setAttribute('title', 'A new inscription'));
  await expect(tip).toContainText('A new inscription');
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('parchment-tooltip.png')
  });
  const bounds = await page.evaluate(() => {
    const h = (window as any).help,
      o = document.getElementById('owner')!,
      result = [];
    for (const [x, y] of [
      [0, 0],
      [innerWidth - 120, 0],
      [0, innerHeight - 40],
      [innerWidth - 120, innerHeight - 40]
    ]) {
      o.style.left = x + 'px';
      o.style.top = y + 'px';
      h.show(o, {
        title: 'A very long and unbroken title ' + 'Dawn'.repeat(80),
        body: 'A memory from the old world. '.repeat(45)
      });
      const r = h.el.getBoundingClientRect();
      result.push({
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom
      });
    }
    return result;
  });
  for (const b of bounds) {
    expect(b.left).toBeGreaterThanOrEqual(10);
    expect(b.top).toBeGreaterThanOrEqual(10);
    expect(b.right).toBeLessThanOrEqual(1280 - 10);
    expect(b.bottom).toBeLessThanOrEqual(720 - 10);
  }
  await page.evaluate(() => document.getElementById('owner')!.remove());
  await expect(tip).toBeHidden();
  await page.evaluate(() => {
    const b = document.createElement('button');
    b.id = 'late';
    b.title = '<img src=x onerror=alert(1)>';
    b.textContent = 'Later';
    document.getElementById('ui')!.appendChild(b);
  });
  await page.locator('#late').focus();
  await expect(tip).toContainText('<img src=x onerror=alert(1)>');
  expect(await tip.locator('img').count()).toBe(0);
  await page.evaluate(() => document.getElementById('late')!.setAttribute('title', ''));
  await expect(tip).toBeHidden();
  await page.evaluate(() => (window as any).help.dispose());
  await expect(page.locator('#codex-tooltip')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the real skill hover, selected skill, inventory, journal and technique library share the fantasy type and surfaces', async ({ game }, info) => {
  test.setTimeout(500_000 * SLOW);
  const { page, errors } = game;
  page.setDefaultTimeout(30_000);
  const shot = async (name: string) => {
    // Let the short page/folio entrance finish; do not fast-forward unrelated
    // story transitions when collecting UI previews.
    await page.waitForTimeout(400);
    await page.evaluate(() => (window as any).__game.r.render(0.016));
    await page.screenshot({ path: info.outputPath(name + '.png') });
  };
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.pause(true);
    g.sleep(true);
    g.dialogue.close();
    g.input.releaseAll();
    g.player.invulnerable = true;
    g.player.paths.teach('gale');
    g.book.show('skills');
    g.skills.show('gale');
    g.book.update();
  });
  await expect(page.locator('.sk-stage canvas')).toBeVisible();
  await page.waitForFunction(() => {
    const v = (window as any).__game.skills.view,
      cv = document.querySelector('.sk-stage canvas') as HTMLCanvasElement;
    if (!v || !cv) return false;
    const r = cv.getBoundingClientRect();
    return (
      cv.width === Math.round(r.width * Math.min(2, devicePixelRatio || 1)) &&
      cv.height === Math.round(r.height * Math.min(2, devicePixelRatio || 1)) &&
      v.cam.ox !== 0
    );
  });
  const center = await page.evaluate(() => {
    const v = (window as any).__game.skills.view,
      r = v.screenRect(v.node('c'));
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(center.x, center.y);
  await expect(page.getByRole('tooltip')).toBeVisible();
  await expect(page.getByRole('tooltip')).toContainText('Gale Style');
  await expect(page.getByRole('tooltip')).toContainText('Foundation');
  const fonts = await page.evaluate(() => ({
    body: getComputedStyle(document.querySelector('.sk-node p')!).fontFamily,
    heading: getComputedStyle(document.querySelector('.sk-node h4')!).fontFamily,
    face: document.fonts.check('16px Alegreya'),
    display: document.fonts.check('20px "IM Fell English SC"')
  }));
  expect(fonts.body).toContain('Alegreya');
  expect(fonts.heading).toContain('IM Fell English SC');
  expect(fonts.face && fonts.display).toBe(true);
  await shot('skills-hover');
  await page.mouse.click(center.x, center.y);
  await expect(page.locator('.sk-node h4')).not.toBeEmpty();
  await expect(page.locator('.sk-node h4')).toBeInViewport();
  await page.mouse.move(10, 10);
  await shot('skill-detail');
  await page.evaluate(() => (window as any).__game.book.show('skills', 'skills-attr'));
  await expect(page.getByRole('tooltip')).toBeHidden();
  await expect(page.locator('.sk-attr').first()).toBeVisible();
  await shot('attributes');
  await page.evaluate(() => (window as any).__game.book.show('character', 'inventory'));
  await page.waitForFunction(() => document.pointerLockElement === null);
  await expect(page.locator('.inv2 .grid .item').first()).toBeVisible();
  await page.locator('.inv2 .grid .item').first().click();
  await expect(page.locator('.inv2 .detail .name')).not.toBeEmpty();
  await shot('inventory');
  await page.setViewportSize({ width: 960, height: 640 });
  await page.locator('.inv2 .grid .item').first().click();
  await shot('inventory-compact');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => (window as any).__game.book.show('journal'));
  await shot('journal');
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.book.closeAll();
    g.pause(false);
    g.techniqueLibrary.toggle(true);
  });
  await expect(page.locator('.tl-panel')).toBeVisible();
  await shot('technique-library');
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.techniqueLibrary.toggle(false);
    g.book.closeAll();
    g.sleep(true);
  });
  const mark = await page.evaluate(() => {
    const g = (window as any).__game,
      p = g.player.pos;
    const note = g.discovery.addMark({ kind: 'note', x: p.x, z: p.z, text: 'A hidden river crossing', color: '#883c2c' });
    g.book.show('map');
    g.worldMap.focus(p.x, p.z);
    const at = g.worldMap.worldToScreen(p.x, p.z),
      r = g.worldMap.canvas.getBoundingClientRect();
    return { id: note.id, x: r.left + at.x, y: r.top + at.y };
  });
  await page.mouse.move(mark.x, mark.y);
  await expect(page.getByRole('tooltip')).toContainText('A hidden river crossing');
  await shot('map-note');
  await page.evaluate((id) => {
    const g = (window as any).__game;
    g.book.closeAll();
    g.discovery.removeMark(id);
  }, mark.id);
  await expect(page.getByRole('tooltip')).toBeHidden();
  // Same four viewpoints as tools/views/all.sh, using this already-booted game.
  for (const [name, x, z, yaw, pitch, dist, hud] of [
    ['spawn', 0, 10, 3.14159, 0.22, 4.8, 1],
    ['vista', 28, 40, 3.14159, 0.2, 7, 0],
    ['meadow', -40, 150, 3.14159, 0.03, 5, 0],
    ['street', 30, 30, 2.4, 0.12, 5, 0]
  ] as const) {
    await page.evaluate(
      async (v) => {
        const g = (window as any).__game,
          H = await import('/src/world/terrain.ts' as string);
        const at = new g.THREE.Vector3(v.x, H.heightAt(v.x, v.z) + 0.3, v.z);
        g.input.releaseAll();
        g.player.teleport(at);
        g.player.yaw = v.yaw;
        g.player.present(1, 0.016);
        g.cam.yaw = v.yaw;
        g.cam.pitch = v.pitch;
        g.cam.distance = v.dist;
        g.cam.snapTo(at);
        g.cam.update(0.016, at, false);
        document.getElementById('ui')!.style.visibility = v.hud ? '' : 'hidden';
        g.r.followShadow(at);
        g.r.render(0.016);
      },
      { x, z, yaw, pitch, dist, hud }
    );
    await page.screenshot({
      path: info.outputPath('fantasy-type-' + name + '.png')
    });
  }
  await page.evaluate(() => {
    const g = (window as any).__game;
    document.getElementById('ui')!.style.visibility = '';
    // The book remembers its last sub-page. Leave the shared game on the
    // default discipline page so later shortcut tests start from a fresh book.
    g.book.show('skills', 'skills-disc');
    g.book.closeAll();
    g.sleep(false);
    g.pause(false);
  });
  expect(errors).toEqual([]);
});
