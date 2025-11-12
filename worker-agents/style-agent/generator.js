/**
 * Style Generator - 簡化版本
 * 只包含雲端 API 調用和簡單 fallback
 */

const path = require('path');
const { callCloudAPI } = require('../api-adapter');

class StyleGenerator {
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
        systemPrompt: 'You are an expert CSS developer. Generate clean, modern CSS with proper organization. Output only the code.',
        userPrompt: prompt,
        maxTokens: 16384  // Increased from 8192 to prevent truncation
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
    const contracts = context.contracts || null;
    
    let prompt = `Generate CSS for: ${filePath}\n\n`;
    
    if (description) {
      prompt += `Description: ${description}\n\n`;
    }
    
    if (requirements.length > 0) {
      prompt += `Requirements:\n${requirements.map(r => `- ${r}`).join('\n')}\n\n`;
    }
    
    // ← 新增：contracts 對 CSS 影響較小，但可提示相關檔案
    if (contracts) {
      const allHtmlFiles = context.allFiles?.filter(f => f.path.endsWith('.html')) || [];
      if (allHtmlFiles.length > 0) {
        prompt += `Related HTML files: ${allHtmlFiles.map(f => f.path).join(', ')}\n`;
        prompt += `Ensure all HTML classes and IDs are styled.\n\n`;
      }
    }
    
    // Include HTML selectors if available
    const htmlFiles = completedFiles.filter(f => f.language === 'html');
    if (htmlFiles.length > 0) {
      prompt += `HTML files exist - style their elements appropriately\n\n`;
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
