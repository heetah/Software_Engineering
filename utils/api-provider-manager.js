/**
 * 多 API 提供者管理器
 * 支持負載均衡、故障轉移和智能路由
 */

import axios from 'axios';
import { config } from './config.js';
import { handleAPIError } from './error-handler.js';

/**
 * API 提供者類型
 */
export const API_PROVIDER_TYPES = {
  OPENAI: 'openai',
  GEMINI: 'gemini'
};

/**
 * API 提供者配置
 */
class APIProvider {
  constructor(name, type, baseUrl, apiKey, options = {}) {
    this.name = name;
    this.type = type;
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.model = options.model; // No default model, must be provided if needed, or per-request
    this.timeout = options.timeout || config.api.timeout;
    this.maxRetries = options.maxRetries || config.api.maxRetries;
    this.retryDelay = options.retryDelay || config.api.retryDelay;

    // 狀態追蹤
    this.isAvailable = true;
    this.lastError = null;
    this.errorCount = 0;
    this.last429Time = null;
    this.requestCount = 0;
    this.successCount = 0;
  }

  // Removed _getDefaultModel as we now enforce explicit model selection at call site
  // _getDefaultModel(type) { ... }

  /**
   * 檢查是否可用（429 錯誤後需要等待）
   */
  isReady() {
    if (!this.isAvailable) return false;

    if (this.last429Time) {
      const timeSince429 = Date.now() - this.last429Time;
      // 如果距離上次 429 錯誤不到 60 秒，認為不可用
      if (timeSince429 < 60000) {
        return false;
      }
      // 超過 60 秒，重置狀態
      this.last429Time = null;
    }

    return true;
  }

  /**
   * 標記為不可用（429 錯誤）
   */
  markRateLimited() {
    this.isAvailable = false;
    this.last429Time = Date.now();
    this.errorCount++;
    console.warn(`[API Provider] ${this.name} marked as rate limited, will skip temporarily`);
  }

  /**
   * 標記為可用
   */
  markAvailable() {
    this.isAvailable = true;
    this.successCount++;
  }

  /**
   * 標記錯誤
   */
  markError(error) {
    this.lastError = error;
    this.errorCount++;
    const statusCode = error?.response?.status;

    // 429 錯誤特殊處理
    if (statusCode === 429) {
      this.markRateLimited();
    } else if (statusCode >= 500) {
      // 伺服器錯誤，暫時標記為不可用
      this.isAvailable = false;
      setTimeout(() => {
        this.isAvailable = true;
      }, 30000); // 30 秒後恢復
    }
  }

  /**
   * 獲取統計信息
   */
  getStats() {
    return {
      name: this.name,
      type: this.type,
      isAvailable: this.isAvailable,
      isReady: this.isReady(),
      requestCount: this.requestCount,
      successCount: this.successCount,
      errorCount: this.errorCount,
      successRate: this.requestCount > 0 ? (this.successCount / this.requestCount * 100).toFixed(2) + '%' : '0%',
      last429Time: this.last429Time ? new Date(this.last429Time).toISOString() : null
    };
  }
}

/**
 * 多 API 提供者管理器
 */
export class APIProviderManager {
  constructor() {
    this.providers = [];
    this.currentIndex = 0; // 用於輪詢負載均衡
    // 默認使用 failover 策略：一次只使用一個 API，優先使用 OpenAI
    this.strategy = process.env.API_ROUTING_STRATEGY || 'failover'; // 'round-robin', 'failover', 'random'
  }

  /**
   * 初始化提供者
   * 優先註冊 OpenAI，然後是 Gemini（確保 failover 時優先使用 OpenAI）
   */
  initialize() {
    this.providers = [];

    // 優先添加 OpenAI 提供者（優先使用）
    if (process.env.OPENAI_API_KEY) {
      const openaiProvider = new APIProvider(
        'OpenAI',
        API_PROVIDER_TYPES.OPENAI,
        process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        process.env.OPENAI_API_KEY,
        {
          // 移除預設 model，改由調用端決定
          timeout: parseInt(process.env.OPENAI_TIMEOUT) || config.api.timeout,
          maxRetries: config.api.maxRetries,
          retryDelay: config.api.retryDelay
        }
      );
      this.providers.push(openaiProvider);
      console.log('[API Provider Manager] OpenAI provider registered (primary)');
    }

    // 然後添加 Gemini 提供者（備用）
    if (process.env.GEMINI_API_KEY) {
      const geminiProvider = new APIProvider(
        'Gemini',
        API_PROVIDER_TYPES.GEMINI,
        process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
        process.env.GEMINI_API_KEY,
        {
          // 移除預設 model，改由調用端決定
          timeout: parseInt(process.env.GEMINI_TIMEOUT) || 60000,
          maxRetries: config.api.maxRetries,
          retryDelay: config.api.retryDelay
        }
      );
      this.providers.push(geminiProvider);
      console.log('[API Provider Manager] Gemini provider registered (fallback)');
    }

    if (this.providers.length === 0) {
      console.warn('[API Provider Manager] Warning: No API providers available! Please set OPENAI_API_KEY or GEMINI_API_KEY');
    } else {
      console.log(`[API Provider Manager] Registered ${this.providers.length} API provider(s)`);
    }
  }

