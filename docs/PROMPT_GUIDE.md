# 如何編寫 Prompt 生成前後端整合項目

## 目錄
1. [基本結構](#基本結構)
2. [解決 HTML/JS 依賴問題](#解決-htmljs-依賴問題)
3. [Flask 靜態文件服務配置](#flask-靜態文件服務配置)
4. [完整示例](#完整示例)
5. [常見問題修復](#常見問題修復)

---

## 基本結構

### Architect Payload 格式

```json
{
  "project_name": "expense-tracker",
  "coder_instructions": {
    "files": [...],
    "requirements": [...],
    "contracts": {...}
  }
}
```

---

## 解決 HTML/JS 依賴問題

### 問題根源

生成的項目常見三大問題：
1. **HTML 缺少 config.js 載入** → API 配置未定義
2. **JS 使用的 DOM ID 與 HTML 不匹配** → querySelector 失敗
3. **Flask 未配置靜態文件服務** → 前端無法訪問

### 解決方案：使用 Contracts

在 `coder_instructions` 中定義 **contracts**，明確規範前後端的接口：

```json
{
  "coder_instructions": {
    "files": [
      {
        "path": "index.html",
        "description": "Frontend HTML with expense tracker UI",
        "requirements": [
          "Must load config.js in <head> section BEFORE app.js",
          "Must include all DOM elements specified in contracts",
          "Use semantic HTML5 with accessibility attributes"
        ]
      },
      {
        "path": "app.js",
        "description": "Frontend JavaScript for expense tracking",
        "requirements": [
          "Read API_BASE_URL from window.APP_CONFIG",
          "Use exact DOM selectors from contracts",
          "Add null checks for all querySelector calls"
        ]
      },
      {
        "path": "config.js",
        "description": "Runtime configuration file",
        "requirements": [
          "Export window.APP_CONFIG object",
          "Provide API_BASE_URL with development/production options",
          "Include comments for easy configuration"
        ]
      },
      {
        "path": "server.py",
        "description": "Flask backend with API and static file serving",
        "requirements": [
          "Configure Flask with static_folder='.' and static_url_path=''",
          "Add @app.route('/') to serve index.html",
          "Import send_from_directory from flask",
          "Use PORT environment variable (default 3000)",
          "Implement all API endpoints from contracts"
        ]
      }
    ],
    "contracts": {
      "dom": [...],
      "api": [...],
      "config": [...]
    }
  }
}
```

---

## 關鍵 Contracts 定義

### 1. DOM Contracts（解決 HTML/JS ID 不匹配）

```json
"contracts": {
  "dom": [
    {
      "description": "Expense form elements",
      "producers": ["index.html"],
      "consumers": ["app.js"],
      "requiredElements": [
        {
          "selector": "#add-expense-form",
          "element": "form",
          "purpose": "Main form for adding expenses",
          "attributes": {
            "data-form": "add-expense"
          }
        },
        {
          "selector": "#expense-description",
          "element": "input",
          "purpose": "Expense description input",
          "attributes": {
            "type": "text",
            "name": "description",
            "required": true
          }
        },
        {
          "selector": "#expense-amount",
          "element": "input",
          "purpose": "Expense amount input",
          "attributes": {
            "type": "number",
            "name": "amount",
            "step": "0.01",
            "min": "0.01",
            "required": true
          }
        },
        {
          "selector": "#expense-category",
          "element": "select",
          "purpose": "Expense category dropdown",
          "attributes": {
            "name": "category",
            "required": true
          }
        },
        {
          "selector": "#expense-date",
          "element": "input",
          "purpose": "Expense date picker",
          "attributes": {
            "type": "date",
            "name": "date",
            "required": true
          }
        },
        {
          "selector": "#expense-table-body",
          "element": "tbody",
          "purpose": "Container for expense rows"
        },
        {
          "selector": "#total-spending",
          "element": "p",
          "purpose": "Display total spending amount"
        },
        {
          "selector": "#category-filter",
          "element": "select",
          "purpose": "Filter expenses by category",
          "attributes": {
            "name": "category"
          }
        }
      ]
    },
    {
      "description": "Edit expense modal",
      "producers": ["index.html"],
      "consumers": ["app.js"],
      "requiredElements": [
        {
          "selector": "#edit-expense-modal",
          "element": "div",
          "purpose": "Modal container for editing expenses",
          "attributes": {
            "class": "modal",
            "hidden": true
          }
        },
        {
          "selector": "#edit-expense-form",
          "element": "form",
          "purpose": "Form inside edit modal"
        },
        {
          "selector": "#edit-expense-description",
          "element": "input",
          "purpose": "Edit description field"
        },
        {
          "selector": "#edit-expense-amount",
          "element": "input",
          "purpose": "Edit amount field"
        },
        {
          "selector": "#edit-expense-category",
          "element": "select",
          "purpose": "Edit category dropdown"
        },
        {
          "selector": "#edit-expense-date",
          "element": "input",
          "purpose": "Edit date field"
        },
        {
          "selector": "#modal-close-btn",
          "element": "button",
          "purpose": "Close modal button"
        }
      ]
    }
  ]
}
```

### 2. API Contracts（統一前後端 API）

```json
"api": [
  {
    "endpoint": "GET /api/expenses",
    "description": "Get all expenses with optional filters",
    "producers": ["server.py"],
    "consumers": ["app.js"],
    "request": {
      "query": {
        "category": "string (optional)",
        "startDate": "string YYYY-MM-DD (optional)",
        "endDate": "string YYYY-MM-DD (optional)"
      }
    },
    "response": {
      "200": {
        "body": [
          {
            "id": "number",
            "description": "string",
            "amount": "number",
            "category": "string",
            "date": "string YYYY-MM-DD"
          }
        ]
      }
    }
  },
  {
    "endpoint": "POST /api/expenses",
    "description": "Create a new expense",
    "producers": ["server.py"],
    "consumers": ["app.js"],
    "request": {
      "body": {
        "description": "string (required)",
        "amount": "number (required)",
        "category": "string (required)",
        "date": "string YYYY-MM-DD (required)"
      }
    },
    "response": {
      "201": {
        "body": {
          "id": "number",
          "description": "string",
          "amount": "number",
          "category": "string",
          "date": "string"
        }
      }
    }
  },
  {
    "endpoint": "PUT /api/expenses/<id>",
    "description": "Update an existing expense",
    "producers": ["server.py"],
    "consumers": ["app.js"],
    "request": {
      "body": {
        "description": "string (optional)",
        "amount": "number (optional)",
        "category": "string (optional)",
        "date": "string (optional)"
      }
    },
    "response": {
      "200": {
        "body": {
          "id": "number",
          "description": "string",
          "amount": "number",
          "category": "string",
          "date": "string"
        }
      },
      "404": {
        "body": {
          "error": "string"
        }
      }
    }
  },
  {
    "endpoint": "DELETE /api/expenses/<id>",
    "description": "Delete an expense",
    "producers": ["server.py"],
    "consumers": ["app.js"],
    "response": {
      "200": {
        "body": {
          "message": "string"
        }
      },
      "404": {
        "body": {
          "error": "string"
        }
      }
    }
  }
]
```

### 3. Config Contracts（配置文件規範）

```json
"config": [
  {
    "file": "config.js",
    "description": "Frontend runtime configuration",
    "producers": ["config.js"],
    "consumers": ["app.js"],
    "exports": {
      "window.APP_CONFIG": {
        "API_BASE_URL": "string - Backend API base URL (e.g., '/api' or 'http://localhost:5001/api')",
        "ENVIRONMENT": "string - 'production' or 'development'"
      }
    },
    "usage": "Frontend must read window.APP_CONFIG.API_BASE_URL to construct API URLs",
    "loadOrder": "MUST be loaded in HTML <head> BEFORE app.js"
  }
]
```

---

## Flask 靜態文件服務配置

### Requirements 中必須包含：

```json
{
  "path": "server.py",
  "requirements": [
    "Import: from flask import Flask, request, jsonify, g, Response, send_from_directory",
    "Configure Flask app: app = Flask(__name__, static_folder='.', static_url_path='')",
    "Add root route: @app.route('/') def index(): return send_from_directory('.', 'index.html')",
    "Use environment variable PORT with default 3000: port = int(os.environ.get('PORT', '3000'))",
    "Implement all API routes under /api prefix",
    "Add CORS headers if needed: from flask_cors import CORS; CORS(app)",
    "Initialize database on startup in __main__ block",
    "Run with: app.run(debug=True, port=port)"
  ]
}
```

---

## 完整示例 Payload

```json
{
  "project_name": "expense-tracker",
  "description": "Full-stack expense tracking web application with Flask backend and vanilla JavaScript frontend",
  "coder_instructions": {
    "files": [
      {
        "path": "index.html",
        "description": "Main HTML page with expense tracker UI, forms, and table",
        "requirements": [
          "Load config.js in <head> BEFORE any other JavaScript",
          "Load app.js with defer attribute",
          "Load styles.css in <head>",
          "Include all DOM elements from contracts.dom with EXACT IDs",
          "Use semantic HTML5 (header, main, section, form, table)",
          "Add accessibility attributes (aria-*, labels, alt text)",
          "Include hidden modal for editing expenses",
          "Table structure: Date | Description | Category | Amount | Actions",
          "Form fields: description (text), amount (number), category (select), date (date)"
        ]
      },
      {
        "path": "app.js",
        "description": "Frontend JavaScript handling UI interactions and API calls",
        "requirements": [
          "Read API base URL from window.APP_CONFIG.API_BASE_URL",
          "Fallback to '/api' if config not loaded",
          "Use exact DOM selectors from contracts.dom",
          "Add null checks after every querySelector",
          "Implement CRUD operations: fetchExpenses, createExpense, updateExpense, deleteExpense",
          "Handle form submissions with preventDefault",
          "Render expenses in table with proper formatting",
          "Calculate and display total spending",
          "Implement filters (category, date range) - exclude 'all' value from API calls",
          "Show/hide edit modal with proper class toggling (is-active, hidden attribute)",
          "Handle errors gracefully with console.error and user alerts",
          "Use DOMContentLoaded event listener",
          "Format currency with Intl.NumberFormat"
        ]
      },
      {
        "path": "styles.css",
        "description": "Modern, responsive CSS styling",
        "requirements": [
          "Use CSS variables for colors and theme",
          "Mobile-first responsive design",
          "Card-based layout with box shadows",
          "Form styling with focus states",
          "Button hover effects and transitions",
          "Table with alternating row colors",
          "Modal overlay with centered content",
          "Modal show/hide with .is-active class",
          "Accessibility: sufficient contrast, focus indicators"
        ]
      },
      {
        "path": "config.js",
        "description": "Runtime configuration for frontend",
        "requirements": [
          "Export window.APP_CONFIG object",
          "Provide API_BASE_URL: default '/api' for production",
          "Include commented alternative for development (e.g., 'http://localhost:5001/api')",
          "Add ENVIRONMENT field: 'production' or 'development'",
          "Include clear comments explaining how to switch environments"
        ]
      },
      {
        "path": "server.py",
        "description": "Flask backend with REST API and static file serving",
        "requirements": [
          "Imports: sqlite3, os, flask (Flask, request, jsonify, g, Response, send_from_directory)",
          "Configure Flask: app = Flask(__name__, static_folder='.', static_url_path='')",
          "Add root route serving index.html: @app.route('/') def index(): return send_from_directory('.', 'index.html')",
          "Implement all API endpoints from contracts.api under /api prefix",
          "Database: SQLite with expenses table (id, amount, category, description, date)",
          "Database functions: get_db(), close_connection(), init_db()",
          "API GET /api/expenses: support query params (category, date)",
          "API POST /api/expenses: validate required fields, return 201 with new expense",
          "API PUT /api/expenses/<id>: update expense, return 404 if not found",
          "API DELETE /api/expenses/<id>: delete expense, return 404 if not found",
          "Error handlers: 404, 400, 500 with JSON responses",
          "Use PORT environment variable: port = int(os.environ.get('PORT', '3000'))",
          "Initialize database in __main__ block",
          "Run with: app.run(debug=True, port=port)"
        ]
      },
      {
        "path": "requirements.txt",
        "description": "Python dependencies",
        "requirements": [
          "Include: flask==3.0.0",
          "Include: flask-cors==4.0.0",
          "One dependency per line"
        ]
      },
      {
        "path": "README.md",
        "description": "Setup and usage instructions",
        "requirements": [
          "Title: project name",
          "Setup section: pip install -r requirements.txt",
          "Running section: python server.py",
          "Access instruction: Open http://127.0.0.1:3000 in browser",
          "Note: Flask serves both frontend and backend on same port",
          "Environment variables: PORT (default 3000)",
          "Database: Auto-created on first run"
        ]
      }
    ],
    "contracts": {
      "dom": [
        {
          "description": "Main expense form elements",
          "producers": ["index.html"],
          "consumers": ["app.js"],
          "requiredElements": [
            {"selector": "#add-expense-form", "element": "form", "purpose": "Expense submission form"},
            {"selector": "#expense-description", "element": "input", "purpose": "Description field", "attributes": {"type": "text", "name": "description"}},
            {"selector": "#expense-amount", "element": "input", "purpose": "Amount field", "attributes": {"type": "number", "name": "amount", "step": "0.01"}},
            {"selector": "#expense-category", "element": "select", "purpose": "Category dropdown", "attributes": {"name": "category"}},
            {"selector": "#expense-date", "element": "input", "purpose": "Date picker", "attributes": {"type": "date", "name": "date"}},
            {"selector": "#expense-table-body", "element": "tbody", "purpose": "Expense rows container"},
            {"selector": "#total-spending", "element": "p", "purpose": "Total amount display"},
            {"selector": "#category-filter", "element": "select", "purpose": "Filter by category"}
          ]
        },
        {
          "description": "Edit expense modal",
          "producers": ["index.html"],
          "consumers": ["app.js"],
          "requiredElements": [
            {"selector": "#edit-expense-modal", "element": "div", "purpose": "Modal container", "attributes": {"class": "modal", "hidden": true}},
            {"selector": "#edit-expense-form", "element": "form", "purpose": "Edit form"},
            {"selector": "#edit-expense-description", "element": "input", "purpose": "Edit description"},
            {"selector": "#edit-expense-amount", "element": "input", "purpose": "Edit amount"},
            {"selector": "#edit-expense-category", "element": "select", "purpose": "Edit category"},
            {"selector": "#edit-expense-date", "element": "input", "purpose": "Edit date"},
            {"selector": "#modal-close-btn", "element": "button", "purpose": "Close button"}
          ]
        }
      ],
      "api": [
        {
          "endpoint": "GET /api/expenses",
          "description": "Get all expenses with optional filters",
          "producers": ["server.py"],
          "consumers": ["app.js"],
          "request": {"query": {"category": "string (optional)", "date": "string (optional)"}},
          "response": {"200": {"body": [{"id": "number", "description": "string", "amount": "number", "category": "string", "date": "string"}]}}
        },
        {
          "endpoint": "POST /api/expenses",
          "description": "Create new expense",
          "producers": ["server.py"],
          "consumers": ["app.js"],
          "request": {"body": {"description": "string", "amount": "number", "category": "string", "date": "string"}},
          "response": {"201": {"body": {"id": "number", "description": "string", "amount": "number", "category": "string", "date": "string"}}}
        },
        {
          "endpoint": "PUT /api/expenses/<id>",
          "description": "Update expense",
          "producers": ["server.py"],
          "consumers": ["app.js"]
        },
        {
          "endpoint": "DELETE /api/expenses/<id>",
          "description": "Delete expense",
          "producers": ["server.py"],
          "consumers": ["app.js"]
        }
      ],
      "config": [
        {
          "file": "config.js",
          "description": "Frontend configuration",
          "producers": ["config.js"],
          "consumers": ["app.js"],
          "exports": {"window.APP_CONFIG": {"API_BASE_URL": "string", "ENVIRONMENT": "string"}},
          "loadOrder": "MUST load in HTML <head> BEFORE app.js"
        }
      ]
    }
  }
}
```

---

## 常見問題修復

### 問題 1: 前端顯示 404 錯誤

**原因**: 
- Flask 沒有配置靜態文件服務
- 缺少根路由

**解決**:
```python
# server.py 必須包含：
from flask import Flask, send_from_directory

app = Flask(__name__, static_folder='.', static_url_path='')

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')
```

### 問題 2: JavaScript 顯示 "undefined" 或 API 請求失敗

**原因**:
- config.js 未載入或載入順序錯誤

**解決**:
```html
<!-- index.html <head> 中 -->
<script src="config.js"></script>  <!-- 必須在 app.js 之前 -->
<script src="app.js" defer></script>
```

```javascript
// app.js 中
const API_ROOT = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) 
  ? window.APP_CONFIG.API_BASE_URL 
  : '/api';
```

### 問題 3: DOM 元素找不到 (querySelector returns null)

**原因**:
- HTML 和 JS 使用不同的 ID
- 例如: HTML 用 `edit-expense-description`，JS 用 `edit-description`

**解決**:
在 contracts.dom 中明確定義所有選擇器，讓 HTML 和 JS 都遵守相同的規範。

### 問題 4: 過濾器選擇 "All" 時顯示錯誤

**原因**:
- 前端把 `category=all` 傳給後端，但後端不認識這個值

**解決**:
```javascript
// app.js 中
async function loadAndRenderExpenses() {
    const filters = {};
    
    // 只在有效值時才添加過濾器
    if (categoryFilter.value && categoryFilter.value !== 'all') {
        filters.category = categoryFilter.value;
    }
    if (startDateFilter.value) {
        filters.startDate = startDateFilter.value;
    }
    
    expenses = await fetchExpenses(filters);
    // ...
}
```

### 問題 5: Modal 不顯示

**原因**:
- CSS class 名稱不匹配
- 例如: JS 添加 `is-active`，但 CSS 檢查 `modal--visible`

**解決**:
```css
/* styles.css */
#edit-expense-modal.is-active {
    display: flex;
}
```

```javascript
// app.js
function openEditModal(expense) {
    editModal.classList.add('is-active');
    editModal.removeAttribute('hidden');
}

function closeEditModal() {
    editModal.classList.remove('is-active');
    editModal.setAttribute('hidden', '');
}
```

---

## 系統如何處理這些 Contracts

### Worker Agents 的 Prompt 構建

每個 Worker Agent (markup, script, style, python, system) 都會：

1. **接收 contracts** 作為 context
2. **過濾相關的 contracts**（例如 markup-agent 只關心它是 producer 的 DOM contracts）
3. **在 prompt 中強調這些規範**

示例（markup-agent/generator.js）:
```javascript
if (contracts && contracts.dom) {
  const relevantDom = contracts.dom.filter(dom => 
    dom.producers.includes(filePath)  // 只處理此文件負責生成的 DOM
  );
  
  if (relevantDom.length > 0) {
    prompt += `⚠️ CRITICAL: DOM STRUCTURE REQUIREMENTS ⚠️\n`;
    prompt += `The following elements are MANDATORY:\n\n`;
    
    relevantDom.forEach(dom => {
      dom.requiredElements.forEach(elem => {
        prompt += `• ${elem.selector} <${elem.element}> - ${elem.purpose}\n`;
      });
    });
    
    prompt += `YOU MUST include ALL elements with EXACT selectors listed above.\n`;
  }
}
```

### Coordinator 的職責

`coder-agent/coordinator.js` 負責：

1. **解析 coder_instructions** 中的 contracts
2. **在每個 generation phase 傳遞 contracts** 給 Worker Agents
3. **按依賴順序生成文件**，確保被依賴的文件先生成

---

## 最佳實踐總結

### ✅ DO

1. **明確定義所有 DOM 選擇器** 在 contracts.dom 中
2. **統一 API 接口** 在 contracts.api 中，前後端都遵守
3. **要求 Flask 配置靜態文件服務** 在 requirements 中
4. **要求 config.js 載入順序** 在 HTML requirements 中
5. **要求 JavaScript 讀取 window.APP_CONFIG** 在 app.js requirements 中
6. **詳細的 requirements** - 越具體越好

### ❌ DON'T

1. **不要假設生成器會自動推斷** - 明確指定所有依賴
2. **不要只寫抽象描述** - 給出具體的代碼要求
3. **不要忽略載入順序** - 明確說明哪個文件必須先載入
4. **不要混用 ID 命名** - 統一使用完整的 ID（例如 `edit-expense-description` 而非 `edit-description`）

---

## 驗證清單

生成代碼後，檢查：

- [ ] `index.html` 的 `<head>` 中有 `<script src="config.js"></script>`
- [ ] `config.js` 導出 `window.APP_CONFIG`
- [ ] `app.js` 讀取 `window.APP_CONFIG.API_BASE_URL`
- [ ] `server.py` 有 `static_folder='.'` 和 `static_url_path=''`
- [ ] `server.py` 有 `@app.route('/')` 服務 `index.html`
- [ ] `server.py` 使用 `os.environ.get('PORT', '3000')`
- [ ] HTML 和 JS 使用相同的 DOM 選擇器
- [ ] 前端過濾器排除 "all" 值
- [ ] Modal CSS 使用 `is-active` class

---

## 總結

透過在 `coder_instructions` 中使用 **contracts**，可以：

1. **明確前後端接口** - API、DOM、Config 都有清晰規範
2. **避免 ID 不匹配** - contracts.dom 強制統一
3. **確保依賴正確** - contracts.config 指定載入順序
4. **自動生成一致的代碼** - Worker Agents 遵守 contracts

這樣生成的代碼就能像現在的 expense tracker 一樣，前後端無縫整合！
