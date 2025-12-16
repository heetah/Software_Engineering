// Verifier Agent: 驗證 coder agent 輸出並產生測試計劃
//
// ============================================================
// 主要流程：
// ============================================================
// 1. 讀取 architecture.json
//    - 位置：./data/sessions/<sessionId>/architecture.json
//    - 內容：Architect Agent 生成的系統架構與檔案列表
//
// 2. 驗證檔案存在性（verifyFiles）
//    - 檢查 ./output/<sessionId>/ 中的檔案
//    - 比對 architecture.json 中的 files 清單
//    - 過濾出所有 .js 檔案（排除 node_modules）
//
// 3. 分析 JS 檔案特徵（analyzeJavaScriptFile）
//    - 檢測函式定義（function/arrow function）
//    - 檢測 DOM 操作（document/window API）
//    - 檢測事件監聽器（addEventListener）
//    - 分析函式內部是否包含 DOM 操作
//    - 判斷測試策略：
//      * unit: 純邏輯，無 DOM 操作
//      * integration: 有 DOM 但無純邏輯函式
//      * hybrid: 同時有純邏輯和 DOM 操作函式
//
// 4. 生成測試計劃（generateTestPlans）
//    - 為每個 .js 檔案呼叫 LLM
//    - 提供源碼、分析結果給 LLM
//    - LLM 生成結構化測試計劃（Markdown 格式）
//    - 儲存為：./data/sessions/<sessionId>/<basename>_testplan.md
//
// 5. 產生驗證報告（writeVerificationReport）
//    - 彙整所有檔案驗證結果
//    - 列出測試計劃路徑
//    - 儲存為：./data/sessions/<sessionId>/verify_report.md
//
// ============================================================
// 階段性產出：
// ============================================================
// - <basename>_testplan.md：每個 JS 檔案的測試計劃
// - verify_report.md：驗證摘要報告
//
// ============================================================


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
 * VerifierAgent 負責：
 * - 驗證 coder agent 產生的檔案
 * - 為每個 .js 檔案產生測試計劃（存為 .md）
 * - 產生驗證報告
 * 不負責：產生 Jest 測試檔案或執行測試
 */
export default class VerifierAgent extends BaseAgent {
  constructor() {
    super("Verifier Agent", "Markdown", "verifier", {
      baseUrl: process.env.OPENAI_BASE_URL || process.env.BASE_URL || "https://api.openai.com/v1",
      apiKey: process.env.OPENAI_API_KEY || process.env.API_KEY
    });
    this.temperature = 0.3;
  }

  /**
   * 執行 Verifier Agent 主流程（實例方法）
   * @param {string} sessionId
   * @returns {Promise<{reportPath:string, testPlans:Array}>}
   */
  async runVerifierAgent(sessionId) {
    if (!sessionId) throw new Error("缺少 sessionId");
    try {
      console.log('\n' + '='.repeat(60));
      console.log('Verifier Agent Started');
      console.log('='.repeat(60));

      // 步驟 1: 讀取架構資料
      console.log('\n[Step 1/4] Loading architecture data...');
      const architectureData = await loadArchitecture(sessionId);
      console.log(`  ✓ architecture.json loaded`);

      // 步驟 2: 驗證檔案完整性
      console.log('\n[Step 2/4] Verifying file integrity...');
      const verification = await verifyFiles(sessionId, architectureData);
      console.log(`  ✓ ${verification.existing.length} files exist`);
      if (verification.missing.length > 0) {
        console.log(`  ✗ ${verification.missing.length} files missing`);
      }
      console.log(`  ✓ JS files: ${verification.jsFiles.length}`);

      // 步驟 3: 生成測試計畫 (使用 LLM)
      console.log('\n[Step 3/4] Generating test plans...');
      console.log('  Note: Test plan quality depends on LLM, will be automatically corrected');
      const testPlans = await generateTestPlans(sessionId, verification.jsFiles, this);
      console.log(`  ✓ ${testPlans.length} test plans generated`);

      // 步驟 4: 生成驗證報告
      console.log('\n[Step 4/4] Generating verification report...');
      const reportPath = await writeVerificationReport(sessionId, verification, testPlans);
      console.log(`  ✓ Verification report generated: ${reportPath}`);

      console.log('\n' + '='.repeat(60));
      console.log('Verifier Agent finished');
      console.log('Note: Even if the test plan is incorrect, the Tester Agent will automatically correct it');
      console.log('='.repeat(60) + '\n');

      return { reportPath, testPlans };
    } catch (err) {
      console.error(`\n[ERROR] Verifier Agent failed: ${err.message}`);
      console.error(err.stack);
      throw err;
    }
  }
}

