/**
 * Contract Validator Agent
 * 負責驗證生成的代碼是否符合 architecture.json 定義的契約
 * 並提供自動修復建議
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default class ContractValidator {
  constructor() {
    this.validationRules = {
      ipc: {
        // IPC 頻道名稱必須完全一致
        strictMatch: true,
        // 允許的命名模式
        allowedPatterns: [/^[a-z]+(-[a-z]+)*$/] // kebab-case: get-tasks, add-task
      }
    };
  }

  /**
   * 驗證生成的代碼是否符合 architecture.json 的契約
   * @param {Object} architectureContracts - architecture.json 中的 contracts
   * @param {Object} extractedContracts - 從實際代碼提取的 contracts
   * @returns {Object} 驗證結果
   */
  validateContracts(architectureContracts, extractedContracts) {
    const issues = {
      missingChannels: [],      // 定義了但沒實現的頻道
      extraChannels: [],        // 實現了但沒定義的頻道
      nameMismatches: [],       // 名稱不一致
      missingProducers: [],     // 缺少生產者
      missingConsumers: [],     // 缺少消費者
      schemaErrors: []          // Schema 不符合
    };

    if (!architectureContracts || !extractedContracts) {
      return { isValid: false, issues, error: 'Missing contracts data' };
    }

    // ===== 驗證 API/IPC 契約 =====
    const expectedApis = architectureContracts.api || [];
    const actualApis = extractedContracts.api || [];

    // 檢查每個預期的 API 是否都被實現
    for (const expectedApi of expectedApis) {
      const actualApi = actualApis.find(a => a.endpoint === expectedApi.endpoint);
      
      if (!actualApi) {
        // 完全缺失
        issues.missingChannels.push({
          endpoint: expectedApi.endpoint,
          expectedIn: expectedApi.producers || [],
          consumers: expectedApi.consumers || [],
          purpose: expectedApi.purpose,
          method: expectedApi.method
        });
      } else {
        // 存在但可能不完整
        this.validateProducersConsumers(expectedApi, actualApi, issues);
      }
    }

    // 檢查是否有未定義的額外頻道
    for (const actualApi of actualApis) {
      const expectedApi = expectedApis.find(a => a.endpoint === actualApi.endpoint);
      
      if (!expectedApi) {
        issues.extraChannels.push({
          endpoint: actualApi.endpoint,
          foundIn: actualApi.source,
          method: actualApi.method,
          purpose: actualApi.purpose
        });
      }
    }

    // ===== 驗證 DOM 契約 =====
    const expectedDom = architectureContracts.dom || [];
    const actualDom = extractedContracts.dom || [];

    // 檢查每個預期的 DOM 元素
    for (const expectedElement of expectedDom) {
      const actualElement = actualDom.find(d => d.id === expectedElement.id);
      
      if (!actualElement) {
        issues.missingChannels.push({
          type: 'dom',
          id: expectedElement.id,
          elementType: expectedElement.type,
          expectedIn: ['public/index.html'],
          accessedBy: expectedElement.accessedBy || [],
          purpose: expectedElement.purpose
        });
      } else if (actualElement.missing) {
        // JS 中使用了但 HTML 中不存在
        issues.missingChannels.push({
          type: 'dom-missing-in-html',
          id: expectedElement.id,
          usedIn: actualElement.accessedBy,
          purpose: expectedElement.purpose
        });
      }
    }

    // 檢查 JS 中使用但未在 architecture.json 定義的 DOM 元素
    for (const actualElement of actualDom) {
      if (actualElement.missing) {
        // HTML 中不存在，但 JS 中使用
        const expectedElement = expectedDom.find(d => d.id === actualElement.id);
        if (!expectedElement) {
          issues.extraChannels.push({
            type: 'dom-undefined',
            id: actualElement.id,
            usedIn: actualElement.accessedBy,
            purpose: 'Undefined DOM element used in JavaScript'
          });
        }
      }
    }

    const isValid = Object.values(issues).every(arr => arr.length === 0);

    return {
      isValid,
      issues,
      summary: {
        totalIssues: Object.values(issues).reduce((sum, arr) => sum + arr.length, 0),
        criticalIssues: issues.missingChannels.length + issues.nameMismatches.length,
        warningIssues: issues.extraChannels.length
      }
    };
  }

  /**
   * 驗證 producers 和 consumers 是否完整
   */
  validateProducersConsumers(expectedApi, actualApi, issues) {
    const expectedProducers = new Set(expectedApi.producers || []);
    const actualProducers = new Set(actualApi.producers || []);
    const expectedConsumers = new Set(expectedApi.consumers || []);
    const actualConsumers = new Set(actualApi.consumers || []);

    // 輔助函數：規範化路徑以便比對（只取檔名或相對路徑）
    const normalizePath = (filePath) => {
      if (!filePath) return '';
      // 移除 session ID 前綴
      const parts = filePath.split('/');
      // 如果路徑包含 session ID (UUID格式)，移除它
      if (parts.length > 1 && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parts[0])) {
        return parts.slice(1).join('/');
      }
      return filePath;
    };

    // 檢查缺失的 producers
    for (const producer of expectedProducers) {
      const normalizedExpected = normalizePath(producer);
      const hasMatch = Array.from(actualProducers).some(actual => 
        normalizePath(actual).includes(normalizedExpected) || 
        normalizedExpected.includes(normalizePath(actual))
      );
      
      if (!hasMatch) {
        issues.missingProducers.push({
          endpoint: expectedApi.endpoint,
          file: producer,
          purpose: expectedApi.purpose
        });
      }
    }

    // 檢查缺失的 consumers
    for (const consumer of expectedConsumers) {
      const normalizedExpected = normalizePath(consumer);
      const hasMatch = Array.from(actualConsumers).some(actual => 
        normalizePath(actual).includes(normalizedExpected) || 
        normalizedExpected.includes(normalizePath(actual))
      );
      
      if (!hasMatch) {
        issues.missingConsumers.push({
          endpoint: expectedApi.endpoint,
          file: consumer,
          purpose: expectedApi.purpose
        });
      }
    }
  }

  /**
   * 生成修復建議
   * @param {Object} validationResult - 驗證結果
   * @returns {Array} 修復建議列表
   */
  generateFixSuggestions(validationResult) {
    const suggestions = [];

    if (!validationResult || validationResult.isValid) {
      return suggestions;
    }

    const { issues } = validationResult;

    // 處理缺失的頻道
    for (const missing of issues.missingChannels) {
      if (missing.method === 'ipc-handle') {
        suggestions.push({
          severity: 'critical',
          type: 'add-ipc-handler',
          file: missing.expectedIn[0] || 'main.js',
          channel: missing.endpoint,
          description: `缺少 IPC handler: '${missing.endpoint}'`,
          code: `
// 在 ${missing.expectedIn[0] || 'main.js'} 中加入：
ipcMain.handle('${missing.endpoint}', async (event, ...args) => {
  // ${missing.purpose || 'Handle request'}
  // TODO: 實現具體邏輯
  return { success: true };
});`
        });
      }
    }

    // 處理名稱不匹配
    for (const mismatch of issues.nameMismatches) {
      suggestions.push({
        severity: 'critical',
        type: 'fix-channel-name',
        file: mismatch.file,
        description: `IPC 頻道名稱不一致: 期望 '${mismatch.expected}'，實際 '${mismatch.actual}'`,
        fix: `將 '${mismatch.actual}' 改為 '${mismatch.expected}'`
      });
    }

    // 處理缺失的 producers
    for (const missing of issues.missingProducers) {
      suggestions.push({
        severity: 'high',
        type: 'add-producer',
        file: missing.file,
        channel: missing.endpoint,
        description: `檔案 ${missing.file} 應該實現 IPC handler '${missing.endpoint}'`
      });
    }

    // 處理缺失的 consumers
    for (const missing of issues.missingConsumers) {
      suggestions.push({
        severity: 'medium',
        type: 'add-consumer',
        file: missing.file,
        channel: missing.endpoint,
        description: `檔案 ${missing.file} 應該呼叫 '${missing.endpoint}'`
      });
    }

    // 處理額外的頻道（警告級別）
    for (const extra of issues.extraChannels) {
      suggestions.push({
        severity: 'warning',
        type: 'undocumented-channel',
        file: extra.foundIn,
        channel: extra.endpoint,
        description: `發現未在 architecture.json 中定義的頻道: '${extra.endpoint}'`,
        suggestion: '考慮是否需要將此頻道加入 architecture.json'
      });
    }

    return suggestions.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, warning: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  /**
   * 驗證當前專案的契約一致性
   * @param {string} sessionId - 專案的 session ID
   * @returns {Object} 驗證結果和修復建議
   */
  async validateSession(sessionId) {
    try {
      // 讀取 architecture.json
      const archPath = path.join(__dirname, `../data/sessions/${sessionId}/architecture.json`);
      const archData = JSON.parse(await fs.readFile(archPath, 'utf-8'));
      const architectureContracts = archData.output?.coder_instructions?.contracts;

      if (!architectureContracts) {
        return {
          error: 'No contracts found in architecture.json',
          isValid: false
        };
      }

      // 讀取輸出目錄中的所有檔案
      const outputDir = path.join(__dirname, `../output/${sessionId}`);
      const files = await this.readProjectFiles(outputDir);
      
      // 手動提取 contracts（簡化版，避免依賴 ContractsExtractor 的 logger）
      const extractedContracts = await this.extractContractsSimple(files);

      // 驗證契約
      const validationResult = this.validateContracts(architectureContracts, extractedContracts);

      // 額外驗證：檢查 select 選項值的一致性
      const htmlFiles = files.filter(f => f.path.endsWith('.html'));
      const jsFiles = files.filter(f => f.path.endsWith('.js'));
      const selectIssues = this.validateSelectOptions(htmlFiles, jsFiles);
      
      // 將 select 問題加入驗證結果
      if (selectIssues.length > 0) {
        validationResult.issues.schemaErrors = validationResult.issues.schemaErrors || [];
        validationResult.issues.schemaErrors.push(...selectIssues);
        validationResult.isValid = false;
      }

      // 生成修復建議
      const suggestions = this.generateFixSuggestions(validationResult);

      return {
        ...validationResult,
        suggestions,
        architecture: architectureContracts,
        extracted: extractedContracts,
        selectIssues
      };
    } catch (error) {
      return {
        error: error.message,
        isValid: false
      };
    }
  }

  /**
   * 簡化版契約提取器（不依賴外部模組）
   */
  async extractContractsSimple(files) {
    const contracts = {
      api: [],
      dom: [],
      storage: []
    };

    for (const file of files) {
      const { path: filePath, content } = file;
      
      // 提取 IPC channels
      const ipcRegex = /ipc(?:Main|Renderer)\.(?:handle|on|invoke|send)\s*\(\s*["']([^"']+)["']/gi;
      let match;
      while ((match = ipcRegex.exec(content)) !== null) {
        const channel = match[1];
        const existing = contracts.api.find(a => a.endpoint === channel);
        
        // 判斷檔案類型
        const isMainJs = filePath.includes('main.js') || filePath.endsWith('main.js');
        const isPreloadJs = filePath.includes('preload.js') || filePath.endsWith('preload.js');
        const isRendererJs = filePath.includes('script.js') || filePath.includes('renderer.js') || 
                            (filePath.includes('public/') && filePath.endsWith('.js'));
        
        if (!existing) {
          contracts.api.push({
            endpoint: channel,
            method: 'ipc-handle',
            source: filePath,
            producers: isMainJs ? [filePath] : [],
            consumers: (isPreloadJs || isRendererJs) ? [filePath] : []
          });
        } else {
          if (isMainJs && !existing.producers.includes(filePath)) {
            existing.producers.push(filePath);
          }
          if ((isPreloadJs || isRendererJs) && !existing.consumers.includes(filePath)) {
            existing.consumers.push(filePath);
          }
        }
      }

      // 提取 DOM IDs from HTML
      if (filePath.endsWith('.html')) {
        const idRegex = /\bid\s*=\s*["']([^"']+)["']/gi;
        while ((match = idRegex.exec(content)) !== null) {
          const id = match[1];
          if (!contracts.dom.find(d => d.id === id)) {
            // 提取元素類型和標籤名
            const elementMatch = content.substring(Math.max(0, match.index - 50), match.index).match(/<(\w+)[^>]*$/);
            const tagName = elementMatch ? elementMatch[1] : 'unknown';
            
            contracts.dom.push({
              id,
              type: tagName,
              source: filePath,
              accessedBy: [],
              attributes: this.extractElementAttributes(content, id)
            });
          }
        }
      }

      // 提取 DOM 訪問 from JS
      if (filePath.endsWith('.js')) {
        const getByIdRegex = /getElementById\s*\(\s*["']([^"']+)["']\s*\)/gi;
        while ((match = getByIdRegex.exec(content)) !== null) {
          const id = match[1];
          const domElement = contracts.dom.find(d => d.id === id);
          if (domElement && !domElement.accessedBy.includes(filePath)) {
            domElement.accessedBy.push(filePath);
          } else if (!domElement) {
            contracts.dom.push({
              id,
              type: 'element',
              source: 'undefined',
              accessedBy: [filePath],
              missing: true // 標記為缺失的元素
            });
          }
        }

        // 提取 querySelector 訪問
        const querySelectorRegex = /querySelector(?:All)?\s*\(\s*["']#([^"'\s]+)["']\s*\)/gi;
        while ((match = querySelectorRegex.exec(content)) !== null) {
          const id = match[1];
          const domElement = contracts.dom.find(d => d.id === id);
          if (domElement && !domElement.accessedBy.includes(filePath)) {
            domElement.accessedBy.push(filePath);
          }
        }
      }
    }

    return contracts;
  }

  /**
   * 提取 HTML 元素的屬性（如 select 的選項值）
   */
  extractElementAttributes(htmlContent, elementId) {
    const attributes = {};
    
    // 尋找該元素的完整標籤
    const elementRegex = new RegExp(`<(\\w+)[^>]*\\bid\\s*=\\s*["']${elementId}["'][^>]*>([\\s\\S]*?)<\\/\\1>`, 'i');
    const elementMatch = htmlContent.match(elementRegex);
    
    if (elementMatch) {
      const tagName = elementMatch[1];
      const elementBody = elementMatch[2];
      
      // 如果是 select，提取 option 值
      if (tagName.toLowerCase() === 'select') {
        const optionRegex = /<option[^>]*value\s*=\s*["']([^"']+)["'][^>]*>/gi;
        const options = [];
        let match;
        while ((match = optionRegex.exec(elementBody)) !== null) {
          options.push(match[1]);
        }
        attributes.options = options;
      }
      
      // 提取其他常見屬性
      const typeMatch = elementMatch[0].match(/\btype\s*=\s*["']([^"']+)["']/i);
      if (typeMatch) {
        attributes.type = typeMatch[1];
      }
      
      const nameMatch = elementMatch[0].match(/\bname\s*=\s*["']([^"']+)["']/i);
      if (nameMatch) {
        attributes.name = nameMatch[1];
      }
    }
    
    return attributes;
  }

  /**
   * 驗證 select 元素的選項值是否與 JS 邏輯一致
   */
  validateSelectOptions(htmlFiles, jsFiles) {
    const issues = [];
    
    for (const htmlFile of htmlFiles) {
      // 提取所有 select 元素及其選項
      const selectRegex = /<select[^>]*id\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/select>/gi;
      let match;
      
      while ((match = selectRegex.exec(htmlFile.content)) !== null) {
        const selectId = match[1];
        const selectBody = match[2];
        
        // 提取選項值
        const optionRegex = /<option[^>]*value\s*=\s*["']([^"']+)["'][^>]*>/gi;
        const htmlOptions = [];
        let optionMatch;
        while ((optionMatch = optionRegex.exec(selectBody)) !== null) {
          htmlOptions.push(optionMatch[1]);
        }
        
        // 在 JS 中尋找這些值的使用
        for (const jsFile of jsFiles) {
          // 檢查是否有字串字面值與選項值不一致（大小寫）
          for (const htmlOption of htmlOptions) {
            // 尋找可能的不一致大小寫
            const patterns = [
              htmlOption.toLowerCase(),
              htmlOption.toUpperCase(),
              htmlOption.charAt(0).toUpperCase() + htmlOption.slice(1).toLowerCase()
            ];
            
            for (const pattern of patterns) {
              if (pattern !== htmlOption && jsFile.content.includes(`'${pattern}'`)) {
                issues.push({
                  type: 'select-option-case-mismatch',
                  selectId,
                  htmlValue: htmlOption,
                  jsValue: pattern,
                  htmlFile: htmlFile.path,
                  jsFile: jsFile.path,
                  severity: 'high'
                });
              }
            }
          }
        }
      }
    }
    
    return issues;
  }

  /**
   * 遞迴讀取專案目錄中的所有檔案
   */
  async readProjectFiles(dir) {
    const files = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          const subFiles = await this.readProjectFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (['.js', '.ts', '.html', '.jsx', '.tsx', '.cjs', '.mjs'].includes(ext)) {
            const content = await fs.readFile(fullPath, 'utf-8');
            const relativePath = path.relative(path.join(__dirname, `../output`), fullPath);
            files.push({
              path: relativePath.replace(/\\/g, '/'),
              content,
              language: ext === '.html' ? 'html' : 'javascript'
            });
          }
        }
      }
    } catch (error) {
      console.warn(`Warning: Could not read directory ${dir}: ${error.message}`);
    }
    
    return files;
  }

  /**
   * 生成驗證報告
   */
  generateReport(validationResult) {
    const { isValid, issues, summary, suggestions } = validationResult;

    let report = '\n';
    report += '═'.repeat(70) + '\n';
    report += '📋 契約驗證報告 (Contract Validation Report)\n';
    report += '═'.repeat(70) + '\n\n';

    if (isValid) {
      report += '✅ 所有契約驗證通過！\n';
      report += '   所有 IPC 頻道、DOM 元素都已正確實現。\n';
      return report;
    }

    report += `❌ 發現 ${summary.totalIssues} 個問題\n`;
    report += `   嚴重問題: ${summary.criticalIssues}\n`;
    report += `   警告: ${summary.warningIssues}\n\n`;

    // 顯示問題詳情
    if (issues.missingChannels.length > 0) {
      report += '🔴 缺失的頻道 (Missing Channels):\n';
      for (const missing of issues.missingChannels) {
        report += `   • ${missing.endpoint || missing.id}\n`;
        report += `     用途: ${missing.purpose}\n`;
        report += `     應該在: ${(missing.expectedIn || []).join(', ')}\n\n`;
      }
    }

    if (issues.missingProducers.length > 0) {
      report += '🟡 缺失的生產者 (Missing Producers):\n';
      for (const missing of issues.missingProducers) {
        report += `   • ${missing.endpoint} 缺少實現於 ${missing.file}\n`;
      }
      report += '\n';
    }

    if (issues.missingConsumers.length > 0) {
      report += '🟡 缺失的消費者 (Missing Consumers):\n';
      for (const missing of issues.missingConsumers) {
        report += `   • ${missing.endpoint} 缺少呼叫於 ${missing.file}\n`;
      }
      report += '\n';
    }

    if (issues.extraChannels.length > 0) {
      report += '⚠️  額外的頻道 (Extra Channels):\n';
      for (const extra of issues.extraChannels) {
        report += `   • ${extra.endpoint} 於 ${extra.foundIn}\n`;
      }
      report += '\n';
    }

    // 顯示修復建議
    if (suggestions && suggestions.length > 0) {
      report += '─'.repeat(70) + '\n';
      report += '💡 修復建議 (Fix Suggestions):\n\n';
      
      for (let i = 0; i < suggestions.length; i++) {
        const sug = suggestions[i];
        const icon = sug.severity === 'critical' ? '🔴' : 
                     sug.severity === 'high' ? '🟠' : 
                     sug.severity === 'medium' ? '🟡' : '⚪';
        
        report += `${i + 1}. ${icon} [${sug.severity.toUpperCase()}] ${sug.description}\n`;
        if (sug.file) report += `   檔案: ${sug.file}\n`;
        if (sug.code) report += `\n${sug.code}\n`;
        if (sug.fix) report += `   修復: ${sug.fix}\n`;
        report += '\n';
      }
    }

    report += '═'.repeat(70) + '\n';

    return report;
  }
}

// 命令列使用
if (import.meta.url === `file://${process.argv[1]}`) {
  const sessionId = process.argv[2];
  
  if (!sessionId) {
    console.log('Usage: node contract-validator.js <sessionId>');
    process.exit(1);
  }

  const validator = new ContractValidator();
  
  validator.validateSession(sessionId).then(result => {
    const report = validator.generateReport(result);
    console.log(report);
    
    if (!result.isValid) {
      process.exit(1);
    }
  }).catch(error => {
    console.error('驗證失敗:', error);
    process.exit(1);
  });
}
