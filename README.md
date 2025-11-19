# 🧪 LLM 驅動自動化測試系統（Version B）
## Verified Agent + Tester Agent（Jest 測試碼生成與執行）

本專案實作一套由 LLM 驅動的全自動化測試生成系統，由兩個核心 Agent 組成：
1. Verified Agent：解析架構並產生測試計劃（test-plan.json）
2. Tester Agent（Version B）：依 test-plan.json 生成可執行 Jest 測試碼並執行測試

##### 目前 Verified Agent 與 Tester Agent 第一版已完成。

# 📦 系統流程架構: 
```
      Architect Agent
            ↓
      architecture.json
            ↓
      Verified Agent
            ↓  使用 templates.js（Verified 區塊）
      產生 test-plan.json
            ↓
      Tester Agent（Version B）
            ↓  使用 templates.js（Tester 區塊）
      生成 *.test.js（真實可執行測試）
            ↓
      執行 Jest
            ↓
      test-report.json
      error-report.json
```

# 📁 專案資料夾結構（重點）
```
      /agent
        verified-agent.js
        tester-agent.js
        templates.js

      /data/sessions/<sessionId>/
        architecture.json
        test-plan.json
        generated-tests/
            *.test.js
        jest-report.json
        test-report.json
        error-report.json

```
# 🧩 templates.js（模板中心）

## templates.js 將所有 Agent 共享的模板集中管理，分成三大區塊：

1. 共用（Shared）
```
TEST_PLAN_SCHEMA_DESCRIPTION
```
test-plan.json 的標準格式說明。

2. Verified Agent Templates
用以產生 test-plan.json，包括：
```
VERIFIER_CLARIFICATION_TEMPLATE
VERIFIER_TEST_PLAN_OUTPUT_TEMPLATE
VERIFIER_TEST_PLAN_TIPS
```
Version B 已強化：
filename 必須是 .test.js
framework = "jest"
需指定 inputsType（http/function）
需指定 importTarget
每個 case 需要足夠生成 Jest 測試的資訊

3. Tester Agent Templates
```
Tester Agent 使用這些模板來生成可執行的測試碼與分析結果：
TESTER_CODEGEN_PROMPT_TEMPLATE
→ 用 LLM 產生真正可執行的 Jest 測試碼
→ 支援 HTTP（supertest）與 function 測試
TESTER_ERROR_ANALYSIS_TEMPLATE
→ 用 LLM 推測 Jest 失敗原因
TESTER_REPORT_MARKDOWN_TEMPLATE
→（可選）產生人類可讀的測試報告
```

##### 舊版模擬測試模板已移除。

# 🤖 Verified Agent（已完成）

## Verified Agent 的主要功能：
1. 讀取 architecture.json
2. 使用 templates.js（Verified 區塊）生成 test-plan.json
每個 testFile 都有：  
.test.js 檔名
framework = "jest"
inputsType（決定使用 supertest 或直接呼叫 function）
importTarget（匯入模組路徑）
完整的 cases
3. 輸出檔案：
/data/sessions/<sessionId>/test-plan.json

# 🔧 Tester Agent（第一版已完成）

## Tester Agent（Version B）功能如下：
1. 讀取 test-plan.json
2. 為每個 testFile 呼叫 LLM → 產生可執行 Jest 測試碼
3. 將測試碼寫入 generated-tests/
例如：
/data/sessions/<id>/generated-tests/user-service.test.js
4. 執行 Jest
npx jest --json --outputFile jest-report.json
5. 解析 jest-report.json
6. 輸出:
test-report.json
error-report.json
7. （可選）如果有錯誤，用 LLM 產生錯誤原因（suggestedCause）

