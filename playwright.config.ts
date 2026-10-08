import { defineConfig } from '@playwright/test';

// PW_PORT lets parallel worktrees each run their tests on their own server.
const PORT = Number(process.env.PW_PORT ?? '5191');

export default defineConfig({
  testDir: 'tests',
  timeout: 240_000 * Number(process.env.PW_SLOW ?? '1'),
  workers: Number(process.env.PLAYWRIGHT_WORKERS ?? '2'),
  use: {
    // Tests get their own dev server on 5191, fresh every run: a long-lived
    // server that has hot-reloaded edits hands tests stale module copies.
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 720 },
    // PW_SWIFTSHADER=1 renders on the CPU like the GPU-less CI runners do.
    launchOptions: { args: process.env.PW_SWIFTSHADER ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] },
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
