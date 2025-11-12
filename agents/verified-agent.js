import fs from 'fs';
import path from 'path';
import BaseAgent from './agent-base.js';
import dotenv from 'dotenv';
dotenv.config();

/**
 * VerifiedAgent (LLM-driven):
 * - Reads Requirement, Architect and Coder agent outputs
 * - Calls LLM to produce a JSON test plan (including edge and structural tests)
 * - Writes to outputs/test-plan.json
 */
export default class VerifiedAgent extends BaseAgent {
  constructor(options = {}) {
    super('Verified Agent', 'JSON', 'verified', {
      baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      apiKey: process.env.OPENAI_API_KEY || process.env.API_KEY,
      ...options
    });
    this.outputsDir = options.outputsDir || path.resolve('./outputs');
    this.planPath = path.join(this.outputsDir, 'test-plan.json');
    this.snapshotPath = path.join(this.outputsDir, 'verified-snapshot.json');
    this.maxTokens = 2000;
  }

  ensureOutputsDir() { fs.mkdirSync(this.outputsDir, { recursive: true }); }

  readOutputFile(name) {
    const p = path.join(this.outputsDir, name);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
  }

  // Recursively list files relative to repo root, skipping noisy dirs
  listFiles(root = '.') {
    const skip = new Set(['node_modules', '.git', 'dist', 'build', '.idea', '.vscode']);
    const stack = [root];
    const files = [];
    while (stack.length) {
      const dir = stack.pop();
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (!skip.has(e.name)) stack.push(full);
        } else {
          // store with forward slashes for prompt stability
          const rel = full.replace(/\\/g, '/');
          files.push(rel);
        }
      }
    }
    return files.sort();
  }

  buildSnapshot() {
    // Focus on project root and generated_project tree
    const rootFiles = this.listFiles('.');
    // Limit to avoid prompt overflow
    const max = 300;
    const limited = rootFiles.slice(0, max);
    const outputs = (fs.existsSync(this.outputsDir) ? fs.readdirSync(this.outputsDir) : []).filter(f => fs.statSync(path.join(this.outputsDir, f)).isFile());

    // Quick heuristics
    const hasDockerfile = rootFiles.includes('Dockerfile');
    const hasBuildConfig = rootFiles.includes('build/config.js') || rootFiles.includes('generated_project/build/config.js');
    const hasDeploymentConfig = rootFiles.includes('deployment/config.js') || rootFiles.includes('generated_project/deployment/config.js');
    const hasReact = rootFiles.some(f => f.startsWith('generated_project/src/components/') && f.endsWith('.js'));
    const hasExpress = rootFiles.some(f => f.endsWith('/server.js') || f.endsWith('/routes/api_routes.js'));

    // Include small content snippets for key files if they exist
    const keyFiles = [
      'build/config.js',
      'deployment/config.js',
      'generated_project/src/components/App.js',
      'generated_project/src/components/OperationComponent.js'
    ];
    const snippets = {};
    for (const k of keyFiles) {
      const cand = [k, `generated_project/${k}`];
      let found = null;
      for (const c of cand) {
        if (fs.existsSync(c)) { found = c; break; }
      }
      if (found) {
        try {
          const text = fs.readFileSync(found, 'utf-8');
          snippets[found] = text.slice(0, 1200);
        } catch {}
      }
    }

    // Scan function export candidates to enable executable tests (function_call)
    const jsFiles = rootFiles.filter(f => f.startsWith('generated_project/') && f.endsWith('.js'));
    const safeRead = (p) => { try { return fs.readFileSync(p, 'utf-8'); } catch { return ''; } };
    const functionCandidates = [];
    for (const f of jsFiles) {
      const c = safeRead(f);
      // export function name(
      const r1 = [...c.matchAll(/export\s+function\s+([A-Za-z_]\w*)\s*\(/g)].map(m => ({ module: f, export: m[1] }));
      // export const name = (
      const r2 = [...c.matchAll(/export\s+const\s+([A-Za-z_]\w*)\s*=\s*\(/g)].map(m => ({ module: f, export: m[1] }));
      if (r1.length || r2.length) functionCandidates.push(...r1, ...r2);
    }

    // Server hints for server_request tests
    const hasServerJs = rootFiles.includes('generated_project/server.js') || rootFiles.includes('server.js');
    const dockerText = safeRead('Dockerfile');
    const exposedPort = (dockerText.match(/EXPOSE\s+(\d{2,5})/i)?.[1]) || '3000';
    const serverHints = { hasServerJs, defaultPort: exposedPort };

    const snapshot = {
      generatedAt: new Date().toISOString(),
      allowedFiles: limited,
      allowedOutputs: outputs,
      heuristics: { hasDockerfile, hasBuildConfig, hasDeploymentConfig, hasReact, hasExpress },
      snippets,
      functionCandidates: functionCandidates.slice(0, 50),
      serverHints
    };
    fs.mkdirSync(this.outputsDir, { recursive: true });
    fs.writeFileSync(this.snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8');
    return snapshot;
  }

  prompt(requirementText, architectText, coderText, snapshot) {
    const allowServer = snapshot?.heuristics?.hasExpress || snapshot?.serverHints?.hasServerJs;
    const allowedRuleTypes = [
      'function_call', 'exec_command',
      ...(allowServer ? ['server_request'] : []),
      'file_exists', 'file_contains', 'outputs_contains', 'regex_match'
    ];

    const template = {
      metadata: { generatedAt: '<ISO_DATETIME>', sources: ['Requirement_Agent.txt','Architect_Agent.txt','Coder_Agent.txt'] },
      scope: { components: [], apiRoutes: [], notes: ['Prefer executable tests'] },
      suites: [
        {
          id: 'S1_runtime_functions',
          title: 'Arithmetic core functions',
          type: 'runtime',
          cases: [
            {
              id: 'C1_multiply',
              title: 'multiply works with small integers',
              kind: 'function_call',
              fn: { module: '<MODULE>', export: 'multiply', args: [6,3], expect: 18 }
            }
          ]
        },
        ...(allowServer ? [{
          id: 'S2_server_api',
          title: 'Server calculate endpoint',
          type: 'runtime',
          cases: [
            {
              id: 'C2_calculate_mul',
              title: 'POST /calculate mul=6*3 -> 18',
              kind: 'server_request',
              start: { cmd: 'node', args: ['generated_project/server.js'], healthUrl: `http://127.0.0.1:${snapshot.serverHints?.defaultPort||3000}/health`, timeoutMs: 15000 },
              request: { method: 'POST', url: `http://127.0.0.1:${snapshot.serverHints?.defaultPort||3000}/calculate`, json: { a: 6, b: 3, op: 'mul' }, expect: { status: 200, jsonPathEquals: { result: 18 } } },
              stop: { signal: 'SIGINT' }
            }
          ]
        }] : []),
        {
          id: 'S3_static_baseline',
          title: 'Minimum structure',
          type: 'static-analysis',
          cases: [
            { id: 'C3_op_component', title: 'OperationComponent exists', kind: 'file_exists', target: 'generated_project/src/components/OperationComponent.js' },
            { id: 'C4_app_has_multiply', title: 'App contains multiply expression', kind: 'file_contains', target: 'generated_project/src/components/App.js', pattern: 'number1 * number2' }
          ]
        }
      ]
    };

    return `
You are a senior QA engineer. Output ONLY a valid JSON test plan (no markdown fences).
Rules:
- Allowed rule types: ${JSON.stringify(allowedRuleTypes)}
- Prefer executable tests: target ~70% function_call/exec_command${allowServer ? '/server_request' : ''}, ~30% static checks.
- Use ONLY files from snapshot.allowedFiles. Do NOT invent paths.
- If requirements/code indicate arithmetic features, include add/subtract/multiply/divide and divide-by-zero cases.
- Pick from snapshot.functionCandidates for function_call when possible.
- ${allowServer ? 'Server detected: you MAY add server_request tests.' : 'No server detected: DO NOT add server_request tests.'}
- Conform to the following template shape (you may expand suites/cases, but keep field names/kinds valid):
${JSON.stringify(template, null, 2)}

Requirement output:
${requirementText}

Architect output:
${architectText}

Coder output:
${coderText}

Project snapshot (restrict your targets to allowedFiles and prefer functionCandidates for function_call):
${JSON.stringify(snapshot, null, 2)}
`;
  }

  parseJsonFromText(text) {
    // Strip code fences if present and find first JSON object
    const cleaned = text.replace(/```[a-zA-Z]*\n?|```/g, '').trim();
    try { return JSON.parse(cleaned); } catch {}
    const match = cleaned.match(/\{[\s\S]*\}$/);
    if (match) { return JSON.parse(match[0]); }
    throw new Error('Verified Agent did not return valid JSON test plan');
  }

  async generatePlan() {
    this.ensureOutputsDir();
    const requirement = this.readOutputFile('Requirement_Agent.txt');
    const architect = this.readOutputFile('Architect_Agent.txt');
    const coder = this.readOutputFile('Coder_Agent.txt');
    if (!requirement || !architect || !coder) {
      throw new Error('Missing Requirement_Agent.txt, Architect_Agent.txt or Coder_Agent.txt in outputs/.');
    }
    const snapshot = this.buildSnapshot();
    const input = this.prompt(requirement, architect, coder, snapshot);
    const llmOutput = await this.run(input); // BaseAgent will also save a .txt transcript
    const plan = this.parseJsonFromText(llmOutput);
    // Normalize minimal metadata if missing
    plan.metadata = plan.metadata || {};
    plan.metadata.generatedAt = plan.metadata.generatedAt || new Date().toISOString();
    plan.metadata.sources = plan.metadata.sources || ['Requirement_Agent.txt','Architect_Agent.txt', 'Coder_Agent.txt'];
    // Post-filter: drop cases with non-existent targets only (keep content checks to catch missing functionality)
    const allowedSet = new Set(snapshot.allowedFiles);
    const outputsSet = new Set(snapshot.allowedOutputs);
    const norm = (p) => (p || '').replace(/\\/g, '/');
    const fileExists = (p) => {
      const n = norm(p);
      return allowedSet.has(n) || allowedSet.has(`generated_project/${n}`);
    };

    plan.suites = (plan.suites || []).map((s) => ({
      ...s,
      cases: (s.cases || []).filter(cs => {
        const t = norm(cs.target || '');
        const kind = cs.kind;
        // outputs_contains must point to an actual outputs file
        if (kind === 'outputs_contains') {
          return outputsSet.has(t);
        }
        if (kind === 'file_exists' || kind === 'file_contains' || kind === 'regex_match') {
          if (t.includes('*')) return true; // allow wildcards, expand at test-time
          return fileExists(t);
        }
        if (kind === 'function_call') {
          const mod = cs.fn && cs.fn.module;
          return !!mod && fileExists(mod);
        }
        if (kind === 'exec_command') {
          const cmd = cs.cmd;
          if (!cmd) return false;
          // allow system commands like 'node', 'npm'; if looks like a path, ensure existence
          const looksPath = /[\\/]|\.js$/i.test(cmd);
          return looksPath ? fileExists(cmd) : true;
        }
        if (kind === 'server_request') {
          const startArg0 = cs.start && cs.start.args && cs.start.args[0];
          return !!startArg0 && fileExists(startArg0);
        }
        return false;
      })
    })).filter(s => (s.cases || []).length > 0);
    fs.writeFileSync(this.planPath, JSON.stringify(plan, null, 2), 'utf-8');
    return { path: this.planPath, plan };
  }
}
