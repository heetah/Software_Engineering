# 🎯 專案生成改進總結

## 問題根源分析

在生成 Electron 專案時，發現三個主要的常見錯誤：

### 1. ❌ HTML 檔案路徑錯誤
**問題**：生成的 HTML 中使用了 `public/style.css` 和 `public/script.js`
```html
<!-- ❌ 錯誤 -->
<link rel="stylesheet" href="public/style.css">
<script src="public/script.js"></script>
```

**原因**：當 HTML 檔案本身就在 `public/` 資料夾中時，路徑應該是相對於該資料夾的

**正確做法**：
```html
<!-- ✅ 正確 -->
<link rel="stylesheet" href="style.css">
<script src="script.js"></script>
```

### 2. ❌ ES6 Export 語法錯誤
**問題**：在 `preload.js` 和瀏覽器 `script.js` 中使用了 `export class`
```javascript
// ❌ 錯誤 (preload.js)
export class App {
  // ...
}
```

**原因**：
- `preload.js` 在 Node.js 環境中執行，使用 CommonJS (`require`)，不支援 ES6 modules
- 瀏覽器 `script.js` 如果沒有 `<script type="module">`，也不支援 export

**正確做法**：
```javascript
// ✅ 正確 (preload.js)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  calculate: (expression) => ipcRenderer.invoke('calculate', expression)
});

// ✅ 正確 (script.js - 不使用 export)
class App {
  // ...
}

const app = new App();
```

### 3. ❌ IPC 參數格式不一致
**問題**：main.js 使用物件解構，但 preload.js 傳遞單一參數
```javascript
// ❌ 不一致
// main.js
ipcMain.handle('calculate', async (event, { expression }) => {
  return eval(expression);
});

// preload.js
calculate: (expression) => ipcRenderer.invoke('calculate', expression)
// 傳遞的是 expression，不是 { expression }
```

**正確做法**：參數格式必須一致
```javascript
// ✅ 正確 - 方案 A：使用物件
// main.js
ipcMain.handle('calculate', async (event, { expression }) => {
  return eval(expression);
});

// preload.js
calculate: (expression) => ipcRenderer.invoke('calculate', { expression })

// ✅ 正確 - 方案 B：使用單一參數
// main.js
ipcMain.handle('calculate', async (event, expression) => {
  return eval(expression);
});

// preload.js
calculate: (expression) => ipcRenderer.invoke('calculate', expression)
```

---

## 🔧 修復方案

### 階段一：檢測系統（已完成 ✅）

建立了完整的錯誤檢測系統：

#### `agents/contract-validator.js`
新增了兩個檢測方法：

1. **`validateHtmlPaths(htmlFiles)`** - 檢測 HTML 路徑錯誤
   - 偵測 `public/style.css` 和 `public/script.js` 
   - 當 HTML 檔案本身在 `public/` 資料夾時
   - 返回錯誤列表：`{ file, line, incorrect, correct }`

2. **`validateExportSyntax(files)`** - 檢測 Export 語法錯誤
   - 偵測 `export class`, `export function`, `export const` 等
   - 在 `preload.js` 和瀏覽器腳本中（沒有 `type="module"`）
   - 返回錯誤列表：`{ file, line, context, suggestion }`

#### `agents/contract-auto-fixer.js`
新增了兩個自動修復方法：

1. **`fixHtmlPath(outputDir, pathError)`** - 修復 HTML 路徑
   - 自動將 `public/style.css` 替換為 `style.css`
   - 自動將 `public/script.js` 替換為 `script.js`

2. **`fixExportSyntax(outputDir, exportError)`** - 修復 Export 語法
   - 自動移除 `export class` → `class`
   - 自動移除 `export function` → `function`
   - 自動移除 `export const` → `const`

### 階段二：生成器改進（本次更新 ✅）

修改了生成器的 AI prompts，在生成時就避免這些錯誤：

