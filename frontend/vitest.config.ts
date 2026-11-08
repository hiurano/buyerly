import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The unit tests (src/**/*.test.ts) run on the models and pure helpers, not the
// components, so this takes only what those need from vite.config.ts: the `@/`
// alias. The StyleX and React Compiler plugins stay out, which keeps a run fast.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts', 'site/**/*.test.ts'],
    environment: 'node',
  },
});
