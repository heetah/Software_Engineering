/**
 * templates.js
 *
 * 統一管理 Verifier Agent / Tester Agent 會用到的文字模板與格式描述。
 *
 * 分成三大區塊：
 * 1. 共用常數 / 說明
 * 2. Verifier Agent 用模板（產生測試計劃 test-plan.json）
 * 3. Tester Agent 用模板（產生 Jest 測試碼、錯誤分析、輸出格式）
 */

//
// ──────────────────────────────────────────────────────────────
// 1. 共用常數 / 說明
// ──────────────────────────────────────────────────────────────
//

/**
 * test-plan.json 的目標結構（給 Verifier Agent 與 Tester Agent 參考）
 * 此版已改為「真實測試版本 B」，所以 framework = "jest"，並輸出 .test.js 檔案。
 */
// ===== Test Plan Schema Description =====
// 描述 test-plan.json 的標準結構
// Version B：可轉成真實 Jest 測試碼
// 1. sessionId
// 2. sourceArchitectureFile
// 3. generatedAt
// 4. testFiles[]：每個 testFile 包含 id、filename、description、targetModule、testLevel、framework、inputsType、importTarget、cases[]
// 5. 每個 case 包含 caseId、name、type、preconditions、inputs、expected
// 6. inputs 根據 inputsType 決定結構（http 或 function）
// 7. expected 至少包含 statusCode / body / errorCode 等
// 詳細結構請參考下方 JSON 範例
export const TEST_PLAN_SCHEMA_DESCRIPTION = `
以下是測試計劃 test-plan.json 的標準結構（Version B：可轉成真實 Jest 測試碼）：

{
  "sessionId": "<string>",
  "sourceArchitectureFile": "architecture.json",
  "generatedAt": "<ISO8601 datetime>",
  "testFiles": [
    {
      "id": "<string>",
      "filename": "<string>.test.js",              // 必須是可執行的 Jest 檔案
      "description": "<string>",
      "targetModule": "<string>",                  // 例如 "UserService"
      "testLevel": "unit|integration|e2e",
      "framework": "jest",                         // 固定為 jest
      "inputsType": "http|function",               // ★ 新增：測試碼生成時需要知道是 HTTP 還是 function
      "importTarget": "<string>",                  // ★ 新增：例如 "../src/app" 或 "../src/services/user"
      "cases": [
        {
          "caseId": "<string>",
          "name": "<string>",
          "type": "normal|boundary|error|performance",
          "preconditions": ["<string>", "..."],
          "inputs": {                               // 依據 inputsType：
            // 若 inputsType=http → { "method": "POST", "path": "/users", "body": {...} }
            // 若 inputsType=function → 直接列參數
          },
          "expected": {
            // 至少應包含 statusCode / body / errorCode 等
          }
        }
      ]
    }
  ]
}
`;

//
// ──────────────────────────────────────────────────────────────
// 2. Verifier Agent 專用模板
//    - 用來產生 test-plan.json
// ──────────────────────────────────────────────────────────────
//

/**
 * Verifier Agent：澄清問題模板（通常不必動）
 */
// ===== Clarification Template =====
// 用於澄清問題與測試上下文整理
// 1. 關鍵不確定性
// 2. 架構理解摘要
// 3. 測試與資料假設
// 4. 環境與設定需求
// 5. 建議的後續動作
// 僅輸出 Markdown 內容
// 範例如下：
export const VERIFIER_CLARIFICATION_TEMPLATE = `# 澄清問題與測試上下文整理

請基於輸入的「架構 JSON」與「需求描述」，輸出條列且可執行決策的內容，並用 Markdown 分段：

## 1. 關鍵不確定性
- 列出阻塞產生測試計劃的前 5–10 個問題，具體指明 API / 模組

## 2. 架構理解摘要
- 條列主要模組與責任
- 條列 API / 方法的輸入輸出
- 標出需重點測試的邏輯與邊界條件

## 3. 測試與資料假設
- 需要的測試資料、邊界值、錯誤情境
- 若有不確定的假設請明確標示

## 4. 環境與設定需求
- 外部依賴、環境變數、金鑰需求
- 哪些會被 mock/stub

## 5. 建議的後續動作
- 指定如何補齊每項資訊

僅輸出 Markdown 內容。`;

