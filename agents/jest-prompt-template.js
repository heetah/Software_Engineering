// jest-prompt-template.js
// LLM Prompt Template Builder for Jest Test Generation

/**
 * 建立 Jest 測試產生的 LLM Prompt
 * @param {string} jsSource - JavaScript 原始碼
 * @param {string} testPlan - 測試計劃內容
 * @param {string} filePath - 檔案路徑（用於 import）
 * @param {string} basename - 檔案基本名稱（不含副檔名）
 * @returns {string} 完整的 LLM prompt
 */
export function buildJestLLMPrompt(jsSource, testPlan, filePath, basename) {
  return `You are an AI engineer responsible for generating Jest test files strictly based on the provided test plan.

**IMPORTANT: Before you start, if the source code uses any external dependencies (Electron, browser APIs, etc.), you MUST add appropriate jest.mock() calls at the very beginning of the test file, BEFORE any require/import statements.**

# Input 1 — JavaScript source code to be tested
\`\`\`js
${jsSource}
\`\`\`

# Input 2 — Test Plan (the exact specification)
The following test plan fully defines all required test cases:

\`\`\`md
${testPlan}
\`\`\`

# Testing Rules (mandatory)

1. **Do NOT invent new test cases.**  
   Implement ONLY the test cases listed in the test plan.

2. **Import the module like this:**
\`\`\`js
import * as Module from '${filePath}';
\`\`\`

3. For pure logic functions:
   - Call exported functions directly  
   - Avoid DOM usage unless explicitly required by the test plan  

4. **CRITICAL: Mock external dependencies BEFORE requiring the module:**
\`\`\`js
// Example for Electron
jest.mock('electron', () => ({
  ipcRenderer: {
    send: jest.fn(),
    on: jest.fn(),
    invoke: jest.fn(),
  },
  app: {
    quit: jest.fn(),
    on: jest.fn(),
  }
}));

// Example for browser globals
global.window = { localStorage: { getItem: jest.fn(), setItem: jest.fn() } };

// THEN require the module
const Module = require('${filePath}');
\`\`\`

5. For DOM-related tests (only if required by the test plan):
\`\`\`js
global.document = {
  getElementById: jest.fn(),
  querySelector: jest.fn(),
};
\`\`\`

7. For async tests:
\`\`\`js
await expect(Module.fn()).resolves...
await expect(Module.fn()).rejects...
\`\`\`

8. For error/assertion tests:
\`\`\`js
expect(() => Module.fn()).toThrow();
\`\`\`

9. Every "Case" in the test plan MUST correspond to one Jest \`test()\` block.

10. **Structure your test file like this:**
\`\`\`js
// 1. Mock declarations FIRST (jest.mock calls)
jest.mock('electron', () => ({ ... }));

// 2. Global setups (if needed)
global.window = { ... };

// 3. THEN require/import the module
const Module = require('${filePath}');

// 4. Test suites
describe('...', () => {
  test('...', () => { ... });
});
\`\`\`

11. **Output ONLY valid Jest test code**, with NO explanations, NO summaries.

# Output Format
Return ONLY the final Jest test file:

\`\`\`js
// ${basename}.test.js
import * as Module from '${filePath}';

describe('${basename} module', () => {
    // One test() block for each Case in the test plan
});
\`\`\``;
}
