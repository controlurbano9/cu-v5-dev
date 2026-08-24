const reactHooks = require('eslint-plugin-react-hooks');

// Solo las reglas clasicas de hooks (QW9): las del set "recommended" del
// plugin traen ademas los lints de React Compiler (immutability, purity,
// static-components...), pensados para código idiomático React 19+ y
// demasiado ruidosos para este bundle (aliasing manual de hooks, refs,
// JSX transpilado por esbuild sin runtime automático).
module.exports = [
  {
    files: ['**/*.jsx', '**/*.js'],
    ignores: ['node_modules/**', 'bundle.min.js', 'bundle.min.js.map', 'catastro.json'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
