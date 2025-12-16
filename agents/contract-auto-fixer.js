/**
 * Contract Auto Fixer
 * 自動修復簡單的契約不一致問題，無需浪費 API
 * 
 * 支援的自動修復類型：
 * 1. IPC 頻道名稱不一致
 * 2. DOM ID 拼寫錯誤
 * 3. 函數名稱不一致
 */

import fs from 'fs/promises';
import path from 'path';

export default class ContractAutoFixer {
  constructor() {
    this.fixHistory = [];
  }

  /**
   * 自動修復契約不一致問題
   * @param {string} sessionId - 專案 session ID
   * @param {Object} validationResult - 驗證結果
   * @returns {Object} 修復結果
   */
  async autoFix(sessionId, validationResult) {
    if (validationResult.isValid) {
      return {
        success: true,
        fixed: [],
        message: '沒有需要修復的問題'
      };
    }

    const outputDir = path.join(process.cwd(), 'output', sessionId);
    const fixes = [];
    let successCount = 0;
    let failCount = 0;

    try {
      // 先檢查是否為命名風格不一致（最常見且容易修復）
      const namingStyleIssues = await this.detectNamingStyleMismatch(
        outputDir, 
        validationResult
      );
      
      for (const issue of namingStyleIssues) {
        try {
          const fixed = await this.fixNamingStyle(outputDir, issue);
          if (fixed) {
            fixes.push({
              type: 'naming-style',
              from: issue.actualStyle,
              to: issue.expectedStyle,
              channelsFixed: issue.channelsToFix || [],
              status: 'success'
            });
            successCount++;
          }
        } catch (error) {
          fixes.push({
            type: 'naming-style',
            error: error.message,
            status: 'failed'
          });
          failCount++;
        }
      }

      // 修復缺失的 IPC producers (main.js 沒有實現 handler)
      for (const missing of validationResult.issues.missingProducers || []) {
        try {
          const fixed = await this.fixMissingProducer(outputDir, missing);
          if (fixed) {
            fixes.push({
              type: 'missing-producer',
              channel: missing.endpoint,
              file: missing.file,
              status: 'success'
            });
            successCount++;
          }
        } catch (error) {
          fixes.push({
            type: 'missing-producer',
            channel: missing.endpoint,
            error: error.message,
            status: 'failed'
          });
          failCount++;
        }
      }

      // 修復缺失的 IPC consumers (preload.js 沒有橋接)
      for (const missing of validationResult.issues.missingConsumers || []) {
        try {
          const fixed = await this.fixMissingConsumer(outputDir, missing);
          if (fixed) {
            fixes.push({
              type: 'missing-consumer',
              channel: missing.endpoint,
              file: missing.file,
              status: 'success'
            });
            successCount++;
          }
        } catch (error) {
          fixes.push({
            type: 'missing-consumer',
            channel: missing.endpoint,
            error: error.message,
            status: 'failed'
          });
          failCount++;
        }
      }

      // 修復名稱不匹配（最常見的問題）
      for (const mismatch of validationResult.issues.nameMismatches || []) {
        try {
          const fixed = await this.fixNameMismatch(outputDir, mismatch);
          if (fixed) {
            fixes.push({
              type: 'name-mismatch',
              from: mismatch.actual,
              to: mismatch.expected,
              file: mismatch.file,
              status: 'success'
            });
            successCount++;
          }
        } catch (error) {
          fixes.push({
            type: 'name-mismatch',
            error: error.message,
            status: 'failed'
          });
          failCount++;
        }
      }

      // 修復 select 選項大小寫不一致
      for (const selectIssue of validationResult.issues.schemaErrors || []) {
        if (selectIssue.type === 'select-option-case-mismatch') {
          try {
            const fixed = await this.fixSelectOptionCase(outputDir, selectIssue);
            if (fixed) {
              fixes.push({
                type: 'select-option-case',
                selectId: selectIssue.selectId,
                from: selectIssue.htmlValue,
                to: selectIssue.jsValue,
                file: selectIssue.htmlFile,
                status: 'success'
              });
              successCount++;
            }
          } catch (error) {
            fixes.push({
              type: 'select-option-case',
              selectId: selectIssue.selectId,
              error: error.message,
              status: 'failed'
            });
            failCount++;
          }
        }
      }

      // 修復參數格式不匹配（preload.js 傳遞參數格式與 main.js 期望不一致）
      for (const mismatch of validationResult.issues.parameterMismatches || []) {
        try {
          const fixed = await this.fixParameterMismatch(outputDir, mismatch);
          if (fixed) {
            fixes.push({
              type: 'parameter-mismatch',
              channel: mismatch.endpoint,
              from: mismatch.format2.raw,
              to: mismatch.format1.raw,
              file: this.extractFileName(mismatch.file2),
              status: 'success'
            });
            successCount++;
          }
        } catch (error) {
          fixes.push({
            type: 'parameter-mismatch',
            channel: mismatch.endpoint,
            error: error.message,
            status: 'failed'
          });
          failCount++;
        }
      }

      // 修復 HTML 路徑錯誤
      for (const pathError of validationResult.issues.htmlPathErrors || []) {
        try {
          const fixed = await this.fixHtmlPath(outputDir, pathError);
          if (fixed) {
            fixes.push({
              type: 'html-path-error',
              file: pathError.file,
              from: pathError.incorrect,
              to: pathError.correct,
              status: 'success'
            });
            successCount++;
          }
        } catch (error) {
          fixes.push({
            type: 'html-path-error',
            file: pathError.file,
            error: error.message,
            status: 'failed'
          });
          failCount++;
        }
      }

      // 修復 export 語法錯誤
      for (const exportError of validationResult.issues.exportSyntaxErrors || []) {
        try {
          const fixed = await this.fixExportSyntax(outputDir, exportError);
          if (fixed) {
            fixes.push({
              type: 'export-syntax-error',
              file: exportError.file,
              context: exportError.context,
              status: 'success'
            });
            successCount++;
          }
        } catch (error) {
          fixes.push({
            type: 'export-syntax-error',
            file: exportError.file,
            error: error.message,
            status: 'failed'
          });
          failCount++;
        }
      }

      // 修復 main.js 路徑錯誤
      for (const pathError of validationResult.issues.mainJsPathErrors || []) {
        try {
          const fixed = await this.fixMainJsPath(outputDir, pathError);
          if (fixed) {
            fixes.push({
              type: 'main-js-path-error',
              file: pathError.file,
              line: pathError.line,
              status: 'success'
            });
            successCount++;
          }
        } catch (error) {
          fixes.push({
            type: 'main-js-path-error',
            file: pathError.file,
            error: error.message,
            status: 'failed'
          });
          failCount++;
        }
      }

      // 修復 preload.js IPC 參數格式錯誤
      for (const ipcError of validationResult.issues.preloadIpcErrors || []) {
        try {
          const fixed = await this.fixPreloadIpcParameter(outputDir, ipcError);
          if (fixed) {
            fixes.push({
              type: 'preload-ipc-parameter-error',
              file: ipcError.file,
              channel: ipcError.channel,
              status: 'success'
            });
            successCount++;
          }
        } catch (error) {
          fixes.push({
            type: 'preload-ipc-parameter-error',
            file: ipcError.file,
            channel: ipcError.channel,
            error: error.message,
            status: 'failed'
          });
          failCount++;
        }
      }

      this.fixHistory = fixes;

      return {
        success: successCount > 0,
        fixed: fixes.filter(f => f.status === 'success'),
        failed: fixes.filter(f => f.status === 'failed'),
        successCount,
        failCount,
        totalAttempted: fixes.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        fixed: [],
        failed: [],
        successCount: 0,
        failCount: 0
      };
    }
  }

