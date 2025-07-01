// eslint.config.js
const js = require('@eslint/js');
const globals = require('globals');
const { defineConfig } = require('eslint/config');

module.exports = defineConfig([
  {
    ignores: [
      'node_modules/**',
      'public/js/jquery-1.11.0.min.js',
      'public/js/modernizr.js',
      'public/js/plugins.js',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
    },
  },
  {
    files: ['public/js/**/*.js'],
    languageOptions: {
      globals: globals.browser,
    },
  },
]);
