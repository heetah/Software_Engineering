/**
 * System Agent Server
 * 專�??��?系統級�?言�?��?��???(C/C++/Go/Rust/Java/C#)
 * Port: 3805
 */

// ���J�����ܼ�
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });


const express = require('express');
const SystemGenerator = require('./generator');

const app = express();
const PORT = process.env.PORT || 3805;

app.use(express.json({ limit: '10mb' }));

const generator = new SystemGenerator();

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    agent: 'system-agent',
    port: PORT,
    supportedExtensions: ['.c', '.h', '.cpp', '.cc', '.cxx', '.hpp', '.go', '.rs', '.java', '.cs']
  });
});

// Main generation endpoint
app.post('/generate', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { skeleton, fileSpec, context } = req.body;
    
    if (!fileSpec || !fileSpec.path) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: fileSpec.path'
      });
    }
    
    console.log(`[${new Date().toISOString()}] Generating ${fileSpec.path}`);
    
    const result = await generator.generate({
      skeleton,
      fileSpec,
      context: context || {}
    });
    
    const elapsed = Date.now() - startTime;
    
    console.log(`[${new Date().toISOString()}] ??Generated ${fileSpec.path} (${elapsed}ms)`);
    
    res.status(200).json({
      success: true,
      content: result.content,
      metadata: {
        agent: 'system-agent',
        file: fileSpec.path,
        language: fileSpec.language || 'unknown',
        tokens_used: result.tokensUsed || 0,
        generation_time_ms: elapsed,
        method: result.method || 'template'
      }
    });
    
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[${new Date().toISOString()}] ??Error:`, error.message);
    
    res.status(500).json({
      success: false,
      error: error.message,
      metadata: {
        agent: 'system-agent',
        generation_time_ms: elapsed
      }
    });
  }
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /health',
      'POST /generate'
    ]
  });
});

app.listen(PORT, () => {
  console.log('='.repeat(80));
  console.log(`System Agent Server started`);
  console.log(`Port: ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`Generate: POST http://localhost:${PORT}/generate`);
  console.log('='.repeat(80));
});

