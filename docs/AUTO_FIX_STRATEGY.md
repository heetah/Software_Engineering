# 自動修復前後端整合問題 - 無需 Payload 配置

## 概述

通過改進 Worker Agents 的**默認 prompt 模板**和**後處理邏輯**，可以自動解決常見的前後端整合問題，用戶無需在每個 payload 中指定詳細的 contracts。

---

## 當前問題 vs 自動化解決方案

| 問題 | 當前需要 | 自動化方案 | 實施位置 |
|------|---------|-----------|---------|
| HTML 缺少 config.js | Payload 中指定 | 自動檢測並注入 | `markup-agent/generator.js` |
| Flask 無靜態服務 | Payload 中要求 | 默認模板強制包含 | `python-agent/generator.js` |
| DOM ID 不匹配 | 定義 DOM contracts | 自動提取並統一 | `coordinator.js` + Post-processor |
| 過濾器傳 "all" | JS requirements | 默認過濾邏輯 | `script-agent/generator.js` |
| Modal class 不匹配 | CSS/JS requirements | 標準化命名規範 | `style-agent` + `script-agent` |

---

## 解決方案 1: 增強 Worker Agents 的默認 Prompt

### 1.1 Markup Agent (HTML) - 自動注入 config.js

**修改位置**: `worker-agents/markup-agent/generator.js`

**改進的 buildPrompt 方法**:

