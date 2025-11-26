# API 標準規範

## 🎯 目的
避免前後端端口不一致、CORS 問題等常見錯誤。

---

## 📊 開發場景對比

| 場景 | 前端端口 | 後端端口 | 是否分離 |
|------|---------|---------|---------|
| 🔧 開發環境 | 3000 | 5000 | ✅ 通常分離 |
| 🚀 生產環境 | 80/443 | 80/443 | ❌ 通常合併 |
| 📦 簡單項目 | 5000 | 5000 | ❌ 不分離 |

---

## ✅ 推薦方案（按複雜度排序）

### 方案 1：一體部署（簡單項目）⭐ 最簡單

**適用場景**：
- 純 HTML/CSS/JS 項目（不用 React/Vue）
- 學習項目、Demo、原型
- 不需要熱重載

**實現方式**：
```javascript
// 前端：app.js
const API_BASE_URL = '/api';  // 相對路徑

// 後端：server.py (Flask)
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory('.', filename)
```

**優點**：
- ✅ 無需配置
- ✅ 無 CORS 問題
- ✅ 部署簡單

**缺點**：
- ❌ 無熱重載
- ❌ 不適合大型項目

---

### 方案 2：運行時配置檔（中等項目）⭐⭐ 推薦

**適用場景**：
- 純 HTML/CSS/JS 項目
- 需要在不同環境部署
- 不想用構建工具

**實現方式**：
```javascript
// config.js（部署時修改這個文件）
window.APP_CONFIG = {
  API_BASE_URL: '/api',  // 開發時改成 'http://localhost:5000/api'
  ENVIRONMENT: 'production'
};

// app.js（業務邏輯，永遠不需要修改）
const API_BASE_URL = window.APP_CONFIG.API_BASE_URL;
```

**優點**：
- ✅ 代碼不需要改
- ✅ 部署時只改一個文件
- ✅ 支援開發/生產分離

**缺點**：
- ⚠️ 需要記得修改 config.js

---

### 方案 3：代理模式（現代前端框架）⭐⭐⭐ 業界標準

**適用場景**：
- React、Vue、Vite、Next.js 項目
- 團隊開發
- 需要熱重載

**實現方式**：
```javascript
// 前端代碼（永遠用相對路徑）
const API_BASE_URL = '/api';

// vite.config.js（開發環境配置）
export default {
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  }
};
```

**執行流程**：
```
開發環境：
  瀏覽器 → http://localhost:3000/api/expenses
  ↓ (Vite 代理)
  後端 ← http://localhost:5000/api/expenses

生產環境：
  瀏覽器 → https://yourapp.com/api/expenses
  ↓ (無代理)
  後端 ← https://yourapp.com/api/expenses
```

**優點**：
- ✅ 開發生產代碼一致
- ✅ 支援熱重載
- ✅ 業界標準做法

**缺點**：
- ⚠️ 需要構建工具
- ⚠️ 配置稍複雜

---

## ❌ 禁止的做法

### 🚫 硬編碼絕對路徑
```javascript
// ❌ 絕對禁止
const API_BASE_URL = 'http://localhost:5000/api';
```

**問題**：
1. 無法部署到生產環境
2. 團隊成員端口不同會出錯
3. 安全性問題（暴露內部端口）

---

## 📋 選擇指南

```
你的項目是？
│
├─ 純 HTML/JS（無構建工具）
│  │
│  ├─ 簡單 Demo/學習 → 方案 1：一體部署
│  └─ 需要多環境部署 → 方案 2：運行時配置檔
│
└─ React/Vue/Vite 框架
   └─ → 方案 3：代理模式（業界標準）
```

---

## 🎓 針對你的 AI 代碼生成器

### 建議策略：

**預設使用方案 2（運行時配置檔）**：

```json
{
  "files": [
    {
      "path": "config.js",
      "content": "window.APP_CONFIG = { API_BASE_URL: '/api' };"
    },
    {
      "path": "app.js",
      "content": "const API_BASE_URL = window.APP_CONFIG.API_BASE_URL;"
    }
  ]
}
```

