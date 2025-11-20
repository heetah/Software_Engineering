/**
 * Architect Agent
 * 負責理解使用者需求，並生成系統架構，並生成計劃給 Coder Agent 執行
 */

import BaseAgent from "./agent-base.js";
import dotenv from "dotenv";
import { tokenTracker } from "../utils/token-tracker.js";

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
- For web applications, automatically infer and include frontend design requirements (UI/UX, layout, styling, responsive design).
- For simple prompts, expand them with reasonable assumptions about design, functionality, and user experience.

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
  "markdown": string,
  "design": {
    "ui_style": string (e.g., "modern", "minimalist", "professional"),
    "color_scheme": {
      "primary": string,
      "secondary": string,
      "background": string,
      "text": string
    },
    "layout": string (e.g., "responsive", "centered", "grid"),
    "typography": {
      "font_family": string,
      "font_sizes": { "heading": string, "body": string }
    },
    "components": string[] (e.g., ["navigation bar", "footer", "cards"])
  }
}

Rules:
- Return ONLY a JSON object matching the schema (no extra prose, no markdown code blocks).
- "coder_instructions" must be written as imperative tasks for the Coder Agent.
- Prefer concrete file paths, minimal templates, and runnable commands.
- Keep acceptance criteria testable and unambiguous.
- Include environment scaffolding (e.g., package.json, env files, local database stubs) whenever execution requires it and list commands to set it up.
- For web applications, ALWAYS include frontend files (HTML, CSS, JavaScript) with modern, responsive design.
- For simple prompts like "生成計算機網站", automatically expand to include:
  * Complete UI/UX design specifications
  * Responsive layout (mobile-friendly)
  * Modern styling (CSS with variables, flexbox/grid)
  * Interactive JavaScript functionality
  * Proper file structure (public/ folder for frontend assets)
- "markdown" should be a concise handoff addressed to the Coder Agent summarizing what to implement now.
- "design" section should include UI/UX specifications for frontend projects.
- Mirror the user's request language when possible; otherwise use English.`;

    const userPrompt = JSON.stringify({
      goal: prompt,
      context: context || null,
      constraints: {
        language: 'JavaScript (Node.js)',
        storage: 'Local JSON / files',
        apis: ['OpenAI API'],
      },
      requirements: {
        // 自動推斷需求
        include_frontend: prompt.includes('網站') || prompt.includes('web') || prompt.includes('網站') || prompt.includes('頁面') || prompt.includes('界面'),
        include_styling: true, // 總是包含樣式
        responsive_design: true, // 總是響應式設計
        modern_ui: true // 使用現代 UI 設計
      }
    });

    // 使用 BaseAgent 的重試機制（因為 BaseAgent.run 會自動添加 system message，我們需要自定義 payload）
    // 不指定 model，讓 API Provider Manager 使用默認模型
    const payload = {
      temperature: this.temperature,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    };

    try {
      // 使用 BaseAgent 的 _executeAPI 方法，自動處理重試和 429 錯誤
      const res = await this._executeAPI(payload);

      // 記錄 Token 使用情況
      const usage = res?.data?.usage;
      if (usage) {
        tokenTracker.record(this.role, usage);
        console.log(`  Token usage: Input=${usage.prompt_tokens}, Output=${usage.completion_tokens}, Total=${usage.total_tokens}`);
      }

      const content = res?.data?.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error('API 回傳無內容');
      }

      // 嘗試解析 JSON
      let parsed;
      try {
        // 嘗試從可能的 markdown code block 中提取 JSON
        // 優先匹配 ```json 或 ``` 包裹的 JSON
        let jsonStr = content;
        
        // 嘗試提取最外層的 JSON 對象
        const jsonBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (jsonBlockMatch) {
          jsonStr = jsonBlockMatch[1];
        } else {
          // 如果沒有代碼塊，嘗試直接匹配 JSON 對象
          const jsonObjectMatch = content.match(/\{[\s\S]*\}/);
          if (jsonObjectMatch) {
            jsonStr = jsonObjectMatch[0];
          }
        }
        
        // 清理可能的轉義字符和額外內容
        jsonStr = jsonStr.trim();
        // 移除可能的 markdown 標記
        jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/```\s*$/, '');
        
        parsed = JSON.parse(jsonStr);
        
        // 驗證解析結果是否包含必要的結構
        if (!parsed.coder_instructions && !parsed.plan) {
          throw new Error('Parsed JSON does not contain required fields');
        }
      } catch (e) {
        console.warn(`  ${this.role} JSON parsing failed: ${e.message}`);
        console.warn(`  Attempting to extract JSON from content...`);
        
        // 更積極的 JSON 提取策略
        try {
          // 嘗試找到第一個 { 到最後一個 } 之間的內容
          const firstBrace = content.indexOf('{');
          const lastBrace = content.lastIndexOf('}');
          
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            const extractedJson = content.substring(firstBrace, lastBrace + 1);
            parsed = JSON.parse(extractedJson);
            
            if (!parsed.coder_instructions && !parsed.plan) {
              throw new Error('Extracted JSON does not contain required fields');
            }
          } else {
            throw new Error('No valid JSON structure found');
          }
        } catch (extractError) {
          console.error(`  ${this.role} Failed to extract JSON: ${extractError.message}`);
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
      }

      return {
        ...parsed,
        usage: usage || null
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

    // 不指定 model，讓 API Provider Manager 使用默認模型
    const payload = {
      temperature: this.temperature,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(previous) },
        { role: "user", content: JSON.stringify({ feedback }) }
      ]
    };

    try {
      // 使用 BaseAgent 的 _executeAPI 方法，自動處理重試和 429 錯誤
      const res = await this._executeAPI(payload);

      // 記錄 Token 使用情況
      const usage = res?.data?.usage;
      if (usage) {
        tokenTracker.record(this.role, usage);
        console.log(`  Token usage: Input=${usage.prompt_tokens}, Output=${usage.completion_tokens}, Total=${usage.total_tokens}`);
      }

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
        usage: usage || null
      };
    } catch (err) {
      console.error(` ${this.role} Error:`, err.message);
      throw err;
    }
  }
}
