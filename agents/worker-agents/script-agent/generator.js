/**
 * Script Generator - 支援多種 LLM API
 */

const path = require('path');
const { callCloudAPI } = require('../api-adapter.cjs');
const API_STANDARDS = require('../../shared/api-standards.cjs');
// const ragEngine = require('../../rag-engine/index.js'); // REMOVED: Using dynamic import to avoid ESM error

class ScriptGenerator {
  constructor(config = {}) {
    // API 配置優先順序：1. config 參數 2. CLOUD_API 3. OPENAI_API
    this.cloudApiEndpoint = config.cloudApiEndpoint ||
      process.env.CLOUD_API_ENDPOINT ||
      process.env.OPENAI_BASE_URL;
    this.cloudApiKey = config.cloudApiKey ||
      process.env.CLOUD_API_KEY ||
      process.env.OPENAI_API_KEY;
    this.useMockApi = !this.cloudApiEndpoint;

    // 🔍 Debug: 記錄 Worker Generator 初始化
    console.log('[ScriptGenerator] Initialized:', {
      hasConfigEndpoint: !!config.cloudApiEndpoint,
      hasConfigKey: !!config.cloudApiKey,
      hasEnvCloudEndpoint: !!process.env.CLOUD_API_ENDPOINT,
      hasEnvCloudKey: !!process.env.CLOUD_API_KEY,
      hasEnvOpenaiEndpoint: !!process.env.OPENAI_BASE_URL,
      hasEnvOpenaiKey: !!process.env.OPENAI_API_KEY,
      finalEndpoint: this.cloudApiEndpoint ? this.cloudApiEndpoint.substring(0, 50) + '...' : 'MISSING',
      finalKeyExists: !!this.cloudApiKey,
      willUseMock: this.useMockApi
    });
  }

