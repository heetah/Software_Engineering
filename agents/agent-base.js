import axios from "axios";
import fs from "fs";
import dotenv from "dotenv";
import { logicalModelMap } from "./logical-modelMap.js";
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
  }

  /**
   * 執行代理
   * @param {string} input - 輸入
   * @returns {string} 輸出
   */
  async run(input) {
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
      // 發送請求（使用實例的 baseUrl 和 apiKey）
      const res = await axios.post(`${this.baseUrl}/chat/completions`, payload, {
        // Bearer是Token驗證的標準；Content-Type是請求的內容類型
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        }
      });

      // 顯示 token 使用情況（如果有）
      const usage = res?.data?.usage;
      if (usage) {
        console.log(`  Token 使用: 輸入=${usage.prompt_tokens}, 輸出=${usage.completion_tokens}, 總計=${usage.total_tokens}`);
      }

      // 獲取選擇，但內容還要再過濾
      const choices = res?.data?.choices;
      if (!Array.isArray(choices) || choices.length === 0) {
        const raw = JSON.stringify(res?.data || {}, null, 2);
        throw new Error(`API 回傳無 choices，原始資料：\n${raw}`);
      }

      // 獲取真正輸出的內容
      const content = choices[0]?.message?.content;
      if (typeof content !== "string") {
        const raw = JSON.stringify(choices[0] || {}, null, 2);
        throw new Error(`choices[0].message.content 非字串，資料：\n${raw}`);
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
      // 捕獲錯誤
    } catch (err) {
      // 獲取伺服器錯誤
      const server = err?.response?.data;
      // 獲取錯誤消息
      const message = err?.message;
      console.error(` ${this.role} Error:`, server || message);
      throw err;
    }
  }
}
