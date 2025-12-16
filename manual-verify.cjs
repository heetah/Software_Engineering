/**
 * 手動驗證契約一致性
 * 檢查 main.js, preload.js 和 architecture.json 的 IPC 頻道是否一致
 */

const fs = require('fs');
const path = require('path');

const sessionId = '4cc2d18a-0d75-4d7f-80a1-38bc414cc282';
const outputDir = path.join(__dirname, 'output', sessionId);
const sessionsDir = path.join(__dirname, 'data', 'sessions', sessionId);

console.log('\nManual verification of contract consistency\n');
console.log('═'.repeat(70));

// 讀取 architecture.json
const archPath = path.join(sessionsDir, 'architecture.json');
const archData = JSON.parse(fs.readFileSync(archPath, 'utf-8'));
const expectedChannels = archData.output.coder_instructions.contracts.api || [];

console.log('\n📋 Expected IPC channels (from architecture.json):');
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

console.log('\n📡 main.js actual implementation of IPC handlers:');
mainChannels.forEach(ch => console.log(`   ✓ ${ch}`));

// 讀取 preload.js
const preloadPath = path.join(outputDir, 'preload.js');
const preloadContent = fs.readFileSync(preloadPath, 'utf-8');
const preloadChannels = [];
const preloadRegex = /ipcRenderer\.invoke\(['"]([^'"]+)['"]/g;
while ((match = preloadRegex.exec(preloadContent)) !== null) {
  preloadChannels.push(match[1]);
}

console.log('\n🌉 preload.js actual calls to IPC channels:');
preloadChannels.forEach(ch => console.log(`   ✓ ${ch}`));

// 驗證一致性
console.log('\n═'.repeat(70));
console.log('\n✅ Verification results:\n');

let allMatch = true;

for (const expected of expectedChannels) {
  const channel = expected.endpoint;
  const hasMain = mainChannels.includes(channel);
  const hasPreload = preloadChannels.includes(channel);

  if (hasMain && hasPreload) {
    console.log(`   ✅ ${channel} - Consistent`);
  } else if (!hasMain) {
    console.log(`   ❌ ${channel} - Missing main.js implementation`);
    allMatch = false;
  } else if (!hasPreload) {
    console.log(`   ❌ ${channel} - Missing preload.js call`);
    allMatch = false;
  }
}

console.log('\n═'.repeat(70));

if (allMatch) {
  console.log('\n🎉 All IPC channels are consistent! Repair successful!\n');
  console.log('   main.js ←→ preload.js ←→ architecture.json Consistent\n');
  console.log('💡 Now you can restart the app, and the note feature should work.\n');
} else {
  console.log('\n⚠️  There are still inconsistent places, further repair is needed.\n');
}

console.log('═'.repeat(70));
