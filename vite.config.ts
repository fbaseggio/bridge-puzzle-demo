import { defineConfig } from 'vite';

export default defineConfig({
  base: '/bridge-puzzle-demo/',

  test: {
    environment: 'node',
    pool: 'forks'
  }
});