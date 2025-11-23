# Contracts Agent 整合指南

## 📋 概述

Contracts Agent 是一個自動化的 payload 預處理器，用於在代碼生成前檢測和修復常見問題。它能自動增強 payload，確保生成的代碼第一次就能正常運行。

## 🎯 解決的問題

基於 Example 7 (Full-stack Todo App) 的實際經驗，Contracts Agent 能自動防止以下 6 類問題：

1. **端口衝突** - Vision-agent 佔用 3000 端口
2. **JWT 身份類型錯誤** - Flask-JWT-Extended 要求字符串 identity
3. **CSRF 保護衝突** - API 模式下需要禁用 CSRF
4. **視圖切換函數缺失** - showView() 函數未實現
5. **字段命名不一致** - 前端 camelCase vs 後端 snake_case
6. **錯誤處理缺失** - 401/422 錯誤未處理

## 🔧 安裝和設置

### 1. 文件結構

```
coder-agent/
├── contracts-agent.js           # 核心實現
├── contracts-agent-examples.js  # 使用範例
├── coder-agent-cli.js           # CLI 主程序（需要修改）
└── architecture-adapter.js      # 架構適配器（需要修改）
```

### 2. 依賴項

Contracts Agent 使用 Node.js 標準庫，無需額外依賴。

## 📖 使用方法

### 方法 1: 獨立使用（推薦用於測試）

```bash
# 預處理單個 payload 文件
node contracts-agent-examples.js preprocess test_payloads/example7_fullstack_todo.json

# 生成增強後的 payload
# 輸出: test_payloads/example7_fullstack_todo.enhanced.json
```

### 方法 2: 整合到 CLI 工作流程

修改 `coder-agent-cli.js`：

```javascript
const ContractsAgent = require('./contracts-agent');

// 在 generate 命令處理中添加
yargs.command({
    command: 'generate <payload>',
    handler: async (argv) => {
        // === 添加這段代碼 ===
        const contractsAgent = new ContractsAgent();
        const originalPayload = require(argv.payload);
        const enhancedPayload = await contractsAgent.processPayload(originalPayload);
        
        // 可選：保存增強後的 payload
        const fs = require('fs');
        fs.writeFileSync(
            argv.payload.replace('.json', '.enhanced.json'),
            JSON.stringify(enhancedPayload, null, 2)
        );
        // === 結束添加 ===
        
        // 使用 enhancedPayload 代替 originalPayload
        const result = await architectureAdapter.process(enhancedPayload);
        // ... 繼續原有流程
    }
});
```

### 方法 3: 整合到 Architecture Adapter

修改 `architecture-adapter.js`：

```javascript
const ContractsAgent = require('./contracts-agent');

class ArchitectureAdapter {
    async process(payload) {
        // === 在處理前添加預處理 ===
        const contractsAgent = new ContractsAgent();
        const enhancedPayload = await contractsAgent.processPayload(payload);
        // === 結束添加 ===
        
        // 使用 enhancedPayload 繼續處理
        const plan = this.analyzeDependencies(enhancedPayload);
        // ... 繼續原有流程
        
        return plan;
    }
}
```

## 🔍 自動檢測的問題類型

### Critical Issues (必須修復)

| 問題 ID | 檢測條件 | 自動修復 |
|--------|---------|---------|
| `port_conflict` | 使用 3000 端口且描述包含 Flask/Express | 改為 5001 |
| `jwt_identity_type_missing` | 有 JWT 但未指定 `str(user.id)` | 添加技術要求 |
| `view_switching_missing` | 有多個視圖但無切換函數 | 添加 showView() 合約 |

### Warnings (建議修復)

| 問題 ID | 檢測條件 | 自動修復 |
|--------|---------|---------|
| `jwt_csrf_not_disabled` | 使用 JWT 但未禁用 CSRF | 添加 `JWT_CSRF_CHECK_FORM = False` |
| `inconsistent_naming` | API 回應使用 camelCase | 建議改為 snake_case |

### Suggestions (可選優化)

