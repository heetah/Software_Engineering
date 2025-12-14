// Verifier Agent: 產生測試計劃 (test-plan.json)
// [Modified for tester/verifier agent integration]
// 主要流程：
// 1. 載入 architecture.json
// 2. 載入 templates.js
// 3. 建立 LLM Prompt
// 4. 呼叫 LLM 取得原始 JSON 字串
// 5. 驗證並解析 LLM 回傳的 JSON
// 6. 寫出 test-plan.json 檔案

// ===== Import Modules =====
// 引入必要模組
// 1. fs：檔案系統操作
// 2. path：路徑操作
// 3. fileURLToPath：取得模組檔案路徑
// 4. BaseAgent：基底 Agent 類別
// 5. dotenv：載入環境變數
// ===== Import Modules =====
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import BaseAgent from "./agent-base.js";
import dotenv from "dotenv";

// 載入環境變數
dotenv.config();

// 取得目前模組的檔案路徑與目錄
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * VerifierAgent 只負責：根據 architecture.json + templates.js 規則 產生結構化 test-plan.json
 * 不執行測試。輸出固定 JSON 結構，供 Tester Agent 解析使用。
 */
// Verifier Agent 主類別
// ===== VerifierAgent Class =====
export default class VerifierAgent extends BaseAgent {
  constructor(options = {}) {
    super("Verifier Agent", "JSON", "verifier", options);
    this.temperature = 0.1;
  }

  _detectBaseUrl(endpoint) {
    if (endpoint.includes('generativelanguage.googleapis.com')) {
      return 'https://generativelanguage.googleapis.com/v1beta';
    }
    return endpoint;
  }

  /**
   * 執行 Verifier Agent 主流程（實例方法）
   * @param {string} sessionId
   * @returns {Promise<{path:string, plan:object}>}
   */
  async runVerifierAgent(sessionId) {
    if (!sessionId) throw new Error("sessionId is required");
    try {
      const architectureData = await loadArchitecture(sessionId);
      const templateText = await loadTemplates();
      const prompt = buildLLMPrompt(architectureData, templateText, sessionId);
      const raw = await callLLM(prompt, this);
      const testPlan = validateTestPlan(raw, sessionId);
      const pathWritten = await writeTestPlan(sessionId, testPlan);
      console.log(`test-plan.json has been generated: ${pathWritten}`);
      return { path: pathWritten, plan: testPlan };
    } catch (err) {
      console.error(`Verifier Agent failed: ${err.message}`);
      throw err;
    }
  }
}

// ====== 核心功能函式 ======

/**
 * 讀取架構 JSON
 * @param {string} sessionId
 * @returns {object} architectureData
 */
// 讀取 ../data/sessions/<sessionId>/architecture.json
export async function loadArchitecture(sessionId) {
  const base = path.resolve(__dirname, "../data/sessions");
  // 若 sessionId 是檔名（含 .json），改取同名資料夾
  const isFileId = sessionId.endsWith(".json");
  const pureId = isFileId ? path.basename(sessionId, ".json") : sessionId;
  const sessionDir = path.join(base, pureId);
  const archFile = path.join(sessionDir, "architecture.json");
  if (!fs.existsSync(archFile)) {
    throw new Error(`architecture.json is missing: ${archFile}`);
  }
  try {
    return JSON.parse(await fs.promises.readFile(archFile, "utf-8"));
  } catch (e) {
    throw new Error(`Failed to parse architecture.json: ${e.message}`);
  }
}

/**
 * 讀取模板規則（templates.js）文字
 * @returns {string} templateText
 */
// 讀取 agents/templates.js
export async function loadTemplates() {
  const tplFile = path.resolve(
    __dirname,
    `./templates.js`
  );
  if (!fs.existsSync(tplFile)) {
    throw new Error(`templates.js is missing: ${tplFile}`);
  }
  return fs.readFileSync(tplFile, "utf-8");
}

/**
 * 建立 LLM Prompt
 * @param {object} architectureData
 * @param {string} templateText
 * @param {string} sessionId
 * @returns {string} prompt
 */

