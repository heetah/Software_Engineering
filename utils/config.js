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
      baseUrl: process.env.OPENAI_BASE_URL || process.env.BASE_URL || "https://api.openai.com/v1",
      apiKey: process.env.OPENAI_API_KEY || process.env.API_KEY,
      timeout: parseInt(process.env.API_TIMEOUT) || 30000,
      maxRetries: parseInt(process.env.API_MAX_RETRIES) || 3,
      retryDelay: parseInt(process.env.API_RETRY_DELAY) || 1000
    };

    // Agent 配置
    this.agents = {
      temperature: {
        requirement: parseFloat(process.env.REQUIREMENT_TEMPERATURE) || 0.6,
        architect: parseFloat(process.env.ARCHITECT_TEMPERATURE) || 0.3,
        coder: parseFloat(process.env.CODER_TEMPERATURE) || 0.2,
        tester: parseFloat(process.env.TESTER_TEMPERATURE) || 0.3
      },
      maxTokens: {
        requirement: parseInt(process.env.REQUIREMENT_MAX_TOKENS) || undefined,
        architect: parseInt(process.env.ARCHITECT_MAX_TOKENS) || undefined,
        coder: parseInt(process.env.CODER_MAX_TOKENS) || undefined,
        tester: parseInt(process.env.TESTER_MAX_TOKENS) || undefined
      }
    };

    // Token 限制配置
    this.tokenLimits = {
      maxTotal: parseInt(process.env.MAX_TOTAL_TOKENS) || 1000000, // 預設 100 萬 tokens
      warningThreshold: parseFloat(process.env.TOKEN_WARNING_THRESHOLD) || 0.8 // 80% 時警告
    };

    // 日誌配置
    this.logging = {
      enabled: process.env.LOGGING_ENABLED !== 'false',
      verbose: process.env.VERBOSE_LOGGING === 'true',
      level: process.env.LOG_LEVEL || 'info'
    };

    // 流程配置
    this.flows = {
      default: process.env.DEFAULT_FLOW || 'instruction',
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
    const hasOpenAI = !!(process.env.OPENAI_API_KEY || process.env.API_KEY);
    const hasGemini = !!process.env.GEMINI_API_KEY;

    if (!hasOpenAI && !hasGemini) {
      errors.push('至少需要設置一個 API Key (OPENAI_API_KEY 或 GEMINI_API_KEY)');
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

