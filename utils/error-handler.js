/**
 * 統一的錯誤處理中間件和工具函數
 */

import { CoordinatorError, AgentError, APIError } from './errors.js';

/**
 * 帶錯誤處理的函數包裝器
 * @param {string} agentName - Agent 名稱
 * @param {Function} fn - 要執行的函數
 * @param {Object} context - 額外的上下文資訊
 * @returns {Promise} 執行結果
 */
export async function withErrorHandling(agentName, fn, context = {}) {
  try {
    return await fn();
  } catch (error) {
    // 如果已經是自定義錯誤，直接拋出
    if (error instanceof CoordinatorError || error instanceof AgentError) {
      throw error;
    }
    
    // 包裝為 CoordinatorError
    throw new CoordinatorError(
      `${agentName} 執行失敗`,
      agentName,
      error,
      context
    );
  }
}

/**
 * 處理 API 錯誤
 * @param {Error} error - 原始錯誤
 * @param {string} agentName - Agent 名稱
 * @returns {APIError} 包裝後的 API 錯誤
 */
export function handleAPIError(error, agentName) {
  const statusCode = error?.response?.status;
  const responseData = error?.response?.data;
  const requestData = error?.config;
  
  if (statusCode) {
    return new APIError(
      `API 調用失敗 (${statusCode})`,
      statusCode,
      responseData,
      requestData
    );
  }
  
  return new AgentError(
    agentName,
    `API 調用失敗: ${error.message}`,
    error
  );
}

/**
 * 錯誤日誌記錄器
 */
export class ErrorLogger {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.verbose = options.verbose || false;
  }

  /**
   * 記錄錯誤
   */
  log(error, context = {}) {
    if (!this.enabled) return;

    const errorInfo = {
      timestamp: new Date().toISOString(),
      error: error.getDetails ? error.getDetails() : {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      context
    };

    if (this.verbose) {
      console.error('錯誤詳情:', JSON.stringify(errorInfo, null, 2));
    } else {
      console.error(`[錯誤] ${error.toString()}`);
    }
  }

  /**
   * 記錄警告
   */
  warn(message, context = {}) {
    if (!this.enabled) return;
    console.warn(`[警告] ${message}`, context);
  }
}

// 創建全局錯誤日誌記錄器實例
export const errorLogger = new ErrorLogger({
  enabled: true,
  verbose: process.env.VERBOSE_ERRORS === 'true'
});

