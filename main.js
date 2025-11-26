/**
 * @file Electron 主進程 (Main Process) 腳本
 * 主程式：負責初始化資料庫、註冊 Coordinator 橋接、建立主視窗等功能
 */

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// 在 ES module 中獲取 __dirname 的等效方式
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 使用 createRequire 來導入 CommonJS 模組（sqlite3）
const require = createRequire(import.meta.url);
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
 * 3. IPC (Inter-Process Communication) 處理器：歷史紀錄
 * -------------------------------------------------------------------
 */
function registerHistoryHandlers() {
  console.log('✅ Main Process: Registering history handlers...');

  ipcMain.handle('history:create-session', async () => {
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
      title,
    };
  });

  ipcMain.handle('history:get-sessions', async () => {
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
      payload: JSON.parse(row.payload_json),
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

  ipcMain.handle('history:delete-session', async (_event, sessionId) => {
    if (!sessionId) {
      return { ok: false, error: 'sessionId is required' };
    }
    try {
      await run('DELETE FROM sessions WHERE id = ?', [sessionId]);
      return { ok: true };
    } catch (error) {
      console.error('Failed to delete session', error);
      return { ok: false, error: error.message };
    }
  });

  // 清除所有歷史紀錄（利用 ON DELETE CASCADE）
  ipcMain.handle('history:clear-all', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);

    const { response } = await dialog.showMessageBox(window, {
      type: 'warning',
      title: '確認清除',
      message: '您確定要清除所有對話紀錄嗎？',
      detail: '此操作將永久刪除所有會話與訊息，且無法復原。',
      buttons: ['取消', '全部清除'], // 0: 取消, 1: 清除
      defaultId: 0,
      cancelId: 0,
    });

    if (response !== 1) {
      return { ok: false, cancelled: true };
    }

    try {
      // 由於 ON DELETE CASCADE，只要刪 sessions 即可
      await run('DELETE FROM sessions');
      console.log('History cleared successfully.');
      return { ok: true, cancelled: false };
    } catch (error) {
      console.error('Failed to clear history', error);
      return { ok: false, error: error.message };
    }
  });
}

/**
 * -------------------------------------------------------------------
 * 3-1. IPC：設定相關
 * -------------------------------------------------------------------
 */
function registerSettingsHandlers() {
  ipcMain.handle('settings:get-app-data-path', () => {
    return app.getPath('userData');
  });
}

/**
 * -------------------------------------------------------------------
 * 3-2. IPC：Coordinator 橋接
 * -------------------------------------------------------------------
 */