#### `agents/worker-agents/markup-agent/generator.js`
**新增規則**（第 453-460 行）：
```javascript
// 🔴 檔案路徑規則（針對 Electron 專案）
const isInPublicFolder = filePath.includes('public/') || filePath.includes('public\\');
if (isInPublicFolder) {
  prompt += `🔴 CRITICAL FILE PATH RULES (Electron project - HTML in public/ folder):\n`;
  prompt += `1. For CSS files: <link rel="stylesheet" href="style.css">  ← Use RELATIVE path, NOT "public/style.css"\n`;
  prompt += `2. For JS files: <script src="script.js"></script>  ← Use RELATIVE path, NOT "public/script.js"\n`;
  prompt += `3. The HTML file is ALREADY in the public/ folder, so paths are relative to IT\n`;
  prompt += `4. ❌ FORBIDDEN: href="public/style.css" or src="public/script.js"\n`;
  prompt += `5. ✅ CORRECT: href="style.css" and src="script.js"\n\n`;
}
```

#### `agents/worker-agents/script-agent/generator.js`
**新增規則一**（第 473-481 行）：Preload.js 規則
```javascript
// 針對 Electron preload.js 的特殊規則
if (filePath.includes('preload.js') || filePath.endsWith('preload.js')) {
  prompt += `⛔ ELECTRON PRELOAD SCRIPT RULES (you are generating preload.js):\n`;
  prompt += `1. ❌ FORBIDDEN: export class, export function, export const, export default\n`;
  prompt += `2. ❌ FORBIDDEN: import statements (this is a Node.js context, not ES6 modules)\n`;
  prompt += `3. ✅ REQUIRED: Use const { contextBridge, ipcRenderer } = require('electron')\n`;
  prompt += `4. ✅ REQUIRED: Use contextBridge.exposeInMainWorld() to expose APIs\n`;
  prompt += `5. Pattern: contextBridge.exposeInMainWorld('electronAPI', { methodName: (...args) => ipcRenderer.invoke('channel', ...args) })\n`;
  prompt += `6. This file runs in Node.js context with access to require(), NOT browser ES6 modules\n\n`;
}
```

**新增規則二**（第 495-502 行）：Renderer 腳本規則
```javascript
// 針對 renderer script 的規則
if (filePath.includes('public/') || filePath.includes('renderer') || filePath.includes('script.js')) {
  prompt += `⛔ RENDERER PROCESS RULES (you are generating frontend JavaScript):\n`;
  prompt += `1. ❌ FORBIDDEN: export class, export function, export const (unless HTML has <script type="module">)\n`;
  prompt += `2. ✅ REQUIRED: Use window.electronAPI (exposed by preload.js) for IPC calls\n`;
  prompt += `3. ✅ REQUIRED: Match DOM IDs EXACTLY with index.html - if HTML has id="taskInput", use getElementById('taskInput')\n`;
  prompt += `4. ALWAYS implement FULL function bodies with real logic\n`;
  prompt += `5. For browser scripts without type="module", use plain functions and classes WITHOUT export keyword\n\n`;
}
```

**新增規則三**（第 338-348 行）：IPC 參數格式規則
```javascript
// 🔴 參數格式一致性規則
prompt += `🔴 CRITICAL IPC PARAMETER FORMAT RULES:\n`;
prompt += `1. If main.js handler uses object destructuring: ipcMain.handle('channel', async (event, { param1, param2 }) => ...)\n`;
prompt += `   Then preload.js MUST pass object: ipcRenderer.invoke('channel', { param1, param2 })\n`;
prompt += `   And renderer MUST call: window.electronAPI.method({ param1, param2 })\n\n`;
prompt += `2. If main.js handler uses multiple parameters: ipcMain.handle('channel', async (event, param1, param2) => ...)\n`;
prompt += `   Then preload.js MUST pass separately: ipcRenderer.invoke('channel', param1, param2)\n`;
prompt += `   And renderer MUST call: window.electronAPI.method(param1, param2)\n\n`;
prompt += `3. MATCH the parameter style EXACTLY - check the contract requestSchema format!\n`;
prompt += `4. If requestSchema shows: { properties: { param1, param2 } } → Use OBJECT format: { param1, param2 }\n`;
prompt += `5. If requestSchema shows multiple required params → Use SEPARATE parameters: param1, param2\n\n`;
```

---

## 🎯 防止問題的完整流程

現在系統有**兩層防護**：

