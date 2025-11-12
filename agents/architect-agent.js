import BaseAgent from "./agent-base.js";
import dotenv from "dotenv";

dotenv.config();

export default class ArchitectAgent extends BaseAgent {
  constructor() {
    // 使用 OpenAI API（從環境變數讀取）
    super("Architect Agent", "JSON", "architect", {
      baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  prompt(requirementOutput) {
    return `
Based on the following requirement specification, generate a detailed system architecture:
${requirementOutput}

Output JSON with:
{
  "modules": [],
  "api_routes": [],
  "database_schema": [],
  "tech_stack": [],
  "integration_points": []
}`;
  }
}
