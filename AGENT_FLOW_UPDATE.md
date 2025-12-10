# Agent 流程更新說明

## 更新時間
2025-12-10

## 更新內容

### 1. Verifier Agent 流程更新

**執行步驟：**
1. 讀取架構資料 (architecture.json)
2. 驗證檔案完整性（檢查缺失/存在的檔案）
3. 生成測試計畫（使用 LLM，可能不完全準確）
4. 生成驗證報告

**重要提示：**
- 測試計畫品質取決於 LLM，可能有錯誤（如 `Needs exports: No` 實際應該是 Yes）
- 後續的 Tester Agent 會自動修正這些問題

---

### 2. Tester Agent 流程更新

**執行步驟：**
1. 讀取架構和測試計畫
2. **生成測試檔案（整合 Phase 2 + Phase 3）**
   - Phase 3：智能偵測並導出函數/變數（不依賴測試計畫）
   - Phase 2：驗證並修復語法錯誤
   - 所有源碼檔案都會被 patch 到 `patched/` 目錄
3. **執行 Jest 測試（整合 Phase 2 預檢）**
   - Phase 2：預檢驗證（語法、依賴、polyfills）
   - 自動安裝缺失的 npm 套件
   - 自動加入必要的 polyfills
4. 生成測試報告
5. 顯示測試統計

---

## Phase 2 改進（依賴分析與自動修復）

### 功能：

1. **`validateAndFixSyntax(code, fileName)`**
   - 驗證 JavaScript 語法
   - 自動修復常見錯誤（缺少 `});`、多餘的分號等）
   - 在 `generateJestTests()` 中對 patched 檔案自動執行

2. **`analyzeTestDependencies(testCode)`**
   - 分析測試需要的 npm 套件（如 supertest, express）
   - 分析需要的 polyfills（如 TextEncoder, setImmediate）

3. **`ensureTestDependencies(sessionId, testCodes)`**
   - 自動安裝缺失的 npm 套件
   - 自動將 polyfills 加入 `jest.setup.cjs`

4. **`preTestValidation(sessionId)`**
   - 測試執行前的完整預檢
   - 整合語法驗證、依賴安裝、polyfill 配置

### 執行時機：
- `generateJestTests()` 中，每個檔案 patch 後自動執行語法驗證
- `runJestTests()` 執行前自動執行預檢

---

## Phase 3 改進（智能 Export 偵測）

### 功能：

1. **`detectExportableFunctions(sourceCode)`**
   - 自動偵測可導出的函數（function declarations, arrow functions）
   - 偵測 Express `app` 和 HTTP `server`
   - 偵測 `initializeEventListeners`（Phase 1 生成的）
   - 檢查是否已有 `module.exports`

2. **`generateExportsCode(exportInfo, options)`**
   - 智能生成 `module.exports` 程式碼
   - 如果已有 exports 則跳過（避免重複）
   - 支援強制導出 `app`（用於 Express server）

3. **改進 `patchSourceCode(sourceCode, analysis)`**
   - 不再只依賴測試計畫的 `needsExports` 判斷
   - 自動偵測所有可導出的項目
   - 即使測試計畫說 `Needs exports: No`，也會智能判斷並加入必要的 exports

4. **改進 `generateJestTests(sessionId, mapping, agent)`**
   - 現在**總是**會進行源碼修補（不再檢查 `needsExports` 條件）
   - 確保所有 JS 檔案都會被 patch 到 `patched/` 目錄
   - 每個檔案 patch 後會自動執行語法驗證和修復

### 執行流程：
```
原始碼 (output/)
  ↓
patchSourceCode() 
  → Phase 1: 提取 DOM 初始化
  → Phase 1: 包裝 server.listen()
  → Phase 3: 智能偵測可導出項目
  → Phase 3: 生成 module.exports
  ↓
validateAndFixSyntax() (Phase 2)
  → 驗證語法
  → 自動修復錯誤
  ↓
寫入 patched/ 目錄
```

---

## 處理的問題

### 問題 1：LLM 生成的測試計畫不準確
**解決方案：** Phase 3 不依賴測試計畫，直接分析源碼

**範例：**
- 測試計畫說：`Needs exports: No`
- Phase 3 發現：源碼有 `const app = express()`
- 自動加入：`module.exports = { app };`

