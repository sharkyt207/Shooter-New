// `vitest/config` re-exports Vite's defineConfig with the `test` field typed,
// so one config file serves both the dev server and the test runner.
import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

/**
 * Single-file mode, set by `scripts/build-single-file.mjs`.
 *
 * It changes two things and nothing else: one chunk instead of two, and no
 * source maps - a map file next to a document that is meant to travel alone
 * would never be found anyway.
 */
const SINGLE_FILE = process.env['SINGLE_FILE'] === '1';

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2022',
    sourcemap: !SINGLE_FILE,
    rollupOptions: {
      output: SINGLE_FILE
        ? {
            // One chunk, so `scripts/build-single-file.mjs` has a single script
            // to inline. The Pixi split below buys caching between releases,
            // which means nothing when the release is one document.
            inlineDynamicImports: true,
          }
        : {
            // Keep PixiJS in its own chunk. It is by far the largest dependency
            // and it changes rarely, so a separate chunk stays cached across
            // releases.
            manualChunks(id: string) {
              return id.includes('node_modules/pixi.js') ? 'pixi' : undefined;
            },
          },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
