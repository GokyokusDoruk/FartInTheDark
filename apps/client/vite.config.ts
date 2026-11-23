import { defineConfig } from 'vite';
export default defineConfig({
  base: '/',
  build: { chunkSizeWarningLimit: 700 }, // three.js is ~150 kB gzip; fine for a game
  test: { include: ['test/**/*.test.ts'] },
} as any);
