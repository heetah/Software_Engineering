#  Multi-Agent AI Copilot

> 一個由大型語言模型驅動的智能專案生成系統，採用多代理架構自動化完成從需求分析到程式碼生成的完整流程。

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)

## 功能特色

- **多代理協作** - 五個專業 AI 代理分工合作，各司其職
- **RAG 知識引擎** - 整合 LlamaIndex，從歷史專案中學習並優化生成
- **智能契約驗證** - 自動驗證程式碼契約一致性，雙層修復機制
- **視覺分析** - 支援螢幕截圖分析與 Google Lens 以圖搜圖
- **Neumorphism UI** - 優雅的新擬態設計，支援深色/淺色主題
- **一鍵生成** - 從需求描述到完整專案，全自動化生成
- **智能測試** - 自動生成測試計劃並執行驗證
- **專案庫管理** - 卡片式佈局，輕鬆管理與預覽歷史專案
- **多 API 支援** - 支援 OpenAI 和 Gemini，自動故障轉移
- **新手教學系統** - 互動式教學，快速上手所有功能

## 界面預覽

應用程式採用現代化的 Neumorphism 設計風格，配合 SVG 圖標系統，提供優雅且直觀的使用體驗。

### 應用程式演示

<table>
  <tr>
    <td width="50%">
      <img src=".github/assets/chat-interface.png" alt="聊天介面">
      <p align="center"><b>智能對話介面</b></p>
    </td>
    <td width="50%">
      <img src=".github/assets/project-library.png" alt="專案庫">
      <p align="center"><b>專案庫管理</b></p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src=".github/assets/generating.gif" alt="程式碼生成">
      <p align="center"><b>程式碼生成過程</b></p>
    </td>
    <td width="50%">
      <img src=".github/assets/settings.png" alt="設定頁面">
      <p align="center"><b>設定與配置</b></p>
    </td>
  </tr>
</table>

### 主要特色
- **新手教學** - 互動式教學系統，ESC 關閉，點擊背景關閉
- **智能對話** - 支援專案生成與一般問答雙模式
- **視覺分析** - 螢幕截圖分析與 Google Lens 搜圖
- **專案庫** - 卡片式佈局，時間排序，輕鬆管理歷史專案
- **即時反饋** - 顯示各代理執行狀態與進度
- **靈活設定** - 自訂 API、模型、溫度等參數

## 系統架構

### 核心代理

系統由五個核心 AI 代理組成，並整合 RAG 知識引擎與契約驗證系統，協同完成專案生成：

```
┌─────────────────┐
│  Vision         │  分析螢幕截圖，理解視覺需求
│  Agent          │  支援 Google Lens 搜圖
└────────┬────────┘
         ↓
┌─────────────────┐     ┌──────────────┐
│  Architect      │────→│ RAG Engine   │  從歷史專案學習
│  Agent          │←────│ LlamaIndex   │  優化架構設計
│                 │     └──────────────┘
│  輸出: architecture.json
└────────┬────────┘
         ↓
┌─────────────────┐
│  Coder          │  根據架構生成程式碼
│  Coordinator    │  協調多個 Worker Agent
│                 │  輸出: 完整專案檔案
└────────┬────────┘
         ↓
┌─────────────────┐
│  Contract       │  契約驗證與自動修復
│  Validator +    │  雙層修復：程式化 + AI
│  Auto Fixer     │  確保程式碼一致性
└────────┬────────┘
         ↓
┌─────────────────┐
│  Verifier       │  生成測試計劃
│  Agent          │  輸出: test-plan.json
└────────┬────────┘
         ↓
┌─────────────────┐
│  Tester         │  執行測試並生成報告
│  Agent          │  輸出: 測試報告
└─────────────────┘
```

### 1. **Vision Agent** - 視覺分析代理
- **螢幕截圖分析** - 使用 GPT-4 Vision 或 Gemini Vision 分析畫面
- **Google Lens 整合** - 支援以圖搜圖功能
- **視覺需求轉換** - 將視覺內容轉換為專案需求

### 2. **Architect Agent** - 架構設計師
- **需求分析與架構設計** - 分析用戶需求並生成系統架構
- **RAG 知識整合** - 從歷史專案中學習並優化設計
- **輸出結構化 `architecture.json`** - 包含完整的程式碼生成指令
- **智能模式切換** - 自動區分專案生成與單純問答模式

### 3. **Coder Coordinator** - 程式碼協調器
- **多層次檔案生成** - 協調 Markup、Script、Style、Python、System 等 Worker Agent
- **技術棧支援** - HTML/CSS/JavaScript、Python、配置檔案等
- **契約提取** - 自動提取函數簽名、類別定義等契約資訊
- **RAG 索引** - 將生成的專案加入知識庫供未來參考