/**
 * Verifier Agent：主要的 test-plan.json 輸出模板
 * ★ 已改寫成「會被 Tester Agent 轉成 Jest 程式碼」的格式
 */
// ===== Test Plan Output Template =====
// 指示 Verifier Agent 嚴格輸出合法 JSON 格式的 test-plan.json
// Version B：強調可被 Tester Agent 轉成 Jest 程式碼
// 禁止多餘文字、註解
// 僅輸出一個 json code block
// 範例如下：
export const VERIFIER_TEST_PLAN_OUTPUT_TEMPLATE = `## 輸出要求（Test Plan JSON）

請輸出一個 **嚴格合法的 \`\`\`json 區塊**，內容為 test-plan.json。

禁止：
- 多餘文字
- 多個 JSON 區塊
- 加註解，或在 JSON 外輸出內容

以下為示例與格式規則（請依據實際架構內容生成自己的版本）：

\`\`\`json
{
  "sessionId": "example-session-id",
  "sourceArchitectureFile": "architecture.json",
  "generatedAt": "2025-11-16T12:00:00Z",
  "testFiles": [
    {
      "id": "user-service-unit",
      "filename": "user-service.unit.test.js",
      "description": "UserService 的單元測試",
      "targetModule": "UserService",
      "testLevel": "unit",
      "framework": "jest",
      "inputsType": "http",
      "importTarget": "../src/app",
      "cases": [
        {
          "caseId": "UserService-createUser-success",
          "name": "成功建立使用者",
          "type": "normal",
          "preconditions": ["email 未被註冊"],
          "inputs": {
            "method": "POST",
            "path": "/users",
            "body": {
              "name": "Test User",
              "email": "test@example.com"
            }
          },
          "expected": {
            "statusCode": 201,
            "body": {
              "userId": "non-empty-string"
            }
          }
        },
        {
          "caseId": "UserService-createUser-duplicate",
          "name": "重複 email 應該回傳錯誤",
          "type": "error",
          "preconditions": ["email 已存在"],
          "inputs": {
            "method": "POST",
            "path": "/users",
            "body": {
              "name": "Test User",
              "email": "test@example.com"
            }
          },
          "expected": {
            "statusCode": 400,
            "errorCode": "EMAIL_ALREADY_EXISTS"
          }
        }
      ]
    }
  ]
}
\`\`\`
`;

/**
 * Verifier Agent：撰寫測試計劃時的補充原則
 * ★ 調整為 Version B：強調可被轉成 Jest 程式碼的資訊
 */
// ===== Test Plan Writing Tips =====
// 給 Verifier Agent 的撰寫提示
// Version B：強調可被 Tester Agent 轉成 Jest 程式碼
// 1. 必須包含 inputsType 與 importTarget
// 2. filename 必須以 .test.js 結尾
// 3. 每個 case 的 inputs 與 expected 必須清楚可解析
// 4. 禁止含糊的 expected（例如「預期成功」）
// 範例如下：
export const VERIFIER_TEST_PLAN_TIPS = `## 撰寫測試計劃提示（Version B：將轉成 Jest 測試碼）

你產生的是「測試計劃」，但 Tester Agent 會依此計劃生成真實的 Jest 程式碼。

因此每個測試檔案必須包含：

### 1. 最少必要欄位（不可缺）
- filename（必須以 \`.test.js\` 結尾）
- framework = "jest"
- inputsType = "http" 或 "function"
- importTarget：被測試模組的匯入路徑

### 2. 對每個案例（case）：
- 必須包含清楚可解析的 inputs 與 expected
- 若為 HTTP 測試：
  - inputs.method（GET/POST/PUT/DELETE）
  - inputs.path（例如 "/users"）
  - inputs.body（如果方法需要）
- 若為 function 測試：
  - inputs 內直接列 function 參數

### 3. 覆蓋範圍
- 每個主要模組至少 1 個 testFile
- 每個 API 至少：
  - 1 normal case
  - 1 error case
  -（若可）加入 boundary case

### 禁止
- describe/it/expect 等程式碼（這是 Tester Agent 的工作）
- 含糊的 expected，例如「預期成功」沒有明確欄位

目標：test-plan.json 要能 100% 被 Tester Agent 轉換為可執行的 Jest 測試碼。
`;

