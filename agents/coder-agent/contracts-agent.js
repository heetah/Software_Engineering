/**
 * Contracts Agent v2.0 - AI 驅動的 Payload 增強器
 * 
 * 核心功能：
 * 1. 修復端口衝突（避免使用 port 3000，改為 5001 或 3800）
 * 2. 檢查並補全 contracts（api, dom, storage）
 * 
 * 不做的事情：
 * - 不添加新檔案
 * - 不修改檔案描述
 * - 只專注於端口和 contracts
 */

const fetch = global.fetch || require('node-fetch');

class ContractsAgent {
    constructor(options = {}) {
        // 優先使用 Gemini API（已經在 .env 中配置）
        this.aiApiUrl = options.aiApiUrl || process.env.CLOUD_API_ENDPOINT || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';
        this.aiApiKey = options.aiApiKey || process.env.CLOUD_API_KEY;
        this.apiType = this.aiApiUrl.includes('generativelanguage.googleapis.com') ? 'gemini' : 'anthropic';
        this.useAI = options.useAI !== false && !!this.aiApiKey;
        
        if (!this.useAI) {
            console.log('⚠️  ContractsAgent: AI disabled (no API key or explicitly disabled)');
            console.log('    Will pass through payloads without enhancement');
        } else {
            console.log(`✅ ContractsAgent: Using ${this.apiType} API for enhancement`);
        }
    }

    /**
     * 處理 payload - 主入口
     */
    async processPayload(originalPayload) {
        console.log('\n🔍 ContractsAgent: Processing payload...');
        
        const payload = JSON.parse(JSON.stringify(originalPayload)); // Deep clone
        
        if (!this.useAI) {
            console.log('📋 AI disabled - passing through unchanged');
            return this.addPreprocessingMetadata(payload, false);
        }
        
        try {
            const enhanced = await this.enhanceWithAI(payload);
            console.log('✅ AI enhancement successful');
            return this.addPreprocessingMetadata(enhanced, true);
        } catch (error) {
            console.error('❌ AI enhancement failed:', error.message);
            console.log('⚠️  Returning original payload');
            return this.addPreprocessingMetadata(payload, false);
        }
    }
    
    /**
     * 使用 AI 增強 payload
     */
    async enhanceWithAI(payload) {
        console.log(`🤖 Calling ${this.apiType} API for payload enhancement...`);
        
        // 保存原始 files 的 template 欄位
        const originalTemplates = this.extractTemplates(payload);
        
        let enhanced;
        if (this.apiType === 'gemini') {
            enhanced = await this.enhanceWithGemini(payload);
        } else {
            enhanced = await this.enhanceWithAnthropic(payload);
        }
        
        // 恢復 template 欄位到增強後的 payload
        this.restoreTemplates(enhanced, originalTemplates);
        
        return enhanced;
    }
    
    /**
     * 提取所有檔案的 template
     */
    extractTemplates(payload) {
        const files = payload.output?.coder_instructions?.files || [];
        const templates = {};
        
        files.forEach(file => {
            if (file.template) {
                templates[file.path] = file.template;
            }
        });
        
        console.log(`📋 Extracted ${Object.keys(templates).length} templates before AI processing`);
        return templates;
    }
    
    /**
     * 恢復 template 欄位到增強後的檔案
     */
    restoreTemplates(payload, templates) {
        const files = payload.output?.coder_instructions?.files || [];
        let restored = 0;
        
        files.forEach(file => {
            if (templates[file.path]) {
                file.template = templates[file.path];
                restored++;
            }
        });
        
        console.log(`✅ Restored ${restored} templates after AI processing`);
    }
    
