# AI Copilot Multi-Agents Application

## 應用程式說明

- **名稱**：AI Copilot Multi-Agents Application
- **功能**：協助使用者生成完整專案、電腦版 Circle to Search 搜尋

## 啟動步驟

1. 下載完整檔案，若沒包含 `node_modules/`，則在主資料夾的終端機中輸入 `npm install`
2. 在 `.env.example` 中輸入自己的 OpenAI 或 Gemini API KEY，並且將檔案名稱改為 `.env`
3. 於主資料夾中輸入 `npm start`

## 結果讀取

1. 輸入使用者需求後，系統會在主資料夾中生成新的資料夾 `output/`
2. 其中的 `output/public/` 底下的檔案便是所有前後端檔案

## 架構說明

### 主資料夾結構

```
agents/
├── coder-agent/
│   ├── config-generator.js      # config 檔案生成器，會自動生成 config.js（前後端）、config.py
│   ├── coordinator.cjs          # Coder 協調器，共分四階段生成
│   ├── dependency-analyzer.js   # 分析檔案之間的依賴關係，執行拓樸排序決定生成順序
│   ├── processor.js             # 生成 status.html 用於察看結果
│   └── server.js                # 提供 /api/coder/submit 端點，接收 Architect payload，呼叫 coordinator 生成檔案，並返回生成結果
│
generators/
├── base-generator.js            # 生成器的 base 基底，提供通用方法（e.g. 確保 meta 標籤）
├── basic-generator.js           # 基本生成器，生成基本的 HTML/CSS/JS 模板，處理 TODO 註釋，並確保基本結構完整性
└── index.js                     # 生成器入口，管理多個生成器，並能根據關鍵字自動選擇生成器
│
shared/
├── api-standard.cjs             # API 生成強制規範，定義前後端 API 及必須生成的 config 格式
├── api-standard.js              # 同上
├── errors.cjs                   # 標準化錯誤回應，定義錯誤代碼
├── errors.js                    # 同上
├── file-type-config.cjs         # 定義支援的檔案副檔名，映射檔案類型到對應的 worker agent
├── file-type-config.js          # 同上
├── logger.cjs                   # 結構化 log 輸出，支援 request id 追蹤
└── logger.js                    # 同上
│
vision-agent/
├── controllers/                 # 驗證 coder_instructions 格式，轉發到 coder agent 進行檔案生成，並生成狀態檔案
└── server.js                    # 提供 /api/vision/analyze 端點
│
worker-agents/
├── markup-agent/                # 處理 HTML/XML/Markdown
├── python-agent/                # 處理 Python
├── script-agent/                # 處理 JavaScript/TypeScript
├── style-agent/                 # 處理 CSS/SCSS/SASS
├── system-agent/                # 處理 C/C++/Go/Rust/Java/C#
└── api-adapter.js               # 自動偵測 API 類型，並統一 API 呼叫介面
│
dev_page/
├── scss/style.scss              # 主視窗樣式設計
├── main-window.html             # App 主視窗，聊天介面結構，對話歷史列表
├── main-window.js               # 主視窗渲染、事件監聽、IPC 通訊、對話管理
└── style.css                    # 主視窗樣式設計
│
utils/
├── config.js                    # 統一 config 管理，讀取環境變數，API 配置，Agent 配置（temperature、maxTokens）、log 配置
├── error-handler.js             # 錯誤處理工具，處理 API 錯誤
├── error.js                     # 定義錯誤類別
└── token-tracker.js             # token 使用追蹤
```

### Coder 協調器階段說明

`coordinator.cjs` 共分四階段生成：

- **Phase0**：自動生成 config
- **Phase1**：生成骨架
- **Phase2**：dependency 生成細節
- **Phase3**：組裝最終成果

### 根目錄檔案

- `agents-base.js`：所有 agent 的 base，統一錯誤處理、輸出檔案儲存
- `architect-agent.js`：Architect Agent 的主要 js 檔案，生成 `coder_instruction.json`
- `instruction-service.js`：管理 session 生命週期、處理檔案操作、呼叫 Architect Agent 生成計畫
- `project-writer.js`：解析 markdown 格式的代碼輸出，並將區塊寫入對應檔案
- `templates.js`：提供回應模板，定義標準化輸出格式
- `tester-agent.js`：待實作
- `verifier-agent.js`：待實作
- `Coordinator.js`：用於統整並傳送 agents 間的資訊
- `main.js`：Electron 主入口