| 問題 ID | 檢測條件 | 自動修復 |
|--------|---------|---------|
| `port_not_configured` | 未指定 backend_port | 添加 port 5001 |
| `missing_401_handler` | 有認證但無錯誤處理 | 添加 401/422 處理要求 |
| `venv_not_mentioned` | Python 項目無 venv 說明 | 添加環境設置步驟 |

## 📊 輸出格式

### 增強後的 Payload 結構

```json
{
    "_preprocessed": {
        "timestamp": "2025-01-15T10:30:00.000Z",
        "version": "1.0.0",
        "issuesDetected": 5,
        "issuesFixed": 5,
        "issues": [
            {
                "id": "port_conflict",
                "severity": "critical",
                "message": "Port 3000 conflicts with vision-agent",
                "autoFixed": true
            }
        ]
    },
    "description": "...",
    "projectConfig": {
        "runtime": {
            "backend_port": 5001  // 自動修復
        }
    },
    "technicalRequirements": [
        {
            "category": "JWT Authentication",
            "requirement": "Use str(user.id) when creating JWT token",
            "implementation": "create_access_token(identity=str(user.id))",
            "affectedFunctions": ["login", "register", "refresh_token"]
        }
        // ... 更多自動添加的要求
    ],
    "contracts": {
        "dom": [
            {
                "element": "views",
                "functions": ["showView(view)"]  // 自動添加
            }
        ]
        // ... 原有合約
    }
}
```

### 終端輸出範例

```
🔍 Contracts Agent Analysis Report
=====================================

📊 Summary:
   Total Issues: 5
   Critical: 2
   Warnings: 2
   Suggestions: 1

❌ Critical Issues:
   [port_conflict] Port 3000 conflicts with vision-agent
   → Auto-fixed: Changed to port 5001

   [jwt_identity_type_missing] JWT identity type not specified
   → Auto-fixed: Added str(user.id) requirement

⚠️  Warnings:
   [jwt_csrf_not_disabled] JWT CSRF protection should be disabled for API
   → Auto-fixed: Added JWT_CSRF_CHECK_FORM = False config

   [inconsistent_naming] API response uses camelCase, should use snake_case
   → Auto-fixed: Changed taskId → id, dueDate → due_date

💡 Suggestions:
   [missing_401_handler] Add error handling for 401/422 responses
   → Auto-fixed: Added auto-logout error handler

🎉 All issues resolved! Enhanced payload ready for generation.
```

## 🧪 測試

### 運行內建測試

```bash
node contracts-agent-examples.js test
```

### 測試 Example 7 Payload

```bash
# 1. 預處理 example7
node contracts-agent-examples.js preprocess test_payloads/example7_fullstack_todo.json

# 2. 比較原始和增強版本
code --diff test_payloads/example7_fullstack_todo.json \
              test_payloads/example7_fullstack_todo.enhanced.json

# 3. 使用增強版本生成代碼
node coder-agent-cli.js generate test_payloads/example7_fullstack_todo.enhanced.json
```

## 🔧 自定義和擴展

### 添加自定義檢測規則

```javascript
const ContractsAgent = require('./contracts-agent');

class MyCustomAgent extends ContractsAgent {
    detectCustomIssues(payload) {
        const issues = { critical: [], warnings: [], suggestions: [] };
        
        // 範例：檢查資料庫遷移
        const hasDatabase = this.searchInPayload(payload, ['database', 'sqlalchemy']);
        const hasMigrations = this.searchInPayload(payload, ['migration', 'alembic']);
        
        if (hasDatabase && !hasMigrations) {
            issues.suggestions.push({
                id: 'missing_database_migrations',
                message: 'Database found but no migration script specified',
                suggestion: 'Add init_db.py or Alembic configuration',
                autoFix: false
            });
        }
        
        return issues;
    }
    
    generateEnhancements(payload, issues) {
        const enhancements = super.generateEnhancements(payload, issues);
        
        // 添加自定義修復
        const migrationIssue = issues.suggestions.find(
            i => i.id === 'missing_database_migrations'
        );
        
        if (migrationIssue) {
            enhancements.push({
                type: 'add_file',
                path: ['files'],
                value: {
                    path: 'init_db.py',
                    agent: 'Script Agent',
                    description: 'Database initialization script'
                }
            });
        }
        
        return enhancements;
    }
}

// 使用自定義 Agent
const myAgent = new MyCustomAgent();
const enhanced = await myAgent.processPayload(payload);
```

