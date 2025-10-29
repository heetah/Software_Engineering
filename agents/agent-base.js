import axios from "axios";
import fs from "fs";
import dotenv from "dotenv";
import { logicalModelMap } from "./logical-modelMap.js";
dotenv.config();

const BASE_URL = process.env.BASE_URL;
const API_KEY = process.env.API_KEY;
const MODEL_NAME = process.env.MODEL_NAME;

export default class BaseAgent {
  constructor(role, format, logicalName) {
    this.role = role;
    this.format = format;
    this.logicalName = logicalName;
    this.temperature = 0.3;
    this.maxTokens = undefined; // 由子類設定可用的最大 tokens
  }

  async run(input) {
    const logicalModel = logicalModelMap[this.logicalName] ||
                         process.env.MODEL_NAME;
    console.log(`\n Running ${this.role}...`);

    const payload = {
      model: logicalModel,
      temperature: this.temperature,
      ...(this.maxTokens ? { max_tokens: this.maxTokens } : {}),
      messages: [
        {
          role: "system",
          content: `You are the ${this.role}. Follow your role strictly and output only in ${this.format}.`
        },
        { role: "user", content: input }
      ]
    };

    try {
      const res = await axios.post(`${BASE_URL}/chat/completions`, payload, {
        headers: {
          "Authorization": `Bearer ${API_KEY}`,
          "Content-Type": "application/json"
        }
      });

      const choices = res?.data?.choices;
      if (!Array.isArray(choices) || choices.length === 0) {
        const raw = JSON.stringify(res?.data || {}, null, 2);
        throw new Error(`API 回傳無 choices，原始資料：\n${raw}`);
      }

      const content = choices[0]?.message?.content;
      if (typeof content !== "string") {
        const raw = JSON.stringify(choices[0] || {}, null, 2);
        throw new Error(`choices[0].message.content 非字串，資料：\n${raw}`);
      }

      const output = content.trim();
      fs.mkdirSync("./outputs", { recursive: true });
      const fileName = `./outputs/${this.role.replace(/\s+/g, "_")}.txt`;
      fs.writeFileSync(fileName, output);
      console.log(` ${this.role} output saved to ${fileName}`);
      return output;
    } catch (err) {
      const server = err?.response?.data;
      const message = err?.message;
      console.error(` ${this.role} Error:`, server || message);
      throw err;
    }
  }
}