```javascript
buildPrompt({ skeleton, fileSpec, context }) {
  const { path: filePath, description, requirements = [] } = fileSpec;
  const allFiles = context.allFiles || [];
  
  let prompt = `Generate HTML for: ${filePath}\n\n`;
  
  if (description) {
    prompt += `Description: ${description}\n\n`;
  }
  
  // ========== 新增：自動檢測並要求載入 config.js ==========
  const hasConfigJs = allFiles.some(f => f.path === 'config.js' || f.path.endsWith('/config.js'));
  const hasAppJs = allFiles.some(f => f.path.endsWith('app.js') || f.path.includes('.js'));
  
  if (hasConfigJs && hasAppJs) {
    prompt += `🔴 CRITICAL REQUIREMENT - SCRIPT LOADING ORDER:\n`;
    prompt += `The HTML MUST load scripts in this EXACT order in <head>:\n`;
    prompt += `1. <script src="config.js"></script>  <!-- FIRST: Configuration -->\n`;
    prompt += `2. <script src="app.js" defer></script>  <!-- SECOND: Application logic -->\n`;
    prompt += `This order is MANDATORY because app.js depends on window.APP_CONFIG from config.js.\n`;
    prompt += `If you violate this order, the application WILL FAIL.\n\n`;
  }
  // ========================================================
  
  // 繼續原有邏輯...
  if (requirements.length > 0) {
    prompt += `Requirements:\n${requirements.map(r => `- ${r}`).join('\n')}\n\n`;
  }
  
  // ========== 新增：DOM 元素命名規範 ==========
  prompt += `🔴 DOM ELEMENT NAMING STANDARDS:\n`;
  prompt += `1. Form IDs: Use full descriptive names (e.g., 'add-expense-form', NOT 'form')\n`;
  prompt += `2. Input IDs: Prefix with context (e.g., 'expense-amount', 'edit-expense-amount')\n`;
  prompt += `3. Modal IDs: Use pattern '<feature>-modal' (e.g., 'edit-expense-modal')\n`;
  prompt += `4. Modal form fields: Prefix with context (e.g., 'edit-expense-description')\n`;
  prompt += `5. Filter dropdowns: If value 'all' means no filter, include it as default option\n`;
  prompt += `6. Container IDs: Use '-body' or '-container' suffix (e.g., 'expense-table-body')\n\n`;
  // =========================================
  
  if (skeleton) {
    prompt += `Skeleton:\n\`\`\`html\n${skeleton}\n\`\`\`\n\n`;
  }
  
  // 繼續原有的 CSS/JS 檔案檢測...
  if (allFiles.length > 0) {
    const cssFiles = allFiles.filter(f => f.path.endsWith('.css'));
    const jsFiles = allFiles.filter(f => f.path.endsWith('.js'));
    
    if (cssFiles.length > 0) {
      prompt += `CSS files to link: ${cssFiles.map(f => f.path).join(', ')}\n`;
    }
    if (jsFiles.length > 0) {
      prompt += `JS files to load: ${jsFiles.map(f => f.path).join(', ')}\n`;
    }
    prompt += `\n`;
  }
  
  prompt += `Generate complete HTML with:\n`;
  prompt += `- Proper <head> section with correct script loading order\n`;
  prompt += `- Semantic HTML5 (header, main, section, form, table)\n`;
  prompt += `- Accessibility attributes (aria-*, labels)\n`;
  prompt += `- Consistent ID naming following the standards above\n`;
  prompt += `- All interactive elements with data-* attributes\n\n`;
  
  prompt += `Return ONLY the HTML code, no markdown.`;
  
  return prompt;
}
```

---

### 1.2 Script Agent (JavaScript) - 自動處理配置和過濾器

**修改位置**: `worker-agents/script-agent/generator.js`

**改進的 buildPrompt 方法**:

```javascript
buildPrompt({ skeleton, fileSpec, context }) {
  const { path: filePath, description, requirements = [] } = fileSpec;
  const allFiles = context.allFiles || [];
  
  let prompt = `Generate JavaScript for: ${filePath}\n\n`;
  
  if (description) {
    prompt += `Description: ${description}\n\n`;
  }
  
  // ========== 新增：強制使用 window.APP_CONFIG ==========
  const hasConfigJs = allFiles.some(f => f.path === 'config.js' || f.path.endsWith('/config.js'));
  
  if (hasConfigJs) {
    prompt += `🔴 MANDATORY: API CONFIGURATION PATTERN\n`;
    prompt += `You MUST read API base URL from window.APP_CONFIG:\n\n`;
    prompt += `const API_ROOT = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) \n`;
    prompt += `  ? window.APP_CONFIG.API_BASE_URL \n`;
    prompt += `  : '/api';  // Fallback\n\n`;
    prompt += `const API_BASE_URL = API_ROOT + '/specific-resource';  // e.g., '/expenses'\n\n`;
    prompt += `❌ FORBIDDEN: Do NOT hardcode URLs like 'http://localhost:3000'\n`;
    prompt += `❌ FORBIDDEN: Do NOT use fetch('http://...')  directly\n\n`;
  }
  // ====================================================
  
  // ========== 新增：過濾器處理規範 ==========
  const hasFilterDropdown = skeleton && skeleton.includes('option value="all"');
  
  if (hasFilterDropdown || description.toLowerCase().includes('filter')) {
    prompt += `🔴 FILTER HANDLING STANDARD:\n`;
    prompt += `When building filter query parameters:\n`;
    prompt += `1. Check if value is meaningful before adding to query\n`;
    prompt += `2. Skip empty strings, null, undefined\n`;
    prompt += `3. Skip "all" or "none" sentinel values\n\n`;
    prompt += `Example:\n`;
    prompt += `const filters = {};\n`;
    prompt += `if (categoryFilter.value && categoryFilter.value !== 'all') {\n`;
    prompt += `  filters.category = categoryFilter.value;\n`;
    prompt += `}\n`;
    prompt += `if (startDateFilter.value) {\n`;
    prompt += `  filters.startDate = startDateFilter.value;\n`;
    prompt += `}\n`;
    prompt += `// Then: const expenses = await fetchExpenses(filters);\n\n`;
  }
  // ======================================
  
  // ========== 新增：DOM 查詢防禦性編程 ==========
  prompt += `🔴 DOM ELEMENT ACCESS STANDARD:\n`;
  prompt += `ALWAYS add null checks after querySelector:\n\n`;
  prompt += `const element = document.getElementById('some-id');\n`;
  prompt += `if (!element) {\n`;
  prompt += `  console.error('Required element #some-id not found');\n`;
  prompt += `  return;  // or handle gracefully\n`;
  prompt += `}\n\n`;
  // ========================================
  
  // ========== 新增：Modal 顯示規範 ==========
  const hasModal = skeleton && skeleton.includes('modal');
  
  if (hasModal || description.toLowerCase().includes('modal')) {
    prompt += `🔴 MODAL DISPLAY STANDARD:\n`;
    prompt += `Use consistent class and attribute toggling:\n\n`;
    prompt += `function openModal(modalElement) {\n`;
    prompt += `  modalElement.classList.add('is-active');\n`;
    prompt += `  modalElement.removeAttribute('hidden');\n`;
    prompt += `}\n\n`;
    prompt += `function closeModal(modalElement) {\n`;
    prompt += `  modalElement.classList.remove('is-active');\n`;
    prompt += `  modalElement.setAttribute('hidden', '');\n`;
    prompt += `}\n\n`;
    prompt += `CSS should use: #modal.is-active { display: flex; }\n\n`;
  }
  // ======================================
  
  if (requirements.length > 0) {
    prompt += `Additional Requirements:\n${requirements.map(r => `- ${r}`).join('\n')}\n\n`;
  }
  
  if (skeleton) {
    prompt += `Skeleton:\n\`\`\`javascript\n${skeleton}\n\`\`\`\n\n`;
  }
  
  prompt += `Generate clean, modern JavaScript with:\n`;
  prompt += `- Proper error handling and null checks\n`;
  prompt += `- DOMContentLoaded event listener\n`;
  prompt += `- JSDoc comments for functions\n`;
  prompt += `- Following all standards above\n\n`;
  
  prompt += `Return ONLY the JavaScript code, no markdown.`;
  
  return prompt;
}
```

---

### 1.3 Python Agent (Flask) - 自動包含靜態服務

**修改位置**: `worker-agents/python-agent/generator.js`

**改進的 buildPrompt 方法**:

```javascript
buildPrompt({ skeleton, fileSpec, context }) {
  const { path: filePath, description, requirements = [] } = fileSpec;
  const language = this.detectLanguage(filePath);
  const allFiles = context.allFiles || [];
  
  let prompt = `Generate Python code for: ${filePath}\n\n`;
  
  if (description) {
    prompt += `Description: ${description}\n\n`;
  }
  
  // ========== 新增：Flask 自動配置靜態服務 ==========
  const isFlaskApp = description.toLowerCase().includes('flask') || 
                     skeleton && skeleton.includes('Flask(');
  const hasFrontendFiles = allFiles.some(f => 
    f.path.endsWith('.html') || f.path.endsWith('.js') || f.path.endsWith('.css')
  );
  
  if (isFlaskApp && hasFrontendFiles) {
    prompt += `🔴 MANDATORY: FLASK STATIC FILE CONFIGURATION\n`;
    prompt += `This Flask app MUST serve frontend files. You MUST include:\n\n`;
    prompt += `1. Imports:\n`;
    prompt += `   from flask import Flask, send_from_directory\n`;
    prompt += `   import os\n\n`;
    prompt += `2. Flask initialization:\n`;
    prompt += `   app = Flask(__name__, static_folder='.', static_url_path='')\n\n`;
    prompt += `3. Root route (serve index.html):\n`;
    prompt += `   @app.route('/')\n`;
    prompt += `   def index():\n`;
    prompt += `       return send_from_directory('.', 'index.html')\n\n`;
    prompt += `4. Use PORT environment variable:\n`;
    prompt += `   if __name__ == '__main__':\n`;
    prompt += `       port = int(os.environ.get('PORT', '3000'))\n`;
    prompt += `       app.run(debug=True, port=port)\n\n`;
    prompt += `This configuration allows Flask to serve both API and frontend on the same port.\n\n`;
  }
  // =================================================
  
  if (requirements.length > 0) {
    prompt += `Requirements:\n${requirements.map(r => `- ${r}`).join('\n')}\n\n`;
  }
  
  // ========== 新增：API 路由規範 ==========
  if (isFlaskApp) {
    prompt += `🔴 API ROUTING STANDARD:\n`;
    prompt += `1. All API endpoints MUST use /api prefix (e.g., /api/expenses)\n`;
    prompt += `2. Return JSON with proper status codes (200, 201, 400, 404, 500)\n`;
    prompt += `3. Add error handlers for 404, 400, 500:\n`;
    prompt += `   @app.errorhandler(404)\n`;
    prompt += `   def not_found(error):\n`;
    prompt += `       return jsonify({"error": "Not Found"}), 404\n\n`;
  }
  // =====================================
  
  if (skeleton) {
    prompt += `Skeleton:\n\`\`\`python\n${skeleton}\n\`\`\`\n\n`;
  }
  
  prompt += `Generate production-ready Python code with:\n`;
  prompt += `- Proper imports\n`;
  prompt += `- Type hints where appropriate\n`;
  prompt += `- Docstrings for functions\n`;
  prompt += `- Error handling\n`;
  prompt += `- Following all standards above\n\n`;
  
  prompt += `Return ONLY the Python code, no markdown.`;
  
  return prompt;
}
```

---

### 1.4 Style Agent (CSS) - Modal 顯示規範

**修改位置**: `worker-agents/style-agent/generator.js`

**改進的 buildPrompt 方法**:

```javascript
buildPrompt({ skeleton, fileSpec, context }) {
  const { path: filePath, description, requirements = [] } = fileSpec;
  const allFiles = context.allFiles || [];
  
  let prompt = `Generate CSS for: ${filePath}\n\n`;
  
  if (description) {
    prompt += `Description: ${description}\n\n`;
  }
  
  // ========== 新增：Modal 樣式規範 ==========
  const hasModal = allFiles.some(f => 
    f.description && f.description.toLowerCase().includes('modal')
  );
  
  if (hasModal || description.toLowerCase().includes('modal')) {
    prompt += `🔴 MODAL STYLING STANDARD:\n`;
    prompt += `For modal elements, use this pattern:\n\n`;
    prompt += `#modal-id {\n`;
    prompt += `  display: none;  /* Hidden by default */\n`;
    prompt += `  position: fixed;\n`;
    prompt += `  z-index: 1000;\n`;
    prompt += `  /* ... other fixed overlay styles */\n`;
    prompt += `}\n\n`;
    prompt += `#modal-id.is-active {\n`;
    prompt += `  display: flex;  /* Show when active */\n`;
    prompt += `}\n\n`;
    prompt += `JavaScript will toggle the 'is-active' class to show/hide.\n\n`;
  }
  // ======================================
  
  if (requirements.length > 0) {
    prompt += `Requirements:\n${requirements.map(r => `- ${r}`).join('\n')}\n\n`;
  }
  
  if (skeleton) {
    prompt += `Skeleton:\n\`\`\`css\n${skeleton}\n\`\`\`\n\n`;
  }
  
  prompt += `Generate modern, responsive CSS with:\n`;
  prompt += `- CSS variables for theme colors\n`;
  prompt += `- Mobile-first responsive design\n`;
  prompt += `- Smooth transitions\n`;
  prompt += `- Accessibility (focus states, contrast)\n`;
  prompt += `- Following all standards above\n\n`;
  
  prompt += `Return ONLY the CSS code, no markdown.`;
  
  return prompt;
}
```

---

## 解決方案 2: 後處理器自動修復

除了改進 prompt，還可以添加**後處理邏輯**來自動檢測和修復常見問題。

### 2.1 創建 Post-Processor

**新文件**: `coder-agent/post-processor.js`

```javascript
/**
 * 代碼後處理器
 * 自動檢測並修復常見的前後端整合問題
 */

