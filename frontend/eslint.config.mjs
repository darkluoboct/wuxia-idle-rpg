import js from '@eslint/js'
import vue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/output/**', '**/*.tsbuildinfo'] },
  {
    files: ['**/*.ts', '**/*.vue', '**/*.mjs'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      // TypeScript checks declarations. Match the existing unused-binding settings in tsconfig.
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  ...vue.configs['flat/essential'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
    rules: { 'vue/multi-word-component-names': 'off' },
  },
)
