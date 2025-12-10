// agents/tester-agent.js
// Tester Agent：負責根據 test-plan.json 產生測試碼、執行 Jest、產生報告
// 主要流程：
// 1. 載入 test-plan.json
// 2. 針對每個 testFile 產生測試碼並寫入檔案
// 3. 執行 jest 並取得報告
// 4. 建立測試報告與錯誤報告
// 5. 對失敗案例進行原因分析並補充建議
// 6. 寫出報告檔案

// ===== Import Modules =====
// 引入必要模組
// 1. fs：檔案系統操作
// 2. path：路徑操作
// 3. fileURLToPath：取得模組檔案路徑
// 4. child_process.exec：執行外部命令
// 5. util.promisify：將 callback 轉成 Promise
// 6. BaseAgent：基底 Agent 類別
// 7. dotenv：載入環境變數
// 8. templates.js：引入 Tester Agent 專用模板
// ===== Import Modules =====
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { exec as execCallback } from "child_process";
import { promisify } from "util";
import BaseAgent from "./agent-base.js";
import dotenv from "dotenv";
import {
  TESTER_CODEGEN_PROMPT_TEMPLATE,
  TESTER_ERROR_ANALYSIS_TEMPLATE,
  TESTER_REPORT_MARKDOWN_TEMPLATE
} from "./templates.js";

// 載入環境變數
dotenv.config();

// 將 exec 轉成 Promise 版本
const exec = promisify(execCallback);

// 取得目前模組的檔案路徑與目錄
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== TesterAgent Class =====
// Tester Agent 主類別
// ===== TesterAgent Class =====
export default class TesterAgent extends BaseAgent {
  constructor(options = {}) {
    // 支援 OPENAI_API_KEY, API_KEY (舊版), CLOUD_API_KEY (fallback)
    let apiKey = process.env.OPENAI_API_KEY || process.env.API_KEY || process.env.CLOUD_API_KEY;

    // 如果傳入 options 中有 apiKeys，優先使用
    if (options.apiKeys?.openai) {
      apiKey = options.apiKeys.openai;
    }

    let baseUrl = process.env.OPENAI_BASE_URL || process.env.BASE_URL || "https://api.openai.com/v1";

    if (!process.env.OPENAI_BASE_URL && !process.env.BASE_URL && process.env.CLOUD_API_ENDPOINT) {
      if (process.env.CLOUD_API_ENDPOINT.includes('generativelanguage.googleapis.com')) {
        baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
      } else {
        baseUrl = process.env.CLOUD_API_ENDPOINT;
      }
    }

    super("Tester Agent", "Markdown code", "tester", {
      baseUrl,
      apiKey,
      ...options
    });
    this.temperature = 0.1;
  }

  _detectBaseUrl(endpoint) {
    if (endpoint.includes('generativelanguage.googleapis.com')) {
      return 'https://generativelanguage.googleapis.com/v1beta';
    }
    return endpoint;
  }

  // ===== File & Plan Utilities =====
  //讀取 ../data/sessions/<sessionId>/test-plan.json
  async loadTestPlan(sessionId) {
    const planPath = path.resolve(__dirname, `../data/sessions/${sessionId}/test-plan.json`);
    const raw = await fs.promises.readFile(planPath, "utf-8");
    return JSON.parse(raw);
  }

  //建立目錄（若不存在）
  async ensureDir(dir) {
    await fs.promises.mkdir(dir, { recursive: true });
  }

  // ===== Prompt and LLM =====

  //套入 TESTER_CODEGEN_PROMPT_TEMPLATE，內嵌 testFile JSON，要求只輸出一個 ```javascript 區塊。
  // testFile 結構參考 templates.js 定義
  generateTestFilePrompt(testFile) {
    const tfJson = JSON.stringify(testFile, null, 2);
    return `${TESTER_CODEGEN_PROMPT_TEMPLATE}\n\n<TEST_FILE>\n${tfJson}\n</TEST_FILE>\n\n請依據 TEST_FILE 內容僅輸出一個 \`\`\`javascript 區塊，內容為可執行的 Jest 測試碼。`;
  }

