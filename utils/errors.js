/**
 * 統一的錯誤處理類別
 */

/**
 * Coordinator 專用錯誤類別
 */
export class CoordinatorError extends Error {
  constructor(message, agent, originalError, context = {}) {
    super(message);
    this.name = 'CoordinatorError';
    this.agent = agent;
    this.originalError = originalError;
    this.context = context;
    this.timestamp = new Date().toISOString();
    
    // 保持堆疊追蹤
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CoordinatorError);
    }
  }

  /**
   * 獲取錯誤的詳細資訊
   */
  getDetails() {
    return {
      name: this.name,
      message: this.message,
      agent: this.agent,
      timestamp: this.timestamp,
      context: this.context,
      originalError: this.originalError?.message || this.originalError,
      stack: this.stack
    };
  }

  /**
   * 轉換為可讀的字串
   */
  toString() {
    return `[${this.agent || 'Unknown'}] ${this.message}${this.originalError ? `: ${this.originalError.message}` : ''}`;
  }
}

/**
 * Agent 執行錯誤類別
 */
export class AgentError extends Error {
  constructor(agentName, message, originalError, usage = null) {
    super(message);
    this.name = 'AgentError';
    this.agentName = agentName;
    this.originalError = originalError;
    this.usage = usage;
    this.timestamp = new Date().toISOString();
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AgentError);
    }
  }

  getDetails() {
    return {
      name: this.name,
      agentName: this.agentName,
      message: this.message,
      timestamp: this.timestamp,
      usage: this.usage,
      originalError: this.originalError?.message || this.originalError
    };
  }
}

/**
 * API 調用錯誤類別
 */
export class APIError extends Error {
  constructor(message, statusCode, responseData, requestData = null) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.responseData = responseData;
    this.requestData = requestData;
    this.timestamp = new Date().toISOString();
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, APIError);
    }
  }

  getDetails() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      responseData: this.responseData,
      requestData: this.requestData,
      timestamp: this.timestamp
    };
  }
}

/**
 * 驗證錯誤類別
 */
export class ValidationError extends Error {
  constructor(message, field, value, schema = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
    this.schema = schema;
    this.timestamp = new Date().toISOString();
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ValidationError);
    }
  }

  getDetails() {
    return {
      name: this.name,
      message: this.message,
      field: this.field,
      value: this.value,
      schema: this.schema,
      timestamp: this.timestamp
    };
  }
}

