# Architecture.json 適配指南

## 概述

本指南說明如何將 `architecture.json` 格式的項目規劃轉換為我們的代碼生成系統可以處理的標準 payload 格式。

## Architecture.json 格式

Architecture.json 是一個由 AI Architect Agent 生成的項目規劃文件，包含以下結構：

```json
{
  "id": "unique-id",
  "createdAt": "ISO-timestamp",
  "prompt": "用戶原始請求",
  "context": { "timestamp": "..." },
  "output": {
    "coder_instructions": {
      "role": "Coder Agent",
      "summary": "項目總結",
      "directives": [
        { "do": "做什麼", "why": "為什麼" }
      ],
      "files": [
        {
          "path": "file/path",
          "purpose": "文件用途",
          "template": "可選的代碼模板"
        }
      ],
      "commands": ["npm install", "npm start"],
      "acceptance": ["驗收標準"],
      "notes": ["注意事項"]
    },
    "plan": {
      "title": "項目標題",
      "summary": "項目摘要",
      "steps": [...]
    },
    "markdown": "Markdown 格式的交接說明"
  }
}
```

## 使用方法

### 1. 準備 Architecture.json

將你的 `architecture.json` 文件放在任意位置，例如：
- `architecture-samples/my-project.json`
- `../architecture.json`
- `/path/to/project/architecture.json`

### 2. 啟動所有服務

確保所有必要的服務都在運行：

```powershell
# 啟動 Worker Agents (端口 3801-3805)
cd worker-agents
./start-all-agents.ps1

# 啟動 Coder Agent (端口 3800)
cd coder-agent
node server.js

# (可選) 啟動 Vision Agent (端口 3000)
cd vision-agent
node server.js
```

### 3. 轉換並生成代碼

使用測試腳本自動轉換並發送到 Coder Agent：

```powershell
node test_payloads/test_architecture_adapter.js architecture-samples/arithmetic-app.json
```

## 轉換流程

### ArchitectureAdapter 做了什麼？

1. **文件增強** (`_enhanceFiles`)
   - 自動推斷 `language`（從文件副檔名）
   - 從 `purpose` 提取 `description`
   - 從 `notes` 和 `acceptance` 提取 `requirements`
   - 判斷 `template` 是骨架還是完整代碼

2. **Contracts 提取** (`_extractContracts`)
   - 從 `directives` 中推斷 API 定義
   - 從 `directives` 中推斷 DOM 定義
   - 從 `directives` 中推斷配置文件定義

3. **ProjectConfig 構建** (`_buildProjectConfig`)
   - 推斷項目名稱（從 plan.title 或 summary）
   - 推斷項目類型（web/backend/mobile/cli/nodejs/python）
   - 推斷構建工具（npm/pip/cargo/go/maven/gradle）
   - 提取依賴項（從 package.json template）

4. **標準化輸出**
   - 生成符合 Coder Agent 期望的標準 payload 格式
   - 包含所有必要字段：files, contracts, projectConfig
   - 保留原始的 plan 和 markdown 信息

## 範例對比

### 輸入：Architecture.json 文件定義

```json
{
  "path": "index.js",
  "purpose": "Main application logic",
  "template": "// Import modules\nconst fs = require('fs');\n// ... (to be implemented)"
}
```

### 輸出：增強後的文件定義

```json
{
  "path": "index.js",
  "language": "javascript",
  "description": "Main application logic",
  "requirements": [
    "Ensure to handle division by zero",
    "Consider adding error handling for invalid inputs"
  ],
  "skeleton": "// Import modules\nconst fs = require('fs');\n// ... (to be implemented)"
}
```

## 自動推斷規則

### Language 推斷
```javascript
.js/.mjs/.cjs/.jsx  → javascript
.ts/.tsx            → typescript
.py                 → python
.html/.htm          → html
.css/.scss/.sass    → css
.json               → json
.md                 → markdown
```

### 項目類型推斷
- 包含 `.html` 文件 → `web`
- Summary 包含 "api"/"backend"/"server" → `backend`
- Summary 包含 "mobile"/"app" → `mobile`
- Summary 包含 "cli"/"command" → `cli`
- 包含 `package.json` → `nodejs`
- 包含 `requirements.txt` 或 `.py` → `python`

### 構建工具推斷
- 存在 `package.json` → `npm`
- 存在 `requirements.txt` → `pip`
- 存在 `Cargo.toml` → `cargo`
- 存在 `go.mod` → `go`
- Commands 包含 "mvn" → `maven`
- Commands 包含 "gradle" → `gradle`

### Template 類型判斷

**骨架 (Skeleton)** - 將被 Cloud API 擴展：
- 包含 `// ...` 或 `# ...` 佔位符
- 包含 `TODO`、`IMPLEMENT`、`FIXME`
- 長度 < 500 字符
- 只有 import 語句和函數簽名
- 包含 "(to be implemented)"

**完整代碼 (Content)** - 直接使用：
- 長度 > 500 字符
- 包含完整的函數實現
- 沒有佔位符或 TODO 標記

## 配合自動修復功能

轉換後的 payload 會自動觸發我們的 Phase 1 增強功能：

