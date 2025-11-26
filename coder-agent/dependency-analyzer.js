/**
 * Dependency Analyzer - 分析檔案之間的依賴關係
 * * 職責：
 * 1. 分析檔案類型與內容中的引用 (Import/Require)
 * 2. 建立生成順序（拓撲排序，Bottom-Up：先生成被依賴的工具，再生成依賴它們的組件）
 * 3. 識別可以併發生成的檔案群組 (Layers)
 */

const logger = require('../shared/logger');
const path = require('path');

class DependencyAnalyzer {
  constructor() {
    // 檔案副檔名到類型的映射
    this.extToType = {
      '.html': 'html', '.htm': 'html',
      '.css': 'css', '.scss': 'css', '.sass': 'css', '.less': 'css',
      '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.jsx': 'javascript',
      '.ts': 'typescript', '.tsx': 'typescript',
      '.py': 'python',
      '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.hpp': 'cpp', '.cc': 'cpp',
      '.go': 'go', '.rs': 'rust', '.java': 'java', '.cs': 'csharp',
      '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.xml': 'xml', '.md': 'markdown'
    };
  }

  /**
   * 從檔案路徑取得類型
   */
  getFileType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return this.extToType[ext] || 'unknown';
  }

  /**
   * 分析檔案列表，建立依賴圖和生成順序
   * @param {Array} files - 檔案列表 [{ path, language, ... }]
   * @param {Object} skeletons - 骨架內容 { "path/to/file": "content..." }
   * @param {String} requestId
   * @returns {Object} - { order: [...], groups: [[...], [...]], depGraph: {...} }
   */
  analyze(files, skeletons, requestId = null) {
    logger.info('Analyzing file dependencies', requestId, { totalFiles: files.length });

    // 1. 初始化圖
    const depGraph = {}; // Key: 檔案, Value: [它依賴的檔案]
    const fileMap = {};  // 快速查找物件
    
    files.forEach(file => {
      depGraph[file.path] = []; 
      fileMap[file.path] = file;
    });

    // 2. 根據骨架內容建立依賴圖
    this.buildGraphFromSkeletons(depGraph, fileMap, skeletons);
    
    // 3. 執行拓撲排序 (Bottom-Up: 基礎模組在前，應用模組在後)
    const order = this.topologicalSort(depGraph, files);
    
    // 4. 識別可併發的檔案群組
    const groups = this.identifyConcurrentGroups(order, depGraph);
    
    logger.info('Dependency analysis completed', requestId, {
      totalFiles: files.length,
      layerCount: groups.length,
      largestLayer: Math.max(...groups.map(g => g.length), 0)
    });
    
    return { order, groups, depGraph };
  }

  /**
   * 透過分析骨架內容（import 語句）來建立依賴圖
   */
  buildGraphFromSkeletons(depGraph, fileMap, skeletons) {
    // Regex 定義
    // JS/TS: 支援 import from, dynamic import, require
    const JS_IMPORT_FROM_REGEX = /import\s+(?:[\w\s{},*]+)\s+from\s*['"]([^'"]+)['"]/g;
    const JS_DYNAMIC_IMPORT_REGEX = /(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    const JS_REQUIRE_REGEX = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

    // Python: 支援 from ... import, import ...
    const PY_IMPORT_REGEX = /(?:from\s+([.\w]+)\s+import|import\s+([.\w]+))/g;

    // HTML: 支援 script src, link href
    const HTML_SCRIPT_REGEX = /<script[^>]+src=["']([^"']+)["']/g;
    const HTML_LINK_REGEX = /<link[^>]+href=["']([^"']+)["'][^>]*(?:rel=["']stylesheet["']|type=["']text\/css["'])/g;

    const allFilePaths = Object.keys(fileMap);

    // 輔助：提取匹配項
    const extractMatches = (content, regexes) => {
        const matches = [];
        regexes.forEach(regex => {
            let match;
            // 重置 regex 索引，避免全域匹配的陷阱
            regex.lastIndex = 0;
            while ((match = regex.exec(content)) !== null) {
                // 捕獲群組 1 或 2 (Python 有時在 2)
                matches.push(match[1] || match[2]);
            }
        });
        return matches;
    };

    for (const filePath in skeletons) {
      const content = skeletons[filePath];
      if (!content || !fileMap[filePath]) continue;

      const fileType = this.getFileType(filePath);
      let targetRegexes = [];

      switch (fileType) {
        case 'javascript':
        case 'typescript':
          targetRegexes = [JS_IMPORT_FROM_REGEX, JS_DYNAMIC_IMPORT_REGEX, JS_REQUIRE_REGEX];
          break;
        case 'python':
          targetRegexes = [PY_IMPORT_REGEX];
          break;
        case 'html':
          targetRegexes = [HTML_SCRIPT_REGEX, HTML_LINK_REGEX];
          break;
        default:
          continue; 
      }

      const importPaths = extractMatches(content, targetRegexes);

      // 去重並解析路徑
      const uniqueImports = [...new Set(importPaths)];
      for (const rawPath of uniqueImports) {
        const dependencyPath = this._resolveImportPath(
          filePath, 
          rawPath, 
          allFilePaths, 
          fileType
        );

        if (dependencyPath && depGraph[filePath]) {
          // 建立依賴：filePath 依賴 dependencyPath
          depGraph[filePath].push(dependencyPath);
        }
      }
      
      // 依賴去重
      if (depGraph[filePath]) {
        depGraph[filePath] = [...new Set(depGraph[filePath])];
      }
    }
  }

  /**
   * 解析導入路徑
   */
  _resolveImportPath(currentFile, importPath, allFilePaths, fileType) {
    const currentDir = path.dirname(currentFile);

    // 1. HTML 直接解析
    if (fileType === 'html') {
      // HTML 通常使用相對路徑，嘗試多種解析方式
      const candidates = [
        path.resolve(currentDir, importPath),
        importPath,  // 如果是根目錄的文件名（如 "config.js"）
        path.join(currentDir, importPath)
      ];
      
      for (const candidate of candidates) {
        if (allFilePaths.includes(candidate)) return candidate;
      }
      return null;
    }

    // 2. JS/TS 解析 (處理副檔名與 index)
    if (['javascript', 'typescript'].includes(fileType)) {
      // 處理相對路徑
      if (importPath.startsWith('./') || importPath.startsWith('../')) {
        let resolvedPath = path.resolve(currentDir, importPath);
        
        // 嘗試列表
        const candidates = [
            resolvedPath,
            resolvedPath + '.js', resolvedPath + '.ts', 
            resolvedPath + '.jsx', resolvedPath + '.tsx',
            resolvedPath + '/index.js', resolvedPath + '/index.ts'
        ];

        for (const candidate of candidates) {
            if (allFilePaths.includes(candidate)) return candidate;
        }
      } else {
        // 處理同目錄文件（沒有 ./ 前綴的情況，如 HTML 中的 "config.js"）
        // 這種情況在 HTML 的 <script src="config.js"> 中常見
        const sameDir = path.join(currentDir, importPath);
        if (allFilePaths.includes(sameDir)) return sameDir;
        
        // 嘗試添加副檔名
        const sameDirWithExt = [
          sameDir + '.js', sameDir + '.ts',
          sameDir + '.jsx', sameDir + '.tsx'
        ];
        for (const candidate of sameDirWithExt) {
          if (allFilePaths.includes(candidate)) return candidate;
        }
      }
      return null; // node_modules 或別名暫不處理
    }

    // 3. Python 解析
    if (fileType === 'python') {
       let resolvedPath = null;

       if (importPath.startsWith('.')) {
         // 相對導入
         const dots = importPath.match(/^(\.+)/)[0];
         const depth = dots.length;
         const modulePart = importPath.substring(depth).replace(/\./g, '/');
         
         let baseDir = currentDir;
         for (let i = 1; i < depth; i++) {
             baseDir = path.dirname(baseDir);
         }
         resolvedPath = path.resolve(baseDir, modulePart);
       } else {
         // 絕對導入 (簡化版：在專案中搜尋)
         const modulePath = importPath.replace(/\./g, '/');
         for (const p of allFilePaths) {
           if (p.endsWith(modulePath + '.py') || p.endsWith(modulePath + '/__init__.py')) {
             // 找到最近似的匹配
             resolvedPath = p.endsWith('.py') ? p : path.dirname(p);
             break;
           }
         }
       }

       if (!resolvedPath) return null;

       // 確認具體檔案
       if (allFilePaths.includes(resolvedPath + '.py')) return resolvedPath + '.py';
       if (allFilePaths.includes(resolvedPath + '/__init__.py')) return resolvedPath + '/__init__.py';
       // 如果 resolvedPath 本身就是完整路徑
       if (allFilePaths.includes(resolvedPath)) return resolvedPath;
    }

    return null;
  }

  /**
   * 拓撲排序 (Kahn's Algorithm - Out-Degree 版本)
   * 目的：產出 [Utils, Core, App] 的順序 (Bottom-Up)
   * * 邏輯：
   * - 依賴關係圖：A -> [B] (A 依賴 B)
   * - 我們希望 B 先被處理 (因為它是基礎)
   * - 所以我們找 "Out-Degree = 0" 的節點 (不依賴別人的節點) 先加入佇列
   */
  topologicalSort(graph, files) {
    const outDegree = {};
    const usedBy = {}; // 反向圖：誰依賴我 (B -> [A])
    
    // 初始化
    files.forEach(f => {
      outDegree[f.path] = 0;
      usedBy[f.path] = [];
    });

    // 構建 Out-Degree 和 反向圖
    Object.keys(graph).forEach(importer => {
      const dependencies = graph[importer];
      dependencies.forEach(dep => {
        // 確保依賴也在我們的檔案列表中 (防止引用了外部不存在的檔案導致 crash)
        if (outDegree[importer] !== undefined && usedBy[dep] !== undefined) {
          outDegree[importer]++;      // Importer 依賴數 +1
          usedBy[dep].push(importer); // Dep 被 Importer 使用
        }
      });
    });

    // 找出所有 0 依賴的節點 (最底層的基礎檔案)
    const queue = [];
    Object.keys(outDegree).forEach(node => {
      if (outDegree[node] === 0) {
        queue.push(node);
      }
    });

    const sortedOrder = [];

    while (queue.length > 0) {
      const node = queue.shift();
      sortedOrder.push(node);

      // 通知所有依賴我的節點 (Parents)
      const parents = usedBy[node] || [];
      parents.forEach(parent => {
        outDegree[parent]--;
        if (outDegree[parent] === 0) {
          queue.push(parent);
        }
      });
    }

    // 檢查是否所有文件都已處理
    if (sortedOrder.length !== files.length) {
      const missing = files.filter(f => !sortedOrder.includes(f.path));
      
      // 檢查是否是真正的循環依賴（missing 中的文件互相依賴）
      const hasCircular = missing.some(f => {
        const deps = graph[f.path] || [];
        return deps.some(dep => missing.find(m => m.path === dep));
      });
      
      if (hasCircular) {
        logger.warn('Circular dependency detected', null, { 
          missingFiles: missing.map(f => f.path) 
        });
      } else {
        // 可能是孤立節點或路徑解析問題，用 INFO 而不是 WARN
        logger.info('Adding remaining files (likely isolated or config files)', null, {
          files: missing.map(f => f.path)
        });
      }
      
      // 強制將剩餘檔案加入 (避免遺漏)
      missing.forEach(f => sortedOrder.push(f.path));
    }

    return sortedOrder;
  }

  /**
   * 識別可以併發生成的檔案群組（層級）
   * 邏輯：遍歷排序好的列表，若一個檔案的所有依賴都已在「之前的層級」處理完，則加入當前層級。
   */
  identifyConcurrentGroups(order, graph) {
    const groups = [];
    const processed = new Set();
    
    // 為了避免無限迴圈，設定最大迭代次數 (雖有拓撲排序保護，但防禦性編程)
    let loopGuard = 0;
    const MAX_LOOPS = order.length + 5;

    while (processed.size < order.length && loopGuard < MAX_LOOPS) {
      loopGuard++;
      const currentGroup = [];
      
      // 掃描還沒處理的檔案
      for (const filePath of order) {
        if (processed.has(filePath)) continue;

        const deps = graph[filePath] || [];
        
        // 檢查該檔案的所有依賴是否都已經在 "已處理集合" 中
        // 注意：對於第一層 (0依賴) 的檔案，every([]) 會回傳 true，這正是我們要的
        const allDepsProcessed = deps.every(dep => processed.has(dep));

        if (allDepsProcessed) {
          currentGroup.push(filePath);
        }
      }

      if (currentGroup.length > 0) {
        groups.push(currentGroup);
        currentGroup.forEach(f => processed.add(f));
      } else {
        // Deadlock fallback: 如果這一輪沒有任何進展 (通常是因為循環依賴被強制加入順序中)
        // 強制取出剩下順序中的第一個
        const remaining = order.filter(f => !processed.has(f));
        if (remaining.length > 0) {
            const forced = remaining[0];
            groups.push([forced]);
            processed.add(forced);
        } else {
            break; // 全部處理完畢
        }
      }
    }
    
    return groups;
  }

  /**
   * 檢查兩個檔案之間是否有直接依賴
   */
  hasDependency(fileA, fileB, graph) {
    return graph[fileA] && graph[fileA].includes(fileB);
  }

  /**
   * 取得檔案的所有依賴（遞迴）
   */
  getAllDependencies(filePath, graph, visited = new Set()) {
    if (visited.has(filePath)) return [];
    visited.add(filePath);
    
    const deps = graph[filePath] || [];
    const allDeps = [...deps];
    
    deps.forEach(dep => {
      const subDeps = this.getAllDependencies(dep, graph, visited);
      allDeps.push(...subDeps);
    });
    
    return [...new Set(allDeps)];
  }

  /**
   * 生成依賴圖的視覺化描述
   */
  visualizeDependencies(graph, groups, requestId = null) {
    const lines = [];
    
    lines.push('\n=== Dependency Graph (A depends on B) ===');
    Object.keys(graph).forEach(file => {
      const deps = graph[file];
      if (deps && deps.length > 0) {
        lines.push(`${path.basename(file)} imports:`);
        deps.forEach(dep => {
          lines.push(`  -> ${path.basename(dep)}`);
        });
      }
    });
    
    lines.push('\n=== Generation Order (Bottom-Up) ===');
    groups.forEach((group, idx) => {
      lines.push(`Layer ${idx + 1} (Parallelizable):`);
      group.forEach(file => {
        lines.push(`  - ${path.basename(file)}`);
      });
    });
    
    const visualization = lines.join('\n');
    logger.info('Dependency visualization', requestId, { visualization });
    
    return visualization;
  }
}

module.exports = DependencyAnalyzer;