### 第一層：生成時預防（Generation）
- **Markup Agent** 明確指示：使用相對路徑，不要 `public/` 前綴
- **Script Agent** 明確指示：
  - preload.js 不使用 export，使用 require + contextBridge
  - script.js 不使用 export（除非有 type="module"）
  - IPC 參數格式必須一致（物件 vs 多參數）

### 第二層：事後檢測修復（Validation & Auto-Fix）
如果 AI 仍然生成錯誤：
1. **ContractValidator** 自動檢測所有問題
2. **ContractAutoFixer** 自動修復常見問題
3. **ContractRepairAgent** 使用 AI 修復複雜問題

---

## 🧪 測試驗證

### 已測試專案：
- ✅ `df7ba393-44f0-4662-98d8-16ce3286f499` - 手動修復成功
- ✅ `adf2409c-82c3-4bf2-915e-a779f532cfd8` - 手動修復成功

### 下一步測試：
- 🔄 生成新的計算器專案，驗證 AI 是否不再犯這些錯誤
- 🔄 如果仍有錯誤，驗證自動修復流程是否能完全修復

---

## 📊 修改文件清單

| 檔案 | 修改內容 | 狀態 |
|------|---------|------|
| `agents/contract-validator.js` | 新增 `validateHtmlPaths()` 和 `validateExportSyntax()` | ✅ 已完成 |
| `agents/contract-auto-fixer.js` | 新增 `fixHtmlPath()` 和 `fixExportSyntax()` | ✅ 已完成 |
| `agents/worker-agents/markup-agent/generator.js` | 新增 HTML 路徑規則（第 453-460 行） | ✅ 本次更新 |
| `agents/worker-agents/script-agent/generator.js` | 新增 preload.js 規則（第 473-481 行） | ✅ 本次更新 |
| `agents/worker-agents/script-agent/generator.js` | 新增 renderer 規則（第 495-502 行） | ✅ 本次更新 |
| `agents/worker-agents/script-agent/generator.js` | 新增 IPC 參數規則（第 338-348 行） | ✅ 本次更新 |

---

## 🎓 學到的教訓

1. **明確指示勝過模糊提示**
   - 之前只說 "Include proper <link> and <script> tags"
   - 現在明確說 "Use `href="style.css"`, NOT `href="public/style.css"`"

2. **針對文件類型給予專門規則**
   - preload.js 有特殊的 Node.js + Electron 環境
   - 需要單獨的規則和示例

3. **參數格式必須在 contract 中定義清楚**
   - requestSchema 應該明確指出是物件還是多參數
   - 所有文件（main.js, preload.js, script.js）必須遵守相同格式

4. **多層防護比單一防護更可靠**
   - 生成器改進（預防）
   - 檢測系統（發現）
   - 自動修復（補救）

---

## 📝 使用指南

### 檢測現有專案的問題：
```bash
node -e "import('./agents/contract-validator.js').then(m => m.default.validateSession('your-session-id').then(console.log))"
```

### 自動修復問題：
```bash
node -e "import('./agents/contract-auto-fixer.js').then(m => { const fixer = new m.default(); import('./agents/contract-validator.js').then(v => v.default.validateSession('your-session-id').then(result => fixer.autoFix('your-session-id', result).then(console.log))) })"
```

### 演示完整流程：
```bash
node test-auto-fix-demo.js your-session-id
```

---

## 🆕 第二次更新 (2025-12-15)

### 新發現的問題
在測試專案 `46cf1167` 後發現了兩個新問題：

#### 4. ❌ main.js 路徑錯誤
**問題**：使用了多餘的 `..` 導致找不到檔案
```javascript
// ❌ 錯誤
this.mainWindow.loadFile(path.join(__dirname, '..', 'public', 'index.html'));
```

**原因**：專案結構中 `public/` 資料夾與 `main.js` 在同一層，不是上一層

**正確做法**：
```javascript
// ✅ 正確
this.mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));
```

#### 5. ❌ 計算器邏輯錯誤
**問題**：按下運算符後設置 `waitingForNewNumber = true`，導致下一個數字替換整個顯示
```javascript
// ❌ 錯誤邏輯
handleOperatorInput(operator) {
  this.displayElement.value += operator;
  this.waitingForNewNumber = true;  // ← 這會導致下一個數字替換顯示
}
```

