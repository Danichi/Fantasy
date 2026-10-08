import { realpathSync } from 'node:fs';
import { defineConfig, searchForWorkspaceRoot } from 'vite';

export default defineConfig({
  // Worktrees that share one node_modules each keep their own dependency cache (VITE_CACHE_DIR).
  cacheDir: process.env.VITE_CACHE_DIR ?? 'node_modules/.vite',
  // Warm-up compiles the whole game when the server starts, so the first page
  // load (and the first test) doesn't wait ~25 s for on-demand transforms.
  server: {
    port: 5190, host: true, warmup: { clientFiles: ['./src/main.ts'] },
    // node_modules may be a link (the test worktree shares the main one): serve its real path too.
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), realpathSync('node_modules')] },
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
  optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'] },
});
