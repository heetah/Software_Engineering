import BaseAgent from "./agent-base.js";
import dotenv from "dotenv";
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

dotenv.config();

export default class TesterAgent extends BaseAgent {
  constructor() {
    super("Tester Agent", "Markdown code", "tester", {
      baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  prompt(coderOutput) {
    return `
Write automated tests for the following code:
${coderOutput}

Output unit tests or integration test scripts.`;
  }

  async runPipeline({ useVerifiedSummary = true, requirePlan = false } = {}) {
    const outputsDir = path.resolve('./outputs');
    const planPath = path.join(outputsDir, 'test-plan.json');
    let plan;
    if (fs.existsSync(planPath)) {
      const raw = fs.readFileSync(planPath, 'utf-8');
      plan = JSON.parse(raw);
    } else {
      if (requirePlan) {
        throw new Error('Test plan not found at outputs/test-plan.json and fallback disabled (requirePlan=true).');
      }
      plan = this.generateTestPlan({ useVerifiedSummary, outputsDir, planPath });
    }
    const testsDir = path.resolve('./tests');
    this.generateTestsFromPlan({ plan, testsDir });
    const jestJsonPath = path.join(outputsDir, 'jest-results.json');
    await this.runJestAndCollect({ outputJson: jestJsonPath });
    const analysis = this.analyzeResults({ plan, jestJsonPath });
    const reportPath = path.join(outputsDir, 'Test_Report.json');
    fs.writeFileSync(reportPath, JSON.stringify(analysis, null, 2), 'utf-8');
    // Write unified error report for downstream LLM analysis
    const errorsPath = path.join(outputsDir, 'Test_Errors.json');
    fs.writeFileSync(errorsPath, JSON.stringify(analysis.errors || [], null, 2), 'utf-8');
    const brief = `Test Summary (generated ${new Date().toISOString()}):\n` +
      `Total: ${analysis.summary.total}, Passed: ${analysis.summary.passed}, Failed: ${analysis.summary.failed}`;
    fs.writeFileSync(path.join(outputsDir, 'Tester_Agent.txt'), brief, 'utf-8');
    return { planPath, testsDir, jestJsonPath, reportPath, errorsPath };
  }

  generateTestPlan({ useVerifiedSummary = true, outputsDir = path.resolve('./outputs'), planPath = path.join(path.resolve('./outputs'), 'test-plan.json') } = {}) {
    fs.mkdirSync(outputsDir, { recursive: true });
    let summary = null;
    if (useVerifiedSummary) {
      const verifiedPath = path.join(outputsDir, 'verified-summary.json');
      if (fs.existsSync(verifiedPath)) {
        summary = JSON.parse(fs.readFileSync(verifiedPath, 'utf-8'));
      }
    }
    const reqPath = path.join(outputsDir, 'Requirement_Agent.txt');
    const coderPath = path.join(outputsDir, 'Coder_Agent.txt');
    const requirementRaw = fs.existsSync(reqPath) ? fs.readFileSync(reqPath, 'utf-8') : '';
    const coderRaw = fs.existsSync(coderPath) ? fs.readFileSync(coderPath, 'utf-8') : '';

    const features = summary?.features || this._extractLines(requirementRaw, ['加法', '減法']);
    const components = summary?.components || this._extractComponents(coderRaw);
    const apiRoutes = summary?.apiRoutes || this._extractApiRoutes(coderRaw);

    const projectFiles = [
      'generated_project/src/index.js',
      'generated_project/src/components/App.js',
      'generated_project/src/components/InputComponent.js',
      'generated_project/src/components/OperationComponent.js',
      'generated_project/src/components/ResultDisplayComponent.js'
    ];

    const plan = {
      metadata: {
        generatedAt: new Date().toISOString(),
        sources: summary?.metadata?.sources || ['Requirement_Agent.txt', 'Coder_Agent.txt']
      },
      scope: { features, components, apiRoutes },
      suites: [
        {
          id: 'S1',
          title: 'Project structure checks',
          type: 'integration',
          cases: projectFiles.map((p, i) => ({ id: `S1-C${i+1}`, title: `File exists: ${p}`, kind: 'file_exists', target: p }))
        },
        {
          id: 'S2',
          title: 'UI operation options present',
          type: 'static-analysis',
          cases: [
            { id: 'S2-C1', title: 'OperationComponent has Add', kind: 'file_contains', target: 'generated_project/src/components/OperationComponent.js', pattern: 'Add' },
            { id: 'S2-C2', title: 'OperationComponent has Subtract', kind: 'file_contains', target: 'generated_project/src/components/OperationComponent.js', pattern: 'Subtract' }
          ]
        },
        {
          id: 'S3',
          title: 'API route exposure (design doc)',
          type: 'static-analysis',
          cases: apiRoutes.map((r, i) => ({ id: `S3-C${i+1}`, title: `Coder output mentions API ${r}`, kind: 'outputs_contains', target: 'Coder_Agent.txt', pattern: r }))
        },
        {
          id: 'S4',
          title: 'Requirements coverage (presence)',
          type: 'static-analysis',
          cases: features.map((f, i) => ({ id: `S4-C${i+1}`, title: `Requirement mentions: ${f}`, kind: 'outputs_contains', target: 'Requirement_Agent.txt', pattern: f }))
        },
        {
          id: 'S5',
          title: 'Computation logic present in App.js',
          type: 'static-analysis',
          cases: [
            { id: 'S5-C1', title: 'App.js includes addition logic', kind: 'file_contains', target: 'generated_project/src/components/App.js', pattern: 'number1 + number2' },
            { id: 'S5-C2', title: 'App.js includes subtraction logic', kind: 'file_contains', target: 'generated_project/src/components/App.js', pattern: 'number1 - number2' }
          ]
        }
      ]
    };

    fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf-8');
    return plan;
  }

  generateTestsFromPlan({ plan, testsDir }) {
    fs.mkdirSync(testsDir, { recursive: true });
    const filePath = path.join(testsDir, 'generated_from_plan.test.js');
    const testCode = this._buildJestFromPlan(plan);
    fs.writeFileSync(filePath, testCode, 'utf-8');
    return filePath;
  }

  async runJestAndCollect({ outputJson }) {
    await new Promise((resolve, reject) => {
      const args = [
        '--experimental-vm-modules',
        path.join('node_modules', 'jest', 'bin', 'jest.js'),
        '--json',
        `--outputFile=${outputJson}`
      ];
      const child = spawn(process.execPath, args, { stdio: 'inherit' });
      child.on('exit', code => {
        if (code === 0 || code === 1) {
          resolve();
        } else {
          reject(new Error(`Jest exited with code ${code}`));
        }
      });
      child.on('error', reject);
    });
  }

  analyzeResults({ plan, jestJsonPath }) {
    const raw = fs.readFileSync(jestJsonPath, 'utf-8');
    const res = JSON.parse(raw);
    const total = res.numTotalTests || 0;
    const passed = res.numPassedTests || 0;
    const failed = res.numFailedTests || 0;
    const errors = [];
    (res.testResults || []).forEach(tr => {
      const filePath = tr.name;
      (tr.assertionResults || []).forEach(ar => {
        if (ar.status !== 'passed') {
          errors.push({
            status: ar.status,
            title: ar.title,
            fullName: ar.fullName,
            ancestorTitles: ar.ancestorTitles || [],
            location: { testFilePath: filePath, status: tr.status },
            failureMessages: Array.isArray(ar.failureMessages) ? ar.failureMessages : (tr.message ? String(tr.message).split('\n') : [])
          });
        }
      });
    });
    return {
      summary: { total, passed, failed },
      errors,
      planMeta: plan.metadata
    };
  }

  _extractLines(text, keywords = []) { return keywords.filter(k => text.includes(k)); }
  _extractComponents(text) {
    const components = [];
    const matches = text.match(/components:\s*\[[^\]]*\]/g) || [];
    matches.forEach(m => { const names = [...m.matchAll(/"([^"]+)"/g)].map(mm => mm[1]); components.push(...names); });
    return Array.from(new Set(components));
  }
  _extractApiRoutes(text) { return [...(text.matchAll(/endpoint:\s*"([^\"]+)"/g) || [])].map(m => m[1]); }

  _buildJestFromPlan(plan) {
    const lines = [];
  lines.push(`import fs from 'fs';`);
  lines.push(`import path from 'path';`);
  lines.push(`import { jest } from '@jest/globals';`);
    lines.push(`import { spawn, execFile } from 'child_process';`);
    lines.push(`import { pathToFileURL } from 'url';`);
    lines.push(`const candidates = (p) => [p, path.join('generated_project', p)];`);
    lines.push(`const firstExisting = (arr) => { for (const p of arr) { const abs = path.resolve(p); if (fs.existsSync(abs)) return abs; } return null; };`);
    lines.push(`const walk = (dir, acc=[]) => {`);
    lines.push(`  const entries = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : [];`);
    lines.push(`  for (const e of entries) {`);
    lines.push(`    const p = path.join(dir, e.name);`);
    lines.push(`    if (e.isDirectory()) {`);
    lines.push(`      if (!['node_modules', '.git', 'dist', 'build'].includes(e.name)) walk(p, acc);`);
    lines.push(`    } else { acc.push(p); }`);
    lines.push(`  }`);
    lines.push(`  return acc;`);
    lines.push(`};`);
    lines.push(`const poolFiles = () => ([...walk('.'), ...walk('generated_project'), ...walk(path.join('generated_project','public')), ...walk(path.join('generated_project','src'))]);`);
    lines.push(`const globMatches = (pattern) => { if (!pattern || !pattern.includes('*')) return []; let s = pattern.replace(/\\\\/g, '/'); s = s.split('*').map(part => part.replace(/[.+?^()|[\]{}]/g, '\\$&')).join('.*'); const rx = new RegExp('^' + s + '$'); return poolFiles().map(p => p.replace(/\\\\/g,'/')).filter(p => rx.test(p)); };`);
    lines.push(`const anyWildcardMatch = (pattern) => globMatches(pattern).length > 0;`);
    lines.push(`const someFileContent = (files, pred) => { for (const f of files) { try { const c = fs.readFileSync(f, 'utf-8'); if (pred(c, f)) return true; } catch {} } return false; };`);
    lines.push(`const resolveEither = (p) => firstExisting(candidates(p)) || path.resolve(p);`);
    lines.push(`const sleep = (ms)=> new Promise(r=>setTimeout(r,ms));`);
    lines.push(`const execFileAsync = (cmd, args=[], opts={}) => new Promise((resolve) => { const t = opts.timeoutMs || 10000; const child = execFile(cmd, args, { timeout: t }, (error, stdout, stderr) => { resolve({ code: error?.code ?? 0, stdout: String(stdout||''), stderr: String(stderr||'') }); }); });`);
    lines.push(`const startServer = (cmd, args=[]) => spawn(cmd, args, { stdio: 'ignore', env: { ...process.env } });`);
    lines.push(`const stopProcess = (child, signal='SIGINT') => { if (!child || child.killed) return; try { child.kill(signal); } catch {} };`);
    lines.push(`const waitForHttpOk = async (url, timeoutMs=15000) => { if (typeof fetch !== 'function') return false; const end = Date.now()+timeoutMs; while (Date.now() < end) { try { const res = await fetch(url); if (res.ok) return true; } catch {} await sleep(300); } return false; };`);
    lines.push('');
    lines.push(`describe('Generated Test Plan', () => {`);
    lines.push(`  jest.setTimeout(20000);`);
    plan.suites.forEach(suite => {
      lines.push(`  describe(${JSON.stringify(suite.title)}, () => {`);
      suite.cases.forEach(cs => {
        if (cs.kind === 'function_call') {
          lines.push(`    test(${JSON.stringify(cs.title)}, async () => {`);
          lines.push(`      const modPath = resolveEither(${JSON.stringify(cs.fn?.module)});`);
          lines.push(`      expect(fs.existsSync(modPath)).toBe(true);`);
          lines.push(`      if (!fs.existsSync(modPath)) return;`);
          lines.push(`      const mod = await import(pathToFileURL(modPath).href);`);
          lines.push(`      const fn = mod[${JSON.stringify(cs.fn?.export)}] || (mod.default && mod.default[${JSON.stringify(cs.fn?.export)}]);`);
          lines.push(`      expect(typeof fn).toBe('function');`);
          if (cs.fn?.expect && typeof cs.fn.expect === 'object' && cs.fn.expect.throws) {
            const exp = cs.fn.expect.throws;
            lines.push(`      let threw = false;`);
            lines.push(`      try { await fn(...${JSON.stringify(cs.fn?.args || [])}); } catch (err) { threw = true;`);
            if (exp.message) {
              lines.push(`        expect(String(err.message)).toBe(${JSON.stringify(exp.message)});`);
            }
            lines.push(`      }`);
            lines.push(`      expect(threw).toBe(true);`);
          } else {
            lines.push(`      const out = await fn(...${JSON.stringify(cs.fn?.args || [])});`);
            lines.push(`      expect(out).toEqual(${JSON.stringify(cs.fn?.expect)});`);
          }
          lines.push(`    });`);
        } else if (cs.kind === 'exec_command') {
          lines.push(`    test(${JSON.stringify(cs.title)}, async () => {`);
          lines.push(`      const res = await execFileAsync(${JSON.stringify(cs.cmd)}, ${JSON.stringify(cs.args || [])}, { timeoutMs: ${(cs.expect?.timeoutMs)||10000} });`);
          if (cs.expect?.stdoutIncludes) {
            lines.push(`      expect(res.stdout.includes(${JSON.stringify(cs.expect.stdoutIncludes)})).toBe(true);`);
          }
          if (cs.expect?.stderrIncludes) {
            lines.push(`      expect(res.stderr.includes(${JSON.stringify(cs.expect.stderrIncludes)})).toBe(true);`);
          }
          if (cs.expect?.exitCode !== undefined) {
            lines.push(`      expect(res.code).toBe(${JSON.stringify(cs.expect.exitCode)});`);
          }
          lines.push(`    });`);
        } else if (cs.kind === 'server_request') {
          lines.push(`    test(${JSON.stringify(cs.title)}, async () => {`);
          lines.push(`      if (typeof fetch !== 'function') { expect(true).toBe(true); return; }`);
          lines.push(`      const child = startServer(${JSON.stringify(cs.start?.cmd || 'node')}, ${JSON.stringify(cs.start?.args || [])});`);
          lines.push(`      try {`);
          lines.push(`        const ok = await waitForHttpOk(${JSON.stringify(cs.start?.healthUrl || 'http://127.0.0.1:3000/health')}, ${JSON.stringify(cs.start?.timeoutMs || 15000)});`);
          lines.push(`        expect(ok).toBe(true);`);
          lines.push(`        if (!ok) return;`);
          lines.push(`        const req = ${JSON.stringify(cs.request || {})};`);
          lines.push(`        const res = await fetch(req.url, { method: req.method || 'GET', headers: { 'Content-Type': 'application/json' }, body: req.json ? JSON.stringify(req.json) : undefined });`);
          lines.push(`        const text = await res.text(); let json=null; try{ json = JSON.parse(text);}catch{}`);
          if (cs.request?.expect?.status !== undefined) {
            lines.push(`        expect(res.status).toBe(${JSON.stringify(cs.request.expect.status)});`);
          }
          if (cs.request?.expect?.bodyIncludes) {
            lines.push(`        expect(text.includes(${JSON.stringify(cs.request.expect.bodyIncludes)})).toBe(true);`);
          }
          if (cs.request?.expect?.jsonPathEquals) {
            const kv = cs.request.expect.jsonPathEquals;
            const firstKey = kv && Object.keys(kv)[0];
            if (firstKey) {
              lines.push(`        expect(json?.[${JSON.stringify(firstKey)}]).toEqual(${JSON.stringify(cs.request.expect.jsonPathEquals[firstKey])});`);
            }
          }
          lines.push(`      } finally { stopProcess(child, ${JSON.stringify(cs.stop?.signal || 'SIGINT')}); }`);
          lines.push(`    });`);
        } else if (cs.kind === 'file_exists') {
          lines.push(`    test(${JSON.stringify(cs.title)}, () => {`);
          if ((cs.target || '').includes('*')) {
            lines.push(`      const ok = anyWildcardMatch(${JSON.stringify(cs.target)});`);
            lines.push(`      expect(ok).toBe(true);`);
          } else {
            lines.push(`      const p = firstExisting(candidates(${JSON.stringify(cs.target)})) || path.resolve(${JSON.stringify(cs.target)});`);
            lines.push(`      expect(fs.existsSync(p)).toBe(true);`);
          }
          lines.push(`    });`);
        } else if (cs.kind === 'file_contains') {
          lines.push(`    test(${JSON.stringify(cs.title)}, () => {`);
          if ((cs.target || '').includes('*')) {
            lines.push(`      const matches = globMatches(${JSON.stringify(cs.target)}).map(p => path.resolve(p));`);
            lines.push(`      expect(matches.length > 0).toBe(true);`);
            lines.push(`      const ok = someFileContent(matches, (content) => {`);
            lines.push(`        if (content.includes(${JSON.stringify(cs.pattern)})) return true;`);
            lines.push(`        const alt = ${JSON.stringify(cs.pattern)}
          .replace(/\\\\/g, '')
          .replace(/\\\\\"/g, '"')
          .replace(/^\"?([A-Za-z0-9_]+)\"?\s*:\s*/, '$1: ');`);
            lines.push(`        return content.includes(alt);`);
            lines.push(`      });`);
            lines.push(`      expect(ok).toBe(true);`);
          } else {
            lines.push(`      const p = firstExisting(candidates(${JSON.stringify(cs.target)})) || path.resolve(${JSON.stringify(cs.target)});`);
            lines.push(`      const exists = fs.existsSync(p);`);
            lines.push(`      expect(exists).toBe(true);`);
            lines.push(`      if (exists) {`);
            lines.push(`        const content = fs.readFileSync(p, 'utf-8');`);
            lines.push(`        let ok = content.includes(${JSON.stringify(cs.pattern)});`);
            lines.push(`        if (!ok) {`);
            lines.push(`          const alt = ${JSON.stringify(cs.pattern)}
            .replace(/\\\\/g, '')
            .replace(/\\\\\"/g, '"')
            .replace(/^\"?([A-Za-z0-9_]+)\"?\s*:\s*/, '$1: ');`);
            lines.push(`          ok = content.includes(alt);`);
            lines.push(`        }`);
            lines.push(`        expect(ok).toBe(true);`);
            lines.push(`      }`);
          }
          lines.push(`    });`);
        } else if (cs.kind === 'outputs_contains') {
          lines.push(`    test(${JSON.stringify(cs.title)}, () => {`);
          lines.push(`      const p = path.resolve('./outputs', ${JSON.stringify(cs.target)});`);
          lines.push(`      const content = fs.readFileSync(p, 'utf-8');`);
          lines.push(`      const pat = ${JSON.stringify(cs.pattern)};`);
          lines.push(`      let ok = content.includes(pat);`);
          lines.push(`      if (!ok) {`);
          lines.push(`        const alt = pat.replace(/\\\\/g, ''); // tolerate over-escaped patterns like \\(/`);
          lines.push(`        ok = content.includes(alt);`);
          lines.push(`      }`);
          lines.push(`      expect(ok).toBe(true);`);
          lines.push(`    });`);
        } else if (cs.kind === 'regex_match') {
          lines.push(`    test(${JSON.stringify(cs.title)}, () => {`);
          if ((cs.target || '').includes('*')) {
            lines.push(`      const matches = globMatches(${JSON.stringify(cs.target)}).map(p => path.resolve(p));`);
            lines.push(`      const re = new RegExp(${JSON.stringify(cs.pattern || '')});`);
            lines.push(`      const ok = someFileContent(matches, (content) => re.test(content));`);
            lines.push(`      expect(ok).toBe(true);`);
          } else {
            lines.push(`      const p = firstExisting(candidates(${JSON.stringify(cs.target)})) || path.resolve(${JSON.stringify(cs.target)});`);
            lines.push(`      const content = fs.readFileSync(p, 'utf-8');`);
            lines.push(`      const re = new RegExp(${JSON.stringify(cs.pattern || '')});`);
            lines.push(`      expect(re.test(content)).toBe(true);`);
          }
          lines.push(`    });`);
        }
      });
      lines.push(`  });`);
    });
    lines.push('});');
    return lines.join('\n');
  }
}
