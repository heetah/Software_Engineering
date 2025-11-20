/**
 * Markup Agent Server
 * 專門處理 HTML/XML/Markdown 等 markup 語言的生成
 * Port: 3801
 */

// 載入環境變數
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const MarkupGenerator = require('./generator');

const app = express();
const PORT = process.env.PORT || 3801;

app.use(express.json({ limit: '10mb' }));

const generator = new MarkupGenerator();

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    agent: 'markup-agent',
    port: PORT,
    supportedExtensions: ['.html', '.htm', '.xml', '.md']
  });
});

// Main generation endpoint
app.post('/generate', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { skeleton, fileSpec, context } = req.body;
    
    // 驗證必要參數
    if (!fileSpec || !fileSpec.path) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: fileSpec.path'
      });
    }
    
    console.log(`[${new Date().toISOString()}] Generating ${fileSpec.path}`);
    
    // 呼叫生成器
    const result = await generator.generate({
      skeleton,
      fileSpec,
      context: context || {}
    });
    
    const elapsed = Date.now() - startTime;
    
    console.log(`[${new Date().toISOString()}] ✅ Generated ${fileSpec.path} (${elapsed}ms)`);
    
    res.status(200).json({
      success: true,
      content: result.content,
      metadata: {
        agent: 'markup-agent',
        file: fileSpec.path,
        language: fileSpec.language || 'html',
        tokens_used: result.tokensUsed || 0,
        generation_time_ms: elapsed,
        method: result.method || 'template'
      }
    });
    
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[${new Date().toISOString()}] ❌ Error:`, error.message);
    
    res.status(500).json({
      success: false,
      error: error.message,
      metadata: {
        agent: 'markup-agent',
        generation_time_ms: elapsed
      }
    });
  }
});

// 404 handler
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
  console.log(`Markup Agent Server started`);
  console.log(`Port: ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`Generate: POST http://localhost:${PORT}/generate`);
  console.log('='.repeat(80));
});