  /**
   * 選擇下一個可用的提供者
   * 優先使用 OpenAI，如果不可用則使用 Gemini
   * 在 failover 模式下，一次只返回一個提供者
   */
  selectProvider(excludeProviders = [], candidates = this.providers) {
    if (candidates.length === 0) {
      throw new Error('No available API providers');
    }

    // 過濾出可用的提供者（按註冊順序：OpenAI 優先），排除已嘗試的
    const availableProviders = candidates.filter(p =>
      p.isReady() && !excludeProviders.includes(p.name)
    );

    if (availableProviders.length === 0) {
      // 如果所有提供者都不可用，嘗試使用所有提供者（可能已經恢復），但排除已嘗試的
      console.warn('[API Provider Manager] All providers temporarily unavailable, trying all providers');
      const allProviders = candidates.filter(p => !excludeProviders.includes(p.name));

      if (allProviders.length === 0) {
        throw new Error('No API providers configured or all providers already tried');
      }

      // 優先返回第一個（OpenAI）
      return allProviders[0];
    }

    // 根據策略選擇提供者
    switch (this.strategy) {
      case 'round-robin':
        this.currentIndex = (this.currentIndex + 1) % availableProviders.length;
        return availableProviders[this.currentIndex];

      case 'failover':
        // 總是選擇第一個可用的（OpenAI 優先，因為註冊順序）
        // 這確保一次只使用一個 API
        return availableProviders[0];

      case 'random':
        return availableProviders[Math.floor(Math.random() * availableProviders.length)];

      case 'least-errors':
        // 選擇錯誤最少的，但如果有多個錯誤數相同，優先選擇第一個（OpenAI）
        return availableProviders.reduce((best, current) => {
          if (current.errorCount < best.errorCount) return current;
          if (current.errorCount === best.errorCount) {
            // 錯誤數相同時，優先選擇註冊順序靠前的（OpenAI）
            return this.providers.indexOf(current) < this.providers.indexOf(best) ? current : best;
          }
          return best;
        });

      default:
        // 默認使用第一個可用的（OpenAI 優先）
        return availableProviders[0];
    }
  }

  /**
   * 執行 API 調用（一次只使用一個 API，優先 OpenAI，失敗時切換到 Gemini）
   */
  async executeAPI(payload, options = {}) {
    // 優先使用 options 中的 API Key (使用者提供的)
    // 注意：這裡的 options.apiKey 是針對特定請求的覆盖

    // Enforce model presence
    const model = payload.model || options.model || (this.providers.length > 0 && this.providers[0].model);
    if (!model) {
      console.warn('[API Provider Manager] Warning: No model specified in payload or options. Some providers may fail.');
    }

    // 過濾提供者
    let candidateProviders = this.providers;

    // 如果 options 指定了 provider (例如 'gemini')
    if (options.provider) {
      const requestedType = options.provider.toLowerCase();

      // 如果是用戶要求的 "gemini"，只使用 GEMINI 類型的提供者
      if (requestedType.includes('gemini')) {
        candidateProviders = this.providers.filter(p => p.type === API_PROVIDER_TYPES.GEMINI);
      }
      // 如果是用戶要求的 "openai"，只使用 OPENAI 類型的提供者
      else if (requestedType.includes('openai')) {
        candidateProviders = this.providers.filter(p => p.type === API_PROVIDER_TYPES.OPENAI);
      }
    }

    if (candidateProviders.length === 0) {
      throw new Error(`No available API providers matching request: ${options.provider || 'any'}`);
    }

    // 一次只嘗試一個提供者，按優先順序
    // 如果指定了 provider，我們只在過濾後的列表中嘗試
    const maxProviderRetries = Math.min(options.maxProviderRetries || candidateProviders.length, candidateProviders.length);
    let lastError = null;
    const triedProviders = [];

    for (let attempt = 0; attempt < maxProviderRetries; attempt++) {
      // 選擇提供者，排除已嘗試的，並且只從候選列表中選擇
      const provider = this.selectProvider(triedProviders, candidateProviders);

      triedProviders.push(provider.name);
      provider.requestCount++;

      try {
        console.log(`[API Provider Manager] Using ${provider.name} (${provider.type}) to send request (attempt ${attempt + 1}/${maxProviderRetries})`);

        const response = await this._callProvider(provider, payload, options);

        // 成功，標記為可用
        provider.markAvailable();
        return response;
      } catch (error) {
        lastError = error;
        const statusCode = error?.response?.status;
        const errorCode = error?.response?.data?.error?.code;

        provider.markError(error);

        // 檢查錯誤類型
        const isQuotaError = statusCode === 429 || errorCode === 'insufficient_quota';
        const isAuthError = statusCode === 401 || statusCode === 403;
        const isServerError = statusCode >= 500;

        // 如果還有其他提供者可以嘗試
        if (attempt < maxProviderRetries - 1 && triedProviders.length < this.providers.length) {
          // 如果是配額錯誤、認證錯誤或伺服器錯誤，嘗試下一個提供者
          if (isQuotaError || isAuthError || isServerError) {
            console.warn(`[API Provider Manager] ${provider.name} failed (${statusCode || errorCode}), switching to next provider...`);
            continue; // 嘗試下一個提供者
          }

          // 其他錯誤也嘗試下一個提供者
          console.warn(`[API Provider Manager] ${provider.name} request failed (${statusCode || 'unknown'}), switching to next provider...`);
          continue;
        }

        // 如果沒有其他提供者可以嘗試，拋出錯誤
        throw handleAPIError(error, provider.name);
      }
    }

    // 所有提供者都失敗了
    throw lastError || new Error('All API providers failed');
  }

