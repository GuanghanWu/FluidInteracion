import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  server: {
    port: 3000,
    open: true
  },
  build: {
    rollupOptions: {
      external: ['three'],
      output: {
        paths: {
          'three': 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js'
        }
      }
    }
  }
});