    /**
     * 使用 Gemini API
     */
    async enhanceWithGemini(payload) {
        const url = `${this.aiApiUrl}?key=${this.aiApiKey}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: this.buildPrompt(payload)
                    }]
                }],
                generationConfig: {
                    temperature: 0.1,  // 降低溫度提高穩定性
                    maxOutputTokens: 8000,
                    responseMimeType: "application/json"  // 要求 JSON 格式
                }
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API error: ${response.status} ${errorText}`);
        }
        
        const result = await response.json();
        
        // 檢查是否有阻擋或安全問題
        if (!result.candidates || result.candidates.length === 0) {
            throw new Error('Gemini API returned no candidates (possible content filter block)');
        }
        
        const aiResponse = result.candidates[0].content.parts[0].text;
        console.log('📦 AI response length:', aiResponse.length);
        
        // 嘗試多種方式提取 JSON
        let jsonStr = aiResponse;
        
        // 1. 移除 markdown code blocks
        const codeBlockMatch = aiResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (codeBlockMatch) {
            jsonStr = codeBlockMatch[1];
        }
        
        // 2. 清理可能的控制字符
        jsonStr = jsonStr.trim()
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // 移除控制字符
            .replace(/\r\n/g, '\n'); // 統一換行符
        
        // 3. 如果不是以 { 開頭，嘗試找到第一個 {
        if (!jsonStr.startsWith('{')) {
            const firstBrace = jsonStr.indexOf('{');
            if (firstBrace !== -1) {
                jsonStr = jsonStr.substring(firstBrace);
            }
        }
        
        // 4. 如果不是以 } 結尾，嘗試找到最後一個 }
        if (!jsonStr.endsWith('}')) {
            const lastBrace = jsonStr.lastIndexOf('}');
            if (lastBrace !== -1) {
                jsonStr = jsonStr.substring(0, lastBrace + 1);
            }
        }
        
        try {
            return JSON.parse(jsonStr);
        } catch (parseError) {
            // JSON 解析失敗，保存錯誤信息供調試
            console.error('❌ JSON parse failed. First 500 chars:');
            console.error(jsonStr.substring(0, 500));
            console.error('Last 500 chars:');
            console.error(jsonStr.substring(Math.max(0, jsonStr.length - 500)));
            throw new Error(`Failed to parse AI response as JSON: ${parseError.message}`);
        }
    }
    
    /**
     * 使用 Anthropic API（備用）
     */
    async enhanceWithAnthropic(payload) {
        const response = await fetch(this.aiApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.aiApiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 8000,
                temperature: 0.3,
                messages: [{
                    role: 'user',
                    content: this.buildPrompt(payload)
                }]
            })
        });
        
        if (!response.ok) {
            throw new Error(`Anthropic API error: ${response.status}`);
        }
        
        const result = await response.json();
        const aiResponse = result.content[0].text;
        
        // 提取 JSON
        const jsonMatch = aiResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        const jsonStr = jsonMatch ? jsonMatch[1] : aiResponse;
        
        return JSON.parse(jsonStr);
    }
    
    /**
     * 構建 AI prompt
     */
    buildPrompt(payload) {
        const files = payload.output?.coder_instructions?.files || [];
        const fileList = files.map(f => `- ${f.path} (${f.type || 'unknown'})`).join('\n');
        const contracts = payload.output?.coder_instructions?.contracts || {};
        const projectConfig = payload.output?.coder_instructions?.projectConfig || {};
        const backendPort = projectConfig.backend?.port || projectConfig.runtime?.backend_port;
        
        return `Fix critical issues in this code generation payload.

INPUT PAYLOAD (JSON):
\`\`\`json
${JSON.stringify(payload, null, 2)}
\`\`\`

ENHANCEMENT TASKS:

1. PORT CONFLICT FIX (CRITICAL):
   Current: ${backendPort || 'NOT SET'}
   ⚠️  Backend MUST NOT use port 3000 (vision-agent uses it)
   ✅ Set to: 5001 (Flask) or 3800 (Node.js)
   Update: projectConfig.backend.port and projectConfig.runtime.backend_port

2. CONTRACTS COMPLETENESS CHECK:
   Ensure contracts object has:
   - api: Array of API endpoints (with endpoint, method, producers, consumers)
   - dom: Array of DOM element IDs (with id, type, purpose, accessedBy)
   - storage: Array of storage keys (if data persistence needed)
   
   If any contract is missing or incomplete, add/fix it based on the files and task description.

CRITICAL: Return ONLY valid JSON. No markdown wrapper, no explanation.
Do NOT add new files. Do NOT modify file descriptions.
Only fix: port conflicts and contracts completeness.

OUTPUT FORMAT (copy entire payload structure):
{
  "comment": "...",
  "output": {
    "coder_instructions": {
      "task": "...",
      "requirements": "...",
      "files": [...],
      "contracts": {...},
      "projectConfig": {...}
    }
  }
}`;
    }
    
    /**
     * 添加預處理元數據
     */
    addPreprocessingMetadata(payload, enhanced) {
        payload._preprocessed = {
            by: 'contracts-agent',
            version: '2.0.0',
            timestamp: new Date().toISOString(),
            enhanced: enhanced
        };
        return payload;
    }
}

module.exports = ContractsAgent;
