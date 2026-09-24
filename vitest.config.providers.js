import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/providers/__tests__/**/*.test.ts'],
  },
});
