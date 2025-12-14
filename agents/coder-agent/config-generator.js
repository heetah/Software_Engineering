/**
 * Configuration File Generator
 * 自動從 projectConfig 生成 config.js 和 config.py
 */

const API_STANDARDS = require('../shared/api-standards.cjs');

class ConfigGenerator {
  /**
   * 生成前端配置文件 (config.js) - 使用標準規範
   */
  static generateFrontendConfig(projectConfig) {
    // 永遠生成配置文件（使用標準規範）
    return API_STANDARDS.REQUIRED_CONFIG_FILE.content;
  }

  /**
   * 生成後端配置文件 (config.py)
   */
  static generateBackendConfig(projectConfig) {
    if (!projectConfig || !projectConfig.backend) {
      return null;
    }

    const { host, port, protocol, enableCORS, corsOrigins } = projectConfig.backend;
    const database = projectConfig.database || {};
    const testAccounts = projectConfig.testAccounts || [];

    return `"""
Auto-generated Configuration File
DO NOT EDIT MANUALLY - Generated from architect payload

This file provides centralized configuration for backend code.
All Flask apps MUST import configuration from this file.
"""

# ===== Server Configuration =====
HOST = "${host}"
PORT = ${port}
DEBUG = True  # Set to False in production

# ===== CORS Configuration =====
ENABLE_CORS = ${enableCORS ? 'True' : 'False'}
CORS_ORIGINS = ${JSON.stringify(corsOrigins || ['*'])}

def get_cors_config():
    """
    Get Flask-CORS configuration dictionary.
    Usage:
        from flask_cors import CORS
        from config import get_cors_config
        
        app = Flask(__name__)
        CORS(app, **get_cors_config())
    """
    if not ENABLE_CORS:
        return {}
    
    return {
        'resources': {
            r'/api/*': {
                'origins': CORS_ORIGINS,
                'methods': ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
                'allow_headers': ['Content-Type', 'Authorization'],
                'supports_credentials': True
            }
        }
    }

# ===== Database Configuration =====
DATABASE_TYPE = "${database.type || 'sqlite'}"
DATABASE_FILE = "${database.file || 'app.db'}"

def get_database_uri():
    """Get SQLAlchemy database URI"""
    if DATABASE_TYPE == 'sqlite':
        return f'sqlite:///{DATABASE_FILE}'
    # Add other database types as needed
    return None

# ===== Test Data (Development Only) =====
# WARNING: Never use hardcoded credentials in production!
TEST_ACCOUNTS = ${JSON.stringify(testAccounts, null, 4)}

def validate_test_account(username, password):
    """
    Validate against test accounts (for development/demo only)
    
    Usage:
        from config import validate_test_account
        
        user = validate_test_account(username, password)
        if user:
            # Authentication successful
            return jsonify({"token": generate_token(user)})
        else:
            # Invalid credentials
            return jsonify({"error": "Invalid credentials"}), 401
    """
    for account in TEST_ACCOUNTS:
        if account['username'] == username and account['password'] == password:
            return account
    return None

# ===== Helper Functions =====
def get_server_url():
    """Get full server URL"""
    return f"${protocol}://{host}:{port}"

def is_production():
    """Check if running in production mode"""
    return not DEBUG
`;
  }

  /**
   * 檢查是否需要生成配置文件
   */
  static needsConfigGeneration(coderInstructions) {
    return !!(coderInstructions.projectConfig && coderInstructions.projectConfig.backend);
  }

  /**
   * 生成所有需要的配置文件
   * @returns {Array} 配置文件列表 [{path, content, type}, ...]
   */
  static generateAll(coderInstructions) {
    const projectConfig = coderInstructions.projectConfig;
    const configFiles = [];

    // 檢查是否有 JavaScript/TypeScript 文件
    const hasJsFiles = coderInstructions.files.some(f =>
      f.type === 'javascript' || f.type === 'typescript' || f.path.endsWith('.js') || f.path.endsWith('.ts')
    );

    // 檢查是否有後端伺服器文件（Express, Node.js 等）
    const hasBackendServer = coderInstructions.files.some(f => {
      const path = f.path || '';
      const content = f.template || f.content || '';

      // Ensure content is a string
      const contentStr = typeof content === 'string' ? content : String(content);

      return (
        path.includes('server.js') ||
        (path.includes('index.js') && !path.includes('public/')) ||
        contentStr.includes('express') ||
        contentStr.includes('app.listen') ||
        contentStr.includes("require('express')")
      );
    });

    // 如果有 JS 文件，生成 config.js
    if (hasJsFiles) {
      // 判斷是前端還是後端配置
      if (hasBackendServer) {
        // 後端配置：生成 Node.js 模組格式
        configFiles.push({
          path: 'config.js',
          content: `/**
 * 運行時配置文件
 * 部署時修改此文件以切換環境
 */
module.exports = {
  port: process.env.PORT || 3000,
  host: process.env.HOST || 'localhost',
  environment: process.env.NODE_ENV || 'development',
  
  // API 配置
  api: {
    baseUrl: process.env.API_BASE_URL || '/api',
    timeout: 30000
  },
  
  // 靜態文件配置
  static: {
    directory: 'public',
    maxAge: 86400000 // 1 day
  }
};`,
          type: 'javascript',
          description: 'Backend runtime configuration file',
          isAutoGenerated: true
        });
      } else {
        // 前端配置：使用標準規範
        const frontendConfig = this.generateFrontendConfig(projectConfig);
        configFiles.push({
          path: 'config.js',
          content: frontendConfig,
          type: 'javascript',
          description: 'Runtime configuration file (modify for environment switching)',
          isAutoGenerated: true,
          mustLoadFirst: true  // HTML 必須先載入這個檔案
        });
      }
    }

    // 檢查是否有 Python 文件 → 生成 config.py
    const hasPythonFiles = coderInstructions.files.some(f =>
      f.type === 'python' || f.path.endsWith('.py')
    );

    if (hasPythonFiles && projectConfig && projectConfig.backend) {
      const backendConfig = this.generateBackendConfig(projectConfig);
      if (backendConfig) {
        configFiles.push({
          path: 'config.py',
          content: backendConfig,
          type: 'python',
          description: 'Auto-generated backend configuration file',
          isAutoGenerated: true
        });
      }
    }

    return configFiles;
  }
}

module.exports = ConfigGenerator;
