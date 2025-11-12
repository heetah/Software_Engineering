# Markup Agent

專門處理 HTML/XML/Markdown 等 markup 語言文件的生成。

## 功能

- ✅ HTML5 語義化結構生成
- ✅ 自動添加 meta tags
- ✅ 智能識別頁面功能（導航、表單、圖表等）
- ✅ 自動連結 CSS 和 JS 檔案
- ✅ 支援 XML 和 Markdown
- ✅ Mock 模式（測試用）和 Cloud API 模式

## 支援的檔案類型

- `.html`, `.htm` - HTML 文件
- `.xml` - XML 文件
- `.md` - Markdown 文件

## 安裝

```bash
cd worker-agents/markup-agent
npm install
```

## 啟動

```bash
npm start
# Server will run on port 3801
```

## API 端點

### Health Check

```bash
GET http://localhost:3801/health
```

回應：
```json
{
  "status": "ok",
  "agent": "markup-agent",
  "port": 3801,
  "supportedExtensions": [".html", ".htm", ".xml", ".md"]
}
```

### 生成檔案

```bash
POST http://localhost:3801/generate
Content-Type: application/json

{
  "skeleton": "<!DOCTYPE html>...",
  "fileSpec": {
    "path": "index.html",
    "language": "html",
    "description": "Stock trading dashboard with real-time updates",
    "requirements": [
      "Navigation menu",
      "Data table",
      "Chart canvas",
      "Modal dialog"
    ]
  },
  "context": {
    "completedFiles": [
      { "path": "styles.css", "language": "css" },
      { "path": "app.js", "language": "javascript" }
    ]
  }
}
```

回應：
```json
{
  "success": true,
  "content": "<!DOCTYPE html>\n<html>...",
  "metadata": {
    "agent": "markup-agent",
    "file": "index.html",
    "language": "html",
    "tokens_used": 1500,
    "generation_time_ms": 45,
    "method": "mock-template"
  }
}
```

## 智能功能識別

Generator 會自動從 `description` 和 `requirements` 中識別需要的功能：

- **Navigation**: 關鍵字 `nav`, `menu`, `navigation`
- **Header/Footer**: 關鍵字 `header`, `footer`
- **Form**: 關鍵字 `form`, `input`, `submit`
- **Table**: 關鍵字 `table`, `data`, `grid`
- **Chart**: 關鍵字 `chart`, `graph`, `canvas`
- **Modal**: 關鍵字 `modal`, `dialog`, `popup`

根據識別結果，自動生成對應的 HTML 結構。

## 範例

### 簡單頁面

```javascript
{
  "fileSpec": {
    "path": "about.html",
    "language": "html",
    "description": "About page with company information"
  }
}
```

生成：
- 基本 HTML5 結構
- Header with title
- Main content section
- Footer

### 複雜應用

```javascript
{
  "fileSpec": {
    "path": "dashboard.html",
    "language": "html",
    "description": "Dashboard with navigation, data table, and charts",
    "requirements": [
      "Top navigation bar",
      "Real-time data table",
      "Canvas chart for stock prices",
      "Modal for details"
    ]
  }
}
```

生成：
- Navigation menu
- Header
- Data table with tbody ID
- Canvas element for charts
- Modal structure
- 自動連結相關 CSS/JS

## 與 Coordinator 整合

Markup Agent 被 Coordinator 自動調用：

1. Coordinator 分析依賴關係
2. HTML 檔案在 Layer 1（第一層）
3. Coordinator 呼叫 `POST /generate`
4. 返回完整的 HTML 內容
5. Coordinator 將內容傳遞給後續的 CSS/JS agents

## 配置

### 環境變數

```bash
# Server port
PORT=3801

# Cloud API (可選，未設定則使用 mock)
CLOUD_API_ENDPOINT=https://api.example.com/v1/generate
CLOUD_API_KEY=your-api-key
```

### Mock 模式 vs Cloud API 模式

**Mock 模式（預設）：**
- 使用模板生成
- 不需要外部 API
- 快速測試
- 適合開發階段

**Cloud API 模式：**
- 使用真實 LLM API
- 更智能的內容生成
- 需要 API key
- 適合生產環境

## 開發

### 測試

```bash
# 啟動 server
npm start

# 在另一個終端測試
curl http://localhost:3801/health

# 測試生成
curl -X POST http://localhost:3801/generate \
  -H "Content-Type: application/json" \
  -d '{"fileSpec":{"path":"test.html","language":"html"}}'
```

### 除錯

Server 會輸出詳細日誌：
```
[2025-11-06T07:00:00.000Z] Generating index.html
[Generator] Processing index.html
[Generator] Mode: MOCK
[2025-11-06T07:00:00.045Z] ✅ Generated index.html (45ms)
```

## 架構

```
markup-agent/
├── server.js       # Express server, 處理 HTTP 請求
├── generator.js    # 核心生成邏輯
├── package.json    # 依賴配置
└── README.md       # 本文件
```

## 未來改進

- [ ] 支援更多模板（landing page, blog, e-commerce）
- [ ] 實作真實的 Cloud API 呼叫
- [ ] 添加 HTML 驗證（W3C validator）
- [ ] 支援 i18n（多語言）
- [ ] 響應式設計自動優化
- [ ] SEO 優化建議
- [ ] Accessibility (a11y) 檢查
