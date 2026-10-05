import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['.nuxt/**', '.output/**', 'dist/**', 'node_modules/**', 'coverage/**', 'eslint.config.js'] },
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        allowDefaultProject: ['*.ts', '*.vue', '*.js'],
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
);