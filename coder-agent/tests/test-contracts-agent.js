/**
 * 測試 Contracts Agent - 檢測 Example 7 payload 的問題
 */

const fs = require('fs');
const path = require('path');
const ContractsAgent = require('../contracts-agent');

async function testExample7() {
    console.log('🧪 Testing Contracts Agent with Example 7\n');
    
    // 讀取 example7 payload
    const payloadPath = path.join(__dirname, '../../test_payloads/example7_fullstack_todo.json');
    const originalPayload = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));
    
    console.log('📄 Original Payload Loaded');
    console.log('   Files count:', originalPayload.output.coder_instructions.files.length);
    
    // 創建 Contracts Agent
    const agent = new ContractsAgent();
    
    // 處理 payload
    console.log('\n🔄 Processing payload...\n');
    const enhancedPayload = await agent.processPayload(originalPayload);
    
    // 顯示結果
    console.log('\n📊 Results:');
    console.log('   Original files:', originalPayload.output.coder_instructions.files.length);
    console.log('   Enhanced files:', enhancedPayload.output.coder_instructions.files.length);
    console.log('   Files added:', enhancedPayload.output.coder_instructions.files.length - originalPayload.output.coder_instructions.files.length);
    
    // 顯示新增的文件
    console.log('\n📁 New Files Added:');
    const originalFiles = originalPayload.output.coder_instructions.files.map(f => f.path);
    const newFiles = enhancedPayload.output.coder_instructions.files.filter(
        f => !originalFiles.includes(f.path)
    );
    
    newFiles.forEach(file => {
        console.log(`   ✅ ${file.path} - ${file.type}`);
        console.log(`      ${file.description.substring(0, 80)}...`);
    });
    
    // 檢查必要文件是否都添加了
    console.log('\n✔️  Essential Files Check:');
    const fileNames = enhancedPayload.output.coder_instructions.files.map(f => f.path.toLowerCase());
    
    const checks = [
        { name: 'README.md', pattern: 'readme' },
        { name: 'requirements.txt', pattern: 'requirements.txt' },
        { name: 'start script', pattern: 'start' },
        { name: 'init_db.py', pattern: 'init_db' },
        { name: '.env.example', pattern: '.env' },
        { name: '.gitignore', pattern: '.gitignore' }
    ];
    
    checks.forEach(check => {
        const exists = fileNames.some(f => f.includes(check.pattern));
        console.log(`   ${exists ? '✅' : '❌'} ${check.name}`);
    });
    
    // 保存增強後的 payload
    const outputPath = payloadPath.replace('.json', '.enhanced.json');
    fs.writeFileSync(outputPath, JSON.stringify(enhancedPayload, null, 2));
    console.log(`\n💾 Enhanced payload saved to: ${outputPath}`);
    
    // 顯示預處理信息
    if (enhancedPayload._preprocessed) {
        console.log('\n📋 Preprocessing Info:');
        console.log(`   Version: ${enhancedPayload._preprocessed.version}`);
        console.log(`   Issues Found: ${enhancedPayload._preprocessed.issuesFound}`);
        console.log(`   Timestamp: ${enhancedPayload._preprocessed.timestamp}`);
    }
    
    return enhancedPayload;
}

// 運行測試
if (require.main === module) {
    testExample7().catch(console.error);
}

module.exports = { testExample7 };
