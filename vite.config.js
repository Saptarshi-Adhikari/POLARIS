import { defineConfig } from 'vite';

/**
 * ASTRALIS Nav-OS — Vite Configuration
 * POLARIS DEMO Simulation Engine
 */
export default defineConfig({
  server: {
    port: 5173,
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 2000,
  },
});
