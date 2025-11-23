# 依賴分析修復報告

## 問題識別

### 1. ❌ HTML 文件依賴未被分析
**問題**: `dependency-analyzer.js` 的 `buildGraphFromSkeletons` 方法完全跳過 HTML 文件，導致關鍵的腳本加載順序依賴沒有被建立。

**影響**:
- `index.html` 中的 `<script src="config.js">` 和 `<script src="app.js">` 順序依賴未被識別
- 生成順序可能錯誤，導致 `app.js` 在 `config.js` 之前生成
- 無法保證 HTML 在其引用的 CSS/JS 文件之後生成

**修復**:
```javascript
// 新增 HTML Regex
const HTML_SCRIPT_REGEX = /<script[^>]+src=["']([^"']+)["']/g;
const HTML_LINK_REGEX = /<link[^>]+href=["']([^"']+)["'][^>]*(?:rel=["']stylesheet["']|type=["']text\/css["'])/g;

// 在 switch 中添加 HTML 處理
case 'html':
  regexes = [HTML_SCRIPT_REGEX, HTML_LINK_REGEX];
  break;
```

### 2. ❌ 拓撲排序入度計算錯誤
**問題**: 第 253-261 行的入度計算邏輯完全反了。

**原始錯誤代碼**:
```javascript
Object.keys(graph).forEach(node => {
  graph[node].forEach(dep => {
    if (filePathSet.has(dep)) {
      inDegree[node]++;  // ❌ 錯誤！
    }
  });
});
```

**問題分析**:
- 如果依賴圖表示為 `graph[A] = [B]` （A 依賴 B）
- 那麼在拓撲排序中，**B 必須先生成**
- 因此應該增加 **B 的入度**，而不是 A 的入度
- 入度為 0 的節點表示「沒有其他節點依賴它」，應該最先生成

**正確邏輯**:
```javascript
Object.keys(graph).forEach(node => {
  graph[node].forEach(dep => {
    if (filePathSet.has(dep)) {
      inDegree[dep]++;  // ✅ B 被依賴，所以 B 的入度增加
    }
  });
});
```

**實際影響**:
- 原始代碼會導致生成順序完全錯誤
- 被依賴的文件（如 `config.js`）反而會被安排在最後生成
- 依賴其他文件的文件（如 `app.js`）會被錯誤地優先生成

### 3. ❌ HTML 路徑解析缺失
**問題**: `_resolveImportPath` 方法沒有處理 HTML 文件類型。

**修復**:
```javascript
if (fileType === 'html') {
  let resolvedPath;
  
  if (importPath.startsWith('./') || importPath.startsWith('../')) {
    resolvedPath = path.resolve(currentDir, importPath);
  } else {
    // 相對於當前目錄（例如 src="config.js"）
    resolvedPath = path.resolve(currentDir, importPath);
  }
  
  if (allFilePaths.includes(resolvedPath)) {
    return resolvedPath;
  }
  
  return null;
}
```

### 4. ❌ Regex 執行方式不支持多個正則表達式
**問題**: 原始代碼只能使用單個 `regex` 變量，但 HTML 需要同時使用 `HTML_SCRIPT_REGEX` 和 `HTML_LINK_REGEX`。

**修復**:
```javascript
// 改為數組
let regexes = [];

// 遍歷所有適用的 Regex
for (const regex of regexes) {
  let match;
  while ((match = regex.exec(content)) !== null) {
    const importPath = match[1] || match[2];
    if (importPath) matches.push(importPath);
  }
}
```

## 修復後的預期效果

### 正確的生成順序示例（Expense Tracker 項目）

#### 修復前（錯誤）:
```
Layer 1: index.html, app.js, styles.css, server.py, config.js
```
❌ 所有文件並行生成，忽略依賴關係

#### 修復後（正確）:
```
Layer 1: config.js, styles.css
Layer 2: app.js
Layer 3: index.html
Layer 4: server.py
```
✅ 依賴鏈正確：
- `config.js` 先生成（無依賴）
- `app.js` 在 `config.js` 後生成（依賴 `config.js` 通過 `window.APP_CONFIG`）
- `index.html` 在 `config.js` 和 `app.js` 後生成（引用這兩個文件）
- `server.py` 最後生成（需要所有前端文件存在）

### 依賴圖可視化

修復後，`visualizeDependencies` 方法會正確顯示：

```
=== Dependency Graph ===
app.js depends on:
  -> config.js
index.html depends on:
  -> config.js
  -> app.js
  -> styles.css
server.py (no dependencies detected in skeleton)

=== Generation Groups (Layers) ===
Layer 1 (2 files, can run in parallel):
  - config.js
  - styles.css
Layer 2 (1 file):
  - app.js
Layer 3 (1 file):
  - index.html
Layer 4 (1 file):
  - server.py
```

## 測試建議

### 1. 測試 HTML 依賴解析
創建包含以下內容的骨架測試：

**index.html skeleton**:
```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="styles.css">
  <script src="config.js"></script>
  <script src="app.js"></script>
</head>
</html>
```

**預期結果**:
- `depGraph['index.html']` 應包含 `['config.js', 'app.js', 'styles.css']`

### 2. 測試拓撲排序正確性
檢查生成順序是否符合以下規則：
- 被依賴的文件先生成
- 依賴其他文件的文件後生成
- 無循環依賴的情況下，所有文件都能被正確排序

### 3. 測試並行生成群組
驗證同一層級的文件確實沒有相互依賴，可以安全並行生成。

## 相關文件

- `coder-agent/dependency-analyzer.js` - 依賴分析主邏輯
- `coder-agent/coordinator.js` - 調用依賴分析器的協調器
- `docs/AUTO_FIX_STRATEGY.md` - 自動修復策略（Phase 1 已實施）
- `shared/generation-defaults.js` - 生成默認規範

## 後續優化建議

### 1. 添加 Python Flask 對前端的依賴檢測
當 `server.py` 包含 `send_from_directory` 或 `static_folder` 時，自動添加對所有 `.html`, `.js`, `.css` 文件的依賴。

### 2. 支持 CSS 中的 `@import` 語句
```javascript
const CSS_IMPORT_REGEX = /@import\s+["']([^"']+)["']/g;
```

### 3. 改進路徑解析
- 支持絕對路徑（從項目根目錄解析）
- 支持路徑別名（例如 `@/components` -> `src/components`）

### 4. 添加依賴驗證
在生成前驗證依賴圖的完整性：
- 檢測循環依賴並報告
- 檢測缺失的依賴並警告
- 提供依賴圖可視化工具

## 總結

此次修復解決了 4 個關鍵問題：

1. ✅ HTML 文件依賴現在會被正確分析
2. ✅ 拓撲排序入度計算邏輯已修正
3. ✅ HTML 路徑解析已實現
4. ✅ 支持多個 Regex 同時使用

這些修復確保了代碼生成順序的正確性，避免了以下常見問題：
- `app.js` 在 `config.js` 之前生成導致 `window.APP_CONFIG` 未定義
- `index.html` 在引用的 JS/CSS 文件之前生成導致 404 錯誤
- 文件生成順序隨機導致不可預測的錯誤
