import { defineConfig } from 'vite';

export default defineConfig({
  // houses.geojson is imported with ?raw and parsed at startup, so no plugin needed
  build: { chunkSizeWarningLimit: 1500 },
});
