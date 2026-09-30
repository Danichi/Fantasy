import { test as base, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';

// Shared test harness.
//
// Booting the game costs ~50 s (building the world, then compiling ~120
// shader programs for the first frame), and it used to happen once per test.
// Now:
//   - each worker keeps a persistent browser profile (.pw-cache/w<N>), so
//     Chrome's shader disk cache survives between tests and between runs;
//   - `game` is one booted game per worker, reset to its boot state before
//     every test (__game.resetForTest), so most tests pay no boot at all.
// Tests that need their own page (saves and reloads, a different ?hour) use
// the regular `page` fixture and `boot()`.

/** CI renders in software on a shared runner: PW_SLOW stretches waits and timeouts. */
export const SLOW = Number(process.env.PW_SLOW ?? '1');

export interface Game {
  page: Page;
  /** page errors, console errors and failed requests since this test began */
  errors: string[];
}

/** Record page errors, console errors and failed asset loads. */
function watchErrors(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(e.message));
  // A missing /favicon.ico is reported as a console error with no URL; check
  // failed requests by URL instead so real missing assets still fail the test.
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()));
  page.on('response', (r) => r.status() >= 400 && !r.url().endsWith('/favicon.ico') && errors.push(`${r.status()} ${r.url()}`));
}

/** In-page helper: wait for game time (simulation steps at 60 Hz), not wall-clock time. */
async function addStepWaiter(page: Page) {
  await page.evaluate(() => {
    const waitSteps = async (n: number) => {
      const g = (window as any).__game, s0 = g.steps;
      while (g.steps < s0 + n) await new Promise((r) => setTimeout(r, 15));
    };
    (window as any).W = (window as any).waitSteps = waitSteps;
  });
}

/** Load the game in `page` and wait until the simulation is running. */
export async function boot(page: Page, query = '?test') {
  const errors: string[] = [];
  watchErrors(page, errors);
  await page.goto('/' + query);
  await page.waitForFunction(() => (window as any).__game?.steps > 60, null, { timeout: 180_000 * SLOW });
  await addStepWaiter(page);
  return errors;
}

export const test = base.extend<{ game: Game }, { persistent: BrowserContext; shared: Game }>({
  persistent: [
    async ({}, use, workerInfo) => {
      const opts = workerInfo.project.use;
      const dir = path.join(process.cwd(), '.pw-cache', `w${workerInfo.parallelIndex}`);
      const ctx = await chromium.launchPersistentContext(dir, {
        headless: true,
        args: opts.launchOptions?.args,
        viewport: opts.viewport ?? { width: 1280, height: 720 },
        baseURL: opts.baseURL,
      });
      await use(ctx);
      await ctx.close();
    },
    { scope: 'worker' },
  ],
  // Every page (shared or not) lives in the worker's persistent profile.
  context: async ({ persistent }, use) => {
    await use(persistent);
  },
  page: async ({ persistent }, use) => {
    const page = await persistent.newPage();
    // A fresh page starts from a clean save slot.
    await page.addInitScript(() => {
      if (sessionStorage.getItem('fresh')) return;
      sessionStorage.setItem('fresh', '1');
      localStorage.clear();
    });
    await use(page);
    await page.close();
  },
  shared: [
    async ({ persistent }, use) => {
      const page = await persistent.newPage();
      const errors = await boot(page);
      await use({ page, errors });
      await page.close();
    },
    { scope: 'worker', timeout: 240_000 * SLOW },
  ],
  game: async ({ shared }, use) => {
    shared.errors.length = 0;
    await shared.page.evaluate(() => (window as any).__game.resetForTest());
    await use(shared);
  },
});

export { expect };
