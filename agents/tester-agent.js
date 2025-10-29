import BaseAgent from "./agent-base.js";
import dotenv from "dotenv";

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
    return `
Write automated tests for the following code:
${coderOutput}

Output unit tests or integration test scripts.`;
  }
}