class PostProcessor {
  /**
   * 處理生成的 HTML 文件
   */
  static processHTML(content, context) {
    let modified = content;
    const { allFiles = [] } = context;
    
    // 檢查 1: 確保 config.js 在 app.js 之前載入
    const hasConfigJs = allFiles.some(f => f.path === 'config.js');
    const hasAppJs = allFiles.some(f => f.path.includes('app.js'));
    
    if (hasConfigJs && hasAppJs) {
      // 檢查是否已載入 config.js
      if (!modified.includes('src="config.js"')) {
        console.warn('[PostProcessor] HTML 缺少 config.js，自動注入...');
        
        // 在 </head> 前插入
        if (modified.includes('</head>')) {
          modified = modified.replace(
            '</head>',
            '    <script src="config.js"></script>\n</head>'
          );
        }
      }
      
      // 檢查載入順序（config.js 必須在 app.js 之前）
      const configIndex = modified.indexOf('src="config.js"');
      const appIndex = modified.indexOf('src="app.js"');
      
      if (configIndex > appIndex && appIndex !== -1) {
        console.warn('[PostProcessor] config.js 載入順序錯誤，正在修正...');
        // 重新排序 script 標籤（簡化處理）
        // 實際實作可能需要更複雜的 HTML parsing
      }
    }
    
    return {
      content: modified,
      modified: modified !== content,
      changes: ['Added config.js import']
    };
  }
  
