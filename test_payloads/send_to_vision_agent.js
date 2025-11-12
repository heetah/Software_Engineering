/**
 * 通用測試腳本：將任意 payload 傳給 vision-agent
 * 用法: 
 *   node send_to_vision_agent.js <payload_file.json>
 *   node send_to_vision_agent.js example1_static_website.json
 *   node send_to_vision_agent.js example2_task_manager.json
 */

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// 配置
const VISION_AGENT_URL = process.env.VISION_AGENT_URL || 'http://localhost:3000';
const VISION_API_ENDPOINT = `${VISION_AGENT_URL}/api/vision/analyze`;

// 顏色輸出（可選）
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

async function sendPayloadToVisionAgent(payloadPath) {
  try {
    // 1. 讀取 payload 檔案
    log(`\n📦 Loading payload: ${payloadPath}`, 'cyan');
    
    if (!fs.existsSync(payloadPath)) {
      log(`❌ Error: File not found: ${payloadPath}`, 'red');
      process.exit(1);
    }

    const payloadContent = fs.readFileSync(payloadPath, 'utf-8');
    let payload;
    
    try {
      payload = JSON.parse(payloadContent);
    } catch (e) {
      log(`❌ Error: Invalid JSON in ${payloadPath}`, 'red');
      log(`   ${e.message}`, 'red');
      process.exit(1);
    }

    log(`✅ Payload loaded successfully`, 'green');
    log(`   Files: ${payload.output?.coder_instructions?.files?.length || 0}`, 'blue');
    log(`   Has contracts: ${!!payload.output?.coder_instructions?.contracts}`, 'blue');
    log(`   Has setup: ${!!payload.output?.coder_instructions?.setup}`, 'blue');

    // 2. 發送到 vision-agent
    log(`\n🚀 Sending to Vision Agent: ${VISION_API_ENDPOINT}`, 'cyan');
    
    const startTime = Date.now();
    
    const response = await fetch(VISION_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: payloadContent,
      timeout: 300000, // 5 分鐘超時
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    // 3. 顯示結果
    log(`\n✅ Vision Agent response received (${elapsed}s)`, 'green');
    log(`   Status: ${response.status}`, 'blue');
    
    if (result.request_id) {
      log(`   Request ID: ${result.request_id}`, 'blue');
    }

    if (result.files) {
      log(`   Files generated: ${result.files.length}`, 'green');
      
      // 顯示生成的檔案清單
      log(`\n📄 Generated files:`, 'cyan');
      result.files.forEach((file, idx) => {
        const fileType = file.language || 'unknown';
        log(`   ${idx + 1}. ${file.path} (${fileType})`, 'blue');
      });
    }

    if (result.metadata) {
      log(`\n📊 Metadata:`, 'cyan');
      Object.entries(result.metadata).forEach(([key, value]) => {
        log(`   ${key}: ${JSON.stringify(value)}`, 'blue');
      });
    }

    if (result.notes && Array.isArray(result.notes)) {
      log(`\n📝 Notes:`, 'cyan');
      result.notes.forEach(note => {
        log(`   - ${note}`, 'yellow');
      });
    }

    // 4. 儲存回應（可選）
    const outputDir = path.join(__dirname, '../responses');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = path.basename(payloadPath, '.json');
    const outputPath = path.join(outputDir, `${baseName}-response-${timestamp}.json`);
    
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    log(`\n💾 Response saved to: ${outputPath}`, 'green');

    // 5. 提供下一步建議
    log(`\n💡 Next steps:`, 'bright');
    log(`   1. View generated files in Vision Agent dashboard: ${VISION_AGENT_URL}/dashboard`, 'yellow');
    log(`   2. Check response details: cat ${outputPath}`, 'yellow');
    if (result.request_id) {
      log(`   3. View status page: ${VISION_AGENT_URL}/outputs/${result.request_id}/status.html`, 'yellow');
    }

    return result;

  } catch (error) {
    log(`\n❌ Error occurred:`, 'red');
    
    if (error.code === 'ECONNREFUSED') {
      log(`   Cannot connect to Vision Agent at ${VISION_AGENT_URL}`, 'red');
      log(`   Make sure Vision Agent is running: cd vision-agent && node server.js`, 'yellow');
    } else if (error.message && error.message.includes('HTTP')) {
      // HTTP error from fetch
      log(`   ${error.message}`, 'red');
    } else {
      log(`   ${error.message}`, 'red');
      if (error.stack) {
        log(`\n${error.stack}`, 'red');
      }
    }
    
    process.exit(1);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    log('Usage: node send_to_vision_agent.js <payload_file.json>', 'yellow');
    log('\nExamples:', 'cyan');
    log('  node send_to_vision_agent.js example1_static_website.json', 'blue');
    log('  node send_to_vision_agent.js example2_task_manager.json', 'blue');
    log('  node send_to_vision_agent.js example3_chat_app.json', 'blue');
    log('  node send_to_vision_agent.js valid_payload.json', 'blue');
    log('\nAvailable payloads in current directory:', 'cyan');
    
    // 列出當前目錄的所有 JSON 檔案
    const jsonFiles = fs.readdirSync(__dirname)
      .filter(f => f.endsWith('.json') && f !== 'package.json');
    
    jsonFiles.forEach(file => {
      log(`  - ${file}`, 'blue');
    });
    
    process.exit(0);
  }

  const payloadFile = args[0];
  const payloadPath = path.isAbsolute(payloadFile) 
    ? payloadFile 
    : path.join(__dirname, payloadFile);

  await sendPayloadToVisionAgent(payloadPath);
}

main().catch(err => {
  log(`\n❌ Unexpected error: ${err.message}`, 'red');
  console.error(err);
  process.exit(1);
});
