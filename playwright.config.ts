import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  timeout: 240_000 * Number(process.env.PW_SLOW ?? '1'),
  workers: Number(process.env.PLAYWRIGHT_WORKERS ?? '2'),
  use: {
    baseURL: 'http://localhost:5190',
    viewport: { width: 1280, height: 720 },
    // PW_SWIFTSHADER=1 renders on the CPU like the GPU-less CI runners do.
    launchOptions: { args: process.env.PW_SWIFTSHADER ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] },
  },
  webServer: {
    command: 'npx vite --port 5190 --strictPort',
    url: 'http://localhost:5190',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
