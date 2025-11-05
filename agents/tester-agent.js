import BaseAgent from "./agent-base.js";
import dotenv from "dotenv";
import { TEST_OUTPUT_FORMAT, TEST_IMPORTANT_TIPS } from "./templates.js";

dotenv.config();

export default class TesterAgent extends BaseAgent {
  constructor() {
    // 使用 OpenAI API（從環境變數讀取）
    super("Tester Agent", "Markdown code", "tester", {
      baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      apiKey: process.env.OPENAI_API_KEY
    });

  }

  prompt(coderOutput) {
    // 只取前 8000 字符避免超過 token 限制
    const truncatedCode = coderOutput.length > 8000 
      ? coderOutput.substring(0, 8000) + "\n... [內容已截斷以符合長度限制]"
      : coderOutput;

    return `# 生成完整的測試檔案

根據以下程式碼，生成完整的自動化測試檔案。**必須確保每個測試檔案都完整且可執行**。

## 程式碼內容
${truncatedCode}

${TEST_OUTPUT_FORMAT}

${TEST_IMPORTANT_TIPS}`;
  }
}
