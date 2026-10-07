import tseslint from 'typescript-eslint';
import vuePlugin from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';

export default tseslint.config(
  { ignores: ['.nuxt/**', '.output/**', 'dist/**', 'node_modules/**', 'coverage/**', 'eslint.config.js', 'postcss.config.js'] },
  ...tseslint.configs.recommended,
  ...vuePlugin.configs['flat/recommended'],
  {
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        projectService: true,
        allowDefaultProject: ['*.ts', '*.vue', '*.js', 'postcss.config.js'],
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
);