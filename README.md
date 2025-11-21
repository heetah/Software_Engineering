# Multi-Agent Copilot 

## 專案概述

本專案實作一套由大型語言模型（LLM）驅動的全自動化測試生成與執行系統。系統採用多代理（Multi-Agent）架構，從系統架構分析到測試計劃生成，再到測試碼自動生成與執行，實現完整的自動化測試流程。

## 系統架構

### 核心組件

系統由以下四個核心代理組成：

1. **Architect Agent（架構代理）**
   - 負責分析用戶需求並生成系統架構
   - 輸出結構化的 `architecture.json` 檔案
   - 包含完整的程式碼生成指令（coder_instructions）

2. **Coder Coordinator（程式碼協調器）**
   - 根據架構指令生成實際的專案檔案
   - 支援多種專案類型和技術棧

3. **Verifier Agent（驗證代理）**
   - 解析 `architecture.json` 並生成測試計劃
   - 輸出標準化的 `test-plan.json` 檔案
   - 定義測試檔案結構、測試案例和預期結果

4. **Tester Agent（測試代理）**
   - 根據 `test-plan.json` 生成可執行的 Jest 測試碼
   - 自動執行測試並生成測試報告
   - 提供失敗案例的錯誤分析


### 系統流程

```
Architect Agent
      ↓
architecture.json
      ↓
Coder Coordinator
      ↓
專案檔案生成
      ↓
Verifier Agent
      ↓ (使用 templates.js)
test-plan.json
      ↓
Tester Agent
      ↓ (使用 templates.js)
生成 *.test.js
      ↓
執行 Jest
      ↓
test-report.json
error-report.json
```

## 專案結構

```
Software_Engineering/
├── agents/          
│   ├── base-agent.js             # 所有agents的基底           
│   ├── architect-agent.js        # Architecture
│   ├── verifier-agent.js         # Verifier
│   ├── tester-agent.js           # Tester
│   ├── instruction-service.js    # session管理服務
│   ├── project-writer.js         # 專案檔案寫入
│   └── templates.js              # 模板中心
├── utils/                      
│   ├── api-provider-manager.js   # API 提供者管理
│   ├── config.js                 # 配置管理
│   ├── error-handler.js          # 錯誤處理
│   └── token-tracker.js          # Token 追蹤
├── data/
│   └── sessions/                 # 會話資料
│       └── <sessionId>/
│           ├── architecture.json # 專案架構與規劃
│           ├── test-plan.json    # 測試計畫(基於LLM回應)
│           ├── generated-tests/  # 測試檔案
│           │   └── *.test.js
│           ├── jest-report.json  # Jest測試報告
│           ├── test-report.json  # 測試結果報告
│           └── error-report.json # 錯誤結果報告
├── output/                       # 生成的專案輸出
│   └── <sessionId>/
│       └── [專案檔案]
├── Coordinator.js                # 主協調器
└── main.js                       # Electron 主程式
```

## 模板系統

`templates.js` 作為模板中心，統一管理所有代理使用的提示模板，分為三大區塊：

### 1. 共用模板（Shared）

- `TEST_PLAN_SCHEMA_DESCRIPTION`: test-plan.json 的標準格式說明

### 2. Verifier Agent 模板

用於生成測試計劃：

- `VERIFIER_CLARIFICATION_TEMPLATE`: 問題澄清模板
- `VERIFIER_TEST_PLAN_OUTPUT_TEMPLATE`: 測試計劃輸出格式
- `VERIFIER_TEST_PLAN_TIPS`: 測試計劃撰寫提示

### 3. Tester Agent 模板

用於生成測試碼和錯誤分析：

- `TESTER_CODEGEN_PROMPT_TEMPLATE`: 測試碼生成提示
  - 支援 HTTP 測試（使用 supertest）
  - 支援函數測試（直接呼叫函數）
- `TESTER_ERROR_ANALYSIS_TEMPLATE`: 錯誤分析提示
- `TESTER_REPORT_MARKDOWN_TEMPLATE`: 測試報告 Markdown 格式

