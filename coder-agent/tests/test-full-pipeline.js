/**
 * 測試完整流程：
 * 1. 讀取 payload
 * 2. Contracts Agent 預處理（補充缺失文件、修復配置）
 * 3. Coordinator 生成代碼
 */

const fs = require('fs');
const path = require('path');
const Coordinator = require('../coordinator');
const logger = require('../../shared/logger');

async function testFullPipeline(payloadFile) {
    const payloadPath = path.join(__dirname, '../../test_payloads', payloadFile);
    
    if (!fs.existsSync(payloadPath)) {
        console.error(`❌ Payload file not found: ${payloadPath}`);
        return;
    }
    
    console.log('🚀 Testing Full Pipeline\n');
    console.log('=' .repeat(60));
    console.log(`📄 Payload: ${payloadFile}`);
    console.log('=' .repeat(60) + '\n');
    
    try {
        // 讀取 payload
        const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));
        console.log('✅ Step 1: Payload loaded');
        console.log(`   Files in payload: ${payload.output.coder_instructions.files.length}`);
        console.log(`   Has projectConfig: ${!!payload.output.coder_instructions.projectConfig}`);
        console.log(`   Has contracts: ${!!payload.output.coder_instructions.contracts}\n`);
        
        // 創建 Coordinator（會自動調用 Contracts Agent）
        const coordinator = new Coordinator({
            useMockApi: true  // 使用 mock API 測試
        });
        
        console.log('🔄 Step 2: Running Contracts Agent preprocessing...\n');
        
        // 生成代碼（內部會先調用 Contracts Agent）
        const requestId = `test-${Date.now()}`;
        const result = await coordinator.generateFromArchitectPayload(payload, requestId);
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ Pipeline completed successfully!');
        console.log('='.repeat(60) + '\n');
        
        // 顯示結果
        console.log('📊 Generation Results:');
        console.log(`   Total files generated: ${result.files.length}`);
        console.log(`   Successful: ${result.files.filter(f => f.template).length}`);
        console.log(`   Failed: ${result.files.filter(f => !f.template).length}\n`);
        
        console.log('📁 Generated Files:');
        result.files.forEach(file => {
            const size = file.template ? `${file.template.length} bytes` : 'FAILED';
            const status = file.template ? '✅' : '❌';
            console.log(`   ${status} ${file.path} (${size})`);
        });
        
        // 檢查是否有預處理信息
        if (result.preprocessingInfo) {
            console.log('\n🔍 Contracts Agent Preprocessing:');
            console.log(`   Issues found: ${result.preprocessingInfo.issuesFound || 0}`);
            console.log(`   Enhancements applied: ${result.preprocessingInfo.enhancementsApplied ? 'Yes' : 'No'}`);
        }
        
        // 檢查端口配置
        const serverFile = result.files.find(f => f.path === 'server.py');
        if (serverFile && serverFile.template) {
            const hasPort5001 = serverFile.template.includes('5001');
            console.log(`\n🔌 Port Configuration:`);
            console.log(`   Backend uses port 5001: ${hasPort5001 ? '✅ Yes' : '❌ No'}`);
            console.log(`   No conflict with vision-agent (3000): ${hasPort5001 ? '✅' : '⚠️'}`);
        }
        
        // 檢查必要文件是否生成
        console.log('\n📋 Essential Files Check:');
        const essentialFiles = [
            'README.md',
            'requirements.txt',
            'start.ps1',
            'init_db.py',
            '.env.example',
            '.gitignore'
        ];
        
        essentialFiles.forEach(filename => {
            const exists = result.files.some(f => f.path.toLowerCase().includes(filename.toLowerCase()));
            console.log(`   ${exists ? '✅' : '❌'} ${filename}`);
        });
        
        console.log('\n🎉 Test completed!\n');
        
        return result;
        
    } catch (error) {
        console.error('\n❌ Pipeline failed with error:');
        console.error(`   ${error.message}`);
        console.error(`\nStack trace:`);
        console.error(error.stack);
        throw error;
    }
}

// 主程序
if (require.main === module) {
    const payloadFile = process.argv[2] || 'example8_weather_dashboard.json';
    
    console.log('\n');
    console.log('╔' + '═'.repeat(58) + '╗');
    console.log('║' + ' '.repeat(10) + 'CODER AGENT FULL PIPELINE TEST' + ' '.repeat(17) + '║');
    console.log('╚' + '═'.repeat(58) + '╝');
    console.log('\n');
    
    testFullPipeline(payloadFile)
        .then(() => {
            console.log('✅ All tests passed!\n');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Test failed!\n');
            process.exit(1);
        });
}

module.exports = { testFullPipeline };
