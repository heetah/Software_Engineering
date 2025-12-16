/**
 * 提供 Agent 的Base Class，包含API調用、重試機制、Token追蹤、錯誤處理等功能
 * 統一錯誤處理、輸出檔案儲存、Token追蹤
 */

import axios from "axios";
import fs from "fs";
import dotenv from "dotenv";
import { config } from "../utils/config.js";
import { tokenTracker } from "../utils/token-tracker.js";
import { handleAPIError, errorLogger } from "../utils/error-handler.js";
import { AgentError } from "../utils/errors.js";
import { apiProviderManager } from "../utils/api-provider-manager.js";
dotenv.config();

export default class BaseAgent {
  constructor(role, format, logicalName, options = {}) {
    this.role = role; // 角色
    this.format = format; // 格式
    this.logicalName = logicalName; // 邏輯模型
    this.temperature = 1; // 控制參數
    this.maxTokens = undefined; // 可用的最大 tokens，由子類設定

    // 解析 options 中的 API Key 和 Provider 設定
    let { apiKey: optionsApiKey, baseUrl: optionsBaseUrl, llmProvider, apiKeys } = options;
    this.apiKeys = apiKeys; // Store apiKeys for fallback logic
    let resolvedApiKey = optionsApiKey;
    let resolvedBaseUrl = optionsBaseUrl;
    let isUserKeyProvided = false;

    const provider = (llmProvider || "auto").toLowerCase();

    // 如果沒有直接提供 apiKey/baseUrl，嘗試從 llmProvider / apiKeys 解析
    if (!resolvedApiKey && (llmProvider || apiKeys)) {
      if (provider === 'gemini') {
        if (apiKeys?.gemini) {
          resolvedApiKey = apiKeys.gemini;
          resolvedBaseUrl = "https://generativelanguage.googleapis.com/v1beta";
          isUserKeyProvided = true;
        }
      } else if (provider === 'openai') {
        if (apiKeys?.openai) {
          resolvedApiKey = apiKeys.openai;
          resolvedBaseUrl = "https://api.openai.com/v1";
          isUserKeyProvided = true;
        }
      } else {
        // Auto mode
        if (apiKeys?.openai) {
          resolvedApiKey = apiKeys.openai;
          resolvedBaseUrl = "https://api.openai.com/v1";
          isUserKeyProvided = true;
        } else if (apiKeys?.gemini) {
          resolvedApiKey = apiKeys.gemini;
          resolvedBaseUrl = "https://generativelanguage.googleapis.com/v1beta";
          isUserKeyProvided = true;
        }
      }
    }

    // 支援自定義 API 端點和 Key（用於使用不同的 API 服務）
    this.baseUrl = resolvedBaseUrl || config.api.baseUrl;
    this.apiKey = resolvedApiKey || config.api.apiKey;

    // 重試配置
    this.maxRetries = options.maxRetries || config.api.maxRetries;
    this.retryDelay = options.retryDelay || config.api.retryDelay;

    // 是否繞過全局 API Provider Manager (例如當有特定的 API Key 時)
    // 如果明確解析出了使用者提供的 Key，自動設為 true
    this.bypassProviderManager = options.bypassProviderManager || isUserKeyProvided || false;
  }

