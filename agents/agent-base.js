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

const BASE_URL = process.env.BASE_URL;
const API_KEY = process.env.API_KEY;

export default class BaseAgent {
  constructor(role, format, logicalName, options = {}) {
    this.role = role; // 角色
    this.format = format; // 格式
    this.logicalName = logicalName; // 邏輯模型
    this.temperature = 0.3; // 控制參數
    this.maxTokens = undefined; // 可用的最大 tokens，由子類設定
    
    // 支援自定義 API 端點和 Key（用於使用不同的 API 服務）
    this.baseUrl = options.baseUrl || BASE_URL;
    this.apiKey = options.apiKey || API_KEY;
    
    // 重試配置
    this.maxRetries = options.maxRetries || config.api.maxRetries;
    this.retryDelay = options.retryDelay || config.api.retryDelay;
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
    if (apiProviderManager.providers.length > 0) {
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
    // 確保 payload 包含 model 參數（OpenAI API 必需）
    const model = payload.model || process.env.OPENAI_MODEL || process.env.MODEL || 'gpt-4o-mini';
    
    // 構建完整的請求負載
    const requestPayload = {
      model: model,
      temperature: payload.temperature !== undefined ? payload.temperature : this.temperature,
      messages: payload.messages || [],
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
            console.warn(`  ${this.role} Rate limited (429), waiting ${Math.ceil(delay/1000)} seconds before retry (${attempt + 1}/${retries})...`);
          }
          
          await this._wait(delay);
          continue;
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
   * 執行代理
   * @param {string} input - 輸入
   * @param {number} retries - 重試次數（可選，覆蓋默認值）
   * @returns {Promise<string>} 輸出
   */
  async run(input, retries = this.maxRetries) {
    // 打印正在執行的角色
    console.log(`\n Running ${this.role}...`);

    const payload = {
      // 不指定 model，讓 API Provider Manager 使用默認模型
      // 控制參數
      temperature: this.temperature,
      // 可用的最大 tokens
      ...(this.maxTokens ? { max_tokens: this.maxTokens } : {}),
      // system是給模型看的，user是給用戶看的
      messages: [
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
          `API 回傳無 choices`,
          new Error(`原始資料：\n${raw}`),
          usage
        );
      }

      // 獲取真正輸出的內容
      const content = choices[0]?.message?.content;
      if (typeof content !== "string") {
        const raw = JSON.stringify(choices[0] || {}, null, 2);
        throw new AgentError(
          this.role,
          `choices[0].message.content 非字串`,
          new Error(`資料：\n${raw}`),
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
        `執行失敗: ${err.message}`,
        err
      );
    }
  }
}