  /**
   * 調用特定的 API 提供者
   */
  async _callProvider(provider, payload, options = {}) {
    const { temperature = 0.3, maxTokens, apiKey } = options;

    // 如果 options 中有提供 apiKey，則使用該 key (優先權高於 provider 預設 key)
    const effectiveApiKey = apiKey || provider.apiKey;

    // 為了傳遞給 _callOpenAI / _callGemini，我們需要一個臨時的 provider 物件或是修改參數傳遞方式
    // 這裡我們選擇創建一個代理 provider 物件，僅覆蓋 apiKey
    const effectiveProvider = new Proxy(provider, {
      get: (target, prop) => {
        if (prop === 'apiKey') return effectiveApiKey;
        return target[prop];
      }
    });

    if (provider.type === API_PROVIDER_TYPES.GEMINI) {
      // Gemini API 調用
      return await this._callGemini(effectiveProvider, payload, { temperature, maxTokens });
    } else {
      // OpenAI API 調用（默認）
      return await this._callOpenAI(effectiveProvider, payload, { temperature, maxTokens });
    }
  }

  /**
   * Resolve model name based on provider and requested model/tier
   */
  _resolveModel(providerType, requestedModel) {
    const model = (requestedModel || '').toLowerCase();

    // Abstract Tiers
    if (model === 'strong') {
      return providerType === API_PROVIDER_TYPES.OPENAI ? 'gpt-4o' : 'gemini-1.5-pro';
    }
    if (model === 'fast') {
      return providerType === API_PROVIDER_TYPES.OPENAI ? 'gpt-4o-mini' : 'gemini-1.5-flash';
    }

    // Cross-provider mapping (Fallback mechanism)
    if (providerType === API_PROVIDER_TYPES.OPENAI) {
      // If Gemini model requested on OpenAI, map to closest equivalent
      if (model.includes('gemini') && model.includes('pro')) return 'gpt-4o';
      if (model.includes('gemini') && model.includes('flash')) return 'gpt-4o-mini';
      return requestedModel || 'gpt-4o';
    } else if (providerType === API_PROVIDER_TYPES.GEMINI) {
      // If OpenAI model requested on Gemini, map to closest equivalent
      if (model.includes('gpt-4') || model.includes('strong')) return 'gemini-1.5-pro';
      if (model.includes('gpt-3') || model.includes('mini')) return 'gemini-1.5-flash';
      return requestedModel || 'gemini-1.5-pro';
    }

    return requestedModel;
  }

  /**
   * 調用 OpenAI API
   */
  async _callOpenAI(provider, payload, options = {}) {
    const { temperature = 0.3, maxTokens } = options;

    // Resolve model: explicit payload > provider default > "strong" default
    const rawModel = payload.model || provider.model || 'strong';
    const model = this._resolveModel(API_PROVIDER_TYPES.OPENAI, rawModel);

    // 如果 payload 已經有 messages，直接使用
    // 否則構建標準的 OpenAI 格式
    const requestPayload = payload.messages ? {
      model: model,
      messages: payload.messages,
      temperature: payload.temperature !== undefined ? payload.temperature : temperature,
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
      ...(payload.max_tokens ? { max_tokens: payload.max_tokens } : {})
    } : {
      ...payload,
      model: model
    };

    if (rawModel !== model) {
      console.log(`[API Provider Manager] 🔄 Mapped model '${rawModel}' to '${model}' for OpenAI support`);
    }

    const response = await axios.post(
      `${provider.baseUrl}/chat/completions`,
      requestPayload,
      {
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: provider.timeout
      }
    );

    return response;
  }