  /**
   * 處理生成的 JavaScript 文件
   */
  static processJavaScript(content, context) {
    let modified = content;
    const changes = [];
    
    // 檢查 1: 是否使用了 window.APP_CONFIG
    if (content.includes('fetch(') && !content.includes('window.APP_CONFIG')) {
      console.warn('[PostProcessor] JS 未使用 window.APP_CONFIG，可能導致 API 調用失敗');
      changes.push('Warning: No window.APP_CONFIG usage detected');
    }
    
    // 檢查 2: 是否有 querySelector 沒有 null check
    const querySelectors = content.match(/document\.(querySelector|getElementById|getElementsByClassName)\([^)]+\)/g) || [];
    
    if (querySelectors.length > 0) {
      // 簡單檢查：是否有 if (!element) 之類的檢查
      const hasNullChecks = content.includes('if (!') || content.includes('if(!');
      
      if (!hasNullChecks) {
        console.warn('[PostProcessor] JS 缺少 DOM null checks，可能導致運行時錯誤');
        changes.push('Warning: No null checks for DOM queries');
      }
    }
    
    return {
      content: modified,
      modified: modified !== content,
      changes
    };
  }
  
  /**
   * 處理生成的 Python 文件
   */
  static processPython(content, context) {
    let modified = content;
    const changes = [];
    const { allFiles = [] } = context;
    
    // 檢查 1: Flask app 是否配置了靜態文件服務
    const isFlaskApp = content.includes('Flask(') || content.includes('from flask import');
    const hasFrontend = allFiles.some(f => f.path.endsWith('.html'));
    
    if (isFlaskApp && hasFrontend) {
      // 檢查是否有 static_folder 配置
      if (!content.includes('static_folder')) {
        console.warn('[PostProcessor] Flask 缺少 static_folder 配置，自動添加...');
        
        // 查找 Flask(...) 並替換
        modified = modified.replace(
          /app\s*=\s*Flask\(__name__\)/,
          "app = Flask(__name__, static_folder='.', static_url_path='')"
        );
        
        changes.push('Added Flask static_folder configuration');
      }
      
      // 檢查是否有根路由
      if (!content.includes('@app.route(\'/\')')) {
        console.warn('[PostProcessor] Flask 缺少根路由，自動添加...');
        
        // 在第一個 @app.route 前插入
        const firstRoute = modified.indexOf('@app.route');
        if (firstRoute !== -1) {
          const importSection = modified.indexOf('from flask import');
          
          // 確保導入了 send_from_directory
          if (!content.includes('send_from_directory')) {
            modified = modified.replace(
              'from flask import',
              'from flask import send_from_directory,'
            );
          }
          
          const rootRoute = `
@app.route('/')
def index():
    """Serve the main HTML file."""
    return send_from_directory('.', 'index.html')

`;
          modified = modified.slice(0, firstRoute) + rootRoute + modified.slice(firstRoute);
          changes.push('Added Flask root route');
        }
      }
      
      // 檢查是否使用環境變數 PORT
      if (content.includes('app.run(') && !content.includes('os.environ.get')) {
        console.warn('[PostProcessor] Flask 未使用 PORT 環境變數');
        changes.push('Warning: Not using PORT environment variable');
      }
    }
    
    return {
      content: modified,
      modified: modified !== content,
      changes
    };
  }
  
  /**
   * 主處理入口
   */
  static process(file, context) {
    const ext = file.path.split('.').pop();
    
    switch(ext) {
      case 'html':
        return this.processHTML(file.content, context);
      case 'js':
        return this.processJavaScript(file.content, context);
      case 'py':
        return this.processPython(file.content, context);
      default:
        return {
          content: file.content,
          modified: false,
          changes: []
        };
    }
  }
}