  async generate({ skeleton, fileSpec, context }) {
    console.log(`[Generator] Processing ${fileSpec.path}`);

    // 🔥 Advanced RAG Integration (LlamaIndex / LangChain)
    try {
      if (context.allFiles && context.allFiles.length > 0) {
        // Dynamically import the ESM module
        const { default: ragEngine } = await import('../../rag-engine/index.js');

        // 0. Initialize with current config (API Keys)
        ragEngine.init(this.config);

        // 1. Ingest Knowledge Base (Static Example Code)
        await ragEngine.ingestKnowledgeBase();

        // 2. Ingest known files to RAG Engine (demo purpose: real-time ingest)
        for (const file of context.allFiles) {
          if (file.content) {
            await ragEngine.ingestFile(file.path, file.content);
          }
        }
        await ragEngine.buildIndex();

        // Query Semantic Context
        const query = `${fileSpec.description || ''} ${fileSpec.path}`;
        context.semanticContext = await ragEngine.query(query);
        if (context.semanticContext) {
          console.log(`[Generator] 🧠 Retrieved Semantic Context (${context.semanticContext.length} chars)`);
        }
      }
    } catch (err) {
      console.warn(`[Generator] RAG Engine warning: ${err.message}`);
    }

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

  async generateWithCloudAPI({ skeleton, fileSpec, context }) {
    const prompt = this.buildPrompt({ skeleton, fileSpec, context });

    // 從 context 獲取 modelTier (由 Coordinator 決定)
    const modelTier = context.modelTier || 'strong';

    try {
      const { content, tokensUsed } = await callCloudAPI({
        endpoint: this.cloudApiEndpoint,
        apiKey: this.cloudApiKey,
        systemPrompt: `You are an expert JavaScript developer. Generate COMPLETE, WORKING JavaScript code.

CRITICAL RULES:
1. Generate FULL IMPLEMENTATIONS - never write "implementation omitted" or "..." or empty function bodies
2. Every function MUST have complete working code inside
3. config.js uses window.APP_CONFIG - it is a FRONTEND file, NEVER require() it in Node.js/Electron main process
4. For Electron apps: main.js is Node.js (backend), public/script.js is browser (frontend) - they have DIFFERENT APIs
5. Match DOM element IDs EXACTLY with the HTML - if HTML has id="todoInput", use getElementById('todoInput')
6. Output ONLY raw code - no markdown, no \`\`\`javascript blocks, no explanations

FORBIDDEN:
- { /* ... implementation omitted ... */ }
- { /* TODO */ }
- // Implementation goes here
- const config = require('./config') in Electron main.js
- Mismatched DOM IDs between HTML and JS`,
        userPrompt: prompt,
        maxTokens: 80000,  // Increased to 80k as requested
        modelTier: modelTier // Pass tier to adapter
      });

      if (!content || content.trim() === '') {
        console.warn('[Generator] API returned empty content despite consuming tokens:', tokensUsed);
        throw new Error('API returned empty content (possibly blocked by safety filters)');
      }

      let cleanContent = content
        .replace(/^```javascript\n/, '')
        .replace(/^```js\n/, '')
        .replace(/^```\n/, '')
        .replace(/\n```$/, '')
        .trim();

      if (!cleanContent) {
        console.warn('[Generator] Content became empty after cleaning. Original length:', content.length);
        throw new Error('Content became empty after markdown removal');
      }

      // ========== 🔧 POST-PROCESSING FIXES ==========
      cleanContent = this.postProcessCode(cleanContent, fileSpec);

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
   * 🔧 後處理：修復 AI 生成的常見錯誤
   */
  postProcessCode(code, fileSpec) {
    const filePath = fileSpec.path || '';
    let fixed = code;
    const fixes = [];

    // 1. 修復 Electron main.js 中錯誤引用 config.js
    if (filePath.includes('main.js') || filePath.endsWith('main.js')) {
      // 移除 require('./config')
      if (fixed.includes("require('./config')") || fixed.includes('require("./config")')) {
        fixed = fixed.replace(/const\s+config\s*=\s*require\(['"]\.\/config['"]\);?\n?/g, '');
        fixed = fixed.replace(/const\s*{\s*[\w,\s]+\s*}\s*=\s*require\(['"]\.\/config['"]\);?\n?/g, '');
        fixes.push('Removed invalid require("./config") - config.js is a frontend file');
      }
      
      // 移除 config.xxx 的使用
      fixed = fixed.replace(/config\.enableDevTools/g, 'false');
      fixed = fixed.replace(/config\.settings\.defaultWindowSize\.width/g, '800');
      fixed = fixed.replace(/config\.settings\.defaultWindowSize\.height/g, '600');
      fixed = fixed.replace(/config\.width/g, '800');
      fixed = fixed.replace(/config\.height/g, '600');
      
      if (fixed !== code && !fixes.includes('Replaced config.xxx references')) {
        fixes.push('Replaced config.xxx references with hardcoded values');
      }
    }

    // 2. 檢測空函數體並警告
    const emptyFunctionPattern = /(?:async\s+)?function\s+\w+\([^)]*\)\s*\{\s*(?:\/\/[^\n]*\n?\s*)*\}/g;
    const emptyArrowPattern = /\w+\s*=\s*(?:async\s+)?\([^)]*\)\s*=>\s*\{\s*(?:\/\/[^\n]*\n?\s*)*\}/g;
    
    if (emptyFunctionPattern.test(fixed) || emptyArrowPattern.test(fixed)) {
      console.warn('[PostProcess] ⚠️ Detected empty function bodies in generated code');
      fixes.push('WARNING: Empty function bodies detected - may need manual fix');
    }

    // 3. 確保沒有 markdown 殘留
    fixed = fixed.replace(/^```\w*\n/gm, '');
    fixed = fixed.replace(/\n```$/gm, '');

    if (fixes.length > 0) {
      console.log('[PostProcess] Applied fixes:', fixes);
    }

    return fixed;
  }

  /**
   * 將 IPC channel 名稱轉換為駝峰式方法名
   * 例如: 'add-task' -> 'addTask', 'get-suggestion' -> 'getSuggestion'
   */
  channelToMethodName(channel) {
    return channel.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  async generateWithMock({ skeleton, fileSpec, context }) {
    const { description } = fileSpec;

    const content = `// Mock fallback - Configure CLOUD_API_ENDPOINT for real generation
// ${description || 'JavaScript code'}

document.addEventListener('DOMContentLoaded', () => {
    console.log('Application loaded (mock fallback)');
    console.log('Configure CLOUD_API_ENDPOINT for full functionality');
});
`;

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

    let prompt = `Generate JavaScript for: ${filePath}\n\n`;

    // ========== 🔴 STEP 1: CONTRACTS FIRST (最重要，放最前面) ==========
    if (contracts && (contracts.dom || contracts.api)) {
      prompt += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `🚨 CRITICAL: YOU MUST USE THESE EXACT IDs AND CHANNELS 🚨\n`;
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      // DOM Elements
      if (contracts.dom && contracts.dom.length > 0) {
        // 🔥 修復：過濾邏輯太嚴格，改為寬鬆模式
        // 如果有匹配當前檔案的 DOM，優先顯示；否則顯示全部
        const relevantDom = contracts.dom.filter(dom => {
          const consumers = dom.consumers || dom.accessedBy || [];
          // 如果 consumers 為空（HTML 剛生成，還沒有 JS 訪問記錄），也顯示
          return consumers.length === 0 || consumers.includes(filePath);
        });

        const domsToShow = relevantDom.length > 0 ? relevantDom : contracts.dom;
        prompt += `📋 DOM ELEMENTS (from HTML):\n`;
        domsToShow.forEach(dom => {
          prompt += `   getElementById('${dom.id}')  // ${dom.type} - ${dom.purpose}\n`;
        });
        prompt += `\n❌ DO NOT use: 'data-input', 'action-button', 'response-display'\n`;
        prompt += `✅ USE ONLY the IDs listed above\n\n`;
      }

      // IPC Channels
      if (contracts.api && contracts.api.length > 0) {
        // 🔥 修復：寬鬆過濾，如果 consumers 為空也顯示
        const relevantApis = contracts.api.filter(api => {
          const consumers = api.consumers || [];
          const producers = api.producers || [];
          // 顯示此檔案是 consumer 或 producer 的 API，或者 consumers 為空的 API
          return consumers.length === 0 || 
                 consumers.includes(filePath) || 
                 producers.includes(filePath);
        });

        if (relevantApis.length > 0) {
          const isElectronIPC = relevantApis.some(api => api.method === 'ipc-handle');
          
          if (isElectronIPC) {
            prompt += `📡 IPC CHANNELS (Electron):\n\n`;
            relevantApis.forEach(api => {
              const methodName = this.channelToMethodName(api.endpoint);
              
              // 格式化 request schema
              let requestStr = '';
              if (api.requestSchema && api.requestSchema.properties) {
                const params = Object.entries(api.requestSchema.properties).map(([key, val]) => {
                  const required = api.requestSchema.required?.includes(key) ? '' : '?';
                  return `${key}${required}: ${val.type}`;
                }).join(', ');
                requestStr = params || 'void';
              } else {
                requestStr = 'void';
              }
              
              // 格式化 response schema
              let responseStr = '';
              if (api.responseSchema) {
                if (api.responseSchema.type === 'array') {
                  const itemProps = api.responseSchema.items?.properties;
                  if (itemProps) {
                    const fields = Object.keys(itemProps).join(', ');
                    responseStr = `Array<{${fields}}>`;
                  } else {
                    responseStr = 'Array';
                  }
                } else if (api.responseSchema.type === 'object') {
                  const fields = Object.keys(api.responseSchema.properties || {}).join(', ');
                  responseStr = `{${fields}}`;
                } else {
                  responseStr = api.responseSchema.type;
                }
              } else {
                responseStr = 'void';
              }
              
              prompt += `   ✅ ${methodName}(${requestStr}) -> ${responseStr}\n`;
              prompt += `      Purpose: ${api.purpose}\n`;
              
              // 顯示詳細的 request/response 格式
              if (api.requestSchema && api.requestSchema.properties) {
                prompt += `      Request: ${JSON.stringify(api.requestSchema.properties, null, 2).replace(/\n/g, '\n             ')}\n`;
              }
              if (api.responseSchema) {
                const schemaStr = JSON.stringify(api.responseSchema, null, 2).replace(/\n/g, '\n             ');
                prompt += `      Response: ${schemaStr}\n`;
              }
              prompt += `\n`;
            });
            prompt += `❌ DO NOT use: fetch() or HTTP requests\n`;
            prompt += `✅ USE ONLY window.electronAPI methods with EXACT signatures above\n\n`;
          }
        }
      }

      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    }

    if (description) {
      prompt += `Description: ${description}\n\n`;
    }

    // ========== RAG Knowledge Base (Context Injection) ==========
    const dependencies = context.dependencies || [];
    if (dependencies.length > 0) {
      prompt += `\n📚 RAG KNOWLEDGE BASE (Dependency Context)\n`;
      prompt += `You have access to the following 'Reference Library'. \n`;
      prompt += `BEFORE writing any code, RETRIEVE the function signatures from this library to ensure 100% correct usage.\n\n`;

      dependencies.forEach(dep => {
        prompt += `### Reference: ${path.basename(dep.path)}\n`;
        // 🔥 Use Interface Extraction instead of raw code
        let contentToInject = dep.content
          ? this.extractInterface(dep.content)
          : '// Content not available';

        if (contentToInject.length > 3000) {
          contentToInject = contentToInject.substring(0, 3000) + '\n// ... (truncated)';
        }
        prompt += `\`\`\`${dep.language || 'javascript'}\n${contentToInject}\n\`\`\`\n\n`;
      });

      prompt += `USAGE RULES:\n`;
      prompt += `1. SEARCH for any function you intend to call in the Reference above.\n`;
      prompt += `2. VERIFY the number of arguments and their types.\n`;
      prompt += `3. CALL the function exactly as defined.\n`;
      prompt += `4. If an imported function is NOT in the reference, do NOT invent it. Use available alternatives or mock it.\n\n`;
    }

    // ========== 自動檢測：window.APP_CONFIG 使用規範 ==========
    const hasConfigJs = allFiles.some(f => f.path === 'config.js' || f.path.endsWith('/config.js'));

    if (hasConfigJs) {
      prompt += `🔴 MANDATORY: API CONFIGURATION PATTERN\n`;
      prompt += `You MUST read API base URL from window.APP_CONFIG:\n\n`;
      prompt += `const API_ROOT = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) \n`;
      prompt += `  ? window.APP_CONFIG.API_BASE_URL \n`;
      prompt += `  : '/api';  // Fallback if config not loaded\n\n`;
      prompt += `Then construct specific endpoints:\n`;
      prompt += `const API_BASE_URL = API_ROOT.replace(/\\/$/, '') + '/specific-resource';\n`;
      prompt += `// Example: '/api/expenses', '/api/users', etc.\n\n`;
      prompt += `❌ FORBIDDEN: Do NOT hardcode URLs like 'http://localhost:3000'\n`;
      prompt += `❌ FORBIDDEN: Do NOT use fetch('http://...') with absolute URLs\n`;
      prompt += `✅ CORRECT: Use relative paths or API_BASE_URL variable\n\n`;
    }

    // ========== 自動檢測：過濾器處理規範 ==========
    const hasFilterDropdown = skeleton && skeleton.includes('option value="all"');
    const isFilterRelated = description && description.toLowerCase().includes('filter');

    if (hasFilterDropdown || isFilterRelated) {
      prompt += `🔴 FILTER HANDLING STANDARD:\n`;
      prompt += `When building filter query parameters:\n`;
      prompt += `1. Check if value is meaningful before adding to query\n`;
      prompt += `2. Skip empty strings, null, undefined\n`;
      prompt += `3. Skip sentinel values like "all", "none", "any"\n\n`;
      prompt += `Example:\n`;
      prompt += `const filters = {};\n`;
      prompt += `if (categoryFilter.value && categoryFilter.value !== 'all') {\n`;
      prompt += `  filters.category = categoryFilter.value;\n`;
      prompt += `}\n`;
      prompt += `if (startDateFilter.value) {  // Skip empty strings\n`;
      prompt += `  filters.startDate = startDateFilter.value;\n`;
      prompt += `}\n`;
      prompt += `// Then pass to API: fetchData(filters)\n\n`;
    }

    // ========== DOM 查詢防禦性編程（總是應用）==========
    prompt += `🔴 DOM ELEMENT ACCESS STANDARD:\n`;
    prompt += `ALWAYS add null checks after querySelector/getElementById:\n\n`;
    prompt += `const element = document.getElementById('some-id');\n`;
    prompt += `if (!element) {\n`;
    prompt += `  console.error('Required element #some-id not found');\n`;
    prompt += `  return;  // or handle gracefully\n`;
    prompt += `}\n`;
    prompt += `// Now safe to use element\n\n`;

    // ========== 自動檢測：Modal 顯示規範 ==========
    const hasModal = skeleton && skeleton.toLowerCase().includes('modal');
    const isModalRelated = description && description.toLowerCase().includes('modal');

    if (hasModal || isModalRelated) {
      prompt += `🔴 MODAL DISPLAY STANDARD:\n`;
      prompt += `Use consistent class and attribute toggling:\n\n`;
      prompt += `function openModal(modalElement) {\n`;
      prompt += `  modalElement.classList.add('is-active');\n`;
      prompt += `  modalElement.removeAttribute('hidden');\n`;
      prompt += `}\n\n`;
      prompt += `function closeModal(modalElement) {\n`;
      prompt += `  modalElement.classList.remove('is-active');\n`;
      prompt += `  modalElement.setAttribute('hidden', '');\n`;
      prompt += `}\n\n`;
      prompt += `The CSS must use: #modal-id.is-active { display: flex; }\n\n`;
    }

    if (requirements.length > 0) {
      prompt += `Additional Requirements:\n${requirements.map(r => `- ${r}`).join('\n')}\n\n`;
    }

    // Include HTML structure if available
    const htmlFiles = completedFiles.filter(f => f.language === 'html');
    if (htmlFiles.length > 0) {
      prompt += `HTML files exist - write JavaScript to interact with their DOM elements\n\n`;
    }

    if (skeleton) {
      prompt += `Skeleton:\n\`\`\`javascript\n${skeleton}\n\`\`\`\n\n`;
    }

    prompt += `Generate complete, production-ready JavaScript with:\n`;
    prompt += `- Modern ES6+ syntax\n`;
    prompt += `- Event listeners matching HTML structure\n`;
    prompt += `- Error handling and input validation\n`;
    prompt += `- Clean, maintainable code structure\n`;
    prompt += `- CRITICAL: All selectors (querySelector, getElementById) MUST match HTML attributes exactly\n`;
    prompt += `- CRITICAL: When reading element.innerText, button.value, or data attributes, handle the EXACT values from HTML\n`;
    prompt += `- CRITICAL: Function names and event handlers must match skeleton signatures\n`;
    if (contracts) {
      prompt += `- CRITICAL: Follow contract structures EXACTLY - no field name changes allowed\n`;
    }
    prompt += `- If HTML uses specific symbols/strings, your logic must handle those exact values\n\n`;

    prompt += `📦 EXPORT MANDATE (CRITICAL - Universal):\n`;
    prompt += `At the very end of the file, check if 'module' exists before exporting (to support both Browser and Node.js testing).\n`;
    prompt += `Pattern:\n`;
    prompt += `if (typeof module !== 'undefined' && module.exports) {\n`;
    prompt += `    module.exports = { functionName1, functionName2, ... };\n`;
    prompt += `}\n`;
    prompt += `DO NOT use 'export default' or 'export const'. This ensures the code is testable without breaking the browser.\n\n`;

    // ========== 🔴 FINAL MANDATORY RULES (CANNOT BE IGNORED) ==========
    prompt += `\n🔴🔴🔴 FINAL MANDATORY RULES - READ CAREFULLY 🔴🔴🔴\n\n`;
    
    // 針對 Electron main.js 的特殊規則
    if (filePath.includes('main.js') || filePath.endsWith('main.js')) {
      prompt += `⛔ ELECTRON MAIN PROCESS RULES (you are generating main.js):\n`;
      prompt += `1. NEVER write: const config = require('./config') - config.js uses window.APP_CONFIG which doesn't exist in Node.js\n`;
      prompt += `2. NEVER write: if (config.enableDevTools) - config object doesn't have this property\n`;
      prompt += `3. ALWAYS implement FULL function bodies - empty functions like handleGetTasks() { } will crash the app\n`;
      prompt += `4. Use hardcoded values: width: 800, height: 600 (NOT config.width)\n`;
      prompt += `5. For IPC handlers, write COMPLETE implementations with fs.readFile/writeFile\n\n`;
    }
    
    // 針對 renderer script 的規則
    if (filePath.includes('public/') || filePath.includes('renderer')) {
      prompt += `⛔ RENDERER PROCESS RULES (you are generating frontend JavaScript):\n`;
      prompt += `1. Use window.electronAPI (exposed by preload.js) for IPC calls\n`;
      prompt += `2. Match DOM IDs EXACTLY with index.html - if HTML has id="taskInput", use getElementById('taskInput')\n`;
      prompt += `3. ALWAYS implement FULL function bodies with real logic\n\n`;
    }
    
    prompt += `⛔ UNIVERSAL RULES (apply to ALL files):\n`;
    prompt += `1. Every function MUST have COMPLETE working code inside - no empty bodies\n`;
    prompt += `2. NO comments like "// implementation omitted" or "// TODO"\n`;
    prompt += `3. NO placeholder code - write real, working implementations\n`;
    prompt += `4. If you don't know the exact implementation, make reasonable assumptions\n\n`;

    prompt += `Return ONLY the code, no markdown.`;

    return prompt;
  }

  /**
   * RAG Optimization: Extract code interface (signatures + comments)
   * Drastically reduces token usage and removes implementation noise.
   */
  extractInterface(code) {
    if (!code) return '';

    // Simple regex-based interface extractor
    // 1. Preserve exports, classes, functions, and comments
    // 2. Hide function bodies { ... }

    let interfaceCode = code;

    // Replace function bodies with comments
    // Note: Accurate parsing requires AST, here we use robust heuristics for speed

    // Remove implementation inside { ... } which are indented (likely method bodies)
    // This is a conservative heuristic to separate methods from class definitions

    // 1. Remove obvious function bodies
    interfaceCode = interfaceCode.replace(/(\) \s*\{)[\s\S]*?(\n\})/g, '$1 /* implementation hidden */ }');

    // 2. Truncate very long lines (likely data or compressed code)
    interfaceCode = interfaceCode.split('\n').map(line => {
      if (line.length > 200) return line.substring(0, 200) + '...';
      return line;
    }).join('\n');

    // 3. Keep imports/exports/JSDoc/Comments
    // (Already kept by default unless replaced)

    return interfaceCode;
  }
}

module.exports = ScriptGenerator;
