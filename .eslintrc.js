module.exports = {
  env: { // 環境
    browser: true,
    node: true,
    es2022: true,
  },
  extends: ['eslint:recommended'], // 繼承
  parserOptions: { // 解析器選項
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['html', 'json'], // 插件
  rules: {
    indent: ['error', 2], // 縮排
    'linebreak-style': 'off', // 行結束符
    quotes: ['error', 'single'], // 引號
    semi: ['error', 'always'], // 分號
    'no-unused-vars': 'warn', // 未使用變量
    'no-console': 'off',
  },
  ignorePatterns: [], // 忽略文件
  overrides: [
    {
      files: ['*.html'], // 文件
      plugins: ['html'],
      rules: {
        indent: 'off', // 縮排
        quotes: 'off', // 引號
        semi: 'off', // 分號
        'no-console': 'off', // 控制台是否使用
      },
    },
    {
      files: ['*.json'], // 文件
      plugins: ['json'], 
      rules: {
        indent: 'off', // 縮排
        quotes: 'off', // 引號
        semi: 'off', // 分號
        'no-console': 'off', // 控制台是否使用
      },
    },
  ],
};
