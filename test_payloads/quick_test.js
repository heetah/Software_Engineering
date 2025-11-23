/**
 * 快速測試 - 直接發送 payload 到 Coder Agent
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const payloadFile = process.argv[2] || 'test_simple_hello.json';
const payloadPath = path.join(__dirname, payloadFile);

console.log('=== 快速測試 Payload ===\n');
console.log('載入:', payloadPath);

// 讀取 payload
let payload;
try {
  payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
  console.log('✓ Payload 載入成功');
  console.log(`  文件數: ${payload.output.coder_instructions.files.length}`);
  console.log(`  項目: ${payload.output.coder_instructions.summary}\n`);
} catch (error) {
  console.error('❌ 載入失敗:', error.message);
  process.exit(1);
}

// 發送到 Coder Agent
const data = JSON.stringify(payload);
const options = {
  hostname: 'localhost',
  port: 3800,
  path: '/generate',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  },
  timeout: 600000 // 10 分鐘
};

console.log('發送到: http://localhost:3800/generate');
console.log('請等待... (這可能需要幾分鐘)\n');

const startTime = Date.now();

const req = http.request(options, (res) => {
  const chunks = [];
  
  res.on('data', (chunk) => {
    chunks.push(chunk);
  });
  
  res.on('end', () => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const body = Buffer.concat(chunks).toString('utf8');
    
    console.log(`\n完成！耗時: ${elapsed}s`);
    console.log(`HTTP Status: ${res.statusCode}\n`);
    
    if (res.statusCode === 200 || res.statusCode === 201) {
      try {
        const result = JSON.parse(body);
        
        console.log('=== 生成結果 ===');
        if (result.outputDir) {
          console.log(`\n✓ 輸出目錄: ${result.outputDir}\n`);
        }
        
        if (result.files && Array.isArray(result.files)) {
          console.log(`生成的文件 (${result.files.length}):`);
          result.files.forEach(f => {
            const status = f.error ? '❌' : '✓';
            console.log(`  ${status} ${f.path}`);
            if (f.error) {
              console.log(`     錯誤: ${f.error.substring(0, 100)}...`);
            }
          });
        }
        
        if (result.summary) {
          console.log('\n統計:');
          console.log(`  成功: ${result.summary.successful || 0}`);
          console.log(`  失敗: ${result.summary.failed || 0}`);
          console.log(`  總計: ${result.summary.total || 0}`);
        }
        
        console.log('\n✓ 測試完成！');
        
      } catch (e) {
        console.log('響應內容:\n', body);
      }
    } else {
      console.error('❌ 生成失敗');
      console.error('響應內容:\n', body);
    }
  });
});

req.on('error', (error) => {
  console.error('\n❌ 請求失敗:', error.message);
  console.error('\n請確認:');
  console.error('  1. Coder Agent 是否在運行? (port 3800)');
  console.error('     啟動: cd coder-agent && node server.js');
  console.error('  2. Worker Agents 是否在運行? (ports 3801-3805)');
  console.error('     啟動: cd worker-agents && .\\start-all-agents.ps1');
});

req.on('timeout', () => {
  console.error('\n❌ 請求超時 (10分鐘)');
  req.destroy();
});

req.write(data);
req.end();
