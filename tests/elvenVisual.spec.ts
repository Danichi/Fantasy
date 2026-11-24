import { test, expect } from './fixtures';
test('Verdant settlements, World Tree canopy and Moonlight Glade render with bounded forest batches', async ({ page }) => {
  await page.route('**/forest-preview.html', (r) =>
    r.fulfill({ body: '<!doctype html><html><style>body{margin:0;background:#172c2a}canvas{display:block}</style><body></body></html>', contentType: 'text/html' })
  );
  await page.goto('/forest-preview.html');
  await page.setViewportSize({ width: 1100, height: 760 });
  const metrics = await page.evaluate(async () => {
    const W = await import('/src/world/worldMap.ts' as string);
    await W.loadWorldMap();
    const THREE = await import('/node_modules/three/build/three.module.js' as string),
      P = await import('/src/physics/physics.ts' as string),
      T = await import('/src/world/terrainHeight.ts' as string),
      F = await import('/src/world/elves/forestGeometry.ts' as string),
      L = await import('/src/world/elves/layout.ts' as string);
    await P.physics.init();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x93b3a4);
    scene.fog = new THREE.FogExp2(0x93b3a4, 0.0025);
    scene.add(new THREE.HemisphereLight(0xdbe6df, 0x324335, 2));
    const sun = new THREE.DirectionalLight(0xffe6be, 3);
    sun.position.set(-90, 170, 60);
    scene.add(sun);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(1100, 760);
    renderer.setPixelRatio(0.8);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    document.body.appendChild(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(55, 1100 / 760, 0.1, 4000),
      palette = new F.ForestPalette(),
      mats: any = {};
    for (const k of ['stone', 'bridgeStone', 'plaster', 'timber', 'slate', 'tile', 'thatch', 'planks', 'glass', 'bark', 'window', 'windowLit', 'door'])
      mats[k] = palette[k] ?? palette.wood;
    let parts: any[] = [],
      ground: any = null;
    (window as any).preview = (id: string, canopy = false) => {
      for (const g of parts) g.dispose();
      parts = [];
      if (ground) {
        ground.geometry.dispose();
        ground.material.dispose();
        ground.removeFromParent();
      }
      const s = L.FOREST_SITES.find((s: any) => s.id === id),
        [x, z] = s.at,
        y = T.heightAt(x, z),
        geo = new THREE.PlaneGeometry(540, 540, 135, 135);
      geo.rotateX(-Math.PI / 2);
      for (let i = 0; i < geo.attributes.position.count; i++) {
        const px = geo.attributes.position.getX(i) + x,
          pz = geo.attributes.position.getZ(i) + z;
        geo.attributes.position.setXYZ(i, px, T.heightAt(px, pz), pz);
      }
      geo.computeVertexNormals();
      ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x526c4b, roughness: 1 }));
      scene.add(ground);
      parts.push(F.buildForestSite(s, palette, mats, scene));
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) parts.push(F.buildForestCell(Math.floor(x / 128) + i, Math.floor(z / 128) + j, palette, scene));
      if (id === 'sanctum') parts.push(F.buildWorldTree(palette, scene));
      camera.position.set(x + (canopy ? 66 : 105), y + (canopy ? 55 : id === 'sanctum' ? 210 : 68), z + (canopy ? 64 : id === 'sanctum' ? 270 : 100));
      camera.lookAt(x, y + (canopy ? 28 : id === 'sanctum' ? 125 : 7), z);
      if (id === 'glade') {
        scene.background.setHex(0x162b42);
        scene.fog.color.setHex(0x263b49);
        sun.intensity = 0.7;
      } else {
        scene.background.setHex(0x93b3a4);
        scene.fog.color.setHex(0x93b3a4);
        sun.intensity = 3;
      }
      renderer.render(scene, camera);
      return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, bodies: P.physics.world.bodies.len() };
    };
    return (window as any).preview('thornwick');
  });
  expect(metrics.calls).toBeLessThan(180);
  expect(metrics.triangles).toBeGreaterThan(10000);
  await page.screenshot({ path: 'test-results/verdant-thornwick.png' });
  for (const [id, canopy] of [
    ['silverbough', false],
    ['sanctum', false],
    ['sanctum', true],
    ['glade', false],
  ] as const) {
    const r = await page.evaluate(({ id, canopy }) => (window as any).preview(id, canopy), { id, canopy });
    console.log(id, canopy, r);
    expect(r.calls).toBeLessThan(250);
    await page.screenshot({ path: `test-results/verdant-${id}${canopy ? '-canopy' : ''}.png` });
  }
});