### 4. **Contract Validator & Auto Fixer** - 契約驗證與修復
- **雙層修復機制** - 程式化快速修復 + AI 深度分析修復
- **契約一致性驗證** - 檢查函數呼叫、import、參數等是否一致
- **自動修復** - 自動修正契約不一致問題
- **詳細報告** - 生成修復前後的對比報告

### 5. **Verifier Agent** - 驗證代理
- **解析架構並生成測試計劃**
- **輸出標準化的 `test-plan.json`**
- **定義測試案例和預期結果**

### 6. **Tester Agent** - 測試代理
- **根據測試計劃生成 Jest 測試碼**
- **自動執行測試並生成報告**
- **提供失敗案例的錯誤分析**

## 專案結構

```
Software_Engineering/
├── dev_page/                    # Electron 前端介面
│   ├── icons/                      # SVG 圖標庫
│   │   ├── info.svg               # 資訊圖標
│   │   ├── refresh.svg            # 刷新圖標
│   │   └── ...                    # 其他圖標
│   ├── icons.css                  # 圖標樣式系統
│   ├── icon-helper.js             # 圖標輔助函數
│   ├── main-window.html           # 主視窗 HTML
│   ├── main-window.js             # 渲染器進程腳本
│   └── style.css                  # Neumorphism 樣式
│
├── agents/                      # 多代理系統核心
│   ├── agent-base.js              # 代理基礎類別
│   ├── architect-agent.js         # 架構代理（整合 RAG）
│   ├── verifier-agent.js          # 驗證代理
│   ├── tester-agent.js            # 測試代理
│   ├── instruction-service.js     # 會話管理服務
│   ├── project-writer.js          # 專案檔案寫入器
│   ├── templates.js               # 提示模板中心
│   ├── contract-validator.js      # 契約驗證器
│   ├── contract-auto-fixer.js     # 契約自動修復（程式化）
│   ├── contract-repair-agent.js   # 契約修復代理（AI 驅動）
│   │
│   ├── vision-agent/              # 視覺分析代理
│   │   ├── capture-window.html    # 截圖視窗介面
│   │   └── index.js               # Vision API 整合
│   │
│   ├── coder-agent/               # 程式碼生成代理
│   │   ├── coordinator.cjs        # Coder 協調器
│   │   ├── config-generator.js    # 配置生成器
│   │   ├── contracts-extractor.js # 契約提取器
│   │   └── processor.js           # 檔案處理器
│   │
│   ├── worker-agents/             # 工作代理集合
│   │   ├── markup-agent/          # HTML/Markdown 生成
│   │   ├── script-agent/          # JavaScript 生成
│   │   ├── style-agent/           # CSS/SCSS 生成
│   │   ├── python-agent/          # Python 代碼生成
│   │   └── system-agent/          # 系統檔案生成
│   │
│   ├── rag-engine/                # RAG 知識引擎
│   │   ├── index.js               # RAG 引擎主檔案
│   │   └── [知識庫目錄]/           # 歷史專案向量索引
│   │
│   └── shared/                    # 共用模組
│       ├── api-standards.cjs      # API 標準規範
│       ├── errors.cjs             # 錯誤定義
│       ├── logger.cjs             # 日誌記錄器
│       └── dom-validator.cjs      # DOM 驗證工具
│
├── services/                    # 外部服務整合
│   └── gemini.js                  # Gemini API 服務
│
├── utils/                       # 工具模組
│   ├── api-provider-manager.js    # API 提供者管理
│   ├── config.js                  # 配置管理
│   ├── error-handler.js           # 錯誤處理
│   ├── token-tracker.js           # Token 追蹤器
│   └── errors.js                  # 錯誤類型定義
│
├── data/                        # 資料儲存
│   └── sessions/                  # 會話資料
│       └── <sessionId>/           # 每個會話的獨立目錄
│           ├── architecture.json  # 專案架構
│           ├── test-plan.json     # 測試計劃
│           ├── generated-tests/   # 生成的測試檔案
│           └── test-report.json   # 測試報告
│
├── output/                      # 生成的專案輸出
│   └── <sessionId>/               # 每個會話生成的專案
│
├── circle-to-search/            # Google Lens 以圖搜圖功能
│   ├── circle-selector.html       # 圖片選取介面
│   └── lens-search.js             # Lens API 整合
│
├── Coordinator.js                 # 主協調器
├── main.js                        # Electron 主程式
├── main-window.html               # 主視窗 HTML
├── main-window.js                 # 主視窗渲染器腳本
└── style.css                      # 全域樣式表
```

## 快速開始

### 環境需求

- Node.js >= 18.0.0
- npm 或 yarn

### 安裝

```bash
# 克隆專案
git clone https://github.com/yourusername/multi-agent-copilot.git
cd multi-agent-copilot

# 安裝依賴
npm install
```

