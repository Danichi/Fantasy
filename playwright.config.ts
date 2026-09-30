import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  timeout: 240_000 * Number(process.env.PW_SLOW ?? '1'),
  workers: Number(process.env.PLAYWRIGHT_WORKERS ?? '2'),
  use: {
    // Tests get their own dev server on 5191, fresh every run: a long-lived
    // server that has hot-reloaded edits hands tests stale module copies.
    baseURL: 'http://localhost:5191',
    viewport: { width: 1280, height: 720 },
    // PW_SWIFTSHADER=1 renders on the CPU like the GPU-less CI runners do.
    launchOptions: { args: process.env.PW_SWIFTSHADER ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] },
  },
  webServer: {
    command: 'npx vite --port 5191 --strictPort',
    url: 'http://localhost:5191',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
