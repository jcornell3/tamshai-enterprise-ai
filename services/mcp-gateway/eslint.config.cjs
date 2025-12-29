// eslint.config.cjs
const tseslint = require('typescript-eslint');

module.exports = [
  {
    ignores: ["dist/", "node_modules/"],
  },
  ...tseslint.configs.recommended,
];
