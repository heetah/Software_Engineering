/**
 * Script Generator - 支援多種 LLM API
 */

const path = require('path');
const { callCloudAPI } = require('../api-adapter.cjs');
const API_STANDARDS = require('../../shared/api-standards.cjs');

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
    
    // 優先級 1: 使用 contracts 結構（example2 格式）
    const hasContracts = context.contracts && (
      (context.contracts.dom && context.contracts.dom.length > 0) ||
      (context.contracts.api && context.contracts.api.length > 0)
    );
    
    if (hasContracts) {
      console.log(`[Generator] ✓ Using contracts-based generation (preferred method)`);
      console.log(`[Generator] Mode: ${this.useMockApi ? 'MOCK (Fallback)' : 'CLOUD API'}`);
      
      if (this.useMockApi) {
        return this.generateWithMock({ skeleton, fileSpec, context });
      } else {
        return this.generateWithCloudAPI({ skeleton, fileSpec, context });
      }
    }
    
    // 優先級 2: 使用 template（Architect 提供的完整代碼）
    if (fileSpec.template && fileSpec.template.trim()) {
      console.log(`[Generator] ⚠ Using template fallback (${fileSpec.template.length} chars)`);
      console.log(`[Generator] Note: Consider using contracts for better flexibility`);
      return {
        content: fileSpec.template,
        tokensUsed: 0,
        method: 'template'
      };
    }
    
    // 優先級 3: AI 生成（無 contracts 也無 template）
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
    
    try {
      const { content, tokensUsed } = await callCloudAPI({
        endpoint: this.cloudApiEndpoint,
        apiKey: this.cloudApiKey,
        systemPrompt: 'You are an expert JavaScript developer. Generate clean, modern JavaScript code following best practices. Output only the code.',
        userPrompt: prompt,
        maxTokens: 16384  // Increased from 8192 to prevent truncation
      });
      
      if (!content || content.trim() === '') {
        console.warn('[Generator] API returned empty content despite consuming tokens:', tokensUsed);
        throw new Error('API returned empty content (possibly blocked by safety filters)');
      }
      
      const cleanContent = content
        .replace(/^```javascript\n/, '')
        .replace(/^```js\n/, '')
        .replace(/^```\n/, '')
        .replace(/\n```$/, '')
        .trim();
      
      if (!cleanContent) {
        console.warn('[Generator] Content became empty after cleaning. Original length:', content.length);
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
    
    if (description) {
      prompt += `Description: ${description}\n\n`;
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
    
    // ← 新增：如果有 contracts，優先顯示
    if (contracts) {
      prompt += `=== CONTRACTS (MUST FOLLOW EXACTLY) ===\n`;
      
      // ✨ DOM contracts - JavaScript 必須遵守的 DOM 查詢規則
      if (contracts.dom && contracts.dom.length > 0) {
        const relevantDom = contracts.dom.filter(dom => {
          const consumers = dom.consumers || dom.accessedBy || [];
          return consumers.includes(filePath);
        });
        
        if (relevantDom.length > 0) {
          prompt += `\n⚠️ CRITICAL: DOM ELEMENTS GUARANTEED BY HTML ⚠️\n`;
          prompt += `These elements are GUARANTEED to exist in the HTML:\n\n`;
          
          relevantDom.forEach((dom, idx) => {
            prompt += `DOM Contract #${idx + 1}: ${dom.description || dom.purpose || `Element: ${dom.id}`}\n`;
            
            // Support simple format: { id, type, purpose, accessedBy }
            if (dom.id) {
              prompt += `  Element ID: #${dom.id}\n`;
              prompt += `  Element Type: <${dom.type}>\n`;
            }
            
            // Support complex format: { templateId, containerId, requiredElements }
            if (dom.templateId) {
              prompt += `  Template: #${dom.templateId}\n`;
            }
            if (dom.containerId) {
              prompt += `  Container: #${dom.containerId}\n`;
            }
            
            if (dom.requiredElements && dom.requiredElements.length > 0) {
              prompt += `  Available Elements:\n`;
              dom.requiredElements.forEach(elem => {
                prompt += `    • ${elem.selector} <${elem.element}> - ${elem.purpose}\n`;
                if (elem.attributes) {
                  prompt += `      Has attributes: ${JSON.stringify(elem.attributes)}\n`;
                }
              });
            }
            prompt += `\n`;
          });
          
          prompt += `DEFENSIVE PROGRAMMING RULES:\n`;
          prompt += `1. ALWAYS add null checks after querySelector:\n`;
          prompt += `   const elem = container.querySelector('.status-badge');\n`;
          prompt += `   if (!elem) {\n`;
          prompt += `     console.error('Required element .status-badge not found');\n`;
          prompt += `     return; // or handle gracefully\n`;
          prompt += `   }\n`;
          prompt += `2. Use the EXACT selectors listed above\n`;
          prompt += `3. Log meaningful errors if elements are missing\n`;
          prompt += `4. Never assume elements exist without checking\n\n`;
        }
      }
      
      // ============ API 強制規範 (簡潔版) ============
      prompt += `\n🔒 CRITICAL API RULES - MANDATORY:\n`;
      prompt += `${API_STANDARDS.STANDARD_JS_HEADER}\n`;
      prompt += `❌ FORBIDDEN (will cause errors):\n`;
      prompt += `   - const API_URL = 'http://localhost:3000/api'  // NO hardcoded ports!\n`;
      prompt += `   - const API_URL = process.env.REACT_APP_API_URL  // NO process.env in browser!\n`;
      prompt += `   - fetch('/api/weather/' + city)  // NO path parameters if contract uses query!\n`;
      prompt += `✅ REQUIRED:\n`;
      prompt += `   - const API_BASE_URL = window.APP_CONFIG?.API_BASE_URL || '/api';\n`;
      prompt += `   - fetch(\`\${API_BASE_URL}/weather?city=\${encodeURIComponent(city)}\`)  // Use query params\n`;
      prompt += `   - Always check if endpoint uses query params (?) or path params (/)\n\n`;
      
      // API contracts - 增強格式說明
      if (contracts.api && contracts.api.length > 0) {
        const relevantApis = contracts.api.filter(api => 
          api.consumers.includes(filePath) || api.producers.includes(filePath)
        );
        
        if (relevantApis.length > 0) {
          prompt += `📝 API Contract (MUST follow exactly):\n`;
          relevantApis.forEach(api => {
            prompt += `\n  Endpoint: ${api.endpoint}\n`;
            prompt += `  Description: ${api.description}\n`;
            
            // 分析 endpoint 格式
            const hasQueryParams = api.request && api.request.query;
            const hasPathParams = api.endpoint.includes(':') || api.endpoint.includes('<');
            
            if (hasQueryParams) {
              prompt += `  ⚠️  Uses QUERY PARAMETERS (e.g., /api/weather?city=Tokyo)\n`;
              prompt += `  Request Query:\n`;
              Object.entries(api.request.query).forEach(([key, value]) => {
                prompt += `    - ${key}: ${value}\n`;
              });
              prompt += `  Example: fetch(\`\${API_BASE_URL}/weather?city=\${encodeURIComponent(cityName)}\`)\n`;
            }
            
            if (hasPathParams) {
              prompt += `  ⚠️  Uses PATH PARAMETERS (e.g., /api/weather/:city)\n`;
              prompt += `  Example: fetch(\`\${API_BASE_URL}/weather/\${encodeURIComponent(cityName)}\`)\n`;
            }
            
            if (api.response) {
              prompt += `  Response Fields (use EXACT names):\n`;
              const responseStr = JSON.stringify(api.response, null, 4);
              prompt += `    ${responseStr.split('\n').join('\n    ')}\n`;
            }
          });
          prompt += `\n⚠️  CRITICAL: Use exact field names from contract. Wrong field = app breaks!\n\n`;
        }
      }
      
      // Event contracts
      if (contracts.events && contracts.events.length > 0) {
        const relevantEvents = contracts.events.filter(evt =>
          evt.emitters.some(e => e.includes(filePath)) || 
          evt.listeners.some(l => l.includes(filePath))
        );
        
        if (relevantEvents.length > 0) {
          prompt += `Custom Events:\n`;
          relevantEvents.forEach(evt => {
            prompt += `  ${evt.name}: ${JSON.stringify(evt.payload)}\n`;
          });
          prompt += `\n`;
        }
      }
      
      // Storage contracts
      if (contracts.storage && contracts.storage.length > 0) {
        const relevantStorage = contracts.storage.filter(store =>
          store.readers.some(r => r.includes(filePath)) ||
          store.writers.some(w => w.includes(filePath))
        );
        
        if (relevantStorage.length > 0) {
          prompt += `Storage:\n`;
          relevantStorage.forEach(store => {
            prompt += `  ${store.key} (${store.type}): ${JSON.stringify(store.schema)}\n`;
          });
          prompt += `\n`;
        }
      }
      
      // Module contracts
      if (contracts.modules && contracts.modules.length > 0) {
        const relevantModules = contracts.modules.filter(mod =>
          mod.importers.includes(filePath)
        );
        
        if (relevantModules.length > 0) {
          prompt += `Imported Modules:\n`;
          relevantModules.forEach(mod => {
            prompt += `  ${mod.name} from ${mod.file}\n`;
            prompt += `  Exports: ${JSON.stringify(mod.exports)}\n`;
          });
          prompt += `\n`;
        }
      }
      
      prompt += `=== END CONTRACTS ===\n\n`;
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
    prompt += `Return ONLY the code, no markdown.`;
    
    return prompt;
  }
}

module.exports = ScriptGenerator;
