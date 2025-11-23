const ContractsAgent = require('../contracts-agent');
const fs = require('fs');
const path = require('path');

const payloadPath = path.join(__dirname, '../../test_payloads/example8_weather_dashboard.json');
const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));

console.log('📦 Original files:', payload.output.coder_instructions.files.length);

const agent = new ContractsAgent();
agent.processPayload(payload).then(enhanced => {
    console.log('\n✨ Enhanced files:', enhanced.output.coder_instructions.files.length);
    console.log('\n📁 Added files:');
    const originalPaths = payload.output.coder_instructions.files.map(f => f.path);
    const addedFiles = enhanced.output.coder_instructions.files.filter(f => !originalPaths.includes(f.path));
    addedFiles.forEach(f => {
        console.log(`   - ${f.path} (${f.type})`);
        console.log(`     Description: ${f.description.substring(0, 80)}...`);
    });
    
    // 檢查 README.md 的描述
    const readme = enhanced.output.coder_instructions.files.find(f => f.path === 'README.md');
    if (readme) {
        console.log('\n📄 README.md description:');
        console.log(readme.description);
    }
}).catch(err => {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
});
