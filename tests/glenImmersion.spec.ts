import { test, expect, SLOW } from './fixtures';

test('local audio follows physical distance, camera direction, night and shelter; hard footsteps use distinct contacts', async ({ page }) => {
  await page.route('**/sound-audit.html', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><button>Listen</button>' }));
  await page.goto('/sound-audit.html');
  await page.evaluate(async () => {
    const A = await import('/src/audio/ambience.ts' as string);
    (window as any).amb = new A.Ambience();
    document.querySelector('button')!.onclick = () => (window as any).amb.start();
  });
  await page.getByRole('button').click();
  await page.waitForFunction(() => (window as any).amb.foley.context?.state === 'running');
  const result = await page.evaluate(async () => {
    const a = (window as any).amb,
      local = a.local;
    const sound = local.beds.get('river');
    local.update(5, 158, 6, 1, 0, 0, 1, true);
    const near = sound.gain.gain.value,
      right = sound.pan.pan.value;
    local.update(5, 158, 6, -1, 0, 0, 1, true);
    const left = sound.pan.pan.value;
    local.update(5, 900, 6, 1, 0, 0, 1, true);
    const far = sound.gain.gain.value;
    local.update(5, 0, 7, 1, 0, 0, 1, true);
    const day = local.beds.get('crowd').gain.gain.value;
    local.update(5, 0, 7, 1, 0, 1, 1, true);
    const night = local.beds.get('crowd').gain.gain.value;
    local.update(5, 158, 6, 1, 0, 0, 1, false);
    const sheltered = sound.gain.gain.value;
    const steps: string[] = [],
      original = a.foley.step.bind(a.foley);
    a.foley.step = (kind: string, volume: number, wet: boolean) => {
      steps.push(kind);
      original(kind, volume, wet);
    };
    for (const s of ['stone', 'dirt', 'wood', 'sand', 'water']) a.footstep(s, false);
    a.footstep('grass', true);
    a.setMuted(true);
    a.footstep('stone', false);
    const muted = [...local.beds.values()].every((b: any) => b.gain.gain.value === 0 && b.audio.paused);
    await new Promise((r) => setTimeout(r, 300));
    await a.foley.context.close();
    return { near, right, left, far, day, night, sheltered, steps, snow: a.steps.snow.length, muted };
  });
  expect(result.near).toBeGreaterThan(0.15);
  expect(result.right).toBeGreaterThan(0.5);
  expect(result.left).toBeLessThan(-0.5);
  expect(result.far).toBeLessThan(0.001);
  expect(result.day).toBeGreaterThan(0.1);
  expect(result.night).toBeLessThan(0.001);
  expect(result.sheltered).toBeLessThan(0.001);
  expect(result.steps).toEqual(['stone', 'dirt', 'wood', 'sand', 'water']);
  expect(result.snow).toBe(4);
  expect(result.muted).toBe(true);
});

test('batched stylized assets retain normalized vertex palettes alongside uncoloured geometry', async ({ page }) => {
  await page.route('**/palette-audit.html', (r) => r.fulfill({ body: '<!doctype html><html></html>', contentType: 'text/html' }));
  await page.goto('/palette-audit.html');
  const r = await page.evaluate(async () => {
    const T = await import('/node_modules/three/build/three.module.js' as string),
      B = await import('/src/world/cityKit.ts' as string);
    const scene = new T.Scene(),
      batch = new B.StaticBatch(),
      mat = new T.MeshStandardMaterial({ vertexColors: true });
    const a = new T.BoxGeometry(1, 1, 1),
      colors = new Uint8Array(a.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) colors.set([45, 130, 71], i);
    a.setAttribute('color', new T.BufferAttribute(colors, 3, true));
    batch.add(a, mat, new T.Matrix4());
    batch.add(new T.BoxGeometry(1, 1, 1), mat, new T.Matrix4().makeTranslation(2, 0, 0));
    const meshes = batch.build(scene),
      c = meshes[0].geometry.attributes.color;
    return { meshes: meshes.length, first: [c.getX(0), c.getY(0), c.getZ(0)], fallback: [c.getX(c.count - 1), c.getY(c.count - 1), c.getZ(c.count - 1)] };
  });
  expect(r.meshes).toBe(1);
  expect(r.first[0]).toBeCloseTo(45 / 255, 5);
  expect(r.first[1]).toBeCloseTo(130 / 255, 5);
  expect(r.first[2]).toBeCloseTo(71 / 255, 5);
  expect(r.fallback).toEqual([1, 1, 1]);
});

test('Glen work is visible and repeatable, conversations hold workers, and landmarks give usable directions', async ({ game }, info) => {
  test.setTimeout(500_000 * SLOW);
  const { page, errors } = game;
  const state = await page.evaluate(async () => {
    const g = (window as any).__game,
      n = g.npcs;
    g.pause(true);
    g.sleep(true);
    g.player.invulnerable = true;
    g.dialogue.close();
    const H = await import('/src/world/terrainHeight.ts' as string);
    const carrier = n.find('glen-relief-0'),
      dora = n.find('dora');
    g.time.skipTo(10);
    n.raining = false;
    g.player.teleport(new g.THREE.Vector3(-38, H.heightAt(-38, 120) + 0.1, 120));
    n.update(0.3, g.player.pos, g.r.camera.position, 0);
    const taskAt = (hour: number) => {
      g.time.skipTo(hour);
      return n.taskOf('dora');
    };
    const tasks = [10, 10.3, 10.6, 10.9].map((h) => taskAt(h)?.place);
    g.time.skipTo(10.3);
    const before = n.taskOf('dora')?.place;
    g.time.skipTo(18);
    g.time.skipTo(10.3);
    const restored = n.taskOf('dora')?.place;
    // Walk the worker through its task changes on the real collision-aware routes.
    let moved = 0,
      last = dora.pos.clone();
    for (let i = 0; i < 250; i++) {
      g.time.skipTo(10 + i / 120);
      n.update(0.1, g.player.pos, g.r.camera.position, 0);
      moved = Math.max(moved, dora.pos.distanceTo(last));
    }
    n.engaged = dora;
    const held = dora.pos.clone();
    g.time.skipTo(12.7);
    for (let i = 0; i < 30; i++) n.update(0.1, g.player.pos, g.r.camera.position, 0);
    const heldDistance = dora.pos.distanceTo(held);
    n.engaged = null;
    n.raidOn = 'elderGlen';
    n.update(0.3, g.player.pos, g.r.camera.position, 1);
    const raidTask = n.taskOf('dora');
    n.raidOn = null;
    n.raining = true;
    const rainTask = n.taskOf('dora');
    n.raining = false;
    const dirs: string[] = [];
    for (const sign of g.glenCircuit.interactables.filter((s: any) => s.label().startsWith('Read directions'))) {
      g.player.teleport(sign.pos.clone().add(new g.THREE.Vector3(0, 0.2, 1)));
      sign.action();
      g.dialogue.update(10);
      dirs.push(document.querySelector('.dialogue')!.textContent!);
      g.dialogue.close();
    }
    // The belfry is a real interaction with a cooldown, not a decoration.
    const bell = g.glenCircuit.interactables.find((s: any) => s.label().startsWith('Ring'));
    let rings = 0;
    const original = g.glenCircuit.onBell;
    g.glenCircuit.onBell = () => rings++;
    g.player.teleport(bell.pos.clone());
    bell.action();
    bell.action();
    g.glenCircuit.onBell = original;
    return {
      tasks,
      before,
      restored,
      moved,
      heldDistance,
      raidTask,
      rainTask,
      dirs,
      rings,
      carrier: !!carrier,
      ids: n.npcs.filter((s: any) => s.rec.id.startsWith('glen-relief-')).map((s: any) => s.rec.id)
    };
  });
  expect(new Set(state.tasks).size).toBeGreaterThan(1);
  expect(state.restored).toBe(state.before);
  expect(state.moved).toBeGreaterThan(1);
  expect(state.heldDistance).toBeLessThan(0.01);
  expect(state.raidTask).toBeNull();
  expect(state.rainTask).toBeNull();
  expect(state.carrier).toBe(true);
  expect(new Set(state.ids).size).toBe(state.ids.length);
  expect(state.dirs).toHaveLength(4);
  expect(state.dirs[0]).toMatch(/blue-and-gold/i);
  expect(state.dirs[3]).toContain('Elder Glen');
  expect(state.rings).toBe(1);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.time.skipTo(10);
    g.npcs.raidOn = null;
    g.npcs.raining = false;
    g.player.teleport(
      g.npcs
        .find('dora')
        .pos.clone()
        .add(new g.THREE.Vector3(4, 0, 4))
    );
    g.r.render(0.016);
  });
  await page.waitForFunction(
    () => {
      const g = (window as any).__game;
      g.npcs.update(0.3, g.player.pos, g.r.camera.position, 0);
      return !!g.npcs.find('dora').actor;
    },
    null,
    { timeout: 60_000 }
  );
  const carried = await page.evaluate(() => {
    const g = (window as any).__game,
      n = g.npcs,
      dora = n.find('dora');
    for (let i = 0; i < 40; i++) {
      g.time.skipTo(10 + i / 40);
      if (n.taskOf('dora')?.carry === 'sack') break;
    }
    n.update(0.1, g.player.pos, g.r.camera.position, 0);
    g.cam.yaw = 0.6;
    g.cam.pitch = 0.15;
    g.cam.distance = 4.8;
    g.cam.snapTo(dora.pos);
    g.cam.update(0.016, dora.pos, false);
    g.r.render(0.016);
    return !!dora.actor.carried?.visible && dora.actor.carryPose?.getClip().tracks.length > 0;
  });
  expect(carried).toBe(true);
  await page.screenshot({ path: info.outputPath('granary-work.png') });
  const visibility = await page.evaluate(async () => {
    const g = (window as any).__game;
    const door = g.doors.find((d: any) => (!d.kind || d.kind === 'home') && Math.hypot(d.pos.x, d.pos.z) < 110);
    await g.realm.enterInterior(door, 'home', g.world.mats, g.spells);
    const hidden = !g.glenCircuit.group.visible && g.glenCircuit.interactables.every((s: any) => !s.enabled());
    await g.realm.leaveInterior();
    return { hidden, returned: g.glenCircuit.group.visible };
  });
  expect(visibility).toEqual({ hidden: true, returned: true });
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.sleep(false);
    g.pause(false);
  });
  expect(errors).toEqual([]);
});
