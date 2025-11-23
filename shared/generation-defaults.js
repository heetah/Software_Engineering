/**
 * 代碼生成默認規範
 * 
 * 此文件集中定義所有 Worker Agents 使用的自動檢測規則和最佳實踐標準。
 * 各 Worker Agent 的 buildPrompt 方法應參考此配置，確保一致性。
 * 
 * 未來可擴展為動態加載配置，支持用戶自定義規則覆蓋。
 */

const GENERATION_DEFAULTS = {
  /**
   * HTML 生成規範（markup-agent）
   */
  html: {
    scriptLoading: {
      // 當檢測到 config.js 存在時，強制執行加載順序
      enforceOrder: true,
      rules: [
        'config.js MUST be loaded in <head> before any other JavaScript',
        'app.js or main.js MUST be loaded after config.js',
        'Use <script src="config.js"></script> in head section',
        'Do NOT load config.js at end of body if it defines window.APP_CONFIG'
      ]
    },
    
    domNaming: {
      // DOM 元素命名標準
      rules: [
        {
          type: 'form',
          pattern: 'full-descriptive-name',
          examples: ['add-expense-form', 'user-login-form'],
          avoid: ['form1', 'f1']
        },
        {
          type: 'input',
          pattern: 'context-prefix',
          examples: ['expense-amount', 'edit-expense-amount', 'filter-category'],
          avoid: ['amount', 'amt']
        },
        {
          type: 'modal',
          pattern: '<feature>-modal',
          examples: ['edit-expense-modal', 'confirm-delete-modal'],
          formFields: 'MUST include modal context prefix (e.g., edit-expense-description)',
          avoid: ['modal1', 'popup']
        },
        {
          type: 'filter-dropdown',
          defaultOption: 'MUST include "all" as first option',
          examples: ['<option value="all">All Categories</option>']
        },
        {
          type: 'container',
          suffix: ['-body', '-container', '-list'],
          examples: ['expenses-body', 'items-container', 'results-list']
        },
        {
          type: 'display',
          pattern: 'descriptive-purpose',
          examples: ['total-spending', 'user-count', 'error-message']
        }
      ]
    }
  },

  /**
   * JavaScript 生成規範（script-agent）
   */
  javascript: {
    apiConfiguration: {
      // 當檢測到 config.js 存在時，強制使用 window.APP_CONFIG
      enforcePattern: true,
      template: `
const API_ROOT = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) 
  ? window.APP_CONFIG.API_BASE_URL 
  : '/api';  // Fallback if config not loaded

const API_BASE_URL = API_ROOT.replace(/\\/$/, '') + '/specific-resource';
// Example: '/api/expenses', '/api/users'
      `.trim(),
      forbidden: [
        'http://localhost:3000',
        'hardcoded absolute URLs',
        'fetch("http://...")'
      ],
      correct: [
        'Use relative paths',
        'Read from window.APP_CONFIG',
        'Provide fallback value'
      ]
    },
    
    filterHandling: {
      // 當檢測到過濾器時，自動添加處理邏輯
      enforceSentinelSkip: true,
      sentinelValues: ['all', 'none', 'any', '', null, undefined],
      template: `
const filters = {};
if (categoryFilter.value && categoryFilter.value !== 'all') {
  filters.category = categoryFilter.value;
}
if (startDateFilter.value) {  // Skip empty strings
  filters.startDate = startDateFilter.value;
}
// Then pass to API: fetchData(filters)
      `.trim()
    },
    
    domQuery: {
      // 總是強制執行空值檢查
      enforceNullChecks: true,
      template: `
const element = document.getElementById('some-id');
if (!element) {
  console.error('Required element #some-id not found');
  return;  // or handle gracefully
}
// Now safe to use element
      `.trim()
    },
    
    modalDisplay: {
      // 當檢測到 modal 時，強制使用 .is-active 模式
      enforceIsActiveClass: true,
      openTemplate: `
function openModal(modalElement) {
  modalElement.classList.add('is-active');
  modalElement.removeAttribute('hidden');
}
      `.trim(),
      closeTemplate: `
function closeModal(modalElement) {
  modalElement.classList.remove('is-active');
  modalElement.setAttribute('hidden', '');
}
      `.trim(),
      cssRequirement: '#modal-id.is-active { display: flex; }'
    }
  },

  /**
   * Python/Flask 生成規範（python-agent）
   */
  python: {
    flaskStaticServing: {
      // 當檢測到 Flask + 前端文件時，自動配置靜態文件服務
      autoDetect: true,
      triggers: {
        isFlask: ['flask', 'Flask('],
        hasFrontend: ['.html', '.js', '.css']
      },
      requirements: [
        {
          step: 1,
          description: 'Initialize Flask with static folder',
          code: `
from flask import Flask, send_from_directory
app = Flask(__name__, static_folder='.', static_url_path='')
          `.trim()
        },
        {
          step: 2,
          description: 'Add root route to serve index.html',
          code: `
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')
          `.trim()
        },
        {
          step: 3,
          description: 'Use PORT environment variable',
          code: `
import os
if __name__ == '__main__':
    port = int(os.environ.get('PORT', '3000'))
    app.run(host='0.0.0.0', port=port, debug=True)
          `.trim()
        },
        {
          step: 4,
          description: 'API routes MUST use /api prefix',
          example: "@app.route('/api/resource', methods=['GET'])"
        }
      ],
      forbidden: [
        'Hardcoding port 5000 or 5001',
        'Omitting static_folder configuration',
        'Forgetting root route for index.html',
        'API routes without /api prefix'
      ]
    }
  },

  /**
   * CSS 生成規範（style-agent）
   */
  css: {
    modalStyling: {
      // 當檢測到 modal 時，強制使用 .is-active 模式
      enforceIsActiveClass: true,
      baseState: `
#modal-id {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: 1000;
}
      `.trim(),
      activeState: `
#modal-id.is-active {
    display: flex;
    align-items: center;
    justify-content: center;
}
      `.trim(),
      contentContainer: `
.modal-content {
    background: white;
    padding: 2rem;
    border-radius: 8px;
    max-width: 500px;
    width: 90%;
}
      `.trim(),
      forbidden: [
        '.modal--visible or .show class names',
        'display: block for active state (use flex instead)'
      ],
      required: 'MUST use .is-active class (JavaScript toggles this)'
    }
  },

  /**
   * 通用檢測規則
   */
  detection: {
    // 如何檢測項目中是否存在特定文件或模式
    hasConfigJs: (allFiles) => allFiles.some(f => 
      f.path === 'config.js' || f.path.endsWith('/config.js')
    ),
    
    hasAppJs: (allFiles) => allFiles.some(f => 
      f.path.endsWith('app.js') || f.path.includes('.js')
    ),
    
    hasModal: (skeleton, description, allFiles) => {
      const inSkeleton = skeleton && skeleton.toLowerCase().includes('modal');
      const inDescription = description && description.toLowerCase().includes('modal');
      const inFiles = allFiles.some(f => 
        (f.description && f.description.toLowerCase().includes('modal')) ||
        f.path.toLowerCase().includes('modal')
      );
      return inSkeleton || inDescription || inFiles;
    },
    
    hasFilter: (skeleton, description) => {
      const inSkeleton = skeleton && skeleton.includes('option value="all"');
      const inDescription = description && description.toLowerCase().includes('filter');
      return inSkeleton || inDescription;
    },
    
    isFlaskProject: (description) => 
      description && description.toLowerCase().includes('flask'),
    
    hasFrontendFiles: (allFiles) => allFiles.some(f => 
      f.path.endsWith('.html') || f.path.endsWith('.js') || f.path.endsWith('.css')
    )
  },

  /**
   * 優先級指南
   * 
   * 當規範發生衝突時，按此優先級解決：
   * 1. Contracts（如果用戶提供了明確的 contracts，絕對遵守）
   * 2. Auto-detection defaults（本文件定義的自動檢測規則）
   * 3. Agent fallback defaults（Agent 內建的後備默認值）
   */
  priorityGuide: {
    contractsFirst: 'Explicit contracts in payload override all defaults',
    autoDetectionSecond: 'Auto-detection rules apply when no contracts provided',
    agentFallbackLast: 'Agent built-in defaults used only when no detection matches'
  }
};

module.exports = GENERATION_DEFAULTS;
