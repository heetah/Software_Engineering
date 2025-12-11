// agents/tester-agent.js
// Tester Agent：讀取測試計劃、修補源碼、產生 Jest 測試、執行測試、產生報告
//
// ============================================================
// 主要流程：
// ============================================================
// 1. 讀取測試計劃（loadTestPlans）
//    - 掃描 ./data/sessions/<sessionId>/*_testplan.md
//    - 解析每個測試計劃的內容
//
// 2. 建立映射關係（createJsTestPlanMapping）
//    - 讀取 architecture.json
//    - 匹配 JS 檔案與對應的測試計劃
//    - 結構：[{ jsFile, testPlan, analysis }]
//
// 3. 修補源碼（patchSourceCode）
//    - 分析源碼需求（從測試計劃提取）
//    - 處理 DOM 操作：
//      * 提取 addEventListener 相關代碼
//      * 封裝到 initializeEventListeners() 函式
//      * 使用 typeof jest === 'undefined' 判斷是否自動執行
//    - 添加 module.exports：
//      * 導出所有檢測到的函式
//      * 導出 initializeEventListeners（如有 DOM）
//    - 儲存到：./data/sessions/<sessionId>/patched/<filename>
//
// 4. 生成測試檔案（generateJestTests）
//    - 根據 testStrategy 決定生成方式：
//      * unit: generateUnitTest() → <basename>.test.js
//      * integration: generateIntegrationTest() → <basename>.test.js
//      * hybrid: 兩者都生成 → <basename>.unit.test.js + <basename>.integration.test.js
//    - 呼叫 LLM 生成測試代碼
//    - 儲存到：./data/sessions/<sessionId>/__tests__/
//
// 5. 設置 Jest 配置（setupJestConfig）
//    - 根據測試模式生成配置：
//      * unit: testEnvironment='node'
//      * integration: testEnvironment='jsdom'
//      * hybrid: 使用 projects 配置分離環境
//    - 生成：jest.config.cjs, jest.setup.cjs
//
// 6. 執行測試（runJestTests）
//    - 在 session 目錄執行 npx jest --json
//    - 解析 Jest JSON 輸出
//
// 7. 產生報告（writeTestReport）
//    - 轉換 Jest 結果為 Markdown
//    - 儲存為：./data/sessions/<sessionId>/test_report.md
//
// ============================================================
// 階段性產出：
// ============================================================
// - ./data/sessions/<sessionId>/patched/*.js：修補後的源碼
// - ./data/sessions/<sessionId>/__tests__/*.test.js：Jest 測試檔案
// - ./data/sessions/<sessionId>/jest.config.cjs：Jest 配置
// - ./data/sessions/<sessionId>/test_report.md：測試報告
//
// ============================================================
// 潛在問題來源：
// ============================================================
// [Verifier Agent 階段遺留問題]
// 1. 測試計劃格式不完整
//    - 缺少 testStrategy, needsJSDOM 標記
//    - extractAnalysisFromTestPlan() 無法正確解析
//    - 結果：使用預設策略（unit），生成錯誤的測試
//
// 2. 測試計劃中的測試案例定義不清
//    - LLM 無法理解要測試什麼
//    - 生成的測試與源碼不匹配
//
// [Tester Agent - 源碼修補階段]
// 3. patchSourceCode() 提取邏輯錯誤
//    - 複雜的事件監聽器結構無法正確提取
//    - 案例：DOMContentLoaded 包含 querySelector 邏輯
//    - 結果：修補後的源碼語法錯誤
//
// 4. 函式內部 DOM 操作檢測不完整
//    - 無法檢測所有 DOM API 調用
//    - 結果：純邏輯測試嘗試測試有 DOM 的函式
//
// 5. module.exports 注入位置錯誤
//    - 插入到錯誤的代碼位置
//    - 破壞原有代碼結構
//
// [Tester Agent - 測試生成階段]
// 6. LLM 不遵循 prompt 中的路徑指示
//    - 案例：require('../patched/script.js') 被生成為 require('./public/script.js')
//    - 結果：測試無法 import 模組
//
// 7. LLM 混用測試策略
//    - 在 integration 測試中使用 jest.fn() mock
//    - 在 unit 測試中嘗試訪問真實 DOM
//    - 結果：測試執行失敗
//
// 8. 測試環境配置錯誤
//    - hybrid 策略未正確生成 projects 配置
//    - 所有測試在同一環境執行
//    - 結果：環境不匹配導致失敗
//
// 9. 測試檔案命名衝突
//    - 多次執行未清理舊測試檔案
//    - .unit.test.js 和 .test.js 同時存在
//    - 結果：Jest 執行重複或錯誤的測試
//
// [Tester Agent - 測試執行階段]
// 10. Jest 配置與測試不匹配
//     - 配置 node 環境但測試需要 jsdom
//     - 結果：document is not defined
//
// 11. 依賴未安裝
//     - jest, jest-environment-jsdom 未安裝
//     - 結果：Jest 無法執行
//
// 12. 源碼路徑錯誤
//     - 測試中 require 的路徑不存在
//     - 結果：Cannot find module
//
// 13. 源碼在 require 時就執行副作用
//     - 案例：app.listen() 在模組層級執行
//     - 結果：端口被佔用，測試失敗
//
// [Tester Agent - 報告生成階段]
// 14. Jest 輸出解析失敗
//     - Jest 因嚴重錯誤無法生成 JSON
//     - 結果：無法產生測試報告
//
// 15. 測試檔案完全無法執行
//     - 語法錯誤導致 Jest 無法解析
//     - 結果：該測試檔案的所有測試都不出現在報告中
//     - 案例：server.test.js 4個測試全部消失
//
// ============================================================
// 測試策略分類：
// ============================================================
// unit (Node環境):
//   - 測試純邏輯函式
//   - 使用 jest.fn() mock DOM 方法
//   - 不需要真實 DOM
//
// integration (JSDOM環境):
//   - 測試 DOM 互動流程
//   - 使用 beforeEach 設置真實 HTML
//   - 手動調用 initializeEventListeners()
//   - 測試 click/submit 等事件
//
// hybrid (Projects配置):
//   - 同時生成 .unit.test.js 和 .integration.test.js
//   - 使用 Jest projects 在不同環境執行
//   - 純邏輯函式 → unit tests
//   - DOM 依賴函式 → integration tests
//
// ============================================================

// ===== Import Modules =====
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { exec as execCallback } from "child_process";
import { promisify } from "util";
import BaseAgent from "./agent-base.js";
import dotenv from "dotenv";
import { buildJestLLMPrompt } from "./jest-prompt-template.js";

// 載入環境變數
dotenv.config();

// 將 exec 轉成 Promise 版本
const exec = promisify(execCallback);

// 取得目前模組的檔案路徑與目錄
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * TesterAgent 負責：
 * - 讀取測試計劃（*_testplan.md）
 * - 產生 Jest 測試檔案
 * - 執行 Jest
 * - 產生測試報告
 */
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
      model: options.model || 'fast', // Default to Fast/Quantized Model
      ...options
    });
    this.temperature = 0.2;
  }

  /**
   * 執行 Tester Agent 主流程（實例方法）
   * @param {string} sessionId
   * @returns {Promise<{reportPath:string, jestResults:object}>}
   */
  async runTesterAgent(sessionId) {
    if (!sessionId) throw new Error("缺少 sessionId");
    try {
      console.log('\n' + '='.repeat(60));
      console.log('Tester Agent 流程啟動');
      console.log('='.repeat(60));

      // 步驟 1: 讀取架構和測試計畫
      console.log('\n[步驟 1/5] 讀取架構和測試計畫...');
      const architectureData = await loadArchitecture(sessionId);
      const testPlans = await loadTestPlans(sessionId);
      const mapping = createJsTestPlanMapping(architectureData, testPlans);
      console.log(`  ✓ 已載入 ${mapping.length} 個 JS 檔案的測試計畫`);

      // 步驟 2: 生成測試 (包含 Phase 3 智能 export 和 Phase 2 語法修復)
      console.log('\n[步驟 2/5] 生成測試檔案...');
      console.log('  Phase 3: 智能偵測並導出函數/變數');
      console.log('  Phase 2: 驗證並修復語法錯誤');
      await generateJestTests(sessionId, mapping, this);
      console.log('  ✓ 測試檔案生成完成');

      // 步驟 3: 執行 Jest 測試 (包含 Phase 2 預檢)
      console.log('\n[步驟 3/5] 執行 Jest 測試...');
      console.log('  Phase 2: 預檢驗證（語法、依賴、polyfills）');
      const jestResults = await runJestTests(sessionId);
      console.log(`  ✓ 測試完成：${jestResults.numPassedTests}/${jestResults.numTotalTests} 通過`);

      // 步驟 4: 生成測試報告
      console.log('\n[步驟 4/5] 生成測試報告...');
      const reportPath = await writeTestReport(sessionId, jestResults, mapping);
      console.log(`  ✓ 報告已產生：${reportPath}`);

      // 步驟 5: 總結
      console.log('\n[步驟 5/5] 總結');
      console.log(`  - 測試通過率：${((jestResults.numPassedTests / jestResults.numTotalTests) * 100).toFixed(1)}%`);
      console.log(`  - 失敗測試：${jestResults.numFailedTests}`);
      console.log(`  - 報告位置：${reportPath}`);

      console.log('\n' + '='.repeat(60));
      console.log('Tester Agent 流程完成');
      console.log('='.repeat(60) + '\n');

      return { reportPath, jestResults };
    } catch (err) {
      console.error(`\n[ERROR] Tester Agent 失敗: ${err.message}`);
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
    throw new Error(`architecture.json 不存在：${archFile}`);
  }
  try {
    return JSON.parse(await fs.promises.readFile(archFile, "utf-8"));
  } catch (e) {
    throw new Error(`解析 architecture.json 失敗：${e.message}`);
  }
}

/**
 * 從測試計劃內容中提取分析資訊
 * @param {string} testPlanContent
 * @returns {object} analysis 物件
 */
