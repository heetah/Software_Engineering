/**
 * Script Generator - 支援多種 LLM API
 */

const path = require('path');
const { callCloudAPI } = require('../api-adapter');
const API_STANDARDS = require('../../shared/api-standards.cjs');

class ScriptGenerator {
  constructor(config = {}) {
    this.cloudApiEndpoint = config.cloudApiEndpoint || process.env.CLOUD_API_ENDPOINT;
    this.cloudApiKey = config.cloudApiKey || process.env.CLOUD_API_KEY;
    this.useMockApi = !this.cloudApiEndpoint;
  }

  async generate({ skeleton, fileSpec, context }) {
    console.log(`[Generator] Processing ${fileSpec.path}`);
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
      
      // 移除所有 import/export 語句（瀏覽器不支援，除非使用 type="module"）
      cleanContent = cleanContent.replace(/^import\s+.*?from\s+['"].*?['"];?\s*$/gm, '');
      cleanContent = cleanContent.replace(/^export\s+.*?;?\s*$/gm, '');
      cleanContent = cleanContent.replace(/^export\s+default\s+.*?;?\s*$/gm, '');
      
      // 移除 process.env（瀏覽器不支援）
      cleanContent = cleanContent.replace(/process\.env\.\w+/g, 'undefined');
      
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
    const contracts = context.contracts || null;
    
    // 判斷是否是後端檔案（Express 伺服器）
    const skeletonStr = typeof skeleton === 'string' ? skeleton : '';
    const isBackendFile = !filePath.includes('public/') && 
                          (filePath.includes('index.js') || filePath.includes('server.js') || filePath.includes('app.js')) &&
                          (skeletonStr.includes('express') || skeletonStr.includes('require') || description?.toLowerCase().includes('server') || description?.toLowerCase().includes('backend'));
    
    // 優先使用 completedFiles（已完成的檔案），如果沒有則檢查 allSkeletons
    // 這確保 JavaScript 能看到已生成的 HTML 內容
    
    let prompt = `Generate JavaScript for: ${filePath}\n`;
    if (isBackendFile) {
      prompt += `(Backend Express Server)\n`;
    }
    prompt += `\n`;
    
    if (description) {
      prompt += `Description: ${description}\n\n`;
    }
    
    if (requirements.length > 0) {
      prompt += `Requirements:\n${requirements.map(r => `- ${r}`).join('\n')}\n\n`;
    }
    
    // ← 新增：如果有 contracts，優先顯示
    if (contracts) {
      prompt += `=== CONTRACTS (MUST FOLLOW EXACTLY) ===\n`;
      
      // ✨ DOM contracts - JavaScript 必須遵守的 DOM 查詢規則
      if (contracts.dom && contracts.dom.length > 0) {
        const relevantDom = contracts.dom.filter(dom => 
          dom.consumers.includes(filePath)
        );
        
        if (relevantDom.length > 0) {
          prompt += `\n⚠️ CRITICAL: DOM ELEMENTS GUARANTEED BY HTML ⚠️\n`;
          prompt += `These elements are GUARANTEED to exist in the HTML:\n\n`;
          
          relevantDom.forEach((dom, idx) => {
            prompt += `DOM Contract #${idx + 1}: ${dom.description}\n`;
            
            if (dom.templateId) {
              prompt += `  Template: #${dom.templateId}\n`;
            }
            if (dom.containerId) {
              prompt += `  Container: #${dom.containerId}\n`;
            }
            
            prompt += `  Available Elements:\n`;
            dom.requiredElements.forEach(elem => {
              prompt += `    • ${elem.selector} <${elem.element}> - ${elem.purpose}\n`;
              if (elem.attributes) {
                prompt += `      Has attributes: ${JSON.stringify(elem.attributes)}\n`;
              }
            });
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
    
    // Include HTML structure if available - CRITICAL for matching selectors
    const htmlFiles = completedFiles.filter(f => f.language === 'html' || f.path.endsWith('.html'));
    if (htmlFiles.length > 0) {
      prompt += `\n=== EXISTING HTML STRUCTURE (MUST MATCH) ===\n`;
      htmlFiles.forEach(htmlFile => {
        prompt += `\nHTML File: ${htmlFile.path}\n`;
        prompt += `Content:\n\`\`\`html\n${htmlFile.content}\n\`\`\`\n`;
        prompt += `\nCRITICAL: Your JavaScript MUST:\n`;
        prompt += `1. Use selectors that match the EXACT HTML structure above\n`;
        prompt += `2. Match class names, IDs, data-* attributes exactly\n`;
        prompt += `3. Handle button clicks, form submissions, etc. based on the HTML above\n`;
        prompt += `4. Do NOT create selectors for elements that don't exist in the HTML\n`;
      });
      prompt += `=== END HTML STRUCTURE ===\n\n`;
    } else {
      // 如果 HTML 還沒生成，檢查 allFiles 中的 HTML 骨架
      const allFiles = context.allFiles || [];
      const htmlSkeletons = allFiles.filter(f => f.path.endsWith('.html') || f.path.endsWith('.htm'));
      if (htmlSkeletons.length > 0) {
        prompt += `\n=== HTML FILES TO BE GENERATED (reference for structure) ===\n`;
        htmlSkeletons.forEach(htmlFile => {
          prompt += `HTML File: ${htmlFile.path}\n`;
          if (htmlFile.description) {
            prompt += `Description: ${htmlFile.description}\n`;
          }
          // 檢查是否有對應的骨架
          const htmlSkeleton = context.allSkeletons?.[htmlFile.path];
          if (htmlSkeleton) {
            prompt += `Skeleton:\n\`\`\`html\n${htmlSkeleton}\n\`\`\`\n`;
          }
        });
        prompt += `\nNote: Generate JavaScript that will work with the HTML structure described above.\n`;
        prompt += `=== END HTML FILES ===\n\n`;
      }
    }
    
    if (skeleton) {
      prompt += `Skeleton:\n\`\`\`javascript\n${skeleton}\n\`\`\`\n\n`;
    }
    
    // 獲取使用者需求以生成對應功能
    // 優先使用 context 中的完整用戶需求，而不是僅依賴文件描述
    const userRequirement = context.userRequirement || context.projectSummary || fileSpec.description || '';
    const projectRequirements = context.projectRequirements || [];
    const isCalculator = userRequirement.toLowerCase().includes('calculator') || 
                        userRequirement.toLowerCase().includes('計算') ||
                        userRequirement.toLowerCase().includes('計算機') ||
                        fileSpec.description?.toLowerCase().includes('calculator') ||
                        fileSpec.description?.toLowerCase().includes('計算');
    
    // 在 prompt 開頭添加用戶需求
    if (userRequirement && userRequirement !== fileSpec.description) {
      prompt = `=== USER REQUIREMENT ===\n${userRequirement}\n\n${projectRequirements.length > 0 ? `=== PROJECT REQUIREMENTS ===\n${projectRequirements.join('\n')}\n\n` : ''}${prompt}`;
    }
    
    prompt += `Generate complete, production-ready JavaScript with:\n`;
    prompt += `- Modern ES6+ syntax (NO import/export, use plain script)\n`;
    prompt += `- NO process.env (browser doesn't support it)\n`;
    prompt += `- Event listeners matching HTML structure EXACTLY\n`;
    prompt += `- Error handling and input validation\n`;
    prompt += `- Clean, maintainable code structure\n`;
    prompt += `- CRITICAL: All selectors (querySelector, getElementById) MUST match HTML attributes exactly\n`;
    prompt += `- CRITICAL: When reading element.innerText, button.value, or data attributes, handle the EXACT values from HTML\n`;
    prompt += `- CRITICAL: Function names and event handlers must match skeleton signatures\n`;
    prompt += `- CRITICAL: The code MUST implement the user requirement: "${userRequirement}"\n`;
    prompt += `- CRITICAL: Do NOT generate generic template code - implement the SPECIFIC functionality requested by the user\n`;
    
    if (isCalculator && htmlFiles.length > 0) {
      prompt += `\n🔢 CALCULATOR-SPECIFIC REQUIREMENTS (HIGHEST PRIORITY):\n`;
      prompt += `The user requirement is to build a CALCULATOR. You MUST implement:\n`;
      prompt += `1. Complete calculator logic:\n`;
      prompt += `   - Number buttons (0-9) append digits to display\n`;
      prompt += `   - Operator buttons (+, -, *, /) store operator and previous number\n`;
      prompt += `   - Equals button (=) performs calculation and displays result\n`;
      prompt += `   - Clear button (C) resets calculator to initial state\n`;
      prompt += `   - Decimal point (.) adds decimal to current number\n`;
      prompt += `   - Handle chained operations (e.g., 2 + 3 * 4)\n`;
      prompt += `   - Prevent division by zero and other invalid operations\n`;
      prompt += `2. Display management:\n`;
      prompt += `   - Update display element (#calculatorDisplay or .calculator-display) with current input/result\n`;
      prompt += `   - Format numbers appropriately (handle decimals, large numbers)\n`;
      prompt += `3. State management:\n`;
      prompt += `   - Track current number, previous number, and current operator\n`;
      prompt += `   - Handle edge cases (multiple decimal points, operator changes, etc.)\n`;
      prompt += `4. Use the EXACT selectors from the HTML above\n`;
      prompt += `5. If HTML uses data attributes (data-type, data-value), use those exact values\n`;
      prompt += `6. Make the calculator FULLY FUNCTIONAL - test your logic mentally before writing code\n\n`;
      prompt += `EXAMPLE: If HTML has <button data-type="number" data-value="7">, your code should:\n`;
      prompt += `  const buttons = document.querySelectorAll('[data-type="number"]');\n`;
      prompt += `  buttons.forEach(btn => btn.addEventListener('click', () => appendNumber(btn.dataset.value)));\n\n`;
    } else if (userRequirement && !isCalculator) {
      // 對於非計算機的需求，也要明確要求實現特定功能
      prompt += `\n🎯 USER REQUIREMENT IMPLEMENTATION:\n`;
      prompt += `The user wants: "${userRequirement}"\n`;
      prompt += `- Analyze the HTML structure above to understand what elements are available\n`;
      prompt += `- Implement the SPECIFIC functionality requested, not generic template code\n`;
      prompt += `- Make sure all interactive elements work as expected\n`;
      prompt += `- Connect frontend to backend APIs if needed (use window.APP_CONFIG for API URLs)\n\n`;
    }
    if (contracts) {
      prompt += `- CRITICAL: Follow contract structures EXACTLY - no field name changes allowed\n`;
    }
    prompt += `- If HTML uses specific symbols/strings, your logic must handle those exact values\n`;
    prompt += `- Ensure all functionality works correctly and handles edge cases\n`;
    
    // 後端檔案特殊要求
    if (isBackendFile) {
      prompt += `\nBACKEND SERVER REQUIREMENTS:\n`;
      prompt += `- MUST include express.json() middleware for parsing JSON\n`;
      prompt += `- MUST include express.static() to serve public directory\n`;
      prompt += `- MUST include API routes:\n`;
      prompt += `  * POST /api/calculate - Handle calculator calculations\n`;
      prompt += `  * Accept JSON body with calculation data\n`;
      prompt += `  * Return JSON response with result\n`;
      prompt += `  * Include proper error handling\n`;
      prompt += `- Example API route structure:\n`;
      prompt += `  app.post('/api/calculate', express.json(), (req, res) => {\n`;
      prompt += `    try {\n`;
      prompt += `      const { expression } = req.body;\n`;
      prompt += `      // Perform calculation safely\n`;
      prompt += `      const result = /* calculation logic */;\n`;
      prompt += `      res.json({ result });\n`;
      prompt += `    } catch (error) {\n`;
      prompt += `      res.status(400).json({ error: error.message });\n`;
      prompt += `    }\n`;
      prompt += `  });\n`;
      prompt += `- Ensure server starts on the port from config\n`;
      prompt += `- Include proper error handling for all routes\n\n`;
    }
    
    prompt += `Return ONLY the code, no markdown.`;
    
    return prompt;
  }
}

module.exports = ScriptGenerator;
