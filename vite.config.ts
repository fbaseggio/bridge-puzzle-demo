import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: '/',
  build: {
    rollupOptions: {
      input: {
        home: resolve(__dirname, 'index.html'),
        workbench: resolve(__dirname, 'workbench/index.html'),
        practice: resolve(__dirname, 'practice/index.html')
      }
    }
  },

  test: {
    environment: 'node',
    pool: 'forks'
  }
});
