import BaseAgent from "./agent-base.js";
import dotenv from "dotenv";

dotenv.config();

/**
 * 將 Coder 任務分割為多個階段，避免單次生成過多檔案導致超時/拒絕
 */
export default class CoderAgent extends BaseAgent {
  constructor() {
    // 使用 OpenAI API（從環境變數讀取）
    super("Coder Agent", "Markdown code", "coder", {
      baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      apiKey: process.env.OPENAI_API_KEY
    });
    this.temperature = 0.2;
  }

  async generateProject(architectureOutput) {
    const parts = [
      {
        name: "專案基礎結構",
        prompt: `# 生成專案基礎結構檔案

根據以下架構規格，生成以下核心檔案：package.json, .gitignore, .env.example

## 架構規格
${architectureOutput}

## 輸出格式要求

必須使用以下格式輸出每個檔案（這是必填的），**確保每個檔案內容完整**：

<!-- file: package.json -->
\`\`\`json
{
  "name": "專案名稱",
  "version": "1.0.0",
  "dependencies": {},
  "scripts": {}
}
\`\`\`

<!-- file: .gitignore -->
\`\`\`
node_modules/
.env
\`\`\`

<!-- file: .env.example -->
\`\`\`
API_URL=http://localhost:3000
\`\`\`

## 重要提示
- **每個檔案都必須完整，包含所有必要的欄位和內容**
- 每個檔案都必須用 <!-- file: 路徑 --> 標記
- 必須緊接三引號程式碼區塊
- **只生成這 3 個檔案：package.json, .gitignore, .env.example（不要生成 README.md）**
- **確保 package.json 包含完整的 dependencies、devDependencies 和 scripts**`
      },
      {
        name: "核心應用邏輯",
        prompt: `# 生成核心應用邏輯檔案

根據以下架構規格，生成核心應用程式檔案（入口點、路由、控制器、模型等）

## 架構規格
${architectureOutput}

## 輸出格式要求

必須使用以下格式輸出每個檔案，**確保每個檔案代碼完整且可執行**：

<!-- file: src/index.js -->
\`\`\`javascript
// 應用程式入口點 - 必須包含完整的初始化邏輯
const express = require('express');
const app = express();
// ... 完整的代碼
\`\`\`

<!-- file: src/routes/api.js -->
\`\`\`javascript
// API 路由 - 必須包含完整的路由定義和錯誤處理
const express = require('express');
const router = express.Router();
// ... 完整的代碼
module.exports = router;
\`\`\`

## 重要提示
- **生成 5-8 個核心應用程式檔案，每個檔案必須完整**
- **每個函數、類別、模組都必須有完整的實現，不要只有註解或 TODO**
- **必須包含必要的 import/require 語句**
- **必須包含錯誤處理和邊界情況處理**
- 聚焦於主要業務邏輯
- 每個檔案都必須用 <!-- file: 路徑 --> 標記
- 必須緊接三引號程式碼區塊
- **如果代碼被截斷，將無法解析，請確保每個檔案都完整**`
      },
      {
        name: "前端介面",
        prompt: `# 生成前端介面檔案

根據以下架構規格，生成前端檔案（HTML 模板、CSS 樣式、客戶端 JavaScript）

## 架構規格
${architectureOutput}

## 輸出格式要求

必須使用以下格式輸出每個檔案，**確保每個檔案完整且功能完整**：

<!-- file: public/index.html -->
\`\`\`html
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>標題</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <!-- 完整的 HTML 結構 -->
</body>
<script src="app.js"></script>
</html>
\`\`\`

<!-- file: public/styles.css -->
\`\`\`css
/* 完整的 CSS 樣式，包含所有必要的樣式定義 */
body {
  margin: 0;
  padding: 0;
}
\`\`\`

<!-- file: public/app.js -->
\`\`\`javascript
// 完整的 JavaScript 邏輯，包含事件處理和功能實現
// ... 完整的代碼
\`\`\`

## 重要提示
- **生成 4-6 個前端檔案，每個檔案必須完整**
- **HTML 必須包含完整的結構、必要的 meta 標籤和 script 引用**
- **CSS 必須包含所有必要的樣式定義**
- **JavaScript 必須包含完整的功能實現，不要只有註解**
- 包含 HTML、CSS、JavaScript
- 每個檔案都必須用 <!-- file: 路徑 --> 標記
- 必須緊接三引號程式碼區塊
- **確保檔案之間的引用關係正確**`
      },
      {
        name: "配置與部署",
        prompt: `# 生成配置與部署檔案

根據以下架構規格，生成配置檔案（資料庫 schema、建置設定、部署設定）

## 架構規格
${architectureOutput}

## 輸出格式要求

必須使用以下格式輸出每個檔案，**確保每個檔案配置完整**：

<!-- file: config/database.js -->
\`\`\`javascript
// 完整的資料庫配置，包含連接字串、選項等
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  // ... 完整的配置
};
module.exports = dbConfig;
\`\`\`

<!-- file: Dockerfile -->
\`\`\`
# 完整的 Dockerfile，包含所有必要的階段
FROM node:18
WORKDIR /app
# ... 完整的 Dockerfile
\`\`\`

<!-- file: docker-compose.yml -->
\`\`\`yaml
# 完整的 docker-compose 配置
version: '3.8'
services:
  # ... 完整的服務配置
\`\`\`

## 重要提示
- **生成配置和部署檔案，每個檔案必須完整**
- **配置檔案必須包含所有必要的設置和環境變數**
- **Dockerfile 和 docker-compose.yml 必須完整且可執行**
- 每個檔案都必須用 <!-- file: 路徑 --> 標記
- 必須緊接三引號程式碼區塊
- **確保所有配置檔案都包含完整的實作，不要只有註解**`
      }
    ];

    const allFiles = [];
    let sessionProgress = "";

    for (const part of parts) {
      console.log(`\n  生成階段: ${part.name}`);
      try {
        const output = await this.run(part.prompt);
        sessionProgress += `\n## ${part.name}\n\n${output}\n\n`;
        allFiles.push(output);
      } catch (e) {
        console.warn(`  階段失敗，跳過: ${part.name}`);
        console.error(`  錯誤詳情:`, e.response?.data || e.message);
      }
    }

    return allFiles.join("\n\n");
  }
}

