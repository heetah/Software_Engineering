// 完整的檔案類型支援配置 (CommonJS version)

const FILE_TYPE_CONFIG = {
  // Web 前端
  web: ['.html', '.htm', '.css', '.scss', '.sass', '.less'],

  // JavaScript 生態系
  javascript: ['.js', '.mjs', '.cjs', '.jsx'],

  // TypeScript
  typescript: ['.ts', '.tsx', '.d.ts'],

  // 前端框架
  frameworks: ['.vue', '.svelte', '.astro'],

  // 資料格式
  data: ['.json', '.json5', '.jsonc', '.xml', '.yaml', '.yml', '.toml', '.ini', '.csv'],

  // 文檔
  docs: ['.md', '.mdx', '.txt', '.rst', '.adoc'],

  // 後端語言
  backend: ['.py', '.rb', '.php', '.java', '.kt', '.cs', '.go', '.rs'],

  // 配置檔
  config: ['.env', '.env.local', '.env.production', '.gitignore', '.npmrc', '.editorconfig'],

  // 腳本
  scripts: ['.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd'],

  // 資料庫
  database: ['.sql', '.prisma', '.graphql', '.gql'],

  // 其他
  others: ['.svg', '.dockerfile', '.containerfile', '.lock', '.log']
};

// 根據安全等級選擇
const SECURITY_LEVELS = {
  strict: ['web', 'javascript', 'typescript', 'data', 'docs'], // Demo 用
  moderate: ['web', 'javascript', 'typescript', 'frameworks', 'data', 'docs', 'config'], // 一般專案
  permissive: Object.keys(FILE_TYPE_CONFIG) // 全支援
};

// 實際使用
const SECURITY_LEVEL = 'moderate';
const ALLOWED_CATEGORIES = SECURITY_LEVELS[SECURITY_LEVEL];
const ALLOWED_EXT = ALLOWED_CATEGORIES.flatMap(cat => FILE_TYPE_CONFIG[cat]);

// 檔案大小限制（可依類型調整）
const FILE_SIZE_LIMITS = {
  default: 200 * 1024,      // 200 KB
  '.svg': 500 * 1024,       // 500 KB (SVG 可能較大)
  '.json': 1024 * 1024,     // 1 MB (JSON 資料可能很大)
  '.log': 2 * 1024 * 1024   // 2 MB (日誌檔)
};

function getMaxFileSize(ext) {
  return FILE_SIZE_LIMITS[ext] || FILE_SIZE_LIMITS.default;
}

module.exports = {
  FILE_TYPE_CONFIG,
  SECURITY_LEVELS,
  ALLOWED_EXT,
  FILE_SIZE_LIMITS,
  getMaxFileSize
};

