// Simple controller for /api/vision/analyze
const fs = require('fs');
const path = require('path');
const logger = require('../../shared/logger.cjs');

exports.analyze = async (req, res) => {
  const body = req.body || {};

  // forwarding config (can be overridden via env)
  const CODER_AGENT_URL = 'http://localhost:3800/api/coder/submit';

  // --- validator & sanitizer helpers ---
  const ALLOWED_EXT = [
    // Web frontend
    '.html', '.htm', '.css', '.scss', '.sass', '.less',
    // JavaScript
    '.js', '.mjs', '.cjs', '.jsx',
    // TypeScript
    '.ts', '.tsx',
    // Frontend frameworks
    '.vue', '.svelte',
    // Python (backend)
    '.py',
    // Data formats
    '.json', '.xml', '.yaml', '.yml',
    // Documentation
    '.md', '.txt',
    // Config files
    '.env', '.gitignore', '.npmrc', '.editorconfig'
  ];
  const MAX_FILE_BYTES = 500 * 1024; // 500 KB
  const MAX_FILES = 50; // 50 files


  function isSafePath(p) {
    if (typeof p !== 'string') return false;
    if (p.includes('..')) return false;
    if (/^[\\\/]/.test(p)) return false; // absolute
    if (p.includes(':')) return false; // windows drive
    const m = p.match(/(\.[^./\\]+)$/);
    const ext = m ? m[1].toLowerCase() : '';
    if (!ALLOWED_EXT.includes(ext)) return false;
    return /^[A-Za-z0-9._\-\/]+$/.test(p);
  }

  function stripCodeFences(s) {
    if (!s || typeof s !== 'string') return s;
    // remove ```lang ... ``` blocks but keep inner
    s = s.replace(/```[\s\S]*?```/g, (m) => {
      return m.replace(/^```[^\n]*\n?/, '').replace(/```$/, '');
    });
    // remove leading lines like "File: index.html"
    s = s.replace(/^File:\s*.*\n+/im, '');
    return s.trim();
  }

  function validateCoderInstructions(ci) {
    const errors = [];
    if (!ci || typeof ci !== 'object') {
      errors.push('missing coder_instructions');
      return { ok: false, errors };
    }
    const files = ci.files;
    if (!Array.isArray(files) || files.length === 0) {
      errors.push('files must be a non-empty array');
      return { ok: false, errors };
    }
    if (files.length > MAX_FILES) {
      errors.push(`too many files (max ${MAX_FILES})`);
    }
    for (const f of files) {
      if (!f || typeof f !== 'object') {
        errors.push('file must be object');
        continue;
      }
      if (!f.path || typeof f.path !== 'string') {
        errors.push('file missing path');
        continue;
      }
      if (!isSafePath(f.path)) {
        errors.push(`invalid file path: ${f.path}`);
        continue;
      }
      // content/template 現在是可選的（Cloud API 模式只需要 description + requirements）
      const content = f.template || f.content;
      if (content && typeof content === 'string') {
        const sanitized = stripCodeFences(content);
        if (Buffer.byteLength(sanitized, 'utf8') > MAX_FILE_BYTES) {
          errors.push(`file too large: ${f.path}`);
          continue;
        }
        // replace with sanitized content
        f.template = sanitized;
        delete f.content;
      } else {
        // 沒有 content/template，清除這些欄位
        delete f.template;
        delete f.content;
      }
    }
    return { ok: errors.length === 0, errors, value: ci };
  }

  // Helper: write status.json and status.html under outputs/coder-<timestamp>/
  function writeStatusFiles(id, status) {
    try {
      const genBase = path.join(__dirname, '..', 'outputs', String(id));
      fs.mkdirSync(genBase, { recursive: true });
      fs.writeFileSync(path.join(genBase, 'status.json'), JSON.stringify(status, null, 2), 'utf8');
      let html = '<!doctype html><html><head><meta charset="utf-8"><title>Status ' + id + '</title></head><body>';
      if (status.ok) {
        html += '<h1>Generated Files</h1>';
        if (Array.isArray(status.files) && status.files.length) {
          html += '<ul>' + status.files.map(f => `<li><a href="${f.url}">${f.path}</a></li>`).join('') + '</ul>';
        } else if (status.text) {
          html += `<pre>${status.text}</pre>`;
        }
      } else {
        html += '<h1>Validation Failed</h1>';
        html += '<pre>' + JSON.stringify(status.errors || status, null, 2) + '</pre>';
      }
      html += '</body></html>';
      fs.writeFileSync(path.join(genBase, 'status.html'), html, 'utf8');
    } catch (err) {
      console.error('writeStatusFiles error', err);
    }
  }

  // helper: simple POST using built-in modules so we don't add deps
  function httpPostJson(urlStr, obj, timeoutMs = 600000) { // 10 minutes for complex multi-agent generation
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        const u = new URL(urlStr);
        const data = JSON.stringify(obj);
        const lib = u.protocol === 'https:' ? require('https') : require('http');
        const opts = {
          method: 'POST',
          hostname: u.hostname,
          port: u.port || (u.protocol === 'https:' ? 443 : 80),
          path: u.pathname + (u.search || ''),
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': Buffer.byteLength(data)
          }
        };

        const req = lib.request(opts, (resp) => {
          const chunks = [];
          resp.on('data', c => chunks.push(c));
          resp.on('end', () => {
            clearTimeout(timeoutId);
            const body = Buffer.concat(chunks).toString('utf8');
            try {
              resolve({ statusCode: resp.statusCode, body: JSON.parse(body) });
            } catch (e) {
              resolve({ statusCode: resp.statusCode, body: body });
            }
          });
        });

        req.on('error', (err) => {
          clearTimeout(timeoutId);
          reject(err);
        });

        req.write(data);
        req.end();
      } catch (e) {
        clearTimeout(timeoutId);
        reject(e);
      }
    });
  }

  // MAIN LOGIC: Only handle coder_instructions (no more OCR)
  // Check if the request contains coder instructions from architect agent
  const ci = (body.output && body.output.coder_instructions) || body.coder_instructions;
  if (!ci) {
    logger.warn('No coder_instructions found in request', req.requestId);
    return res.status(400).json({
      error: 'missing_coder_instructions',
      message: 'This service now only processes architect payloads with coder_instructions. OCR functionality has been removed.',
      expected_format: {
        output: {
          coder_instructions: {
            task: 'description',
            files: [
              {
                path: 'index.html',
                language: 'html',
                template: '<html>...</html>'
              }
            ]
          }
        }
      }
    });
  }

  // Validate coder instructions
  const validation = validateCoderInstructions(ci);
  if (!validation.ok) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const id = `coder-${timestamp}`;
    const status = { ok: false, errors: validation.errors };
    writeStatusFiles(id, status);
    logger.warn('Coder instructions validation failed', req.requestId, { errors: validation.errors });
    return res.status(400).json({
      error: 'validation_failed',
      details: validation.errors,
      status_url: `/outputs/${id}/status.html`
    });
  }

  // Forward to coder-agent for file generation
  try {
    logger.info('Forwarding coder_instructions to coder-agent', req.requestId);
    const resp = await httpPostJson(CODER_AGENT_URL.replace('/analyze', '/submit'), body);

    if (resp.statusCode === 201 || resp.statusCode === 200) {
      logger.info('Coder-agent accepted payload', req.requestId, { statusCode: resp.statusCode });
      return res.status(resp.statusCode).json(resp.body);
    } else {
      logger.warn('Coder-agent returned non-success', req.requestId, { statusCode: resp.statusCode });
      return res.status(resp.statusCode || 500).json(resp.body || { error: 'coder-agent failed' });
    }
  } catch (err) {
    logger.error('Failed to forward to coder-agent', req.requestId, { error: err.message });
    return res.status(503).json({ error: 'coder-agent unavailable', details: err.message });
  }
};
