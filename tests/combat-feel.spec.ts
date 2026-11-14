import { test, expect, boot, SLOW } from './fixtures';

test('combat feel: fixed-step hits, weapon spacing, commitment, steps and repeatable Sandbox practice', async ({ page }, testInfo) => {
  test.setTimeout(480_000 * SLOW);
  const errors = await boot(page, '?test&sandbox&save');
  await page.evaluate(() => (window as any).__game.pause(true));

  await test.step('real melee produces the same single hit at different render rates, including no rendering', async () => {
    const results = await page.evaluate(() => {
      const g = (window as any).__game,
        s = g.sandbox,
        p = g.player;
      s.settings.enemyAI = false;
      s.settings.drill = 'free';
      s.settings.scenario = 'dummy';
      s.settings.unlimited = false;
      const random = Math.random;
      Math.random = () => 0.5;
      try {
        return [0, 30, 60, 120].map((fps) => {
          g.input.releaseAll();
          s.resetFight();
          const t = s.actors[0];
          p.teleport(t.position.clone().add(new g.THREE.Vector3(0, 0.1, 1.6)));
          p.yaw = g.cam.yaw = Math.PI;
          g.stepSim(20);
          p.lock = t;
          g.input.press('Mouse0');
          for (let i = 0; i < 100; i++) {
            if (i === 4) g.input.release('Mouse0');
            g.stepSim();
            if (fps === 30 && i % 2 === 0) p.present(0.5, 1 / fps);
            if (fps === 60) p.present(0.5, 1 / fps);
            if (fps === 120) {
              p.present(0.25, 1 / fps);
              p.present(0.75, 1 / fps);
            }
          }
          return { fps, hits: s.metrics.hits, damage: s.metrics.damage, lost: t.maxHp - t.hp };
        });
      } finally {
        Math.random = random;
      }
    });
    console.log('frame-rate checks', results);
    for (const r of results) {
      expect(r.hits).toBe(1);
      expect(r.damage).toBeGreaterThan(0);
      expect(r.damage).toBe(results[0].damage);
      expect(r.lost).toBe(results[0].lost);
    }
  });

  await test.step('dagger, sword and spear have measurably different real hit ranges', async () => {
    const reach = await page.evaluate(() => {
      const g = (window as any).__game,
        s = g.sandbox,
        p = g.player;
      const results: Record<string, number> = {};
      for (const family of ['dagger', 'sword', 'spear']) {
        const weapon = p.equip.items.find((i: any) => i.def.kind === family);
        p.equip.equip(weapon.uid, 'main');
        results[family] = 0;
        for (const distance of [1.2, 1.6, 2, 2.4, 2.8, 3.2, 3.6, 4]) {
          g.input.releaseAll();
          s.resetFight();
          const t = s.actors[0];
          p.teleport(t.position.clone().add(new g.THREE.Vector3(0, 0.1, distance)));
          p.yaw = g.cam.yaw = Math.PI;
          p.lock = null;
          g.stepSim(15);
          g.input.press('Mouse0');
          g.stepSim(4);
          g.input.release('Mouse0');
          g.stepSim(100);
          if (s.metrics.hits > 0) results[family] = distance;
        }
      }
      p.equip.equip(p.equip.items.find((i: any) => i.def.kind === 'sword').uid, 'main');
      return results;
    });
    console.log('measured neutral-attack ranges', reach);
    expect(reach.dagger).toBeGreaterThan(0);
    expect(reach.sword).toBeGreaterThan(reach.dagger);
    expect(reach.spear).toBeGreaterThanOrEqual(reach.sword + 0.4);
  });

  await test.step('light attacks allow lateral movement and lock-on has a quickstep plus a full roll', async () => {
    const controls = await page.evaluate(() => {
      const g = (window as any).__game,
        s = g.sandbox,
        p = g.player;
      g.input.releaseAll();
      s.resetFight();
      const t = s.actors[0];
      p.teleport(t.position.clone().add(new g.THREE.Vector3(0, 0.1, 3)));
      p.lock = t;
      p.yaw = g.cam.yaw = Math.PI;
      g.stepSim(15);
      const x = p.pos.x;
      g.input.press('KeyD');
      g.input.press('Mouse0');
      g.stepSim(4);
      g.input.release('Mouse0');
      g.stepSim(12);
      const lateral = Math.abs(p.pos.x - x);
      g.input.releaseAll();
      g.stepSim(100);
      p.stamina = p.maxStamina;
      p.lock = t;
      g.input.press('Space');
      g.stepSim();
      const step = p.act?.def.id;
      g.input.releaseAll();
      g.stepSim(40);
      p.stamina = p.maxStamina;
      p.lock = t;
      g.input.press('ShiftLeft');
      g.input.press('Space');
      g.stepSim();
      const roll = p.act?.def.id;
      g.input.releaseAll();
      g.stepSim(100);
      return { lateral, step, roll };
    });
    console.log('movement controls', controls);
    expect(controls.lateral).toBeGreaterThan(0.12);
    expect(controls.step).toBe('quickstep');
    expect(controls.roll).toBe('roll');
  });

  await test.step('a swordsman visibly commits, can be sidestepped, and cancels its tell when interrupted', async () => {
    const duel = await page.evaluate(async () => {
      const g = (window as any).__game,
        s = g.sandbox,
        p = g.player;
      const { peekCombat } = await import('/src/combat/core.ts' as string);
      s.settings.drill = 'cut';
      s.settings.enemyAI = true;
      s.settings.immortal = false;
      g.input.releaseAll();
      s.spawn('melee');
      const b = s.actors[0];
      await b.ready;
      p.teleport(b.position.clone().add(new g.THREE.Vector3(0, 0.1, 2)));
      p.yaw = Math.PI;
      p.lock = null;
      b.state = 'chase';
      b.yaw = 0;
      b.brain.start(b.brain.moves[0]);
      const phases = new Set<string>();
      let committedYaw: number | null = null,
        maxTurn = 0,
        moved = false,
        steps = 0;
      const hp = p.hp;
      const flurryAnimated = !!b.actions.sword_combo;
      for (let i = 0; i < 85; i++) {
        g.stepSim();
        steps++;
        const read = peekCombat(b)?.read;
        if (!read) break;
        phases.add(read.phase);
        if (read.phase === 'commit' && !moved) {
          committedYaw = b.yaw;
          p.teleport(b.position.clone().add(new g.THREE.Vector3(0, 0.1, -3.5)));
          moved = true;
        }
        if (moved) maxTurn = Math.max(maxTurn, Math.abs(b.yaw - committedYaw!));
        if (read.phase === 'recovery') break;
      }
      const unhit = p.hp === hp;
      b.brain.interrupt();
      g.hud.update(0);
      g.telegraphs.update();
      return { phases: [...phases], maxTurn, moved, unhit, steps, cancelled: !peekCombat(b)?.read, flurryAnimated };
    });
    console.log('duel phases', duel);
    expect(duel.phases).toEqual(['windup', 'commit', 'active', 'recovery']);
    expect(duel.moved).toBe(true);
    expect(duel.unhit).toBe(true);
    expect(duel.maxTurn).toBeLessThan(0.01);
    expect(duel.cancelled).toBe(true);
    expect(duel.flurryAnimated).toBe(true);
  });

  await test.step('live attack cues and the actual strike footprint remain visible while practice is paused', async () => {
    await page.evaluate(async () => {
      const g = (window as any).__game,
        s = g.sandbox,
        p = g.player,
        T = g.THREE;
      const { peekCombat } = await import('/src/combat/core.ts' as string);
      s.settings.immortal = true;
      s.settings.enemyAI = true;
      s.settings.drill = 'cleave';
      s.spawn('melee');
      const b = s.actors[0];
      await b.ready;
      p.teleport(b.position.clone().add(new T.Vector3(0, 0.1, 3.2)));
      p.yaw = g.cam.yaw = Math.PI;
      p.lock = b;
      b.state = 'chase';
      b.yaw = 0;
      b.brain.start(b.brain.moves[0]);
      for (let i = 0; i < 90; i++) {
        g.stepSim();
        if (peekCombat(b)?.read?.phase === 'commit') break;
      }
      p.present(1, 0);
      g.cam.frozen = true;
      g.r.camera.position.copy(b.position).add(new T.Vector3(4, 4.2, 7));
      g.r.camera.lookAt(
        b.position
          .clone()
          .add(p.pos)
          .multiplyScalar(0.5)
          .add(new T.Vector3(0, 1, 0)),
      );
      g.r.camera.updateMatrixWorld(true);
      g.telegraphs.enabled = true;
      g.telegraphs.update();
      g.hud.update(0);
    });
    await expect(page.locator('.combat-tell[data-phase="commit"]')).toBeVisible();
    await expect(page.locator('.sandbox-badge output')).toContainText('Committed');
    const shot = testInfo.outputPath('committed-attack.png');
    await page.screenshot({ path: shot });
    await testInfo.attach('Committed attack and footprint', { path: shot, contentType: 'image/png' });
    await page.evaluate(() => {
      const g = (window as any).__game;
      g.cam.frozen = false;
      g.sandbox.clearTargets();
    });
  });

  await test.step('solid cover blocks both the player blade and enemy melee', async () => {
    const blocked = await page.evaluate(async () => {
      const g = (window as any).__game,
        s = g.sandbox,
        p = g.player,
        T = g.THREE;
      s.settings.enemyAI = false;
      s.settings.scenario = 'dummy';
      s.resetFight();
      const t = s.actors[0];
      p.teleport(t.position.clone().add(new T.Vector3(0, 0.1, 1.6)));
      p.lock = null;
      p.yaw = g.cam.yaw = Math.PI;
      const wall = g.physics.addBox(t.position.clone().add(new T.Vector3(0, 1, 0.8)), new T.Vector3(2, 1, 0.08));
      let hits = -1;
      try {
        g.stepSim(10);
        g.input.press('Mouse0');
        g.stepSim(4);
        g.input.release('Mouse0');
        g.stepSim(100);
        hits = s.metrics.hits;
      } finally {
        g.physics.removeStatic(wall);
      }
      s.settings.drill = 'cut';
      s.settings.enemyAI = true;
      s.settings.immortal = false;
      s.spawn('melee');
      const b = s.actors[0];
      await b.ready;
      p.teleport(b.position.clone().add(new T.Vector3(0, 0.1, 2)));
      const guard = g.physics.addBox(b.position.clone().add(new T.Vector3(0, 1, 1)), new T.Vector3(2, 1, 0.08));
      const hp = p.hp;
      try {
        b.state = 'chase';
        b.yaw = 0;
        b.brain.start(b.brain.moves[0]);
        g.stepSim(60);
        return { hits, enemyBlocked: p.hp === hp };
      } finally {
        g.physics.removeStatic(guard);
      }
    });
    expect(blocked.hits).toBe(0);
    expect(blocked.enemyBlocked).toBe(true);
  });

  await test.step('crossbowmen prepare their shot, and fireball can be aimed without lock-on', async () => {
    const ranged = await page.evaluate(async () => {
      const g = (window as any).__game,
        s = g.sandbox,
        p = g.player;
      const { peekCombat } = await import('/src/combat/core.ts' as string);
      s.settings.immortal = true;
      s.settings.enemyAI = true;
      s.spawn('ranged');
      const b = s.actors[0];
      await b.ready;
      p.teleport(b.position.clone().add(new g.THREE.Vector3(0, 0.1, 10)));
      b.state = 'aim';
      b.cooldown = 0;
      b.st = 1;
      g.stepSim(13);
      const early = { phase: peekCombat(b)?.read?.phase, bolts: s.bolts.list.length };
      g.stepSim(28);
      const released = s.bolts.list.length > 0;
      s.clearTargets();
      const Enemy = (await import('/src/enemies/bandit.ts' as string)).Bandit;
      const chief = new Enemy('chief', g.realm.interior.at(0, -2), g.r.scene, s.bolts);
      s.actors.push(chief);
      await chief.ready;
      p.teleport(chief.position.clone().add(new g.THREE.Vector3(0, 0.1, 10)));
      chief.state = 'aim';
      chief.cooldown = 0;
      chief.st = 1;
      chief.yaw = 0;
      let releases = 0,
        firstYaw = 0,
        activeTurn = 0,
        secondPrepared = false,
        moved = false;
      const off = g.events.on('attackReleased', (e: any) => {
        if (e.target === chief) releases++;
      });
      try {
        g.stepSim();
        for (let i = 0; i < 100; i++) {
          g.stepSim();
          if (chief.shotsFired === 1 && !moved) {
            firstYaw = chief.yaw;
            p.teleport(chief.position.clone().add(new g.THREE.Vector3(6, 0.1, 10)));
            moved = true;
          }
          if (chief.shotsFired === 1 && chief.st < 0.77) activeTurn = Math.max(activeTurn, Math.abs(chief.yaw - firstYaw));
          if (chief.shotsFired === 1 && chief.st > 0.8 && chief.clip === 'bow_aim') secondPrepared = true;
        }
      } finally {
        off();
      }
      const twin = { releases, activeTurn, secondPrepared, shots: chief.shotsFired };

      s.settings.enemyAI = false;
      s.settings.scenario = 'dummy';
      s.resetFight();
      const t = s.actors[0];
      p.teleport(t.position.clone().add(new g.THREE.Vector3(0, 0.1, 5)));
      p.yaw = g.cam.yaw = Math.PI;
      p.lock = null;
      p.aimDir.set(0, 0, -1);
      p.equip.activeSpell = p.equip.add('fireball').uid;
      p.mana = p.maxMana;
      g.input.press('KeyR');
      g.stepSim();
      const cast = p.act?.def.id;
      g.input.releaseAll();
      g.stepSim(140);
      return { early, released, cast, spellHit: t.hp < t.maxHp, twin };
    });
    expect(ranged.early).toEqual({ phase: 'windup', bolts: 0 });
    expect(ranged.released).toBe(true);
    expect(ranged.cast).toBe('castFireball');
    expect(ranged.spellHit).toBe(true);
    expect(ranged.twin).toMatchObject({ releases: 2, shots: 2, secondPrepared: true });
    expect(ranged.twin.activeTurn).toBeLessThan(0.01);
  });

  await test.step('practice presets, repeated moves, slow motion and range targets are accessible', async () => {
    await page.keyboard.press('F6');
    await page.getByRole('button', { name: 'Reference duel · real costs' }).click();
    await expect(page.locator('[data-setting="immortal"]')).not.toBeChecked();
    await expect(page.locator('[data-setting="unlimited"]')).not.toBeChecked();
    await expect(page.locator('[data-setting="drill"]')).toHaveValue('sequence');
    expect(await page.evaluate(() => (window as any).__game.sandbox.actors[0].brain.moves.map((m: any) => m.id))).toEqual([
      'cut',
      'delayed',
      'lunge',
    ]);
    await page.locator('[data-setting="speed"]').scrollIntoViewIfNeeded();
    const controlsShot = testInfo.outputPath('practice-controls.png');
    await page.screenshot({ path: controlsShot });
    await testInfo.attach('Practice controls', { path: controlsShot, contentType: 'image/png' });
    await page.locator('[data-setting="speed"]').selectOption('0.25');
    await page.locator('[data-setting="scenario"]').selectOption('moving');
    await page.getByRole('button', { name: 'Resume · F6 / Esc' }).click();
    await page.evaluate(() => (window as any).__game.pause(true));
    const target = await page.evaluate(() => {
      const g = (window as any).__game,
        t = g.sandbox.actors[0];
      const x = t.position.x;
      g.stepSim(90);
      return { dx: Math.abs(x - t.position.x), speed: g.sandbox.settings.speed, label: t.label };
    });
    expect(target.dx).toBeGreaterThan(1);
    expect(target.speed).toBe(0.25);
    expect(target.label).toBe('Moving range target');
  });
  await test.step('a reset discards queued combat input', async () => {
    const clean = await page.evaluate(() => {
      const g = (window as any).__game;
      g.player.buffer = { a: 'attack', t: g.player.gameTime, actT: 0, actId: null };
      g.input.releaseAll();
      g.sandbox.resetFight();
      g.stepSim(2);
      return !g.player.act;
    });
    expect(clean).toBe(true);
  });
  expect(errors).toEqual([]);
});