**結果**：輸入 `5 + 3` 時，顯示變成 `3` 而不是 `5+3`

**正確做法**：
```javascript
// ✅ 正確
handleOperatorInput(operator) {
  this.displayElement.value += operator;
  // 不設置 waitingForNewNumber，讓數字繼續附加
}

calculateExpression() {
  // 計算完成後才設置
  this.displayElement.value = result;
  this.waitingForNewNumber = true;  // ← 只在這裡設置
}
```

### 新增的驗證方法

#### `contract-validator.js` 新增：
1. **`validateMainJsPaths(files)`** - 檢測 main.js 中的路徑錯誤
   - 偵測 `path.join(__dirname, '..', 'public', ...)`
   - 返回錯誤：`{ type, file, line, incorrect, correct }`

2. **`validatePreloadIpcParameters(files)`** - 檢測 preload.js IPC 參數格式
   - 比對 main.js 的 `ipcMain.handle` 參數
   - 比對 preload.js 的方法簽名和 `ipcRenderer.invoke` 調用
   - 檢測物件解構不一致

#### `contract-auto-fixer.js` 新增：
1. **`fixMainJsPath(outputDir, pathError)`** - 自動修復 main.js 路徑
   - 移除多餘的 `'..'`

2. **`fixPreloadIpcParameter(outputDir, ipcError)`** - 自動修復 preload.js 參數
   - 修復方法簽名：`(param)` → `({ param })`
   - 修復 invoke 調用：`invoke('ch', param)` → `invoke('ch', { param })`

### 強化的生成器規則

#### `script-agent/generator.js` 更新：

**preload.js 規則**（第 487-495 行）：
```javascript
5. 🔴 CRITICAL IPC PARAMETER FORMAT:
   - If main.js uses: ipcMain.handle('channel', async (event, { param1, param2 }) => ...)
   - Then preload.js MUST use: methodName: async ({ param1, param2 }) => ipcRenderer.invoke('channel', { param1, param2 })
   - Example: calculate: async ({ expression }) => ipcRenderer.invoke('calculate', { expression })
6. 🔴 MATCH the parameter destructuring EXACTLY between main.js handler and preload.js method
```

**main.js 規則**（第 504-509 行）：
```javascript
6. 🔴 CRITICAL FILE PATH: Use path.join(__dirname, 'public', 'index.html')
   - ❌ WRONG: path.join(__dirname, '..', 'public', 'index.html')
   - ✅ CORRECT: path.join(__dirname, 'public', 'index.html')
   - The public/ folder is at the SAME level as main.js, NOT one level up
```

**renderer script 規則**（第 518-524 行）：
```javascript
6. 🔴 CALCULATOR LOGIC (if building a calculator):
   - Use waitingForNewNumber flag ONLY after pressing equals (=), NOT after operators
   - When operator (+,-,*,/) is pressed: APPEND to display, don't reset
   - When equals (=) is pressed: calculate result, then set waitingForNewNumber = true
   - When number is pressed after equals: START NEW expression (replace display)
   - Example flow: 5 → 5, + → 5+, 3 → 5+3, = → 8 (waitingForNewNumber=true), 2 → 2 (new expression)
```

### 修復狀態總結

| 問題類型 | 檢測 | 自動修復 | 生成器預防 | 狀態 |
|---------|------|----------|-----------|------|
| HTML 路徑錯誤 | ✅ | ✅ | ✅ | 完成 |
| Export 語法錯誤 | ✅ | ✅ | ✅ | 完成 |
| IPC 參數不一致 | ✅ | ✅ | ✅ | 完成 |
| main.js 路徑錯誤 | ✅ | ✅ | ✅ | 完成 |
| 計算器邏輯錯誤 | ❌ | ❌ | ✅ | 僅預防 |

**註**：計算器邏輯錯誤太複雜，無法通用檢測和自動修復，但已在生成器中添加明確的規則來預防。

---

---

## 🆕 第三次更新 (2025-12-15 - CSS 選擇器修復)

### 新發現的問題

