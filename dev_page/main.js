/**
 * 主程式 (main.js)
 * 負責初始化資料庫、註冊 Coordinator 橋接、建立主視窗等功能
 * 已修正：移除 "Processing..." 干擾訊息，新增 F12 開發者工具快捷鍵
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

let db;

/*
 * ====================================================================
 * 1. 資料庫初始化與輔助函式
 * ====================================================================
 */

function initDatabase() {
  return new Promise((resolve, reject) => {
    const dbPath = path.join(app.getPath('userData'), 'chat-history.db');
    db = new sqlite3.Database(dbPath, (connectionError) => {
      if (connectionError) {
        reject(connectionError);
        return;
      }

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

/*
 * ====================================================================
 * 2. IPC 處理器 (歷史紀錄與設定)
 * ====================================================================
 */

function registerHistoryHandlers() {
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
      title
    };
  });

  ipcMain.handle('history:get-sessions', async () => {
    return all('SELECT id, sequence, title, created_at FROM sessions ORDER BY created_at DESC');
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

  ipcMain.handle('history:clear-all', async () => {
    const result = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['取消', '確認清除'],
      defaultId: 0,
      cancelId: 0,
      title: '確認清除歷史記錄',
      message: '您確定要清除所有歷史記錄嗎？',
      detail: '此操作無法復原，所有會話和訊息都將被永久刪除。'
    });

    if (result.response === 0) {
      return { ok: false, cancelled: true };
    }

    try {
      await run('DELETE FROM messages');
      await run('DELETE FROM sessions');
      return { ok: true };
    } catch (error) {
      console.error('Failed to clear history:', error);
      return { ok: false, error: error.message };
    }
  });
}

function registerSettingsHandlers() {
  ipcMain.handle('settings:get-app-data-path', async () => {
    return app.getPath('userData');
  });
}

/*
 * ====================================================================
 * 3. Coordinator 橋接 (AI 核心邏輯)
 * ====================================================================
 */

function registerCoordinatorBridge() {
  let coordinatorModule = null;
  let agents = null;

  async function initializeCoordinator() {
    if (!coordinatorModule) {
      coordinatorModule = await import('./Coordinator.js');
      agents = coordinatorModule.initializeAgents();
    }
    return { coordinatorModule, agents };
  }

  ipcMain.on('message-to-agent', async (event, payload) => {
    try {
      const { type, content, session } = payload || {};

      if (!content || type !== 'text') {
        console.warn('Received invalid message format:', payload);
        return;
      }

      console.log(`[Coordinator Bridge] Received user input: ${content.substring(0, 50)}...`);

      // ❌ 【已移除】: 不要發送 "Processing..."，讓前端顯示跳動氣泡即可
      // event.sender.send('message-from-agent', { ... });

      // 初始化 Coordinator
      let coordinatorModule, initializedAgents;
      try {
        const result = await initializeCoordinator();
        coordinatorModule = result.coordinatorModule;
        initializedAgents = result.agents;
      } catch (initError) {
        console.error('[Coordinator Bridge] Failed to initialize Coordinator:', initError);
        throw new Error(`Initialization failed: ${initError.message}`);
      }

      // 執行 Agent 邏輯
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

      // 組裝回應訊息
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
          plan.fileOps.created.slice(0, 10).forEach(file => {
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

      // 發送最終結果給前端 (這會觸發前端移除氣泡並顯示文字)
      event.sender.send('message-from-agent', {
        type: 'text',
        content: responseText
      });

      // 寫入歷史紀錄
      if (session?.id) {
        await run(
          'INSERT INTO messages (session_id, role, payload_json) VALUES (?, ?, ?)',
          [session.id, 'ai', JSON.stringify({ role: 'ai', content: responseText })]
        ).catch(err => {
          console.error('Failed to write AI response to history:', err);
        });
      }

      console.log(`[Coordinator Bridge] Processing completed, Session ID: ${plan?.id || 'N/A'}`);

    } catch (error) {
      console.error('[Coordinator Bridge] Error processing message:', error);
      
      const errorMessage = `❌ Processing failed: ${error.message}\n\nPlease check console for detailed error information.`;
      
      // 發生錯誤時發送 Error 訊息
      event.sender.send('message-from-agent', {
        type: 'error',
        content: errorMessage
      });

      if (payload?.session?.id) {
        await run(
          'INSERT INTO messages (session_id, role, payload_json) VALUES (?, ?, ?)',
          [payload.session.id, 'ai', JSON.stringify({ role: 'ai', content: errorMessage })]
        ).catch(err => {
          console.error('Failed to write error message to history:', err);
        });
      }
    }
  });
}

/*
 * ====================================================================
 * 4. 視窗創建 (含 F12 快捷鍵)
 * ====================================================================
 */

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'dev_page', 'main-window.html'));
  
  // ★★★ 綁定開發者工具快捷鍵 (F12 / Ctrl+Shift+I) ★★★
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
    
    if ((input.control || input.meta) && (input.shift || input.alt) && input.key.toLowerCase() === 'i' && input.type === 'keyDown') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
}

/*
 * ====================================================================
 * 5. 應用程式生命週期
 * ====================================================================
 */

app.whenReady().then(async () => {
  try {
    await initDatabase();
    registerHistoryHandlers();
    registerSettingsHandlers();
    registerCoordinatorBridge();
    createWindow();
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
    db.close();
  }
});