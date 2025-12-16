/**
 * Contract Repair Agent
 * 
 * 在代碼生成後，一次性讀取所有相關文件，
 * 使用 AI 分析並修復契約不一致、語法錯誤等問題
 * 
 * 優勢：
 * - AI 看到完整上下文，理解各文件之間的關係
 * - 針對實際代碼修復，比重新生成更可靠
 * - 一次 API 調用處理所有問題
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default class ContractRepairAgent {
  constructor(geminiService) {
    this.geminiService = geminiService;
  }

  /**
   * 修復專案的契約問題
   * @param {string} sessionId - 專案 session ID
   * @param {Object} validationResult - 驗證結果
   * @returns {Object} 修復結果
   */
  async repair(sessionId, validationResult) {
    console.log('\nContract Repair Agent: Repairing contract issues...\n');

    try {
      // 1. 讀取所有相關文件
      const projectFiles = await this.readProjectFiles(sessionId);

      // 2. 讀取 architecture.json
      const architecture = await this.readArchitecture(sessionId);

      // 3. 構建修復 prompt
      const prompt = this.buildRepairPrompt(
        projectFiles,
        architecture,
        validationResult
      );

      // 4. 調用 AI 進行修復
      console.log('Analyzing and repairing issues...\n');
      const response = await this.geminiService.generateContent(prompt);
      const repairResult = response.response.text();

      // 5. 解析 AI 返回的修復方案
      const fixes = this.parseRepairResult(repairResult);

      // 6. 應用修復
      const appliedFixes = await this.applyFixes(sessionId, fixes);

      console.log(`✅ AI repaired ${appliedFixes.length} files!\n`);

      return {
        success: true,
        fixedFiles: appliedFixes,
        summary: this.generateSummary(appliedFixes)
      };

    } catch (error) {
      console.error('❌ AI repair failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 讀取專案的關鍵文件（智能裁剪以控制 token）
   */
  async readProjectFiles(sessionId) {
    const outputDir = path.join(process.cwd(), 'output', sessionId);
    const files = {};

    // 關鍵文件列表
    const keyFiles = [
      'main.js',
      'preload.js',
      'public/script.js',
      'public/index.html'
    ];

    for (const file of keyFiles) {
      const filePath = path.join(outputDir, file);
      try {
        const content = await fs.readFile(filePath, 'utf-8');

        // 智能裁剪：只保留關鍵部分
        if (file === 'public/index.html') {
          // HTML 只需要關鍵元素 ID 和結構
          files[file] = this.extractHtmlEssentials(content);
        } else if (content.length > 8000) {
          // JS 文件太大時，只保留 IPC 相關代碼
          files[file] = this.extractIpcEssentials(content, file);
        } else {
          files[file] = content;
        }
      } catch (error) {
        console.warn(`⚠️ Failed to read ${file}: ${error.message}`);
      }
    }

    return files;
  }

  /**
   * 提取 HTML 的關鍵部分（減少 token）
   */
  extractHtmlEssentials(html) {
    // 提取所有有 id 的元素
    const idMatches = html.match(/<[^>]+id\s*=\s*["'][^"']+["'][^>]*>/gi) || [];

    // 保留基本結構
    const essentials = [
      '<!-- 關鍵元素摘要 -->',
      ...idMatches.slice(0, 20), // 最多 20 個
      '<!-- ... 其他內容省略 ... -->'
    ].join('\n');

    return essentials;
  }

  /**
   * 提取 JS 文件的 IPC 相關代碼（減少 token）
   */
  extractIpcEssentials(content, filename) {
    const lines = content.split('\n');
    const essentialLines = [];

    // 保留 imports/requires
    essentialLines.push('// === Imports ===');
    lines.slice(0, 10).forEach(line => {
      if (line.includes('require') || line.includes('import')) {
        essentialLines.push(line);
      }
    });

    essentialLines.push('\n// === IPC related code ===');

    // 提取 IPC 相關代碼段
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 找到 IPC 相關行，保留上下文（前後 3 行）
      if (line.includes('ipcMain.handle') ||
        line.includes('ipcRenderer.invoke') ||
        line.includes('contextBridge.exposeInMainWorld')) {

        const start = Math.max(0, i - 3);
        const end = Math.min(lines.length, i + 10);
        essentialLines.push('\n// --- IPC code segment ---');
        essentialLines.push(...lines.slice(start, end));
      }
    }

    essentialLines.push('\n// ... other code omitted ...');
    return essentialLines.join('\n');
  }

  /**
   * 讀取 architecture.json
   */
  async readArchitecture(sessionId) {
    const archPath = path.join(
      process.cwd(),
      'data/sessions',
      sessionId,
      'architecture.json'
    );

    const content = await fs.readFile(archPath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * 構建修復 prompt（優化 token 使用）
   */
  buildRepairPrompt(projectFiles, architecture, validationResult) {
    const contracts = architecture.output?.coder_instructions?.contracts || {};

    // Calculate estimated token count
    const estimatedTokens = this.estimateTokens(projectFiles, contracts);
    console.log(` Estimated token usage: ~${estimatedTokens} tokens`);

    if (estimatedTokens > 100000) {
      console.warn(' Token count is large, may need batch processing');
    }

    return `You are a code repair expert. Please analyze the following Electron project code snippets and fix all contract inconsistencies, syntax errors, and logical issues.

Note: To control token usage, some files have been intelligently trimmed, showing only key IPC-related code.

## Project Contract Definition (architecture.json)

### IPC 契約
${JSON.stringify(contracts.api || [], null, 2)}

### DOM 契約
${JSON.stringify(contracts.dom || [], null, 2)}

## Project files

### main.js
\`\`\`javascript
${projectFiles['main.js'] || '// File missing'}
\`\`\`

### preload.js
\`\`\`javascript
${projectFiles['preload.js'] || '// File missing'}
\`\`\`

### public/script.js
\`\`\`javascript
${projectFiles['public/script.js'] || '// File missing'}
\`\`\`

### public/index.html
\`\`\`html
${projectFiles['public/index.html'] || '<!-- File missing -->'}
\`\`\`

## 已檢測到的問題

${this.formatValidationIssues(validationResult)}

## 修復要求

請進行以下修復：

1. **語法錯誤**：修復所有 JavaScript 語法錯誤（如重複的等號、缺少括號等）
2. **IPC 契約一致性**：
   - 確保 main.js 的 ipcMain.handle 使用的頻道名稱與契約定義一致
   - 確保 preload.js 的 ipcRenderer.invoke 使用相同的頻道名稱
   - 確保參數格式匹配（如 {task: text} vs text）
**重要：由於部分文件已裁剪，請使用"搜尋-替換"格式返回修復方案，而不是完整文件內容。**

請以 JSON 格式返回：

\`\`\`json
{
  "fixes": [
    {
      "file": "main.js",
      "replacements": [
        {
          "search": "const fs = = require('fs/promises');",
          "replace": "const fs = require('fs/promises');",
          "reason": "修復語法錯誤：移除重複的等號"
        },
        {
          "search": "ipcMain.handle('tasks:add'",
          "replace": "ipcMain.handle('add-task'",
          "reason": "統一 IPC 頻道名稱為 kebab-case"
        }
      ]
    },
    {
      "file": "preload.js",
      "replacements": [
        {
          "search": "contextBridge.exposeInMainWorld('api',",
          "replace": "contextBridge.exposeInMainWorld('electronAPI',",
          "reason": "修正 API 暴露名稱以匹配 script.js"
        },
        {
          "search": "ipcRenderer.invoke('tasks:add', text)",
          "replace": "ipcRenderer.invoke('add-task', { task: text })",
          "reason": "修正 IPC 頻道名稱和參數格式"
        }
      ]
    }
  ]
}
\`\`\`

請確保：
- 使用**精確的搜尋字串**（包含足夠的上下文以避免誤匹配）
- 只返回需要修改的部分
- 保持原有的代碼邏輯和功能
- 每個替換都附帶清晰的原因說明nges": ["修復 IPC 頻道名稱", "修復 API 暴露名稱為 electronAPI", "修復參數格式"]
    }
  ]
}
\`\`\`

請確保：
- 返回的是**完整的文件內容**，不要省略任何代碼
- 保持原有的代碼邏輯和功能
- 只修復問題，不要添加新功能
- 保持代碼風格一致`;
  }

  /**
   * 格式化驗證問題
   */
  formatValidationIssues(validationResult) {
    if (!validationResult || validationResult.isValid) {
      return 'No issues detected';
    }

    const issues = validationResult.issues || {};
    let output = '';

    if (issues.missingChannels?.length > 0) {
      output += '### Missing IPC \n';
      issues.missingChannels.forEach(issue => {
        output += `- ${issue.endpoint}: Expected in ${issue.expectedIn?.join(', ')} \n`;
      });
      output += '\n';
    }

    if (issues.nameMismatches?.length > 0) {
      output += '### Name Mismatch\n';
      issues.nameMismatches.forEach(issue => {
        output += `- Expected '${issue.expected}', actual '${issue.actual}' (${issue.file})\n`;
      });
      output += '\n';
    }

    if (issues.missingProducers?.length > 0) {
      output += '### Missing Producers\n';
      issues.missingProducers.forEach(issue => {
        output += `- ${issue.endpoint}: ${issue.file} should implement handler\n`;
      });
      output += '\n';
    }

    if (issues.missingConsumers?.length > 0) {
      output += '### Missing Consumers\n';
      issues.missingConsumers.forEach(issue => {
        output += `- ${issue.endpoint}: ${issue.file} should call\n`;
      });
      output += '\n';
    }

    if (issues.schemaErrors?.length > 0) {
      output += '### Schema Error\n';
      issues.schemaErrors.forEach(issue => {
        output += `- ${JSON.stringify(issue)}\n`;
      });
      output += '\n';
    }

    return output || 'No issue description';
  }

  /**
   * 解析 AI 返回的修復結果
   */
  parseRepairResult(repairResult) {
    try {
      // 提取 JSON 內容
      const jsonMatch = repairResult.match(/```json\n([\s\S]+?)\n```/);
      if (!jsonMatch) {
        // 嘗試直接解析
        return JSON.parse(repairResult);
      }

      return JSON.parse(jsonMatch[1]);
    } catch (error) {
      console.error('Failed to parse AI result:', error.message);
      throw new Error('AI result format is incorrect');
    }
  }

  /**
   * 應用修復（支援搜尋-替換模式）
   */
  async applyFixes(sessionId, fixes) {
    const outputDir = path.join(process.cwd(), 'output', sessionId);
    const appliedFixes = [];

    for (const fix of fixes.fixes || []) {
      const filePath = path.join(outputDir, fix.file);

      try {
        // 讀取原始文件
        let content = await fs.readFile(filePath, 'utf-8');
        let changeCount = 0;
        const changes = [];

        // 應用所有替換
        for (const replacement of fix.replacements || []) {
          const { search, replace, reason } = replacement;

          if (content.includes(search)) {
            content = content.replace(search, replace);
            changeCount++;
            changes.push(reason);
            console.log(`   ✓ ${reason}`);
          } else {
            console.warn(`   ⚠️  Not found: "${search.substring(0, 50)}..."`);
          }
        }

        if (changeCount > 0) {
          // 寫回文件
          await fs.writeFile(filePath, content, 'utf-8');
          appliedFixes.push({
            file: fix.file,
            changes
          });
          console.log(`✅ Fixed: ${fix.file} (${changeCount} changes)`);
        } else {
          console.log(`⚠️  ${fix.file}: No content to replace`);
        }

      } catch (error) {
        console.error(`❌ Failed to fix ${fix.file}:`, error.message);
      }
    }

    return appliedFixes;
  }

  /**
   * 預估 token 使用量
   */
  estimateTokens(files, contracts) {
    let total = 0;

    // 文件內容
    for (const content of Object.values(files)) {
      total += Math.ceil(content.length / 4); // 粗略估計：4 字元 = 1 token
    }

    // 契約定義
    total += Math.ceil(JSON.stringify(contracts).length / 4);

    // Prompt 本身
    total += 1000;

    return total;
  }

  /**
   * 生成修復摘要
   */
  generateSummary(appliedFixes) {
    const totalChanges = appliedFixes.reduce(
      (sum, fix) => sum + (fix.changes?.length || 0),
      0
    );

    return {
      fixedFileCount: appliedFixes.length,
      totalChanges,
      files: appliedFixes.map(f => f.file)
    };
  }
}
