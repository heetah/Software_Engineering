// 載入環境變數
require("dotenv").config();

const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  desktopCapturer,
  screen,
  dialog,
} = require("electron");
const path = require("path");
const fetch = global.fetch || require("node-fetch");

// Vision API Key
const GOOGLE_API_KEY =
  process.env.GOOGLE_API_KEY || "AIzaSyBnbtdTqWT80E7dyS3MUr0LTZ68lxjMWAc";

// 禁用 Chromium 的自動 DPI 調整
app.commandLine.appendSwitch("disable-features", "AutoResizeOutputDevice");

// 全域錯誤處理
process.on("uncaughtException", (error) => {
  console.error("Uncaught Error:", error);
  dialog.showErrorBox(
    "Error",
    `An unexpected error occurred: ${error.message}`
  );
});

// 全域變數
let captureWindow = null;
let isCapturing = false;

function createWindow() {
  try {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: logicalWidth, height: logicalHeight } = primaryDisplay.size;
    const { x, y } = primaryDisplay.bounds;
    const scaleFactor = primaryDisplay.scaleFactor;

    const physicalWidth = Math.round(logicalWidth * scaleFactor);
    const physicalHeight = Math.round(logicalHeight * scaleFactor);

    console.log(
      `Screen Info: Logical Size ${logicalWidth}x${logicalHeight}, Scale Factor ${scaleFactor}, Physical Size ${physicalWidth}x${physicalHeight}`
    );

    captureWindow = new BrowserWindow({
      x,
      y,
      width: physicalWidth,
      height: physicalHeight,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    captureWindow.loadFile("index.html");

    // 開發時打開開發者工具
    if (process.argv.includes("--debug")) {
      captureWindow.webContents.openDevTools();
    }

    captureWindow.on("closed", () => {
      captureWindow = null;
    });
  } catch (error) {
    console.error("Error creating window:", error);
    dialog.showErrorBox(
      "Error",
      `Failed to create screenshot window: ${error.message}`
    );
  }
}

app.whenReady().then(() => {
  createWindow();

  // 處理視窗關閉事件
  ipcMain.on("close-capture-window", () => {
    if (captureWindow) {
      isCapturing = false;
      captureWindow.hide();
    }
  });

  // Vision API + Gemini handler
  ipcMain.handle("api:image-search", async (event, imageData) => {
    try {
      console.log("Calling Vision API...");
      const content = imageData.replace(/^data:image\/\w+;base64,/, "");
      const url = `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_API_KEY}`;
      const body = {
        requests: [
          {
            image: { content },
            features: [
              { type: "TEXT_DETECTION" },
              { type: "LABEL_DETECTION", maxResults: 10 },
              { type: "WEB_DETECTION", maxResults: 5 },
              { type: "DOCUMENT_TEXT_DETECTION" },
            ],
          },
        ],
      };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        // log response body for easier debugging
        let textBody = "";
        try {
          textBody = await res.text();
        } catch (e) {
          console.error("Failed to read Vision API error body:", e);
        }
        console.error(
          "Vision API returned non-OK status:",
          res.status,
          res.statusText,
          textBody
        );
        throw new Error(
          `Vision API error: ${res.status} ${res.statusText} - ${textBody}`
        );
      }

      const json = await res.json();
      console.log("Vision API response:", json);

      const resp = json.responses && json.responses[0];
      if (!resp) {
        throw new Error("Empty response from Vision API");
      }

      // Extract text and labels
      const textAnnotations = resp.textAnnotations || [];
      const detectedText = textAnnotations[0]?.description || "";
      const labels = (resp.labelAnnotations || [])
        .map((l) => l.description)
        .join(", ");

      console.log("Detected text:", detectedText);
      console.log("Labels:", labels);

      // 根據內容類型構建 Gemini prompt（使用繁體中文）
      let prompt = "";

      // 檢測是否包含數學內容
      if (
        detectedText.match(/[+\-×÷=√∫∑π∆∂θ]/g) ||
        labels.toLowerCase().includes("math") ||
        labels.toLowerCase().includes("equation")
      ) {
        prompt = `我看到一個可能是數學相關的內容。文字是:
"${detectedText}"

請用繁體中文回答，並且：
1. 判斷這是否是數學公式或問題
2. 如果是，請解釋這個數學概念並提供解答步驟
3. 如果不是，請說明這段內容的主要意思`;
      }
      // 檢測是否包含程式碼
      else if (
        labels.toLowerCase().includes("code") ||
        labels.toLowerCase().includes("programming") ||
        detectedText.match(
          /(function|class|def|var|const|let|if|for|while|import|from|return)/g
        )
      ) {
        prompt = `我看到一段可能是程式碼的內容:
"${detectedText}"

請用繁體中文回答，並且：
1. 判斷這是哪種程式語言
2. 解釋這段程式碼的功能
3. 提供可能的使用場景
4. 如果有可能的改進建議，請一併提出`;
      }
      // 檢測是否包含表格或圖表
      else if (
        labels.toLowerCase().includes("chart") ||
        labels.toLowerCase().includes("graph") ||
        labels.toLowerCase().includes("table")
      ) {
        prompt = `我看到一個可能是圖表或表格的內容。看到的文字是:
"${detectedText}"

請用繁體中文回答，並且：
1. 分析這些數據或資訊
2. 提供主要觀察和見解
3. 如果可能，提出可能的趨勢或建議`;
      }
      // 一般文字內容
      else {
        prompt = `我看到以下內容:
"${detectedText}"

標籤: ${labels}

請用繁體中文回答，並且：
1. 理解並分析這段內容的主要意思
2. 如果是問題，請提供答案
3. 如果是陳述，請提供見解或建議
4. 如果需要補充說明，請一併提出`;
      }

      // 呼叫 Gemini API
      const { askGemini } = require("./services/gemini");
      console.log("Calling Gemini with prompt:", prompt);
      const geminiResponse = await askGemini(prompt);

      if (!geminiResponse.ok) {
        throw new Error(`Gemini API error: ${geminiResponse.error}`);
      }

      return { ok: true, summary: geminiResponse.response };
    } catch (err) {
      console.error("API error:", err);
      return { ok: false, error: err.message };
    }
  });

  // 處理截圖完成事件
  ipcMain.on("selection-complete", async (event, imageData) => {
    try {
      console.log("Screenshot data received");
      const fs = require("fs");

      // 確保暫存資料夾存在
      const tempPath = path.join(__dirname, "temp");
      if (!fs.existsSync(tempPath)) {
        fs.mkdirSync(tempPath);
      }

      // 儲存圖片並進行圖片搜尋
      const imagePath = path.join(tempPath, `screenshot-${Date.now()}.png`);
      fs.writeFileSync(
        imagePath,
        imageData.replace(/^data:image\/png;base64,/, ""),
        "base64"
      );
      console.log("Screenshot saved:", imagePath);

      // 直接呼叫 Vision API handler
      try {
        console.log("Calling Vision API...");
        const content = imageData.replace(/^data:image\/\w+;base64,/, "");
        const url = `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_API_KEY}`;
        const body = {
          requests: [
            {
              image: { content },
              features: [
                { type: "WEB_DETECTION", maxResults: 10 },
                { type: "TEXT_DETECTION" },
                { type: "LABEL_DETECTION", maxResults: 10 },
                { type: "IMAGE_PROPERTIES" },
              ],
            },
          ],
        };

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          // log response body for easier debugging
          let textBody = "";
          try {
            textBody = await res.text();
          } catch (e) {
            console.error("Failed to read Vision API error body:", e);
          }
          console.error(
            "Vision API returned non-OK status:",
            res.status,
            res.statusText,
            textBody
          );
          throw new Error(
            `Vision API error: ${res.status} ${res.statusText} - ${textBody}`
          );
        }

        const json = await res.json();
        console.log("Vision API response:", json);

        const resp = json.responses && json.responses[0];
        if (!resp) {
          throw new Error("Empty response from Vision API");
        }

        // Parse results
        const web = resp.webDetection || {};
        const guesses = (web.bestGuessLabels || [])
          .map((g) => g.label)
          .join("; ");
        const entities = (web.webEntities || [])
          .slice(0, 5)
          .map(
            (e) =>
              `${e.description || ""} (${Math.round((e.score || 0) * 100)}%)`
          )
          .join("; ");
        const pages = (web.pagesWithMatchingImages || [])
          .slice(0, 5)
          .map((p) => p.pageTitle || p.url)
          .join("\n");

        // 處理文字識別結果
        const textAnnotations = resp.textAnnotations || [];
        const detectedText = textAnnotations[0]?.description || "";

        // 處理標籤識別結果
        const labels = (resp.labelAnnotations || [])
          .map(
            (label) =>
              `${label.description} (${Math.round(label.score * 100)}%)`
          )
          .join("; ");

        // 處理主要顏色
        const colors = (
          resp.imagePropertiesAnnotation?.dominantColors?.colors || []
        )
          .slice(0, 3)
          .map((color) => {
            const { red, green, blue } = color.color;
            return `RGB(${red},${green},${blue}): ${Math.round(
              color.score * 100
            )}%`;
          })
          .join("; ");

        // 建立結構化資訊
        const imageInfo = {
          text: detectedText,
          labels:
            resp.labelAnnotations?.map((l) => ({
              name: l.description,
              confidence: Math.round(l.score * 100),
            })) || [],
          mainColors: (
            resp.imagePropertiesAnnotation?.dominantColors?.colors || []
          )
            .slice(0, 3)
            .map((c) => ({
              rgb: `RGB(${c.color.red},${c.color.green},${c.color.blue})`,
              percentage: Math.round(c.score * 100),
            })),
          webEntities: (web.webEntities || []).slice(0, 5).map((e) => ({
            name: e.description,
            confidence: Math.round((e.score || 0) * 100),
          })),
        };

        // 生成類 Gemini 的描述
        const description = [
          "我在這張圖片中看到：",
          "",
          imageInfo.text
            ? "1. 文字內容：\n" +
              imageInfo.text
                .split("\\n")
                .map((t) => `   ${t}`)
                .join("\\n")
            : null,
          "",
          imageInfo.labels.length > 0
            ? "2. 主要內容：\n" +
              imageInfo.labels
                .map((l) => `   • ${l.name} (可信度 ${l.confidence}%)`)
                .join("\\n")
            : null,
          "",
          imageInfo.mainColors.length > 0
            ? "3. 主要顏色：\n" +
              imageInfo.mainColors
                .map((c) => `   • ${c.rgb} (佔比 ${c.percentage}%)`)
                .join("\\n")
            : null,
          "",
          imageInfo.webEntities.length > 0
            ? "4. 相關概念：\n" +
              imageInfo.webEntities
                .map((e) => `   • ${e.name} (相關度 ${e.confidence}%)`)
                .join("\\n")
            : null,
          "",
          "這看起來是一個" +
            (guesses || "螢幕截圖") +
            "，" +
            "其中包含了" +
            (imageInfo.labels
              .slice(0, 3)
              .map((l) => l.name)
              .join("、") || "各種元素") +
            "。",
        ]
          .filter(Boolean)
          .join("\\n");

        const summary = description;

        // 如有設定 Gemini，呼叫 Gemini 以取得更自然語言的分析總結
        try {
          const { askGemini } = require("./services/gemini");
          const geminiPrompt = `請用繁體中文分析以下圖片資訊，並提供簡潔、易懂的總結和建議。

圖片資訊：
${summary}

請提供：
1. 這張圖片的主要內容摘要
2. 重要的觀察或見解
3. 如果有建議或延伸思考，請一併說明

請以親切、專業的語氣回答。`;
          console.log("Calling Gemini for summary...");
          const geminiResponse = await askGemini(geminiPrompt);
          if (geminiResponse && geminiResponse.ok) {
            // 如果 Gemini 回傳成功，把 Gemini 的文字結果發送給 renderer
            event.reply("update-vision-result", geminiResponse.response);
          } else {
            console.warn(
              "Gemini did not return ok, falling back to local summary",
              geminiResponse
            );
            event.reply(
              "update-vision-result",
              summary + "\n\n(注意：Gemini 分析功能暫時無法使用)"
            );
          }
        } catch (gemErr) {
          console.error("Error calling Gemini:", gemErr);
          event.reply(
            "update-vision-result",
            summary + "\n\n(注意：無法呼叫 Gemini API)"
          );
        }
      } catch (error) {
        console.error("Vision API error:", error);

        // 嘗試從 error.message 中解析伺服器回傳的 JSON 錯誤內容，提供更友善的提示
        let friendlyMessage = `Image search failed: ${error.message}`;
        try {
          // error.message 可能包含原始回應 body（我們在上方加入了 body），找出最外層的 JSON 並解析
          const msg = String(error.message);
          const firstBrace = msg.indexOf("{");
          const lastBrace = msg.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            const jsonStr = msg.slice(firstBrace, lastBrace + 1);
            const obj = JSON.parse(jsonStr);
            if (obj && obj.error) {
              const serverMsg = obj.error.message || JSON.stringify(obj.error);
              // 更具體的情況處理
              if (
                serverMsg.toLowerCase().includes("api key expired") ||
                (obj.error.details || []).some((d) =>
                  (d.reason || "").toLowerCase().includes("api_key_invalid")
                )
              ) {
                friendlyMessage =
                  "Image search failed: Google Vision API key 已過期或無效。請更新/重新產生 API key，並確認已在 Google Cloud Console 啟用 Vision API 並開啟帳單。";
              } else if (serverMsg) {
                friendlyMessage = `Image search failed: ${serverMsg}`;
              }
            }
          }
        } catch (e) {
          console.error("Failed to parse Vision API error body:", e);
        }

        dialog.showErrorBox("Error", friendlyMessage);
      }
    } catch (error) {
      console.error("Error processing screenshot:", error);
      dialog.showErrorBox(
        "Error",
        `Failed to process screenshot: ${error.message}`
      );
    }
  });

  // 註冊全域快捷鍵
  try {
    globalShortcut.register("CommandOrControl+Shift+A", startCapture);
    console.log("Hotkey registered successfully: CommandOrControl+Shift+A");
  } catch (error) {
    console.error("Error registering hotkey:", error);
    dialog.showErrorBox("Error", `Failed to register hotkey: ${error.message}`);
  }
});

// 開始截圖
async function startCapture() {
  if (isCapturing) {
    console.log("Screenshot in progress, ignoring trigger");
    return;
  }

  try {
    isCapturing = true;
    const sources = await desktopCapturer.getSources({ types: ["screen"] });
    if (captureWindow && sources.length > 0) {
      captureWindow.webContents.send("SET_SCREEN_SOURCE", sources[0].id);
      captureWindow.show();
    }
  } catch (error) {
    isCapturing = false;
    console.error("Error starting screenshot:", error);
    dialog.showErrorBox(
      "Error",
      `Failed to start screenshot: ${error.message}`
    );
  }
}

// 應用程式即將結束
app.on("will-quit", () => {
  // 清理全域快捷鍵
  globalShortcut.unregisterAll();
});

// 所有視窗關閉時結束程式 (Windows & Linux)
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// macOS 點選 Dock 圖示時重新開啟視窗
app.on("activate", () => {
  if (captureWindow === null) {
    createWindow();
  }
});
