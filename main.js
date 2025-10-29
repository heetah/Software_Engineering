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

  // 處理截圖完成事件
  ipcMain.on("selection-complete", async (event, imageData) => {
    try {
      console.log("接收到截圖資料");
      const fs = require("fs");

      // 確保暫存資料夾存在
      const tempPath = path.join(__dirname, "temp");
      if (!fs.existsSync(tempPath)) {
        fs.mkdirSync(tempPath);
      }

      // 儲存圖片
      const imagePath = path.join(tempPath, `screenshot-${Date.now()}.png`);
      fs.writeFileSync(
        imagePath,
        imageData.replace(/^data:image\/png;base64,/, ""),
        "base64"
      );
      console.log("截圖已儲存：", imagePath);
    } catch (error) {
      console.error("Error saving screenshot:", error);
      dialog.showErrorBox(
        "Error",
        `Failed to save screenshot: ${error.message}`
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
