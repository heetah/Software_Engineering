/**
 * 手動驗證契約一致性
 * 檢查 main.js, preload.js 和 architecture.json 的 IPC 頻道是否一致
 */

const fs = require('fs');
const path = require('path');

const sessionId = '4cc2d18a-0d75-4d7f-80a1-38bc414cc282';
const outputDir = path.join(__dirname, 'output', sessionId);
const sessionsDir = path.join(__dirname, 'data', 'sessions', sessionId);

console.log('🔍 手動驗證契約一致性\n');
console.log('═'.repeat(70));

// 讀取 architecture.json
const archPath = path.join(sessionsDir, 'architecture.json');
const archData = JSON.parse(fs.readFileSync(archPath, 'utf-8'));
const expectedChannels = archData.output.coder_instructions.contracts.api || [];

console.log('\n📋 期望的 IPC 頻道 (從 architecture.json):');
expectedChannels.forEach(api => {
  console.log(`   • ${api.endpoint}`);
  console.log(`     Producer: ${api.producers.join(', ')}`);
  console.log(`     Consumer: ${api.consumers.join(', ')}`);
});

// 讀取 main.js
const mainPath = path.join(outputDir, 'main.js');
const mainContent = fs.readFileSync(mainPath, 'utf-8');
const mainChannels = [];
const mainRegex = /ipcMain\.handle\(['"]([^'"]+)['"]/g;
let match;
while ((match = mainRegex.exec(mainContent)) !== null) {
  mainChannels.push(match[1]);
}

console.log('\n📡 main.js 實際實現的 IPC handlers:');
mainChannels.forEach(ch => console.log(`   ✓ ${ch}`));

// 讀取 preload.js
const preloadPath = path.join(outputDir, 'preload.js');
const preloadContent = fs.readFileSync(preloadPath, 'utf-8');
const preloadChannels = [];
const preloadRegex = /ipcRenderer\.invoke\(['"]([^'"]+)['"]/g;
while ((match = preloadRegex.exec(preloadContent)) !== null) {
  preloadChannels.push(match[1]);
}

console.log('\n🌉 preload.js 實際呼叫的 IPC channels:');
preloadChannels.forEach(ch => console.log(`   ✓ ${ch}`));

// 驗證一致性
console.log('\n═'.repeat(70));
console.log('\n✅ 驗證結果:\n');

let allMatch = true;

for (const expected of expectedChannels) {
  const channel = expected.endpoint;
  const hasMain = mainChannels.includes(channel);
  const hasPreload = preloadChannels.includes(channel);
  
  if (hasMain && hasPreload) {
    console.log(`   ✅ ${channel} - 完全一致`);
  } else if (!hasMain) {
    console.log(`   ❌ ${channel} - 缺少 main.js 實現`);
    allMatch = false;
  } else if (!hasPreload) {
    console.log(`   ❌ ${channel} - 缺少 preload.js 呼叫`);
    allMatch = false;
  }
}

console.log('\n═'.repeat(70));

if (allMatch) {
  console.log('\n🎉 所有 IPC 頻道完全一致！修復成功！\n');
  console.log('   main.js ←→ preload.js ←→ architecture.json 三者完全對齊\n');
  console.log('💡 現在可以重新啟動應用，加入任務功能應該正常工作了。\n');
} else {
  console.log('\n⚠️  仍有不一致的地方，需要進一步修復。\n');
}

console.log('═'.repeat(70));
