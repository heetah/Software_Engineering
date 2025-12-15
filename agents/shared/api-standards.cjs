/**
 * API 生成強制規範 (CommonJS version)
 * 這個文件定義了所有 API 相關代碼的生成規則
 * 目的：確保前後端端口一致，避免 CORS 和配置錯誤
 */

module.exports = {
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
      error: 'It is forbidden to hardcode the complete URL in fetch！Please use API_BASE_URL variable',
      example: 'const API_BASE_URL = window.APP_CONFIG.API_BASE_URL;'
    },
    {
      pattern: /process\.env\.(REACT_APP_|VUE_APP_|VITE_)/,
      error: 'Browser cannot use process.env！Please use window.APP_CONFIG',
      example: 'const API_URL = window.APP_CONFIG.API_BASE_URL;'
    },
    {
      pattern: /import\.meta\.env\./,
      error: 'import.meta.env needs build tool support。Simple projects please use window.APP_CONFIG',
      example: 'const API_URL = window.APP_CONFIG.API_BASE_URL;'
    }
  ],

  /**
   * 規則 3：必須生成的配置文件
   */
  REQUIRED_CONFIG_FILE: {
    filename: 'config.js',
    content: `/**
 * Runtime configuration file
 * Modify this file when deploying to switch environments
 */
window.APP_CONFIG = {
  // Production environment (default): use relative path
  API_BASE_URL: '/api',
  
  // Development environment (when frontend and backend are separated): uncomment the following line
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
 * Read API base URL from config file
 * Do not modify this variable directly, instead modify config.js
 */
const API_BASE_URL = window.APP_CONFIG?.API_BASE_URL || '/api';

// Safety check: ensure config is loaded
if (!window.APP_CONFIG) {
  console.error(' Error: config.js not loaded! Please include config.js in HTML first');
}
`,

  /**
   * 規則 5：後端必須提供的路由
   */
  BACKEND_REQUIREMENTS: {
    staticFileRoutes: {
      flask: `
# === Static file service (must) ===
from flask import send_from_directory
import os

@app.route('/')
def index():
    """Provide index.html"""
    return send_from_directory(os.path.dirname(__file__), 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    """Provide CSS, JS, etc."""
    return send_from_directory(os.path.dirname(__file__), filename)
`,
      express: `
// === Static file service (must) ===
const express = require('express');
const path = require('path');

app.use(express.static(__dirname));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
`
    },

    apiPrefix: '/api',
    note: 'All API routes must start with /api, static file routes must be able to access all HTML/CSS/JS'
  },

  /**
   * 規則 6：README 必須包含的說明
   */
  README_REQUIREMENTS: {
    sections: [
      {
        title: '## Environment Switching',
        content: `
### Development Environment (Separate Frontend and Backend)
1. Modify \`config.js\`：
   \`\`\`javascript
   API_BASE_URL: 'http://localhost:5000/api',
   \`\`\`
2. Start both frontend and backend servers

### Production Environment (Monolithic Deployment)
1. Keep \`config.js\` default configuration：
   \`\`\`javascript
   API_BASE_URL: '/api',
   \`\`\`
2. Start only backend server
3. Visit \`http://localhost:5000\`
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
      description: 'Must generate config.js file',
      required: true
    },
    {
      check: 'usesWindowAppConfig',
      description: 'JavaScript must use window.APP_CONFIG',
      required: true
    },
    {
      check: 'noHardcodedUrls',
      description: 'Cannot have hardcoded localhost URL',
      required: true
    },
    {
      check: 'backendHasStaticRoutes',
      description: 'Backend must provide static file routes',
      required: true
    },
    {
      check: 'htmlLoadsConfigFirst',
      description: 'HTML must load config.js first',
      required: true
    }
  ]
};

