import BaseAgent from "./agent-base.js";
import dotenv from "dotenv";

dotenv.config();

/**
 * Requirement Agent - 負責分析用戶需求並生成結構化的需求規格
 * 專注於提取明確的目標、約束條件、用戶角色和功能/非功能需求
 */
export default class RequirementAgent extends BaseAgent {
  constructor() {
    // 使用 OpenAI API（從環境變數讀取）
    super("Requirement Agent", "JSON", "requirement", {
      baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      apiKey: process.env.OPENAI_API_KEY
    });
    // 需求分析需要更高的創造性和理解能力
    this.temperature = 0.6;
    // 限制輸出長度，避免過於冗長的需求規格
    this.maxTokens = 3000;
  }

  /**
   * 生成需求分析的提示詞
   * @param {string} userInput - 用戶的原始需求輸入
   * @returns {string} 完整的提示詞
   */
  prompt(userInput) {
    return `# 需求分析任務

## 用戶原始需求
${userInput}

## 請仔細分析以上需求，並輸出結構化的 JSON 需求規格

### 輸出要求

1. **goals** (目標): 提取項目的核心目標和期望結果，每個目標應該具體且可測量
   範例：["建立一個用戶註冊系統", "提供數據可視化功能", "支持多語言界面"]

2. **constraints** (約束條件): 識別技術限制、資源限制、時間限制等
   範例：["使用 Node.js 後端", "必須支持至少 1000 併發用戶", "3 個月內完成"]

3. **user_roles** (用戶角色): 定義不同的用戶類型和他們的核心職責
   範例：["管理員：管理用戶和內容", "普通用戶：查看和編輯內容", "訪客：僅查看公開內容"]

4. **functional_requirements** (功能需求): 詳細列出系統必須實現的功能
   範例：["用戶註冊和登入功能", "CRUD 操作界面", "數據導出為 CSV 格式"]

5. **non_functional_requirements** (非功能需求): 系統的質量屬性、性能、安全性等
   範例：["響應時間 < 2 秒", "支持 HTTPS", "95% 可用性"]

### 輸出格式

嚴格遵循以下 JSON 格式，不要包含任何額外的文字、標記或註解：

{
  "goals": ["具體目標1", "具體目標2", "具體目標3"],
  "constraints": ["約束1", "約束2"],
  "user_roles": ["角色1：說明", "角色2：說明"],
  "functional_requirements": ["功能1", "功能2", "功能3"],
  "non_functional_requirements": ["非功能需求1", "非功能需求2"]
}

### 重要提示

- 確保所有字段都是字符串數組，不要使用嵌套對象
- 如果某些領域不明確，請根據上下文做出合理的推斷
- 優先關注可實現和可測量的需求
- 輸出必須是有效的 JSON，可以直接解析`;
  }

  /**
   * 覆寫 run 方法以添加輸出驗證
   * @param {string} input - 輸入的提示詞
   * @returns {Promise<string>} 驗證後的需求規格（原始字串形式）
   */
  async run(input) {
    // 執行基類的 run 方法
    const output = await super.run(input);

    // 嘗試從輸出中萃取 JSON 內容（支援 ```json 與 ``` 包裹）
    const extractJsonCandidate = (text) => {
      if (typeof text !== "string") return "";
      // 1) 優先匹配 ```json ... ```
      const fencedJson = text.match(/```\s*json\s*([\s\S]*?)```/i);
      if (fencedJson && fencedJson[1]) {
        return fencedJson[1].trim();
      }
      // 2) 匹配任意 ``` ... ```
      const fenced = text.match(/```\s*([\s\S]*?)```/);
      if (fenced && fenced[1]) {
        return fenced[1].trim();
      }
      // 3) 回退：取第一個 { 到最後一個 } 的區間
      const first = text.indexOf("{");
      const last = text.lastIndexOf("}");
      if (first !== -1 && last !== -1 && last > first) {
        return text.slice(first, last + 1).trim();
      }
      return text.trim();
    };

    // 驗證輸出是否為有效的 JSON
    try {
      const candidate = extractJsonCandidate(output);
      const parsed = JSON.parse(candidate);

      // 驗證必要的字段是否存在
      const requiredFields = [
        "goals",
        "constraints",
        "user_roles",
        "functional_requirements",
        "non_functional_requirements"
      ];

      const missingFields = requiredFields.filter(field => !(field in parsed));
      if (missingFields.length > 0) {
        console.warn(` 需求規格缺少必要字段: ${missingFields.join(", ")}`);
      }

      // 驗證每個字段是否為數組
      const invalidFields = requiredFields.filter(
        field => parsed[field] !== undefined && !Array.isArray(parsed[field])
      );
      if (invalidFields.length > 0) {
        console.warn(`  以下字段不是數組類型: ${invalidFields.join(", ")}`);
      }

      // 返回原始輸出（保持後續代理鏈一致），但已確保可解析
      return candidate;
    } catch (parseError) {
      console.error("需求規格 JSON 解析失敗:", parseError.message);
      console.error("原始輸出前 500 字符:", output.substring(0, 500));
      throw new Error("需求規格不是有效的 JSON 格式");
    }
  }
}
