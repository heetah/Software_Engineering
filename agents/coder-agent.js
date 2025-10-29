import BaseAgent from "./agent-base.js";

/**
 * 將 Coder 任務分割為多個階段，避免單次生成過多檔案導致超時/拒絕
 */
export default class CoderAgent extends BaseAgent {
  constructor() {
    super("Coder Agent", "Markdown code", "coder");
    this.temperature = 0.2;
    this.maxTokens = 8000; // 限制輸出長度
  }

  async generateProject(architectureOutput) {
    const parts = [
      {
        name: "專案基礎結構",
        prompt: `# 生成專案基礎結構檔案

根據以下架構規格，生成以下核心檔案：package.json, .gitignore, README.md, .env.example

## 架構規格
${architectureOutput}

## 輸出格式要求

必須使用以下格式輸出每個檔案（這是必填的）：

<!-- file: package.json -->
\`\`\`json
{
  "name": "專案名稱",
  "version": "1.0.0"
}
\`\`\`

<!-- file: .gitignore -->
\`\`\`
node_modules/
.env
\`\`\`

<!-- file: README.md -->
\`\`\`markdown
# 專案說明
\`\`\`

<!-- file: .env.example -->
\`\`\`
API_URL=http://localhost:3000
\`\`\`

## 重要提示
- 每個檔案都必須用 <!-- file: 路徑 --> 標記
- 必須緊接三引號程式碼區塊
- 只生成這 4 個檔案：package.json, .gitignore, README.md, .env.example`
      },
      {
        name: "核心應用邏輯",
        prompt: `# 生成核心應用邏輯檔案

根據以下架構規格，生成核心應用程式檔案（入口點、路由、控制器、模型等）

## 架構規格
${architectureOutput}

## 輸出格式要求

必須使用以下格式輸出每個檔案：

<!-- file: src/index.js -->
\`\`\`javascript
// 應用程式入口點
console.log('Hello World');
\`\`\`

<!-- file: src/routes/api.js -->
\`\`\`javascript
// API 路由
export function router() {
  // 路由邏輯
}
\`\`\`

## 重要提示
- 生成 5-8 個核心應用程式檔案
- 聚焦於主要業務邏輯
- 每個檔案都必須用 <!-- file: 路徑 --> 標記
- 必須緊接三引號程式碼區塊`
      },
      {
        name: "前端介面",
        prompt: `# 生成前端介面檔案

根據以下架構規格，生成前端檔案（HTML 模板、CSS 樣式、客戶端 JavaScript）

## 架構規格
${architectureOutput}

## 輸出格式要求

必須使用以下格式輸出每個檔案：

<!-- file: public/index.html -->
\`\`\`html
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <title>標題</title>
</head>
<body>
  <h1>內容</h1>
</body>
</html>
\`\`\`

<!-- file: public/styles.css -->
\`\`\`css
body {
  margin: 0;
  padding: 0;
}
\`\`\`

## 重要提示
- 生成 4-6 個前端檔案
- 包含 HTML、CSS、JavaScript
- 每個檔案都必須用 <!-- file: 路徑 --> 標記
- 必須緊接三引號程式碼區塊`
      },
      {
        name: "配置與部署",
        prompt: `# 生成配置與部署檔案

根據以下架構規格，生成配置檔案（資料庫 schema、建置設定、部署設定）

## 架構規格
${architectureOutput}

## 輸出格式要求

必須使用以下格式輸出每個檔案：

<!-- file: config/database.js -->
\`\`\`javascript
export const dbConfig = {
  // 資料庫設定
};
\`\`\`

<!-- file: .dockerignore -->
\`\`\`
node_modules/
\`\`\`

## 重要提示
- 生成配置和部署檔案
- 每個檔案都必須用 <!-- file: 路徑 --> 標記
- 必須緊接三引號程式碼區塊`
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

