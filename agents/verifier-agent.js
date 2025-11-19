import BaseAgent from "./agent-base.js";
import dotenv from "dotenv";
import { VERIFIER_OUTPUT_TEMPLATE } from "./templates.js";

dotenv.config();

export default class VerifierAgent extends BaseAgent {
  constructor() {
    // 使用 OpenAI API（從環境變數讀取）
    super("Verifier Agent", "Markdown", "verifier", {
      baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      apiKey: process.env.OPENAI_API_KEY
    });
    this.temperature = 0.1;
  }

  prompt(input) {
    // 只取前 8000 字符避免超過 token 限制
    const truncated = typeof input === "string" && input.length > 8000
      ? input.substring(0, 8000) + "\n... [內容已截斷以符合長度限制]"
      : input;

    return `# 產生澄清問題

以下是目前的規格/設計/程式碼內容，請產生高品質的澄清問題以去除關鍵不確定性，並以可執行決策為導向。

## 參考內容
${truncated}

${VERIFIER_OUTPUT_TEMPLATE}`;
  }
}