### 配置

建立 `.env` 檔案並配置 API 金鑰：

```env
# OPENAI_API_KEY=your_openai_api_key
# GOOGLE_API_KEY=your_google_api_key
```

### 啟動應用

```bash
# 啟動 Electron 應用程式
npm start
```

### 使用方式

1. **輸入需求** - 在聊天介面中用自然語言描述您的專案需求
   ```
   例如：「生成一個計算機網站，要有加減乘除功能」
   ```

3. **自動生成** - 系統自動執行所有代理完成專案
   - Architect Agent 設計架構
   - RAG Engine 檢索相關知識
   - Coder Coordinator 生成程式碼
   - Contract Validator 驗證並修復契約
   - Verifier Agent 生成測試計劃
   - Tester Agent 執行測試

4. **下載專案** - 生成完成後，點擊下載按鈕獲取壓縮檔

5. **管理專案** - 在專案庫中查看、預覽、管理所有生成的專案
   - 按時間排序（最新/最舊）
   - 卡片式預覽
   - 一鍵開啟專案目錄或預覽 HTML

## UI 設計特色

### Neumorphism 風格

應用程式採用新擬態（Neumorphism）設計風格：

- **柔和陰影** - 營造立體感和深度
- **幾何簡潔** - 清晰的形狀和佈局
- **微互動** - 細膩的懸停和點擊效果
- **雙主題** - 支援淺色和深色模式

### SVG 圖標系統

統一的圖標設計語言：

- 可縮放矢量圖形，任何解析度都清晰
- CSS 可控顏色，完美適配主題
- 簡潔線條風格，符合 Neumorphism 美學
- 內嵌 SVG，無需額外載入時間

查看 [`dev_page/icons/README.md`](dev_page/icons/README.md) 了解圖標系統詳情。

## RAG 知識引擎

### LlamaIndex 整合

系統整合 LlamaIndex 作為 RAG（Retrieval Augmented Generation）引擎：

- **向量索引** - 使用 OpenAI Embeddings 建立專案向量索引
- **語義搜尋** - 根據用戶需求檢索相關歷史專案
- **知識累積** - 每次生成的專案自動加入知識庫
- **智能參考** - Architect Agent 從相似專案中學習

### 知識庫結構

```
agents/rag-engine/
├── index.js                    # RAG 引擎核心
├── calculator_website/         # 範例專案索引
├── notepad/                    # 範例專案索引
└── [新專案]/                   # 動態新增
```

每個專案目錄包含：
- 原始程式碼檔案
- 向量索引資料
- 專案 metadata

## 契約驗證與修復系統

### 雙層修復機制

系統採用兩階段契約修復策略：

**第一層：程式化快速修復**
- `ContractValidator` - 驗證函數呼叫、import、參數等
- `ContractAutoFixer` - 自動修正簡單的契約不一致
- 快速、可靠、無需 API 呼叫

**第二層：AI 深度修復**
- `ContractRepairAgent` - 使用 Gemini 分析複雜問題
- 語義理解修復邏輯錯誤
- 生成詳細的修復報告

### 驗證項目

1. **函數契約**
   - 函數定義與呼叫一致性
   - 參數數量與類型檢查
   - 返回值驗證

2. **模組契約**
   - Import/Export 一致性
   - 模組名稱正確性
   - 路徑解析驗證

3. **DOM 契約**（針對前端專案）
   - HTML 元素 ID 存在性
   - 事件監聽器綁定檢查
   - CSS 選擇器有效性

詳見：[`CONTRACT_VALIDATION_README.md`](CONTRACT_VALIDATION_README.md)

## 視覺分析功能

### 螢幕截圖分析

支援使用 Vision API 分析螢幕截圖：

1. **啟動截圖** - 快捷鍵或介面按鈕啟動截圖工具
2. **框選區域** - 使用圓形選取工具框選目標區域
3. **AI 分析** - GPT-4 Vision 或 Gemini Vision 分析畫面
4. **需求轉換** - 自動將視覺內容轉換為專案需求描述

### Google Lens 搜圖

整合 Google Lens 以圖搜圖功能：

- 截圖後可選擇使用 Google Lens 搜尋
- 自動開啟瀏覽器進行圖片搜尋
- 適合尋找參考設計或 UI 靈感

相關檔案：
- `agents/vision-agent/index.js`
- `agents/vision-agent/capture-window.html`
- `circle-to-search/circle-selector.html`

## 資料格式

### architecture.json

架構代理生成的專案架構：

