import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  timeout: 240_000,
  workers: Number(process.env.PLAYWRIGHT_WORKERS ?? '2'),
  use: {
    baseURL: 'http://localhost:5190',
    viewport: { width: 1280, height: 720 },
    launchOptions: { args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] },
  },
  webServer: {
    command: 'npx vite --port 5190 --strictPort',
    url: 'http://localhost:5190',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
