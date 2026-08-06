// `vitest/config` re-exports Vite's defineConfig with the `test` field typed,
// so one config file serves both the dev server and the test runner.
import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

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
    sourcemap: true,
    rollupOptions: {
      output: {
        // Keep PixiJS in its own chunk. It is by far the largest dependency and
        // it changes rarely, so a separate chunk stays cached across releases.
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
