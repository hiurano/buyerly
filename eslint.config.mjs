// One lint setup for the TypeScript in this repository (decision 54, #611).
// Type-aware rules: they catch what tsc alone does not, like a promise that
// nobody awaits.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Fastify handlers are async by contract even when they await nothing.
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    files: ['frontend/**'],
    rules: {
      // Store methods are bound by makeStore (MobX autoBind), so
      // `useShellStore((state) => state.toggle)` passes a bound function.
      '@typescript-eslint/unbound-method': 'off',
      // React drops what an event handler returns; async onClick/onSubmit
      // handlers are the usual React pattern. Other void spots stay checked.
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
    },
  },
);
