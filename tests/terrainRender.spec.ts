import { test, expect } from './fixtures';
test('production terrain, grass tufts, woodland and outcrops render without shader errors', async ({ page }, info) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text());
  });
  await page.setViewportSize({ width: 1000, height: 650 });
  await page.route('**/terrain-preview.html', (r) => r.fulfill({ body: '<!doctype html><html><body style="margin:0"></body></html>', contentType: 'text/html' }));
  await page.goto('/terrain-preview.html?test');
  await page.evaluate(async () => {
    const W = await import('/src/world/worldMap.ts' as string);
    await W.loadWorldMap();
    const THREE = await import('/node_modules/three/build/three.module.js' as string),
      P = await import('/src/physics/physics.ts' as string),
      T = await import('/src/world/terrain.ts' as string),
      H = await import('/src/world/terrainHeight.ts' as string),
      G = await import('/src/world/grass.ts' as string),
      GW = await import('/src/world/groundWindow.ts' as string),
      N = await import('/src/world/stylizedNature.ts' as string),
      D = await import('/src/world/landscape/dressing.ts' as string),
      S = await import('/src/core/settings.ts' as string);
    await P.physics.init();
    H.initTerrainData();
    S.Q.grassBlades = 38000;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xaacbdf);
    scene.fog = new THREE.FogExp2(0xaacbdf, 0.001);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(1000, 650);
    renderer.setPixelRatio(0.8);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    document.body.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xc4e2ff, 0x68754c, 2));
    const sun = new THREE.DirectionalLight(0xffedcf, 3);
    sun.position.set(-80, 120, 40);
    scene.add(sun);
    const terrain = new T.Terrain(scene, renderer),
      ground = new GW.GroundWindow(terrain.splat),
      grass = new G.Grass(scene, ground),
      nature = new N.StylizedNature(scene, renderer);
    await nature.ready;
    const dressing = new D.TerrainDressing(scene, (x: number, z: number, r: number) => nature.canPlace(x, z, r));
    const camera = new THREE.PerspectiveCamera(65, 1000 / 650, 0.1, 2300);
    (window as any).preview = (x: number, z: number, dx: number, dz: number) => {
      const p = new THREE.Vector3(x, H.heightAt(x, z), z);
      camera.position.copy(p).add(new THREE.Vector3(0, 2.8, 0));
      camera.lookAt(x + dx, H.heightAt(x + dx, z + dz) + 2, z + dz);
      terrain.warm(p);
      ground.prime(p);
      grass.update(0.5, p, p);
      nature.warm(p, p);
      dressing.warm(p);
      renderer.render(scene, camera);
      return { height: p.y, rocks: dressing.stats, nature: nature.loaded, programs: renderer.info.programs?.length };
    };
  });
  for (const [label, x, z, dx, dz] of [
    ['meadow', -550, -700, -60, -20],
    ['mountains', 4100, -4950, 180, -250],
    ['woodland', -3200, -3500, -60, -35],
  ] as const) {
    const r = await page.evaluate(([x, z, dx, dz]) => (window as any).preview(x, z, dx, dz), [x, z, dx, dz]);
    console.log(label, r);
    await page.screenshot({ path: info.outputPath(`${label}.png`) });
    expect(r.rocks.instances).toBeGreaterThan(20);
    expect(r.nature).toBe(true);
  }
  expect(errors).toEqual([]);
});