module.exports = PostProcessor;
```

### 2.2 在 Coordinator 中集成後處理器

**修改位置**: `coder-agent/coordinator.js`

```javascript
const PostProcessor = require('./post-processor');

class Coordinator {
  // ... 現有代碼 ...
  
  async generateDetailsSequentially(files, skeletons, contracts, requestId) {
    // ... 現有代碼 ...
    
    for (const layer of layers) {
      for (const fileSpec of layer) {
        // ... 現有生成邏輯 ...
        
        const result = await agent.generate(generationPayload);
        
        // ========== 新增：後處理 ==========
        const postProcessed = PostProcessor.process(
          {
            path: fileSpec.path,
            content: result.content
          },
          {
            allFiles: files,
            completedFiles: Array.from(completed.keys())
          }
        );
        
        if (postProcessed.modified) {
          console.log(`[Coordinator] Post-processed ${fileSpec.path}:`, postProcessed.changes);
          result.content = postProcessed.content;
        }
        // ==================================
        
        completed.set(fileSpec.path, {
          skeleton: skeletons.get(fileSpec.path),
          detail: result.content,
          tokensUsed: result.tokensUsed || 0,
          method: result.method || 'unknown'
        });
      }
    }
    
    return completed;
  }
}
```

---

## 解決方案 3: 配置驅動的默認行為

### 3.1 創建默認配置文件

**新文件**: `shared/generation-defaults.js`

```javascript
/**
 * 代碼生成的默認行為配置
 * 這些規則會自動應用，無需在 payload 中指定
 */

