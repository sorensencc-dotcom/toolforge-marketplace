import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.vision.setup.js'],
    include: ['src/harvester/external/vision/__tests__/**/*.test.ts'],
  },
});
