/**
 * Architect Agent
 * 負責理解使用者需求，並生成系統架構，並生成計劃給 Coder Agent 執行
 */

import BaseAgent from "./agent-base.js";
import dotenv from "dotenv";
import { tokenTracker } from "../utils/token-tracker.js";

dotenv.config();

export default class ArchitectAgent extends BaseAgent {
  constructor(options = {}) {
    super("Architect Agent", "JSON", "architect", options);
  }

  _detectBaseUrl(endpoint) {
    // 如果是 Gemini API endpoint，需要轉換成適合 BaseAgent 的格式
    if (endpoint.includes('generativelanguage.googleapis.com')) {
      return 'https://generativelanguage.googleapis.com/v1beta';
    }
    return endpoint;
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
   * 簡單意圖判斷：區分「專案生成」與「單純問答」
   * @param {Object} options
   * @param {string} options.prompt - 使用者輸入
   * @param {Object} [options.context] - 目前上下文
   * @returns {Promise<"project"|"qa">}
   */
  async detectIntent({ prompt, context }) {
    const systemPrompt = `You are an intent classifier for a multi-agent coding assistant.

Your task:
- Decide whether the user wants to GENERATE / MODIFY a software project ("project" mode),
  or is ONLY asking a general question / explanation ("qa" mode).

Output rules:
- Output EXACTLY one lowercase word: "project" or "qa".
- "project": user clearly asks to build/create/modify an app, website, system, codebase, or tests.
- "qa": user mainly wants explanation, debugging help, code review, or conceptual Q&A,
  without asking to generate a full multi-file project.
`;

    const payload = {
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: JSON.stringify({
            user_input: prompt,
            context: context || null
          })
        }
      ]
    };