module.exports = {
  // HTML 生成默認規則
  html: {
    autoInjectConfigJs: true,  // 自動注入 config.js
    enforceScriptOrder: true,  // 強制正確的腳本載入順序
    requireAccessibility: true,  // 要求無障礙屬性
    namingConvention: 'descriptive',  // 'descriptive' | 'short'
    
    // 自動生成的 meta 標籤
    autoMetaTags: [
      '<meta charset="UTF-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
    ]
  },
  
  // JavaScript 生成默認規則
  javascript: {
    useConfigFile: true,  // 強制使用 window.APP_CONFIG
    requireNullChecks: true,  // DOM 查詢後必須檢查 null
    filterPattern: 'exclude-sentinels',  // 過濾器排除 'all', 'none' 等
    modalPattern: 'is-active-class',  // Modal 使用 .is-active class
    
    // 禁止的寫法
    forbidden: [
      'http://localhost',  // 禁止硬編碼 URL
      'process.env',  // 瀏覽器環境不可用
    ]
  },
  
  // Python/Flask 生成默認規則
  python: {
    flaskStaticServing: true,  // 自動配置靜態文件服務
    usePortEnvVar: true,  // 使用 PORT 環境變數
    defaultPort: 3000,  // 默認端口
    apiPrefix: '/api',  // API 路由前綴
    
    // 自動生成的 error handlers
    autoErrorHandlers: [404, 400, 500]
  },
  
  // CSS 生成默認規則
  css: {
    modalDisplayPattern: 'is-active',  // Modal 顯示使用 .is-active
    useVariables: true,  // 使用 CSS 變數
    mobileFirst: true,  // Mobile-first 設計
  }
};
```

### 3.2 在 Worker Agents 中使用默認配置

```javascript
const DEFAULTS = require('../../shared/generation-defaults');

class MarkupGenerator {
  buildPrompt({ skeleton, fileSpec, context }) {
    // ... 現有代碼 ...
    
    // 應用默認配置
    if (DEFAULTS.html.autoInjectConfigJs) {
      // 添加 config.js 要求到 prompt
    }
    
    if (DEFAULTS.html.enforceScriptOrder) {
      // 添加腳本順序要求到 prompt
    }
    
    // ... 其餘邏輯 ...
  }
}
```

---

## 實施優先級

### Phase 1: 立即可實施（無需修改核心邏輯）
1. ✅ 增強各 Worker Agent 的 `buildPrompt` 方法
2. ✅ 添加 `generation-defaults.js` 配置文件
3. ✅ 更新 `shared/api-standards.js` 增加更多規範

### Phase 2: 需要輕度重構
1. 🔄 創建 `post-processor.js`
2. 🔄 在 Coordinator 中集成後處理器
3. 🔄 添加日誌和警告系統

### Phase 3: 進階優化
1. 🚀 自動 DOM 合約提取（從 HTML skeleton 分析 IDs）
2. 🚀 智能依賴檢測（自動推斷哪些文件互相依賴）
3. 🚀 代碼質量評分（評估生成代碼的質量）

---

## 效果對比

### 之前（需要 Payload）

```json
{
  "path": "index.html",
  "requirements": [
    "Load config.js in <head> BEFORE app.js",
    "Use exact IDs: #expense-amount, #edit-expense-amount",
    "Include modal with id='edit-expense-modal'"
  ]
}
```

### 之後（自動處理）

```json
{
  "path": "index.html",
  "description": "Expense tracker UI with form and modal"
}
```

系統會自動：
- ✅ 注入 config.js 並確保載入順序
- ✅ 使用標準化的 ID 命名
- ✅ Modal 使用 `is-active` class
- ✅ Flask 配置靜態服務
- ✅ JavaScript 讀取 window.APP_CONFIG
- ✅ 過濾器排除 "all" 值

---

## 總結

通過以上三個解決方案的組合：

1. **增強的 Prompt 模板** → 生成時就遵守規範
2. **智能後處理器** → 自動修復常見問題
3. **配置驅動的默認行為** → 統一項目標準

可以實現**零配置**或**最小配置**的前後端整合，用戶只需提供：
- 文件名和簡單描述
- 核心業務邏輯需求

所有技術細節（配置載入、靜態服務、DOM 命名、API 模式）都由系統自動處理！
