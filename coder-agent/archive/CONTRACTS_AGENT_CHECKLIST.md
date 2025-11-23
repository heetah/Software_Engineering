# Contracts Agent - 完整檢查清單

## ✅ 已實現的檢查項目

### 1. 端口配置檢查
- ✅ 檢測是否配置 `backend_port`
- ✅ 檢測是否使用端口 3000（與 vision-agent 衝突）
- ✅ 自動修復：改為端口 5001

### 2. JWT 配置檢查
- ✅ 檢測 JWT identity 類型是否指定（必須是 string）
- ✅ 檢測 CSRF 保護是否禁用（API 模式下應禁用）
- ✅ 自動修復：添加 `str(user.id)` 和 `JWT_CSRF_CHECK_FORM = False` 要求

### 3. 前端配置檢查
- ✅ 檢測視圖切換函數是否存在（showView）
- ✅ 檢測錯誤處理（401/422 自動登出）
- ✅ 自動修復：添加 showView() 函數合約

### 4. 字段命名檢查
- ✅ 檢測 API 回應是否使用 camelCase
- ✅ 自動修復：建議改為 snake_case

### 5. 必要文件檢查 ⭐ **新增**

#### A. 文檔文件
- ✅ **README.md** - 項目說明、安裝步驟、使用指南
  - 缺失時：自動添加到 files 列表
  - 嚴重程度：Warning

#### B. 依賴管理文件
- ✅ **requirements.txt** (Python 項目)
  - 檢測條件：有 Python 後端且缺少 requirements.txt
  - 缺失時：自動添加並生成依賴描述（Flask, JWT, CORS, SQLAlchemy 等）
  - 嚴重程度：Critical（會導致安裝失敗）

- ✅ **package.json** (Node.js 項目)
  - 檢測條件：有 Node.js 後端且缺少 package.json
  - 缺失時：自動添加
  - 嚴重程度：Critical

#### C. 啟動腳本
- ✅ **start.ps1 / start.sh / setup script**
  - 檢測條件：沒有任何啟動腳本
  - 缺失時：自動添加 start.ps1
  - 內容：激活 venv、安裝依賴、初始化資料庫、啟動伺服器
  - 嚴重程度：Warning

#### D. 資料庫相關
- ✅ **init_db.py / schema / migration**
  - 檢測條件：有資料庫但無初始化腳本
  - 缺失時：自動添加 init_db.py
  - 內容：建表、添加測試資料（admin/admin123, demo/demo123）
  - 嚴重程度：Warning

#### E. 環境配置
- ✅ **.env.example / config file**
  - 檢測條件：有後端或資料庫但無環境配置文件
  - 缺失時：自動添加 .env.example
  - 內容：SECRET_KEY, JWT_SECRET_KEY, DATABASE_URI, PORT, CORS_ORIGINS
  - 嚴重程度：Suggestion

#### F. 版本控制
- ✅ **.gitignore**
  - 缺失時：自動添加
  - 內容：排除 venv/, node_modules/, __pycache__/, *.pyc, .env, *.db, .vscode/
  - 嚴重程度：Suggestion

## 📊 Example 7 測試結果

### 原始 Payload
```
文件數量：6
- index.html
- style.css
- app.js
- server.py
- config.py
- requirements.txt
```

### 增強後 Payload
```
文件數量：10 (+4)
- index.html
- style.css
- app.js
- server.py
- config.py
- requirements.txt
- package.json ✨ 新增
- README.md ✨ 新增
- start.ps1 ✨ 新增
- init_db.py ✨ 新增
```

### 檢測到的問題

#### Critical Issues (2)
1. ❌ JWT identity type not specified
   - 修復：添加 `str(user.id)` 技術要求
   
2. ❌ package.json missing for Node.js backend
   - 修復：添加 package.json 文件

#### Warnings (4)
1. ⚠️ JWT CSRF protection not disabled for API
   - 修復：添加 `JWT_CSRF_CHECK_FORM = False` 配置

2. ⚠️ README.md file not specified
   - 修復：添加 README.md

3. ⚠️ No setup/start script specified
   - 修復：添加 start.ps1

4. ⚠️ Database initialization script not specified
   - 修復：添加 init_db.py

#### Suggestions (1)
1. 💡 .gitignore file not specified
   - 狀態：未自動修復（需手動確認）

### 技術要求自動添加

```json
{
  "technicalRequirements": [
    {
      "category": "JWT Authentication",
      "requirements": [
        "CRITICAL: JWT identity MUST be string type",
        "When creating token: create_access_token(identity=str(user.id))",
        "When reading token: current_user_id = int(get_jwt_identity())",
        "Apply to all protected routes"
      ]
    },
    {
      "category": "JWT Configuration",
      "requirements": [
        "Disable CSRF for API-only backend",
        "Add to Flask config: app.config['JWT_CSRF_CHECK_FORM'] = False"
      ]
    }
  ]
}
```

## 🔧 使用方法

### 獨立使用
```bash
node test-contracts-agent.js
```

### 整合到工作流程
```javascript
const ContractsAgent = require('./contracts-agent');

const agent = new ContractsAgent();
const originalPayload = require('./test_payloads/example7_fullstack_todo.json');
const enhancedPayload = await agent.processPayload(originalPayload);

// enhancedPayload 現在包含所有必要文件和技術要求
```

## 📈 效果對比

### 使用前
- ❌ 缺少 4 個必要文件（README, start.ps1, init_db.py, package.json）
- ❌ 缺少 JWT 配置說明
- ❌ 缺少錯誤處理要求
- ⏱️ 需要手動添加和配置

### 使用後
- ✅ 自動檢測並添加所有缺失文件
- ✅ 自動生成技術要求
- ✅ 完整的項目結構
- ⚡ 即時處理，無需手動干預

## 🎯 關鍵價值

1. **完整性保證**
   - 確保每個項目都有必要的文件
   - 沒有遺漏的依賴或配置

2. **標準化**
   - 統一的項目結構
   - 一致的文件命名和組織

3. **自動化**
   - 不需要手動檢查清單
   - 減少人為錯誤

4. **可擴展**
   - 易於添加新的檢查規則
   - 支持自定義項目需求

## 🚀 下一步

建議將 Contracts Agent 整合到：
1. **CLI 工作流程** - 在生成代碼前自動預處理
2. **Architecture Adapter** - 作為 payload 驗證層
3. **CI/CD 流程** - 確保所有提交的 payload 都完整

## 📝 配置建議

```javascript
// contracts-agent.config.js
module.exports = {
    checks: {
        portConflict: true,
        jwtConfiguration: true,
        fieldNaming: true,
        viewSwitching: true,
        errorHandling: true,
        virtualEnvironment: true,
        essentialFiles: true  // ⭐ 新增
    },
    
    essentialFiles: {
        alwaysRequired: ['README.md', '.gitignore'],
        pythonProject: ['requirements.txt', 'init_db.py', 'start.ps1'],
        nodeProject: ['package.json'],
        withDatabase: ['init_db.py', '.env.example']
    },
    
    autoFix: {
        enabled: true,
        criticalOnly: false
    }
};
```