    try {
      const res = await this._executeAPI(payload);
      const usage = res?.data?.usage;
      if (usage) {
        tokenTracker.record(`${this.role}-intent`, usage);
        console.log(
          `  Intent detection token usage: Input=${usage.prompt_tokens}, Output=${usage.completion_tokens}, Total=${usage.total_tokens}`
        );
      }

      const content = res?.data?.choices?.[0]?.message?.content?.trim().toLowerCase();
      if (!content) {
        throw new Error("Intent classifier returned empty content");
      }

      if (content.includes("qa")) return "qa";
      if (content.includes("project")) return "project";

      // 預設走「專案生成」比較安全
      return "project";
    } catch (err) {
      console.warn(`  ${this.role} intent detection failed, fallback to project mode: ${err.message}`);
      return "project";
    }
  }

  /**
   * 單純問答模式：直接請 LLM 產生回覆，不觸發專案生成流程
   * @param {Object} options
   * @param {string} options.prompt
   * @param {Object} [options.context]
   * @returns {Promise<{ answerText: string, usage: any }>}
   */
  async answerQuestion({ prompt, context }) {
    const systemPrompt = `You are a helpful programming assistant.
- If the user is asking a question (not clearly asking to generate a full project), answer directly.
- Use the same language as the user when possible (e.g. Traditional Chinese).
- Do NOT describe or mention any internal agents, architecture.json, or test-plan.json.
- Focus on giving a clear, concise, and practical answer.
`;

    const payload = {
      temperature: 0.5,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: JSON.stringify({
            user_input: prompt,
            context: context || null
          })
        }
      ]
    };

    const res = await this._executeAPI(payload);
    const usage = res?.data?.usage;
    if (usage) {
      tokenTracker.record(`${this.role}-qa`, usage);
      console.log(
        `  QA answer token usage: Input=${usage.prompt_tokens}, Output=${usage.completion_tokens}, Total=${usage.total_tokens}`
      );
    }

    const content = res?.data?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("QA answer LLM 回傳無內容");
    }

    return { answerText: content, usage: usage || null };
  }

  /**
   * 生成計劃（供 InstructionService 使用）
   * @param {Object} options - 選項
   * @param {string} options.prompt - 用戶提示
   * @param {Object} options.context - 上下文資訊
   * @returns {Promise<Object>} 生成的計劃物件
   */
  async generatePlan({ prompt, context }) {
    // 🔥 RAG Enhancement: Query knowledge base for similar projects
    let ragContext = '';
    try {
      const { default: ragEngine } = await import('./rag-engine/index.js');

      // Initialize RAG with API keys (if available)
      const ragConfig = {
        cloudApiKey: this.apiKey || process.env.OPENAI_API_KEY,
        cloudApiEndpoint: this.baseUrl
      };
      ragEngine.init(ragConfig);

      // Ingest knowledge base (example projects)
      await ragEngine.ingestKnowledgeBase();
      await ragEngine.buildIndex();

      // Query for similar architectures
      const queryText = `${prompt} architecture patterns contracts`;
      ragContext = await ragEngine.query(queryText, 3);

      if (ragContext && ragContext.length > 0) {
        console.log(`  🧠 Retrieved RAG context (${ragContext.length} chars) for architecture planning`);
      }
    } catch (err) {
      console.warn(`  RAG Engine unavailable: ${err.message}`);
      // Continue without RAG if it fails
    }

    const systemPrompt = `You are the Architect Agent for an Electron.js + Node.js multi-agent application.

Your primary job:
- Translate high-level goals into explicit, actionable instructions directed at the Coder Agent.
- Produce a precise, implementable plan and a clear "handoff" message that tells the Coder Agent exactly what to do next.
- For web applications, automatically infer and include frontend design requirements (UI/UX, layout, styling, responsive design).
- **SCALE & COMPLETENESS**: The user wants a **FULL-SCALE, PRODUCTION-READY** application, not a toy example or MVP.
  - Break down features into multiple logical files and modules.
  - Include comprehensive error handling, validations, and edge case coverage in your design.
  - If the user asks for a specific system (e.g., "E-commerce"), include ALL standard features (browsing, cart, checkout, user profile, administrative dashboard, mock payment, search, filtering).
  - **EXHAUSTIVE CONTRACTS**: For repetitive UI elements (e.g., calculator buttons, grid items), you MUST list ALL of them in the contracts. Do not output a partial list (e.g., "1, 2, ...").
  - **MANDATORY LINKING**: Explicitly require 'index.html' to include '<link rel="stylesheet" href="style.css">' and '<script src="script.js" defer></script>'.
  - Do NOT simplify the architecture. Aim for professional software engineering standards.
- **IMPORTANT**: Define clear contracts (DOM elements, API endpoints, storage keys) instead of writing full code templates.
- Use "template" ONLY for simple config files (package.json, .gitignore). For code files, define "contracts" and let Worker Agents generate the implementation.

Output JSON schema:
{
  "coder_instructions": {
    "role": "Coder Agent",
    "summary": string,
    "files": [
      { 
        "path": string, 
        "purpose": string, 
        "template": string | null,  // Use ONLY for package.json, .gitignore, simple configs. Set null for code files.
        "requirements": string[]     // Detailed functional requirements for Worker Agents
      }
    ],
    "commands": string[],
    "contracts": {
      "dom": [
        { 
          "id": string,              // DOM element ID (e.g., "display", "calculateBtn")
          "type": string,            // Element type (e.g., "input", "button", "div")
          "purpose": string,         // What this element does
          "accessedBy": string[]     // Which files access it (e.g., ["public/script.js"])
        }
      ],
      "api": [
        { 
          "endpoint": string,        // IPC channel or HTTP endpoint (e.g., "calculate", "/api/data")
          "method": string,          // "ipc-handle", "GET", "POST", etc.
          "purpose": string,         // What this API does
          "requestSchema": object | null,   // Expected request format
          "responseSchema": object | null,  // Expected response format
          "producers": string[],     // Which files implement it (e.g., ["main.js"])
          "consumers": string[]      // Which files call it (e.g., ["public/script.js"])
        }
      ],
      "storage": [
        { 
          "key": string,             // Storage key or filename (e.g., "history.json")
          "type": string,            // "file", "localStorage", "sessionStorage"
          "purpose": string,         // What data is stored
          "schema": object | null    // Data structure
        }
      ]
    },
    "projectConfig": {
      "type": string,                // "electron", "web", "node-cli", etc.
      "runtime": {
        "platform": string,          // "electron", "browser", "node"
        "backend_port": number | null,
        "frontend_port": number | null
      },
      "backend": {
        "port": number | null,
        "framework": string | null   // "express", "electron-ipc", etc.
      }
    }
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
        "artifacts": string[]
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
- **Template Strategy**:
  * Use "template" ONLY for: package.json, .gitignore, README.md, simple config files
  * For ALL code files (.js, .html, .css, .py): Set template=null and define detailed "contracts" instead
  * Worker Agents are experts - let them generate code based on contracts
- **Contracts Strategy**:
  * Define ALL DOM elements that will be used (buttons, inputs, divs with IDs)
  * Define ALL API endpoints/IPC channels with COMPLETE request/response schemas
  * Define ALL storage requirements (files, localStorage keys)
  * Be specific: include IDs, types, purposes, and which files interact with them
  * ⚠️ CRITICAL: NEVER set requestSchema or responseSchema to null
  * For APIs that take no parameters: requestSchema = {type: "object", properties: {}}
  * For APIs that return nothing: responseSchema = {type: "object", properties: {success: {type: "boolean"}, message: {type: "string"}}}
  * For APIs that return simple types: responseSchema = {type: "string"} or {type: "number"}
  * For APIs that return objects: ALWAYS define the object structure with properties
  * For APIs that return arrays: ALWAYS define the array items structure
- **For Electron apps**:
  * Define IPC contracts between main.js and renderer (e.g., "calculate" channel)
  * Specify preload.js should use contextBridge.exposeInMainWorld (not exposeAPI)
  * Set contextIsolation: true, nodeIntegration: false in main.js
  * ⚠️ CRITICAL: main.js is Node.js - it CANNOT require('./config') because config.js uses window.APP_CONFIG
  * ⚠️ CRITICAL: In main.js requirements, explicitly state "Do NOT import config.js"
  * For main.js: use hardcoded window dimensions (width: 800, height: 600)
  * ⚠️ CRITICAL: ALL IPC handlers must have complete responseSchema - even simple ones like checkout
  * Example: checkout IPC should return {success: boolean, message: string}, not void
- Keep acceptance criteria testable and unambiguous.
- Include environment scaffolding commands (npm install, etc.).
- For web applications, ALWAYS include frontend files (HTML, CSS, JavaScript) with modern, responsive design.
- For simple prompts like "生成計算機網站", automatically expand to include:
  * Complete UI/UX design specifications
  * Responsive layout (mobile-friendly)
  * Modern styling (CSS with variables, flexbox/grid)
  * Interactive JavaScript functionality
  * Proper file structure (public/ folder for frontend assets)
  * Clear DOM contracts (button IDs, input IDs, event handlers)
  * Clear API contracts (IPC channels or HTTP endpoints)
- "markdown" should be a concise handoff addressed to the Coder Agent summarizing what to implement now.
- "design" section should include UI/UX specifications for frontend projects.
- Mirror the user's request language when possible; otherwise use English.`;

    const userPromptData = {
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
    };

    // 🧠 Inject RAG context if available
    if (ragContext && ragContext.length > 0) {
      userPromptData.reference_architectures = `\n\n=== REFERENCE ARCHITECTURES (from knowledge base) ===\n${ragContext}\n=== END REFERENCE ARCHITECTURES ===\n\nUse these references to inform your architecture design, especially for contracts structure.`;
    }

    const userPrompt = JSON.stringify(userPromptData);

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
- **IMPORTANT**: Define clear contracts (DOM elements, API endpoints, storage keys) instead of writing full code templates.
- **SCALE & COMPLETENESS**: Ensure the refined plan maintains or expands the project scope to be **FULL-SCALE** and **PRODUCTION-READY**. Avoid simplifying or removing features unless explicitly asked.
- **MANDATORY LINKING**: Explicitly require 'index.html' to include '<link rel="stylesheet" href="style.css">' and '<script src="script.js" defer></script>'.
- Use "template" ONLY for simple config files (package.json, .gitignore). For code files, define "contracts" and let Worker Agents generate the implementation.

Output JSON schema:
{
  "coder_instructions": {
    "role": "Coder Agent",
    "summary": string,
    "files": [
      { 
        "path": string, 
        "purpose": string, 
        "template": string | null,  // Use ONLY for package.json, .gitignore, simple configs. Set null for code files.
        "requirements": string[]     // Detailed functional requirements for Worker Agents
      }
    ],
    "commands": string[],
    "contracts": {
      "dom": [
        { 
          "id": string,
          "type": string,
          "purpose": string,
          "accessedBy": string[]
        }
      ],
      "api": [
        { 
          "endpoint": string,
          "method": string,
          "purpose": string,
          "requestSchema": object | null,
          "responseSchema": object | null,
          "producers": string[],
          "consumers": string[]
        }
      ],
      "storage": [
        { 
          "key": string,
          "type": string,
          "purpose": string,
          "schema": object | null
        }
      ]
    },
    "projectConfig": {
      "type": string,
      "runtime": {
        "platform": string,
        "backend_port": number | null,
        "frontend_port": number | null
      },
      "backend": {
        "port": number | null,
        "framework": string | null
      }
    }
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
        "artifacts": string[]
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