  //呼叫 LLM 並抽取 ```javascript 區塊。
  async askLLMForCode(prompt) {
    const raw = await this.run(prompt);
    return this.extractJavaScript(raw);
  }

  // 從 LLM 回傳文字中抽取 JavaScript 程式碼
  // 支援 ```javascript、```js、``` 三種標記
  extractJavaScript(text) {
    if (typeof text !== "string") return "";
    const fence = text.match(/```javascript[\s\S]*?```/i) || text.match(/```js[\s\S]*?```/i) || text.match(/```[\s\S]*?```/i);
    let code = fence ? fence[0] : text;
    code = code.replace(/^```(?:javascript|js)?/i, "").replace(/```$/i, "").trim();
    return code;
  }

  // ===== Write Generated Tests =====
  // 將產生的測試碼寫入 ../data/sessions/<sessionId>/generated-tests/<filename>
  // 確保目錄存在
  async writeGeneratedTestFile(sessionId, filename, content) {
    const dir = path.resolve(__dirname, `../data/sessions/${sessionId}/generated-tests`);
    await this.ensureDir(dir);
    const filePath = path.join(dir, filename);
    await fs.promises.writeFile(filePath, content, "utf-8");
    return filePath;
  }

  // ===== Run Jest =====
  // 執行 jest，並輸出報告到 ../data/sessions/<sessionId>/jest-report.json
  // 以 session 目錄為 cwd 執行 npx jest --json --outputFile jest-report.json
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

  // 解析 ../data/sessions/<sessionId>/jest-report.json
  // 讀取並解析 Jest JSON 報告，失敗則回傳 null
  async parseJestReport(reportPath) {
    try {
      const raw = await fs.promises.readFile(reportPath, "utf-8");
      const data = JSON.parse(raw);
      return data;
    } catch (err) {
      return null;
    }
  }

  // ===== Reporting =====
  // 建立測試報告與錯誤報告物件
  // 從 jest-report.json 生成 testReport 與 errorReport 物件
  // testReport 包含每個測試檔案的通過/失敗狀態與統計
  // errorReport 包含失敗案例的詳細資訊
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

  // 對失敗案例進行原因分析並補充建議
  // 針對失敗案例用 TESTER_ERROR_ANALYSIS_TEMPLATE 取得 suggestedCause
  // 若 LLM 失敗則略過該案例

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

  // 寫出 test-plan.json、test-report.json、error-report.json
  async writeReports(sessionId, testReport, errorReport) {
    const dir = path.resolve(__dirname, `../data/sessions/${sessionId}`);
    await this.ensureDir(dir);
    const testReportPath = path.join(dir, "test-report.json");
    const errorReportPath = path.join(dir, "error-report.json");
    await fs.promises.writeFile(testReportPath, JSON.stringify(testReport, null, 2), "utf-8");
    await fs.promises.writeFile(errorReportPath, JSON.stringify(errorReport, null, 2), "utf-8");
    return { testReportPath, errorReportPath };
  }

  // ===== Main Entrypoint =====
  // 執行 Tester Agent 主流程
  // 1. 載入 test-plan.json
  // 2. 針對每個 testFile 產生測試碼並寫入檔案
  // 3. 執行 jest 並取得報告
  // 4. 建立測試報告與錯誤報告
  // 5. 對失敗案例進行原因分析並補充建議
  // 6. 寫出報告檔案
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
}

// 允許從 CLI 執行： node agents/tester-agent.js <sessionId>
// 例如： node agents/tester-agent.js abc123
if (process.argv[1] && path.basename(process.argv[1]) === path.basename(__filename)) {
  const sid = process.argv[2];
  const agent = new TesterAgent();
  agent.runTesterAgent(sid).then(() => process.exit(0)).catch(() => process.exit(1));
}