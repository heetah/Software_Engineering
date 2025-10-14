const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  // 創建瀏覽器窗口
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
    },
    icon: path.join(__dirname, 'assets/icon.png'), // 如果有圖標的話
  });

  // 加載應用程式的 index.html 文件
  mainWindow.loadFile('index.html');

  // 當窗口被關閉時觸發
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 開發時打開開發者工具
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

// 當 Electron 完成初始化時觸發
app.whenReady().then(createWindow);

// 當全部窗口都被關閉時退出
app.on('window-all-closed', () => {
  // 在 macOS 上，除非用戶用 Cmd + Q 確定地退出，
  // 否則絕大多數應用程式及其菜單欄會保持激活
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // 在 macOS 上，當點擊 dock 圖標且沒有其他窗口打開時，
  // 通常會在應用程式中重新創建一個窗口
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