export function extractAnalysisFromTestPlan(testPlanContent) {
  const analysis = {
    testStrategy: 'unit',
    needsJSDOM: false,
    needsExports: false,
    hasDOMOperations: false,
    functions: []
  };

  // 提取測試策略
  const strategyMatch = testPlanContent.match(/Type:\s*(unit|integration|hybrid)/i);
  if (strategyMatch) {
    analysis.testStrategy = strategyMatch[1].toLowerCase();
  }

  // 提取環境需求
  const envMatch = testPlanContent.match(/Environment:\s*(jsdom|node)/i);
  if (envMatch) {
    analysis.needsJSDOM = envMatch[1].toLowerCase() === 'jsdom';
  }

  // 提取 exports 需求
  const exportsMatch = testPlanContent.match(/Needs exports:\s*(Yes|No)/i);
  if (exportsMatch) {
    analysis.needsExports = exportsMatch[1].toLowerCase() === 'yes';
  }

  // 提取函式列表
  const exportListMatch = testPlanContent.match(/Export list:\s*([^\n]+)/i);
  if (exportListMatch) {
    // 移除 Markdown 格式符號和註解
    const rawList = exportListMatch[1]
      .replace(/`/g, '')  // 移除反引號
      .replace(/\([^)]*\)/g, '')  // 移除括號內的註解
      .replace(/-/g, '');  // 移除破折號
    analysis.functions = rawList.split(',').map(f => f.trim()).filter(Boolean);
  }

  // 提取 DOM wrapper 需求
  const domWrapperMatch = testPlanContent.match(/Needs DOM wrapper:\s*(Yes|No)/i);
  if (domWrapperMatch) {
    analysis.hasDOMOperations = domWrapperMatch[1].toLowerCase() === 'yes';
  }

  return analysis;
}

/**
 * 讀取所有測試計劃檔案
 * @param {string} sessionId
 * @returns {Promise<Array>} 測試計劃列表 [{filename, content, analysis}]
 */
export async function loadTestPlans(sessionId) {
  const dataDir = path.resolve(__dirname, `../data/sessions/${sessionId}`);
  const files = await fs.promises.readdir(dataDir);
  const testPlanFiles = files.filter(f => f.endsWith('_testplan.md'));

  const testPlans = [];
  for (const file of testPlanFiles) {
    const content = await fs.promises.readFile(path.join(dataDir, file), 'utf-8');
    // [新增] 從測試計劃中提取 analysis 資訊
    const analysis = extractAnalysisFromTestPlan(content);
    testPlans.push({ filename: file, content, analysis });
  }

  return testPlans;
}

/**
 * 建立 JS 檔案與測試計劃的映射
 * @param {object} architectureData
 * @param {Array} testPlans
 * @returns {Array} 映射列表 [{jsFile, jsPath, testPlan, analysis}]
 */
export function createJsTestPlanMapping(architectureData, testPlans) {
  const jsFiles = (architectureData.output?.coder_instructions?.files || architectureData.files || [])
    .filter(f => path.extname(f.path) === '.js');

  const mapping = [];

  for (const jsFile of jsFiles) {
    const basename = path.basename(jsFile.path, '.js');
    const testPlanFile = testPlans.find(tp => tp.filename === `${basename}_testplan.md`);

    if (testPlanFile) {
      mapping.push({
        jsFile: jsFile.path,
        jsPath: jsFile.path,
        purpose: jsFile.purpose || '',
        testPlan: testPlanFile,
        analysis: testPlanFile.analysis  // [新增] 附加 analysis 資訊
      });
    }
  }

  return mapping;
}

/**
 * 為每個 JS 檔案產生 Jest 測試
 * @param {string} sessionId
 * @param {Array} mapping
 * @param {TesterAgent} agent
 */
export async function generateJestTests(sessionId, mapping, agent) {
  const outputDir = path.resolve(__dirname, `../output/${sessionId}`);
  const sessionDir = path.resolve(__dirname, `../data/sessions/${sessionId}`);
  const testsDir = path.join(sessionDir, '__tests__');
  const patchedDir = path.join(sessionDir, 'patched');
  await fs.promises.mkdir(testsDir, { recursive: true });
  await fs.promises.mkdir(patchedDir, { recursive: true });

  // [新增] 判斷是否有任何檔案需要 JSDOM
  const needsJSDOM = mapping.some(item => item.analysis?.needsJSDOM);

  for (const item of mapping) {
    try {
      const jsFilePath = path.join(outputDir, item.jsFile);
      let sourceCode = await fs.promises.readFile(jsFilePath, 'utf-8');
      const analysis = item.analysis || {};

      console.log(`\n[INFO] 處理 ${item.jsFile}...`);
      console.log(`  - 測試策略: ${analysis.testStrategy || 'unit'}`);
      console.log(`  - 需要 JSDOM: ${analysis.needsJSDOM ? '是' : '否'}`);
      console.log(`  - 需要 exports: ${analysis.needsExports ? '是' : '否'}`);

      // Phase 3 改進：總是進行源碼修補（智能偵測需要導出的內容）
      // 不再只依賴測試計畫的 needsExports 判斷
      let actualSourcePath = jsFilePath;
      let patchedCode = patchSourceCode(sourceCode, analysis);

      // Phase 2+3 改進：驗證並修復 patched 程式碼的語法錯誤
      const fileName = path.basename(item.jsFile);
      const syntaxResult = validateAndFixSyntax(patchedCode, fileName);

      if (!syntaxResult.valid && syntaxResult.wasFixed) {
        // 自動修復成功
        patchedCode = syntaxResult.fixed;
        console.log(`  [SYNTAX] ✓ 自動修復語法錯誤: ${fileName}`);
      } else if (!syntaxResult.valid) {
        // 無法修復，記錄錯誤但繼續
        console.warn(`  [SYNTAX] ✗ 語法錯誤無法自動修復: ${fileName}`);
        console.warn(`    錯誤: ${syntaxResult.errors.map(e => e.message).join('; ')}`);
      }

      const patchedFilePath = path.join(patchedDir, fileName);
      await fs.promises.writeFile(patchedFilePath, patchedCode, 'utf-8');
      actualSourcePath = patchedFilePath;
      console.log(`  [PATCH] 已修補源碼 -> ${fileName}`);

      // [新增] 根據測試策略生成不同的測試文件
      const basename = path.basename(item.jsFile, '.js');

      if (analysis.testStrategy === 'hybrid') {
        // 生成單元測試
        console.log(`[INFO] 生成單元測試...`);
        const unitTestCode = await generateUnitTest(item, sourceCode, agent, sessionId, actualSourcePath, analysis);
        const unitTestPath = path.join(testsDir, `${basename}.unit.test.js`);
        await fs.promises.writeFile(unitTestPath, unitTestCode, 'utf-8');
        console.log(`[SUCCESS] 已產生單元測試：${basename}.unit.test.js`);

        // 生成整合測試
        console.log(`[INFO] 生成整合測試...`);
        const integrationTestCode = await generateIntegrationTest(item, sourceCode, agent, sessionId, actualSourcePath, analysis);
        const integrationTestPath = path.join(testsDir, `${basename}.integration.test.js`);
        await fs.promises.writeFile(integrationTestPath, integrationTestCode, 'utf-8');
        console.log(`[SUCCESS] 已產生整合測試：${basename}.integration.test.js`);
      } else if (analysis.testStrategy === 'integration') {
        // 只生成整合測試
        const integrationTestCode = await generateIntegrationTest(item, sourceCode, agent, sessionId, actualSourcePath, analysis);
        const testFilePath = path.join(testsDir, `${basename}.test.js`);
        await fs.promises.writeFile(testFilePath, integrationTestCode, 'utf-8');
        console.log(`[SUCCESS] 已產生整合測試：${basename}.test.js`);
      } else {
        // 只生成單元測試
        const unitTestCode = await generateUnitTest(item, sourceCode, agent, sessionId, actualSourcePath, analysis);
        const testFilePath = path.join(testsDir, `${basename}.test.js`);
        await fs.promises.writeFile(testFilePath, unitTestCode, 'utf-8');
        console.log(`[SUCCESS] 已產生單元測試：${basename}.test.js`);
      }
    } catch (err) {
      console.error(`[ERROR] 產生 Jest 測試失敗：${item.jsFile} - ${err.message}`);
    }
  }

  // [新增] 設置 Jest 配置（根據測試策略）
  const hasHybrid = mapping.some(item => item.analysis?.testStrategy === 'hybrid');
  await setupJestConfig(sessionId, hasHybrid ? 'hybrid' : (needsJSDOM ? 'integration' : 'unit'));

  return needsJSDOM;
}

/**
 * 生成單元測試（純邏輯測試）
 * @param {object} mappingItem
 * @param {string} sourceCode
 * @param {TesterAgent} agent
 * @param {string} sessionId
 * @param {string} actualSourcePath
 * @param {object} analysis
 * @returns {Promise<string>}
 */
export async function generateUnitTest(mappingItem, sourceCode, agent, sessionId, actualSourcePath, analysis) {
  const basename = path.basename(mappingItem.jsFile, '.js');
  const relativePath = actualSourcePath.includes('patched')
    ? `../patched/${path.basename(actualSourcePath)}`.replace(/\\/g, '/')
    : `../../../../output/${sessionId}/${mappingItem.jsFile}`.replace(/\\/g, '/');

  const prompt = `You are a Jest testing expert. Generate UNIT tests for pure logic functions.

**File:** ${mappingItem.jsFile}
**Test Strategy:** Unit Testing (Pure Logic)
**Environment:** Node.js (no real DOM)
**Import Path:** ${relativePath} (MUST USE EXACTLY THIS PATH)

**Source Code:**
\`\`\`javascript
${sourceCode}
\`\`\`

**Test Plan:**
${mappingItem.testPlan.content}

**CRITICAL INSTRUCTIONS:**

1. **Test pure logic only** - Focus on testing function behavior with different inputs
2. **Mock DOM methods** - Use jest.fn() to mock document.getElementById, etc.
3. **DO NOT use real DOM** - This runs in Node.js environment

4. **REQUIRED IMPORT (DO NOT MODIFY THE PATH):**
   \`\`\`javascript
   const { ${analysis.functions.join(', ')} } = require('${relativePath}');
   \`\`\`

5. **Mock document for each test:**
   \`\`\`javascript
   test('example', () => {
     global.document = {
       getElementById: jest.fn()
         .mockReturnValueOnce({ value: '5' })
         .mockReturnValueOnce({ value: '3' })
         .mockReturnValueOnce({ value: '+' })
         .mockReturnValueOnce({ innerHTML: '' })
     };
     
     const result = someFunction();
     expect(result).toBe(expected);
   });
   \`\`\`

6. **Test cases to include:**
   - Normal cases with valid inputs
   - Boundary cases (zero, negative, max values)
   - Error cases (invalid inputs, null, undefined)

**CRITICAL: You MUST use the exact import path "${relativePath}" in your require() statements. Do not change or guess the path.**

**Output only the complete Jest test code without any markdown formatting or explanations.**`;

  const response = await agent.run(prompt);
  const rawTestCode = extractJavaScriptCode(response);

  // Phase 1 改進：後處理修正 LLM 生成的錯誤路徑
  return fixTestPaths(rawTestCode, relativePath, basename);
}

/**
 * 生成整合測試（DOM 互動測試）
 * @param {object} mappingItem
 * @param {string} sourceCode
 * @param {TesterAgent} agent
 * @param {string} sessionId
 * @param {string} actualSourcePath
 * @param {object} analysis
 * @returns {Promise<string>}
 */
export async function generateIntegrationTest(mappingItem, sourceCode, agent, sessionId, actualSourcePath, analysis) {
  const basename = path.basename(mappingItem.jsFile, '.js');
  const relativePath = actualSourcePath.includes('patched')
    ? `../patched/${path.basename(actualSourcePath)}`.replace(/\\/g, '/')
    : `../../../../output/${sessionId}/${mappingItem.jsFile}`.replace(/\\/g, '/');

  const prompt = `You are a Jest testing expert. Generate INTEGRATION tests for DOM interactions.

**File:** ${mappingItem.jsFile}
**Test Strategy:** Integration Testing (DOM Interaction)
**Environment:** JSDOM (full DOM simulation)
**Import Path:** ${relativePath} (MUST USE EXACTLY THIS PATH)

**Source Code:**
\`\`\`javascript
${sourceCode}
\`\`\`

**Test Plan:**
${mappingItem.testPlan.content}

**CRITICAL INSTRUCTIONS:**

1. **Use JSDOM real DOM** - Set up actual HTML in beforeEach
2. **Reload source on each test** - Clear require cache and re-require
3. **Test user interactions** - Use .click(), .submit(), etc.

4. **REQUIRED TEMPLATE (DO NOT MODIFY THE IMPORT PATH):**
   \`\`\`javascript
   describe('Integration Tests', () => {
     beforeEach(() => {
       // Setup HTML structure based on test plan
       document.body.innerHTML = \`
         <!-- Create HTML matching your source file's DOM requirements -->
       \`;
       
       // Clear cache and reload - USE EXACT PATH: ${relativePath}
       delete require.cache[require.resolve('${relativePath}')];
       const { initializeEventListeners } = require('${relativePath}');
       
       // Initialize event listeners
       if (initializeEventListeners) {
         initializeEventListeners();
       }
     });
     
     afterEach(() => {
       document.body.innerHTML = '';
     });
     
     test('test case name', () => {
       // Get real DOM elements
       const element = document.getElementById('element-id');
       
       // Trigger event or interaction
       element.click();
       
       // Verify result
       expect(document.getElementById('result').innerHTML).toBe('expected');
     });
   });
   \`\`\`

5. **Test cases to include:**
   - Button clicks and form submissions
   - Input value changes
   - DOM updates and rendering
   - Event handling workflows

6. **Mock alert/confirm if needed:**
   \`\`\`javascript
   global.alert = jest.fn();
   // ... trigger code
   expect(global.alert).toHaveBeenCalledWith('message');
   \`\`\`

**CRITICAL: You MUST use the exact import path "${relativePath}" in your require() statements. Do not change or guess the path.**

**Output only the complete Jest test code without any markdown formatting or explanations.**`;

  const response = await agent.run(prompt);
  const rawTestCode = extractJavaScriptCode(response);

  // Phase 1 改進：後處理修正 LLM 生成的錯誤路徑
  return fixTestPaths(rawTestCode, relativePath, basename);
}

/**
 * 為單一 JS 檔案呼叫 LLM 產生 Jest 測試
 * @param {object} mappingItem
 * @param {string} sourceCode
 * @param {TesterAgent} agent
 * @param {string} sessionId
 * @param {string} actualSourcePath - 實際源碼路徑（可能是修補後的）
 * @param {object} analysis - 分析結果
 * @returns {Promise<string>} Jest 測試程式碼
 */
export async function generateSingleJestTest(mappingItem, sourceCode, agent, sessionId, actualSourcePath, analysis = {}) {
  const basename = path.basename(mappingItem.jsFile, '.js');
  const moduleSystem = detectModuleSystem(sourceCode);

  // 分析依賴並生成 mock 程式碼
  const deps = analyzeDependencies(sourceCode);
  const mockCode = generateMockCode(deps);

  // [修改] 決定相對路徑：如果有修補版本，指向 patched/ 目錄
  let relativePath;
  if (actualSourcePath.includes('patched')) {
    relativePath = `../patched/${path.basename(actualSourcePath)}`.replace(/\\/g, '/');
  } else {
    relativePath = `../../../../output/${sessionId}/${mappingItem.jsFile}`.replace(/\\/g, '/');
  }

  // [新增] 根據測試策略調整 prompt
  let strategyHint = '';

  if (analysis.testStrategy === 'integration' || analysis.testStrategy === 'hybrid') {
    strategyHint = `

**CRITICAL TESTING INSTRUCTIONS FOR JSDOM ENVIRONMENT:**

Since this file has DOM operations, you MUST use JSDOM's real DOM instead of mocks:

1. **Setup HTML in beforeEach:**
   \`\`\`javascript
   beforeEach(() => {
     document.body.innerHTML = \`
       <!-- Insert actual HTML structure here -->
     \`;
     
     // Clear require cache and reload source code
     delete require.cache[require.resolve('${relativePath}')];
     require('${relativePath}');
   });
   \`\`\`

2. **Use real DOM methods:**
   - ✅ Use \`document.getElementById('myId')\` directly
   - ✅ Use \`element.click()\` to trigger events
   - ✅ Use \`element.value = '123'\` to set input values
   - ❌ DO NOT use \`jest.fn()\` to mock document methods
   - ❌ DO NOT use \`mockReturnValueOnce()\` for DOM elements

3. **Test Structure:**
   ${analysis.testStrategy === 'hybrid' ? `
   - Create separate describe blocks for unit tests and integration tests
   - Unit tests: Test pure logic functions directly (Module.functionName())
   - Integration tests: Test DOM interactions with beforeEach setup
   ` : `
   - All tests should use beforeEach to setup HTML
   - Test user interactions (clicks, inputs, form submissions)
   `}

**Example:**
\`\`\`javascript
describe('Integration Tests', () => {
  beforeEach(() => {
    document.body.innerHTML = \`<button id="btn">Click</button>\`;
    delete require.cache[require.resolve('${relativePath}')];
    require('${relativePath}');
  });
  
  test('clicking button should work', () => {
    const btn = document.getElementById('btn');
    btn.click();
    // assertions...
  });
});
\`\`\`
`;
  } else {
    strategyHint = '\n**Testing Strategy:** Focus on pure logic unit tests. No DOM setup needed.';
  }

  // 根據模組系統調整 prompt
  let prompt;
  const mockInstructions = mockCode ? `\n\n**CRITICAL: Add these mocks at the beginning of your test file (before any imports/requires):**\n\n\`\`\`javascript\n${mockCode}\`\`\`\n` : '';

  if (moduleSystem === 'commonjs') {
    const basePrompt = buildJestLLMPrompt(
      sourceCode,
      mappingItem.testPlan.content,
      relativePath,
      basename
    );
    // 將 import 替換為 require，並加入 mock 說明
    prompt = basePrompt.replace(
      /import \* as Module from '.*?';/g,
      `const Module = require('${relativePath}');`
    ) + strategyHint + mockInstructions;
  } else {
    prompt = buildJestLLMPrompt(
      sourceCode,
      mappingItem.testPlan.content,
      relativePath,
      basename
    ) + strategyHint + mockInstructions;
  }

  const response = await agent.run(prompt);
  let testCode = extractJavaScriptCode(response);

  // Phase 1 改進：後處理修正 LLM 生成的錯誤路徑
  testCode = fixTestPaths(testCode, relativePath, basename);

  // 確保 mock 在檔案最前面
  if (mockCode && !testCode.includes('jest.mock')) {
    testCode = mockCode + testCode;
  }

  return testCode;
}

/**
 * 從 LLM 回傳中提取 JavaScript 程式碼
 * @param {string} text
 * @returns {string} 程式碼
 */
export function extractJavaScriptCode(text) {
  if (typeof text !== "string") return "";
  const fence = text.match(/```javascript[\s\S]*?```/i) ||
    text.match(/```js[\s\S]*?```/i) ||
    text.match(/```[\s\S]*?```/i);
  let code = fence ? fence[0] : text;
  code = code.replace(/^```(?:javascript|js)?/i, "").replace(/```$/i, "").trim();
  return code;
}

/**
 * Phase 1 改進：修正 LLM 生成的測試檔案中錯誤的 require 路徑
 * @param {string} testCode - LLM 生成的測試程式碼
 * @param {string} correctPath - 正確的相對路徑
 * @param {string} basename - 檔案基本名稱（不含副檔名）
 * @returns {string} 修正後的測試程式碼
 */
export function fixTestPaths(testCode, correctPath, basename) {
  // 常見的錯誤路徑模式
  const wrongPathPatterns = [
    // 1. 錯誤的相對路徑 (LLM 可能猜測的路徑)
    /require\(['"`]\.\/[^'"`]*?(?:script|index|main|app)\.js['"`]\)/g,
    /require\(['"`]\.\.\/[^'"`]*?(?:script|index|main|app)\.js['"`]\)/g,
    /require\(['"`]\.\.\/\.\.\/[^'"`]*?(?:script|index|main|app)\.js['"`]\)/g,

    // 2. 錯誤指向 public/ 目錄
    /require\(['"`][^'"`]*?public\/[^'"`]*\.js['"`]\)/g,

    // 3. 錯誤指向 output/ 但路徑不完整
    /require\(['"`][^'"`]*?output\/(?!.*\/).*\.js['"`]\)/g,

    // 4. 錯誤的絕對路徑
    /require\(['"`]\/[^'"`]*\.js['"`]\)/g,

    // 5. 只有檔名沒有路徑
    new RegExp(`require\\(['"\`]${basename}\\.js['"\`]\\)`, 'g'),

    // 6. 處理 require.resolve 的情況
    /require\.resolve\(['"`]\.\/[^'"`]*?(?:script|index|main|app)\.js['"`]\)/g,
    /require\.resolve\(['"`][^'"`]*?public\/[^'"`]*\.js['"`]\)/g
  ];

  let fixedCode = testCode;
  let fixedCount = 0;

  // 先處理 require.resolve
  const resolvePatterns = [
    /require\.resolve\(['"`](?:\.\.?\/)*(?:public\/)?[^'"`]*\.js['"`]\)/g
  ];

  for (const pattern of resolvePatterns) {
    const matches = fixedCode.match(pattern);
    if (matches) {
      for (const match of matches) {
        // 檢查是否已經是正確路徑
        if (!match.includes(correctPath)) {
          fixedCode = fixedCode.replace(match, `require.resolve('${correctPath}')`);
          fixedCount++;
        }
      }
    }
  }

  // 再處理一般的 require
  for (const pattern of wrongPathPatterns) {
    const matches = fixedCode.match(pattern);
    if (matches) {
      for (const match of matches) {
        // 檢查是否已經是正確路徑
        if (!match.includes(correctPath)) {
          fixedCode = fixedCode.replace(match, `require('${correctPath}')`);
          fixedCount++;
        }
      }
    }
  }

  // 特別處理：確保所有指向 basename 的 require 都使用正確路徑
  const basenameMatcher = new RegExp(`require\\(['"\`][^'"\`]*${basename}(?:\\.js)?['"\`]\\)`, 'g');
  const basenameMatches = fixedCode.match(basenameMatcher);
  if (basenameMatches) {
    for (const match of basenameMatches) {
      if (!match.includes(correctPath)) {
        fixedCode = fixedCode.replace(match, `require('${correctPath}')`);
        fixedCount++;
      }
    }
  }

  // 同樣處理 require.resolve 中的 basename
  const resolveBasenameMatcher = new RegExp(`require\\.resolve\\(['"\`][^'"\`]*${basename}(?:\\.js)?['"\`]\\)`, 'g');
  const resolveBasenameMatches = fixedCode.match(resolveBasenameMatcher);
  if (resolveBasenameMatches) {
    for (const match of resolveBasenameMatches) {
      if (!match.includes(correctPath)) {
        fixedCode = fixedCode.replace(match, `require.resolve('${correctPath}')`);
        fixedCount++;
      }
    }
  }

  if (fixedCount > 0) {
    console.log(`[PATCH] fixTestPaths: 修正了 ${fixedCount} 個錯誤的 require 路徑`);
  }

  return fixedCode;
}

// ============================================================
// Phase 2 改進：測試檔案後驗證與自動修復 (1)
// ============================================================

/**
 * 驗證 JavaScript 程式碼語法是否正確
 * @param {string} code - JavaScript 程式碼
 * @param {string} fileName - 檔案名稱（用於錯誤報告）
 * @returns {object} { valid: boolean, errors: [], fixed: string|null }
 */
export function validateAndFixSyntax(code, fileName = 'unknown.js') {
  const result = {
    valid: true,
    errors: [],
    fixed: null,
    wasFixed: false
  };

  // 第一階段：基礎語法檢查
  try {
    // 使用 Function 構造函數進行基本語法檢查
    new Function(code);
    return result;
  } catch (firstError) {
    result.valid = false;
    result.errors.push({
      line: extractLineNumber(firstError.message),
      message: firstError.message,
      type: 'syntax'
    });
  }

  // 第二階段：嘗試自動修復
  console.log(`[SYNTAX] ${fileName}: 發現語法錯誤，嘗試自動修復...`);
  let fixedCode = code;
  let fixAttempts = [];

  // 修復 1: 分析 Jest 結構並補足缺少的結尾
  // 這比單純計算括號更可靠
  const describeMatches = fixedCode.match(/describe\s*\(\s*['"][^'"]*['"]\s*,\s*(?:\(\s*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>\s*{|\bfunction\s*\(\s*\)\s*{/g) || [];
  const testMatches = fixedCode.match(/\b(?:test|it)\s*\(\s*['"][^'"]*['"]\s*,\s*(?:async\s*)?(?:\(\s*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>\s*{|\bfunction\s*\(\s*\)\s*{/g) || [];
  const closingJestBlocks = fixedCode.match(/}\s*\)\s*;/g) || [];

  const expectedClosings = describeMatches.length + testMatches.length;
  const actualClosings = closingJestBlocks.length;

  if (expectedClosings > actualClosings) {
    const missing = expectedClosings - actualClosings;
    // 補足缺少的 Jest 區塊結尾
    fixedCode = fixedCode.trimEnd() + '\n' + '  });'.repeat(missing).split('});').filter(Boolean).map((_, i) => '});').join('\n');
    fixAttempts.push(`補足 ${missing} 個 Jest 區塊結尾 '});'`);
  }

  // 修復 2: 確保括號配對
  let openBraces = (fixedCode.match(/{/g) || []).length;
  let closeBraces = (fixedCode.match(/}/g) || []).length;

  if (openBraces > closeBraces) {
    const missing = openBraces - closeBraces;
    fixedCode = fixedCode.trimEnd() + '\n' + '}'.repeat(missing);
    fixAttempts.push(`添加 ${missing} 個缺少的 '}'`);
  }

  // 修復 3: 確保圓括號配對
  let openParens = (fixedCode.match(/\(/g) || []).length;
  let closeParens = (fixedCode.match(/\)/g) || []).length;

  if (openParens > closeParens) {
    const missing = openParens - closeParens;
    fixedCode = fixedCode.trimEnd() + ')'.repeat(missing);
    fixAttempts.push(`添加 ${missing} 個缺少的 ')'`);
  }

  // 修復 4: 確保方括號配對
  const openBrackets = (fixedCode.match(/\[/g) || []).length;
  const closeBrackets = (fixedCode.match(/\]/g) || []).length;

  if (openBrackets > closeBrackets) {
    const missing = openBrackets - closeBrackets;
    fixedCode = fixedCode.trimEnd() + ']'.repeat(missing);
    fixAttempts.push(`添加 ${missing} 個缺少的 ']'`);
  }

  // 修復 5: 添加缺少的分號
  // 檢查最後一行是否需要分號
  const lastLine = fixedCode.trim().split('\n').pop();
  if (lastLine && !lastLine.endsWith(';') && !lastLine.endsWith('{') && !lastLine.endsWith('}') && !lastLine.endsWith(',')) {
    if (/^(?:const|let|var|return|throw|export|import)\s/.test(lastLine.trim()) || /\)\s*$/.test(lastLine)) {
      fixedCode = fixedCode.trimEnd() + ';';
      fixAttempts.push('添加缺少的分號');
    }
  }

  // 修復 6: 移除多餘的逗號
  const trailingCommaFix = fixedCode.replace(/,(\s*[}\]])/g, '$1');
  if (trailingCommaFix !== fixedCode) {
    fixedCode = trailingCommaFix;
    fixAttempts.push('移除多餘的尾隨逗號');
  }

  // 修復 7: 修復重複的分號
  const doubleSemicolonFix = fixedCode.replace(/;;+/g, ';');
  if (doubleSemicolonFix !== fixedCode) {
    fixedCode = doubleSemicolonFix;
    fixAttempts.push('移除重複的分號');
  }

  // 修復 8: 確保字串閉合
  const lines = fixedCode.split('\n');
  const fixedLines = lines.map((line, idx) => {
    // 跳過註解行
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
      return line;
    }
    // 檢查單引號（排除轉義的）
    const singleQuotes = (line.match(/(?<!\\)'/g) || []).length;
    if (singleQuotes % 2 !== 0) {
      fixAttempts.push(`Line ${idx + 1}: 修復未閉合的單引號`);
      return line + "'";
    }
    // 檢查雙引號
    const doubleQuotes = (line.match(/(?<!\\)"/g) || []).length;
    if (doubleQuotes % 2 !== 0) {
      fixAttempts.push(`Line ${idx + 1}: 修復未閉合的雙引號`);
      return line + '"';
    }
    return line;
  });
  fixedCode = fixedLines.join('\n');

  // 驗證修復結果
  try {
    new Function(fixedCode);
    result.valid = true;
    result.fixed = fixedCode;
    result.wasFixed = true;
    result.fixAttempts = fixAttempts;
    console.log(`[SYNTAX] ${fileName}: ✓ 自動修復成功 (${fixAttempts.join(', ')})`);
    return result;
  } catch (secondError) {
    result.valid = false;
    result.errors.push({
      line: extractLineNumber(secondError.message),
      message: secondError.message,
      type: 'syntax',
      afterFix: true
    });
    console.log(`[SYNTAX] ${fileName}: ✗ 自動修復失敗 - ${secondError.message}`);
    return result;
  }
}

/**
 * 從錯誤訊息中提取行號
 */
function extractLineNumber(errorMessage) {
  const match = errorMessage.match(/line\s*(\d+)/i) ||
    errorMessage.match(/:(\d+):/);
  return match ? parseInt(match[1]) : null;
}

// ============================================================
// Phase 2/3 改進：智能 Export 偵測與生成
// ============================================================

/**
 * 從源碼中偵測可以導出的函數和變數
 * @param {string} sourceCode - 原始碼
 * @returns {object} { functions: string[], variables: string[], hasApp: boolean, hasServer: boolean }
 */
export function detectExportableFunctions(sourceCode) {
  const result = {
    functions: [],
    variables: [],
    hasApp: false,
    hasServer: false,
    hasExistingExports: false
  };

  // 檢查是否已有 module.exports
  if (/module\.exports\s*=/.test(sourceCode) || /export\s+(default|const|function|class)/.test(sourceCode)) {
    result.hasExistingExports = true;
  }

  // 偵測函數定義
  const functionPatterns = [
    // function name() {}
    /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g,
    // const/let/var name = function() {}
    /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*function\s*\(/g,
    // const/let/var name = () => {}
    /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
    // const/let/var name = async function() {}
    /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*async\s+function\s*\(/g
  ];

  for (const pattern of functionPatterns) {
    let match;
    while ((match = pattern.exec(sourceCode)) !== null) {
      const funcName = match[1];
      // 排除一些不應該導出的函數
      if (!['constructor', 'render', 'toString'].includes(funcName) &&
        !result.functions.includes(funcName)) {
        result.functions.push(funcName);
      }
    }
  }

  // 偵測 Express app 或 HTTP server
  if (/(?:const|let|var)\s+app\s*=\s*(?:express\(\)|require\(['"]express['"]\)\(\))/.test(sourceCode)) {
    result.hasApp = true;
    if (!result.variables.includes('app')) {
      result.variables.push('app');
    }
  }

  // 偵測 http.createServer 或類似
  if (/(?:const|let|var)\s+server\s*=/.test(sourceCode)) {
    result.hasServer = true;
    if (!result.variables.includes('server')) {
      result.variables.push('server');
    }
  }

  // 偵測 initializeEventListeners（Phase 1 生成的）
  if (/function\s+initializeEventListeners/.test(sourceCode)) {
    if (!result.functions.includes('initializeEventListeners')) {
      result.functions.push('initializeEventListeners');
    }
  }

  console.log(`[DETECT] 可導出函數: ${result.functions.join(', ') || '(無)'}`);
  console.log(`[DETECT] 可導出變數: ${result.variables.join(', ') || '(無)'}`);
  console.log(`[DETECT] 已有 exports: ${result.hasExistingExports ? '是' : '否'}`);

  return result;
}

/**
 * 生成 module.exports 程式碼
 * @param {object} exportInfo - detectExportableFunctions 的結果
 * @param {object} options - { forceApp: boolean, includeFunctions: string[] }
 * @returns {string} exports 程式碼
 */
export function generateExportsCode(exportInfo, options = {}) {
  const { forceApp = false, includeFunctions = [] } = options;

  // 如果已有 exports，不重複生成
  if (exportInfo.hasExistingExports) {
    console.log(`[EXPORT] 已有 exports，跳過生成`);
    return '';
  }

  const toExport = [];

  // 加入函數
  for (const func of exportInfo.functions) {
    if (!toExport.includes(func)) {
      toExport.push(func);
    }
  }

  // 加入指定的函數
  for (const func of includeFunctions) {
    if (!toExport.includes(func)) {
      toExport.push(func);
    }
  }

  // 加入 app（如果是 Express server）
  if (exportInfo.hasApp || forceApp) {
    if (!toExport.includes('app')) {
      toExport.push('app');
    }
  }

  if (toExport.length === 0) {
    console.log(`[EXPORT] 沒有可導出的項目`);
    return '';
  }

  const exportsCode = `
// Phase 3 改進：自動生成 exports（用於測試）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ${toExport.join(', ')} };
}
`;

  console.log(`[EXPORT] 生成 exports: { ${toExport.join(', ')} }`);
  return exportsCode;
}

// ============================================================
// Phase 2 改進：依賴分析與自動安裝 (4)
// ============================================================

/**
 * 分析測試檔案需要的依賴
 * @param {string} testCode - 測試程式碼
 * @returns {object} { npm: string[], polyfills: string[] }
 */
export function analyzeTestDependencies(testCode) {
  const dependencies = {
    npm: new Set(),
    polyfills: new Set()
  };

  // 1. 分析 require 語句中的 npm 套件
  const requireMatches = testCode.matchAll(/require\s*\(\s*['"]([^'"./][^'"]*)['"]\s*\)/g);
  for (const match of requireMatches) {
    const moduleName = match[1].split('/')[0]; // 處理 @scope/package
    // 排除 Node.js 內建模組
    const builtins = ['fs', 'path', 'util', 'http', 'https', 'crypto', 'os', 'stream', 'events', 'buffer', 'url', 'querystring', 'assert', 'child_process'];
    if (!builtins.includes(moduleName)) {
      dependencies.npm.add(moduleName);
    }
  }

  // 2. 偵測常見測試套件需求
  if (/supertest|request\s*\(/.test(testCode)) {
    dependencies.npm.add('supertest');
  }
  if (/\bexpress\b/.test(testCode) && !/require\(['"]express['"]\)/.test(testCode)) {
    // 如果測試中引用 express 相關功能但沒有 require
    dependencies.npm.add('express');
  }

  // 3. 偵測需要的 polyfills
  if (/TextEncoder|TextDecoder/.test(testCode)) {
    dependencies.polyfills.add('TextEncoder');
  }
  if (/setImmediate/.test(testCode)) {
    dependencies.polyfills.add('setImmediate');
  }
  if (/fetch\s*\(/.test(testCode) && !/require\(['"]node-fetch['"]\)/.test(testCode)) {
    dependencies.polyfills.add('fetch');
  }

  return {
    npm: Array.from(dependencies.npm),
    polyfills: Array.from(dependencies.polyfills)
  };
}

/**
 * 確保測試依賴已安裝
 * @param {string} sessionId - Session ID
 * @param {string[]} testCodes - 測試程式碼陣列
 * @returns {Promise<object>} 安裝結果
 */
export async function ensureTestDependencies(sessionId, testCodes) {
  const sessionDir = path.resolve(__dirname, `../data/sessions/${sessionId}`);

  // 收集所有測試檔案的依賴
  const allDeps = { npm: new Set(), polyfills: new Set() };
  for (const testCode of testCodes) {
    const deps = analyzeTestDependencies(testCode);
    deps.npm.forEach(d => allDeps.npm.add(d));
    deps.polyfills.forEach(p => allDeps.polyfills.add(p));
  }

  const npmDeps = Array.from(allDeps.npm);
  const polyfills = Array.from(allDeps.polyfills);

  console.log(`\n[DEPS] 依賴分析結果:`);
  console.log(`  NPM 套件: ${npmDeps.length > 0 ? npmDeps.join(', ') : '無'}`);
  console.log(`  Polyfills: ${polyfills.length > 0 ? polyfills.join(', ') : '無'}`);

  const result = {
    npmInstalled: [],
    npmFailed: [],
    polyfillsAdded: []
  };

  if (npmDeps.length === 0 && polyfills.length === 0) {
    console.log(`[DEPS] 無需安裝額外依賴`);
    return result;
  }

  // 1. 處理 NPM 依賴
  if (npmDeps.length > 0) {
    // 檢查 package.json
    const packageJsonPath = path.join(sessionDir, 'package.json');
    let packageJson;

    try {
      packageJson = JSON.parse(await fs.promises.readFile(packageJsonPath, 'utf-8'));
    } catch {
      packageJson = {
        name: `test-session-${sessionId.substring(0, 8)}`,
        version: '1.0.0',
        devDependencies: {}
      };
    }

    // 確保 devDependencies 存在
    packageJson.devDependencies = packageJson.devDependencies || {};

    // 找出缺少的依賴
    const missingDeps = npmDeps.filter(dep =>
      !packageJson.dependencies?.[dep] &&
      !packageJson.devDependencies?.[dep]
    );

    if (missingDeps.length > 0) {
      console.log(`[DEPS] 安裝缺少的依賴: ${missingDeps.join(', ')}`);

      // 添加到 package.json
      for (const dep of missingDeps) {
        packageJson.devDependencies[dep] = '*';
      }
      await fs.promises.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));

      // 執行 npm install
      try {
        const { stdout, stderr } = await exec(`cd "${sessionDir}" && npm install --legacy-peer-deps`, {
          timeout: 60000 // 60 秒超時
        });
        result.npmInstalled = missingDeps;
        console.log(`[DEPS] ✓ 依賴安裝成功: ${missingDeps.join(', ')}`);
      } catch (installError) {
        console.error(`[DEPS] ✗ 依賴安裝失敗: ${installError.message}`);
        result.npmFailed = missingDeps;
      }
    } else {
      console.log(`[DEPS] 所有 NPM 依賴已存在`);
    }
  }

  // 2. 處理 Polyfills（更新 jest.setup.cjs）
  if (polyfills.length > 0) {
    const setupPath = path.join(sessionDir, 'jest.setup.cjs');
    let setupContent = '';

    try {
      setupContent = await fs.promises.readFile(setupPath, 'utf-8');
    } catch {
      setupContent = '// Jest Setup\n';
    }

    let polyfillsToAdd = [];

    // TextEncoder/TextDecoder
    if (polyfills.includes('TextEncoder') && !setupContent.includes('TextEncoder')) {
      polyfillsToAdd.push(`
// Polyfill: TextEncoder/TextDecoder
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
`);
    }

    // setImmediate
    if (polyfills.includes('setImmediate') && !setupContent.includes('setImmediate')) {
      polyfillsToAdd.push(`
// Polyfill: setImmediate
if (typeof global.setImmediate === 'undefined') {
  global.setImmediate = (fn, ...args) => setTimeout(fn, 0, ...args);
}
`);
    }

    // fetch
    if (polyfills.includes('fetch') && !setupContent.includes('global.fetch')) {
      polyfillsToAdd.push(`
// Polyfill: fetch (mock)
if (typeof global.fetch === 'undefined') {
  global.fetch = jest.fn(() => Promise.resolve({ json: () => Promise.resolve({}) }));
}
`);
    }

    if (polyfillsToAdd.length > 0) {
      // 在檔案開頭添加 polyfills
      const newSetupContent = polyfillsToAdd.join('\n') + '\n' + setupContent;
      await fs.promises.writeFile(setupPath, newSetupContent, 'utf-8');
      result.polyfillsAdded = polyfills;
      console.log(`[DEPS] ✓ 已添加 Polyfills: ${polyfills.join(', ')}`);
    }
  }

  return result;
}

// ============================================================
// Phase 2 改進：測試執行前預檢 (5)
// ============================================================

/**
 * 在執行 Jest 前進行全面預檢
 * @param {string} sessionId - Session ID
 * @returns {Promise<object>} 預檢結果
 */
export async function preTestValidation(sessionId) {
  const sessionDir = path.resolve(__dirname, `../data/sessions/${sessionId}`);
  const testsDir = path.join(sessionDir, '__tests__');
  const patchedDir = path.join(sessionDir, 'patched');

  console.log(`\n[PRE-TEST] 開始預檢 Session ${sessionId.substring(0, 8)}...`);

  const result = {
    passed: true,
    errors: [],
    warnings: [],
    fixes: [],
    summary: {}
  };

  try {
    // 1. 檢查測試目錄是否存在
    if (!fs.existsSync(testsDir)) {
      result.errors.push({ type: 'directory', message: '測試目錄不存在', path: testsDir });
      result.passed = false;
      return result;
    }

    // 2. 獲取所有測試檔案
    const testFiles = (await fs.promises.readdir(testsDir)).filter(f => f.endsWith('.test.js'));

    if (testFiles.length === 0) {
      result.errors.push({ type: 'no-tests', message: '沒有找到測試檔案' });
      result.passed = false;
      return result;
    }

    result.summary.testFiles = testFiles.length;

    // 3. 檢查每個測試檔案
    const testCodes = [];
    for (const testFile of testFiles) {
      const testPath = path.join(testsDir, testFile);
      let testCode;

      try {
        testCode = await fs.promises.readFile(testPath, 'utf-8');
        testCodes.push(testCode);
      } catch (readError) {
        result.errors.push({ type: 'read-error', file: testFile, message: `無法讀取: ${readError.message}` });
        continue;
      }

      // 3a. 語法檢查
      const validation = validateAndFixSyntax(testCode, testFile);
      if (!validation.valid) {
        if (validation.wasFixed) {
          // 修復成功，寫回檔案
          await fs.promises.writeFile(testPath, validation.fixed, 'utf-8');
          result.fixes.push({ file: testFile, fixes: validation.fixAttempts });
        } else {
          result.errors.push({
            type: 'syntax',
            file: testFile,
            message: validation.errors[0].message,
            line: validation.errors[0].line
          });
          result.passed = false;
        }
      }

      // 3b. 檢查 require 路徑
      const requireMatches = [...testCode.matchAll(/require\s*\(\s*['"](\.\.[^'"]+)['"]\s*\)/g)];
      for (const match of requireMatches) {
        const requiredPath = path.resolve(testsDir, match[1]);
        if (!fs.existsSync(requiredPath) && !fs.existsSync(requiredPath + '.js')) {
          result.warnings.push({
            type: 'missing-file',
            file: testFile,
            message: `找不到檔案: ${match[1]}`,
            requiredPath
          });
        }
      }
    }

    // 4. 檢查 patched 檔案（如果存在）
    if (fs.existsSync(patchedDir)) {
      const patchedFiles = (await fs.promises.readdir(patchedDir)).filter(f => f.endsWith('.js'));
      result.summary.patchedFiles = patchedFiles.length;

      for (const patchedFile of patchedFiles) {
        const patchedPath = path.join(patchedDir, patchedFile);
        let patchedCode;

        try {
          patchedCode = await fs.promises.readFile(patchedPath, 'utf-8');
        } catch (readError) {
          result.errors.push({ type: 'read-error', file: `patched/${patchedFile}`, message: readError.message });
          continue;
        }

        // 語法檢查
        const validation = validateAndFixSyntax(patchedCode, `patched/${patchedFile}`);
        if (!validation.valid) {
          if (validation.wasFixed) {
            await fs.promises.writeFile(patchedPath, validation.fixed, 'utf-8');
            result.fixes.push({ file: `patched/${patchedFile}`, fixes: validation.fixAttempts });
          } else {
            result.errors.push({
              type: 'syntax',
              file: `patched/${patchedFile}`,
              message: validation.errors[0].message
            });
            result.passed = false;
          }
        }
      }
    }

    // 5. 確保依賴已安裝
    if (testCodes.length > 0) {
      const depResult = await ensureTestDependencies(sessionId, testCodes);
      if (depResult.npmFailed.length > 0) {
        result.warnings.push({
          type: 'deps-failed',
          message: `部分依賴安裝失敗: ${depResult.npmFailed.join(', ')}`
        });
      }
      result.summary.depsInstalled = depResult.npmInstalled;
      result.summary.polyfillsAdded = depResult.polyfillsAdded;
    }

    // 6. 檢查 Jest 配置
    const jestConfigPath = path.join(sessionDir, 'jest.config.cjs');
    if (!fs.existsSync(jestConfigPath)) {
      result.warnings.push({ type: 'no-config', message: 'jest.config.cjs 不存在' });
    }

  } catch (error) {
    result.errors.push({ type: 'unexpected', message: error.message });
    result.passed = false;
  }

  // 輸出結果
  console.log(`\n[PRE-TEST] 預檢結果:`);
  console.log(`  測試檔案: ${result.summary.testFiles || 0} 個`);
  console.log(`  修補檔案: ${result.summary.patchedFiles || 0} 個`);

  if (result.fixes.length > 0) {
    console.log(`  ✓ 自動修復: ${result.fixes.length} 個檔案`);
    for (const fix of result.fixes) {
      console.log(`    - ${fix.file}: ${fix.fixes.join(', ')}`);
    }
  }

  if (result.warnings.length > 0) {
    console.log(`  ⚠️ 警告: ${result.warnings.length} 個`);
    for (const warn of result.warnings) {
      console.log(`    - ${warn.file || 'General'}: ${warn.message}`);
    }
  }

  if (result.errors.length > 0) {
    console.log(`  ❌ 錯誤: ${result.errors.length} 個`);
    for (const err of result.errors) {
      console.log(`    - ${err.file || 'General'}: ${err.message}`);
    }
  }

  if (result.passed) {
    console.log(`\n[PRE-TEST] ✅ 預檢通過，可以執行測試\n`);
  } else {
    console.log(`\n[PRE-TEST] ❌ 預檢失敗，發現 ${result.errors.length} 個錯誤\n`);
  }

  return result;
}

/**
 * 檢測原始碼使用的模組系統
 * @param {string} sourceCode
 * @returns {string} 'commonjs' 或 'esm'
 */
export function detectModuleSystem(sourceCode) {
  // 檢查是否有 require 或 module.exports
  const hasRequire = /\brequire\s*\(/i.test(sourceCode);
  const hasModuleExports = /\bmodule\.exports\s*=/i.test(sourceCode);
  const hasExports = /\bexports\./i.test(sourceCode);

  // 檢查是否有 ES modules 語法
  const hasImport = /\bimport\s+.*\bfrom\b/i.test(sourceCode);
  const hasExport = /\bexport\s+(default|const|function|class)/i.test(sourceCode);

  // 如果有 CommonJS 語法，返回 commonjs
  if (hasRequire || hasModuleExports || hasExports) {
    return 'commonjs';
  }

  // 如果有 ES modules 語法，返回 esm
  if (hasImport || hasExport) {
    return 'esm';
  }

  // 預設使用 commonjs（因為 Node.js 預設）
  return 'commonjs';
}

/**
 * 分析原始碼中需要 mock 的依賴
 * @param {string} sourceCode
 * @returns {object} { electron: [...], browser: [...], nodejs: [...] }
 */
export function analyzeDependencies(sourceCode) {
  const deps = {
    electron: new Set(),
    browser: new Set(),
    nodejs: new Set()
  };

  // 檢測 Electron API
  if (/ipcRenderer/i.test(sourceCode)) deps.electron.add('ipcRenderer');
  if (/\bremote\./i.test(sourceCode)) deps.electron.add('remote');
  if (/BrowserWindow/i.test(sourceCode)) deps.electron.add('BrowserWindow');
  if (/\bapp\./i.test(sourceCode) && /electron/i.test(sourceCode)) deps.electron.add('app');

  // 檢測瀏覽器 API
  if (/\bwindow\./i.test(sourceCode)) deps.browser.add('window');
  if (/\bdocument\./i.test(sourceCode)) deps.browser.add('document');
  if (/localStorage/i.test(sourceCode)) deps.browser.add('localStorage');
  if (/sessionStorage/i.test(sourceCode)) deps.browser.add('sessionStorage');

  // 檢測 Node.js 模組
  if (/require\(['"]fs['"]\)/i.test(sourceCode)) deps.nodejs.add('fs');
  if (/require\(['"]path['"]\)/i.test(sourceCode)) deps.nodejs.add('path');
  if (/require\(['"]http['"]\)/i.test(sourceCode)) deps.nodejs.add('http');

  // 轉換 Set 為 Array
  return {
    electron: Array.from(deps.electron),
    browser: Array.from(deps.browser),
    nodejs: Array.from(deps.nodejs)
  };
}

/**
 * 根據依賴生成 mock 程式碼
 * @param {object} deps
 * @returns {string}
 */
export function generateMockCode(deps) {
  let mockCode = '';

  // Electron mocks
  if (deps.electron.length > 0) {
    mockCode += `// Mock Electron APIs\njest.mock('electron', () => ({\n`;

    if (deps.electron.includes('ipcRenderer')) {
      mockCode += `  ipcRenderer: {\n    send: jest.fn(),\n    on: jest.fn(),\n    invoke: jest.fn(),\n    removeListener: jest.fn(),\n  },\n`;
    }
    if (deps.electron.includes('remote')) {
      mockCode += `  remote: {\n    getCurrentWindow: jest.fn(() => ({\n      close: jest.fn(),\n      minimize: jest.fn(),\n      maximize: jest.fn(),\n    })),\n  },\n`;
    }
    if (deps.electron.includes('BrowserWindow')) {
      mockCode += `  BrowserWindow: jest.fn().mockImplementation(() => ({\n    loadFile: jest.fn(),\n    on: jest.fn(),\n    webContents: { openDevTools: jest.fn() },\n  })),\n`;
    }
    if (deps.electron.includes('app')) {
      mockCode += `  app: {\n    whenReady: jest.fn(() => Promise.resolve()),\n    on: jest.fn(),\n    quit: jest.fn(),\n    getPath: jest.fn((name) => '/mock/path'),\n  },\n`;
    }

    mockCode += `}));\n\n`;
  }

  // Browser globals mocks
  if (deps.browser.length > 0) {
    mockCode += `// Mock browser globals\n`;

    if (deps.browser.includes('window') || deps.browser.includes('localStorage')) {
      mockCode += `global.window = global.window || {};\n`;
      if (deps.browser.includes('localStorage')) {
        mockCode += `global.window.localStorage = {\n  getItem: jest.fn(),\n  setItem: jest.fn(),\n  removeItem: jest.fn(),\n  clear: jest.fn(),\n};\n`;
      }
    }

    if (deps.browser.includes('document')) {
      mockCode += `global.document = {\n  getElementById: jest.fn(),\n  querySelector: jest.fn(),\n  querySelectorAll: jest.fn(),\n  addEventListener: jest.fn(),\n  createElement: jest.fn(),\n};\n`;
    }

    mockCode += `\n`;
  }

  return mockCode;
}

/**
 * 修補源碼使其可測試
 * @param {string} sourceCode - 原始源碼
 * @param {object} analysis - 分析結果
 * @returns {string} 修補後的源碼
 */
export function patchSourceCode(sourceCode, analysis) {
  let patchedCode = sourceCode;
  const patches = [];

  // Phase 1 改進：更穩健的 DOM 初始化提取
  // 1. 如果有 DOM 操作，提取事件綁定代碼到獨立函數
  if (analysis.hasDOMOperations && /addEventListener|\.on\w+\s*=/.test(sourceCode)) {
    try {
      // 使用更精確的 DOM 初始化模式匹配
      const domInitPatterns = [
        // DOMContentLoaded 監聽器
        /document\.addEventListener\s*\(\s*['"]DOMContentLoaded['"]\s*,\s*(?:function\s*\([^)]*\)|(?:\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>)\s*\{/g,
        // window.onload
        /window\.onload\s*=\s*(?:function\s*\([^)]*\)|(?:\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>)\s*\{/g,
        // $(document).ready 或 jQuery
        /\$\(document\)\.ready\s*\(\s*function\s*\([^)]*\)\s*\{/g,
        // 頂層 addEventListener（非函式內）
        /^(?:\s*)(?!function|const|let|var|class|if|for|while).*\.addEventListener\s*\(/gm
      ];

      let extractedCode = [];
      let remainingCode = sourceCode;

      // 嘗試提取 DOMContentLoaded 事件處理器
      const domContentLoadedMatch = sourceCode.match(/document\.addEventListener\s*\(\s*['"]DOMContentLoaded['"]\s*,\s*(function\s*\([^)]*\)|(?:\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>)\s*\{/);

      if (domContentLoadedMatch) {
        // 找到對應的結束括號
        const startIndex = domContentLoadedMatch.index;
        const braceStart = sourceCode.indexOf('{', startIndex);
        let braceCount = 0;
        let endIndex = braceStart;

        for (let i = braceStart; i < sourceCode.length; i++) {
          if (sourceCode[i] === '{') braceCount++;
          if (sourceCode[i] === '}') {
            braceCount--;
            if (braceCount === 0) {
              // 找到函式體結尾，繼續找到 addEventListener 的結尾
              endIndex = i;
              // 跳過可能的 ");" 或 ")"
              const afterBrace = sourceCode.substring(i + 1, i + 5);
              const closeMatch = afterBrace.match(/^\s*\)\s*;?/);
              if (closeMatch) {
                endIndex = i + closeMatch[0].length;
              }
              break;
            }
          }
        }

        // 提取函式體內容
        const functionBody = sourceCode.substring(braceStart + 1, endIndex);
        extractedCode.push(functionBody);

        // 從原始碼中移除這段
        remainingCode = sourceCode.substring(0, startIndex) + sourceCode.substring(endIndex + 1);
        patches.push('Extracted DOMContentLoaded handler');
      } else {
        // 如果沒有 DOMContentLoaded，嘗試提取頂層的 addEventListener
        const lines = sourceCode.split('\n');
        const codeLines = [];
        const eventLines = [];
        let inEventBlock = false;
        let braceDepth = 0;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const trimmedLine = line.trim();

          // 檢查是否為函式定義（不應提取）
          const isFunctionDef = /^(function\s+\w+|const\s+\w+\s*=\s*function|const\s+\w+\s*=\s*\([^)]*\)\s*=>)/.test(trimmedLine);

          if (!isFunctionDef && !inEventBlock && /\.addEventListener\s*\(|\.onclick\s*=|\.onchange\s*=/.test(line)) {
            inEventBlock = true;
            braceDepth = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
            eventLines.push(line);
          } else if (inEventBlock) {
            braceDepth += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
            eventLines.push(line);

            // 檢查是否結束
            if (braceDepth <= 0 && /[)};]\s*$/.test(trimmedLine)) {
              inEventBlock = false;
            }
          } else {
            codeLines.push(line);
          }
        }

        if (eventLines.length > 0) {
          extractedCode = eventLines;
          remainingCode = codeLines.join('\n');
        }
      }

      // 如果成功提取，創建初始化函數
      if (extractedCode.length > 0) {
        const extractedContent = Array.isArray(extractedCode)
          ? extractedCode.join('\n')
          : extractedCode;

        const initFunction = `
// Phase 1 改進：提取的 DOM 初始化函數（用於測試）
function initializeEventListeners() {
  if (typeof document !== 'undefined' && document.getElementById) {
${extractedContent.split('\n').map(line => '    ' + line).join('\n')}
  }
}

// 在瀏覽器環境中自動初始化（測試環境除外）
if (typeof window !== 'undefined' && typeof jest === 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeEventListeners);
  } else {
    initializeEventListeners();
  }
}
`;

        patchedCode = remainingCode + initFunction;
        patches.push('Extracted DOM initialization to initializeEventListeners()');
      }
    } catch (extractError) {
      console.log(`[WARN] DOM 提取失敗，保留原始碼: ${extractError.message}`);
      // 如果提取失敗，保持原始碼不變
    }
  }

  // Phase 1 改進：包裝 server.listen() 以避免測試時啟動伺服器
  if (/(?:app|server)\.listen\s*\(/.test(patchedCode)) {
    // 檢查是否已經有包裝
    if (!/require\.main\s*===\s*module/.test(patchedCode)) {
      // 找到 listen 調用並包裝它
      patchedCode = patchedCode.replace(
        /((?:const|let|var)?\s*(?:\w+\s*=\s*)?(?:app|server)\.listen\s*\([^)]*\)[^;]*;?)/g,
        (match) => {
          return `// Phase 1 改進：只在直接執行時啟動伺服器（測試時不啟動）
if (require.main === module) {
  ${match}
}`;
        }
      );
      patches.push('Wrapped server.listen() with require.main check');
    }
  }

  // Phase 3 改進：智能 exports 偵測與生成
  // 不再只依賴測試計畫的 needsExports，而是自動偵測源碼中可導出的函數
  const exportInfo = detectExportableFunctions(patchedCode);

  // 決定是否需要生成 exports
  const shouldGenerateExports =
    // 測試計畫明確要求
    analysis.needsExports ||
    // 有可導出的函數或 app
    (exportInfo.functions.length > 0 || exportInfo.hasApp) ||
    // 有 DOM 操作（需要導出 initializeEventListeners）
    analysis.hasDOMOperations;

  if (shouldGenerateExports && !exportInfo.hasExistingExports) {
    // 合併測試計畫指定的函數和自動偵測的函數
    const additionalFunctions = analysis.functions || [];
    const exportsCode = generateExportsCode(exportInfo, {
      forceApp: exportInfo.hasApp,
      includeFunctions: additionalFunctions
    });

    if (exportsCode) {
      patchedCode += exportsCode;
      const exportedItems = [
        ...exportInfo.functions,
        ...exportInfo.variables
      ].filter((v, i, a) => a.indexOf(v) === i);
      patches.push(`Added smart exports: ${exportedItems.join(', ')}`);
    }
  }

  if (patches.length > 0) {
    console.log(`[PATCH] ${patches.join('; ')}`);
  }

  return patchedCode;
}

/**
 * 設置 Jest 配置檔案和全局 setup
 * @param {string} sessionId
 * @param {string} testMode - 'unit', 'integration', 或 'hybrid'
 */
export async function setupJestConfig(sessionId, testMode = 'unit') {
  const sessionDir = path.resolve(__dirname, `../data/sessions/${sessionId}`);

  // 創建 jest.setup.js - 全局 mock 設定
  const setupContent = `// jest.setup.js - 全局 mock 設定
// 這個檔案會在所有測試執行前載入

// Mock Electron (如果任何測試需要)
if (!global.mockElectronSetup) {
  global.mockElectronSetup = true;
  
  // 只在需要時設置基礎 mock
  global.electron = {
    ipcRenderer: {
      send: jest.fn(),
      on: jest.fn(),
      invoke: jest.fn(),
      removeListener: jest.fn(),
    },
    remote: {
      getCurrentWindow: jest.fn(() => ({
        close: jest.fn(),
        minimize: jest.fn(),
      })),
    },
  };
}

// Mock 瀏覽器環境 (如果需要)
global.window = global.window || {
  localStorage: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
  },
  location: {
    href: 'http://localhost',
    reload: jest.fn(),
  },
  APP_CONFIG: {
    API_BASE_URL: '/api',
  },
};

global.document = global.document || {
  getElementById: jest.fn(),
  querySelector: jest.fn(),
  querySelectorAll: jest.fn(),
  addEventListener: jest.fn(),
  createElement: jest.fn(),
};

// 抑制 console.error 的某些警告（可選）
const originalError = console.error;
console.error = (...args) => {
  if (
    typeof args[0] === 'string' &&
    (args[0].includes('Not implemented: HTMLFormElement.prototype.submit') ||
     args[0].includes('Not implemented: HTMLCanvasElement.prototype.getContext'))
  ) {
    return;
  }
  originalError.call(console, ...args);
};
`;

  const setupPath = path.join(sessionDir, 'jest.setup.cjs');
  await fs.promises.writeFile(setupPath, setupContent, 'utf-8');

  // 創建 jest.config.cjs
  let jestConfig;

  if (testMode === 'hybrid') {
    // Hybrid 模式：使用 projects 分離單元測試和整合測試
    jestConfig = `module.exports = {
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      testMatch: ['**/__tests__/*.unit.test.js'],
      collectCoverage: false,
      verbose: true,
      moduleFileExtensions: ['js', 'json', 'cjs'],
      transform: {},
      testTimeout: 10000,
      setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs']
    },
    {
      displayName: 'integration',
      testEnvironment: 'jsdom',
      testMatch: ['**/__tests__/*.integration.test.js'],
      collectCoverage: false,
      verbose: true,
      moduleFileExtensions: ['js', 'json', 'cjs'],
      transform: {},
      testTimeout: 10000,
      setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs']
    }
  ],
  moduleDirectories: ['node_modules', '<rootDir>']
};
`;
    console.log(`[SUCCESS] Jest 配置已設置 (hybrid: unit[node] + integration[jsdom])`);
  } else if (testMode === 'integration') {
    // 純整合測試：使用 jsdom
    jestConfig = `module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.js'],
  collectCoverage: false,
  verbose: true,
  moduleFileExtensions: ['js', 'json', 'cjs'],
  transform: {},
  testTimeout: 10000,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'],
  moduleDirectories: ['node_modules', '<rootDir>']
};
`;
    console.log(`[SUCCESS] Jest 配置已設置 (integration: jsdom)`);
  } else {
    // 純單元測試：使用 node
    jestConfig = `module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.js'],
  collectCoverage: false,
  verbose: true,
  moduleFileExtensions: ['js', 'json', 'cjs'],
  transform: {},
  testTimeout: 10000,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'],
  moduleDirectories: ['node_modules', '<rootDir>']
};
`;
    console.log(`[SUCCESS] Jest 配置已設置 (unit: node)`);
  }

  const jestConfigPath = path.join(sessionDir, 'jest.config.cjs');
  await fs.promises.writeFile(jestConfigPath, jestConfig, 'utf-8');
}

/**
 * 執行 Jest 測試
 * @param {string} sessionId
/**
 * 執行 Jest 測試
 * @param {string} sessionId
 * @returns {Promise<object>} Jest 測試結果
 */
export async function runJestTests(sessionId) {
  const sessionDir = path.resolve(__dirname, `../data/sessions/${sessionId}`);
  const testsDir = path.join(sessionDir, '__tests__');

  // Phase 2 改進：執行預檢
  console.log('\n[PHASE 2] 執行測試前預檢...');
  const preCheckResult = await preTestValidation(sessionId);

  if (!preCheckResult.passed) {
    console.log('[WARN] 預檢發現錯誤，但仍嘗試執行測試');
    // 即使預檢失敗也繼續執行，讓 Jest 報告完整錯誤
  }

  // 檢查是否有測試檔案
  if (!fs.existsSync(testsDir)) {
    console.log('[WARN] 沒有找到測試檔案');
    return { success: false, results: null, preCheckResult };
  }

  const testFiles = await fs.promises.readdir(testsDir);
  if (testFiles.length === 0) {
    console.log('[WARN] 測試目錄為空');
    return { success: false, results: null, preCheckResult };
  }

  console.log(`\n[INFO] 執行 Jest 測試 (${testFiles.length} 個測試檔案)...`);

  try {
    const cmd = `npx jest --json --config=jest.config.cjs`;
    const { stdout } = await exec(cmd, {
      cwd: sessionDir,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 10
    });

    try {
      const results = JSON.parse(stdout);
      return { success: true, results };
    } catch {
      return { success: false, results: null, rawOutput: stdout };
    }
  } catch (err) {
    // Jest 失敗時也會輸出結果到 stdout
    if (err.stdout) {
      try {
        const results = JSON.parse(err.stdout);
        return { success: false, results };
      } catch {
        return { success: false, results: null, error: err.message };
      }
    }
    return { success: false, results: null, error: err.message };
  }
}

/**
 * 寫出測試報告
 * @param {string} sessionId
 * @param {object} jestResults
 * @param {Array} mapping
 * @returns {Promise<string>} 報告路徑
 */
export async function writeTestReport(sessionId, jestResults, mapping) {
  const dataDir = path.resolve(__dirname, `../data/sessions/${sessionId}`);
  await fs.promises.mkdir(dataDir, { recursive: true });

  const reportPath = path.join(dataDir, 'test_report.md');

  let report = `# Test Report\n\n`;
  report += `**Session ID:** ${sessionId}\n`;
  report += `**Generated At:** ${new Date().toISOString()}\n\n`;

  if (!jestResults.results) {
    report += `## Status\n\n`;
    report += `⚠️  Jest 執行失敗或無測試結果\n\n`;
    if (jestResults.error) {
      report += `**Error:** ${jestResults.error}\n\n`;
    }
  } else {
    const results = jestResults.results;
    const summary = results.numTotalTests ? {
      total: results.numTotalTests || 0,
      passed: results.numPassedTests || 0,
      failed: results.numFailedTests || 0,
      pending: results.numPendingTests || 0
    } : { total: 0, passed: 0, failed: 0, pending: 0 };

    report += `## Summary\n\n`;
    report += `- **Total Tests:** ${summary.total}\n`;
    report += `- **Passed:** [PASS] ${summary.passed}\n`;
    report += `- **Failed:** [FAIL] ${summary.failed}\n`;
    report += `- **Pending:** [PEND] ${summary.pending}\n`;
    report += `- **Success Rate:** ${summary.total > 0 ? ((summary.passed / summary.total) * 100).toFixed(2) : 0}%\n\n`;

    if (results.testResults && results.testResults.length > 0) {
      report += `## Test Files\n\n`;

      for (const testResult of results.testResults) {
        const fileName = path.basename(testResult.name || testResult.testFilePath || 'unknown');
        const status = testResult.status === 'passed' ? '[PASS]' : '[FAIL]';

        report += `### ${status} ${fileName}\n\n`;

        if (testResult.assertionResults) {
          for (const assertion of testResult.assertionResults) {
            const assertionStatus = assertion.status === 'passed' ? '[PASS]' : '[FAIL]';
            report += `- ${assertionStatus} ${assertion.title}\n`;

            if (assertion.status === 'failed' && assertion.failureMessages) {
              for (const msg of assertion.failureMessages) {
                report += `  \`\`\`\n  ${msg.substring(0, 500)}\n  \`\`\`\n`;
              }
            }
          }
        }
        report += `\n`;
      }
    }
  }

  report += `## Generated Tests\n\n`;
  report += `**Total JS Files Tested:** ${mapping.length}\n\n`;
  mapping.forEach(m => {
    report += `- ${m.jsFile}\n`;
  });

  await fs.promises.writeFile(reportPath, report, 'utf-8');
  return reportPath;
}

/**
 * 主流程入口（獨立函式版本）
 * @param {string} sessionId
 * @returns {Promise<{reportPath:string, jestResults:object}>}
 */
export async function runTesterAgent(sessionId) {
  if (!sessionId) throw new Error("缺少 sessionId");

  const agent = new TesterAgent();
  try {
    console.log(`\n🧪 開始測試 session: ${sessionId}`);

    // 1. 讀取 architecture.json
    const architectureData = await loadArchitecture(sessionId);
    console.log(`✅ 已載入 architecture.json`);

    // 2. 讀取所有測試計劃
    const testPlans = await loadTestPlans(sessionId);
    console.log(`✅ 已載入 ${testPlans.length} 個測試計劃`);

    // 3. 建立映射
    const mapping = createJsTestPlanMapping(architectureData, testPlans);
    console.log(`✅ 已建立 ${mapping.length} 個 JS 檔案與測試計劃的映射`);

    // 4. 產生 Jest 測試
    const needsJSDOM = await generateJestTests(sessionId, mapping, agent);
    console.log(`[INFO] Jest 環境: ${needsJSDOM ? 'jsdom (DOM 測試)' : 'node (純邏輯測試)'}`);

    // 5. 執行 Jest
    const jestResults = await runJestTests(sessionId);

    // 6. 產生報告
    const reportPath = await writeTestReport(sessionId, jestResults, mapping);
    console.log(`✅ 測試報告已產生：${reportPath}`);

    return { reportPath, jestResults };
  } catch (err) {
    console.error(`❌ Tester Agent 失敗: ${err.message}`);
    throw err;
  }
}

// 允許直接以 node 執行此檔案
// 用法： node agents/tester-agent.js <sessionId>
// 範例： node agents/tester-agent.js 6f2fd9fb-59dd-46df-8dda-017f8663724b
const isMainModule = () => {
  const scriptPath = fileURLToPath(import.meta.url);
  const executedPath = process.argv[1];

  const normalizedScript = path.resolve(scriptPath);
  const normalizedExecuted = path.resolve(executedPath);

  return normalizedScript === normalizedExecuted;
};

if (isMainModule()) {
  const sid = process.argv[2];
  if (!sid) {
    console.error('❌ 使用方式： node tester-agent.js <sessionId>');
    process.exit(1);
  }
  runTesterAgent(sid).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}