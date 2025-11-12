import { app, BrowserWindow, ipcMain } from 'electron';
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
}

// 註冊 Coordinator 橋接，處理前端傳來的訊息
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
        console.warn('收到無效的訊息格式:', payload);
        return;
      }

      console.log(`[Coordinator Bridge] 收到使用者輸入: ${content.substring(0, 50)}...`);

      // 發送處理中的訊息給前端
      event.sender.send('message-from-agent', {
        type: 'text',
        content: '正在處理您的需求，請稍候...'
      });

      // 初始化 Coordinator（使用 try-catch 包裹以避免初始化錯誤）
      let coordinatorModule, initializedAgents;
      try {
        const result = await initializeCoordinator();
        coordinatorModule = result.coordinatorModule;
        initializedAgents = result.agents;
      } catch (initError) {
        console.error('[Coordinator Bridge] 初始化 Coordinator 失敗:', initError);
        throw new Error(`初始化失敗: ${initError.message}`);
      }

      // 調用 Coordinator 處理使用者輸入（使用獨立的 try-catch 來捕獲處理錯誤）
      let plan;
      try {
        plan = await coordinatorModule.runWithInstructionService(content, initializedAgents);
      } catch (processError) {
        console.error('[Coordinator Bridge] Coordinator 處理失敗:', processError);
        // 如果錯誤是 native 崩潰相關，提供更友好的錯誤訊息
        if (processError.message && processError.message.includes('napi')) {
          throw new Error('處理過程中發生內部錯誤，請稍後再試或檢查日誌');
        }
        throw processError;
      }

      // 構建回應訊息
      let responseText = '';
      
      if (plan) {
        responseText = `✅ 專案生成完成！\n\n`;
        responseText += `會話 ID: ${plan.id}\n`;
        responseText += `工作區: ${plan.workspaceDir || 'N/A'}\n`;
        responseText += `檔案操作: 創建=${plan.fileOps?.created?.length || 0}, 跳過=${plan.fileOps?.skipped?.length || 0}\n\n`;

        if (plan.output?.plan) {
          responseText += `📋 計劃標題: ${plan.output.plan.title}\n`;
          responseText += `📝 計劃摘要: ${plan.output.plan.summary}\n`;
          responseText += `📊 步驟數: ${plan.output.plan.steps?.length || 0}\n\n`;
        }

        if (plan.fileOps?.created?.length > 0) {
          responseText += `📁 已生成的檔案:\n`;
          plan.fileOps.created.slice(0, 10).forEach(file => {
            responseText += `  • ${file}\n`;
          });
          if (plan.fileOps.created.length > 10) {
            responseText += `  ... 還有 ${plan.fileOps.created.length - 10} 個檔案\n`;
          }
        }

        responseText += `\n💡 提示: 專案已生成在 ${plan.workspaceDir || 'data/sessions/' + plan.id} 目錄中`;
      } else {
        responseText = '⚠️ 處理完成，但未返回計劃資訊';
      }

      // 回傳結果給前端
      event.sender.send('message-from-agent', {
        type: 'text',
        content: responseText
      });

      // 同步寫入歷史紀錄（如果 session 存在）
      if (session?.id) {
        await run(
          'INSERT INTO messages (session_id, role, payload_json) VALUES (?, ?, ?)',
          [session.id, 'ai', JSON.stringify({ role: 'ai', content: responseText })]
        ).catch(err => {
          console.error('寫入 AI 回應到歷史紀錄失敗:', err);
        });
      }

      console.log(`[Coordinator Bridge] 處理完成，會話 ID: ${plan?.id || 'N/A'}`);

    } catch (error) {
      console.error('[Coordinator Bridge] 處理訊息時發生錯誤:', error);
      
      const errorMessage = `❌ 處理失敗: ${error.message}\n\n請檢查控制台以獲取詳細錯誤資訊。`;
      
      event.sender.send('message-from-agent', {
        type: 'error',
        content: errorMessage
      });

      // 如果 session 存在，也把錯誤訊息寫入歷史
      if (payload?.session?.id) {
        await run(
          'INSERT INTO messages (session_id, role, payload_json) VALUES (?, ?, ?)',
          [payload.session.id, 'ai', JSON.stringify({ role: 'ai', content: errorMessage })]
        ).catch(err => {
          console.error('寫入錯誤訊息到歷史紀錄失敗:', err);
        });
      }
    }
  });
}

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
  mainWindow.webContents.openDevTools();
}

app.whenReady().then(async () => {
  try {
    await initDatabase();
    registerHistoryHandlers();
    registerCoordinatorBridge(); // 註冊 Coordinator 橋接
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
