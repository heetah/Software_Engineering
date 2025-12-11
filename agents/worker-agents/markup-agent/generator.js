/**
 * Markup Generator
 * 主要依賴雲端 API 生成 HTML，fallback 到簡單模擬
 */

const path = require('path');
const { callCloudAPI } = require('../api-adapter.cjs');

class MarkupGenerator {
  constructor(config = {}) {
    // API 配置優先順序：1. config 參數 2. CLOUD_API 3. OPENAI_API
    this.cloudApiEndpoint = config.cloudApiEndpoint ||
      process.env.CLOUD_API_ENDPOINT ||
      process.env.OPENAI_BASE_URL;
    this.cloudApiKey = config.cloudApiKey ||
      process.env.CLOUD_API_KEY ||
      process.env.OPENAI_API_KEY;
    this.useMockApi = !this.cloudApiEndpoint;

    // 🔍 Debug: 記錄配置
    console.log('[MarkupGenerator] Initialized:', {
      hasConfigEndpoint: !!config.cloudApiEndpoint,
      hasConfigKey: !!config.cloudApiKey,
      hasEnvCloudEndpoint: !!process.env.CLOUD_API_ENDPOINT,
      hasEnvOpenaiEndpoint: !!process.env.OPENAI_BASE_URL,
      finalEndpoint: this.cloudApiEndpoint ? this.cloudApiEndpoint.substring(0, 50) + '...' : 'MISSING',
      willUseMock: this.useMockApi
    });
  }

  async generate({ skeleton, fileSpec, context }) {
    console.log(`[Generator] Processing ${fileSpec.path}`);
    
    // 優先級 1: 使用 template（Architect 明確指定的內容）
    if (fileSpec.template && fileSpec.template.trim()) {
      console.log(`[Generator] ✅ Using template (${fileSpec.template.length} chars)`);
      return {
        content: fileSpec.template,
        tokensUsed: 0,
        method: 'template'
      };
    }
    
    // 優先級 2: 使用 contracts 結構（動態生成）
    const hasContracts = context.contracts && (
      (context.contracts.dom && context.contracts.dom.length > 0) ||
      (context.contracts.api && context.contracts.api.length > 0)
    );
    
    if (hasContracts) {
      console.log(`[Generator] ✓ Using contracts-based generation`);
      console.log(`[Generator] Mode: ${this.useMockApi ? 'MOCK (Fallback)' : 'CLOUD API'}`);
      
      if (this.useMockApi) {
        return this.generateWithMock({ skeleton, fileSpec, context });
      } else {
        return this.generateWithCloudAPI({ skeleton, fileSpec, context });
      }
    }
    
    // 優先級 3: AI 生成（無 template 也無 contracts）
    console.log(`[Generator] ⚠ No contracts or template - using AI generation`);
    console.log(`[Generator] Mode: ${this.useMockApi ? 'MOCK (Fallback)' : 'CLOUD API'}`);

    if (this.useMockApi) {
      return this.generateWithMock({ skeleton, fileSpec, context });
    } else {
      return this.generateWithCloudAPI({ skeleton, fileSpec, context });
    }
  }

