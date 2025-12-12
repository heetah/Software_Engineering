require('dotenv').config({ path: require('path').join(__dirname, '..', 'worker-agents', '.env') });

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const processor = require('./processor');
const Coordinator = require('./coordinator.cjs');
const logger = require('../shared/logger.cjs');
const { errorHandlerMiddleware, requestIdMiddleware, createSuccessResponse } = require('../shared/errors.cjs');

const app = express();
app.use(requestIdMiddleware);
app.use(bodyParser.json({
  limit: '10mb', type: 'application/json', verify: (req, res, buf, encoding) => {
    // Ensure UTF-8 encoding
    if (buf && buf.length) {
      req.rawBody = buf.toString('utf8');
    }
  }
}));

// Serve static files from outputs directory
app.use('/outputs', express.static(path.join(__dirname, 'outputs')));

// Accept architect-style payloads (coder_instructions) and persist as coder output
app.post('/api/coder/submit', async (req, res) => {
  const requestId = req.requestId;
  try {
    logger.info('Received coder submit request', requestId);
    const payload = req.body || {};

    // Basic validation: expect output.coder_instructions.files array
    const instr = payload.output && payload.output.coder_instructions;
    if (!instr || !Array.isArray(instr.files)) {
      logger.warn('Invalid submit payload', requestId, { hasInstr: !!instr, hasFiles: !!(instr && instr.files) });
      return res.status(400).json({ ok: false, error: 'Missing output.coder_instructions.files', requestId });
    }

    // 使用 Coordinator 生成檔案
    const coordinator = new Coordinator({
      useMockApi: false // 使用 Worker Agents 生成細節
    });

    const result = await coordinator.generateFromArchitectPayload(payload, requestId);

    // 持久化結果
    const coderDir = processor.persistResult(result, payload.id || null);

    logger.info('Coder submit completed', requestId, {
      coderDir,
      filesGenerated: result.files.length,
      successful: result.metadata?.successful_files,
      failed: result.metadata?.failed_files
    });

    res.status(201).json(createSuccessResponse({
      coder_dir: coderDir,
      files_generated: result.files.length,
      successful: result.metadata?.successful_files || 0,
      failed: result.metadata?.failed_files || 0,
      status_url: `/outputs/${path.basename(coderDir)}/status.html`
    }, requestId));

  } catch (e) {
    logger.error('Coder submit failed', requestId, { error: e.message, stack: e.stack });
    res.status(500).json({ ok: false, error: String(e), requestId });
  }
});

// Error handler
app.use(errorHandlerMiddleware);

const port = 3800;
app.listen(port, () => {
  logger.info(`Coder-agent server listening on http://localhost:${port}`);
});