  /**
   * 等待指定時間（用於重試延遲）
   * @param {number} ms - 等待毫秒數
   * @returns {Promise}
   */
  async _wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 執行 API 調用（使用多 API 提供者管理器，自動處理故障轉移）
   * @param {Object} payload - 請求負載
   * @param {number} retries - 剩餘重試次數（用於單個提供者的重試）
   * @returns {Promise<Object>} API 響應
   */
  async _executeAPI(payload, retries = this.maxRetries) {
    // 如果配置了多 API 提供者，使用管理器（自動處理故障轉移）
    // 除非明確要求繞過 (例如使用特定的 API Key)
    if (apiProviderManager.providers.length > 0 && !this.bypassProviderManager) {
      try {
        const res = await apiProviderManager.executeAPI(payload, {
          temperature: payload.temperature || this.temperature,
          maxTokens: payload.max_tokens || this.maxTokens
        });
        return res;
      } catch (err) {
        // 如果所有提供者都失敗，檢查是否可以安全地使用 fallback
        if (this.baseUrl && this.apiKey) {
          // 檢查 fallback API 是否與已失敗的提供者相同
          const matchingProvider = apiProviderManager.providers.find(p => {
            // 比較 baseUrl（去除尾部的 /v1 等路徑）
            const providerBase = p.baseUrl.replace(/\/v1.*$/, '');
            const fallbackBase = this.baseUrl.replace(/\/v1.*$/, '');
            return providerBase === fallbackBase;
          });

          // 如果找到匹配的提供者且它被標記為 rate limited，不要重試
          if (matchingProvider && !matchingProvider.isReady()) {
            const timeSince429 = matchingProvider.last429Time
              ? Date.now() - matchingProvider.last429Time
              : 0;
            const waitTime = Math.ceil((60000 - timeSince429) / 1000);

            throw new Error(
              `All API providers are unavailable. ` +
              `${matchingProvider.name} is rate limited. ` +
              (waitTime > 0 ? `Please wait ${waitTime} seconds and try again.` : 'Please try again later.')
            );
          }

          console.warn(`  ${this.role} All multi-API providers failed, trying fallback API...`);
          return await this._executeAPIFallback(payload, retries);
        }
        throw err;
      }
    }

    // 如果沒有配置多 API 提供者，使用傳統方法
    return await this._executeAPIFallback(payload, retries);
  }