  /**
   * 修復缺失的 Producer (main.js 中加入 IPC handler)
   */
  async fixMissingProducer(outputDir, missing) {
    const mainPath = path.join(outputDir, missing.file);
    
    try {
      let content = await fs.readFile(mainPath, 'utf-8');
      
      // 檢查是否真的缺失
      const hasHandler = new RegExp(`ipcMain\\.handle\\(['"\`]${missing.endpoint}['"\`]`).test(content);
      if (hasHandler) {
        return false; // 已經存在，不需要修復
      }

      // 找到最後一個 ipcMain.handle 的位置
      const lastHandlerRegex = /ipcMain\.handle\([^)]+\)[^}]*\{[^}]*\}\);/g;
      const matches = Array.from(content.matchAll(lastHandlerRegex));
      
      if (matches.length === 0) {
        // 沒有任何 handler，找到合適的位置插入
        const insertPos = content.indexOf('app.whenReady()');
        if (insertPos === -1) return false;
        
        const newHandler = this.generateIpcHandler(missing.endpoint, missing.purpose);
        content = content.slice(0, insertPos) + newHandler + '\n\n' + content.slice(insertPos);
      } else {
        // 在最後一個 handler 後面插入
        const lastMatch = matches[matches.length - 1];
        const insertPos = lastMatch.index + lastMatch[0].length;
        
        const newHandler = this.generateIpcHandler(missing.endpoint, missing.purpose);
        content = content.slice(0, insertPos) + '\n\n' + newHandler + content.slice(insertPos);
      }

      await fs.writeFile(mainPath, content, 'utf-8');
      return true;
    } catch (error) {
      throw new Error(`Failed to fix missing producer: ${error.message}`);
    }
  }

  /**
   * 修復缺失的 Consumer (preload.js 中加入橋接函數)
   */
  async fixMissingConsumer(outputDir, missing) {
    const preloadPath = path.join(outputDir, missing.file);
    
    try {
      let content = await fs.readFile(preloadPath, 'utf-8');
      
      // 檢查是否真的缺失
      const hasInvoke = new RegExp(`ipcRenderer\\.invoke\\(['"\`]${missing.endpoint}['"\`]`).test(content);
      if (hasInvoke) {
        return false; // 已經存在
      }

      // 找到 contextBridge.exposeInMainWorld 的結尾括號
      const exposeMatch = content.match(/contextBridge\.exposeInMainWorld\([^,]+,\s*\{([^}]+)\}\);/s);
      if (!exposeMatch) return false;

      const methodName = this.channelToMethodName(missing.endpoint);
      const newMethod = this.generatePreloadMethod(methodName, missing.endpoint, missing.purpose);
      
      // 找到最後一個方法定義
      const closingBracePos = content.lastIndexOf('}', exposeMatch.index + exposeMatch[0].length);
      
      // 插入新方法（加上逗號）
      content = content.slice(0, closingBracePos) + ',\n\n' + newMethod + '\n' + content.slice(closingBracePos);

      await fs.writeFile(preloadPath, content, 'utf-8');
      return true;
    } catch (error) {
      throw new Error(`Failed to fix missing consumer: ${error.message}`);
    }
  }

  /**
   * 修復名稱不匹配問題（最簡單但最常見）
   */
  async fixNameMismatch(outputDir, mismatch) {
    const filePath = path.join(outputDir, mismatch.file);
    
    try {
      let content = await fs.readFile(filePath, 'utf-8');
      const originalContent = content;
      
      // 替換所有出現的錯誤名稱
      // 使用精確匹配，避免誤替換
      const patterns = [
        // IPC channels
        new RegExp(`ipcMain\\.handle\\(['"\`]${mismatch.actual}['"\`]`, 'g'),
        new RegExp(`ipcRenderer\\.invoke\\(['"\`]${mismatch.actual}['"\`]`, 'g'),
        new RegExp(`ipcMain\\.on\\(['"\`]${mismatch.actual}['"\`]`, 'g'),
        new RegExp(`ipcRenderer\\.send\\(['"\`]${mismatch.actual}['"\`]`, 'g'),
      ];

      for (const pattern of patterns) {
        const replacement = pattern.source.replace(mismatch.actual, mismatch.expected);
        // 重新創建正則表達式但用於替換
        const searchRegex = new RegExp(pattern.source.replace(/\\\\/g, '\\'), 'g');
        const replaceStr = replacement.replace(/\\\\/g, '\\').replace(/\\/g, '');
        
        if (searchRegex.test(content)) {
          // 簡單替換字串
          content = content.replace(
            new RegExp(`['"\`]${mismatch.actual}['"\`]`, 'g'),
            `'${mismatch.expected}'`
          );
        }
      }

      if (content !== originalContent) {
        await fs.writeFile(filePath, content, 'utf-8');
        return true;
      }

      return false;
    } catch (error) {
      throw new Error(`Failed to fix name mismatch: ${error.message}`);
    }
  }

  /**
   * 生成 IPC handler 代碼
   */
  generateIpcHandler(channel, purpose) {
    const functionDoc = purpose ? `  // ${purpose}` : '';
    return `${functionDoc}
ipcMain.handle('${channel}', async (event, ...args) => {
  try {
    // TODO: 實現 ${channel} 的邏輯
    return { success: true };
  } catch (error) {
    console.error('Error handling ${channel}:', error);
    return { success: false, message: error.message };
  }
});`;
  }

  /**
   * 生成 preload 橋接方法
   */
  generatePreloadMethod(methodName, channel, purpose) {
    const doc = purpose ? `  /**\n   * ${purpose}\n   */` : '';
    return `${doc}
  ${methodName}: (...args) => ipcRenderer.invoke('${channel}', ...args)`;
  }

  /**
   * 將 IPC channel 名稱轉換為 camelCase 方法名
   */
  channelToMethodName(channel) {
    return channel.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  /**
   * 生成修復報告
   */
  generateReport(fixResult) {
    let report = '\n';
    report += '═'.repeat(70) + '\n';
    report += '🔧 自動修復報告 (Auto-Fix Report)\n';
    report += '═'.repeat(70) + '\n\n';

    if (!fixResult.success && fixResult.error) {
      report += `❌ 修復失敗: ${fixResult.error}\n`;
      return report;
    }

    if (fixResult.totalAttempted === 0) {
      report += '✅ 沒有需要修復的問題\n';
      return report;
    }

    report += `📊 修復統計:\n`;
    report += `   • 嘗試修復: ${fixResult.totalAttempted} 個問題\n`;
    report += `   • 成功: ${fixResult.successCount} 個\n`;
    report += `   • 失敗: ${fixResult.failCount} 個\n\n`;

    if (fixResult.fixed.length > 0) {
      report += '✅ 成功修復的問題:\n';
      for (const fix of fixResult.fixed) {
        if (fix.type === 'missing-producer') {
          report += `   • 在 ${fix.file} 中加入 IPC handler: '${fix.channel}'\n`;
        } else if (fix.type === 'missing-consumer') {
          report += `   • 在 ${fix.file} 中加入橋接函數: '${fix.channel}'\n`;
        } else if (fix.type === 'name-mismatch') {
          report += `   • 修正名稱: '${fix.from}' → '${fix.to}' (${fix.file})\n`;
        } else if (fix.type === 'select-option-case') {
          report += `   • 修正 select 選項大小寫: #${fix.selectId} '${fix.from}' → '${fix.to}' (${fix.file})\n`;
        } else if (fix.type === 'missing-dom') {
          report += `   • 在 ${fix.file} 中加入 DOM 元素: #${fix.id}\n`;
        } else if (fix.type === 'naming-style') {
          const channelCount = fix.channels?.length || fix.channelsFixed?.length || 0;
          report += `   • 統一命名風格: ${fix.from || fix.actualStyle} → ${fix.to || fix.expectedStyle} (${channelCount} 個頻道)\n`;
        } else if (fix.type === 'parameter-mismatch') {
          report += `   • 修正參數格式: '${fix.channel}' ${fix.from} → ${fix.to}\n`;
        }
      }
      report += '\n';
    }

    if (fixResult.failed.length > 0) {
      report += '❌ 無法自動修復的問題:\n';
      for (const fail of fixResult.failed) {
        report += `   • ${fail.type}: ${fail.error || '未知錯誤'}\n`;
      }
      report += '\n';
      report += '💡 這些問題需要手動修復或使用 AI 重新生成\n\n';
    }

    report += '═'.repeat(70) + '\n';

    return report;
  }

  /**
   * 檢測命名風格不一致（camelCase vs kebab-case）
   */
  async detectNamingStyleMismatch(outputDir, validationResult) {
    const issues = [];
    
    // 檢查是否有額外頻道和缺失消費者的配對（命名風格問題的典型特徵）
    const extraChannels = validationResult.issues.extraChannels || [];
    const missingConsumers = validationResult.issues.missingConsumers || [];
    const missingChannels = validationResult.issues.missingChannels || [];
    
    // 如果沒有任何問題，直接返回
    if (extraChannels.length === 0 && missingConsumers.length === 0 && missingChannels.length === 0) {
      return issues;
    }
    
    // 提取額外頻道和缺失消費者的端點名稱
    const extraNames = extraChannels.map(e => e.channel || e.endpoint);
    const missingNames = [...missingConsumers.map(m => m.endpoint), ...missingChannels.map(m => m.endpoint)];
    
    // 檢查是否為 camelCase vs kebab-case 的配對
    const pairs = [];
    for (const extra of extraNames) {
      const kebabVersion = this.camelToKebab(extra);
      const camelVersion = this.kebabToCamel(extra);
      
      // 檢查是否有對應的缺失頻道（kebab-case 版本）
      if (missingNames.includes(kebabVersion) && extra !== kebabVersion) {
        pairs.push({
          actual: extra,
          expected: kebabVersion,
          conversion: 'camelCase → kebab-case'
        });
      }
      // 檢查是否有對應的缺失頻道（camelCase 版本）
      else if (missingNames.includes(camelVersion) && extra !== camelVersion) {
        pairs.push({
          actual: extra,
          expected: camelVersion,
          conversion: 'kebab-case → camelCase'
        });
      }
    }
    
    if (pairs.length > 0) {
      // 判斷應該轉換到哪種風格（以 main.js 的 ipcMain.handle 為準）
      const mainPath = path.join(outputDir, 'main.js');
      try {
        const mainContent = await fs.readFile(mainPath, 'utf-8');
        const handleRegex = /ipcMain\.handle\s*\(\s*['"`]([^'"`]+)['"`]/g;
        const mainChannels = [];
        let match;
        while ((match = handleRegex.exec(mainContent)) !== null) {
          mainChannels.push(match[1]);
        }
        
        // main.js 的風格是標準
        const mainKebabCount = mainChannels.filter(ch => ch.includes('-')).length;
        const mainCamelCount = mainChannels.filter(ch => /[A-Z]/.test(ch)).length;
        const targetStyle = mainKebabCount >= mainCamelCount ? 'kebab-case' : 'camelCase';
        
        issues.push({
          actualStyle: targetStyle === 'kebab-case' ? 'camelCase' : 'kebab-case',
          expectedStyle: targetStyle,
          pairs: pairs,
          channelsToFix: pairs.map(p => ({ from: p.actual, to: p.expected })),
          targetFile: 'preload.js'  // 通常需要修復 preload.js 來匹配 main.js
        });
      } catch (error) {
        // 無法讀取 main.js，使用 pairs 中的資訊
        if (pairs.length > 0) {
          issues.push({
            actualStyle: 'unknown',
            expectedStyle: 'unknown',
            pairs: pairs,
            channelsToFix: pairs.map(p => ({ from: p.actual, to: p.expected })),
            targetFile: 'preload.js'
          });
        }
      }
    }
    
    return issues;
  }

  /**
   * 修復命名風格不一致
   */
  async fixNamingStyle(outputDir, issue) {
    let fixed = false;
    const fixedChannels = [];
    
    // 使用新的 channelsToFix 格式
    if (issue.channelsToFix && issue.channelsToFix.length > 0) {
      const targetFile = issue.targetFile || 'preload.js';
      const filePath = path.join(outputDir, targetFile);
      
      try {
        let content = await fs.readFile(filePath, 'utf-8');
        
        for (const { from, to } of issue.channelsToFix) {
          // 替換 IPC invoke 調用中的頻道名稱
          const regex = new RegExp(
            `(ipcRenderer\\.invoke\\s*\\(\\s*)(['"\`])${this.escapeRegex(from)}\\2`,
            'g'
          );
          
          if (regex.test(content)) {
            content = content.replace(regex, `$1$2${to}$2`);
            fixedChannels.push({ from, to });
            console.log(`   ✓ 修復 ${from} → ${to}`);
          }
        }
        
        if (fixedChannels.length > 0) {
          await fs.writeFile(filePath, content, 'utf-8');
          fixed = true;
        }
      } catch (error) {
        console.error(`Failed to fix naming style in ${targetFile}:`, error.message);
      }
    }
    // 向後兼容舊格式
    else if (issue.channels) {
      const converter = issue.expectedStyle === 'kebab-case' 
        ? this.camelToKebab 
        : this.kebabToCamel;
      
      for (const file of issue.files || ['preload.js']) {
        const filePath = path.join(outputDir, file);
        try {
          let content = await fs.readFile(filePath, 'utf-8');
          
          for (const channel of issue.channels) {
            const newChannel = converter(channel);
            if (channel !== newChannel) {
              const regex = new RegExp(`(['"\`])${this.escapeRegex(channel)}\\1`, 'g');
              content = content.replace(regex, `$1${newChannel}$1`);
              fixedChannels.push({ from: channel, to: newChannel });
            }
          }
          
          await fs.writeFile(filePath, content, 'utf-8');
          fixed = true;
        } catch (error) {
          console.error(`Failed to fix naming style in ${file}:`, error.message);
        }
      }
    }
    
    return fixed;
  }

  /**
   * camelCase 轉 kebab-case
   */
  camelToKebab(str) {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  }

  /**
   * kebab-case 轉 camelCase
   */
  kebabToCamel(str) {
    return str.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
  }

  /**
   * 轉義正則表達式特殊字符
   */
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 修復 select 選項大小寫不一致
   */
  async fixSelectOptionCase(outputDir, selectIssue) {
    const htmlPath = path.join(outputDir, selectIssue.htmlFile);
    
    try {
      let content = await fs.readFile(htmlPath, 'utf-8');
      
      // 替換 select 選項值為 JS 中期望的格式
      const oldValueRegex = new RegExp(
        `(<option[^>]*value\\s*=\\s*["'])${selectIssue.htmlValue}(["'][^>]*>)`,
        'gi'
      );
      
      if (!oldValueRegex.test(content)) {
        return false; // 沒有找到需要替換的值
      }
      
      content = content.replace(oldValueRegex, `$1${selectIssue.jsValue}$2`);
      
      await fs.writeFile(htmlPath, content, 'utf-8');
      return true;
    } catch (error) {
      throw new Error(`Failed to fix select option case: ${error.message}`);
    }
  }

  /**
   * 修復缺失的 DOM 元素
   */
  async fixMissingDomElement(outputDir, missing) {
    const htmlPath = path.join(outputDir, 'public', 'index.html');
    
    try {
      let content = await fs.readFile(htmlPath, 'utf-8');
      
      // 檢查是否真的缺失
      const hasElement = new RegExp(`\\bid\\s*=\\s*["']${missing.id}["']`).test(content);
      if (hasElement) {
        return false; // 已經存在
      }

      // 生成基本的 HTML 元素
      const newElement = this.generateHtmlElement(missing);
      
      // 找到 body 結束標籤前插入
      const bodyEndPos = content.lastIndexOf('</body>');
      if (bodyEndPos === -1) return false;
      
      content = content.slice(0, bodyEndPos) + 
                `  ${newElement}\n` + 
                content.slice(bodyEndPos);
      
      await fs.writeFile(htmlPath, content, 'utf-8');
      return true;
    } catch (error) {
      throw new Error(`Failed to fix missing DOM element: ${error.message}`);
    }
  }

  /**
   * 生成 HTML 元素模板
   */
  generateHtmlElement(missing) {
    const elementType = missing.elementType || 'div';
    const purpose = missing.purpose || 'TODO: Add purpose';
    
    switch (elementType.toLowerCase()) {
      case 'input':
        return `<input type="text" id="${missing.id}" placeholder="${purpose}" />`;
      case 'button':
        return `<button id="${missing.id}">${purpose}</button>`;
      case 'select':
        return `<select id="${missing.id}">
    <option value="">Select...</option>
  </select>`;
      case 'div':
      default:
        return `<div id="${missing.id}"><!-- ${purpose} --></div>`;
    }
  }

  /**
   * 從完整路徑中提取檔案名
   */
  extractFileName(filePath) {
    return filePath.split('/').pop();
  }

  /**
   * 修復參數格式不匹配
   * 將 preload.js 中的多參數調用改為物件參數
   */
  async fixParameterMismatch(outputDir, mismatch) {
    const { endpoint, format1, format2, file2 } = mismatch;
    
    // 只修復 preload.js 端（通常是呼叫端需要配合處理端）
    const fileName = this.extractFileName(file2);
    if (!fileName.includes('preload')) {
      console.log(`   ⚠️  跳過非 preload 文件: ${fileName}`);
      return false;
    }
    
    const preloadPath = path.join(outputDir, 'preload.js');
    
    try {
      let content = await fs.readFile(preloadPath, 'utf-8');
      
      // 情況 1: format1 (main.js) 期望物件，format2 (preload.js) 傳多參數
      if ((format1.type === 'object-destructure' || format1.type === 'object-literal') &&
          (format2.type === 'multiple-params' || format2.type === 'single-param')) {
        
        // 從物件解構格式提取參數名
        const objectParams = format1.raw.replace(/[{}]/g, '').split(',').map(p => p.trim());
        
        // 構建新的物件字面量
        const newParams = `{ ${objectParams.join(', ')} }`;
        
        // 構建搜尋和替換模式
        // 匹配: ipcRenderer.invoke('channel-name', param1, param2)
        const searchPattern = new RegExp(
          `(invoke\\s*\\(\\s*['"]${this.escapeRegex(endpoint)}['"]\\s*,\\s*)${this.escapeRegex(format2.raw)}(\\s*\\))`,
          'g'
        );
        
        const newContent = content.replace(searchPattern, `$1${newParams}$2`);
        
        if (newContent !== content) {
          await fs.writeFile(preloadPath, newContent, 'utf-8');
          console.log(`   ✓ 修復 ${endpoint}: ${format2.raw} → ${newParams}`);
          return true;
        }
      }
      
      console.log(`   ⚠️  無法自動修復 ${endpoint} 的參數格式`);
      return false;
      
    } catch (error) {
      console.error(`   ❌ 修復失敗: ${error.message}`);
      return false;
    }
  }

  /**
   * 修復 HTML 路徑錯誤（移除 public/ 前綴）
   */
  async fixHtmlPath(outputDir, pathError) {
    try {
      const filePath = path.join(outputDir, pathError.file);
      let content = await fs.readFile(filePath, 'utf-8');
      
      // 替換錯誤路徑為正確路徑
      const searchPattern = new RegExp(
        this.escapeRegex(pathError.incorrect).replace(/\//g, '\\/'),
        'g'
      );
      
      const newContent = content.replace(searchPattern, pathError.correct);
      
      if (newContent !== content) {
        await fs.writeFile(filePath, newContent, 'utf-8');
        console.log(`   ✓ 修復 HTML 路徑: ${pathError.incorrect} → ${pathError.correct}`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error(`   ❌ 修復 HTML 路徑失敗: ${error.message}`);
      return false;
    }
  }

  /**
   * 修復 export 語法錯誤
   */
  async fixExportSyntax(outputDir, exportError) {
    try {
      const filePath = path.join(outputDir, exportError.file);
      let content = await fs.readFile(filePath, 'utf-8');
      
      // 移除 export 關鍵字
      const exportPattern = /^(\s*)export\s+(class|function|const|let|var)\s+/gm;
      const newContent = content.replace(exportPattern, '$1$2 ');
      
      // 也移除 export default
      const exportDefaultPattern = /^(\s*)export\s+default\s+/gm;
      const finalContent = newContent.replace(exportDefaultPattern, '$1');
      
      if (finalContent !== content) {
        await fs.writeFile(filePath, finalContent, 'utf-8');
        console.log(`   ✓ 修復 export 語法: ${exportError.file}`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error(`   ❌ 修復 export 語法失敗: ${error.message}`);
      return false;
    }
  }

  /**
   * 修復 main.js 中多餘的 '..' 路徑
   */
  async fixMainJsPath(outputDir, pathError) {
    try {
      const filePath = path.join(outputDir, pathError.file);
      let content = await fs.readFile(filePath, 'utf-8');
      
      // 替換 path.join(__dirname, '..', 'public', ...) 為 path.join(__dirname, 'public', ...)
      const incorrectPattern = /path\.join\s*\(\s*__dirname\s*,\s*['"]\.\.['"],\s*['"]public['"]/g;
      const newContent = content.replace(incorrectPattern, "path.join(__dirname, 'public'");
      
      if (newContent !== content) {
        await fs.writeFile(filePath, newContent, 'utf-8');
        console.log(`   ✓ 修復 main.js 路徑: ${pathError.file} (line ${pathError.line})`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error(`   ❌ 修復 main.js 路徑失敗: ${error.message}`);
      return false;
    }
  }

  /**
   * 修復 preload.js 中的 IPC 參數格式
   */
  async fixPreloadIpcParameter(outputDir, ipcError) {
    try {
      const filePath = path.join(outputDir, ipcError.file);
      let content = await fs.readFile(filePath, 'utf-8');
      
      // 根據錯誤類型修復
      if (ipcError.type === 'preload-ipc-parameter-mismatch') {
        // 修復方法簽名：從 (param) 改為 ({ param })
        // 例如：calculate: async (expression) => ... 改為 calculate: async ({ expression }) => ...
        const channel = ipcError.channel;
        const currentFormat = ipcError.preloadFormat;
        const targetFormat = ipcError.mainJsFormat.replace('event, ', '');
        
        // 找到對應的方法定義並替換
        const methodPattern = new RegExp(`(${this.escapeRegex(channel)}\\s*:\\s*(?:async\\s+)?\\()${this.escapeRegex(currentFormat)}(\\)\\s*=>)`, 'g');
        const newContent = content.replace(methodPattern, `$1${targetFormat}$2`);
        
        if (newContent !== content) {
          await fs.writeFile(filePath, newContent, 'utf-8');
          console.log(`   ✓ 修復 preload.js 方法簽名: ${channel} ${currentFormat} → ${targetFormat}`);
          content = newContent; // 繼續用更新的內容檢查 invoke
        }
      }
      
      if (ipcError.type === 'preload-ipc-invoke-mismatch') {
        // 修復 invoke 調用：從 invoke('channel', param) 改為 invoke('channel', { param })
        const channel = ipcError.channel;
        const invokeArgs = ipcError.invokeArgs;
        
        // 如果參數不是以 { 開頭，將其包裝成物件
        if (!invokeArgs.trim().startsWith('{')) {
          const invokePattern = new RegExp(`ipcRenderer\\.invoke\\s*\\(\\s*['"]${this.escapeRegex(channel)}['"]\\s*,\\s*${this.escapeRegex(invokeArgs)}\\s*\\)`, 'g');
          const newContent = content.replace(invokePattern, `ipcRenderer.invoke('${channel}', { ${invokeArgs} })`);
          
          if (newContent !== content) {
            await fs.writeFile(filePath, newContent, 'utf-8');
            console.log(`   ✓ 修復 preload.js invoke 調用: ${channel} ${invokeArgs} → { ${invokeArgs} }`);
            return true;
          }
        }
      }
      
      return false;
    } catch (error) {
      console.error(`   ❌ 修復 preload.js IPC 參數失敗: ${error.message}`);
      return false;
    }
  }

  /**
   * 轉義 regex 特殊字符
   */
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 批量檢查並修復專案
   */
  async checkAndFix(sessionId, contractValidator) {
    console.log('\n🔍 開始檢查契約一致性...');
    
    // 先驗證
    const validationResult = await contractValidator.validateSession(sessionId);
    
    if (validationResult.isValid) {
      console.log('✅ 契約驗證通過，無需修復');
      return { needsFix: false, validationResult };
    }

    console.log('⚠️  發現契約不一致，嘗試自動修復...\n');

    // 自動修復
    const fixResult = await this.autoFix(sessionId, validationResult);
    const report = this.generateReport(fixResult);
    console.log(report);

    if (!fixResult.success || fixResult.failCount > 0) {
      return {
        needsFix: true,
        validationResult,
        fixResult,
        needsAI: true // 需要 AI 介入
      };
    }

    // 修復後重新驗證
    console.log('🔄 重新驗證修復結果...');
    const revalidation = await contractValidator.validateSession(sessionId);
    
    if (revalidation.isValid) {
      console.log('✅ 修復成功！所有契約現在都一致了\n');
      return {
        needsFix: false,
        validationResult: revalidation,
        fixResult
      };
    } else {
      console.log('⚠️  部分問題仍未解決，可能需要 AI 介入\n');
      return {
        needsFix: true,
        validationResult: revalidation,
        fixResult,
        needsAI: true
      };
    }
  }
}
