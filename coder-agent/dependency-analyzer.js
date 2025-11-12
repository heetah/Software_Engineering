/**
 * Dependency Analyzer - 分析檔案之間的依賴關係
 * 
 * 職責：
 * 1. 分析檔案類型之間的依賴關係
 * 2. 建立生成順序（拓撲排序）
 * 3. 識別可以併發生成的檔案群組
 */

const logger = require('../shared/logger');
const path = require('path');

class DependencyAnalyzer {
  constructor() {
    // 定義檔案類型之間的依賴關係
    // 格式: { fileType: [dependsOn, ...] }
    this.typeDependencies = {
      // Frontend 依賴鏈
      'html': [],                    // HTML 不依賴任何檔案
      'css': ['html'],               // CSS 需要 HTML 先存在（選擇器）
      'javascript': ['html', 'css'], // JS 需要 HTML 和 CSS（DOM 操作、樣式相關）
      'typescript': ['html', 'css'], // TS 同 JS
      
      // Python 模組依賴
      'python': [],                  // Python 檔案之間需要進一步分析
      
      // System 語言通常獨立
      'c': [],
      'cpp': ['c'],                  // C++ 可能包含 C 標頭
      'go': [],
      'rust': [],
      'java': [],
      'csharp': [],
      
      // 配置和資料檔案
      'json': [],
      'yaml': [],
      'xml': [],
      'markdown': []
    };
    
    // 檔案副檔名到類型的映射
    this.extToType = {
      '.html': 'html',
      '.htm': 'html',
      '.css': 'css',
      '.scss': 'css',
      '.sass': 'css',
      '.less': 'css',
      '.js': 'javascript',
      '.mjs': 'javascript',
      '.cjs': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.c': 'c',
      '.h': 'c',
      '.cpp': 'cpp',
      '.hpp': 'cpp',
      '.cc': 'cpp',
      '.go': 'go',
      '.rs': 'rust',
      '.java': 'java',
      '.cs': 'csharp',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.xml': 'xml',
      '.md': 'markdown'
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
   * 
   * @param {Array} files - 檔案列表 [{ path, language, ... }]
   * @returns {Object} - { order: [...], groups: [[...], [...]] }
   */
  analyze(files, requestId = null) {
    logger.info('Analyzing file dependencies', requestId, { totalFiles: files.length });
    
    // 1. 建立檔案類型統計
    const typeMap = this.buildTypeMap(files);
    
    // 2. 分析特殊依賴（如 Python 模組內部依賴）
    const specialDeps = this.analyzeSpecialDependencies(files, typeMap);
    
    // 3. 建立完整的依賴圖
    const depGraph = this.buildDependencyGraph(files, typeMap, specialDeps);
    
    // 4. 執行拓撲排序
    const order = this.topologicalSort(depGraph, files);
    
    // 5. 識別可併發的檔案群組
    const groups = this.identifyConcurrentGroups(order, depGraph);
    
    logger.info('Dependency analysis completed', requestId, {
      totalFiles: files.length,
      layerCount: groups.length,
      largestLayer: Math.max(...groups.map(g => g.length))
    });
    
    return { order, groups, depGraph };
  }

  /**
   * 建立檔案類型映射
   */
  buildTypeMap(files) {
    const typeMap = {};
    
    files.forEach(file => {
      const type = this.getFileType(file.path);
      if (!typeMap[type]) {
        typeMap[type] = [];
      }
      typeMap[type].push(file.path);
    });
    
    return typeMap;
  }

  /**
   * 分析特殊依賴（如 Python 模組間的 import）
   */
  analyzeSpecialDependencies(files, typeMap) {
    const specialDeps = {};
    
    // Python 模組依賴分析
    if (typeMap['python'] && typeMap['python'].length > 1) {
      const pyFiles = files.filter(f => this.getFileType(f.path) === 'python');
      
      pyFiles.forEach(file => {
        // 檢查是否為基礎模組（如 utils, models, config）
        const fileName = path.basename(file.path, '.py');
        const isBaseModule = ['utils', 'config', 'models', 'constants', 'base', '__init__'].includes(fileName);
        
        if (isBaseModule) {
          // 基礎模組不依賴其他模組
          specialDeps[file.path] = [];
        } else {
          // 應用模組依賴基礎模組
          specialDeps[file.path] = pyFiles
            .filter(f => {
              const fn = path.basename(f.path, '.py');
              return ['utils', 'config', 'models', 'constants', 'base'].includes(fn);
            })
            .map(f => f.path);
        }
      });
    }
    
    return specialDeps;
  }

  /**
   * 建立完整的依賴圖
   */
  buildDependencyGraph(files, typeMap, specialDeps) {
    const graph = {};
    
    files.forEach(file => {
      const filePath = file.path;
      const fileType = this.getFileType(filePath);
      
      // 初始化依賴列表
      graph[filePath] = [];
      
      // 1. 添加類型層級的依賴
      const typeDeps = this.typeDependencies[fileType] || [];
      typeDeps.forEach(depType => {
        if (typeMap[depType]) {
          // 依賴該類型的所有檔案
          graph[filePath].push(...typeMap[depType]);
        }
      });
      
      // 2. 添加特殊依賴（如 Python 模組間依賴）
      if (specialDeps[filePath]) {
        graph[filePath].push(...specialDeps[filePath]);
      }
      
      // 去重
      graph[filePath] = [...new Set(graph[filePath])];
    });
    
    return graph;
  }

  /**
   * 拓撲排序（Kahn's Algorithm）
   */
  topologicalSort(graph, files) {
    // 計算每個節點的入度
    const inDegree = {};
    const filePathSet = new Set(files.map(f => f.path));
    
    files.forEach(f => {
      inDegree[f.path] = 0;
    });
    
    Object.keys(graph).forEach(node => {
      graph[node].forEach(dep => {
        if (filePathSet.has(dep)) {
          inDegree[node]++;
        }
      });
    });
    
    // 找出所有入度為 0 的節點
    const queue = [];
    Object.keys(inDegree).forEach(node => {
      if (inDegree[node] === 0) {
        queue.push(node);
      }
    });
    
    const sorted = [];
    
    while (queue.length > 0) {
      const node = queue.shift();
      sorted.push(node);
      
      // 找出所有依賴當前節點的節點
      Object.keys(graph).forEach(dependent => {
        if (graph[dependent].includes(node)) {
          inDegree[dependent]--;
          if (inDegree[dependent] === 0) {
            queue.push(dependent);
          }
        }
      });
    }
    
    // 檢查是否有循環依賴
    if (sorted.length !== files.length) {
      const missing = files.filter(f => !sorted.includes(f.path));
      logger.warn('Circular dependency detected', null, { 
        missingFiles: missing.map(f => f.path) 
      });
      // 將缺失的檔案添加到末尾
      missing.forEach(f => sorted.push(f.path));
    }
    
    return sorted;
  }

  /**
   * 識別可以併發生成的檔案群組（層級）
   */
  identifyConcurrentGroups(order, graph) {
    const groups = [];
    const processed = new Set();
    
    while (processed.size < order.length) {
      const currentGroup = [];
      
      // 找出所有依賴都已處理的節點
      order.forEach(filePath => {
        if (processed.has(filePath)) return;
        
        const deps = graph[filePath] || [];
        const allDepsProcessed = deps.every(dep => processed.has(dep));
        
        if (allDepsProcessed) {
          currentGroup.push(filePath);
        }
      });
      
      // 將當前群組標記為已處理
      currentGroup.forEach(f => processed.add(f));
      
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
      } else {
        // 如果無法處理任何節點，強制處理剩餘節點（避免死鎖）
        const remaining = order.filter(f => !processed.has(f));
        if (remaining.length > 0) {
          groups.push([remaining[0]]);
          processed.add(remaining[0]);
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
    
    lines.push('\n=== Dependency Graph ===');
    Object.keys(graph).forEach(file => {
      const deps = graph[file];
      if (deps.length > 0) {
        lines.push(`${path.basename(file)} depends on:`);
        deps.forEach(dep => {
          lines.push(`  -> ${path.basename(dep)}`);
        });
      } else {
        lines.push(`${path.basename(file)} (no dependencies)`);
      }
    });
    
    lines.push('\n=== Generation Groups (Layers) ===');
    groups.forEach((group, idx) => {
      lines.push(`Layer ${idx + 1} (${group.length} files, can run in parallel):`);
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
