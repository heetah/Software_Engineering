/**
 * Token 使用追蹤和監控
 */

import { config } from './config.js';

/**
 * Token 使用追蹤器
 */
export class TokenTracker {
  constructor() {
    this.usage = {
      total: 0,
      prompt: 0,
      completion: 0,
      byAgent: {},
      byDate: {},
      history: []
    };
    this.maxTotal = config.tokenLimits.maxTotal;
    this.warningThreshold = config.tokenLimits.warningThreshold;
  }

  /**
   * 記錄 Token 使用
   * @param {string} agentName - Agent 名稱
   * @param {Object} usage - Token 使用資訊
   * @param {number} usage.prompt_tokens - 輸入 tokens
   * @param {number} usage.completion_tokens - 輸出 tokens
   * @param {number} usage.total_tokens - 總 tokens
   */
  record(agentName, usage) {
    if (!usage || typeof usage.total_tokens !== 'number') {
      return;
    }

    const date = new Date().toISOString().split('T')[0];
    const tokens = usage.total_tokens;
    const promptTokens = usage.prompt_tokens || 0;
    const completionTokens = usage.completion_tokens || 0;

    // 更新總計
    this.usage.total += tokens;
    this.usage.prompt += promptTokens;
    this.usage.completion += completionTokens;

    // 按 Agent 統計
    if (!this.usage.byAgent[agentName]) {
      this.usage.byAgent[agentName] = {
        total: 0,
        prompt: 0,
        completion: 0,
        count: 0
      };
    }
    this.usage.byAgent[agentName].total += tokens;
    this.usage.byAgent[agentName].prompt += promptTokens;
    this.usage.byAgent[agentName].completion += completionTokens;
    this.usage.byAgent[agentName].count += 1;

    // 按日期統計
    if (!this.usage.byDate[date]) {
      this.usage.byDate[date] = {
        total: 0,
        prompt: 0,
        completion: 0,
        count: 0
      };
    }
    this.usage.byDate[date].total += tokens;
    this.usage.byDate[date].prompt += promptTokens;
    this.usage.byDate[date].completion += completionTokens;
    this.usage.byDate[date].count += 1;

    // 記錄歷史
    this.usage.history.push({
      agent: agentName,
      tokens,
      promptTokens,
      completionTokens,
      timestamp: new Date().toISOString()
    });

    // 檢查限制
    this.checkLimit();
  }

  /**
   * 檢查 Token 使用限制
   */
  checkLimit() {
    const percentage = this.usage.total / this.maxTotal;
    
    if (this.usage.total > this.maxTotal) {
      throw new Error(
        `Token 使用量超過限制: ${this.usage.total} / ${this.maxTotal}`
      );
    }
    
    if (percentage >= this.warningThreshold) {
      console.warn(
        `⚠️ Token 使用量警告: ${this.usage.total} / ${this.maxTotal} (${(percentage * 100).toFixed(1)}%)`
      );
    }
  }

  /**
   * 獲取使用統計
   * @returns {Object} 使用統計
   */
  getStats() {
    return {
      total: this.usage.total,
      prompt: this.usage.prompt,
      completion: this.usage.completion,
      byAgent: { ...this.usage.byAgent },
      byDate: { ...this.usage.byDate },
      remaining: this.maxTotal - this.usage.total,
      percentage: (this.usage.total / this.maxTotal * 100).toFixed(2) + '%'
    };
  }

  /**
   * 重置統計
   */
  reset() {
    this.usage = {
      total: 0,
      prompt: 0,
      completion: 0,
      byAgent: {},
      byDate: {},
      history: []
    };
  }

  /**
   * 獲取 Agent 的平均 Token 使用
   * @param {string} agentName - Agent 名稱
   * @returns {Object|null} 平均使用統計
   */
  getAgentAverage(agentName) {
    const agentStats = this.usage.byAgent[agentName];
    if (!agentStats || agentStats.count === 0) {
      return null;
    }

    return {
      total: Math.round(agentStats.total / agentStats.count),
      prompt: Math.round(agentStats.prompt / agentStats.count),
      completion: Math.round(agentStats.completion / agentStats.count),
      count: agentStats.count
    };
  }
}

// 創建全局 Token 追蹤器實例
export const tokenTracker = new TokenTracker();

