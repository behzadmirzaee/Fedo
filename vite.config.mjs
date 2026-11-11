import { defineConfig } from 'vite';

export default defineConfig({
  root: 'renderer',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
    target: 'chrome130',
  },
});