#### 6. ❌ CSS 選擇器與 HTML 不匹配
**問題**：CSS 使用了 `.calculator-grid` 類別，但 HTML 使用的是 `#calculator-container` ID
```css
/* ❌ CSS 中的錯誤 */
.calculator-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
}
```

```html
<!-- HTML 中實際使用的是 -->
<main id="calculator-container">
    <div id="calculator-buttons">
```

**結果**：按鈕排版變成一直線，因為沒有應用 grid 布局

**原因**：Style Agent 生成 CSS 時，沒有檢查 HTML 實際使用的選擇器

### 解決方案

#### `style-agent/generator.js` 更新（第 122-170 行）：

**新增功能**：從 HTML 骨架和已完成文件中提取實際使用的 ID 和 class

```javascript
// 🔥 CRITICAL: 檢查已完成的 HTML 和骨架中的 HTML
const allHtmlFiles = (allFiles || []).filter(f => 
  f.path && (f.path.endsWith('.html') || f.path.endsWith('.htm'))
);

// 從 allSkeletons 中獲取 HTML 骨架內容
const allSkeletons = context.allSkeletons || {};
const htmlSkeletons = allHtmlFiles
  .map(f => ({ path: f.path, content: allSkeletons[f.path] || skeleton }))
  .filter(s => s.content);

// 合併已完成的 HTML 和骨架中的 HTML
const allHtmlSources = [...htmlFiles, ...htmlSkeletons];
```

**提取所有 ID 和 class**：
```javascript
// 提取所有 id="..."
const idMatches = content.matchAll(/id=["']([^"']+)["']/g);
for (const match of idMatches) {
  allIds.add(match[1]);
}

// 提取所有 class="..."
const classMatches = content.matchAll(/class=["']([^"']+)["']/g);
for (const match of classMatches) {
  match[1].split(/\s+/).forEach(cls => {
    if (cls.trim()) allClasses.add(cls.trim());
  });
}
```

**生成明確的 prompt**：
```
IDs found in HTML (MUST style these with #id selector):
  - #calculator-container
  - #calculator-buttons
  - #display
  ...

Classes found in HTML (MUST style these with .class selector):
  - .button
  - .modal-content
  ...

🚨 CRITICAL RULES:
1. Every ID and class listed above MUST have CSS rules
2. Use EXACT selectors: #id for IDs, .class for classes
3. DO NOT invent selectors that don't exist in HTML
4. DO NOT use wrong selector type (e.g., .id instead of #id)
5. If HTML has #calculator-container, use #calculator-container NOT .calculator-grid
```

### 為什麼這樣解決

**問題根源**：CSS 可能在 HTML 之前或同時生成（依賴排序），導致看不到 HTML 的實際內容

**解決方式**：
1. **檢查已完成的文件** - 如果 HTML 已經生成，直接讀取
2. **檢查 HTML 骨架** - 如果 HTML 還沒完成，從骨架中提取選擇器
3. **明確列出所有選擇器** - 讓 AI 清楚知道必須使用哪些選擇器
4. **禁止發明選擇器** - 避免使用不存在於 HTML 的選擇器

### 修復狀態總結

| 問題類型 | 檢測 | 自動修復 | 生成器預防 | 狀態 |
|---------|------|----------|-----------|------|
| HTML 路徑錯誤 | ✅ | ✅ | ✅ | 完成 |
| Export 語法錯誤 | ✅ | ✅ | ✅ | 完成 |
| IPC 參數不一致 | ✅ | ✅ | ✅ | 完成 |
| main.js 路徑錯誤 | ✅ | ✅ | ✅ | 完成 |
| 計算器邏輯錯誤 | ❌ | ❌ | ✅ | 僅預防 |
| CSS 選擇器不匹配 | ❌ | ⚠️ | ✅ | 已預防 |

**註**：
- 計算器邏輯錯誤：太複雜，無法通用檢測和自動修復，但已在生成器中添加規則預防
- CSS 選擇器不匹配：可以手動修復，但檢測較複雜（需要比對 HTML 和 CSS），已在生成器中添加強制規則預防

---

**更新時間**：2025-12-15
**版本**：v2.2 - CSS Selector Fix
**狀態**：✅ 已部署
