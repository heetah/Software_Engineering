// API 測試腳本
require("dotenv").config();
const fetch = require("node-fetch");

const GOOGLE_API_KEY =
  process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "未設定";

async function testVisionAPI() {
  console.log("測試 Vision API...");

  // 使用一個簡單的 base64 圖片 (1x1 紅色像素)
  const testImage =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

  const url = `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_API_KEY}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content: testImage },
            features: [{ type: "LABEL_DETECTION", maxResults: 1 }],
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("❌ Vision API 錯誤:");
      console.error("狀態碼:", response.status);
      console.error("回應:", JSON.stringify(data, null, 2));

      if (data.error) {
        console.error("\n錯誤詳情:");
        console.error("- 訊息:", data.error.message);
        console.error("- 狀態:", data.error.status);
        if (data.error.details) {
          console.error(
            "- 詳細資訊:",
            JSON.stringify(data.error.details, null, 2)
          );
        }
      }
      return false;
    }

    console.log("✅ Vision API 運作正常");
    console.log("回應:", JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error("❌ Vision API 連線失敗:", error.message);
    return false;
  }
}

async function testGeminiAPI() {
  console.log("\n測試 Gemini API...");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_API_KEY}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: "Hello" }],
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("❌ Gemini API 錯誤:");
      console.error("狀態碼:", response.status);
      console.error("回應:", JSON.stringify(data, null, 2));

      if (data.error) {
        console.error("\n錯誤詳情:");
        console.error("- 訊息:", data.error.message);
        console.error("- 狀態:", data.error.status);
        if (data.error.details) {
          console.error(
            "- 詳細資訊:",
            JSON.stringify(data.error.details, null, 2)
          );
        }
      }
      return false;
    }

    console.log("✅ Gemini API 運作正常");
    console.log("回應:", JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error("❌ Gemini API 連線失敗:", error.message);
    return false;
  }
}

async function main() {
  console.log("=== Google API 測試 ===");
  console.log("API Key:", GOOGLE_API_KEY);
  console.log();

  const visionOk = await testVisionAPI();
  const geminiOk = await testGeminiAPI();

  console.log("\n=== 測試結果 ===");
  console.log("Vision API:", visionOk ? "✅ 正常" : "❌ 失敗");
  console.log("Gemini API:", geminiOk ? "✅ 正常" : "❌ 失敗");

  if (!visionOk || !geminiOk) {
    console.log("\n請檢查:");
    console.log("1. API Key 是否有效");
    console.log(
      "2. 是否在 Google Cloud Console 啟用了 Cloud Vision API 和 Generative Language API"
    );
    console.log("3. 是否設定了帳單帳戶");
    console.log("4. API Key 是否有正確的權限");
  }
}

main();
