/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  // houses.geojson is imported with ?raw and parsed at startup, so no plugin needed
  build: { chunkSizeWarningLimit: 1500 },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/test/**', 'src/vite-env.d.ts', 'src/types.ts'],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
