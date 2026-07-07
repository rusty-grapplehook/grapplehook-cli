import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import js from '@eslint/js';
import json from '@eslint/json';
import markdown from '@eslint/markdown';

import stylistic from '@stylistic/eslint-plugin';

export default defineConfig([
  { ignores: ['dist/'] },
  { files: ['**/*.{js,mjs,cjs,ts,mts,cts}'], plugins: { js }, extends: ['js/recommended'], languageOptions: { globals: globals.node } },
  tseslint.configs.recommended,
  { files: ['**/*.json'], plugins: { json }, language: 'json/json', extends: ['json/recommended'] },
  { files: ['**/*.md'], plugins: { markdown }, language: 'markdown/commonmark', extends: ['markdown/recommended'] },
  {
    plugins: { '@stylistic': stylistic },
    rules: {
      // force braces on all if/else/for/while
      curly: ['error', 'all'],

      // blank lines between statements
      '@stylistic/padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: '*', next: 'block-like' },
        { blankLine: 'always', prev: 'block-like', next: '*' },
        { blankLine: 'always', prev: '*', next: 'return' },
        // general: declarations separated from other code
        { blankLine: 'always', prev: ['const', 'let', 'var'], next: '*' },
        { blankLine: 'always', prev: '*', next: ['const', 'let', 'var'] },

        // specific (must come last to win): same kind glued, different kinds separated
        { blankLine: 'never', prev: 'const', next: 'const' },
        { blankLine: 'never', prev: 'let', next: 'let' },
        { blankLine: 'never', prev: 'var', next: 'var' },
        { blankLine: 'always', prev: 'const', next: ['let', 'var'] },
        { blankLine: 'always', prev: 'let', next: ['const', 'var'] },
        { blankLine: 'always', prev: 'var', next: ['const', 'let'] },
      ],
    },
  },
]);
