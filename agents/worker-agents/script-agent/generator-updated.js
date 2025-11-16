/**
 * Script Generator - 支援多種 LLM API
 */

const path = require('path');
const { callCloudAPI } = require('../api-adapter');

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
        systemPrompt: 'You are an expert JavaScript developer. Generate clean, modern ES6+ JavaScript. Output only the code.',
        userPrompt: prompt,
        maxTokens: 4000
      });
      
      const cleanContent = content
        .replace(/^```javascript\n/, '')
        .replace(/^```js\n/, '')
        .replace(/^```\n/, '')
        .replace(/\n```$/, '')
        .trim();
      
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
    
    let prompt = `Generate JavaScript for: ${filePath}\n\n`;
    
    if (description) {
      prompt += `Description: ${description}\n\n`;
    }
    
    if (requirements.length > 0) {
      prompt += `Requirements:\n${requirements.map(r => `- ${r}`).join('\n')}\n\n`;
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
    prompt += `- Event listeners\n`;
    prompt += `- Error handling\n`;
    prompt += `- Clean code structure\n\n`;
    prompt += `Return ONLY the code, no markdown.`;
    
    return prompt;
  }
}

module.exports = ScriptGenerator;
