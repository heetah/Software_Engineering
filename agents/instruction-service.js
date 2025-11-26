import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import ArchitectAgent from './architect-agent.js';

// Data storage directory
const DATA_DIR = path.join(process.cwd(), 'data');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
// Session workspace directory - changed to output/
const OUTPUT_DIR = path.join(process.cwd(), 'output');
const SESSION_WORKSPACES_DIR = OUTPUT_DIR;

function ensureDirs() {
  // Ensure data storage directory exists
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  // Ensure sessions directory exists
  if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR);
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);
  // Ensure session workspace directory exists
  if (!fs.existsSync(SESSION_WORKSPACES_DIR)) fs.mkdirSync(SESSION_WORKSPACES_DIR);
}

function ensureSessionWorkspace(sessionId) {
  // If no session ID, return null
  if (!sessionId) return null;
  // Create session workspace directory in output/
  const sessionDir = path.join(SESSION_WORKSPACES_DIR, sessionId);
  // Ensure session workspace directory exists
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
  return sessionDir;
}

function materializeFiles(files = [], sessionDir) {
  // 如果沒有文件或會話目錄，則返回空陣列
  if (!Array.isArray(files) || files.length === 0 || !sessionDir) {
    return { created: [], skipped: [], errors: [] };
  }
  // 創建結果對象
  const result = { created: [], skipped: [], errors: [] };

  files.forEach((file) => {
    // 如果沒有文件或文件路徑不是字符串，則返回
    if (!file || typeof file.path !== 'string') return;

    try {
      // 解析文件路徑
      const resolved = path.resolve(sessionDir, file.path);
      // 獲取相對路徑
      const relativeToSession = path.relative(sessionDir, resolved);
      // 如果相對路徑以 ".." 開頭，則返回錯誤
      if (relativeToSession.startsWith('..')) {
        result.errors.push({ path: file.path, reason: 'Outside session workspace' });
        return;
      }

      // 獲取文件目錄
      const dir = path.dirname(resolved);
      // 如果文件目錄不存在，則創建文件目錄
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      // 獲取文件內容
      const content = typeof file.template === 'string' ? file.template : '';
      // 如果文件存在，則跳過

      if (fs.existsSync(resolved)) {
        // 跳過文件
        result.skipped.push({
          path: path.relative(process.cwd(), resolved),
          reason: 'Already exists'
        });
        return;
      }

      // 寫入文件
      fs.writeFileSync(resolved, content, 'utf8');
      // 添加創建的文件
      result.created.push(path.relative(process.cwd(), resolved));
    } catch (err) {
      // 添加錯誤
      result.errors.push({
        path: file?.path || '<unknown>',
        reason: err.message
      });
    }
  });

  // 返回結果
  return result;
}

export default class InstructionService {
  constructor(options = {}) {
    // 創建架構代理
    this.agent = new ArchitectAgent(options);
    // 確保資料儲存目錄存在
    ensureDirs();
  }

  // 獲取會話目錄路徑
  sessionDir(id) {
    // 返回會話目錄路徑
    return path.join(SESSIONS_DIR, id);
  }

  // 獲取 architecture.json 路徑
  architectureJsonPath(id) {
    // 返回 architecture.json 的完整路徑
    return path.join(this.sessionDir(id), 'architecture.json');
  }

  // 獲取會話路徑（向後兼容，現在返回目錄路徑）
  sessionPath(id) {
    // 返回會話目錄路徑（向後兼容）
    return this.sessionDir(id);
  }

  async createPlan({ prompt, context }) {
    // 生成會話 ID
    const id = randomUUID();
    // 生成計劃
    const generated = await this.agent.generatePlan({ prompt, context });

    // 創建會話工作區
    const sessionWorkspace = ensureSessionWorkspace(id);
    // 創建文件操作
    const fileOps = materializeFiles(generated?.coder_instructions?.files, sessionWorkspace);

    // 創建負載（architecture.json 的內容）
    const payload = {
      id,
      createdAt: new Date().toISOString(),
      prompt,
      context: context || null,
      output: generated,
      fileOps,
      workspaceDir: sessionWorkspace ? path.relative(process.cwd(), sessionWorkspace) : null,
    };

    // 確保會話目錄存在
    const sessionDir = this.sessionDir(id);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    // 寫入 architecture.json 到 data/sessions/<sessionId>/architecture.json
    const architecturePath = this.architectureJsonPath(id);
    fs.writeFileSync(architecturePath, JSON.stringify(payload, null, 2), 'utf8');
    
    return payload;
  }

  getSession(id) {
    // 獲取 architecture.json 路徑
    const architecturePath = this.architectureJsonPath(id);
    // 如果 architecture.json 不存在，嘗試從舊格式讀取（向後兼容）
    if (!fs.existsSync(architecturePath)) {
      // 嘗試讀取舊格式的 session JSON 檔案
      const oldPath = path.join(SESSIONS_DIR, `${id}.json`);
      if (fs.existsSync(oldPath)) {
        const raw = fs.readFileSync(oldPath, 'utf8');
        return JSON.parse(raw);
      }
      return null;
    }
    const raw = fs.readFileSync(architecturePath, 'utf8');
    // 解析會話 JSON
    return JSON.parse(raw);
  }

  async refine(id, feedback) {
    // 獲取會話
    const session = this.getSession(id);
    // 如果會話不存在，則返回錯誤
    if (!session) throw new Error('Session not found');
    const previous = session.output;
    // 優化計劃
    const next = await this.agent.refinePlan({ previous, feedback });
    // 創建會話工作區
    const sessionWorkspace =
      session.workspaceDir &&
      !session.workspaceDir.startsWith('..') &&
      !path.isAbsolute(session.workspaceDir)
        ? path.join(process.cwd(), session.workspaceDir)
        : ensureSessionWorkspace(id);
    // 如果會話工作區不存在，則創建會話工作區
    if (sessionWorkspace && !fs.existsSync(sessionWorkspace)) {
      // 創建會話工作區
      fs.mkdirSync(sessionWorkspace, { recursive: true });
    }
    // 創建文件操作
    const fileOps = materializeFiles(next?.coder_instructions?.files, sessionWorkspace);
    // 創建更新對象
    const updated = {
      ...session,
      updatedAt: new Date().toISOString(),
      feedback,
      output: next,
      fileOps,
      workspaceDir: sessionWorkspace ? path.relative(process.cwd(), sessionWorkspace) : null,
    };
    
    // 確保會話目錄存在
    const sessionDir = this.sessionDir(id);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    
    // 寫入 architecture.json
    const architecturePath = this.architectureJsonPath(id);
    fs.writeFileSync(architecturePath, JSON.stringify(updated, null, 2), 'utf8');
    // 返回更新後的會話
    return updated;
  }
}