### 配置選項

創建 `contracts-agent.config.js`：

```javascript
module.exports = {
    // 啟用/禁用特定檢查
    checks: {
        portConflict: true,
        jwtConfiguration: true,
        fieldNaming: true,
        viewSwitching: true,
        errorHandling: true,
        virtualEnvironment: true
    },
    
    // 自動修復設定
    autoFix: {
        enabled: true,
        criticalOnly: false,  // false = 修復所有，true = 只修復 critical
        requireConfirmation: false
    },
    
    // 端口配置
    ports: {
        avoid: [3000, 8000],  // 避免使用的端口
        recommend: 5001       // 推薦使用的端口
    },
    
    // 命名規範
    namingConventions: {
        api: 'snake_case',
        frontend: 'camelCase',
        database: 'snake_case'
    }
};
```

## 📈 效果對比

### 使用前（Example 7 原始問題）

```
❌ 生成代碼後需要手動修復 6 個問題
❌ 花費時間：~2 小時調試
❌ 需要理解：Python 環境、端口衝突、JWT 配置、字段命名
❌ 容易遺漏：視圖切換函數、錯誤處理
```

### 使用後（Contracts Agent 預處理）

```
✅ 代碼第一次生成就能運行
✅ 花費時間：<5 分鐘（自動預處理）
✅ 自動檢測：所有 6 類常見問題
✅ 自動修復：添加缺失的配置和合約
✅ 清晰報告：顯示所有修復項目
```

## 🚀 最佳實踐

### 1. 總是啟用預處理

```javascript
// ❌ 錯誤：直接使用原始 payload
const result = await coderAgent.generate(originalPayload);

// ✅ 正確：先預處理再生成
const enhanced = await contractsAgent.processPayload(originalPayload);
const result = await coderAgent.generate(enhanced);
```

### 2. 保存增強版本以供審查

```javascript
fs.writeFileSync(
    'payload.enhanced.json',
    JSON.stringify(enhancedPayload, null, 2)
);
console.log('Enhanced payload saved for review');
```

### 3. 在 CI/CD 中集成

```yaml
# .github/workflows/generate.yml
- name: Pre-process payload
  run: node contracts-agent-examples.js preprocess payload.json

- name: Generate code
  run: node coder-agent-cli.js generate payload.enhanced.json
```

### 4. 定期更新檢測規則

根據新的生成問題，添加新的檢測模式到 `contracts-agent.js`。

## 🐛 故障排除

### 問題：預處理後仍有錯誤

**解決方案：**
1. 檢查 `_preprocessed.issues` 查看哪些問題被檢測到
2. 確認自動修復是否正確應用（`autoFixed: true`）
3. 手動審查 enhanced payload 的變更
4. 可能需要添加新的檢測規則

### 問題：檢測到錯誤的問題

**解決方案：**
1. 調整 `searchInPayload` 的搜索關鍵詞
2. 添加更多上下文檢查避免誤報
3. 使用配置檔案禁用特定檢查

### 問題：自動修復破壞了原有配置

**解決方案：**
1. 設置 `autoFix.requireConfirmation: true`
2. 使用 `criticalOnly: true` 只修復嚴重問題
3. 手動審查並選擇性應用修復

## 📚 相關文檔

- [contracts-agent.js](./contracts-agent.js) - 核心實現
- [contracts-agent-examples.js](./contracts-agent-examples.js) - 使用範例
- [example7_fixes_summary.json](../test_payloads/example7_fixes_summary.json) - 問題詳細文檔

## 🤝 貢獻

發現新的常見問題？歡迎添加新的檢測規則！

1. 在 `detectIssues()` 中添加新的檢查
2. 在 `generateFix()` 中添加對應的修復模式
3. 添加測試用例到 `contracts-agent-examples.js`
4. 更新此文檔

## 📝 版本歷史

- **v1.0.0** (2025-01-15) - 初始版本
  - 檢測 6 類常見問題
  - 8 種自動修復模式
  - 支持自定義規則
  - 完整的報告系統
