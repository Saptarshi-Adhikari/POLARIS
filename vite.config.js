import { defineConfig } from 'vite';

/**
 * ASTRALIS Nav-OS — Vite Configuration
 * MapLibre GL JS + MapTiler 2D Antarctic Map Engine
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