// ====== 核心功能函式 ======

/**
 * 讀取架構 JSON
 * @param {string} sessionId
 * @returns {Promise<object>} architectureData
 */
export async function loadArchitecture(sessionId) {
  const archFile = path.resolve(__dirname, `../data/sessions/${sessionId}/architecture.json`);
  if (!fs.existsSync(archFile)) {
    throw new Error(`architecture.json not found: ${archFile}`);
  }
  try {
    return JSON.parse(await fs.promises.readFile(archFile, "utf-8"));
  } catch (e) {
    throw new Error(`Failed to parse architecture.json: ${e.message}`);
  }
}

/**
 * 驗證 coder agent 產生的檔案
 * @param {string} sessionId
 * @param {object} architectureData
 * @returns {Promise<object>} 包含存在/缺失檔案與 .js 檔案列表
 */
export async function verifyFiles(sessionId, architectureData) {
  const outputDir = path.resolve(__dirname, `../output/${sessionId}`);
  // 從正確的路徑讀取檔案清單
  const requiredFiles = architectureData.output?.coder_instructions?.files || architectureData.files || [];

  const existing = [];
  const missing = [];
  const jsFiles = [];

  for (const fileInfo of requiredFiles) {
    const filePath = path.join(outputDir, fileInfo.path);
    if (fs.existsSync(filePath)) {
      existing.push(fileInfo.path);
      // 檢查是否為 .js 檔案
      if (path.extname(fileInfo.path) === '.js') {
        jsFiles.push({
          path: fileInfo.path,
          fullPath: filePath,
          purpose: fileInfo.purpose || ''
        });
      }
    } else {
      missing.push(fileInfo.path);
    }
  }

  return { existing, missing, jsFiles };
}

/**
 * 分析 JavaScript 檔案的測試需求
 * @param {string} sourceCode - 源碼內容
 * @returns {Object} 分析結果
 */
