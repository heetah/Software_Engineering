/**
 * @file Electron 主進程 (Main Process) 腳本
 */

// * 修改：匯入 'dialog' 用於安全確認
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// 全域資料庫實例
let db;

/**
 * -------------------------------------------------------------------
 * 1. 資料庫初始化
 * -------------------------------------------------------------------
 */
function initDatabase() {
  return new Promise((resolve, reject) => {
    const dbPath = path.join(app.getPath('userData'), 'chat-history.db');
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

/**
 * -------------------------------------------------------------------
 * 2. 資料庫輔助函式 (Promisification)
 * -------------------------------------------------------------------
 */

// 執行 INSERT, UPDATE, DELETE
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database is not initialised.'));
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

// 執行 SELECT ... LIMIT 1
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database is not initialised.'));
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

// 執行 SELECT (回傳多筆)
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database is not initialised.'));
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

/**
 * -------------------------------------------------------------------
 * 3. IPC (Inter-Process Communication) 處理器
 * -------------------------------------------------------------------
 */
function registerHistoryHandlers() {
  console.log('✅ Main Process: Registering history handlers...');
  
  // *** 新增：獲取應用程式資料路徑 ***
  ipcMain.handle('settings:get-app-data-path', () => {
    return app.getPath('userData');
  });

  // *** 新增：清除所有歷史紀錄 ***
  ipcMain.handle('history:clear-all', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    
    // 顯示原生確認對話框
    const { response } = await dialog.showMessageBox(window, {
      type: 'warning',
      title: '確認清除',
      message: '您確定要清除所有對話紀錄嗎？',
      detail: '此操作將永久刪除所有會話與訊息，且無法復原。',
      buttons: ['取消', '全部清除'], // 0: 取消, 1: 清除
      defaultId: 0,
      cancelId: 0,
    });

    if (response !== 1) { // 如果使用者點了 "取消"
      return { ok: false, cancelled: true };
    }

    // 使用者已確認，執行刪除
    try {
      // 由於 "ON DELETE CASCADE"，我們只需要刪除 sessions
      await run('DELETE FROM sessions');
      console.log('History cleared successfully.');
      return { ok: true, cancelled: false };
    } catch (error) {
      console.error('Failed to clear history', error);
      return { ok: false, error: error.message };
    }
  });

  // (現有的 handlers 保持不變)
  ipcMain.handle('history:create-session', async () => {
    console.log('✅ Main Process: Registering CREATE-SESSION handler.');
    const row = await get('SELECT MAX(sequence) AS maxSeq FROM sessions');
    const nextSeq = (row?.maxSeq || 0) + 1;
    const title = `Session ${String(nextSeq).padStart(3, '0')}`;
    const insertResult = await run(
      'INSERT INTO sessions (sequence, title, metadata_json) VALUES (?, ?, ?)',
      [nextSeq, title, JSON.stringify({})]
    );

    return {
      id: insertResult.lastID,
      sequence: nextSeq,
      title
    };
  });

  ipcMain.handle('history:get-sessions', async () => {
    console.log('✅ Main Process: Registering GET-SESSIONS handler.');
    return all(
      `
        SELECT
          s.id,
          s.sequence,
          s.title,
          s.created_at,
          COALESCE(m.message_count, 0) AS message_count
        FROM sessions AS s
        LEFT JOIN (
          SELECT session_id, COUNT(*) AS message_count
          FROM messages
          GROUP BY session_id
        ) AS m ON m.session_id = s.id
        ORDER BY s.created_at DESC
      `
    );
  });

  ipcMain.handle('history:get-messages', async (_event, sessionId) => {
    const rows = await all(
      'SELECT id, role, payload_json, created_at FROM messages WHERE session_id = ? ORDER BY created_at ASC',
      [sessionId]
    );

    return rows.map((row) => ({
      id: row.id,
      role: row.role,
      createdAt: row.created_at,
      payload: JSON.parse(row.payload_json)
    }));
  });

  ipcMain.handle('history:add-message', async (_event, { sessionId, role, content }) => {
    if (!sessionId) {
      throw new Error('sessionId is required to persist a message.');
    }

    const payload = { role, content };
    await run(
      'INSERT INTO messages (session_id, role, payload_json) VALUES (?, ?, ?)',
      [sessionId, role, JSON.stringify(payload)]
    );

    return { ok: true };
  });

}

/**
 * -------------------------------------------------------------------
 * 4. 視窗創建
 * -------------------------------------------------------------------
 */
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // preload: path.join(__dirname, 'preload.js'),
      // 安全性警告：這些設定不安全，但符合你目前的程式碼 (renderer.js 使用 'require')
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'dev_page', 'main-window.html'));
  mainWindow.webContents.openDevTools();
}

/**
 * -------------------------------------------------------------------
 * 5. Electron 應用程式生命週期
 * -------------------------------------------------------------------
 */

app.whenReady().then(async () => {
  try {
    await initDatabase();
    registerHistoryHandlers(); // 註冊所有 IPC API
    createWindow();
  } catch (error) {
    console.error('Failed to initialise database. App will quit.', error);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  if (db) {
    console.log('Closing database connection...');
    db.close();
  }
});