//
// ──────────────────────────────────────────────────────────────
// 3. Tester Agent 專用模板（Version B）
// ──────────────────────────────────────────────────────────────
//

/**
 * Tester Agent：呼叫 LLM 生成「可執行 Jest 測試碼」的模板
 */
// ===== Code Generation Prompt Template =====
// 指示 Tester Agent 產生可執行的 Jest 測試碼
// 根據 testFile 物件內容生成
// 僅輸出一個 javascript code block
// 範例如下：
export const TESTER_CODEGEN_PROMPT_TEMPLATE = `
你是一位資深自動化測試工程師，負責根據 test-plan.json 中的資訊，產生 **可直接執行的 Jest 測試程式碼**。

【輸入】
我會提供給你 testFile 物件，其中包含：
- filename
- targetModule
- testLevel
- inputsType ("http" or "function")
- importTarget
- cases[]

【輸出要求】
- 僅輸出一個 \`\`\`javascript 區塊
- 嚴格可執行的 Jest 測試碼
- 不需註解、不需多餘說明

【若 inputsType = http】
- 請使用 supertest，例如：
  \`const request = require("supertest");\`
- 匯入 app：
  \`const app = require("<importTarget>");\`

【若 inputsType = function】
- 匯入方式：
  \`const target = require("<importTarget>");\`
- 測試方式：
  \`const result = target.<method>(...inputs);\`

【每個 case 的 expect 規則】
- 若 expected.statusCode 存在 → 檢查 response.statusCode
- 若 expected.body 存在 → 對應檢查 response.body
- 若 expected.errorCode 存在 → 檢查 response.body.errorCode

請務必產生語法正確、可執行的 Jest 測試碼。
`;

/**
 * Tester Agent：錯誤分析（交給 LLM 用）
 */
// ===== Error Analysis Template =====
// 用於分析測試失敗的原因
// 1. 檔案名稱
// 2. 模組名稱
// 3. 案例 ID
// 4. 名稱
// 5. 錯誤訊息
// 6. 堆疊
// 輸出 1–2 個最可能原因的條列清單
// 範例如下：
export const TESTER_ERROR_ANALYSIS_TEMPLATE = `
你是一個測試錯誤分析器。請根據錯誤資訊推斷最可能原因。

- 檔案：{{filename}}
- 模組：{{targetModule}}
- 案例 ID：{{caseId}}
- 名稱：{{name}}
- 錯誤訊息：{{errorMessage}}
- 堆疊：{{stack}}

請條列 1–2 個最可能原因。
`;

/**
 * Tester Agent：Markdown 測試報告格式
 */
// ===== Test Report Markdown Template =====
// 指示 Tester Agent 產生測試報告的 Markdown 格式
// 包含總結、依模組統計、失敗案例
// 僅輸出 Markdown 內容
// 範例如下：
export const TESTER_REPORT_MARKDOWN_TEMPLATE = `# 測試結果報告

請根據 JSON 測試結果產生 Markdown：

## 總結
- 總測試：...
- 通過：...
- 失敗：...
- 通過率：...

## 依模組統計
- UserService：通過 X / 失敗 Y
- AuthService：通過 X / 失敗 Y

## 失敗案例
- [UserService] createUser duplicate
  - 檔案：user-service.unit.test.js
  - 錯誤：Expected statusCode 400 but got 500

僅輸出 Markdown。
`;