function registerCoordinatorBridge() {
  // 動態載入 Coordinator（因為它是 ES module）
  let coordinatorModule = null;
  let agents = null;

  // 延遲初始化 Coordinator
  async function initializeCoordinator() {
    if (!coordinatorModule) {
      coordinatorModule = await import('./Coordinator.js');
      agents = coordinatorModule.initializeAgents();
    }
    return { coordinatorModule, agents };
  }

  // 處理前端送來的訊息
  ipcMain.on('message-to-agent', async (event, payload) => {
    try {
      const { type, content, session } = payload || {};

      if (!content || type !== 'text') {
        console.warn('Received invalid message format:', payload);
        return;
      }

      console.log(`[Coordinator Bridge] Received user input: ${content.substring(0, 50)}...`);

      // Initialize Coordinator
      let initializedAgents;
      try {
        const result = await initializeCoordinator();
        coordinatorModule = result.coordinatorModule;
        initializedAgents = result.agents;
      } catch (initError) {
        console.error('[Coordinator Bridge] Failed to initialize Coordinator:', initError);
        throw new Error(`Initialization failed: ${initError.message}`);
      }

      // Call Coordinator to process user input
      let plan;
      try {
        plan = await coordinatorModule.runWithInstructionService(content, initializedAgents);
      } catch (processError) {
        console.error('[Coordinator Bridge] Coordinator processing failed:', processError);
        if (processError.message && processError.message.includes('napi')) {
          throw new Error('Internal error occurred during processing, please try again later or check logs');
        }
        throw processError;
      }

      // Build response message
      let responseText = '';

      if (plan) {
        responseText = `✅ Project generation completed!\n\n`;
        responseText += `Session ID: ${plan.id}\n`;
        responseText += `Workspace: ${plan.workspaceDir || 'N/A'}\n`;
        responseText += `File operations: Created=${plan.fileOps?.created?.length || 0}, Skipped=${plan.fileOps?.skipped?.length || 0}\n\n`;

        if (plan.output?.plan) {
          responseText += `📋 Plan title: ${plan.output.plan.title}\n`;
          responseText += `📝 Plan summary: ${plan.output.plan.summary}\n`;
          responseText += `📊 Steps: ${plan.output.plan.steps?.length || 0}\n\n`;
        }

        if (plan.fileOps?.created?.length > 0) {
          responseText += `📁 Generated files:\n`;
          plan.fileOps.created.slice(0, 10).forEach((file) => {
            responseText += `  • ${file}\n`;
          });
          if (plan.fileOps.created.length > 10) {
            responseText += `  ... and ${plan.fileOps.created.length - 10} more files\n`;
          }
        }

        responseText += `\n💡 Tip: Project generated in ${plan.workspaceDir || 'output/' + plan.id} directory`;
      } else {
        responseText = '⚠️ Processing completed, but no plan information returned';
      }

      // 回傳結果給前端
      event.sender.send('message-from-agent', {
        type: 'text',
        content: responseText,
      });

      // Synchronously write to history (if session exists)
      if (session?.id) {
        await run(
          'INSERT INTO messages (session_id, role, payload_json) VALUES (?, ?, ?)',
          [session.id, 'ai', JSON.stringify({ role: 'ai', content: responseText })]
        ).catch((err) => {
          console.error('Failed to write AI response to history:', err);
        });
      }

      console.log(`[Coordinator Bridge] Processing completed, Session ID: ${plan?.id || 'N/A'}`);
    } catch (error) {
      console.error('[Coordinator Bridge] Error processing message:', error);

      const errorMessage = `❌ Processing failed: ${error.message}\n\nPlease check console for detailed error information.`;

      event.sender.send('message-from-agent', {
        type: 'error',
        content: errorMessage,
      });

      // If session exists, also write error message to history
      if (payload?.session?.id) {
        await run(
          'INSERT INTO messages (session_id, role, payload_json) VALUES (?, ?, ?)',
          [payload.session.id, 'ai', JSON.stringify({ role: 'ai', content: errorMessage })]
        ).catch((err) => {
          console.error('Failed to write error message to history:', err);
        });
      }
    }
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
      contextIsolation: false,
      // 禁用一些可能導致警告的功能
      spellcheck: false,
      enableWebSQL: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'dev_page', 'main-window.html'));
  
  // Enable DevTools toggle via keyboard shortcuts (F12 or Ctrl/Cmd + Shift/Alt + I)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const isToggleKey =
      (input.key === 'F12' && input.type === 'keyDown') ||
      (
        (input.control || input.meta) &&
        (input.shift || input.alt) &&
        input.key.toLowerCase() === 'i' &&
        input.type === 'keyDown'
      );

    if (isToggleKey) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
  
  // 根據環境變數決定是否打開 DevTools
  // 設置 ELECTRON_OPEN_DEVTOOLS=false 可以關閉 DevTools（減少 Autofill 錯誤）
  const shouldOpenDevTools = process.env.ELECTRON_OPEN_DEVTOOLS !== 'false';
  
  if (shouldOpenDevTools) {
    // 打開 DevTools
    // 注意：DevTools 中的 Autofill 錯誤是無害的警告，來自 DevTools 內部協議
    // 這些錯誤不會影響應用程式功能，可以安全地忽略
    // 錯誤訊息：'Autofill.enable' wasn't found 和 'Autofill.setAddresses' wasn't found
    // 這些是 DevTools 嘗試調用不存在的協議方法時產生的，屬於正常現象
    mainWindow.webContents.openDevTools();
    
    console.log('ℹ️  DevTools has been opened. If you see Autofill related errors, you can safely ignore them.');
    console.log('    To close DevTools, please set the environment variable: ELECTRON_OPEN_DEVTOOLS=false');
  }
}

/**
 * -------------------------------------------------------------------
 * 5. Electron 應用程式生命週期
 * -------------------------------------------------------------------
 */

app.whenReady().then(async () => {
  try {
    await initDatabase();
    registerHistoryHandlers();      // 註冊歷史紀錄 IPC
    registerSettingsHandlers();     // 註冊設定 IPC
    registerCoordinatorBridge();    // 註冊 Coordinator 橋接
    createWindow();                 // 建立主視窗
  } catch (error) {
    console.error('Failed to initialise database', error);
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
