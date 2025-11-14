const path = require('path');
const { callCloudAPI } = require('../api-adapter');

class PythonGenerator {
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
        systemPrompt: 'You are an expert Python developer. Generate clean, production-ready Python code following PEP 8 standards. Include proper error handling, type hints, and docstrings. Output only the code.',
        userPrompt: prompt,
        maxTokens: 16384  // Increased from 8192 to prevent truncation
      });
      
      if (!content || content.trim() === '') {
        console.warn('[Generator] API returned empty content despite consuming tokens:', tokensUsed);
        throw new Error('API returned empty content (possibly blocked by safety filters)');
      }
      
      const cleanContent = content
        .replace(/^```python\n/, '')
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
    const fileName = path.basename(fileSpec.path, '.py');
    
    const content = `"""${fileName}.py
Mock fallback - Configure CLOUD_API_ENDPOINT for real generation
${description || 'Python module'}
"""

from typing import Any


def main() -> None:
    """Main entry point."""
    print("Configure CLOUD_API_ENDPOINT to generate real code")


if __name__ == "__main__":
    main()
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
    
    let prompt = `Generate Python code for: ${filePath}\n\n`;
    
    if (description) {
      prompt += `Description: ${description}\n\n`;
    }
    
    if (requirements.length > 0) {
      prompt += `Requirements:\n${requirements.map(r => `- ${r}`).join('\n')}\n\n`;
    }
    
    // ← 新增：如果有 contracts，優先顯示
    if (contracts) {
      prompt += `=== CONTRACTS (MUST FOLLOW EXACTLY) ===\n`;
      
      // API contracts - Python 通常是 producer
      if (contracts.api && contracts.api.length > 0) {
        const relevantApis = contracts.api.filter(api => 
          api.producers.includes(filePath)
        );
        
        if (relevantApis.length > 0) {
          prompt += `\nAPI Endpoints to implement:\n`;
          relevantApis.forEach(api => {
            prompt += `\n  ${api.endpoint} - ${api.description}\n`;
            
            // 分析 endpoint 格式
            const endpoint = api.endpoint.split(' ')[1] || api.endpoint; // "GET /api/weather" -> "/api/weather"
            const hasQueryParams = api.request && api.request.query;
            const hasPathParams = endpoint.includes('<') || endpoint.includes(':');
            
            if (hasQueryParams) {
              prompt += `  ⚠️  Uses QUERY PARAMETERS:\n`;
              Object.entries(api.request.query).forEach(([key, value]) => {
                prompt += `    - ${key}: ${value}\n`;
              });
              prompt += `  Example: city = request.args.get('city')\n`;
              prompt += `  Flask route: @app.route('${endpoint}')\n`;
            }
            
            if (hasPathParams) {
              prompt += `  ⚠️  Uses PATH PARAMETERS:\n`;
              const flaskRoute = endpoint.replace(/:(\w+)/g, '<$1>');
              prompt += `  Flask route: @app.route('${flaskRoute}')\n`;
              prompt += `  Example: def endpoint(city: str):\n`;
            }
            
            if (api.request) {
              prompt += `  Request schema:\n${JSON.stringify(api.request, null, 4).split('\n').map(l => '    ' + l).join('\n')}\n`;
            }
            if (api.response) {
              prompt += `  Response schema (EXACT field names):\n${JSON.stringify(api.response, null, 4).split('\n').map(l => '    ' + l).join('\n')}\n`;
            }
            prompt += `\n`;
          });
          prompt += `🔒 CRITICAL RULES:\n`;
          prompt += `  - Use TypedDict or Pydantic models matching schemas EXACTLY\n`;
          prompt += `  - Field names must match contract exactly (including case)\n`;
          prompt += `  - Query params: use request.args.get('param_name')\n`;
          prompt += `  - Path params: use Flask route parameters\n`;
          prompt += `  - Always validate required parameters\n`;
          prompt += `  - Return 400 error if required params missing\n\n`;
        }
      }
      
      // Class contracts
      if (contracts.classes && contracts.classes.length > 0) {
        const relevantClasses = contracts.classes.filter(cls => 
          cls.file === filePath
        );
        
        if (relevantClasses.length > 0) {
          prompt += `Classes to define:\n`;
          relevantClasses.forEach(cls => {
            prompt += `  ${cls.name}\n`;
            prompt += `  Fields: ${JSON.stringify(cls.fields, null, 2)}\n`;
            if (cls.methods) {
              prompt += `  Methods: ${JSON.stringify(cls.methods, null, 2)}\n`;
            }
          });
          prompt += `\n`;
        }
      }
      
      prompt += `=== END CONTRACTS ===\n\n`;
    }
    
    // Include context from other files
    if (completedFiles.length > 0) {
      prompt += `Related files:\n`;
      completedFiles.forEach(f => {
        prompt += `- ${f.path} (${f.language})\n`;
      });
      prompt += '\n';
    }
    
    if (skeleton) {
      prompt += `Skeleton:\n\`\`\`python\n${skeleton}\n\`\`\`\n\n`;
    }
    
    prompt += `Generate complete, production-ready Python with:\n`;
    prompt += `- PEP 8 compliance (proper naming, spacing, structure)\n`;
    prompt += `- Type hints for all function signatures\n`;
    prompt += `- Comprehensive docstrings\n`;
    prompt += `- Error handling and input validation\n`;
    prompt += `- Proper imports and dependencies\n`;
    prompt += `- CRITICAL: If this is a backend API, route paths MUST match frontend fetch/axios URLs exactly\n`;
    prompt += `- CRITICAL: Function names and class definitions must match skeleton signatures\n`;
    prompt += `- CRITICAL: Data models/schemas must match frontend expectations (field names, types)\n\n`;
    prompt += `Return ONLY the code, no markdown.`;
    
    return prompt;
  }
}

module.exports = PythonGenerator;
