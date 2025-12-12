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
              channels: issue.channels,
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
          report += `   • 統一命名風格: ${fix.from} → ${fix.to} (${fix.channels.length} 個頻道)\n`;
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
    
    // 檢查是否大量頻道都缺失（可能是命名風格問題）
    const missingChannels = validationResult.issues.missingChannels || [];
    if (missingChannels.length === 0) return issues;
    
    // 讀取實際文件來分析命名風格
    const mainPath = path.join(outputDir, 'main.js');
    const preloadPath = path.join(outputDir, 'preload.js');
    
    try {
      const mainContent = await fs.readFile(mainPath, 'utf-8');
      const preloadContent = await fs.readFile(preloadPath, 'utf-8');
      
      // 提取實際使用的 IPC 頻道名稱
      const actualChannels = [];
      const ipcRegex = /ipc(?:Main|Renderer)\.(?:handle|invoke)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
      let match;
      
      while ((match = ipcRegex.exec(mainContent + preloadContent)) !== null) {
        if (!actualChannels.includes(match[1])) {
          actualChannels.push(match[1]);
        }
      }
      
      // 分析命名風格
      const camelCaseCount = actualChannels.filter(ch => /^[a-z]+[A-Z]/.test(ch)).length;
      const kebabCaseCount = actualChannels.filter(ch => /^[a-z]+-[a-z]/.test(ch)).length;
      
      const actualStyle = camelCaseCount > kebabCaseCount ? 'camelCase' : 'kebab-case';
      
      // 檢查期望的風格
      const expectedChannels = missingChannels.map(mc => mc.endpoint);
      const expectedKebabCount = expectedChannels.filter(ch => /^[a-z]+-[a-z]/.test(ch)).length;
      const expectedCamelCount = expectedChannels.filter(ch => /^[a-z]+[A-Z]/.test(ch)).length;
      
      const expectedStyle = expectedKebabCount > expectedCamelCount ? 'kebab-case' : 'camelCase';
      
      // 如果風格不同，這就是問題所在
      if (actualStyle !== expectedStyle && actualChannels.length > 0) {
        issues.push({
          actualStyle,
          expectedStyle,
          channels: actualChannels,
          expectedChannels,
          files: ['main.js', 'preload.js']
        });
      }
      
    } catch (error) {
      // 檔案讀取失敗，跳過
    }
    
    return issues;
  }

  /**
   * 修復命名風格不一致
   */
  async fixNamingStyle(outputDir, issue) {
    const converter = issue.expectedStyle === 'kebab-case' 
      ? this.camelToKebab 
      : this.kebabToCamel;
    
    let fixed = false;
    
    for (const file of issue.files) {
      const filePath = path.join(outputDir, file);
      try {
        let content = await fs.readFile(filePath, 'utf-8');
        
        // 轉換所有 IPC 頻道名稱
        for (const channel of issue.channels) {
          const newChannel = converter(channel);
          const regex = new RegExp(`(['"\`])${this.escapeRegex(channel)}\\1`, 'g');
          content = content.replace(regex, `$1${newChannel}$1`);
        }
        
        await fs.writeFile(filePath, content, 'utf-8');
        fixed = true;
      } catch (error) {
        console.error(`Failed to fix naming style in ${file}:`, error.message);
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
