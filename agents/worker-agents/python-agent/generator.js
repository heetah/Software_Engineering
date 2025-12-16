const path = require('path');
const { callCloudAPI } = require('../api-adapter.cjs');

class PythonGenerator {
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
    }

    // 優先級 3: AI 生成（無 contracts 也無 template）
    console.log(`[Generator] Mode: ${this.useMockApi ? 'MOCK (Fallback)' : 'CLOUD API'}`);

    if (this.useMockApi) {
      return this.generateWithMock({ skeleton, fileSpec, context });
    } else {
      return this.generateWithCloudAPI({ skeleton, fileSpec, context });
    }
  } async generateWithCloudAPI({ skeleton, fileSpec, context }) {
    const prompt = this.buildPrompt({ skeleton, fileSpec, context });

    try {
      const { content, tokensUsed } = await callCloudAPI({
        endpoint: this.cloudApiEndpoint,
        apiKey: this.cloudApiKey,
        systemPrompt: 'You are an expert Python developer. Generate clean, production-ready Python code following PEP 8 standards. Include proper error handling, type hints, and docstrings. Output only the code.',
        userPrompt: prompt,
        maxTokens: 81920
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

    // 🚨 CONTRACTS FIRST - 最優先顯示
    if (contracts) {
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `🚨 CRITICAL: CONTRACTS (MUST FOLLOW EXACTLY) 🚨\n`;
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      // API contracts - Python 通常是 producer
      if (contracts.api && contracts.api.length > 0) {
        // 🔥 修復：寬鬆過濾，如果 producers 為空也顯示
        const relevantApis = contracts.api.filter(api => {
          const producers = api.producers || [];
          return producers.length === 0 || producers.includes(filePath);
        });

        if (relevantApis.length > 0) {
          prompt += `\n📡 API ENDPOINTS TO IMPLEMENT:\n\n`;
          relevantApis.forEach(api => {
            const method = api.method || 'GET';
            prompt += `  ${method} ${api.endpoint} - ${api.purpose || api.description}\n`;

            // 顯示 request schema
            if (api.requestSchema) {
              if (api.requestSchema.properties) {
                prompt += `  Request Parameters:\n`;
                Object.entries(api.requestSchema.properties).forEach(([key, val]) => {
                  const required = api.requestSchema.required?.includes(key) ? '(required)' : '(optional)';
                  prompt += `    - ${key}: ${val.type} ${required}\n`;
                });
              } else if (api.requestSchema.type) {
                prompt += `  Request: ${api.requestSchema.type}\n`;
              }
            } else {
              prompt += `  Request: No parameters\n`;
            }

            // 顯示 response schema
            if (api.responseSchema) {
              if (api.responseSchema.type === 'array') {
                const itemProps = api.responseSchema.items?.properties;
                if (itemProps) {
                  prompt += `  Response: Array of objects with:\n`;
                  Object.entries(itemProps).forEach(([key, val]) => {
                    prompt += `    - ${key}: ${val.type}\n`;
                  });
                } else {
                  prompt += `  Response: Array\n`;
                }
              } else if (api.responseSchema.type === 'object') {
                prompt += `  Response: Object with:\n`;
                Object.entries(api.responseSchema.properties || {}).forEach(([key, val]) => {
                  prompt += `    - ${key}: ${val.type}\n`;
                });
              } else {
                prompt += `  Response: ${api.responseSchema.type}\n`;
              }
            } else {
              prompt += `  Response: void\n`;
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

      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      prompt += `END OF CONTRACTS - FOLLOW THEM EXACTLY!\n`;
      prompt += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    }

    if (description) {
      prompt += `Description: ${description}\n\n`;
    }

    if (requirements.length > 0) {
      prompt += `Requirements:\n${requirements.map(r => `- ${r}`).join('\n')}\n\n`;
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