  /**
   * 雲端 API 生成
   */
  async generateWithCloudAPI({ skeleton, fileSpec, context }) {
    const prompt = this.buildPrompt({ skeleton, fileSpec, context });
    const filePath = fileSpec.path || '';
    const ext = path.extname(filePath).toLowerCase();
    
    // 根據文件類型選擇 system prompt
    let systemPrompt;
    if (ext === '.json') {
      systemPrompt = `You are an expert at generating JSON files.

CRITICAL RULES:
1. Output ONLY valid JSON - no markdown, no \`\`\`json blocks, no comments
2. JSON must be parseable by JSON.parse()
3. Use proper escaping for special characters
4. For empty arrays, output: []
5. For empty objects, output: {}

FORBIDDEN:
- \`\`\`json or \`\`\` markers
- // comments (JSON doesn't support comments)
- Trailing commas`;
    } else {
      systemPrompt = `You are an expert HTML/Markup developer. Generate clean, semantic HTML.

CRITICAL RULES:
1. Output ONLY raw HTML/markup code - no markdown blocks
2. Use consistent element IDs that match the contracts/requirements
3. For Electron apps: load script.js NOT app.js, do NOT load config.js in HTML
4. Include proper meta tags and semantic structure

FORBIDDEN:
- \`\`\`html or \`\`\` markers
- Loading non-existent script files
- Inconsistent element IDs`;
    }

    try {
      const { content, tokensUsed } = await callCloudAPI({
        endpoint: this.cloudApiEndpoint,
        apiKey: this.cloudApiKey,
        systemPrompt: systemPrompt,
        userPrompt: prompt,
        maxTokens: 80000  // Increased to 80k as requested
      });

      // 檢查 API 是否真的返回了內容
      if (!content || content.trim() === '') {
        console.warn('[Generator] API returned empty content despite consuming tokens:', tokensUsed);
        throw new Error('API returned empty content (possibly blocked by safety filters)');
      }

      // 清理 markdown 程式碼區塊標記（包括 JSON）
      const cleanContent = content
        .replace(/^```json\n/, '')
        .replace(/^```html\n/, '')
        .replace(/^```xml\n/, '')
        .replace(/^```\n/, '')
        .replace(/\n```$/, '')
        .replace(/```$/m, '')
        .trim();

      // 二次檢查清理後的內容
      if (!cleanContent) {
        console.warn('[Generator] Content became empty after cleaning. Original content length:', content.length);
        console.warn('[Generator] Original content preview:', content.substring(0, 200));
        throw new Error('Content became empty after markdown removal');
      }

      return {
        content: cleanContent,
        tokensUsed,
        method: 'cloud-api'
      };

    } catch (error) {
      console.error('[Generator] API error:', error.message);
      console.log('[Generator] Falling back to mock...');
      return this.generateWithMock({ skeleton, fileSpec, context });
    }
  }

