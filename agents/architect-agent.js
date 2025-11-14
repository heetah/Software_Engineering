/**
 * Architect Agent
 * 負責理解使用者需求，並生成系統架構，並生成計劃給 Coder Agent 執行
 */

import BaseAgent from "./agent-base.js";
import dotenv from "dotenv";
import axios from "axios";
import { logicalModelMap } from "./logical-modelMap.js";

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

  /**
   * 生成計劃（供 InstructionService 使用）
   * @param {Object} options - 選項
   * @param {string} options.prompt - 用戶提示
   * @param {Object} options.context - 上下文資訊
   * @returns {Promise<Object>} 生成的計劃物件
   */
  async generatePlan({ prompt, context }) {
    const systemPrompt = `You are the Architect Agent for an Electron.js + Node.js multi-agent application.

Your primary job:
- Translate high-level goals into explicit, actionable instructions directed at the Coder Agent.
- Produce a precise, implementable plan and a clear "handoff" message that tells the Coder Agent exactly what to do next.
- Keep scope focused on Backend(1): GPT integration, Architect Agent behavior, and dev-process command generation.

Output JSON schema:
{
  "coder_instructions": {
    "role": "Coder Agent",
    "summary": string,
    "directives": [
      { "do": string, "why": string }
    ],
    "files": [
      { "path": string, "purpose": string, "template": string | null }
    ],
    "commands": string[],
    "acceptance": string[],
    "notes": string[]
  },
  "plan": {
    "title": string,
    "summary": string,
    "steps": [
      {
        "id": string,
        "title": string,
        "description": string,
        "commands": string[],
        "artifacts": string[],
        "acceptance": string[]
      }
    ]
  },
  "markdown": string
}

Rules:
- Return ONLY a JSON object matching the schema (no extra prose).
- "coder_instructions" must be written as imperative tasks for the Coder Agent.
- Prefer concrete file paths, minimal templates, and runnable commands.
- Keep acceptance criteria testable and unambiguous.
- Include environment scaffolding (e.g., package.json, env files, local database stubs) whenever execution requires it and list commands to set it up.
- "markdown" should be a concise handoff addressed to the Coder Agent summarizing what to implement now.
- Mirror the user's request language when possible; otherwise use English.`;

    const userPrompt = JSON.stringify({
      goal: prompt,
      context: context || null,
      constraints: {
        language: 'JavaScript (Node.js)',
        storage: 'Local JSON / files',
        apis: ['OpenAI API'],
      }
    });

    // 直接調用 API（因為 BaseAgent.run 會自動添加 system message，我們需要自定義）
    const logicalModel = logicalModelMap[this.logicalName];
    const payload = {
      model: logicalModel,
      temperature: this.temperature,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    };

    try {
      const res = await axios.post(`${this.baseUrl}/chat/completions`, payload, {
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        }
      });

      const content = res?.data?.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error('API 回傳無內容');
      }

      // 嘗試解析 JSON
      let parsed;
      try {
        // 嘗試從可能的 markdown code block 中提取 JSON
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || 
                         content.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
        parsed = JSON.parse(jsonStr.trim());
      } catch (e) {
        // 如果解析失敗，返回一個合理的結構
        parsed = {
          plan: {
            title: 'Architect Plan',
            summary: 'Failed to parse model output; returning raw content in markdown.',
            steps: []
          },
          markdown: '```\n' + content + '\n```'
        };
      }

      return {
        ...parsed,
        usage: res?.data?.usage || null
      };
    } catch (err) {
      console.error(` ${this.role} Error:`, err.message);
      throw err;
    }
  }

  /**
   * 優化計劃（供 InstructionService 使用）
   * @param {Object} options - 選項
   * @param {Object} options.previous - 之前的計劃
   * @param {string} options.feedback - 反饋
   * @returns {Promise<Object>} 優化後的計劃物件
   */
  async refinePlan({ previous, feedback }) {
    const systemPrompt = `You are the Architect Agent for an Electron.js + Node.js multi-agent application.

Your primary job:
- Translate high-level goals into explicit, actionable instructions directed at the Coder Agent.
- Produce a precise, implementable plan and a clear "handoff" message that tells the Coder Agent exactly what to do next.
- Keep scope focused on Backend(1): GPT integration, Architect Agent behavior, and dev-process command generation.

Output JSON schema:
{
  "coder_instructions": {
    "role": "Coder Agent",
    "summary": string,
    "directives": [
      { "do": string, "why": string }
    ],
    "files": [
      { "path": string, "purpose": string, "template": string | null }
    ],
    "commands": string[],
    "acceptance": string[],
    "notes": string[]
  },
  "plan": {
    "title": string,
    "summary": string,
    "steps": [
      {
        "id": string,
        "title": string,
        "description": string,
        "commands": string[],
        "artifacts": string[],
        "acceptance": string[]
      }
    ]
  },
  "markdown": string
}

Rules:
- Return ONLY a JSON object matching the schema (no extra prose).
- "coder_instructions" must be written as imperative tasks for the Coder Agent.
- Prefer concrete file paths, minimal templates, and runnable commands.
- Keep acceptance criteria testable and unambiguous.
- Include environment scaffolding (e.g., package.json, env files, local database stubs) whenever execution requires it and list commands to set it up.
- "markdown" should be a concise handoff addressed to the Coder Agent summarizing what to implement now.
- Mirror the user's request language when possible; otherwise use English.`;

    const logicalModel = logicalModelMap[this.logicalName];

    const payload = {
      model: logicalModel,
      temperature: this.temperature,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(previous) },
        { role: "user", content: JSON.stringify({ feedback }) }
      ]
    };

    try {
      const res = await axios.post(`${this.baseUrl}/chat/completions`, payload, {
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        }
      });

      const content = res?.data?.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error('API 回傳無內容');
      }

      let parsed;
      try {
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || 
                         content.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
        parsed = JSON.parse(jsonStr.trim());
      } catch (e) {
        parsed = {
          plan: previous.plan || { title: 'Architect Plan', summary: '', steps: [] },
          markdown: (previous.markdown || '') + "\n\n---\nRefine (raw):\n\n```\n" + content + "\n```\n",
        };
      }

      return {
        ...parsed,
        usage: res?.data?.usage || null
      };
    } catch (err) {
      console.error(` ${this.role} Error:`, err.message);
      throw err;
    }
  }
}
