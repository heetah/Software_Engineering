# Tester Agent 詳細流程說明

## 📋 目錄
1. [概述](#概述)
2. [類別結構](#類別結構)
3. [完整流程圖](#完整流程圖)
4. [各階段詳細說明](#各階段詳細說明)
5. [核心方法詳解](#核心方法詳解)
6. [資料流與檔案結構](#資料流與檔案結構)
7. [錯誤處理機制](#錯誤處理機制)

---

## 概述

**Tester Agent** 是 LLM 驅動自動化測試系統的核心組件之一，負責：
- 根據 `test-plan.json` 生成可執行的 Jest 測試碼
- 執行 Jest 測試
- 解析測試結果並生成報告
- 對失敗案例進行 LLM 驅動的錯誤分析

**檔案位置**：`agents/tester-agent.js`

**繼承關係**：`TesterAgent extends BaseAgent`

---

## 類別結構

### 類別定義

```48:55:agents/tester-agent.js
export default class TesterAgent extends BaseAgent {
  constructor() {
    super("Tester Agent", "Markdown code", "tester", {
      baseUrl: process.env.OPENAI_BASE_URL || process.env.BASE_URL || "https://api.openai.com/v1",
      apiKey: process.env.OPENAI_API_KEY || process.env.API_KEY
    });
    this.temperature = 0.1;
  }
```

**特點**：
- 繼承自 `BaseAgent`，獲得 API 調用、重試機制等功能
- 使用低溫度（0.1）確保生成的測試碼穩定可靠
- 支援多 API 提供者（透過 BaseAgent）

### 核心方法分類

1. **檔案與計劃工具**：`loadTestPlan()`, `ensureDir()`
2. **LLM 互動**：`generateTestFilePrompt()`, `askLLMForCode()`, `extractJavaScript()`
3. **測試檔案管理**：`writeGeneratedTestFile()`
4. **Jest 執行**：`runJest()`, `parseJestReport()`
5. **報告生成**：`buildReports()`, `enrichFailuresWithSuggestions()`, `writeReports()`
6. **主入口**：`runTesterAgent()`

---

## 完整流程圖

```
┌─────────────────────────────────────────────────────────────┐
│                    runTesterAgent(sessionId)                │
│                     主入口函數                                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  階段 1: 載入測試計劃                                        │
│  loadTestPlan(sessionId)                                    │
│  → 讀取 data/sessions/<sessionId>/test-plan.json            │
│  → 驗證 testFiles 陣列是否存在且不為空                      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  階段 2: 生成測試碼（循環處理每個 testFile）                 │
│  for (const tf of plan.testFiles) {                        │
│    ├─ generateTestFilePrompt(tf)                           │
│    │   → 組合 TESTER_CODEGEN_PROMPT_TEMPLATE                │
│    │   → 嵌入 testFile JSON                                 │
│    │                                                         │
│    ├─ askLLMForCode(prompt)                                 │
│    │   ├─ this.run(prompt)  // 呼叫 LLM                    │
│    │   └─ extractJavaScript(raw)  // 提取 JavaScript 代碼  │
│    │                                                         │
│    └─ writeGeneratedTestFile(sessionId, filename, code)     │
│        → 寫入 data/sessions/<id>/generated-tests/<filename> │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  階段 3: 執行 Jest 測試                                      │
│  runJest(sessionId)                                         │
│  → 在 session 目錄執行: npx jest --json --outputFile ...   │
│  → 返回 jest-report.json 路徑                               │
│                                                             │
│  parseJestReport(reportPath)                                │
│  → 讀取並解析 jest-report.json                              │
│  → 如果失敗，生成空報告並拋出錯誤                            │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  階段 4: 建立測試報告                                        │
│  buildReports(sessionId, jestJson)                          │
│  → 解析 jest-report.json                                    │
│  → 生成 testReport（統計資訊）                              │
│  → 生成 errorReport（失敗案例詳情）                         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  階段 5: 錯誤分析（可選）                                    │
│  if (errorReport.failures.length > 0) {                    │
│    enrichFailuresWithSuggestions(failures)                  │
│    → 對每個失敗案例呼叫 LLM 分析原因                        │
│    → 補充 suggestedCause 到錯誤報告                         │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  階段 6: 寫出報告檔案                                        │
│  writeReports(sessionId, testReport, errorReport)            │
│  → 寫入 test-report.json                                    │
│  → 寫入 error-report.json                                   │
│  → 返回檔案路徑                                             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                   返回 { testReport, errorReport }
```

---

## 各階段詳細說明

### 階段 1: 載入測試計劃

**方法**：`loadTestPlan(sessionId)`

```59:63:agents/tester-agent.js
  async loadTestPlan(sessionId) {
    const planPath = path.resolve(__dirname, `../data/sessions/${sessionId}/test-plan.json`);
    const raw = await fs.promises.readFile(planPath, "utf-8");
    return JSON.parse(raw);
  }
```

**流程**：
1. 構建 `test-plan.json` 的完整路徑
2. 讀取檔案內容（UTF-8 編碼）
3. 解析 JSON 並返回物件

**驗證**（在主流程中）：
```javascript
if (!Array.isArray(plan?.testFiles) || plan.testFiles.length === 0) {
  throw new Error("test-plan.json 缺少 testFiles 或為空");
}
```

**test-plan.json 結構**：
```json
{
  "sessionId": "...",
  "testFiles": [
    {
      "id": "...",
      "filename": "*.test.js",
      "targetModule": "...",
      "testLevel": "unit|integration|e2e",
      "framework": "jest",
      "inputsType": "http|function",
      "importTarget": "...",
      "cases": [...]
    }
  ]
}
```

---

### 階段 2: 生成測試碼

#### 2.1 生成 Prompt

**方法**：`generateTestFilePrompt(testFile)`

```74:77:agents/tester-agent.js
  generateTestFilePrompt(testFile) {
    const tfJson = JSON.stringify(testFile, null, 2);
    return `${TESTER_CODEGEN_PROMPT_TEMPLATE}\n\n<TEST_FILE>\n${tfJson}\n</TEST_FILE>\n\n請依據 TEST_FILE 內容僅輸出一個 \`\`\`javascript 區塊，內容為可執行的 Jest 測試碼。`;
  }
```

**流程**：
1. 將 `testFile` 物件轉換為格式化的 JSON 字符串
2. 組合 `TESTER_CODEGEN_PROMPT_TEMPLATE`（來自 `templates.js`）
3. 嵌入 `<TEST_FILE>` 標籤包裹的 JSON
4. 添加輸出要求（只輸出一個 JavaScript 代碼塊）

**Prompt 模板內容**（來自 `templates.js`）：
- 指示 LLM 作為資深測試工程師
- 說明輸入格式（testFile 物件）
- 根據 `inputsType` 選擇測試方式（HTTP 用 supertest，function 直接調用）
- 定義 `expect` 規則

#### 2.2 呼叫 LLM 生成代碼

**方法**：`askLLMForCode(prompt)`

```80:83:agents/tester-agent.js
  async askLLMForCode(prompt) {
    const raw = await this.run(prompt);
    return this.extractJavaScript(raw);
  }
```

**流程**：
1. 呼叫 `this.run(prompt)`（繼承自 BaseAgent）
   - 使用 LLM API 生成測試碼
   - 自動處理重試和錯誤
2. 呼叫 `extractJavaScript()` 提取代碼

#### 2.3 提取 JavaScript 代碼

**方法**：`extractJavaScript(text)`

```87:93:agents/tester-agent.js
  extractJavaScript(text) {
    if (typeof text !== "string") return "";
    const fence = text.match(/```javascript[\s\S]*?```/i) || text.match(/```js[\s\S]*?```/i) || text.match(/```[\s\S]*?```/i);
    let code = fence ? fence[0] : text;
    code = code.replace(/^```(?:javascript|js)?/i, "").replace(/```$/i, "").trim();
    return code;
  }
```

**流程**：
1. 檢查輸入是否為字符串
2. 嘗試匹配三種格式的代碼塊：
   - ` ```javascript ... ``` `
   - ` ```js ... ``` `
   - ` ``` ... ``` `
3. 移除代碼塊標記（```javascript、```js、```）
4. 返回清理後的代碼

**支援的格式**：
- ` ```javascript\ncode\n``` `
- ` ```js\ncode\n``` `
- ` ```\ncode\n``` `
- 純代碼（無標記）

#### 2.4 寫入測試檔案

**方法**：`writeGeneratedTestFile(sessionId, filename, content)`

```98:104:agents/tester-agent.js
  async writeGeneratedTestFile(sessionId, filename, content) {
    const dir = path.resolve(__dirname, `../data/sessions/${sessionId}/generated-tests`);
    await this.ensureDir(dir);
    const filePath = path.join(dir, filename);
    await fs.promises.writeFile(filePath, content, "utf-8");
    return filePath;
  }
```

**流程**：
1. 構建 `generated-tests` 目錄路徑
2. 確保目錄存在（`ensureDir()`）
3. 構建完整檔案路徑
4. 寫入測試碼（UTF-8 編碼）
5. 返回檔案路徑

**檔案位置**：
```
data/sessions/<sessionId>/generated-tests/
  ├── calculator.logic.unit.test.js
  ├── calculator.ui.e2e.test.js
  └── ...
```

---

### 階段 3: 執行 Jest 測試

#### 3.1 執行 Jest 命令

**方法**：`runJest(sessionId)`

```109:119:agents/tester-agent.js
  async runJest(sessionId) {
    const sessionDir = path.resolve(__dirname, `../data/sessions/${sessionId}`);
    const cmd = `npx jest --json --outputFile jest-report.json`;
    try {
      await exec(cmd, { cwd: sessionDir, windowsHide: true, maxBuffer: 1024 * 1024 * 10 });
      return path.join(sessionDir, "jest-report.json");
    } catch (err) {
      // 即使 jest 有失敗測試也會回傳非零碼，但仍會輸出報告
      return path.join(sessionDir, "jest-report.json");
    }
  }
```

**流程**：
1. 構建 session 目錄路徑
2. 構建 Jest 命令：
   - `npx jest`：執行 Jest
   - `--json`：輸出 JSON 格式
   - `--outputFile jest-report.json`：指定輸出檔案
3. 使用 `exec()` 執行命令：
   - `cwd: sessionDir`：在 session 目錄中執行
   - `windowsHide: true`：Windows 下隱藏命令視窗
   - `maxBuffer: 10MB`：最大輸出緩衝區
4. 返回報告檔案路徑

**重要特性**：
- 即使測試失敗，Jest 仍會生成報告
- `catch` 區塊仍返回報告路徑（因為 Jest 失敗時也會輸出報告）

#### 3.2 解析 Jest 報告

**方法**：`parseJestReport(reportPath)`

```123:131:agents/tester-agent.js
  async parseJestReport(reportPath) {
    try {
      const raw = await fs.promises.readFile(reportPath, "utf-8");
      const data = JSON.parse(raw);
      return data;
    } catch (err) {
      return null;
    }
  }
```

**流程**：
1. 讀取 `jest-report.json` 檔案
2. 解析 JSON
3. 返回解析後的物件
4. 如果失敗，返回 `null`

**jest-report.json 結構**：
```json
{
  "testResults": [
    {
      "name": "test-file.test.js",
      "assertionResults": [
        {
          "title": "測試案例名稱",
          "status": "passed" | "failed",
          "failureMessages": ["錯誤訊息"]
        }
      ]
    }
  ]
}
```

---

### 階段 4: 建立測試報告

**方法**：`buildReports(sessionId, jestJson)`

```138:189:agents/tester-agent.js
  buildReports(sessionId, jestJson) {
    const now = new Date().toISOString();
    const testResults = Array.isArray(jestJson?.testResults) ? jestJson.testResults : [];
    let totalTests = 0;
    let totalPassed = 0;
    let totalFailed = 0;
    const files = [];
    const failures = [];

    for (const tr of testResults) {
      const assertionResults = Array.isArray(tr.assertionResults) ? tr.assertionResults : [];
      const passed = assertionResults.filter(a => a.status === "passed").length;
      const failed = assertionResults.filter(a => a.status === "failed").length;
      const fileItem = {
        filename: tr.name || tr.testFilePath || "unknown",
        status: failed > 0 ? "failed" : "passed",
        passed,
        failed,
        assertions: assertionResults.map(a => ({ title: a.title, status: a.status }))
      };
      files.push(fileItem);
      totalTests += assertionResults.length;
      totalPassed += passed;
      totalFailed += failed;

      if (failed > 0) {
        for (const a of assertionResults.filter(x => x.status === "failed")) {
          failures.push({
            filename: tr.name || tr.testFilePath || "unknown",
            title: a.title,
            fullName: a.fullName,
            failureMessages: Array.isArray(a.failureMessages) ? a.failureMessages : (tr.message ? [tr.message] : [])
          });
        }
      }
    }

    const testReport = {
      sessionId,
      generatedAt: now,
      totals: { files: files.length, tests: totalTests, passed: totalPassed, failed: totalFailed },
      files
    };

    const errorReport = {
      sessionId,
      generatedAt: now,
      failures
    };

    return { testReport, errorReport };
  }
```

**流程**：

1. **初始化統計變數**
   - `totalTests`, `totalPassed`, `totalFailed`
   - `files` 陣列（每個測試檔案的狀態）
   - `failures` 陣列（失敗案例詳情）

2. **遍歷每個測試檔案結果**
   - 從 `jestJson.testResults` 取得每個測試檔案
   - 統計通過和失敗的測試案例
   - 建立 `fileItem` 物件：
     ```javascript
     {
       filename: "test-file.test.js",
       status: "passed" | "failed",
       passed: 數量,
       failed: 數量,
       assertions: [{ title: "...", status: "..." }]
     }
     ```

3. **收集失敗案例**
   - 遍歷每個失敗的測試案例
   - 建立 `failure` 物件：
     ```javascript
     {
       filename: "test-file.test.js",
       title: "測試案例名稱",
       fullName: "完整測試路徑",
       failureMessages: ["錯誤訊息"]
     }
     ```

4. **生成報告物件**
   - **testReport**：測試摘要報告
     ```json
     {
       "sessionId": "...",
       "generatedAt": "ISO8601",
       "totals": {
         "files": 2,
         "tests": 10,
         "passed": 8,
         "failed": 2
       },
       "files": [...]
     }
     ```
   
   - **errorReport**：錯誤詳情報告
     ```json
     {
       "sessionId": "...",
       "generatedAt": "ISO8601",
       "failures": [...]
     }
     ```

---

### 階段 5: 錯誤分析（可選）

**方法**：`enrichFailuresWithSuggestions(failures)`

```195:212:agents/tester-agent.js
  async enrichFailuresWithSuggestions(failures) {
    const enriched = [];
    for (const f of failures) {
      try {
        const tmpl = TESTER_ERROR_ANALYSIS_TEMPLATE
          .replace("{{filename}}", f.filename || "")
          .replace("{{caseId}}", f.fullName || f.title || "")
          .replace("{{name}}", f.title || "")
          .replace("{{errorMessage}}", (f.failureMessages && f.failureMessages[0]) || "")
          .replace("{{stack}}", "");
        const suggestion = await this.run(tmpl);
        enriched.push({ ...f, suggestedCause: suggestion });
      } catch {
        enriched.push(f);
      }
    }
    return enriched;
  }
```

**流程**：

1. **遍歷每個失敗案例**
2. **構建錯誤分析 Prompt**
   - 使用 `TESTER_ERROR_ANALYSIS_TEMPLATE`（來自 `templates.js`）
   - 替換模板變數：
     - `{{filename}}`：測試檔案名稱
     - `{{caseId}}`：測試案例 ID
     - `{{name}}`：測試案例名稱
     - `{{errorMessage}}`：錯誤訊息
     - `{{stack}}`：堆疊追蹤（目前為空）
3. **呼叫 LLM 分析**
   - 使用 `this.run(tmpl)` 呼叫 LLM
   - LLM 根據錯誤資訊推斷可能原因
4. **補充建議**
   - 將 `suggestedCause` 添加到失敗案例物件
   - 如果 LLM 呼叫失敗，保留原始失敗資訊

**錯誤分析模板**（來自 `templates.js`）：
```
你是一個測試錯誤分析器。請根據錯誤資訊推斷最可能原因。

- 檔案：{{filename}}
- 模組：{{targetModule}}
- 案例 ID：{{caseId}}
- 名稱：{{name}}
- 錯誤訊息：{{errorMessage}}
- 堆疊：{{stack}}

請條列 1–2 個最可能原因。
```

---

### 階段 6: 寫出報告檔案

**方法**：`writeReports(sessionId, testReport, errorReport)`

```215:223:agents/tester-agent.js
  async writeReports(sessionId, testReport, errorReport) {
    const dir = path.resolve(__dirname, `../data/sessions/${sessionId}`);
    await this.ensureDir(dir);
    const testReportPath = path.join(dir, "test-report.json");
    const errorReportPath = path.join(dir, "error-report.json");
    await fs.promises.writeFile(testReportPath, JSON.stringify(testReport, null, 2), "utf-8");
    await fs.promises.writeFile(errorReportPath, JSON.stringify(errorReport, null, 2), "utf-8");
    return { testReportPath, errorReportPath };
  }
```

**流程**：
1. 構建 session 目錄路徑
2. 確保目錄存在
3. 構建報告檔案路徑：
   - `test-report.json`：測試摘要報告
   - `error-report.json`：錯誤詳情報告
4. 寫入檔案（格式化的 JSON，縮排 2 空格）
5. 返回檔案路徑

**輸出檔案**：
```
data/sessions/<sessionId>/
  ├── test-plan.json          (輸入)
  ├── generated-tests/        (生成的測試碼)
  │   └── *.test.js
  ├── jest-report.json        (Jest 原始報告)
  ├── test-report.json        (測試摘要報告) ← 輸出
  └── error-report.json       (錯誤詳情報告) ← 輸出
```

---

## 核心方法詳解

### 主入口：runTesterAgent()

```233:266:agents/tester-agent.js
  async runTesterAgent(sessionId) {
    if (!sessionId) throw new Error("缺少 sessionId");

    const plan = await this.loadTestPlan(sessionId);
    if (!Array.isArray(plan?.testFiles) || plan.testFiles.length === 0) {
      throw new Error("test-plan.json 缺少 testFiles 或為空");
    }

    for (const tf of plan.testFiles) {
      if (!tf.filename || !tf.importTarget || !tf.inputsType) continue;
      const prompt = this.generateTestFilePrompt(tf);
      const code = await this.askLLMForCode(prompt);
      await this.writeGeneratedTestFile(sessionId, tf.filename, code);
    }

    const jestReportPath = await this.runJest(sessionId);
    const jestJson = await this.parseJestReport(jestReportPath);
    if (!jestJson) {
      // 回寫空報告以利後續流程
      const empty = { sessionId, generatedAt: new Date().toISOString(), totals: { files: 0, tests: 0, passed: 0, failed: 0 }, files: [] };
      await this.writeReports(sessionId, empty, { sessionId, generatedAt: new Date().toISOString(), failures: [] });
      throw new Error("無法解析 jest-report.json");
    }

    let { testReport, errorReport } = this.buildReports(sessionId, jestJson);

    if (errorReport.failures.length > 0) {
      const enriched = await this.enrichFailuresWithSuggestions(errorReport.failures);
      errorReport = { ...errorReport, failures: enriched };
    }

    await this.writeReports(sessionId, testReport, errorReport);
    return { testReport, errorReport };
  }
```

**完整流程**：

1. **驗證輸入**
   - 檢查 `sessionId` 是否存在
   - 載入並驗證 `test-plan.json`

2. **生成測試碼循環**
   - 遍歷每個 `testFile`
   - 跳過缺少必要欄位的檔案（`filename`, `importTarget`, `inputsType`）
   - 為每個檔案生成並寫入測試碼

3. **執行測試**
   - 執行 Jest
   - 解析報告
   - 如果解析失敗，生成空報告並拋出錯誤

4. **生成報告**
   - 建立測試報告和錯誤報告
   - 如果有失敗案例，進行 LLM 分析

5. **寫出檔案**
   - 寫入 `test-report.json` 和 `error-report.json`
   - 返回報告物件

---

## 資料流與檔案結構

### 輸入檔案

**test-plan.json**（由 Verifier Agent 生成）
```
data/sessions/<sessionId>/test-plan.json
```

**結構**：
```json
{
  "sessionId": "...",
  "testFiles": [
    {
      "id": "calculator-logic-unit",
      "filename": "calculator.logic.unit.test.js",
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
          "inputs": { "firstOperand": 5, "secondOperand": 3, "operator": "+" },
          "expected": { "result": 8 }
        }
      ]
    }
  ]
}
```

### 中間檔案

**生成的測試碼**
```
data/sessions/<sessionId>/generated-tests/
  ├── calculator.logic.unit.test.js
  └── calculator.ui.e2e.test.js
```

**Jest 原始報告**
```
data/sessions/<sessionId>/jest-report.json
```

### 輸出檔案

**test-report.json**（測試摘要）
```json
{
  "sessionId": "...",
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

**error-report.json**（錯誤詳情）
```json
{
  "sessionId": "...",
  "generatedAt": "2025-11-19T14:45:09.426Z",
  "failures": [
    {
      "filename": "calculator.logic.unit.test.js",
      "title": "除以零應該回傳錯誤",
      "fullName": "Calculator 除以零應該回傳錯誤",
      "failureMessages": ["Expected ... but received ..."],
      "suggestedCause": "可能的原因：1. ... 2. ..."
    }
  ]
}
```

---

## 錯誤處理機制

### 1. 輸入驗證錯誤

```javascript
if (!sessionId) throw new Error("缺少 sessionId");
if (!Array.isArray(plan?.testFiles) || plan.testFiles.length === 0) {
  throw new Error("test-plan.json 缺少 testFiles 或為空");
}
```

### 2. 測試碼生成錯誤

- 如果 LLM 呼叫失敗，`askLLMForCode()` 會拋出錯誤
- 如果代碼提取失敗，`extractJavaScript()` 返回空字符串
- 循環中使用 `continue` 跳過有問題的檔案

### 3. Jest 執行錯誤

```javascript
try {
  await exec(cmd, {...});
  return path.join(sessionDir, "jest-report.json");
} catch (err) {
  // 即使 jest 有失敗測試也會回傳非零碼，但仍會輸出報告
  return path.join(sessionDir, "jest-report.json");
}
```

**處理策略**：
- Jest 測試失敗時仍會生成報告
- 即使命令執行失敗，仍嘗試讀取報告檔案

### 4. 報告解析錯誤

```javascript
if (!jestJson) {
  // 回寫空報告以利後續流程
  const empty = {...};
  await this.writeReports(sessionId, empty, {...});
  throw new Error("無法解析 jest-report.json");
}
```

**處理策略**：
- 如果無法解析報告，生成空報告
- 確保後續流程不會因為缺少檔案而失敗

### 5. 錯誤分析失敗

```javascript
try {
  const suggestion = await this.run(tmpl);
  enriched.push({ ...f, suggestedCause: suggestion });
} catch {
  enriched.push(f); // 如果 LLM 失敗，保留原始失敗資訊
}
```

**處理策略**：
- 如果 LLM 分析失敗，保留原始錯誤資訊
- 不影響整體流程

---

## 使用範例

### CLI 執行

```bash
node agents/tester-agent.js <sessionId>
```

例如：
```bash
node agents/tester-agent.js e7eb010b-baf3-4e43-9069-03bf6c699f5c
```

### 程式化執行

```javascript
import TesterAgent from './agents/tester-agent.js';

const tester = new TesterAgent();
const { testReport, errorReport } = await tester.runTesterAgent(sessionId);

console.log(`測試完成：${testReport.totals.passed}/${testReport.totals.tests} 通過`);
if (errorReport.failures.length > 0) {
  console.log(`失敗案例：${errorReport.failures.length}`);
}
```

---

## 關鍵設計決策

### 1. 序列化處理測試檔案

- 每個 `testFile` 依序處理，避免並發問題
- 確保每個測試檔案都正確生成

### 2. 錯誤容忍性

- 即使部分測試失敗，仍生成完整報告
- LLM 分析失敗不影響整體流程

### 3. 自動錯誤分析

- 使用 LLM 分析失敗原因，提供 `suggestedCause`
- 幫助開發者快速定位問題

### 4. 結構化報告

- 分離測試摘要（test-report.json）和錯誤詳情（error-report.json）
- 便於不同用途的查詢和分析

---

## 總結

**Tester Agent** 是一個完整的自動化測試執行系統：

1. **輸入**：`test-plan.json`（結構化測試計劃）
2. **處理**：
   - LLM 生成測試碼
   - 執行 Jest 測試
   - 解析測試結果
   - LLM 分析錯誤
3. **輸出**：
   - 生成的測試碼（`*.test.js`）
   - 測試摘要報告（`test-report.json`）
   - 錯誤詳情報告（`error-report.json`）

整個流程自動化，從測試計劃到測試執行再到結果分析，完全由 LLM 驅動。

