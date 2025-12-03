/**
 * API 生成強制規範
 * 這個文件定義了所有 API 相關代碼的生成規則
 * 目的：確保前後端端口一致，避免 CORS 和配置錯誤
 */

export default {
  // ==================== 核心規則 ====================
  
  /**
   * 規則 1：API URL 配置模式
   * 強制使用運行時配置檔模式
   */
  API_URL_PATTERN: 'runtime-config',
  
  /**
   * 規則 2：禁止的寫法（會觸發錯誤）
   */
  FORBIDDEN_PATTERNS: [
    {
      pattern: /const\s+\w+\s*=\s*['"]https?:\/\/localhost:\d+/,
      error: '❌ 禁止硬編碼 localhost 端口！請使用 window.APP_CONFIG.API_BASE_URL',
      example: 'const API_BASE_URL = window.APP_CONFIG.API_BASE_URL;'
    },
    {
      pattern: /fetch\s*\(\s*['"]https?:\/\/localhost/,
      error: '❌ 禁止在 fetch 中硬編碼完整 URL！請使用 API_BASE_URL 變量',
      example: 'fetch(`${API_BASE_URL}/endpoint`)'
    },
    {
      pattern: /process\.env\.(REACT_APP_|VUE_APP_|VITE_)/,
      error: '❌ 瀏覽器中無法使用 process.env！請使用 window.APP_CONFIG',
      example: 'const API_URL = window.APP_CONFIG.API_BASE_URL;'
    },
    {
      pattern: /import\.meta\.env\./,
      error: '⚠️  import.meta.env 需要構建工具支援。簡單項目請使用 window.APP_CONFIG',
      example: 'const API_URL = window.APP_CONFIG.API_BASE_URL;'
    }
  ],

  /**
   * 規則 3：必須生成的配置文件
   */
  REQUIRED_CONFIG_FILE: {
    filename: 'config.js',
    content: `/**
 * 運行時配置文件
 * 部署時修改此文件以切換環境
 */
window.APP_CONFIG = {
  // 生產環境（預設）：使用相對路徑
  API_BASE_URL: '/api',
  
  // 開發環境（前後端分離時）：取消註解下面這行
  // API_BASE_URL: 'http://localhost:5000/api',
  
  ENVIRONMENT: 'production'
};`,
    mustLoadFirst: true,
    htmlImportExample: '<script src="config.js"></script>  <!-- 必須在 app.js 之前載入 -->'
  },

  /**
   * 規則 4：JavaScript 文件的標準開頭
   */
  STANDARD_JS_HEADER: `/**
 * 從配置文件讀取 API 基礎 URL
 * 不要直接修改這個變量，而是修改 config.js
 */
const API_BASE_URL = window.APP_CONFIG?.API_BASE_URL || '/api';

// 安全檢查：確保配置已載入
if (!window.APP_CONFIG) {
  console.error('❌ Error: config.js not loaded! Please include config.js in HTML first');
}
`,

  /**
   * 規則 5：後端必須提供的路由
   */
  BACKEND_REQUIREMENTS: {
    staticFileRoutes: {
      flask: `
# === 靜態文件服務（必須） ===
from flask import send_from_directory
import os

@app.route('/')
def index():
    """提供 index.html"""
    return send_from_directory(os.path.dirname(__file__), 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    """提供其他靜態文件（CSS、JS 等）"""
    return send_from_directory(os.path.dirname(__file__), filename)
`,
      express: `
// === 靜態文件服務（必須） ===
const express = require('express');
const path = require('path');

app.use(express.static(__dirname));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
`
    },
    
    apiPrefix: '/api',
    note: '所有 API 路由必須以 /api 開頭，靜態文件路由必須能訪問到所有 HTML/CSS/JS'
  },

  /**
   * 規則 6：README 必須包含的說明
   */
  README_REQUIREMENTS: {
    sections: [
      {
        title: '## 環境切換',
        content: `
### 開發環境（前後端分離）
1. 修改 \`config.js\`：
   \`\`\`javascript
   API_BASE_URL: 'http://localhost:5000/api',
   \`\`\`
2. 分別啟動前後端服務器

### 生產環境（一體部署）
1. 保持 \`config.js\` 預設配置：
   \`\`\`javascript
   API_BASE_URL: '/api',
   \`\`\`
2. 只需啟動後端服務器
3. 訪問 \`http://localhost:5000\`
`
      }
    ]
  },

  /**
   * 規則 7：生成時的驗證檢查
   */
  VALIDATION_RULES: [
    {
      check: 'hasConfigFile',
      description: '必須生成 config.js 文件',
      required: true
    },
    {
      check: 'usesWindowAppConfig',
      description: 'JavaScript 必須使用 window.APP_CONFIG',
      required: true
    },
    {
      check: 'noHardcodedUrls',
      description: '不能有硬編碼的 localhost URL',
      required: true
    },
    {
      check: 'backendHasStaticRoutes',
      description: '後端必須提供靜態文件路由',
      required: true
    },
    {
      check: 'htmlLoadsConfigFirst',
      description: 'HTML 必須先載入 config.js',
      required: true
    }
  ]
};
