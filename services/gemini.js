const fetch = global.fetch || require("node-fetch");

// Gemini API 設定
const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || "AIzaSyCOdWdWxMn0anNCe-2_RGHq-LfKJR7Hf4U";
// 正確的 API URL（若需要其他 model 或路徑，請調整此值）
const GEMINI_API_URL =
  process.env.GEMINI_API_URL ||
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent";

async function askGemini(prompt) {
  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
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

module.exports = { askGemini };
