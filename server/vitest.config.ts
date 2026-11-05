import { createRequire } from 'node:module';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const require = createRequire(import.meta.url);

// esbuild, Vitest's own transform, does not emit decorator metadata, which
// TypeORM reads; SWC does (decision 54). It takes the decorator settings from
// tsconfig.json.
export default defineConfig({
  plugins: [swc.vite()],
  resolve: {
    // graphql 16 has no "exports": Node loads its CommonJS build, Vite its
    // index.mjs. TypeGraphQL and Yoga (loaded by Node) and our code must see
    // one copy, or its classes fail their instanceof checks.
    alias: { graphql: require.resolve('graphql') },
  },
});
