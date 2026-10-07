import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/target/**',
      'docs/**',
      'implementation-tasks/**',
    ],
  },
  ...tseslint.configs.recommended,
);
