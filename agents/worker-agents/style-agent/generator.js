/**
 * Style Generator - 簡化版本
 * 只包含雲端 API 調用和簡單 fallback
 */

const path = require('path');
const { callCloudAPI } = require('../api-adapter.cjs');

class StyleGenerator {
  constructor(config = {}) {
    // API 配置優先順序：1. config 參數 2. CLOUD_API 3. OPENAI_API
    this.cloudApiEndpoint = config.cloudApiEndpoint;
    this.cloudApiKey = config.cloudApiKey;
    this.useMockApi = !this.cloudApiEndpoint;
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
    }    // 優先級 3: AI 生成（無 contracts 也無 template）
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
        systemPrompt: 'You are an expert CSS developer. Generate clean, modern CSS with proper organization. Output only the code.',
        userPrompt: prompt,
        maxTokens: 16348  // Increased to 16k as requested
      });

      if (!content || content.trim() === '') {
        console.warn('[Generator] API returned empty content despite consuming tokens:', tokensUsed);
        throw new Error('API returned empty content (possibly blocked by safety filters)');
      }

      const cleanContent = content
        .replace(/^```css\n/, '')
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
      return this.generateWithMock({ skeleton, fileSpec, context });
    }
  }

  async generateWithMock({ skeleton, fileSpec, context }) {
    const { description } = fileSpec;

    const content = `/* Mock fallback - Configure CLOUD_API_ENDPOINT for real generation */
/* ${description || 'Styles'} */

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    line-height: 1.6;
    color: #333;
}
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

    let prompt = `Generate CSS for: ${filePath}\n\n`;

    // 🚨 CONTRACTS FIRST - 顯示需要樣式化的 DOM 元素
    if (contracts && contracts.dom && contracts.dom.length > 0) {
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `🚨 CRITICAL: DOM ELEMENTS TO STYLE 🚨\n`;
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      prompt += `The following selectors MUST have CSS rules:\n\n`;

      contracts.dom.forEach((dom, idx) => {
        if (dom.id) {
          prompt += `  ${idx + 1}. #${dom.id} - ${dom.description || dom.purpose}\n`;
        }
        if (dom.templateId) {
          prompt += `  ${idx + 1}. #${dom.templateId} (template)\n`;
        }
        if (dom.containerId) {
          prompt += `     #${dom.containerId} (container)\n`;
        }
      });

      prompt += `\n❌ FAILURE CONDITIONS:\n`;
      prompt += `  - Missing styles for any ID listed above\n`;
      prompt += `  - Using wrong selector (e.g., .class instead of #id)\n\n`;

      prompt += `✅ REQUIREMENTS:\n`;
      prompt += `  - Style ALL IDs listed above\n`;
      prompt += `  - Use exact selectors from HTML\n`;
      prompt += `  - Include interactive states (hover, focus, active)\n\n`;

      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `END OF CONTRACTS\n`;
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    }

    if (description) {
      prompt += `Description: ${description}\n\n`;
    }

    // ========== 自動檢測：Modal 樣式標準 ==========
    const hasModalInSkeleton = skeleton && skeleton.toLowerCase().includes('modal');
    const hasModalInDescription = description && description.toLowerCase().includes('modal');
    const hasModalInFiles = allFiles.some(f =>
      (f.description && f.description.toLowerCase().includes('modal')) ||
      (f.path.toLowerCase().includes('modal'))
    );

    if (hasModalInSkeleton || hasModalInDescription || hasModalInFiles) {
      prompt += `🔴 MANDATORY: MODAL STYLING STANDARD\n`;
      prompt += `All modals MUST follow this pattern:\n\n`;

      prompt += `1. Base modal state (hidden):\n`;
      prompt += `   #modal-id {\n`;
      prompt += `       display: none;\n`;
      prompt += `       position: fixed;\n`;
      prompt += `       top: 0;\n`;
      prompt += `       left: 0;\n`;
      prompt += `       width: 100%;\n`;
      prompt += `       height: 100%;\n`;
      prompt += `       background: rgba(0, 0, 0, 0.5);\n`;
      prompt += `       z-index: 1000;\n`;
      prompt += `   }\n\n`;

      prompt += `2. Active modal state (visible):\n`;
      prompt += `   #modal-id.is-active {\n`;
      prompt += `       display: flex;\n`;
      prompt += `       align-items: center;\n`;
      prompt += `       justify-content: center;\n`;
      prompt += `   }\n\n`;

      prompt += `3. Modal content container:\n`;
      prompt += `   .modal-content {\n`;
      prompt += `       background: white;\n`;
      prompt += `       padding: 2rem;\n`;
      prompt += `       border-radius: 8px;\n`;
      prompt += `       max-width: 500px;\n`;
      prompt += `       width: 90%;\n`;
      prompt += `   }\n\n`;

      prompt += `❌ FORBIDDEN:\n`;
      prompt += `  - Do NOT use class .modal--visible or .show\n`;
      prompt += `  - Do NOT use display: block for active state\n`;
      prompt += `  - MUST use .is-active class (JavaScript toggles this)\n\n`;

      prompt += `✅ This ensures consistency with JavaScript modal handlers\n\n`;
    }

    if (requirements.length > 0) {
      prompt += `Additional Requirements:\n${requirements.map(r => `- ${r}`).join('\n')}\n\n`;
    }

    // Include HTML selectors if available - check both completed files AND skeletons
    const htmlFiles = completedFiles.filter(f => f.language === 'html');
    
    // 🔥 CRITICAL: Also check allFiles for HTML files and their skeletons
    const allHtmlFiles = (allFiles || []).filter(f => 
      f.path && (f.path.endsWith('.html') || f.path.endsWith('.htm'))
    );
    
    // 從 allSkeletons 中獲取 HTML 骨架內容
    const allSkeletons = context.allSkeletons || {};
    const htmlSkeletons = allHtmlFiles
      .map(f => ({ path: f.path, content: allSkeletons[f.path] || skeleton }))
      .filter(s => s.content);
    
    // 合併已完成的 HTML 和骨架中的 HTML
    const allHtmlSources = [...htmlFiles, ...htmlSkeletons];
    
    if (allHtmlSources.length > 0) {
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `🔴 CRITICAL: HTML STRUCTURE ANALYSIS 🔴\n`;
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      
      // 從 HTML 文件中提取所有的 ID 和 class
      const allIds = new Set();
      const allClasses = new Set();
      
      allHtmlSources.forEach(htmlFile => {
        const content = htmlFile.content || '';
        
        // 提取所有 id="..."
        const idMatches = content.matchAll(/id=["']([^"']+)["']/g);
        for (const match of idMatches) {
          allIds.add(match[1]);
        }
        
        // 提取所有 class="..."
        const classMatches = content.matchAll(/class=["']([^"']+)["']/g);
        for (const match of classMatches) {
          match[1].split(/\s+/).forEach(cls => {
            if (cls.trim()) allClasses.add(cls.trim());
          });
        }
      });
      
      if (allIds.size > 0) {
        prompt += `IDs found in HTML (MUST style these with #id selector):\n`;
        Array.from(allIds).forEach(id => {
          prompt += `  - #${id}\n`;
        });
        prompt += `\n`;
      }
      
      if (allClasses.size > 0) {
        prompt += `Classes found in HTML (MUST style these with .class selector):\n`;
        Array.from(allClasses).forEach(cls => {
          prompt += `  - .${cls}\n`;
        });
        prompt += `\n`;
      }
      
      prompt += `🚨 CRITICAL RULES:\n`;
      prompt += `1. Every ID and class listed above MUST have CSS rules\n`;
      prompt += `2. Use EXACT selectors: #id for IDs, .class for classes\n`;
      prompt += `3. DO NOT invent selectors that don't exist in HTML\n`;
      prompt += `4. DO NOT use wrong selector type (e.g., .id instead of #id)\n`;
      prompt += `5. If HTML has #calculator-container, use #calculator-container NOT .calculator-grid\n\n`;
      
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    }

    if (skeleton) {
      prompt += `Skeleton:\n\`\`\`css\n${skeleton}\n\`\`\`\n\n`;
    }

    prompt += `Generate complete, production-ready CSS with:\n`;
    prompt += `- Modern layout techniques (Flexbox/Grid)\n`;
    prompt += `- Responsive design (mobile-first approach)\n`;
    prompt += `- Consistent color scheme and typography\n`;
    prompt += `- Interactive states (hover, focus, active)\n`;
    prompt += `- CRITICAL: All selectors (.class, #id, [data-*]) MUST match HTML attributes exactly\n`;
    prompt += `- CRITICAL: Every class used in HTML must have corresponding CSS rules\n`;
    prompt += `- Ensure visual hierarchy matches the application's purpose\n\n`;
    prompt += `Return ONLY the code, no markdown.`;

    return prompt;
  }
}

module.exports = StyleGenerator;