  /**
   * Mock fallback（僅用於除錯/測試）
   */
  async generateWithMock({ skeleton, fileSpec, context }) {
    const { description } = fileSpec;

    const content = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${description || 'Page'}</title>
</head>
<body>
    <h1>${description || 'Content'}</h1>
    <p>Mock fallback - Configure CLOUD_API_ENDPOINT for real generation</p>
</body>
</html>`;

    return {
      content,
      tokensUsed: Math.ceil(content.length / 4),
      method: 'mock-fallback'
    };
  }

  buildPrompt({ skeleton, fileSpec, context }) {
    const { path: filePath, description, requirements = [] } = fileSpec;
    const completedFiles = context.completedFiles || [];
    const allFiles = context.allFiles || [];
    const contracts = context.contracts || null;

    let prompt = `Generate HTML for: ${filePath}\n\n`;

    // 🚨 CONTRACTS FIRST - 最優先顯示，確保 AI 必定看到
    if (contracts) {
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `🚨 CRITICAL: CONTRACTS (MUST FOLLOW EXACTLY) 🚨\n`;
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      // ✨ DOM contracts - 最重要！定義必須存在的 HTML 元素
      if (contracts.dom && contracts.dom.length > 0) {
        // For HTML files, show ALL DOM elements (HTML produces them, JavaScript consumes them)
        const relevantDom = contracts.dom;

        if (relevantDom.length > 0) {
          prompt += `⚠️ DOM STRUCTURE REQUIREMENTS (MANDATORY) ⚠️\n`;
          prompt += `The following elements will be queried by JavaScript.\n`;
          prompt += `Missing ANY of these will cause JavaScript errors!\n\n`;

          relevantDom.forEach((dom, idx) => {
            prompt += `DOM Contract #${idx + 1}: ${dom.description || dom.purpose}\n`;

            // Support simple format: { id, type, purpose, accessedBy }
            if (dom.id) {
              prompt += `  ✓ Element ID: #${dom.id}\n`;
              prompt += `  ✓ Element Type: <${dom.type}>\n`;
              if (dom.accessedBy) {
                prompt += `  ✓ Accessed by: ${dom.accessedBy.join(', ')}\n`;
              }
            }

            // Support complex format: { templateId, containerId, requiredElements }
            if (dom.templateId) {
              prompt += `  ✓ Template ID: #${dom.templateId}\n`;
            }
            if (dom.containerId) {
              prompt += `  ✓ Container ID: #${dom.containerId}\n`;
            }

            if (dom.requiredElements && dom.requiredElements.length > 0) {
              prompt += `  Required Elements:\n`;
              dom.requiredElements.forEach(elem => {
                prompt += `    • ${elem.selector} <${elem.element}>\n`;
                prompt += `      Purpose: ${elem.purpose}\n`;
                if (elem.attributes) {
                  prompt += `      Attributes: ${JSON.stringify(elem.attributes)}\n`;
                }
                if (elem.consumers) {
                  prompt += `      Used by: ${elem.consumers.join(', ')}\n`;
                }
              });
            }
            prompt += `\n`;
          });

          prompt += `❌ YOU WILL FAIL IF YOU:\n`;
          prompt += `  - Use different IDs than specified above\n`;
          prompt += `  - Use different element types\n`;
          prompt += `  - Omit any required element\n\n`;

          prompt += `✅ YOU MUST:\n`;
          prompt += `  1. Include ALL elements with EXACT IDs\n`;
          prompt += `  2. Use specified HTML element types\n`;
          prompt += `  3. Add all required attributes\n`;
          prompt += `  4. Place elements logically in structure\n\n`;
        }
      }

      // API contracts
      if (contracts.api && contracts.api.length > 0) {
        // 🔥 修復：寬鬆過濾，如果 consumers 為空也顯示
        const relevantApis = contracts.api.filter(api => {
          const consumers = api.consumers || [];
          return consumers.length === 0 || consumers.some(c => c.includes(filePath.replace('.html', '.js')));
        });

        if (relevantApis.length > 0) {
          prompt += `API Endpoints (for JavaScript):\n`;
          relevantApis.forEach(api => {
            prompt += `  ${api.endpoint} - ${api.description}\n`;
          });
          prompt += `Ensure forms/buttons match API data structure.\n\n`;
        }
      }

      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `END OF CONTRACTS - FOLLOW THEM EXACTLY!\n`;
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    }

    if (description) {
      prompt += `Description: ${description}\n\n`;
    }

    // ========== 自動檢測：config.js 和腳本載入順序 ==========
    const hasConfigJs = allFiles.some(f => f.path === 'config.js' || f.path.endsWith('/config.js'));
    const hasAppJs = allFiles.some(f => f.path.endsWith('app.js') || f.path.includes('.js'));

    if (hasConfigJs && hasAppJs) {
      prompt += `🔴 CRITICAL REQUIREMENT - SCRIPT LOADING ORDER:\n`;
      prompt += `The HTML MUST load scripts in this EXACT order in <head>:\n`;
      prompt += `1. <script src="config.js"></script>  <!-- FIRST: Configuration -->\n`;
      prompt += `2. <script src="app.js" defer></script>  <!-- SECOND: Application logic -->\n`;
      prompt += `This order is MANDATORY because app.js depends on window.APP_CONFIG from config.js.\n`;
      prompt += `If you violate this order, the application WILL FAIL.\n\n`;
    }

    // ========== DOM 元素命名規範 ==========
    prompt += `🔴 DOM ELEMENT NAMING STANDARDS:\n`;
    prompt += `1. Form IDs: Use full descriptive names (e.g., 'add-expense-form', NOT 'form')\n`;
    prompt += `2. Input IDs: Prefix with context (e.g., 'expense-amount', 'edit-expense-amount')\n`;
    prompt += `3. Modal IDs: Use pattern '<feature>-modal' (e.g., 'edit-expense-modal')\n`;
    prompt += `4. Modal form fields: Prefix with modal context (e.g., 'edit-expense-description')\n`;
    prompt += `5. Filter dropdowns: If value 'all' means no filter, include it as default <option>\n`;
    prompt += `6. Container IDs: Use '-body' or '-container' suffix (e.g., 'expense-table-body')\n`;
    prompt += `7. Display elements: Use descriptive IDs (e.g., 'total-spending', NOT 'total')\n\n`;

    if (requirements.length > 0) {
      prompt += `Additional Requirements:\n${requirements.map(r => `- ${r}`).join('\n')}\n\n`;
    }

    // ← 舊的 contracts 區塊已移到開頭，這裡不再重複
    if (contracts && false) {
      prompt += `=== CONTRACTS (MUST FOLLOW EXACTLY) ===\n`;

      // ✨ DOM contracts - 最重要！定義必須存在的 HTML 元素
      if (contracts.dom && contracts.dom.length > 0) {
        // For HTML files, show ALL DOM elements (HTML produces them, JavaScript consumes them)
        // The accessedBy field indicates which JS files consume these elements
        const relevantDom = contracts.dom;

        if (relevantDom.length > 0) {
          prompt += `\n⚠️ CRITICAL: DOM STRUCTURE REQUIREMENTS ⚠️\n`;
          prompt += `The following elements are MANDATORY and will be queried by JavaScript:\n`;
          prompt += `Missing ANY of these will cause JavaScript errors!\n\n`;

          relevantDom.forEach((dom, idx) => {
            prompt += `DOM Contract #${idx + 1}: ${dom.description || dom.purpose}\n`;

            // Support simple format: { id, type, purpose, accessedBy }
            if (dom.id) {
              prompt += `  Element ID: #${dom.id}\n`;
              prompt += `  Element Type: <${dom.type}>\n`;
              if (dom.accessedBy) {
                prompt += `  Accessed by: ${dom.accessedBy.join(', ')}\n`;
              }
            }

            // Support complex format: { templateId, containerId, requiredElements }
            if (dom.templateId) {
              prompt += `  Template ID: #${dom.templateId}\n`;
            }
            if (dom.containerId) {
              prompt += `  Container ID: #${dom.containerId}\n`;
            }

            if (dom.requiredElements && dom.requiredElements.length > 0) {
              prompt += `  Required Elements:\n`;
              dom.requiredElements.forEach(elem => {
                prompt += `    • ${elem.selector} <${elem.element}>\n`;
                prompt += `      Purpose: ${elem.purpose}\n`;
                if (elem.attributes) {
                  prompt += `      Attributes: ${JSON.stringify(elem.attributes)}\n`;
                }
                if (elem.consumers) {
                  prompt += `      Used by: ${elem.consumers.join(', ')}\n`;
                }
              });
            }
            prompt += `\n`;
          });

          prompt += `YOU MUST:\n`;
          prompt += `1. Include ALL elements listed above with EXACT selectors\n`;
          prompt += `2. Use the specified HTML element types\n`;
          prompt += `3. Add all required attributes\n`;
          prompt += `4. Place elements in logical positions within the HTML structure\n`;
          prompt += `5. If templateId is specified, create a <template> element with that ID\n\n`;
        }
      }

      // API contracts - 提示前端需要呼叫哪些 endpoints
      if (contracts.api && contracts.api.length > 0) {
        const relevantApis = contracts.api.filter(api =>
          api.consumers.some(c => c.includes(filePath.replace('.html', '.js')))
        );

        if (relevantApis.length > 0) {
          prompt += `API Endpoints (for JavaScript to call):\n`;
          relevantApis.forEach(api => {
            prompt += `  ${api.endpoint} - ${api.description}\n`;
          });
          prompt += `Note: Ensure HTML forms/buttons match the data structure needed by these APIs.\n\n`;
        }
      }

      // Events contracts - HTML 需要觸發的事件
      if (contracts.events && contracts.events.length > 0) {
        const relevantEvents = contracts.events.filter(evt =>
          evt.emitters.some(e => e.includes(filePath.replace('.html', '.js')))
        );

        if (relevantEvents.length > 0) {
          prompt += `Custom Events:\n`;
          relevantEvents.forEach(evt => {
            prompt += `  ${evt.name} - ${evt.description}\n`;
          });
          prompt += `\n`;
        }
      }

      // Storage contracts - 提示需要哪些 data-* attributes
      if (contracts.storage && contracts.storage.length > 0) {
        prompt += `Storage Keys (use data-* attributes if needed):\n`;
        contracts.storage.forEach(store => {
          prompt += `  ${store.key} - ${store.description}\n`;
        });
        prompt += `\n`;
      }

      prompt += `=== END CONTRACTS ===\n\n`;
    }

    if (skeleton) {
      prompt += `Skeleton:\n\`\`\`html\n${skeleton}\n\`\`\`\n\n`;
    }

    if (allFiles.length > 0) {
      const cssFiles = allFiles.filter(f => f.path.endsWith('.css'));
      const jsFiles = allFiles.filter(f => f.path.endsWith('.js'));

      if (cssFiles.length > 0) {
        prompt += `CSS files: ${cssFiles.map(f => f.path).join(', ')}\n`;
      }
      if (jsFiles.length > 0) {
        prompt += `JS files: ${jsFiles.map(f => f.path).join(', ')}\n`;
      }
      prompt += `\nInclude proper <link> and <script> tags.\n\n`;
    }

    prompt += `Generate complete, production-ready HTML with:\n`;
    prompt += `- Semantic HTML5 structure\n`;
    prompt += `- Proper accessibility attributes (aria-*, alt, labels)\n`;
    prompt += `- data-* attributes for all interactive elements that need JS handling\n`;
    prompt += `- CRITICAL: All IDs, classes, data-* attributes, and element text MUST match skeleton exactly\n`;
    prompt += `- CRITICAL: Any symbols or values in buttons/inputs that JS will read must be consistent\n`;
    prompt += `- Include proper <link> and <script> tags matching actual file names\n\n`;
    prompt += `Return ONLY the code, no markdown.`;

    return prompt;
  }
}

module.exports = MarkupGenerator;
