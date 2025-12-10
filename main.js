/**
 * @file Electron Main Process
 * Integrates AI Copilot Assistant and Screenshot Tool
 */

import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  screen,
  globalShortcut,
  desktopCapturer,
} from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import dotenv from "dotenv";
import fs from "fs";

// Setup __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Setup require for CommonJS modules
const require = createRequire(import.meta.url);
const sqlite3 = require("sqlite3").verbose();
// Use native fetch in Node 18+ (Electron 29+ has it)
// const fetch = global.fetch;

// Load environment variables
dotenv.config();

// --- HEAD: Database Setup ---
let db;

// --- AA: Vision API Setup ---
const GOOGLE_API_KEY =
  process.env.GOOGLE_API_KEY || "AIzaSyBnbtdTqWT80E7dyS3MUr0LTZ68lxjMWAc";
// Disable AutoResizeOutputDevice
app.commandLine.appendSwitch("disable-features", "AutoResizeOutputDevice");

// --- Global Variables ---
let mainWindow = null;
let captureWindow = null;
let isCapturing = false;

async function zipWorkspaceDirectory(directoryPath) {
  const resolvedDir = path.resolve(directoryPath);
  if (!fs.existsSync(resolvedDir) || !fs.lstatSync(resolvedDir).isDirectory()) {
    throw new Error(`Workspace directory not found: ${resolvedDir}`);
  }

  const zipName = `${path.basename(resolvedDir)}.zip`;
  const zipPath = path.join(path.dirname(resolvedDir), zipName);

  try {
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }
  } catch (error) {
    console.warn("Unable to remove existing zip file:", error.message);
  }

  // 需要確認 archiver 是否已安裝，若無則需要處理
  const archiver = (await import("archiver")).default;

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve(zipPath));
    archive.on("error", (err) => reject(err));

    archive.pipe(output);
    archive.directory(resolvedDir, path.basename(resolvedDir));
    archive.finalize();
  });
}

// --- HEAD: Database Functions ---
async function normalizeSessions() {
  // Re-sequence sessions to be contiguous and refresh titles (Session 001, 002, ...)
  const rows = await all(
    "SELECT id, sequence, title, created_at FROM sessions ORDER BY created_at ASC"
  );
  if (!rows || rows.length === 0) return [];

  const planned = rows.map((row, idx) => ({
    id: row.id,
    newSequence: idx + 1,
    newTitle: `Session ${String(idx + 1).padStart(3, "0")}`,
  }));

  // Two-phase update to avoid UNIQUE conflicts on sequence
  await run("BEGIN IMMEDIATE");
  try {
    for (const p of planned) {
      await run("UPDATE sessions SET sequence = ? WHERE id = ?", [
        p.newSequence + 1000000,
        p.id,
      ]);
    }
    for (const p of planned) {
      await run("UPDATE sessions SET sequence = ?, title = ? WHERE id = ?", [
        p.newSequence,
        p.newTitle,
        p.id,
      ]);
    }
    await run("COMMIT");
  } catch (error) {
    await run("ROLLBACK").catch(() => {});
    throw error;
  }

  return all(
    `SELECT s.id, s.sequence, s.title, s.created_at, COALESCE(m.message_count, 0) AS message_count
     FROM sessions AS s
     LEFT JOIN (SELECT session_id, COUNT(*) AS message_count FROM messages GROUP BY session_id) AS m ON m.session_id = s.id
     ORDER BY s.created_at DESC`
  );
}

function initDatabase() {
  return new Promise((resolve, reject) => {
    const dbPath = path.join(app.getPath("userData"), "chat-history.db");
    db = new sqlite3.Database(dbPath, (connectionError) => {
      if (connectionError) {
        reject(connectionError);
        return;
      }
      console.log(`Database opened successfully at: ${dbPath}`);
      db.exec(
        `
          PRAGMA journal_mode = WAL;
          CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sequence INTEGER NOT NULL UNIQUE,
            title TEXT NOT NULL,
            metadata_json TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            role TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `,
        (migrationError) => {
          if (migrationError) {
            reject(migrationError);
          } else {
            resolve();
          }
        }
      );
    });
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error("Database is not initialised."));
      return;
    }
    db.run(sql, params, function onComplete(runError) {
      if (runError) {
        reject(runError);
      } else {
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error("Database is not initialised."));
      return;
    }
    db.get(sql, params, (getError, row) => {
      if (getError) {
        reject(getError);
      } else {
        resolve(row);
      }
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error("Database is not initialised."));
      return;
    }
    db.all(sql, params, (allError, rows) => {
      if (allError) {
        reject(allError);
      } else {
        resolve(rows);
      }
    });
  });
}