// 建立 LLM Prompt
// ===== Build LLM Prompt =====
// 1. 壓縮 architectureData 為 JSON 字串
// 2. 插入 templateText
// 3. 定義輸出格式範例
export function buildLLMPrompt(architectureData, templateText, sessionId) {
  // 壓縮 JSON（直接字串化；若過長可裁剪但保持結構完整）
  let architectureJson = JSON.stringify(architectureData, null, 2);
  if (architectureJson.length > 20000) {
    architectureJson = architectureJson.substring(0, 20000) + "\n... (截斷)"; // 避免超長
  }

  const outputFormat = `{
  "sessionId": "${sessionId}",
  "sourceArchitectureFile": "architecture.json",
  "generatedAt": "<ISO8601 datetime>",
  "testFiles": [
    {
      "id": "<unique-id>",
      "filename": "<module>.<level>.test.js",
      "description": "Description of the test file",
      "targetModule": "<ModuleName>",
      "testLevel": "unit|integration|e2e",
      "framework": "jest",
      "inputsType": "http|function",
      "importTarget": "<relative-path-to-module>",
      "cases": [
        {
          "caseId": "<string>",
          "name": "<string>",
          "type": "normal|boundary|error|performance",
          "preconditions": ["<string>", "..."],
          "inputs": {},
          "expected": {}
        }
      ]
    }
  ]
}`;

  return `You are a 'Test Plan Generator Verifier Agent'.\nI will provide you with:\n1. System architecture JSON\n2. Test template rules (including test-plan schema and writing prompts)\n\nPlease generate a strict JSON-formatted test-plan based on these information.\n\n=== Architecture JSON ===\n${architectureJson}\n\n=== Test Template Rules (raw content) ===\n${templateText}\n\n=== Output Format (MUST FOLLOW) ===\n${outputFormat}\n\nRequirements:\n- Only output a single JSON object; if using code block, only allow one \`\`\`json block.\n- Each core module must have at least one testFile.\n- Each API must have at least normal and error; if applicable, must contain boundary.\n- filename uses <module>.<level>.test.js; framework is fixed to jest.\n- Each testFile must provide inputsType (http|function) and importTarget.\n- cases field must be complete (caseId/name/type/preconditions/inputs/expected).\n- generatedAt uses ISO8601.`;
}

/**
 * 呼叫 LLM 取得原始 JSON 字串
 * @param {string} prompt
 * @param {VerifierAgent} agent
 * @returns {string} rawOutput
 */
// 呼叫 LLM
// ===== Call LLM =====

export async function callLLM(prompt, agentInstance) {
  const raw = await agentInstance.run(prompt);
  return raw;
}

/**
 * 驗證並解析 LLM 回傳的 JSON
 * @param {string} raw
 * @param {string} sessionId
 * @returns {object} testPlan
 */