## 安裝與配置

### 環境需求

- Node.js 18.0 或更高版本
- npm 或 yarn 套件管理器

### 安裝依賴

```bash
npm install
```

### 環境變數配置

建立 `.env` 檔案並配置以下變數：

```env
# OpenAI API 配置（優先使用）
OPENAI_API_KEY=your_openai_api_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini

# Gemini API 配置（備用）
GEMINI_API_KEY=your_gemini_api_key
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
GEMINI_MODEL=gemini-2.5-flash

# API 超時與重試配置
API_TIMEOUT=20000
API_MAX_RETRIES=2
API_RETRY_DELAY=500

# 代理溫度設定
ARCHITECT_TEMPERATURE=0.3
CODER_TEMPERATURE=0.2
TESTER_TEMPERATURE=0.1
```

### API 優先順序

系統預設優先使用 OpenAI API，若 OpenAI 不可用則自動切換至 Gemini API。此配置可透過 `utils/api-provider-manager.js` 調整。

## 使用方式

### 命令列執行

```bash
node Coordinator.js "生成計算機網站"
```

### Electron 應用程式

```bash
npm start
```

啟動 Electron 應用程式後，可在圖形介面中輸入需求並執行。

### 程式化呼叫

```javascript
import { runWithInstructionService, initializeAgents } from './Coordinator.js';

const agents = initializeAgents();
const plan = await runWithInstructionService("生成計算機網站", agents);
console.log(`Session ID: ${plan.id}`);
```

## 資料格式

### architecture.json

由 Architect Agent 生成，包含系統架構和程式碼生成指令：

```json
{
  "id": "session-id",
  "createdAt": "2025-11-19T07:25:47.594Z",
  "prompt": "用戶需求",
  "output": {
    "coder_instructions": {
      "role": "Coder Agent",
      "summary": "專案摘要",
      "directives": [...],
      "files": [...],
      "commands": [...],
      "acceptance": [...]
    },
    "plan": {
      "title": "計劃標題",
      "summary": "計劃摘要",
      "steps": [...]
    }
  }
}
```

### test-plan.json

由 Verifier Agent 生成，定義測試計劃：

```json
{
  "sessionId": "session-id",
  "sourceArchitectureFile": "architecture.json",
  "generatedAt": "2025-11-19T12:00:00Z",
  "testFiles": [
    {
      "id": "calculator-logic-unit",
      "filename": "calculator.logic.unit.test.js",
      "description": "計算機邏輯單元測試",
      "targetModule": "Calculator",
      "testLevel": "unit",
      "framework": "jest",
      "inputsType": "function",
      "importTarget": "../public/script",
      "cases": [
        {
          "caseId": "Calculator-addition-success",
          "name": "成功執行加法",
          "type": "normal",
          "preconditions": [],
          "inputs": {
            "firstOperand": 5,
            "secondOperand": 3,
            "operator": "+"
          },
          "expected": {
            "result": 8
          }
        }
      ]
    }
  ]
}
```

### test-report.json

由 Tester Agent 生成，包含測試執行結果：

```json
{
  "sessionId": "session-id",
  "generatedAt": "2025-11-19T14:45:09.426Z",
  "totals": {
    "files": 2,
    "tests": 10,
    "passed": 8,
    "failed": 2
  },
  "files": [
    {
      "filename": "calculator.logic.unit.test.js",
      "status": "failed",
      "passed": 2,
      "failed": 1,
      "assertions": [...]
    }
  ]
}
```

### error-report.json

包含失敗測試的詳細資訊：

```json
{
  "sessionId": "session-id",
  "generatedAt": "2025-11-19T14:45:09.426Z",
  "failures": [
    {
      "filename": "calculator.logic.unit.test.js",
      "title": "除以零應該回傳錯誤",
      "fullName": "Calculator 除以零應該回傳錯誤",
      "failureMessages": ["錯誤訊息"],
      "suggestedCause": "LLM 分析的失敗原因"
    }
  ]
}
```

