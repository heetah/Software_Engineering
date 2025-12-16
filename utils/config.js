/**
 * 統一的配置管理類別
 */

import dotenv from 'dotenv';
dotenv.config();

/**
 * 應用程式配置管理
 */
export class Config {
  constructor() {
    // API 配置
    this.api = {
      baseUrl: "https://api.openai.com/v1",
      apiKey: process.env.OPENAI_API_KEY,
      // 優化超時：增加超時時間以避免複雜生成的超時錯誤
      timeout: 60000,
      maxRetries: 2,
      retryDelay: 500
    };

    // Agent 配置
    this.agents = {
      temperature: {
        requirement: 0.6,
        architect: 0.3,
        coder: 0.2,
        tester: 0.3
      },
      maxTokens: {
        requirement: undefined,
        architect: undefined,
        coder: undefined,
        tester: undefined
      }
    };

    // Token 限制配置
    this.tokenLimits = {
      maxTotal: 1000000, // 增加到 200 萬 tokens
      warningThreshold: 0.8 // 80% 時警告
    };

    // 流程配置
    this.flows = {
      default: 'instruction',
      available: ['instruction', 'traditional', 'minimal']
    };
  }

  /**
   * 獲取 Agent 配置
   * @param {string} agentName - Agent 名稱
   * @returns {Object} Agent 配置
   */
  getAgentConfig(agentName) {
    return {
      baseUrl: this.api.baseUrl,
      apiKey: this.api.apiKey,
      timeout: this.api.timeout,
      temperature: this.agents.temperature[agentName] || 0.3,
      maxTokens: this.agents.maxTokens[agentName]
    };
  }

  /**
   * 驗證配置
   * @returns {Object} 驗證結果
   */
  validate() {
    const errors = [];
    const warnings = [];

    // 檢查是否有至少一個 API 提供者
    const hasOpenAI = !!(process.env.OPENAI_API_KEY);
    const hasGemini = !!process.env.GOOGLE_API_KEY;

    if (!hasOpenAI && !hasGemini) {
      errors.push('至少需要設置一個 API Key (OPENAI_API_KEY 或 GOOGLE_API_KEY)');
    } else {
      if (hasOpenAI && hasGemini) {
        // 兩個都有，這是好的
        warnings.push('已配置多個 API 提供者，系統將自動進行負載均衡和故障轉移');
      } else if (hasOpenAI) {
        warnings.push('僅配置了 OpenAI API，建議同時配置 Gemini API 以提高可用性');
      } else if (hasGemini) {
        warnings.push('僅配置了 Gemini API，建議同時配置 OpenAI API 以提高可用性');
      }
    }

    // 如果使用單一 API，檢查基本配置
    if (!hasOpenAI && !hasGemini) {
      if (!this.api.apiKey) {
        errors.push('API Key 未設置');
      }

      if (!this.api.baseUrl) {
        errors.push('API Base URL 未設置');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 獲取配置摘要
   * @returns {Object} 配置摘要
   */
  getSummary() {
    return {
      api: {
        baseUrl: this.api.baseUrl,
        timeout: this.api.timeout,
        maxRetries: this.api.maxRetries
      },
      agents: Object.keys(this.agents.temperature),
      tokenLimits: this.tokenLimits,
      defaultFlow: this.flows.default
    };
  }

  /**
   * 根據使用者選項更新配置
   * @param {Object} options - 使用者選項 { llmProvider, apiKeys }
   */
  update(options = {}) {
    if (options.apiKeys) {
      if (options.apiKeys.openai) {
        this.api.apiKey = options.apiKeys.openai; // Update default key if openai provided
      }
      // You could also store gemini key if you expanded this.api or added this.gemini
    }
    // Update other dynamic settings if needed
    console.log('[Config] Configuration updated from user options');
  }
}

// 創建全局配置實例
export const config = new Config();

// 在載入時驗證配置
const validation = config.validate();
if (!validation.valid) {
  console.warn('Configuration validation errors:', validation.errors);
}
if (validation.warnings && validation.warnings.length > 0) {
  console.info('Configuration tips:', validation.warnings);
}