// --- HEAD: IPC Handlers (History, Settings, Coordinator) ---
function registerHistoryHandlers() {
  console.log("Main Process: Registering history handlers...");
  ipcMain.handle("history:create-session", async () => {
    const row = await get("SELECT MAX(sequence) AS maxSeq FROM sessions");
    const nextSeq = (row?.maxSeq || 0) + 1;
    const title = `Session ${String(nextSeq).padStart(3, "0")}`;
    const insertResult = await run(
      "INSERT INTO sessions (sequence, title, metadata_json) VALUES (?, ?, ?)",
      [nextSeq, title, JSON.stringify({})]
    );
    return { id: insertResult.lastID, sequence: nextSeq, title };
  });

  ipcMain.handle("history:get-sessions", async () => {
    return all(
      `SELECT s.id, s.sequence, s.title, s.created_at, COALESCE(m.message_count, 0) AS message_count
       FROM sessions AS s
       LEFT JOIN (SELECT session_id, COUNT(*) AS message_count FROM messages GROUP BY session_id) AS m ON m.session_id = s.id
       ORDER BY s.created_at DESC`
    );
  });

  ipcMain.handle("history:normalize", async () => {
    return normalizeSessions();
  });

  ipcMain.handle("history:get-messages", async (_event, sessionId) => {
    const rows = await all(
      "SELECT id, role, payload_json, created_at FROM messages WHERE session_id = ? ORDER BY created_at ASC",
      [sessionId]
    );
    return rows.map((row) => ({
      id: row.id,
      role: row.role,
      createdAt: row.created_at,
      payload: JSON.parse(row.payload_json),
    }));
  });

  ipcMain.handle(
    "history:add-message",
    async (_event, { sessionId, role, content }) => {
      if (!sessionId)
        throw new Error("sessionId is required to persist a message.");
      const payload = { role, content };
      await run(
        "INSERT INTO messages (session_id, role, payload_json) VALUES (?, ?, ?)",
        [sessionId, role, JSON.stringify(payload)]
      );
      return { ok: true };
    }
  );

  // 刪除單一會話（並透過 ON DELETE CASCADE 一併刪除其訊息）
  ipcMain.handle("history:delete-session", async (_event, sessionId) => {
    if (!sessionId) {
      return { ok: false, error: "sessionId is required" };
    }
    try {
      await run("DELETE FROM sessions WHERE id = ?", [sessionId]);
      return { ok: true };
    } catch (error) {
      console.error("Failed to delete session", error);
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle("history:clear-all", async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const { response } = await dialog.showMessageBox(window, {
      type: "warning",
      title: "確認清除",
      message: "您確定要清除所有對話紀錄嗎？",
      detail: "此操作將永久刪除所有會話與訊息，且無法復原。",
      buttons: ["取消", "全部清除"],
      defaultId: 0,
      cancelId: 0,
    });
    if (response !== 1) return { ok: false, cancelled: true };
    try {
      await run("DELETE FROM sessions");
      console.log("History cleared successfully.");
      return { ok: true, cancelled: false };
    } catch (error) {
      console.error("Failed to clear history", error);
      return { ok: false, error: error.message };
    }
  });

  // 下載 ZIP 檔案的處理器
  ipcMain.handle(
    "download:save-zip",
    async (event, { zipPath, defaultName }) => {
      try {
        const window = BrowserWindow.fromWebContents(event.sender);
        const { canceled, filePath } = await dialog.showSaveDialog(window, {
          title: "儲存專案壓縮檔",
          defaultPath: defaultName || "project.zip",
          filters: [{ name: "ZIP Files", extensions: ["zip"] }],
        });

        if (canceled || !filePath) {
          return { ok: false, cancelled: true };
        }

        fs.copyFileSync(zipPath, filePath);
        return { ok: true, filePath };
      } catch (error) {
        console.error("Failed to save zip file:", error);
        return { ok: false, error: error.message };
      }
    }
  );
}

function registerSettingsHandlers() {
  ipcMain.handle("settings:get-app-data-path", () => {
    return app.getPath("userData");
  });
}

function registerCoordinatorBridge() {
  let coordinatorModule = null;
  let agents = null;
  async function initializeCoordinator() {
    if (!coordinatorModule) {
      coordinatorModule = await import("./Coordinator.js");
      agents = coordinatorModule.initializeAgents();
    }
    return { coordinatorModule, agents };
  }

  ipcMain.on("message-to-agent", async (event, payload) => {
    try {
      const { type, content, session, llmProvider, apiKeys } = payload || {};
      if (!content || type !== "text") {
        console.warn("Received invalid message format:", payload);
        return;
      }
      console.log(
        `[Coordinator Bridge] Received user input: ${content.substring(
          0,
          50
        )}...`
      );
      let initializedAgents;
      try {
        const result = await initializeCoordinator();
        coordinatorModule = result.coordinatorModule;
        initializedAgents = result.agents;
      } catch (initError) {
        console.error(
          "[Coordinator Bridge] Failed to initialize Coordinator:",
          initError
        );
        throw new Error(`Initialization failed: ${initError.message}`);
      }

      let plan;
      try {
        plan = await coordinatorModule.runWithInstructionService(
          content,
          initializedAgents,
          {
            llmProvider: llmProvider || "auto",
            apiKeys: apiKeys || {},
            baseDir: app.getPath("userData"),
          }
        );
      } catch (processError) {
        console.error(
          "[Coordinator Bridge] Coordinator processing failed:",
          processError
        );
        if (processError.message && processError.message.includes("napi")) {
          throw new Error(
            "Internal error occurred during processing, please try again later or check logs"
          );
        }
        throw processError;
      }

      let responseText = "";
      let downloadInfo = null;

      if (plan) {
        // 單純問答模式：直接顯示 LLM 回覆
        if (plan.mode === "qa") {
          responseText = plan.answerText || "";
        } else {
          // 專案生成模式：簡化訊息並強調下載
          responseText = `專案生成已完成！\n\n您要求的檔案已準備就緒，請點擊下方按鈕下載完整壓縮檔。\n\nSession ID: ${
            plan.id
          }\n資料夾位置: ${plan.workspaceDir || "N/A"}\n\n`;

          if (plan.output?.plan) {
            responseText += `📋 計劃名稱: ${plan.output.plan.title}\n📝 計劃摘要: ${plan.output.plan.summary}\n\n`;
          }

          const resolvedWorkspaceDir = plan.workspaceDir
            ? path.isAbsolute(plan.workspaceDir)
              ? plan.workspaceDir
              : path.join(__dirname, plan.workspaceDir)
            : null;

          if (resolvedWorkspaceDir) {
            try {
              // 確保 zipWorkspaceDirectory 函式可用 (假設已定義在 main.js 上方)
              const zipPath = await zipWorkspaceDirectory(resolvedWorkspaceDir);
              downloadInfo = {
                path: zipPath,
                filename: path.basename(zipPath),
                workspaceDir: resolvedWorkspaceDir,
              };
              responseText += `\n\n已準備好壓縮檔: ${zipPath}`;
            } catch (zipError) {
              console.error(
                "[Coordinator Bridge] Failed to zip workspace:",
                zipError
              );
            }
          }
          responseText += `\nTip: Project generated in ${
            plan.workspaceDir || "output/" + plan.id
          } directory`;
        }
      } else {
        responseText = "Processing completed, but no plan information returned";
      }

      event.sender.send("message-from-agent", {
        type: downloadInfo ? "download" : "text",
        content: responseText,
        download: downloadInfo,
      });

      if (session?.id) {
        const payloadToPersist = {
          role: "ai",
          content: responseText,
          type: downloadInfo ? "download" : "text",
        };
        if (downloadInfo) {
          payloadToPersist.download = downloadInfo;
        }

        await run(
          "INSERT INTO messages (session_id, role, payload_json) VALUES (?, ?, ?)",
          [session.id, "ai", JSON.stringify(payloadToPersist)]
        ).catch((err) => {
          console.error("Failed to write AI response to history:", err);
        });
      }
      console.log(
        `[Coordinator Bridge] Processing completed, Session ID: ${
          plan?.id || "N/A"
        }`
      );
    } catch (error) {
      console.error("[Coordinator Bridge] Error processing message:", error);
      const errorMessage = `Processing failed: ${error.message}\n\nPlease check console for detailed error information.`;
      event.sender.send("message-from-agent", {
        type: "error",
        content: errorMessage,
      });
      if (payload?.session?.id) {
        await run(
          "INSERT INTO messages (session_id, role, payload_json) VALUES (?, ?, ?)",
          [
            payload.session.id,
            "ai",
            JSON.stringify({ role: "ai", content: errorMessage }),
          ]
        ).catch((err) => {
          console.error("Failed to write error message to history:", err);
        });
      }
    }
  });
}

// --- AA: Vision IPC Handlers ---
function registerVisionHandlers() {
  ipcMain.on("close-capture-window", () => {
    if (captureWindow) {
      isCapturing = false;
      captureWindow.hide();

      // 清除視窗內容，為下次使用做準備
      captureWindow.webContents
        .executeJavaScript(
          `
        if (typeof resetCanvas === 'function') {
          resetCanvas();
        }
      `
        )
        .catch(() => {
          // 忽略錯誤，視窗可能還沒載入完成
        });
    }
  });

  // Google Lens 以圖搜圖
  ipcMain.on("open-google-lens", async (event, imageData) => {
    try {
      console.log("Opening Google Lens with image...");

      // 將圖片儲存到臨時檔案
      const tempPath = path.join(__dirname, "temp");
      if (!fs.existsSync(tempPath)) {
        fs.mkdirSync(tempPath, { recursive: true });
      }

      const timestamp = Date.now();
      const imagePath = path.join(tempPath, `google-search-${timestamp}.png`);
      const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
      fs.writeFileSync(imagePath, base64Data, "base64");

      console.log("Image saved to:", imagePath);

      const { shell } = require("electron");

      // 建立一個使用正確 Google Lens 端點的 HTML 頁面
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Google Lens 搜圖</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      margin: 0;
      padding: 20px;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    .container {
      background: white;
      border-radius: 16px;
      padding: 40px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      max-width: 600px;
      text-align: center;
    }
    h1 {
      color: #333;
      margin-bottom: 20px;
      font-size: 28px;
    }
    .status {
      color: #666;
      font-size: 16px;
      margin: 20px 0;
      line-height: 1.6;
    }
    .spinner {
      border: 4px solid #f3f3f3;
      border-top: 4px solid #4285f4;
      border-radius: 50%;
      width: 50px;
      height: 50px;
      animation: spin 1s linear infinite;
      margin: 30px auto;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    img {
      max-width: 100%;
      max-height: 300px;
      border-radius: 8px;
      margin: 20px 0;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .manual-link {
      display: inline-block;
      margin-top: 20px;
      padding: 12px 24px;
      background: #4285f4;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      font-size: 14px;
      transition: background 0.3s;
    }
    .manual-link:hover {
      background: #357ae8;
    }
    #uploadForm {
      display: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔍 Google Lens 搜圖</h1>
    <img src="data:image/png;base64,${base64Data}" alt="Captured Image" id="previewImage">
    <div class="spinner"></div>
    <div class="status" id="status">正在準備上傳到 Google Lens...</div>
    
    <!-- 表單用於上傳到 Google Lens -->
    <form id="uploadForm" action="https://lens.google.com/upload" method="POST" enctype="multipart/form-data" target="_blank">
      <input type="file" name="encoded_image" id="fileInput">
    </form>
    
    <a href="https://www.google.com/?olud" class="manual-link" id="manualLink" style="display:none;">手動開啟 Google Lens</a>
  </div>
  
  <script>
    // 將 base64 轉換為 Blob
    function base64ToBlob(base64, contentType = 'image/png') {
      const byteCharacters = atob(base64);
      const byteArrays = [];
      
      for (let offset = 0; offset < byteCharacters.length; offset += 512) {
        const slice = byteCharacters.slice(offset, offset + 512);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
          byteNumbers[i] = slice.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
      }
      
      return new Blob(byteArrays, { type: contentType });
    }
    
    // 自動上傳到 Google Lens
    async function uploadToGoogleLens() {
      try {
        document.getElementById('status').textContent = '正在上傳圖片到 Google Lens...';
        
        const base64Data = '${base64Data}';
        const blob = base64ToBlob(base64Data);
        
        // 使用表單提交
        const form = document.getElementById('uploadForm');
        const fileInput = document.getElementById('fileInput');
        
        // 將 blob 轉換為 File 物件
        const file = new File([blob], 'screenshot.png', { type: 'image/png' });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;
        
        document.getElementById('status').textContent = '正在開啟 Google Lens...';
        
        // 提交表單到新視窗
        setTimeout(() => {
          form.submit();
          document.getElementById('status').innerHTML = '✅ Google Lens 已在新視窗中開啟！<br><br>搜尋結果將顯示在瀏覽器中。';
          document.querySelector('.spinner').style.display = 'none';
          document.getElementById('manualLink').style.display = 'inline-block';
        }, 800);
        
      } catch (error) {
        console.error('Upload error:', error);
        document.getElementById('status').innerHTML = '正在開啟 Google Lens...<br><br>請稍候片刻。';
        document.querySelector('.spinner').style.display = 'none';
        
        setTimeout(() => {
          window.open('https://www.google.com/?olud', '_blank');
          document.getElementById('manualLink').style.display = 'inline-block';
        }, 500);
      }
    }
    
    // 頁面載入後自動執行
    window.onload = () => {
      setTimeout(uploadToGoogleLens, 800);
    };
  </script>
</body>
</html>
      `;

      const htmlPath = path.join(tempPath, `google-search-${timestamp}.html`);
      fs.writeFileSync(htmlPath, htmlContent, "utf8");

      // 使用預設瀏覽器開啟
      shell
        .openPath(htmlPath)
        .then(() => {
          console.log("Google Lens search initiated successfully");
        })
        .catch((err) => {
          console.error("Failed to open search page:", err);
        });
    } catch (error) {
      console.error("Error opening Google Lens:", error);
      dialog.showErrorBox("錯誤", `無法開啟 Google Lens: ${error.message}`);
    }
  });

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

      const textAnnotations = resp.textAnnotations || [];
      const detectedText = textAnnotations[0]?.description || "";
      const labels = (resp.labelAnnotations || [])
        .map((l) => l.description)
        .join(", ");

      console.log("Detected text:", detectedText);
      console.log("Labels:", labels);

      let prompt = "";
      if (
        detectedText.match(/[+\-×÷=√∫∑π∆∂θ]/g) ||
        labels.toLowerCase().includes("math") ||
        labels.toLowerCase().includes("equation")
      ) {
        prompt = `我看到一個可能是數學相關的內容。文字是:\n"${detectedText}"\n\n請用繁體中文回答，並且：\n1. 判斷這是否是數學公式或問題\n2. 如果是，請解釋這個數學概念並提供解答步驟\n3. 如果不是，請說明這段內容的主要意思`;
      } else if (
        labels.toLowerCase().includes("code") ||
        labels.toLowerCase().includes("programming") ||
        detectedText.match(
          /(function|class|def|var|const|let|if|for|while|import|from|return)/g
        )
      ) {
        prompt = `我看到一段可能是程式碼的內容:\n"${detectedText}"\n\n請用繁體中文回答，並且：\n1. 判斷這是哪種程式語言\n2. 解釋這段程式碼的功能\n3. 提供可能的使用場景\n4. 如果有可能的改進建議，請一併提出`;
      } else if (
        labels.toLowerCase().includes("chart") ||
        labels.toLowerCase().includes("graph") ||
        labels.toLowerCase().includes("table")
      ) {
        prompt = `我看到一個可能是圖表或表格的內容。看到的文字是:\n"${detectedText}"\n\n請用繁體中文回答，並且：\n1. 分析這些數據或資訊\n2. 提供主要觀察和見解\n3. 如果可能，提出可能的趨勢或建議`;
      } else {
        prompt = `我看到以下內容:\n"${detectedText}"\n\n標籤: ${labels}\n\n請用繁體中文回答，並且：\n1. 理解並分析這段內容的主要意思\n2. 如果是問題，請提供答案\n3. 如果是陳述，請提供見解或建議\n4. 如果需要補充說明，請一併提出`;
      }

      const { askGemini } = await import("./services/gemini.js");
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

  ipcMain.on("selection-complete", async (event, imageData) => {
    try {
      console.log("Screenshot data received");
      const tempPath = path.join(__dirname, "temp");
      if (!fs.existsSync(tempPath)) {
        fs.mkdirSync(tempPath);
      }
      const imagePath = path.join(tempPath, `screenshot-${Date.now()}.png`);
      fs.writeFileSync(
        imagePath,
        imageData.replace(/^data:image\/png;base64,/, ""),
        "base64"
      );
      console.log("Screenshot saved:", imagePath);

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

        const web = resp.webDetection || {};
        const guesses = (web.bestGuessLabels || [])
          .map((g) => g.label)
          .join("; ");
        const textAnnotations = resp.textAnnotations || [];
        const detectedText = textAnnotations[0]?.description || "";
        const labels = (resp.labelAnnotations || [])
          .map(
            (label) =>
              `${label.description} (${Math.round(label.score * 100)}%)`
          )
          .join("; ");
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
        try {
          const { askGemini } = await import("./services/gemini.js");
          const geminiPrompt = `請用繁體中文分析以下圖片資訊，並提供簡潔、易懂的總結和建議。\n\n圖片資訊：\n${summary}\n\n請提供：\n1. 這張圖片的主要內容摘要\n2. 重要的觀察或見解\n3. 如果有建議或延伸思考，請一併說明\n\n請以親切、專業的語氣回答。`;
          console.log("Calling Gemini for summary...");
          const geminiResponse = await askGemini(geminiPrompt);
          if (geminiResponse && geminiResponse.ok) {
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
        let friendlyMessage = `Image search failed: ${error.message}`;
        try {
          const msg = String(error.message);
          const firstBrace = msg.indexOf("{");
          const lastBrace = msg.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            const jsonStr = msg.slice(firstBrace, lastBrace + 1);
            const obj = JSON.parse(jsonStr);
            if (obj && obj.error) {
              const serverMsg = obj.error.message || JSON.stringify(obj.error);
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
}

// --- HEAD: Create Main Window ---
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      spellcheck: false,
      enableWebSQL: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, "dev_page", "main-window.html"));

  // 允許使用 F12 或 Ctrl/Cmd + Shift/Alt + I 來手動切換 DevTools（預設不自動開啟）
  mainWindow.webContents.on("before-input-event", (event, input) => {
    const isToggleKey =
      (input.key === "F12" && input.type === "keyDown") ||
      ((input.control || input.meta) &&
        (input.shift || input.alt) &&
        input.key.toLowerCase() === "i" &&
        input.type === "keyDown");

    if (isToggleKey) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // 預設不自動開啟 DevTools，只有當明確設定 ELECTRON_OPEN_DEVTOOLS=true 時才自動開啟
  const shouldOpenDevTools = process.env.ELECTRON_OPEN_DEVTOOLS === "true";
  if (shouldOpenDevTools) {
    mainWindow.webContents.openDevTools();
    console.log(
      "ℹ DevTools has been opened because ELECTRON_OPEN_DEVTOOLS=true."
    );
  }
}

// --- AA: Create Capture Window ---
function createCaptureWindow() {
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
        preload: path.join(__dirname, "circle-to-search", "preload.js"),
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    captureWindow.loadFile(
      path.join(__dirname, "circle-to-search", "index.html")
    );
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

// --- App Lifecycle ---
async function startCapture() {
  if (isCapturing) {
    console.log("Screenshot in progress, ignoring trigger");
    return;
  }
  try {
    isCapturing = true;
    const sources = await desktopCapturer.getSources({ types: ["screen"] });
    if (captureWindow && sources.length > 0) {
      // 確保視窗處於正確狀態
      if (!captureWindow.isVisible()) {
        captureWindow.show();
      }
      // 發送新的截圖源
      captureWindow.webContents.send("SET_SCREEN_SOURCE", sources[0].id);
      captureWindow.focus();
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

app.whenReady().then(async () => {
  try {
    await initDatabase();
    registerHistoryHandlers();
    registerSettingsHandlers();
    registerCoordinatorBridge();
    registerVisionHandlers();

    createMainWindow();
    createCaptureWindow();

    try {
      globalShortcut.register("CommandOrControl+Shift+A", startCapture);
      console.log("Hotkey registered successfully: CommandOrControl+Shift+A");
    } catch (error) {
      console.error("Error registering hotkey:", error);
    }
  } catch (error) {
    console.error("Failed to initialise database", error);
    app.quit();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("quit", () => {
  if (db) {
    console.log("Closing database connection...");
    db.close();
  }
});