```json
{
  "id": "session-id",
  "createdAt": "2025-12-13T06:00:00.000Z",
  "prompt": "生成計算機網站",
  "output": {
    "coder_instructions": {
      "role": "Coder Agent",
      "summary": "建立一個簡單的計算機網站",
      "directives": ["使用 HTML5", "CSS3 樣式", "原生 JavaScript"],
      "files": [
        {"path": "index.html", "description": "主頁面"},
        {"path": "style.css", "description": "樣式表"},
        {"path": "script.js", "description": "計算邏輯"}
      ]
    }
  }
}
```

### test-plan.json

驗證代理生成的測試計劃：

```json
{
  "sessionId": "session-id",
  "generatedAt": "2025-12-13T06:05:00.000Z",
  "testFiles": [
    {
      "filename": "calculator.unit.test.js",
      "testLevel": "unit",
      "framework": "jest",
      "cases": [
        {
          "caseId": "add-success",
          "name": "加法運算測試",
          "inputs": {"a": 5, "b": 3, "op": "+"},
          "expected": {"result": 8}
        }
      ]
    }
  ]
}
```

## 進階使用

### RAG 知識庫配置

在 `.env` 檔案中配置 OpenAI API（用於 embeddings）：

```env
OPENAI_API_KEY=your_openai_api_key
```

系統會自動：
1. 為每個生成的專案建立向量索引
2. 在 `agents/rag-engine/` 目錄下儲存索引
3. 未來生成時自動檢索相關知識

### 視覺分析模式

支援兩種視覺分析提供者：

**GPT-4 Vision**
```env
OPENAI_API_KEY=your_openai_api_key
# 在設定中選擇 OpenAI 作為主要提供者
```

**Gemini Vision**
```env
GOOGLE_API_KEY=your_google_api_key
# 在設定中選擇 Gemini 作為主要提供者
```

### 命令列執行

```bash
node Coordinator.js "生成待辦事項應用程式"
```

### 程式化呼叫

```javascript
import { runWithInstructionService, initializeAgents } from './Coordinator.js';

const agents = initializeAgents();
const plan = await runWithInstructionService("生成計算機網站", agents);
console.log(`Session ID: ${plan.id}`);
```

### 自訂代理溫度

不同代理使用不同的溫度參數：

- **Architect**: 0.3 - 保持創意但結構化
- **Coder**: 0.2 - 精確的程式碼生成
- **Tester**: 0.1 - 嚴格的測試邏輯

可透過 `.env` 檔案調整。

## 契約驗證配置

契約驗證系統預設啟用，會在程式碼生成後自動執行：

1. **程式化驗證** - 使用抽象語法樹（AST）分析
2. **快速修復** - 自動修正簡單問題
3. **AI 修復** - 複雜問題使用 Gemini 深度分析
4. **報告生成** - 詳細的驗證與修復報告

若要查看詳細驗證報告，請檢查控制台輸出或生成的 session 目錄。

## 測試支援

### 測試類型

1. **函數測試** - 直接測試函數邏輯
   ```javascript
   const result = Calculator(5, 3, "+");
   expect(result).toBe(8);
   ```

2. **HTTP 測試** - 使用 supertest 測試 API
   ```javascript
   const res = await request(app).post("/api/calculate").send({...});
   expect(res.status).toBe(200);
   ```

### 測試層級

- **單元測試 (unit)** - 測試單一模組
- **整合測試 (integration)** - 測試模組互動
- **端對端測試 (e2e)** - 測試完整流程

## 錯誤處理

多層錯誤處理機制：

1. **API 層級** - 自動重試和故障轉移
2. **代理層級** - 統一錯誤格式和日誌
3. **協調器層級** - 用戶友好的錯誤訊息

### 錯誤類型

- `CoordinatorError` - 協調器錯誤
- `AgentError` - 代理執行錯誤
- `APIError` - API 呼叫錯誤

## 效能優化

### API 配置

- **超時**: 20 秒（可調整）
- **重試**: 2 次
- **延遲**: 500ms

### API 優先順序與故障轉移

系統支援自動 API 故障轉移：

1. **優先使用 Gemini** - 若配置了 GOOGLE_API_KEY
2. **自動切換 OpenAI** - Gemini 失敗時切換至 OpenAI
3. **手動選擇** - 在設定頁面手動選擇優先提供者

### 專案庫管理

所有生成的專案自動儲存至 `output/` 目錄：

- 專案庫自動掃描 `output/` 目錄
- 支援時間排序（最新/最舊）
- 預覽功能自動尋找 `index.html`
- 一鍵開啟專案資料夾

專案 metadata 儲存於 `.project-meta.json`，包含：
- 專案標題
- 用戶需求描述
- 建立時間

## 開發指南

### 新增代理

1. 建立類別，繼承 `BaseAgent`
2. 實作必要方法
3. 在 `Coordinator.js` 註冊

### 擴展模板

在 `agents/templates.js` 添加新模板。

### 自訂配置

透過 `.env` 或 `utils/config.js` 調整系統行為。

---