🧠 test-plan.json（Version B 範例）
```
  {
    "sessionId": "example-session-id",
    "sourceArchitectureFile": "architecture.json",
    "generatedAt": "2025-11-16T12:00:00Z",
    "testFiles": [
    {
      "id": "user-service-unit",
      "filename": "user-service.unit.test.js",
      "description": "UserService 單元測試",
      "targetModule": "UserService",
      "testLevel": "unit",
      "framework": "jest",
      "inputsType": "http",
      "importTarget": "../src/app",
      "cases": [
        {
          "caseId": "UserService-create-success",
          "name": "成功建立使用者",
          "type": "normal",
          "preconditions": ["email 未被註冊"],
          "inputs": {
            "method": "POST",
            "path": "/users",
            "body": {
              "name": "John",
              "email": "test@example.com"
            }
          },
          "expected": {
            "statusCode": 201,
            "body": { "userId": "non-empty-string" }
          }
        }
      ]
    }
  ]
}

```

Tester Agent 將依此生成真正可執行的 Jest 測試。

📄 Jest 測試檔案範例（由 Tester Agent 自動生成）

```
const request = require("supertest");
const app = require("../src/app");

describe("UserService", () => {
  it("成功建立使用者", async () => {
    const res = await request(app)
      .post("/users")
      .send({ name: "John", email: "test@example.com" });

    expect(res.statusCode).toBe(201);
    expect(res.body.userId).toBeDefined();
  });
});

```

📊 測試結果報告
```
test-report.json
{
  "sessionId": "example-session-id",
  "summary": {
    "total": 5,
    "passed": 4,
    "failed": 1,
    "passRate": 0.8
  },
  "modules": [
    { "module": "UserService", "total": 3, "passed": 2, "failed": 1 }
  ]
}
```

```
error-report.json
{
  "errors": [
    {
      "file": "user-service.unit.test.js",
      "targetModule": "UserService",
      "caseId": "UserService-duplicate-email",
      "errorMessage": "Expected 400 but received 500"
    }
  ]
}
```

# 🚀 已完成的變更摘要（TL;DR）


| 模組 | 狀態 |
| ------ | ------ |
| templates.js   | ✔ 已完成重構   |
| Verified Agent | ✔ 第一版完成 |
| Tester Agent   | ✔ 第一版完成	   |
| 模擬測試 | ❌ 已移除 |

# 目前遇到的問題

## 一、資料結構不符預期
  * 你的 Architect Agent 產生的是單一 session JSON 檔（如 data/sessions/<sessionId>.
    json），內容並沒有 modules 或 architecture.modules 欄位。
  * Verifier Agent 預期要有 modules（或 architecture.modules），否則無法產生
    test-plan.json。

## 二、流程斷鏈
  * 因為缺少 modules，Verifier Agent 會報錯「session 檔未包含可用的 modules（期待 modules  或 architecture.modules）」。
  * 不確定什麼是 module，也不確定如何讓流程順利進行。

# 目前的解決辦法

## 方案一：調整 Architect Agent 輸出
  * 讓 Architect Agent 產生標準的 architecture.json
    * 路徑：data/sessions/<sessionId>/architecture.json
    * 格式需包含 modules 陣列，每個 module 需有 apis（API/函式）描述。
    * 參考範例（function 版）：
```
{
  "systemName": "Arithmetic Operations Program",
  "modules": [
    {
      "name": "ArithmeticCore",
      "type": "service",
      "importTarget": "./output/<sessionId>/app.js",
      "apis": [
        {
          "name": "add",
          "method": "FUNCTION",
          "inputs": { "a": "number", "b": "number" },
          "outputs": { "result": "number" }
        }
        // ...其他 API
      ]
    }
  ]
}
```
##### 這樣 Verifier Agent 就能順利產生 test-plan.json，Tester Agent 也能自動產生並執行測試。

## 方案二：讓 Verifier Agent 自動推導 modules
 * 修改 Verifier Agent，若 session JSON 沒有 modules，則自動從其他資訊（如 app.js 的     
   function 名稱）推導出最小 modules 結構。
 * 這樣即使 Architect Agent 沒有產生標準 architecture.json，流程也不會中斷。

## 建議
 * 最佳做法：讓 Architect Agent 直接產生標準 architecture.json（含 modules 與 apis），這樣流 
   程最穩定、維護最容易。
 * 備用做法：若 Architect Agent 無法調整，則讓 Verifier Agent 增強推導能力，從 session JSON  
   其他欄位自動組出 modules。