  /**
   * 傳統的 API 調用方法（單一 API 提供者，帶重試機制）
   * @param {Object} payload - 請求負載
   * @param {number} retries - 剩餘重試次數
   * @returns {Promise<Object>} API 響應
   */
  async _executeAPIFallback(payload, retries = this.maxRetries) {
    // 判斷是否為 Gemini API
    const isGemini = this.baseUrl.includes('goog') || this.baseUrl.includes('gemini');

    if (isGemini) {
      return await this._executeGeminiFallback(payload, retries);
    }

    // 確保 payload 包含 model 參數（OpenAI API 必需）
    const model = payload.model || 'gpt-5-mini';

    // 構建完整的請求負載
    // 根據模型選擇使用 messages 或 inputs
    const isCustomCodexModel = model === 'gpt-5.1-codex-max';
    const messagesKey = isCustomCodexModel ? 'inputs' : 'messages';

    const requestPayload = {
      model: model,
      temperature: payload.temperature !== undefined ? payload.temperature : this.temperature,
      [messagesKey]: payload.inputs || payload.messages || [],
      ...(payload.max_tokens ? { max_tokens: payload.max_tokens } : {}),
      ...(this.maxTokens ? { max_tokens: this.maxTokens } : {})
    };

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await axios.post(
          `${this.baseUrl}/chat/completions`,
          requestPayload,
          {
            headers: {
              "Authorization": `Bearer ${this.apiKey}`,
              "Content-Type": "application/json"
            },
            timeout: config.api.timeout
          }
        );

        return res;
      } catch (err) {
        const statusCode = err?.response?.status;
        const responseHeaders = err?.response?.headers || {};

        // 如果是最後一次嘗試，拋出錯誤
        if (attempt === retries) {
          throw handleAPIError(err, this.role);
        }

        // 針對 429 錯誤（速率限制）的特殊處理
        if (statusCode === 429) {
          // 檢查是否有 Retry-After 頭（秒數）
          const retryAfter = responseHeaders['retry-after'] || responseHeaders['Retry-After'];
          let delay;

          if (retryAfter) {
            // 使用 API 建議的等待時間（轉換為毫秒）
            // 對於 429 錯誤，至少等待 60 秒
            const retryAfterSeconds = parseInt(retryAfter, 10);
            delay = Math.max(retryAfterSeconds * 1000, 60000);
            console.warn(`  ${this.role} Rate limited (429), API suggests waiting ${retryAfterSeconds} seconds (minimum 60s) before retry (${attempt + 1}/${retries})...`);
          } else {
            // 沒有 Retry-After 頭時，使用更長的延遲時間
            // 對於 429 錯誤，建議等待至少 60 秒，並使用更激進的指數退避
            delay = Math.max(60000, this.retryDelay * Math.pow(2, attempt + 2));
            console.warn(`  ${this.role} Rate limited (429), waiting ${Math.ceil(delay / 1000)} seconds before retry (${attempt + 1}/${retries})...`);
          }

          await this._wait(delay);
          await this._wait(delay);
          continue;
        }

        // Auto-failover: check for Auth errors (401/403) from OpenAI and switch to Gemini if available
        const isAuthError = statusCode === 401 || statusCode === 403;
        if (isAuthError && this.baseUrl.includes('api.openai.com')) {
          const geminiKey = this.apiKeys?.gemini || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
          if (geminiKey) {
            console.warn(`  ${this.role} OpenAI authentication failed (${statusCode}), switching to Gemini fallback...`);
            this.apiKey = geminiKey;
            this.baseUrl = "https://generativelanguage.googleapis.com/v1beta";
            return await this._executeGeminiFallback(payload, retries);
          }
        }

        // 對於其他錯誤，使用標準的指數退避
        // 指數退避：等待時間 = 基礎延遲 * 2^嘗試次數
        const delay = this.retryDelay * Math.pow(2, attempt);
        console.warn(`  ${this.role} API call failed (${statusCode || 'unknown error'}), retrying after ${delay}ms (${attempt + 1}/${retries})...`);
        await this._wait(delay);
      }
    }
  }

  /**
   * Gemini API 的 fallback 實現
   */
  async _executeGeminiFallback(payload, retries = this.maxRetries) {
    // 準備模型名稱 (將 OpenAI 模型映射到 Gemini，如果需要)
    let model = payload.model || 'gemini-2.5-flash';
    if (!(model === 'gpt-5-mini' || model.includes('gpt'))) {
      model = 'gemini-2.5-flash';
    }

    if (!model.includes('/')) {
      model = `models/${model}`; // 確保格式正確
    }

    // 轉換 Messages 到 Content
    let contents = [];
    const messages = payload.messages || [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        // 合併 system 到第一個 user message，因為 Gemini REST API 有時對 system instruction 支援不同
        if (contents.length === 0) {
          contents.push({ role: 'user', parts: [{ text: msg.content }] });
        } else {
          // 這裡簡化處理，通常 system 會在最前面。
          // 如果已經有 user message，就合併到那個 user message 前面
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

    // 如果沒有內容（例如只有 system prompt 且被合併了但沒 user prompt... 不太可能，但防禦一下）
    if (contents.length === 0) {
      contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
    }

    const startUrl = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
    const url = `${startUrl}/${model}:generateContent?key=${this.apiKey}`;

    const requestPayload = {
      contents: contents,
      generationConfig: {
        temperature: payload.temperature !== undefined ? payload.temperature : this.temperature,
        maxOutputTokens: payload.max_tokens || this.maxTokens
      }
    };

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await axios.post(url, requestPayload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 60000 // Gemini 有時較慢
        });

        // 轉換回應格式為 OpenAI 風格
        const candidate = res.data.candidates?.[0];
        const content = candidate?.content?.parts?.[0]?.text || '';
        const usage = res.data.usageMetadata || {};

        return {
          data: {
            choices: [{
              message: {
                role: 'assistant',
                content: content
              },
              finish_reason: 'stop'
            }],
            usage: {
              prompt_tokens: usage.promptTokenCount || 0,
              completion_tokens: usage.candidatesTokenCount || 0,
              total_tokens: usage.totalTokenCount || 0
            }
          }
        };

      } catch (err) {
        // 錯誤處理邏輯與 _executeAPIFallback 類似
        const statusCode = err?.response?.status;
        if (attempt === retries) {
          throw handleAPIError(err, this.role);
        }

        if (statusCode === 429) {
          const delay = 60000;
          console.warn(`  ${this.role} [Gemini] Rate limited (429), waiting ${delay / 1000}s...`);
          await this._wait(delay);
          continue;
        }

        const delay = this.retryDelay * Math.pow(2, attempt);
        console.warn(`  ${this.role} [Gemini] API call failed (${statusCode}), retrying after ${delay}ms...`);
        await this._wait(delay);
      }
    }
  }

  /**
   * 執行代理
   * @param {string} input - 輸入
   * @param {number} retries - 重試次數（可選，覆蓋默認值）
   * @returns {Promise<string>} 輸出
   */
  async run(input, retries = this.maxRetries, options = {}) {
    // 打印正在執行的角色
    console.log(`\n Running ${this.role}...`);

    // 根據模型選擇使用 messages 或 inputs
    const model = options.model || 'gpt-5-mini';
    const isCustomCodexModel = model === 'gpt-5.1-codex-max';
    const messagesKey = isCustomCodexModel ? 'inputs' : 'messages';

    const payload = {
      // 允許通過 options 指定模型,否則讓 API Provider Manager 使用默認模型
      ...(options.model ? { model: options.model } : {}),
      // 控制參數
      temperature: options.temperature !== undefined ? options.temperature : this.temperature,
      // 可用的最大 tokens
      ...(this.maxTokens ? { max_tokens: this.maxTokens } : {}),
      // system是給模型看的，user是給用戶看的
      [messagesKey]: [
        { role: "system", content: `You are the ${this.role}. Follow your role strictly and output only in ${this.format}.` },
        { role: "user", content: input }
      ]
    };

    try {
      // 發送請求（帶重試機制）
      const res = await this._executeAPI(payload, retries);

      // 記錄 Token 使用情況
      const usage = res?.data?.usage;
      if (usage) {
        tokenTracker.record(this.role, usage);
        console.log(`  Token usage: Input=${usage.prompt_tokens}, Output=${usage.completion_tokens}, Total=${usage.total_tokens}`);
      }

      // 獲取選擇，但內容還要再過濾
      const choices = res?.data?.choices;
      if (!Array.isArray(choices) || choices.length === 0) {
        const raw = JSON.stringify(res?.data || {}, null, 2);
        throw new AgentError(
          this.role,
          `API return no choices`,
          new Error(`API response: \n${raw}`),
          usage
        );
      }

      // 獲取真正輸出的內容
      const content = choices[0]?.message?.content;
      if (typeof content !== "string") {
        const raw = JSON.stringify(choices[0] || {}, null, 2);
        throw new AgentError(
          this.role,
          `choices[0].message.content is not a string`,
          new Error(`API response: \n${raw}`),
          usage
        );
      }

      // 獲取經過清理後的輸出，trim()是去除字串兩端的空白字元
      const output = content.trim();
      // 儲存輸出
      fs.mkdirSync("./outputs", { recursive: true });
      // 檔案名稱
      const fileName = `./outputs/${this.role.replace(/\s+/g, "_")}.txt`;
      // 儲存輸出
      fs.writeFileSync(fileName, output);
      console.log(` ${this.role} output saved to ${fileName}`);
      return output;
    } catch (err) {
      // 使用統一的錯誤處理
      errorLogger.log(err, { role: this.role, input: input.substring(0, 100) });

      // 如果是自定義錯誤，直接拋出
      if (err instanceof AgentError || err instanceof Error) {
        throw err;
      }

      // 否則包裝為 AgentError
      throw new AgentError(
        this.role,
        `API call failed: ${err.message}`,
        err
      );
    }
  }
}
