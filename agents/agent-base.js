/**
 * 提供 Agent 的Base Class，包含API調用、重試機制、Token追蹤、錯誤處理等功能
 * 統一錯誤處理、輸出檔案儲存、Token追蹤
 */

import axios from "axios";
import fs from "fs";
import dotenv from "dotenv";
import { logicalModelMap } from "./logical-modelMap.js";
import { config } from "../utils/config.js";
import { tokenTracker } from "../utils/token-tracker.js";
import { handleAPIError, errorLogger } from "../utils/error-handler.js";
import { AgentError } from "../utils/errors.js";
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
   * 執行 API 調用（帶重試機制）
   * @param {Object} payload - 請求負載
   * @param {number} retries - 剩餘重試次數
   * @returns {Promise<Object>} API 響應
   */
  async _executeAPI(payload, retries = this.maxRetries) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await axios.post(
          `${this.baseUrl}/chat/completions`,
          payload,
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
        // 如果是最後一次嘗試，拋出錯誤
        if (attempt === retries) {
          throw handleAPIError(err, this.role);
        }

        // 指數退避：等待時間 = 基礎延遲 * 2^嘗試次數
        const delay = this.retryDelay * Math.pow(2, attempt);
        console.warn(`  ${this.role} API 調用失敗，${delay}ms 後重試 (${attempt + 1}/${retries})...`);
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
    // 獲取邏輯模型
    const logicalModel = logicalModelMap[this.logicalName];
    // 打印正在執行的角色
    console.log(`\n Running ${this.role}...`);

    const payload = {
      // 模型
      model: logicalModel,
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
        console.log(`  Token 使用: 輸入=${usage.prompt_tokens}, 輸出=${usage.completion_tokens}, 總計=${usage.total_tokens}`);
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