  /**
   * 調用 Gemini API
   */
  async _callGemini(provider, payload, options = {}) {
    const { temperature = 0.3, maxTokens } = options;

    // Resolve model
    const rawModel = payload.model || provider.model || 'strong';
    const model = this._resolveModel(API_PROVIDER_TYPES.GEMINI, rawModel);

    if (rawModel !== model) {
      console.log(`[API Provider Manager] 🔄 Mapped model '${rawModel}' to '${model}' for Gemini support`);
    }

    // 轉換 OpenAI 格式的 messages 到 Gemini 格式
    let contents = [];

    if (payload.messages) {
      // 轉換 messages 格式
      for (const msg of payload.messages) {
        if (msg.role === 'system') {
          // Gemini 沒有 system role，將 system message 添加到第一個 user message
          if (contents.length === 0) {
            contents.push({
              role: 'user',
              parts: [{ text: msg.content }]
            });
          } else {
            // 將 system message 合併到第一個 user message
            const firstUser = contents.find(c => c.role === 'user');
            if (firstUser) {
              firstUser.parts[0].text = `${msg.content}\n\n${firstUser.parts[0].text}`;
            }
          }
        } else {
          contents.push({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
          });
        }
      }
    } else {
      // 如果沒有 messages，使用 payload 的原始內容
      contents = [{
        role: 'user',
        parts: [{ text: JSON.stringify(payload) }]
      }];
    }

    const requestPayload = {
      contents: contents,
      generationConfig: {
        temperature: payload.temperature !== undefined ? payload.temperature : temperature,
        ...(maxTokens ? { maxOutputTokens: maxTokens } : {}),
        ...(payload.max_tokens ? { maxOutputTokens: payload.max_tokens } : {})
      }
    };

    // 處理模型名稱（確保格式正確）
    let modelName = model;
    if (!modelName.includes('/')) {
      modelName = `models/${modelName}`;
    }
    const url = `${provider.baseUrl}/${modelName}:generateContent?key=${provider.apiKey}`;

    let response;
    try {
      response = await axios.post(url, requestPayload, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: provider.timeout
      });
    } catch (error) {
      // 提供更詳細的錯誤訊息
      const errorMessage = error?.response?.data?.error?.message || error?.message || 'Unknown error';
      const statusCode = error?.response?.status;
      console.error(`[API Provider Manager] Gemini API call failed:`, {
        url: url.replace(/\?key=.*$/, '?key=***'), // 隱藏 API key
        statusCode,
        errorMessage,
        model: modelName
      });
      throw error;
    }

    // 轉換 Gemini 響應格式到 OpenAI 格式
    const geminiData = response.data;
    const candidate = geminiData.candidates?.[0];
    const content = candidate?.content?.parts?.[0]?.text || '';
    const usage = geminiData.usageMetadata || {};

    // 檢查 Gemini 是否因安全原因阻止了內容
    const finishReason = candidate?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
      if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
        throw new Error(`Gemini content blocked: ${finishReason}. Safety ratings: ${JSON.stringify(candidate?.safetyRatings || [])}`);
      }
      if (finishReason === 'MAX_TOKENS') {
        console.warn('[API Provider Manager] Gemini response truncated due to MAX_TOKENS');
      }
    }

    // 構建類似 OpenAI 的響應格式（使用 axios 響應格式）
    return {
      data: {
        choices: [{
          message: {
            role: 'assistant',
            content: content
          },
          finish_reason: finishReason?.toLowerCase() || 'stop'
        }],
        usage: {
          prompt_tokens: usage.promptTokenCount || 0,
          completion_tokens: usage.candidatesTokenCount || 0,
          total_tokens: usage.totalTokenCount || 0
        }
      }
    };
  }

  /**
   * 獲取所有提供者的統計信息
   */
  getStats() {
    return {
      totalProviders: this.providers.length,
      availableProviders: this.providers.filter(p => p.isReady()).length,
      strategy: this.strategy,
      providers: this.providers.map(p => p.getStats())
    };
  }

  /**
   * 重置所有提供者狀態
   */
  reset() {
    this.providers.forEach(provider => {
      provider.isAvailable = true;
      provider.lastError = null;
      provider.errorCount = 0;
      provider.last429Time = null;
    });
  }
}

// 創建全局實例
export const apiProviderManager = new APIProviderManager();

// 自動初始化
apiProviderManager.initialize();

