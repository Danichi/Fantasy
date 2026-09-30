import { defineConfig } from 'vite';

export default defineConfig({
  // Warm-up compiles the whole game when the server starts, so the first page
  // load (and the first test) doesn't wait ~25 s for on-demand transforms.
  server: { port: 5190, host: true, warmup: { clientFiles: ['./src/main.ts'] } },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
  optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'] },
});