**原因**：
- ✅ 支援開發/生產分離
- ✅ 無需構建工具
- ✅ 部署時只改一個文件
- ✅ 適合教學和 Demo

**使用說明（加到 README）**：
```markdown
## 開發模式
1. 修改 config.js：
   API_BASE_URL: 'http://localhost:5000/api'
2. 分別啟動前後端

## 生產模式
1. 修改 config.js：
   API_BASE_URL: '/api'
2. 後端提供靜態文件
```

---

## 📝 更新後的檢查清單

生成代碼時必須確保：

- [ ] 使用 `config.js` 配置檔
- [ ] `app.js` 從 `window.APP_CONFIG` 讀取 API URL
- [ ] 後端提供靜態文件路由
- [ ] README 說明如何切換開發/生產模式
- [ ] 預設配置為生產模式（`API_BASE_URL: '/api'`）
- [ ] 絕不硬編碼絕對路徑

---

**Flask 範例：**
```python
from flask import Flask, send_from_directory
import os

app = Flask(__name__)

# API 路由
@app.route('/api/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE'])
def api_routes(path):
    # API 邏輯
    pass

# 靜態文件路由（必須）
@app.route('/')
def index():
    return send_from_directory(os.path.dirname(__file__), 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory(os.path.dirname(__file__), filename)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
```

**Node.js/Express 範例：**
```javascript
const express = require('express');
const path = require('path');
const app = express();

// API 路由
app.use('/api', apiRouter);

// 靜態文件服務（必須）
app.use(express.static(__dirname));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(3000);
```

### 規則 2：前端 API URL 必須使用相對路徑

**JavaScript 範例：**
```javascript
// ✅ 正確：使用相對路徑
const API_BASE_URL = '/api';

// ❌ 錯誤：硬編碼端口
const API_BASE_URL = 'http://localhost:5000/api';
const API_BASE_URL = 'http://localhost:3000/api';
```

### 規則 3：所有文件在同一目錄

```
project/
├── index.html       # 前端
├── app.js          # 前端邏輯
├── styles.css      # 樣式
├── server.py       # 後端（Flask）
└── server.js       # 或後端（Node.js）
```

### 規則 4：不需要 CORS

因為前後端在同一個端口，所以：
- ❌ 不需要 `flask-cors`
- ❌ 不需要 `cors` npm package
- ❌ 不需要配置 CORS headers

---

## 📝 Payload 範本

```json
{
  "output": {
    "coder_instructions": {
      "projectConfig": {
        "deploymentMode": "unified",
        "backend": {
          "port": 5000,
          "mustServeStaticFiles": true,
          "staticFilesPath": "."
        },
        "frontend": {
          "apiBaseUrl": "/api",
          "note": "前端與後端在同一端口，使用相對路徑"
        }
      }
    }
  }
}
```

---

## 🚀 使用方式

### 啟動（單一命令）
```bash
# Flask
python server.py

# Node.js
node server.js
```

### 訪問（單一端口）
```
http://localhost:5000
```

---

## 🔍 檢查清單

生成代碼時必須確保：

- [ ] 後端有 `/` 路由返回 `index.html`
- [ ] 後端有靜態文件路由（`/<path:filename>`）
- [ ] 前端 `API_BASE_URL = '/api'`（相對路徑）
- [ ] 所有文件在同一目錄
- [ ] README 說明單一啟動命令
- [ ] 不使用 CORS 相關套件

---

## ❌ 禁止的寫法

```javascript
// ❌ 禁止：硬編碼端口
const API_BASE_URL = 'http://localhost:5000/api';

// ❌ 禁止：環境變量（瀏覽器不支援）
const API_BASE_URL = process.env.REACT_APP_API_URL;

// ❌ 禁止：分離部署
前端：http://localhost:3000
後端：http://localhost:5000
```

---

## ✅ 唯一允許的寫法

```javascript
// ✅ 唯一標準寫法
const API_BASE_URL = '/api';
```

```python
# ✅ 後端必須提供靜態文件
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')
```
