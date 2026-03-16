import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: '/bridge-puzzle-demo/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        practice: resolve(__dirname, 'practice/index.html')
      }
    }
  },

  test: {
    environment: 'node',
    pool: 'forks'
  }
});
