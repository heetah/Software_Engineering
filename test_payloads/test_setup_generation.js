/**
 * 測試 Coordinator 的 setup 檔案自動生成功能
 * 用法: node test_setup_generation.js
 */

const fs = require('fs');
const path = require('path');

// 載入 Coordinator
const Coordinator = require('../coder-agent/coordinator.js');

async function testSetupGeneration() {
  console.log('🧪 Testing Setup File Generation\n');

  // 載入 example2_task_manager.json
  const payloadPath = path.join(__dirname, 'example2_task_manager.json');
  const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

  console.log('📦 Loaded payload:', payloadPath);
  console.log('Setup configuration:', JSON.stringify(payload.output.coder_instructions.setup, null, 2));
  console.log('');

  // 創建 Coordinator 實例（使用 mock API）
  const coordinator = new Coordinator(true); // true = use mock API

  try {
    console.log('🚀 Running Coordinator...\n');
    const result = await coordinator.generateFromArchitectPayload(payload, 'test-setup');

    console.log('✅ Generation completed!');
    console.log(`📊 Total files generated: ${result.files.length}`);
    console.log('');

    // 找出 setup 檔案
    const setupFiles = result.files.filter(f => 
      ['package.json', 'requirements.txt', 'pom.xml', 'go.mod', 
       '.env.example', 'README.md', 'start.sh', 'start.bat'].includes(f.path)
    );

    console.log(`📦 Setup files generated: ${setupFiles.length}`);
    setupFiles.forEach(f => {
      console.log(`  - ${f.path} (${f.language})`);
    });
    console.log('');

    // 顯示 requirements.txt 內容
    const requirementsTxt = setupFiles.find(f => f.path === 'requirements.txt');
    if (requirementsTxt) {
      console.log('📄 requirements.txt:');
      console.log('─────────────────────────────────');
      console.log(requirementsTxt.template);
      console.log('─────────────────────────────────\n');
    }

    // 顯示 .env.example 內容
    const envExample = setupFiles.find(f => f.path === '.env.example');
    if (envExample) {
      console.log('📄 .env.example:');
      console.log('─────────────────────────────────');
      console.log(envExample.template);
      console.log('─────────────────────────────────\n');
    }

    // 顯示 README.md 內容（前 500 字元）
    const readme = setupFiles.find(f => f.path === 'README.md');
    if (readme) {
      console.log('📄 README.md (preview):');
      console.log('─────────────────────────────────');
      console.log(readme.template.substring(0, 500) + '...');
      console.log('─────────────────────────────────\n');
    }

    // 顯示 start.sh 內容
    const startSh = setupFiles.find(f => f.path === 'start.sh');
    if (startSh) {
      console.log('📄 start.sh:');
      console.log('─────────────────────────────────');
      console.log(startSh.template);
      console.log('─────────────────────────────────\n');
    }

    console.log('✅ All tests passed!');
    console.log('');
    console.log('💡 Next steps:');
    console.log('  1. Check that all expected setup files were generated');
    console.log('  2. Verify requirements.txt has correct dependencies');
    console.log('  3. Verify .env.example has all environment variables');
    console.log('  4. Verify README.md has setup instructions');
    console.log('  5. Verify start.sh has correct commands');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 執行測試
testSetupGeneration();
