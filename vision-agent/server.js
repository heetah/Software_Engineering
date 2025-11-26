const express = require('express');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const visionController = require('./controllers/visionController');
const logger = require('../shared/logger');
const { errorHandlerMiddleware, requestIdMiddleware } = require('../shared/errors');

logger.info('Vision Agent starting...', null, {
  PORT: process.env.PORT || 3000
});

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(requestIdMiddleware);
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));

// Serve coder-agent outputs for viewing generated files
app.use('/outputs', express.static(path.join(__dirname, '..', 'coder-agent', 'outputs')));

// Root path redirects to dashboard
app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

// Simple outputs dashboard: list coder output folders
app.get('/dashboard', (req, res) => {
  try {
    const coderOut = path.join(__dirname, '..', 'coder-agent', 'outputs');
    if (!fs.existsSync(coderOut)) return res.send('<h1>No outputs yet</h1>');

    let html = '<!doctype html><html><head><meta charset="utf-8"><title>Generated Files</title></head><body>';
    html += '<h1>Generated Files Dashboard</h1>';
    html += '<h2>Coder Output (coder-...)</h2><ul>';
    
    const items = fs.readdirSync(coderOut).filter(n => fs.lstatSync(path.join(coderOut, n)).isDirectory());
    items.sort((a,b) => a < b ? 1 : -1);
    
    for (const it of items) {
      const statusPath = `/outputs/${encodeURIComponent(it)}/status.html`;
      html += `<li><a href="${statusPath}">${it}</a> - <a href="/outputs/${encodeURIComponent(it)}/">files</a></li>`;
    }
    
    html += '</ul></body></html>';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    console.error('dashboard error', e && (e.stack || e));
    res.status(500).send('failed to list outputs');
  }
});

app.post('/api/vision/analyze', visionController.analyze);

app.use((req, res) => {
  logger.warn('Route not found', req.requestId, { path: req.path, method: req.method });
  res.status(404).json({ error: 'Not Found' });
});

// Use standardized error handler
app.use(errorHandlerMiddleware);

// Global error handlers
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', null, { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', null, { reason: String(reason) });
});

app.listen(PORT, () => {
  logger.info(`Vision server listening on http://localhost:${PORT}`);
});