### 問題 2：Patched 檔案有語法錯誤
**解決方案：** Phase 2 在 patch 後自動驗證和修復

**範例：**
- Patched 程式碼有多餘的 `})`
- Phase 2 自動偵測並移除
- 確保測試可以正常執行

### 問題 3：測試缺少依賴或 polyfills
**解決方案：** Phase 2 預檢自動安裝和配置

**範例：**
- 測試需要 `supertest`，但未安裝
- Phase 2 自動執行 `npm install supertest`
- 測試需要 `TextEncoder`
- Phase 2 自動加入到 `jest.setup.cjs`

---

## 使用方式

### 正常流程（通過 Coordinator）
```bash
node Coordinator.js "你的專案需求"
```

Coordinator 會自動依序執行：
1. Architect Agent
2. Coder Agent
3. **Verifier Agent** → 生成測試計畫
4. **Tester Agent** → 生成測試、修補源碼、執行測試

### 單獨執行 Tester Agent
```bash
node agents/tester-agent.js <sessionId>
```

### 單獨執行 Verifier Agent
```bash
node agents/verifier-agent.js <sessionId>
```

---

## 輸出結果

### Session 目錄結構
```
data/sessions/<sessionId>/
├── architecture.json          # 架構資料
├── verify_report.md          # Verifier Agent 報告
├── test_report.md            # Tester Agent 報告
├── *_testplan.md             # 測試計畫（LLM 生成）
├── jest.config.cjs           # Jest 配置
├── jest.setup.cjs            # Jest setup（含 polyfills）
├── package.json              # 測試依賴
├── patched/                  # 修補後的源碼
│   ├── script.js            # ✅ 已加入 exports，語法已修復
│   └── server.js            # ✅ 已加入 exports，listen() 已包裝
└── __tests__/               # 測試檔案
    ├── script.test.js
    └── server.test.js
```

---

## 預期改進效果

### 測試成功率提升
- **之前**：測試計畫錯誤 → exports 缺失 → 測試無法執行 → 0% 通過
- **現在**：智能 exports → 語法修復 → 依賴自動安裝 → 大幅提升通過率

### 範例結果（Session f1392e67）
- script.test.js: 3/5 通過（60%）
- 失敗的 2 個是測試設計問題，不是源碼問題
- patched/script.js: ✅ 語法正確，exports 完整
- patched/server.js: ✅ 語法正確，exports 完整

---

## 技術細節

### 智能偵測的函數類型
- `function name() {}`
- `const name = function() {}`
- `const name = () => {}`
- `const name = async () => {}`
- `const app = express()`
- `const server = http.createServer()`

### 自動修復的語法錯誤
- 缺少 `});` 或 `})`
- 多餘的分號 `;;`
- 未閉合的字串引號
- 未閉合的括號/大括號

### 自動安裝的依賴
- npm 套件：通過分析 `require('...')` 和 `import ... from '...'`
- polyfills：TextEncoder, TextDecoder, setImmediate 等

---

## 已知限制

1. **複雜語法錯誤無法自動修復**
   - 例如：邏輯錯誤、變數未定義
   - 會記錄警告但不影響流程

2. **測試設計問題無法自動修正**
   - 例如：訪問內部屬性 `button._events`
   - 需要手動修改測試檔案

3. **僅支援 CommonJS 和簡單 ESM**
   - 複雜的模組系統可能需要額外配置

---

## 後續改進方向

1. **測試設計自動修正**（Phase 4？）
   - 偵測並修復常見的測試設計問題
   - 例如：用 `jest.spyOn` 替代訪問 `_events`

2. **更智能的語法修復**
   - 使用 AST 解析而非正則表達式
   - 更精確的錯誤定位和修復

3. **測試計畫品質評估**
   - 自動評估 LLM 生成的測試計畫品質
   - 提供修正建議或自動重新生成

---

## 總結

Phase 2 和 Phase 3 的整合大幅提升了系統的穩健性：
- ✅ 不再依賴不可靠的 LLM 測試計畫
- ✅ 自動修復常見的語法錯誤
- ✅ 自動處理依賴和環境配置
- ✅ 提高測試成功率和程式碼品質

系統現在能夠**自動處理 LLM 生成的低品質程式碼和測試計畫**，顯著減少手動介入的需求。
