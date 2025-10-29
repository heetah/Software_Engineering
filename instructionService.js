const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const ArchitectAgent = require('../agents/architectAgent');

const DATA_DIR = path.join(process.cwd(), 'data');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const SESSION_WORKSPACES_DIR = SESSIONS_DIR;

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR);
  if (!fs.existsSync(SESSION_WORKSPACES_DIR)) fs.mkdirSync(SESSION_WORKSPACES_DIR);
}

function ensureSessionWorkspace(sessionId) {
  if (!sessionId) return null;
  const sessionDir = path.join(SESSION_WORKSPACES_DIR, sessionId);
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
  return sessionDir;
}

function materializeFiles(files = [], sessionDir) {
  if (!Array.isArray(files) || files.length === 0 || !sessionDir) {
    return { created: [], skipped: [], errors: [] };
  }

  const result = { created: [], skipped: [], errors: [] };

  files.forEach((file) => {
    if (!file || typeof file.path !== 'string') return;

    try {
      const resolved = path.resolve(sessionDir, file.path);
      const relativeToSession = path.relative(sessionDir, resolved);
      if (relativeToSession.startsWith('..')) {
        result.errors.push({ path: file.path, reason: 'Outside session workspace' });
        return;
      }

      const dir = path.dirname(resolved);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const content = typeof file.template === 'string' ? file.template : '';

      if (fs.existsSync(resolved)) {
        result.skipped.push({
          path: path.relative(process.cwd(), resolved),
          reason: 'Already exists'
        });
        return;
      }

      fs.writeFileSync(resolved, content, 'utf8');
      result.created.push(path.relative(process.cwd(), resolved));
    } catch (err) {
      result.errors.push({
        path: file?.path || '<unknown>',
        reason: err.message
      });
    }
  });

  return result;
}

class InstructionService {
  constructor(options = {}) {
    this.agent = new ArchitectAgent(options);
    ensureDirs();
  }

  sessionPath(id) {
    return path.join(SESSIONS_DIR, `${id}.json`);
  }

  async createPlan({ prompt, context }) {
    const id = randomUUID();
    const generated = await this.agent.generatePlan({ prompt, context });

    const sessionWorkspace = ensureSessionWorkspace(id);
    const fileOps = materializeFiles(generated?.coder_instructions?.files, sessionWorkspace);

    const payload = {
      id,
      createdAt: new Date().toISOString(),
      prompt,
      context: context || null,
      output: generated,
      fileOps,
      workspaceDir: sessionWorkspace ? path.relative(process.cwd(), sessionWorkspace) : null,
    };
    fs.writeFileSync(this.sessionPath(id), JSON.stringify(payload, null, 2), 'utf8');
    return payload;
  }

  getSession(id) {
    const p = this.sessionPath(id);
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  }

  async refine(id, feedback) {
    const session = this.getSession(id);
    if (!session) throw new Error('Session not found');
    const previous = session.output;
    const next = await this.agent.refinePlan({ previous, feedback });
    const sessionWorkspace =
      session.workspaceDir &&
      !session.workspaceDir.startsWith('..') &&
      !path.isAbsolute(session.workspaceDir)
        ? path.join(process.cwd(), session.workspaceDir)
        : ensureSessionWorkspace(id);
    if (sessionWorkspace && !fs.existsSync(sessionWorkspace)) {
      fs.mkdirSync(sessionWorkspace, { recursive: true });
    }
    const fileOps = materializeFiles(next?.coder_instructions?.files, sessionWorkspace);
    const updated = {
      ...session,
      updatedAt: new Date().toISOString(),
      feedback,
      output: next,
      fileOps,
      workspaceDir: sessionWorkspace ? path.relative(process.cwd(), sessionWorkspace) : null,
    };
    fs.writeFileSync(this.sessionPath(id), JSON.stringify(updated, null, 2), 'utf8');
    return updated;
  }
}

module.exports = InstructionService;
