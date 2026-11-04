import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// esbuild, Vitest's own transform, does not emit decorator metadata, which
// TypeORM reads; SWC does (decision 54). It takes the decorator settings from
// tsconfig.json.
export default defineConfig({
  plugins: [swc.vite()],
});
