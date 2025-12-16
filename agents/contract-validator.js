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

    // ===== 新增：檢查參數格式一致性 =====
    const parameterIssues = this.checkParameterConsistency(extractedContracts);
    if (parameterIssues.length > 0) {
      issues.parameterMismatches = parameterIssues;
    }

    const isValid = Object.values(issues).every(arr => arr.length === 0);

    return {
      isValid,
      issues,
      summary: {
        totalIssues: Object.values(issues).reduce((sum, arr) => sum + arr.length, 0),
        criticalIssues: issues.missingChannels.length + issues.nameMismatches.length + (issues.parameterMismatches?.length || 0),
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

      // 額外驗證：檢查 HTML 路徑錯誤
      const htmlPathIssues = this.validateHtmlPaths(htmlFiles);
      if (htmlPathIssues.length > 0) {
        validationResult.issues.htmlPathErrors = htmlPathIssues;
        validationResult.isValid = false;
      }

      // 額外驗證：檢查 ES6 export 語法錯誤
      const exportIssues = this.validateExportSyntax(files);
      if (exportIssues.length > 0) {
        validationResult.issues.exportSyntaxErrors = exportIssues;
        validationResult.isValid = false;
      }

      // 額外驗證：檢查 main.js 路徑錯誤
      const mainJsPathIssues = this.validateMainJsPaths(files);
      if (mainJsPathIssues.length > 0) {
        validationResult.issues.mainJsPathErrors = mainJsPathIssues;
        validationResult.isValid = false;
      }

      // 額外驗證：檢查 preload.js IPC 參數格式
      const preloadIpcIssues = this.validatePreloadIpcParameters(files);
      if (preloadIpcIssues.length > 0) {
        validationResult.issues.preloadIpcErrors = preloadIpcIssues;
        validationResult.isValid = false;
      }

      // 生成修復建議
      const suggestions = this.generateFixSuggestions(validationResult);

      return {
        ...validationResult,
        suggestions,
        architecture: architectureContracts,
        extracted: extractedContracts,
        selectIssues,
        htmlPathIssues,
        exportIssues,
        mainJsPathIssues,
        preloadIpcIssues
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
      storage: [],
      parameterChecks: [] // 新增：參數格式檢查
    };

    for (const file of files) {
      const { path: filePath, content } = file;
      
      // 判斷檔案類型
      const isMainJs = filePath.includes('main.js') || filePath.endsWith('main.js');
      const isPreloadJs = filePath.includes('preload.js') || filePath.endsWith('preload.js');
      const isRendererJs = filePath.includes('script.js') || filePath.includes('renderer.js') || 
                          (filePath.includes('public/') && filePath.endsWith('.js'));
      
      // 提取 IPC channels (修復：移除參數捕獲以避免死循環)
      const ipcRegex = /ipc(?:Main|Renderer)\.(?:handle|on|invoke|send)\s*\(\s*["']([^"']+)["']/gi;
      let match;
      while ((match = ipcRegex.exec(content)) !== null) {
        const channel = match[1];
        let existing = contracts.api.find(a => a.endpoint === channel);
        
        if (!existing) {
          existing = {
            endpoint: channel,
            method: 'ipc-handle',
            source: filePath,
            producers: isMainJs ? [filePath] : [],
            consumers: (isPreloadJs || isRendererJs) ? [filePath] : [],
            parameterFormats: {} // 記錄參數格式
          };
          contracts.api.push(existing);
        } else {
          if (isMainJs && !existing.producers.includes(filePath)) {
            existing.producers.push(filePath);
          }
          if ((isPreloadJs || isRendererJs) && !existing.consumers.includes(filePath)) {
            existing.consumers.push(filePath);
          }
        }
        
        // 分析參數格式（從 match.index 開始分析）
        const paramFormat = this.analyzeParameterFormat(null, content, match.index);
        if (paramFormat) {
          existing.parameterFormats[filePath] = paramFormat;
        }
      }
      
      // 新增：提取 window.electronAPI 調用（renderer 中的間接調用）
      if (isRendererJs) {
        const electronAPIRegex = /window\.electronAPI\.(\w+)\s*\(/gi;
        while ((match = electronAPIRegex.exec(content)) !== null) {
          const methodName = match[1];
          // 將 camelCase 轉換為可能的 kebab-case 通道名
          const possibleChannels = [
            methodName,
            this.camelToKebab(methodName),
            methodName.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')
          ];
          
          // 嘗試匹配已知的通道
          for (const channelName of possibleChannels) {
            let existing = contracts.api.find(a => a.endpoint === channelName);
            if (existing && !existing.consumers.includes(filePath)) {
              existing.consumers.push(filePath);
              break;
            }
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
   * 檢查 HTML 檔案中的路徑錯誤
   * 檢測 public/ 前綴錯誤：如 public/style.css 應該是 style.css
   */
  validateHtmlPaths(htmlFiles) {
    const issues = [];
    
    for (const htmlFile of htmlFiles) {
      // 只檢查 public 資料夾內的 HTML 檔案
      if (!htmlFile.path.includes('public')) continue;
      
      // 檢查 CSS 連結中的 public/ 前綴
      const cssLinkRegex = /<link[^>]*href\s*=\s*["']public\/([^"']+\.css)["'][^>]*>/gi;
      let match;
      while ((match = cssLinkRegex.exec(htmlFile.content)) !== null) {
        issues.push({
          type: 'html-path-error',
          file: htmlFile.path,
          pattern: 'CSS link',
          incorrect: `public/${match[1]}`,
          correct: match[1],
          line: htmlFile.content.substring(0, match.index).split('\n').length
        });
      }
      
      // 檢查 script 標籤中的 public/ 前綴
      const scriptRegex = /<script[^>]*src\s*=\s*["']public\/([^"']+\.js)["'][^>]*>/gi;
      while ((match = scriptRegex.exec(htmlFile.content)) !== null) {
        issues.push({
          type: 'html-path-error',
          file: htmlFile.path,
          pattern: 'Script src',
          incorrect: `public/${match[1]}`,
          correct: match[1],
          line: htmlFile.content.substring(0, match.index).split('\n').length
        });
      }
    }
    
    return issues;
  }

  /**
   * 檢查 ES6 export 語法在 Node.js 環境中的錯誤使用
   * preload.js 和某些前端檔案不應使用 export
   */
  validateExportSyntax(files) {
    const issues = [];
    
    for (const file of files) {
      // 只檢查 .js 檔案
      if (!file.path.endsWith('.js')) continue;
      
      // preload.js 不應使用 export（Node.js 環境，需要 CommonJS）
      if (file.path.includes('preload.js')) {
        const exportMatch = file.content.match(/export\s+(class|function|const|let|var|default)/);
        if (exportMatch) {
          issues.push({
            type: 'export-syntax-error',
            file: file.path,
            context: 'preload.js',
            reason: 'preload.js runs in Node.js environment, should use module.exports instead of ES6 export',
            foundPattern: exportMatch[0],
            suggestion: 'Remove "export" keyword and use module.exports at the end'
          });
        }
      }
      
      // public 資料夾內的 JS 檔案使用 export 但沒有在 HTML 中宣告為 module
      if (file.path.includes('public') && file.path.endsWith('.js')) {
        const exportMatch = file.content.match(/export\s+(class|function|const|let|var|default)/);
        if (exportMatch) {
          issues.push({
            type: 'export-syntax-error',
            file: file.path,
            context: 'browser-script',
            reason: 'Browser scripts using export need type="module" in HTML, or remove export',
            foundPattern: exportMatch[0],
            suggestion: 'Remove "export" keyword for non-module scripts'
          });
        }
      }
    }
    
    return issues;
  }

  /**
   * 檢查 main.js 中的檔案路徑錯誤
   * 例如：path.join(__dirname, '..', 'public', 'index.html') 應該是 path.join(__dirname, 'public', 'index.html')
   */
  validateMainJsPaths(files) {
    const issues = [];
    
    const mainJsFiles = files.filter(f => f.path.includes('main.js') && !f.path.includes('node_modules'));
    
    for (const file of mainJsFiles) {
      // 檢查 loadFile 路徑中多餘的 '..'
      const loadFilePattern = /loadFile\s*\(\s*path\.join\s*\(\s*__dirname\s*,\s*['"]\.\.['"],\s*['"]public['"]/g;
      let match;
      
      while ((match = loadFilePattern.exec(file.content)) !== null) {
        const lineNum = file.content.substring(0, match.index).split('\n').length;
        issues.push({
          type: 'main-js-path-error',
          file: file.path,
          line: lineNum,
          pattern: 'loadFile path',
          issue: "Using '..', 'public' but public/ folder is at same level as main.js",
          incorrect: "path.join(__dirname, '..', 'public', 'index.html')",
          correct: "path.join(__dirname, 'public', 'index.html')",
          suggestion: "Remove the '..' from path.join - public/ folder is beside main.js, not one level up"
        });
      }
    }
    
    return issues;
  }

  /**
   * 檢查 preload.js 中的 IPC 參數格式是否與 main.js 一致
   */
  validatePreloadIpcParameters(files) {
    const issues = [];
    
    // 找到 main.js 和 preload.js
    const mainJsFile = files.find(f => f.path.includes('main.js') && !f.path.includes('node_modules'));
    const preloadFile = files.find(f => f.path.includes('preload.js'));
    
    if (!mainJsFile || !preloadFile) {
      return issues; // 如果找不到檔案就跳過
    }
    
    // 從 main.js 提取 ipcMain.handle 的參數格式
    const handlePattern = /ipcMain\.handle\s*\(\s*['"]([^'"]+)['"]\s*,\s*(?:async\s+)?\(\s*event\s*,\s*(\{[^}]+\}|[^)]+)\s*\)/g;
    let mainMatch;
    const mainHandlers = {};
    
    while ((mainMatch = handlePattern.exec(mainJsFile.content)) !== null) {
      const channel = mainMatch[1];
      const params = mainMatch[2].trim();
      const usesObjectDestructuring = params.startsWith('{');
      mainHandlers[channel] = {
        params,
        usesObjectDestructuring,
        line: mainJsFile.content.substring(0, mainMatch.index).split('\n').length
      };
    }
    
    // 從 preload.js 提取 ipcRenderer.invoke 的調用格式
    const invokePattern = /(\w+)\s*:\s*(?:async\s+)?\(([^)]*)\)\s*=>\s*(?:await\s+)?ipcRenderer\.invoke\s*\(\s*['"]([^'"]+)['"]\s*,\s*([^)]+)\)/g;
    let preloadMatch;
    
    while ((preloadMatch = invokePattern.exec(preloadFile.content)) !== null) {
      const methodName = preloadMatch[1];
      const methodParams = preloadMatch[2].trim();
      const channel = preloadMatch[3];
      const invokeArgs = preloadMatch[4].trim();
      const lineNum = preloadFile.content.substring(0, preloadMatch.index).split('\n').length;
      
      // 檢查這個 channel 是否在 main.js 中定義
      if (mainHandlers[channel]) {
        const mainHandler = mainHandlers[channel];
        const preloadUsesObject = invokeArgs.startsWith('{');
        const preloadMethodUsesDestructuring = methodParams.startsWith('{');
        
        // 如果 main.js 使用物件解構，preload.js 也應該使用物件解構
        if (mainHandler.usesObjectDestructuring && !preloadMethodUsesDestructuring) {
          issues.push({
            type: 'preload-ipc-parameter-mismatch',
            channel,
            file: preloadFile.path,
            line: lineNum,
            mainJsFormat: mainHandler.params,
            preloadFormat: methodParams,
            issue: `main.js expects object destructuring ${mainHandler.params}, but preload.js method uses ${methodParams}`,
            suggestion: `Change preload.js method signature from '${methodParams}' to '${mainHandler.params.replace('event, ', '')}'`,
            correctPattern: `${methodName}: async ${mainHandler.params.replace('event, ', '')} => ipcRenderer.invoke('${channel}', ${invokeArgs})`
          });
        }
        
        // 如果 main.js 使用物件解構，preload.js 傳遞參數時也應該用物件
        if (mainHandler.usesObjectDestructuring && !preloadUsesObject) {
          issues.push({
            type: 'preload-ipc-invoke-mismatch',
            channel,
            file: preloadFile.path,
            line: lineNum,
            mainJsFormat: mainHandler.params,
            invokeArgs,
            issue: `main.js expects object ${mainHandler.params}, but preload.js invokes with ${invokeArgs}`,
            suggestion: `Change invoke call to pass object: ipcRenderer.invoke('${channel}', { ${invokeArgs} })`,
            correctPattern: `ipcRenderer.invoke('${channel}', ${mainHandler.params.replace(/\s/g, '')})`
          });
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

    if (issues.parameterMismatches && issues.parameterMismatches.length > 0) {
      report += '🔴 參數格式不一致 (Parameter Mismatches):\n';
      for (const mismatch of issues.parameterMismatches) {
        report += `   • IPC 頻道: ${mismatch.endpoint}\n`;
        report += `     ${mismatch.file1}: ${this.formatTypeDescription(mismatch.format1)}\n`;
        report += `     ${mismatch.file2}: ${this.formatTypeDescription(mismatch.format2)}\n`;
        report += `     問題: ${mismatch.description}\n\n`;
      }
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

  /**
   * 分析參數格式
   * 檢測是否使用物件解構 vs 多個參數
   */
  analyzeParameterFormat(argsString, fullContent, matchIndex) {
    // 從匹配位置往後找 200 個字元來捕獲參數
    const contextEnd = Math.min(fullContent.length, matchIndex + 200);
    const context = fullContent.substring(matchIndex, contextEnd);
    
    // 情況 1: 檢測內聯回調函數
    // 例如: ipcMain.handle('save-note', (event, { filename, content }) => ...)
    const inlineCallbackMatch = context.match(/,\s*(async\s+)?\(\s*\w+\s*,\s*({[^}]*}|\w+)\s*\)\s*=>/);
    if (inlineCallbackMatch) {
      const param = inlineCallbackMatch[2].trim();
      if (param.startsWith('{')) {
        return { type: 'object-destructure', raw: param };
      } else {
        return { type: 'single-param', raw: param };
      }
    }
    
    // 情況 2: 檢測函數引用 (例如: ipcMain.handle('save-note', handleSaveNote))
    const functionRefMatch = context.match(/,\s*(\w+)\s*\)/);
    if (functionRefMatch) {
      const functionName = functionRefMatch[1];
      // 在整個文件中查找這個函數的定義
      const functionDef = this.findFunctionDefinition(fullContent, functionName);
      if (functionDef) {
        return functionDef;
      }
    }
    
    // 情況 3: 檢測 ipcRenderer.invoke 的參數
    // 例如: ipcRenderer.invoke('save-note', { filename, content })
    // 或: ipcRenderer.invoke('save-note', filename, content)
    const invokeParamsMatch = context.match(/invoke\s*\(\s*['"][^'"]+['"]\s*,\s*([^)]+)\)/);
    if (invokeParamsMatch) {
      const params = invokeParamsMatch[1].trim();
      if (params.startsWith('{')) {
        return { type: 'object-literal', raw: params };
      } else {
        const paramCount = params.split(',').filter(p => p.trim()).length;
        return { type: 'multiple-params', count: paramCount, raw: params };
      }
    }
    
    return null;
  }

  /**
   * 在文件中查找函數定義並分析其參數
   */
  findFunctionDefinition(content, functionName) {
    // 轉義函數名
    const escaped = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // 嘗試多種模式
    // 1. async function handleSaveNote(event, { filename, content })
    let match = content.match(new RegExp(`async\\s+function\\s+${escaped}\\s*\\([^,]+,\\s*({[^}]+}|\\w+)`, 'i'));
    if (match) {
      return this.parseParamFormat(match[1]);
    }
    
    // 2. function handleSaveNote(event, { filename, content })
    match = content.match(new RegExp(`function\\s+${escaped}\\s*\\([^,]+,\\s*({[^}]+}|\\w+)`, 'i'));
    if (match) {
      return this.parseParamFormat(match[1]);
    }
    
    return null;
  }

  /**
   * 解析參數格式
   */
  parseParamFormat(param) {
    const trimmed = param.trim();
    if (trimmed.startsWith('{')) {
      return { type: 'object-destructure', raw: trimmed, source: 'function-definition' };
    } else {
      return { type: 'single-param', raw: trimmed, source: 'function-definition' };
    }
  }

  /**
   * 檢查參數格式一致性
   */
  checkParameterConsistency(extractedContracts) {
    const issues = [];
    
    for (const api of extractedContracts.api || []) {
      if (!api.parameterFormats || Object.keys(api.parameterFormats).length < 2) {
        continue;
      }
      
      const formats = Object.entries(api.parameterFormats);
      const [firstFile, firstFormat] = formats[0];
      
      // 檢查是否所有文件使用相同的參數格式
      for (let i = 1; i < formats.length; i++) {
        const [file, format] = formats[i];
        
        // 跳過相同參數數量的情況（single-param 和 count=1 是兼容的）
        if (firstFormat.type === 'single-param' && format.count === 1) continue;
        if (format.type === 'single-param' && firstFormat.count === 1) continue;
        
        // 判斷不一致（只有明確的格式衝突才報告）
        const isInconsistent = 
          // 物件解構 vs 多參數
          ((firstFormat.type === 'object-destructure') && (format.type === 'multiple-params' && format.count > 1)) ||
          ((format.type === 'object-destructure') && (firstFormat.type === 'multiple-params' && firstFormat.count > 1)) ||
          // 物件解構 vs 非物件單參數
          ((firstFormat.type === 'object-destructure') && (format.type === 'single-param' && !format.raw?.includes('{'))) ||
          ((format.type === 'object-destructure') && (firstFormat.type === 'single-param' && !firstFormat.raw?.includes('{'))) ||
          // 多參數 vs 單參數（且數量不同）
          ((firstFormat.type === 'multiple-params' && firstFormat.count > 1) && (format.type === 'single-param')) ||
          ((format.type === 'multiple-params' && format.count > 1) && (firstFormat.type === 'single-param'));
        
        if (isInconsistent) {
          issues.push({
            endpoint: api.endpoint,
            file1: firstFile,
            format1: firstFormat,
            file2: file,
            format2: format,
            severity: 'critical',
            description: `IPC 參數格式不一致: ${firstFile} 期望 ${this.formatTypeDescription(firstFormat)}, 但 ${file} 傳遞 ${this.formatTypeDescription(format)}`
          });
        }
      }
    }
    
    return issues;
  }

  /**
   * 格式化參數類型描述
   */
  formatTypeDescription(format) {
    switch (format.type) {
      case 'object-destructure':
      case 'object-literal':
        return '物件參數 (object)';
      case 'single-param':
        return '單一參數';
      case 'multiple-params':
        return `${format.count} 個參數`;
      default:
        return format.type;
    }
  }

  /**
   * camelCase 轉 kebab-case
   */
  camelToKebab(str) {
    return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
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
