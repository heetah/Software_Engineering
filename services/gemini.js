// 載入環境變數
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

// Gemini API 設定
const GEMINI_API_KEY =
  process.env.GOOGLE_API_KEY || "請在.env檔案中設定GEMINI_API_KEY";
// 使用最新的 Gemini 2.0 Flash 模型
const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

export async function askGemini(prompt, apiKey = null) {
  try {
    // 優先使用傳入的 apiKey，否則使用環境變數
    const keyToUse = apiKey || GEMINI_API_KEY;

    // 檢查 API Key 是否設定
    if (!keyToUse || keyToUse.includes("請在.env檔案中設定")) {
      console.warn("Gemini API Key 未設定");
      return {
        ok: false,
        error: "Gemini API Key 未設定",
      };
    }

    const response = await fetch(`${GEMINI_API_URL}?key=${keyToUse}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Gemini API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    // Safely extract the generated text from the Gemini response.
    const text =
      data &&
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text;

    if (!text) {
      console.error("Unexpected Gemini response shape:", data);
      return { ok: false, error: "Unexpected Gemini response shape" };
    }

    return {
      ok: true,
      response: text,
    };
  } catch (error) {
    console.error("Gemini API error:", error);
    return {
      ok: false,
      error: error.message,
    };
  }
}
