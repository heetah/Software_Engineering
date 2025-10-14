module.exports = {
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['html', 'json'],
  rules: {
    indent: ['error', 2],
    'linebreak-style': 'off', // 關閉行結束符檢查，因為我們支援跨平台
    quotes: ['error', 'single'],
    semi: ['error', 'always'],
    'no-unused-vars': 'warn',
    'no-console': 'off',
  },
  ignorePatterns: [],
  overrides: [
    {
      files: ['*.html'],
      plugins: ['html'],
      rules: {
        indent: 'off',
        quotes: 'off',
        semi: 'off',
        'no-console': 'off',
      },
    },
    {
      files: ['*.json'],
      plugins: ['json'],
      rules: {
        indent: 'off',
        quotes: 'off',
        semi: 'off',
        'no-console': 'off',
      },
    },
  ],
};
