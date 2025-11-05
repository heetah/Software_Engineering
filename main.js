const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
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
