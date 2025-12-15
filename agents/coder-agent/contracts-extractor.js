/**
 * ContractsExtractor - 從已生成的檔案中提取實際的 contracts
 * 
 * 解決問題：Architect 定義的 contracts 可能與 AI 實際生成的內容不一致
 * 解決方案：每層生成完後，解析實際內容，更新 contracts 供下一層使用
 */

const logger = require('../shared/logger.cjs');
const path = require('path');

class ContractsExtractor {
  constructor() {
    // DOM ID 提取的正則表達式
    this.patterns = {
      // HTML: id="xxx" or id='xxx'
      htmlId: /\bid\s*=\s*["']([^"']+)["']/gi,
      // HTML: class="xxx" (提取第一個 class)
      htmlClass: /\bclass\s*=\s*["']([^"'\s]+)/gi,
      // HTML: name="xxx"
      htmlName: /\bname\s*=\s*["']([^"']+)["']/gi,
      // HTML: data-* attributes
      htmlData: /\bdata-([a-z-]+)\s*=\s*["']([^"']+)["']/gi,
      
      // JS: getElementById('xxx') or getElementById("xxx")
      jsGetById: /getElementById\s*\(\s*["']([^"']+)["']\s*\)/gi,
      // JS: querySelector('#xxx') or querySelector(".xxx")
      jsQuerySelector: /querySelector\s*\(\s*["']([#.][^"']+)["']\s*\)/gi,
      // JS: querySelectorAll
      jsQuerySelectorAll: /querySelectorAll\s*\(\s*["']([^"']+)["']\s*\)/gi,
      
      // IPC: ipcMain.handle('channel', ...) or ipcRenderer.invoke('channel', ...)
      ipcHandle: /ipc(?:Main|Renderer)\.(?:handle|on|invoke|send)\s*\(\s*["']([^"']+)["']/gi,
      // Preload: contextBridge.exposeInMainWorld('apiName', ...)
      contextBridge: /contextBridge\.exposeInMainWorld\s*\(\s*["']([^"']+)["']/gi,
      
      // LocalStorage: localStorage.getItem('key') or setItem('key', ...)
      localStorage: /localStorage\.(?:get|set|remove)Item\s*\(\s*["']([^"']+)["']/gi,
      // SessionStorage
      sessionStorage: /sessionStorage\.(?:get|set|remove)Item\s*\(\s*["']([^"']+)["']/gi,
      
      // File operations: fs.readFileSync('path'), fs.writeFileSync('path', ...)
      fsOperations: /fs\.(?:read|write)(?:File)?(?:Sync)?\s*\(\s*["']([^"']+)["']/gi
    };
  }

  /**
   * 從已完成的檔案列表中提取 contracts
   * @param {Array} completedFiles - [{ path, content, language }]
   * @returns {Object} 提取的 contracts
   */
  extractFromFiles(completedFiles, requestId = null) {
    const extracted = {
      dom: [],      // DOM 元素 ID
      api: [],      // IPC channels / API endpoints
      storage: [],  // Storage keys
      _meta: {
        extractedAt: new Date().toISOString(),
        filesProcessed: completedFiles.length,
        sources: []
      }
    };

    for (const file of completedFiles) {
      if (!file.content) continue;

      const ext = path.extname(file.path).toLowerCase();
      const results = this.extractFromContent(file.content, ext, file.path);

      // 合併結果
      if (results.dom.length > 0) {
        extracted.dom.push(...results.dom);
        extracted._meta.sources.push({ file: file.path, type: 'dom', count: results.dom.length });
      }
      if (results.api.length > 0) {
        extracted.api.push(...results.api);
        extracted._meta.sources.push({ file: file.path, type: 'api', count: results.api.length });
      }
      if (results.storage.length > 0) {
        extracted.storage.push(...results.storage);
        extracted._meta.sources.push({ file: file.path, type: 'storage', count: results.storage.length });
      }
    }

    // 去重
    extracted.dom = this.deduplicateById(extracted.dom);
    extracted.api = this.deduplicateByEndpoint(extracted.api);
    extracted.storage = this.deduplicateByKey(extracted.storage);

    logger.info('Contracts extracted from completed files', requestId, {
      domElements: extracted.dom.length,
      apiEndpoints: extracted.api.length,
      storageKeys: extracted.storage.length
    });

    return extracted;
  }

  /**
   * 從單個檔案內容提取 contracts
   */
  extractFromContent(content, ext, filePath) {
    const result = { dom: [], api: [], storage: [] };

    if (ext === '.html' || ext === '.htm') {
      result.dom = this.extractDomFromHtml(content, filePath);
    } else if (['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs'].includes(ext)) {
      const jsResult = this.extractFromJavaScript(content, filePath);
      result.dom = jsResult.dom;
      result.api = jsResult.api;
      result.storage = jsResult.storage;
    }

    return result;
  }

  /**
   * 從 HTML 提取 DOM 元素
   */
  extractDomFromHtml(content, filePath) {
    const elements = [];
    const seenIds = new Set();

    // 提取 id 屬性
    let match;
    const idRegex = /\bid\s*=\s*["']([^"']+)["']/gi;
    while ((match = idRegex.exec(content)) !== null) {
      const id = match[1];
      if (!seenIds.has(id)) {
        seenIds.add(id);
        
        // 嘗試判斷元素類型
        const elementType = this.guessElementType(content, match.index, id);
        
        elements.push({
          id: id,
          type: elementType,
          purpose: this.guessPurpose(id),
          source: filePath,
          accessedBy: [] // 後續 JS 檔案會填充
        });
      }
    }

    return elements;
  }

  /**
   * 從 JavaScript 提取 contracts
   */
  extractFromJavaScript(content, filePath) {
    const dom = [];
    const api = [];
    const storage = [];
    const seenIds = new Set();
    const seenChannels = new Set();
    const seenKeys = new Set();

    // 提取 DOM 引用
    let match;
    
    // getElementById
    const getByIdRegex = /getElementById\s*\(\s*["']([^"']+)["']\s*\)/gi;
    while ((match = getByIdRegex.exec(content)) !== null) {
      const id = match[1];
      if (!seenIds.has(id)) {
        seenIds.add(id);
        dom.push({
          id: id,
          type: 'unknown',
          purpose: this.guessPurpose(id),
          source: filePath,
          usageType: 'getElementById'
        });
      }
    }

    // querySelector with #id
    const querySelectorRegex = /querySelector\s*\(\s*["']#([^"'.\s\[]+)["']\s*\)/gi;
    while ((match = querySelectorRegex.exec(content)) !== null) {
      const id = match[1];
      if (!seenIds.has(id)) {
        seenIds.add(id);
        dom.push({
          id: id,
          type: 'unknown',
          purpose: this.guessPurpose(id),
          source: filePath,
          usageType: 'querySelector'
        });
      }
    }

    // IPC channels (Electron)
    const ipcRegex = /ipc(?:Main|Renderer)\.(?:handle|on|invoke|send)\s*\(\s*["']([^"']+)["']/gi;
    while ((match = ipcRegex.exec(content)) !== null) {
      const channel = match[1];
      if (!seenChannels.has(channel)) {
        seenChannels.add(channel);
        api.push({
          endpoint: channel,
          method: 'ipc-handle',
          purpose: this.guessPurpose(channel),
          source: filePath
        });
      }
    }

    // contextBridge (Electron preload)
    const bridgeRegex = /contextBridge\.exposeInMainWorld\s*\(\s*["']([^"']+)["']/gi;
    while ((match = bridgeRegex.exec(content)) !== null) {
      const apiName = match[1];
      if (!seenChannels.has(apiName)) {
        seenChannels.add(apiName);
        api.push({
          endpoint: apiName,
          method: 'contextBridge',
          purpose: `Exposed API: ${apiName}`,
          source: filePath
        });
      }
    }

    // LocalStorage
    const localStorageRegex = /localStorage\.(?:get|set|remove)Item\s*\(\s*["']([^"']+)["']/gi;
    while ((match = localStorageRegex.exec(content)) !== null) {
      const key = match[1];
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        storage.push({
          key: key,
          type: 'localStorage',
          purpose: this.guessPurpose(key),
          source: filePath
        });
      }
    }

    // File paths (for Electron main process)
    const fsRegex = /(?:readFileSync|writeFileSync|readFile|writeFile)\s*\(\s*(?:path\.join\([^)]+,\s*)?["']([^"']+\.json)["']/gi;
    while ((match = fsRegex.exec(content)) !== null) {
      const filename = match[1];
      if (!seenKeys.has(filename)) {
        seenKeys.add(filename);
        storage.push({
          key: filename,
          type: 'file',
          purpose: `Data file: ${filename}`,
          source: filePath
        });
      }
    }

    return { dom, api, storage };
  }

  /**
   * 根據 HTML 上下文猜測元素類型
   */
  guessElementType(content, matchIndex, id) {
    // 往前找最近的 < 標籤
    const beforeMatch = content.substring(Math.max(0, matchIndex - 100), matchIndex);
    const tagMatch = beforeMatch.match(/<(\w+)[^>]*$/);
    if (tagMatch) {
      return tagMatch[1].toLowerCase();
    }
    return 'unknown';
  }

  /**
   * 根據 ID 名稱猜測用途
   */
  guessPurpose(name) {
    const lowerName = name.toLowerCase();
    
    if (lowerName.includes('input') || lowerName.includes('text')) return 'User input field';
    if (lowerName.includes('btn') || lowerName.includes('button')) return 'Action button';
    if (lowerName.includes('list') || lowerName.includes('container')) return 'Content container';
    if (lowerName.includes('form')) return 'Form element';
    if (lowerName.includes('modal') || lowerName.includes('dialog')) return 'Modal/Dialog';
    if (lowerName.includes('nav') || lowerName.includes('menu')) return 'Navigation';
    if (lowerName.includes('header') || lowerName.includes('footer')) return 'Layout section';
    if (lowerName.includes('error') || lowerName.includes('message')) return 'Feedback display';
    if (lowerName.includes('save') || lowerName.includes('submit')) return 'Submit action';
    if (lowerName.includes('delete') || lowerName.includes('remove')) return 'Delete action';
    if (lowerName.includes('add') || lowerName.includes('create') || lowerName.includes('new')) return 'Create action';
    
    return 'UI element';
  }

  /**
   * 合併提取的 contracts 與原始 contracts
   * @param {Object} original - Architect 定義的 contracts
   * @param {Object} extracted - 從檔案提取的 contracts
   * @returns {Object} 合併後的 contracts
   */
  mergeContracts(original, extracted, requestId = null) {
    if (!original) {
      return extracted;
    }

    const merged = {
      dom: [...(original.dom || [])],
      api: [...(original.api || [])],
      storage: [...(original.storage || [])]
    };

    // 🔄 建立雙向關聯：當 JS 使用某個 DOM ID，更新 HTML 的 accessedBy
    for (const extractedDom of (extracted.dom || [])) {
      const existing = merged.dom.find(d => d.id === extractedDom.id);
      if (existing) {
        // 更新現有項目（保留原始 purpose，更新 type 和 source）
        if (extractedDom.type !== 'unknown') {
          existing.type = extractedDom.type;
        }
        existing._actualSource = extractedDom.source;
        existing._verified = true;
        
        // 🔥 新增：如果這是 JS 檔案訪問 HTML 元素，記錄到 accessedBy
        if (extractedDom.source && extractedDom.source.endsWith('.js')) {
          existing.accessedBy = existing.accessedBy || [];
          if (!existing.accessedBy.includes(extractedDom.source)) {
            existing.accessedBy.push(extractedDom.source);
          }
        }
        
        // 🔥 新增：如果這是 HTML 定義元素，記錄為 consumers（反向）
        if (extractedDom.source && extractedDom.source.endsWith('.html')) {
          existing.consumers = existing.consumers || [];
          // HTML 是生產者，consumers 會在其他 JS 提取時填充
        }
      } else {
        // 新增提取到的項目
        extractedDom._isExtracted = true;
        extractedDom.accessedBy = extractedDom.accessedBy || [];
        extractedDom.consumers = extractedDom.consumers || [];
        merged.dom.push(extractedDom);
      }
    }

    for (const extractedApi of (extracted.api || [])) {
      const existing = merged.api.find(a => a.endpoint === extractedApi.endpoint);
      if (existing) {
        existing._actualSource = extractedApi.source;
        existing._verified = true;
        
        // 🔥 新增：建立 producers/consumers 雙向關聯
        const sourceFile = extractedApi.source;
        if (sourceFile) {
          // main.js 中 ipcMain.handle() → producer
          if (sourceFile.includes('main.js') && extractedApi.method === 'ipc-handle') {
            existing.producers = existing.producers || [];
            if (!existing.producers.includes(sourceFile)) {
              existing.producers.push(sourceFile);
            }
          }
          // preload.js 中 ipcRenderer.invoke() → bridge (既是 consumer 也是 producer)
          if (sourceFile.includes('preload.js')) {
            existing.consumers = existing.consumers || [];
            if (!existing.consumers.includes(sourceFile)) {
              existing.consumers.push(sourceFile);
            }
          }
          // script.js 中使用 window.electronAPI → consumer
          if (sourceFile.includes('script.js') || sourceFile.includes('renderer')) {
            existing.consumers = existing.consumers || [];
            if (!existing.consumers.includes(sourceFile)) {
              existing.consumers.push(sourceFile);
            }
          }
        }
      } else {
        extractedApi._isExtracted = true;
        extractedApi.producers = extractedApi.producers || [];
        extractedApi.consumers = extractedApi.consumers || [];
        merged.api.push(extractedApi);
      }
    }

    for (const extractedStorage of (extracted.storage || [])) {
      const existing = merged.storage.find(s => s.key === extractedStorage.key);
      if (existing) {
        existing._actualSource = extractedStorage.source;
        existing._verified = true;
      } else {
        extractedStorage._isExtracted = true;
        merged.storage.push(extractedStorage);
      }
    }

    // 標記未驗證的原始 contracts
    merged.dom.forEach(d => { if (!d._verified && !d._isExtracted) d._unverified = true; });
    merged.api.forEach(a => { if (!a._verified && !a._isExtracted) a._unverified = true; });
    merged.storage.forEach(s => { if (!s._verified && !s._isExtracted) s._unverified = true; });

    logger.info('Contracts merged', requestId, {
      originalDom: (original.dom || []).length,
      extractedDom: (extracted.dom || []).length,
      mergedDom: merged.dom.length,
      verifiedDom: merged.dom.filter(d => d._verified).length
    });

    return merged;
  }

  // 去重輔助函數
  deduplicateById(arr) {
    const seen = new Map();
    for (const item of arr) {
      if (!seen.has(item.id)) {
        seen.set(item.id, item);
      }
    }
    return Array.from(seen.values());
  }

  deduplicateByEndpoint(arr) {
    const seen = new Map();
    for (const item of arr) {
      if (!seen.has(item.endpoint)) {
        seen.set(item.endpoint, item);
      }
    }
    return Array.from(seen.values());
  }

  deduplicateByKey(arr) {
    const seen = new Map();
    for (const item of arr) {
      if (!seen.has(item.key)) {
        seen.set(item.key, item);
      }
    }
    return Array.from(seen.values());
  }
}

module.exports = ContractsExtractor;
