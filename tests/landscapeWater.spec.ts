import { test, expect, SLOW } from './fixtures';

test('water banks meet the surface, exits join the surrounding ground, and regional shorelines render', async ({ page }) => {
  test.setTimeout(180_000 * SLOW);
  await page.route('**/shoreline-render.html', (r) =>
    r.fulfill({ body: '<!doctype html><html><body style="margin:0;background:#b8d4e3"></body></html>', contentType: 'text/html' })
  );
  await page.setViewportSize({ width: 960, height: 640 });
  await page.goto('/shoreline-render.html');
  const result = await page.evaluate(async () => {
    const W = await import('/src/world/worldMap.ts' as string);
    await W.loadWorldMap();
    const T = await import('/src/world/terrainHeight.ts' as string),
      L = await import('/src/world/landscape/layout.ts' as string),
      A = await import('/src/world/waterLevel.ts' as string),
      P = await import('/src/physics/physics.ts' as string),
      M = await import('/src/world/landscape/landscape.ts' as string),
      R = await import('/src/world/terrain.ts' as string),
      THREE = await import('/node_modules/three/build/three.module.js' as string);
    await P.physics.init();
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(0.75);
    renderer.setSize(960, 640);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    document.body.append(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xb8d4e3);
    scene.fog = new THREE.FogExp2(0xb8d4e3, 0.00065);
    scene.add(new THREE.HemisphereLight(0xe1f3ff, 0x75634a, 2.6));
    const sun = new THREE.DirectionalLight(0xfff2d5, 2.2);
    sun.position.set(-100, 200, 100);
    scene.add(sun);
    const terrain = new R.Terrain(scene, renderer),
      landscape = new M.Landscape({ scene, flags: {}, toast: () => {}, save: () => {} }),
      camera = new THREE.PerspectiveCamera(55, 1.5, 0.1, 12000);
    let coastRise = 0,
      coastWaterError = 0,
      coastSamples = 0;
    for (const w of L.WATERCOURSES.filter((w: any) => w.id.startsWith('emerald-')))
      for (const k of w.knots)
        for (let dx = -80; dx <= 80; dx += 20)
          for (let dz = -80; dz <= 80; dz += 20) {
            const x = k[0] + dx,
              z = k[1] + dz,
              base = T.baseWorldHeightFn(x, z);
            if (base >= W.SEA_LEVEL || W.macroElevAt(x, z) >= W.SEA_LEVEL + 1.4) continue;
            coastRise = Math.max(coastRise, T.worldHeightFn(x, z) - base);
            const surface = A.waterSurfaceAt(x, z);
            if (surface !== null) coastWaterError = Math.max(coastWaterError, Math.abs(surface - W.SEA_LEVEL));
            coastSamples++;
          }
    const shores = L.PONDS.map((p: any) => {
      let worst = Infinity,
        checked = 0;
      const wet = (r: number, a: number) => {
        const x = p.at[0] + Math.cos(a) * r,
          z = p.at[1] + Math.sin(a) * r,
          w = A.waterSurfaceAt(x, z);
        return w !== null;
      };
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        let lo = 0,
          hi = p.radius * 1.3 + 65;
        if (wet(hi, a)) continue;
        for (let j = 0; j < 18; j++) {
          const mid = (lo + hi) / 2;
          if (wet(mid, a)) lo = mid;
          else hi = mid;
        }
        const r = hi + 0.35,
          x = p.at[0] + Math.cos(a) * r,
          z = p.at[1] + Math.sin(a) * r;
        worst = Math.min(worst, T.heightAt(x, z) - p.level);
        checked++;
      }
      let inletError = 0;
      for (let a = 0; a < 48; a++)
        for (let r = p.radius * 0.5; r < p.radius + 10; r += 3) {
          const angle = (a / 48) * Math.PI * 2,
            w = A.waterSurfaceAt(p.at[0] + Math.cos(angle) * r, p.at[1] + Math.sin(angle) * r);
          if (w !== null) inletError = Math.max(inletError, Math.abs(w - p.level));
        }
      return { id: p.id, worst, checked, inletError };
    });
    const exits = L.BANK_EXITS.map((e: any) => {
      L.bankExitProfile(e, T.baseWorldHeightFn);
      const length = Math.hypot(e.end[0] - e.at[0], e.end[1] - e.at[1]),
        dx = (e.end[0] - e.at[0]) / length,
        dz = (e.end[1] - e.at[1]) / length;
      return { id: e.id, length, continuation: Math.abs(T.heightAt(e.end[0] + dx * 6, e.end[1] + dz * 6) - T.heightAt(...e.end)), dry: A.waterSurfaceAt(...e.end) === null };
    });
    (window as any).__shore = { renderer, scene, terrain, landscape, camera, THREE };
    return { shores, exits, coastRise, coastWaterError, coastSamples };
  });
  console.log('shoreline audit', result);
  await test.info().attach('shoreline-audit', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  expect(result.coastSamples).toBeGreaterThan(20);
  expect(result.coastRise).toBeLessThan(0.001);
  expect(result.coastWaterError).toBeLessThan(0.001);
  expect(result.shores.every((p: any) => p.checked > 36 && p.worst > -0.08 && p.inletError < 0.3)).toBe(true);
  expect(result.exits.every((e: any) => e.dry && e.continuation < 3.5)).toBe(true);
  for (const p of [
    { id: 'hanging-tarn', x: 3930, z: -4600, level: 449 },
    { id: 'crownwater-basin', x: -2280, z: -260, level: 4 },
    { id: 'glasswind-oasis', x: -5100, z: 1270, level: 20 },
    { id: 'lantern-mere', x: 940, z: 350, level: 1 },
  ]) {
    await page.evaluate((p) => {
      const g = (window as any).__shore,
        v = new g.THREE.Vector3(p.x, p.level, p.z);
      g.terrain.warm(v);
      for (let i = 0; i < 30; i++) g.landscape.update(0.4, v, true);
      g.camera.position.set(p.x + 95, p.level + 90, p.z + 105);
      g.camera.lookAt(p.x, p.level, p.z);
      g.renderer.render(g.scene, g.camera);
    }, p);
    const coverage = await page.evaluate(async (p) => {
      const g = (window as any).__shore,
        L = await import('/src/world/landscape/layout.ts' as string),
        T = await import('/src/world/terrainHeight.ts' as string),
        A = await import('/src/world/waterLevel.ts' as string);
      const pond = L.PONDS.find((s: any) => s.at[0] === p.x && s.at[1] === p.z),
        course = L.WATERCOURSES.find((w: any) => w.knots.at(-1)[0] === p.x && w.knots.at(-1)[1] === p.z);
      const previous = course.knots.at(-2),
        len = Math.hypot(previous[0] - p.x, previous[1] - p.z),
        x = p.x + ((previous[0] - p.x) / len) * (pond.radius - course.width),
        z = p.z + ((previous[1] - p.z) / len) * (pond.radius - course.width);
      g.scene.updateMatrixWorld(true);
      const meshes: any[] = [];
      g.scene.traverse((o: any) => {
        if (o.name === 'landscape-water') meshes.push(o);
      });
      const ray = new g.THREE.Raycaster();
      let checked = 0,
        gaps = 0;
      for (let dx = -10; dx <= 10; dx += 2)
        for (let dz = -10; dz <= 10; dz += 2) {
          const px = x + dx,
            pz = z + dz,
            level = A.waterSurfaceAt(px, pz);
          if (level === null || Math.abs(level - p.level) > 0.1 || level - T.heightAt(px, pz) < 1) continue;
          checked++;
          ray.set(new g.THREE.Vector3(px, level + 2, pz), new g.THREE.Vector3(0, -1, 0));
          if (!ray.intersectObjects(meshes).some((h: any) => Math.abs(h.point.y - level) < 0.1)) gaps++;
        }
      return { checked, gaps };
    }, p);
    console.log('water mesh coverage', p.id, coverage);
    expect(coverage.checked).toBeGreaterThan(10);
    expect(coverage.gaps).toBe(0);
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const g = (window as any).__shore;
      g.renderer.render(g.scene, g.camera);
    });
    await page.screenshot({ path: test.info().outputPath(p.id + '.png') });
  }
});
