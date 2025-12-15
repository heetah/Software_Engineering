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
  const responseHeaders = error?.response?.headers || {};

  if (statusCode) {
    let errorMessage = `API call failed (${statusCode})`;

    // 針對常見的 HTTP 狀態碼提供更友好的錯誤訊息
    switch (statusCode) {
      case 429:
        const retryAfter = responseHeaders['retry-after'] || responseHeaders['Retry-After'];
        if (retryAfter) {
          errorMessage = `API rate limit (429): Too many requests, please wait ${retryAfter} seconds before retrying. If the problem persists, check your API quota or reduce request frequency.`;
        } else {
          errorMessage = `API rate limit (429): Too many requests. System has automatically retried, but all retries failed. Please try again later or check your API quota.`;
        }
        break;
      case 401:
        errorMessage = `API authentication failed (401): Please check if your API Key is correct or has expired.`;
        break;
      case 403:
        errorMessage = `API permission denied (403): Please check if your API Key has sufficient permissions.`;
        break;
      case 500:
      case 502:
      case 503:
      case 504:
        errorMessage = `API server error (${statusCode}): Service temporarily unavailable, please try again later.`;
        break;
      default:
        // 嘗試從響應數據中提取錯誤訊息
        if (responseData?.error?.message) {
          errorMessage = `API call failed (${statusCode}): ${responseData.error.message}`;
        }
    }

    return new APIError(
      errorMessage,
      statusCode,
      responseData,
      requestData
    );
  }

  return new AgentError(
    agentName,
    `API call failed: ${error.message}`,
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
      console.error('Error details:', JSON.stringify(errorInfo, null, 2));
    } else {
      console.error(`[Error] ${error.toString()}`);
    }
  }

  /**
   * 記錄警告
   */
  warn(message, context = {}) {
    if (!this.enabled) return;
    console.warn(`[Warning] ${message}`, context);
  }
}

// 創建全局錯誤日誌記錄器實例
export const errorLogger = new ErrorLogger({
  enabled: true,
  verbose: process.env.VERBOSE_ERRORS === 'true'
});