### Markup Agent (HTML)
- 檢測到 `config.js` 時強制執行腳本加載順序
- 應用 DOM 命名標準（7條規則）

### Script Agent (JavaScript)
- 強制使用 `window.APP_CONFIG` 讀取 API 配置
- 自動添加過濾器處理邏輯（跳過 "all" 值）
- 強制 DOM 查詢空值檢查
- 統一 Modal 顯示模式（`.is-active` 類）

### Python Agent (Flask)
- 檢測到 Flask + 前端文件時自動配置靜態文件服務
- 強制使用 `PORT` 環境變數
- 確保 API 路由使用 `/api` 前綴

### Style Agent (CSS)
- 檢測到 modal 時強制使用 `.is-active` 類模式
- 提供完整的 modal 樣式結構

## 常見問題

### Q1: Architecture.json 中的 template 太簡單怎麼辦？

A: Adapter 會自動判斷 template 是否為骨架：
- 如果是骨架（< 500 字符或包含 TODO），將其設為 `skeleton`，讓 Cloud API 生成詳細代碼
- 如果是完整代碼，將其設為 `content`，直接使用

### Q2: 如何添加 Contracts？

A: 兩種方式：
1. **自動推斷**：Adapter 會從 `directives` 中提取 API、DOM、Config 定義
2. **手動添加**：在 architecture.json 的 `coder_instructions` 中添加 `contracts` 字段

範例：
```json
"coder_instructions": {
  "contracts": {
    "api": [
      {
        "endpoint": "GET /api/calculate",
        "description": "Perform calculation",
        "request": { "query": { "operation": "string", "a": "number", "b": "number" } },
        "response": { "result": "number" }
      }
    ]
  }
}
```

### Q3: 如何指定特定的 requirements？

A: 在文件定義中添加 `requirements` 數組：

```json
{
  "path": "index.js",
  "purpose": "Main logic",
  "requirements": [
    "Use async/await for all I/O operations",
    "Implement proper error handling",
    "Add JSDoc comments for all functions"
  ]
}
```

### Q4: 生成的代碼在哪裡？

A: 輸出目錄結構：
```
coder-agent/outputs/
  └── coder-YYYY-MM-DDTHHMM/
      ├── index.js
      ├── package.json
      ├── README.md
      └── ...
```

控制台會顯示完整路徑。

## 完整工作流程

```
1. AI Architect Agent 生成 architecture.json
   ↓
2. ArchitectureAdapter 轉換為標準 payload
   ↓
3. Coder Agent 接收並處理
   ↓
4. Phase 0: 生成配置文件 (config.js, .env)
   ↓
5. Phase 1: 生成骨架 (所有文件的結構)
   ↓
6. Phase 2: 依賴分析 + 拓撲排序
   ↓
7. Phase 3: 按順序生成詳細代碼
   ├─ Layer 1: config.js, styles.css
   ├─ Layer 2: app.js
   └─ Layer 3: index.html, server.py
   ↓
8. Phase 4: 組裝並保存所有文件
   ↓
9. 輸出完整項目到 outputs/coder-*/
```

## 測試範例

項目提供了一個完整的測試範例：

```powershell
# 查看範例 architecture.json
cat architecture-samples/arithmetic-app.json

# 運行轉換和生成
node test_payloads/test_architecture_adapter.js architecture-samples/arithmetic-app.json

# 查看生成結果
cd coder-agent/outputs/coder-<timestamp>
ls
```

## 進階：直接調用 API

如果你想在自己的代碼中集成，可以直接使用 ArchitectureAdapter：

```javascript
const ArchitectureAdapter = require('./coder-agent/architecture-adapter');
const fs = require('fs');

// 1. 讀取 architecture.json
const architectureJson = JSON.parse(fs.readFileSync('my-architecture.json', 'utf8'));

// 2. 驗證
const validation = ArchitectureAdapter.validate(architectureJson);
if (!validation.valid) {
  console.error('驗證失敗:', validation.errors);
  process.exit(1);
}

// 3. 轉換
const payload = ArchitectureAdapter.adaptToPayload(architectureJson);

// 4. 發送到 Coder Agent
const response = await fetch('http://localhost:3800/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
});

const result = await response.json();
console.log('生成結果:', result);
```

## 相關文檔

- `docs/PROMPT_GUIDE.md` - 如何編寫有效的 prompt 和 contracts
- `docs/AUTO_FIX_STRATEGY.md` - 自動修復策略說明
- `docs/DEPENDENCY_FIX.md` - 依賴分析修復報告
- `shared/generation-defaults.js` - 生成規範配置

## 總結

使用 ArchitectureAdapter，你可以：

1. ✅ 無縫集成 AI Architect Agent 的輸出
2. ✅ 自動增強文件定義（language, description, requirements）
3. ✅ 智能推斷項目配置（type, buildTool, dependencies）
4. ✅ 自動應用最佳實踐（Phase 1 增強功能）
5. ✅ 生成結構良好、依賴關係正確的完整項目

這大大簡化了從項目規劃到代碼生成的流程，讓整個系統更加自動化和智能化。