## 代理詳細說明

### Architect Agent

**功能**：
- 分析用戶需求並生成系統架構
- 產生結構化的程式碼生成指令
- 自動推斷前端設計需求（UI/UX、佈局、樣式）

**輸出**：
- `data/sessions/<sessionId>/architecture.json`

**使用範例**：
```javascript
import ArchitectAgent from './agents/architect-agent.js';

const agent = new ArchitectAgent();
const plan = await agent.generatePlan({
  prompt: "生成計算機網站",
  context: { timestamp: new Date().toISOString() }
});
```

### Verifier Agent

**功能**：
- 讀取 `architecture.json`
- 使用 LLM 生成結構化的測試計劃
- 驗證測試計劃格式並輸出 `test-plan.json`

**輸出**：
- `data/sessions/<sessionId>/test-plan.json`

**使用範例**：
```javascript
import { runVerifierAgent } from './agents/verifier-agent.js';

const { plan, path } = await runVerifierAgent(sessionId);
console.log(`測試計劃已生成：${path}`);
```

### Tester Agent

**功能**：
- 讀取 `test-plan.json`
- 為每個測試檔案生成可執行的 Jest 測試碼
- 執行 Jest 測試並解析結果
- 對失敗案例進行 LLM 驅動的錯誤分析

**輸出**：
- `data/sessions/<sessionId>/generated-tests/*.test.js`
- `data/sessions/<sessionId>/jest-report.json`
- `data/sessions/<sessionId>/test-report.json`
- `data/sessions/<sessionId>/error-report.json`

**使用範例**：
```javascript
import TesterAgent from './agents/tester-agent.js';

const tester = new TesterAgent();
const { testReport, errorReport } = await tester.runTesterAgent(sessionId);
console.log(`測試通過：${testReport.totals.passed}/${testReport.totals.tests}`);
```

## 測試支援

### 測試類型

系統支援兩種測試類型：

1. **HTTP 測試**：使用 supertest 測試 API 端點
   ```javascript
   const request = require("supertest");
   const app = require("../src/app");
   const res = await request(app).post("/api/users").send({...});
   ```

2. **函數測試**：直接測試函數邏輯
   ```javascript
   const target = require("../public/script");
   const result = target.Calculator(5, 3, "+");
   expect(result).toBe(8);
   ```

### 測試層級

- **單元測試（unit）**：測試單一模組或函數
- **整合測試（integration）**：測試模組間的互動
- **端對端測試（e2e）**：測試完整的使用者流程

## 錯誤處理

系統採用分層錯誤處理機制：

1. **API 層級**：自動重試和故障轉移
2. **代理層級**：統一的錯誤格式和日誌記錄
3. **協調器層級**：錯誤聚合和用戶友好的錯誤訊息

### 錯誤類型

- `CoordinatorError`：協調器層級錯誤
- `AgentError`：代理層級錯誤
- `APIError`：API 呼叫錯誤

## 效能優化

### API 配置

- **超時時間**：預設 20 秒（可透過 `API_TIMEOUT` 調整）
- **重試次數**：預設 2 次（可透過 `API_MAX_RETRIES` 調整）
- **重試延遲**：預設 500 毫秒（可透過 `API_RETRY_DELAY` 調整）

### API 優先順序

系統預設優先使用 OpenAI API，提供更快的響應速度。若 OpenAI 不可用，自動切換至 Gemini API。

## 開發指南

### 新增代理

1. 建立代理類別，繼承 `BaseAgent`
2. 實作必要的抽象方法
3. 在 `Coordinator.js` 中註冊代理

### 擴展模板

在 `agents/templates.js` 中新增模板，並在對應的代理中使用。

### 自訂配置

透過環境變數或修改 `utils/config.js` 調整系統行為。

## 授權

本專案採用 MIT 授權條款。

## 貢獻

歡迎提交 Issue 和 Pull Request。

## 聯絡資訊

如有問題或建議，請透過 Issue 追蹤系統聯繫。
