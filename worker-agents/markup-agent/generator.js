/**
 * Markup Generator
 * 主要依賴雲端 API 生成 HTML，fallback 到簡單模擬
 */

const path = require('path');
const { callCloudAPI } = require('../api-adapter');

class MarkupGenerator {
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

  /**
   * 雲端 API 生成
   */
  async generateWithCloudAPI({ skeleton, fileSpec, context }) {
    const prompt = this.buildPrompt({ skeleton, fileSpec, context });
    
    try {
      const { content, tokensUsed } = await callCloudAPI({
        endpoint: this.cloudApiEndpoint,
        apiKey: this.cloudApiKey,
        systemPrompt: 'You are an expert HTML developer. Generate clean, semantic HTML based on requirements. Output only the code.',
        userPrompt: prompt,
        maxTokens: 16384  // Increased from 8192 to prevent truncation
      });
      
      // 檢查 API 是否真的返回了內容
      if (!content || content.trim() === '') {
        console.warn('[Generator] API returned empty content despite consuming tokens:', tokensUsed);
        throw new Error('API returned empty content (possibly blocked by safety filters)');
      }
      
      const cleanContent = content
        .replace(/^```html\n/, '')
        .replace(/^```\n/, '')
        .replace(/\n```$/, '')
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
    
    if (description) {
      prompt += `Description: ${description}\n\n`;
    }
    
    if (requirements.length > 0) {
      prompt += `Requirements:\n${requirements.map(r => `- ${r}`).join('\n')}\n\n`;
    }
    
    // ← 新增：如果有 contracts，顯示相關資訊
    if (contracts) {
      prompt += `=== CONTRACTS (MUST FOLLOW EXACTLY) ===\n`;
      
      // ✨ DOM contracts - 最重要！定義必須存在的 HTML 元素
      if (contracts.dom && contracts.dom.length > 0) {
        const relevantDom = contracts.dom.filter(dom => 
          dom.producers.includes(filePath)
        );
        
        if (relevantDom.length > 0) {
          prompt += `\n⚠️ CRITICAL: DOM STRUCTURE REQUIREMENTS ⚠️\n`;
          prompt += `The following elements are MANDATORY and will be queried by JavaScript:\n`;
          prompt += `Missing ANY of these will cause JavaScript errors!\n\n`;
          
          relevantDom.forEach((dom, idx) => {
            prompt += `DOM Contract #${idx + 1}: ${dom.description}\n`;
            
            if (dom.templateId) {
              prompt += `  Template ID: #${dom.templateId}\n`;
            }
            if (dom.containerId) {
              prompt += `  Container ID: #${dom.containerId}\n`;
            }
            
            prompt += `  Required Elements:\n`;
            dom.requiredElements.forEach(elem => {
              prompt += `    • ${elem.selector} <${elem.element}>\n`;
              prompt += `      Purpose: ${elem.purpose}\n`;
              if (elem.attributes) {
                prompt += `      Attributes: ${JSON.stringify(elem.attributes)}\n`;
              }
              prompt += `      Used by: ${elem.consumers.join(', ')}\n`;
            });
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