export function analyzeJavaScriptFile(sourceCode) {
  const analysis = {
    hasFunctions: false,           // 是否有函式定義
    hasDOMOperations: false,       // 是否有 DOM 操作
    hasEventListeners: false,      // 是否有事件綁定
    functions: [],                 // 函式列表
    pureFunctions: [],             // 純邏輯函式列表（不含 DOM）
    testStrategy: 'unit',          // 測試策略：unit / integration / hybrid
    needsJSDOM: false,             // 是否需要 JSDOM
    needsExports: false            // 是否需要加 exports
  };

  // 1. 檢測函式定義並分析其內部是否有 DOM 操作
  // 匹配: function functionName() { ... }
  const functionMatches = [...sourceCode.matchAll(/function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*\{/g)];

  // Phase 1 改進：提取 DOM 偵測為共用函式
  const checkDOMInFunctionBody = (functionBody) => {
    const domInFunctionPatterns = [
      /document\./,
      /window\.(location|alert|confirm|localStorage|sessionStorage|history)/,
      /\.(innerHTML|outerHTML|innerText|textContent)\s*=/,
      /\.(style|classList|className|dataset)\./,
      /\.(appendChild|removeChild|insertBefore|replaceChild)/,
      /\.(setAttribute|getAttribute|removeAttribute)/,
      /\.(addEventListener|removeEventListener)/,
      /\.(getElementById|querySelector|querySelectorAll)/,
      /\.(value|checked|selected|disabled)\s*=/,
      /\.(focus|blur|click|submit)\s*\(/
    ];
    return domInFunctionPatterns.some(pattern => pattern.test(functionBody));
  };

  for (const match of functionMatches) {
    const functionName = match[1];
    const functionStart = match.index;

    // 找到函式的結束位置（簡化版：找到對應的右大括號）
    let braceCount = 0;
    let functionEnd = functionStart;
    for (let i = functionStart; i < sourceCode.length; i++) {
      if (sourceCode[i] === '{') braceCount++;
      if (sourceCode[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          functionEnd = i;
          break;
        }
      }
    }

    const functionBody = sourceCode.substring(functionStart, functionEnd + 1);
    const hasDOMInFunction = checkDOMInFunctionBody(functionBody);

    analysis.functions.push(functionName);
    if (!hasDOMInFunction && functionName !== 'initializeEventListeners') {
      analysis.pureFunctions.push(functionName);
    }
    analysis.hasFunctions = true;
  }

  // 匹配: const functionName = function() {} 或 const functionName = () => {}
  const arrowMatches = [...sourceCode.matchAll(/(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:function\s*\([^)]*\)\s*\{|(?:\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>\s*\{)/g)];
  for (const match of arrowMatches) {
    const functionName = match[1];
    const functionStart = match.index;

    // 找到函式的結束位置
    let braceCount = 0;
    let functionEnd = functionStart;
    let foundFirstBrace = false;
    for (let i = functionStart; i < sourceCode.length; i++) {
      if (sourceCode[i] === '{') {
        braceCount++;
        foundFirstBrace = true;
      }
      if (sourceCode[i] === '}') {
        braceCount--;
        if (foundFirstBrace && braceCount === 0) {
          functionEnd = i;
          break;
        }
      }
    }

    const functionBody = sourceCode.substring(functionStart, functionEnd + 1);
    const hasDOMInFunction = checkDOMInFunctionBody(functionBody);  // 使用共用函式

    analysis.functions.push(functionName);
    if (!hasDOMInFunction && functionName !== 'initializeEventListeners') {
      analysis.pureFunctions.push(functionName);
    }
    analysis.hasFunctions = true;
  }

  // 去重
  analysis.functions = [...new Set(analysis.functions)];
  analysis.pureFunctions = [...new Set(analysis.pureFunctions)];

  // 2. 檢測 DOM 操作（Phase 1 改進：擴展 DOM 偵測模式）
  const domPatterns = [
    // Document 方法
    /document\.(getElementById|querySelector|querySelectorAll|createElement|body|head|title|forms|images|links)/,
    /document\.(createTextNode|createDocumentFragment|createComment|importNode|adoptNode)/,
    /document\.(getElementsByClassName|getElementsByTagName|getElementsByName)/,
    /document\.(write|writeln|open|close|execCommand)/,

    // 元素屬性與方法
    /\.(innerHTML|outerHTML|innerText|textContent)\s*=/,
    /\.(style|classList|className|attributes|dataset)\./,
    /\.(appendChild|removeChild|insertBefore|replaceChild|cloneNode)/,
    /\.(setAttribute|getAttribute|removeAttribute|hasAttribute|toggleAttribute)/,
    /\.(closest|matches|contains|compareDocumentPosition)/,
    /\.(scrollIntoView|focus|blur|click|submit|reset)/,
    /\.(getBoundingClientRect|getClientRects|offsetWidth|offsetHeight|clientWidth|clientHeight)/,
    /\.(parentNode|parentElement|childNodes|children|firstChild|lastChild|nextSibling|previousSibling)/,
    /\.(insertAdjacentHTML|insertAdjacentElement|insertAdjacentText)/,
    /\.(append|prepend|before|after|remove|replaceWith)/,

    // Window 對象
    /window\.(location|alert|confirm|prompt|open|close|print)/,
    /window\.(localStorage|sessionStorage|history|navigator|screen)/,
    /window\.(innerWidth|innerHeight|outerWidth|outerHeight|scrollX|scrollY)/,
    /window\.(requestAnimationFrame|cancelAnimationFrame|setTimeout|setInterval)/,
    /window\.(getComputedStyle|matchMedia|getSelection)/,

    // DOM 事件相關
    /\.(addEventListener|removeEventListener|dispatchEvent)/,
    /\.(onclick|onload|onchange|onsubmit|oninput|onkeydown|onkeyup|onmouseover|onmouseout)/,

    // 表單相關
    /\.(value|checked|selected|disabled|required|placeholder)\s*=/,
    /\.(options|selectedIndex|selectedOptions)/,

    // Canvas 和媒體
    /\.getContext\s*\(/,
    /\.(play|pause|load|currentTime|duration|volume)\s*[=\(]/,

    // 其他常見 DOM 操作
    /new\s+(Image|Audio|Video|Option|FormData|XMLHttpRequest|DOMParser)/,
    /fetch\s*\(/
  ];
  analysis.hasDOMOperations = domPatterns.some(pattern => pattern.test(sourceCode));

  // 3. 檢測事件綁定
  analysis.hasEventListeners = /addEventListener/.test(sourceCode);

  // 4. 檢測是否已有 exports
  analysis.needsExports = !/module\.exports|exports\.[a-zA-Z_$]/.test(sourceCode);

  // 5. 決定測試策略（更精確）
  if (analysis.hasDOMOperations || analysis.hasEventListeners) {
    analysis.needsJSDOM = true;

    // 只有當存在純邏輯函式時才是 hybrid
    // 如果所有函式都包含 DOM 操作，則只做 integration
    if (analysis.pureFunctions.length > 0) {
      analysis.testStrategy = 'hybrid';
    } else {
      analysis.testStrategy = 'integration';
    }
  } else if (analysis.hasFunctions) {
    analysis.testStrategy = 'unit';
  }

  return analysis;
}

/**
 * 為每個 .js 檔案產生測試計劃
 * @param {string} sessionId
 * @param {Array} jsFiles
 * @param {VerifierAgent} agent
 * @returns {Promise<Array>} 測試計劃結果列表
 */
export async function generateTestPlans(sessionId, jsFiles, agent) {
  const results = [];

  for (const file of jsFiles) {
    try {
      const sourceCode = await fs.promises.readFile(file.fullPath, 'utf-8');

      // [新增] 分析檔案特徵
      const analysis = analyzeJavaScriptFile(sourceCode);
      console.log(`[ANALYSIS] ${file.path}:`);
      console.log(`  - Test strategy: ${analysis.testStrategy}`);
      console.log(`  - Needs JSDOM: ${analysis.needsJSDOM ? 'Yes' : 'No'}`);
      console.log(`  - Needs exports: ${analysis.needsExports ? 'Yes' : 'No'}`);
      console.log(`  - Function count: ${analysis.functions.length}`);
      if (analysis.functions.length > 0) {
        console.log(`  - Function list: ${analysis.functions.join(', ')}`);
      }

      // 生成測試計劃（傳入分析結果）
      const testPlan = await generateSingleTestPlan(file, sourceCode, analysis, agent);
      const basename = path.basename(file.path, '.js');
      const testPlanPath = await saveTestPlan(sessionId, basename, testPlan);

      results.push({
        file: file.path,
        success: true,
        testPlanPath,
        analysis  // [新增] 將分析結果附加到返回值
      });
      console.log(`[SUCCESS] Test plan generated: ${file.path} -> ${testPlanPath}`);
    } catch (err) {
      results.push({
        file: file.path,
        success: false,
        error: err.message
      });
      console.error(`[ERROR] Failed to generate test plan: ${file.path} - ${err.message}`);
    }
  }

  return results;
}

/**
 * 為單一 .js 檔案呼叫 LLM 產生測試計劃
 * @param {object} fileInfo
 * @param {string} sourceCode
 * @param {object} analysis - 檔案分析結果
 * @param {VerifierAgent} agent
 * @returns {Promise<string>} 測試計劃內容（Markdown）
 */
export async function generateSingleTestPlan(fileInfo, sourceCode, analysis, agent) {
  const prompt = `You are a test planning expert. Generate a comprehensive test plan for the following JavaScript file.

**File:** ${fileInfo.path}
**Purpose:** ${fileInfo.purpose}

**Code Analysis Results:**
- Test Strategy: ${analysis.testStrategy}
  * unit: Pure logic function tests (no DOM)
  * integration: DOM interaction tests (requires JSDOM)
  * hybrid: Both unit and integration tests needed
- Needs JSDOM: ${analysis.needsJSDOM ? 'Yes' : 'No'}
- Needs module.exports: ${analysis.needsExports ? 'Yes' : 'No'}
- Identified Functions: ${analysis.functions.length > 0 ? analysis.functions.join(', ') : 'None'}
- Has DOM Operations: ${analysis.hasDOMOperations ? 'Yes' : 'No'}
- Has Event Listeners: ${analysis.hasEventListeners ? 'Yes' : 'No'}

**Source Code:**
\`\`\`javascript
${sourceCode}
\`\`\`

**Requirements:**
1. Based on the test strategy (${analysis.testStrategy}), generate appropriate test cases:
   ${analysis.testStrategy === 'unit' ? '- Focus on testing pure logic functions with various input scenarios' : ''}
   ${analysis.testStrategy === 'integration' ? '- Focus on DOM interactions, event handlers, and user workflows' : ''}
   ${analysis.testStrategy === 'hybrid' ? '- Include both unit tests for functions AND integration tests for DOM interactions' : ''}

2. For each testable unit, specify:
   - Test objective
   - Test type (unit/integration)
   - Input scenarios (normal cases, boundary cases, error cases)
   - Expected outputs
   - Dependencies and mocks needed

3. Include source code patching requirements:
   ${analysis.needsExports ? `- Need to add: module.exports = { ${analysis.functions.join(', ')} }` : '- No exports needed (already exists)'}
   ${analysis.hasDOMOperations ? '- Need to wrap DOM code with environment check or provide document mock' : ''}

4. Specify Jest configuration:
   - Test Environment: ${analysis.needsJSDOM ? 'jsdom (DOM testing)' : 'node (pure logic)'}
   ${analysis.needsJSDOM ? '- HTML Setup: Describe the HTML structure needed for tests' : ''}

**Output Format:**
\`\`\`markdown
# Test Plan: ${fileInfo.path}

## Test Strategy
- Type: ${analysis.testStrategy}
- Environment: ${analysis.needsJSDOM ? 'jsdom' : 'node'}

## Source Code Patching Requirements
- Needs exports: ${analysis.needsExports ? 'Yes' : 'No'}
${analysis.needsExports ? `- Export list: ${analysis.functions.join(', ')}` : ''}
- Needs DOM wrapper: ${analysis.hasDOMOperations ? 'Yes' : 'No'}

## Test Cases
${analysis.testStrategy === 'unit' || analysis.testStrategy === 'hybrid' ? '### Unit Tests (Pure Logic)' : ''}
${analysis.testStrategy === 'integration' || analysis.testStrategy === 'hybrid' ? '### Integration Tests (DOM Interaction)' : ''}

[Provide detailed test cases here]
\`\`\`

Generate the test plan following this structure.`;

  const response = await agent.run(prompt, undefined, { model: 'gemini-2.5-flash' });
  return response;
}

/**
 * 儲存測試計劃為 Markdown 檔案
 * @param {string} sessionId
 * @param {string} basename
 * @param {string} testPlanContent
 * @returns {Promise<string>} 儲存路徑
 */
export async function saveTestPlan(sessionId, basename, testPlanContent) {
  const dataDir = path.resolve(__dirname, `../data/sessions/${sessionId}`);
  fs.mkdirSync(dataDir, { recursive: true });

  const testPlanPath = path.join(dataDir, `${basename}_testplan.md`);
  await fs.promises.writeFile(testPlanPath, testPlanContent, 'utf-8');

  return testPlanPath;
}

/**
 * 寫出驗證報告
 * @param {string} sessionId
 * @param {object} verification
 * @param {Array} testPlans
 * @returns {Promise<string>} 報告路徑
 */
export async function writeVerificationReport(sessionId, verification, testPlans) {
  const dataDir = path.resolve(__dirname, `../data/sessions/${sessionId}`);
  fs.mkdirSync(dataDir, { recursive: true });

  const reportPath = path.join(dataDir, 'verify_report.md');

  let report = `# Verification Report\n\n`;
  report += `**Session ID:** ${sessionId}\n`;
  report += `**Generated At:** ${new Date().toISOString()}\n\n`;

  report += `## File Verification\n\n`;
  report += `### Existing Files (${verification.existing.length})\n`;
  verification.existing.forEach(f => {
    report += `- [EXISTS] ${f}\n`;
  });

  if (verification.missing.length > 0) {
    report += `\n### Missing Files (${verification.missing.length})\n`;
    verification.missing.forEach(f => {
      report += `- [MISSING] ${f}\n`;
    });
  }

  report += `\n## Test Plan Generation\n\n`;
  report += `### JavaScript Files Processed (${verification.jsFiles.length})\n\n`;

  const successful = testPlans.filter(t => t.success);
  const failed = testPlans.filter(t => !t.success);

  report += `**Successful:** ${successful.length}\n`;
  report += `**Failed:** ${failed.length}\n\n`;

  if (successful.length > 0) {
    report += `#### Successfully Generated Test Plans\n`;
    successful.forEach(t => {
      report += `- [SUCCESS] ${t.file} -> ${path.basename(t.testPlanPath)}\n`;
    });
  }

  if (failed.length > 0) {
    report += `\n#### Failed Test Plan Generation\n`;
    failed.forEach(t => {
      report += `- [FAILED] ${t.file}\n`;
      report += `  - Error: ${t.error}\n`;
    });
  }

  report += `\n## Summary\n\n`;
  report += `- Total files in architecture: ${verification.existing.length + verification.missing.length}\n`;
  report += `- Files verified: ${verification.existing.length}\n`;
  report += `- JavaScript files found: ${verification.jsFiles.length}\n`;
  report += `- Test plans generated: ${successful.length}\n`;

  await fs.promises.writeFile(reportPath, report, 'utf-8');
  return reportPath;
}

/**
 * 主流程入口（獨立函式版本）
 * @param {string} sessionId
 * @returns {Promise<{reportPath:string, testPlans:Array}>}
 */
export async function runVerifierAgent(sessionId) {
  if (!sessionId) throw new Error("Missing sessionId");

  const agent = new VerifierAgent();
  try {
    console.log(`\n Verifying session: ${sessionId}`);

    // 1. 讀取 architecture.json
    const architectureData = await loadArchitecture(sessionId);
    console.log(`[SUCCESS] architecture.json loaded (${architectureData.files?.length || 0} files)`);

    // 2. 驗證檔案是否存在
    const verification = await verifyFiles(sessionId, architectureData);
    console.log(`[SUCCESS] File verification completed: ${verification.existing.length} existing, ${verification.missing.length} missing, ${verification.jsFiles.length} JS files`);

    // 3. 為每個 .js 檔案產生測試計劃
    const testPlans = await generateTestPlans(sessionId, verification.jsFiles, agent);
    console.log(`[SUCCESS] Test plans generated: ${testPlans.filter(t => t.success).length}/${testPlans.length} successful`);

    // 4. 產生驗證報告
    const reportPath = await writeVerificationReport(sessionId, verification, testPlans);
    console.log(`[SUCCESS] Verification report generated: ${reportPath}`);

    return { reportPath, testPlans };
  } catch (err) {
    console.error(`[ERROR] Verifier Agent failed: ${err.message}`);
    throw err;
  }
}

// 向後相容的別名
export async function runVerifiedAgent(sessionId) {
  return runVerifierAgent(sessionId);
}

// 允許直接以 node 執行此檔案
// 用法： node agents/verifier-agent.js <sessionId>
// 範例： node agents/verifier-agent.js 6f2fd9fb-59dd-46df-8dda-017f8663724b
const isMainModule = () => {
  // 方法1: 使用 process.argv[1] 比對
  const scriptPath = fileURLToPath(import.meta.url);
  const executedPath = process.argv[1];

  // 正規化路徑以進行比較（處理不同的斜線格式）
  const normalizedScript = path.resolve(scriptPath);
  const normalizedExecuted = path.resolve(executedPath);

  return normalizedScript === normalizedExecuted;
};

if (isMainModule()) {
  const sid = process.argv[2];
  if (!sid) {
    console.error('[ERROR] Usage: node verifier-agent.js <sessionId>');
    process.exit(1);
  }
  runVerifierAgent(sid).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}