// 驗證 test-plan.json 結構
// ===== Validate Test Plan =====
// 1. 提取 JSON（處理可能的 ```json 包裹）
// 2. JSON.parse
// 3. 檢查必要欄位與結構
export function validateTestPlan(raw, sessionId) {
  // 嘗試提取 JSON（處理可能的 ```json 包裹）
  let jsonText = raw.trim();
  const fenceMatch = jsonText.match(/```json[\s\S]*?```/i) || jsonText.match(/```[\s\S]*?```/i);
  if (fenceMatch) {
    jsonText = fenceMatch[0].replace(/```json|```/g, "").trim();
  }
  // 去除前後可能的非 JSON 字元
  const firstBrace = jsonText.indexOf("{");
  const lastBrace = jsonText.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("LLM output does not contain JSON structure");
  }
  jsonText = jsonText.substring(firstBrace, lastBrace + 1);

  let obj;
  try {
    obj = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(`JSON parse failed: ${err.message}`);
  }

  if (!obj || typeof obj !== "object") {
    throw new Error("test plan is not an object");
  }
  if (obj.sessionId !== sessionId) {
    // 若模型沒放 sessionId，補上
    obj.sessionId = sessionId;
  }
  if (!Array.isArray(obj.testFiles) || obj.testFiles.length === 0) {
    throw new Error("testFiles is missing or empty");
  }
  // 基本欄位檢查
  // 檢查每個 testFile 結構
  // ===== Validate testFile Structure =====
  for (const tf of obj.testFiles) {
    if (!tf.filename || !tf.targetModule || !tf.testLevel || !Array.isArray(tf.cases)) {
      throw new Error(`testFile structure is incomplete: ${tf.filename || "<no filename>"}`);
    }
    // 新版規則：framework=jest、檔名以 .test.js 收尾、inputsType 與 importTarget 必填
    // ===== Additional testFile Validations =====
    if (tf.framework !== "jest") {
      throw new Error(`framework must be jest: ${tf.filename}`);
    }
    if (typeof tf.filename !== "string" || !tf.filename.endsWith(".test.js")) {
      throw new Error(`filename must end with .test.js: ${tf.filename}`);
    }
    if (!tf.inputsType || !["http", "function"].includes(tf.inputsType)) {
      throw new Error(`inputsType must be http or function: ${tf.filename}`);
    }
    if (!tf.importTarget || typeof tf.importTarget !== "string") {
      throw new Error(`importTarget is missing or invalid: ${tf.filename}`);
    }
    for (const c of tf.cases) {
      if (!c.caseId || !c.name || !c.type || c.inputs === undefined || c.expected === undefined) {
        throw new Error(`case structure is incomplete: ${c.caseId || c.name || "<no id>"}`);
      }
    }
  }
  // 補充標準欄位
  // ===== Supplement Standard Fields =====
  obj.sourceArchitectureFile = "architecture.json";
  obj.generatedAt = new Date().toISOString();
  return obj;
}

/**
 * 寫出 test-plan.json
 * @param {string} sessionId
 * @param {object} testPlan
 * @returns {string} outputPath
 */
// 寫出 ../data/sessions/<sessionId>/test-plan.json
// ===== Write Test Plan =====
// 1. 建立目錄
// 2. JSON.stringify 並寫出檔案
export async function writeTestPlan(sessionId, testPlan) {
  const dir = path.resolve(
    __dirname,
    `../data/sessions/${sessionId}`
  );
  fs.mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, "test-plan.json");
  fs.writeFileSync(outPath, JSON.stringify(testPlan, null, 2), "utf-8");
  return outPath;
}

/**
 * 主流程入口
 * @param {string} sessionId
 * @returns {Promise<{path:string, plan:object}>}
 */
// 執行 Verifier Agent 主流程
// ===== Run Verifier Agent =====
// 1. 載入 architecture.json
// 2. 載入 templates.js
// 3. 建立 LLM Prompt
// 4. 呼叫 LLM 取得原始 JSON 字串
// 5. 驗證並解析 LLM 回傳的 JSON
// 6. 寫出 test-plan.json 檔案
// 7. 回傳路徑與內容
// ===== Run Verifier Agent =====

export async function runVerifierAgent(sessionId) {
  if (!sessionId) throw new Error("sessionId is missing");
  const agent = new VerifierAgent();
  try {
    const architectureData = await loadArchitecture(sessionId);
    const templateText = await loadTemplates();
    const prompt = buildLLMPrompt(architectureData, templateText, sessionId);
    const raw = await callLLM(prompt, agent);
    const testPlan = validateTestPlan(raw, sessionId);
    const pathWritten = await writeTestPlan(sessionId, testPlan);
    console.log(`✅ test-plan.json has been generated: ${pathWritten}`);
    return { path: pathWritten, plan: testPlan };
  } catch (err) {
    console.error(`❌ Verifier Agent failed: ${err.message}`);
    throw err;
  }
}

// Deprecated alias for backward compatibility
// ===== Deprecated Alias =====
export async function runVerifiedAgent(sessionId) {
  return runVerifierAgent(sessionId);
}

// 允許直接以 node 執行此檔案： node agents/verifier-agent.js <sessionId>
// 例如： node agents/verifier-agent.js abc123
if (process.argv[1] && path.basename(process.argv[1]) === path.basename(__filename)) {
  const sid = process.argv[2];
  runVerifierAgent(sid).catch(() => process.exit(1));
}


